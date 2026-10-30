/* Auffindbarkeit des Druckshops: IndexNow (indexnow.js), Google-Merchant-Center-Feed /print/merchant.xml und Rückgaberichtlinie im JSON-LD (print-shop.js).
   Aufruf: node test/sichtbarkeit.test.js – server.js läuft in einer Temp-Kopie gegen Attrappen (test/print-mocks.js + IndexNow-Attrappe), echte Dienste werden nie angesprochen.
   Geprüft: fester öffentlicher Schlüssel + Schlüsseldatei, Meldung nur in Produktion, nur neue/geänderte/entfernte Adressen (Stand je URL), höchstens 1× am Tag,
   10 000er-Pakete, Fehler nur im Log; Feed mit Pflichtfeldern, Bild über den Bild-Proxy, nie der Lieferanten-Name, Preis = Preis der Produktseite für dieselbe Menge,
   Link zeigt genau diese Menge, zwischengespeichert, nicht in der Sitemap, nur bei öffentlichem Shop; JSON-LD „keine Rückgabe“ passend zu den AGB. */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto"), http = require("http");
const createMocks = require("./print-mocks.js");

const ROOT = path.join(__dirname, "..");
const SECRET = "test-secret";
const COOKIE = "fsadmin=" + encodeURIComponent((v => v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("hex"))("s1." + Date.now()));
const SITE = "https://www.fs-creative.at";
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ENV_KEYS = ["NODE_ENV", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_ENVIRONMENT", "INDEXNOW", "INDEXNOW_API"];
async function withEnv(vals, fn) {
  const old = {}; ENV_KEYS.forEach(k => { old[k] = process.env[k]; delete process.env[k]; });
  Object.keys(vals).forEach(k => { if (vals[k] != null) process.env[k] = vals[k]; });
  try { return await fn(); } finally { ENV_KEYS.forEach(k => { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; }); }
}
// IndexNow-Attrappe: protokolliert jede Meldung, Antwort-Status einstellbar
function indexNowMock() {
  const st = { calls: [], status: 200 };
  st.server = http.createServer((q, s) => { let b = ""; q.on("data", c => (b += c)); q.on("end", () => { let body = null; try { body = JSON.parse(b); } catch (e) {} st.calls.push({ method: q.method, path: q.url, type: q.headers["content-type"] || "", body }); s.writeHead(st.status, { "content-type": "text/plain" }); s.end(st.status === 429 ? "Too Many Requests" : ""); }); });
  return st;
}
function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-sicht-"));
  fs.readdirSync(ROOT).filter(f => /\.(js|html|css|xml|txt|webmanifest|json)$/.test(f) && fs.statSync(path.join(ROOT, f)).isFile()).forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  const cpDir = (d) => { fs.mkdirSync(path.join(dir, d), { recursive: true }); fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => { if (e.isDirectory()) cpDir(path.join(d, e.name)); else fs.copyFileSync(path.join(ROOT, d, e.name), path.join(dir, d, e.name)); }); };
  ["admin-cockpit", "print", "logos"].forEach(d => { if (fs.existsSync(path.join(ROOT, d))) cpDir(d); });
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}
async function startServer(dir, env) {
  const port = 6500 + Math.floor(Math.random() * 600);
  const e = Object.assign({}, process.env, { PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x", PRINT_ANCHORS_FILE: "off", PRINT_XMAS: "0" }, env);
  ["BLITZDINGS_STATS_URL", "BLITZDINGS_STATS_TOKEN", "RAILWAY_API_TOKEN", "CF_API_TOKEN", "ANTHROPIC_API_KEY", "DATABASE_URL", "PRINT_SECRET", "NODE_ENV"].concat(ENV_KEYS).forEach((k) => { if (!(k in env)) delete e[k]; });
  Object.keys(env).forEach(k => { if (env[k] === undefined) delete e[k]; });
  const srv = cp.spawn(process.execPath, ["server.js"], { cwd: dir, env: e, stdio: ["ignore", "pipe", "pipe"] });
  srv.out = ""; srv.stdout.on("data", (d) => (srv.out += d)); srv.stderr.on("data", (d) => (srv.out += d));
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 100; i++) { try { await fetch(base + "/admin/login"); break; } catch (er) { await sleep(100); } }
  srv.base = base; return srv;
}
const stop = srv => new Promise(r => { if (srv.exitCode != null) return r(); srv.once("exit", r); srv.kill(); });
const tagOf = (item, k) => { const m = item.match(new RegExp("<g:" + k + ">([\\s\\S]*?)</g:" + k + ">")); return m ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'") : null; };
const ldOf = html => (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || []).map(s => { try { return JSON.parse(s.replace(/^<script[^>]*>|<\/script>$/g, "")); } catch (e) { return null; } }).filter(Boolean);

(async () => {
  const IN = require(path.join(ROOT, "indexnow.js"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-indexnow-"));
  const im = indexNowMock(); await new Promise(r => im.server.listen(0, "127.0.0.1", r)); const ibase = "http://127.0.0.1:" + im.server.address().port;
  const mk = o => IN(Object.assign({ DATA_DIR: tmp, origin: SITE, entries: async () => [] }, o));

  // ── 1) IndexNow-Modul direkt ──
  await t("IndexNow: fester öffentlicher Schlüssel (32 Hex) unter /<Schlüssel>.txt, nur in Produktion (Railway „production“, www.fs-creative.at, nie in Tests)", async () => {
    assert.ok(/^[a-f0-9]{32}$/.test(IN.KEY), IN.KEY);
    const m = mk(); assert.strictEqual(m.KEY_PATH, "/" + IN.KEY + ".txt"); assert.strictEqual(m.keyLocation, SITE + "/" + IN.KEY + ".txt");
    let sent = null; const res = {}; const send = (r, code, body, type, h) => { sent = { code, body, type, h }; };
    assert.strictEqual(m.handle({ method: "GET" }, res, m.KEY_PATH, send), true); assert.deepStrictEqual([sent.code, sent.body, sent.type], [200, IN.KEY, "text/plain; charset=utf-8"]);
    sent = null; assert.strictEqual(m.handle({ method: "GET" }, res, "/0123456789abcdef0123456789abcdef.txt", send), false); assert.strictEqual(sent, null);
    assert.strictEqual(m.handle({ method: "POST" }, res, m.KEY_PATH, send), false);
    await withEnv({}, () => { assert.strictEqual(m.production(), false, "lokal"); assert.strictEqual(m.start(), false, "start() ohne Produktion: nichts geplant"); });
    await withEnv({ RAILWAY_ENVIRONMENT_NAME: "production" }, () => { assert.strictEqual(m.production(), true); assert.strictEqual(mk({ origin: "https://fs-creative.up.railway.app" }).production(), false, "nur www.fs-creative.at"); });
    await withEnv({ RAILWAY_ENVIRONMENT: "production" }, () => assert.strictEqual(m.production(), true, "ältere Railway-Variable"));
    await withEnv({ RAILWAY_ENVIRONMENT_NAME: "staging" }, () => assert.strictEqual(m.production(), false, "andere Umgebung"));
    await withEnv({ RAILWAY_ENVIRONMENT_NAME: "staging", INDEXNOW: "1" }, () => assert.strictEqual(m.production(), true, "INDEXNOW=1 erzwingt"));
    await withEnv({ RAILWAY_ENVIRONMENT_NAME: "production", NODE_ENV: "test" }, () => assert.strictEqual(m.production(), false, "Tests nie"));
    await withEnv({ RAILWAY_ENVIRONMENT_NAME: "production", INDEXNOW: "0" }, () => assert.strictEqual(m.production(), false, "INDEXNOW=0 schaltet ab"));
  });
  await t("IndexNow: nicht in Produktion → keine Meldung", async () => {
    await withEnv({ INDEXNOW_API: ibase + "/indexnow" }, async () => {
      const r = await mk({ entries: async () => [{ loc: SITE + "/", sig: "x" }] }).run(); assert.strictEqual(r.skipped, "not_production"); assert.strictEqual(im.calls.length, 0);
    });
  });
  await t("IndexNow: erste Meldung = ganze Sitemap (POST host/key/keyLocation/urlList), danach nur neue, geänderte und entfernte Adressen, höchstens 1× am Tag", async () => {
    const d = fs.mkdtempSync(path.join(tmp, "a-")); let E = [{ loc: SITE + "/", sig: "2026-09-29" }, { loc: SITE + "/print?produkt=flyer", sig: "a1" }, { loc: SITE + "/print?produkte&kategorie=paper-print", sig: "c1" },
      { loc: "https://andere.example/x", sig: "" }, { loc: "kaputt" }, { loc: "http://www.fs-creative.at/unsicher", sig: "" }];
    const m = mk({ DATA_DIR: d, entries: async () => E });
    await withEnv({ RAILWAY_ENVIRONMENT_NAME: "production", INDEXNOW_API: ibase + "/indexnow" }, async () => {
      im.calls.length = 0;
      const r1 = await m.run(); assert.strictEqual(r1.sent, 3, JSON.stringify(r1)); assert.strictEqual(im.calls.length, 1);
      const c = im.calls[0]; assert.strictEqual(c.method, "POST"); assert.strictEqual(c.path, "/indexnow"); assert.ok(/application\/json/.test(c.type));
      assert.deepStrictEqual(Object.keys(c.body).sort(), ["host", "key", "keyLocation", "urlList"]);
      assert.deepStrictEqual([c.body.host, c.body.key, c.body.keyLocation], ["www.fs-creative.at", IN.KEY, SITE + "/" + IN.KEY + ".txt"]);
      assert.deepStrictEqual(c.body.urlList, [SITE + "/", SITE + "/print?produkt=flyer", SITE + "/print?produkte&kategorie=paper-print"], "nur eigene https-Adressen");
      const st = JSON.parse(fs.readFileSync(path.join(d, "indexnow.json"), "utf8")); assert.ok(/^\d{4}-\d\d-\d\d$/.test(st.day) && Object.keys(st.sigs).length === 3 && st.last.sent === 3);
      assert.strictEqual((await m.run()).skipped, "today", "zweiter Lauf am selben Tag"); assert.strictEqual(im.calls.length, 1);
      assert.strictEqual((await m.run({ force: true })).sent, 0, "nichts geändert → keine Meldung"); assert.strictEqual(im.calls.length, 1);
      // Preis geändert, neues Produkt, Startseite entfernt
      E = [{ loc: SITE + "/print?produkt=flyer", sig: "a2" }, { loc: SITE + "/print?produkte&kategorie=paper-print", sig: "c1" }, { loc: SITE + "/print?produkt=visitenkarten", sig: "v1" }];
      const r2 = await m.run({ force: true }); assert.deepStrictEqual([r2.changed, r2.gone, r2.sent], [2, 1, 3]);
      assert.deepStrictEqual(im.calls[1].body.urlList.slice().sort(), [SITE + "/", SITE + "/print?produkt=flyer", SITE + "/print?produkt=visitenkarten"].sort());
      // Sitemap plötzlich viel kleiner (z. B. Shop offline): nichts als entfernt melden
      E = [{ loc: SITE + "/print?produkt=flyer", sig: "a2" }];
      const r3 = await m.run({ force: true }); assert.deepStrictEqual([r3.gone, r3.sent], [0, 0]); assert.strictEqual(im.calls.length, 2);
      assert.ok(Object.keys(JSON.parse(fs.readFileSync(path.join(d, "indexnow.json"), "utf8")).sigs).length === 3, "Stand der nicht gemeldeten Adressen bleibt");
    });
  });
  await t("IndexNow: Fehler (z. B. 429) nur im Log – Stand bleibt, Adressen kommen beim nächsten Lauf wieder; Sitemap-Fehler → kein Tag verbraucht; 10 000 Adressen je Anfrage", async () => {
    const d = fs.mkdtempSync(path.join(tmp, "b-")); let E = [{ loc: SITE + "/a", sig: "1" }, { loc: SITE + "/b", sig: "1" }], boom = false;
    const m = mk({ DATA_DIR: d, entries: async () => { if (boom) throw new Error("Katalog nicht geladen"); return E; } });
    await withEnv({ RAILWAY_ENVIRONMENT_NAME: "production", INDEXNOW_API: ibase + "/indexnow" }, async () => {
      im.calls.length = 0; im.status = 202;
      assert.strictEqual((await m.run()).sent, 2, "202 Accepted zählt als gemeldet");
      im.status = 429; E = [{ loc: SITE + "/a", sig: "2" }, { loc: SITE + "/b", sig: "1" }];
      const r = await m.run({ force: true }); assert.ok(/429/.test(r.error) && r.sent === 0, JSON.stringify(r));
      const st = JSON.parse(fs.readFileSync(path.join(d, "indexnow.json"), "utf8")); assert.ok(/429/.test(st.last.error));
      im.status = 200; const r2 = await m.run({ force: true }); assert.strictEqual(r2.sent, 1, "geänderte Adresse beim nächsten Lauf erneut"); assert.deepStrictEqual(im.calls[im.calls.length - 1].body.urlList, [SITE + "/a"]);
      // Sitemap-Fehler: wirft, Tag wird nicht verbraucht
      const d2 = fs.mkdtempSync(path.join(tmp, "c-")), m2 = mk({ DATA_DIR: d2, entries: async () => { if (boom) throw new Error("Katalog nicht geladen"); return E; } });
      boom = true; await assert.rejects(() => m2.run(), /Katalog/); assert.ok(!fs.existsSync(path.join(d2, "indexnow.json")));
      boom = false; assert.strictEqual((await m2.run()).sent, 2, "gleich danach möglich");
      // große Sitemap: Pakete zu 10 000
      const d3 = fs.mkdtempSync(path.join(tmp, "d-")), many = Array.from({ length: 10001 }, (x, i) => ({ loc: SITE + "/print?produkt=p" + i, sig: "1" }));
      im.calls.length = 0; const r3 = await mk({ DATA_DIR: d3, entries: async () => many }).run();
      assert.strictEqual(r3.sent, 10001); assert.deepStrictEqual(im.calls.map(c => c.body.urlList.length), [10000, 1]);
    });
    im.status = 200;
  });

  // ── 2) Feed-Bausteine direkt (Bild-Proxy, Lieferanten-Name, Kategorien, Format) ──
  await t("Feed-Bausteine: Bild nur über /print/bild/ (absolut, JPEG), nie mit Lieferanten-Namen oder SVG; Google-Kategorien; Format im Titel", async () => {
    process.env.PRINT_ANCHORS_FILE = "off";
    const PS = require(path.join(ROOT, "print-shop.js"))({ DATA_DIR: fs.mkdtempSync(path.join(tmp, "ps-")), ORIGIN: SITE }), T = PS._test;
    const ct = f => "https://images.ctfassets.net/ez9mp376cw6o/27Tx0BQ76RdegkACwfsC0V/0123456789abcdef0123456789abcdef/" + f + "?fm=webp&w=600";
    assert.strictEqual(T.feedImg(ct("Flyers.jpg")), SITE + "/print/bild/ez9mp376cw6o/27Tx0BQ76RdegkACwfsC0V/0123456789abcdef0123456789abcdef/Flyers.jpg?fm=jpg&w=1200");
    ["Printcom_flyer.jpg", "print.com-flyer.jpg", "Print.Com.jpg", "print-com.jpg", "flyer_printcom.jpg", "drukwerkdeal.jpg", "logo.svg"].forEach(f => assert.strictEqual(T.feedImg(ct(f)), "", f));
    assert.strictEqual(T.feedImg("https://example.com/x.jpg"), ""); assert.strictEqual(T.feedImg("https://images.ctfassets.net/../etc/passwd"), "");
    assert.strictEqual(T.feedImg(ct("Blueprint_company.jpg")).indexOf(SITE), 0, "kein Fehlalarm bei „Blueprint company“");
    const g = (k, ti, gr, ki) => T.gpcOf(k, ti, gr, ki || "flat");
    assert.deepStrictEqual([g("visitenkarten", "Visitenkarten", "paper-print"), g("flyer", "Flyer", "paper-print"), g("folder", "Folder", "paper-print"), g("plakate", "Plakate", "paper-print"), g("postcards", "Karten", "paper-print"),
      g("pvc-banner", "Banner", "outdoor-advertising", "banner"), g("rollups", "Roll-ups", "outdoor-advertising"), g("aufkleber", "Aufkleber", "paper-print"), g("tshirt-basic", "T-Shirt Basic", "clothing-textile", "textile"),
      g("tasse", "Tasse mit Logo", "gifts-merchandise-promotional", "promo"), g("kugelschreiber", "Kugelschreiber", "gifts-merchandise-promotional", "promo"), g("feuerzeug", "Feuerzeug", "gifts-merchandise-promotional", "promo"), g("printed-letterheads", "Briefpapier", "paper-print")],
      [957, 5884, 5884, 500044, 3871, 976, 5865, 960, 212, 2169, 982, 5863, 3457]);
    assert.deepStrictEqual([T.fmtNice("A5 - 148 x 210 mm"), T.fmtNice("200 × 100 cm"), T.fmtNice("85 x 55 mm")], ["A5 (148 × 210 mm)", "200 × 100 cm", "85 × 55 mm"]);
    assert.deepStrictEqual(T.RETURN_LD, { "@type": "MerchantReturnPolicy", applicableCountry: "AT", returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted", merchantReturnLink: SITE + "/print/agb" });
  });

  // ── 3) Server mit Attrappen: Feed, Produktseiten, Schlüsseldatei (nicht Produktion → keine IndexNow-Meldung) ──
  const mocks = createMocks(); await new Promise(r => mocks.server.listen(0, "127.0.0.1", r)); const M = mocks.state, mbase = "http://127.0.0.1:" + mocks.server.address().port;
  const dir = copyApp();
  const env = { PRINT_SHOP_LIVE: "1", PRINTCOM_API_KEY: "pc-test-key", PRINTCOM_BASE: mbase + "/pc", PRINT_CMS_BASE: mbase + "/cms", PRINT_PUBLIC_URL: SITE, PRINT_IMPORT_DELAY_MS: "0",
    MAIL_API_URL: mbase + "/mail/api/mails", MAIL_API_TOKEN: "mt", INDEXNOW_API: ibase + "/indexnow", INDEXNOW_DELAY_MS: "200" };
  im.calls.length = 0;
  let srv = await startServer(dir, env), feed = "";
  try {
    const B = srv.base;
    await t("Schlüsseldatei /<Schlüssel>.txt: 200, text/plain, Inhalt = Schlüssel; andere .txt-Namen nicht", async () => {
      const r = await fetch(B + "/" + IN.KEY + ".txt"); assert.strictEqual(r.status, 200); assert.ok(/^text\/plain/.test(r.headers.get("content-type"))); assert.strictEqual(await r.text(), IN.KEY);
      assert.strictEqual((await fetch(B + "/" + IN.KEY + ".txt", { method: "HEAD" })).status, 200);
      assert.strictEqual((await fetch(B + "/0123456789abcdef0123456789abcdef.txt")).status, 404);
    });
    const cat = await (await fetch(B + "/print/api/catalog")).json();
    M.priceOf = (sku, o) => 20 + (+o.copies || 0) / 100;   // Druckpreis steigt mit der Menge
    const pb = await (await fetch(B + "/admin/api/print/margins", { method: "POST", headers: { cookie: COOKIE, "content-type": "application/json" }, body: JSON.stringify({ op: "pub" }) })).json(); delete M.priceOf;
    await t("Google-Shopping-Feed /print/merchant.xml: RSS 2.0 mit g:-Namensraum, Pflichtfelder je Produkt, nie der Lieferanten-Name", async () => {
      assert.ok(cat.ready && pb.pub && pb.pub.n >= 3, JSON.stringify(pb.pub));
      const r = await fetch(B + "/print/merchant.xml"); feed = await r.text(); assert.strictEqual(r.status, 200, feed.slice(0, 300));
      assert.ok(/^application\/xml/.test(r.headers.get("content-type")) && /public, max-age=3600/.test(r.headers.get("cache-control")), r.headers.get("cache-control"));
      assert.ok(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<rss version="2\.0" xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0">/.test(feed) && /<\/channel>\n<\/rss>\n$/.test(feed));
      assert.ok(!/print[\s._-]{0,2}com(?![a-z])|drukwerkdeal|printdeal|ctfassets/i.test(feed), "kein Lieferanten-Name, keine direkten Contentful-Adressen");
      const items = feed.match(/<item>[\s\S]*?<\/item>/g) || []; assert.ok(items.length >= 3, "Produkte im Feed: " + items.length + "\n" + srv.out.slice(-800));
      const baseOf = i => tagOf(i, "item_group_id") || tagOf(i, "id"); assert.ok(new Set(items.map(baseOf)).size <= pb.pub.n, "nur Produkte der Preisübersicht");
      const ids = items.map(i => tagOf(i, "id")); assert.strictEqual(new Set(ids).size, ids.length, "g:id eindeutig");
      for (const it of items) {
        const id = tagOf(it, "id");
        assert.ok(/^[\w-]{1,50}$/.test(id), id); ["title", "description", "link", "image_link", "availability", "condition", "price", "brand", "identifier_exists", "google_product_category"].forEach(k => assert.ok(tagOf(it, k), id + ": g:" + k));
        assert.deepStrictEqual([tagOf(it, "availability"), tagOf(it, "condition"), tagOf(it, "brand"), tagOf(it, "identifier_exists")], ["in_stock", "new", "FS Creative", "no"], id);
        assert.ok(/^\d+\.\d\d EUR$/.test(tagOf(it, "price")), tagOf(it, "price")); assert.ok(/^\d+$/.test(tagOf(it, "google_product_category")));
        assert.ok(/<g:shipping><g:country>AT<\/g:country><g:service>Standard<\/g:service><g:price>0\.00 EUR<\/g:price><\/g:shipping>/.test(it), "Versand im Preis enthalten");
        assert.ok(/ (drucken|bedrucken) – [\d.  ]+ Stück$/.test(tagOf(it, "title")) && tagOf(it, "title").length <= 150, tagOf(it, "title"));
        assert.ok(tagOf(it, "link").indexOf(SITE + "/print/" + baseOf(it) + (baseOf(it) === id ? "" : "?format=")) === 0 && !/produkt=/.test(tagOf(it, "link")), tagOf(it, "link"));
        const img = tagOf(it, "image_link"); assert.ok(img.indexOf(SITE + "/print/bild/") === 0 && /\?fm=jpg&w=1200$/.test(img), img);
        assert.ok(require(path.join(ROOT, "print-bild.js")).upstreamUrl(img.slice(SITE.length).split("?")[0], "?fm=jpg&w=1200"), "Bild-Proxy nimmt den Pfad an: " + img);
        assert.ok(tagOf(it, "description").length > 40 && tagOf(it, "description").length <= 5000);
      }
      const fl = items.find(i => tagOf(i, "id") === "flyer"); assert.ok(fl, "Flyer im Feed");
      assert.ok(/^Flyer A5 drucken – 100 Stück$/.test(tagOf(fl, "title")), tagOf(fl, "title")); assert.strictEqual(tagOf(fl, "google_product_category"), "5884");
      assert.ok(/FS Creative druckt Flyer/.test(tagOf(fl, "description")), "Lieferanten-Name im Text ersetzt: " + tagOf(fl, "description").slice(0, 200));
      assert.ok(!/Rekordzeit|16 Uhr/.test(tagOf(fl, "description")), "keine Lieferzeit-Versprechen aus dem Lieferanten-Text");
      // weitere Formate als eigene Einträge derselben Gruppe – Link wählt das Format vor
      const fa6 = items.find(i => tagOf(i, "id") === "flyer-a6"); assert.ok(fa6, "Flyer A6 als eigener Eintrag: " + items.map(i => tagOf(i, "id")).join(", "));
      assert.strictEqual(tagOf(fa6, "item_group_id"), "flyer"); assert.strictEqual(tagOf(fl, "item_group_id"), "flyer", "Haupteintrag in derselben Gruppe");
      assert.ok(/^Flyer A6( \(105 × 148 mm\))? drucken – 100 Stück$/.test(tagOf(fa6, "title")), tagOf(fa6, "title")); assert.ok(/[?&]format=a6(&|$)/.test(tagOf(fa6, "link")), tagOf(fa6, "link"));
      assert.ok(/Ausführung: A6\b/.test(tagOf(fa6, "description")) && !/Ausführung: A5/.test(tagOf(fa6, "description")), tagOf(fa6, "description").slice(-200));
      const tx = items.find(i => tagOf(i, "id") === "tshirt-basic");
      if (tx) { assert.ok(/mit Logo bedrucken – 10 Stück$/.test(tagOf(tx, "title")), tagOf(tx, "title")); assert.deepStrictEqual([tagOf(tx, "gender"), tagOf(tx, "age_group")], ["unisex", "adult"]); assert.ok(tagOf(tx, "color") && tagOf(tx, "size"), "Textil: Farbe und Größe"); assert.ok(!/menge=/.test(tagOf(tx, "link")), "Textil ohne ?menge="); }
    });
    await t("Feed-Preis = Preis der Produktseite für dieselbe Menge (sichtbarer Text + JSON-LD); Link wählt genau diese Menge vor", async () => {
      const items = feed.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const it of items) {
        const id = tagOf(it, "id"), link = tagOf(it, "link"), price = tagOf(it, "price").replace(" EUR", ""), n = +(tagOf(it, "title").match(/– ([\d.  ]+) Stück$/)[1].replace(/\D/g, ""));
        const html = await (await fetch(B + link.slice(SITE.length))).text();
        const prod = ldOf(html).find(x => x["@type"] === "Product"); assert.ok(prod && prod.offers, id + ": Product mit Angeboten");
        const off = prod.offers.offers.find(o => o.eligibleQuantity.value === n); assert.ok(off, id + ": Angebot für " + n + " Stück");
        assert.strictEqual(off.price, price, id + ": Preis Feed " + price + " / Produktseite " + off.price);
        assert.strictEqual(prod.offers.lowPrice, price, id + ": kleinste Menge = günstigster Preis der Seite");
        assert.ok(html.indexOf(n.toLocaleString("de-AT") + " Stück: " + (+price).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €") > -1, id + ": Menge und Preis sichtbar im Seitentext");
        const p = cat.products.find(x => x.key === id), m = link.match(/[?&]menge=(\d+)/);
        if (p && p.kind !== "textile") {
          assert.ok(p.start && p.tiers.indexOf(+p.start.copies) > -1, id + ": Startausführung wird im Konfigurator übernommen");
          if (m) assert.ok(+m[1] === n && p.tiers.indexOf(n) > -1 && n !== +p.start.copies, id + ": ?menge= nur für angebotene Stufen");
          else assert.strictEqual(n, +p.start.copies, id + ": ohne ?menge= = Startauflage");
        }
      }
    });
    await t("Produktseite: JSON-LD je Angebot mit Rückgaberichtlinie „keine Rückgabe“ (AT, Link auf die AGB) – passend zu AGB Punkt 6 (kein Rücktrittsrecht, § 18 FAGG)", async () => {
      const html = await (await fetch(B + "/print?produkt=visitenkarten")).text(), prod = ldOf(html).find(x => x["@type"] === "Product");
      const ti = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "", de = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
      assert.ok(/^Visitenkarten drucken – ab [\d.,]+ € inkl\. Versand \| FS Creative$/.test(ti.replace(/&amp;/g, "&")), "Titel mit Preis: " + ti);
      assert.ok(de.length <= 160 && /inkl\. 20 % USt und Versand/.test(de), "Beschreibung: " + de);
      const fq = ldOf(html).find(x => x["@type"] === "FAQPage"); assert.ok(fq && fq.mainEntity.length >= 4 && /<h2>Häufige Fragen<\/h2>/.test(html), "Häufige Fragen sichtbar + FAQPage");
      assert.ok(/Was kostet Visitenkarten drucken\?/.test(html) && /mm Beschnitt/.test(html));
      assert.ok(prod && prod.offers.offers.length >= 2);
      prod.offers.offers.forEach(o => { assert.deepStrictEqual(o.hasMerchantReturnPolicy, { "@type": "MerchantReturnPolicy", applicableCountry: "AT", returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted", merchantReturnLink: SITE + "/print/agb" });
        assert.deepStrictEqual(o.shippingDetails.shippingDestination, { "@type": "DefinedRegion", addressCountry: "AT" }); assert.ok(!("deliveryTime" in o.shippingDetails), "keine erfundene Lieferzeit"); });
      const agb = await (await fetch(B + "/print/agb")).text();
      assert.ok(/Kein Rücktrittsrecht bei individuell angefertigten Waren/.test(agb) && /§ 18 Abs\. 1 Z 3 FAGG/.test(agb) && /ausschließlich an Adressen in Österreich/.test(agb), "AGB tragen die Angaben");
      const pp = await (await fetch(B + "/print/preise")).text(); assert.ok(/"returnPolicyCategory":"https:\/\/schema.org\/MerchantReturnNotPermitted"/.test(pp), "auch in der Preisübersicht");
    });
    await t("Feed: zwischengespeichert, nicht in der Sitemap, robots.txt erlaubt ihn; keine IndexNow-Meldung außerhalb der Produktion", async () => {
      const n0 = M.log.length, again = await (await fetch(B + "/print/merchant.xml")).text(); assert.strictEqual(again, feed); assert.strictEqual(M.log.length, n0, "kein Abruf beim Druckpartner");
      const sm = await (await fetch(B + "/sitemap.xml")).text(); assert.ok(/\/print\/flyer<\/loc>/.test(sm) && !/merchant/.test(sm) && !/produkt=/.test(sm));
      const rb = await (await fetch(B + "/robots.txt")).text(); assert.ok(/Allow: \//.test(rb) && !/Disallow: \/print/.test(rb));
      assert.strictEqual((await fetch(B + "/print/merchant.xml", { method: "POST" })).status, 404);
      await sleep(400); assert.strictEqual(im.calls.length, 0, "nicht Produktion"); assert.ok(!fs.existsSync(path.join(dir, "indexnow.json")));
    });
  } finally { await stop(srv); }

  // ── 4) „Produktion“ (Railway-Umgebung production): IndexNow meldet die Sitemap im Hintergrund, am selben Tag nicht noch einmal ──
  srv = await startServer(dir, Object.assign({}, env, { RAILWAY_ENVIRONMENT_NAME: "production", INDEXNOW_DELAY_MS: "1500" }));
  try {
    await t("Produktion: Meldung nach Start-Verzögerung mit allen Sitemap-Adressen (inkl. Shop), Stand gespeichert", async () => {
      await fetch(srv.base + "/print/api/catalog");
      for (let i = 0; i < 100 && !im.calls.length; i++) await sleep(150);
      assert.strictEqual(im.calls.length, 1, srv.out.slice(-1500));
      const b = im.calls[0].body, sm = await (await fetch(srv.base + "/sitemap.xml")).text(), locs = (sm.match(/<loc>[^<]+<\/loc>/g) || []).map(x => x.slice(5, -6).replace(/&amp;/g, "&"));
      assert.deepStrictEqual([b.host, b.key, b.keyLocation], ["www.fs-creative.at", IN.KEY, SITE + "/" + IN.KEY + ".txt"]);
      assert.deepStrictEqual(b.urlList.slice().sort(), locs.slice().sort(), "genau die Sitemap");
      [SITE + "/", SITE + "/print", SITE + "/print/preise", SITE + "/print/flyer", SITE + "/print?produkte"].forEach(u => assert.ok(b.urlList.indexOf(u) > -1, u));
      assert.ok(b.urlList.some(u => /\/print\?produkte&kategorie=/.test(u)), "Kategorien mit &"); assert.ok(!b.urlList.some(u => /merchant/.test(u)));
      const st = JSON.parse(fs.readFileSync(path.join(dir, "indexnow.json"), "utf8")); assert.strictEqual(Object.keys(st.sigs).length, locs.length); assert.ok(/IndexNow: \d+ Adressen gemeldet/.test(srv.out));
      assert.ok(st.sigs[SITE + "/print/flyer"] !== st.sigs[SITE + "/print/visitenkarten"], "Shop-Seiten: Prüfsumme je Inhalt (nicht das lastmod „heute“)");
    });
  } finally { await stop(srv); }
  srv = await startServer(dir, Object.assign({}, env, { RAILWAY_ENVIRONMENT_NAME: "production", INDEXNOW_DELAY_MS: "300" }));
  try {
    await t("Produktion, Neustart am selben Tag: keine zweite Meldung", async () => { await sleep(2500); assert.strictEqual(im.calls.length, 1, srv.out.slice(-800)); });
  } finally { await stop(srv); }
  // ── 5) Shop nicht öffentlich: kein Feed ──
  srv = await startServer(dir, Object.assign({}, env, { PRINT_SHOP_LIVE: undefined }));
  try {
    await t("Shop nicht öffentlich: /print/merchant.xml 404 (noindex), Schlüsseldatei bleibt", async () => {
      const r = await fetch(srv.base + "/print/merchant.xml"); assert.strictEqual(r.status, 404); assert.ok(/noindex/.test(r.headers.get("x-robots-tag") || ""));
      assert.strictEqual(await (await fetch(srv.base + "/" + IN.KEY + ".txt")).text(), IN.KEY);
    });
  } finally { await stop(srv); mocks.server.close(); im.server.close(); }

  if (fail) { console.log(fails.join("\n\n")); console.log("\nFEHLER: " + pass + " bestanden, " + fail + " fehlgeschlagen"); process.exit(1); }
  console.log("OK: " + pass + " bestanden, 0 fehlgeschlagen");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
