/* VIW Cloud (viw-cloud.js) gegen eine Nextcloud-Attrappe (test/nextcloud-mock.js) und den Mail-Dienst-Mock (test/print-mocks.js).
   Aufruf: node test/viw.test.js – server.js läuft in einer Temp-Kopie.
   Geprüft: nicht eingerichtet → Hinweis, Status/Speicher, Ordnerliste (Ordner zuerst), Ordner anlegen, Hochladen (kein stilles Überschreiben, Ersetzen nur auf Wunsch,
   Änderungsdatum), Teil-Upload großer Dateien, Umbenennen, Verschieben (nicht in sich selbst), Löschen nur mit Bestätigung, Download (nur sichere Typen inline),
   Vorschaubild, Mail-Anhänge ablegen (freier Name), Pfade mit „..“ abgelehnt, ohne Anmeldung kein Zugriff, App-Passwort falsch → klare Meldung. */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto");
const createMocks = require("./print-mocks.js"), createNc = require("./nextcloud-mock.js");
const ROOT = path.join(__dirname, "..");
const SECRET = "test-secret";
const COOKIE = "fsadmin=" + encodeURIComponent((v => v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("hex"))("s1." + Date.now()));
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }
function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-viw-"));
  fs.readdirSync(ROOT).filter(f => /\.(js|html|css|xml|txt|webmanifest)$/.test(f) && fs.statSync(path.join(ROOT, f)).isFile()).forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  const cpDir = (d) => { fs.mkdirSync(path.join(dir, d), { recursive: true }); fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => { if (e.isDirectory()) cpDir(path.join(d, e.name)); else fs.copyFileSync(path.join(ROOT, d, e.name), path.join(dir, d, e.name)); }); };
  ["admin-cockpit", "logos"].forEach(cpDir);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
async function startServer(dir, env) {
  const port = 6500 + Math.floor(Math.random() * 900);
  const e = Object.assign({}, process.env, { PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x" }, env);
  ["BLITZDINGS_STATS_URL", "BLITZDINGS_STATS_TOKEN", "RAILWAY_API_TOKEN", "CF_API_TOKEN", "ANTHROPIC_API_KEY", "DATABASE_URL", "SEVDESK_API_KEY", "VIW_CLOUD_URL", "VIW_CLOUD_USER", "VIW_CLOUD_PASSWORD"].forEach((k) => { if (!(k in env)) delete e[k]; });
  const srv = cp.spawn(process.execPath, ["server.js"], { cwd: dir, env: e, stdio: ["ignore", "pipe", "pipe"] });
  srv.out = ""; srv.stdout.on("data", (d) => (srv.out += d)); srv.stderr.on("data", (d) => (srv.out += d));
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 80; i++) { try { await fetch(base + "/admin/login"); break; } catch (er) { await new Promise((r) => setTimeout(r, 100)); } }
  srv.base = base; return srv;
}
(async () => {
  const mocks = createMocks(); const mport = await listen(mocks.server);
  const nc = createNc({ login: "simon@fs-creative.at", seed: [["/Projekte", { dir: true }], ["/Angebot.pdf", { data: Buffer.from("%PDF-1.4 Angebot") }], ["/Projekte/logo.png", { data: Buffer.from("PNGDATA") }], ["/seite.html", { data: Buffer.from("<script>alert(1)</script>") }]] });
  const nport = await listen(nc.server), NC = "http://127.0.0.1:" + nport;
  // Freigabe-Link (neues öffentliches WebDAV, mit Link-Passwort) und alter Stil (ohne Passwort)
  const sh = createNc({ share: { token: "AbCdEf12345", pass: "linkpw", root: "/Freigabe" }, seed: [["/Freigabe", { dir: true }], ["/Freigabe/Plan.pdf", { data: Buffer.from("%PDF plan") }], ["/Privat", { dir: true }]] });
  const SH = "http://127.0.0.1:" + await listen(sh.server);
  const old = createNc({ share: { token: "Old1234567", legacy: true, root: "/" }, seed: [["/Alt.txt", { data: Buffer.from("alt") }]] });
  const OLD = "http://127.0.0.1:" + await listen(old.server);
  const dir = copyApp();
  const off = await startServer(dir, {});
  const srv = await startServer(dir, { MAIL_API_URL: "http://127.0.0.1:" + mport + "/mail/api/mails", MAIL_API_TOKEN: "mt", VIW_CLOUD_URL: NC + "/index.php/apps/files/?dir=/", VIW_CLOUD_USER: nc.login, VIW_CLOUD_PASSWORD: nc.pass });
  const bad = await startServer(dir, { VIW_CLOUD_URL: NC, VIW_CLOUD_USER: nc.login, VIW_CLOUD_PASSWORD: "falsch" });
  const shs = await startServer(dir, { VIW_CLOUD_URL: SH + "/index.php/s/AbCdEf12345", VIW_CLOUD_PASSWORD: "linkpw" });
  const shbad = await startServer(dir, { VIW_CLOUD_URL: SH + "/s/AbCdEf12345" });
  const olds = await startServer(dir, { VIW_CLOUD_URL: OLD + "/s/Old1234567" });
  const dir2 = copyApp(), lsrv = await startServer(dir2, {});   // eigener Datenordner fürs Anmeldefenster
  const B = srv.base;
  const get = async (p, base) => { const r = await fetch((base || B) + p, { headers: { cookie: COOKIE } }); return r.json(); };
  const op = async (body) => { const r = await fetch(B + "/admin/api/viw/op", { method: "POST", headers: { cookie: COOKIE, "content-type": "application/json" }, body: JSON.stringify(body) }); return Object.assign(await r.json(), { _status: r.status }); };
  const up = async (p, buf, q) => { const r = await fetch(B + "/admin/api/viw/upload?path=" + encodeURIComponent(p) + (q || ""), { method: "PUT", headers: { cookie: COOKIE, "content-type": "application/octet-stream" }, body: buf }); return Object.assign(await r.json(), { _status: r.status }); };
  try {
    await t("Nicht eingerichtet: Status sagt es, Liste meldet es verständlich", async () => {
      const s = await get("/admin/api/viw/status?check=1", off.base); assert.strictEqual(s.configured, false); assert.strictEqual(s.error, "");
      const l = await get("/admin/api/viw/list?path=/", off.base); assert.strictEqual(l.ok, false); assert.ok(/nicht eingerichtet/.test(l.error), l.error);
    });
    await t("Status: kopierte Browser-Adresse wird zur Nextcloud-Adresse, erreichbar, Speicher", async () => {
      const s = await get("/admin/api/viw/status?check=1"); assert.strictEqual(s.configured, true); assert.strictEqual(s.reachable, true, JSON.stringify(s)); assert.strictEqual(s.web, NC); assert.strictEqual(s.user, "simon@fs-creative.at"); assert.strictEqual(s.mode, "user");
      assert.ok(s.quota && s.quota.avail === 1073741824, JSON.stringify(s.quota)); assert.ok(!JSON.stringify(s).includes(nc.pass), "App-Passwort nie im Cockpit");
    });
    await t("Falsches App-Passwort → klare Meldung", async () => {
      const s = await get("/admin/api/viw/status?check=1", bad.base); assert.strictEqual(s.reachable, false); assert.ok(/App-Passwort/.test(s.error), s.error);
    });
    await t("Ordnerliste: Ordner zuerst, Größe, Typ, Vorschau", async () => {
      const l = await get("/admin/api/viw/list?path=/"); assert.ok(l.ok, JSON.stringify(l));
      assert.deepStrictEqual(l.items.map(x => x.name), ["Projekte", "Angebot.pdf", "seite.html"]); assert.strictEqual(l.items[0].dir, true); assert.strictEqual(l.items[1].size, 16); assert.strictEqual(l.items[1].type, "application/pdf");
      const p = await get("/admin/api/viw/list?path=" + encodeURIComponent("/Projekte")); assert.strictEqual(p.items[0].path, "/Projekte/logo.png"); assert.strictEqual(p.items[0].preview, true);
    });
    await t("Ordner anlegen (auch mit Umlauten/Leerzeichen), doppelt → Hinweis", async () => {
      let r = await op({ op: "mkdir", dir: "/Projekte", name: "Fotos Gärten 2026" }); assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.path, "/Projekte/Fotos Gärten 2026");
      assert.ok(nc.state.files.has("/Projekte/Fotos Gärten 2026"));
      r = await op({ op: "mkdir", dir: "/Projekte", name: "Fotos Gärten 2026" }); assert.strictEqual(r.ok, false); assert.ok(/gibt es schon/.test(r.error));
      r = await op({ op: "mkdirs", path: "/Neu/A/B" }); assert.ok(r.ok && nc.state.files.has("/Neu/A/B")); r = await op({ op: "mkdirs", path: "/Neu/A/B" }); assert.ok(r.ok, "vorhandene Ordner sind kein Fehler");
    });
    await t("Hochladen: neu, nicht still überschreiben, Ersetzen nur auf Wunsch, Änderungsdatum", async () => {
      let r = await up("/Projekte/Plan.pdf", Buffer.from("v1"), "&mtime=1700000000"); assert.ok(r.ok, JSON.stringify(r));
      assert.strictEqual(nc.state.files.get("/Projekte/Plan.pdf").data.toString(), "v1"); assert.strictEqual(nc.state.files.get("/Projekte/Plan.pdf").mtime, 1700000000000);
      r = await up("/Projekte/Plan.pdf", Buffer.from("v2")); assert.strictEqual(r.error, "exists"); assert.strictEqual(nc.state.files.get("/Projekte/Plan.pdf").data.toString(), "v1");
      r = await up("/Projekte/Plan.pdf", Buffer.from("v2"), "&overwrite=1"); assert.ok(r.ok); assert.strictEqual(nc.state.files.get("/Projekte/Plan.pdf").data.toString(), "v2");
      r = await op({ op: "exists", path: "/Projekte/Plan.pdf" }); assert.strictEqual(r.exists, true);
    });
    await t("Große Datei in Teilen: zusammengesetzt, Länge geprüft, nicht überschreiben", async () => {
      const parts = [Buffer.alloc(3000, 1), Buffer.alloc(3000, 2), Buffer.alloc(1234, 3)], total = 7234;
      let s = await op({ op: "chunkstart", path: "/Projekte/Video.mp4" }); assert.ok(s.ok && /^fsc-/.test(s.id), JSON.stringify(s));
      for (let i = 0; i < 3; i++) { const r = await fetch(B + "/admin/api/viw/chunk?id=" + s.id + "&n=" + (i + 1) + "&total=" + total + "&path=" + encodeURIComponent("/Projekte/Video.mp4"), { method: "PUT", headers: { cookie: COOKIE }, body: parts[i] }); assert.ok((await r.json()).ok); }
      let d = await op({ op: "chunkdone", id: s.id, path: "/Projekte/Video.mp4", total, mtime: 1700000100 }); assert.ok(d.ok, JSON.stringify(d));
      const f = nc.state.files.get("/Projekte/Video.mp4"); assert.strictEqual(f.data.length, total); assert.strictEqual(f.data[3000], 2); assert.strictEqual(f.mtime, 1700000100000);
      s = await op({ op: "chunkstart", path: "/Projekte/Video.mp4" }); await fetch(B + "/admin/api/viw/chunk?id=" + s.id + "&n=1&total=5&path=" + encodeURIComponent("/Projekte/Video.mp4"), { method: "PUT", headers: { cookie: COOKIE }, body: Buffer.alloc(5) });
      d = await op({ op: "chunkdone", id: s.id, path: "/Projekte/Video.mp4", total: 5 }); assert.strictEqual(d.error, "exists"); assert.strictEqual(nc.state.files.get("/Projekte/Video.mp4").data.length, total);
      assert.strictEqual(nc.state.uploads.size, 0, "abgebrochener Teil-Upload aufgeräumt");
      const x = await op({ op: "chunkdone", id: "../../x", path: "/a" }); assert.strictEqual(x.ok, false);
    });
    await t("Umbenennen, Verschieben, nicht in sich selbst, Name am Ziel vergeben", async () => {
      let r = await op({ op: "rename", path: "/Projekte/Plan.pdf", name: "Plan final.pdf" }); assert.ok(r.ok); assert.ok(nc.state.files.has("/Projekte/Plan final.pdf"));
      r = await op({ op: "move", path: "/Projekte/Plan final.pdf", to: "/Neu/A" }); assert.ok(r.ok); assert.ok(nc.state.files.has("/Neu/A/Plan final.pdf"));
      r = await op({ op: "move", path: "/Neu", to: "/Neu/A/B" }); assert.strictEqual(r.ok, false); assert.ok(/sich selbst/.test(r.error));
      await up("/Projekte/Angebot.pdf", Buffer.from("x")); r = await op({ op: "move", path: "/Projekte/Angebot.pdf", to: "/" }); assert.strictEqual(r.error, "exists");
      r = await op({ op: "rename", path: "/Projekte", name: "a/b" }); assert.strictEqual(r.ok, false);
    });
    await t("Löschen nur mit Bestätigung, Ordner samt Inhalt, oberster Ordner bleibt", async () => {
      let r = await op({ op: "delete", path: "/Neu" }); assert.strictEqual(r.ok, false); assert.ok(nc.state.files.has("/Neu"));
      r = await op({ op: "delete", path: "/Neu", confirm: true }); assert.ok(r.ok); assert.ok(!nc.state.files.has("/Neu/A/Plan final.pdf")); assert.ok(nc.state.trash.indexOf("/Neu/A/B") > -1);
      r = await op({ op: "delete", path: "/", confirm: true }); assert.strictEqual(r.ok, false);
    });
    await t("Download: PDF inline ansehbar, HTML nie inline (kein Skript im Cockpit), Dateiname", async () => {
      let r = await fetch(B + "/admin/api/viw/file?path=" + encodeURIComponent("/Angebot.pdf") + "&inline=1", { headers: { cookie: COOKIE } });
      assert.strictEqual(r.status, 200); assert.ok(/^inline/.test(r.headers.get("content-disposition"))); assert.strictEqual(r.headers.get("content-type"), "application/pdf"); assert.strictEqual(await r.text(), "%PDF-1.4 Angebot");
      r = await fetch(B + "/admin/api/viw/file?path=" + encodeURIComponent("/seite.html") + "&inline=1", { headers: { cookie: COOKIE } });
      assert.ok(/^attachment/.test(r.headers.get("content-disposition"))); assert.strictEqual(r.headers.get("content-type"), "application/octet-stream"); assert.strictEqual(r.headers.get("x-content-type-options"), "nosniff");
      r = await fetch(B + "/admin/api/viw/file?path=" + encodeURIComponent("/gibtsnicht.pdf"), { headers: { cookie: COOKIE } }); assert.strictEqual(r.status, 404);
      r = await fetch(B + "/admin/api/viw/preview?fileid=" + [...nc.state.files.entries()].find(([k]) => k === "/Projekte/logo.png")[1].id, { headers: { cookie: COOKIE } }); assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get("content-type"), "image/png");
    });
    await t("Mail-Anhänge ablegen: Datei aus dem Mail-Dienst, vorhandener Name → „(2)“", async () => {
      const m = { folder: "INBOX", uid: 7, index: 0, account: "fs", filename: "rechnung.pdf" };
      let r = await op({ op: "frommail", dir: "/Projekte", mails: [m] }); assert.ok(r.ok, JSON.stringify(r)); assert.deepStrictEqual(r.saved, ["/Projekte/rechnung.pdf"]);
      assert.ok(nc.state.files.get("/Projekte/rechnung.pdf").data.toString().startsWith("%PDF"));
      r = await op({ op: "frommail", dir: "/Projekte", mails: [m, m] }); assert.deepStrictEqual(r.saved, ["/Projekte/rechnung (2).pdf", "/Projekte/rechnung (3).pdf"]);
    });
    await t("Pfade mit „..“ abgelehnt, ohne Anmeldung kein Zugriff, Seite im Cockpit", async () => {
      let r = await get("/admin/api/viw/list?path=" + encodeURIComponent("/../../etc")); assert.strictEqual(r.ok, false); assert.ok(/Ungültiger Pfad/.test(r.error));
      r = await up("/../x.txt", Buffer.from("x")); assert.strictEqual(r.ok, false);
      const n = await fetch(B + "/admin/api/viw/list?path=/", { redirect: "manual" }); assert.strictEqual(n.status, 302);
      const h = await (await fetch(B + "/admin", { headers: { cookie: COOKIE } })).text(); assert.ok(/zviw\.js/.test(h), "Modul eingebunden");
      assert.ok(!nc.state.log.some(l => /\.\./.test(l)));
    });
    await t("Login per E-Mail (Gastzugang): interne Benutzer-ID wird ermittelt, Pfade stimmen", async () => {
      assert.ok(nc.state.log.some(l => l === "GET /ocs/v2.php/cloud/user"), "ID abgefragt"); assert.ok(nc.state.log.some(l => /^PROPFIND \/remote\.php\/dav\/files\/simon\//.test(l)), "Pfad mit interner ID");
      assert.ok(!nc.state.log.some(l => /dav\/files\/simon%40|dav\/files\/simon@/.test(l)), "nie mit der E-Mail im Pfad");
    });
    const sget = async (base, p) => (await fetch(base + p, { headers: { cookie: COOKIE } })).json();
    const sop = async (base, body) => (await fetch(base + "/admin/api/viw/op", { method: "POST", headers: { cookie: COOKIE, "content-type": "application/json" }, body: JSON.stringify(body) })).json();
    const sup = async (base, p, buf) => (await fetch(base + "/admin/api/viw/upload?path=" + encodeURIComponent(p), { method: "PUT", headers: { cookie: COOKIE, "content-type": "application/octet-stream" }, body: buf })).json();
    await t("Freigabe-Link mit Passwort: Status, nur der freigegebene Ordner, Hochladen (auch groß in einem Stück), kein Teil-Upload", async () => {
      const s = await sget(shs.base, "/admin/api/viw/status?check=1"); assert.strictEqual(s.mode, "share"); assert.strictEqual(s.reachable, true, JSON.stringify(s)); assert.strictEqual(s.web, SH + "/index.php/s/AbCdEf12345"); assert.strictEqual(s.user, "");
      const l = await sget(shs.base, "/admin/api/viw/list?path=/"); assert.ok(l.ok, JSON.stringify(l)); assert.deepStrictEqual(l.items.map(x => x.name), ["Plan.pdf"]);
      let r = await sop(shs.base, { op: "mkdir", dir: "/", name: "Fotos" }); assert.ok(r.ok, JSON.stringify(r)); assert.ok(sh.state.files.has("/Freigabe/Fotos"));
      r = await sup(shs.base, "/Fotos/klein.jpg", Buffer.from("jpg")); assert.ok(r.ok, JSON.stringify(r)); assert.ok(sh.state.files.has("/Freigabe/Fotos/klein.jpg"));
      const big = Buffer.alloc(11 * 1024 * 1024, 7); r = await sup(shs.base, "/Fotos/gross.mov", big); assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(sh.state.files.get("/Freigabe/Fotos/gross.mov").data.length, big.length);
      r = await sop(shs.base, { op: "chunkstart", path: "/x.bin" }); assert.strictEqual(r.ok, false);
      const d = await fetch(shs.base + "/admin/api/viw/file?path=" + encodeURIComponent("/Plan.pdf"), { headers: { cookie: COOKIE } }); assert.strictEqual(await d.text(), "%PDF plan");
      const pv = await fetch(shs.base + "/admin/api/viw/preview?fileid=2", { headers: { cookie: COOKIE } }); assert.strictEqual(pv.status, 404);
      assert.ok(!sh.state.files.has("/Privat/Plan.pdf") && !sh.state.log.some(l => /Privat/.test(l)), "nichts außerhalb der Freigabe");
    });
    await t("Freigabe-Link: fehlendes Passwort klar gemeldet; alter Link-Stil ohne Passwort geht", async () => {
      const s = await sget(shbad.base, "/admin/api/viw/status?check=1"); assert.strictEqual(s.reachable, false); assert.ok(/Passwort/.test(s.error), s.error);
      const l = await sget(olds.base, "/admin/api/viw/list?path=/"); assert.ok(l.ok, JSON.stringify(l)); assert.deepStrictEqual(l.items.map(x => x.name), ["Alt.txt"]);
    });
    await t("Anmeldefenster: falsches Passwort nicht gespeichert, richtiges verschlüsselt gespeichert, nie zurückgegeben, Abmelden löscht", async () => {
      const login = async body => (await fetch(lsrv.base + "/admin/api/viw/login", { method: "POST", headers: { cookie: COOKIE, "content-type": "application/json" }, body: JSON.stringify(body) })).json();
      let r = await login({ url: NC + "/index.php/apps/files/", user: nc.login, pass: "falsch" }); assert.strictEqual(r.ok, false); assert.ok(/Passwort/.test(r.error), r.error);
      assert.ok(!fs.existsSync(path.join(dir2, "viw-cloud.json")), "nichts gespeichert");
      r = await login({ url: "", user: "", pass: "" }); assert.strictEqual(r.ok, false); assert.ok(/Adresse/.test(r.error));
      r = await login({ url: NC + "/index.php/apps/files/", user: nc.login, pass: nc.pass }); assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.reachable, true); assert.strictEqual(r.source, "login");
      const raw = fs.readFileSync(path.join(dir2, "viw-cloud.json"), "utf8"); assert.ok(raw.indexOf(nc.pass) < 0, "Passwort verschlüsselt"); assert.ok(/simon@fs-creative\.at/.test(raw));
      const st = await sget(lsrv.base, "/admin/api/viw/status?check=1"); assert.ok(!JSON.stringify(st).includes(nc.pass)); assert.deepStrictEqual(st.form, { url: NC + "/index.php/apps/files/", user: nc.login });
      const l = await sget(lsrv.base, "/admin/api/viw/list?path=/"); assert.ok(l.ok && l.items.some(x => x.name === "Projekte"), JSON.stringify(l).slice(0, 200));
      r = await login({ url: SH + "/s/AbCdEf12345", pass: "linkpw" }); assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.mode, "share");
      r = await login({ op: "logout" }); assert.ok(r.ok); assert.ok(!fs.existsSync(path.join(dir2, "viw-cloud.json")));
      assert.strictEqual((await sget(lsrv.base, "/admin/api/viw/status")).configured, false);
      for (let i = 0; i < 6; i++) await login({ url: NC, user: nc.login, pass: "x" + i }); r = await login({ url: NC, user: nc.login, pass: nc.pass }); assert.ok(/Zu viele Versuche/.test(r.error || ""), "Bremse gegen Sperre bei VIW");
    });
  } finally {
    [off, srv, bad, shs, shbad, olds, lsrv].forEach(s => s.kill()); mocks.server.close(); nc.server.close(); sh.server.close(); old.server.close();
  }
  console.log(fails.join("\n")); console.log("VIW Cloud: " + pass + " bestanden, " + fail + " fehlgeschlagen");
  if (fail) console.log(srv.out.slice(-1500));
  process.exit(fail ? 1 : 0);
})();
