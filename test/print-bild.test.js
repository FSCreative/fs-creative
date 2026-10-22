/* Bild-Proxy für Druckshop-Produktbilder (print-bild.js).
   Aufruf: node test/print-bild.test.js   – ohne Netz: fetch wird ersetzt.
   Geprüft: nur images.ctfassets.net mit Contentful-Pfad (kein offener Proxy, kein Pfad-Trick), nur erlaubte Parameter,
   Breiten auf feste Stufen, nur Bild-Content-Types, Größenlimit, Cache-Header + Sandbox, Zwischenspeicher, HEAD, 404/502. */
"use strict";
const assert = require("assert");
const B = require("../print-bild.js");
const { upstreamUrl, snap } = B._test;

let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }

const OK_PATH = "/print/bild/ez9mp376cw6o/27Tx0BQ76RdegkACwfsC0V/fb45b1d11b0e56c2cce9b9b6543bfe63/Flyers.jpg";
const UP = "https://images.ctfassets.net/ez9mp376cw6o/27Tx0BQ76RdegkACwfsC0V/fb45b1d11b0e56c2cce9b9b6543bfe63/Flyers.jpg";

function fakeRes() {
  return { status: 0, body: null, headers: null };
}
const send = (res, status, body, type, headers) => { res.status = status; res.body = body; res.headers = Object.assign({ "Content-Type": type || "text/plain; charset=utf-8" }, headers || {}); };
const req = (method) => ({ method: method || "GET", headers: { "x-forwarded-for": "203.0.113." + Math.floor(Math.random() * 200 + 1) }, socket: { remoteAddress: "127.0.0.1" } });
const call = async (p, search, method) => { const res = fakeRes(); await B.handle(req(method), res, { search: search || "" }, p, send); return res; };

function mockFetch(impl) {
  const calls = [];
  global.fetch = async (url, opt) => { calls.push({ url: String(url), opt }); return impl(String(url), opt); };
  return calls;
}
const imgResp = (buf, type, extra) => ({ ok: true, status: 200, headers: new Map(Object.entries(Object.assign({ "content-type": type || "image/webp", "content-length": String(buf.length) }, extra || {}))), body: (async function* () { yield buf; })() });

(async () => {
  await t("URL: gültiger Pfad, Parameter gefiltert, Breite gerundet", () => {
    assert.strictEqual(upstreamUrl(OK_PATH, "?fm=webp&w=400"), UP + "?fm=webp&w=400");
    assert.strictEqual(upstreamUrl(OK_PATH, "?fm=webp&w=401&evil=1&q=85&fit=fill&h=99"), UP + "?fm=webp&w=600&h=120&q=85&fit=fill");
    assert.strictEqual(upstreamUrl(OK_PATH, "?w=99999"), UP + "?w=2000");
    assert.strictEqual(upstreamUrl(OK_PATH, "?fm=exe&q=0&fit=x"), UP);
    assert.strictEqual(snap("1080"), 1200); assert.strictEqual(snap("abc"), 0);
  });
  await t("URL: kein offener Proxy / keine Pfad-Tricks", () => {
    ["/print/bild/", "/print/bild//evil.com/x/y/z.jpg", "/print/bild/https://evil.com/a.jpg", "/print/bild/ez9mp376cw6o/27Tx/notahash/Flyers.jpg",
      "/print/bild/ez9mp376cw6o/27Tx0BQ76RdegkACwfsC0V/fb45b1d11b0e56c2cce9b9b6543bfe63/..", "/print/bild/ez9mp376cw6o/27Tx0BQ76RdegkACwfsC0V/fb45b1d11b0e56c2cce9b9b6543bfe63/a/b.jpg",
      "/print/bild/ez9mp376cw6o/27Tx0BQ76RdegkACwfsC0V/fb45b1d11b0e56c2cce9b9b6543bfe63/a%2F..%2Fb.jpg?x", "/print/bildx/ez9mp376cw6o/a/fb45b1d11b0e56c2cce9b9b6543bfe63/a.jpg", "/print/bild/EZ9MP/27Tx/fb45b1d11b0e56c2cce9b9b6543bfe63/a jpg"]
      .forEach(p => assert.strictEqual(upstreamUrl(p.split("?")[0], ""), null, p));
  });
  await t("proxify: nur ctfassets-URLs", () => {
    assert.strictEqual(B.proxify(UP + "?fm=webp&w=400"), OK_PATH + "?fm=webp&w=400");
    assert.strictEqual(B.proxify("https://example.org/a.jpg"), "https://example.org/a.jpg");
  });
  await t("Abruf: Bild wird ausgeliefert, Header stimmen, keine Besucher-Header an Contentful", async () => {
    const buf = Buffer.from("RIFF0000WEBPVP8 test");
    const calls = mockFetch(() => imgResp(buf));
    const r = await call(OK_PATH, "?fm=webp&w=400");
    assert.strictEqual(r.status, 200); assert.ok(Buffer.isBuffer(r.body) && r.body.equals(buf));
    assert.strictEqual(r.headers["Content-Type"], "image/webp");
    assert.ok(/max-age=\d+/.test(r.headers["Cache-Control"]) && /public/.test(r.headers["Cache-Control"]));
    assert.ok(/sandbox/.test(r.headers["Content-Security-Policy"])); assert.strictEqual(r.headers["X-Content-Type-Options"], "nosniff");
    assert.strictEqual(calls.length, 1); assert.strictEqual(calls[0].url, UP + "?fm=webp&w=400");
    assert.strictEqual(calls[0].opt.redirect, "error"); assert.ok(!calls[0].opt.headers.Cookie && !calls[0].opt.headers["X-Forwarded-For"]);
    const r2 = await call(OK_PATH, "?fm=webp&w=400"); assert.strictEqual(r2.status, 200); assert.strictEqual(calls.length, 1, "zweiter Abruf aus dem Zwischenspeicher");
    const h = await call(OK_PATH, "?fm=webp&w=400", "HEAD"); assert.strictEqual(h.status, 200); assert.strictEqual(h.body, ""); assert.strictEqual(h.headers["Content-Length"], String(buf.length));
  });
  await t("Abruf: nur Bild-Content-Types", async () => {
    mockFetch(() => imgResp(Buffer.from("<html>"), "text/html"));
    const r = await call(OK_PATH, "?fm=webp&w=800"); assert.strictEqual(r.status, 502); assert.strictEqual(r.headers["Cache-Control"], "no-store");
  });
  await t("Abruf: Größenlimit (Content-Length und gestreamt)", async () => {
    mockFetch(() => imgResp(Buffer.alloc(10), "image/jpeg", { "content-length": String(50 * 1024 * 1024) }));
    assert.strictEqual((await call(OK_PATH, "?fm=jpg&w=900")).status, 502);
    const big = Buffer.alloc(9 * 1024 * 1024);
    mockFetch(() => ({ ok: true, status: 200, headers: new Map([["content-type", "image/jpeg"]]), body: (async function* () { yield big; })() }));
    assert.strictEqual((await call(OK_PATH, "?fm=jpg&w=1000")).status, 502);
  });
  await t("Abruf: 404 von Contentful → 404, andere Fehler → 502", async () => {
    mockFetch(() => ({ ok: false, status: 404, headers: new Map() }));
    assert.strictEqual((await call(OK_PATH, "?fm=png&w=120")).status, 404);
    mockFetch(() => { throw new Error("Netz weg"); });
    assert.strictEqual((await call(OK_PATH, "?fm=png&w=160")).status, 502);
  });
  await t("Ungültiger Pfad und falsche Methode", async () => {
    let n = 0; mockFetch(() => { n++; return imgResp(Buffer.from("x")); });
    assert.strictEqual((await call("/print/bild/https://evil.com/a.jpg", "")).status, 404);
    assert.strictEqual((await call(OK_PATH, "", "POST")).status, 405);
    assert.strictEqual(n, 0);
  });

  console.log(fails.join("\n")); console.log(pass + " ok, " + fail + " fehlgeschlagen");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
