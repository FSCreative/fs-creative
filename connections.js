"use strict";
// Verbindungen (Cockpit-Seite „Verbindungen“, admin-cockpit/zconn.js): zentrale Liste aller Schnittstellen mit echter, sparsamer Prüfung.
// Eine Verbindung meldet sich mit add({ key, label, sub, category, icon, usedBy, ttl, minForce, timeout, missing(), check(), fix }) an:
//  – missing(): ohne Netz, sofort – null = eingerichtet, sonst { detail, fix } (→ Zustand „off“)
//  – check(): echte Prüfung → { state: "ok"|"warn"|"error"|"off", detail, fix?, quiet?, meta? } (meta bleibt am Server)
// Ergebnisse liegen im Speicher und in DATA_DIR/connections.json (schneller Start nach einem Deploy). Der Hintergrund prüft gestaffelt
// (höchstens 3 gleichzeitig, je nach ttl; ohne Cockpit-Nutzung viermal seltener), „Jetzt prüfen“ höchstens alle minForce (Standard 30 s) je Verbindung.
// Texte enthalten nie Zugangsdaten: Werte geheimer Umgebungsvariablen, Token-Parameter und Bearer-Angaben werden vor dem Speichern entfernt.
const fs = require("fs"), path = require("path");

const STATES = { ok: 1, warn: 1, error: 1, off: 1 };
const RANK = { error: 0, warn: 1, ok: 2, off: 3 };

module.exports = function (D) {
  D = D || {};
  const defs = [], byKey = {};
  const FILE = D.DATA_DIR ? path.join(D.DATA_DIR, "connections.json") : "";
  const CATS = Array.isArray(D.categories) ? D.categories : [];
  let RES = {}, saveT = null, TIMER = null, lastAll = 0, lastKick = 0;
  const RUN = new Map(), FORCED = {};
  const nowIso = () => new Date().toISOString();
  const ageOf = r => (r && r.checkedAt ? Date.now() - Date.parse(r.checkedAt) : Infinity);

  try { const j = FILE ? JSON.parse(fs.readFileSync(FILE, "utf8")) : null; if (j && typeof j === "object") RES = j.results && typeof j.results === "object" ? j.results : {}; } catch (e) { RES = {}; }
  function persist() {   // gebündelt: höchstens alle 1,5 s schreiben (nicht bei jeder Prüfung neu verschieben)
    if (!FILE || saveT) return;
    saveT = setTimeout(() => {
      saveT = null; const out = {}; Object.keys(RES).forEach(k => { const r = Object.assign({}, RES[k]); delete r.meta; out[k] = r; });
      try { const tmp = FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify({ at: nowIso(), results: out })); fs.renameSync(tmp, FILE); } catch (e) {}
    }, 1500);
    if (saveT.unref) saveT.unref();
  }

  // ── Geheimnisse nie ausgeben ──
  const SECRET_ENV = /(TOKEN|SECRET|PASS|PASSWORD|PRIVATE|_KEY$|APIKEY|API_KEY|_PIN$|DATABASE_URL|CLIENT_SECRET)/i;
  function secrets() {
    const out = [];
    Object.keys(process.env).forEach(k => { if (!SECRET_ENV.test(k)) return; const v = String(process.env[k] || "").trim(); if (v.length >= 6) out.push(v); });
    if (D.secrets) { try { (D.secrets() || []).forEach(v => { v = String(v || "").trim(); if (v.length >= 6) out.push(v); }); } catch (e) {} }
    return out.sort((a, b) => b.length - a.length);
  }
  function clean(s, max) {
    let t = String(s == null ? "" : s).replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
    t = t.replace(/([?&;](?:token|key|apikey|api_key|access_token|refresh_token|client_secret|secret|password|pass|pin)=)[^&\s"'<>]+/gi, "$1…")
      .replace(/\b(Bearer|Basic|PrintApiKey)\s+[A-Za-z0-9._~+\/=:-]{6,}/gi, "$1 …")
      .replace(/\b(sk|rk|pk|test|live|org|access)_[A-Za-z0-9]{12,}\b/g, "…");
    for (const v of secrets()) if (t.indexOf(v) > -1) t = t.split(v).join("…");
    return t.slice(0, max || 300);
  }
  function cleanFix(f) {
    if (!f || typeof f !== "object") return null;
    const kind = ["action", "railway", "link", "none"].indexOf(f.kind) > -1 ? f.kind : "none", o = { kind, label: clean(f.label || "", 80) };
    if (f.act) o.act = String(f.act).slice(0, 120);
    if (f.go) o.go = String(f.go).replace(/[^a-z0-9-]/gi, "").slice(0, 30);
    if (f.url && /^(\/|https:\/\/)/.test(String(f.url))) o.url = String(f.url).slice(0, 300);
    if (Array.isArray(f.vars)) o.vars = f.vars.map(v => String(v).replace(/[^A-Z0-9_]/g, "").slice(0, 60)).filter(Boolean).slice(0, 8);
    if (f.hint) o.hint = clean(f.hint, 240);
    return o;
  }

  function add(def) {
    if (!def || !def.key || byKey[def.key]) throw new Error("Verbindung doppelt oder ohne Schlüssel: " + (def && def.key));
    const d = Object.assign({ ttl: 5 * 60e3, minForce: 30e3, timeout: 20e3, usedBy: [], category: "Sonstiges", icon: "plug", sub: "" }, def);
    defs.push(d); byKey[d.key] = d; return d;
  }
  function missingOf(d) {
    try { const m = d.missing ? d.missing() : null; return m ? (typeof m === "string" ? { detail: m } : m) : null; }
    catch (e) { return { detail: "Einstellungen nicht lesbar: " + (e && e.message || e) }; }
  }
  function withTimeout(p, ms) {
    let t; return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(Object.assign(new Error("timeout"), { timeout: true })), ms); if (t.unref) t.unref(); })]).finally(() => clearTimeout(t));
  }

  // ── eine Prüfung ausführen (gleichzeitige Anfragen teilen sich das Ergebnis) ──
  function run(d, ctx) {
    if (RUN.has(d.key)) return RUN.get(d.key);
    const p = (async () => {
      const t0 = Date.now(), miss = missingOf(d); let out;
      if (miss) out = { state: "off", detail: miss.detail || "Nicht eingerichtet", fix: miss.fix || null };
      else {
        try { out = await withTimeout(Promise.resolve().then(() => d.check(ctx || {})), d.timeout); }
        catch (e) { out = { state: "error", detail: e && e.timeout ? "Keine Antwort – Prüfung nach " + Math.round(d.timeout / 1000) + " s abgebrochen" : "Prüfung fehlgeschlagen: " + (e && e.message || e) }; }
      }
      if (!out || typeof out !== "object" || !STATES[out.state]) out = { state: "error", detail: "Prüfung lieferte kein Ergebnis" };
      const prev = RES[d.key] || {}, now = nowIso(), up = out.state === "ok" || out.state === "warn";
      const r = { state: out.state, detail: clean(out.detail || ""), fix: cleanFix(out.fix) || null, quiet: !!out.quiet, checkedAt: now, ms: Date.now() - t0, byMissing: !!miss,
        lastOkAt: up ? now : (prev.lastOkAt || null), since: prev.state === out.state && prev.since ? prev.since : now, meta: out.meta };
      RES[d.key] = r; persist();
      if (D.onChange && prev.state && prev.state !== r.state) { try { D.onChange(pub(d), prev.state); } catch (e) {} }
      return r;
    })().finally(() => RUN.delete(d.key));
    RUN.set(d.key, p); return p;
  }

  // ── öffentliche Sicht (ohne meta) ──
  function pub(d) {
    const miss = missingOf(d), r = RES[d.key] || null;
    const o = { key: d.key, label: d.label, sub: d.sub || "", category: d.category, icon: d.icon, usedBy: (d.usedBy || []).slice(0, 12) };
    if (miss) return Object.assign(o, { state: "off", detail: clean(miss.detail || "Nicht eingerichtet"), fix: cleanFix(miss.fix || d.fixOff || d.fix), checkedAt: r && r.checkedAt || null, lastOkAt: r && r.lastOkAt || null, since: null, quiet: true });
    if (!r || r.byMissing) return Object.assign(o, { state: "warn", pending: true, detail: "Wird geprüft …", fix: null, checkedAt: null, lastOkAt: null, since: null, quiet: true });
    const fix = r.fix || (r.state === "ok" ? null : cleanFix(typeof d.fix === "function" ? d.fix(r) : d.fix));
    return Object.assign(o, { state: r.state, detail: r.detail, fix, checkedAt: r.checkedAt, lastOkAt: r.lastOkAt || null, since: r.since || null, quiet: !!r.quiet || r.state === "ok" || r.state === "off",
      stale: ageOf(r) > Math.max(3 * d.ttl, 30 * 60e3), ms: r.ms || 0 });
  }
  function catIndex(c) { const i = CATS.indexOf(c); return i < 0 ? 99 : i; }
  function list() { return defs.map(pub).sort((a, b) => catIndex(a.category) - catIndex(b.category)); }
  function summary() {
    const items = list(), s = { ok: 0, warn: 0, error: 0, off: 0, pending: 0, total: items.length, checkedAt: null, problems: [] };
    items.forEach(i => { if (i.pending) s.pending++; else s[i.state]++; if (i.checkedAt && (!s.checkedAt || i.checkedAt > s.checkedAt)) s.checkedAt = i.checkedAt; });
    s.problems = items.filter(i => !i.pending && (i.state === "error" || (i.state === "warn" && !i.quiet)))
      .sort((a, b) => RANK[a.state] - RANK[b.state] || catIndex(a.category) - catIndex(b.category))
      .slice(0, 10).map(i => ({ key: i.key, label: i.label, state: i.state, detail: i.detail, icon: i.icon, fix: i.fix, since: i.since }));
    return s;
  }
  function get(key) { return RES[key] || null; }

  // ── Prüfen: normal (ttl), maxAge (höchstens so alt) oder force (sofort, aber höchstens alle minForce je Verbindung) ──
  async function check(key, o) {
    o = o || {}; const d = byKey[key]; if (!d) throw Object.assign(new Error("Unbekannte Verbindung"), { status: 404 });
    const r = RES[key];
    if (o.force) {
      const last = FORCED[key] || 0, wait = d.minForce - (Date.now() - last);
      if (wait > 0 && r) return { item: pub(d), limited: true, retryIn: Math.ceil(wait / 1000) };
      FORCED[key] = Date.now(); await run(d, { force: true }); return { item: pub(d) };
    }
    const max = o.maxAge != null ? o.maxAge : d.ttl;
    if (r && ageOf(r) < max && !(r.byMissing && !missingOf(d))) return { item: pub(d), cached: true };
    await run(d); return { item: pub(d) };
  }
  async function checkAll(o) {
    o = o || {};
    if (o.force && Date.now() - lastAll < 30e3) return { items: list(), limited: true, retryIn: Math.ceil((30e3 - (Date.now() - lastAll)) / 1000) };
    if (o.force) lastAll = Date.now();
    const queue = defs.slice(), workers = [];
    for (let i = 0; i < 4; i++) workers.push((async () => { for (;;) { const d = queue.shift(); if (!d) return; try { await check(d.key, { force: !!o.force }); } catch (e) {} } })());
    await Promise.all(workers);
    return { items: list() };
  }

  // ── Hintergrund: fällige Prüfungen gestaffelt nachholen ──
  function due() {
    const idle = D.adminSeen ? Date.now() - D.adminSeen() > 2 * 3600e3 : false;
    // nicht eingerichtete brauchen keine Prüfung (Zustand „off“ ergibt sich aus missing()) – die Plätze gehören den echten Prüfungen
    return defs.filter(d => !RUN.has(d.key) && !missingOf(d)).map(d => { const r = RES[d.key], fresh = !r || r.byMissing;   // neu bzw. eben eingerichtet → gleich prüfen
      return { d, over: fresh ? Infinity : ageOf(r) - d.ttl * (idle ? 4 : 1) }; }).filter(x => x.over >= 0).sort((a, b) => b.over - a.over);
  }
  function tick(gap) {
    const free = Math.max(0, 3 - RUN.size); if (!free) return;
    due().slice(0, free).forEach((x, i) => { const t = setTimeout(() => { run(x.d).catch(() => {}); }, i * (gap || 4000)); if (t.unref) t.unref(); });
  }
  // Seite „Verbindungen“ offen: fällige (v. a. noch nie geprüfte) Verbindungen gleich nachholen – höchstens 3 gleichzeitig, frühestens alle 4 s
  function kick() { if (Date.now() - lastKick < 4e3) return; lastKick = Date.now(); tick(600); }
  function start(delay) {
    if (TIMER) return;
    const t = setTimeout(() => { tick(); TIMER = setInterval(() => tick(), D.interval || 20e3); if (TIMER.unref) TIMER.unref(); }, delay == null ? 30e3 : delay);
    if (t.unref) t.unref();
  }

  // ── HTTP (nur hinter der Cockpit-Anmeldung aufrufen) ──
  async function handle(req, res, u, p) {
    const J = (code, o) => D.send(res, code, JSON.stringify(o), "application/json; charset=utf-8", { "Cache-Control": "no-store" });
    try {
      if (p === "/admin/api/connections" && req.method === "GET") { kick(); return J(200, { ok: true, items: list(), summary: summary(), categories: CATS }); }
      if (p === "/admin/api/connections/check" && req.method === "POST") {
        let raw = ""; for await (const c of req) { raw += c; if (raw.length > 4000) return J(413, { ok: false, error: "Anfrage zu groß" }); }
        let b = {}; try { b = JSON.parse(raw || "{}"); } catch (e) { return J(400, { ok: false, error: "Ungültige Anfrage" }); }
        if (b.all === true) { const r = await checkAll({ force: true }); return J(200, Object.assign({ ok: true, items: r.items, summary: summary() }, r.limited ? { limited: true, retryIn: r.retryIn } : {})); }
        const key = String(b.key || ""); if (!byKey[key]) return J(404, { ok: false, error: "Unbekannte Verbindung" });
        const r = await check(key, { force: true });
        return J(200, Object.assign({ ok: true, item: r.item, summary: summary() }, r.limited ? { limited: true, retryIn: r.retryIn } : {}));
      }
      return J(404, { ok: false, error: "Nicht gefunden" });
    } catch (e) { return J(e.status || 500, { ok: false, error: clean(e.message || e, 200) }); }
  }

  return { add, list, summary, get, check, checkAll, start, kick, handle, clean, _test: { RES: () => RES, FORCED, tick, due } };
};
