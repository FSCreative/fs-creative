"use strict";
// Kontoauszug-Import (George / Erste Bank & Sparkassen, aber auch jede andere Bank):
// CAMT.053/054 (XML), George-JSON-Export und CSV (Spalten werden am Kopf erkannt). Doppelte Umsätze werden über einen Fingerabdruck übersprungen.
const crypto = require("crypto");
function num(v) {
  let s = String(v == null ? "" : v).trim().replace(/[^\d,.\-+]/g, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(/,/g, "");
  const n = parseFloat(s); return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
function day(v) {
  const t = String(v || "").trim(); let m;
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + "-" + m[2] + "-" + m[3];
  if ((m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/))) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return y + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"); }
  return null;
}
function tag(xml, name) { const r = new RegExp("<(?:\\w+:)?" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?" + name + ">", "g"); const out = []; let m; while ((m = r.exec(xml))) out.push(m[1]); return out; }
function first(xml, path) { let cur = [xml]; for (const p of path.split("/")) { const nx = []; cur.forEach(c => tag(c, p).forEach(x => nx.push(x))); cur = nx; if (!cur.length) return ""; } return String(cur[0]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function parseCamt(xml) {
  const out = [];
  tag(xml, "Ntry").forEach(e => {
    const amt = num(first(e, "Amt")); if (!isFinite(amt)) return;
    const cd = first(e, "CdtDbtInd"), sign = cd === "DBIT" ? -1 : 1;
    const d = day(first(e, "ValDt/Dt") || first(e, "ValDt/DtTm") || first(e, "BookgDt/Dt") || first(e, "BookgDt/DtTm"));
    const bd = day(first(e, "BookgDt/Dt") || first(e, "BookgDt/DtTm")) || d;
    const name = sign > 0 ? (first(e, "RltdPties/Dbtr/Nm") || first(e, "RltdPties/Dbtr/Pty/Nm")) : (first(e, "RltdPties/Cdtr/Nm") || first(e, "RltdPties/Cdtr/Pty/Nm"));
    const iban = sign > 0 ? first(e, "RltdPties/DbtrAcct/Id/IBAN") : first(e, "RltdPties/CdtrAcct/Id/IBAN");
    const purpose = [tag(e, "Ustrd").map(x => x.trim()).join(" "), first(e, "AddtlNtryInf")].filter(Boolean).join(" · ").replace(/\s+/g, " ").trim();
    const ref = first(e, "AcctSvcrRef") || first(e, "EndToEndId");
    out.push({ date: d || bd, bookDate: bd, amount: Math.round(sign * Math.abs(amt) * 100) / 100, name, iban, purpose, ref: ref === "NOTPROVIDED" ? "" : ref });
  });
  return out;
}
function splitCsv(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep = [";", ",", "\t"].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const row = l => { const out = []; let cur = "", q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === sep && !q) { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out.map(x => x.trim()); };
  return lines.map(row);
}
// PayPal-Aktivitätenbericht (CSV): Brutto/Gebühr/Netto je Zeile → Zahlung brutto + Gebühr als eigener Umsatz (wie Mollie)
function parsePaypal(rows) {
  const h = rows[0].map(x => x.toLowerCase().replace(/^\ufeff/, "").trim());
  const col = (...rx) => h.findIndex(x => rx.some(r => r.test(x)));
  const cD = col(/^datum$/, /^date$/), cN = col(/^name$/), cB = col(/^brutto$/, /^gross$/), cF = col(/^geb(ü|ue)hr$/, /^fee$/), cT = col(/^beschreibung$/, /^typ$/, /^type$/, /^description$/), cS = col(/^status$/), cI = col(/transaktionscode|transaction id/), cH = col(/^hinweis$/, /^note$/, /betreff|subject|artikelbezeichnung|item title/), cC = col(/^w(ä|ae)hrung$/, /^currency$/), cE = col(/absender e-mail|from email/);
  const out = [];
  rows.slice(1).forEach(r => {
    if (cS > -1 && r[cS] && !/abgeschlossen|completed|gutgeschrieben|cleared/i.test(r[cS])) return;
    if (cC > -1 && r[cC] && String(r[cC]).toUpperCase() !== "EUR") return;
    const date = day(r[cD]); const gross = num(r[cB]), fee = cF > -1 ? num(r[cF]) : 0; if (!date || !isFinite(gross)) return;
    const purpose = [r[cT], r[cH]].filter(Boolean).join(" · "), ref = cI > -1 ? r[cI] : "";
    const nm = (cN > -1 ? r[cN] : "") || (cE > -1 ? r[cE] : ""), f = isFinite(fee) ? fee : 0;
    // Eingang: netto wie gutgeschrieben, Gebühr am Umsatz gemerkt → beim Zuordnen als Zahlungsgebühr an die Rechnung
    if (gross > 0) out.push({ date, bookDate: date, amount: Math.round((gross + f) * 100) / 100, gross, fee: Math.abs(f), feeBy: "PayPal", name: nm, iban: "", purpose: purpose + (Math.abs(f) > 0.004 ? " · brutto " + gross.toFixed(2) + ", Gebühr " + Math.abs(f).toFixed(2) : ""), ref });
    else if (gross) { out.push({ date, bookDate: date, amount: gross, name: nm, iban: "", purpose, ref }); if (Math.abs(f) > 0.004) out.push({ date, bookDate: date, amount: f, name: "PayPal", iban: "", purpose: "PayPal-Gebühr" + (ref ? " zu " + ref : ""), ref: ref ? ref + ":fee" : "" }); }
  });
  return out;
}
function parseCsv(text) {
  const rows = splitCsv(text); if (rows.length < 2) return [];
  const h0 = rows[0].map(x => x.toLowerCase().replace(/^\ufeff/, "").trim());
  if (h0.some(x => /^brutto$|^gross$/.test(x)) && h0.some(x => /^geb(ü|ue)hr$|^fee$/.test(x))) return parsePaypal(rows);
  const h = rows[0].map(x => x.toLowerCase());
  const col = (...rx) => h.findIndex(x => rx.some(r => r.test(x)));
  const cDate = col(/valuta/, /^datum$/, /buchungsdatum/, /date/), cBook = col(/buchungsdatum/, /booking/), cAmt = col(/^betrag/, /amount/, /^umsatz/);
  const cName = col(/partner ?name/, /empfänger|auftraggeber|name/, /partner/), cIban = col(/partner ?iban/, /iban/), cPurp = col(/verwendungszweck/, /zahlungsreferenz/, /buchungs-?info/, /buchungstext/, /purpose|reference|text/), cRef = col(/referenz|reference/);
  const cDebit = col(/soll|ausgang|debit/), cCredit = col(/haben|eingang|credit/);
  if (cDate < 0 || (cAmt < 0 && cDebit < 0)) return [];
  return rows.slice(1).map(r => {
    let amt = cAmt > -1 ? num(r[cAmt]) : NaN;
    if (!isFinite(amt) && cDebit > -1) { const dd = num(r[cDebit]), cc = num(r[cCredit]); amt = (isFinite(cc) ? Math.abs(cc) : 0) - (isFinite(dd) ? Math.abs(dd) : 0); }
    const purp = [cPurp > -1 ? r[cPurp] : "", h.length > 6 ? h.map((x, i) => (/buchungs-?info|zahlungsreferenz|verwendungszweck/.test(x) && i !== cPurp ? r[i] : "")).filter(Boolean).join(" ") : ""].filter(Boolean).join(" · ");
    return { date: day(r[cDate]), bookDate: cBook > -1 ? day(r[cBook]) : day(r[cDate]), amount: amt, name: cName > -1 ? r[cName] : "", iban: cIban > -1 ? r[cIban] : "", purpose: purp.replace(/\s+/g, " ").trim(), ref: cRef > -1 && cRef !== cPurp ? r[cRef] : "" };
  }).filter(t => t.date && isFinite(t.amount) && t.amount !== 0);
}
function parseJson(text) {
  let j; try { j = JSON.parse(text); } catch (e) { return []; }
  const arr = Array.isArray(j) ? j : (j.transactions || j.collection || j.items || []);
  return arr.map(t => {
    const a = t.amount && typeof t.amount === "object" ? (+t.amount.value / Math.pow(10, +t.amount.precision || 0)) : num(t.amount);
    return { date: day(t.valuation || t.valueDate || t.booking || t.bookingDate || t.date), bookDate: day(t.booking || t.bookingDate || t.date), amount: Math.round(a * 100) / 100,
      name: t.partnerName || (t.partner && t.partner.name) || t.name || "", iban: (t.partnerAccount && t.partnerAccount.iban) || t.iban || "", purpose: [t.reference, t.referenceNumber, t.note, t.description].filter(Boolean).join(" · "), ref: t.referenceNumber || t.id || "" };
  }).filter(t => t.date && isFinite(t.amount) && t.amount !== 0);
}
function parse(text, filename) {
  const s = String(text || "").trim();
  if (/^<\?xml|<Document[\s>]/.test(s) || /\.xml$/i.test(filename || "")) return { format: "CAMT", items: parseCamt(s) };
  if (/^[\[{]/.test(s)) return { format: "JSON", items: parseJson(s) };
  const items = parseCsv(s); return { format: /(^|[;,\t"])(brutto|gross)([;,\t"]|$)/i.test(s.split(/\r?\n/)[0] || "") ? "PayPal-CSV" : "CSV", items };
}
function hash(accId, t) { return crypto.createHash("sha1").update([accId, t.date, t.amount.toFixed(2), (t.ref || ""), (t.purpose || "").slice(0, 120), (t.name || "").slice(0, 60)].join("|")).digest("hex").slice(0, 24); }
module.exports = { parse, hash };
