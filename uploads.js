"use strict";
// Datei-Upload per Link (Wunsch Simon 04.11.2026) – www.fs-creative.at/upload/<token>
// Cockpit „Uploads“ legt einen Link an (Token 192 Bit) → Kunde lädt ohne Anmeldung beliebig viele und beliebig große Dateien hoch (Datei wählen oder Drag & Drop).
// Hochgeladen wird in Stücken (CHUNK): kein Größenlimit durch Cloudflare/Proxy, ein Abbruch setzt beim letzten Stück fort. Simon lädt im Cockpit einzeln oder als ZIP herunter.
// Speicher: DATA_DIR/uploads/links.json (Links + Dateiliste) und DATA_DIR/uploads/<linkId>/<fileId> (Railway-Volume /data). Neue Uploads stoppen, wenn weniger als MIN_FREE frei ist.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CHUNK = 16 * 1024 * 1024, MAX_CHUNK = 32 * 1024 * 1024, MIN_FREE = 2 * 1024 * 1024 * 1024, ZIP_MAX = 3.8 * 1024 * 1024 * 1024;

module.exports = function (D) {
  const DIR = path.join(D.DATA_DIR, "uploads"), IDX = path.join(DIR, "links.json");
  const log = (...a) => console.log("[FS Cloud]", ...a);
  const nowIso = () => new Date().toISOString();
  const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
  const escH = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const rnd = n => crypto.randomBytes(n).toString("hex");

  // ── Index (klein, im Speicher + Datei) ──
  let L = null;
  function load() {
    if (L) return L;
    try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) {}
    try { L = JSON.parse(fs.readFileSync(IDX, "utf8")); if (!Array.isArray(L)) L = []; } catch (e) { L = []; }
    return L;
  }
  let saveT = null;
  function saveNow() { clearTimeout(saveT); saveT = null; try { const tmp = IDX + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(L)); fs.renameSync(tmp, IDX); } catch (e) { log("Speichern:", e.message); } }
  function save(soon) { if (soon) { if (!saveT) saveT = setTimeout(saveNow, 1500); } else saveNow(); }
  const byToken = t => load().find(x => x.token === t);
  const byId = id => load().find(x => x.id === id);
  const fileOf = (l, f) => path.join(DIR, l.id, f.id);
  const open = l => l.active !== false && !(l.expires && Date.parse(l.expires) < Date.now());
  function freeBytes() { try { const s = fs.statfsSync(DIR); return s.bavail * s.bsize; } catch (e) { return null; } }
  const safeName = n => clip(String(n || "datei").split(/[\\/]/).pop().replace(/[\\/\0\r\n"<>|:*?]+/g, "_").replace(/^\.+/, "").trim() || "datei", 180);
  // Ordner (Wunsch Simon 04.11.2026 „wie in einem Dateimanager“): Pfad „Logos/Varianten“ je Datei (f.dir) + leere Ordner in l.dirs; max. 8 Ebenen
  const safeDir = d => String(d || "").split(/[\\/]+/).map(x => clip(x.replace(/[\0\r\n"<>|:*?]+/g, "_").replace(/^\.+/, "").trim(), 80)).filter(Boolean).slice(0, 8).join("/");
  const inDir = (fd, d) => !d || fd === d || String(fd || "").indexOf(d + "/") === 0;
  function addDir(l, d) { d = safeDir(d); if (!d) return ""; l.dirs = l.dirs || []; const parts = d.split("/");
    for (let i = 1; i <= parts.length; i++) { const x = parts.slice(0, i).join("/"); if (!l.dirs.includes(x)) { if (l.dirs.length >= 1000) throw Object.assign(new Error("Zu viele Ordner"), { status: 400 }); l.dirs.push(x); } }
    return d; }

  /* Aktueller Stand als Buch (Simon 18.11.2026, Gemeinde Gaschurn): neueste PDF, die FS Creative in den Ordner „Aktueller Stand“ lädt –
     Kunde sieht oben einen großen Knopf mit Uhrzeit, blättert wie in einem Buch und kann die Original-PDF (Druckqualität) drucken/laden */
  const STAND_DIR = "Aktueller Stand";
  function standOf(l) {
    if (!l.book) return null;
    const f = liveFiles(l).filter(x => x.by === "fs" && /\.pdf$/i.test(x.name) && (x.dir || "") === STAND_DIR).sort((a, b) => String(b.doneAt || b.at).localeCompare(String(a.doneAt || a.at)))[0];
    return f ? { id: f.id, name: f.name, at: f.doneAt || f.at, size: f.size } : null;
  }
  const viennaTime = iso => { try { return new Date(iso).toLocaleString("de-AT", { timeZone: "Europe/Vienna", weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " Uhr"; } catch (e) { return String(iso || "").slice(0, 16).replace("T", " "); } };
  function summary(l) {
    const files = (l.files || []).filter(f => !f.deleted);
    return { id: l.id, token: l.token, url: D.ORIGIN + "/upload/" + l.token, title: l.title, customer: l.customer, email: l.email, note: l.note, createdAt: l.createdAt, expires: l.expires || "", active: l.active !== false, open: open(l), book: !!l.book, stand: standOf(l), standDir: STAND_DIR,
      dirs: (l.dirs || []).slice().sort((a, b) => a.localeCompare(b, "de")), lastAt: l.lastAt || "", msgs: (l.msgs || []).slice(-50).map(m => ({ at: m.at, text: m.text, by: m.by === "fs" ? "fs" : "kunde", mailed: !!m.mailed })), seenAt: l.seenAt || "", count: files.filter(f => f.done).length, bytes: files.filter(f => f.done).reduce((a, f) => a + f.size, 0),
      files: files.map(f => ({ id: f.id, name: f.name, dir: f.dir || "", fs: f.by === "fs", size: f.size, got: f.got, done: !!f.done, at: f.at, doneAt: f.doneAt || "" })).reverse() };
  }
  // Chat zum Upload (Wunsch Simon 05.11.2026): Nachrichten vom Kunden und Antworten aus dem Cockpit (by: "fs") – auf der Upload-Seite als Verlauf
  const pubMsgs = l => (l.msgs || []).slice(-50).map(m => ({ at: m.at, text: m.text, by: m.by === "fs" ? "fs" : "kunde" }));
  function create(b) {
    const title = clip(b.title, 120).trim(); if (!title) throw Object.assign(new Error("Bitte einen Titel angeben (z. B. Kunde oder Projekt)"), { status: 400 });
    const days = Math.max(0, Math.min(365, parseInt(b.days, 10) || 0));
    const l = { id: "u" + rnd(8), token: crypto.randomBytes(24).toString("base64url"), title, customer: clip(b.customer, 120).trim(), email: clip(b.email, 160).trim(), note: clip(b.note, 600).trim(),
      createdAt: nowIso(), expires: days ? new Date(Date.now() + days * 864e5).toISOString() : "", active: true, files: [], msgs: [] };
    load().unshift(l); save(); return l;
  }

  // Benachrichtigung: einmal je Upload-Runde (3 Min. Ruhe), nicht je Datei
  const NOTE = new Map();
  function notify(l) {
    clearTimeout(NOTE.get(l.id));
    NOTE.set(l.id, setTimeout(() => { NOTE.delete(l.id); const fresh = (l.files || []).filter(f => f.done && !f.deleted && (!l.notifiedAt || f.doneAt > l.notifiedAt)); if (!fresh.length) return;
      l.notifiedAt = nowIso(); save(true);
      const bytes = fresh.reduce((a, f) => a + f.size, 0);
      if (D.push) D.push("lead", { title: "FS Cloud: " + l.title, body: fresh.length + " Datei" + (fresh.length === 1 ? "" : "en") + " (" + human(bytes) + ") hochgeladen" + (fresh.length <= 3 ? ": " + fresh.map(f => f.name).join(", ") : ""), url: "/admin#uploads", tag: "upload-" + l.id }).catch(() => {});
    }, 3 * 60 * 1000));
  }
  const human = n => n >= 1073741824 ? (n / 1073741824).toFixed(1).replace(".", ",") + " GB" : n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";

  // ── HTTP-Hilfen ──
  const { clientIp, hitCounter } = require("./client-ip.js");
  const HITS = hitCounter(20000);
  const limited = (bucket, ip, max, windowMs) => HITS.hit(bucket + "|" + ip, max, windowMs);
  const SEC = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff" };
  const J = (res, code, o) => D.send(res, code, JSON.stringify(o), "application/json; charset=utf-8", SEC);
  const html = (req, res, code, body) => (D.sendGz || ((q, r, c, b, t, h) => D.send(r, c, b, t, h)))(req, res, code, body, "text/html; charset=utf-8", SEC);
  function readJson(req, max) {
    return new Promise((resolve, reject) => {
      const chunks = []; let n = 0, dead = false;
      req.on("data", c => { if (dead) return; n += c.length; if (n > max) { dead = true; req.resume(); return reject(Object.assign(new Error("Anfrage zu groß"), { status: 413 })); } chunks.push(c); });
      req.on("end", () => { if (dead) return; try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(Object.assign(new Error("Ungültige Anfrage"), { status: 400 })); } });
      req.on("error", e => { if (!dead) reject(e); });
    });
  }
  function sameOrigin(req) {
    if (req.headers["x-upload"] !== "1") return false;
    const o = req.headers.origin; if (!o) return true;
    try { const h = new URL(o).host.toLowerCase(); return h === String(req.headers.host || "").toLowerCase() || "https://" + h === String(D.ORIGIN || "").toLowerCase(); } catch (e) { return false; }
  }
  // Stück anhängen – nur an der erwarteten Stelle (Offset = bisher empfangen), sonst meldet der Server den echten Stand (Client setzt dort fort)
  const BUSY = new Set();
  function appendChunk(req, l, f, offset) {
    return new Promise((resolve, reject) => {
      const fp = fileOf(l, f); let have = 0; try { have = fs.statSync(fp).size; } catch (e) {}
      if (have !== f.got) f.got = have;   // Datei auf der Platte ist maßgeblich
      if (offset !== have) { req.resume(); return resolve({ got: have, skip: true }); }
      const len = parseInt(req.headers["content-length"] || "-1", 10);
      if (!(len > 0) || len > MAX_CHUNK || have + len > f.size) { req.resume(); return reject(Object.assign(new Error("Ungültiges Stück"), { status: 400 })); }
      const ws = fs.createWriteStream(fp, { flags: "a" }); let n = 0, failed = false;
      const fail = e => { if (failed) return; failed = true; ws.destroy(); try { fs.truncateSync(fp, have); } catch (x) {} reject(e); };   // halbes Stück wieder abschneiden
      req.on("data", c => { n += c.length; if (n > len) { req.destroy(); fail(Object.assign(new Error("Stück zu groß"), { status: 400 })); } });
      req.on("aborted", () => fail(Object.assign(new Error("Abgebrochen"), { status: 400 })));
      req.on("error", fail); ws.on("error", fail);
      ws.on("finish", () => { if (failed) return; if (n !== len) { try { fs.truncateSync(fp, have); } catch (x) {} return reject(Object.assign(new Error("Stück unvollständig"), { status: 400 })); } f.got = have + n; resolve({ got: f.got }); });
      req.pipe(ws);
    });
  }

  // ── gemeinsame Bausteine (Kunde und Cockpit) ──
  const E = (m, st) => Object.assign(new Error(m), { status: st });
  // Datei anmelden; gleiche Datei (Name + Größe + Ordner), noch nicht fertig → dort fortsetzen. by: "fs" = von Simon im Cockpit hochgeladen
  function initFile(l, b, by) {
    const size = Math.floor(+b.size);
    if (!(size > 0)) throw E("Leere Datei", 400);
    const free = freeBytes(); if (free != null && free - size < MIN_FREE) { log("Speicher fast voll –", human(free), "frei"); throw E("Der Speicher ist gerade voll – bitte kurz bei FS Creative melden.", 507); }
    const name = safeName(b.name), dir = addDir(l, b.dir);
    let f = (l.files || []).find(x => !x.deleted && !x.done && x.name === name && x.size === size && (x.dir || "") === dir);
    if (!f) { f = { id: "f" + rnd(10), name, dir, size, type: clip(b.type, 100), got: 0, done: false, at: nowIso() }; if (by) f.by = by; l.files = l.files || []; l.files.push(f);
      try { fs.mkdirSync(path.join(DIR, l.id), { recursive: true }); fs.writeFileSync(fileOf(l, f), ""); } catch (e) { throw E("Speichern nicht möglich", 500); } save(); }
    else { try { f.got = fs.statSync(fileOf(l, f)).size; } catch (e) { f.got = 0; fs.writeFileSync(fileOf(l, f), ""); } }
    return { ok: true, id: f.id, got: f.got, chunk: CHUNK };
  }
  async function chunkFile(req, l, fid, offset) {
    const f = (l.files || []).find(x => x.id === String(fid || "") && !x.deleted);
    if (!f) { req.resume(); throw E("Datei unbekannt – bitte neu auswählen", 404); }
    if (f.done) { req.resume(); return { ok: true, got: f.size, done: true }; }
    if (BUSY.has(f.id)) { req.resume(); throw E("busy", 409); }
    BUSY.add(f.id);
    try {
      await appendChunk(req, l, f, offset);
      if (f.got >= f.size) { f.done = true; f.doneAt = nowIso(); if (f.by !== "fs") { l.lastAt = f.doneAt; notify(l); } save(); log("Datei fertig:", l.title, "·", f.name, "·", human(f.size), f.by === "fs" ? "(Cockpit)" : "");
        if (isStand(f)) setImmediate(() => makeTrim(l, f)); }
      else save(true);
      return { ok: true, got: f.got, done: !!f.done };
    } finally { BUSY.delete(f.id); }
  }
  /* Zeitung als „Aktueller Stand“ ohne weißen Rand (Simon 18.11.2026): jede Seite auf ihr Endformat (TrimBox) zuschneiden –
     Beschnittzugabe und Schnittmarken fallen weg. Fassung liegt neben der Datei (<id>.trim); Download bleibt das Original. */
  const isStand = f => f.by === "fs" && (f.dir || "") === STAND_DIR && /\.pdf$/i.test(f.name);
  const TRIMQ = new Set();
  async function makeTrim(l, f) {
    if (TRIMQ.has(f.id) || f.trim) return; TRIMQ.add(f.id);
    try {
      if (f.size > 400 * 1024 * 1024) { f.trim = "big"; return; }
      const PL = require("pdf-lib"), doc = await PL.PDFDocument.load(fs.readFileSync(fileOf(l, f)), { updateMetadata: false, ignoreEncryption: true });
      let ch = 0; doc.getPages().forEach(p => { const t = p.getTrimBox(), m = p.getMediaBox(); if (t.width > 10 && t.height > 10 && (t.width < m.width - 1 || t.height < m.height - 1)) { p.setMediaBox(t.x, t.y, t.width, t.height); p.setCropBox(t.x, t.y, t.width, t.height); p.setBleedBox(t.x, t.y, t.width, t.height); ch++; } });
      if (!ch) { f.trim = "same"; return; }
      fs.writeFileSync(fileOf(l, f) + ".trim", Buffer.from(await doc.save({ useObjectStreams: false })));
      f.trim = "ok"; log("Stand zugeschnitten:", l.title, "·", f.name, "·", ch, "Seiten");
    } catch (e) { f.trim = "err"; log("Stand zuschneiden:", e.message); } finally { TRIMQ.delete(f.id); save(true); }
  }
  const liveFiles = l => (l.files || []).filter(f => f.done && !f.deleted);
  function sendFile(res, l, f, inline) {
    let fp = fileOf(l, f), st;
    if (inline && isStand(f)) { if (f.trim === "ok") { try { fs.statSync(fp + ".trim"); fp += ".trim"; } catch (e) { f.trim = ""; } } if (!f.trim) setImmediate(() => makeTrim(l, f)); }   // Ansicht/Druck: zugeschnittene Fassung
    try { st = fs.statSync(fp); } catch (e) { return J(res, 404, { ok: false, error: "Datei fehlt auf dem Speicher" }); }
    const pdfIn = !!inline && /\.pdf$/i.test(f.name);   // Buchansicht/Drucken: PDF im Browser öffnen statt herunterladen
    res.writeHead(200, Object.assign({}, SEC, { "Content-Type": pdfIn ? "application/pdf" : "application/octet-stream", "Content-Length": String(st.size), "Content-Disposition": (pdfIn ? "inline" : "attachment") + "; filename*=UTF-8''" + encodeURIComponent(f.name) }, pdfIn ? { "X-Frame-Options": "SAMEORIGIN" } : {}));
    fs.createReadStream(fp).pipe(res);
  }
  // alle fertigen Dateien (oder nur ein Ordner) als ZIP mit Ordnerstruktur – ohne Kompression, gestreamt
  async function sendZip(res, l, only, hide) {
    only = safeDir(only);
    const files = liveFiles(l).filter(f => inDir(f.dir, only) && !(hide && f.dir && inDir(f.dir, hide))), total = files.reduce((a, f) => a + f.size, 0);
    if (!files.length) return J(res, 404, { ok: false, error: "Noch keine Dateien" });
    if (total > ZIP_MAX) return J(res, 413, { ok: false, error: "Zusammen über 3,8 GB – bitte einzeln oder ordnerweise herunterladen" });
    const { Zip, ZipPassThrough } = require("fflate");
    res.writeHead(200, Object.assign({}, SEC, { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(safeName(l.title + (only ? " – " + only.split("/").pop() : "")) + ".zip") }));
    const zip = new Zip((err, chunk, final) => { if (err) { log("ZIP:", err.message); return res.destroy(); } res.write(Buffer.from(chunk)); if (final) res.end(); });
    const used = {};
    for (const f of files) {
      const rel = (f.dir || "") && only ? (f.dir === only ? "" : f.dir.slice(only.length + 1)) : (f.dir || ""), full = (rel ? rel + "/" : "") + f.name;
      let nm = full; if (used[nm]) { const e = path.extname(nm); nm = nm.slice(0, nm.length - e.length) + " (" + (++used[full]) + ")" + e; } else used[nm] = 1;
      const entry = new ZipPassThrough(nm); zip.add(entry);
      await new Promise((resolve, reject) => { const rs = fs.createReadStream(fileOf(l, f));
        rs.on("data", c => { entry.push(c); if (res.writableLength > 32 * 1024 * 1024) { rs.pause(); res.once("drain", () => rs.resume()); } });
        rs.on("end", () => { entry.push(new Uint8Array(0), true); resolve(); }); rs.on("error", reject); });
    }
    zip.end();
  }
  // Dateien und/oder Ordner (samt Inhalt) endgültig löschen → Anzahl gelöschter Dateien
  function removeItems(l, ids, dirs) {
    const idS = new Set([].concat(ids || []).map(String)), ds = [].concat(dirs || []).map(safeDir).filter(Boolean); let n = 0;
    (l.files || []).forEach(f => { if (f.deleted) return; if (idS.has(f.id) || (f.dir && ds.some(d => inDir(f.dir, d)))) { try { fs.unlinkSync(fileOf(l, f)); } catch (e) {} try { fs.unlinkSync(fileOf(l, f) + ".trim"); } catch (e) {} f.deleted = nowIso(); n++; } });
    if (ds.length) l.dirs = (l.dirs || []).filter(x => !ds.some(d => inDir(x, d)));
    save(); return n;
  }
  // Ordner „Aktueller Stand“ sieht der Kunde nicht als Ordner – nur über den großen Knopf (Simon 18.11.2026)
  const pubHide = l => l.book ? STAND_DIR : "";
  const pubDirs = l => (l.dirs || []).filter(x => !(pubHide(l) && inDir(x, pubHide(l)))).sort((a, b) => a.localeCompare(b, "de"));
  const pubFiles = l => liveFiles(l).filter(f => !(pubHide(l) && inDir(f.dir || "", pubHide(l)) && (f.dir || ""))).map(f => ({ id: f.id, name: f.name, dir: f.dir || "", size: f.size, at: f.doneAt || f.at, fs: f.by === "fs" }));

  // ── öffentliche Seite + Upload/Download (der geheime Link ist der Zugang – wie ein geteilter Ordner) ──
  async function handlePublic(req, res, u, p) {
    const ip = clientIp(req);
    const m = p.match(/^\/upload\/([A-Za-z0-9_-]{32})(\/init|\/chunk|\/note|\/mkdir|\/list|\/file|\/zip|\/delete)?\/?$/);
    const l = m && byToken(m[1]);
    if (!m || !l || l.deleted) return html(req, res, 404, page("Link ungültig", '<div class="up-card"><h1>Link ungültig</h1><p class="sub">Dieser Upload-Link ist ungültig. Bitte frag bei FS Creative nach einem neuen Link.</p></div>'));
    if (!m[2]) {
      if (req.method !== "GET" && req.method !== "HEAD") return J(res, 405, { ok: false, error: "method_not_allowed" });
      if (!open(l)) return html(req, res, 410, page("Upload geschlossen", '<div class="up-card"><h1>Upload geschlossen</h1><p class="sub">Für „' + escH(l.title) + '“ können keine Dateien mehr hochgeladen werden. Bitte melde dich bei FS Creative, falls noch etwas fehlt.</p></div>'));
      return html(req, res, 200, uploadPage(l));
    }
    if (!open(l)) { req.resume(); return J(res, 410, { ok: false, error: "Dieser Upload-Link ist geschlossen." }); }
    try {
      if (req.method === "GET") {
        if (limited("upget", ip, 3000, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Anfragen – bitte kurz warten" });
        if (m[2] === "/list") return J(res, 200, { ok: true, dirs: pubDirs(l), files: pubFiles(l), msgs: pubMsgs(l) });
        if (m[2] === "/file") { const f = liveFiles(l).find(x => x.id === String(u.searchParams.get("f") || "")); if (!f) return J(res, 404, { ok: false, error: "Datei nicht gefunden" }); return void sendFile(res, l, f, u.searchParams.get("inline") === "1"); }
        if (m[2] === "/zip") return void await sendZip(res, l, u.searchParams.get("dir"), pubHide(l));
        return J(res, 405, { ok: false, error: "method_not_allowed" });
      }
      if (req.method !== "POST" && req.method !== "PUT") return J(res, 405, { ok: false, error: "method_not_allowed" });
      if (!sameOrigin(req)) { req.resume(); return J(res, 403, { ok: false, error: "forbidden" }); }
      if (m[2] === "/init") {
        if (limited("upinit", ip, 2000, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Dateien auf einmal – bitte später weiter" });
        return J(res, 200, initFile(l, await readJson(req, 4000)));
      }
      if (m[2] === "/chunk") {
        if (limited("upchunk", ip, 20000, 3600e3)) { req.resume(); return J(res, 429, { ok: false, error: "Zu viele Anfragen – bitte kurz warten" }); }
        return J(res, 200, await chunkFile(req, l, u.searchParams.get("f"), parseInt(u.searchParams.get("o") || "-1", 10)));
      }
      if (m[2] === "/mkdir") {   // Kunde legt einen Ordner an
        if (limited("upmkdir", ip, 300, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Ordner" });
        const b = await readJson(req, 4000), d = addDir(l, b.dir); if (!d) return J(res, 400, { ok: false, error: "Bitte einen Namen eingeben" });
        save(); return J(res, 200, { ok: true, dir: d, dirs: l.dirs });
      }
      if (m[2] === "/delete") {   // Kunde löscht Dateien/Ordner (Rückfrage auf der Seite)
        if (limited("updel", ip, 300, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Anfragen" });
        const b = await readJson(req, 200000); if (b.confirm !== true) return J(res, 400, { ok: false, error: "Bestätigung fehlt" });
        const n = removeItems(l, b.files, b.dirs); log("Kunde hat gelöscht:", l.title, "·", n, "Datei(en)", (b.dirs || []).length ? "+ Ordner" : "");
        if (n && D.push) D.push("lead", { title: "FS Cloud: " + l.title, body: "Kunde hat " + n + " Datei" + (n === 1 ? "" : "en") + " gelöscht", url: "/admin#uploads", tag: "updel-" + l.id }).catch(() => {});
        return J(res, 200, { ok: true, deleted: n });
      }
      if (m[2] === "/note") {   // optionale Nachricht zum Upload
        if (limited("upnote", ip, 30, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Nachrichten" });
        const b = await readJson(req, 8000), t = clip(b.text, 2000).trim(); if (!t) return J(res, 400, { ok: false, error: "Leer" });
        l.msgs = (l.msgs || []).concat([{ at: nowIso(), text: t, name: clip(b.name, 100).trim() }]).slice(-50); l.lastAt = nowIso(); save();
        if (D.push) D.push("lead", { title: "FS Cloud – Nachricht: " + l.title, body: t.slice(0, 200), url: "/admin#uploads", tag: "upmsg-" + l.id }).catch(() => {});
        return J(res, 200, { ok: true, msgs: pubMsgs(l) });
      }
    } catch (e) { if (res.headersSent) return void res.destroy(); return J(res, e.status || 500, { ok: false, error: e.status ? e.message : "Fehler beim Hochladen" }); }
    return J(res, 404, { ok: false, error: "not_found" });
  }

  // ── Cockpit ──
  async function handleAdmin(req, res, u, p) {
    if (!(D.adminAuthed && D.adminAuthed(req))) return J(res, 401, { ok: false, error: "login" });
    try {
      if (p === "/admin/api/uploads" && req.method === "GET") { const free = freeBytes(); return J(res, 200, { ok: true, links: load().filter(l => !l.deleted).map(summary), free, chunk: CHUNK }); }
      if (p === "/admin/api/uploads/file" && req.method === "GET") {
        const l = byId(String(u.searchParams.get("link") || "")), f = l && (l.files || []).find(x => x.id === String(u.searchParams.get("f") || "") && !x.deleted);
        if (!f) return J(res, 404, { ok: false, error: "Datei nicht gefunden" });
        return void sendFile(res, l, f);
      }
      if (p === "/admin/api/uploads/zip" && req.method === "GET") { const l = byId(String(u.searchParams.get("link") || "")); if (!l) return J(res, 404, { ok: false, error: "Nicht gefunden" }); return void await sendZip(res, l, u.searchParams.get("dir")); }
      if (req.method !== "GET" && D.sameSiteReq && !D.sameSiteReq(req)) { req.resume(); return J(res, 403, { ok: false, error: "forbidden" }); }   // CSRF: Ändern nur von der eigenen Seite
      if (p === "/admin/api/uploads/chunk" && req.method === "PUT") {   // Simon lädt selbst in einen Link hoch (für den Kunden)
        const l = byId(String(u.searchParams.get("link") || "")); if (!l) { req.resume(); return J(res, 404, { ok: false, error: "Nicht gefunden" }); }
        return J(res, 200, await chunkFile(req, l, u.searchParams.get("f"), parseInt(u.searchParams.get("o") || "-1", 10)));
      }
      if (req.method !== "POST") return J(res, 405, { ok: false, error: "method_not_allowed" });
      const b = await readJson(req, 200000);
      if (p === "/admin/api/uploads") {
        if (b.op === "create") { const l = create(b); return J(res, 200, { ok: true, link: summary(l) }); }
        const l = byId(String(b.id || "")); if (!l) return J(res, 404, { ok: false, error: "Nicht gefunden" });
        if (b.op === "init") return J(res, 200, initFile(l, b, "fs"));
        if (b.op === "update") { if (b.title != null && clip(b.title, 120).trim()) l.title = clip(b.title, 120).trim(); if (b.note != null) l.note = clip(b.note, 600).trim(); if (b.active != null) l.active = !!b.active; if (b.book != null) { l.book = !!b.book; if (l.book) addDir(l, STAND_DIR); }
          if (b.days != null) { const d = parseInt(b.days, 10) || 0; l.expires = d > 0 ? new Date(Date.now() + Math.min(365, d) * 864e5).toISOString() : ""; } save(); return J(res, 200, { ok: true, link: summary(l) }); }
        if (b.op === "seen") { l.seenAt = nowIso(); save(true); return J(res, 200, { ok: true }); }
        if (b.op === "reply") {   // Antwort im Chat; auf Wunsch kurze Mail an den Kunden mit dem Link (nur wenn eine Adresse hinterlegt ist)
          const t = clip(b.text, 4000).trim(); if (!t) return J(res, 400, { ok: false, error: "Bitte eine Nachricht schreiben" });
          const msg = { at: nowIso(), text: t, by: "fs" }; l.msgs = (l.msgs || []).concat([msg]).slice(-50); l.seenAt = nowIso(); save();
          let mailed = false, mailErr = "";
          if (b.mail === true && l.email && D.mailSend) {
            try { await D.mailSend({ to: l.email, subject: "Neue Nachricht zu „" + l.title + "“ · FS Creative", text: "Hallo,\n\ndu hast eine neue Nachricht von FS Creative zu „" + l.title + "“:\n\n" + t + "\n\nAntworten und Dateien hochladen kannst du direkt hier:\n" + D.ORIGIN + "/upload/" + l.token + "\n\nLiebe Grüße\nSimon Felder\nFS Creative" }); mailed = true; msg.mailed = true; save(true); }
            catch (e) { mailErr = String(e.message || e).slice(0, 160); log("Upload-Chat: Mail fehlgeschlagen:", mailErr); }
          }
          return J(res, 200, { ok: true, mailed, mailError: mailErr, link: summary(l) });
        }
        // Ordner: anlegen, umbenennen/verschieben (inkl. Unterordner und Dateien), Dateien verschieben
        if (b.op === "mkdir") { const d = addDir(l, (safeDir(b.parent) ? safeDir(b.parent) + "/" : "") + safeDir(b.name)); if (!d) return J(res, 400, { ok: false, error: "Bitte einen Namen eingeben" }); save(); return J(res, 200, { ok: true, dir: d, link: summary(l) }); }
        if (b.op === "renameDir") { const from = safeDir(b.from), to = safeDir(b.to); if (!from || !to) return J(res, 400, { ok: false, error: "Bitte einen Namen eingeben" });
          if (to === from || to.indexOf(from + "/") === 0) return J(res, 400, { ok: false, error: "Ein Ordner kann nicht in sich selbst verschoben werden" });
          if ((l.dirs || []).includes(to)) return J(res, 400, { ok: false, error: "Diesen Ordner gibt es schon" });
          const mv = x => x === from ? to : to + x.slice(from.length);
          l.dirs = (l.dirs || []).map(x => inDir(x, from) ? mv(x) : x); addDir(l, to);
          (l.files || []).forEach(f => { if (f.dir && inDir(f.dir, from)) f.dir = mv(f.dir); }); save(); return J(res, 200, { ok: true, link: summary(l) }); }
        if (b.op === "moveFiles") { const to = b.dir ? addDir(l, b.dir) : "", ids = new Set([].concat(b.files || []).map(String));
          (l.files || []).forEach(f => { if (ids.has(f.id)) f.dir = to; }); save(); return J(res, 200, { ok: true, link: summary(l) }); }
        if (b.op === "rmdirEmpty") { const d = safeDir(b.dir); if (!d) return J(res, 400, { ok: false, error: "Ordner fehlt" }); if ((l.files || []).some(f => !f.deleted && inDir(f.dir, d))) return J(res, 400, { ok: false, error: "Der Ordner ist nicht leer" });
          l.dirs = (l.dirs || []).filter(x => !inDir(x, d)); save(); return J(res, 200, { ok: true, link: summary(l) }); }
        // Löschen nur auf ausdrücklichen Klick im Cockpit (mit Rückfrage)
        if (b.confirm !== true) return J(res, 400, { ok: false, error: "Bestätigung fehlt" });
        if (b.op === "deleteFile") { const f = (l.files || []).find(x => x.id === String(b.file || "")); if (!f) return J(res, 404, { ok: false, error: "Datei nicht gefunden" });
          removeItems(l, [f.id], []); return J(res, 200, { ok: true, link: summary(l) }); }
        if (b.op === "deleteDir") { const d = safeDir(b.dir); if (!d) return J(res, 400, { ok: false, error: "Ordner fehlt" }); removeItems(l, [], [d]); return J(res, 200, { ok: true, link: summary(l) }); }
        if (b.op === "deleteLink") { (l.files || []).forEach(f => { try { fs.unlinkSync(fileOf(l, f)); } catch (e) {} try { fs.unlinkSync(fileOf(l, f) + ".trim"); } catch (e) {} }); try { fs.rmdirSync(path.join(DIR, l.id)); } catch (e) {}
          L = load().filter(x => x !== l); save(); return J(res, 200, { ok: true }); }
      }
    } catch (e) { if (res.headersSent) return void res.destroy(); return J(res, e.status || 500, { ok: false, error: e.message || "Fehler" }); }
    return J(res, 404, { ok: false, error: "not_found" });
  }
  const count = () => load().filter(l => !l.deleted && l.lastAt && (!l.seenAt || l.lastAt > l.seenAt)).length;

  // ── Seite ──
  function page(title, body, script) {
    return '<!DOCTYPE html>\n<html lang="de">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n<title>' + escH(title) + ' | FS Creative</title>\n<meta name="robots" content="noindex, nofollow, noarchive" />\n<meta name="referrer" content="no-referrer" />\n<meta name="theme-color" content="#0a0a0f" />\n' +
      '<link rel="icon" type="image/png" sizes="48x48" href="/logos/favicon-f-48.png" />\n<link rel="icon" type="image/png" sizes="192x192" href="/logos/favicon-f-192.png" />\n<link rel="apple-touch-icon" href="/logos/favicon-f-180.png" />\n<style>' + CSS + '</style>\n</head>\n<body>\n<header class="up-top"><a href="/" class="up-brand"><img src="/logos/Logo%20Gl%C3%BChbirne%20Weiss.png" alt="" width="22" height="28"> FS Creative</a></header>\n<main id="main" class="up-wrap">' + body + '</main>\n' +
      '<footer class="up-foot">FS Creative · Simon Felder · Gaschurn · <a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a></footer>\n' + (script ? "<script>" + script + "</script>\n" : "") + '</body>\n</html>';
  }
  const CSS = ':root{--bg:#0a0a0f;--card:#14141b;--line:#2a2a35;--ink:#f5f5f7;--dim:#a1a1aa;--y:#ffe600;--ok:#30d158;--bad:#ff453a;color-scheme:dark}*{box-sizing:border-box}' +
    'body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;min-height:100vh;display:flex;flex-direction:column}' +
    '.up-top{padding:18px 20px;border-bottom:1px solid var(--line)}.up-brand{display:inline-flex;align-items:center;gap:10px;color:var(--ink);text-decoration:none;font-weight:700}' +
    '.up-wrap{flex:1;width:100%;max-width:760px;margin:0 auto;padding:32px 16px 48px}.up-card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px}' +
    'h1{font-size:clamp(24px,4vw,32px);letter-spacing:-.02em;margin:0 0 6px;line-height:1.2}.sub{color:var(--dim);margin:0 0 20px}.note{background:#1c1c25;border-left:3px solid var(--y);padding:10px 14px;border-radius:8px;margin:0 0 18px;white-space:pre-line}' +
    '.drop{display:grid;place-items:center;text-align:center;gap:6px;border:2px dashed #3a3a48;border-radius:16px;padding:40px 16px;cursor:pointer;transition:.15s;background:#101017}.drop:hover,.drop.on{border-color:var(--y);background:#17170f}' +
    '.drop b{font-size:18px}.drop small{color:var(--dim)}.drop svg{width:42px;height:42px;color:var(--y)}.drop input{position:absolute;width:1px;height:1px;opacity:0}' +
    '.btn{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:11px 20px;font:600 15px/1 inherit;font-family:inherit;cursor:pointer;background:var(--y);color:#111}.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}' +
    '.list{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:8px}.it{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:10px 14px;background:#101017;border:1px solid var(--line);border-radius:12px;font-size:14px}' +
    '.it b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.it .st{color:var(--dim);white-space:nowrap}.it.ok .st{color:var(--ok)}.it.bad .st{color:var(--bad)}.bar{grid-column:1/-1;height:6px;border-radius:3px;background:#262631;overflow:hidden}.bar i{display:block;height:100%;width:0;background:var(--y);transition:width .2s}.it.ok .bar i{background:var(--ok)}' +
    '.sum{margin-top:14px;color:var(--dim);font-size:14px}.msg{margin-top:22px;display:grid;gap:8px}.chat{display:grid;gap:8px;max-height:300px;overflow:auto;padding:2px}.cb{max-width:88%;justify-self:start;background:#1d1d27;border-radius:14px 14px 14px 4px;padding:8px 11px;font-size:14px;white-space:pre-line;overflow-wrap:anywhere}.cb.me{justify-self:end;background:#2b2a12;border-radius:14px 14px 4px 14px}.cb small{display:block;margin-top:3px;font-size:12px;color:var(--dim)}.cn{margin:0;color:var(--dim);font-size:14px}.msg textarea{width:100%;min-height:90px;border-radius:12px;border:1px solid var(--line);background:#101017;color:var(--ink);padding:10px 12px;font:inherit}' +
    '.fb{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 0 10px}.fbb{display:flex;gap:8px;flex-wrap:wrap}.btn.sm{padding:8px 14px;font-size:14px}.crumb{display:flex;flex-wrap:wrap;gap:4px;align-items:center;font-size:14px;color:var(--dim)}' +
    '.crumb button{background:none;border:0;color:var(--ink);font:inherit;cursor:pointer;padding:4px 6px;border-radius:6px}.crumb button:hover{background:#1c1c25}.crumb b{padding:4px 6px}.dirs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:0 0 12px}.dirs:empty{display:none}' +
    '.dir{display:flex;gap:8px;align-items:center;background:#101017;border:1px solid var(--line);border-radius:12px;padding:10px 12px;color:var(--ink);font:inherit;font-size:14px;cursor:pointer;text-align:left;overflow:hidden}.dir:hover{border-color:var(--y)}.dir span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.it small{color:var(--dim);font-weight:400}' +
    '[hidden]{display:none!important}a.btn{text-decoration:none}.od>*,.od-grid>*{min-width:0}.up-wrap:has(.od){max-width:1360px}.od{display:grid;gap:16px}.od-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:start}.od-head .sub{margin-bottom:0}.od-head .note{margin:14px 0 0}.kick{margin:0 0 4px;color:var(--y);font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}' +
    '.facts{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:14px;color:var(--dim)}.od-grid{display:grid;grid-template-columns:240px minmax(0,1fr) 300px;gap:16px;align-items:start}.od-grid .up-card{padding:16px}' +
    '.od-th{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.tr{display:flex;width:100%;gap:8px;align-items:center;background:none;border:0;border-radius:8px;padding:7px 10px;color:var(--ink);font:inherit;font-size:14px;cursor:pointer;text-align:left}.tr span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tr small{color:var(--dim)}.tr:hover,.tr.on{background:#1f1f2a}.tr.on{font-weight:600}.ic{width:20px;height:20px;flex:none}' +
    '.od-bar{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.crumb i{font-style:normal;color:var(--dim)}.selbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#1c1c25;border-radius:10px;padding:6px 10px;margin-bottom:8px;font-size:14px}.selbar span{margin-right:auto}' +
    '.srt{background:none;border:0;padding:0;font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;cursor:pointer}.srt.on{color:var(--fg,#fff);font-weight:700}.nm .cnt{display:block;font-size:11.5px;color:var(--dim);font-weight:400}' +
    '.rw{display:grid;grid-template-columns:22px minmax(0,1fr) 140px 80px 76px;gap:10px;align-items:center;padding:6px 8px;border-radius:10px;font-size:14px}.rw+.rw{border-top:1px solid #1f1f29}.rw:not(.hd):hover,.rw.on{background:#1a1a23}.rw.hd{color:var(--dim);font-size:12.5px;text-transform:uppercase;letter-spacing:.04em}' +
    '.rw input{width:16px;height:16px;accent-color:#ffe600}.nm{display:flex;gap:10px;align-items:center;min-width:0;color:var(--ink);text-decoration:none;background:none;border:0;padding:0;font:inherit;cursor:pointer;text-align:left}.nm span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nm em{font-style:normal;font-size:11.5px;color:#111;background:var(--y);border-radius:999px;padding:1px 7px;white-space:nowrap}' +
    '.mt{color:var(--dim);white-space:nowrap;font-size:13px}.ac{display:flex;gap:2px;justify-content:flex-end}.ib{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:8px;border:0;background:none;color:var(--dim);cursor:pointer}.ib:hover{background:#262631;color:var(--ink)}' +
    '.dz{outline:2px dashed var(--y)!important;outline-offset:-2px;background:#17170f!important}.dzt{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:50;background:var(--y);color:#111;font-weight:700;font-size:14px;padding:10px 16px;border-radius:999px;box-shadow:0 8px 30px #0008;pointer-events:none;max-width:92vw;text-align:center}' +
    '.empty{text-align:center;color:var(--dim);padding:48px 12px;border:2px dashed #2a2a35;border-radius:14px}.od-main.on .empty,.od-main.on{outline:2px dashed var(--y);outline-offset:-2px}.tr.on.on,.rw.on{outline:none}' +
    '.od-up h2{margin:0;font-size:18px}.tgt{margin:2px 0 12px;color:var(--dim);font-size:14px}.od-up .drop{padding:26px 12px}.ubtn{display:grid;gap:8px;margin-top:10px}.ubtn .btn{justify-content:center}.od-up .msg{margin-top:16px}' +
    '@media(max-width:1100px){.od-grid{grid-template-columns:220px minmax(0,1fr)}.od-up{grid-column:1/-1;order:-1}}@media(max-width:720px){.od-head{grid-template-columns:minmax(0,1fr)}.od-grid{grid-template-columns:minmax(0,1fr)}.od-up .tip{display:none}.rw{grid-template-columns:22px minmax(0,1fr) 64px 76px}.rw .d,.nm em{display:none}}' +
    '.up-foot{color:var(--dim);font-size:13px;text-align:center;padding:20px}.up-foot a{color:var(--dim)}.tip{color:var(--dim);font-size:13px;margin-top:14px}' +
    '.stand{display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-color:#ffe60066;background:linear-gradient(135deg,#1c1a08,#14141b 60%)}.stand h2{margin:0 0 4px;font-size:22px}.stand .sub{margin:0}.stand-a{display:flex;flex-direction:column;gap:8px;align-items:stretch}' +
    '.btn.big{font-size:19px;padding:18px 30px;justify-content:center;box-shadow:0 8px 30px #ffe60033}' +
    '.bk-ov{position:fixed;inset:0;z-index:50;background:radial-gradient(ellipse at center,#2a2a33,#08080b);display:flex;flex-direction:column}.bk-top{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 16px;flex-wrap:wrap}' +
    '.bk-main{flex:1;min-height:0;display:flex}.bk-main .bk-stage{flex:1;min-width:0}.bk-side{width:132px;flex:none;overflow-y:auto;padding:8px 10px 20px;display:grid;align-content:start;gap:10px;border-right:1px solid #ffffff14;scrollbar-width:thin}' +
    '.bk-th{display:grid;gap:3px;justify-items:center;background:none;border:0;padding:4px;border-radius:8px;cursor:pointer;color:var(--dim);font:inherit}.bk-th:hover{background:#ffffff10}.bk-th.on{background:#ffe60022;color:var(--y)}.bk-th.on .bk-thi{outline:2px solid var(--y)}' +
    '.bk-thi{display:block;width:100%;background:#fff;border-radius:2px;overflow:hidden;box-shadow:0 2px 8px #0008}.bk-thi img{display:block;width:100%;height:100%;object-fit:cover}.bk-th small{font-size:11.5px}.bk-sbt{display:none}' +
    '@media(max-width:760px){.bk-side{position:absolute;left:0;top:64px;bottom:70px;z-index:20;background:#101017f2;transform:translateX(-105%);transition:transform .25s}.bk-ov.side .bk-side{transform:none}.bk-sbt{display:inline-flex}.bk-main{position:relative}}' +
    '.bk-t{display:flex;flex-direction:column}.bk-t small{color:var(--dim)}.bk-a{display:flex;gap:8px;flex-wrap:wrap}.bk-stage{flex:1;min-height:0;display:grid;place-items:center;padding:8px;perspective:2600px}' +
    '.bk-book{position:relative;display:grid;grid-template-columns:1fr 1fr;cursor:pointer;transform-style:preserve-3d;user-select:none;transition:transform .8s cubic-bezier(.45,.05,.35,1)}.bk-l:not(.bk-empty),.bk-r:not(.bk-empty){box-shadow:0 30px 80px #000c}.bk-leaf .bk-f,.bk-leaf .bk-b{box-shadow:0 10px 40px #0006}.bk-book.one{grid-template-columns:1fr}.bk-book.one .bk-l{display:none}' +
    '.bk-l,.bk-r,.bk-f,.bk-b{background:#fff;overflow:hidden;position:relative}.bk-l.bk-empty,.bk-r.bk-empty{background:transparent}.bk-l img,.bk-r img,.bk-f img,.bk-b img{display:block;width:100%;height:100%;object-fit:contain}' +
    '.bk-book:not(.one) .bk-l:not(.bk-empty)::after{content:"";position:absolute;inset:0 0 0 auto;width:12%;background:linear-gradient(90deg,transparent,#0003)}.bk-book:not(.one) .bk-r:not(.bk-empty)::after{content:"";position:absolute;inset:0 auto 0 0;width:12%;background:linear-gradient(270deg,transparent,#0002)}' +
    '.bk-leaf{position:absolute;top:0;width:50%;height:100%;transform-style:preserve-3d;z-index:5;will-change:transform}.bk-leaf.fw{left:50%;transform-origin:left center}.bk-leaf.bw{left:0;transform-origin:right center}' +
    '.bk-leaf.one{width:100%;left:0}.bk-leaf.fw.go{animation:bkFw .95s cubic-bezier(.645,.045,.355,1) forwards}.bk-leaf.bw.go{animation:bkBw .95s cubic-bezier(.645,.045,.355,1) forwards}' +
    '@keyframes bkFw{0%{transform:rotateY(0)}45%{transform:rotateY(-80deg) skewY(-2deg) scaleX(.98)}100%{transform:rotateY(-180deg)}}@keyframes bkBw{0%{transform:rotateY(0)}45%{transform:rotateY(80deg) skewY(2deg) scaleX(.98)}100%{transform:rotateY(180deg)}}' +
    '.bk-f,.bk-b{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}.bk-b{transform:rotateY(180deg)}' +
    '.bk-f::after,.bk-b::after{content:"";position:absolute;inset:0;opacity:0;pointer-events:none}.bk-leaf.fw .bk-f::after{background:linear-gradient(90deg,#0008,#0002 35%,#0000 70%,#fff2)}.bk-leaf.bw .bk-f::after{background:linear-gradient(270deg,#0008,#0002 35%,#0000 70%,#fff2)}' +
    '.bk-leaf.fw .bk-b::after{background:linear-gradient(270deg,#0007,#0001 40%,#0000)}.bk-leaf.bw .bk-b::after{background:linear-gradient(90deg,#0007,#0001 40%,#0000)}' +
    '.bk-leaf.go .bk-f::after{animation:bkDark .95s cubic-bezier(.645,.045,.355,1) forwards}.bk-leaf.go .bk-b::after{animation:bkLight .95s cubic-bezier(.645,.045,.355,1) forwards}' +
    '@keyframes bkDark{0%{opacity:0}45%{opacity:1}100%{opacity:1}}@keyframes bkLight{0%,45%{opacity:1}100%{opacity:0}}' +
    '.bk-cast{position:absolute;inset:0;pointer-events:none;opacity:0;z-index:2}.bk-cast.fw.u{background:linear-gradient(90deg,#0009,#0003 25%,#0000 60%)}.bk-cast.bw.u{background:linear-gradient(270deg,#0009,#0003 25%,#0000 60%)}' +
    '.bk-cast.fw.l{background:linear-gradient(270deg,#0008,#0002 30%,#0000 65%)}.bk-cast.bw.l{background:linear-gradient(90deg,#0008,#0002 30%,#0000 65%)}' +
    '.bk-cast.u.go{animation:bkCastU .95s cubic-bezier(.645,.045,.355,1) forwards}.bk-cast.l.go{animation:bkCastL .95s cubic-bezier(.645,.045,.355,1) forwards}' +
    '@keyframes bkCastU{0%{opacity:.9}55%{opacity:.35}100%{opacity:0}}@keyframes bkCastL{0%,40%{opacity:0}80%{opacity:.85}100%{opacity:0}}' +
    '@media(prefers-reduced-motion:reduce){.bk-leaf.go{animation-duration:.01s!important}.bk-cast{display:none}}' +
    '.bk-load{position:absolute;inset:0;display:grid;place-items:center;color:#555;background:#fff}.bk-load a{color:#333}.bk-nav{display:flex;justify-content:center;align-items:center;gap:16px;padding:10px 16px 18px}.bk-nav .btn{font-size:22px;padding:8px 18px}.bk-nav .btn:disabled{opacity:.3;cursor:default}.bk-pg{color:var(--dim);font-size:14px;min-width:150px;text-align:center}' +
    '.bk-stage{overflow:hidden}.bk-wrap{transition:transform .9s cubic-bezier(.645,.045,.355,1)}.bk-pf{margin:0 auto;filter:drop-shadow(0 25px 50px #000a)}.bk-p{background:#fff;overflow:hidden}.bk-p img{display:block;width:100%;height:100%;object-fit:cover;user-select:none;-webkit-user-drag:none}' +
    '.bk-p img:not([src]){visibility:hidden}.stf__parent{margin:0 auto}.bk-pf{position:relative}.bk-wrap.moving .bk-pf::after{opacity:0}.bk-wrap.spread .bk-pf::after{transition:opacity .25s;content:"";position:absolute;top:0;bottom:0;left:50%;width:9%;transform:translateX(-50%);background:linear-gradient(90deg,#0000,#0000000d 30%,#0003 48%,#0000004d 50%,#0003 52%,#0000000d 70%,#0000);pointer-events:none;z-index:20}' +
    '@media(max-width:720px){.stand{flex-direction:column;align-items:stretch}.btn.big{width:100%}}';
  // Kunden-Seite wie OneDrive: oben Infos, links Ordner, Mitte Dateien (herunterladen/löschen), rechts Hochladen (Knopf, Auswahl oder Drag & Drop)
  /* eslint-disable */
  function upClient(D) {
    var B = "/upload/" + D.t, dirs = D.dirs.slice(), files = [], cur = "", sel = {}, Q = [], run = false, done = 0, dBytes = 0, $ = function (i) { return document.getElementById(i); };
    var FOLD = '<svg class="ic" viewBox="0 0 24 24" fill="#ffe600" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2h8.4A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
    var DOC = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" stroke-width="1.7" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';
    var DL = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/></svg>';
    var X = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14"/><path d="M10 7V4h4v3"/><path d="M7 7l1 13h8l1-13"/></svg>';
    function hb(n) { return n >= 1073741824 ? (n / 1073741824).toFixed(1).replace(".", ",") + " GB" : n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    function dt(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }); }
    function join(a, b) { return [a, b].filter(Boolean).join("/"); }
    function inDir(fd, d) { fd = fd || ""; return !d || fd === d || fd.indexOf(d + "/") === 0; }
    function kids(d) { var pre = d ? d + "/" : "", n = d ? d.split("/").length + 1 : 1; return dirs.filter(function (x) { return x.indexOf(pre) === 0 && x.split("/").length === n; }).sort(function (a, b) { return a.localeCompare(b, "de"); }); }
    function addDirs(d) { var p = String(d || "").split("/").filter(Boolean); for (var i = 1; i <= p.length; i++) { var x = p.slice(0, i).join("/"); if (dirs.indexOf(x) < 0) dirs.push(x); } }
    function short(d) { return d ? d.split("/").pop() : "Alle Dateien"; }
    function api(u, o) { return fetch(u, Object.assign({ credentials: "omit", headers: { "X-Upload": "1" } }, o)).then(function (r) { return r.json().catch(function () { return { ok: false, error: "HTTP " + r.status }; }).then(function (j) { j.status = r.status; return j; }); }); }
    function post(u, b) { return api(u, { method: "POST", headers: { "X-Upload": "1", "Content-Type": "application/json" }, body: JSON.stringify(b) }); }
    var lt = null; function reload(soon) { clearTimeout(lt); lt = setTimeout(function () { api(B + "/list").then(function (j) { if (!j.ok) return; files = j.files || []; dirs = j.dirs || dirs; draw(); if (j.msgs) chat(j.msgs); }); }, soon ? 600 : 0); }
    var chatN = -1; function chat(ms) { var c = document.getElementById("chat"); if (!c || ms.length === chatN) return; chatN = ms.length;
      c.innerHTML = ms.length ? ms.map(function (m) { var me = m.by !== "fs"; return '<div class="cb' + (me ? " me" : "") + '"><div>' + esc(m.text) + '</div><small>' + (me ? "Du" : "FS Creative") + " · " + new Date(m.at).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + "</small></div>"; }).join("") : '<p class="cn">Noch keine Nachrichten – schreib uns gern, was die Dateien sind oder was damit passieren soll.</p>';
      c.scrollTop = c.scrollHeight; }
    // links: Ordnerbaum
    function tree(d, lvl) { return kids(d).map(function (x) { var n = files.filter(function (f) { return inDir(f.dir, x); }).length;
      return '<button type="button" class="tr' + (x === cur ? " on" : "") + '" data-d="' + esc(x) + '" data-drop="' + esc(x) + '" style="padding-left:' + (10 + 16 * lvl) + 'px">' + FOLD + "<span>" + esc(short(x)) + "</span>" + (n ? "<small>" + n + "</small>" : "") + "</button>" + (inDir(cur, x) ? tree(x, lvl + 1) : ""); }).join(""); }
    // Sortierung (Simon 16.11.2026): nach Uploaddatum (Standard: neueste zuerst) oder Name; Ordner zeigen, wann darin zuletzt etwas dazukam
    var SO = "d-"; try { SO = localStorage.getItem("fsc-up-sort") || "d-"; } catch (e) {}
    function lastOf(x) { var m = ""; files.forEach(function (f) { if (inDir(f.dir, x) && f.at > m) m = f.at; }); return m; }
    function srt(a, b, ka, kb, na, nb) { var r = SO[0] === "n" ? na.localeCompare(nb, "de") : (ka < kb ? -1 : ka > kb ? 1 : na.localeCompare(nb, "de")); return SO[1] === "-" ? -r : r; }
    function hdBtn(k, t) { var on = SO[0] === k; return '<button type="button" class="srt' + (on ? " on" : "") + '" data-sort="' + k + '">' + t + (on ? (SO[1] === "-" ? " ↓" : " ↑") : "") + "</button>"; }
    function draw() {
      if (cur && dirs.indexOf(cur) < 0) cur = "";
      $("tree").innerHTML = '<button type="button" class="tr' + (cur ? "" : " on") + '" data-d="" data-drop="">' + FOLD + "<span>Alle Dateien</span>" + (files.length ? "<small>" + files.length + "</small>" : "") + "</button>" + tree("", 1);
      var p = cur ? cur.split("/") : [], c = '<button type="button" data-d="">Alle Dateien</button>';
      p.forEach(function (x, i) { c += '<i>›</i>' + (i === p.length - 1 ? "<b>" + esc(x) + "</b>" : '<button type="button" data-d="' + esc(p.slice(0, i + 1).join("/")) + '">' + esc(x) + "</button>"); });
      $("crumb").innerHTML = c;
      var ks = kids(cur).sort(function (a, b) { return srt(a, b, lastOf(a), lastOf(b), short(a), short(b)); }), fl = files.filter(function (f) { return (f.dir || "") === cur; }).sort(function (a, b) { return srt(a, b, a.at || "", b.at || "", a.name, b.name); }), any = files.some(function (f) { return inDir(f.dir, cur); });
      Object.keys(sel).forEach(function (k) { var v = k.slice(2); if (k[0] === "f" ? !fl.some(function (f) { return f.id === v; }) : ks.indexOf(v) < 0) delete sel[k]; });
      var rows = ks.map(function (x) { var fs = files.filter(function (f) { return inDir(f.dir, x); }), by = fs.reduce(function (a, f) { return a + f.size; }, 0);
        return '<div class="rw" data-drop="' + esc(x) + '"><input type="checkbox" aria-label="Ordner auswählen" data-sel="d:' + esc(x) + '"' + (sel["d:" + x] ? " checked" : "") + '><button type="button" class="nm" data-d="' + esc(x) + '">' + FOLD + "<span>" + esc(short(x)) + '<small class="cnt">' + fs.length + " Datei" + (fs.length === 1 ? "" : "en") + '</small></span></button><span class="mt d">' + (lastOf(x) ? dt(lastOf(x)) : "–") + '</span><span class="mt">' + (by ? hb(by) : "–") + '</span><span class="ac">' +
          (fs.length ? '<a class="ib" href="' + B + "/zip?dir=" + encodeURIComponent(x) + '" download title="Ordner herunterladen (ZIP)" aria-label="Ordner herunterladen">' + DL + "</a>" : "") + '<button type="button" class="ib" data-rm="d:' + esc(x) + '" title="Ordner löschen" aria-label="Ordner löschen">' + X + "</button></span></div>"; }).join("") +
        fl.map(function (f) { return '<div class="rw"><input type="checkbox" aria-label="Datei auswählen" data-sel="f:' + esc(f.id) + '"' + (sel["f:" + f.id] ? " checked" : "") + '><a class="nm" href="' + B + "/file?f=" + encodeURIComponent(f.id) + '" download title="' + esc(f.name) + '">' + DOC + "<span>" + esc(f.name) + "</span>" + (f.fs ? '<em>von FS Creative</em>' : "") + '</a><span class="mt d">' + dt(f.at) + '</span><span class="mt">' + hb(f.size) + '</span><span class="ac"><a class="ib" href="' + B + "/file?f=" + encodeURIComponent(f.id) + '" download title="Herunterladen" aria-label="Herunterladen">' + DL + '</a><button type="button" class="ib" data-rm="f:' + esc(f.id) + '" title="Löschen" aria-label="Löschen">' + X + "</button></span></div>"; }).join("");
      $("files").innerHTML = rows ? '<div class="rw hd"><input type="checkbox" id="all" aria-label="Alle auswählen"><span>' + hdBtn("n", "Name") + '</span><span class="mt d">' + hdBtn("d", "Hochgeladen") + '</span><span class="mt">Größe</span><span></span></div>' + rows
        : '<div class="empty">' + (cur ? "Dieser Ordner ist leer." : "Noch keine Dateien.") + "<br><small>Zieh Dateien oder ganze Ordner hierher oder nutze rechts „Hochladen“.</small></div>";
      var n = Object.keys(sel).length; $("selbar").hidden = !n; $("seln").textContent = n + " ausgewählt";
      $("zip").hidden = !any; $("zip").href = B + "/zip" + (cur ? "?dir=" + encodeURIComponent(cur) : ""); $("zipt").textContent = cur ? "Ordner herunterladen" : "Alles herunterladen";
      $("tgt").textContent = short(cur);
    }
    function rm(keys) {
      var fs = [], ds = [], cnt = 0; keys.forEach(function (k) { var v = k.slice(2); if (k[0] === "f") { fs.push(v); cnt++; } else { ds.push(v); cnt += files.filter(function (f) { return inDir(f.dir, v); }).length; } });
      var what = keys.length === 1 ? (keys[0][0] === "d" ? "den Ordner „" + short(keys[0].slice(2)) + "“" + (cnt ? " mit " + cnt + " Datei" + (cnt === 1 ? "" : "en") : "") : "„" + ((files.find(function (f) { return f.id === keys[0].slice(2); }) || {}).name || "Datei") + "“") : keys.length + " Einträge" + (cnt ? " (" + cnt + " Datei" + (cnt === 1 ? "" : "en") + ")" : "");
      if (!confirm("Wirklich " + what + " endgültig löschen? Das kann nicht rückgängig gemacht werden – auch nicht von FS Creative.")) return;
      post(B + "/delete", { files: fs, dirs: ds, confirm: true }).then(function (j) { if (!j.ok) { alert(j.error || "Fehler"); return; } sel = {}; files = files.filter(function (f) { return fs.indexOf(f.id) < 0 && !ds.some(function (d) { return inDir(f.dir, d); }); }); dirs = dirs.filter(function (x) { return !ds.some(function (d) { return inDir(x, d); }); }); draw(); reload(); });
    }
    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target : null; if (!t) return;
      var so = t.closest("[data-sort]"); if (so) { var k = so.getAttribute("data-sort"); SO = SO[0] === k ? k + (SO[1] === "-" ? "+" : "-") : k + (k === "d" ? "-" : "+"); try { localStorage.setItem("fsc-up-sort", SO); } catch (e2) {} draw(); return; }
      var b = t.closest("[data-d]"); if (b && !t.closest("[data-sel]")) { cur = b.getAttribute("data-d"); draw(); return; }
      var r = t.closest("[data-rm]"); if (r) { rm([r.getAttribute("data-rm")]); return; }
    });
    document.addEventListener("change", function (e) { var t = e.target;
      if (t.id === "all") { var c = t.checked; [].forEach.call(document.querySelectorAll("[data-sel]"), function (x) { x.checked = c; if (c) sel[x.getAttribute("data-sel")] = 1; else delete sel[x.getAttribute("data-sel")]; }); draw(); return; }
      if (t.getAttribute && t.getAttribute("data-sel")) { if (t.checked) sel[t.getAttribute("data-sel")] = 1; else delete sel[t.getAttribute("data-sel")]; draw(); } });
    $("seldel").addEventListener("click", function () { rm(Object.keys(sel)); });
    $("selnone").addEventListener("click", function () { sel = {}; draw(); });
    $("nd").addEventListener("click", function () { var n = (prompt("Name des neuen Ordners" + (cur ? " (in „" + short(cur) + "“)" : "")) || "").trim(); if (!n) return;
      post(B + "/mkdir", { dir: join(cur, n.replace(/[\/\\]+/g, "-")) }).then(function (j) { if (!j.ok) { alert(j.error || "Fehler"); return; } dirs = j.dirs || dirs; cur = j.dir; draw(); }); });
    // rechts: Hochladen in Stücken (Abbruch → macht beim letzten Stück weiter)
    function add(items) { items.forEach(function (x) { var f = x.f; if (!f.size) return; var li = document.createElement("li"); li.className = "it"; li.innerHTML = "<b>" + (x.dir ? "<small>" + esc(x.dir) + " / </small>" : "") + esc(f.name) + "</b><span class=st>wartet …</span><span class=bar><i></i></span>"; $("list").appendChild(li); Q.push({ f: f, dir: x.dir, li: li }); if (x.dir) addDirs(x.dir); }); draw(); upd(); next(); }
    function rel(f) { var r = f.webkitRelativePath || ""; return r.indexOf("/") > 0 ? r.slice(0, r.lastIndexOf("/")) : ""; }
    function upd() { var w = Q.length; $("sum").textContent = (done ? done + " Datei" + (done > 1 ? "en" : "") + " hochgeladen (" + hb(dBytes) + ")" : "") + (w ? (done ? " · " : "") + w + " in Arbeit" : ""); }
    function init(x) { return post(B + "/init", { name: x.f.name, size: x.f.size, type: x.f.type, dir: x.dir }); }
    function next() {
      if (run || !Q.length) { upd(); return; }
      run = true; var x = Q[0], st = x.li.querySelector(".st"), bar = x.li.querySelector("i"), tries = 0;
      function fail(m) { x.li.className = "it bad"; st.textContent = m; Q.shift(); run = false; next(); }
      function show(g) { bar.style.width = (100 * g / x.f.size).toFixed(1) + "%"; st.textContent = Math.floor(100 * g / x.f.size) + " % · " + hb(g) + " von " + hb(x.f.size); }
      init(x).then(function (j) {
        if (!j.ok) { fail(j.error || "Fehler"); return; }
        var id = j.id, CH = j.chunk || 16777216, g = j.got || 0; show(g);
        (function put() {
          if (g >= x.f.size) { x.li.className = "it ok"; st.textContent = "Fertig ✓ " + hb(x.f.size); bar.style.width = "100%"; done++; dBytes += x.f.size; Q.shift(); run = false; reload(true); next(); return; }
          var end = Math.min(x.f.size, g + CH);
          fetch(B + "/chunk?f=" + id + "&o=" + g, { method: "PUT", credentials: "omit", headers: { "X-Upload": "1", "Content-Type": "application/octet-stream" }, body: x.f.slice(g, end) })
            .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (j) { j.status = r.status; return j; }); })
            .then(function (j) { if (j.ok) { tries = 0; g = j.got; show(g); put(); return; } if (j.status === 410 || j.status === 404 || j.status === 507) { fail(j.error || "Fehler"); return; } retry(); }).catch(retry);
          function retry() { if (++tries > 8) { fail("Verbindung unterbrochen – Datei bitte erneut auswählen (macht dort weiter)"); return; } st.textContent = "Verbindung … neuer Versuch " + tries;
            setTimeout(function () { init(x).then(function (k) { if (k.ok) { id = k.id; g = k.got; } put(); }).catch(put); }, Math.min(30000, 1500 * tries * tries)); }
        })();
      }).catch(function () { fail("Keine Verbindung – bitte erneut versuchen"); });
    }
    $("fi").addEventListener("change", function () { var fi = $("fi"); add([].map.call(fi.files, function (f) { return { f: f, dir: cur }; })); fi.value = ""; });
    $("fd").addEventListener("change", function () { var fd = $("fd"); add([].map.call(fd.files, function (f) { return { f: f, dir: join(cur, rel(f)) }; })); fd.value = ""; });
    // Drag & Drop: auf das Hochlade-Feld, die Dateiliste oder direkt auf einen Ordner (links oder in der Liste); ganze Ordner behalten ihre Struktur
    function walk(en, dir, out) {
      return new Promise(function (res) {
        if (en.isFile) { en.file(function (f) { out.push({ f: f, dir: dir }); res(); }, function () { res(); }); return; }
        if (!en.isDirectory) { res(); return; }
        var d = join(dir, en.name), r = en.createReader(), all = []; out.push({ mk: d });
        (function more() { r.readEntries(function (es) { if (!es.length) { Promise.all(all.map(function (x) { return walk(x, d, out); })).then(res); return; } all = all.concat([].slice.call(es)); more(); }, function () { res(); }); })();
      });
    }
    // Ziel beim Ziehen (Simon 18.11.2026): Standard ist immer der gerade offene Ordner. In einen Unterordner der Liste nur, wenn man
    // bewusst ~1 s auf ihm verweilt (wie am Mac); die Ordner links im Baum nehmen sofort an. Ein Hinweis zeigt immer das Ziel.
    var aim = null, pend = null, since = 0, DWELL = 1000;
    function nameOf(d) { return d ? short(d) : "Alle Dateien"; }
    function pick(e) {
      var el = e.target.closest && e.target.closest("[data-drop]"), main = e.target.closest && e.target.closest(".od-drop");
      if (el && el.classList.contains("rw")) {
        if (pend !== el) { pend = el; since = Date.now(); }
        if (Date.now() - since < DWELL) el = null;
      } else pend = null;
      if (el) return { el: el, dir: el.getAttribute("data-drop") };
      if (main || pend) { var m = document.querySelector(".od-main"); return { el: m, dir: cur }; }
      return null;
    }
    function hasFiles(e) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0; }
    var hot = null, tip = null;
    function heat(t) {
      var el = t && t.el; if (hot && hot !== el) hot.classList.remove("dz"); hot = el; if (el) el.classList.add("dz");
      if (!tip) { tip = document.createElement("div"); tip.className = "dzt"; document.body.appendChild(tip); }
      tip.hidden = !t; if (t) tip.textContent = "Loslassen zum Ablegen in: " + nameOf(t.dir) + (pend && t.el !== pend ? "  ·  kurz auf dem Ordner halten, um hineinzulegen" : "");
    }
    document.addEventListener("dragover", function (e) { if (!hasFiles(e)) return; e.preventDefault(); var t = pick(e); aim = t ? t.dir : null; heat(t); e.dataTransfer.dropEffect = t ? "copy" : "none"; });
    document.addEventListener("dragleave", function (e) { if (!e.relatedTarget) { heat(null); aim = null; pend = null; } });
    document.addEventListener("drop", function (e) {
      if (!hasFiles(e)) return; e.preventDefault(); var to = aim; heat(null); aim = null; pend = null; if (to == null) return;
      var dt = e.dataTransfer, ens = dt.items && dt.items.length && dt.items[0].webkitGetAsEntry ? [].map.call(dt.items, function (i) { return i.webkitGetAsEntry && i.webkitGetAsEntry(); }).filter(Boolean) : null;
      if (!ens || !ens.some(function (x) { return x.isDirectory; })) { add([].map.call(dt.files || [], function (f) { return { f: f, dir: to }; })); return; }
      var out = []; Promise.all(ens.map(function (x) { return walk(x, to, out); })).then(function () {
        out.filter(function (o) { return o.mk; }).forEach(function (o) { addDirs(o.mk); post(B + "/mkdir", { dir: o.mk }); });
        add(out.filter(function (o) { return o.f; }));
      });
    });
    window.addEventListener("beforeunload", function (e) { if (Q.length) { e.preventDefault(); e.returnValue = ""; } });
    $("ms").addEventListener("click", function () { var t = $("mt").value.trim(), o = $("mo"); if (!t) { o.textContent = "Bitte zuerst eine Nachricht schreiben."; return; }
      post(B + "/note", { text: t }).then(function (j) { o.textContent = j.ok ? "Gesendet ✓" : (j.error || "Fehler"); if (j.ok) { $("mt").value = ""; if (j.msgs) chat(j.msgs); } }); });
    draw(); reload(); setInterval(function () { if (!Q.length && document.visibilityState === "visible") reload(); }, 20000);   // 20 s: Antworten von FS Creative erscheinen bald
  }
  // Buchansicht mit Papierphysik (Simon 18.11.2026): StPageFlip (page-flip 2.0.7) – Seiten biegen sich von der Ecke, Schatten laufen stufenlos mit,
  // Ecken lassen sich mit Maus/Finger ziehen. pdf.js rendert die Seiten (nur die nahen, scharf auf Retina). Titel- und letzte Seite allein in der Mitte.
  function bookClient(D) {
    var ov = null, pdf = null, pf = null, n = 0, cur = 0, IM = {}, TH = {}, ratio = 0.7071, land = true, pgW = 400, thObs = null;
    function load(src, test) { return new Promise(function (res, rej) { if (test()) return res(); var sc = document.createElement("script"); sc.src = src; sc.onload = function () { res(); }; sc.onerror = rej; document.head.appendChild(sc); }); }
    function lib() { return load("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", function () { return !!window.pdfjsLib; }).then(function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; return window.pdfjsLib; }); }
    function flipLib() { return load("https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js", function () { return !!(window.St && window.St.PageFlip); }); }
    function render(i, w, q) { return pdf.getPage(i).then(function (pg) { var v0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: w / v0.width }), c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); return pg.render({ canvasContext: x, viewport: vp }).promise.then(function () { return c.toDataURL("image/jpeg", q); }); }); }
    function img(i) { if (i < 1 || i > n) return Promise.resolve(""); if (!IM[i]) IM[i] = render(i, Math.min(2200, Math.max(500, pgW * (window.devicePixelRatio || 1) * 1.1)), 0.88); return IM[i]; }
    function thumb(i) { if (!TH[i]) TH[i] = render(i, 220, 0.8); return TH[i]; }
    function shown() { if (!land) return [cur + 1]; if (cur === 0) return [1]; var a = cur % 2 ? cur : cur - 1; return [a + 1, a + 2].filter(function (p) { return p <= n; }); }   // Doppelseiten 2–3, 4–5 …
    function fill() { var p = shown(), lo = Math.max(1, p[0] - 3), hi = Math.min(n, p[p.length - 1] + 4);
      for (var i = lo; i <= hi; i++) (function (i) { img(i).then(function (u) { var el = ov && ov.querySelector('.bk-p[data-p="' + i + '"] img'); if (el && el.getAttribute("src") !== u) el.src = u; }); })(i); }
    function place(open) { var w = ov.querySelector(".bk-wrap"), p = shown(), x = 0; if (land && p.length === 1 && !open) x = p[0] === 1 ? -25 : 25; if (w) { w.style.transform = "translateX(" + x + "%)"; w.classList.toggle("spread", land && (p.length === 2 || !!open)); } }
    function label() { var p = shown(); ov.querySelector(".bk-pg").textContent = "Seite " + p.join("–") + " von " + n; ov.querySelector(".bk-prev").disabled = cur <= 0; ov.querySelector(".bk-next").disabled = p[p.length - 1] >= n; }
    function update() { label(); place(); fill(); sideMark(); }
    function sideBuild() { var sd = ov.querySelector(".bk-side"), h = ""; for (var i = 1; i <= n; i++) h += '<button type="button" class="bk-th" data-pg="' + i + '" aria-label="Seite ' + i + '"><span class="bk-thi" style="aspect-ratio:' + ratio + '"></span><small>' + i + "</small></button>";
      sd.innerHTML = h; if (thObs) thObs.disconnect();
      thObs = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (!e.isIntersecting) return; var b = e.target; thObs.unobserve(b); thumb(+b.getAttribute("data-pg")).then(function (u) { var im = b.querySelector(".bk-thi"); if (im) im.innerHTML = '<img src="' + u + '" alt="">'; }); }); }, { root: sd, rootMargin: "300px" }) : null;
      [].forEach.call(sd.querySelectorAll(".bk-th"), function (b) { if (thObs) thObs.observe(b); else thumb(+b.getAttribute("data-pg")).then(function (u) { b.querySelector(".bk-thi").innerHTML = '<img src="' + u + '" alt="">'; }); }); }
    function sideMark() { var sd = ov && ov.querySelector(".bk-side"); if (!sd) return; var p = shown(), first = null;
      [].forEach.call(sd.querySelectorAll(".bk-th"), function (b) { var on = p.indexOf(+b.getAttribute("data-pg")) > -1; b.classList.toggle("on", on); if (on && !first) first = b; });
      if (first) { var r = first.getBoundingClientRect(), R = sd.getBoundingClientRect(); if (r.top < R.top || r.bottom > R.bottom) sd.scrollTop += r.top - R.top - R.height / 2 + r.height / 2; } }
    function build() {   // (neu) aufbauen – auch nach Größenänderung, Position bleibt
      if (pf) { try { pf.destroy(); } catch (e) {} pf = null; }
      var st = ov.querySelector(".bk-stage"), W = st.clientWidth - 24, H = st.clientHeight - 24; land = window.innerWidth > 760;
      pgW = Math.floor(Math.max(120, Math.min(land ? W / 2 : W, H * ratio))); var pgH = Math.floor(pgW / ratio);
      st.innerHTML = '<div class="bk-wrap"><div class="bk-pf" style="width:' + (land ? 2 * pgW : pgW) + "px;height:" + pgH + 'px"></div></div>';
      var box = st.querySelector(".bk-pf"), els = [];
      for (var i = 1; i <= n; i++) { var d = document.createElement("div"); d.className = "bk-p"; d.setAttribute("data-p", i); d.innerHTML = '<img alt="Seite ' + i + '" draggable="false">'; els.push(d); }
      pf = new window.St.PageFlip(box, { width: pgW, height: pgH, size: "fixed", showCover: true, usePortrait: !land, drawShadow: true, maxShadowOpacity: 0.55, flippingTime: 900, mobileScrollSupport: false, swipeDistance: 25, showPageCorners: true, startPage: Math.min(cur, n - 1), autoSize: false });
      pf.loadFromHTML(els);
      pf.on("flip", function (e) { cur = +e.data || 0; update(); });
      pf.on("changeState", function (e) { var w = ov && ov.querySelector(".bk-wrap"), mv = e.data === "flipping" || e.data === "user_fold" || e.data === "fold_corner";
        if (w) w.classList.toggle("moving", mv);   // Bundschatten weg, solange ein Blatt in Bewegung ist – sonst läge er als Falte über der Seite
        if (mv) { if (shown().length === 1) place(true); } else if (e.data === "read") place(); });   // Buch gleitet schon beim Anfassen in die Mitte
      pf.on("changeOrientation", function () { land = pf.getOrientation ? pf.getOrientation() === "landscape" : land; update(); });
      cur = pf.getCurrentPageIndex ? pf.getCurrentPageIndex() : cur; update();
    }
    function go(i) { if (!pf) return; var t = Math.max(0, Math.min(n - 1, i - 1)); if (shown().indexOf(i) > -1) return; pf.flip(t, "top"); if (window.innerWidth <= 760) ov.classList.remove("side"); }
    function open() {
      if (ov) return; document.documentElement.style.overflow = "hidden";
      ov = document.createElement("div"); ov.className = "bk-ov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Aktueller Stand");
      ov.innerHTML = '<div class="bk-top"><div class="bk-t"><b>' + D.title + '</b><small>Stand: ' + D.at + '</small></div><div class="bk-a"><a class="btn sm" href="' + D.u + '" target="_blank" rel="noopener">🖨 Drucken (Druckqualität)</a><a class="btn ghost sm" href="' + D.dl + '" download>⤓ PDF</a><button type="button" class="btn ghost sm bk-x" aria-label="Schließen">✕</button></div></div>' +
        '<div class="bk-main"><nav class="bk-side" aria-label="Seitenübersicht"></nav><div class="bk-stage"><div class="bk-load">Seiten werden geladen …</div></div></div>' +
        '<div class="bk-nav"><button type="button" class="btn ghost sm bk-sbt" aria-label="Seitenübersicht">☰ Seiten</button><button type="button" class="btn ghost bk-prev" aria-label="Zurückblättern">‹</button><span class="bk-pg"></span><button type="button" class="btn ghost bk-next" aria-label="Weiterblättern">›</button></div>';
      document.body.appendChild(ov);
      ov.querySelector(".bk-x").onclick = close; ov.querySelector(".bk-prev").onclick = function () { if (pf) pf.flipPrev("top"); }; ov.querySelector(".bk-next").onclick = function () { if (pf) pf.flipNext("top"); };
      ov.querySelector(".bk-sbt").onclick = function () { ov.classList.toggle("side"); };
      ov.querySelector(".bk-side").addEventListener("click", function (e) { var b = e.target.closest(".bk-th"); if (b) go(+b.getAttribute("data-pg")); });
      Promise.all([lib().then(function (L) { return L.getDocument({ url: D.u }).promise; }), flipLib()]).then(function (r) { pdf = r[0]; n = pdf.numPages; return pdf.getPage(1); })
        .then(function (pg) { var v = pg.getViewport({ scale: 1 }); ratio = v.width / v.height; sideBuild(); build(); })
        .catch(function () { var st = ov && ov.querySelector(".bk-stage"); if (st) st.innerHTML = '<div class="bk-load">Vorschau nicht möglich – <a href="' + D.u + '" target="_blank" rel="noopener">PDF direkt öffnen</a></div>'; });
    }
    function close() { if (!ov) return; if (thObs) thObs.disconnect(); thObs = null; if (pf) { try { pf.destroy(); } catch (e) {} } pf = null; ov.remove(); ov = null; pdf = null; IM = {}; TH = {}; cur = 0; document.documentElement.style.overflow = ""; if (location.hash === "#stand") history.replaceState(null, "", location.pathname + location.search); }
    document.addEventListener("keydown", function (e) { if (!ov || !pf) { if (ov && e.key === "Escape") close(); return; } if (e.key === "Escape") close(); else if (e.key === "ArrowRight") pf.flipNext("top"); else if (e.key === "ArrowLeft") pf.flipPrev("top"); });
    var rt = 0; window.addEventListener("resize", function () { if (!ov || !pf) return; clearTimeout(rt); rt = setTimeout(function () { IM = {}; build(); }, 250); });
    [].forEach.call(document.querySelectorAll("[data-book]"), function (b) { b.addEventListener("click", function (e) { e.preventDefault(); open(); }); });
    if (location.hash === "#stand") open();
  }
  function standHtml(l) {
    const st = standOf(l); if (!st) return "";
    const B = "/upload/" + l.token + "/file?f=" + encodeURIComponent(st.id);
    return '<section class="up-card stand"><div><p class="kick">Aktueller Stand</p><h2>' + escH(l.title) + '</h2><p class="sub">Stand: <b>' + escH(viennaTime(st.at)) + "</b></p></div>" +
      '<div class="stand-a"><a class="btn big" href="' + B + '&inline=1" data-book>📖 Aktuellen Stand ansehen</a><a class="btn ghost sm" href="' + B + '&inline=1" target="_blank" rel="noopener">🖨 PDF in Druckqualität drucken</a></div></section>';
  }
  function uploadPage(l) {
    const UP ='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 19.5h15"/></svg>';
    const body = '<div class="od">' +
      '<section class="up-card od-head"><div><p class="kick">FS Cloud · Geteilter Ordner</p><h1>' + escH(l.title) + '</h1><p class="sub">Hier tauschen wir Dateien aus – ohne Anmeldung, beliebig viele und beliebig große Dateien. Du kannst alles hochladen, herunterladen und auch wieder löschen.</p>' +
      (l.note ? '<p class="note">' + escH(l.note) + "</p>" : "") + '</div><ul class="facts"><li>🔒 Nur mit diesem Link erreichbar – bitte nicht öffentlich teilen</li><li>📁 Ordner anlegen und ganze Ordner hochladen</li><li>⤓ Einzeln oder alles als ZIP herunterladen</li></ul></section>' + standHtml(l) +
      '<div class="od-grid">' +
      '<aside class="up-card od-tree"><div class="od-th"><b>Ordner</b><button class="btn ghost sm" type="button" id="nd">+ Neuer Ordner</button></div><nav id="tree" aria-label="Ordner"></nav></aside>' +
      '<section class="up-card od-main od-drop"><div class="od-bar"><nav class="crumb" id="crumb" aria-label="Pfad"></nav><a class="btn ghost sm" id="zip" download hidden>⤓ <span id="zipt">Alles herunterladen</span></a></div>' +
      '<div class="selbar" id="selbar" hidden><span id="seln"></span><button class="btn ghost sm" type="button" id="seldel">Auswahl löschen</button><button class="btn ghost sm" type="button" id="selnone">Auswahl aufheben</button></div><div id="files" aria-live="polite"></div></section>' +
      '<aside class="up-card od-up"><h2>Hochladen</h2><p class="tgt">nach: <b id="tgt">Alle Dateien</b></p>' +
      '<label class="drop od-drop" id="drop"><input type="file" id="fi" multiple>' + UP + '<b>Dateien hierher ziehen</b><small>oder klicken zum Auswählen</small></label>' +
      '<div class="ubtn"><label class="btn">Dateien auswählen<input type="file" id="fi2" multiple hidden></label><label class="btn ghost">Ordner auswählen<input type="file" id="fd" webkitdirectory multiple hidden></label></div>' +
      '<ul class="list" id="list"></ul><p class="sum" id="sum"></p><p class="tip">Lass das Fenster offen, bis alles „Fertig“ zeigt. Bricht die Verbindung ab, wähle die Datei erneut – es geht dort weiter, wo es aufgehört hat.</p>' +
      '<div class="msg"><label for="mt"><b>Nachrichten mit FS Creative</b></label><div class="chat" id="chat" aria-live="polite"></div><textarea id="mt" maxlength="2000" placeholder="z. B. was die Dateien sind oder was damit passieren soll"></textarea><div><button class="btn ghost sm" type="button" id="ms">Nachricht senden</button> <span id="mo" style="color:var(--dim);font-size:14px"></span></div></div></aside>' +
      '</div></div>';
    const st = standOf(l), stB = st ? "/upload/" + l.token + "/file?f=" + encodeURIComponent(st.id) : "";
    const js = (st ? "(" + bookClient.toString() + ")(" + JSON.stringify({ u: stB + "&inline=1", dl: stB, title: escH(l.title), at: escH(viennaTime(st.at)) }).replace(/</g, "\\u003c") + ");" : "") +
      "(" + upClient.toString() + ")(" + JSON.stringify({ t: l.token, dirs: pubDirs(l) }).replace(/</g, "\\u003c") + ");document.getElementById('fi2').addEventListener('change',function(){var a=document.getElementById('fi'),b=this;try{a.files=b.files;a.dispatchEvent(new Event('change'));}catch(e){}b.value='';});";
    return page("Dateien – " + l.title, body, js);
  }

  return { handlePublic, handleAdmin, count, _load: load };
};
