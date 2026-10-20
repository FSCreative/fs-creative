"use strict";
// „Zur Prüfung“ (fin-proposals.js): automatische Läufe buchen nichts mehr, sie legen Vorschläge ab; accept() bucht genau wie früher.
// Läuft ohne Datenbank: fin-local.js mit einem Speicher-Fake für fin.js.
const assert = require("assert");
const path = require("path");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + ": " + (e && e.message)); } }

function memFin(seed) {
  const meta = {};
  return {
    meta,
    init: async () => true,
    db: () => ({ query: async (sql) => /^select type, id, data from fin_obj/.test(sql) ? { rows: seed.map(([type, data]) => ({ type, id: String(data.id), data })) } : { rows: [], rowCount: 0 } }),
    getMeta: async k => (k in meta ? JSON.parse(JSON.stringify(meta[k])) : null),
    setMeta: async (k, v) => { meta[k] = JSON.parse(JSON.stringify(v)); },
    putFileRaw: async () => {}, getFile: async () => null,
  };
}
const acc = (id, name) => ["CheckAccount", { id, name, status: "100", type: "online" }];
const tx = (id, accId, amount, date, name, purpose) => ["CheckAccountTransaction", { id, checkAccount: { id: accId, objectName: "CheckAccount" }, amount: amount.toFixed(2), valueDate: date + "T00:00:00+02:00", entryDate: date + "T00:00:00+02:00", payeePayerName: name, paymtPurpose: purpose, status: "100" }];

function setup() {
  const fin = memFin([
    acc("1", "George"), acc("2", "PayPal"),
    ["AccountingType", { id: "27", name: "Software", status: "100" }],
    tx("101", "1", -23.5, "2026-10-01", "WORLD4YOU INTERNET SERVICES", "Webhosting Oktober"),
    tx("102", "1", -9.9, "2026-10-02", "Spotify AB", "Abo"),
    tx("103", "1", -40, "2026-10-03", "Max Mustermann", "Miete Garage"),
    ["Invoice", { id: "700", invoiceType: "RE", status: "200", invoiceNumber: "RE-1001", sumGross: "50.00", paidAmount: "0", headText: "Mollie tr_abc123", invoiceDate: "2026-10-01T00:00:00+02:00" }],
    ["CheckAccountTransaction", { id: "104", checkAccount: { id: "2", objectName: "CheckAccount" }, amount: "48.50", mollieGross: "50.00", mollieFeeAmt: "1.50", molliePayment: "tr_abc123", mollieType: "payment", mollieId: "mtx1", valueDate: "2026-10-04T00:00:00+02:00", payeePayerName: "Kunde", paymtPurpose: "Zahlung tr_abc123", status: "100" }],
    ["Voucher", { id: "500", voucherType: "VOU", status: "100", creditDebit: "C", supplierName: "Spotify AB", description: "Abo Oktober", voucherDate: "2026-10-01T00:00:00+02:00", sumGross: "9.90", paidAmount: "0" }],
  ]);
  const L = require(path.join(ROOT, "fin-local.js"))({ fin, renderPdf: async () => ({}), mailSend: async () => ({}) });
  const P = require(path.join(ROOT, "fin-proposals.js"))({ L, getMeta: fin.getMeta, setMeta: fin.setMeta, rules: () => R });
  const R = require(path.join(ROOT, "fin-bankrules.js"))({ L, P: () => P, getMeta: fin.getMeta, setMeta: fin.setMeta });
  L.setProposer(P);
  P.register("rule", { exec: it => R.acceptProposal(it.payload) });
  const M = require(path.join(ROOT, "fin-mollie.js"))({ L, P: () => P });
  ["mollie-match", "mollie-fee", "mollie-payout", "mollie-income"].forEach(k => P.register(k, { exec: it => M.accept(k, it.payload) }));
  P.register("transfer", { exec: it => L.pairApply(it.payload.aId, it.payload.bId) });
  return { fin, L, P, R, M };
}
const logsOf = (L, txId) => L.all("CheckAccountTransactionLog").filter(l => l.checkAccountTransaction && String(l.checkAccountTransaction.id) === String(txId));

(async () => {
  const { fin, L, P, R, M } = setup();
  await L.load();
  await R.handle({ op: "save", rule: { id: "r1", name: "World4You", cond: { name: "world4you" }, act: { type: "beleg", category: "27", rate: 20 } } });
  const vouBefore = L.all("Voucher").length;

  await t("Regel-Lauf (automatisch) bucht nichts, legt einen Vorschlag an", async () => {
    const r = await R.run();
    assert.strictEqual(r.done, 0); assert.strictEqual(r.proposed, 1);
    assert.strictEqual(L.get("CheckAccountTransaction", "101").status, "100");
    assert.strictEqual(L.all("Voucher").length, vouBefore);
    const v = await P.view(); assert.strictEqual(v.count, 1); assert.strictEqual(v.items[0].kind, "rule"); assert.strictEqual(v.items[0].txId, "101");
    assert.ok(fin.meta.proposals && fin.meta.proposals.items.length === 1, "in fin_meta „proposals“ gespeichert");
  });
  await t("zweiter Lauf: kein doppelter Vorschlag (gleicher Schlüssel)", async () => { const r = await R.run(); assert.strictEqual(r.proposed, 0); assert.strictEqual((await P.list()).length, 1); });
  await t("accept() bucht genau wie früher: Beleg angelegt und mit dem Umsatz verknüpft", async () => {
    const id = (await P.list())[0].id; await P.accept(id);
    const t101 = L.get("CheckAccountTransaction", "101"); assert.strictEqual(t101.status, "200");
    assert.strictEqual(L.all("Voucher").length, vouBefore + 1);
    const lg = logsOf(L, "101"); assert.strictEqual(lg.length, 1); const v = L.get("Voucher", lg[0].object.id);
    assert.strictEqual(v.fromRule, "r1"); assert.strictEqual(+v.sumGross, 23.5);
    assert.strictEqual((await P.list()).length, 0, "Vorschlag ist weg"); assert.strictEqual(fin.meta.proposals.log[0].kind, "rule");
  });
  await t("abgelehnte Vorschläge kommen nicht wieder", async () => {
    await R.handle({ op: "save", rule: { id: "r2", name: "Garage privat", cond: { name: "mustermann" }, act: { type: "privat" } } });
    assert.strictEqual((await R.run()).proposed, 1);
    const id = (await P.list())[0].id; await P.reject(id);
    assert.strictEqual((await R.run()).proposed, 0); assert.strictEqual((await P.list()).length, 0);
    assert.strictEqual(L.get("CheckAccountTransaction", "103").status, "100");
  });
  await t("„Jetzt anwenden“ (Klick im Regel-Dialog) wendet sofort an", async () => {
    const r = await R.handle({ op: "apply", id: "r2" }); assert.strictEqual(r.done, 1);
    assert.strictEqual(L.get("CheckAccountTransaction", "103").status, "300");
  });
  await t("Geldtransit beim Import: eindeutig → automatisch gebucht, mehrdeutig → nur Vorschlag", async () => {
    const h = (a, x) => a + ":" + x.date + ":" + x.amount + ":" + x.purpose;
    await L.importBank("2", [{ date: "2026-10-05", amount: -150, name: "PayPal", purpose: "Abbuchung auf Bankkonto" }], h);
    const r = await L.importBank("1", [{ date: "2026-10-06", amount: 150, name: "PayPal Europe", purpose: "Übertrag PayPal" }], h);
    assert.strictEqual(r.paired, 1);
    assert.strictEqual((await P.list()).filter(x => x.kind === "transfer").length, 0);   // eindeutig → schon gebucht
    const pair = L.all("CheckAccountTransaction").filter(x => Math.abs(Math.abs(+x.amount) - 150) < 0.01);
    pair.forEach(x => { assert.strictEqual(x.status, "400"); assert.ok(x.transitWith); });
    // zwei gleich hohe Gegenbuchungen → nicht eindeutig → Vorschlag, erst accept bucht
    await L.importBank("2", [{ date: "2026-10-10", amount: -80, name: "PayPal", purpose: "Abbuchung auf Bankkonto" }], h);
    await L.importBank("1", [{ date: "2026-10-11", amount: 80, name: "PayPal Europe", purpose: "Übertrag PayPal A" }, { date: "2026-10-12", amount: 80, name: "PayPal Europe", purpose: "Übertrag PayPal B" }], h);
    const tr = (await P.list()).filter(x => x.kind === "transfer"); assert.strictEqual(tr.length, 1);
    tr[0].txIds.forEach(id => assert.strictEqual(L.get("CheckAccountTransaction", id).status, "100"));
    await P.accept(tr[0].id);
    tr[0].txIds.forEach(id => { const x = L.get("CheckAccountTransaction", id); assert.strictEqual(x.status, "400"); assert.ok(x.transitWith); });
  });
  await t("veraltete Vorschläge fallen beim Auflisten weg", async () => {
    await P.add({ kind: "rule", key: "test:stale", txId: "102", title: "x", payload: {} });
    assert.strictEqual((await P.list()).length, 1);
    const x = L.get("CheckAccountTransaction", "102"); x.status = "300"; await L.save("CheckAccountTransaction", x);
    assert.strictEqual((await P.list()).length, 0);
    x.status = "100"; await L.save("CheckAccountTransaction", x);
  });
  await t("Mollie: Zahlung → Rechnung nur als Vorschlag, accept bucht (inkl. Gebühr)", async () => {
    const before = L.all("CheckAccountTransactionLog").length;
    assert.strictEqual(await M.autoMatch(L.get("CheckAccountTransaction", "104")), true);
    assert.strictEqual(L.get("CheckAccountTransaction", "104").status, "100"); assert.strictEqual(L.get("Invoice", "700").status, "200");
    assert.strictEqual(L.all("CheckAccountTransactionLog").length, before);
    const m = (await P.list()).find(x => x.kind === "mollie-match"); assert.ok(m); assert.strictEqual(m.invoiceId, "700");
    assert.strictEqual(await M.autoVouchers(), 0, "kein Einnahme-Beleg-Vorschlag, wenn eine Rechnung passt");
    await P.accept(m.id);
    assert.strictEqual(L.get("Invoice", "700").status, "1000"); assert.strictEqual(L.get("CheckAccountTransaction", "104").status, "200");
  });
  await t("Vorschlag beim Öffnen eines Belegs: passender offener Umsatz", async () => {
    const s = await P.suggestVoucher("500"); assert.ok(s.candidates.length >= 1); assert.strictEqual(s.candidates[0].type, "tx"); assert.strictEqual(s.candidates[0].id, "102");
    assert.deepStrictEqual(s.candidates[0].do.body, { txId: "102", op: "voucher", voucherId: "500", confirm: true });
  });
  await t("Vorschlag beim Scannen (suggestFor, noch ohne Beleg-ID): passender offener Umsatz, nichts gebucht", async () => {
    const s = await P.suggestFor({ amount: "9,90", date: "2026-10-01", name: "Spotify AB", credit: true });
    assert.ok(s.candidates.length >= 1, JSON.stringify(s)); const c = s.candidates[0];
    assert.strictEqual(c.type, "tx"); assert.strictEqual(c.id, "102"); assert.ok(c.score >= 60, "hoher Score → im Dialog vorausgewählt: " + c.score);
    assert.strictEqual(c.name, "Spotify AB"); assert.strictEqual(c.date, "2026-10-02");
    assert.deepStrictEqual(c.do.body, { txId: "102", op: "voucher", voucherId: null, confirm: true });
    assert.strictEqual(L.get("CheckAccountTransaction", "102").status, "100", "nur Vorschlag – Umsatz bleibt offen");
    const sv = await P.suggestVoucher("500"), cv = s.candidates[0], vv = sv.candidates.find(x => x.id === "102");
    assert.strictEqual(vv.score, cv.score, "gleiche Bewertung wie suggestVoucher");
    const ab = (await P.suggestFor({ amount: 12.34, date: "2026-10-01", name: "Spotify AB" })).candidates;   // anderer Betrag, gleiches Unternehmen → gezeigt, aber nie vorausgewählt
    assert.ok(ab.length >= 1 && ab.every(x => x.score < 60 && x.reasons.indexOf("Betrag weicht ab") > -1), "anderer Betrag: nur nach Name, unter 60");
    assert.strictEqual((await P.suggestFor({ amount: 12.34, date: "2026-10-01", name: "Unbekannt GmbH" })).candidates.length, 0, "anderer Betrag und anderer Name");
    assert.ok((await P.suggestFor({ amount: "", date: "2026-10-01", name: "Spotify AB" })).candidates.length >= 1, "ohne Betrag nach Name");
    assert.strictEqual((await P.suggestFor({ amount: 9.9, date: "2026-12-20", name: "Spotify AB" })).candidates.length, 0, "Datum zu weit weg");
    assert.strictEqual((await P.suggestFor({ amount: 9.9, date: "2026-10-01", cd: "D" })).candidates.length, 0, "Einnahme statt Ausgabe");
    assert.strictEqual((await P.suggestFor({ amount: 9.9, date: "2026-10-01", name: "Unbekannt" })).candidates.length, 0, "anderer Name im Buchungstext → kein Kandidat");
    const ns = await P.suggestFor({ amount: 9.9, date: "2026-10-01", name: "" }); assert.strictEqual(ns.candidates[0].id, "102"); assert.ok(ns.candidates[0].score <= 55, "ohne Lieferant höchstens 55: " + ns.candidates[0].score);
  });
  await t("Vorschlag beim Öffnen eines Umsatzes: offener Beleg + „wie zuletzt“", async () => {
    const s = await P.suggestTx("102"); assert.ok(s.candidates.some(c => c.type === "voucher" && c.id === "500"), JSON.stringify(s.candidates));
    const h = await L.importBank("1", [{ date: "2026-11-01", amount: -23.5, name: "WORLD4YOU INTERNET SERVICES", purpose: "Webhosting November" }], (a, x) => a + x.date);
    const nid = L.all("CheckAccountTransaction").find(x => /November/.test(x.paymtPurpose)).id; assert.ok(h.added === 1);
    const s2 = await P.suggestTx(nid), like = s2.candidates.find(c => c.type === "like");
    assert.ok(like, JSON.stringify(s2.candidates)); assert.strictEqual(like.do.body.act.category, "27"); assert.strictEqual(+like.do.body.act.rate, 20);
  });
  // Buchungstext statt nur Betrag+Datum (Beispiel aus dem Alltag: A1-Beleg wurde einer WORLD4YOU-Kartenzahlung vorgeschlagen)
  const mkTx = (id, amount, date, name, purpose) => L.save("CheckAccountTransaction", { id, checkAccount: { id: "1", objectName: "CheckAccount" }, amount: amount.toFixed(2), valueDate: date + "T00:00:00+02:00", entryDate: date + "T00:00:00+02:00", payeePayerName: name, paymtPurpose: purpose, status: "100" });
  const mkVou = (id, sup, gross, date, extra) => L.save("Voucher", Object.assign({ id, voucherType: "VOU", status: "100", creditDebit: "C", supplierName: sup, description: "", voucherDate: date + "T00:00:00+02:00", sumGross: gross.toFixed(2), paidAmount: "0" }, extra || {}));
  await mkTx("201", -24, "2026-10-01", "", "E-COMM 24,00 AT K1 01.10. 08:35 WORLD4YOU INTERNET SER LINZ");
  await mkTx("202", -11.99, "2026-10-02", "", "E-COMM 11,99 IE K1 02.10. 10:12 APPLE.COM/BILL HOLLYHILL 372");
  await mkTx("203", -37.5, "2026-10-03", "", "Umsatz");
  await mkTx("204", -61.2, "2026-10-04", "VORARLBERGER LANDES-VERSICHERUNG", "Praemie 4. Quartal");
  await mkVou("601", "A1 Telekom Austria AG", 24, "2026-10-01");
  await mkVou("602", "Apple", 11.99, "2026-10-01");
  await mkVou("603", "Hausverwaltung Muster", 37.5, "2026-10-01");
  await mkVou("604", "Landes-Versicherung", 61.2, "2026-10-01");
  await mkVou("605", "Apple", 11.99, "2026-10-01", { voucherType: "RV" });
  await t("A1-Beleg ↔ Kartenzahlung WORLD4YOU: anderer Händler → kein Kandidat (auch nicht umgekehrt)", async () => {
    assert.ok(!(await P.suggestVoucher("601")).candidates.some(c => c.id === "201"));
    assert.ok(!(await P.suggestTx("201")).candidates.some(c => c.type === "voucher" && c.id === "601"));
    assert.ok(!(await P.suggestFor({ amount: 24, date: "2026-10-01", name: "A1 Telekom Austria AG" })).candidates.some(c => c.id === "201"));
  });
  await t("Apple-Beleg ↔ „APPLE.COM/BILL“: Kandidat mit Score ≥ 60", async () => {
    const c = (await P.suggestVoucher("602")).candidates.find(x => x.id === "202"); assert.ok(c && c.score >= 60, JSON.stringify(c));
    const f = (await P.suggestFor({ amount: 11.99, date: "2026-10-01", name: "Apple" })).candidates[0]; assert.ok(f && f.id === "202" && f.score >= 60);
  });
  await t("Alias: Landes-Versicherung ↔ VORARLBERGER LANDES-VERSICHERUNG", async () => {
    const c = (await P.suggestVoucher("604")).candidates.find(x => x.id === "204"); assert.ok(c && c.score >= 60, JSON.stringify(c));
  });
  await t("Umsatz ohne Namen: nur Betrag+Datum → höchstens 55 (nie vorausgewählt / nie „Zur Prüfung“)", async () => {
    const c = (await P.suggestVoucher("603")).candidates.find(x => x.id === "203"); assert.ok(c && c.score <= 55, JSON.stringify(c));
    const v = (await P.suggestTx("203")).candidates.find(x => x.type === "voucher" && x.id === "603"); assert.ok(v && v.score <= 55, JSON.stringify(v));
  });
  await t("wiederkehrende Vorlage (RV) ist nie ein Kandidat", async () => {
    assert.strictEqual((await P.suggestVoucher("605")).candidates.length, 0);
    assert.ok(!(await P.suggestTx("202")).candidates.some(c => c.id === "605"));
  });
  // Ratenzahlungen: Beleg teilweise bezahlt, Signatur aus den bisher verbundenen Umsätzen
  const mkPaid = async (vid, n, amt, startDate, name, purp) => { for (let i = 0; i < n; i++) { const d = new Date(Date.parse(startDate + "T12:00:00Z")); d.setUTCMonth(d.getUTCMonth() + i); const ds = d.toISOString().slice(0, 10), tid = vid + "-r" + i;
      await L.save("CheckAccountTransaction", { id: tid, checkAccount: { id: "1", objectName: "CheckAccount" }, amount: (-amt).toFixed(2), valueDate: ds + "T00:00:00+02:00", entryDate: ds + "T00:00:00+02:00", payeePayerName: name, paymtPurpose: purp(i), status: "200" });
      await L.save("CheckAccountTransactionLog", { id: "log-" + tid, object: { id: vid, objectName: "Voucher" }, checkAccountTransaction: { id: tid, objectName: "CheckAccountTransaction" }, amountPaid: amt.toFixed(2), bookingDate: ds + "T00:00:00+02:00", fromStatus: "100", toStatus: "750" }); } };
  const AMZ = "AMAZON EU S.A R.L., NIEDERLASSUNG DEUTSCHLAND";
  await mkVou("701", "Amazon", 1158.66, "2025-10-07", { status: "750", paidAmount: (11 * 96.56).toFixed(2) });
  await mkPaid("701", 11, 96.56, "2025-10-04", AMZ, i => "302-1174562-4811534 AMZN-Ratenzahlung " + (i + 1) + "/12");
  await mkTx("711", -96.5, "2026-09-04", AMZ, "302-1174562-4811534 AMZN-Ratenzahlung 12/12");
  await mkTx("712", -96.5, "2026-09-05", AMZ, "305-9999999-1111111 AMZN Mktp DE");   // andere Bestellung
  await mkVou("702", "asgoodasnew", 1921.86, "2025-04-07", { status: "750", paidAmount: (16 * 80.17).toFixed(2), description: "MacBook" });
  await mkPaid("702", 16, 80.17, "2025-05-01", "Simon Leonhard Felder", () => "MacBook Rate");
  await mkTx("721", -80.17, "2026-09-01", "Simon Leonhard Felder", "MacBook Rate");
  await mkTx("722", -80.17, "2026-10-01", "Simon Leonhard Felder", "MacBook Rate");
  await mkTx("723", -80.17, "2026-10-02", "Simon Leonhard Felder", "Sparen");
  await t("Ratenzahlung Amazon: letzte Rate (= Restbetrag 96,50) wird vorgeschlagen, andere Bestellung nicht", async () => {
    const s = await P.suggestVoucher("701"), c = s.candidates.find(x => x.id === "711");
    assert.ok(c && c.score >= 70, JSON.stringify(s.candidates)); assert.ok(/Rate wie bisher \(12\. Rate\)/.test(c.reasons.join(" ")), c.reasons.join(" "));
    assert.ok(!s.candidates.some(x => x.id === "712"), "andere Bestellnummer");
    assert.ok((await P.suggestTx("711")).candidates.some(x => x.type === "voucher" && x.id === "701" && x.score >= 70));
  });
  await t("Ratenzahlung MacBook (eigener Name als Empfänger): beide offenen Raten vorgeschlagen, Teilzahlung bucht nur die Rate", async () => {
    const s = await P.suggestVoucher("702"), ids = s.candidates.filter(x => x.score >= 70).map(x => x.id);
    assert.ok(ids.indexOf("721") > -1 && ids.indexOf("722") > -1, JSON.stringify(s.candidates)); assert.ok(!s.candidates.some(x => x.id === "723"), "anderer Zweck");
    const c = s.candidates.find(x => x.id === "721"); assert.ok(/17\. Rate/.test(c.reasons.join(" ")));
    const v0 = +L.get("Voucher", "702").paidAmount;
    await L.request("PUT", "/Voucher/702/bookAmount", { body: { amount: 80.17, date: "2026-09-01", type: "N", checkAccount: { id: "1" }, checkAccountTransaction: { id: "721" } } });   // wie bank-op „voucher“: bucht den Umsatzbetrag als Teilzahlung
    const v = L.get("Voucher", "702"); assert.strictEqual(+v.paidAmount, Math.round((v0 + 80.17) * 100) / 100); assert.strictEqual(String(v.status), "750", "Teilzahlung → weiter teilbezahlt");
    const s2 = await P.suggestVoucher("702"); assert.ok(s2.candidates.some(x => x.id === "722" && x.score >= 70 && /18\. Rate/.test(x.reasons.join(" "))), JSON.stringify(s2.candidates));
  });
  // Mollie Connect ab 10/2026: Sammelrechnung „kochdu Online-Provisionen MM/JJJJ (Mollie Connect)“ aus fs-order (Entwurf, Bruttopreise)
  // → nach Monatsende fertigstellen und jede Provision des Monats automatisch zuordnen; Differenz als Hinweis auf der Mollie-Karte
  const feeTx = (id, amount, date) => L.save("CheckAccountTransaction", { id, checkAccount: { id: "2", objectName: "CheckAccount" }, amount: amount.toFixed(2), valueDate: date + "T00:00:00+02:00", entryDate: date + "T00:00:00+02:00", payeePayerName: "Mollie B.V.", paymtPurpose: "Provision (Mollie Connect) kochdu tr_x" + id, mollieId: "fee" + id, mollieType: "application-fee", mollieProfile: "kochdu", status: "100" });
  await feeTx("801", 5.00, "2026-10-03"); await feeTx("802", 4.03, "2026-10-14"); await feeTx("803", 6.63, "2026-10-20"); await feeTx("804", 1.00, "2026-10-31");   // 804: nicht auf der Rechnung (z. B. Mitternacht/Rückerstattung)
  await feeTx("805", 2.50, "2099-01-10");   // Monat noch offen
  await L.save("Invoice", { id: "880", invoiceType: "RE", status: "200", invoiceNumber: "RE-1260", header: "kochdu Provisionen 10/2026", sumGross: "50.00", paidAmount: "0", invoiceDate: "2026-10-01T00:00:00+02:00" });   // alte Sammelrechnung (alte Form, darf nichts abbekommen)
  await t("Online-Provisionen: Bruttopreis-Positionen ergeben cent-genau die Mollie-Summe", async () => {
    const r = await L.request("POST", "/Invoice/Factory/saveInvoice", { body: { invoice: { header: "kochdu Online-Provisionen 10/2026 (Mollie Connect)", status: "100", invoiceType: "RE", contact: { id: "1", objectName: "Contact" } },
      invoicePosSave: [{ name: "Online-Provisionen A – 10/2026", quantity: 1, price: 7.53, priceGross: 9.03, grossPricing: true, taxRate: 20 }, { name: "Online-Provisionen B – 10/2026", quantity: 1, price: 5.53, priceGross: 6.63, grossPricing: true, taxRate: 20 }] } });
    const inv = r.objects.invoice; assert.strictEqual(inv.sumGross, "15.66"); assert.strictEqual(Math.round((+inv.sumNet + +inv.sumTax) * 100), 1566, inv.sumNet + " + " + inv.sumTax);
    assert.strictEqual(String(inv.status), "100");
  });
  const M2 = require(path.join(ROOT, "fin-mollie.js"))({ L, P: () => P, today: () => "2026-11-03" });   // Stichtag nach Monatsende
  await t("Online-Provisionen: nach Monatsende fertiggestellt, alle Provisionen zugeordnet (auch über die Rechnungssumme), alte RE-1260 bleibt unberührt", async () => {
    const M0 = require(path.join(ROOT, "fin-mollie.js"))({ L, P: () => P, today: () => "2026-10-31" });   // Monat noch offen
    await M0.autoVouchers();
    assert.strictEqual(String(L.all("Invoice").find(i => /kochdu Online-Provisionen 10\/2026/.test(i.header)).status), "100", "vor Monatsende bleibt der Entwurf");
    assert.strictEqual(L.get("CheckAccountTransaction", "801").status, "100");
    await M2.autoVouchers();
    const inv = L.all("Invoice").find(i => /kochdu Online-Provisionen 10\/2026/.test(i.header));
    assert.ok(inv.invoiceNumber, "Nummer vergeben"); assert.strictEqual(String(inv.status), "1000");
    ["801", "802", "803", "804"].forEach(id => { assert.strictEqual(L.get("CheckAccountTransaction", id).status, "200", "Provision " + id + " zugeordnet"); assert.strictEqual(logsOf(L, id)[0].object.id, String(inv.id)); });
    assert.strictEqual(+inv.paidAmount, 16.66);
    assert.strictEqual(L.get("CheckAccountTransaction", "805").status, "100", "laufender Monat bleibt offen");
    assert.strictEqual(+L.get("Invoice", "880").paidAmount, 0, "alte Sammelrechnung bekommt keine 10/2026-Provisionen");
    const n = M2.onlineNotices(); assert.strictEqual(n.length, 1, JSON.stringify(n)); assert.ok(/^Differenz Online-Provisionen 10\/2026: 1,00 €/.test(n[0]), n[0]);
    assert.ok(!(await P.list()).some(x => x.kind === "mollie-match" && /Connect-Provision/.test(x.title)), "keine offenen Vorschläge übrig");
    const a2 = L.get("CheckAccount", "2"); a2.mollieBalance = "bal_test"; await L.save("CheckAccount", a2);
    assert.strictEqual((M2.summary().find(a => String(a.id) === "2") || { notices: [] }).notices.length, 1, "Hinweis auf der Mollie-Karte");
  });
  // Fremdgeld: Betrieb vor Mollie Connect (z. B. La Taverna) – einmal per Klick markiert, nachgelieferte Zahlungen/Erstattungen werden automatisch mitmarkiert
  await t("Fremdgeld: nachgelieferte Zahlungen und Erstattungen eines schon markierten Betriebs automatisch markiert, andere Betriebe und Provisionen nicht", async () => {
    const mtx = (id, amount, type, desc, extra) => L.save("CheckAccountTransaction", Object.assign({ id, checkAccount: { id: "2", objectName: "CheckAccount" }, amount: amount.toFixed(2), valueDate: "2026-10-12T00:00:00+02:00", entryDate: "2026-10-12T00:00:00+02:00", payeePayerName: "Gast", paymtPurpose: desc, status: "100", mollieType: type, mollieId: "m" + id }, extra || {}));
    await mtx("901", 20, "payment", "kochdu: La Taverna #10 · tr_a", { mollieDesc: "La Taverna #10", mollieGross: "20.50" });
    await mtx("902", 30, "payment", "kochdu: La Taverna #11 · tr_b", { mollieDesc: "La Taverna #11", mollieGross: "30.80" });
    assert.strictEqual(await M.autoPassthrough(), 0, "ohne Klick nichts automatisch");
    const r = await M.passthrough("La Taverna", "2"); assert.strictEqual(r.count, 2);
    await mtx("903", 40, "payment", "kochdu: La Taverna #90 · tr_c", { mollieDesc: "La Taverna #90", mollieGross: "41.00", valueDate: "2026-10-16T00:00:00+02:00" });
    await mtx("904", -32.6, "refund", "Rückerstattung kochdu: La Taverna #85 tr_d");
    await mtx("905", 25, "payment", "kochdu: AGO #5 · tr_e", { mollieDesc: "AGO #5" });
    await mtx("906", 1.2, "application-fee", "Provision (Mollie Connect) kochdu: La Taverna #91 tr_f", { mollieDesc: "La Taverna #91" });
    await P.add({ kind: "mollie-income", key: "minc:903", txId: "903", amount: 41, date: "2026-10-16", title: "Einnahme-Beleg 20 % anlegen", payload: { txId: "903" } });
    assert.strictEqual(await M.autoPassthrough(), 2);
    assert.strictEqual(L.get("CheckAccountTransaction", "903").passthroughFor, "La Taverna"); assert.strictEqual(String(L.get("CheckAccountTransaction", "903").status), "400");
    assert.strictEqual(L.get("CheckAccountTransaction", "904").passthroughFor, "La Taverna", "Erstattung (ohne mollieDesc) erkannt");
    assert.strictEqual(String(L.get("CheckAccountTransaction", "905").status), "100", "anderer Betrieb bleibt offen");
    assert.strictEqual(String(L.get("CheckAccountTransaction", "906").status), "100", "Provision nicht angefasst");
    assert.ok(!(await P.list()).some(x => x.key === "minc:903"), "Einnahme-Vorschlag fällt weg");
    const g = (M.summary().find(a => String(a.id) === "2").passthrough || []).find(x => x.party === "La Taverna");
    assert.strictEqual(g.count, 4); assert.strictEqual(g.late.count, 2); assert.strictEqual(g.late.net, 7.4);
    assert.strictEqual(await M.autoPassthrough(), 0, "nichts doppelt");
  });
  console.log((fail ? "FEHLER" : "OK") + ": " + pass + " bestanden, " + fail + " fehlgeschlagen");
  fails.forEach(f => console.log(" ✗ " + f));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
