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
  await t("Geldtransit beim Import: nur Vorschlag, accept verknüpft", async () => {
    const h = (a, x) => a + ":" + x.date + ":" + x.amount;
    await L.importBank("2", [{ date: "2026-10-05", amount: -150, name: "PayPal", purpose: "Abbuchung auf Bankkonto" }], h);
    const r = await L.importBank("1", [{ date: "2026-10-06", amount: 150, name: "PayPal Europe", purpose: "Übertrag PayPal" }], h);
    assert.strictEqual(r.paired, 1);
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
  await t("Vorschlag beim Öffnen eines Umsatzes: offener Beleg + „wie zuletzt“", async () => {
    const s = await P.suggestTx("102"); assert.ok(s.candidates.some(c => c.type === "voucher" && c.id === "500"), JSON.stringify(s.candidates));
    const h = await L.importBank("1", [{ date: "2026-11-01", amount: -23.5, name: "WORLD4YOU INTERNET SERVICES", purpose: "Webhosting November" }], (a, x) => a + x.date);
    const nid = L.all("CheckAccountTransaction").find(x => /November/.test(x.paymtPurpose)).id; assert.ok(h.added === 1);
    const s2 = await P.suggestTx(nid), like = s2.candidates.find(c => c.type === "like");
    assert.ok(like, JSON.stringify(s2.candidates)); assert.strictEqual(like.do.body.act.category, "27"); assert.strictEqual(+like.do.body.act.rate, 20);
  });
  console.log((fail ? "FEHLER" : "OK") + ": " + pass + " bestanden, " + fail + " fehlgeschlagen");
  fails.forEach(f => console.log(" ✗ " + f));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
