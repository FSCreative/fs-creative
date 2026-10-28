"use strict";
// PDF für Rechnungen, Mahnungen, Stornos, Gutschriften und Angebote – Layout „Marke“:
// dunkler Kopf mit Glühbirnen-Logo, Dokumentart + Nummer + Referenz rechts oben, gelber Akzentstreifen,
// Anschrift links / Infoblock mit gelber Linie rechts, dunkler Tabellenkopf, Zahlbetrag in gelber Box, dunkle 4-spaltige Fußzeile.
const path = require("path"), fs = require("fs");
// Einzelpreis einer Position so genau, dass Menge × Einzelpreis die Zeilensumme ergibt (A10): Bruttopreis-Positionen netto (3 × 8,3333 = 25,00),
// Nettopreis-Positionen brutto; reicht der auf Cent gerundete Wert, bleibt die Anzeige wie bisher. → { unit, sum, cents: true = 2 Nachkommastellen }
function unitOf(p, showNet) {
  const q = +p.quantity || 0, sum = showNet ? +p.sumNet : +p.sumGross, gp = p.grossPricing === true || p.grossPricing === "true", rt = +p.taxRate || 0, dsc = +p.discount || 0;
  const exact = showNet ? (gp && p.priceGross != null ? +p.priceGross / (1 + rt / 100) : +p.price) : (gp || p.priceGross == null ? +p.priceGross : +p.price * (1 + rt / 100));
  const r2u = Math.round(exact * 100) / 100, fits = Math.abs(Math.round(r2u * q * (1 - dsc / 100) * 100) / 100 - sum) < 0.005;
  return { unit: fits ? r2u : Math.round(exact * 10000) / 10000, sum, cents: fits };
}
module.exports = function (D) {
  const { firm } = D;                 // firm(): Firmendaten (Name, Adresse, UID, Bank …)
  const DARK = "#1f1d1e", YEL = "#ffe600", INK = "#1f1d1e", MUTED = "#6b6b6b", LINE = "#e3e1dc", ZEBRA = "#f7f6f3", SOFT = "#bdbab3";
  const file = n => [path.join(__dirname, "logos", n)].find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
  const LOGO_W = file("Logo Glühbirne Weiss.png") || file("Logo Glühbirne.png");
  const eur = n => { const v = Math.round((+n || 0) * 100) / 100, a = Math.abs(v).toFixed(2).split("."); return (v < 0 ? "- " : "") + "€ " + a[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + a[1]; };
  // bis 4 Nachkommastellen (mindestens 2) – Einzelpreis, wenn der Cent-Wert die Zeilensumme nicht ergibt
  const eurX = n => { const v = Math.round((+n || 0) * 10000) / 10000, a = Math.abs(v).toFixed(4).replace(/0{1,2}$/, "").split("."); return (v < 0 ? "- " : "") + "€ " + a[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + a[1]; };
  const de = v => { const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "." + m[2] + "." + m[1] : ""; };
  const addDays = (v, n) => { const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return ""; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)); return d.toISOString().slice(0, 10); };
  // HTML → Text; Einrückungen aus dem HTML-Quelltext weg; sevDesk-Platzhalter: [%PAYPAL%] (PayPal-Link, gibt es hier nicht) entfällt
  const strip = h => String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\[%PAYPAL%\]/gi, "").split("\n").map(l => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Referenz rechts oben: eigenes Feld, sonst Auftrag/Angebot, Buchungsnummer aus dem Text (Blitzdings), sonst die Dokumentnummer selbst (Zahlungsreferenz)
  function referenceOf(o, ctx, nr) {
    if (o.reference) return String(o.reference);
    const org = o.origin && o.origin.id && o.origin.objectName && ctx.get(o.origin.objectName, o.origin.id);
    if (org && (org.orderNumber || org.invoiceNumber)) return String(org.orderNumber || org.invoiceNumber);
    const m = strip(o.headText).match(/\bBuchung\s+([A-Za-z0-9][A-Za-z0-9-]{3,})/); if (m) return m[1];
    return nr;
  }
  return async function render(type, o, pos, ctx) {
    const PDFDocument = require("pdfkit");
    const F0 = firm() || {};
    // kochdu-Abrechnungen (Provisionen, Sammel-/Monatsrechnungen, Auszahlungsbelege) zeigen das kochdu-Konto, alle anderen das FS-Creative-Konto
    const kochdu = /\bkoch ?du\b/i.test([o.header, o.headText, o.footText].map(x => String(x || "")).join(" ")) && !!F0.kochduIban;
    const F = kochdu ? Object.assign({}, F0, { bank: F0.kochduBank || F0.bank, iban: F0.kochduIban, bic: F0.kochduBic || F0.bic }) : F0;
    const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 100, left: 56, right: 56 }, info: { Title: (o.invoiceNumber || o.orderNumber || o.creditNoteNumber || "Dokument"), Author: F.name || "FS Creative" } });
    const chunks = []; doc.on("data", c => chunks.push(c));
    const done = new Promise(r => doc.on("end", () => r(Buffer.concat(chunks))));
    const W = doc.page.width, H = doc.page.height, L = 56, R = W - 56;
    const isOrder = type === "Order", isCn = type === "CreditNote", it = String(o.invoiceType || "RE");
    const kind = isOrder ? ({ AN: "Angebot", AB: "Auftragsbestätigung", LI: "Lieferschein" }[o.orderType] || "Angebot") : it === "MA" ? "Zahlungserinnerung" : it === "SR" ? "Stornorechnung" : it === "AR" ? "Abschlagsrechnung" : isCn ? "Gutschrift" : "Rechnung";
    const nr = o.invoiceNumber || o.orderNumber || o.creditNoteNumber || (String(o.status) === "100" ? "Entwurf" : "");
    const contact = o.contact && ctx.get("Contact", o.contact.id);
    const ref = referenceOf(o, ctx, nr);

    // Fußzeile (jede Seite): gelbe Linie + dunkles Band, 4 Spalten mit gelben Überschriften
    const FH = 78;
    const footer = () => {
      const mb = doc.page.margins.bottom; doc.page.margins.bottom = 0; doc.save();
      const y0 = H - FH; doc.rect(0, y0 - 3, W, 3).fill(YEL); doc.rect(0, y0, W, FH).fill(DARK);
      const cols = [
        [String(F.name || "FS Creative").toUpperCase(), [F.owner, F.street, [F.zip, F.city].filter(Boolean).join(" ")].filter(Boolean)],
        ["KONTAKT", [F.phone ? "Tel. " + F.phone : "", F.email, F.web].filter(Boolean)],
        ["BANK", [F.bank, F.iban ? "IBAN " + F.iban : "", F.bic ? "BIC " + F.bic : ""].filter(Boolean)],
        ["STEUER", [F.uid ? "UID " + F.uid : "", F.taxNumber ? "St.-Nr. " + F.taxNumber : "", F.court].filter(Boolean)],
      ];
      const cw = (R - L) / 4;
      cols.forEach((c, i) => {
        doc.font("Helvetica-Bold").fontSize(6.8).fillColor(YEL).text(c[0], L + i * cw, y0 + 16, { width: cw - 8, characterSpacing: .8, lineBreak: false });
        doc.font("Helvetica").fontSize(7).fillColor("#e9e7e2").text(c[1].join("\n"), L + i * cw, y0 + 28, { width: cw - 8, lineGap: 1.2 });
      });
      doc.restore(); doc.page.margins.bottom = mb; doc.x = L; doc.y = doc.page.margins.top;
    };
    doc.on("pageAdded", footer); footer();

    // Kopf: dunkles Band mit Logo, Firmenname, Dokumentart/Nummer/Referenz rechts
    const HH = 112;
    doc.rect(0, 0, W, HH).fill(DARK); doc.rect(0, HH, W, 5).fill(YEL);
    if (LOGO_W) { try { doc.image(LOGO_W, L - 6, 26, { fit: [52, 58], align: "center", valign: "center" }); } catch (e) {} }
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#ffffff").text(F.name || "FS Creative", L + 62, 38, { width: 260, lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor(SOFT).text(F.tagline || "Webdesign · Grafik · Digitale Services · Montafon", L + 62, 64, { width: 260, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(YEL).text(kind.toUpperCase(), 330, 30, { width: R - 330, align: "right", characterSpacing: 1.6 });
    doc.font("Helvetica-Bold").fontSize(nr.length > 10 ? 20 : 26).fillColor("#ffffff").text(nr, 300, 44, { width: R - 300, align: "right", lineBreak: false });
    if (ref) { doc.font("Helvetica-Bold").fontSize(8.5); const rw = doc.widthOfString(ref); doc.fillColor("#ffffff").text(ref, R - rw, 82, { lineBreak: false });
      doc.font("Helvetica").fontSize(8); const lw = doc.widthOfString("Referenz"); doc.fillColor(SOFT).text("Referenz", R - rw - lw - 6, 82.5, { lineBreak: false }); }

    // Absenderzeile + Anschrift (links)
    const top = 150;
    doc.font("Helvetica").fontSize(6.8).fillColor(MUTED).text([F.name, F.owner, F.street, [F.zip, F.city].filter(Boolean).join(" ")].filter(Boolean).join(" · "), L, top, { width: 250, lineBreak: false });
    doc.moveTo(L, top + 11).lineTo(L + 250, top + 11).lineWidth(.5).strokeColor(LINE).stroke();
    const addr = String(o.address || (contact && contact.name) || "").trim();
    doc.font("Helvetica").fontSize(10.5).fillColor(INK).text(addr, L, top + 20, { width: 250, lineGap: 2.5 });
    const addrEnd = doc.y;

    // Infoblock (rechts) mit gelber Linie
    const info = [];
    const d1 = de(o.invoiceDate || o.orderDate || o.creditNoteDate);
    info.push([isOrder ? "Datum" : isCn ? "Gutschriftsdatum" : "Rechnungsdatum", d1]);
    if (!isOrder && o.deliveryDate) info.push([o.deliveryDateUntil ? "Leistungszeitraum" : "Leistungsdatum", de(o.deliveryDate) + (o.deliveryDateUntil ? " – " + de(o.deliveryDateUntil) : "")]);
    if (contact && contact.customerNumber) info.push(["Kunden-Nr.", String(contact.customerNumber)]);
    if (type === "Invoice" && it !== "SR" && +o.timeToPay > 0 && (o.invoiceDate)) info.push(["Fällig am", de(addDays(o.invoiceDate, +o.timeToPay))]);
    if (isOrder && o.orderDate) info.push(["Gültig bis", de(addDays(o.orderDate, 30))]);
    if (F.contactPerson) info.push(["Ansprechpartner", F.contactPerson]);
    const ix = 330, ilw = 92;
    let iy = top + 2;
    info.forEach(r => { doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(r[0], ix + 14, iy, { width: ilw }); doc.font("Helvetica-Bold").fillColor(INK).text(r[1], ix + 14 + ilw, iy, { width: R - ix - 14 - ilw, align: "right" }); iy += 17; });
    doc.rect(ix, top - 2, 2.5, iy - top).fill(YEL);
    if (contact && contact.vatNumber) { doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text("UID Empfänger: " + contact.vatNumber, L, addrEnd + 4, { width: 250 }); }

    // Überschrift (nur wenn eigene) + Einleitung
    let y = Math.max(top + 120, iy + 24, doc.y + 24);
    const hd = strip(o.header), generic = !hd || /^(rechnung|angebot|gutschrift|stornorechnung|auftragsbestätigung|lieferschein|zahlungserinnerung|abschlagsrechnung)(\s+(nr\.?\s*)?[A-Z]{2}-?\d+)?$/i.test(hd);
    if (!generic) { doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(hd, L, y, { width: R - L }); y = doc.y + 10; }
    const head = strip(o.headText) || (isOrder ? "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Anfrage. Gerne unterbreite ich Ihnen folgendes Angebot:" : it === "MA" ? "" : "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihren Auftrag und das damit verbundene Vertrauen!\nHiermit stelle ich Ihnen die folgenden Leistungen in Rechnung:");
    if (head) { doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(head, L, y, { width: R - L, lineGap: 2 }); y = doc.y + 16; }

    // Tabelle
    const showNet = String(o.showNet) !== "0" && o.showNet !== false;
    const multiTax = new Set(pos.map(p => +p.taxRate || 0)).size > 1 || pos.some(p => +p.taxRate !== +(pos[0] && pos[0].taxRate));
    const cx = { pos: L + 8, desc: L + 36, qty: 318, unit: 382, tax: 444, sum: 478 };
    const header = () => { doc.rect(L, y, R - L, 22).fill(DARK); doc.font("Helvetica-Bold").fontSize(8.2).fillColor("#fff");
      doc.text("Pos.", cx.pos, y + 7, { width: 26 }).text("Beschreibung", cx.desc, y + 7, { width: 240 }).text("Menge", cx.qty - 10, y + 7, { width: 66, align: "right" }).text("Einzelpreis", cx.unit, y + 7, { width: 56, align: "right" }).text("USt.", cx.tax, y + 7, { width: 30, align: "right" }).text("Gesamt", cx.sum, y + 7, { width: R - cx.sum - 8, align: "right" }); y += 22; };
    header();
    const unitName = u => { const x = u && u.id && ctx.get("Unity", u.id); return x ? (x.translationCode === "UNITY_PIECE" ? "Stk" : (x.name || "")) : ""; };
    pos.forEach((p, i) => {
      const q = +p.quantity || 0, U = unitOf(p, showNet), sum = U.sum, unitTxt = U.cents ? eur(U.unit) : eurX(U.unit);   // Einzelpreis passend zur Zeilensumme (A10)
      const disc = +p.discount || 0, txt = (strip(p.text) + (disc > 0 ? (strip(p.text) ? "\n" : "") + "abzüglich " + String(disc).replace(".", ",") + " % Rabatt" : "")).trim(), hName = doc.font("Helvetica-Bold").fontSize(9).heightOfString(p.name || "", { width: 268 }), hTxt = txt ? doc.font("Helvetica").fontSize(7.8).heightOfString(txt, { width: 268 }) + 2 : 0;
      const rh = hName + hTxt + 16;
      if (y + rh > H - FH - 40) { doc.addPage(); y = 60; header(); }
      if (i % 2 === 1) doc.rect(L, y, R - L, rh).fill(ZEBRA);
      const ty = y + 8;
      doc.font("Helvetica").fontSize(9).fillColor(INK).text(String(i + 1), cx.pos, ty, { width: 26 });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(p.name || "", cx.desc, ty, { width: 268 });
      if (txt) doc.font("Helvetica").fontSize(7.8).fillColor(MUTED).text(txt, cx.desc, ty + hName + 2, { width: 268 });
      const uName = unitName(p.unity);
      doc.font("Helvetica").fontSize(9).fillColor(INK).text((Math.round(q * 100) / 100).toLocaleString("de-AT") + (uName ? " " + uName : ""), cx.qty - 30, ty, { width: 86, align: "right" })
        .text(unitTxt, cx.unit - 6, ty, { width: 62, align: "right" }).text((+p.taxRate || 0) + " %", cx.tax, ty, { width: 30, align: "right" });
      doc.font("Helvetica-Bold").text(eur(sum), cx.sum, ty, { width: R - cx.sum - 8, align: "right" });
      y += rh; doc.moveTo(L, y).lineTo(R, y).lineWidth(.4).strokeColor(LINE).stroke();
    });
    void multiTax;

    // Summen: links netto/USt, rechts gelbe Box mit Zahlbetrag
    if (y > H - FH - 190) { doc.addPage(); y = 60; }
    y += 18;
    const taxBy = {}; pos.forEach(p => { const r = +p.taxRate || 0; taxBy[r] = (taxBy[r] || 0) + (+p.sumTax || 0); });
    const bx = 372, bw = R - bx, sy0 = y;
    let sy = y + 8;
    const srow = (lbl, val, bold) => { doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(INK).text(lbl, 196, sy, { width: 110 }).text(val, 290, sy, { width: 70, align: "right" }); sy += 18; };
    srow("Summe netto", eur(o.sumNet));
    Object.keys(taxBy).sort().forEach(r => { if (+r > 0) srow("zzgl. " + r + " % USt.", eur(taxBy[r])); });
    if (Object.keys(taxBy).every(r => +r === 0)) { const tt = strip(o.taxText); if (tt && !/^umsatzsteuer\s*0/i.test(tt)) { doc.font("Helvetica").fontSize(7.8).fillColor(MUTED).text(tt.slice(0, 160), 196, sy, { width: 164 }); sy = doc.y + 6; } else srow("USt.", eur(0)); }
    const paid = +o.paidAmount > 0 && it !== "SR" && !isOrder ? +o.paidAmount : 0;
    if (paid) srow("bereits bezahlt", "− " + eur(paid));
    const due = Math.round(((+o.sumGross || 0) - paid) * 100) / 100;
    const boxLbl = isOrder ? "GESAMTBETRAG" : isCn ? "GUTSCHRIFT" : it === "SR" ? "STORNOBETRAG" : paid && due <= 0.004 ? "BEZAHLT" : "ZU ZAHLEN";
    const boxVal = isOrder || isCn || it === "SR" ? eur(o.sumGross) : paid && due <= 0.004 ? eur(o.sumGross) : eur(due);
    doc.rect(bx, sy0, bw, 70).fill(YEL);
    doc.font("Helvetica").fontSize(7.5).fillColor(INK).text(boxLbl, bx, sy0 + 14, { width: bw - 18, align: "right", characterSpacing: 1.6 });
    doc.font("Helvetica-Bold").fontSize(boxVal.length > 12 ? 19 : 22).fillColor(INK).text(boxVal, bx, sy0 + 30, { width: bw - 18, align: "right", lineBreak: false });
    y = Math.max(sy, sy0 + 70) + 22;

    // Text unten + Gruß
    // Gruß + Name setzt das PDF selbst darunter – aus sevDesk übernommene Fußtexte enthalten ihn schon („Mit freundlichen Grüßen [%KONTAKTPERSON%]“) → nicht doppelt
    const foot = strip(o.footText).replace(/\n*\s*mit freundlichen gr(ü|ue)(ß|ss)en[\s,]*(\[%KONTAKTPERSON%\]|[^\n]{0,60})?\s*$/i, "").replace(/\[%KONTAKTPERSON%\]/gi, F.contactPerson || F.owner || "").trim() || (isOrder ? "Dieses Angebot ist 30 Tage gültig." : isCn ? "Der Betrag wird Ihnen gutgeschrieben bzw. überwiesen." : "Zahlbar innerhalb von " + (o.timeToPay || 14) + " Tagen ohne Abzug. Bitte bei der Überweisung die Rechnungsnummer " + nr + " angeben.");
    if (y > H - FH - 80) { doc.addPage(); y = 60; }
    doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(foot, L, y, { width: R - L - 140, lineGap: 2 }); y = doc.y + 12;
    doc.text("Mit freundlichen Grüßen", L, y); doc.font("Helvetica-Bold").text(F.owner || F.contactPerson || "", L, doc.y + 3);
    doc.end();
    return done;
  };
};
module.exports.unitOf = unitOf;   // Tests (A10)
