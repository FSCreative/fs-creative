"use strict";
// sevDesk im Cockpit: Rechnung abschließen (senden, versendet markieren, Mahnung, Storno, Entwurf bearbeiten),
// Bankumsätze zuordnen, Belege verwalten, Kontakte und Artikel. Schreibende Aktionen nur mit confirm:true (Klick im Cockpit).
// Wird von server.js mit den sevDesk-Helfern bestückt: require("./sevdesk-ops.js")(deps).
module.exports = function (D) {
  const { sev, sevAll, sevNum, sevDay, sevName, sevDateDE, sevNet, viennaToday, sevMeta, snapshot, invalidate, sevBook } = D;
  const r2 = n => Math.round((+n || 0) * 100) / 100;
  const idOf = v => String(v == null ? "" : v).replace(/\D/g, "");
  const iso = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "";
  const unix = day => Math.floor(Date.parse(day + "T12:00:00Z") / 1000);
  const need = pl => { if (!pl || pl.confirm !== true) throw new Error("Bestätigung fehlt"); };
  const first = j => { const o = j && j.objects; return Array.isArray(o) ? (o[0] || {}) : (o || {}); };
  const plainHtml = t => String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, "<br>");
  const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\b(gmbh|og|kg|e\.?u\.?|ag|co|und|&)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  function nameScore(a, b) {   // 0..1: gemeinsame Wörter (≥3 Zeichen)
    const A = norm(a).split(" ").filter(w => w.length >= 3), B = new Set(norm(b).split(" ").filter(w => w.length >= 3));
    if (!A.length || !B.size) return 0;
    return A.filter(w => B.has(w)).length / Math.min(A.length, B.size);
  }
  async function emailsOf(contactId) {
    if (!contactId) return [];
    const j = await sev("GET", "/CommunicationWay", { query: { "contact[id]": contactId, "contact[objectName]": "Contact", type: "EMAIL" } }).catch(() => null);
    return ((j && j.objects) || []).map(c => ({ id: String(c.id), value: String(c.value || "").trim(), main: String(c.main) === "1" || c.main === true })).filter(c => /@/.test(c.value))
      .sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0));
  }

  // ───────────── Rechnungen ─────────────
  const INV_STATUS = { 50: "Entwurf (gesperrt)", 100: "Entwurf", 200: "offen", 750: "teilbezahlt", 1000: "bezahlt" };
  async function invoiceDetail(id) {
    id = idOf(id); if (!id) throw new Error("keine_rechnung");
    const [ij, pj] = await Promise.all([
      sev("GET", "/Invoice/" + id, { query: { embed: "contact" } }),
      sev("GET", "/Invoice/" + id + "/getPositions", { query: { limit: 200 } }).catch(() => ({ objects: [] })),
    ]);
    const o = first(ij); if (!o.id) throw new Error("Rechnung nicht gefunden");
    const c = o.contact || {}; const contactId = c.id ? String(c.id) : "";
    const emails = await emailsOf(contactId);
    const positions = ((pj && pj.objects) || []).slice().sort((a, b) => (parseInt(a.positionNumber, 10) || 0) - (parseInt(b.positionNumber, 10) || 0)).map(x => {
      const q = x.quantity != null ? sevNum(x.quantity) : 1, rate = sevNum(x.taxRate), net = sevNum(x.priceNet != null ? x.priceNet : x.price);
      const gross = x.priceGross != null && sevNum(x.priceGross) ? sevNum(x.priceGross) : r2(net * (1 + rate / 100)), disc = Math.max(0, Math.min(100, sevNum(x.discount) || 0));
      return { id: String(x.id), name: String(x.name || ""), text: String(x.text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), qty: q, priceNet: r2(net), priceGross: r2(gross), taxRate: rate, discount: disc, sumGross: r2(gross * q * (1 - disc / 100)) };
    });
    const status = parseInt(o.status, 10) || 0, date = sevDay(o.invoiceDate);
    let due = null; if (date) { const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + (parseInt(o.timeToPay, 10) || 0)); due = d.toISOString().slice(0, 10); }
    const gross = sevNum(o.sumGross), paid = sevNum(o.paidAmount);
    return { id, nr: o.invoiceNumber || "", type: o.invoiceType || "RE", status, statusLabel: INV_STATUS[status] || String(status),
      date, delivery: sevDay(o.deliveryDate), deliveryUntil: sevDay(o.deliveryDateUntil), reference: o.reference || "", due, timeToPay: parseInt(o.timeToPay, 10) || 0,
      header: o.header || "", headText: String(o.headText || ""), footText: String(o.footText || ""), address: String(o.address || ""),
      contact: { id: contactId, name: sevName(c) }, emails, positions,
      net: sevNum(o.sumNet), tax: sevNum(o.sumTax), gross, paid, open: (status === 200 || status === 750) ? Math.max(0, r2(gross - paid)) : 0,
      sent: !!o.sendDate, sendDate: sevDay(o.sendDate), sendType: o.sendType || "", enshrined: !!o.enshrined, payDate: sevDay(o.payDate),
      origin: o.origin && o.origin.id ? { id: String(o.origin.id), type: o.origin.objectName || "" } : null,
      taxRule: o.taxRule && o.taxRule.id ? String(o.taxRule.id) : "", taxType: o.taxType || "", taxSet: o.taxSet && o.taxSet.id ? String(o.taxSet.id) : "",
      dunningLevel: parseInt(o.dunningLevel, 10) || 0, reminderDeadline: sevDay(o.reminderDeadline), dunningFeeOpen: sevNum(o.dunningFeeOpen), dunningFeePaid: sevNum(o.dunningFeePaid) };
  }
  // Standardtext für Rechnungs-/Mahnungsmail
  // Signatur aus dem Postfach (server.js mailSignature): unter jede Rechnungs-/Mahnungsmail. Gruß und Name am Textende entfallen,
  // wenn die Signatur selbst grüßt bzw. den Namen trägt – sonst stünde beides doppelt da.
  const mailSig = () => { try { return D.mailSignature ? String(D.mailSignature() || "") : ""; } catch (e) { return ""; } };
  const sigText = h => String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").trim();
  const GREET = /^(mit )?(freundlichen|freundliche|liebe|beste|viele|herzliche|schöne|sonnige)\s+grüße?n?\b|^(lg|mfg|vg|grüße)\b/i;
  function trimForSig(text, sig) {
    const lines = String(text || "").replace(/\s+$/, "").split(/\r?\n/), st = sigText(sig).toLowerCase(), greets = GREET.test(sigText(sig).split("\n")[0].trim());
    let i = lines.length; while (i > 0) { const x = lines[i - 1].trim().toLowerCase().replace(/[,.!]+$/, ""); if (!x || (x.length < 60 && st.indexOf(x) > -1)) i--; else break; }
    if (i > 0 && greets && GREET.test(lines[i - 1].trim())) i--;
    return lines.length - i <= 6 ? lines.slice(0, i).join("\n").replace(/\s+$/, "") : lines.join("\n");
  }
  function mailDefaults(inv, kind, ref) { const sig = mailSig(), md = mailDefaults0(inv, kind, ref); if (sig) md.text = trimForSig(md.text, sig); md.signature = sig; return md; }
  function mailDefaults0(inv, kind, ref) {
    const nr = (kind === "reminder" && ref ? String(ref).slice(0, 40) : inv.nr) || "", name = inv.contact && inv.contact.name || "";
    const sum = (inv.gross || 0).toFixed(2).replace(".", ",") + " €";
    if (kind === "reminder") return { subject: "Zahlungserinnerung zu Rechnung " + nr, text: "Guten Tag " + name + ",\n\nleider ist die Rechnung " + nr + " über " + sum + " noch offen. Die Zahlungserinnerung finden Sie im Anhang.\n\nFalls Sie bereits bezahlt haben, betrachten Sie diese Nachricht bitte als gegenstandslos.\n\nFreundliche Grüße\nSimon Felder\nFS Creative" };
    return { subject: (inv.type === "MA" ? "Zahlungserinnerung " : "Rechnung ") + nr + " · FS Creative", text: "Guten Tag " + name + ",\n\nanbei erhalten Sie die Rechnung " + nr + " über " + sum + ".\n\nVielen Dank für Ihren Auftrag!\n\nFreundliche Grüße\nSimon Felder\nFS Creative" };
  }
  async function invoiceOp(pl) {
    need(pl);
    const id = idOf(pl.id); if (!id) throw new Error("keine_rechnung");
    const op = String(pl.op || "");
    let out = { id, op };
    if (op === "send") {
      const to = String(pl.toEmail || "").split(/[,;\s]+/).filter(x => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x));
      if (!to.length) throw new Error("Bitte eine gültige E-Mail-Adresse angeben.");
      const subject = String(pl.subject || "").trim().slice(0, 250); if (!subject) throw new Error("Betreff fehlt");
      const text = String(pl.text || "").trim(); if (!text) throw new Error("Text fehlt");
      const sig = pl.signature === false ? "" : mailSig();
      const body = { toEmail: to[0], subject, text: sig ? plainHtml(trimForSig(text, sig)) + "<br><br>" + sig : plainHtml(text), copy: !!pl.copy };
      if (to.length > 1) body.ccEmail = to.slice(1).join(",");
      await sev("POST", "/Invoice/" + id + "/sendViaEmail", { body, timeout: 60000 });
      out.sentTo = to.join(", ");
    } else if (op === "sent") {
      const t = ["VPR", "VP", "VM", "VPDF"].indexOf(String(pl.sendType)) > -1 ? String(pl.sendType) : "VPDF";
      await sev("PUT", "/Invoice/" + id + "/sendBy", { body: { sendType: t, sendDraft: false } });
    } else if (op === "cancel") {
      const j = await sev("POST", "/Invoice/" + id + "/cancelInvoice", { timeout: 40000 });
      const s = first(j); out.storno = { id: String(s.id || ""), nr: s.invoiceNumber || "" };
    } else if (op === "reminder") {
      const j = await sev("POST", "/Invoice/Factory/createInvoiceReminder", { query: { "invoice[id]": id, "invoice[objectName]": "Invoice" }, body: { invoice: { id: Number(id), objectName: "Invoice" }, dunningFee: Math.max(0, Math.round((parseFloat(String(pl.fee || 0).replace(",", ".")) || 0) * 100) / 100), timeToPay: parseInt(pl.days, 10) || 7 }, timeout: 40000 });
      const m = first(j); out.reminder = { id: String(m.id || ""), nr: m.invoiceNumber || "" };
      if (!out.reminder.id) throw new Error("sevDesk hat keine Mahnung erstellt");
    } else if (op === "draft") {
      await sev("PUT", "/Invoice/" + id + "/resetToDraft");
    } else if (op === "reopen") {
      await sev("PUT", "/Invoice/" + id + "/resetToOpen");
    } else throw new Error("unbekannte Aktion");
    invalidate();
    return out;
  }
  // Entwurf bearbeiten: gleiche Felder wie „Neue Rechnung“, alte Positionen werden ersetzt
  async function invoiceUpdateBody(pl, body) {
    const id = idOf(pl.id); if (!id) return body;
    const cur = await invoiceDetail(id);
    if (cur.status !== 100) throw new Error("Nur Entwürfe können bearbeitet werden. Setze die Rechnung zuerst auf Entwurf zurück.");
    body.invoice.id = Number(id);
    if (cur.nr) body.invoice.invoiceNumber = cur.nr;
    body.invoicePosDelete = cur.positions.map(p => ({ id: Number(p.id), objectName: "InvoicePos" }));
    // Art (Teil-, Abschlags-, Schlussrechnung) und Titel bleiben – sonst würde aus der Schlussrechnung eine normale Rechnung
    if (cur.type && cur.type !== "RE") body.invoice.invoiceType = cur.type;
    if (!String(pl.header || "").trim() && cur.header) body.invoice.header = cur.header;
    // Schlussrechnung: bezahlte Teil-/Abschlagsrechnungen zum selben Angebot als „abzüglich …“-Positionen (bei aus sevDesk übernommenen
    // Schlussrechnungen steckte der Abzug nur in der Summe – beim Neuberechnen aus den Positionen ginge er sonst verloren)
    if (cur.type === "ER" && cur.origin && cur.origin.id) {
      const snap = await snapshot(false).catch(() => null), pos = body.invoicePosSave;
      const parts = ((snap && snap.invoices) || []).filter(i => i.origin === cur.origin.id && (i.type === "AR" || i.type === "TR") && !i.cancelled && i.status >= 200 && String(i.id) !== String(id));
      for (const a of parts) {
        if (pos.some(p => /^abzüglich/i.test(String(p.name || "")) && a.nr && String(p.name).indexOf(a.nr) > -1)) continue;
        const d = await invoiceDetail(a.id), label = "abzüglich " + (a.type === "TR" ? "Teilrechnung " : "Abschlagsrechnung ") + (a.nr || "") + " vom " + String(a.date || "").split("-").reverse().join(".");
        d.positions.forEach(p => pos.push({ objectName: "InvoicePos", mapAll: true, positionNumber: pos.length, quantity: 1, price: -r2(p.priceNet * p.qty * (1 - (p.discount || 0) / 100)), name: label, text: "", unity: { id: 1, objectName: "Unity" }, taxRate: p.taxRate }));
      }
    }
    return body;
  }

  // ───────────── Bank: offene Umsätze + Vorschläge ─────────────
  async function bankOpen(force) {
    const snap = await snapshot(!!force);
    const today = viennaToday(), since = unix(addDays(today, -400));
    const [txs, vou] = await Promise.all([
      sevAll("/CheckAccountTransaction", { isBooked: "false", startDate: since }, 3000).catch(() => []),
      sevAll("/Voucher", { status: 100, startDate: unix(addDays(today, -540)) }, 3000).catch(() => []),
    ]);
    const accName = {}; ((snap && snap.accounts) || []).forEach(a => { accName[a.id] = a.name; });
    const invOpen = ((snap && snap.invoices) || []).filter(i => (i.status === 200 || i.status === 750) && i.open > 0.005);
    const vouOpen = vou.map(v => ({ id: String(v.id), date: sevDay(v.voucherDate), cd: v.creditDebit, gross: sevNum(v.sumGross), paid: sevNum(v.paidAmount), supplier: v.supplierName || (v.supplier && sevName(v.supplier)) || "", desc: v.description || "" }))
      .map(v => Object.assign(v, { open: r2(v.gross - v.paid) })).filter(v => v.open > 0.005 && v.type !== "RV");
    const list = txs.filter(t => (parseInt(t.status, 10) || 0) === 100).map(t => {
      const amount = sevNum(t.amount), name = t.payeePayerName || "", purpose = String(t.paymtPurpose || t.entryText || "").replace(/\s+/g, " ").trim();
      const hay = (name + " " + purpose).toLowerCase(), hayNum = hay.replace(/[^a-z0-9]/g, "");
      const sug = [];
      if (amount > 0) invOpen.forEach(i => {
        let s = 0; const nr = String(i.nr || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (nr && hayNum.indexOf(nr) > -1) s += 3;
        if (Math.abs(i.open - amount) < 0.011) s += 3; else if (Math.abs(i.gross - amount) < 0.011) s += 2; else if (amount < i.open) s += 0.3;
        s += 2 * nameScore(i.contact, name + " " + purpose);
        if (s >= 2) sug.push({ kind: "invoice", id: i.id, label: (i.nr || "Entwurf") + " · " + i.contact, sub: "offen " + i.open.toFixed(2).replace(".", ",") + " €", open: i.open, score: r2(s) });
      });
      else vouOpen.filter(v => v.cd === "C").forEach(v => {
        let s = 0;
        if (Math.abs(v.open + amount) < 0.011) s += 3; else if (Math.abs(v.gross + amount) < 0.011) s += 2;
        s += 2 * nameScore(v.supplier, name + " " + purpose);
        if (s >= 2) sug.push({ kind: "voucher", id: v.id, label: (v.supplier || "Beleg") + (v.desc ? " · " + v.desc : ""), sub: "offen " + v.open.toFixed(2).replace(".", ",") + " € · " + (v.date ? sevDateDE(v.date) : ""), open: v.open, score: r2(s) });
      });
      if (amount > 0) vouOpen.filter(v => v.cd === "D").forEach(v => {
        let s = 0; if (Math.abs(v.open - amount) < 0.011) s += 3; s += 2 * nameScore(v.supplier, name + " " + purpose);
        if (s >= 2) sug.push({ kind: "voucher", id: v.id, label: (v.supplier || "Einnahme-Beleg") + (v.desc ? " · " + v.desc : ""), sub: "offen " + v.open.toFixed(2).replace(".", ",") + " €", open: v.open, score: r2(s) });
      });
      sug.sort((a, b) => b.score - a.score);
      const acc = t.checkAccount && t.checkAccount.id ? String(t.checkAccount.id) : "";
      return { id: String(t.id), date: sevDay(t.valueDate || t.entryDate), amount, name, purpose: purpose.slice(0, 240), accountId: acc, account: accName[acc] || "", suggestions: sug.slice(0, 4) };
    }).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return { ok: true, fetchedAt: new Date().toISOString(), transactions: list,
      openInvoices: invOpen.map(i => ({ id: i.id, nr: i.nr, contact: i.contact, open: i.open, date: i.date })),
      openVouchers: vouOpen.map(v => ({ id: v.id, cd: v.cd, supplier: v.supplier, desc: v.desc, open: v.open, date: v.date })) };
  }
  function addDays(isoD, n) { const d = new Date(String(isoD).slice(0, 10) + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  async function txById(id) { const j = await sev("GET", "/CheckAccountTransaction/" + id); const t = first(j); if (!t.id) throw new Error("Umsatz nicht gefunden"); return t; }
  async function bankOp(pl) {
    need(pl);
    const txId = idOf(pl.txId); if (!txId) throw new Error("kein_umsatz");
    const t = await txById(txId);
    // Privat zurücknehmen: nur ein als privat markierter Umsatz (Status 300) wird wieder offen
    if (pl.op === "unprivat") { if ((parseInt(t.status, 10) || 0) !== 300) throw new Error("Dieser Umsatz ist nicht als privat markiert."); await sev("PUT", "/CheckAccountTransaction/" + txId, { body: { status: "100", privat: null } }); invalidate(); TX_CACHE.at = 0; return { ok: true, txId, op: "unprivat" }; }
    if ((parseInt(t.status, 10) || 0) !== 100) throw new Error("Dieser Umsatz ist schon zugeordnet.");
    const amount = sevNum(t.amount), day = sevDay(t.valueDate || t.entryDate) || viennaToday(), accountId = t.checkAccount && t.checkAccount.id ? String(t.checkAccount.id) : "";
    const op = String(pl.op || "");
    const bookBody = (amt) => ({ amount: r2(Math.abs(amt)), date: unix(day), type: "N", checkAccount: { id: Number(accountId), objectName: "CheckAccount" }, checkAccountTransaction: { id: Number(txId), objectName: "CheckAccountTransaction" }, createFeed: true });
    if (op === "invoice") {
      const id = idOf(pl.invoiceId); if (!id) throw new Error("keine_rechnung");
      if (!(amount > 0)) throw new Error("Rechnungen passen nur zu Zahlungseingängen.");
      await sevBook({ id, amount: Math.abs(amount), date: day, transactionId: txId, accountId });
    } else if (op === "voucher") {
      const id = idOf(pl.voucherId); if (!id) throw new Error("kein_beleg");
      await sev("PUT", "/Voucher/" + id + "/bookAmount", { body: bookBody(amount) });
    } else if (op === "vouchers") {
      // Sammelabbuchung (z. B. Print.com zieht mehrere Wochenrechnungen auf einmal ein): Umsatz auf mehrere Belege aufteilen – Summe der offenen Beträge muss passen
      const ids = [...new Set((Array.isArray(pl.voucherIds) ? pl.voucherIds : []).map(idOf).filter(Boolean))].slice(0, 30); if (ids.length < 2) throw new Error("Mindestens zwei Belege angeben.");
      const parts = []; for (const vid of ids) { const v = first(await sev("GET", "/Voucher/" + vid)); if (!v.id) throw new Error("Beleg " + vid + " nicht gefunden"); parts.push([vid, r2(Math.abs(sevNum(v.sumGross)) - sevNum(v.paidAmount))]); }
      const sum = r2(parts.reduce((a, x) => a + x[1], 0)); if (Math.abs(sum - Math.abs(amount)) > 0.02) throw new Error("Offene Summe der Belege (" + sum.toFixed(2) + " €) passt nicht zum Umsatz (" + Math.abs(amount).toFixed(2) + " €).");
      for (const [vid, open] of parts) if (open > 0.004) await sev("PUT", "/Voucher/" + vid + "/bookAmount", { body: bookBody(open) });
    } else if (op === "settled") {
      // schon anderweitig verbucht (z. B. Mollie-Zahlung, deren Auszahlung in sevDesk direkt der Rechnung zugeordnet wurde): nur als erledigt markieren, keine Buchung
      await sev("PUT", "/CheckAccountTransaction/" + txId, { body: { status: "400", transitWith: "erledigt", settledNote: String(pl.note || "bereits anderweitig verbucht").slice(0, 200) } });
    } else if (op === "privat") {
      // Privatentnahme (Abgang) / Privateinlage (Eingang): kein Betriebsumsatz, keine Steuer – Umsatz gilt als erledigt
      await sev("PUT", "/CheckAccountTransaction/" + txId, { body: { status: "300", privat: amount < 0 ? "Entnahme" : "Einlage", privatNote: String(pl.note || "").slice(0, 200) || undefined } });
    } else if (op === "newVoucher") {
      // Beleg ohne Datei direkt aus dem Umsatz (z. B. Kontoführung, Abo), dann mit dem Umsatz verbuchen
      const at = idOf(pl.accountingTypeId); if (!at) throw new Error("Bitte eine Kategorie wählen.");
      const rate = isFinite(parseFloat(pl.taxRate)) ? parseFloat(pl.taxRate) : 0;
      const g = r2(Math.abs(amount));
      const body = {
        voucher: { objectName: "Voucher", mapAll: true, voucherDate: sevDateDE(day), supplierName: String(pl.supplierName || t.payeePayerName || "").slice(0, 200), description: String(pl.description || t.paymtPurpose || "").slice(0, 250),
          status: 100, taxType: "default", creditDebit: amount < 0 ? "C" : "D", voucherType: "VOU", currency: "EUR" },
        voucherPosSave: [{ objectName: "VoucherPos", mapAll: true, accountingType: { id: at, objectName: "AccountingType" }, taxRate: rate, net: false, sumGross: g, sumNet: sevNet(g, rate), comment: String(pl.description || "").slice(0, 250) }],
        voucherPosDelete: null,
      };
      // Steuerliche Regel (Ausgaben): 9 Vorsteuer, 10 keine Vorsteuer, 8 ig. Erwerb, 14/12 Reverse Charge EU/Drittland (Vorsteuer und Steuerschuld je 20 %, UVA KZ 066/057), 13 RC ohne Vorsteuer.
      // ig. Erwerb und Reverse Charge: Rechnung ohne österr. USt → Position mit 0 %, netto = brutto
      const rule = String(pl.taxRule || "");
      if (["8", "9", "10", "12", "13", "14"].indexOf(rule) > -1 && amount < 0) { body.voucher.taxRule = { id: rule, objectName: "TaxRule" }; delete body.voucher.taxType;
        if (["8", "12", "13", "14"].indexOf(rule) > -1) { body.voucherPosSave[0].taxRate = 0; body.voucherPosSave[0].sumNet = g; }
        if (["12", "13", "14"].indexOf(rule) > -1) body.voucher.reverseCharge = true; }
      const j = await sev("POST", "/Voucher/Factory/saveVoucher", { body, timeout: 40000 });
      const v = j && j.objects && (j.objects.voucher || j.objects) || {};
      if (!v.id) throw new Error("Beleg konnte nicht angelegt werden");
      await sev("PUT", "/Voucher/" + v.id + "/bookAmount", { body: bookBody(amount) });
    } else throw new Error("unbekannte Aktion");
    invalidate(); VOU_CACHE.at = 0; TX_CACHE.at = 0;
    return { ok: true, txId, op };
  }

  // ───────────── Belege ─────────────
  let VOU_CACHE = { at: 0, key: "", data: null };
  const VOU_STATUS = { 50: "Entwurf", 100: "offen", 750: "teilbezahlt", 1000: "bezahlt" };
  async function vouchers(year, force) {
    const y = /^\d{4}$/.test(String(year)) ? String(year) : viennaToday().slice(0, 4);
    if (!force && VOU_CACHE.data && VOU_CACHE.key === y && Date.now() - VOU_CACHE.at < 2 * 60 * 1000) return VOU_CACHE.data;
    const s = unix(y + "-01-01") - 13 * 3600, e = unix(y + "-12-31") + 12 * 3600;
    const [vs, ps, meta] = await Promise.all([
      sevAll("/Voucher", { startDate: s, endDate: e, embed: "document" }, 4000),
      sevAll("/VoucherPos", { embed: "accountingType" }, 12000).catch(() => []),
      sevMeta().catch(() => ({ accountingTypes: [] })),
    ]);
    const atName = {}; (meta.accountingTypes || []).forEach(a => { atName[a.id] = a.name; });
    const posBy = {};
    ps.forEach(p => { const vid = p.voucher && p.voucher.id; if (vid == null) return; (posBy[String(vid)] = posBy[String(vid)] || []).push(p); });
    const list = vs.filter(v => String(sevDay(v.voucherDate) || "").slice(0, 4) === y).map(v => {
      const id = String(v.id), status = parseInt(v.status, 10) || 0, gross = sevNum(v.sumGross), paid = sevNum(v.paidAmount);
      const pos = (posBy[id] || []).map(p => { const a = p.accountingType || {}; const aid = a.id ? String(a.id) : ""; return { id: String(p.id), accountingTypeId: aid, category: a.name || atName[aid] || "", taxRate: sevNum(p.taxRate), gross: sevNum(p.sumGross), net: sevNum(p.sumNet), comment: String(p.comment || "") }; });
      return { id, date: sevDay(v.voucherDate), status, statusLabel: String(v.voucherType || "") === "RV" ? "Vorlage (wiederkehrend)" : (VOU_STATUS[status] || String(status)), cd: v.creditDebit || "C", type: v.voucherType || "VOU",
        supplier: v.supplierName || (v.supplier && sevName(v.supplier)) || "", desc: v.description || "", gross, net: sevNum(v.sumNet), tax: sevNum(v.sumTax), paid,
        open: (status === 100 || status === 750) && String(v.voucherType || "VOU") !== "RV" ? Math.max(0, r2(gross - paid)) : 0, payDate: sevDay(v.payDate), hasDoc: !!(v.document && v.document.id), docId: v.document && v.document.id ? String(v.document.id) : "", docSource: v.docSource ? { auto: !!v.docSource.auto, upload: !!v.docSource.upload, from: v.docSource.from || "", subject: v.docSource.subject || "", at: v.docSource.at || "" } : null,
        enshrined: !!v.enshrined, taxRule: v.taxRule && v.taxRule.id ? String(v.taxRule.id) : "", taxType: v.taxType || "", positions: pos,
        category: pos.map(p => p.category).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", ") };
    }).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (parseInt(b.id, 10) - parseInt(a.id, 10)));
    const data = { ok: true, year: y, fetchedAt: new Date().toISOString(), vouchers: list };
    VOU_CACHE = { at: Date.now(), key: y, data };
    return data;
  }
  // Belegdatei: sevDesk hat dafür keinen dokumentierten Endpunkt – bekannte Varianten der Reihe nach probieren
  async function voucherDoc(id) {
    id = idOf(id); if (!id) throw new Error("kein_beleg");
    const v = first(await sev("GET", "/Voucher/" + id, { query: { embed: "document" } }));
    const docId = v.document && v.document.id ? String(v.document.id) : "";
    if (!docId) { const e = new Error("Zu diesem Beleg ist keine Datei hinterlegt."); e.status = 404; throw e; }
    const tries = ["/Document/" + docId + "/download", "/Document/" + docId + "/getPdf", "/Voucher/" + id + "/getDocument"];
    let lastErr = null;
    for (const p of tries) {
      try {
        const rr = await sev("GET", p, { query: { download: "true" }, timeout: 40000, binary: true });
        if (rr.buf && rr.buf.length > 16) return { buf: rr.buf, type: rr.type || "application/octet-stream", name: (v.document && v.document.filename) || ("Beleg-" + id) };
        const o = rr.json && rr.json.objects;
        const cont = o && (o.content || (o[0] && o[0].content));
        if (cont) { const oo = o.content ? o : o[0]; return { buf: Buffer.from(String(cont), oo.base64encoded === false ? "binary" : "base64"), type: oo.mimeType || oo.mimetype || "application/pdf", name: oo.filename || ("Beleg-" + id) }; }
      } catch (e) { lastErr = e; }
    }
    const e = new Error("Die Belegdatei konnte nicht aus sevDesk geladen werden" + (lastErr ? ": " + String(lastErr.message || lastErr).slice(0, 120) : "")); e.status = 502; throw e;
  }
  async function voucherOp(pl) {
    need(pl);
    const id = idOf(pl.id); if (!id) throw new Error("kein_beleg");
    const op = String(pl.op || "");
    if (op === "update") {
      const cur = first(await sev("GET", "/Voucher/" + id));
      if (!cur.id) throw new Error("Beleg nicht gefunden");
      if (cur.enshrined) throw new Error("Der Beleg ist festgeschrieben und kann nicht mehr geändert werden.");
      const status = parseInt(cur.status, 10) || 0;
      if (status >= 750) throw new Error("Bezahlte Belege kann sevDesk nicht ändern. Setze den Beleg zuerst auf offen zurück.");
      const posIn = (Array.isArray(pl.positions) ? pl.positions : []).filter(x => x && parseFloat(x.gross) > 0 && idOf(x.accountingTypeId)).slice(0, 20);
      if (!posIn.length) throw new Error("Mindestens eine Position mit Kategorie und Betrag angeben.");
      const posOld = ((await sev("GET", "/VoucherPos", { query: { "voucher[id]": id, "voucher[objectName]": "Voucher", limit: 100 } }).catch(() => ({ objects: [] }))).objects || []);
      const day = iso(pl.date) || sevDay(cur.voucherDate) || viennaToday();
      const body = {
        voucher: { id: Number(id), objectName: "Voucher", mapAll: true, voucherDate: sevDateDE(day), supplierName: String(pl.supplier != null ? pl.supplier : (cur.supplierName || "")).slice(0, 200),
          description: String(pl.desc != null ? pl.desc : (cur.description || "")).slice(0, 250), status, creditDebit: cur.creditDebit || "C", voucherType: cur.voucherType || "VOU", currency: cur.currency || "EUR" },
        voucherPosSave: posIn.map(x => { const r = isFinite(parseFloat(x.taxRate)) ? parseFloat(x.taxRate) : 20, g = r2(parseFloat(x.gross)); return { objectName: "VoucherPos", mapAll: true, accountingType: { id: idOf(x.accountingTypeId), objectName: "AccountingType" }, taxRate: r, net: false, sumGross: g, sumNet: sevNet(g, r), comment: String(x.comment || "").slice(0, 250) }; }),
        voucherPosDelete: posOld.map(p => ({ id: Number(p.id), objectName: "VoucherPos" })),
      };
      // Steuerregelung des Belegs beibehalten (Update 1.0: taxType/taxSet, Update 2.0: taxRule)
      if (cur.taxRule && cur.taxRule.id) body.voucher.taxRule = { id: String(cur.taxRule.id), objectName: "TaxRule" };
      else { body.voucher.taxType = cur.taxType || "default"; if (cur.taxSet && cur.taxSet.id) body.voucher.taxSet = { id: String(cur.taxSet.id), objectName: "TaxSet" }; }
      if (iso(pl.deliveryDate)) body.voucher.deliveryDate = sevDateDE(pl.deliveryDate);
      await sev("POST", "/Voucher/Factory/saveVoucher", { body, timeout: 40000 });
    } else if (op === "open") {          // Entwurf → offen (fertig erfasst)
      await sev("PUT", "/Voucher/" + id, { body: { status: 100 } });
    } else if (op === "draft") {
      await sev("PUT", "/Voucher/" + id + "/resetToDraft");
    } else if (op === "reopen") {        // bezahlt → offen (Zahlung lösen)
      await sev("PUT", "/Voucher/" + id + "/resetToOpen");
    } else if (op === "delete") {        // nur Entwürfe ohne Zahlung (z. B. doppelt erfasster Beleg)
      await sev("DELETE", "/Voucher/" + id);
    } else if (op === "pay") {           // Zahlung ohne Bankumsatz (z. B. bar, Kreditkarte)
      const acc = idOf(pl.accountId); if (!acc) throw new Error("kein_konto");
      const amt = r2(parseFloat(pl.amount)); if (!(amt > 0)) throw new Error("kein_betrag");
      const day = iso(pl.date) || viennaToday();
      await sev("PUT", "/Voucher/" + id + "/bookAmount", { body: { amount: amt, date: unix(day), type: "N", checkAccount: { id: Number(acc), objectName: "CheckAccount" }, createFeed: true } });
    } else throw new Error("unbekannte Aktion");
    invalidate(); VOU_CACHE.at = 0;
    return { ok: true, id, op };
  }

  // ───────────── Kontakte ─────────────
  let CT_CACHE = { at: 0, data: null };
  const CAT = { 2: "Lieferant", 3: "Kunde", 4: "Partner", 28: "Interessent" };
  async function contacts(force) {
    if (!force && CT_CACHE.data && Date.now() - CT_CACHE.at < 3 * 60 * 1000) return CT_CACHE.data;
    const [cs, ad, cw] = await Promise.all([
      sevAll("/Contact", { depth: 1 }, 5000),
      sevAll("/ContactAddress", {}, 8000).catch(() => []),
      sevAll("/CommunicationWay", {}, 12000).catch(() => []),
    ]);
    const addrBy = {}, comBy = {};
    ad.forEach(a => { const c = a.contact && a.contact.id; if (c == null) return; (addrBy[String(c)] = addrBy[String(c)] || []).push(a); });
    cw.forEach(w => { const c = w.contact && w.contact.id; if (c == null) return; (comBy[String(c)] = comBy[String(c)] || []).push(w); });
    const snap = await snapshot(false).catch(() => null);
    const invBy = {}; ((snap && snap.invoices) || []).forEach(i => { if (!i.contactId) return; const t = invBy[i.contactId] || (invBy[i.contactId] = { count: 0, revenue: 0, open: 0, last: "" }); if (i.status >= 200 && i.type !== "SR") { t.count++; t.revenue += i.gross; } t.open += i.open || 0; if ((i.date || "") > t.last) t.last = i.date; });
    const list = cs.map(c => {
      const id = String(c.id), a = (addrBy[id] || [])[0] || null, ws = comBy[id] || [];
      const pick = type => { const x = ws.filter(w => w.type === type).sort((p, q) => (String(q.main) === "1" ? 1 : 0) - (String(p.main) === "1" ? 1 : 0))[0]; return x ? { id: String(x.id), value: String(x.value || "") } : null; };
      const cat = c.category && c.category.id ? String(c.category.id) : "";
      const st = invBy[id] || { count: 0, revenue: 0, open: 0, last: "" };
      return { id, name: sevName(c), person: !c.name, surename: c.surename || "", familyname: c.familyname || "", nr: c.customerNumber || "", cat, catLabel: CAT[cat] || "",
        email: pick("EMAIL"), phone: pick("PHONE") || pick("MOBILE"), web: pick("WEB"),
        address: a ? { id: String(a.id), street: a.street || "", zip: a.zip || "", city: a.city || "", country: a.country && a.country.id ? String(a.country.id) : "" } : null,
        vat: c.vatNumber || "", taxNumber: c.taxNumber || "", note: c.description || "", timeToPay: parseInt(c.defaultTimeToPay, 10) || 0,
        invoices: st.count, revenue: r2(st.revenue), open: r2(st.open), lastInvoice: st.last || "" };
    }).filter(c => c.name).sort((a, b) => a.name.localeCompare(b.name, "de"));
    CT_CACHE = { at: Date.now(), data: { ok: true, fetchedAt: new Date().toISOString(), contacts: list } };
    return CT_CACHE.data;
  }
  let ADDR_CAT = null;   // Adress-Kategorie „Rechnungsadresse“ (IDs je Konto aus /Category)
  async function addrCategory() {
    if (ADDR_CAT) return ADDR_CAT;
    const j = await sev("GET", "/Category", { query: { objectType: "ContactAddress" } }).catch(() => null);
    const cs = (j && j.objects) || [];
    const hit = cs.find(c => /rechnung/i.test(c.name || "")) || cs.find(c => /gesch|haupt|arbeit/i.test(c.name || "")) || cs[0];
    ADDR_CAT = hit ? Number(hit.id) : 47;
    return ADDR_CAT;
  }
  async function contactSave(pl) {
    need(pl);
    const id = idOf(pl.id);
    const name = String(pl.name || "").trim(); if (!name) throw new Error("Name fehlt");
    const cat = ["2", "3", "4", "28"].indexOf(String(pl.cat)) > -1 ? Number(pl.cat) : 3;
    const body = { category: { id: cat, objectName: "Category" }, description: String(pl.note || "").slice(0, 1000) };
    if (pl.person) { const parts = name.split(/\s+/); body.familyname = parts.length > 1 ? parts.pop() : name; body.surename = parts.length ? parts.join(" ") : ""; }   // Privatperson: Vor-/Nachname statt Firmenname
    else body.name = name.slice(0, 200);
    const vat = String(pl.vat || "").replace(/[\s.\-]/g, "").toUpperCase(); body.vatNumber = vat;
    if (pl.timeToPay !== undefined && pl.timeToPay !== "") body.defaultTimeToPay = Math.max(0, Math.min(365, parseInt(pl.timeToPay, 10) || 0));
    if (pl.nr) body.customerNumber = String(pl.nr).slice(0, 40);
    let cid = id;
    if (id) await sev("PUT", "/Contact/" + id, { body });
    else {
      body.status = 1000;
      if (!body.customerNumber && cat === 3) { const n = await sev("GET", "/Contact/Factory/getNextCustomerNumber").catch(() => null); if (n && n.objects) body.customerNumber = String(n.objects); }
      const j = await sev("POST", "/Contact", { body }); cid = String(first(j).id || ""); if (!cid) throw new Error("Kontakt konnte nicht angelegt werden");
    }
    // Adresse
    const A = pl.address || {}, hasAddr = ["street", "zip", "city"].some(k => String(A[k] || "").trim());
    const country = { id: Number(idOf(A.country)) || 3, objectName: "StaticCountry" };
    const abody = { contact: { id: Number(cid), objectName: "Contact" }, street: String(A.street || "").slice(0, 200), zip: String(A.zip || "").slice(0, 20), city: String(A.city || "").slice(0, 100), country };
    if (idOf(A.id)) await sev("PUT", "/ContactAddress/" + idOf(A.id), { body: abody });
    else if (hasAddr) { abody.category = { id: await addrCategory(), objectName: "Category" }; await sev("POST", "/ContactAddress", { body: abody }); }
    // E-Mail / Telefon
    const com = async (type, keyId, cur, val) => {
      val = String(val || "").trim();
      if (cur && cur.id) { if (val && val !== cur.value) await sev("PUT", "/CommunicationWay/" + idOf(cur.id), { body: { value: val } }); else if (!val) await sev("DELETE", "/CommunicationWay/" + idOf(cur.id)).catch(() => {}); }
      else if (val) await sev("POST", "/CommunicationWay", { body: { contact: { id: Number(cid), objectName: "Contact" }, type, value: val, key: { id: keyId, objectName: "CommunicationWayKey" }, main: true } });
    };
    if (pl.email !== undefined) { if (pl.email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(pl.email).trim())) throw new Error("E-Mail-Adresse ist ungültig"); await com("EMAIL", 2, pl.emailCur, pl.email); }
    if (pl.phone !== undefined) await com("PHONE", 2, pl.phoneCur, pl.phone);
    CT_CACHE.at = 0; invalidate(true);
    return { ok: true, id: cid };
  }

  // ───────────── Artikel ─────────────
  let PART_CACHE = { at: 0, data: null };
  async function parts(force) {
    if (!force && PART_CACHE.data && Date.now() - PART_CACHE.at < 5 * 60 * 1000) return PART_CACHE.data;
    const ps = await sevAll("/Part", {}, 3000);
    const list = ps.map(p => { const rate = sevNum(p.taxRate), net = sevNum(p.priceNet != null ? p.priceNet : p.price), gross = p.priceGross != null && sevNum(p.priceGross) ? sevNum(p.priceGross) : r2(net * (1 + rate / 100));
      return { id: String(p.id), nr: p.partNumber || "", name: p.name || "", text: String(p.text || ""), taxRate: rate, priceNet: r2(net), priceGross: r2(gross), active: String(p.status) !== "50", unity: p.unity && p.unity.id ? String(p.unity.id) : "1" }; })
      .filter(p => p.name).sort((a, b) => a.name.localeCompare(b.name, "de"));
    PART_CACHE = { at: Date.now(), data: { ok: true, parts: list } };
    return PART_CACHE.data;
  }
  async function partSave(pl) {
    need(pl);
    const id = idOf(pl.id);
    const name = String(pl.name || "").trim(); if (!name) throw new Error("Bezeichnung fehlt");
    const rate = isFinite(parseFloat(pl.taxRate)) ? parseFloat(pl.taxRate) : 20, gross = r2(parseFloat(pl.priceGross));
    if (!(gross >= 0)) throw new Error("Preis fehlt");
    const net = sevNet(gross, rate);
    const body = { name: name.slice(0, 250), text: String(pl.text || "").slice(0, 2000), taxRate: rate, price: net, priceNet: net, priceGross: gross, unity: { id: Number(idOf(pl.unity)) || 1, objectName: "Unity" }, stockEnabled: false, status: pl.active === false ? 50 : 100 };
    if (id) await sev("PUT", "/Part/" + id, { body });
    else {
      body.partNumber = String(pl.nr || "").trim().slice(0, 40) || ("A-" + String(Date.now()).slice(-6)); body.stock = 0;
      await sev("POST", "/Part", { body });
    }
    PART_CACHE.at = 0;
    return { ok: true };
  }

  // ── Alle Bankumsätze mit Verknüpfungen (für die Konten-Tabelle wie in sevDesk) ──
  let TX_CACHE = { at: 0, data: null };
  async function transactions(force) {
    if (!force && TX_CACHE.data && Date.now() - TX_CACHE.at < 2 * 60 * 1000) return TX_CACHE.data;
    const [txs, logs, snap] = await Promise.all([sevAll("/CheckAccountTransaction", {}, 50000), sevAll("/CheckAccountTransactionLog", {}, 50000).catch(() => []), snapshot(false).catch(() => null)]);
    const invNr = {}; ((snap && snap.invoices) || []).forEach(i => { invNr[i.id] = i.nr || "Entwurf"; });
    const links = {};
    logs.forEach(l => { const t = l.checkAccountTransaction && l.checkAccountTransaction.id, o = l.object || {}; if (!t || !o.id) return; (links[String(t)] = links[String(t)] || []).push({ type: o.objectName, id: String(o.id), nr: o.objectName === "Invoice" ? (invNr[o.id] || "Rechnung") : "Beleg", amount: sevNum(l.amountPaid) }); });
    const list = txs.map(t => ({ id: String(t.id), date: sevDay(t.valueDate || t.entryDate), book: sevDay(t.entryDate), amount: sevNum(t.amount), name: t.payeePayerName || (D.cardName && D.cardName(t.paymtPurpose)) || "", nameAuto: !t.payeePayerName && !!(D.cardName && D.cardName(t.paymtPurpose)), purpose: String(t.paymtPurpose || "").replace(/\s+/g, " ").trim().slice(0, 300), status: parseInt(t.status, 10) || 0,
      accountId: t.checkAccount && t.checkAccount.id ? String(t.checkAccount.id) : "", links: links[String(t.id)] || [], mollie: t.mollieType || "",
      // Status 400 hat drei Bedeutungen: echter Geldtransit (Gegenbuchung auf eigenem Konto), „erledigt“ (z. B. ausgeglichene Doppelbuchung, Kontoprüfung) und Fremdgeld (durchlaufend)
      transit: !!t.transitWith && ["erledigt", "durchlaufend"].indexOf(String(t.transitWith)) < 0, settled: String(t.transitWith || "") === "erledigt" ? String(t.settledNote || "erledigt") : "",
      passthrough: String(t.transitWith || "") === "durchlaufend" ? String(t.passthroughFor || "durchlaufend") : "" }))
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (+b.id - +a.id));
    TX_CACHE = { at: Date.now(), data: { ok: true, transactions: list, accounts: (snap && snap.accounts) || [] } };
    return TX_CACHE.data;
  }
  // Gutschriften (CreditNote)
  async function creditNotes() {
    const [cn, ct] = await Promise.all([sevAll("/CreditNote", { embed: "contact" }, 20000).catch(() => []), Promise.resolve(null)]);
    return { ok: true, creditNotes: cn.map(o => ({ id: String(o.id), nr: o.creditNoteNumber || "", date: sevDay(o.creditNoteDate), status: parseInt(o.status, 10) || 0, contact: sevName(o.contact), gross: sevNum(o.sumGross), net: sevNum(o.sumNet), header: o.header || "" })).sort((a, b) => String(b.date).localeCompare(String(a.date))) };
  }
  function resetCaches() { TX_CACHE = { at: 0, data: null }; VOU_CACHE = { at: 0, key: null, data: null }; }
  return { _sig: { trimForSig }, resetCaches, invoiceDetail, invoiceOp, invoiceUpdateBody, mailDefaults, bankOpen, bankOp, vouchers, voucherDoc, voucherOp, contacts, contactSave, addrCategory, parts, partSave, transactions, creditNotes };
};
