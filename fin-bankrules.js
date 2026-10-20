"use strict";
// Bankregeln (wie sevDesk „Regeln“): offene Bankumsätze automatisch verarbeiten, wenn Name/Verwendungszweck/Betrag/Konto passen.
// Aktionen: privat (Entnahme/Einlage), Geldtransit (eigene Konten) oder Beleg anlegen (Kategorie + Steuersatz) und gleich zuordnen.
// Läuft nach Kontoauszug-Import und Mollie-Abruf – dann wird NUR vorgeschlagen („Zur Prüfung“, fin-proposals.js), gebucht wird erst
// nach Bestätigung. Sofort angewendet wird nur auf Klick („Jetzt anwenden“ / „Übernehmen“ im Regel-Dialog). Nur offene, nicht zugeordnete Umsätze.
// Reverse Charge (act.rc): ausländische Leistung, Rechnung mit 0 % (UID hinterlegt) → Beleg mit Steuerregel 12 (Drittland) bzw. 14 (EU)
// Steuerliche Regel (act.taxRule, geht vor act.rc): 9 Vorsteuer, 10 keine Vorsteuer, 8 ig. Erwerb (Ware aus der EU), 14/12 RC EU/Drittland, 13 RC ohne Vorsteuer –
// bei 8/12/13/14 steht keine österr. USt auf der Rechnung → Position 0 %, die UVA rechnet die 20 % selbst.
// = „Reverse Charge mit Vorsteuer“ – steuer-calc.js meldet das als KZ 057 (20 % Steuerschuld § 19 Abs. 1) und KZ 066 (gleiche Vorsteuer).
const CALC = require("./admin-cockpit/steuer-calc.js");
// ISO-3166-Zifferncode am Ende von Kartenumsätzen (Erste/George: „… SAN FRANCISCO 94104 840 SPESEN: 1,79 KURS: 1,128“)
const NUM_CC = { "040": "AT", "840": "US", "372": "IE", "276": "DE", "528": "NL", "442": "LU", "826": "GB", "756": "CH", "250": "FR", "380": "IT", "724": "ES", "203": "CZ", "752": "SE", "208": "DK", "056": "BE", "616": "PL", "036": "AU", "124": "CA", "620": "PT", "246": "FI", "470": "MT", "196": "CY" };
// bekannte Anbieter → Lieferantenname für den Beleg (Kartenumsätze haben nur den gekürzten Händlernamen)
const KNOWN = [[/railway/i, "Railway Corporation"], [/github/i, "GitHub, Inc."], [/anthropic|claude/i, "Anthropic, PBC"], [/google/i, "Google Ireland Ltd."], [/facebk|facebook|meta ?platf/i, "Meta Platforms Ireland Ltd."], [/adobe/i, "Adobe Systems Software Ireland Ltd."], [/apple\.com|apple/i, "Apple Distribution International Ltd."], [/\bunity\b/i, "Unity Technologies"], [/beds24/i, "Beds24"], [/world4you/i, "World4You Internet Services GmbH"], [/openai|chatgpt/i, "OpenAI"], [/cloudflare/i, "Cloudflare, Inc."], [/figma/i, "Figma, Inc."], [/canva/i, "Canva Pty Ltd"], [/spotify/i, "Spotify AB"]];
const TR_OK = ["8", "9", "10", "12", "13", "14"], TR_ZERO = ["8", "12", "13", "14"], TR_RC = ["12", "13", "14"];
const TR_NAME = { "8": "ig. Erwerb", "9": "Vorsteuer", "10": "keine Vorsteuer", "12": "Reverse Charge Drittland", "13": "Reverse Charge ohne Vorsteuer", "14": "Reverse Charge EU" };
const trOf = v => String(v && v.taxRule && v.taxRule.id != null ? v.taxRule.id : (v && v.taxRule) || "");
module.exports = function (D) {
  const { L, getMeta, setMeta } = D;
  const P = () => (typeof D.P === "function" ? D.P() : D.P) || null;   // Vorschläge (fin-proposals.js)
  let RULES = null;
  const low = s => String(s || "").toLowerCase(), day = v => String(v || "").slice(0, 10), r2 = n => Math.round((+n || 0) * 100) / 100;
  const num = s => +String(s || "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".") || 0;
  // Kartenumsatz zerlegen: „E-COMM 105,82 USD K1 01.10. 04:17 RAILWAY SAN FRANCISCO 94104 840 SPESEN: 1,79 KURS: 1,128“
  function card(p) {
    p = String(p || "").replace(/\s+/g, " ").trim(); const m = p.match(/\b\d{2}\.\d{2}\.?\s+\d{1,2}:\d{2}\s+(.+)$/); if (!m) return null;
    const toks = m[1].replace(/\s+(SPESEN|KURS|ENTGELT)\b.*$/i, "").trim().split(" "); let numCc = "";
    while (toks.length > 1 && /^\d+$/.test(toks[toks.length - 1])) { const x = toks.pop(); if (!numCc && x.length === 3 && NUM_CC[x]) numCc = x; }
    const zi = toks.findIndex((x, i) => i > 0 && /^\d{3,}$/.test(x)); if (zi > 0) toks.length = zi;   // Händler endet vor der PLZ („SHELL 6700 BLUDENZ“)
    const text = toks.join(" "), h = p.match(/\s([A-Z]{2,3})\s+K\d\b/), cur = h && h[1].length === 3 ? h[1] : "", sp = p.match(/SPESEN:?\s*(\d+(?:[.,]\d{1,2})?)/i);
    let w = toks.map(x => x.replace(/^[*,.\-]+|[*,.\-]+$/g, "")).filter(Boolean); if (!w.length) return null;
    const key = low(w[0].length < 4 && w[1] ? w[0] + " " + w[1] : w[0]);
    return { merchant: text.slice(0, 22).trim(), key, cc: (h && h[1].length === 2 ? h[1] : "") || NUM_CC[numCc] || "", cur: cur === "EUR" ? "" : cur, spesen: sp ? num(sp[1]) : 0 };
  }
  const legal = s => String(s || "").replace(/\s+/g, " ").trim().replace(/[ ,]+(gmbh( & co\.? kg)?|ag|kg|og|e\.?\s?u\.?|ltd\.?|limited|inc\.?|llc|b\.?v\.?|s\.?a\.?|se|plc|pbc|corp(oration)?\.?|co\.?)$/i, "").trim();
  // Händler-Schlüssel eines Umsatzes: bei Kartenzahlung aus dem Zweck, sonst Name des Zahlungsempfängers
  function merchantOf(t) {
    const c = card(t.paymtPurpose); if (c) return { key: "k:" + c.key, kw: c.key, field: "purpose", label: c.merchant, card: c };
    const n = legal(t.payeePayerName); if (n.length < 3) return null;
    return { key: "n:" + low(n), kw: low(n), field: "name", label: n, card: null };
  }
  const knownName = s => { const k = KNOWN.find(x => x[0].test(s || "")); return k ? k[1] : ""; };
  const titleCase = s => String(s || "").toLowerCase().replace(/(^|[\s\-*])([a-zäöü])/g, (m, a, b) => a + b.toUpperCase());
  // Land des Leisters: Kartenumsatz (Länderkürzel/ISO-Code), sonst bekannter Anbieter (steuer-calc FOREIGN)
  function countryOf(t, supplier) { const c = card(t.paymtPurpose); return (c && c.cc) || CALC.supplierCountry({ supplier: supplier || t.payeePayerName || "" }) || ""; }
  function feeCategory(fallback) { const a = L.get("AccountingType", "74"); if (a) return "74"; const x = L.all("AccountingType").find(y => /kartengeb|kontof(ü|ue)hrung|bankspesen|bankgeb|geldverkehr/i.test(String(y.name || ""))); return x ? String(x.id) : String(fallback || ""); }
  async function load() { if (!RULES) RULES = (await getMeta("bankRules").catch(() => null)) || []; return RULES; }
  async function save() { await setMeta("bankRules", RULES); }
  const terms = s => String(s || "").split(/[;,\n]/).map(x => x.trim().toLowerCase()).filter(Boolean);
  function matches(r, t) {
    const c = r.cond || {}, amt = +t.amount || 0; let any = false;
    const has = (f, hay) => { const x = terms(f); if (!x.length) return true; any = true; return x.some(k => hay.indexOf(k) > -1); };
    if (!has(c.name, low(t.payeePayerName))) return false;
    if (!has(c.purpose, low(t.paymtPurpose).replace(/\s+/g, " "))) return false;
    if (c.dir === "in" && amt <= 0) return false; if (c.dir === "out" && amt >= 0) return false;
    if (c.min !== "" && c.min != null && Math.abs(amt) < +c.min - 0.004) return false;
    if (c.max !== "" && c.max != null && Math.abs(amt) > +c.max + 0.004) return false;
    if (c.account && String((t.checkAccount || {}).id) !== String(c.account)) return false;
    return any;   // nur Name/Zweck zählen als echte Bedingung – „alles“ gibt es nicht
  }
  function open() { const linked = new Set(L.all("CheckAccountTransactionLog").map(l => l.checkAccountTransaction && String(l.checkAccountTransaction.id)).filter(Boolean));
    return L.all("CheckAccountTransaction").filter(t => String(t.status) === "100" && !t.transitWith && !t.cashKind && !linked.has(String(t.id))); }
  async function applyOne(r, t) {
    const a = r.act || {}, amt = +t.amount || 0;
    if (a.type === "privat") { t.status = "300"; t.privat = amt < 0 ? "Entnahme" : "Einlage"; t.ruleId = r.id; await L.save("CheckAccountTransaction", t); return "privat"; }
    if (a.type === "done") { t.status = "350"; t.ruleId = r.id; t.doneNote = r.name; await L.save("CheckAccountTransaction", t); return "erledigt"; }   // z. B. 0-€-Abschlussbuchung der Bank: nur Info, nichts zu buchen
    if (a.type === "transit") { t.status = "400"; t.transitWith = "regel:" + r.id; t.ruleId = r.id; await L.save("CheckAccountTransaction", t); return "transit"; }
    if (a.type === "beleg") {
      const tr0 = amt < 0 && TR_OK.indexOf(String(a.taxRule || "")) > -1 ? String(a.taxRule) : "", rcAuto = !tr0 && !!a.rc && amt < 0, rc = rcAuto || TR_RC.indexOf(tr0) > -1;
      const rate = rc || TR_ZERO.indexOf(tr0) > -1 ? 0 : ([0, 10, 13, 20].indexOf(+a.rate) > -1 ? +a.rate : 20), gross = r2(Math.abs(amt)), c = card(t.paymtPurpose), d = day(t.valueDate);
      // Fremdwährungsspesen der Bank (Kartenzahlung „SPESEN: 1,79“): eigener Beleg 0 % ohne Reverse Charge, Rest ist die Leistung
      const fee = amt < 0 && c && c.spesen > 0 && c.spesen < gross ? r2(c.spesen) : 0, main = r2(gross - fee);
      const supplier = a.supplier || knownName((c && c.merchant) + " " + (t.payeePayerName || "")) || legal(t.payeePayerName) || (c ? titleCase(c.merchant) : "");
      const cc = rc ? countryOf(t, supplier) : "", eu = !!cc && cc !== "AT" && CALC.isEU(cc), purpose = String(t.paymtPurpose || "").replace(/\s+/g, " ").trim(), tr = rcAuto ? (eu ? "14" : "12") : tr0;
      const body = { voucher: { supplierName: supplier, description: (a.desc || "") + (a.desc ? " – " : "") + purpose.slice(0, 160), voucherDate: d, creditDebit: amt < 0 ? "C" : "D", status: "100", voucherType: "VOU", taxType: "default", fromRule: r.id },
        voucherPosSave: [{ accountingType: a.category ? { id: String(a.category), objectName: "AccountingType" } : undefined, taxRate: String(rate), sumGross: String(main), net: "false", comment: "per Regel „" + r.name + "“" + (rc ? " · Reverse Charge 20 % (§ 19 Abs. 1 UStG)" : tr === "8" ? " · ig. Erwerb 20 % (Art. 1 UStG)" : "") }] };
      // Steuerregel 12 = RC mit Vorsteuer (Drittland), 14 = RC mit Vorsteuer (EU) → UVA KZ 057 + KZ 066 (steuer-calc RULE_IN_DEFAULT)
      if (tr) body.voucher.taxRule = { id: tr, objectName: "TaxRule" };
      if (rc) Object.assign(body.voucher, { reverseCharge: true, rcCountry: cc, taxText: "Reverse Charge – Steuerschuld geht auf den Leistungsempfänger über (§ 19 Abs. 1 UStG), 20 %" });
      const v = (await L.request("POST", "/Voucher/Factory/saveVoucher", { body })).objects.voucher;
      await L.request("PUT", "/Voucher/" + v.id + "/bookAmount", { body: { amount: main, date: d, checkAccountTransaction: { id: String(t.id) } } });
      if (fee) {
        const acc = t.checkAccount && L.get("CheckAccount", t.checkAccount.id), cat = feeCategory(a.category);
        const fb = { voucher: { supplierName: (acc && acc.name) || "Bank", description: "Fremdwährungsspesen Karte – " + purpose.slice(0, 160), voucherDate: d, creditDebit: "C", status: "100", voucherType: "VOU", taxType: "default", fromRule: r.id },
          voucherPosSave: [{ accountingType: cat ? { id: cat, objectName: "AccountingType" } : undefined, taxRate: "0", sumGross: String(fee), net: "false", comment: "Kartengebühr laut Umsatz (SPESEN) – steuerfreie Bankleistung, keine Vorsteuer" }] };
        const fv = (await L.request("POST", "/Voucher/Factory/saveVoucher", { body: fb })).objects.voucher;
        await L.request("PUT", "/Voucher/" + fv.id + "/bookAmount", { body: { amount: fee, date: d, checkAccountTransaction: { id: String(t.id) } } });
      }
      return "beleg";
    }
    return "";
  }
  function catName(id) { const a = id && L.get("AccountingType", id); return a ? a.name || "" : ""; }
  function actLabel(r, t) {
    const a = r.act || {}, amt = +t.amount || 0;
    if (a.type === "privat") return amt < 0 ? "Privatentnahme" : "Privateinlage";
    if (a.type === "done") return "Als erledigt markieren";
    if (a.type === "transit") return "Geldtransit (eigene Konten)";
    if (a.type === "beleg") { const tr = amt < 0 && TR_OK.indexOf(String(a.taxRule || "")) > -1 ? String(a.taxRule) : "";
      return "Beleg anlegen: " + (catName(a.category) || "Kategorie " + a.category) + " · " + (tr ? TR_NAME[tr] + (TR_ZERO.indexOf(tr) > -1 ? "" : " " + (+a.rate || 0) + " %") : a.rc && amt < 0 ? "Reverse Charge" : (+a.rate || 0) + " %") + (a.supplier ? " · " + a.supplier : ""); }
    return a.type || "";
  }
  // alle aktiven Regeln auf offene Umsätze (oder eine Regel auf alle offenen) – erste passende Regel gewinnt.
  // Ohne opt.apply (= automatischer Lauf nach Import/Abruf) wird nichts gebucht, sondern je Umsatz ein Vorschlag angelegt.
  async function run(onlyId, opt) {
    await load(); const act = RULES.filter(r => onlyId ? r.id === onlyId : r.active); if (!act.length) return { done: 0, proposed: 0 };
    const apply = !!(opt && opt.apply), prop = P();
    let done = 0, proposed = 0; const by = {};
    for (const t of open()) {
      const r = act.find(x => matches(x, t)); if (!r) continue;
      if (!apply) {
        if (!prop) continue;
        try { if (await prop.add({ kind: "rule", key: "rule:" + r.id + ":" + t.id, txId: String(t.id), title: actLabel(r, t), detail: (t.payeePayerName || "") + (t.paymtPurpose ? " · " + String(t.paymtPurpose).replace(/\s+/g, " ").slice(0, 140) : ""), amount: r2(t.amount), date: day(t.valueDate), source: "Bankregel „" + r.name + "“", payload: { ruleId: r.id, txId: String(t.id) } })) proposed++; } catch (e) { console.error("Bankregel-Vorschlag", r.name, e.message); }
        continue;
      }
      try { const k = await applyOne(r, t); if (k) { done++; by[k] = (by[k] || 0) + 1; r.hits = (r.hits || 0) + 1; r.lastHit = new Date().toISOString(); } } catch (e) { console.error("Bankregel", r.name, e.message); }
    }
    if (done) await save();
    return { done, by, proposed };
  }
  const isOpen = t => !!t && open().some(x => String(x.id) === String(t.id));
  // Vorschlag bestätigen: genau das, was früher automatisch passiert ist (applyOne mit der Regel)
  async function acceptProposal(pl) {
    await load(); const r = RULES.find(x => x.id === pl.ruleId); if (!r) throw new Error("Die Regel gibt es nicht mehr");
    const t = L.get("CheckAccountTransaction", pl.txId); if (!isOpen(t)) throw new Error("Der Umsatz ist nicht mehr offen");
    const k = await applyOne(r, t); if (k) { r.hits = (r.hits || 0) + 1; r.lastHit = new Date().toISOString(); await save(); }
    return k;
  }
  // „Wie zuletzt“: Beleg wie beim letzten Umsatz desselben Händlers (Kategorie, Steuersatz, Lieferant, Reverse Charge) – nur auf Klick
  async function likeApply(txId, a) {
    const t = L.get("CheckAccountTransaction", txId); if (!isOpen(t)) throw new Error("Der Umsatz ist nicht mehr offen");
    if (a && a.type === "privat") return applyOne({ id: "", name: "wie zuletzt", act: { type: "privat" } }, t);
    if (!a || !a.category) throw new Error("Kategorie fehlt");
    return applyOne({ id: "", name: "wie zuletzt", act: { type: "beleg", category: String(a.category), rate: [0, 10, 13, 20].indexOf(+a.rate) > -1 ? +a.rate : 20, rc: !!a.rc, taxRule: TR_OK.indexOf(String(a.taxRule || "")) > -1 ? String(a.taxRule) : "", supplier: String(a.supplier || "").slice(0, 120), desc: "" } }, t);
  }
  // wie wurde derselbe Händler/Zahler früher behandelt? (letzter gebuchter Beleg + wie oft privat)
  function likeLast(t) {
    const m = merchantOf(t); if (!m) return null;
    const h = history()[m.key], dir = +t.amount < 0 ? "out" : "in";
    const priv = L.all("CheckAccountTransaction").filter(x => String(x.status) === "300" && String(x.id) !== String(t.id) && (+x.amount < 0 ? "out" : "in") === dir && (merchantOf(x) || {}).key === m.key);
    return { key: m.key, label: m.label, prev: h && h.dir === dir ? Object.assign({ catName: catName(h.category) }, h) : null, privat: priv.length, privatLast: priv.map(x => day(x.valueDate)).sort().pop() || "" };
  }
  function clean(r) {
    const c = r.cond || {}, a = r.act || {}, n = v => v === "" || v == null || !isFinite(+v) ? "" : r2(Math.abs(+v));
    return { id: r.id || ("b" + Date.now().toString(36)), name: String(r.name || "Regel").slice(0, 80), active: r.active !== false,
      cond: { name: String(c.name || "").slice(0, 300), purpose: String(c.purpose || "").slice(0, 300), dir: ["in", "out"].indexOf(c.dir) > -1 ? c.dir : "", min: n(c.min), max: n(c.max), account: String(c.account || "").slice(0, 40) },
      act: { type: ["privat", "transit", "beleg", "done"].indexOf(a.type) > -1 ? a.type : "", category: String(a.category || "").slice(0, 40), rate: [0, 10, 13, 20].indexOf(+a.rate) > -1 ? +a.rate : 20, supplier: String(a.supplier || "").slice(0, 120), desc: String(a.desc || "").slice(0, 120), rc: a.type === "beleg" && (a.rc === true || a.rc === "true" || a.rc === 1 || a.taxRule === "rc") && TR_OK.indexOf(String(a.taxRule || "")) < 0,
        taxRule: a.type === "beleg" && TR_OK.indexOf(String(a.taxRule || "")) > -1 ? String(a.taxRule) : "" },
      hits: +r.hits || 0, lastHit: r.lastHit || null };
  }
  // Regel-Vorschläge: offene Umsätze nach Händler gruppieren und nachsehen, wie derselbe Händler früher gebucht wurde
  const isRcVoucher = v => !!v && (v.reverseCharge === true || ["12", "13", "14"].indexOf(String(v.taxRule && v.taxRule.id != null ? v.taxRule.id : v.taxRule || "")) > -1);
  function history() {
    const by = {};
    for (const l of L.all("CheckAccountTransactionLog")) {
      if (!l.object || l.object.objectName !== "Voucher" || !l.checkAccountTransaction) continue;
      const t = L.get("CheckAccountTransaction", l.checkAccountTransaction.id), v = L.get("Voucher", l.object.id); if (!t || !v) continue;
      const m = merchantOf(t); if (!m) continue;
      const p = L.positionsOf("Voucher", v.id).filter(x => x.accountingType && x.accountingType.id).sort((x, y) => Math.abs(+y.sumGross || 0) - Math.abs(+x.sumGross || 0))[0]; if (!p) continue;   // größte Position (nicht die Spesen)
      const h = { date: day(t.valueDate), category: String(p.accountingType.id), rate: +p.taxRate || 0, supplier: v.supplierName || "", rc: isRcVoucher(v), taxRule: TR_OK.indexOf(trOf(v)) > -1 ? trOf(v) : "", voucherId: String(v.id), dir: +t.amount < 0 ? "out" : "in" };
      const o = by[m.key]; if (!o || h.date > o.date) by[m.key] = h;
    }
    return by;
  }
  function suggest() {
    const act = (RULES || []).filter(r => r.active), hist = history(), groups = {};
    for (const t of open()) {
      if (act.some(r => matches(r, t))) continue;   // schon von einer Regel erfasst
      const m = merchantOf(t); if (!m) continue; const amt = +t.amount || 0; if (!amt) continue;
      const k = m.key + (amt < 0 ? ":out" : ":in"), g = groups[k] = groups[k] || { m, dir: amt < 0 ? "out" : "in", tx: [] }; g.tx.push(t);
    }
    const cats = {}; L.all("AccountingType").forEach(a => { cats[String(a.id)] = a.name || ""; });
    const out = Object.keys(groups).map(k => {
      const g = groups[k], m = g.m, t0 = g.tx[0], h = hist[m.key] && hist[m.key].dir === g.dir ? hist[m.key] : null;
      const supplier = (h && h.supplier) || knownName(m.label + " " + (t0.payeePayerName || "")) || (m.card ? titleCase(m.card.merchant) : m.label);
      const cc = (m.card && m.card.cc) || CALC.supplierCountry({ supplier }) || "", fx = !!(m.card && m.card.cur);
      const foreign = g.dir === "out" && ((!!cc && cc !== "AT") || fx);
      // RC: früher als RC gebucht, oder ausländischer Leister und früher 0 % bzw. noch nie gebucht
      const rc = g.dir === "out" && (h ? (h.rc || (h.rate === 0 && foreign)) : foreign);
      const why = rc ? (h && h.rc ? "früher als Reverse Charge gebucht" : (cc && cc !== "AT" ? "Leister " + cc : "Zahlung in " + m.card.cur) + " – ausländische Leistung mit 0 %") : "";
      const name = titleCase(m.kw).slice(0, 60);
      return { key: k, label: m.label, count: g.tx.length, sum: r2(g.tx.reduce((a, t) => a + (+t.amount || 0), 0)), cc, rc, why, prev: h ? { date: h.date, category: h.category, catName: cats[h.category] || "", rate: h.rate, supplier: h.supplier, rc: h.rc, taxRule: h.taxRule || "" } : null,
        rule: { name: name + (rc ? " (Reverse Charge)" : ""), active: true, cond: { name: m.field === "name" ? m.kw : "", purpose: m.field === "purpose" ? m.kw : "", dir: g.dir, min: "", max: "", account: "" },
          act: { type: "beleg", category: h ? h.category : "", rate: rc || (h && TR_ZERO.indexOf(h.taxRule) > -1) ? 0 : (h ? h.rate : 20), rc: rc && !(h && h.taxRule), taxRule: (h && h.taxRule) || "", supplier, desc: "" } },
        catName: h ? cats[h.category] || "" : "",
        sample: g.tx.slice(0, 5).map(t => ({ date: day(t.valueDate), name: t.payeePayerName, purpose: String(t.paymtPurpose || "").slice(0, 90), amount: +t.amount })) };
    });
    out.sort((a, b) => b.count - a.count || Math.abs(b.sum) - Math.abs(a.sum));
    return { suggestions: out.slice(0, 40), open: open().length };
  }
  async function handle(pl) {
    await load(); const op = String(pl.op || "");
    if (op === "save") {
      const r = clean(pl.rule || {}); if (!r.act.type) throw new Error("Bitte eine Aktion wählen");
      if (!(r.cond.name || r.cond.purpose)) throw new Error("Bitte Name oder Verwendungszweck angeben");
      if (r.act.type === "beleg" && !r.act.category) throw new Error("Bitte eine Kategorie für den Beleg wählen");
      const i = RULES.findIndex(x => x.id === r.id); if (i > -1) { r.hits = RULES[i].hits; r.lastHit = RULES[i].lastHit; RULES[i] = r; } else RULES.push(r);
      await save(); return { rule: r };
    }
    if (op === "delete") { RULES = RULES.filter(x => x.id !== pl.id); await save(); return {}; }
    if (op === "order") { const ids = pl.ids || []; RULES.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); await save(); return {}; }
    if (op === "preview") { const r = pl.rule ? clean(pl.rule) : RULES.find(x => x.id === pl.id); if (!r) throw new Error("Regel nicht gefunden"); const hit = open().filter(t => matches(r, t)); return { count: hit.length, sample: hit.slice(0, 8).map(t => ({ date: day(t.valueDate), name: t.payeePayerName, purpose: String(t.paymtPurpose || "").slice(0, 80), amount: +t.amount })) }; }
    if (op === "undo") {   // per Regel angelegte Belege zurücknehmen: Zahlung lösen, Beleg + Positionen löschen, Umsatz wieder offen; optional Regel löschen
      const ids = new Set([].concat(pl.id || pl.ids || []).map(String)); let n = 0, tx = 0;
      for (const v of L.all("Voucher").filter(v => v.fromRule && ids.has(String(v.fromRule)))) {
        if (L.isLocked && L.isLocked("Voucher", v)) continue;
        for (const l of L.all("CheckAccountTransactionLog").filter(l => l.object && l.object.objectName === "Voucher" && String(l.object.id) === String(v.id))) {
          const t = l.checkAccountTransaction && L.get("CheckAccountTransaction", l.checkAccountTransaction.id); await L.del("CheckAccountTransactionLog", l.id);
          if (t && !L.all("CheckAccountTransactionLog").some(x => x.checkAccountTransaction && String(x.checkAccountTransaction.id) === String(t.id))) { t.status = "100"; delete t.ruleId; await L.save("CheckAccountTransaction", t); tx++; }
        }
        for (const p of L.positionsOf("Voucher", v.id)) await L.del("VoucherPos", p.id);
        await L.del("Voucher", v.id); n++;
      }
      for (const r of RULES.filter(r => ids.has(String(r.id)))) { r.hits = 0; r.lastHit = null; }
      if (pl.remove) RULES = RULES.filter(r => !ids.has(String(r.id)));
      await save(); return { vouchers: n, transactions: tx };
    }
    if (op === "apply") return await run(pl.id, { apply: true });   // Klick im Regel-Dialog: sofort anwenden
    if (op === "suggest") return suggest();
    if (op === "adopt") { const s = await handle(Object.assign({}, pl, { op: "save" })); const x = await run(s.rule.id, { apply: true }); return Object.assign({ rule: s.rule }, x); }   // Vorschlag übernehmen: speichern + gleich anwenden
    if (op === "runall") return await run(undefined, { apply: true });
    throw new Error("unbekannte Aktion");
  }
  function categories() { return L.all("AccountingType").filter(a => String(a.status || "100") !== "0" && a.name).map(a => ({ id: String(a.id), name: a.name, type: a.type || "" })).sort((a, b) => a.name.localeCompare(b.name, "de")); }
  async function list() { await load(); return { rules: RULES, categories: categories(), accounts: L.all("CheckAccount").filter(a => String(a.status) !== "0").map(a => ({ id: String(a.id), name: a.name })) }; }
  return { handle, list, run, acceptProposal, likeApply, likeLast, card, merchantOf, actLabel };
};
