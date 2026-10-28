"use strict";
/* Finanz-Paket 2 (28.10.2026): Überzahlung „Woher kommt die Differenz?“ (Mahnspesen/Verzugszinsen 0 %, Trinkgeld 20 %, Guthaben, weitere Rechnungen),
   bereits verbuchte Überzahlung nachträglich zuordnen (RE-1233), Doppelzahlung + Rückzahlung (Fall Geiger, inkl. Korrektur-Umsatz),
   Zahlungseingänge automatisch verbuchen (eindeutig vs. mehrdeutig, Mollie, keine doppelten Einnahme-Belege), Zahlung lösen bei festgeschriebener
   Rechnung, USt/UVA (Istbesteuerung): Mahnspesen/Zinsen nicht in der UVA, Trinkgeld 20 %, sonst Kennzahlen unverändert.
   Aufruf: node test/ueberzahlung.test.js – keine Datenbank, keine Produktivdaten: die Module laufen als Temp-Kopie mit Dateispeicher (JSON im Temp-Ordner). */
const assert = require("assert"), fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }
const near = (a, b, msg, eps) => assert.ok(Math.abs((+a || 0) - b) <= (eps || 0.005), (msg || "") + ": ist " + a + ", erwartet " + b);
const r2 = n => Math.round((+n || 0) * 100) / 100;

// ── Temp-Kopie der Module ──
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-ueberzahlung-"));
fs.mkdirSync(path.join(TMP, "admin-cockpit"));
["fin-local.js", "fin-proposals.js", "fin-mollie.js", "fin-bankrules.js"].forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(TMP, f)));
fs.copyFileSync(path.join(ROOT, "admin-cockpit", "steuer-calc.js"), path.join(TMP, "admin-cockpit", "steuer-calc.js"));
const S = require(path.join(TMP, "admin-cockpit", "steuer-calc.js"));

// ── Dateispeicher statt Postgres: fin_obj und fin_meta als JSON-Dateien ──
let nStore = 0;
function fileFin(seed) {
  const dir = path.join(TMP, "store" + (++nStore)); fs.mkdirSync(dir);
  const OBJ = path.join(dir, "fin_obj.json"), META = path.join(dir, "fin_meta.json");
  const rd = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return {}; } };
  const wr = (f, o) => fs.writeFileSync(f, JSON.stringify(o));
  const o0 = {}; seed.forEach(([type, data]) => { o0[type + "|" + data.id] = { type, id: String(data.id), data }; }); wr(OBJ, o0); wr(META, {});
  return {
    dir, init: async () => true,
    db: () => ({ query: async (sql, args) => {
      const o = rd(OBJ);
      if (/^select type, id, data from fin_obj/.test(sql)) return { rows: Object.values(o) };
      if (/^insert into fin_obj/.test(sql)) { o[args[0] + "|" + args[1]] = { type: args[0], id: String(args[1]), data: JSON.parse(args[2]) }; wr(OBJ, o); return { rowCount: 1 }; }
      if (/^delete from fin_obj where type=\$1 and id=\$2/.test(sql)) { delete o[args[0] + "|" + args[1]]; wr(OBJ, o); return { rowCount: 1 }; }
      if (/^delete from fin_obj where type='InvoicePos'/.test(sql)) { delete o["InvoicePos|" + args[0]]; wr(OBJ, o); return { rowCount: 1 }; }
      return { rows: [], rowCount: 0 };
    } }),
    getMeta: async k => { const m = rd(META); return k in m ? m[k] : null; },
    setMeta: async (k, v) => { const m = rd(META); m[k] = JSON.parse(JSON.stringify(v)); wr(META, m); },
    putFileRaw: async () => {}, getFile: async () => null,
    objCount: type => Object.values(rd(OBJ)).filter(x => x.type === type).length,
  };
}
const TODAY = "2026-10-28";
function setup(seed, opt) {
  opt = opt || {};
  const fin = fileFin(seed);
  const L = require(path.join(TMP, "fin-local.js"))({ fin, renderPdf: async () => Buffer.from("%PDF"), mailSend: async () => ({}) });
  let R = null;
  const notified = [];
  // opt.reported: gemeldete Zeiträume wie server.js steuerReportedPeriods ([{from,to}] oder Funktion) – ohne Angabe gilt die Vorquartal-Grenze
  const rep = opt.reported === undefined ? undefined : () => (typeof opt.reported === "function" ? opt.reported() : opt.reported);
  const P = require(path.join(TMP, "fin-proposals.js"))({ L, getMeta: fin.getMeta, setMeta: fin.setMeta, rules: () => R, autoPay: opt.autoPay !== false, today: () => TODAY, notifyAuto: async l => { notified.push.apply(notified, l); }, reportedPeriods: rep });
  R = require(path.join(TMP, "fin-bankrules.js"))({ L, P: () => P, getMeta: fin.getMeta, setMeta: fin.setMeta });
  L.setProposer(P);
  const M = require(path.join(TMP, "fin-mollie.js"))({ L, P: () => P, today: () => TODAY });
  ["mollie-match", "mollie-fee", "mollie-payout", "mollie-income", "mollie-credit"].forEach(k => P.register(k, { exec: it => M.accept(k, it.payload) }));
  P.register("transfer", { exec: it => L.pairApply(it.payload.aId, it.payload.bId) });
  // wie server.js
  P.register("refund-pair", { exec: it => L.refundPairApply(it.payload.aId, it.payload.bId), valid: it => L.refundValid(it.payload.aId, it.payload.bId) });
  P.register("credit-refund", { exec: it => L.creditRefund(it.payload.creditId, it.payload.txId), valid: it => { const c = L.get("CustomerCredit", it.payload.creditId); return !!c && +c.open > 0.004; } });
  return { fin, L, P, M, R, notified };
}

// ── Bausteine ──
const ref = (t, id) => ({ id: String(id), objectName: t });
const iso = d => d + "T00:00:00+02:00";
const contact = (id, name) => ["Contact", { id: String(id), name }];
const acc = (id, name, extra) => ["CheckAccount", Object.assign({ id: String(id), name, status: "100", type: "online" }, extra || {})];
const AT = [["AccountingType", { id: "26", name: "Einnahmen / Erlöse / Verkäufe 20 %" }], ["AccountingType", { id: "30", name: "Mahngebühren (Schadenersatz)" }], ["AccountingType", { id: "31", name: "Zinserträge" }], ["AccountingType", { id: "40", name: "Nebenkosten des Geldverkehrs" }]];
function inv(id, nr, contactId, gross, o) {
  const net = r2(gross / 1.2), tax = r2(gross - net);
  return [["Invoice", Object.assign({ id: String(id), invoiceNumber: nr, invoiceType: "RE", status: "200", invoiceDate: iso("2026-10-01"), deliveryDate: iso("2026-10-01"), contact: ref("Contact", contactId), sumNet: net.toFixed(2), sumTax: tax.toFixed(2), sumGross: gross.toFixed(2), paidAmount: "0", taxType: "default", taxRule: ref("TaxRule", 1), currency: "EUR" }, o || {})],
    ["InvoicePos", { id: String(id) + "1", invoice: ref("Invoice", id), positionNumber: "0", name: "Leistung", quantity: "1", price: net.toFixed(2), priceNet: net.toFixed(2), taxRate: "20", sumNet: net.toFixed(2), sumTax: tax.toFixed(2), sumGross: gross.toFixed(2) }]];
}
const tx = (id, accId, amount, date, name, purpose, o) => ["CheckAccountTransaction", Object.assign({ id: String(id), checkAccount: ref("CheckAccount", accId), amount: amount.toFixed(2), valueDate: iso(date), entryDate: iso(date), payeePayerName: name, paymtPurpose: purpose, status: "100" }, o || {})];
const logsOf = (L, type, id) => L.all("CheckAccountTransactionLog").filter(l => l.object && l.object.objectName === type && String(l.object.id) === String(id));
const txLogs = (L, id) => L.all("CheckAccountTransactionLog").filter(l => l.checkAccountTransaction && String(l.checkAccountTransaction.id) === String(id));
const book = (L, invId, amount, txId, extra) => L.request("PUT", "/Invoice/" + invId + "/bookAmount", { body: Object.assign({ amount, date: "2026-10-20", checkAccountTransaction: { id: String(txId) } }, extra ? { extra } : {}) });
const balance = (L, accId) => r2(L.all("CheckAccountTransaction").filter(x => x.checkAccount && String(x.checkAccount.id) === String(accId)).reduce((a, x) => a + (+x.amount || 0), 0));

// ── UVA wie server.js steuerRaw → steuer-calc computeUva (Istbesteuerung ab 2026) ──
function rawOf(L) {
  const lines = (t, key, id) => L.all(t).filter(p => p[key] && String(p[key].id) === String(id)).map(p => { const at = p.accountingType && L.get("AccountingType", p.accountingType.id);
    return { rate: +p.taxRate || 0, net: +(p.sumNet != null ? p.sumNet : p.sumNetAccounting) || 0, tax: +(p.sumTax != null ? p.sumTax : p.sumTaxAccounting) || 0, cat: at ? at.name : "", catId: at ? String(at.id) : "", catType: "" }; });
  // wie steuerRaw: Zahlungsprotokoll je Beleg (sevDesk ammountPayed/amountPayed, eigene Buchhaltung amountPaid), Datum = Valuta des Umsatzes;
  // nur übernommen, wenn die Summe zum bezahlten Betrag passt, umgekehrtes Vorzeichen (Zusatzbeleg am Zahlungseingang) gespiegelt
  const day = v => v ? String(v).slice(0, 10) : null;
  const pays = {}; L.all("CheckAccountTransactionLog").forEach(l => { const a = +(l.ammountPayed != null ? l.ammountPayed : (l.amountPayed != null ? l.amountPayed : (l.amountPaid != null ? l.amountPaid : l.amount))) || 0; if (!a || !l.object) return;
    const t = l.checkAccountTransaction && L.get("CheckAccountTransaction", l.checkAccountTransaction.id), date = (t && day(t.valueDate)) || day(l.bookingDate);
    (pays[l.object.objectName + ":" + l.object.id] = pays[l.object.objectName + ":" + l.object.id] || []).push({ date, amount: a }); });
  const paysFor = (k, paid) => { const a = pays[k]; if (!a) return undefined; const s = a.reduce((x, p) => x + p.amount, 0); if (Math.abs(Math.abs(s) - Math.abs(paid)) >= 0.05) return undefined;
    return (Math.abs(paid) > 0.004 && s * paid < 0 ? a.map(p => ({ date: p.date, amount: -p.amount })) : a).sort((x, y) => x.date.localeCompare(y.date)); };
  const invoices = L.all("Invoice").filter(o => o.invoiceType !== "MA").map(o => { const c = o.contact && L.get("Contact", o.contact.id) || {};
    return { id: String(o.id), nr: o.invoiceNumber || "", type: o.invoiceType || "RE", status: +o.status || 0, date: day(o.invoiceDate), delivery: day(o.deliveryDate), deliveryUntil: null, payDate: day(o.payDate), taxType: o.taxType || "default", taxRule: o.taxRule && o.taxRule.id ? String(o.taxRule.id) : "", contact: c.name || "", uid: "", country: "AT",
      net: +o.sumNet || 0, tax: +o.sumTax || 0, gross: +o.sumGross || 0, paid: +o.paidAmount || 0, enshrined: !!o.enshrined, pays: paysFor("Invoice:" + o.id, +o.paidAmount || 0), lines: lines("InvoicePos", "invoice", o.id) }; });
  const vouchers = L.all("Voucher").map(v => ({ id: String(v.id), type: v.voucherType || "VOU", date: day(v.voucherDate), delivery: null, deliveryUntil: null, payDate: day(v.payDate), status: +v.status || 0, cd: v.creditDebit, taxType: v.taxType || "default", taxRule: "", supplier: v.supplierName || "", supplierUid: "", supplierCountry: "AT", desc: v.description || "",
    net: +v.sumNet || 0, tax: +v.sumTax || 0, gross: +v.sumGross || 0, paid: +v.paidAmount || 0, enshrined: !!v.enshrined, pays: paysFor("Voucher:" + v.id, +v.paidAmount || 0), lines: lines("VoucherPos", "voucher", v.id) }));
  return { invoices, vouchers, creditNotes: [], transactions: [] };
}
const stIst = () => ({ docs: {}, uvaManual: {}, mapping: {}, jabInput: {}, uva: {}, trips: {}, settings: { besteuerung: "ist", istAb: "2026-01-01" }, today: TODAY });
const Q4 = { key: "2026-Q4", from: "2026-10-01", to: "2026-12-31" };
const uva = L => { const r = S.computeUva(rawOf(L), stIst(), Q4); const k = z => r.K[z] || { base: 0, tax: 0 }; return { b000: r2(k("000").base), b022: r2(k("022").base), t022: r2(k("022").tax), all: Object.keys(r.K).sort().map(z => z + ":" + r2(r.K[z].base) + "/" + r2(r.K[z].tax)).join(" ") }; };

(async () => {
  // ═══════════ 1. Überzahlung beim Verbuchen: Woher kommt die Differenz? ═══════════
  // Je Fall eine eigene Buchhaltung: Rechnung 100,00 € brutto (83,33 + 16,67 USt), Zahlungseingang 110,00 €
  const one = (extra, amt) => {
    const E = setup([contact(1, "Maria Muster"), acc(5263605, "Erste Bank FS Creative")].concat(AT, inv(501, "RE-3001", 1, 100), [tx(9001, 5263605, amt || 110, "2026-10-20", "Maria Muster", "RE-3001")]));
    return E.L.load().then(async () => { if (extra !== undefined) await book(E.L, 501, amt || 110, 9001, extra); return E; });
  };
  const base = await one(null, 100);   // genau bezahlt → Vergleichswert für die UVA
  const U0 = uva(base.L);
  await t("Vergleich: genau bezahlte Rechnung → KZ 000 = 83,33, KZ 022 = 83,33 / 16,67 (Istbesteuerung)", async () => { near(U0.b000, 83.33, "000"); near(U0.b022, 83.33, "022"); near(U0.t022, 16.67, "022 USt"); });
  for (const [kind, label] of [["fee", "Mahngebühr"], ["interest", "Verzugszinsen"]]) {
    const E = await one({ kind, amount: 10 });
    await t("Überzahlung " + kind + ": Rechnung genau bezahlt, eigener Einnahme-Beleg 0 % „" + label + "“ am selben Umsatz", async () => {
      const i = E.L.get("Invoice", "501"); assert.strictEqual(String(i.status), "1000"); near(i.paidAmount, 100, "Rechnung bezahlt");
      const l = logsOf(E.L, "Invoice", 501); assert.strictEqual(l.length, 1); near(l[0].amountPaid, 100, "Log Rechnung"); assert.strictEqual(l[0].extra.kind, kind);
      const v = E.L.all("Voucher").filter(v => v.origin && String(v.origin.id) === "501"); assert.strictEqual(v.length, 1);
      assert.strictEqual(v[0].creditDebit, "D"); near(v[0].sumGross, 10, "Beleg"); near(v[0].sumTax, 0, "0 % USt"); assert.ok(new RegExp(label + ".*Schadenersatz, nicht umsatzsteuerbar").test(v[0].description), v[0].description);
      const p = E.L.positionsOf("Voucher", v[0].id)[0]; assert.strictEqual(p.taxRate, "0"); assert.strictEqual(p.accountingType.id, kind === "fee" ? "30" : "31");
      const tl = txLogs(E.L, 9001); near(tl.reduce((a, x) => a + (+x.amountPaid || 0), 0), 110, "Umsatz ganz zugeordnet"); assert.strictEqual(E.L.get("CheckAccountTransaction", "9001").status, "200");
    });
    await t("USt " + kind + ": UVA-Kennzahlen unverändert (0 %, nicht steuerbar, nicht in der UVA)", async () => { assert.strictEqual(uva(E.L).all, U0.all); });
  }
  {
    const E = await one({ kind: "tip", amount: 10 });
    await t("Trinkgeld/Aufrundung: Einnahme-Beleg 20 % (10,00 brutto = 8,33 + 1,67), Rechnung genau bezahlt", async () => {
      near(E.L.get("Invoice", "501").paidAmount, 100);
      const v = E.L.all("Voucher").find(v => v.extraKind === "tip"); assert.ok(v); near(v.sumGross, 10); near(v.sumNet, 8.33); near(v.sumTax, 1.67); assert.strictEqual(E.L.positionsOf("Voucher", v.id)[0].taxRate, "20");
      assert.strictEqual(E.L.positionsOf("Voucher", v.id)[0].accountingType.id, "26");
    });
    await t("USt Trinkgeld: KZ 000/022 steigen genau um 8,33 / 1,67, sonst nichts", async () => {
      const u = uva(E.L); near(u.b000, U0.b000 + 8.33, "000", 0.011); near(u.b022, U0.b022 + 8.33, "022", 0.011); near(u.t022, U0.t022 + 1.67, "022 USt", 0.011);   // Rundung je Beleg ±1 Cent
    });
  }
  {
    const E = await one({ kind: "credit", amount: 10 });
    await t("Guthaben/Doppelzahlung: Rechnung genau bezahlt, Guthaben 10,00 am Umsatz (keine Einnahme), UVA unverändert", async () => {
      const i = E.L.get("Invoice", "501"); near(i.paidAmount, 100); near(i.creditOpen, 10);
      const c = E.L.all("CustomerCredit"); assert.strictEqual(c.length, 1); near(c[0].open, 10); assert.strictEqual(c[0].txId, "9001");
      assert.strictEqual(E.L.all("Voucher").length, 0, "kein Beleg"); assert.strictEqual(uva(E.L).all, U0.all);
      near(txLogs(E.L, 9001).reduce((a, x) => a + (+x.amountPaid || 0), 0), 110);
    });
  }
  {
    const E = await one(undefined);   // ohne Auswahl: wie bisher (Überzahlung bleibt an der Rechnung)
    await t("ohne Auswahl wie bisher: Rechnung „überzahlt“ (110 bezahlt)", async () => { await book(E.L, 501, 110, 9001); near(E.L.get("Invoice", "501").paidAmount, 110); });
    await t("… das ergäbe bei Istbesteuerung zu viel USt (Anteil 110/100) – genau deshalb zuordnen", async () => { assert.ok(uva(E.L).t022 > U0.t022 + 1); });
  }
  {
    const E = await one(undefined);
    await t("Prüfungen: keine Überzahlung / falsche Differenz / unbekannte Art → Fehler, nichts gebucht", async () => {
      await assert.rejects(() => book(E.L, 501, 100, 9001, { kind: "fee" }), /Keine Überzahlung/);
      await assert.rejects(() => book(E.L, 501, 110, 9001, { kind: "fee", amount: 12 }), /Differenz hat sich geändert/);
      await assert.rejects(() => book(E.L, 501, 110, 9001, { kind: "xyz" }), /woher die Differenz/);
      assert.strictEqual(E.L.get("CheckAccountTransaction", "9001").status, "100", "Umsatz bleibt offen"); assert.strictEqual(E.L.all("CheckAccountTransactionLog").length, 0);
    });
  }
  // weitere offene Rechnungen desselben Kunden
  {
    const E = setup([contact(3, "Huber KG"), contact(4, "Andere GmbH"), acc(1, "George")].concat(AT, inv(601, "RE-2001", 3, 120), inv(602, "RE-2002", 3, 240), inv(603, "RE-2003", 3, 60), inv(604, "RE-2004", 4, 50), inv(605, "RE-2005", 3, 30),
      [tx(9101, 1, 360, "2026-10-21", "Huber KG", "RE-2001 RE-2002"), tx(9102, 1, 100, "2026-10-21", "Huber KG", "RE-2003 und Rest")]));
    await E.L.load();
    await t("weitere Rechnung: 360 € → RE-2001 (120) + RE-2002 (240), beide bezahlt, ein Umsatz", async () => {
      await book(E.L, 601, 360, 9101, { kind: "invoices", amount: 240, invoices: [{ id: "602" }] });
      assert.strictEqual(String(E.L.get("Invoice", "601").status), "1000"); assert.strictEqual(String(E.L.get("Invoice", "602").status), "1000");
      near(E.L.get("Invoice", "602").paidAmount, 240); assert.strictEqual(txLogs(E.L, 9101).length, 2);
    });
    await t("weitere Rechnung: fremder Kunde bzw. schon bezahlte Rechnung → abgelehnt, nichts gebucht", async () => {
      await assert.rejects(() => book(E.L, 603, 100, 9102, { kind: "invoices", invoices: [{ id: "604" }] }), /anderen Kunden/);
      await assert.rejects(() => book(E.L, 603, 100, 9102, { kind: "invoices", invoices: [{ id: "601" }] }), /nicht offen/);
      assert.strictEqual(E.L.get("CheckAccountTransaction", "9102").status, "100"); assert.strictEqual(txLogs(E.L, 9102).length, 0);
    });
    await t("weitere Rechnung mit Rest: 100 € → RE-2003 (60) + RE-2005 (30), Rest 10 als Guthaben", async () => {
      await book(E.L, 603, 100, 9102, { kind: "invoices", amount: 40, invoices: [{ id: "605" }] });
      assert.strictEqual(String(E.L.get("Invoice", "603").status), "1000"); assert.strictEqual(String(E.L.get("Invoice", "605").status), "1000");
      const c = E.L.all("CustomerCredit"); assert.strictEqual(c.length, 1); near(c[0].open, 10); near(E.L.get("Invoice", "603").creditOpen, 10);
      near(txLogs(E.L, 9102).reduce((a, x) => a + (+x.amountPaid || 0), 0), 100, "Umsatz ganz zugeordnet");
      await E.L.unbook("603", "9102");   // Zahlung lösen: Guthaben und die Aufteilung auf RE-2005 aus diesem Umsatz fallen mit weg (sonst wäre der Umsatz „zugeordnet“, aber 70 € frei)
      assert.strictEqual(E.L.all("CustomerCredit").length, 0); assert.strictEqual(String(E.L.get("Invoice", "603").status), "200"); assert.strictEqual(String(E.L.get("Invoice", "605").status), "200");
      assert.strictEqual(txLogs(E.L, 9102).length, 0, "keine Zuordnung bleibt hängen"); assert.strictEqual(E.L.get("CheckAccountTransaction", "9102").status, "100", "Umsatz wieder ganz offen");
    });
  }

  // ═══════════ 2. RE-1233: bereits verbuchte Überzahlung nachträglich zuordnen (Nachbildung, keine Produktivdaten) ═══════════
  const re1233 = () => setup([contact(70, "boté GmbH"), acc(5263605, "Erste Bank FS Creative")].concat(AT,
    inv(132180705, "RE-1233", 70, 2392.80, { status: "1000", paidAmount: "2815.12", payDate: iso("2026-10-27"), enshrined: "2026-09-30T10:00:00.000Z", invoiceDate: iso("2026-09-30"), deliveryDate: iso("2026-09-30") }),
    [tx(1900935823, 5263605, 2815.12, "2026-10-27", "boté GmbH", "1166/1170/1180/1206/1228/1233", { status: "200" }),
      ["CheckAccountTransactionLog", { id: "77001", object: ref("Invoice", 132180705), checkAccountTransaction: ref("CheckAccountTransaction", 1900935823), amountPaid: "2815.12", bookingDate: iso("2026-10-27"), fromStatus: "200", toStatus: "1000" }]]));
  {
    const E = re1233(); await E.L.load();
    const before = uva(E.L);
    await t("RE-1233 vorher: überzahlt 422,32 (2.815,12 auf 2.392,80) – USt bei Istbesteuerung zu hoch", async () => { const i = E.L.get("Invoice", "132180705"); near(+i.paidAmount - +i.sumGross, 422.32); near(before.t022, 398.80 * 2815.12 / 2392.80, "USt 398,80 × 2815,12/2392,80", 0.05); });
    await t("RE-1233 Mahnspesen 422,32 zuordnen: festgeschriebene Rechnung erlaubt (nur Zahlungszuordnung), Beleg 0 % am Umsatz 1900935823", async () => {
      await assert.rejects(() => E.L.request("PUT", "/Invoice/132180705/resetToOpen"), /Festgeschrieben/, "Gegenprobe: Zahlung lösen über resetToOpen bleibt gesperrt");
      const r = await E.L.reclassOver("132180705", { kind: "fee", amount: 422.32 });
      const i = E.L.get("Invoice", "132180705"); near(i.paidAmount, 2392.80, "bezahlt = brutto"); assert.strictEqual(String(i.status), "1000"); assert.ok(i.enshrined, "bleibt festgeschrieben");
      near(logsOf(E.L, "Invoice", 132180705)[0].amountPaid, 2392.80, "Log gesenkt");
      const v = E.L.get("Voucher", r.objects.made[0].id); assert.ok(/Mahngebühr zu Rechnung RE-1233 – Schadenersatz, nicht umsatzsteuerbar/.test(v.description)); near(v.sumGross, 422.32); near(v.sumTax, 0);
      assert.strictEqual(String(txLogs(E.L, 1900935823).find(l => l.object.objectName === "Voucher").object.id), String(v.id));
      near(txLogs(E.L, 1900935823).reduce((a, x) => a + (+x.amountPaid || 0), 0), 2815.12, "Umsatz weiterhin ganz zugeordnet");
    });
    await t("RE-1233 nachher: USt = 398,80 (Anteil 1,0), Mahnspesen nicht in der UVA", async () => { const u = uva(E.L); near(u.t022, 398.80); near(u.b000, 1994.00); });
    await t("reclassOver: keine Überzahlung mehr → Fehler", async () => { await assert.rejects(() => E.L.reclassOver("132180705", { kind: "fee" }), /Keine Überzahlung/); });
    await t("Dateispeicher: nach Neuladen alles noch da", async () => { await E.L.load(true); near(E.L.get("Invoice", "132180705").paidAmount, 2392.80); assert.strictEqual(E.L.all("Voucher").filter(v => v.dunningFee).length, 1); });
  }
  {
    const E = re1233(); await E.L.load();
    await t("RE-1233 als Guthaben markieren: Rechnung = brutto, Guthaben 422,32 offen, keine Einnahme", async () => {
      await E.L.reclassOver("132180705", { kind: "credit" });
      near(E.L.get("Invoice", "132180705").paidAmount, 2392.80); near(E.L.get("Invoice", "132180705").creditOpen, 422.32); assert.strictEqual(E.L.all("Voucher").length, 0); near(uva(E.L).t022, 398.80);
    });
    await t("Guthaben zurückgezahlt: Ausgang an boté → Vorschlag, Bestätigen ordnet zu, Rückgängig macht es wieder offen", async () => {
      const c0 = E.L.all("CustomerCredit")[0];
      const out = ["CheckAccountTransaction", { id: "1900935900", checkAccount: ref("CheckAccount", 5263605), amount: "-422.32", valueDate: iso("2026-10-30"), entryDate: iso("2026-10-30"), payeePayerName: "Bote GmbH", paymtPurpose: "Rückzahlung Guthaben RE-1233", status: "100" }][1];
      await E.L.save("CheckAccountTransaction", out);
      assert.ok(await E.L.refundScan() >= 1);
      const p = (await E.P.list()).find(x => x.kind === "credit-refund"); assert.ok(p, "Vorschlag „Guthaben zurückgezahlt“"); assert.ok(/boté/.test(p.title));
      await E.P.accept(p.id);
      near(E.L.get("CustomerCredit", c0.id).open, 0); assert.strictEqual(E.L.get("CheckAccountTransaction", "1900935900").status, "200"); near(E.L.get("Invoice", "132180705").creditOpen, 0);
      await E.L.creditRefundUndo("1900935900");
      near(E.L.get("CustomerCredit", c0.id).open, 422.32); assert.strictEqual(E.L.get("CheckAccountTransaction", "1900935900").status, "100");
    });
  }
  {
    const E = re1233(); await E.L.load();
    await t("RE-1233 Trinkgeld: Erlös 20 % aus 422,32 (351,93 + 70,39)", async () => { await E.L.reclassOver("132180705", { kind: "tip" }); const v = E.L.all("Voucher")[0]; near(v.sumNet, 351.93); near(v.sumTax, 70.39); near(uva(E.L).t022, 398.80 + 70.39, "USt", 0.011); });
  }

  // ═══════════ 3. Doppelzahlung + Rückzahlung (Fall Geiger, nachgebildet) ═══════════
  {
    const E = setup([contact(2, "Geiger GmbH & Co. KG"), acc(5263605, "Erste Bank FS Creative")].concat(AT, [
      ["Voucher", { id: "800", voucherType: "VOU", status: "1000", creditDebit: "C", supplierName: "Geiger GmbH & Co. KG", description: "RG 61055596", voucherDate: iso("2026-09-01"), sumNet: "294.32", sumTax: "58.86", sumGross: "353.18", paidAmount: "353.18", payDate: iso("2026-09-08") }],
      tx(1900935700, 5263605, -353.18, "2026-09-08", "Geiger GmbH & Co. KG", "Geiger RG 61055596", { status: "200" }),
      ["CheckAccountTransactionLog", { id: "78001", object: ref("Voucher", 800), checkAccountTransaction: ref("CheckAccountTransaction", 1900935700), amountPaid: "353.18", bookingDate: iso("2026-09-08") }],
      tx(1900935794, 5263605, -353.18, "2026-10-20", "Geiger GmbH & Co. KG", "Rechnung 61055596", { status: "400", transitWith: "erledigt", settledNote: "doppelt", correctedBy: "1900935798", correctionNote: "doppelt übernommen" }),
      tx(1900935798, 5263605, 353.18, "2026-10-20", "Korrektur", "Korrektur: doppelt übernommener Umsatz (2026-10-20, -353.18 €, Umsatz 1900935794)", { status: "400", transitWith: "korrektur", correctionOf: "1900935794" }),
      tx(1900935819, 5263605, 353.18, "2026-10-27", "GEIGER GMBH", "Auszahlung Doppelzahlung RG61055596 von 08.09.2026"),
    ]));
    await E.L.load();
    const bal0 = balance(E.L, 5263605);
    await t("Geiger: Hintergrund-Erkennung → Vorschlag „Doppelzahlung zurückbekommen“ (Bezug = Doppelzahlung mit Korrektur, nicht die echte Abbuchung)", async () => {
      assert.strictEqual(await E.L.refundScan(), 1);
      const p = (await E.P.list()).find(x => x.kind === "refund-pair"); assert.ok(p); assert.ok(/Doppelzahlung zurückbekommen/.test(p.title)); assert.ok(/Korrektur-Umsatz/.test(p.detail));
      assert.strictEqual(E.P._state().items.find(x => x.kind === "refund-pair").payload.aId, "1900935794");
      assert.strictEqual(await E.P.autoBookIncoming().then(l => l.length), 0, "Rückzahlung wird nie automatisch einer Rechnung zugeordnet");
    });
    await t("Geiger: Bestätigen → Korrektur-Umsatz weg, Doppelzahlung + Rückzahlung als Paar (400), Saldo −353,18 (Abweichung weg), Beleg unverändert", async () => {
      const p = (await E.P.list()).find(x => x.kind === "refund-pair"); await E.P.accept(p.id);
      assert.strictEqual(E.L.get("CheckAccountTransaction", "1900935798"), null, "Korrektur-Umsatz entfernt");
      const a = E.L.get("CheckAccountTransaction", "1900935794"), b = E.L.get("CheckAccountTransaction", "1900935819");
      assert.strictEqual(a.status, "400"); assert.strictEqual(b.status, "400"); assert.strictEqual(a.transitWith, "1900935819"); assert.strictEqual(b.transitWith, "1900935794"); assert.ok(!a.correctedBy);
      assert.ok(/Doppelzahlung \+ Rückzahlung/.test(a.transitNote));
      near(balance(E.L, 5263605), bal0 - 353.18, "Saldo"); near(E.L.get("Voucher", "800").paidAmount, 353.18, "Beleg nicht berührt");
      assert.strictEqual(E.L.all("Voucher").length, 1, "kein Aufwand, keine Vorsteuer");
    });
    await t("Geiger: Rückgängig stellt Korrektur-Umsatz und Ausgangslage wieder her", async () => {
      await E.L.refundUndo("1900935819");
      const a = E.L.get("CheckAccountTransaction", "1900935794"); assert.strictEqual(a.correctedBy, "1900935798"); assert.strictEqual(a.status, "400"); assert.strictEqual(a.transitWith, "erledigt");
      assert.ok(E.L.get("CheckAccountTransaction", "1900935798")); assert.strictEqual(E.L.get("CheckAccountTransaction", "1900935819").status, "100"); near(balance(E.L, 5263605), bal0);
    });
  }
  {
    // Variante: Doppelzahlung wurde demselben Beleg zugeordnet (Beleg überbezahlt) → Rückzahlung als Gegenbuchung am Beleg
    const E = setup([acc(1, "George")].concat(AT, [
      ["Voucher", { id: "801", voucherType: "VOU", status: "1000", creditDebit: "C", supplierName: "Hosting AG", description: "RG 7781234", voucherDate: iso("2026-09-01"), sumNet: "41.67", sumTax: "8.33", sumGross: "50.00", paidAmount: "100.00", payDate: iso("2026-09-10") }],
      tx(9201, 1, -50, "2026-09-05", "Hosting AG", "RG 7781234", { status: "200" }), tx(9202, 1, -50, "2026-09-10", "Hosting AG", "RG 7781234", { status: "200" }),
      ["CheckAccountTransactionLog", { id: "79001", object: ref("Voucher", 801), checkAccountTransaction: ref("CheckAccountTransaction", 9201), amountPaid: "50.00", bookingDate: iso("2026-09-05") }],
      ["CheckAccountTransactionLog", { id: "79002", object: ref("Voucher", 801), checkAccountTransaction: ref("CheckAccountTransaction", 9202), amountPaid: "50.00", bookingDate: iso("2026-09-10") }],
      tx(9203, 1, 50, "2026-10-02", "Hosting AG", "Rückerstattung Doppelzahlung 7781234"),
    ]));
    await E.L.load();
    await t("Doppelzahlung am überbezahlten Beleg: Rückzahlung als Gegenbuchung (Beleg wieder genau bezahlt), Rückgängig möglich", async () => {
      assert.strictEqual(await E.L.refundScan(), 1); const p = (await E.P.list()).find(x => x.kind === "refund-pair"); assert.ok(/Gegenbuchung am überbezahlten Beleg/.test(p.detail));
      await E.P.accept(p.id);
      near(E.L.get("Voucher", "801").paidAmount, 50); assert.strictEqual(E.L.get("CheckAccountTransaction", "9203").status, "200");
      near(txLogs(E.L, 9203)[0].amountPaid, -50);
      await E.L.refundUndo("9203"); near(E.L.get("Voucher", "801").paidAmount, 100); assert.strictEqual(E.L.get("CheckAccountTransaction", "9203").status, "100");
    });
  }

  // ═══════════ 4. Zahlungseingänge automatisch verbuchen ═══════════
  {
    const E = setup([contact(10, "Bäckerei Lerch"), contact(11, "Huber KG"), contact(12, "Alpha GmbH"), contact(13, "Beta OG"), contact(14, "Kunde X"), contact(15, "Kunde Y"), acc(1, "George"), acc(2, "Mollie – Blitzdings", { mollieBalance: "bal_1" })].concat(AT,
      inv(701, "RE-4001", 10, 480, { enshrined: "2026-10-01T09:00:00.000Z" }), inv(702, "RE-4002", 11, 99), inv(703, "RE-4003", 14, 150), inv(704, "RE-4004", 15, 150), inv(705, "RE-4005", 14, 100),
      inv(706, "RE-4006", 12, 75), inv(707, "RE-4007", 14, 120), inv(708, "RE-4008", 15, 33), inv(709, "RE-4009", 14, 50, { headText: "Bezahlt online – Mollie tr_abcDEF123" }), inv(710, "RE-4010", 15, 64, { status: "100" }),
      [tx(9301, 1, 480, "2026-10-25", "Baeckerei Lerch", "Rechnung RE-4001 vielen Dank"),
        tx(9302, 1, 99, "2026-10-25", "Huber KG", "Danke"),
        tx(9303, 1, 150, "2026-10-25", "Irgendwer", "Zahlung"),
        tx(9304, 1, 50, "2026-10-25", "Kunde X", "RE-4005 Teilzahlung"),
        tx(9305, 1, 75, "2026-10-25", "Beta OG", "Bestellung"),
        tx(9306, 1, 130, "2026-10-25", "Kunde X", "RE-4007"),
        tx(9307, 1, 33, "2026-10-25", "Kunde Y", "RE-4008"), tx(9308, 1, 33, "2026-10-26", "Kunde Y", "RE-4008 nochmal"),
        tx(9309, 1, 64, "2026-10-25", "Kunde Y", "Druck 64"),
        tx(9310, 1, 480, "2026-10-26", "Simon Felder", "Umbuchung"),
        ["CheckAccountTransaction", { id: "9320", checkAccount: ref("CheckAccount", 2), amount: "48.50", mollieGross: "50.00", mollieFeeAmt: "1.50", molliePayment: "tr_abcDEF123", mollieType: "payment", mollieId: "m1", valueDate: iso("2026-10-20"), payeePayerName: "Kunde X", paymtPurpose: "Zahlung tr_abcDEF123", status: "100" }]]));
    await E.L.load();
    // alter Einnahme-Beleg-Vorschlag zur Mollie-Zahlung (vor der Rechnung entstanden) – darf nach der automatischen Zuordnung nicht bleiben
    await E.P.add({ kind: "mollie-income", key: "minc:9320", txId: "9320", amount: 50, date: "2026-10-20", title: "Einnahme-Beleg 20 % anlegen (keine Rechnung gefunden)", payload: { txId: "9320" } });
    let booked;
    await t("Probelauf (dry): genau die eindeutigen Fälle", async () => {
      const d = await E.P.autoBookIncoming({ dry: true });
      assert.deepStrictEqual(d.map(x => x.nr).sort(), ["RE-4001", "RE-4002"]); assert.strictEqual(E.L.get("CheckAccountTransaction", "9301").status, "100", "dry bucht nichts");
    });
    await t("eindeutig (Nummer im Zweck bzw. einziger Betrag + Name) → automatisch verbucht, Eintrag „Automatisch verbucht“ + Benachrichtigung", async () => {
      booked = await E.P.autoBookIncoming();
      assert.deepStrictEqual(booked.map(x => x.nr).sort(), ["RE-4001", "RE-4002"]);
      assert.strictEqual(String(E.L.get("Invoice", "701").status), "1000"); assert.strictEqual(String(E.L.get("Invoice", "702").status), "1000");
      assert.strictEqual(E.L.get("CheckAccountTransaction", "9301").status, "200"); assert.ok(E.L.get("CheckAccountTransaction", "9301").autoBooked);
      assert.ok(logsOf(E.L, "Invoice", 701)[0].auto, "Log als automatisch markiert");
      const v = await E.P.view(); assert.ok(v.log.some(l => l.auto && /Automatisch verbucht: Zahlung .* → Rechnung RE-4001/.test(l.title)), "Zur Prüfung → Zuletzt erledigt");
      assert.ok(v.auto.some(a => a.nr === "RE-4002"));
      await new Promise(r => setTimeout(r, 3300)); assert.ok(E.notified.some(x => x.nr === "RE-4001"), "Benachrichtigung „Zahlung eingegangen“");
    });
    await t("mehrdeutig / Teilzahlung / anderer Kunde / Überzahlung / zwei Eingänge / Entwurf / eigene Umbuchung → nichts gebucht", async () => {
      ["9303", "9304", "9305", "9306", "9307", "9308", "9309", "9310"].forEach(id => assert.strictEqual(E.L.get("CheckAccountTransaction", id).status, "100", "Umsatz " + id + " bleibt offen"));
      ["703", "704", "705", "706", "707", "708"].forEach(id => assert.strictEqual(String(E.L.get("Invoice", id).status), "200", "Rechnung " + id + " offen"));
      assert.strictEqual(String(E.L.get("Invoice", "710").status), "100", "Druckshop-Entwurf nie automatisch");
      assert.strictEqual((await E.P.autoBookIncoming()).length, 0, "zweiter Lauf: nichts Neues");
    });
    await t("Mollie: exakte Zahlung zur Rechnung (Mollie-ID) → automatisch verbucht inkl. Gebühr, Einnahme-Beleg-Vorschlag verschwindet (kein doppelter Umsatz)", async () => {
      assert.strictEqual(await E.M.autoMatch(E.L.get("CheckAccountTransaction", "9320")), true);
      assert.strictEqual(String(E.L.get("Invoice", "709").status), "1000"); assert.strictEqual(E.L.get("CheckAccountTransaction", "9320").status, "200");
      assert.ok(E.L.all("Voucher").some(v => v.creditDebit === "C" && /Mollie/.test(v.supplierName) && Math.abs(+v.sumGross - 1.5) < 0.005), "Gebühr als Ausgabe");
      assert.ok(!(await E.P.list()).some(x => x.txId === "9320"), "kein offener Vorschlag (mollie-income) mehr zu diesem Umsatz");
      assert.strictEqual(await E.M.autoVouchers(), 0); assert.strictEqual(E.L.all("Voucher").filter(v => v.fromMollie === "9320").length, 0, "kein Einnahme-Beleg");
      assert.ok((await E.P.autoRecent(7)).some(a => a.nr === "RE-4009" && a.source === "Mollie"));
    });
    await t("Rückgängig bei festgeschriebener Rechnung (RE-4001): nur Zahlung gelöst, Umsatz wieder offen, kein erneutes automatisches Verbuchen", async () => {
      await assert.rejects(() => E.L.request("PUT", "/Invoice/701/resetToOpen"), /Festgeschrieben/);
      const a = (await E.P.autoRecent(7)).find(x => x.nr === "RE-4001"); await E.P.autoUndo(a.id);
      const i = E.L.get("Invoice", "701"); assert.strictEqual(String(i.status), "200"); near(i.paidAmount, 0); assert.ok(i.enshrined, "bleibt festgeschrieben"); assert.strictEqual(i.payDate, null);
      assert.strictEqual(E.L.get("CheckAccountTransaction", "9301").status, "100"); assert.ok(!E.L.get("CheckAccountTransaction", "9301").autoBooked);
      assert.strictEqual(E.L.all("PaymentUnlink").length >= 1, true, "protokolliert");
      assert.strictEqual((await E.P.autoBookIncoming()).length, 0, "bleibt danach zur Prüfung");
      await assert.rejects(() => E.P.autoUndo(a.id), /Schon rückgängig/);
      assert.ok((await E.P.view()).log.some(l => l.undo && /Rückgängig: automatische Buchung Rechnung RE-4001/.test(l.title)));
    });
    await t("Mollie rückgängig: Gebühren-Beleg entfernt, Zahlung offen, nächster Abgleich nur noch Vorschlag", async () => {
      const a = (await E.P.autoRecent(7)).find(x => x.nr === "RE-4009"); await E.P.autoUndo(a.id);
      assert.strictEqual(String(E.L.get("Invoice", "709").status), "200"); assert.strictEqual(E.L.get("CheckAccountTransaction", "9320").status, "100");
      assert.ok(!E.L.all("Voucher").some(v => v.origin && String(v.origin.id) === "709"), "Zusatzbeleg weg");
      assert.strictEqual(await E.M.autoMatch(E.L.get("CheckAccountTransaction", "9320")), true);
      assert.strictEqual(E.L.get("CheckAccountTransaction", "9320").status, "100", "nicht wieder automatisch"); assert.ok((await E.P.list()).some(x => x.kind === "mollie-match" && x.txId === "9320"));
    });
    await t("unbook mit Überzahlungs-Belegen: Mahngebühr-Beleg am selben Umsatz wird mit entfernt", async () => {
      await book(E.L, 707, 130, 9306, { kind: "fee", amount: 10 });
      assert.strictEqual(E.L.all("Voucher").filter(v => v.origin && String(v.origin.id) === "707").length, 1);
      await E.L.unbook("707", "9306");
      assert.strictEqual(E.L.all("Voucher").filter(v => v.origin && String(v.origin.id) === "707").length, 0); assert.strictEqual(txLogs(E.L, 9306).length, 0);
      assert.strictEqual(String(E.L.get("Invoice", "707").status), "200"); assert.strictEqual(E.L.get("CheckAccountTransaction", "9306").status, "100");
    });
  }
  {
    const E = setup([contact(14, "Kunde X"), acc(2, "Mollie – Blitzdings", { mollieBalance: "bal_1" })].concat(AT, inv(709, "RE-4009", 14, 50, { headText: "Bezahlt online – Mollie tr_abcDEF123" }),
      [["CheckAccountTransaction", { id: "9320", checkAccount: ref("CheckAccount", 2), amount: "48.50", mollieGross: "50.00", mollieFeeAmt: "1.50", molliePayment: "tr_abcDEF123", mollieType: "payment", mollieId: "m1", valueDate: iso("2026-10-20"), payeePayerName: "Kunde X", paymtPurpose: "Zahlung tr_abcDEF123", status: "100" }]]), { autoPay: false });
    await E.L.load();
    await t("ohne autoPay (Server aus/sevDesk-Betrieb): Mollie-Zuordnung bleibt Vorschlag wie bisher", async () => {
      assert.strictEqual(await E.M.autoMatch(E.L.get("CheckAccountTransaction", "9320")), true);
      assert.strictEqual(E.L.get("CheckAccountTransaction", "9320").status, "100"); assert.ok((await E.P.list()).some(x => x.kind === "mollie-match" && !x.auto));
    });
  }

  // ═══════════ Review 28.10.2026: Gegenproben ═══════════
  {
    const E = setup([contact(20, "Huber Druck GmbH"), contact(21, "Anna Huber"), acc(2, "Mollie – Druckshop", { mollieBalance: "bal_1" })].concat(AT, inv(901, "RE-5001", 20, 29.9),
      inv(902, null, 21, 29.9, { status: "100", invoiceNumber: undefined, headText: "Druckshop (Bestellung D-261027-ab12). Bezahlt online – Mollie tr_PRINT1234." }),
      [["CheckAccountTransaction", { id: "9401", checkAccount: ref("CheckAccount", 2), amount: "29.25", mollieGross: "29.90", mollieFeeAmt: "0.65", molliePayment: "tr_PRINT1234", mollieType: "payment", mollieId: "m9", valueDate: iso("2026-10-27"), payeePayerName: "Anna Huber", paymtPurpose: "tr_PRINT1234", status: "100" }]]));
    await E.L.load();
    await t("Review: Mollie-ID steht im Druckshop-Entwurf → nie automatisch an fremde Rechnung mit gleichem Betrag/ähnlichem Namen", async () => {
      await E.M.autoMatch(E.L.get("CheckAccountTransaction", "9401"));
      assert.strictEqual(String(E.L.get("Invoice", "901").status), "200"); assert.strictEqual(E.L.get("CheckAccountTransaction", "9401").status, "100");
    });
  }
  {
    const E = setup([contact(30, "boté GmbH"), contact(31, "Kunde Z"), contact(32, "Kunde Alt"), acc(1, "George")].concat(AT,
      inv(921, "RE-6001", 30, 240, { status: "1000", paidAmount: "240.00", payDate: iso("2026-10-10") }), inv(922, "RE-6002", 31, 240),
      inv(923, "RE-1233", 30, 180, { status: "1000", paidAmount: "180.00", payDate: iso("2026-10-10") }), inv(924, "RE-123", 32, 180, { invoiceDate: iso("2026-09-01") }),
      [tx(9421, 1, 240, "2026-10-25", "", "RE-6001"), tx(9422, 1, 180, "2026-10-25", "boté GmbH", "Rechnung RE-1233")]));
    await E.L.load();
    await t("Review: Zweck nennt eine schon bezahlte Rechnung (Doppelzahlung) bzw. RE-1233 ≠ RE-123 → nichts automatisch", async () => {
      assert.strictEqual((await E.P.autoBookIncoming()).length, 0);
    });
  }
  {
    const E = setup([contact(1, "Maria Muster"), acc(5, "Bank")].concat(AT, inv(501, "RE-3001", 1, 120, { invoiceDate: iso("2026-09-01"), deliveryDate: iso("2026-09-01") }),
      [tx(9001, 5, 120, "2026-09-20", "Maria Muster", "RE-3001"), tx(9002, 5, 120, "2026-10-20", "Maria Muster", "RE-3001 nochmal"), tx(9003, 5, 110, "2026-10-21", "Maria Muster", "x")]));
    await E.L.load();
    await t("Review: Doppelzahlung als Guthaben zugeordnet → USt wieder im Monat der echten Zahlung (Q3), parallel nur einmal", async () => {
      await E.L.request("PUT", "/Invoice/501/bookAmount", { body: { amount: 120, date: "2026-09-20", checkAccountTransaction: { id: "9001" } } });
      await E.L.request("PUT", "/Invoice/501/bookAmount", { body: { amount: 120, date: "2026-10-20", checkAccountTransaction: { id: "9002" } } });
      const r = await Promise.allSettled([E.L.reclassOver("501", { kind: "credit" }), E.L.reclassOver("501", { kind: "credit" })]);
      assert.deepStrictEqual(r.map(x => x.status).sort(), ["fulfilled", "rejected"]);
      const i = E.L.get("Invoice", "501"); near(i.paidAmount, 120); near(i.creditOpen, 120); assert.strictEqual(String(i.payDate).slice(0, 10), "2026-09-20");
      const q3 = S.computeUva(rawOf(E.L), stIst(), { key: "2026-Q3", from: "2026-07-01", to: "2026-09-30" }); near((q3.K["022"] || {}).tax, 20, "USt Q3");
    });
    await t("Review: zweimal gleichzeitig „Lösen“ → Rechnung genau einmal gelöst (nie negativ bezahlt)", async () => {
      await E.L.unbook("501", "9002").catch(() => {});   // Guthaben-Umsatz zuerst frei (Rechnung bleibt an 9001)
      const r = await Promise.allSettled([E.L.unbook("501", "9001"), E.L.unbook("501", "9001")]);
      assert.deepStrictEqual(r.map(x => x.status).sort(), ["fulfilled", "rejected"]); near(E.L.get("Invoice", "501").paidAmount, 0); assert.strictEqual(String(E.L.get("Invoice", "501").status), "200");
    });
  }

  // ═══════════ Review 2 (28.10.2026): Korrekturen ═══════════
  const Q3 = { key: "2026-Q3", from: "2026-07-01", to: "2026-09-30" };
  // 1. USt nach Zahlungsdatum: eigene Buchhaltung speichert amountPaid – Teilzahlungen werden je Zahlung versteuert (nicht alles am Tag der letzten)
  {
    const E = setup([contact(1, "Maria Muster"), acc(5, "Bank")].concat(AT, inv(551, "RE-3551", 1, 240, { invoiceDate: iso("2026-09-01"), deliveryDate: iso("2026-09-01") }),
      [tx(9551, 5, 120, "2026-09-15", "Maria Muster", "RE-3551 Teil 1"), tx(9552, 5, 120, "2026-10-15", "Maria Muster", "RE-3551 Teil 2")]));
    await E.L.load();
    await t("USt Teilzahlungen: 50 % in Q3, 50 % in Q4 → USt je Zahlungsdatum (amountPaid aus der eigenen Buchhaltung)", async () => {
      await E.L.request("PUT", "/Invoice/551/bookAmount", { body: { amount: 120, date: "2026-09-15", checkAccountTransaction: { id: "9551" } } });
      await E.L.request("PUT", "/Invoice/551/bookAmount", { body: { amount: 120, date: "2026-10-15", checkAccountTransaction: { id: "9552" } } });
      const raw = rawOf(E.L), i = raw.invoices.find(x => x.id === "551");
      assert.strictEqual(String(E.L.get("Invoice", "551").payDate).slice(0, 10), "2026-10-15", "payDate = letzte Zahlung");
      assert.deepStrictEqual((i.pays || []).map(p => p.date + ":" + p.amount), ["2026-09-15:120", "2026-10-15:120"], "Zahlungsprotokoll aus amountPaid");
      const q3 = S.computeUva(raw, stIst(), Q3).K["022"] || {}, q4 = S.computeUva(raw, stIst(), Q4).K["022"] || {};
      near(q3.base, 100, "Q3 Bemessung"); near(q3.tax, 20, "Q3 USt"); near(q4.base, 100, "Q4 Bemessung"); near(q4.tax, 20, "Q4 USt");
    });
    await t("steuerRaw (server.js) liest amountPaid der eigenen Buchhaltung und spiegelt das Vorzeichen von Zusatzbelegen", async () => {
      const src = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
      assert.ok(/l\.amountPaid != null \? l\.amountPaid/.test(src), "amountPaid im Zahlungsprotokoll"); assert.ok(/s \* paid < 0 \?/.test(src), "Vorzeichen gespiegelt");
    });
  }
  // 2. Automatisch nur in nicht gemeldeten Zeiträumen und höchstens 60 Tage alt – auch mit Rechnungsnummer bzw. Mollie-ID
  {
    let REP = [{ from: "2026-01-01", to: "2026-03-31" }, { from: "2026-04-01", to: "2026-06-30" }, { from: "2026-07-01", to: "2026-09-30" }];
    const E = setup([contact(40, "Lerch KG"), contact(41, "Moser OG"), contact(42, "Kunz GmbH"), acc(1, "George"), acc(2, "Mollie – Blitzdings", { mollieBalance: "bal_1" })].concat(AT,
      inv(941, "RE-7001", 40, 300, { invoiceDate: iso("2026-04-01") }), inv(942, "RE-7002", 41, 200, { invoiceDate: iso("2026-08-01") }), inv(944, "RE-7004", 40, 77, { invoiceDate: iso("2026-08-01") }),
      inv(943, "RE-7003", 42, 90, { invoiceDate: iso("2026-05-01"), headText: "Bezahlt online – Mollie tr_OLD12345" }),
      [tx(9441, 1, 300, "2026-05-10", "Lerch KG", "RE-7001"), tx(9442, 1, 200, "2026-09-10", "Moser OG", "RE-7002"), tx(9444, 1, 77, "2026-08-20", "Lerch KG", "RE-7004"),
        ["CheckAccountTransaction", { id: "9443", checkAccount: ref("CheckAccount", 2), amount: "88.50", mollieGross: "90.00", mollieFeeAmt: "1.50", molliePayment: "tr_OLD12345", mollieType: "payment", mollieId: "m43", valueDate: iso("2026-05-12"), payeePayerName: "Kunz GmbH", paymtPurpose: "tr_OLD12345", status: "100" }]]),
      { reported: () => REP });
    await E.L.load();
    await t("gemeldete Quartale (Q1–Q3) bzw. älter als 60 Tage → nichts automatisch, auch mit Rechnungsnummer im Zweck", async () => {
      assert.strictEqual((await E.P.autoBookIncoming()).length, 0);
      ["9441", "9442", "9444"].forEach(id => assert.strictEqual(E.L.get("CheckAccountTransaction", id).status, "100", "Umsatz " + id + " bleibt offen"));
    });
    await t("Mollie-Zahlung mit Mollie-ID aus Q2 → nur Vorschlag „Zur Prüfung“, nicht automatisch", async () => {
      assert.strictEqual(await E.M.autoMatch(E.L.get("CheckAccountTransaction", "9443")), true);
      assert.strictEqual(E.L.get("CheckAccountTransaction", "9443").status, "100"); assert.strictEqual(String(E.L.get("Invoice", "943").status), "200");
      assert.ok((await E.P.list()).some(x => x.kind === "mollie-match" && x.txId === "9443"), "Vorschlag liegt zur Prüfung");
      assert.ok(!(await E.P.autoRecent(7)).some(a => a.txId === "9443"));
    });
    await t("Q3 noch nicht gemeldet: frische Zahlung (48 Tage) automatisch, Q2 und > 60 Tage bleiben zur Prüfung", async () => {
      REP = REP.slice(0, 2);
      const d = await E.P.autoBookIncoming(); assert.deepStrictEqual(d.map(x => x.nr), ["RE-7002"]);
      assert.strictEqual(E.L.get("CheckAccountTransaction", "9441").status, "100"); assert.strictEqual(E.L.get("CheckAccountTransaction", "9444").status, "100");
    });
    await t("gemeldete Zeiträume nicht lesbar → sicherheitshalber nichts automatisch", async () => {
      REP = () => { throw new Error("steuer.json kaputt"); };
      const E2 = setup([contact(41, "Moser OG"), acc(1, "George")].concat(AT, inv(942, "RE-7002", 41, 200), [tx(9442, 1, 200, "2026-10-20", "Moser OG", "RE-7002")]), { reported: () => REP() });
      await E2.L.load(); assert.strictEqual((await E2.P.autoBookIncoming()).length, 0);
    });
  }
  // 3. Nur nach Betrag: positiver Beleg „Zahler = Kunde“ (Name oder IBAN, von der der Kunde schon bezahlt hat) – sonst zur Prüfung
  {
    const IBAN = "AT61 1904 3002 3457 3201";
    const E = setup([contact(50, "Gasthof Sonne"), contact(51, "Bergbahn AG"), acc(1, "George")].concat(AT,
      inv(951, "RE-7101", 50, 111.11), inv(952, "RE-7102", 51, 222.22), inv(954, "RE-7104", 50, 64), inv(953, "RE-7103", 50, 55.5, { status: "1000", paidAmount: "55.50", payDate: iso("2026-09-01") }),
      [tx(9511, 1, 111.11, "2026-10-20", "Maria Unbekannt", "Danke"), tx(9512, 1, 222.22, "2026-10-20", "", "Ueberweisung"),
        tx(9513, 1, 55.5, "2026-09-01", "Sonne", "RE-7103", { status: "200", payeePayerAcctNo: IBAN }), tx(9514, 1, 64, "2026-10-21", "M. Huber", "Rechnung Oktober", { payeePayerAcctNo: IBAN.replace(/\s/g, "") }),
        ["CheckAccountTransactionLog", { id: "95131", object: ref("Invoice", 953), checkAccountTransaction: ref("CheckAccountTransaction", 9513), amountPaid: "55.50", bookingDate: iso("2026-09-01") }]]));
    await E.L.load();
    await t("nur Betrag, unbekannter bzw. fehlender Zahlername → nicht automatisch (bleibt Kandidat zur Prüfung)", async () => {
      const d = await E.P.autoBookIncoming();
      assert.ok(!d.some(x => x.nr === "RE-7101" || x.nr === "RE-7102"), JSON.stringify(d));
      assert.strictEqual(E.L.get("CheckAccountTransaction", "9511").status, "100"); assert.strictEqual(E.L.get("CheckAccountTransaction", "9512").status, "100");
      assert.ok((await E.P.suggestTx("9511")).candidates.some(c => c.type === "invoice" && c.id === "951"), "Rechnung als Kandidat beim Umsatz");
      assert.strictEqual(String(E.L.get("Invoice", "954").status), "1000", "IBAN hat schon eine Rechnung dieses Kunden bezahlt → automatisch");
      assert.ok(/IBAN des Kunden/.test(E.L.get("CheckAccountTransaction", "9514").autoBooked.why));
    });
  }
  // 3b. Gegenprobe: Name passt zum Rechnungskunden UND zu einem anderen Kontakt („Hotel“) → mehrdeutig, bleibt zur Prüfung (Bank und Mollie)
  {
    const E = setup([contact(80, "Hotel Post"), contact(81, "Hotel Sonne"), acc(1, "George"), acc(2, "Mollie – Blitzdings", { mollieBalance: "bal_1" })].concat(AT,
      inv(981, "RE-7401", 80, 200), inv(982, "RE-7402", 80, 140, { invoiceDate: iso("2026-10-18") }),
      [tx(9811, 1, 200, "2026-10-20", "Hotel Sonne GmbH", "Zahlung Oktober"),
        ["CheckAccountTransaction", { id: "9821", checkAccount: ref("CheckAccount", 2), amount: "137.00", mollieGross: "140.00", mollieFeeAmt: "3.00", molliePayment: "tr_hotel1234", mollieType: "payment", mollieId: "m81", valueDate: iso("2026-10-20"), payeePayerName: "Hotel Sonne", paymtPurpose: "tr_hotel1234", status: "100" }]]));
    await E.L.load();
    await t("nur Betrag + Name, Name passt auch zu einem anderen Kontakt → Bank und Mollie nicht automatisch", async () => {
      assert.strictEqual((await E.P.autoBookIncoming()).length, 0); assert.strictEqual(E.L.get("CheckAccountTransaction", "9811").status, "100");
      await E.M.autoMatch(E.L.get("CheckAccountTransaction", "9821"));
      assert.strictEqual(E.L.get("CheckAccountTransaction", "9821").status, "100"); assert.ok((await E.P.list()).some(x => x.kind === "mollie-match" && x.txId === "9821"), "Mollie: nur Vorschlag");
    });
  }
  // 4. Trinkgeld/Aufrundung mit der Steuerbehandlung der Rechnung
  {
    const mk = (id, nr, pos, o) => { const net = r2(pos.reduce((a, p) => a + p[0], 0)), tax = r2(pos.reduce((a, p) => a + p[0] * p[1] / 100, 0));
      return [["Invoice", Object.assign({ id: String(id), invoiceNumber: nr, invoiceType: "RE", status: "200", invoiceDate: iso("2026-10-01"), deliveryDate: iso("2026-10-01"), contact: ref("Contact", 60), sumNet: net.toFixed(2), sumTax: tax.toFixed(2), sumGross: r2(net + tax).toFixed(2), paidAmount: "0", taxType: "default", currency: "EUR" }, o || {})]]
        .concat(pos.map((p, k) => ["InvoicePos", { id: String(id) + "0" + k, invoice: ref("Invoice", id), name: "Leistung", quantity: "1", price: p[0].toFixed(2), taxRate: String(p[1]), sumNet: p[0].toFixed(2), sumTax: r2(p[0] * p[1] / 100).toFixed(2), sumGross: r2(p[0] * (1 + p[1] / 100)).toFixed(2) }])); };
    const E = setup([contact(60, "Client Ltd"), acc(1, "George")].concat(AT, mk(961, "RE-7201", [[100, 0]], { taxRule: ref("TaxRule", 17), taxText: "Reverse Charge – Steuerschuld geht auf den Leistungsempfänger über" }),
      mk(962, "RE-7202", [[100, 10]]), mk(963, "RE-7203", [[100, 20], [100, 10]]),
      [tx(9611, 1, 110, "2026-10-20", "Client Ltd", "RE-7201"), tx(9621, 1, 121, "2026-10-20", "Client Ltd", "RE-7202"), tx(9631, 1, 242, "2026-10-20", "Client Ltd", "RE-7203")]));
    await E.L.load();
    await t("Trinkgeld zu Reverse-Charge-Rechnung (0 %): Beleg 0 %, Steuerregel der Rechnung, keine USt", async () => {
      assert.deepStrictEqual(E.L.tipTax(E.L.get("Invoice", "961")), { rate: 0, mixed: false });
      await book(E.L, 961, 110, 9611, { kind: "tip", amount: 10 });
      const v = E.L.all("Voucher").find(x => x.extraKind === "tip" && String(x.origin.id) === "961"); near(v.sumTax, 0); near(v.sumNet, 10); assert.strictEqual(E.L.positionsOf("Voucher", v.id)[0].taxRate, "0");
      assert.strictEqual(String(v.taxRule.id), "17"); assert.ok(/0 % USt wie die Rechnung/.test(v.description), v.description);
    });
    await t("Trinkgeld zu 10-%-Rechnung: 10 % (11,00 = 10,00 + 1,00)", async () => {
      await book(E.L, 962, 121, 9621, { kind: "tip", amount: 11 });
      const v = E.L.all("Voucher").find(x => x.extraKind === "tip" && String(x.origin.id) === "962"); near(v.sumNet, 10); near(v.sumTax, 1); assert.strictEqual(E.L.positionsOf("Voucher", v.id)[0].taxRate, "10");
    });
    await t("Trinkgeld zu Rechnung mit 20 % und 10 %: Normalsatz 20 %, Beschreibung sagt es dazu", async () => {
      assert.deepStrictEqual(E.L.tipTax(E.L.get("Invoice", "963")), { rate: 20, mixed: true });
      await book(E.L, 963, 242, 9631, { kind: "tip", amount: 12 });
      const v = E.L.all("Voucher").find(x => x.extraKind === "tip" && String(x.origin.id) === "963"); near(v.sumNet, 10); near(v.sumTax, 2); assert.ok(/mehreren Steuersätzen/.test(v.description), v.description);
    });
  }
  // 5. Verzugszinsen: Ertragskonto, nie „Zinsen und ähnliche Aufwendungen“
  {
    const E = setup([contact(1, "Maria Muster"), acc(5, "Bank"), ["AccountingType", { id: "70", name: "Zinsen und ähnliche Aufwendungen" }], ["AccountingType", { id: "71", name: "Sonstige betriebliche Erträge" }]].concat(inv(501, "RE-3001", 1, 100), [tx(9001, 5, 110, "2026-10-20", "Maria Muster", "RE-3001")]));
    await E.L.load();
    await t("Verzugszinsen: Aufwandskonto „Zinsen und ähnliche Aufwendungen“ wird übergangen → sonstige betriebliche Erträge", async () => {
      await book(E.L, 501, 110, 9001, { kind: "interest", amount: 10 });
      const v = E.L.all("Voucher").find(x => x.extraKind === "interest"); assert.strictEqual(E.L.positionsOf("Voucher", v.id)[0].accountingType.id, "71");
    });
  }
  {
    const E = setup([contact(1, "Maria Muster"), acc(5, "Bank"), ["AccountingType", { id: "68", name: "Ertragsteuern" }], ["AccountingType", { id: "70", name: "Zinsen und ähnliche Aufwendungen" }], ["AccountingType", { id: "72", name: "Erlöse 20 %" }]].concat(inv(501, "RE-3001", 1, 100), [tx(9001, 5, 110, "2026-10-20", "Maria Muster", "RE-3001")]));
    await E.L.load();
    await t("Verzugszinsen: weder „Ertragsteuern“ (/ertr/) noch Aufwandskonto – Rückfall Erlöskonto", async () => {
      await book(E.L, 501, 110, 9001, { kind: "interest", amount: 10 });
      const v = E.L.all("Voucher").find(x => x.extraKind === "interest"); assert.strictEqual(E.L.positionsOf("Voucher", v.id)[0].accountingType.id, "72");
    });
  }
  // 6. Überzahlte Mollie-Zahlung: Differenz vom Bruttobetrag, Gebühr als Zahlungsgebühr
  {
    const E = setup([contact(14, "Kunde X"), acc(2, "Mollie – Blitzdings", { mollieBalance: "bal_1" })].concat(AT, inv(971, "RE-7301", 14, 50),
      [["CheckAccountTransaction", { id: "9710", checkAccount: ref("CheckAccount", 2), amount: "58.30", mollieGross: "60.00", mollieFeeAmt: "1.70", molliePayment: "tr_over1234", mollieType: "payment", mollieId: "m71", valueDate: iso("2026-10-20"), payeePayerName: "Kunde X", paymtPurpose: "tr_over1234", status: "100" }]]));
    await E.L.load();
    await t("Mollie überzahlt (brutto 60, netto 58,30, offen 50): Differenz netto (8,30) abgelehnt, nichts gebucht", async () => {
      await assert.rejects(() => book(E.L, 971, 58.30, 9710, { kind: "fee", amount: 8.30 }), /Differenz hat sich geändert \(jetzt 10,00/);
      assert.strictEqual(E.L.get("CheckAccountTransaction", "9710").status, "100"); assert.strictEqual(E.L.all("Voucher").length, 0);
    });
    await t("Mollie überzahlt: Rechnung 50, Mahnspesen 10 (brutto-Differenz), Mollie-Gebühr 1,70 als Ausgabe – Umsatz genau 58,30 zugeordnet; Lösen entfernt alles", async () => {
      await book(E.L, 971, 58.30, 9710, { kind: "fee", amount: 10 });
      const i = E.L.get("Invoice", "971"); assert.strictEqual(String(i.status), "1000"); near(i.paidAmount, 50);
      const fee = E.L.all("Voucher").find(v => v.extraKind === "fee"); near(fee.sumGross, 10); near(fee.sumTax, 0);
      const cost = E.L.all("Voucher").find(v => v.creditDebit === "C"); assert.ok(cost && /Mollie/.test(cost.supplierName)); near(cost.sumGross, 1.70);
      near(txLogs(E.L, 9710).reduce((a, x) => a + (+x.amountPaid || 0), 0), 58.30, "Umsatz genau zugeordnet"); assert.strictEqual(E.L.get("CheckAccountTransaction", "9710").status, "200");
      const u = uva(E.L); near(u.b022, 41.67, "nur die Rechnung in der UVA (KZ 022)"); near(u.t022, 8.33, "USt nur aus der Rechnung – Mahnspesen 0 %, Gebühr ohne Vorsteuer");
      await E.L.unbook("971", "9710");
      assert.strictEqual(E.L.all("Voucher").length, 0, "Mahnspesen- und Gebührenbeleg entfernt"); assert.strictEqual(txLogs(E.L, 9710).length, 0); assert.strictEqual(E.L.get("CheckAccountTransaction", "9710").status, "100");
    });
  }

  console.log(fails.join("\n"));
  console.log("Überzahlung/Auto-Buchung: " + pass + " bestanden, " + fail + " fehlgeschlagen");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
