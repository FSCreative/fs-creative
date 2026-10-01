/* Steuer-Rechenkern: Prüfung gegen handgerechnete Kennzahlen (UStG/EStG, Formulare U30 2026, E1a/E2 2025).
   Aufruf: node test/steuer.test.js   (keine Abhängigkeiten; XML-Prüfung mit xmllint, falls vorhanden)
   Die Rohdaten haben die Form, die server.js steuerRaw() liefert (invoices/vouchers/creditNotes mit lines[]).
   Erwartungswerte sind aus dem Gesetz bzw. den Formularen gerechnet, nicht aus dem Code übernommen. */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
const S = require("../admin-cockpit/steuer-calc.js");

let pass = 0, fail = 0; const fails = [];
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.message || e)); } }
const near = (a, b, msg, eps) => assert.ok(Math.abs((+a || 0) - b) <= (eps || 0.005), (msg || "") + ": ist " + a + ", erwartet " + b);
const kz = (r, z, f) => ((r.K[z] || {})[f || "base"]) || 0;

// ---------- Bausteine (Form wie steuerRaw) ----------
let n = 0;
function inv(o) {
  const net = o.net, tax = o.tax == null ? Math.round(net * 20) / 100 : o.tax;
  return Object.assign({ id: "i" + (++n), nr: "RE-" + n, type: "RE", status: 200, date: "2026-07-01", delivery: null, payDate: null, taxType: "default", taxRule: "1", contact: "Kunde " + n, uid: "", country: "AT",
    net, tax, gross: Math.round((net + tax) * 100) / 100, paid: 0, enshrined: false, pays: undefined, lines: [{ rate: o.rate == null ? 20 : o.rate, net, tax, cat: "", catId: "", catType: "" }] }, o);
}
function vou(o) {
  const net = o.net, tax = o.tax || 0;
  return Object.assign({ id: "v" + (++n), date: "2026-07-01", delivery: null, payDate: null, status: 100, cd: "C", taxType: "default", taxRule: "9", supplier: "Lieferant " + n, supplierUid: "", supplierCountry: "AT", desc: "", net, tax, gross: Math.round((net + tax) * 100) / 100, paid: 0, enshrined: false, pays: undefined,
    lines: [{ rate: o.rate == null ? (net ? Math.round(tax / net * 1000) / 10 : 0) : o.rate, net, tax, cat: o.cat || "Software", catId: "", catType: o.catType || "" }] }, o);
}
const st0 = () => ({ docs: {}, uvaManual: {}, mapping: {}, jabInput: {}, uva: {}, trips: {}, settings: {} });
const Q = (y, q) => ({ key: y + "-Q" + q, from: y + "-" + String(q * 3 - 2).padStart(2, "0") + "-01", to: y + "-" + String(q * 3).padStart(2, "0") + "-" + (q === 1 || q === 4 ? "31" : "30") });

/* ===================== (a)–(d) UVA Q3 2026 ===================== */
const I = {
  at20: inv({ net: 1000, tax: 200, date: "2026-07-10", delivery: "2026-07-05" }),
  multi: inv({ net: 800, tax: 133, date: "2026-08-01", delivery: "2026-08-01", lines: [{ rate: 20, net: 500, tax: 100 }, { rate: 10, net: 200, tax: 20 }, { rate: 13, net: 100, tax: 13 }] }),
  brutto: inv({ net: 100, tax: 20, date: "2026-08-05", lines: [{ rate: 20, net: 83.33, tax: 16.67 }, { rate: 20, net: 16.75, tax: 3.35 }] }),   // Bruttorechnung: Positionen aus Bruttopreisen mit Rundungsdifferenz → Kopf maßgeblich
  q2: inv({ net: 300, tax: 60, date: "2026-06-15", delivery: "2026-06-10" }),
  srNeg: inv({ type: "SR", net: -300, tax: -60, date: "2026-08-20", lines: [{ rate: 20, net: -300, tax: -60 }] }),   // sevDesk liefert Storno negativ
  srPos: inv({ type: "SR", net: 50, tax: 10, date: "2026-09-01" }),                                                 // Storno mit positiver Summe
  ar: inv({ type: "AR", net: 2000, tax: 400, date: "2026-06-20", status: 1000, paid: 2400, payDate: "2026-07-15" }),  // Anzahlung: Zufluss Q3
  wkr: inv({ type: "WKR", net: 999, tax: 199.8, date: "2026-07-01" }),
  draft: inv({ status: 100, net: 777, tax: 155.4, date: "2026-07-02" }),
  q4: inv({ net: 1500, tax: 300, date: "2026-10-02", delivery: "2026-09-30" }),   // § 19 Abs 2 Z 1 lit a: Rechnung im Folgemonat → Okt.
  lateJ: inv({ net: 400, tax: 80, date: "2026-07-03", delivery: "2026-06-30" }),   // Leistung Juni, Rechnung Juli → Juli (Q3)
  lateMax: inv({ net: 250, tax: 50, date: "2026-08-01", delivery: "2026-05-15" }), // höchstens ein Monat Verschiebung → Juni (Q2)
  skonto: inv({ net: 1000, tax: 200, date: "2026-07-01", delivery: "2026-07-01", status: 1000, paid: 1176, payDate: "2026-07-20" }),
  teil: inv({ net: 500, tax: 100, date: "2026-09-10", delivery: "2026-09-10", status: 750, paid: 300, payDate: "2026-09-20" }),
  euB2B: inv({ net: 3000, tax: 0, rate: 0, taxRule: "17", uid: "DE123456789", country: "DE", date: "2026-08-12", delivery: "2026-08-10" }),
  euB2Bfr: inv({ net: 200, tax: 0, rate: 0, taxRule: "1", uid: "FR12345678901", country: "FR", date: "2026-07-20", delivery: "2026-07-20" }),
  euLate: inv({ net: 700, tax: 0, rate: 0, taxRule: "17", uid: "DE123456789", country: "DE", date: "2026-10-02", delivery: "2026-09-30" }),  // ZM: Monat der Leistung (Q3)
  ch: inv({ net: 800, tax: 0, rate: 0, taxRule: "17", country: "CH", date: "2026-08-01", delivery: "2026-08-01" }),
};
const V = {
  at: vou({ net: 500, tax: 100, date: "2026-07-05", supplier: "A1 Telekom Austria AG" }),
  atPaid: vou({ net: 50, tax: 10, date: "2026-09-29", status: 1000, paid: 60, payDate: "2026-10-03", supplier: "Bürobedarf GmbH" }),
  atQ4: vou({ net: 70, tax: 14, date: "2026-10-01", delivery: "2026-09-20", supplier: "Bürobedarf GmbH" }),   // Beleg erst im Oktober → VSt Q4
  de19: vou({ net: 100, tax: 19, date: "2026-08-01", supplier: "Druckerei Muster GmbH", supplierUid: "DE987654321", supplierCountry: "DE" }),
  google: vou({ net: 300, taxRule: "14", date: "2026-07-31", supplier: "Google Ireland Ltd", cat: "Werbung" }),
  railway: vou({ net: 20.5, taxRule: "9", date: "2026-08-02", supplier: "Railway Corporation", supplierCountry: "" }),   // Heuristik (Name)
  anthropic: vou({ net: 100, taxRule: "12", date: "2026-09-01", supplier: "Anthropic, PBC" }),
  hetzner: vou({ net: 40, taxRule: "9", date: "2026-09-05", supplier: "Hetzner Online GmbH", supplierUid: "DE812871812" }),   // Heuristik (UID)
  cfNv: vou({ net: 10, taxRule: "13", date: "2026-09-06", supplier: "Cloudflare, Inc." }),
  meta: vou({ net: 100, taxRule: "14", date: "2026-10-02", delivery: "2026-09-30", supplier: "Meta Platforms Ireland Ltd" }),  // RC: Monat der Leistung
  ige: vou({ net: 1000, rate: 0, taxRule: "8", date: "2026-08-15", supplier: "Papier GmbH", supplierUid: "DE111111111", cat: "Wareneinkauf" }),
  nv: vou({ net: 200, tax: 40, taxRule: "10", date: "2026-08-20", supplier: "Autohaus Bludenz", cat: "Kfz" }),
  privat: vou({ net: 500, date: "2026-07-07", cat: "Privatentnahme" }),
  fa: vou({ net: 951, date: "2026-08-14", supplier: "Finanzamt Österreich", cat: "Umsatzsteuer-Vorauszahlung", catType: "VATPAY" }),
  svs: vou({ net: 1200, date: "2026-08-28", supplier: "SVS", cat: "Sozialversicherung" }),
  rv: vou({ net: 99, tax: 19.8, date: "2026-07-01", type: "RV" }),   // Vorlage wiederkehrender Beleg
  vDraft: vou({ net: 88, tax: 17.6, date: "2026-07-01", status: 50 }),
};
const GU = { id: "cn1", sevId: "1", nr: "GU-1", type: "GU", status: 200, date: "2026-09-15", delivery: null, taxType: "default", taxRule: "1", contact: "Kunde X", uid: "", net: 100, tax: 20, gross: 120, lines: [{ rate: 20, net: 100, tax: 20 }] };
const RAW = { invoices: Object.values(I), vouchers: Object.values(V), creditNotes: [GU], taxRules: [] };
const st = st0();
const r = S.computeUva(RAW, st, Q(2026, 3));

/* Hand-Rechnung Q3 2026 (netto):
   022: 1000 + 500 + 100 − 300 − 50 + 2000 (AR) + 400 (Juni-Leistung, Juli-Rechnung) + 1000 − 20 (Skonto 2 %) + 500 − 100 (GU) = 5.030 → USt 1.006,00
   029: 200 → 20,00 · 006: 100 → 13,00 · 000 = 5.030 + 200 + 100 = 5.330 (EU-B2B, Drittland, ZM nicht in 000)
   057: 300 + 20,50 + 100 + 40 + 10 + 100 = 570,50 → 114,10 · 066: 114,10 − 2,00 (RC ohne VSt) = 112,10
   070/072: 1.000 → 200 · 065: 200 · 060: 100 + 10 = 110
   USt 1.006 + 20 + 13 + 114,10 + 200 = 1.353,10 · VSt 110 + 112,10 + 200 = 422,10 · Zahllast 931,00 */
t("Q3: KZ 000 = 5.330 (nur steuerbare Inlandsumsätze, Soll nach Leistung)", () => near(kz(r, "000"), 5330, "000"));
t("Q3: KZ 022 Bemessungsgrundlage 5.030 / USt 1.006", () => { near(kz(r, "022"), 5030, "022 BMG"); near(kz(r, "022", "tax"), 1006, "022 USt"); });
t("Q3: Mehrsatz-Rechnung 10 % → KZ 029, 13 % → KZ 006", () => { near(kz(r, "029"), 200); near(kz(r, "029", "tax"), 20); near(kz(r, "006"), 100); near(kz(r, "006", "tax"), 13); });
t("Q3: Rechnung 02.10. für Leistung 30.09. gehört nicht in Q3", () => assert.ok(!(r.docs["022"] || []).some(x => x.doc === I.q4)));
t("Q3: Leistung 30.06., Rechnung 03.07. → Juli (Verschiebung § 19 Abs 2 Z 1 lit a)", () => assert.ok((r.docs["022"] || []).some(x => x.doc === I.lateJ)));
t("Q3: Leistung Mai, Rechnung August → max. 1 Monat → Juni, nicht Q3", () => assert.ok(!(r.docs["022"] || []).some(x => x.doc === I.lateMax)));
t("Q3: WKR-Vorlage, Entwurf, RV-Vorlage, Belegentwurf ausgeschlossen", () => { const all = [].concat.apply([], Object.values(r.docs)).map(x => x.doc); [I.wkr, I.draft, V.rv, V.vDraft].forEach(d => assert.ok(all.indexOf(d) < 0, d.id)); });
t("Q3: Skonto 2 % → Entgeltsminderung −20/−4 im Zahlungsmonat", () => { assert.strictEqual(r.minder.length, 1); near(r.minder[0].share * 1200, 24); });
t("Q3: Teilzahlung (Status 750) ist keine Entgeltsminderung", () => assert.ok(!r.minder.some(m => m.doc === I.teil)));
t("Q3: KZ 057 = 114,10 (RC 20 % von 570,50)", () => near(kz(r, "057", "tax"), 114.10));
t("Q3: KZ 066 = 112,10 (RC ohne Vorsteuer nur 057)", () => near(kz(r, "066", "tax"), 112.10));
t("Q3: ig. Erwerb → 070 1.000, 072 1.000/200, 065 200", () => { near(kz(r, "070"), 1000); near(kz(r, "072"), 1000); near(kz(r, "072", "tax"), 200); near(kz(r, "065", "tax"), 200); });
t("Q3: KZ 060 = 110 (offen und bezahlt nach Belegdatum; DE-19 % und nicht abziehbar ohne VSt)", () => near(kz(r, "060", "tax"), 110));
t("Q3: DE 19 % als ausländische USt markiert", () => assert.ok(r.other.fx.some(x => x.doc === V.de19)));
t("Q3: Privat/Finanzamt/SVS nicht in der UVA", () => { const all = [].concat.apply([], Object.values(r.docs)).map(x => x.doc); [V.privat, V.fa, V.svs].forEach(d => assert.ok(all.indexOf(d) < 0, d.id)); });
t("Q3: Heuristik Railway (Name) und Hetzner (DE-UID) → Reverse Charge", () => { const d = (r.docs["057"] || []).map(x => x.doc); assert.ok(d.indexOf(V.railway) > -1 && d.indexOf(V.hetzner) > -1); });
t("Q3: RC Meta (Leistung 30.09., Beleg 02.10.) in Q3", () => assert.ok((r.docs["057"] || []).some(x => x.doc === V.meta)));
t("Q3: ZM nur EU-B2B (DE 3.000 + 700, FR 200), Drittland nicht", () => {
  const z = S.zmRows(r), de = z.find(x => x.uid === "DE123456789"), fr = z.find(x => x.uid === "FR12345678901");
  assert.strictEqual(z.length, 2); near(de.net, 3700); near(fr.net, 200); assert.strictEqual(de.kind, "S"); assert.ok(r.other.ns.some(x => x.doc === I.ch)); });
t("Q3: USt 1.353,10, VSt 422,10, Zahllast 931,00 (RC neutral)", () => { near(r.ust, 1353.10, "USt"); near(r.vst, 422.10, "VSt"); near(r.zahllast, 931.00, "Zahllast"); });
t("Q3: keine offenen Einordnungen", () => assert.strictEqual(r.review.length, 0, JSON.stringify(r.review.map(x => x.why))));
t("Q3: Kennzahlen-Map für FinanzOnline", () => {
  const m = S.uvaKzMap(r);
  const exp = { "000": 5330, "022": 5030, "029": 200, "006": 100, "057": 114.10, "070": 1000, "072": 1000, "060": 110, "065": 200, "066": 112.10 };
  Object.keys(exp).forEach(k => near(m[k], exp[k], "KZ " + k)); assert.deepStrictEqual(Object.keys(m).sort(), Object.keys(exp).sort()); });
const r4 = S.computeUva(RAW, st, Q(2026, 4));
t("Q4: Leistung 30.09./Rechnung 02.10. → Q4; VSt Beleg 01.10. → Q4", () => { assert.ok((r4.docs["022"] || []).some(x => x.doc === I.q4)); near(kz(r4, "060", "tax"), 14); });
t("Q4: Anzahlung nicht doppelt, ZM-Leistung 30.09. nicht in Q4", () => { assert.ok(!(r4.docs["022"] || []).some(x => x.doc === I.ar)); assert.strictEqual(S.zmRows(r4).length, 0); });
const r2q = S.computeUva(RAW, st, Q(2026, 2));
t("Q2: Anzahlung ohne Zahlung in Q2 nicht versteuert; Mai-Leistung mit Aug.-Rechnung in Q2", () => {
  assert.ok(!(r2q.docs["022"] || []).some(x => x.doc === I.ar)); assert.ok((r2q.docs["022"] || []).some(x => x.doc === I.lateMax)); near(kz(r2q, "022"), 300 + 250); });

// (d) negative Zeiträume
const rNeg = S.computeUva({ invoices: [inv({ type: "SR", net: -1000, tax: -200, date: "2026-02-10", lines: [{ rate: 20, net: -1000, tax: -200 }] })],
  vouchers: [vou({ net: 500, tax: 100, date: "2026-02-11" }), vou({ net: -50, tax: -10, date: "2026-02-12", lines: [{ rate: 20, net: -50, tax: -10, cat: "Software" }] })] }, st0(), Q(2026, 1));
t("Gutschrift-Quartal: negative USt → KZ 090 −200, 022 nicht negativ, Überschuss −290", () => {
  const m = S.uvaKzMap(rNeg); near(m["090"], -200); assert.ok(!m["022"]); near(m["000"], 0); near(m["060"], 90); near(rNeg.zahllast, -200 - 90); });
t("Gutschrift-Quartal: Vorsteuer-Saldo positiv bleibt in 060 (Lieferantengutschrift saldiert)", () => near(kz(rNeg, "060", "tax"), 90));
const rNegV = S.computeUva({ invoices: [], vouchers: [vou({ net: -50, tax: -10, date: "2026-02-12", lines: [{ rate: 20, net: -50, tax: -10, cat: "Software" }] })] }, st0(), Q(2026, 1));
t("Nur Lieferantengutschrift: negative VSt → KZ 067 −10, Zahllast +10", () => { near(S.uvaKzMap(rNegV)["067"], -10); near(rNegV.zahllast, 10); });

/* ===================== (e) E1a 2026 ===================== */
const E = {
  r1: inv({ net: 1000, date: "2026-02-01", status: 1000, paid: 1200, payDate: "2026-03-01" }),
  r2: inv({ net: 2000, date: "2025-12-20", status: 1000, paid: 2400, payDate: "2026-01-10" }),   // Zufluss 2026
  r3: inv({ net: 500, date: "2026-12-15", status: 1000, paid: 600, payDate: "2027-01-05" }),     // Zufluss 2027
  r4: inv({ net: 1000, date: "2026-10-01", status: 1000, paid: 1200, pays: [{ date: "2026-11-01", amount: 600 }, { date: "2027-01-15", amount: 600 }] }),
  r5: inv({ net: 1000, date: "2026-04-01", status: 1000, paid: 1176, payDate: "2026-04-20" }),
  sr: inv({ type: "SR", net: -100, tax: -20, date: "2026-05-01", status: 1000, paid: -120, payDate: "2026-05-01", lines: [{ rate: 20, net: -100, tax: -20 }] }),
  r6: inv({ net: 50000, date: "2026-06-01", status: 1000, paid: 60000, payDate: "2026-06-30" }),
};
const EV = {
  sw: vou({ net: 100, tax: 20, date: "2026-02-01", status: 1000, paid: 120, payDate: "2026-02-01", cat: "Software" }),
  old: vou({ net: 300, tax: 60, date: "2026-01-02", status: 1000, paid: 360, payDate: "2025-12-30", cat: "Software" }),
  svs: vou({ net: 4000, date: "2026-03-31", status: 1000, paid: 4000, payDate: "2026-03-31", supplier: "SVS", cat: "SVS Beiträge" }),
  ads: vou({ net: 1000, taxRule: "14", date: "2026-05-01", status: 1000, paid: 1000, payDate: "2026-05-02", supplier: "Google Ireland Ltd", cat: "Werbung" }),
  de: vou({ net: 100, tax: 19, date: "2026-06-01", status: 1000, paid: 119, payDate: "2026-06-01", supplierUid: "DE987654321", cat: "Software" }),
  fa: vou({ net: 951, date: "2026-08-14", status: 1000, paid: 951, payDate: "2026-08-14", cat: "Umsatzsteuer-Vorauszahlung", catType: "VATPAY" }),
  pr: vou({ net: 700, date: "2026-08-15", status: 1000, paid: 700, payDate: "2026-08-15", cat: "Privatentnahme" }),
  fl: vou({ net: 2000, tax: 400, date: "2026-09-01", status: 1000, paid: 2400, payDate: "2026-09-05", cat: "Fremdleistungen" }),
  laptop: vou({ net: 2400, tax: 480, date: "2026-08-10", status: 1000, paid: 2880, payDate: "2026-08-10", cat: "Hardware" }),
  server: vou({ net: 10000, tax: 2000, date: "2026-03-01", status: 1000, paid: 12000, payDate: "2026-03-01", cat: "Hardware" }),
  chair: vou({ net: 800, tax: 160, date: "2026-05-01", status: 1000, paid: 960, payDate: "2026-05-01", cat: "Büromöbel" }),
};
const stE = st0();
stE.docs[EV.laptop.id] = { asset: true, nd: 3 };
stE.docs[EV.server.id] = { asset: true, nd: 5, method: "deg", benefit: "ifb10" };
stE.docs[EV.chair.id] = { asset: true, nd: 5 };
stE.trips = { "2026": [{ date: "2026-05-05", km: 1000, hours: 0, nights: 0 }] };
stE.jabInput = { "2026": { avab: true, partnerEinkommen: 20000 } };
const RAWE = { invoices: Object.values(E), vouchers: Object.values(EV), creditNotes: [] };
const j = S.computeJab(RAWE, stE, 2026);
/* Hand-Rechnung E1a 2026 (Zufluss/Abfluss, netto):
   9040: 1000 + 2000 + 500 (Teilzahlung 2026) + 980 (Skonto) − 100 (Storno) + 50.000 = 54.380
   9230: 100 + 119 (DE-USt nicht abziehbar → Aufwand) = 219 · 9225: 4.000 · 9200: 1.000 · 9110: 2.000 · 9160: 1.000 km × 0,50 = 500
   9130: Laptop 2.400/3 × ½ (Halbjahr) = 400 + GWG Sessel 800 sofort (§ 13) = 1.200 · 9134: 10.000 × 30 % = 3.000
   Summe 11.919 → Gewinn 42.461 · IFB 20 % (Anschaffung 03/2026, § 124b Z 466 EStG) 2.000 (KZ 9344) → 40.461
   GFB: Grund 15 % × 33.000 = 4.950 (inv.-bedingt 13 % × 7.461 = 969,93 möglich, aber keine Investition) → 35.511
   ESt 2026: 0,2 × (21.992 − 13.539) + 0,3 × (35.511 − 21.992) = 1.690,60 + 4.055,70 = 5.746,30 */
t("E1a: KZ 9040 = 54.380 (Zufluss, Jahresgrenze, Teilzahlung, Skonto, Storno)", () => near(j.ertr["9040"], 54380));
t("E1a: 9230 = 219 (ausl. USt als Aufwand; Abfluss 2025 nicht)", () => near(j.E["9230"], 219));
t("E1a: SVS 9225 = 4.000, Werbung RC 9200 = 1.000, Fremdleistung 9110 = 2.000, Fahrten 9160 = 500", () => { near(j.E["9225"], 4000); near(j.E["9200"], 1000); near(j.E["9110"], 2000); near(j.E["9160"], 500); });
t("E1a: Finanzamt/Privat keine Betriebsausgabe", () => { const tot = Object.keys(j.E).reduce((a, k) => a + j.E[k], 0); near(tot, 11919, "Summe Aufwand"); });
t("E1a: AfA linear Halbjahr 400 + GWG 800 sofort → 9130 = 1.200", () => near(j.E["9130"], 1200));
t("E1a: degressive AfA 30 % → 9134 = 3.000", () => near(j.E["9134"], 3000));
t("E1a: Gewinn 42.461, IFB 20 % −2.000 (KZ 9344)", () => { near(j.gewinn, 42461); near(j.K5["9344"], -2000); near(j.nachKorr, 40461); });
t("E1a: Grundfreibetrag 4.950, inv.-bedingt max. 969,93, steuerl. Gewinn 35.511", () => { near(j.grund, 4950); near(j.invMax, 969.93); near(j.g9227, 0); near(j.steuerGewinn, 35511); });
t("ESt 2026: 5.746,30, Familienbonus 0 (Partnerin 100 %/Ex 50:50), kein AVAB", () => { near(j.est.tarif, 5746.30); near(j.est.fabo, 0); near(j.est.avab, 0); near(j.est.tax, 5746.30); assert.ok(j.est.notes.some(x => /Alleinverdiener/.test(x))); });
t("Basispauschalierung 2026: 15 % = 8.157, daneben nur 9100/9110/9120/9165/9215/9217/9225 (9160 nur bei Kostenersatz)", () => {
  near(j.pausch.rate, 15); near(j.pausch.pausch, 8157); near(j.pausch.extra, 6000); near(j.pausch.gewinn, 54380 - 8157 - 6000); near(j.pausch.gfb, 4950); assert.ok(j.pausch.erlaubt); });

t("AfA-Plan degressiv 30 % mit Wechsel auf linear", () => { const a = S.assetInfo(EV.server, stE); assert.deepStrictEqual(a.plan.map(x => x.afa), [3000, 2100, 1633.33, 1633.33, 1633.34]); });
t("AfA-Plan linear Halbjahresregel (Anschaffung August)", () => assert.deepStrictEqual(S.assetInfo(EV.laptop, stE).plan.map(x => x.afa), [400, 800, 800, 400]));
t("AfA: Anschaffung 01.07. → halbe AfA, 30.06. → volle AfA (§ 7 Abs 2: mehr als 6 Monate)", () => {
  const a = vou({ net: 3000, date: "2026-07-01" }), b = vou({ net: 3000, date: "2026-06-30" }), s = st0(); s.docs[a.id] = { asset: true, nd: 3 }; s.docs[b.id] = { asset: true, nd: 3 };
  near(S.assetInfo(a, s).plan[0].afa, 500); near(S.assetInfo(b, s).plan[0].afa, 1000); });
t("IFB-Fenster: 31.10.2025 → 10 % (9276), 01.11.2025 → 20 % (9344), Öko 22 % (9345), 01.01.2027 → 10 %", () => {
  const mk = (d, b) => { const v = vou({ net: 10000, date: d, status: 1000, paid: 12000, payDate: d }); const s = st0(); s.docs[v.id] = { asset: true, nd: 5, benefit: b }; return S.computeJab({ invoices: [inv({ net: 100000, status: 1000, paid: 120000, payDate: d, date: d })], vouchers: [v] }, s, +d.slice(0, 4)).K5; };
  near(mk("2025-10-31", "ifb10")["9276"], -1000); near(mk("2025-11-01", "ifb10")["9344"], -2000); near(mk("2026-12-31", "ifb15")["9345"], -2200); near(mk("2027-01-01", "ifb10")["9276"], -1000); });
t("GFB: Staffel 13/7/4,5 % und Deckel 46.400 €", () => {
  const v = vou({ net: 100000, date: "2026-01-15", status: 1000, paid: 120000, payDate: "2026-01-15" }), s = st0(); s.docs[v.id] = { asset: true, nd: 10, benefit: "gfb" };
  const jj = S.computeJab({ invoices: [inv({ net: 600000, status: 1000, paid: 720000, payDate: "2026-02-01", date: "2026-02-01" })], vouchers: [v] }, s, 2026);
  near(jj.nachKorr, 590000); near(jj.invMax, 41450); near(jj.g9227, 41450); near(jj.gfb, 46400); });

/* ===================== (f) ESt-Tarife ===================== */
t("Tarif 2025: 50.000 € → 11.593,10", () => near(S.tarif(50000, 2025), 1661.8 + 4265.7 + 5665.6));
t("Tarif 2026: 50.000 € → 11.447,20", () => near(S.tarif(50000, 2026), 11447.2));
t("Tarif 2026: 120.000 € → 43.720,82", () => near(S.tarif(120000, 2026), 43720.82));
t("Tarif 2026: 13.539 € → 0", () => near(S.tarif(13539, 2026), 0));
t("Familienbonus: Standard-Kinder → 0 € für Simon", () => { const e = S.estimateESt(40000, {}, 2026); near(e.fabo, 0); near(e.faboMax, 0); });
t("Familienbonus bei 50 % je Kind = 1.000,08", () => { const e = S.estimateESt(40000, { kids: [{ name: "K", share: 50, fb: "partnerin", rel: "gemeinsam" }] }, 2026); near(e.fabo, 1000.08); });
t("AVAB 2026 zwei Kinder 828 € nur wenn Partnerin ≤ 7.411 €", () => { near(S.estimateESt(40000, { avab: true, partnerEinkommen: 7411 }, 2026).avab, 828); near(S.estimateESt(40000, { avab: true, partnerEinkommen: 7412 }, 2026).avab, 0); });

/* ===================== (h) Dauerleistungen, Mindest-Istbesteuerung, AR/TR/ER (§ 19 Abs 2 Z 1 lit a UStG, UStR Rz 2601 ff.) ===================== */
{
  const host = (o) => inv(Object.assign({ net: 1200, tax: 240, date: "2026-01-05", delivery: "2026-01-01", deliveryUntil: "2026-12-31" }, o));
  const h1 = host(), h2 = host({ status: 1000, paid: 1440, payDate: "2026-02-10" }), h3 = host();
  const s = st0(); s.docs[h3.id] = { teil: true };
  const U = (raw, q) => S.computeUva(raw, s, Q(2026, q));
  t("Jahres-Hosting 01–12/2026, unbezahlt: Steuerschuld erst mit Ende des Zeitraums (Q4), nicht Q1", () => { near(kz(U({ invoices: [h1], vouchers: [] }, 1), "022"), 0); near(kz(U({ invoices: [h1], vouchers: [] }, 4), "022"), 1200); near(kz(U({ invoices: [h1], vouchers: [] }, 4), "022", "tax"), 240); });
  t("Jahres-Hosting im Februar bezahlt: Mindest-Istbesteuerung Q1 1.200/240, Q4 nichts mehr", () => { near(kz(U({ invoices: [h2], vouchers: [] }, 1), "022"), 1200); near(kz(U({ invoices: [h2], vouchers: [] }, 4), "022"), 0); });
  // 365 Tage: Q1 = 90 Tage → 1.200 × 90/365 = 295,89; Q3 = 92 Tage → 302,47
  t("Teilleistungen vereinbart: monatlich anteilig nach Tagen (Q1 295,89 / Q3 302,47)", () => { near(kz(U({ invoices: [h3], vouchers: [] }, 1), "022"), 295.89, "Q1", 0.01); near(kz(U({ invoices: [h3], vouchers: [] }, 3), "022"), 302.47, "Q3", 0.01); });
  const fb = inv({ net: 500, tax: 100, date: "2026-05-10", delivery: "2026-08-15", status: 750, paid: 120, pays: [{ date: "2026-05-12", amount: 120 }] });
  t("Fotobox-Buchung: Anzahlung 120 brutto im Mai → Q2 100 netto; Rest 400 im Monat der Veranstaltung (Q3)", () => { near(kz(U({ invoices: [fb], vouchers: [] }, 2), "022"), 100); near(kz(U({ invoices: [fb], vouchers: [] }, 3), "022"), 400); });

  const AR = (o) => inv(Object.assign({ type: "AR", net: 1000, tax: 200, date: "2026-03-01", contactId: "77", contact: "Hotel Muster" }, o));
  const ER = (o) => inv(Object.assign({ type: "ER", date: "2026-07-20", delivery: "2026-07-15", contactId: "77", contact: "Hotel Muster" }, o));
  // (1) Kopfsumme = Restbetrag (Positionen 3.000 − Anzahlung 1.000 = 2.000)
  const a1 = AR({ status: 1000, paid: 1200, payDate: "2026-03-10" }), e1 = ER({ net: 2000, tax: 400, lines: [{ rate: 20, net: 3000, tax: 600 }] });
  t("ER Restbetrag: Anzahlung Q1 1.000, Endrechnung Q3 2.000 → gesamt 3.000, keine Doppelversteuerung", () => {
    const raw = { invoices: [a1, e1], vouchers: [] }; near(kz(U(raw, 1), "022"), 1000); near(kz(U(raw, 3), "022"), 2000); assert.strictEqual(S.partials(raw, s).er[e1.id].mode, "rest"); });
  // (2) Kopfsumme = Gesamtentgelt 3.000, Anzahlung bezahlt → ER nur 2.000
  const a2 = AR({ status: 1000, paid: 1200, payDate: "2026-03-10" }), e2 = ER({ net: 3000, tax: 600 });
  t("ER Gesamtentgelt: Q3 nur 3.000 − 1.000 versteuerte Anzahlung = 2.000 (USt 400)", () => { const raw = { invoices: [a2, e2], vouchers: [] }; near(kz(U(raw, 3), "022"), 2000); near(kz(U(raw, 3), "022", "tax"), 400); });
  // (3) Anzahlung erst nach der Endrechnung bezahlt → ER versteuert alles, die Zahlung im Oktober nicht nochmal
  const a3 = AR({ status: 1000, paid: 1200, payDate: "2026-10-05" }), e3 = ER({ net: 3000, tax: 600 });
  t("ER Gesamtentgelt, Anzahlung unbezahlt bis zur ER: Q3 3.000, Q4 0 (Zahlung nach ER nicht erneut)", () => { const raw = { invoices: [a3, e3], vouchers: [] }; near(kz(U(raw, 3), "022"), 3000); near(kz(U(raw, 4), "022"), 0); assert.ok(U(raw, 4).info.length === 1); });
  // (4) Restbetrag-ER, Anzahlung nie bezahlt → ER muss auch den Anzahlungsteil versteuern (Soll): 2.000 + 1.000
  const a4 = AR({}), e4 = ER({ net: 2000, tax: 400, lines: [{ rate: 20, net: 3000, tax: 600 }, { rate: 20, net: -1000, tax: -200 }] });
  t("ER Restbetrag (Abzugsposition), Anzahlung unbezahlt: Q3 3.000", () => { const raw = { invoices: [a4, e4], vouchers: [] }; near(kz(U(raw, 3), "022"), 3000); });
  // (5) Teilrechnung (Q2 nach Soll) + ER mit Gesamtentgelt
  const tr = inv({ type: "TR", net: 1000, tax: 200, date: "2026-04-10", delivery: "2026-04-10", contactId: "77", contact: "Hotel Muster" }), e5 = ER({ net: 3000, tax: 600 });
  t("Teilrechnung Q2 1.000 + Endrechnung (Gesamtentgelt 3.000) Q3 2.000", () => { const raw = { invoices: [tr, e5], vouchers: [] }; near(kz(U(raw, 2), "022"), 1000); near(kz(U(raw, 3), "022"), 2000); });
  t("Kontrollrechnung wie sevDesk (Rechnungsdatum): Q3 USt 600, Abweichung zur U30 (400) als Endrechnung erklärt", () => { const c = S.controlCheck({ invoices: [a2, e2], vouchers: [] }, s, Q(2026, 3)); near(c.ust, 600); assert.ok(c.diffs.some(d => d.doc === e2 && /Endrechnung/.test(d.why))); });
  t("ER über Cockpit auf 'voll' gestellt überschreibt die Erkennung", () => { const s2 = st0(); s2.docs[e1.id] = { erMode: "voll" }; near(kz(S.computeUva({ invoices: [a1, e1], vouchers: [] }, s2, Q(2026, 3)), "022"), 1000); });

  // Vorsteuer: Leistung + Rechnung (§ 12 Abs 1 Z 1)
  const vo = vou({ net: 100, tax: 20, date: "2026-09-25", delivery: "2026-10-01", deliveryUntil: "2026-10-31" }), vp = vou({ net: 100, tax: 20, date: "2026-09-25", delivery: "2026-10-01", deliveryUntil: "2026-10-31", status: 1000, paid: 120, payDate: "2026-09-28" });
  t("Vorsteuer Oktober-Abo, Rechnung 25.09., unbezahlt → Q4; im September bezahlt → Q3 (Anzahlung)", () => { near(kz(U({ invoices: [], vouchers: [vo] }, 3), "060", "tax"), 0); near(kz(U({ invoices: [], vouchers: [vo] }, 4), "060", "tax"), 20); near(kz(U({ invoices: [], vouchers: [vp] }, 3), "060", "tax"), 20); });
}

/* ===================== (i) sevDesk Update 2.0: Konto statt Kategorie, Lieferant als Rückfall ===================== */
{
  const fa1 = vou({ net: 900, date: "2026-08-14", status: 1000, paid: 900, payDate: "2026-08-14", cat: "", catNo: "3520", supplier: "Abgabenkonto" });
  fa1.lines[0].catNo = "3520"; fa1.lines[0].cat = "";
  const fa2 = vou({ net: 1500, date: "2026-08-14", status: 1000, paid: 1500, payDate: "2026-08-14", cat: "", supplier: "Finanzamt Österreich" }); fa2.lines[0].cat = "";
  const sv = vou({ net: 1100, date: "2026-08-31", status: 1000, paid: 1100, payDate: "2026-08-31", cat: "", supplier: "SVS Sozialversicherung der Selbständigen" }); sv.lines[0].cat = "";
  const sw = vou({ net: 50, tax: 10, date: "2026-08-02", status: 1000, paid: 60, payDate: "2026-08-02", cat: "Software" }); sw.lines[0].catNo = "3520";   // Name hat Vorrang vor Nummer
  const raw = { invoices: [inv({ net: 10000, date: "2026-02-01", status: 1000, paid: 12000, payDate: "2026-02-10" })], vouchers: [fa1, fa2, sv, sw], creditNotes: [] };
  const jj = S.computeJab(raw, st0(), 2026);
  t("ohne Kategorie: EKR-Konto 3520 und Lieferant Finanzamt → keine Betriebsausgabe; SVS (Lieferant) → 9225 = 1.100", () => { near(jj.E["9225"], 1100); near(jj.E["9230"], 50); near(Object.keys(jj.E).reduce((a, k) => a + jj.E[k], 0), 1150); });
  t("Finanzamt-Zahlung ohne Kategorie nicht in der UVA (keine Vorsteuer)", () => near(kz(S.computeUva(raw, st0(), Q(2026, 3)), "060", "tax"), 10));
}

/* ===================== (j) E1a: Gutschriften, 15-Tage-Regel, Verlustvortrag ===================== */
{
  const gu = { id: "cn9", nr: "GU-9", type: "GU", status: 1000, date: "2026-06-01", taxRule: "1", contact: "Kunde Y", net: 100, tax: 20, gross: 120, lines: [{ rate: 20, net: 100, tax: 20 }] };
  t("Gutschrift an Kunden (bezahlt) mindert die Einnahmen: 1.000 − 100 = 900", () => near(S.computeJab({ invoices: [inv({ net: 1000, date: "2026-03-01", status: 1000, paid: 1200, payDate: "2026-03-05" })], vouchers: [], creditNotes: [gu] }, st0(), 2026).ertr["9040"], 900));
  const svsDez = vou({ net: 1000, date: "2026-12-31", status: 1000, paid: 1000, payDate: "2027-01-10", supplier: "SVS", cat: "SVS Beiträge" });
  const miete = vou({ net: 500, date: "2027-01-01", delivery: "2027-01-01", deliveryUntil: "2027-01-31", status: 1000, paid: 500, payDate: "2026-12-28", cat: "Miete Büro" });
  const abo = vou({ net: 30, tax: 6, date: "2026-12-31", status: 1000, paid: 36, payDate: "2027-01-05", cat: "Software" });
  const abo2 = vou({ net: 30, tax: 6, date: "2026-12-31", status: 1000, paid: 36, payDate: "2027-01-05", cat: "Software" });
  const s = st0(); s.docs[abo2.id] = { wk: "ja" };
  const raw = { invoices: [], vouchers: [svsDez, miete, abo, abo2], creditNotes: [] };
  const j26 = S.computeJab(raw, s, 2026), j27 = S.computeJab(raw, s, 2027);
  t("15-Tage-Regel: SVS Dez. 2026, bezahlt 10.01.2027 → 2026; Jänner-Miete bezahlt 28.12.2026 → 2027", () => { near(j26.E["9225"], 1000); near(j27.E["9225"] || 0, 0); near(j26.E["9180"] || 0, 0); near(j27.E["9180"], 500); });
  t("15-Tage-Regel: Software nur mit Kennzeichen 'wiederkehrend' (30 → 2026), sonst Abfluss 2027", () => { near(j26.E["9230"], 30); near(j27.E["9230"], 30); });
  t("Verlustvortrag max. 75 % des Gesamtbetrags (§ 2 Abs 2b): 40.000 / VV 50.000 → 30.000 verrechnet, 20.000 Rest", () => { const e = S.estimateESt(40000, { verlustvortrag: 50000 }, 2026); near(e.vvUsed, 30000); near(e.vvRest, 20000); near(e.eink, 10000); near(e.tax, 0); });
  t("Verlustvortrag kleiner als 75 %-Grenze voll: VV 10.000 bei 40.000 → 30.000 Einkommen", () => near(S.estimateESt(40000, { verlustvortrag: 10000 }, 2026).eink, 30000));
}

/* ===================== (k) Pkw: Vorsteuer und Luxustangente ===================== */
{
  const s = st0();
  const ep = vou({ net: 40000, tax: 8000, date: "2026-03-01", status: 1000, paid: 48000, payDate: "2026-03-01", cat: "Fahrzeug" }); s.docs[ep.id] = { asset: true, pkw: true, epkw: true, nd: 8, benefit: "ifb15" };
  const vb = vou({ net: 30000, tax: 6000, date: "2026-03-01", status: 1000, paid: 36000, payDate: "2026-03-01", cat: "Fahrzeug" }); s.docs[vb.id] = { asset: true, pkw: true, nd: 8, benefit: "gfb" };
  const lux = vou({ net: 50000, tax: 10000, date: "2026-03-01", status: 1000, paid: 60000, payDate: "2026-03-01", cat: "Fahrzeug" }); s.docs[lux.id] = { asset: true, pkw: true, nd: 8 };
  const us = vou({ net: 6000, tax: 1200, date: "2026-03-01", cat: "Hardware" }); s.docs[us.id] = { asset: true, nd: 5, method: "deg", used: true };
  t("E-Pkw 48.000 brutto: Vorsteuer 8.000 abziehbar (≤ 80.000), Hinweis Eigenverbrauch über 40.000", () => { near(kz(S.computeUva({ invoices: [], vouchers: [ep] }, s, Q(2026, 1)), "060", "tax"), 8000); assert.ok(/Eigenverbrauch/.test(S.assetInfo(ep, s).note)); });
  t("E-Pkw: Luxustangente netto 33.333,33 → AfA 5.000, davon 833,33 nicht abzugsfähig (KZ 9260)", () => { const a = S.assetInfo(ep, s); near(a.plan[0].afa, 5000); near(a.plan[0].afaLux, 833.33); });
  t("Verbrenner-Pkw: keine Vorsteuer, AHK brutto 36.000, AfA 4.500 ohne Luxustangente", () => { near(kz(S.computeUva({ invoices: [], vouchers: [vb] }, s, Q(2026, 1)), "060", "tax"), 0); const a = S.assetInfo(vb, s); near(a.ahk, 36000); near(a.plan[0].afa, 4500); near(a.plan[0].afaLux, 0); });
  t("Pkw 60.000 brutto: AfA 7.500, Luxustangente-Anteil 2.500", () => { const a = S.assetInfo(lux, s); near(a.plan[0].afa, 7500); near(a.plan[0].afaLux, 2500); });
  t("Gebrauchtes Wirtschaftsgut: keine degressive AfA (§ 7 Abs 1a) → linear 1.200", () => { const a = S.assetInfo(us, s); assert.strictEqual(a.method, "lin"); near(a.plan[0].afa, 1200); });
  t("Gewinnfreibetrag nicht für Pkw (§ 10 Abs 4); Öko-IFB E-Pkw 22 % von 33.333,33 = 7.333,33", () => {
    const jj = S.computeJab({ invoices: [inv({ net: 200000, date: "2026-02-01", status: 1000, paid: 240000, payDate: "2026-02-10" })], vouchers: [ep, vb], creditNotes: [] }, s, 2026);
    near(jj.gfbInvest, 0); near(jj.K5["9345"], -7333.33); });
}

/* ===================== (l) EU-Ausgangsrechnungen: ig. Lieferung, ig. Leistung, Dreieck, Override ===================== */
{
  const RULES_AT = [
    { id: "3", name: "INNERGEM_LIEF", description: "Steuerfreie innergemeinschaftliche Lieferungen", side: "REVENUE" },
    { id: "40", name: "IG_SONST_LEIST", description: "Innergemeinschaftliche sonstige Leistung (Übergang der Steuerschuld)", side: "REVENUE" },
    { id: "104", name: "USTPFL_UMS", description: "Umsatzsteuerpflichtige Umsätze", side: "REVENUE" },
    { id: "106", name: "SONDER_X", description: "Zauberregel Muster", side: "REVENUE" } ];
  const s = st0();
  const igl = inv({ net: 2000, tax: 0, rate: 0, taxRule: "3", uid: "DE123456789", country: "DE", date: "2026-08-03", delivery: "2026-08-03" });
  const txt = inv({ net: 800, tax: 0, rate: 0, taxRule: "104", uid: "", country: "AT", date: "2026-08-05", delivery: "2026-08-05",
    addrText: "Muster GmbH\nHauptstraße 1\n80331 München\nDeutschland", texts: "Steuerfreie innergemeinschaftliche Lieferung gem. Art. 7 UStG. USt-IdNr. Kunde: DE 987 654 321 – unsere UID ATU12345678" });
  const leer = inv({ net: 300, tax: 0, rate: 0, taxRule: "104", uid: "", country: "AT", date: "2026-08-07", delivery: "2026-08-07" });
  const leist = inv({ net: 1500, tax: 0, rate: 0, taxRule: "40", uid: "FR12345678901", country: "FR", date: "2026-09-01", delivery: "2026-09-01" });
  const drei = inv({ net: 400, tax: 0, rate: 0, taxRule: "104", uid: "IT12345678901", country: "IT", date: "2026-09-02", delivery: "2026-09-02" });
  const unk = inv({ net: 90, tax: 0, rate: 0, taxRule: "106", country: "AT", date: "2026-09-03", delivery: "2026-09-03" });
  s.docs[drei.id] = { kz: "zmd" };
  const RAWEU = { invoices: [igl, txt, leer, leist, drei, unk], vouchers: [], creditNotes: [], taxRules: RULES_AT };
  const r = S.computeUva(RAWEU, s, Q(2026, 3)), z = S.zmRows(r);
  t("ig. Lieferung über Regeltext (Regel 3) → KZ 000/017 2.000 + ZM Lieferung", () => { assert.ok((r.docs["017"] || []).some(x => x.doc === igl)); assert.ok(z.some(x => x.uid === "DE123456789" && x.kind === "L" && Math.abs(x.net - 2000) < 0.01)); });
  t("ohne Regel/UID: Land aus Rechnungsadresse, UID aus Text (eigene ATU ignoriert), Hinweis 'ig. Lieferung' → 017, aber unsicher", () => {
    const oi = S.outInfo(txt, s); assert.strictEqual(oi.uid, "DE987654321"); assert.strictEqual(oi.cc, "DE"); assert.ok((r.docs["017"] || []).some(x => x.doc === txt));
    const zr = S.zeroRated(RAWEU, s, Q(2026, 3)); assert.ok(zr.some(x => x.doc === txt && !x.sure && x.klasse === "017")); });
  t("KZ 017 = 2.800, KZ 000 = 2.800 (ig. Leistung/Dreieck nicht in 000)", () => { near(kz(r, "017"), 2800); near(kz(r, "000"), 2800); });
  t("ig. sonstige Leistung (Regel 40 per Text) → nur ZM 'S' 1.500, nicht in 000", () => assert.ok(z.some(x => x.uid === "FR12345678901" && x.kind === "S" && Math.abs(x.net - 1500) < 0.01)));
  t("Dreiecksgeschäft (Override) → ZM mit Kennzeichen", () => assert.ok(z.some(x => x.uid === "IT12345678901" && x.dreieck)));
  t("0 % ohne Land/UID → in 'bitte zuordnen' und in review; nach Override 017 + UID/Land → KZ 017 + ZM", () => {
    assert.ok(r.review.some(x => x.doc === leer)); assert.ok(S.zeroRated(RAWEU, s, Q(2026, 3)).some(x => x.doc === leer && !x.sure));
    const s2 = JSON.parse(JSON.stringify(s)); s2.docs[leer.id] = { kz: "017", uid: "NL123456789B01", land: "NL" };
    const r2 = S.computeUva(RAWEU, s2, Q(2026, 3)); near(kz(r2, "017"), 3100); assert.ok(S.zmRows(r2).some(x => x.uid === "NL123456789B01" && x.kind === "L"));
    assert.ok(S.zeroRated(RAWEU, s2, Q(2026, 3)).some(x => x.doc === leer && x.sure && x.manual)); });
  t("unbekannte Regel → Diagnose warnt; Zuordnung Regel→Klasse (nsout) gilt für alle Belege der Regel", () => {
    const d = S.ruleDiagnosis(RAWEU, s, 2026), u = d.find(x => x.id === "106"); assert.ok(u.unknown); assert.strictEqual(u.nOut, 1);
    assert.strictEqual(d.find(x => x.id === "3").out, "igl"); assert.strictEqual(d.find(x => x.id === "104").out, "inl");
    const s3 = JSON.parse(JSON.stringify(s)); s3.ruleMap = { "106": { out: "nsout" } }; const r3 = S.computeUva(RAWEU, s3, Q(2026, 3));
    assert.ok(r3.other.ns.some(x => x.doc === unk)); assert.ok(!S.ruleDiagnosis(RAWEU, s3, 2026).find(x => x.id === "106").unknown); });
  t("Adress-/Länder-Erkennung: Schweiz, Liechtenstein (FL-PLZ), D-PLZ", () => { assert.strictEqual(S.addrCountry("X AG\nBahnhofstr. 1\n8001 Zürich\nSchweiz"), "CH"); assert.strictEqual(S.addrCountry("Y Anstalt\nFL-9490 Vaduz"), "LI"); assert.strictEqual(S.addrCountry("Z GmbH\nD-88131 Lindau"), "DE"); });
}

/* ===================== (m) Eingangsseite: Regeln mit österreichischen Namen/abweichenden IDs, ig. Erwerb vs. Dienstleistung ===================== */
{
  const RULES_IN = [
    { id: "201", name: "VORST_ABZ", description: "Vorsteuerabziehbare Aufwendungen", side: "EXPENSE" },
    { id: "202", name: "RC_LEIST", description: "Reverse Charge – Steuerschuld des Leistungsempfängers (§ 19 Abs. 1 UStG)", side: "EXPENSE" },
    { id: "203", name: "IG_ERWERB", description: "Innergemeinschaftlicher Erwerb", side: "EXPENSE" },
    { id: "204", name: "KEIN_VST", description: "Nicht vorsteuerabziehbare Aufwendungen", side: "EXPENSE" } ];
  const s = st0();
  const at = vou({ net: 100, tax: 20, taxRule: "201", date: "2026-07-02" }), rc = vou({ net: 50, taxRule: "202", date: "2026-07-03", supplier: "Some Cloud Inc", supplierCountry: "US" });
  const goog = vou({ net: 300, taxRule: "203", date: "2026-07-04", supplier: "Google Ireland Ltd", cat: "Werbung" }), hw = vou({ net: 1000, taxRule: "203", date: "2026-07-05", supplier: "Technik Händler GmbH", supplierUid: "DE111111111", cat: "Hardware" });
  const unk = vou({ net: 200, taxRule: "203", date: "2026-07-06", supplier: "Muster BV", supplierUid: "NL123456789B01", cat: "Sonstiges" }), nv = vou({ net: 40, taxRule: "204", date: "2026-07-07", cat: "Versicherung" });
  const RAWIN = { invoices: [], vouchers: [at, rc, goog, hw, unk, nv], creditNotes: [], taxRules: RULES_IN };
  const r = S.computeUva(RAWIN, s, Q(2026, 3));
  // 057: 50 + 300 (Google als RC) = 350 → 70 · 070/072: 1.000 + 200 (unklar → Ware) = 1.200 → 240 · 060: 20
  t("Regeln mit abweichenden IDs per Text: 201→060, 202→RC, 204→keine VSt", () => { near(kz(r, "060", "tax"), 20); assert.ok((r.docs["057"] || []).some(x => x.doc === rc)); assert.ok(!(r.docs["060"] || []).some(x => x.doc === nv)); });
  t("als ig. Erwerb gebuchte Google-Werbung → Reverse Charge 057/066 (nicht 070); Hardware → ig. Erwerb", () => { near(kz(r, "057"), 350); near(kz(r, "066", "tax"), 70); near(kz(r, "070"), 1200); near(kz(r, "072", "tax"), 240); near(kz(r, "065", "tax"), 240); });
  t("unklarer ig. Erwerb in der Zuordnungsliste; Zuordnung je Lieferant (supMap rc) verschiebt nach 057", () => {
    const rv = S.igeReview(RAWIN, s, Q(2026, 3)); assert.ok(rv.some(x => x.supplier === "Muster BV" && !x.sure));
    const s2 = st0(); s2.supMap = { "muster bv": "rc" }; const r2 = S.computeUva(RAWIN, s2, Q(2026, 3)); near(kz(r2, "057"), 550); near(kz(r2, "070"), 1000); });
}

/* ===================== (n) Kalibrierung: sevDesk-USt-Auswertung des Inhabers (ein Quartal) ===================== */
{
  const s = st0();
  const inv20a = inv({ net: 10000, tax: 2000, date: "2026-07-10", delivery: "2026-07-10" }), inv20b = inv({ net: 9897.10, tax: 1979.41, date: "2026-08-10", delivery: "2026-08-10" });
  const inv10 = inv({ net: 1813, tax: 181.30, rate: 10, date: "2026-08-20", delivery: "2026-08-20" });
  const inv0de = inv({ net: 600, tax: 0, rate: 0, taxRule: "1", uid: "DE123456789", country: "DE", date: "2026-09-01", delivery: "2026-09-01" });
  const inv0ch = inv({ net: 235.07, tax: 0, rate: 0, taxRule: "1", country: "CH", date: "2026-09-02", delivery: "2026-09-02" });
  const einNs = vou({ cd: "D", net: -38.80, tax: 0, rate: 0, taxRule: "17", date: "2026-09-03", cat: "Erlöse nicht steuerbar" });
  const v20 = vou({ net: 3413.06, tax: 682.60, date: "2026-07-15" }), v0 = vou({ net: 565.48, taxRule: "10", date: "2026-07-16" });
  const g = vou({ net: 2000, taxRule: "8", date: "2026-07-20", supplier: "Google Ireland Ltd", cat: "Werbung" }), ad = vou({ net: 913.50, taxRule: "8", date: "2026-08-20", supplier: "Adobe Systems Software Ireland Ltd", cat: "Software" });
  const hw = vou({ net: 1000, taxRule: "8", date: "2026-08-21", supplier: "Technik Händler GmbH", supplierUid: "DE111111111", cat: "Hardware" });
  const rw = vou({ net: 1473.18, taxRule: "12", date: "2026-09-10", supplier: "Railway Corporation" });
  const vers = vou({ net: 496.05, taxRule: "10", date: "2026-09-11", cat: "Versicherungen" }), nicht = vou({ net: 11.63, taxRule: "10", date: "2026-09-12", cat: "Bankspesen" });
  const RAWK = { invoices: [inv20a, inv20b, inv10, inv0de, inv0ch], vouchers: [einNs, v20, v0, g, ad, hw, rw, vers, nicht], creditNotes: [] };
  const r = S.computeUva(RAWK, s, Q(2026, 3)), c = S.controlCheck(RAWK, s, Q(2026, 3));
  /* sevDesk: USt 3.979,41 + 181,30 = 4.160,71 − VSt 682,60 = 3.478,11.
     U30: 000 = 19.897,10 + 1.813 = 21.710,10 (0 %-ZM 600 und CH 235,07 sowie nicht steuerbar −38,80 nicht in 000)
     022 = 19.897,10 → 3.979,42 (FA rechnet aus der BMG) · 029 = 1.813 → 181,30
     057 = 2.000 + 913,50 + 1.473,18 = 4.386,68 → 877,34 = 066 · 070/072 = 1.000 → 200 = 065 · 060 = 682,60
     Zahllast = 3.979,42 + 181,30 + 877,34 + 200 − 682,60 − 877,34 − 200 = 3.478,12 (sevDesk 3.478,11; 1 Cent Rundung) */
  t("Kalibrierung: KZ 000 21.710,10, 022 19.897,10/3.979,42, 029 1.813/181,30", () => { near(kz(r, "000"), 21710.10); near(kz(r, "022"), 19897.10); near(kz(r, "022", "tax"), 3979.42); near(kz(r, "029"), 1813); near(kz(r, "029", "tax"), 181.30); });
  t("Kalibrierung: 057 4.386,68/877,34 = 066; ig. Erwerb nur Hardware 070/072 1.000 → 200 = 065; 060 682,60", () => { near(kz(r, "057"), 4386.68); near(kz(r, "057", "tax"), 877.34); near(kz(r, "066", "tax"), 877.34); near(kz(r, "070"), 1000); near(kz(r, "072", "tax"), 200); near(kz(r, "065", "tax"), 200); near(kz(r, "060", "tax"), 682.60); });
  t("Kalibrierung: Zahllast U30 3.478,12 ≈ sevDesk 3.478,11 (±0,01); Kontrollrechnung exakt 4.160,71 − 682,60 = 3.478,11", () => { near(r.zahllast, 3478.11, "U30", 0.011); near(c.ust, 4160.71); near(c.vst, 682.60); near(c.zahllast, 3478.11); });
  t("Kalibrierung: 0 %-Umsätze → ZM DE 600, CH nicht steuerbar", () => { assert.ok(S.zmRows(r).some(x => x.uid === "DE123456789" && Math.abs(x.net - 600) < 0.01)); assert.ok(r.other.ns.some(x => x.doc === inv0ch)); });
}

/* ===================== (g) XML gegen BMF-XSD ===================== */
const ROOT = path.join(__dirname, "..");
const SCHEMA = [path.join(ROOT, "..", "buchhaltung", "tests", "schema"), path.join(ROOT, "test", "schema")].find(d => fs.existsSync(path.join(d, "U30.xsd")));
const JE_XSD = [path.join(ROOT, "..", "bmf", "JE2025.xsd"), path.join(ROOT, "test", "schema", "JE2025.xsd")].find(f => fs.existsSync(f));
function fonModule() {
  const src = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  const a = src.indexOf("const FON = {"), b = src.indexOf("async function fonRuf");
  return new Function("STEUER_CALC", "process", src.slice(a, b) + "\nreturn { fonU30Xml, fonZmXml, fonJahrXml, fonPruefeU30, fonPruefeZm, fonPruefeJahr };")(S, { env: {} });
}
let xmllint = true; try { cp.execFileSync("xmllint", ["--version"], { stdio: "ignore" }); } catch (e) { xmllint = false; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "steuer-xsd-"));
function validate(xml, xsd) { const f = path.join(tmp, "x" + (++n) + ".xml"); fs.writeFileSync(f, xml); try { cp.execFileSync("xmllint", ["--noout", "--schema", xsd, f], { stdio: "pipe" }); return ""; } catch (e) { return String(e.stderr || e.message); } }
const FON = fonModule(), erst = new Date("2026-10-01T10:00:00Z");
if (!xmllint || !SCHEMA) console.log("HINWEIS: XSD-Prüfung übersprungen (" + (!xmllint ? "xmllint fehlt" : "Schema-Verzeichnis fehlt") + ")");
else {
  t("U30-XML Q3 2026 gültig gegen U30.xsd (ab 07/2026)", () => { const e = validate(FON.fonU30Xml("981234567", 1, { von: "2026-07", bis: "2026-09", kundeninfo: "Test Q3", kennzahlen: S.uvaKzMap(r), erstellt: erst }), path.join(SCHEMA, "U30.xsd")); assert.strictEqual(e, ""); });
  t("U30-XML Gutschrift mit KZ 090/067 gültig", () => { const e = validate(FON.fonU30Xml("981234567", 2, { von: "2026-01", bis: "2026-03", kennzahlen: Object.assign(S.uvaKzMap(rNeg), { "067": -10 }), erstellt: erst }), path.join(SCHEMA, "U30.xsd")); assert.strictEqual(e, ""); });
  t("U30-XML mit KZ 020 + VST gültig", () => { const e = validate(FON.fonU30Xml("981234567", 3, { von: "2026-07", bis: "2026-09", kennzahlen: { "000": 100, "020": 100 }, vst: "9a", erstellt: erst }), path.join(SCHEMA, "U30.xsd")); assert.strictEqual(e, ""); });
  t("U13-XML (ZM) gültig gegen U13.xsd", () => { const z = S.zmRows(r).map(x => ({ uid: x.uid, betrag: x.net, sonstigeLeistung: x.kind === "S", dreieck: false })); const e = validate(FON.fonZmXml("981234567", 4, { von: "2026-07", bis: "2026-09", kundeninfo: "ZM", zeilen: z, erstellt: erst }), path.join(SCHEMA, "U13.xsd")); assert.strictEqual(e, ""); });
  if (JE_XSD) t("JAHR_ERKL 2025 (E1/E1a/U1) gültig gegen JE2025.xsd", () => {
    const s = st0(); s.docs = stE.docs; s.jabInput = { "2025": { avab: false } };
    const RAW25 = { invoices: [inv({ net: 30000, date: "2025-05-01", delivery: "2025-05-01", status: 1000, paid: 36000, payDate: "2025-05-20" }), inv({ net: 1000, rate: 0, tax: 0, taxRule: "17", uid: "DE123456789", country: "DE", date: "2025-06-01", status: 1000, paid: 1000, payDate: "2025-06-10" })],
      vouchers: [vou({ net: 300, taxRule: "14", date: "2025-03-01", status: 1000, paid: 300, payDate: "2025-03-01", supplier: "Google Ireland Ltd", cat: "Werbung" }), vou({ net: 4000, date: "2025-03-31", status: 1000, paid: 4000, payDate: "2025-03-31", cat: "SVS Beiträge" })] };
    const jj = S.computeJab(RAW25, s, 2025);
    const settings = { steuernummer: "98 123/4567", betriebAdr: "Dorfstraße 1", betriebPlz: "6793", betriebOrt: "Gaschurn", brkz: "731", einkunftsart: "GW" };
    const xml = FON.fonJahrXml("981234567", 5, { year: "2025", jab: jj, u1: S.uvaKzMap(jj.u1), settings, erstellt: erst });
    const e = validate(xml, JE_XSD); assert.strictEqual(e, ""); });
  else console.log("HINWEIS: JE2025.xsd nicht gefunden – JAHR_ERKL-Prüfung übersprungen");
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

console.log((fail ? "FEHLER" : "OK") + ": " + pass + " bestanden, " + fail + " fehlgeschlagen");
fails.forEach(f => console.log(" ✗ " + f));
process.exit(fail ? 1 : 0);
