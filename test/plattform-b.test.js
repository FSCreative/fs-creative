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
function finSetup(seed, today, billing, mfetch) {
  const fin = memFin(seed);
  const L = require(path.join(ROOT, "fin-local.js"))({ fin, renderPdf: async () => Buffer.from(""), mailSend: async () => ({}) });
  const P = require(path.join(ROOT, "fin-proposals.js"))({ L, getMeta: fin.getMeta, setMeta: fin.setMeta, autoPay: () => true, today: () => today || "2026-11-20", reportedPeriods: () => [{ from: "2026-01-01", to: "2026-06-30" }] });
  L.setProposer(P);
  const C = require(path.join(ROOT, "fin-credit.js"))({ L, P: () => P, today: () => today || "2026-11-20", reportedPeriods: () => [{ from: "2026-01-01", to: "2026-06-30" }], billing: () => billing || { invoices: {} } });
  P.register("invoice-credit", { exec: it => C.exec(Object.assign({}, it.payload, { key: it.key })), valid: it => C.valid(it) });
  const M = require(path.join(ROOT, "fin-mollie.js"))({ L, P: () => P, today: () => today || "2026-11-20", fetch: mfetch });
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
  out.push(["Kantineur alt (ohne apiVersion): wie bisher verrechnet = bezahlt = Umsatz; offene „Mollie tr_“-Rechnung bleibt sichtbar (ohne Zuordnung + Hinweis, Review B5b)", () => {
    const r = build({ invs: [I({ id: "521", date: "2026-11-05", gross: 11.63, paid: 0, open: 11.63, status: 200, mpid: "tr_old" })], kantineur: { revenueGrossCents: 969, mrrCents: 969, subscribers: { paying: 1 } } });
    const it = r.items.find(x => x.key === "kantineur");
    assert.strictEqual(it.invoiced, 9.69); assert.strictEqual(it.paid, 9.69); assert.strictEqual(it.open, 0); assert.deepStrictEqual(it.invoices, []);
    assert.ok(r.unlinked.some(u => u.id === "521"), "offene Kantineur-Rechnung unter „ohne Zuordnung“");
    assert.ok((it.notes || []).some(n => n.inv === "521" && /11,63 €/.test(n.text) && /offen/.test(n.text)), JSON.stringify(it.notes));
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

  /* ---- Review Teil B: B3 (kein Rückschritt im Abgleich), B6 (Gruppen/Rabatt), B7 (gemeldete Rechnungen), A3 (Gutschrift), B5/B10/B11 (Kantineur) ---- */
  out.push(["B3a: Rechnung 61 Tage vor dem Event (Name + Betrag) zählt wie bisher – auch wenn die Buchung erst danach erfasst wurde; früh angelegte Buchung: Rechnung ab Anlage", () => {
    let it = blitz([bk({ id: "a", reference: "BD-AAA701", customerName: "Hochzeit Huber", eventDate: "2026-10-20" })], [I({ id: "701", nr: "RE-701", gross: 399, contact: "Hochzeit Huber", date: "2026-08-20" })])[0];
    assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.last.id, "701");
    it = blitz([bk({ id: "a", reference: "BD-AAA701", customerName: "Hochzeit Huber", eventDate: "2026-10-20", createdAt: "2026-09-01T10:00:00.000Z" })], [I({ id: "701", nr: "RE-701", gross: 399, contact: "Hochzeit Huber", date: "2026-08-20" })])[0];
    assert.strictEqual(it.unbilled, 0, "Telefonbuchung später erfasst: Rechnung passt weiter");
    it = blitz([bk({ id: "w", reference: "BD-WED001", customerName: "Hochzeit Lang", eventDate: "2026-11-15", createdAt: "2025-11-20T10:00:00.000Z" })], [I({ id: "702", nr: "RE-702", gross: 399, contact: "Hochzeit Lang", date: "2025-11-25" })])[0];
    assert.strictEqual(it.unbilled, 0, "ein Jahr vorher gebucht und verrechnet");
  }]);
  out.push(["B3b: zwei gleich teure Buchungen, zwei Rechnungen → jede bekommt die zeitlich nächste (März ↔ Februar, September ↔ August)", () => {
    const items = blitz([bk({ id: "m", reference: "BD-MAR001", customerName: "Firma Roadshow", eventDate: "2026-03-01" }), bk({ id: "s", reference: "BD-SEP001", customerName: "Firma Roadshow", eventDate: "2026-09-01" })],
      [I({ id: "712", nr: "RE-712", gross: 399, contact: "Firma Roadshow", date: "2026-08-25" }), I({ id: "711", nr: "RE-711", gross: 399, contact: "Firma Roadshow", date: "2026-02-20" })]);
    assert.strictEqual(items.find(x => x.key === "blitz:m").last.id, "711"); assert.strictEqual(items.find(x => x.key === "blitz:s").last.id, "712");
    assert.ok(items.every(x => x.unbilled === 0));
  }]);
  out.push(["B3c/B3d: Vorjahresbuchung findet ihre Rechnung auch außerhalb der neuesten 600 (Buchungsnummer, auch Altformat BD-2026-0042)", () => {
    const invs = []; for (let k = 0; k < 600; k++) invs.push(I({ id: String(5000 + k), nr: "RE-" + (5000 + k), date: "2026-11-" + String(1 + (k % 19)).padStart(2, "0"), contact: "Druckshop Kunde " + k, gross: 20 }));
    invs.push(I({ id: "721", nr: "RE-721", gross: 399, contact: "Verein Vorjahr", ref: "Buchung BD-PRV721 – vielen Dank", date: "2025-06-10" }));
    invs.push(I({ id: "781", nr: "RE-781", gross: 399, contact: "Firma Z GmbH", ref: "Buchung BD-2026-0042 – vielen Dank", date: "2025-12-01" }));
    const items = blitz([bk({ id: "p", reference: "BD-PRV721", customerName: "Verein Vorjahr", eventDate: "2025-06-14", _prev: true }), bk({ id: "z", reference: "BD-2026-0042", customerName: "Max Z", eventDate: "2025-12-05", _prev: true })], invs);
    assert.ok(!items.some(x => x.key === "blitz:p" && x.unbilled > 0), "nicht mehr fälschlich „zu verrechnen“"); assert.ok(!items.some(x => x.key === "blitz:z" && x.unbilled > 0));
    const z = blitz([bk({ id: "z", reference: "BD-2026-0042", customerName: "Max Z", eventDate: "2026-11-15" })], [I({ id: "782", nr: "RE-782", gross: 399, contact: "Firma Z GmbH", ref: "Buchung BD-2026-0042", date: "2026-11-01" })])[0];
    assert.strictEqual(z.unbilled, 0); assert.strictEqual(z.last.id, "782");
  }]);
  out.push(["B6: gemeinsame Rechnung (zwei Buchungsnummern im Kopftext bzw. „Zuordnen“ zu zwei Buchungen) → Summe über die Gruppe, keine falschen Hinweise", () => {
    let items = blitz([bk({ id: "g1", reference: "BD-GRP001", customerName: "Gemeinde X" }), bk({ id: "g2", reference: "BD-GRP002", customerName: "Gemeinde X", eventDate: "2026-11-11" })],
      [I({ id: "751", nr: "RE-751", gross: 798, contact: "Gemeinde X", ref: "Buchungen BD-GRP001 und BD-GRP002", date: "2026-11-01", paid: 0, open: 798, status: 200 })]);
    assert.ok(items.every(x => x.unbilled === 0 && !(x.notes || []).length), JSON.stringify(items.map(x => x.notes)));
    items = blitz([bk({ id: "y1", reference: "BD-YYY001", customerName: "Gemeinde Y" }), bk({ id: "y2", reference: "BD-YYY002", customerName: "Gemeinde Y", totalCents: 29900 })], [I({ id: "801", nr: "RE-801", gross: 698, contact: "Gemeinde Y", date: "2026-11-02" })],
      { "blitz:y1": [{ id: "801", nr: "RE-801", gross: 399, date: "2026-11-02" }], "blitz:y2": [{ id: "801", nr: "RE-801", gross: 299, date: "2026-11-02" }] });
    assert.ok(items.every(x => x.unbilled === 0 && !(x.notes || []).length), JSON.stringify(items.map(x => x.notes)));
    // Gruppe passt nicht → nur Hinweis, nie eine Aktion
    items = blitz([bk({ id: "g1", reference: "BD-GRP001", customerName: "Gemeinde X" }), bk({ id: "g2", reference: "BD-GRP002", customerName: "Gemeinde X", eventDate: "2026-11-11" })], [I({ id: "752", nr: "RE-752", gross: 700, contact: "Gemeinde X", ref: "Buchungen BD-GRP001, BD-GRP002", date: "2026-11-01" })]);
    assert.ok(items.every(x => x.unbilled === 0 && !x.action && x.notes.some(n => /Sammelrechnung RE-752/.test(n.text))));
  }]);
  out.push(["B6: bewusster Rabatt (349 statt 399) → Hinweis ohne Aktion und ohne „zu verrechnen“, auch wenn die Buchung danach geändert wurde (z. B. bezahlt); nach der Verrechnung erhöht → Differenz", () => {
    const inv = [I({ id: "771", nr: "RE-771", gross: 349, contact: "Kunde R", ref: "Buchung BD-RAB771", date: "2026-11-01" })];
    let it = blitz([bk({ id: "r", reference: "BD-RAB771", customerName: "Kunde R" })], inv)[0];
    assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.action, null); assert.ok(it.notes.some(n => n.lvl === "info" && /Rabatt/.test(n.text)));
    it = blitz([bk({ id: "r", reference: "BD-RAB771", customerName: "Kunde R", paymentStatus: "PAID", updatedAt: "2026-11-10T08:00:00.000Z" })], inv, { "blitz:r": [{ id: "771", nr: "RE-771", gross: 349, date: "2026-11-01", bookingAmount: 399 }] })[0];
    assert.strictEqual(it.unbilled, 0, "Rabatt bleibt Rabatt (Buchungsbetrag beim Verrechnen 399)"); assert.strictEqual(it.action, null);
    it = blitz([bk({ id: "r", reference: "BD-RAB771", customerName: "Kunde R", totalCents: 44900 })], inv, { "blitz:r": [{ id: "771", nr: "RE-771", gross: 349, date: "2026-11-01", bookingAmount: 399 }] })[0];
    assert.strictEqual(it.unbilled, 50, "Buchung nach der Verrechnung von 399 auf 449 erhöht → nur die Erhöhung, der Rabatt bleibt"); assert.ok(it.action && /Nachverrechnung/.test(it.action.title));
  }]);
  out.push(["B7: gemeldete Rechnung (cockpitInvoiceIds) zählt nur, wenn sie existiert, gültig ist, nicht einer anderen Buchung gehört und nicht zurückgenommen wurde", () => {
    let items = blitz([bk({ id: "A", reference: "BD-AAA761", customerName: "Kunde A", cockpitInvoiceIds: ["761"], invoiceIds: ["761"] }), bk({ id: "B", reference: "BD-BBB761", customerName: "Kunde B" })],
      [I({ id: "761", nr: "RE-761", gross: 399, contact: "Kunde B", ref: "Buchung BD-BBB761", date: "2026-11-01" })]);
    assert.strictEqual(items.find(x => x.key === "blitz:A").unbilled, 399); assert.strictEqual(items.find(x => x.key === "blitz:B").last.id, "761");
    items = blitz([bk({ id: "A", reference: "BD-AAA762", customerName: "Kunde A", cockpitInvoiceIds: ["762"] })], [I({ id: "762", nr: "RE-762", gross: 399, contact: "Kunde Q", cancelled: true, date: "2026-11-01" })]);
    assert.strictEqual(items[0].unbilled, 399, "stornierte gemeldete Rechnung zählt nicht");
    const ok = blitz([bk({ id: "A", reference: "BD-AAA763", customerName: "Kunde A", cockpitInvoiceIds: ["763"] })], [I({ id: "763", nr: "RE-763", gross: 399, contact: "Kunde Q", date: "2026-11-01" })]);
    assert.strictEqual(ok[0].unbilled, 0, "gültige gemeldete Rechnung zählt");
    const rv = build({ blitzAll: [bk({ id: "A", reference: "BD-AAA763", customerName: "Kunde A", cockpitInvoiceIds: ["763"] })], invs: [I({ id: "763", nr: "RE-763", gross: 399, contact: "Kunde Q", date: "2026-11-01" })], blitzRevoked: new Set(["A|763"]) }).items.find(x => x.key === "blitz:A");
    assert.strictEqual(rv.unbilled, 399, "Meldung zurückgenommen (Rückgängig) → zählt nicht mehr");
  }]);
  out.push(["A3: Kulanz-Gutschrift zur Blitzdings-Rechnung (Buchungsbetrag unverändert) → nichts „zu verrechnen“, keine Nachverrechnung", () => {
    const it = blitz([bk({ id: "c3", reference: "BD-ABC123", customerName: "Max Muster", paymentStatus: "PAID", totalCents: 50000, sevdeskInvoiceId: "701" })], [I({ id: "701", nr: "RE-701", gross: 500, net: 416.67, paid: 500, ref: "BD-ABC123", credited: 100 })])[0];
    assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.action, null); assert.ok(!(it.notes || []).some(n => /Betrag geändert|nachverrechnen/.test(n.text)), JSON.stringify(it.notes)); assert.strictEqual(it.invoiced, 400);
    // Senkung der Buchung nach der Rechnung, schon gutgeschrieben → kein „Gutschrift prüfen“ mehr
    const it2 = blitz([bk({ id: "c4", reference: "BD-ABC124", customerName: "Max Muster", totalCents: 40000, sevdeskInvoiceId: "702" })], [I({ id: "702", nr: "RE-702", gross: 500, net: 416.67, paid: 500, credited: 100 })])[0];
    assert.ok(!(it2.notes || []).some(n => /Gutschrift prüfen/.test(n.text)), JSON.stringify(it2.notes));
    // übrige Abschnitte: Website (Zeitraum verrechnet, Rechnung mit Kulanz-Gutschrift) und kochdu (alte Version, Monatsrechnung mit Gutschrift „doppelt verrechnet“)
    const rs = abgleichBuild({ year: Y, today: TODAY, sitesSnap: { railway: { projects: [] }, sites: [{ name: "kunde-a3.at", up: true }] }, sev: mkSev([I({ id: "911", nr: "RE-911", gross: 120, credited: 20, date: "2026-01-05" }), I({ id: "912", nr: "RE-912", gross: 40, credited: 8, date: "2026-10-01" })]),
      bill: { prices: { hosting: 10, hostingPer: "month", period: 12, taxRate: 20, gross: true }, sites: { "cf:kunde-a3.at": { active: true, hosting: true, billedUntil: "2026-12-31" } }, invoices: { "site:cf:kunde-a3.at": [{ id: "911", nr: "RE-911", date: "2026-01-05", gross: 120, from: "2026-01-01", to: "2026-12-31" }] } },
      kochdu: { restaurants: [{ id: "7", name: "La Taverna", barOpenCents: 0, barSettledCents: 4000, invoices: [{ docId: "912", nr: "RE-912", month: "2026-09", grossCents: 4000, at: "2026-10-01T08:00:00Z" }] }] } }).items;
    const ws = rs.find(x => x.key === "site:cf:kunde-a3.at"); assert.strictEqual(ws.unbilled, 0); assert.strictEqual(ws.refund, 0); assert.strictEqual(ws.invoiced, 100);
    const kd = rs.find(x => x.key === "kochdu:7"); assert.strictEqual(kd.unbilled, 0); assert.strictEqual(kd.settledWithoutInvoice, 0, "Gutschrift macht nichts „ohne Rechnung“");
  }]);
  out.push(["B5: Kantineur v2 – zweite Rechnung zur selben Zahlung (trotz invoiceId) bleibt sichtbar; storniert mit Ersatz ohne Warnung; Rechnung ohne passende Zahlung gemeldet", () => {
    let r = build({ invs: [I({ id: "902", nr: "RE-902", gross: 9.69, paid: 0, open: 9.69, status: 200, mpid: "tr_dup00001", overdue: true }), I({ id: "901", nr: "RE-901", gross: 9.69, paid: 9.69, mpid: "tr_dup00001" })],
      kantineur: kStats([pay({ molliePaymentId: "tr_dup00001", invoiceId: "901" })]) });
    let it = r.items.find(x => x.key === "kantineur");
    assert.ok(it.notes.some(n => n.lvl === "bad" && /RE-901, RE-902/.test(n.text) && n.inv === "902"), JSON.stringify(it.notes)); assert.strictEqual(it.invoiced, 19.38, "beide zählen, bis eine storniert ist");
    r = build({ invs: [I({ id: "741", nr: "RE-741", gross: 11.63, cancelled: true, mpid: "tr_k5" }), I({ id: "742", nr: "RE-742", gross: 9.69, paid: 9.69, mpid: "tr_k5" })], kantineur: kStats([pay({ molliePaymentId: "tr_k5", invoiceId: "741" })]) });
    it = r.items.find(x => x.key === "kantineur"); assert.strictEqual(it.invoiced, 9.69); assert.ok(!(it.notes || []).some(n => /storniert/.test(n.text)), JSON.stringify(it.notes));
    r = build({ invs: [I({ id: "751", nr: "RE-751", gross: 9.69, paid: 9.69, mpid: "tr_k6" }), I({ id: "752", nr: "RE-752", gross: 11.63, paid: 0, open: 11.63, status: 200, mpid: "tr_k7x" })], kantineur: kStats([pay({ molliePaymentId: "tr_k6", invoiceId: "751" })]) });
    it = r.items.find(x => x.key === "kantineur"); assert.ok(it.notes.some(n => n.inv === "752" && /passt zu keiner Kantineur-Zahlung/.test(n.text)), JSON.stringify(it.notes)); assert.ok(r.unlinked.some(u => u.id === "752"), "offen → auch unter „ohne Zuordnung“");
  }]);
  out.push(["B10/B11: Rückbuchung → „Forderung wieder offen“, kein Gutschrift-Hinweis; Erstattungshinweis verschwindet nach der Gutschrift", () => {
    let it = build({ invs: [I({ id: "761", nr: "RE-761", gross: 9.69, paid: 9.69, mpid: "tr_cb01" })], kantineur: kStats([pay({ molliePaymentId: "tr_cb01", invoiceId: "761", chargedBackCents: 969 })]) }).items.find(x => x.key === "kantineur");
    assert.ok(it.notes.some(n => /Rückbuchung 9,69 €/.test(n.text) && /Forderung ist wieder offen, keine Gutschrift/.test(n.text)), JSON.stringify(it.notes)); assert.ok(!it.notes.some(n => /Gutschrift-Vorschlag/.test(n.text)));
    it = build({ invs: [I({ id: "762", nr: "RE-762", gross: 9.69, paid: 9.69, mpid: "tr_rf01" })], kantineur: kStats([pay({ molliePaymentId: "tr_rf01", invoiceId: "762", refundedCents: 969 })]) }).items.find(x => x.key === "kantineur");
    assert.ok(it.notes.some(n => /Erstattung 9,69 €/.test(n.text) && /Zur Prüfung/.test(n.text)));
    it = build({ invs: [I({ id: "762", nr: "RE-762", gross: 9.69, paid: 9.69, mpid: "tr_rf01", credited: 9.69 })], kantineur: kStats([pay({ molliePaymentId: "tr_rf01", invoiceId: "762", refundedCents: 969 })]) }).items.find(x => x.key === "kantineur");
    assert.ok(!(it.notes || []).some(n => /Erstattung/.test(n.text)), "nach der Gutschrift kein Hinweis mehr: " + JSON.stringify(it.notes));
    // Zahlung ohne invoiceId, Rechnung über „Mollie tr_“ gefunden → derselbe Hinweis (Vorschlag entsteht über die Mollie-ID, siehe fin-credit)
    it = build({ invs: [I({ id: "763", nr: "RE-763", gross: 9.69, paid: 9.69, mpid: "tr_rf02" })], kantineur: kStats([pay({ molliePaymentId: "tr_rf02", refundedCents: 969 })]) }).items.find(x => x.key === "kantineur");
    assert.ok(it.notes.some(n => /Erstattung 9,69 € zu Rechnung RE-763/.test(n.text)));
  }]);

  /* ---- dritte Prüfung (R3) ---- */
  out.push(["R3-1/6, R4-2: Blitzdings-Rechnung voll gutgeschrieben + Cockpit-Ersatz → keine Doppelrechnung; ohne (gültigen) Ersatz → verrechnet mit Prüfhinweis, keine Aktion; Firmenbuchung netto + Differenz → keine Doppelrechnung", () => {
    const b = bk({ id: "cr1", reference: "BD-CR0001", customerName: "Kunde C", paymentStatus: "PAID", sevdeskInvoiceId: "801" });
    const bdInv = I({ id: "801", nr: "RE-801", gross: 399, net: 332.5, paid: 399, contact: "Kunde C", credited: 399, date: "2026-10-01" });
    const recs = { "blitz:cr1": [{ id: "901", nr: "RE-901", gross: 399, date: "2026-11-02", bookingAmount: 399 }] };
    let it = blitz([b], [bdInv, I({ id: "901", nr: "RE-901", gross: 399, net: 332.5, contact: "Kunde C", date: "2026-11-02" })], recs)[0];
    assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.invoiced, 399); assert.ok(!(it.notes || []).some(n => /Doppelrechnung/.test(n.text)), JSON.stringify(it.notes));
    it = blitz([b], [bdInv, I({ id: "901", nr: "RE-901", gross: 399, net: 332.5, contact: "Kunde C", date: "2026-11-02", cancelled: true })], recs)[0];
    assert.strictEqual(it.unbilled, 0, "voll gutgeschrieben, Ersatz storniert → bleibt verrechnet (A3: bewusste Minderung)"); assert.strictEqual(it.action, null);
    assert.ok(it.notes.some(n => n.lvl === "warn" && /RE-801 ist voll gutgeschrieben – Storno bzw. Kulanz prüfen/.test(n.text)), JSON.stringify(it.notes));
    assert.ok(!it.notes.some(n => /gehört schon zu|Online bezahlt, aber ohne Rechnung/.test(n.text)), "kein Hinweis auf die eigene Rechnung, kein „ohne Rechnung“: " + JSON.stringify(it.notes));
    // nur die Blitzdings-Rechnung, voll gutgeschrieben (Kulanz) bzw. nur eine voll gutgeschriebene Cockpit-Rechnung → ebenso
    for (const [books, invs, rr] of [[[b], [bdInv], {}], [[bk({ id: "cr8", reference: "BD-CR0008", customerName: "Kunde C" })], [I({ id: "881", nr: "RE-881", gross: 399, contact: "Kunde C", credited: 399 })], { "blitz:cr8": [{ id: "881", nr: "RE-881", gross: 399, date: "2026-11-06" }] }]]) {
      it = blitz(books, invs, rr)[0]; assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.action, null); assert.ok(it.notes.some(n => /voll gutgeschrieben – Storno bzw. Kulanz prüfen/.test(n.text)), JSON.stringify(it.notes));
      assert.ok(!it.notes.some(n => /gehört schon zu|Online bezahlt/.test(n.text)), JSON.stringify(it.notes)); }
    // stornierte Buchung mit voll gutgeschriebener Rechnung: schon erledigt, kein „Storno prüfen“
    it = blitz([bk({ id: "cr9", reference: "BD-CR0009", customerName: "Kunde C", status: "CANCELLED", sevdeskInvoiceId: "801" })], [bdInv])[0];
    assert.ok(!it || !(it.notes || []).some(n => /Storno prüfen/.test(n.text)), JSON.stringify(it && it.notes));
    // teilweise gutgeschrieben bleibt wie bisher (A3: Gutschrift = bewusste Minderung, keine Nachverrechnung)
    it = blitz([b], [Object.assign({}, bdInv, { credited: 99 })])[0]; assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.action, null);
    // echte Doppelrechnung bleibt rot
    it = blitz([b], [Object.assign({}, bdInv, { credited: 0 }), I({ id: "901", nr: "RE-901", gross: 399, net: 332.5, contact: "Kunde C", date: "2026-11-02" })], recs)[0];
    assert.ok(it.notes.some(n => n.lvl === "bad" && /Doppelrechnung prüfen/.test(n.text)), JSON.stringify(it.notes));
    // Firmenbuchung netto 449: Blitzdings-Rechnung 478,80 brutto (399 netto) + Cockpit-Differenz 60 brutto (50 netto) → passt, nicht doppelt
    it = blitz([bk({ id: "fn1", reference: "BD-FN0001", customerName: "Anna", companyName: "Hotel Alpenrose", totalCents: 44900, sevdeskInvoiceId: "811" })],
      [I({ id: "811", nr: "RE-811", gross: 478.8, net: 399, contact: "Hotel Alpenrose", date: "2026-10-01" }), I({ id: "911", nr: "RE-911", gross: 60, net: 50, contact: "Hotel Alpenrose", date: "2026-11-02" })], { "blitz:fn1": [{ id: "911", nr: "RE-911", gross: 60, date: "2026-11-02", bookingAmount: 449 }] })[0];
    assert.strictEqual(it.unbilled, 0); assert.ok(!(it.notes || []).some(n => /Doppelrechnung/.test(n.text)), JSON.stringify(it.notes));
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

  /* Teil 1b: Doppelrechnungs-Meldung (B2) und Rücknahme einer Meldung (B7) – eigene Kopie mit Blitzdings-Zugang (nie erreichbar: Port 9) */
  await (async () => {
    const bdir = copyApp();
    Object.assign(process.env, { BLITZDINGS_COCKPIT_TOKEN: "tok-test", BLITZDINGS_COCKPIT_URL: "http://127.0.0.1:9/api/cockpit" });
    let B = null; try { B = Object.assign({}, require(path.join(bdir, "server.js"))._test, global.__fscBillingTest); } catch (e) { fails.push("server.js (Blitzdings) laden\n    " + (e && e.stack || e)); fail++; }
    delete process.env.BLITZDINGS_COCKPIT_TOKEN; delete process.env.BLITZDINGS_COCKPIT_URL;
    if (!B || fs.realpathSync(path.dirname(B.BLITZ_REPORT_FILE)) !== fs.realpathSync(bdir)) { if (B) console.log("HINWEIS: B2/B7-Tests übersprungen (DATA_DIR ist nicht die Temp-Kopie)"); return; }
    const I = (o) => Object.assign({ type: "RE", status: 1000, date: "2026-11-05", contact: "Kunde", gross: 399, net: 332.5, paid: 399, open: 0, cancelled: false }, o);
    const sev = (all) => ({ invoices: all, invoicesAll: all });
    const bk = (o) => Object.assign({ totalCents: 39900, status: "CONFIRMED", paymentStatus: "UNPAID", eventDate: "2026-11-10", invoiceIds: [], cockpitInvoiceIds: [] }, o);
    await t("B2: Blitzdings meldet „duplicate“ für eine Nachverrechnung bzw. einen Ersatz → keine Doppelrechnungs-Meldung, gespeicherter Eintrag verschwindet", () => {
      const st = B.blitzReportState(); st.since = "2026-01-01T00:00:00.000Z";
      st.dup = { "g|652": { bookingId: "g", invoiceId: "652", other: "651" }, "f|643": { bookingId: "f", invoiceId: "643", other: "641" }, "h|662": { bookingId: "h", invoiceId: "662", other: "661" } };
      st.done = { "g|652": new Date().toISOString(), "f|643": new Date().toISOString(), "h|662": new Date().toISOString() }; B.blitzReportSave(st);
      const books = [bk({ id: "g", reference: "BD-GGG777", totalCents: 44900, sevdeskInvoiceId: "651", invoiceIds: ["651", "652"] }), bk({ id: "f", reference: "BD-FFF666", sevdeskInvoiceId: "641", invoiceIds: ["641", "643"] }),
        bk({ id: "h", reference: "BD-HHH888", sevdeskInvoiceId: "661", invoiceIds: ["661", "662"] })];
      const bill = { invoices: { "blitz:g": [{ id: "652", nr: "RE-652", gross: 50, date: "2026-11-15" }], "blitz:f": [{ id: "643", nr: "RE-643", gross: 449, date: "2026-11-04" }], "blitz:h": [{ id: "662", nr: "RE-662", gross: 399, date: "2026-11-05" }] } };
      const invs = [I({ id: "651", nr: "RE-651" }), I({ id: "652", nr: "RE-652", gross: 50 }), I({ id: "641", nr: "RE-641", cancelled: true }), I({ id: "643", nr: "RE-643", gross: 449 }), I({ id: "661", nr: "RE-661" }), I({ id: "662", nr: "RE-662" })];
      const rep = B.blitzReportReconcile(books, bill, sev(invs));
      assert.deepStrictEqual(rep.duplicates.map(d => d.bookingId + "|" + d.invoiceId), ["h|662"], JSON.stringify(rep.duplicates));
      assert.deepStrictEqual(Object.keys(B.blitzReportState().dup), ["h|662"], "aufgelöste Einträge gelöscht");
      // die echte Doppelrechnung löst sich auf (RE-662 storniert) → verschwindet
      const rep2 = B.blitzReportReconcile(books, bill, sev(invs.map(i => i.id === "662" ? Object.assign({}, i, { cancelled: true }) : i)));
      assert.strictEqual(rep2.duplicates.length, 0); assert.deepStrictEqual(Object.keys(B.blitzReportState().dup), []);
      // Buchungsliste nicht geladen: echte Doppelrechnung mit verschiedenen Beträgen bleibt gespeichert
      const st3 = B.blitzReportState(); st3.dup = { "h|662": { bookingId: "h", invoiceId: "662", other: "661" } }; B.blitzReportSave(st3);
      const inv3 = invs.map(i => i.id === "662" ? Object.assign({}, i, { gross: 349 }) : i);
      assert.strictEqual(B.blitzReportReconcile(null, bill, sev(inv3)).duplicates.length, 1); assert.ok(B.blitzReportState().dup["h|662"], "nicht gelöscht");
      // Buchhaltung nicht geladen → nichts löschen
      const st2 = B.blitzReportState(); st2.dup = { "h|662": { bookingId: "h", invoiceId: "662", other: "661" } }; B.blitzReportSave(st2);
      assert.strictEqual(B.blitzReportReconcile(books, bill, null).duplicates.length, 1); assert.ok(B.blitzReportState().dup["h|662"]);
    });
    await t("R3-1/6: Doppelrechnungs-Meldung – voll gutgeschriebene Blitzdings-Rechnung + Ersatz bzw. Firmenbuchung netto mit Differenzrechnung → keine Meldung; echte bleibt", () => {
      const st = B.blitzReportState(); st.since = "2026-01-01T00:00:00.000Z"; st.q = {}; st.done = {};
      st.dup = { "c|901": { bookingId: "c", invoiceId: "901", other: "801" }, "n|904": { bookingId: "n", invoiceId: "904", other: "804" }, "z|902": { bookingId: "z", invoiceId: "902", other: "802" } }; B.blitzReportSave(st);
      const books = [bk({ id: "c", reference: "BD-CCC901", sevdeskInvoiceId: "801", invoiceIds: ["801"] }), bk({ id: "n", reference: "BD-NNN904", totalCents: 44900, sevdeskInvoiceId: "804", invoiceIds: ["804", "904"] }),
        bk({ id: "z", reference: "BD-ZZZ902", sevdeskInvoiceId: "802", invoiceIds: ["802", "902"] })];
      const bill = { invoices: { "blitz:c": [{ id: "901", nr: "RE-901", gross: 399, date: "2026-11-02" }] } };
      const invs = [I({ id: "801", nr: "RE-801", credited: 399 }), I({ id: "901", nr: "RE-901" }), I({ id: "804", nr: "RE-804", gross: 478.8, net: 399 }), I({ id: "904", nr: "RE-904", gross: 60, net: 50 }), I({ id: "802", nr: "RE-802" }), I({ id: "902", nr: "RE-902" })];
      const rep = B.blitzReportReconcile(books, bill, sev(invs));
      assert.deepStrictEqual(rep.duplicates.map(d => d.bookingId + "|" + d.invoiceId), ["z|902"], JSON.stringify(rep.duplicates));
      assert.deepStrictEqual(Object.keys(B.blitzReportState().dup), ["z|902"]);
      assert.ok(B.blitzReportState().q["c|901"], "Ersatzrechnung wird normal gemeldet (nicht als doppelt verworfen)");
      // Firmenbuchung netto: 2× 478,80 (brutto UND netto über der Buchung) → echte Doppelrechnung
      const st2 = B.blitzReportState(); st2.dup = { "n|904": { bookingId: "n", invoiceId: "904", other: "804" } }; st2.q = {}; B.blitzReportSave(st2);
      assert.strictEqual(B.blitzReportReconcile(books, bill, sev(invs.map(i => i.id === "904" ? Object.assign({}, i, { gross: 478.8, net: 399 }) : i))).duplicates.map(d => d.bookingId + "|" + d.invoiceId).join(), "n|904");
      const st3 = B.blitzReportState(); st3.dup = {}; st3.q = {}; B.blitzReportSave(st3);
    });
    await t("B7: „Rückgängig“ einer Zuordnung blitz:<id> nimmt die wartende Meldung heraus bzw. vermerkt die gesendete als zurückgenommen", () => {
      B.billingOp({ op: "invoice", key: "blitz:bkR1", invoice: { id: "9101", nr: "RE-9101", gross: 399 } });
      assert.ok(B.blitzReportState().q["bkR1|9101"], "gemeldet (wartet, Blitzdings nicht erreichbar)");
      B.billingOp({ op: "unbill", key: "blitz:bkR1" });
      assert.ok(!B.blitzReportState().q["bkR1|9101"], "wartende Meldung entfernt");
      const st = B.blitzReportState(); st.done["bkR2|9102"] = new Date().toISOString(); B.blitzReportSave(st);
      B.billingOp({ op: "invoice", key: "blitz:bkR2", invoice: { id: "9102", nr: "RE-9102", gross: 399 } });
      B.billingOp({ op: "unbill", key: "blitz:bkR2" });
      assert.ok(B.blitzReportState().revoked["bkR2|9102"] && !B.blitzReportState().done["bkR2|9102"], JSON.stringify(B.blitzReportState()));
      B.billingOp({ op: "invoice", key: "blitz:bkR2", invoice: { id: "9102", nr: "RE-9102", gross: 399 } });
      assert.ok(!B.blitzReportState().revoked["bkR2|9102"], "wieder zugeordnet → gilt wieder");
    });
  })();

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
  await t("KA-2 Weg 2: Kantineur meldet Erstattung ohne Mollie-Umsatz → Gutschrift ohne Zuordnung; später kommt der Erstattungsumsatz → nur noch Zuordnung zur selben Gutschrift", async () => {
    const seed = [acc("2", "Mollie"), contact("40", "SV")].concat(invSeed("820", { gross: 14.9, extra: { status: "1000", paidAmount: "14.90", customerInternalNote: "Mollie tr_late0001" } }));
    const { L, P, C } = finSetup(seed); await L.load();
    const hint = [{ invoiceId: "820", pid: "tr_late0001", cents: 1490 }];   // Erstattung (Rückbuchungen bekommen keine Gutschrift, Review B10)
    assert.strictEqual(await C.refunds(hint), 1);
    let it = (await P.list())[0]; assert.ok(/Erstattung/.test(it.title)); assert.deepStrictEqual(it.txIds, null);
    const r = await P.accept(it.id); const cn = L.get("CreditNote", r.result.creditNoteId);
    assert.strictEqual(+cn.sumGross, 14.9); assert.strictEqual(String(cn.status), "200", "offen bis zur Auszahlung");
    assert.strictEqual(await C.refunds(hint), 0, "schon gutgeschrieben");
    await L.save("CheckAccountTransaction", { id: "921", checkAccount: { id: "2", objectName: "CheckAccount" }, amount: "-14.90", valueDate: iso("2026-11-21"), status: "100", mollieId: "rf21", mollieType: "refund", molliePayment: "tr_late0001" });
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

  /* Teil 2b: Review B1/B4/B10/B11 – Erstattungen aus dem echten Mollie-Abruf, kochdu-Rest, Rückbuchungen */
  const mfetch = (btx) => { const json = o => ({ ok: true, status: 200, json: async () => o });
    return async (url) => { if (/organizations\/me/.test(url)) return json({ name: "FS" }); if (/\/profiles/.test(url)) return json({ _embedded: { profiles: [{ id: "pfl_1", name: "Kantineur" }] }, _links: {} });
      if (/\/balances\?/.test(url)) return json({ _embedded: { balances: [{ id: "bal_1", currency: "EUR", availableAmount: { value: "0" }, pendingAmount: { value: "0" } }] }, _links: {} });
      if (/\/balances\/bal_1\/transactions/.test(url)) return json({ _embedded: { balance_transactions: btx }, _links: {} });
      const m = url.match(/\/payments\/(tr_\w+)/); if (m) return json({ id: m[1], profileId: "pfl_1", description: "Kantineur Abo", details: { consumerName: "SV Stainach" }, metadata: { canteenId: "c1" } });
      return { ok: false, status: 404, json: async () => ({}) }; }; };
  const msync = async (M) => { process.env.MOLLIE_ORG_TOKEN = "test_x"; try { await M.sync({ since: "2026-11-01" }); } finally { delete process.env.MOLLIE_ORG_TOKEN; } };
  const kaAcc = ["CheckAccount", { id: "2", name: "Mollie – Kantineur", status: "100", type: "online", mollieBalance: "bal_1", mollieNamed: true }];
  await t("B1: Erstattung aus dem echten Mollie-Abruf (sync) trägt die Zahlungsnummer → Gutschrift-Vorschlag genau über den erstatteten Betrag, Klick bucht Gutschrift + Zuordnung", async () => {
    const seed = [kaAcc, contact("40", "SV Stainach")].concat(invSeed("800", { gross: 9.69, extra: { status: "1000", paidAmount: "9.69", customerInternalNote: "Mollie tr_refund01" } }));
    const btx = [{ id: "baltr_rf1", type: "refund", resultAmount: { value: "-9.69", currency: "EUR" }, initialAmount: { value: "-9.69", currency: "EUR" }, context: { paymentId: "tr_refund01", refundId: "re_abc123" }, createdAt: "2026-11-18T10:00:00+00:00" }];
    const { L, P, C, M } = finSetup(seed, null, null, mfetch(btx)); await L.load(); await msync(M);
    const rt = L.all("CheckAccountTransaction").find(x => x.mollieType === "refund");
    assert.strictEqual(rt.molliePayment, "tr_refund01"); assert.strictEqual(rt.mollieGross, "-9.69");
    assert.strictEqual(await C.refunds([]), 1, "Weg 1 greift"); const it = (await P.list()).find(x => x.kind === "invoice-credit");
    assert.deepStrictEqual(it.txIds, [String(rt.id)]); const r = await P.accept(it.id); const cn = L.get("CreditNote", r.result.creditNoteId);
    assert.strictEqual(+cn.sumGross, 9.69); assert.strictEqual(String(L.get("CheckAccountTransaction", rt.id).status), "200"); assert.strictEqual(await C.refunds([{ invoiceId: "800", pid: "tr_refund01", cents: 969 }]), 0);
  });
  await t("B1: Mollie zieht beim Erstatten eine Gebühr ab → Gutschrift = erstatteter Betrag (initialAmount), Umsatz nicht automatisch zugeordnet", async () => {
    const seed = [kaAcc, contact("40", "SV")].concat(invSeed("801", { gross: 9.69, extra: { status: "1000", paidAmount: "9.69", customerInternalNote: "Mollie tr_refund02" } }));
    const btx = [{ id: "baltr_rf2", type: "refund", resultAmount: { value: "-9.94", currency: "EUR" }, initialAmount: { value: "-9.69", currency: "EUR" }, deductions: { value: "-0.25", currency: "EUR" }, context: { paymentId: "tr_refund02" }, createdAt: "2026-11-18T10:00:00+00:00" }];
    const { L, P, C, M } = finSetup(seed, null, null, mfetch(btx)); await L.load(); await msync(M);
    assert.strictEqual(await C.refunds([]), 1); const it = (await P.list()).find(x => x.kind === "invoice-credit");
    assert.strictEqual(it.amount, -9.69); assert.ok(!it.txIds || !it.txIds.length, "ohne Zuordnung"); assert.ok(/0,25 € Gebühr/.test(it.detail), it.detail);
    const r = await P.accept(it.id); assert.strictEqual(+L.get("CreditNote", r.result.creditNoteId).sumGross, 9.69);
    assert.strictEqual(String(L.all("CheckAccountTransaction").find(x => x.mollieType === "refund").status), "100"); assert.strictEqual(await C.refunds([]), 0, "kein zweiter Vorschlag");
  });
  await t("R3-10: älterer Erstattungsumsatz ohne Bruttobetrag (Teilerstattung 5,00 + 0,25 Gebühr = 5,25) → nie 5,25 gutschreiben: ohne Angabe kein Vorschlag, mit Kantineur-Meldung bzw. „brutto …, Gebühr …“ genau 5,00", async () => {
    const seed = (purpose) => [kaAcc, contact("40", "SV")].concat(invSeed("806", { gross: 9.69, extra: { status: "1000", paidAmount: "9.69", customerInternalNote: "Mollie tr_teil0001" } }),
      [["CheckAccountTransaction", { id: "941", checkAccount: { id: "2", objectName: "CheckAccount" }, amount: "-5.25", valueDate: iso("2026-11-18"), payeePayerName: "SV", paymtPurpose: purpose, status: "100", mollieId: "rf41", mollieType: "refund", molliePayment: "tr_teil0001" }]]);
    let E = finSetup(seed("Rückerstattung tr_teil0001")); await E.L.load();
    assert.strictEqual(await E.C.refunds([]), 0, "Betrag unbekannt → kein Vorschlag"); assert.strictEqual((await E.P.list()).length, 0);
    E = finSetup(seed("Rückerstattung tr_teil0001")); await E.L.load();
    assert.strictEqual(await E.C.refunds([{ invoiceId: "806", pid: "tr_teil0001", cents: 500 }]), 1); let it = (await E.P.list()).find(x => x.kind === "invoice-credit");
    assert.strictEqual(it.amount, -5, "Kantineur-Meldung als Obergrenze"); assert.ok(!it.txIds || !it.txIds.length, "Umsatz (mit Gebühr) von Hand zuordnen");
    E = finSetup(seed("Kantineur Abo · tr_teil0001 · brutto -5.00, Gebühr 0.25")); await E.L.load();
    assert.strictEqual(await E.C.refunds([]), 1); it = (await E.P.list()).find(x => x.kind === "invoice-credit"); assert.strictEqual(it.amount, -5); assert.ok(!it.txIds || !it.txIds.length);
    const r = await E.P.accept(it.id); assert.strictEqual(+E.L.get("CreditNote", r.result.creditNoteId).sumGross, 5); assert.strictEqual(String(E.L.get("CheckAccountTransaction", "941").status), "100");
  });
  await t("B1: Bestand – Erstattungsumsatz ohne Zahlungsnummer wird aus dem Verwendungszweck nachgetragen (einmalig, idempotent)", async () => {
    const seed = [kaAcc, contact("40", "SV")].concat(invSeed("802", { gross: 9.69, extra: { status: "1000", paidAmount: "9.69", customerInternalNote: "Mollie tr_altbestand1" } }),
      [["CheckAccountTransaction", { id: "905", checkAccount: { id: "2", objectName: "CheckAccount" }, amount: "-9.69", valueDate: iso("2026-11-10"), payeePayerName: "SV", paymtPurpose: "Rückerstattung Kantineur: Kantineur Abo tr_altbestand1", status: "100", mollieId: "baltr_old", mollieType: "refund" }]]);
    const { L, C, M } = finSetup(seed); await L.load();
    assert.strictEqual(await C.refunds([]), 0, "vorher findet Weg 1 nichts");
    assert.strictEqual(await M.backfillRefunds(), 1); assert.strictEqual(L.get("CheckAccountTransaction", "905").molliePayment, "tr_altbestand1");
    assert.strictEqual(await M.backfillRefunds(), 0, "idempotent"); assert.strictEqual(await C.refunds([]), 1);
  });
  await t("B10: Rückbuchung (Chargeback) → kein Gutschrift-Vorschlag, weder aus Mollie noch aus der Kantineur-Meldung", async () => {
    const seed = [kaAcc, contact("40", "SV")].concat(invSeed("803", { gross: 9.69, extra: { status: "1000", paidAmount: "9.69", customerInternalNote: "Mollie tr_cback001" } }));
    const btx = [{ id: "baltr_cb1", type: "chargeback", resultAmount: { value: "-9.69", currency: "EUR" }, initialAmount: { value: "-9.69", currency: "EUR" }, context: { paymentId: "tr_cback001", chargebackId: "chb_1" }, createdAt: "2026-11-18T10:00:00+00:00" }];
    const { L, P, C, M } = finSetup(seed, null, null, mfetch(btx)); await L.load(); await msync(M);
    assert.strictEqual(L.all("CheckAccountTransaction").find(x => x.mollieType === "chargeback").molliePayment, "tr_cback001");
    assert.strictEqual(await C.refunds([{ invoiceId: "803", pid: "tr_cback001", cents: 969, chargeback: true }]), 0); assert.strictEqual((await P.list()).filter(x => x.kind === "invoice-credit").length, 0);
  });
  await t("B11: Kantineur meldet Erstattung ohne invoiceId → Rechnung eindeutig über die Mollie-ID gefunden, Vorschlag entsteht", async () => {
    const seed = [kaAcc, contact("40", "SV")].concat(invSeed("804", { gross: 9.69, extra: { status: "1000", paidAmount: "9.69", customerInternalNote: "Mollie tr_ohneid01" } }));
    const { L, C } = finSetup(seed); await L.load();
    assert.strictEqual(await C.refunds([{ invoiceId: "", pid: "tr_ohneid01", cents: 969 }]), 1);
  });
  await t("B4: kochdu doppelt verrechnet – Gutschrift von Hand oder stornierte Rechnung der Verrechnung von Hand werden abgezogen, nie eine zweite Gutschrift", async () => {
    const rest = [{ id: "R1", name: "La Taverna", months: [{ month: "2026-09", doubleBilledCents: 800, manualCents: 800, doc: { docId: "840", nr: "RE-840" } }] }];
    const base = () => [contact("40", "La Taverna")].concat(invSeed("840", { gross: 42.1, extra: { status: "1000", paidAmount: "42.10", header: "kochdu-Gebühr Barzahlungen 09/2026" } }));
    let E = finSetup(base().concat([["CreditNote", { id: "70", status: "200", creditNoteNumber: "GU-70", sumNet: "6.67", sumTax: "1.33", sumGross: "8.00", paidAmount: "0", refSrcInvoice: { id: "840", objectName: "Invoice" } }]])); await E.L.load();
    assert.strictEqual(await E.C.kochduDouble(rest), 0, "schon von Hand gutgeschrieben");
    E = finSetup(base().concat([["CreditNote", { id: "71", status: "200", creditNoteNumber: "GU-71", sumNet: "2.50", sumTax: "0.50", sumGross: "3.00", paidAmount: "0", refSrcInvoice: { id: "840", objectName: "Invoice" } }]])); await E.L.load();
    assert.strictEqual(await E.C.kochduDouble(rest), 1); assert.strictEqual((await E.P.list())[0].amount, -5, "nur der Rest");
    const bill = { invoices: { "kochdu:R1": [{ id: "850", nr: "RE-850", date: "2026-09-20", gross: 8 }] } };
    E = finSetup(base().concat(invSeed("850", { gross: 8, extra: { status: "1000", paidAmount: "8.00", cancelled: true } })), null, bill); await E.L.load();
    assert.strictEqual(await E.C.kochduDouble(rest), 0, "Rechnung der Verrechnung von Hand storniert → nichts doppelt");
    // storniert, aber gleich neu ausgestellt bzw. eine andere (spätere) Rechnung storniert → Doppelverrechnung besteht weiter
    const bill2 = { invoices: { "kochdu:R1": [{ id: "850", nr: "RE-850", date: "2026-09-20", gross: 8 }, { id: "851", nr: "RE-851", date: "2026-09-25", gross: 8 }, { id: "852", nr: "RE-852", date: "2027-02-10", gross: 40 }] } };
    E = finSetup(base().concat(invSeed("850", { gross: 8, extra: { status: "1000", paidAmount: "8.00", cancelled: true } }), invSeed("851", { gross: 8, extra: { status: "1000", paidAmount: "8.00" } }), invSeed("852", { gross: 40, extra: { status: "1000", paidAmount: "40.00", cancelled: true } })), null, bill2); await E.L.load();
    assert.strictEqual(await E.C.kochduDouble(rest), 1); assert.strictEqual((await E.P.list())[0].amount, -8, "Ersatz bzw. fremder Monat zählt nicht");
    // Vorschlag liegt, danach bucht Simon die Gutschrift von Hand → Vorschlag ungültig
    E = finSetup(base()); await E.L.load(); assert.strictEqual(await E.C.kochduDouble(rest), 1); const it = (await E.P.list())[0];
    await E.L.request("POST", "/Fin/creditNoteFromInvoice", { body: { invoiceId: "840", positions: [{ name: "Gutschrift von Hand", quantity: 1, priceGross: 8, grossPricing: true, taxRate: 20 }] } });
    await assert.rejects(() => E.P.accept(it.id)); assert.strictEqual(E.L.all("CreditNote").length, 1, "keine zweite Gutschrift");
  });
  await t("R3-4: fin-local – Anlegen (POST) mit der ID eines bestehenden Kontakts/Kommunikationswegs legt neu an, überschreibt nie", async () => {
    const E = finSetup([contact("40", "La Taverna"), ["CommunicationWay", { id: "77", objectName: "CommunicationWay", contact: { id: "40", objectName: "Contact" }, type: "EMAIL", value: "wirt@taverna.at", main: true }]]); await E.L.load();
    const c = (await E.L.request("POST", "/Contact", { body: { id: "40", name: "Übernahme" } })).objects;
    assert.notStrictEqual(String(c.id), "40"); assert.strictEqual(E.L.get("Contact", "40").name, "La Taverna");
    const w = (await E.L.request("POST", "/CommunicationWay", { body: { id: "77", contact: { id: "40", objectName: "Contact" }, type: "EMAIL", value: "fremd@example.org" } })).objects;
    assert.notStrictEqual(String(w.id), "77"); assert.strictEqual(E.L.get("CommunicationWay", "77").value, "wirt@taverna.at");
    // neue ID, die es noch nicht gibt (z. B. Übernahme aus sevDesk): bleibt wie bisher
    assert.strictEqual(String((await E.L.request("POST", "/Contact", { body: { id: "4711", name: "Neu" } })).objects.id), "4711");
  });
  await t("R4-1: kochdu – Storno einer Verrechnung von Hand (vor 21.10.) hebt die Doppelung auf (auch ohne Sept-Teil neu ausgestellt); korrigiert neu ausgestellt → besteht; ältester Monat zuerst", async () => {
    // realistische Daten: Monatsrechnung 09/2026 am 15.10. (RE-840), 10/2026 am 01.11. (RE-841)
    const base = [contact("40", "La Taverna")].concat(invSeed("840", { gross: 120, date: "2026-10-15", extra: { status: "1000", paidAmount: "120.00" } }), invSeed("841", { gross: 130, date: "2026-11-01", extra: { status: "1000", paidAmount: "130.00" } }));
    const sept = { month: "2026-09", doubleBilledCents: 5000, manualCents: 5000, doc: { docId: "840", nr: "RE-840" } }, okt = { month: "2026-10", doubleBilledCents: 6000, manualCents: 6000, doc: { docId: "841", nr: "RE-841" } };
    const run = async (hand, months) => { const seed = base.slice(), recs = [];
      hand.forEach(([id, date, gross, cancelled]) => { seed.push(...invSeed(id, { gross, date, extra: { status: "1000", paidAmount: String(gross), cancelled: !!cancelled } })); recs.push({ id, nr: "RE-" + id, date, gross }); });
      const E = finSetup(seed, null, { invoices: { "kochdu:R1": recs } }); await E.L.load(); await E.C.kochduDouble([{ id: "R1", name: "La Taverna", months: months || [sept] }]);
      return { E, list: (await E.P.list()).map(x => [x.key, x.amount]) }; };
    assert.deepStrictEqual((await run([["850", "2026-10-16", 80, true]])).list, [], "16.10. (Sept 50 + Okt 30) storniert, nicht neu");
    assert.deepStrictEqual((await run([["850", "2026-10-15", 80, true]])).list, [], "15.10. storniert");
    assert.deepStrictEqual((await run([["850", "2026-10-20", 50, true]])).list, [], "20.10. storniert");
    assert.deepStrictEqual((await run([["850", "2026-10-05", 80, true], ["851", "2026-10-06", 30]])).list, [], "storniert und ohne Sept-Teil neu ausgestellt");
    assert.deepStrictEqual((await run([["850", "2026-10-03", 50]])).list, [["kodouble:840:5000", -50]], "Hand-Rechnung gültig → Doppelung besteht");
    assert.deepStrictEqual((await run([["850", "2026-10-03", 50, true], ["851", "2026-10-05", 52]])).list, [["kodouble:840:5000", -50]], "korrigiert neu ausgestellt (52 statt 50) → besteht");
    assert.deepStrictEqual((await run([["830", "2026-09-05", 45, true], ["831", "2026-09-06", 48], ["850", "2026-10-03", 50]])).list, [["kodouble:840:5000", -50]], "Aug-Verrechnung storniert und neu → betrifft den Sept nicht");
    // nach dem 21.10. (Sept-Monatsrechnung gab es schon) deckt eine Verrechnung von Hand den September nicht mehr – ihr Storno ändert nichts
    assert.deepStrictEqual((await run([["850", "2026-10-03", 50], ["860", "2026-10-28", 40, true]])).list, [["kodouble:840:5000", -50]]);
    // zwei doppelte Monate, ein Storno über 80 (16.10.): zuerst September (50), Rest 30 für Oktober → Oktober 60 − 30
    const two = await run([["850", "2026-10-16", 80, true]], [sept, okt]);
    assert.deepStrictEqual(two.list, [["kodouble:841:3000", -30]]);
    const it = (await two.E.P.list())[0]; assert.ok(/stornierte Verrechnung von Hand vorhanden – bitte prüfen/.test(it.detail), it.detail);
    assert.ok(two.E.C.valid(it), "Vorschlag bleibt gültig (gleiche Rechnung beim Prüfen)");
    const r = await two.E.P.accept(it.id); assert.strictEqual(+two.E.L.get("CreditNote", r.result.creditNoteId).sumGross, 30);
  });
  /* Teil 2c: Anzeigen (B11) – plat.js/geld.js in einer vm mit Stub-Cockpit */
  const bootUi = (file, D, UI, over) => { const vm = require("vm"), views = {};
    const base = { UI: Object.assign({ platOpen: {} }, UI || {}), D, actions: {}, icons: {}, geldTabs: [{ id: "uebersicht" }], _pendTabs: [], SRC: {}, api: () => new Promise(() => {}),
      esc: x => String(x == null ? "" : x), eur: n => (+n || 0).toFixed(2) + " €", eur0: n => Math.round(+n || 0) + " €", de: x => String(x || ""), deShort: x => String(x || ""),
      view(v) { views[v.id] = v; }, action(n, f) { base.actions[n] = f; }, head: (a, b, c) => "<h1>" + a + "</h1>" + (c || ""), ls: () => null };
    Object.assign(base, over || {}); views._F = base;
    const F = new Proxy(base, { get: (o, k) => (k in o ? o[k] : (typeof k === "string" ? function () { return ""; } : undefined)) });
    const ctx = { window: { FSC: F }, document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }, setTimeout: () => 0, clearTimeout() {}, Date, Math, JSON, Object, String, Array, Promise, console, Number, isFinite, parseFloat, encodeURIComponent };
    vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, "admin-cockpit", file), "utf8"), ctx); return views; };
  await t("B11: kochdu-Zeile „Doppelt verrechnet“ verschwindet nach der Gutschrift (Teil-Gutschrift: nur der Rest); BD-10-Banner auch unter „Zu verrechnen“", () => {
    const D = { year: "2026", today: "2026-11-20", sev: { invoices: [{ id: "840", nr: "RE-840", status: 1000, gross: 42.1, credited: 8 }] }, abgleich: { items: [], unlinked: [], totals: { unbilled: 0 } },
      platforms: { kochdu: { totals: {}, restaurants: [{ id: "R1", name: "La Taverna", months: [{ month: "2026-09", doubleBilledCents: 800, doc: { docId: "840", nr: "RE-840" } }] }] } } };
    const v = bootUi("plat.js", D, { plat: "kochdu" });
    assert.ok(!/Doppelt verrechnet/.test(v.plat.render()), "gutgeschrieben → keine Zeile");
    D.sev.invoices[0].credited = 3; assert.ok(/davon 3\.00 € gutgeschrieben, offen 5\.00 €/.test(v.plat.render()));
    D.sev.invoices[0].credited = 0; assert.ok(/Doppelt verrechnet<\/span><span class="pl-ckt">La Taverna 09\/2026: 8\.00 €/.test(v.plat.render()));
    const G = { year: "2026", today: "2026-11-20", sevConfigured: false, sev: null, abgleich: { items: [], unlinked: [], totals: { unbilled: 0 }, blitzStatus: { status: "fehlt", error: "keine Antwort" } }, platforms: {} };
    const g = bootUi("geld.js", G, { geldTab: "uebersicht", money: "zu" });
    assert.ok(/Blitzdings-Buchungen nicht geladen/.test(g.geld.render())); G.abgleich.blitzStatus = { status: "ok" }; assert.ok(!/Blitzdings-Buchungen nicht/.test(g.geld.render()));
  });
  await t("R3-7: Entwurf bearbeiten – sevDesk-Bruttoentwurf (3 × 10,00, netto 8,3333) bleibt 30,00 (nicht 29,99); netto-genauer Entwurf (7 × 10,04) bleibt 84,34", async () => {
    const seedA = [contact("24", "Firma GmbH"), ["Invoice", { id: "1270", invoiceType: "RE", status: "100", header: "Rechnung", contact: { id: "24", objectName: "Contact" }, invoiceDate: iso("2026-09-20"), sumNet: "25.00", sumTax: "5.00", sumGross: "30.00" }],
      ["InvoicePos", { id: "12701", invoice: { id: "1270", objectName: "Invoice" }, quantity: "3", price: "8.3333", priceNet: "8.3333", priceGross: "10", taxRate: "20", sumNet: "25.00", sumTax: "5.00", sumGross: "30.00", name: "Hosting", positionNumber: "0" }],
      ["Invoice", { id: "1271", invoiceType: "RE", status: "100", header: "Rechnung", contact: { id: "24", objectName: "Contact" }, invoiceDate: iso("2026-10-20"), sumNet: "70.28", sumTax: "14.06", sumGross: "84.34" }],
      ["InvoicePos", { id: "12711", invoice: { id: "1271", objectName: "Invoice" }, quantity: "7", price: "10.04", priceNet: "10.04", priceGross: "12.05", taxRate: "20", sumNet: "70.28", sumTax: "14.06", sumGross: "84.34", name: "Beratung", positionNumber: "0" }]];
    const { L } = finSetup(seedA); await L.load();
    const sevNum = x => parseFloat(x) || 0;
    const O = require(path.join(ROOT, "sevdesk-ops.js"))({ sev: (m, p, o) => L.request(m, p, o), sevAll: async () => [], sevNum, sevDay: x => String(x || "").slice(0, 10), sevName: x => (x && x.name) || "",
      sevDateDE: d => d, sevNet: (g, r) => r2(g / (1 + r / 100)), viennaToday: () => "2026-10-20", sevMeta: async () => ({}), snapshot: async () => ({}), invalidate: () => {}, sevBook: async () => ({}) });
    for (const [id, want] of [["1270", "30.00"], ["1271", "84.34"]]) {
      const det = Object.assign({ ok: true }, await O.invoiceDetail(id)); let pre = null;
      const v = bootUi("sevdesk.js", {}, {}, { api: () => Promise.resolve(det), openInvoice: p => { pre = p; }, closeDrawer() {} });
      await v._F.actions.sdedit(id); await new Promise(r => setImmediate(r));
      assert.ok(pre && pre.items.length === 1, "Formular geöffnet");
      // wie server.js sevCreateInvoice: Preis je Position über sevPosPrice, gespeichert mit fin-local
      const pos = pre.items.map(it => Object.assign({ objectName: "InvoicePos", mapAll: true, quantity: it.qty, name: it.name, taxRate: it.taxRate }, T.sevPosPrice(it, it.taxRate)));
      const inv = (await L.request("POST", "/Invoice/Factory/saveInvoice", { body: { invoice: { header: "Rechnung", invoiceType: "RE", status: 100, contact: { id: "24", objectName: "Contact" } }, invoicePosSave: pos } })).objects.invoice;
      assert.strictEqual(inv.sumGross, want, "Entwurf " + id + ": " + JSON.stringify(pre.items));
    }
  });
  await t("R3-8/R4-3: Rechnungsformular – netto vorgegebener Preis bleibt netto-genau, auch bei geändertem Steuersatz (Brutto neu aus dem Netto); Vorschau = Rechnung", async () => {
    // irow/invItems/invSum aus shared.js mit einer Mini-Zeile (Attribute aus dem erzeugten HTML)
    const src = fs.readFileSync(path.join(ROOT, "admin-cockpit", "shared.js"), "utf8"), vm = require("vm");
    const iRow = src.slice(src.indexOf("function irow(it){"), src.indexOf("\n", src.indexOf("function irow(it){"))), iInv = src.slice(src.indexOf("function invItems(){"), src.indexOf('F.listen("input","#irows",invSum);'));
    const parse = html => { const els = []; html.replace(/<input([^>]*)>|<select([^>]*)>([\s\S]*?)<\/select>/g, (m, ai, as, inner) => { const a = {}, tag = ai != null ? "input" : "select", attrs = ai != null ? ai : as; attrs.replace(/([\w-]+)="([^"]*)"/g, (x, k, v) => { a[k] = v; });
      let value = a.value || ""; if (tag === "select") { const sel = (inner || "").match(/<option value="([^"]*)" selected>/); value = sel ? sel[1] : ""; }
      els.push({ a, value, getAttribute: k => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); } }); }); return { els, querySelector: q => els.find(e => '[data-i="' + e.a["data-i"] + '"]' === q) || null }; };
    const run = (item, edit) => { const ctx = { esc: x => String(x == null ? "" : x).replace(/"/g, "&quot;"), eur: n => (+n).toFixed(2), out: {} };
      vm.createContext(ctx); vm.runInContext(iRow + "\n" + iInv, ctx); const row = parse(ctx.irow(item)); if (edit) edit(row, ctx);
      ctx.document = { querySelectorAll: () => [row], getElementById: () => ctx.out }; const items = ctx.invItems(); ctx.invSum(); return { items, sum: ctx.out.textContent }; };
    const it0 = { name: "Website-Betreuung", qty: 1, priceGross: 120, priceNet: 100, taxRate: 20 };
    let r = run(it0); assert.strictEqual(r.items[0].priceNet, 100, "unverändert → netto-genau"); assert.strictEqual(r.sum, "Summe brutto 120.00");
    // Steuersatz 20 → 0 % (wie der Handler: netTax, dann Summe): Netto 100 bleibt, Brutto wird 100; Rechnung = Vorschau = 100
    r = run(it0, (row, c) => { row.querySelector('[data-i="tax"]').value = "0"; c.netTax(row); });
    assert.strictEqual(r.items[0].priceNet, 100, "Netto bleibt"); assert.strictEqual(r.items[0].priceGross, 100); assert.strictEqual(r.sum, "Summe brutto 100.00");
    assert.deepStrictEqual(T.sevPosPrice(r.items[0], 0), { price: 100 }, "Rechnung netto 100 = Vorschau");
    r = run(it0, (row, c) => { row.querySelector('[data-i="tax"]').value = "10"; c.netTax(row); }); assert.strictEqual(r.items[0].priceNet, 100); assert.strictEqual(r.sum, "Summe brutto 110.00");
    // Preis von Hand geändert, danach Steuersatz → der eingetippte Bruttopreis gilt (Vorschau = Rechnung)
    r = run(it0, (row, c) => { row.querySelector('[data-i="price"]').value = "150"; row.querySelector('[data-i="tax"]').value = "0"; c.netTax(row); });
    assert.strictEqual(r.items[0].priceNet, undefined); assert.strictEqual(r.sum, "Summe brutto 150.00"); assert.deepStrictEqual(T.sevPosPrice(r.items[0], 0), { price: 150, priceGross: 150, grossPricing: true });
    // Netto mit mehr als 2 Nachkommastellen (z. B. KI): Vorschau rundet den Einzelpreis wie der Server (7 × 36,93 = 258,51 netto → 310,21)
    r = run({ name: "KI", qty: 7, priceGross: 44.32, priceNet: 36.9333, taxRate: 20 }); assert.strictEqual(r.sum, "Summe brutto 310.21");
    // 7 × 10,04 netto: Vorschau wie die Buchhaltung (84,34), nicht 7 × 12,05 = 84,35
    r = run({ name: "Beratung", qty: 7, priceGross: 12.05, priceNet: 10.04, taxRate: 20 }); assert.strictEqual(r.sum, "Summe brutto 84.34");
    r = run({ name: "Beratung", qty: 7, priceGross: 12.05, taxRate: 20 }); assert.strictEqual(r.sum, "Summe brutto 84.35", "brutto eingegeben");
    r = run(it0, row => { row.querySelector('[data-i="price"]').value = "150"; }); assert.strictEqual(r.items[0].priceNet, undefined, "Preis neu eingetippt"); assert.strictEqual(r.sum, "Summe brutto 150.00");
  });
  await t("R3-12: Nachverrechnung mit zwei Teilzeiträumen, eine Position im Formular geändert → nur deren Zeitraum ändert sich (nicht anteilig über alle)", async () => {
    const src = fs.readFileSync(path.join(ROOT, "admin-cockpit", "shared.js"), "utf8"), vm = require("vm"), ctx = {};
    vm.createContext(ctx); vm.runInContext(src.slice(src.indexOf("function adjParts("), src.indexOf('F.listen("input","#irows",invSum);')), ctx);
    const parts = [{ from: "2026-01-01", to: "2026-03-31", gross: 30 }, { from: "2026-04-01", to: "2026-06-30", gross: 20 }];
    const items = [{ qty: 1, priceGross: 25, taxRate: 20 }, { qty: 1, priceGross: 20, taxRate: 20 }];
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.adjParts(parts, items))), [{ from: "2026-01-01", to: "2026-03-31", gross: 25 }, { from: "2026-04-01", to: "2026-06-30", gross: 20 }]);
    assert.strictEqual(ctx.adjParts(parts, items.slice(0, 1)), parts, "Position gelöscht → Server rechnet anteilig um (wie bisher)");
    const BT = global.__fscBillingTest; if (!BT || !BT.billingOp || !BT.readBilling || !fs.realpathSync(path.dirname(BT.BILLING_FILE)).startsWith(fs.realpathSync(os.tmpdir()))) { console.log("HINWEIS: R3-12 billingOp-Teil übersprungen"); return; }
    BT.billingOp({ op: "invoice", key: "valuero:haus-r3", invoice: { id: "9701", nr: "RE-9701", gross: 45, adj: true, parts: ctx.adjParts(parts, items) } });
    assert.deepStrictEqual(BT.readBilling().invoices["valuero:haus-r3"][0].parts.map(p => p.gross), [25, 20], "Server übernimmt die Teilbeträge unverändert");
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

  /* Teil 4b: Review B8/B9 und „Belege mit positiver Summe exakt wie bisher“ (Vergleich mit dem Steuerkern vor dem Plattform-Umbau, Commit 092b4b0) */
  const StIst = { docs: {}, uva: {}, mapping: {}, jabInput: {}, trips: {}, settings: { besteuerung: "ist", istAb: "2026-01-01" }, today: "2026-11-20" };
  await t("B8: negative Summe mit Zahlung, Rücknahme, Zahlung → Anteil 1 (nicht 3) – positiv wie negativ gespeicherte Zahlungen; UVA, Kontrollrechnung, E1a", () => {
    for (const sg of [1, -1]) {
      const d = payout({ pays: [{ date: "2026-11-10", amount: 95.5 * sg }, { date: "2026-11-12", amount: -95.5 * sg }, { date: "2026-11-14", amount: 95.5 * sg }], paid: 95.5 * sg });
      const u = S.computeUva({ invoices: [d], vouchers: [], creditNotes: [] }, StIst, Q4); assert.strictEqual(K(u, "022"), 0.75, "Vorzeichen " + sg); assert.strictEqual(K(u, "090"), 0);
      assert.strictEqual(S.controlCheck({ invoices: [d], vouchers: [], creditNotes: [] }, StIst, Q4).ust, 0.75);
      const j = S.computeJab({ invoices: [d], vouchers: [], creditNotes: [] }, StIst, 2026); assert.strictEqual(r2(j.revDocs.filter(x => x.doc.id === "iP").reduce((a, x) => a + x.net, 0)), -96.25, "E1a einmal");
    }
  });
  await t("R3-3: E1a – Lieferantengutschrift/negativer Einnahmenbeleg mit positiv gespeicherter Zahlung mindert (wie negativ gespeichert); Gutschrift mit Zahlung, Rücknahme, Zahlung zählt einmal", () => {
    const vou = (o) => { const ls = [{ rate: 20, net: o.net, tax: o.tax, cat: o.cat || "Software", catId: "", catType: "" }];
      return Object.assign({ id: "vR3", date: "2026-10-05", delivery: null, payDate: null, status: 1000, cd: "C", taxType: "default", taxRule: "9", supplier: "Lieferant", supplierUid: "", supplierCountry: "AT", desc: "", net: o.net, tax: o.tax, gross: r2(o.net + o.tax), enshrined: false, lines: ls }, o); };
    const jab = v => S.computeJab({ invoices: [], vouchers: [v], creditNotes: [] }, StIst, 2026);
    for (const sg of [1, -1]) {
      const c = jab(vou({ net: -50, tax: -10, paid: 60 * sg, pays: [{ date: "2026-10-10", amount: 60 * sg }] }));
      assert.strictEqual(r2(c.gewinn), 50, "Lieferantengutschrift mindert den Aufwand (Zahlung " + (60 * sg) + ")");
      const d = jab(vou({ cd: "D", taxRule: "1", cat: "Erlöse", net: -8.07, tax: -1.62, paid: 9.69 * sg, pays: [{ date: "2026-10-10", amount: 9.69 * sg }] }));
      assert.strictEqual(r2(d.rev), -8.07, "Erstattung an Kunden mindert die Einnahmen (Zahlung " + (9.69 * sg) + ")");
    }
    // positive Summe unverändert: Eingangsbeleg 120 bezahlt → Aufwand 100
    assert.strictEqual(r2(jab(vou({ net: 100, tax: 20, paid: 120, pays: [{ date: "2026-10-10", amount: 120 }] })).gewinn), -100);
    // Gutschrift an Kunden: Zahlung, Rücknahme, Zahlung = einmal (UVA Ist und E1a), gleiche Vorzeichen wie bisher |Anteil|
    const cn = pays => ({ id: "cnR3", sevId: "1", nr: "GU-1", type: "GU", status: 1000, date: "2026-11-03", delivery: "2026-11-03", taxType: "default", taxRule: "1", contact: "Kunde", country: "AT", uid: "", net: 100, tax: 20, gross: 120, pays, lines: [{ rate: 20, net: 100, tax: 20 }], enshrined: false });
    for (const sg of [1, -1]) {
      const once = cn([{ date: "2026-11-10", amount: 120 * sg }]), thrice = cn([{ date: "2026-11-10", amount: 120 * sg }, { date: "2026-11-12", amount: -120 * sg }, { date: "2026-11-14", amount: 120 * sg }]);
      const u1 = S.computeUva({ invoices: [], vouchers: [], creditNotes: [once] }, StIst, Q4), u3 = S.computeUva({ invoices: [], vouchers: [], creditNotes: [thrice] }, StIst, Q4);
      assert.strictEqual(K(u1, "090"), -20); assert.strictEqual(K(u3, "090"), -20, "Rücknahme zählt gegen (Vorzeichen " + sg + ")");
      const e = d => r2(S.computeJab({ invoices: [], vouchers: [], creditNotes: [d] }, StIst, 2026).rev);
      assert.strictEqual(e(once), -100); assert.strictEqual(e(thrice), -100);
    }
  });
  await t("R4-4: Rücknahme am selben Tag vor der Zahlung gelistet → Richtung aus der Summe der Zahlungen (Gutschrift und Beleg mit negativer Summe zählen einmal, Vorzeichen richtig)", () => {
    const cn = pays => ({ id: "cnR4", sevId: "1", nr: "GU-1", type: "GU", status: 1000, date: "2026-11-03", delivery: "2026-11-03", taxType: "default", taxRule: "1", contact: "Kunde", country: "AT", uid: "", net: 100, tax: 20, gross: 120, pays, lines: [{ rate: 20, net: 100, tax: 20 }], enshrined: false });
    for (const sg of [1, -1]) {
      const d = cn([{ date: "2026-11-10", amount: -120 * sg }, { date: "2026-11-10", amount: 120 * sg }, { date: "2026-11-12", amount: 120 * sg }]);
      assert.strictEqual(K(S.computeUva({ invoices: [], vouchers: [], creditNotes: [d] }, StIst, Q4), "090"), -20, "UVA (Vorzeichen " + sg + ")");
      assert.strictEqual(r2(S.computeJab({ invoices: [], vouchers: [], creditNotes: [d] }, StIst, 2026).rev), -100, "E1a (Vorzeichen " + sg + ")");
      const p = payout({ pays: [{ date: "2026-11-10", amount: -95.5 * sg }, { date: "2026-11-10", amount: 95.5 * sg }, { date: "2026-11-14", amount: 95.5 * sg }], paid: 95.5 * sg });
      assert.strictEqual(K(S.computeUva({ invoices: [p], vouchers: [], creditNotes: [] }, StIst, Q4), "022"), 0.75, "Beleg mit negativer Summe (Vorzeichen " + sg + ")");
    }
  });
  await t("B9: Gutschrift mit USt-Positionen gleichen Vorzeichens und einer 0-%-Position mit anderem Vorzeichen → normal gebucht (wie vor dem Umbau); USt-Konflikt → Prüfung", () => {
    const cnB = (lines, o) => Object.assign({ id: "cnB", nr: "GU-9", type: "GU", status: 1000, date: "2026-11-03", taxType: "default", taxRule: "1", contact: "Kunde", country: "AT", pays: [{ date: "2026-11-10", amount: 110 }], lines,
      net: r2(lines.reduce((a, l) => a + l.net, 0)), tax: r2(lines.reduce((a, l) => a + l.tax, 0)), gross: r2(lines.reduce((a, l) => a + l.net + l.tax, 0)) }, o || {});
    const ok = cnB([{ rate: 20, net: 100, tax: 20 }, { rate: 0, net: -10, tax: 0 }]);
    for (const st of [{ docs: {}, uva: {}, settings: { besteuerung: "soll" }, today: "2026-11-20" }, StIst]) {
      const u = S.computeUva({ invoices: [], vouchers: [], creditNotes: [ok] }, st, Q4); assert.ok(!u.review.some(x => x.doc.id === "cnB" && /beider Vorzeichen/.test(x.why)), "nicht wegen gemischter Vorzeichen zur Prüfung"); assert.strictEqual(K(u, "090"), -20);
      const bad = S.computeUva({ invoices: [], vouchers: [], creditNotes: [cnB([{ rate: 20, net: 100, tax: 20 }, { rate: 20, net: -10, tax: -2 }])] }, st, Q4); assert.ok(bad.review.some(x => x.doc.id === "cnB" && /beider Vorzeichen/.test(x.why)), "USt-Positionen mit beiden Vorzeichen");
      const fee = S.computeUva({ invoices: [], vouchers: [], creditNotes: [cnB([{ rate: 0, net: 100, tax: 0 }, { rate: 20, net: -3.75, tax: -0.75 }])] }, st, Q4); assert.ok(fee.review.some(x => x.doc.id === "cnB" && /beider Vorzeichen/.test(x.why)), "Gebühr mit USt gegen die Gutschrift");
    }
  });
  await t("Belege mit positiver Summe: UVA (Soll und Ist, alle Quartale 2026), Kontrollrechnung und E1a exakt wie vor dem Plattform-Umbau (300 Zufallsbelege)", () => {
    let Old = null; try { const src = require("child_process").execSync("git show 092b4b0:admin-cockpit/steuer-calc.js", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fsc-steuer-alt-")), "steuer-calc.js"); fs.writeFileSync(f, src); Old = require(f); } catch (e) { Old = null; }
    if (!Old) { console.log("HINWEIS: Vergleich mit dem alten Steuerkern übersprungen (git-Verlauf nicht verfügbar)"); return; }
    let seed = 20261028; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648, pick = a => a[Math.floor(rnd() * a.length)], money = (a, b) => r2(a + rnd() * (b - a));
    const day = () => "2026-" + String(1 + Math.floor(rnd() * 12)).padStart(2, "0") + "-" + String(1 + Math.floor(rnd() * 28)).padStart(2, "0");
    const mkLines = (n, rates, cat) => Array.from({ length: n }, () => { const rate = pick(rates), net = money(5, 900); return { rate, net, tax: r2(net * rate / 100), cat: cat || "", catId: "", catType: "" }; });
    const sums = ls => ({ net: r2(ls.reduce((a, l) => a + l.net, 0)), tax: r2(ls.reduce((a, l) => a + l.tax, 0)) });
    const payList = (gross, d0) => { const k = Math.floor(rnd() * 4), out = []; let rest = gross; for (let i = 0; i < k; i++) { const a = i === k - 1 && rnd() < 0.6 ? rest : r2(rest * (0.2 + rnd() * 0.6)); if (a <= 0.01) break; out.push({ date: d0 > "2026-12-20" ? d0 : (d => d < d0 ? d0 : d)(day()), amount: a }); rest = r2(rest - a); } return out; };
    const docs = { invoices: [], vouchers: [], creditNotes: [] };
    for (let i = 0; i < 150; i++) { const ls = mkLines(1 + Math.floor(rnd() * 3), [20, 20, 10, 13, 0]), sm = sums(ls), gross = r2(sm.net + sm.tax), d = day(), pays = payList(gross, d), paid = r2(pays.reduce((a, p) => a + p.amount, 0));
      const viaPayDate = !pays.length && rnd() < 0.3;
      docs.invoices.push({ id: "i" + i, nr: "RE-" + (1000 + i), type: pick(["RE", "RE", "RE", "AR"]), status: viaPayDate || paid >= gross - 0.005 ? 1000 : paid > 0 ? 750 : 200, date: d, delivery: rnd() < 0.5 ? d : day(), taxType: "default", taxRule: "1", contact: "Kunde " + i, country: "AT", uid: "",
        net: sm.net, tax: sm.tax, gross, paid: viaPayDate ? gross : paid, payDate: viaPayDate ? day() : (pays.length ? pays[pays.length - 1].date : null), pays: pays.length ? pays : undefined, enshrined: false, lines: ls }); }
    for (let i = 0; i < 100; i++) { const cd = pick(["C", "C", "D"]), ls = mkLines(1 + Math.floor(rnd() * 2), cd === "C" ? [20, 10, 0] : [20, 10], cd === "C" ? "Software" : "Erlöse"), sm = sums(ls), gross = r2(sm.net + sm.tax), d = day(), pays = payList(gross, d);
      docs.vouchers.push({ id: "v" + i, date: d, delivery: null, payDate: pays.length ? pays[pays.length - 1].date : null, status: 1000, cd, taxType: "default", taxRule: cd === "C" ? "9" : "1", supplier: "Lieferant " + i, supplierUid: "", supplierCountry: "AT", desc: "", net: sm.net, tax: sm.tax, gross, paid: r2(pays.reduce((a, p) => a + p.amount, 0)), enshrined: false, pays: pays.length ? pays : undefined, lines: ls }); }
    for (let i = 0; i < 50; i++) { const ls = mkLines(1 + Math.floor(rnd() * 2), [20, 10]), sm = sums(ls), gross = r2(sm.net + sm.tax), d = day(), pays = payList(gross, d);
      docs.creditNotes.push({ id: "c" + i, sevId: String(i), nr: "GU-" + i, type: "GU", status: pick([200, 1000]), date: d, delivery: d, taxType: "default", taxRule: "1", contact: "Kunde", uid: "", net: sm.net, tax: sm.tax, gross, pays: pays.length ? pays : undefined, lines: ls, enshrined: false }); }
    const st = b => ({ docs: {}, uvaManual: {}, mapping: {}, jabInput: {}, uva: {}, trips: {}, settings: b === "ist" ? { besteuerung: "ist", istAb: "2026-01-01" } : { besteuerung: "soll" }, today: "2026-12-31" });
    const raw = () => JSON.parse(JSON.stringify(docs)), sig = u => JSON.stringify({ K: u.K, z: u.zahllast, r: (u.review || []).map(x => x.doc.id + ":" + x.why), i: (u.info || []).length });
    let n = 0;
    for (const b of ["soll", "ist"]) {
      for (const q of [["2026-Q1", "2026-01-01", "2026-03-31"], ["2026-Q2", "2026-04-01", "2026-06-30"], ["2026-Q3", "2026-07-01", "2026-09-30"], ["2026-Q4", "2026-10-01", "2026-12-31"]]) {
        const P = { key: q[0], from: q[1], to: q[2] };
        assert.strictEqual(sig(S.computeUva(raw(), st(b), P)), sig(Old.computeUva(raw(), st(b), P)), "UVA " + b + " " + q[0]);
        assert.strictEqual(JSON.stringify(S.controlCheck(raw(), st(b), P)), JSON.stringify(Old.controlCheck(raw(), st(b), P)), "Kontrollrechnung " + b + " " + q[0]); n += 2;
      }
      const a = S.computeJab(raw(), st(b), 2026), o = Old.computeJab(raw(), st(b), 2026); assert.strictEqual(a.rev, o.rev, "E1a " + b); assert.strictEqual(JSON.stringify(a.revDocs), JSON.stringify(o.revDocs)); n++;
    }
    assert.ok(n === 18);
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
