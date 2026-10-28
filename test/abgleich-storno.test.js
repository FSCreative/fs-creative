/* Abgleich & Storno (Finanz-Server, Nachtplan WP-A): stornierte Rechnungen gelten im Abgleich als „storniert“ (nicht bezahlt/verrechnet),
   der Zeitraum ist wieder zu verrechnen; vollständige Rechnungsliste nur am Server (invoicesAll nie in Antworten); Zähler aus allen Daten;
   Mahnungs-Entwürfe; contactId in Antworten; Lead/Auftrag merken sich Kontakt und Belege.
   Aufruf: node test/abgleich-storno.test.js   (keine Abhängigkeiten; server.js läuft in Temp-Kopien, nie gegen echte Dienste) */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto"), http = require("http");

const ROOT = path.join(__dirname, "..");
const SECRET = "test-secret", KEY = "sev-test-key";
const COOKIE = "fsadmin=" + encodeURIComponent((v => v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("hex"))("s1." + Date.now()));
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }

function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-storno-"));
  fs.readdirSync(ROOT).filter(f => /\.(js|json|html|css|xml|txt|webmanifest)$/.test(f) && !/^package(-lock)?\.json$/.test(f) && fs.statSync(path.join(ROOT, f)).isFile()).forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  const cpDir = (d) => { if (!fs.existsSync(path.join(ROOT, d))) return; fs.mkdirSync(path.join(dir, d), { recursive: true }); fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => { if (e.isDirectory()) cpDir(path.join(d, e.name)); else fs.copyFileSync(path.join(ROOT, d, e.name), path.join(dir, d, e.name)); }); };
  ["admin-cockpit", "logos"].forEach(cpDir);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}
const STRIP = /^(RAILWAY_|CF_API_TOKEN|ANTHROPIC_|DATABASE_URL|PRINTCOM_|PRINT_MOLLIE|MOLLIE_|EB_|PAYPAL_|FON_|VIW_|WA_|MKT_|GOOGLE_|PEXELS_|SKIKAISER_|HUETTENGAUDI_|VALUERO_|ANTONHAUS_|ALPINAPPART_|FINAPI_|ICLOUD_|SEVDESK_|MAIL_API_|KOCHDU_|KANTINEUR_|BLITZDINGS_|NDA_|LEAD_MAIL)/;
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const r2 = n => Math.round(n * 100) / 100;
const viennaToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ── Kleine sevDesk-Attrappe (Rechnungen inkl. Storno/SR, Kontakte, Umsätze, Belege) + VALUERO-Partner + Wetter ──
function createMock() {
  const contacts = [{ id: "21", objectName: "Contact", name: "Alte Firma GmbH" }, { id: "22", objectName: "Contact", name: "Haus Test" }, { id: "23", objectName: "Contact", surename: "Eva", familyname: "Privat" }];
  const inv = [], pos = {}, log = [];
  const ts = (iso) => iso + "T00:00:00+01:00";
  // 1050 bezahlte Rechnungen (neuer, > 1000 → zwei Seiten), dazu eine alte offene, ein alter Entwurf und eine Mahnung im Entwurf
  for (let i = 1; i <= 1050; i++) inv.push({ id: String(i), objectName: "Invoice", invoiceNumber: "RE-A" + i, invoiceType: "RE", status: "1000", invoiceDate: ts(addDays("2025-01-01", Math.floor(i / 3))), timeToPay: "14",
    sumNet: "100", sumTax: "20", sumGross: "120", paidAmount: "120", contact: { id: "22", objectName: "Contact" }, headText: "Rechnung " + i });
  inv.push({ id: "4700", objectName: "Invoice", invoiceNumber: "RE-OLD", invoiceType: "RE", status: "200", invoiceDate: ts("2024-03-01"), timeToPay: "14", sumNet: "416.67", sumTax: "83.33", sumGross: "500", paidAmount: "0", contact: { id: "21", objectName: "Contact" }, headText: "" });
  inv.push({ id: "4701", objectName: "Invoice", invoiceNumber: "", invoiceType: "RE", status: "100", invoiceDate: ts("2024-02-01"), timeToPay: "14", sumNet: "50", sumTax: "10", sumGross: "60", paidAmount: "0", contact: { id: "21", objectName: "Contact" }, headText: "" });
  inv.push({ id: "4703", objectName: "Invoice", invoiceNumber: "RE-GU", invoiceType: "RE", status: "1000", invoiceDate: ts("2026-01-05"), timeToPay: "14", sumNet: "100", sumTax: "20", sumGross: "120", paidAmount: "0", contact: { id: "21", objectName: "Contact" }, cancelled: true, cancelledBy: "GU-1" });   // Storno per Gutschrift (eigene Buchhaltung)
  inv.push({ id: "4800", objectName: "Invoice", invoiceNumber: "MA-1", invoiceType: "MA", status: "100", invoiceDate: ts("2024-05-01"), timeToPay: "7", sumNet: "505", sumTax: "0", sumGross: "505", paidAmount: "0", contact: { id: "21", objectName: "Contact" }, origin: { id: "4700", objectName: "Invoice" }, dunningLevel: "1", dunningFee: "5" });
  const tx = [{ id: "1", status: "100", amount: "10" }, { id: "2", status: "100", amount: "20" }, { id: "3", status: "100", amount: "1.5", mollieType: "application-fee" }, { id: "4", status: "200", amount: "5" }, { id: "5", status: "400", amount: "7" }];
  const vou = [{ id: "1", status: "50", voucherDate: ts("2024-01-10"), creditDebit: "C", sumGross: "10", paidAmount: "0" }, { id: "2", status: "50", voucherDate: ts("2026-01-10"), creditDebit: "C", sumGross: "11", paidAmount: "0" }, { id: "3", status: "100", voucherDate: ts("2026-02-10"), creditDebit: "C", sumGross: "12", paidAmount: "0" }];
  let n = 0;
  const ct = id => contacts.find(c => c.id === String(id));
  const embed = (o, q) => (q.get("embed") === "contact" && o.contact ? Object.assign({}, o, { contact: ct(o.contact.id) || o.contact }) : o);
  const page = (arr, q) => { const off = +q.get("offset") || 0, lim = +q.get("limit") || 100; return arr.slice(off, off + lim); };
  const filt = (arr, q) => arr.filter(o => { for (const [k, v] of q) { if (/^(limit|offset|embed|depth|countAll|startDate|endDate)$/.test(k) || /\[objectName\]$/.test(k)) continue;
    const m = k.match(/^(\w+)\[id\]$/); if (m) { if (!o[m[1]] || String(o[m[1]].id) !== v) return false; continue; } if (o[k] == null || String(o[k]) !== v) return false; } return true; });
  const valueroMonths = [];   // {month, provisionCents}
  const server = http.createServer((req, res) => {
    let body = ""; req.on("data", c => (body += c)); req.on("end", () => {
      const u = new URL(req.url, "http://x"), q = u.searchParams; let json = null; try { json = body ? JSON.parse(body) : null; } catch (e) {}
      const send = (st, o) => { res.writeHead(st, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (u.pathname === "/valuero") { const y = q.get("year") || ""; return send(200, { ok: true, properties: [{ property: "haus-test", name: "Haus Test", feePercentDirect: 5, provisionCents: 0, months: valueroMonths.filter(m => !y || m.month.slice(0, 4) === y) }] }); }
      if (!u.pathname.startsWith("/api/v1")) return send(404, { error: "nope" });
      const p = u.pathname.replace(/^\/api\/v1/, ""), m = req.method; log.push({ m, p, q: Object.fromEntries(q) });
      if (req.headers.authorization !== KEY) return send(401, { error: { message: "Authentication required" } });
      let mm;
      if (m === "GET" && p === "/Tools/bookkeepingSystemVersion") return send(200, { objects: { version: "2.0" } });
      if (m === "GET" && p === "/Invoice") return send(200, { objects: page(filt(inv, q).slice().sort((a, b) => +b.id - +a.id).map(o => embed(o, q)), q) });
      if (m === "GET" && (mm = p.match(/^\/Invoice\/(\d+)$/))) { const o = inv.find(x => x.id === mm[1]); return o ? send(200, { objects: [embed(o, q)] }) : send(400, { error: { message: "Invoice not found" } }); }
      if (m === "GET" && (mm = p.match(/^\/Invoice\/(\d+)\/getPositions$/))) return send(200, { objects: pos[mm[1]] || [] });
      if (m === "POST" && p === "/Invoice/Factory/saveInvoice") {
        const id = String(9000 + (++n)), ps = (json.invoicePosSave || []).map((x, k) => ({ id: id + "0" + k, name: x.name, quantity: String(x.quantity), price: String(x.price), priceNet: String(x.price), taxRate: String(x.taxRate), positionNumber: String(k) }));
        const net = r2(ps.reduce((a, x) => a + (+x.price) * (+x.quantity), 0)), gross = r2(ps.reduce((a, x) => a + (+x.price) * (+x.quantity) * (1 + (+x.taxRate) / 100), 0));
        const o = { id, objectName: "Invoice", invoiceNumber: "RE-9" + n, invoiceType: "RE", status: String(json.invoice.status || 100), invoiceDate: ts(viennaToday()), timeToPay: String(json.invoice.timeToPay || 14), sumNet: String(net), sumTax: String(r2(gross - net)), sumGross: String(gross), paidAmount: "0",
          contact: { id: String(json.invoice.contact.id), objectName: "Contact" }, headText: json.invoice.headText || "", header: json.invoice.header || "" };
        inv.push(o); pos[id] = ps; return send(201, { objects: { invoice: o, invoicePos: ps } });
      }
      if (m === "POST" && (mm = p.match(/^\/Invoice\/(\d+)\/sendViaEmail$/))) { const o = inv.find(x => x.id === mm[1]); if (!o) return send(400, { error: { message: "nf" } }); o.status = "200"; o.sendDate = new Date().toISOString(); return send(201, { objects: o }); }
      if (m === "POST" && (mm = p.match(/^\/Invoice\/(\d+)\/cancelInvoice$/))) {
        const o = inv.find(x => x.id === mm[1]); if (!o || o.status !== "200") return send(400, { error: { message: "Nur offene Rechnungen" } });
        const id = String(9500 + (++n)), sr = Object.assign({}, o, { id, invoiceNumber: "RE-S" + n, invoiceType: "SR", status: "1000", origin: { id: o.id, objectName: "Invoice" }, sumNet: String(-o.sumNet), sumTax: String(-o.sumTax), sumGross: String(-o.sumGross), paidAmount: String(-o.sumGross), invoiceDate: ts(viennaToday()) });
        inv.push(sr); o.status = "1000"; return send(201, { objects: sr });   // wie sevDesk: am Original kein „cancelled“
      }
      if (m === "GET" && p === "/Contact") return send(200, { objects: page(contacts, q) });
      if (m === "GET" && (mm = p.match(/^\/Contact\/(\d+)$/))) { const c = ct(mm[1]); return send(200, { objects: c ? [c] : [] }); }
      if (m === "POST" && p === "/Contact") { const c = { id: String(30 + contacts.length), objectName: "Contact", name: json.name }; contacts.push(c); return send(201, { objects: c }); }
      if (m === "GET" && p === "/StaticCountry") return send(200, { objects: [{ id: "3", code: "at", name: "Österreich" }] });
      if (m === "GET" && p === "/CheckAccountTransaction") return send(200, { objects: page(filt(tx, q), q) });
      if (m === "GET" && p === "/Voucher") return send(200, { objects: page(filt(vou, q), q) });
      if (m === "GET" && p === "/SevSequence/Factory/getByType") return send(400, { error: { message: "nope" } });
      if (m === "POST" && p === "/Order/Factory/saveOrder") return send(201, { objects: { order: { id: "9901", objectName: "Order", orderNumber: json.order.orderNumber, sumGross: "120" } } });
      if (m === "POST") return send(201, { objects: { id: "1" } });
      return send(200, { objects: [] });
    });
  });
  return { server, inv, log, valueroMonths };
}

// ── Teil 1: Rechenkern direkt (Export nur unter NODE_ENV=test) ──
function unitTests(T) {
  const { invLink, sumState, abgleichBuild, sevSummary } = T;
  const Y = "2026", TODAY = "2026-06-15";
  const I = (o) => Object.assign({ type: "RE", status: 1000, date: "2026-01-10", due: "2026-01-24", contact: "Kunde", contactId: "1", ref: "", net: 100, gross: 120, paid: 120, open: 0, cancelled: false, overdue: false }, o);
  const mkSev = (all) => { const s = { invoices: all.slice(0, 600).concat(all.slice(600).filter(i => [100, 200, 750].indexOf(i.status) > -1)) }; Object.defineProperty(s, "invoicesAll", { value: all, enumerable: false }); return s; };
  const sitesSnap = { railway: { projects: [] }, sites: [{ name: "kunde-test.at", up: true, requests7d: 0 }] };
  const prices = { hosting: 10, hostingPer: "month", period: 12, taxRate: 20, gross: true, hostingLabel: "Hosting" };
  const site = (recs, billedUntil, invs) => abgleichBuild({ year: Y, today: TODAY, sev: mkSev(invs), bill: { prices, sites: { "cf:kunde-test.at": { active: true, hosting: true, billedUntil } }, invoices: { "site:cf:kunde-test.at": recs } }, sitesSnap }).items.find(x => x.key === "site:cf:kunde-test.at");
  const out = [];
  out.push(["invLink: storniert → paid 0, open 0, Label mit Stornonummer; sumState überspringt", () => {
    const by = { "5": I({ id: "5", nr: "RE-5", cancelled: true, stornoNr: "RE-6", paid: 120 }) };
    const l = invLink({ id: "5", nr: "RE-5", date: "2026-01-10", gross: 120 }, by, "");
    assert.strictEqual(l.state, "storniert"); assert.strictEqual(l.label, "storniert (RE-6)"); assert.strictEqual(l.paid, 0); assert.strictEqual(l.open, 0);
    const s = sumState([l, invLink({ id: "7", gross: 50, date: "2026-01-10" }, { "7": I({ id: "7", gross: 50, paid: 50 }) }, "")]);
    assert.deepStrictEqual(s, { invoiced: 50, paid: 50, open: 0, gross: 50, credited: 0 });   // gross/credited: Vergleich ohne Gutschriften (A3)
  }]);
  const rec = { id: "101", nr: "RE-101", date: "2026-01-10", gross: 120, from: "2026-01-01", to: "2026-12-31", label: "kunde-test.at" };
  out.push(["Website: Rechnung des Zeitraums storniert → wieder zu verrechnen (ab Zeitraumbeginn), nicht bezahlt", () => {
    const it = site([rec], "2026-12-31", [I({ id: "101", nr: "RE-101", cancelled: true, stornoNr: "RE-102" })]);
    assert.strictEqual(it.last.state, "storniert"); assert.strictEqual(it.last.label, "storniert (RE-102)");
    assert.strictEqual(it.unbilled, 120); assert.strictEqual(it.paid, 0); assert.strictEqual(it.invoiced, 0); assert.strictEqual(it.open, 0);
    assert.strictEqual(it.billedUntil, "2025-12-31"); assert.ok(/storniert – wieder zu verrechnen/.test(it.sub), it.sub);
    assert.ok(it.action && it.action.after.billing.from === "2026-01-01" && it.action.after.billing.to === "2026-12-31", JSON.stringify(it.action && it.action.after));
  }]);
  out.push(["Website: nicht storniert → bleibt verrechnet (unverändert)", () => {
    const it = site([rec], "2026-12-31", [I({ id: "101", nr: "RE-101" })]);
    assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.paid, 120); assert.strictEqual(it.last.state, "bezahlt"); assert.ok(/verrechnet bis 31\.12\.2026/.test(it.sub));
  }]);
  out.push(["Website: Storno ohne Zeitraumbeginn → letzter gültiger Zeitraum zählt; ohne andere Einträge sofort fällig", () => {
    const a = { id: "103", nr: "RE-103", date: "2025-01-05", gross: 120, from: "2025-01-01", to: "2025-12-31" }, b = { id: "104", nr: "RE-104", date: "2026-01-05", gross: 120, to: "2026-12-31" };
    const it = site([a, b], "2026-12-31", [I({ id: "103", date: "2025-01-05" }), I({ id: "104", cancelled: true })]);
    assert.strictEqual(it.billedUntil, "2025-12-31"); assert.strictEqual(it.unbilled, 120); assert.strictEqual(it.action.after.billing.from, "2026-01-01");
    const it2 = site([b], "2026-12-31", [I({ id: "104", cancelled: true })]);
    assert.strictEqual(it2.billedUntil, null); assert.strictEqual(it2.unbilled, 120, "sofort fällig, nicht erst im Jänner"); assert.ok(/storniert – wieder zu verrechnen/.test(it2.sub));
  }]);
  out.push(["Website: von Hand geändertes „verrechnet bis“ bleibt maßgeblich; Ersatzrechnung mit gleichem Zeitraum deckt ab", () => {
    const it = site([rec], "2026-06-30", [I({ id: "101", cancelled: true })]);
    assert.strictEqual(it.billedUntil, "2026-06-30"); assert.strictEqual(it.unbilled, 0);
    const neu = Object.assign({}, rec, { id: "105", nr: "RE-105", date: "2026-02-01" });
    const it2 = site([rec, neu], "2026-12-31", [I({ id: "101", cancelled: true }), I({ id: "105", nr: "RE-105", status: 200, paid: 0, open: 120 })]);
    assert.strictEqual(it2.unbilled, 0); assert.strictEqual(it2.invoiced, 120, "Storno zählt nicht"); assert.strictEqual(it2.open, 120);
  }]);
  const va = { objects: [{ key: "haus", name: "Haus", ratesLabel: "5 % Website", months: [{ month: "2026-01", provisionCents: 10000 }, { month: "2026-02", provisionCents: 5000 }] }] };
  const vaItem = (recs, invs) => abgleichBuild({ year: Y, today: TODAY, sev: mkSev(invs), bill: { prices: {}, sites: {}, invoices: { "valuero:haus": recs } }, sitesSnap: null, valuero: va, valueroPrev: { objects: [] } }).items.find(x => x.key === "valuero:haus");
  const vrec = { id: "201", nr: "RE-201", date: "2026-04-02", gross: 150, from: "2026-01-01", to: "2026-03-31" };
  out.push(["VALUERO: storniert → Quartal wieder offen, invoiced/invoicedYear ohne Storno, last storniert", () => {
    const it = vaItem([vrec], [I({ id: "201", nr: "RE-201", date: "2026-04-02", gross: 150, paid: 150, cancelled: true, stornoNr: "RE-202" })]);
    assert.strictEqual(it.last.state, "storniert"); assert.strictEqual(it.unbilled, 150); assert.strictEqual(it.invoiced, 0); assert.strictEqual(it.invoicedYear, 0); assert.strictEqual(it.paid, 0);
    assert.ok(it.action && it.action.items[0].priceGross === 150); assert.strictEqual(it.billedUntil, null);
  }]);
  out.push(["VALUERO: gültig → verrechnet; invoicedYear nur Einträge im gewählten Jahr", () => {
    const old = { id: "199", nr: "RE-199", date: "2025-12-20", gross: 30, from: "2025-10-01", to: "2025-12-31" };
    const it = vaItem([old, vrec], [I({ id: "199", date: "2025-12-20", gross: 30, paid: 30 }), I({ id: "201", date: "2026-04-02", gross: 150, paid: 150 })]);
    assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.invoiced, 180); assert.strictEqual(it.invoicedYear, 150); assert.strictEqual(it.paid, 180); assert.strictEqual(it.billedUntil, "2026-03-31");
  }]);
  const bk = (o) => Object.assign({ totalCents: 30000, status: "CONFIRMED", paymentStatus: "UNPAID", eventDate: "2026-06-20", customerEmail: "kunde@test.at", package: { name: "Mini" } }, o);
  const blitz = (books, invs, recs) => abgleichBuild({ year: Y, today: TODAY, sev: mkSev(invs), bill: { prices: {}, sites: {}, invoices: recs || {} }, sitesSnap: null, blitzAll: books }).items;
  out.push(["Blitzdings: stornierte Rechnung → nicht verrechnet, Aktion gesetzt, Storno bleibt in der Historie; Ersatzrechnung zählt", () => {
    let it = blitz([bk({ id: "b1", reference: "BD-1001", customerName: "Max Muster", sevdeskInvoiceId: "301" })], [I({ id: "301", nr: "RE-301", gross: 300, paid: 300, cancelled: true, stornoNr: "RE-302", contact: "Max Muster" })]).find(x => x.key === "blitz:b1");
    assert.strictEqual(it.unbilled, 300); assert.ok(it.action); assert.strictEqual(it.invoices[0].state, "storniert"); assert.strictEqual(it.invoiced, 0); assert.strictEqual(it.paid, 0);
    it = blitz([bk({ id: "b1", reference: "BD-1001", customerName: "Max Muster", sevdeskInvoiceId: "301" })], [I({ id: "301", gross: 300, cancelled: true, contact: "Max Muster" }), I({ id: "303", nr: "RE-303", gross: 300, paid: 0, open: 300, status: 200, ref: "Buchung BD-1001 – danke", contact: "Max Muster" })]).find(x => x.key === "blitz:b1");
    assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.last.id, "303"); assert.strictEqual(it.action, null);
    it = blitz([bk({ id: "b2", reference: "BD-1002", customerName: "Erika Beispiel" })], [I({ id: "304", gross: 300, cancelled: true, ref: "Buchung BD-1002", contact: "Erika Beispiel" })]).find(x => x.key === "blitz:b2");
    assert.strictEqual(it.unbilled, 300, "Referenz-Treffer nur auf nicht stornierte Rechnungen"); assert.ok(it.action);
  }]);
  out.push(["Blitzdings: Anzahlung (deposit) → Rest bleibt offen, depositOnly, keine Aktion; ohne deposit: Differenz nachverrechnen (BD-7)", () => {
    const invs = [I({ id: "305", nr: "RE-305", date: "2026-05-01", gross: 200, paid: 200, contact: "Anna Anzahlung" })];
    let it = blitz([bk({ id: "b3", reference: "BD-1003", customerName: "Anna Anzahlung", totalCents: 40000 })], invs, { "blitz:b3": [{ id: "305", nr: "RE-305", date: "2026-05-01", gross: 200, deposit: true }] }).find(x => x.key === "blitz:b3");
    assert.strictEqual(it.depositOnly, true); assert.strictEqual(it.invoiced, 200); assert.strictEqual(it.unbilled, 200); assert.strictEqual(it.paid, 200); assert.strictEqual(it.action, null);
    it = blitz([bk({ id: "b3", reference: "BD-1003", customerName: "Anna Anzahlung", totalCents: 40000 })], invs, { "blitz:b3": [{ id: "305", nr: "RE-305", date: "2026-05-01", gross: 200 }] }).find(x => x.key === "blitz:b3");
    // Review B6: Rechnung von Hand bzw. Zuordnung mit niedrigerem Betrag (z. B. Rabatt) → nur Hinweis, nichts „zu verrechnen“, keine Aktion
    assert.strictEqual(it.depositOnly, undefined); assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.action, null); assert.ok(it.notes.some(n => n.lvl === "info" && /niedriger als die Buchung/.test(n.text)), JSON.stringify(it.notes));
    // BD-7: Buchung nach der Rechnung geändert (updatedAt) → Betrag geändert, die Differenz ist zu verrechnen
    it = blitz([bk({ id: "b3", reference: "BD-1003", customerName: "Anna Anzahlung", totalCents: 40000, updatedAt: "2026-05-20T10:00:00.000Z" })], invs, { "blitz:b3": [{ id: "305", nr: "RE-305", date: "2026-05-01", gross: 200 }] }).find(x => x.key === "blitz:b3");
    assert.strictEqual(it.unbilled, 200); assert.ok(it.action && it.action.items[0].priceGross === 200 && /Differenz/.test(it.action.items[0].name), JSON.stringify(it.action));
  }]);
  out.push(["Abgleich: Nachschlagen per ID in allen Rechnungen; eine ausdrücklich zugeordnete Rechnung (sevdeskInvoiceId) zählt nicht über den Kopftext für eine andere Buchung", () => {
    const all = []; for (let i = 0; i < 600; i++) all.push(I({ id: String(1000 + i), date: addDays("2026-01-01", Math.floor(i / 10)), contact: "Sonstige" }));
    all.push(I({ id: "999", nr: "RE-999", date: "2024-01-01", status: 200, paid: 0, open: 300, gross: 300, ref: "Buchung BD-2001", contact: "Fritz Alt" }));
    const items = blitz([bk({ id: "b5", reference: "BD-2001", customerName: "Fritz Alt" }), bk({ id: "b6", reference: "BD-2002", customerName: "Otto Neu", sevdeskInvoiceId: "999" })], all);
    assert.strictEqual(items.find(x => x.key === "blitz:b5").unbilled, 300, "alte Rechnung nicht per Referenz-Heuristik");
    const b6 = items.find(x => x.key === "blitz:b6"); assert.strictEqual(b6.last.state, "offen"); assert.strictEqual(b6.unbilled, 0);
  }]);
  out.push(["sevSummary: Zähler aus der vollständigen Liste, Druck-Entwürfe getrennt, invoicesAll nie im JSON", () => {
    const all = []; for (let i = 0; i < 605; i++) all.push(I({ id: String(2000 + i), date: addDays("2026-06-01", -i) }));
    all.push(I({ id: "1990", date: "2024-01-01", status: 200, paid: 0, open: 80, gross: 80, overdue: true }));
    all.push(I({ id: "1991", date: "2024-01-02", status: 100, paid: 0, src: "print", printId: "o1", printNr: "D-1" }), I({ id: "1992", date: "2024-01-03", status: 100, paid: 0 }));
    const sev = mkSev(all); sev.reminderDrafts = [{ id: "m1", invoiceId: "1990", invoiceNr: "", contact: "X", level: 1, fee: 5, date: "2024-02-01" }]; sev.unassigned = 2; sev.vouchers = { drafts: 3 };
    const s = sevSummary(sev, Y, TODAY);
    assert.strictEqual(s.openCount, 1); assert.strictEqual(s.openSum, 80); assert.strictEqual(s.overdueCount, 1); assert.strictEqual(s.drafts, 1); assert.strictEqual(s.printDrafts, 1);
    assert.strictEqual(s.invoices.length, 603); assert.strictEqual(s.reminderDrafts.length, 1); assert.strictEqual(s.unassigned, 2);
    assert.ok(!/invoicesAll/.test(JSON.stringify(s))); assert.ok(!/invoicesAll/.test(JSON.stringify(sev)), "nicht aufzählbar");
    assert.strictEqual(s.revenueYear, r2(all.filter(i => i.date.slice(0, 4) === Y && i.status >= 200).reduce((a, i) => a + i.gross, 0)));
  }]);
  return out;
}

(async () => {
  // Teil 1: Rechenkern in einer Temp-Kopie laden (schreibt nur dort)
  const udir = copyApp();
  Object.keys(process.env).forEach(k => { if (STRIP.test(k)) delete process.env[k]; });
  Object.assign(process.env, { NODE_ENV: "test", ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x", PORT: "0" });
  let T = null; try { T = require(path.join(udir, "server.js"))._test; } catch (e) { fails.push("server.js laden\n    " + (e && e.stack || e)); fail++; }
  if (T) for (const [name, fn] of unitTests(T)) await t(name, fn);
  else await t("Test-Export server.js _test (NODE_ENV=test) vorhanden", async () => { assert.fail("module.exports._test fehlt"); });

  // Teil 2: Server mit sevDesk-Attrappe (Ende-zu-Ende über HTTP)
  const M = createMock(), mport = await listen(M.server), mb = "http://127.0.0.1:" + mport;
  const today = viennaToday(), year = today.slice(0, 4);
  // VALUERO: Provision im ersten Monat des zuletzt abgeschlossenen Quartals
  const qEnd = d => { const y = +d.slice(0, 4), qq = Math.floor((+d.slice(5, 7) - 1) / 3); return qq === 0 ? (y - 1) + "-12-31" : y + "-" + String(qq * 3).padStart(2, "0") + "-" + (qq === 2 || qq === 3 ? "30" : "31"); };
  const dueThrough = qEnd(today), vMonth = dueThrough.slice(0, 5) + String(+dueThrough.slice(5, 7) - 2).padStart(2, "0");
  M.valueroMonths.push({ month: vMonth, provisionCents: 7500, bookings: 2 });
  const dir = copyApp();
  const port = 5300 + Math.floor(Math.random() * 500);
  const env = Object.assign({}, process.env);
  Object.keys(env).forEach(k => { if (STRIP.test(k)) delete env[k]; });
  Object.assign(env, { NODE_ENV: "test", PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x", SEVDESK_API_KEY: KEY, SEVDESK_API_BASE: mb + "/api/v1",
    VALUERO_PARTNER_STATS_URL: mb + "/valuero", VALUERO_PARTNER_STATS_TOKEN: "vt", WEATHER_URL: mb + "/wx", FX_URL: mb + "/fx", VIES_URL: mb + "/vies" });
  const srv = cp.spawn(process.execPath, ["server.js"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
  let srvOut = ""; srv.stdout.on("data", d => (srvOut += d)); srv.stderr.on("data", d => (srvOut += d));
  const base = "http://127.0.0.1:" + port, seen = [];
  for (let i = 0; i < 80; i++) { try { await fetch(base + "/admin/login"); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
  const api = async (p, body) => { const r = await fetch(base + p, body ? { method: "POST", headers: { cookie: COOKIE, "content-type": "application/json" }, body: JSON.stringify(body) } : { headers: { cookie: COOKIE } });
    const txt = await r.text(); seen.push(txt); let j = null; try { j = JSON.parse(txt); } catch (e) {} return { status: r.status, j }; };
  const fresh = async () => { await api("/admin/api/sevdesk?force=1"); return (await api("/admin/api/cockpit?force=1&year=" + year)).j; };
  const vItem = d => ((d && d.abgleich && d.abgleich.items) || []).find(x => x.key === "valuero:haus-test");

  let snap;
  await t("Schnappschuss: neueste 600 + alle offenen/Entwürfe, Zähler aus vollständigen Listen", async () => {
    const r = await api("/admin/api/sevdesk?force=1"); snap = r.j;
    assert.strictEqual(r.status, 200); assert.ok(snap && Array.isArray(snap.invoices), JSON.stringify(r.j).slice(0, 300));
    assert.strictEqual(snap.invoices.length, 602, "600 + alte offene + alter Entwurf");
    assert.ok(snap.invoices.some(i => i.id === "4700" && i.open === 500), "alte offene Rechnung dabei"); assert.ok(snap.invoices.some(i => i.id === "4701" && i.status === 100));
    assert.ok(!snap.invoices.some(i => i.type === "MA"), "Mahnungen nicht in der Rechnungsliste");
    const gu = snap.invoices.find(i => i.id === "4703"); assert.ok(gu && gu.cancelled && gu.stornoNr === "GU-1", "Storno per Gutschrift mit Gutschrift-Nr.");
    assert.strictEqual(snap.unassigned, 2, "alle Umsätze im Status 100 ohne Connect-Provision"); assert.strictEqual(snap.vouchers.drafts, 2);
    assert.ok(snap.invoices.every(i => typeof i.over === "number" && (i.src === "" || i.src === "print")));
    assert.ok(M.log.some(l => l.p === "/Invoice" && l.q.offset === "1000"), "Rechnungen seitenweise vollständig geladen (über 1000)");
  });
  await t("Mahnungs-Entwürfe (reminderDrafts) mit Rechnung, Stufe und Gebühr", async () => {
    assert.deepStrictEqual(snap.reminderDrafts.map(x => [x.id, x.invoiceId, x.invoiceNr, x.contact, x.level, x.fee, x.date]), [["4800", "4700", "RE-OLD", "Alte Firma GmbH", 1, 5, "2024-05-01"]]);
  });
  let d0;
  await t("Cockpit: offen/überfällig aus allen Rechnungen, Druck-Entwürfe getrennt, invoicesAll nie gesendet", async () => {
    d0 = (await api("/admin/api/cockpit?force=1&year=" + year)).j;
    assert.ok(d0 && d0.sev, "sev im Cockpit"); assert.strictEqual(d0.sev.openCount, 1); assert.strictEqual(d0.sev.openSum, 500); assert.strictEqual(d0.sev.drafts, 1); assert.strictEqual(d0.sev.printDrafts, 0);
    assert.strictEqual(d0.sev.reminderDrafts.length, 1); assert.strictEqual(d0.sev.invoices.length, 602);
  });
  await t("VALUERO: neues Haus ohne Abrechnungsbeginn → kein Verrechnen, Ein-Klick „Abrechnungsbeginn festlegen“ (VA-7)", async () => {
    const it = vItem(d0); assert.ok(it, "VALUERO-Posten da"); assert.strictEqual(it.unbilled, 0); assert.strictEqual(it.action, null); assert.ok(/Abrechnungsbeginn/.test(it.blocked || ""), it.blocked);
    assert.strictEqual(it.proposal && it.proposal.op, "vastart");
    const r = await api("/admin/api/billing", { op: "vastart", key: "haus-test", start: vMonth + "-01" }); assert.strictEqual(r.j.ok, true, JSON.stringify(r.j));
    assert.strictEqual((await api("/admin/api/billing", { op: "vastart", key: "haus-test", start: "2026-13" })).j.ok, false, "nur JJJJ-MM-01");
    d0 = (await api("/admin/api/cockpit?force=1&year=" + year)).j;
  });
  let created;
  await t("VALUERO: Quartal offen → Rechnung (contactId in der Antwort) → verrechnet, invoicedYear", async () => {
    const it = vItem(d0); assert.ok(it, "VALUERO-Posten da"); assert.strictEqual(it.unbilled, 75); assert.ok(it.action);
    const a = it.action, r = await api("/admin/api/sevdesk/invoice", { contactName: a.contactName, deliveryDate: a.deliveryDate, headText: a.headText, items: a.items });
    assert.strictEqual(r.j.ok, true, JSON.stringify(r.j)); assert.strictEqual(r.j.contactId, "22"); created = r.j;
    const b = await api("/admin/api/billing", { op: "invoice", key: a.after.billing.key, invoice: { id: r.j.id, nr: r.j.nr, date: today, gross: r.j.gross, from: a.after.billing.from, to: a.after.billing.to, label: a.after.billing.label } });
    assert.strictEqual(b.j.ok, true);
    const s = await api("/admin/api/sev/invoice-op", { confirm: true, op: "send", id: r.j.id, toEmail: "haus@test.at", subject: "Rechnung", text: "Hallo" }); assert.strictEqual(s.j.ok, true, JSON.stringify(s.j));
    const d = await fresh(), v = vItem(d);
    assert.strictEqual(v.unbilled, 0); assert.strictEqual(v.invoiced, 75); assert.strictEqual(v.invoicedYear, 75); assert.strictEqual(v.last.state, "offen"); assert.strictEqual(v.open, 75);
  });
  await t("VALUERO: Storno → last „storniert“, wieder zu verrechnen, paid/invoiced ohne Storno", async () => {
    const c = await api("/admin/api/sev/invoice-op", { confirm: true, op: "cancel", id: created.id }); assert.strictEqual(c.j.ok, true, JSON.stringify(c.j));
    let v; for (let i = 0; i < 5; i++) { v = vItem(await fresh()); if (v && v.last && v.last.state === "storniert") break; }
    assert.strictEqual(v.last.state, "storniert"); assert.ok(/^storniert \(RE-S\d+\)$/.test(v.last.label), v.last.label);
    assert.strictEqual(v.unbilled, 75); assert.ok(v.unbilled > 0); assert.strictEqual(v.paid, 0); assert.strictEqual(v.invoiced, 0); assert.strictEqual(v.invoicedYear, 0); assert.strictEqual(v.open, 0);
    assert.ok(v.action, "Verrechnen wieder möglich"); assert.ok(v.invoices.some(l => l.id === created.id && l.state === "storniert"), "Storno bleibt in der Historie");
  });
  await t("Rechnungsdetail: cancelled + stornoNr (über SR), b2b (Firma/privat)", async () => {
    const r = await api("/admin/api/sev/invoice?id=" + created.id);
    assert.strictEqual(r.j.ok, true, JSON.stringify(r.j)); assert.strictEqual(r.j.cancelled, true); assert.ok(/^RE-S\d+$/.test(r.j.stornoNr), r.j.stornoNr); assert.strictEqual(r.j.b2b, true);
    const g = await api("/admin/api/sev/invoice?id=4703"); assert.strictEqual(g.j.cancelled, true); assert.strictEqual(g.j.stornoNr, "GU-1");
    const o = await api("/admin/api/sev/invoice?id=4700"); assert.strictEqual(o.j.cancelled, false); assert.strictEqual(o.j.stornoNr, ""); assert.strictEqual(o.j.b2b, true);
    M.inv.push({ id: "4702", objectName: "Invoice", invoiceNumber: "RE-P", invoiceType: "RE", status: "200", invoiceDate: "2026-01-01T00:00:00+01:00", sumGross: "10", sumNet: "8.33", sumTax: "1.67", paidAmount: "0", contact: { id: "23", objectName: "Contact" } });
    assert.strictEqual((await api("/admin/api/sev/invoice?id=4702")).j.b2b, false, "Privatperson");
  });
  await t("Angebot anlegen: contactId in der Antwort", async () => {
    const r = await api("/admin/api/sevdesk/offer", { contactName: "Haus Test", orderNumber: "AN-777", items: [{ name: "Website", qty: 1, priceGross: 120, taxRate: 20 }] });
    assert.strictEqual(r.j.ok, true, JSON.stringify(r.j)); assert.strictEqual(r.j.contactId, "22"); assert.strictEqual(r.j.nr, "AN-777");
  });
  await t("Lead: contactId setzen, lösen, ungültig abgewiesen", async () => {
    const c = await api("/admin/api/leads", { op: "create", name: "Lea Lead", email: "lea@test.at" }); assert.strictEqual(c.j.ok, true); const id = c.j.leads[0].id;
    let u = await api("/admin/api/leads", { op: "update", id, patch: { contactId: "22" } }); assert.strictEqual(u.j.leads.find(l => l.id === id).contactId, "22");
    u = await api("/admin/api/leads", { op: "update", id, patch: { contactId: "abc" } }); assert.strictEqual(u.j.ok, false);
    u = await api("/admin/api/leads", { op: "update", id, patch: { notes: "x" } }); assert.strictEqual(u.j.leads.find(l => l.id === id).contactId, "22", "ohne Feld bleibt er");
    u = await api("/admin/api/leads", { op: "update", id, patch: { contactId: "" } }); assert.ok(!("contactId" in u.j.leads.find(l => l.id === id)));
  });
  await t("Auftrag: contactId, project.link/unlink (ohne Duplikate), ungültige Belege abgewiesen", async () => {
    const s = await api("/admin/api/auftraege", { op: "project.save", project: { name: "Website Haus Test", contactId: "22" } }); assert.strictEqual(s.j.ok, true, JSON.stringify(s.j));
    const pid = s.j.id, P = j => j.data.projects.find(p => p.id === pid);
    assert.strictEqual(P(s.j).contactId, "22");
    let r = await api("/admin/api/auftraege", { op: "project.save", project: { id: pid, name: "Website Haus Test", note: "neu" } }); assert.strictEqual(P(r.j).contactId, "22", "ohne Feld bleibt er");
    r = await api("/admin/api/auftraege", { op: "project.link", id: pid, kind: "invoice", docId: created.id, nr: created.nr });
    r = await api("/admin/api/auftraege", { op: "project.link", id: pid, kind: "invoice", docId: created.id, nr: created.nr });
    r = await api("/admin/api/auftraege", { op: "project.link", id: pid, kind: "offer", docId: "9901", nr: "AN-777" });
    assert.strictEqual(r.j.ok, true); const docs = P(r.j).docs; assert.strictEqual(docs.length, 2); assert.ok(docs.every(d => d.at > 0 && /^\d+$/.test(d.docId)));
    assert.strictEqual(docs.find(d => d.kind === "invoice").nr, created.nr);
    r = await api("/admin/api/auftraege", { op: "project.unlink", id: pid, kind: "invoice", docId: created.id }); assert.deepStrictEqual(P(r.j).docs.map(d => d.kind), ["offer"]);
    assert.strictEqual((await api("/admin/api/auftraege", { op: "project.link", id: pid, kind: "invoice", docId: "12a" })).status, 400);
    assert.strictEqual((await api("/admin/api/auftraege", { op: "project.link", id: pid, kind: "bill", docId: "12" })).status, 400);
    assert.strictEqual((await api("/admin/api/auftraege", { op: "project.link", id: "gibtsnicht", kind: "offer", docId: "12" })).status, 400);
    r = await api("/admin/api/auftraege", { op: "project.save", project: { id: pid, name: "Website Haus Test", contactId: "" } }); assert.ok(!("contactId" in P(r.j)));
  });
  await t("Keine Antwort enthält invoicesAll", async () => {
    await api("/admin/api/sevdesk"); await api("/admin/api/cockpit?year=" + year); await api("/admin/api/sev/bank"); await api("/admin/api/sev/contacts");
    assert.ok(seen.length > 10); assert.ok(seen.every(x => x.indexOf("invoicesAll") < 0));
  });

  srv.kill(); M.server.close();
  try { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(udir, { recursive: true, force: true }); } catch (e) {}
  console.log("Abgleich & Storno: " + pass + " bestanden, " + fail + " fehlgeschlagen");
  if (fail) { console.log(fails.map(f => "✗ " + f).join("\n")); console.log(srvOut.slice(-1500)); }
  process.exit(fail ? 1 : 0);
})();
