process.env.MKT_WEB = "off";
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
    { format: "karussell", pillar: "So funktioniert's", idea: "In 3 Schritten zum Essen", altText: "Folien mit Schritten", bgQuery: "", firstComment: "Was bestellst du heute? #nichtimkommentar", location: "",
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
    publish: { waitMs: 5, pollMax: 5, base: { igAuth: MB + "/igauth", igToken: MB + "/igapi/oauth/access_token", ig: MB + "/ig", fbAuth: MB + "/fbauth", fb: MB + "/fb", fbUpload: MB + "/fbup", thAuth: MB + "/thauth", th: MB + "/th", liAuth: MB + "/liauth", liToken: MB + "/li/token", li: MB + "/li", gAuth: MB + "/gauth", gToken: MB + "/g/token", yt: MB + "/yt", ytUpload: MB + "/ytup", ttAuth: MB + "/ttauth", tt: MB + "/tt", pinAuth: MB + "/pinauth", pin: MB + "/pin", bsky: MB + "/bsky", bskyVideo: MB + "/bskyv", zn: MB + "/zn" } },
    push: async () => 0 });
  const PT = M._test.posts._test;
  const call = async (method, p, body, qs) => { const r = res(); await M.handleAdmin(req(method, body), r, new URL("http://x" + p + (qs || "")), p); await r.finished; return r; };
  const waitMedia = async ids => { for (let i = 0; i < 1200; i++) { const ps = PT.S().posts.filter(p => ids.indexOf(p.id) > -1); if (ps.every(p => p.media && (p.media.status === "fertig" || p.media.status === "fehler"))) return ps; await sleep(100); } throw new Error("Medien nicht fertig"); };
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
  await t("Facebook: mehrere Seiten → nach Namen den Marken zugeordnet, ohne Treffer → Auswahl", async () => {
    const j = (await call("POST", "/admin/api/mkt/connect", { brand: "kochdu", platform: "facebook" })).json(), st = new URL(j.url).searchParams.get("state");
    const cb = await call("GET", "/admin/api/mkt/oauth/callback", null, "?code=x&state=" + encodeURIComponent(st)); const loc = decodeURIComponent(cb.head.Location);
    assert.ok(/mkt=ok/.test(loc) && /kochdu ← kochdu/.test(loc) && /FS Creative ← FS Creative/.test(loc), loc);
    const fb = PT.S().channels.filter(c => c.platform === "facebook"); assert.deepStrictEqual(fb.map(c => c.brand + ":" + c.account.id).sort(), ["druckshop:pg2", "fs-creative:pg2", "kochdu:pg1"]);
    const j2 = (await call("POST", "/admin/api/mkt/connect", { brand: "valuero", platform: "facebook" })).json(), st2 = new URL(j2.url).searchParams.get("state");
    const cb2 = await call("GET", "/admin/api/mkt/oauth/callback", null, "?code=x&state=" + encodeURIComponent(st2)); const pick = cb2.head.Location.match(/mktpick=([0-9a-f]+)/)[1];
    const o = (await call("GET", "/admin/api/mkt/pick", null, "?id=" + pick)).json(); assert.strictEqual(o.options.length, 2); assert.ok(!JSON.stringify(o).match(/pg1-tok/), "keine Tokens ans Cockpit");
    assert.strictEqual(PT.S().channels.filter(c => c.platform === "facebook").length, 3, "nichts doppelt verbunden");
  });
  await t("Threads verbinden, Bluesky mit App-Passwort (falsches Passwort abgelehnt)", async () => {
    const j = (await call("POST", "/admin/api/mkt/connect", { brand: "kochdu", platform: "threads" })).json(), st = new URL(j.url).searchParams.get("state");
    await call("GET", "/admin/api/mkt/oauth/callback", null, "?code=x&state=" + encodeURIComponent(st));
    let r = await call("POST", "/admin/api/mkt/connect", { brand: "kochdu", platform: "bluesky", handle: "kochdu.bsky.social", password: "falsch" }); assert.ok(r.code >= 400);
    r = await call("POST", "/admin/api/mkt/connect", { brand: "kochdu", platform: "bluesky", handle: "@kochdu.bsky.social", password: "app-pass-1" }); assert.ok(r.json().channels.find(c => c.platform === "bluesky"));
    PT.upsertChannel("kochdu", { platform: "linkedin", account: { id: "urn:li:person:abc", name: "Simon" }, tok: { access: "li-tok", expiresAt: new Date(Date.now() + 50 * 864e5).toISOString() } });
    PT.upsertChannel("kochdu", { platform: "youtube", account: { id: "UC1", name: "kochdu" }, tok: { access: "yt-acc", refresh: "yt-ref", expiresAt: new Date(Date.now() + 3600e3).toISOString() } });
    PT.upsertChannel("kochdu", { platform: "tiktok", account: { id: "open1", name: "kochdu" }, tok: { access: "tt-acc", refresh: "tt-ref", expiresAt: new Date(Date.now() + 864e5).toISOString() } });
    assert.strictEqual(PT.S().channels.length, 9);   // inkl. Facebook bei FS Creative und Druckshop
  });
  let car, reel;
  await t("Standorte je Marke: Instagram-Link/ID erkannt, ohne ID abgelehnt", async () => {
    let r = await call("POST", "/admin/api/mkt/locations", { brand: "kochdu", locations: [{ name: "Schruns", id: "https://www.instagram.com/explore/locations/106097539419617/schruns-vorarlberg-austria/" }, { name: "Bludenz", id: "108215475876451" }] });
    const j = r.json(); assert.deepStrictEqual(j.locations.kochdu, [{ name: "Schruns", id: "106097539419617" }, { name: "Bludenz", id: "108215475876451" }]);
    r = await call("POST", "/admin/api/mkt/locations", { brand: "kochdu", locations: [{ name: "Gaschurn", id: "irgendwas" }] }); assert.strictEqual(r.code, 400);
  });
  await t("Generieren: KI-Posts als Entwürfe, Plattformen passend zum Format, Termine vorgeschlagen", async () => {
    const r = await call("POST", "/admin/api/mkt/generate", { brand: "kochdu", count: 2, formats: { reel: true, karussell: true, bild: false }, topic: "Wintersaison" }); const j = r.json();
    assert.ok(j.ok, JSON.stringify(j)); assert.strictEqual(kiCalls, 1); assert.ok(/<vorgaben>Wintersaison<\/vorgaben>/.test(kiUser) && /<profil>/.test(kiUser) && /in allen Beiträgen um/.test(kiUser));
    car = j.posts.find(p => p.format === "karussell"); reel = j.posts.find(p => p.format === "reel");
    assert.deepStrictEqual(car.platforms.sort(), ["bluesky", "facebook", "instagram", "linkedin", "threads"]); assert.ok(reel.platforms.indexOf("youtube") > -1 && reel.platforms.indexOf("tiktok") > -1);
    assert.ok(car.scheduledAt && reel.scheduledAt && Math.abs(Date.parse(car.scheduledAt) - Date.parse(reel.scheduledAt)) >= 20 * 3600e3, "Abstand");
    assert.strictEqual(car.status, "entwurf");
    assert.ok(/<standorte>Schruns \| Bludenz<\/standorte>/.test(kiUser), "Standorte an die KI");
    assert.strictEqual(car.place.name, "Schruns", "Standard-Standort"); assert.strictEqual(reel.mood, "froehlich", "Stimmung der Marke");
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
    const tg = (await call("POST", "/admin/api/mkt/post", { id: car.id, op: "update", patch: { tags: "@Lisa.Montafon, @kantineur ungültig!", collabs: "@kantineur @a @b @c" } })).json();
    assert.deepStrictEqual(tg.post.tags, ["lisa.montafon", "kantineur"], JSON.stringify(tg)); assert.deepStrictEqual(tg.post.collabs, ["kantineur", "a", "b"]);
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
    mock.state.failNext["/fb/v26.0/pg1/feed"] = { status: 500, message: "Kurz nicht erreichbar", times: 2 };   // auch der zweite Versuch (ohne Ort) scheitert
    await M.tick();
    assert.strictEqual(c.results.instagram.status, "ok", JSON.stringify(c.results.instagram)); assert.ok(/instagram\.com\/p\//.test(c.results.instagram.url));
    const igCar = mock.state.log.filter(l => l === "POST /ig/v26.0/1784/media").length; assert.strictEqual(igCar, 4, "3 Folien + Karussell");
    const parent = mock.state.igParams.find(x => x.media_type === "CAROUSEL"); assert.strictEqual(parent.location_id, "106097539419617", "Standort am Karussell");
    assert.deepStrictEqual(JSON.parse(parent.collaborators), ["kantineur", "a", "b"], "Collab am Karussell");
    const firstKid = mock.state.igParams.find(x => x.is_carousel_item); assert.deepStrictEqual(JSON.parse(firstKid.user_tags).map(u => u.username), ["lisa.montafon", "kantineur"], "Markierungen auf der ersten Folie");
    assert.ok(mock.state.igParams.filter(x => x.is_carousel_item).every(x => x.alt_text === "Folien mit Schritten"), "Alt-Text an den Folien");
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
    const cm = mock.state.comments || []; assert.ok(cm.some(x => x.pf === "instagram" && x.text === "Was bestellst du heute?") && cm.some(x => x.pf === "facebook" && x.text === "Was bestellst du heute?"), "erster Kommentar ohne Hashtags");
    const fb = mock.state.posts.filter(p => p.pf === "facebook").pop(); assert.strictEqual(fb.images, 3); assert.strictEqual(fb.place, "106097539419617"); assert.ok(/utm_source=facebook/.test(fb.message), "Link mit Kampagnen-Kennung");
  });
  await t("Zahlen je Plattform: Aufrufe, Reichweite, Likes; ohne Statistik-Berechtigung nur Likes + Hinweis; LinkedIn ohne Zahlen; Abruf-Takt", async () => {
    const c = PT.S().posts.find(p => p.id === car.id); mock.state.stats = { igNoSaved: true };
    delete c.results.instagram.stats;   // tick() hat im Hintergrund schon einmal (ohne Zahlen) nachgesehen
    assert.ok(PT.statsDue(c, c.results.instagram), "frisch gepostet → fällig");
    const r = (await call("POST", "/admin/api/mkt/post", { id: car.id, op: "stats" })).json(); assert.ok(r.ok, JSON.stringify(r));
    const ig = r.post.results.instagram.stats; assert.strictEqual(ig.views, 321); assert.strictEqual(ig.reach, 200); assert.strictEqual(ig.likes, 12, "Metrik-Liste gekürzt, Likes aus den Feldern"); assert.ok(!ig.need && !ig.err, JSON.stringify(ig));
    const fb = r.post.results.facebook.stats; assert.strictEqual(fb.views, 88); assert.strictEqual(fb.reach, 61); assert.strictEqual(fb.likes, 9); assert.strictEqual(fb.comments, 1); assert.strictEqual(fb.shares, 4);
    assert.strictEqual(r.post.results.threads.stats.views, 40); assert.strictEqual(r.post.results.threads.stats.likes, 6);
    assert.ok(/LinkedIn/.test(r.post.results.linkedin.stats.none)); assert.strictEqual(r.post.results.linkedin.stats.views, undefined);
    assert.ok(!PT.statsDue(c, c.results.instagram), "gerade geholt → erst in 3 Std. wieder");
    mock.state.stats = { igNoPerm: true }; await PT.statsFor(c, true);
    const ig2 = c.results.instagram.stats; assert.strictEqual(ig2.need, "insights"); assert.strictEqual(ig2.views, undefined); assert.strictEqual(ig2.likes, 12); assert.strictEqual(ig2.comments, 3);
    const old = { postedAt: new Date(Date.now() - 40 * 864e5).toISOString() }, ago = d => ({ stats: { at: new Date(Date.now() - d * 864e5).toISOString() } });
    assert.ok(!PT.statsDue(old, ago(2)) && PT.statsDue(old, ago(8)), "nach 30 Tagen wöchentlich");
    assert.ok(!PT.statsDue({ postedAt: new Date(Date.now() - 91 * 864e5).toISOString() }, {}), "nach 90 Tagen nicht mehr");
    // direkt über die Schnittstelle: Facebook-Reel, TikTok über Zernio (auch ohne Analyse-Zusatz), YouTube
    const P2 = require(path.join(ROOT, "mkt-publish.js"))({ base: { fb: MB + "/fb", zn: MB + "/zn", yt: MB + "/yt" } });
    const rl = await P2.statsRemote("facebook", {}, { access: "x" }, { id: "v77", format: "reel" }); assert.strictEqual(rl.views, 77); assert.strictEqual(rl.reach, 55); assert.strictEqual(rl.likes, 9);
    const zt = { via: "zernio", key: "sk_test", account: "zacc1" }, tk = await P2.statsRemote("tiktok", {}, zt, { id: "7439999999999999999", zid: "zp1" });
    assert.deepStrictEqual([tk.views, tk.likes, tk.comments, tk.shares, tk.saves], [999, 50, 4, 7, 1]);
    mock.state.znAnalytics = 402; const tk2 = await P2.statsRemote("tiktok", {}, zt, { id: "x" }); assert.ok(/Analyse-Zusatz/.test(tk2.none)); assert.strictEqual(tk2.views, null); delete mock.state.znAnalytics;
    assert.ok(/nur, wenn TikTok über Zernio/.test((await P2.statsRemote("tiktok", {}, { access: "t" }, { id: "x" })).none));
    const yt = await P2.statsRemote("youtube", {}, { access: "y" }, { id: "vid1" }); assert.deepStrictEqual([yt.views, yt.likes, yt.comments], [1234, 20, 2]);
    delete mock.state.stats;
  });
  await t("Reel jetzt posten: Instagram, YouTube Shorts, TikTok (Entwurf), Threads; Token wird rechtzeitig erneuert", async () => {
    const rl = PT.S().posts.find(p => p.id === reel.id);
    const ig = PT.S().channels.find(c => c.platform === "instagram"); const tok = PT.unseal(ig.tok); tok.expiresAt = new Date(Date.now() + 5 * 864e5).toISOString(); ig.tok = PT.seal(tok);
    await call("POST", "/admin/api/mkt/app", { provider: "google", clientId: "g", secret: "gs" }); await call("POST", "/admin/api/mkt/app", { provider: "tiktok", clientId: "tk", secret: "ts" });
    await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "update", patch: { platforms: ["instagram", "youtube", "tiktok", "threads"] } });
    await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "now" }); for (let i = 0; i < 100 && rl.status === "geplant" || rl.status === "läuft"; i++) await sleep(50);
    assert.strictEqual(rl.status, "gepostet", JSON.stringify(rl.results));
    assert.ok(mock.state.uploads.igVideo > 10000, "Instagram hat das Video abgeholt");
    const rp = mock.state.igParams.find(x => x.media_type === "REELS"); assert.ok(rp.audio_name && rl.media.track && rp.audio_name === rl.media.track.name, "Tonspur-Name = CC0-Titel");
    assert.ok(/CC0/.test(rl.media.track.license)); assert.ok(/ig-long-2/.test(JSON.stringify(PT.unseal(ig.tok))), "Instagram-Token erneuert");
    assert.ok(/#Shorts$/.test(mock.state.posts.find(p => p.pf === "youtube").title)); assert.strictEqual(mock.state.ytMeta.status.privacyStatus, "public");
    const tt = mock.state.posts.find(p => p.pf === "tiktok"); assert.strictEqual(tt.bytes, tt.size); assert.strictEqual(rl.results.tiktok.status, "entwurf");
  });
  await t("TikTok direkt: Sichtbarkeit Pflicht (keine Vorgabe), Kontoangaben, öffentlich mit Link; ungeprüfte App → privat mit Hinweis", async () => {
    const rl = PT.S().posts.find(p => p.id === reel.id), tc = PT.S().channels.find(c => c.brand === "kochdu" && c.platform === "tiktok");
    const tk = PT.unseal(tc.tok); tk.scope = "user.info.basic,video.publish"; tc.tok = PT.seal(tk);
    rl.status = "entwurf"; rl.results = {}; rl.platforms = ["tiktok"];
    let r = await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "go" }); assert.strictEqual(r.code, 400); assert.strictEqual(r.json().tiktok, true, "Cockpit soll das TikTok-Fenster öffnen");
    r = await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "now" }); assert.strictEqual(r.code, 400);
    const ci = (await call("GET", "/admin/api/mkt/tiktok-creator", null, "?brand=kochdu")).json();
    assert.ok(ci.ok && ci.direct && ci.nickname === "FS Creative" && ci.stitchOff === true && ci.privacy.indexOf("PUBLIC_TO_EVERYONE") > -1, JSON.stringify(ci));
    assert.strictEqual((await call("GET", "/admin/api/mkt/posts")).json().channels.find(c => c.brand === "kochdu" && c.platform === "tiktok").direct, true);
    r = await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "update", patch: { opts: { ttPrivacy: "SELF_ONLY", ttBrandPaid: true } } }); assert.strictEqual(r.code, 400, "bezahlte Partnerschaft nie privat");
    r = (await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "update", patch: { opts: { ttPrivacy: "PUBLIC_TO_EVERYONE", ttComment: true, ttDuet: false, ttStitch: true, ttBrandOwn: true, ttPrivacyX: "x" } } })).json();
    assert.deepStrictEqual(r.post.opts, { ttComment: true, ttStitch: true, ttBrandOwn: true, ttPrivacy: "PUBLIC_TO_EVERYONE" });
    await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "now" }); for (let i = 0; i < 100 && (rl.status === "geplant" || rl.status === "läuft"); i++) await sleep(50);
    assert.strictEqual(rl.results.tiktok.status, "ok", JSON.stringify(rl.results)); assert.strictEqual(rl.results.tiktok.url, "https://www.tiktok.com/@fs.creative.at/video/7431234567890123456");
    let pi = mock.state.ttDirect[mock.state.ttDirect.length - 1];
    assert.deepStrictEqual([pi.privacy_level, pi.disable_comment, pi.disable_duet, pi.disable_stitch, pi.brand_organic_toggle, pi.brand_content_toggle], ["PUBLIC_TO_EVERYONE", false, true, true, true, false], "Stitch beim Konto aus → aus; Duett nicht angehakt → aus");
    assert.ok(/Heute kochst du nicht/.test(pi.title) && /#kochdu/.test(pi.title), "Text mit Hashtags"); assert.ok(!PT.S().mkt.ttAudit);
    mock.state.ttUnaudited = true; const n0 = mock.state.ttDirect.length;
    await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "retry", platform: "tiktok" }); for (let i = 0; i < 100 && (rl.status === "geplant" || rl.status === "läuft"); i++) await sleep(50);
    assert.strictEqual(rl.results.tiktok.status, "ok", JSON.stringify(rl.results)); assert.ok(/Nur für dich sichtbar/.test(rl.results.tiktok.note)); assert.strictEqual(rl.results.tiktok.url, "https://www.tiktok.com/@fs.creative.at");
    assert.deepStrictEqual(mock.state.ttDirect.slice(n0).map(x => x.privacy_level), ["PUBLIC_TO_EVERYONE", "SELF_ONLY"]); assert.strictEqual(PT.S().mkt.ttAudit, "private"); assert.strictEqual((await call("GET", "/admin/api/mkt/posts")).json().ttAudit, "private");
    assert.strictEqual((await call("GET", "/admin/api/mkt/tiktok-creator", null, "?brand=kochdu")).json().audit, "private");
    mock.state.ttUnaudited = false;
    // öffentliches Konto + ungeprüfte App: TikTok nimmt gar keinen direkten Post an → Entwurf (mit video.upload), sonst klare Meldung
    mock.state.ttUnauditedPublic = true; const n1 = mock.state.ttDirect.length;
    await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "retry", platform: "tiktok" }); for (let i = 0; i < 100 && (rl.status === "geplant" || rl.status === "läuft"); i++) await sleep(50);
    assert.strictEqual(rl.results.tiktok.status, "fehler"); assert.ok(/noch nicht geprüft/.test(rl.results.tiktok.error), rl.results.tiktok.error);
    tk.scope = "user.info.basic,video.upload,video.publish"; tc.tok = PT.seal(Object.assign(PT.unseal(tc.tok), { scope: tk.scope }));
    await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "retry", platform: "tiktok" }); for (let i = 0; i < 100 && (rl.status === "geplant" || rl.status === "läuft"); i++) await sleep(50);
    assert.strictEqual(rl.results.tiktok.status, "entwurf", JSON.stringify(rl.results)); assert.ok(/erst nach der Prüfung/.test(rl.results.tiktok.note) && /System-Benachrichtigungen/.test(rl.results.tiktok.note));
    assert.deepStrictEqual(mock.state.ttDirect.slice(n1).map(x => x.privacy_level), ["PUBLIC_TO_EVERYONE", "SELF_ONLY", "PUBLIC_TO_EVERYONE", "SELF_ONLY"]);
    assert.strictEqual(PT.S().mkt.ttAudit, "draft"); assert.strictEqual((await call("GET", "/admin/api/mkt/tiktok-creator", null, "?brand=kochdu")).json().audit, "draft");
    mock.state.ttUnauditedPublic = false; tk.scope = "user.info.basic,video.publish"; tc.tok = PT.seal(Object.assign(PT.unseal(tc.tok), { scope: tk.scope }));
    rl.opts = {}; await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "retry", platform: "tiktok" }); for (let i = 0; i < 100 && (rl.status === "geplant" || rl.status === "läuft"); i++) await sleep(50);
    assert.strictEqual(rl.results.tiktok.status, "fehler"); assert.ok(/wer das Video sehen darf/.test(rl.results.tiktok.error), "ohne Wahl kein Entwurf (Scope video.upload fehlt), sondern klarer Hinweis");
    // Nachholen mit TikTok-Fenster (auch bei schon geposteten Posts): nur TikTok-Wahl und TikTok-Text werden übernommen
    rl.opts = { igStory: true, ttDuet: true };
    await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "retry", platform: "tiktok", tt: { ttPrivacy: "MUTUAL_FOLLOW_FRIENDS", ttComment: true, igTrial: true }, caption: "Neu für TikTok", hashtags: ["#neu"] });
    for (let i = 0; i < 100 && (rl.status === "geplant" || rl.status === "läuft"); i++) await sleep(50);
    assert.strictEqual(rl.results.tiktok.status, "ok", JSON.stringify(rl.results)); assert.deepStrictEqual(rl.opts, { igStory: true, ttComment: true, ttPrivacy: "MUTUAL_FOLLOW_FRIENDS" });
    pi = mock.state.ttDirect[mock.state.ttDirect.length - 1]; assert.strictEqual(pi.privacy_level, "MUTUAL_FOLLOW_FRIENDS"); assert.ok(/^Neu für TikTok/.test(pi.title) && /#neu/.test(pi.title), pi.title);
    const cj = (await call("POST", "/admin/api/mkt/connect", { brand: "fs-creative", platform: "tiktok" })).json();
    assert.ok(/scope=user\.info\.basic%2Cvideo\.upload%2Cvideo\.publish/.test(cj.url), "Direkt posten plus Entwurf bis zur Prüfung");
    // Neu verbinden: dasselbe Konto bei FS Creative UND Druckshop erneuern (sonst behält der Druckshop den alten Zugang ohne video.publish), fremde Konten bleiben
    ["fs-creative", "druckshop"].forEach(b => PT.upsertChannel(b, { platform: "tiktok", account: { id: "openFS", name: "FS Creative" }, tok: { access: "tt-alt", refresh: "tt-ref-alt", scope: "user.info.basic,video.upload", expiresAt: new Date(Date.now() + 864e5).toISOString() } }));
    await call("GET", "/admin/api/mkt/oauth/callback", null, "?code=x&state=" + encodeURIComponent(new URL(cj.url).searchParams.get("state")));
    const toks = b => PT.unseal(PT.S().channels.find(c => c.brand === b && c.platform === "tiktok").tok);
    assert.strictEqual(toks("fs-creative").access, "tt-neu"); assert.strictEqual(toks("druckshop").access, "tt-neu", "Druckshop mit erneuert"); assert.ok(/video\.publish/.test(toks("druckshop").scope));
    assert.strictEqual(toks("kochdu").access, "tt-acc", "anderes Konto unberührt");
  });
  await t("TikTok über Zernio: Schlüssel verbinden (gemeinsames Konto mit), direkt öffentlich mit Text + Hashtags, kein Doppelpost", async () => {
    let r = await call("POST", "/admin/api/mkt/connect", { brand: "fs-creative", platform: "tiktok", zernioKey: "sk_falsch" }); assert.strictEqual(r.code, 400); assert.ok(/API-Schlüssel ungültig/.test(r.json().error), r.json().error);
    r = await call("POST", "/admin/api/mkt/connect", { brand: "fs-creative", platform: "tiktok", zernioKey: " sk_test " }); assert.strictEqual(r.code, 200, JSON.stringify(r.json()));
    assert.ok(JSON.stringify(r.json()).indexOf("sk_test") < 0, "Schlüssel nie zurück ans Cockpit");
    const tch = b => PT.S().channels.find(c => c.brand === b && c.platform === "tiktok"), zt = b => PT.unseal(tch(b).tok);
    assert.strictEqual(zt("fs-creative").via, "zernio"); assert.strictEqual(zt("fs-creative").key, "sk_test"); assert.strictEqual(tch("fs-creative").account.handle, "@fs.creative.at");
    assert.strictEqual(zt("druckshop").via, "zernio", "Druckshop (dasselbe TikTok-Konto) mit umgestellt"); assert.strictEqual(zt("kochdu").access, "tt-acc", "anderes Konto unberührt");
    const chp = r.json().channels.find(c => c.brand === "fs-creative" && c.platform === "tiktok"); assert.strictEqual(chp.direct, true); assert.strictEqual(chp.via, "zernio");
    const ci = (await call("GET", "/admin/api/mkt/tiktok-creator", null, "?brand=fs-creative")).json(); assert.deepStrictEqual(ci.privacy, ["PUBLIC_TO_EVERYONE"]); assert.strictEqual(ci.stitchOff, true); assert.strictEqual(ci.username, "fs.creative.at");
    // kochdu ebenfalls über Zernio, dann das Reel direkt posten
    await call("POST", "/admin/api/mkt/connect", { brand: "kochdu", platform: "tiktok", zernioKey: "sk_test" });
    const rl = PT.S().posts.find(p => p.id === reel.id); rl.status = "gepostet"; rl.results = {}; rl.platforms = ["tiktok"]; rl.opts = {};
    const go = async tt => { await call("POST", "/admin/api/mkt/post", { id: reel.id, op: "retry", platform: "tiktok", tt }); for (let i = 0; i < 200 && (rl.status === "geplant" || rl.status === "läuft"); i++) await sleep(50); return rl.results.tiktok; };
    let res1 = await go({ ttPrivacy: "SELF_ONLY" }); assert.strictEqual(res1.status, "fehler"); assert.ok(/nur öffentlich/.test(res1.error), res1.error);
    res1 = await go({ ttPrivacy: "PUBLIC_TO_EVERYONE", ttComment: true, ttDuet: true, ttStitch: true });
    assert.strictEqual(res1.status, "ok", JSON.stringify(res1)); assert.strictEqual(res1.url, "https://www.tiktok.com/@fs.creative.at/video/7439999999999999999");
    const zp = mock.state.zn.posts[mock.state.zn.posts.length - 1].json, ts = zp.tiktokSettings;
    assert.ok(/#/.test(zp.content) && zp.content.length > 5, "Text mit Hashtags: " + zp.content); assert.ok(/\/m\//.test(zp.mediaItems[0].url)); assert.ok(mock.state.zn.got[0] > 10000, "Zernio hat das Video abgeholt");
    assert.strictEqual(ts.privacy_level, "PUBLIC_TO_EVERYONE"); assert.strictEqual(ts.allow_comment, true); assert.strictEqual(ts.allow_duet, true); assert.strictEqual(ts.allow_stitch, false, "Stitch beim Konto aus");
    assert.strictEqual(ts.commercialContentType, "none"); assert.strictEqual(PT.S().mkt.ttAudit, "");
    // nochmal mit gleichem Inhalt: Zernio meldet 409 → der vorhandene Post gilt, kein zweiter
    const n = mock.state.zn.posts.length; res1 = await go({ ttPrivacy: "PUBLIC_TO_EVERYONE", ttComment: true });
    assert.strictEqual(res1.status, "ok", JSON.stringify(res1)); assert.strictEqual(mock.state.zn.posts.length, n, "kein Doppelpost");
    // tägliche Prüfung: TikTok bei Zernio abgelaufen → Hinweis, Schlüssel bleibt gültig
    mock.state.znHealth = "error"; const vh = (await M._test.posts.verifyPlatform("tiktok", true)).channels.find(c => c.brand === "kochdu" && c.platform === "tiktok");
    assert.ok(/in Zernio TikTok neu verbinden/.test(vh.verifyError), vh.verifyError); assert.strictEqual(vh.status, "ok"); mock.state.znHealth = "";
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
  await t("Dauerhafte Vorgaben je Marke + Neu schreiben eines Posts mit Anweisung", async () => {
    await call("POST", "/admin/api/mkt/brand", { key: "kochdu", patch: { standing: "Immer die Wirte namentlich nennen." } });
    const g = (await call("POST", "/admin/api/mkt/generate", { brand: "kochdu", count: 1, formats: { karussell: true, reel: false, bild: false }, instructions: "lustig" })).json(); const p = g.posts[0];
    assert.ok(/<dauerhaft>Immer die Wirte namentlich nennen\.<\/dauerhaft>/.test(kiUser) && /<vorgaben>lustig<\/vorgaben>/.test(kiUser));
    await waitMedia([p.id]);
    let r = await call("POST", "/admin/api/mkt/post", { id: p.id, op: "rewrite", instruction: "" }); assert.strictEqual(r.code, 400);
    r = (await call("POST", "/admin/api/mkt/post", { id: p.id, op: "rewrite", instruction: "kürzer und mit Frage" })).json(); assert.ok(r.ok, JSON.stringify(r));
    assert.ok(/<bisher_beitrag>/.test(kiUser) && /<vorgaben>kürzer und mit Frage<\/vorgaben>/.test(kiUser) && !/data:image/.test(kiUser), "kein Bild an die KI");
    assert.strictEqual(r.post.format, "karussell"); assert.strictEqual(r.post.media.status, "wartet");
    const [n] = await waitMedia([p.id]); assert.strictEqual(n.media.status, "fertig");
    await call("POST", "/admin/api/mkt/post", { id: p.id, op: "delete" });
  });
  await t("Instagram: höchstens 5 Hashtags (Instagram-Grenze seit 12/2025)", async () => {
    const c = PT.S().posts.find(p => p.id === car.id), saved = c.hashtags.instagram; c.hashtags.instagram = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"];
    const ig = PT.captionFor(c, "instagram"); assert.strictEqual((ig.match(/#\w+/g) || []).length, 5); c.hashtags.instagram = saved;
  });
  await t("Instagram mit mehr Hashtags eingestellt: abgelehnt → automatisch mit 5 nochmal", async () => {
    let j = (await call("POST", "/admin/api/mkt/app", { provider: "igTags", value: 15 })).json(); assert.strictEqual(j.igTags, 15);
    const g = (await call("POST", "/admin/api/mkt/generate", { brand: "kochdu", count: 1, formats: { karussell: false, reel: false, bild: true } })).json();
    assert.ok(/instagram-Hashtags genau 15/.test(kiUser));
    const p = PT.S().posts.find(x => x.id === g.posts[0].id); await waitMedia([p.id]);
    p.hashtags.instagram = Array.from({ length: 12 }, (_, i) => "tag" + i); p.platforms = ["instagram"];
    await call("POST", "/admin/api/mkt/post", { id: p.id, op: "now" }); for (let i = 0; i < 100 && (p.status === "geplant" || p.status === "läuft"); i++) await sleep(50);
    assert.strictEqual(p.results.instagram.status, "ok", JSON.stringify(p.results)); assert.ok(/5 Hashtags/.test(p.results.instagram.note), p.results.instagram.note);
    await call("POST", "/admin/api/mkt/app", { provider: "igTags", value: 5 });
  });
  await t("Konto trennen entfernt die Plattform aus offenen Posts", async () => {
    const g = (await call("POST", "/admin/api/mkt/generate", { brand: "kochdu", count: 1, formats: { karussell: true, reel: false, bild: false } })).json(); const p = g.posts[0];
    const bs = PT.S().channels.find(c => c.platform === "bluesky"); await call("POST", "/admin/api/mkt/disconnect", { id: bs.id });
    assert.ok(PT.S().posts.find(x => x.id === p.id).platforms.indexOf("bluesky") < 0);
  });

  await t("Bildwahl: KI-Bild passt → genau dieses; „kein passendes“ → Hook ohne Foto (kochdu); ohne Beschreibung reihum", async () => {
    const ph = [{ id: "s-a.jpg" }, { id: "s-b.jpg" }, { id: "s-c.jpg" }];
    const pl = PT.photoPlan("kochdu", [{ template: "hook", photo: "s-c.jpg" }, { template: "list" }, { template: "photo", photo: "" }], ph, true);
    assert.strictEqual(pl[0].it.id, "s-c.jpg"); assert.strictEqual(pl[1], null); assert.ok(pl[2] && pl[2].it.id !== "s-c.jpg", "Foto-Vorlage braucht ein Bild, nicht doppelt");
    assert.strictEqual(PT.photoPlan("kochdu", [{ template: "hook", photo: "" }], ph, true)[0], null, "kein passendes → ohne Foto");
    assert.ok(PT.photoPlan("kochdu", [{ template: "hook", photo: "" }], ph, false)[0], "ohne Beschreibungen wie bisher");
    assert.ok(PT.photoPlan("valuero", [{ template: "hook", photo: "" }], ph, true)[0], "VALUERO braucht immer ein Bild");
  });
  await t("Bildbeschreibung: einmal je Foto, Liste <bilder> im KI-Auftrag", async () => {
    let seen = 0; KI.marketingVision = async items => { seen += items.length; return { images: items.map(x => ({ id: x.id, desc: "Testbild " + x.id })), eur: 0.001 }; };
    const n1 = await PT.describeLibrary("kochdu"), first = seen; const n2 = await PT.describeLibrary("kochdu");
    assert.ok(first > 0, "beschrieben"); assert.strictEqual(seen, first, "zweiter Lauf beschreibt nichts neu"); void n1; void n2;
    const lib = (await call("GET", "/admin/api/mkt/library", null, "?brand=kochdu")).json();
    assert.ok(lib.items.some(x => /Testbild/.test(x.desc || "")), "Beschreibung in der Sammlung");
    delete KI.marketingVision;
  });
  await t("TikTok: Stückgrößen nach TikTok-Regeln (5–10 MB als Ganzes, darüber 10-MB-Stücke mit Rest am Ende)", async () => {
    const { ttChunks } = require(path.join(ROOT, "mkt-publish.js"))({})._test, MB = 1024 * 1024;
    assert.deepStrictEqual(ttChunks(3 * MB), { chunk: 3 * MB, n: 1 });
    assert.deepStrictEqual(ttChunks(7 * MB + 123), { chunk: 7 * MB + 123, n: 1 });   // vorher 10 MB > Videogröße → „The chunk size is invalid“
    assert.deepStrictEqual(ttChunks(64 * MB), { chunk: 64 * MB, n: 1 });
    const big = ttChunks(95 * MB + 5); assert.deepStrictEqual(big, { chunk: 10 * MB, n: 9 }); assert.ok(95 * MB + 5 - (big.n - 1) * big.chunk <= 128 * MB, "letztes Stück ≤ 128 MB");
  });
  await t("Facebook Login for Business: mit Konfigurations-ID config_id statt scope", async () => {
    const P2 = require(path.join(ROOT, "mkt-publish.js"))({});
    const a = new URL(P2.authUrl("facebook", { clientId: "11", redirect: "https://x/cb", state: "s", configId: "987654" }));
    assert.strictEqual(a.searchParams.get("config_id"), "987654"); assert.ok(!a.searchParams.get("scope")); assert.strictEqual(a.searchParams.get("response_type"), "code");
    const b = new URL(P2.authUrl("facebook", { clientId: "11", redirect: "https://x/cb", state: "s" })); assert.ok(/pages_manage_posts/.test(b.searchParams.get("scope")));
    const r = await call("POST", "/admin/api/mkt/app", { provider: "facebook", clientId: "11", secret: "geheim", configId: "98 76-54" });
    assert.strictEqual(r.json().providers.find(x => x.key === "facebook").configId, "987654");
  });
  await t("Posteingang: je Marke alle verbundenen Kanäle, Fehler einzelner Kanäle brechen nichts ab, „neu“ wird beim Öffnen zurückgesetzt", async () => {
    const r = await call("GET", "/admin/api/mkt/inbox", null, "?brand=kochdu&seen=1"), j = r.json();
    assert.strictEqual(j.ok, true, j.error); assert.ok(j.channels.length >= 3, "Kanäle " + j.channels.length); j.channels.forEach(c => assert.ok(Array.isArray(c.items) && (c.error || c.notes)));
    assert.ok(!JSON.stringify(j).includes('"ref"'), "interne Antwort-Adressen bleiben am Server");
    const unread = j.channels.flatMap(c => c.items.filter(i => i.isNew)), c = (await call("GET", "/admin/api/mkt/inbox/counts")).json(); assert.strictEqual(c.counts.kochdu, unread.length, "ungelesen bis gelesen");
    if (unread.length) { const r1 = (await call("POST", "/admin/api/mkt/inbox/act", { brand: "kochdu", op: "read", ids: [unread[0].id] })).json(); assert.strictEqual(r1.counts.kochdu, unread.length - 1); }
    assert.strictEqual((await call("POST", "/admin/api/mkt/inbox/act", { brand: "kochdu", op: "readall" })).json().counts.kochdu, 0);
    const it0 = j.channels.flatMap(c => c.items.map(i => Object.assign({ pf: c.platform }, i))).find(i => i.kind === "message");
    if (it0) { assert.strictEqual((await call("POST", "/admin/api/mkt/inbox/act", { brand: "kochdu", platform: it0.pf, id: it0.id, op: "hide" })).json().removed, true);
      assert.ok(!(await call("GET", "/admin/api/mkt/inbox", null, "?brand=kochdu")).json().channels.some(c => c.items.some(i => i.id === it0.id)), "ausgeblendet"); }
    assert.strictEqual((await call("POST", "/admin/api/mkt/inbox/act", { brand: "kochdu", platform: "instagram", id: "gibtsnicht", op: "reply", text: "x" })).code, 404);
  });
  await t("Envato-ZIP: Fotos und Videos in die Sammlung, Sounds in die Musik, Lizenz mit Projekt je Datei", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-env-")), ff = a => R.ffmpeg(a);
    await ff(["-f", "lavfi", "-i", "color=red:s=800x600", "-frames:v", "1", path.join(tmp, "a.jpg")]);
    await ff(["-f", "lavfi", "-i", "color=blue:s=640x360:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(tmp, "v.mp4")]);
    await ff(["-f", "lavfi", "-i", "sine=f=440:d=1", path.join(tmp, "s.wav")]);
    const fz = require("fflate"), inner = fz.zipSync({ "Song/s.wav": fs.readFileSync(path.join(tmp, "s.wav")) });
    const zip = Buffer.from(fz.zipSync({ "Foto/a.jpg": fs.readFileSync(path.join(tmp, "a.jpg")), "Clip/v.mp4": fs.readFileSync(path.join(tmp, "v.mp4")), "sound.zip": inner, "License.txt": Buffer.from("Envato Elements License Certificate – Item: Test"), "__MACOSX/._a.jpg": Buffer.from("x") }));
    const r = await PT.envatoImport({ key: "kochdu", name: "kochdu" }, zip, "kochdu Social Media", "test.zip");
    assert.deepStrictEqual([r.photos, r.clips, r.sounds], [1, 1, 1], JSON.stringify(r)); assert.strictEqual(r.license.hasText, true);
    const lib = (await call("GET", "/admin/api/mkt/library", null, "?brand=kochdu")).json(), e = lib.items.filter(x => /envato/.test(x.name));
    assert.strictEqual(e.length, 2); assert.ok(e.every(x => /Envato · kochdu Social Media/.test(x.lic)), JSON.stringify(e));
    const mus = (await call("GET", "/admin/api/mkt/posts")).json().music.find(m => /Envato/.test(m.license || "")); assert.ok(mus, "Sound in der Musik");
    await assert.rejects(PT.envatoImport({ key: "kochdu", name: "kochdu" }, Buffer.from("kein zip"), "x"), /ZIP/);
  });
  await t("Druckshop: Produktfotos aus dem Shop in der Bildersammlung (mit Beschreibung, ausblendbar, verschwinden mit dem Produkt)", async () => {
    let prods = [{ key: "visitenkarten", title: "Visitenkarten", desc: "Klassisch auf 400 g", img: "https://images.ctfassets.net/x/vk.jpg?fm=jpg&q=85&w=1080" },
      { key: "flyer", title: "Flyer", desc: "", img: "https://images.ctfassets.net/x/fl.jpg?fm=jpg&q=85&w=1080" }, { key: "boese", title: "Fremd", desc: "", img: "https://example.org/x.jpg" }];
    const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-mkt3-")), jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4000, 1)]), fetched = [];
    const M3 = require(path.join(ROOT, "marketing.js"))({ send, DATA_DIR: dir3, ROOT, secret: "t", KI: () => null, publicBase: "http://127.0.0.1", background: false, push: async () => 0, printProducts: async () => prods });
    const P3 = M3._test.posts._test, of = global.fetch;
    global.fetch = async (u, o) => { if (/images\.ctfassets\.net/.test(String(u))) { fetched.push(String(u)); return { ok: true, status: 200, arrayBuffer: async () => jpg }; } return of(u, o); };
    try {
      assert.strictEqual(await P3.syncPrintPhotos(true), 2); assert.strictEqual(fetched.length, 2, "nur Bilder vom Shop-Bilddienst");
      const lib = P3.library("druckshop").filter(x => x.product); assert.deepStrictEqual(lib.map(x => x.id), ["p-flyer.jpg", "p-visitenkarten.jpg"]); assert.ok(lib.every(x => x.kind === "photo" && !x.own));
      assert.ok(/^Produktfoto aus dem Shop: Visitenkarten – Klassisch auf 400 g$/.test(P3.S().mkt.libDesc.druckshop["p-visitenkarten.jpg"].d));
      assert.ok(!P3.library("kochdu").some(x => x.product), "nur beim Druckshop");
      assert.strictEqual(await P3.syncPrintPhotos(), 0, "höchstens alle 12 Stunden"); assert.strictEqual(fetched.length, 2);
      const rm = res(); await M3.handleAdmin(req("POST", { brand: "druckshop", remove: "p-flyer.jpg" }), rm, new URL("http://x/admin/api/mkt/library"), "/admin/api/mkt/library"); await rm.finished;
      assert.ok(!P3.library("druckshop").some(x => x.id === "p-flyer.jpg"), "ausgeblendet");
      prods = prods.filter(x => x.key !== "visitenkarten"); await P3.syncPrintPhotos(true);
      assert.ok(!fs.existsSync(path.join(dir3, "marketing", "library-print", "visitenkarten.jpg")) && !P3.S().mkt.libDesc.druckshop["p-visitenkarten.jpg"], "nicht mehr im Shop → weg");
    } finally { global.fetch = of; try { fs.rmSync(dir3, { recursive: true, force: true }); } catch (e) {} }
  });
  mock.server.close(); pub.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  console.log("mktpost: " + pass + " ok, " + fail + " fehlgeschlagen");
  if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
  process.exit(0);
})();
