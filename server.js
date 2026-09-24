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

async function getJSON(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
  try { const r = await fetch(url, { signal: ctrl.signal }); if (!r.ok) return null; return await r.json(); }
  catch (e) { return null; } finally { clearTimeout(t); }
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
async function mailSnapshot() {
  if (!MAIL.url || !MAIL.token) return null;
  const d = await getJSON(MAIL.url + "?token=" + encodeURIComponent(MAIL.token));
  if (!d || d.error) return null;
  return d;
}
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
    return send(res, 200, html, TYPES[".html"], { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  }
  if (p === "/admin/api/all") {
    const yr = (u.searchParams.get("year") || "").replace(/[^0-9]/g, "") || String(new Date().getFullYear());
    const [k, m, b, cal, ko, va] = await Promise.all([kantineurStats(yr), mailSnapshot(), blitzdingsStats(yr), calendarEvents(), kochduStats(yr), valueroStats(yr)]);
    return send(res, 200, JSON.stringify({ kantineur: k, mail: m, blitzdings: b, calendar: cal, kochdu: ko, valuero: va, todos: readTodos(), manualEvents: readEvents() }), TYPES[".json"], { "Cache-Control": "no-store" });
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
  if (p === "/admin/api/version") {
    return send(res, 200, JSON.stringify({ build: BUILD }), TYPES[".json"], { "Cache-Control": "no-store" });
  }
  if (p === "/admin/api/sites") {
    try { const s = await sitesSnapshot(u.searchParams.get("force") === "1"); return send(res, 200, JSON.stringify(s), TYPES[".json"], { "Cache-Control": "no-store" }); }
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
  if (p === "/admin/api/mail-attachment" && req.method === "GET") {
    if (!MAIL.url || !MAIL.token) return send(res, 503, "mail_not_configured");
    const attUrl = MAIL.url.replace(/\/api\/mails.*$/, "/api/attachment") +
      "?token=" + encodeURIComponent(MAIL.token) +
      "&folder=" + encodeURIComponent(u.searchParams.get("folder") || "INBOX") +
      "&uid=" + encodeURIComponent(u.searchParams.get("uid") || "") +
      "&index=" + encodeURIComponent(u.searchParams.get("index") || "0");
    try {
      const r = await fetch(attUrl);
      if (!r.ok) return send(res, r.status, "attachment_error");
      const buf = Buffer.from(await r.arrayBuffer());
      res.writeHead(200, {
        "Content-Type": r.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": r.headers.get("content-disposition") || "attachment",
        "Content-Length": buf.length,
        "Cache-Control": "no-store",
      });
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
}

module.exports = { renderIndex, ROUTE_META, NOINDEX_ROUTES };
