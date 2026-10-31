"use strict";
/* Bild-Proxy für den Druckshop: Produktbilder aus dem CMS von Print.com (images.ctfassets.net) werden über unseren
   Server ausgeliefert – Besucher bauen keine Verbindung zu Contentful auf (keine IP-Übermittlung an Dritte).
   /print/bild/<space>/<asset>/<hash>/<datei>?fm=webp&w=800  →  https://images.ctfassets.net/<…>?fm=webp&w=800
   Kein offener Proxy: fester Host, nur Contentful-Bildpfade, nur Bild-Content-Types, Größenlimit, wenige erlaubte
   Parameter (Breiten auf feste Stufen gerundet), keine Weiterleitungen, keine Besucher-Header an Contentful.
   Zwischenspeicher im Arbeitsspeicher (max. 64 MB) + lange Browser-Cache-Zeit (Contentful-Pfade enthalten einen Hash). */
const { clientIp, hitCounter } = require("./client-ip.js");

const UPSTREAM = "https://images.ctfassets.net/";
const PREFIX = "/print/bild/";
const MAX_BYTES = 8 * 1024 * 1024;          // pro Bild
const CACHE_BYTES = 64 * 1024 * 1024;       // Arbeitsspeicher gesamt
const CACHE_MS = 24 * 3600 * 1000;
const TIMEOUT_MS = 15000;
const PATH_RX = /^[a-z0-9]{4,32}\/[A-Za-z0-9_-]{1,64}\/[a-f0-9]{32}\/[\w\-.%]{1,200}$/;
const TYPE_RX = /^image\/(jpeg|png|webp|avif|gif|svg\+xml)$/;
const WIDTHS = [80, 120, 160, 200, 300, 400, 600, 800, 900, 1000, 1200, 1600, 1800, 2000];
const FORMATS = { webp: 1, jpg: 1, png: 1, avif: 1 };
const FITS = { pad: 1, fill: 1, scale: 1, crop: 1, thumb: 1 };

const cache = new Map();        // Schlüssel → { buf, type, at }
const pending = new Map();      // laufende Abrufe zusammenfassen
let cacheBytes = 0;
const hits = hitCounter(20000, 15 * 60 * 1000);

const snap = v => { const n = parseInt(v, 10); if (!(n > 0)) return 0; for (const w of WIDTHS) if (w >= n) return w; return WIDTHS[WIDTHS.length - 1]; };

// ctfassets-URL → Proxy-URL (für serverseitig erzeugtes HTML); andere Werte bleiben unverändert
function proxify(u) { const s = String(u || ""); return s.indexOf(UPSTREAM) === 0 ? PREFIX + s.slice(UPSTREAM.length) : s; }

// Proxy-Pfad + Query prüfen → Upstream-URL (oder null)
function upstreamUrl(p, search) {
  if (String(p).indexOf(PREFIX) !== 0) return null;
  const rest = String(p).slice(PREFIX.length);
  if (!PATH_RX.test(rest) || /(^|\/)\.{1,2}(\/|$)/.test(rest) || /%(2f|5c|00)/i.test(rest)) return null;   // keine (codierten) Pfad-Tricks
  const q = new URLSearchParams(search || ""), out = [];
  const fm = q.get("fm"); if (fm && FORMATS[fm]) out.push("fm=" + fm);
  const w = snap(q.get("w")); if (w) out.push("w=" + w);
  const h = snap(q.get("h")); if (h) out.push("h=" + h);
  const qq = parseInt(q.get("q"), 10); if (qq >= 1 && qq <= 100) out.push("q=" + qq);
  const fit = q.get("fit"); if (fit && FITS[fit]) out.push("fit=" + fit);
  return UPSTREAM + rest + (out.length ? "?" + out.join("&") : "");
}

function remember(key, entry) {
  if (entry.buf.length > CACHE_BYTES / 8) return;
  if (cache.has(key)) { cacheBytes -= cache.get(key).buf.length; cache.delete(key); }
  cache.set(key, entry); cacheBytes += entry.buf.length;
  for (const [k, v] of cache) { if (cacheBytes <= CACHE_BYTES) break; cache.delete(k); cacheBytes -= v.buf.length; }
}

async function fetchImage(url) {
  const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "image/avif,image/webp,image/*;q=0.8", "User-Agent": "FS-Creative-Druckshop-Bildproxy" } });
  if (!r.ok) { const e = new Error("upstream " + r.status); e.status = r.status === 404 ? 404 : 502; throw e; }
  const type = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!TYPE_RX.test(type)) { const e = new Error("kein Bild"); e.status = 502; throw e; }
  const len = parseInt(r.headers.get("content-length"), 10);
  if (len > MAX_BYTES) { const e = new Error("zu groß"); e.status = 502; throw e; }
  const chunks = []; let size = 0;
  for await (const c of r.body) { size += c.length; if (size > MAX_BYTES) { const e = new Error("zu groß"); e.status = 502; throw e; } chunks.push(Buffer.from(c)); }
  return { buf: Buffer.concat(chunks), type, at: Date.now() };
}

function deliver(req, res, send, entry) {
  send(res, 200, req.method === "HEAD" ? "" : entry.buf, entry.type, Object.assign({
    "Content-Length": String(entry.buf.length),
    "Cache-Control": "public, max-age=2592000, immutable",
    "X-Content-Type-Options": "nosniff",
    // öffentliche Produktfotos: auch auf fremden Seiten einbindbar – Newsletter-Bilder lädt das Mailprogramm bzw. Webmail (fremde Domain), „same-site“ würde sie dort blockieren
    "Cross-Origin-Resource-Policy": "cross-origin",
    // SVG o. Ä. nie als aktives Dokument auf unserer Domain ausführen
    "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox"
  }, /svg/.test(entry.type) ? { "X-Robots-Tag": "noindex" } : {}));   // Produktfotos dürfen in Google (Shopping, Bildersuche) erscheinen – „noindex“ nur noch für SVG
}

async function handle(req, res, u, p, send) {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", "text/plain; charset=utf-8", { Allow: "GET, HEAD" });
  const url = upstreamUrl(p, u && u.search);
  if (!url) return send(res, 404, "Not found");
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) { cache.delete(url); cache.set(url, hit); return deliver(req, res, send, hit); }
  // Nur Abrufe bei Contentful begrenzen (nicht Treffer aus dem Zwischenspeicher)
  if (!pending.has(url) && hits.hit(clientIp(req) || "?", 300, 10 * 60 * 1000)) return send(res, 429, "Zu viele Anfragen", "text/plain; charset=utf-8", { "Retry-After": "600" });
  let pr = pending.get(url);
  if (!pr) { pr = fetchImage(url).finally(() => pending.delete(url)); pending.set(url, pr); }
  let entry;
  try { entry = await pr; } catch (e) { return send(res, e.status === 404 ? 404 : 502, e.status === 404 ? "Not found" : "Bild nicht verfügbar", "text/plain; charset=utf-8", { "Cache-Control": "no-store" }); }
  remember(url, entry);
  return deliver(req, res, send, entry);
}

module.exports = { handle, proxify, upstreamUrl, PREFIX, _test: { upstreamUrl, snap, cache } };
