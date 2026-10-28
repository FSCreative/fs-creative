/* Plattform-Audit 28.10.2026, Teil B (Kantineur, kochdu, Blitzdings – Cockpit-Seite):
   Abgleich Kantineur (KA-5), Blitzdings-Zuordnung (BD-1/4/6/7/11, Storno/Angebot), Idempotency-Key der fin-api (X8),
   Gutschrift-Vorschläge (KA-2, kochdu doppelt verrechnet) mit der echten fin-local.js, exakte Mollie-Zuordnung über „Mollie tr_…“,
   USt bei Belegen mit negativer Summe (7a) und Gutschriften mit gemischten Vorzeichen (7).
   Aufruf: node test/plattform-b.test.js   (ohne Datenbank: fin-local.js mit Speicher-Fake; server.js nur in einer Temp-Kopie, nie gegen echte Dienste) */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }
const r2 = n => Math.round(n * 100) / 100;

function memFin(seed) {
  const meta = {};
  return { meta, init: async () => true,
    db: () => ({ query: async (sql) => /^select type, id, data from fin_obj/.test(sql) ? { rows: seed.map(([type, data]) => ({ type, id: String(data.id), data })) } : { rows: [], rowCount: 0 } }),
    getMeta: async k => (k in meta ? JSON.parse(JSON.stringify(meta[k])) : null), setMeta: async (k, v) => { meta[k] = JSON.parse(JSON.stringify(v)); },
    putFileRaw: async () => {}, getFile: async () => null };
}
function finSetup(seed, today) {
  const fin = memFin(seed);
  const L = require(path.join(ROOT, "fin-local.js"))({ fin, renderPdf: async () => Buffer.from(""), mailSend: async () => ({}) });
  const P = require(path.join(ROOT, "fin-proposals.js"))({ L, getMeta: fin.getMeta, setMeta: fin.setMeta, autoPay: () => true, today: () => today || "2026-11-20", reportedPeriods: () => [{ from: "2026-01-01", to: "2026-06-30" }] });
  L.setProposer(P);
  const C = require(path.join(ROOT, "fin-credit.js"))({ L, P: () => P, today: () => today || "2026-11-20", reportedPeriods: () => [{ from: "2026-01-01", to: "2026-06-30" }] });
  P.register("invoice-credit", { exec: it => C.exec(Object.assign({}, it.payload, { key: it.key })), valid: it => C.valid(it) });
  const M = require(path.join(ROOT, "fin-mollie.js"))({ L, P: () => P, today: () => today || "2026-11-20" });
  ["mollie-match", "mollie-fee", "mollie-payout", "mollie-income", "mollie-credit"].forEach(k => P.register(k, { exec: it => M.accept(k, it.payload) }));
  return { fin, L, P, C, M };
}
const iso = d => d + "T00:00:00+01:00";
const acc = (id, name) => ["CheckAccount", { id, name, status: "100", type: "online" }];
const contact = (id, name) => ["Contact", { id, name, objectName: "Contact" }];
// Rechnung mit einer Bruttoposition (wie Kantineur nach KA-1: grossPricing, 20 %)
function invSeed(id, o) {
  const g = o.gross, net = r2(g / 1.2), tax = r2(g - net);
  return [["Invoice", Object.assign({ id, objectName: "Invoice", invoiceType: "RE", status: "200", invoiceNumber: "RE-" + id, invoiceDate: iso(o.date || "2026-11-05"), sumNet: String(net), sumTax: String(tax), sumGross: String(g), paidAmount: "0", contact: { id: "40", objectName: "Contact" }, taxType: "default" }, o.extra || {})],
    ["InvoicePos", { id: id + "1", invoice: { id, objectName: "Invoice" }, quantity: "1", price: String(net), priceGross: String(g), grossPricing: true, taxRate: "20", sumNet: String(net), sumTax: String(tax), sumGross: String(g) }]];
}

/* ---------- Teil 1: Rechenkern aus server.js (Temp-Kopie, NODE_ENV=test) ---------- */
function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-platb-"));
  fs.readdirSync(ROOT).filter(f => /\.(js|json|html|css|xml|txt|webmanifest)$/.test(f) && !/^package(-lock)?\.json$/.test(f) && fs.statSync(path.join(ROOT, f)).isFile()).forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  const cpDir = (d) => { if (!fs.existsSync(path.join(ROOT, d))) return; fs.mkdirSync(path.join(dir, d), { recursive: true }); fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => { if (e.isDirectory()) cpDir(path.join(d, e.name)); else fs.copyFileSync(path.join(ROOT, d, e.name), path.join(dir, d, e.name)); }); };
  ["admin-cockpit", "logos"].forEach(cpDir);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}
const STRIP = /^(RAILWAY_|CF_API_TOKEN|ANTHROPIC_|DATABASE_URL|PRINTCOM_|PRINT_MOLLIE|MOLLIE_|EB_|PAYPAL_|FON_|VIW_|WA_|MKT_|GOOGLE_|PEXELS_|SKIKAISER_|HUETTENGAUDI_|VALUERO_|ANTONHAUS_|ALPINAPPART_|FINAPI_|ICLOUD_|SEVDESK_|MAIL_API_|KOCHDU_|KANTINEUR_|BLITZDINGS_|NDA_|LEAD_MAIL)/;

function unitTests(T) {
  const { abgleichBuild, finApiIdem, kantineurV2, notePid } = T;
  const Y = "2026", TODAY = "2026-11-20", out = [];
  const I = (o) => Object.assign({ type: "RE", status: 1000, date: "2026-11-05", due: "2026-11-19", contact: "Kunde", contactId: "1", ref: "", header: "", net: r2((o.gross || 120) / 1.2), gross: 120, paid: 120, open: 0, cancelled: false, overdue: false }, o);
  const mkSev = (all) => { const s = { invoices: all.slice(0, 600) }; Object.defineProperty(s, "invoicesAll", { value: all, enumerable: false }); return s; };
  const build = (o) => abgleichBuild(Object.assign({ year: Y, today: TODAY, bill: { prices: {}, sites: {}, invoices: o.recs || {} }, sitesSnap: null }, o, { sev: mkSev(o.invs || []) }));

  /* ---- Kantineur (KA-5) ---- */
  const kStats = (payments, extra) => Object.assign({ apiVersion: 2, revenueGrossCents: 2907, mrrCents: 969, subscribers: { paying: 1, pastDue: 1 }, payments }, extra || {});
  const pay = (o) => Object.assign({ molliePaymentId: "tr_k1", paidAt: "2026-11-05T09:00:00Z", canteenName: "SV Stainach", grossCents: 969, invoiceId: null, invoiceState: "sent", refundedCents: 0, chargedBackCents: 0 }, o);
  out.push(["Kantineur v2: Rechnungen über invoiceId bzw. „Mollie tr_“ zugeordnet, Summen aus dem Status, fehlende Rechnung gemeldet (totals.missing)", () => {
    const invs = [I({ id: "501", nr: "RE-501", gross: 9.69, paid: 9.69, contact: "SV Stainach", mpid: "tr_k1" }),
      I({ id: "502", nr: "RE-502", gross: 9.69, paid: 0, open: 9.69, status: 200, contact: "SV Stainach", mpid: "tr_k2", overdue: true })];
    const r = build({ invs, kantineur: kStats([pay({ invoiceId: "501" }), pay({ molliePaymentId: "tr_k2", paidAt: "2026-11-06T09:00:00Z" }), pay({ molliePaymentId: "tr_k3", paidAt: "2026-11-07T09:00:00Z", invoiceState: "missing", invoiceError: "Buchhaltung nicht erreichbar" })]) });
    const it = r.items.find(x => x.key === "kantineur");
    assert.strictEqual(it.invoiced, 19.38); assert.strictEqual(it.paid, 9.69); assert.strictEqual(it.open, 9.69); assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.action, null);
    assert.strictEqual(it.missing, 1); assert.strictEqual(it.missingAmount, 9.69);
    assert.ok(it.invoices.some(l => l.state === "fehlt")); assert.strictEqual(r.totals.missing, 1, "zählt in totals.missing");
    assert.ok(it.notes.some(n => n.lvl === "bad" && /Rechnung fehlt/.test(n.text) && /nicht erreichbar/.test(n.text)), JSON.stringify(it.notes));
    assert.ok(!r.unlinked.some(u => u.id === "502"), "offene Kantineur-Rechnung nicht „ohne Zuordnung“");
    assert.ok(/1× Zahlung offen/.test(it.sub), it.sub);
  }]);
  out.push(["Kantineur v2: Summe ≠ eingezogen (KA-1-Rückfall) rot, Entwurf mit Fehlertext sichtbar, Erstattung als Hinweis", () => {
    const invs = [I({ id: "511", nr: "RE-511", gross: 11.63, paid: 0, open: 11.63, status: 200, mpid: "tr_x1" }), I({ id: "512", nr: "", gross: 9.69, paid: 0, open: 0, status: 100, mpid: "tr_x2" }),
      I({ id: "513", nr: "RE-513", gross: 9.69, paid: 9.69, mpid: "tr_x3" })];
    const it = build({ invs, kantineur: kStats([pay({ molliePaymentId: "tr_x1" }), pay({ molliePaymentId: "tr_x2", invoiceState: "unsent", invoiceError: "Die Buchhaltung hat 11,63 statt 9,69 € berechnet" }), pay({ molliePaymentId: "tr_x3", refundedCents: 969 })]) }).items.find(x => x.key === "kantineur");
    assert.ok(it.notes.some(n => n.lvl === "bad" && /11,63/.test(n.text) && n.inv === "511"), "Betrag weicht ab");
    assert.ok(it.notes.some(n => /entwurf/i.test(n.text) && /11,63 statt 9,69/.test(n.text) && n.inv === "512"), "Entwurf mit invoiceError");
    assert.ok(it.notes.some(n => /Erstattung 9,69 €/.test(n.text) && /Zur Prüfung/.test(n.text)), "Erstattung");
  }]);
  out.push(["Kantineur alt (ohne apiVersion): wie bisher verrechnet = bezahlt = Umsatz; „Mollie tr_“-Rechnungen trotzdem nicht ohne Zuordnung", () => {
    const r = build({ invs: [I({ id: "521", gross: 9.69, paid: 0, open: 9.69, status: 200, mpid: "tr_old" })], kantineur: { revenueGrossCents: 969, mrrCents: 969, subscribers: { paying: 1 } } });
    const it = r.items.find(x => x.key === "kantineur");
    assert.strictEqual(it.invoiced, 9.69); assert.strictEqual(it.paid, 9.69); assert.strictEqual(it.open, 0); assert.deepStrictEqual(it.invoices, []);
    assert.ok(!r.unlinked.some(u => u.id === "521"));
    assert.deepStrictEqual(kantineurV2({ revenue: { grossCents: 1 } }), {});
    const v2 = kantineurV2({ apiVersion: 2, revenue: { refundedCents: 100 }, payments: [{ molliePaymentId: "tr_1", grossCents: 969, invoiceId: 7 }], attention: { pastDue: [{ id: "c", name: "X", paidUntil: null }] } });
    assert.strictEqual(v2.payments[0].invoiceId, "7"); assert.strictEqual(v2.refundedCents, 100); assert.strictEqual(v2.attention.pastDue[0].name, "X");
    assert.strictEqual(notePid("Mollie tr_AbC123xyz"), "tr_AbC123xyz"); assert.strictEqual(notePid("tr_abc123 ohne Präfix"), undefined);
  }]);

  /* ---- Blitzdings ---- */
  const bk = (o) => Object.assign({ totalCents: 39900, status: "CONFIRMED", paymentStatus: "UNPAID", eventDate: "2026-11-10", customerEmail: "k@test.at", package: { name: "Mini" } }, o);
  const blitz = (books, invs, recs, extra) => build(Object.assign({ blitzAll: books, invs, recs }, extra || {})).items.filter(x => x.src === "blitzdings");
  out.push(["BD-1: zweite gleich teure Buchung desselben Kunden gilt nicht als verrechnet (Rechnung gehört der ersten), Hinweis „gehört schon zu …“", () => {
    const invs = [I({ id: "601", nr: "RE-601", gross: 399, contact: "Gemeinde Gaschurn", ref: "Buchung BD-AAA111 – danke", date: "2026-11-02" })];
    const items = blitz([bk({ id: "a", reference: "BD-AAA111", customerName: "Gemeinde Gaschurn" }), bk({ id: "b", reference: "BD-BBB222", customerName: "Gemeinde Gaschurn", eventDate: "2026-11-12" })], invs);
    const a = items.find(x => x.key === "blitz:a"), b = items.find(x => x.key === "blitz:b");
    assert.strictEqual(a.unbilled, 0); assert.strictEqual(a.last.id, "601");
    assert.strictEqual(b.unbilled, 399); assert.ok(b.action); assert.ok(b.notes.some(n => /gehört schon zu BD-AAA111/.test(n.text)), JSON.stringify(b.notes));
  }]);
  out.push(["BD-1: alte Vorjahresrechnung desselben Kunden zählt nicht (Zeitfenster), Rechnung mit fremder Buchungsnummer auch nicht", () => {
    const invs = [I({ id: "611", nr: "RE-611", gross: 399, contact: "Hotel Post", date: "2025-12-12" }), I({ id: "612", nr: "RE-612", gross: 399, contact: "Hotel Post", date: "2026-11-01", ref: "Buchung BD-ZZZ999" })];
    const it = blitz([bk({ id: "c", reference: "BD-CCC333", customerName: "Hotel Post" })], invs)[0];
    assert.strictEqual(it.unbilled, 399);
    const ok = blitz([bk({ id: "c", reference: "BD-CCC333", customerName: "Hotel Post" })], [I({ id: "613", nr: "RE-613", gross: 399, contact: "Hotel Post", date: "2026-11-01" })])[0];
    assert.strictEqual(ok.unbilled, 0, "freie Rechnung im Zeitfenster passt weiter (Name + Betrag)");
  }]);
  out.push(["BD-1 (Querschnitt): Rechnung, die schon einer Website zugeordnet ist, zählt nicht als Blitzdings-Rechnung", () => {
    const invs = [I({ id: "621", nr: "RE-621", gross: 120, contact: "Gemeinde Gaschurn", date: "2026-11-01" })];
    const r2b = abgleichBuild({ year: Y, today: TODAY, sev: mkSev(invs), sitesSnap: { railway: { projects: [] }, sites: [{ name: "gaschurn.at", up: true }] },
      bill: { prices: { hosting: 10, hostingPer: "month", period: 12, taxRate: 20, gross: true }, sites: { "cf:gaschurn.at": { active: true, hosting: true, billedUntil: "2026-12-31" } }, invoices: { "site:cf:gaschurn.at": [{ id: "621", nr: "RE-621", date: "2026-11-01", gross: 120, from: "2026-01-01", to: "2026-12-31" }] } },
      blitzAll: [bk({ id: "d", reference: "BD-DDD444", customerName: "Gemeinde Gaschurn", totalCents: 12000 })] });
    assert.strictEqual(r2b.items.find(x => x.key === "site:cf:gaschurn.at").last.id, "621");
    assert.strictEqual(r2b.items.find(x => x.key === "blitz:d").unbilled, 120);
  }]);
  out.push(["BD-11: Firmenbuchung netto (500) ↔ Rechnung brutto 600/netto 500 ohne Buchungsnummer → verrechnet, nicht doppelt offen", () => {
    const it = blitz([bk({ id: "e", reference: "BD-EEE555", customerName: "Anna", companyName: "Hotel Alpenrose", totalCents: 50000 })], [I({ id: "631", nr: "RE-631", gross: 600, net: 500, contact: "Hotel Alpenrose", date: "2026-11-03" })])[0];
    assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.last.id, "631"); assert.strictEqual(it.action, null);
  }]);
  out.push(["BD-6: stornierte Blitzdings-Rechnung + Zuordnung einer Ersatzrechnung (anderer Kunde/Betrag) → verrechnet, Ersatz nicht „ohne Zuordnung“", () => {
    const invs = [I({ id: "641", nr: "RE-641", gross: 399, contact: "Max Muster", cancelled: true, stornoNr: "RE-642" }), I({ id: "643", nr: "RE-643", gross: 449, paid: 0, open: 449, status: 200, contact: "Muster Events GmbH", date: "2026-11-04" })];
    const r = build({ invs, blitzAll: [bk({ id: "f", reference: "BD-FFF666", customerName: "Max Muster", sevdeskInvoiceId: "641" })], recs: { "blitz:f": [{ id: "643", nr: "RE-643", date: "2026-11-04", gross: 449 }] } });
    const it = r.items.find(x => x.key === "blitz:f");
    assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.last.id, "643"); assert.ok(!r.unlinked.some(u => u.id === "643"));
    assert.ok(!it.notes || !it.notes.some(n => /Doppelrechnung/.test(n.text)));
  }]);
  out.push(["BD-7: Betrag nach der Rechnung erhöht → Differenz mit Aktion; mit Differenzrechnung verrechnet; gesenkt → Hinweis „Gutschrift prüfen“", () => {
    const base = I({ id: "651", nr: "RE-651", gross: 399, paid: 0, open: 399, status: 200, contact: "Firma X", date: "2026-11-01" });
    let it = blitz([bk({ id: "g", reference: "BD-GGG777", customerName: "Firma X", sevdeskInvoiceId: "651", totalCents: 44900 })], [base])[0];
    assert.strictEqual(it.unbilled, 50); assert.ok(it.action && it.action.items[0].priceGross === 50 && /Nachverrechnung/.test(it.action.title));
    it = blitz([bk({ id: "g", reference: "BD-GGG777", customerName: "Firma X", sevdeskInvoiceId: "651", totalCents: 44900 })], [base, I({ id: "652", nr: "RE-652", gross: 50, contact: "Firma X", date: "2026-11-15" })], { "blitz:g": [{ id: "652", nr: "RE-652", date: "2026-11-15", gross: 50 }] })[0];
    assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.invoiced, 449); assert.strictEqual(it.action, null);
    it = blitz([bk({ id: "g", reference: "BD-GGG777", customerName: "Firma X", sevdeskInvoiceId: "651", totalCents: 29900 })], [base])[0];
    assert.strictEqual(it.unbilled, 0); assert.ok(it.notes.some(n => /Gutschrift prüfen/.test(n.text)));
  }]);
  out.push(["Doppelrechnung: Blitzdings-Rechnung und Cockpit-Rechnung über den vollen Betrag → rot gemeldet, nichts zu verrechnen", () => {
    const it = blitz([bk({ id: "h", reference: "BD-HHH888", customerName: "Kunde H", sevdeskInvoiceId: "661" })], [I({ id: "661", nr: "RE-661", gross: 399, contact: "Kunde H" }), I({ id: "662", nr: "RE-662", gross: 399, status: 200, paid: 0, open: 399, contact: "Kunde H" })], { "blitz:h": [{ id: "662", nr: "RE-662", date: "2026-11-05", gross: 399 }] })[0];
    assert.strictEqual(it.unbilled, 0); assert.ok(it.notes.some(n => n.lvl === "bad" && /Doppelrechnung/.test(n.text)), JSON.stringify(it.notes));
  }]);
  out.push(["Offenes Angebot: keine Rechnungsaktion; kurz vor dem Event Prüfpunkt „Angebot nicht angenommen“; weit weg nichts", () => {
    let items = blitz([bk({ id: "o1", reference: "BD-OOO111", customerName: "Kunde O", status: "PENDING", offerOpen: true, eventDate: "2026-11-25" })], []);
    assert.strictEqual(items.length, 1); assert.strictEqual(items[0].unbilled, 0); assert.strictEqual(items[0].action, null); assert.strictEqual(items[0].offerOpen, true); assert.ok(/Angebot nicht angenommen/.test(items[0].notes[0].text));
    items = blitz([bk({ id: "o2", reference: "BD-OOO222", customerName: "Kunde O", status: "PENDING", offerOpen: true, eventDate: "2027-03-01" })], []);
    assert.strictEqual(items.length, 0);
    items = blitz([bk({ id: "o3", reference: "BD-OOO333", customerName: "Kunde O", invoiceInProgress: true, invoiceClaimedAt: new Date(Date.now() - 2 * 3600e3).toISOString() })], []);
    assert.strictEqual(items[0].action, null); assert.ok(/hängt/.test(items[0].notes[0].text));
  }]);
  out.push(["Storno prüfen: stornierte Buchung mit gültiger Rechnung → Prüfpunkt (rot), Rechnung zugeordnet, nie „Zu verrechnen“", () => {
    const r = build({ invs: [I({ id: "671", nr: "RE-671", gross: 399, status: 200, paid: 0, open: 399, contact: "Firma S", ref: "Buchung BD-SSS111" })], blitzAll: [bk({ id: "s", reference: "BD-SSS111", customerName: "Firma S", status: "CANCELLED" })] });
    const it = r.items.find(x => x.key === "blitz:s");
    assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.cancelled, true); assert.ok(it.notes[0].lvl === "bad" && /Storno prüfen/.test(it.notes[0].text));
    assert.ok(!r.unlinked.some(u => u.id === "671")); assert.strictEqual(r.totals.unbilled, 0);
  }]);
  out.push(["BD-4: Vorjahres-Event (Dezember) unverrechnet bleibt im neuen Jahr sichtbar; verrechnete Vorjahresbuchungen fallen weg", () => {
    const items = abgleichBuild({ year: "2027", today: "2027-01-05", sev: mkSev([I({ id: "681", nr: "RE-681", gross: 399, contact: "Paid Kunde", ref: "Buchung BD-PPP111", date: "2026-12-20" })]), bill: { prices: {}, sites: {}, invoices: {} }, sitesSnap: null,
      blitzAll: [bk({ id: "p1", reference: "BD-PPP111", customerName: "Paid Kunde", eventDate: "2026-12-20", _prev: true }), bk({ id: "p2", reference: "BD-PPP222", customerName: "Silvester GmbH", eventDate: "2026-12-31", _prev: true })] }).items;
    assert.ok(!items.some(x => x.key === "blitz:p1"), "verrechnet + bezahlt: nicht mehr zeigen");
    const p2 = items.find(x => x.key === "blitz:p2"); assert.ok(p2 && p2.unbilled === 399 && p2.action, "Dezember-Event weiter zu verrechnen");
  }]);
  out.push(["Kantineur-Rechnung wird nie über Name + Betrag zur Blitzdings-Rechnung", () => {
    const it = build({ invs: [I({ id: "691", nr: "RE-691", gross: 9.69, contact: "SV Stainach", mpid: "tr_kk" })], blitzAll: [bk({ id: "k", reference: "BD-KKK111", customerName: "SV Stainach", totalCents: 969 })], kantineur: { revenueGrossCents: 969, subscribers: {} } }).items.find(x => x.key === "blitz:k");
    assert.strictEqual(it.unbilled, 9.69);
  }]);

  /* ---- fin-api Idempotency-Key (X8) mit der echten fin-local.js ---- */
  out.push(["fin-api: gleicher Idempotency-Key derselben Plattform → bestehende Rechnung, gleiches Format; andere Plattform/ohne Header → neu", async () => {
    const { L } = finSetup([contact("40", "SV Stainach")]); await L.load();
    const sevFn = (m, p, o) => L.request(m, p, o || {});
    const body = () => ({ invoice: { invoiceType: "RE", status: 100, contact: { id: "40", objectName: "Contact" }, customerInternalNote: "Mollie tr_idem1234" }, invoicePosSave: [{ quantity: 1, price: 8.08, priceGross: 9.69, grossPricing: true, taxRate: 20 }] });
    const b1 = body(); assert.strictEqual(await finApiIdem("kantineur", "POST", "/Invoice/Factory/saveInvoice", "kantineur-tr_idem1234", b1, sevFn), null);
    assert.strictEqual(b1.invoice.finApiKey, "kantineur:kantineur-tr_idem1234");
    const made = (await L.request("POST", "/Invoice/Factory/saveInvoice", { body: b1 })).objects.invoice;
    assert.strictEqual(+made.sumGross, 9.69);
    const again = await finApiIdem("kantineur", "POST", "/Invoice/Factory/saveInvoice", "kantineur-tr_idem1234", body(), sevFn);
    assert.ok(again && String(again.objects.invoice.id) === String(made.id) && again.objects.invoicePos.length === 1, JSON.stringify(again));
    assert.strictEqual(await finApiIdem("kochdu", "POST", "/Invoice/Factory/saveInvoice", "kantineur-tr_idem1234", body(), sevFn), null, "andere Plattform");
    assert.strictEqual(await finApiIdem("kantineur", "POST", "/Invoice/Factory/saveInvoice", "", body(), sevFn), null, "ohne Header wie bisher");
    // Ersatzweise über die Notiz (Kantineur): andere Schlüssel-Schreibweise, gleiche „Mollie tr_…“ → bestehende
    const viaNote = await finApiIdem("kantineur", "POST", "/Invoice/Factory/saveInvoice", "anderer-key", body(), sevFn);
    assert.ok(viaNote && String(viaNote.objects.invoice.id) === String(made.id));
    // storniert → zählt nicht
    L.get("Invoice", made.id).cancelled = true;
    assert.strictEqual(await finApiIdem("kantineur", "POST", "/Invoice/Factory/saveInvoice", "kantineur-tr_idem1234", body(), sevFn), null);
    // bestehende Rechnung ändern (invoice.id) und andere Pfade: nie angefasst
    assert.strictEqual(await finApiIdem("kantineur", "POST", "/Invoice/Factory/saveInvoice", "k", { invoice: { id: made.id } }, sevFn), null);
    assert.strictEqual(await finApiIdem("kantineur", "POST", "/Contact", "k", { name: "x" }, sevFn), null);
  }]);
  return out;
}

(async () => {
  /* Teil 1: Rechenkern */
  const udir = copyApp();
  Object.keys(process.env).forEach(k => { if (STRIP.test(k)) delete process.env[k]; });
  Object.assign(process.env, { NODE_ENV: "test", ADMIN_AUTH_SECRET: "test-secret", ADMIN_PASSWORD: "x", PORT: "0" });
  let T = null; try { T = require(path.join(udir, "server.js"))._test; } catch (e) { fails.push("server.js laden\n    " + (e && e.stack || e)); fail++; }
  if (T) for (const [name, fn] of unitTests(T)) await t(name, fn);

  /* Teil 2: Gutschrift-Vorschläge (fin-credit.js) mit fin-local + fin-proposals */
  await t("KA-2: Mollie-Erstattung zu bezahlter Kantineur-Rechnung → Vorschlag; Klick = Gutschrift genau 9,69 € (USt 1,62) + Zuordnung der Erstattung", async () => {
    const seed = [acc("2", "Mollie – Kantineur"), contact("40", "SV Stainach")].concat(invSeed("800", { gross: 9.69, extra: { status: "1000", paidAmount: "9.69", customerInternalNote: "Mollie tr_refund01" } }),
      [["CheckAccountTransaction", { id: "901", checkAccount: { id: "2", objectName: "CheckAccount" }, amount: "-9.69", valueDate: iso("2026-11-18"), payeePayerName: "SV Stainach", paymtPurpose: "Rückerstattung tr_refund01", status: "100", mollieId: "rf1", mollieType: "refund", molliePayment: "tr_refund01" }]]);
    const { L, P, C } = finSetup(seed); await L.load();
    assert.strictEqual(await C.refunds([]), 1);
    assert.strictEqual(await C.refunds([]), 0, "kein zweiter Vorschlag");
    const list = await P.list(); assert.strictEqual(list.length, 1); const it = list[0];
    assert.strictEqual(it.kind, "invoice-credit"); assert.strictEqual(it.amount, -9.69); assert.ok(/Gutschrift über 9,69 € zu Rechnung RE-800/.test(it.title), it.title);
    assert.strictEqual(L.all("CreditNote").length, 0, "nichts automatisch gebucht");
    const r = await P.accept(it.id);
    const cn = L.get("CreditNote", r.result.creditNoteId);
    assert.strictEqual(+cn.sumGross, 9.69); assert.strictEqual(+cn.sumTax, 1.62); assert.strictEqual(+cn.sumNet, 8.07);
    assert.strictEqual(String(cn.status), "1000"); assert.strictEqual(L.get("CheckAccountTransaction", "901").status, "200");
    assert.strictEqual(String(L.get("Invoice", "800").status), "1000", "Rechnung selbst unverändert");
    assert.strictEqual(await C.refunds([]), 0);
  });
  await t("KA-2: offene Rechnung (Zahlung noch nicht zugeordnet) → kein Gutschrift-Vorschlag, nie Storno", async () => {
    const seed = [acc("2", "Mollie"), contact("40", "SV")].concat(invSeed("810", { gross: 9.69, extra: { customerInternalNote: "Mollie tr_open0001" } }),
      [["CheckAccountTransaction", { id: "911", checkAccount: { id: "2", objectName: "CheckAccount" }, amount: "-9.69", valueDate: iso("2026-11-18"), status: "100", mollieId: "rf2", mollieType: "refund", molliePayment: "tr_open0001" }]]);
    const { L, P, C } = finSetup(seed); await L.load();
    assert.strictEqual(await C.refunds([{ invoiceId: "810", pid: "tr_open0001", cents: 969 }]), 0); assert.strictEqual((await P.list()).length, 0);
    assert.ok(!L.get("Invoice", "810").cancelled);
  });
  await t("KA-2 Weg 2: Kantineur meldet Erstattung ohne Mollie-Umsatz → Gutschrift ohne Zuordnung; später kommt der Umsatz → nur noch Zuordnung zur selben Gutschrift", async () => {
    const seed = [acc("2", "Mollie"), contact("40", "SV")].concat(invSeed("820", { gross: 14.9, extra: { status: "1000", paidAmount: "14.90", customerInternalNote: "Mollie tr_late0001" } }));
    const { L, P, C } = finSetup(seed); await L.load();
    const hint = [{ invoiceId: "820", pid: "tr_late0001", cents: 1490, chargeback: true }];
    assert.strictEqual(await C.refunds(hint), 1);
    let it = (await P.list())[0]; assert.ok(/Rückbuchung/.test(it.title)); assert.deepStrictEqual(it.txIds, null);
    const r = await P.accept(it.id); const cn = L.get("CreditNote", r.result.creditNoteId);
    assert.strictEqual(+cn.sumGross, 14.9); assert.strictEqual(String(cn.status), "200", "offen bis zur Auszahlung");
    assert.strictEqual(await C.refunds(hint), 0, "schon gutgeschrieben");
    await L.save("CheckAccountTransaction", { id: "921", checkAccount: { id: "2", objectName: "CheckAccount" }, amount: "-14.90", valueDate: iso("2026-11-21"), status: "100", mollieId: "cb1", mollieType: "chargeback", molliePayment: "tr_late0001" });
    assert.strictEqual(await C.refunds(hint), 1);
    it = (await P.list())[0]; assert.ok(/der Gutschrift .* zuordnen/.test(it.title), it.title);
    await P.accept(it.id);
    assert.strictEqual(L.all("CreditNote").length, 1, "keine zweite Gutschrift"); assert.strictEqual(String(L.get("CreditNote", cn.id).status), "1000"); assert.strictEqual(L.get("CheckAccountTransaction", "921").status, "200");
  });
  await t("KA-2 Weg 2: kommt der Mollie-Umsatz vor dem Klick, fällt der Vorschlag ohne Zuordnung weg (kein doppeltes Gutschreiben)", async () => {
    const seed = [acc("2", "Mollie"), contact("40", "SV")].concat(invSeed("830", { gross: 9, extra: { status: "1000", paidAmount: "9.00", customerInternalNote: "Mollie tr_race0001" } }));
    const { L, P, C } = finSetup(seed); await L.load();
    const hint = [{ invoiceId: "830", pid: "tr_race0001", cents: 900 }];
    assert.strictEqual(await C.refunds(hint), 1);
    await L.save("CheckAccountTransaction", { id: "931", checkAccount: { id: "2", objectName: "CheckAccount" }, amount: "-9.00", valueDate: iso("2026-11-21"), status: "100", mollieId: "rf9", mollieType: "refund", molliePayment: "tr_race0001" });
    assert.strictEqual(await C.refunds(hint), 1, "Vorschlag mit Zuordnung");
    const list = await P.list(); assert.strictEqual(list.length, 1, "der ohne Zuordnung ist ungültig"); assert.deepStrictEqual(list[0].txIds, ["931"]);
  });
  await t("kochdu doppelt verrechnet: bezahlte Monatsrechnung → Gutschrift-Vorschlag (20 %, bruttogenau); offene → keiner; nach dem Klick kein zweiter", async () => {
    const seed = [contact("40", "La Taverna")].concat(invSeed("840", { gross: 42.1, extra: { status: "1000", paidAmount: "42.10", header: "kochdu-Gebühr Barzahlungen 09/2026" } }), invSeed("841", { gross: 30, extra: { status: "200" } }));
    const { L, P, C } = finSetup(seed); await L.load();
    const rest = [{ id: "R1", name: "La Taverna", months: [{ month: "2026-09", doubleBilledCents: 800, manualCents: 800, doc: { docId: "840", nr: "RE-840" } }, { month: "2026-10", doubleBilledCents: 500, doc: { docId: "841", nr: "RE-841" } }] }];
    assert.strictEqual(await C.kochduDouble(rest), 1);
    const it = (await P.list())[0]; assert.ok(/8,00 € zu Rechnung RE-840/.test(it.title) && /09\/2026 doppelt verrechnet/.test(it.title), it.title);
    const r = await P.accept(it.id); const cn = L.get("CreditNote", r.result.creditNoteId);
    assert.strictEqual(+cn.sumGross, 8); assert.strictEqual(+cn.sumTax, 1.33); assert.strictEqual(String(cn.refSrcInvoice.id), "840");
    assert.strictEqual(await C.kochduDouble(rest), 0);
  });

  /* Teil 3: Mollie-Zuordnung über „Mollie tr_…“ nur exakt (fin-mollie.js matchOf) */
  await t("Mollie tr_ in der Notiz: exakt gleiches Brutto → Zuordnung; 11,63 statt 9,69 → keine; tr_abc trifft nicht tr_abcdef", async () => {
    const seed = [acc("2", "Mollie"), contact("40", "SV Stainach")].concat(invSeed("850", { gross: 9.69, extra: { customerInternalNote: "Mollie tr_exact001" } }), invSeed("851", { gross: 11.63, extra: { customerInternalNote: "Mollie tr_wrong001" } }), invSeed("852", { gross: 9.69, extra: { customerInternalNote: "Mollie tr_prefix0012" } }));
    const { L, M } = finSetup(seed); await L.load();
    const tx = (pid, g) => ({ id: "x", molliePayment: pid, mollieGross: String(g), amount: String(g - 0.3), mollieType: "payment", payeePayerName: "" });
    assert.strictEqual(String((M.matchOf(tx("tr_exact001", 9.69)) || {}).id), "850");
    assert.strictEqual(M.matchOf(tx("tr_wrong001", 9.69)), null, "Betrag weicht ab – nie zuordnen");
    assert.strictEqual(M.matchOf(tx("tr_exact001", 9.7)), null, "1 Cent daneben – Kantineur nur exakt");
    assert.notStrictEqual(String((M.matchOf(tx("tr_prefix001", 9.69)) || {}).id), "852", "nur ganzes Wort");
  });

  /* Teil 4: Steuer – Beleg mit negativer Summe (7a) und Gutschrift mit gemischten Vorzeichen (7) */
  const S = require(path.join(ROOT, "admin-cockpit/steuer-calc.js"));
  // kochdu-Auszahlungsabrechnung: Gebühr 4,50 brutto (3,75 + 0,75 USt) positiv, durchlaufende Speisen −100 (0 %) → Summe −95,50; Auszahlung 95,50 (positiv gespeichert)
  const payout = (o) => Object.assign({ id: "iP", nr: "RE-P1", type: "RE", status: 1000, date: "2026-11-02", delivery: "2026-10-01", deliveryUntil: "2026-10-31", taxType: "default", taxRule: "1", contact: "La Taverna", country: "AT", uid: "",
    net: -96.25, tax: 0.75, gross: -95.5, paid: 95.5, payDate: "2026-11-10", pays: [{ date: "2026-11-10", amount: 95.5 }], lines: [{ rate: 20, net: 3.75, tax: 0.75, cat: "" }, { rate: 0, net: -100, tax: 0, cat: "" }] }, o || {});
  const K = (r, kz) => r2(((r.K[kz] || {}).tax) || 0);
  const Q4 = { key: "2026-Q4", from: "2026-10-01", to: "2026-12-31" };
  await t("7a: Soll → KZ 022 +0,75 (unverändert richtig)", () => {
    const u = S.computeUva({ invoices: [payout()], vouchers: [], creditNotes: [] }, { docs: {}, uva: {}, settings: { besteuerung: "soll" }, today: "2026-11-20" }, Q4);
    assert.strictEqual(K(u, "022"), 0.75); assert.strictEqual(K(u, "090"), 0);
  });
  await t("7a: Ist, Auszahlung positiv gebucht → KZ 022 +0,75, nicht −0,75 in KZ 090 (Anteil = |Zahlung| / |Summe|)", () => {
    const st = { docs: {}, uva: {}, settings: { besteuerung: "ist", istAb: "2026-01-01" }, today: "2026-11-20" };
    const u = S.computeUva({ invoices: [payout()], vouchers: [], creditNotes: [] }, st, Q4);
    assert.strictEqual(K(u, "022"), 0.75); assert.strictEqual(K(u, "090"), 0);
    const cc = S.controlCheck({ invoices: [payout()], vouchers: [], creditNotes: [] }, st, Q4); assert.strictEqual(cc.ust, 0.75, "Kontrollrechnung Ist");
    // sevDesk-artig negativ gespeicherte Zahlung: gleiches Ergebnis
    const u2 = S.computeUva({ invoices: [payout({ pays: [{ date: "2026-11-10", amount: -95.5 }], paid: -95.5 })], vouchers: [], creditNotes: [] }, st, Q4);
    assert.strictEqual(K(u2, "022"), 0.75); assert.strictEqual(K(u2, "090"), 0);
  });
  await t("7a: E1a-Zufluss: Anteil |Zahlung| / |Summe| (positiv wie negativ gespeicherte Auszahlung gleich)", () => {
    const st = { docs: {}, uva: {}, mapping: {}, jabInput: {}, trips: {}, settings: {}, today: "2026-11-20" };
    const a = S.computeJab({ invoices: [payout()], vouchers: [], creditNotes: [] }, st, 2026), b = S.computeJab({ invoices: [payout({ pays: [{ date: "2026-11-10", amount: -95.5 }], paid: -95.5 })], vouchers: [], creditNotes: [] }, st, 2026);
    const ra = a.revDocs.find(x => x.doc.id === "iP"), rb = b.revDocs.find(x => x.doc.id === "iP");
    assert.ok(ra && rb, "im Zufluss enthalten"); assert.strictEqual(ra.net, -96.25); assert.strictEqual(rb.net, -96.25);
  });
  await t("7: Gutschrift mit gemischten Vorzeichen wird nicht still gebucht, sondern zur Prüfung gemeldet (Soll und Ist); normale Gutschrift unverändert", () => {
    const mixed = { id: "cnM", nr: "GU-1", type: "GU", status: 200, date: "2026-11-03", taxType: "default", taxRule: "1", contact: "La Taverna", country: "AT", net: 96.25, tax: -0.75, gross: 95.5, paid: 95.5, payDate: "2026-11-10", pays: [{ date: "2026-11-10", amount: 95.5 }],
      lines: [{ rate: 0, net: 100, tax: 0 }, { rate: 20, net: -3.75, tax: -0.75 }] };
    const plain = { id: "cnP", nr: "GU-2", type: "GU", status: 200, date: "2026-11-04", taxType: "default", taxRule: "1", contact: "Kunde", country: "AT", net: 8.07, tax: 1.62, gross: 9.69, paid: 9.69, payDate: "2026-11-12", pays: [{ date: "2026-11-12", amount: 9.69 }], lines: [{ rate: 20, net: 8.07, tax: 1.62 }] };
    for (const st of [{ docs: {}, uva: {}, settings: { besteuerung: "soll" }, today: "2026-11-20" }, { docs: {}, uva: {}, settings: { besteuerung: "ist", istAb: "2026-01-01" }, today: "2026-11-20" }]) {
      const u = S.computeUva({ invoices: [], vouchers: [], creditNotes: [mixed, plain] }, st, Q4);
      assert.ok(u.review.some(x => x.doc.id === "cnM" && /beider Vorzeichen/.test(x.why)), st.settings.besteuerung + ": gemeldet");
      const only = S.computeUva({ invoices: [], vouchers: [], creditNotes: [plain] }, st, Q4);
      assert.ok(K(only, "090") < -1.6, "normale Gutschrift mindert die USt (KZ 090)");
      assert.deepStrictEqual(u.K, only.K, st.settings.besteuerung + ": die gemischte Gutschrift ändert keine Kennzahl");
      assert.strictEqual(S.controlCheck({ invoices: [], vouchers: [], creditNotes: [mixed, plain] }, st, Q4).ust, S.controlCheck({ invoices: [], vouchers: [], creditNotes: [plain] }, st, Q4).ust);
    }
  });

  /* Teil 5: Cockpit-Rechnung an Blitzdings melden (BD-3) – Server-Kopie gegen einen kleinen Blitzdings-Mock (neu: Endpunkt da, alt: 404) */
  await (async () => {
    const http = require("http"), cp = require("child_process"), crypto = require("crypto");
    const got = [], M = { old: false };
    const mock = http.createServer((req, res) => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => {
      const u = new URL(req.url, "http://x"), m = u.pathname.match(/^\/api\/cockpit\/bookings\/([^/]+)\/invoice$/);
      if (req.method === "POST" && m) { got.push({ id: decodeURIComponent(m[1]), token: req.headers["x-api-token"], body: JSON.parse(b || "{}"), old: M.old });
        if (M.old) { res.writeHead(404, { "content-type": "text/html" }); return res.end("<html>404</html>"); }
        res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: true, registered: true, duplicate: m[1] === "bkDup", booking: { id: m[1], reference: "BD-" + m[1], sevdeskInvoiceId: m[1] === "bkDup" ? "777" : "" } })); }
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(u.pathname === "/api/stats" ? { revenue: {}, bookings: {}, upcoming: [] } : { ok: true, bookings: [], days: {}, blocked: [] })); }); });
    await new Promise(r => mock.listen(0, "127.0.0.1", r)); const mb = "http://127.0.0.1:" + mock.address().port;
    const dir = copyApp(), port = 4900 + Math.floor(Math.random() * 300), SECRET = "test-secret";
    const COOKIE = "fsadmin=" + encodeURIComponent((v => v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("hex"))("s1." + Date.now()));
    const env = Object.assign({}, process.env, { NODE_ENV: "", PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x", BLITZDINGS_STATS_URL: mb + "/api/stats", BLITZDINGS_STATS_TOKEN: "tok-b" });
    const srv = cp.spawn(process.execPath, ["server.js"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] }); let out = ""; srv.stdout.on("data", d => (out += d)); srv.stderr.on("data", d => (out += d));
    const base = "http://127.0.0.1:" + port;
    for (let i = 0; i < 80; i++) { try { await fetch(base + "/admin/login"); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
    const post = (p, body) => fetch(base + p, { method: "POST", headers: { cookie: COOKIE, "content-type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
    const wait = async (f) => { for (let i = 0; i < 60; i++) { if (f()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
    try {
      await t("BD-3: Rechnung zu „blitz:<id>“ im Cockpit → Meldung an Blitzdings (Header-Token, Rechnungs-ID), Rechnung unverändert", async () => {
        const j = await post("/admin/api/billing", { op: "invoice", key: "blitz:bkNeu1", invoice: { id: "9001", nr: "", gross: 399, label: "Test" } });
        assert.ok(j.ok, JSON.stringify(j));
        assert.ok(await wait(() => got.some(g => g.id === "bkNeu1")), "Meldung kam an");
        const g = got.find(x => x.id === "bkNeu1"); assert.strictEqual(g.token, "tok-b"); assert.strictEqual(g.body.invoiceId, "9001");
        const rd = () => { try { return JSON.parse(fs.readFileSync(path.join(dir, "blitz-invoice-report.json"), "utf8")); } catch (e) { return { q: {}, done: {} }; } };
        assert.ok(await wait(() => { const st = rd(); return st.done["bkNeu1|9001"] && !st.q["bkNeu1|9001"]; }), JSON.stringify(rd()));
      });
      await t("BD-3: altes Blitzdings ohne Endpunkt (404) → Meldung bleibt in der Warteschlange, nichts kaputt; Klick meldet erneut", async () => {
        M.old = true;
        const j = await post("/admin/api/billing", { op: "invoice", key: "blitz:bkAlt1", invoice: { id: "9002", nr: "RE-9002", gross: 120 } });
        assert.ok(j.ok);
        assert.ok(await wait(() => got.some(g => g.id === "bkAlt1")), "versucht");
        const rd = () => { try { return JSON.parse(fs.readFileSync(path.join(dir, "blitz-invoice-report.json"), "utf8")); } catch (e) { return { q: {}, done: {} }; } };
        assert.ok(await wait(() => { const q = rd().q["bkAlt1|9002"]; return q && q.tries >= 1; }), JSON.stringify(rd().q));
        let st;
        M.old = false;
        const r = await post("/admin/api/blitz/booking-invoice", { items: [{ bookingId: "bkAlt1", invoiceId: "9002", nr: "RE-9002" }, { bookingId: "bkDup", invoiceId: "9003" }] });
        assert.ok(r.ok && r.reported === 2 && r.duplicates === 1, JSON.stringify(r));
        st = JSON.parse(fs.readFileSync(path.join(dir, "blitz-invoice-report.json"), "utf8")); assert.ok(!st.q["bkAlt1|9002"]); assert.ok(st.dup["bkDup|9003"] && st.dup["bkDup|9003"].other === "777");
        const bad = await fetch(base + "/admin/api/blitz/booking-invoice", { method: "POST", headers: { cookie: COOKIE, "content-type": "application/json" }, body: JSON.stringify({ items: [{ bookingId: "../x", invoiceId: "1" }] }) });
        assert.strictEqual(bad.status, 400);
      });
    } finally { srv.kill(); mock.close(); }
  })();

  console.log((fail ? "" : "OK: ") + "Plattform Teil B: " + pass + " bestanden, " + fail + " fehlgeschlagen");
  if (fails.length) console.log("✗ " + fails.join("\n✗ "));
  process.exit(fail ? 1 : 0);
})();
