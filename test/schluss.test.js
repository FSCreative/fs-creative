"use strict";
// Schlussrechnung (ER) aus sevDesk übernommen und im Cockpit bearbeitet (sevdesk-ops.js invoiceUpdateBody + fin-local.js):
// bleibt Schlussrechnung, Titel bleibt, Rabatt je Position bleibt, Abzug der bezahlten Teilrechnung wird eigene Position (nicht doppelt), Summen stimmen.
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
const pos = (id, inv, n, name, price, qty, extra) => ["InvoicePos", Object.assign({ id, invoice: { id: inv, objectName: "Invoice" }, positionNumber: String(n), name, text: "", price: String(price), quantity: String(qty), taxRate: "20" }, extra || {})];
(async () => {
  const fin = memFin([
    ["Contact", { id: "701", name: "STEINCULT LBD GmbH" }], ["Order", { id: "801", orderNumber: "AN-1035", status: "1000" }],
    ["Invoice", { id: "901", invoiceNumber: "RE-1139", invoiceType: "TR", status: "1000", invoiceDate: "2026-03-25T00:00:00+01:00", sumNet: "1128.40", sumTax: "225.68", sumGross: "1354.08", origin: { id: "801", objectName: "Order" }, contact: { id: "701", objectName: "Contact" } }],
    pos("9011", "901", 0, "20% Teilrechnung aus Angebot AN-1035", 1128.4, 1, { sumNet: "1128.40" }),
    ["Invoice", { id: "902", invoiceNumber: "RE-1235", invoiceType: "ER", status: "100", header: "Schlussrechnung Nr. RE-1235 aus Angebot AN-1035", invoiceDate: "2026-08-24T00:00:00+02:00", sumNet: "4338.60", sumTax: "867.72", sumGross: "5206.32", origin: { id: "801", objectName: "Order" }, contact: { id: "701", objectName: "Contact" } }],
    pos("9021", "902", 0, "Websiteerstellung Business", 2500, 1, { discount: "15" }), pos("9022", "902", 1, "Website Hosting", 360, 1), pos("9023", "902", 2, "Shirts", 7.6, 60),
    pos("9024", "902", 3, "Folierung", 1500, 1, { text: "für alle Autos inkl. Anfahrt inkl. Folien inkl. Montage Preis lt. Angebot bei 1.300 + 200 € für die neuen 2 Autos" }),
  ]);
  const L = require(path.join(ROOT, "fin-local.js"))({ fin, renderPdf: async () => ({}), mailSend: async () => ({}) });
  await L.load();
  const r2 = n => Math.round(n * 100) / 100, sevNum = x => parseFloat(x) || 0;
  const snapshot = async () => ({ invoices: L.all("Invoice").map(o => ({ id: String(o.id), nr: o.invoiceNumber || "", type: o.invoiceType, status: +o.status, date: String(o.invoiceDate || "").slice(0, 10), origin: o.origin ? String(o.origin.id) : "", cancelled: !!o.cancelled })) });
  const O = require(path.join(ROOT, "sevdesk-ops.js"))({ sev: (m, p, o) => L.request(m, p, o), sevAll: async () => [], sevNum, sevDay: x => String(x || "").slice(0, 10), sevName: x => (x && x.name) || "",
    sevDateDE: d => d, sevNet: (g, r) => r2(g / (1 + r / 100)), viennaToday: () => "2026-10-20", sevMeta: async () => ({}), snapshot, invalidate: () => {}, sevBook: async () => ({}) });
  // wie server.js sevCreateInvoice: Positionen aus dem Formular (brutto) → Body, dann invoiceUpdateBody
  const save = async (items) => {
    const body = { invoice: { header: "Rechnung", invoiceType: "RE", status: 100, contact: { id: "701", objectName: "Contact" } }, invoicePosDelete: null,
      invoicePosSave: items.map((i, k) => Object.assign({ positionNumber: k, quantity: i.qty, price: r2(i.priceGross / 1.2), name: i.name, text: i.text || "", taxRate: 20 }, i.discount ? { discount: i.discount } : {})) };
    await O.invoiceUpdateBody({ id: "902" }, body); await L.request("POST", "/Invoice/Factory/saveInvoice", { body }); return O.invoiceDetail("902");
  };
  let d0;
  await t("Detail zeigt Rabatt und rabattierte Summe", async () => { d0 = await O.invoiceDetail("902"); const w = d0.positions.find(p => /Website/.test(p.name)); assert.strictEqual(w.discount, 15); assert.strictEqual(w.sumGross, 2550); });
  await t("Folierung 2.000 €, Satz weg: bleibt Schlussrechnung, Titel bleibt, Rabatt bleibt, Teilrechnung abgezogen", async () => {
    const items = d0.positions.map(p => ({ name: p.name, text: p.text, qty: p.qty, priceGross: p.priceGross, taxRate: p.taxRate, discount: p.discount }));
    const f = items.find(i => i.name === "Folierung"); f.priceGross = 2400; f.text = "für alle Autos inkl. Anfahrt inkl. Folien inkl. Montage";
    const d = await save(items);
    assert.strictEqual(d.type, "ER"); assert.strictEqual(d.header, "Schlussrechnung Nr. RE-1235 aus Angebot AN-1035");
    const ab = d.positions.filter(p => /^abzüglich Teilrechnung RE-1139 vom 25\.03\.2026$/.test(p.name)); assert.strictEqual(ab.length, 1, JSON.stringify(d.positions.map(p => p.name)));
    assert.strictEqual(ab[0].priceNet, -1128.4);
    assert.strictEqual(d.net, r2(2125 + 360 + 456 + 2000 - 1128.4)); assert.strictEqual(d.gross, r2(d.net * 1.2));
    assert.strictEqual(d.positions.find(p => /Website/.test(p.name)).discount, 15);
    assert.ok(!/Preis lt\. Angebot/.test(d.positions.find(p => p.name === "Folierung").text));
  });
  await t("Nochmal speichern: Abzug nicht doppelt", async () => {
    const d1 = await O.invoiceDetail("902"); const items = d1.positions.map(p => ({ name: p.name, text: p.text, qty: p.qty, priceGross: p.priceGross, taxRate: p.taxRate, discount: p.discount }));
    const d = await save(items); assert.strictEqual(d.positions.filter(p => /^abzüglich/.test(p.name)).length, 1); assert.strictEqual(d.net, d1.net);
  });
  console.log(fails.join("\n")); console.log("Schlussrechnung: " + pass + " bestanden, " + fail + " fehlgeschlagen");
  process.exit(fail ? 1 : 0);
})();
