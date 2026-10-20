/* Marketing: Bilder und Videos am Server – ohne Fremddienst, kostenlos.
   Bilder: Layout als Element-Baum → SVG (satori) → PNG (resvg). Schriften Poppins/Inter aus @fontsource (OFL), daher Umlaute, ß und €.
   Videos: ffmpeg (ffmpeg-static) setzt PNG-Ebenen zusammen (Bewegung über Ausdrücke im overlay-Filter), Ton wird hier selbst erzeugt (WAV).
   Genutzt von marketing.js (Posts, Reels, Gewinnspiel-Auslosung). Alles asynchron, Arbeitsordner je Auftrag im Datenordner. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

let satori = null, Resvg = null, FFMPEG = process.env.FFMPEG_BIN || "";
try { const m = require("satori"); satori = m.default || m; } catch (e) { satori = null; }
try { Resvg = require("@resvg/resvg-js").Resvg; } catch (e) { Resvg = null; }
if (!FFMPEG) { try { FFMPEG = require("ffmpeg-static") || ""; } catch (e) { FFMPEG = ""; } }

// ───────────── Schriften ─────────────
let FONTS = null;
// Schriften der Marken (Website-Schriften): Poppins/Inter (Standard), Outfit (kochdu), Barlow + Barlow Condensed (Kantineur, Skikaiser),
// Cormorant Garamond (Blitzdings), Merriweather (VALUERO), Fredoka + Fraunces (Hüttengaudi), Lilita One + Archivo (Skikaiser)
const FONT_SET = [["Poppins", [600, 700, 800, 900]], ["Inter", [400, 500, 600, 700, 800]], ["Outfit", [500, 700, 800, 900]], ["Barlow", [400, 500, 600, 700]],
  ["Barlow Condensed", [600, 700, 800], [700, 800]], ["Cormorant Garamond", [500, 600, 700], [500, 600]], ["Merriweather", [400, 700, 900], [400]],
  ["Fredoka", [500, 600, 700]], ["Fraunces", [600, 700, 800], [700]], ["Lilita One", [400]], ["Archivo", [500, 700, 800], [800]]];
function fonts() {
  if (FONTS) return FONTS;
  const base = n => { try { return path.dirname(require.resolve("@fontsource/" + n + "/package.json")); } catch (e) { return path.join(__dirname, "node_modules", "@fontsource", n); } };
  const load = (fam, weight, style) => { const dir = fam.toLowerCase().replace(/ /g, "-"); try { return { name: fam, data: fs.readFileSync(path.join(base(dir), "files", dir + "-latin-" + weight + "-" + style + ".woff")), weight, style }; } catch (e) { return null; } };
  FONTS = [];
  FONT_SET.forEach(([fam, ws, its]) => { ws.forEach(w => FONTS.push(load(fam, w, "normal"))); (its || []).forEach(w => FONTS.push(load(fam, w, "italic"))); });
  FONTS = FONTS.filter(Boolean);
  return FONTS;
}
// Emojis als Bilder (Twemoji, einmal geladen und zwischengespeichert) – sonst bleiben sie in Bildern leer
const EMOJI_DIR = path.join(require("os").tmpdir(), "fsc-emoji"), EMOJI = new Map();
function emojiCode(seg) { const cps = Array.from(seg).map(c => c.codePointAt(0)); const z = cps.indexOf(0x200d) > -1; return cps.filter(c => z || c !== 0xfe0f).map(c => c.toString(16)).join("-"); }
async function emojiUri(seg) {
  const code = emojiCode(seg); if (EMOJI.has(code)) return EMOJI.get(code);
  const f = path.join(EMOJI_DIR, code + ".svg"); let svg = "";
  try { svg = fs.readFileSync(f, "utf8"); } catch (e) {
    try { const r = await fetch("https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/" + code + ".svg", { signal: AbortSignal.timeout(5000) }); if (r.ok) { svg = await r.text(); fs.mkdirSync(EMOJI_DIR, { recursive: true }); fs.writeFileSync(f, svg); } } catch (e2) {}
  }
  const uri = svg && /<svg/.test(svg) ? "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64") : ""; EMOJI.set(code, uri); return uri;
}
function ready() { return !!(satori && Resvg && fonts().length); }
function videoReady() { return ready() && !!FFMPEG && fs.existsSync(FFMPEG); }

// ───────────── Element-Baum ─────────────
// h("div", {style}, kind1, kind2 …) – div bekommt display:flex (satori verlangt das bei mehreren Kindern)
function h(type, style, ...kids) {
  const children = kids.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false && c !== "");
  const st = Object.assign(type === "div" ? { display: "flex" } : {}, style || {}); Object.keys(st).forEach(k => { if (st[k] === undefined || st[k] === null || st[k] === "") delete st[k]; });
  const props = { style: st };
  if (children.length) props.children = children.length === 1 ? children[0] : children;
  return { type, props };
}
function img(src, style) { return { type: "img", props: { src, style: Object.assign({}, style || {}), width: style && style.width, height: style && style.height } }; }

// Merker der Reel-Animation (__u, __w, __hl …) aus den Stilen entfernen – satori kennt sie nicht
function clean(el) {
  if (!el || typeof el !== "object") return el;
  if (Array.isArray(el)) return el.map(clean);
  const p = el.props || {}, st = p.style; let ns = st;
  if (st && Object.keys(st).some(k => k.charCodeAt(0) === 95 && k.charCodeAt(1) === 95)) { ns = {}; Object.keys(st).forEach(k => { if (!(k.charCodeAt(0) === 95 && k.charCodeAt(1) === 95)) ns[k] = st[k]; }); }
  const kids = p.children, nk = kids && typeof kids === "object" ? clean(kids) : kids;
  if (ns === st && nk === kids) return el;
  return { type: el.type, props: Object.assign({}, p, { style: ns, children: nk }) };
}
async function svgOf(el, w, hgt) { return satori(clean(el), { width: w, height: hgt, fonts: fonts(), loadAdditionalAsset: async (code, seg) => code === "emoji" ? (await emojiUri(seg)) || undefined : undefined }); }
async function png(el, w, hgt, opts) {
  if (!ready()) throw new Error("Bild-Erzeugung nicht verfügbar (satori/resvg fehlen)");
  const svg = await svgOf(el, w, hgt);
  const r = new Resvg(svg, { fitTo: { mode: "width", value: Math.round(w * ((opts && opts.scale) || 1)) }, font: { loadSystemFonts: false }, background: opts && opts.background || undefined });
  return r.render().asPng();
}
// Rohbild (RGBA, vormultipliziert) für Videos – spart das PNG-Kodieren je Bild
async function rawFrame(el, w, hgt) { const r = new Resvg(await svgOf(el, w, hgt), { fitTo: { mode: "width", value: w }, font: { loadSystemFonts: false } }).render(); return r.pixels; }

// ───────────── Farben ─────────────
function hex(c) { const m = String(c || "").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; let s = m[1]; if (s.length === 3) s = s.split("").map(x => x + x).join(""); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); }
function toHex(rgb) { return "#" + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join(""); }
function mix(a, b, t) { const x = hex(a) || [0, 0, 0], y = hex(b) || [255, 255, 255]; return toHex(x.map((v, i) => v + (y[i] - v) * t)); }
function rgba(c, a) { const x = hex(c) || [0, 0, 0]; return "rgba(" + x.join(",") + "," + a + ")"; }
function lum(c) { const x = (hex(c) || [0, 0, 0]).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2]; }
function onColor(bg, dark, light) { return lum(bg) > 0.42 ? (dark || "#14121a") : (light || "#ffffff"); }
// Markenfarben aus dem Profil: primär (Pflicht), dunkel, hell, Text
function theme(brand) {
  const c = (brand && brand.colors) || {};
  const primary = hex(c.primary) ? c.primary : "#0a84ff";
  return { primary, dark: hex(c.dark) ? c.dark : mix(primary, "#000000", 0.28), light: hex(c.light) ? c.light : mix(primary, "#ffffff", 0.9),
    ink: hex(c.ink) ? c.ink : "#17151f", accent: hex(c.accent) ? c.accent : mix(primary, "#ffffff", 0.55), paper: "#ffffff" };
}

// ───────────── Text einpassen (Schätzung über mittlere Zeichenbreite) ─────────────
// Ein Wort, das allein breiter als die Zeile ist, lässt sich nicht umbrechen (z. B. @benutzername) → zählt als „passt nicht“
function lines(text, size, maxW, k) {
  const words = String(text || "").split(/\s+/).filter(Boolean); let n = 1, cur = 0; const sp = size * k * 0.9;
  for (const w of words) { const ww = w.length * size * k; if (ww > maxW) return Infinity; if (cur && cur + sp + ww > maxW) { n++; cur = ww; } else cur += (cur ? sp : 0) + ww; }
  return n;
}
function fit(text, maxW, maxLines, maxSize, minSize, k) { let s = maxSize; while (s > minSize && lines(text, s, maxW, k || 0.6) > maxLines) s -= 2; return s; }

// ───────────── ffmpeg ─────────────
function ffmpeg(args, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    if (!FFMPEG) return reject(new Error("ffmpeg fehlt"));
    const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y"].concat(args), { cwd: opts.cwd });
    let err = ""; p.stderr.on("data", d => { err += d; if (err.length > 20000) err = err.slice(-20000); });
    const to = setTimeout(() => { try { p.kill("SIGKILL"); } catch (e) {} }, opts.timeout || 5 * 60 * 1000);
    p.on("error", e => { clearTimeout(to); reject(e); });
    p.on("close", code => { clearTimeout(to); code === 0 ? resolve() : reject(new Error("ffmpeg: " + (err.trim().split("\n").slice(-3).join(" | ") || "Code " + code))); });
  });
}
const VENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart"];

// ───────────── Ton (WAV, mono 44,1 kHz) ─────────────
function wav(seconds, events) {
  const SR = 44100, n = Math.ceil(seconds * SR), buf = new Float32Array(n);
  const add = (t0, dur, fn) => { const s = Math.max(0, Math.floor(t0 * SR)), e = Math.min(n, s + Math.floor(dur * SR)); for (let i = s; i < e; i++) buf[i] += fn((i - s) / SR); };
  (events || []).forEach(ev => {
    if (ev.type === "tick") { const f = ev.f || 2600; add(ev.t, 0.03, x => (Math.sin(2 * Math.PI * f * x) * 0.6 + Math.sin(2 * Math.PI * f * 2.1 * x) * 0.25) * Math.exp(-x * 220) * (ev.v || 0.35)); }
    else if (ev.type === "chime") { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => add(ev.t + i * 0.085, 1.6, x => (Math.sin(2 * Math.PI * f * x) + 0.35 * Math.sin(4 * Math.PI * f * x) + 0.12 * Math.sin(6 * Math.PI * f * x)) * Math.exp(-x * 3.2) * Math.min(1, x * 400) * 0.16)); }
    else if (ev.type === "whoosh") { let a = 0, b = 0; add(ev.t, ev.d || 0.7, x => { const r = Math.random() * 2 - 1; a += (r - a) * (0.02 + 0.25 * x / (ev.d || 0.7)); b += (a - b) * 0.3; return b * Math.sin(Math.PI * x / (ev.d || 0.7)) * (ev.v || 0.5); }); }
    else if (ev.type === "thump") { add(ev.t, 0.35, x => Math.sin(2 * Math.PI * (90 - 60 * x) * x) * Math.exp(-x * 14) * 0.55); }
  });
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const g = peak > 0.95 ? 0.95 / peak : 1, out = Buffer.alloc(44 + n * 2);
  out.write("RIFF", 0); out.writeUInt32LE(36 + n * 2, 4); out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(buf[i] * g * 32767))), 44 + i * 2);
  return out;
}

// ───────────── Bausteine ─────────────
const W = 1080, H = 1920;
function blobs(T, w, hh) {   // weiche Lichtflecken im Hintergrund
  return [
    h("div", { position: "absolute", left: -w * 0.35, top: -hh * 0.12, width: w * 0.95, height: w * 0.95, borderRadius: w, background: "radial-gradient(circle, " + rgba(T.accent, 0.55) + " 0%, " + rgba(T.accent, 0) + " 70%)" }),
    h("div", { position: "absolute", right: -w * 0.4, bottom: -hh * 0.08, width: w * 1.1, height: w * 1.1, borderRadius: w, background: "radial-gradient(circle, " + rgba(T.dark, 0.85) + " 0%, " + rgba(T.dark, 0) + " 70%)" }),
  ];
}
function bgStyle(T) { return { background: "linear-gradient(160deg, " + T.primary + " 0%, " + T.dark + " 100%)" }; }
function logoPill(brand, T, height) {
  const hgt = height || 64;
  if (brand && brand.logo) return h("div", { background: brand.logoBg === "dark" ? T.dark : "#ffffff", borderRadius: 999, padding: Math.round(hgt * 0.32) + "px " + Math.round(hgt * 0.6) + "px", boxShadow: "0 10px 30px rgba(0,0,0,0.18)" }, img(brand.logo, { height: hgt, width: Math.round(hgt * (brand.logoRatio || 4.9)) }));
  return h("div", { background: "#ffffff", color: T.primary, borderRadius: 999, padding: "16px 34px", fontFamily: "Poppins", fontWeight: 800, fontSize: Math.round(hgt * 0.62) }, (brand && brand.name) || "");
}

// ───────────── Gewinnspiel-Video ─────────────
/* opt: { brand:{name,colors,logo(dataURI),logoRatio}, title, prize, total, date, names:[…] (Anzeige-Reihenfolge), winners:[…], dir, outFile, music? }
   Ablauf je Gewinner: Namen rauschen durch das Fenster, werden langsamer, bleiben am Gewinner stehen (leichtes Nachfedern), Ticks + Gong;
   danach Gewinner-Karte mit Konfetti. Bei mehreren Gewinnern am Ende eine Übersicht. Format 1080×1920 (Reel/Story/TikTok), 30 fps. */
const VP = { x: 90, y: 700, w: 900, h: 660, row: 132 };      // Fenster mit den Namen (5 Zeilen sichtbar)
function nameSize(n) { return fit(n, VP.w - 130, 1, 70, 30, 0.64); }
async function stripPng(names, T) {
  const rows = names.map(n => h("div", { height: VP.row, width: VP.w, alignItems: "center", justifyContent: "center", fontFamily: "Poppins", fontWeight: 700, fontSize: nameSize(n), color: T.ink, letterSpacing: -0.5 }, n));
  return png(h("div", { flexDirection: "column", width: VP.w, height: names.length * VP.row }, rows), VP.w, names.length * VP.row);
}
function giveawayBg(o, T, phase) {
  const brand = o.brand || {};
  return h("div", Object.assign({ width: W, height: H, position: "relative", flexDirection: "column", alignItems: "center", fontFamily: "Inter", color: "#ffffff", overflow: "hidden" }, bgStyle(T)),
    blobs(T, W, H),
    h("div", { position: "absolute", top: 190, left: 0, right: 0, justifyContent: "center" }, logoPill(brand, T, 58)),
    h("div", { position: "absolute", top: 345, left: 0, right: 0, flexDirection: "column", alignItems: "center" },
      h("div", { fontSize: 32, fontWeight: 700, letterSpacing: 6, opacity: 0.8 }, (o.kicker || "GEWINNSPIEL").toUpperCase()),
      h("div", { fontFamily: "Poppins", fontWeight: 800, fontSize: phase === "spin" ? 104 : 96, letterSpacing: -2, marginTop: 4 }, o.title || "Wer gewinnt?"),
      o.prize ? h("div", { marginTop: 22, background: "rgba(255,255,255,0.16)", border: "2px solid rgba(255,255,255,0.28)", borderRadius: 999, padding: "14px 34px", fontSize: 36, fontWeight: 600, maxWidth: 900, textAlign: "center" }, o.prize) : null),
    phase === "spin" ? h("div", { position: "absolute", left: VP.x - 6, top: VP.y - 6, width: VP.w + 12, height: VP.h + 12, borderRadius: 56, background: "rgba(0,0,0,0.18)" }) : null,
    h("div", { position: "absolute", top: VP.y + VP.h + 44, left: 0, right: 0, justifyContent: "center", fontSize: 34, fontWeight: 600, opacity: 0.88 }, (o.total ? o.total.toLocaleString("de-AT") + " Teilnahmen" : "") + (o.date ? " · Ziehung am " + o.date : "")));
}
// Inneres des Fensters (Kartenfarbe + Markierung der Gewinnerzeile); darauf laufen die Namen, oben/unten blendet der Rand weich aus
function windowBase(T) {
  const mid = (VP.h - VP.row) / 2;
  return h("div", { width: VP.w, height: VP.h, background: "#ffffff", position: "relative" },
    h("div", { position: "absolute", left: 28, right: 28, top: mid, height: VP.row, borderRadius: 30, background: T.light }));
}
function windowTop(T) {
  const mid = (VP.h - VP.row) / 2, fade = 190;
  const arrow = side => "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="34" height="52" viewBox="0 0 34 52"><path d="' + (side === "left" ? "M0 0 L34 26 L0 52 Z" : "M34 0 L0 26 L34 52 Z") + '" fill="' + T.primary + '"/></svg>').toString("base64");
  const tri = side => h("div", { position: "absolute", top: mid + VP.row / 2 - 26, [side]: 0, width: 34, height: 52 }, img(arrow(side), { width: 34, height: 52 }));
  return h("div", { width: VP.w, height: VP.h, position: "relative" },
    h("div", { position: "absolute", left: 0, right: 0, top: 0, height: fade, background: "linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.85) 35%, rgba(255,255,255,0) 100%)" }),
    h("div", { position: "absolute", left: 0, right: 0, bottom: 0, height: fade, background: "linear-gradient(0deg, #ffffff 0%, rgba(255,255,255,0.85) 35%, rgba(255,255,255,0) 100%)" }),
    tri("left"), tri("right"));
}
function windowHit(T) {   // Rahmen um die Gewinnerzeile beim Stehenbleiben
  const mid = (VP.h - VP.row) / 2;
  return h("div", { width: VP.w, height: VP.h, position: "relative" },
    h("div", { position: "absolute", left: 22, right: 22, top: mid - 6, height: VP.row + 12, borderRadius: 34, border: "6px solid " + T.primary, boxShadow: "0 0 40px " + rgba(T.primary, 0.55) }));
}
function maskPng(w, hh, r) { return png(h("div", { width: w, height: hh, background: "#000000" }, h("div", { width: w, height: hh, borderRadius: r, background: "#ffffff" })), w, hh); }
function confettiPng(T, seed, w, hh, big) {
  let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const cols = [T.accent, "#ffffff", "#ffd54a", "#ff6b8a", "#4dd9a6", T.light, mix(T.primary, "#ffffff", 0.3)];
  const n = big ? 70 : 120, kids = [];
  for (let i = 0; i < n; i++) {
    const sz = big ? 18 + rnd() * 22 : 8 + rnd() * 12, round = rnd() < 0.3;
    kids.push(h("div", { position: "absolute", left: Math.round(rnd() * (w - 30)), top: Math.round(rnd() * (hh - 40)), width: Math.round(sz * (round ? 1 : 0.55)), height: Math.round(sz), borderRadius: round ? 99 : 3,
      background: cols[Math.floor(rnd() * cols.length)], transform: "rotate(" + Math.round(rnd() * 180) + "deg)", opacity: 0.95 }));
  }
  return png(h("div", { width: w, height: hh, position: "relative" }, kids), w, hh);
}
function winnerCard(o, T, name, idx, count) { return h("div", { width: W, height: H, position: "relative", alignItems: "center", justifyContent: "center", fontFamily: "Inter" }, winnerInner(o, T, name, idx, count)); }
function winnerInner(o, T, name, idx, count) {
  const sz = fit(name, 770, 2, 112, 40, 0.66);
  return (
    h("div", { width: 900, fontFamily: "Inter", flexDirection: "column", alignItems: "center", background: "#ffffff", borderRadius: 64, padding: "70px 60px 64px", boxShadow: "0 40px 90px rgba(0,0,0,0.35)", marginTop: 40 },
      h("div", { fontSize: 32, fontWeight: 700, letterSpacing: 5, color: T.primary }, count > 1 ? (idx + 1) + ". GEWINNER" : "GEWONNEN HAT"),
      h("div", { fontFamily: "Poppins", fontWeight: 800, fontSize: sz, color: T.ink, textAlign: "center", lineHeight: 1.1, marginTop: 18, letterSpacing: -1.5 }, name),
      h("div", { width: 120, height: 8, borderRadius: 8, background: T.primary, marginTop: 34 }),
      h("div", { fontFamily: "Poppins", fontWeight: 700, fontSize: 46, color: T.ink, marginTop: 34 }, "Herzlichen Glückwunsch!"),
      o.prize ? h("div", { fontSize: 32, fontWeight: 500, color: mix(T.ink, "#ffffff", 0.35), marginTop: 12, textAlign: "center" }, o.prize) : null,
      h("div", { fontSize: 30, fontWeight: 600, color: T.primary, marginTop: 30, background: T.light, borderRadius: 999, padding: "14px 30px" }, o.claim || "Bitte melde dich per Direktnachricht bei uns.")));
}
function winnersList(o, T) { return h("div", { width: W, height: H, position: "relative", alignItems: "center", justifyContent: "center", fontFamily: "Inter" }, winnersInner(o, T)); }
function winnersInner(o, T) {
  const ws = o.winners;
  return (
    h("div", { width: 900, fontFamily: "Inter", flexDirection: "column", alignItems: "center", background: "#ffffff", borderRadius: 64, padding: "64px 56px", boxShadow: "0 40px 90px rgba(0,0,0,0.35)", marginTop: 40 },
      h("div", { fontSize: 32, fontWeight: 700, letterSpacing: 5, color: T.primary }, "DIE GEWINNER"),
      h("div", { flexDirection: "column", alignItems: "stretch", width: "100%", marginTop: 26 },
        ws.map((n, i) => h("div", { alignItems: "center", padding: "16px 10px", borderBottom: i < ws.length - 1 ? "2px solid " + T.light : "0px solid #fff" },
          h("div", { width: 64, height: 64, borderRadius: 64, background: T.primary, color: "#fff", alignItems: "center", justifyContent: "center", fontFamily: "Poppins", fontWeight: 800, fontSize: 32, marginRight: 24 }, String(i + 1)),
          h("div", { fontFamily: "Poppins", fontWeight: 700, fontSize: fit(n, 640, 1, 56, 26, 0.64), color: T.ink }, n)))),
      h("div", { fontFamily: "Poppins", fontWeight: 700, fontSize: 42, color: T.ink, marginTop: 34 }, "Herzlichen Glückwunsch!"),
      h("div", { fontSize: 30, fontWeight: 600, color: T.primary, marginTop: 22, background: T.light, borderRadius: 999, padding: "14px 30px" }, o.claim || "Bitte meldet euch per Direktnachricht bei uns.")));
}
// Nachfedern: easeOutBack, Stärke so gewählt, dass höchstens ~0,45 Zeilen überschwungen werden
function backC1(delta, row) {
  const want = Math.min(0.45 * row / Math.max(delta, 1), 0.02); let best = 0.1;
  for (let c1 = 0.02; c1 <= 1.7; c1 += 0.01) { const c3 = c1 + 1, x = 1 - 2 * c1 / (3 * c3), o = 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2) - 1; if (o <= want) best = c1; else break; }
  return best;
}
const ease = (x, c1) => { x = Math.max(0, Math.min(1, x)); const c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

async function giveawayVideo(o) {
  if (!videoReady()) throw new Error("Video-Erzeugung nicht verfügbar (ffmpeg fehlt)");
  const T = theme(o.brand), dir = o.dir; fs.mkdirSync(dir, { recursive: true });
  const P = f => path.join(dir, f), wr = async (f, p) => { fs.writeFileSync(P(f), await p); return P(f); };
  const winners = (o.winners || []).slice(0, 10); if (!winners.length) throw new Error("Kein Gewinner");
  const multi = winners.length > 1, events = [], segs = [];
  await wr("bg_spin.png", png(giveawayBg(o, T, "spin"), W, H));
  await wr("bg_plain.png", png(h("div", Object.assign({ width: W, height: H, position: "relative", overflow: "hidden" }, bgStyle(T)), blobs(T, W, H), h("div", { position: "absolute", top: 190, left: 0, right: 0, justifyContent: "center" }, logoPill(o.brand || {}, T, 58))), W, H));
  await wr("win_base.png", png(windowBase(T), VP.w, VP.h));
  await wr("win_top.png", png(windowTop(T), VP.w, VP.h));
  await wr("win_hit.png", png(windowHit(T), VP.w, VP.h));
  await wr("win_mask.png", maskPng(VP.w, VP.h, 48));
  await wr("conf_a.png", confettiPng(T, 7, W, H * 2, true));
  await wr("conf_b.png", confettiPng(T, 99, W, H * 2, false));
  let t0 = 0;
  const pool = (o.names && o.names.length ? o.names : winners).slice();
  for (let wi = 0; wi < winners.length; wi++) {
    // ── Drehen ──
    const lead = wi === 0 ? 1.1 : 0.5, D = wi === 0 ? 6.2 : 4.6, hold = 1.0, segDur = lead + D + hold;
    const want = wi === 0 ? 46 : 34, others = pool.filter(n => n !== winners[wi]), src = others.length ? others : [winners[wi]], seq = [];
    for (let i = 0; seq.length < want; i++) seq.push(src[(i + wi * 11) % src.length]);
    seq.push(winners[wi], src[(want + 1) % src.length], src[(want + 2) % src.length]);
    const kw = seq.length - 3, k0 = 2, mid = (VP.h - VP.row) / 2;
    const y0 = mid - k0 * VP.row, delta = (kw - k0) * VP.row, c1 = backC1(delta, VP.row);
    await wr("strip" + wi + ".png", stripPng(seq, T));
    const yExpr = "(" + y0 + ")-(" + delta + ")*(" + "1+" + (c1 + 1) + "*pow(clip((t-" + lead + ")/" + D + ",0,1)-1,3)+" + c1 + "*pow(clip((t-" + lead + ")/" + D + ",0,1)-1,2))";
    const seg = "seg" + segs.length + ".mp4";
    await ffmpeg(["-loop", "1", "-framerate", "30", "-t", String(segDur), "-i", P("bg_spin.png"),
      "-loop", "1", "-framerate", "30", "-t", String(segDur), "-i", P("win_base.png"),
      "-loop", "1", "-framerate", "30", "-t", String(segDur), "-i", P("strip" + wi + ".png"),
      "-loop", "1", "-framerate", "30", "-t", String(segDur), "-i", P("win_top.png"),
      "-loop", "1", "-framerate", "30", "-t", String(segDur), "-i", P("win_hit.png"),
      "-loop", "1", "-framerate", "30", "-t", String(segDur), "-i", P("win_mask.png"),
      "-filter_complex",
      "[1:v][2:v]overlay=x=0:y='" + yExpr + "':eval=frame[w1];[w1][3:v]overlay=0:0[w2];" +
      "[4:v]format=rgba,fade=t=in:st=" + (lead + D - 0.05).toFixed(2) + ":d=0.25:alpha=1[hit];[w2][hit]overlay=0:0[w3];" +
      "[5:v]format=gray[m];[w3]format=rgba[w3a];[w3a][m]alphamerge[w4];[0:v][w4]overlay=" + VP.x + ":" + VP.y + ",format=yuv420p" + (wi === 0 ? ",fade=t=in:st=0:d=0.35" : "") + "[v]",
      "-map", "[v]", "-t", String(segDur)].concat(VENC).concat([P(seg)]));
    segs.push({ file: seg, dur: segDur });
    // Ticks: jedes Mal, wenn eine Zeilengrenze die Mitte passiert
    let last = -1, lastT = -1;
    for (let ms = 0; ms <= D * 1000; ms += 2) { const off = delta * ease(ms / 1000 / D, c1), idx = Math.floor((off + VP.row / 2) / VP.row); if (idx !== last) { const tt = t0 + lead + ms / 1000; if (last >= 0 && tt - lastT > 0.035) { events.push({ type: "tick", t: tt, f: 2300 + (idx % 3) * 260, v: 0.3 }); lastT = tt; } last = idx; } }
    events.push({ type: "thump", t: t0 + lead + D - 0.02 }); events.push({ type: "chime", t: t0 + lead + D + 0.05 });
    t0 += segDur;
    // ── Gewinner-Karte mit Konfetti ──
    const rd = multi ? 3.2 : 4.6, card = "card" + wi + ".png";
    await wr(card, png(winnerCard(o, T, winners[wi], wi, winners.length), W, H));
    const seg2 = "seg" + segs.length + ".mp4";
    await ffmpeg(["-loop", "1", "-framerate", "30", "-t", String(rd), "-i", P("bg_plain.png"),
      "-loop", "1", "-framerate", "30", "-t", String(rd), "-i", P("conf_b.png"),
      "-loop", "1", "-framerate", "30", "-t", String(rd), "-i", P(card),
      "-loop", "1", "-framerate", "30", "-t", String(rd), "-i", P("conf_a.png"),
      "-filter_complex",
      "[0:v][1:v]overlay=x=0:y='-" + (2 * H) + "+t*" + 950 + "':eval=frame[a];[a][3:v]overlay=x=0:y='-" + (2 * H) + "+t*" + 1450 + "':eval=frame[b];" +
      "[2:v]format=rgba,fade=t=in:st=0:d=0.35:alpha=1[c];" +
      "[b][c]overlay=x=0:y='90*pow(1-min(t/0.5,1),3)':eval=frame,format=yuv420p" + (wi === winners.length - 1 && !multi ? ",fade=t=out:st=" + (rd - 0.4) + ":d=0.4" : "") + "[v]",
      "-map", "[v]", "-t", String(rd)].concat(VENC).concat([P(seg2)]));
    segs.push({ file: seg2, dur: rd });
    events.push({ type: "whoosh", t: t0, d: 0.6, v: 0.35 });
    t0 += rd;
  }
  if (multi) {
    const ld = 4.2;
    await wr("list.png", png(winnersList(o, T), W, H));
    const seg3 = "seg" + segs.length + ".mp4";
    await ffmpeg(["-loop", "1", "-framerate", "30", "-t", String(ld), "-i", P("bg_plain.png"), "-loop", "1", "-framerate", "30", "-t", String(ld), "-i", P("list.png"), "-loop", "1", "-framerate", "30", "-t", String(ld), "-i", P("conf_a.png"),
      "-filter_complex", "[0:v][2:v]overlay=x=0:y='-" + (2 * H) + "+t*" + 1250 + "':eval=frame[a];[1:v]format=rgba,fade=t=in:st=0:d=0.4:alpha=1[l];[a][l]overlay=0:0,format=yuv420p,fade=t=out:st=" + (ld - 0.4) + ":d=0.4[v]",
      "-map", "[v]", "-t", String(ld)].concat(VENC).concat([P(seg3)]));
    segs.push({ file: seg3, dur: ld }); events.push({ type: "chime", t: t0 + 0.1 }); t0 += ld;
  }
  fs.writeFileSync(P("list.txt"), segs.map(s => "file '" + s.file + "'").join("\n"));
  fs.writeFileSync(P("audio.wav"), wav(t0 + 0.2, events));
  const out = o.outFile || P("gewinnspiel.mp4");
  const args = ["-f", "concat", "-safe", "0", "-i", P("list.txt"), "-i", P("audio.wav")];
  if (o.music && fs.existsSync(o.music)) args.push("-stream_loop", "-1", "-i", o.music);
  args.push("-filter_complex", o.music && fs.existsSync(o.music) ? "[2:a]volume=0.35,atrim=0:" + t0.toFixed(2) + ",afade=t=out:st=" + (t0 - 1.5).toFixed(2) + ":d=1.5[m];[1:a][m]amix=inputs=2:duration=first:normalize=0[a]" : "[1:a]anull[a]",
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-t", t0.toFixed(2), "-movflags", "+faststart", out);
  await ffmpeg(args);
  // Standbild 9:16 kurz vor Schluss (Vorschau, Reel-Cover)
  if (o.posterFile) await ffmpeg(["-ss", Math.max(0, t0 - 1.3).toFixed(2), "-i", out, "-frames:v", "1", "-q:v", "3", o.posterFile]);
  // Titelbild (für Reel-Cover/Feed): Gewinner-Karte im Hochformat 4:5
  const cover = o.coverFile || P("cover.png");
  fs.writeFileSync(cover, await png(h("div", Object.assign({ width: 1080, height: 1350, position: "relative", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden" }, bgStyle(T)), blobs(T, 1080, 1350),
    h("div", { position: "absolute", top: 80, left: 0, right: 0, justifyContent: "center" }, logoPill(o.brand || {}, T, 52)),
    h("div", { marginTop: 110 }, multi ? winnersInner(o, T) : winnerInner(o, T, winners[0], 0, 1))), 1080, 1350));
  return { file: out, cover, poster: o.posterFile || "", duration: Math.round(t0 * 10) / 10 };
}

// ═════════════ Post-Vorlagen (Feed 1080×1350, Story/Reel 1080×1920) ═════════════
/* Folie: { template: hook|list|quote|stat|compare|cta|photo, kicker, headline, sub, items[], cta, number, label, author, leftTitle, leftItems[], rightTitle, rightItems[], image(dataURI) }
   Hervorhebung im Text mit *Sternchen* (wird als Markierung gesetzt). variant: brand | light | dark. layer: all | bg | fg (fürs Reel: Hintergrund und Text getrennt). */
const FMT = { feed: { w: 1080, h: 1350, px: 84, top: 84, bottom: 84 }, story: { w: 1080, h: 1920, px: 92, top: 230, bottom: 400 } };
function look(T, variant) {
  if (variant === "light") return { bg: "linear-gradient(170deg, " + mix(T.light, "#ffffff", 0.35) + " 0%, " + T.light + " 100%)", fg: T.ink, sub: mix(T.ink, T.light, 0.32), mark: T.primary, markFg: onColor(T.primary), card: "#ffffff", cardFg: T.ink, line: mix(T.primary, T.light, 0.75), glowA: rgba(T.primary, 0.16), glowB: rgba(T.accent, 0.22) };
  if (variant === "dark") { const d = mix(T.dark, "#05060a", 0.55); return { bg: "linear-gradient(165deg, " + mix(d, T.primary, 0.12) + " 0%, " + d + " 100%)", fg: "#ffffff", sub: "rgba(255,255,255,0.74)", mark: T.primary, markFg: onColor(T.primary), card: "rgba(255,255,255,0.08)", cardFg: "#ffffff", line: "rgba(255,255,255,0.16)", glowA: rgba(T.primary, 0.55), glowB: rgba(T.accent, 0.3) }; }
  const fg = onColor(T.primary);
  return { bg: "linear-gradient(160deg, " + T.primary + " 0%, " + T.dark + " 100%)", fg, sub: fg === "#ffffff" ? "rgba(255,255,255,0.8)" : rgba(T.ink, 0.75), mark: "#ffffff", markFg: T.primary === "#ffffff" ? T.ink : T.dark, card: fg === "#ffffff" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.5)", cardFg: fg, line: "rgba(255,255,255,0.25)", glowA: rgba(T.accent, 0.5), glowB: rgba(T.dark, 0.9) };
}
// Wörter einzeln setzen (umbrechen wie Fließtext), *markierte* Teile als Marker-Fläche
function rich(text, size, color, L, opt) {
  opt = opt || {}; const parts = [];
  String(text || "").split(/(\*[^*]+\*)/).forEach(seg => { if (!seg) return; const hl = /^\*[^*]+\*$/.test(seg); const t = hl ? seg.slice(1, -1) : seg;
    if (!hl && parts.length && /^[?!.,:;…)“"]/.test(t)) { const m = t.match(/^[?!.,:;…)“"]+/)[0]; parts[parts.length - 1].tail = m; seg = t.slice(m.length); } else seg = t;
    (hl && seg.length <= 22 ? [seg.trim()] : seg.split(/\s+/)).filter(Boolean).forEach(w => parts.push({ w, hl })); });
  const gap = Math.round(size * 0.24);
  const mk = p => p.hl ? h("span", { background: L.mark, color: L.markFg, borderRadius: Math.round(size * 0.16), padding: "0 " + Math.round(size * 0.16) + "px" }, p.w) : h("span", {}, p.w);
  return h("div", { flexWrap: "wrap", justifyContent: opt.center ? "center" : "flex-start", alignItems: "center", rowGap: Math.round(size * (opt.gap || 0.08)), fontFamily: opt.family || "Poppins", fontWeight: opt.weight || 800, fontSize: size, lineHeight: 1.08, letterSpacing: opt.ls != null ? opt.ls : -size * 0.025, color },
    parts.map(p => p.tail ? h("div", { marginRight: gap }, mk(p), h("span", {}, p.tail)) : h("div", { marginRight: gap }, mk(p))));
}
const plain = s => String(s || "").replace(/\*/g, "");
const svgUri = (body, w, hh) => "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + hh + '" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>').toString("base64");
const ICON = {
  arrow: c => svgUri('<path d="M4 12h15M13 6l6 6-6 6" stroke="' + c + '" stroke-width="2.6"/>', 40, 40),
  check: c => svgUri('<path d="M5 12.5l4.5 4.5L19 7.5" stroke="' + c + '" stroke-width="3"/>', 36, 36),
  cross: c => svgUri('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="' + c + '" stroke-width="2.6"/>', 36, 36),
};
const cssColor = c => /^#/.test(String(c)) ? c : "#ffffff";
let SKINS = null;
const skins = () => SKINS || (SKINS = require("./mkt-skins.js")({ h, img, fit, mix, rgba, onColor }));
// Reel mit Video-Hintergrund: Hintergrund-Ebene ist nur ein Schatten (Text bleibt lesbar), der Text kommt aus dem Marken-Look
function shadeEl(F) { return h("div", { width: F.w, height: F.h, background: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 32%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.78) 100%)" }); }
function postEl(slide, brand, o) {
  o = o || {}; const F0 = FMT[o.format === "story" ? "story" : "feed"];
  if (brand && brand.key && skins().has(brand.key)) {
    if (o.overVideo && o.layer === "bg") return shadeEl(F0);
    return skins().el(Object.assign({}, slide, o.overVideo ? { image: "" } : {}), brand, o, F0);
  }
  const T = theme(brand), F = F0, L = look(T, o.variant || "brand"), story = F === FMT.story;
  const layer = o.layer || "all", TX = layer === "bg" ? { opacity: 0 } : {}, DE = layer === "fg" ? { opacity: 0 } : {};
  const W2 = F.w - 2 * F.px, s = slide || {}, tpl = s.template === "photo" && !s.image ? "hook" : (s.template || "hook");
  const root = Object.assign({ width: F.w, height: F.h, position: "relative", flexDirection: "column", fontFamily: "Inter", color: L.fg, overflow: "hidden", padding: F.top + "px " + F.px + "px " + F.bottom + "px" },
    layer === "fg" ? { background: "transparent" } : o.overVideo ? { background: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 30%, rgba(0,0,0,0.28) 62%, rgba(0,0,0,0.72) 100%)" } : { background: L.bg });
  const deco = o.overVideo ? [] : [h("div", Object.assign({ position: "absolute", left: -F.w * 0.3, top: -F.w * 0.25, width: F.w * 0.9, height: F.w * 0.9, borderRadius: F.w, background: "radial-gradient(circle, " + L.glowA + " 0%, rgba(0,0,0,0) 70%)" }, DE)),
    h("div", Object.assign({ position: "absolute", right: -F.w * 0.35, bottom: -F.w * 0.3, width: F.w * 1.0, height: F.w * 1.0, borderRadius: F.w, background: "radial-gradient(circle, " + L.glowB + " 0%, rgba(0,0,0,0) 70%)" }, DE))];
  if (tpl === "photo" && s.image) deco.push(img(s.image, Object.assign({ position: "absolute", left: 0, top: 0, width: F.w, height: F.h, objectFit: "cover" }, DE)),
    h("div", Object.assign({ position: "absolute", left: 0, top: 0, width: F.w, height: F.h, background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.78) 100%)" }, DE)));
  const head = h("div", { justifyContent: "space-between", alignItems: "center", width: W2, marginBottom: story ? 70 : 56, flexShrink: 0 },
    h("div", DE, logoPill(brand, T, story ? 52 : 44)),
    o.counter ? h("div", Object.assign({ fontSize: 26, fontWeight: 700, color: L.sub, background: L.card, borderRadius: 99, padding: "8px 18px" }, TX), o.counter) : null);
  const kick = s.kicker ? h("div", Object.assign({ alignSelf: tpl === "cta" || tpl === "stat" ? "center" : "flex-start", fontSize: story ? 30 : 26, fontWeight: 700, letterSpacing: 3, color: tpl === "photo" ? "#ffffff" : L.fg, background: tpl === "photo" ? "rgba(255,255,255,0.18)" : L.card, borderRadius: 99, padding: "10px 22px", marginBottom: story ? 34 : 28 }, TX), plain(s.kicker).toUpperCase()) : null;
  const subEl = (txt, size, center) => txt ? h("div", Object.assign({ fontSize: size, fontWeight: 500, lineHeight: 1.35, color: tpl === "photo" ? "rgba(255,255,255,0.88)" : L.sub, marginTop: story ? 34 : 26, textAlign: center ? "center" : "left", justifyContent: center ? "center" : "flex-start" }, TX), plain(txt)) : null;
  const ctaEl = (txt, center) => txt ? h("div", Object.assign({ alignSelf: center ? "center" : "flex-start", background: L.mark, color: L.markFg, fontFamily: "Poppins", fontWeight: 700, fontSize: story ? 36 : 32, borderRadius: 99, padding: story ? "22px 40px" : "18px 34px", boxShadow: "0 14px 34px rgba(0,0,0,0.18)" }, TX), plain(txt)) : null;
  const foot = h("div", { justifyContent: "space-between", alignItems: "center", width: W2, marginTop: "auto" },
    o.swipe ? h("div", Object.assign({ fontSize: 28, fontWeight: 700, color: L.fg, alignItems: "center" }, TX), "Wischen", h("div", { marginLeft: 10 }, img(ICON.arrow(cssColor(L.fg)), { width: 34, height: 34 }))) : ctaEl(tpl === "cta" ? "" : s.cta),
    o.url && tpl !== "cta" ? h("div", Object.assign({ fontSize: 24, fontWeight: 600, color: L.sub }, TX), o.url) : null);
  let body;
  const maxH = story ? 5 : 4, bigK = 0.64;
  if (tpl === "list") {
    const its = (s.items || []).slice(0, 5), n = its.length || 1, hs = fit(plain(s.headline), W2, 3, story ? 92 : 78, 44, bigK), isz = Math.min(story ? 40 : 36, Math.max(28, fit(its.reduce((a, b) => a.length > b.length ? a : b, ""), W2 - 120, 2, story ? 40 : 36, 26, 0.55)));
    body = h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kick, h("div", TX, rich(s.headline, hs, L.fg, L)),
      h("div", { flexDirection: "column", marginTop: story ? 46 : 36, rowGap: n > 4 ? 14 : 18 },
        its.map((t, i) => h("div", Object.assign({ alignItems: "center", background: L.card, borderRadius: 26, padding: (n > 4 ? 16 : 22) + "px 24px" }, TX),
          h("div", { width: 58, height: 58, borderRadius: 58, flexShrink: 0, background: L.mark, color: L.markFg, alignItems: "center", justifyContent: "center", fontFamily: "Poppins", fontWeight: 800, fontSize: 28, marginRight: 22 }, String(i + 1)),
          h("div", { fontSize: isz, fontWeight: 600, lineHeight: 1.25, color: L.cardFg, width: W2 - 130 }, plain(t))))));
  } else if (tpl === "quote") {
    const qs = fit(plain(s.headline), W2, story ? 7 : 6, story ? 78 : 68, 38, 0.58);
    body = h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" },
      h("div", Object.assign({ fontFamily: "Poppins", fontWeight: 900, fontSize: story ? 260 : 220, lineHeight: 0.8, color: L.mark, height: story ? 170 : 140 }, TX), "“"),
      h("div", TX, rich(s.headline, qs, L.fg, L, { weight: 700 })),
      s.author ? h("div", Object.assign({ fontSize: story ? 34 : 30, fontWeight: 600, color: L.sub, marginTop: 34 }, TX), "— " + plain(s.author)) : null);
  } else if (tpl === "stat") {
    const ns = fit(plain(s.number), W2, 1, story ? 300 : 260, 90, 0.66);
    body = h("div", { flexDirection: "column", alignItems: "center", width: W2, marginTop: "auto", marginBottom: "auto" }, kick,
      h("div", Object.assign({ fontFamily: "Poppins", fontWeight: 900, fontSize: ns, lineHeight: 1, letterSpacing: -ns * 0.04, color: L.fg }, TX), plain(s.number)),
      h("div", Object.assign({ marginTop: 18, justifyContent: "center" }, TX), rich(s.label || s.headline, fit(plain(s.label || s.headline), W2, 2, story ? 66 : 58, 34, bigK), L.fg, L, { center: true, weight: 700 })),
      subEl(s.sub, story ? 38 : 34, true));
  } else if (tpl === "compare") {
    const col = (title, items, good) => h("div", Object.assign({ flexDirection: "column", width: (W2 - 24) / 2, background: good ? L.mark : L.card, color: good ? L.markFg : L.cardFg, borderRadius: 30, padding: "28px 26px" }, TX),
      h("div", { fontFamily: "Poppins", fontWeight: 800, fontSize: story ? 40 : 36, marginBottom: 18 }, plain(title)),
      (items || []).slice(0, 5).map(t => h("div", { alignItems: "flex-start", marginTop: 12, fontSize: story ? 32 : 28, fontWeight: 600, lineHeight: 1.25 },
        h("div", { width: 40, flexShrink: 0, paddingTop: 2, opacity: good ? 1 : 0.6 }, img((good ? ICON.check : ICON.cross)(cssColor(good ? L.markFg : L.cardFg)), { width: 28, height: 28 })), h("div", { width: (W2 - 24) / 2 - 94 }, plain(t)))));
    body = h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kick, h("div", TX, rich(s.headline, fit(plain(s.headline), W2, 3, story ? 88 : 74, 42, bigK), L.fg, L)),
      h("div", { justifyContent: "space-between", marginTop: story ? 50 : 38 }, col(s.leftTitle || "Bisher", s.leftItems, false), col(s.rightTitle || brand.name, s.rightItems, true)));
  } else if (tpl === "cta") {
    body = h("div", { flexDirection: "column", alignItems: "center", width: W2, marginTop: "auto", marginBottom: "auto" },
      h("div", Object.assign({ marginBottom: 40 }, DE), logoPill(brand, T, story ? 96 : 80)),
      kick, h("div", Object.assign({ justifyContent: "center", width: W2 }, TX), rich(s.headline, fit(plain(s.headline), W2, 3, story ? 96 : 84, 44, bigK), L.fg, L, { center: true })),
      subEl(s.sub, story ? 38 : 34, true), h("div", { height: 44 }), ctaEl(s.cta, true),
      o.url && plain(s.cta).toLowerCase().indexOf(o.url.toLowerCase()) < 0 ? h("div", Object.assign({ fontSize: story ? 32 : 28, fontWeight: 600, color: L.sub, marginTop: 26 }, TX), o.url) : null);
  } else {   // hook / photo
    const hs = fit(plain(s.headline), W2, maxH, story ? 124 : 112, 52, bigK);
    body = h("div", { flexDirection: "column", width: W2, marginTop: tpl === "photo" ? "auto" : "auto", marginBottom: tpl === "photo" ? 40 : "auto" }, kick,
      h("div", TX, rich(s.headline, hs, tpl === "photo" ? "#ffffff" : L.fg, L)), subEl(s.sub, story ? 42 : 38));
  }
  return h("div", root, deco, head, body, tpl === "cta" ? null : foot);
}
async function slidePng(slide, brand, o) { const F = FMT[o && o.format === "story" ? "story" : "feed"]; return png(postEl(slide, brand, o), F.w, F.h); }
async function toJpeg(pngFile, jpgFile) { if (!videoReady()) return pngFile; await ffmpeg(["-i", pngFile, "-q:v", "2", "-pix_fmt", "yuvj420p", jpgFile]); return jpgFile; }
// Bilder eines Posts (Einzelbild oder Karussell) → JPEG-Dateien (Instagram verlangt JPEG)
async function postImages(slides, brand, o) {
  o = o || {}; const out = [], n = slides.length; fs.mkdirSync(o.dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    const variant = o.variants ? o.variants[i % o.variants.length] : (slides[i].template === "cta" ? "brand" : i === 0 ? "brand" : "light");
    const pf = path.join(o.dir, (o.prefix || "s") + i + ".png");
    fs.writeFileSync(pf, await slidePng(slides[i], brand, { format: "feed", variant, v: (o.v || 0) + i, counter: n > 1 ? (i + 1) + "/" + n : "", swipe: n > 1 && i === 0, url: o.url || "" }));
    out.push(await toJpeg(pf, pf.replace(/\.png$/, ".jpg")));
  }
  return out;
}
// Reel 1080×1920: je Szene Hintergrund (ruhig zoomend oder Stock-Video) + Text (blendet ein und gleitet hoch), harte Schnitte; Musik aus der Bibliothek oder still
function sceneDur(s) { const words = plain([s.kicker, s.headline, s.sub, (s.items || []).join(" "), s.number, s.label, (s.leftItems || []).join(" "), (s.rightItems || []).join(" ")].join(" ")).split(/\s+/).filter(Boolean).length; return Math.max(2.4, Math.min(5.5, 1.3 + words * 0.24)); }
async function reelVideo(scenes, brand, o) {
  if (!videoReady()) throw new Error("Video-Erzeugung nicht verfügbar (ffmpeg fehlt)");
  o = o || {}; const dir = o.dir; fs.mkdirSync(dir, { recursive: true }); const P = f => path.join(dir, f); const segs = []; let total = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i], variant = s.template === "cta" ? "brand" : (o.variants ? o.variants[i % o.variants.length] : (i % 2 ? "dark" : "brand")), d = +(o.durations && o.durations[i]) || sceneDur(s);
    const bgVid = o.bgVideos && o.bgVideos[i];
    const base = { format: "story", variant: bgVid ? "dark" : variant, url: o.url || "", overVideo: !!bgVid, v: (o.v || 0) + i };
    fs.writeFileSync(P("bg" + i + ".png"), await slidePng(s, brand, Object.assign({}, base, { layer: "bg" })));
    fs.writeFileSync(P("fg" + i + ".png"), await slidePng(s, brand, Object.assign({}, base, { layer: "fg" })));
    const inBg = bgVid ? ["-stream_loop", "-1", "-t", d.toFixed(2), "-i", bgVid] : ["-loop", "1", "-framerate", "30", "-t", d.toFixed(2), "-i", P("bg" + i + ".png")];
    const bgF = bgVid ? "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,eq=brightness=-0.08:saturation=1.05[b0];[b0][2:v]overlay=0:0[b]"
      : "[0:v]scale=2160:3840,zoompan=z='min(1+0.0009*on,1.12)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30[b]";
    const args = inBg.concat(["-loop", "1", "-framerate", "30", "-t", d.toFixed(2), "-i", P("fg" + i + ".png")]);
    if (bgVid) args.push("-loop", "1", "-framerate", "30", "-t", d.toFixed(2), "-i", P("bg" + i + ".png"));
    const seg = "seg" + i + ".mp4";
    await ffmpeg(args.concat(["-filter_complex", bgF + ";[1:v]format=rgba,fade=t=in:st=0.12:d=0.4:alpha=1[t];[b][t]overlay=x=0:y='60*pow(1-min(max(t-0.12,0)/0.5,1),3)':eval=frame,format=yuv420p[v]",
      "-map", "[v]", "-t", d.toFixed(2)]).concat(VENC).concat([P(seg)]));
    segs.push(seg); total += d;
  }
  fs.writeFileSync(P("list.txt"), segs.map(s => "file '" + s + "'").join("\n"));
  const out = o.outFile || P("reel.mp4"), music = o.music && fs.existsSync(o.music) ? o.music : "";
  const args = ["-f", "concat", "-safe", "0", "-i", P("list.txt")];
  if (music) args.push("-stream_loop", "-1", "-i", music, "-filter_complex", "[1:a]atrim=0:" + total.toFixed(2) + ",afade=t=in:st=0:d=0.4,afade=t=out:st=" + Math.max(0, total - 1.2).toFixed(2) + ":d=1.2,volume=0.9[a]", "-map", "0:v", "-map", "[a]");
  else args.push("-f", "lavfi", "-t", total.toFixed(2), "-i", "anullsrc=r=48000:cl=stereo", "-map", "0:v", "-map", "1:a");
  await ffmpeg(args.concat(["-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-t", total.toFixed(2), "-movflags", "+faststart", out]));
  // Titelbild = Bild aus dem fertigen Reel (erste Szene, Text schon eingeblendet)
  const cover = o.coverFile || P("cover.jpg"), d0 = +(o.durations && o.durations[0]) || sceneDur(scenes[0]);
  await ffmpeg(["-ss", Math.min(1.3, d0 - 0.2).toFixed(2), "-i", out, "-frames:v", "1", "-q:v", "2", cover]);
  return { file: out, cover, duration: Math.round(total * 10) / 10 };
}

module.exports = { ready, videoReady, h, img, png, rawFrame, clean, FFMPEG: () => FFMPEG, VENC, theme, mix, rgba, onColor, fit, ffmpeg, wav, giveawayVideo, postEl, slidePng, postImages, reelVideo, toJpeg, sceneDur, wantsPhoto: (k, t) => skins().wantsPhoto(k, t), hasSkin: k => skins().has(k), _test: { backC1, ease, lines } };
