// Zero-dependency static server for FS Creative.
// Serves files from this directory and falls back to index.html (SPA routing).
// Handles macOS NFD vs NFC filename normalization (e.g. umlauts like ü).
// Zusätzlich: geschützter Admin-Bereich unter /admin (Dashboard mit Live-Daten).
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
// Build-Kennung: ändert sich bei jedem Deploy -> Client erkennt neue Version und lädt sich einmal neu.
const BUILD = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_DEPLOYMENT_ID || String(Date.now());

// Persistenter Speicher (Railway-Volume unter /data, sonst ROOT als Fallback).
const DATA_DIR = (() => { try { fs.mkdirSync("/data", { recursive: true }); return "/data"; } catch (e) { return ROOT; } })();
const TODOS_FILE = path.join(DATA_DIR, "todos.json");
function readTodos() { try { const a = JSON.parse(fs.readFileSync(TODOS_FILE, "utf8")); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function writeTodos(arr) { try { fs.writeFileSync(TODOS_FILE, JSON.stringify(Array.isArray(arr) ? arr : [])); return true; } catch (e) { return false; } }
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
// 3-Wege-Merge (per id): Server-Stand S, Basis B (was der Client zuletzt vom Server kannte), Client-Stand C.
// Verhindert, dass ein Gerät Änderungen eines anderen Geräts überschreibt.
function merge3(S, B, C) {
  S = Array.isArray(S) ? S : []; C = Array.isArray(C) ? C : [];
  const byId = a => { const m = new Map(); a.forEach(x => { if (x && x.id != null) m.set(String(x.id), x); }); return m; };
  const sm = byId(S), cm = byId(C);
  if (!Array.isArray(B)) { const out = S.slice(); C.forEach(x => { if (x && x.id != null && !sm.has(String(x.id))) out.push(x); }); return out; }
  const bm = byId(B); const out = [];
  S.forEach(sv => {
    if (!sv || sv.id == null) { out.push(sv); return; }
    const id = String(sv.id), b = bm.get(id), c = cm.get(id);
    if (b && !c) return;                                                        // am Client gelöscht
    if (c && (!b || JSON.stringify(c) !== JSON.stringify(b))) { out.push(c); return; } // am Client geändert
    out.push(sv);                                                               // unverändert -> Server-Stand
  });
  C.forEach(c => { if (c && c.id != null && !sm.has(String(c.id)) && !bm.has(String(c.id))) out.push(c); }); // am Client neu
  return out;
}
function readEvents() { try { const a = JSON.parse(fs.readFileSync(EVENTS_FILE, "utf8")); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function writeEvents(arr) { try { fs.writeFileSync(EVENTS_FILE, JSON.stringify(Array.isArray(arr) ? arr : [])); return true; } catch (e) { return false; } }

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const ORIGIN = "https://www.fs-creative.at";
const CANON_HOST = "www.fs-creative.at";

const ROUTE_META = {
  "/": ["Webdesign Montafon & Vorarlberg | FS Creative", "Webdesign aus dem Montafon: FS Creative baut schnelle Websites, Online-Shops & Buchungsplattformen für Betriebe in Vorarlberg & Tirol. Gratis Entwurf anfragen."],
  "/blitzdings": ["Blitzdings — Fotobox & 360°-Videobooth | FS Creative", "Blitzdings: Fotobox und 360°-Videobooth für Events im Montafon und ganz Vorarlberg. Jetzt Verfügbarkeit prüfen und buchen."],
  "/valuero": ["VALUERO — Tourismusplattform & Hosting im Montafon | FS Creative", "VALUERO ist die Tourismusplattform für das Hochmontafon — plus Hosting-Service für Ferienwohnungen: Website, Buchungsportal und Marketing."],
  "/kochdu": ["kochdu — Essen bestellen im Montafon | FS Creative", "kochdu ist die Bestell- und Lieferplattform für Restaurants im Montafon. Auch für Gastronomen: einfach anmelden und mitmachen."],
  "/kantineur": ["Kantineur — Kantinen-Kasse für Vereinsheime | FS Creative", "Kantineur: die digitale Strichliste für Vereinsheime, Feuerwehrhäuser und Firmenküchen in Österreich. SB-Kasse am Tablet, Abrechnung am Handy. 14 Tage frei testen."],
  "/referenzen": ["Referenzen — Websites & Plattformen | FS Creative", "Referenzen von FS Creative: Websites und Plattformen aus dem Montafon — Blitzdings, VALUERO, kochdu, La Taverna, Ortsfeuerwehr Gaschurn, Spenglerei Flöry u. v. m."],
  "/ueber-uns": ["Über uns — FS Creative aus dem Montafon", "Lerne FS Creative kennen: Kreativ- und Digitalagentur aus Gaschurn im Montafon, gegründet von Simon Felder."],
  "/kontakt": ["Kontakt & Gratis-Entwurf anfragen | FS Creative", "Projekt anfragen bei FS Creative aus Gaschurn: kurzes Formular ausfüllen, Antwort in 1–2 Werktagen und auf Wunsch ein kostenloser, unverbindlicher Entwurf."],
  "/datenschutz": ["Datenschutzerklärung — FS Creative", "Datenschutzerklärung von FS Creative: keine Cookies, kein Tracking, keine Google Fonts. Google Maps wird nur nach ausdrücklicher Einwilligung geladen."],
  "/impressum": ["Impressum — FS Creative", "Impressum von FS Creative (Simon Leonhard Felder), Dorfstraße 3/1, 6793 Gaschurn. Offenlegung gemäß § 5 ECG und § 25 Mediengesetz."],
};

const NOINDEX_ROUTES = { "/empfehlungen": true, "/paketshop": true };

// Öffentlich ausgeliefert werden nur Website-Dateien — nie Server-Code, Admin-Vorlage oder Projektdateien.
const PUBLIC_EXT = { ".html": 1, ".css": 1, ".png": 1, ".jpg": 1, ".jpeg": 1, ".webp": 1, ".gif": 1, ".svg": 1, ".ico": 1, ".pdf": 1, ".woff2": 1, ".txt": 1, ".xml": 1, ".webmanifest": 1 };
const PRIVATE_FILES = { "server.js": 1, "admin-dashboard.html": 1, "admin-cockpit.html": 1, "package.json": 1, "package-lock.json": 1 };
function isPublicFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  if (!rel || rel.split(path.sep).some(s => s.charAt(0) === ".") || rel.split(path.sep)[0] === "admin-cockpit") return false;
  if (PRIVATE_FILES[rel.normalize("NFC")]) return false;
  return !!PUBLIC_EXT[path.extname(rel).toLowerCase()];
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function setAttrValue(html, re, value) {
  return html.replace(re, function (m, p1, p2) { return p1 + value + p2; });
}

function renderIndex(baseHtml, route) {
  const meta = ROUTE_META[route];
  const noindex = !!NOINDEX_ROUTES[route];
  const known = !!meta || noindex;
  const url = ORIGIN + (route === "/" ? "/" : route);
  let html = baseHtml;
  if (meta) {
    const title = esc(meta[0]);
    const desc = esc(meta[1]);
    html = html.replace(/<title>[\s\S]*?<\/title>/, "<title>" + title + "</title>");
    html = setAttrValue(html, /(<meta name="description" content=")[^"]*(")/, desc);
    html = setAttrValue(html, /(<meta property="og:title" content=")[^"]*(")/, title);
    html = setAttrValue(html, /(<meta property="og:description" content=")[^"]*(")/, desc);
    html = setAttrValue(html, /(<meta name="twitter:title" content=")[^"]*(")/, title);
    html = setAttrValue(html, /(<meta name="twitter:description" content=")[^"]*(")/, desc);
  }
  if (known) {
    html = setAttrValue(html, /(<link rel="canonical" href=")[^"]*(")/, url);
    html = setAttrValue(html, /(<meta property="og:url" content=")[^"]*(")/, url);
  }
  if (!meta) {
    html = setAttrValue(html, /(<meta name="robots" content=")[^"]*(")/, "noindex, follow");
  }
  return { html: html, status: known ? 200 : 404 };
}

const zlib = require("zlib");
function sendGz(req, res, status, body, type, headers) {
  const ae = String(req.headers["accept-encoding"] || "");
  if (/\bgzip\b/.test(ae) && body && body.length > 1024) {
    const gz = zlib.gzipSync(Buffer.isBuffer(body) ? body : Buffer.from(String(body)), { level: 6 });
    res.writeHead(status, Object.assign({ "Content-Type": type || "text/plain; charset=utf-8", "Content-Encoding": "gzip", "Vary": "Accept-Encoding" }, headers || {}));
    return res.end(gz);
  }
  return send(res, status, body, type, headers);
}
// ---- ZIP (ohne Abhängigkeiten, "stored" – Anhänge sind meist schon komprimiert) ----
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function crc32(buf) { if (typeof zlib.crc32 === "function") return zlib.crc32(buf) >>> 0; let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8"); const data = f.data; const crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, name, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat(parts.concat(central, [end]));
}
function send(res, status, body, type, headers) {
  res.writeHead(status, Object.assign({ "Content-Type": type || "text/plain; charset=utf-8" }, headers || {}));
  res.end(body);
}
const COMPRESSIBLE = { ".html": 1, ".css": 1, ".js": 1, ".json": 1, ".svg": 1, ".xml": 1, ".txt": 1, ".webmanifest": 1 };
function serveFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (e, data) => {
    if (e) return send(res, 500, "Server error");
    // HTML immer frisch prüfen; Bilder, Fonts und CSS dürfen im Browser zwischengespeichert werden.
    const cache = ext === ".html" ? "no-cache" : (ext === ".css" ? "public, max-age=86400" : (COMPRESSIBLE[ext] ? "public, max-age=3600" : "public, max-age=604800"));
    if (COMPRESSIBLE[ext]) return sendGz(req, res, 200, data, TYPES[ext], { "Cache-Control": cache });
    send(res, 200, data, TYPES[ext] || "application/octet-stream", { "Cache-Control": cache });
  });
}

// ===========================================================================
// ADMIN-BEREICH  /admin
// ===========================================================================
const ADMIN_PW = process.env.ADMIN_PASSWORD || "";
const ADMIN_SECRET = process.env.ADMIN_AUTH_SECRET || "bitte-ADMIN_AUTH_SECRET-setzen";
const KANTINEUR = { url: process.env.KANTINEUR_STATS_URL || "https://kantineur.at/api/stats", token: process.env.KANTINEUR_STATS_TOKEN || "" };
const MAIL = { url: process.env.MAIL_API_URL || "", token: process.env.MAIL_API_TOKEN || "" };
const BLITZ = { url: process.env.BLITZDINGS_STATS_URL || "https://blitzdings.co.at/api/stats", token: process.env.BLITZDINGS_STATS_TOKEN || "" };
const KOCHDU = { url: process.env.KOCHDU_STATS_URL || "https://kochdu.at/api/stats", token: process.env.KOCHDU_STATS_TOKEN || "" };
// VALUERO: Gebühren pro Objekt (Antonhaus über valuero-stats, Alpinappart über /api/fees).
const ANTONHAUS = { url: process.env.ANTONHAUS_STATS_URL || "https://antonhaus.at/api/valuero-stats", token: process.env.ANTONHAUS_STATS_TOKEN || "" };
const ALPINAPPART = { url: process.env.ALPINAPPART_FEES_URL || "https://www.alpinappart.at/api/fees", key: process.env.ALPINAPPART_FEES_KEY || "" };
// Cloudflare: Zonen (= aktive Websites) + Insights
const CF = { token: process.env.CF_API_TOKEN || "" };

function hmac(v) { return crypto.createHmac("sha256", ADMIN_SECRET).update(v).digest("hex"); }
function sign(v) { return v + "." + hmac(v); }
function verify(tok) {
  if (!tok) return false;
  const i = tok.lastIndexOf("."); if (i < 0) return false;
  const v = tok.slice(0, i), sig = tok.slice(i + 1), exp = hmac(v);
  if (sig.length !== exp.length) return false;
  try { if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return false; } catch (e) { return false; }
  return v === "ok";
}
function parseCookies(req) {
  const out = {}; const c = req.headers.cookie || "";
  c.split(";").forEach(p => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function adminAuthed(req) { return verify(parseCookies(req)["fsadmin"] || ""); }

// Kurzzeit-Cache (25 s): mehrere offene Tabs/Polls lösen nicht jeweils eigene Abrufe bei den Plattformen aus.
const JSON_MEMO = new Map();
// Nach Änderungen (Verrechnen, Bezahlt) die zwischengespeicherten Statistiken dieser Plattform verwerfen
function forgetStats(baseUrl) { for (const k of Array.from(JSON_MEMO.keys())) if (k.indexOf(baseUrl) === 0) JSON_MEMO.delete(k); if (typeof COCKPIT_MEMO !== "undefined") COCKPIT_MEMO.at = 0; }
async function getJSON(url) {
  const hit = JSON_MEMO.get(url);
  if (hit && Date.now() - hit.at < 25000) return hit.p;
  const p = (async () => {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
    try { const r = await fetch(url, { signal: ctrl.signal }); if (!r.ok) return null; return await r.json(); }
    catch (e) { return null; } finally { clearTimeout(t); }
  })();
  JSON_MEMO.set(url, { at: Date.now(), p });
  if (JSON_MEMO.size > 200) { const now = Date.now(); for (const [k, v] of JSON_MEMO) if (now - v.at > 60000) JSON_MEMO.delete(k); }
  return p;
}
function yearParam(year) { return year ? "&year=" + encodeURIComponent(year) : ""; }
async function kantineurStats(year) {
  if (!KANTINEUR.token) return null;
  const d = await getJSON(KANTINEUR.url + "?token=" + encodeURIComponent(KANTINEUR.token) + yearParam(year));
  if (!d || d.error) return null;
  return {
    fetchedAt: d.fetchedAt,
    revenueGrossCents: (d.revenue && d.revenue.grossCents) || 0,
    revenueNetCents: (d.revenue && d.revenue.netCents) || 0,
    thisMonthGrossCents: (d.revenue && d.revenue.thisMonthGrossCents) || 0,
    mrrCents: d.mrrCents || 0,
    subscribers: d.subscribers || { active: 0, paying: 0, sponsored: 0, byPlan: {} },
    canteens: d.canteens || { total: 0, byStatus: {} },
  };
}
// Mail-Snapshot mit ETag: unverändert -> 304 (fast kein Traffic). Max. alle 20 s ein Abruf.
let MAIL_SNAP = { at: 0, etag: "", data: null, p: null };
async function mailSnapshot() {
  if (!MAIL.url || !MAIL.token) return null;
  if (MAIL_SNAP.data && Date.now() - MAIL_SNAP.at < 5000) return MAIL_SNAP.data;   // kurz puffern; Nachfragen sind dank ETag/304 billig
  if (MAIL_SNAP.p) return MAIL_SNAP.p;
  MAIL_SNAP.p = (async () => {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const headers = MAIL_SNAP.etag && MAIL_SNAP.data ? { "If-None-Match": MAIL_SNAP.etag } : {};
      const r = await fetch(MAIL.url + "?token=" + encodeURIComponent(MAIL.token), { headers, signal: ctrl.signal });
      if (r.status === 304 && MAIL_SNAP.data) { MAIL_SNAP.at = Date.now(); return MAIL_SNAP.data; }
      if (!r.ok) return MAIL_SNAP.data;
      const d = await r.json(); if (!d || d.error || d.warming) return MAIL_SNAP.data;
      MAIL_SNAP.data = d; MAIL_SNAP.etag = r.headers.get("etag") || d.etag || ""; MAIL_SNAP.at = Date.now();
      return d;
    } catch (e) { return MAIL_SNAP.data; } finally { clearTimeout(t); MAIL_SNAP.p = null; }
  })();
  return MAIL_SNAP.p;
}
// Privates Railway-Netz nutzen (kostenlos, schneller) statt über das öffentliche Internet.
(async () => {
  if (!MAIL.url || /railway\.internal/.test(MAIL.url)) return;
  const internal = process.env.MAIL_API_INTERNAL || "http://mail-api.railway.internal:8080/api/mails";
  for (let i = 0; i < 5; i++) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(internal.replace(/\/api\/mails.*$/, "/api/health"), { signal: ctrl.signal }); clearTimeout(t);
      if (r.ok) { console.log("mail-api via privates Netz:", internal); MAIL.url = internal; return; }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 5000));
  }
  console.log("mail-api: privates Netz nicht erreichbar, nutze öffentliche URL");
})();
async function blitzdingsStats(year) {
  if (!BLITZ.token) return null;
  const d = await getJSON(BLITZ.url + "?token=" + encodeURIComponent(BLITZ.token) + yearParam(year));
  if (!d || d.error) return null;
  return d;
}
async function kochduStats(year) {
  if (!KOCHDU.token) return null;
  const d = await getJSON(KOCHDU.url + "?token=" + encodeURIComponent(KOCHDU.token) + yearParam(year));
  if (!d || d.error) return null;
  return d;
}
// VALUERO: beide Objekte abrufen und zu einem einheitlichen Format zusammenführen.
async function valueroStats(year) {
  const objects = [];
  // Antonhaus (valuero-stats: provisionCents + months[{month,provisionCents,bookings}])
  if (ANTONHAUS.token) {
    const d = await getJSON(ANTONHAUS.url + "?token=" + encodeURIComponent(ANTONHAUS.token) + yearParam(year));
    if (d && d.ok) {
      objects.push({
        key: "antonhaus", name: "Antonhaus", ratesLabel: "5 % Website",
        provisionCents: d.provisionCents || 0, feeBookings: d.feeBookings || 0,
        months: (d.months || []).map(m => ({ month: m.month, provisionCents: m.provisionCents || 0, bookings: m.bookings || 0 })),
      });
    }
  }
  // Alpinappart (/api/fees: totals.fees + byMonth[{month,count,revenue,fees}])
  if (ALPINAPPART.key) {
    const d = await getJSON(ALPINAPPART.url + "?key=" + encodeURIComponent(ALPINAPPART.key) + (year ? "&year=" + encodeURIComponent(year) : ""));
    if (d && d.totals) {
      objects.push({
        key: "alpinappart", name: "Alpinappart", ratesLabel: "5 % Website · 2,5 % Booking",
        provisionCents: Math.round((d.totals.fees || 0) * 100), feeBookings: d.totals.count || 0,
        months: (d.byMonth || []).map(m => ({ month: m.month, provisionCents: Math.round((m.fees || 0) * 100), bookings: m.count || 0 })),
      });
    }
  }
  if (!objects.length) return null;
  return { fetchedAt: new Date().toISOString(), objects };
}
// ── Privater Kalender: iCloud (CalDAV) – lesen & schreiben, in beide Richtungen ──
// Zugangsdaten (Apple-ID + App-spezifisches Passwort + gewählter Kalender) liegen im Volume unter /data/icloud.json
// (oder per ENV: ICLOUD_USER / ICLOUD_PASS / ICLOUD_CAL_URL / ICLOUD_CAL_NAME).
const ICLOUD_FILE = path.join(DATA_DIR, "icloud.json");
function icloudCfg() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(ICLOUD_FILE, "utf8")) || {}; } catch (e) {}
  return {
    user: c.user || process.env.ICLOUD_USER || "",
    pass: c.pass || process.env.ICLOUD_PASS || "",
    calUrl: c.calUrl || process.env.ICLOUD_CAL_URL || "",
    calName: c.calName || process.env.ICLOUD_CAL_NAME || "",
    calColor: c.calColor || "",
  };
}
function icloudSave(c) { try { fs.writeFileSync(ICLOUD_FILE, JSON.stringify(c), { mode: 0o600 }); return true; } catch (e) { return false; } }
function icloudClear() { try { fs.unlinkSync(ICLOUD_FILE); } catch (e) {} }

async function dav(method, url, { user, pass, body, depth, headers } = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const h = Object.assign({ Authorization: "Basic " + Buffer.from(user + ":" + pass).toString("base64") }, headers || {});
    if (body && !h["Content-Type"]) h["Content-Type"] = "application/xml; charset=utf-8";
    if (depth != null) h.Depth = String(depth);
    const r = await fetch(url, { method, headers: h, body, signal: ctrl.signal, redirect: "follow" });
    const text = await r.text();
    return { status: r.status, text, etag: r.headers.get("etag") || "", url: r.url || url };
  } finally { clearTimeout(t); }
}
function xmlTag(block, name) { const m = block.match(new RegExp("<(?:[\\w-]+:)?" + name + "\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?" + name + ">", "i")); return m ? m[1] : ""; }
function xmlHref(block, name) { const inner = xmlTag(block, name); const m = inner.match(/<(?:[\w-]+:)?href[^>]*>([^<]+)</i); return m ? m[1].trim() : ""; }
function xmlResponses(text) { return text.split(/<(?:[\w-]+:)?response[\s>]/i).slice(1); }
function xmlUnesc(s) { return String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#13;/g, "\r").replace(/&#10;/g, "\n").replace(/&amp;/g, "&"); }
function absUrl(base, href) { try { return new URL(href, base).toString(); } catch (e) { return href; } }

async function icloudDiscover(user, pass) {
  const root = "https://caldav.icloud.com/";
  const r1 = await dav("PROPFIND", root, { user, pass, depth: 0, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>' });
  if (r1.status === 401 || r1.status === 403) { const e = new Error("login_failed"); e.code = "login_failed"; throw e; }
  const principal = xmlHref(r1.text, "current-user-principal");
  if (!principal) throw new Error("principal_not_found (" + r1.status + ")");
  const pUrl = absUrl(r1.url || root, principal);
  const r2 = await dav("PROPFIND", pUrl, { user, pass, depth: 0, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>' });
  const home = xmlHref(r2.text, "calendar-home-set");
  if (!home) throw new Error("calendar_home_not_found (" + r2.status + ")");
  const hUrl = absUrl(r2.url || pUrl, home);
  const r3 = await dav("PROPFIND", hUrl, { user, pass, depth: 1, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><a:calendar-color/><d:current-user-privilege-set/></d:prop></d:propfind>' });
  const cals = [];
  for (const blk of xmlResponses(r3.text)) {
    const href = (blk.match(/<(?:[\w-]+:)?href[^>]*>([^<]+)</i) || [])[1];
    const rt = xmlTag(blk, "resourcetype");
    if (!href || !/calendar/i.test(rt)) continue;
    const comps = xmlTag(blk, "supported-calendar-component-set");
    if (comps && !/VEVENT/i.test(comps)) continue;       // nur Termin-Kalender (keine Erinnerungen)
    const priv = xmlTag(blk, "current-user-privilege-set");
    const writable = !priv || /<(?:[\w-]+:)?(write|write-content|all)\s*\/?>/i.test(priv);
    cals.push({ url: absUrl(hUrl, href.trim()), name: xmlUnesc(xmlTag(blk, "displayname")).trim() || "Kalender", color: (xmlTag(blk, "calendar-color").trim() || "").slice(0, 7), writable, shared: /shared/i.test(rt) });
  }
  return cals;
}

// ---- ICS lesen ----
function icsUnfold(s) { return String(s || "").replace(/\r?\n[ \t]/g, ""); }
function icsUnesc(s) { return String(s || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\"); }
function icsEsc(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
function icsProps(block) {
  const props = {};
  block.split(/\r?\n/).forEach(line => {
    const m = line.match(/^([A-Z0-9-]+)((?:;[^:]*)?):(.*)$/i); if (!m) return;
    const name = m[1].toUpperCase(); const params = {};
    (m[2] || "").split(";").filter(Boolean).forEach(p => { const i = p.indexOf("="); if (i > 0) params[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, ""); });
    (props[name] = props[name] || []).push({ value: m[3], params });
  });
  return props;
}
const TZ = "Europe/Vienna";
function viennaParts(d) {
  const f = new Intl.DateTimeFormat("de-AT", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const o = {}; f.formatToParts(d).forEach(p => { o[p.type] = p.value; });
  return { date: o.year + "-" + o.month + "-" + o.day, time: (o.hour === "24" ? "00" : o.hour) + ":" + o.minute };
}
// Wiener Ortszeit -> UTC-Date
function viennaToUtc(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split("-").map(Number); const [h, mi] = (timeStr || "00:00").split(":").map(Number);
  let guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  for (let i = 0; i < 2; i++) { const p = viennaParts(guess); const shown = Date.UTC(+p.date.slice(0, 4), +p.date.slice(5, 7) - 1, +p.date.slice(8, 10), +p.time.slice(0, 2), +p.time.slice(3, 5)); guess = new Date(guess.getTime() - (shown - Date.UTC(y, mo - 1, d, h, mi))); }
  return guess;
}
function icsParseDate(p) {
  if (!p) return null;
  const v = p.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const date = m[1] + "-" + m[2] + "-" + m[3];
  if (!m[4] || (p.params.VALUE || "").toUpperCase() === "DATE") return { date, time: "", allDay: true, ms: Date.UTC(+m[1], +m[2] - 1, +m[3]) };
  if (m[7]) { const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))); const vp = viennaParts(d); return { date: vp.date, time: vp.time, allDay: false, ms: d.getTime() }; }
  // TZID oder "floating": Wanduhrzeit übernehmen (bei TZID=Europe/Vienna exakt)
  return { date, time: m[4] + ":" + m[5], allDay: false, ms: viennaToUtc(date, m[4] + ":" + m[5]).getTime() };
}
function addDaysStr(s, n) { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function expandRRule(rrule, start, fromMs, toMs, exdates) {
  // einfache Serien: DAILY / WEEKLY (inkl. BYDAY) / MONTHLY / YEARLY mit INTERVAL, COUNT, UNTIL
  const r = {}; rrule.split(";").forEach(kv => { const [k, v] = kv.split("="); r[(k || "").toUpperCase()] = v; });
  const freq = r.FREQ, interval = Math.max(1, +r.INTERVAL || 1), count = r.COUNT ? +r.COUNT : null;
  let until = null; if (r.UNTIL) { const u = icsParseDate({ value: r.UNTIL, params: {} }); if (u) until = u.date; }
  const out = []; let n = 0; const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const byday = r.BYDAY ? r.BYDAY.split(",").map(x => x.replace(/^[+-]?\d+/, "")) : null;
  const fromStr = new Date(fromMs).toISOString().slice(0, 10), toStr = new Date(toMs).toISOString().slice(0, 10);
  let cur = start.date, guard = 0;
  while (guard++ < 3000) {
    if (until && cur > until) break; if (cur > toStr) break;
    let cands = [cur];
    if (freq === "WEEKLY" && byday) { const d0 = new Date(cur + "T00:00:00Z"); const monday = addDaysStr(cur, -((d0.getUTCDay() + 6) % 7)); cands = byday.map(bd => addDaysStr(monday, (days.indexOf(bd) + 6) % 7)).sort(); }
    for (const c of cands) {
      if (c < start.date) continue; if (until && c > until) continue;
      n++; if (count && n > count) return out;
      if (c >= fromStr && c <= toStr && !exdates.has(c)) out.push(c);
    }
    if (freq === "DAILY") cur = addDaysStr(cur, interval);
    else if (freq === "WEEKLY") cur = addDaysStr(cur, 7 * interval);
    else if (freq === "MONTHLY") { const d = new Date(cur + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + interval); cur = d.toISOString().slice(0, 10); }
    else if (freq === "YEARLY") { const d = new Date(cur + "T00:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() + interval); cur = d.toISOString().slice(0, 10); }
    else break;
  }
  return out;
}
function icsToEvents(ics, href, etag, fromMs, toMs) {
  const text = icsUnfold(ics);
  const blocks = text.split(/BEGIN:VEVENT/i).slice(1).map(b => b.split(/END:VEVENT/i)[0]);
  const masters = [], overrides = [];
  blocks.forEach(b => { const p = icsProps(b); (p["RECURRENCE-ID"] ? overrides : masters).push(p); });
  const out = [];
  const mk = (p, date, time, endTime, allDay, recurring, occ) => {
    const uidv = (p.UID && p.UID[0].value) || href;
    return {
      id: "ic_" + crypto.createHash("md5").update(uidv + "|" + (occ || date)).digest("hex").slice(0, 14),
      uid: uidv, href, etag, source: "icloud", sparte: "privat",
      title: icsUnesc((p.SUMMARY && p.SUMMARY[0].value) || "Termin"),
      date, time: allDay ? "" : time, endTime: allDay ? "" : (endTime || ""), allDay: !!allDay,
      location: icsUnesc((p.LOCATION && p.LOCATION[0].value) || ""), notes: icsUnesc((p.DESCRIPTION && p.DESCRIPTION[0].value) || ""),
      recurring: !!recurring,
    };
  };
  for (const p of masters) {
    if (p.STATUS && /CANCELLED/i.test(p.STATUS[0].value)) continue;
    const s = icsParseDate(p.DTSTART && p.DTSTART[0]); if (!s) continue;
    let e = icsParseDate(p.DTEND && p.DTEND[0]);
    const durMin = e ? Math.round((e.ms - s.ms) / 60000) : 60;
    const endTimeOf = startTime => { if (s.allDay || !startTime) return ""; const [h, m] = startTime.split(":").map(Number); const t = h * 60 + m + durMin; return (t >= 24 * 60) ? "" : (String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0")); };
    if (p.RRULE) {
      const ex = new Set(); (p.EXDATE || []).forEach(x => x.value.split(",").forEach(v => { const d = icsParseDate({ value: v, params: x.params }); if (d) ex.add(d.date); }));
      overrides.filter(o => o.UID && p.UID && o.UID[0].value === p.UID[0].value).forEach(o => { const rid = icsParseDate(o["RECURRENCE-ID"][0]); if (rid) ex.add(rid.date); });
      expandRRule(p.RRULE[0].value, s, fromMs, toMs, ex).forEach(d => out.push(mk(p, d, s.time, endTimeOf(s.time), s.allDay, true, d)));
    } else {
      out.push(mk(p, s.date, s.time, e && !s.allDay ? (e.date === s.date ? e.time : "") : "", s.allDay, false));
      // mehrtägige Ganztags-Termine: jeden Tag anzeigen
      if (s.allDay && e && e.date > addDaysStr(s.date, 1)) { let d = addDaysStr(s.date, 1), g = 0; while (d < e.date && g++ < 60) { out.push(mk(p, d, "", "", true, false, d)); d = addDaysStr(d, 1); } }
    }
  }
  for (const o of overrides) {
    if (o.STATUS && /CANCELLED/i.test(o.STATUS[0].value)) continue;
    const s = icsParseDate(o.DTSTART && o.DTSTART[0]); if (!s) continue; const e = icsParseDate(o.DTEND && o.DTEND[0]);
    const ms = s.ms; if (ms < fromMs - 864e5 || ms > toMs) continue;
    out.push(mk(o, s.date, s.time, e && e.date === s.date ? e.time : "", s.allDay, true, s.date));
  }
  return out;
}
function icsDt(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function buildVevent(ev, uid) {
  const lines = ["BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + icsDt(new Date()), "LAST-MODIFIED:" + icsDt(new Date())];
  if (!ev.time) {
    lines.push("DTSTART;VALUE=DATE:" + ev.date.replace(/-/g, ""), "DTEND;VALUE=DATE:" + addDaysStr(ev.date, 1).replace(/-/g, ""));
  } else {
    const st = viennaToUtc(ev.date, ev.time);
    let en = ev.endTime && ev.endTime > ev.time ? viennaToUtc(ev.date, ev.endTime) : new Date(st.getTime() + 3600000);
    lines.push("DTSTART:" + icsDt(st), "DTEND:" + icsDt(en));
  }
  lines.push("SUMMARY:" + icsEsc(ev.title || "Termin"));
  if (ev.location) lines.push("LOCATION:" + icsEsc(ev.location));
  if (ev.notes) lines.push("DESCRIPTION:" + icsEsc(ev.notes));
  lines.push("END:VEVENT");
  return lines;
}
function buildIcs(ev, uid) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FS Creative//Dashboard//DE", "CALSCALE:GREGORIAN"].concat(buildVevent(ev, uid), ["END:VCALENDAR"]).join("\r\n") + "\r\n";
}

let PRIV_CACHE = { at: 0, data: null, p: null };
let ICAL_LIST = { at: 0, key: "", cals: null };
async function icloudAllCals(c) {
  const key = c.user + "|" + c.calUrl;
  if (ICAL_LIST.cals && ICAL_LIST.key === key && Date.now() - ICAL_LIST.at < 3600000) return ICAL_LIST.cals;
  let cals = [];
  try { cals = (await icloudDiscover(c.user, c.pass)) || []; } catch (e) { cals = []; }
  if (!cals.some(x => x.url === c.calUrl)) cals.unshift({ url: c.calUrl, name: c.calName, color: c.calColor });
  ICAL_LIST = { at: Date.now(), key, cals };
  return cals;
}
async function privateCalendar(force) {
  const c = icloudCfg();
  if (!c.user || !c.pass || !c.calUrl) return { configured: false, events: [] };
  if (!force && PRIV_CACHE.data && Date.now() - PRIV_CACHE.at < 45000) return PRIV_CACHE.data;
  if (PRIV_CACHE.p) return PRIV_CACHE.p;
  PRIV_CACHE.p = (async () => {
    const now = Date.now(), fromMs = now - 62 * 864e5, toMs = now + 400 * 864e5;
    const f = d => icsDt(new Date(d));
    const body = '<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="' + f(fromMs) + '" end="' + f(toMs) + '"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>';
    try {
      // alle Kalender des Kontos (nicht nur den gewählten) – Fehler einzelner Kalender überspringen
      const cals = c.allCals === false ? [{ url: c.calUrl, name: c.calName, color: c.calColor }] : await icloudAllCals(c);
      const r = await dav("REPORT", c.calUrl, { user: c.user, pass: c.pass, depth: 1, body });
      if (r.status === 401 || r.status === 403) return { configured: true, calName: c.calName, error: "login_failed", events: (PRIV_CACHE.data && PRIV_CACHE.data.events) || [] };
      if (r.status >= 400) return { configured: true, calName: c.calName, error: "http_" + r.status, events: (PRIV_CACHE.data && PRIV_CACHE.data.events) || [] };
      const events = [];
      const take = (text, cal) => { for (const blk of xmlResponses(text)) {
        const href = ((blk.match(/<(?:[\w-]+:)?href[^>]*>([^<]+)</i) || [])[1] || "").trim();
        const etag = xmlUnesc(xmlTag(blk, "getetag")).trim();
        const data = xmlUnesc(xmlTag(blk, "calendar-data"));
        if (!data) continue;
        icsToEvents(data, absUrl(cal.url, href), etag, fromMs, toMs).forEach(e => { e.calName = cal.name || ""; e.calColor = cal.color || ""; e.primaryCal = cal.url === c.calUrl; events.push(e); });
      } };
      take(r.text, { url: c.calUrl, name: c.calName, color: c.calColor });
      const others = cals.filter(x => x.url && x.url !== c.calUrl);
      const res2 = await Promise.all(others.map(x => dav("REPORT", x.url, { user: c.user, pass: c.pass, depth: 1, body }).then(rr => ({ rr, x })).catch(() => null)));
      res2.forEach(o => { if (o && o.rr && o.rr.status < 400) take(o.rr.text, o.x); });
      const out = { configured: true, calName: c.calName, calColor: c.calColor, user: c.user, fetchedAt: new Date().toISOString(), events };
      PRIV_CACHE = { at: Date.now(), data: out, p: null };
      return out;
    } catch (e) {
      return { configured: true, calName: c.calName, error: String(e && e.message || e).slice(0, 160), events: (PRIV_CACHE.data && PRIV_CACHE.data.events) || [] };
    } finally { PRIV_CACHE.p = null; }
  })();
  return PRIV_CACHE.p;
}
async function privateCalWrite(op, payload) {
  const c = icloudCfg();
  if (!c.user || !c.pass || !c.calUrl) throw new Error("not_configured");
  const ev = payload.event || {};
  if (op === "create") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date || "")) throw new Error("bad_date");
    const uid = crypto.randomUUID().toUpperCase();
    const url = c.calUrl.replace(/\/?$/, "/") + uid + ".ics";
    const r = await dav("PUT", url, { user: c.user, pass: c.pass, body: buildIcs(ev, uid), headers: { "Content-Type": "text/calendar; charset=utf-8", "If-None-Match": "*" } });
    if (r.status >= 300) throw new Error("create_failed_" + r.status);
  } else if (op === "update") {
    const href = String(payload.href || ""); if (!href.startsWith("https://")) throw new Error("bad_href");
    const g = await dav("GET", href, { user: c.user, pass: c.pass });
    if (g.status >= 300) throw new Error("load_failed_" + g.status);
    if (/RRULE:/i.test(g.text)) throw new Error("recurring_readonly");
    // bestehende Termin-Daten (z. B. Erinnerungen) behalten, nur die bearbeiteten Felder ersetzen
    const unf = icsUnfold(g.text).split(/\r?\n/);
    const out = []; let inEv = false, depth = 0, uid = payload.uid || "";
    for (const line of unf) {
      if (/^BEGIN:VEVENT/i.test(line)) { inEv = true; depth = 0; out.push("__VEVENT__"); continue; }
      if (inEv) {
        if (/^BEGIN:/i.test(line)) depth++;
        if (/^END:VEVENT/i.test(line) && depth === 0) { inEv = false; continue; }
        if (/^END:/i.test(line)) { depth--; out.push(line); continue; }
        if (depth === 0) {
          if (/^UID:/i.test(line)) { uid = line.slice(4); continue; }
          if (/^(DTSTART|DTEND|DURATION|SUMMARY|LOCATION|DESCRIPTION|DTSTAMP|LAST-MODIFIED)[;:]/i.test(line)) continue;
          if (/^SEQUENCE:/i.test(line)) { out.push("SEQUENCE:" + ((+line.slice(9) || 0) + 1)); continue; }
        }
        out.push(line); continue;
      }
      out.push(line);
    }
    const vev = buildVevent(ev, uid || crypto.randomUUID());
    // VALARMs usw. (in out zwischen __VEVENT__ und dem nächsten Block) hinter die neuen Felder hängen
    const idx = out.indexOf("__VEVENT__");
    const rest = [];
    let j = idx + 1; while (j < out.length && !/^END:VCALENDAR/i.test(out[j]) && !/^BEGIN:VEVENT/i.test(out[j])) { rest.push(out[j]); j++; }
    const merged = out.slice(0, idx).concat(vev.slice(0, -1), rest.filter(l => l !== "__VEVENT__"), ["END:VEVENT"], out.slice(j));
    const r = await dav("PUT", href, { user: c.user, pass: c.pass, body: merged.join("\r\n") + "\r\n", headers: { "Content-Type": "text/calendar; charset=utf-8", "If-Match": g.etag || payload.etag || "*" } });
    if (r.status >= 300) throw new Error(r.status === 412 ? "changed_elsewhere" : "update_failed_" + r.status);
  } else if (op === "delete") {
    const href = String(payload.href || ""); if (!href.startsWith("https://")) throw new Error("bad_href");
    if (payload.recurring) throw new Error("recurring_readonly");
    const r = await dav("DELETE", href, { user: c.user, pass: c.pass, headers: payload.etag ? { "If-Match": payload.etag } : {} });
    if (r.status >= 300 && r.status !== 404) throw new Error(r.status === 412 ? "changed_elsewhere" : "delete_failed_" + r.status);
  } else throw new Error("bad_op");
  return privateCalendar(true);
}

function privateCalQuick() {
  const c = icloudCfg(); if (!c.user || !c.pass || !c.calUrl) return Promise.resolve({ configured: false, events: [] });
  if (PRIV_CACHE.data) { if (Date.now() - PRIV_CACHE.at > 45000) privateCalendar(false).catch(() => {}); return Promise.resolve(PRIV_CACHE.data); }
  return Promise.race([privateCalendar(false), new Promise(r => setTimeout(() => r(null), 7000))]);
}
// Kalender-Termine (Outlook/CalDAV) über die Mail-API, falls dort ein CalDAV-Server konfiguriert ist.
async function calendarEvents() {
  if (!MAIL.url || !MAIL.token) return null;
  const calUrl = MAIL.url.replace(/\/api\/mails.*$/, "/api/calendar") + "?token=" + encodeURIComponent(MAIL.token);
  const d = await getJSON(calUrl);
  if (!d || d.error || !Array.isArray(d.events)) return null;
  return d;
}
// ── Cloudflare: aktive Websites (Zonen) + Status + Insights ──
let SITES_CACHE = { at: 0, data: null };
async function cfGet(pathq) {
  if (!CF.token) return null;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try { const r = await fetch("https://api.cloudflare.com/client/v4" + pathq, { headers: { Authorization: "Bearer " + CF.token }, signal: ctrl.signal }); return await r.json(); }
  catch (e) { return null; } finally { clearTimeout(t); }
}
async function cfGraphQL(query, variables) {
  if (!CF.token) return null;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try { const r = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { Authorization: "Bearer " + CF.token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }), signal: ctrl.signal }); return await r.json(); }
  catch (e) { return null; } finally { clearTimeout(t); }
}
async function pingSite(host) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 7000); const t0 = Date.now();
  try {
    let r = await fetch("https://" + host + "/", { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    if (r.status === 405 || r.status === 501) r = await fetch("https://" + host + "/", { method: "GET", redirect: "follow", signal: ctrl.signal });
    return { up: r.status < 500, status: r.status, ms: Date.now() - t0 };
  } catch (e) { return { up: false, status: 0, ms: Date.now() - t0 }; } finally { clearTimeout(t); }
}
// Schnell: EIN GraphQL-Request für alle Zonen, Pings parallel, Ergebnis im Hintergrund frisch halten.
let SITES_BUSY = null, ADMIN_SEEN = Date.now();
async function buildSitesSnapshot() {
  const zj = await cfGet("/zones?status=active&per_page=200");
  if (!zj || !zj.success || !Array.isArray(zj.result)) return SITES_CACHE.data || { fetchedAt: new Date().toISOString(), configured: true, error: "cf_zones_failed", totals: {}, sites: [] };
  const zones = zj.result.map(z => ({ id: z.id, name: z.name }));
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const perZone = {}; zones.forEach(z => { perZone[z.id] = { requests: 0, threats: 0, bytes: 0, uniques: 0 }; });
  const gqAll = 'query($tags:[String!],$s:String!,$u:String!){viewer{zones(filter:{zoneTag_in:$tags}){zoneTag httpRequests1dGroups(limit:10,filter:{date_geq:$s,date_leq:$u}){sum{requests threats bytes}uniq{uniques}}}}}';
  const gqOne = 'query($zt:String!,$s:String!,$u:String!){viewer{zones(filter:{zoneTag:$zt}){zoneTag httpRequests1dGroups(limit:10,filter:{date_geq:$s,date_leq:$u}){sum{requests threats bytes}uniq{uniques}}}}}';
  function eat(zs) { (zs || []).forEach(zz => { const pz = perZone[zz.zoneTag]; if (!pz) return; (zz.httpRequests1dGroups || []).forEach(g => { pz.requests += g.sum.requests || 0; pz.threats += g.sum.threats || 0; pz.bytes += g.sum.bytes || 0; pz.uniques += (g.uniq && g.uniq.uniques) || 0; }); }); }
  const [gj, pings] = await Promise.all([
    cfGraphQL(gqAll, { tags: zones.map(z => z.id), s: since, u: until }),
    Promise.all(zones.map(z => pingSite(z.name)))
  ]);
  let ok = false;
  try { if (gj && gj.data && gj.data.viewer && Array.isArray(gj.data.viewer.zones) && gj.data.viewer.zones.length) { eat(gj.data.viewer.zones); ok = true; } } catch (e) {}
  if (!ok) { // Fallback: einzeln (älteres Verhalten)
    await Promise.all(zones.map(async z => { const g1 = await cfGraphQL(gqOne, { zt: z.id, s: since, u: until }); try { eat(g1.data.viewer.zones); } catch (e) {} }));
  }
  const sites = zones.map((z, i) => ({ name: z.name, up: pings[i].up, status: pings[i].status, ms: pings[i].ms, requests7d: perZone[z.id].requests, threats7d: perZone[z.id].threats, uniques7d: perZone[z.id].uniques, bytes7d: perZone[z.id].bytes }))
    .sort((a, b) => (a.up === b.up ? a.name.localeCompare(b.name) : (a.up ? 1 : -1)));
  const totals = sites.reduce((t, s) => { t.sites++; if (s.up) t.online++; t.requests7d += s.requests7d; t.threats7d += s.threats7d; t.uniques7d += s.uniques7d; t.bytes7d += s.bytes7d || 0; return t; }, { sites: 0, online: 0, requests7d: 0, threats7d: 0, uniques7d: 0, bytes7d: 0 });
  let railway = null; try { railway = await railwaySnapshot(); } catch (e) { railway = { configured: !!RW.token, error: String(e && e.message || e), projects: [] }; }
  return { fetchedAt: new Date().toISOString(), configured: true, totals, sites, railway };
}
function refreshSites() {
  if (!CF.token && !RW.token) return Promise.resolve(null);
  if (SITES_BUSY) return SITES_BUSY;
  SITES_BUSY = (CF.token ? buildSitesSnapshot() : (async () => ({ fetchedAt: new Date().toISOString(), configured: false, totals: {}, sites: [], railway: await railwaySnapshot().catch(() => null) }))())
    .then(d => { if (d) SITES_CACHE = { at: Date.now(), data: d }; return d; })
    .catch(() => SITES_CACHE.data)
    .finally(() => { SITES_BUSY = null; });
  return SITES_BUSY;
}
async function sitesSnapshot(force) {
  ADMIN_SEEN = Date.now();
  if (!CF.token && !RW.token) return { fetchedAt: new Date().toISOString(), configured: false, totals: {}, sites: [], railway: { configured: false, projects: [] } };
  if (SITES_CACHE.data && !force) {
    if ((Date.now() - SITES_CACHE.at) > 2 * 60 * 1000) refreshSites();   // veraltet: sofort alten Stand liefern, im Hintergrund neu holen
    return SITES_CACHE.data;
  }
  return (await refreshSites()) || SITES_CACHE.data || { fetchedAt: new Date().toISOString(), configured: true, error: "load_failed", totals: {}, sites: [] };
}
// Hintergrund: beim Start vorwärmen, danach alle 5 Min (nur solange die Admin in der letzten Stunde benutzt wurde)
setTimeout(() => { refreshSites(); }, 25000);   // erst nach dem Umschalten auf den neuen Container (sonst meldet sich die eigene Seite als offline)
setInterval(() => { if (Date.now() - ADMIN_SEEN < 60 * 60 * 1000) refreshSites(); }, 5 * 60 * 1000);

// ── Railway: alle Projekte mit Services, Deploy-Status und Domains ──
const RW = { token: process.env.RAILWAY_API_TOKEN || "", workspace: process.env.RAILWAY_WORKSPACE_ID || "1e0fd4ca-38db-4393-9b78-9e418fca8445" };
async function rwGQL(query, variables) {
  if (!RW.token) return null;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch("https://backboard.railway.com/graphql/v2", { method: "POST", headers: { Authorization: "Bearer " + RW.token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }), signal: ctrl.signal });
    return await r.json();
  } catch (e) { return { errors: [{ message: String(e && e.message || e) }] }; } finally { clearTimeout(t); }
}
const RW_PROJ_FIELDS = 'id name description updatedAt environments{edges{node{id name serviceInstances{edges{node{serviceId serviceName source{repo image} latestDeployment{id status createdAt} domains{serviceDomains{domain} customDomains{domain}}}}}}}}';
const RW_PROJ_FIELDS_LITE = 'id name description updatedAt environments{edges{node{id name serviceInstances{edges{node{serviceId serviceName latestDeployment{id status createdAt}}}}}}}';
async function railwaySnapshot() {
  if (!RW.token) return { configured: false, projects: [] };
  let list = null, err = null;
  for (const fields of [RW_PROJ_FIELDS, RW_PROJ_FIELDS_LITE]) {
    const q = 'query($w:String){projects(workspaceId:$w,first:100){edges{node{' + fields + '}}}}';
    let j = await rwGQL(q, { w: RW.workspace || null });
    if (!(j && j.data && j.data.projects)) j = await rwGQL('query{projects(first:100){edges{node{' + fields + '}}}}', {});
    if (j && j.data && j.data.projects) { list = j.data.projects.edges.map(e => e.node); break; }
    err = (j && j.errors && j.errors[0] && j.errors[0].message) || "railway_failed";
  }
  if (!list) return { configured: true, error: err, projects: [] };
  const rank = { FAILED: 5, CRASHED: 5, BUILDING: 3, DEPLOYING: 3, INITIALIZING: 3, QUEUED: 3, WAITING: 3, SLEEPING: 1, SUCCESS: 0, REMOVED: 0, SKIPPED: 0 };
  const projects = list.map(p => {
    const envs = (p.environments && p.environments.edges || []).map(e => e.node);
    const env = envs.find(e => e.name === "production") || envs[0] || { serviceInstances: { edges: [] } };
    const services = (env.serviceInstances && env.serviceInstances.edges || []).map(e => e.node).map(si => {
      const d = si.latestDeployment || {};
      const doms = si.domains || {};
      return { id: si.serviceId, name: si.serviceName, status: d.status || "NONE", deployedAt: d.createdAt || null,
        db: !!(si.source && si.source.image && /postgres|mysql|redis|mongo/i.test(si.source.image)) || /postgres|mysql|redis|mongo/i.test(si.serviceName || ""),
        repo: (si.source && si.source.repo) || "",
        customDomains: (doms.customDomains || []).map(x => x.domain), railwayDomains: (doms.serviceDomains || []).map(x => x.domain) };
    });
    let worst = "SUCCESS", lastDeploy = null;
    services.forEach(sv => { if ((rank[sv.status] || 0) > (rank[worst] || 0)) worst = sv.status; if (sv.deployedAt && (!lastDeploy || sv.deployedAt > lastDeploy)) lastDeploy = sv.deployedAt; });
    if (!services.length) worst = "EMPTY";
    const domains = []; services.forEach(sv => sv.customDomains.forEach(d => { if (domains.indexOf(d) < 0) domains.push(d); }));
    const rdomains = []; services.forEach(sv => sv.railwayDomains.forEach(d => { if (rdomains.indexOf(d) < 0) rdomains.push(d); }));
    return { id: p.id, name: p.name, status: worst, lastDeploy, envId: env.id || null, services, domains, railwayDomains: rdomains };
  }).sort((a, b) => (b.lastDeploy || "").localeCompare(a.lastDeploy || ""));
  const totals = projects.reduce((t, p) => { t.projects++; t.services += p.services.length; if (p.status === "FAILED" || p.status === "CRASHED") t.failed++; else if (["BUILDING", "DEPLOYING", "INITIALIZING", "QUEUED", "WAITING"].indexOf(p.status) > -1) t.deploying++; else if (p.status === "SUCCESS") t.ok++; return t; }, { projects: 0, services: 0, ok: 0, failed: 0, deploying: 0 });
  return { configured: true, fetchedAt: new Date().toISOString(), totals, projects };
}
function adminLoginPage(err) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>FS Creative Admin — Anmelden</title>
<style>:root{color-scheme:light}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(180deg,#eef2fb,#f7f9fd);font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f1729}
.card{background:#fff;border:1px solid #e9edf5;border-radius:18px;padding:28px;width:320px;box-shadow:0 24px 60px -30px rgba(15,23,42,.4)}
.logo{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#2f6bff,#7c4dff);display:grid;place-items:center;color:#fff;font-weight:800;margin-bottom:14px}
h1{font-size:18px;margin:0 0 4px}p{font-size:12.5px;color:#6b7686;margin:0 0 16px}
input{width:100%;box-sizing:border-box;border:1.5px solid #e9edf5;border-radius:11px;padding:11px 12px;font:inherit;font-size:14px;margin-bottom:10px}
input:focus{outline:none;border-color:#2f6bff;box-shadow:0 0 0 3px rgba(47,107,255,.12)}
button{width:100%;border:none;background:linear-gradient(135deg,#2f6bff,#7c4dff);color:#fff;border-radius:11px;padding:11px;font:inherit;font-weight:700;cursor:pointer}
.err{color:#f04438;font-size:12.5px;margin-bottom:10px}</style></head>
<body><form class="card" method="POST" action="/admin/login"><div class="logo">FS</div><h1>FS Creative Admin</h1><p>Bitte anmelden.</p>
${err ? '<div class="err">' + err + "</div>" : ""}
<input type="password" name="password" placeholder="Passwort" autofocus autocomplete="current-password"><button type="submit">Anmelden</button></form></body></html>`;
}

// ── sevDesk (Buchhaltung): Rechnungen, Bank, Belege ──
const SEV = { key: (process.env.SEVDESK_API_KEY || "").trim(), src: process.env.SEVDESK_API_KEY ? "env" : "", base: (process.env.SEVDESK_API_BASE || "https://my.sevdesk.de/api/v1").replace(/\/$/, ""), triedAt: 0, err: "" };
const SEV_SRC = { projectId: process.env.SEVDESK_KEY_PROJECT || "36a3e698-1684-4614-b235-63e62972d798", environmentId: process.env.SEVDESK_KEY_ENV || "7f4f6052-8af5-4a68-90b9-192b619ecfb9", serviceId: process.env.SEVDESK_KEY_SERVICE || "5f35ca1f-63e3-4ed5-9cac-ad2d7108c585" };
// Schlüssel: eigene Variable, sonst einmalig vom kochdu-Dienst (gleiches sevDesk-Konto) übernehmen
async function sevKey() {
  if (SEV.key) return SEV.key;
  if (!RW.token || Date.now() - SEV.triedAt < 2 * 60 * 1000) return "";
  SEV.triedAt = Date.now();
  const j = await rwGQL("query($p:String!,$e:String!,$s:String){ variables(projectId:$p, environmentId:$e, serviceId:$s) }", { p: SEV_SRC.projectId, e: SEV_SRC.environmentId, s: SEV_SRC.serviceId });
  const k = j && j.data && j.data.variables && j.data.variables.SEVDESK_API_KEY;
  if (!k) { SEV.err = (j && j.errors && j.errors[0] && j.errors[0].message) || "key_not_found"; return ""; }
  SEV.key = String(k).trim(); SEV.src = "kochdu"; SEV.err = "";
  const own = { projectId: process.env.RAILWAY_PROJECT_ID || "5ab009b1-4a14-436e-9c60-f06d94e68f6b", environmentId: process.env.RAILWAY_ENVIRONMENT_ID || "43bc9c87-f97f-4d1b-8294-abdf1e48e552", serviceId: process.env.RAILWAY_SERVICE_ID || "77edb043-6467-417d-941b-8366cefec1b6" };
  rwGQL("mutation($input: VariableCollectionUpsertInput!){ variableCollectionUpsert(input:$input) }", { input: Object.assign({}, own, { variables: { SEVDESK_API_KEY: SEV.key }, skipDeploys: true }) })
    .then(r => { if (r && r.errors) console.error("sevdesk key persist:", r.errors[0] && r.errors[0].message); else console.log("sevdesk key persisted"); }).catch(() => {});
  return SEV.key;
}
async function sev(method, path, opts) {
  opts = opts || {};
  const key = await sevKey(); if (!key) { const e = new Error("sevdesk_not_configured"); e.status = 503; throw e; }
  const qs = opts.query ? new URLSearchParams(opts.query).toString() : "";
  const url = SEV.base + path + (qs ? (path.indexOf("?") > -1 ? "&" : "?") + qs : "");
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), opts.timeout || 25000);
  const headers = { Authorization: key, Accept: "application/json" };
  let body;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }
  try {
    const r = await fetch(url, { method, headers, body, signal: ctrl.signal });
    if (opts.binary && r.ok) {
      const ct = r.headers.get("content-type") || "";
      const buf = Buffer.from(await r.arrayBuffer());
      if (/json/i.test(ct)) { let jj = null; try { jj = JSON.parse(buf.toString("utf8")); } catch (e) {} return { json: jj, type: ct }; }
      return { buf, type: ct, disposition: r.headers.get("content-disposition") || "" };
    }
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (!r.ok) {
      const er = j && j.error; const msg = (er && (er.message || (typeof er === "string" ? er : ""))) || (j && j.message) || txt.slice(0, 300) || ("HTTP " + r.status);
      const e = new Error(String(msg)); e.status = r.status; throw e;
    }
    return j;
  } finally { clearTimeout(t); }
}

const SEV_USER = process.env.SEVDESK_USER_ID || "837373";   // Simon Felder (Ansprechpartner auf Rechnungen)
const SEV_COUNTRY_AT = 3;                                     // StaticCountry Österreich
function sevNum(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
function sevDay(v) { if (!v) return null; const t = String(v); if (/^\d{9,11}$/.test(t)) return new Date(+t * 1000 + 12 * 3600e3).toISOString().slice(0, 10); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null; }   // ISO oder Unix-Zeitstempel
function sevName(c) { if (!c) return ""; return String(c.name || [c.surename, c.familyname].filter(Boolean).join(" ") || "").trim(); }
function sevDateDE(iso) { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "." + m[2] + "." + m[1] : iso; }
function viennaToday() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date()); }
let SEV_CACHE = { at: 0, data: null, p: null };
let SEV_META = { at: 0, data: null };
async function sevBuild() {
  const today = viennaToday();
  const [ver, inv, cas, tx, vou] = await Promise.all([
    sev("GET", "/Tools/bookkeepingSystemVersion").catch(() => null),
    sev("GET", "/Invoice", { query: { limit: 1000, embed: "contact" }, timeout: 40000 }),
    sev("GET", "/CheckAccount", { query: { limit: 100 } }),
    sev("GET", "/CheckAccountTransaction", { query: { limit: 300 } }).catch(() => ({ objects: [] })),
    sev("GET", "/Voucher", { query: { limit: 300 } }).catch(() => ({ objects: [] })),
  ]);
  const invoices = (inv && inv.objects || []).filter(o => o.invoiceType !== "MA" && o.invoiceType !== "WKR").map(o => {   // WKR = Vorlage für wiederkehrende Rechnungen, keine Forderung
    const date = sevDay(o.invoiceDate), gross = sevNum(o.sumGross), paid = sevNum(o.paidAmount), status = parseInt(o.status, 10) || 0;
    let due = null;
    if (date) { const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + (parseInt(o.timeToPay, 10) || 0)); due = d.toISOString().slice(0, 10); }
    const open = (status === 200 || status === 750) ? Math.max(0, Math.round((gross - paid) * 100) / 100) : 0;
    return { id: String(o.id), nr: o.invoiceNumber || "", type: o.invoiceType || "RE", status, date, due, delivery: sevDay(o.deliveryDate),
      contact: sevName(o.contact), contactId: o.contact && o.contact.id ? String(o.contact.id) : "", header: o.header || "",
      ref: String(o.headText || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160),
      net: sevNum(o.sumNet), tax: sevNum(o.sumTax), gross, paid, open, payDate: sevDay(o.payDate), sent: !!o.sendDate,
      overdue: open > 0.005 && !!due && due < today };
  }).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (parseInt(b.id, 10) - parseInt(a.id, 10)));
  const accountsRaw = (cas && cas.objects || []).filter(a => String(a.status) !== "0");
  const balances = await Promise.all(accountsRaw.map(a => sev("GET", "/CheckAccount/" + a.id + "/getBalanceAtDate", { query: { date: today } }).then(j => sevNum(j && j.objects)).catch(() => null)));
  const accounts = accountsRaw.map((a, i) => ({ id: String(a.id), name: a.name || "Konto", type: a.type || "", importType: a.importType || "", isDefault: String(a.defaultAccount) === "1", balance: balances[i] }));
  const txAll = (tx && tx.objects || []).map(t => ({ id: String(t.id), date: sevDay(t.valueDate || t.entryDate), amount: sevNum(t.amount), name: t.payeePayerName || "", purpose: String(t.paymtPurpose || t.entryText || "").replace(/\s+/g, " ").trim().slice(0, 140), status: parseInt(t.status, 10) || 0, accountId: t.checkAccount && t.checkAccount.id ? String(t.checkAccount.id) : "" }))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const vouchers = (vou && vou.objects || []).map(v => ({ id: String(v.id), date: sevDay(v.voucherDate), status: parseInt(v.status, 10) || 0, cd: v.creditDebit, gross: sevNum(v.sumGross), paid: sevNum(v.paidAmount), supplier: v.supplierName || "", desc: v.description || "" }));
  return { configured: true, source: SEV.src, version: ver && ver.objects && ver.objects.version || null, fetchedAt: new Date().toISOString(), today,
    invoices: invoices.slice(0, 600), accounts, transactions: txAll.slice(0, 120),
    unassigned: txAll.filter(t => t.status === 100).length,
    vouchers: { drafts: vouchers.filter(v => v.status === 50).length, open: vouchers.filter(v => v.status === 100 && v.cd === "C").length,
      openSum: Math.round(vouchers.filter(v => v.status === 100 && v.cd === "C").reduce((s, v) => s + Math.max(0, v.gross - v.paid), 0) * 100) / 100,
      recent: vouchers.sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 12) } };
}
async function sevSnapshot(force) {
  const fresh = SEV_CACHE.data && (Date.now() - SEV_CACHE.at < 3 * 60 * 1000);
  if (fresh && !force) return SEV_CACHE.data;
  if (!SEV_CACHE.p) { const pr = sevBuild().then(d => { SEV_CACHE = { at: Date.now(), data: d, p: null }; return d; }).catch(e => { SEV_CACHE.p = null; console.error("sevdesk snapshot:", e && e.message); throw e; }); pr.catch(() => {}); SEV_CACHE.p = pr; }
  if (SEV_CACHE.data && !force) return SEV_CACHE.data;            // alte Daten sofort, neue im Hintergrund
  return SEV_CACHE.p;
}
async function sevMeta(force) {
  if (SEV_META.data && !force && Date.now() - SEV_META.at < 30 * 60 * 1000) return SEV_META.data;
  const [at, pos, ct] = await Promise.all([
    sev("GET", "/AccountingType", { query: { limit: 1000 } }),
    sev("GET", "/VoucherPos", { query: { limit: 300, embed: "accountingType" } }).catch(() => ({ objects: [] })),
    sev("GET", "/Contact", { query: { limit: 1000, depth: 1 } }).catch(() => ({ objects: [] })),
  ]);
  const used = {};
  (pos && pos.objects || []).forEach(p => { const a = p.accountingType; if (a && a.id) used[a.id] = (used[a.id] || 0) + 1; });
  const skip = /^(rev|E|EQUITYIN|EQUITYOUT|TAX|VAT|VATIMPORT|VATINT|VATPAY)$/;
  const types = (at && at.objects || []).filter(a => String(a.active) !== "0" && String(a.hidden) !== "1" && String(a.status) === "100" && !skip.test(String(a.type || "")))
    .map(a => ({ id: String(a.id), name: a.name, used: used[a.id] || 0 }))
    .sort((a, b) => (b.used - a.used) || a.name.localeCompare(b.name, "de"));
  const contacts = (ct && ct.objects || []).map(c => ({ id: String(c.id), name: sevName(c), cat: c.category && c.category.id ? String(c.category.id) : "" })).filter(c => c.name).sort((a, b) => a.name.localeCompare(b.name, "de"));
  SEV_META = { at: Date.now(), data: { accountingTypes: types, contacts } };
  return SEV_META.data;
}
function sevNet(gross, rate) { return Math.round(gross / (1 + (rate || 0) / 100) * 100) / 100; }
// sevDesk-Länder (StaticCountry) einmal laden: ISO-Code → ID; Fallback Österreich
let SEV_COUNTRIES = null;
async function sevCountryId(code) {
  code = String(code || "").trim().toLowerCase();
  if (!code || code === "at") return SEV_COUNTRY_AT;
  try {
    if (!SEV_COUNTRIES) { const j = await sev("GET", "/StaticCountry", { query: { limit: 1000 } }); SEV_COUNTRIES = {}; (j && j.objects || []).forEach(c => { if (c && c.code) SEV_COUNTRIES[String(c.code).toLowerCase()] = String(c.id); }); }
    return SEV_COUNTRIES[code] || SEV_COUNTRY_AT;
  } catch (e) { return SEV_COUNTRY_AT; }
}
async function sevFindOrCreateContact(name, email, uid) {
  const meta = await sevMeta().catch(() => ({ contacts: [] }));
  const hit = (meta.contacts || []).find(c => c.name.toLowerCase() === String(name).trim().toLowerCase());
  if (hit) return hit.id;
  const cbody = { name: String(name).trim(), category: { id: 3, objectName: "Category" }, status: 1000 };
  if (uid && /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(String(uid).replace(/\s+/g, "").toUpperCase())) cbody.vatNumber = String(uid).replace(/\s+/g, "").toUpperCase();
  const cj = await sev("POST", "/Contact", { body: cbody });
  const id = String(cj && cj.objects && cj.objects.id || "");
  if (!id) throw new Error("contact_create_failed");
  if (email && /@/.test(email)) sev("POST", "/CommunicationWay", { body: { contact: { id, objectName: "Contact" }, type: "EMAIL", value: String(email).trim(), key: { id: 2, objectName: "CommunicationWayKey" }, main: true } }).catch(() => {});
  SEV_META.at = 0;
  return id;
}
async function sevCreateInvoice(pl) {
  const items = (Array.isArray(pl.items) ? pl.items : []).filter(i => i && String(i.name || "").trim() && isFinite(parseFloat(i.priceGross)));
  if (!items.length) throw new Error("keine_positionen");
  const name = String(pl.contactName || "").trim(); if (!name && !pl.contactId) throw new Error("kein_kunde");
  const contactId = pl.contactId ? String(pl.contactId) : await sevFindOrCreateContact(name, pl.email, pl.uid);
  const countryId = await sevCountryId(pl.country);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(pl.invoiceDate || "") ? pl.invoiceDate : viennaToday();
  const delivery = /^\d{4}-\d{2}-\d{2}$/.test(pl.deliveryDate || "") ? pl.deliveryDate : date;
  const rate0 = parseFloat(items[0].taxRate); const taxRate = isFinite(rate0) ? rate0 : 20;
  const body = {
    invoice: { objectName: "Invoice", mapAll: true, invoiceDate: sevDateDE(date), deliveryDate: sevDateDE(delivery), header: String(pl.header || "Rechnung").slice(0, 200),
      headText: String(pl.headText || ""), footText: String(pl.footText || "Zahlbar innerhalb von 14 Tagen ohne Abzug."), timeToPay: parseInt(pl.timeToPay, 10) || 14,
      address: String(pl.address || name), addressCountry: { id: countryId, objectName: "StaticCountry" },
      contact: { id: contactId, objectName: "Contact" }, contactPerson: { id: SEV_USER, objectName: "SevUser" },
      discount: 0, status: 100, taxRate: taxRate, taxText: "Umsatzsteuer " + taxRate + "%", taxType: "default", invoiceType: "RE", currency: "EUR", showNet: "1", smallSettlement: 0 },
    invoicePosSave: items.map((i, k) => { const r = isFinite(parseFloat(i.taxRate)) ? parseFloat(i.taxRate) : 20; const q = parseFloat(i.qty) || 1;
      return { objectName: "InvoicePos", mapAll: true, positionNumber: k, quantity: q, price: sevNet(parseFloat(i.priceGross), r), name: String(i.name).slice(0, 250), text: String(i.text || ""), unity: { id: 1, objectName: "Unity" }, taxRate: r }; }),
    invoicePosDelete: null, takeDefaultAddress: false,
  };
  // Optional (KI-Rechnung): Steuerregel nach sevDesk Update 2.0 (z. B. Reverse Charge), Leistungszeitraum bis
  const rule = /^\d{1,2}$/.test(String(pl.taxRule || "")) ? String(pl.taxRule) : "";
  if (rule) { body.invoice.taxRule = { id: rule, objectName: "TaxRule" }; delete body.invoice.taxType; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(pl.deliveryDateUntil || "") && pl.deliveryDateUntil !== delivery) body.invoice.deliveryDateUntil = sevDateDE(pl.deliveryDateUntil);
  const j = await sev("POST", "/Invoice/Factory/saveInvoice", { body, timeout: 40000 });
  const invo = j && j.objects && (j.objects.invoice || j.objects) || {};
  SEV_CACHE.at = 0;
  return { id: String(invo.id || ""), nr: invo.invoiceNumber || "", gross: sevNum(invo.sumGross) };
}
async function sevBook(pl) {
  const id = String(pl.id || "").replace(/\D/g, ""); if (!id) throw new Error("keine_rechnung");
  const amount = Math.round(parseFloat(pl.amount) * 100) / 100; if (!(amount > 0)) throw new Error("kein_betrag");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(pl.date || "") ? pl.date : viennaToday();
  const body = { amount, date: Math.floor(Date.parse(day + "T12:00:00Z") / 1000), type: "N", createFeed: true };
  if (pl.transactionId) {
    const snap = SEV_CACHE.data; const t = snap && (snap.transactions || []).find(x => x.id === String(pl.transactionId));
    body.checkAccountTransaction = { id: String(pl.transactionId), objectName: "CheckAccountTransaction" };
    body.checkAccount = { id: String(pl.accountId || (t && t.accountId) || ""), objectName: "CheckAccount" };
  } else {
    body.checkAccount = { id: String(pl.accountId || ""), objectName: "CheckAccount" };
  }
  if (!body.checkAccount.id) throw new Error("kein_konto");
  const j = await sev("PUT", "/Invoice/" + id + "/bookAmount", { body });
  SEV_CACHE.at = 0;
  return j && j.objects || true;
}
async function sevVoucherFromMail(pl) {
  const m = pl.mail || {};
  let buf, fname, ctypeIn = "";
  if (pl.uploadId) {   // hochgeladene Datei (KI-Upload, liegt kurz im Arbeitsspeicher von ki.js)
    const f = KI.uploadFile(String(pl.uploadId)); if (!f) throw new Error("Die hochgeladene Datei ist abgelaufen – bitte erneut hochladen.");
    buf = f.buf; fname = f.fname; ctypeIn = f.ctype;
  } else {
  if (!MAIL.url || !MAIL.token) throw new Error("mail_not_configured");
  const attUrl = MAIL.url.replace(/\/api\/mails.*$/, "/api/attachment") + "?token=" + encodeURIComponent(MAIL.token) + "&folder=" + encodeURIComponent(m.folder || "INBOX") + "&uid=" + encodeURIComponent(m.uid || "") + "&index=" + encodeURIComponent(m.index || "0") + "&account=" + encodeURIComponent(m.account || "");
  const r = await fetch(attUrl); if (!r.ok) throw new Error("anhang_nicht_geladen");
  buf = Buffer.from(await r.arrayBuffer());
  const cd = r.headers.get("content-disposition") || ""; fname = String(m.filename || "beleg.pdf");
  const m5987 = cd.match(/filename\*=UTF-8''([^;]+)/i), mPlain = cd.match(/filename="([^"]*)"/i);
  try { if (m5987) fname = decodeURIComponent(m5987[1]); else if (mPlain) fname = mPlain[1]; } catch (e) {}
  ctypeIn = r.headers.get("content-type") || "";
  }
  const ext = (fname.split(".").pop() || "").toLowerCase();
  const ctype = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", xml: "application/xml" }[ext] || (ctypeIn || "application/octet-stream");
  const fd = new FormData(); fd.append("file", new Blob([buf], { type: ctype }), fname);
  const up = await sev("POST", "/Voucher/Factory/uploadTempFile", { form: fd, timeout: 60000 });
  const tmp = up && up.objects && (up.objects.filename || (up.objects[0] && up.objects[0].filename));
  if (!tmp) throw new Error("upload_fehlgeschlagen");
  const gross = Math.round(parseFloat(pl.gross) * 100) / 100; if (!(gross > 0)) throw new Error("kein_betrag");
  const rate = isFinite(parseFloat(pl.taxRate)) ? parseFloat(pl.taxRate) : 20;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(pl.date || "") ? pl.date : viennaToday();
  const at = String(pl.accountingTypeId || "").replace(/\D/g, ""); if (!at) throw new Error("keine_kategorie");
  // Optional (KI-Vorbefüllung): je Steuersatz eine Position, Steuerregel nach sevDesk Update 2.0, Leistungszeitraum
  const posIn = (Array.isArray(pl.positions) ? pl.positions : []).filter(x => x && parseFloat(x.gross) > 0).slice(0, 10);
  const pos = posIn.length ? posIn.map(x => { const r = isFinite(parseFloat(x.taxRate)) ? parseFloat(x.taxRate) : rate, g = Math.round(parseFloat(x.gross) * 100) / 100; return { r, g }; }) : [{ r: rate, g: gross }];
  const rule = ["8", "9", "10", "12", "13", "14"].indexOf(String(pl.taxRule || "")) > -1 ? String(pl.taxRule) : "";
  const body = {
    voucher: { objectName: "Voucher", mapAll: true, voucherDate: sevDateDE(day), supplierName: String(pl.supplierName || "").slice(0, 200), description: String(pl.description || "").slice(0, 250),
      status: 50, taxType: "default", creditDebit: "C", voucherType: "VOU", currency: "EUR" },
    voucherPosSave: pos.map(x => ({ objectName: "VoucherPos", mapAll: true, accountingType: { id: at, objectName: "AccountingType" }, taxRate: x.r, net: false, sumGross: x.g, sumNet: sevNet(x.g, x.r), comment: String(pl.description || "").slice(0, 250) })),
    voucherPosDelete: null, filename: tmp,
  };
  if (rule) { body.voucher.taxRule = { id: rule, objectName: "TaxRule" }; delete body.voucher.taxType; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(pl.deliveryDate || "")) body.voucher.deliveryDate = sevDateDE(pl.deliveryDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(pl.deliveryDateUntil || "") && pl.deliveryDateUntil !== pl.deliveryDate) body.voucher.deliveryDateUntil = sevDateDE(pl.deliveryDateUntil);
  const j = await sev("POST", "/Voucher/Factory/saveVoucher", { body, timeout: 40000 });
  const v = j && j.objects && (j.objects.voucher || j.objects) || {};
  SEV_CACHE.at = 0;
  return { id: String(v.id || ""), filename: fname };
}
function sevBody(req, max) { return new Promise((resolve, reject) => { let b = ""; req.on("data", c => { b += c; if (b.length > (max || 200000)) { req.destroy(); reject(new Error("too_large")); } }); req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch (e) { reject(new Error("bad_json")); } }); }); }

// ── Abrechnung: Preise, Website-Einstellungen, letzte Rechnungen (FS Creative, kochdu, VALUERO) ──
const BILLING_FILE = path.join(DATA_DIR, "billing.json");
function readBilling() {
  let o = {}; try { o = JSON.parse(fs.readFileSync(BILLING_FILE, "utf8")) || {}; } catch (e) { o = {}; }
  o.prices = Object.assign({ domain: 0, domainPer: "year", hosting: 0, hostingPer: "month", mail: 0, mailPer: "month", period: 12, taxRate: 20, gross: true,
    domainLabel: "Domain", hostingLabel: "Hosting & Wartung", mailLabel: "E-Mail" }, o.prices || {});
  o.sites = (o.sites && typeof o.sites === "object") ? o.sites : {};
  o.invoices = (o.invoices && typeof o.invoices === "object") ? o.invoices : {};
  return o;
}
function writeBilling(o) { try { if (typeof COCKPIT_MEMO !== "undefined") COCKPIT_MEMO.at = 0; o.updatedAt = new Date().toISOString(); fs.writeFileSync(BILLING_FILE, JSON.stringify(o)); return true; } catch (e) { return false; } }
function billingOp(pl) {
  const o = readBilling(); const op = String(pl.op || "");
  const cleanKey = k => String(k || "").slice(0, 200);
  if (op === "prices" && pl.prices && typeof pl.prices === "object") {
    const P = pl.prices, num = v => { const n = parseFloat(v); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };
    ["domain", "hosting", "mail", "taxRate"].forEach(k => { if (k in P) o.prices[k] = num(P[k]); });
    ["domainPer", "hostingPer", "mailPer"].forEach(k => { if (k in P) o.prices[k] = P[k] === "year" ? "year" : "month"; });
    if ("period" in P) { const n = parseInt(P.period, 10); o.prices.period = [1, 3, 6, 12].indexOf(n) > -1 ? n : 12; }
    if ("gross" in P) o.prices.gross = !!P.gross;
    if ("yearStart" in P) o.prices.yearStart = !!P.yearStart;
    ["domainLabel", "hostingLabel", "mailLabel"].forEach(k => { if (k in P) o.prices[k] = String(P[k] || "").slice(0, 80); });
  } else if (op === "site" && pl.key && pl.patch && typeof pl.patch === "object") {
    const k = cleanKey(pl.key), cur = o.sites[k] || {}, P = pl.patch;
    ["active", "domain", "hosting", "mail", "own"].forEach(f => { if (f in P) cur[f] = (P[f] === null ? undefined : !!P[f]); });
    if ("extra" in P) { const n = parseFloat(P.extra); cur.extra = isFinite(n) ? Math.round(n * 100) / 100 : 0; }
    if ("mailQty" in P) { const n = parseInt(P.mailQty, 10); cur.mailQty = n > 0 ? Math.min(n, 999) : 1; }
    if ("w4y" in P) cur.w4y = Array.isArray(P.w4y) ? P.w4y.filter(x => Object.prototype.hasOwnProperty.call(W4Y_PKG, x)).slice(0, 5) : undefined;
    if ("w4yQty" in P) { const n = parseInt(P.w4yQty, 10); cur.w4yQty = n > 0 ? Math.min(n, 99) : 1; }
    ["extraLabel", "customer", "note"].forEach(f => { if (f in P) cur[f] = String(P[f] || "").slice(0, 200); });
    if ("billedUntil" in P) cur.billedUntil = /^\d{4}-\d{2}-\d{2}$/.test(P.billedUntil || "") ? P.billedUntil : null;
    o.sites[k] = cur;
  } else if (op === "invoice" && pl.key && pl.invoice && typeof pl.invoice === "object") {
    const k = cleanKey(pl.key), I = pl.invoice;
    const inv = { id: String(I.id || ""), nr: String(I.nr || ""), date: String(I.date || new Date().toISOString().slice(0, 10)), gross: Math.round((parseFloat(I.gross) || 0) * 100) / 100,
      from: /^\d{4}-\d{2}-\d{2}$/.test(I.from || "") ? I.from : null, to: /^\d{4}-\d{2}-\d{2}$/.test(I.to || "") ? I.to : null, label: String(I.label || "").slice(0, 200) };
    const arr = Array.isArray(o.invoices[k]) ? o.invoices[k] : []; arr.push(inv); o.invoices[k] = arr.slice(-30);
    if (inv.to && k.indexOf("site:") === 0) { const s = o.sites[k.slice(5)] || {}; s.billedUntil = inv.to; o.sites[k.slice(5)] = s; }
  } else if (op === "unbill" && pl.key) {
    const k = cleanKey(pl.key); const arr = Array.isArray(o.invoices[k]) ? o.invoices[k] : [];
    const gone = arr.pop(); o.invoices[k] = arr;
    if (k.indexOf("site:") === 0) { const s = o.sites[k.slice(5)] || {}; const prev = arr[arr.length - 1]; s.billedUntil = prev && prev.to ? prev.to : null; o.sites[k.slice(5)] = s; }
    if (!gone) throw new Error("nichts_zum_zuruecknehmen");
  } else throw new Error("bad_op");
  if (!writeBilling(o)) throw new Error("save_failed");
  return o;
}

// ── Railway: echte Kosten je Projekt (letzte 30 Tage, Listenpreise) ──
let RWCOST = { at: 0, data: null, p: null };
let FXRATE = { at: 0, eur: 0.86 };
async function usdEur() {
  if (Date.now() - FXRATE.at < 12 * 3600 * 1000) return FXRATE.eur;
  try { const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR"); const j = await r.json(); const v = j && j.rates && j.rates.EUR; if (v > 0.5 && v < 1.5) FXRATE = { at: Date.now(), eur: v }; else FXRATE.at = Date.now(); } catch (e) { FXRATE.at = Date.now(); }
  return FXRATE.eur;
}
async function railwayCostsBuild() {
  if (!RW.token) return { configured: false, projects: {} };
  const end = new Date(), start = new Date(Date.now() - 30 * 86400000);
  const M = ["CPU_USAGE", "MEMORY_USAGE_GB", "NETWORK_TX_GB", "DISK_USAGE_GB", "BACKUP_USAGE_GB"];
  const q = "query($w:String!,$m:[MetricMeasurement!]!,$g:[MetricTag!],$s:DateTime,$e:DateTime){ usage(workspaceId:$w, measurements:$m, groupBy:$g, startDate:$s, endDate:$e, includeDeleted:true){ measurement value tags { projectId } } }";
  const j = await rwGQL(q, { w: RW.workspace, m: M, g: ["PROJECT_ID"], s: start.toISOString(), e: end.toISOString() });
  if (!j || j.errors || !j.data) return { configured: true, error: (j && j.errors && j.errors[0] && j.errors[0].message) || "railway_failed", projects: {} };
  // Railway-Listenpreise (30-Tage-Monat = 43.200 Minuten)
  const PRICE = { CPU_USAGE: 20 / 43200, MEMORY_USAGE_GB: 10 / 43200, NETWORK_TX_GB: 0.05, DISK_USAGE_GB: 0.15 / 43200, BACKUP_USAGE_GB: 0.15 / 43200 };
  const KEY = { CPU_USAGE: "cpu", MEMORY_USAGE_GB: "ram", NETWORK_TX_GB: "egress", DISK_USAGE_GB: "disk", BACKUP_USAGE_GB: "backup" };
  const projects = {};
  (j.data.usage || []).forEach(u => {
    const pid = u.tags && u.tags.projectId; if (!pid) return;
    const p = projects[pid] || (projects[pid] = { usd: 0, parts: {} });
    const usd = (+u.value || 0) * (PRICE[u.measurement] || 0);
    p.parts[KEY[u.measurement] || u.measurement] = Math.round(((p.parts[KEY[u.measurement]] || 0) + usd) * 10000) / 10000;
    p.usd += usd;
  });
  const fx = await usdEur();
  let total = 0;
  Object.keys(projects).forEach(k => { const p = projects[k]; p.usd = Math.round(p.usd * 100) / 100; p.eur = Math.round(p.usd * fx * 100) / 100; total += p.usd; });
  return { configured: true, fetchedAt: new Date().toISOString(), days: 30, fx, totalUsd: Math.round(total * 100) / 100, totalEur: Math.round(total * fx * 100) / 100, projects };
}
async function railwayCosts(force) {
  if (RWCOST.data && !force && Date.now() - RWCOST.at < 30 * 60 * 1000) return RWCOST.data;
  if (!RWCOST.p) { const pr = railwayCostsBuild().then(d => { RWCOST = { at: Date.now(), data: d, p: null }; return d; }).catch(e => { RWCOST.p = null; throw e; }); pr.catch(() => {}); RWCOST.p = pr; }
  if (RWCOST.data && !force) return RWCOST.data;
  return RWCOST.p;
}

// ===========================================================================
// COCKPIT  /admin/neu  — bündelt alle Quellen + Abgleich Plattformen ↔ sevDesk
// ===========================================================================
const OWN_DEFAULT_RX = /^(fs creative|blitzdings|valuero|kochdu|der-kantineur|buchhaltung|blitzbooth zentrale|fs-creative-mail-api|fs-dashboard|gallant-gentleness|noble-flow)$/i;
// world4you, reguläre Preise inkl. 20 % USt pro Jahr (wie im klassischen Dashboard)
// world4you-Pakete pro Monat inkl. 20 % USt (12 Monate Laufzeit); Exchange je Postfach
const W4Y_PKG = { exchange5: 7, exchange10: 10, exchange15: 13.5, mailgrow: 4, go: 4, grow: 7, business: 12 };
// Voreinstellung je Website (bis in der Abrechnung etwas anderes gewählt wird)
const W4Y_DEFAULTS = [[/^of gaschurn$/i, ["exchange5"]], [/^lerch fleischhandel$/i, ["exchange5"]], [/bergfreunde/i, ["go"]], [/^fl(ö|oe)ry/i, ["go"]]];
function w4yDefault(name) { const m = W4Y_DEFAULTS.find(d => d[0].test(String(name || ""))); return m ? m[1].slice() : []; }
// Partnerrabatt world4you: 5 % auf Domains, 10 % auf Mail-Pakete (Exchange, E-Mail); Webhosting ohne Rabatt
const W4Y_RABATT = { domain: 0.05, mail: 0.10 };
function w4yYear(c) { return round2((c.w4y || []).reduce((a, k) => { const mail = /^exchange|^mail/.test(k); return a + (W4Y_PKG[k] || 0) * (mail ? (c.w4yQty || 1) * (1 - W4Y_RABATT.mail) : 1); }, 0) * 12); }
const W4Y = { "at": 36, "co.at": 36, "or.at": 36, "com": 24, "ch": 14.04, "net": 24, "org": 17.04, "eu": 19.92 };
const LEAD_STAGES = ["anfrage", "entwurf", "angebot", "auftrag", "live", "verloren"];
function withTimeout(p, ms, fallback) { return Promise.race([Promise.resolve(p).catch(() => fallback), new Promise(r => setTimeout(() => r(fallback), ms))]); }
function round2(n) { return Math.round((+n || 0) * 100) / 100; }
function ymdAdd(iso, days) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function ymdAddMonths(iso, months) { const d = new Date(iso + "T12:00:00Z"); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10); }
function deDate(iso) { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "." + m[2] + "." + m[1] : ""; }
function zoneFor(domain, zones) { domain = String(domain || "").toLowerCase(); let best = null; (zones || []).forEach(z => { const n = String(z.name || "").toLowerCase(); if (domain === n || domain.slice(-(n.length + 1)) === "." + n) { if (!best || n.length > best.name.length) best = z; } }); return best; }
function regDomainsOf(domains) {
  const seen = {}, out = [];
  (domains || []).forEach(d => { d = String(d || "").toLowerCase().replace(/^www\./, ""); if (!d || /\.up\.railway\.app$/.test(d)) return; const parts = d.split("."); const n = /\.(co|or|gv|ac)\.at$/.test(d) ? 3 : 2; const reg = parts.slice(-n).join("."); if (seen[reg]) return; seen[reg] = 1; const tld = parts.slice(-(n - 1)).join("."); out.push({ name: reg, tld, year: W4Y[tld] != null ? round2(W4Y[tld] * (1 - W4Y_RABATT.domain)) : null }); });
  return out;
}
// Gleiche Website-Liste wie im klassischen Dashboard (Railway-Projekte + Cloudflare-Zonen ohne Projekt)
function cockpitSites(snap) {
  const rw = (snap && snap.railway) || {}, projects = rw.projects || [], zones = (snap && snap.sites) || [];
  const used = {}, list = [];
  projects.forEach(p => {
    const doms = p.domains || []; if (!(p.services || []).length && !doms.length) return;
    const zs = doms.map(dm => zoneFor(dm, zones)).filter(Boolean); zs.forEach(z => { used[z.name] = 1; });
    const rd = (p.railwayDomains || [])[0] || "";
    list.push({ key: "rw:" + p.id, name: p.name, domain: doms[0] || "", domains: doms, url: doms[0] ? "https://" + doms[0] : (rd ? "https://" + rd : ""), up: zs.length ? zs[0].up : null, status: p.status, rwId: p.id, lastDeploy: p.lastDeploy || null, requests7d: zs.reduce((a, z) => a + (z.requests7d || 0), 0) });
  });
  zones.forEach(z => { if (used[z.name]) return; list.push({ key: "cf:" + z.name, name: z.name, domain: z.name, domains: [z.name], url: "https://" + z.name, up: z.up, status: null, rwId: null, requests7d: z.requests7d || 0 }); });
  return list.sort((a, b) => a.name.localeCompare(b.name, "de"));
}
function siteCfgOf(bill, s) { const c = (bill.sites && bill.sites[s.key]) || {}; return { active: !!c.active, domain: !!c.domain, hosting: !!c.hosting, mail: !!c.mail, mailQty: +c.mailQty || 1, extra: +c.extra || 0, extraLabel: c.extraLabel || "", customer: c.customer || "", billedUntil: c.billedUntil || null, own: c.own != null ? !!c.own : OWN_DEFAULT_RX.test(s.name), w4y: Array.isArray(c.w4y) ? c.w4y : w4yDefault(s.name), w4yQty: +c.w4yQty || 1 }; }
function perPeriodOf(price, per, period) { price = +price || 0; return per === "year" ? price * period / 12 : price * period; }
function siteLinesOf(s, c, P) {
  const n = +P.period || 12, L = [];
  if (c.domain) L.push({ name: (P.domainLabel || "Domain") + (s.domain ? " " + s.domain : ""), amount: perPeriodOf(P.domain, P.domainPer, n) });
  if (c.hosting) L.push({ name: (P.hostingLabel || "Hosting") + (s.domain ? " " + s.domain : ""), amount: perPeriodOf(P.hosting, P.hostingPer, n) });
  if (c.mail) L.push({ name: (P.mailLabel || "E-Mail") + (c.mailQty > 1 ? " (" + c.mailQty + " Postfächer)" : ""), amount: perPeriodOf(P.mail, P.mailPer, n) * (c.mailQty || 1) });
  if (c.extra > 0) L.push({ name: c.extraLabel || "Zusatzleistung", amount: c.extra });
  return L.map(l => ({ name: l.name, amount: round2(l.amount) }));
}
const INV_LABEL = { 100: "Entwurf", 200: "Offen", 750: "Teilbezahlt", 1000: "Bezahlt", 50: "Deaktiviert" };
// Status einer gespeicherten Rechnung mit dem echten Stand in sevDesk verbinden
function invLink(rec, sevById, oldest) {
  if (!rec) return null;
  if (!rec.id) return { id: "", nr: rec.nr || "", date: rec.date, gross: rec.gross, state: "manuell", label: "ohne Rechnung", paid: 0, open: 0 };
  const s = sevById[rec.id];
  // Nur als "fehlt" melden, wenn die Rechnung im geladenen sevDesk-Zeitraum liegen müsste (ältere werden nicht geladen)
  if (!s && oldest && String(rec.date || "") < oldest) return { id: rec.id, nr: rec.nr || "", date: rec.date, gross: rec.gross, state: "alt", label: "älter, nicht geprüft", paid: 0, open: 0 };
  // Gerade angelegt: sevDesk-Stand wird im Hintergrund nachgeladen
  if (!s && String(rec.date || "") >= ymdAdd(viennaToday(), -2)) return { id: rec.id, nr: rec.nr || "", date: rec.date, gross: rec.gross, state: "neu", label: "wird synchronisiert", paid: 0, open: +rec.gross || 0 };
  if (!s) return { id: rec.id, nr: rec.nr || "", date: rec.date, gross: rec.gross, state: "fehlt", label: "nicht in sevDesk", paid: 0, open: 0 };
  const state = s.overdue ? "ueberfaellig" : s.status === 1000 ? "bezahlt" : s.status === 100 ? "entwurf" : (s.status === 200 || s.status === 750) ? "offen" : "sonst";
  return { id: s.id, nr: s.nr || rec.nr || "", date: s.date || rec.date, gross: s.gross, paid: s.paid, open: s.open, state, label: s.overdue ? "überfällig" : (INV_LABEL[s.status] || "?"), due: s.due };
}
function sumState(links) { return links.reduce((t, l) => { if (!l) return t; t.invoiced += +l.gross || 0; t.paid += l.state === "bezahlt" ? (+l.gross || 0) : (+l.paid || 0); t.open += +l.open || 0; return t; }, { invoiced: 0, paid: 0, open: 0 }); }

function abgleichBuild(ctx) {
  const { year, today, sev, bill, sitesSnap, kochdu, valuero, blitz, kantineur } = ctx;
  const sevInv = (sev && sev.invoices) || [];
  const sevById = {}; sevInv.forEach(i => { sevById[i.id] = i; });
  const oldest = sevInv.length >= 600 ? sevInv.reduce((m, i) => (i.date && (!m || i.date < m) ? i.date : m), "") : "";
  const link = (r) => invLink(r, sevById, oldest);
  const linked = {};      // sevDesk-IDs, die einer Quelle zugeordnet sind
  const items = [];
  const P = bill.prices || {};
  const recs = key => (bill.invoices && bill.invoices[key]) || [];
  // 1) Websites (Hosting/Domain/Mail)
  cockpitSites(sitesSnap).forEach(s => {
    const c = siteCfgOf(bill, s); if (c.own || !c.active) return;
    const lines = siteLinesOf(s, c, P); const sum = round2(lines.reduce((a, l) => a + l.amount, 0)); if (sum <= 0) return;
    const links = recs("site:" + s.key).map(link); links.forEach(l => { if (l && l.id) linked[l.id] = 1; });
    const n = +P.period || 12, tax = isFinite(+P.taxRate) ? +P.taxRate : 20;
    // Stichtag 1.1.: jährlich je Kalenderjahr verrechnet; fällig erst ab 1.1. (nie verrechnete nur im Jänner)
    const yearly = n === 12 && P.yearStart !== false;
    const due = yearly ? (c.billedUntil ? c.billedUntil < today : today.slice(5, 7) === "01") : (!c.billedUntil || c.billedUntil < today);
    const from = c.billedUntil ? ymdAdd(c.billedUntil, 1) : (yearly ? today.slice(0, 4) + "-01-01" : today), to = yearly ? from.slice(0, 4) + "-12-31" : ymdAdd(ymdAddMonths(from, n), -1), span = deDate(from) + " – " + deDate(to);
    const st = sumState(links);
    items.push({ src: "website", key: "site:" + s.key, name: c.customer || s.name, sub: (s.domain || s.name) + " · " + (c.billedUntil ? "verrechnet bis " + deDate(c.billedUntil) : "noch nie verrechnet"),
      unbilled: due ? sum : 0, invoiced: round2(st.invoiced), paid: round2(st.paid), open: round2(st.open), refund: 0, last: links[links.length - 1] || null, invoices: links.slice(-4).reverse(),
      action: due ? { kind: "site", title: "Rechnung · " + s.name, contactName: c.customer || s.name, deliveryDate: from, headText: "Leistungen für " + (s.domain || s.name) + " im Zeitraum " + span + ".",
        items: lines.map(l => ({ name: l.name, text: "Zeitraum " + span, qty: 1, priceGross: round2(P.gross ? l.amount : l.amount * (1 + tax / 100)), taxRate: tax })),
        after: { billing: { key: "site:" + s.key, from, to, label: s.name }, siteCustomer: c.customer ? null : s.key } } : null });
  });
  // 2) kochdu: Bar-Gebühren je Restaurant (Online-Provisionen werden automatisch einbehalten)
  ((kochdu && kochdu.restaurants) || []).forEach(r => {
    const open = round2((+r.barOpenCents || 0) / 100), settled = round2((+r.barSettledCents || 0) / 100), online = round2((+r.onlineProvisionCents || 0) / 100);
    const links = recs("kochdu:" + r.id).map(link); links.forEach(l => { if (l && l.id) linked[l.id] = 1; });
    if (open < 0.005 && settled < 0.005 && !links.length && online < 0.005) return;
    const st = sumState(links);
    const since = r.lastSettledAt ? deDate(String(r.lastSettledAt).slice(0, 10)) : "", todayDE = deDate(today);
    items.push({ src: "kochdu", key: "kochdu:" + r.id, name: r.name || "Restaurant", sub: (+r.barOrders || 0) + " Bar-Bestellungen · Online-Provision " + online.toFixed(2).replace(".", ",") + " € (automatisch)",
      unbilled: open, invoiced: round2(Math.max(st.invoiced, settled)), paid: round2(st.paid), open: round2(st.open), refund: 0, settledWithoutInvoice: round2(Math.max(0, settled - st.invoiced)), last: links[links.length - 1] || null, invoices: links.slice(-4).reverse(),
      action: open > 0.005 ? { kind: "kochdu", title: "Rechnung · kochdu · " + (r.name || ""), contactName: r.name || "", headText: "kochdu-Gebühren für Bestellungen mit Barzahlung" + (since ? " seit " + since : "") + " bis " + todayDE + ".",
        items: [{ name: "kochdu Vermittlungsgebühren (Barzahlungen)", text: (+r.barOrders || 0) + " Bar-Bestellungen" + (since ? " seit " + since : "") + " bis " + todayDE, qty: 1, priceGross: open, taxRate: 20 }],
        after: { billing: { key: "kochdu:" + r.id, label: r.name || "" }, kochduSettle: { restaurantId: r.id, amountCents: Math.round(open * 100) } } } : null });
  });
  // 3) VALUERO: Vermittlungsgebühren je Objekt (Stand serverseitig aus der Abrechnung)
  ((valuero && valuero.objects) || []).forEach(o => {
    const prov = round2((+o.provisionCents || 0) / 100);
    const all = recs("valuero:" + o.key).filter(x => String(x.date || "").slice(0, 4) === String(year));
    const links = all.map(link); links.forEach(l => { if (l && l.id) linked[l.id] = 1; });
    const billedSum = round2(all.reduce((a, x) => a + (+x.gross || 0), 0));
    const st = sumState(links.filter(l => l.state !== "manuell"));
    const open = round2(Math.max(0, prov - billedSum)), refund = round2(Math.max(0, billedSum - prov));
    items.push({ src: "valuero", key: "valuero:" + o.key, name: o.name, sub: (o.ratesLabel || "") + " · " + (+o.feeBookings || 0) + " Buchungen " + year,
      unbilled: open, invoiced: billedSum, paid: round2(st.paid), open: round2(st.open), refund, accrued: prov, last: links[links.length - 1] || null, invoices: links.slice(-4).reverse(),
      action: open > 0.005 ? { kind: "valuero", title: "Rechnung · VALUERO-Gebühren", contactName: o.name || "", headText: "Vermittlungsgebühren VALUERO " + year + ".",
        items: [{ name: "VALUERO Vermittlungsgebühren " + year, text: (o.ratesLabel ? o.ratesLabel + " · " : "") + "lt. Buchungsaufstellung", qty: 1, priceGross: open, taxRate: 20 }],
        after: { billing: { key: "valuero:" + o.key, label: o.name || o.key } } } : null });
  });
  // 4) Blitzdings: jede Buchung braucht eine Rechnung (Abgleich über Buchungsnummer bzw. Kunde + Betrag/Datum)
  ((blitz && blitz.upcoming) || []).forEach(b => {
    const amt = round2((+b.totalCents || 0) / 100); if (!(amt > 0)) return;
    const ref = String(b.reference || "").toLowerCase(), cust = String(b.customerName || "").toLowerCase(), day = String(b.eventDate || "").slice(0, 10);
    let hit = ref ? sevInv.find(i => (i.ref || "").toLowerCase().indexOf(ref) > -1 && i.type !== "SR") : null;
    if (!hit && cust) hit = sevInv.find(i => i.type !== "SR" && String(i.contact || "").toLowerCase() === cust && (Math.abs(i.gross - amt) < 0.02 || (day && (i.date === day || i.delivery === day))));
    const rec = recs("blitz:" + b.id).slice(-1)[0];
    const link = hit ? invLink({ id: hit.id, nr: hit.nr, date: hit.date, gross: hit.gross }, sevById, "") : (rec ? invLink(rec, sevById, oldest) : null);
    if (link && link.id) linked[link.id] = 1;
    const paidOnPlatform = b.paymentStatus === "PAID";
    const extras = (b.extras || []).map(e => e && e.name).filter(Boolean).join(", ");
    items.push({ src: "blitzdings", key: "blitz:" + b.id, name: (b.customerName || "Buchung") + (b.package ? " · " + b.package : ""), sub: (day ? deDate(day) : "") + (b.reference ? " · " + b.reference : "") + (paidOnPlatform ? " · bezahlt laut Blitzdings" : " · Zahlung offen laut Blitzdings"),
      unbilled: link ? 0 : amt, invoiced: link ? link.gross : 0, paid: link && link.state === "bezahlt" ? link.gross : 0, open: link ? link.open : 0, refund: 0, paidOnPlatform, last: link, invoices: link ? [link] : [],
      action: link ? null : { kind: "blitzdings", title: "Rechnung · Blitzdings-Buchung", contactName: b.customerName || "", deliveryDate: day || undefined, headText: (b.reference ? "Buchung " + b.reference + " – " : "") + "vielen Dank für Ihre Buchung bei Blitzdings.",
        items: [{ name: "Blitzdings " + (b.package || "Fotobox"), text: [day ? "Event am " + deDate(day) : "", b.location ? "Ort: " + b.location : "", extras ? "inkl. " + extras : ""].filter(Boolean).join(" · "), qty: 1, priceGross: amt, taxRate: 20 }], after: {} } });
  });
  // 5) Kantineur: Abos laufen automatisch über die Plattform
  if (kantineur) items.push({ src: "kantineur", key: "kantineur", name: "Kantineur-Abos", sub: ((kantineur.subscribers && kantineur.subscribers.paying) || 0) + " zahlende Kantinen · MRR " + ((kantineur.mrrCents || 0) / 100).toFixed(2).replace(".", ",") + " €",
    unbilled: 0, invoiced: round2((kantineur.revenueGrossCents || 0) / 100), paid: round2((kantineur.revenueGrossCents || 0) / 100), open: 0, refund: 0, auto: true, last: null, invoices: [], action: null });
  // 6) Offene sevDesk-Rechnungen ohne Zuordnung
  const unlinked = sevInv.filter(i => !linked[i.id] && (i.status === 200 || i.status === 750) && i.open > 0.005).map(i => ({ id: i.id, nr: i.nr, contact: i.contact, date: i.date, due: i.due, gross: i.gross, open: i.open, overdue: i.overdue }));
  const totals = items.reduce((t, x) => { t.unbilled += x.unbilled || 0; t.open += x.open || 0; t.refund += x.refund || 0; if (x.unbilled > 0.005) t.unbilledCount++; if (x.invoices.some(l => l && l.state === "fehlt")) t.missing++; return t; }, { unbilled: 0, open: 0, refund: 0, unbilledCount: 0, missing: 0 });
  ["unbilled", "open", "refund"].forEach(k => { totals[k] = round2(totals[k]); });
  return { items, unlinked, totals };
}

function sevSummary(sev, year, today) {
  if (!sev || !sev.invoices) return null;
  const inv = sev.invoices, yr = String(year);
  const counted = inv.filter(i => (i.status === 200 || i.status === 750 || i.status === 1000) && String(i.date || "").slice(0, 4) === yr);
  const byMonth = new Array(12).fill(0); counted.forEach(i => { const m = parseInt(String(i.date).slice(5, 7), 10) - 1; if (m >= 0 && m < 12) byMonth[m] += i.gross; });
  const open = inv.filter(i => i.open > 0.005), overdue = open.filter(i => i.overdue);
  return { fetchedAt: sev.fetchedAt, revenueYear: round2(counted.reduce((a, i) => a + i.gross, 0)), byMonth: byMonth.map(round2),
    openSum: round2(open.reduce((a, i) => a + i.open, 0)), openCount: open.length, overdueSum: round2(overdue.reduce((a, i) => a + i.open, 0)), overdueCount: overdue.length,
    drafts: inv.filter(i => i.status === 100).length, invoices: inv.slice(0, 600), accounts: sev.accounts || [], unassigned: sev.unassigned || 0, vouchers: sev.vouchers || {}, transactions: (sev.transactions || []).slice(0, 120) };
}


// ── Skikaiser: In-App-Käufe (Einmalkäufe) ──
// Erwartet von der App-API (SKIKAISER_STATS_URL?token=…&year=…) entweder eine Kaufliste
// { purchases:[{ id, date, productId, productName, priceCents, proceedsCents, platform, country, refunded }] }
// oder fertige Summen { totals:{grossCents,proceedsCents,count}, byMonth:[{month,grossCents,proceedsCents,count}], byProduct:[{productId,name,count,grossCents,proceedsCents}] }.
const SKIKAISER = { url: process.env.SKIKAISER_STATS_URL || "", token: process.env.SKIKAISER_STATS_TOKEN || "" };
async function skikaiserStats(year) {
  if (!SKIKAISER.url) return { configured: false };
  const d = await getJSON(SKIKAISER.url + (SKIKAISER.url.indexOf("?") > -1 ? "&" : "?") + "token=" + encodeURIComponent(SKIKAISER.token) + yearParam(year));
  if (!d || d.error) return { configured: true, error: (d && d.error) || "keine_antwort" };
  const yr = String(year);
  let byMonth = {}, byProduct = {}, byPlatform = {}, totals = { grossCents: 0, proceedsCents: 0, count: 0, refunds: 0 }, recent = [];
  if (Array.isArray(d.purchases)) {
    d.purchases.forEach(p => {
      const day = String(p.date || "").slice(0, 10); if (yr && day.slice(0, 4) !== yr) return;
      const g = +p.priceCents || 0, pr = p.proceedsCents != null ? +p.proceedsCents : Math.round(g * 0.85);
      if (p.refunded) { totals.refunds++; return; }
      totals.grossCents += g; totals.proceedsCents += pr; totals.count++;
      const m = day.slice(0, 7); const bm = byMonth[m] || (byMonth[m] = { month: m, grossCents: 0, proceedsCents: 0, count: 0 }); bm.grossCents += g; bm.proceedsCents += pr; bm.count++;
      const k = p.productId || p.productName || "?"; const bp = byProduct[k] || (byProduct[k] = { productId: k, name: p.productName || k, grossCents: 0, proceedsCents: 0, count: 0 }); bp.grossCents += g; bp.proceedsCents += pr; bp.count++;
      const pl = p.platform || "?"; const bq = byPlatform[pl] || (byPlatform[pl] = { platform: pl, grossCents: 0, count: 0 }); bq.grossCents += g; bq.count++;
    });
    recent = d.purchases.filter(p => !p.refunded).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 15).map(p => ({ date: p.date, name: p.productName || p.productId, priceCents: +p.priceCents || 0, platform: p.platform || "", country: p.country || "" }));
  } else {
    totals = Object.assign(totals, d.totals || {});
    (d.byMonth || []).forEach(m => { byMonth[m.month] = { month: m.month, grossCents: +m.grossCents || 0, proceedsCents: +m.proceedsCents || 0, count: +m.count || 0 }; });
    (d.byProduct || []).forEach(p => { byProduct[p.productId || p.name] = { productId: p.productId || p.name, name: p.name || p.productId, grossCents: +p.grossCents || 0, proceedsCents: +p.proceedsCents || 0, count: +p.count || 0 }; });
    (d.byPlatform || []).forEach(p => { byPlatform[p.platform] = p; });
  }
  return { configured: true, fetchedAt: d.fetchedAt || new Date().toISOString(), totals, byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)), byProduct: Object.values(byProduct).sort((a, b) => b.grossCents - a.grossCents), byPlatform: Object.values(byPlatform), recent, users: d.users || null };
}

// ── Geschätztes Monatseinkommen ──
// Kantineur: laufende Abos (MRR, live). kochdu, VALUERO, Skikaiser: Prognose, die nur alle 14 Tage neu berechnet wird.
const FORECAST_FILE = path.join(DATA_DIR, "forecast.json");
function readForecast() { try { return JSON.parse(fs.readFileSync(FORECAST_FILE, "utf8")) || {}; } catch (e) { return {}; } }
function writeForecast(o) { try { fs.writeFileSync(FORECAST_FILE, JSON.stringify(o)); } catch (e) {} }
function kochduCumCents(ko) { const t = (ko && ko.totals) || {}; return (+t.barOpenCents || 0) + (+t.barSettledCents || 0) + (+t.onlineProvisionCents || 0); }
// Tägliche Stände merken, damit die kochdu-Prognose auf echten Zuwächsen der letzten Wochen beruht
function forecastSnapshot(fc, today, ko) {
  fc.history = fc.history || {};
  if (ko && ko.totals) fc.history[today] = Object.assign({}, fc.history[today] || {}, { kochdu: kochduCumCents(ko) });
  const keys = Object.keys(fc.history).sort(); while (keys.length > 420) delete fc.history[keys.shift()];
}
function monthsBack(today, n) { const out = []; let y = +today.slice(0, 4), m = +today.slice(5, 7); for (let i = 0; i < n; i++) { m--; if (m === 0) { m = 12; y--; } out.push(y + "-" + String(m).padStart(2, "0")); } return out; }
function valueroForecast(va, vaPrev, today) {
  const sumMonth = (src, mk) => ((src && src.objects) || []).reduce((a, o) => a + ((o.months || []).filter(x => x.month === mk).reduce((b, x) => b + (+x.provisionCents || 0), 0)), 0);
  const last3 = monthsBack(today, 3);                                     // die letzten drei vollen Monate
  const cur = last3.map(mk => sumMonth(+mk.slice(0, 4) === +today.slice(0, 4) ? va : vaPrev, mk));
  const base = cur.reduce((a, b) => a + b, 0) / 3;
  // Saison: Verhältnis "kommender Monat" zu "letzte drei Monate" im Vorjahr (Wintersaison im Montafon)
  const nextMk = (+today.slice(0, 4) - 1) + "-" + today.slice(5, 7);
  const prevLast3 = last3.map(mk => (+mk.slice(0, 4) - 1) + mk.slice(4));
  const pBase = prevLast3.reduce((a, mk) => a + sumMonth(vaPrev, mk), 0) / 3, pNext = sumMonth(vaPrev, nextMk);
  let factor = 1, note = "Schnitt der letzten 3 Monate";
  if (pBase > 0 && pNext > 0) { factor = Math.max(0.4, Math.min(2.5, pNext / pBase)); note = "Schnitt der letzten 3 Monate × Saisonfaktor " + factor.toFixed(2).replace(".", ",") + " aus dem Vorjahr"; }
  return { monthly: round2(base * factor / 100), basis: note, months: last3.reverse().map((mk, i) => ({ month: mk, eur: round2(cur[2 - i] / 100) })) };
}
function kochduMonths(ko, n) {
  const bm = (ko && Array.isArray(ko.byMonth) ? ko.byMonth : []).filter(m => m && /^\d{4}-\d{2}$/.test(m.month || "")).sort((a, b) => a.month.localeCompare(b.month));
  return bm.slice(-(n || 6)).map(m => ({ month: m.month, eur: round2((+m.provisionCents || 0) / 100), orders: +m.orders || 0 }));
}
function kochduForecast(fc, ko, today) {
  const months = kochduMonths(ko, 6);
  // Bevorzugt: Provision der letzten 30 Tage direkt von kochdu (bar + online) – live, nicht eingefroren
  const tr = ko && ko.trend;
  if (tr && tr.last30Cents != null) {
    const last = +tr.last30Cents || 0, prev = +tr.prev30Cents || 0;
    let basis = "Provision der letzten 30 Tage (bar + online)";
    if (prev > 0) { const pct = Math.round((last - prev) / prev * 100); basis += ", " + (pct >= 0 ? "+" : "") + pct + " % ggü. Vormonat"; }
    return { monthly: round2(last / 100 * 30.4 / 30), basis, months, live: true };
  }
  const hist = fc.history || {}, keys = Object.keys(hist).filter(k => hist[k].kochdu != null && k.slice(0, 4) === today.slice(0, 4)).sort();
  const nowC = kochduCumCents(ko);
  // Sonst: Zuwachs der letzten ~60 Tage (mind. 21 Tage Daten), sonst Schnitt seit dem ersten Monat mit Provision
  const from = keys.find(k => (Date.parse(today) - Date.parse(k)) / 864e5 <= 60);
  if (from) { const days = (Date.parse(today) - Date.parse(from)) / 864e5; if (days >= 21) { const perDay = (nowC - hist[from].kochdu) / days; if (perDay >= 0) return { monthly: round2(perDay * 30.4 / 100), basis: "Zuwachs der letzten " + Math.round(days) + " Tage", months }; } }
  // Start nicht am 1. Jänner, sondern im ersten Monat mit Provision (sonst wird die Schätzung bei Start mitten im Jahr viel zu niedrig)
  let startIso = today.slice(0, 4) + "-01-01";
  const firstBm = ((ko && ko.byMonth) || []).filter(m => m && (+m.provisionCents || 0) > 0 && String(m.month || "").slice(0, 4) === today.slice(0, 4)).map(m => m.month).sort()[0];
  const firstOrder = ko && ko.trend && ko.trend.firstOrderAt ? String(ko.trend.firstOrderAt).slice(0, 10) : "";
  if (firstBm && firstBm + "-01" > startIso) startIso = firstBm + "-01";
  else if (/^\d{4}-\d{2}-\d{2}$/.test(firstOrder) && firstOrder > startIso) startIso = firstOrder;
  const days = Math.max(1, (Date.parse(today) - Date.parse(startIso)) / 864e5 + 1);
  return { monthly: round2(nowC / days * 30.4 / 100), basis: (startIso.slice(5) === "01-01" ? "Jahresschnitt " + today.slice(0, 4) : "Schnitt seit " + startIso.slice(8, 10) + "." + startIso.slice(5, 7) + "." + startIso.slice(0, 4)) + " (genauer, sobald 3 Wochen Verlauf vorliegen)", months };
}
async function incomeForecast(ctx) {
  const { today, year, k, ko, va, ski, sites, force } = ctx;
  const fc = readForecast();
  const curYear = String(year) === today.slice(0, 4);
  if (curYear) forecastSnapshot(fc, today, ko);
  const age = fc.computedAt ? (Date.parse(today) - Date.parse(fc.computedAt)) / 864e5 : 999;
  if (curYear && (force || age >= 14 || !fc.sources)) {
    const vaPrev = await withTimeout(valueroStats(String(+today.slice(0, 4) - 1)), 8000, null);
    const sources = {};
    if (ko && ko.totals) sources.kochdu = kochduForecast(fc, ko, today);
    if (va && va.objects) sources.valuero = valueroForecast(va, vaPrev, today);
    if (ski && ski.configured && ski.byMonth) { const last = monthsBack(today, 3).map(mk => (ski.byMonth.find(m => m.month === mk) || {}).proceedsCents || 0); sources.skikaiser = { monthly: round2(last.reduce((a, b) => a + b, 0) / 3 / 100), basis: "Schnitt der letzten 3 Monate (Erlös nach Store-Gebühr)" }; }
    fc.sources = sources; fc.computedAt = today;
  }
  writeForecast(fc);
  const lines = [];
  if (k) lines.push({ key: "kantineur", label: "Kantineur", monthly: round2((k.mrrCents || 0) / 100), basis: "laufende Abos (aktuell)", live: true });
  // kochdu mit Trend-Daten: bei jedem Aufruf live berechnen statt 14 Tage einzufrieren
  const koLive = curYear && ko && ko.trend && ko.totals ? kochduForecast(fc, ko, today) : null;
  ["kochdu", "valuero", "skikaiser"].forEach(key => { const s = key === "kochdu" && koLive ? koLive : (fc.sources && fc.sources[key]); if (s) lines.push(Object.assign({ key, label: { kochdu: "kochdu", valuero: "VALUERO", skikaiser: "Skikaiser" }[key], live: false }, s)); });
  const hosting = round2((sites || []).filter(s => s.active && !s.own).reduce((a, s) => a + (s.incomeYear || 0), 0) / 12);
  if (hosting > 0) lines.push({ key: "hosting", label: "Websites (Hosting & Domains)", monthly: hosting, basis: "fixe Verträge, Jahresbetrag ÷ 12", live: true });
  const next = fc.computedAt ? new Date(Date.parse(fc.computedAt) + 14 * 864e5).toISOString().slice(0, 10) : null;
  return { lines, total: round2(lines.reduce((a, l) => a + l.monthly, 0)), computedAt: fc.computedAt || null, nextAt: next };
}
async function cockpitBuild(year, forceForecast) {
  const today = viennaToday();
  const [sev, sitesSnap, rwc, k, b, ko, va, mail, cal, pc, ski] = await Promise.all([
    withTimeout(sevSnapshot(), 12000, null), withTimeout(sitesSnapshot(), 9000, null), withTimeout(railwayCosts(), 6000, null),
    withTimeout(kantineurStats(year), 8000, null), withTimeout(blitzdingsStats(year), 8000, null), withTimeout(kochduStats(year), 8000, null), withTimeout(valueroStats(year), 8000, null),
    withTimeout(mailSnapshot(), 8000, null), withTimeout(calendarEvents(), 6000, null), withTimeout(privateCalQuick(), 7000, null), withTimeout(skikaiserStats(year), 8000, { configured: !!SKIKAISER.url, error: "timeout" }),
  ]);
  const bill = readBilling();
  const abgleich = abgleichBuild({ year, today, sev, bill, sitesSnap, kochdu: ko, valuero: va, blitz: b, kantineur: k });
  const P = bill.prices || {};
  const sites = cockpitSites(sitesSnap).map(s => {
    const c = siteCfgOf(bill, s), cost = rwc && rwc.projects && s.rwId ? rwc.projects[s.rwId] : null;
    const doms = regDomainsOf(s.domains), domYear = doms.reduce((a, d) => a + (d.year || 0), 0);
    const incomeYear = c.active && !c.own ? round2(siteLinesOf(s, c, P).reduce((a, l) => a + l.amount, 0) * 12 / (+P.period || 12)) : 0;
    const w4yY = w4yYear(c), costYear = round2((cost ? cost.eur * 365 / 30 : 0) + domYear + w4yY);
    return Object.assign({}, s, { own: c.own, active: c.active, customer: c.customer, billedUntil: c.billedUntil, railwayMonth: cost ? cost.eur : null, domains: s.domains, domainYear: round2(domYear), w4y: c.w4y, w4yQty: c.w4yQty, w4yYear: w4yY, incomeYear, costYear, result: round2(incomeYear - costYear) });
  });
  const msgs = mail && Array.isArray(mail.messages) ? mail.messages : [];
  const events = [].concat(
    (cal && cal.events || []).map(e => ({ id: e.id, title: e.title || "Termin", date: String(e.date || e.start || "").slice(0, 10), time: e.time || "", source: "kalender" })),
    (pc && pc.events || []).map(e => ({ id: e.id, title: e.title, date: e.date, time: e.time, endTime: e.endTime, location: e.location, source: "icloud", cal: e.calName || "" })),
    readEvents().map(e => ({ id: e.id, title: e.title || "Termin", date: String(e.date || "").slice(0, 10), time: e.time || "", source: "manuell", sparte: e.sparte || "" }))
  ).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date >= ymdAdd(today, -1) && e.date <= ymdAdd(today, 60)).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  const income = await withTimeout(incomeForecast({ today, year, k, ko, va, ski, sites, force: forceForecast }), 10000, null);
  return {
    fetchedAt: new Date().toISOString(), year, today, income, skikaiser: ski,
    leads: readLeads().slice().reverse(),
    sev: sevSummary(sev, year, today), sevConfigured: !!(SEV.key || SEV_SRC.projectId),
    abgleich,
    platforms: {
      kochdu: ko ? { totals: ko.totals || {}, restaurants: ko.restaurants || [], nutzer: ko.nutzer || null, fetchedAt: ko.fetchedAt } : null,
      blitzdings: b ? { revenue: b.revenue || {}, bookings: b.bookings || {}, upcoming: b.upcoming || [], fetchedAt: b.fetchedAt } : null,
      kantineur: k, valuero: va,
    },
    sites, railwayCosts: rwc ? { totalEur: rwc.totalEur, fx: rwc.fx } : null, railwayFailed: (sitesSnap && sitesSnap.railway && sitesSnap.railway.totals && sitesSnap.railway.totals.failed) || 0,
    mail: { accounts: (mail && mail.accounts) || [], fetchedAt: mail && mail.fetchedAt, messages: msgs.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 200) },
    events, todos: readTodos(),
  };
}
let COCKPIT_MEMO = { at: 0, key: "", data: null, p: null };
async function cockpitData(year, force, forceForecast) {
  const key = String(year);
  if (!force && !forceForecast && COCKPIT_MEMO.data && COCKPIT_MEMO.key === key && Date.now() - COCKPIT_MEMO.at < 15000) return COCKPIT_MEMO.data;
  if (COCKPIT_MEMO.p && COCKPIT_MEMO.key === key) return COCKPIT_MEMO.p;
  COCKPIT_MEMO.key = key;
  COCKPIT_MEMO.p = cockpitBuild(year, forceForecast).then(d => { COCKPIT_MEMO = { at: Date.now(), key, data: d, p: null }; return d; }).catch(e => { COCKPIT_MEMO.p = null; throw e; });
  return COCKPIT_MEMO.p;
}
// Lead bearbeiten: Phase, geschätzter Wert, Notizen (Daten bleiben in leads.json)
function leadOp(pl) {
  const leads = readLeads();
  if (pl.op === "create") {
    const l = { id: "lead_" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"), created: new Date().toISOString(), name: clip(pl.name, 120), email: clip(pl.email, 160), phone: clip(pl.phone, 60), company: clip(pl.company, 160), topic: clip(pl.topic, 80) || "Website", entwurf: false, message: clip(pl.message, 5000), source: "manuell", stage: "anfrage" };
    if (!l.name && !l.company) throw new Error("name_fehlt");
    leads.push(l);
  } else if (pl.op === "update") {
    const l = leads.find(x => x.id === pl.id); if (!l) throw new Error("lead_unbekannt");
    const P = pl.patch || {};
    if ("stage" in P) { if (LEAD_STAGES.indexOf(P.stage) < 0) throw new Error("bad_stage"); l.stage = P.stage; l.history = (l.history || []).concat([{ at: new Date().toISOString(), stage: P.stage }]).slice(-30); }
    if ("value" in P) { const n = parseFloat(P.value); l.value = isFinite(n) && n >= 0 ? round2(n) : 0; }
    if ("notes" in P) l.notes = clip(P.notes, 5000);
    ["name", "company", "email", "phone", "topic"].forEach(f => { if (f in P) l[f] = clip(P[f], 160); });
    l.updated = new Date().toISOString();
  } else throw new Error("bad_op");
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads));
  COCKPIT_MEMO.at = 0;
  return leads.slice().reverse();
}
// Module liegen in admin-cockpit/*.js (core.js und shared.js zuerst, dann alphabetisch) und werden nur nach Login ausgeliefert.
const COCKPIT_DIR = path.join(ROOT, "admin-cockpit");
function cockpitModules() {
  let files = []; try { files = fs.readdirSync(COCKPIT_DIR).filter(f => /^[a-z0-9-]+\.js$/.test(f)); } catch (e) {}
  const first = ["core.js", "shared.js"];
  return first.filter(f => files.indexOf(f) > -1).concat(files.filter(f => first.indexOf(f) < 0).sort());
}
function cockpitHtml() {
  let html; try { html = fs.readFileSync(path.join(ROOT, "admin-cockpit.html"), "utf8"); } catch (e) { return "<!doctype html><p>admin-cockpit.html fehlt.</p>"; }
  const v = encodeURIComponent(String(BUILD).slice(0, 12));
  return html.replace("<!--MODULES-->", cockpitModules().map(f => '<script src="/admin/neu/' + f + '?v=' + v + '"></script>').join("\n"));
}
function cockpitModule(name) {
  if (!/^[a-z0-9-]+\.js$/.test(name)) return null;
  try { return fs.readFileSync(path.join(COCKPIT_DIR, name)); } catch (e) { return null; }
}


// ── Steuer: UVA (U30), ZM (U13) und Jahresabschluss (E1a/U1/E1) – Rohdaten aus sevDesk + gespeicherter Status ──
// Rechenkern liegt in admin-cockpit/steuer-calc.js und wird hier wie im Browser verwendet (gleiche Kennzahlen für FinanzOnline).
const STEUER_CALC = require("./admin-cockpit/steuer-calc.js");
const STEUER_FILE = path.join(DATA_DIR, "steuer.json");
function readSteuer() {
  let o = {}; try { o = JSON.parse(fs.readFileSync(STEUER_FILE, "utf8")) || {}; } catch (e) {}
  o.settings = Object.assign({ zeitraum: "quartal", steuernummer: "" }, o.settings || {});
  o.settings.besteuerung = "soll";                                   // FS Creative: Sollbesteuerung (vereinbarte Entgelte) – fix
  o.mapping = o.mapping || {}; o.uva = o.uva || {}; o.jab = o.jab || {}; o.docs = o.docs || {};
  o.uvaManual = o.uvaManual || {}; o.jabInput = o.jabInput || {}; o.trips = o.trips || {}; o.ruleMap = o.ruleMap || {}; o.supMap = o.supMap || {}; o.u1 = o.u1 || {};
  o.fon = Object.assign({ nextPaket: 1, archive: [] }, o.fon || {});
  return o;
}
function writeSteuer(o) { try { fs.writeFileSync(STEUER_FILE, JSON.stringify(o)); return true; } catch (e) { return false; } }
// Für den Browser: Archiv ohne XML (das gibt es einzeln)
function steuerPublic(o) { return { vies: o.vies || {}, settings: o.settings, mapping: o.mapping, uva: o.uva, jab: o.jab, docs: o.docs, ruleMap: o.ruleMap, supMap: o.supMap, u1: o.u1, uvaManual: o.uvaManual, jabInput: o.jabInput, trips: o.trips, fon: { archive: (o.fon.archive || []).map(a => Object.assign({}, a, { xml: undefined })) } }; }
// Alle Seiten laden; doppelte Objekte (z. B. wenn offset ignoriert wird) werden entfernt und gezählt
async function sevAll(pathq, query, max, stats) {
  const out = []; const seen = new Set(); const lim = 1000; let dupes = 0;
  for (let off = 0; off < (max || 6000); off += lim) {
    const j = await sev("GET", pathq, { query: Object.assign({ limit: lim, offset: off }, query || {}), timeout: 40000 });
    const arr = (j && j.objects) || []; let fresh = 0;
    arr.forEach(o => { const id = o && o.id != null ? String(o.id) : null; if (id && seen.has(id)) { dupes++; return; } if (id) seen.add(id); out.push(o); fresh++; });
    if (arr.length < lim || !fresh) break;
  }
  if (stats) stats[pathq] = (stats[pathq] || 0) + dupes;
  return out;
}
// Kategorie einer Position: sevDesk Update 1.0 liefert accountingType, Update 2.0 accountDatev (Buchungskonto).
// Name/Nummer des accountDatev kommen – falls nicht eingebettet – aus der ReceiptGuidance (accountDatevId → accountNumber/accountName).
// Fehlt beides, erkennt der Rechenkern Steuerzahlungen/Privat/SVS über Kontonummer bzw. Lieferant (nie Abbruch).
function sevPosLines(pos, key, acc) {
  const by = {}; acc = acc || {};
  pos.forEach(x => { const id = x && x[key] && x[key].id; if (!id) return; const ad = (x.accountDatev && typeof x.accountDatev === "object") ? x.accountDatev : {}, g = (ad.id != null && acc[String(ad.id)]) || {};
    const at = Object.assign({}, x.accountingType && typeof x.accountingType === "object" ? x.accountingType : {});
    if (!at.name) { at.name = ad.name || g.name || ""; if (!at.id && ad.id != null) at.id = "d" + ad.id; }
    // InvoicePos liefert laut API keine sumNet/sumTax (nur price/priceNet/priceTax bzw. sum*Accounting) – daher robust lesen;
    // der Rechenkern gleicht die Positionen ohnehin auf die Kopfsummen des Belegs ab.
    const rate = sevNum(x.taxRate), q = x.quantity != null ? sevNum(x.quantity) : 1;
    const pick = (...ks) => { for (const k of ks) if (x[k] != null && x[k] !== "") return sevNum(x[k]); return null; };
    let net = pick("sumNet", "sumNetAccounting"); if (net == null) { const pn = pick("priceNet"); net = pn != null ? pn * q : (pick("price") || 0) * q; }
    let tax = pick("sumTax", "sumTaxAccounting"); if (tax == null) { const g = pick("sumGross", "sumGrossAccounting"); tax = g != null ? g - net : Math.round(net * rate) / 100; }
    (by[id] = by[id] || []).push({ rate, net, tax, cat: at.name || "", catId: at.id ? String(at.id) : "", catType: at.type || "", catNo: String(ad.accountNumber || g.no || ""), isAsset: x.isAsset === true || x.isAsset === "1" || x.isAsset === 1 }); });
  return by;
}
// UID des Kontakts: vatNumber, sonst taxNumber, wenn sie wie eine EU-UID aussieht
function sevUid(c) { c = c || {}; const v = String(c.vatNumber || "").replace(/[\s.\-]/g, "").toUpperCase(); if (v) return v; const t = String(c.taxNumber || "").replace(/[\s.\-]/g, "").toUpperCase(); return STEUER_CALC.uidValid(t).ok ? t : ""; }
let STEUER_CACHE = { at: 0, data: null, p: null };
async function steuerRaw(force) {
  if (!force && STEUER_CACHE.data && Date.now() - STEUER_CACHE.at < 10 * 60 * 1000) return STEUER_CACHE.data;
  if (STEUER_CACHE.p) return STEUER_CACHE.p;
  STEUER_CACHE.p = (async () => {
    const dupes = {};
    const [inv, ipos, vou, vpos, cn, cnpos, tx, logs, addr, guide, guideRev, guideExp, tsets] = await Promise.all([
      // showAll: laut sevDesk-Doku sonst nicht alle Rechnungsarten (SR/AR/TR/ER) in der Liste
      sevAll("/Invoice", { embed: "contact,addressCountry", showAll: true }, 6000, dupes), sevAll("/InvoicePos", {}, 20000, dupes),
      sevAll("/Voucher", { embed: "supplier" }, 6000, dupes),
      // Update 2.0: accountDatev; Update 1.0: accountingType – beide einbetten, bei Ablehnung der Kombination stufenweise zurückfallen
      sevAll("/VoucherPos", { embed: "accountingType,accountDatev" }, 20000, dupes).catch(() => sevAll("/VoucherPos", { embed: "accountingType" }, 20000, dupes)).catch(() => sevAll("/VoucherPos", {}, 20000, dupes)),
      sevAll("/CreditNote", { embed: "contact" }, 3000, dupes).catch(() => []), sevAll("/CreditNotePos", {}, 6000, dupes).catch(() => []),
      sevAll("/CheckAccountTransaction", {}, 6000, dupes).catch(() => []),
      // Zahlungszuordnungen (für Teilzahlungen je Zahlungsdatum) – nicht in der offiziellen Doku, daher optional
      sevAll("/CheckAccountTransactionLog", {}, 20000, dupes).catch(() => []),
      sevAll("/ContactAddress", { embed: "country" }, 6000, dupes).catch(() => []),   // Land der Kunden/Lieferanten (für RC/ZM)
      sev("GET", "/ReceiptGuidance/forAllAccounts", { timeout: 40000 }).catch(() => null),  // Steuerregeln des Kontos (Diagnose)
      sev("GET", "/ReceiptGuidance/forRevenue", { timeout: 40000 }).catch(() => null),      // Regeln der Erlöskonten (Ausgangsrechnungen)
      sev("GET", "/ReceiptGuidance/forExpense", { timeout: 40000 }).catch(() => null),      // Regeln der Aufwandskonten
      // Update-1.0-Konten (taxType "custom" + taxSet): eigene Steuersätze/-kategorien – nicht in der offiziellen Doku, daher optional
      sev("GET", "/TaxSet", { query: { limit: 1000 }, timeout: 40000 }).catch(() => null),
    ]);
    const ctry = {}; addr.forEach(a => { const cid = a.contact && a.contact.id, c = a.country && (a.country.code || ""); if (cid && c && !ctry[cid]) ctry[cid] = String(c).toUpperCase(); });
    const acc = {}; ((guide && guide.objects) || []).forEach(g => { if (g && g.accountDatevId != null) acc[String(g.accountDatevId)] = { no: String(g.accountNumber || ""), name: g.accountName || "" }; });
    // TaxSets (Name/Satz) – fehlt der Abruf, wenigstens die IDs aus den Belegen und den taxText der Rechnungen übernehmen
    const tsBy = {}; ((tsets && tsets.objects) || []).forEach(t => { if (t && t.id != null) tsBy[String(t.id)] = { id: String(t.id), name: String(t.text || t.name || t.displayText || "").slice(0, 120), rate: t.taxRate != null ? sevNum(t.taxRate) : null }; });
    const tsSeen = (o, txt) => { const id = o && o.taxSet && o.taxSet.id != null ? String(o.taxSet.id) : ""; if (!id) return ""; const x = tsBy[id] = tsBy[id] || { id, name: "", rate: null }; if (!x.name && o.taxSet.text) x.name = String(o.taxSet.text).slice(0, 120); if (!x.name && txt) x.name = String(txt).slice(0, 120); return id; };
    const posBy = sevPosLines(ipos, "invoice"), vposBy = sevPosLines(vpos, "voucher", acc), cnBy = sevPosLines(cnpos, "creditNote");
    const txBy = {}; tx.forEach(t => { txBy[String(t.id)] = sevDay(t.valueDate || t.entryDate); });
    const pays = {};
    logs.forEach(l => { const ob = l.object || l.objectFrom || {}; const id = ob.id; if (!id) return; const kind = ob.objectName || "";
      const amount = sevNum(l.ammountPayed != null ? l.ammountPayed : (l.amountPayed != null ? l.amountPayed : l.amount));
      const t = l.checkAccountTransaction && l.checkAccountTransaction.id; const date = (t && txBy[String(t)]) || sevDay(l.bookingDate || l.create);
      if (!amount || !date) return; (pays[kind + ":" + id] = pays[kind + ":" + id] || []).push({ date, amount }); });
    // Zahlungen nur übernehmen, wenn sie zum bezahlten Betrag passen – sonst gilt das Zahlungsdatum aus sevDesk
    const paysFor = (kind, id, paid) => { const a = pays[kind + ":" + id]; if (!a) return undefined; const s = a.reduce((x, p) => x + p.amount, 0); return Math.abs(Math.abs(s) - Math.abs(paid)) < 0.05 ? a.sort((x, y) => x.date.localeCompare(y.date)) : undefined; };
    const country = o => (o && (o.code || o.translationCode) ? String(o.code || "").toUpperCase() : "");
    const invoices = inv.filter(o => o.invoiceType !== "MA").map(o => {
      const c = o.contact || {}, paid = sevNum(o.paidAmount);
      return { id: String(o.id), nr: o.invoiceNumber || "", type: o.invoiceType || "RE", status: parseInt(o.status, 10) || 0, date: sevDay(o.invoiceDate), delivery: sevDay(o.deliveryDate), deliveryUntil: sevDay(o.deliveryDateUntil) || null, payDate: sevDay(o.payDate),
        taxSet: tsSeen(o, o.taxText), origin: o.origin && o.origin.id != null ? String(o.origin.id) : "", contactId: c.id != null ? String(c.id) : "",
        // gedruckte Adresse und Texte: Land/UID/„Reverse Charge“-Hinweise erkennen, wenn Kontakt-Land oder -UID fehlen
        addrText: String(o.address || "").slice(0, 600), taxText: String(o.taxText || "").slice(0, 200), texts: String((o.headText || "") + "\n" + (o.footText || "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1500), taxType: o.taxType || "default", taxRule: o.taxRule && o.taxRule.id ? String(o.taxRule.id) : "", contact: sevName(c), uid: sevUid(c), country: country(o.addressCountry) || ctry[c.id] || "",
        net: sevNum(o.sumNet), tax: sevNum(o.sumTax), gross: sevNum(o.sumGross), paid, enshrined: !!o.enshrined, pays: paysFor("Invoice", o.id, paid), lines: posBy[o.id] || [] };
    });
    const vouchers = vou.map(v => { const s = v.supplier || {}, paid = sevNum(v.paidAmount);
      return { id: String(v.id), type: v.voucherType || "VOU", date: sevDay(v.voucherDate), delivery: sevDay(v.deliveryDate), deliveryUntil: sevDay(v.deliveryDateUntil) || null, payDate: sevDay(v.payDate), status: parseInt(v.status, 10) || 0, cd: v.creditDebit, taxType: v.taxType || "default", taxRule: v.taxRule && v.taxRule.id ? String(v.taxRule.id) : "", taxSet: tsSeen(v, ""),
        supplier: v.supplierName || sevName(s) || "", supplierUid: String(s.vatNumber || "").replace(/\s/g, "").toUpperCase(), supplierCountry: (s.id && ctry[s.id]) || "", desc: v.description || "", net: sevNum(v.sumNet), tax: sevNum(v.sumTax), gross: sevNum(v.sumGross), paid,
        enshrined: !!v.enshrined, pays: paysFor("Voucher", v.id, paid), lines: vposBy[v.id] || [] }; });
    const creditNotes = cn.map(o => ({ id: "cn" + o.id, sevId: String(o.id), nr: o.creditNoteNumber || "", type: "GU", taxSet: tsSeen(o, o.taxText), status: parseInt(o.status, 10) || 0, date: sevDay(o.creditNoteDate), delivery: sevDay(o.deliveryDate),
      taxType: o.taxType || "default", taxRule: o.taxRule && o.taxRule.id ? String(o.taxRule.id) : "", contact: sevName(o.contact), uid: String((o.contact || {}).vatNumber || "").toUpperCase(),
      net: sevNum(o.sumNet), tax: sevNum(o.sumTax), gross: sevNum(o.sumGross), enshrined: !!o.enshrined, pays: pays["CreditNote:" + o.id] ? pays["CreditNote:" + o.id].slice().sort((x, y) => x.date.localeCompare(y.date)) : undefined, lines: cnBy[o.id] || [] }));
    const cutoff = new Date(Date.now() - 500 * 864e5).toISOString().slice(0, 10);
    const transactions = tx.map(t => ({ id: String(t.id), date: sevDay(t.valueDate || t.entryDate), amount: sevNum(t.amount), name: t.payeePayerName || "", purpose: String(t.paymtPurpose || t.entryText || "").replace(/\s+/g, " ").trim().slice(0, 140), status: parseInt(t.status, 10) || 0, accountId: t.checkAccount && t.checkAccount.id ? String(t.checkAccount.id) : "" }))
      .filter(t => t.amount < 0 && (t.date || "") >= cutoff && /finanzamt|abgabenkonto|bmf|steuer|\bust\b|umsatzsteuer|\bfa\b/i.test(t.name + " " + t.purpose));
    // Steuerregeln (id, Name, Beschreibung, Seite) aus der ReceiptGuidance – damit die Zuordnung zum österreichischen Konto geprüft werden kann
    const trBy = {}; [[guide, ""], [guideRev, "REVENUE"], [guideExp, "EXPENSE"]].forEach(([gd, def]) => ((gd && gd.objects) || []).forEach(g => { if (!g) return; const side = (g.allowedReceiptTypes || []).join("/") || def; (g.allowedTaxRules || []).forEach(r => { if (r == null || r.id == null) return; const k = String(r.id); const x = trBy[k] = trBy[k] || { id: k, name: r.name || "", description: r.description || "", rates: [], side: "" };
      (r.taxRates || []).forEach(t => { if (x.rates.indexOf(t) < 0) x.rates.push(t); }); if (side && x.side.indexOf(side) < 0) x.side = (x.side ? x.side + "/" : "") + side; }); }));
    const taxRules = Object.keys(trBy).map(k => trBy[k]).sort((a, b) => +a.id - +b.id);
    const taxSets = Object.keys(tsBy).map(k => tsBy[k]);
    const d = { fetchedAt: new Date().toISOString(), invoices, vouchers, creditNotes, transactions, taxRules, taxSets, meta: { dupes, counts: { invoices: invoices.length, vouchers: vouchers.length, creditNotes: creditNotes.length, payLogs: logs.length } } };
    STEUER_CACHE = { at: Date.now(), data: d, p: null };
    return d;
  })().catch(e => { STEUER_CACHE.p = null; throw e; });
  return STEUER_CACHE.p;
}
const STEUER_KZ_OK = /^(auto|inl|ns|zm|zmd|017|011|020|021|016|oss|sonst|dlp|nach20|060|rc|rcnv|ige|ige3|ige0|eust|fx|none|ignore)$/;
// Zusammenfassung einer erledigten UVA/JAB/U1 (inkl. Belegliste für „bereits gemeldet“) – begrenzt, nie abgeschnittenes JSON
function steuerSummary(x) { const o = JSON.parse(JSON.stringify(x)); if (Array.isArray(o.docIds)) o.docIds = o.docIds.map(String).filter(id => /^[\w-]{1,40}$/.test(id)).slice(0, 5000); const t = JSON.stringify(o); return t.length > 200000 ? Object.assign(o, { docIds: undefined }) : o; }
function steuerOp(pl) {
  const o = readSteuer(), op = String(pl.op || ""), key = String(pl.key || "").slice(0, 20);
  const n2 = v => { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
  if (op === "settings") { const P = pl.settings || {}; if (P.zeitraum === "quartal" || P.zeitraum === "monat") o.settings.zeitraum = P.zeitraum; if ("steuernummer" in P) o.settings.steuernummer = String(P.steuernummer || "").replace(/[^\d\/ -]/g, "").slice(0, 20); if ("vst" in P) o.settings.vst = String(P.vst || "").replace(/[^0-9a-z]/gi, "").slice(0, 4);
    // Betriebsdaten für die E1a im Datenstrom JAHR_ERKL
    if ("betriebAdr" in P) o.settings.betriebAdr = String(P.betriebAdr || "").slice(0, 60); if ("betriebPlz" in P) o.settings.betriebPlz = String(P.betriebPlz || "").replace(/[^0-9A-Z]/gi, "").slice(0, 10); if ("betriebOrt" in P) o.settings.betriebOrt = String(P.betriebOrt || "").slice(0, 40);
    if ("kleineAnz" in P) o.settings.kleineAnz = P.kleineAnz === false || P.kleineAnz === "0" ? false : undefined; if ("brkz" in P) o.settings.brkz = String(P.brkz || "").replace(/\D/g, "").slice(0, 3); if ("einkunftsart" in P) o.settings.einkunftsart = P.einkunftsart === "SA" ? "SA" : "GW"; }
  else if (op === "mapping") { const m = pl.mapping || {}; Object.keys(m).forEach(k => { const v = String(m[k] || "").replace(/[^0-9a-z_-]/gi, "").slice(0, 12); if (v) o.mapping[String(k).slice(0, 120)] = v; else delete o.mapping[String(k).slice(0, 120)]; }); }
  else if (op === "doc") {
    const id = String(pl.id || "").slice(0, 40); const P = pl.patch || {}; const cur = o.docs[id] || {};
    if ("kz" in P) { const v = String(P.kz || ""); cur.kz = v && STEUER_KZ_OK.test(v) && v !== "auto" ? v : undefined; }
    ["asset", "ignore", "pkw", "epkw", "used", "noMinderung", "teil", "noAusfall"].forEach(f => { if (f in P) cur[f] = !!P[f] || undefined; });
    if ("wk" in P) cur.wk = P.wk === "ja" || P.wk === "nein" ? P.wk : undefined;           // § 19 EStG 15-Tage-Regel
    if ("uid" in P) { const u = String(P.uid || "").replace(/[\s.\-]/g, "").toUpperCase().slice(0, 16); cur.uid = u && STEUER_CALC.uidValid(u).ok ? u : undefined; }
    if ("land" in P) { const l = String(P.land || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2); cur.land = l.length === 2 ? l : undefined; }
    if ("grund" in P) cur.grund = String(P.grund || "").slice(0, 120) || undefined;
    if ("erMode" in P) cur.erMode = P.erMode === "rest" || P.erMode === "voll" ? P.erMode : undefined;   // Endrechnung: Kopfsumme Rest/Gesamt
    if ("nd" in P) { const n = parseInt(P.nd, 10); cur.nd = n > 0 && n < 60 ? n : undefined; }
    if ("method" in P) cur.method = P.method === "deg" ? "deg" : undefined;
    if ("degRate" in P) { const n = n2(P.degRate); cur.degRate = n > 0 && n <= 30 ? n : undefined; }
    if ("benefit" in P) cur.benefit = /^(gfb|ifb10|ifb15|ifb20|ifb22)$/.test(P.benefit) ? (P.benefit === "ifb20" ? "ifb10" : P.benefit === "ifb22" ? "ifb15" : P.benefit) : undefined;
    ["abgang", "start", "ausfall"].forEach(f => { if (f in P) cur[f] = /^\d{4}-\d{2}-\d{2}$/.test(P[f] || "") ? P[f] : undefined; });
    o.docs[id] = JSON.parse(JSON.stringify(cur));
  }
  else if (op === "docsBulk") {  // mehrere Belege gleich einordnen (z. B. alle Gutschriften ignorieren) – nur Cockpit, nichts in sevDesk
    const ids = (Array.isArray(pl.ids) ? pl.ids : []).map(x => String(x).slice(0, 40)).slice(0, 2000), v = String(pl.kz || "");
    if (!ids.length || !(v === "ignore" || v === "")) throw new Error("ungueltig");
    ids.forEach(id => { const cur = o.docs[id] || {}; cur.kz = v || undefined; o.docs[id] = JSON.parse(JSON.stringify(cur)); });
  }
  else if (op === "ruleMap") {   // Zuordnung einer sevDesk-Steuerregel → Klasse, gilt für alle Belege mit dieser Regel
    const id = String(pl.id || "").replace(/[^0-9ts]/g, "").slice(0, 12), side = pl.side === "in" ? "in" : "out", cls = String(pl.cls || "");
    if (!id) throw new Error("ungueltig"); const ok = (side === "in" ? STEUER_CALC.RULE_IN_CLASSES : STEUER_CALC.RULE_OUT_CLASSES).indexOf(cls) > -1;
    const cur = o.ruleMap[id] || {}; if (ok) cur[side] = cls; else delete cur[side]; if (Object.keys(cur).length) o.ruleMap[id] = cur; else delete o.ruleMap[id];
  }
  else if (op === "supMap") {    // ig. Erwerb gebucht: Ware (ige) oder Dienstleistung (rc) – je Lieferant
    const k = String(pl.key || pl.supplier || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120), v = String(pl.cls || "");
    if (!k) throw new Error("ungueltig"); if (v === "rc" || v === "ige") o.supMap[k] = v; else delete o.supMap[k];
  }
  else if (op === "manual" && key) {   // manuelle UVA-Kennzahl je Zeitraum
    const kz = String(pl.kz || ""); if (STEUER_CALC.MANUAL_KZ.indexOf(kz) < 0) throw new Error("kz_nicht_erlaubt");
    const m = o.uvaManual[key] = o.uvaManual[key] || {};
    if (!n2(pl.base) && !n2(pl.tax)) delete m[kz]; else m[kz] = { base: n2(pl.base), tax: n2(pl.tax), note: String(pl.note || "").slice(0, 120) };
    if (!Object.keys(m).length) delete o.uvaManual[key];
  }
  else if (op === "jabinput" && /^\d{4}$/.test(String(pl.year || ""))) {
    const cur = o.jabInput[pl.year] = o.jabInput[pl.year] || {}; const P = pl.patch || {};
    const nums = ["e9050", "e9060", "e9090", "mobiliar", "oeffi", "svs", "sonstAufw", "kfzPrivat", "k9290", "wertpapiere", "verlustvortrag", "andereEinkuenfte", "kirchenbeitrag", "spenden", "vorauszahlungen", "partnerEinkommen"];
    Object.keys(P).forEach(k => { if (nums.indexOf(k) > -1) cur[k] = n2(P[k]); else if (k === "ap") cur.ap = /^(klein|gross)$/.test(P.ap) ? P.ap : ""; else if (/^(avab|aeab|pausch6|gfbVerzicht|kmbBeide)$/.test(k)) cur[k] = !!P[k];
      else if (k === "kids") cur.kids = (Array.isArray(P.kids) ? P.kids : []).slice(0, 20).map(x => ({ name: String(x.name || "Kind").slice(0, 40), rel: /^(gemeinsam|partnerin|eigen)$/.test(x.rel) ? x.rel : "gemeinsam", fb: /^(partnerin|simon|ex|andere)$/.test(x.fb) ? x.fb : "partnerin",
        share: [0, 50, 100].indexOf(+x.share) > -1 ? +x.share : 0, birth: /^\d{4}-\d{2}-\d{2}$/.test(x.birth || "") ? x.birth : "", months: Math.max(0, Math.min(12, parseInt(x.months, 10) >= 0 ? parseInt(x.months, 10) : 12)), unterhalt: !!x.unterhalt, note: String(x.note || "").slice(0, 160) })); });
  }
  else if (op === "trips" && /^\d{4}$/.test(String(pl.year || ""))) {
    const arr = (Array.isArray(pl.trips) ? pl.trips : []).slice(0, 1000).map(t => ({ date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || "") ? t.date : "", route: String(t.route || "").slice(0, 120), purpose: String(t.purpose || "").slice(0, 160), km: Math.max(0, n2(t.km)), hours: Math.max(0, n2(t.hours)), nights: Math.max(0, parseInt(t.nights, 10) || 0) }));
    if (arr.length) o.trips[pl.year] = arr; else delete o.trips[pl.year];
  }
  else if (op === "done" && /^(uva|jab|u1)$/.test(pl.kind) && key) { o[pl.kind][key] = Object.assign({}, o[pl.kind][key] || {}, { doneAt: new Date().toISOString(), summary: pl.summary && typeof pl.summary === "object" ? steuerSummary(pl.summary) : null, note: String(pl.note || "").slice(0, 500) }); }
  else if (op === "undone" && /^(uva|jab|u1)$/.test(pl.kind) && key) { delete o[pl.kind][key]; }
  else throw new Error("bad_op");
  if (!writeSteuer(o)) throw new Error("save_failed");
  return o;
}
// Zeitraum aus Schlüssel: "2026-Q3" oder "2026-M07"
function steuerPeriod(key) {
  const m = String(key || "").match(/^(\d{4})-(Q([1-4])|M(0[1-9]|1[0-2]))$/); if (!m) return null;
  const y = +m[1], from = m[3] ? (+m[3] - 1) * 3 + 1 : +m[4], to = m[3] ? +m[3] * 3 : +m[4];
  const last = new Date(Date.UTC(y, to, 0)).getUTCDate();
  return { key, year: y, from: y + "-" + String(from).padStart(2, "0") + "-01", to: y + "-" + String(to).padStart(2, "0") + "-" + String(last).padStart(2, "0"), label: m[3] ? m[3] + ". Quartal " + y : String(from).padStart(2, "0") + "/" + y };
}

// ── FinanzOnline: Datenstrom U30/U13 (BMF-Schema U30 ab 07/2026, ZM Stand 14.01.2025), Prüfung, Session- und FileUpload-Webservice ──
// Portiert aus BuchDu (src/lib/fonXml.ts, fonPruefung.ts, fon.ts). Das PIN wird nur für den einen Aufruf verwendet und nirgends gespeichert oder geloggt.
const FON = {
  sessionUrl: process.env.FON_SESSION_URL || "https://finanzonline.bmf.gv.at/fonws/ws/session",
  uploadUrl: process.env.FON_UPLOAD_URL || "https://finanzonline.bmf.gv.at/fon/ws/fileupload",
  nsSession: "https://finanzonline.bmf.gv.at/fon/ws/session", nsUpload: "https://finanzonline.bmf.gv.at/fon/ws/fileupload",
};
const FON_LLE = ["000", "001", "021"], FON_FREI = ["011", "012", "015", "017", "018", "019", "016"], FON_VERST = ["022", "124", "029", "006", "037", "052", "007", "056", "057", "048", "044", "032"];
const FON_IGE = ["070", "071"], FON_IGE_V = ["072", "125", "073", "008", "088", "076", "077"], FON_VST = ["060", "061", "083", "065", "066", "082", "087", "089", "064", "062", "063", "067", "090"];
const FON_NULL_OK = new Set(["000", "070"]), FON_NEG_OK = new Set(["063", "067", "090"]);
const FON_KZ = new Set([].concat(FON_LLE, FON_FREI, ["020"], FON_VERST, FON_IGE, FON_IGE_V, FON_VST));
function fonAscii(t) { return String(t || "").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss").replace(/[‐-―−]/g, "-").replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"').replace(/€/g, "EUR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, ""); }
function fonEsc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function fonFastnr(raw) { const z = String(raw || "").replace(/\D/g, ""); return /^\d{9}$/.test(z) ? z : null; }
function fonZahl(b) { const g = Math.round(b * 100) / 100; return (g === 0 ? 0 : g).toFixed(2); }
function fonKopf(nr, paket, d, anzahl) {
  const p = n => String(n).padStart(2, "0"); const v = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Vienna" }));
  return ["  <INFO_DATEN>", "    <ART_IDENTIFIKATIONSBEGRIFF>FASTNR</ART_IDENTIFIKATIONSBEGRIFF>", "    <IDENTIFIKATIONSBEGRIFF>" + nr + "</IDENTIFIKATIONSBEGRIFF>", "    <PAKET_NR>" + paket + "</PAKET_NR>",
    '    <DATUM_ERSTELLUNG type="datum">' + v.getFullYear() + "-" + p(v.getMonth() + 1) + "-" + p(v.getDate()) + "</DATUM_ERSTELLUNG>", '    <UHRZEIT_ERSTELLUNG type="uhrzeit">' + p(v.getHours()) + ":" + p(v.getMinutes()) + ":" + p(v.getSeconds()) + "</UHRZEIT_ERSTELLUNG>",
    "    <ANZAHL_ERKLAERUNGEN>" + anzahl + "</ANZAHL_ERKLAERUNGEN>", "  </INFO_DATEN>"].join("\n");
}
function fonAllg(art, von, bis, nr, info) {
  const z = ["    <ALLGEMEINE_DATEN>", "      <ANBRINGEN>" + art + "</ANBRINGEN>", '      <ZRVON type="jahrmonat">' + von + "</ZRVON>", '      <ZRBIS type="jahrmonat">' + bis + "</ZRBIS>", "      <FASTNR>" + nr + "</FASTNR>"];
  const i = fonAscii(info).slice(0, 50).trim(); if (i) z.push("      <KUNDENINFO>" + fonEsc(i) + "</KUNDENINFO>"); z.push("    </ALLGEMEINE_DATEN>"); return z.join("\n");
}
function fonU30Xml(nr, paket, d) {
  const w = Object.assign({ "000": 0 }, d.kennzahlen);
  const nimmt = kz => FON_NULL_OK.has(kz) ? (kz in w) : Math.round((w[kz] || 0) * 100) !== 0;
  const zeilen = (liste, e) => liste.filter(nimmt).map(kz => " ".repeat(e) + "<KZ" + kz + ' type="kz">' + fonZahl(w[kz] || 0) + "</KZ" + kz + ">");
  const frei = zeilen(FON_FREI, 8), nach = zeilen(["020"], 8), vst = d.vst && nach.length ? ["        <VST>" + fonEsc(fonAscii(d.vst).slice(0, 4)) + "</VST>"] : [];
  const verst = zeilen(FON_VERST, 8), ige = zeilen(FON_IGE, 6), igeV = zeilen(FON_IGE_V, 8), vor = zeilen(FON_VST, 6);
  const igeVB = igeV.length ? ["      <VERSTEUERT_IGE>"].concat(igeV, ["      </VERSTEUERT_IGE>"]) : [];
  return ['<?xml version="1.0" encoding="UTF-8"?>', "<ERKLAERUNGS_UEBERMITTLUNG>", fonKopf(nr, paket, d.erstellt || new Date(), 1), '  <ERKLAERUNG art="U30">', "    <SATZNR>1</SATZNR>", fonAllg("U30", d.von, d.bis, nr, d.kundeninfo),
    "    <LIEFERUNGEN_LEISTUNGEN_EIGENVERBRAUCH>"].concat(zeilen(FON_LLE, 6),
    frei.length || nach.length ? ["      <STEUERFREI>"].concat(frei, vst, nach, ["      </STEUERFREI>"]) : [],
    verst.length ? ["      <VERSTEUERT>"].concat(verst, ["      </VERSTEUERT>"]) : [], ["    </LIEFERUNGEN_LEISTUNGEN_EIGENVERBRAUCH>"],
    ige.length || igeVB.length ? ["    <INNERGEMEINSCHAFTLICHE_ERWERBE>"].concat(ige, igeVB, ["    </INNERGEMEINSCHAFTLICHE_ERWERBE>"]) : [],
    vor.length ? ["    <VORSTEUER>"].concat(vor, ["    </VORSTEUER>"]) : [], ["  </ERKLAERUNG>", "</ERKLAERUNGS_UEBERMITTLUNG>"]).join("\n");
}
function fonZmXml(nr, paket, d) {
  const inhalt = [].concat.apply([], d.zeilen.map(z => { const a = ["    <ZM>", "      <UID_MS>" + fonEsc(fonAscii(z.uid).toUpperCase()) + "</UID_MS>", '      <SUM_BGL type="kz">' + Math.round(z.betrag) + "</SUM_BGL>"]; if (z.dreieck) a.push("      <DREIECK>J</DREIECK>"); if (z.sonstigeLeistung) a.push("      <SOLEI>J</SOLEI>"); a.push("    </ZM>"); return a; }));
  return ['<?xml version="1.0" encoding="UTF-8"?>', "<ERKLAERUNGS_UEBERMITTLUNG>", fonKopf(nr, paket, d.erstellt || new Date(), 1), '  <ERKLAERUNG art="U13">', "    <SATZNR>1</SATZNR>", fonAllg("U13", d.von, d.bis, nr, d.kundeninfo)].concat(inhalt, ["  </ERKLAERUNG>", "</ERKLAERUNGS_UEBERMITTLUNG>"]).join("\n");
}
// ── Jahreserklärung (Anbringen JAHR_ERKL): E1 mit Beilage E1a (Block EINZELUNTERNEHMER) und U1.
// Struktur nach BMF_XSD_Jahreserklaerungen_2025.xsd (Stand 21.11.2025) und BMF_Allgemeines_Jahreserklaerung_2025.pdf.
// Reihenfolge laut xs:sequence des (gemeinsamen) Elements ALLGEMEIN im XSD – weicht von der Beispiel-XML ab (WJ_A/WJ_E vor GWAUSTN)
const JE_ALLG = ["ADR_BETR", "PLZ_BETR", "ORT_BETR", "STAAT_BETR", "BRKZ", "KLEIN_MU", "KZ9027", "KZ9055", "KZ9028", "MIBETR", "GWA41", "GWA5", "GWA43", "GWA171", "GWAGAST", "GWADROG", "GWAKP", "GWAHV", "GWASP", "GWASONST", "FF_OPT", "WRFF_OPT", "WJ_A", "WJ_E", "KLPAUSCH", "GWAUSTB", "GWAUSTN"];
const JE_ERTR = ["9040", "9050", "9060", "9070", "9080", "9090", "9093"];
const JE_AUFW = ["9100", "9110", "9120", "9130", "9134", "9135", "9140", "9142", "9150", "9160", "9165", "9170", "9180", "9190", "9200", "9210", "9275", "9215", "9216", "9217", "9220", "9258", "9225", "9243", "9244", "9245", "9246", "9206", "9207", "9208", "9209", "9261", "9279", "9262", "9339", "9230", "9233", "9259", "9237", "9249"];
const JE_GV = ["9276", "9277", "9344", "9345", "9337", "9338", "9240", "9269", "9268", "9273", "9274", "9260", "9270", "9280", "9317", "9322", "9325", "9257", "9283", "9305", "9289", "9285", "9316", "9326", "9010", "9242", "9247", "9290", "9221", "GRUNDFB", "9227", "9229", "9234", "9020", "9021", "9030"];
const JE_U1_VERST = ["022", "124", "029", "006", "037", "052", "007", "056", "057", "048", "044", "032"], JE_U1_IGEV = ["072", "125", "073", "008", "088", "076", "077"];
const JE_U1_VST = ["060", "084", "085", "086", "078", "068", "079", "061", "083", "065", "066", "082", "087", "089", "064", "062", "063", "067", "090"];
function fonJahrXml(nr, paket, d) {
  const y = String(d.year), j = d.jab, set = d.settings, e = " ";
  const kz = (k, v, t) => (v != null && Math.round(v * 100) !== 0) || d.immer && d.immer.indexOf(k) > -1 ? e.repeat(t) + "<KZ" + k + ' type="kz">' + fonZahl(v || 0) + "</KZ" + k + ">" : null;
  const allg = { ADR_BETR: fonEsc(fonAscii(set.betriebAdr || "")), PLZ_BETR: set.betriebPlz, ORT_BETR: fonEsc(fonAscii(set.betriebOrt || "")), STAAT_BETR: "A", BRKZ: set.brkz, GWA43: "J", GWAUSTN: "J", WJ_A: y + "-01-01", WJ_E: y + "-12-31" };
  const allgZ = JE_ALLG.filter(k => allg[k]).map(k => "          <" + k + (/^WJ_/.test(k) ? ' type="datum"' : "") + ">" + allg[k] + "</" + k + ">");
  const ertr = { "9040": j.ertr["9040"], "9050": j.ertr["9050"], "9060": j.ertr["9060"], "9090": j.ertr["9090"] };
  const ertrZ = JE_ERTR.map(k => (k === "9040" || k === "9050") ? e.repeat(10) + "<KZ" + k + ' type="kz">' + fonZahl(ertr[k] || 0) + "</KZ" + k + ">" : kz(k, ertr[k], 10)).filter(Boolean);
  const aufwZ = JE_AUFW.map(k => kz(k, j.E[k], 10)).filter(Boolean);
  const gv = Object.assign({}, j.K5, { "9221": j.grund, "9227": j.g9227, "9229": j.g9229 });
  const gvZ = JE_GV.map(k => k === "GRUNDFB" ? (j.inp.gfbVerzicht ? "          <GRUNDFB>J</GRUNDFB>" : null) : kz(k, gv[k], 10)).filter(Boolean);
  const art = set.einkunftsart === "SA" ? "EINKUENFTE_SELBST_ARBEIT" : "EINKUENFTE_GEWERBEBETRIEB";
  const est = j.est, allgE1 = ["      <ANBRINGEN>E1</ANBRINGEN>", "      <ZR>" + y + "</ZR>", "      <FASTNR>" + nr + "</FASTNR>", "      <KUNDENINFO>" + fonEsc(fonAscii("FS Cockpit JAB " + y)) + "</KUNDENINFO>"];
  if (j.inp.avab && est.avab) allgE1.push("      <AVAB>J</AVAB>"); if (j.inp.aeab && est.avab) allgE1.push("      <AEAB>J</AEAB>");
  if (j.inp.kmbBeide && est.kmb) allgE1.push("      <KMB_PART>J</KMB_PART>");
  const e1 = ['      <ERKLAERUNG art="E1">', "        <SATZNR>1</SATZNR>", "        <ALLGEMEINE_DATEN>"].concat(allgE1.map(x => "  " + x), ["        </ALLGEMEINE_DATEN>", "        <BETRIEBLICHE_EINKUNFTSARTEN>", "          <" + art + ">", "            <EINZELUNTERNEHMER>",
    "              <ALLGEMEIN>"], allgZ.map(x => "      " + x), ["              </ALLGEMEIN>", "              <ERTRAEGE_EINNAHMEN>"], ertrZ.map(x => "      " + x), ["              </ERTRAEGE_EINNAHMEN>"],
    aufwZ.length ? ["              <AUFWENDUNGEN_AUSGABEN>"].concat(aufwZ.map(x => "      " + x), ["              </AUFWENDUNGEN_AUSGABEN>"]) : [],
    gvZ.length ? ["              <GEWINN_VERLUST>"].concat(gvZ.map(x => "      " + x), ["              </GEWINN_VERLUST>"]) : [],
    ["            </EINZELUNTERNEHMER>", "          </" + art + ">", "        </BETRIEBLICHE_EINKUNFTSARTEN>"],
    num462(j.inp.verlustvortrag) ? ["        <SONDERAUSGABEN_VERLUSTABZUG>", '          <KZ462 type="kz">' + fonZahl(j.inp.verlustvortrag) + "</KZ462>", "        </SONDERAUSGABEN_VERLUSTABZUG>"] : [], ["      </ERKLAERUNG>"]);
  const u1 = d.ohneU1 ? [] : fonU1Block(nr, d, 2);
  return ['<?xml version="1.0" encoding="UTF-8"?>', "<ERKLAERUNGS_UEBERMITTLUNG>", fonKopf(nr, paket, d.erstellt || new Date(), u1.length ? 2 : 1), '  <JAHRESERKLAERUNG art="JAHR_ERKL">'].concat(e1.map(x => x.replace(/^  /, "    ")), u1.map(x => x.replace(/^  /, "    ")), ["  </JAHRESERKLAERUNG>", "</ERKLAERUNGS_UEBERMITTLUNG>"]).join("\n");
}
// U1-Block (ERKLAERUNG art="U1") – allein oder zusammen mit E1/E1a im Anbringen JAHR_ERKL (JAHRESERKLAERUNG: 1–300 ERKLAERUNG)
function fonU1Block(nr, d, satz) {
  const y = String(d.year), set = d.settings, e = " ";
  const w = Object.assign({ "000": 0 }, d.u1), take = (list, t) => list.filter(k => k === "000" ? true : Math.round((w[k] || 0) * 100) !== 0).map(k => e.repeat(t) + "<KZ" + k + ' type="kz">' + fonZahl(w[k] || 0) + "</KZ" + k + ">");
  const frei = take(["011", "012", "015", "017", "018", "019", "016"], 12), nach = take(["020"], 12), vst = set.vst && nach.length ? ["            <VST>" + fonEsc(set.vst) + "</VST>"] : [];
  const verst = take(JE_U1_VERST.filter(k => +y >= 2026 || k !== "124"), 12), ige = take(["070", "071"].filter(k => k in w), 10), igeV = take(JE_U1_IGEV.filter(k => +y >= 2026 || k !== "125"), 12), vor = take(JE_U1_VST, 10);
  const u1 = ['      <ERKLAERUNG art="U1">', "        <SATZNR>" + satz + "</SATZNR>", "        <ALLGEMEINE_DATEN>", "          <ANBRINGEN>U1</ANBRINGEN>", "          <ZR>" + y + "</ZR>", "          <FASTNR>" + nr + "</FASTNR>", "          <KUNDENINFO>" + fonEsc(fonAscii("FS Cockpit U1 " + y)) + "</KUNDENINFO>", "        </ALLGEMEINE_DATEN>",
    "        <LIEFERUNGEN_LEISTUNGEN_EIGENVERBRAUCH>"].concat(take(["000", "001", "021"], 10), frei.length || nach.length ? ["          <STEUERFREI>"].concat(frei, vst, nach, ["          </STEUERFREI>"]) : [], verst.length ? ["          <VERSTEUERT>"].concat(verst, ["          </VERSTEUERT>"]) : [], ["        </LIEFERUNGEN_LEISTUNGEN_EIGENVERBRAUCH>"],
    ige.length || igeV.length ? ["        <INNERGEMEINSCHAFTLICHE_ERWERBE>"].concat(ige, igeV.length ? ["          <VERSTEUERT_IGE>"].concat(igeV, ["          </VERSTEUERT_IGE>"]) : [], ["        </INNERGEMEINSCHAFTLICHE_ERWERBE>"]) : [],
    vor.length ? ["        <VORSTEUER>"].concat(vor, ["        </VORSTEUER>"]) : [], ["      </ERKLAERUNG>"]);
  return u1;
}
// U1 allein als JAHR_ERKL-Datenstrom (z. B. vor der Einkommensteuererklärung)
function fonU1Xml(nr, paket, d) {
  const u1 = fonU1Block(nr, d, 1);
  return ['<?xml version="1.0" encoding="UTF-8"?>', "<ERKLAERUNGS_UEBERMITTLUNG>", fonKopf(nr, paket, d.erstellt || new Date(), 1), '  <JAHRESERKLAERUNG art="JAHR_ERKL">'].concat(u1.map(x => x.replace(/^  /, "    ")), ["  </JAHRESERKLAERUNG>", "</ERKLAERUNGS_UEBERMITTLUNG>"]).join("\n");
}
function fonPruefeU1(d) {
  const b = [], s = d.settings, y = +d.year, heute = d.heute || new Date();
  if (!fonFastnr(s.steuernummer)) b.push({ art: "fehler", text: "Ohne neunstellige Steuernummer geht keine Übermittlung." });
  if (y >= heute.getFullYear()) b.push({ art: "fehler", code: "zeitraum-laeuft", text: "Das Jahr " + y + " ist noch nicht abgeschlossen." });
  if (!d.schema) b.push({ art: "fehler", code: "schema", text: "Übermittlung ab Veröffentlichung des BMF-Schemas " + y + " (üblicherweise Ende des Jahres) – bis dahin Kennzahlen-Export." });
  if (d.u1["124"] && y < 2026) b.push({ art: "fehler", text: "KZ 124 gibt es erst ab 2026." });
  if (d.u1["020"] && !/^[0-9][0-9a-zA-Z]{1,3}$/.test(s.vst || "")) b.push({ art: "fehler", text: "U1: Zu KZ 020 gehört der Ziffernschlüssel der Steuerbefreiung (2–4 Zeichen, z. B. 9a)." });
  Object.keys(d.u1).forEach(k => { if (!FON_NEG_OK.has(k) && d.u1[k] < 0) b.push({ art: "fehler", text: "U1: Kennzahl " + k + " ist negativ." }); });
  if (d.review) b.push({ art: "fehler", text: d.review + " Beleg(e) des Jahres sind nicht eingeordnet." });
  if (d.diffSum && Math.abs(d.diffSum) > 0.01) b.push({ art: "hinweis", text: "Die eingereichten UVAs weichen insgesamt um " + d.diffSum.toFixed(2) + " € von den heutigen Werten ab – die U1 meldet den richtigen Jahreswert, die Differenz wird mit der Veranlagung ausgeglichen." });
  return b;
}
function num462(v) { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; }
// Prüfungen Jahreserklärung (Auszug aus BMF_Pruefungen_Jahreserklaerungen_2025.pdf, E1a/U1) – nur das, was hier befüllt wird
function fonPruefeJahr(d) {
  const b = [], s = d.settings, y = +d.year, heute = d.heute || new Date();
  if (!fonFastnr(s.steuernummer)) b.push({ art: "fehler", text: "Ohne neunstellige Steuernummer geht keine Übermittlung." });
  if (y >= heute.getFullYear()) b.push({ art: "fehler", code: "zeitraum-laeuft", text: "Das Jahr " + y + " ist noch nicht abgeschlossen." });
  if (!d.schema) b.push({ art: "fehler", text: "Für " + y + " ist im Cockpit kein BMF-Schema hinterlegt (vorhanden: 2025). Sobald das BMF das Schema " + y + " veröffentlicht, muss der Datenstrom angepasst werden." });
  if (!s.betriebAdr) b.push({ art: "fehler", text: "E1a: Betriebsanschrift fehlt (Feld „Anschrift“)." });
  if (!/^\d{4}$/.test(s.betriebPlz || "")) b.push({ art: "fehler", text: "E1a: österreichische Postleitzahl des Betriebs fehlt." });
  if (!s.betriebOrt) b.push({ art: "fehler", text: "E1a: Ort des Betriebs fehlt." });
  if (!/^\d{3}$/.test(s.brkz || "")) b.push({ art: "fehler", text: "E1a: Branchenkennzahl (3-stellig, laut E2/ÖNACE) fehlt – für Grafikdesign z. B. 741, Werbung 731." });
  if (d.u1["124"] && y < 2026) b.push({ art: "fehler", text: "KZ 124 gibt es erst ab 2026." });
  if (d.u1["020"] && !/^[0-9][0-9a-zA-Z]{1,3}$/.test(s.vst || "")) b.push({ art: "fehler", text: "U1: Zu KZ 020 gehört der Ziffernschlüssel der Steuerbefreiung (2–4 Zeichen, z. B. 9a)." });
  Object.keys(d.u1).forEach(k => { if (!FON_NEG_OK.has(k) && d.u1[k] < 0) b.push({ art: "fehler", text: "U1: Kennzahl " + k + " ist negativ." }); });
  if (d.jab.inp.ap === "gross" && d.jab.inp.andereEinkuenfte > 11000) b.push({ art: "hinweis", text: "Großes Arbeitsplatzpauschale nur ohne andere Einkünfte über 11.000 € (aus einer Tätigkeit mit eigenem Arbeitsplatz)." });
  if (d.jab.est.faboMax > 0) b.push({ art: "hinweis", text: "Familienbonus Plus: die Beilage L 1k (Block KIND_AUSBILDUNG_BEHINDERUNG) wird nicht mitgeschickt – bitte in FinanzOnline ergänzen." });
  b.push({ art: "hinweis", text: "Kirchenbeitrag, Spenden und SVS-Daten werden vom Finanzamt automatisch übernommen und hier nicht übermittelt." });
  return b;
}
// Prüfungen vor der Übermittlung (nach "Prüfungen UVA ab 07/2026" und dem Schema). fehler = hält an, hinweis = nur Info.
function fonPruefeU30(d) {
  const b = [], w = d.kennzahlen, heute = d.heute || new Date(), ende = new Date(d.bis + "T00:00:00");
  const wert = kz => Math.round((w[kz] || 0) * 100) / 100, gesetzt = kz => wert(kz) !== 0;
  if (!fonFastnr(d.steuernummer)) b.push({ art: "fehler", text: d.steuernummer ? "Die Steuernummer „" + d.steuernummer + "“ ergibt keine neun Ziffern (Finanzamts- und Steuernummer zusammen, z. B. 98 123/4567)." : "Ohne Steuernummer geht keine Übermittlung. Bitte oben bei FinanzOnline eintragen." });
  if (ende >= new Date(heute.getFullYear(), heute.getMonth(), 1)) b.push({ art: "fehler", code: "zeitraum-laeuft", text: "Der Zeitraum ist noch nicht vorbei. Gemeldet wird erst, wenn der Monat oder das Quartal abgeschlossen ist." });
  if (ende.getFullYear() < heute.getFullYear() - 5) b.push({ art: "fehler", text: "Der Zeitraum liegt mehr als fünf Jahre zurück." });
  const fremd = Object.keys(w).filter(kz => !FON_KZ.has(kz) && kz !== "095" && gesetzt(kz)); if (fremd.length) b.push({ art: "hinweis", text: "Kennzahl " + fremd.join(", ") + " kennt das amtliche Schema nicht und wird nicht mitgeschickt." });
  Object.keys(w).forEach(kz => { if (FON_KZ.has(kz) && !FON_NEG_OK.has(kz) && wert(kz) < 0) b.push({ art: "fehler", text: "Kennzahl " + kz + " ist negativ (" + wert(kz).toFixed(2) + "). Nur 063, 067 und 090 dürfen das." }); });
  const ab0726 = ende >= new Date(2026, 6, 1); ["124", "125"].forEach(kz => { if (gesetzt(kz) && !ab0726) b.push({ art: "fehler", text: "Kennzahl " + kz + " gibt es erst ab dem Voranmeldungszeitraum 07/2026." }); });
  if ((gesetzt("065") || gesetzt("071")) && !("070" in w)) b.push({ art: "fehler", text: "Zu Kennzahl 065 oder 071 gehört der Gesamtbetrag der ig. Erwerbe (070)." });
  if (gesetzt("020") && !d.vst) b.push({ art: "fehler", text: "Kennzahl 020 verlangt den Ziffernschlüssel der Steuerbefreiung (VST) – bitte bei FinanzOnline eintragen." });
  [["048", "082", "Bauleistungen"], ["044", "087", "Sicherungseigentum/Grundstücke"], ["032", "089", "Schrott/Abfall, Handys, Laptops etc."]].forEach(p => { if (gesetzt(p[0]) && !gesetzt(p[1])) b.push({ art: "hinweis", text: p[2] + ": Kennzahl " + p[0] + " ohne " + p[1] + " – meist ist die Vorsteuer in gleicher Höhe abziehbar." }); });
  const frei = ["011", "012", "015", "017", "018", "019", "016", "020"].reduce((s, kz) => s + wert(kz), 0);
  if (frei > wert("000") + 0.005) b.push({ art: "fehler", text: "Die steuerfreien Umsätze (" + frei.toFixed(2) + ") sind größer als KZ 000 (" + wert("000").toFixed(2) + ")." });
  if (gesetzt("071") && wert("071") > wert("070") + 0.005) b.push({ art: "fehler", text: "KZ 071 ist größer als KZ 070." });
  return b;
}
function fonPruefeZm(d) {
  const b = [], heute = d.heute || new Date(), ende = new Date(d.bis + "T00:00:00");
  if (!fonFastnr(d.steuernummer)) b.push({ art: "fehler", text: "Ohne neunstellige Steuernummer geht keine Übermittlung." });
  if (ende >= new Date(heute.getFullYear(), heute.getMonth(), 1)) b.push({ art: "fehler", code: "zeitraum-laeuft", text: "Der Meldezeitraum ist noch nicht vorbei." });
  if (!d.zeilen.length) b.push({ art: "fehler", text: "Keine ZM-pflichtigen Umsätze in diesem Zeitraum." });
  d.zeilen.forEach(z => {
    if (!z.uid) b.push({ art: "fehler", text: z.kunde + " hat keine UID – ohne UID lässt sich der Umsatz nicht melden (und ist auch nicht steuerfrei)." });
    else if (!STEUER_CALC.uidValid(z.uid).ok) b.push({ art: "fehler", text: "Die UID „" + z.uid + "“ (" + z.kunde + ") ist ungültig: " + STEUER_CALC.uidValid(z.uid).why + "." });
    else if (z.uid.indexOf("AT") === 0) b.push({ art: "fehler", text: z.kunde + " hat eine österreichische UID – Inlandsumsätze gehören nicht in die ZM." });
    if (z.betrag < 0) b.push({ art: "hinweis", text: z.kunde + " steht mit einem negativen Betrag da. Berichtigungen: die ganze Meldung des Zeitraums neu schicken." });
  });
  return b;
}
function fonRcText(rc, msg) { return ({ 0: msg || "In Ordnung.", "-1": "Die Sitzung ist abgelaufen.", "-2": "FinanzOnline ist wegen Wartungsarbeiten nicht erreichbar.", "-3": "Bei FinanzOnline ist ein technischer Fehler aufgetreten." + (msg ? " (" + msg + ")" : ""), "-4": msg || "Teilnehmernummer, Webservice-Benutzer oder PIN stimmen nicht bzw. Fehler im Datenstrom.", "-5": "Keine Berechtigung, Inhalte dieser Art zu übermitteln (Webservice-Benutzer braucht das Recht für UVA/ZM)." })[String(rc)] || msg || "FinanzOnline meldet Code " + rc + "."; }
function fonFeld(xml, name) { const t = xml.match(new RegExp("<(?:[\\w.-]+:)?" + name + "\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?" + name + ">")); return t ? t[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim() : null; }
function fonSoap(ns, root, felder, cdata) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="' + ns + '">\n  <soapenv:Header/>\n  <soapenv:Body>\n    <ns:' + root + ">\n" +
    felder.map(f => "      <ns:" + f[0] + ">" + (cdata && f[0] === cdata ? "<![CDATA[" + f[1] + "]]>" : fonEsc(f[1])) + "</ns:" + f[0] + ">").join("\n") + "\n    </ns:" + root + ">\n  </soapenv:Body>\n</soapenv:Envelope>";
}
async function fonRuf(url, action, body) {
  let r; try { r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"' + action + '"' }, body, signal: AbortSignal.timeout(60000) }); }
  catch (e) { throw new Error(e && e.name === "TimeoutError" ? "FinanzOnline hat innerhalb einer Minute nicht geantwortet." : "FinanzOnline ist gerade nicht erreichbar."); }   // nie das Request-Objekt weitergeben (PIN)
  const text = await r.text();
  if (!r.ok && !/Envelope/.test(text)) throw new Error("FinanzOnline antwortet mit HTTP " + r.status + ".");
  const fault = fonFeld(text, "faultstring"); if (fault) throw new Error("FinanzOnline meldet: " + fault);
  return text;
}
function fonZugang() {
  if (!process.env.FON_HERSTELLERID) return { fehlt: "Die Herstellerkennung fehlt (Railway-Variable FON_HERSTELLERID = deine UID, z. B. ATU12345678)." };
  if (!process.env.FON_TID) return { fehlt: "Die Teilnehmer-Identifikation fehlt (Railway-Variable FON_TID)." };
  if (!process.env.FON_BENID) return { fehlt: "Der Webservice-Benutzer fehlt (Railway-Variable FON_BENID; in FinanzOnline unter Benutzerverwaltung als Webservice-Benutzer anlegen)." };
  return { tid: process.env.FON_TID.trim(), benid: process.env.FON_BENID.trim(), herstellerid: process.env.FON_HERSTELLERID.trim(), pinEnv: !!process.env.FON_PIN };
}
async function fonUebermitteln(z, pin, art, modus, daten) {
  const an = await fonRuf(FON.sessionUrl, "login", fonSoap(FON.nsSession, "loginRequest", [["tid", z.tid], ["benid", z.benid], ["pin", pin], ["herstellerid", z.herstellerid]]));
  const id = fonFeld(an, "id") || "", rc0 = Number(fonFeld(an, "rc") || -3);
  if (rc0 !== 0 || !id) return { rc: rc0 === 0 ? -3 : rc0, msg: fonRcText(rc0, fonFeld(an, "msg") || "") };
  try {
    const up = await fonRuf(FON.uploadUrl, "upload", fonSoap(FON.nsUpload, "fileuploadRequest", [["tid", z.tid], ["benid", z.benid], ["id", id], ["art", art], ["uebermittlung", modus], ["data", daten]], "data"));
    const rc = Number(fonFeld(up, "rc") || -3), msg = fonFeld(up, "msg") || "";
    return { rc, msg: rc === 0 ? (msg || "In Ordnung.") : fonRcText(rc, msg) };
  } finally {
    try { await fonRuf(FON.sessionUrl, "logout", fonSoap(FON.nsSession, "logoutRequest", [["tid", z.tid], ["benid", z.benid], ["id", id]])); } catch (e) {}
  }
}
// Entwurf aus den aktuellen sevDesk-Daten (serverseitig berechnet)
const FON_JAHR_SCHEMA = { 2025: true };   // veröffentlichte BMF-Schemata „Jahreserklärungen“, gegen die der Builder geprüft ist
async function fonEntwurf(art, key, paket, fresh) {
  if (art === "U1") {
    const year = String(key || "").slice(0, 4); if (!/^\d{4}$/.test(year)) throw new Error("Unbekanntes Jahr.");
    const o = readSteuer(), raw = await steuerRaw(!!fresh), nr = fonFastnr(o.settings.steuernummer);
    const u = STEUER_CALC.computeU1(raw, o, year), d = { year, u1: u.kz, settings: o.settings, schema: !!FON_JAHR_SCHEMA[year], review: u.r.review.length, diffSum: u.diffSum };
    return { art, p: { key: year, label: "U1 " + year }, kennzahlen: { u1: u.kz, voraus: u.voraus, rest: u.rest }, zahllast: u.zahllast, befunde: fonPruefeU1(d), xml: nr ? fonU1Xml(nr, paket, d) : "" };
  }
  if (art === "JAHR_ERKL") {
    const year = String(key || "").slice(0, 4); if (!/^\d{4}$/.test(year)) throw new Error("Unbekanntes Jahr.");
    const o = readSteuer(), raw = await steuerRaw(!!fresh), nr = fonFastnr(o.settings.steuernummer);
    const j = STEUER_CALC.computeJab(raw, o, year), u1 = STEUER_CALC.uvaKzMap(j.u1);
    const ohneU1 = !!(o.u1[year] && o.u1[year].doneAt && o.u1[year].fon);   // U1 schon separat eingereicht → nur E1/E1a
    const d = { year, jab: j, u1, settings: o.settings, schema: !!FON_JAHR_SCHEMA[year], ohneU1 };
    const befunde = fonPruefeJahr(d); if (ohneU1) befunde.push({ art: "hinweis", text: "Die U1 " + year + " wurde bereits separat eingereicht – dieser Datenstrom enthält nur E1 und E1a." });
    if (j.u1.review.length) befunde.push({ art: "fehler", text: j.u1.review.length + " Beleg(e) des Jahres sind nicht eingeordnet (U1)." });
    return { art, p: { key: year, label: "Jahreserklärung " + year }, kennzahlen: { gewinn: j.steuerGewinn, u1: u1 }, zahllast: j.u1.zahllast, befunde, xml: nr ? fonJahrXml(nr, paket, d) : "" };
  }
  const p = steuerPeriod(key); if (!p) throw new Error("Unbekannter Zeitraum.");
  const o = readSteuer(), raw = await steuerRaw(!!fresh), nr = fonFastnr(o.settings.steuernummer);
  const r = STEUER_CALC.computeUva(raw, o, p), von = p.from.slice(0, 7), bis = p.to.slice(0, 7), info = "FS Cockpit " + p.label;
  if (art === "U30") {
    const kennzahlen = STEUER_CALC.uvaKzMap(r);
    const befunde = fonPruefeU30({ steuernummer: o.settings.steuernummer, bis: p.to, kennzahlen, vst: o.settings.vst });
    if (r.review.length) befunde.push({ art: "fehler", text: r.review.length + " Beleg(e) sind nicht eingeordnet und fehlen in den Kennzahlen. Bitte zuerst in der UVA einordnen." });
    return { art, p, kennzahlen, zahllast: r.zahllast, docIds: STEUER_CALC.uvaDocIds(r), befunde, xml: nr ? fonU30Xml(nr, paket, { von, bis, kundeninfo: info, kennzahlen, vst: o.settings.vst }) : "" };
  }
  const rows = STEUER_CALC.zmRows(r);
  const zeilen = rows.filter(x => x.uid && Math.round(x.net) !== 0).map(x => ({ uid: x.uid, betrag: x.net, sonstigeLeistung: x.kind === "S", dreieck: !!x.dreieck }));
  const befunde = fonPruefeZm({ steuernummer: o.settings.steuernummer, bis: p.to, zeilen: rows.map(x => ({ uid: x.uid, kunde: x.kunde, betrag: x.net })) });
  return { art, p, kennzahlen: { zeilen: zeilen.length, summe: Math.round(rows.reduce((a, x) => a + x.net, 0) * 100) / 100 }, befunde, xml: nr ? fonZmXml(nr, paket, { von, bis, kundeninfo: info, zeilen }) : "" };
}
async function fonSenden(pl, modus) {
  const art = pl.art === "U13" ? "U13" : pl.art === "JAHR_ERKL" ? "JAHR_ERKL" : pl.art === "U1" ? "U1" : "U30", key = String(pl.key || "");
  if (modus === "P" && String(pl.bestaetigung || "").trim().toLowerCase() !== "abgeben") throw new Error("Zum verbindlichen Abgeben bitte „abgeben“ eintippen.");
  const z = fonZugang(); if (z.fehlt) throw new Error(z.fehlt);
  const pin = String(pl.pin || "").trim() || String(process.env.FON_PIN || "").trim(); if (!pin) throw new Error("Ohne das PIN des Webservice-Benutzers geht keine Übermittlung.");
  // Entwurf aus frischen sevDesk-Daten, gegen die Anzeige im Browser abgleichen, erst dann Paketnummer ziehen
  const e = await fonEntwurf(art, key, 999999999, true);
  if (e.befunde.some(b => b.art === "fehler")) throw new Error("So nimmt FinanzOnline das Paket nicht an: " + e.befunde.filter(b => b.art === "fehler").map(b => b.text).join(" "));
  if (art === "U30" && pl.expectZahllast != null && Math.abs(Number(pl.expectZahllast) - e.zahllast) > 0.005) throw new Error("Die Daten in sevDesk haben sich geändert (Zahllast jetzt " + e.zahllast.toFixed(2) + " statt " + Number(pl.expectZahllast).toFixed(2) + "). Bitte neu laden und erneut prüfen.");
  const o0 = readSteuer(); const paket = o0.fon.nextPaket || 1; o0.fon.nextPaket = paket >= 999999998 ? 1 : paket + 1; writeSteuer(o0);
  e.xml = e.xml.replace("<PAKET_NR>999999999</PAKET_NR>", "<PAKET_NR>" + paket + "</PAKET_NR>");
  let rc = -3, msg = "";
  try { const a = await fonUebermitteln(z, pin, art === "U1" ? "JAHR_ERKL" : art, modus, e.xml); rc = a.rc; msg = a.msg; } catch (err) { msg = String(err && err.message || "Unbekannter Fehler bei der Übermittlung."); }
  const status = rc === 0 ? (modus === "P" ? "eingereicht" : "geprüft") : (rc === -2 || rc === -3 ? "fehler" : "abgewiesen");
  const o = readSteuer();
  o.fon.archive.unshift({ at: new Date().toISOString(), art, key, label: e.p.label, modus, paket, rc, msg: String(msg).slice(0, 2000), status, kennzahlen: e.kennzahlen, zahllast: e.zahllast, xml: e.xml });
  o.fon.archive = o.fon.archive.slice(0, 120);
  if (rc === 0 && modus === "P" && art === "JAHR_ERKL") o.jab[key] = Object.assign({}, o.jab[key] || {}, { doneAt: new Date().toISOString(), summary: { gewinn: e.kennzahlen.gewinn, u1Zahllast: e.zahllast }, fon: { paket, at: new Date().toISOString() } });
  if (rc === 0 && modus === "P" && art === "U1") o.u1[key] = Object.assign({}, o.u1[key] || {}, { doneAt: new Date().toISOString(), summary: { zahllast: e.zahllast, voraus: e.kennzahlen.voraus, rest: e.kennzahlen.rest, kz: e.kennzahlen.u1 }, fon: { paket, at: new Date().toISOString() } });
  if (rc === 0 && modus === "P" && art === "U30") o.uva[key] = Object.assign({}, o.uva[key] || {}, { doneAt: new Date().toISOString(), summary: { zahllast: e.zahllast, kz: e.kennzahlen, docIds: e.docIds || [] }, fon: { paket, at: new Date().toISOString() } });
  writeSteuer(o);
  return { ok: rc === 0, rc, msg, status, paket, steuer: steuerPublic(o) };
}

// ── VIES-UID-Abfrage (öffentliche REST-API der EU-Kommission), Cache in steuer.json ──
const VIES_URL = process.env.VIES_URL || "https://ec.europa.eu/taxation_customs/vies/rest-api/ms";
async function viesCheck(uidRaw) {
  const v = STEUER_CALC.uidValid(uidRaw); if (!v.ok) return { uid: v.uid || uidRaw, valid: false, format: false, why: v.why };
  const o = readSteuer(); o.vies = o.vies || {}; const hit = o.vies[v.uid];
  if (hit && Date.now() - Date.parse(hit.at) < 7 * 864e5) return Object.assign({ cached: true }, hit);
  const cc = v.uid.slice(0, 2) === "GR" ? "EL" : v.uid.slice(0, 2), nr = v.uid.slice(2);
  let j = null; try { const r = await fetch(VIES_URL + "/" + cc + "/vat/" + encodeURIComponent(nr), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) }); j = await r.json(); } catch (e) { throw new Error("VIES ist gerade nicht erreichbar."); }
  const res = { uid: v.uid, valid: !!(j && (j.isValid || j.valid)), format: true, name: String((j && j.name) || "").slice(0, 120), address: String((j && j.address) || "").replace(/\s+/g, " ").slice(0, 200), at: new Date().toISOString(), why: j && j.userError && j.userError !== "VALID" ? String(j.userError) : "" };
  const o2 = readSteuer(); o2.vies = o2.vies || {}; o2.vies[v.uid] = res; const ks = Object.keys(o2.vies); if (ks.length > 500) delete o2.vies[ks[0]]; writeSteuer(o2);
  return res;
}

// ── sevDesk-Abgleich: Schreibzugriffe nur auf ausdrücklichen Klick mit Bestätigung, nie für festgeschriebene Belege ──
const SEV_RULES_EXPENSE = ["8", "9", "10", "12", "13", "14"];
async function sevFixTaxRule(pl) {
  if (pl.confirm !== true) throw new Error("bestaetigung_fehlt");
  const id = String(pl.id || "").replace(/\D/g, ""), rule = String(pl.taxRule || "");
  const known = (STEUER_CACHE.data && STEUER_CACHE.data.taxRules || []).filter(r => /EXPENSE/i.test(r.side || "")).map(r => String(r.id));
  if (!id || (known.length ? known : SEV_RULES_EXPENSE).indexOf(rule) < 0) throw new Error("ungueltig");
  const j = await sev("GET", "/Voucher/" + id); const v = j && j.objects && (Array.isArray(j.objects) ? j.objects[0] : j.objects);
  if (!v) throw new Error("Beleg nicht gefunden.");
  if (v.enshrined) throw new Error("Der Beleg ist in sevDesk festgeschrieben und kann nicht geändert werden.");
  if (v.creditDebit !== "C") throw new Error("Nur Ausgabenbelege.");
  if (!(v.taxRule && v.taxRule.id)) throw new Error("Dieses sevDesk-Konto verwendet noch keine Steuerregeln (Update 2.0).");
  await sev("PUT", "/Voucher/" + id, { body: { taxRule: { id: rule, objectName: "TaxRule" } } });
  STEUER_CACHE.at = 0;
  return { id, taxRule: rule };
}
async function sevTagUva(pl) {
  if (pl.confirm !== true) throw new Error("bestaetigung_fehlt");
  const p = steuerPeriod(pl.key); if (!p) throw new Error("Unbekannter Zeitraum.");
  const o = readSteuer(), raw = await steuerRaw(false), r = STEUER_CALC.computeUva(raw, o, p);
  const name = "UVA-" + p.year + "-" + p.key.slice(5), seen = new Set(), objs = [];
  Object.keys(r.docs).forEach(kz => r.docs[kz].forEach(x => { const d = x.doc; if (!d || /^manual/.test(d.id)) return; const on = x.kind === "in" || x.kind === "vin" ? "Voucher" : (/^cn/.test(d.id) ? "CreditNote" : "Invoice"); const sid = d.sevId || d.id; if (seen.has(on + sid)) return; seen.add(on + sid); objs.push({ id: sid, objectName: on }); }));
  r.zm.forEach(z => { const sid = z.doc.sevId || z.doc.id; const on = /^cn/.test(z.doc.id) ? "CreditNote" : "Invoice"; if (!seen.has(on + sid)) { seen.add(on + sid); objs.push({ id: sid, objectName: on }); } });
  let ok = 0, fail = 0;
  for (const ob of objs.slice(0, 300)) { try { await sev("POST", "/Tag/Factory/create", { body: { name, object: { id: Number(ob.id), objectName: ob.objectName } } }); ok++; } catch (e) { fail++; } }
  const o2 = readSteuer(); o2.uva[p.key] = Object.assign({}, o2.uva[p.key] || {}, { tagged: { name, at: new Date().toISOString(), ok, fail } }); writeSteuer(o2);
  return { name, tagged: ok, fail, total: objs.length, steuer: steuerPublic(o2) };
}
// USt-Vorauszahlung als Beleg anlegen und mit der Bankbuchung verknüpfen (gleicher Weg wie Belege aus Mails: saveVoucher + bookAmount)
async function sevUstPayment(pl) {
  if (pl.confirm !== true) throw new Error("bestaetigung_fehlt");
  const p = steuerPeriod(pl.key); if (!p) throw new Error("Unbekannter Zeitraum.");
  const raw = await steuerRaw(false); const t = (raw.transactions || []).find(x => x.id === String(pl.transactionId || ""));
  if (!t) throw new Error("Bankbuchung nicht gefunden.");
  const amount = Math.round(Math.abs(t.amount) * 100) / 100; if (!(amount > 0)) throw new Error("kein_betrag");
  // Eigene Abfrage: sevMeta blendet Steuer-Kategorien (VAT/VATPAY) bewusst aus
  let at = String(pl.accountingTypeId || "").replace(/\D/g, "");
  if (!at) { const all = await sev("GET", "/AccountingType", { query: { limit: 1000 } }).catch(() => ({ objects: [] }));
    const hit = ((all && all.objects) || []).filter(a => String(a.active) !== "0").find(a => /umsatzsteuer.*voraus|ust.*voraus|voraus.*umsatzsteuer|zahllast|umsatzsteuer.*finanzamt/i.test(a.name || "")); at = hit ? String(hit.id) : ""; }
  if (!at) throw new Error("In sevDesk wurde keine Buchungskategorie für die USt-Vorauszahlung gefunden. Bitte den Beleg einmal manuell anlegen.");
  const body = {
    voucher: { objectName: "Voucher", mapAll: true, voucherDate: sevDateDE(t.date), supplierName: "Finanzamt Österreich", description: "USt-Vorauszahlung " + p.label, status: 100, taxType: "default", creditDebit: "C", voucherType: "VOU", currency: "EUR" },
    voucherPosSave: [{ objectName: "VoucherPos", mapAll: true, accountingType: { id: at, objectName: "AccountingType" }, taxRate: 0, net: false, sumGross: amount, sumNet: amount, comment: "USt-Vorauszahlung " + p.label }],
    voucherPosDelete: null,
  };
  const j = await sev("POST", "/Voucher/Factory/saveVoucher", { body, timeout: 40000 });
  const v = j && j.objects && (j.objects.voucher || j.objects) || {}; const vid = String(v.id || ""); if (!vid) throw new Error("Beleg konnte nicht angelegt werden.");
  let booked = false, bookErr = "";
  try { await sev("PUT", "/Voucher/" + vid + "/bookAmount", { body: { amount, date: Math.floor(Date.parse(t.date + "T12:00:00Z") / 1000), type: "N", createFeed: true, checkAccount: { id: t.accountId, objectName: "CheckAccount" }, checkAccountTransaction: { id: t.id, objectName: "CheckAccountTransaction" } } }); booked = true; }
  catch (e) { bookErr = String(e.message || e).slice(0, 200); }
  STEUER_CACHE.at = 0; SEV_CACHE.at = 0;
  const o = readSteuer(); o.uva[p.key] = Object.assign({}, o.uva[p.key] || {}, { paid: { voucherId: vid, transactionId: t.id, amount, date: t.date, booked } }); writeSteuer(o);
  return { voucherId: vid, booked, bookErr, steuer: steuerPublic(o) };
}
async function handleAdmin(req, res, u, p) {
  if (p === "/admin/login" && req.method === "GET") {
    if (adminAuthed(req)) return send(res, 302, "", "text/plain", { Location: "/admin" });
    return send(res, 200, adminLoginPage(""), TYPES[".html"], { "X-Robots-Tag": "noindex" });
  }
  if (p === "/admin/login" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 4096) req.destroy(); });
    req.on("end", () => {
      const pw = new URLSearchParams(body).get("password") || "";
      const ok = ADMIN_PW && pw.length === ADMIN_PW.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(ADMIN_PW));
      if (ok) {
        const cookie = "fsadmin=" + encodeURIComponent(sign("ok")) + "; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax; Secure";
        return send(res, 302, "", "text/plain", { "Set-Cookie": cookie, Location: "/admin" });
      }
      return send(res, 401, adminLoginPage("Falsches Passwort."), TYPES[".html"]);
    });
    return;
  }
  if (p === "/admin/logout") {
    return send(res, 302, "", "text/plain", { "Set-Cookie": "fsadmin=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure", Location: "/admin/login" });
  }
  if (!adminAuthed(req)) return send(res, 302, "", "text/plain", { Location: "/admin/login" });
  // KI-Funktionen (Claude) – eigenes Modul ki.js
  if (p.indexOf("/admin/api/ki/") === 0) return KI.handle(req, res, u, p);

  if (p === "/admin" || p === "/admin/") {
    return sendGz(req, res, 200, cockpitHtml(), TYPES[".html"], { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  }
  // Frühere Adresse des klassischen Dashboards -> Cockpit
  if (p === "/admin/alt" || p === "/admin/alt/") return send(res, 301, "", "text/plain", { Location: "/admin" });

  // Nur das Postfach (schnell, ohne Plattform-/Kalenderabrufe). ?etag=… → {same:true}, wenn sich nichts geändert hat.
  if (p === "/admin/api/mail" && req.method === "GET") {
    if (u.searchParams.get("fresh") === "1") MAIL_SNAP.at = 0;
    const m = await mailSnapshot();
    if (!m) return send(res, 503, JSON.stringify({ error: "mail_not_available" }), TYPES[".json"], { "Cache-Control": "no-store" });
    const known = u.searchParams.get("etag") || "";
    if (known && m.etag && known === m.etag) return send(res, 200, JSON.stringify({ same: true, etag: m.etag }), TYPES[".json"], { "Cache-Control": "no-store" });
    return sendGz(req, res, 200, JSON.stringify(m), TYPES[".json"], { "Cache-Control": "no-store" });
  }
  if (p === "/admin/api/all") {
    const yr = (u.searchParams.get("year") || "").replace(/[^0-9]/g, "") || String(new Date().getFullYear());
    const [k, m, b, cal, ko, va, pc] = await Promise.all([kantineurStats(yr), mailSnapshot(), blitzdingsStats(yr), calendarEvents(), kochduStats(yr), valueroStats(yr), privateCalQuick().catch(() => null)]);
    return sendGz(req, res, 200, JSON.stringify({ kantineur: k, mail: m, blitzdings: b, calendar: cal, kochdu: ko, valuero: va, todos: readTodos(), manualEvents: readEvents(), privateCal: pc }), TYPES[".json"], { "Cache-Control": "no-store" });
  }
  // ---- sevDesk: Status + (nur Admin) Lese-Zugriff zum Prüfen ----
  if (p === "/admin/api/sevdesk/status" && req.method === "GET") {
    const k = await sevKey().catch(() => "");
    let version = null, err = SEV.err || "";
    if (k) { try { const v = await sev("GET", "/Tools/bookkeepingSystemVersion"); version = v && v.objects && v.objects.version; } catch (e) { err = String(e.message || e).slice(0, 200); } }
    return send(res, 200, JSON.stringify({ configured: !!k, source: SEV.src, version, error: err }), TYPES[".json"], { "Cache-Control": "no-store" });
  }
  if (p === "/admin/api/sevdesk" && req.method === "GET") {
    try { const d = await sevSnapshot(u.searchParams.get("force") === "1"); return sendGz(req, res, 200, JSON.stringify(d), TYPES[".json"], { "Cache-Control": "no-store" }); }
    catch (e) { return send(res, 200, JSON.stringify({ configured: e.status !== 503, error: String(e.message || e).slice(0, 200) }), TYPES[".json"], { "Cache-Control": "no-store" }); }
  }
  if (p === "/admin/api/sevdesk/meta" && req.method === "GET") {
    try { const d = await sevMeta(u.searchParams.get("force") === "1"); return sendGz(req, res, 200, JSON.stringify(d), TYPES[".json"], { "Cache-Control": "no-store" }); }
    catch (e) { return send(res, 200, JSON.stringify({ error: String(e.message || e).slice(0, 200) }), TYPES[".json"]); }
  }
  if (p === "/admin/api/sevdesk/pdf" && req.method === "GET") {
    const id = String(u.searchParams.get("id") || "").replace(/\D/g, "");
    if (!id) return send(res, 400, "missing id");
    try {
      const rr = await sev("GET", "/Invoice/" + id + "/getPdf", { query: { download: "true", preventSendBy: "true" }, timeout: 40000, binary: true });
      let buf = null, fname = "";
      if (rr.buf && rr.buf.length > 4) { buf = rr.buf; const mf = String(rr.disposition || "").match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i); fname = mf ? decodeURIComponent(mf[1]) : ""; }
      else { const o = (rr.json && rr.json.objects) || {}; if (o.content) { buf = Buffer.from(String(o.content), o.base64encoded === false ? "binary" : "base64"); fname = o.filename || ""; } }
      if (!buf) return send(res, 404, "PDF nicht gefunden", "text/plain; charset=utf-8");
      const inv = SEV_CACHE.data && (SEV_CACHE.data.invoices || []).find(x => x.id === id);
      fname = String(fname || ((inv && inv.nr) ? inv.nr + ".pdf" : "Rechnung-" + id + ".pdf")).replace(/[^\w.\- ]/g, "_");
      return send(res, 200, buf, "application/pdf", { "Content-Disposition": (u.searchParams.get("dl") === "1" ? "attachment" : "inline") + '; filename="' + fname + '"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    } catch (e) { return send(res, e.status || 500, "PDF konnte nicht geladen werden: " + String(e.message || e).slice(0, 200), "text/plain; charset=utf-8"); }
  }
  if (p === "/admin/api/sevdesk/invoice" && req.method === "POST") {
    try { const pl = await sevBody(req); const r = await sevCreateInvoice(pl); return send(res, 200, JSON.stringify(Object.assign({ ok: true }, r)), TYPES[".json"]); }
    catch (e) { return send(res, 200, JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 300) }), TYPES[".json"]); }
  }
  if (p === "/admin/api/sevdesk/book" && req.method === "POST") {
    try { const pl = await sevBody(req); await sevBook(pl); return send(res, 200, JSON.stringify({ ok: true }), TYPES[".json"]); }
    catch (e) { return send(res, 200, JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 300) }), TYPES[".json"]); }
  }
  if (p === "/admin/api/sevdesk/voucher" && req.method === "POST") {
    try { const pl = await sevBody(req); const r = await sevVoucherFromMail(pl); return send(res, 200, JSON.stringify(Object.assign({ ok: true }, r)), TYPES[".json"]); }
    catch (e) { return send(res, 200, JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 300) }), TYPES[".json"]); }
  }
  if (p === "/admin/api/sevdesk/raw" && req.method === "GET") {
    const path = String(u.searchParams.get("path") || "");
    if (!/^\/[A-Za-z][A-Za-z0-9\/_]*$/.test(path)) return send(res, 400, JSON.stringify({ error: "bad_path" }), TYPES[".json"]);
    const q = {}; u.searchParams.forEach((v, k) => { if (k !== "path") q[k] = v; });
    try { const j = await sev("GET", path, { query: q }); return send(res, 200, JSON.stringify(j), TYPES[".json"], { "Cache-Control": "no-store" }); }
    catch (e) { return send(res, e.status || 500, JSON.stringify({ error: String(e.message || e).slice(0, 300) }), TYPES[".json"]); }
  }
  if (p === "/admin/api/kochdu-settle" && req.method === "POST") {
    if (!KOCHDU.token) return send(res, 503, JSON.stringify({ error: "kochdu_not_configured" }), TYPES[".json"]);
    let body = "";
    req.on("data", c => { body += c; if (body.length > 20000) req.destroy(); });
    req.on("end", async () => {
      let payload; try { payload = JSON.parse(body || "{}"); } catch (e) { return send(res, 400, JSON.stringify({ error: "bad_json" }), TYPES[".json"]); }
      try {
        const r = await fetch(KOCHDU.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ token: KOCHDU.token }, payload)) });
        const txt = await r.text();
        if (r.ok) forgetStats(KOCHDU.url);
        return send(res, r.status, txt, TYPES[".json"]);
      } catch (e) { return send(res, 502, JSON.stringify({ error: "kochdu_settle_failed" }), TYPES[".json"]); }
    });
    return;
  }
  if (p === "/admin/api/blitz-pay" && req.method === "POST") {
    if (!BLITZ.token) return send(res, 503, JSON.stringify({ error: "blitz_not_configured" }), TYPES[".json"]);
    let body = "";
    req.on("data", c => { body += c; if (body.length > 20000) req.destroy(); });
    req.on("end", async () => {
      let payload; try { payload = JSON.parse(body || "{}"); } catch (e) { return send(res, 400, JSON.stringify({ error: "bad_json" }), TYPES[".json"]); }
      try {
        const r = await fetch(BLITZ.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: BLITZ.token, id: payload.id, paid: !!payload.paid }) });
        const txt = await r.text();
        if (r.ok) forgetStats(BLITZ.url);
        return send(res, r.status, txt, TYPES[".json"]);
      } catch (e) { return send(res, 502, JSON.stringify({ error: "blitz_pay_failed" }), TYPES[".json"]); }
    });
    return;
  }
  // ---- Einstellungen: Status der Verbindungen + Mail-Passwörter setzen ----
  if (p === "/admin/api/settings" && req.method === "GET") {
    let accounts = [];
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(MAIL.url.replace(/\/api\/mails.*$/, "/api/health"), { signal: ctrl.signal }); clearTimeout(t);
      const j = await r.json(); accounts = Array.isArray(j.accounts) ? j.accounts : [];
    } catch (e) {}
    const integrations = [
      { key: "mail", label: "Postfach (Mail-Dienst)", ok: !!(MAIL.url && MAIL.token) },
      { key: "cloudflare", label: "Cloudflare", ok: !!CF.token },
      { key: "railway", label: "Railway", ok: !!RW.token },
      { key: "kochdu", label: "kochdu", ok: !!KOCHDU.token },
      { key: "kantineur", label: "Kantineur", ok: !!KANTINEUR.token },
      { key: "blitzdings", label: "Blitzdings", ok: !!BLITZ.token },
      { key: "valuero", label: "VALUERO (Antonhaus / Alpinappart)", ok: !!(ANTONHAUS.token || ALPINAPPART.key) },
    ];
    integrations.push({ key: "sevdesk", label: "sevDesk (Buchhaltung)" + (SEV.src === "kochdu" ? " – Schlüssel von kochdu" : ""), ok: !!(SEV.key || await sevKey().catch(() => "")) });
    integrations.push({ key: "ki", label: "KI (Claude von Anthropic)", ok: KI.configured() });
    const ic = icloudCfg();
    integrations.push({ key: "icloud", label: "Privater Kalender (iCloud)", ok: !!(ic.user && ic.pass && ic.calUrl) });
    return send(res, 200, JSON.stringify({ accounts, integrations, canSave: !!RW.token, icloud: { configured: !!(ic.user && ic.pass && ic.calUrl), user: ic.user, calName: ic.calName, calColor: ic.calColor } }), TYPES[".json"], { "Cache-Control": "no-store" });
  }
  // ---- Privater iCloud-Kalender ----
  if (p === "/admin/api/private-cal" && req.method === "GET") {
    try { const d = await privateCalendar(u.searchParams.get("force") === "1"); return send(res, 200, JSON.stringify(d), TYPES[".json"], { "Cache-Control": "no-store" }); }
    catch (e) { return send(res, 500, JSON.stringify({ error: String(e && e.message || e) }), TYPES[".json"]); }
  }
  if (p === "/admin/api/private-cal" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 100000) req.destroy(); });
    req.on("end", async () => {
      let pl; try { pl = JSON.parse(body || "{}"); } catch (e) { return send(res, 400, JSON.stringify({ ok: false, error: "bad_json" }), TYPES[".json"]); }
      try { const d = await privateCalWrite(String(pl.op || ""), pl); return send(res, 200, JSON.stringify({ ok: true, privateCal: d }), TYPES[".json"]); }
      catch (e) { return send(res, 200, JSON.stringify({ ok: false, error: String(e && e.message || e) }), TYPES[".json"]); }
    });
    return;
  }
  if (p === "/admin/api/settings/icloud" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 20000) req.destroy(); });
    req.on("end", async () => {
      let pl; try { pl = JSON.parse(body || "{}"); } catch (e) { return send(res, 400, JSON.stringify({ ok: false, error: "bad_json" }), TYPES[".json"]); }
      const action = String(pl.action || "discover");
      if (action === "disconnect") { icloudClear(); PRIV_CACHE = { at: 0, data: null, p: null }; return send(res, 200, JSON.stringify({ ok: true }), TYPES[".json"]); }
      const cur = icloudCfg();
      const user = String(pl.user || cur.user || "").trim(), pass = String(pl.pass || "").replace(/\s+/g, "") || cur.pass;
      if (!user || !pass) return send(res, 400, JSON.stringify({ ok: false, error: "missing" }), TYPES[".json"]);
      try {
        const cals = await icloudDiscover(user, pass);
        if (action === "discover") return send(res, 200, JSON.stringify({ ok: true, calendars: cals.map(c => ({ url: c.url, name: c.name, color: c.color, writable: c.writable, shared: c.shared })) }), TYPES[".json"]);
        const pick = cals.find(c => c.url === pl.calUrl);
        if (!pick) return send(res, 400, JSON.stringify({ ok: false, error: "calendar_not_found" }), TYPES[".json"]);
        if (!icloudSave({ user, pass, calUrl: pick.url, calName: pick.name, calColor: pick.color })) return send(res, 500, JSON.stringify({ ok: false, error: "save_failed" }), TYPES[".json"]);
        PRIV_CACHE = { at: 0, data: null, p: null };
        const d = await privateCalendar(true);
        return send(res, 200, JSON.stringify({ ok: true, calName: pick.name, privateCal: d }), TYPES[".json"]);
      } catch (e) {
        const msg = String(e && e.message || e);
        return send(res, 200, JSON.stringify({ ok: false, error: /login_failed/.test(msg) ? "login_failed" : "failed", detail: msg.slice(0, 160) }), TYPES[".json"]);
      }
    });
    return;
  }
  if (p === "/admin/api/settings/mail-account" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 20000) req.destroy(); });
    req.on("end", async () => {
      let payload; try { payload = JSON.parse(body || "{}"); } catch (e) { return send(res, 400, JSON.stringify({ ok: false, error: "bad_json" }), TYPES[".json"]); }
      const key = String(payload.key || ""), pass = String(payload.pass || "").replace(/\s+/g, ""), login = String(payload.login || "").trim();
      if (!key || !pass) return send(res, 400, JSON.stringify({ ok: false, error: "missing" }), TYPES[".json"]);
      if (!RW.token) return send(res, 503, JSON.stringify({ ok: false, error: "railway_token_missing" }), TYPES[".json"]);
      const base = MAIL.url.replace(/\/api\/mails.*$/, "");
      try {
        // 1) Konto-Infos (welche Variable) vom Mail-Dienst
        const h = await (await fetch(base + "/api/health")).json();
        const acc = (h.accounts || []).find(a => a.key === key);
        if (!acc || !acc.env) return send(res, 404, JSON.stringify({ ok: false, error: "unknown_account" }), TYPES[".json"]);
        // 2) Zugangsdaten testen (Anmeldung am Postfach)
        const tr = await fetch(base + "/api/test-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: MAIL.token, key, pass, login: login || undefined }) });
        const tj = await tr.json().catch(() => ({}));
        if (!tj.ok && !payload.force) return send(res, 200, JSON.stringify({ ok: false, error: tj.error || "test_failed", detail: tj.detail || "" }), TYPES[".json"]);
        // 3) In Railway als Variable des Mail-Dienstes speichern -> Dienst startet mit neuen Zugangsdaten neu
        const vars = {}; vars[acc.env + "_PASS"] = pass;
        if (login && acc.env !== "IMAP") vars[acc.env + "_LOGIN"] = login;
        const q = "mutation($input: VariableCollectionUpsertInput!){ variableCollectionUpsert(input:$input) }";
        const input = { projectId: process.env.RAILWAY_PROJECT_ID || "5ab009b1-4a14-436e-9c60-f06d94e68f6b", environmentId: process.env.RAILWAY_ENVIRONMENT_ID || "43bc9c87-f97f-4d1b-8294-abdf1e48e552", serviceId: process.env.MAIL_API_SERVICE_ID || "3fb095c5-f0b7-4143-941d-d79bc9d163c4", variables: vars };
        const rj = await rwGQL(q, { input });
        if (!rj || rj.errors) return send(res, 500, JSON.stringify({ ok: false, error: "save_failed", detail: (rj && rj.errors && rj.errors[0] && rj.errors[0].message) || "" }), TYPES[".json"]);
        MAIL_SNAP.at = 0;
        return send(res, 200, JSON.stringify({ ok: true, tested: !!tj.ok, restarting: true }), TYPES[".json"]);
      } catch (e) { return send(res, 500, JSON.stringify({ ok: false, error: "failed", detail: String(e && e.message || e).slice(0, 160) }), TYPES[".json"]); }
    });
    return;
  }
  if (p === "/admin/api/version") {
    return send(res, 200, JSON.stringify({ build: BUILD }), TYPES[".json"], { "Cache-Control": "no-store" });
  }
  if (p === "/admin/api/sites") {
    try { const s = await sitesSnapshot(u.searchParams.get("force") === "1"); return sendGz(req, res, 200, JSON.stringify(s), TYPES[".json"], { "Cache-Control": "no-store" }); }
    catch (e) { return send(res, 500, JSON.stringify({ error: "sites_failed", detail: String(e && e.message || e) }), TYPES[".json"]); }
  }
  if (p.indexOf("/admin/neu/") === 0 && p.length > 11) {
    const buf = cockpitModule(p.slice(11));
    if (!buf) return send(res, 404, "not found");
    return sendGz(req, res, 200, buf, TYPES[".js"], { "Cache-Control": "private, max-age=31536000, immutable", "X-Robots-Tag": "noindex" });
  }
  // Alte Adresse des Cockpits -> /admin
  if (p === "/admin/neu" || p === "/admin/neu/") {
    return send(res, 301, "", "text/plain", { Location: "/admin" + (u.search || "") });
  }
  if (p === "/admin/api/cockpit" && req.method === "GET") {
    const yr = (u.searchParams.get("year") || "").replace(/[^0-9]/g, "").slice(0, 4) || String(new Date().getFullYear());
    try { const d = await cockpitData(yr, u.searchParams.get("force") === "1", u.searchParams.get("forecast") === "1"); ADMIN_SEEN = Date.now(); return sendGz(req, res, 200, JSON.stringify(d), TYPES[".json"], { "Cache-Control": "no-store" }); }
    catch (e) { return send(res, 500, JSON.stringify({ error: String(e && e.message || e).slice(0, 200) }), TYPES[".json"]); }
  }
  if (p === "/admin/api/leads" && req.method === "POST") {
    try { const pl = await sevBody(req, 100000); return send(res, 200, JSON.stringify({ ok: true, leads: leadOp(pl) }), TYPES[".json"]); }
    catch (e) { return send(res, 200, JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 200) }), TYPES[".json"]); }
  }
  if (p === "/admin/api/steuer" && req.method === "GET") {
    const st = steuerPublic(readSteuer()); const z = fonZugang();
    const fonCfg = { ready: !z.fehlt, fehlt: z.fehlt || "", pinEnv: !!z.pinEnv, jahrSchema: Object.keys(FON_JAHR_SCHEMA) };
    try { const raw = await steuerRaw(u.searchParams.get("force") === "1"); return sendGz(req, res, 200, JSON.stringify(Object.assign({ ok: true, fonCfg }, st, { data: raw })), TYPES[".json"], { "Cache-Control": "no-store" }); }
    catch (e) { return send(res, 200, JSON.stringify(Object.assign({ ok: false, fonCfg, error: String(e && e.message || e).slice(0, 200) }, st)), TYPES[".json"]); }
  }
  if (p === "/admin/api/steuer" && req.method === "POST") {
    try { const pl = await sevBody(req, 300000); const o = steuerOp(pl); return send(res, 200, JSON.stringify(Object.assign({ ok: true }, steuerPublic(o))), TYPES[".json"]); }
    catch (e) { return send(res, 200, JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 200) }), TYPES[".json"]); }
  }
  // sevDesk-Abgleich: Steuerregel korrigieren, UVA-Tags setzen, USt-Zahlung als Beleg – jeweils nur mit confirm:true aus dem Bestätigungsdialog
  if ((p === "/admin/api/steuer/sevfix" || p === "/admin/api/steuer/sevtag" || p === "/admin/api/steuer/ustpay") && req.method === "POST") {
    try { const pl = await sevBody(req, 20000); const r = p.endsWith("sevfix") ? await sevFixTaxRule(pl) : p.endsWith("sevtag") ? await sevTagUva(pl) : await sevUstPayment(pl); return send(res, 200, JSON.stringify(Object.assign({ ok: true }, r)), TYPES[".json"]); }
    catch (e) { return send(res, 200, JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 300) }), TYPES[".json"]); }
  }
  // UID-Prüfung über VIES (EU-Kommission, nur lesend, Ergebnis 7 Tage gespeichert)
  if (p === "/admin/api/steuer/vies" && req.method === "GET") {
    try { const r = await viesCheck(String(u.searchParams.get("uid") || "")); return send(res, 200, JSON.stringify(Object.assign({ ok: true }, r)), TYPES[".json"], { "Cache-Control": "no-store" }); }
    catch (e) { return send(res, 200, JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 200) }), TYPES[".json"]); }
  }
  // Schnittstelle für KI-Vorschläge: aktuelle Einordnung eines Belegs mit Begründung (nur lesend)
  if (p === "/admin/api/steuer/explain" && req.method === "GET") {
    try { const raw = await steuerRaw(false); const x = STEUER_CALC.explainDoc(raw, readSteuer(), String(u.searchParams.get("id") || "")); return send(res, x ? 200 : 404, JSON.stringify(x ? Object.assign({ ok: true }, x) : { ok: false, error: "nicht_gefunden" }), TYPES[".json"], { "Cache-Control": "no-store" }); }
    catch (e) { return send(res, 200, JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 200) }), TYPES[".json"]); }
  }
  // FinanzOnline: XML-Vorschau, Prüfung (T) und verbindliche Abgabe (P). PIN nur im Request-Body, wird nicht gespeichert.
  if (p === "/admin/api/fon/xml" && req.method === "POST") {
    try { const pl = await sevBody(req, 20000); const e = await fonEntwurf(pl.art === "U13" ? "U13" : pl.art === "JAHR_ERKL" ? "JAHR_ERKL" : pl.art === "U1" ? "U1" : "U30", String(pl.key || ""), 999999999, pl.fresh === true); return send(res, 200, JSON.stringify({ ok: true, art: e.art, xml: e.xml, befunde: e.befunde, kennzahlen: e.kennzahlen, zahllast: e.zahllast }), TYPES[".json"], { "Cache-Control": "no-store" }); }
    catch (e) { return send(res, 200, JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 300) }), TYPES[".json"]); }
  }
  if (p === "/admin/api/fon/archiv" && req.method === "GET") {
    const o = readSteuer(), i = parseInt(u.searchParams.get("i"), 10), a = o.fon.archive[i];
    if (!a) return send(res, 404, "nicht gefunden", "text/plain");
    return send(res, 200, a.xml || "", "application/xml; charset=utf-8", { "Content-Disposition": 'attachment; filename="' + a.art + "_" + a.key + "_" + a.paket + '.xml"', "Cache-Control": "no-store" });
  }
  if ((p === "/admin/api/fon/check" || p === "/admin/api/fon/submit") && req.method === "POST") {
    try { const pl = await sevBody(req, 20000); const r = await fonSenden(pl, p.endsWith("submit") ? "P" : "T"); pl.pin = undefined; return send(res, 200, JSON.stringify(r), TYPES[".json"], { "Cache-Control": "no-store" }); }
    catch (e) { return send(res, 200, JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 400) }), TYPES[".json"]); }
  }
  if (p === "/admin/api/leads" && req.method === "GET") {
    return send(res, 200, JSON.stringify({ leads: readLeads().reverse() }), TYPES[".json"], { "Cache-Control": "no-store" });
  }
  // ---- Abrechnung (Preise, Website-Einstellungen, letzte Rechnungen) ----
  if (p === "/admin/api/billing" && req.method === "GET") {
    return send(res, 200, JSON.stringify(readBilling()), TYPES[".json"], { "Cache-Control": "no-store" });
  }
  if (p === "/admin/api/billing" && req.method === "POST") {
    try { const pl = await sevBody(req, 100000); const o = billingOp(pl); return send(res, 200, JSON.stringify({ ok: true, billing: o }), TYPES[".json"]); }
    catch (e) { return send(res, 200, JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 200) }), TYPES[".json"]); }
  }
  if (p === "/admin/api/railway-costs" && req.method === "GET") {
    try { const d = await railwayCosts(u.searchParams.get("force") === "1"); return send(res, 200, JSON.stringify(d), TYPES[".json"], { "Cache-Control": "no-store" }); }
    catch (e) { return send(res, 200, JSON.stringify({ configured: true, error: String(e.message || e).slice(0, 200), projects: {} }), TYPES[".json"]); }
  }
  if (p === "/admin/api/todos" && req.method === "GET") {
    return send(res, 200, JSON.stringify({ todos: readTodos() }), TYPES[".json"], { "Cache-Control": "no-store" });
  }
  if (p === "/admin/api/todos" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 1000000) req.destroy(); });
    req.on("end", () => {
      let payload; try { payload = JSON.parse(body || "{}"); } catch (e) { return send(res, 400, JSON.stringify({ error: "bad_json" }), TYPES[".json"]); }
      const arr = Array.isArray(payload.todos) ? payload.todos : [];
      const cur = readTodos();
      const merged = payload.force ? arr : merge3(cur, Array.isArray(payload.base) ? payload.base : null, arr);
      // Schutz: nicht-leeren Bestand nie mit leerer Liste überschreiben (außer force).
      if (merged.length === 0 && cur.length > 0 && !payload.force && !Array.isArray(payload.base)) return send(res, 200, JSON.stringify({ ok: true, skipped: "empty_guard", todos: cur }), TYPES[".json"]);
      const ok = writeTodos(merged);
      return send(res, ok ? 200 : 500, JSON.stringify({ ok: ok, count: merged.length, todos: merged }), TYPES[".json"]);
    });
    return;
  }
  if (p === "/admin/api/events" && req.method === "GET") {
    return send(res, 200, JSON.stringify({ events: readEvents() }), TYPES[".json"], { "Cache-Control": "no-store" });
  }
  if (p === "/admin/api/events" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 1000000) req.destroy(); });
    req.on("end", () => {
      let payload; try { payload = JSON.parse(body || "{}"); } catch (e) { return send(res, 400, JSON.stringify({ error: "bad_json" }), TYPES[".json"]); }
      const arr = Array.isArray(payload.events) ? payload.events : [];
      const cur = readEvents();
      const merged = payload.force ? arr : merge3(cur, Array.isArray(payload.base) ? payload.base : null, arr);
      if (merged.length === 0 && cur.length > 0 && !payload.force && !Array.isArray(payload.base)) return send(res, 200, JSON.stringify({ ok: true, skipped: "empty_guard", events: cur }), TYPES[".json"]);
      const ok = writeEvents(merged);
      return send(res, ok ? 200 : 500, JSON.stringify({ ok: ok, count: merged.length, events: merged }), TYPES[".json"]);
    });
    return;
  }
  // Alle Anhänge einer Mail als ZIP
  if (p === "/admin/api/mail-attachments-zip" && req.method === "GET") {
    if (!MAIL.url || !MAIL.token) return send(res, 503, "mail_not_configured");
    let items = []; try { items = JSON.parse(u.searchParams.get("atts") || "[]"); } catch (e) {}
    items = (Array.isArray(items) ? items : []).slice(0, 40);
    if (!items.length) return send(res, 400, "no_attachments");
    const base = MAIL.url.replace(/\/api\/mails.*$/, "/api/attachment") + "?token=" + encodeURIComponent(MAIL.token) +
      "&folder=" + encodeURIComponent(u.searchParams.get("folder") || "INBOX") + "&uid=" + encodeURIComponent(u.searchParams.get("uid") || "") +
      "&account=" + encodeURIComponent(u.searchParams.get("account") || "");
    try {
      const files = []; const used = {};
      for (const it of items) {
        const r = await fetch(base + "&index=" + encodeURIComponent(String(it.index)));
        if (!r.ok) continue;
        const data = Buffer.from(await r.arrayBuffer());
        let name = String(it.filename || "anhang").replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 150) || "anhang";
        if (used[name.toLowerCase()]) { const dot = name.lastIndexOf("."); let n = 2, cand; do { cand = dot > 0 ? name.slice(0, dot) + " (" + n + ")" + name.slice(dot) : name + " (" + n + ")"; n++; } while (used[cand.toLowerCase()]); name = cand; }
        used[name.toLowerCase()] = 1;
        files.push({ name, data });
      }
      if (!files.length) return send(res, 502, "attachments_failed");
      const zip = makeZip(files);
      const zname = (String(u.searchParams.get("name") || "Anhaenge").replace(/^(re|aw|fwd?|wg)\s*:\s*/gi, "").replace(/[\\/:*?"<>|\r\n]/g, "_").trim().slice(0, 80) || "Anhaenge") + ".zip";
      const ascii = zname.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_");
      res.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(zname), "Content-Length": zip.length, "Cache-Control": "private, no-store" });
      return res.end(zip);
    } catch (e) { return send(res, 502, "zip_failed"); }
  }
  if (p === "/admin/api/mail-attachment" && req.method === "GET") {
    if (!MAIL.url || !MAIL.token) return send(res, 503, "mail_not_configured");
    const attUrl = MAIL.url.replace(/\/api\/mails.*$/, "/api/attachment") +
      "?token=" + encodeURIComponent(MAIL.token) +
      "&folder=" + encodeURIComponent(u.searchParams.get("folder") || "INBOX") +
      "&uid=" + encodeURIComponent(u.searchParams.get("uid") || "") +
      "&index=" + encodeURIComponent(u.searchParams.get("index") || "0") +
      "&account=" + encodeURIComponent(u.searchParams.get("account") || "");
    try {
      const r = await fetch(attUrl);
      if (!r.ok) return send(res, r.status, "attachment_error");
      const buf = Buffer.from(await r.arrayBuffer());
      // Dateiname aus der Antwort des Mail-Dienstes
      const cd = r.headers.get("content-disposition") || "";
      let fname = "anhang";
      const m5987 = cd.match(/filename\*=UTF-8''([^;]+)/i), mPlain = cd.match(/filename="([^"]*)"/i);
      try { if (m5987) fname = decodeURIComponent(m5987[1]); else if (mPlain) fname = mPlain[1]; } catch (e) { if (mPlain) fname = mPlain[1]; }
      // Typ bestimmen (oft kommt nur application/octet-stream) -> anhand der Endung
      const EXT = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", heic: "image/heic", svg: "image/svg+xml", txt: "text/plain; charset=utf-8", csv: "text/plain; charset=utf-8", log: "text/plain; charset=utf-8", ics: "text/plain; charset=utf-8", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", mp4: "video/mp4", mov: "video/quicktime", html: "text/html", htm: "text/html", eml: "text/plain; charset=utf-8", json: "text/plain; charset=utf-8", xml: "text/plain; charset=utf-8" };
      let ctype = (r.headers.get("content-type") || "application/octet-stream").toLowerCase();
      const ext = (fname.split(".").pop() || "").toLowerCase();
      if ((/octet-stream|binary|unknown/.test(ctype) || !ctype) && EXT[ext]) ctype = EXT[ext];
      const wantDl = u.searchParams.get("dl") === "1";
      const ascii = fname.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_");
      const headers = {
        "Content-Type": ctype,
        "Content-Disposition": (wantDl ? "attachment" : "inline") + '; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(fname),
        "Content-Length": buf.length,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      };
      // Sicherheit: aktive Inhalte (HTML, SVG, …) aus Mails nie mit Admin-Rechten ausführen
      const safeInline = /^(application\/pdf|image\/(png|jpeg|gif|webp|bmp|heic)|text\/plain|audio\/|video\/)/.test(ctype);
      if (!safeInline) headers["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'";
      res.writeHead(200, headers);
      return res.end(buf);
    } catch (e) { return send(res, 502, "attachment_failed"); }
  }
  if (p === "/admin/api/mail-send" && req.method === "POST") {
    if (!MAIL.url || !MAIL.token) return send(res, 503, JSON.stringify({ error: "mail_not_configured" }), TYPES[".json"]);
    let body = "";
    req.on("data", c => { body += c; if (body.length > 30000000) req.destroy(); });
    req.on("end", async () => {
      let payload; try { payload = JSON.parse(body || "{}"); } catch (e) { return send(res, 400, JSON.stringify({ error: "bad_json" }), TYPES[".json"]); }
      const sendUrl = MAIL.url.replace(/\/api\/mails.*$/, "/api/send");
      try {
        const r = await fetch(sendUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ token: MAIL.token }, payload)) });
        const txt = await r.text();
        if (r.ok) { MAIL_SNAP.at = 0; COCKPIT_MEMO.at = 0; }
        return send(res, r.status, txt, TYPES[".json"]);
      } catch (e) { return send(res, 502, JSON.stringify({ error: "mail_send_failed" }), TYPES[".json"]); }
    });
    return;
  }
  if (p === "/admin/api/mail-action" && req.method === "POST") {
    if (!MAIL.url || !MAIL.token) return send(res, 503, JSON.stringify({ error: "mail_not_configured" }), TYPES[".json"]);
    let body = "";
    req.on("data", c => { body += c; if (body.length > 200000) req.destroy(); });
    req.on("end", async () => {
      let payload; try { payload = JSON.parse(body || "{}"); } catch (e) { return send(res, 400, JSON.stringify({ error: "bad_json" }), TYPES[".json"]); }
      const actionUrl = MAIL.url.replace(/\/api\/mails.*$/, "/api/action");
      try {
        const r = await fetch(actionUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ token: MAIL.token }, payload)) });
        const txt = await r.text();
        if (r.ok) { MAIL_SNAP.at = 0; COCKPIT_MEMO.at = 0; }
        return send(res, r.status, txt, TYPES[".json"]);
      } catch (e) { return send(res, 502, JSON.stringify({ error: "mail_action_failed" }), TYPES[".json"]); }
    });
    return;
  }
  return send(res, 404, "Not found");
}

// ===========================================================================
// ANFRAGE-FORMULAR  POST /api/anfrage  (öffentlich)
// Speichert jede Anfrage (leads.json), legt eine Aufgabe im Admin an und schickt eine Mail.
// ===========================================================================
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const LEAD_TO = process.env.LEAD_MAIL_TO || "simon@fs-creative.at";
const LEAD_TOPICS = ["Website", "Online-Shop", "Buchungssystem / Plattform", "SEO & Sichtbarkeit", "Grafik & Branding", "Druck", "Fotobox / Event", "Betreuung & Hosting", "Etwas anderes"];
const LEAD_HITS = new Map();
function readLeads() { try { const a = JSON.parse(fs.readFileSync(LEADS_FILE, "utf8")); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function leadRateLimited(ip) {
  const now = Date.now(), hour = 3600000;
  const hits = (LEAD_HITS.get(ip) || []).filter(t => now - t < hour);
  hits.push(now); LEAD_HITS.set(ip, hits);
  if (LEAD_HITS.size > 5000) LEAD_HITS.clear();
  return hits.length > 5;
}
function clip(v, n) { return String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, n); }
function handleAnfrage(req, res) {
  const json = (status, obj) => send(res, status, JSON.stringify(obj), TYPES[".json"], { "Cache-Control": "no-store" });
  let body = "";
  req.on("data", c => { body += c; if (body.length > 20000) req.destroy(); });
  req.on("end", async () => {
    let d; try { d = JSON.parse(body || "{}"); } catch (e) { return json(400, { error: "bad_json" }); }
    // Spam-Schutz: verstecktes Feld muss leer bleiben, Formular darf nicht in unter 3 s abgeschickt werden.
    const age = Date.now() - Number(d.t || 0);
    if (d.website || !(age > 3000)) return json(200, { ok: true });
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    if (leadRateLimited(ip)) return json(429, { error: "too_many" });

    const lead = {
      id: "lead_" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
      created: new Date().toISOString(),
      name: clip(d.name, 120),
      email: clip(d.email, 160),
      phone: clip(d.phone, 60),
      company: clip(d.company, 160),
      topic: LEAD_TOPICS.indexOf(d.topic) >= 0 ? d.topic : "Etwas anderes",
      entwurf: !!d.entwurf,
      message: clip(d.message, 5000),
      source: clip(d.source, 200),
    };
    if (!lead.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email) || !d.consent) return json(400, { error: "invalid" });

    const leads = readLeads(); leads.push(lead);
    let stored = false;
    try { fs.writeFileSync(LEADS_FILE, JSON.stringify(leads)); stored = true; } catch (e) {}
    const todos = readTodos();
    todos.push({ id: lead.id, text: "📩 Anfrage: " + lead.name + " – " + lead.topic + (lead.entwurf ? " (Gratis-Entwurf)" : "") + " · " + lead.email + (lead.phone ? " · " + lead.phone : ""), due: "", done: false, created: Date.now() });
    writeTodos(todos);

    let mailed = false;
    if (MAIL.url && MAIL.token) {
      const rows = [["Name", lead.name], ["E-Mail", lead.email], ["Telefon", lead.phone], ["Firma / Verein", lead.company], ["Thema", lead.topic], ["Gratis-Entwurf", lead.entwurf ? "Ja" : "Nein"], ["Seite", lead.source]].filter(r => r[1]);
      const text = rows.map(r => r[0] + ": " + r[1]).join("\n") + "\n\n" + lead.message;
      const html = "<table cellpadding=\"4\">" + rows.map(r => "<tr><td><b>" + esc(r[0]) + "</b></td><td>" + esc(r[1]) + "</td></tr>").join("") + "</table><p style=\"white-space:pre-wrap\">" + esc(lead.message) + "</p>";
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
        const r = await fetch(MAIL.url.replace(/\/api\/mails.*$/, "/api/send"), {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
          body: JSON.stringify({ token: MAIL.token, to: LEAD_TO, replyTo: lead.email, subject: "Neue Anfrage: " + lead.topic + " – " + lead.name, text, html }),
        });
        clearTimeout(t); mailed = r.ok;
      } catch (e) {}
    }
    if (!stored && !mailed) return json(500, { error: "not_saved" });
    return json(200, { ok: true });
  });
}

// ── KI (Claude über die Anthropic API): Logik in ki.js, hier nur die Anbindung an vorhandene Daten ──
const KI = require("./ki.js")({ DATA_DIR, MAIL, send, viennaToday, readTodos, readLeads, cockpitData, mailSnapshot, sevMeta, readBilling,
  steuerRaw: f => steuerRaw(f), readSteuer: () => readSteuer(), background: require.main === module });

const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, "http://x");
    const p = u.pathname;

    // Nur eine Version online: alles (auch der Admin und die Railway-Adresse) läuft über www.fs-creative.at.
    // Ausnahmen: lokale Entwicklung und Railway-intern. GET/HEAD → 301, sonst 308 (Methode bleibt erhalten).
    const host = String(req.headers.host || "").toLowerCase().split(":")[0];
    if (host && host !== CANON_HOST && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) && !/\.railway\.internal$/.test(host) && host !== "healthcheck.railway.app" && !/\.localhost$/.test(host)) {
      const code = (req.method === "GET" || req.method === "HEAD") ? 301 : 308;
      return send(res, code, "", "text/plain", { Location: ORIGIN + (req.url || "/"), "X-Robots-Tag": "noindex" });
    }

    if (p === "/api/anfrage") {
      if (req.method !== "POST") return send(res, 405, JSON.stringify({ error: "method_not_allowed" }), TYPES[".json"], { "Allow": "POST" });
      return void handleAnfrage(req, res);
    }

    // Admin-Bereich zuerst und isoliert — Rest der Website bleibt unberührt.
    if (p === "/admin" || p.indexOf("/admin/") === 0) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");   // Admin nie in Suchmaschinen
      return void handleAdmin(req, res, u, p);
    }

    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";

    let base = path.normalize(path.join(ROOT, urlPath));
    if (!base.startsWith(ROOT)) return send(res, 403, "Forbidden");

    const raw = [base];
    if (!path.extname(urlPath)) raw.push(base + ".html");
    const candidates = [];
    for (const c of raw) {
      if (candidates.indexOf(c) < 0) candidates.push(c);
      try { const nfc = c.normalize("NFC"); if (candidates.indexOf(nfc) < 0) candidates.push(nfc); } catch (e) {}
      try { const nfd = c.normalize("NFD"); if (candidates.indexOf(nfd) < 0) candidates.push(nfd); } catch (e) {}
    }

    let found = null;
    for (const q of candidates) {
      try { if (fs.statSync(q).isFile() && isPublicFile(q)) { found = q; break; } } catch (e) {}
    }
    if (found) return serveFile(req, res, found);

    fs.readFile(path.join(ROOT, "index.html"), "utf8", (e, data) => {
      if (e) return send(res, 404, "Not found");
      const out = renderIndex(data, urlPath);
      sendGz(req, res, out.status, out.html, TYPES[".html"], { "Cache-Control": "no-cache" });
    });
  } catch (e) {
    send(res, 500, "Server error");
  }
});

// Einmalige Steuer-Diagnose ins Log (nur wenn STEUER_DIAG=<Zeitraum>, z. B. 2026-Q3): liest sevDesk nur, schreibt nichts.
async function steuerDiag(key) {
  const L = (tag, o) => console.log("STEUER_DIAG " + tag + " " + JSON.stringify(o));
  try {
    const p = steuerPeriod(key); if (!p) return L("fehler", { key });
    const sample = await sev("GET", "/Voucher", { query: { limit: 3, embed: "supplier" } }).catch(e => ({ error: String(e && e.message || e) }));
    (sample.objects || []).forEach(v => L("voucher_raw", { keys: Object.keys(v), taxRule: v.taxRule || null, taxType: v.taxType || null, taxSet: v.taxSet || null, voucherType: v.voucherType, creditDebit: v.creditDebit }));
    const sampleI = await sev("GET", "/Invoice", { query: { limit: 3, showAll: true } }).catch(() => ({}));
    (sampleI.objects || []).forEach(v => L("invoice_raw", { keys: Object.keys(v), taxRule: v.taxRule || null, taxType: v.taxType || null, invoiceType: v.invoiceType }));
    const raw = await steuerRaw(true), o = readSteuer();
    // Rohdaten 2026-04..12 zeilenweise (zum lokalen Nachrechnen), plus Cockpit-Einstellungen ohne FinanzOnline-Archiv
    if (process.env.STEUER_DIAG_RAW === "1") {
      const inR = d => (d.date || "") >= "2026-03-01" || (d.delivery || "") >= "2026-03-01" || (d.payDate || "") >= "2026-03-01";
      ["invoices", "vouchers", "creditNotes"].forEach(k => (raw[k] || []).filter(inR).forEach(d => L("raw_" + k, d)));
      L("raw_meta", { taxRules: raw.taxRules, taxSets: raw.taxSets, fetchedAt: raw.fetchedAt });
      const oc = Object.assign({}, o); delete oc.fon; L("raw_steuer", oc);
    }
    L("meta", Object.assign({ period: p }, raw.meta.counts, { taxRules: raw.taxRules, taxSets: raw.taxSets }));
    const inP = d => { const t = d.delivery || d.date || ""; return (d.date >= p.from && d.date <= p.to) || (t >= p.from && t <= p.to); };
    const agg = {};
    const add = (side, d) => { const x = STEUER_CALC.explainDoc(raw, o, d.id); if (!x) return; (x.positionen || []).forEach(l => {
      const k = side + " | regel=" + (x.sevDeskRegel ? x.sevDeskRegel.id + " " + x.sevDeskRegel.text : "–") + " | taxType=" + (d.taxType || "–") + " | satz=" + l.rate + " | klasse=" + l.klasse;
      const a = agg[k] || (agg[k] = { n: 0, net: 0, tax: 0, bsp: [] }); a.n++; a.net = Math.round((a.net + l.net) * 100) / 100; a.tax = Math.round((a.tax + l.tax) * 100) / 100;
      if (a.bsp.length < 4) a.bsp.push((x.partner || "") + " " + l.net + " (" + l.begruendung + ")"); }); };
    (raw.invoices || []).filter(d => d.status >= 200 && inP(d)).forEach(d => add("AUS", d));
    (raw.vouchers || []).filter(d => d.status >= 100 && inP(d)).forEach(d => add(d.cd === "D" ? "AUS-B" : "EIN", d));
    Object.keys(agg).sort().forEach(k => L("gruppe", Object.assign({ k }, agg[k])));
    // Einzelliste: alle Eingangsbelege mit 0 % bzw. ig. Erwerb / Reverse Charge (Lieferant, Kategorie, Einordnung)
    (raw.vouchers || []).filter(d => d.status >= 100 && d.cd !== "D" && inP(d)).forEach(d => { const x = STEUER_CALC.explainDoc(raw, o, d.id); if (!x) return;
      const regel = x.sevDeskRegel ? x.sevDeskRegel.text : ""; const ls = x.positionen || [];
      if (!(/erwerb|reverse|revers/i.test(regel) || ls.some(l => /^(ige|ige3|ige0|rc|rcnv)$/.test(l.klasse)))) return;
      L("beleg", { datum: d.date, lieferant: d.supplier, beschreibung: (d.desc || "").slice(0, 60), netto: d.net, regel, uid: d.supplierUid || "", land: x.land || "", pos: ls.map(l => l.cat + " " + l.net + " → " + l.klasse) }); });
    const r = STEUER_CALC.computeUva(raw, o, p); L("kennzahlen", STEUER_CALC.uvaKzMap(r));
    // je Ausgangsrechnung mit Datum/Leistung in Q3: eigener Beitrag zu 000/022/029 – nur Abweichungen vom Netto loggen
    (raw.invoices || []).filter(d => inP(d) && d.status >= 200 && d.type !== "MA").forEach(d => { const one = STEUER_CALC.computeUva(Object.assign({}, raw, { invoices: [d], vouchers: [], creditNotes: [] }), o, p), m = STEUER_CALC.uvaKzMap(one);
      const got = (m["022"] || 0) + (m["029"] || 0) + (m["017"] || 0) + (m["011"] || 0), want = d.lines.filter(l => l.rate > 0).reduce((a, l) => a + l.net, 0);
      if (Math.abs(got - want) > 0.05) L("abw_rechnung", { nr: d.nr, typ: d.type, status: d.status, datum: d.date, leistung: d.delivery, bis: d.deliveryUntil, bezahlt: d.payDate, paid: d.paid, brutto: d.gross, netto: d.net, kz: m, erwartet: Math.round(want * 100) / 100, kunde: d.contact }); });
    L("rv_vorlagen", (raw.vouchers || []).filter(d => d.type === "RV" && inP(d)).map(d => ({ datum: d.date, lieferant: d.supplier, netto: d.net, steuer: d.tax })));
    try { L("plausi", STEUER_CALC.plausibility(raw, o, p)); } catch (e) {}
    try { L("kontrolle", STEUER_CALC.controlCheck(raw, o, p)); } catch (e) { L("kontrolle_fehler", { e: String(e && e.message || e) }); }
  } catch (e) { L("fehler", { e: String(e && e.message || e) }); }
}

if (require.main === module) {
  server.listen(PORT, () => { console.log("FS Creative running on port " + PORT); if (process.env.STEUER_DIAG) setTimeout(() => steuerDiag(process.env.STEUER_DIAG), 15000); });
  // Sauber beenden, wenn Railway beim Deploy den alten Container stoppt (sonst „Deployment crashed“-Mail)
  function shutdown() { try { server.close(); } catch (e) {} setTimeout(() => process.exit(0), 500).unref(); }
  process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
}

module.exports = { renderIndex, ROUTE_META, NOINDEX_ROUTES };
