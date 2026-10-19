/* Druckshop /print (print-shop.js) gegen Attrappen: Print.com, Mollie, VIES, Mailserver (test/print-mocks.js) und sevDesk-kompatible Buchhaltung (test/sevdesk-mock.js).
   Aufruf: node test/print.test.js   – server.js läuft in einer Temp-Kopie, echte Dienste werden nie angesprochen.
   Geprüft: Einrichtungs-Zustand ohne Schlüssel, Katalog, Preis (serverseitig, Aufschlag/Mindestmarge/USt), CSRF-Schutz, Upload-Prüfung (Größe, dpi),
   Designer-PDF (Maße inkl. Beschnitt, TrimBox, eingebettete Schriften, CMYK, Bild-dpi), Bestellung mit Mollie (Webhook prüft per Abruf),
   KEINE automatische Bestellung bei Print.com, Rechnungsentwurf, Cockpit-Freigabe → POST /orders + Rechnung senden, signierte Datei-URL,
   Rechnung für Firmen (VIES, immer 20 % USt), Ablehnen mit Erstattung, Statusabruf mit Versandmail, Entwürfe per Link, Shop-AGB. */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto"), zlib = require("zlib");
const createSevMock = require("./sevdesk-mock.js");
const createMocks = require("./print-mocks.js");

const ROOT = path.join(__dirname, "..");
const SECRET = "test-secret";
const COOKIE = "fsadmin=" + encodeURIComponent("ok." + crypto.createHmac("sha256", SECRET).update("ok").digest("hex"));
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }

function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-print-"));
  ["server.js", "sevdesk-ops.js", "fin.js", "fin-local.js", "fin-pdf.js", "fin-bank.js", "fin-mollie.js", "fin-paypal.js", "fin-ebank.js", "fin-bankrules.js", "fin-docmatch.js", "fin-proposals.js", "print-shop.js", "nda.js", "fin-railway.js", "print-account.js", "print-newsletter.js", "mail-rules.js", "push.js", "admin-sw.js", "ki.js", "chat.js", "chat-widget.js", "admin-cockpit.html", "print.html", "landing.css", "index.html", "druck.html", "sitemap.xml"]
    .forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  const cpDir = (d) => { fs.mkdirSync(path.join(dir, d), { recursive: true }); fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => { if (e.isDirectory()) cpDir(path.join(d, e.name)); else fs.copyFileSync(path.join(ROOT, d, e.name), path.join(dir, d, e.name)); }); };
  ["admin-cockpit", "print"].forEach(cpDir);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
async function startServer(dir, env) {
  const port = 5300 + Math.floor(Math.random() * 600);
  const e = Object.assign({}, process.env, { PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x", PRINT_ANCHORS_FILE: "off" }, env);
  ["BLITZDINGS_STATS_URL", "BLITZDINGS_STATS_TOKEN", "RAILWAY_API_TOKEN", "CF_API_TOKEN", "ANTHROPIC_API_KEY", "DATABASE_URL", "PRINT_SECRET"].forEach((k) => { if (!(k in env)) delete e[k]; });
  Object.keys(env).forEach(k => { if (env[k] === undefined) delete e[k]; });
  const srv = cp.spawn(process.execPath, ["server.js"], { cwd: dir, env: e, stdio: ["ignore", "pipe", "pipe"] });
  srv.out = ""; srv.stdout.on("data", (d) => (srv.out += d)); srv.stderr.on("data", (d) => (srv.out += d));
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 80; i++) { try { await fetch(base + "/admin/login"); break; } catch (er) { await new Promise((r) => setTimeout(r, 100)); } }
  srv.base = base; return srv;
}
// Minimal-PNG (RGB) erzeugen
function png(w, h, rgb) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { row[1 + x * 3] = rgb[0]; row[2 + x * 3] = rgb[1]; row[3 + x * 3] = rgb[2]; }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
function pdfOf(wMm, hMm, pages) {
  const PDF = require(path.join(ROOT, "node_modules", "pdfkit"));
  return new Promise((res) => { const d = new PDF({ size: [wMm * 72 / 25.4, hMm * 72 / 25.4], margin: 0, autoFirstPage: false, compress: false }); const ch = []; d.on("data", (c) => ch.push(c)); d.on("end", () => res(Buffer.concat(ch))); for (let i = 0; i < pages; i++) { d.addPage({ size: [wMm * 72 / 25.4, hMm * 72 / 25.4], margin: 0 }); d.text("Seite " + (i + 1), 10, 10); } d.end(); });
}
const mediaBox = (buf) => (buf.toString("latin1").match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/) || []).slice(1).map(Number);
const mm = (pt) => Math.round(pt / 72 * 25.4 * 100) / 100;

(async () => {
  const sevMock = createSevMock({ key: "sev-test-key" }); const sport = await listen(sevMock.server);
  const mocks = createMocks(); const mport = await listen(mocks.server); const M = mocks.state;
  const mbase = "http://127.0.0.1:" + mport;
  const dir = copyApp();

  // ── 1) ohne Print.com-Schlüssel: Seite rendert, Shop „wird eingerichtet“ ──
  // ── 0) Startschalter: ohne PRINT_SHOP_LIVE=1 gesperrt, Admins sehen eine Vorschau ──
  let srv = await startServer(dir, { PRINT_SHOP_LIVE: undefined, PRINTCOM_API_KEY: "pc-test-key", PRINTCOM_BASE: mbase + "/pc" });
  await t("gesperrt: /print, AGB und API für Besucher „Bald verfügbar“ (404, noindex); keine Links in druck.html, Startseite, Sitemap", async () => {
    const r = await fetch(srv.base + "/print"); assert.strictEqual(r.status, 404); assert.ok(/Bald verfügbar/.test(await r.text())); assert.ok(/noindex/.test(r.headers.get("x-robots-tag")));
    assert.strictEqual((await fetch(srv.base + "/print/agb")).status, 404);
    assert.strictEqual((await fetch(srv.base + "/print/api/catalog")).status, 404);
    assert.strictEqual((await fetch(srv.base + "/print/app.js")).status, 404);
    assert.strictEqual((await fetch(srv.base + "/print.html", { redirect: "manual" })).status, 404);
    assert.ok(!/href="\/print"/.test(await (await fetch(srv.base + "/druck")).text()), "kein Link in druck.html");
    const home = await (await fetch(srv.base + "/")).text(); assert.ok(!/href="\/print"/.test(home) && !/Online-Druckshop/.test(home) && !/PRINT_LIVE/.test(home));
    assert.ok(!/\/print</.test(await (await fetch(srv.base + "/sitemap.xml")).text()));
    assert.strictEqual((await fetch(srv.base + "/print/mollie-webhook", { method: "POST", body: "id=tr_x" })).status, 200, "Webhook bleibt erreichbar");
  });
  await t("gesperrt: angemeldeter Admin sieht /print als Vorschau (Banner, noindex) und kann die API nutzen", async () => {
    const r = await fetch(srv.base + "/print", { headers: { cookie: COOKIE } }); assert.strictEqual(r.status, 200); const h = await r.text();
    assert.ok(/Vorschau – nicht öffentlich/.test(h) && /noindex, nofollow/.test(h));
    const c = await (await fetch(srv.base + "/print/api/catalog", { headers: { cookie: COOKIE } })).json(); assert.strictEqual(c.ready, true);
    assert.strictEqual((await fetch(srv.base + "/print/agb", { headers: { cookie: COOKIE } })).status, 200);
    const st = await (await fetch(srv.base + "/admin/api/print/state", { headers: { cookie: COOKIE } })).json(); assert.strictEqual(st.live, false);
  });
  srv.kill();

  srv = await startServer(dir, { PRINT_SHOP_LIVE: "1", PRINTCOM_API_KEY: undefined, MOLLIE_PRINT_API_KEY: undefined });
  await t("ohne PRINTCOM_API_KEY: /print liefert die Seite, Katalog meldet „setup“", async () => {
    const r = await fetch(srv.base + "/print"); assert.strictEqual(r.status, 200); const html = await r.text();
    assert.ok(/Shop wird gerade eingerichtet/.test(html), "Hinweistext im HTML"); assert.ok(/\/print\/app\.js/.test(html));
    const c = await (await fetch(srv.base + "/print/api/catalog")).json(); assert.strictEqual(c.ready, false); assert.strictEqual(c.reason, "setup");
    const p = await fetch(srv.base + "/print/api/price", { method: "POST", headers: { "content-type": "application/json", "x-print-shop": "1" }, body: "{}" }); assert.strictEqual(p.status, 503);
    const js = await fetch(srv.base + "/print/app.js"); assert.strictEqual(js.status, 200); assert.ok(/javascript/.test(js.headers.get("content-type")));
    assert.strictEqual((await fetch(srv.base + "/print-shop.js")).status, 404, "Server-Code nie öffentlich");
  });
  srv.kill();

  // ── 2) eingerichtet (alles gegen Attrappen) ──
  srv = await startServer(dir, { PRINT_SHOP_LIVE: "1", PRINTCOM_API_KEY: "pc-test-key", PRINTCOM_BASE: mbase + "/pc", MOLLIE_PRINT_API_KEY: "test_mollie_print", PRINT_MOLLIE_BASE: mbase + "/mollie",
    VIES_URL: mbase + "/vies", MAIL_API_URL: mbase + "/mail/api/mails", MAIL_API_TOKEN: "mt", SEVDESK_API_KEY: "sev-test-key", SEVDESK_API_BASE: "http://127.0.0.1:" + sport + "/api/v1",
    PRINT_MARKUP_PCT: "35", PRINT_MIN_MARGIN_EUR: "8", PRINT_PUBLIC_URL: "https://www.fs-creative.at", PRINT_CMS_BASE: mbase + "/cms", PRINT_IMPORT_DELAY_MS: "0" });
  const B = srv.base;
  const H = { "content-type": "application/json", "x-print-shop": "1" };
  const post = async (p, body, headers) => { const r = await fetch(B + p, { method: "POST", headers: Object.assign({}, H, headers || {}), body: JSON.stringify(body) }); return { status: r.status, j: await r.json().catch(() => null) }; };
  const admin = async (p, body) => { const r = await fetch(B + p, body ? { method: "POST", headers: { cookie: COOKIE, "content-type": "application/json" }, body: JSON.stringify(body) } : { headers: { cookie: COOKIE } }); return r.json(); };
  const upload = async (buf, name, cfg) => { const r = await fetch(B + "/print/api/upload", { method: "POST", headers: { "x-print-shop": "1", "content-type": "application/octet-stream", "x-file-name": encodeURIComponent(name), "x-print-config": encodeURIComponent(JSON.stringify(cfg)) }, body: buf }); return { status: r.status, j: await r.json() }; };
  const BC = { product: "visitenkarten", sel: { size: "85x55", material: "350gr_mc", printtype: "44", finish: "none" }, copies: 250, urgency: "standard" };
  const cust = { type: "private", firstName: "Maria", lastName: "Muster", email: "maria@example.com", phone: "+43 664 1234567", street: "Silvrettastraße 12", zip: "6793", city: "Gaschurn", country: "AT" };

  let cat;
  await t("Katalog: kuratierte Produkte, nur freigegebene Eigenschaften, Auflagen-Stufen, deutschsprachige Anfrage", async () => {
    cat = await (await fetch(B + "/print/api/catalog")).json();
    assert.strictEqual(cat.ready, true, JSON.stringify(cat));
    // innerhalb der Hauptgruppe nach Beliebtheit laut Print.com (Flyer 55 240 > Faltblätter > Plakate > Visitenkarten), die Beliebtesten als Bestseller markiert
    const pp = cat.products.filter(p => p.group === "paper-print");
    assert.deepStrictEqual(pp.map(p => p.key), ["flyer", "folder", "plakate", "visitenkarten"]);
    assert.ok(pp.every((p, i) => !i || (pp[i - 1].pop || 0) >= (p.pop || 0)), "absteigend nach Beliebtheit");
    assert.ok(cat.products.some(p => p.best) && cat.products.find(p => p.key === "flyer").best, "Bestseller markiert");
    assert.deepStrictEqual(cat.products.map(p => p.key).sort(), ["aufkleber", "flyer", "folder", "kugelschreiber", "plakate", "pvc-banner", "rollups", "tshirt-basic", "visitenkarten"], "nur kuratierte (einmalig freigeschaltet)");
    // Print.com-CMS: echte Bilder, Namen der Gruppen
    const fl = cat.products.find(p => p.key === "flyer"); assert.ok(/^https:\/\/images\.ctfassets\.net\/.+\?fm=webp&w=600$/.test(fl.img), fl.img); assert.deepStrictEqual([fl.cat.mainName, fl.cat.subName], ["Papier & Druck", "Flyer, Faltblätter & Plakate"]);
    assert.strictEqual(cat.groups[0].name, "Papier & Druck"); assert.ok(cat.groups[0].subs.some(x => x.slug === "cards-envelopes"));
    assert.deepStrictEqual(cat.products.find(p => p.key === "pvc-banner").cat.main, "outdoor-advertising", "kuratierte Zuordnung vor Print.com (materials-samples)");
    const bc = cat.products.find(p => p.key === "visitenkarten");
    assert.deepStrictEqual(bc.props.map(p => p.slug), ["size", "material", "printtype", "finish"], "printingmethod/clean_cut nicht sichtbar");
    assert.deepStrictEqual(bc.tiers, [100, 250, 500, 1000, 2500]); assert.strictEqual(bc.fixed.printingmethod, "digital"); assert.strictEqual(bc.bleed, 2);
    assert.deepStrictEqual([bc.props[0].options[0].w, bc.props[0].options[0].h], [85, 55]);
    assert.ok(cat.fonts.length >= 10 && cat.fonts.some(f => f.family === "Montserrat")); assert.ok(cat.agbVersion);
    const g = M.log.find(l => l.path === "/pc/products/businesscards"); assert.ok(g && g.lang === "de-DE" && g.auth === "PrintApiKey pc-test-key");
  });
  await t("Preis: Produkt + 35 % (keine €-Mindestmarge) + Versand zum Einkaufspreis, auf 10 Cent aufgerundet, 20 % USt", async () => {
    const r = await post("/print/api/price", Object.assign({ country: "AT" }, BC)); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    // Produkt 20 → ×1,35 = 27 + 5 Versand = 32,00 netto (keine €-Mindestmarge mehr, nur Prozentregeln)
    assert.strictEqual(r.j.price.net, 32); assert.strictEqual(r.j.price.vat, 6.4); assert.strictEqual(r.j.price.gross, 38.4); assert.strictEqual(r.j.sides, 2);
    assert.ok(!("purchase" in r.j.price) && !("margin" in r.j.price), "Einkauf/Marge nie öffentlich");
    M.price.salesPrice = 4; M.price.shipping = 2;   // kleiner Einkauf: 4 × 1,35 = 5,40 + 2 = 7,40 (früher 8-€-Mindestmarge → 14)
    const r2 = await post("/print/api/price", Object.assign({ country: "AT", zip: "6780" }, BC, { copies: 100 })); assert.strictEqual(r2.j.price.net, 7.4); assert.strictEqual(r2.j.price.rate, 20);
    M.price.salesPrice = 20; M.price.shipping = 5;
  });
  await t("Viele Besucher: gleichzeitige gleiche Preisanfragen → nur eine Anfrage je Variante an Print.com", async () => {
    const cnt = () => M.log.filter(x => x.method === "POST" && /\/pc\/products\/[^/]+\/price$/.test(x.path)).length;
    let c0 = cnt(); await post("/print/api/price", Object.assign({ country: "AT" }, BC, { copies: 1000 })); const one = cnt() - c0;
    c0 = cnt(); await Promise.all([1, 2, 3, 4].map(() => post("/print/api/price", Object.assign({ country: "AT" }, BC, { copies: 2500 })))); const four = cnt() - c0;
    assert.ok(one > 0 && four === one, "4 gleichzeitige Anfragen = so viele Print.com-Aufrufe wie eine (" + one + " / " + four + ")");
  });
  await t("Aufpreise je Option: Differenz zur aktuellen Auswahl, nicht lieferbare/ungültige → off", async () => {
    const r = await post("/print/api/deltas", Object.assign({ country: "AT" }, BC, { alts: [{ k: "44", sel: Object.assign({}, BC.sel) }, { k: "x", sel: Object.assign({}, BC.sel, { material: "400gr_uncoated", finish: "gloss_laminate" }) }, { k: "gold", sel: Object.assign({}, BC.sel, { material: "gold" }) }] }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.j)); assert.strictEqual(r.j.d["44"].net, 0); assert.strictEqual(r.j.d["44"].gross, 0); assert.strictEqual(r.j.d.x.off, true); assert.strictEqual(r.j.d.gold.off, true);
    const u = await post("/print/api/deltas", Object.assign({ country: "AT" }, BC, { alts: [{ k: "quick", sel: BC.sel, urgency: "quick" }, { k: "bad", sel: BC.sel, urgency: "warp" }] }));
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(u.j.d.quick.date), "Liefertermin je Produktionszeit " + JSON.stringify(u.j)); assert.strictEqual(u.j.d.bad.off, true, "unbekannte Produktionszeit");
  });
  await t("Marge-Übersicht (Cockpit): Regeln, Beispielrechnungen mit Gewinn und angewandter Regel", async () => {
    let m = await admin("/admin/api/print/margins"); assert.ok(m.ok && m.rules && m.rules.markupPct > 0 && m.orders && m.orders.all, JSON.stringify(m).slice(0, 300));
    for (let i = 0; i < 60 && !(m.job && !m.job.running); i++) { await new Promise(r => setTimeout(r, 200)); m = await admin("/admin/api/print/margins"); }
    const ok = m.rows.filter(r => !r.error); assert.ok(ok.length >= 3, JSON.stringify(m.rows).slice(0, 400));
    ok.forEach(r => { assert.ok(Math.abs(r.net - r.purchase - r.fee - r.margin) < 0.02, "Gewinn = Netto − Einkauf − Gebühr " + JSON.stringify(r)); assert.ok(r.rule, "Regel"); });
  });
  await t("Preis: ungültige Option/Auflage/ausgeschlossene Kombination → 400, Land außerhalb AT (auch DE) → 400", async () => {
    assert.strictEqual((await post("/print/api/price", Object.assign({}, BC, { sel: Object.assign({}, BC.sel, { material: "gold" }) }))).status, 400);
    assert.strictEqual((await post("/print/api/price", Object.assign({}, BC, { copies: 50 }))).status, 400, "50 ist keine angebotene Stufe");
    assert.strictEqual((await post("/print/api/price", Object.assign({}, BC, { sel: Object.assign({}, BC.sel, { material: "400gr_uncoated", finish: "gloss_laminate" }) }))).status, 400);
    assert.strictEqual((await post("/print/api/price", Object.assign({ country: "CH" }, BC))).status, 400);
    assert.strictEqual((await post("/print/api/price", Object.assign({ country: "DE", zip: "80331" }, BC))).status, 400, "nur Lieferung innerhalb Österreichs");
  });
  await t("CSRF: ohne X-Print-Shop-Header bzw. mit fremdem Origin → 403", async () => {
    assert.strictEqual((await post("/print/api/price", BC, { "x-print-shop": "" })).status, 403);
    assert.strictEqual((await post("/print/api/price", BC, { origin: "https://evil.example" })).status, 403);
    assert.strictEqual((await post("/print/api/price", BC, { origin: B })).status, 200);
  });
  let upOk;
  await t("Upload PDF: passende Größe inkl. Beschnitt + 2 Seiten → ok; falsches Format → Fehler; Nicht-PDF/Bild → 415", async () => {
    const r = await upload(await pdfOf(89, 59, 2), "karte.pdf", BC); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    assert.strictEqual(r.j.blocked, false); assert.ok(r.j.checks.some(c => c.level === "ok" && /Beschnitt passt/.test(c.text))); assert.strictEqual(r.j.pages, 2); upOk = r.j;
    const bad = await upload(await pdfOf(210, 297, 1), "a4.pdf", BC); assert.strictEqual(bad.j.blocked, true); assert.ok(bad.j.checks.some(c => c.level === "error" && /passt nicht/.test(c.text)));
    const noB = await upload(await pdfOf(85, 55, 2), "ohne.pdf", BC); assert.ok(noB.j.checks.some(c => c.level === "warn" && /keinen Beschnitt/.test(c.text)));
    // Beschnitt automatisch ergänzen: gespiegelt bzw. vergrößert → neue Datei mit passender Größe; falsches Token / schon mit Beschnitt → abgelehnt
    for (const mode of ["mirror", "zoom"]) { const bf = await post("/print/api/file/bleed", { fileId: noB.j.fileId, token: noB.j.token, mode }); assert.strictEqual(bf.status, 200, JSON.stringify(bf.j));
      assert.ok(bf.j.fileId !== noB.j.fileId && bf.j.checks.some(c => c.level === "ok" && /Beschnitt passt/.test(c.text)) && !bf.j.checks.some(c => /keinen Beschnitt/.test(c.text)) && bf.j.pages === 2, JSON.stringify(bf.j.checks)); }
    assert.strictEqual((await post("/print/api/file/bleed", { fileId: noB.j.fileId, token: "falsch", mode: "mirror" })).status, 403);
    assert.strictEqual((await post("/print/api/file/bleed", { fileId: upOk.fileId, token: upOk.token, mode: "mirror" })).status, 400, "hat schon Beschnitt");
    const txt = await upload(Buffer.from("hallo welt ".repeat(30)), "x.txt", BC); assert.strictEqual(txt.status, 415);
  });
  await t("Upload Bild: dpi wird geprüft, Bild wird in PDF mit exakter Größe gewandelt", async () => {
    const low = await upload(png(200, 133, [200, 30, 30]), "logo.png", BC); assert.strictEqual(low.status, 200, JSON.stringify(low.j));
    assert.ok(low.j.checks.some(c => /dpi/.test(c.text) && c.level !== "ok"), JSON.stringify(low.j.checks));
    const hi = await upload(png(1060, 700, [10, 10, 10]), "foto.png", BC); assert.ok(hi.j.checks.some(c => c.level === "ok" && /dpi/.test(c.text)), JSON.stringify(hi.j.checks));
    const pdf = Buffer.from(await (await fetch(B + "/print/api/file/" + hi.j.fileId + "?t=" + hi.j.token + "&pdf=1")).arrayBuffer());
    const mb = mediaBox(pdf); assert.deepStrictEqual([mm(mb[2]), mm(mb[3])], [89, 59]);
    assert.strictEqual((await fetch(B + "/print/api/file/" + hi.j.fileId + "?t=falsch")).status, 404);
  });

  // ── Designer-Export ──
  const svgPage = (extra) => '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="356" height="236" viewBox="0 0 356 236"><rect x="0" y="0" width="356" height="236" fill="#0a84ff"/>' +
    '<text x="20" y="60" font-family="Montserrat" font-weight="bold" font-size="24" fill="#000000">Grüße – Maria Muster</text><text x="20" y="100" font-family="\'Playfair Display\'" font-style="italic" font-size="14" fill="#ffffff">Café · 6793 Gaschurn</text>' + (extra || "") + "</svg>";
  let design;
  await t("Designer-PDF: Maße = Endformat + 2 × Beschnitt, TrimBox, Schriften eingebettet, CMYK, ausreichende Bild-dpi ok", async () => {
    const img = "data:image/png;base64," + png(400, 400, [255, 200, 0]).toString("base64");
    const r = await post("/print/api/design", Object.assign({}, BC, { pages: [svgPage('<image x="250" y="150" width="40" height="40" xlink:href="' + img + '"/>'), svgPage()] }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.j)); design = r.j;
    assert.strictEqual(r.j.blocked, false); assert.strictEqual(r.j.pages, 2);
    const pdf = Buffer.from(await (await fetch(B + "/print/api/file/" + r.j.fileId + "?t=" + r.j.token + "&pdf=1")).arrayBuffer());
    const s = pdf.toString("latin1"), mb = mediaBox(pdf);
    assert.deepStrictEqual([mm(mb[2]), mm(mb[3])], [89, 59], "85×55 + 2×2 mm");
    const tb = (s.match(/\/TrimBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/) || []).slice(1).map(Number);
    assert.deepStrictEqual(tb.map(mm), [2, 2, 87, 57], "TrimBox = Endformat");
    assert.ok(/\/BaseFont\s*\/[A-Z]{6}\+Montserrat-Bold/.test(s), "Montserrat Bold eingebettet");
    assert.ok(/\/BaseFont\s*\/[A-Z]{6}\+PlayfairDisplay-Italic/.test(s), "Playfair Italic eingebettet");
    assert.ok(/\/FontFile2/.test(s), "Schriftdatei eingebettet");
    assert.ok(/\/Type\s*\/Page(?![s\w])/.test(s) && (s.match(/\/Type\s*\/Page(?![s\w])/g) || []).length === 2, "2 Seiten");
    assert.ok(r.j.checks.some(c => c.level === "ok" && /ausreichender Auflösung/.test(c.text)), JSON.stringify(r.j.checks));
  });
  await t("Designer-PDF: zu kleines Bild groß platziert → dpi-Warnung bzw. Fehler", async () => {
    const img = "data:image/png;base64," + png(60, 60, [0, 128, 0]).toString("base64");
    const r = await post("/print/api/design", Object.assign({}, BC, { pages: [svgPage('<image x="0" y="0" width="356" height="236" preserveAspectRatio="none" xlink:href="' + img + '"/>'), svgPage()] }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.j)); assert.strictEqual(r.j.blocked, true);
    assert.ok(r.j.checks.some(c => c.level === "error" && /dpi/.test(c.text)), JSON.stringify(r.j.checks));
    const mid = "data:image/png;base64," + png(500, 330, [0, 128, 0]).toString("base64");
    const r2 = await post("/print/api/design", Object.assign({}, BC, { pages: [svgPage('<image x="0" y="0" width="356" height="236" preserveAspectRatio="none" xlink:href="' + mid + '"/>'), svgPage()] }));
    assert.ok(r2.j.checks.some(c => c.level === "warn" && /dpi/.test(c.text)), JSON.stringify(r2.j.checks)); assert.strictEqual(r2.j.blocked, false);
  });
  await t("Designer-PDF: externe Bilder/Skripte/falsche Seitenzahl werden abgelehnt", async () => {
    assert.strictEqual((await post("/print/api/design", Object.assign({}, BC, { pages: [svgPage('<image href="/etc/passwd" width="10" height="10"/>'), svgPage()] }))).status, 400);
    assert.strictEqual((await post("/print/api/design", Object.assign({}, BC, { pages: [svgPage('<image href="https://evil.example/x.png" width="10" height="10"/>'), svgPage()] }))).status, 400);
    assert.strictEqual((await post("/print/api/design", Object.assign({}, BC, { pages: [svgPage("<script>alert(1)</script>"), svgPage()] }))).status, 400);
    assert.strictEqual((await post("/print/api/design", Object.assign({}, BC, { pages: [svgPage()] }))).status, 400, "4/4 braucht 2 Seiten");
    const pre = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n';
    assert.strictEqual((await post("/print/api/design", Object.assign({}, BC, { pages: [pre + svgPage(), pre + svgPage()] }))).status, 200, "Fabric-Vorspann erlaubt");
    assert.strictEqual((await post("/print/api/design", Object.assign({}, BC, { pages: ['<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + svgPage(), svgPage()] }))).status, 400, "eigene DOCTYPE/ENTITY abgelehnt");
  });
  // Ausschnitte, wie sie der Designer (Fabric.js 5.3 toSVG) für die erweiterten Funktionen erzeugt
  const fab = {
    grad: '<g transform="matrix(1 0 0 1 60 60)"><linearGradient id="SVGID_5" gradientUnits="userSpaceOnUse" gradientTransform="matrix(1 0 0 1 -40 -30)" x1="0" y1="30" x2="80" y2="30"><stop offset="0%" style="stop-color:#0a84ff;"/><stop offset="50%" style="stop-color:#ffe600;"/><stop offset="100%" style="stop-color:#ffffff;"/></linearGradient>' +
      '<rect style="stroke: none; fill: url(#SVGID_5); opacity: 1;" vector-effect="non-scaling-stroke" x="-40" y="-30" rx="6" ry="6" width="80" height="60" /></g>',
    radial: '<g transform="matrix(1 0 0 1 300 60)"><radialGradient id="SVGID_7" gradientUnits="userSpaceOnUse" gradientTransform="matrix(1 0 0 1 -30 -20)" cx="30" cy="20" r="30" fx="30" fy="20"><stop offset="0%" style="stop-color:#0a84ff;"/><stop offset="100%" style="stop-color:#ffffff;"/></radialGradient><ellipse style="stroke: none; fill: url(#SVGID_7);" cx="0" cy="0" rx="30" ry="20" /></g>',
    dash: '<g transform="matrix(1.5 0 0 1.5 194 137)"><polygon style="stroke: rgb(0,0,0); stroke-width: 0.8; stroke-dasharray: 0.0067 1.33; stroke-linecap: round; fill: rgb(10,132,255);" vector-effect="non-scaling-stroke" points="0,-38 33,-19 33,19 0,38 -33,19 -33,-19 " /></g>' +
      '<g transform="matrix(1 0 0 1 178 200)"><line style="stroke: rgb(29,29,31); stroke-width: 2; stroke-dasharray: 8 6; stroke-linecap: butt;" x1="-61.6" y1="0" x2="61.6" y2="0" /></g>',
    icon: '<g transform="matrix(2.2 0 0 2.2 300 180)"><path style="stroke: rgb(29,29,31); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; fill: none;" transform=" translate(-11, -12)" d="M 5 4 L 8 4 L 10 9 L 7.5 10.5 C 8.57 12.67 10.33 14.43 12.5 15.5 L 14 13 L 19 15 L 19 18 C 19 19.1 18.1 20 17 20 C 9.66 19.13 3.87 13.34 3 6 C 3 4.9 3.9 4 5 4 z" /></g>',
    curve: '<g transform="matrix(1 0 0 1 178 118)"><g style=""><g transform="matrix(0.6 -0.8 0.8 0.6 -86.4 20.56)" style=""><text xml:space="preserve" font-family="Montserrat" font-size="15.5" font-weight="bold" style="fill: rgb(29,29,31); white-space: pre;"><tspan x="-6.41" y="4.88">D</tspan></text></g>' +
      '<g transform="matrix(1 0.02 -0.02 1 1.63 -22.31)" style=""><text xml:space="preserve" font-family="Montserrat" font-size="15.5" font-weight="bold" style="fill: rgb(29,29,31);"><tspan x="-2.55" y="4.88">I</tspan></text></g></g></g>',
    box: '<g transform="matrix(1 0 0 1 178 30)" style=""><rect fill="#ffe600" x="-80" y="-12" width="160" height="24" rx="6" ry="6"></rect><text xml:space="preserve" font-family="Inter" font-size="14" font-weight="normal" text-decoration="underline" style="stroke: rgb(255,255,255); stroke-width: 0.6; fill: rgb(29,29,31);"><tspan x="-72" y="5">Text mit Box</tspan></text></g>',
    masked: (img) => '<g transform="matrix(0.2 0 0 0.2 60 180)" clip-path="url(#CLIPPATH_9)"><clipPath id="CLIPPATH_9"><circle transform="matrix(1 0 0 1 0 0)" cx="0" cy="0" r="300" /></clipPath>' +
      '<clipPath id="imageCrop_10"><rect x="-300" y="-300" width="600" height="600" /></clipPath><image clip-path="url(#imageCrop_10)" xlink:href="' + img + '" x="-300" y="-300" width="600" height="600"></image></g>',
  };
  await t("Designer-PDF: erweiterte Elemente (Verläufe, Maske/clipPath, gestrichelt/gepunktet, Icon-Pfad, Bogentext, Text-Box mit rx, Unterstreichung) → gültiges PDF in Endformat", async () => {
    const img = "data:image/png;base64," + png(600, 600, [200, 120, 40]).toString("base64");
    const all = fab.grad + fab.radial + fab.dash + fab.icon + fab.curve + fab.box + fab.masked(img);
    const r = await post("/print/api/design", Object.assign({}, BC, { pages: [svgPage(all), svgPage(fab.grad + fab.curve)] }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.j)); assert.strictEqual(r.j.pages, 2);
    const pdf = Buffer.from(await (await fetch(B + "/print/api/file/" + r.j.fileId + "?t=" + r.j.token + "&pdf=1")).arrayBuffer());
    const mb = mediaBox(pdf); assert.deepStrictEqual([mm(mb[2]), mm(mb[3])], [89, 59], "85×55 + 2×2 mm");
    const s = pdf.toString("latin1"); assert.ok(/\/ShadingType\s+2/.test(s) && /\/ShadingType\s+3/.test(s), "linearer + radialer Verlauf als PDF-Shading");
    // maskiertes Bild: 600 px auf 120 Einheiten = 30 mm → ca. 508 dpi (dpi-Messung auch innerhalb von Masken-Gruppen korrekt)
    assert.ok(r.j.checks.some(c => c.level === "ok" && /ausreichender Auflösung/.test(c.text)), JSON.stringify(r.j.checks));
    assert.ok(!r.j.checks.some(c => /dpi/.test(c.text) && c.level !== "ok"), JSON.stringify(r.j.checks));
  });
  await t("Designer-PDF: Verlauf/Maske mit externem Verweis wird abgelehnt", async () => {
    assert.strictEqual((await post("/print/api/design", Object.assign({}, BC, { pages: [svgPage('<rect width="10" height="10" style="fill: url(https://evil.example/g.svg#a)"/>'), svgPage()] }))).status, 400);
    assert.strictEqual((await post("/print/api/design", Object.assign({}, BC, { pages: [svgPage('<g clip-path="url(file:///etc/passwd#c)"><rect width="10" height="10"/></g>'), svgPage()] }))).status, 400);
    assert.strictEqual((await post("/print/api/design", Object.assign({}, BC, { pages: [svgPage('<linearGradient id="g" xlink:href="https://evil.example/x.svg#g"/>'), svgPage()] }))).status, 400);
  });

  // ── Bestellung mit Mollie ──
  const order = (extra) => Object.assign({}, BC, { fileId: design.fileId, fileToken: design.token, customer: cust, payment: "mollie", acceptTerms: true, acceptFagg: true, acceptProof: true, expectedGross: 38.4 }, extra || {});
  let o1;
  await t("Bestellung: ohne Bestätigungen → 400, geänderter Preis → 409 mit neuem Preis", async () => {
    assert.strictEqual((await post("/print/api/order", order({ acceptProof: false }))).status, 400);
    assert.strictEqual((await post("/print/api/order", order({ acceptFagg: undefined }))).status, 400);
    const r = await post("/print/api/order", order({ expectedGross: 10 })); assert.strictEqual(r.status, 409); assert.strictEqual(r.j.price.gross, 38.4);
    assert.strictEqual((await post("/print/api/order", order({ customer: Object.assign({}, cust, { zip: "12" }) }))).status, 400);
    assert.strictEqual((await post("/print/api/order", order({ fileToken: "x" }))).status, 400);
  });
  await t("Bestellung Mollie: Zahlung angelegt (Betrag vom Server), Weiterleitung; Datei nicht doppelt verwendbar", async () => {
    const r = await post("/print/api/order", order()); assert.strictEqual(r.status, 200, JSON.stringify(r.j)); o1 = r.j;
    assert.ok(/^https:\/\/mollie\.example\/checkout\/tr_test\d+$/.test(r.j.checkoutUrl));
    const pay = M.payments[r.j.checkoutUrl.split("/").pop()];
    assert.deepStrictEqual(pay.amount, { currency: "EUR", value: "38.40" }); assert.strictEqual(pay.metadata.orderId, r.j.orderId);
    assert.strictEqual(pay.webhookUrl, "https://www.fs-creative.at/print/mollie-webhook"); assert.ok(pay.redirectUrl.indexOf("/print?bestellung=" + r.j.orderId + "&t=" + r.j.token) > 0);
    assert.strictEqual((await post("/print/api/order", order())).status, 409, "Datei gehört schon zu einer Bestellung");
    const st = await (await fetch(B + "/print/api/order/" + r.j.orderId + "?t=" + r.j.token)).json(); assert.strictEqual(st.order.status, "pending_payment");
    assert.strictEqual((await fetch(B + "/print/api/order/" + r.j.orderId + "?t=falsch")).status, 404);
  });
  await t("Mollie-Webhook: prüft per Abruf; „paid“ → bezahlt, Rechnungsentwurf, Mails – aber KEINE Print.com-Bestellung", async () => {
    const pid = o1.checkoutUrl.split("/").pop();
    let r = await fetch(B + "/print/mollie-webhook", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "id=" + pid });
    assert.strictEqual(r.status, 200);
    let st = await (await fetch(B + "/print/api/order/" + o1.orderId + "?t=" + o1.token)).json(); assert.strictEqual(st.order.status, "pending_payment", "offen bleibt offen");
    M.payments[pid].status = "paid"; M.payments[pid].paidAt = new Date().toISOString();
    r = await fetch(B + "/print/mollie-webhook", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "id=" + pid });
    st = await (await fetch(B + "/print/api/order/" + o1.orderId + "?t=" + o1.token)).json(); assert.strictEqual(st.order.status, "paid");
    assert.strictEqual(M.orders.length, 0, "nichts automatisch bei Print.com bestellt");
    const inv = sevMock.state.invoices[0]; assert.ok(inv, "Rechnungsentwurf angelegt");
    assert.strictEqual(inv.invoice.status, 100); assert.strictEqual(inv.invoice.reference, st.order.nr); assert.ok(inv.invoice.headText.indexOf("Mollie " + pid) > -1, "Mollie-ID im Rechnungstext für den Abgleich");
    assert.strictEqual(inv.invoicePosSave[0].taxRate, 20); assert.strictEqual(inv.invoicePosSave[0].price, 32);
    const conf = M.mails.find(m => m.to === "maria@example.com"); assert.ok(conf && /Bestellbestätigung/.test(conf.subject)); assert.ok(/\/print\/agb/.test(conf.text) && /FAGG/.test(conf.text));
    assert.ok(M.mails.some(m => m.to === "simon@fs-creative.at" && /Druckshop/.test(m.subject)), "Info an FS Creative");
    // unbekannte Zahlung: still 200, nichts passiert
    assert.strictEqual((await fetch(B + "/print/mollie-webhook", { method: "POST", body: "id=tr_unknown1" })).status, 200);
  });
  await t("Cockpit: Bestellung zur Prüfung mit Marge, AGB-Version gespeichert; Datei nur mit Login", async () => {
    const s = await admin("/admin/api/print/state"); assert.strictEqual(s.ok, true); assert.strictEqual(s.review, 1); assert.strictEqual(s.settings.autoSend, false, "Standard: AUS");
    const x = s.orders.find(o => o.id === o1.orderId); assert.strictEqual(x.margin, 6.06, "Marge nach Zahlungsgebühr (1,8 % + 0,25 €): 32 − 25 − 0,94"); assert.strictEqual(x.purchase, 25);
    const d = await admin("/admin/api/print/order?id=" + o1.orderId); assert.strictEqual(d.order.consent.agbVersion, cat.agbVersion); assert.strictEqual(d.order.consent.proofConfirmed, true);
    assert.strictEqual((await fetch(B + "/admin/api/print/file?id=" + o1.orderId, { redirect: "manual" })).status, 302);
    const f = await fetch(B + "/admin/api/print/file?id=" + o1.orderId, { headers: { cookie: COOKIE } }); assert.strictEqual(f.headers.get("content-type"), "application/pdf");
  });
  await t("Cockpit „Bei Print.com bestellen“: nur mit Bestätigung; POST /orders mit FS-Creative-Rechnungsadresse und signierter Datei-URL; Rechnung gesendet", async () => {
    assert.strictEqual((await admin("/admin/api/print/op", { op: "place", id: o1.orderId })).ok, false);
    const r = await admin("/admin/api/print/op", { op: "place", id: o1.orderId, confirm: true }); assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.order.status, "ordered"); assert.strictEqual(r.order.printcom.orderNumber, "6000001");
    const b = M.orders[0]; assert.strictEqual(b.billingAddress.companyName, "FS Creative"); assert.strictEqual(b.billingAddress.email, "simon@fs-creative.at");
    assert.strictEqual(b.deDuplicationId, o1.orderId); assert.strictEqual(b.items[0].sku, "businesscards"); assert.strictEqual(b.items[0].options.copies, 250); assert.strictEqual(b.items[0].options.printingmethod, "offset", "automatisch Offset, wo möglich");
    assert.strictEqual(b.items[0].fileOptions.isProduction, true); assert.strictEqual(b.items[0].approveDesign, true);
    assert.strictEqual(b.items[0].shipments[0].address.email, "maria@example.com"); assert.strictEqual(b.items[0].shipments[0].copies, 250);
    const fu = new URL(b.items[0].fileUrl); assert.strictEqual(fu.origin, "https://www.fs-creative.at");
    const f = await fetch(B + fu.pathname); assert.strictEqual(f.status, 200); assert.ok(Buffer.from(await f.arrayBuffer()).slice(0, 5).toString() === "%PDF-");
    assert.strictEqual((await fetch(B + fu.pathname.replace(/[a-f0-9]{40}\.pdf$/, "0".repeat(40) + ".pdf"))).status, 404, "falsche Signatur");
    const im = sevMock.state.invoiceMails[0]; assert.ok(im && im.toEmail === "maria@example.com", "Rechnung fertiggestellt und gesendet");
    assert.strictEqual((await admin("/admin/api/print/op", { op: "place", id: o1.orderId, confirm: true })).ok, false, "nicht doppelt");
  });
  await t("Signierte Datei-URL: Datei ohne Bestellung wird nicht ausgeliefert", async () => {
    const pcfile = crypto.createHmac("sha256", crypto.createHmac("sha256", SECRET).update("print-shop-v1").digest("hex")).update("pcfile:" + upOk.fileId).digest("hex").slice(0, 40);
    assert.strictEqual((await fetch(B + "/print-files/" + upOk.fileId + "/" + pcfile + ".pdf")).status, 404);
  });
  await t("Statusabruf: SHIPPED → versendet, Mail mit Sendungsverfolgung (einmal)", async () => {
    M.pcOrderStatus = "SHIPPED";
    const r = await admin("/admin/api/print/op", { op: "poll", id: o1.orderId, confirm: true }); assert.strictEqual(r.order.status, "shipped"); assert.deepStrictEqual(r.order.printcom.tracks, ["https://tracking.example/abc123"]);
    const sm = M.mails.filter(m => m.to === "maria@example.com" && /unterwegs/.test(m.subject)); assert.strictEqual(sm.length, 1); assert.ok(/tracking\.example\/abc123/.test(sm[0].text));
    await admin("/admin/api/print/op", { op: "poll", id: o1.orderId, confirm: true }); assert.strictEqual(M.mails.filter(m => /unterwegs/.test(m.subject)).length, 1);
  });
  await t("Rechnung für Firmen: nur mit gültiger UID; AT-Firma → 20 % USt, Freigabe nötig, keine Zahlung", async () => {
    const up = await upload(await pdfOf(89, 59, 2), "firma.pdf", BC);
    const priv = await post("/print/api/order", order({ fileId: up.j.fileId, fileToken: up.j.token, payment: "invoice" })); assert.strictEqual(priv.status, 400);
    const firm = Object.assign({}, cust, { type: "company", company: "Testfirma GmbH", uid: "ATU 12345678", country: "AT", zip: "6780", city: "Schruns", street: "Bahnhofstraße 1" });
    const pr = await post("/print/api/price", Object.assign({ country: "AT", zip: "6780", customerType: "company", uid: "ATU12345678" }, BC)); assert.strictEqual(pr.j.price.rate, 20); assert.strictEqual(pr.j.price.gross, 38.4);
    const nPay = Object.keys(M.payments).length;
    const r = await post("/print/api/order", order({ fileId: up.j.fileId, fileToken: up.j.token, payment: "invoice", customer: firm, expectedGross: 38.4 })); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    assert.strictEqual(r.j.checkoutUrl, null); assert.strictEqual(Object.keys(M.payments).length, nPay);
    const st = await (await fetch(B + "/print/api/order/" + r.j.orderId + "?t=" + r.j.token)).json(); assert.strictEqual(st.order.status, "invoice_requested");
    const inv = sevMock.state.invoices[sevMock.state.invoices.length - 1]; assert.strictEqual(inv.invoicePosSave[0].taxRate, 20);
    assert.ok(!/innergemeinschaftliche Lieferung/.test(inv.invoice.footText || ""));
    const bad = Object.assign({}, firm, { uid: "ATU99999999" }); const up2 = await upload(await pdfOf(89, 59, 2), "firma2.pdf", BC);
    assert.strictEqual((await post("/print/api/order", order({ fileId: up2.j.fileId, fileToken: up2.j.token, payment: "invoice", customer: bad, expectedGross: 38.4 }))).status, 400, "ungültige UID → keine Rechnung");
    assert.strictEqual(M.orders.length, 1, "weiterhin keine automatische Print.com-Bestellung");
  });
  await t("Bonusprogramm: Stufe je Kalenderjahr, am 31.12. zwei Stufen zurück", async () => {
    const C = require(path.join(dir, "print-shop.js"))._bonusCalc; if (!C) return;
    const o = (y, n) => ({ createdAt: y + "-06-01T10:00:00Z", price: { net: n } });
    assert.strictEqual(C([o(2025, 26000)], 2025).idx, 3, "Platin");
    assert.strictEqual(C([o(2025, 26000)], 2026).idx, 1, "nach Jahreswechsel Silber");
    assert.strictEqual(C([o(2025, 26000)], 2027).idx, -1, "zwei Jahre ohne Umsatz: keine Stufe");
    assert.strictEqual(C([o(2025, 21000), o(2026, 6000)], 2026).idx, 0, "Gold → Bronze (Übertrag), 6.000 € = Bronze");
    assert.strictEqual(C([o(2025, 21000), o(2026, 12000)], 2026).idx, 1, "mit 12.000 € im neuen Jahr wieder Silber");
  });
  await t("Kundenkonto: Registrierung mit Mail-Code, Login, Warenkorb, Checkout mit 2 Positionen = 1 Zahlung, Bestellungen im Profil", async () => {
    const em = "konto@example.com";
    const codeOf = () => { const m = M.mails.filter(x => x.to === em).pop(); return m && (m.subject.match(/^(\d{6})/) || [])[1]; };
    let r = await post("/print/api/account/register", { email: em, password: "kurz" }); assert.strictEqual(r.status, 400);
    r = await post("/print/api/account/register", { email: em, password: "geheim1234", firstName: "Karl" }); assert.strictEqual(r.j.needCode, true); const code = codeOf(); assert.ok(code, "Code per Mail");
    r = await post("/print/api/account/verify", { email: em, code: code === "000000" ? "111111" : "000000" }); assert.strictEqual(r.status, 400);
    const vr = await fetch(B + "/print/api/account/verify", { method: "POST", headers: H, body: JSON.stringify({ email: em, code }) }); const vj = await vr.json(); assert.strictEqual(vj.ok, true, JSON.stringify(vj));
    const ck = (vr.headers.get("set-cookie") || "").split(";")[0]; assert.ok(/^ps_kunde=/.test(ck));
    const me = await (await fetch(B + "/print/api/account/me", { headers: { cookie: ck } })).json(); assert.strictEqual(me.customer.email, em); assert.strictEqual(me.customer.firstName, "Karl");
    assert.strictEqual((await (await fetch(B + "/print/api/account/me")).json()).customer, null, "ohne Cookie nicht angemeldet");
    r = await post("/print/api/account/cart", { items: [{ id: "a", product: "visitenkarten" }] }, { cookie: ck }); assert.strictEqual(r.j.cart.length, 1);
    assert.strictEqual((await post("/print/api/account/login", { email: em, password: "falsch123" })).status, 400);
    assert.strictEqual((await post("/print/api/account/login", { email: em, password: "geheim1234" })).j.customer.email, em);
    const u1 = await upload(await pdfOf(89, 59, 2), "k1.pdf", BC), u2 = await upload(await pdfOf(89, 59, 2), "k2.pdf", BC);
    const nPay = Object.keys(M.payments).length;
    const it = (u, g) => Object.assign({}, BC, { fileId: u.j.fileId, fileToken: u.j.token, expectedGross: g });
    const base = { customer: Object.assign({}, cust, { email: em }), payment: "mollie", acceptTerms: true, acceptFagg: true, acceptProof: true };
    r = await post("/print/api/checkout", Object.assign({ items: [it(u1, 38.4), it(u2, 10)] }, base), { cookie: ck }); assert.strictEqual(r.status, 409); assert.strictEqual(r.j.index, 1);
    r = await post("/print/api/checkout", Object.assign({ items: [it(u1, 38.4), it(u2, 38.4)] }, base), { cookie: ck }); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    assert.strictEqual(r.j.orders.length, 2); assert.strictEqual(Object.keys(M.payments).length, nPay + 1, "eine Zahlung für den ganzen Warenkorb");
    const pid = r.j.checkoutUrl.split("/").pop(); assert.strictEqual(M.payments[pid].amount.value, "76.80");
    M.payments[pid].status = "paid"; await fetch(B + "/print/mollie-webhook", { method: "POST", body: "id=" + pid });
    for (const o of r.j.orders) { const st = await (await fetch(B + "/print/api/order/" + o.id + "?t=" + o.token)).json(); assert.notStrictEqual(st.order.status, "pending_payment", o.id); assert.strictEqual(st.order.groupSize, 2); }
    const me2 = await (await fetch(B + "/print/api/account/me", { headers: { cookie: ck } })).json(); assert.strictEqual(me2.orders.length, 2);
    assert.strictEqual(me2.bonus.company, false); assert.strictEqual(me2.bonus.revenue, 64);
    // Kontotyp nur über die Einstellungen (mit Bestätigung), nicht übers Profil
    const pp = await post("/print/api/account/profile", { type: "company", company: "Karl GmbH", city: "Schruns" }, { cookie: ck }); assert.strictEqual(pp.j.customer.type, "private"); assert.strictEqual(pp.j.customer.company, ""); assert.strictEqual(pp.j.customer.city, "Schruns");
    assert.strictEqual((await post("/print/api/account/type", { type: "company", company: "Karl GmbH" }, { cookie: ck })).status, 400, "ohne Bestätigung keine Umstellung");
    assert.strictEqual((await post("/print/api/account/type", { type: "company", company: "", confirm: true }, { cookie: ck })).status, 400, "Firmenname nötig");
    const pf = await post("/print/api/account/type", { type: "company", company: "Karl GmbH", confirm: true }, { cookie: ck }); assert.strictEqual(pf.j.customer.type, "company"); assert.ok(pf.j.customer.typeAt); assert.strictEqual(pf.j.bonus.company, true);
    // Nochmal bestellen: Kopie der Datei, gleiche Ausführung, Preis neu im Warenkorb
    const ro = await post("/print/api/account/reorder", { orderId: r.j.orders[0].id }, { cookie: ck }); assert.strictEqual(ro.j.ok, true); assert.ok(ro.j.item.fileId && ro.j.item.fileId !== me2.orders[0].fileId); assert.strictEqual(ro.j.item.copies, me2.orders.find(o => o.id === r.j.orders[0].id).copies);
    const ri = ro.j.item, rp = await post("/print/api/price", { product: ri.product, sel: ri.sel, copies: ri.copies, urgency: ri.urgency, pm: ri.pm, custom: ri.custom, textile: ri.textile, customerType: "private" }, { cookie: ck }); assert.strictEqual(rp.j.ok, true, JSON.stringify(rp.j));
    const rc = await post("/print/api/checkout", Object.assign({ items: [{ product: ri.product, sel: ri.sel, copies: ri.copies, urgency: ri.urgency, pm: ri.pm, fileId: ri.fileId, fileToken: ri.fileToken, expectedGross: rp.j.price.gross }] }, base), { cookie: ck }); assert.strictEqual(rc.status, 200, "Nachbestellung geht durch die Kasse: " + JSON.stringify(rc.j));
    assert.strictEqual((await post("/print/api/account/reorder", { orderId: "Pnichtda" }, { cookie: ck })).status, 404);
    // Merkliste: hinzufügen, gleiche Konfiguration nicht doppelt, lokal Gemerktes übernehmen, entfernen
    const cfgC = Buffer.from(JSON.stringify({ s: BC.sel, q: 500, u: "standard" })).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    let sv = await post("/print/api/account/saved", { op: "add", item: { id: "s1", product: "visitenkarten", title: "Visitenkarten", c: cfgC, n: 500, gross: 38.4, sum: "85 × 55 mm" } }, { cookie: ck }); assert.strictEqual(sv.j.customer.saved.length, 1);
    sv = await post("/print/api/account/saved", { op: "add", item: { id: "s2", product: "visitenkarten", title: "Visitenkarten", c: cfgC, n: 500 } }, { cookie: ck }); assert.strictEqual(sv.j.customer.saved.length, 1, "gleiche Konfiguration nur einmal");
    sv = await post("/print/api/account/saved", { op: "merge", items: [{ id: "l1", product: "flyer", title: "Flyer", c: cfgC + "x", n: 100 }, { id: "l2", product: "visitenkarten", c: cfgC }] }, { cookie: ck }); assert.strictEqual(sv.j.customer.saved.length, 2);
    assert.strictEqual((await post("/print/api/account/saved", { op: "add", item: { product: "x", c: "<script>" } }, { cookie: ck })).status, 400);
    sv = await post("/print/api/account/saved", { op: "del", id: sv.j.customer.saved[0].id }, { cookie: ck }); assert.strictEqual(sv.j.customer.saved.length, 1);
    const ex = await fetch(B + "/print/api/account/export", { headers: { cookie: ck } }); assert.match(ex.headers.get("content-disposition") || "", /meine-daten/); assert.strictEqual((await ex.json()).bestellungen.length, 3, "inkl. Nachbestellung"); assert.strictEqual(pf.j.bonus.tier, ""); assert.strictEqual(pf.j.bonus.next.name, "Bronze"); assert.strictEqual(pf.j.bonus.next.missing, 4936);
    const pb = await post("/print/api/price", Object.assign({ customerType: "company", __bonus: { pct: 50 } }, BC), { cookie: ck }); assert.strictEqual(pb.j.price.bonus, null, "ohne Stufe kein Rabatt, __bonus vom Client wird ignoriert");
    // Gutschein + eigener Kundenrabatt (Cockpit)
    assert.strictEqual((await admin("/admin/api/print/vouchers", { op: "save", code: "test10", pct: 10, maxUses: 1 })).ok, true);
    let pv = await post("/print/api/price", Object.assign({ voucher: "TEST10" }, BC)); assert.strictEqual(pv.j.price.net, 28.8); assert.strictEqual(pv.j.voucher.code, "TEST10");
    pv = await post("/print/api/price", Object.assign({ voucher: "FALSCH" }, BC)); assert.ok(/ungültig/.test(pv.j.voucherErr)); assert.strictEqual(pv.j.price.net, 32);
    const cl = await admin("/admin/api/print/customers"); const kc = cl.customers.find(c => c.email === em); assert.ok(kc && kc.orders === 3 && kc.type === "company", "2 Bestellungen + Nachbestellung");
    assert.strictEqual((await admin("/admin/api/print/customers", { op: "discount", id: kc.id, pct: 5, note: "Stammkunde" })).ok, true);
    pv = await post("/print/api/price", Object.assign({ customerType: "company" }, BC), { cookie: ck }); assert.strictEqual(pv.j.price.net, 30.4); assert.strictEqual(pv.j.price.bonus.tier, "Kundenrabatt");
    const u4 = await upload(await pdfOf(89, 59, 2), "k4.pdf", BC), fc = Object.assign({}, cust, { email: em, type: "company", company: "Karl GmbH" });
    assert.strictEqual((await post("/print/api/checkout", Object.assign({ items: [it(u4, 0)] }, base, { customer: fc, voucher: "NOPE" }), { cookie: ck })).status, 400);
    pv = await post("/print/api/price", Object.assign({ customerType: "company", voucher: "TEST10" }, BC), { cookie: ck }); const g4 = pv.j.price.gross; assert.strictEqual(pv.j.price.net, 28.4, "Rabatt + Gutschein nie unter Mindestmarge nach Gebühr");
    r = await post("/print/api/checkout", Object.assign({ items: [it(u4, g4)] }, base, { customer: fc, voucher: "test10" }), { cookie: ck }); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    const vl = await admin("/admin/api/print/vouchers"); assert.strictEqual(vl.vouchers[0].used, 1);
    assert.ok(/vollständig eingelöst/.test((await post("/print/api/price", Object.assign({ voucher: "TEST10" }, BC))).j.voucherErr));
    // Gast-Checkout mit Kontoanlage
    const u3 = await upload(await pdfOf(89, 59, 2), "k3.pdf", BC);
    r = await post("/print/api/checkout", Object.assign({ items: [it(u3, 38.4)], createAccount: true, accountPassword: "neuespw123" }, base, { customer: Object.assign({}, cust, { email: "gast@example.com" }) }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.j)); assert.strictEqual(r.j.accountCreated, true); assert.ok(M.mails.some(m => m.to === "gast@example.com" && /Code/.test(m.subject)));
  });
  await t("Ablehnen/Erstatten: Mollie-Erstattung nur auf Klick, Rechnungsentwurf gelöscht, Kunde informiert", async () => {
    const up = await upload(await pdfOf(89, 59, 2), "ref.pdf", BC);
    const r = await post("/print/api/order", order({ fileId: up.j.fileId, fileToken: up.j.token })); const pid = r.j.checkoutUrl.split("/").pop();
    M.payments[pid].status = "paid"; await fetch(B + "/print/mollie-webhook", { method: "POST", body: "id=" + pid });
    assert.strictEqual(M.refunds.length, 0);
    const x = await admin("/admin/api/print/op", { op: "reject", id: r.j.orderId, confirm: true, reason: "Text im Beschnitt" }); assert.strictEqual(x.ok, true, JSON.stringify(x));
    assert.strictEqual(x.order.status, "rejected"); assert.strictEqual(M.refunds.length, 1); assert.deepStrictEqual(M.refunds[0].body.amount, { currency: "EUR", value: "38.40" });
    assert.ok(sevMock.state.deletedInvoices.indexOf(x.order.invoice.id) > -1);
    assert.ok(M.mails.some(m => m.to === "maria@example.com" && /nicht gedruckt/.test(m.text)));
  });
  await t("Einstellungen: automatisch senden + Produkt-Aufschlag aus dem Cockpit", async () => {
    let s = await admin("/admin/api/print/settings", { products: { visitenkarten: { markupPct: "50" } } }); assert.strictEqual(s.settings.products.visitenkarten.markupPct, 50);
    const r = await post("/print/api/price", Object.assign({ country: "AT" }, BC)); assert.strictEqual(r.j.price.net, 35);   // 20 × 1,5 = 30 + 5 Versand
    await admin("/admin/api/print/settings", { products: { visitenkarten: { markupPct: null }, flyer: { enabled: false } } });
    const c = await (await fetch(B + "/print/api/catalog")).json(); assert.ok(!c.products.some(p => p.key === "flyer"));
    await admin("/admin/api/print/settings", { products: { flyer: { enabled: true } } });
  });
  await t("Entwurf per Link: speichern und mit Token laden", async () => {
    const r = await post("/print/api/draft", { product: "visitenkarten", sel: BC.sel, copies: 250, design: { pages: [{ objects: [{ type: "textbox", text: "Hallo" }] }] } });
    assert.strictEqual(r.status, 200); assert.ok(/\/print\?entwurf=f[a-f0-9]{24}&t=[a-f0-9]{40}$/.test(r.j.url));
    const d = await (await fetch(B + "/print/api/draft/" + r.j.id + "?t=" + r.j.token)).json(); assert.strictEqual(d.draft.design.pages[0].objects[0].text, "Hallo");
    assert.strictEqual((await fetch(B + "/print/api/draft/" + r.j.id + "?t=0")).status, 404);
  });
  // ── Ausschlussregeln, Vorauswahl, neue Produktarten, Sortiment ──
  const lastPrice = sku => { const l = M.log.filter(x => x.method === "POST" && x.path === "/pc/products/" + sku + "/price"); return l[l.length - 1]; };
  await t("Ausschlüsse (wie live, Plakate): Vorauswahl gültig, A2 + 170 g matt → Druck/Veredelung bleiben wählbar (Druckverfahren automatisch digital), 1/0 Pantone → nicht lieferbar", async () => {
    const pl = cat.products.find(p => p.key === "plakate");
    assert.strictEqual(pl.defaults.size, "a2"); assert.notStrictEqual(pl.defaults.material, "90gr_bankpost", "A2 + 90 g ist ausgeschlossen");
    assert.ok(!pl.props.find(p => p.slug === "size").options.some(o => o.slug === "custom"), "„custom“ ohne Maße ausgeblendet");
    assert.deepStrictEqual(pl.props.find(p => p.slug === "size").options.map(o => o.slug), ["a2", "a1"], "Größen klein → groß");
    assert.deepStrictEqual(pl.props.find(p => p.slug === "material").options.map(o => o.slug), ["90gr_bankpost", "135gr_mc", "170gr_silk_mc"], "Papier leicht → schwer");
    const d = await post("/print/api/price", { product: "plakate", copies: 1 }); assert.strictEqual(d.status, 200, JSON.stringify(d.j));
    for (const pt of ["40", "44"]) for (const fin of ["none", "gloss_laminate"]) {
      const r = await post("/print/api/price", { product: "plakate", copies: 1, sel: { size: "a2", material: "170gr_silk_mc", printtype: pt, finish: fin } });
      if (pt === "44" && fin === "gloss_laminate") { assert.strictEqual(r.status, 400); continue; }
      assert.strictEqual(r.status, 200, pt + "/" + fin + " " + JSON.stringify(r.j)); assert.strictEqual(lastPrice("posters").body.options.printingmethod, "digital");
    }
    const x = await post("/print/api/price", { product: "plakate", copies: 1, sel: { size: "a2", material: "170gr_silk_mc", printtype: "10", finish: "none" } });
    assert.strictEqual(x.status, 400); assert.ok(/nicht lieferbar/.test(x.j.error));
    const y = await post("/print/api/price", { product: "plakate", copies: 1, sel: { size: "a1", material: "135gr_mc", printtype: "10", finish: "none" } });
    assert.strictEqual(y.status, 200, "1/0 auf 135 g → automatisch Offset"); assert.strictEqual(lastPrice("posters").body.options.printingmethod, "offset");
  });
  await t("Vorauswahl: jedes kuratierte Flachprodukt hat mit Standardauswahl einen Preis und ein Format (Designer erreichbar)", async () => {
    for (const p of cat.products.filter(x => x.kind === "flat")) {
      const r = await post("/print/api/price", { product: p.key, sel: p.defaults, copies: p.tiers[0] }); assert.strictEqual(r.status, 200, p.key + " " + JSON.stringify(r.j));
      assert.ok(r.j.size && r.j.size.w > 0, p.key + " Format"); assert.strictEqual(p.designer, true);
    }
    const ro = cat.products.find(p => p.key === "rollups"); assert.strictEqual(ro.group, "outdoor-advertising"); assert.deepStrictEqual([ro.props[0].options[0].w, ro.props[0].options[0].h], [850, 2000]);
  });
  await t("Banner: freie Größe → size custom + width/height in mm, Konfektion an allen Seiten gleich; 20 cm bzw. zu groß → 400", async () => {
    const pv = cat.products.find(p => p.key === "pvc-banner"); assert.strictEqual(pv.kind, "banner"); assert.strictEqual(pv.bleed, 40);
    const ko = pv.props.find(p => p.slug === "konfektion"); assert.deepStrictEqual(ko.options.map(o => o.slug), ["trimmed", "hemmed", "hem_eyelets_50", "hem_eyelets_30"], "nur vorhandene, kuratierte Konfektionen");
    const r = await post("/print/api/price", { product: "pvc-banner", copies: 1, sel: { konfektion: "hem_eyelets_50" }, custom: { w: 200, h: 100 } }); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    const o = lastPrice("pvc-510").body.options;
    assert.deepStrictEqual([o.size, o.width, o.height, o.all_sides_equal_finish, o.finish_left, o.finish_right, o.finish_top, o.finish_bottom, o.copies, o.printtype], ["custom", 2000, 1000, "yes", "hem_eyelets_50", "hem_eyelets_50", "hem_eyelets_50", "hem_eyelets_50", 1, "40"]);
    assert.ok(!("konfektion" in o)); assert.deepStrictEqual(r.j.size, { w: 2000, h: 1000 }); assert.ok(r.j.labels.some(l => l[1] === "200 × 100 cm"));
    assert.strictEqual((await post("/print/api/price", { product: "pvc-banner", copies: 1, custom: { w: 20, h: 100 } })).status, 400);
    assert.strictEqual((await post("/print/api/price", { product: "pvc-banner", copies: 1, custom: { w: 400, h: 400 } })).status, 400, "max. 500 × 300 cm");
    // Preisanker nach Fläche (Mitbewerber-Bannerpreise je m²): 2 m² → 100, 3 m² → interpoliert 125, außerhalb der Vergleichsflächen kein Anker
    await admin("/admin/api/print/settings", { anchors: { "pvc-banner": [{ sig: { konfektion: "hem_eyelets_50" }, area: [[0.5, { 1: 40, 2: 70 }], [2, { 1: 100, 2: 180 }], [4, { 1: 150, 2: 280 }]], src: "test" }] } });
    const aq = async (w, h, c, k) => (await admin("/admin/api/print/quote", { product: "pvc-banner", sel: { konfektion: k || "hem_eyelets_50" }, custom: { w, h }, copies: c || 1, urgency: "standard" })).quote;
    assert.strictEqual((await aq(200, 100)).anchor, 100); assert.strictEqual((await aq(300, 100)).anchor, 125); assert.strictEqual((await aq(200, 100, 2)).anchor, 180);
    assert.strictEqual((await aq(500, 300)).anchor, null, "größer als verglichen"); assert.strictEqual((await aq(200, 100, 1, "trimmed")).anchor, null, "andere Konfektion");
    await admin("/admin/api/print/settings", { anchors: { "pvc-banner": null } });
    const up = await upload(await pdfOf(2080, 1080, 1), "banner.pdf", { product: "pvc-banner", copies: 1, sel: { konfektion: "hem_eyelets_50" }, custom: { w: 200, h: 100 } });
    assert.strictEqual(up.status, 200, JSON.stringify(up.j)); assert.ok(up.j.checks.some(c => c.level === "ok" && /Beschnitt passt/.test(c.text)), JSON.stringify(up.j.checks));
  });
  await t("Werbeartikel: Druckfläche aus printing_size, Farbe immer gesendet, Preis 0 → Fehler", async () => {
    const pen = cat.products.find(p => p.key === "kugelschreiber"); assert.strictEqual(pen.kind, "promo"); assert.strictEqual(pen.designer, false);
    const r = await post("/print/api/price", { product: "kugelschreiber", copies: 150 }); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    const o = lastPrice("pen-apollo-hardcolor").body.options; assert.strictEqual(o.color, "blue"); assert.strictEqual(o.printtype, "40"); assert.strictEqual(o.printingmethod, "digital_uv");
    assert.deepStrictEqual(r.j.positions[0].area, [70, 6]);
    M.price.salesPrice = 0; { const z = await post("/print/api/price", { product: "kugelschreiber", copies: 500, sel: { color: "red" } }); assert.strictEqual(z.status, 502); assert.ok(/keinen Preis/.test(z.j.error)); } M.price.salesPrice = 20;
  });
  await t("Textil: Größen-Mix → copies = Summe, Logos je Position als mehrseitige PDF, Bestellung mit variants und Seitenzuordnung", async () => {
    const ts = cat.products.find(p => p.key === "tshirt-basic"); assert.strictEqual(ts.kind, "textile"); assert.deepStrictEqual(ts.positions.map(p => p.slug), ["positions_chest", "positions_front", "positions_back", "positions_sleeve_left"]);
    assert.deepStrictEqual(ts.methods.map(m => m.key), ["transfer", "screen1"]);
    const TX = { product: "tshirt-basic", sel: { color_textile: "black_tshirt_fotl_original" }, textile: { method: "transfer", positions: ["positions_back", "positions_chest"], sizes: { m: 10, l: 5 } } };
    const r = await post("/print/api/price", TX); assert.strictEqual(r.status, 200, JSON.stringify(r.j)); assert.strictEqual(r.j.copies, 15);
    const o = lastPrice("t-shirt-budget-5").body.options;
    assert.deepStrictEqual([o.copies, o.textile_sizes, o.color_textile, o.positions_chest, o.positions_back, o.printingmethod, o.printtype, o.individually_sealed, o.size], [15, "m", "black_tshirt_fotl_original", "transfer", "transfer", "heat_transfer", "variable", "no", "t_shirt_nul_price"]);
    assert.ok(!("positions_front" in o) && !("variants" in lastPrice("t-shirt-budget-5").body));
    assert.strictEqual((await post("/print/api/price", Object.assign({}, TX, { textile: { method: "screen1", positions: ["positions_chest"], sizes: { m: 10 } } }))).status, 400, "Siebdruck ab 25");
    assert.strictEqual((await post("/print/api/price", Object.assign({}, TX, { textile: { method: "transfer", positions: [], sizes: { m: 1 } } }))).status, 400, "mind. 1 Position");
    assert.strictEqual((await post("/print/api/price", Object.assign({}, TX, { textile: { method: "transfer", positions: ["positions_chest"], sizes: { xxxl: 1 } } }))).status, 400);
    const lc = Object.assign({}, TX, { logo: "positions_chest" }), lb = Object.assign({}, TX, { logo: "positions_back" });
    const l1 = await upload(png(1200, 1200, [200, 0, 0]), "brust.png", lc), l2 = await upload(png(1500, 1000, [0, 0, 200]), "ruecken.png", lb);
    assert.strictEqual(l1.status, 200, JSON.stringify(l1.j)); assert.strictEqual(l1.j.kind, "logo"); assert.strictEqual(l1.j.blocked, false);
    assert.strictEqual((await upload(png(100, 100, [0, 0, 0]), "mini.png", lc)).j.blocked, true, "zu kleines Logo");
    const mg = await post("/print/api/logos", Object.assign({}, TX, { logos: { positions_chest: { fileId: l1.j.fileId, token: l1.j.token }, positions_back: { fileId: l2.j.fileId, token: l2.j.token } } }));
    assert.strictEqual(mg.status, 200, JSON.stringify(mg.j)); assert.strictEqual(mg.j.pages, 2); assert.deepStrictEqual(mg.j.pageMap.map(p => p.pos), ["positions_chest", "positions_back"], "feste Reihenfolge");
    const pdf = Buffer.from(await (await fetch(B + "/print/api/file/" + mg.j.fileId + "?t=" + mg.j.token + "&pdf=1")).arrayBuffer()).toString("latin1");
    const boxes = (pdf.match(/\/MediaBox\s*\[[^\]]+\]/g) || []).map(b => b.match(/[\d.]+/g).map(Number).slice(2).map(mm)); assert.deepStrictEqual(boxes, [[100, 100], [280, 380]]);
    const firm = Object.assign({}, cust, { type: "company", company: "Testfirma GmbH", uid: "ATU12345678" });
    const pr = await post("/print/api/price", Object.assign({}, TX, { customerType: "company", uid: "ATU12345678" }));
    const od = await post("/print/api/order", Object.assign({}, TX, { fileId: mg.j.fileId, fileToken: mg.j.token, customer: firm, payment: "invoice", acceptTerms: true, acceptFagg: true, acceptProof: true, expectedGross: pr.j.price.gross }));
    assert.strictEqual(od.status, 200, JSON.stringify(od.j));
    const d = await admin("/admin/api/print/order?id=" + od.j.orderId); assert.deepStrictEqual(d.order.variants, [{ textile_sizes: "m", color_textile: "black_tshirt_fotl_original", copies: 10 }, { textile_sizes: "l", color_textile: "black_tshirt_fotl_original", copies: 5 }]);
    assert.strictEqual(d.order.pageMap.length, 2); assert.strictEqual(d.order.textile.sizes.length, 2);
    const n0 = M.orders.length; const pl = await admin("/admin/api/print/op", { op: "place", id: od.j.orderId, confirm: true }); assert.strictEqual(pl.ok, true, JSON.stringify(pl));
    const it = M.orders[n0].items[0]; assert.strictEqual(it.options.copies, 15); assert.strictEqual(it.variants.length, 2); assert.strictEqual(it.variants[1].copies, 5); assert.strictEqual(it.shipments[0].copies, 15);
    assert.ok(/S1 Brust links, S2 Rücken/.test(it.customerReference), it.customerReference);
    assert.strictEqual((await fetch(B + new URL(it.fileUrl).pathname)).status, 200);
  });
  await t("Sortiment: Print.com-Kategorien (Import im Hintergrund), Haupt-/Untergruppe freischalten + Einzel-Ausnahme, allgemeines Produkt mit freier Menge und eigener Größe", async () => {
    await admin("/admin/api/print/sortiment", { op: "import" });
    let st; for (let i = 0; i < 100; i++) { st = await admin("/admin/api/print/sortiment"); if (!st.job.running && st.imported) break; await new Promise(r => setTimeout(r, 100)); }
    assert.strictEqual(st.ok, true); assert.strictEqual(st.job.running, false); assert.ok(st.job.total >= 10, JSON.stringify(st.job));
    const it = sku => st.items.find(x => x.sku === sku) || {};
    assert.deepStrictEqual([it("notepads").main, it("notepads").sub, it("t-shirt-budget-5").sub], ["paper-print", "office-print", "clothing"], "aus den Produktdetails (category)");
    assert.deepStrictEqual(["beachflags", "mentos-rolls", "aluminium-signs", "cardboard-boxes", "umbrellas", "socks", "tablecloths", "pvc-510"].map(x => it(x).main),
      ["outdoor-advertising", "gifts-merchandise-promotional", "indoor-interior", "packaging-bags", "gifts-merchandise-promotional", "clothing-textile", "other", "outdoor-advertising"], "ohne Print.com-Kategorie: Stichwort-Ersatz");
    assert.ok(!st.items.some(x => x.sku === "inactive-thing")); assert.ok(/ctfassets/.test(it("flyers").img));
    const pp = st.tree.find(m => m.slug === "paper-print"); assert.strictEqual(pp.name, "Papier & Druck"); assert.ok(pp.subs.some(x => x.slug === "office-print" && x.name === "Drucksachen für das Büro" && x.total === 1));
    const keys = async () => (await (await fetch(B + "/print/api/catalog")).json()).products.map(p => p.key);
    assert.ok(!(await keys()).includes("notepads"), "Standard: aus");
    await admin("/admin/api/print/sortiment", { op: "cat", cat: "paper-print", on: true });
    const c1 = await (await fetch(B + "/print/api/catalog")).json(); const np = c1.products.find(p => p.key === "notepads"); assert.ok(np && np.lazy && np.cat.subName === "Drucksachen für das Büro", JSON.stringify(np));
    await admin("/admin/api/print/sortiment", { op: "cat", cat: "office-print", on: false }); assert.ok(!(await keys()).includes("notepads"), "Untergruppe aus schlägt Hauptgruppe");
    await admin("/admin/api/print/sortiment", { op: "cat", cat: "office-print", on: null }); assert.ok((await keys()).includes("notepads"));
    await admin("/admin/api/print/sortiment", { op: "set", sku: "notepads", on: false }); assert.ok(!(await keys()).includes("notepads"), "einzeln aus schlägt Kategorie");
    await admin("/admin/api/print/sortiment", { op: "cat", cat: "paper-print", on: false }); await admin("/admin/api/print/sortiment", { op: "set", sku: "notepads", on: true });
    assert.ok((await keys()).includes("notepads"), "einzeln an ohne Kategorie"); assert.ok(!(await keys()).includes("socks"));
    const pd = await (await fetch(B + "/print/api/product?key=notepads")).json(); assert.strictEqual(pd.ok, true, JSON.stringify(pd));
    assert.strictEqual(pd.product.kind, "flat"); assert.deepStrictEqual(pd.product.props.map(p => p.slug), ["sheets", "size"], "propertyGroups-Reihenfolge, versteckte/Bild-Eigenschaften nicht");
    assert.strictEqual(pd.product.props[0].options.find(o => o.slug === "50").desc, "50 Blatt je Block");
    assert.deepStrictEqual(pd.product.props[1].options.map(o => o.slug), ["a6", "a5", "custom"]); assert.deepStrictEqual(pd.product.tiers, [25, 50, 100, 250, 500]);
    assert.deepStrictEqual(pd.product.custom, { minW: 50, minH: 50, maxW: 210, maxH: 297, unit: "mm" });
    const r = await post("/print/api/price", { product: "notepads", copies: 50 }); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    assert.deepStrictEqual(r.j.size, { w: 105, h: 148 }, "A6 kleinstes Format zuerst"); let o = lastPrice("notepads").body.options; assert.deepStrictEqual([o.material, o.printingmethod, o.glue], ["90gr_offset", "digital", "top"]);
    assert.strictEqual((await post("/print/api/price", { product: "notepads", copies: 37 })).status, 200, "freie Menge im Schritt");
    assert.strictEqual((await post("/print/api/price", { product: "notepads", copies: 500 })).status, 200); assert.strictEqual(lastPrice("notepads").body.options.printingmethod, "offset", "Druckverfahren passend zur Menge");
    assert.strictEqual((await post("/print/api/price", { product: "notepads", copies: 120 })).status, 400, "120 liegt in keinem Bereich");
    const cu = await post("/print/api/price", { product: "notepads", copies: 50, sel: { size: "custom" }, custom: { w: 100, h: 200 } }); assert.strictEqual(cu.status, 200, JSON.stringify(cu.j));
    o = lastPrice("notepads").body.options; assert.deepStrictEqual([o.size, o.width, o.height], ["custom", 100, 200]); assert.deepStrictEqual(cu.j.size, { w: 100, h: 200 });
    assert.strictEqual((await post("/print/api/price", { product: "notepads", copies: 50, sel: { size: "custom" }, custom: { w: 300, h: 300 } })).status, 400, "größer als customSizes");
    assert.strictEqual((await fetch(B + "/print/api/product?key=socks")).status, 404, "nicht freigeschaltet");
    await admin("/admin/api/print/sortiment", { op: "override", sku: "umbrellas", cat: "clothing-textile/clothing" }); assert.strictEqual((await admin("/admin/api/print/sortiment")).items.find(x => x.sku === "umbrellas").sub, "clothing");
    const pv = await admin("/admin/api/print/sortiment", { op: "preview", sku: "notepads" }); assert.strictEqual(pv.ok, true, JSON.stringify(pv)); assert.ok(pv.gross > 0);
    const ps = await admin("/admin/api/print/sortiment", { op: "preview", sku: "t-shirt-budget-5" }); assert.strictEqual(ps.ok, true, JSON.stringify(ps));
  });
  await t("Datencheck: Profi (+5 €, Warteschlange, eigene Rechnungszeile) bzw. direkt freigegeben (bezahlt → sofort an Print.com)", async () => {
    const base = { customer: Object.assign({}, cust, { email: "check@example.com" }), payment: "mollie", acceptTerms: true, acceptFagg: true, acceptProof: true };
    const u1 = await upload(await pdfOf(89, 59, 2), "c1.pdf", BC);
    let r = await post("/print/api/checkout", Object.assign({ items: [Object.assign({}, BC, { fileId: u1.j.fileId, fileToken: u1.j.token, expectedGross: 38.4 })], check: "pro" }, base)); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    let pid = r.j.checkoutUrl.split("/").pop(); assert.strictEqual(M.payments[pid].amount.value, "43.40");
    const nPc = M.orders.length; M.payments[pid].status = "paid"; await fetch(B + "/print/mollie-webhook", { method: "POST", body: "id=" + pid });
    let st = await (await fetch(B + "/print/api/order/" + r.j.orderId + "?t=" + r.j.token)).json(); assert.strictEqual(st.order.status, "paid"); assert.strictEqual(M.orders.length, nPc, "Profi-Check: wartet auf Prüfung");
    const inv = sevMock.state.invoices[sevMock.state.invoices.length - 1]; assert.strictEqual(inv.invoicePosSave.length, 2); assert.ok(/Profi-Datencheck/.test(JSON.stringify(inv.invoicePosSave[1])));
    const u2 = await upload(await pdfOf(89, 59, 2), "c2.pdf", BC);
    r = await post("/print/api/checkout", Object.assign({ items: [Object.assign({}, BC, { fileId: u2.j.fileId, fileToken: u2.j.token, expectedGross: 38.4 })], check: "self" }, base)); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    pid = r.j.checkoutUrl.split("/").pop(); assert.strictEqual(M.payments[pid].amount.value, "38.40");
    M.payments[pid].status = "paid"; await fetch(B + "/print/mollie-webhook", { method: "POST", body: "id=" + pid });
    st = await (await fetch(B + "/print/api/order/" + r.j.orderId + "?t=" + r.j.token)).json(); assert.strictEqual(st.order.status, "ordered", "direkt freigegeben → sofort bei Print.com"); assert.strictEqual(M.orders.length, nPc + 1);
  });
  await t("Mehrere Motive: Stückzahlen je Motiv, PDFs zusammengeführt, variants + Seitenzuordnung", async () => {
    const base = { customer: Object.assign({}, cust, { email: "motive@example.com" }), payment: "mollie", acceptTerms: true, acceptFagg: true, acceptProof: true, check: "pro" };
    const m1 = await upload(await pdfOf(89, 59, 2), "m1.pdf", BC), m2 = await upload(await pdfOf(89, 59, 2), "m2.pdf", BC);
    const it = (a, b, g) => Object.assign({}, BC, { fileId: m1.j.fileId, fileToken: m1.j.token, expectedGross: g, motifs: [{ copies: a, fileId: m1.j.fileId, fileToken: m1.j.token }, { copies: b, fileId: m2.j.fileId, fileToken: m2.j.token }] });
    assert.strictEqual((await post("/print/api/checkout", Object.assign({ items: [it(100, 100, 38.4)] }, base))).status, 400, "Summe ≠ Auflage");
    const r = await post("/print/api/checkout", Object.assign({ items: [it(150, 100, 38.4)] }, base)); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    const od = await admin("/admin/api/print/order?id=" + r.j.orderId); assert.deepStrictEqual(od.order.variants, [{ copies: 150 }, { copies: 100 }]);
    assert.strictEqual(od.order.motifs.length, 2); assert.strictEqual(od.order.pageMap[1].page, "3–4"); assert.strictEqual(od.file.pages, 4);
    const u3 = await upload(await pdfOf(89, 59, 2), "m3.pdf", BC);
    assert.strictEqual((await post("/print/api/checkout", Object.assign({ items: [Object.assign({}, BC, { fileId: m1.j.fileId, fileToken: m1.j.token, expectedGross: 38.4, motifs: [{ copies: 150, fileId: m1.j.fileId, fileToken: m1.j.token }, { copies: 100, fileId: u3.j.fileId, fileToken: u3.j.token }] })] }, base))).status, 409, "Motiv-Datei schon verwendet");
  });
  await t("Folder: Größe = gefalztes Format → Datei im offenen Format mit Falzlinien; Druckvorlage als PDF je Ausführung", async () => {
    const FO = { product: "folder", sel: { size: "1/3_a4", fold: "wikkel_6", printtype: "44" }, copies: 100, urgency: "standard" };
    const pr = await post("/print/api/price", FO); assert.strictEqual(pr.status, 200, JSON.stringify(pr.j));
    assert.deepStrictEqual(pr.j.size, { w: 297, h: 210 }); assert.deepStrictEqual(pr.j.closed, { w: 99, h: 210 });
    assert.deepStrictEqual(pr.j.folds.x, [97, 197], "Außenseite: Einklappseite 97 mm, dann 100/100"); assert.deepStrictEqual(pr.j.folds.widths, [97, 100, 100]);
    const half = await post("/print/api/price", Object.assign({}, FO, { sel: Object.assign({}, FO.sel, { size: "a5", fold: "single_4" }) }));
    assert.deepStrictEqual(half.j.size, { w: 296, h: 210 }); assert.deepStrictEqual(half.j.folds.x, [148]);
    const b = pr.j.bleed, r = await fetch(B + "/print/api/template?dl=1&product=folder&c=" + encodeURIComponent(JSON.stringify(FO)));
    assert.strictEqual(r.status, 200); assert.ok(/application\/pdf/.test(r.headers.get("content-type"))); assert.ok(/attachment; filename="Druckvorlage_Folder_\d+x\d+mm\.pdf"/.test(r.headers.get("content-disposition")), r.headers.get("content-disposition"));
    const { PDFDocument } = require(path.join(ROOT, "node_modules", "pdf-lib")); const doc = await PDFDocument.load(Buffer.from(await r.arrayBuffer()));
    assert.strictEqual(doc.getPageCount(), 2, "Außen- und Innenseite"); const sz = doc.getPage(0).getSize();
    assert.ok(Math.abs(sz.width - (297 + 2 * b) * 72 / 25.4) < 0.5 && Math.abs(sz.height - (210 + 2 * b) * 72 / 25.4) < 0.5, JSON.stringify(sz));
    const tb = doc.getPage(0).getTrimBox(); assert.ok(Math.abs(tb.width - 297 * 72 / 25.4) < 0.5, "TrimBox = Endformat");
    if (process.env.TPL_OUT) fs.writeFileSync(path.join(process.env.TPL_OUT, "folder.pdf"), Buffer.from(await doc.save()));
    const vk = await fetch(B + "/print/api/template?product=visitenkarten&c=" + encodeURIComponent(JSON.stringify(BC))); assert.strictEqual(vk.status, 200);
    const vd = await PDFDocument.load(Buffer.from(await vk.arrayBuffer())); assert.strictEqual(vd.getPageCount(), 2, "4/4 → Vorder- und Rückseite");
    if (process.env.TPL_OUT) fs.writeFileSync(path.join(process.env.TPL_OUT, "vk.pdf"), Buffer.from(await vd.save()));
    for (const fd of ["luik_6", "cross_8"]) { const rr = await fetch(B + "/print/api/template?product=folder&c=" + encodeURIComponent(JSON.stringify(Object.assign({}, FO, { sel: Object.assign({}, FO.sel, { size: "a5", fold: fd }) })))); assert.strictEqual(rr.status, 200, fd);
      if (process.env.TPL_OUT) fs.writeFileSync(path.join(process.env.TPL_OUT, fd + ".pdf"), Buffer.from(await rr.arrayBuffer())); }
    assert.strictEqual((await fetch(B + "/print/api/template?product=gibtsnicht")).status, 404);
  });
  await t("Ziel-Marge je Kategorie: Werbeartikel 5 % vom Nettopreis nach Gebühr, ohne Wert wieder Standard", async () => {
    const kp = cat.products.find(p => p.key === "kugelschreiber"); assert.ok(kp, "Kugelschreiber im Katalog");
    const q = async () => (await admin("/admin/api/print/quote", { product: "kugelschreiber", sel: kp.defaults || {}, copies: (kp.tiers || [])[0] || 50, urgency: "standard" })).quote;
    const before = await q(); assert.ok(before && before.net > 0, JSON.stringify(before));
    await admin("/admin/api/print/settings", { groupMargin: { "gifts-merchandise-promotional": "5" } });
    const after = await q(), pct = after.margin / after.net * 100;
    assert.ok(after.net < before.net, "günstiger als mit Standardaufschlag"); assert.ok(pct >= 4.9 && pct < 6.5, "Marge " + pct.toFixed(2) + " %");
    const st = await admin("/admin/api/print/state"); assert.strictEqual(st.settings.groupMargin["gifts-merchandise-promotional"], 5); assert.ok(st.groups.some(g => g.slug === "gifts-merchandise-promotional"));
    await admin("/admin/api/print/settings", { groupMargin: { "gifts-merchandise-promotional": null } });
    assert.strictEqual((await q()).net, before.net, "zurück auf Standard");
  });
  await t("Newsletter: Double-Opt-in, Bestätigung mit Code, Ausgabe im Cockpit bearbeiten, Testmail mit Pflichtangaben, Abmelden", async () => {
    const em = "news@example.com";
    assert.strictEqual((await post("/print/api/newsletter", { email: em })).status, 400, "ohne Einwilligung");
    const r = await post("/print/api/newsletter", { email: em, consent: true, source: "Test" }); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    let st = await admin("/admin/api/print/newsletter"); assert.strictEqual(st.recipients, 0, "erst nach Bestätigung"); assert.strictEqual(st.counts.pending, 1);
    const cm = M.mails.filter(m => m.to === em).pop(); const link = (cm.text.match(/https?:\/\/\S+bestaetigen\S+/) || [])[0]; assert.ok(link, cm.text);
    const cp = await fetch(B + new URL(link).pathname + new URL(link).search); assert.strictEqual(cp.status, 200); assert.ok(/ersten Newsletter im Monat/.test(await cp.text()), "Hinweis Monatscode auf der Bestätigungsseite");
    assert.strictEqual((await fetch(B + "/print/newsletter/bestaetigen?e=" + encodeURIComponent(em) + "&t=falsch")).status, 400);
    st = await admin("/admin/api/print/newsletter"); assert.strictEqual(st.recipients, 1); assert.strictEqual(st.issue.status, "draft"); assert.strictEqual(st.settings.autoSend, false, "Automatik Standard AUS");
    st = await admin("/admin/api/print/newsletter", { op: "save", monday: st.issue.monday, subject: "Testbetreff", intro: "Hallo Welt", code: "nl-test5", products: ["flyer", "visitenkarten"] });
    assert.strictEqual(st.issue.code, "NL-TEST5"); assert.deepStrictEqual(st.issue.products, ["flyer", "visitenkarten"]);
    const pv = await admin("/admin/api/print/newsletter", { op: "preview", monday: st.issue.monday }); assert.ok(/Hallo Welt/.test(pv.html) && /NL-TEST5/.test(pv.html) && /§ 25 MedienG/.test(pv.html) && /abmelden/i.test(pv.html));
    await admin("/admin/api/print/newsletter", { op: "settings", testTo: "simon@fs-creative.at" });
    await admin("/admin/api/print/newsletter", { op: "test", monday: st.issue.monday });
    const tm = M.mails.filter(m => m.to === "simon@fs-creative.at" && /\[Test\] Testbetreff/.test(m.subject)).pop(); assert.ok(tm, "Testmail");
    assert.ok(/NL-TEST5/.test(tm.text) && /Medieninhaber/.test(tm.text) && /print\/newsletter\/abmelden\?e=/.test(tm.text) && /einmal je Kundin\/Kunde/.test(tm.text));
    const vo = await admin("/admin/api/print/vouchers"); const v = vo.vouchers.find(x => x.code === "NL-TEST5"); assert.ok(v && v.pct === 5 && v.perCustomer && v.until, "Wochencode als Gutschein");
    const NLT = require("../print-newsletter.js")({})._test; assert.ok(NLT.codeIssue("2026-11-02") && NLT.codeIssue("2026-12-07") && !NLT.codeIssue("2026-11-09") && NLT.monthCode("2026-11-02") === "NLNOV26", "Code nur in der ersten Ausgabe im Monat");
    const ul = B + "/print/newsletter/abmelden?e=" + encodeURIComponent(em) + "&t=" + (tm.text.match(/abmelden\?e=[^&]+&t=([a-f0-9]+)/) || [])[1];
    const ug = await fetch(ul.replace(/simon%40fs-creative\.at/, encodeURIComponent(em))); assert.strictEqual(ug.status, 400, "Token gehört zu anderer Adresse");
    st = await admin("/admin/api/print/newsletter", { op: "unsub", email: em }); assert.strictEqual(st.recipients, 0);
  });
  await t("KI-Assistent ohne ANTHROPIC_API_KEY: aus (Katalog ai=false, Endpunkt 503); /print/hilfe erreichbar", async () => {
    assert.strictEqual(cat.ai, false);
    const r = await post("/print/api/ai/design", { product: "flyer", brief: "Sommerfest" }); assert.strictEqual(r.status, 503, JSON.stringify(r.j));
    const h = await (await fetch(B + "/print/hilfe")).text(); assert.ok(/So geht’s &amp; FAQ/.test(h) && /id="bonus"/.test(h) && /Platin/.test(h) && !/\/print\/app\.js/.test(h));
  });
  await t("Shop-AGB /print/agb: Firmendaten, FAGG-Hinweis, Stand", async () => {
    const r = await fetch(B + "/print/agb"); assert.strictEqual(r.status, 200); const h = await r.text();
    assert.ok(/ATU82622967/.test(h) && /§ 18 Abs\. 1 Z 3 FAGG/.test(h) && /Dorfstraße 3\/1/.test(h)); assert.ok(!/\{\{/.test(h)); assert.ok(/rechtlich prüfen/.test(h), "Hinweis als HTML-Kommentar");
  });
  await t("Seite /print und Sitemap", async () => {
    const h = await (await fetch(B + "/print")).text(); assert.ok(/<title>[^<]*Druck/.test(h)); assert.ok(/\/print\/agb/.test(h)); assert.ok(!/Vorschau – nicht/.test(h));
    assert.ok(/href="\/print"/.test(await (await fetch(B + "/druck")).text()), "Link „Jetzt online bestellen“");
    assert.ok(/\/print<\/loc>/.test(await (await fetch(B + "/sitemap.xml")).text()));
    const home = await (await fetch(B + "/")).text(); assert.ok(/Online-Druckshop/.test(home) && !/PRINT_LIVE/.test(home));
  });
  srv.kill(); sevMock.server.close(); mocks.server.close();
  if (fail) { console.log(fails.join("\n")); console.log("--- Server-Log ---\n" + srv.out.slice(-3000)); }
  console.log((fail ? "FEHLER: " : "OK: ") + pass + " bestanden, " + fail + " fehlgeschlagen");
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
