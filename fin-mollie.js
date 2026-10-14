"use strict";
// Mollie als eigenes Zahlungskonto (wie sevDesk bei PayPal/Stripe): Über die Balances-API kommt jede Bewegung einzeln herein –
// Kundenzahlung brutto (→ Rechnung zuordenbar), Mollie-Gebühr als eigene Ausgabe, Rückerstattung, Connect-Provision (kochdu)
// und die Auszahlung aufs Bankkonto. Die Auszahlung wird mit dem Bankumsatz (George) als Geldtransit verknüpft – kein Umsatz.
// Zugang: Organisations-Zugangstoken je Mollie-Organisation (Umgebungsvariablen MOLLIE_ORG_TOKEN, MOLLIE_ORG_TOKEN_2 …),
// Rechte: balances.read, payments.read, profiles.read, organizations.read, settlements.read. Nur lesend – Mollie wird nicht verändert.
module.exports = function (D) {
  const { L } = D;                                   // FIN_LOCAL
  const BASE = "https://api.mollie.com/v2";
  const r2 = n => Math.round((+n || 0) * 100) / 100, s2 = n => r2(n).toFixed(2), low = v => String(v == null ? "" : v).toLowerCase();
  const iso = d => d + "T00:00:00+02:00", day = v => String(v || "").slice(0, 10);
  let STATE = { at: null, running: false, last: null, error: "" };
  function tokens() {
    return Object.keys(process.env).filter(k => /^MOLLIE_ORG_TOKEN(_\w+)?$/.test(k) && process.env[k]).sort().map(k => ({ key: k, token: String(process.env[k]).trim() }));
  }
  async function api(token, pathOrUrl) {
    const url = /^https:/.test(pathOrUrl) ? pathOrUrl : BASE + pathOrUrl;
    if (!/^https:\/\/api\.mollie\.com\//.test(url)) throw new Error("ungültige Mollie-URL");
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
    try {
      const r = await (D.fetch || fetch)(url, { headers: { Authorization: "Bearer " + token, Accept: "application/json" }, signal: ctl.signal });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error("Mollie " + r.status + ": " + (j.detail || j.title || "Fehler")); e.status = r.status; throw e; }
      return j;
    } finally { clearTimeout(t); }
  }
  async function pages(token, path, until) {
    const out = []; let url = path, n = 0;
    while (url && n++ < 80) {
      const j = await api(token, url); const k = Object.keys(j._embedded || {})[0]; const arr = (j._embedded && j._embedded[k]) || [];
      let stop = false; for (const x of arr) { if (until && x.createdAt && day(x.createdAt) < until) { stop = true; break; } out.push(x); }
      if (stop) break; url = j._links && j._links.next && j._links.next.href;
    }
    return out;
  }
  const amt = a => a && a.value != null ? +a.value : 0;
  const ctxId = (c, rx) => { const m = JSON.stringify(c || {}).match(rx); return m ? m[0] : ""; };
  async function newTx(accId, o) {
    const r = await L.request("POST", "/CheckAccountTransaction", { body: Object.assign({ checkAccount: { id: String(accId), objectName: "CheckAccount" }, status: "100", payeePayerName: "", paymtPurpose: "" }, o) });
    return r.objects;
  }
  // Gebühren eines Monats mit der Mollie-Monatsrechnung (Beleg) verknüpfen, wenn die Summe passt
  async function linkFees() {
    let n = 0; const by = {};
    L.all("CheckAccountTransaction").filter(x => x.mollieFee && String(x.status) === "100").forEach(x => { const k = String(x.checkAccount.id) + "|" + day(x.valueDate).slice(0, 7); (by[k] = by[k] || []).push(x); });
    for (const k of Object.keys(by)) {
      const ym = k.split("|")[1], list = by[k], sum = r2(-list.reduce((a, x) => a + (+x.amount || 0), 0)); if (!(sum > 0)) continue;
      const nx = new Date(ym + "-15T12:00:00Z"); nx.setUTCMonth(nx.getUTCMonth() + 1); const ym2 = nx.toISOString().slice(0, 7);
      const v = L.all("Voucher").find(v => String(v.creditDebit) === "C" && /mollie/i.test(String(v.supplierName || "") + " " + String(v.description || "")) && ["100", "750"].indexOf(String(v.status)) > -1 && [ym, ym2].indexOf(day(v.voucherDate).slice(0, 7)) > -1 && Math.abs(r2((+v.sumGross || 0) - (+v.paidAmount || 0)) - sum) < 0.05);
      if (!v) continue;
      for (const x of list) { await L.request("PUT", "/Voucher/" + v.id + "/bookAmount", { body: { amount: Math.abs(+x.amount), date: day(x.valueDate), checkAccountTransaction: { id: String(x.id) } } }); n++; }
    }
    return n;
  }
  // Zahlung → Rechnung: 1) Mollie-ID im Rechnungstext (Kantineur: „Mollie tr_…“), 2) Buchungs-/Bestellnummer aus den Metadaten,
  // 3) eindeutige offene Rechnung mit gleichem Bruttobetrag (±0,01) und passendem Namen. Gebühr → Zahlungsgebühr an der Rechnung.
  async function autoMatch(tx) {
    const gross = +tx.mollieGross || +tx.amount; if (!(gross > 0)) return false;
    const inv = L.all("Invoice").filter(i => ["200", "750"].indexOf(String(i.status)) > -1 && !i.cancelled && ["RE", "AR", "ER", "TR"].indexOf(String(i.invoiceType || "RE")) > -1);
    const txt = i => low([i.invoiceNumber, i.header, i.headText, i.footText, i.customerInternalNote, i.address].join(" "));
    const pid = low(tx.molliePayment), meta = tx.mollieMeta && typeof tx.mollieMeta === "object" ? Object.keys(tx.mollieMeta).map(k => low(tx.mollieMeta[k])).filter(v => v && v.length >= 5 && !/^(true|false|null)$/.test(v)) : [];
    const openOf = i => r2((+i.sumGross || 0) - (+i.paidAmount || 0));
    let hit = pid ? inv.filter(i => txt(i).indexOf(pid) > -1) : [];
    if (hit.length !== 1 && meta.length) hit = inv.filter(i => meta.some(v => txt(i).indexOf(v) > -1));
    if (hit.length !== 1) { const nm = low(tx.payeePayerName).split(/\s+/).filter(w => w.length > 2); hit = inv.filter(i => Math.abs(openOf(i) - gross) < 0.011).filter(i => { const c = i.contact && L.get("Contact", i.contact.id); const cn = low((c && (c.name || [c.surename, c.familyname].join(" "))) + " " + i.address); return !nm.length || nm.some(w => cn.indexOf(w) > -1); }); }
    if (hit.length !== 1) return false;
    const i = hit[0]; if (Math.abs(openOf(i) - gross) > 0.011) return false;   // nur volle Zahlung automatisch
    await L.request("PUT", "/Invoice/" + i.id + "/bookAmount", { body: { amount: Math.abs(+tx.amount), date: day(tx.valueDate), checkAccountTransaction: { id: String(tx.id) } } });
    return true;
  }
  // Kein passender Rechnungsbeleg: nach der Wartezeit Einnahme-Beleg (20 % USt im Brutto) anlegen und zuordnen – Gebühr hängt daran.
  // Connect-Provisionen (kochdu) sofort. Abschaltbar je Mollie-Konto (acc.mollieAutoVoucher === false).
  function incomeCategory() { const ats = L.all("AccountingType"); return ats.find(a => /einnahmen \/ erl(ö|oe)se \/ verk(ä|ae)ufe/i.test(a.name || "")) || ats.find(a => /erl(ö|oe)se 20|umsatzerl(ö|oe)se/i.test(a.name || "")) || ats.find(a => /erl(ö|oe)s|einnahm/i.test(a.name || "")) || null; }
  async function autoVouchers() {
    let n = 0; const cat = incomeCategory(), now = Date.now();
    for (const tx of L.all("CheckAccountTransaction").filter(x => (x.mollieType === "payment" || x.mollieType === "application-fee") && String(x.status) === "100" && +x.amount > 0)) {
      const acc = L.get("CheckAccount", tx.checkAccount && tx.checkAccount.id); if (!acc || acc.mollieAutoVoucher === false) continue;
      if (tx.mollieType === "payment" && now - Date.parse(day(tx.valueDate) + "T12:00:00Z") < 3 * 864e5) continue;   // Rechnung kann noch kommen
      const gross = tx.mollieType === "payment" ? (+tx.mollieGross || +tx.amount) : +tx.amount;
      const prov = tx.mollieType === "application-fee";
      const body = { voucher: { supplierName: prov ? "Mollie Connect (kochdu)" : (tx.payeePayerName || acc.name), description: (prov ? "Provision kochdu (Mollie Connect) " : "Einnahme " + acc.name.replace(/^Mollie – /, "") + " – ") + String(tx.mollieDesc || tx.paymtPurpose || "").slice(0, 120), voucherDate: day(tx.valueDate), creditDebit: "D", status: "100", voucherType: "VOU", taxType: "default", fromMollie: String(tx.id) },
        voucherPosSave: [{ accountingType: cat ? { id: String(cat.id), objectName: "AccountingType" } : undefined, taxRate: "20", sumGross: String(r2(gross)), net: "false", comment: "automatisch aus Mollie" }] };
      try {
        const v = (await L.request("POST", "/Voucher/Factory/saveVoucher", { body })).objects.voucher;
        await L.request("PUT", "/Voucher/" + v.id + "/bookAmount", { body: { amount: +tx.amount, date: day(tx.valueDate), checkAccountTransaction: { id: String(tx.id) } } });
        n++;
      } catch (e) { console.error("Mollie-Beleg:", e.message); }
    }
    return n;
  }
  // offene Mollie-Zahlungen nachträglich zuordnen (z. B. Rechnung erst später erstellt)
  async function rematch() { let n = 0; for (const tx of L.all("CheckAccountTransaction").filter(x => x.mollieType === "payment" && String(x.status) === "100")) if (await autoMatch(tx)) n++; return n; }
  // Auszahlung ↔ Bankumsatz: gleicher Betrag, Bank-Datum 0–7 Tage nach der Auszahlung, nicht schon vergeben
  async function linkPayout(molTx, amount, d) {
    const cands = L.all("CheckAccountTransaction").filter(x => !x.mollieId && !x.transitWith && String(x.status) === "100" && Math.abs((+x.amount || 0) - amount) < 0.005 && x.checkAccount && String(x.checkAccount.id) !== String(molTx.checkAccount.id))
      .map(x => ({ x, dd: (Date.parse(day(x.valueDate)) - Date.parse(d)) / 864e5 })).filter(c => c.dd >= -1 && c.dd <= 7)
      .sort((a, b) => (/mollie/i.test(b.x.payeePayerName + " " + b.x.paymtPurpose) - /mollie/i.test(a.x.payeePayerName + " " + a.x.paymtPurpose)) || Math.abs(a.dd) - Math.abs(b.dd));
    const c = cands[0]; if (!c) return false;
    c.x.status = "400"; c.x.transitWith = String(molTx.id); c.x.paymtPurpose = (c.x.paymtPurpose || "") + " · Geldtransit Mollie"; await L.save("CheckAccountTransaction", c.x);
    molTx.status = "400"; molTx.transitWith = String(c.x.id); await L.save("CheckAccountTransaction", molTx);
    return true;
  }
  async function syncOrg(tk, since) {
    const org = await api(tk.token, "/organizations/me").catch(() => ({ name: tk.key }));
    const profiles = {}; (await pages(tk.token, "/profiles?limit=250").catch(() => [])).forEach(p => { profiles[p.id] = p.name; });
    let balances;
    try { balances = await pages(tk.token, "/balances?limit=250"); }
    catch (e) { if (e.status === 403) throw new Error("Dieser Schlüssel ist auf ein Profil beschränkt – für Saldo und Auszahlungen braucht es einen Schlüssel für die ganze Organisation"); throw e; }
    const res = { org: org.name || tk.key, accounts: [], added: 0, fees: 0, payouts: 0, linked: 0 };
    for (const b of balances.filter(b => (b.currency || "EUR") === "EUR")) {
      let acc = L.all("CheckAccount").find(a => a.mollieBalance === b.id);
      const label = /^MOLLIE_ORG_TOKEN_\w+$/.test(tk.key) ? tk.key.replace(/^MOLLIE_ORG_TOKEN_/, "").toLowerCase().replace(/(^|_)(\w)/g, (m, a, c) => (a ? " " : "") + c.toUpperCase()) : (org.name || "Konto");
      if (!acc) acc = (await L.request("POST", "/CheckAccount", { body: { mollieSince: new Date().toISOString().slice(0, 10), name: "Mollie – " + label, type: "online", importType: "MOLLIE", currency: "EUR", status: "100", defaultAccount: "0", mollieBalance: b.id } })).objects;
      const have = new Set(L.all("CheckAccountTransaction").filter(x => x.mollieId).map(x => x.mollieId));
      // Buchhaltung je Mollie-Konto erst ab dem Umstieg: Älteres ist über sevDesk bereits verbucht (sonst doppelte Einnahmen)
      const accSince = acc.mollieSince && acc.mollieSince > since ? acc.mollieSince : since;
      const txs = (await pages(tk.token, "/balances/" + b.id + "/transactions?limit=250", accSince)).reverse().filter(t => day(t.createdAt) >= accSince);
      for (const t of txs) {
        if (have.has(t.id)) continue;
        const d = day(t.createdAt), type = String(t.type || ""), res0 = amt(t.resultAmount), init = t.initialAmount ? amt(t.initialAmount) : res0, ded = t.deductions ? amt(t.deductions) : r2(res0 - init);
        const pid = ctxId(t.context, /tr_\w+/);
        let pay = null; if (pid && (type === "payment" || type === "refund" || type === "chargeback")) pay = await api(tk.token, "/payments/" + pid).catch(() => null);
        const name = pay ? (pay.details && (pay.details.consumerName || pay.details.cardHolder)) || "" : "";
        const meta = pay && pay.metadata ? JSON.stringify(pay.metadata).slice(0, 200) : "";
        const prof = pay && profiles[pay.profileId] ? profiles[pay.profileId] + ": " : "";
        if (type === "payment") {
          // netto wie ausbezahlt; Gebühr am Umsatz gemerkt → bei der Zuordnung zur Rechnung als Zahlungsgebühr an die Rechnung gehängt
          const tx = await newTx(acc.id, { valueDate: iso(d), entryDate: iso(d), amount: s2(res0), payeePayerName: name, paymtPurpose: (prof + (pay ? pay.description || "" : "Zahlung") + (meta ? " · " + meta : "") + " · " + pid + (Math.abs(ded) > 0.004 ? " · brutto " + s2(init) + ", Gebühr " + s2(Math.abs(ded)) : "")).trim(), mollieId: t.id, mollieType: type, molliePayment: pid, mollieGross: s2(init), mollieFeeAmt: s2(Math.abs(ded)), mollieMeta: pay && pay.metadata ? pay.metadata : null, mollieDesc: pay ? pay.description || "" : "", mollieProfile: pay && profiles[pay.profileId] ? profiles[pay.profileId] : "" });
          res.added++; if (Math.abs(ded) > 0.004) res.fees++;
          if (await autoMatch(tx)) res.matched = (res.matched || 0) + 1;
        } else if (type === "outgoing-transfer" || type === "outgoing-transfer-reversal") {
          const tx = await newTx(acc.id, { valueDate: iso(d), entryDate: iso(d), amount: s2(res0), payeePayerName: "Auszahlung Bank", paymtPurpose: "Mollie-Auszahlung (Geldtransit) " + ctxId(t.context, /stl_\w+/), mollieId: t.id, mollieType: type });
          res.payouts++; if (res0 < 0 && await linkPayout(tx, -res0, d)) res.linked++;
        } else {
          const label = { refund: "Rückerstattung", chargeback: "Rückbuchung (Chargeback)", "application-fee": "Provision (Mollie Connect)", "split-payment": "Anteil Split-Zahlung", "invoice-compensation": "Mollie-Rechnung verrechnet", "balance-correction": "Korrektur", "failed-payment-fee": "Gebühr fehlgeschlagene Zahlung" }[type] || type;
          await newTx(acc.id, { valueDate: iso(d), entryDate: iso(d), amount: s2(res0), payeePayerName: type === "application-fee" || type === "invoice-compensation" ? "Mollie B.V." : name, paymtPurpose: (label + " " + (prof + (pay ? pay.description || "" : "")) + " " + (pid || "")).trim(), mollieId: t.id, mollieType: type, mollieFee: /fee|compensation/.test(type) && type !== "application-fee", mollieProfile: pay && profiles[pay.profileId] ? profiles[pay.profileId] : (type === "application-fee" ? "kochdu" : "") });
          res.added++;
        }
        have.add(t.id);
      }
      // Anfangsbestand: was beim Umstieg schon bei Mollie lag (einmalig, ohne Buchungswirkung – bereits über sevDesk erfasst)
      const apiBal = r2(amt(b.availableAmount) + amt(b.pendingAmount));
      if (!L.all("CheckAccountTransaction").some(x => x.checkAccount && String(x.checkAccount.id) === String(acc.id) && x.mollieType === "opening")) {
        const booked = r2(L.all("CheckAccountTransaction").filter(x => x.checkAccount && String(x.checkAccount.id) === String(acc.id)).reduce((a, x) => a + (+x.amount || 0), 0));
        const open = r2(apiBal - booked);
        if (Math.abs(open) > 0.004) await newTx(acc.id, { valueDate: iso(acc.mollieSince || day(new Date().toISOString())), entryDate: iso(acc.mollieSince || day(new Date().toISOString())), amount: s2(open), payeePayerName: "Mollie", paymtPurpose: "Anfangsbestand beim Umstieg (bereits über sevDesk verbucht)", mollieId: "opening:" + b.id, mollieType: "opening", status: "400", transitWith: "opening" });
      }
      acc.mollieApiBalance = apiBal; acc.mollieApiPending = r2(amt(b.pendingAmount)); acc.mollieApiAt = new Date().toISOString(); await L.save("CheckAccount", acc);
      res.accounts.push({ id: String(acc.id), name: acc.name, balance: acc.mollieApiBalance });
    }
    return res;
  }
  // Auszahlungen, die vor dem Bankimport kamen, später nachverknüpfen
  async function relink() { let n = 0; for (const tx of L.all("CheckAccountTransaction").filter(x => x.mollieId && /outgoing-transfer$/.test(x.mollieType || "") && !x.transitWith && +x.amount < 0)) if (await linkPayout(tx, -(+tx.amount), day(tx.valueDate))) n++; return n; }
  async function sync(opt) {
    if (STATE.running) return STATE.last; const tks = tokens(); if (!tks.length) throw new Error("Kein Mollie-Zugang hinterlegt (MOLLIE_ORG_TOKEN)");
    STATE.running = true; STATE.error = "";
    try {
      await L.load();
      const since = (opt && opt.since) || new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
      const out = []; for (const tk of tks) out.push(await syncOrg(tk, since).catch(e => ({ org: tk.key, error: e.message })));
      const relinked = await relink(), feesLinked = await linkFees(), rematched = await rematch(), vouchers = await autoVouchers();
      STATE.last = { at: new Date().toISOString(), orgs: out, relinked, feesLinked, rematched, vouchers }; STATE.at = STATE.last.at; return STATE.last;
    } catch (e) { STATE.error = e.message; throw e; } finally { STATE.running = false; }
  }
  // Abgleich je Mollie-Konto: eingenommen (brutto), Gebühren, netto, ausbezahlt (mit/ohne Bankumsatz), noch bei Mollie, Kontrolle gegen Mollie-Saldo
  function summary(from, to) {
    const out = [];
    for (const acc of L.all("CheckAccount").filter(a => a.mollieBalance)) {
      const txs = L.all("CheckAccountTransaction").filter(t => t.checkAccount && String(t.checkAccount.id) === String(acc.id));
      const inP = t => (!from || day(t.valueDate) >= from) && (!to || day(t.valueDate) <= to);
      const pays = txs.filter(t => t.mollieType === "payment" && inP(t)), refunds = txs.filter(t => /refund|chargeback/.test(t.mollieType || "") && inP(t)), prov = txs.filter(t => t.mollieType === "application-fee" && inP(t));
      const otherFees = txs.filter(t => t.mollieFee && inP(t)), payouts = txs.filter(t => /outgoing-transfer/.test(t.mollieType || "") && inP(t));
      const sum = (a, f) => r2(a.reduce((x, t) => x + f(t), 0));
      const gross = sum(pays, t => +t.mollieGross || +t.amount), fees = r2(sum(pays, t => +t.mollieFeeAmt || 0) + Math.abs(sum(otherFees, t => +t.amount)));
      const paid = sum(payouts, t => -(+t.amount)), linked = payouts.filter(t => t.transitWith), notLinked = payouts.filter(t => !t.transitWith && +t.amount < 0);
      const bookBal = r2(txs.reduce((x, t) => x + (+t.amount || 0), 0));
      out.push({ id: String(acc.id), name: acc.name, gross, fees, refunds: Math.abs(sum(refunds, t => +t.amount)), provisions: sum(prov, t => +t.amount), net: r2(gross - fees),
        payouts: paid, payoutsLinked: sum(linked, t => -(+t.amount)), payoutsMissing: notLinked.map(t => ({ id: String(t.id), date: day(t.valueDate), amount: -(+t.amount) })),
        stillAtMollie: bookBal, mollieBalance: acc.mollieApiBalance != null ? acc.mollieApiBalance : null, pending: acc.mollieApiPending || 0, balanceAt: acc.mollieApiAt || null,
        diff: acc.mollieApiBalance != null ? r2(bookBal - acc.mollieApiBalance) : null,
        unmatched: pays.filter(t => String(t.status) === "100").map(t => ({ id: String(t.id), date: day(t.valueDate), name: t.payeePayerName, purpose: String(t.mollieDesc || t.paymtPurpose || "").slice(0, 80), gross: +t.mollieGross || +t.amount, fee: +t.mollieFeeAmt || 0 })),
        countPayments: pays.length, countMatched: pays.filter(t => String(t.status) !== "100").length,
        byProfile: Object.values(pays.concat(prov).reduce((o, t) => { const k = t.mollieProfile || "ohne Profil"; const x = o[k] = o[k] || { name: k, gross: 0, fees: 0, count: 0, unmatched: 0, provisions: 0 };
          if (t.mollieType === "application-fee") x.provisions = r2(x.provisions + (+t.amount || 0)); else { x.gross = r2(x.gross + (+t.mollieGross || +t.amount)); x.fees = r2(x.fees + (+t.mollieFeeAmt || 0)); x.count++; if (String(t.status) === "100") x.unmatched++; } return o; }, {})) });
    }
    return out;
  }
  function status() { return { configured: tokens().length, keys: tokens().map(t => t.key), at: STATE.at, running: STATE.running, last: STATE.last, error: STATE.error }; }
  return { sync, status, relink, linkFees, rematch, autoMatch, summary, autoVouchers };
};
