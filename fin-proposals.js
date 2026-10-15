"use strict";
// „Zur Prüfung“: zentrale Stelle für alles, was früher automatisch zugeordnet/gebucht wurde (Bankregeln, Mollie-Zuordnungen,
// Geldtransit, Belegdateien aus Mails, USt-Zahlung ans Finanzamt, wiederkehrende Belege/Rechnungen …).
// Automatische Läufe erkennen weiterhin, legen aber nur einen Vorschlag ab; gebucht wird erst mit accept() – und zwar mit
// genau der Funktion, die früher automatisch lief (Handler je Art, registriert in server.js). Abgelehnte Vorschläge (Schlüssel)
// werden gemerkt und kommen nicht wieder. Veraltete Vorschläge (Umsatz nicht mehr offen, Beleg hat schon eine Datei …) fallen
// beim Auflisten weg. Speicher: fin_meta „proposals“.
// Außerdem: suggest() – Vorschläge beim Öffnen eines offenen Umsatzes bzw. Belegs (nie automatisch angewendet).
module.exports = function (D) {
  const { L, getMeta, setMeta } = D;
  const H = {};                        // kind -> { exec(item), valid?(item), reject?(item), list?() (virtuelle Vorschläge), label? }
  let ST = null, loading = null, NEW = [], timer = null;
  const running = new Set();
  const r2 = n => Math.round((+n || 0) * 100) / 100, day = v => String(v || "").slice(0, 10), nowIso = () => new Date().toISOString();
  const KIND_LABEL = { rule: "Bankregeln", "mollie-match": "Mollie-Zahlung → Rechnung", "mollie-fee": "Mollie-Gebühren", "mollie-payout": "Mollie-Auszahlung (Geldtransit)", "mollie-income": "Mollie-Einnahmen ohne Rechnung",
    transfer: "Geldtransit zwischen Konten", docmatch: "Belegdateien aus Mails", "uva-payment": "USt-Zahlung ans Finanzamt", "recurring-voucher": "Wiederkehrende Belege", "recurring-invoice": "Wiederkehrende Rechnungen senden", dunning: "Mahnungen" };

  function register(kind, h) { H[kind] = h; }
  async function state() {
    if (ST) return ST;
    if (!loading) loading = (async () => {
      const s = (await getMeta("proposals").catch(() => null)) || {};
      ST = { items: Array.isArray(s.items) ? s.items : [], rejected: s.rejected && typeof s.rejected === "object" ? s.rejected : {}, log: Array.isArray(s.log) ? s.log : [] };
      return ST;
    })().finally(() => { loading = null; });
    return loading;
  }
  async function persist() {
    const keys = Object.keys(ST.rejected); if (keys.length > 4000) keys.sort((a, b) => String(ST.rejected[a]).localeCompare(String(ST.rejected[b]))).slice(0, keys.length - 4000).forEach(k => { delete ST.rejected[k]; });
    ST.log = ST.log.slice(0, 200);
    await setMeta("proposals", ST);
  }
  function notifySoon(it) {
    if (!D.notify) return; NEW.push(it); if (timer) return;
    timer = setTimeout(async () => { timer = null; const fresh = NEW; NEW = []; try { const s = await state(); await D.notify(fresh, s.items.length); } catch (e) { console.error("Vorschläge-Push:", e.message); } }, 4000);
    if (timer.unref) timer.unref();
  }
  // Vorschlag ablegen (Schlüssel = stabil, z. B. „rule:<regel>:<umsatz>“). true = neu
  async function add(p) {
    if (!p || !p.kind || !p.key) throw new Error("Vorschlag ohne Art/Schlüssel");
    await state(); const key = String(p.key);
    if (ST.rejected[key]) return false;
    const cur = ST.items.find(x => x.key === key);
    const clean = { kind: String(p.kind), key, title: String(p.title || "").slice(0, 200), detail: String(p.detail || "").slice(0, 400), amount: p.amount != null && isFinite(+p.amount) ? r2(p.amount) : null, date: day(p.date) || null,
      txId: p.txId != null ? String(p.txId) : null, txIds: Array.isArray(p.txIds) ? p.txIds.map(String) : null, invoiceId: p.invoiceId != null ? String(p.invoiceId) : null, voucherId: p.voucherId != null ? String(p.voucherId) : null,
      source: String(p.source || "").slice(0, 120), payload: p.payload || {} };
    if (cur) { const before = JSON.stringify(cur); Object.assign(cur, clean); if (JSON.stringify(cur) !== before) await persist(); return false; }
    const it = Object.assign({ id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), createdAt: nowIso() }, clean);
    ST.items.push(it); await persist(); notifySoon(it);
    return true;
  }
  const txOpen = id => { const t = L.get("CheckAccountTransaction", id); return !!t && String(t.status) === "100" && !t.transitWith; };
  async function valid(it) {
    const ids = (it.txIds || []).concat(it.txId && !(it.txIds || []).length ? [it.txId] : []);
    if (ids.length && !ids.every(txOpen)) return false;
    if (it.invoiceId && it.kind === "mollie-match") { const i = L.get("Invoice", it.invoiceId); if (!i || ["200", "750"].indexOf(String(i.status)) < 0) return false; }
    const h = H[it.kind]; if (h && h.valid) { try { if (!(await h.valid(it))) return false; } catch (e) { return false; } }
    return true;
  }
  // alle offenen Vorschläge (veraltete fallen weg), plus virtuelle (z. B. Mahnungen zur Freigabe)
  async function list() {
    await state(); await L.load();
    const keep = []; let changed = false;
    for (const it of ST.items) { if (running.has(it.id) || await valid(it)) keep.push(it); else changed = true; }
    if (changed) { ST.items = keep; await persist(); }
    const out = keep.slice();
    for (const k of Object.keys(H)) if (H[k].list) { try { (await H[k].list()).forEach(x => out.push(Object.assign({ kind: k, virtual: true }, x))); } catch (e) { console.error("Vorschläge " + k + ":", e.message); } }
    return out.sort((a, b) => String(a.kind).localeCompare(String(b.kind)) || String(b.date || "").localeCompare(String(a.date || "")));
  }
  async function view() {
    const items = await list(), groups = {};
    items.forEach(x => { const g = groups[x.kind] = groups[x.kind] || { kind: x.kind, label: (H[x.kind] && H[x.kind].label) || KIND_LABEL[x.kind] || x.kind, count: 0 }; g.count++; });
    return { items: items.map(x => { const o = Object.assign({}, x); delete o.payload; return o; }), groups: Object.values(groups), count: items.length, log: ST.log.slice(0, 20) };
  }
  async function find(id) { const items = await list(); const it = items.find(x => x.id === String(id)); if (!it) throw new Error("Vorschlag nicht mehr vorhanden (schon erledigt oder veraltet)"); return it; }
  // Bestätigen: führt genau die früher automatische Aktion aus
  async function accept(id) {
    const it = await find(id), h = H[it.kind]; if (!h || !h.exec) throw new Error("Für diese Art gibt es keine Ausführung");
    if (running.has(it.id)) throw new Error("Wird gerade ausgeführt");
    running.add(it.id);
    try {
      const r = await h.exec(it);
      if (!it.virtual) { ST.items = ST.items.filter(x => x.id !== it.id); }
      ST.log.unshift({ at: nowIso(), kind: it.kind, title: it.title, amount: it.amount, date: it.date, ok: true }); await persist();
      return { id: it.id, kind: it.kind, result: r == null ? true : r };
    } catch (e) {
      if (!it.virtual) { const x = ST.items.find(y => y.id === it.id); if (x) { x.error = String(e.message || e).slice(0, 200); await persist(); } }
      throw e;
    } finally { running.delete(it.id); }
  }
  // Ablehnen: Schlüssel merken → derselbe Vorschlag kommt nicht wieder
  async function reject(id) {
    const it = await find(id);
    if (it.virtual) { const h = H[it.kind]; if (h && h.reject) await h.reject(it); return { id: it.id }; }
    ST.rejected[it.key] = nowIso(); ST.items = ST.items.filter(x => x.id !== it.id);
    ST.log.unshift({ at: nowIso(), kind: it.kind, title: it.title, amount: it.amount, date: it.date, rejected: true }); await persist();
    return { id: it.id };
  }
  async function acceptAll(kind) {
    const items = (await list()).filter(x => !kind || x.kind === kind), res = [];
    for (const it of items) { try { await accept(it.id); res.push({ id: it.id, ok: true }); } catch (e) { res.push({ id: it.id, ok: false, error: String(e.message || e).slice(0, 200), title: it.title }); } }
    return res;
  }
  // Umsätze, die schon in einem offenen Vorschlag stecken (damit derselbe Umsatz nicht zweimal vergeben wird)
  async function busyTx(kind) { await state(); const s = new Set(); ST.items.filter(x => !kind || x.kind === kind).forEach(x => { (x.txIds || []).concat(x.txId ? [x.txId] : []).forEach(id => s.add(String(id))); }); return s; }
  async function forTx(txId) { return (await list()).filter(x => x.txId === String(txId) || (x.txIds || []).indexOf(String(txId)) > -1); }
  async function forVoucher(vid) { return (await list()).filter(x => x.voucherId === String(vid)); }

  // ── Vorschläge beim Öffnen (Umsatz / Beleg): Kandidaten mit Begründung, nie automatisch angewendet ──
  const STOP = new Set(["gmbh", "ltd", "inc", "limited", "und", "and", "the", "kartenzahlung", "zahlung", "lastschrift", "abbuchung", "dauerauftrag", "gutschrift", "ueberweisung", "überweisung", "rechnung", "invoice", "e-comm", "ecomm", "mastercard", "visa", "debit", "karte", "spesen", "kurs", "sepa", "online", "payment", "auszahlung"]);
  const toks = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9äöüß]+/).filter(w => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w));
  function sim(a, b) { const x = toks(a), hb = String(b || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, ""); if (!x.length) return 0; const hit = x.filter(w => hb.indexOf(w) > -1).length; return hit ? Math.min(1, hit / Math.min(2, x.length)) : 0; }
  const ddays = (a, b) => Math.round((Date.parse(day(a) + "T12:00:00Z") - Date.parse(day(b) + "T12:00:00Z")) / 864e5);
  const eu = n => r2(n).toFixed(2).replace(".", ",") + " €";
  const contactName = c => c ? (c.name || [c.surename, c.familyname].filter(Boolean).join(" ")) : "";
  const BOP = "/admin/api/sev/bank-op", POP = "/admin/api/fin/proposals";
  function propCand(p) { return { type: "proposal", id: p.id, label: p.title, sub: (p.source ? p.source + " · " : "") + (p.detail || ""), amount: p.amount, score: 100, reasons: ["liegt schon unter „Zur Prüfung“"], do: { url: POP, body: { op: "accept", id: p.id, confirm: true } } }; }
  async function suggestTx(txId) {
    await L.load(); const t = L.get("CheckAccountTransaction", txId); if (!t) throw new Error("Umsatz nicht gefunden");
    const amt = +t.amount || 0, A = Math.abs(amt), hay = (t.payeePayerName || "") + " " + (t.paymtPurpose || ""), hayNum = hay.toLowerCase().replace(/[^a-z0-9]/g, ""), td = day(t.valueDate), out = [];
    if (String(t.status) !== "100") return { tx: { id: String(t.id), status: +t.status }, candidates: [] };
    (await forTx(txId)).forEach(p => out.push(propCand(p)));
    if (amt > 0) for (const i of L.all("Invoice").filter(i => ["200", "750"].indexOf(String(i.status)) > -1 && !i.cancelled && ["MA", "WKR", "SR"].indexOf(String(i.invoiceType)) < 0)) {
      const open = r2((+i.sumGross || 0) - (+i.paidAmount || 0)); if (!(open > 0.005)) continue;
      const c = i.contact && L.get("Contact", i.contact.id), cn = contactName(c), nr = String(i.invoiceNumber || "").toLowerCase().replace(/[^a-z0-9]/g, ""), why = []; let s = 0;
      if (nr && nr.length >= 3 && hayNum.indexOf(nr) > -1) { s += 45; why.push("Rechnungsnummer " + i.invoiceNumber + " im Verwendungszweck"); }
      if (Math.abs(open - A) < 0.011) { s += 35; why.push("Betrag = offener Betrag"); } else if (Math.abs((+i.sumGross || 0) - A) < 0.011) { s += 25; why.push("Betrag = Rechnungsbetrag"); }
      const ns = sim(cn, hay); if (ns) { s += Math.round(25 * ns); why.push("Name „" + cn + "“"); }
      if (s >= 30) out.push({ type: "invoice", id: String(i.id), label: "Rechnung " + (i.invoiceNumber || "Entwurf") + " · " + (cn || "—"), sub: "offen " + eu(open) + " · " + day(i.invoiceDate), amount: open, score: s, reasons: why, do: { url: BOP, body: { txId: String(t.id), op: "invoice", invoiceId: String(i.id), confirm: true } } });
    }
    for (const v of L.all("Voucher").filter(v => ["100", "750"].indexOf(String(v.status)) > -1 && String(v.voucherType || "VOU") === "VOU" && (String(v.creditDebit) === "C") === (amt < 0))) {
      const open = r2(Math.abs(+v.sumGross || 0) - (+v.paidAmount || 0)); if (!(open > 0.005)) continue;
      const why = []; let s = 0, d = ddays(td, v.voucherDate);
      if (Math.abs(open - A) <= 0.02) { s += 40; why.push("gleicher Betrag"); } else continue;
      if (d >= -7 && d <= 30) { s += 15; why.push(d === 0 ? "gleiches Datum" : "Beleg " + Math.abs(d) + " Tage " + (d > 0 ? "vorher" : "nachher")); } else s -= 10;
      const ns = sim((v.supplierName || "") + " " + (v.description || ""), hay); if (ns) { s += Math.round(30 * ns); why.push("Lieferant „" + (v.supplierName || "") + "“"); }
      if (s >= 40) out.push({ type: "voucher", id: String(v.id), label: "Beleg " + (v.supplierName || "—") + (v.description ? " · " + String(v.description).slice(0, 60) : ""), sub: "offen " + eu(open) + " · " + day(v.voucherDate), amount: open, score: s, reasons: why, do: { url: BOP, body: { txId: String(t.id), op: "voucher", voucherId: String(v.id), confirm: true } } });
    }
    const R = D.rules && D.rules(), like = R && R.likeLast ? R.likeLast(t) : null;
    if (like && like.prev) { const p = like.prev;
      out.push({ type: "like", id: "like", label: "Beleg anlegen wie zuletzt: " + (p.catName || "Kategorie " + p.category) + " · " + (p.rc ? "Reverse Charge" : p.rate + " %"), sub: (p.supplier || like.label) + " · zuletzt am " + p.date, amount: A, score: 55 + (like.privat ? 0 : 5), reasons: ["gleicher Händler/Zahler „" + like.label + "“ wurde am " + p.date + " so gebucht"],
        do: { url: POP, body: { op: "like", txId: String(t.id), act: { type: "beleg", category: p.category, rate: p.rate, rc: !!p.rc, supplier: p.supplier }, confirm: true } } }); }
    if (like && like.privat) out.push({ type: "privat", id: "privat", label: amt < 0 ? "Privatentnahme" : "Privateinlage", sub: like.privat + "× früher privat" + (like.privatLast ? " · zuletzt " + like.privatLast : ""), amount: A, score: like.prev ? 50 : 65, reasons: ["„" + like.label + "“ war früher privat"], do: { url: BOP, body: { txId: String(t.id), op: "privat", confirm: true } } });
    out.sort((a, b) => b.score - a.score);
    return { tx: { id: String(t.id), amount: amt, date: td, name: t.payeePayerName || "", purpose: String(t.paymtPurpose || "").slice(0, 200) }, candidates: out.slice(0, 6) };
  }
  async function suggestVoucher(vid) {
    await L.load(); const v = L.get("Voucher", vid); if (!v) throw new Error("Beleg nicht gefunden");
    const open = r2(Math.abs(+v.sumGross || 0) - (+v.paidAmount || 0)), out = [], vd = day(v.voucherDate), credit = String(v.creditDebit || "C") === "C";
    (await forVoucher(vid)).forEach(p => out.push(propCand(p)));
    const busy = await busyTx(), R = D.rules && D.rules();
    if (open > 0.005 && ["100", "750"].indexOf(String(v.status)) > -1) for (const t of L.all("CheckAccountTransaction").filter(t => String(t.status) === "100" && !t.transitWith && !t.cashLocked && (+t.amount < 0) === credit)) {
      const A = Math.abs(+t.amount || 0), c = R && R.card ? R.card(t.paymtPurpose) : null, fx = !!(c && c.cur), why = []; let s = 0;
      if (Math.abs(A - open) <= 0.02) { s += 45; why.push("gleicher Betrag"); }
      else if (fx && Math.abs(A - open) <= open * 0.03 + 0.02) { s += 30; why.push("Betrag ±3 % (Kartenzahlung in " + c.cur + ")"); }
      else if (c && c.spesen && Math.abs(A - c.spesen - open) <= 0.02) { s += 40; why.push("Betrag ohne Bankspesen gleich"); }
      else continue;
      const d = ddays(t.valueDate, vd); if (d < -7 || d > 30) continue;
      s += d >= 0 && d <= 10 ? 15 : 8; why.push(d === 0 ? "gleiches Datum" : "Umsatz " + Math.abs(d) + " Tage " + (d > 0 ? "nach" : "vor") + " dem Beleg");
      const ns = sim(v.supplierName, (t.payeePayerName || "") + " " + (t.paymtPurpose || "")) || sim((t.payeePayerName || "") + " " + (c ? c.merchant : ""), (v.supplierName || "") + " " + (v.description || ""));
      if (ns) { s += Math.round(30 * ns); why.push("Name passt"); }
      if (busy.has(String(t.id))) { s -= 15; why.push("steckt schon in einem anderen Vorschlag"); }
      const acc = t.checkAccount && L.get("CheckAccount", t.checkAccount.id);
      out.push({ type: "tx", id: String(t.id), label: (t.payeePayerName || "Umsatz") + " · " + eu(+t.amount), sub: day(t.valueDate) + (acc ? " · " + acc.name : "") + " · " + String(t.paymtPurpose || "").replace(/\s+/g, " ").slice(0, 90), amount: +t.amount, score: s, reasons: why,
        do: { url: BOP, body: { txId: String(t.id), op: "voucher", voucherId: String(v.id), confirm: true } } });
    }
    out.sort((a, b) => b.score - a.score);
    return { voucher: { id: String(v.id), open, date: vd, supplier: v.supplierName || "" }, candidates: out.slice(0, 5) };
  }
  return { register, add, list, view, accept, reject, acceptAll, busyTx, forTx, forVoucher, suggestTx, suggestVoucher, KIND_LABEL, _state: () => ST };
};
