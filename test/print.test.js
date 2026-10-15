/* Druckshop /print (print-shop.js) gegen Attrappen: Print.com, Mollie, VIES, Mailserver (test/print-mocks.js) und sevDesk-kompatible Buchhaltung (test/sevdesk-mock.js).
   Aufruf: node test/print.test.js   – server.js läuft in einer Temp-Kopie, echte Dienste werden nie angesprochen.
   Geprüft: Einrichtungs-Zustand ohne Schlüssel, Katalog, Preis (serverseitig, Aufschlag/Mindestmarge/USt), CSRF-Schutz, Upload-Prüfung (Größe, dpi),
   Designer-PDF (Maße inkl. Beschnitt, TrimBox, eingebettete Schriften, CMYK, Bild-dpi), Bestellung mit Mollie (Webhook prüft per Abruf),
   KEINE automatische Bestellung bei Print.com, Rechnungsentwurf, Cockpit-Freigabe → POST /orders + Rechnung senden, signierte Datei-URL,
   Rechnung für Firmen (VIES, ig. Lieferung 0 %), Ablehnen mit Erstattung, Statusabruf mit Versandmail, Entwürfe per Link, Shop-AGB. */
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
  ["server.js", "sevdesk-ops.js", "fin.js", "fin-local.js", "fin-pdf.js", "fin-bank.js", "fin-mollie.js", "fin-paypal.js", "fin-ebank.js", "fin-bankrules.js", "fin-docmatch.js", "fin-proposals.js", "print-shop.js", "mail-rules.js", "push.js", "admin-sw.js", "ki.js", "admin-cockpit.html", "print.html", "landing.css", "index.html", "druck.html", "sitemap.xml"]
    .forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  const cpDir = (d) => { fs.mkdirSync(path.join(dir, d), { recursive: true }); fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => { if (e.isDirectory()) cpDir(path.join(d, e.name)); else fs.copyFileSync(path.join(ROOT, d, e.name), path.join(dir, d, e.name)); }); };
  ["admin-cockpit", "print"].forEach(cpDir);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
async function startServer(dir, env) {
  const port = 5300 + Math.floor(Math.random() * 600);
  const e = Object.assign({}, process.env, { PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x" }, env);
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
    PRINT_MARKUP_PCT: "35", PRINT_MIN_MARGIN_EUR: "8", PRINT_PUBLIC_URL: "https://www.fs-creative.at" });
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
    assert.deepStrictEqual(cat.products.map(p => p.key), ["visitenkarten", "flyer", "plakate", "folder", "aufkleber", "rollups"]);
    const bc = cat.products[0];
    assert.deepStrictEqual(bc.props.map(p => p.slug), ["size", "material", "printtype", "finish"], "printingmethod/clean_cut nicht sichtbar");
    assert.deepStrictEqual(bc.tiers, [100, 250, 500, 1000, 2500]); assert.strictEqual(bc.fixed.printingmethod, "digital"); assert.strictEqual(bc.bleed, 2);
    assert.deepStrictEqual([bc.props[0].options[0].w, bc.props[0].options[0].h], [85, 55]);
    assert.ok(cat.fonts.length >= 10 && cat.fonts.some(f => f.family === "Montserrat")); assert.ok(cat.agbVersion);
    const g = M.log.find(l => l.path === "/pc/products/businesscards"); assert.ok(g && g.lang === "de-DE" && g.auth === "PrintApiKey pc-test-key");
  });
  await t("Preis: Einkauf (Produkt + günstigster Versand) + 35 %, mind. 8 € Marge, auf 10 Cent aufgerundet, 20 % USt", async () => {
    const r = await post("/print/api/price", Object.assign({ country: "AT" }, BC)); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    // Einkauf 20 + 5 = 25 → ×1,35 = 33,75 (> 25 + 8) → 33,80 netto
    assert.strictEqual(r.j.price.net, 33.8); assert.strictEqual(r.j.price.vat, 6.76); assert.strictEqual(r.j.price.gross, 40.56); assert.strictEqual(r.j.sides, 2);
    assert.ok(!("purchase" in r.j.price) && !("margin" in r.j.price), "Einkauf/Marge nie öffentlich");
    M.price.salesPrice = 4; M.price.shipping = 2;   // kleiner Einkauf → Mindestmarge greift: 6 + 8 = 14
    const r2 = await post("/print/api/price", Object.assign({ country: "DE", zip: "80331" }, BC, { copies: 100 })); assert.strictEqual(r2.j.price.net, 14); assert.strictEqual(r2.j.price.rate, 20, "DE privat: österr. USt");
    M.price.salesPrice = 20; M.price.shipping = 5;
  });
  await t("Preis: ungültige Option/Auflage/ausgeschlossene Kombination → 400, Land außerhalb AT/DE → 400", async () => {
    assert.strictEqual((await post("/print/api/price", Object.assign({}, BC, { sel: Object.assign({}, BC.sel, { material: "gold" }) }))).status, 400);
    assert.strictEqual((await post("/print/api/price", Object.assign({}, BC, { copies: 50 }))).status, 400, "50 ist keine angebotene Stufe");
    assert.strictEqual((await post("/print/api/price", Object.assign({}, BC, { sel: Object.assign({}, BC.sel, { material: "400gr_uncoated", finish: "gloss_laminate" }) }))).status, 400);
    assert.strictEqual((await post("/print/api/price", Object.assign({ country: "CH" }, BC))).status, 400);
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

  // ── Bestellung mit Mollie ──
  const order = (extra) => Object.assign({}, BC, { fileId: design.fileId, fileToken: design.token, customer: cust, payment: "mollie", acceptTerms: true, acceptFagg: true, acceptProof: true, expectedGross: 40.56 }, extra || {});
  let o1;
  await t("Bestellung: ohne Bestätigungen → 400, geänderter Preis → 409 mit neuem Preis", async () => {
    assert.strictEqual((await post("/print/api/order", order({ acceptProof: false }))).status, 400);
    assert.strictEqual((await post("/print/api/order", order({ acceptFagg: undefined }))).status, 400);
    const r = await post("/print/api/order", order({ expectedGross: 10 })); assert.strictEqual(r.status, 409); assert.strictEqual(r.j.price.gross, 40.56);
    assert.strictEqual((await post("/print/api/order", order({ customer: Object.assign({}, cust, { zip: "12" }) }))).status, 400);
    assert.strictEqual((await post("/print/api/order", order({ fileToken: "x" }))).status, 400);
  });
  await t("Bestellung Mollie: Zahlung angelegt (Betrag vom Server), Weiterleitung; Datei nicht doppelt verwendbar", async () => {
    const r = await post("/print/api/order", order()); assert.strictEqual(r.status, 200, JSON.stringify(r.j)); o1 = r.j;
    assert.ok(/^https:\/\/mollie\.example\/checkout\/tr_test\d+$/.test(r.j.checkoutUrl));
    const pay = M.payments[r.j.checkoutUrl.split("/").pop()];
    assert.deepStrictEqual(pay.amount, { currency: "EUR", value: "40.56" }); assert.strictEqual(pay.metadata.orderId, r.j.orderId);
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
    assert.strictEqual(inv.invoicePosSave[0].taxRate, 20); assert.strictEqual(inv.invoicePosSave[0].price, 33.8);
    const conf = M.mails.find(m => m.to === "maria@example.com"); assert.ok(conf && /Bestellbestätigung/.test(conf.subject)); assert.ok(/\/print\/agb/.test(conf.text) && /FAGG/.test(conf.text));
    assert.ok(M.mails.some(m => m.to === "simon@fs-creative.at" && /Druckshop/.test(m.subject)), "Info an FS Creative");
    // unbekannte Zahlung: still 200, nichts passiert
    assert.strictEqual((await fetch(B + "/print/mollie-webhook", { method: "POST", body: "id=tr_unknown1" })).status, 200);
  });
  await t("Cockpit: Bestellung zur Prüfung mit Marge, AGB-Version gespeichert; Datei nur mit Login", async () => {
    const s = await admin("/admin/api/print/state"); assert.strictEqual(s.ok, true); assert.strictEqual(s.review, 1); assert.strictEqual(s.settings.autoSend, false, "Standard: AUS");
    const x = s.orders.find(o => o.id === o1.orderId); assert.strictEqual(x.margin, 8.8); assert.strictEqual(x.purchase, 25);
    const d = await admin("/admin/api/print/order?id=" + o1.orderId); assert.strictEqual(d.order.consent.agbVersion, cat.agbVersion); assert.strictEqual(d.order.consent.proofConfirmed, true);
    assert.strictEqual((await fetch(B + "/admin/api/print/file?id=" + o1.orderId, { redirect: "manual" })).status, 302);
    const f = await fetch(B + "/admin/api/print/file?id=" + o1.orderId, { headers: { cookie: COOKIE } }); assert.strictEqual(f.headers.get("content-type"), "application/pdf");
  });
  await t("Cockpit „Bei Print.com bestellen“: nur mit Bestätigung; POST /orders mit FS-Creative-Rechnungsadresse und signierter Datei-URL; Rechnung gesendet", async () => {
    assert.strictEqual((await admin("/admin/api/print/op", { op: "place", id: o1.orderId })).ok, false);
    const r = await admin("/admin/api/print/op", { op: "place", id: o1.orderId, confirm: true }); assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.order.status, "ordered"); assert.strictEqual(r.order.printcom.orderNumber, "6000001");
    const b = M.orders[0]; assert.strictEqual(b.billingAddress.companyName, "FS Creative"); assert.strictEqual(b.billingAddress.email, "simon@fs-creative.at");
    assert.strictEqual(b.deDuplicationId, o1.orderId); assert.strictEqual(b.items[0].sku, "businesscards"); assert.strictEqual(b.items[0].options.copies, 250); assert.strictEqual(b.items[0].options.printingmethod, "digital");
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
  await t("Rechnung für Firmen: nur mit gültiger UID; DE-Firma → ig. Lieferung 0 %, Freigabe nötig, keine Zahlung", async () => {
    const up = await upload(await pdfOf(89, 59, 2), "firma.pdf", BC);
    const priv = await post("/print/api/order", order({ fileId: up.j.fileId, fileToken: up.j.token, payment: "invoice" })); assert.strictEqual(priv.status, 400);
    const firm = Object.assign({}, cust, { type: "company", company: "Testfirma GmbH", uid: "DE 123456789", country: "DE", zip: "80331", city: "München", street: "Marienplatz 1" });
    const pr = await post("/print/api/price", Object.assign({ country: "DE", zip: "80331", customerType: "company", uid: "DE123456789" }, BC)); assert.strictEqual(pr.j.price.rate, 0); assert.strictEqual(pr.j.price.gross, 33.8);
    const nPay = Object.keys(M.payments).length;
    const r = await post("/print/api/order", order({ fileId: up.j.fileId, fileToken: up.j.token, payment: "invoice", customer: firm, expectedGross: 33.8 })); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    assert.strictEqual(r.j.checkoutUrl, null); assert.strictEqual(Object.keys(M.payments).length, nPay);
    const st = await (await fetch(B + "/print/api/order/" + r.j.orderId + "?t=" + r.j.token)).json(); assert.strictEqual(st.order.status, "invoice_requested");
    const inv = sevMock.state.invoices[sevMock.state.invoices.length - 1]; assert.strictEqual(inv.invoice.taxRule.id, "3"); assert.strictEqual(inv.invoicePosSave[0].taxRate, 0);
    assert.ok(/innergemeinschaftliche Lieferung/.test(inv.invoice.footText) && /DE123456789/.test(inv.invoice.footText));
    const bad = Object.assign({}, firm, { uid: "DE999999999" }); const up2 = await upload(await pdfOf(89, 59, 2), "firma2.pdf", BC);
    assert.strictEqual((await post("/print/api/order", order({ fileId: up2.j.fileId, fileToken: up2.j.token, payment: "invoice", customer: bad, expectedGross: 40.56 }))).status, 400, "ungültige UID → keine Rechnung");
    assert.strictEqual(M.orders.length, 1, "weiterhin keine automatische Print.com-Bestellung");
  });
  await t("Ablehnen/Erstatten: Mollie-Erstattung nur auf Klick, Rechnungsentwurf gelöscht, Kunde informiert", async () => {
    const up = await upload(await pdfOf(89, 59, 2), "ref.pdf", BC);
    const r = await post("/print/api/order", order({ fileId: up.j.fileId, fileToken: up.j.token })); const pid = r.j.checkoutUrl.split("/").pop();
    M.payments[pid].status = "paid"; await fetch(B + "/print/mollie-webhook", { method: "POST", body: "id=" + pid });
    assert.strictEqual(M.refunds.length, 0);
    const x = await admin("/admin/api/print/op", { op: "reject", id: r.j.orderId, confirm: true, reason: "Text im Beschnitt" }); assert.strictEqual(x.ok, true, JSON.stringify(x));
    assert.strictEqual(x.order.status, "rejected"); assert.strictEqual(M.refunds.length, 1); assert.deepStrictEqual(M.refunds[0].body.amount, { currency: "EUR", value: "40.56" });
    assert.ok(sevMock.state.deletedInvoices.indexOf(x.order.invoice.id) > -1);
    assert.ok(M.mails.some(m => m.to === "maria@example.com" && /nicht gedruckt/.test(m.text)));
  });
  await t("Einstellungen: automatisch senden + Produkt-Aufschlag aus dem Cockpit", async () => {
    let s = await admin("/admin/api/print/settings", { products: { visitenkarten: { markupPct: "50" } } }); assert.strictEqual(s.settings.products.visitenkarten.markupPct, 50);
    const r = await post("/print/api/price", Object.assign({ country: "AT" }, BC)); assert.strictEqual(r.j.price.net, 37.5);
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
