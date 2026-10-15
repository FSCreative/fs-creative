"use strict";
// Railway-Rechnungen automatisch holen (Railway GraphQL: workspace.customer.invoices mit pdfURL) und als Beleg ablegen.
// Zuordnung über die Kartenzahlung „E-COMM … USD … RAILWAY“ (USD-Betrag = Rechnungssumme, Datum ab Periodenende ±4 Tage):
//  – Zahlung hängt schon an einem Beleg ohne Datei → PDF anhängen
//  – noch kein Beleg → Beleg anlegen (Railway Corporation, USA: Reverse Charge Drittland, Software/Hosting, Betrag in EUR laut Bank)
//    und NICHT selbst mit der Zahlung verbinden – das schlägt „Zur Prüfung“ (Beleg ↔ Buchung) zum Bestätigen vor.
// Verarbeitete Rechnungs-IDs liegen in fin_meta „railwayInv“. Läuft beim Start (verzögert) und danach alle 6 Std.
module.exports = function (D) {
  const { L, gql, workspace, getMeta, setMeta, onChange } = D;
  const r2 = n => Math.round((+n || 0) * 100) / 100, day = v => String(v || "").slice(0, 10);
  const CATEGORY = "2819", SUPPLIER = "Railway Corporation";   // „Software-Miete / Lizenzen“ wie bisher
  let LAST = { at: null, found: 0, attached: 0, created: 0, err: "" }, busy = false;
  async function invoices() {
    const j = await gql("query($id:String!){ workspace(workspaceId:$id){ customer{ invoices{ invoiceId total amountPaid status periodStart periodEnd pdfURL hostedURL } } } }", { id: workspace() });
    if (!j || j.errors) throw new Error("Railway: " + ((j && j.errors && j.errors[0] && j.errors[0].message) || "keine Antwort"));
    return (((j.data || {}).workspace || {}).customer || {}).invoices || [];
  }
  const usdOf = t => { const m = String(t.paymtPurpose || "").match(/E-COMM\s+([\d.]+,\d{2})\s+USD/i); return m ? +m[1].replace(/\./g, "").replace(",", ".") : null; };
  function payFor(inv) {
    const usd = r2((+inv.amountPaid || +inv.total || 0) / 100), end = day(inv.periodEnd);
    return L.all("CheckAccountTransaction").filter(t => /railway/i.test(String(t.paymtPurpose || "") + " " + String(t.payeePayerName || "")) && +t.amount < 0)
      .filter(t => Math.abs((usdOf(t) || -1) - usd) < 0.01 && Math.abs((Date.parse(day(t.valueDate)) - Date.parse(end)) / 864e5) <= 4)[0] || null;
  }
  const linkedVoucher = t => { const l = L.all("CheckAccountTransactionLog").find(x => x.checkAccountTransaction && String(x.checkAccountTransaction.id) === String(t.id) && x.object && x.object.objectName === "Voucher"); return l ? L.get("Voucher", l.object.id) : null; };
  async function pdf(url) { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error("PDF " + r.status); const b = Buffer.from(await r.arrayBuffer()); if (b.slice(0, 4).toString() !== "%PDF") throw new Error("keine PDF"); return b; }
  async function run() {
    if (busy) return LAST; busy = true;
    try {
      await L.load(); const done = new Set(((await getMeta("railwayInv").catch(() => null)) || {}).ids || []);
      const list = (await invoices()).filter(i => /paid/i.test(String(i.status || "")) && (+i.amountPaid || +i.total) > 0 && i.pdfURL && day(i.periodEnd) >= "2026-01-01");
      let attached = 0, created = 0;
      for (const inv of list) {
        if (done.has(inv.invoiceId)) continue;
        const t = payFor(inv); if (!t) continue;   // Zahlung (noch) nicht auf dem Konto → später
        const name = "Railway " + inv.invoiceId + ".pdf", v0 = linkedVoucher(t);
        if (v0 && v0.document && v0.document.id) { done.add(inv.invoiceId); continue; }
        const buf = await pdf(inv.pdfURL), src = { railway: inv.invoiceId, at: new Date().toISOString() };
        if (v0) { await L.attachDoc(v0.id, { buf, type: "application/pdf", name }, src); attached++; done.add(inv.invoiceId); continue; }
        // offener Beleg ohne Datei mit gleichem Betrag (z. B. von Hand angelegt)? → Datei dort anhängen
        const amt = r2(Math.abs(+t.amount)), open = L.all("Voucher").find(v => /railway/i.test(v.supplierName || "") && !(v.document && v.document.id) && Math.abs(Math.abs(+v.sumGross || 0) - amt) < 0.01 && String(v.status) !== "1000");
        if (open) { await L.attachDoc(open.id, { buf, type: "application/pdf", name }, src); attached++; done.add(inv.invoiceId); continue; }
        const body = { voucher: { supplierName: SUPPLIER, description: "Railway " + inv.invoiceId + " · " + day(inv.periodStart) + "–" + day(inv.periodEnd) + " · USD " + r2((+inv.amountPaid || +inv.total) / 100).toFixed(2), voucherDate: day(t.valueDate), creditDebit: "C", status: "100", voucherType: "VOU", taxRule: { id: "12", objectName: "TaxRule" }, reverseCharge: true, rcCountry: "US" },
          voucherPosSave: [{ accountingType: { id: CATEGORY, objectName: "AccountingType" }, taxRate: "0", sumGross: String(amt), net: "false", comment: "Railway Hosting " + day(inv.periodStart) + "–" + day(inv.periodEnd) + " · Reverse Charge 20 % (§ 19 Abs. 1 UStG)" }] };
        const v = (await L.request("POST", "/Voucher/Factory/saveVoucher", { body })).objects.voucher;
        await L.attachDoc(v.id, { buf, type: "application/pdf", name }, src); created++; done.add(inv.invoiceId);
      }
      await setMeta("railwayInv", { ids: Array.from(done).slice(-500) });
      LAST = { at: new Date().toISOString(), found: list.length, attached, created, err: "" };
      if ((attached || created) && onChange) onChange();
    } catch (e) { LAST = Object.assign({}, LAST, { at: new Date().toISOString(), err: String(e.message || e).slice(0, 200) }); }
    finally { busy = false; }
    return LAST;
  }
  return { run, status: () => LAST };
};
