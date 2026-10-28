"use strict";
/* IndexNow (Bing, Yandex, Seznam, Naver …): neue, geänderte und entfernte Seiten aus der Sitemap direkt an die Suchmaschinen melden.
   Bing speist damit auch die ChatGPT-Suche, Copilot und DuckDuckGo – Shop-Seiten sind dort schneller und aktueller auffindbar.
   – Schlüssel: laut Spezifikation öffentlich (32 Hex-Zeichen), Schlüsseldatei unter https://www.fs-creative.at/<KEY>.txt (Inhalt = Schlüssel)
   – nur in Produktion: Railway-Umgebung „production“ (oder INDEXNOW=1) und www.fs-creative.at; nie in Tests (NODE_ENV=test) oder mit INDEXNOW=0
   – im Hintergrund: erster Lauf einige Minuten nach dem Start (INDEXNOW_DELAY_MS, Standard 10 min), dann alle 6 h geprüft, höchstens eine Meldung je Tag (Wiener Datum)
   – gemeldet werden nur neue oder geänderte Adressen (Signatur je URL: lastmod der Sitemap bzw. Inhalts-Prüfsumme aus dem Druckshop) und entfernte;
     beim allerersten Lauf die ganze Sitemap. POST an api.indexnow.org (höchstens 10 000 Adressen je Anfrage).
   – Stand (Prüfsumme je URL, letzter Tag) in DATA_DIR/indexnow.json (Railway-Volume); Fehler nur ins Log, nie im Request-Pfad. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const KEY = "10105cd448454fc0c5c5f905530365d3";
const MAX_URLS = 10000;

module.exports = function (D) {
  D = D || {};
  const origin = String(D.origin || "https://www.fs-creative.at").replace(/\/+$/, ""), host = new URL(origin).host;
  const KEY_PATH = "/" + KEY + ".txt", keyLocation = origin + KEY_PATH;
  const FILE = path.join(D.DATA_DIR || __dirname, "indexnow.json");
  const log = (...a) => console.log("IndexNow:", ...a);
  const api = () => String(process.env.INDEXNOW_API || "https://api.indexnow.org/indexnow");
  const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date());
  const hash = s => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 12);

  function production() {
    if (process.env.INDEXNOW === "0" || process.env.NODE_ENV === "test" || host !== "www.fs-creative.at") return false;
    if (process.env.INDEXNOW === "1") return true;
    return String(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || "").toLowerCase() === "production";
  }
  const load = () => { try { const j = JSON.parse(fs.readFileSync(FILE, "utf8")); return j && typeof j === "object" ? j : {}; } catch (e) { return {}; } };
  const save = st => { try { const t = FILE + ".tmp" + process.pid; fs.writeFileSync(t, JSON.stringify(st)); fs.renameSync(t, FILE); } catch (e) { log("Stand speichern:", e.message); } };

  // Schlüsseldatei (öffentlich): /<KEY>.txt
  function handle(req, res, p, send) {
    if (p !== KEY_PATH || (req.method !== "GET" && req.method !== "HEAD")) return false;
    send(res, 200, KEY, "text/plain; charset=utf-8", { "Cache-Control": "public, max-age=86400", "X-Robots-Tag": "noindex" });
    return true;
  }

  async function post(urls) {
    const r = await fetch(api(), { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ host, key: KEY, keyLocation, urlList: urls }), signal: AbortSignal.timeout(30000) });
    const t = await r.text().catch(() => "");
    if (r.status !== 200 && r.status !== 202) throw Object.assign(new Error("HTTP " + r.status + (t ? " " + t.replace(/\s+/g, " ").slice(0, 200) : "")), { status: r.status });
    return r.status;
  }

  // Ein Lauf: Sitemap-Einträge holen, mit dem gemerkten Stand vergleichen, Unterschiede melden. opts.force: auch außerhalb der Produktion / mehrmals am Tag (Tests)
  let running = false;
  async function run(opts) {
    opts = opts || {};
    if (running) return { skipped: "busy" };
    if (!opts.force && !production()) return { skipped: "not_production" };
    const st = load(), day = today();
    if (!opts.force && st.day === day) return { skipped: "today" };
    running = true;
    try {
      // Fehler beim Zusammenstellen (z. B. Druckshop-Katalog noch nicht geladen): nichts melden, beim nächsten Lauf neu versuchen
      const list = await D.entries(), cur = {};
      (list || []).forEach(e => { let u; try { u = new URL(String(e && e.loc || "")); } catch (er) { return; } if (u.protocol === "https:" && u.host === host) cur[String(e.loc)] = hash(e.sig == null ? "" : e.sig); });
      const keys = Object.keys(cur); if (!keys.length) throw new Error("Sitemap ohne Adressen");
      const prev = st.sigs && typeof st.sigs === "object" ? st.sigs : null, nPrev = prev ? Object.keys(prev).length : 0;
      const changed = prev ? keys.filter(u => prev[u] !== cur[u]) : keys;
      // Entfernte Adressen melden – außer die Sitemap ist plötzlich viel kleiner (Shop offline, Katalog-Störung): dann nichts als entfernt melden
      let gone = prev ? Object.keys(prev).filter(u => !(u in cur)) : [];
      if (gone.length && keys.length < nPrev / 2) { log("Sitemap viel kleiner als zuletzt (" + keys.length + " statt " + nPrev + ") – entfernte Adressen werden nicht gemeldet"); gone = []; }
      const urls = changed.concat(gone), next = Object.assign({}, prev || {});
      let sent = 0, error = "";
      for (let i = 0; i < urls.length; i += MAX_URLS) {
        const batch = urls.slice(i, i + MAX_URLS);
        try { await post(batch); } catch (e) { error = e.message; log("Meldung fehlgeschlagen:", e.message); break; }
        batch.forEach(u => { if (u in cur) next[u] = cur[u]; else delete next[u]; }); sent += batch.length;
      }
      // Tag wird auch bei Fehlern gemerkt (höchstens ein Versuch je Tag); nicht gemeldete Adressen behalten ihren alten Stand und kommen morgen wieder dran
      save({ v: 1, day, sigs: next, last: { at: new Date().toISOString(), total: keys.length, changed: changed.length, gone: gone.length, sent, error } });
      if (sent) log(sent + " Adressen gemeldet (" + (prev ? "neu/geändert " + changed.length + ", entfernt " + gone.length : "erste Meldung, ganze Sitemap") + ")");
      return { sent, changed: changed.length, gone: gone.length, total: keys.length, error };
    } finally { running = false; }
  }

  function start() {
    if (!production()) return false;
    const dv = parseInt(process.env.INDEXNOW_DELAY_MS, 10), delay = isFinite(dv) && dv >= 0 ? dv : 10 * 60e3;
    const go = () => run().catch(e => log(e.message));
    setTimeout(go, delay).unref(); setInterval(go, 6 * 3600e3).unref();
    return true;
  }

  return { KEY, KEY_PATH, keyLocation, handle, run, start, production, _test: { FILE, hash } };
};
module.exports.KEY = KEY;
