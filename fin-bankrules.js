"use strict";
// Bankregeln (wie sevDesk „Regeln“): offene Bankumsätze automatisch verarbeiten, wenn Name/Verwendungszweck/Betrag/Konto passen.
// Aktionen: privat (Entnahme/Einlage), Geldtransit (eigene Konten) oder Beleg anlegen (Kategorie + Steuersatz) und gleich zuordnen.
// Läuft nach Kontoauszug-Import und Mollie-Abruf sowie per „Jetzt anwenden“ – nur offene, nicht zugeordnete Umsätze.
module.exports = function (D) {
  const { L, getMeta, setMeta } = D;
  let RULES = null;
  const low = s => String(s || "").toLowerCase(), day = v => String(v || "").slice(0, 10), r2 = n => Math.round((+n || 0) * 100) / 100;
  async function load() { if (!RULES) RULES = (await getMeta("bankRules").catch(() => null)) || []; return RULES; }
  async function save() { await setMeta("bankRules", RULES); }
  const terms = s => String(s || "").split(/[;,\n]/).map(x => x.trim().toLowerCase()).filter(Boolean);
  function matches(r, t) {
    const c = r.cond || {}, amt = +t.amount || 0; let any = false;
    const has = (f, hay) => { const x = terms(f); if (!x.length) return true; any = true; return x.some(k => hay.indexOf(k) > -1); };
    if (!has(c.name, low(t.payeePayerName))) return false;
    if (!has(c.purpose, low(t.paymtPurpose))) return false;
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
    if (a.type === "transit") { t.status = "400"; t.transitWith = "regel:" + r.id; t.ruleId = r.id; await L.save("CheckAccountTransaction", t); return "transit"; }
    if (a.type === "beleg") {
      const rate = [0, 10, 13, 20].indexOf(+a.rate) > -1 ? +a.rate : 20, gross = Math.abs(amt);
      const body = { voucher: { supplierName: a.supplier || t.payeePayerName || "", description: (a.desc || "") + (a.desc ? " – " : "") + (t.paymtPurpose || "").slice(0, 120), voucherDate: day(t.valueDate), creditDebit: amt < 0 ? "C" : "D", status: "100", voucherType: "VOU", taxType: "default", fromRule: r.id },
        voucherPosSave: [{ accountingType: a.category ? { id: String(a.category), objectName: "AccountingType" } : undefined, taxRate: String(rate), sumGross: String(gross), net: "false", comment: "per Regel „" + r.name + "“" }] };
      const v = (await L.request("POST", "/Voucher/Factory/saveVoucher", { body })).objects.voucher;
      await L.request("PUT", "/Voucher/" + v.id + "/bookAmount", { body: { amount: gross, date: day(t.valueDate), checkAccountTransaction: { id: String(t.id) } } });
      return "beleg";
    }
    return "";
  }
  // alle aktiven Regeln auf offene Umsätze (oder eine Regel auf alle offenen) – erste passende Regel gewinnt
  async function run(onlyId) {
    await load(); const act = RULES.filter(r => onlyId ? r.id === onlyId : r.active); if (!act.length) return { done: 0 };
    let done = 0; const by = {};
    for (const t of open()) {
      const r = act.find(x => matches(x, t)); if (!r) continue;
      try { const k = await applyOne(r, t); if (k) { done++; by[k] = (by[k] || 0) + 1; r.hits = (r.hits || 0) + 1; r.lastHit = new Date().toISOString(); } } catch (e) { console.error("Bankregel", r.name, e.message); }
    }
    if (done) await save();
    return { done, by };
  }
  function clean(r) {
    const c = r.cond || {}, a = r.act || {}, n = v => v === "" || v == null || !isFinite(+v) ? "" : r2(Math.abs(+v));
    return { id: r.id || ("b" + Date.now().toString(36)), name: String(r.name || "Regel").slice(0, 80), active: r.active !== false,
      cond: { name: String(c.name || "").slice(0, 300), purpose: String(c.purpose || "").slice(0, 300), dir: ["in", "out"].indexOf(c.dir) > -1 ? c.dir : "", min: n(c.min), max: n(c.max), account: String(c.account || "").slice(0, 40) },
      act: { type: ["privat", "transit", "beleg"].indexOf(a.type) > -1 ? a.type : "", category: String(a.category || "").slice(0, 40), rate: [0, 10, 13, 20].indexOf(+a.rate) > -1 ? +a.rate : 20, supplier: String(a.supplier || "").slice(0, 120), desc: String(a.desc || "").slice(0, 120) },
      hits: +r.hits || 0, lastHit: r.lastHit || null };
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
    if (op === "apply") return await run(pl.id);
    if (op === "runall") return await run();
    throw new Error("unbekannte Aktion");
  }
  function categories() { return L.all("AccountingType").filter(a => String(a.status || "100") !== "0" && a.name).map(a => ({ id: String(a.id), name: a.name, type: a.type || "" })).sort((a, b) => a.name.localeCompare(b.name, "de")); }
  async function list() { await load(); return { rules: RULES, categories: categories(), accounts: L.all("CheckAccount").filter(a => String(a.status) !== "0").map(a => ({ id: String(a.id), name: a.name })) }; }
  return { handle, list, run };
};
