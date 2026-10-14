"use strict";
// Eigene Buchhaltung: beantwortet dieselben Anfragen wie die sevDesk-API (Pfade, Parameter, Antwortformat),
// arbeitet aber mit den übernommenen Daten in Postgres (fin_obj/fin_file). So laufen Cockpit, Steuer und Abgleich unverändert weiter.
// Unterstützt: Lesen mit Filtern/Einbettung/Seiten, Rechnungen/Angebote/Belege anlegen und ändern, Nummernkreise, Summen,
// Zahlungen (bookAmount + Zahlungsprotokoll), Versand (Mail mit PDF), Storno, Mahnung, Angebot → Rechnung, Kontakte, Artikel, Dateien.
module.exports = function (D) {
  const { fin, renderPdf, mailSend } = D;
  const C = {};                       // type -> Map(id -> obj)
  let loaded = null;
  const TMP = new Map();              // uploadTempFile: name -> {buf,type,name,at}
  const r2 = n => Math.round((+n || 0) * 100) / 100;
  const s2 = n => r2(n).toFixed(2);
  const iso = d => d + "T00:00:00+02:00";
  const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date());
  const nowIso = () => new Date().toISOString();
  function dayOf(v) {                 // „TT.MM.JJJJ“, ISO oder Unix → JJJJ-MM-TT
    if (v == null || v === "") return null;
    const t = String(v);
    let m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
    if (/^\d{9,11}$/.test(t)) return new Date(+t * 1000 + 12 * 3600e3).toISOString().slice(0, 10);
    m = t.match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null;
  }
  function err(status, msg) { const e = new Error(msg); e.status = status; return e; }
  async function load(force) {
    if (loaded && !force) return loaded;
    loaded = (async () => {
      await fin.init();
      const r = await fin.db().query("select type, id, data from fin_obj");
      Object.keys(C).forEach(k => delete C[k]);
      r.rows.forEach(x => { (C[x.type] = C[x.type] || new Map()).set(String(x.id), x.data); });
      return true;
    })().catch(e => { loaded = null; throw e; });
    return loaded;
  }
  const all = t => Array.from((C[t] || new Map()).values());
  const get = (t, id) => (C[t] && C[t].get(String(id))) || null;
  const ref = (t, id) => ({ id: String(id), objectName: t });
  function newId(t) { let max = 0; (C[t] || new Map()).forEach((_, k) => { const n = +k; if (n > max) max = n; }); return String(Math.max(max + 1, 900000000)); }
  async function save(t, o) {
    o.objectName = t; o.update = nowIso(); if (!o.create) o.create = o.update;
    (C[t] = C[t] || new Map()).set(String(o.id), o);
    await fin.db().query("insert into fin_obj(type,id,data,src) values($1,$2,$3::jsonb,'local') on conflict(type,id) do update set data=excluded.data, src='local', updated_at=now()", [t, String(o.id), JSON.stringify(o)]);
    return o;
  }
  async function del(t, id) { if (C[t]) C[t].delete(String(id)); await fin.db().query("delete from fin_obj where type=$1 and id=$2", [t, String(id)]); }

  // ── Lesen ──
  const DATEF = { Invoice: "invoiceDate", Voucher: "voucherDate", Order: "orderDate", CheckAccountTransaction: "valueDate", CreditNote: "creditNoteDate" };
  const SKIPQ = { limit: 1, offset: 1, embed: 1, depth: 1, showAll: 1, countAll: 1, startDate: 1, endDate: 1, isBooked: 1, download: 1, preventSendBy: 1, onlyCredit: 1, onlyDebit: 1 };
  function filterList(t, q) {
    let arr = all(t);
    Object.keys(q || {}).forEach(k => {
      if (SKIPQ[k] || /\[objectName\]$/.test(k)) return;
      const v = String(q[k]);
      const m = k.match(/^(\w+)\[id\]$/);
      if (m) arr = arr.filter(o => o[m[1]] && String(o[m[1]].id) === v);
      else arr = arr.filter(o => o[k] == null ? false : String(o[k]) === v);
    });
    const df = DATEF[t];
    if (df && (q.startDate || q.endDate)) {
      const s = q.startDate ? dayOf(q.startDate) : null, e = q.endDate ? dayOf(q.endDate) : null;
      arr = arr.filter(o => { const d = dayOf(o[df]); return d && (!s || d >= s) && (!e || d <= e); });
    }
    if (t === "CheckAccountTransaction") {
      if (String(q.isBooked) === "false") arr = arr.filter(o => String(o.status) === "100");
      if (q.onlyCredit) arr = arr.filter(o => +o.amount > 0); if (q.onlyDebit) arr = arr.filter(o => +o.amount < 0);
    }
    return arr;
  }
  function embed(o, q) {
    if (!q || !q.embed) return o;
    const fields = String(q.embed).split(",").map(x => x.trim()).filter(Boolean);
    const c = Object.assign({}, o);
    fields.forEach(f => { const r = c[f]; if (r && r.id && r.objectName) { const full = get(r.objectName, r.id); if (full) c[f] = full; } });
    return c;
  }
  function page(arr, q) { const off = +q.offset || 0, lim = +q.limit || 100; return arr.slice(off, off + lim); }
  function sortById(arr) { return arr.slice().sort((a, b) => (+b.id) - (+a.id)); }

  // ── Summen ──
  function posSums(p) {
    const q = +p.quantity || 0, rate = +p.taxRate || 0;
    let net = p.price != null ? +p.price : (p.priceNet != null ? +p.priceNet : 0);
    const disc = +p.discount || 0;
    const sumNet = r2(net * q * (1 - disc / 100)), sumTax = r2(sumNet * rate / 100);
    return Object.assign(p, { price: s2(net), priceNet: s2(net), priceTax: s2(net * rate / 100), priceGross: s2(net * (1 + rate / 100)), sumNet: s2(sumNet), sumTax: s2(sumTax), sumGross: s2(sumNet + sumTax) });
  }
  function docSums(o, posArr) {
    const net = r2(posArr.reduce((a, p) => a + (+p.sumNet || 0), 0)), tax = r2(posArr.reduce((a, p) => a + (+p.sumTax || 0), 0));
    o.sumNet = s2(net); o.sumTax = s2(tax); o.sumGross = s2(net + tax); o.sumDiscounts = "0.00"; o.sumNetForeignCurrency = o.sumNet; o.sumGrossForeignCurrency = o.sumGross;
    return o;
  }
  function positionsOf(t, id) { const pt = t + "Pos", key = t.charAt(0).toLowerCase() + t.slice(1); return all(pt).filter(p => p[key] && String(p[key].id) === String(id)).sort((a, b) => (+a.positionNumber || 0) - (+b.positionNumber || 0)); }

  // ── Nummernkreise (übernommene SevSequence) ──
  function seqFor(objectType, type) {
    return all("SevSequence").find(s => String(s.forObject || s.objectType || "") === objectType && String(s.type || "") === type) || null;
  }
  function fmtNr(seq, n) {
    const d = today();
    if (seq && seq.format && /\[%NUMBER\]/.test(seq.format)) return String(seq.format).replace("[%NUMBER]", n).replace(/\[%YEAR\]/g, d.slice(0, 4)).replace(/\[%SHORTYEAR\]/g, d.slice(2, 4)).replace(/\[%MONTH\]/g, d.slice(5, 7)).replace(/\[%DAY\]/g, d.slice(8, 10));
    return null;
  }
  async function nextNumber(objectType, type, field, prefix) {
    const seq = seqFor(objectType, type);
    // höchste vorhandene Nummer als Sicherheitsnetz (z. B. wenn der Nummernkreis nicht übernommen wurde)
    let best = 0, pre = prefix;
    all(objectType).forEach(o => { if (type && o[objectType === "Invoice" ? "invoiceType" : "orderType"] && String(o[objectType === "Invoice" ? "invoiceType" : "orderType"]) !== type) return; const m = String(o[field] || "").match(/^(.*?)(\d+)$/); if (m && +m[2] > best && (!prefix || m[1] === prefix)) { best = +m[2]; pre = m[1]; } });
    let n = Math.max(best + 1, seq && +seq.nextSequence || 0);
    const nr = fmtNr(seq, n) || ((pre || prefix || "") + n);
    if (seq) { seq.nextSequence = String(n + 1); await save("SevSequence", seq); }
    return nr;
  }

  // ── Rechnungen ──
  const INV_PREFIX = { RE: "RE-", SR: "RE-", MA: "MA-", AR: "AR-", ER: "ER-", TR: "TR-" };
  async function saveInvoice(body) {
    const inv = Object.assign({}, body.invoice || {});
    let o = inv.id ? get("Invoice", inv.id) : null;
    if (o && String(o.status) !== "100") throw err(400, "Nur Entwürfe können geändert werden");
    const isNew = !o;
    o = Object.assign(o || { id: newId("Invoice"), status: "100", paidAmount: "0", currency: "EUR", invoiceType: "RE" }, stripMeta(inv));
    if (inv.invoiceDate) o.invoiceDate = iso(dayOf(inv.invoiceDate)); if (inv.deliveryDate) o.deliveryDate = iso(dayOf(inv.deliveryDate)); if (inv.deliveryDateUntil) o.deliveryDateUntil = iso(dayOf(inv.deliveryDateUntil));
    if (!o.invoiceDate) o.invoiceDate = iso(today());
    if (isNew && !o.invoiceNumber) o.invoiceNumber = await nextNumber("Invoice", o.invoiceType || "RE", "invoiceNumber", INV_PREFIX[o.invoiceType] || "RE-");
    // Positionen
    (body.invoicePosDelete || []).forEach(p => { if (p && p.id) { const x = get("InvoicePos", p.id); if (x) { C.InvoicePos.delete(String(p.id)); fin.db().query("delete from fin_obj where type='InvoicePos' and id=$1", [String(p.id)]).catch(() => {}); } } });
    const saved = [];
    for (const p of (body.invoicePosSave || [])) {
      const x = Object.assign(p.id ? (get("InvoicePos", p.id) || {}) : { id: newId("InvoicePos") }, stripMeta(p), { invoice: ref("Invoice", o.id) });
      posSums(x); await save("InvoicePos", x); saved.push(x);
    }
    docSums(o, positionsOf("Invoice", o.id));
    await save("Invoice", o);
    return { objects: { invoice: o, invoicePos: saved } };
  }
  function stripMeta(x) { const c = Object.assign({}, x); delete c.mapAll; delete c.objectName; delete c.create; delete c.update; return c; }
  async function invoiceSendBy(id, b) {
    const o = need("Invoice", id);
    if (b && b.sendDraft) return { objects: o };
    if (String(o.status) === "100") o.status = "200";
    o.sendDate = nowIso(); o.sendType = (b && b.sendType) || "VPDF";
    await save("Invoice", o); return { objects: o };
  }
  function need(t, id) { const o = get(t, id); if (!o) throw err(400, t + " nicht gefunden"); return o; }
  async function pdfOf(t, id) {
    const f = await fin.getFile("pdf", t, id);
    if (f && String((get(t, id) || {}).status) !== "100" && !(get(t, id) || {})._dirty) return { buf: f.data, type: f.mime || "application/pdf", name: f.filename };
    const o = need(t, id);
    const buf = await renderPdf(t, o, positionsOf(t, id), { get, all });
    const name = (o.invoiceNumber || o.orderNumber || o.creditNoteNumber || t) + ".pdf";
    // nur abgeschlossene Dokumente als unveränderliches PDF ablegen
    if (String(o.status) !== "100") await fin.putFileRaw("pdf", t, id, { buf, type: "application/pdf", name });
    return { buf, type: "application/pdf", name };
  }
  async function invoiceSendMail(id, b) {
    const o = need("Invoice", id);
    if (String(o.status) === "100") { o.status = "200"; await save("Invoice", o); }
    const pdf = await pdfOf("Invoice", id);
    await mailSend({ to: b.toEmail, cc: b.ccEmail || undefined, bcc: b.bccEmail || undefined, subject: b.subject, html: b.text, copy: !!b.copy,
      attachments: [{ filename: pdf.name, content: pdf.buf.toString("base64"), contentType: "application/pdf" }] });
    o.sendDate = nowIso(); o.sendType = "VM"; await save("Invoice", o);
    return { objects: { id: o.id } };
  }
  async function bookAmount(t, id, b) {
    const o = need(t, id); let amt = r2(b.amount); if (!(amt > 0)) throw err(400, "Betrag fehlt");
    const day = dayOf(b.date) || today();
    let tx = b.checkAccountTransaction && b.checkAccountTransaction.id ? get("CheckAccountTransaction", b.checkAccountTransaction.id) : null;
    const accId = b.checkAccount && b.checkAccount.id ? String(b.checkAccount.id) : (tx && tx.checkAccount ? String(tx.checkAccount.id) : "");
    if (!tx) {   // Zahlung ohne Bankumsatz (bar, Kasse, PayPal …): Umsatz auf dem gewählten Konto anlegen
      const sign = t === "Voucher" && String(o.creditDebit) === "C" ? -1 : 1;
      tx = { id: newId("CheckAccountTransaction"), valueDate: iso(day), entryDate: iso(day), amount: s2(sign * amt), paymtPurpose: (o.invoiceNumber || o.description || o.supplierName || "Zahlung"), payeePayerName: t === "Voucher" ? (o.supplierName || "") : "", checkAccount: ref("CheckAccount", accId), status: "200" };
    } else tx.status = "200";
    await save("CheckAccountTransaction", tx);
    // Zahlung zu einer gemahnten Rechnung: was über den offenen Betrag hinausgeht, deckt zuerst die Mahngebühr (eigener Einnahme-Beleg, 0 %)
    let feePart = 0;
    if (t === "Invoice" && +o.dunningFeeOpen > 0) { const openAmt = r2(Math.abs(+o.sumGross || 0) - (+o.paidAmount || 0)); feePart = Math.min(+o.dunningFeeOpen, Math.max(0, r2(amt - openAmt))); if (b.feeAmount != null) feePart = Math.min(+o.dunningFeeOpen, Math.max(0, r2(+b.feeAmount)), amt); }
    if (feePart > 0) { await bookFee(o, feePart, tx, day); amt = r2(amt - feePart); if (amt <= 0.004) { await save(t, o); return { objects: {} }; } }
    const paid = r2((+o.paidAmount || 0) + amt), gross = Math.abs(+o.sumGross || 0);
    o.paidAmount = s2(paid); o.payDate = iso(day);
    o.status = paid >= gross - 0.005 ? "1000" : "750";
    await save(t, o);
    const log = { id: newId("CheckAccountTransactionLog"), object: ref(t, o.id), checkAccountTransaction: ref("CheckAccountTransaction", tx.id), amountPaid: s2(amt), bookingDate: iso(day), fromStatus: "100", toStatus: o.status };
    await save("CheckAccountTransactionLog", log);
    return { objects: log };
  }
  async function resetToOpen(t, id) {
    const o = need(t, id); if (o.enshrined) throw err(400, "Festgeschrieben");
    for (const l of all("CheckAccountTransactionLog").filter(l => l.object && l.object.objectName === t && String(l.object.id) === String(id))) {
      const tx = l.checkAccountTransaction && get("CheckAccountTransaction", l.checkAccountTransaction.id); if (tx) { tx.status = "100"; await save("CheckAccountTransaction", tx); }
      await del("CheckAccountTransactionLog", l.id);
    }
    o.paidAmount = "0"; o.payDate = null; o.status = t === "Voucher" ? "100" : "200"; await save(t, o); return { objects: o };
  }
  async function resetToDraft(t, id) { const o = need(t, id); if (o.enshrined) throw err(400, "Festgeschrieben"); if (+o.paidAmount > 0) throw err(400, "Bereits bezahlt"); o.status = t === "Voucher" ? "50" : "100"; await save(t, o); return { objects: o }; }
  async function cancelInvoice(id) {
    const o = need("Invoice", id); if (String(o.invoiceType) === "SR") throw err(400, "Stornorechnung kann nicht storniert werden");
    const sr = Object.assign({}, o, { id: newId("Invoice"), invoiceType: "SR", invoiceNumber: await nextNumber("Invoice", "RE", "invoiceNumber", "RE-"), invoiceDate: iso(today()), status: "1000", origin: ref("Invoice", o.id), header: "Stornorechnung zu " + (o.invoiceNumber || ""), sendDate: null, enshrined: null });
    for (const p of positionsOf("Invoice", id)) { const x = Object.assign({}, p, { id: newId("InvoicePos"), invoice: ref("Invoice", sr.id), quantity: String(-(+p.quantity || 0)) }); posSums(x); await save("InvoicePos", x); }
    docSums(sr, positionsOf("Invoice", sr.id)); sr.paidAmount = sr.sumGross; sr.payDate = iso(today());
    await save("Invoice", sr);
    o.status = "1000"; o.cancelled = true; o.paidAmount = o.sumGross; await save("Invoice", o);
    return { objects: sr };
  }
  // Mahnung (MA): offener Betrag + optional Mahngebühr. Mahngebühren/Verzugszinsen sind in Österreich Schadenersatz →
  // nicht umsatzsteuerbar (0 %, nicht in der UVA), aber Betriebseinnahme. Die Gebühr wird an der Rechnung vermerkt und beim
  // Zahlungseingang als eigener Einnahme-Beleg verbucht (siehe bookAmount).
  const DUN_TITLE = l => l <= 1 ? "Zahlungserinnerung" : l === 2 ? "1. Mahnung" : l === 3 ? "2. Mahnung" : "Letzte Mahnung";
  async function createReminder(id, opt) {
    opt = opt || {};
    const o = need("Invoice", id);
    if (String(o.invoiceType) !== "RE" && String(o.invoiceType) !== "AR") throw err(400, "Nur Rechnungen können gemahnt werden");
    if (!(+o.status === 200 || +o.status === 750)) throw err(400, "Rechnung ist nicht offen");
    const lvl = (+o.dunningLevel || 0) + 1, open = r2((+o.sumGross || 0) - (+o.paidAmount || 0));
    const fee = Math.max(0, r2(+opt.dunningFee || 0)), prevFees = r2(+o.dunningFeeOpen || 0), days = Math.max(1, parseInt(opt.timeToPay, 10) || 7);
    const title = DUN_TITLE(lvl);
    const ma = { id: newId("Invoice"), invoiceType: "MA", status: "100", invoiceNumber: await nextNumber("Invoice", "MA", "invoiceNumber", "MA-"), invoiceDate: iso(today()), contact: o.contact, address: o.address, addressCountry: o.addressCountry, contactPerson: o.contactPerson,
      header: title + " zu Rechnung " + (o.invoiceNumber || ""), headText: lvl <= 1 ? "Sicher haben Sie es nur übersehen: Zu der unten genannten Rechnung konnten wir noch keinen Zahlungseingang feststellen. Wir bitten Sie, den offenen Betrag innerhalb von " + days + " Tagen zu überweisen." : "Leider konnten wir zu der unten genannten Rechnung trotz Zahlungserinnerung noch keinen Zahlungseingang feststellen. Wir bitten Sie, den offenen Betrag" + (fee + prevFees > 0 ? " zuzüglich Mahngebühr" : "") + " innerhalb von " + days + " Tagen zu überweisen.",
      footText: "Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos." + (fee + prevFees > 0 ? " Mahngebühren sind als Schadenersatz nicht umsatzsteuerbar." : ""), timeToPay: String(days), origin: ref("Invoice", o.id), dunningLevel: String(lvl), dunningFee: s2(fee), taxRate: "0", taxType: o.taxType, currency: "EUR", paidAmount: "0", taxText: "Mahngebühr nicht umsatzsteuerbar (Schadenersatz)" };
    const ps = [{ id: newId("InvoicePos"), invoice: ref("Invoice", ma.id), positionNumber: "0", name: "Offener Betrag Rechnung " + (o.invoiceNumber || ""), text: "vom " + (dayOf(o.invoiceDate) || "").split("-").reverse().join("."), quantity: "1", price: s2(open), taxRate: "0", unity: ref("Unity", 1) }];
    if (prevFees > 0) ps.push({ id: newId("InvoicePos"), invoice: ref("Invoice", ma.id), positionNumber: "1", name: "Mahngebühren aus früheren Mahnungen", text: "nicht umsatzsteuerbar (Schadenersatz)", quantity: "1", price: s2(prevFees), taxRate: "0", unity: ref("Unity", 1) });
    if (fee > 0) ps.push({ id: newId("InvoicePos"), invoice: ref("Invoice", ma.id), positionNumber: "2", name: "Mahngebühr (" + title + ")", text: "nicht umsatzsteuerbar (Schadenersatz)", quantity: "1", price: s2(fee), taxRate: "0", unity: ref("Unity", 1) });
    for (const p of ps) { posSums(p); await save("InvoicePos", p); }
    docSums(ma, ps); await save("Invoice", ma);
    o.dunningLevel = String(lvl); o.reminderDeadline = iso(addDays(today(), days)); o.dunningFeeOpen = s2(prevFees + fee); await save("Invoice", o);
    return { objects: ma };
  }
  function addDays(d, n) { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  // Einnahme-Beleg für eine bezahlte Mahngebühr (0 %, nicht steuerbar) – verknüpft mit demselben Bankumsatz
  function feeAccountingType() {
    const ats = all("AccountingType"), rx = [/mahn/i, /schadenersatz/i, /sonstige (betriebliche )?ertr/i, /sonstige erl/i, /ertr/i, /erl[öo]s/i];
    for (const r of rx) { const a = ats.find(x => r.test(String(x.name || ""))); if (a) return a; }
    return null;
  }
  async function bookFee(inv, amt, tx, day) {
    const c = inv.contact && get("Contact", inv.contact.id), at = feeAccountingType();
    const v = { id: newId("Voucher"), status: "1000", creditDebit: "D", voucherType: "VOU", currency: "EUR", voucherDate: iso(day), payDate: iso(day), paidAmount: s2(amt),
      supplierName: (c && (c.name || [c.surename, c.familyname].filter(Boolean).join(" "))) || "", description: "Mahngebühr zu Rechnung " + (inv.invoiceNumber || "") + " – Schadenersatz, nicht umsatzsteuerbar",
      taxType: "noteu", taxText: "nicht umsatzsteuerbar (Schadenersatz)", origin: ref("Invoice", inv.id), dunningFee: true };
    const p = { id: newId("VoucherPos"), voucher: ref("Voucher", v.id), taxRate: "0", sumNet: s2(amt), sumGross: s2(amt), sumTax: "0.00", sumNetAccounting: s2(amt), sumGrossAccounting: s2(amt), sumTaxAccounting: "0.00", net: "false", comment: "Mahngebühr (Schadenersatz) – nicht umsatzsteuerbar" };
    if (at) p.accountingType = ref("AccountingType", at.id);
    await save("VoucherPos", p);
    v.sumNet = s2(amt); v.sumGross = s2(amt); v.sumTax = "0.00"; await save("Voucher", v);
    await save("CheckAccountTransactionLog", { id: newId("CheckAccountTransactionLog"), object: ref("Voucher", v.id), checkAccountTransaction: ref("CheckAccountTransaction", tx.id), amountPaid: s2(amt), bookingDate: iso(day), fromStatus: "100", toStatus: "1000" });
    inv.dunningFeeOpen = s2(Math.max(0, r2((+inv.dunningFeeOpen || 0) - amt))); inv.dunningFeePaid = s2(r2((+inv.dunningFeePaid || 0) + amt));
    return v;
  }
  async function invoiceFromOrder(body) {
    const od = need("Order", body.order && body.order.id);
    const inv = { invoice: { contact: od.contact, address: od.address, addressCountry: od.addressCountry, contactPerson: od.contactPerson, header: "Rechnung", headText: od.headText, footText: "Zahlbar innerhalb von 14 Tagen ohne Abzug.", timeToPay: "14", taxRate: od.taxRate, taxType: od.taxType, taxSet: od.taxSet, taxRule: od.taxRule, invoiceType: "RE", origin: ref("Order", od.id), deliveryDate: iso(today()) },
      invoicePosSave: positionsOf("Order", od.id).map((p, k) => ({ name: p.name, text: p.text, quantity: p.quantity, price: p.price, taxRate: p.taxRate, unity: p.unity, positionNumber: String(k), part: p.part })) };
    const r = await saveInvoice(inv);
    od.status = "1000"; await save("Order", od);
    return { objects: [r.objects.invoice] };
  }

  // ── Gutschriften (z. B. kochdu-Auszahlungen) ──
  async function saveCreditNote(body) {
    const cb = Object.assign({}, body.creditNote || {});
    let o = cb.id ? get("CreditNote", cb.id) : null; const isNew = !o;
    o = Object.assign(o || { id: newId("CreditNote"), status: "100", currency: "EUR", paidAmount: "0" }, stripMeta(cb));
    if (cb.creditNoteDate) o.creditNoteDate = iso(dayOf(cb.creditNoteDate)); if (!o.creditNoteDate) o.creditNoteDate = iso(today());
    if (cb.deliveryDate) o.deliveryDate = iso(dayOf(cb.deliveryDate));
    if (isNew && !cb.creditNoteNumber) o.creditNoteNumber = await nextNumber("CreditNote", "", "creditNoteNumber", "GU-");
    for (const p of (body.creditNotePosDelete || [])) if (p && p.id) await del("CreditNotePos", p.id);
    for (const p of (body.creditNotePosSave || [])) { const x = Object.assign(p.id ? (get("CreditNotePos", p.id) || {}) : { id: newId("CreditNotePos") }, stripMeta(p), { creditNote: ref("CreditNote", o.id) }); posSums(x); await save("CreditNotePos", x); }
    docSums(o, positionsOf("CreditNote", o.id)); await save("CreditNote", o);
    return { objects: { creditNote: o } };
  }

  // ── Angebote ──
  async function saveOrder(body) {
    const od = Object.assign({}, body.order || {});
    let o = od.id ? get("Order", od.id) : null; const isNew = !o;
    o = Object.assign(o || { id: newId("Order"), status: "100", orderType: "AN", currency: "EUR", version: "0" }, stripMeta(od));
    if (od.orderDate) o.orderDate = iso(dayOf(od.orderDate)); if (!o.orderDate) o.orderDate = iso(today());
    if (isNew && !od.orderNumber) o.orderNumber = await nextNumber("Order", o.orderType || "AN", "orderNumber", (o.orderType || "AN") + "-");
    (body.orderPosDelete || []).forEach(p => { if (p && p.id && C.OrderPos) C.OrderPos.delete(String(p.id)); });
    for (const p of (body.orderPosSave || [])) { const x = Object.assign(p.id ? (get("OrderPos", p.id) || {}) : { id: newId("OrderPos") }, stripMeta(p), { order: ref("Order", o.id) }); posSums(x); await save("OrderPos", x); }
    docSums(o, positionsOf("Order", o.id)); await save("Order", o);
    return { objects: { order: o } };
  }

  // ── Belege ──
  async function saveVoucher(body) {
    const vb = Object.assign({}, body.voucher || {});
    let o = vb.id ? get("Voucher", vb.id) : null;
    o = Object.assign(o || { id: newId("Voucher"), status: "50", paidAmount: "0", currency: "EUR", creditDebit: "C", voucherType: "VOU" }, stripMeta(vb));
    if (vb.voucherDate) o.voucherDate = iso(dayOf(vb.voucherDate)); if (vb.deliveryDate) o.deliveryDate = iso(dayOf(vb.deliveryDate)); if (vb.deliveryDateUntil) o.deliveryDateUntil = iso(dayOf(vb.deliveryDateUntil));
    if (!o.voucherDate) o.voucherDate = iso(today());
    for (const p of (body.voucherPosDelete || [])) if (p && p.id) await del("VoucherPos", p.id);
    for (const p of (body.voucherPosSave || [])) {
      const x = Object.assign(p.id ? (get("VoucherPos", p.id) || {}) : { id: newId("VoucherPos") }, stripMeta(p), { voucher: ref("Voucher", o.id) });
      const rate = +x.taxRate || 0; let g = +x.sumGross, n = +x.sumNet;
      if (String(x.net) === "true" || x.net === true) { g = r2(n * (1 + rate / 100)); } else { n = r2(g / (1 + rate / 100)); }
      x.sumNet = s2(n); x.sumGross = s2(g); x.sumTax = s2(g - n); x.sumNetAccounting = x.sumNet; x.sumGrossAccounting = x.sumGross; x.sumTaxAccounting = x.sumTax;
      await save("VoucherPos", x);
    }
    const ps = all("VoucherPos").filter(p => p.voucher && String(p.voucher.id) === String(o.id));
    o.sumNet = s2(ps.reduce((a, p) => a + (+p.sumNet || 0), 0)); o.sumTax = s2(ps.reduce((a, p) => a + (+p.sumTax || 0), 0)); o.sumGross = s2(ps.reduce((a, p) => a + (+p.sumGross || 0), 0));
    if (body.filename && TMP.has(body.filename)) {   // Belegdatei aus uploadTempFile
      const f = TMP.get(body.filename); TMP.delete(body.filename);
      const docId = newId("Document"); await save("Document", { id: docId, filename: f.name, mimeType: f.type, object: ref("Voucher", o.id) });
      o.document = ref("Document", docId); await fin.putFileRaw("doc", "Voucher", o.id, f);
    }
    await save("Voucher", o);
    return { objects: { voucher: o } };
  }
  async function uploadTemp(form) {
    const file = form && form.get ? form.get("file") : null; if (!file) throw err(400, "Datei fehlt");
    const buf = Buffer.from(await file.arrayBuffer()), name = file.name || "beleg";
    const key = "tmp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + "_" + name.replace(/[^\w.\-]/g, "_");
    TMP.set(key, { buf, type: file.type || "application/octet-stream", name, at: Date.now() });
    for (const [k, v] of TMP) if (Date.now() - v.at > 3600e3) TMP.delete(k);
    return { objects: { filename: key } };
  }

  // ── Generisches Anlegen/Ändern (Kontakte, Adressen, Kommunikation, Artikel, Umsätze …) ──
  async function create(t, body) { const o = Object.assign({ id: newId(t) }, stripMeta(body || {})); await save(t, o); return { objects: o }; }
  async function update(t, id, body) {
    const o = need(t, id);
    if ((t === "Invoice" || t === "Voucher") && o.enshrined && Object.keys(body || {}).some(k => k !== "status")) throw err(400, "Festgeschrieben");
    Object.assign(o, stripMeta(body || {})); delete o.id; o.id = String(id);
    if (t === "Order" && body && body.status != null) o.status = String(body.status);
    await save(t, o); return { objects: o };
  }

  // ── Haupteinstieg: wie sev(method, path, opts) ──
  async function request(method, path, opts) {
    opts = opts || {}; await load();
    const q = opts.query || {}, b = opts.body;
    const p = String(path).split("?")[0].replace(/\/+$/, "");
    const seg = p.split("/").filter(Boolean);
    const T = seg[0], id = seg[1] && /^\d+$/.test(seg[1]) ? seg[1] : null, act = id ? seg[2] : seg[1];
    // Spezialfälle
    if (p === "/Tools/bookkeepingSystemVersion") return { objects: { version: "1.0" } };
    if (/^\/ReceiptGuidance\//.test(p)) return { objects: [] };
    if (p === "/StaticCountry") return { objects: [{ id: "1", code: "de", name: "Deutschland" }, { id: "3", code: "at", name: "Österreich" }, { id: "4", code: "ch", name: "Schweiz" }, { id: "10", code: "it", name: "Italien" }, { id: "15", code: "li", name: "Liechtenstein" }] };
    if (p === "/SevSequence/Factory/getByType") { const s = seqFor(String(q.objectType || ""), String(q.type || "")); return { objects: s ? [s] : [] }; }
    if (p === "/Invoice/Factory/getNextInvoiceNumber") {
      const t = String(q.invoiceType || "RE"), nr = await nextNumber("Invoice", t, "invoiceNumber", INV_PREFIX[t] || "RE-");
      if (String(q.useNextNumber) !== "true") { const seq = seqFor("Invoice", t); if (seq) { seq.nextSequence = String((+seq.nextSequence || 1) - 1); await save("SevSequence", seq); } }
      return { objects: nr };
    }
    if (p === "/Contact/Factory/getNextCustomerNumber") { let mx = 1000; all("Contact").forEach(c => { const n = parseInt(c.customerNumber, 10); if (n > mx) mx = n; }); return { objects: String(mx + 1) }; }
    if (method === "GET" && T === "CheckAccount" && act === "getBalanceAtDate") {
      const d = dayOf(q.date) || today();
      const bal = all("CheckAccountTransaction").filter(x => x.checkAccount && String(x.checkAccount.id) === id && (dayOf(x.valueDate) || "") <= d).reduce((a, x) => a + (+x.amount || 0), 0);
      return { objects: s2(bal) };
    }
    if (method === "GET" && (act === "getPdf") && (T === "Invoice" || T === "Order" || T === "CreditNote")) { const f = await pdfOf(T, id); return opts.binary ? { buf: f.buf, type: f.type, disposition: 'inline; filename="' + f.name + '"' } : { objects: { filename: f.name, mimeType: f.type, base64encoded: true, content: f.buf.toString("base64") } }; }
    if (method === "GET" && act === "getPositions" && T === "Invoice") { const arr = positionsOf("Invoice", id); return { objects: page(arr, q) }; }
    if (method === "GET" && (T === "Document" || (T === "Voucher" && act === "getDocument"))) {
      const vid = T === "Voucher" ? id : (all("Voucher").find(v => v.document && String(v.document.id) === id) || {}).id;
      const f = vid ? await fin.getFile("doc", "Voucher", vid) : null; if (!f) throw err(404, "Datei nicht vorhanden");
      return { buf: f.data, type: f.mime || "application/octet-stream", disposition: 'inline; filename="' + (f.filename || "beleg") + '"' };
    }
    // Schreiben
    if (method !== "GET") {
      if (p === "/Invoice/Factory/saveInvoice") return saveInvoice(b || {});
      if (p === "/Invoice/Factory/createInvoiceReminder") return createReminder((b && b.invoice && b.invoice.id) || q["invoice[id]"], { dunningFee: b && b.dunningFee, timeToPay: b && b.timeToPay });
      if (p === "/Invoice/Factory/createInvoiceFromOrder") return invoiceFromOrder(b || {});
      if (p === "/Order/Factory/saveOrder") return saveOrder(b || {});
      if (p === "/CreditNote/Factory/saveCreditNote") return saveCreditNote(b || {});
      if (p === "/Voucher/Factory/saveVoucher") return saveVoucher(b || {});
      if (p === "/Voucher/Factory/uploadTempFile") return uploadTemp(opts.form);
      if (p === "/Tag/Factory/create") { const tag = all("Tag").find(x => x.name === (b && b.name)) || (await create("Tag", { name: b && b.name })).objects; const rel = await create("TagRelation", { tag: ref("Tag", tag.id), object: b && b.object }); return { objects: rel.objects }; }
      if (T === "Invoice" && id) {
        if (act === "sendBy") return invoiceSendBy(id, b);
        if (act === "sendViaEmail") return invoiceSendMail(id, b || {});
        if (act === "bookAmount") return bookAmount("Invoice", id, b || {});
        if (act === "cancelInvoice") return cancelInvoice(id);
        if (act === "resetToDraft") return resetToDraft("Invoice", id);
        if (act === "resetToOpen") return resetToOpen("Invoice", id);
        if (act === "enshrine") { const o = need("Invoice", id); o.enshrined = nowIso(); await save("Invoice", o); return { objects: o }; }
      }
      if (T === "Voucher" && id) {
        if (act === "bookAmount") return bookAmount("Voucher", id, b || {});
        if (act === "resetToDraft") return resetToDraft("Voucher", id);
        if (act === "resetToOpen") return resetToOpen("Voucher", id);
        if (act === "enshrine") { const o = need("Voucher", id); o.enshrined = nowIso(); await save("Voucher", o); return { objects: o }; }
      }
      if (T === "Order" && id && act === "sendBy") { const o = need("Order", id); if (String(o.status) === "100") o.status = "200"; o.sendDate = nowIso(); o.sendType = (b && b.sendType) || "VPDF"; await save("Order", o); return { objects: o }; }
      if (method === "POST" && !id && !act) return create(T, b);
      if (method === "PUT" && id && !act) return update(T, id, b);
      if (method === "DELETE" && id && !act) { need(T, id); await del(T, id); return { objects: [null] }; }
      throw err(400, "Nicht unterstützt: " + method + " " + p);
    }
    // Lesen
    if (id && !act) { const o = get(T, id); if (!o) throw err(400, T + " nicht gefunden"); return { objects: [embed(o, q)] }; }
    if (!id && !act) { const arr = sortById(filterList(T, q)).map(o => embed(o, q)); return { objects: page(arr, q), total: arr.length }; }
    throw err(400, "Nicht unterstützt: GET " + p);
  }
  // ── Kontoauszug-Import (George usw.) ──
  async function importBank(accId, items, hashFn, dry) {
    await load(); accId = String(accId);
    if (!get("CheckAccount", accId)) throw err(400, "Konto nicht gefunden");
    const mine = all("CheckAccountTransaction").filter(x => x.checkAccount && String(x.checkAccount.id) === accId);
    const seen = new Set(mine.map(x => x.importHash).filter(Boolean));
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const dupOld = t => mine.some(x => dayOf(x.valueDate) === t.date && Math.abs((+x.amount || 0) - t.amount) < 0.005 && (!t.name || !x.payeePayerName || norm(x.payeePayerName).slice(0, 8) === norm(t.name).slice(0, 8) || norm(x.paymtPurpose).indexOf(norm(t.purpose).slice(0, 16)) > -1));
    let added = 0, dup = 0; const fresh = [];
    for (const t of items) {
      const h = hashFn(accId, t);
      if (seen.has(h) || dupOld(t)) { dup++; continue; }
      seen.add(h); fresh.push(t);
      if (!dry) { await save("CheckAccountTransaction", { id: newId("CheckAccountTransaction"), valueDate: iso(t.date), entryDate: iso(t.bookDate || t.date), amount: s2(t.amount), payeePayerName: t.name || "", payeePayerAcctNo: t.iban || "", paymtPurpose: t.purpose || "", checkAccount: ref("CheckAccount", accId), status: "100", importHash: h, importRef: t.ref || "" }); }
      added++;
    }
    return { total: items.length, added, dup, sample: fresh.slice(0, 5) };
  }
  return { request, load, get, all, positionsOf, save, importBank };
};
