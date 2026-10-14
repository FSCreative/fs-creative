"use strict";
// Mollie als eigenes Zahlungskonto (wie sevDesk bei PayPal/Stripe): Über die Balances-API kommt jede Bewegung einzeln herein –
// Kundenzahlung brutto (→ Rechnung zuordenbar), Mollie-Gebühr als eigene Ausgabe, Rückerstattung, Connect-Provision (kochdu)
// und die Auszahlung aufs Bankkonto. Die Auszahlung wird mit dem Bankumsatz (George) als Geldtransit verknüpft – kein Umsatz.
// Zugang: Organisations-Zugangstoken je Mollie-Organisation (Umgebungsvariablen MOLLIE_ORG_TOKEN, MOLLIE_ORG_TOKEN_2 …),
// Rechte: balances.read, payments.read, profiles.read, organizations.read, settlements.read. Nur lesend – Mollie wird nicht verändert.
module.exports = function (D) {
  const { L } = D;                                   // FIN_LOCAL
  const BASE = "https://api.mollie.com/v2";
  const r2 = n => Math.round((+n || 0) * 100) / 100, s2 = n => r2(n).toFixed(2);
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
    const balances = await pages(tk.token, "/balances?limit=250");
    const res = { org: org.name || tk.key, accounts: [], added: 0, fees: 0, payouts: 0, linked: 0 };
    for (const b of balances.filter(b => (b.currency || "EUR") === "EUR")) {
      let acc = L.all("CheckAccount").find(a => a.mollieBalance === b.id);
      if (!acc) acc = (await L.request("POST", "/CheckAccount", { body: { name: "Mollie – " + (org.name || "Konto"), type: "online", importType: "MOLLIE", currency: "EUR", status: "100", defaultAccount: "0", mollieBalance: b.id } })).objects;
      const have = new Set(L.all("CheckAccountTransaction").filter(x => x.mollieId).map(x => x.mollieId));
      const txs = (await pages(tk.token, "/balances/" + b.id + "/transactions?limit=250", since)).reverse();
      for (const t of txs) {
        if (have.has(t.id)) continue;
        const d = day(t.createdAt), type = String(t.type || ""), res0 = amt(t.resultAmount), init = t.initialAmount ? amt(t.initialAmount) : res0, ded = t.deductions ? amt(t.deductions) : r2(res0 - init);
        const pid = ctxId(t.context, /tr_\w+/);
        let pay = null; if (pid && (type === "payment" || type === "refund" || type === "chargeback")) pay = await api(tk.token, "/payments/" + pid).catch(() => null);
        const name = pay ? (pay.details && (pay.details.consumerName || pay.details.cardHolder)) || "" : "";
        const meta = pay && pay.metadata ? JSON.stringify(pay.metadata).slice(0, 200) : "";
        const prof = pay && profiles[pay.profileId] ? profiles[pay.profileId] + ": " : "";
        if (type === "payment") {
          await newTx(acc.id, { valueDate: iso(d), entryDate: iso(d), amount: s2(init), payeePayerName: name, paymtPurpose: (prof + (pay ? pay.description || "" : "Zahlung") + (meta ? " · " + meta : "") + " · " + pid).trim(), mollieId: t.id, mollieType: type, molliePayment: pid });
          res.added++;
          if (Math.abs(ded) > 0.004) { await newTx(acc.id, { valueDate: iso(d), entryDate: iso(d), amount: s2(ded), payeePayerName: "Mollie B.V.", paymtPurpose: "Mollie-Gebühr zu " + pid, mollieId: t.id + ":fee", mollieType: "fee", mollieFee: true }); res.fees++; }
        } else if (type === "outgoing-transfer" || type === "outgoing-transfer-reversal") {
          const tx = await newTx(acc.id, { valueDate: iso(d), entryDate: iso(d), amount: s2(res0), payeePayerName: "Auszahlung Bank", paymtPurpose: "Mollie-Auszahlung (Geldtransit) " + ctxId(t.context, /stl_\w+/), mollieId: t.id, mollieType: type });
          res.payouts++; if (res0 < 0 && await linkPayout(tx, -res0, d)) res.linked++;
        } else {
          const label = { refund: "Rückerstattung", chargeback: "Rückbuchung (Chargeback)", "application-fee": "Provision (Mollie Connect)", "split-payment": "Anteil Split-Zahlung", "invoice-compensation": "Mollie-Rechnung verrechnet", "balance-correction": "Korrektur", "failed-payment-fee": "Gebühr fehlgeschlagene Zahlung" }[type] || type;
          await newTx(acc.id, { valueDate: iso(d), entryDate: iso(d), amount: s2(res0), payeePayerName: type === "application-fee" || type === "invoice-compensation" ? "Mollie B.V." : name, paymtPurpose: (label + " " + (prof + (pay ? pay.description || "" : "")) + " " + (pid || "")).trim(), mollieId: t.id, mollieType: type, mollieFee: /fee|compensation/.test(type) && type !== "application-fee" });
          res.added++;
        }
        have.add(t.id);
      }
      res.accounts.push({ id: String(acc.id), name: acc.name, balance: amt(b.availableAmount) + amt(b.pendingAmount) });
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
      const relinked = await relink(), feesLinked = await linkFees();
      STATE.last = { at: new Date().toISOString(), orgs: out, relinked, feesLinked }; STATE.at = STATE.last.at; return STATE.last;
    } catch (e) { STATE.error = e.message; throw e; } finally { STATE.running = false; }
  }
  function status() { return { configured: tokens().length, keys: tokens().map(t => t.key), at: STATE.at, running: STATE.running, last: STATE.last, error: STATE.error }; }
  return { sync, status, relink, linkFees };
};
