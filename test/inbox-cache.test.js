process.env.MKT_WEB = "off";
/* Marketing › Posteingang sofort statt warten (mkt-posts.js): Zwischenspeicher mit Auffrischen im Hintergrund (stale-while-revalidate),
   eine Abfrage je Marke (keine doppelten), Speichern in inbox-cache.json (ohne Tokens, übersteht Neustart/Deploy), /inbox/all für alle Marken,
   langsame Plattformen (Attrappe mit Verzögerung) und gleichzeitige Kommentar-Abfragen (mkt-publish.js). */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const zlib = require("zlib");
const { Readable } = require("stream");
const ROOT = path.join(__dirname, "..");

let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function req(method, body, headers) { const r = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []); r.method = method; r.headers = headers || {}; return r; }
function res() {
  const o = { code: 0, head: {}, chunks: [], writeHead(c, h) { o.code = c; Object.assign(o.head, h || {}); }, setHeader(k, v) { o.head[k] = v; }, write(c) { o.chunks.push(Buffer.from(c)); }, end(c) { if (c) o.chunks.push(Buffer.from(c)); o.done(); }, on() {}, once() {}, emit() {} };
  o.finished = new Promise(r => { o.done = r; }); o.raw = () => Buffer.concat(o.chunks); o.json = () => JSON.parse(o.raw().toString("utf8") || "{}"); return o;
}
function send(r, code, body, type, headers) { r.writeHead(code, Object.assign({ "Content-Type": type }, headers || {})); r.end(body); }

// ── langsame Plattform-Attrappe: jede Anfrage DELAY ms, zählt Aufrufe und gleichzeitige Kommentar-Abfragen ──
const DELAY = 300, TOK = { ig: "ig-geheim-123", fb: "fb-geheim-456" };
const M = { calls: [], inflight: 0, maxCm: 0, cmInflight: 0, extra: [], failMedia: false, rep: {} };
const iso = h => new Date(Date.now() - h * 3600e3).toISOString();
const srv = http.createServer((q, s) => { let b = ""; q.on("data", c => { b += c; }); q.on("end", async () => {
  const u = new URL(q.url, "http://x"), p = u.pathname, J = (o, c) => { s.writeHead(c || 200, { "Content-Type": "application/json" }); s.end(JSON.stringify(o)); };
  M.calls.push(q.method + " " + p); const cm = /\/comments$/.test(p) && q.method === "GET"; if (cm) { M.cmInflight++; M.maxCm = Math.max(M.maxCm, M.cmInflight); }
  await sleep(DELAY); if (cm) M.cmInflight--;
  let m;
  if (p === "/ig/v26.0/ig1/media") return M.failMedia ? J({ error: { message: "Instagram gerade nicht erreichbar" } }, 500)
    : J({ data: Array.from({ length: 8 }, (_, i) => ({ id: "m" + i, caption: "Beitrag " + i, timestamp: iso(i * 24 + 2), permalink: "https://ig/p/" + i, media_url: "https://cdn/m" + i + ".jpg?access_token=" + u.searchParams.get("access_token"), like_count: 10 + i, comments_count: i < 6 ? 1 : 0 })) });
  if ((m = p.match(/^\/ig\/v26\.0\/(m\d)\/comments$/))) return J({ data: [{ id: "c-" + m[1], username: "fan" + m[1], text: "Frage zu " + m[1], timestamp: iso(+m[1].slice(1) * 24 + 1), like_count: 0, replies: { data: (M.rep || {})["c-" + m[1]] || [] } }].concat(M.extra.filter(x => x.post === m[1]).map(x => x.c)) });
  if (p === "/ig/v26.0/me/conversations") return J({ data: [{ id: "cv1", updated_time: iso(1), participants: { data: [{ id: "ig1", username: "kochdu" }, { id: "u9", username: "markus" }] }, messages: { data: [{ id: "x1", from: { id: "u9", username: "markus" }, message: "Liefert ihr?", created_time: iso(1) }] } }] });
  if ((m = p.match(/^\/ig\/v26\.0\/(c-m\d)\/replies$/)) && q.method === "POST") { M.replied = { comment: m[1], body: b }; return J({ id: "neu1" }); }
  if (p === "/fb/v26.0/pg1/posts") return J({ data: [{ id: "pg1_1", message: "Neue Karte", permalink_url: "https://fb/p", created_time: iso(5), reactions: { summary: { total_count: 3 } }, comments: { summary: { total_count: 1 }, data: [{ id: "fc1", message: "Super", from: { id: "9", name: "Anna" }, created_time: iso(4) }] } }] });
  if (p === "/fb/v26.0/pg1/conversations") return J({ data: [] });
  J({ error: { message: "unbekannt " + p } }, 404);
}); });

(async () => {
  await new Promise(r => srv.listen(0, "127.0.0.1", r)); const MB = "http://127.0.0.1:" + srv.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-inboxc-")), CACHE = path.join(dir, "marketing", "inbox-cache.json");
  const make = () => require(path.join(ROOT, "marketing.js"))({ send, DATA_DIR: dir, ROOT, secret: "t-secret", KI: () => null, publicBase: "http://127.0.0.1", background: false, push: async () => 0,
    publish: { waitMs: 1, base: { ig: MB + "/ig", fb: MB + "/fb", th: MB + "/th", bsky: MB + "/bsky", yt: MB + "/yt" } } });
  // eigene Modul-Instanzen je „Serverstart“ (require-Cache leeren, sonst teilen sich beide den Speicher)
  const fresh = () => { Object.keys(require.cache).filter(k => /mkt-(posts|publish)\.js$|marketing\.js$/.test(k)).forEach(k => delete require.cache[k]); return make(); };
  let MK = fresh(), PT = MK._test.posts._test;
  const call = async (p, qs, body, headers, mk) => { const r = res(), t0 = Date.now(); await (mk || MK).handleAdmin(req(body ? "POST" : "GET", body, headers), r, new URL("http://x" + p + (qs || "")), p); await r.finished; r.ms = Date.now() - t0; return r; };
  PT.upsertChannel("kochdu", { platform: "instagram", account: { id: "ig1", handle: "@kochdu", name: "kochdu" }, tok: { access: TOK.ig, expiresAt: new Date(Date.now() + 60 * 864e5).toISOString() } });
  PT.upsertChannel("kochdu", { platform: "facebook", account: { id: "pg1", name: "kochdu" }, tok: { access: TOK.fb } });
  PT.upsertChannel("valuero", { platform: "facebook", account: { id: "pg1", name: "VALUERO" }, tok: { access: TOK.fb } });
  PT.upsertChannel("skikaiser", { platform: "tiktok", account: { id: "tt1", name: "ski" }, tok: { access: "tt" } });   // ohne Posteingang
  const igCalls = () => M.calls.filter(c => c === "GET /ig/v26.0/ig1/media").length;

  await t("Erster Aufruf ohne Stand: sofort Antwort (refreshing), wait= liefert die Einträge, sobald die Abfrage fertig ist", async () => {
    const r = await call("/admin/api/mkt/inbox/all"), j = r.json();
    assert.ok(r.ms < DELAY, "sofort statt warten: " + r.ms + " ms"); assert.strictEqual(j.ok, true);
    assert.deepStrictEqual(Object.keys(j.brands).sort(), ["kochdu", "valuero"], "nur Marken mit Posteingang-Kanälen");
    assert.strictEqual(j.brands.kochdu.at, ""); assert.strictEqual(j.brands.kochdu.refreshing, true);
    const w = await call("/admin/api/mkt/inbox/all", "?wait=10000"), k = w.json();
    assert.ok(w.ms < 5000, "wartet nur bis zur ersten fertigen Marke: " + w.ms);
    const k2 = k.brands.kochdu.refreshing || k.brands.valuero.refreshing ? (await call("/admin/api/mkt/inbox/all", "?wait=10000")).json() : k;
    const ig = k2.brands.kochdu.channels.find(c => c.platform === "instagram"); assert.ok(k2.brands.kochdu.at && !k2.brands.kochdu.refreshing);
    assert.strictEqual(ig.items.filter(i => i.kind === "comment").length, 6); assert.ok(ig.items.some(i => i.kind === "message"));
    assert.ok(!JSON.stringify(k2).includes('"ref"'), "interne Antwort-Adressen bleiben am Server");
    assert.ok(ig.items.every(i => typeof i.isNew === "boolean" && i.platform === "instagram"));
  });
  await t("Plattform: Kommentare je Beitrag gleichzeitig (höchstens 4), Nachrichten parallel – Marke in ~3 statt ~8 Wartezeiten", async () => {
    assert.ok(M.maxCm >= 2 && M.maxCm <= 4, "gleichzeitig " + M.maxCm);
    const P = require(path.join(ROOT, "mkt-publish.js"))({ base: { ig: MB + "/ig" } }), t0 = Date.now();
    const r = await P.inbox("instagram", { platform: "instagram", account: { id: "ig1", handle: "@kochdu" } }, { access: TOK.ig });
    const ms = Date.now() - t0; assert.ok(ms < DELAY * 5, "Instagram in " + ms + " ms (nacheinander wären es " + DELAY * 8 + " ms)");
    assert.deepStrictEqual(r.posts.map(p => p.id), ["m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7"], "Reihenfolge bleibt");
    assert.deepStrictEqual(r.items.filter(i => i.kind === "comment").map(i => i.id), ["ig:c:c-m0", "ig:c:c-m1", "ig:c:c-m2", "ig:c:c-m3", "ig:c:c-m4", "ig:c:c-m5"]);
  });
  await t("Veralteter Stand: kommt sofort (refreshing), viele gleichzeitige Aufrufe → EINE Abfrage je Marke, danach der neue Kommentar", async () => {
    PT.INBOX.get("kochdu").at -= 3 * 60e3; PT.INBOX.get("valuero").at -= 3 * 60e3; M.extra.push({ post: "m1", c: { id: "c-neu", username: "lisa", text: "Ganz neu!", timestamp: new Date().toISOString() } });
    const before = igCalls();
    const rs = await Promise.all([call("/admin/api/mkt/inbox/all"), call("/admin/api/mkt/inbox/all"), call("/admin/api/mkt/inbox/all", "?reload=1"), call("/admin/api/mkt/inbox", "?brand=kochdu"), call("/admin/api/mkt/inbox", "?brand=kochdu")]);
    rs.forEach(r => assert.ok(r.ms < DELAY, "sofort: " + r.ms + " ms"));
    const j = rs[0].json(); assert.strictEqual(j.brands.kochdu.refreshing, true); assert.ok(j.brands.kochdu.channels[0].items.length > 0, "alter Stand sichtbar");
    assert.ok(!JSON.stringify(j).includes("Ganz neu"), "noch der alte Stand");
    await PT.refreshInbox("kochdu"); assert.strictEqual(igCalls() - before, 1, "eine Abfrage trotz 5 Aufrufen");
    const k = (await call("/admin/api/mkt/inbox/all")).json(); assert.ok(JSON.stringify(k.brands.kochdu).includes("Ganz neu")); assert.strictEqual(k.brands.kochdu.refreshing, false);
    const one = (await call("/admin/api/mkt/inbox", "?brand=kochdu")).json(); assert.deepStrictEqual(one.channels, k.brands.kochdu.channels, "gleiche Form wie je Marke");
  });
  await t("/inbox/all: ausgeblendet/erledigt/gelesen wie je Marke, unverändert → nur Kennung, gzip", async () => {
    await PT.refreshInbox("valuero").catch(() => {});
    const a = (await call("/admin/api/mkt/inbox/all")).json(), ig = a.brands.kochdu.channels.find(c => c.platform === "instagram");
    const msg = ig.items.find(i => i.kind === "message"), cm = ig.items.find(i => i.id === "ig:c:c-m2");
    assert.strictEqual((await call("/admin/api/mkt/inbox/act", "", { brand: "kochdu", platform: "instagram", id: msg.id, op: "hide" })).json().removed, true);
    assert.strictEqual((await call("/admin/api/mkt/inbox/act", "", { brand: "kochdu", platform: "instagram", id: cm.id, op: "done" })).json().item.done, true);
    const b = (await call("/admin/api/mkt/inbox/all")).json(), ig2 = b.brands.kochdu.channels.find(c => c.platform === "instagram");
    assert.ok(!ig2.items.some(i => i.id === msg.id), "ausgeblendet"); assert.strictEqual(ig2.items.find(i => i.id === cm.id).done, true); assert.strictEqual(ig2.items.find(i => i.id === cm.id).isNew, false);
    assert.strictEqual(typeof b.counts.kochdu, "number"); assert.notStrictEqual(b.v, a.v);
    const same = await call("/admin/api/mkt/inbox/all", "?v=" + b.v); assert.deepStrictEqual(same.json(), { ok: true, same: true, v: b.v }); assert.ok(same.raw().length < 80);
    const gz = await call("/admin/api/mkt/inbox/all", "", null, { "accept-encoding": "gzip, br" }); assert.strictEqual(gz.head["Content-Encoding"], "gzip");
    assert.strictEqual(JSON.parse(zlib.gunzipSync(gz.raw()).toString("utf8")).v, b.v);
  });
  await t("Plattform-Fehler: letzter Stand bleibt sichtbar, mit Hinweis", async () => {
    M.failMedia = true; await PT.refreshInbox("kochdu"); M.failMedia = false;
    const ig = (await call("/admin/api/mkt/inbox/all")).json().brands.kochdu.channels.find(c => c.platform === "instagram");
    assert.ok(/nicht erreichbar/.test(ig.error), ig.error); assert.ok(ig.items.filter(i => i.kind === "comment").length >= 6, "alte Einträge bleiben");
    await PT.refreshInbox("kochdu"); assert.ok(!(await call("/admin/api/mkt/inbox/all")).json().brands.kochdu.channels.find(c => c.platform === "instagram").error);
  });
  await t("Speichern: inbox-cache.json ohne Tokens; nach Neustart sofort da (ohne Plattform-Abfrage), Antworten gehen an die richtige Adresse", async () => {
    await PT.inboxFlush(); await sleep(300);   // state.json (Kanäle, gelesen/erledigt) ist gespeichert
    const raw = fs.readFileSync(CACHE, "utf8"); assert.ok(raw.length > 1000);
    assert.ok(raw.indexOf(TOK.ig) < 0 && raw.indexOf(TOK.fb) < 0, "keine Tokens in der Datei"); assert.ok(/access_token=(?=["&])/.test(raw), "Token in Adressen entfernt");
    assert.ok(raw.includes('"ref"'), "Antwort-Adressen bleiben am Server");
    const at0 = PT.INBOX.get("kochdu").at, before = M.calls.length;
    MK = fresh(); PT = MK._test.posts._test;   // „Deploy“: neue Instanz, gleicher Datenordner
    const r = await call("/admin/api/mkt/inbox/all"), j = r.json();
    assert.ok(r.ms < DELAY, "sofort nach Neustart: " + r.ms + " ms"); assert.strictEqual(Date.parse(j.brands.kochdu.at), at0, "gespeicherter Stand");
    assert.strictEqual(j.brands.kochdu.refreshing, false, "jünger als 2 Minuten → keine Abfrage"); assert.strictEqual(M.calls.length, before, "keine Plattform-Anfrage");
    assert.ok(j.brands.kochdu.channels.find(c => c.platform === "instagram").items.find(i => i.id === "ig:c:c-m2").done, "erledigt bleibt");
    const rep = await call("/admin/api/mkt/inbox/act", "", { brand: "kochdu", platform: "instagram", id: "ig:c:c-m3", op: "reply", text: "Danke dir!" });
    assert.strictEqual(rep.json().ok, true, rep.json().error); assert.strictEqual(M.replied.comment, "c-m3"); assert.ok(/Danke/.test(M.replied.body));
    PT.INBOX.get("kochdu").at -= 3 * 60e3; const s = (await call("/admin/api/mkt/inbox/all")).json(); assert.strictEqual(s.brands.kochdu.refreshing, true, "veraltet → im Hintergrund");
    await PT.refreshInbox("kochdu");
  });
  await t("Antwort während einer laufenden Abfrage geht nicht verloren; zeigt die Plattform sie, gibt es sie nur einmal", async () => {
    await PT.refreshInbox("kochdu");
    const job = PT.refreshInbox("kochdu"); await sleep(DELAY + 50);   // Medienliste ist da, Kommentare werden gerade geholt
    const rep = await call("/admin/api/mkt/inbox/act", "", { brand: "kochdu", platform: "instagram", id: "ig:c:c-m4", op: "reply", text: "Gerne, bis bald!" });
    assert.strictEqual(rep.json().ok, true, rep.json().error); await job;
    const it = () => (async () => (await call("/admin/api/mkt/inbox/all")).json().brands.kochdu.channels.find(c => c.platform === "instagram").items.find(i => i.id === "ig:c:c-m4"))();
    let i = await it(); assert.ok(i.replies.some(r => r.mine && r.text === "Gerne, bis bald!"), "lokale Antwort bleibt nach der Abfrage");
    assert.ok(i.replies[i.replies.length - 1].mine, "zählt als beantwortet");
    M.rep["c-m4"] = [{ id: "r1", username: "kochdu", text: "Gerne,  bis bald!", timestamp: new Date().toISOString() }];   // Plattform liefert sie jetzt selbst
    await PT.refreshInbox("kochdu"); i = await it();
    assert.strictEqual(i.replies.filter(r => r.mine).length, 1, "nicht doppelt: " + JSON.stringify(i.replies));
    assert.ok(!i.replies[0].local, "Plattform-Fassung statt lokaler Kopie");
  });
  await t("Zwischenspeicher-Datei kaputt → leer starten statt abstürzen", async () => {
    fs.writeFileSync(CACHE, "{kaputt"); const mk = fresh(); const r = res(); await mk.handleAdmin(req("GET"), r, new URL("http://x/admin/api/mkt/inbox/all"), "/admin/api/mkt/inbox/all"); await r.finished;
    assert.strictEqual(r.json().brands.kochdu.at, ""); await mk._test.posts._test.refreshInbox("kochdu"); await mk._test.posts._test.refreshInbox("valuero");
  });

  srv.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  console.log("inbox-cache: " + pass + " ok, " + fail + " fehlgeschlagen");
  if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
  process.exit(0);
})();
