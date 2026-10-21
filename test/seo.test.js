/* SEO (seo.js): Seiten-Check erkennt typische Probleme, Punkte, Search Console und Unternehmensprofil über Attrappen, Zugang verschlüsselt. */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { Readable } = require("stream");
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }
function req(method, body) { const r = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []); r.method = method; r.headers = {}; return r; }
function res() { const o = { code: 0, head: {}, chunks: [], writeHead(c, h) { o.code = c; Object.assign(o.head, h || {}); }, end(c) { if (c) o.chunks.push(Buffer.from(c)); o.done(); }, headersSent: false };
  o.finished = new Promise(r => { o.done = r; }); o.json = () => JSON.parse(Buffer.concat(o.chunks).toString("utf8")); return o; }
function send(r, code, body, type, headers) { r.writeHead(code, Object.assign({ "Content-Type": type }, headers || {})); r.end(body); }

const PAGES = {
  "/": '<!doctype html><html lang="de"><head><meta name="viewport" content="width=device-width"><title>Pizzeria Muster – Pizza in Schruns, Montafon</title><meta name="description" content="Holzofenpizza in Schruns im Montafon: frisch, regional und schnell geliefert. Jetzt online bestellen oder einen Tisch reservieren."><link rel="canonical" href="BASE/"><meta property="og:image" content="BASE/og.jpg"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Restaurant","name":"Muster"}</script></head><body><h1>Pizzeria Muster</h1><p>' + "Wort ".repeat(300) + '</p><img src="a.jpg" alt="Pizza"><a href="/karte">Karte</a><a href="/kaputt">Kaputt</a></body></html>',
  "/karte": '<html><head><title>Karte</title></head><body><h1>Karte</h1><h1>Nochmal</h1><img src="b.jpg"><img src="c.jpg"><p>kurz</p></body></html>',
  "/geheim": '<html lang="de"><head><meta name="viewport" content="x"><meta name="robots" content="noindex"><title>Karte</title><meta name="description" content="Kurz"></head><body><h1>x</h1></body></html>',
};
const G = { calls: [] };
const srv = http.createServer((q, s) => { let b = ""; q.on("data", c => { b += c; }); q.on("end", () => {
  const u = new URL(q.url, "http://x"), p = u.pathname; G.calls.push({ m: q.method, p, body: b, auth: q.headers.authorization || "" });
  const J = (o, c) => { s.writeHead(c || 200, { "Content-Type": "application/json" }); s.end(JSON.stringify(o)); };
  const base = "http://" + q.headers.host;
  if (p === "/robots.txt") { s.writeHead(200, { "Content-Type": "text/plain" }); return s.end("User-agent: *\nAllow: /\nSitemap: " + base + "/sitemap.xml\n"); }
  if (p === "/sitemap.xml") { s.writeHead(200, { "Content-Type": "application/xml" }); return s.end('<?xml version="1.0"?><urlset><url><loc>' + base + '/</loc></url><url><loc>' + base + '/karte</loc></url><url><loc>' + base + '/geheim</loc></url></urlset>'); }
  if (PAGES[p]) { s.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return s.end(PAGES[p].replace(/BASE/g, base)); }
  // Google-Attrappen
  if (p === "/token") return J({ access_token: "acc-" + Date.now(), refresh_token: "ref-1", expires_in: 3600, scope: "webmasters business.manage" });
  if (p === "/userinfo") return J({ email: "simon@example.org" });
  if (p === "/gsc/sites") return J({ siteEntry: [{ siteUrl: "sc-domain:muster.at", permissionLevel: "siteOwner" }, { siteUrl: "https://www.andere.at/", permissionLevel: "siteOwner" }] });
  if (/\/searchAnalytics\/query$/.test(p)) { const j = JSON.parse(b); const d = j.dimensions || []; if (!d.length) return J({ rows: [{ clicks: j.startDate < "2026-01-01" ? 0 : 120, impressions: 4000, ctr: 0.03, position: 8.4 }] });
    return J({ rows: d[0] === "query" ? [{ keys: ["pizza schruns"], clicks: 50, impressions: 900, ctr: 0.055, position: 3.2 }] : d[0] === "page" ? [{ keys: ["https://www.muster.at/"], clicks: 80, impressions: 2000, ctr: 0.04, position: 5 }] : [{ keys: ["2026-10-01"], clicks: 4, impressions: 100, ctr: 0.04, position: 8 }] }); }
  if (/\/sitemaps$/.test(p)) return J({ sitemap: [{ path: "https://www.muster.at/sitemap.xml", lastSubmitted: "2026-10-01T00:00:00Z", errors: "0", warnings: "0", contents: [{ submitted: "12" }] }] });
  if (/\/sitemaps\//.test(p) && q.method === "PUT") return J({});
  if (p === "/acc/accounts") return J({ accounts: [{ name: "accounts/1" }] });
  if (p === "/info/accounts/1/locations") return J({ locations: [{ name: "locations/9", title: "Pizzeria Muster", websiteUri: "https://www.muster.at/", storefrontAddress: { addressLines: ["Dorfstr. 1"], postalCode: "6780", locality: "Schruns" }, metadata: { mapsUri: "https://maps.google.com/?cid=1", newReviewUri: "https://g.page/r/x/review" } }, { name: "locations/10", title: "Andere", websiteUri: "https://andere.at" }] });
  if (p === "/v4/accounts/1/locations/9/reviews") return J({ averageRating: 4.6, totalReviewCount: 2, reviews: [{ reviewId: "r1", reviewer: { displayName: "Lisa" }, starRating: "FIVE", comment: "Super Pizza!", createTime: "2026-10-10T10:00:00Z" }, { reviewId: "r2", reviewer: { displayName: "Max" }, starRating: "FOUR", comment: "Gut", createTime: "2026-10-01T10:00:00Z", reviewReply: { comment: "Danke!", updateTime: "2026-10-02T10:00:00Z" } }] });
  if (p === "/v4/accounts/1/locations/9/reviews/r1/reply" && q.method === "PUT") return J({ comment: JSON.parse(b).comment });
  if (p === "/v4/accounts/1/locations/9/localPosts" && q.method === "POST") return J({ name: "accounts/1/locations/9/localPosts/77", searchUrl: "https://g.co/post" });
  J({ error: { message: "unbekannt " + p } }, 404);
}); });

(async () => {
  await new Promise(r => srv.listen(0, "127.0.0.1", r)); const base = "http://127.0.0.1:" + srv.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-seo-"));
  const SEO = require(path.join(__dirname, "..", "seo.js"))({ send, DATA_DIR: dir, secret: "geheim", publicBase: "https://cockpit.example",
    googleApp: () => ({ clientId: "cid", secret: "csec" }), KI: () => ({ marketingOn: () => true, marketingGen: async (sys, user) => { assert.ok(/keine Anweisung/.test(sys)); return { json: { title: "Holzofenpizza in Schruns | Pizzeria Muster", description: "Frische Pizza aus dem Holzofen in Schruns – jetzt bestellen.", h1: "Pizza in Schruns", keywords: ["pizza schruns"], faq: [{ q: "Liefert ihr?", a: "Ja." }], tips: ["Mehr Text"] }, eur: 0.01 }; } }),
    sites: async () => [{ key: "rw:1", name: "Muster", domain: "www.muster.at", domains: ["www.muster.at", "muster-production.up.railway.app"] }],
    base: { gToken: base + "/token", gUser: base + "/userinfo", gsc: base + "/gsc", gbpAcc: base + "/acc", gbpInfo: base + "/info", gbp4: base + "/v4", gAuth: base + "/auth" } });
  const T = SEO._test, call = async (method, p, body, qs) => { const r = res(); await SEO.handleAdmin(req(method, body), r, new URL("http://x" + p + (qs || "")), p); await r.finished; return r; };

  await t("Website-Liste: Domain ohne Railway-Adresse, www bevorzugt, Kennung = Hauptdomain", async () => {
    const l = await T.siteList(true); assert.strictEqual(l.length, 1); assert.strictEqual(l[0].id, "muster.at"); assert.strictEqual(l[0].domain, "www.muster.at");
    assert.strictEqual(T.regOf("shop.example.co.at"), "example.co.at");
  });
  await t("Seiten-Check: findet fehlende Beschreibung, doppelte H1, Bilder ohne Alt, noindex, doppelte Titel, kaputten Link; gute Seite ohne Fehler", async () => {
    const r = await T.crawl({ id: "muster.at", name: "Muster", domain: "127.0.0.1:" + srv.address().port, url: base + "/" });
    assert.strictEqual(r.pages.length, 3, r.pages.map(p => p.url).join(", "));
    const home = r.pages[0]; assert.strictEqual(home.ld[0], "Restaurant"); assert.ok(home.words > 250);
    const codes = r.issues.map(i => i.code + "@" + i.url.replace(base, "")); const has = c => codes.some(x => x.indexOf(c) === 0);
    assert.ok(!r.issues.some(i => i.url === base + "/" && i.sev === "fehler"), "Startseite ohne Fehler: " + JSON.stringify(r.issues.filter(i => i.url === base + "/")));
    assert.ok(codes.indexOf("desc@/karte") > -1 && codes.indexOf("h1@/karte") > -1 && codes.indexOf("alt@/karte") > -1 && codes.indexOf("viewport@/karte") > -1, codes.join(" "));
    assert.ok(codes.indexOf("noindex@/geheim") > -1); assert.ok(has("dup-title")); assert.ok(r.issues.some(i => i.code === "broken" && /\/kaputt/.test(i.msg)));
    assert.ok(r.score > 0 && r.score < 100, "Punkte " + r.score); assert.ok(r.robots); assert.strictEqual(r.urlsInSitemap, 3);
  });
  await t("KI-Vorschlag je Seite inkl. FAQ als JSON-LD", async () => {
    T.S().sites["muster.at"] = { check: { pages: [{ url: "https://www.muster.at/", title: "x", desc: "", h1: [], h2: [], text: "Pizza" }], issues: [], at: new Date().toISOString() } };
    const r = (await call("POST", "/admin/api/seo/suggest", { id: "muster.at", url: "https://www.muster.at/" })).json(); assert.strictEqual(r.ok, true, r.error);
    assert.ok(/FAQPage/.test(r.suggest.faqJsonLd)); assert.strictEqual(r.suggest.title, "Holzofenpizza in Schruns | Pizzeria Muster");
  });
  await t("Google verbinden: Anmeldeadresse mit Search Console + Unternehmensprofil, Zugang verschlüsselt gespeichert", async () => {
    const j = (await call("POST", "/admin/api/seo/google/connect", {})).json(), u = new URL(j.url); assert.ok(/webmasters/.test(u.searchParams.get("scope")) && /business\.manage/.test(u.searchParams.get("scope")));
    assert.strictEqual(u.searchParams.get("redirect_uri"), "https://cockpit.example/admin/api/seo/oauth/callback");
    const cb = await call("GET", "/admin/api/seo/oauth/callback", null, "?code=c&state=" + u.searchParams.get("state")); assert.ok(/seo=ok/.test(cb.head.Location), cb.head.Location);
    await new Promise(r => setTimeout(r, 400)); const raw = fs.readFileSync(path.join(dir, "seo", "state.json"), "utf8"); assert.ok(raw.indexOf("ref-1") < 0, "Token nicht im Klartext");
    const st = (await call("GET", "/admin/api/seo/state")).json(); assert.strictEqual(st.google.connected, true); assert.strictEqual(st.google.email, "simon@example.org");
  });
  await t("Search Console: Domain-Property gefunden, Klicks, Suchbegriffe, Sitemap einreichen", async () => {
    const g = (await call("GET", "/admin/api/seo/gsc", null, "?id=muster.at")).json().gsc; assert.strictEqual(g.property, "sc-domain:muster.at");
    assert.strictEqual(g.total.clicks, 120); assert.strictEqual(g.queries[0].key, "pizza schruns"); assert.strictEqual(g.sitemaps[0].urls, "12");
    assert.ok(G.calls.some(c => /searchAnalytics/.test(c.p) && /^Bearer acc-/.test(c.auth)));
    const r = (await call("POST", "/admin/api/seo/sitemap", { id: "muster.at", sitemap: "https://www.muster.at/sitemap.xml" })).json(); assert.strictEqual(r.ok, true, r.error);
  });
  await t("Unternehmensprofil: Standort über Website zugeordnet, Bewertungen, Antwort, Beitrag", async () => {
    const g = (await call("GET", "/admin/api/seo/gbp", null, "?id=muster.at")).json().gbp; assert.strictEqual(g.locations.length, 1); const l = g.locations[0];
    assert.strictEqual(l.title, "Pizzeria Muster"); assert.strictEqual(l.reviews.avg, 4.6); assert.strictEqual(l.reviews.reviews[0].stars, 5); assert.ok(l.reviews.reviews[1].reply);
    let r = (await call("POST", "/admin/api/seo/gbp/reply", { id: "muster.at", location: "locations/9", review: "r1", text: "Danke, Lisa!" })).json(); assert.strictEqual(r.ok, true, r.error);
    r = (await call("POST", "/admin/api/seo/gbp/post", { id: "muster.at", location: "locations/9", text: "Heute Pizza-Abend", link: "https://www.muster.at/" })).json(); assert.strictEqual(r.ok, true, r.error);
    const post = JSON.parse(G.calls.filter(c => /localPosts/.test(c.p)).pop().body); assert.strictEqual(post.summary, "Heute Pizza-Abend"); assert.strictEqual(post.callToAction.url, "https://www.muster.at/");
    assert.strictEqual((await call("POST", "/admin/api/seo/gbp/reply", { id: "muster.at", location: "locations/10", review: "r1", text: "x" })).code, 404, "fremder Standort");
  });
  srv.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  console.log("seo: " + pass + " ok, " + fail + " fehlgeschlagen");
  if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
  process.exit(0);
})();
