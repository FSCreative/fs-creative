/* Marketing-Planer (mkt-posts.js) und Veröffentlichen (mkt-publish.js) gegen die Plattform-Attrappe (test/social-mock.js):
   App-Zugang, Anmelden (OAuth inkl. Seitenauswahl, Bluesky), KI-Posts (Attrappe) → Medien → Go → Termin → automatisch posten, Fehler + nochmal,
   öffentliche Medien nur nach Freigabe, Instagram-Kommentare mit Bedingungen, Gewinnspiel → Reel. */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { Readable } = require("stream");
const ROOT = path.join(__dirname, "..");
const R = require(path.join(ROOT, "mkt-render.js"));

let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }
const listen = srv => new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
function req(method, body, headers) { const r = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []); r.method = method; r.headers = headers || {}; return r; }
function res() {
  const o = { code: 0, head: {}, chunks: [], headersSent: false, writeHead(c, h) { o.code = c; o.headersSent = true; Object.assign(o.head, h || {}); }, setHeader(k, v) { o.head[k] = v; }, write(c) { o.chunks.push(Buffer.from(c)); }, end(c) { if (c) o.chunks.push(Buffer.from(c)); o.done(); }, on() {}, once() {}, emit() {} };
  o.finished = new Promise(r => { o.done = r; }); o.json = () => JSON.parse(Buffer.concat(o.chunks).toString("utf8") || "{}"); return o;
}
function send(r, code, body, type, headers) { r.writeHead(code, Object.assign({ "Content-Type": type }, headers || {})); r.end(body); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!R.videoReady()) { console.log("mktpost: übersprungen (ffmpeg/satori fehlen)"); process.exit(0); }

(async () => {
  const mock = require(path.join(__dirname, "social-mock.js"))(), mport = await listen(mock.server), MB = "http://127.0.0.1:" + mport;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-mktpost-"));
  let M = null; const pub = http.createServer((q, s) => { const u = new URL(q.url, "http://x"); if (u.pathname.indexOf("/m/") === 0) return M.handlePublic(q, s, u.pathname); s.writeHead(404); s.end(); }), pport = await listen(pub);
  const KI_POSTS = { posts: [
    { format: "karussell", pillar: "So funktioniert's", idea: "In 3 Schritten zum Essen", altText: "Folien mit Schritten", bgQuery: "",
      slides: [{ template: "hook", kicker: "Hunger?", headline: "Dei Wirt is *glei do*", sub: "Bestellen im Montafon", items: [], cta: "Jetzt bestellen", number: "", label: "", author: "", leftTitle: "", leftItems: [], rightTitle: "", rightItems: [], photoQuery: "" },
        { template: "list", kicker: "", headline: "So *einfach*", sub: "", items: ["Wirt wählen", "Bestellen", "Genießen"], cta: "", number: "", label: "", author: "", leftTitle: "", leftItems: [], rightTitle: "", rightItems: [], photoQuery: "" },
        { template: "cta", kicker: "Jetzt", headline: "Heute schon *kapituliert*?", sub: "", items: [], cta: "kochdu.at", number: "", label: "", author: "", leftTitle: "", leftItems: [], rightTitle: "", rightItems: [], photoQuery: "" }],
      captions: { instagram: "Hunger? 🍕\n\nIn drei Schritten zum Essen vom Lieblingswirt.\n\nJetzt bestellen auf kochdu.at", facebook: "Hunger? Bestell auf kochdu.at", tiktok: "Hunger?", linkedin: "Regional bestellen (fair) – kochdu", threads: "Hunger? " + "x".repeat(600), bluesky: "Hunger? In drei Schritten zum Essen vom Lieblingswirt im Montafon. " + "y".repeat(300), youtube: "", youtubeTitle: "", pinterestTitle: "" },
      hashtags: { instagram: ["kochdu", "#Montafon", "Lieferservice", "Essen Bestellen"], tiktok: ["kochdu"], facebook: ["kochdu"], linkedin: ["kochdu"], threads: ["Montafon"], bluesky: ["kochdu", "Montafon"] } },
    { format: "reel", pillar: "Humor", idea: "Montag ohne Kochen", altText: "Reel", bgQuery: "",
      slides: [{ template: "hook", kicker: "", headline: "Heute *kochst du nicht*", sub: "", items: [], cta: "", number: "", label: "", author: "", leftTitle: "", leftItems: [], rightTitle: "", rightItems: [], photoQuery: "" },
        { template: "cta", kicker: "", headline: "Bestell bei *kochdu*", sub: "", items: [], cta: "kochdu.at", number: "", label: "", author: "", leftTitle: "", leftItems: [], rightTitle: "", rightItems: [], photoQuery: "" }],
      captions: { instagram: "Heute kochst du nicht.", facebook: "Heute kochst du nicht.", tiktok: "Heute kochst du nicht 😅", linkedin: "Heute nicht kochen", threads: "Heute kochst du nicht.", bluesky: "Heute kochst du nicht.", youtube: "Heute kochst du nicht – bestell bei kochdu.", youtubeTitle: "Heute kochst du nicht", pinterestTitle: "" },
      hashtags: { instagram: ["kochdu", "Montafon"], tiktok: ["kochdu", "foodtok"], facebook: ["kochdu"], linkedin: [], threads: ["kochdu"], bluesky: ["kochdu"] } } ] };
  let kiCalls = 0, kiUser = "";
  const KI = { configured: () => true, marketingOn: () => true, marketingGen: async (sys, user, schema) => { kiCalls++; kiUser = user; assert.ok(schema && schema.properties.posts); assert.ok(/NICHTS ERFINDEN/.test(sys)); return { json: KI_POSTS, eur: 0.06 }; } };
  M = require(path.join(ROOT, "marketing.js"))({ send, DATA_DIR: dir, ROOT, secret: "test-secret", KI: () => KI, publicBase: "http://127.0.0.1:" + pport, background: false,
    publish: { waitMs: 5, pollMax: 5, base: { igAuth: MB + "/igauth", igToken: MB + "/igapi/oauth/access_token", ig: MB + "/ig", fbAuth: MB + "/fbauth", fb: MB + "/fb", fbUpload: MB + "/fbup", thAuth: MB + "/thauth", th: MB + "/th", liAuth: MB + "/liauth", liToken: MB + "/li/token", li: MB + "/li", gAuth: MB + "/gauth", gToken: MB + "/g/token", yt: MB + "/yt", ytUpload: MB + "/ytup", ttAuth: MB + "/ttauth", tt: MB + "/tt", pinAuth: MB + "/pinauth", pin: MB + "/pin", bsky: MB + "/bsky", bskyVideo: MB + "/bskyv" } },
    push: async () => 0 });
  const PT = M._test.posts._test;
  const call = async (method, p, body, qs) => { const r = res(); await M.handleAdmin(req(method, body), r, new URL("http://x" + p + (qs || "")), p); await r.finished; return r; };
  const waitMedia = async ids => { for (let i = 0; i < 400; i++) { const ps = PT.S().posts.filter(p => ids.indexOf(p.id) > -1); if (ps.every(p => p.media && (p.media.status === "fertig" || p.media.status === "fehler"))) return ps; await sleep(100); } throw new Error("Medien nicht fertig"); };
  const pubGet = async f => { const r = await fetch("http://127.0.0.1:" + pport + "/m/" + f); return r.status; };

  await t("Verbinden ohne App-Zugang wird abgelehnt", async () => {
    const r = await call("POST", "/admin/api/mkt/connect", { brand: "kochdu", platform: "instagram" }); assert.strictEqual(r.code, 400); assert.ok(/App-Zugang/.test(r.json().error));
  });
  await t("App-Zugang speichern: Geheimnis verschlüsselt, nie zurück ans Cockpit", async () => {
    let j = (await call("POST", "/admin/api/mkt/app", { provider: "instagram", clientId: "ig-app-1", secret: "ig-secret-xyz" })).json();
    assert.ok(j.providers.find(p => p.key === "instagram").ready); assert.ok(JSON.stringify(j).indexOf("ig-secret-xyz") < 0);
    await call("POST", "/admin/api/mkt/app", { provider: "facebook", clientId: "fb-app", secret: "fb-sec" }); await call("POST", "/admin/api/mkt/app", { provider: "threads", clientId: "th-app", secret: "th-sec" });
    await sleep(250); const raw = fs.readFileSync(path.join(dir, "marketing", "state.json"), "utf8"); assert.ok(raw.indexOf("ig-secret-xyz") < 0 && raw.indexOf("fb-sec") < 0, "verschlüsselt");
  });
  await t("Instagram verbinden (OAuth): Anmeldeadresse, Rückkehr, Konto gespeichert", async () => {
    const j = (await call("POST", "/admin/api/mkt/connect", { brand: "kochdu", platform: "instagram" })).json();
    const au = new URL(j.url); assert.strictEqual(au.searchParams.get("client_id"), "ig-app-1"); assert.ok(/instagram_business_content_publish/.test(au.searchParams.get("scope"))); assert.ok(/\/admin\/api\/mkt\/oauth\/callback$/.test(au.searchParams.get("redirect_uri")));
    const cb = await call("GET", "/admin/api/mkt/oauth/callback", null, "?code=code-ig&state=" + encodeURIComponent(au.searchParams.get("state")));
    assert.strictEqual(cb.code, 302); assert.ok(/mkt=ok/.test(cb.head.Location), cb.head.Location);
    const again = await call("GET", "/admin/api/mkt/oauth/callback", null, "?code=code-ig&state=" + encodeURIComponent(au.searchParams.get("state"))); assert.ok(/fehler/.test(decodeURIComponent(again.head.Location)), "state nur einmal");
    const ch = PT.S().channels.find(c => c.platform === "instagram"); assert.strictEqual(ch.account.id, "1784"); assert.strictEqual(ch.account.handle, "@kochdu.at"); assert.ok(ch.tok.indexOf("ig-long") < 0, "Token verschlüsselt");
  });
  await t("Facebook: mehrere Seiten → Auswahl", async () => {
    const j = (await call("POST", "/admin/api/mkt/connect", { brand: "kochdu", platform: "facebook" })).json(), st = new URL(j.url).searchParams.get("state");
    const cb = await call("GET", "/admin/api/mkt/oauth/callback", null, "?code=x&state=" + encodeURIComponent(st)); const pick = cb.head.Location.match(/mktpick=([0-9a-f]+)/)[1];
    const o = (await call("GET", "/admin/api/mkt/pick", null, "?id=" + pick)).json(); assert.strictEqual(o.options.length, 2); assert.ok(!JSON.stringify(o).match(/pg1-tok/), "keine Tokens ans Cockpit");
    const r = (await call("POST", "/admin/api/mkt/pick", { id: pick, i: 0 })).json(); assert.ok(r.channels.find(c => c.platform === "facebook" && c.account.id === "pg1"));
  });
  await t("Threads verbinden, Bluesky mit App-Passwort (falsches Passwort abgelehnt)", async () => {
    const j = (await call("POST", "/admin/api/mkt/connect", { brand: "kochdu", platform: "threads" })).json(), st = new URL(j.url).searchParams.get("state");
    await call("GET", "/admin/api/mkt/oauth/callback", null, "?code=x&state=" + encodeURIComponent(st));
    let r = await call("POST", "/admin/api/mkt/connect", { brand: "kochdu", platform: "bluesky", handle: "kochdu.bsky.social", password: "falsch" }); assert.ok(r.code >= 400);
    r = await call("POST", "/admin/api/mkt/connect", { brand: "kochdu", platform: "bluesky", handle: "@kochdu.bsky.social", password: "app-pass-1" }); assert.ok(r.json().channels.find(c => c.platform === "bluesky"));
    PT.upsertChannel("kochdu", { platform: "linkedin", account: { id: "urn:li:person:abc", name: "Simon" }, tok: { access: "li-tok", expiresAt: new Date(Date.now() + 50 * 864e5).toISOString() } });
    PT.upsertChannel("kochdu", { platform: "youtube", account: { id: "UC1", name: "kochdu" }, tok: { access: "yt-acc", refresh: "yt-ref", expiresAt: new Date(Date.now() + 3600e3).toISOString() } });
    PT.upsertChannel("kochdu", { platform: "tiktok", account: { id: "open1", name: "kochdu" }, tok: { access: "tt-acc", refresh: "tt-ref", expiresAt: new Date(Date.now() + 864e5).toISOString() } });
    assert.strictEqual(PT.S().channels.length, 7);
  });
  let car, reel;
  await t("Generieren: KI-Posts als Entwürfe, Plattformen passend zum Format, Termine vorgeschlagen", async () => {
    const r = await call("POST", "/admin/api/mkt/generate", { brand: "kochdu", count: 2, formats: { reel: true, karussell: true, bild: false }, topic: "Wintersaison" }); const j = r.json();
    assert.ok(j.ok, JSON.stringify(j)); assert.strictEqual(kiCalls, 1); assert.ok(/<wunsch>Wintersaison<\/wunsch>/.test(kiUser) && /<profil>/.test(kiUser));
    car = j.posts.find(p => p.format === "karussell"); reel = j.posts.find(p => p.format === "reel");
    assert.deepStrictEqual(car.platforms.sort(), ["bluesky", "facebook", "instagram", "linkedin", "threads"]); assert.ok(reel.platforms.indexOf("youtube") > -1 && reel.platforms.indexOf("tiktok") > -1);
    assert.ok(car.scheduledAt && reel.scheduledAt && Math.abs(Date.parse(car.scheduledAt) - Date.parse(reel.scheduledAt)) >= 20 * 3600e3, "Abstand");
    assert.strictEqual(car.status, "entwurf");
  });
  await t("Medien: Karussell (JPEG + kleine Fassung) und Reel (MP4 + Titelbild)", async () => {
    const [a, b] = await waitMedia([car.id, reel.id]); const c = a.id === car.id ? a : b, rl = a.id === car.id ? b : a;
    assert.strictEqual(c.media.status, "fertig", c.media.error); assert.strictEqual(c.media.images.length, 3); assert.strictEqual(c.media.small.length, 3);
    c.media.small.forEach(f => assert.ok(fs.statSync(path.join(dir, "marketing", "media", f)).size < 1e6));
    assert.strictEqual(rl.media.status, "fertig", rl.media.error); assert.ok(rl.media.video && rl.media.cover && rl.media.duration > 3);
  });
  await t("Öffentliche Medien erst nach Freigabe", async () => {
    const c = PT.S().posts.find(p => p.id === car.id); assert.strictEqual(await pubGet(c.media.images[0]), 404);
    assert.strictEqual(await pubGet("../state.json"), 404);
    const r = (await call("POST", "/admin/api/mkt/post", { id: car.id, op: "go" })).json(); assert.strictEqual(r.post.status, "geplant");
    assert.strictEqual(await pubGet(c.media.images[0]), 200);
  });
  await t("Captions: Hashtags angehängt, Grenzen je Plattform eingehalten", async () => {
    const c = PT.S().posts.find(p => p.id === car.id);
    const ig = PT.captionFor(c, "instagram"); assert.ok(/#kochdu #Montafon #Lieferservice #EssenBestellen$/.test(ig), ig);
    assert.ok(Array.from(PT.captionFor(c, "bluesky")).length <= 300); assert.ok(Array.from(PT.captionFor(c, "threads")).length <= 500); assert.ok(/#Montafon$/.test(PT.captionFor(c, "threads")));
  });
  await t("Go: Termin liegt auf einer der besten Zeiten der Marke (Wien)", async () => {
    const c = PT.S().posts.find(p => p.id === car.id), vp = PT.viennaParts(Date.parse(c.scheduledAt)), hm = String(vp.hh).padStart(2, "0") + ":" + String(vp.mm).padStart(2, "0");
    assert.ok(["11:00", "17:00"].indexOf(hm) > -1, hm); assert.ok(Date.parse(c.scheduledAt) > Date.now());
  });
  await t("Fällig → automatisch posten: Instagram-Karussell, Facebook, Threads, LinkedIn, Bluesky", async () => {
    const c = PT.S().posts.find(p => p.id === car.id); c.scheduledAt = new Date(Date.now() - 60e3).toISOString();
    mock.state.failNext["/fb/v26.0/pg1/feed"] = { status: 500, message: "Kurz nicht erreichbar" };
    await M.tick();
    assert.strictEqual(c.results.instagram.status, "ok", JSON.stringify(c.results.instagram)); assert.ok(/instagram\.com\/p\//.test(c.results.instagram.url));
    const igCar = mock.state.log.filter(l => l === "POST /ig/v26.0/1784/media").length; assert.strictEqual(igCar, 4, "3 Folien + Karussell");
    assert.ok(mock.state.fetched.filter(f => /\/m\//.test(f.url) && f.status === 200).length >= 3, "Instagram hat die Bilder abgeholt");
    assert.strictEqual(c.results.threads.status, "ok", JSON.stringify(c.results.threads)); assert.strictEqual(c.results.linkedin.status, "ok", JSON.stringify(c.results.linkedin)); assert.strictEqual(c.results.bluesky.status, "ok", JSON.stringify(c.results.bluesky));
    assert.strictEqual(c.results.facebook.status, "fehler"); assert.strictEqual(c.status, "teilweise");
    const li = mock.state.posts.find(p => p.pf === "linkedin"); assert.strictEqual(li.images, 3); assert.ok(/\\\(fair\\\)/.test(li.commentary), li.commentary);
    const bs = mock.state.posts.find(p => p.pf === "bluesky"); assert.strictEqual(bs.images, 3); assert.ok(bs.facets >= 2);
  });
  await t("Nochmal versuchen: nur die fehlgeschlagene Plattform", async () => {
    const c = PT.S().posts.find(p => p.id === car.id), before = mock.state.posts.filter(p => p.pf === "instagram").length;
    await call("POST", "/admin/api/mkt/post", { id: car.id, op: "retry", platform: "facebook" }); for (let i = 0; i < 50 && c.status !== "gepostet"; i++) await sleep(50);
    assert.strictEqual(c.status, "gepostet"); assert.strictEqual(c.results.facebook.status, "ok"); assert.strictEqual(mock.state.posts.filter(p => p.pf === "instagram").length, before, "Instagram nicht doppelt");
    const fb = mock.state.posts.filter(p => p.pf === "facebook").pop(); assert.strictEqual(fb.images, 3);
  });
  await t("Reel jetzt posten: Instagram, YouTube Shorts, TikTok (Entwurf), Threads; Token wird rechtzeitig erneuert", async () => {
    const rl = PT.S().posts.find(p => p.id === reel.id);
    const ig = PT.S().channels.find(c => c.platform === "instagram"); const tok = PT.unseal(ig.tok); tok.expiresAt = new Date(Date.now() + 5 * 864e5).toISOString(); ig.tok = PT.seal(tok);
    await call("POST", "/admin/api/mkt/app", { provider: "google", clientId: "g", secret: "gs" }); await call("POST", "/admin/api/mkt/app", { provider: "tiktok", clientId: "tk", secret: "ts" });
    await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "update", patch: { platforms: ["instagram", "youtube", "tiktok", "threads"] } });
    await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "now" }); for (let i = 0; i < 100 && rl.status === "geplant" || rl.status === "läuft"; i++) await sleep(50);
    assert.strictEqual(rl.status, "gepostet", JSON.stringify(rl.results));
    assert.ok(mock.state.uploads.igVideo > 10000, "Instagram hat das Video abgeholt"); assert.ok(/ig-long-2/.test(JSON.stringify(PT.unseal(ig.tok))), "Instagram-Token erneuert");
    assert.ok(/#Shorts$/.test(mock.state.posts.find(p => p.pf === "youtube").title)); assert.strictEqual(mock.state.ytMeta.status.privacyStatus, "public");
    const tt = mock.state.posts.find(p => p.pf === "tiktok"); assert.strictEqual(tt.bytes, tt.size); assert.strictEqual(rl.results.tiktok.status, "entwurf");
  });
  await t("Bearbeiten: Folientext ändern erzeugt Bilder neu; gepostete Posts sind gesperrt", async () => {
    let r = await call("POST", "/admin/api/mkt/post", { id: car.id, op: "update", patch: { captions: { instagram: "x" } } }); assert.strictEqual(r.code, 400);
    const g = (await call("POST", "/admin/api/mkt/generate", { brand: "kochdu", count: 1, formats: { karussell: true, reel: false, bild: false } })).json(); const p = g.posts[0];
    await waitMedia([p.id]); const old = PT.S().posts.find(x => x.id === p.id).media.images[0];
    const sl = PT.S().posts.find(x => x.id === p.id).slides.map(s => Object.assign({}, s)); sl[0].headline = "Neu *hier*";
    r = (await call("POST", "/admin/api/mkt/post", { id: p.id, op: "update", patch: { slides: sl } })).json(); assert.strictEqual(r.post.media.status, "wartet");
    const [n] = await waitMedia([p.id]); assert.notStrictEqual(n.media.images[0], old); assert.ok(!fs.existsSync(path.join(dir, "marketing", "media", old)), "alte Datei weg");
    await call("POST", "/admin/api/mkt/post", { id: p.id, op: "delete" }); assert.ok(!PT.S().posts.find(x => x.id === p.id));
  });
  await t("Instagram-Kommentare: Bedingungen (Markierung, Schluss, Stichwort, Antworten, je Kommentar)", async () => {
    const base = { brand: "kochdu", media: "m-giveaway" };
    let j = (await call("POST", "/admin/api/mkt/ig-participants", Object.assign({ rules: { minTags: 1, until: "2026-10-20T00:00:00Z" } }, base))).json();
    assert.deepStrictEqual(j.participants, ["@lisa.montafon", "@sepp"], JSON.stringify(j)); assert.strictEqual(j.stats.total, 7); assert.strictEqual(j.stats.replies, 1); assert.strictEqual(j.stats.excluded, 1); assert.strictEqual(j.stats.late, 1); assert.strictEqual(j.stats.tags, 1); assert.strictEqual(j.stats.dupes, 1);
    j = (await call("POST", "/admin/api/mkt/ig-participants", Object.assign({ rules: { minTags: 1, keyword: "#kochdu" } }, base))).json(); assert.deepStrictEqual(j.participants, ["@sepp"]);
    j = (await call("POST", "/admin/api/mkt/ig-participants", Object.assign({ rules: { minTags: 0, replies: true, perComment: true, until: "2026-10-20T00:00:00Z" } }, base))).json();
    assert.deepStrictEqual(j.participants, ["@lisa.montafon", "@anna.k", "@markus_b", "@lisa.montafon", "@sepp"]);
    const m = (await call("GET", "/admin/api/mkt/ig-media", null, "?brand=kochdu")).json(); assert.strictEqual(m.media[0].id, "m-giveaway");
    const r = await call("POST", "/admin/api/mkt/ig-participants", { brand: "kantineur", media: "m-giveaway" }); assert.strictEqual(r.code, 400);
  });
  await t("Gewinnspiel mit Instagram-Quelle → Protokoll nennt Bedingungen → als Reel in den Planer", async () => {
    const d = (await call("POST", "/admin/api/mkt/giveaway/draw", { confirm: true, brand: "kochdu", prize: "Gewinn: 50 € Gutschein", text: "@lisa.montafon\n@sepp\n@anna.k", winners: 1, backups: 0,
      source: { type: "instagram", permalink: "https://instagram.com/p/gw", caption: "Gewinnspiel!", loadedAt: new Date().toISOString(), rules: { minTags: 1, until: "2026-10-20T00:00:00Z" }, stats: { total: 7, topLevel: 6, replies: 1, late: 1, tags: 1, excluded: 1, dupes: 1 } } })).json().draw;
    const prot = Buffer.concat((await (async () => { const r = res(); await M.handleAdmin(req("GET"), r, new URL("http://x/admin/api/mkt/giveaway/protocol?id=" + d.id), "/admin/api/mkt/giveaway/protocol"); await r.finished; return r; })()).chunks).toString();
    assert.ok(/Instagram-Kommentaren: https:\/\/instagram\.com\/p\/gw/.test(prot) && /mindestens 1 markierte/.test(prot) && /Nicht prüfbar/.test(prot) && /1 nach Teilnahmeschluss/.test(prot), prot.slice(0, 900));
    for (let i = 0; i < 300; i++) { const x = M._test.state().draws.find(y => y.id === d.id); if (x.video.status === "fertig" || x.video.status === "fehler") break; await sleep(100); }
    const r = (await call("POST", "/admin/api/mkt/giveaway/post", { id: d.id })).json(); assert.ok(r.ok, JSON.stringify(r));
    const p = PT.S().posts.find(x => x.id === r.postId); assert.strictEqual(p.format, "reel"); assert.strictEqual(p.media.status, "fertig"); assert.ok(p.captions.instagram.indexOf(d.winners[0]) > -1); assert.ok(p.platforms.indexOf("instagram") > -1);
    assert.strictEqual(p.status, "entwurf", "erst nach Go");
  });
  await t("Konto trennen entfernt die Plattform aus offenen Posts", async () => {
    const g = (await call("POST", "/admin/api/mkt/generate", { brand: "kochdu", count: 1, formats: { karussell: true, reel: false, bild: false } })).json(); const p = g.posts[0];
    const bs = PT.S().channels.find(c => c.platform === "bluesky"); await call("POST", "/admin/api/mkt/disconnect", { id: bs.id });
    assert.ok(PT.S().posts.find(x => x.id === p.id).platforms.indexOf("bluesky") < 0);
  });

  mock.server.close(); pub.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  console.log("mktpost: " + pass + " ok, " + fail + " fehlgeschlagen");
  if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
  process.exit(0);
})();
