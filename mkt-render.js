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
function fonts() {
  if (FONTS) return FONTS;
  const base = n => { try { return path.dirname(require.resolve("@fontsource/" + n + "/package.json")); } catch (e) { return path.join(__dirname, "node_modules", "@fontsource", n); } };
  const load = (fam, file, weight) => { try { return { name: fam, data: fs.readFileSync(path.join(base(fam.toLowerCase()), "files", file)), weight, style: "normal" }; } catch (e) { return null; } };
  FONTS = [
    load("Poppins", "poppins-latin-600-normal.woff", 600), load("Poppins", "poppins-latin-700-normal.woff", 700), load("Poppins", "poppins-latin-800-normal.woff", 800), load("Poppins", "poppins-latin-900-normal.woff", 900),
    load("Poppins", "poppins-latin-ext-800-normal.woff", 800),
    load("Inter", "inter-latin-400-normal.woff", 400), load("Inter", "inter-latin-500-normal.woff", 500), load("Inter", "inter-latin-600-normal.woff", 600), load("Inter", "inter-latin-700-normal.woff", 700),
    load("Inter", "inter-latin-ext-500-normal.woff", 500), load("Inter", "inter-latin-ext-700-normal.woff", 700),
  ].filter(Boolean);
  return FONTS;
}
function ready() { return !!(satori && Resvg && fonts().length); }
function videoReady() { return ready() && !!FFMPEG && fs.existsSync(FFMPEG); }

// ───────────── Element-Baum ─────────────
// h("div", {style}, kind1, kind2 …) – div bekommt display:flex (satori verlangt das bei mehreren Kindern)
function h(type, style, ...kids) {
  const children = kids.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false && c !== "");
  const st = Object.assign(type === "div" ? { display: "flex" } : {}, style || {});
  const props = { style: st };
  if (children.length) props.children = children.length === 1 ? children[0] : children;
  return { type, props };
}
function img(src, style) { return { type: "img", props: { src, style: Object.assign({}, style || {}), width: style && style.width, height: style && style.height } }; }

async function png(el, w, hgt, opts) {
  if (!ready()) throw new Error("Bild-Erzeugung nicht verfügbar (satori/resvg fehlen)");
  const svg = await satori(el, { width: w, height: hgt, fonts: fonts() });
  const r = new Resvg(svg, { fitTo: { mode: "width", value: Math.round(w * ((opts && opts.scale) || 1)) }, font: { loadSystemFonts: false }, background: opts && opts.background || undefined });
  return r.render().asPng();
}

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

module.exports = { ready, videoReady, h, img, png, theme, mix, rgba, onColor, fit, ffmpeg, wav, giveawayVideo, _test: { backC1, ease, lines } };
