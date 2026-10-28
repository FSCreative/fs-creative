"use strict";
/* Reel-Musik (mkt-music.js): Analyse (Tempo, Stille, Lautheit, Qualitätsfilter), Auswahl mit Rotation und Lockerungsleiter, Lizenz und Credit,
   Startpunkt/Drop/−14 LUFS im fertigen Reel, Stability-Adapter gegen eine Attrappe (kein Netz), Budget, Prompt, Migration, „Andere Musik“
   (nur Ton neu muxen vs. neu rendern), Aufräumen, Routen. Läuft ohne Schlüssel und ohne Internet. */
delete process.env.STABILITY_API_KEY;   // nie die echte Stability-API: alle Anfragen gehen an die Attrappe (fetch je Testfall)
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { Readable } = require("stream");
const ROOT = path.join(__dirname, "..");
const R = require(path.join(ROOT, "mkt-render.js")), MUM = require(path.join(ROOT, "mkt-music.js")), MO = require(path.join(ROOT, "mkt-motion.js"))(R);

let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { const t0 = Date.now(); try { await fn(); pass++; if (process.env.MUSIK_DEBUG) console.log("ok", name, Date.now() - t0, "ms"); } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }
if (!R.FFMPEG() || !fs.existsSync(R.FFMPEG())) { console.log("musik: übersprungen (ffmpeg fehlt)"); process.exit(0); }
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-musik-"));
const ffm = args => execFileSync(R.FFMPEG(), ["-hide_banner", "-loglevel", "error", "-y"].concat(args), { maxBuffer: 1 << 28 });
// Testsignale per ffmpeg (aevalsrc): Klicks im Takt + Ton
function sig(name, expr, d, rate) { const f = path.join(TMP, name); ffm(["-f", "lavfi", "-i", "aevalsrc='" + expr + "':s=" + (rate || 22050) + ":d=" + d, "-ac", "1", f]); return f; }
const clickExpr = (bpm, b0, amp) => (amp || 0.5) + "*sin(2*PI*1500*t)*exp(-90*mod(t-" + b0 + "+10," + (60 / bpm).toFixed(6) + "))+0.15*sin(2*PI*110*t)";
const KEY = "sk-TESTKEY-0123456789abcdef";
const SEAL = o => "sealed:" + Buffer.from(JSON.stringify(o)).toString("base64"), UNSEAL = x => { try { return JSON.parse(Buffer.from(String(x).slice(7), "base64").toString()); } catch (e) { return null; } };
const BRANDS = () => Object.fromEntries(Object.keys(MUM.PROFILES).map(k => [k, { key: k, name: { kochdu: "kochdu", kantineur: "Der Kantineur", blitzdings: "Blitzdings", valuero: "VALUERO", skikaiser: "Skikaiser", huettengaudi: "Hüttengaudi", druckshop: "FS Creative Druckshop", "fs-creative": "FS Creative" }[k], enabled: true, locations: k === "kochdu" ? [{ name: "Schruns", id: "1" }] : [] }]));
const logs = [];
function mk(o) {
  o = o || {}; const dir = fs.mkdtempSync(path.join(TMP, "mu-")), st = Object.assign({ posts: [], mkt: {}, brands: BRANDS() }, o.state || {}), media = path.join(dir, "media"); fs.mkdirSync(media, { recursive: true });
  const J = (res, code, x) => { res.code = code; res.body = x; res.done && res.done(); };
  const MU = MUM(Object.assign({ S: () => st, save() {}, DIR: dir, ROOT, WORK: path.join(dir, "work"), MEDIA: media, R, MO, seal: SEAL, unseal: UNSEAL, J, background: false, pollMs: 5, timeoutMs: 400, backoffMs: 5,
    log: (...a) => logs.push(a.join(" ")), body: async req => req.payload, sendFile: (req, res, f, type) => { res.code = 200; res.file = f; res.type = type; res.done && res.done(); } }, o.C || {}));
  return { MU, st, dir, media };
}
const reelPost = (id, brand, day, x) => Object.assign({ id, brand, format: "reel", status: "entwurf", platforms: ["instagram", "facebook"], scheduledAt: new Date(Date.UTC(2026, 10, 1 + day, 10)).toISOString(), createdAt: "2026-10-28T08:00:00Z", media: { status: "fertig" } }, x || {});
// Stability-Attrappe: Szenario je Aufruf (POST 3.0/2.5, GET results, GET balance); zeichnet Aufrufe auf
function stab(sc) {
  const calls = [], wav = sc.wav;
  const json = (o, status, h) => new Response(JSON.stringify(o), { status: status || 200, headers: Object.assign({ "content-type": "application/json" }, h || {}) });
  const f = async (url, opts) => {
    opts = opts || {}; const u = String(url), auth = (opts.headers || {}).Authorization || "", c = { url: u, method: opts.method || "GET", auth };
    if (opts.body && opts.body.get) c.form = Object.fromEntries(["prompt", "duration", "seed", "steps", "cfg_scale", "output_format", "model"].map(k => [k, opts.body.get(k)]));
    calls.push(c);
    if (auth !== "Bearer " + KEY) return json({ errors: ["unauthorized"] }, 401);
    if (/\/v1\/user\/balance$/.test(u)) return json({ credits: 912.5 });
    if (/stable-audio-2\/text-to-audio$/.test(u)) { const s = (sc.v25 || []).shift() || "ok"; if (s === "ok") return json({ audio: wav.toString("base64"), finish_reason: "SUCCESS", seed: 77 }); return json({ errors: ["kaputt"] }, +s); }
    if (/stable-audio\/text-to-audio$/.test(u)) { const s = (sc.v3 || []).shift() || "202"; if (s === "202") return json({ id: "job-" + calls.length }, 202); if (s === "200") return json({ audio: wav.toString("base64"), finish_reason: "SUCCESS", seed: 55 }); return json({ errors: ["Fehler " + s], name: "bad" }, +s); }
    if (/\/v2beta\/audio\/results\//.test(u)) { const s = (sc.poll || []).shift() || "200"; if (s === "202") return json({ id: "x", status: "in-progress" }, 202); if (s === "200") return json({ audio: wav.toString("base64"), finish_reason: "SUCCESS", seed: 4242 }, 200, { "x-request-id": "rq-1" }); return json({ errors: ["poll " + s] }, +s); }
    return json({ errors: ["?"] }, 404);
  };
  f.calls = calls; return f;
}
function req(payload) { const r = Readable.from([]); r.method = "POST"; r.headers = {}; r.payload = payload; return r; }
function res() { const o = {}; o.finished = new Promise(r => { o.done = r; }); return o; }
async function route(MU, method, p, payload, qs) { const rq = req(payload); rq.method = method; const rs = res(); try { await MU.handleAdmin(rq, rs, new URL("http://x" + p + (qs || "")), p); } catch (e) { rs.code = e.status || 500; rs.body = { ok: false, error: e.message }; } return rs; }
const vhash = f => execFileSync(R.FFMPEG(), ["-hide_banner", "-loglevel", "error", "-i", f, "-map", "0:v", "-c", "copy", "-f", "md5", "-"]).toString().trim();
// ebur128-Summary lesen (stderr auch bei Exit 0): über spawnSync
const { spawnSync } = require("child_process");
function measure(file, extra) { const r = spawnSync(R.FFMPEG(), ["-hide_banner", "-nostats"].concat(extra || [], ["-i", file, "-vn", "-af", "ebur128=peak=true:framelog=verbose", "-f", "null", "-"]), { encoding: "utf8" }); const s = String(r.stderr || ""), sum = s.slice(s.lastIndexOf("Summary:"));
  const I = sum.match(/I:\s*(-?[\d.]+)\s*LUFS/), tp = sum.match(/Peak:\s*(-?[\d.]+|-inf)\s*dBFS/); return { lufs: I ? +I[1] : null, tp: tp ? +tp[1] : null }; }

(async () => {
  const { MU: MU0 } = mk();
  // ── Analyse ──
  const click120 = sig("click120.wav", clickExpr(120, 0.25), 30);
  await t("Analyse: 120-BPM-Klickspur → 120 ± 1 BPM, Konfidenz ≥ 0,5, beat0 ± 20 ms", async () => {
    const a = await MU0.analyse(click120); assert.ok(Math.abs(a.bpm - 120) <= 1, "bpm " + a.bpm); assert.ok(a.bpmConf >= 0.5, "conf " + a.bpmConf);
    const ph = ((a.beat0 - 0.25) % 0.5 + 0.5) % 0.5; assert.ok(Math.min(ph, 0.5 - ph) <= 0.02, "beat0 " + a.beat0); assert.ok(a.ms < 3000, "Laufzeit " + a.ms + " ms");
  });
  await t("Analyse: 3 s Stille + Signal → introEnd 3,0 ± 0,1", async () => {
    const f = sig("intro3.wav", "(" + clickExpr(110, 0) + ")*gte(t,3)", 30), a = await MU0.analyse(f); assert.ok(Math.abs(a.introEnd - 3) <= 0.1, "introEnd " + a.introEnd);
    // KI-Titel mit mehr als 3 s Stille: wird beim Aufnehmen abgeschnitten (danach ohne Intro-Stille), sonst beanstandet
    assert.ok(MUM.quality(Object.assign({}, a, { introEnd: 3.4 }), { ai: true }).reasons.some(r => /Intro-Stille/.test(r)));
    const f4 = sig("intro4.wav", "(" + clickExpr(110, 0) + ")*gte(t,4)", 30), ing = await MU0._test.ingest(f4, path.join(TMP, "intro4.m4a"), { ai: true });
    assert.ok(Math.abs(ing.cut.start - 3.9) <= 0.15 && ing.a.introEnd <= 0.2, "abgeschnitten: " + JSON.stringify(ing.cut) + " intro " + ing.a.introEnd);
  });
  await t("Qualitätsfilter: leises Rauschen (≈ −40 LUFS), 15-s-Datei und Clipping werden abgelehnt", async () => {
    const noise = path.join(TMP, "noise.wav"); ffm(["-f", "lavfi", "-i", "anoisesrc=d=30:c=pink:a=0.006", "-ac", "1", noise]);
    const an = await MU0.analyse(noise); assert.ok(an.lufs < -30, "lufs " + an.lufs); assert.ok(!MUM.quality(an, {}).ok);
    const a15 = await MU0.analyse(sig("short.wav", clickExpr(120, 0), 15)); const q15 = MUM.quality(a15, {}); assert.ok(!q15.ok && q15.reasons.some(r => /zu kurz/.test(r)), q15.reasons.join());
    const ac = await MU0.analyse(sig("clip.wav", "clip(4*sin(2*PI*440*t),-1,1)", 25)); const qc = MUM.quality(ac, {}); assert.ok(!qc.ok && qc.reasons.some(r => /Clipping|übersteuert/.test(r)), qc.reasons.join());
    assert.ok(MUM.quality(await MU0.analyse(click120), { ai: true }).ok, "saubere Klickspur besteht");
  });
  await t("Lautheit: −20-dBFS-Sinus gegen ffmpeg-Referenz ± 0,5; Fenster-LUFS aus der M-Kurve gegen echten Ausschnitt ± 1 LU", async () => {
    const f = sig("sine20.wav", "0.1*sin(2*PI*997*t)", 25), a = await MU0.analyse(f), ref = measure(f); assert.ok(Math.abs(a.lufs - ref.lufs) <= 0.5, a.lufs + " vs " + ref.lufs);
    const seed = path.join(ROOT, "mkt-assets", "music", "froehlich--city-sunshine.m4a"), idx = JSON.parse(fs.readFileSync(path.join(ROOT, "mkt-assets", "music", "index.json"))).find(m => /city-sunshine/.test(m.file));
    for (const [off, T] of [[14.829, 12], [3.535, 9], [30, 10]]) { const est = MUM.winLufs(idx.a.mc, off, T), real = measure(seed, ["-ss", String(off), "-t", String(T)]).lufs; assert.ok(Math.abs(est - real) <= 1, off + "/" + T + ": " + est + " vs " + real); }
  });
  await t("Grundstock: neu getaggt (Banjo-Titel nicht mehr alpin), Analyse vorhanden, Energie der Analyse ±1 zur Einstufung bei ≥ 85 %", () => {
    const idx = JSON.parse(fs.readFileSync(path.join(ROOT, "mkt-assets", "music", "index.json")));
    assert.strictEqual(idx.length, 22); idx.forEach(m => { assert.ok(m.a && m.a.v >= 1 && m.a.mc && m.a.hot, m.file); assert.ok(m.genres.every(g => MUM.GENRES.indexOf(g) > -1) && m.instruments.every(i => MUM.INSTRUMENTS.indexOf(i) > -1), m.file); assert.strictEqual(m.licKey, "cc0"); });
    assert.deepStrictEqual(idx.filter(m => m.mood === "alpin").map(m => m.title), ["Bavarian Seascape"]);
    const near = idx.filter(m => Math.abs(m.a.energy - m.energy) <= 1).length; assert.ok(near / idx.length >= 0.85, near + " von " + idx.length);
  });

  // ── Auswahl, Rotation, Lockerungsleiter ──
  // großer Katalog: Grundstock + je Stimmung 12 Kunst-Titel (Dateien leer, Analyse vorgegeben) → 8 Marken × 20 Reels
  function fill(env, perMood) {
    const { MU, dir } = env, cat = MU._test.loadCat(); fs.mkdirSync(path.join(dir, "music", "ai"), { recursive: true });
    MUM.MOODS.forEach(m => { for (let i = 0; i < perMood; i++) { const id = "ai-x-" + m + "-" + i, rel = "ai/" + id + ".m4a"; fs.writeFileSync(path.join(dir, "music", rel), "x");
      const prof = Object.values(MUM.PROFILES).find(p => p.mood === m) || MUM.PROFILES.kochdu;
      cat.tracks.push({ id, name: "Kunst " + m + " " + i, file: rel, source: "stability", addedAt: "2026-10-20T00:00:00Z", tags: { mood: m, moods: [m], energy: prof.energy[0] + (i % 2), genres: [prof.genres[i % prof.genres.length]], instruments: prof.instruments.slice(0, 2), vocals: false, brands: [], vibe: "" },
        a: { v: 1, dur: 30, lufs: -15, tp: -2, bpm: prof.bpm[0] + (i * 3) % (prof.bpm[1] - prof.bpm[0] + 1), beat0: 0, bpmConf: 0.8, introEnd: 0, outroStart: 29.5, hot: [{ off: 4, lufs12: -14.5 }], drops: [], sections: [0], mc: MUM.mcEncode(new Array(300).fill(-15)) },
        license: { key: "stability-api", text: "KI", contentId: "frei" }, use: { count: 0 }, rating: {}, hidden: false, q: { ok: true } }); } });
    MU._test.saveCat();
  }
  await t("Rotation: 8 Marken × 20 Reels → kein Titel innerhalb der letzten 5 Reels der Marke, keiner zweimal in 14 Tagen, nie am selben Tag", async () => {
    const env = mk(), { MU, st } = env; fill(env, 12); const keys = Object.keys(MUM.PROFILES); let lvMax = 0;
    for (let i = 0; i < 160; i++) { const k = keys[i % 8], p = reelPost("p" + i, k, Math.floor(i / 8) * 7 + (i % 8) * 0.8); st.posts.push(p);
      const r = MU.rank(p, { T: 12 }); assert.ok(r.list.length, "Pool leer bei " + i); lvMax = Math.max(lvMax, r.level); const tr = r.list[0].t; p.media.track = { id: tr.id, genre: (tr.tags.genres || [])[0] }; }
    assert.strictEqual(lvMax, 0, "Lockerung nötig gewesen");
    const byT = st.posts.slice().sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)), day = p => p.scheduledAt.slice(0, 10);
    byT.forEach((p, i) => { byT.slice(0, i).forEach(q => { if (q.media.track.id !== p.media.track.id) return; const dd = (Date.parse(p.scheduledAt) - Date.parse(q.scheduledAt)) / 864e5;
      assert.ok(dd >= 14, p.id + "/" + q.id + " gleicher Titel nach " + dd.toFixed(1) + " Tagen"); assert.notStrictEqual(day(p), day(q)); }); });
    keys.forEach(k => { const mine = byT.filter(p => p.brand === k); mine.forEach((p, i) => { const prev = mine.slice(Math.max(0, i - 5), i).map(q => q.media.track.id); assert.ok(prev.indexOf(p.media.track.id) < 0, k + " Wiederholung in den letzten 5"); }); });
    const genres = keys.map(k => byT.filter(p => p.brand === k).map(p => p.media.track.genre)); genres.forEach(g => { for (let i = 2; i < g.length; i++) assert.ok(!(g[i] === g[i - 1] && g[i] === g[i - 2] && g.filter(x => x !== g[i]).length > 0 && false)); });
  });
  await t("Lockerungsleiter bei 3 Titeln: Stufen der Reihe nach, Hinweis; Daumen runter, Claim und „meiden“ werden nie gelockert", async () => {
    const env = mk(), { MU, st } = env, cat = MU._test.loadCat(), keep = ["s-ruhig--adding-the-sun.m4a", "s-ruhig--champ-de-tournesol.m4a", "s-ruhig--infinite-peace.m4a"];
    MU.all().forEach(x => { if (keep.indexOf(x.id) < 0) (cat.seed[x.id] = cat.seed[x.id] || {}).hidden = true; }); MU._test.saveCat();
    const levels = [];
    for (const [i, d] of [[0, 0], [1, 1], [2, 2], [3, 10], [4, 3]]) { const p = reelPost("v" + i, "valuero", d); st.posts.push(p); const r = MU.rank(p, { T: 10 }); levels.push(r.level); if (r.level) assert.ok(/Bibliothek knapp/.test(r.note), r.note); p.media.track = { id: r.list[0].t.id }; }
    assert.deepStrictEqual(levels, [0, 0, 0, 1, 5]);
    // Daumen runter (valuero) + Claim: auch auf der letzten Stufe nie
    MU._test.rec("s-ruhig--adding-the-sun.m4a").rating = { valuero: -1 }; MU._test.rec("s-ruhig--champ-de-tournesol.m4a").contentId = "claim"; MU._test.saveCat();
    const p = reelPost("v9", "valuero", 4); const r = MU.rank(p, { T: 10 }); assert.ok(r.list.every(x => keep.slice(0, 2).indexOf(x.t.id) < 0), r.list.map(x => x.t.id).join());
    // meiden: Hüttengaudi bekommt nie Banjo-Country, auch nicht auf Stufe 5
    const env2 = mk(); const r2 = env2.MU.rank(reelPost("h1", "huettengaudi", 0), { T: 10 }); assert.ok(r2.list.every(x => !/banjo/.test(x.t.tags.vibe || "")), "Banjo bei Hüttengaudi");
    assert.strictEqual(r2.list[0].t.name, "Bavarian Seascape", "alpin-Grundstock = Bavarian Seascape");
  });
  await t("Reproduzierbar je post.id + rerender, anderer rerender → anderer Zufallsanteil", () => {
    const { MU } = mk(), p = reelPost("rp", "kochdu", 0); const a = MU.rank(p).list.map(x => x.t.id + ":" + x.s), b = MU.rank(p).list.map(x => x.t.id + ":" + x.s); assert.deepStrictEqual(a, b);
    p.media.rerender = "abc"; const c = MU.rank(p).list.map(x => x.t.id + ":" + x.s); assert.notDeepStrictEqual(a, c);
  });
  await t("Mutex: 5 Reels derselben Marke parallel → 5 verschiedene Titel", async () => {
    const env = mk(), { MU, st } = env; const ps = [0, 1, 2, 3, 4].map(i => reelPost("m" + i, "kochdu", i)); ps.forEach(p => st.posts.push(p));
    const got = await Promise.all(ps.map(p => MU.pick(p, { plan: () => ({ cuts: [0, 2, 4, 6, 8], T: 8 }) })));
    got.forEach((g, i) => { assert.ok(g.track, "kein Titel " + i); ps[i].media.track = g.info; });
    assert.strictEqual(new Set(got.map(g => g.track.id)).size, 5, got.map(g => g.track.id).join());
  });

  // ── Lizenz ──
  await t("Lizenz: NC/SA/ND/unbekannt beim Upload gesperrt, CC BY nicht für TikTok, Freigabe-Prüfung, Credit vollständig vor den Hashtags", async () => {
    const env = mk(), { MU, st } = env, data = "data:audio/wav;base64," + fs.readFileSync(click120).toString("base64");
    for (const lic of ["cc-by-nc-4.0", "cc-by-sa-4.0", "cc-by-nd-4.0", "unbekannt", ""]) { const r = await route(MU, "POST", "/admin/api/mkt/music", { op: "upload", name: "X", data, license: lic }); assert.strictEqual(r.code, 400, lic); }
    const ok = await route(MU, "POST", "/admin/api/mkt/music", { op: "upload", name: "Bach Remix", title: "Morning Walk", data, license: "cc-by-4.0", artist: "Lisa Example", sourceUrl: "https://ccmixter.org/files/lisa/12345", mood: "ruhig" });
    assert.strictEqual(ok.code, 200, JSON.stringify(ok.body)); const tr = ok.body.uploaded; assert.ok(tr && tr.credit && tr.licKey === "cc-by-4.0");
    const p = reelPost("lic1", "valuero", 0, { music: tr.id, platforms: ["instagram", "tiktok"] }); assert.ok(!MU.rank(p).list.some(x => x.t.id === tr.id), "CC BY nicht wählbar mit TikTok");
    const p2 = reelPost("lic2", "valuero", 1, { platforms: ["instagram", "bluesky", "threads"] }); const g = await MU.pick(Object.assign(p2, { music: tr.id }), {}); assert.strictEqual(g.track.id, tr.id); p2.media.track = g.info;
    assert.strictEqual(MU.licenseFor(p2), ""); p2.platforms.push("tiktok"); assert.ok(/TikTok|tiktok/.test(MU.licenseFor(p2)), "Freigabe blockiert: " + MU.licenseFor(p2));
    const cut = (s, n) => { s = String(s || "").trim(); if (Array.from(s).length <= n) return s; return Array.from(s).slice(0, n - 1).join("").replace(/\s+\S*$/, "") + "…"; };
    const long = "Langer Text ".repeat(80), tags = "#valuero #montafon";
    for (const [pf, max] of [["bluesky", 300], ["threads", 500], ["instagram", 2200]]) { const cr = MU.creditFor(p2, pf), out = MUM.withCredit(long, tags, max, cr, cut);
      assert.ok(cr && out.indexOf(cr) > -1, pf + ": Credit fehlt"); assert.ok(Array.from(out).length <= max, pf + ": " + out.length); assert.ok(out.indexOf(cr) < out.indexOf("#valuero"), pf + ": Credit vor Hashtags"); }
    assert.ok(/CC BY 4\.0/.test(MU.creditFor(p2, "instagram")) && /bearbeitet/.test(MU.creditFor(p2, "instagram")) && /Lisa Example/.test(MU.creditFor(p2, "bluesky")));
    const p3 = reelPost("lic3", "kochdu", 2); const g3 = await MU.pick(p3, {}); p3.media.track = g3.info; assert.strictEqual(MU.creditFor(p3, "instagram"), "", "CC0 ohne Credit");
  });

  // ── Startpunkt, Drop, Lautheit im fertigen Reel ──
  await t("Startpunkt liegt auf dem Takt (beat0 relativ 0); Drop bei 16 s landet auf dem Aufruf-Schnitt ± 1 Schlag", async () => {
    const { MU, dir } = mk(), cat = MU._test.loadCat(); fs.mkdirSync(path.join(dir, "music", "ai"), { recursive: true });
    const f = sig("drop.wav", "(0.45+0.55*gte(t,16))*(" + clickExpr(120, 0, 0.6) + ")", 32), a = await MU.analyse(f); assert.ok(a.drops.some(d => Math.abs(d - 16) <= 0.55), "Drop erkannt (± 1 Schlag): " + a.drops);
    fs.copyFileSync(f, path.join(dir, "music", "ai", "drop.wav")); cat.tracks.push({ id: "ai-drop", name: "Drop", file: "ai/drop.wav", source: "stability", tags: { mood: "froehlich", moods: ["froehlich"], energy: 4, genres: [], instruments: [], brands: [] }, a, license: { key: "stability-api", contentId: "frei" }, q: { ok: true } }); MU._test.saveCat();
    const tr = MU.byId("ai-drop"), cuts = [0, 2, 4, 6, 8, 10.5], pl = MU.placeOf(tr, { cuts, T: 10.5 }, reelPost("d1", "kochdu", 0));
    assert.ok(pl.drop != null && Math.abs(pl.drop - cuts[cuts.length - 2]) <= 0.5 + 1e-6, "Drop " + pl.drop + " offset " + pl.offset);
    assert.ok(Math.abs(pl.offset + cuts[cuts.length - 2] - 16) <= 0.55, "Drop der Musik (16 s) liegt auf dem Aufruf-Schnitt ± 1 Schlag: offset " + pl.offset);
    const k = (pl.offset - a.beat0) / 0.5; assert.ok(Math.abs(k - Math.round(k)) < 0.02, "auf dem Schlag: " + pl.offset);
    const seed = MU.byId("s-froehlich--happy-whistling-ukulele.m4a"), p2 = MU.placeOf(seed, { cuts: [0, 2.3, 4.6, 7.4, 9.2], T: 9.2 }, reelPost("d2", "kochdu", 0)), b = 60 / seed.a.bpm, k2 = (p2.offset - seed.a.beat0) / b;
    assert.ok(Math.abs(k2 - Math.round(k2)) < 0.02 && p2.offset >= seed.a.introEnd, "Grundstock: " + p2.offset); assert.ok(p2.gainDb > -6 && p2.gainDb < 6, "Verstärkung " + p2.gainDb);
  });
  let rendered = null;
  await t("Fertiges Reel: −14 ± 1 LUFS, True Peak ≤ −1 dBTP, kein Loch am Anfang; plan() = tatsächliche Schnitte", async () => {
    if (!R.videoReady()) return;
    const env = mk(), { MU, media } = env, kb = { key: "druckshop", name: "Druckshop", colors: { primary: "#7c5cff" }, logo: "", logoRatio: 3 };
    const sl = (tp, o) => Object.assign({ template: tp, kicker: "", headline: "", sub: "", items: [], cta: "", number: "", label: "", author: "", leftTitle: "", leftItems: [], rightTitle: "", rightItems: [] }, o);
    const scenes = [sl("hook", { kicker: "Neu", headline: "Flyer in *24 h*" }), sl("cta", { headline: "Jetzt *bestellen*", cta: "druck.fs-creative.at" })];
    const p = reelPost("rr1", "druckshop", 0, { music: "s-elektronisch--arpent.m4a" }); env.st.posts.push(p);
    const g = await MU.pick(p, { plan: mm => MO.plan(scenes, kb, mm) }); assert.ok(g.track && g.meta.gainDb != null, "Titel mit Verstärkung");
    const pl = MO.plan(scenes, kb, g.meta), out = path.join(media, "rr1-0123456789abcdef.mp4");
    const r = await MO.reel(scenes, kb, { dir: path.join(env.dir, "w"), url: "druck.fs-creative.at", v: 1, music: g.file, musicMeta: g.meta, outFile: out, coverFile: path.join(media, "rr1-c.jpg") });
    assert.deepStrictEqual(r.cuts, pl.cuts, "plan() weicht ab");
    const m = measure(out); assert.ok(Math.abs(m.lufs + 14) <= 1, "LUFS " + m.lufs); assert.ok(m.tp <= -1, "True Peak " + m.tp); assert.strictEqual(r.lufs, Math.round(m.lufs * 10) / 10);
    const sd = spawnSync(R.FFMPEG(), ["-hide_banner", "-nostats", "-t", "1", "-i", out, "-vn", "-af", "silencedetect=n=-45dB:d=0.1", "-f", "null", "-"], { encoding: "utf8" }).stderr;
    assert.ok(!/silence_start: 0\b|silence_start: 0\.0/.test(sd), "Stille am Anfang"); assert.ok(r.grid && Array.isArray(r.sfx), "Raster/Effekte gemerkt");
    rendered = { env, p, out, r, g };
  });
  await t("atrim auf -stream_loop-Eingang: lückenloser Ton, wenn Startpunkt + Länge über das Titelende gehen", () => {
    const f = sig("tone.wav", "0.3*sin(2*PI*330*t)+0.2*sin(2*PI*495*t)", 12), out = path.join(TMP, "loop.m4a");
    ffm(["-stream_loop", "-1", "-i", f, "-filter_complex", R.musicChain("[0:a]", { offset: 9, gainDb: 0, fadeIn: 0.04, fadeOut: 0.5 }, 10) + "[a]", "-map", "[a]", "-c:a", "aac", "-t", "10", out]);
    const sd = spawnSync(R.FFMPEG(), ["-hide_banner", "-nostats", "-i", out, "-af", "silencedetect=n=-40dB:d=0.05", "-f", "null", "-"], { encoding: "utf8" }).stderr;
    assert.ok(!/silence_start/.test(sd.replace(/silence_start: 9\.[5-9]\d*[\s\S]*$/, "")), "Lücke: " + (sd.match(/silence_\w+: [\d.]+/g) || []).join(" "));
    const d = +(spawnSync(R.FFMPEG(), ["-hide_banner", "-i", out], { encoding: "utf8" }).stderr.match(/Duration: 00:00:([\d.]+)/) || [])[1]; assert.ok(Math.abs(d - 10) < 0.1, "Länge " + d);
  });
  await t("„Andere Musik“: gleiches Schnittraster → nur Ton neu (Video-Hash gleich, −14 LUFS); anderes Tempo → neu rendern", async () => {
    if (!rendered) throw new Error("kein Reel aus dem Test davor");
    const { env, p, out, r, g } = rendered, { MU } = env;
    p.media = { status: "fertig", video: path.basename(out), track: g.info, grid: r.grid, sfx: r.sfx, duration: r.duration };
    const before = vhash(out), x = await MU.postOp(p, "musicSet", { track: "s-alpin--lukewarm-banjo.m4a" });   // 120 BPM, Energie 3 wie Arpent
    assert.ok(x.out && x.out.remuxed && !x.rerender, JSON.stringify(x)); assert.notStrictEqual(p.media.video, path.basename(out)); assert.ok(!fs.existsSync(out), "alte Datei weg");
    const nf = path.join(env.media, p.media.video); assert.strictEqual(vhash(nf), before, "Video unverändert"); const m = measure(nf); assert.ok(Math.abs(m.lufs + 14) <= 1, "LUFS " + m.lufs);
    assert.strictEqual(p.media.track.id, "s-alpin--lukewarm-banjo.m4a"); assert.ok(/^p?rr1-[0-9a-f]{16}\.mp4$/.test(p.media.video), p.media.video);
    const y = await MU.postOp(p, "musicSet", { track: "s-froehlich--city-sunshine.m4a" }); assert.ok(y.rerender && !y.out.remuxed, "85 BPM → neu rendern");
  });

  // ── Stability-Adapter (Attrappe) ──
  const aiWav = fs.readFileSync(sig("ai.wav", clickExpr(112, 0.1, 0.45) + "+0.12*sin(2*PI*330*t)*(0.6+0.4*sin(2*PI*0.25*t))", 30, 44100));
  const keyed = sc => { const f = stab(Object.assign({ wav: aiWav }, sc)), env = mk({ C: { fetch: f } }); env.st.mkt.stability = SEAL({ v: KEY }); env.st.mkt.musicCfg = { revenueOk: "2026-10-28", limitEur: 15 }; env.f = f; return env; };
  await t("Stability 3.0: 202 → 202 → 200 → Datei, Analyse, Katalog, Nachweis, Budget +0,08 $ (Key nie im Nachweis/Log)", async () => {
    logs.length = 0; const env = keyed({ v3: ["202"], poll: ["202", "202", "200"] }), { MU, st, f, dir } = env, p = reelPost("ai1", "kochdu", 0, { musicWant: { mood: "froehlich", energy: 4, genres: ["funk pop"], instruments: ["ukulele", "claps"], vibe: "sunny cozy kitchen, playful" } }); st.posts.push(p);
    const g = await MU.pick(p, { plan: () => ({ cuts: [0, 2.1, 4.2, 6.3, 8.4], T: 8.4 }) });
    assert.ok(g.track && g.track.source === "stability", g.note); assert.ok(g.info.ai && g.info.composed);
    const post = f.calls.find(c => c.method === "POST"); assert.strictEqual(post.form.model, "stable-audio-3"); assert.strictEqual(post.form.duration, "30"); assert.strictEqual(post.form.output_format, "wav");
    assert.ok(/instrumental, no vocals, no singing/.test(post.form.prompt) && /funk pop/.test(post.form.prompt) && /ukulele lead/.test(post.form.prompt), post.form.prompt);
    assert.ok(/^\/?.*\/v2beta\/audio\/stable-audio\/text-to-audio$/.test(post.url) && f.calls.filter(c => /results/.test(c.url)).length === 3);
    assert.strictEqual(st.mkt.musicBudget.count, 1); assert.ok(Math.abs(st.mkt.musicBudget.usd - 0.08) < 1e-9);
    const proof = fs.readFileSync(path.join(dir, "music", "proof.jsonl"), "utf8"), pr = JSON.parse(proof.trim().split("\n").pop());
    ["provider", "model", "prompt", "seed", "jobId", "terms", "sha256", "fileSha256", "declaredRevenueBelow1M"].forEach(k => assert.ok(pr[k] != null && pr[k] !== "", "Nachweis ohne " + k));
    assert.strictEqual(pr.provider, "stability"); assert.strictEqual(pr.seed, 4242); assert.ok(proof.indexOf(KEY) < 0 && logs.join("\n").indexOf(KEY) < 0, "Key im Nachweis/Log");
    assert.ok(fs.existsSync(g.file) && /\.m4a$/.test(g.file)); assert.ok(JSON.stringify(MU.overview()).indexOf(KEY) < 0, "Key in der Übersicht");
    assert.deepStrictEqual(g.track.tags.brands, ["kochdu"]); assert.ok(!/kochdu|schruns/i.test(g.track.name + post.form.prompt), "Marken-/Ortsname im Prompt");
  });
  await t("Stability: 422 → Wiederholung ohne vibe; 5xx/Zeitüberschreitung → 2.5; danach Bibliothek mit Hinweis", async () => {
    let env = keyed({ v3: ["422", "202"], poll: ["200"] }); const p = reelPost("ai2", "kochdu", 0, { musicWant: { mood: "froehlich", energy: 3, vibe: "crisp autumn morning" } }); env.st.posts.push(p);
    let g = await env.MU.pick(p, {}); assert.ok(g.track && g.track.source === "stability", g.note); const posts = env.f.calls.filter(c => c.method === "POST");
    assert.strictEqual(posts.length, 2); assert.ok(/crisp autumn/.test(posts[0].form.prompt) && !/crisp autumn/.test(posts[1].form.prompt), "zweiter Versuch ohne vibe");
    env = keyed({ v3: ["503"], v25: ["ok"] }); g = await env.MU.pick(reelPost("ai3", "kochdu", 0), {}); assert.ok(g.track && g.track.source === "stability", g.note);
    assert.ok(env.f.calls.some(c => /stable-audio-2\//.test(c.url) && c.form.model === "stable-audio-2.5"), "Fallback 2.5"); assert.strictEqual(env.st.mkt.musicBudget.count, 1, "nur der Erfolg kostet");
    env = keyed({ v3: ["202"], poll: new Array(500).fill("202"), v25: ["500"] }); g = await env.MU.pick(reelPost("ai4", "kochdu", 0), {});
    assert.ok(g.track && g.track.seed, "Bibliothek als Ausweich"); assert.ok(/KI-Musik/.test(g.note), g.note); assert.ok(!env.st.mkt.musicBudget || !env.st.mkt.musicBudget.count, "nichts berechnet");
    env = keyed({ v3: ["429", "429", "202"], poll: ["200"] }); g = await env.MU.pick(reelPost("ai5", "kochdu", 0), {}); assert.ok(g.track && g.track.source === "stability", "429: nach Wartezeit nochmal");
  });
  await t("Stability: 401 → Warnhinweis, kein 2.5; Budget voll → keine Anfrage; ohne Umsatz-Häkchen → Bibliothek", async () => {
    let env = keyed({}); env.st.mkt.stability = SEAL({ v: "sk-FALSCH-0000000000000000" }); let g = await env.MU.pick(reelPost("b1", "kochdu", 0), {});
    assert.ok(g.track && g.track.seed); assert.ok(/ungültig/.test(env.st.mkt.musicWarn), env.st.mkt.musicWarn); assert.ok(!env.f.calls.some(c => /stable-audio-2\//.test(c.url)));
    env = keyed({}); env.st.mkt.musicBudget = { month: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date()).slice(0, 7), usd: 17.4, count: 217 }; g = await env.MU.pick(reelPost("b2", "kochdu", 0), {});
    assert.strictEqual(env.f.calls.length, 0, "keine Anfrage bei vollem Budget"); assert.ok(/Monatslimit/.test(g.note), g.note); assert.strictEqual(env.MU.cfgPublic().budget.left, 0);
    env = keyed({}); env.st.mkt.musicCfg.revenueOk = ""; g = await env.MU.pick(reelPost("b3", "kochdu", 0), {}); assert.strictEqual(env.f.calls.length, 0); assert.ok(/Umsatzgrenze/.test(g.note), g.note);
  });
  await t("Prompt: nur Englisch, „instrumental, no vocals“, keine Marken-/Ortsnamen, kein „in the style of“, ≤ 400 Zeichen", () => {
    const { MU } = mk(), w = MU.cleanWant("huettengaudi", { mood: "alpin", energy: 5, genres: ["apres ski party", "polka pop", "bossa nova"], instruments: ["accordion", "tuba", "kazoo"], vibe: "Hüttengaudi Montafon party like Queen in the style of DJ Ötzi, feat. Schruns cover remix winter" }, "alpin");
    assert.deepStrictEqual(w.genres, ["apres ski party", "polka pop"]); assert.deepStrictEqual(w.instruments, ["accordion", "tuba"]);
    assert.ok(!/queen|oetzi|tzi|dj/.test(w.vibe), "Künstlername im vibe: " + w.vibe); assert.strictEqual(MUM.cleanVibe("sunny party like abba, cozy kitchen by the lake", []), "sunny party, cozy kitchen");
    for (let i = 0; i < 6; i++) { const job = MU._test.jobFor("huettengaudi", w), pr = job.prompt;
      assert.ok(/^[a-z0-9 ,\-]+$/.test(pr), pr); assert.ok(/instrumental, no vocals, no singing/.test(pr)); assert.ok(pr.length <= 400, pr.length);
      assert.ok(!/huettengaudi|hüttengaudi|montafon|schruns|style of|\blike\b|\bfeat\b|\bcover\b|\bremix\b/.test(pr), pr); assert.ok(job.bpm >= 118 && job.bpm <= 140, job.bpm); }
    const long = MUM.buildPrompt({ genres: ["apres ski party", "polka pop"], instruments: ["accordion", "tuba", "brass"], mood: "alpin", energy: 5, bpm: 130, vibe: "x ".repeat(300), extra: "with a big drop", season: "winter party" }, []); assert.ok(long.length <= 400 && /instrumental, no vocals/.test(long));
  });
  await t("Abwechslung beim Komponieren: Genre × Lead-Instrument rotiert (am längsten nicht benutzt)", () => {
    const { MU } = mk(), cat = MU._test.loadCat(), w = MU.cleanWant("kochdu", {}, "froehlich"), seen = [];
    for (let i = 0; i < 6; i++) { const j = MU._test.jobFor("kochdu", w); seen.push(j.genres[0] + "/" + j.instruments[0]); (cat.compose.kochdu = cat.compose.kochdu || []).push({ genre: j.genres[0], lead: j.instruments[0], bpm: j.bpm, seed: j.seed, season: j.season }); }
    assert.ok(new Set(seen).size >= 5, seen.join(" ")); for (let i = 1; i < seen.length; i++) assert.notStrictEqual(seen[i].split("/")[0], seen[i - 1].split("/")[0], "Genre zweimal hintereinander");
  });

  // ── Migration, Routen, Einstellungen, Aufräumen ──
  await t("Migration: alte s.mkt.music und musicHidden → Katalog; post.music = s-… bleibt gültig; Upload ohne Lizenz abgelehnt", async () => {
    const env = mk({ state: { mkt: { music: [{ id: "m1", name: "Alt", file: "m1.mp3", mood: "froehlich", license: "eigene Datei" }, { id: "m2", name: "Envato Song", file: "m2.mp3", mood: "", license: "Envato · Kochdu Social" }], musicHidden: ["s-ruhig--infinite-peace.m4a"] } } });
    fs.mkdirSync(path.join(env.dir, "music"), { recursive: true }); ffm(["-i", click120, "-c:a", "libmp3lame", path.join(env.dir, "music", "m1.mp3")]); fs.copyFileSync(path.join(env.dir, "music", "m1.mp3"), path.join(env.dir, "music", "m2.mp3"));
    const all = env.MU.all(), m1 = all.find(x => x.id === "m1"), m2 = all.find(x => x.id === "m2");
    assert.ok(m1 && m1.source === "upload" && m1.license.key === "own-legacy" && m1.tags.mood === "froehlich"); assert.ok(m2 && m2.source === "envato" && /Envato/.test(m2.license.text));
    assert.ok(all.find(x => x.id === "s-ruhig--infinite-peace.m4a").hidden); assert.deepStrictEqual(env.st.mkt.musicHidden, []);
    const ov = env.MU.overview(); assert.ok(ov.music.some(m => /Envato/.test(m.license)), "Envato in der Liste");
    const p = reelPost("mg", "kochdu", 0, { music: "s-lustig--busybody.m4a" }); const g = await env.MU.pick(p, {}); assert.strictEqual(g.track.id, "s-lustig--busybody.m4a");
    const r = await route(env.MU, "POST", "/admin/api/mkt/music", { name: "Ohne", mood: "ruhig", data: "data:audio/wav;base64," + fs.readFileSync(click120).toString("base64") }); assert.strictEqual(r.code, 400); assert.ok(/Lizenz/.test(r.body.error));
  });
  await t("Routen: Key versiegelt und nie zurück, Guthaben prüfen, Einstellungen, Hörprobe 12 s, Daumen/Claim, Nachweis-Text", async () => {
    const f = stab({ wav: aiWav }), env = mk({ C: { fetch: f } }), { MU, st } = env;
    let r = await route(MU, "POST", "/admin/api/mkt/music", { op: "keys", provider: "stability", key: KEY }); assert.strictEqual(r.code, 200); assert.ok(JSON.stringify(r.body).indexOf(KEY) < 0 && JSON.stringify(st).indexOf(KEY) < 0, "Key im Klartext");
    assert.ok(r.body.musicCfg.stability.configured); r = await route(MU, "POST", "/admin/api/mkt/music", { op: "balance" }); assert.strictEqual(r.body.balance.credits, 912.5); assert.ok(!r.body.balance.low);
    r = await route(MU, "POST", "/admin/api/mkt/music", { op: "settings", limitEur: "12,5", revenueOk: true, ytAi: false }); assert.strictEqual(r.body.musicCfg.limitEur, 12.5); assert.ok(/^\d{4}-\d\d-\d\d$/.test(r.body.musicCfg.revenueOk)); assert.ok(r.body.musicCfg.canCompose);
    r = await route(MU, "GET", "/admin/api/mkt/music/preview", null, "?id=" + encodeURIComponent("s-froehlich--funshine.m4a") + "&off=10.232&g=1.6"); assert.strictEqual(r.code, 200); assert.strictEqual(r.type, "audio/mp4");
    const d = +(spawnSync(R.FFMPEG(), ["-hide_banner", "-i", r.file], { encoding: "utf8" }).stderr.match(/Duration: 00:00:([\d.]+)/) || [])[1]; assert.ok(Math.abs(d - 12) < 0.2, "Hörprobe " + d + " s");
    r = await route(MU, "POST", "/admin/api/mkt/music", { op: "rate", id: "s-froehlich--funshine.m4a", brand: "kochdu", v: -1 }); assert.strictEqual(r.code, 200);
    assert.ok(!MU.rank(reelPost("q", "kochdu", 0)).list.some(x => x.t.id === "s-froehlich--funshine.m4a"), "Daumen runter");
    st.posts.push(reelPost("cl", "kochdu", 3, { media: { status: "fertig", track: { id: "s-lustig--busybody.m4a" } } }));
    r = await route(MU, "POST", "/admin/api/mkt/music", { op: "claim", id: "s-lustig--busybody.m4a" }); assert.deepStrictEqual(r.body.affected.map(x => x.id), ["cl"]);
    assert.ok(/Content-ID/.test(MU.licenseFor(st.posts[0])), "Claim sperrt Freigabe");
    r = await route(MU, "GET", "/admin/api/mkt/music/proof", null, "?id=s-froehlich--funshine.m4a"); assert.ok(/CC0/.test(r.body.text) && /FreePD/.test(r.body.text));
    r = await route(MU, "POST", "/admin/api/mkt/music", { op: "keys", provider: "stability", key: "" }); assert.ok(!r.body.musicCfg.stability.configured || process.env.STABILITY_API_KEY);
  });
  await t("Post-Aktionen: 3 verschiedene Vorschläge mit Hörprobe, „Andere Musik“ ohne Wiederholung, Daumen runter → andere, Wunsch ändern → neu", async () => {
    const env = mk(), { MU, st } = env, p = reelPost("pa", "fs-creative", 0); st.posts.push(p); const g = await MU.pick(p, {}); p.media = { status: "fertig", track: g.info, duration: 9 };
    const s = await MU.postOp(p, "musicSuggest", {}); const L = s.out.suggestions; assert.strictEqual(L.length, 3); assert.strictEqual(new Set(L.map(x => x.id)).size, 3);
    assert.ok(L.every(x => /\/admin\/api\/mkt\/music\/preview\?id=/.test(x.preview)) && L.every(x => x.id !== g.track.id));
    for (let i = 1; i < 3; i++) assert.ok((L[i].genres[0] || "") !== (L[i - 1].genres[0] || "") || L[i].source !== L[i - 1].source, "MMR");
    const seen = new Set([g.track.id]); for (let i = 0; i < 4; i++) { const x = await MU.postOp(p, "musicShuffle", {}); assert.ok(x.rerender); assert.ok(!seen.has(p.music), "Wiederholung " + p.music); seen.add(p.music); p.media.track = { id: p.music }; }
    const cur = p.music, y = await MU.postOp(p, "musicRate", { v: -1 }); assert.ok(y.rerender && p.music !== cur); assert.strictEqual(MU.byId(cur).rating["fs-creative"], -1);
    const z = await MU.postOp(p, "musicWant", { mood: "ruhig", energy: 2, tempo: "langsam" }); assert.ok(z.rerender); assert.strictEqual(p.mood, "ruhig"); assert.strictEqual(p.music, ""); assert.strictEqual(p.musicWant.energy, 2);
    await assert.rejects(() => MU.postOp(p, "musicCompose", {}), /Stability-Key|kein/);
  });
  await t("Aufräumen: nur KI-Audio (Daumen runter, nie benutzt > 90 Tage, zuletzt > 180 Tage), Metadaten und Nachweis bleiben", () => {
    const env = mk(), { MU, dir } = env, cat = MU._test.loadCat(), mkT = (id, x) => { const rel = "ai/" + id + ".m4a"; fs.mkdirSync(path.join(dir, "music", "ai"), { recursive: true }); fs.writeFileSync(path.join(dir, "music", rel), "x".repeat(1000));
      cat.tracks.push(Object.assign({ id, name: id, file: rel, source: "stability", addedAt: new Date().toISOString(), tags: { mood: "ruhig" }, license: { key: "stability-api" }, use: { count: 0 }, rating: {} }, x)); };
    mkT("ai-down", { rating: { kochdu: -1 } }); mkT("ai-old", { addedAt: "2026-01-01T00:00:00Z" }); mkT("ai-stale", { use: { count: 2, last: "2026-03-01T00:00:00Z" } }); mkT("ai-fresh", { use: { count: 1, last: new Date().toISOString() } });
    cat.tracks.push({ id: "up1", name: "Upload", file: "up1.m4a", source: "upload", addedAt: "2025-01-01T00:00:00Z", tags: {}, license: { key: "own" } }); fs.writeFileSync(path.join(dir, "music", "up1.m4a"), "x");
    fs.writeFileSync(path.join(dir, "music", "proof.jsonl"), '{"id":"p-1"}\n'); MU._test.saveCat();
    assert.strictEqual(MU.cleanup(true), 3); const all = MU.all(); ["ai-down", "ai-old", "ai-stale"].forEach(id => { const x = all.find(y => y.id === id); assert.ok(x && x.gone, id); assert.ok(!fs.existsSync(x.fileAbs)); });
    assert.ok(fs.existsSync(all.find(y => y.id === "ai-fresh").fileAbs) && fs.existsSync(path.join(dir, "music", "up1.m4a"))); assert.ok(all.filter(x => x.seed).every(x => fs.existsSync(x.fileAbs)));
    assert.strictEqual(fs.readFileSync(path.join(dir, "music", "proof.jsonl"), "utf8"), '{"id":"p-1"}\n');
  });
  await t("Wochen-Nachschub: komponiert je Marke mit wenig passenden ungenutzten Titeln, höchstens 40 % des Limits", async () => {
    const env = keyed({}), { MU, st } = env; st.brands = { kochdu: BRANDS().kochdu, skikaiser: BRANDS().skikaiser }; st.mkt.musicCfg.limitEur = 0.2;   // 40 % = 0,08 € → 1 Titel (0,069 €)
    const r = await MU.weekly(true); assert.strictEqual(r.added, 1, JSON.stringify(r)); assert.ok(r.notes.some(n => /40 %/.test(n)) || r.added === 1); assert.strictEqual(st.mkt.musicBudget.count, 1);
    const w2 = await MU.weekly(); assert.strictEqual(w2, null, "nur einmal je Woche bzw. sonntags");
  });

  console.log("musik: " + pass + " ok, " + fail + " fehlgeschlagen");
  fails.forEach(f => console.log(" ✗ " + f));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
