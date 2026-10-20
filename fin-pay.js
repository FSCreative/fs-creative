"use strict";
// Zahlungsaufträge (ausgehende Überweisungen, Wunsch Simon 20.10.2026):
// erfassen (von Hand oder per KI aus Mail/Anhang), prüfen (IBAN-Prüfziffer, Betrag, Empfänger), dann
//  · „In George freigeben“: Überweisung über Enable Banking anlegen – Simon bestätigt sie in George (ohne seine Bestätigung passiert nichts),
//  · oder QR-Code (EPC/„GiroCode“) mit der George-App scannen, oder SEPA-Datei (pain.001) für den Datei-Upload.
// Taucht die Abbuchung im Konto auf (Bankimport), wird der Auftrag automatisch als bezahlt markiert.
// Speicher: zahlungen.json im Datenverzeichnis (wie Aufträge). Status: entwurf → bereit → bank (in George zur Freigabe) → ausgefuehrt → bezahlt | abgelehnt | storniert.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
module.exports = function (D) {
  const FILE = path.join(D.DATA_DIR, "zahlungen.json");
  const r2 = n => Math.round((+n || 0) * 100) / 100, clip = (v, n) => String(v == null ? "" : v).replace(/[\r\u0000-\u001f]/g, " ").trim().slice(0, n);
  const today = () => new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
  function read() { try { const o = JSON.parse(fs.readFileSync(FILE, "utf8")); return { orders: Array.isArray(o.orders) ? o.orders : [], rev: +o.rev || 0 }; } catch (e) { return { orders: [], rev: 0 }; } }
  function write(o) { o.rev = (+o.rev || 0) + 1; const t = FILE + ".tmp"; fs.writeFileSync(t, JSON.stringify(o)); fs.renameSync(t, FILE); return o; }
  const hist = (o, what) => { o.history = (o.history || []).concat([{ at: new Date().toISOString(), what: clip(what, 300) }]).slice(-40); };

  // IBAN: Leerzeichen raus, Großbuchstaben, Prüfziffer (ISO 13616, mod 97)
  function iban(v) { return String(v || "").replace(/[\s-]/g, "").toUpperCase(); }
  function ibanOk(v) {
    const s = iban(v); if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    const LEN = { AT: 20, DE: 22, CH: 21, LI: 21, IT: 27, NL: 18, BE: 16, LU: 20, FR: 27, ES: 24, SI: 19, CZ: 24, SK: 24, HU: 28, PL: 28, DK: 18, SE: 24, FI: 18, IE: 22, PT: 25, HR: 21, GB: 22 };
    if (LEN[s.slice(0, 2)] && s.length !== LEN[s.slice(0, 2)]) return false;
    const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
    let m = 0; for (let i = 0; i < r.length; i += 7) m = Number(String(m) + r.slice(i, i + 7)) % 97;
    return m === 1;
  }
  const bicOk = v => !v || /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(String(v).toUpperCase());
  // Zahlungsreferenz (strukturiert, z. B. von einem Zahlschein): nur Buchstaben/Ziffern, max. 35 – sonst gehört der Text in den Verwendungszweck
  const refOk = v => !v || /^[A-Za-z0-9+?/:().,' -]{1,35}$/.test(String(v));

  function problems(o) {
    const p = [];
    if (!o.name) p.push("Empfänger fehlt");
    if (!ibanOk(o.iban)) p.push(o.iban ? "IBAN ist ungültig (Prüfziffer)" : "IBAN fehlt");
    if (!(o.amount > 0)) p.push("Betrag fehlt");
    if (o.amount > 100000) p.push("Betrag über 100.000 € – bitte direkt in George");
    if (!bicOk(o.bic)) p.push("BIC ist ungültig");
    if (!refOk(o.reference)) p.push("Zahlungsreferenz: nur Buchstaben/Ziffern, max. 35 Zeichen – sonst in den Verwendungszweck");
    if (o.reference && o.text) p.push("Entweder Zahlungsreferenz oder Verwendungszweck (die Bank nimmt nur eins)");
    const f = D.firm && D.firm(); if (f && f.iban && iban(f.iban) === o.iban) p.push("Das ist dein eigenes Konto");
    return p;
  }
  function norm(x, old) {
    const o = Object.assign({}, old || {});
    o.name = clip(x.name, 70); o.iban = iban(x.iban).slice(0, 34); o.bic = clip(x.bic, 11).replace(/\s/g, "").toUpperCase();
    o.amount = r2(String(x.amount).replace(",", ".")); o.reference = clip(x.reference, 35); o.text = clip(x.text, 140);
    o.date = isDate(x.date) ? x.date : ""; o.note = clip(x.note, 1000);
    o.invoiceNumber = clip(x.invoiceNumber, 60); o.invoiceDate = isDate(x.invoiceDate) ? x.invoiceDate : "";
    if (x.source && typeof x.source === "object" && !old) o.source = { kind: clip(x.source.kind, 20), mailId: clip(x.source.mailId, 80), account: clip(x.source.account, 40), folder: clip(x.source.folder, 200), uid: parseInt(x.source.uid, 10) || 0, index: x.source.index == null ? null : parseInt(x.source.index, 10) || 0, filename: clip(x.source.filename, 160), subject: clip(x.source.subject, 200), from: clip(x.source.from, 160) };
    return o;
  }
  const OPEN = { entwurf: 1, bereit: 1, abgelehnt: 1 };   // noch nicht bei der Bank → änderbar/löschbar

  // Abgleich mit dem Konto: Abbuchung gleicher Betrag (±0,01) ab Erfassung, gleiche IBAN oder Referenz/Text/Name im Buchungstext
  async function match(A) {
    if (!D.transactions) return 0;
    const waiting = A.orders.filter(o => ["bereit", "bank", "ausgefuehrt"].indexOf(o.status) > -1 && !o.paid);
    if (!waiting.length) return 0;
    let tx = []; try { tx = await D.transactions(); } catch (e) { return 0; }
    const used = new Set(A.orders.filter(o => o.paid && o.paid.txId).map(o => String(o.paid.txId))); let n = 0;
    const low = v => String(v || "").toLowerCase().replace(/\s+/g, " ");
    for (const o of waiting) {
      const since = String(o.created || "").slice(0, 10);
      const t = tx.find(x => !used.has(String(x.id)) && x.amount < 0 && Math.abs(-x.amount - o.amount) < 0.011 && String(x.date) >= since &&
        ((x.iban && iban(x.iban) === o.iban) || (o.reference && low(x.purpose).indexOf(low(o.reference)) > -1) || (o.text && low(x.purpose).indexOf(low(o.text).slice(0, 20)) > -1) || (o.name && low(x.name).indexOf(low(o.name).split(" ")[0]) > -1)));
      if (t) { used.add(String(t.id)); o.paid = { txId: String(t.id), date: t.date, account: t.account || "" }; o.status = "bezahlt"; hist(o, "Abbuchung im Konto gefunden (" + t.date + (t.account ? ", " + t.account : "") + ")"); n++; }
    }
    return n;
  }
  // Freigabe in George nachverfolgen (falls die Rückkehr aus George nicht ankam, z. B. am Handy freigegeben)
  const DONE = { ACSC: 1, ACCC: 1 }, BAD = { RJCT: 1 }, CANCEL = { CNCL: 1 };
  async function refreshBank(A) {
    if (!D.ebank) return 0; let n = 0;
    for (const o of A.orders.filter(x => x.status === "bank" && x.bank && x.bank.paymentId && (!x.bank.checked || Date.now() - Date.parse(x.bank.checked) > 60e3)).slice(0, 5)) {
      try { const s = await D.ebank.payStatus(o.bank.paymentId); o.bank.checked = new Date().toISOString(); n += applyStatus(o, s) ? 1 : 0; } catch (e) { o.bank.checked = new Date().toISOString(); }
    }
    return n;
  }
  function applyStatus(o, s) {
    const st = String(s.status || "").toUpperCase(), before = o.status; o.bank = Object.assign({}, o.bank, { status: st, reason: s.reason || "" });
    if (DONE[st]) o.status = "ausgefuehrt"; else if (BAD[st]) o.status = "abgelehnt"; else if (CANCEL[st]) o.status = "storniert";
    if (o.status !== before) hist(o, o.status === "ausgefuehrt" ? "Bank hat die Überweisung ausgeführt" : o.status === "abgelehnt" ? "Bank hat abgelehnt" + (s.reason ? ": " + s.reason : "") : "Storniert");
    return o.status !== before;
  }

  async function list() {
    const A = read(); const a = await refreshBank(A), b = await match(A);
    if (a || b) write(A);
    let caps = { ok: false, reason: "Bankanbindung nicht eingerichtet" }; try { if (D.ebank) caps = await D.ebank.payCaps(); } catch (e) { caps = { ok: false, reason: e.message }; }
    return { orders: A.orders.slice().sort((x, y) => String(y.created).localeCompare(String(x.created))).map(o => Object.assign({}, o, { problems: problems(o) })), bank: caps, firm: !!(D.firm && D.firm() && D.firm().iban) };
  }
  function save(x) {
    const A = read(), old = x.id ? A.orders.find(o => o.id === String(x.id)) : null;
    if (old && !OPEN[old.status]) throw new Error("Schon bei der Bank – nicht mehr änderbar");
    const o = norm(x, old); if (!old) { o.id = "z" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"); o.created = new Date().toISOString(); o.history = []; hist(o, x.source && x.source.kind === "mail" ? "Aus Mail erfasst" : "Erfasst"); }
    else hist(o, "Geändert");
    o.status = problems(o).length ? "entwurf" : "bereit"; o.updated = new Date().toISOString();
    if (!old) A.orders.push(o); else A.orders[A.orders.indexOf(old)] = o;
    write(A); return Object.assign({}, o, { problems: problems(o) });
  }
  function remove(id) { const A = read(), o = A.orders.find(x => x.id === id); if (!o) throw new Error("Nicht gefunden"); if (!OPEN[o.status] && o.status !== "storniert") throw new Error("Schon bei der Bank – in George stornieren"); A.orders = A.orders.filter(x => x !== o); write(A); return true; }
  // Beleg zur Zahlung (aus demselben Mail-Anhang angelegt, offen) – für die Anzeige und den späteren Abgleich
  function linkVoucher(id, voucherId) { const A = read(), o = A.orders.find(x => x.id === id); if (!o) throw new Error("Nicht gefunden"); o.voucherId = clip(voucherId, 40); hist(o, "Beleg angelegt (offen)"); write(A); return o; }
  function setPaid(id, on) { const A = read(), o = A.orders.find(x => x.id === id); if (!o) throw new Error("Nicht gefunden"); if (on) { o.status = "bezahlt"; o.paid = Object.assign({ manual: true, date: today() }, o.paid || {}); hist(o, "Als bezahlt markiert"); } else { o.paid = null; o.status = problems(o).length ? "entwurf" : "bereit"; hist(o, "Bezahlt zurückgenommen"); } write(A); return o; }

  // EPC-QR (GiroCode, Version 002): George-App → Scannen → Daten sind ausgefüllt, Simon bestätigt in der App
  function epc(o) {
    return ["BCD", "002", "1", "SCT", o.bic || "", o.name, o.iban, "EUR" + (+o.amount).toFixed(2), "", o.reference || "", o.reference ? "" : (o.text || ""), ""].join("\n").replace(/\n+$/, "");
  }
  async function qr(id) {
    const o = read().orders.find(x => x.id === id); if (!o) throw new Error("Nicht gefunden"); const p = problems(o); if (p.length) throw new Error(p.join(" · "));
    const svg = await require("qrcode").toString(epc(o), { type: "svg", errorCorrectionLevel: "M", margin: 2 });
    return { svg, payload: epc(o) };
  }
  // SEPA-Datei pain.001.001.03 (Datei-Upload in George Business bzw. jeder Bank)
  const xe = v => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function sepa(ids) {
    const A = read(), list = A.orders.filter(o => ids.indexOf(o.id) > -1 && OPEN[o.status] && !problems(o).length);
    if (!list.length) throw new Error("Keine gültigen Aufträge ausgewählt");
    const f = (D.firm && D.firm()) || {}; if (!ibanOk(f.iban)) throw new Error("Deine IBAN fehlt in „Firma & Einstellungen“");
    const msg = "FSC" + Date.now().toString(36).toUpperCase(), sum = r2(list.reduce((s, o) => s + o.amount, 0)), when = list.map(o => o.date && o.date > today() ? o.date : today()).sort()[0];
    const tx = list.map((o, i) => '<CdtTrfTxInf><PmtId><EndToEndId>' + xe((o.invoiceNumber || o.id).slice(0, 35)) + '</EndToEndId></PmtId><Amt><InstdAmt Ccy="EUR">' + o.amount.toFixed(2) + '</InstdAmt></Amt>' +
      (o.bic ? '<CdtrAgt><FinInstnId><BIC>' + xe(o.bic) + '</BIC></FinInstnId></CdtrAgt>' : '') + '<Cdtr><Nm>' + xe(o.name) + '</Nm></Cdtr><CdtrAcct><Id><IBAN>' + o.iban + '</IBAN></Id></CdtrAcct>' +
      (o.reference ? '<RmtInf><Strd><CdtrRefInf><Ref>' + xe(o.reference) + '</Ref></CdtrRefInf></Strd></RmtInf>' : o.text ? '<RmtInf><Ustrd>' + xe(o.text) + '</Ustrd></RmtInf>' : '') + '</CdtTrfTxInf>').join("");
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><CstmrCdtTrfInitn>' +
      '<GrpHdr><MsgId>' + msg + '</MsgId><CreDtTm>' + new Date().toISOString().slice(0, 19) + '</CreDtTm><NbOfTxs>' + list.length + '</NbOfTxs><CtrlSum>' + sum.toFixed(2) + '</CtrlSum><InitgPty><Nm>' + xe(clip(f.name || "FS Creative", 70)) + '</Nm></InitgPty></GrpHdr>' +
      '<PmtInf><PmtInfId>' + msg + '-1</PmtInfId><PmtMtd>TRF</PmtMtd><NbOfTxs>' + list.length + '</NbOfTxs><CtrlSum>' + sum.toFixed(2) + '</CtrlSum><PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf><ReqdExctnDt>' + when + '</ReqdExctnDt>' +
      '<Dbtr><Nm>' + xe(clip(f.name || "FS Creative", 70)) + '</Nm></Dbtr><DbtrAcct><Id><IBAN>' + iban(f.iban) + '</IBAN></Id></DbtrAcct><DbtrAgt><FinInstnId>' + (f.bic ? '<BIC>' + xe(String(f.bic).replace(/\s/g, "").toUpperCase()) + '</BIC>' : '<Othr><Id>NOTPROVIDED</Id></Othr>') + '</FinInstnId></DbtrAgt><ChrgBr>SLEV</ChrgBr>' + tx + '</PmtInf></CstmrCdtTrfInitn></Document>';
    list.forEach(o => { o.sepaAt = new Date().toISOString(); hist(o, "In SEPA-Datei " + msg + " exportiert"); }); write(A);
    return { xml, name: "Zahlungen-" + today() + ".xml", count: list.length, sum };
  }
  // In George freigeben: Überweisung bei der Bank anlegen, Simon bestätigt sie dort
  async function toBank(id, redirect) {
    if (!D.ebank) throw new Error("Bankanbindung nicht eingerichtet");
    const A = read(), o = A.orders.find(x => x.id === id); if (!o) throw new Error("Nicht gefunden");
    if (!OPEN[o.status]) throw new Error("Schon bei der Bank");
    const p = problems(o); if (p.length) throw new Error(p.join(" · "));
    const state = "pay-" + crypto.randomBytes(12).toString("hex");
    const r = await D.ebank.payStart(o, redirect, state);
    o.status = "bank"; o.bank = { paymentId: r.paymentId, state, status: r.status, at: new Date().toISOString() }; hist(o, "An George geschickt – Freigabe in George nötig");
    write(A); return { url: r.url, id: o.id };
  }
  // Rückkehr aus George: Status holen; Abbruch → wieder „bereit“
  async function callback(state, error, desc) {
    const A = read(), o = A.orders.find(x => x.bank && x.bank.state === state); if (!o) throw new Error("Zahlung nicht gefunden");
    if (error) { o.status = problems(o).length ? "entwurf" : "bereit"; hist(o, "In George nicht freigegeben" + (desc ? ": " + clip(desc, 120) : "")); o.bank = Object.assign({}, o.bank, { error: clip(desc || error, 200) }); write(A); return o; }
    try { const s = await D.ebank.payStatus(o.bank.paymentId); o.bank.checked = new Date().toISOString(); applyStatus(o, s); if (o.status === "bank") hist(o, "In George freigegeben – wartet auf Ausführung"); } catch (e) { hist(o, "Status nicht abrufbar: " + e.message); }
    write(A); return o;
  }
  return { list, save, remove, setPaid, linkVoucher, qr, sepa, toBank, callback, _test: { ibanOk, problems, norm, epc, match, read, write } };
};
