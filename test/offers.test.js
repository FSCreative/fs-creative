/* sevDesk-Angebote im Cockpit (/admin/api/sevdesk/offers, offer-pdf, offer, offer-status, offer-invoice) gegen einen lokalen sevDesk-Mock.
   Aufruf: node test/offers.test.js   (keine Abhängigkeiten; server.js läuft in einer Temp-Kopie, die echte sevDesk-API wird nie angesprochen)
   Optional: OFFERS_BROWSER=1 → zusätzlich Rauchtest „Kunden & Leads“ im Browser (playwright-core + installiertes Chrome nötig). */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto");
const createSevMock = require("./sevdesk-mock.js");

const ROOT = path.join(__dirname, "..");
const SECRET = "test-secret";
const COOKIE_VAL = encodeURIComponent("ok." + crypto.createHmac("sha256", SECRET).update("ok").digest("hex"));
const COOKIE = "fsadmin=" + COOKIE_VAL;
const KEY = "sev-test-key";

let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }

function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-offers-"));
  ["server.js", "ki.js", "admin-cockpit.html"].forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  ["admin-cockpit"].forEach((d) => { fs.mkdirSync(path.join(dir, d)); fs.readdirSync(path.join(ROOT, d)).forEach((f) => fs.copyFileSync(path.join(ROOT, d, f), path.join(dir, d, f))); });
  return dir;
}
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const iso = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

(async () => {
  const mock = createSevMock({ key: KEY });
  const mport = await listen(mock.server);
  const dir = copyApp();
  const port = 4900 + Math.floor(Math.random() * 300);
  const env = Object.assign({}, process.env, { PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x",
    SEVDESK_API_KEY: KEY, SEVDESK_API_BASE: "http://127.0.0.1:" + mport + "/api/v1" });
  ["BLITZDINGS_STATS_URL", "BLITZDINGS_STATS_TOKEN", "BLITZDINGS_COCKPIT_URL", "BLITZDINGS_COCKPIT_TOKEN", "RAILWAY_API_TOKEN", "CF_API_TOKEN", "MAIL_API_URL", "ANTHROPIC_API_KEY"].forEach((k) => delete env[k]);
  const srv = cp.spawn(process.execPath, ["server.js"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
  let srvOut = ""; srv.stdout.on("data", (d) => (srvOut += d)); srv.stderr.on("data", (d) => (srvOut += d));
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 50; i++) { try { await fetch(base + "/admin/login"); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  const api = (p, o) => fetch(base + p, Object.assign({ redirect: "manual", headers: Object.assign({ cookie: COOKIE }, o && o.body ? { "content-type": "application/json" } : {}) }, o || {}, o && o.body ? { body: JSON.stringify(o.body) } : {}));
  const json = async (p, o) => { const r = await api(p, o); return { status: r.status, j: await r.json().catch(() => null) }; };
  const post = (p, body) => json(p, { method: "POST", body });

  await t("ohne Login → Weiterleitung, kein sevDesk-Aufruf", async () => {
    const r = await fetch(base + "/admin/api/sevdesk/offers", { redirect: "manual" });
    assert.strictEqual(r.status, 302);
    const w = await fetch(base + "/admin/api/sevdesk/offer", { method: "POST", redirect: "manual", body: "{}" });
    assert.strictEqual(w.status, 302);
    assert.strictEqual(mock.state.log.filter((l) => /Order/.test(l.path)).length, 0);
  });
  let list;
  await t("Liste: nur Angebote (AN), Status, Summen, Positionen, gültig bis, abgelaufen", async () => {
    const r = await json("/admin/api/sevdesk/offers");
    assert.strictEqual(r.status, 200); assert.strictEqual(r.j.ok, true, JSON.stringify(r.j)); list = r.j.offers;
    assert.deepStrictEqual(list.map((o) => o.nr).sort(), ["AN-1001", "AN-1002", "AN-1003", "AN-1004"]);
    const q = mock.state.log.find((l) => l.path === "/Order"); assert.strictEqual(q.query.orderType, "AN"); assert.strictEqual(q.query.embed, "contact"); assert.ok(+q.query.startDate > 0);
    assert.strictEqual(q.auth, KEY);
    const a = list.find((o) => o.nr === "AN-1001");
    assert.strictEqual(a.status, 200); assert.strictEqual(a.contact, "Bäckerei Lerch"); assert.strictEqual(a.gross, 2400); assert.strictEqual(a.net, 2000);
    assert.strictEqual(a.validUntil, iso(20)); assert.strictEqual(a.validEst, false); assert.strictEqual(a.overdue, false);
    assert.strictEqual(a.posCount, 2); assert.strictEqual(a.lines[0].name, "Website-Relaunch"); assert.strictEqual(a.lines[1].net, 200);
    const b = list.find((o) => o.nr === "AN-1002");   // Datum als Unix-Zeitstempel, ohne Gültigkeitstext → Datum + 30 Tage (geschätzt), abgelaufen
    assert.strictEqual(b.date, iso(-60)); assert.strictEqual(b.validUntil, iso(-30)); assert.strictEqual(b.validEst, true); assert.strictEqual(b.overdue, true);
    assert.strictEqual(list.find((o) => o.nr === "AN-1003").overdue, false, "angenommen ist nie abgelaufen");
    assert.strictEqual(list[0].nr, "AN-1001", "neueste zuerst");
  });
  await t("Liste wird kurz zwischengespeichert, force=1 lädt neu", async () => {
    const n0 = mock.state.log.filter((l) => l.path === "/Order").length;
    await json("/admin/api/sevdesk/offers"); assert.strictEqual(mock.state.log.filter((l) => l.path === "/Order").length, n0);
    await json("/admin/api/sevdesk/offers?force=1"); assert.strictEqual(mock.state.log.filter((l) => l.path === "/Order").length, n0 + 1);
  });
  await t("PDF-Proxy: inline application/pdf mit Angebotsnummer", async () => {
    const r = await api("/admin/api/sevdesk/offer-pdf?id=501");
    assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get("content-type"), "application/pdf");
    assert.ok(/^inline; filename="AN-501\.pdf"/.test(r.headers.get("content-disposition")), r.headers.get("content-disposition"));
    assert.ok((await r.text()).startsWith("%PDF-1.4 Angebot 501"));
    const l = mock.state.log.filter((x) => /getPdf/.test(x.path)).pop(); assert.strictEqual(l.path, "/Order/501/getPdf"); assert.strictEqual(l.query.preventSendBy, "true");
    const bad = await api("/admin/api/sevdesk/offer-pdf?id=abc"); assert.strictEqual(bad.status, 400);
  });
  await t("Rechnungs-PDF funktioniert weiter (gemeinsamer Helfer)", async () => {
    const r = await api("/admin/api/sevdesk/pdf?id=42");   // Mock: unbekannt → leere Antwort → 404
    assert.strictEqual(r.status, 404);
    assert.ok(mock.state.log.some((x) => x.path === "/Invoice/42/getPdf"));
  });
  await t("Angebot anlegen: saveOrder mit orderType AN, Status 100, Positionen netto, Kontakt, gültig bis im Fußtext", async () => {
    const r = await post("/admin/api/sevdesk/offer", { contactName: "Bäckerei Lerch", email: "info@lerch.at", address: "Bäckerei Lerch\nDorfstraße 1\n6793 Gaschurn", orderDate: iso(0), validUntil: iso(14), header: "Angebot Website", headText: "Danke für die Anfrage.",
      items: [{ name: "Website", text: "5 Seiten", qty: 1, priceGross: 2400, taxRate: 20 }, { name: "Hosting", qty: 12, priceGross: 12, taxRate: 20 }] });
    assert.strictEqual(r.j.ok, true, JSON.stringify(r.j)); assert.strictEqual(r.j.nr, "AN-1005"); assert.strictEqual(r.j.id, "901"); assert.strictEqual(r.j.validUntil, iso(14));
    const b = mock.state.saved[0], o = b.order;
    assert.strictEqual(o.objectName, "Order"); assert.strictEqual(o.orderType, "AN"); assert.strictEqual(o.status, 100); assert.strictEqual(o.version, 0);
    assert.strictEqual(o.orderNumber, "AN-1005"); assert.strictEqual(o.orderDate, iso(0).split("-").reverse().join("."));
    assert.deepStrictEqual(o.contact, { id: "11", objectName: "Contact" }, "vorhandener Kontakt per Name");
    assert.deepStrictEqual(o.addressCountry, { id: 3, objectName: "StaticCountry" });
    assert.strictEqual(o.contactPerson.objectName, "SevUser"); assert.strictEqual(o.currency, "EUR"); assert.strictEqual(o.showNet, true); assert.strictEqual(o.taxType, "default");
    assert.strictEqual(o.header, "Angebot Website"); assert.strictEqual(o.headText, "Danke für die Anfrage."); assert.ok(o.address.indexOf("Dorfstraße 1") > -1);
    assert.ok(o.footText.indexOf("gültig bis " + iso(14).split("-").reverse().join(".")) > -1, o.footText);
    assert.strictEqual(b.orderPosSave.length, 2);
    assert.deepStrictEqual(b.orderPosSave[0], { objectName: "OrderPos", mapAll: true, positionNumber: 0, quantity: 1, price: 2000, name: "Website", text: "5 Seiten", unity: { id: 1, objectName: "Unity" }, taxRate: 20 });
    assert.strictEqual(b.orderPosSave[1].price, 10); assert.strictEqual(b.orderPosSave[1].quantity, 12);
    assert.ok(!mock.state.createdContacts.length, "kein neuer Kontakt");
  });
  await t("Neues Angebot erscheint sofort in der Liste (Cache verworfen)", async () => {
    const r = await json("/admin/api/sevdesk/offers");
    const n = r.j.offers.find((o) => o.nr === "AN-1005"); assert.ok(n); assert.strictEqual(n.status, 100); assert.strictEqual(n.date, iso(0), "Datum im Format TT.MM.JJJJ"); assert.strictEqual(n.validUntil, iso(14)); assert.strictEqual(n.validEst, false);
  });
  await t("Neuer Kunde mit UID/Land, Reverse Charge-Steuerregel, Nummer ohne Nummernkreis hochgezählt", async () => {
    mock.state.sequence = false;
    const r = await post("/admin/api/sevdesk/offer", { contactName: "Muster GmbH", email: "a@muster.de", uid: "DE123456789", country: "DE", taxRule: "3", footText: "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).", items: [{ name: "Beratung", qty: 2, priceGross: 100, taxRate: 0 }] });
    assert.strictEqual(r.j.ok, true, JSON.stringify(r.j)); assert.strictEqual(r.j.nr, "AN-1006", "aus vorhandenen Nummern hochgezählt");
    const o = mock.state.saved[1].order;
    assert.strictEqual(mock.state.createdContacts[0].name, "Muster GmbH"); assert.strictEqual(mock.state.createdContacts[0].vatNumber, "DE123456789");
    assert.deepStrictEqual(o.addressCountry, { id: "1", objectName: "StaticCountry" });
    assert.deepStrictEqual(o.taxRule, { id: "3", objectName: "TaxRule" }); assert.ok(!("taxType" in o));
    assert.ok(/^Dieses Angebot ist gültig bis \d\d\.\d\d\.\d{4}\.\nSteuerschuldnerschaft/.test(o.footText), o.footText);
    assert.strictEqual(mock.state.saved[1].orderPosSave[0].price, 100);
    mock.state.sequence = true;
  });
  await t("Anlegen ohne Positionen/Kunde wird abgewiesen, nichts an sevDesk", async () => {
    const n = mock.state.saved.length;
    assert.strictEqual((await post("/admin/api/sevdesk/offer", { contactName: "X", items: [] })).j.ok, false);
    assert.strictEqual((await post("/admin/api/sevdesk/offer", { contactName: "", items: [{ name: "a", priceGross: 1 }] })).j.ok, false);
    assert.strictEqual(mock.state.saved.length, n);
  });
  await t("Status: nur mit confirm, Entwurf → versendet über sendBy, sonst PUT status", async () => {
    await json("/admin/api/sevdesk/offers?force=1");
    const n = mock.state.puts.length;
    const no = await post("/admin/api/sevdesk/offer-status", { id: "501", status: 500 }); assert.strictEqual(no.j.ok, false); assert.strictEqual(mock.state.puts.length, n);
    const bad = await post("/admin/api/sevdesk/offer-status", { id: "501", status: 1000, confirm: true }); assert.strictEqual(bad.j.ok, false);
    const a = await post("/admin/api/sevdesk/offer-status", { id: "501", status: 500, confirm: true }); assert.strictEqual(a.j.ok, true, JSON.stringify(a.j));
    assert.deepStrictEqual(mock.state.puts[n], { id: "501", body: { status: 500 } });
    await json("/admin/api/sevdesk/offers?force=1");
    const s = await post("/admin/api/sevdesk/offer-status", { id: "502", status: 200, confirm: true }); assert.strictEqual(s.j.ok, true);
    assert.deepStrictEqual(mock.state.puts[n + 1], { id: "502", sendBy: { sendType: "VPDF", sendDraft: false } });
    const r = await json("/admin/api/sevdesk/offers");
    assert.strictEqual(r.j.offers.find((o) => o.id === "501").status, 500); assert.strictEqual(r.j.offers.find((o) => o.id === "502").status, 200);
  });
  await t("In Rechnung umwandeln: createInvoiceFromOrder nur mit confirm", async () => {
    const no = await post("/admin/api/sevdesk/offer-invoice", { id: "501" }); assert.strictEqual(no.j.ok, false); assert.strictEqual(mock.state.invoicesFromOrder.length, 0);
    const r = await post("/admin/api/sevdesk/offer-invoice", { id: "501", confirm: true });
    assert.strictEqual(r.j.ok, true, JSON.stringify(r.j)); assert.strictEqual(r.j.nr, "RE-1100"); assert.strictEqual(r.j.id, "7001");
    assert.deepStrictEqual(mock.state.invoicesFromOrder[0], { order: { id: 501, objectName: "Order" } });
  });
  await t("Rechnung anlegen unverändert (saveInvoice, RE)", async () => {
    const r = await post("/admin/api/sevdesk/invoice", { contactName: "Hotel Silvretta", items: [{ name: "Logo", qty: 1, priceGross: 120, taxRate: 20 }] });
    const l = mock.state.log.filter((x) => x.path === "/Invoice/Factory/saveInvoice").pop();
    assert.ok(l, "saveInvoice aufgerufen"); assert.strictEqual(l.body.invoice.invoiceType, "RE"); assert.strictEqual(l.body.invoicePosSave[0].price, 100);
    assert.ok(!mock.state.log.some((x) => x.path === "/Order/Factory/saveOrder" && x.body && x.body.order && x.body.order.contact.id === "13"));
    assert.ok(r.status === 200);
  });

  // ---- optional: Browser-Rauchtest ----
  if (process.env.OFFERS_BROWSER === "1") {
    await t("Browser: Kunden & Leads ohne JS-Fehler, Angebote sichtbar, Dialog „Neues Angebot“ → saveOrder, Lead → Angebot", async () => {
      let pw; try { pw = require(process.env.PLAYWRIGHT_CORE || "playwright-core"); } catch (e) { throw new Error("playwright-core nicht gefunden (PLAYWRIGHT_CORE=<pfad> setzen)"); }
      const lead = await post("/admin/api/leads", { op: "create", name: "Anna Lerch", company: "Bäckerei Lerch", email: "anna@lerch.at", topic: "Website-Relaunch" });
      assert.strictEqual(lead.j.ok, true); const lid = lead.j.leads[0].id;
      const browser = await pw.chromium.launch({ channel: "chrome", headless: true });
      const errors = [];
      try {
        const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
        await ctx.addCookies([{ name: "fsadmin", value: COOKIE_VAL, url: base }]);
        const page = await ctx.newPage();
        page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
        page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
        await page.goto(base + "/admin#kunden");
        await page.waitForSelector("#offers table", { timeout: 20000 });
        const txt = await page.textContent("#offers");
        assert.ok(/AN-1005/.test(txt) && /AN-1006/.test(txt), "offene Angebote sichtbar");
        assert.ok(!/AN-1004/.test(txt), "abgelehnte nicht unter Offen");
        await page.click('[data-act="offf:rej"]'); assert.ok(/AN-1004/.test(await page.textContent("#offers")));
        await page.click('[data-act="offf:all"]'); assert.ok(/AN-1003/.test(await page.textContent("#offers")));
        assert.ok(/offene Angebote in sevDesk/.test(await page.textContent(".pipe")), "Summe in Spalte Angebot");
        // Kundenakte → Angebote + „Angebot erstellen“
        await page.click('[data-act="lead:' + lid + '"]');
        await page.waitForSelector("#drawer.on");
        assert.ok(/Angebote in sevDesk/.test(await page.textContent("#drawer")) && /AN-1005/.test(await page.textContent("#drawer")));
        await page.click('[data-act="leadoffer:' + lid + '"]');
        await page.waitForSelector('form[data-form="invoice"] input[name="valid"]');
        assert.ok(/Angebot · Bäckerei Lerch/.test(await page.textContent("#modalHost h2")));
        assert.ok(/Mit KI ausfüllen/.test(await page.textContent("#modalHost")), "KI-Helfer im Angebotsdialog");
        assert.strictEqual(await page.inputValue('#modalHost [name="contact"]'), "Bäckerei Lerch");
        assert.strictEqual(await page.inputValue('#modalHost [name="valid"]').then((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)), true);
        await page.fill('#irows [data-i="price"]', "1200");
        const n = mock.state.saved.length;
        await page.click("#invSave");
        await page.waitForFunction(() => !document.getElementById("modalHost").innerHTML, null, { timeout: 10000 });
        assert.strictEqual(mock.state.saved.length, n + 1); const o = mock.state.saved[n].order;
        assert.strictEqual(o.orderType, "AN"); assert.strictEqual(o.header, "Angebot Website-Relaunch"); assert.strictEqual(mock.state.saved[n].orderPosSave[0].price, 1000);
        const leads = await json("/admin/api/leads"); const l = leads.j.leads.find((x) => x.id === lid);
        assert.strictEqual(l.stage, "angebot"); assert.strictEqual(l.value, 1000);
        // Rechnungsdialog unverändert
        await page.click('[data-go="geld"]').catch(() => {});
        await page.evaluate(() => window.FSC.openInvoice({}));
        assert.ok(/Neue Rechnung/.test(await page.textContent("#modalHost h2"))); assert.ok(await page.$('#modalHost [name="delivery"]')); assert.ok(!(await page.$('#modalHost [name="valid"]')));
        await page.evaluate(() => window.FSC.closeModal());
        // Status-Dialog öffnet
        await page.evaluate(() => window.FSC.go("kunden")); await page.waitForSelector('[data-act="offstat:502"]');
        await page.click('[data-act="offstat:502"]'); assert.ok(/Status von AN-1002/.test(await page.textContent("#modalHost")));
        if (process.env.OFFERS_SHOT) { await page.evaluate(() => window.FSC.closeModal()); await page.screenshot({ path: process.env.OFFERS_SHOT, fullPage: true }); }
      } finally { await browser.close(); }
      assert.deepStrictEqual(errors, []);
    });
  }

  srv.kill(); mock.server.close();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  console.log(pass + " bestanden, " + fail + " fehlgeschlagen");
  if (fail) { console.log(fails.map((f) => "✗ " + f).join("\n")); console.log(srvOut.slice(-1500)); process.exit(1); }
})();
