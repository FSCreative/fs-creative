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
    if (/^\d{9,11}$/.test(t)) return new Date(+t * 1000 + 3 * 3600e3).toISOString().slice(0, 10);   // Unix (Mitternacht Wien bzw. 12 Uhr UTC) → Kalendertag; +12 Std. verschob 12-Uhr-Werte auf den Folgetag
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
      // Kunden mit Fremdnummer (z. B. „KANT-…“ von früheren Plattform-Anlagen) einmalig in den Kundennummernkreis übernehmen
      for (const c of all("Contact").filter(c => c.customerNumber && !/^\d+$/.test(String(c.customerNumber))).sort((a, b) => String(a.create || "").localeCompare(String(b.create || "")))) { c.externalNumber = c.externalNumber || String(c.customerNumber); c.customerNumber = await nextCustomerNumber(); await save("Contact", c); }
      // Angebote mit nackter Nummer („1052“ – bis 28.10.2026 wurde der Nummernkreis ohne „AN-“ gelesen und nie weitergezählt) einmalig auf die nächste freie AN-Nummer umstellen; die alte Nummer bleibt als formerNumber
      for (const o of all("Order").filter(o => String(o.orderType || "AN") === "AN" && /^\d+$/.test(String(o.orderNumber || ""))).sort((a, b) => String(a.create || "").localeCompare(String(b.create || "")) || (+a.id - +b.id))) {
        const old = String(o.orderNumber); o.formerNumber = old; o.orderNumber = await nextNumber("Order", "AN", "orderNumber", "AN-");
        if (o.header) o.header = String(o.header).replace(new RegExp("(^|\\D)" + old + "(?!\\d)"), "$1" + o.orderNumber);
        await save("Order", o); console.log("Buchhaltung: Angebot " + old + " → " + o.orderNumber + " (id " + o.id + ")");
      }
      // Simon 28.10.2026: alle offenen Angebote (Entwurf/versendet, bis heute angelegt) gelten bis 31.12.2026 – Gültigkeitssatz im Fußtext ersetzen, PDF neu erzeugen
      const VALID_TO = "31.12.2026", VALID_ISO = "2026-12-31", VALID_CUT = Date.parse("2026-10-29T00:00:00+01:00"), VRE = /(g(?:ü|ue)ltig\s+bis(?:\s+(?:zum|einschlie(?:ß|ss)lich))?\s*:?\s*)(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/i;
      for (const o of all("Order").filter(o => String(o.orderType || "AN") === "AN" && ["100", "200"].indexOf(String(o.status)) > -1 && Date.parse(o.create || "") < VALID_CUT)) {
        const ft = String(o.footText || ""), m = ft.replace(/<[^>]+>/g, " ").match(VRE), cur = m ? m[4] + "-" + m[3].padStart(2, "0") + "-" + m[2].padStart(2, "0") : "";
        if (cur && cur >= VALID_ISO) continue;
        o.footText = m && VRE.test(ft) ? ft.replace(VRE, "$1" + VALID_TO) : "Dieses Angebot ist gültig bis " + VALID_TO + "." + (ft ? "\n" + ft : "");
        o._dirty = true; await save("Order", o); console.log("Buchhaltung: Angebot " + o.orderNumber + " gültig bis " + VALID_TO + (cur ? " (vorher " + cur + ")" : ""));
      }
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
    // Bruttopreis maßgeblich (z. B. kochdu-Provisionen: Mollie behält brutto inkl. 20 % ein): Summe brutto cent-genau, netto/USt daraus zurückgerechnet
    if ((p.grossPricing === true || p.grossPricing === "true" || p.grossPricing === "1") && p.priceGross != null && isFinite(+p.priceGross)) {
      const g = +p.priceGross, disc0 = +p.discount || 0, sumGross = r2(g * q * (1 - disc0 / 100)), sumNet0 = r2(sumGross / (1 + rate / 100)), net0 = r2(g / (1 + rate / 100));
      return Object.assign(p, { grossPricing: true, price: s2(net0), priceNet: s2(net0), priceTax: s2(g - net0), priceGross: s2(g), sumNet: s2(sumNet0), sumTax: s2(sumGross - sumNet0), sumGross: s2(sumGross) });
    }
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
  // Vorschau der nächsten Angebotsnummer (ohne weiterzuzählen): immer mit Präfix und nie unter der höchsten vergebenen Nummer
  function orderSeqPeek(type, seq) {
    const prefix = type + "-"; let best = 0;
    all("Order").forEach(o => { if (String(o.orderType || "AN") !== type) return; const m = String(o.orderNumber || "").match(/^(.*?)(\d+)$/); if (m && m[1] === prefix && +m[2] > best) best = +m[2]; });
    return Object.assign({}, seq || {}, { objectType: "Order", forObject: "Order", type, format: seq && seq.format && /\[%NUMBER\]/.test(seq.format) ? seq.format : prefix + "[%NUMBER]", nextSequence: String(Math.max(best + 1, (seq && +seq.nextSequence) || 0)) });
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
    posGuard("Invoice", o, body.invoicePosSave, body.invoicePosDelete);
    const isNew = !o;
    o = Object.assign(o || { id: newId("Invoice"), status: "100", paidAmount: "0", currency: "EUR", invoiceType: "RE" }, stripMeta(inv));
    if (inv.invoiceDate) o.invoiceDate = iso(dayOf(inv.invoiceDate)); if (inv.deliveryDate) o.deliveryDate = iso(dayOf(inv.deliveryDate)); if (inv.deliveryDateUntil) o.deliveryDateUntil = iso(dayOf(inv.deliveryDateUntil));
    if (!o.invoiceDate) o.invoiceDate = iso(today());
    // wie sevDesk: Entwürfe haben noch keine feste Nummer – vergeben wird sie erst beim Fertigstellen (Versand/Download), in Versandreihenfolge
    if (isNew && String(o.status) !== "100" && !o.invoiceNumber) await finalize(o, true);
    // Positionen
    (body.invoicePosDelete || []).forEach(p => { if (p && p.id) { const x = get("InvoicePos", p.id); if (x && x.invoice && String(x.invoice.id) === String(o.id)) { C.InvoicePos.delete(String(p.id)); fin.db().query("delete from fin_obj where type='InvoicePos' and id=$1", [String(p.id)]).catch(() => {}); } } });
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
  // Positionen nur des eigenen Belegs ändern/löschen (Review A6): eine Positions-ID eines anderen (z. B. festgeschriebenen) Belegs wird nie
  // umgehängt oder gelöscht – vor jeder Änderung prüfen, damit nichts halb gespeichert wird
  function posGuard(T, o, save0, del0) {
    const key = T.charAt(0).toLowerCase() + T.slice(1), mine = x => !!o && !!x && !!x[key] && String(x[key].id) === String(o.id);
    for (const p of [].concat(Array.isArray(save0) ? save0 : [], Array.isArray(del0) ? del0 : [])) {
      if (!p || p.id == null || String(p.id) === "") continue; const x = get(T + "Pos", p.id);
      if (x && !mine(x)) throw err(400, "Position " + p.id + " gehört zu einem anderen Beleg");
    }
  }
  // ── Regeln wie sevDesk (Handbuch): Fertigstellen = feste Nummer + Status offen + (Standard) automatische Festschreibung ──
  function settings() { return Object.assign({ autoEnshrine: true }, get("FinSetting", "1") || {}); }
  async function finalize(o, noSave) {
    // Entwurf: vorläufige Nummer (z. B. aus sevDesk übernommen) nie behalten – immer die nächste freie Nummer, lückenlos in Versandreihenfolge
    const taken = n => !!n && all("Invoice").some(x => String(x.id) !== String(o.id) && x.invoiceNumber === n);
    if (!o.invoiceNumber || String(o.status) === "100" || taken(o.invoiceNumber)) { o.invoiceNumber = null; o.invoiceNumber = await nextNumber("Invoice", o.invoiceType || "RE", "invoiceNumber", INV_PREFIX[o.invoiceType] || "RE-"); }
    if (String(o.status) === "100") { o.status = "200"; o._dirty = true; }
    if (settings().autoEnshrine && String(o.invoiceType) !== "MA" && !o.enshrined) o.enshrined = nowIso();
    if (!noSave) await save("Invoice", o);
    return o;
  }
  // Zeitraum festschreiben (Einstellungen → Festschreiben): Rechnungen ≥ 200, Belege ≥ 100, Gutschriften ≥ 200, Zahlungen ≥ 200 – nicht umkehrbar
  async function enshrinePeriod(b) {
    const from = dayOf(b.from), to = dayOf(b.to); if (!from || !to || from > to) throw err(400, "Zeitraum fehlt");
    const types = Array.isArray(b.types) && b.types.length ? b.types : ["Invoice", "Voucher", "CreditNote", "CheckAccountTransaction"];
    const DATE = { Invoice: "invoiceDate", Voucher: "voucherDate", CreditNote: "creditNoteDate", CheckAccountTransaction: "valueDate" }, MIN = { Invoice: 200, Voucher: 100, CreditNote: 200, CheckAccountTransaction: 200 };
    const n = {}, stamp = nowIso();
    for (const t of types) { if (!DATE[t]) continue; n[t] = 0;
      for (const o of all(t)) { const d = dayOf(o[DATE[t]]); if (!d || d < from || d > to || o.enshrined || (+o.status || 0) < MIN[t]) continue; o.enshrined = stamp; await save(t, o); n[t]++; } }
    return { objects: n };
  }
  function isLocked(t, o) {
    if (o.enshrined) return true;
    // Zahlung zu einer festgeschriebenen Transaktion sperrt das Dokument ebenfalls
    return all("CheckAccountTransactionLog").some(l => l.object && l.object.objectName === t && String(l.object.id) === String(o.id) && l.checkAccountTransaction && (get("CheckAccountTransaction", l.checkAccountTransaction.id) || {}).enshrined);
  }
  async function invoiceSendBy(id, b) {
    const o = need("Invoice", id);
    if (b && b.sendDraft) return { objects: o };
    await finalize(o, true);
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
    if (String(o.status) !== "100") { await fin.putFileRaw("pdf", t, id, { buf, type: "application/pdf", name }); if (o._dirty) { delete o._dirty; await save(t, o); } }
    return { buf, type: "application/pdf", name };
  }
  async function invoiceSendMail(id, b) {
    const o = need("Invoice", id);
    if (String(o.status) === "100") await finalize(o);
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
    // Überzahlung mit Auswahl „Woher kommt die Differenz?“ – vor jeder Änderung prüfen (sonst bliebe ein Umsatz ohne Zuordnung gebucht)
    // Mollie/PayPal: der Umsatz ist netto (nach Gebühr) – die Differenz zählt vom Bruttobetrag, die Gebühr wird wie sonst als Zahlungsgebühr gebucht (Review 28.10.2026)
    const exFee = t === "Invoice" && b.extra && tx && (tx.mollieFeeAmt || tx.feeAmt) && Math.abs(amt - Math.abs(+tx.amount || 0)) < 0.005 ? r2(Math.abs(+(tx.mollieFeeAmt || tx.feeAmt))) : 0;
    const ex = t === "Invoice" && b.extra && typeof b.extra === "object" ? checkExtra(o, r2(amt + exFee), b.extra, tx) : null;
    // automatische Buchung: Umsatz und Rechnung müssen genau jetzt noch offen sein (ohne await bis zur Statusänderung → nie doppelt zugeordnet)
    if (b.auto && (!tx || String(tx.status) !== "100" || tx.transitWith || (t === "Invoice" && ["200", "750"].indexOf(String(o.status)) < 0))) throw err(409, "Umsatz oder Rechnung ist schon zugeordnet");
    if (!tx) {   // Zahlung ohne Bankumsatz (bar, Kasse, PayPal …): Umsatz auf dem gewählten Konto anlegen
      const sign = (t === "Voucher" && String(o.creditDebit) === "C") || t === "CreditNote" ? -1 : 1;
      if (accId && isCash(accId)) { await cashGuard(accId, iso(day), sign * amt); }
      tx = { id: newId("CheckAccountTransaction"), valueDate: iso(day), entryDate: iso(day), amount: s2(sign * amt), paymtPurpose: (o.invoiceNumber || o.description || o.supplierName || "Zahlung"), payeePayerName: t === "Voucher" ? (o.supplierName || "") : "", checkAccount: ref("CheckAccount", accId), status: "200" };
    } else tx.status = "200";
    await save("CheckAccountTransaction", tx);
    if (ex) amt = ex.open;   // die Rechnung bekommt genau den offenen Betrag, die Differenz wird unten eigens verbucht
    // Zahlung zu einer gemahnten Rechnung: was über den offenen Betrag hinausgeht, deckt zuerst die Mahngebühr (eigener Einnahme-Beleg, 0 %)
    let feePart = 0;
    if (!ex && t === "Invoice" && +o.dunningFeeOpen > 0) { const openAmt = r2(Math.abs(+o.sumGross || 0) - (+o.paidAmount || 0)); feePart = Math.min(+o.dunningFeeOpen, Math.max(0, r2(amt - openAmt))); if (b.feeAmount != null) feePart = Math.min(+o.dunningFeeOpen, Math.max(0, r2(+b.feeAmount)), amt); }
    if (feePart > 0) { await bookFee(o, feePart, tx, day); amt = r2(amt - feePart); if (amt <= 0.004) { await save(t, o); return { objects: {} }; } }
    // Differenzgrund bei Zahlung < offener Betrag (wie sevDesk bookAmount.type): N Teilzahlung · CB Skonto · MTC Kosten des Zahlungsverkehrs
    const mFee = tx && (tx.mollieFeeAmt || tx.feeAmt) ? Math.abs(+(tx.mollieFeeAmt || tx.feeAmt)) : 0;
    const dtype0 = String(b.type || "").toUpperCase(), open00 = r2(Math.abs(+o.sumGross || 0) - (+o.paidAmount || 0));
    const incomeDoc = t === "Invoice" || (t === "Voucher" && String(o.creditDebit) === "D");
    const dtype = dtype0 && dtype0 !== "N" ? dtype0 : (incomeDoc && mFee > 0 && !b.split && Math.abs(r2(open00 - amt) - mFee) < 0.05 ? "MTC" : (dtype0 || "N")), open0 = r2(Math.abs(+o.sumGross || 0) - (+o.paidAmount || 0)), diff = r2(open0 - amt);
    let logAmt = amt, paid = r2((+o.paidAmount || 0) + amt);
    const gross = Math.abs(+o.sumGross || 0);
    if (incomeDoc && diff > 0.004 && dtype === "MTC") {
      // Bankspesen: Rechnung gilt als voll bezahlt, die Differenz ist Aufwand (0 %, keine Vorsteuer) – eigener Ausgabe-Beleg am selben Umsatz
      await bookCost(o, diff, tx, day, mFee ? (tx.feeBy || "Mollie B.V.") : "Bank"); paid = r2(paid + diff); logAmt = r2(amt + diff);
    }
    o.paidAmount = s2(paid); o.payDate = iso(day);
    o.status = paid >= gross - 0.005 ? "1000" : "750";
    // Skonto: Rechnung ist erledigt; der Unterschied ist eine Entgeltsminderung zum Steuersatz der Rechnung (Monat der Zahlung)
    let skonto = 0;
    if (t === "Invoice" && diff > 0.004 && dtype === "CB") { o.status = "1000"; skonto = diff; o.skontoAmount = s2(r2((+o.skontoAmount || 0) + diff)); }
    await save(t, o);
    const closed = [];   // erledigte Mahnungen merken (Zahlung lösen stellt sie wieder her)
    if (t === "Invoice" && o.status === "1000") for (const m of all("Invoice").filter(x => String(x.invoiceType) === "MA" && x.origin && String(x.origin.id) === String(o.id) && String(x.status) !== "1000")) { closed.push({ id: String(m.id), status: String(m.status), payDate: m.payDate || null }); m.status = "1000"; m.payDate = iso(day); await save("Invoice", m); }
    const log = { id: newId("CheckAccountTransactionLog"), object: ref(t, o.id), checkAccountTransaction: ref("CheckAccountTransaction", tx.id), amountPaid: s2(logAmt), bookingDate: iso(day), fromStatus: "100", toStatus: o.status };
    if (skonto) log.skonto = s2(skonto); if (closed.length) log.closedReminders = closed; if (b.auto) log.auto = true;
    if (ex) log.extra = { kind: ex.kind, amount: s2(ex.over) };
    await save("CheckAccountTransactionLog", log);
    if (ex) { log.extraIds = await bookExtra(o, ex, tx, day);
      if (exFee > 0) { const fv = await bookCost(o, exFee, tx, day, tx.feeBy || "Mollie B.V."); log.extraIds.push({ type: "Voucher", id: String(fv.id) }); }   // Zahlungsgebühr (Ausgabe, wird mit „Lösen“ mit entfernt)
      await save("CheckAccountTransactionLog", log); await save("Invoice", o); }
    return { objects: log };
  }

  // ── Überzahlung: „Woher kommt die Differenz?“ (Zahlung > offener Betrag) ──
  // fee = Mahnspesen/Mahngebühr, interest = Verzugszinsen: Schadenersatz → eigener Einnahme-Beleg 0 %, nicht umsatzsteuerbar (nicht in der UVA)
  // tip = Trinkgeld/Aufrundung: Teil des Entgelts → Einnahme-Beleg 20 % USt (Betrag brutto)
  // credit = Guthaben/Doppelzahlung: bleibt beim Kunden (CustomerCredit, keine Einnahme), Rücküberweisung später zuordenbar
  // invoices = Zahlung deckt weitere offene Rechnung(en) desselben Kunden (Aufteilung am selben Umsatz, Rest → Guthaben)
  const EXTRA = { fee: "Mahnspesen", interest: "Verzugszinsen", tip: "Trinkgeld/Aufrundung", credit: "Guthaben", invoices: "weitere Rechnungen" };
  const openOfInv = i => r2(Math.abs(+i.sumGross || 0) - (+i.paidAmount || 0));
  function checkExtra(o, amt, x, tx) {
    const kind = String(x.kind || "");
    if (!EXTRA[kind]) throw err(400, "Bitte auswählen, woher die Differenz kommt");
    if (["200", "750"].indexOf(String(o.status)) < 0 || o.cancelled) throw err(400, "Die Rechnung ist nicht offen");
    if (tx && String(tx.status) !== "100") throw err(400, "Dieser Umsatz ist schon zugeordnet");
    const open = openOfInv(o), over = r2(amt - open);
    if (!(open > 0.004)) throw err(400, "Die Rechnung hat keinen offenen Betrag");
    if (!(over > 0.004)) throw err(400, "Keine Überzahlung – der Betrag ist nicht höher als der offene Betrag");
    if (x.amount != null && x.amount !== "" && Math.abs(r2(+x.amount) - over) > 0.01) throw err(400, "Die Differenz hat sich geändert (jetzt " + s2(over).replace(".", ",") + " €) – bitte neu laden");
    return { kind, open, over, invoices: kind === "invoices" ? checkTargets(o, x.invoices, over) : null };
  }
  // Zielrechnungen (gleicher Kunde, offen): [{id, amount?}] → [{inv, part}], Reihenfolge wie gewählt
  function checkTargets(o, list, over) {
    const ids = [...new Set((Array.isArray(list) ? list : []).map(x => String(x && typeof x === "object" ? x.id : x).replace(/\D/g, "")).filter(Boolean))].slice(0, 20);
    if (!ids.length) throw err(400, "Bitte mindestens eine weitere Rechnung wählen");
    let rest = over; const out = [];
    for (const id of ids) {
      const i = get("Invoice", id); if (!i || String(i.id) === String(o.id)) throw err(400, "Rechnung " + id + " nicht gefunden");
      if (["200", "750"].indexOf(String(i.status)) < 0 || i.cancelled || ["RE", "AR", "ER", "TR"].indexOf(String(i.invoiceType || "RE")) < 0) throw err(400, "Rechnung " + (i.invoiceNumber || id) + " ist nicht offen");
      if (o.contact && i.contact && String(o.contact.id) !== String(i.contact.id)) throw err(400, "Rechnung " + (i.invoiceNumber || id) + " gehört zu einem anderen Kunden");
      const part = Math.min(rest, openOfInv(i)); if (!(part > 0.004)) continue;
      out.push({ inv: i, part: r2(part) }); rest = r2(rest - part);
    }
    if (!out.length) throw err(400, "Die gewählten Rechnungen haben keinen offenen Betrag");
    return out;
  }
  // Differenz am selben Umsatz verbuchen → Liste der angelegten Objekte [{type,id}]
  async function bookExtra(o, ex, tx, day) {
    const made = [];
    if (ex.kind === "fee") { const v = await bookFee(o, ex.over, tx, day); v.extraKind = "fee"; await save("Voucher", v); made.push({ type: "Voucher", id: String(v.id) }); }
    else if (ex.kind === "interest") { const v = await bookInterest(o, ex.over, tx, day); made.push({ type: "Voucher", id: String(v.id) }); }
    else if (ex.kind === "tip") { const v = await bookTip(o, ex.over, tx, day); made.push({ type: "Voucher", id: String(v.id) }); }
    else if (ex.kind === "credit") { const c = await addCredit(o, ex.over, tx, day, "Überzahlung/Doppelzahlung"); made.push({ type: "CustomerCredit", id: String(c.id) }); }
    else if (ex.kind === "invoices") {
      let rest = ex.over;
      for (const x of ex.invoices) { await bookAmount("Invoice", x.inv.id, { amount: x.part, date: day, checkAccountTransaction: { id: String(tx.id) }, split: true }); rest = r2(rest - x.part); made.push({ type: "Invoice", id: String(x.inv.id), amount: s2(x.part) }); }
      if (rest > 0.004) { const c = await addCredit(o, rest, tx, day, "Rest nach Aufteilung auf weitere Rechnungen"); made.push({ type: "CustomerCredit", id: String(c.id) }); }
    }
    return made;
  }
  function custName(inv) { const c = inv.contact && get("Contact", inv.contact.id); return (c && (c.name || [c.surename, c.familyname].filter(Boolean).join(" "))) || ""; }
  // Ertragskonto für Verzugszinsen: Zinserträge / sonstige Erträge – nie ein Aufwandskonto wie „Zinsen und ähnliche Aufwendungen“ (Review 28.10.2026)
  function interestAccountingType() {
    const ats = all("AccountingType").filter(x => !/aufw|kosten|spesen|ausgab|geb(ü|ue)hr|steuer/i.test(String(x.name || "")));   // steuer: nie „Ertragsteuern“ o. ä. über /ertr/
    const rx = [/verzugszins/i, /zinsertr/i, /sonstige (betriebliche )?ertr/i, /ertr/i, /zinsen/i, /erl[öo]s/i];
    for (const r of rx) { const a = ats.find(x => r.test(String(x.name || ""))); if (a) return a; }
    return null;
  }
  // Erlöskonto für Trinkgeld/Aufrundung: bei einem anderen Satz als 20 % zuerst ein Erlöskonto mit genau diesem Satz („Erlöse 10 %“, „Erlöse 0 %“ …)
  function tipAccountingType(rate) {
    const ats = all("AccountingType"), rx = rate != null && rate !== 20 ? new RegExp("(erl(ö|oe)s|einnahm)[^0-9]*\\b" + String(rate).replace(".", "[.,]") + "\\s?%", "i") : null;
    return (rx && ats.find(a => rx.test(a.name || ""))) || ats.find(a => /einnahmen \/ erl(ö|oe)se \/ verk(ä|ae)ufe/i.test(a.name || "")) || ats.find(a => /erl(ö|oe)se 20|umsatzerl(ö|oe)se/i.test(a.name || "")) || ats.find(a => /erl(ö|oe)s|einnahm/i.test(a.name || "")) || null;
  }
  // Steuerbehandlung für Trinkgeld/Aufrundung = die der Rechnung (Teil des Entgelts, Review 28.10.2026): ein Steuersatz → dieser; keine USt auf der
  // Rechnung (Reverse Charge, Drittland, ig. Lieferung, 0 %) → 0 %; mehrere Sätze → 20 % (Normalsatz, der Dialog sagt das dazu)
  function tipTax(inv) {
    if (["eu", "noteu", "ss"].indexOf(String(inv.taxType || "")) > -1 || !(Math.abs(+inv.sumTax || 0) > 0.004)) return { rate: 0, mixed: false };
    const rates = [...new Set(positionsOf("Invoice", inv.id).filter(p => Math.abs(+p.sumNet || +p.sumGross || 0) > 0.004).map(p => r2(+p.taxRate || 0)))];
    if (rates.length === 1) return { rate: rates[0], mixed: false };
    if (!rates.length) {   // Rechnung ohne Positionen (z. B. Übernahme): Satz aus den Kopfsummen, wenn er glatt aufgeht
      const n = Math.abs(+inv.sumNet || 0), tx = Math.abs(+inv.sumTax || 0), r = n > 0.004 ? Math.round(tx / n * 100) : 0;
      if (r > 0 && Math.abs(r2(n * r / 100) - tx) <= 0.05) return { rate: r, mixed: false };
    }
    return { rate: 20, mixed: rates.length > 1 };
  }
  // Verzugszinsen: wie Mahngebühr (Schadenersatz, 0 %, nicht umsatzsteuerbar), eigenes Buchungskonto (Zinserträge/sonstige Erträge)
  async function bookInterest(inv, amt, tx, day) {
    const at = interestAccountingType();
    const v = { id: newId("Voucher"), status: "1000", creditDebit: "D", voucherType: "VOU", currency: "EUR", voucherDate: iso(day), payDate: iso(day), paidAmount: s2(amt),
      supplierName: custName(inv), description: "Verzugszinsen zu Rechnung " + (inv.invoiceNumber || "") + " – Schadenersatz, nicht umsatzsteuerbar",
      taxType: "noteu", taxText: "nicht umsatzsteuerbar (Schadenersatz)", origin: ref("Invoice", inv.id), extraKind: "interest" };
    const p = { id: newId("VoucherPos"), voucher: ref("Voucher", v.id), taxRate: "0", sumNet: s2(amt), sumGross: s2(amt), sumTax: "0.00", sumNetAccounting: s2(amt), sumGrossAccounting: s2(amt), sumTaxAccounting: "0.00", net: "false", comment: "Verzugszinsen (Schadenersatz) – nicht umsatzsteuerbar" };
    if (at) p.accountingType = ref("AccountingType", at.id);
    await save("VoucherPos", p);
    v.sumNet = s2(amt); v.sumGross = s2(amt); v.sumTax = "0.00"; await save("Voucher", v);
    await save("CheckAccountTransactionLog", { id: newId("CheckAccountTransactionLog"), object: ref("Voucher", v.id), checkAccountTransaction: ref("CheckAccountTransaction", tx.id), amountPaid: s2(amt), bookingDate: iso(day), fromStatus: "100", toStatus: "1000" });
    return v;
  }
  // Trinkgeld/Aufrundung an das Unternehmen: Teil des Entgelts → Erlös mit der Steuerbehandlung der Rechnung (tipTax, Betrag ist brutto).
  // 0 %: Steuerart/-regel der Rechnung übernehmen, damit die UVA den Beleg wie die Rechnung einordnet (z. B. Reverse Charge, Ausfuhr)
  async function bookTip(inv, amt, tx, day) {
    const tt = tipTax(inv), rate = tt.rate, at = tipAccountingType(rate), net = r2(amt / (1 + rate / 100)), tax = r2(amt - net);
    const note = rate > 0 ? rate + " % USt enthalten" + (tt.mixed ? ", Rechnung mit mehreren Steuersätzen – Normalsatz" : "") : "0 % USt wie die Rechnung";
    const v = { id: newId("Voucher"), status: "1000", creditDebit: "D", voucherType: "VOU", currency: "EUR", voucherDate: iso(day), payDate: iso(day), paidAmount: s2(amt),
      supplierName: custName(inv), description: "Trinkgeld/Aufrundung zu Rechnung " + (inv.invoiceNumber || "") + " (" + note + ")",
      taxType: rate > 0 ? "default" : (inv.taxType || "default"), origin: ref("Invoice", inv.id), extraKind: "tip" };
    // Steuerregel der Rechnung immer übernehmen (Gegenprobe 28.10.2026): OSS-Rechnung mit 19 % DE → Regel „OSS“, sonst würde der Beleg als
    // Inland 19 % (KZ 037 Jungholz) eingeordnet; Inlandsrechnung → Regel „steuerpflichtig“ wie bisher
    if (inv.taxRule) v.taxRule = inv.taxRule;
    if (!(rate > 0)) { if (inv.taxSet) v.taxSet = inv.taxSet; if (inv.taxText) v.taxText = inv.taxText; }
    const p = { id: newId("VoucherPos"), voucher: ref("Voucher", v.id), taxRate: String(rate), sumNet: s2(net), sumGross: s2(amt), sumTax: s2(tax), sumNetAccounting: s2(net), sumGrossAccounting: s2(amt), sumTaxAccounting: s2(tax), net: "false", comment: "Trinkgeld/Aufrundung – Teil des Entgelts, " + rate + " % USt" };
    if (at) p.accountingType = ref("AccountingType", at.id);
    await save("VoucherPos", p);
    v.sumNet = s2(net); v.sumGross = s2(amt); v.sumTax = s2(tax); await save("Voucher", v);
    await save("CheckAccountTransactionLog", { id: newId("CheckAccountTransactionLog"), object: ref("Voucher", v.id), checkAccountTransaction: ref("CheckAccountTransaction", tx.id), amountPaid: s2(amt), bookingDate: iso(day), fromStatus: "100", toStatus: "1000" });
    return v;
  }
  // Guthaben des Kunden (Überzahlung/Doppelzahlung): keine Einnahme, keine USt – eigener Datensatz mit Zahlungszuordnung am Umsatz
  async function addCredit(inv, amt, tx, day, note) {
    const c = { id: newId("CustomerCredit"), invoice: ref("Invoice", inv.id), contact: inv.contact || null, invoiceNumber: inv.invoiceNumber || "", contactName: custName(inv), amount: s2(amt), open: s2(amt), date: iso(day), txId: String(tx.id), note: String(note || "Guthaben").slice(0, 200), status: "open", refunds: [] };
    await save("CustomerCredit", c);
    await save("CheckAccountTransactionLog", { id: newId("CheckAccountTransactionLog"), object: ref("CustomerCredit", c.id), checkAccountTransaction: ref("CheckAccountTransaction", tx.id), amountPaid: s2(amt), bookingDate: iso(day), fromStatus: "100", toStatus: "200" });
    inv.creditOpen = s2(r2((+inv.creditOpen || 0) + amt));
    return c;
  }
  const invLogs = id => all("CheckAccountTransactionLog").filter(l => l.object && l.object.objectName === "Invoice" && String(l.object.id) === String(id));
  // Betrag einer Zahlungszuordnung: eigene Buchhaltung amountPaid, aus sevDesk übernommene Logs ammountPayed (sonst würde „Lösen“ 0 € freigeben)
  const logPaid = l => +(l.amountPaid != null ? l.amountPaid : l.ammountPayed) || 0;
  const txLogs = id => all("CheckAccountTransactionLog").filter(l => l.checkAccountTransaction && String(l.checkAccountTransaction.id) === String(id));
  let SERIALQ = Promise.resolve();   // Warteschlange für reclassOver/unbook/Rückzahlungen (siehe serial() am Ende)
  // ── Bereits verbuchte Überzahlung nachträglich zuordnen (z. B. RE-1233): nur Zahlungszuordnung, auch bei festgeschriebener Rechnung ──
  async function reclassOver(invId, b) {
    await load(); b = b || {};
    const o = need("Invoice", invId);
    if (["RE", "AR", "ER", "TR"].indexOf(String(o.invoiceType || "RE")) < 0 || o.cancelled) throw err(400, "Nur zu (nicht stornierten) Rechnungen möglich");
    const gross = Math.abs(+o.sumGross || 0), over = r2((+o.paidAmount || 0) - gross);
    if (!(over > 0.004)) throw err(400, "Keine Überzahlung an dieser Rechnung");
    const kind = String(b.kind || ""); if (!EXTRA[kind]) throw err(400, "Bitte auswählen, woher die Differenz kommt");
    const amt = b.amount != null && b.amount !== "" ? r2(+b.amount) : over;
    if (!(amt > 0.004) || amt > over + 0.005) throw err(400, "Betrag muss zwischen 0,01 und " + s2(over).replace(".", ",") + " € liegen");
    // Überzahlung kam mit der letzten Zahlung → von hinten abbauen
    const logs = invLogs(o.id).filter(l => l.checkAccountTransaction && logPaid(l) > 0).sort((x, y) => String(dayOf(y.bookingDate) || "").localeCompare(String(dayOf(x.bookingDate) || "")) || (+y.id - +x.id));
    const plan = []; let rest = amt;
    for (const l of logs) { if (rest <= 0.004) break; const tx = get("CheckAccountTransaction", l.checkAccountTransaction.id); if (!tx) continue;
      if (tx.enshrined) throw err(400, "Die Zahlung vom " + (dayOf(tx.valueDate) || "").split("-").reverse().join(".") + " liegt in einem festgeschriebenen Zeitraum – Korrektur nur per Gegenbuchung");
      const part = r2(Math.min(rest, logPaid(l))); plan.push({ l, tx, part }); rest = r2(rest - part); }
    if (!plan.length || rest > 0.004) throw err(400, "Keine passende Bankzahlung an dieser Rechnung – Überzahlung kann nicht zugeordnet werden");
    const targets = kind === "invoices" ? checkTargets(o, b.invoices, amt) : null;
    const made = []; let tq = targets ? targets.slice() : null;
    for (const p of plan) {
      const day = dayOf(p.tx.valueDate) || dayOf(p.l.bookingDate) || today();
      p.l.amountPaid = s2(r2(logPaid(p.l) - p.part)); if (p.l.ammountPayed != null) p.l.ammountPayed = p.l.amountPaid; p.l.reclass = (p.l.reclass || []).concat([{ at: nowIso(), kind, amount: s2(p.part) }]);
      if (+p.l.amountPaid <= 0.004) { await save("PaymentUnlink", { id: newId("PaymentUnlink"), at: nowIso(), reason: "Überzahlung zugeordnet (" + EXTRA[kind] + ")", invoice: ref("Invoice", o.id), log: p.l }); await del("CheckAccountTransactionLog", p.l.id); }
      else await save("CheckAccountTransactionLog", p.l);
      o.paidAmount = s2(r2(+o.paidAmount - p.part));
      if (kind === "invoices") {
        let restP = p.part;
        while (restP > 0.004 && tq.length) { const x = tq[0], part = r2(Math.min(restP, x.part)); await bookAmount("Invoice", x.inv.id, { amount: part, date: day, checkAccountTransaction: { id: String(p.tx.id) }, split: true }); made.push({ type: "Invoice", id: String(x.inv.id), amount: s2(part) }); x.part = r2(x.part - part); restP = r2(restP - part); if (x.part <= 0.004) tq.shift(); }
        if (restP > 0.004) { const c = await addCredit(o, restP, p.tx, day, "Rest nach Aufteilung auf weitere Rechnungen"); made.push({ type: "CustomerCredit", id: String(c.id) }); }
      } else made.push.apply(made, await bookExtra(o, { kind, over: p.part }, p.tx, day));
    }
    o.overHistory = (o.overHistory || []).concat([{ at: nowIso(), kind, amount: s2(amt) }]);
    // Zahlungsdatum = letzte verbliebene Zahlung (Istbesteuerung rechnet eigene Zahlungen nach payDate): fiel die spätere Doppelzahlung ganz weg,
    // gehört die USt wieder in den Monat der echten Zahlung (sonst rutscht sie z. B. von Q3 nach Q4) – wie unbook (Review 28.10.2026)
    { const rd = invLogs(o.id).map(l => dayOf(l.bookingDate)).filter(Boolean).sort(); if (rd.length) o.payDate = iso(rd[rd.length - 1]); }
    o.status = (+o.paidAmount || 0) >= gross - 0.005 ? "1000" : "750";
    await save("Invoice", o);
    return { objects: { invoice: o, made } };
  }
  // ── Zahlung lösen (nur die Zahlungszuordnung) – auch bei festgeschriebener Rechnung. Entfernt die Zuordnung dieses Umsatzes,
  //    die Zusatzbelege aus Überzahlung/Zahlungsgebühr (gleicher Umsatz) und ein daraus entstandenes Guthaben; Umsatz wird wieder offen. ──
  async function unbook(invId, txId, opt) {
    await load(); opt = opt || {};
    const o = need("Invoice", invId);
    if (String(o.invoiceType) === "SR" || o.cancelled) throw err(400, "Stornierte Rechnungen: Zahlungen werden über die Gutschrift/Storno gelöst");
    const logs = invLogs(o.id).filter(l => l.checkAccountTransaction && String(l.checkAccountTransaction.id) === String(txId));
    if (!logs.length) throw err(400, "Diese Zahlung ist der Rechnung nicht (mehr) zugeordnet");
    const tx = get("CheckAccountTransaction", txId);
    if (tx && tx.enshrined) throw err(400, "Der Umsatz liegt in einem festgeschriebenen Zeitraum – Zahlung kann nicht gelöst werden");
    const tl = txLogs(txId);
    const extraV = all("Voucher").filter(v => v.origin && v.origin.objectName === "Invoice" && String(v.origin.id) === String(o.id) && tl.some(l => l.object && l.object.objectName === "Voucher" && String(l.object.id) === String(v.id)));
    if (extraV.some(v => v.enshrined)) throw err(400, "Ein Zusatzbeleg zu dieser Zahlung ist festgeschrieben – Korrektur nur per Gegenbeleg");
    const credits = all("CustomerCredit").filter(c => c.invoice && String(c.invoice.id) === String(o.id) && String(c.txId) === String(txId));
    if (credits.some(c => r2(+c.open) < r2(+c.amount) - 0.004)) throw err(400, "Das Guthaben aus dieser Zahlung wurde schon (teilweise) zurückgezahlt – zuerst die Rückzahlung lösen");
    for (const v of extraV) {
      for (const l of tl.filter(l => l.object && l.object.objectName === "Voucher" && String(l.object.id) === String(v.id))) await del("CheckAccountTransactionLog", l.id);
      for (const p of positionsOf("Voucher", v.id)) await del("VoucherPos", p.id);
      if (v.dunningFee) { const amt = Math.abs(+v.sumGross || 0), used = v.feeOpenUsed != null ? +v.feeOpenUsed : amt; o.dunningFeeOpen = s2(r2((+o.dunningFeeOpen || 0) + used)); o.dunningFeePaid = s2(Math.max(0, r2((+o.dunningFeePaid || 0) - amt))); }
      await save("PaymentUnlink", { id: newId("PaymentUnlink"), at: nowIso(), reason: "Zusatzbeleg entfernt (Zahlung gelöst)", invoice: ref("Invoice", o.id), voucher: v });
      await del("Voucher", v.id);
    }
    for (const c of credits) { for (const l of tl.filter(l => l.object && l.object.objectName === "CustomerCredit" && String(l.object.id) === String(c.id))) await del("CheckAccountTransactionLog", l.id); o.creditOpen = s2(Math.max(0, r2((+o.creditOpen || 0) - (+c.open || 0)))); await del("CustomerCredit", c.id); }
    let freed = 0;
    for (const l of logs) {
      freed = r2(freed + logPaid(l));
      if (l.skonto) o.skontoAmount = s2(Math.max(0, r2((+o.skontoAmount || 0) - (+l.skonto || 0))));
      for (const m0 of (l.closedReminders || [])) { const m = get("Invoice", m0.id); if (m && String(m.status) === "1000") { m.status = m0.status || "200"; m.payDate = m0.payDate || null; await save("Invoice", m); } }
      await save("PaymentUnlink", { id: newId("PaymentUnlink"), at: nowIso(), reason: String(opt.reason || "Zahlung gelöst").slice(0, 200), invoice: ref("Invoice", o.id), log: l, auto: !!opt.auto });
      await del("CheckAccountTransactionLog", l.id);
    }
    const paid = r2((+o.paidAmount || 0) - freed), gross = Math.abs(+o.sumGross || 0);
    o.paidAmount = s2(paid);
    o.status = paid >= gross - 0.005 && paid > 0.004 ? "1000" : paid > 0.004 ? "750" : "200";
    const rest = invLogs(o.id).map(l => dayOf(l.bookingDate)).filter(Boolean).sort();
    o.payDate = rest.length ? iso(rest[rest.length - 1]) : null;
    await save("Invoice", o);
    // Aufteilung „weitere Rechnungen“ aus dieser Zahlung mit lösen – sonst bliebe der Umsatz „zugeordnet“ (Status 200), obwohl ein Teil frei ist (Review 28.10.2026)
    const split = [...new Set([].concat(...logs.map(l => (l.extraIds || []).filter(x => x && x.type === "Invoice").map(x => String(x.id)))))];
    for (const sid of split) if (invLogs(sid).some(l => l.checkAccountTransaction && String(l.checkAccountTransaction.id) === String(txId))) await unbook(sid, txId, opt);
    // Kassenbuch: die Bareinnahme bleibt stehen und ist ab jetzt gesperrt (nur Gegenbuchung, nie löschen/ändern)
    if (tx && !txLogs(txId).length) { tx.status = "100"; delete tx.autoBooked; if (tx.checkAccount && isCash(tx.checkAccount.id) && !tx.cashLocked) tx.cashLocked = nowIso(); await save("CheckAccountTransaction", tx); }
    return { objects: { invoice: o, freed: { txId: String(txId), amount: freed }, removed: extraV.map(v => String(v.id)).concat(credits.map(c => "credit:" + c.id), split.map(id => "invoice:" + id)) } };
  }
  // ── Guthaben zurückgezahlt: Ausgang an den Kunden ↔ Guthaben (keine Ausgabe, keine Steuer) ──
  async function creditRefund(creditId, txId) {
    await load(); const c = need("CustomerCredit", creditId), tx = need("CheckAccountTransaction", txId);
    if (String(tx.status) !== "100" || tx.transitWith) throw err(400, "Der Umsatz ist nicht mehr offen");
    const amt = r2(-(+tx.amount || 0)); if (!(amt > 0)) throw err(400, "Nur Ausgänge (Rücküberweisung) können einem Guthaben zugeordnet werden");
    if (amt > r2(+c.open) + 0.005) throw err(400, "Rücküberweisung ist höher als das offene Guthaben");
    const day = dayOf(tx.valueDate) || today();
    const l = { id: newId("CheckAccountTransactionLog"), object: ref("CustomerCredit", c.id), checkAccountTransaction: ref("CheckAccountTransaction", tx.id), amountPaid: s2(-amt), bookingDate: iso(day), fromStatus: "200", toStatus: "1000" };
    await save("CheckAccountTransactionLog", l);
    c.open = s2(r2(+c.open - amt)); c.status = +c.open <= 0.004 ? "refunded" : "open"; c.refunds = (c.refunds || []).concat([{ txId: String(tx.id), amount: s2(amt), date: iso(day), logId: String(l.id) }]); await save("CustomerCredit", c);
    const inv = c.invoice && get("Invoice", c.invoice.id); if (inv) { inv.creditOpen = s2(Math.max(0, r2((+inv.creditOpen || 0) - amt))); await save("Invoice", inv); }
    tx.status = "200"; await save("CheckAccountTransaction", tx);
    return { objects: c };
  }
  async function creditRefundUndo(txId) {
    await load(); const tx = need("CheckAccountTransaction", txId);
    if (tx.enshrined) throw err(400, "Festgeschrieben – kann nicht gelöst werden");
    const ls = txLogs(txId).filter(l => l.object && l.object.objectName === "CustomerCredit"); if (!ls.length) throw err(400, "Keine Guthaben-Rückzahlung");
    for (const l of ls) { const c = get("CustomerCredit", l.object.id), amt = r2(-(+l.amountPaid || 0));
      if (c) { c.open = s2(r2(+c.open + amt)); c.status = "open"; c.refunds = (c.refunds || []).filter(x => String(x.logId) !== String(l.id)); await save("CustomerCredit", c);
        const inv = c.invoice && get("Invoice", c.invoice.id); if (inv) { inv.creditOpen = s2(r2((+inv.creditOpen || 0) + amt)); await save("Invoice", inv); } }
      await del("CheckAccountTransactionLog", l.id); }
    if (!txLogs(txId).length) { tx.status = "100"; await save("CheckAccountTransaction", tx); }
    return { objects: tx };
  }
  // ── Doppelzahlung + Rückzahlung (z. B. Lieferant zahlt eine doppelt abgebuchte Rechnung zurück) ──
  // Ausgabe a (Doppelzahlung) und Eingang b (Rückzahlung) gleichen Betrags: als Paar verbuchen (kein Aufwand, keine Vorsteuer).
  // War a per Korrektur-Umsatz („doppelt erfasst“) neutralisiert → Korrektur-Umsatz entfernen; war a einem Beleg zugeordnet
  // (Beleg überbezahlt) → b dem Beleg als Gegenbuchung zuordnen. Alles per refundUndo rückgängig machbar.
  function refundMode(a) {
    if (!a || a.refundPair || !(+a.amount < 0)) return null;
    const ls = txLogs(a.id);
    if (a.correctedBy) { const c = get("CheckAccountTransaction", a.correctedBy); if (!ls.length && (!c || String(c.transitWith) === "korrektur" || String(c.correctionOf) === String(a.id)) && !(c && c.enshrined)) return { mode: "correction", corr: c }; return null; }
    if (String(a.status) === "100" && !a.transitWith && !ls.length) return { mode: "open" };
    if (ls.length && ls.every(l => l.object && l.object.objectName === "Voucher" && String(l.object.id) === String(ls[0].object.id))) {
      const v = get("Voucher", ls[0].object.id);
      if (v && String(v.creditDebit) === "C" && !v.enshrined && r2((+v.paidAmount || 0) - Math.abs(+v.sumGross || 0)) >= Math.abs(+a.amount) - 0.005) return { mode: "voucher", voucher: v };
    }
    return null;
  }
  async function refundPairApply(aId, bId) {
    await load(); const a = need("CheckAccountTransaction", aId), b = need("CheckAccountTransaction", bId);
    if (String(b.status) !== "100" || b.transitWith || b.cashLocked) throw err(400, "Die Rückzahlung ist nicht mehr offen");
    const A = r2(+b.amount || 0); if (!(A > 0) || Math.abs(r2(+a.amount + A)) > 0.005) throw err(400, "Beträge passen nicht zusammen");
    if (a.enshrined || b.enshrined) throw err(400, "Festgeschrieben – Korrektur nur per Gegenbuchung");
    const m = refundMode(a); if (!m) throw err(400, "Die Ausgabe ist inzwischen anders verbucht");
    const at = nowIso(), da = dayOf(a.valueDate) || "", db = dayOf(b.valueDate) || today(), de = d => d.split("-").reverse().join(".");
    if (m.mode === "voucher") {
      const v = m.voucher, gross = Math.abs(+v.sumGross || 0);
      const l = { id: newId("CheckAccountTransactionLog"), object: ref("Voucher", v.id), checkAccountTransaction: ref("CheckAccountTransaction", b.id), amountPaid: s2(-A), bookingDate: iso(db), fromStatus: String(v.status), toStatus: String(v.status), refundOf: String(a.id) };
      await save("CheckAccountTransactionLog", l);
      v.paidAmount = s2(r2((+v.paidAmount || 0) - A)); v.status = +v.paidAmount >= gross - 0.005 ? "1000" : +v.paidAmount > 0.004 ? "750" : "100"; await save("Voucher", v);
      b.status = "200"; b.refundPair = { mode: "voucher", with: String(a.id), voucherId: String(v.id), logId: String(l.id), at }; await save("CheckAccountTransaction", b);
      return { objects: { mode: "voucher", voucherId: String(v.id) } };
    }
    const prev = { status: a.status, transitWith: a.transitWith || null, transitNote: a.transitNote || null, settledNote: a.settledNote || null, correctedBy: a.correctedBy || null, correctionNote: a.correctionNote || null };
    let corr = null;
    if (m.mode === "correction") { corr = m.corr ? JSON.parse(JSON.stringify(m.corr)) : null; if (m.corr) await del("CheckAccountTransaction", m.corr.id); delete a.correctedBy; delete a.correctionNote; }
    delete a.settledNote;
    a.status = "400"; a.transitWith = String(b.id); a.transitNote = "Doppelzahlung + Rückzahlung am " + de(db) + " (" + s2(A).replace(".", ",") + " €)"; a.refundPair = { mode: m.mode, with: String(b.id), prev, corr, at };
    b.status = "400"; b.transitWith = String(a.id); b.transitNote = "Rückzahlung der Doppelzahlung vom " + de(da); b.refundPair = { mode: m.mode, with: String(a.id), at };
    await save("CheckAccountTransaction", a); await save("CheckAccountTransaction", b);
    return { objects: { mode: m.mode, removedCorrection: corr ? String(corr.id) : null } };
  }
  async function refundUndo(txId) {
    await load(); const x = need("CheckAccountTransaction", txId), rp = x.refundPair; if (!rp) throw err(400, "Keine Doppelzahlung/Rückzahlung verbucht");
    if (x.enshrined || (get("CheckAccountTransaction", rp.with) || {}).enshrined) throw err(400, "Festgeschrieben – kann nicht gelöst werden");
    if (rp.mode === "voucher") {
      const b = x, v = get("Voucher", rp.voucherId), l = get("CheckAccountTransactionLog", rp.logId);
      if (v && v.enshrined) throw err(400, "Beleg festgeschrieben – kann nicht gelöst werden");
      if (l) await del("CheckAccountTransactionLog", l.id);
      if (v) { const gross = Math.abs(+v.sumGross || 0); v.paidAmount = s2(r2((+v.paidAmount || 0) + Math.abs(+b.amount || 0))); v.status = +v.paidAmount >= gross - 0.005 ? "1000" : +v.paidAmount > 0.004 ? "750" : "100"; await save("Voucher", v); }
      delete b.refundPair; b.status = txLogs(b.id).length ? "200" : "100"; await save("CheckAccountTransaction", b);
      return { objects: b };
    }
    const o = get("CheckAccountTransaction", rp.with), a = rp.prev ? x : o, b = rp.prev ? o : x;
    if (!a || !a.refundPair || !a.refundPair.prev) throw err(400, "Gegenstück nicht gefunden");
    const p = a.refundPair.prev, corr = a.refundPair.corr;
    ["status", "transitWith", "transitNote", "settledNote", "correctedBy", "correctionNote"].forEach(k => { if (p[k] == null) delete a[k]; else a[k] = p[k]; });
    delete a.refundPair; await save("CheckAccountTransaction", a);
    if (corr && corr.id && !get("CheckAccountTransaction", corr.id)) await save("CheckAccountTransaction", corr);
    if (b) { b.status = "100"; delete b.transitWith; delete b.transitNote; delete b.refundPair; await save("CheckAccountTransaction", b); }
    return { objects: a };
  }
  async function resetToOpen(t, id) {
    const o = need(t, id); if (isLocked(t, o)) throw err(400, "Festgeschrieben – Korrektur nur per Storno, Gutschrift oder Gegenbuchung");
    for (const l of all("CheckAccountTransactionLog").filter(l => l.object && l.object.objectName === t && String(l.object.id) === String(id))) {
      const tx = l.checkAccountTransaction && get("CheckAccountTransaction", l.checkAccountTransaction.id); if (tx) { tx.status = "100"; await save("CheckAccountTransaction", tx); }
      await del("CheckAccountTransactionLog", l.id);
    }
    o.paidAmount = "0"; o.payDate = null; o.status = t === "Voucher" ? "100" : "200"; await save(t, o); return { objects: o };
  }
  async function resetToDraft(t, id) { const o = need(t, id); if (isLocked(t, o)) throw err(400, "Festgeschrieben – Korrektur nur per Storno, Gutschrift oder Gegenbuchung"); if (+o.paidAmount > 0) throw err(400, "Bereits bezahlt – zuerst die Zahlung lösen");
    if (t === "Invoice" && String(o.status) !== "200") throw err(400, "Nur offene Rechnungen können auf Entwurf gesetzt werden"); o.status = t === "Voucher" ? "50" : "100"; await save(t, o); return { objects: o }; }
  async function cancelInvoice(id) {
    const o = need("Invoice", id); if (String(o.invoiceType) === "SR") throw err(400, "Stornorechnung kann nicht storniert werden");
    if (o.cancelled) throw err(400, "Bereits storniert");
    if (String(o.status) !== "200") throw err(400, String(o.status) === "100" ? "Entwürfe werden nicht storniert, sondern gelöscht" : "Bezahlte oder teilbezahlte Rechnungen werden per Gutschrift (Minderleistung) korrigiert, nicht storniert");
    const sr = Object.assign({}, o, { id: newId("Invoice"), invoiceType: "SR", invoiceNumber: await nextNumber("Invoice", "RE", "invoiceNumber", "RE-"), invoiceDate: iso(today()), status: "1000", origin: ref("Invoice", o.id), header: "Stornorechnung zu " + (o.invoiceNumber || ""), sendDate: null, enshrined: settings().autoEnshrine ? nowIso() : null });
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
      taxType: "noteu", taxText: "nicht umsatzsteuerbar (Schadenersatz)", origin: ref("Invoice", inv.id), dunningFee: true, feeOpenUsed: s2(Math.min(Math.max(0, +inv.dunningFeeOpen || 0), amt)) };
    const p = { id: newId("VoucherPos"), voucher: ref("Voucher", v.id), taxRate: "0", sumNet: s2(amt), sumGross: s2(amt), sumTax: "0.00", sumNetAccounting: s2(amt), sumGrossAccounting: s2(amt), sumTaxAccounting: "0.00", net: "false", comment: "Mahngebühr (Schadenersatz) – nicht umsatzsteuerbar" };
    if (at) p.accountingType = ref("AccountingType", at.id);
    await save("VoucherPos", p);
    v.sumNet = s2(amt); v.sumGross = s2(amt); v.sumTax = "0.00"; await save("Voucher", v);
    await save("CheckAccountTransactionLog", { id: newId("CheckAccountTransactionLog"), object: ref("Voucher", v.id), checkAccountTransaction: ref("CheckAccountTransaction", tx.id), amountPaid: s2(amt), bookingDate: iso(day), fromStatus: "100", toStatus: "1000" });
    inv.dunningFeeOpen = s2(Math.max(0, r2((+inv.dunningFeeOpen || 0) - amt))); inv.dunningFeePaid = s2(r2((+inv.dunningFeePaid || 0) + amt));
    return v;
  }

  // ── Kosten des Zahlungsverkehrs (Differenzgrund MTC): Ausgabe 0 % ohne Vorsteuer, über denselben Bankumsatz ──
  async function bookCost(inv, amt, tx, day, supplier) {
    const at = all("AccountingType").find(x => /geldverkehr|bankspesen|nebenkosten des geld/i.test(String(x.name || "")));
    const v = { id: newId("Voucher"), status: "1000", creditDebit: "C", voucherType: "VOU", currency: "EUR", voucherDate: iso(day), payDate: iso(day), paidAmount: s2(amt), sumNet: s2(amt), sumGross: s2(amt), sumTax: "0.00",
      supplierName: supplier || "Bank", description: (supplier && /mollie|paypal/i.test(supplier) ? supplier.replace(/ B\.V\./, "") + "-Zahlungsgebühr zu Rechnung " : "Kosten des Zahlungsverkehrs zu Rechnung ") + (inv.invoiceNumber || "") + " – ohne Vorsteuer", taxText: "keine Vorsteuer", origin: ref("Invoice", inv.id) };
    const p = { id: newId("VoucherPos"), voucher: ref("Voucher", v.id), taxRate: "0", sumNet: s2(amt), sumGross: s2(amt), sumTax: "0.00", sumNetAccounting: s2(amt), sumGrossAccounting: s2(amt), sumTaxAccounting: "0.00", net: "false", comment: "Nebenkosten des Geldverkehrs" };
    if (at) p.accountingType = ref("AccountingType", at.id);
    await save("VoucherPos", p); await save("Voucher", v);
    await save("CheckAccountTransactionLog", { id: newId("CheckAccountTransactionLog"), object: ref("Voucher", v.id), checkAccountTransaction: ref("CheckAccountTransaction", tx.id), amountPaid: s2(-amt), bookingDate: iso(day), fromStatus: "100", toStatus: "1000" });
    return v;
  }

  // ── Gutschrift „Minderleistung“ zu einer bezahlten/teilbezahlten Rechnung (sevDesk: nur dann, sonst Storno) ──
  async function creditNoteFromInvoice(invId, b) {
    const o = need("Invoice", invId);
    if (["RE", "ER", "AR", "TR"].indexOf(String(o.invoiceType)) < 0) throw err(400, "Nur zu Rechnungen möglich");
    if (["750", "1000"].indexOf(String(o.status)) < 0 || o.cancelled) throw err(400, "Gutschrift nur zu bezahlten oder teilbezahlten Rechnungen – offene Rechnungen bitte stornieren");
    // grossPricing: Bruttobetrag maßgeblich (z. B. Erstattung über Mollie 9,69 € → Gutschrift genau 9,69 €, USt daraus zurückgerechnet – wie posSums)
    const gp = p => (p.grossPricing === true || p.grossPricing === "true") && p.priceGross != null && isFinite(+p.priceGross);
    const pos = (b.positions || []).map(p => Object.assign({ name: String(p.name || "Minderleistung").slice(0, 200), text: String(p.text || ""), quantity: String(+p.quantity || 0), price: s2(gp(p) ? +p.priceGross / (1 + (+p.taxRate || 0) / 100) : +p.price || 0), taxRate: String(+p.taxRate || 0) },
      gp(p) ? { grossPricing: true, priceGross: s2(+p.priceGross) } : {})).filter(p => +p.quantity && (+p.price || +p.priceGross));
    if (!pos.length) throw err(400, "Keine Positionen");
    const already = all("CreditNote").filter(c => c.refSrcInvoice && String(c.refSrcInvoice.id) === String(o.id)).reduce((a, c) => a + (+c.sumGross || 0), 0);
    const sum = pos.reduce((a, p) => a + (p.grossPricing ? (+p.quantity) * (+p.priceGross) : (+p.quantity) * (+p.price) * (1 + (+p.taxRate) / 100)), 0);
    if (r2(already + sum) > r2(+o.sumGross || 0) + 0.01) throw err(400, "Gutschriften wären höher als die Rechnung");
    const day = dayOf(b.date) || today();
    const cn = { id: newId("CreditNote"), status: "200", currency: "EUR", paidAmount: "0", creditNoteDate: iso(day), deliveryDate: o.deliveryDate || o.invoiceDate, contact: o.contact, address: o.address, addressCountry: o.addressCountry, contactPerson: o.contactPerson,
      creditNoteNumber: await nextNumber("CreditNote", "", "creditNoteNumber", "GU-"), header: "Gutschrift zu Rechnung " + (o.invoiceNumber || ""), headText: String(b.reason || "Wir schreiben Ihnen folgende Beträge zu Rechnung " + (o.invoiceNumber || "") + " gut:"),
      footText: "Der Betrag wird Ihnen erstattet bzw. mit offenen Forderungen verrechnet.", taxType: o.taxType, taxRule: o.taxRule, taxSet: o.taxSet, taxText: o.taxText, bookingCategory: "UNDERACHIEVEMENT", refSrcInvoice: ref("Invoice", o.id), creditNoteCategory: "UNDERACHIEVEMENT" };
    if (b.creditKey) cn.creditKey = String(b.creditKey).slice(0, 160);   // Ein-Klick-Vorschlag (fin-credit.js): dieselbe Gutschrift nie zweimal
    if (settings().autoEnshrine) cn.enshrined = nowIso();
    for (const [k, p] of pos.entries()) { const x = Object.assign({ id: newId("CreditNotePos"), creditNote: ref("CreditNote", cn.id), positionNumber: String(k), unity: ref("Unity", 1) }, p); posSums(x); await save("CreditNotePos", x); }
    docSums(cn, positionsOf("CreditNote", cn.id)); await save("CreditNote", cn);
    return { objects: cn };
  }

  // Storno per Gutschrift: Rechnung ist durch ihre Gutschriften vollständig ausgeglichen → als storniert/verrechnet abschließen.
  // Zahlungen, die an der Rechnung hingen, werden gelöst (Umsatz wieder offen, z. B. für den richtigen Beleg) – auch bei
  // festgeschriebener Rechnung, weil die Rechnung selbst unverändert bleibt; jede gelöste Zuordnung wird protokolliert.
  async function settleCredited(invId, b) {
    const o = need("Invoice", invId);
    if (["RE", "ER", "AR", "TR"].indexOf(String(o.invoiceType)) < 0) throw err(400, "Nur zu Rechnungen möglich");
    if (o.cancelled) throw err(400, "Bereits storniert");
    const cns = all("CreditNote").filter(c => c.refSrcInvoice && String(c.refSrcInvoice.id) === String(o.id));
    const credited = r2(cns.reduce((a, c) => a + (+c.sumGross || 0), 0));
    if (Math.abs(credited - r2(+o.sumGross || 0)) > 0.01) throw err(400, "Gutschriften (" + s2(credited) + ") decken die Rechnung (" + s2(+o.sumGross || 0) + ") nicht vollständig");
    const day = today(), freed = [];
    for (const l of all("CheckAccountTransactionLog").filter(l => l.object && l.object.objectName === "Invoice" && String(l.object.id) === String(o.id))) {
      const tx = l.checkAccountTransaction && get("CheckAccountTransaction", l.checkAccountTransaction.id);
      if (tx && !all("CheckAccountTransactionLog").some(x => x.id !== l.id && x.checkAccountTransaction && String(x.checkAccountTransaction.id) === String(tx.id))) { tx.status = "100"; await save("CheckAccountTransaction", tx); }
      await save("PaymentUnlink", { id: newId("PaymentUnlink"), at: nowIso(), reason: String(b.reason || "Storno per Gutschrift").slice(0, 200), invoice: ref("Invoice", o.id), log: l });
      await del("CheckAccountTransactionLog", l.id); freed.push({ txId: tx ? String(tx.id) : "", amount: +l.amountPaid || 0 });
    }
    for (const c of cns) { c.status = "1000"; c.paidAmount = c.sumGross; c.payDate = c.payDate || iso(day); await save("CreditNote", c); }
    o.paidAmount = "0"; o.status = "1000"; o.cancelled = true; o.cancelledBy = cns.map(c => c.creditNoteNumber).join(", "); o.payDate = iso(day);
    await save("Invoice", o);
    return { objects: { id: o.id, invoiceNumber: o.invoiceNumber, freed } };
  }
  // ── Kassenbuch: jede Buchung sofort unveränderbar, Korrektur nur per Gegenbuchung mit Tagesdatum, kein negativer Bestand ──
  function isCash(accId) { const a = get("CheckAccount", accId); return !!a && /register|kasse/i.test(String(a.type || "") + " " + String(a.cash || "")); }
  function cashBalance(accId, untilDay) { return r2(all("CheckAccountTransaction").filter(x => x.checkAccount && String(x.checkAccount.id) === String(accId) && (!untilDay || (dayOf(x.valueDate) || "") <= untilDay)).reduce((a, x) => a + (+x.amount || 0), 0)); }
  async function cashGuard(accId, isoDay, amount) {
    // Bestand darf an keinem Tag ab der Buchung negativ werden
    const d = dayOf(isoDay), days = all("CheckAccountTransaction").filter(x => x.checkAccount && String(x.checkAccount.id) === String(accId)).map(x => dayOf(x.valueDate)).filter(x => x && x >= d);
    for (const k of [d].concat(days)) if (cashBalance(accId, k) + amount < -0.004) throw err(400, "Kassenbestand würde am " + k.split("-").reverse().join(".") + " negativ – Kassenbuch darf nie unter 0 fallen");
  }
  async function cashOp(b) {
    const op = String(b.op || "");
    if (op === "open") {
      if (all("CheckAccount").some(a => isCash(a.id) && String(a.status) !== "0")) throw err(400, "Es gibt bereits eine Kasse");
      const day = dayOf(b.date) || today(), start = r2(+b.amount || 0); if (start < 0) throw err(400, "Anfangsbestand darf nicht negativ sein");
      const acc = { id: newId("CheckAccount"), name: String(b.name || "Kasse").slice(0, 60), type: "register", cash: "register", currency: "EUR", status: "100", defaultAccount: "0", importType: null };
      await save("CheckAccount", acc);
      if (start > 0) await save("CheckAccountTransaction", { id: newId("CheckAccountTransaction"), valueDate: iso(day), entryDate: iso(day), amount: s2(start), paymtPurpose: "Anfangsbestand", payeePayerName: "", checkAccount: ref("CheckAccount", acc.id), status: "400", cashLocked: nowIso(), cashKind: "start" });
      return { objects: acc };
    }
    const accId = String(b.accountId || ""); if (!isCash(accId)) throw err(400, "Keine Kasse");
    if (op === "book") {
      const day = dayOf(b.date) || today(); if (day > today()) throw err(400, "Kassenbuchungen nicht in der Zukunft");
      const amt = r2(Math.abs(+b.amount || 0)) * (String(b.dir) === "out" ? -1 : 1); if (!amt) throw err(400, "Betrag fehlt");
      await cashGuard(accId, iso(day), amt);
      const tx = { id: newId("CheckAccountTransaction"), valueDate: iso(day), entryDate: iso(today()), amount: s2(amt), paymtPurpose: String(b.text || "").slice(0, 300), payeePayerName: String(b.name || "").slice(0, 120), checkAccount: ref("CheckAccount", accId), status: "100", cashLocked: nowIso() };
      await save("CheckAccountTransaction", tx); return { objects: tx };
    }
    if (op === "reverse") {
      const t0 = need("CheckAccountTransaction", b.id); if (!t0.checkAccount || String(t0.checkAccount.id) !== accId) throw err(400, "Falsche Kasse");
      if (t0.reversedBy || t0.reverses) throw err(400, "Bereits storniert bzw. selbst eine Gegenbuchung");
      if (all("CheckAccountTransactionLog").some(l => l.checkAccountTransaction && String(l.checkAccountTransaction.id) === String(t0.id))) throw err(400, "Mit Beleg/Rechnung verknüpft – zuerst dort die Zahlung lösen");
      const amt = r2(-(+t0.amount || 0)); await cashGuard(accId, iso(today()), amt);
      const tx = { id: newId("CheckAccountTransaction"), valueDate: iso(today()), entryDate: iso(today()), amount: s2(amt), paymtPurpose: "Storno/Gegenbuchung zu Kassenbuchung vom " + (dayOf(t0.valueDate) || "").split("-").reverse().join(".") + ": " + (t0.paymtPurpose || ""), payeePayerName: t0.payeePayerName || "", checkAccount: ref("CheckAccount", accId), status: "400", cashLocked: nowIso(), reverses: String(t0.id) };
      await save("CheckAccountTransaction", tx); t0.reversedBy = String(tx.id); t0.status = "400"; await save("CheckAccountTransaction", t0); return { objects: tx };
    }
    throw err(400, "unbekannte Kassen-Aktion");
  }

  // ── Abschlags- und Schlussrechnung aus einem Angebot/Auftrag ──
  function ordersInv(orderId) { return all("Invoice").filter(i => i.origin && String(i.origin.id) === String(orderId) && String(i.origin.objectName || "Order") === "Order"); }
  async function partialFromOrder(orderId, b) {
    const od = need("Order", orderId);
    if (ordersInv(orderId).some(i => String(i.invoiceType) === "ER" || (String(i.invoiceType) === "RE" && !i.cancelled))) throw err(400, "Zum Angebot gibt es bereits eine Schluss-/Gesamtrechnung");
    const pos = positionsOf("Order", od.id); if (!pos.length) throw err(400, "Angebot hat keine Positionen");
    const net = pos.reduce((a, p) => a + (+p.sumNet || 0), 0); if (!(net > 0)) throw err(400, "Angebotssumme fehlt");
    let f = +b.percent > 0 ? (+b.percent) / 100 : (+b.amount > 0 ? (+b.amount) / (+od.sumGross || net) : 0);
    if (!(f > 0 && f <= 1)) throw err(400, "Prozent oder Betrag angeben");
    const ars = ordersInv(orderId).filter(i => String(i.invoiceType) === "AR" && !i.cancelled), sofar = ars.reduce((a, i) => a + (+i.sumNet || 0), 0);
    if (sofar + net * f > net + 0.01) throw err(400, "Abschläge wären höher als das Angebot");
    const byRate = {}; pos.forEach(p => { const r = String(+p.taxRate || 0); byRate[r] = (byRate[r] || 0) + (+p.sumNet || 0); });
    const nr = ars.length + 1, pct = Math.round(f * 1000) / 10;
    const body = { invoice: { contact: od.contact, address: od.address, addressCountry: od.addressCountry, contactPerson: od.contactPerson, invoiceType: "AR", status: "100", header: nr + ". Abschlagsrechnung zu " + (od.orderNumber || "Angebot"),
      headText: "Vereinbarungsgemäß stellen wir Ihnen die " + nr + ". Abschlagszahlung (" + String(pct).replace(".", ",") + " %) für das Angebot " + (od.orderNumber || "") + " in Rechnung:", footText: "Die Abschlagszahlung wird mit der Schlussrechnung verrechnet. Zahlbar innerhalb von 14 Tagen.", timeToPay: "14",
      taxType: od.taxType, taxSet: od.taxSet, taxRule: od.taxRule, taxText: od.taxText, origin: ref("Order", od.id), deliveryDate: iso(today()) },
      invoicePosSave: Object.keys(byRate).map((r, k) => ({ name: "Abschlag " + String(pct).replace(".", ",") + " % auf " + (od.orderNumber || "Angebot") + (Object.keys(byRate).length > 1 ? " (" + r + " %)" : ""), quantity: 1, price: s2(byRate[r] * f), taxRate: r, positionNumber: String(k), unity: ref("Unity", 1) })) };
    const res = await saveInvoice(body);
    od.status = "750"; await save("Order", od);
    return { objects: res.objects.invoice };
  }
  async function finalFromOrder(orderId, b) {
    const od = need("Order", orderId);
    const linked = ordersInv(orderId), ars = linked.filter(i => (String(i.invoiceType) === "AR" || String(i.invoiceType) === "TR") && !i.cancelled);
    if (linked.some(i => String(i.invoiceType) === "ER" && !i.cancelled)) throw err(400, "Schlussrechnung gibt es bereits");
    if (!ars.length) throw err(400, "Keine Abschlagsrechnungen – bitte normale Rechnung aus dem Angebot erstellen");
    const unpaid = ars.filter(i => String(i.invoiceType) === "AR" && String(i.status) !== "1000"); if (unpaid.length) throw err(400, "Schlussrechnung erst, wenn alle Abschläge bezahlt sind (" + unpaid.map(i => i.invoiceNumber || "Entwurf").join(", ") + ")");
    const day = today(); const late = ars.find(i => (dayOf(i.invoiceDate) || "") > day); if (late) throw err(400, "Datum der Schlussrechnung liegt vor einer Abschlagsrechnung");
    const save0 = positionsOf("Order", od.id).map((p, k) => ({ name: p.name, text: p.text, quantity: p.quantity, price: p.price, taxRate: p.taxRate, unity: p.unity, positionNumber: String(k), part: p.part }));
    let k = save0.length;
    for (const a of ars) for (const p of positionsOf("Invoice", a.id)) save0.push({ name: "abzüglich " + (String(a.invoiceType) === "TR" ? "Teilrechnung " : "Abschlagsrechnung ") + (a.invoiceNumber || "") + " vom " + (dayOf(a.invoiceDate) || "").split("-").reverse().join("."), quantity: "1", price: s2(-(+p.sumNet || 0)), taxRate: p.taxRate, positionNumber: String(k++), unity: ref("Unity", 1) });
    const res = await saveInvoice({ invoice: { contact: od.contact, address: od.address, addressCountry: od.addressCountry, contactPerson: od.contactPerson, invoiceType: "ER", status: "100", header: "Schlussrechnung zu " + (od.orderNumber || "Angebot"),
      headText: "Für die vereinbarten Leistungen laut " + (od.orderNumber || "Angebot") + " stellen wir Ihnen abzüglich der geleisteten Abschlagszahlungen in Rechnung:", footText: "Zahlbar innerhalb von 14 Tagen ohne Abzug.", timeToPay: "14",
      taxType: od.taxType, taxSet: od.taxSet, taxRule: od.taxRule, taxText: od.taxText, origin: ref("Order", od.id), deliveryDate: iso(dayOf(b && b.deliveryDate) || day) }, invoicePosSave: save0 });
    od.status = "1000"; await save("Order", od);
    return { objects: res.objects.invoice };
  }

  // ── Wiederkehrende Rechnungen: Vorlage (Typ WKR) mit Intervall; erzeugt zum Termin eine normale Rechnung ──
  const IV = { "7D": [0, 0, 7], "14D": [0, 0, 14], "1M": [0, 1, 0], "2M": [0, 2, 0], "3M": [0, 3, 0], "6M": [0, 6, 0], "12M": [1, 0, 0], "24M": [2, 0, 0], "36M": [3, 0, 0], "48M": [4, 0, 0], "60M": [5, 0, 0] };
  function addIv(d, iv, k) { const [y, m, dd] = IV[iv] || IV["1M"]; const x = new Date(d + "T12:00:00Z"); const day = x.getUTCDate(); x.setUTCDate(1); x.setUTCFullYear(x.getUTCFullYear() + y * (k || 1)); x.setUTCMonth(x.getUTCMonth() + m * (k || 1)); const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(day, last)); x.setUTCDate(x.getUTCDate() + dd * (k || 1)); return x.toISOString().slice(0, 10); }
  async function recurringSave(b) {
    let w;
    if (b.id) { w = need("Invoice", b.id); if (String(w.invoiceType) !== "WKR") throw err(400, "Keine Vorlage"); }
    else {
      const src = need("Invoice", b.fromId);
      w = Object.assign({}, src, { id: newId("Invoice"), invoiceType: "WKR", status: "100", invoiceNumber: null, paidAmount: "0", payDate: null, sendDate: null, sendType: null, enshrined: null, cancelled: null, origin: ref("Invoice", src.id), dunningLevel: null, dunningFeeOpen: null, header: String(src.header || "Rechnung").replace(/Nr\.?\s*\S+/, "").trim() || "Rechnung" });
      for (const [k, p] of positionsOf("Invoice", src.id).entries()) { const x = Object.assign({}, p, { id: newId("InvoicePos"), invoice: ref("Invoice", w.id), positionNumber: String(k) }); await save("InvoicePos", x); }
    }
    const iv = IV[b.interval] ? b.interval : ((w.recur && w.recur.interval) || "1M"), start = dayOf(b.start) || (w.recur && w.recur.next) || today();
    w.recur = Object.assign({}, w.recur || {}, { interval: iv, next: start, end: dayOf(b.end) || null, autoSend: !!b.autoSend, active: b.active !== false, advance: String(b.advance) === "1" || b.advance === true, periodText: b.periodText !== false });
    await save("Invoice", w); return { objects: w };
  }
  async function recurringCreate(w, forDay) {
    const d = forDay || w.recur.next || today(), iv = w.recur.interval;
    // Leistungszeitraum: im Voraus = [d, nächster Termin − 1], nachträglich = [voriger Termin, d − 1]
    const prevD = addIv(d, iv, -1), nextD = addIv(d, iv, 1), minus1 = x => { const y = new Date(x + "T12:00:00Z"); y.setUTCDate(y.getUTCDate() - 1); return y.toISOString().slice(0, 10); };
    const from = w.recur.advance ? d : prevD, until = w.recur.advance ? minus1(nextD) : minus1(d), fmt = x => x.split("-").reverse().join(".");
    const body = { invoice: { contact: w.contact, address: w.address, addressCountry: w.addressCountry, contactPerson: w.contactPerson, invoiceType: "RE", status: "100", header: w.header || "Rechnung", headText: (w.headText || "") + (w.recur.periodText !== false ? "<br>Leistungszeitraum: " + fmt(from) + " – " + fmt(until) : ""), footText: w.footText, timeToPay: w.timeToPay || "14",
      taxType: w.taxType, taxSet: w.taxSet, taxRule: w.taxRule, taxText: w.taxText, invoiceDate: iso(d), deliveryDate: iso(from), deliveryDateUntil: iso(until), origin: ref("Invoice", w.id), showNet: w.showNet },
      invoicePosSave: positionsOf("Invoice", w.id).map((p, k) => ({ name: p.name, text: p.text, quantity: p.quantity, price: p.price, taxRate: p.taxRate, unity: p.unity, positionNumber: String(k), part: p.part })) };
    const r = (await saveInvoice(body)).objects.invoice;
    w.recur.last = d; w.recur.lastInvoice = String(r.id); w.recur.next = addIv(d, iv, 1);
    if (w.recur.end && w.recur.next > w.recur.end) w.recur.active = false;
    await save("Invoice", w);
    return r;
  }
  // ── Wiederkehrende Belege (sevDesk-Vorlagen Typ „RV“, Intervall ISO z. B. P0Y1M): zum Termin einen ENTWURF (Status 50) anlegen –
  //    „Fertig erfasst“ (offen) wird er erst nach Bestätigung („Zur Prüfung“ bzw. im Beleg) ──
  function addIso(d, iso, k) { const m = String(iso || "P0Y1M").match(/P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?/) || []; const x = new Date(d + "T12:00:00Z"), day0 = x.getUTCDate(), y = +(m[1] || 0), mo = +(m[2] || 0), w = +(m[3] || 0), dd = +(m[4] || 0);
    if (y || mo) { x.setUTCDate(1); x.setUTCFullYear(x.getUTCFullYear() + y * k); x.setUTCMonth(x.getUTCMonth() + mo * k); const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(day0, last)); }
    x.setUTCDate(x.getUTCDate() + (w * 7 + dd) * k); return x.toISOString().slice(0, 10); }
  // Belegdatei der Vorlage (z. B. Versicherungspolizze, Abo-Rechnung) an jeden erzeugten Beleg hängen
  async function copyTemplateDoc(rv, v) {
    if (v.document || !rv.document) return false;
    try { const r = await fin.getFile("doc", "Voucher", rv.id); if (!r || !r.data) return false;
      await attachDoc(v.id, { buf: Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data), type: r.mime || "application/pdf", name: r.filename || "Beleg" }, { fromRecurring: String(rv.id) }); return true; }
    catch (e) { console.error("Vorlagen-Beleg kopieren:", e.message); return false; }
  }
  async function recurringVoucherRun() {
    await load(); const t = today(), set = get("FinSetting", "1") || { id: "1" };
    // bereits erzeugte Belege ohne Datei nachträglich ergänzen
    for (const v of all("Voucher").filter(v => v.fromRecurring && !v.document)) { const rv = get("Voucher", v.fromRecurring); if (rv) await copyTemplateDoc(rv, v); }
    if (!set.rvSince) { set.rvSince = t; await save("FinSetting", set); }   // ab Umstieg; ältere, längst fällige Vorlagen waren in sevDesk pausiert
    const made = [];
    for (const rv of all("Voucher").filter(v => String(v.voucherType) === "RV" && v.recurringInterval && v.recurringNextVoucher)) {
      let next = dayOf(rv.recurringNextVoucher), end = dayOf(rv.recurringEndDate), guard = 0;
      if (rv.rvPaused || !next || (next < addIso(set.rvSince, "P0Y0M0W7D", -1) && !rv.rvActive)) continue;
      while (next <= t && (!end || next <= end) && guard++ < 24) {
        const v = Object.assign({}, rv, { id: newId("Voucher"), voucherType: "VOU", status: "50", voucherDate: iso(next), deliveryDate: iso(next), paidAmount: "0", payDate: null, enshrined: null, document: null, recurringInterval: null, recurringNextVoucher: null, recurringStartDate: null, recurringEndDate: null, recurringLastVoucher: null, fromRecurring: String(rv.id) });
        for (const p of positionsOf("Voucher", rv.id)) await save("VoucherPos", Object.assign({}, p, { id: newId("VoucherPos"), voucher: ref("Voucher", v.id) }));
        await save("Voucher", v); made.push(v);
        await copyTemplateDoc(rv, v);
        rv.recurringLastVoucher = iso(next); next = addIso(next, rv.recurringInterval, 1); rv.recurringNextVoucher = iso(next);
      }
      await save("Voucher", rv);
    }
    return made;
  }
  // fällige Vorlagen abarbeiten (Server ruft das regelmäßig auf) → Liste der neuen Rechnungen
  async function recurringRun(onlyId) {
    await load(); const out = [], t = today();
    for (const w of all("Invoice").filter(x => String(x.invoiceType) === "WKR" && x.recur && (onlyId ? String(x.id) === String(onlyId) : x.recur.active))) {
      let guard = 0;
      if (onlyId) { out.push({ template: w, invoice: await recurringCreate(w) }); continue; }
      while (w.recur.active && w.recur.next && w.recur.next <= t && guard++ < 24) out.push({ template: w, invoice: await recurringCreate(w) });
    }
    return out;
  }
  async function invoiceFromOrder(body) {
    const od = need("Order", body.order && body.order.id);
    const inv = { invoice: { contact: od.contact, address: od.address, addressCountry: od.addressCountry, contactPerson: od.contactPerson, header: "Rechnung", headText: od.headText, footText: "Zahlbar innerhalb von 14 Tagen ohne Abzug.", timeToPay: "14", taxRate: od.taxRate, taxType: od.taxType, taxSet: od.taxSet, taxRule: od.taxRule, invoiceType: "RE", origin: ref("Order", od.id), deliveryDate: iso(today()) },
      invoicePosSave: positionsOf("Order", od.id).map((p, k) => Object.assign({ name: p.name, text: p.text, quantity: p.quantity, price: p.price, taxRate: p.taxRate, unity: p.unity, positionNumber: String(k), part: p.part }, p.grossPricing ? { grossPricing: true, priceGross: p.priceGross, discount: p.discount } : {})) };   // Bruttopreis-Angebot → Rechnung cent-gleich
    const r = await saveInvoice(inv);
    od.status = "1000"; await save("Order", od);
    return { objects: [r.objects.invoice] };
  }

  // ── Gutschriften (z. B. kochdu-Auszahlungen) ──
  async function saveCreditNote(body) {
    const cb = Object.assign({}, body.creditNote || {});
    let o = cb.id ? get("CreditNote", cb.id) : null; const isNew = !o;
    if (o && String(o.status) !== "100") throw err(400, "Nur Entwürfe können geändert werden");   // wie Rechnungen (Review A6)
    posGuard("CreditNote", o, body.creditNotePosSave, body.creditNotePosDelete);
    o = Object.assign(o || { id: newId("CreditNote"), status: "100", currency: "EUR", paidAmount: "0" }, stripMeta(cb));
    if (cb.creditNoteDate) o.creditNoteDate = iso(dayOf(cb.creditNoteDate)); if (!o.creditNoteDate) o.creditNoteDate = iso(today());
    if (cb.deliveryDate) o.deliveryDate = iso(dayOf(cb.deliveryDate));
    if (isNew && !cb.creditNoteNumber) o.creditNoteNumber = await nextNumber("CreditNote", "", "creditNoteNumber", "GU-");
    for (const p of (body.creditNotePosDelete || [])) if (p && p.id) { const x = get("CreditNotePos", p.id); if (x && x.creditNote && String(x.creditNote.id) === String(o.id)) await del("CreditNotePos", p.id); }
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
    else if (isNew) {   // mitgeschickte Nummer: nackt („1052“) oder schon vergeben → nächste freie; sonst Nummernkreis nachziehen, damit die nächste Abfrage weiterzählt
      const nr = String(o.orderNumber), ty = o.orderType || "AN", m = nr.match(/^(.*?)(\d+)$/), seq = seqFor("Order", ty);
      if (/^\d+$/.test(nr) || all("Order").some(x => String(x.orderNumber || "") === nr)) o.orderNumber = await nextNumber("Order", ty, "orderNumber", ty + "-");
      else if (m && seq && +m[2] >= (+seq.nextSequence || 0)) { seq.nextSequence = String(+m[2] + 1); await save("SevSequence", seq); }
    }
    (body.orderPosDelete || []).forEach(p => { if (p && p.id && C.OrderPos) C.OrderPos.delete(String(p.id)); });
    for (const p of (body.orderPosSave || [])) { const x = Object.assign(p.id ? (get("OrderPos", p.id) || {}) : { id: newId("OrderPos") }, stripMeta(p), { order: ref("Order", o.id) }); posSums(x); await save("OrderPos", x); }
    docSums(o, positionsOf("Order", o.id)); await save("Order", o);
    return { objects: { order: o } };
  }

  // ── Belege ──
  async function saveVoucher(body) {
    const vb = Object.assign({}, body.voucher || {});
    let o = vb.id ? get("Voucher", vb.id) : null;
    if (o && isLocked("Voucher", o)) {
      // Festgeschrieben: nur die Belegdatei darf nachgereicht werden (keine Positionen, keine Beträge, keine anderen Felder)
      const onlyFile = body.filename && TMP.has(body.filename) && !(body.voucherPosSave || []).length && !(body.voucherPosDelete || []).length && Object.keys(vb).every(k => ["id", "objectName", "mapAll"].indexOf(k) > -1);
      if (!onlyFile) throw err(400, "Festgeschrieben – Korrektur nur per Gegenbeleg (Generalumkehr)");
      const f = TMP.get(body.filename); TMP.delete(body.filename);
      await attachDoc(o.id, f, { upload: true, filename: f.name, at: nowIso() });
      return { objects: { voucher: o } };
    }
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
  // Belegdatei an einen bestehenden Beleg hängen. Auch bei festgeschriebenen Belegen erlaubt (Beleg nachreichen ändert keine
  // Beträge) – geändert werden nur document/docSource, die Datei liegt wie importierte Belegdateien in fin_file (doc/Voucher).
  async function attachDoc(vid, f, src) {
    await load(); const o = need("Voucher", vid);
    if (!f || !f.buf || !f.buf.length) throw err(400, "Datei fehlt");
    const docId = newId("Document"); await save("Document", { id: docId, filename: f.name || "beleg", mimeType: f.type || "application/octet-stream", object: ref("Voucher", o.id) });
    await fin.putFileRaw("doc", "Voucher", o.id, f);
    o.document = ref("Document", docId); o.docSource = src || null; await save("Voucher", o);
    return o;
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
  // Kundennummer wie in sevDesk: fortlaufend aus dem übernommenen Nummernkreis (nie doppelt), wenn keine numerische mitkommt
  async function nextCustomerNumber() {
    const seq = seqFor("Contact", "contact"); let mx = 1000;
    all("Contact").forEach(c => { const n = /^\d+$/.test(String(c.customerNumber || "")) ? +c.customerNumber : 0; if (n > mx) mx = n; });
    const n = Math.max(mx + 1, seq && +seq.nextSequence || 0);
    if (seq) { seq.nextSequence = String(n + 1); await save("SevSequence", seq); }
    return String(n);
  }
  async function create(t, body) {
    const o = Object.assign({ id: newId(t) }, stripMeta(body || {}));
    if (t === "Contact" && !/^\d+$/.test(String(o.customerNumber || ""))) { if (o.customerNumber) o.externalNumber = String(o.customerNumber); o.customerNumber = await nextCustomerNumber(); }
    await save(t, o); return { objects: o };
  }
  async function update(t, id, body) {
    const o = need(t, id);
    if (t === "CheckAccountTransaction" && o.cashLocked && Object.keys(body || {}).some(k => k !== "status")) throw err(400, "Kassenbuchungen sind unveränderbar – Korrektur nur per Gegenbuchung");
    if (["Invoice", "Voucher", "CreditNote"].indexOf(t) > -1 && isLocked(t, o) && Object.keys(body || {}).some(k => ["status", "dunningLevel", "reminderDeadline"].concat(t === "Voucher" ? ["document", "docSource"] : []).indexOf(k) < 0)) throw err(400, "Festgeschrieben – Korrektur nur per Storno, Gutschrift oder Gegenbuchung");
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
    if (p === "/SevSequence/Factory/getByType") { const ot = String(q.objectType || ""), ty = String(q.type || ""), s = seqFor(ot, ty); return { objects: ot === "Order" ? [orderSeqPeek(ty || "AN", s)] : s ? [s] : [] }; }
    if (p === "/Invoice/Factory/getNextInvoiceNumber") {
      const t = String(q.invoiceType || "RE"), nr = await nextNumber("Invoice", t, "invoiceNumber", INV_PREFIX[t] || "RE-");
      if (String(q.useNextNumber) !== "true") { const seq = seqFor("Invoice", t); if (seq) { seq.nextSequence = String((+seq.nextSequence || 1) - 1); await save("SevSequence", seq); } }
      return { objects: nr };
    }
    if (p === "/Contact/Factory/getNextCustomerNumber") { const seq = seqFor("Contact", "contact"); let mx = 1000; all("Contact").forEach(c => { const n = /^\d+$/.test(String(c.customerNumber || "")) ? +c.customerNumber : 0; if (n > mx) mx = n; }); return { objects: String(Math.max(mx + 1, seq && +seq.nextSequence || 0)) }; }
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
      if (p === "/Fin/enshrinePeriod") return enshrinePeriod(b || {});
      if (p === "/Fin/creditNoteFromInvoice") return b && b.op === "settle" ? settleCredited(b.invoiceId, b) : creditNoteFromInvoice(b && b.invoiceId, b || {});
      if (p === "/Fin/cash") return cashOp(b || {});
      if (p === "/Fin/partialFromOrder") return partialFromOrder(b && b.orderId, b || {});
      if (p === "/Fin/finalFromOrder") return finalFromOrder(b && b.orderId, b || {});
      if (p === "/Fin/recurring") { if (b && b.op === "delete") { const w = need("Invoice", b.id); if (String(w.invoiceType) !== "WKR") throw err(400, "Keine Vorlage"); for (const x of positionsOf("Invoice", w.id)) await del("InvoicePos", x.id); await del("Invoice", w.id); return { objects: [null] }; }
        if (b && b.op === "run") { const r = await recurringRun(b.id); return { objects: r.map(x => x.invoice) }; }
        return recurringSave(b || {}); }
      if (p === "/Fin/settings") { const cur = get("FinSetting", "1") || { id: "1" }; Object.assign(cur, { autoEnshrine: !(b && b.autoEnshrine === false) }); await save("FinSetting", cur); return { objects: settings() }; }
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
        if (act === "enshrine") { const o = need("Invoice", id); if (+o.status < 200) throw err(400, "Entwürfe können nicht festgeschrieben werden"); if (!o.enshrined) { o.enshrined = nowIso(); await save("Invoice", o); } return { objects: o }; }
      }
      if (T === "Voucher" && id) {
        if (act === "bookAmount") return bookAmount("Voucher", id, b || {});
        if (act === "resetToDraft") return resetToDraft("Voucher", id);
        if (act === "resetToOpen") return resetToOpen("Voucher", id);
        if (act === "enshrine") { const o = need("Voucher", id); if (+o.status < 100) throw err(400, "Entwürfe können nicht festgeschrieben werden"); if (!o.enshrined) { o.enshrined = nowIso(); await save("Voucher", o); } return { objects: o }; }
      }
      if (T === "CreditNote" && id) {
        if (act === "bookAmount") return bookAmount("CreditNote", id, b || {});
        if (act === "sendBy") { const o = need("CreditNote", id); if (String(o.status) === "100") o.status = "200"; o.sendDate = nowIso(); o.sendType = (b && b.sendType) || "VPDF"; await save("CreditNote", o); return { objects: o }; }
        if (act === "enshrine") { const o = need("CreditNote", id); if (+o.status < 200) throw err(400, "Entwürfe können nicht festgeschrieben werden"); if (!o.enshrined) { o.enshrined = nowIso(); await save("CreditNote", o); } return { objects: o }; }
      }
      if (T === "Order" && id && act === "sendBy") { const o = need("Order", id); if (String(o.status) === "100") o.status = "200"; o.sendDate = nowIso(); o.sendType = (b && b.sendType) || "VPDF"; await save("Order", o); return { objects: o }; }
      if (method === "POST" && !id && !act) return create(T, b);
      if (method === "PUT" && id && !act) return update(T, id, b);
      if (method === "DELETE" && id && !act) { const o = need(T, id);
        if (["Invoice", "Voucher", "CreditNote", "CheckAccountTransaction"].indexOf(T) > -1 && isLocked(T, o)) throw err(400, "Festgeschrieben – kann nicht gelöscht werden");
        if ((T === "Invoice" || T === "CreditNote") && String(o.status) !== "100") throw err(400, "Nur Entwürfe können gelöscht werden – versendete Rechnungen bitte stornieren");
        if (T === "CheckAccountTransaction" && String(o.status) !== "100") throw err(400, "Verknüpfte Umsätze können nicht gelöscht werden");
        if (T === "CheckAccountTransaction" && o.cashLocked) throw err(400, "Kassenbuchungen können nicht gelöscht werden – Korrektur per Gegenbuchung");
        if (T === "CheckAccount" && isCash(id) && all("CheckAccountTransaction").some(x => x.checkAccount && String(x.checkAccount.id) === String(id))) throw err(400, "Kasse mit Buchungen kann nicht gelöscht werden");
        await del(T, id); return { objects: [null] }; }
      throw err(400, "Nicht unterstützt: " + method + " " + p);
    }
    // Lesen
    if (id && !act) { const o = get(T, id); if (!o) throw err(400, T + " nicht gefunden"); return { objects: [embed(o, q)] }; }
    if (!id && !act) { const arr = sortById(filterList(T, q)).map(o => embed(o, q)); return { objects: page(arr, q), total: arr.length }; }
    throw err(400, "Nicht unterstützt: GET " + p);
  }
  // Geldtransit zwischen eigenen Konten (PayPal → Bank, Bank → Kasse …): gleicher Betrag, Gegenbuchung 0–7 Tage später, Text deutet auf Übertrag.
  // Wird nur erkannt und als Vorschlag „Zur Prüfung“ abgelegt (fin-proposals.js) – verknüpft wird erst nach Bestätigung (pairApply).
  let PROP = null;
  function setProposer(p) { PROP = p; }
  async function pairTransfers() {
    if (!PROP) return 0;
    const busy = await PROP.busyTx("transfer");
    let n = 0; const open = all("CheckAccountTransaction").filter(x => String(x.status) === "100" && !x.transitWith && !x.cashLocked && !busy.has(String(x.id)));
    const out = open.filter(x => +x.amount < 0 && /auszahlung auf (ihr )?bankkonto|abbuchung auf bankkonto|withdrawal|transfer to bank|überweisung auf bankkonto|paypal/i.test(String(x.paymtPurpose) + " " + String(x.payeePayerName)));
    for (const a of out) {
      if (open.indexOf(a) < 0) continue;
      const amt = -(+a.amount), d = dayOf(a.valueDate);
      const b = open.find(x => x !== a && !x.transitWith && Math.abs((+x.amount || 0) - amt) < 0.005 && String((x.checkAccount || {}).id) !== String((a.checkAccount || {}).id) && (() => { const dd = (Date.parse(dayOf(x.valueDate)) - Date.parse(d)) / 864e5; return dd >= -5 && dd <= 7; })() && /paypal|übertrag|umbuchung|auszahlung|bankeinzug/i.test(String(x.payeePayerName) + " " + String(x.paymtPurpose)));
      if (!b) continue;
      const cnt = open.filter(x => x !== a && !x.transitWith && Math.abs((+x.amount || 0) - amt) < 0.005 && String((x.checkAccount || {}).id) !== String((a.checkAccount || {}).id) && (() => { const dd = (Date.parse(dayOf(x.valueDate)) - Date.parse(d)) / 864e5; return dd >= -5 && dd <= 7; })()).length;
      const an = (get("CheckAccount", (a.checkAccount || {}).id) || {}).name || "Konto", bn = (get("CheckAccount", (b.checkAccount || {}).id) || {}).name || "Konto";
      if (await PROP.add({ autoAccept: cnt === 1, kind: "transfer", key: "transfer:" + a.id + ":" + b.id, txIds: [String(a.id), String(b.id)], txId: String(a.id), amount: r2(amt), date: d, title: "Geldtransit " + an + " → " + bn, detail: an + " " + d + ": " + String(a.payeePayerName || a.paymtPurpose || "").slice(0, 60) + " · " + bn + " " + dayOf(b.valueDate) + ": " + String(b.payeePayerName || b.paymtPurpose || "").slice(0, 60), source: "Kontoauszug-Import", payload: { aId: String(a.id), bId: String(b.id) } })) n++;
      open.splice(open.indexOf(b), 1);
    }
    return n;
  }
  // Doppelzahlung zurückbekommen (Rückzahlung einer früheren Ausgabe gleichen Betrags) und Guthaben zurückgezahlt (Ausgang an den Kunden):
  // nur erkennen und „Zur Prüfung“ vorschlagen – verbucht wird erst per Klick (refundPairApply / creditRefund), nie automatisch.
  const REFUND_RX = /doppel(t|zahlung|buchung)|r(ü|ue)ckzahlung|r(ü|ue)ckerstattung|r(ü|ue)ck(ü|ue)berweisung|erstattung|gutschrift|refund/i;
  const foldN = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const NAME_STOP = new Set(["gmbh", "mbh", "und", "the", "ltd", "inc", "bank", "sparkasse", "raiffeisen", "erste", "online", "zahlung", "rechnung", "gutschrift", "auszahlung", "doppelzahlung", "rueckzahlung", "ruckzahlung", "überweisung", "ueberweisung", "sepa", "lastschrift", "abbuchung", "dauerauftrag"]);
  const nameTok = s => foldN(s).split(/[^a-z0-9äöüß]+/).filter(w => w.length >= 4 && !NAME_STOP.has(w) && !/^\d+$/.test(w));
  const sameName = (x, y) => { const a = nameTok(x), b = nameTok(y); return a.length > 0 && b.length > 0 && a.some(w => b.indexOf(w) > -1); };
  const docNums = s => (String(s || "").match(/\d{5,}/g) || []);
  const dDiff = (x, y) => Math.round((Date.parse(dayOf(x) + "T12:00:00Z") - Date.parse(dayOf(y) + "T12:00:00Z")) / 864e5);
  function refundCandidates() {
    const out = [], txs = all("CheckAccountTransaction"), RANK = { correction: 0, open: 1, voucher: 2 };
    // Rückzahlung kommt auf dasselbe Konto zurück; Umbuchungen zwischen eigenen Konten (PayPal, Übertrag …) sind Geldtransit, keine Rückzahlung
    const TRANSIT = /übertrag|uebertrag|umbuchung|paypal|auszahlung auf (ihr )?bankkonto|abbuchung auf bankkonto|withdrawal|transfer to bank|bargeld|kassa|kasse/i;
    const accOf = x => String((x.checkAccount || {}).id || "");
    for (const b of txs.filter(b => String(b.status) === "100" && +b.amount > 0 && !b.transitWith && !b.cashLocked && !b.mollieType && !TRANSIT.test((b.paymtPurpose || "") + " " + (b.payeePayerName || "")))) {
      const A = r2(+b.amount), nb = docNums(b.paymtPurpose), word = REFUND_RX.test((b.paymtPurpose || "") + " " + (b.payeePayerName || ""));
      const cands = txs.filter(a => Math.abs(r2(+a.amount + A)) <= 0.005 && a !== b && accOf(a) === accOf(b) && !a.mollieType && !a.cashLocked && !TRANSIT.test((a.paymtPurpose || "") + " " + (a.payeePayerName || "")) && (d => d >= 0 && d <= 120)(dDiff(b.valueDate, a.valueDate)))   // Betrag zuerst: läuft alle 4 Min. über alle Umsätze
        .filter(a => sameName(a.payeePayerName, b.payeePayerName) || (word && nb.length > 0 && docNums((a.paymtPurpose || "") + " " + (a.payeePayerName || "")).some(n => nb.indexOf(n) > -1)))
        .map(a => ({ a, m: refundMode(a) })).filter(x => x.m);
      if (!cands.length) continue;
      cands.sort((x, y) => RANK[x.m.mode] - RANK[y.m.mode] || String(dayOf(y.a.valueDate)).localeCompare(String(dayOf(x.a.valueDate))));
      out.push({ a: cands[0].a, b, mode: cands[0].m.mode });
    }
    const credits = all("CustomerCredit").filter(c => +c.open > 0.004);
    if (credits.length) for (const t of txs.filter(t => String(t.status) === "100" && +t.amount < 0 && !t.transitWith && !t.cashLocked)) {
      const A = r2(-(+t.amount)), pu = foldN(t.paymtPurpose).replace(/[^a-z0-9]/g, "");
      const hits = credits.filter(c => Math.abs(r2(+c.open) - A) <= 0.005 && (d => d >= 0 && d <= 365)(dDiff(t.valueDate, c.date)) && (sameName(c.contactName, t.payeePayerName) || (!!c.invoiceNumber && pu.indexOf(foldN(c.invoiceNumber).replace(/[^a-z0-9]/g, "")) > -1)));
      if (hits.length === 1) out.push({ credit: hits[0], t });
    }
    return out;
  }
  function refundValid(aId, bId) { const a = get("CheckAccountTransaction", aId), b = get("CheckAccountTransaction", bId); return !!(a && b && String(b.status) === "100" && !b.transitWith && Math.abs(r2(+a.amount + +b.amount)) <= 0.005 && refundMode(a)); }
  async function refundScan() {
    if (!PROP) return 0; await load();
    const busy = await PROP.busyTx(), eu = n => s2(n).replace(".", ",") + " €", de = d => String(dayOf(d) || "").split("-").reverse().join(".");
    let n = 0;
    for (const x of refundCandidates()) {
      try {
        if (x.credit) {
          if (busy.has(String(x.t.id))) continue;
          if (await PROP.add({ kind: "credit-refund", key: "crefund:" + x.credit.id + ":" + x.t.id, txId: String(x.t.id), invoiceId: x.credit.invoice ? String(x.credit.invoice.id) : null, amount: r2(+x.t.amount), date: dayOf(x.t.valueDate),
            title: "Guthaben zurückgezahlt: " + (x.credit.contactName || "Kunde") + (x.credit.invoiceNumber ? " (Rechnung " + x.credit.invoiceNumber + ")" : ""),
            detail: "Rücküberweisung " + de(x.t.valueDate) + " " + eu(-(+x.t.amount)) + " ↔ Guthaben vom " + de(x.credit.date) + " – keine Ausgabe, keine Steuer", source: "Abgleich", payload: { creditId: String(x.credit.id), txId: String(x.t.id) } })) n++;
          continue;
        }
        if (busy.has(String(x.b.id)) || busy.has(String(x.a.id))) continue;
        const A = r2(+x.b.amount), who = x.b.payeePayerName || x.a.payeePayerName || "Rückzahlung";
        if (await PROP.add({ kind: "refund-pair", key: "refund:" + x.a.id + ":" + x.b.id, txIds: [String(x.b.id)], txId: String(x.b.id), amount: A, date: dayOf(x.b.valueDate),
          title: "Doppelzahlung zurückbekommen: " + who + " " + eu(A) + " verbuchen",
          detail: "Ausgabe " + de(x.a.valueDate) + " „" + String(x.a.paymtPurpose || x.a.payeePayerName || "").slice(0, 60) + "“ ↔ Rückzahlung " + de(x.b.valueDate) + " „" + String(x.b.paymtPurpose || "").slice(0, 60) + "“" +
            (x.mode === "correction" ? " · der Korrektur-Umsatz („doppelt erfasst“) wird entfernt, Saldo stimmt wieder" : x.mode === "voucher" ? " · Gegenbuchung am überbezahlten Beleg" : " · als Paar verbuchen") + " – kein Aufwand, keine Vorsteuer",
          source: "Abgleich", payload: { aId: String(x.a.id), bId: String(x.b.id), mode: x.mode } })) n++;
      } catch (e) { console.error("Doppelzahlung erkennen:", e.message); }
    }
    return n;
  }
  async function pairApply(aId, bId) {
    await load(); const a = get("CheckAccountTransaction", aId), b = get("CheckAccountTransaction", bId);
    if (!a || !b || String(a.status) !== "100" || String(b.status) !== "100" || a.transitWith || b.transitWith) throw err(400, "Einer der Umsätze ist nicht mehr offen");
    a.status = "400"; a.transitWith = String(b.id); b.status = "400"; b.transitWith = String(a.id); await save("CheckAccountTransaction", a); await save("CheckAccountTransaction", b);
    return true;
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
      if (!dry) { await save("CheckAccountTransaction", { id: newId("CheckAccountTransaction"), valueDate: iso(t.date), entryDate: iso(t.bookDate || t.date), amount: s2(t.amount), payeePayerName: t.name || "", payeePayerAcctNo: t.iban || "", paymtPurpose: t.purpose || "", checkAccount: ref("CheckAccount", accId), status: "100", importHash: h, importRef: t.ref || "" , feeAmt: t.fee ? String(Math.round(t.fee * 100) / 100) : undefined, grossAmt: t.gross ? String(t.gross) : undefined, feeBy: t.feeBy || undefined}); }
      added++;
    }
    const paired = dry ? 0 : await pairTransfers();
    if (!dry) await refundScan().catch(e => console.error("Doppelzahlung erkennen:", e.message));
    return { total: items.length, added, dup, paired, sample: fresh.slice(0, 5) };
  }
  return { request, load, get, all, positionsOf, save, del, attachDoc, isLocked, addIso, importBank, recurringRun, recurringVoucherRun, cashBalance, isCash, setProposer, pairApply, pairTransfers,
    reclassOver: serial(reclassOver), unbook: serial(unbook), creditRefund: serial(creditRefund), creditRefundUndo: serial(creditRefundUndo), refundPairApply: serial(refundPairApply), refundUndo: serial(refundUndo), refundValid, refundScan, refundCandidates, tipTax };
  // Zahlungszuordnungs-Operationen nacheinander (Doppelklick, zweites Gerät, „Rückgängig“ und „Lösen“ gleichzeitig): sonst rechnen zwei Läufe mit
  // demselben Ausgangsstand – z. B. paidAmount −100 nach zweimal „Lösen“ oder Überzahlung doppelt abgebaut (Review 28.10.2026)
  function serial(fn) { return function () { const a = arguments, r = SERIALQ.then(() => fn.apply(null, a)); SERIALQ = r.catch(() => {}); return r; }; }
};
