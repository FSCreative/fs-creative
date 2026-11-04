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
  const log = (...a) => console.log("[Uploads]", ...a);
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

  function summary(l) {
    const files = (l.files || []).filter(f => !f.deleted);
    return { id: l.id, token: l.token, url: D.ORIGIN + "/upload/" + l.token, title: l.title, customer: l.customer, email: l.email, note: l.note, createdAt: l.createdAt, expires: l.expires || "", active: l.active !== false, open: open(l),
      lastAt: l.lastAt || "", msgs: (l.msgs || []).slice(-20), seenAt: l.seenAt || "", count: files.filter(f => f.done).length, bytes: files.filter(f => f.done).reduce((a, f) => a + f.size, 0),
      files: files.map(f => ({ id: f.id, name: f.name, size: f.size, got: f.got, done: !!f.done, at: f.at, doneAt: f.doneAt || "" })).reverse() };
  }
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
      if (D.push) D.push("lead", { title: "Upload: " + l.title, body: fresh.length + " Datei" + (fresh.length === 1 ? "" : "en") + " (" + human(bytes) + ") hochgeladen" + (fresh.length <= 3 ? ": " + fresh.map(f => f.name).join(", ") : ""), url: "/admin#uploads", tag: "upload-" + l.id }).catch(() => {});
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

  // ── öffentliche Seite + Upload ──
  async function handlePublic(req, res, u, p) {
    const ip = clientIp(req);
    const m = p.match(/^\/upload\/([A-Za-z0-9_-]{32})(\/init|\/chunk|\/note)?\/?$/);
    const l = m && byToken(m[1]);
    if (!m || !l || l.deleted) return html(req, res, 404, page("Link ungültig", '<div class="up-card"><h1>Link ungültig</h1><p class="sub">Dieser Upload-Link ist ungültig. Bitte frag bei FS Creative nach einem neuen Link.</p></div>'));
    if (!m[2]) {
      if (req.method !== "GET" && req.method !== "HEAD") return J(res, 405, { ok: false, error: "method_not_allowed" });
      if (!open(l)) return html(req, res, 410, page("Upload geschlossen", '<div class="up-card"><h1>Upload geschlossen</h1><p class="sub">Für „' + escH(l.title) + '“ können keine Dateien mehr hochgeladen werden. Bitte melde dich bei FS Creative, falls noch etwas fehlt.</p></div>'));
      return html(req, res, 200, uploadPage(l));
    }
    if (req.method !== "POST" && req.method !== "PUT") return J(res, 405, { ok: false, error: "method_not_allowed" });
    if (!sameOrigin(req)) { req.resume(); return J(res, 403, { ok: false, error: "forbidden" }); }
    if (!open(l)) { req.resume(); return J(res, 410, { ok: false, error: "Dieser Upload-Link ist geschlossen." }); }
    try {
      if (m[2] === "/init") {
        if (limited("upinit", ip, 2000, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Dateien auf einmal – bitte später weiter" });
        const b = await readJson(req, 4000), size = Math.floor(+b.size);
        if (!(size > 0)) return J(res, 400, { ok: false, error: "Leere Datei" });
        const free = freeBytes(); if (free != null && free - size < MIN_FREE) { log("Speicher fast voll –", human(free), "frei"); return J(res, 507, { ok: false, error: "Der Speicher ist gerade voll – bitte kurz bei FS Creative melden." }); }
        const name = safeName(b.name);
        // gleiche Datei (Name + Größe), noch nicht fertig → dort fortsetzen
        let f = (l.files || []).find(x => !x.deleted && !x.done && x.name === name && x.size === size);
        if (!f) { f = { id: "f" + rnd(10), name, size, type: clip(b.type, 100), got: 0, done: false, at: nowIso() }; l.files = l.files || []; l.files.push(f); try { fs.mkdirSync(path.join(DIR, l.id), { recursive: true }); fs.writeFileSync(fileOf(l, f), ""); } catch (e) { throw Object.assign(new Error("Speichern nicht möglich"), { status: 500 }); } save(); }
        else { try { f.got = fs.statSync(fileOf(l, f)).size; } catch (e) { f.got = 0; fs.writeFileSync(fileOf(l, f), ""); } }
        return J(res, 200, { ok: true, id: f.id, got: f.got, chunk: CHUNK });
      }
      if (m[2] === "/chunk") {
        if (limited("upchunk", ip, 20000, 3600e3)) { req.resume(); return J(res, 429, { ok: false, error: "Zu viele Anfragen – bitte kurz warten" }); }
        const f = (l.files || []).find(x => x.id === String(u.searchParams.get("f") || "") && !x.deleted);
        if (!f) { req.resume(); return J(res, 404, { ok: false, error: "Datei unbekannt – bitte neu auswählen" }); }
        if (f.done) { req.resume(); return J(res, 200, { ok: true, got: f.size, done: true }); }
        if (BUSY.has(f.id)) { req.resume(); return J(res, 409, { ok: false, error: "busy" }); }
        BUSY.add(f.id);
        try {
          const r = await appendChunk(req, l, f, parseInt(u.searchParams.get("o") || "-1", 10));
          if (f.got >= f.size) { f.done = true; f.doneAt = nowIso(); l.lastAt = f.doneAt; save(); notify(l); log("Datei fertig:", l.title, "·", f.name, "·", human(f.size)); }
          else save(true);
          return J(res, 200, { ok: true, got: f.got, done: !!f.done });
        } finally { BUSY.delete(f.id); }
      }
      if (m[2] === "/note") {   // optionale Nachricht zum Upload
        if (limited("upnote", ip, 30, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Nachrichten" });
        const b = await readJson(req, 8000), t = clip(b.text, 2000).trim(); if (!t) return J(res, 400, { ok: false, error: "Leer" });
        l.msgs = (l.msgs || []).concat([{ at: nowIso(), text: t, name: clip(b.name, 100).trim() }]).slice(-50); l.lastAt = nowIso(); save();
        if (D.push) D.push("lead", { title: "Upload-Nachricht: " + l.title, body: t.slice(0, 200), url: "/admin#uploads", tag: "upmsg-" + l.id }).catch(() => {});
        return J(res, 200, { ok: true });
      }
    } catch (e) { return J(res, e.status || 500, { ok: false, error: e.status ? e.message : "Fehler beim Hochladen" }); }
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
        const fp = fileOf(l, f); let st; try { st = fs.statSync(fp); } catch (e) { return J(res, 404, { ok: false, error: "Datei fehlt auf dem Speicher" }); }
        res.writeHead(200, Object.assign({}, SEC, { "Content-Type": "application/octet-stream", "Content-Length": String(st.size), "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(f.name) }));
        return void fs.createReadStream(fp).pipe(res);
      }
      if (p === "/admin/api/uploads/zip" && req.method === "GET") {   // alle fertigen Dateien eines Links als ZIP (ohne Kompression, gestreamt)
        const l = byId(String(u.searchParams.get("link") || "")); if (!l) return J(res, 404, { ok: false, error: "Nicht gefunden" });
        const files = (l.files || []).filter(f => f.done && !f.deleted), total = files.reduce((a, f) => a + f.size, 0);
        if (!files.length) return J(res, 404, { ok: false, error: "Noch keine Dateien" });
        if (total > ZIP_MAX) return J(res, 413, { ok: false, error: "Zusammen über 3,8 GB – bitte einzeln herunterladen" });
        const { Zip, ZipPassThrough } = require("fflate");
        res.writeHead(200, Object.assign({}, SEC, { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(safeName(l.title) + ".zip") }));
        const zip = new Zip((err, chunk, final) => { if (err) { log("ZIP:", err.message); return res.destroy(); } res.write(Buffer.from(chunk)); if (final) res.end(); });
        const used = {};
        for (const f of files) {
          let nm = f.name; if (used[nm]) { const e = path.extname(nm); nm = nm.slice(0, nm.length - e.length) + " (" + (++used[f.name]) + ")" + e; } else used[nm] = 1;
          const entry = new ZipPassThrough(nm); zip.add(entry);
          await new Promise((resolve, reject) => { const rs = fs.createReadStream(fileOf(l, f));
            rs.on("data", c => { entry.push(c); if (res.writableLength > 32 * 1024 * 1024) { rs.pause(); res.once("drain", () => rs.resume()); } });
            rs.on("end", () => { entry.push(new Uint8Array(0), true); resolve(); }); rs.on("error", reject); });
        }
        zip.end(); return;
      }
      if (req.method !== "POST") return J(res, 405, { ok: false, error: "method_not_allowed" });
      const b = await readJson(req, 20000);
      if (p === "/admin/api/uploads") {
        if (b.op === "create") { const l = create(b); return J(res, 200, { ok: true, link: summary(l) }); }
        const l = byId(String(b.id || "")); if (!l) return J(res, 404, { ok: false, error: "Nicht gefunden" });
        if (b.op === "update") { if (b.title != null && clip(b.title, 120).trim()) l.title = clip(b.title, 120).trim(); if (b.note != null) l.note = clip(b.note, 600).trim(); if (b.active != null) l.active = !!b.active;
          if (b.days != null) { const d = parseInt(b.days, 10) || 0; l.expires = d > 0 ? new Date(Date.now() + Math.min(365, d) * 864e5).toISOString() : ""; } save(); return J(res, 200, { ok: true, link: summary(l) }); }
        if (b.op === "seen") { l.seenAt = nowIso(); save(true); return J(res, 200, { ok: true }); }
        // Löschen nur auf ausdrücklichen Klick im Cockpit (mit Rückfrage)
        if (b.confirm !== true) return J(res, 400, { ok: false, error: "Bestätigung fehlt" });
        if (b.op === "deleteFile") { const f = (l.files || []).find(x => x.id === String(b.file || "")); if (!f) return J(res, 404, { ok: false, error: "Datei nicht gefunden" });
          try { fs.unlinkSync(fileOf(l, f)); } catch (e) {} f.deleted = nowIso(); save(); return J(res, 200, { ok: true, link: summary(l) }); }
        if (b.op === "deleteLink") { (l.files || []).forEach(f => { try { fs.unlinkSync(fileOf(l, f)); } catch (e) {} }); try { fs.rmdirSync(path.join(DIR, l.id)); } catch (e) {}
          L = load().filter(x => x !== l); save(); return J(res, 200, { ok: true }); }
      }
    } catch (e) { return J(res, e.status || 500, { ok: false, error: e.message || "Fehler" }); }
    return J(res, 404, { ok: false, error: "not_found" });
  }
  const count = () => load().filter(l => !l.deleted && l.lastAt && (!l.seenAt || l.lastAt > l.seenAt)).length;

  // ── Seite ──
  function page(title, body, script) {
    return '<!DOCTYPE html>\n<html lang="de">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n<title>' + escH(title) + ' | FS Creative</title>\n<meta name="robots" content="noindex, nofollow, noarchive" />\n<meta name="referrer" content="no-referrer" />\n<meta name="theme-color" content="#0a0a0f" />\n' +
      '<link rel="icon" type="image/png" href="/logos/Logo%20Gl%C3%BChbirne%20Weiss.png" />\n<style>' + CSS + '</style>\n</head>\n<body>\n<header class="up-top"><a href="/" class="up-brand"><img src="/logos/Logo%20Gl%C3%BChbirne%20Weiss.png" alt="" width="22" height="28"> FS Creative</a></header>\n<main id="main" class="up-wrap">' + body + '</main>\n' +
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
    '.sum{margin-top:14px;color:var(--dim);font-size:14px}.msg{margin-top:22px;display:grid;gap:8px}.msg textarea{width:100%;min-height:90px;border-radius:12px;border:1px solid var(--line);background:#101017;color:var(--ink);padding:10px 12px;font:inherit}' +
    '.up-foot{color:var(--dim);font-size:13px;text-align:center;padding:20px}.up-foot a{color:var(--dim)}.tip{color:var(--dim);font-size:13px;margin-top:14px}';
  function uploadPage(l) {
    const body = '<div class="up-card"><h1>Dateien hochladen</h1><p class="sub">für <b>' + escH(l.title) + '</b> · an FS Creative (Simon Felder)</p>' + (l.note ? '<p class="note">' + escH(l.note) + "</p>" : "") +
      '<label class="drop" id="drop"><input type="file" id="fi" multiple><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 19.5h15"/></svg><b>Dateien hierher ziehen</b><small>oder klicken, um Dateien auszuwählen – beliebig viele, jede Größe, alle Formate</small></label>' +
      '<ul class="list" id="list" aria-live="polite"></ul><p class="sum" id="sum"></p>' +
      '<p class="tip">Tipp: Lass dieses Fenster offen, bis alle Dateien „Fertig“ zeigen. Bricht die Verbindung ab, wähle die Datei einfach erneut – der Upload macht dort weiter, wo er aufgehört hat.</p>' +
      '<div class="msg"><label for="mt"><b>Nachricht an FS Creative</b> <span style="color:var(--dim)">(optional)</span></label><textarea id="mt" maxlength="2000" placeholder="z. B. was die Dateien sind oder was damit passieren soll"></textarea><div><button class="btn ghost" type="button" id="ms">Nachricht senden</button> <span id="mo" style="color:var(--dim);font-size:14px"></span></div></div></div>';
    const T = JSON.stringify(l.token);
    const js = '(function(){var T=' + T + ',B="/upload/"+T,Q=[],run=false,done=0,dBytes=0,list=document.getElementById("list"),sum=document.getElementById("sum"),drop=document.getElementById("drop"),fi=document.getElementById("fi");' +
      'function hb(n){return n>=1073741824?(n/1073741824).toFixed(1).replace(".",",")+" GB":n>=1048576?(n/1048576).toFixed(1).replace(".",",")+" MB":Math.max(1,Math.round(n/1024))+" KB";}' +
      'function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c];});}' +
      'function add(files){[].forEach.call(files,function(f){if(!f.size){return;}var li=document.createElement("li");li.className="it";li.innerHTML="<b>"+esc(f.name)+"</b><span class=st>wartet …</span><span class=bar><i></i></span>";list.appendChild(li);Q.push({f:f,li:li});});upd();next();}' +
      'function upd(){var w=Q.length;sum.textContent=(done?done+" Datei"+(done>1?"en":"")+" fertig ("+hb(dBytes)+")":"")+(w?(done?" · ":"")+w+" in Arbeit":"");}' +
      'function api(u,o){return fetch(u,Object.assign({credentials:"omit",headers:{"X-Upload":"1"}},o)).then(function(r){return r.json().catch(function(){return{ok:false,error:"HTTP "+r.status};}).then(function(j){j.status=r.status;return j;});});}' +
      'function next(){if(run||!Q.length){upd();return;}run=true;var x=Q[0],st=x.li.querySelector(".st"),bar=x.li.querySelector("i"),tries=0,t0=Date.now();' +
      'function fail(m){x.li.className="it bad";st.textContent=m;Q.shift();run=false;next();}' +
      'function show(g){bar.style.width=(100*g/x.f.size).toFixed(1)+"%";var s=(Date.now()-t0)/1000;st.textContent=Math.floor(100*g/x.f.size)+" % · "+hb(g)+" von "+hb(x.f.size);}' +
      'api(B+"/init",{method:"POST",headers:{"X-Upload":"1","Content-Type":"application/json"},body:JSON.stringify({name:x.f.name,size:x.f.size,type:x.f.type})}).then(function(j){if(!j.ok){fail(j.error||"Fehler");return;}var id=j.id,CH=j.chunk||16777216,g=j.got||0;show(g);' +
      '(function put(){if(g>=x.f.size){x.li.className="it ok";st.textContent="Fertig ✓ "+hb(x.f.size);bar.style.width="100%";done++;dBytes+=x.f.size;Q.shift();run=false;next();return;}' +
      'var end=Math.min(x.f.size,g+CH);fetch(B+"/chunk?f="+id+"&o="+g,{method:"PUT",credentials:"omit",headers:{"X-Upload":"1","Content-Type":"application/octet-stream"},body:x.f.slice(g,end)}).then(function(r){return r.json().catch(function(){return{ok:false};}).then(function(j){j.status=r.status;return j;});})' +
      '.then(function(j){if(j.ok){tries=0;g=j.got;show(g);put();return;}if(j.status===410||j.status===404||j.status===507){fail(j.error||"Fehler");return;}retry();}).catch(retry);' +
      'function retry(){if(++tries>8){fail("Verbindung unterbrochen – Datei bitte erneut auswählen (macht dort weiter)");return;}st.textContent="Verbindung … neuer Versuch "+tries;setTimeout(function(){api(B+"/init",{method:"POST",headers:{"X-Upload":"1","Content-Type":"application/json"},body:JSON.stringify({name:x.f.name,size:x.f.size,type:x.f.type})}).then(function(k){if(k.ok){id=k.id;g=k.got;}put();}).catch(put);},Math.min(30000,1500*tries*tries));}})();' +
      '}).catch(function(){fail("Keine Verbindung – bitte erneut versuchen");});}' +
      'fi.addEventListener("change",function(){add(fi.files);fi.value="";});' +
      '["dragenter","dragover"].forEach(function(e){drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.add("on");});});["dragleave","drop"].forEach(function(e){drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.remove("on");});});' +
      'drop.addEventListener("drop",function(ev){if(ev.dataTransfer&&ev.dataTransfer.files)add(ev.dataTransfer.files);});' +
      'window.addEventListener("beforeunload",function(e){if(Q.length){e.preventDefault();e.returnValue="";}});' +
      'document.getElementById("ms").addEventListener("click",function(){var t=document.getElementById("mt").value.trim(),o=document.getElementById("mo");if(!t){o.textContent="Bitte zuerst eine Nachricht schreiben.";return;}' +
      'api(B+"/note",{method:"POST",headers:{"X-Upload":"1","Content-Type":"application/json"},body:JSON.stringify({text:t})}).then(function(j){o.textContent=j.ok?"Danke – Nachricht ist angekommen ✓":(j.error||"Fehler");if(j.ok)document.getElementById("mt").value="";});});})();';
    return page("Dateien hochladen – " + l.title, body, js);
  }

  return { handlePublic, handleAdmin, count, _load: load };
};
