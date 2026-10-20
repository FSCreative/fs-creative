"use strict";
// Bewegte Reels (mkt-motion.js): Einheiten/Wörter/Markierungen im Layout, Zeitplan, Zahlen hochzählen, Schnitte im Takt, fertiges Video mit Ton.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const R = require(path.join(ROOT, "mkt-render.js")), MO = require(path.join(ROOT, "mkt-motion.js"))(R), T = MO._test;
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + ": " + (e && e.message)); } }
const sl = (tp, o) => Object.assign({ template: tp, kicker: "", headline: "", sub: "", items: [], cta: "", number: "", label: "", author: "", leftTitle: "", leftItems: [], rightTitle: "", rightItems: [] }, o);
const kochdu = { key: "kochdu", name: "kochdu", colors: { primary: "#6645ef" }, logo: "", logoRatio: 1 };

(async () => {
  const P = MO.profile("kochdu"), tree = () => R.postEl(sl("list", { kicker: "So einfach", headline: "In *3 Schritten* satt", items: ["Wirt wählen", "Bestellen", "Genießen"] }), kochdu, { format: "story", variant: "brand", layer: "fg", anim: true, v: 1 });
  await t("Layout: Zeilen, Wörter und Markierung werden erkannt", () => {
    const pp = T.prepare(tree(), P, 0.25);
    assert.ok(pp.units.length >= 5, "Einheiten " + pp.units.length);
    const head = pp.units.find(u => u.words.length >= 3); assert.ok(head, "Überschrift mit Wörtern");
    assert.strictEqual(pp.units.reduce((a, u) => a + u.hls.length, 0), 1, "eine Markierung");
    assert.ok(pp.end > 0.5 && pp.end < 4, "Dauer " + pp.end);
  });
  await t("Zeitplan: Listenpunkte liegen auf halben Taktschlägen, Wörter nacheinander", () => {
    const pp = T.prepare(tree(), P, 0.25), blocks = pp.units.filter((u, i) => i > 0 && !u.words.length);
    blocks.forEach(u => assert.ok(Math.abs(u.t0 / 0.25 - Math.round(u.t0 / 0.25)) < 1e-6, "Raster " + u.t0));
    const w = pp.units.find(u => u.words.length >= 3).words; for (let i = 1; i < w.length; i++) assert.ok(w[i].t0 > w[i - 1].t0);
  });
  await t("Zustand: vor dem Start unsichtbar, am Ende wie das Standbild", async () => {
    const pp = T.prepare(tree(), P, 0.25);
    T.setState(pp, P, -0.1); assert.ok(pp.units.every(u => u.words.length ? u.words.every(w => w.node.props.style.opacity === 0) : u.node.props.style.opacity === 0), "alles aus");
    T.setState(pp, P, pp.end + 0.1); assert.ok(pp.units.every(u => u.words.length ? u.words.every(w => w.node.props.style.opacity == null && !w.node.props.style.transform) : u.node.props.style.opacity == null), "alles da, ohne Transform");
    const a = await R.rawFrame(pp.root, 1080, 1920); assert.strictEqual(a.length, 1080 * 1920 * 4);
    const still = await R.rawFrame(R.postEl(sl("list", { kicker: "So einfach", headline: "In *3 Schritten* satt", items: ["Wirt wählen", "Bestellen", "Genießen"] }), kochdu, { format: "story", variant: "brand", layer: "fg", v: 1 }), 1080, 1920);
    let diff = 0; for (let i = 0; i < a.length; i += 97) diff += Math.abs(a[i] - still[i]); assert.ok(diff / (a.length / 97) < 1, "Endbild = Standbild (" + diff + ")");
  });
  await t("Merker stören satori nicht (Standbild mit __u/__w rendert)", async () => { const b = await R.png(tree(), 1080, 1920); assert.ok(b.length > 1000); });
  await t("Zahlen zählen im Format hoch (Tausenderpunkt, Komma, Einheit)", () => {
    assert.strictEqual(T.countFmt("1.250", 0.5), "625"); assert.strictEqual(T.countFmt("1.250", 1), "1.250"); assert.strictEqual(T.countFmt("14,90 €", 0.5), "7,45 €"); assert.strictEqual(T.countFmt("150", 0), "0");
  });
  await t("Schnitte im Takt: 120 BPM → ganze Sekunden, 85 BPM → Schlagraster ab beat0", () => {
    const g = T.beatGrid({ bpm: 120, beat0: 0 }), c = T.cuts([2.4, 3.2, 2.1], g); c.slice(1).forEach(x => assert.ok(Math.abs(x - Math.round(x)) < 1e-6, String(c)));
    const g2 = T.beatGrid({ bpm: 85, beat0: 0.711 }), c2 = T.cuts([2.4, 3.2], g2); c2.slice(1).forEach(x => { const k = (x - 0.711) / g2.cut; assert.ok(Math.abs(k - Math.round(k)) < 1e-3, String(c2)); });
    assert.ok(!T.beatGrid(null).synced);
  });
  await t("Scramble endet im echten Wort", () => { assert.strictEqual(T.scramble("Website", 1, 3), "Website"); assert.notStrictEqual(T.scramble("Website", 0.2, 3), "Website"); });
  await t("Reel: Video mit Ton, Länge ≥ 7,5 s auf dem Takt, Titelbild", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "motion-")), music = path.join(ROOT, "mkt-assets", "music", "froehlich--city-sunshine.m4a");
    const r = await MO.reel([sl("hook", { kicker: "Hunger?", headline: "Heute *kochst du nicht*" }), sl("cta", { headline: "Bestell bei *kochdu*", cta: "Jetzt bestellen" })], kochdu,
      { dir, url: "kochdu.at", v: 2, music, musicMeta: { bpm: 85, beat0: 0.711 }, outFile: path.join(dir, "r.mp4"), coverFile: path.join(dir, "c.jpg") });
    assert.ok(fs.existsSync(r.file) && fs.existsSync(r.cover)); assert.ok(r.duration >= 7.5, "Dauer " + r.duration); assert.ok(r.synced);
    const out = (() => { try { execFileSync(R.FFMPEG(), ["-hide_banner", "-i", r.file], { stdio: ["ignore", "pipe", "pipe"] }); return ""; } catch (e) { return String(e.stderr || ""); } })();   // ohne Ausgabedatei: Info auf stderr
    assert.ok(/Video: h264/.test(out) && /1080x1920/.test(out), "h264 1080x1920"); assert.ok(/Audio: aac/.test(out), "Ton");
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  });
  console.log("motion: " + pass + " ok, " + fail + " fehlgeschlagen");
  fails.forEach(f => console.log(" ✗ " + f));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
