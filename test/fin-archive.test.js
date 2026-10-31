"use strict";
// Buchhaltungs-Archiv (fin-archive.js): Jahres-ZIP mit PDFs, Belegdateien, Bank-CSV, Listen, Rohdaten und Prüfsummen – gültiges ZIP, nur das gewählte Jahr.
const assert = require("assert"), path = require("path"), crypto = require("crypto"), { Writable } = require("stream");
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }

// ZIP lesen (stored): zentrales Verzeichnis → { name: Buffer }
function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); assert.ok(end > 0, "Endsatz fehlt");
  const n = buf.readUInt16LE(end + 10), cdOff = buf.readUInt32LE(end + 16), out = {}; let p = cdOff;
  for (let i = 0; i < n; i++) {
    assert.strictEqual(buf.readUInt32LE(p), 0x02014b50); const size = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), off = buf.readUInt32LE(p + 42), name = buf.slice(p + 46, p + 46 + nl).toString("utf8");
    assert.strictEqual(buf.readUInt32LE(off), 0x04034b50); const lnl = buf.readUInt16LE(off + 26), data = buf.slice(off + 30 + lnl, off + 30 + lnl + size);
    out[name] = data; p += 46 + nl;
  }
  return out;
}
function fakeRes() {
  const chunks = []; const w = new Writable({ write(c, e, cb) { chunks.push(Buffer.from(c)); cb(); } });
  w.writeHead = (st, h) => { w.status = st; w.headers = h; w.headersSent = true; }; w.body = () => Buffer.concat(chunks); return w;
}

(async () => {
  const objs = {
    Contact: [{ id: "1", name: "Muster GmbH" }], CheckAccount: [{ id: "9", name: "FS Creative" }],
    Invoice: [{ id: "10", invoiceNumber: "RE-1001", invoiceDate: "2025-03-01T00:00:00+01:00", status: "1000", contact: { id: "1" }, sumNet: "100", sumTax: "20", sumGross: "120", paidAmount: "120" },
      { id: "11", invoiceNumber: "RE-1002", invoiceDate: "2025-04-01T00:00:00+02:00", status: "200", contact: { id: "1" }, sumNet: "50", sumTax: "10", sumGross: "60" },
      { id: "12", invoiceDate: "2025-05-01T00:00:00+02:00", status: "100", contact: { id: "1" } },
      { id: "13", invoiceNumber: "RE-0999", invoiceDate: "2024-12-30T00:00:00+01:00", status: "1000", contact: { id: "1" } }],
    InvoicePos: [{ id: "100", invoice: { id: "10" } }, { id: "101", invoice: { id: "13" } }],
    Voucher: [{ id: "20", voucherDate: "2025-02-02T00:00:00+01:00", supplierName: "A1 Telekom", sumGross: "36", sumNet: "30", sumTax: "6", status: "1000", creditDebit: "C", document: { id: "200" } },
      { id: "21", voucherDate: "2025-02-03T00:00:00+01:00", supplierName: "Bank", sumGross: "5", status: "1000", creditDebit: "C" }],
    CheckAccountTransaction: [{ id: "30", valueDate: "2025-03-05T00:00:00+01:00", amount: "120", payeePayerName: "Muster GmbH", paymtPurpose: "RE-1001", checkAccount: { id: "9" } }],
  };
  const files = { "pdf/Invoice/10": Buffer.from("%PDF-1.4 RE-1001"), "doc/Voucher/20": Buffer.from("%PDF-1.4 A1") };
  let generated = 0;
  const local = { load: async () => {}, all: tp => objs[tp] || [], get: (tp, id) => (objs[tp] || []).find(o => String(o.id) === String(id)),
    request: async (m, p) => { generated++; return { buf: Buffer.from("%PDF-1.4 erzeugt " + p) }; } };
  const fin = { getFile: async (k, tp, id) => files[k + "/" + tp + "/" + id] ? { data: files[k + "/" + tp + "/" + id], filename: "x.pdf", mime: "application/pdf" } : null };
  const A = require(path.join(__dirname, "..", "fin-archive.js"))({ fin, local });

  await t("Übersicht: Jahre mit Zählung (Entwürfe nicht als Rechnung)", async () => {
    const y = A.summary(); assert.deepStrictEqual(y.map(x => x.year), ["2025", "2024"]);
    assert.deepStrictEqual([y[0].invoices, y[0].vouchers, y[0].withFile, y[0].bank], [2, 2, 1, 1]);
  });
  await t("ZIP 2025: gültig, PDFs/Beleg/Bank/Listen/Rohdaten/Prüfsummen, nur dieses Jahr, fehlendes PDF wird erzeugt", async () => {
    const res = fakeRes(); await A.handle({}, res, new URL("http://x/admin/api/fin/archive?year=2025"), () => assert.fail("send"));
    assert.strictEqual(res.status, 200); assert.ok(/FS-Creative_Buchhaltung_2025\.zip/.test(res.headers["Content-Disposition"]));
    const z = unzip(res.body()), names = Object.keys(z);
    const has = rx => names.some(n => rx.test(n));
    assert.ok(has(/^Buchhaltung_2025\/Rechnungen\/2025-03-01_RE-1001_Muster GmbH\.pdf$/), names.join("\n"));
    assert.ok(has(/^Buchhaltung_2025\/Rechnungen\/2025-04-01_RE-1002_Muster GmbH\.pdf$/)); assert.strictEqual(generated, 1, "nur RE-1002 neu erzeugt");
    assert.ok(!has(/RE-0999/) && !names.some(n => /Rechnungen\/.*_12/.test(n)), "kein Vorjahr, kein Entwurf");
    assert.ok(has(/^Buchhaltung_2025\/Belege\/2025-02-02_A1 Telekom_36,00 EUR_20\.pdf$/));
    assert.ok(has(/Bank\/FS Creative\.csv$/) && has(/Listen\/Rechnungen\.csv$/) && has(/Listen\/Belege\.csv$/) && has(/Rohdaten\/Invoice\.json$/) && has(/LIESMICH\.txt$/));
    const inv = JSON.parse(z["Buchhaltung_2025/Rohdaten/Invoice.json"]); assert.deepStrictEqual(inv.map(o => o.id), ["10", "11"]);
    assert.deepStrictEqual(JSON.parse(z["Buchhaltung_2025/Rohdaten/InvoicePos.json"]).map(o => o.id), ["100"]);
    const bl = z["Buchhaltung_2025/Listen/Belege.csv"].toString(); assert.ok(/A1 Telekom;;Ausgabe;30,00;6,00;36,00;bezahlt;ja/.test(bl), bl); assert.ok(/Bank;.*;nein/.test(bl));
    const sums = z["Buchhaltung_2025/Pruefsummen.txt"].toString().trim().split("\n");
    sums.forEach(l => { const [h, n] = l.split("  "); assert.strictEqual(crypto.createHash("sha256").update(z["Buchhaltung_2025/" + n]).digest("hex"), h, n); });
    assert.strictEqual(sums.length, names.length - 1);
  });
  await t("Ungültiges Jahr → 400", async () => {
    let st = 0; await A.handle({}, fakeRes(), new URL("http://x/a?year=abc"), (r, s) => { st = s; }); assert.strictEqual(st, 400);
  });

  console.log(fails.join("\n")); console.log((fail ? "FEHLER: " : "OK: ") + pass + " bestanden, " + fail + " fehlgeschlagen");
  process.exit(fail ? 1 : 0);
})();
