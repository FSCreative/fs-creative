"use strict";
// Online-Druckshop www.fs-creative.at/print – Produktion über die Print.com-API, Zahlung über Mollie oder „Rechnung für Firmen“.
// Grundsatz (Vorgabe Simon): NICHTS wird ohne seine Kontrolle bei Print.com bestellt. Ablauf:
//   Kunde konfiguriert → gestaltet/lädt hoch → bezahlt (Mollie „paid“) oder wählt Rechnung (Firma mit gültiger UID)
//   → Auftrag gespeichert, Rechnungs-ENTWURF in der eigenen Buchhaltung, Vorschlag „Zur Prüfung“ + Push
//   → im Cockpit (Druckaufträge) „Bei Print.com bestellen“ → POST /orders, Rechnung fertigstellen + an Kunden senden
//   → täglich Status/Tracking von Print.com abrufen, Versandmail an den Kunden.
// „Bezahlte Bestellungen automatisch senden“ ist eine Einstellung im Cockpit (Standard AUS).
// Preise: Einkauf live von Print.com (Produkt + Versand) + Aufschlag PRINT_MARKUP_PCT, mindestens PRINT_MIN_MARGIN_EUR Marge –
// immer serverseitig berechnet, Preise vom Browser werden nie übernommen.
// Speicher: mit DATABASE_URL in Postgres (print_order, print_file, Einstellungen/Katalog in fin_meta), sonst Dateien unter DATA_DIR/print-shop.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MM_PT = 72 / 25.4;
// nur Österreich: Print.com liefert direkt aus den NL – bei Lieferung nach DE wäre es kein ig. Erwerb in AT mehr (Dreiecksgeschäft bzw. DE-Registrierung)
const COUNTRIES = { AT: "Österreich" };
const PLZ = { AT: /^\d{4}$/, DE: /^\d{5}$/ };
const MAX_UPLOAD = 50 * 1024 * 1024;
const FIRM_DEFAULT = { name: "FS Creative", owner: "Simon Leonhard Felder", street: "Dorfstraße 3/1", zip: "6793", city: "Gaschurn", uid: "ATU82622967", email: "office@fs-creative.at", phone: "+43 664 1430620" };

// Kuratierte Auswahl: welche Print.com-Produkte, welche Eigenschaften der Kunde sieht, welche Auflagen angeboten werden.
const CURATED = [
  { key: "visitenkarten", title: "Visitenkarten", icon: "💼", desc: "Der erste Eindruck zum Mitnehmen – ein- oder beidseitig.", skus: ["businesscards", "business-cards", "visitekaartjes"], rx: /business ?cards?|visitenkart|visitekaart/i,
    expose: ["size", "material", "printtype", "finish", "corners"], tiers: [100, 250, 500, 1000, 2500], designer: true, safe: 3 },
  { key: "flyer", title: "Flyer", icon: "📄", desc: "Angebote, Events und Infos – von A6 bis A4.", skus: ["flyers", "flyer"], rx: /^flyers?$|^flyer/i,
    expose: ["size", "material", "printtype", "finish"], tiers: [50, 100, 250, 500, 1000, 2500, 5000], designer: true, safe: 3 },
  { key: "plakate", title: "Plakate", icon: "📢", desc: "Große Wirkung für Veranstaltungen und Aktionen.", skus: ["posters", "poster"], rx: /posters?|plakat/i,
    expose: ["size", "material", "printtype", "finish"], tiers: [1, 2, 5, 10, 25, 50, 100], designer: true, safe: 5 },
  { key: "folder", title: "Folder", icon: "🗂️", desc: "Gefalzte Folder für Speisekarten, Preislisten und Prospekte.", skus: ["folders", "folder", "folded-leaflets"], rx: /folders?|falz/i,
    expose: ["size", "material", "printtype", "finish", "folding", "fold"], tiers: [50, 100, 250, 500, 1000, 2500], designer: true, safe: 4 },   // TODO: mit echtem Print.com-Workfile prüfen, ob „size“ das offene Format ist
  { key: "aufkleber", title: "Aufkleber", icon: "🏷️", desc: "Sticker und Etiketten in vielen Formen.", skus: ["stickers", "sticker"], rx: /stickers?|aufkleber/i,
    expose: ["size", "material", "printtype", "finish", "shape", "cutting"], tiers: [50, 100, 250, 500, 1000], designer: true, safe: 3 },
  { key: "rollups", title: "Roll-ups", icon: "🪧", desc: "Mobile Werbesysteme für Messe, Empfang und Events.", skus: ["rollupbanners", "roll-up-banners", "rollups", "roll-up-banner", "rollup-banners"], rx: /roll-?ups?/i,
    expose: ["size", "material", "printtype"], tiers: [1, 2, 3, 5, 10], designer: true, safe: 10 },
];
const URGENCY_DE = { standard: "Standard", quick: "Schnell", urgent: "Express" };
const A_SIZES = { a0: [841, 1189], a1: [594, 841], a2: [420, 594], a3: [297, 420], a4: [210, 297], a5: [148, 210], a6: [105, 148], a7: [74, 105], dl: [99, 210], din_lang: [99, 210] };
// Status im Shop (nicht Print.com): Reihenfolge = Ablauf
const STATUS_DE = { pending_payment: "Wartet auf Zahlung", payment_failed: "Zahlung fehlgeschlagen", paid: "Bezahlt – zur Prüfung", invoice_requested: "Rechnung – Freigabe nötig",
  ordered: "Bei Print.com bestellt", in_production: "In Produktion", shipped: "Versendet", delivered: "Zugestellt", rejected: "Abgelehnt", problem: "Problem bei Print.com" };
const REVIEW = { paid: 1, invoice_requested: 1 };
// Shop-AGB: Version wird bei jeder Bestellung gespeichert (bei Änderung der AGB hochzählen, Datum = Stand)
const AGB_VERSION = "2026-10-15";
// Mitgelieferte Schriften (SIL Open Font License, latin-Teilmenge, aus @fontsource) – Browser und PDF nutzen dieselben Dateien (print/fonts/*.woff)
const FONTS = [
  ["Inter", "inter", 1], ["Open Sans", "open-sans", 1], ["Montserrat", "montserrat", 1], ["Lato", "lato", 1], ["Poppins", "poppins", 1], ["Raleway", "raleway", 1], ["Nunito", "nunito", 1],
  ["Playfair Display", "playfair-display", 1], ["Merriweather", "merriweather", 1], ["Lora", "lora", 1], ["Oswald", "oswald", 0], ["Dancing Script", "dancing-script", 0], ["Bebas Neue", "bebas-neue", -1], ["Pacifico", "pacifico", -1],
].map(f => ({ family: f[0], file: f[1], italic: f[2] === 1, bold: f[2] >= 0 }));

module.exports = function (D) {
  D = D || {};
  const DATA_DIR = D.DATA_DIR || __dirname;
  const r2 = n => Math.round((+n || 0) * 100) / 100;
  const nowIso = () => new Date().toISOString();
  const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date());
  const clip = (v, n) => String(v == null ? "" : v).replace(/[\r\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
  const eur = n => (+n || 0).toFixed(2).replace(".", ",") + " €";
  const escH = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const rnd = n => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = crypto.randomBytes(n); let s = ""; for (let i = 0; i < n; i++) s += A[b[i] % A.length]; return s; };
  const log = (...a) => console.log("Druckshop:", ...a);

  // ── Konfiguration (Umgebungsvariablen werden bei Bedarf gelesen, damit Tests sie setzen können) ──
  const cfg = () => ({
    pcKey: String(process.env.PRINTCOM_API_KEY || "").trim(),
    pcBase: String(process.env.PRINTCOM_BASE || "https://api.print.com").replace(/\/+$/, ""),
    pcPlatform: String(process.env.PRINTCOM_PLATFORM_BASE || "https://platform.print.com").replace(/\/+$/, ""),
    preflight: process.env.PRINTCOM_PREFLIGHT === "1",
    mollieKey: String(process.env.MOLLIE_PRINT_API_KEY || "").trim(),
    mollieBase: String(process.env.PRINT_MOLLIE_BASE || "https://api.mollie.com/v2").replace(/\/+$/, ""),
    markup: isFinite(parseFloat(process.env.PRINT_MARKUP_PCT)) ? parseFloat(process.env.PRINT_MARKUP_PCT) : 35,
    minMargin: isFinite(parseFloat(process.env.PRINT_MIN_MARGIN_EUR)) ? parseFloat(process.env.PRINT_MIN_MARGIN_EUR) : 8,
    publicUrl: String(process.env.PRINT_PUBLIC_URL || D.ORIGIN || "https://www.fs-creative.at").replace(/\/+$/, ""),
    taxRuleIgl: String(process.env.PRINT_TAXRULE_IGL || "3"),
  });
  const SECRET = (() => {
    const s = String(process.env.PRINT_SECRET || "").trim();
    return s || crypto.createHmac("sha256", String(process.env.ADMIN_AUTH_SECRET || "bitte-ADMIN_AUTH_SECRET-setzen")).update("print-shop-v1").digest("hex");
  })();
  const sig = (kind, id) => crypto.createHmac("sha256", SECRET).update(kind + ":" + id).digest("hex").slice(0, 40);
  const sigOk = (kind, id, got) => { const exp = sig(kind, id); got = String(got || ""); return got.length === exp.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(exp)); };
  // Rechnungsanschrift bei Print.com = FS Creative (deren Rechnung kommt per Mail an FS Creative, nie an den Kunden)
  const billingFs = () => ({ companyName: "FS Creative", firstName: "Simon", lastName: "Felder", fullstreet: process.env.PRINT_BILLING_STREET || "Dorfstraße 3/1", postcode: process.env.PRINT_BILLING_ZIP || "6793",
    city: process.env.PRINT_BILLING_CITY || "Gaschurn", country: "AT", email: process.env.PRINT_BILLING_EMAIL || "simon@fs-creative.at", telephone: process.env.PRINT_BILLING_PHONE || "+43 664 1430620",
    vatNr: String(process.env.PRINT_BILLING_VATNR || FIRM_DEFAULT.uid || "").replace(/\s+/g, "") || undefined });

  // ───────────────────────── Speicher ─────────────────────────
  const useDb = () => !!(process.env.DATABASE_URL && D.fin);
  let dbReady = null;
  async function db() {
    const c = D.fin.db();
    if (!dbReady) dbReady = (async () => {
      await D.fin.init();
      await c.query("create table if not exists print_order (id text primary key, data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())");
      await c.query("create table if not exists print_file (id text primary key, meta jsonb not null, data bytea, created_at timestamptz not null default now())");
    })().catch(e => { dbReady = null; throw e; });
    await dbReady; return c;
  }
  const FDIR = () => { const d = path.join(DATA_DIR, "print-shop"); ["orders", "files"].forEach(s => { try { fs.mkdirSync(path.join(d, s), { recursive: true }); } catch (e) {} }); return d; };
  const rdJson = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } };
  const wrJson = (f, o) => { const t = f + ".tmp" + process.pid; fs.writeFileSync(t, JSON.stringify(o)); fs.renameSync(t, f); };
  const okId = id => /^[A-Za-z0-9_-]{6,60}$/.test(String(id || ""));
  const store = {
    async getOrder(id) { if (!okId(id)) return null; if (useDb()) { const r = await (await db()).query("select data from print_order where id=$1", [id]); return r.rows[0] ? r.rows[0].data : null; } return rdJson(path.join(FDIR(), "orders", id + ".json")); },
    async putOrder(o) { o.updatedAt = nowIso(); if (useDb()) { await (await db()).query("insert into print_order(id,data) values($1,$2::jsonb) on conflict(id) do update set data=excluded.data, updated_at=now()", [o.id, JSON.stringify(o)]); return o; } wrJson(path.join(FDIR(), "orders", o.id + ".json"), o); return o; },
    async listOrders() { if (useDb()) { const r = await (await db()).query("select data from print_order order by created_at desc limit 1000"); return r.rows.map(x => x.data); }
      const d = path.join(FDIR(), "orders"); return fs.readdirSync(d).filter(f => /\.json$/.test(f)).map(f => rdJson(path.join(d, f))).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); },
    async putFile(meta, buf) { if (useDb()) { await (await db()).query("insert into print_file(id,meta,data) values($1,$2::jsonb,$3) on conflict(id) do update set meta=excluded.meta, data=coalesce(excluded.data, print_file.data)", [meta.id, JSON.stringify(meta), buf || null]); return meta; }
      const d = path.join(FDIR(), "files"); if (buf) fs.writeFileSync(path.join(d, meta.id + ".pdf"), buf); wrJson(path.join(d, meta.id + ".json"), meta); return meta; },
    async fileMeta(id) { if (!okId(id)) return null; if (useDb()) { const r = await (await db()).query("select meta from print_file where id=$1", [id]); return r.rows[0] ? r.rows[0].meta : null; } return rdJson(path.join(FDIR(), "files", id + ".json")); },
    async fileData(id) { if (!okId(id)) return null; if (useDb()) { const r = await (await db()).query("select data from print_file where id=$1", [id]); return r.rows[0] ? r.rows[0].data : null; } try { return fs.readFileSync(path.join(FDIR(), "files", id + ".pdf")); } catch (e) { return null; } },
    async listFiles() { if (useDb()) { const r = await (await db()).query("select meta from print_file"); return r.rows.map(x => x.meta); } const d = path.join(FDIR(), "files"); return fs.readdirSync(d).filter(f => /\.json$/.test(f)).map(f => rdJson(path.join(d, f))).filter(Boolean); },
    async delFile(id) { if (!okId(id)) return; if (useDb()) { await (await db()).query("delete from print_file where id=$1", [id]); return; } ["pdf", "json"].forEach(x => { try { fs.unlinkSync(path.join(FDIR(), "files", id + "." + x)); } catch (e) {} }); },
    async getMeta(k) { if (useDb()) { await db(); return D.fin.getMeta(k); } return rdJson(path.join(FDIR(), k + ".json")); },
    async setMeta(k, v) { if (useDb()) { await db(); return D.fin.setMeta(k, v); } wrJson(path.join(FDIR(), k + ".json"), v); },
  };

  // ───────────────────────── Einstellungen ─────────────────────────
  let SETTINGS = null;
  async function settings() {
    if (SETTINGS) return SETTINGS;
    const s = (await store.getMeta("print_settings").catch(() => null)) || {};
    SETTINGS = { autoSend: s.autoSend === true, open: s.open !== false, products: s.products && typeof s.products === "object" ? s.products : {} };
    return SETTINGS;
  }
  async function saveSettings(pl) {
    const s = await settings();
    if (pl.autoSend !== undefined) s.autoSend = pl.autoSend === true;
    if (pl.open !== undefined) s.open = pl.open !== false;
    if (pl.products && typeof pl.products === "object") {
      CURATED.forEach(c => {
        const x = pl.products[c.key]; if (!x || typeof x !== "object") return;
        const cur = s.products[c.key] = s.products[c.key] || {};
        if (x.enabled !== undefined) cur.enabled = x.enabled !== false;
        if (x.sku !== undefined) cur.sku = /^[a-z0-9_-]{0,80}$/i.test(String(x.sku || "")) ? String(x.sku || "") : cur.sku || "";
        ["markupPct", "minMarginEur"].forEach(k => { if (x[k] === undefined) return; const n = parseFloat(String(x[k]).replace(",", ".")); cur[k] = x[k] === null || x[k] === "" || !isFinite(n) ? null : Math.max(0, Math.min(k === "markupPct" ? 500 : 1000, n)); });
        if (x.allow && typeof x.allow === "object") { cur.allow = {}; Object.keys(x.allow).slice(0, 20).forEach(prop => { if (!/^[a-z0-9_-]{1,60}$/i.test(prop) || !Array.isArray(x.allow[prop])) return; const v = x.allow[prop].map(String).filter(o => /^[a-z0-9_.-]{1,80}$/i.test(o)).slice(0, 80); if (v.length) cur.allow[prop] = v; }); }
      });
    }
    await store.setMeta("print_settings", s); SETTINGS = s; return s;
  }

  // ───────────────────────── Print.com ─────────────────────────
  async function pcApi(method, p, body, opts) {
    opts = opts || {};
    const c = cfg(); if (!c.pcKey) { const e = new Error("Print.com ist noch nicht eingerichtet (PRINTCOM_API_KEY fehlt)"); e.status = 503; throw e; }
    const auth = /^(Bearer|PrintApiKey)\s/i.test(c.pcKey) ? c.pcKey : "PrintApiKey " + c.pcKey;
    const headers = { authorization: auth, accept: "application/json", "accept-language": "de-DE" };
    let payload;
    if (opts.form) payload = opts.form; else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const r = await fetch((opts.base || c.pcBase) + p, { method, headers, body: payload, signal: AbortSignal.timeout(opts.timeout || 30000) });
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (!r.ok) { const m = (j && (j.message || (j.error && (j.error.message || j.error)) || (Array.isArray(j.errors) && j.errors.map(x => x.message || x).join("; ")))) || txt.slice(0, 200) || "HTTP " + r.status; const e = new Error("Print.com: " + String(m).slice(0, 300)); e.status = r.status; e.detail = j; throw e; }
    return j;
  }
  const firstOf = j => (j && Array.isArray(j.results) ? j.results[0] : j) || {};

  // ── Katalog (täglich neu) ──
  let CAT = null, catLoading = null;
  function dimsOf(o) {
    const w = parseFloat(String(o.width || "").replace(",", ".")), h = parseFloat(String(o.height || "").replace(",", "."));
    if (w > 0 && h > 0 && w < 5000 && h < 5000) return [w, h];
    const t = (String(o.slug || "") + " " + String(o.name || "")).toLowerCase();
    const m = t.match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/);
    if (m) { const f = m[3] === "cm" ? 10 : m[3] === "m" ? 1000 : 1; return [parseFloat(m[1].replace(",", ".")) * f, parseFloat(m[2].replace(",", ".")) * f]; }
    const a = t.match(/\b(a[0-7]|dl|din_lang)\b/); if (a) return A_SIZES[a[1]].slice();
    return null;
  }
  function parseProduct(c, sku, pd) {
    const props = Array.isArray(pd && pd.properties) ? pd.properties : [];
    const by = {}; props.forEach(p => { if (p && p.slug) by[p.slug] = p; });
    const avail = (by.copies && Array.isArray(by.copies.options) ? by.copies.options : []).map(o => parseInt(o.slug != null ? o.slug : o.name, 10)).filter(n => n > 0).sort((a, b) => a - b);
    let tiers = c.tiers.filter(t => !avail.length || avail.indexOf(t) > -1); if (!tiers.length) tiers = Array.from(new Set(avail)).slice(0, 8);
    const urgency = (by.urgency && Array.isArray(by.urgency.options) && by.urgency.options.length ? by.urgency.options : [{ slug: "standard" }]).map(o => ({ slug: String(o.slug), name: URGENCY_DE[o.slug] || o.name || o.slug })).filter(o => /^(standard|quick|urgent)$/.test(o.slug));
    const fixed = {}, exposed = [];
    props.forEach(p => {
      if (!p || !p.slug || p.slug === "copies" || p.slug === "urgency" || p.locked) return;
      const opts = (Array.isArray(p.options) ? p.options : []).filter(o => o && o.slug != null);
      if (c.expose.indexOf(p.slug) > -1 && opts.length) exposed.push({ slug: p.slug, title: p.title || p.slug, options: opts.slice(0, 60).map(o => { const d = p.slug === "size" ? dimsOf(o) : null; return { slug: String(o.slug), name: String(o.name || o.slug), w: d ? d[0] : null, h: d ? d[1] : null }; }) });
      else if (p.required && opts.length) fixed[p.slug] = String((opts.find(o => !o.nullable) || opts[0]).slug);
    });
    exposed.sort((a, b) => c.expose.indexOf(a.slug) - c.expose.indexOf(b.slug));
    const excludes = (Array.isArray(pd.excludes) ? pd.excludes : []).filter(Array.isArray).slice(0, 400).map(rule => rule.filter(x => x && x.property && Array.isArray(x.options)).map(x => ({ property: String(x.property), options: x.options.map(String) }))).filter(r => r.length);
    return { key: c.key, title: c.title, icon: c.icon, desc: c.desc, designer: c.designer, safe: c.safe, sku: String(sku), bleed: +pd.bleed > 0 && +pd.bleed < 30 ? +pd.bleed : 2, props: exposed, tiers, urgency, fixed, excludes };
  }
  async function catalogRefresh() {
    const s = await settings();
    const list = await pcApi("GET", "/products");
    const items = (Array.isArray(list) ? list : (list && (list.items || list.results)) || []).filter(p => p && p.sku && p.active !== false);
    const out = { at: nowIso(), products: [], errors: [] };
    for (const c of CURATED) {
      const ov = s.products[c.key] || {};
      let sku = ov.sku || "";
      if (!sku) { const ex = items.find(p => c.skus.indexOf(String(p.sku).toLowerCase()) > -1); sku = ex ? ex.sku : ((items.find(p => c.rx.test(p.sku) || c.rx.test(p.titlePlural || "") || c.rx.test(p.titleSingle || "")) || {}).sku || ""); }
      if (!sku) { out.errors.push(c.title + ": kein passendes Print.com-Produkt gefunden"); continue; }
      try { out.products.push(parseProduct(c, sku, await pcApi("GET", "/products/" + encodeURIComponent(sku) + "?view=reseller"))); }
      catch (e) { out.errors.push(c.title + " (" + sku + "): " + e.message); }
    }
    if (!out.products.length && CAT && CAT.products && CAT.products.length) { CAT.errors = out.errors; return CAT; }   // Ausfall: alten Stand behalten
    await store.setMeta("print_catalog", out); CAT = out; PRICE_CACHE.clear();
    if (out.errors.length) log("Katalog:", out.errors.join(" · "));
    return out;
  }
  async function catalog(force) {
    if (!cfg().pcKey) return null;
    if (!CAT) CAT = await store.getMeta("print_catalog").catch(() => null);
    const stale = !CAT || !CAT.at || Date.now() - Date.parse(CAT.at) > 24 * 3600e3;
    if (force || stale) {
      if (!catLoading) catLoading = catalogRefresh().catch(e => { log("Katalog:", e.message); if (CAT) CAT.errors = [e.message]; return CAT; }).finally(() => { catLoading = null; });
      if (force || !CAT || !CAT.products || !CAT.products.length) return catLoading;
    }
    return CAT;
  }
  function productOf(cat, key, s) {
    const p = cat && (cat.products || []).find(x => x.key === key); if (!p) return null;
    const ov = (s && s.products[key]) || {}; if (ov.enabled === false) return null;
    const allow = ov.allow || {};
    const props = p.props.map(pr => { const a = allow[pr.slug]; const opts = a && a.length ? pr.options.filter(o => a.indexOf(o.slug) > -1) : pr.options; return Object.assign({}, pr, { options: opts.length ? opts : pr.options }); });
    return Object.assign({}, p, { props });
  }
  function publicCatalog(cat, s) {
    return (cat && cat.products || []).map(p => productOf(cat, p.key, s)).filter(Boolean).map(p => ({ key: p.key, title: p.title, icon: p.icon, desc: p.desc, designer: p.designer, bleed: p.bleed, safe: p.safe, props: p.props, tiers: p.tiers, urgency: p.urgency, fixed: p.fixed, excludes: p.excludes }));
  }
  const excluded = (excludes, sel) => (excludes || []).some(rule => rule.every(x => sel[x.property] != null && x.options.indexOf(String(sel[x.property])) > -1));
  function sidesOf(sel) { const t = String(sel.printtype || ""); const m = t.match(/^(\d)(\d)$/); return m && m[2] !== "0" ? 2 : 1; }
  function sizeOf(prod, sel) {
    const sp = prod.props.find(x => x.slug === "size"); const o = sp && sp.options.find(x => x.slug === sel.size);
    if (o && o.w && o.h) return { w: o.w, h: o.h };
    const d = dimsOf({ slug: sel.size || prod.fixed.size || "" }); return d ? { w: d[0], h: d[1] } : null;
  }
  // Auswahl prüfen: nur angebotene Optionen, sonst Fehler (nie stillschweigend etwas anderes bestellen)
  function normalizeSel(prod, input) {
    input = input || {};
    const sel = {};
    for (const pr of prod.props) {
      const v = input.sel && input.sel[pr.slug] != null ? String(input.sel[pr.slug]) : null;
      if (v == null) sel[pr.slug] = pr.options[0].slug;
      else if (pr.options.some(o => o.slug === v)) sel[pr.slug] = v;
      else throw Object.assign(new Error("Ungültige Option für " + pr.title), { status: 400 });
    }
    const copies = parseInt(input.copies, 10);
    if (prod.tiers.indexOf(copies) < 0) throw Object.assign(new Error("Ungültige Auflage"), { status: 400 });
    const urgency = String(input.urgency || prod.urgency[0] && prod.urgency[0].slug || "standard");
    if (prod.urgency.length && !prod.urgency.some(u => u.slug === urgency)) throw Object.assign(new Error("Ungültige Lieferzeit"), { status: 400 });
    const all = Object.assign({}, prod.fixed, sel);
    if (excluded(prod.excludes, all)) throw Object.assign(new Error("Diese Kombination ist leider nicht lieferbar"), { status: 400 });
    const pcOpts = Object.assign({}, all, { copies }); if (prod.urgency.length) pcOpts.urgency = urgency;
    const labels = prod.props.map(pr => [pr.title, (pr.options.find(o => o.slug === sel[pr.slug]) || {}).name || sel[pr.slug]]);
    return { sel, copies, urgency, pcOpts, labels, sides: sidesOf(all), size: sizeOf(prod, all) };
  }

  // ── Steuer ──
  // AT: immer 20 %. DE privat: österreichische USt 20 % (TODO OSS: ab 10.000 € EU-weiten Fernverkäufen pro Jahr deutsche USt 19 % über OSS abführen –
  // Schwelle im Blick behalten). DE Firma mit gültiger (VIES) deutscher UID: steuerfreie innergemeinschaftliche Lieferung 0 %, Hinweis auf der Rechnung.
  function taxFor(country, cust) {
    const uid = String(cust && cust.uid || "").replace(/[\s.\-]/g, "").toUpperCase();
    if (country !== "AT" && cust && cust.company && cust.uidValid && uid.slice(0, 2) === country) return { case: "igl", rate: 0, uid, note: "Steuerfreie innergemeinschaftliche Lieferung (Art. 6 Abs. 1 iVm Art. 7 UStG 1994). UID des Leistungsempfängers: " + uid + "." };
    return { case: "at20", rate: 20, uid: uid || "", note: "" };
  }
  async function uidCheck(uid) {
    const v = D.uidValid ? D.uidValid(uid) : { ok: /^[A-Z]{2}[A-Z0-9]{8,12}$/.test(String(uid || "").replace(/\s+/g, "").toUpperCase()), uid: String(uid || "").replace(/\s+/g, "").toUpperCase() };
    if (!v.ok) return { valid: false, format: false, uid: v.uid || uid, why: v.why || "Format ungültig" };
    if (!D.viesCheck) return { valid: false, format: true, uid: v.uid, why: "Prüfung nicht verfügbar" };
    try { const r = await D.viesCheck(v.uid); return { valid: !!r.valid, format: true, uid: r.uid || v.uid, name: r.name || "", why: r.why || "" }; }
    catch (e) { return { valid: false, format: true, uid: v.uid, why: "VIES nicht erreichbar", unreachable: true }; }
  }

  // ── Preis (live) ──
  const PRICE_CACHE = new Map();
  async function purchase(prod, n, country, postcode) {
    const key = JSON.stringify([prod.sku, n.pcOpts, country, postcode || ""]);
    const hit = PRICE_CACHE.get(key); if (hit && Date.now() - hit.at < 30 * 60e3) return hit.v;
    const pr = await pcApi("POST", "/products/" + encodeURIComponent(prod.sku) + "/price", { sku: prod.sku, options: n.pcOpts, deliveryPromise: 0 });
    const P = pr && pr.prices || {};
    const productPrice = +P.salesPrice > 0 ? +P.salesPrice : +P.productPrice > 0 ? +P.productPrice : +P.normalPrice;
    if (!(productPrice > 0)) throw Object.assign(new Error("Für diese Auswahl gibt es gerade keinen Preis"), { status: 502 });
    const sp = await pcApi("POST", "/shipping/shipping-possibilities", { item: { sku: prod.sku, options: n.pcOpts, deliveryPromise: 0 }, address: { country, postcode: postcode || (country === "DE" ? "10115" : "6793") }, numberOfDays: 21 });
    let poss = []; ((sp && sp.results) || []).forEach(r => (r.possibilities || []).forEach(x => poss.push(x)));
    const same = poss.filter(x => !x.urgency || x.urgency === n.urgency); if (same.length) poss = same;
    const cost = x => { const p = x.price || {}; return +p.cost > 0 ? +p.cost : (+p.base || 0) + (+p.urgency || 0); };
    poss.sort((a, b) => cost(a) - cost(b) || String(a.deliveryDate).localeCompare(String(b.deliveryDate)));
    if (!poss.length) throw Object.assign(new Error("Versand in dieses Land ist für diese Auswahl gerade nicht möglich"), { status: 502 });
    const best = poss[0];
    const fastest = poss.slice().sort((a, b) => String(a.deliveryDate).localeCompare(String(b.deliveryDate)))[0];
    const v = { product: r2(productPrice), shipping: r2(cost(best)), total: r2(productPrice + cost(best)), deliveryDate: String(best.deliveryDate || "").slice(0, 10), carrier: String(best.carrier || ""), method: String(best.method || ""), earliest: String(fastest.deliveryDate || "").slice(0, 10) };
    PRICE_CACHE.set(key, { at: Date.now(), v }); if (PRICE_CACHE.size > 2000) PRICE_CACHE.clear();
    return v;
  }
  async function quote(prod, n, country, postcode, cust) {
    if (!COUNTRIES[country]) throw Object.assign(new Error("Lieferung derzeit nur innerhalb Österreichs"), { status: 400 });
    const s = await settings(), ov = s.products[prod.key] || {}, c = cfg();
    const buy = await purchase(prod, n, country, postcode);
    const markup = ov.markupPct != null ? +ov.markupPct : c.markup, minM = ov.minMarginEur != null ? +ov.minMarginEur : c.minMargin;
    const net = Math.ceil(Math.max(buy.total * (1 + markup / 100), buy.total + minM) * 10 - 1e-6) / 10;   // auf 10 Cent aufrunden
    const tax = taxFor(country, cust), vat = r2(net * tax.rate / 100);
    return { net: r2(net), vat, gross: r2(net + vat), rate: tax.rate, taxCase: tax.case, taxNote: tax.note, uid: tax.uid, purchase: buy, margin: r2(net - buy.total), markupPct: markup, minMarginEur: minM, deliveryDate: buy.deliveryDate, at: nowIso() };
  }
  const publicPrice = q => ({ net: q.net, vat: q.vat, gross: q.gross, rate: q.rate, taxCase: q.taxCase, taxNote: q.taxNote, deliveryDate: q.deliveryDate, shippingIncluded: true });

  // ───────────────────────── Dateien ─────────────────────────
  function sniff(buf) {
    if (buf.length > 5 && buf.slice(0, 5).toString("latin1") === "%PDF-") return "pdf";
    if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return "jpg";
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504E47 && buf.readUInt32BE(4) === 0x0D0A1A0A) return "png";
    return "";
  }
  function imgDims(buf, type) {
    if (type === "png") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  function pdfInfo(buf) {
    const s = buf.toString("latin1");
    const box = name => { const m = s.match(new RegExp("\\/" + name + "\\s*\\[\\s*(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s*\\]")); return m ? { w: r2(Math.abs(m[3] - m[1]) / MM_PT), h: r2(Math.abs(m[4] - m[2]) / MM_PT) } : null; };
    let pages = (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
    const cm = s.match(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g) || [];
    cm.forEach(x => { const n = parseInt((x.match(/\/Count\s+(\d+)/) || [])[1], 10); if (n > pages) pages = n; });
    return { encrypted: /\/Encrypt\b/.test(s), pages: pages || null, media: box("MediaBox"), trim: box("TrimBox") };
  }
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const fits = (box, w, h, tol) => box && ((near(box.w, w, tol) && near(box.h, h, tol)) || (near(box.w, h, tol) && near(box.h, w, tol)));
  function checkPdf(info, size, bleed, sides) {
    const out = [], W = size.w + 2 * bleed, H = size.h + 2 * bleed;
    if (info.trim && fits(info.trim, size.w, size.h, 1)) out.push({ level: "ok", text: "Endformat (TrimBox) " + size.w + " × " + size.h + " mm passt." });
    if (fits(info.media, W, H, 1.2)) out.push({ level: "ok", text: "Seitengröße inkl. " + bleed + " mm Beschnitt passt (" + W + " × " + H + " mm)." });
    else if (fits(info.media, size.w, size.h, 1)) out.push({ level: "warn", text: "Die Datei hat keinen Beschnitt (" + bleed + " mm je Seite). Motive bis zum Rand werden evtl. mit weißem Blitzer geschnitten." });
    else if (info.media) {
      const ar = (info.media.w / info.media.h), arT = W / H;
      if (near(ar, arT, 0.02) || near(1 / ar, arT, 0.02)) out.push({ level: "warn", text: "Seitengröße " + info.media.w + " × " + info.media.h + " mm weicht ab, Seitenverhältnis passt – die Datei wird auf " + W + " × " + H + " mm skaliert." });
      else out.push({ level: "error", text: "Seitengröße " + info.media.w + " × " + info.media.h + " mm passt nicht zum gewählten Format (" + W + " × " + H + " mm inkl. Beschnitt)." });
    } else out.push({ level: "warn", text: "Seitengröße konnte nicht automatisch gelesen werden – wir prüfen die Datei vor dem Druck persönlich." });
    if (info.pages && info.pages !== sides) out.push({ level: info.pages < sides ? "warn" : "error", text: "Die Datei hat " + info.pages + " Seite(n), für die gewählte Druckart werden " + sides + " benötigt." + (info.pages < sides ? " Die Rückseite bleibt sonst weiß." : "") });
    else if (info.pages) out.push({ level: "ok", text: info.pages + " Seite(n) – passt zur gewählten Druckart." });
    return out;
  }
  async function imageToPdf(buf, type, size, bleed, sides) {
    const PDFDocument = require("pdfkit");
    const W = (size.w + 2 * bleed) * MM_PT, H = (size.h + 2 * bleed) * MM_PT;
    const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false, info: { Title: "Druckdaten", Producer: "FS Creative Druckshop" } });
    const chunks = []; doc.on("data", c => chunks.push(c)); const done = new Promise((res, rej) => { doc.on("end", res); doc.on("error", rej); });
    doc.addPage({ size: [W, H], margin: 0 });
    doc.image(buf, 0, 0, { cover: [W, H], align: "center", valign: "center" });
    for (let i = 1; i < sides; i++) doc.addPage({ size: [W, H], margin: 0 });
    doc.end(); await done; return Buffer.concat(chunks);
  }
  // SVG aus dem Designer → druckfertiges PDF (Vektor; Texte in Helvetica/Times/Courier = Arial/Times New Roman/Courier New im Browser)
  function svgSafe(svg) {
    svg = String(svg || "").replace(/^\s*(<\?xml[^>]*>\s*)?<!DOCTYPE svg PUBLIC "-\/\/W3C\/\/DTD SVG 1\.1\/\/EN" "http:\/\/www\.w3\.org\/Graphics\/SVG\/1\.1\/DTD\/svg11\.dtd">\s*/i, "");   // Standard-Vorspann von Fabric.js
    if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) throw Object.assign(new Error("Ungültige Gestaltung"), { status: 400 });
    if (/<!DOCTYPE|<!ENTITY|<script|<foreignObject|javascript:|<iframe|<object|<embed|@import/i.test(svg)) throw Object.assign(new Error("Unzulässiger Inhalt in der Gestaltung"), { status: 400 });
    const hrefs = svg.match(/(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*')/gi) || [];
    for (const h of hrefs) { const v = h.replace(/^[^=]*=\s*/, "").slice(1, -1).trim(); if (!(/^#[\w-]+$/.test(v) || /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=\s]+$/i.test(v))) throw Object.assign(new Error("Bilder müssen direkt eingebettet sein"), { status: 400 }); }
    const urls = svg.match(/url\(\s*['"]?([^'")]*)/gi) || [];
    for (const u of urls) { const v = u.replace(/^url\(\s*['"]?/i, ""); if (!/^#[\w-]+$/.test(v)) throw Object.assign(new Error("Unzulässiger Verweis in der Gestaltung"), { status: 400 }); }
    return svg.replace(/<svg([^>]*)>/i, (m, a) => "<svg" + a.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, "") + ">");
  }
  // Schrift für das PDF: mitgelieferte Schrift (eingebettet, Teilmenge) – fehlt Fett/Kursiv, rechnet svg-to-pdfkit „faux“; Unbekanntes → Helvetica
  const FONT_BUF = {};
  function fontBuf(name) { if (!(name in FONT_BUF)) { try { FONT_BUF[name] = fs.readFileSync(path.join(__dirname, "print", "fonts", name + ".woff")); } catch (e) { FONT_BUF[name] = null; } } return FONT_BUF[name]; }
  function fontFor(doc, family, bold, italic, fo) {
    const first = String(family || "").split(",")[0].replace(/['"]/g, "").trim().toLowerCase();
    const f = FONTS.find(x => x.family.toLowerCase() === first);
    if (f) {
      const b = bold && f.bold, i = italic && f.italic && !b;   // Fett+Kursiv: fette Schrift, kursiv gerechnet
      const name = f.file + "-" + (b ? "700" : "400") + (i ? "i" : "");
      const buf = fontBuf(name);
      if (buf) {
        if (!doc._registeredFonts || !doc._registeredFonts[name]) doc.registerFont(name, buf);
        if (fo) { if (bold && !b) fo.fauxBold = true; if (italic && !i) fo.fauxItalic = true; }
        return name;
      }
    }
    const base = /times|georgia|serif/.test(first) && !/sans/.test(first) ? "Times" : /courier|mono/.test(first) ? "Courier" : "Helvetica";
    if (base === "Times") return bold && italic ? "Times-BoldItalic" : bold ? "Times-Bold" : italic ? "Times-Italic" : "Times-Roman";
    return bold && italic ? base + "-BoldOblique" : bold ? base + "-Bold" : italic ? base + "-Oblique" : base;
  }
  // RGB → CMYK (einfach, mit Unterfarbenreduktion: Schwarz/Grau nur aus K) – Vektorfarben landen als CMYK im PDF
  function cmyk(rgb) {
    const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255, k = 1 - Math.max(r, g, b);
    if (k >= 0.999) return [0, 0, 0, 100];
    const c = (1 - r - k) / (1 - k), m = (1 - g - k) / (1 - k), y = (1 - b - k) / (1 - k);
    return [c, m, y, k].map(v => Math.round(Math.max(0, Math.min(1, v)) * 1000) / 10);
  }
  async function svgPagesToPdf(pages, size, bleed) {
    const PDFDocument = require("pdfkit"), SVGtoPDF = require("svg-to-pdfkit");
    const W = (size.w + 2 * bleed) * MM_PT, H = (size.h + 2 * bleed) * MM_PT, B = bleed * MM_PT;
    const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false, info: { Title: "Druckdaten", Producer: "FS Creative Druckshop" } });
    const chunks = []; doc.on("data", c => chunks.push(c)); const done = new Promise((res, rej) => { doc.on("end", res); doc.on("error", rej); });
    const warns = [], images = [];
    // Bild-Auflösung beim Zeichnen messen: doc.image(img,0,0) zeichnet 1 px = 1 pt, die aktuelle Matrix skaliert → dpi = 72 / Skalierung
    const origImage = doc.image.bind(doc);
    doc.image = function (img, x, y, opt) {
      const m = doc._ctm || [1, 0, 0, 1, 0, 0], sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]);
      const iw = img && img.width, ih = img && img.height;
      if (iw && ih && !opt) images.push({ page: doc._pageCount || 0, px: [iw, ih], mm: [r2(iw * sx / MM_PT), r2(ih * sy / MM_PT)], dpi: Math.round(72 / Math.max(sx, sy)) });
      return origImage(img, x, y, opt);
    };
    let pageNo = 0;
    for (const svg of pages) {
      doc.addPage({ size: [W, H], margin: 0 }); doc._pageCount = ++pageNo;
      // Endformat und Beschnitt im PDF kennzeichnen (Druckereien lesen TrimBox/BleedBox)
      doc.page.dictionary.data.TrimBox = [B, B, W - B, H - B]; doc.page.dictionary.data.BleedBox = [0, 0, W, H];
      SVGtoPDF(doc, svg, 0, 0, { width: W, height: H, preserveAspectRatio: "none",
        fontCallback: (fam, bold, italic, fo) => fontFor(doc, fam, bold, italic, fo),
        colorCallback: c => c && Array.isArray(c[0]) && c[0].length === 3 ? [cmyk(c[0]), c[1]] : c,
        imageCallback: link => { link = String(link || "").replace(/\s+/g, ""); return /^data:image\/(png|jpe?g);base64,/i.test(link) ? link : ""; },
        documentCallback: () => null, warningCallback: w => { if (warns.length < 20) warns.push(String(w).slice(0, 200)); } });
    }
    doc.end(); await done;
    return { buf: Buffer.concat(chunks), warns, images };
  }
  async function preflightStart(meta, buf) {
    const c = cfg(); if (!c.preflight || !c.pcKey) return null;
    const fd = new FormData();
    fd.append("document", new Blob([JSON.stringify({ bleed: { left: meta.bleed, right: meta.bleed, top: meta.bleed, bottom: meta.bleed }, profile: "GWG_SheetCmyk_2015 CMYK + RGB", template: [{ width: meta.size.w, height: meta.size.h }] })], { type: "application/json" }));
    fd.append("file", new Blob([buf], { type: "application/pdf" }), "druck.pdf");
    const j = await pcApi("POST", "/pdf/preflight", undefined, { base: c.pcPlatform, form: fd, timeout: 60000 });
    return j && j.id ? { id: String(j.id), status: "PROCESSING" } : null;
  }
  async function preflightPoll(meta) {
    if (!meta.preflight || meta.preflight.status !== "PROCESSING") return meta;
    try {
      const j = await pcApi("GET", "/pdf/preflight/" + encodeURIComponent(meta.preflight.id), undefined, { base: cfg().pcPlatform });
      if (j && j.status && j.status !== "PROCESSING") {
        meta.preflight = { id: meta.preflight.id, status: j.status, errors: (j.errors || []).map(x => clip(x.message, 300)).slice(0, 20), warnings: (j.warnings || []).map(x => clip(x.message, 300)).slice(0, 20), fixes: (j.fixes || []).map(x => clip(x.message, 300)).slice(0, 20), reason: clip(j.failure_reason, 300) };
        meta.preflight.errors.forEach(t => meta.checks.push({ level: "error", text: "Print.com-Prüfung: " + t }));
        meta.preflight.warnings.forEach(t => meta.checks.push({ level: "warn", text: "Print.com-Prüfung: " + t }));
        await store.putFile(meta);
      }
    } catch (e) { log("Preflight:", e.message); }
    return meta;
  }
  const fileView = m => ({ fileId: m.id, token: sig("file", m.id), name: m.name, kind: m.kind, pages: m.pages, size: m.size, bleed: m.bleed, checks: m.checks || [], blocked: (m.checks || []).some(c => c.level === "error"), preflight: m.preflight ? { status: m.preflight.status } : null, bytes: m.bytes });
  async function newFile(kind, name, pdf, target, checks, extra) {
    const meta = Object.assign({ id: "f" + crypto.randomBytes(12).toString("hex"), kind, name: clip(name, 120) || "druck.pdf", bytes: pdf.length, createdAt: nowIso(), product: target.product, sel: target.sel, size: target.size, bleed: target.bleed, sides: target.sides, pages: target.pages || null, checks, orderId: null, sha256: crypto.createHash("sha256").update(pdf).digest("hex") }, extra || {});
    try { const pf = await preflightStart(meta, pdf); if (pf) meta.preflight = pf; } catch (e) { log("Preflight-Start:", e.message); }
    await store.putFile(meta, pdf);
    return meta;
  }
  async function targetOf(input) {
    const cat = await catalog(false), s = await settings();
    const prod = productOf(cat, String(input.product || ""), s); if (!prod) throw Object.assign(new Error("Produkt nicht verfügbar"), { status: 400 });
    const n = normalizeSel(prod, input);
    if (!n.size) throw Object.assign(new Error("Format unbekannt – bitte Gestaltung anfragen"), { status: 400 });
    return { prod, n, target: { product: prod.key, sel: n.sel, size: n.size, bleed: prod.bleed, sides: n.sides } };
  }
  async function handleUpload(buf, name, input) {
    const { target } = await targetOf(input);
    const type = sniff(buf); if (!type) throw Object.assign(new Error("Nur PDF, JPG oder PNG möglich"), { status: 415 });
    if (type === "pdf") {
      const info = pdfInfo(buf); if (info.encrypted) throw Object.assign(new Error("Die PDF ist verschlüsselt/geschützt – bitte ohne Kennwortschutz exportieren"), { status: 400 });
      target.pages = info.pages;
      return newFile("upload", name, buf, target, checkPdf(info, target.size, target.bleed, target.sides), { original: "pdf" });
    }
    const dm = imgDims(buf, type); if (!dm || !dm.w || !dm.h) throw Object.assign(new Error("Bild konnte nicht gelesen werden"), { status: 400 });
    if (dm.w * dm.h > 150e6) throw Object.assign(new Error("Bild ist zu groß (max. 150 Megapixel)"), { status: 400 });
    const W = target.size.w + 2 * target.bleed, H = target.size.h + 2 * target.bleed;
    const rot = (dm.w > dm.h) !== (W > H) && Math.abs(W - H) > 1;
    const dpi = Math.round(Math.min((rot ? dm.h : dm.w) / (W / 25.4), (rot ? dm.w : dm.h) / (H / 25.4)));
    const checks = [];
    if (dpi >= 300) checks.push({ level: "ok", text: "Auflösung " + dpi + " dpi – passt." });
    else if (dpi >= 150) checks.push({ level: "warn", text: "Auflösung nur " + dpi + " dpi (empfohlen 300 dpi). Der Druck kann leicht unscharf wirken." });
    else if (dpi >= 72) checks.push({ level: "warn", text: "Auflösung sehr gering (" + dpi + " dpi). Der Druck wird sichtbar unscharf – besser eine größere Datei verwenden." });
    else checks.push({ level: "error", text: "Auflösung viel zu gering (" + dpi + " dpi) für " + W + " × " + H + " mm." });
    if (rot) checks.push({ level: "error", text: "Bild ist " + (dm.w > dm.h ? "quer" : "hoch") + ", das Format aber " + (W > H ? "quer" : "hoch") + " – bitte passend drehen." });
    const ar = (dm.w / dm.h) / (W / H); if (!rot && Math.abs(ar - 1) > 0.03) checks.push({ level: "warn", text: "Seitenverhältnis weicht ab – das Bild wird mittig auf " + W + " × " + H + " mm zugeschnitten." });
    checks.push({ level: "warn", text: "Bitte beachte: Inhalte im Beschnitt (" + target.bleed + " mm je Seite) werden abgeschnitten." });
    if (target.sides > 1) checks.push({ level: "warn", text: "Bild-Upload füllt nur die Vorderseite – die Rückseite bleibt weiß. Für zwei Seiten bitte eine 2-seitige PDF hochladen." });
    let pdf; try { pdf = await imageToPdf(buf, type, target.size, target.bleed, target.sides); } catch (e) { throw Object.assign(new Error("Bild konnte nicht verarbeitet werden"), { status: 400 }); }
    target.pages = target.sides;
    return newFile("upload", String(name || "bild").replace(/\.(jpe?g|png)$/i, "") + ".pdf", pdf, target, checks, { original: type, px: dm, dpi });
  }
  async function handleDesign(input) {
    const { target } = await targetOf(input);
    const pages = Array.isArray(input.pages) ? input.pages : [];
    if (pages.length !== target.sides) throw Object.assign(new Error("Anzahl der Seiten passt nicht (" + target.sides + " benötigt)"), { status: 400 });
    const clean = pages.map(svgSafe);
    let r; try { r = await svgPagesToPdf(clean, target.size, target.bleed); } catch (e) { log("Designer-PDF:", e.message); throw Object.assign(new Error("PDF konnte nicht erstellt werden"), { status: 400 }); }
    const W = r2(target.size.w + 2 * target.bleed), H = r2(target.size.h + 2 * target.bleed);
    // Endkontrolle: Seitengröße des erzeugten PDFs = Endformat + 2 × Beschnitt
    const info = pdfInfo(r.buf);
    if (!fits(info.media, W, H, 0.2) || info.pages !== clean.length) { log("Designer-PDF Größe falsch", JSON.stringify(info), W, H); throw Object.assign(new Error("PDF-Größe stimmt nicht – bitte erneut versuchen"), { status: 500 }); }
    const checks = [{ level: "ok", text: "Druck-PDF erstellt: " + W + " × " + H + " mm (Endformat " + target.size.w + " × " + target.size.h + " mm + " + target.bleed + " mm Beschnitt), " + clean.length + " Seite(n), Schriften eingebettet, Farben in CMYK." }];
    const low = r.images.filter(x => x.dpi < 250);
    low.forEach(x => checks.push({ level: x.dpi < 100 ? "error" : "warn", text: "Bild auf Seite " + x.page + " hat bei " + x.mm[0] + " × " + x.mm[1] + " mm nur " + x.dpi + " dpi (empfohlen ≥ 300, mindestens 250)." + (x.dpi < 100 ? " Bitte größeres Bild verwenden oder kleiner platzieren." : " Der Druck kann unscharf wirken.") }));
    if (r.images.length && !low.length) checks.push({ level: "ok", text: r.images.length + " Bild(er) mit ausreichender Auflösung (≥ 250 dpi)." });
    (Array.isArray(input.warnings) ? input.warnings : []).slice(0, 10).forEach(w => checks.push({ level: "warn", text: clip(w, 200) }));
    target.pages = clean.length;
    return newFile("design", "gestaltung.pdf", r.buf, target, checks, { svgWarns: r.warns.length, images: r.images.slice(0, 30) });
  }

  // ───────────────────────── Mollie ─────────────────────────
  async function mollie(method, p, body) {
    const c = cfg(); if (!c.mollieKey) throw Object.assign(new Error("Online-Zahlung ist noch nicht eingerichtet"), { status: 503 });
    const r = await fetch(c.mollieBase + p, { method, headers: Object.assign({ authorization: "Bearer " + c.mollieKey, accept: "application/json" }, body ? { "content-type": "application/json" } : {}), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error("Mollie: " + (j.detail || j.title || "HTTP " + r.status)), { status: r.status });
    return j;
  }
  async function createPayment(o) {
    const c = cfg();
    const pay = await mollie("POST", "/payments", { amount: { currency: "EUR", value: o.price.gross.toFixed(2) }, description: "FS Creative Druck " + o.nr,
      redirectUrl: c.publicUrl + "/print?bestellung=" + encodeURIComponent(o.id) + "&t=" + sig("order", o.id), webhookUrl: c.publicUrl + "/print/mollie-webhook",
      metadata: { orderId: o.id, nr: o.nr }, locale: "de_AT" });
    o.payment.mollieId = String(pay.id || ""); o.payment.attempts = (o.payment.attempts || []).concat([o.payment.mollieId]).slice(-10); o.payment.status = String(pay.status || "open");
    o.payment.checkoutUrl = pay._links && pay._links.checkout && pay._links.checkout.href || "";
    return o.payment.checkoutUrl;
  }

  // ───────────────────────── Mails ─────────────────────────
  function mailHtml(title, intro, rows, outro) {
    return '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;color:#1d1d1f;max-width:600px">' +
      "<h2 style=\"font-size:20px;margin:0 0 12px\">" + escH(title) + "</h2>" + intro.map(p => "<p style=\"margin:0 0 12px;line-height:1.5\">" + escH(p) + "</p>").join("") +
      (rows && rows.length ? '<table cellpadding="5" style="border-collapse:collapse;margin:8px 0 14px">' + rows.map(r => "<tr><td style=\"color:#6e6e73;vertical-align:top\">" + escH(r[0]) + "</td><td><b>" + escH(r[1]) + "</b></td></tr>").join("") + "</table>" : "") +
      (outro || []).map(p => "<p style=\"margin:0 0 12px;line-height:1.5\">" + escH(p) + "</p>").join("") +
      '<p style="margin:18px 0 0;color:#6e6e73;font-size:13px">FS Creative · Simon Felder · Dorfstraße 3/1 · 6793 Gaschurn · <a href="https://www.fs-creative.at">fs-creative.at</a></p></div>';
  }
  async function mail(to, subject, title, intro, rows, outro, replyTo) {
    if (!D.mailSend) return false;
    const text = [title, ""].concat(intro, [""], (rows || []).map(r => r[0] + ": " + r[1]), [""], outro || [], ["", "FS Creative · Simon Felder · Dorfstraße 3/1 · 6793 Gaschurn"]).join("\n");
    try { await D.mailSend({ to, subject, text, html: mailHtml(title, intro, rows, outro), replyTo }); return true; } catch (e) { log("Mail an " + String(to).replace(/^[^@]+/, "…") + " fehlgeschlagen:", e.message); return false; }
  }
  const orderRows = o => [["Bestellnummer", o.nr], ["Produkt", o.product.title + " · " + o.copies + " Stk."]].concat(o.labels.map(l => [l[0], l[1]]), [["Lieferzeit", (URGENCY_DE[o.urgency] || o.urgency) + (o.price.deliveryDate ? " · voraussichtlich " + deDate(o.price.deliveryDate) : "")],
    ["Lieferadresse", [o.customer.company, o.customer.firstName + " " + o.customer.lastName, o.customer.street, o.customer.zip + " " + o.customer.city, COUNTRIES[o.customer.country]].filter(Boolean).join(", ")],
    [o.price.rate ? "Gesamt inkl. " + o.price.rate + " % USt" : "Gesamt (steuerfrei)", eur(o.price.gross) + (o.price.rate ? " (netto " + eur(o.price.net) + ")" : "")], ["Zahlung", o.payment.method === "invoice" ? "Rechnung (14 Tage)" : "Online bezahlt (Mollie)"]]);
  const deDate = iso => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "." + m[2] + "." + m[1] : ""; };

  // ───────────────────────── Bestellungen ─────────────────────────
  const hist = (o, what) => { o.history = (o.history || []).concat([{ at: nowIso(), what: clip(what, 300) }]).slice(-60); };
  function validCustomer(c) {
    c = c || {};
    const x = { type: c.type === "company" ? "company" : "private", company: clip(c.company, 120), uid: clip(c.uid, 20).replace(/[\s.\-]/g, "").toUpperCase(), firstName: clip(c.firstName, 60), lastName: clip(c.lastName, 60),
      email: clip(c.email, 160).toLowerCase(), phone: clip(c.phone, 40), street: clip(c.street, 120), zip: clip(c.zip, 10), city: clip(c.city, 80), country: String(c.country || "AT").toUpperCase() };
    const bad = [];
    if (!x.firstName) bad.push("Vorname"); if (!x.lastName) bad.push("Nachname");
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(x.email)) bad.push("E-Mail");
    if (!/^[+0-9 ()\/-]{6,40}$/.test(x.phone)) bad.push("Telefon");
    if (!x.street || !/\d/.test(x.street)) bad.push("Straße und Hausnummer");
    if (!COUNTRIES[x.country]) bad.push("Land (nur Österreich)"); else if (!PLZ[x.country].test(x.zip)) bad.push("PLZ");
    if (!x.city) bad.push("Ort");
    if (x.type === "company" && !x.company) bad.push("Firmenname");
    if (x.type !== "company") { x.company = ""; x.uid = ""; }
    if (bad.length) throw Object.assign(new Error("Bitte prüfen: " + bad.join(", ")), { status: 400, fields: bad });
    return x;
  }
  async function createOrder(input) {
    const cat = await catalog(false), s = await settings();
    if (!cat || !s.open) throw Object.assign(new Error("Der Shop ist gerade nicht verfügbar"), { status: 503 });
    const prod = productOf(cat, String(input.product || ""), s); if (!prod) throw Object.assign(new Error("Produkt nicht verfügbar"), { status: 400 });
    const n = normalizeSel(prod, input);
    if (input.acceptTerms !== true || input.acceptFagg !== true || input.acceptProof !== true) throw Object.assign(new Error("Bitte AGB, den Hinweis zum Rücktrittsrecht und die geprüften Druckdaten bestätigen"), { status: 400 });
    const cust = validCustomer(input.customer);
    const fm = await store.fileMeta(String(input.fileId || ""));
    if (!fm || !sigOk("file", fm.id, input.fileToken)) throw Object.assign(new Error("Druckdatei nicht gefunden – bitte erneut hochladen"), { status: 400 });
    if (fm.orderId) throw Object.assign(new Error("Diese Druckdatei gehört schon zu einer Bestellung – bitte erneut hochladen"), { status: 409 });
    if (fm.product !== prod.key || JSON.stringify(fm.sel) !== JSON.stringify(n.sel)) throw Object.assign(new Error("Die Druckdatei passt nicht mehr zur gewählten Ausführung – bitte erneut hochladen oder gestalten"), { status: 409 });
    if ((fm.checks || []).some(c => c.level === "error")) throw Object.assign(new Error("Die Druckdatei hat noch Fehler – bitte korrigieren"), { status: 400 });
    let uidRes = null;
    if (cust.type === "company" && cust.uid) { uidRes = await uidCheck(cust.uid); cust.uidValid = !!uidRes.valid; if (uidRes.uid) cust.uid = uidRes.uid; }
    const method = input.payment === "invoice" ? "invoice" : "mollie";
    if (method === "invoice" && !(cust.type === "company" && cust.uidValid)) throw Object.assign(new Error(uidRes && uidRes.unreachable ? "Die UID kann gerade nicht geprüft werden – bitte online bezahlen oder später erneut versuchen" : "Kauf auf Rechnung nur für Firmen mit gültiger UID"), { status: 400 });
    if (method === "mollie" && !cfg().mollieKey) throw Object.assign(new Error("Online-Zahlung ist noch nicht eingerichtet – bitte Rechnung wählen oder uns kontaktieren"), { status: 503 });
    const q = await quote(prod, n, cust.country, cust.zip, cust);
    const exp = parseFloat(input.expectedGross);
    if (!isFinite(exp) || Math.abs(exp - q.gross) > 0.009) return { priceChanged: true, price: publicPrice(q) };
    const id = "P" + Date.now().toString(36).toUpperCase() + rnd(6);
    const o = { id, nr: "D-" + today().slice(2).replace(/-/g, "") + "-" + rnd(4), createdAt: nowIso(), status: method === "invoice" ? "invoice_requested" : "pending_payment",
      product: { key: prod.key, title: prod.title, sku: prod.sku }, sel: n.sel, labels: n.labels, copies: n.copies, urgency: n.urgency, pcOptions: n.pcOpts, sides: n.sides, size: n.size, bleed: prod.bleed,
      fileId: fm.id, fileName: fm.name, fileKind: fm.kind, fileChecks: fm.checks || [], customer: cust, uidCheck: uidRes ? { valid: uidRes.valid, name: uidRes.name || "", at: nowIso() } : null,
      price: { net: q.net, vat: q.vat, gross: q.gross, rate: q.rate, taxCase: q.taxCase, taxNote: q.taxNote, deliveryDate: q.deliveryDate, purchase: q.purchase, margin: q.margin, markupPct: q.markupPct, minMarginEur: q.minMarginEur },
      payment: { method, status: method === "invoice" ? "invoice" : "open" }, invoice: {}, printcom: {}, mails: {}, history: [],
      consent: { agbVersion: AGB_VERSION, agbAcceptedAt: nowIso(), faggNotice: true, proofConfirmed: true } };
    hist(o, "Bestellung eingegangen (" + (method === "invoice" ? "Rechnung" : "Mollie") + ")");
    fm.orderId = id; await store.putFile(fm); await store.putOrder(o);
    if (method === "mollie") {
      try { const url = await createPayment(o); hist(o, "Mollie-Zahlung " + o.payment.mollieId + " erstellt"); await store.putOrder(o); return { order: o, checkoutUrl: url }; }
      catch (e) { fm.orderId = null; await store.putFile(fm); o.status = "payment_failed"; hist(o, "Zahlung konnte nicht gestartet werden: " + e.message); await store.putOrder(o); throw Object.assign(new Error("Zahlung konnte nicht gestartet werden – bitte später erneut versuchen"), { status: 502 }); }
    }
    await submitted(o);
    return { order: o };
  }
  // Bestellung ist verbindlich (bezahlt bzw. Rechnung gewählt): Rechnungsentwurf, Vorschlag, Push, Mails – dann ggf. automatisch senden
  async function submitted(o) {
    await makeInvoice(o);
    await store.putOrder(o);
    return submittedRest(o);
  }
  // Rechnungs-ENTWURF in der eigenen Buchhaltung (fertiggestellt und gesendet wird erst beim Bestellen bei Print.com)
  async function makeInvoice(o) {
    if (!o.invoice.id && D.createInvoice) {
      try {
        const c = o.customer, name = c.type === "company" ? c.company : c.firstName + " " + c.lastName;
        const posName = o.product.title + " – " + o.copies + " Stück";
        const posText = o.labels.map(l => l[0] + ": " + l[1]).concat(["Lieferzeit: " + (URGENCY_DE[o.urgency] || o.urgency), "inkl. Versand nach " + COUNTRIES[c.country]]).join("\n");
        const r = await D.createInvoice({ contactName: name, email: c.email, uid: c.uidValid ? c.uid : "", street: c.street, zip: c.zip, city: c.city, country: c.country.toLowerCase(), contactPerson: c.type === "company" ? c.firstName + " " + c.lastName : "",
          header: "Rechnung Druckauftrag " + o.nr, reference: o.nr,
          headText: "Vielen Dank für Ihre Bestellung im FS Creative Druckshop (Bestellung " + o.nr + ")." + (o.payment.method === "mollie" && o.payment.mollieId ? " Bezahlt online – Mollie " + o.payment.mollieId + "." : ""),
          footText: (o.price.taxNote ? o.price.taxNote + "\n" : "") + (o.payment.method === "mollie" ? "Der Betrag wurde bereits online bezahlt." : "Zahlbar innerhalb von 14 Tagen ohne Abzug."),
          timeToPay: o.payment.method === "mollie" ? 0 : 14, taxRule: o.price.taxCase === "igl" ? cfg().taxRuleIgl : "",
          items: [{ name: posName, text: posText, qty: 1, priceGross: o.price.gross, taxRate: o.price.rate }] });
        o.invoice = { id: r.id, nr: r.nr || "", draft: true, at: nowIso() }; hist(o, "Rechnungsentwurf angelegt" + (r.nr ? " " + r.nr : ""));
      } catch (e) { o.invoice = { error: clip(e.message, 300) }; hist(o, "Rechnungsentwurf fehlgeschlagen: " + e.message); log("Rechnungsentwurf", o.nr, e.message); }
    }
  }
  async function submittedRest(o) {
    if (D.propose) await D.propose({ kind: "print-order", key: "print:" + o.id, title: "Druckauftrag " + o.nr + " prüfen und bei Print.com bestellen · " + (o.customer.company || o.customer.firstName + " " + o.customer.lastName),
      detail: o.product.title + " · " + o.copies + " Stk. · " + (o.payment.method === "invoice" ? "Rechnung (Freigabe nötig)" : "bezahlt") + " · Marge " + eur(o.price.margin), amount: o.price.gross, date: today(), source: "Druckshop", payload: { orderId: o.id } }).catch(e => log("Vorschlag:", e.message));
    if (D.push) D.push("lead", { title: "Neuer Druckauftrag " + o.nr, body: o.product.title + " · " + o.copies + " Stk. · " + eur(o.price.gross) + (o.payment.method === "invoice" ? " · Rechnung – Freigabe nötig" : " · bezahlt"), url: "/admin#print", tag: "print-" + o.id }).catch(() => {});
    if (!o.mails.confirm) {
      o.mails.confirm = await mail(o.customer.email, "Bestellbestätigung " + o.nr + " · FS Creative Druck", "Danke für deine Bestellung!",
        ["Hallo " + o.customer.firstName + ",", "wir haben deine Bestellung erhalten" + (o.payment.method === "mollie" ? " und die Zahlung ist eingegangen." : ". Die Rechnung bekommst du, sobald der Auftrag in Produktion geht.") + " Bevor gedruckt wird, schauen wir uns deine Druckdaten noch persönlich an – bei Fragen melden wir uns."],
        orderRows(o), ["Den Versand bestätigen wir dir mit Sendungsverfolgung per E-Mail.",
          "Es gelten unsere AGB für den Druckshop (Stand " + deDate(AGB_VERSION) + "), die du bei der Bestellung akzeptiert hast: " + cfg().publicUrl + "/print/agb",
          "Hinweis: Da die Drucksachen nach deinen Vorgaben angefertigt werden, besteht kein Rücktrittsrecht (§ 18 Abs. 1 Z 3 FAGG).",
          "Bei Fragen antworte einfach auf diese Mail."], D.notifyTo) ? nowIso() : null;
      if (D.notifyTo) await mail(D.notifyTo, "Druckshop: neue Bestellung " + o.nr + " – " + eur(o.price.gross), "Neue Bestellung im Druckshop", ["Bitte im Cockpit unter „Druckaufträge“ prüfen und bei Print.com bestellen. Einkauf " + eur(o.price.purchase.total) + ", Marge " + eur(o.price.margin) + "."], orderRows(o).concat([["E-Mail", o.customer.email], ["Telefon", o.customer.phone]].concat(o.customer.uid ? [["UID", o.customer.uid + (o.customer.uidValid ? " (gültig)" : " (nicht bestätigt)")]] : [])), [], o.customer.email);
      await store.putOrder(o);
    }
    const s = await settings();
    if (s.autoSend && o.status === "paid") { try { await placeOrder(o.id, "automatisch (Einstellung)"); } catch (e) { log("Automatisch senden", o.nr, e.message); } }
  }
  const LOCK = new Set();
  // Bei Print.com bestellen – nur per Klick im Cockpit (bzw. Einstellung „automatisch“ für bezahlte Bestellungen)
  async function placeOrder(id, by) {
    if (LOCK.has(id)) throw new Error("Wird gerade gesendet");
    LOCK.add(id);
    try {
      const o = await store.getOrder(id); if (!o) throw new Error("Bestellung nicht gefunden");
      if (!(o.status === "paid" || o.status === "invoice_requested" || (o.status === "problem" && !o.printcom.orderNumber))) throw new Error("Status „" + (STATUS_DE[o.status] || o.status) + "“ – kann nicht bestellt werden");
      const fm = await store.fileMeta(o.fileId); if (!fm) throw new Error("Druckdatei fehlt");
      const c = o.customer, base = cfg().publicUrl;
      const addr = { companyName: c.company || undefined, firstName: c.firstName, lastName: c.lastName, fullstreet: c.street, postcode: c.zip, city: c.city, country: c.country, telephone: c.phone, email: c.email };
      const body = { deDuplicationId: o.id, customerReference: o.nr, poNumber: o.nr, webhookUrl: base + "/print/printcom-webhook/" + sig("pchook", o.id) + "/" + encodeURIComponent(o.id),
        billingAddress: billingFs(),
        items: [{ sku: o.product.sku, customerReference: o.nr, options: o.pcOptions, fileUrl: base + "/print-files/" + fm.id + "/" + sig("pcfile", fm.id) + ".pdf", fileOptions: { isProduction: true }, approveDesign: true,
          senderAddress: Object.assign({}, billingFs(), { vatNr: undefined }), shipments: [{ address: addr, copies: o.copies }] }] };
      let j;
      try { j = await pcApi("POST", "/orders", body, { timeout: 60000 }); }
      catch (e) { o.status = "problem"; o.printcom.error = clip(e.message, 300); hist(o, "Print.com-Bestellung fehlgeschlagen: " + e.message); await store.putOrder(o); throw e; }
      const r = firstOf(j);
      o.printcom = { orderNumber: String(r.orderNumber || (r.items && r.items[0] && r.items[0].orderNumber) || ""), at: nowIso(), by: by || "Cockpit", total: +r.orderTotal || +r.grandTotal || null, status: String((r.items && r.items[0] && r.items[0].status) || r.status || "") };
      o.status = "ordered"; hist(o, "Bei Print.com bestellt (" + (by || "Cockpit") + ")" + (o.printcom.orderNumber ? " – Auftrag " + o.printcom.orderNumber : ""));
      await store.putOrder(o);
      // Rechnung fertigstellen und an den Kunden senden
      if (o.invoice.id && !o.invoice.sentAt && D.sendInvoice) {
        try { await D.sendInvoice(o.invoice.id, o.customer.email, "Rechnung zu deiner Druckbestellung " + o.nr + " · FS Creative",
          "Hallo " + o.customer.firstName + ",\n\ndein Druckauftrag " + o.nr + " ist jetzt in Produktion. Anbei die Rechnung" + (o.payment.method === "mollie" ? " (bereits bezahlt)." : " – zahlbar innerhalb von 14 Tagen.") + "\n\nVielen Dank!\n\nFreundliche Grüße\nSimon Felder\nFS Creative");
          o.invoice.sentAt = nowIso(); o.invoice.draft = false; hist(o, "Rechnung fertiggestellt und an " + o.customer.email + " gesendet");
        } catch (e) { o.invoice.sendError = clip(e.message, 300); hist(o, "Rechnung senden fehlgeschlagen: " + e.message); }
        await store.putOrder(o);
      }
      return o;
    } finally { LOCK.delete(id); }
  }
  async function rejectOrder(id, reason, refund) {
    const o = await store.getOrder(id); if (!o) throw new Error("Bestellung nicht gefunden");
    if (["ordered", "in_production", "shipped", "delivered"].indexOf(o.status) > -1) throw new Error("Schon bei Print.com bestellt – dort stornieren bzw. Gutschrift manuell");
    if (o.status === "rejected") throw new Error("Schon abgelehnt");
    if (refund && o.payment.method === "mollie" && o.payment.status === "paid" && !o.payment.refund) {
      const rf = await mollie("POST", "/payments/" + encodeURIComponent(o.payment.mollieId) + "/refunds", { amount: { currency: "EUR", value: o.price.gross.toFixed(2) }, description: "Erstattung Druckauftrag " + o.nr });
      o.payment.refund = { id: String(rf.id || ""), status: String(rf.status || ""), at: nowIso(), amount: o.price.gross }; hist(o, "Erstattung über Mollie veranlasst (" + eur(o.price.gross) + ")");
    }
    if (o.invoice.id && o.invoice.draft && D.deleteInvoice) { try { await D.deleteInvoice(o.invoice.id); o.invoice.deleted = nowIso(); hist(o, "Rechnungsentwurf gelöscht"); } catch (e) { o.invoice.deleteError = clip(e.message, 200); } }
    o.status = "rejected"; o.rejectReason = clip(reason, 500); hist(o, "Abgelehnt" + (reason ? ": " + reason : ""));
    await store.putOrder(o);
    if (o.status === "rejected" && o.payment.status !== "open") await mail(o.customer.email, "Deine Druckbestellung " + o.nr + " · FS Creative", "Deine Bestellung konnte leider nicht gedruckt werden",
      ["Hallo " + o.customer.firstName + ",", "leider können wir deine Bestellung " + o.nr + " so nicht in Druck geben." + (o.rejectReason ? " Grund: " + o.rejectReason : ""), o.payment.refund ? "Den Betrag von " + eur(o.price.gross) + " erstatten wir dir über den gewählten Zahlungsweg – das dauert meist ein paar Werktage." : ""].filter(Boolean),
      [], ["Melde dich gern, dann finden wir gemeinsam eine Lösung."], D.notifyTo);
    return o;
  }
  // Mollie-Webhook: nie dem Inhalt trauen, sondern die Zahlung bei Mollie abrufen
  async function mollieWebhook(paymentId) {
    if (!/^tr_[A-Za-z0-9]{4,40}$/.test(paymentId)) return;
    const pay = await mollie("GET", "/payments/" + paymentId);
    const oid = pay && pay.metadata && pay.metadata.orderId; const o = oid && await store.getOrder(String(oid));
    if (!o || (o.payment.attempts || [o.payment.mollieId]).indexOf(paymentId) < 0) { log("Webhook: unbekannte Zahlung", paymentId); return; }
    const st = String(pay.status || "");
    if (st === "paid" && o.payment.status !== "paid") {
      const amt = pay.amount && parseFloat(pay.amount.value);
      if (!(Math.abs(amt - o.price.gross) < 0.005) || (pay.amount && pay.amount.currency !== "EUR")) { o.payment.status = "mismatch"; hist(o, "Zahlung " + paymentId + " mit falschem Betrag " + (pay.amount && pay.amount.value)); await store.putOrder(o); return; }
      o.payment.status = "paid"; o.payment.mollieId = paymentId; o.payment.paidAt = String(pay.paidAt || nowIso()); o.payment.methodDetail = clip(pay.method, 40);
      if (o.status === "pending_payment" || o.status === "payment_failed") o.status = "paid";
      hist(o, "Zahlung eingegangen (Mollie " + paymentId + ")"); await store.putOrder(o);
      await submitted(o);
    } else if (["canceled", "expired", "failed"].indexOf(st) > -1 && o.payment.status !== "paid" && paymentId === o.payment.mollieId) {
      o.payment.status = st; if (o.status === "pending_payment") o.status = "payment_failed"; hist(o, "Zahlung " + st); await store.putOrder(o);
    } else if (pay.amountRefunded && parseFloat(pay.amountRefunded.value) > 0 && o.payment.refund && o.payment.refund.status !== "refunded") { o.payment.refund.status = "refunded"; await store.putOrder(o); }
  }
  // Status/Tracking bei Print.com abrufen (täglich bzw. auf Klick / Webhook von Print.com)
  const PC_DONE = { SHIPPED: "shipped", INTRANSIT: "shipped", DELIVERED: "delivered" };
  const PC_PROBLEM = /CANCELED|REFUSED|REJECTED|ERROR|RETURN/;
  async function pollOrder(o) {
    if (!o.printcom || !o.printcom.orderNumber) return o;
    const r = firstOf(await pcApi("GET", "/orders/" + encodeURIComponent(o.printcom.orderNumber)));
    const items = Array.isArray(r.items) ? r.items : [];
    const st = String((items[0] && items[0].status) || r.status || "").toUpperCase();
    const tracks = []; (Array.isArray(r.shipments) ? r.shipments : []).forEach(s => (s.tracks || []).forEach(t => { if (t && /^https?:\/\//.test(String(t.trackUrl || "")) && tracks.indexOf(t.trackUrl) < 0) tracks.push(String(t.trackUrl)); }));
    items.forEach(it => { if (it && /^https?:\/\//.test(String(it.trackingUrl || it.trackUrl || "")) && tracks.indexOf(it.trackingUrl || it.trackUrl) < 0) tracks.push(String(it.trackingUrl || it.trackUrl)); });
    const before = o.status;
    o.printcom.status = st; o.printcom.checkedAt = nowIso(); if (tracks.length) o.printcom.tracks = tracks.slice(0, 5);
    if (PC_DONE[st]) o.status = PC_DONE[st];
    else if (PC_PROBLEM.test(st)) o.status = "problem";
    else if (st && ["ordered", "problem"].indexOf(o.status) > -1) o.status = "in_production";
    if (o.status !== before) hist(o, "Print.com-Status: " + st);
    if ((o.status === "shipped" || o.status === "delivered") && !o.mails.shipped) {
      o.mails.shipped = await mail(o.customer.email, "Deine Drucksachen sind unterwegs · " + o.nr, "Deine Bestellung ist versendet",
        ["Hallo " + o.customer.firstName + ",", "deine Bestellung " + o.nr + " (" + o.product.title + ", " + o.copies + " Stk.) ist gedruckt und auf dem Weg zu dir."],
        tracks.map((t, i) => ["Sendungsverfolgung" + (tracks.length > 1 ? " " + (i + 1) : ""), t]), tracks.length ? [] : ["Die Sendungsverfolgung schicken wir dir nach, sobald sie verfügbar ist."], D.notifyTo) ? nowIso() : null;
      if (o.mails.shipped) hist(o, "Versandmail gesendet");
    }
    await store.putOrder(o);
    return o;
  }
  async function pollAll() {
    const all = await store.listOrders(); let n = 0;
    for (const o of all) {
      if (!o.printcom || !o.printcom.orderNumber) continue;
      if (o.status === "delivered" || o.status === "rejected") continue;
      if (o.status === "shipped" && o.mails.shipped && Date.now() - Date.parse(o.printcom.at) > 30 * 864e5) continue;
      try { await pollOrder(o); n++; } catch (e) { log("Status", o.nr, e.message); }
    }
    return n;
  }
  async function cleanupFiles() {
    const files = await store.listFiles(); let n = 0;
    for (const f of files) if (!f.orderId && Date.now() - Date.parse(f.createdAt) > (f.kind === "draft" ? 60 : 3) * 864e5) { await store.delFile(f.id); n++; }
    return n;
  }
  let lastDaily = 0;
  async function tick() {
    try {
      if (Date.now() - lastDaily < 20 * 3600e3) return;
      const m = (await store.getMeta("print_daily").catch(() => null)) || {};
      if (m.at && Date.now() - Date.parse(m.at) < 20 * 3600e3) { lastDaily = Date.parse(m.at); return; }
      lastDaily = Date.now(); await store.setMeta("print_daily", { at: nowIso() });
      if (cfg().pcKey) { await catalog(true).catch(() => null); await pollAll(); }
      await cleanupFiles();
    } catch (e) { log("Tageslauf:", e.message); }
  }

  // ───────────────────────── HTTP: öffentlich ─────────────────────────
  const HITS = new Map();
  function limited(bucket, ip, max, windowMs) {
    const k = bucket + "|" + ip, now = Date.now(); const a = (HITS.get(k) || []).filter(t => now - t < windowMs); a.push(now); HITS.set(k, a);
    if (HITS.size > 20000) HITS.clear(); return a.length > max;
  }
  const ipOf = req => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  function sameOrigin(req) {
    if (req.headers["x-print-shop"] !== "1") return false;
    const o = req.headers.origin; if (!o) return true;
    try { const h = new URL(o).host.toLowerCase(); return h === String(req.headers.host || "").toLowerCase() || "https://" + h === String(D.ORIGIN || "").toLowerCase(); } catch (e) { return false; }
  }
  function readBody(req, max) {
    return new Promise((resolve, reject) => {
      const len = parseInt(req.headers["content-length"] || "0", 10); if (len > max) { reject(Object.assign(new Error("Datei zu groß (max. " + Math.round(max / 1048576) + " MB)"), { status: 413 })); req.resume(); return; }
      const chunks = []; let n = 0, dead = false;
      req.on("data", c => { if (dead) return; n += c.length; if (n > max) { dead = true; reject(Object.assign(new Error("Datei zu groß (max. " + Math.round(max / 1048576) + " MB)"), { status: 413 })); req.resume(); return; } chunks.push(c); });
      req.on("end", () => { if (!dead) resolve(Buffer.concat(chunks)); }); req.on("error", e => { if (!dead) reject(e); });
    });
  }
  async function readJson(req, max) { const b = await readBody(req, max); try { return JSON.parse(b.toString("utf8") || "{}"); } catch (e) { throw Object.assign(new Error("bad_json"), { status: 400 }); } }
  function J(res, code, o) { D.send(res, code, JSON.stringify(o), "application/json; charset=utf-8", { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); }
  const orderPublic = o => ({ id: o.id, nr: o.nr, status: o.status, statusText: STATUS_DE[o.status] || o.status, product: o.product.title, copies: o.copies, labels: o.labels, gross: o.price.gross, net: o.price.net, rate: o.price.rate,
    payment: { method: o.payment.method, status: o.payment.status }, deliveryDate: o.price.deliveryDate, tracks: (o.printcom && o.printcom.tracks) || [], email: o.customer.email.replace(/^(.).*(@.*)$/, "$1…$2") });

  // Startschalter: solange PRINT_SHOP_LIVE nicht "1" ist, ist der Shop für Besucher gesperrt („Bald verfügbar“);
  // im Cockpit angemeldete Admins sehen /print als Vorschau (Banner, noindex). Webhooks und signierte Druckdateien bleiben erreichbar.
  const live = () => process.env.PRINT_SHOP_LIVE === "1";
  function soonPage(res) {
    const html = '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Bald verfügbar — FS Creative</title><link rel="stylesheet" href="/landing.css?v=4"></head><body><main id="main"><div class="wrap"><section class="lhero"><span class="eyebrow">Druck</span><h1>Bald verfügbar.</h1><p class="lead">Diese Seite ist noch nicht öffentlich. Drucksachen gestalten und drucken wir gern persönlich für dich.</p><div class="btn-row"><a class="btn primary" href="/druck">Zu Druck &amp; Print</a><a class="btn ghost" href="/kontakt?von=print&amp;thema=Druck">Anfragen</a></div></section></div></main></body></html>';
    return D.send(res, 404, html, "text/html; charset=utf-8", { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  }
  function shopPage(req, res, preview) {
    let html = ""; try { html = fs.readFileSync(path.join(__dirname, "print.html"), "utf8"); } catch (e) { return D.send(res, 404, "Not found"); }
    if (preview) html = html.replace(/<meta name="robots" content="[^"]*"\s*\/?>/, '<meta name="robots" content="noindex, nofollow" />')
      .replace(/<body([^>]*)>/, '<body$1><div role="note" style="position:fixed;left:50%;top:calc(var(--nav-h) + 8px);transform:translateX(-50%);z-index:150;background:#ffd60a;color:#1d1d1f;font-weight:700;font-size:13px;padding:6px 14px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.4)">Vorschau – nicht öffentlich (PRINT_SHOP_LIVE ist aus)</div>');
    return D.sendGz(req, res, 200, html, "text/html; charset=utf-8", { "Cache-Control": "no-cache", "X-Robots-Tag": preview ? "noindex, nofollow" : "index, follow" });
  }
  async function handlePublic(req, res, u, p) {
    const open = live(), admin = !!(D.adminAuthed && D.adminAuthed(req));
    const gated = !(p.indexOf("/print-files/") === 0 || p === "/print/mollie-webhook" || p.indexOf("/print/printcom-webhook/") === 0);
    if (gated && !open && !admin) { if (p.indexOf("/print/api/") === 0) return J(res, 404, { ok: false, error: "not_found" }); return soonPage(res); }
    if (p === "/print" || p === "/print/" || p === "/print.html") { if (p !== "/print") return D.send(res, 301, "", "text/plain", { Location: "/print" + (u.search || "") }); return shopPage(req, res, !open); }
    try {
      // Druckdatei für Print.com: nur mit Signatur und nur für echte, freigegebene Bestellungen
      let m = p.match(/^\/print-files\/(f[a-f0-9]{24})\/([a-f0-9]{40})\.pdf$/);
      if (m && (req.method === "GET" || req.method === "HEAD")) {
        if (!sigOk("pcfile", m[1], m[2])) return D.send(res, 404, "Not found");
        const fm = await store.fileMeta(m[1]); const o = fm && fm.orderId && await store.getOrder(fm.orderId);
        if (!o || ["ordered", "in_production", "shipped", "delivered", "problem", "paid", "invoice_requested"].indexOf(o.status) < 0) return D.send(res, 404, "Not found");
        const buf = await store.fileData(m[1]); if (!buf) return D.send(res, 404, "Not found");
        return D.send(res, 200, req.method === "HEAD" ? "" : buf, "application/pdf", { "Content-Length": String(buf.length), "Content-Disposition": 'inline; filename="' + o.nr + '.pdf"', "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" });
      }
      if (p === "/print/app.js" || p === "/print/designer.js" || p === "/print/templates.js") {
        let js = ""; try { js = fs.readFileSync(path.join(__dirname, "print", p.slice(7))); } catch (e) { return D.send(res, 404, "Not found"); }
        return D.sendGz(req, res, 200, js, "text/javascript; charset=utf-8", { "Cache-Control": "no-cache" });
      }
      if (p === "/print/agb.html") return D.send(res, 301, "", "text/plain", { Location: "/print/agb" });
      if ((p === "/print/agb" || p === "/print/agb/") && (req.method === "GET" || req.method === "HEAD")) {
        let html = ""; try { html = fs.readFileSync(path.join(__dirname, "print", "agb.html"), "utf8"); } catch (e) { return D.send(res, 404, "Not found"); }
        const F = Object.assign({}, FIRM_DEFAULT, (D.firm && D.firm()) || {});
        html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => k === "agbVersion" ? deDate(AGB_VERSION) : escH(F[k] != null && String(F[k]).trim() ? F[k] : FIRM_DEFAULT[k] || ""));
        return D.sendGz(req, res, 200, html, "text/html; charset=utf-8", { "Cache-Control": "no-cache" });
      }
      if (p === "/print/mollie-webhook" && req.method === "POST") {
        const b = (await readBody(req, 4096)).toString("utf8"); const id = new URLSearchParams(b).get("id") || "";
        try { await mollieWebhook(id); } catch (e) { if (e.status === 404) return D.send(res, 200, "ok"); log("Mollie-Webhook:", e.message); return D.send(res, 500, "retry"); }
        return D.send(res, 200, "ok");
      }
      m = p.match(/^\/print\/printcom-webhook\/([a-f0-9]{40})\/([A-Za-z0-9_-]{6,60})$/);
      if (m && req.method === "POST") {
        await readBody(req, 20000).catch(() => null);
        if (!sigOk("pchook", m[2], m[1])) return D.send(res, 404, "Not found");
        const o = await store.getOrder(m[2]); if (o) await pollOrder(o).catch(e => log("Print.com-Webhook:", e.message));   // Inhalt egal – Status selbst abrufen
        return D.send(res, 200, "ok");
      }
      if (p.indexOf("/print/api/") !== 0) return D.send(res, 404, "Not found");
      const ip = ipOf(req);
      if (p === "/print/api/catalog" && req.method === "GET") {
        const c = cfg(), s = await settings();
        if (!c.pcKey || !s.open) return J(res, 200, { ok: true, ready: false, reason: !c.pcKey ? "setup" : "closed" });
        const cat = await catalog(false);
        const products = publicCatalog(cat, s);
        return J(res, 200, { ok: true, ready: products.length > 0, reason: products.length ? "" : "setup", products, fonts: FONTS, agbVersion: AGB_VERSION, payments: { mollie: !!c.mollieKey, invoice: true }, countries: Object.keys(COUNTRIES).map(k => ({ code: k, name: COUNTRIES[k] })) });
      }
      m = p.match(/^\/print\/api\/file\/(f[a-f0-9]{24})$/);
      if (m && req.method === "GET") {
        if (!sigOk("file", m[1], u.searchParams.get("t"))) return J(res, 404, { ok: false, error: "not_found" });
        let fm = await store.fileMeta(m[1]); if (!fm) return J(res, 404, { ok: false, error: "not_found" });
        if (u.searchParams.get("pdf") === "1") { const buf = await store.fileData(fm.id); return D.send(res, 200, buf, "application/pdf", { "Content-Disposition": 'inline; filename="druckdaten.pdf"', "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" }); }
        fm = await preflightPoll(fm);
        return J(res, 200, Object.assign({ ok: true }, fileView(fm)));
      }
      m = p.match(/^\/print\/api\/draft\/(f[a-f0-9]{24})$/);
      if (m && req.method === "GET") {
        if (!sigOk("draft", m[1], u.searchParams.get("t"))) return J(res, 404, { ok: false, error: "Entwurf nicht gefunden" });
        const fm = await store.fileMeta(m[1]); const buf = fm && fm.kind === "draft" && await store.fileData(m[1]);
        if (!buf) return J(res, 404, { ok: false, error: "Entwurf nicht gefunden (Entwürfe werden nach 60 Tagen gelöscht)" });
        let d = null; try { d = JSON.parse(Buffer.from(buf).toString("utf8")); } catch (e) {}
        return J(res, 200, { ok: true, draft: d });
      }
      m = p.match(/^\/print\/api\/order\/([A-Za-z0-9_-]{6,60})(\/pay)?$/);
      if (m) {
        if (!sigOk("order", m[1], u.searchParams.get("t"))) return J(res, 404, { ok: false, error: "not_found" });
        const o = await store.getOrder(m[1]); if (!o) return J(res, 404, { ok: false, error: "not_found" });
        if (!m[2] && req.method === "GET") return J(res, 200, { ok: true, order: orderPublic(o) });
        if (m[2] && req.method === "POST") {
          if (!sameOrigin(req)) return J(res, 403, { ok: false, error: "forbidden" });
          if (limited("pay", ip, 10, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Versuche – bitte später erneut" });
          if (o.payment.method !== "mollie" || o.payment.status === "paid" || ["pending_payment", "payment_failed"].indexOf(o.status) < 0) return J(res, 400, { ok: false, error: "Für diese Bestellung ist keine Zahlung offen" });
          if (Date.now() - Date.parse(o.createdAt) > 3 * 864e5) return J(res, 400, { ok: false, error: "Die Bestellung ist zu alt – bitte neu bestellen" });
          o.status = "pending_payment"; const url = await createPayment(o); hist(o, "Neuer Zahlungsversuch " + o.payment.mollieId); await store.putOrder(o);
          return J(res, 200, { ok: true, checkoutUrl: url });
        }
        return J(res, 405, { ok: false, error: "method_not_allowed" });
      }
      if (req.method !== "POST") return J(res, 405, { ok: false, error: "method_not_allowed" });
      if (!sameOrigin(req)) return J(res, 403, { ok: false, error: "forbidden" });
      if (!cfg().pcKey) return J(res, 503, { ok: false, error: "Der Shop wird gerade eingerichtet" });
      if (p === "/print/api/price") {
        if (limited("price", ip, 240, 600e3)) return J(res, 429, { ok: false, error: "Zu viele Anfragen – bitte kurz warten" });
        const b = await readJson(req, 20000);
        const cat = await catalog(false), s = await settings(); const prod = productOf(cat, String(b.product || ""), s); if (!prod) return J(res, 400, { ok: false, error: "Produkt nicht verfügbar" });
        const n = normalizeSel(prod, b);
        const country = String(b.country || "AT").toUpperCase(), zip = String(b.zip || "").trim();
        const cust = { company: b.customerType === "company", uid: String(b.uid || "") };
        if (cust.company && cust.uid && country !== "AT") { const r = await uidCheck(cust.uid); cust.uidValid = r.valid; }
        const q = await quote(prod, n, country, COUNTRIES[country] && PLZ[country].test(zip) ? zip : "", cust);
        return J(res, 200, { ok: true, price: publicPrice(q), sides: n.sides, size: n.size, bleed: prod.bleed });
      }
      if (p === "/print/api/uid") {
        if (limited("uid", ip, 30, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Anfragen – bitte später erneut" });
        const b = await readJson(req, 2000); const r = await uidCheck(String(b.uid || ""));
        return J(res, 200, { ok: true, valid: r.valid, uid: r.uid, name: r.name || "", why: r.why || "" });
      }
      if (p === "/print/api/upload") {
        if (limited("upload", ip, 30, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Uploads – bitte später erneut" });
        let input; try { input = JSON.parse(decodeURIComponent(String(req.headers["x-print-config"] || ""))); } catch (e) { input = null; }
        if (!input || typeof input !== "object") { req.resume(); return J(res, 400, { ok: false, error: "Konfiguration fehlt" }); }
        const name = clip(decodeURIComponent(String(req.headers["x-file-name"] || "druck")), 120).replace(/[\\/:*?"<>|]/g, "_");
        await targetOf(input).catch(e => { req.resume(); throw e; });
        const buf = await readBody(req, MAX_UPLOAD); if (buf.length < 100) return J(res, 400, { ok: false, error: "Datei ist leer" });
        const meta = await handleUpload(buf, name, input);
        return J(res, 200, Object.assign({ ok: true }, fileView(meta)));
      }
      if (p === "/print/api/design") {
        if (limited("upload", ip, 30, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Versuche – bitte später erneut" });
        const b = await readJson(req, MAX_UPLOAD);
        const meta = await handleDesign(b);
        return J(res, 200, Object.assign({ ok: true }, fileView(meta)));
      }
      if (p === "/print/api/draft") {
        if (limited("draft", ip, 30, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Entwürfe – bitte später erneut" });
        const b = await readJson(req, 25 * 1024 * 1024);
        const data = JSON.stringify({ product: clip(b.product, 40), sel: b.sel && typeof b.sel === "object" ? b.sel : {}, copies: b.copies, urgency: clip(b.urgency, 20), design: b.design });
        if (data.length > 25 * 1024 * 1024) return J(res, 413, { ok: false, error: "Entwurf zu groß" });
        const meta = { id: "f" + crypto.randomBytes(12).toString("hex"), kind: "draft", name: "entwurf.json", bytes: data.length, createdAt: nowIso(), orderId: null };
        await store.putFile(meta, Buffer.from(data, "utf8"));
        return J(res, 200, { ok: true, id: meta.id, token: sig("draft", meta.id), url: cfg().publicUrl + "/print?entwurf=" + meta.id + "&t=" + sig("draft", meta.id) });
      }
      if (p === "/print/api/order") {
        if (limited("order", ip, 20, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Bestellversuche – bitte später erneut" });
        const b = await readJson(req, 40000);
        const r = await createOrder(b);
        if (r.priceChanged) return J(res, 409, { ok: false, error: "Der Preis hat sich geändert – bitte prüfen und erneut bestellen", price: r.price });
        const o = r.order;
        return J(res, 200, { ok: true, orderId: o.id, nr: o.nr, token: sig("order", o.id), checkoutUrl: r.checkoutUrl || null });
      }
      return J(res, 404, { ok: false, error: "not_found" });
    } catch (e) {
      const code = e.status && e.status >= 400 && e.status < 600 ? (e.status === 401 || e.status === 403 ? 502 : e.status) : 500;
      if (code >= 500) log(p, e.message);
      return J(res, code, { ok: false, error: code === 500 ? "Interner Fehler – bitte später erneut versuchen" : String(e.message || e).slice(0, 300), fields: e.fields });
    }
  }

  // ───────────────────────── HTTP: Cockpit (/admin/api/print/…) ─────────────────────────
  function orderSummary(o) {
    return { id: o.id, nr: o.nr, createdAt: o.createdAt, updatedAt: o.updatedAt, status: o.status, statusText: STATUS_DE[o.status] || o.status, review: !!REVIEW[o.status], product: o.product.title, copies: o.copies,
      customer: o.customer.company || (o.customer.firstName + " " + o.customer.lastName), country: o.customer.country, gross: o.price.gross, net: o.price.net, margin: o.price.margin, purchase: o.price.purchase && o.price.purchase.total,
      payment: o.payment.method, paymentStatus: o.payment.status, pcOrder: o.printcom && o.printcom.orderNumber || "", warn: (o.fileChecks || []).some(c => c.level !== "ok") };
  }
  async function adminState() {
    const c = cfg(), s = await settings();
    const orders = await store.listOrders();
    const cat = c.pcKey ? await catalog(false).catch(() => null) : null;
    return { ok: true, live: live(), configured: { printcom: !!c.pcKey, mollie: !!c.mollieKey, preflight: c.preflight, db: useDb(), base: c.pcBase }, defaults: { markupPct: c.markup, minMarginEur: c.minMargin },
      settings: s, catalog: cat ? { at: cat.at, errors: cat.errors || [], products: (cat.products || []).map(p => ({ key: p.key, title: p.title, sku: p.sku, props: p.props.map(x => ({ slug: x.slug, title: x.title, options: x.options.map(o => ({ slug: o.slug, name: o.name })) })), tiers: p.tiers })) } : null,
      curated: CURATED.map(x => ({ key: x.key, title: x.title })), review: orders.filter(o => REVIEW[o.status]).length, orders: orders.slice(0, 300).map(orderSummary) };
  }
  async function handleAdmin(req, res, u, p) {
    try {
      if (p === "/admin/api/print/state" && req.method === "GET") return J(res, 200, await adminState());
      if (p === "/admin/api/print/order" && req.method === "GET") {
        const o = await store.getOrder(String(u.searchParams.get("id") || "")); if (!o) return J(res, 404, { ok: false, error: "Bestellung nicht gefunden" });
        const fm = await store.fileMeta(o.fileId);
        return J(res, 200, { ok: true, order: o, file: fm ? { id: fm.id, name: fm.name, kind: fm.kind, bytes: fm.bytes, pages: fm.pages, checks: fm.checks, preflight: fm.preflight || null, dpi: fm.dpi || null } : null, statusText: STATUS_DE[o.status] || o.status, autoSend: (await settings()).autoSend });
      }
      // Print.com-Sortiment (nur lesend): alle Produkte bzw. ein Produkt mit Eigenschaften – zum Auswählen fürs Shop-Sortiment
      if (p === "/admin/api/print/pcproducts" && req.method === "GET") {
        const sku = String(u.searchParams.get("sku") || "");
        if (sku) { if (!/^[a-z0-9_-]{1,80}$/i.test(sku)) return J(res, 400, { ok: false, error: "sku" }); const pd = await pcApi("GET", "/products/" + encodeURIComponent(sku) + "?view=reseller"); return J(res, 200, { ok: true, product: { sku, bleed: pd.bleed, properties: (pd.properties || []).map(x => ({ slug: x.slug, title: x.title, required: x.required, locked: x.locked, options: (x.options || []).slice(0, 80).map(o => ({ slug: o.slug, name: o.name, width: o.width, height: o.height })) })) } }); }
        const list = await pcApi("GET", "/products"); const items = Array.isArray(list) ? list : (list && (list.items || list.results)) || [];
        return J(res, 200, { ok: true, count: items.length, products: items.map(x => ({ sku: x.sku, title: x.titleSingle || x.titlePlural || x.title || "", plural: x.titlePlural || "", active: x.active, category: x.category || x.categoryName || "" })) });
      }
      if (p === "/admin/api/print/file" && req.method === "GET") {
        const o = await store.getOrder(String(u.searchParams.get("id") || "")); const buf = o && await store.fileData(o.fileId);
        if (!buf) return D.send(res, 404, "Datei nicht gefunden");
        return D.send(res, 200, buf, "application/pdf", { "Content-Disposition": 'inline; filename="' + o.nr + '.pdf"', "Cache-Control": "private, no-store" });
      }
      if (req.method !== "POST") return J(res, 405, { ok: false, error: "method_not_allowed" });
      const b = await readJson(req, 100000);
      // Einkaufspreis testen (nur lesend, keine Bestellung): beliebige SKU + Optionen
      if (p === "/admin/api/print/pcprice") {
        const sku = String(b.sku || ""); if (!/^[a-z0-9_-]{1,80}$/i.test(sku)) return J(res, 400, { ok: false, error: "sku" });
        try { const pr = await pcApi("POST", "/products/" + encodeURIComponent(sku) + "/price", { sku, options: b.options || {}, deliveryPromise: 0 }); return J(res, 200, { ok: true, price: pr }); }
        catch (e) { return J(res, 200, { ok: false, error: e.message, detail: e.detail || null }); }
      }
      if (p === "/admin/api/print/settings") { const s = await saveSettings(b); PRICE_CACHE.clear(); return J(res, 200, { ok: true, settings: s }); }
      if (p === "/admin/api/print/catalog") { const cat = await catalog(true); return J(res, 200, { ok: true, at: cat && cat.at, errors: (cat && cat.errors) || [], count: cat && cat.products ? cat.products.length : 0 }); }
      if (p === "/admin/api/print/op") {
        if (b.confirm !== true) return J(res, 400, { ok: false, error: "Bestätigung fehlt" });
        const id = String(b.id || ""); const op = String(b.op || "");
        if (op === "place") { const o = await placeOrder(id, "Cockpit"); return J(res, 200, { ok: true, order: o }); }
        if (op === "reject") { const o = await rejectOrder(id, b.reason, b.refund !== false); return J(res, 200, { ok: true, order: o }); }
        if (op === "poll") { const o = await store.getOrder(id); if (!o) throw new Error("Bestellung nicht gefunden"); return J(res, 200, { ok: true, order: await pollOrder(o) }); }
        if (op === "pollAll") return J(res, 200, { ok: true, polled: await pollAll() });
        if (op === "requote") {
          const o = await store.getOrder(id); if (!o) throw new Error("Bestellung nicht gefunden");
          const cat = await catalog(false), prod = cat && (cat.products || []).find(x => x.key === o.product.key);
          if (!prod) throw new Error("Produkt nicht mehr im Katalog");
          PRICE_CACHE.clear(); const buy = await purchase(Object.assign({}, prod, { sku: o.product.sku }), { pcOpts: o.pcOptions, urgency: o.urgency }, o.customer.country, o.customer.zip);
          o.price.liveCheck = { at: nowIso(), total: buy.total, product: buy.product, shipping: buy.shipping, margin: r2(o.price.net - buy.total) }; hist(o, "Einkaufspreis neu geprüft: " + eur(buy.total)); await store.putOrder(o);
          return J(res, 200, { ok: true, order: o });
        }
        if (op === "invoice") { const o = await store.getOrder(id); if (!o) throw new Error("Bestellung nicht gefunden"); if (o.invoice.id) throw new Error("Rechnungsentwurf existiert schon"); o.invoice = {}; await makeInvoice(o); await store.putOrder(o); if (o.invoice.error) throw new Error(o.invoice.error); return J(res, 200, { ok: true, order: o }); }
        if (op === "note") { const o = await store.getOrder(id); if (!o) throw new Error("Bestellung nicht gefunden"); o.note = clip(b.note, 2000); await store.putOrder(o); return J(res, 200, { ok: true, order: o }); }
        return J(res, 400, { ok: false, error: "unbekannte Aktion" });
      }
      return J(res, 404, { ok: false, error: "not_found" });
    } catch (e) { return J(res, 200, { ok: false, error: String(e.message || e).slice(0, 300) }); }
  }

  // für „Zur Prüfung“: Vorschlag gültig, solange die Bestellung noch auf die Freigabe wartet
  async function proposalValid(orderId) { const o = await store.getOrder(orderId); return !!o && !!REVIEW[o.status]; }

  return { live, handlePublic, handleAdmin, tick, placeOrder, proposalValid, catalog, _test: { taxFor, pdfInfo, svgSafe, imgDims, sniff, dimsOf, cmyk, svgPagesToPdf, FONTS, AGB_VERSION } };
};
