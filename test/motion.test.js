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
  await t("Scramble endet im echten Wort, Emojis bleiben ganz", () => { assert.strictEqual(T.scramble("Website", 1, 3), "Website"); assert.notStrictEqual(T.scramble("Website", 0.2, 3), "Website"); assert.ok(T.scramble("Pizza🍕", 0.1, 2).endsWith("🍕")); });

  // ── Zittern (Reel „die Schrift kommt nicht flüssig“) ──
  const centroid = (px, W, x0, y0, x1, y1) => { let s = 0, sx = 0, sy = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const a = px[(y * W + x) * 4 + 3]; s += a; sx += a * x; sy += a * y; } return [sx / s, sy / s]; };
  await t("satori: exakte Matrix (sonst springt skalierter Text je Bild um mehrere Pixel)", async () => {
    assert.ok(R.satoriExact(), "satori mit genauer Matrix geladen (Stelle in satori geändert?)");
    const svg = await R.svgOf(R.h("div", { width: 400, height: 200 }, R.h("div", { transform: "scale(1.0055)", fontFamily: "Outfit", fontWeight: 800, fontSize: 92 }, "satt")), 400, 200);
    assert.ok(/matrix\(1\.0055,/.test(svg), svg.match(/matrix\([^)]*\)/));
  });
  await t("Einfliegen: winzige Größenänderung verschiebt das Wort nicht (stetig)", async () => {
    const pp = T.prepare(tree(), P, 0.25); T.setState(pp, P, 99);
    const w = pp.units.find(u => u.words.length >= 3).words.slice(-1)[0], st0 = w.node.props.style, c = [];
    w.node.props.style = Object.assign({}, st0, { opacity: 0 }); const base = await R.rawFrame(pp.root, 1080, 1920);   // Bild ohne das Wort → Differenz = nur das Wort
    for (const s of ["1.0050", "1.0055"]) {
      w.node.props.style = Object.assign({}, st0, { transform: "scale(" + s + ")" }); const px = await R.rawFrame(pp.root, 1080, 1920), d = Buffer.alloc(px.length);
      for (let i = 3; i < px.length; i += 4) d[i] = Math.abs(px[i] - base[i]); c.push(centroid(d, 1080, 0, 0, 1080, 1920));
    }
    w.node.props.style = st0;
    const d = Math.hypot(c[0][0] - c[1][0], c[0][1] - c[1][1]); assert.ok(d < 0.3, "Sprung " + d.toFixed(2) + " px (ohne Fix ~10 px)");
  });
  await t("Ebenen: Hintergrund + stehender Vordergrund = Standbild, Karten/Logo nur vorne", async () => {
    const photo = "data:image/jpeg;base64," + fs.readFileSync(path.join(ROOT, "mkt-assets", "kochdu", "essen-2.jpg")).toString("base64");
    const logo = "data:image/png;base64," + fs.readFileSync(path.join(ROOT, "kochdu-logo.png")).toString("base64"), kb = Object.assign({}, kochdu, { logo, logoRatio: 3.2 });
    const cases = [["hook", { image: photo }, 0, false], ["hook", {}, 1, true], ["list", { items: ["Eins", "Zwei"] }, 1, false], ["quote", { author: "Lisa" }, 2, false], ["stat", { number: "1.250", label: "Bestellungen" }, 0, false]];
    for (const [tp, extra, v, cover] of cases) {
      const s = sl(tp, Object.assign({ kicker: "Neu", headline: "Heute *kochst du nicht*" }, extra)), base = { format: "reel", variant: v % 2 ? "dark" : "brand", url: "kochdu.at", v, cover };
      const F = R.fmtFor(base, kb), W = 270;
      const bg = await R.rawFrame(T.bgLayer(R.postEl(s, kb, Object.assign({}, base, { layer: "bg", anim: true })), logo), F.w, F.h, W);
      const fg = await R.rawFrame(T.fgLayer(R.postEl(s, kb, Object.assign({}, base, { layer: "fg", anim: true })), logo, true), F.w, F.h, W);
      const all = await R.rawFrame(R.postEl(s, kb, Object.assign({}, base, { layer: "all" })), F.w, F.h, W);
      let d = 0; for (let i = 0; i < all.length; i += 4) { const a = fg[i + 3] / 255; for (let c = 0; c < 3; c++) d += Math.abs(fg[i + c] + bg[i + c] * (1 - a) - all[i + c]); }
      assert.ok(d / (all.length * 0.75) < 0.5, tp + v + ": Abweichung " + (d / (all.length * 0.75)).toFixed(2));
      if (tp === "quote") { const H = Math.round(F.h * W / F.w), i = (Math.round(H / 2) * W + W / 2) * 4; assert.ok(!(bg[i] >= 250 && bg[i + 1] >= 250 && bg[i + 2] >= 250), "weiße Karte gehört nicht in den Hintergrund"); }
    }
  });
  await t("Zähler: jede Stelle im Fach ihrer Endziffer – Zahl steht beim Hochzählen (linke Kante fix)", async () => {
    const pp = T.prepare(R.postEl(sl("stat", { kicker: "Montafon", number: "1.250", label: "Bestellungen" }), kochdu, { format: "story", variant: "brand", layer: "fg", anim: true, v: 1 }), P, 0.25), n = pp.nums[0];
    assert.ok(n, "Zahl erkannt"); const lefts = new Set();
    for (let f = 0; f < 10; f++) {
      T.setState(pp, P, n.t0 + P.du + 0.05 + f / 30); pp.units.forEach(u => { if (u !== n.u) u.node.props.style = Object.assign({}, u.node.props.style, { opacity: 0 }); });
      const px = await R.rawFrame(pp.root, 1080, 1920); let x0 = 1e9; for (let i = 3; i < px.length; i += 4) if (px[i] > 128) x0 = Math.min(x0, ((i - 3) / 4) % 1080); lefts.add(x0);
    }
    assert.strictEqual(lefts.size, 1, "linke Kante wandert: " + [...lefts].join(","));
  });
  await t("Zähler: Vorzeichen/Währung bleibt in seinem Fach („+33%“ → „+“ vorne, Ziffern rechtsbündig)", () => {
    const slots = el => { const o = []; (function f(n) { if (!n || typeof n !== "object") return; if (Array.isArray(n)) return n.forEach(f); const k = n.props && n.props.children; if (n.props && n.props.style && n.props.style.position === "relative") { o.push((k[1] && k[1].props.children) || ""); return; } f(k); })(el); return o.join("|"); };
    assert.strictEqual(slots(T.counter("+240%", "+33%", 0, "center")), "+||3|3|%");
    assert.strictEqual(slots(T.counter("€1.250", "€12", 0, "center")), "€||||1|2");
    assert.strictEqual(slots(T.counter("1.250", "999", 0, "center")), "||9|9|9");
  });
  await t("Scramble: die anderen Wörter bleiben stehen (kein Umbruch-Springen)", async () => {
    const PD = MO.profile("druckshop"), db = { key: "druckshop", name: "Druckshop", colors: { primary: "#7c5cff" }, logo: "", logoRatio: 3 };
    const pp = T.prepare(R.postEl(sl("hook", { kicker: "Neu", headline: "Visitenkarten *in 24 Stunden* gedruckt und geliefert" }), db, { format: "reel", variant: "brand", url: "x.at", v: 1, layer: "fg", anim: true }), PD, 0.25);
    T.setState(pp, PD, 99); const F = R.fmtFor({ format: "reel" }, db), fin = await R.rawFrame(pp.root, F.w, F.h, 540);
    const w = pp.units.find(u => u.words.length >= 4).words[0];
    w.txt.forEach((x, i) => { x.node.props.children = T.steady(x.s, "WWWWWWWWWW".slice(0, x.s.length)); });
    const px = await R.rawFrame(pp.root, F.w, F.h, 540); w.txt.forEach(x => { x.node.props.children = x.s; });
    // erste Zeile (mit dem Wort) ausgenommen: darunter darf sich nichts ändern
    let changed = 0, y0 = -1; for (let i = 3; i < fin.length; i += 4) if (Math.abs(px[i] - fin[i]) > 64) { const y = Math.floor((i - 3) / 4 / 540); if (y0 < 0) y0 = y; if (y > y0 + 90) changed++; }
    assert.ok(changed < 50, "geänderte Pixel unterhalb der ersten Zeile: " + changed);
  });
  await t("Reel: Video mit Ton, Länge ≥ 7,5 s auf dem Takt, Titelbild, Text steht still", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "motion-")), music = path.join(ROOT, "mkt-assets", "music", "froehlich--city-sunshine.m4a");
    const r = await MO.reel([sl("hook", { kicker: "Hunger?", headline: "Heute *kochst du nicht*" }), sl("cta", { headline: "Bestell bei *kochdu*", cta: "Jetzt bestellen" })], kochdu,
      { dir, url: "kochdu.at", v: 2, music, musicMeta: { bpm: 85, beat0: 0.711 }, outFile: path.join(dir, "r.mp4"), coverFile: path.join(dir, "c.jpg") });
    assert.ok(fs.existsSync(r.file) && fs.existsSync(r.cover)); assert.ok(r.duration >= 7.5, "Dauer " + r.duration); assert.ok(r.synced);
    const out = (() => { try { execFileSync(R.FFMPEG(), ["-hide_banner", "-i", r.file], { stdio: ["ignore", "pipe", "pipe"] }); return ""; } catch (e) { return String(e.stderr || ""); } })();   // ohne Ausgabedatei: Info auf stderr
    assert.ok(/Video: h264/.test(out) && /1080x1920/.test(out), "h264 1080x1920"); assert.ok(/Audio: aac/.test(out), "Ton");
    // Text steht nach dem Einfliegen pixelgenau still (Kamerafahrt nur im Hintergrund): Schrift-/Kartenpixel der letzten Szene vergleichen
    const grab = ts => execFileSync(R.FFMPEG(), ["-v", "error", "-ss", ts.toFixed(2), "-i", r.file, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], { maxBuffer: 1 << 26 });
    const t1 = r.cuts[r.cuts.length - 1] - 1.2, t2 = r.cuts[r.cuts.length - 1] - 0.3; assert.ok(t1 > r.cuts[1] + 2, "Szene lang genug");
    const fa = grab(t1), fb = grab(t2), F = R.fmtFor({ format: "reel" }, kochdu);
    const mask = await R.rawFrame(T.fgLayer(R.postEl(sl("cta", { headline: "Bestell bei *kochdu*", cta: "Jetzt bestellen" }), kochdu, { format: "reel", variant: "brand", url: "kochdu.at", overVideo: false, v: 3, cover: false, cv: 0, layer: "fg", anim: true }), "", true), F.w, F.h, 1080);
    let dd = 0, nn = 0; for (let i = 0; i < fa.length; i++) if (mask[i * 4 + 3] > 250) { dd += Math.abs(fa[i] - fb[i]); nn++; }
    assert.ok(nn > 5000 && dd / nn < 1.5, "Text bewegt sich noch: mittlere Änderung " + (dd / nn).toFixed(2) + " auf " + nn + " Pixeln");
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  });
  console.log("motion: " + pass + " ok, " + fail + " fehlgeschlagen");
  fails.forEach(f => console.log(" ✗ " + f));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
