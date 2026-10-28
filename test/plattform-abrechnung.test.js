/* Plattform-Abrechnung (Audit 28.10.2026, Teil A): VALUERO/Antonhaus nach Anreise mit Umstellung (RE-1272 bleibt), Partner-Vertrag 2
   (Mollie-Anteil, Altbuchungen, Abrechnungsbeginn, Freigabe, Quellenwechsel), fehlende Daten (VA-2), Websites (WEB-1/2/5/7), Mollie-Connect-Provisionen
   getrennt nach kochdu/VALUERO, fin-api-Freigabeliste (X2), Brutto-Rundung (X3).
   Aufruf: node test/plattform-abrechnung.test.js   (keine Abhängigkeiten; server.js läuft in Temp-Kopien, nie gegen echte Dienste) */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto"), http = require("http"), vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SECRET = "test-secret", KEY = "sev-test-key";
const COOKIE = "fsadmin=" + encodeURIComponent((v => v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("hex"))("s1." + Date.now()));
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }

function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-plat-"));
  fs.readdirSync(ROOT).filter(f => /\.(js|json|html|css|xml|txt|webmanifest)$/.test(f) && !/^package(-lock)?\.json$/.test(f) && fs.statSync(path.join(ROOT, f)).isFile()).forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  const cpDir = (d) => { if (!fs.existsSync(path.join(ROOT, d))) return; fs.mkdirSync(path.join(dir, d), { recursive: true }); fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => { if (e.isDirectory()) cpDir(path.join(d, e.name)); else fs.copyFileSync(path.join(ROOT, d, e.name), path.join(dir, d, e.name)); }); };
  ["admin-cockpit", "logos"].forEach(cpDir);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}
const STRIP = /^(RAILWAY_|CF_API_TOKEN|ANTHROPIC_|DATABASE_URL|PRINTCOM_|PRINT_MOLLIE|MOLLIE_|EB_|PAYPAL_|FON_|VIW_|WA_|MKT_|GOOGLE_|PEXELS_|SKIKAISER_|HUETTENGAUDI_|VALUERO_|ANTONHAUS_|ALPINAPPART_|FINAPI_|ICLOUD_|SEVDESK_|MAIL_API_|KOCHDU_|KANTINEUR_|BLITZDINGS_|NDA_|LEAD_MAIL)/;
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const viennaToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date());

// ── Testdaten Antonhaus (Anreise-Basis): Startwert 347,54 + RE-1272 475,41 = 822,95 € nach Eingang bis 30.09.2026 verrechnet.
//    Schon verrechnet je Anreisemonat: 06 → 167,50, 08 → 155,45, 12 → 500,00 (Eingang Aug, Anreise Dez). Nachtrag: Anreise Sep, Eingang Okt → 30,00 nie verrechnet.
const AH_MONTHS_2026 = [{ month: "2026-06", provisionCents: 16750, prebilledCents: 16750 }, { month: "2026-08", provisionCents: 15545, prebilledCents: 15545 }, { month: "2026-09", provisionCents: 3000, prebilledCents: 0 },
  { month: "2026-10", provisionCents: 19030, prebilledCents: 0 }, { month: "2026-12", provisionCents: 50000, prebilledCents: 50000 }];
const AH_TRANSITION = { fromBasis: "created", toBasis: "arrival", cutoffDate: "2026-09-30", cutoffMonth: "2026-09", billedAt: "2026-10-01", prebilledCents: 82295, prebilledArrivalAfterCutoffCents: 50000, notPrebilledArrivalUntilCutoffCents: 3000,
  byArrivalMonth: [{ month: "2026-06", provisionCents: 16750, prebilledCents: 16750, prebilledCurrentRuleCents: 16750 }, { month: "2026-08", provisionCents: 15545, prebilledCents: 15545, prebilledCurrentRuleCents: 15000 }, { month: "2026-12", provisionCents: 50000, prebilledCents: 50000, prebilledCurrentRuleCents: 50000 }],
  legacyMonths: [{ month: "2026-05", provisionCents: 7090 }, { month: "2026-06", provisionCents: 16750 }, { month: "2026-07", provisionCents: 18005 }, { month: "2026-08", provisionCents: 20850 }, { month: "2026-09", provisionCents: 19600 }] };
const AH_RECS = [{ id: "", nr: "manuell", date: "2026-07-30", gross: 347.54, from: null, to: null, label: "Antonhaus (übernommen)" }, { id: "1272", nr: "RE-1272", date: "2026-10-01", gross: 475.41, from: "2026-05-01", to: "2026-09-30", label: "Antonhaus" }];
const AH_SWITCH = { cutoff: "2026-09-30", prebilledByMonth: { "2026-06": 16750, "2026-08": 15545, "2026-12": 50000 }, totalCents: 82295, legacyTotalCents: 82295, invoiceNr: "RE-1272", confirmedAt: "2026-10-28T10:00:00Z" };
const ahObj = (year, extra) => Object.assign({ key: "antonhaus", name: "Antonhaus", src: "antonhaus", basis: "arrival", ratesLabel: "5 % Website · 2 % Direkt", transition: AH_TRANSITION,
  months: year === "2026" ? AH_MONTHS_2026 : [{ month: "2027-02", provisionCents: 8000, prebilledCents: 0 }] }, extra || {});

// ── Teil 1: Rechenkern direkt (server.js _test, NODE_ENV=test) ──
function unitTests(T) {
  const { abgleichBuild } = T;
  const I = (o) => Object.assign({ type: "RE", status: 1000, date: "2026-01-10", due: "2026-01-24", contact: "Kunde", contactId: "1", ref: "", net: 100, gross: 120, paid: 120, open: 0, cancelled: false, overdue: false }, o);
  const mkSev = (all) => { const s = { invoices: all.slice() }; Object.defineProperty(s, "invoicesAll", { value: all, enumerable: false }); return s; };
  const va = (o) => abgleichBuild(Object.assign({ sev: mkSev([I({ id: "1272", nr: "RE-1272", date: "2026-10-01", gross: 475.41, paid: 0, open: 475.41, status: 200 })]), sitesSnap: null }, o)).items;
  const out = [];
  out.push(["VALUERO/Antonhaus: alte Version (ohne basis → nach Eingang) → Hinweis, kein Verrechnen, keine Erstattung", () => {
    const it = va({ year: "2027", today: "2027-01-05", bill: { prices: {}, sites: {}, invoices: { "valuero:antonhaus": AH_RECS } }, valuero: { objects: [ahObj("2027", { basis: "created", transition: null })] }, valueroPrev: { objects: [ahObj("2026", { basis: "created", transition: null })] } }).find(x => x.key === "valuero:antonhaus");
    assert.ok(/nach Buchungseingang/.test(it.blocked || ""), it.blocked); assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.refund, 0); assert.strictEqual(it.action, null);
  }]);
  out.push(["VALUERO/Antonhaus: Anreise-Basis ohne bestätigte Umstellung → gesperrt mit Ein-Klick „Umstellung übernehmen“ (Zahlen aus transition)", () => {
    const it = va({ year: "2027", today: "2027-01-05", bill: { prices: {}, sites: {}, invoices: { "valuero:antonhaus": AH_RECS } }, valuero: { objects: [ahObj("2027")] }, valueroPrev: { objects: [ahObj("2026")] } }).find(x => x.key === "valuero:antonhaus");
    assert.ok(/Umstellung/.test(it.blocked || ""), it.blocked); assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.action, null); assert.strictEqual(it.proposal.op, "vaswitch");
    const L = it.proposal.lines.join("\n");
    assert.ok(/verrechnet: 822,95 € \(Startwert \+ RE-1272\)/.test(L) && /bleibt so bestehen/.test(L), L); assert.ok(/Anreise ab 01\.10\.2026: 500,00 €/.test(L), L); assert.ok(/30,00 €/.test(L), L); assert.ok(/passt/.test(L), L);
  }]);
  const billSw = () => ({ prices: {}, sites: {}, invoices: { "valuero:antonhaus": AH_RECS }, valuero: { antonhaus: { switch: AH_SWITCH } } });
  out.push(["VALUERO/Antonhaus nach Umstellung, 05.01.2027: Q4 2026 nach Anreise, RE-1272-Anteil abgezogen und auf der Rechnung ausgewiesen; keine Erstattung; Nachtrag als Nachverrechnung", () => {
    const it = va({ year: "2027", today: "2027-01-05", bill: billSw(), valuero: { objects: [ahObj("2027")] }, valueroPrev: { objects: [ahObj("2026")] } }).find(x => x.key === "valuero:antonhaus");
    assert.ok(!it.blocked, it.blocked); assert.strictEqual(it.unbilled, 190.3); assert.strictEqual(it.refund, 0);
    const a = it.action; assert.ok(a); assert.strictEqual(a.items[0].priceGross, 190.3); assert.strictEqual(a.deliveryDate, "2026-10-01"); assert.strictEqual(a.deliveryDateUntil, "2026-12-31");
    assert.ok(/Aufenthalte \(Anreise\) 01\.10\.2026 – 31\.12\.2026: 690,30 € · abzüglich bereits mit RE-1272 verrechnet \(Buchungseingang bis 30\.09\.2026\) 500,00 €/.test(a.items[0].text), a.items[0].text);
    assert.deepStrictEqual([a.after.billing.from, a.after.billing.to, a.after.billing.src, a.after.billing.basis], ["2026-10-01", "2026-12-31", "antonhaus", "arrival"]);
    assert.strictEqual(it.catchup, 30); assert.ok(it.catchupAction && it.catchupAction.items[0].priceGross === 30 && it.catchupAction.after.billing.adj === true && !it.catchupAction.after.billing.to);
    assert.strictEqual(it.pending, 80);
  }]);
  out.push(["VALUERO/Antonhaus nach Umstellung, Ansicht 2026 am 28.10.2026: nichts fällig, keine falsche Erstattung, laufendes Quartal netto", () => {
    const it = va({ year: "2026", today: "2026-10-28", bill: billSw(), valuero: { objects: [ahObj("2026")] }, valueroPrev: { objects: [ahObj("2025", { months: [] })] } }).find(x => x.key === "valuero:antonhaus");
    assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.refund, 0); assert.strictEqual(it.pending, 190.3); assert.strictEqual(it.billedUntil, "2026-09-30");
  }]);
  out.push(["VALUERO/Antonhaus: nach der Q4-Rechnung storniert jemand die Dez-Buchung (schon mit RE-1272 verrechnet) → nicht still abgezogen, Hinweis „mehr verrechnet als heute angefallen“", () => {
    const prev = ahObj("2026", { months: AH_MONTHS_2026.filter(m => m.month !== "2026-12") });
    const it = va({ year: "2027", today: "2027-01-05", bill: billSw(), valuero: { objects: [ahObj("2027")] }, valueroPrev: { objects: [prev] } }).find(x => x.key === "valuero:antonhaus");
    assert.strictEqual(it.unbilled, 190.3, "Oktober bleibt fällig"); assert.ok((it.notes || []).some(n => /mehr verrechnet als heute angefallen.*500,00 €/.test(n)), JSON.stringify(it.notes));
  }]);
  out.push(["VA-2: Vorjahr nicht geladen (null) am 05.01.2027 → kein Verrechnen, keine Erstattung, „Gebührendaten 2026 fehlen – neu laden“", () => {
    const it = va({ year: "2027", today: "2027-01-05", bill: billSw(), valuero: { objects: [ahObj("2027")] }, valueroPrev: null }).find(x => x.key === "valuero:antonhaus");
    assert.ok(/Gebührendaten 2026 fehlen – neu laden/.test(it.blocked || ""), it.blocked); assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.refund, 0); assert.strictEqual(it.action, null); assert.strictEqual(it.catchupAction, null);
  }]);
  out.push(["VA-2: Antonhaus antwortet mit Fehler (missing) → Posten mit Hinweis statt Verrechnen; ganzer Abruf null → Hinweis je bekanntem Haus", () => {
    let it = va({ year: "2027", today: "2027-01-05", bill: billSw(), valuero: { objects: [], missing: [{ key: "antonhaus", name: "Antonhaus", error: "Gebührendaten Antonhaus fehlen" }] }, valueroPrev: { objects: [] } }).find(x => x.key === "valuero:antonhaus");
    assert.ok(it && it.missing && /Gebührendaten Antonhaus fehlen – neu laden/.test(it.blocked), JSON.stringify(it)); assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.refund, 0); assert.strictEqual(it.action, null); assert.strictEqual(it.invoiced, 822.95);
    it = va({ year: "2027", today: "2027-01-05", bill: billSw(), valuero: null, valueroPrev: null, valueroConfigured: true }).find(x => x.key === "valuero:antonhaus");
    assert.ok(it && /fehlen – neu laden/.test(it.blocked), JSON.stringify(it)); assert.strictEqual(it.name, "Antonhaus");
  }]);
  // Partner-Haus (Vertrag 2)
  const pm = (o) => Object.assign({ provisionCents: 0, mollieFeesCents: 0, mollieFeesCancelledCents: 0, importedCents: 0 }, o);
  const ha = (months, extra) => Object.assign({ key: "haus-a", name: "Haus A", src: "partner", basis: "arrival", ratesLabel: "5 % Website", billingStart: "2026-07-01", months }, extra || {});
  const haRec = [{ id: "301", nr: "RE-301", date: "2026-10-01", gross: 100, from: "2026-07-01", to: "2026-09-30", label: "Haus A", src: "partner" }];
  const prevA = (o) => ha([pm({ month: "2026-05", provisionCents: 9000 }), pm({ month: "2026-07", provisionCents: 5000 }), pm(Object.assign({ month: "2026-08", provisionCents: 5000 }, o || {})), pm({ month: "2026-10", provisionCents: 10000, mollieFeesCents: 4000 }), pm({ month: "2026-11", provisionCents: 2000, importedCents: 2000 })]);
  const vaA = (bill, prev, cur, today, inv301) => va({ year: "2027", today: today || "2027-01-05", sev: mkSev([I(Object.assign({ id: "301", nr: "RE-301", date: "2026-10-01", gross: 100, paid: 100 }, inv301 || {}))]), bill: Object.assign({ prices: {}, sites: {}, invoices: { "valuero:haus-a": haRec } }, bill || {}), valuero: { objects: [cur || ha([])] }, valueroPrev: { objects: [prev || prevA()] } }).find(x => x.key === "valuero:haus-a");
  out.push(["VA-3: bei Online-Zahlung einbehaltene Provision nicht noch einmal verrechnet, auf der Rechnung ausgewiesen; Altbuchungen nicht verrechnet; vor dem Abrechnungsbeginn nichts", () => {
    const it = vaA();
    assert.ok(!it.blocked, it.blocked); assert.strictEqual(it.unbilled, 60); assert.strictEqual(it.refund, 0); assert.strictEqual(it.catchup, 0, "Mai liegt vor dem Abrechnungsbeginn");
    assert.ok(/: 100,00 € · abzüglich bei Online-Zahlung bereits einbehalten 40,00 €/.test(it.action.items[0].text), it.action.items[0].text);
    assert.ok((it.notes || []).some(n => /Altbuchungen.*20,00 €/.test(n)), JSON.stringify(it.notes)); assert.strictEqual(it.deducted.mollie, 40); assert.strictEqual(it.deducted.imported, 20);
  }]);
  out.push(["VA-3: Online-Zahlung nach der Abrechnung (Mollie-Anteil eines verrechneten Monats steigt) → „zu viel verrechnet“ (Gutschrift prüfen), nie still", () => {
    let it = vaA(null, prevA({ mollieFeesCents: 3000 }));
    assert.strictEqual(it.refund, 30); assert.strictEqual(it.unbilled, 60);
    it = vaA(null, prevA({ mollieFeesCents: 3000 }), null, null, { credited: 30 });
    assert.strictEqual(it.refund, 0, "nach der Gutschrift über 30 € nichts mehr zu viel verrechnet"); assert.strictEqual(it.invoiced, 70); assert.ok(/Gutschrift 30,00 €/.test(it.last.label), it.last.label);
  }]);
  out.push(["VA-4: Nachtrag in verrechnetem Monat → Nachverrechnung als eigener Ein-Klick-Entwurf (nicht in der Quartalsrechnung)", () => {
    const it = vaA(null, prevA({ provisionCents: 6500 }));
    assert.strictEqual(it.catchup, 15); assert.strictEqual(it.unbilled, 60); assert.strictEqual(it.catchupAction.items[0].priceGross, 15); assert.strictEqual(it.catchupAction.after.billing.adj, true);
  }]);
  out.push(["Stornierte Provision schon einbehalten (mollieFeesCancelledCents) → nur Hinweis „Gutschrift prüfen“", () => {
    const it = vaA(null, ha([pm({ month: "2026-07", provisionCents: 5000 }), pm({ month: "2026-08", provisionCents: 5000, mollieFeesCancelledCents: 1200 })]));
    assert.ok((it.notes || []).some(n => /stornierten Buchungen.*12,00 €/.test(n)), JSON.stringify(it.notes)); assert.strictEqual(it.refund, 0);
  }]);
  out.push(["VA-7: Haus ohne Abrechnung und ohne Abrechnungsbeginn → gesperrt, Vorschlag mit Startmonat; mit Beginn nur ab dann, Altbuchungen nie", () => {
    const hb = (extra) => Object.assign({ key: "haus-b", name: "Haus B", src: "partner", basis: "arrival", billingStart: null, billingStartSuggestion: "2026-11-01", firstOwnBookingOn: "2026-11-03", legacyBookings: 40,
      months: [pm({ month: "2026-03", provisionCents: 9000, importedCents: 9000 }), pm({ month: "2026-09", provisionCents: 4000 }), pm({ month: "2026-11", provisionCents: 3000 }), pm({ month: "2026-12", provisionCents: 2500, importedCents: 500 })] }, extra || {});
    const run = (bill) => va({ year: "2027", today: "2027-01-05", bill: Object.assign({ prices: {}, sites: {}, invoices: {} }, bill || {}), valuero: { objects: [Object.assign(hb(), { months: [] })] }, valueroPrev: { objects: [hb()] } }).find(x => x.key === "valuero:haus-b");
    let it = run(); assert.ok(/Abrechnungsbeginn/.test(it.blocked), it.blocked); assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.proposal.op, "vastart"); assert.strictEqual(it.proposal.start, "2026-11-01"); assert.ok(/November 2026/.test(it.proposal.label), it.proposal.label);
    it = run({ valuero: { "haus-b": { start: "2026-11-01" } } }); assert.ok(!it.blocked); assert.strictEqual(it.unbilled, 50); assert.strictEqual(it.action.after.billing.from, "2026-11-01");
  }]);
  out.push(["Vertrag 2: neu freigegeben nach der letzten Abrechnung bzw. Quellenwechsel → gesperrt bis zur Bestätigung (Ein-Klick)", () => {
    let it = vaA(null, null, ha([], { billingLiveSince: "2026-12-15T10:00:00.000Z" })); assert.ok(/freigegeben/.test(it.blocked || ""), it.blocked); assert.strictEqual(it.proposal.op, "vaack"); assert.strictEqual(it.unbilled, 0);
    it = vaA({ valuero: { "haus-a": { ackLive: "2026-12-15T10:00:00.000Z" } } }, null, ha([], { billingLiveSince: "2026-12-15T10:00:00.000Z" })); assert.ok(!it.blocked); assert.strictEqual(it.unbilled, 60);
    const rec2 = [Object.assign({}, haRec[0], { src: "alpinappart" })];
    it = vaA({ invoices: { "valuero:haus-a": rec2 } }); assert.ok(/Quelle gewechselt/.test(it.blocked || ""), it.blocked); assert.strictEqual(it.proposal.src, "partner");
    it = vaA({ invoices: { "valuero:haus-a": rec2 }, valuero: { "haus-a": { ackSrc: "partner" } } }); assert.ok(!it.blocked);
  }]);
  // kochdu (KO-3/KO-4/X5): kochdu rechnet selbst ab – keine eigene Rechnung, Monatsrechnungen verlinkt, nur Rückstand „zu verrechnen“
  out.push(["kochdu: Monatsrechnungen verlinkt (bezahlt/offen aus der Buchhaltung), laufender Monat nicht „zu verrechnen“, nie eigene Rechnung", () => {
    const r = { id: "7", name: "La Taverna", barOrders: 40, barOpenCents: 3000, barDueCents: 0, barCurrentMonthCents: 3000, barSettledCents: 9000, barInvoicedCents: 9000, barBalancedCents: 0, onlineProvisionCents: 500,
      invoices: [{ docId: "1310", nr: "RE-1310", at: "2026-10-01T08:00:00Z", month: "2026-09", grossCents: 4000, docType: "Invoice" }, { docId: "1311", nr: "RE-1311", at: "2026-10-28T08:00:00Z", month: "2026-10", grossCents: 5000 }, { docId: "1299", nr: "RE-1299", deleted: true, month: "2026-08", grossCents: 100 }] };
    const sevK = mkSev([I({ id: "1310", nr: "RE-1310", date: "2026-10-01", gross: 40, paid: 40 }), I({ id: "1311", nr: "RE-1311", date: "2026-10-28", gross: 50, paid: 0, open: 50, status: 200 })]);
    let ab = abgleichBuild({ year: "2026", today: "2026-10-28", sev: sevK, bill: { prices: {}, sites: {}, invoices: {} }, sitesSnap: null, kochdu: { restaurants: [r] } }), it = ab.items.find(x => x.key === "kochdu:7");
    assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.action, null); assert.strictEqual(it.paid, 40); assert.strictEqual(it.open, 50); assert.strictEqual(it.invoices.length, 2); assert.strictEqual(it.settledWithoutInvoice, 0);
    assert.ok(/laufend 30,00 € – wird am 1\. automatisch verrechnet/.test(it.sub), it.sub); assert.ok(!ab.unlinked.some(x => x.id === "1311"), "offene kochdu-Rechnung ist zugeordnet");
    const old = Object.assign({}, r, { barDueCents: undefined, barCurrentMonthCents: undefined, barInvoicedCents: undefined, invoices: [{ docId: "1310", nr: "RE-1310", month: "2026-09", grossCents: 4000, at: "2026-10-01T08:00:00Z" }] });
    it = abgleichBuild({ year: "2026", today: "2026-10-28", sev: sevK, bill: { prices: {}, sites: {}, invoices: {} }, sitesSnap: null, kochdu: { restaurants: [old] } }).items.find(x => x.key === "kochdu:7");
    assert.strictEqual(it.unbilled, 30, "alte kochdu-Version: offen wie bisher"); assert.strictEqual(it.action, null, "aber nie eine eigene Rechnung"); assert.strictEqual(it.settledWithoutInvoice, 50, "90 verrechnet − 40 Monatsrechnung");
  }]);
  // Websites
  const prices = { hosting: 10, hostingPer: "month", period: 12, taxRate: 20, gross: true, hostingLabel: "Hosting" };
  const sitesSnap = { railway: { projects: [] }, sites: [{ name: "kunde-test.at", up: true, requests7d: 0 }] };
  const site = (cfg, recs, invs, today) => abgleichBuild({ year: (today || "2026-10-28").slice(0, 4), today: today || "2026-10-28", sev: mkSev(invs || []), bill: { prices, sites: { "cf:kunde-test.at": Object.assign({ active: true, hosting: true }, cfg) }, invoices: { "site:cf:kunde-test.at": recs || [] }, ignore: cfg.__ignore }, sitesSnap }).items.filter(x => x.src === "website");
  out.push(["WEB-2: Storno einer früheren Periode (2025 storniert, 2026 gültig) → eigener Posten „wieder zu verrechnen“ für 2025", () => {
    const recs = [{ id: "25", nr: "RE-25", date: "2025-01-05", gross: 120, from: "2025-01-01", to: "2025-12-31" }, { id: "26", nr: "RE-26", date: "2026-01-05", gross: 120, from: "2026-01-01", to: "2026-12-31" }];
    const its = site({ billedUntil: "2026-12-31" }, recs, [I({ id: "25", nr: "RE-25", date: "2025-01-05", cancelled: true, stornoNr: "RE-27" }), I({ id: "26", nr: "RE-26", date: "2026-01-05" })]);
    const main = its.find(x => x.key === "site:cf:kunde-test.at"), gap = its.find(x => x.key === "site:cf:kunde-test.at@2025-01-01");
    assert.strictEqual(main.unbilled, 0); assert.ok(gap, JSON.stringify(its.map(x => x.key))); assert.strictEqual(gap.unbilled, 120); assert.ok(/storniert \(storniert \(RE-27\)\) – Zeitraum 01\.01\.2025 – 31\.12\.2025 wieder zu verrechnen/.test(gap.sub), gap.sub);
    assert.deepStrictEqual([gap.action.after.billing.key, gap.action.after.billing.from, gap.action.after.billing.to], ["site:cf:kunde-test.at", "2025-01-01", "2025-12-31"]);
    const its2 = site({ billedUntil: "2026-12-31" }, recs.concat([{ id: "28", nr: "RE-28", date: "2026-10-28", gross: 120, from: "2025-01-01", to: "2025-12-31" }]), [I({ id: "25", cancelled: true }), I({ id: "26" }), I({ id: "28" })]);
    assert.ok(!its2.some(x => x.gap), "nach der Ersatzrechnung kein Posten mehr");
  }]);
  out.push(["WEB-5: Jahresmodus anteilig ab Startmonat – im Oktober aktiviert → Okt–Dez sofort fällig (3/12); ohne Aktivierungsdatum wie bisher erst im Jänner", () => {
    let it = site({ activeSince: "2026-10-15" })[0];
    assert.strictEqual(it.unbilled, 30); assert.deepStrictEqual([it.action.after.billing.from, it.action.after.billing.to, it.action.deliveryDateUntil], ["2026-10-01", "2026-12-31", "2026-12-31"]);
    assert.ok(/anteilig 3 von 12 Monaten/.test(it.action.items[0].text), it.action.items[0].text); assert.strictEqual(it.action.items[0].priceGross, 30);
    it = site({})[0]; assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.next.date, "2027-01-01"); assert.ok(it.nextAction);
    it = site({ billedUntil: "2026-12-31", activeSince: "2027-06-10" }, [], [], "2027-07-01")[0];
    assert.strictEqual(it.unbilled, 70, "nach einer Pause erst ab Wiederaufnahme"); assert.strictEqual(it.action.after.billing.from, "2027-06-01");
  }]);
  out.push(["WEB-7: ausgeblendete Website (gibt es nicht mehr) ist nie fällig", () => {
    assert.strictEqual(site({ hidden: true, billedUntil: "2025-12-31" }).length, 0);
  }]);
  out.push(["WEB-6: „Ausblenden“ gilt nur für den Zeitraum (from), ältere Einträge nur für damals schon begonnene Zeiträume", () => {
    let it = site({ billedUntil: "2025-12-31", __ignore: { "site:cf:kunde-test.at": { amount: 120, at: "2026-02-01T10:00:00Z", from: "2026-01-01" } } })[0]; assert.ok(it.ignored); assert.strictEqual(it.unbilled, 0);
    it = site({ billedUntil: "2026-12-31", __ignore: { "site:cf:kunde-test.at": { amount: 120, at: "2026-02-01T10:00:00Z", from: "2026-01-01" } } }, [], [], "2027-02-01")[0]; assert.ok(!it.ignored); assert.strictEqual(it.unbilled, 120, "Folgejahr wieder fällig");
    it = site({ billedUntil: "2026-12-31", __ignore: { "site:cf:kunde-test.at": { amount: 120, at: "2026-02-01T10:00:00Z" } } }, [], [], "2027-02-01")[0]; assert.strictEqual(it.unbilled, 120, "alter Eintrag ohne from blendet 2027 nicht aus");
  }]);
  return out;
}

// billingOp direkt (schreibt billing.json im DATA_DIR der Temp-Kopie)
function billingTests(T, dir) {
  const out = [];
  out.push(["billingOp: Website aktivieren merkt activeSince; Nachverrechnung eines früheren Zeitraums lässt „verrechnet bis“ stehen; ↺ ohne Vorgänger → sofort wieder fällig", () => {
    T.billingOp({ op: "site", key: "cf:x.at", patch: { active: true, hosting: true } });
    let b = T.readBilling(); assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(b.sites["cf:x.at"].activeSince), JSON.stringify(b.sites));
    const since = b.sites["cf:x.at"].activeSince; T.billingOp({ op: "site", key: "cf:x.at", patch: { active: true } }); assert.strictEqual(T.readBilling().sites["cf:x.at"].activeSince, since, "nur beim Einschalten");
    T.billingOp({ op: "site", key: "cf:y.at", patch: { active: true } }); T.billingOp({ op: "invoice", key: "site:cf:y.at", invoice: { id: "1", gross: 30, from: "2026-10-01", to: "2026-12-31" } });
    const y0 = T.readBilling().sites["cf:y.at"].activeSince; T.billingOp({ op: "site", key: "cf:y.at", patch: { active: false } }); T.billingOp({ op: "site", key: "cf:y.at", patch: { active: true } });
    assert.strictEqual(T.readBilling().sites["cf:y.at"].activeSince, y0, "kurz aus/ein ändert den Startmonat nicht");
    T.billingOp({ op: "invoice", key: "site:cf:x.at", invoice: { id: "26", nr: "RE-26", gross: 120, from: "2026-01-01", to: "2026-12-31" } });
    T.billingOp({ op: "invoice", key: "site:cf:x.at", invoice: { id: "28", nr: "RE-28", gross: 120, from: "2025-01-01", to: "2025-12-31" } });
    assert.strictEqual(T.readBilling().sites["cf:x.at"].billedUntil, "2026-12-31");
    T.billingOp({ op: "unbill", key: "site:cf:x.at" }); assert.strictEqual(T.readBilling().sites["cf:x.at"].billedUntil, "2026-12-31");
    T.billingOp({ op: "unbill", key: "site:cf:x.at" }); assert.strictEqual(T.readBilling().sites["cf:x.at"].billedUntil, "2025-12-31", "zurückgenommener Zeitraum ab 01.01.2026 wieder fällig");
  }]);
  out.push(["billingOp: VALUERO-Eintrag mit Quelle/Basis/Nachverrechnung; Abrechnungsbeginn/Bestätigungen; Umstellung nur mit Server-Schnappschuss", () => {
    T.billingOp({ op: "invoice", key: "valuero:haus-a", invoice: { id: "1", nr: "RE-1", gross: 10, from: "2026-10-01", to: "2026-12-31", src: "partner", basis: "arrival" } });
    T.billingOp({ op: "invoice", key: "valuero:haus-a", invoice: { id: "2", nr: "RE-2", gross: 5, adj: true, src: "x y" } });
    const r = T.readBilling().invoices["valuero:haus-a"]; assert.strictEqual(r[0].src, "partner"); assert.strictEqual(r[0].basis, "arrival"); assert.strictEqual(r[1].adj, true); assert.strictEqual(r[1].src, undefined, "ungültige Quelle nicht gespeichert");
    T.billingOp({ op: "vastart", key: "valuero:haus-b", start: "2026-11-01" }); assert.strictEqual(T.readBilling().valuero["haus-b"].start, "2026-11-01");
    assert.throws(() => T.billingOp({ op: "vastart", key: "haus-b", start: "2026-11-15" }));
    T.billingOp({ op: "vaack", key: "haus-a", src: "partner" }); assert.strictEqual(T.readBilling().valuero["haus-a"].ackSrc, "partner");
    assert.throws(() => T.billingOp({ op: "vaswitch", key: "antonhaus" }), /keine_umstellungsdaten/);
    T.billingOp({ op: "vaswitch", key: "antonhaus", _switch: AH_SWITCH }); assert.strictEqual(T.readBilling().valuero.antonhaus.switch.totalCents, 82295);
    T.billingOp({ op: "vaswitch", key: "antonhaus", undo: true }); assert.ok(!T.readBilling().valuero.antonhaus.switch);
    T.billingOp({ op: "ignore", key: "site:cf:x.at", amount: 120, from: "2027-01-01" }); assert.strictEqual(T.readBilling().ignore["site:cf:x.at"].from, "2027-01-01");
  }]);
  return out;
}

// ── Teil 2: Websites-Ansicht (web.js) in einer vm mit den Abgleich-Posten des Servers (WEB-1) ──
function bootWeb(src, { today, billing, sevInvoices, sites, items }) {
  const actions = {}, opened = [], confirms = [];
  const F = {
    UI: {}, D: { today, year: today.slice(0, 4), sites, sev: { invoices: sevInvoices }, abgleich: { items } },
    esc: s => String(s == null ? "" : s), eur: n => (+n || 0).toFixed(2) + " €", eur0: n => Math.round(+n || 0) + " €", de: iso => String(iso || "").split("-").reverse().join("."),
    ymd: d => d.toISOString().slice(0, 10), css() {}, onData() {}, listen() {}, form() {}, searcher() {}, svg: () => "", head: () => "", toast() {},
    action(n, fn) { actions[n] = fn; }, view(v) { F._view = v; }, current: "web", render() {}, busy: false, load() {},
    api(url) { if (url === "/admin/api/billing") return Promise.resolve(JSON.parse(JSON.stringify(billing))); return Promise.resolve({ error: "x" }); },
    openInvoice(pre) { opened.push(pre); }, closeDrawer() {}, confirm(msg, ok, fn) { confirms.push(msg); fn(); }, openDrawer() {},
  };
  const ctx = { window: { FSC: F }, document: { getElementById: () => ({ classList: { contains: () => false } }) }, setTimeout: () => 0, clearTimeout() {}, Date, Math, JSON, Object, String, Array, Promise, console };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { F, actions, opened, confirms };
}
const tick = () => new Promise(r => setImmediate(r));

// ── Teil 3: Mollie-Connect-Provisionen (fin-mollie.js mit fin-local im Speicher) ──
function memFin(seed) {
  const meta = {};
  return { meta, init: async () => true, db: () => ({ query: async (sql) => /^select type, id, data from fin_obj/.test(sql) ? { rows: seed.map(([type, data]) => ({ type, id: String(data.id), data })) } : { rows: [], rowCount: 0 } }),
    getMeta: async k => (k in meta ? JSON.parse(JSON.stringify(meta[k])) : null), setMeta: async (k, v) => { meta[k] = JSON.parse(JSON.stringify(v)); }, putFileRaw: async () => {}, getFile: async () => null };
}
function finSetup(seed, connect, today) {
  const fin = memFin(seed);
  const L = require(path.join(ROOT, "fin-local.js"))({ fin, renderPdf: async () => ({}), mailSend: async () => ({}) });
  const P = require(path.join(ROOT, "fin-proposals.js"))({ L, getMeta: fin.getMeta, setMeta: fin.setMeta, rules: () => null, autoPay: () => true, today: () => today, reportedPeriods: () => [] });
  L.setProposer(P);
  const M = require(path.join(ROOT, "fin-mollie.js"))({ L, P: () => P, today: () => today, connectPayments: connect });
  ["mollie-match", "mollie-fee", "mollie-payout", "mollie-income", "mollie-credit"].forEach(k => P.register(k, { exec: it => M.accept(k, it.payload) }));
  return { L, P, M };
}
const fee = (id, amount, date, purpose, extra) => ["CheckAccountTransaction", Object.assign({ id, checkAccount: { id: "2", objectName: "CheckAccount" }, amount: amount.toFixed(2), valueDate: date + "T00:00:00+02:00", entryDate: date + "T00:00:00+02:00", payeePayerName: "Mollie B.V.", paymtPurpose: purpose, mollieId: "fee" + id, mollieType: "application-fee", mollieProfile: "kochdu", status: "100" }, extra || {})];

// ── Teil 4: Server mit Attrappen (fin-api-Freigabeliste, VALUERO-Abrufe, Antonhaus-Umstellung) ──
function createMock() {
  const inv = [
    { id: "801", objectName: "Invoice", invoiceNumber: "RE-801", invoiceType: "RE", status: "100", header: "kochdu-Gebühr Barzahlungen 10/2026", platformRef: "kochdu:2026-10:cash:1", sumGross: "12", contact: { id: "21", objectName: "Contact" } },
    { id: "802", objectName: "Invoice", invoiceNumber: "RE-802", invoiceType: "RE", status: "200", header: "Rechnung", headText: "Website-Relaunch", sumGross: "2400", contact: { id: "21", objectName: "Contact" } },
    { id: "803", objectName: "Invoice", invoiceNumber: "RE-803", invoiceType: "RE", status: "200", header: "Rechnung", headText: "Buchung BD-1001 – vielen Dank für Ihre Buchung bei Blitzdings.", reference: "BD-1001", sumGross: "299", contact: { id: "21", objectName: "Contact" } },
    { id: "804", objectName: "Invoice", invoiceNumber: "RE-804", invoiceType: "RE", status: "200", header: "Rechnung", headText: "Vielen Dank für die Nutzung von Der Kantineur.", customerInternalNote: "Mollie tr_k1", sumGross: "9.69", contact: { id: "21", objectName: "Contact" } },
    { id: "805", objectName: "Invoice", invoiceNumber: "RE-805", invoiceType: "RE", status: "200", header: "Rechnung", headText: "Website", customerInternalNote: "Mollie tr_k1", sumGross: "50", contact: { id: "21", objectName: "Contact" } },
  ];
  const state = { inv, saved: [], calls: [], partnerQ: [], antonQ: [], antonMode: "arrival", partnerDown: false };
  let n = 0;
  const server = http.createServer((req, res) => {
    let body = ""; req.on("data", c => (body += c)); req.on("end", () => {
      const u = new URL(req.url, "http://x"), q = u.searchParams; let json = null; try { json = body ? JSON.parse(body) : null; } catch (e) {}
      const send = (st, o) => { res.writeHead(st, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (u.pathname === "/valuero") { state.partnerQ.push(Object.fromEntries(q)); if (state.partnerDown) return send(503, { ok: false }); return send(200, { ok: true, contract: q.get("contract") === "2" ? 2 : undefined, properties: [] }); }
      if (u.pathname === "/antonhaus") {
        state.antonQ.push(Object.fromEntries(q)); const y = q.get("year") || "";
        if (state.antonMode === "down") return send(502, { ok: false, error: "Beds24-Abruf fehlgeschlagen – Gebühren nicht verfügbar.", code: "BEDS24" });
        const months = AH_MONTHS_2026.filter(m => !y || m.month.slice(0, 4) === y).concat(y === "2027" ? [{ month: "2027-02", provisionCents: 8000, prebilledCents: 0 }] : []);
        if (state.antonMode === "old") return send(200, { ok: true, provisionCents: 0, months: months.map(m => ({ month: m.month, provisionCents: m.provisionCents, bookings: 1 })) });
        return send(200, { ok: true, basis: "arrival", ratesLabel: "5 % Website · 2 % Direkt", provisionCents: months.reduce((a, m) => a + m.provisionCents, 0), months, transition: AH_TRANSITION });
      }
      if (!u.pathname.startsWith("/api/v1")) return send(404, { error: "nope" });
      const p = u.pathname.replace(/^\/api\/v1/, ""), m = req.method; state.calls.push(m + " " + p);
      if (req.headers.authorization !== KEY) return send(401, { error: { message: "Authentication required" } });
      let mm;
      if (m === "GET" && (mm = p.match(/^\/(Invoice|CreditNote)\/(\d+)$/))) { const o = inv.find(x => x.id === mm[2]); return o ? send(200, { objects: [o] }) : send(400, { error: { message: "Invoice nicht gefunden" } }); }
      if (m === "GET" && p === "/Invoice") { let l = inv.slice(); q.forEach((v, k) => { if (/^(limit|offset|embed|countAll)$/.test(k) || /\[objectName\]$/.test(k)) return; const km = k.match(/^(\w+)\[id\]$/); l = l.filter(o => km ? o[km[1]] && String(o[km[1]].id) === v : String(o[k]) === v); }); return send(200, { objects: l }); }
      if (m === "POST" && p === "/Invoice/Factory/saveInvoice") { state.saved.push(json); const o = Object.assign({ id: String(900 + (++n)), objectName: "Invoice", status: "100" }, json.invoice || {}); inv.push(o); return send(201, { objects: { invoice: o } }); }
      if (m === "GET" && p === "/SevUser") return send(200, { objects: [{ id: "1" }] });
      if (m === "GET" && p === "/Contact") return send(200, { objects: [] });
      if (m === "GET" && p === "/StaticCountry") return send(200, { objects: [{ id: "3", code: "at", name: "Österreich" }] });
      if (m === "GET" && p === "/Tools/bookkeepingSystemVersion") return send(200, { objects: { version: "2.0" } });
      if (m === "GET" && p === "/Invoice/Factory/getNextInvoiceNumber") return send(200, { objects: "RE-990" });
      if (m === "POST" || m === "PUT") return send(201, { objects: { id: "1" } });
      return send(200, { objects: [] });
    });
  });
  return { server, state };
}

(async () => {
  // Teil 1
  const udir = copyApp();
  Object.keys(process.env).forEach(k => { if (STRIP.test(k)) delete process.env[k]; });
  Object.assign(process.env, { NODE_ENV: "test", ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x", PORT: "0" });
  let T = null; try { T = Object.assign({}, require(path.join(udir, "server.js"))._test, global.__fscBillingTest); } catch (e) { fails.push("server.js laden\n    " + (e && e.stack || e)); fail++; }
  if (T) {
    for (const [name, fn] of unitTests(T)) await t(name, fn);
    // billing.json nur in der Temp-Kopie schreiben (nie in ein echtes /data)
    if (path.dirname(T.BILLING_FILE) === udir) { for (const [name, fn] of billingTests(T, udir)) await t(name, fn); }
    else console.log("HINWEIS: billingOp-Tests übersprungen (DATA_DIR ist nicht die Temp-Kopie: " + path.dirname(T.BILLING_FILE) + ")");
  }

  // Teil 2: web.js mit Server-Posten
  if (T) {
    const src = fs.readFileSync(path.join(ROOT, "admin-cockpit", "web.js"), "utf8");
    const siteDef = { key: "cf:kunde-test.at", name: "kunde-test.at", domain: "kunde-test.at", domains: ["kunde-test.at"], up: true };
    const prices = { hosting: 10, hostingPer: "month", period: 12, taxRate: 20, gross: true, hostingLabel: "Hosting" };
    const mkSev = (all) => { const s = { invoices: all.slice() }; Object.defineProperty(s, "invoicesAll", { value: all, enumerable: false }); return s; };
    const sevI = [{ id: "26", nr: "RE-26", type: "RE", status: 1000, date: "2026-01-08", gross: 120, paid: 120, open: 0, cancelled: true, stornoNr: "RE-27" }, { id: "27", nr: "RE-27", type: "SR", status: 1000, date: "2026-10-20", gross: -120, paid: -120, open: 0, origin: "26" }];
    const billing = { prices, sites: { "cf:kunde-test.at": { active: true, hosting: true, billedUntil: "2026-12-31" } }, invoices: { "site:cf:kunde-test.at": [{ id: "26", nr: "RE-26", date: "2026-01-08", gross: 120, from: "2026-01-01", to: "2026-12-31" }] } };
    const items = T.abgleichBuild({ year: "2026", today: "2026-10-28", sev: mkSev(sevI), bill: billing, sitesSnap: { railway: { projects: [] }, sites: [{ name: "kunde-test.at", up: true }] } }).items;
    await t("WEB-1: Websites-Ansicht erkennt Storno (wie Abgleich): Tag „storniert“, KPI fällig 120, „Verrechnen“ = 2026 (nicht 2027), Umsatz-KPI ohne Storno", async () => {
      const E = bootWeb(src, { today: "2026-10-28", billing, sevInvoices: sevI, sites: [siteDef], items });
      E.F._view.after(); await tick(); await tick();
      const html = E.F._view.render.call(E.F._view);
      assert.ok(/storniert – wieder zu verrechnen/.test(html), "Storno-Tag"); assert.ok(/<span class="tag grey">storniert \(RE-27\)<\/span>/.test(html), "Rechnung als storniert, nicht „bezahlt“");
      const due = html.match(/Jetzt zu verrechnen<\/span><span class="v num[^"]*">([^<]*)<\/span>/); assert.strictEqual(due && due[1], "120 €");
      const kpi = html.match(/Website-Rechnungen 2026<\/span><span class="v num">([^<]*)<\/span>/); assert.strictEqual(kpi && kpi[1], "0 €", "storniert zählt nicht als bezahlt");
      E.actions.wbill("cf:kunde-test.at");
      assert.strictEqual(E.confirms.length, 0, "keine Rückfrage „nächster Zeitraum“"); const pre = E.opened[0];
      assert.deepStrictEqual([pre.after.billing.from, pre.after.billing.to], ["2026-01-01", "2026-12-31"]); assert.strictEqual(pre.items[0].priceGross, 120);
    });
    await t("WEB-1/WEB-2: stornierter früherer Zeitraum wird in der Websites-Ansicht zuerst angeboten; veralteter Posten → frischer Stand gilt", async () => {
      const b2 = { prices, sites: { "cf:kunde-test.at": { active: true, hosting: true, billedUntil: "2026-12-31" } }, invoices: { "site:cf:kunde-test.at": [{ id: "25", nr: "RE-25", date: "2025-01-05", gross: 120, from: "2025-01-01", to: "2025-12-31" }, { id: "28", nr: "RE-28", date: "2026-01-05", gross: 120, from: "2026-01-01", to: "2026-12-31" }] } };
      const sev2 = [{ id: "25", nr: "RE-25", type: "RE", status: 1000, date: "2025-01-05", gross: 120, paid: 120, open: 0, cancelled: true }, { id: "28", nr: "RE-28", type: "RE", status: 1000, date: "2026-01-05", gross: 120, paid: 120, open: 0 }];
      const it2 = T.abgleichBuild({ year: "2026", today: "2026-10-28", sev: mkSev(sev2), bill: b2, sitesSnap: { railway: { projects: [] }, sites: [{ name: "kunde-test.at", up: true }] } }).items;
      let E = bootWeb(src, { today: "2026-10-28", billing: b2, sevInvoices: sev2, sites: [siteDef], items: it2 }); E.F._view.after(); await tick(); await tick();
      const html = E.F._view.render.call(E.F._view); assert.ok(/storniert – 01\.01\.2025 – 31\.12\.2025 wieder zu verrechnen/.test(html), "Tag Storno 2025");
      E.actions.wbill("cf:kunde-test.at"); assert.deepStrictEqual([E.opened[0].after.billing.from, E.opened[0].after.billing.to], ["2025-01-01", "2025-12-31"]);
      const b3 = JSON.parse(JSON.stringify(b2)); b3.invoices["site:cf:kunde-test.at"].push({ id: "29", nr: "RE-29", date: "2026-10-28", gross: 120, from: "2025-01-01", to: "2025-12-31" });
      E = bootWeb(src, { today: "2026-10-28", billing: b3, sevInvoices: sev2, sites: [siteDef], items: it2 }); E.F._view.after(); await tick(); await tick();
      E.actions.wbill("cf:kunde-test.at"); assert.ok(E.confirms.length === 1 && /Bereits verrechnet bis 31\.12\.2026/.test(E.confirms[0]), "veralteter Abgleich → keine zweite Rechnung ohne Rückfrage: " + E.confirms[0]);
    });
  }

  // Teil 3: Mollie
  await t("Mollie Connect: kochdu-Provision (Zahlung in der kochdu-Liste) → kochdu-Sammelrechnung; VALUERO-Provision → Vorschlag Einnahme-Beleg (nie auf kochdu); unbekannte → VALUERO erst mit geladener kochdu-Liste", async () => {
    const seed = [["CheckAccount", { id: "2", name: "Mollie – kochdu", status: "100", type: "online", mollieBalance: "bal_1" }],
      ["Invoice", { id: "880", invoiceType: "RE", status: "100", header: "kochdu Online-Provisionen 10/2026 (Mollie Connect)", sumGross: "5.00", paidAmount: "0", invoiceDate: "2026-10-31T00:00:00+02:00", contact: { id: "1", objectName: "Contact" } }],
      ["InvoicePos", { id: "8801", invoice: { id: "880", objectName: "Invoice" }, name: "Online-Provisionen", quantity: "1", price: "4.17", priceGross: "5.00", grossPricing: true, taxRate: "20", positionNumber: "0" }],
      fee("1", 5.00, "2026-10-05", "Provision (Mollie Connect)  tr_Aa1x"),
      fee("2", 7.50, "2026-10-06", "Provision (Mollie Connect)  tr_Bb2y", { mollieDesc: "VALUERO Provision BK-123" }),
      fee("3", 3.20, "2026-10-07", "Provision (Mollie Connect)  tr_Cc3z")];
    const { L, P, M } = finSetup(seed, async () => [{ id: "tr_Aa1x", at: "2026-10-04T10:00:00Z" }], "2026-11-03");
    await L.load(); await M.autoVouchers();
    assert.strictEqual(String(L.get("CheckAccountTransaction", "1").status), "200", "kochdu → Sammelrechnung");
    assert.strictEqual(String(L.get("CheckAccountTransaction", "2").status), "100", "VALUERO nie automatisch"); assert.strictEqual(String(L.get("CheckAccountTransaction", "3").status), "100");
    assert.strictEqual(+L.get("Invoice", "880").paidAmount, 5, "nur die kochdu-Provision auf der kochdu-Rechnung");
    const list = await P.list(), p2 = list.find(x => x.key === "minc:2"), p3 = list.find(x => x.key === "minc:3");
    assert.ok(p2 && /VALUERO/.test(p2.title), JSON.stringify(list.map(x => x.key + " " + x.title))); assert.ok(p3 && /VALUERO/.test(p3.title), "von kochdu nicht gekannt → VALUERO (Vorschlag)");
    assert.ok(!M.onlineNotices().some(n => /Differenz/.test(n)), JSON.stringify(M.onlineNotices()));
    await P.accept(p2.id); const v = L.all("Voucher").find(x => x.fromMollie === "2"); assert.ok(v && v.supplierName === "Mollie Connect (VALUERO)" && /Provision VALUERO/.test(v.description), JSON.stringify(v));
    const s = M.summary(); assert.ok(s.length === 0 || !(s[0].byProfile || []).some(b => b.name === "kochdu" && b.provisions > 5), JSON.stringify(s));
  });
  await t("Mollie Connect: ohne kochdu-Liste keine Zuordnung nach Buchungsdatum (abwarten, Hinweis)", async () => {
    const seed = [["CheckAccount", { id: "2", name: "Mollie – kochdu", status: "100", type: "online" }],
      ["Invoice", { id: "880", invoiceType: "RE", status: "100", header: "kochdu Online-Provisionen 10/2026 (Mollie Connect)", sumGross: "5.00", paidAmount: "0", invoiceDate: "2026-10-31T00:00:00+02:00", contact: { id: "1", objectName: "Contact" } }],
      fee("1", 5.00, "2026-10-05", "Provision (Mollie Connect)  tr_Aa1x")];
    const { L, P, M } = finSetup(seed, async () => [], "2026-11-03");
    await L.load(); await M.autoVouchers();
    assert.strictEqual(String(L.get("CheckAccountTransaction", "1").status), "100"); assert.ok(!(await P.list()).length);
    assert.ok(M.onlineNotices().some(n => /noch keiner Plattform zugeordnet/.test(n)), JSON.stringify(M.onlineNotices()));
  });
  await t("KO-6: Online-Sammelrechnung nur einmal fertigstellen – weitere Entwürfe nur melden", async () => {
    const draft = (id, extra) => ["Invoice", Object.assign({ id, invoiceType: "RE", status: "100", header: "kochdu Online-Provisionen 10/2026 (Mollie Connect)", sumGross: "5.00", paidAmount: "0", invoiceDate: "2026-10-31T00:00:00+02:00", contact: { id: "1", objectName: "Contact" } }, extra || {})];
    let E = finSetup([["CheckAccount", { id: "2", name: "Mollie", status: "100", type: "online" }], draft("881"), draft("882"), fee("1", 5.00, "2026-10-05", "Provision (Mollie Connect)  tr_Aa1x")], async () => [{ id: "tr_Aa1x", at: "2026-10-04T10:00:00Z" }], "2026-11-03");
    await E.L.load(); await E.M.autoVouchers();
    assert.deepStrictEqual(["881", "882"].map(id => String(E.L.get("Invoice", id).status)), ["100", "100"], "zwei Entwürfe ohne Kennung → keiner wird fertiggestellt");
    assert.ok(E.M.onlineNotices().some(n => /2 Entwürfe „kochdu Online-Provisionen 10\/2026“ – keiner eindeutig/.test(n)), JSON.stringify(E.M.onlineNotices()));
    E = finSetup([["CheckAccount", { id: "2", name: "Mollie", status: "100", type: "online" }], draft("881"), draft("882", { platformRef: "kochdu:2026-10:online" }), fee("1", 5.00, "2026-10-05", "Provision (Mollie Connect)  tr_Aa1x")], async () => [{ id: "tr_Aa1x", at: "2026-10-04T10:00:00Z" }], "2026-11-03");
    await E.L.load(); await E.M.autoVouchers(); await E.M.autoVouchers();
    assert.strictEqual(String(E.L.get("Invoice", "882").status), "1000", "der Entwurf von fs-order (platformRef)"); assert.strictEqual(String(E.L.get("Invoice", "881").status), "100", "zweiter Entwurf bleibt");
    assert.ok(E.M.onlineNotices().some(n => /Weiterer Entwurf „kochdu Online-Provisionen 10\/2026“ neben RE-/.test(n)), JSON.stringify(E.M.onlineNotices()));
  });
  await t("X3: Bruttopreis-Positionen (grossPricing) → Rechnungssumme cent-genau (347,55 statt 347,56)", async () => {
    const { L } = finSetup([], null, "2026-11-03"); await L.load();
    const mk = async (gp) => (await L.request("POST", "/Invoice/Factory/saveInvoice", { body: { invoice: { header: "Rechnung", status: "100", invoiceType: "RE", contact: { id: "1", objectName: "Contact" } },
      invoicePosSave: [Object.assign({ name: "VALUERO", quantity: 1, price: 289.63, taxRate: 20 }, gp ? { priceGross: 347.55, grossPricing: true } : {})] } })).objects.invoice;
    assert.strictEqual((await mk(false)).sumGross, "347.56"); assert.strictEqual((await mk(true)).sumGross, "347.55");
    const srcTxt = fs.readFileSync(path.join(ROOT, "server.js"), "utf8"), fnTxt = srcTxt.slice(srcTxt.indexOf("async function sevCreateInvoice"), srcTxt.indexOf("async function sevBook"));
    assert.ok(/priceGross: Math\.round\(parseFloat\(i\.priceGross\) \* 100\) \/ 100, grossPricing: true/.test(fnTxt), "Cockpit-Rechnungen schicken Bruttopreis");
  });

  // Teil 4: Server mit Attrappen
  const M = createMock(), mport = await listen(M.server), mb = "http://127.0.0.1:" + mport;
  const dir = copyApp(), port = 5800 + Math.floor(Math.random() * 600);
  const env = Object.assign({}, process.env); Object.keys(env).forEach(k => { if (STRIP.test(k)) delete env[k]; });
  Object.assign(env, { NODE_ENV: "test", PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x", SEVDESK_API_KEY: KEY, SEVDESK_API_BASE: mb + "/api/v1",
    VALUERO_PARTNER_STATS_URL: mb + "/valuero", VALUERO_PARTNER_STATS_TOKEN: "vt", ANTONHAUS_STATS_URL: mb + "/antonhaus", ANTONHAUS_STATS_TOKEN: "at", WEATHER_URL: mb + "/wx", FX_URL: mb + "/fx", VIES_URL: mb + "/vies",
    FINAPI_TOKEN_KOCHDU: "fin-kochdu-1", FINAPI_TOKEN_BLITZDINGS: "fin-blitz-1", FINAPI_TOKEN_KANTINEUR: "fin-kant-1" });
  const srv = cp.spawn(process.execPath, ["server.js"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
  let srvOut = ""; srv.stdout.on("data", d => (srvOut += d)); srv.stderr.on("data", d => (srvOut += d));
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 80; i++) { try { await fetch(base + "/admin/login"); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
  const api = async (p, body) => { const r = await fetch(base + p, body ? { method: "POST", headers: { cookie: COOKIE, "content-type": "application/json" }, body: JSON.stringify(body) } : { headers: { cookie: COOKIE } }); const tx = await r.text(); let j = null; try { j = JSON.parse(tx); } catch (e) {} return { status: r.status, j }; };
  let ipN = 10; const fa = async (tok, m, p, body) => { const r = await fetch(base + "/fin-api/v1" + p, { method: m, headers: { authorization: "Bearer " + tok, "content-type": "application/json", "x-forwarded-for": "203.0.113." + (ipN++ % 200) }, body: body ? JSON.stringify(body) : (m === "GET" ? undefined : "{}") }); let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, j }; };

  await t("X2: fin-api nur mit Freigabeliste je Plattform (alte + neue Versionen), keine Einstellungen/Bank/Belege, fremde Rechnungen gesperrt", async () => {
    const K = "fin-kochdu-1", Bz = "fin-blitz-1", Ka = "fin-kant-1";
    for (const [m, p] of [["POST", "/Fin/settings"], ["POST", "/Fin/enshrinePeriod"], ["PUT", "/InvoicePos/5"], ["PUT", "/SevSequence/1"], ["POST", "/CheckAccountTransactionLog"], ["GET", "/CheckAccountTransaction"], ["GET", "/Voucher"], ["PUT", "/Invoice/802/cancelInvoice"], ["DELETE", "/Invoice/801"], ["GET", "/Invoice"]])
      assert.strictEqual((await fa(K, m, p)).status, 403, "kochdu " + m + " " + p);
    // kochdu: alt (addAddress, saveCreditNote) und neu (ContactAddress, GET-Status, Suche nach platformRef/Kontakt)
    for (const [m, p] of [["GET", "/SevUser"], ["GET", "/Contact?depth=0&limit=1000"], ["POST", "/Contact"], ["POST", "/Contact/21/addAddress"], ["POST", "/ContactAddress"]]) assert.notStrictEqual((await fa(K, m, p)).status, 403, "kochdu " + m + " " + p);
    let r = await fa(K, "POST", "/Invoice/Factory/saveInvoice", { invoice: { header: "kochdu-Gebühr Barzahlungen 11/2026", status: 100, contact: { id: "21", objectName: "Contact" } }, invoicePosSave: [] }); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    assert.strictEqual(M.state.saved.slice(-1)[0].invoice.finApiSource, "kochdu", "neue Rechnung wird kochdu zugeschrieben");
    const newId = r.j.objects.invoice.id;
    assert.strictEqual((await fa(K, "PUT", "/Invoice/" + newId + "/sendBy", { sendType: "VPDF" })).status, 200, "eigene Rechnung fertigstellen");
    assert.strictEqual((await fa(K, "PUT", "/Invoice/801/sendBy", { sendType: "VPDF" })).status, 200, "ältere kochdu-Rechnung (platformRef)");
    assert.strictEqual((await fa(K, "PUT", "/Invoice/802/sendBy", { sendType: "VPDF" })).status, 403, "fremde Rechnung");
    assert.strictEqual((await fa(K, "POST", "/Invoice/802/sendViaEmail", { toEmail: "x@y.at" })).status, 403);
    assert.strictEqual((await fa(K, "GET", "/Invoice/801")).status, 200); assert.strictEqual((await fa(K, "GET", "/Invoice/802")).status, 403);
    r = await fa(K, "GET", "/Invoice?contact[id]=21&contact[objectName]=Contact&limit=100"); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.j.objects.map(o => o.id).sort(), ["801", newId].sort(), "Suche liefert nur eigene Belege");
    assert.strictEqual((await fa(K, "POST", "/Invoice/Factory/saveInvoice", { invoice: { id: "802", header: "x" }, invoicePosSave: [] })).status, 403, "fremden Entwurf überschreiben");
    assert.strictEqual((await fa(K, "POST", "/CreditNote/Factory/saveCreditNote", { creditNote: { header: "Auszahlung" }, creditNotePosSave: [] })).status, 200, "alte Auszahlungs-Gutschrift");
    // Blitzdings
    for (const [m, p] of [["GET", "/SevUser"], ["GET", "/Contact?depth=0&limit=2000"], ["POST", "/Contact"], ["POST", "/ContactAddress"], ["POST", "/CommunicationWay"], ["GET", "/Invoice/Factory/getNextInvoiceNumber?invoiceType=RE&useNextNumber=true"]]) assert.notStrictEqual((await fa(Bz, m, p)).status, 403, "blitzdings " + m + " " + p);
    assert.strictEqual((await fa(Bz, "PUT", "/Invoice/803/enshrine")).status, 200, "Blitzdings-Rechnung (Referenz BD-)"); assert.strictEqual((await fa(Bz, "PUT", "/Invoice/802/enshrine")).status, 403);
    assert.strictEqual((await fa(K, "PUT", "/Invoice/801/enshrine")).status, 403, "kochdu darf nicht festschreiben"); assert.strictEqual((await fa(Bz, "PUT", "/Invoice/801/sendBy")).status, 403);
    // Kantineur
    for (const [m, p] of [["GET", "/Tools/bookkeepingSystemVersion"], ["GET", "/SevUser"], ["GET", "/Contact/21"], ["POST", "/Contact"]]) assert.notStrictEqual((await fa(Ka, m, p)).status, 403, "kantineur " + m + " " + p);
    r = await fa(Ka, "GET", "/Invoice?customerInternalNote=" + encodeURIComponent("Mollie tr_k1") + "&invoiceType=RE&limit=50"); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.j.objects.map(o => o.id), ["804"], "nur Kantineur-Rechnungen");
    assert.strictEqual((await fa(Ka, "GET", "/Invoice/804")).status, 200); assert.strictEqual((await fa(Ka, "GET", "/Invoice/805")).status, 403); assert.strictEqual((await fa(Ka, "POST", "/Invoice/804/sendViaEmail", {})).status, 200);
    assert.strictEqual((await fa(Ka, "GET", "/Contact?depth=0&limit=1000")).status, 403, "Kantineur braucht keine Kontaktliste");
    assert.ok(/fin-api gesperrt kochdu POST \/Fin\/settings/.test(srvOut) && /fremder Beleg/.test(srvOut), "protokolliert");
  });

  await t("VALUERO-Abrufe: Partner mit contract=2, Antonhaus mit basis=arrival; Umstellung per Ein-Klick (Schnappschuss am Server) → danach nach Anreise", async () => {
    const year = viennaToday().slice(0, 4);
    await api("/admin/api/billing", { op: "invoice", key: "valuero:antonhaus", invoice: AH_RECS[0] });
    await api("/admin/api/billing", { op: "invoice", key: "valuero:antonhaus", invoice: AH_RECS[1] });
    let d = (await api("/admin/api/cockpit?force=1&year=" + year)).j, it = (d.abgleich.items || []).find(x => x.key === "valuero:antonhaus");
    assert.ok(M.state.partnerQ.some(q => q.contract === "2"), JSON.stringify(M.state.partnerQ)); assert.ok(M.state.antonQ.length && M.state.antonQ.every(q => q.basis === "arrival"), JSON.stringify(M.state.antonQ));
    assert.ok(it && /Umstellung/.test(it.blocked || "") && it.proposal && it.proposal.op === "vaswitch", JSON.stringify(it)); assert.strictEqual(it.action, null);
    const r = await api("/admin/api/billing", { op: "vaswitch", key: "antonhaus", _switch: { prebilledByMonth: { "2026-10": 999999 } } });
    assert.strictEqual(r.j.ok, true, JSON.stringify(r.j)); const sw = r.j.billing.valuero.antonhaus.switch;
    assert.deepStrictEqual(sw.prebilledByMonth, { "2026-06": 16750, "2026-08": 15545, "2026-12": 50000 }, "Schnappschuss vom Server, nicht aus der Anfrage"); assert.strictEqual(sw.totalCents, 82295); assert.strictEqual(sw.invoiceNr, "RE-1272"); assert.strictEqual(sw.billedCents, 82295);
    d = (await api("/admin/api/cockpit?force=1&year=" + year)).j; it = d.abgleich.items.find(x => x.key === "valuero:antonhaus");
    assert.ok(!it.blocked, it.blocked); assert.strictEqual(it.refund, 0, "keine falsche Erstattung");
    M.state.antonMode = "old"; const r2 = await api("/admin/api/billing", { op: "vaswitch", key: "antonhaus" }); assert.strictEqual(r2.j.ok, false, "alte Antonhaus-Version → keine Umstellung");
  });
  await t("VA-2: Antonhaus 502 (Beds24) → Hinweis „Gebührendaten Antonhaus fehlen – neu laden“, keine Erstattung, kein Verrechnen", async () => {
    M.state.antonMode = "down"; await new Promise(r => setTimeout(r, 26000));   // 25-s-Zwischenspeicher der Statistik-Abrufe ablaufen lassen
    const d = (await api("/admin/api/cockpit?force=1&year=" + viennaToday().slice(0, 4))).j, it = d.abgleich.items.find(x => x.key === "valuero:antonhaus");
    assert.ok(it && it.missing && /Gebührendaten Antonhaus fehlen – neu laden/.test(it.blocked), JSON.stringify(it)); assert.strictEqual(it.refund, 0); assert.strictEqual(it.action, null);
  });

  srv.kill(); M.server.close();
  try { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(udir, { recursive: true, force: true }); } catch (e) {}
  console.log("Plattform-Abrechnung: " + pass + " bestanden, " + fail + " fehlgeschlagen");
  if (fail) { console.log(fails.map(f => "✗ " + f).join("\n")); console.log(srvOut.slice(-1500)); }
  process.exit(fail ? 1 : 0);
})();
