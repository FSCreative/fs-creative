"use strict";
// PDF für Rechnungen, Mahnungen, Stornos und Angebote im bisherigen Layout (wie die sevDesk-Vorlage von FS Creative):
// Logo rechts oben, Absenderzeile, Anschrift, Infoblock, blaue Überschrift, Positionstabelle mit blauem Kopf, Summen, Text, Fußzeile.
const path = require("path"), fs = require("fs");
module.exports = function (D) {
  const { firm } = D;                 // firm(): Firmendaten (Name, Adresse, UID, Bank …)
  const BLUE = "#2a7ab8", INK = "#1b2420", MUTED = "#6b7280", LINE = "#d6dbe1";
  const LOGO = [path.join(__dirname, "logos", "Logo Glühbirne.png"), path.join(__dirname, "logo_quadrat.png")].find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
  const eur = n => (Math.round((+n || 0) * 100) / 100).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";
  const de = v => { const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "." + m[2] + "." + m[1] : ""; };
  const strip = h => String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  return async function render(type, o, pos, ctx) {
    const PDFDocument = require("pdfkit");
    const F = firm() || {};
    const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 90, left: 56, right: 56 }, info: { Title: (o.invoiceNumber || o.orderNumber || "Dokument"), Author: F.name || "FS Creative" } });
    const chunks = []; doc.on("data", c => chunks.push(c));
    const done = new Promise(r => doc.on("end", () => r(Buffer.concat(chunks))));
    const W = doc.page.width, L = 56, R = W - 56;
    const isOrder = type === "Order", it = String(o.invoiceType || "RE");
    const kind = isOrder ? ({ AN: "Angebot", AB: "Auftragsbestätigung", LI: "Lieferschein" }[o.orderType] || "Angebot") : it === "MA" ? "Zahlungserinnerung" : it === "SR" ? "Stornorechnung" : it === "AR" ? "Abschlagsrechnung" : type === "CreditNote" ? "Gutschrift" : "Rechnung";
    const nr = o.invoiceNumber || o.orderNumber || o.creditNoteNumber || "";
    const contact = o.contact && ctx.get("Contact", o.contact.id);
    // Fußzeile auf jeder Seite
    const footer = () => {
      const y = doc.page.height - 70, mb = doc.page.margins.bottom; doc.page.margins.bottom = 0; doc.save();
      doc.moveTo(L, y - 8).lineTo(R, y - 8).lineWidth(.5).strokeColor(LINE).stroke();
      const cols = [
        [F.name, F.owner, F.street, [F.zip, F.city].filter(Boolean).join(" "), F.country].filter(Boolean),
        [F.phone ? "Tel. " + F.phone : "", F.email, F.web].filter(Boolean),
        [F.bank, F.iban ? "IBAN " + F.iban : "", F.bic ? "BIC " + F.bic : ""].filter(Boolean),
        [F.uid ? "UID " + F.uid : "", F.taxNumber ? "St.-Nr. " + F.taxNumber : "", F.court].filter(Boolean),
      ];
      const cw = (R - L) / 4;
      cols.forEach((c, i) => doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(c.join("\n"), L + i * cw, y, { width: cw - 8, lineGap: 1, lineBreak: true }));
      doc.restore(); doc.page.margins.bottom = mb; doc.x = L; doc.y = doc.page.margins.top;
    };
    doc.on("pageAdded", footer); footer();
    // Logo
    if (LOGO) { try { doc.image(LOGO, R - 54, 40, { fit: [54, 54] }); } catch (e) {} }
    // Absenderzeile + Anschrift
    doc.font("Helvetica").fontSize(7).fillColor(MUTED).text([F.name, F.street, [F.zip, F.city].filter(Boolean).join(" ")].filter(Boolean).join(" · "), L, 142, { width: 260 });
    doc.moveTo(L, 152).lineTo(L + 250, 152).lineWidth(.4).strokeColor(LINE).stroke();
    const addr = String(o.address || (contact && contact.name) || "").trim();
    doc.font("Helvetica").fontSize(10).fillColor(INK).text(addr, L, 160, { width: 250, lineGap: 2 });
    // Infoblock
    const info = [[kind + "s-Nr.".replace("Zahlungserinnerungs-Nr.", "Nr.").replace("Lieferscheins-Nr.", "Lieferschein-Nr."), nr]];
    const d1 = de(o.invoiceDate || o.orderDate || o.creditNoteDate);
    info.push([isOrder ? "Datum" : "Rechnungsdatum", d1]);
    if (!isOrder && o.deliveryDate) info.push(["Leistungsdatum", de(o.deliveryDate) + (o.deliveryDateUntil ? " – " + de(o.deliveryDateUntil) : "")]);
    if (contact && contact.customerNumber) info.push(["Kundennummer", String(contact.customerNumber)]);
    if (F.contactPerson) info.push(["Ihr Ansprechpartner", F.contactPerson]);
    let iy = 150;
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(info[0][0], 340, iy, { width: 110 }).text(info[0][1], 450, iy, { width: R - 450, align: "right" });
    iy += 22;
    info.slice(1).forEach(r => { doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(r[0], 340, iy, { width: 110 }); doc.fillColor(INK).text(r[1], 450, iy, { width: R - 450, align: "right" }); iy += 13; });
    // Überschrift + Einleitung
    let y = Math.max(270, iy + 30);
    const hd = strip(o.header), generic = !hd || /^(rechnung|angebot|gutschrift|stornorechnung|auftragsbestätigung|lieferschein)$/i.test(hd);
    doc.font("Helvetica-Bold").fontSize(15).fillColor(BLUE).text(generic ? ((hd || kind) + " Nr. " + nr) : hd, L, y, { width: R - L }); y = doc.y + 12;
    const head = strip(o.headText) || (isOrder ? "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:" : it === "MA" ? "" : "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihren Auftrag und das damit verbundene Vertrauen!\nHiermit stelle ich Ihnen die folgenden Leistungen in Rechnung:");
    if (head) { doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(head, L, y, { width: R - L, lineGap: 2 }); y = doc.y + 14; }
    // Tabelle
    const cx = { pos: L, desc: L + 34, qty: 330, unit: 395, sum: 465 };
    const header = () => { doc.rect(L, y, R - L, 18).fill(BLUE); doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#fff");
      doc.text("Pos.", cx.pos + 4, y + 5, { width: 28 }).text("Beschreibung", cx.desc, y + 5, { width: 240 }).text("Menge", cx.qty, y + 5, { width: 60, align: "right" }).text("Einzelpreis", cx.unit, y + 5, { width: 66, align: "right" }).text("Gesamtpreis", cx.sum, y + 5, { width: R - cx.sum - 4, align: "right" }); y += 24; };
    header();
    const showNet = String(o.showNet) !== "0" && o.showNet !== false;
    const unitName = u => { const x = u && u.id && ctx.get("Unity", u.id); return x ? (x.translationCode === "UNITY_PIECE" ? "Stk" : (x.name || "")) : ""; };
    pos.forEach((p, i) => {
      const q = +p.quantity || 0, unit = showNet ? +p.price : +p.priceGross, sum = showNet ? +p.sumNet : +p.sumGross;
      const txt = strip(p.text), hName = doc.font("Helvetica-Bold").fontSize(9).heightOfString(p.name || "", { width: 280 }), hTxt = txt ? doc.font("Helvetica").fontSize(8).heightOfString(txt, { width: 280 }) : 0;
      if (y + hName + hTxt + 10 > doc.page.height - 110) { doc.addPage(); y = 60; header(); }
      doc.font("Helvetica").fontSize(9).fillColor(INK).text(String(i + 1) + ".", cx.pos + 4, y, { width: 28 });
      doc.font("Helvetica-Bold").fontSize(9).text(p.name || "", cx.desc, y, { width: 280 });
      if (txt) doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(txt, cx.desc, y + hName + 1, { width: 280 });
      const uName = unitName(p.unity);
      doc.font("Helvetica").fontSize(9).fillColor(INK).text((Math.round(q * 100) / 100).toLocaleString("de-AT") + (uName ? " " + uName : ""), cx.qty - 20, y, { width: 80, align: "right" })
        .text(eur(unit), cx.unit, y, { width: 66, align: "right" }).text(eur(sum), cx.sum, y, { width: R - cx.sum - 4, align: "right" });
      y += hName + hTxt + 8; doc.moveTo(L, y - 3).lineTo(R, y - 3).lineWidth(.3).strokeColor(LINE).stroke();
    });
    // Summen
    if (y > doc.page.height - 200) { doc.addPage(); y = 60; }
    y += 6;
    const row = (lbl, val, bold, color) => { doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 10 : 9).fillColor(color || INK).text(lbl, 300, y, { width: 160 }).text(val, 460, y, { width: R - 460 - 4, align: "right" }); y += bold ? 18 : 14; };
    const taxBy = {}; pos.forEach(p => { const r = +p.taxRate || 0; taxBy[r] = (taxBy[r] || 0) + (+p.sumTax || 0); });
    row("Gesamtbetrag netto", eur(o.sumNet), false, BLUE);
    Object.keys(taxBy).sort().forEach(r => { if (+r > 0) row("zzgl. Umsatzsteuer " + r + " %", eur(taxBy[r])); });
    if (Object.keys(taxBy).every(r => +r === 0) && o.taxText) row(String(o.taxText).slice(0, 40), eur(0));
    doc.moveTo(300, y - 2).lineTo(R, y - 2).lineWidth(.6).strokeColor(BLUE).stroke(); y += 4;
    row("Gesamtbetrag brutto", eur(o.sumGross), true, BLUE);
    if (+o.paidAmount > 0 && it !== "SR") row("bereits bezahlt", "− " + eur(o.paidAmount));
    y += 12;
    // Text unten + Gruß
    const foot = strip(o.footText) || (isOrder ? "Dieses Angebot ist 30 Tage gültig." : "Bitte überweisen Sie den Rechnungsbetrag unter Angabe der Rechnungsnummer innerhalb von " + (o.timeToPay || 14) + " Tagen auf das unten angegebene Konto.");
    doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(foot, L, y, { width: R - L, lineGap: 2 }); y = doc.y + 14;
    doc.text("Mit freundlichen Grüßen", L, y); doc.text(F.owner || F.contactPerson || "", L, doc.y + 4);
    doc.end();
    return done;
  };
};
