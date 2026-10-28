/* Weihnachtsabteilung /print/weihnachten (print-xmas.js, print-shop.js) und Startausführung des Konfigurators (startOf) gegen Attrappen (test/print-mocks.js).
   Aufruf: node test/print-weihnachten.test.js – server.js läuft in einer Temp-Kopie, echte Dienste werden nie angesprochen.
   Geprüft: Saison-Logik, Kalender mit altem Jahr, Liefertermin-Hinweise, nur Bilder über /print/bild/, kein Lieferanten-Name; Startausführung passend zu
   Mengen je Druckverfahren (Muster-Verfahren), Auflagen nur innerhalb der Mengen-Bereiche, nie mitgeschickte Personalisierung, Logistik-Angabe nur nach echter
   Preis-Ablehnung (nie bei Versand-Störung, nicht je Produkt gemerkt), Versand-Störung bei Aufpreisen = später nochmal, veraltete Weihnachts-Preise nie zeigen;
   Seite mit SEO (Titel, canonical, CollectionPage, Sitemap), Preise/Liefertermine aus dem 12-h-Zwischenspeicher, außerhalb der Saison 302 und keine Einstiege. */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto");
const createMocks = require("./print-mocks.js");

const ROOT = path.join(__dirname, "..");
const SECRET = "test-secret";
const COOKIE = "fsadmin=" + encodeURIComponent((v => v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("hex"))("s1." + Date.now()));
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Attrappen der Weihnachtsprodukte, nachgebaut nach den Live-Fehlern vom 28.10.2026 ──
const opt = (slug, name, extra) => Object.assign({ slug, name, nullable: false }, extra || {});
const urgency = { slug: "urgency", title: "Lieferzeit", locked: false, required: false, options: [opt("standard", "Standard")] };
const copies = (arr, rangeSets) => Object.assign({ slug: "copies", title: "Auflage", locked: false, required: true, options: arr.map(n => opt(String(n), String(n))) }, rangeSets ? { rangeSets } : {});
const XP = {
  // 1 Stk. nur als unbedrucktes Muster („sample“), gedruckt erst ab 25 im Siebdruck – und 4/0 gibt es im Siebdruck nicht (Vorauswahl war früher das Muster)
  "magnetic-gift-boxes": { sku: "magnetic-gift-boxes", bleed: 3, category: ["packaging-bags", "gift-packaging"], excludes: [[{ property: "printingmethod", options: ["screen_printing"] }, { property: "printtype", options: ["40"] }], [{ property: "printingmethod", options: ["sample"] }, { property: "printtype", options: ["10"] }]],
    properties: [{ slug: "color_material", title: "Farbe", locked: false, required: true, options: [opt("brown", "Braun"), opt("white", "Weiß")] },
      { slug: "printtype", title: "Druck", locked: false, required: true, options: [opt("40", "4/0 farbig"), opt("10", "1/0 Pantone")] },
      { slug: "printingmethod", title: "Druckverfahren", locked: false, required: true, options: [opt("screen_printing", "Siebdruck"), opt("sample", "Muster")] },
      copies([1, 25, 50, 100, 500], [{ printingmethod: "screen_printing", summary: [25, 50, 100, 500], options: [{ min: 25, max: 300, steps: 25 }, { min: 300, max: 1000, steps: 50 }] }, { printingmethod: "sample", summary: [1], options: [{ min: 1, max: 2, steps: 1 }] }]), urgency] },
  // Auflagen-Liste 5/25, druckbar aber erst ab 50
  "slider-boxes": { sku: "slider-boxes", bleed: 3, category: ["packaging-bags", "gift-packaging"], excludes: [],
    properties: [{ slug: "material", title: "Material", locked: false, required: true, options: [opt("1.5mm_corrugated_cardboard", "Wellpappe")] },
      { slug: "printingmethod", title: "Druckverfahren", locked: false, required: true, options: [opt("digital_die_cut", "Digital")] },
      copies([5, 25], [{ printingmethod: "digital_die_cut", summary: [50, 75, 100, 250, 500, 1000, 2000], options: [{ min: 50, max: 300, steps: 25 }, { min: 300, max: 2050, steps: 50 }] }]), urgency] },
  // bedruckt nur mit Personalisierung aus Excel (die der Shop nie mitschickt; ohne Angabe nimmt der Druckpartner „none“ an)
  "growing-paper-envelopes": { sku: "growing-paper-envelopes", bleed: 3, category: ["paper-print", "cards-envelopes"], implied: { personalize: "none" },
    excludes: [[{ property: "personalize", options: ["none"] }, { property: "printtype", options: ["10_black"] }], [{ property: "personalize", options: ["personalize_from_excel"] }, { property: "printtype", options: ["00"] }]],
    properties: [{ slug: "size", title: "Format", locked: false, required: true, options: [opt("c6", "DIN C6 - 162 x 114 mm", { width: "162", height: "114" }), opt("ea5", "EA5 - 220 x 156 mm", { width: "220", height: "156" })] },
      { slug: "printtype", title: "Druck", locked: false, required: true, options: [opt("10_black", "Einseitig schwarz (1/0)"), opt("00", "Unbedruckt")] },
      { slug: "personalize", title: "Personalisierung", locked: false, required: false, options: [opt("none", "Keine"), opt("personalize_from_excel", "Aus Excel")] },
      { slug: "printingmethod", title: "Druckverfahren", locked: false, required: true, options: [opt("digital", "Digital")] },
      copies([1, 10, 50, 100, 250], [{ printingmethod: "digital", summary: [1, 10, 50, 100, 250], options: [{ min: 1, max: 1000, steps: 1 }] }]), urgency] },
  // ohne Bündelung (Logistik-Angabe, die der Shop zuerst weglässt) kein Preis
  hangtags: { sku: "hangtags", bleed: 2, category: ["paper-print", "flyers-folders-posters"], needs: ["bundle"], excludes: [],
    properties: [{ slug: "size", title: "Format", locked: false, required: true, options: [opt("a7", "A7 - 74 x 105 mm", { width: "74", height: "105" }), opt("a6", "A6 - 105 x 148 mm", { width: "105", height: "148" })] },
      { slug: "printtype", title: "Druck", locked: false, required: true, options: [opt("40", "4/0"), opt("44", "4/4")] },
      { slug: "bundle", title: "Bündelung", locked: false, required: true, options: [opt("bundle_per_25", "je 25"), opt("bundle_per_50", "je 50")] },
      { slug: "printingmethod", title: "Druckverfahren", locked: false, required: true, options: [opt("digital", "Digital")] },
      copies([250, 500, 1000], [{ printingmethod: "digital", summary: [250, 500, 1000], options: [{ min: 1, max: 50000, steps: 1 }] }]), urgency] },
  // Bündelung wählbar, aber nicht nötig (Versand-Störung darf hier nie zum Mitschicken führen)
  "labels-on-roll": { sku: "labels-on-roll", bleed: 2, category: ["stickers-tapes", "stickers-on-roll"], excludes: [],
    properties: [{ slug: "size", title: "Format", locked: false, required: true, options: [opt("40x40", "40 x 40 mm", { width: "40", height: "40" }), opt("50x50", "50 x 50 mm", { width: "50", height: "50" })] },
      { slug: "bundle", title: "Bündelung", locked: false, required: true, options: [opt("bundle_per_25", "je 25"), opt("bundle_per_50", "je 50")] },
      { slug: "printingmethod", title: "Druckverfahren", locked: false, required: true, options: [opt("digital", "Digital")] },
      copies([250, 500, 1000], [{ printingmethod: "digital", summary: [250, 500, 1000], options: [{ min: 1, max: 50000, steps: 1 }] }]), urgency] },
  "christmas-baubles": { sku: "christmas-baubles", bleed: 0, category: ["gifts-merchandise-promotional", "seasonal"], excludes: [],
    properties: [{ slug: "color_material", title: "Farbe", locked: false, required: true, options: [opt("red", "Rot"), opt("blue", "Blau")] },
      { slug: "size", title: "Größe", locked: false, required: true, options: [opt("christmas_ball_8cm", "Kugel 8 cm")] },
      { slug: "printingmethod", title: "Druckverfahren", locked: false, required: true, options: [opt("digital_uv", "UV")] },
      copies([1, 25, 50, 100, 250, 500]), urgency] },
  // Jahreskalender mit altem Jahr im Namen: nicht vorschlagen
  "month-calendars": { sku: "month-calendars", bleed: 3, category: ["paper-print", "calendars"], excludes: [],
    properties: [{ slug: "calendar_type", title: "Typ", locked: false, required: true, options: [opt("q100", "3-Monatskalender"), opt("q104", "4-Monatskalender")] },
      { slug: "printingmethod", title: "Druckverfahren", locked: false, required: true, options: [opt("offset", "Offset")] }, copies([100, 250, 500]), urgency] }
};
const XL = [{ sku: "magnetic-gift-boxes", titlePlural: "Magnet Geschenkboxen", active: true }, { sku: "slider-boxes", titlePlural: "Schiebeschachteln", active: true }, { sku: "growing-paper-envelopes", titlePlural: "Briefumschläge aus Saatpapier", active: true },
  { sku: "hangtags", titlePlural: "Hängeetiketten $& $' Gold", active: true }, { sku: "labels-on-roll", titlePlural: "Aufkleber auf Rolle", active: true }, { sku: "christmas-baubles", titlePlural: "Christbaumkugeln", active: true }, { sku: "month-calendars", titlePlural: "Monatskalender 2026", active: true }];

function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-xmas-"));
  fs.readdirSync(ROOT).filter(f => /\.(js|html|css|xml|txt|webmanifest|json)$/.test(f) && fs.statSync(path.join(ROOT, f)).isFile()).forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  const cpDir = (d) => { fs.mkdirSync(path.join(dir, d), { recursive: true }); fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => { if (e.isDirectory()) cpDir(path.join(d, e.name)); else fs.copyFileSync(path.join(ROOT, d, e.name), path.join(dir, d, e.name)); }); };
  ["admin-cockpit", "print", "logos"].forEach(d => { if (fs.existsSync(path.join(ROOT, d))) cpDir(d); });
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}
async function startServer(dir, env) {
  const port = 5900 + Math.floor(Math.random() * 600);
  const e = Object.assign({}, process.env, { PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x", PRINT_ANCHORS_FILE: "off", PRINT_IMPORT: "0", PRINT_XMAS_PAUSE_MS: "0" }, env);
  ["BLITZDINGS_STATS_URL", "BLITZDINGS_STATS_TOKEN", "RAILWAY_API_TOKEN", "CF_API_TOKEN", "ANTHROPIC_API_KEY", "DATABASE_URL", "PRINT_SECRET"].forEach((k) => { if (!(k in env)) delete e[k]; });
  const srv = cp.spawn(process.execPath, ["server.js"], { cwd: dir, env: e, stdio: ["ignore", "pipe", "pipe"] });
  srv.out = ""; srv.stdout.on("data", (d) => (srv.out += d)); srv.stderr.on("data", (d) => (srv.out += d));
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 100; i++) { try { await fetch(base + "/admin/login"); break; } catch (er) { await sleep(100); } }
  srv.base = base; return srv;
}
const stop = srv => new Promise(r => { srv.once("exit", r); srv.kill(); });

(async () => {
  // ── 1) print-xmas.js direkt: Saison, Texte, Darstellung ──
  const X = require(path.join(ROOT, "print-xmas.js"));
  const PB = require(path.join(ROOT, "print-bild.js"));
  delete process.env.PRINT_XMAS;
  await t("Saison: sichtbar 15.10.–6.1. (Wien), Liefertermin-Hinweise bis 23.12., Jahr der Weihnacht", async () => {
    const s = d => X.season(d);
    assert.strictEqual(s("2026-10-14T10:00:00Z").on, false, "14.10. noch nicht");
    assert.strictEqual(s("2026-10-14T22:30:00Z").on, true, "15.10. 00:30 in Wien (UTC 14.10. 22:30) – Wiener Datum zählt");
    assert.deepStrictEqual([s("2026-10-28T12:00:00Z").on, s("2026-10-28T12:00:00Z").before, s("2026-10-28T12:00:00Z").deadline], [true, true, "2026-12-23"]);
    assert.strictEqual(s("2026-12-23T20:00:00Z").before, true); assert.strictEqual(s("2026-12-24T08:00:00Z").before, false, "ab 24.12. keine „rechtzeitig“-Hinweise mehr");
    assert.deepStrictEqual([s("2027-01-06T12:00:00Z").on, s("2027-01-06T12:00:00Z").year], [true, 2026], "6.1. noch sichtbar, Weihnachten 2026");
    assert.strictEqual(s("2027-01-07T12:00:00Z").on, false, "7.1. vorbei");
    process.env.PRINT_XMAS = "0"; try { assert.strictEqual(s("2026-11-20T12:00:00Z").on, false, "PRINT_XMAS=0 schaltet ab"); } finally { delete process.env.PRINT_XMAS; }
    process.env.PRINT_XMAS = "1"; try { assert.strictEqual(s("2026-08-01T12:00:00Z").on, true, "PRINT_XMAS=1 erzwingt (Vorschau)"); } finally { delete process.env.PRINT_XMAS; }
  });
  await t("Themen: 9 Themen mit eindeutigen Sprungmarken, eigene Texte in Du-Form, Bilder nur aus dem Contentful-Space, Proxy bedient alle Pfade", async () => {
    assert.strictEqual(X.THEMES.length, 9); assert.strictEqual(new Set(X.THEMES.map(x => x.slug)).size, 9);
    const paths = [X.HERO.img];
    X.THEMES.forEach(th => { assert.ok(th.title && th.text.length > 60 && th.text.length < 220 && th.items.length >= 4, th.slug); assert.ok(!/print\.com/i.test(th.title + th.text + th.alt + th.nav), "kein Lieferanten-Name: " + th.slug);
      paths.push(th.tile[0]); if (th.banner) paths.push(th.banner[0]); th.items.forEach(i => { assert.ok(/^[\w-]+$/.test(i[0]) && i[1] && i[2], JSON.stringify(i)); paths.push(i[2]); }); });
    paths.forEach(p => { assert.ok(!/print\.com/i.test(p), "Dateiname ohne Lieferanten-Namen: " + p); assert.ok(PB._test.upstreamUrl(PB.PREFIX + "ez9mp376cw6o/" + p, "?fm=webp&w=400&q=75"), "Bild-Proxy lehnt ab: " + p); });
    assert.ok(X.keys().length > 80 && X.keys().length === new Set(X.keys()).size);
  });
  await t("Darstellung: nur freigeschaltete Produkte mit Preis, „ab … für N Stk.“, Liefertermin, „kommt erst nach Weihnachten“, Kalender mit altem Jahr und Pullover ausgeblendet", async () => {
    const sea = X.season("2026-11-20T12:00:00Z"), shown = { postcards: 1, "card-sets": 1, "luxurious-postcards": 1, "month-calendars": 1, "christmas-sweater": 1, "christmas-hats": 1, "glove-touch": 1, "wooden-postcards": 1, "growing-paper-cards": 1 };
    const data = { postcards: { ok: true, gross: 45.72, copies: 250, start: 250, date: "2026-12-02" }, "card-sets": { ok: true, gross: 69.24, copies: 250, start: 250, date: "2026-12-28" },
      "luxurious-postcards": { ok: false, why: "kein Preis" }, "month-calendars": { ok: false, stale: true }, "christmas-hats": { ok: true, promo: true, gross: 1061.4, copies: 500, start: 500, date: "2026-12-10" },
      "glove-touch": { ok: true, promo: true, gross: 800, copies: 250, start: 500, date: "2026-12-11" } };
    const r = X.render(data, shown, sea), h = r.html;
    assert.ok(/data-prod="postcards"/.test(h) && /ab <b>45,72 €<\/b><small>für 250 Stk\. · 0,18 €\/Stk\.<\/small>/.test(h), "Preiszeile: ab-Preis, Menge, Stückpreis");
    assert.ok(/Lieferung voraussichtlich ab <span class="xm-dd">Mi\. 2\.12\.<\/span>/.test(h), "frühester Liefertermin");
    assert.ok(/class="xm-card is-late"[^>]*data-prod="card-sets"/.test(h) && /Kommt erst nach Weihnachten an \(voraussichtlich ab <span class="xm-dd">Mo\. 28\.12\.<\/span>\)/.test(h), "zu spät für Weihnachten");
    assert.ok(!/data-prod="luxurious-postcards"/.test(h), "ohne Preis ausgeblendet"); assert.ok(!/data-prod="month-calendars"/.test(h), "Kalender 2026 ausgeblendet");
    assert.ok(!/data-prod="christmas-sweater"/.test(h), "Pullover nie (Druckpartner verlangt eine Eigenschaft, die es im Shop nicht gibt)");
    assert.ok(/data-prod="wooden-postcards"/.test(h), "noch ohne Prüfung: sichtbar, ohne Preis");
    assert.ok(/ab <b>2,12 €<\/b>\/Stk\./.test(h), "Werbeartikel: Stückpreis");
    assert.ok(/href="\/print\?produkt=glove-touch&amp;menge=250" data-prod="glove-touch" data-copies="250"/.test(h), "andere Menge als die Startauflage: Link mit Menge");
    assert.ok(!/images\.ctfassets\.net/.test(h) && !/print\.com/i.test(h), "keine direkten Contentful-Links, kein Lieferanten-Name");
    (h.match(/<img [^>]*>/g) || []).forEach(im => { assert.ok(/ src="\/print\/bild\/ez9mp376cw6o\//.test(im) && / alt="/.test(im) && / width="\d+" height="\d+"/.test(im), "Bild über Proxy, alt, feste Maße: " + im.slice(0, 120)); });
    assert.ok((h.match(/loading="lazy"/g) || []).length >= (h.match(/<img /g) || []).length - 1, "alles außer dem Titelbild lazy");
    assert.ok(r.keys.indexOf("postcards") > -1 && r.keys.indexOf("luxurious-postcards") < 0);
    const after = X.render(data, shown, X.season("2026-12-27T12:00:00Z")).html; assert.ok(!/is-late|Kommt erst nach Weihnachten/.test(after), "nach Weihnachten keine Hinweise");
    assert.ok(X.staleYear("Monatskalender 2026", sea) && !X.staleYear("Monatskalender 2027", sea) && !X.staleYear("Tischkalender", sea));
  });

  // ── 2) Server mit Attrappen: Startausführung, Preise, Seite ──
  const mocks = createMocks({ products: XP, list: XL }); await new Promise(r => mocks.server.listen(0, "127.0.0.1", r)); const M = mocks.state, mbase = "http://127.0.0.1:" + mocks.server.address().port;
  const soon = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10); M.possOf = u => [{ carrier: "DPD", method: "DPD_B2C", deliveryDate: soon, pickupDate: soon, urgency: u, price: { base: 5, cost: 5, urgency: 0 } }];   // Liefertermin in der Zukunft (vergangene Termine zeigt die Seite nie)
  const dir = copyApp();
  const env = { PRINT_SHOP_LIVE: "1", PRINTCOM_API_KEY: "pc-test-key", PRINTCOM_BASE: mbase + "/pc", PRINT_CMS_BASE: mbase + "/cms", MAIL_API_URL: mbase + "/mail/api/mails", MAIL_API_TOKEN: "mt", PRINT_XMAS: "1" };
  // veralteter Stand vom Vorjahr im Zwischenspeicher: darf nie angezeigt werden (kein alter Preis, kein vergangenes Lieferdatum)
  fs.mkdirSync(path.join(dir, "print-shop"), { recursive: true });
  fs.writeFileSync(path.join(dir, "print-shop", "print_xmas.json"), JSON.stringify({ at: "2025-12-01T10:00:00.000Z", items: { "magnetic-gift-boxes": { ok: true, gross: 999.99, copies: 500, start: 500, date: "2025-12-03", at: "2025-12-01T10:00:00.000Z", title: "Alt" } } }));
  let srv = await startServer(dir, env); const B = srv.base;
  const admin = (p, body) => fetch(B + p, { method: body ? "POST" : "GET", headers: { cookie: COOKIE, "content-type": "application/json", origin: B }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());
  const post = async (p, body) => { const r = await fetch(B + p, { method: "POST", headers: { "content-type": "application/json", "x-print-shop": "1", origin: B }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const prod = async k => (await (await fetch(B + "/print/api/product?key=" + k)).json()).product;
  try {
    await (await fetch(B + "/print/api/catalog")).json();
    for (const x of XL) await admin("/admin/api/print/sortiment", { op: "set", sku: x.sku, on: true });
    await t("Startausführung: Menge 1 nur als Muster → Konfigurator startet mit 500 Stk. und einer Auswahl, die das Siebdruck-Verfahren kann (sofort ein Preis)", async () => {
      const p = await prod("magnetic-gift-boxes"); assert.ok(p && p.start, JSON.stringify(p));
      assert.strictEqual(p.start.copies, 500); assert.strictEqual(p.start.sel.printtype, "10", "4/0 geht im Siebdruck nicht");
      assert.strictEqual(p.defaults.printtype, "10", "auch die Vorauswahl passt zur Startauflage (nicht zum 1-Stück-Muster)");
      const r = await post("/print/api/price", { product: p.key, copies: p.start.copies, sel: p.start.sel, country: "AT" }); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
      const r1 = await post("/print/api/price", { product: p.key, copies: 1, sel: p.start.sel, country: "AT" }); assert.ok(r1.status === 400 && /Druckverfahren/.test(r1.j.error), "1 Stk. bedruckt geht nicht: " + JSON.stringify(r1.j));
    });
    await t("Auflagen nur innerhalb der Mengen-Bereiche (Liste 5/25, druckbar ab 50) → Start mit Preis", async () => {
      const p = await prod("slider-boxes"); assert.ok(p.tiers.length && p.tiers.every(n => n >= 50), "Auflagen " + p.tiers.join("/"));
      assert.ok(p.tiers.indexOf(p.start.copies) > -1); const r = await post("/print/api/price", { product: p.key, copies: p.start.copies, sel: p.start.sel, country: "AT" }); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    });
    await t("Nie mitgeschickte Personalisierung zählt als „ohne“: Saatpapier-Kuverts starten unbedruckt mit Preis, bedruckt = nicht lieferbar, „personalize“ wird nie gesendet", async () => {
      const p = await prod("growing-paper-envelopes"); assert.strictEqual(p.start.sel.printtype, "00"); assert.strictEqual(p.defaults.printtype, "00");
      assert.ok(!p.props.some(x => x.slug === "personalize"), "Personalisierung nicht wählbar");
      const n0 = M.log.length, r = await post("/print/api/price", { product: p.key, copies: p.start.copies, sel: p.start.sel, country: "AT" }); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
      assert.ok(M.log.slice(n0).filter(l => /\/price$/.test(l.path)).every(l => !("personalize" in (l.body.options || {}))), "personalize nie an den Druckpartner");
      const r2 = await post("/print/api/price", { product: p.key, copies: 250, sel: Object.assign({}, p.start.sel, { printtype: "10_black" }), country: "AT" }); assert.ok(r2.status === 400 && /nicht lieferbar/.test(r2.j.error), JSON.stringify(r2.j));
    });
    await t("Logistik-Angabe (Bündelung) nur nach echter Preis-Ablehnung, als letzte Ausweich-Variante – ohne Angabe immer zuerst, nichts je Produkt gemerkt; bestellt wird, was gerechnet wurde", async () => {
      const p = await prod("hangtags"), calls = n => M.log.slice(n).filter(l => /hangtags\/price$/.test(l.path)).map(l => l.body.options.bundle || "-"); let n0 = M.log.length;
      const r = await post("/print/api/price", { product: p.key, copies: p.start.copies, sel: p.start.sel, country: "AT" }); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
      assert.deepStrictEqual(calls(n0), ["-", "bundle_per_25"], "erst ohne, dann mit Bündelung");
      n0 = M.log.length; await post("/print/api/price", { product: p.key, copies: p.start.copies, sel: p.start.sel, country: "AT" }); assert.deepStrictEqual(calls(n0), [], "gleiche Auswahl: aus dem Zwischenspeicher (Ablehnung 10 min gemerkt)");
      n0 = M.log.length; const r2 = await post("/print/api/price", { product: p.key, copies: 1000, sel: p.start.sel, country: "AT" }); assert.strictEqual(r2.status, 200);
      assert.deepStrictEqual(calls(n0), ["-", "bundle_per_25"], "andere Auswahl: wieder zuerst ohne Angabe");
      const q = await admin("/admin/api/print/quote", { product: p.key, sel: p.start.sel, copies: 1000, urgency: "standard" }); assert.ok(q.ok && q.pcOpts && q.pcOpts.bundle === "bundle_per_25", "Bestell-Optionen = gerechnete Optionen: " + JSON.stringify(q.pcOpts));
    });
    await t("Versand-Störung: keine Logistik-Angabe nachschicken, nichts merken; Aufpreise „später nochmal“ statt „nicht lieferbar“", async () => {
      const p = await prod("labels-on-roll"), calls = n => M.log.slice(n).filter(l => /labels-on-roll\/price$/.test(l.path)).map(l => l.body.options.bundle || "-"); let n0 = M.log.length;
      const pp = M.possOf; M.possOf = () => [];   // Versand antwortet leer (kurze Störung)
      try {
        const r = await post("/print/api/price", { product: p.key, copies: 500, sel: p.start.sel, country: "AT" }); assert.ok(r.status === 400 && /Versand/.test(r.j.error), JSON.stringify(r.j));
        assert.ok(calls(n0).every(x => x === "-"), "bei Versand-Ablehnung nie mit Bündelung: " + calls(n0));
        const d = await post("/print/api/deltas", { product: p.key, copies: 500, sel: p.start.sel, country: "AT", alts: [{ k: "50x50", sel: Object.assign({}, p.start.sel, { size: "50x50" }) }] });
        assert.ok(d.j.ok && d.j.busy === true && !(d.j.d && d.j.d["50x50"] && d.j.d["50x50"].off), "Aufpreise: später nochmal " + JSON.stringify(d.j));
      } finally { M.possOf = pp; }
      n0 = M.log.length; const r2 = await post("/print/api/price", { product: p.key, copies: 1000, sel: p.start.sel, country: "AT" }); assert.strictEqual(r2.status, 200, JSON.stringify(r2.j));
      assert.deepStrictEqual(calls(n0), ["-"], "danach wieder ohne Angabe (nichts gemerkt)");
    });
    await t("„ab“-Preis ohne Auswahl = Startausführung (auch allgemeine Produkte)", async () => {
      const f = await (await fetch(B + "/print/api/from?keys=magnetic-gift-boxes,slider-boxes,hangtags")).json();
      assert.ok(f.from["magnetic-gift-boxes"] && f.from["magnetic-gift-boxes"].copies === 500 && f.from["slider-boxes"] && f.from.hangtags, JSON.stringify(f));
    });
    await t("Seite /print/weihnachten: serverseitig mit SEO, nur freigeschaltete Vorschläge, Bilder über den Proxy, Einstiege in Shop/Sitemap/Website", async () => {
      const r = await fetch(B + "/print/weihnachten"), h = await r.text(); assert.strictEqual(r.status, 200);
      assert.ok(!/999,99/.test(h) && !/3\.12\./.test(h), "veralteter Preis/Liefertermin aus dem Vorjahr wird nicht gezeigt");
      assert.ok(h.indexOf("Hängeetiketten $& $' Gold") > -1 && (h.match(/<\/head>/g) || []).length === 1 && (h.match(/<title>/g) || []).length === 1, "Sonderzeichen in Namen verändern das HTML nicht: " + (h.match(/"@type":"ItemList".{0,600}/) || [""])[0] + " head=" + (h.match(/<\/head>/g) || []).length + " title=" + (h.match(/<title>/g) || []).length);
      assert.ok(/<title>Weihnachten \d{4}: Karten, Kalender &amp; Geschenke mit Logo drucken \| FS Creative Druckshop<\/title>/.test(h), "Titel");
      assert.ok(/<link rel="canonical" href="https:\/\/www\.fs-creative\.at\/print\/weihnachten"/.test(h) && /<meta name="description" content="Weihnachtskarten/.test(h));
      assert.ok(/"@type":"CollectionPage"/.test(h) && /"@type":"BreadcrumbList".*"name":"Weihnachten"/.test(h), "strukturierte Daten");
      assert.ok(/<h1 id="xmH">/.test(h) && /class="ps-loading ps-xmas-ssr"/.test(h) && /rel="preload" as="image"/.test(h));
      assert.ok(/data-prod="magnetic-gift-boxes"/.test(h) && /data-prod="hangtags"/.test(h), "freigeschaltete Produkte: " + (h.match(/data-prod="[^"]+"/g) || []).join(" "));
      assert.ok(/id="verpacken"/.test(h) && !/id="dekorieren"/.test(h) && !/data-prod="christmas-baubles"/.test(h), "Themen mit nur einem freigeschalteten Vorschlag entfallen");
      assert.ok(!/data-prod="postcards"/.test(h) && !/data-prod="month-calendars"/.test(h), "nicht freigeschaltet bzw. altes Kalenderjahr");
      assert.ok(!/images\.ctfassets\.net/.test(h) && !/print\.com/i.test(h.replace(/<script[\s\S]*?<\/script>/g, "")), "keine direkten Bildlinks, kein Lieferanten-Name im Seitentext");
      assert.ok(/class="ps-xnav active" data-xnav aria-current="page"/.test(h), "Navigation „Weihnachten“ aktiv");
      const shop = await (await fetch(B + "/print")).text(); assert.ok(/href="\/print\/weihnachten" class="ps-xnav" data-xnav/.test(shop) && !/<!--XMAS-->/.test(shop), "Navigationspunkt im Shop");
      const cat = await (await fetch(B + "/print/api/catalog")).json(); assert.ok(cat.xmas && cat.xmas.img && cat.xmas.year, "Teaser-Daten für die Startseite");
      const sm = await (await fetch(B + "/sitemap.xml")).text(); assert.ok(/<loc>https:\/\/www\.fs-creative\.at\/print\/weihnachten<\/loc>/.test(sm), "Sitemap");
      const idx = await (await fetch(B + "/")).text(); assert.ok(/href="\/print\/weihnachten" class="hx-more hx-xm"/.test(idx) && !/PRINT_XMAS/.test(idx), "Hinweis auf der Website-Startseite");
      const app = fs.readFileSync(path.join(ROOT, "print", "app.js"), "utf8"); assert.ok(/S\.view === "xmas"/.test(app) && /function setCopies/.test(app) && /function xmasTeaser/.test(app), "Shop-Ansicht, Menge aus Link, Teaser");
      assert.ok(/if \(lk\) \{ if \(!S\.cat \|\| e\.metaKey/.test(app) && /function prodByKey\(k\) \{ return \(\(S\.cat && S\.cat\.products\) \|\| \[\]\)/.test(app), "Klick auf Produktkarte, bevor der Shop geladen ist: normaler Link statt Fehler");
    });
    await t("Preise & Liefertermine: im Hintergrund geprüft und zwischengespeichert (nicht je Seitenaufruf), Produkte ohne Preis verschwinden", async () => {
      let h = ""; for (let i = 0; i < 100; i++) { h = await (await fetch(B + "/print/weihnachten")).text(); if (/data-prod="hangtags"[\s\S]*?xm-p"/.test(h) && /Lieferung voraussichtlich ab/.test(h)) break; await sleep(150); }
      assert.ok(/data-prod="magnetic-gift-boxes"[^>]*>[\s\S]*?ab <b>[\d.,  ]+ €<\/b><small>für 500 Stk\./.test(h), "Preis zur Startausführung");
      assert.ok(/Lieferung voraussichtlich ab/.test(h), "Liefertermin");
      const n0 = M.log.filter(l => /\/price$/.test(l.path)).length; for (let i = 0; i < 3; i++) await fetch(B + "/print/weihnachten"); await sleep(200);
      assert.strictEqual(M.log.filter(l => /\/price$/.test(l.path)).length, n0, "Seitenaufrufe fragen den Druckpartner nicht");
      assert.ok(/Weihnachtsabteilung geprüft – \d+ Vorschläge mit Preis/.test(srv.out), "Protokoll");
    });
    await t("Newsletter in der Saison: Vorschau mit Weihnachtsblock aus dem Zwischenspeicher (Bilder über unseren Proxy als JPG), Testmail mit Weihnachtsbetreff und Link im Text-Teil", async () => {
      // nächster Montag mit „rechtzeitig“-Hinweisen (PRINT_XMAS=1 erzwingt die Saison; Liefertermine zählen bis 23.12.)
      let mon = ""; for (let i = 1; i < 400 && !mon; i++) { const iso = X.viennaDay(Date.now() + i * 864e5), md = iso.slice(5); if (new Date(iso + "T12:00:00Z").getUTCDay() === 1 && md >= "07-01" && md <= "12-16") mon = iso; }
      const pv = await admin("/admin/api/print/newsletter", { op: "preview", monday: mon }), h = pv.html || "";
      assert.ok(pv.ok && /Weihnachten mit deinem Design<\/div>/.test(h) && /Weihnachtsideen ansehen<\/a>/.test(h) && /\/print\/weihnachten\?utm_source=newsletter&amp;utm_campaign=kw\d+/.test(h), "Weihnachtsblock: " + (pv.error || h.slice(0, 200)));
      assert.ok((h.match(/ab <b[^>]*>€ [\d.,]+<\/b> <span[^>]*>für [\d.]+ Stk\.<\/span>/g) || []).length >= 2, "Vorschläge mit Preis aus dem Zwischenspeicher");
      (h.match(/<img [^>]*>/g) || []).forEach(im => { assert.ok(/ src="https?:\/\/[^/"]+\/(print\/bild\/ez9mp376cw6o\/[^"]*fm=jpg|logos\/)/.test(im), "Bild über unseren Proxy (JPG): " + im.slice(0, 160)); });
      assert.ok(!/images\.ctfassets\.net|fm=webp/.test(h) && !/print\.?com/i.test(h), "nie Contentful direkt, kein WebP, kein Lieferanten-Name");
      const n0 = M.mails.length; await admin("/admin/api/print/newsletter", { op: "test", monday: mon, to: "simon@fs-creative.at" });
      let tm = null; for (let i = 0; i < 40 && !tm; i++) { tm = M.mails.slice(n0).find(m => /^\[Test\] Weihnachten mit deinem Design \(KW \d+\)/.test(m.subject)); if (!tm) await sleep(50); }
      assert.ok(tm, "Testmail mit Weihnachtsbetreff: " + M.mails.slice(n0).map(m => m.subject).join(" | "));
      assert.ok(/\nWEIHNACHTEN MIT DEINEM DESIGN\n/.test(tm.text) && /Weihnachtsideen ansehen: https?:\/\/[^\s]+\/print\/weihnachten\?utm_source=newsletter&utm_campaign=kw\d+/.test(tm.text), "Text-Teil mit Link");
    });
  } finally { await stop(srv); }
  // ── 3) außerhalb der Saison: 302, keine Einstiege ──
  srv = await startServer(dir, Object.assign({}, env, { PRINT_XMAS: "0" }));
  try {
    await t("außerhalb der Saison: /print/weihnachten → 302 /print, kein Navigationspunkt, kein Teaser, nicht in der Sitemap, kein Hinweis auf der Website", async () => {
      const r = await fetch(srv.base + "/print/weihnachten", { redirect: "manual" }); assert.strictEqual(r.status, 302); assert.strictEqual(r.headers.get("location"), "/print"); assert.ok(/noindex/.test(r.headers.get("x-robots-tag") || ""));
      const shop = await (await fetch(srv.base + "/print")).text(); assert.ok(!/data-xnav/.test(shop) && !/<!--XMAS-->/.test(shop));
      const pp = await (await fetch(srv.base + "/print/preise")).text(); assert.ok(!/data-xnav/.test(pp) && !/<!--XMAS-->/.test(pp), "auch nicht in der Preisübersicht");
      const cat = await (await fetch(srv.base + "/print/api/catalog")).json(); assert.strictEqual(cat.xmas, null);
      const sm = await (await fetch(srv.base + "/sitemap.xml")).text(); assert.ok(!/print\/weihnachten/.test(sm));
      const idx = await (await fetch(srv.base + "/")).text(); assert.ok(!/hx-xm"/.test(idx) && !/PRINT_XMAS/.test(idx));
    });
  } finally { await stop(srv); mocks.server.close(); }

  if (fail) { console.log(fails.join("\n\n")); console.log("\nFEHLER: " + pass + " bestanden, " + fail + " fehlgeschlagen"); process.exit(1); }
  console.log("OK: " + pass + " bestanden, 0 fehlgeschlagen");
})().catch(e => { console.error(e); process.exit(1); });
