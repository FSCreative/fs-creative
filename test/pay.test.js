// Zahlungsaufträge (fin-pay.js): Prüfung, QR, SEPA-Datei, Freigabe über die (simulierte) Bank, Abgleich mit Kontoumsätzen.
// Keine echten Bankaufrufe – Enable Banking ist hier eine Attrappe.
"use strict";
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-pay-"));
  const firm = { name: "FS Creative", iban: "AT48 3200 0000 1234 5864", bic: "SPIHAT22" };
  const calls = [], bank = { caps: { ok: true, bank: "Erste Bank und Sparkassen", iban: "AT483200000012345864", psu: "business", refSupported: true, dateSupported: true, remittanceLen: 140 }, status: "ACTC" };
  const ebank = { payCaps: async () => bank.caps, payStart: async (o, redirect, state) => { calls.push({ o, redirect, state }); return { paymentId: "pay" + calls.length, url: "https://bank.example/auth/" + calls.length, status: "RCVD" }; },
    payStatus: async () => ({ status: bank.status, reason: "" }) };
  let TX = [];
  const P = require(path.join(__dirname, "..", "fin-pay.js"))({ DATA_DIR: dir, firm: () => firm, ebank, transactions: async () => TX });
  const T = P._test;

  await t("IBAN-Prüfziffer, Länge je Land", async () => {
    assert.ok(T.ibanOk("AT61 1904 3002 3457 3201")); assert.ok(T.ibanOk("DE89370400440532013000"));
    assert.ok(!T.ibanOk("AT61 1904 3002 3457 3202"), "falsche Prüfziffer"); assert.ok(!T.ibanOk("AT6119043002345732"), "zu kurz"); assert.ok(!T.ibanOk(""));
  });
  let a;
  await t("Erfassen: unvollständig → Entwurf mit Hinweisen; vollständig → bereit; eigenes Konto wird erkannt", async () => {
    const e = P.save({ name: "Muster GmbH", amount: "0" }); assert.strictEqual(e.status, "entwurf"); assert.ok(e.problems.some(p => /IBAN fehlt/.test(p))); assert.ok(e.problems.some(p => /Betrag/.test(p)));
    a = P.save({ name: "Muster GmbH", iban: "at61 1904 3002 3457 3201", amount: "123.45", text: "Rechnung 2026-17", date: "2026-11-02", source: { kind: "mail", mailId: "m1", subject: "Ihre Rechnung" } });
    assert.strictEqual(a.status, "bereit", JSON.stringify(a.problems)); assert.strictEqual(a.iban, "AT611904300234573201"); assert.strictEqual(a.amount, 123.45); assert.strictEqual(a.source.subject, "Ihre Rechnung");
    const own = P.save({ name: "Ich", iban: firm.iban, amount: 5, text: "x" }); assert.ok(own.problems.some(p => /eigenes Konto/.test(p)));
    const both = P.save({ name: "X", iban: "DE89370400440532013000", amount: 5, text: "a", reference: "123" }); assert.ok(both.problems.some(p => /Entweder/.test(p)));
  });
  await t("QR-Code (EPC/GiroCode) mit Empfänger, IBAN, Betrag, Verwendungszweck", async () => {
    const q = await P.qr(a.id); assert.ok(/^<svg/.test(q.svg));
    assert.deepStrictEqual(q.payload.split("\n"), ["BCD", "002", "1", "SCT", "", "Muster GmbH", "AT611904300234573201", "EUR123.45", "", "", "Rechnung 2026-17"]);
    const r = P.save({ name: "Stadtwerke", iban: "DE89370400440532013000", amount: 10, reference: "RF18539007547034" });
    assert.deepStrictEqual((await P.qr(r.id)).payload.split("\n").slice(8), ["", "RF18539007547034"], "Referenz strukturiert, kein Text");
  });
  await t("SEPA-Datei (pain.001.001.03): Auftraggeber = eigene IBAN, Summe, nur gültige", async () => {
    const x = P.sepa([a.id]); assert.strictEqual(x.count, 1); assert.strictEqual(x.sum, 123.45);
    assert.ok(x.xml.indexOf("<DbtrAcct><Id><IBAN>AT483200000012345864</IBAN>") > -1); assert.ok(x.xml.indexOf("<CtrlSum>123.45</CtrlSum>") > -1);
    assert.ok(x.xml.indexOf("<Ustrd>Rechnung 2026-17</Ustrd>") > -1); assert.ok(x.xml.indexOf('<InstdAmt Ccy="EUR">123.45</InstdAmt>') > -1);
    assert.throws(() => P.sepa(["gibtsnicht"]), /Keine gültigen/);
  });
  await t("In George freigeben: Bank bekommt die Daten, Status „bank“; Abbruch in George → wieder bereit; Freigabe → ausgeführt; dann nicht mehr änderbar/löschbar", async () => {
    let r = await P.toBank(a.id, "https://cockpit.example/admin/api/fin/pay/callback");
    assert.strictEqual(r.url, "https://bank.example/auth/1"); assert.strictEqual(calls[0].o.iban, "AT611904300234573201"); assert.strictEqual(calls[0].o.amount, 123.45); assert.ok(/^pay-/.test(calls[0].state));
    let o = T.read().orders.find(x => x.id === a.id); assert.strictEqual(o.status, "bank");
    await assert.rejects(P.toBank(a.id, "x"), /Schon bei der Bank/);
    assert.throws(() => P.save(Object.assign({}, o, { amount: 999 })), /nicht mehr änderbar/);
    o = await P.callback(calls[0].state, "access_denied", "Cancelled by user"); assert.strictEqual(o.status, "bereit");
    r = await P.toBank(a.id, "x"); bank.status = "ACSC";
    o = await P.callback(calls[1].state, "", ""); assert.strictEqual(o.status, "ausgefuehrt");
    assert.throws(() => P.remove(a.id), /Schon bei der Bank/);
  });
  await t("Abgleich: Abbuchung mit gleichem Betrag + IBAN nach Erfassung → bezahlt (nur einmal je Umsatz)", async () => {
    TX = [{ id: "tx1", date: new Date().toISOString().slice(0, 10), amount: -123.45, iban: "AT611904300234573201", name: "MUSTER GMBH", purpose: "Rechnung 2026-17", account: "George" }];
    const l = await P.list(); const o = l.orders.find(x => x.id === a.id); assert.strictEqual(o.status, "bezahlt"); assert.strictEqual(o.paid.txId, "tx1");
    assert.strictEqual(l.bank.ok, true);
    const b2 = P.save({ name: "Muster GmbH", iban: "AT611904300234573201", amount: 123.45, text: "nochmal" });
    const l2 = await P.list(); assert.strictEqual(l2.orders.find(x => x.id === b2.id).status, "bereit", "derselbe Umsatz zählt nicht doppelt");
  });
  await t("Beleg zur Zahlung verknüpfen (aus demselben Anhang angelegt)", async () => {
    const o = P.save({ name: "A1", iban: "AT611904300234573201", amount: 39.9, text: "Rechnung Oktober", source: { kind: "mail", mailId: "m9", index: 0, filename: "Rechnung.pdf" } });
    const l = P.linkVoucher(o.id, "V123"); assert.strictEqual(l.voucherId, "V123"); assert.ok(l.history.some(h => /Beleg angelegt/.test(h.what)));
    assert.strictEqual(T.read().orders.find(x => x.id === o.id).source.filename, "Rechnung.pdf");
    assert.throws(() => P.linkVoucher("gibtsnicht", "V1"), /Nicht gefunden/);
  });
  await t("Manuell bezahlt / zurück, Löschen nur solange nicht bei der Bank", async () => {
    const o = P.save({ name: "Hotel", iban: "DE89370400440532013000", amount: 50, text: "Zimmer" });
    assert.strictEqual(P.setPaid(o.id, true).status, "bezahlt"); assert.strictEqual(P.setPaid(o.id, false).status, "bereit");
    assert.ok(P.remove(o.id)); assert.ok(!T.read().orders.some(x => x.id === o.id));
  });
  await t("Ohne Bank-Freigabe (keine Zahlungen über Enable Banking): Liste zeigt den Grund, QR/SEPA gehen weiter", async () => {
    bank.caps = { ok: false, reason: "nicht freigeschaltet" }; const l = await P.list(); assert.strictEqual(l.bank.ok, false); assert.ok(/freigeschaltet/.test(l.bank.reason));
  });

  console.log(fails.join("\n")); console.log("Zahlungen: " + pass + " bestanden, " + fail + " fehlgeschlagen");
  process.exit(fail ? 1 : 0);
})();
