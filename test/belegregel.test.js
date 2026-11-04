"use strict";
// Steuerliche Regel bei der Beleganlage (Bankumsatz → „Neue Buchung anlegen“, sevdesk-ops.js newVoucher) gegen die eigene Buchhaltung (fin-local.js im Speicher):
// ig. Erwerb / Reverse Charge → Position mit 0 % (netto = brutto, die UVA rechnet 20 %), Vorsteuer normal, Einnahmen ohne Ausgaben-Regel, unbekannte Regel ignoriert.
const assert = require("assert"), path = require("path");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }
function memFin(seed) {
  const meta = {};
  return { meta, init: async () => true,
    db: () => ({ query: async (sql) => /^select type, id, data from fin_obj/.test(sql) ? { rows: seed.map(([type, data]) => ({ type, id: String(data.id), data })) } : { rows: [], rowCount: 0 } }),
    getMeta: async k => (k in meta ? JSON.parse(JSON.stringify(meta[k])) : null), setMeta: async (k, v) => { meta[k] = JSON.parse(JSON.stringify(v)); }, putFileRaw: async () => {}, getFile: async () => null };
}
const tx = (id, amount, name) => ["CheckAccountTransaction", { id, checkAccount: { id: "1", objectName: "CheckAccount" }, amount: amount.toFixed(2), valueDate: "2026-10-10T00:00:00+02:00", entryDate: "2026-10-10T00:00:00+02:00", payeePayerName: name, paymtPurpose: "Rechnung", status: "100" }];
(async () => {
  const fin = memFin([["CheckAccount", { id: "1", name: "George", status: "100", type: "online" }], ["AccountingType", { id: "27", name: "Material", status: "100" }],
    tx("201", -119, "Print.com"), tx("202", -50, "Google Ireland"), tx("203", -120, "A1"), tx("204", 10, "Paketshop"), tx("205", -12, "X"), tx("206", -60, "Tankstelle")]);
  const L = require(path.join(ROOT, "fin-local.js"))({ fin, renderPdf: async () => ({}), mailSend: async () => ({}) });
  await L.load();
  const r2 = n => Math.round(n * 100) / 100;
  const O = require(path.join(ROOT, "sevdesk-ops.js"))({ sev: (m, p, o) => L.request(m, p, o), sevAll: async () => [], sevNum: x => parseFloat(x) || 0, sevDay: x => String(x || "").slice(0, 10), sevName: x => (x && x.name) || "",
    sevDateDE: d => d, sevNet: (g, r) => r2(g / (1 + r / 100)), viennaToday: () => "2026-10-20", sevMeta: async () => ({}), snapshot: async () => ({}), invalidate: () => {}, sevBook: async () => ({}) });
  const book = (txId, taxRate, taxRule) => O.bankOp({ confirm: true, op: "newVoucher", txId, accountingTypeId: "27", taxRate, taxRule, supplierName: "S", description: "D" });
  const vouOf = () => L.all("Voucher").slice(-1)[0];   // zuletzt angelegter Beleg
  const pos = v => L.all("VoucherPos").filter(p => p.voucher && String(p.voucher.id) === String(v.id));
  await t("ig. Erwerb (8): 0 %, netto = brutto, Regel gespeichert", async () => { await book("201", 20, "8"); const v = vouOf(); assert.strictEqual(v.taxRule.id, "8"); assert.ok(!v.reverseCharge); const p = pos(v)[0]; assert.strictEqual(+p.taxRate, 0); assert.strictEqual(+p.sumNet, 119); assert.strictEqual(+v.sumTax, 0); });
  await t("Reverse Charge EU (14): 0 %, als Reverse Charge markiert", async () => { await book("202", 20, "14"); const v = vouOf(); assert.strictEqual(v.taxRule.id, "14"); assert.strictEqual(v.reverseCharge, true); assert.strictEqual(+pos(v)[0].sumNet, 50); });
  await t("Vorsteuer abziehbar (9): Satz bleibt, Vorsteuer 20 €", async () => { await book("203", 20, "9"); const v = vouOf(); assert.strictEqual(v.taxRule.id, "9"); assert.strictEqual(+v.sumTax, 20); assert.strictEqual(+v.sumNet, 100); });
  await t("Einnahme: keine Ausgaben-Regel", async () => { await book("204", 20, "8"); const v = vouOf(); assert.ok(!v.taxRule); assert.strictEqual(v.creditDebit, "D"); assert.strictEqual(+v.sumTax, r2(10 - 10 / 1.2)); });
  await t("Unbekannte Regel wird ignoriert", async () => { await book("205", 20, "99"); const v = vouOf(); assert.ok(!v.taxRule); assert.strictEqual(+v.sumTax, 2); });
  await t("Keine Vorsteuer (10): Regel gespeichert, Satz bleibt", async () => { await book("206", 20, "10"); const v = vouOf(); assert.strictEqual(v.taxRule.id, "10"); assert.strictEqual(+v.sumTax, 10); });
  console.log(fails.join("\n")); console.log("Belegregel: " + pass + " bestanden, " + fail + " fehlgeschlagen");
  process.exit(fail ? 1 : 0);
})();
