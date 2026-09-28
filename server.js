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

const ROUTE_META = {
  "/": ["FS Creative — Digitale Projekte aus dem Montafon", "FS Creative ist eine Kreativ- und Digitalagentur aus Gaschurn im Montafon. Eigene Plattformen & Services: Blitzdings, VALUERO, kochdu und Kantineur."],
  "/blitzdings": ["Blitzdings — Fotobox & 360°-Videobooth | FS Creative", "Blitzdings: Fotobox und 360°-Videobooth für Events im Montafon und ganz Vorarlberg. Jetzt Verfügbarkeit prüfen und buchen."],
  "/valuero": ["VALUERO — Tourismusplattform & Hosting im Montafon | FS Creative", "VALUERO ist die Tourismusplattform für das Hochmontafon — plus Hosting-Service für Ferienwohnungen: Website, Buchungsportal und Marketing."],
  "/kochdu": ["kochdu — Essen bestellen im Montafon | FS Creative", "kochdu ist die Bestell- und Lieferplattform für Restaurants im Montafon. Auch für Gastronomen: einfach anmelden und mitmachen."],
  "/kantineur": ["Kantineur — Kantinen-Kasse für Vereinsheime | FS Creative", "Kantineur: die digitale Strichliste für Vereinsheime, Feuerwehrhäuser und Firmenküchen in Österreich. SB-Kasse am Tablet, Abrechnung am Handy. 14 Tage frei testen."],
  "/referenzen": ["Referenzen — Websites & Plattformen | FS Creative", "Referenzen von FS Creative: Websites und Plattformen aus dem Montafon — Blitzdings, VALUERO, kochdu, La Taverna, Ortsfeuerwehr Gaschurn, Spenglerei Flöry u. v. m."],
  "/ueber-uns": ["Über uns — FS Creative aus dem Montafon", "Lerne FS Creative kennen: Kreativ- und Digitalagentur aus Gaschurn im Montafon, gegründet von Simon Felder."],
  "/kontakt": ["Kontakt — FS Creative", "Kontaktiere FS Creative aus Gaschurn im Montafon für dein nächstes digitales Projekt."],
  "/datenschutz": ["Datenschutzerklärung — FS Creative", "Datenschutzerklärung von FS Creative: keine Cookies, kein Tracking, keine Google Fonts. Google Maps wird nur nach ausdrücklicher Einwilligung geladen."],
  "/impressum": ["Impressum — FS Creative", "Impressum von FS Creative (Simon Leonhard Felder), Dorfstraße 3/1, 6793 Gaschurn. Offenlegung gemäß § 5 ECG und § 25 Mediengesetz."],
};

const NOINDEX_ROUTES = { "/empfehlungen": true, "/paketshop": true };

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
function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (e, data) => {
    if (e) return send(res, 500, "Server error");
    send(res, 200, data, TYPES[ext] || "application/octet-stream");
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
let ADMIN_HTML = "";
try { ADMIN_HTML = fs.readFileSync(path.join(ROOT, "admin-dashboard.html"), "utf8"); } catch (e) { ADMIN_HTML = "<!doctype html><p>admin-dashboard.html fehlt.</p>"; }

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
  if (MAIL_SNAP.data && Date.now() - MAIL_SNAP.at < 20000) return MAIL_SNAP.data;
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
      const r = await dav("REPORT", c.calUrl, { user: c.user, pass: c.pass, depth: 1, body });
      if (r.status === 401 || r.status === 403) return { configured: true, calName: c.calName, error: "login_failed", events: (PRIV_CACHE.data && PRIV_CACHE.data.events) || [] };
      if (r.status >= 400) return { configured: true, calName: c.calName, error: "http_" + r.status, events: (PRIV_CACHE.data && PRIV_CACHE.data.events) || [] };
      const events = [];
      for (const blk of xmlResponses(r.text)) {
        const href = ((blk.match(/<(?:[\w-]+:)?href[^>]*>([^<]+)</i) || [])[1] || "").trim();
        const etag = xmlUnesc(xmlTag(blk, "getetag")).trim();
        const data = xmlUnesc(xmlTag(blk, "calendar-data"));
        if (!data) continue;
        icsToEvents(data, absUrl(c.calUrl, href), etag, fromMs, toMs).forEach(e => events.push(e));
      }
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
function replaceConst(html, name, obj) {
  const re = new RegExp("var " + name + "=\\{[\\s\\S]*?\\};");
  const js = JSON.stringify(obj).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return html.replace(re, () => "var " + name + "=" + js + ";");
}
function injectAdmin(html, stampISO) {
  const script = '<script>(function(){' +
    'window.__FSD_HOSTED=true; window.__FSD_MAIL_ACTION="/admin/api/mail-action"; window.__FSD_MAIL_SEND="/admin/api/mail-send"; window.__FSD_BLITZ_PAY="/admin/api/blitz-pay"; window.__FSD_KOCHDU_SETTLE="/admin/api/kochdu-settle"; window.__FSD_MAIL_ATTACH="/admin/api/mail-attachment"; window.__FSD_TODOS="/admin/api/todos"; window.__FSD_EVENTS="/admin/api/events"; window.__FSD_SITES="/admin/api/sites"; window.__FSD_LOGOUT="/admin/logout";' +
    'if(!window.__fsdYear)window.__fsdYear=new Date().getFullYear();' +
    'function poll(){fetch("/admin/api/all?year="+(window.__fsdYear||new Date().getFullYear()),{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(d){if(!d)return; if(window.__fsdApplyLive)window.__fsdApplyLive(d);}).catch(function(){});}' +
    'window.__fsdPoll=poll;' +
    'window.__FSD_BUILD=' + JSON.stringify(BUILD) + ';' +
    'function vchk(){fetch("/admin/api/version",{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(d){if(d&&d.build&&window.__FSD_BUILD&&d.build!==window.__FSD_BUILD){location.replace("/admin?v="+encodeURIComponent(d.build));}}).catch(function(){});}' +
    'window.__fsdVchk=vchk;setInterval(vchk,30000);setTimeout(vchk,2000);' +
    'setInterval(poll,30000);setTimeout(poll,600);' +
    '})();</script>';
  return html.replace("</body>", script + "</body>");
}
async function renderAdminDashboard() {
  let html = ADMIN_HTML; let stamp = null;
  const year = new Date().getFullYear();
  const [k, m, b, ko, va] = await Promise.all([kantineurStats(year), mailSnapshot(), blitzdingsStats(year), kochduStats(year), valueroStats(year)]);
  if (k) { html = replaceConst(html, "KANTINEUR_STATS", k); stamp = k.fetchedAt; }
  if (b) { html = replaceConst(html, "BLITZDINGS_STATS", b); stamp = b.fetchedAt || stamp; }
  if (ko) { html = replaceConst(html, "KOCHDU_STATS", ko); stamp = ko.fetchedAt || stamp; }
  if (va) { html = replaceConst(html, "VALUERO_STATS", va); stamp = va.fetchedAt || stamp; }
  if (m) { html = replaceConst(html, "MAIL_SNAPSHOT", m); stamp = m.fetchedAt || stamp; }
  ADMIN_SEEN = Date.now();
  html = html.replace("</head>", () => '<script>window.__FSD_TODOS_DATA=' + JSON.stringify(readTodos()).replace(/</g, "\\u003c") + ';window.__FSD_EVENTS_DATA=' + JSON.stringify(readEvents()).replace(/</g, "\\u003c") + ';</script></head>');
  if (SITES_CACHE.data) html = html.replace("</head>", () => '<script>window.__FSD_SITES_DATA=' + JSON.stringify(SITES_CACHE.data).replace(/</g, "\\u003c") + ';</script></head>');
  else refreshSites();
  return injectAdmin(html, stamp);
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

  if (p === "/admin" || p === "/admin/") {
    const html = await renderAdminDashboard();
    return sendGz(req, res, 200, html, TYPES[".html"], { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  }
  if (p === "/admin/api/all") {
    const yr = (u.searchParams.get("year") || "").replace(/[^0-9]/g, "") || String(new Date().getFullYear());
    const [k, m, b, cal, ko, va, pc] = await Promise.all([kantineurStats(yr), mailSnapshot(), blitzdingsStats(yr), calendarEvents(), kochduStats(yr), valueroStats(yr), privateCalQuick().catch(() => null)]);
    return sendGz(req, res, 200, JSON.stringify({ kantineur: k, mail: m, blitzdings: b, calendar: cal, kochdu: ko, valuero: va, todos: readTodos(), manualEvents: readEvents(), privateCal: pc }), TYPES[".json"], { "Cache-Control": "no-store" });
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
        return send(res, r.status, txt, TYPES[".json"]);
      } catch (e) { return send(res, 502, JSON.stringify({ error: "mail_action_failed" }), TYPES[".json"]); }
    });
    return;
  }
  return send(res, 404, "Not found");
}

const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, "http://x");
    const p = u.pathname;

    // Admin-Bereich zuerst und isoliert — Rest der Website bleibt unberührt.
    if (p === "/admin" || p.indexOf("/admin/") === 0) {
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
      try { if (fs.statSync(q).isFile()) { found = q; break; } } catch (e) {}
    }
    if (found) return serveFile(res, found);

    fs.readFile(path.join(ROOT, "index.html"), "utf8", (e, data) => {
      if (e) return send(res, 404, "Not found");
      const out = renderIndex(data, urlPath);
      send(res, out.status, out.html, TYPES[".html"]);
    });
  } catch (e) {
    send(res, 500, "Server error");
  }
});

if (require.main === module) {
  server.listen(PORT, () => { console.log("FS Creative running on port " + PORT); });
  // Sauber beenden, wenn Railway beim Deploy den alten Container stoppt (sonst „Deployment crashed“-Mail)
  function shutdown() { try { server.close(); } catch (e) {} setTimeout(() => process.exit(0), 500).unref(); }
  process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
}

module.exports = { renderIndex, ROUTE_META, NOINDEX_ROUTES };
