"use strict";
// Datei-Upload per Link (uploads.js): Link anlegen, Datei in Stücken hochladen (inkl. falschem Offset = Fortsetzen), Download, ZIP, Schutz, Löschen
const http = require("http"), fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-up-"));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FEHLER:", m); } };
const send = (res, code, body, type, h) => { res.writeHead(code, Object.assign({ "Content-Type": type || "text/plain" }, h || {})); res.end(body); };
let authed = true;
const UP = require("../uploads.js")({ DATA_DIR: dir, ORIGIN: "https://example.test", send, sendGz: (q, r, c, b, t, h) => send(r, c, b, t, h), adminAuthed: () => authed, push: () => Promise.resolve(0) });
const srv = http.createServer((req, res) => { const u = new URL(req.url, "http://x"), p = u.pathname; (p.indexOf("/upload/") === 0 ? UP.handlePublic(req, res, u, p) : UP.handleAdmin(req, res, u, p)).catch(e => { res.writeHead(500); res.end(e.message); }); });
srv.listen(0, "127.0.0.1", async () => {
  const base = "http://127.0.0.1:" + srv.address().port;
  const J = (p, o) => fetch(base + p, o).then(r => r.json().then(j => Object.assign(j, { status: r.status })));
  const H = { "X-Upload": "1", "Content-Type": "application/json" };
  try {
    // Link anlegen (Cockpit)
    const c = await J("/admin/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "create", title: "Testprojekt", note: "Bitte Logos" }) });
    ok(c.ok && c.link && /^[A-Za-z0-9_-]{32}$/.test(c.link.token), "Link anlegen");
    const T = c.link.token, B = "/upload/" + T;
    const pg = await fetch(base + B).then(r => r.text()); ok(/Dateien hochladen/.test(pg) && /Testprojekt/.test(pg) && /Bitte Logos/.test(pg), "Seite zeigt Titel und Notiz");
    ok((await fetch(base + "/upload/" + "x".repeat(32))).status === 404, "falscher Token → 404");
    // ohne X-Upload-Kopfzeile abgewiesen (CSRF)
    ok((await J(B + "/init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "a.bin", size: 10 }) })).status === 403, "ohne X-Upload → 403");
    // Datei 3 Stücke
    const data = crypto.randomBytes(2500000), name = "../../evil/Logo Mappe.pdf";
    const i1 = await J(B + "/init", { method: "POST", headers: H, body: JSON.stringify({ name, size: data.length }) });
    ok(i1.ok && i1.got === 0 && !/[\\/]/.test(i1.id), "init");
    const put = (o, buf) => J(B + "/chunk?f=" + i1.id + "&o=" + o, { method: "PUT", headers: { "X-Upload": "1", "Content-Type": "application/octet-stream" }, body: buf });
    let r = await put(0, data.subarray(0, 1000000)); ok(r.ok && r.got === 1000000, "Stück 1");
    r = await put(0, data.subarray(0, 1000000)); ok(r.ok && r.got === 1000000, "falscher Offset → aktueller Stand, nichts doppelt");
    // Fortsetzen nach Abbruch: init mit gleichem Namen/Größe liefert Stand
    const i2 = await J(B + "/init", { method: "POST", headers: H, body: JSON.stringify({ name, size: data.length }) }); ok(i2.id === i1.id && i2.got === 1000000, "Fortsetzen");
    r = await put(1000000, data.subarray(1000000, 2000000)); ok(r.got === 2000000 && !r.done, "Stück 2");
    r = await put(2000000, data.subarray(2000000)); ok(r.ok && r.done && r.got === data.length, "Stück 3 → fertig");
    r = await put(2500000, Buffer.alloc(10)); ok(r.ok && r.done, "nach fertig keine weiteren Daten");
    // Cockpit: Liste + Download
    const L = await J("/admin/api/uploads"); const lk = L.links[0], f = lk.files[0];
    ok(lk.count === 1 && lk.bytes === data.length && f.name === "Logo Mappe.pdf", "Liste + Dateiname ohne Pfad");
    ok(!/[\\/]/.test(f.name), "kein Pfad im Dateinamen");
    const dl = Buffer.from(await (await fetch(base + "/admin/api/uploads/file?link=" + lk.id + "&f=" + f.id)).arrayBuffer());
    ok(dl.equals(data), "Download identisch");
    const zr = await fetch(base + "/admin/api/uploads/zip?link=" + lk.id), zb = Buffer.from(await zr.arrayBuffer());
    ok(zr.status === 200 && zb.subarray(0, 2).toString() === "PK", "ZIP");
    const { unzipSync } = require("fflate"); const un = unzipSync(new Uint8Array(zb)); ok(Buffer.from(un[f.name]).equals(data), "ZIP-Inhalt identisch");
    // Ordner: Kunde legt Ordner an, lädt hinein; Cockpit benennt um, verschiebt, ZIP mit Ordnern, Ordner löschen
    const mk = await J(B + "/mkdir", { method: "POST", headers: H, body: JSON.stringify({ dir: "Logos/../Varianten:neu" }) });
    ok(mk.ok && mk.dir === "Logos/Varianten_neu" && mk.dirs.includes("Logos"), "Kunde: Ordner anlegen (Pfad bereinigt, Eltern mit)");
    const small = Buffer.from("hallo welt");
    const i3 = await J(B + "/init", { method: "POST", headers: H, body: JSON.stringify({ name: "a.txt", size: small.length, dir: "Fotos/Sommer" }) });
    await J(B + "/chunk?f=" + i3.id + "&o=0", { method: "PUT", headers: { "X-Upload": "1", "Content-Type": "application/octet-stream" }, body: small });
    const A = (o) => J("/admin/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ id: c.link.id }, o)) });
    let s1 = (await J("/admin/api/uploads")).links[0];
    ok(s1.dirs.includes("Fotos") && s1.dirs.includes("Fotos/Sommer") && s1.files.find(x => x.id === i3.id).dir === "Fotos/Sommer", "Upload in Unterordner");
    ok((await A({ op: "mkdir", parent: "Fotos", name: "Winter" })).dir === "Fotos/Winter", "Cockpit: Ordner anlegen");
    ok((await A({ op: "renameDir", from: "Fotos", to: "Fotos/x" })).status === 400, "Ordner nicht in sich selbst");
    let rn = await A({ op: "renameDir", from: "Fotos", to: "Bilder" });
    ok(rn.ok && rn.link.dirs.includes("Bilder/Sommer") && !rn.link.dirs.includes("Fotos") && rn.link.files.find(x => x.id === i3.id).dir === "Bilder/Sommer", "Umbenennen inkl. Unterordner und Dateien");
    let mv = await A({ op: "moveFiles", files: [i1.id], dir: "Logos" }); ok(mv.link.files.find(x => x.id === i1.id).dir === "Logos", "Datei verschieben");
    const zb2 = Buffer.from(await (await fetch(base + "/admin/api/uploads/zip?link=" + c.link.id)).arrayBuffer()), un2 = unzipSync(new Uint8Array(zb2));
    ok(un2["Bilder/Sommer/a.txt"] && un2["Logos/Logo Mappe.pdf"], "ZIP mit Ordnerstruktur");
    const zb3 = Buffer.from(await (await fetch(base + "/admin/api/uploads/zip?link=" + c.link.id + "&dir=Bilder")).arrayBuffer()), un3 = unzipSync(new Uint8Array(zb3));
    ok(Object.keys(un3).join() === "Sommer/a.txt", "ZIP nur eines Ordners");
    ok((await A({ op: "rmdirEmpty", dir: "Bilder" })).status === 400, "voller Ordner nicht ohne Rückfrage löschbar");
    ok((await A({ op: "deleteDir", dir: "Bilder" })).status === 400, "Ordner löschen ohne confirm abgewiesen");
    const dd = await A({ op: "deleteDir", dir: "Bilder", confirm: true });
    ok(dd.ok && !dd.link.dirs.some(x => x.indexOf("Bilder") === 0) && !dd.link.files.some(x => x.id === i3.id), "Ordner samt Dateien gelöscht");
    await A({ op: "moveFiles", files: [i1.id], dir: "" });
    // Nachricht
    ok((await J(B + "/note", { method: "POST", headers: H, body: JSON.stringify({ text: "Hallo" }) })).ok, "Nachricht");
    // ohne Anmeldung kein Cockpit
    authed = false; ok((await J("/admin/api/uploads")).status === 401, "Cockpit ohne Login → 401"); authed = true;
    // schließen → Seite 410, Upload abgewiesen
    await J("/admin/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "update", id: lk.id, active: false }) });
    ok((await fetch(base + B)).status === 410, "geschlossen → 410");
    ok((await J(B + "/init", { method: "POST", headers: H, body: JSON.stringify({ name: "b", size: 5 }) })).status === 410, "geschlossen: init abgewiesen");
    // Löschen nur mit Bestätigung
    ok((await J("/admin/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "deleteFile", id: lk.id, file: f.id }) })).status === 400, "Löschen ohne confirm abgewiesen");
    const d = await J("/admin/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "deleteFile", id: lk.id, file: f.id, confirm: true }) });
    ok(d.ok && d.link.count === 0 && !fs.existsSync(path.join(dir, "uploads", lk.id, f.id)), "Datei gelöscht");
  } catch (e) { fail++; console.log("FEHLER:", e.stack); }
  srv.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log((fail ? "FEHLGESCHLAGEN" : "OK") + ": " + pass + " bestanden, " + fail + " fehlgeschlagen"); process.exit(fail ? 1 : 0);
});
