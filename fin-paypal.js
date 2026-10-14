"use strict";
// PayPal direkt (offizielle REST-Schnittstelle „Transaction Search“, nur lesend): Umsätze ab dem Umstieg aufs Konto „PayPal“.
// Eingänge netto mit Gebühr am Umsatz (→ Zahlungsgebühr an der Rechnung), Auszahlungen aufs Bankkonto als Geldtransit,
// Anfangsbestand = PayPal-Saldo beim ersten Abruf. Zugang: PAYPAL_CLIENT_ID + PAYPAL_SECRET (Live-App, Recht „Transaction search“).
module.exports = function (D) {
  const { L, after } = D;
  const BASE = "https://api-m.paypal.com";
  const r2 = n => Math.round((+n || 0) * 100) / 100, s2 = n => r2(n).toFixed(2), day = v => String(v || "").slice(0, 10);
  let STATE = { at: null, running: false, last: null, error: "" }, TOK = { v: "", exp: 0 };
  const cfg = () => ({ id: String(process.env.PAYPAL_CLIENT_ID || "").trim(), secret: String(process.env.PAYPAL_SECRET || "").trim() });
  async function token() {
    if (TOK.v && Date.now() < TOK.exp) return TOK.v;
    const c = cfg(); if (!c.id || !c.secret) throw new Error("PayPal nicht eingerichtet (PAYPAL_CLIENT_ID / PAYPAL_SECRET)");
    const r = await (D.fetch || fetch)(BASE + "/v1/oauth2/token", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(c.id + ":" + c.secret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
    const j = await r.json().catch(() => ({})); if (!r.ok || !j.access_token) throw new Error("PayPal-Anmeldung fehlgeschlagen: " + (j.error_description || r.status));
    TOK = { v: j.access_token, exp: Date.now() + Math.max(60, (+j.expires_in || 3000) - 120) * 1000 }; return TOK.v;
  }
  async function api(path) {
    const r = await (D.fetch || fetch)(BASE + path, { headers: { Authorization: "Bearer " + (await token()), Accept: "application/json" } });
    const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error("PayPal " + r.status + ": " + (j.message || j.name || "Fehler")); e.status = r.status; throw e; } return j;
  }
  async function account() {
    const accs = L.all("CheckAccount").filter(x => String(x.status) !== "0");
    let a = accs.find(x => x.paypal) || accs.find(x => /paypal/i.test(x.name || ""));
    if (!a) a = (await L.request("POST", "/CheckAccount", { body: { name: "PayPal", type: "online", importType: "PAYPAL", currency: "EUR", status: "100", defaultAccount: "0" } })).objects;
    if (!a.paypal) {
      // Umstieg: ab dem letzten vorhandenen Umsatz (CSV/sevDesk) weiter – Doppelte erkennt der Import; ohne Umsätze ab heute + Anfangsbestand
      const last = L.all("CheckAccountTransaction").filter(x => x.checkAccount && String(x.checkAccount.id) === String(a.id)).map(x => day(x.valueDate)).sort().pop();
      a.paypal = true; a.paypalSince = last || new Date().toISOString().slice(0, 10); a.paypalOpening = !last; await L.save("CheckAccount", a);
    }
    return a;
  }
  async function sync() {
    if (STATE.running) return STATE.last; STATE.running = true; STATE.error = "";
    try {
      await L.load(); const acc = await account(), today = new Date().toISOString().slice(0, 10), items = [];
      let from = acc.paypalSince;
      // Transaction Search: max. 31 Tage je Abfrage, Daten ca. 3 Std. verzögert
      while (from <= today) {
        const toD = new Date(from + "T00:00:00Z"); toD.setUTCDate(toD.getUTCDate() + 30); const to = toD.toISOString().slice(0, 10) > today ? today : toD.toISOString().slice(0, 10);
        let page = 1, pages = 1;
        do {
          const j = await api("/v1/reporting/transactions?start_date=" + encodeURIComponent(from + "T00:00:00-0000") + "&end_date=" + encodeURIComponent(to + "T23:59:59-0000") + "&fields=transaction_info,payer_info,cart_info&page_size=500&page=" + page);
          pages = +j.total_pages || 1;
          for (const t of (j.transaction_details || [])) {
            const ti = t.transaction_info || {}, id = ti.transaction_id, code = String(ti.transaction_event_code || "");
            if (!id || (ti.transaction_status && ti.transaction_status !== "S")) continue;                       // nur abgeschlossene
            if (/^T15/.test(code)) continue;                                                                     // Einbehalt/Freigabe: kein echter Geldfluss
            if (((ti.transaction_amount || {}).currency_code || "EUR") !== "EUR") continue;                      // Fremdwährung: EUR-Umrechnungsbuchung zählt
            const gross = r2(+(ti.transaction_amount || {}).value || 0), fee = r2(+(ti.fee_amount || {}).value || 0), d = day(ti.transaction_initiation_date || ti.transaction_updated_date);
            if (!gross || !d) continue;
            const pi = t.payer_info || {}, pn = pi.payer_name || {}, nm = pn.alternate_full_name || [pn.given_name, pn.surname].filter(Boolean).join(" ") || pi.email_address || "";
            const item = ((t.cart_info || {}).item_details || []).map(x => x.item_name).filter(Boolean).join(", ");
            const withdrawal = /^T04/.test(code);                                                               // T04xx = Auszahlung aufs Bankkonto
            const purpose = withdrawal ? "PayPal-Auszahlung auf Bankkonto" : ([ti.transaction_subject, ti.transaction_note, item, ti.invoice_id ? "Rechnung " + ti.invoice_id : "", ti.custom_field].filter(Boolean).join(" · ").slice(0, 260) || "PayPal-Zahlung");
            const it = { date: d, amount: r2(gross + fee), name: withdrawal ? "PayPal" : nm, purpose: purpose + " · " + id, ref: id };
            if (gross > 0 && fee) { it.fee = Math.abs(fee); it.gross = s2(gross); it.feeBy = "PayPal"; }
            items.push(it);
          }
          page++;
        } while (page <= pages && page < 50);
        const nx = new Date(to + "T00:00:00Z"); nx.setUTCDate(nx.getUTCDate() + 1); from = nx.toISOString().slice(0, 10);
      }
      // gleiche Logik wie der Kontoauszug-Import: Doppelte (auch aus CSV) überspringen, PayPal→Bank als Geldtransit paaren
      const imp = items.length ? await L.importBank(acc.id, items, (a, t) => "pp:" + t.ref) : { added: 0, dup: 0 };
      let bal = null;
      try { const b = await api("/v1/reporting/balances?currency_code=EUR"); const e = (b.balances || []).find(x => x.currency === "EUR") || (b.balances || [])[0]; if (e) bal = r2(+(e.total_balance || e.available_balance || {}).value || 0); } catch (e) {}
      const mine = () => L.all("CheckAccountTransaction").filter(x => x.checkAccount && String(x.checkAccount.id) === String(acc.id));
      if (bal != null && acc.paypalOpening && !mine().some(x => x.importRef === "opening")) {
        const open = r2(bal - mine().reduce((a, x) => a + (+x.amount || 0), 0));
        if (Math.abs(open) > 0.004) await L.request("POST", "/CheckAccountTransaction", { body: { checkAccount: { id: String(acc.id), objectName: "CheckAccount" }, status: "400", transitWith: "opening", valueDate: acc.paypalSince + "T00:00:00+02:00", entryDate: acc.paypalSince + "T00:00:00+02:00", amount: s2(open), payeePayerName: "PayPal", paymtPurpose: "Anfangsbestand beim Umstieg (bereits über sevDesk verbucht)", importRef: "opening" } });
      }
      if (bal != null) { acc.paypalApiBalance = bal; acc.paypalDiff = r2(bal - mine().reduce((a, x) => a + (+x.amount || 0), 0)); }
      acc.paypalApiAt = new Date().toISOString(); await L.save("CheckAccount", acc);
      const post = after ? await after().catch(() => ({})) : {};
      STATE.last = { at: acc.paypalApiAt, added: imp.added || 0, dup: imp.dup || 0, fees: items.filter(x => x.fee).length, balance: bal, diff: acc.paypalDiff, post }; STATE.at = STATE.last.at; return STATE.last;
    } catch (e) { STATE.error = e.message; throw e; } finally { STATE.running = false; }
  }
  function status() { const c = cfg(); return { configured: !!(c.id && c.secret), at: STATE.at, running: STATE.running, last: STATE.last, error: STATE.error }; }
  return { sync, status };
};
