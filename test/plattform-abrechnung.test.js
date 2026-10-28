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
const AH_SWITCH = { cutoff: "2026-09-30", prebilledByMonth: { "2026-06": 16750, "2026-08": 15545, "2026-12": 50000 }, prebilledCurrentRuleByMonth: { "2026-06": 16750, "2026-08": 15545, "2026-12": 50000 }, totalCents: 82295, legacyTotalCents: 82295, invoiceNr: "RE-1272", confirmedAt: "2026-10-28T10:00:00Z" };
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
    assert.ok(/Aufenthalte \(Anreise\) 01\.10\.2026 – 31\.12\.2026: 690,30 € · abzüglich bereits mit RE-1272 verrechnet \(Buchungseingang bis 30\.09\.2026, nach heutiger Regel\) 500,00 €/.test(a.items[0].text), a.items[0].text);
    assert.deepStrictEqual([a.after.billing.from, a.after.billing.to, a.after.billing.src, a.after.billing.basis], ["2026-10-01", "2026-12-31", "antonhaus", "arrival"]);
    assert.strictEqual(it.catchup, 30); assert.ok(it.catchupAction && it.catchupAction.items[0].priceGross === 30 && it.catchupAction.after.billing.adj === true && !it.catchupAction.after.billing.to);
    assert.deepStrictEqual(it.catchupAction.after.billing.parts, [{ from: "2026-01-01", to: "2026-09-30", gross: 30 }], "Nachverrechnung trägt den gedeckten Zeitraum (A1)");
    assert.strictEqual(it.pending, 80);
  }]);
  out.push(["VALUERO/Antonhaus nach Umstellung, Ansicht 2026 am 28.10.2026: nichts fällig, keine falsche Erstattung, laufendes Quartal netto", () => {
    const it = va({ year: "2026", today: "2026-10-28", bill: billSw(), valuero: { objects: [ahObj("2026")] }, valueroPrev: { objects: [ahObj("2025", { months: [] })] } }).find(x => x.key === "valuero:antonhaus");
    assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.refund, 0); assert.strictEqual(it.pending, 190.3); assert.strictEqual(it.billedUntil, "2026-09-30");
  }]);
  out.push(["VALUERO/Antonhaus: nach der Q4-Rechnung storniert jemand die Dez-Buchung (schon mit RE-1272 verrechnet) → nicht still abgezogen, Hinweis „mehr verrechnet als heute angefallen“", () => {
    const prev = ahObj("2026", { months: AH_MONTHS_2026.filter(m => m.month !== "2026-12") });
    const it = va({ year: "2027", today: "2027-01-05", bill: billSw(), valuero: { objects: [ahObj("2027")] }, valueroPrev: { objects: [prev] } }).find(x => x.key === "valuero:antonhaus");
    assert.strictEqual(it.unbilled, 190.3, "Oktober bleibt fällig"); assert.ok((it.notes || []).some(n => /seither storniert oder gesenkt: 500,00 € mehr verrechnet als heute angefallen/.test(n)), JSON.stringify(it.notes));
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
  out.push(["R3-5: Vorjahr geladen, aber das Haus fehlt darin (bzw. ohne Monate) → keine Erstattung für Vorjahres-Zeiträume, Hinweis; fälliger Zeitraum im Vorjahr → gesperrt", () => {
    const recs2 = haRec.concat([{ id: "302", nr: "RE-302", date: "2027-01-02", gross: 90, from: "2026-10-01", to: "2026-12-31", label: "Haus A", src: "partner" }]);
    const sev2 = mkSev([I({ id: "301", nr: "RE-301", date: "2026-10-01", gross: 100, paid: 100 }), I({ id: "302", nr: "RE-302", date: "2027-01-02", gross: 90, paid: 90 })]);
    const run = (prevObjs, rs) => va({ year: "2027", today: "2027-04-05", sev: sev2, bill: { prices: {}, sites: {}, invoices: { "valuero:haus-a": rs || recs2 } }, valuero: { objects: [ha([pm({ month: "2027-01", provisionCents: 1000 })])] }, valueroPrev: { objects: prevObjs } }).find(x => x.key === "valuero:haus-a");
    let it = run([prevA()]); assert.strictEqual(it.refund, 10, "mit Vorjahresdaten: 90 statt höchstens 80 verrechnet → Erstattung prüfen");
    for (const prev of [[], [ha([])], [ha(undefined)]]) {
      it = run(prev); assert.ok(!it.blocked, it.blocked); assert.strictEqual(it.refund, 0, "ohne Vorjahresdaten keine Erstattung"); assert.strictEqual(it.catchup, 0); assert.strictEqual(it.unbilled, 10, "laufendes Jahr wird weiter verrechnet");
      assert.ok((it.notes || []).some(n => /Gebührendaten 2026 für dieses Haus fehlen/.test(n)), JSON.stringify(it.notes));
    }
    it = run([], haRec); assert.ok(/Gebührendaten 2026 fehlen/.test(it.blocked || ""), "fälliger Zeitraum beginnt im Vorjahr"); assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.refund, 0);
    // neues Haus ohne Vorjahres-Abrechnungen: kein Hinweis, normal verrechnet
    it = va({ year: "2027", today: "2027-04-05", sev: mkSev([]), bill: { prices: {}, sites: {}, invoices: {} }, valuero: { objects: [ha([pm({ month: "2027-01", provisionCents: 1000 })], { billingStart: "2027-01-01" })] }, valueroPrev: { objects: [] } }).find(x => x.key === "valuero:haus-a");
    assert.ok(!it.blocked, it.blocked); assert.strictEqual(it.unbilled, 10); assert.ok(!(it.notes || []).some(n => /Gebührendaten/.test(n)));
    // R4-5: Haus ganz ohne Gebühren, Abrechnung und Abrechnungsbeginn, im Vorjahr nicht geliefert bzw. Vorjahr nicht geladen → nicht „Daten fehlen“
    for (const pv of [{ objects: [] }, { objects: [], missing: [{ key: "haus-c" }] }]) {
      it = va({ year: "2027", today: "2027-04-05", sev: mkSev([]), bill: { prices: {}, sites: {}, invoices: {} }, valuero: { objects: [ha([pm({ month: "2027-01", provisionCents: 0 })], { key: "haus-c", billingStart: null })] }, valueroPrev: pv }).find(x => x.key === "valuero:haus-c");
      assert.ok(!/Gebührendaten/.test(it.blocked || ""), it.blocked); assert.ok(/Abrechnungsbeginn/.test(it.blocked || ""), it.blocked); assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.refund, 0);
      assert.ok(!(it.notes || []).some(n => /Gebührendaten/.test(n)), JSON.stringify(it.notes));
    }
    // … mit Abrechnungsbeginn im Vorjahr bleibt es gesperrt (fälliger Zeitraum im Vorjahr nicht beurteilbar)
    it = va({ year: "2027", today: "2027-04-05", sev: mkSev([]), bill: { prices: {}, sites: {}, invoices: {} }, valuero: { objects: [ha([pm({ month: "2027-01", provisionCents: 0 })], { key: "haus-c", billingStart: "2026-10-01" })] }, valueroPrev: { objects: [] } }).find(x => x.key === "valuero:haus-c");
    assert.ok(/Gebührendaten 2026 fehlen/.test(it.blocked || ""), it.blocked); assert.strictEqual(it.unbilled, 0);
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
  // ── Review-Befunde Teil A (A1, A2, A4, A8, A9, A12): Abgleich je verrechnetem Zeitraum ──
  const ahM = (arr) => arr.map(([month, c]) => ({ month, provisionCents: c, prebilledCents: 0 }));
  const recQ = (id, date, gross, from, to, extra) => Object.assign({ id, nr: "RE-" + id, date, gross, from, to, label: "x", src: "antonhaus", basis: "arrival" }, extra || {});
  out.push(["A1: Nachverrechnung trägt ihre Zeiträume – ein Jahr später kein „Nachverrechnen 792,95 €“ (Schnappschuss genau einmal), keine Erstattung", () => {
    const recsA = AH_RECS.concat([recQ("1300", "2027-01-05", 190.3, "2026-10-01", "2026-12-31"), recQ("1301", "2027-01-05", 30, null, null, { adj: true, parts: [{ from: "2026-01-01", to: "2026-09-30", gross: 30 }] }),
      recQ("1400", "2027-04-01", 80, "2027-01-01", "2027-03-31")]);
    const sevA = mkSev(["1272", "1300", "1301", "1400"].map(id => I({ id, nr: "RE-" + id, gross: (recsA.find(r => r.id === id) || {}).gross })));
    const bill = { prices: {}, sites: {}, invoices: { "valuero:antonhaus": recsA }, valuero: { antonhaus: { switch: AH_SWITCH } } };
    let it = abgleichBuild({ year: "2028", today: "2028-01-05", sev: sevA, bill, sitesSnap: null, valuero: { objects: [ahObj("2028", { months: [] })] }, valueroPrev: { objects: [ahObj("2027")] } }).items.find(x => x.key === "valuero:antonhaus");
    assert.strictEqual(it.catchup, 0, JSON.stringify(it.notes)); assert.strictEqual(it.catchupAction, null); assert.strictEqual(it.refund, 0); assert.strictEqual(it.unbilled, 0);
    it = abgleichBuild({ year: "2027", today: "2027-04-05", sev: sevA, bill, sitesSnap: null, valuero: { objects: [ahObj("2027")] }, valueroPrev: { objects: [ahObj("2026")] } }).items.find(x => x.key === "valuero:antonhaus");
    assert.strictEqual(it.catchup, 0, "Sep-Nachtrag ist mit RE-1301 gedeckt"); assert.strictEqual(it.refund, 0); assert.strictEqual(it.unbilled, 0);
    // Partner-Haus: Nachverrechnung 20 € für Q4 2026, Ansicht 2028 → keine „zu viel verrechnet 20 €“
    const hs = (months) => ({ key: "waldheim", name: "Waldheim", src: "partner", basis: "arrival", billingStart: "2026-10-01", months });
    const r2 = [{ id: "500", nr: "RE-500", date: "2027-01-02", gross: 100, from: "2026-10-01", to: "2026-12-31", src: "partner" }, { id: "505", nr: "RE-505", date: "2027-02-10", gross: 20, adj: true, parts: [{ from: "2026-10-01", to: "2026-12-31", gross: 20 }], src: "partner" },
      { id: "510", nr: "RE-510", date: "2027-04-01", gross: 50, from: "2027-01-01", to: "2027-03-31", src: "partner" }];
    const sevW = mkSev(r2.map(r => I({ id: r.id, nr: r.nr, gross: r.gross })));
    it = abgleichBuild({ year: "2028", today: "2028-01-05", sev: sevW, bill: { prices: {}, sites: {}, invoices: { "valuero:waldheim": r2 } }, sitesSnap: null, valuero: { objects: [hs([])] }, valueroPrev: { objects: [hs([pm({ month: "2027-02", provisionCents: 5000 })])] } }).items.find(x => x.key === "valuero:waldheim");
    assert.strictEqual(it.refund, 0); assert.strictEqual(it.catchup, 0);
    it = abgleichBuild({ year: "2027", today: "2027-04-05", sev: sevW, bill: { prices: {}, sites: {}, invoices: { "valuero:waldheim": r2 } }, sitesSnap: null, valuero: { objects: [hs([pm({ month: "2027-02", provisionCents: 5000 })])] }, valueroPrev: { objects: [hs([pm({ month: "2026-12", provisionCents: 12000 })])] } }).items.find(x => x.key === "valuero:waldheim");
    assert.strictEqual(it.refund, 0); assert.strictEqual(it.catchup, 0, "Q4 2026: 100 + 20 nachverrechnet = 120");
    // Zeitraum storniert, Nachverrechnung bleibt gültig → bei der neuen Quartalsrechnung abgezogen (nie doppelt)
    const r3 = [r2[0], r2[1]]; const sev3 = mkSev([I({ id: "500", nr: "RE-500", gross: 100, cancelled: true }), I({ id: "505", nr: "RE-505", gross: 20 })]);
    it = abgleichBuild({ year: "2027", today: "2027-01-10", sev: sev3, bill: { prices: {}, sites: {}, invoices: { "valuero:waldheim": r3 } }, sitesSnap: null, valuero: { objects: [hs([])] }, valueroPrev: { objects: [hs([pm({ month: "2026-12", provisionCents: 12000 })])] } }).items.find(x => x.key === "valuero:waldheim");
    assert.strictEqual(it.unbilled, 100, "120 fällig − 20 schon nachverrechnet"); assert.ok(/abzüglich bereits nachverrechnet 20,00 €/.test(it.action.items[0].text), it.action.items[0].text);
    // Nachverrechnung ohne Zeitraumangabe (Altformat) → Hinweis, keine weitere Nachverrechnung
    const r4 = [r2[0], { id: "506", nr: "RE-506", date: "2027-02-10", gross: 20, adj: true, src: "partner" }];
    it = abgleichBuild({ year: "2027", today: "2027-01-10", sev: mkSev([I({ id: "500", nr: "RE-500", gross: 100 }), I({ id: "506", nr: "RE-506", gross: 20 })]), bill: { prices: {}, sites: {}, invoices: { "valuero:waldheim": r4 } }, sitesSnap: null, valuero: { objects: [hs([])] }, valueroPrev: { objects: [hs([pm({ month: "2026-12", provisionCents: 15000 })])] } }).items.find(x => x.key === "valuero:waldheim");
    assert.strictEqual(it.catchup, 0); assert.ok(it.notes.some(n => /ohne Zeitraumangabe/.test(n)), JSON.stringify(it.notes));
  }]);
  out.push(["A2: Gutschrift aus dem eigenen Hinweis (Storno-Provision, RE-1272 nach alter Regel) löst keine Nachverrechnung aus, Hinweis verschwindet", () => {
    const cxlPrev = ha([pm({ month: "2026-07", provisionCents: 5000 }), pm({ month: "2026-08", provisionCents: 5000, mollieFeesCancelledCents: 1200 })]);
    let it = vaA(null, cxlPrev); assert.ok((it.notes || []).some(n => /stornierten Buchungen.*12,00 €/.test(n)));
    it = vaA(null, cxlPrev, null, null, { credited: 12 });
    assert.strictEqual(it.catchup, 0, "keine Endlosschleife Gutschrift ↔ Nachverrechnung"); assert.strictEqual(it.catchupAction, null); assert.strictEqual(it.refund, 0);
    assert.ok(!(it.notes || []).some(n => /stornierten Buchungen/.test(n)), "Hinweis erledigt: " + JSON.stringify(it.notes));
    // Antonhaus: Gutschrift 300 € zu RE-1272 (5 % statt 2 %, wie im Hinweis) → keine Nachverrechnung 300 €, Hinweis weg
    const sw = Object.assign({}, AH_SWITCH, { prebilledCurrentRuleByMonth: { "2026-06": 16750, "2026-08": 15545, "2026-12": 20000 } });
    const prev = ahObj("2026", { months: ahM([["2026-06", 16750], ["2026-08", 15545], ["2026-09", 3000], ["2026-10", 19030], ["2026-12", 20000]]) });
    const recsB = AH_RECS.concat([recQ("1300", "2027-01-05", 190.3, "2026-10-01", "2026-12-31"), recQ("1301", "2027-01-05", 30, null, null, { adj: true, parts: [{ from: "2026-01-01", to: "2026-09-30", gross: 30 }] })]);
    const run = (cr) => abgleichBuild({ year: "2027", today: "2027-01-20", sev: mkSev([I({ id: "1272", nr: "RE-1272", gross: 475.41, credited: cr || undefined }), I({ id: "1300", nr: "RE-1300", gross: 190.3 }), I({ id: "1301", nr: "RE-1301", gross: 30 })]),
      bill: { prices: {}, sites: {}, invoices: { "valuero:antonhaus": recsB }, valuero: { antonhaus: { switch: sw } } }, sitesSnap: null, valuero: { objects: [ahObj("2027")] }, valueroPrev: { objects: [prev] } }).items.find(x => x.key === "valuero:antonhaus");
    it = run(0); assert.ok(it.notes.some(n => /RE-1272 hat 300,00 € mehr verrechnet als nach heutiger Regel/.test(n)), JSON.stringify(it.notes)); assert.strictEqual(it.catchup, 0); assert.strictEqual(it.refund, 0);
    it = run(300); assert.strictEqual(it.catchup, 0, "A2 greift nicht"); assert.strictEqual(it.refund, 0); assert.ok(!(it.notes || []).some(n => /mehr verrechnet/.test(n)), JSON.stringify(it.notes));
  }]);
  out.push(["R3-11: Antonhaus ohne Gebühren nach heutiger Regel – kein Umstellungs-Knopf (Hinweis); ältere, schon übernommene Umstellung ohne diese Werte → deutlicher Hinweis, Rechnungstext ohne „nach heutiger Regel“", () => {
    const trNoCur = Object.assign({}, AH_TRANSITION, { byArrivalMonth: AH_TRANSITION.byArrivalMonth.map(m => ({ month: m.month, provisionCents: m.provisionCents, prebilledCents: m.prebilledCents })) });
    let it = va({ year: "2027", today: "2027-01-05", bill: { prices: {}, sites: {}, invoices: { "valuero:antonhaus": AH_RECS } }, valuero: { objects: [ahObj("2027", { transition: trNoCur })] }, valueroPrev: { objects: [ahObj("2026", { transition: trNoCur })] } }).find(x => x.key === "valuero:antonhaus");
    assert.ok(/Umstellung/.test(it.blocked || ""), it.blocked); assert.ok(!it.proposal, "kein Knopf"); assert.ok(it.notes.some(n => /noch nicht nach heutiger Regel \(Juni 2026, August 2026, Dezember 2026\)/.test(n)), JSON.stringify(it.notes));
    const old = Object.assign({}, AH_SWITCH); delete old.prebilledCurrentRuleByMonth;
    it = va({ year: "2027", today: "2027-01-05", bill: { prices: {}, sites: {}, invoices: { "valuero:antonhaus": AH_RECS }, valuero: { antonhaus: { switch: old } } }, valuero: { objects: [ahObj("2027")] }, valueroPrev: { objects: [ahObj("2026")] } }).find(x => x.key === "valuero:antonhaus");
    assert.ok(!it.blocked, it.blocked); assert.strictEqual(it.unbilled, 190.3, "Beträge unverändert (damaliger Betrag abgezogen)");
    assert.ok(/verrechnet \(Buchungseingang bis 30\.09\.2026\) 500,00 €/.test(it.action.items[0].text), it.action.items[0].text);
    assert.ok(it.notes.some(n => /Umstellung ohne Gebühren nach heutiger Regel übernommen.*Juni 2026, August 2026, Dezember 2026.*neu bestätigen/.test(n)), JSON.stringify(it.notes));
  }]);
  out.push(["A4: Antonhaus – abgezogen wird nur die Gebühr der schon verrechneten Buchungen nach heutiger Regel; neue Buchung im selben Monat wird verrechnet", () => {
    const sw = Object.assign({}, AH_SWITCH, { prebilledCurrentRuleByMonth: { "2026-06": 16750, "2026-08": 15545, "2026-12": 20000 } });
    const prev = ahObj("2026", { months: ahM([["2026-06", 16750], ["2026-08", 15545], ["2026-09", 3000], ["2026-10", 19030], ["2026-12", 50000]]) });   // Dez: alte Buchung heute 200 + neue 300
    const it = va({ year: "2027", today: "2027-01-05", bill: { prices: {}, sites: {}, invoices: { "valuero:antonhaus": AH_RECS }, valuero: { antonhaus: { switch: sw } } }, valuero: { objects: [ahObj("2027")] }, valueroPrev: { objects: [prev] } }).find(x => x.key === "valuero:antonhaus");
    assert.strictEqual(it.unbilled, 490.3, "Okt 190,30 + Dez 500 − 200"); assert.strictEqual(it.deducted.prebilled, 200);
    assert.ok(/: 690,30 € · abzüglich bereits mit RE-1272 verrechnet \(Buchungseingang bis 30\.09\.2026, nach heutiger Regel\) 200,00 €/.test(it.action.items[0].text), it.action.items[0].text);
    assert.ok(it.notes.some(n => /RE-1272 hat 300,00 € mehr verrechnet als nach heutiger Regel.*Gutschrift nur, wenn du das so entscheidest/.test(n)), JSON.stringify(it.notes));
    assert.ok(!it.proposal && !it.notes.some(n => /zu viel verrechnet/.test(n)), "kein Knopf, keine Erstattung"); assert.strictEqual(it.refund, 0);
    // Schnappschuss ohne heutige Regel (ältere Antonhaus-Version) → vorsichtig der damalige Betrag
    const it2 = va({ year: "2027", today: "2027-01-05", bill: { prices: {}, sites: {}, invoices: { "valuero:antonhaus": AH_RECS }, valuero: { antonhaus: { switch: AH_SWITCH } } }, valuero: { objects: [ahObj("2027")] }, valueroPrev: { objects: [prev] } }).find(x => x.key === "valuero:antonhaus");
    assert.strictEqual(it2.unbilled, 190.3);
  }]);
  out.push(["A8/A9: Abrechnungsbeginn nachträglich später bzw. Altbuchungen in schon verrechneten Quartalen → keine Erstattung, kein „zu viel“, keine Nachverrechnung", () => {
    const hp = (key, months, bs) => ({ key, name: key, src: "partner", basis: "arrival", billingStart: bs || null, months });
    const recsX = ["01", "04", "07"].map((m, i) => ({ id: "61" + i, nr: "RE-61" + i, date: "2026-" + ["04", "07", "10"][i] + "-01", gross: 100, from: "2026-" + m + "-01", to: ymdQ(m), src: "partner" }));
    function ymdQ(m) { return { "01": "2026-03-31", "04": "2026-06-30", "07": "2026-09-30" }[m]; }
    let it = abgleichBuild({ year: "2026", today: "2026-10-28", sev: mkSev(recsX.map(r => I({ id: r.id, nr: r.nr, gross: 100 }))), bill: { prices: {}, sites: {}, invoices: { "valuero:haus-x": recsX } }, sitesSnap: null,
      valuero: { objects: [hp("haus-x", ["01", "04", "07"].map(m => pm({ month: "2026-" + m, provisionCents: 10000 })), "2026-07-01")] }, valueroPrev: { objects: [hp("haus-x", [], "2026-07-01")] } }).items.find(x => x.key === "valuero:haus-x");
    assert.strictEqual(it.refund, 0, "A8"); assert.strictEqual(it.catchup, 0);
    const recsY = [{ id: "600", nr: "RE-600", date: "2026-10-01", gross: 300, from: "2026-07-01", to: "2026-09-30" }];
    const mY = [pm({ month: "2026-07", provisionCents: 10000, importedCents: 10000 }), pm({ month: "2026-08", provisionCents: 10000, importedCents: 6000 }), pm({ month: "2026-09", provisionCents: 10000 })];
    it = abgleichBuild({ year: "2026", today: "2026-10-28", sev: mkSev([I({ id: "600", nr: "RE-600", gross: 300 })]), bill: { prices: {}, sites: {}, invoices: { "valuero:alpinappart": recsY } }, sitesSnap: null,
      valuero: { objects: [hp("alpinappart", mY)] }, valueroPrev: { objects: [hp("alpinappart", [])] } }).items.find(x => x.key === "valuero:alpinappart");
    assert.ok(/Quelle gewechselt \(alpinappart → partner\)/.test(it.blocked || ""), "A12: Altbestand ohne src = Altquelle Alpinappart → einmal bestätigen: " + it.blocked);
    it = abgleichBuild({ year: "2026", today: "2026-10-28", sev: mkSev([I({ id: "600", nr: "RE-600", gross: 300 })]), bill: { prices: {}, sites: {}, invoices: { "valuero:alpinappart": recsY }, valuero: { alpinappart: { ackSrc: "partner" } } }, sitesSnap: null,
      valuero: { objects: [hp("alpinappart", mY)] }, valueroPrev: { objects: [hp("alpinappart", [])] } }).items.find(x => x.key === "valuero:alpinappart");
    assert.strictEqual(it.refund, 0, "A9"); assert.strictEqual(it.catchup, 0); assert.ok(!it.blocked, it.blocked);
    // echte Senkung bleibt erkannt: Q3 300 verrechnet, heute nur 250 (Storno) → zu viel 50
    it = abgleichBuild({ year: "2026", today: "2026-10-28", sev: mkSev([I({ id: "600", nr: "RE-600", gross: 300 })]), bill: { prices: {}, sites: {}, invoices: { "valuero:alpinappart": recsY }, valuero: { alpinappart: { ackSrc: "partner" } } }, sitesSnap: null,
      valuero: { objects: [hp("alpinappart", [pm({ month: "2026-07", provisionCents: 10000 }), pm({ month: "2026-08", provisionCents: 5000 }), pm({ month: "2026-09", provisionCents: 10000 })])] }, valueroPrev: { objects: [hp("alpinappart", [])] } }).items.find(x => x.key === "valuero:alpinappart");
    assert.strictEqual(it.refund, 50);
  }]);
  out.push(["Review 2: Gutschrift zur letzten Rechnung beseitigt „zu viel verrechnet“ eines früheren Quartals; stornierte Zwischen-Rechnung → Nachverrechnung; Nachverrechnung zählt den tatsächlich verrechneten Betrag", () => {
    const hq = (jan) => ({ key: "haus-q", name: "Haus Q", src: "partner", basis: "arrival", billingStart: "2026-01-01", months: [pm({ month: "2026-01", provisionCents: jan }), pm({ month: "2026-04", provisionCents: 20000 }), pm({ month: "2026-07", provisionCents: 30000 })] });
    const rq = [["11", "2026-04-01", 100, "2026-01-01", "2026-03-31"], ["12", "2026-07-01", 200, "2026-04-01", "2026-06-30"], ["13", "2026-10-01", 300, "2026-07-01", "2026-09-30"]].map(x => ({ id: x[0], nr: "RE-" + x[0], date: x[1], gross: x[2], from: x[3], to: x[4], src: "partner" }));
    const runQ = (recsQ, invs, jan) => abgleichBuild({ year: "2026", today: "2026-10-28", sev: mkSev(invs), bill: { prices: {}, sites: {}, invoices: { "valuero:haus-q": recsQ } }, sitesSnap: null, valuero: { objects: [hq(jan)] }, valueroPrev: { objects: [hq(0)].map(o => Object.assign({}, o, { months: [] })) } }).items.find(x => x.key === "valuero:haus-q");
    const invQ = (o) => ["11", "12", "13"].map(id => I(Object.assign({ id, nr: "RE-" + id, gross: +({ 11: 100, 12: 200, 13: 300 })[id] }, (o || {})[id] || {})));
    let it = runQ(rq, invQ(), 6000); assert.strictEqual(it.refund, 40); assert.strictEqual(it.last.id, "13", "Gutschrift-Knopf geht zur letzten Rechnung");
    it = runQ(rq, invQ({ 13: { credited: 40 } }), 6000); assert.strictEqual(it.refund, 0, "Gutschrift zu RE-13 beseitigt das Q1-Zuviel"); assert.ok(!(it.notes || []).some(n => /bewusste Minderung/.test(n)), JSON.stringify(it.notes));
    const rqa = rq.concat([{ id: "14", nr: "RE-14", date: "2026-10-05", gross: 30, adj: true, parts: [{ from: "2026-07-01", to: "2026-09-30", gross: 30 }], src: "partner" }]);
    const hq2 = (jan) => Object.assign(hq(jan), { months: hq(jan).months.map(m => m.month === "2026-07" ? Object.assign({}, m, { provisionCents: 33000 }) : m) });
    it = abgleichBuild({ year: "2026", today: "2026-10-28", sev: mkSev(invQ().concat([I({ id: "14", nr: "RE-14", gross: 30, credited: 30 })])), bill: { prices: {}, sites: {}, invoices: { "valuero:haus-q": rqa } }, sitesSnap: null, valuero: { objects: [hq2(6000)] }, valueroPrev: { objects: [] } }).items.find(x => x.key === "valuero:haus-q");
    assert.strictEqual(it.refund, 10, "Gutschrift zur Nachverrechnung zählt"); assert.strictEqual(it.catchup, 0, "Gutschrift löst keine Nachverrechnung aus");
    // Q2 storniert, Q3 gültig → Q2 wieder zu verrechnen (als Nachverrechnung, Zeitraum der stornierten Rechnung)
    it = runQ(rq, invQ({ 12: { cancelled: true } }), 10000); assert.strictEqual(it.catchup, 200); assert.deepStrictEqual(it.catchupAction.after.billing.parts, [{ from: "2026-04-01", to: "2026-06-30", gross: 200 }]);
    assert.ok(/storniert/.test(it.catchupAction.items[0].text), it.catchupAction.items[0].text); assert.strictEqual(it.unbilled, 0);
    const rqn = rq.concat([{ id: "15", nr: "RE-15", date: "2026-10-20", gross: 200, adj: true, parts: [{ from: "2026-04-01", to: "2026-06-30", gross: 200 }], src: "partner" }]);
    it = runQ(rqn, invQ({ 12: { cancelled: true } }).concat([I({ id: "15", nr: "RE-15", gross: 200 })]), 10000); assert.strictEqual(it.catchup, 0, "nach der Nachverrechnung erledigt");
    // R3-12: bewusste Gutschrift (RE-11, 50) neben einer vorgeschlagenen Nachverrechnung (Q3 gestiegen) → kein widersprüchlicher Hinweis
    const hq3 = Object.assign(hq(10000), { months: hq(10000).months.map(m => m.month === "2026-07" ? Object.assign({}, m, { provisionCents: 33000 }) : m) });
    const runC = (h) => abgleichBuild({ year: "2026", today: "2026-10-28", sev: mkSev(invQ({ 11: { credited: 50 } })), bill: { prices: {}, sites: {}, invoices: { "valuero:haus-q": rq } }, sitesSnap: null, valuero: { objects: [h] }, valueroPrev: { objects: [] } }).items.find(x => x.key === "valuero:haus-q");
    it = runC(hq3); assert.strictEqual(it.catchup, 30); assert.ok(!(it.notes || []).some(n => /keine Nachverrechnung vorgeschlagen/.test(n)), JSON.stringify(it.notes));
    it = runC(hq(10000)); assert.strictEqual(it.catchup, 0); assert.ok(it.notes.some(n => /Gutschriften über 50,00 € .*bewusste Minderung/.test(n)), "ohne Nachverrechnung bleibt der Hinweis: " + JSON.stringify(it.notes));
    // vorgeschlagen 20, im Formular auf 10 geändert → 10 offen
    const rq7 = rq.concat([{ id: "16", nr: "RE-16", date: "2026-10-20", gross: 10, adj: true, parts: [{ from: "2026-07-01", to: "2026-09-30", gross: 20 }], src: "partner" }]);
    it = abgleichBuild({ year: "2026", today: "2026-10-28", sev: mkSev(invQ().concat([I({ id: "16", nr: "RE-16", gross: 10 })])), bill: { prices: {}, sites: {}, invoices: { "valuero:haus-q": rq7 } }, sitesSnap: null,
      valuero: { objects: [Object.assign(hq(10000), { months: hq(10000).months.map(m => m.month === "2026-07" ? Object.assign({}, m, { provisionCents: 32000 }) : m) })] }, valueroPrev: { objects: [] } }).items.find(x => x.key === "valuero:haus-q");
    assert.strictEqual(it.catchup, 10);
  }]);
  out.push(["A12: Altbestand ohne Quelle = Altquelle → Antonhaus kommt über die Plattform: gesperrt bis zur Bestätigung (Quelle und Freigabe auf einen Klick)", () => {
    const viaP = ahObj("2027", { src: "partner", billingLiveSince: "2026-12-01T10:00:00.000Z" });
    let it = va({ year: "2027", today: "2027-01-05", bill: billSw(), valuero: { objects: [viaP] }, valueroPrev: { objects: [ahObj("2026", { src: "partner" })] } }).find(x => x.key === "valuero:antonhaus");
    assert.ok(/Quelle gewechselt \(antonhaus → partner\)/.test(it.blocked || "") && /freigegeben/.test(it.blocked), it.blocked); assert.strictEqual(it.unbilled, 0);
    assert.deepStrictEqual([it.proposal.op, it.proposal.src, it.proposal.liveSince], ["vaack", "partner", "2026-12-01T10:00:00.000Z"]);
    const b2 = billSw(); b2.valuero.antonhaus.ackSrc = "partner"; b2.valuero.antonhaus.ackLive = "2026-12-01T10:00:00.000Z";
    it = va({ year: "2027", today: "2027-01-05", bill: b2, valuero: { objects: [viaP] }, valueroPrev: { objects: [ahObj("2026", { src: "partner" })] } }).find(x => x.key === "valuero:antonhaus");
    assert.ok(!it.blocked, it.blocked); assert.strictEqual(it.unbilled, 190.3);
    // RE-1272 storniert nach der Umstellung → Abzug stimmt nicht mehr → gesperrt
    it = va({ year: "2027", today: "2027-01-05", sev: mkSev([I({ id: "1272", nr: "RE-1272", gross: 475.41, cancelled: true })]), bill: billSw(), valuero: { objects: [ahObj("2027")] }, valueroPrev: { objects: [ahObj("2026")] } }).find(x => x.key === "valuero:antonhaus");
    assert.ok(/storniert/.test(it.blocked || ""), it.blocked); assert.strictEqual(it.unbilled, 0);
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
    T.billingOp({ op: "invoice", key: "valuero:haus-a", invoice: { id: "2", nr: "RE-2", gross: 5, adj: true, src: "x y", from: "2026-01-01", to: "2026-12-31", parts: [{ from: "2026-07-01", to: "2026-09-30", gross: "5.004" }, { from: "bad", to: "2026-09-30", gross: 1 }] } });
    const r = T.readBilling().invoices["valuero:haus-a"]; assert.strictEqual(r[0].src, "partner"); assert.strictEqual(r[0].basis, "arrival"); assert.strictEqual(r[1].adj, true); assert.strictEqual(r[1].src, undefined, "ungültige Quelle nicht gespeichert");
    assert.deepStrictEqual(r[1].parts, [{ from: "2026-07-01", to: "2026-09-30", gross: 5 }], "Teilzeiträume der Nachverrechnung (A1)"); assert.strictEqual(r[1].to, null, "Nachverrechnung verschiebt „verrechnet bis“ nie");
    T.billingOp({ op: "invoice", key: "valuero:haus-a", invoice: { id: "3", nr: "RE-3", gross: 10, adj: true, parts: [{ from: "2026-04-01", to: "2026-06-30", gross: 15 }, { from: "2026-07-01", to: "2026-09-30", gross: 5 }] } });
    assert.deepStrictEqual(T.readBilling().invoices["valuero:haus-a"][2].parts.map(p => p.gross), [7.5, 2.5], "Teilbeträge auf den tatsächlich verrechneten Betrag umgerechnet");
    T.billingOp({ op: "vaack", key: "haus-c", src: "partner", liveSince: "2026-12-01T10:00:00.000Z" }); assert.deepStrictEqual([T.readBilling().valuero["haus-c"].ackSrc, T.readBilling().valuero["haus-c"].ackLive], ["partner", "2026-12-01T10:00:00.000Z"]);
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
  const PAYOUT_FOOT_OLD = "Auszahlung der Onlinezahlungen, die ueber FS Creative eingegangen sind (Mollie direkt/WIMO), abzueglich kochdu-Gebuehr. Barzahlungen und mit kochdu-Guthaben bezahlte Bestellungen (eigene Monatsrechnung) und Mollie-Connect-Zahlungen (Geld direkt beim Lokal) sind hier nicht enthalten. Durchlaufende Posten 0% USt; kochdu-Gebuehr zzgl. 20% USt. Automatischer Entwurf.";
  const cns = [{ id: "901", objectName: "CreditNote", creditNoteNumber: "GU-901", status: "100", header: "Auszahlung Online-Zahlungen 09/2026", footText: PAYOUT_FOOT_OLD, sumGross: "-80", contact: { id: "21", objectName: "Contact" } },
    { id: "902", objectName: "CreditNote", creditNoteNumber: "GU-902", status: "100", header: "Auszahlung Online-Zahlungen 09/2026", footText: "Auszahlung Fremdgeld an das Lokal", sumGross: "-50", contact: { id: "21", objectName: "Contact" } }];
  const pos = [{ id: "8011", invoice: { id: "801", objectName: "Invoice" } }, { id: "8021", invoice: { id: "802", objectName: "Invoice" } }, { id: "9011", creditNote: { id: "901", objectName: "CreditNote" } }];
  const state = { inv, cns, pos, saved: [], calls: [], partnerQ: [], antonQ: [], antonMode: "arrival", partnerDown: false, nextNr: 990 };
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
        if (state.antonMode === "nocur") return send(200, { ok: true, basis: "arrival", provisionCents: months.reduce((a, m) => a + m.provisionCents, 0), months, transition: Object.assign({}, AH_TRANSITION, { byArrivalMonth: AH_TRANSITION.byArrivalMonth.map(m => ({ month: m.month, provisionCents: m.provisionCents, prebilledCents: m.prebilledCents })) }) });
        return send(200, { ok: true, basis: "arrival", ratesLabel: "5 % Website · 2 % Direkt", provisionCents: months.reduce((a, m) => a + m.provisionCents, 0), months, transition: AH_TRANSITION });
      }
      if (!u.pathname.startsWith("/api/v1")) return send(404, { error: "nope" });
      const p = u.pathname.replace(/^\/api\/v1/, ""), m = req.method; state.calls.push(m + " " + p);
      if (req.headers.authorization !== KEY) return send(401, { error: { message: "Authentication required" } });
      let mm;
      const listOf = { Invoice: inv, CreditNote: cns, InvoicePos: pos, CreditNotePos: pos };
      if (m === "GET" && (mm = p.match(/^\/(Invoice|CreditNote)\/(\d+)$/))) { const o = listOf[mm[1]].find(x => x.id === mm[2]); return o ? send(200, { objects: [o] }) : send(400, { error: { message: mm[1] + " nicht gefunden" } }); }
      if ((m === "PUT" || m === "POST") && (mm = p.match(/^\/(Invoice|CreditNote)\/(\d+)\/\w+$/)) && !listOf[mm[1]].some(x => x.id === mm[2])) return send(400, { error: { message: mm[1] + " nicht gefunden" } });
      if (m === "GET" && (mm = p.match(/^\/(Invoice|CreditNote|InvoicePos|CreditNotePos)$/))) { let l = listOf[mm[1]].slice(); q.forEach((v, k) => { if (/^(limit|offset|embed|countAll|depth)$/.test(k) || /\[objectName\]$/.test(k)) return; const km = k.match(/^(\w+)\[id\]$/); l = l.filter(o => km ? o[km[1]] && String(o[km[1]].id) === v : String(o[k]) === v); }); return send(200, { objects: l }); }
      if (m === "POST" && p === "/Invoice/Factory/saveInvoice") { state.saved.push(json); const o = Object.assign({ id: String(900 + (++n)), objectName: "Invoice", status: "100" }, json.invoice || {}); inv.push(o); return send(201, { objects: { invoice: o } }); }
      if (m === "POST" && p === "/CreditNote/Factory/saveCreditNote") { state.saved.push(json); const o = Object.assign({ id: String(950 + (++n)), objectName: "CreditNote", status: "100" }, json.creditNote || {}); cns.push(o); return send(201, { objects: { creditNote: o } }); }
      if (m === "GET" && p === "/SevUser") return send(200, { objects: [{ id: "1" }] });
      if (m === "GET" && p === "/Contact") return send(200, { objects: [] });
      if (m === "GET" && p === "/StaticCountry") return send(200, { objects: [{ id: "3", code: "at", name: "Österreich" }] });
      if (m === "GET" && p === "/Tools/bookkeepingSystemVersion") return send(200, { objects: { version: "2.0" } });
      if (m === "GET" && p === "/Invoice/Factory/getNextInvoiceNumber") { const v = "RE-" + state.nextNr; if (q.get("useNextNumber") === "true") state.nextNr++; return send(200, { objects: v }); }   // wie fin-local: reserviert nur mit useNextNumber=true
      if (m === "POST" || m === "PUT") { (state.posted = state.posted || []).push({ p, json }); return send(201, { objects: { id: "1" } }); }
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
    if (fs.realpathSync(path.dirname(T.BILLING_FILE)) === fs.realpathSync(udir)) { for (const [name, fn] of billingTests(T, udir)) await t(name, fn); }   // realpath: macOS /var → /private/var
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
  // Mollie-Abruf wie in Produktion (fin-mollie.js sync mit nachgestellter Mollie-API): Connect-Provisionen kommen als Saldo-Umsatz „application-fee“
  // ohne Beschreibung der Zahlung – im Text steht nur „Provision (Mollie Connect) tr_…“ (Review A7: Test mit dem echten Importtext)
  const mollieFetch = (btx) => { const json = o => ({ ok: true, status: 200, json: async () => o });
    return async (url) => { if (/organizations\/me/.test(url)) return json({ name: "FS Creative" }); if (/\/profiles/.test(url)) return json({ _embedded: { profiles: [] }, _links: {} });
      if (/\/balances\?/.test(url)) return json({ _embedded: { balances: [{ id: "bal_1", currency: "EUR", availableAmount: { value: "0" }, pendingAmount: { value: "0" } }] }, _links: {} });
      if (/\/balances\/bal_1\/transactions/.test(url)) return json({ _embedded: { balance_transactions: btx }, _links: {} });
      return { ok: false, status: 404, json: async () => ({ title: "Not Found" }) }; }; };
  const feeTx = (id, amount, date, ctx) => ({ id, type: "application-fee", resultAmount: { value: amount, currency: "EUR" }, initialAmount: { value: amount, currency: "EUR" }, context: ctx, createdAt: date + "T10:00:00+00:00" });
  await t("A7: Connect-Provisionen aus dem echten Mollie-Abruf – kochdu (Zahlung in der kochdu-Liste) → Sammelrechnung; ohne Erkennung „Plattform unklar“ ohne Einnahme-Beleg-Vorschlag; VALUERO nur bei positiver Erkennung", async () => {
    const seed = [["CheckAccount", { id: "2", name: "Mollie – kochdu", status: "100", type: "online", mollieBalance: "bal_1", mollieNamed: true }],
      ["Invoice", { id: "880", invoiceType: "RE", status: "100", header: "kochdu Online-Provisionen 10/2026 (Mollie Connect)", sumGross: "5.00", paidAmount: "0", invoiceDate: "2026-10-31T00:00:00+02:00", contact: { id: "1", objectName: "Contact" } }],
      ["InvoicePos", { id: "8801", invoice: { id: "880", objectName: "Invoice" }, name: "Online-Provisionen", quantity: "1", price: "4.17", priceGross: "5.00", grossPricing: true, taxRate: "20", positionNumber: "0" }]];
    const btx = [feeTx("baltr_f1", "5.00", "2026-10-05", { paymentId: "tr_Aa1xKoch" }), feeTx("baltr_f2", "7.50", "2026-10-06", { paymentId: "tr_Bb2yVal", payingOwner: { organizationId: "org_9", organizationName: "Haus Waldheim" } }),
      feeTx("baltr_f3", "3.20", "2026-10-07", { paymentId: "tr_Cc3zVal", description: "VALUERO Provision BK-123" })];
    const fin = memFin(seed), Lm = require(path.join(ROOT, "fin-local.js"))({ fin, renderPdf: async () => ({}), mailSend: async () => ({}) });
    const Pm = require(path.join(ROOT, "fin-proposals.js"))({ L: Lm, getMeta: fin.getMeta, setMeta: fin.setMeta, rules: () => null, autoPay: () => true, today: () => "2026-11-03", reportedPeriods: () => [] }); Lm.setProposer(Pm);
    const M = require(path.join(ROOT, "fin-mollie.js"))({ L: Lm, P: () => Pm, today: () => "2026-11-03", fetch: mollieFetch(btx), connectPayments: async () => [{ id: "tr_Aa1xKoch", at: "2026-10-04T10:00:00Z" }] });
    ["mollie-match", "mollie-fee", "mollie-payout", "mollie-income", "mollie-credit"].forEach(k => Pm.register(k, { exec: it => M.accept(k, it.payload) }));
    process.env.MOLLIE_ORG_TOKEN = "test_x"; try { await M.sync({ since: "2026-10-01" }); } finally { delete process.env.MOLLIE_ORG_TOKEN; }
    const tx = mid => Lm.all("CheckAccountTransaction").find(x => x.mollieId === mid);
    assert.ok(/^Provision \(Mollie Connect\)\s+tr_Bb2yVal$/.test(tx("baltr_f2").paymtPurpose), "echter Importtext: " + tx("baltr_f2").paymtPurpose);
    assert.strictEqual(String(tx("baltr_f1").status), "200", "kochdu → Sammelrechnung"); assert.strictEqual(+Lm.get("Invoice", "880").paidAmount, 5, "nur die kochdu-Provision auf der kochdu-Rechnung");
    assert.strictEqual(String(tx("baltr_f2").status), "100"); assert.strictEqual(String(tx("baltr_f3").status), "100", "VALUERO nie automatisch");
    const list = await Pm.list();
    assert.ok(!list.some(x => x.key === "minc:" + tx("baltr_f2").id), "ohne Erkennung kein Einnahme-Beleg-Vorschlag (sonst doppelter Erlös): " + JSON.stringify(list.map(x => x.key + " " + x.title)));
    const p3 = list.find(x => x.key === "minc:" + tx("baltr_f3").id); assert.ok(p3 && /VALUERO/.test(p3.title), "positiv erkannt (Beschreibung der Provision im Mollie-Kontext)");
    assert.ok(M.onlineNotices().some(n => /1 Connect-Provision \(7,50 €\) keiner Plattform zuzuordnen/.test(n) && /von Hand zuordnen/.test(n)), JSON.stringify(M.onlineNotices()));
    await Pm.accept(p3.id); const v = Lm.all("Voucher").find(x => x.fromMollie === String(tx("baltr_f3").id)); assert.ok(v && v.supplierName === "Mollie Connect (VALUERO)", JSON.stringify(v));
    const s0 = M.summary()[0]; assert.ok(s0.byProfile.some(b => b.name === "Connect (Plattform unklar)" && b.provisions === 7.5) && s0.byProfile.some(b => b.name === "kochdu" && b.provisions === 5), JSON.stringify(s0.byProfile));
  });
  await t("Mollie Connect: ohne kochdu-Liste keine Zuordnung nach Buchungsdatum (abwarten, Hinweis)", async () => {
    const seed = [["CheckAccount", { id: "2", name: "Mollie – kochdu", status: "100", type: "online" }],
      ["Invoice", { id: "880", invoiceType: "RE", status: "100", header: "kochdu Online-Provisionen 10/2026 (Mollie Connect)", sumGross: "5.00", paidAmount: "0", invoiceDate: "2026-10-31T00:00:00+02:00", contact: { id: "1", objectName: "Contact" } }],
      fee("1", 5.00, "2026-10-05", "Provision (Mollie Connect)  tr_Aa1x")];
    const { L, P, M } = finSetup(seed, async () => [], "2026-11-03");
    await L.load(); await M.autoVouchers();
    assert.strictEqual(String(L.get("CheckAccountTransaction", "1").status), "100"); assert.ok(!(await P.list()).length);
    assert.ok(M.onlineNotices().some(n => /keiner Plattform zuzuordnen.*kochdu-Liste nicht geladen/.test(n)), JSON.stringify(M.onlineNotices()));
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
    assert.deepStrictEqual(T.sevPosPrice({ priceGross: "347.55" }, 20), { price: 289.63, priceGross: 347.55, grossPricing: true }, "brutto eingegeben → Bruttopreis maßgeblich");
  });
  await t("A10: netto eingegebene Positionen bleiben netto-genau; abgeleitete Belege (wiederkehrend, Abschlag/Schluss) behalten den Bruttopreis; PDF-Einzelpreis passt zur Zeilensumme", async () => {
    const { L } = finSetup([], null, "2026-11-03"); await L.load();
    const save = async (pos) => (await L.request("POST", "/Invoice/Factory/saveInvoice", { body: { invoice: { header: "Rechnung", status: "100", invoiceType: "RE", contact: { id: "1", objectName: "Contact" } }, invoicePosSave: pos } })).objects.invoice;
    // Firmenposition netto angeboten: 7 × 10,04 netto → 70,28 netto (nicht 70,29); brutto eingegeben 7 × 12,05 → 84,35 brutto
    const pN = T.sevPosPrice({ priceGross: "12.05", priceNet: 10.04 }, 20); assert.deepStrictEqual(pN, { price: 10.04 });
    let inv = await save([Object.assign({ name: "Netto", quantity: 7, taxRate: 20 }, pN)]); assert.strictEqual(inv.sumNet, "70.28"); assert.strictEqual(inv.sumGross, "84.34");
    inv = await save([Object.assign({ name: "Brutto", quantity: 7, taxRate: 20 }, T.sevPosPrice({ priceGross: "12.05" }, 20))]); assert.strictEqual(inv.sumGross, "84.35");
    // wiederkehrende Rechnung aus einer Bruttopreis-Rechnung (3 × 10,00 brutto = 30,00)
    const src = await save([{ name: "Hosting", quantity: 3, price: 8.33, priceGross: 10, grossPricing: true, taxRate: 20 }]); assert.strictEqual(src.sumGross, "30.00");
    const w = (await L.request("POST", "/Fin/recurring", { body: { fromId: src.id, interval: "1M", start: "2026-11-01" } })).objects;
    const made = await L.recurringRun(w.id); assert.strictEqual(made[0].invoice.sumGross, "30.00", "nicht 29,99");
    // Angebot mit Bruttopreis 100,00 → 1. Abschlag 30 % = 30,00 brutto, Schlussrechnung 100,00 − 30,00 = 70,00 brutto
    const od = (await L.request("POST", "/Order/Factory/saveOrder", { body: { order: { header: "Angebot", status: "100", orderType: "AN", contact: { id: "1", objectName: "Contact" } }, orderPosSave: [{ name: "Website", quantity: 1, price: 83.33, priceGross: 100, grossPricing: true, taxRate: 20 }] } })).objects.order;
    const ar = (await L.request("POST", "/Fin/partialFromOrder", { body: { orderId: od.id, percent: 30 } })).objects; assert.strictEqual(ar.sumGross, "30.00");
    await L.request("PUT", "/Invoice/" + ar.id + "/sendBy", { body: { sendType: "VPDF" } }); const arI = L.get("Invoice", ar.id); arI.status = "1000"; arI.paidAmount = arI.sumGross; await L.save("Invoice", arI);
    const er = (await L.request("POST", "/Fin/finalFromOrder", { body: { orderId: od.id } })).objects; assert.strictEqual(er.sumGross, "70.00");
    // PDF: 3 × 10,00 brutto, netto angezeigt → Einzelpreis 8,3333 (3 × 8,33 = 24,99 ≠ 25,00); passt der Cent-Wert, bleibt alles wie bisher
    const PDF = require(path.join(ROOT, "fin-pdf.js"));
    assert.deepStrictEqual(PDF.unitOf({ quantity: "3", price: "8.33", priceGross: "10.00", grossPricing: true, taxRate: "20", sumNet: "25.00", sumGross: "30.00" }, true), { unit: 8.3333, sum: 25, cents: false });
    assert.deepStrictEqual(PDF.unitOf({ quantity: "1", price: "25.00", priceGross: "30.00", taxRate: "20", sumNet: "25.00", sumGross: "30.00" }, true), { unit: 25, sum: 25, cents: true });
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

  await t("R3-4: Plattform-Token legt Kontakt/Adresse/Kommunikationsweg nur neu an – mitgeschickte ID bzw. Kundennummer wird verworfen (kein Überschreiben, keine Mail-Umleitung)", async () => {
    const K = "fin-kochdu-1", Bz = "fin-blitz-1", Ka = "fin-kant-1"; M.state.posted = [];
    let r = await fa(K, "POST", "/Contact", { id: "21", name: "Übernahme", customerNumber: "1001", category: { id: 3, objectName: "Category" } }); assert.strictEqual(r.status, 200);
    r = await fa(Bz, "POST", "/CommunicationWay", { id: "77", contact: { id: "21", objectName: "Contact" }, type: "EMAIL", value: "fremd@example.org", key: { id: 1, objectName: "CommunicationWayKey" }, main: true }); assert.strictEqual(r.status, 200);
    r = await fa(Bz, "POST", "/ContactAddress", { id: "55", contact: { id: "21", objectName: "Contact" }, street: "Weg 1" }); assert.strictEqual(r.status, 200);
    r = await fa(Ka, "POST", "/Contact", { id: "21", name: "SV", finApiWho: "kochdu" }); assert.strictEqual(r.status, 200);
    const got = M.state.posted.map(x => x.json);
    assert.strictEqual(got.length, 4); got.forEach(b => { assert.ok(!("id" in b) && !("customerNumber" in b) && !("finApiWho" in b), JSON.stringify(b)); });
    assert.strictEqual(got[1].contact.id, "21", "Verweis auf den eigenen Kontakt bleibt"); assert.strictEqual(got[1].value, "fremd@example.org");
    // wie die Plattformen es heute schicken (ohne ID) – unverändert
    r = await fa(K, "POST", "/Contact/21/addAddress", { street: "Gasse 1", zip: "6780", city: "Schruns" }); assert.strictEqual(r.status, 200); assert.deepStrictEqual(M.state.posted.slice(-1)[0].json, { street: "Gasse 1", zip: "6780", city: "Schruns" });
    assert.ok(/Feld „id“ verworfen/.test(srvOut), "protokolliert");
  });
  await t("R3-9: Blitzdings-Nummer nur im Format des Nummernkreises, nicht weit darunter, höchstens die nächste freie (auch ohne Nummernkreis); Beleg-IDs nur Ziffern", async () => {
    const K = "fin-kochdu-1", Bz = "fin-blitz-1";
    const bz = (nr) => fa(Bz, "POST", "/Invoice/Factory/saveInvoice", { invoice: { header: "Rechnung " + nr, invoiceNumber: nr, status: 200, invoiceType: "RE", reference: "BD-3001", headText: "Buchung BD-3001 – vielen Dank für Ihre Buchung bei Blitzdings." }, invoicePosSave: [] });
    const before = M.state.saved.length;
    assert.strictEqual((await bz("XY-99999")).status, 403, "fremdes Präfix"); assert.strictEqual((await bz("RE-17")).status, 403, "weit unter der nächsten freien");
    assert.strictEqual((await bz("RE-" + (M.state.nextNr + 1))).status, 403, "über der nächsten freien");
    assert.strictEqual((await fa(Bz, "POST", "/Invoice/Factory/saveInvoice", { invoice: { id: "803x", header: "x", status: "100" }, invoicePosSave: [] })).status, 403, "ID mit Buchstaben nie gekürzt");
    assert.strictEqual((await fa(K, "POST", "/CreditNote/Factory/saveCreditNote", { creditNote: { header: "x", status: "100", refSrcInvoice: { id: "801x", objectName: "Invoice" } }, creditNotePosSave: [] })).status, 403, "Bezug mit ungültiger ID");
    assert.strictEqual(M.state.saved.length, before, "nichts erreichte die Buchhaltung");
    // ohne Nummernkreis liefert die Buchhaltung beim Reservieren dieselbe Nummer wie beim Nachsehen → gleich der nächsten freien: erlaubt
    const peek = (await fa(Bz, "GET", "/Invoice/Factory/getNextInvoiceNumber?invoiceType=RE&useNextNumber=false")).j.objects;
    let r = await bz(peek); assert.strictEqual(r.status, 200, "Nummer = nächste freie: " + JSON.stringify(r.j)); M.state.nextNr++;   // (Buchhaltung ohne Nummernkreis: höchste Nummer + 1)
    // normal: reserviert, danach weitere Rechnungen angelegt → reservierte Nummer liegt knapp unter der nächsten freien: erlaubt
    const res = (await fa(Bz, "GET", "/Invoice/Factory/getNextInvoiceNumber?invoiceType=RE&useNextNumber=true")).j.objects; M.state.nextNr += 3;
    r = await bz(res); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
  });
  await t("A5/A6/A11: gelöschter Beleg → 400 „<Typ> nicht gefunden“ (nicht 403); Positionen/Status/Nummer/Zahlung/Gutschrift nur eigene; alte Auszahlungs-Gutschrift erkannt", async () => {
    const K = "fin-kochdu-1", Bz = "fin-blitz-1", Ka = "fin-kant-1";
    let r = await fa(K, "GET", "/Invoice/999"); assert.strictEqual(r.status, 400); assert.strictEqual(r.j.error.message, "Invoice nicht gefunden");
    r = await fa(K, "GET", "/CreditNote/998"); assert.strictEqual(r.status, 400); assert.strictEqual(r.j.error.message, "CreditNote nicht gefunden");
    r = await fa(K, "PUT", "/Invoice/999/sendBy", { sendType: "VPDF" }); assert.strictEqual(r.status, 400); assert.ok(/nicht gefunden/.test(r.j.error.message));
    assert.strictEqual((await fa(Ka, "GET", "/Invoice/997")).status, 400, "Kantineur ebenso");
    // A6: fremde Positionen, Status, Nummer, Zahlung, Gutschrift zu fremder Rechnung
    const nb = (extra) => Object.assign({ invoice: { header: "kochdu-Gebühr Barzahlungen 11/2026", status: "100", invoiceNumber: null, contact: { id: "21", objectName: "Contact" } }, invoicePosSave: [], invoicePosDelete: null }, extra || {});
    const before = M.state.saved.length;
    assert.strictEqual((await fa(K, "POST", "/Invoice/Factory/saveInvoice", nb({ invoicePosDelete: [{ id: "8021" }] }))).status, 403, "Position der fremden RE-802 löschen");
    assert.strictEqual((await fa(K, "POST", "/Invoice/Factory/saveInvoice", nb({ invoicePosSave: [{ id: "8021", price: "1.00", quantity: 1, taxRate: 20 }] }))).status, 403, "fremde Position umhängen");
    assert.strictEqual((await fa(K, "POST", "/Invoice/Factory/saveInvoice", { invoice: { header: "x", status: "1000", contact: { id: "21", objectName: "Contact" } }, invoicePosSave: [] })).status, 403, "Status bezahlt");
    assert.strictEqual((await fa(K, "POST", "/Invoice/Factory/saveInvoice", { invoice: { header: "x", status: "100", paidAmount: "500" }, invoicePosSave: [] })).status, 403, "paidAmount");
    assert.strictEqual((await fa(K, "POST", "/Invoice/Factory/saveInvoice", { invoice: { header: "x", status: "100", invoiceNumber: "RE-802" }, invoicePosSave: [] })).status, 403, "fremde Rechnungsnummer");
    assert.strictEqual((await fa(K, "POST", "/CreditNote/Factory/saveCreditNote", { creditNote: { header: "x", status: "200", refSrcInvoice: { id: "802", objectName: "Invoice" } }, creditNotePosSave: [] })).status, 403, "Gutschrift zu fremder Rechnung");
    assert.strictEqual((await fa(K, "POST", "/CreditNote/Factory/saveCreditNote", { creditNote: { header: "x", status: "100", refSrcInvoice: { id: "802", objectName: "Invoice" } }, creditNotePosSave: [] })).status, 403, "auch als Entwurf");
    assert.strictEqual((await fa(K, "POST", "/CreditNote/Factory/saveCreditNote", { creditNote: { id: "902", header: "x", status: "100" }, creditNotePosSave: [] })).status, 403, "fremder Gutschrift-Entwurf (gleicher Kopf, anderer Fußtext)");
    assert.strictEqual(M.state.saved.length, before, "nichts davon erreichte die Buchhaltung");
    // eigener Entwurf: eigene Position überarbeiten erlaubt, festgeschriebene/offene eigene Rechnung nicht
    assert.strictEqual((await fa(K, "POST", "/Invoice/Factory/saveInvoice", { invoice: { id: "801", header: "kochdu-Gebühr Barzahlungen 10/2026", status: "100" }, invoicePosSave: [{ id: "8011", price: "2.00", quantity: 1, taxRate: 20 }], invoicePosDelete: null })).status, 200);
    // R4-6: eigenen Entwurf nicht an eine andere Plattform übergeben – finApiSource/finApiWho setzt der Server
    assert.strictEqual((await fa(K, "POST", "/Invoice/Factory/saveInvoice", { invoice: { id: "801", header: "kochdu-Gebühr Barzahlungen 10/2026", status: "100", finApiSource: "kantineur", finApiWho: "kantineur" }, invoicePosSave: [] })).status, 200);
    assert.strictEqual(M.state.saved.slice(-1)[0].invoice.finApiSource, "kochdu"); assert.ok(!("finApiWho" in M.state.saved.slice(-1)[0].invoice));
    assert.strictEqual((await fa(K, "POST", "/CreditNote/Factory/saveCreditNote", { creditNote: { header: "Auszahlung", finApiSource: "blitzdings" }, creditNotePosSave: [] })).status, 200);
    assert.strictEqual(M.state.saved.slice(-1)[0].creditNote.finApiSource, "kochdu", "neue Gutschrift: mitgeschicktes finApiSource überschrieben");
    assert.strictEqual((await fa(Bz, "POST", "/Invoice/Factory/saveInvoice", { invoice: { id: "803", header: "x", status: "200" }, invoicePosSave: [] })).status, 403, "offene (nicht Entwurf) eigene Rechnung");
    // Blitzdings: neue Rechnung „offen“ mit eigener Nummer aus getNextInvoiceNumber erlaubt, vergebene Nummer nicht
    assert.strictEqual((await fa(Bz, "POST", "/Invoice/Factory/saveInvoice", { invoice: { header: "Rechnung RE-803", invoiceNumber: "RE-803", status: 200, reference: "BD-1002", headText: "Buchung BD-1002 – vielen Dank" }, invoicePosSave: [] })).status, 403);
    assert.strictEqual((await fa(Bz, "POST", "/Invoice/Factory/saveInvoice", { invoice: { header: "Rechnung RE-9999", invoiceNumber: "RE-9999", status: 200, reference: "BD-1002" }, invoicePosSave: [] })).status, 403, "Nummer weit über der nächsten freien (Lücke)");
    assert.strictEqual((await fa(K, "POST", "/Invoice/Factory/saveInvoice", { invoice: { header: "x", status: "200", contact: { id: "21", objectName: "Contact" } }, invoicePosSave: [] })).status, 403, "offen anlegen nur Blitzdings");
    assert.strictEqual((await fa(K, "POST", "/Invoice/Factory/saveInvoice", { invoice: { header: "x", status: "100", invoiceNumber: "RE-777" }, invoicePosSave: [] })).status, 403, "eigene Nummer nur Blitzdings");
    assert.strictEqual((await fa(Ka, "POST", "/Invoice/Factory/saveInvoice", { invoice: { header: "x", status: 100, invoiceType: "SR", origin: { id: "802", objectName: "Invoice" } }, invoicePosSave: [] })).status, 403, "Stornorechnung zu fremder Rechnung");
    assert.strictEqual((await fa(K, "POST", "/Invoice/Factory/saveInvoice", { invoice: { header: "x", status: "100", origin: { id: "802", objectName: "Invoice" } }, invoicePosSave: [] })).status, 403, "Bezug auf fremde Rechnung");
    // A11: alte Auszahlungs-Gutschrift (Kopf + Fußtext von fs-order) gehört kochdu, die von Hand angelegte mit gleichem Kopf nicht
    assert.strictEqual((await fa(K, "GET", "/CreditNote/901")).status, 200); assert.strictEqual((await fa(K, "GET", "/CreditNote/902")).status, 403);
    r = await fa(K, "GET", "/CreditNote?contact[id]=21&contact[objectName]=Contact&limit=100"); assert.strictEqual(r.status, 200);
    assert.ok(r.j.objects.some(o => o.id === "901") && !r.j.objects.some(o => o.id === "902"), "findDocs findet die alte Auszahlungs-Gutschrift → kein zweiter Entwurf");
  });
  await t("Laufende Rechnungsläufe (alte UND neue Plattform-Version) werden von der Freigabeliste nicht blockiert: kochdu 01.11., Kantineur 05.11., Blitzdings laufend", async () => {
    const K = "fin-kochdu-1", Bz = "fin-blitz-1", Ka = "fin-kant-1", ok = (r, what) => assert.ok(r.status === 200, what + ": " + r.status + " " + JSON.stringify(r.j));
    const pos = (g) => ({ objectName: "InvoicePos", mapAll: "true", quantity: 1, price: Math.round(g / 1.2 * 100) / 100, name: "Gebühr", text: "", taxRate: 20, unity: { id: "1", objectName: "Unity" }, priceGross: g, grossPricing: true });
    const kInv = (extra) => Object.assign({ objectName: "Invoice", invoiceNumber: null, contact: { id: "21", objectName: "Contact" }, contactPerson: { id: "1", objectName: "SevUser" }, invoiceDate: "01.11.2026", header: "kochdu-Gebühr Barzahlungen 10/2026", headText: "", footText: "", discount: 0, status: "100", smallSettlement: "0", taxRate: 0, taxText: "Umsatzsteuer", taxType: "default", invoiceType: "RE", currency: "EUR", showNet: "1", mapAll: "true", timeToPay: 14 }, extra || {});
    // kochdu NEU (fs-order audit-fixes): Rechnung mit platformRef + Idempotency-Key, fertigstellen, mailen, Status lesen, wiederfinden; Auszahlung als Rechnung mit negativer Summe
    let r = await fetch(base + "/fin-api/v1/Invoice/Factory/saveInvoice", { method: "POST", headers: { authorization: K, "content-type": "application/json", "idempotency-key": "kochdu:2026-10:cash:7", "x-forwarded-for": "203.0.113.201" }, body: JSON.stringify({ invoice: kInv({ platformRef: "kochdu:2026-10:cash:7", address: "La Taverna\nGasse 1\n6780 Schruns", addressCountry: { id: "3", objectName: "StaticCountry" } }), invoicePosSave: [pos(42.1)], invoicePosDelete: null, discountSave: null, discountDelete: null }) });
    const jr = await r.json(); assert.strictEqual(r.status, 200, JSON.stringify(jr)); const kid = jr.objects.invoice.id;
    ok(await fa(K, "PUT", "/Invoice/" + kid + "/sendBy", { sendType: "VPDF", sendDraft: false }), "kochdu sendBy"); ok(await fa(K, "POST", "/Invoice/" + kid + "/sendViaEmail", { toEmail: "lokal@test.at", subject: "x", text: "y" }), "kochdu sendViaEmail");
    ok(await fa(K, "GET", "/Invoice/" + kid), "kochdu Status"); ok(await fa(K, "GET", "/Invoice?platformRef=kochdu%3A2026-10%3Acash%3A7&limit=50"), "kochdu findDocs");
    ok(await fa(K, "POST", "/Invoice/Factory/saveInvoice", { invoice: kInv({ header: "Auszahlung Online-Zahlungen 10/2026", platformRef: "kochdu:2026-10:payout:7" }), invoicePosSave: [pos(4.5), Object.assign(pos(-100), { taxRate: 0, priceGross: -100, price: -100 })], invoicePosDelete: null }), "kochdu Auszahlung (negativ)");
    ok(await fa(K, "POST", "/ContactAddress", { contact: { id: "21", objectName: "Contact" }, street: "Gasse 1", zip: "6780", city: "Schruns", country: { id: "3", objectName: "StaticCountry" } }), "kochdu ContactAddress");
    // kochdu ALT (origin/main): Rechnung ohne platformRef, Auszahlungs-Gutschrift, addAddress (Formular)
    ok(await fa(K, "POST", "/Invoice/Factory/saveInvoice", { invoice: kInv({ header: "kochdu-Gebühr Barzahlungen 10/2026" }), invoicePosSave: [pos(12)], invoicePosDelete: null, discountSave: null, discountDelete: null }), "kochdu alt Rechnung");
    ok(await fa(K, "POST", "/CreditNote/Factory/saveCreditNote", { creditNote: { objectName: "CreditNote", creditNoteNumber: null, contact: { id: "21", objectName: "Contact" }, contactPerson: { id: "1", objectName: "SevUser" }, creditNoteDate: "01.11.2026", header: "Auszahlung Online-Zahlungen 10/2026", headText: "", footText: "x Automatischer Entwurf.", status: "100", smallSettlement: "0", taxRate: 0, taxText: "Umsatzsteuer", taxType: "default", creditNoteType: "CN", bookingCategory: "UNDERACHIEVEMENT", currency: "EUR", showNet: "1", mapAll: "true" }, creditNotePosSave: [pos(80)], creditNotePosDelete: null }), "kochdu alt Auszahlungs-Gutschrift");
    // Kantineur NEU und ALT: Rechnung (Entwurf, Notiz „Mollie tr_…“), Versand, Lesen, Suche
    const kaInv = { objectName: "Invoice", mapAll: true, invoiceType: "RE", status: 100, invoiceDate: "05.11.2026", deliveryDate: "05.11.2026", contact: { id: "21", objectName: "Contact" }, contactPerson: { id: "1", objectName: "SevUser" }, address: "SV\nWeg 1", currency: "EUR", discount: 0, taxRate: 20, taxText: "Umsatzsteuer 20 %", taxType: "default", smallSettlement: false, showNet: false, timeToPay: 0, headText: "Vielen Dank für die Nutzung von Der Kantineur.", customerInternalNote: "Mollie tr_run0501" };
    r = await fetch(base + "/fin-api/v1/Invoice/Factory/saveInvoice", { method: "POST", headers: { authorization: Ka, "content-type": "application/json", "idempotency-key": "kantineur-tr_run0501", "x-forwarded-for": "203.0.113.202" }, body: JSON.stringify({ invoice: Object.assign({}, kaInv, { deliveryDateUntil: "04.12.2026" }), invoicePosSave: [Object.assign(pos(9.69), { positionNumber: 0 })], invoicePosDelete: null, discountSave: null, discountDelete: null, takeDefaultAddress: false }) });
    const jk = await r.json(); assert.strictEqual(r.status, 200, JSON.stringify(jk)); const kaid = jk.objects.invoice.id;
    ok(await fa(Ka, "POST", "/Invoice/" + kaid + "/sendViaEmail", { toEmail: "verein@test.at", subject: "x", text: "y" }), "Kantineur Versand"); ok(await fa(Ka, "GET", "/Invoice/" + kaid), "Kantineur lesen");
    ok(await fa(Ka, "GET", "/Invoice?customerInternalNote=" + encodeURIComponent("Mollie tr_run0501") + "&invoiceType=RE&limit=50"), "Kantineur Suche");
    ok(await fa(Ka, "POST", "/Invoice/Factory/saveInvoice", { invoice: Object.assign({}, kaInv, { customerInternalNote: "Mollie tr_run0502" }), invoicePosSave: [{ objectName: "InvoicePos", mapAll: true, quantity: 1, price: 9, name: "Abo", text: "", taxRate: 20, unity: { id: 1, objectName: "Unity" }, positionNumber: 0 }], invoicePosDelete: null, discountSave: null, discountDelete: null, takeDefaultAddress: false }), "Kantineur alt");
    for (const [m, p0] of [["GET", "/Tools/bookkeepingSystemVersion"], ["GET", "/SevUser"], ["GET", "/Contact/21"]]) ok(await fa(Ka, m, p0), "Kantineur " + p0);
    ok(await fa(Ka, "POST", "/Contact", { name: "SV Neu", category: { id: 3, objectName: "Category" }, status: 1000 }), "Kantineur Kontakt");
    // Blitzdings (alt = neu): Nummer holen, Rechnung „offen“ mit dieser Nummer, festschreiben, mailen
    r = await fa(Bz, "GET", "/Invoice/Factory/getNextInvoiceNumber?invoiceType=RE&useNextNumber=true"); ok(r, "Blitzdings Nummer"); const nr = r.j.objects;
    r = await fa(Bz, "POST", "/Invoice/Factory/saveInvoice", { invoice: { objectName: "Invoice", invoiceNumber: nr, contact: { id: "21", objectName: "Contact" }, contactPerson: { id: "1", objectName: "SevUser" }, invoiceDate: "2026-11-02", deliveryDate: "2026-11-10", header: "Rechnung " + nr, headText: "Buchung BD-RUN001 – vielen Dank für Ihre Buchung bei Blitzdings.", footText: "Zahlbar", timeToPay: 14, discount: 0, address: "Kunde", status: 200, smallSettlement: 0, taxRate: 20, taxText: "Umsatzsteuer 20%", taxType: "default", invoiceType: "RE", reference: "BD-RUN001", currency: "EUR", showNet: "1", mapAll: "true" }, invoicePosSave: [pos(399)], invoicePosDelete: null, filename: null, discountSave: null, discountDelete: null });
    ok(r, "Blitzdings Rechnung"); const bid = r.j.objects.invoice.id;
    ok(await fa(Bz, "PUT", "/Invoice/" + bid + "/enshrine"), "Blitzdings festschreiben"); ok(await fa(Bz, "POST", "/Invoice/" + bid + "/sendViaEmail", { toEmail: "k@test.at", subject: "x", text: "y", copy: false }), "Blitzdings mailen");
    for (const [m, p0] of [["GET", "/SevUser"], ["GET", "/Contact?depth=0&limit=2000"], ["POST", "/Contact"], ["POST", "/ContactAddress"], ["POST", "/CommunicationWay"]]) ok(await fa(Bz, m, p0, m === "POST" ? { name: "x" } : undefined), "Blitzdings " + p0);
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
    M.state.antonMode = "nocur"; const r3 = await api("/admin/api/billing", { op: "vaswitch", key: "antonhaus" });   // R3-11: ohne Gebühren nach heutiger Regel → abgelehnt
    assert.strictEqual(r3.j.ok, false, JSON.stringify(r3.j)); assert.ok(/nach heutiger Regel/.test(r3.j.error || ""), JSON.stringify(r3.j));
    assert.deepStrictEqual((await api("/admin/api/billing")).j.valuero.antonhaus.switch.prebilledByMonth, sw.prebilledByMonth, "bestätigte Umstellung bleibt unverändert"); M.state.antonMode = "arrival";
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
