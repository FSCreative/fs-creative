/* Marketing: Reel-Musik – passend, abwechslungsreich, immer neu (Plan: audit-plattformen/reel-musik-plan.md).
   Katalog: Grundstock (mkt-assets/music, CC0, neu getaggt) + eigene Uploads/Envato (mit Lizenz) + KI-Titel (Stability AI Stable Audio 3.0, Fallback 2.5).
   Analyse (ffmpeg ebur128 + eigene JS-Auswertung): Lautheit/True Peak, Intro-/Outro-Stille, Tempo mit Phase und Konfidenz, Abschnitte, Drops, Höhepunkte.
   Auswahl je Reel: Musikwunsch der Plan-KI + Musikprofil der Marke → Score mit harten Filtern (Lizenz, Content-ID, Daumen runter, „meiden“),
   Abwechslung (Sperren je Marke/global, Lockerungsleiter), Startpunkt am Höhepunkt auf dem Takt, statische Verstärkung auf −14 LUFS.
   KI-Komposition: ein eigener Titel je Reel (Prompt deterministisch, englisch, „instrumental, no vocals“), Budget je Monat mit harter Grenze,
   Nachweis-Protokoll (proof.jsonl, nur anhängen). Ohne Stability-Key läuft alles mit dem Katalog (Rotation, keine Wiederholungen).
   Schlüssel werden versiegelt gespeichert (seal aus mkt-posts.js), nie ans Cockpit gegeben, nie geloggt, nie in den Nachweis geschrieben.
   Eingebunden von mkt-posts.js (Routen /admin/api/mkt/music…, Post-Aktionen music*). Spätere Quellen (ElevenLabs, Lyria, ccMixter,
   Instagram Audio API, Epidemic) docken an ENGINES/LICENSES/SOURCES an – in dieser Runde bewusst nicht aktiv. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { spawn } = require("child_process");

const AV = 1;                 // Analyse-Version (a.v): höher setzen, wenn sich die Analyse ändert → Wochenjob rechnet nach
const USD_EUR = 0.86;         // wie ki.js (fixer Kurs, im Cockpit so beschriftet)
const TARGET = -14;           // LUFS im fertigen Reel
const MAX_STORE = 60;         // Sekunden je gespeichertem Titel (längere Quellen: bestes Fenster)

// ───────────── Vokabular ─────────────
const MOODS = ["froehlich", "lustig", "elegant", "ruhig", "episch", "alpin", "elektronisch"];
const MOOD_DE = { froehlich: "fröhlich", lustig: "lustig", elegant: "elegant", ruhig: "ruhig", episch: "episch", alpin: "alpin/volkstümlich", elektronisch: "elektronisch" };
const MOOD_NEAR = { froehlich: ["lustig", "alpin"], lustig: ["froehlich"], elegant: ["ruhig", "elektronisch"], ruhig: ["elegant"], episch: ["elektronisch"], alpin: ["froehlich"], elektronisch: ["episch", "elegant"] };
const MOOD_WORDS = { froehlich: "happy, sunny, feel-good", lustig: "playful, quirky, cheeky", elegant: "elegant, stylish, warm", ruhig: "calm, peaceful, warm", episch: "epic, heroic, powerful", alpin: "alpine, festive, oompah, party", elektronisch: "modern, sleek, upbeat electronic" };
const ENERGY_WORDS = ["", "very calm, soft, sparse", "calm, gentle", "upbeat, positive", "energetic, driving, punchy", "high energy, powerful, euphoric"];
const TEMPI = ["langsam", "mittel", "schnell"];
const GENRES = ["acoustic pop", "funk pop", "indie folk", "quirky pop", "swing pop", "nu disco", "lounge house", "cinematic pop", "jazzy piano", "cinematic acoustic", "ambient folk", "neo classical",
  "epic hybrid orchestral", "electronic action", "trailer rock", "apres ski party", "polka pop", "folk rock", "corporate electronic", "tech house light", "minimal pop", "future bass", "lo-fi house", "synth pop", "chill hip hop", "christmas pop"];
const INSTRUMENTS = ["ukulele", "acoustic guitar", "electric guitar", "piano", "felt piano", "rhodes", "strings", "pizzicato strings", "brass", "tuba", "accordion", "fiddle", "marimba", "glockenspiel", "whistle",
  "claps", "stomps", "big drums", "four on the floor", "synth plucks", "synth bass", "pads", "bells", "bass guitar", "upright bass"];
// Hauptwort für Titelnamen von KI-Titeln (ohne Markennamen)
const GENRE_NOUN = { "acoustic pop": "Pop", "funk pop": "Groove", "indie folk": "Folk", "quirky pop": "Caper", "swing pop": "Swing", "nu disco": "Disco", "lounge house": "Lounge", "cinematic pop": "Theme",
  "jazzy piano": "Keys", "cinematic acoustic": "Journey", "ambient folk": "Air", "neo classical": "Etude", "epic hybrid orchestral": "Anthem", "electronic action": "Rush", "trailer rock": "Charge",
  "apres ski party": "Party", "polka pop": "Polka", "folk rock": "Stomp", "corporate electronic": "Pulse", "tech house light": "House", "minimal pop": "Minimal", "future bass": "Wave", "lo-fi house": "Lo-Fi",
  "synth pop": "Synth", "chill hip hop": "Beat", "christmas pop": "Holiday" };

// ───────────── Musikprofile je Marke (Standard; Simon passt sie in Kanäle › Extras an → state.brands[key].music) ─────────────
const PROFILES = {
  kochdu: { mood: "froehlich", moods: ["froehlich", "lustig"], genres: ["acoustic pop", "funk pop", "indie folk"], instruments: ["ukulele", "claps", "whistle", "bass guitar", "marimba", "brass"], energy: [3, 4], bpm: [100, 124], vocals: false, avoid: ["episch", "epic hybrid orchestral", "trailer rock", "electronic action", "dark"] },
  kantineur: { mood: "lustig", moods: ["lustig", "froehlich"], genres: ["quirky pop", "swing pop", "funk pop"], instruments: ["pizzicato strings", "marimba", "glockenspiel", "upright bass", "claps"], energy: [3, 4], bpm: [105, 128], vocals: false, avoid: ["trailer rock", "electronic action", "sad", "aggressive", "melancholic"] },
  blitzdings: { mood: "elegant", moods: ["elegant", "elektronisch"], genres: ["nu disco", "lounge house", "cinematic pop", "jazzy piano"], instruments: ["piano", "strings", "synth plucks", "four on the floor", "rhodes"], energy: [2, 4], bpm: [96, 122], vocals: false, avoid: ["alpin", "polka pop", "apres ski party", "folk rock", "electronic action"] },
  valuero: { mood: "ruhig", moods: ["ruhig", "elegant"], genres: ["cinematic acoustic", "ambient folk", "neo classical"], instruments: ["acoustic guitar", "felt piano", "strings", "pads", "bells"], energy: [1, 3], bpm: [70, 100], vocals: false, avoid: ["tech house light", "future bass", "electronic action", "trailer rock", "apres ski party", "big drums"] },
  skikaiser: { mood: "episch", moods: ["episch", "elektronisch"], genres: ["epic hybrid orchestral", "electronic action", "trailer rock"], instruments: ["big drums", "strings", "synth bass", "brass", "electric guitar"], energy: [4, 5], bpm: [120, 150], vocals: false, avoid: ["lounge house", "jazzy piano", "ambient folk", "ruhig"] },
  huettengaudi: { mood: "alpin", moods: ["alpin", "froehlich"], genres: ["apres ski party", "polka pop", "folk rock"], instruments: ["accordion", "brass", "tuba", "stomps", "claps", "fiddle", "four on the floor"], energy: [4, 5], bpm: [118, 140], vocals: false, avoid: ["banjo", "country", "sad", "ruhig"] },
  druckshop: { mood: "elektronisch", moods: ["elektronisch", "froehlich"], genres: ["corporate electronic", "tech house light", "minimal pop"], instruments: ["synth plucks", "synth bass", "claps", "four on the floor"], energy: [3, 4], bpm: [105, 125], vocals: false, avoid: ["episch", "epic hybrid orchestral", "trailer rock"] },
  "fs-creative": { mood: "elektronisch", moods: ["elektronisch", "elegant"], genres: ["future bass", "lo-fi house", "synth pop", "chill hip hop"], instruments: ["rhodes", "pads", "synth plucks", "big drums"], energy: [2, 4], bpm: [85, 118], vocals: false, avoid: ["alpin", "polka pop", "apres ski party", "christmas pop"] },
};
const DEF_PROFILE = { mood: "froehlich", moods: ["froehlich"], genres: ["acoustic pop"], instruments: ["acoustic guitar", "claps"], energy: [2, 4], bpm: [90, 125], vocals: false, avoid: [] };

// ───────────── Lizenz-Register (6.1) ─────────────
const CAPTION_PF = ["instagram", "facebook", "threads", "youtube", "linkedin", "bluesky", "pinterest"];   // TikTok-Entwurf trägt keine Caption
const LICENSES = {
  cc0: { label: "CC0", text: "CC0 1.0 (Public Domain)", url: "https://creativecommons.org/publicdomain/zero/1.0/legalcode", allowed: true, attribution: false, platforms: "all", contentId: "unbekannt", upload: true },
  "stability-api": { label: "KI · Stability", text: "Stability AI Terms of Service (gültig ab 30.09.2026) – Output gehört dem Nutzer (Abs. 4(a)), Community License bis 1 Mio. USD Jahresumsatz", url: "https://stability.ai/terms-of-service", allowed: true, attribution: false, platforms: "all", contentId: "frei", ai: true },
  "elevenlabs-paid": { label: "KI · ElevenLabs", text: "ElevenLabs Music Terms (09.10.2026), Paid-Plan", url: "https://elevenlabs.io/music-terms", allowed: false, later: true, attribution: false, platforms: "all", contentId: "frei", ai: true },   // erst nach schriftlicher Klärung (Plan 2.3)
  "lyria-api": { label: "KI · Lyria", text: "Gemini API Terms (28.04.2026), SynthID", url: "https://ai.google.dev/gemini-api/terms", allowed: false, later: true, attribution: false, platforms: "all", contentId: "frei", ai: true },
  pixabay: { label: "Pixabay", text: "Pixabay Content License (ohne Content-ID-Schild geprüft)", url: "https://pixabay.com/service/license-summary/", allowed: true, attribution: false, platforms: "all", contentId: "geprueft-frei", upload: true },
  own: { label: "eigene", text: "Eigene Komposition", allowed: true, attribution: false, platforms: "all", contentId: "frei", upload: true },
  envato: { label: "Envato", text: "Envato-Lizenz (Projekt …)", allowed: true, attribution: false, platforms: "all", contentId: "unbekannt", upload: true, note: "YouTube: Envato-Musik braucht ggf. eine Kanal-Freigabe (nicht geprüft)" },
  "cc-by-4.0": { label: "CC BY 4.0", text: "Creative Commons Namensnennung 4.0 (bearbeitet)", url: "https://creativecommons.org/licenses/by/4.0/", ver: "4.0", allowed: true, attribution: true, platforms: CAPTION_PF, contentId: "unbekannt", upload: true },
  "cc-by-3.0": { label: "CC BY 3.0", text: "Creative Commons Namensnennung 3.0 (bearbeitet)", url: "https://creativecommons.org/licenses/by/3.0/", ver: "3.0", allowed: true, attribution: true, platforms: CAPTION_PF, contentId: "unbekannt", upload: true },
  "meta-only": { label: "nur Instagram/Facebook", text: "Sonstige Lizenz – nur Instagram/Facebook (z. B. Meta Sound Collection)", allowed: true, attribution: false, platforms: ["instagram", "facebook"], contentId: "unbekannt", upload: true },
  "own-legacy": { label: "eigene (alt)", text: "eigene Datei (vor 10/2026 hochgeladen – Lizenz bitte bestätigen)", allowed: true, attribution: false, platforms: "all", contentId: "unbekannt" },
};
const LIC_BLOCKED = /^(cc-by-(sa|nc|nd)|unbekannt|unknown)/;   // NC, ND, SA und Unbekanntes: gesperrt
const CID_BAD = ["registriert", "claim"];
const SRC_LABEL = { seed: "CC0", stability: "KI · Stability", elevenlabs: "KI · ElevenLabs", lyria: "KI · Lyria", upload: "eigene", envato: "Envato", ccmixter: "ccMixter", pixabay: "Pixabay" };
const AI_SOURCES = ["stability", "elevenlabs", "lyria"];
// Engines: nur Stability aktiv; weitere Adapter (elevenlabs, lyria) später hier eintragen
const ENGINES = { stability: { label: "Stability AI Stable Audio 3.0", costUsd: 0.08 } };

// ───────────── Stability AI (Doku am 28.10.2026 gelesen, Plan 2.2) ─────────────
const STAB = {
  base: "https://api.stability.ai", ep3: "/v2beta/audio/stable-audio/text-to-audio", model3: "stable-audio-3", ep25: "/v2beta/audio/stable-audio-2/text-to-audio", model25: "stable-audio-2.5",
  results: "/v2beta/audio/results/", balance: "/v1/user/balance", costUsd: 0.08, duration: 30, steps: 8, terms: "Stability AI ToS gültig ab 30.09.2026",
};

// ───────────── reine Hilfen (auch für Tests) ─────────────
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100, r3 = x => Math.round(x * 1000) / 1000;
const hashNum = s => parseInt(crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 8), 16);
const uniq = a => Array.from(new Set(a));
function jaccard(a, b) { a = uniq(a || []); b = uniq(b || []); if (!a.length || !b.length) return 0; const B = new Set(b); const i = a.filter(x => B.has(x)).length; return i / (a.length + b.length - i); }
const vocab = (list, V) => uniq((Array.isArray(list) ? list : String(list || "").split(/[,;]/)).map(x => String(x || "").toLowerCase().trim().replace(/\s+/g, " ")).filter(x => V.indexOf(x) > -1));
const viennaDay = ms => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const monthKey = ms => viennaDay(ms || Date.now()).slice(0, 7);
function isoWeek(ms) { const d = new Date(viennaDay(ms) + "T00:00:00Z"), day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); const w1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); return d.getUTCFullYear() + "-W" + String(Math.round(((d - w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7 + 1)).padStart(2, "0"); }

// Lautheitskurve (ebur128 „M“ alle 100 ms, 400-ms-Blöcke mit 75 % Überlappung) kompakt: 1 Byte je Wert, 0,5 LU Auflösung
function mcEncode(M) { return Buffer.from(M.map(v => v <= -80 ? 0 : Math.min(255, Math.round((v + 80) * 2)))).toString("base64"); }
function mcDecode(s) { if (Array.isArray(s)) return s; const b = Buffer.from(String(s || ""), "base64"); const out = new Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b[i] === 0 ? -120 : b[i] / 2 - 80; return out; }
/* Lautheit eines Fensters [off, off+T] aus der M-Kurve: energetisches Mittel der Blöcke im Fenster mit absolutem (−70) und relativem (−10 LU)
   Gate wie BS.1770 – Näherung ±1 LU gegen einen echten ebur128-Lauf. Fenster über das Ende hinaus (Loop) läuft am Anfang weiter. */
function winLufs(mc, off, T) {
  const M = mcDecode(mc), n = M.length; if (!n) return null;
  const vals = [], step = 0.1, first = Math.round((off + 0.4) / step) - 1, last = Math.round((off + Math.max(T, 0.4)) / step) - 1;
  for (let i = first; i <= last; i++) { const v = M[((i % n) + n) % n]; if (v > -70) vals.push(Math.pow(10, v / 10)); }
  if (!vals.length) return null;
  const rel = 10 * Math.log10(vals.reduce((a, b) => a + b, 0) / vals.length) - 10, kept = vals.filter(e => 10 * Math.log10(e) > rel);
  return r2(10 * Math.log10(kept.reduce((a, b) => a + b, 0) / kept.length));
}
// ebur128-Ausgabe (stderr) lesen: M-Kurve, Integrated, LRA, True Peak, Dauer
function parseEbur(txt) {
  const M = [], re = /\bt:\s*([\d.]+)\s+TARGET:\S+\s+LUFS\s+M:\s*(\S+)/g; let m;
  while ((m = re.exec(txt))) { const v = parseFloat(m[2]); M.push(isFinite(v) ? v : -120); }
  const sum = txt.slice(txt.lastIndexOf("Summary:")), g = r => { const x = sum.match(r); return x ? parseFloat(x[1]) : null; };
  const du = txt.match(/Duration:\s*(\d+):(\d+):([\d.]+)/), dur = du ? +du[1] * 3600 + +du[2] * 60 + +du[3] : M.length / 10;
  const tp = g(/Peak:\s*(-?[\d.]+|-inf)\s*dBFS/);
  return { M, lufs: g(/I:\s*(-?[\d.]+)\s*LUFS/), lra: g(/LRA:\s*([\d.]+)\s*LU/), tp: tp == null || !isFinite(tp) ? -120 : tp, dur };
}
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const h = i + k + len / 2, vr = re[h] * cr - im[h] * ci, vi = re[h] * ci + im[h] * cr; re[h] = re[i + k] - vr; im[h] = im[i + k] - vi; re[i + k] += vr; im[i + k] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
/* Signal-Auswertung (mono 22,05 kHz): spektraler Fluss → Onset-Kurve → Tempo per Autokorrelation 70–170 BPM (wie MO.tempo) + Konfidenz
   (1 − Median/Bestwert), Phase des ersten Schlags, Onset-Dichte, Helligkeit (Spektralschwerpunkt), RMS je 50 ms, Clipping-Anteil */
function signal(x, SR) {
  SR = SR || 22050; const N = 1024, HOP = 256, frames = Math.max(0, Math.floor((x.length - N) / HOP)), fps = SR / HOP;
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  let prev = new Float32Array(N / 2), cur = new Float32Array(N / 2); const flux = new Float32Array(frames), cent = new Float32Array(frames), re = new Float32Array(N), im = new Float32Array(N);
  for (let f = 0; f < frames; f++) { for (let i = 0; i < N; i++) { re[i] = x[f * HOP + i] * win[i]; im[i] = 0; } fft(re, im);
    let s = 0, cs = 0, ms = 0; for (let k = 1; k < N / 2; k++) { const mg = Math.hypot(re[k], im[k]); cur[k] = Math.log(1 + 100 * mg); const d = cur[k] - prev[k]; if (d > 0) s += d; cs += k * mg; ms += mg; }
    const t = prev; prev = cur; cur = t; flux[f] = s; cent[f] = ms > 1e-4 ? cs / ms / (N / 2) : 0; }
  // RMS je 50 ms (dBFS) und Clipping
  const H50 = Math.round(SR * 0.05), nr = Math.floor(x.length / H50), rms = new Float32Array(nr); let clip = 0;
  for (let j = 0; j < nr; j++) { let s = 0; for (let i = j * H50; i < (j + 1) * H50; i++) { const v = x[i]; s += v * v; if (v >= 0.999 || v <= -0.999) clip++; } rms[j] = 10 * Math.log10(s / H50 + 1e-12); }
  // Onset-Kurve (Fluss minus gleitendes Mittel)
  const on = new Float32Array(frames); for (let i = 0; i < frames; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - 20); k < Math.min(frames, i + 20); k++) { s += flux[k]; c++; } on[i] = Math.max(0, flux[i] - s / c); }
  const val = t => { const i = Math.floor(t), f = t - i; return (on[i] || 0) * (1 - f) + (on[i + 1] || 0) * f; };
  const score = bpm => { const lag = fps * 60 / bpm; let s = 0; for (let i = 0; i + 4 * lag < frames; i++) s += on[i] * (val(i + lag) + val(i + 2 * lag) * 0.6 + val(i + 4 * lag) * 0.4); return s; };
  let best = 0, bb = 0; const all = [];
  if (frames > 4 * fps) for (let bpm = 70; bpm <= 170; bpm += 0.5) { const s = score(bpm) * Math.exp(-Math.pow(Math.log2(bpm / 112), 2) / 0.6); all.push(s); if (s > best) { best = s; bb = bpm; } }
  let b2 = bb, s2 = 0; if (best > 0) for (let bpm = bb - 0.5; bpm <= bb + 0.5; bpm += 0.02) { const s = score(bpm); if (s > s2) { s2 = s; b2 = bpm; } }
  const med = all.length ? all.slice().sort((a, b) => a - b)[Math.floor(all.length / 2)] : 0, conf = best > 0 ? clamp(1 - med / best, 0, 1) : 0;
  let bp = 0; if (best > 0) { const per = fps * 60 / b2; let bs = -1; for (let ph = 0; ph < per; ph += 0.25) { let s = 0; for (let t = ph; t < frames; t += per) s += val(t); if (s > bs) { bs = s; bp = ph; } } }
  const bpm = best > 0 ? (Math.abs(b2 - Math.round(b2)) < 0.25 ? Math.round(b2) : r2(b2)) : 0, bl = bpm ? 60 / bpm : 0;
  let b0 = (bp * HOP + N / 2) / SR; if (bl) { b0 = b0 % bl; if (bl - b0 < 0.03) b0 = 0; } b0 = r3(b0);   // erster Schlag innerhalb der ersten Schlaglänge
  // Onset-Dichte: lokale Spitzen (±4 Bilder) über Mittel + 1,5 σ
  let mean = 0, sd = 0, mx = 0; for (let i = 0; i < frames; i++) { mean += on[i]; mx = Math.max(mx, on[i]); } mean /= Math.max(1, frames); for (let i = 0; i < frames; i++) sd += (on[i] - mean) * (on[i] - mean); sd = Math.sqrt(sd / Math.max(1, frames));
  const thr = Math.max(mean + 1.5 * sd, mx * 0.08); let peaks = 0, lastP = -99;
  for (let i = 4; i < frames - 4; i++) { if (on[i] < thr || i - lastP < 9) continue; let ok = true; for (let k = i - 4; k <= i + 4; k++) if (on[k] > on[i]) { ok = false; break; } if (ok) { peaks++; lastP = i; } }
  let bs = 0, bc = 0; for (let f = 0; f < frames; f++) { const j = Math.floor(f * HOP / H50); if (rms[j] > -45) { bs += cent[f]; bc++; } }
  return { bpm: bpm >= 70 && bpm <= 170 ? bpm : 0, beat0: b0 < 0.05 ? 0 : b0, conf: r2(conf), onsetRate: r2(peaks / Math.max(1, x.length / SR)), bright: r3(bc ? bs / bc : 0), clip: x.length ? clip / x.length : 0, rms, hop: 0.05 };
}
/* Aus Lautheit (ebur128) + Signal: Stille, Abschnitte, Drops, Höhepunkte, Energie 1–5, Stimmungsvorschlag → Analyse-Objekt a */
function features(eb, sg) {
  const dur = eb.dur || sg.rms.length * 0.05, rms = sg.rms, n = rms.length, H = 0.05, loud = i => rms[i] > -45;
  let intro = 0; for (let i = 0; i < n - 6; i++) { let ok = true; for (let k = i; k < i + 6; k++) if (!loud(k)) { ok = false; break; } if (ok) { intro = i * H; break; } }
  let outro = Math.min(dur, n * H); for (let j = n - 1; j >= 6; j--) { let ok = true; for (let k = j - 5; k <= j; k++) if (!loud(k)) { ok = false; break; } if (ok) { outro = Math.min(dur, (j + 1) * H); break; } }
  const E = (a, b) => { let s = 0, c = 0; for (let i = Math.max(0, Math.floor(a / H)); i < Math.min(n, Math.ceil(b / H)); i++) { s += Math.pow(10, rms[i] / 10); c++; } return c ? 10 * Math.log10(s / c + 1e-12) : -120; };
  const conf = sg.conf, bpm = conf >= 0.35 ? sg.bpm : 0, beat = bpm ? 60 / bpm : 0, bar = bpm ? 4 * beat : 2, b0 = bpm ? sg.beat0 : intro;
  const starts = []; for (let s = b0; s < outro - 0.5; s += bar) if (s >= 0) starts.push(r3(s));
  // Abschnitte: Energiesprung zwischen den Takten davor und danach (bis 4 Takte), Spitzen ≥ 2,5 dB, mind. 4 Takte Abstand; Drop = Sprung ≥ 4 dB nach oben
  const bE = starts.map(s => E(s, s + bar)), cand = [];
  for (let k = 1; k < bE.length; k++) { const w = Math.min(4, k, bE.length - k); if (w < 1) continue; let b = 0, a = 0; for (let i = 1; i <= w; i++) { b += bE[k - i]; a += bE[k + i - 1]; } cand.push({ k, d: a / w - b / w }); }
  const bounds = []; cand.slice().sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).forEach(c => { if (Math.abs(c.d) >= 2.5 && !bounds.some(b => Math.abs(b.k - c.k) < 4)) bounds.push(c); });
  bounds.sort((x, y) => x.k - y.k);
  const sections = [r3(starts.find(s => s >= intro - 0.02) || 0)].concat(bounds.map(b => starts[b.k])).filter((v, i, a) => a.indexOf(v) === i);
  const drops = bounds.filter(b => b.d >= 4).map(b => starts[b.k]);
  // Höhepunkte: Taktanfänge nach dem Intro, an denen ein 12-s-Fenster am lautesten ist (aus der M-Kurve), höchstens 4, mind. 8 s Abstand
  const L = Math.max(4, Math.min(12, outro - intro)), hc = [];
  starts.forEach(s => { if (s < intro - 0.02 || s + L > outro + 0.05) return; const l = winLufs(eb.M, s, L); if (l != null) hc.push({ off: s, lufs12: l, rise: r1(E(s, s + 1) - E(s - 1, s)) }); });
  const hot = []; hc.sort((a, b) => b.lufs12 - a.lufs12).forEach(h => { if (hot.length < 4 && !hot.some(x => Math.abs(x.off - h.off) < 8)) hot.push(h); });
  hot.sort((a, b) => a.off - b.off);
  // Energie 1–5: Onset-Dichte, Tempo, Helligkeit, geringe Dynamik (am Grundstock kalibriert, siehe test/musik.test.js)
  const nz = (v, a, b) => clamp((v - a) / (b - a), 0, 1), bpmE = bpm || 100;
  const ex = 0.42 * nz(sg.onsetRate, 0.8, 4.2) + 0.3 * nz(bpmE, 80, 140) + 0.18 * nz(sg.bright, 0.06, 0.2) + 0.1 * nz(-(eb.lra || 6), -14, -3);
  const energy = clamp(1 + Math.round(ex * 4), 1, 5);
  const mood = energy <= 2 ? (sg.bright >= 0.12 ? "elegant" : "ruhig") : energy === 3 ? (sg.bright >= 0.13 ? "froehlich" : "elegant") : (sg.bright < 0.1 && bpmE >= 110 ? "episch" : sg.bright >= 0.15 ? "froehlich" : "elektronisch");
  return { v: AV, dur: r2(dur), lufs: eb.lufs == null ? null : r1(eb.lufs), tp: r1(eb.tp), lra: eb.lra == null ? null : r1(eb.lra), bpm, beat0: bpm ? sg.beat0 : 0, bpmRaw: sg.bpm, bpmConf: conf,
    introEnd: r2(intro), outroStart: r2(outro), sections, hot, drops, mc: mcEncode(eb.M), bright: sg.bright, onsetRate: sg.onsetRate, clip: Math.round(sg.clip * 1e5) / 1e5, energy, moodGuess: mood };
}
/* Qualitätsfilter (3.4): hart für KI-Titel und Uploads; Grundstock ist bekannt gut (nur Hinweise) */
function quality(a, o) {
  o = o || {}; const r = [], warn = [];
  if (!a || !a.dur) return { ok: false, reasons: ["kein Ton gefunden"] };
  const music = (a.outroStart || a.dur) - (a.introEnd || 0);
  if (music < 20) r.push("zu kurz (" + r1(music) + " s Musik, mindestens 20 s)");
  if (a.dur > 900) r.push("zu lang (über 15 Minuten)");
  if (o.ordered && (o.srcDur || a.dur) < 0.9 * o.ordered) r.push("kürzer als bestellt (" + r1(o.srcDur || a.dur) + " von " + o.ordered + " s)");
  if (a.lufs == null || a.lufs < -30 || a.lufs > -6) r.push("Lautheit " + (a.lufs == null ? "?" : a.lufs) + " LUFS außerhalb −30 … −6");
  else if (TARGET - a.lufs > 12) r.push("zu leise bzw. rauschig (bräuchte mehr als +12 dB)");
  if (a.tp >= 1) (o.ai ? r : warn).push("True Peak " + a.tp + " dBTP (über +1)");
  if (a.clip >= 0.001) r.push("übersteuert (" + r2(a.clip * 100) + " % Clipping)");
  if (o.ai && a.introEnd > 3) r.push("Intro-Stille " + a.introEnd + " s");
  if (o.ai && !a.bpm) warn.push("Takt nicht sicher erkannt");
  if (o.ai && o.wantBpm && a.bpm && Math.abs(a.bpm - o.wantBpm) / o.wantBpm > 0.15) warn.push("Tempo " + a.bpm + " statt " + o.wantBpm + " BPM");
  return { ok: !r.length, reasons: r, warn };
}
function licOf(key) { key = String(key || ""); if (LIC_BLOCKED.test(key)) return null; const L = LICENSES[key]; return L && L.allowed ? L : null; }
// Lizenz eines Titels für alle Zielplattformen geeignet? → "" wenn ok, sonst Grund
function licenseProblem(t, platforms) {
  if (!t) return ""; const lk = (t.license || {}).key, L = licOf(lk);
  if (!L) return "Lizenz „" + (lk || "unbekannt") + "“ ist gesperrt";
  if (CID_BAD.indexOf((t.license || {}).contentId) > -1) return "Content-ID: " + t.license.contentId;
  const bad = (platforms || []).filter(pf => L.platforms !== "all" && L.platforms.indexOf(pf) < 0);
  return bad.length ? L.label + " ist für " + bad.join(", ") + " nicht freigegeben" + (L.attribution && bad.indexOf("tiktok") > -1 ? " (TikTok-Entwurf kann keine Namensnennung tragen)" : "") : "";
}
// Namensnennung (nur CC BY): lang für Instagram/Facebook/LinkedIn/YouTube/Pinterest, kurz für Threads/Bluesky
function creditText(t, short) {
  const lic = t && t.license || {}, L = LICENSES[lic.key]; if (!L || !L.attribution) return "";
  const title = t.title || t.name || "", artist = lic.artist || "unbekannt", url = lic.sourceUrl || "", host = (url.match(/^https?:\/\/(?:www\.)?([^/]+)/) || [])[1] || "";
  if (short) return "Musik: „" + title + "“ – " + artist + ", CC BY " + L.ver + (url ? ", " + (host || url) : "");
  return "Musik: „" + title + "“ von " + artist + (host ? " (" + host + ")" : "") + ", Lizenz CC BY " + L.ver + " – creativecommons.org/licenses/by/" + L.ver + "/ – bearbeitet." + (url ? " " + url : "");
}
// Caption mit Credit: Credit zuerst reservieren (wird nie gekürzt), steht vor den Hashtags
function withCredit(txt, tagStr, max, credit, cut) {
  const tail = (credit ? "\n\n" + credit : "") + (tagStr ? "\n\n" + tagStr : ""), room = max - tail.length;
  return (cut(txt, Math.max(40, room)) + tail).trim();
}
// englischer, deterministischer Prompt (nur [a-z0-9 ,-], ≤ 400 Zeichen, Blockliste: Namen, Orte, „in the style of“, „like“, „feat“, „cover“, „remix“)
const BLOCK_WORDS = ["in the style of", "style of", "inspired by", "sounds like", "like", "feat", "featuring", "ft", "cover", "remix", "by"];
const ascii = w => String(w || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9 ,\-]/g, " ");
function cleanVibe(v, names) {
  let s = " " + ascii(v).replace(/\s*,\s*/g, " , ").replace(/\s+/g, " ") + " ";
  // „like …“, „by …“, „in the style of …“, „feat …“: die folgenden Wörter (bis zum Komma) sind meist Künstler-/Songnamen → mit weg
  BLOCK_WORDS.forEach(w => { s = s.replace(new RegExp("(^| )" + w + "( [a-z0-9\\-]+)*(?= ,| $)", "g"), "$1").replace(/ +/g, " "); });
  BLOCK_WORDS.concat((names || []).map(ascii)).map(w => w.replace(/[^a-z0-9 \-]/g, " ").replace(/\s+/g, " ").trim()).filter(w => w.length >= 2)
    .forEach(w => { const re = new RegExp("(^| )" + w.replace(/[-]/g, "\\-") + "(?= )", "g"); s = s.replace(re, "$1"); });
  return s.replace(/\s+/g, " ").replace(/( ,)+/g, " ,").replace(/^[ ,]+|[ ,]+$/g, "").replace(/ ,/g, ",").split(" ").filter(Boolean).slice(0, 8).join(" ").replace(/,$/, "");
}
function buildPrompt(job, names) {
  const g = job.genres.length ? job.genres.join(", ") : "instrumental pop", ins = job.instruments, vibe = job.vibe ? cleanVibe(job.vibe, names) : "";
  const lead = ins.length ? ins[0] + " lead" + (ins.length > 1 ? " with " + ins.slice(1, 3).join(" and ") : "") : "";
  const parts = { g, vibe, mood: MOOD_WORDS[job.mood] || "", lead, bpm: job.bpm ? job.bpm + " BPM" : "", energy: ENERGY_WORDS[job.energy] || "", inst: "instrumental, no vocals, no singing",
    style: "starts right away with the main groove, strong hook, steady rhythm, polished modern mix", extra: job.extra || "", use: "background music for a short social media video", season: job.season || "" };
  const order = ["g", "vibe", "mood", "lead", "bpm", "energy", "inst", "style", "extra", "use", "season"], drop = ["season", "extra", "vibe", "lead"];
  const make = () => order.map(k => parts[k]).filter(Boolean).join(", ").toLowerCase().replace(/[^a-z0-9 ,\-]/g, " ").replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
  let p = make(); for (let i = 0; i < drop.length && p.length > 400; i++) { parts[drop[i]] = ""; p = make(); }
  return p.length > 400 ? p.slice(0, 400).replace(/,[^,]*$/, "") : p;
}

module.exports = function (C) {
  const F = C.fetch || ((...a) => fetch(...a)), log = C.log || ((...a) => console.error(...a));
  const S = () => { const s = C.S(); s.mkt = s.mkt || {}; s.posts = Array.isArray(s.posts) ? s.posts : []; s.brands = s.brands || {}; return s; };
  const save = now => { try { C.save(now); } catch (e) {} };
  const nowIso = C.nowIso || (() => new Date().toISOString());
  const clip = C.clip || ((v, n) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, n));
  const fail = C.fail || ((status, msg) => Object.assign(new Error(msg), { status }));
  const rand = () => crypto.randomBytes(8).toString("hex");
  const pollMs = C.pollMs != null ? C.pollMs : 2000, timeoutMs = C.timeoutMs || 120000, backoffMs = C.backoffMs != null ? C.backoffMs : 5000;
  const MDIR = path.join(C.DIR, "music"), AIDIR = path.join(MDIR, "ai"), CATF = path.join(MDIR, "catalog.json"), PROOF = path.join(MDIR, "proof.jsonl");
  const WORK = C.WORK || path.join(C.DIR, "work"), PREV = path.join(WORK, "music-prev"), SEEDDIR = path.join(C.ROOT || __dirname, "mkt-assets", "music");
  try { fs.mkdirSync(AIDIR, { recursive: true }); } catch (e) {}

  // ───────────── ffmpeg (niedrige Priorität, damit Shop und Cockpit nicht leiden) ─────────────
  const bin = () => (C.R && C.R.FFMPEG ? C.R.FFMPEG() : process.env.FFMPEG_BIN || "");
  function ffrun(args, o) {
    o = o || {};
    return new Promise((resolve, reject) => {
      const b = bin(); if (!b) return reject(new Error("ffmpeg fehlt"));
      const p = spawn(b, ["-hide_banner", "-nostats"].concat(args), { stdio: ["ignore", o.out ? "pipe" : "ignore", "pipe"] });
      try { if (o.low !== false && p.pid) os.setPriority(p.pid, 10); } catch (e) {}
      const out = []; let n = 0, err = "";
      if (o.out) p.stdout.on("data", d => { n += d.length; if (n <= (o.max || 64e6)) out.push(d); });
      p.stderr.on("data", d => { err += d; if (err.length > 6e6) err = err.slice(-6e6); });
      const to = setTimeout(() => { try { p.kill("SIGKILL"); } catch (e) {} }, o.timeout || 180000);
      p.on("error", e => { clearTimeout(to); reject(e); });
      p.on("close", code => { clearTimeout(to); if (code !== 0) return reject(new Error("ffmpeg: " + (err.trim().split("\n").slice(-2).join(" | ") || "Code " + code))); resolve({ out: Buffer.concat(out), err }); });
    });
  }
  // Analyse einer Datei: ebur128 (Lautheit, M-Kurve) + Dekodieren mono 22,05 kHz bis 120 s → features()
  async function analyse(file) {
    const t0 = Date.now();
    const eb = parseEbur((await ffrun(["-loglevel", "info", "-i", file, "-t", "900", "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"])).err);
    const raw = (await ffrun(["-loglevel", "error", "-i", file, "-t", "120", "-vn", "-ac", "1", "-ar", "22050", "-f", "f32le", "pipe:1"], { out: true })).out;
    const x = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
    const a = features(eb, signal(x, 22050)); a.ms = Date.now() - t0; return a;
  }
  // nacheinander, niedrige Priorität (Uploads, Envato, Nachberechnung)
  const AQ = []; let ABUSY = false;
  function queueAnalysis(id) { if (AQ.indexOf(id) < 0) AQ.push(id); if (!ABUSY) setImmediate(runAQ); }
  async function runAQ() {
    if (ABUSY) return; const id = AQ.shift(); if (!id) return; ABUSY = true;
    try { const t = byId(id); if (t && t.fileAbs && fs.existsSync(t.fileAbs)) { const a = await analyse(t.fileAbs), r = rec(id); r.a = slimA(a); const tg = r.tags = Object.assign({}, r.tags || {});
      if (!tg.energy) tg.energy = a.energy; if (!tg.mood) { tg.mood = a.moodGuess; tg.moodGuess = true; tg.moods = uniq([a.moodGuess].concat(tg.moods || [])); }
      r.q = t.seed ? { ok: true, seed: true } : quality(a, { upload: true }); saveCat(); } }
    catch (e) { log("musik: Analyse", id, String(e.message || e).slice(0, 160)); }
    ABUSY = false; if (AQ.length) setImmediate(runAQ);
  }
  const slimA = a => { const o = Object.assign({}, a); delete o.ms; return o; };

  // ───────────── Katalog (marketing/music/catalog.json, atomar geschrieben) ─────────────
  let CAT = null, CAT_MT = 0, SEED = null;
  function loadCat() {
    let mt = 0; try { mt = fs.statSync(CATF).mtimeMs; } catch (e) {}
    if (CAT && mt === CAT_MT) return CAT;
    let o = null; try { o = JSON.parse(fs.readFileSync(CATF, "utf8")); } catch (e) { o = null; }
    CAT = Object.assign({ v: 1, rev: 0, tracks: [], seed: {}, compose: {}, migrated: [] }, o || {}); CAT_MT = mt; return CAT;
  }
  function saveCat() { CAT.rev = (CAT.rev || 0) + 1; const tmp = CATF + "." + process.pid + ".tmp"; try { fs.writeFileSync(tmp, JSON.stringify(CAT)); fs.renameSync(tmp, CATF); CAT_MT = fs.statSync(CATF).mtimeMs; } catch (e) { log("musik: Katalog speichern", e.message); } }
  function seedRaw() { if (!SEED) { try { SEED = JSON.parse(fs.readFileSync(path.join(SEEDDIR, "index.json"), "utf8")); } catch (e) { SEED = []; } } return SEED; }
  function seedTrack(m, ov) {
    ov = ov || {}; const a = m.a ? Object.assign({}, m.a) : (m.bpm ? { v: 0, bpm: m.bpm, beat0: m.beat0 || 0, bpmConf: 0.6 } : null);
    const tags = Object.assign({ mood: m.mood, moods: m.moods || [m.mood], energy: m.energy || (a && a.energy) || 3, genres: m.genres || [], instruments: m.instruments || [], vocals: !!m.vocals, season: m.season || [], brands: m.brands || [], vibe: m.vibe || "", confirmed: !!m.confirmed }, ov.tags || {});
    return { id: "s-" + m.file, name: m.title, title: m.title, file: m.file, fileAbs: path.join(SEEDDIR, m.file), source: "seed", seed: true, addedAt: "2026-10-20", tags, a,
      license: { key: m.licKey || "cc0", text: m.license || LICENSES.cc0.text, url: LICENSES.cc0.url, attribution: "", artist: m.artist || "", sourceUrl: m.sourceUrl || "", contentId: ov.contentId || m.contentId || "unbekannt" },
      use: ov.use || { count: 0 }, rating: ov.rating || {}, hidden: !!ov.hidden, q: { ok: true, seed: true } };
  }
  // alte Uploads/Envato aus s.mkt.music (und Ausblendungen aus musicHidden) übernehmen – laufend, damit neue Envato-Importe auch ankommen
  function syncLegacy() {
    const st = S().mkt, list = Array.isArray(st.music) ? st.music : [], have = new Set(CAT.tracks.map(t => t.id)); let ch = false;
    list.forEach(m => { if (!m || !m.id || have.has(m.id)) return; const env = /envato/i.test(m.license || "");
      CAT.tracks.push({ id: m.id, name: clip(m.name, 80) || "Titel", file: m.file, source: env ? "envato" : "upload", addedAt: nowIso(), legacy: true,
        tags: { mood: MOODS.indexOf(m.mood) > -1 ? m.mood : "", moods: MOODS.indexOf(m.mood) > -1 ? [m.mood] : [], energy: 0, genres: [], instruments: [], vocals: false, season: [], brands: [], vibe: "" },
        a: m.bpm ? { v: 0, bpm: m.bpm, beat0: m.beat0 || 0, bpmConf: 0.5 } : null,
        license: { key: env ? "envato" : "own-legacy", text: m.license || (env ? "Envato" : "eigene Datei"), attribution: "", artist: "", sourceUrl: "", contentId: "unbekannt" }, use: { count: 0 }, rating: {}, hidden: false, q: null });
      ch = true; if (C.background !== false) queueAnalysis(m.id); });
    const hid = Array.isArray(st.musicHidden) ? st.musicHidden : [];
    if (hid.length) { hid.forEach(id => { if (/^s-/.test(id)) (CAT.seed[id] = CAT.seed[id] || {}).hidden = true; else { const t = CAT.tracks.find(x => x.id === id); if (t) t.hidden = true; } }); st.musicHidden = []; ch = true; save(); }
    if (ch) saveCat();
  }
  function all() {
    loadCat(); syncLegacy();
    const seeds = seedRaw().map(m => seedTrack(m, CAT.seed["s-" + m.file]));
    return seeds.concat(CAT.tracks.map(t => Object.assign({}, t, { title: t.title || t.name, fileAbs: path.join(MDIR, t.file), seed: false, use: t.use || { count: 0 }, rating: t.rating || {}, tags: Object.assign({ moods: [], genres: [], instruments: [], season: [], brands: [] }, t.tags || {}) })));
  }
  const byId = id => all().find(t => t.id === id) || null;
  // veränderbarer Datensatz: Grundstock → Overrides, sonst der Eintrag selbst
  function rec(id) { loadCat(); if (/^s-/.test(id)) return (CAT.seed[id] = CAT.seed[id] || {}); return CAT.tracks.find(t => t.id === id) || {}; }
  const isAi = t => AI_SOURCES.indexOf(t.source) > -1;
  const energyOf = t => +(t.tags && t.tags.energy) || +(t.a && t.a.energy) || 3;
  const syncedBpm = t => { const a = t && t.a; return a && a.bpm && (a.bpmConf == null || a.bpmConf >= 0.35) ? +a.bpm : 0; };
  const mainGenre = t => ((t && t.tags && t.tags.genres) || [])[0] || "";
  function publicTrack(t) {
    const L = LICENSES[t.license.key] || {};
    return { id: t.id, name: t.name, source: t.source, src: SRC_LABEL[t.source] || t.source, seed: !!t.seed, ai: isAi(t), mood: t.tags.mood || "", moods: t.tags.moods || [], energy: energyOf(t), genres: t.tags.genres || [], instruments: t.tags.instruments || [],
      vocals: !!t.tags.vocals, brands: t.tags.brands || [], vibe: t.tags.vibe || "", moodGuess: !!t.tags.moodGuess, confirmed: !!t.tags.confirmed, bpm: syncedBpm(t), dur: t.a && t.a.dur || 0, lufs: t.a && t.a.lufs,
      license: t.license.text || L.text || "", licKey: t.license.key, licLabel: L.label || t.license.key, credit: !!L.attribution, contentId: t.license.contentId || "", artist: t.license.artist || "", sourceUrl: t.license.sourceUrl || "",
      hidden: !!t.hidden, gone: !!t.gone, rating: t.rating || {}, use: { count: (t.use || {}).count || 0, last: (t.use || {}).last || "", lastBrand: (t.use || {}).lastBrand || "" }, addedAt: t.addedAt || "",
      q: t.q ? { ok: t.q.ok !== false, reasons: t.q.reasons || [] } : null, analysed: !!(t.a && t.a.v >= AV), forBrand: (t.tags.brands || [])[0] || "", composedFor: t.forPost || "" };
  }
  // kompatibel zur alten musicList() aus mkt-posts.js
  function list() { return all().filter(t => !t.hidden && !t.gone).map(t => ({ id: t.id, name: t.name, mood: t.tags.mood || "", license: t.license.text, source: t.source, bpm: syncedBpm(t), beat0: (t.a && t.a.beat0) || 0, file: t.fileAbs, seed: !!t.seed })); }

  // ───────────── Einstellungen, Schlüssel, Budget ─────────────
  function cfg() { const st = S().mkt; st.musicCfg = Object.assign({ engine: "auto", limitEur: 15, revenueOk: "", variants: 1, saver: false, weekly: 1, ytAi: true, cfgScale: 1, maxMb: 400, maxTracks: 600 }, st.musicCfg || {}); return st.musicCfg; }
  function stabilityKey() { const st = S().mkt, k = st.stability && C.unseal ? C.unseal(st.stability) : null; return (k && k.v) || process.env.STABILITY_API_KEY || ""; }
  function budget() { const st = S().mkt, m = monthKey(); if (!st.musicBudget || st.musicBudget.month !== m) { if (st.musicBudget && st.musicBudget.month) { st.musicBudgetHist = st.musicBudgetHist || {}; st.musicBudgetHist[st.musicBudget.month] = { usd: st.musicBudget.usd, count: st.musicBudget.count }; } st.musicBudget = { month: m, usd: 0, count: 0, weeklyUsd: 0 }; } return st.musicBudget; }
  const limitEur = () => Math.max(0, +cfg().limitEur || 0);
  function canSpend(usd, weekly) { const b = budget(), lim = limitEur(); if (!lim) return false; if ((b.usd + usd) * USD_EUR > lim + 1e-9) return false; if (weekly && ((b.weeklyUsd || 0) + usd) * USD_EUR > 0.4 * lim + 1e-9) return false; return true; }
  function spend(usd, weekly) { const b = budget(); b.usd = Math.round((b.usd + usd) * 10000) / 10000; b.count++; if (weekly) b.weeklyUsd = Math.round(((b.weeklyUsd || 0) + usd) * 10000) / 10000; save(true); }
  // Bereit zum Komponieren? → "" oder Grund (für Anzeige und Fallback-Hinweis)
  function composeBlock(weekly, force) {
    const c = cfg(); if (c.engine === "library" && !force) return "Musik-Engine steht auf „nur Bibliothek“";
    if (!stabilityKey()) return "kein Stability-Key"; if (!c.revenueOk) return "Umsatzgrenze (unter 1 Mio. USD) nicht bestätigt";
    if (!canSpend(STAB.costUsd, weekly)) return weekly ? "Wochen-Vorrat: 40 % des Monatslimits erreicht" : "Monatslimit erreicht"; return "";
  }
  function setWarn(msg) { const st = S().mkt; if ((st.musicWarn || "") !== msg) { st.musicWarn = msg; save(); } }

  // ───────────── Musikprofile und Musikwunsch ─────────────
  function profile(key) {
    const b = S().brands[key] || {}, d = PROFILES[key] || DEF_PROFILE, o = Object.assign({}, d, b.music || {});
    o.genres = vocab(o.genres, GENRES); if (!o.genres.length) o.genres = d.genres.slice(); o.instruments = vocab(o.instruments, INSTRUMENTS); if (!o.instruments.length) o.instruments = d.instruments.slice();
    o.mood = MOODS.indexOf(o.mood) > -1 ? o.mood : d.mood; o.moods = uniq([o.mood].concat((o.moods || []).filter(m => MOODS.indexOf(m) > -1)));
    const e = Array.isArray(o.energy) ? o.energy.map(Number) : d.energy, bp = Array.isArray(o.bpm) ? o.bpm.map(Number) : d.bpm;
    o.energy = [clamp(Math.min(e[0], e[1]) || 1, 1, 5), clamp(Math.max(e[0], e[1]) || 5, 1, 5)]; o.bpm = [clamp(Math.min(bp[0], bp[1]) || 70, 60, 180), clamp(Math.max(bp[0], bp[1]) || 140, 60, 180)];
    o.avoid = (Array.isArray(o.avoid) ? o.avoid : String(o.avoid || "").split(",")).map(x => String(x).toLowerCase().trim()).filter(Boolean); o.vocals = !!o.vocals; return o;
  }
  const brandNames = () => { const s = S(); const out = []; Object.keys(s.brands).forEach(k => { const b = s.brands[k] || {}; out.push(k.toLowerCase()); String(b.name || "").toLowerCase().split(/[^a-z0-9äöü]+/).forEach(w => { if (w.length >= 4) out.push(w); }); (b.locations || []).forEach(l => String(l.name || "").toLowerCase().split(/[^a-z0-9äöü]+/).forEach(w => { if (w.length >= 4) out.push(w); })); }); ["montafon", "vorarlberg", "gaschurn", "austria", "tirol", "schruns"].forEach(w => out.push(w)); return uniq(out); };
  // KI-Antwort (music) prüfen: nur Vokabular, Lücken aus dem Profil, vibe englisch ohne Namen → post.musicWant
  function cleanWant(key, x, mood) {
    const p = profile(key); x = x && typeof x === "object" ? x : {};
    const m = MOODS.indexOf(x.mood) > -1 ? x.mood : MOODS.indexOf(mood) > -1 ? mood : p.mood;
    const e = Math.round(+x.energy); const energy = e >= 1 && e <= 5 ? e : Math.round((p.energy[0] + p.energy[1]) / 2);
    let genres = vocab(x.genres, GENRES).slice(0, 2), instruments = vocab(x.instruments, INSTRUMENTS).slice(0, 3);
    const inP = genres.filter(g => p.genres.indexOf(g) > -1); if (inP.length) genres = inP.concat(genres.filter(g => inP.indexOf(g) < 0)).slice(0, 2); if (!genres.length) genres = p.genres.slice(0, 1);
    if (!instruments.length) instruments = p.instruments.slice(0, 3);
    return { mood: m, energy, tempo: TEMPI.indexOf(x.tempo) > -1 ? x.tempo : "", genres, instruments, vibe: cleanVibe(x.vibe, brandNames()), season: clip(String(x.season || "").toLowerCase().replace(/[^a-zäöü ]/g, ""), 30) };
  }
  function wantOf(post) {
    const p = profile(post.brand), w = post.musicWant || {};
    const mood = MOODS.indexOf(w.mood) > -1 ? w.mood : MOODS.indexOf(post.mood) > -1 ? post.mood : p.mood;
    const e = Math.round(+w.energy); return { mood, energy: e >= 1 && e <= 5 ? e : Math.round((p.energy[0] + p.energy[1]) / 2), tempo: TEMPI.indexOf(w.tempo) > -1 ? w.tempo : "",
      genres: vocab(w.genres, GENRES), instruments: vocab(w.instruments, INSTRUMENTS), vibe: w.vibe || "", season: w.season || "" };
  }
  const wantKey = w => [w.mood, w.energy, w.tempo, (w.genres || []).join("+"), (w.instruments || []).join("+"), w.vibe].join("|");
  // Schema-Teil und Prompt-Zeile für die Plan-KI (mkt-posts.js generate/rewrite)
  function schema() {
    const strs = { type: "array", items: { type: "string" } }, props = { mood: { type: "string", enum: MOODS }, energy: { type: "integer", enum: [1, 2, 3, 4, 5] }, tempo: { type: "string", enum: TEMPI }, genres: strs, instruments: strs, vibe: { type: "string" }, season: { type: "string" } };
    return { type: "object", additionalProperties: false, required: Object.keys(props), properties: props };
  }
  const promptLine = () => "music (nur bei reel, sonst Standard der Marke): Musik fürs Reel passend zu Idee, Erzählformat, Saison und <musikprofil> der Marke – mood (froehlich, lustig, elegant, ruhig, episch, alpin, elektronisch; dasselbe auch ins Feld mood), energy 1–5, tempo (langsam/mittel/schnell), genres und instruments NUR aus <musikprofil> (1–2 Genres, 2–3 Instrumente). Variiere gegenüber <musik-bisher>: nicht dasselbe Genre wie die letzten 2 Reels der Marke. vibe: 3–8 englische Wörter zur Stimmung des konkreten Posts (z. B. „crisp autumn morning, cozy“), KEINE Künstler-, Song-, Marken- oder Ortsnamen. Energie nach Erzählformat: Countdown/Top 3/Aktion 4–5, POV/Vorher-Nachher 3–4, Mythos vs. Fakt 3, Einblick/Region/Saison 2–3 – innerhalb des Energiebereichs der Marke. season: leer, „winter“, „weihnachten“, „sommer“ o. ä.";
  function promptBlocks(key) {
    const p = profile(key), hist = brandReels(key).slice(0, 5).map(x => ({ genre: x.genre || "", energy: x.energy || 0, bpm: x.bpm || 0 }));
    return "<musikprofil>" + JSON.stringify({ stimmung: p.mood, stimmungen: p.moods, genres: p.genres, instruments: p.instruments, energie: p.energy, bpm: p.bpm, meiden: p.avoid }) + "</musikprofil>\n<musik-bisher>" + (hist.length ? JSON.stringify(hist) : "(noch keine)") + "</musik-bisher>\n";
  }

  // ───────────── Verlauf (aus den Posts selbst, sortiert nach geplantem Termin) ─────────────
  const postTime = p => Date.parse(p.scheduledAt || "") || Date.parse(p.createdAt || "") || Date.now();
  function trackRef(p) { const md = p && p.media || {}; return (md.track && md.track.id && md.track) || (md.trackPending && md.trackPending.id && md.trackPending) || null; }
  function history(exceptId) { return S().posts.filter(p => p.id !== exceptId && p.format === "reel" && trackRef(p)).map(p => { const r = trackRef(p); return { id: r.id, brand: p.brand, t: postTime(p), post: p.id, genre: r.genre || "", energy: r.energy || 0, bpm: r.bpm || 0 }; }); }
  const brandReels = (key, t0) => history("").filter(h => h.brand === key && (t0 == null || h.t <= t0)).sort((a, b) => b.t - a.t);
  function lastUseText(t, hist, t0) { const h = hist.filter(x => x.id === t.id).sort((a, b) => Math.abs(a.t - t0) - Math.abs(b.t - t0))[0]; const last = h ? h.t : t.use && t.use.last ? Date.parse(t.use.last) : 0;
    if (!last) return ""; const d = Math.round((t0 - last) / 864e5), b = S().brands[h ? h.brand : (t.use || {}).lastBrand] || {}; return (d > 0 ? "lief vor " + d + (d === 1 ? " Tag" : " Tagen") : d < 0 ? "läuft in " + -d + (d === -1 ? " Tag" : " Tagen") : "läuft am selben Tag") + (b.name ? " bei " + b.name : ""); }

  // ───────────── Auswahl (4.3): harte Filter, Score, Rotation mit Lockerungsleiter ─────────────
  function moodFit(t, mood) { const tg = t.tags || {}; if (tg.mood === mood) return 1; if ((tg.moods || []).indexOf(mood) > -1) return 0.6; if ([tg.mood].concat(tg.moods || []).some(m => (MOOD_NEAR[m] || []).indexOf(mood) > -1)) return 0.5; return 0; }
  function bpmFit(bpm, p, tempo) {
    if (!bpm) return 0.3; const lo = p.bpm[0], hi = p.bpm[1], sp = hi - lo, band = tempo === "langsam" ? [lo, lo + 0.4 * sp] : tempo === "schnell" ? [hi - 0.4 * sp, hi] : tempo === "mittel" ? [lo + 0.3 * sp, hi - 0.3 * sp] : [lo, hi];
    const f = b => b >= band[0] - 1e-9 && b <= band[1] + 1e-9 ? 1 : Math.max(0, 1 - Math.min(Math.abs(b - band[0]), Math.abs(b - band[1])) / 20);
    return Math.max(f(bpm), 0.7 * f(bpm * 2), 0.7 * f(bpm / 2));
  }
  function avoided(t, p) { if (!p.avoid.length) return false; const tg = t.tags || {}, words = [tg.mood].concat(tg.moods || [], tg.genres || [], tg.instruments || []).filter(Boolean), txt = " " + [tg.vibe, t.name].join(" ").toLowerCase() + " ";
    return p.avoid.some(a => words.indexOf(a) > -1 || txt.indexOf(" " + a + " ") > -1 || txt.indexOf(" " + a + ",") > -1); }
  // harte Filter (nie gelockert): Lizenz/Plattformen, Content-ID, ausgeblendet, Daumen runter, meiden, Gesang, Qualität, Länge
  function usable(t, post, p, T, o) {
    o = o || {}; if (!t || t.gone || !t.fileAbs || !fs.existsSync(t.fileAbs)) return false;
    if (licenseProblem(t, post.platforms || [])) return false;
    if (!o.fixed && (t.hidden || (t.rating || {})[post.brand] === -1 || avoided(t, p))) return false;
    if (t.tags.vocals && !p.vocals && !o.fixed) return false;
    if (t.q && t.q.ok === false) return false;
    const a = t.a; if (a && a.v >= 1 && T) { const room = (a.outroStart || a.dur) - (a.introEnd || 0); if (room < T + 0.2 && !(a.bpmConf >= 0.5 && a.dur >= 20)) return false; }
    return true;
  }
  function scoreOf(t, w, p, post, ctx) {
    const parts = { mood: 3 * moodFit(t, w.mood), energy: 2 * (1 - Math.abs(energyOf(t) - w.energy) / 4), genre: 1.5 * jaccard(t.tags.genres, uniq((w.genres || []).concat(p.genres))),
      instr: 0.8 * jaccard(t.tags.instruments, (w.instruments && w.instruments.length ? w.instruments : p.instruments)), bpm: 1.5 * bpmFit(syncedBpm(t), p, w.tempo), brand: (t.tags.brands || []).indexOf(post.brand) > -1 ? 1 : 0 };
    const last = t.use && t.use.last && t.use.lastPost !== post.id ? Date.parse(t.use.last) : 0;
    parts.fresh = 1.2 * (last ? Math.min(1, Math.abs(ctx.t0 - last) / 864e5 / 60) : 1);
    parts.rating = (t.rating || {})[post.brand] === 1 ? 0.8 : 0; parts.synced = t.a && t.a.bpmConf >= 0.5 ? 0.5 : 0;
    parts.jitter = 0.3 * (hashNum(post.id + "|" + ((post.media || {}).rerender || "") + "|" + t.id) / 0xffffffff);
    parts.repeat = mainGenre(t) && ctx.lastGenres.indexOf(mainGenre(t)) > -1 ? -1.5 : 0;
    parts.seed = t.seed && ctx.aiCount >= 5 ? -0.5 : 0;
    let s = 0; Object.keys(parts).forEach(k => { s += parts[k]; }); return { s: r2(s), parts };
  }
  const LADDER = [
    { days: 14, n: 1, mood: 0.6, sameDay: true, note: "" },
    { days: 7, n: 1, mood: 0.6, sameDay: true, note: "globale Sperre 7 statt 14 Tage" },
    { days: 7, n: 0.5, mood: 0.6, sameDay: true, note: "Marken-Sperre halbiert" },
    { days: 7, n: 0.5, mood: 0.5, sameDay: true, note: "verwandte Stimmung" },
    { days: 7, n: 2, abs: true, mood: 0.5, sameDay: true, note: "nur die letzten 2 Reels gesperrt" },
    { days: 0, n: 0, abs: true, mood: 0, sameDay: false, note: "alle lizenz-tauglichen Titel" },
  ];
  function rank(post, o) {
    o = o || {}; const p = profile(post.brand), w = o.want || wantOf(post), t0 = postTime(post), T = o.T || 12;
    const ok = all().filter(t => usable(t, post, p, T)), hist = history(post.id), posts = new Set(S().posts.map(x => x.id));
    const mine = hist.filter(h => h.brand === post.brand), near = mine.slice().sort((a, b) => Math.abs(a.t - t0) - Math.abs(b.t - t0));
    const lastGenres = mine.filter(h => h.t <= t0).sort((a, b) => b.t - a.t).slice(0, 2).map(h => h.genre).filter(Boolean);
    const N = Math.min(15, Math.floor(0.6 * ok.filter(t => moodFit(t, w.mood) >= 0.6).length)), ctx = { t0, lastGenres, aiCount: ok.filter(t => isAi(t) && (t.tags.brands || []).indexOf(post.brand) > -1).length };
    const scored = ok.map(t => Object.assign({ t }, scoreOf(t, w, p, post, ctx))).sort((a, b) => b.s - a.s || (a.t.id < b.t.id ? -1 : 1));
    const day0 = viennaDay(t0);
    for (let lv = 0; lv < LADDER.length; lv++) {
      const L = LADDER[lv], nb = L.abs ? L.n : Math.floor(N * L.n), brandBlock = new Set(near.slice(0, nb).map(h => h.id));
      const blocked = t => { if (brandBlock.has(t.id)) return true;
        if (hist.some(h => h.id === t.id && ((L.days && Math.abs(h.t - t0) < L.days * 864e5) || (L.sameDay && viennaDay(h.t) === day0)))) return true;
        const u = t.use || {}; if (u.last && u.lastPost && u.lastPost !== post.id && !posts.has(u.lastPost)) { const lt = Date.parse(u.last); if ((L.days && Math.abs(lt - t0) < L.days * 864e5) || (L.sameDay && viennaDay(lt) === day0)) return true; }   // gelöschte Posts
        return false; };
      const pool = scored.filter(x => (o.only ? o.only(x.t) : true) && !(o.exclude && o.exclude.has(x.t.id)) && moodFit(x.t, w.mood) >= L.mood && !blocked(x.t));
      if (pool.length) { const top = pool[0].t, lu = lastUseText(top, hist, t0); return { list: pool, level: lv, want: w, note: lv ? "Bibliothek knapp – " + L.note + (lu ? " (Titel " + lu + ")" : "") : "" }; }
    }
    return { list: [], level: LADDER.length, want: w, note: "Keine lizenz-taugliche Musik in der Bibliothek" };
  }
  // 3 Vorschläge per MMR: jeder weitere unterscheidet sich vom vorigen im Genre oder in der Quelle
  function suggest(post, n, o) {
    const r = rank(post, o), cur = (trackRef(post) || {}).id, cand = r.list.filter(x => x.t.id !== cur).slice(0, 40), out = [];
    while (out.length < (n || 3) && cand.length) { const prev = out[out.length - 1]; let i = prev ? cand.findIndex(x => mainGenre(x.t) !== mainGenre(prev.t) || x.t.source !== prev.t.source) : 0; if (i < 0) i = 0; out.push(cand.splice(i, 1)[0]); }
    return { list: out, note: r.note, level: r.level };
  }

  // ───────────── Startpunkt, Fades, Lautheit (4.6) ─────────────
  function placeOf(t, pl, post, o) {
    o = o || {}; const a = t.a || {}, T = pl && pl.T || 12, cuts = pl && pl.cuts || null, tempo = o.tempo || 1, Tt = T * tempo;
    if (!a.mc || a.v < 1) return { offset: 0, gainDb: null, fadeIn: 0.25, fadeOut: 1.1, loop: true, drop: null, lufs: null };
    const bpm = syncedBpm(t), beat = bpm ? 60 / bpm : 0, bar = beat ? 4 * beat : 2, b0 = bpm ? (a.beat0 || 0) : (a.introEnd || 0), end = a.outroStart || a.dur, intro = a.introEnd || 0;
    const onGrid = s => beat ? b0 + Math.round((s - b0) / beat) * beat : s, cta = cuts && cuts.length > 2 ? cuts[cuts.length - 2] * tempo : null;
    const cands = [], add = (s, why) => { s = r3(s); if (s < intro - 0.03 || s < 0) return; if (cands.some(c => Math.abs(c.s - s) < 0.01)) return; cands.push({ s, why, loop: s + Tt > end + 0.05 }); };
    for (let s = b0; s + Tt <= end + 0.05; s += bar) add(s, "takt");
    (a.hot || []).forEach(h => { if (h.off + Tt <= end + 0.05) add(h.off, "hot"); });
    if (cta != null) (a.drops || []).forEach(d => { const s = onGrid(d - cta); if (s + Tt <= end + 0.05) add(s, "drop"); });
    let loop = false;
    if (!cands.length && a.bpmConf >= 0.5 && a.dur >= 20) { loop = true; for (let s = b0; s < Math.max(b0 + bar, end - 2 * bar); s += bar) add(s, "loop"); }
    if (!cands.length) add(beat ? b0 + Math.ceil(Math.max(0, intro - b0) / beat) * beat : intro, "start");
    if (!cands.length) cands.push({ s: 0, why: "start", loop: true });
    const used = ((t.use || {}).offs || []).map(Number);
    cands.forEach(c => { const wl = winLufs(a.mc, c.s, Tt); c.lufs = wl == null ? a.lufs : wl; let sc = (c.lufs - (a.lufs || c.lufs)) / 2;
      const rise = (winLufs(a.mc, c.s, 1) || -70) - (winLufs(a.mc, Math.max(0, c.s - 1), 1) || -70);
      c.drop = cta != null ? (a.drops || []).find(d => Math.abs(d - c.s - cta) <= (beat || 0.5) + 1e-6) : undefined; if (c.drop != null) sc += 2;
      c.used = used.some(u => Math.abs(u - c.s) < 0.05); if (rise >= 3) sc += 1; if (c.used) sc -= 1; if (c.loop) sc -= 0.5; c.sc = sc; });
    cands.sort((x, y) => y.sc - x.sc || x.s - y.s);
    // „Der Aufruf landet nach Möglichkeit auf dem Drop“: ein passender Startpunkt mit Drop auf dem Aufruf-Schnitt gewinnt, solange das Fenster nicht zu leise ist
    const dropC = cands.filter(c => c.drop != null && !c.used && !c.loop && c.lufs >= (a.lufs || c.lufs) - 4);
    const top = dropC.length ? dropC.slice(0, 1) : cands.filter(c => c.sc >= cands[0].sc - 1.5).slice(0, 3), pick = top[hashNum((post ? post.id + "|" + ((post.media || {}).rerender || "") : "") + "|" + t.id + "|off") % top.length];
    const lufs = pick.lufs != null ? pick.lufs : a.lufs, gainDb = lufs == null ? null : r1(clamp(TARGET - lufs - 0.5, -20, 12));
    return { offset: pick.s, gainDb, fadeIn: pick.s > 0.01 ? 0.04 : 0.25, fadeOut: r3(clamp(bar, 0.8, 1.6)), loop: loop || pick.loop, drop: pick.drop != null ? r3((pick.drop - pick.s) / tempo) : null, lufs, why: pick.why };
  }

  // ───────────── KI-Komposition: Auftrag, Prompt, Stability-Adapter ─────────────
  function seasonHint(key, mood, w) {
    const d = viennaDay(Date.now()), m = +d.slice(5, 7), day = +d.slice(8, 10), s = String(w.season || "");
    const xmas = /weihnacht|advent|christmas/.test(s) || (m === 12) || (m === 1 && day <= 6), winter = /winter|ski|schnee/.test(s) || m === 12 || m <= 3, summer = /sommer|summer/.test(s) || (m >= 6 && m <= 8);
    if (xmas && ["froehlich", "alpin", "elegant"].indexOf(mood) > -1) return "subtle sleigh bells";
    if (winter && ["huettengaudi", "skikaiser"].indexOf(key) > -1) return "winter party";
    if (summer) return "summer vibe"; return "";
  }
  function jobFor(key, w, o) {
    o = o || {}; loadCat(); const p = profile(key), past = (CAT.compose[key] || []).slice(-8);
    const genres = uniq((w.genres || []).filter(g => p.genres.indexOf(g) > -1).concat(p.genres)), leads = uniq((w.instruments || []).concat(p.instruments));
    // am längsten nicht benutzte Kombination Genre × Lead-Instrument
    const age = (g, l) => { for (let i = past.length - 1; i >= 0; i--) if (past[i].genre === g && past[i].lead === l) return past.length - i; return 99; };
    let best = null; genres.forEach((g, gi) => leads.slice(0, 5).forEach((l, li) => { const sc = age(g, l) * 10 - gi - li * 0.5 + (past.length && past[past.length - 1].genre === g ? -5 : 0); if (!best || sc > best.sc) best = { g, l, sc }; }));
    const g2 = (w.genres || []).find(x => x !== best.g && GENRES.indexOf(x) > -1) || "", rest = leads.filter(x => x !== best.l), rot = past.length % Math.max(1, rest.length);
    const instruments = [best.l].concat(rest.slice(rot).concat(rest.slice(0, rot)).slice(0, 2));
    const e = clamp(w.energy || 3, 1, 5), lo = p.bpm[0], hi = p.bpm[1], sp = hi - lo, band = w.tempo === "langsam" ? [lo, lo + 0.4 * sp] : w.tempo === "schnell" ? [hi - 0.4 * sp, hi] : [lo, hi];
    const pe = clamp((e - p.energy[0]) / Math.max(1, p.energy[1] - p.energy[0]), 0, 1), bpm = Math.round(clamp(band[0] + (band[1] - band[0]) * pe + (crypto.randomInt(9) - 4), lo, hi));
    const extras = [e >= 4 ? "with a big drop" : "", e <= 2 ? "sparse arrangement" : "", ["lustig", "froehlich"].indexOf(w.mood) > -1 ? "with a playful breakdown" : "", ["froehlich", "lustig", "alpin"].indexOf(w.mood) > -1 ? "major key" : w.mood === "episch" ? "minor key" : ""].filter(Boolean);
    const season = past.length && past[past.length - 1].season ? "" : seasonHint(key, w.mood, w);   // höchstens jedes 2. Reel mit Saison-Zusatz
    const seed = o.seed || (1 + crypto.randomInt(4294967293));
    const job = { brand: key, mood: w.mood, energy: e, genres: [best.g].concat(g2 ? [g2] : []), instruments, bpm, vibe: w.vibe || "", extra: extras.length ? extras[past.length % extras.length] : "", season, seed, duration: STAB.duration };
    job.prompt = buildPrompt(job, brandNames()); job.promptNoVibe = buildPrompt(Object.assign({}, job, { vibe: "" }), brandNames());
    return job;
  }
  const errText = async r => { try { const j = await r.json(); return clip((j.errors || []).join("; ") || j.message || j.name || "", 200); } catch (e) { return ""; } };
  const hdrs = r => { const o = {}; try { r.headers.forEach((v, k) => { if (!/cookie|authorization/i.test(k)) o[k] = clip(v, 200); }); } catch (e) {} return o; };
  async function audioOf(r) {
    const ct = String(r.headers.get("content-type") || "");
    if (/json/.test(ct)) { const j = await r.json(); if (j.finish_reason && /FILTER/i.test(j.finish_reason)) return { invalid: true, error: "vom Inhaltsfilter abgelehnt" };
      const b64 = j.audio || j.result || (j.artifacts && j.artifacts[0] && j.artifacts[0].base64); if (!b64) return { server: true, error: "keine Audiodaten in der Antwort" };
      return { buf: Buffer.from(b64, "base64"), seed: j.seed || null, finish: j.finish_reason || "" }; }
    if (/FILTER/i.test(String(r.headers.get("finish-reason") || ""))) return { invalid: true, error: "vom Inhaltsfilter abgelehnt" };
    return { buf: Buffer.from(await r.arrayBuffer()), seed: +r.headers.get("seed") || null, finish: r.headers.get("finish-reason") || "" };
  }
  const classify = (status, msg) => ({ status, error: msg || "HTTP " + status, auth: [401, 402, 403].indexOf(status) > -1, invalid: status === 422 || status === 400, rate: status === 429, server: status >= 500 });
  // ein Aufruf: 3.0 asynchron (202 → Abfragen alle 2 s, höchstens 120 s) bzw. 2.5 synchron
  async function stabOnce(key, job, prompt, v3) {
    const fd = new FormData(); fd.append("prompt", prompt); fd.append("duration", String(job.duration)); fd.append("seed", String(job.seed)); fd.append("steps", String(STAB.steps));
    fd.append("cfg_scale", String(clamp(+cfg().cfgScale || 1, 1, 25))); fd.append("output_format", "wav"); fd.append("model", v3 ? STAB.model3 : STAB.model25);
    const ep = v3 ? STAB.ep3 : STAB.ep25, deadline = Date.now() + timeoutMs, left = () => Math.max(500, deadline - Date.now());
    const auth = { Authorization: "Bearer " + key, Accept: "application/json" };
    let r; try { r = await F(STAB.base + ep, { method: "POST", headers: auth, body: fd, signal: AbortSignal.timeout(left()) }); }
    catch (e) { return { timeout: true, error: e && (e.name === "TimeoutError" || e.name === "AbortError") ? "keine Antwort in 120 s" : "nicht erreichbar" }; }
    const headers = hdrs(r);
    if (r.status === 202) {
      let id = ""; try { id = String((await r.json()).id || ""); } catch (e) {} if (!/^[\w-]{4,200}$/.test(id)) return { server: true, error: "keine Auftrags-ID" };
      while (Date.now() < deadline) {
        await new Promise(ok => setTimeout(ok, Math.min(pollMs, left())));
        let q; try { q = await F(STAB.base + STAB.results + encodeURIComponent(id), { headers: auth, signal: AbortSignal.timeout(left()) }); } catch (e) { if (Date.now() >= deadline) break; continue; }
        if (q.status === 202) { try { await q.arrayBuffer(); } catch (e) {} continue; }
        if (q.status !== 200) return Object.assign(classify(q.status, await errText(q)), { jobId: id });
        return Object.assign(await audioOf(q), { jobId: id, headers: Object.assign(headers, hdrs(q)), endpoint: ep, model: STAB.model3 });
      }
      return { timeout: true, jobId: id, error: "keine Antwort in 120 s" };
    }
    if (r.status !== 200) return classify(r.status, await errText(r));
    return Object.assign(await audioOf(r), { jobId: r.headers.get("x-request-id") || "", headers, endpoint: ep, model: v3 ? STAB.model3 : STAB.model25 });
  }
  // Ausfallkette (7.3): 3.0 → (422: ohne vibe) → (5xx/Zeit/422: 2.5) → Bibliothek; 401/402/403 → sofort Bibliothek + Warnhinweis; 429 → 5 s warten, höchstens 2×
  async function stabGenerate(key, job) {
    const tried = []; let prompt = job.prompt, r;
    const call = async (v3) => { let x, n = 0; do { if (n) await new Promise(ok => setTimeout(ok, backoffMs)); x = await stabOnce(key, job, prompt, v3); tried.push((v3 ? "3.0" : "2.5") + ":" + (x.buf ? "ok" : x.status || (x.timeout ? "zeit" : "fehler"))); n++; } while (x.rate && n <= 2); return x; };
    r = await call(true);
    if (r.invalid && job.vibe && prompt !== job.promptNoVibe) { prompt = job.promptNoVibe; r = await call(true); }
    if (!r.buf && !r.auth && !r.rate && (r.server || r.timeout || r.invalid)) r = await call(false);
    return Object.assign(r, { prompt, tried });
  }
  function proofAdd(o) { const p = Object.assign({ id: "p-" + Date.now().toString(36) + "-" + rand().slice(0, 6), at: nowIso() }, o); try { fs.appendFileSync(PROOF, JSON.stringify(p) + "\n"); } catch (e) { log("musik: Nachweis", e.message); } return p.id; }
  function proofGet(id) { try { return fs.readFileSync(PROOF, "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).find(x => x && x.id === id) || null; } catch (e) { return null; } }
  const sha = buf => crypto.createHash("sha256").update(buf).digest("hex");
  // Datei aufnehmen: analysieren, Intro-Stille/zu Langes abschneiden, nach AAC 160 kbit/s 48 kHz Stereo (≤ 60 s), nochmal analysieren
  async function ingest(src, outFile, o) {
    o = o || {}; const a0 = await analyse(src); let start = 0, len = Math.min(MAX_STORE, a0.dur);
    if (a0.introEnd > (o.ai ? 3 : 0.5)) start = Math.max(0, a0.introEnd - 0.1);
    if (a0.dur - start > MAX_STORE) { const h = (a0.hot || [])[0]; start = clamp(h ? h.off - 15 : start, start, Math.max(start, a0.dur - MAX_STORE)); }
    len = Math.min(MAX_STORE, a0.dur - start);
    await ffrun(["-loglevel", "error", "-y", "-ss", start.toFixed(3), "-t", len.toFixed(3), "-i", src, "-vn", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", outFile]);
    const a = start > 0 || /\.wav$|\.mp3$|\.ogg$|\.aiff?$/i.test(src) ? await analyse(outFile) : a0;
    return { a: slimA(a), a0, cut: { start: r2(start), len: r2(len) } };
  }
  const titleCase = s => String(s || "").split(" ").filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  function aiName(job) { const v = cleanVibe(job.vibe, brandNames()).replace(/,/g, " ").split(" ").filter(w => w.length > 2 && ["and", "the", "with", "for"].indexOf(w) < 0).slice(0, 2);
    const first = v.length ? titleCase(v.join(" ")) : titleCase((MOOD_WORDS[job.mood] || "fresh").split(",")[0]); return first + " " + (GENRE_NOUN[job.genres[0]] || "Tune"); }
  /* Einen Titel komponieren (Stability), prüfen, aufnehmen → { track, note } bzw. { note } (dann Fallback Bibliothek) */
  async function compose(key, w, o) {
    o = o || {}; const blockWhy = composeBlock(o.weekly, o.force); if (blockWhy) return { note: "KI-Musik: " + blockWhy + " – Titel aus Bibliothek", blocked: true };
    const k = stabilityKey(); let job = jobFor(key, w, o), tries = 0, lastQ = null;
    while (tries < 2) {
      tries++; if (tries > 1) { if (!canSpend(STAB.costUsd, o.weekly)) break; job = jobFor(key, w, Object.assign({}, o)); }
      const r = await stabGenerate(k, job);
      if (!r.buf) { if (r.auth) setWarn(r.status === 402 ? "Stability: Guthaben leer – Credits nachkaufen (platform.stability.ai)" : "Stability-Key ungültig oder ohne Berechtigung – unter Kanäle › Extras neu eintragen");
        log("musik: Stability", r.status || "", r.error || "", (r.tried || []).join(" ")); return { note: "KI-Musik: " + (r.error || "Fehler") + " – Titel aus Bibliothek", error: r.error, status: r.status }; }
      if (S().mkt.musicWarn) setWarn("");
      spend(STAB.costUsd, o.weekly);   // Fehlschläge sind kostenlos, jede gelieferte Generierung kostet
      const id = "ai-" + viennaDay(Date.now()).replace(/-/g, "") + "-" + key.replace(/[^a-z0-9]/g, "").slice(0, 12) + "-" + rand().slice(0, 4), tmp = path.join(WORK, "music-in-" + rand() + ".wav"), rel = "ai/" + id + ".m4a", out = path.join(MDIR, rel);
      fs.mkdirSync(WORK, { recursive: true }); fs.writeFileSync(tmp, r.buf);
      try {
        const ing = await ingest(tmp, out, { ai: true }), q = quality(ing.a, { ai: true, ordered: job.duration, srcDur: ing.a0.dur, wantBpm: job.bpm });
        const fileSha = sha(fs.readFileSync(out)), srcSha = sha(r.buf);
        if (!q.ok || !ing.a.bpm) { lastQ = q.ok ? { ok: false, reasons: ["Takt nicht erkannt"] } : q; log("musik: KI-Titel verworfen", q.reasons.concat(ing.a.bpm ? [] : ["Takt"]).join(", ")); try { fs.unlinkSync(out); } catch (e) {}
          proofAdd({ trackId: "", rejected: lastQ.reasons, provider: "stability", model: r.model, endpoint: r.endpoint, jobId: r.jobId || "", responseHeaders: r.headers || {}, seed: r.seed || job.seed, prompt: r.prompt, duration: job.duration, costUsd: STAB.costUsd, terms: STAB.terms, declaredRevenueBelow1M: cfg().revenueOk || "", tier: null, sha256: srcSha });
          continue; }
        const proof = proofAdd({ trackId: id, provider: "stability", model: r.model, endpoint: r.endpoint, jobId: r.jobId || "", responseHeaders: r.headers || {}, seed: r.seed || job.seed, prompt: r.prompt, duration: job.duration, costUsd: STAB.costUsd,
          terms: STAB.terms, declaredRevenueBelow1M: cfg().revenueOk || "", tier: null, sha256: srcSha, fileSha256: fileSha, cut: ing.cut, sourceUrl: null, licenseText: null, tried: r.tried });
        // Energie: bestellte Energie, solange die Analyse höchstens 1 daneben liegt (Analyse ist ±1 genau), sonst der Mittelwert
        const eA = ing.a.energy || job.energy, eT = Math.abs(eA - job.energy) <= 1 ? job.energy : Math.round((eA + job.energy) / 2);
        loadCat(); const tags = { mood: job.mood, moods: uniq([job.mood].concat(w.mood && w.mood !== job.mood ? [w.mood] : [])), energy: eT, energyWanted: job.energy, genres: job.genres, instruments: job.instruments, vocals: false, season: job.season ? [job.season] : [], brands: [key], vibe: cleanVibe(job.vibe, brandNames()), confirmed: true };
        const t = { id, name: aiName(job), file: rel, source: "stability", addedAt: nowIso(), forPost: o.postId || "", weekly: !!o.weekly, tags, a: ing.a, prompt: r.prompt, bpmWanted: job.bpm, sha: srcSha,
          license: { key: "stability-api", text: LICENSES["stability-api"].text, url: LICENSES["stability-api"].url, attribution: "", artist: "", sourceUrl: "", contentId: "frei", proof }, use: { count: 0 }, rating: {}, hidden: false, q };
        CAT.tracks.push(t); (CAT.compose[key] = CAT.compose[key] || []).push({ genre: job.genres[0], lead: job.instruments[0], bpm: job.bpm, seed: job.seed, season: job.season || "", at: nowIso(), id }); CAT.compose[key] = CAT.compose[key].slice(-8);
        saveCat(); storageCheck(); return { track: byId(id), note: "" };
      } finally { try { fs.unlinkSync(tmp); } catch (e) {} }
    }
    return { note: "KI-Musik: Qualitätsfilter nicht bestanden (" + ((lastQ && lastQ.reasons) || ["?"]).join(", ") + ") – Titel aus Bibliothek" };
  }
  async function balance() {
    const k = stabilityKey(), st = S().mkt; if (!k) return { ok: false, configured: false };
    let r; try { r = await F(STAB.base + STAB.balance, { headers: { Authorization: "Bearer " + k, Accept: "application/json" }, signal: AbortSignal.timeout(15000) }); }
    catch (e) { st.stabilityCheck = { at: nowIso(), ok: false, error: e && e.name === "TimeoutError" ? "keine Antwort (Zeitüberschreitung)" : "nicht erreichbar" }; save(); return Object.assign({ configured: true }, st.stabilityCheck); }
    let j = {}; try { j = await r.json(); } catch (e) {}
    const credits = r.ok && isFinite(+j.credits) ? Math.round(+j.credits * 100) / 100 : null;
    st.stabilityCheck = { at: nowIso(), ok: r.ok, status: r.status, credits, usd: credits != null ? r2(credits * 0.01) : null, low: credits != null && credits < 50, error: r.ok ? "" : r.status === 401 ? "Key ungültig" : r.status === 403 ? "keine Berechtigung" : "HTTP " + r.status };
    if (r.status === 401 || r.status === 403) setWarn("Stability-Key ungültig oder ohne Berechtigung – unter Kanäle › Extras neu eintragen"); else if (r.ok && /Key ungültig|Guthaben leer/.test(st.musicWarn || "") && credits > 0) setWarn("");
    save(); return Object.assign({ configured: true }, st.stabilityCheck);
  }

  // ───────────── Auswahl je Reel (ersetzt pickMusic in JOBS.post) ─────────────
  let LOCK = Promise.resolve();
  const locked = fn => { const run = LOCK.then(fn, fn); LOCK = run.catch(() => {}); return run; };
  function markUse(t, post, off) {
    const r = rec(t.id), u = r.use = Object.assign({ count: 0 }, r.use || {});
    if (u.lastPost !== post.id) u.count = (u.count || 0) + 1; u.last = new Date(postTime(post)).toISOString(); u.lastBrand = post.brand; u.lastPost = post.id;
    u.offs = (u.offs || []).concat([r3(off || 0)]).slice(-12); saveCat();
  }
  function info(t, pl, post, extra) {
    const L = LICENSES[t.license.key] || {}, md = post.media || {};
    return Object.assign({ id: t.id, name: t.name, license: t.license.text || L.text || "", licKey: t.license.key, source: t.source, src: SRC_LABEL[t.source] || t.source, ai: isAi(t), offset: pl.offset, gainDb: pl.gainDb, drop: pl.drop,
      bpm: syncedBpm(t), energy: energyOf(t), mood: t.tags.mood || "", genre: mainGenre(t), proof: t.license.proof || "", credit: creditText(t), creditShort: creditText(t, true), artist: t.license.artist || "",
      wantKey: wantKey(wantOf(post)), rerender: md.rerender || "" }, extra || {});
  }
  /* post → { track, file, meta (musicMeta für MO.reel), info (→ media.track), note }. ctx.plan(musicMeta) → { cuts, T } (MO.plan, ohne Rendern). */
  async function pick(post, ctx) {
    ctx = ctx || {}; const notes = [];
    if (post.music === "none") return { track: null, note: "" };
    const p = profile(post.brand), w = wantOf(post), plan = mm => (ctx.plan ? ctx.plan(mm) : { cuts: null, T: 12 }), T0 = plan({ bpm: 0 }).T + 1;
    let t = null, composed = false;
    if (post.music && post.music !== "auto") { const f = byId(post.music); if (f && usable(f, post, p, 0, { fixed: true })) t = f; else if (f) notes.push("Gewählter Titel „" + f.name + "“: " + (licenseProblem(f, post.platforms) || "nicht verfügbar") + " – automatisch ersetzt"); }
    const prev = (post.media || {}).track;
    if (!t && !post.musicForce && prev && prev.id && prev.wantKey === wantKey(w)) { const f = byId(prev.id); if (f && usable(f, post, p, T0)) t = f; }   // Textänderung: Musik bleibt
    if (!t && (post.musicForce === "compose" || cfg().engine !== "library")) {
      const force = post.musicForce === "compose", why = composeBlock(false, force);
      if (!why) {
        let saved = null;
        if (cfg().saver && post.musicForce !== "compose") { const r = rank(post, { T: T0, only: x => isAi(x) && !(x.use && x.use.count) && (x.tags.brands || []).indexOf(post.brand) > -1 }); if (r.list[0] && r.list[0].s >= 7.5) saved = r.list[0].t; }
        if (saved) t = saved;
        else { const n = clamp(+cfg().variants || 1, 1, 3), got = [];
          for (let i = 0; i < n; i++) { const c = await compose(post.brand, w, { postId: post.id, force }); if (c.track) got.push(c.track); else { notes.push(c.note); break; } }
          if (got.length) { t = got.length > 1 ? (rank(post, { T: T0, only: x => got.some(g => g.id === x.id) }).list[0] || { t: got[0] }).t : got[0]; composed = true; } }
      } else if (post.musicForce === "compose" || stabilityKey()) notes.push("KI-Musik: " + why + " – Titel aus Bibliothek");
      if (post.musicForce) delete post.musicForce;
    }
    return locked(() => {
      let lvNote = "";
      if (!t) { const r = rank(post, { T: T0 }); if (!r.list.length) return { track: null, note: notes.concat([r.note]).filter(Boolean).join(" · ") }; t = r.list[0].t; lvNote = r.note; }
      const bpm = syncedBpm(t), energy = energyOf(t), mm = { bpm, beat0: 0, energy, onsetRate: (t.a || {}).onsetRate || 0 };
      const pl = plan(mm), place = placeOf(t, pl, post);
      post.media = Object.assign({}, post.media, { trackPending: { id: t.id, genre: mainGenre(t), energy, bpm } });   // Reservierung (parallel erzeugte Reels ziehen nicht denselben Titel)
      markUse(t, post, place.offset);
      const meta = Object.assign(mm, { offset: place.offset, gainDb: place.gainDb, fadeIn: place.fadeIn, fadeOut: place.fadeOut, drop: place.drop });
      if (lvNote) notes.push(lvNote);
      return { track: t, file: t.fileAbs, meta, place, plan: pl, info: info(t, place, post, { composed, lufsWin: place.lufs }), note: notes.filter(Boolean).join(" · ") };
    });
  }

  // ───────────── „Andere Musik“: nur Ton neu muxen, wenn das Schnittraster gleich bleibt (sonst neu rendern) ─────────────
  const ecOf = e => e >= 4 ? "hi" : e <= 2 ? "lo" : "mid";
  function cutLen(bpm, energy) { if (!bpm) return 0.5; const beat = 60 / bpm; return energy >= 4 && beat >= 0.42 ? beat : beat >= 0.55 ? beat : beat * 2; }
  async function tryRemux(post, t) {
    const md = post.media || {}, g = md.grid, MEDIA = C.MEDIA;
    if (!C.MO || !C.MO.remux || !MEDIA || md.status !== "fertig" || !md.video || !g || !Array.isArray(md.sfx)) return { ok: false, why: "neu schneiden" };
    const bpm = syncedBpm(t), e = energyOf(t); if (!!bpm !== !!g.synced || ecOf(e) !== g.ec) return { ok: false, why: "anderes Schnittraster" };
    const tempo = bpm ? cutLen(bpm, e) / g.cut : 1; if (Math.abs(tempo - 1) > 0.02) return { ok: false, why: "anderes Tempo" };
    const place = placeOf(t, { cuts: g.cuts, T: g.T }, post, { tempo }), file = post.id + "-" + rand() + ".mp4", out = path.join(MEDIA, file);
    const r = await C.MO.remux({ video: path.join(MEDIA, md.video), sfx: md.sfx, sfxVol: g.sfxVol, T: g.T, music: t.fileAbs, musicMeta: { offset: place.offset, gainDb: place.gainDb, fadeIn: place.fadeIn, fadeOut: place.fadeOut, tempo: r3(tempo) }, outFile: out, dir: path.join(WORK, "remux-" + rand()) });
    const old = md.video; markUse(t, post, place.offset);
    post.media = Object.assign({}, md, { video: file, at: nowIso(), track: info(t, place, post, { remuxed: true, tempo: r3(tempo) }), lufs: r.lufs, tp: r.tp, musicNote: "" });
    try { fs.unlinkSync(path.join(MEDIA, old)); } catch (e) {}
    return { ok: true };
  }
  async function setTrack(post, t) {
    const cur = (trackRef(post) || {}).id; post.music = t.id; post.musicTried = uniq((post.musicTried || []).concat(cur ? [cur] : [], [t.id])).slice(-40);
    let rm = { ok: false }; try { rm = await locked(() => tryRemux(post, t)); } catch (e) { log("musik: Remux", String(e.message || e).slice(0, 160)); rm = { ok: false, why: "Remux fehlgeschlagen" }; }
    return rm.ok ? { out: { remuxed: true } } : { rerender: true, out: { remuxed: false, why: rm.why || "" } };
  }
  // Post-Aktionen (POST /admin/api/mkt/post, op music*) → { rerender, out }
  async function postOp(post, op, pl) {
    pl = pl || {};
    if (post.format !== "reel") throw fail(400, "Musik gibt es nur bei Reels.");
    if (op !== "musicSuggest" && ["läuft", "gepostet", "teilweise"].indexOf(post.status) > -1) throw fail(400, "Schon veröffentlicht.");
    if (/^gewinnspiel/.test(post.source || "")) throw fail(400, "Gewinnspiel-Videos haben ihre eigene Musik.");
    const T = +(post.media && (post.media.grid || {}).T) || +(post.media || {}).duration || 12;
    if (op === "musicSuggest") { const s = suggest(post, 3, { T }), hist = history(post.id), t0 = postTime(post);
      return { out: { suggestions: s.list.map(x => Object.assign(publicTrack(x.t), { score: x.s, last: lastUseText(x.t, hist, t0), preview: previewUrl(x.t, placeOf(x.t, { T: Math.max(T, 12) }, post)) })), note: s.note, current: currentPublic(post) } }; }
    if (op === "musicShuffle") { const tried = new Set((post.musicTried || []).concat([(trackRef(post) || {}).id])), r = rank(post, { T, exclude: tried }), nx = r.list[0];   // bereits Versuchtes raus, notfalls über die Lockerungsleiter
      if (!nx) throw fail(400, "Keine weitere passende Musik in der Bibliothek – „Neu komponieren“ oder Stimmung/Energie ändern."); return setTrack(post, nx.t); }
    if (op === "musicSet") { const t = byId(String(pl.track || "")); if (!t || t.gone) throw fail(404, "Titel nicht gefunden"); const why = licenseProblem(t, post.platforms); if (why) throw fail(400, why); return setTrack(post, t); }
    if (op === "musicCompose") { const why = composeBlock(false, true); if (why || !stabilityKey()) throw fail(400, "Neu komponieren geht gerade nicht: " + (why || "kein Stability-Key") + " (Kanäle › Extras)."); post.musicForce = "compose"; post.music = ""; return { rerender: true }; }
    if (op === "musicRate") { const cur = trackRef(post); if (!cur) throw fail(400, "Noch keine Musik gewählt."); const v = +pl.v > 0 ? 1 : +pl.v < 0 ? -1 : 0, r = rec(cur.id); r.rating = Object.assign({}, r.rating || {}); if (v) r.rating[post.brand] = v; else delete r.rating[post.brand]; saveCat();
      if (v < 0) { if (post.music === cur.id) post.music = ""; return postOp(post, "musicShuffle", {}); } return { out: { rated: v } }; }
    if (op === "musicWant") { const w = Object.assign({}, post.musicWant || wantOf(post)); if (MOODS.indexOf(pl.mood) > -1) w.mood = pl.mood; if (+pl.energy >= 1 && +pl.energy <= 5) w.energy = Math.round(+pl.energy); if (pl.tempo !== undefined) w.tempo = TEMPI.indexOf(pl.tempo) > -1 ? pl.tempo : "";
      post.musicWant = w; post.mood = w.mood; if (post.music !== "none") post.music = ""; post.musicTried = []; return { rerender: true }; }
    if (op === "musicNone") { post.music = pl.on === false ? "" : "none"; return { rerender: true }; }
    throw fail(400, "Unbekannte Musik-Aktion");
  }
  function currentPublic(post) { const r = trackRef(post); if (!r) return null; const t = byId(r.id); return Object.assign({}, r, t ? { src: SRC_LABEL[t.source] || t.source, genres: t.tags.genres, instruments: t.tags.instruments, rating: (t.rating || {})[post.brand] || 0 } : {}, { preview: t ? previewUrl(t, { offset: r.offset || 0, gainDb: r.gainDb }) : "" }); }
  // Freigabe/Posten: Lizenz für alle Zielplattformen? → "" oder Grund
  function licenseFor(post, pf) { if (post.format !== "reel" || post.music === "none") return ""; const r = (post.media || {}).track; if (!r || !r.id) return ""; const t = byId(r.id); if (!t) return ""; return licenseProblem(t, pf ? [pf] : post.platforms || []); }
  // Caption-Credit (CC BY): lang bzw. kurz je Plattform
  function creditFor(post, pf) { const r = post && post.format === "reel" && (post.media || {}).track; if (!r || !r.credit) return ""; return ["threads", "bluesky"].indexOf(pf) > -1 ? r.creditShort || r.credit : r.credit; }

  // ───────────── Hörproben (12 s, 64 kbit/s, mit Verstärkung und Fades; nur über den Admin-Endpunkt) ─────────────
  function previewUrl(t, pl) { return "/admin/api/mkt/music/preview?id=" + encodeURIComponent(t.id) + "&off=" + r2(pl.offset || 0) + (pl.gainDb != null ? "&g=" + pl.gainDb : ""); }
  async function previewFile(t, off, g) {
    fs.mkdirSync(PREV, { recursive: true }); off = clamp(+off || 0, 0, 900); g = clamp(+g || 0, -20, 12);
    const f = path.join(PREV, t.id.replace(/[^\w.-]/g, "_") + "-" + Math.round(off * 100) + "-" + Math.round(g * 10) + ".m4a");
    if (!fs.existsSync(f)) {
      const tmp = f + "." + rand().slice(0, 6) + ".m4a";
      await ffrun(["-loglevel", "error", "-y", "-stream_loop", "-1", "-i", t.fileAbs, "-vn", "-af", "atrim=start=" + off.toFixed(3) + ":duration=12,asetpts=PTS-STARTPTS,volume=" + g + "dB,afade=t=in:st=0:d=0.04,afade=t=out:st=10.8:d=1.2,alimiter=limit=0.89:level=disabled", "-t", "12", "-c:a", "aac", "-b:a", "64k", "-ar", "44100", "-ac", "2", "-movflags", "+faststart", tmp], { low: false, timeout: 30000 });
      fs.renameSync(tmp, f); prunePreviews();
    } else { try { const now = new Date(); fs.utimesSync(f, now, now); } catch (e) {} }
    return f;
  }
  function prunePreviews() { let fl = []; try { fl = fs.readdirSync(PREV).map(n => { const p = path.join(PREV, n), s = fs.statSync(p); return { p, m: s.mtimeMs, z: s.size }; }); } catch (e) { return; }
    let tot = fl.reduce((a, x) => a + x.z, 0); fl.sort((a, b) => a.m - b.m).forEach(x => { if (Date.now() - x.m > 7 * 864e5 || tot > 50e6) { try { fs.unlinkSync(x.p); tot -= x.z; } catch (e) {} } }); }

  // ───────────── Speicher und Aufräumen (7.1): nur Audiodateien von KI-/Fremd-Titeln, nie Metadaten oder Nachweise ─────────────
  function storage() { let bytes = 0, n = 0; all().forEach(t => { if (t.seed || t.gone) return; n++; try { bytes += fs.statSync(t.fileAbs).size; } catch (e) {} }); return { bytes, n, mb: r1(bytes / 1e6) }; }
  function cleanup(force) {
    const c = cfg(), st = storage(), full = st.bytes > 0.9 * c.maxMb * 1e6 || st.n > 0.9 * c.maxTracks; if (!force && !full) return 0;
    const live = new Set(S().posts.filter(p => ["gepostet", "teilweise"].indexOf(p.status) < 0).map(p => (trackRef(p) || {}).id).filter(Boolean)), now = Date.now(); let removed = 0;
    const gone = (t, why) => { if (live.has(t.id)) return; try { fs.unlinkSync(t.fileAbs); } catch (e) {} const r = rec(t.id); r.gone = true; r.goneAt = nowIso(); r.goneWhy = why; removed++; };
    const ext = all().filter(t => !t.seed && !t.gone && (isAi(t) || t.source === "ccmixter"));
    ext.filter(t => Object.keys(t.rating || {}).some(k => t.rating[k] === -1)).forEach(t => gone(t, "Daumen runter"));
    ext.filter(t => !(t.use && t.use.count) && now - Date.parse(t.addedAt || 0) > 90 * 864e5).forEach(t => gone(t, "nie benutzt, älter als 90 Tage"));
    ext.filter(t => t.use && t.use.count && t.use.last && now - Date.parse(t.use.last) > 180 * 864e5).forEach(t => gone(t, "zuletzt vor über 180 Tagen"));
    if (removed) saveCat(); return removed;
  }
  function storageCheck() { try { cleanup(false); } catch (e) {} }

  // ───────────── Wöchentlicher Nachschub (5.3): sonntags ab 03:30 Wien, einmal je ISO-Woche ─────────────
  let WEEKLY = null;
  function weekly(force) {
    if (WEEKLY) return WEEKLY; const st = S().mkt, now = Date.now(), wk = isoWeek(now);
    const vp = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now)), g = k => (vp.find(x => x.type === k) || {}).value;
    if (!force && (g("weekday") !== "Sun" || +g("hour") * 60 + +g("minute") < 210 || st.musicWeekAt === wk)) return Promise.resolve(null);
    st.musicWeekAt = wk; save();
    WEEKLY = (async () => {
      const out = { at: nowIso(), week: wk, added: 0, usd: 0, cleaned: 0, analysed: 0, notes: [] }, per = clamp(+cfg().weekly || 0, 0, 3);
      if (per && !composeBlock(true)) for (const key of Object.keys(S().brands).filter(k => S().brands[k] && S().brands[k].enabled !== false)) {
        const fake = { id: "weekly-" + key, brand: key, format: "reel", platforms: [], scheduledAt: nowIso() }, p = profile(key);
        const unused = rank(fake, { want: cleanWant(key, {}, p.mood), only: x => !(x.use && x.use.count) }).list.filter(x => x.s >= 7).length;
        for (let i = 0; i < per && unused + i < 4; i++) { const c = await compose(key, cleanWant(key, { energy: Math.round((p.energy[0] + p.energy[1]) / 2) }, p.mood), { weekly: true }); if (c.track) { out.added++; out.usd = r2(out.usd + STAB.costUsd); } else { out.notes.push(key + ": " + c.note); break; } }
      }
      out.cleaned = cleanup(true);
      all().filter(t => !t.gone && (!t.a || (t.a.v || 0) < AV)).forEach(t => { queueAnalysis(t.id); out.analysed++; });
      st.musicWeekly = out; save(true); return out;
    })().finally(() => { WEEKLY = null; });
    return WEEKLY;
  }

  // ───────────── Hochladen (Pflicht-Lizenz) ─────────────
  async function upload(pl) {
    const lk = String(pl.license || ""); if (!licOf(lk) || !LICENSES[lk].upload) throw fail(400, LIC_BLOCKED.test(lk) ? "Diese Lizenz ist gesperrt (NC/ND/SA bzw. unbekannt) – bitte nicht verwenden." : "Bitte die Lizenz des Titels wählen.");
    const L = LICENSES[lk]; if (L.attribution && (!clip(pl.artist, 120) || !/^https?:\/\/\S+$/.test(String(pl.sourceUrl || "")))) throw fail(400, "Bei CC BY sind Künstler und Quell-Adresse Pflicht.");
    const mm = String(pl.data || "").match(/^data:audio\/(mpeg|mp3|mp4|x-m4a|aac|wav|x-wav|wave|ogg);base64,([A-Za-z0-9+/=]+)$/); if (!mm) throw fail(400, "Bitte eine MP3-, M4A-, WAV- oder OGG-Datei");
    const buf = Buffer.from(mm[2], "base64"); if (buf.length > 12e6) throw fail(400, "Datei zu groß (max. 12 MB)");
    const srcSha = sha(buf); loadCat(); if (CAT.tracks.some(t => t.sha === srcSha && !t.gone)) throw fail(400, "Diesen Titel gibt es schon in der Bibliothek.");
    const id = (C.newId ? C.newId("m") : "m" + Date.now().toString(36) + rand().slice(0, 8)), ext = { mpeg: "mp3", mp3: "mp3", mp4: "m4a", "x-m4a": "m4a", aac: "aac", wav: "wav", "x-wav": "wav", wave: "wav", ogg: "ogg" }[mm[1]];
    const tmp = path.join(WORK, "music-up-" + rand() + "." + ext), rel = id + ".m4a", out = path.join(MDIR, rel); fs.mkdirSync(WORK, { recursive: true }); fs.writeFileSync(tmp, buf);
    try {
      const ing = await ingest(tmp, out, {}), q = quality(ing.a, { upload: true }), mood = MOODS.indexOf(pl.mood) > -1 ? pl.mood : "";
      const proof = proofAdd({ trackId: id, provider: "upload", license: lk, licenseText: L.text, sourceUrl: clip(pl.sourceUrl, 300) || null, artist: clip(pl.artist, 120) || "", at: nowIso(), sha256: srcSha, fileSha256: sha(fs.readFileSync(out)), declaredVocals: !!pl.vocals });
      const t = { id, name: clip(pl.name, 80) || "Titel", title: clip(pl.title || pl.name, 120), file: rel, source: "upload", addedAt: nowIso(), sha: srcSha,
        tags: { mood: mood || ing.a.moodGuess, moodGuess: !mood, moods: uniq([mood || ing.a.moodGuess]), energy: ing.a.energy, genres: vocab(pl.genres, GENRES), instruments: vocab(pl.instruments, INSTRUMENTS), vocals: !!pl.vocals, season: [], brands: (Array.isArray(pl.brands) ? pl.brands : []).filter(k => S().brands[k]), vibe: "" },
        a: ing.a, license: { key: lk, text: lk === "envato" && pl.project ? "Envato · " + clip(pl.project, 120) : L.text, url: L.url || "", attribution: L.attribution ? "ja" : "", artist: clip(pl.artist, 120), sourceUrl: clip(pl.sourceUrl, 300), contentId: L.contentId === "geprueft-frei" ? "geprueft-frei" : L.contentId, proof }, use: { count: 0 }, rating: {}, hidden: false, q };
      CAT.tracks.push(t); saveCat(); return { track: publicTrack(byId(id)), quality: q };
    } catch (e) { try { fs.unlinkSync(out); } catch (e2) {} throw e.status ? e : fail(400, "Datei nicht lesbar (" + String(e.message || e).slice(0, 120) + ")"); }
    finally { try { fs.unlinkSync(tmp); } catch (e) {} }
  }

  // ───────────── Cockpit-Daten ─────────────
  function cfgPublic() {
    const c = cfg(), b = budget(), st = S().mkt, lim = limitEur(), eur = r2(b.usd * USD_EUR), hist = Object.assign({}, st.musicBudgetHist || {});
    return { engine: c.engine, limitEur: lim, revenueOk: c.revenueOk || "", variants: c.variants, saver: !!c.saver, weekly: c.weekly, ytAi: c.ytAi !== false, cfgScale: c.cfgScale,
      stability: { configured: !!stabilityKey(), env: !!process.env.STABILITY_API_KEY && !st.stability, check: st.stabilityCheck || null },
      budget: { month: b.month, usd: b.usd, eur, count: b.count, weeklyUsd: b.weeklyUsd || 0, pct: lim ? Math.round(eur / lim * 100) : 0, left: lim ? Math.max(0, Math.floor((lim / USD_EUR - b.usd) / STAB.costUsd + 1e-9)) : 0 },
      months: Object.keys(hist).sort().slice(-5).map(k => ({ month: k, usd: hist[k].usd, count: hist[k].count })), warn: st.musicWarn || "", composeBlock: composeBlock(false), canCompose: !composeBlock(false, true),
      costUsd: STAB.costUsd, usdEur: USD_EUR, weeklyLast: st.musicWeekly || null, storage: storage(), engines: ENGINES };
  }
  function overview() {
    return { music: all().filter(t => !t.gone).map(publicTrack), musicCfg: cfgPublic(), musicVocab: { genres: GENRES, instruments: INSTRUMENTS, tempi: TEMPI },
      musicProfiles: Object.fromEntries(Object.keys(S().brands).map(k => [k, profile(k)])), musicLicenses: Object.keys(LICENSES).filter(k => LICENSES[k].upload).map(k => ({ key: k, label: LICENSES[k].label, text: LICENSES[k].text, attribution: !!LICENSES[k].attribution, platforms: LICENSES[k].platforms, note: LICENSES[k].note || "" })) };
  }
  const reply = (res, extra) => C.J(res, 200, Object.assign({ ok: true }, C.overview ? C.overview() : overview(), extra || {}));
  // Routen /admin/api/mkt/music… (Admin-Anmeldung prüft server.js) → true, wenn erledigt
  async function handleAdmin(req, res, u, p) {
    if (p === "/admin/api/mkt/music/catalog" && req.method === "GET") { const f = k => String(u.searchParams.get(k) || ""); let l = all().filter(t => !t.gone).map(publicTrack);
      if (f("brand")) l = l.filter(t => !t.brands.length || t.brands.indexOf(f("brand")) > -1); if (f("mood")) l = l.filter(t => t.mood === f("mood") || t.moods.indexOf(f("mood")) > -1); if (f("source")) l = l.filter(t => t.source === f("source")); if (f("license")) l = l.filter(t => t.licKey === f("license")); if (f("contentId")) l = l.filter(t => t.contentId === f("contentId"));
      C.J(res, 200, { ok: true, tracks: l, cfg: cfgPublic() }); return true; }
    if (p === "/admin/api/mkt/music/preview" && req.method === "GET") { const t = byId(String(u.searchParams.get("id") || "")); if (!t || t.gone || !fs.existsSync(t.fileAbs)) throw fail(404, "Titel nicht gefunden");
      const pl = u.searchParams.has("off") ? { offset: u.searchParams.get("off"), gainDb: u.searchParams.get("g") } : placeOf(t, { T: 12 }, null);   // ohne Startpunkt: Höhepunkt des Titels
      const f = await previewFile(t, pl.offset, pl.gainDb); C.sendFile(req, res, f, "audio/mp4", ""); return true; }
    if (p === "/admin/api/mkt/music/proof" && req.method === "GET") { const t = byId(String(u.searchParams.get("id") || "")); if (!t) throw fail(404, "Titel nicht gefunden");
      C.J(res, 200, { ok: true, text: proofText(t) }); return true; }
    if (p !== "/admin/api/mkt/music" || req.method !== "POST") return false;
    const pl = await C.body(req, 16e6), op = String(pl.op || (pl.remove ? "remove" : pl.restore ? "restore" : pl.data ? "upload" : ""));
    if (op === "upload") { const r = await upload(pl); return reply(res, { uploaded: r.track, quality: r.quality }), true; }
    if (op === "keys") { if (pl.provider !== "stability") throw fail(400, "Unbekannter Anbieter"); const k = String(pl.key || "").trim(); if (k && !/^[\w.\-]{16,300}$/.test(k)) throw fail(400, "Das sieht nicht wie ein Stability-API-Key aus.");
      S().mkt.stability = k ? C.seal({ v: k }) : undefined; S().mkt.stabilityCheck = null; setWarn(""); save(true); return reply(res), true; }
    if (op === "balance") { const b = await balance(); return reply(res, { balance: b }), true; }
    if (op === "settings") { const c = cfg();
      if (pl.limitEur !== undefined) { const v = parseFloat(String(pl.limitEur).replace(",", ".")); if (!isFinite(v) || v < 0 || v > 500) throw fail(400, "Monatslimit bitte zwischen 0 und 500 €"); c.limitEur = Math.round(v * 100) / 100; }
      if (pl.revenueOk !== undefined) c.revenueOk = pl.revenueOk ? (c.revenueOk || viennaDay(Date.now())) : "";
      if (pl.engine !== undefined) c.engine = ["auto", "library", "stability"].indexOf(pl.engine) > -1 ? pl.engine : "auto";
      ["saver", "ytAi"].forEach(k => { if (pl[k] !== undefined) c[k] = !!pl[k]; });
      if (pl.variants !== undefined) c.variants = clamp(parseInt(pl.variants, 10) || 1, 1, 3); if (pl.weekly !== undefined) c.weekly = clamp(parseInt(pl.weekly, 10) || 0, 0, 3);
      if (pl.cfgScale !== undefined) c.cfgScale = clamp(parseFloat(pl.cfgScale) || 1, 1, 25);
      save(true); return reply(res), true; }
    if (op === "profile") { const key = String(pl.brand || ""), b = S().brands[key]; if (!b) throw fail(400, "Unbekannte Marke"); const x = pl.profile || {};
      if (pl.reset) delete b.music; else b.music = { mood: MOODS.indexOf(x.mood) > -1 ? x.mood : profile(key).mood, moods: (x.moods || []).filter(m => MOODS.indexOf(m) > -1), genres: vocab(x.genres, GENRES), instruments: vocab(x.instruments, INSTRUMENTS),
        energy: [clamp(+((x.energy || [])[0]) || 1, 1, 5), clamp(+((x.energy || [])[1]) || 5, 1, 5)], bpm: [clamp(+((x.bpm || [])[0]) || 70, 60, 180), clamp(+((x.bpm || [])[1]) || 140, 60, 180)], vocals: !!x.vocals,
        avoid: (Array.isArray(x.avoid) ? x.avoid : String(x.avoid || "").split(",")).map(s => clip(String(s).toLowerCase(), 40)).filter(Boolean).slice(0, 20) };
      save(true); return reply(res), true; }
    const t = byId(String(pl.id || pl.remove || "")); if (!t && op !== "restore") throw fail(404, "Titel nicht gefunden");
    if (op === "tag") { const r = rec(t.id), tg = r.tags = Object.assign({}, t.seed ? (r.tags || {}) : t.tags);
      if (MOODS.indexOf(pl.mood) > -1) { tg.mood = pl.mood; tg.moodGuess = false; } if (pl.moods) tg.moods = uniq([tg.mood || t.tags.mood].concat((pl.moods || []).filter(m => MOODS.indexOf(m) > -1)));
      if (pl.genres) tg.genres = vocab(pl.genres, GENRES); if (pl.instruments) tg.instruments = vocab(pl.instruments, INSTRUMENTS); if (+pl.energy >= 1 && +pl.energy <= 5) tg.energy = Math.round(+pl.energy);
      if (pl.vocals !== undefined) tg.vocals = !!pl.vocals; if (Array.isArray(pl.brands)) tg.brands = pl.brands.filter(k => S().brands[k]); tg.confirmed = true; saveCat(); return reply(res), true; }
    if (op === "rate") { const r = rec(t.id), v = +pl.v > 0 ? 1 : +pl.v < 0 ? -1 : 0, bk = String(pl.brand || ""); if (!S().brands[bk]) throw fail(400, "Unbekannte Marke"); r.rating = Object.assign({}, r.rating || {}); if (v) r.rating[bk] = v; else delete r.rating[bk]; saveCat(); return reply(res), true; }
    if (op === "hide" || (op === "remove" && t.seed)) { rec(t.id).hidden = true; saveCat(); return reply(res), true; }
    if (op === "remove") { if (isAi(t)) { rec(t.id).hidden = true; saveCat(); return reply(res), true; }   // KI-Titel: Nachweis bleibt, nur ausblenden
      try { fs.unlinkSync(t.fileAbs); } catch (e) {} loadCat(); CAT.tracks = CAT.tracks.filter(x => x.id !== t.id); saveCat(); const st = S().mkt; if (Array.isArray(st.music)) st.music = st.music.filter(x => x.id !== t.id); save(true); return reply(res), true; }
    if (op === "restore") { loadCat(); if (t) rec(t.id).hidden = false; else { Object.keys(CAT.seed).forEach(k => { CAT.seed[k].hidden = false; }); CAT.tracks.forEach(x => { if (!isAi(x) || !x.gone) x.hidden = false; }); } saveCat(); return reply(res), true; }
    if (op === "claim") { const r = rec(t.id); r.contentId = "claim"; if (!t.seed) r.license = Object.assign({}, t.license, { contentId: "claim" }); r.claimAt = nowIso(); saveCat();
      const hit = S().posts.filter(x => ["entwurf", "geplant"].indexOf(x.status) > -1 && (trackRef(x) || {}).id === t.id).map(x => ({ id: x.id, brand: x.brand, idea: x.idea || "", scheduledAt: x.scheduledAt || "" }));
      return reply(res, { affected: hit }), true; }
    if (op === "contentId") { const v = ["frei", "unbekannt", "geprueft-frei", "registriert", "claim"].indexOf(pl.value) > -1 ? pl.value : "unbekannt", r = rec(t.id); r.contentId = v; if (!t.seed) r.license = Object.assign({}, t.license, { contentId: v }); saveCat(); return reply(res), true; }
    if (op === "license") { const lk = String(pl.license || ""); if (!licOf(lk) || !LICENSES[lk].upload) throw fail(400, "Bitte eine erlaubte Lizenz wählen."); if (t.seed || isAi(t)) throw fail(400, "Diese Lizenz ist fest.");
      const L = LICENSES[lk]; if (L.attribution && (!clip(pl.artist, 120) || !/^https?:\/\/\S+$/.test(String(pl.sourceUrl || "")))) throw fail(400, "Bei CC BY sind Künstler und Quell-Adresse Pflicht.");
      const r = rec(t.id); r.license = Object.assign({}, t.license, { key: lk, text: L.text, attribution: L.attribution ? "ja" : "", artist: clip(pl.artist, 120), sourceUrl: clip(pl.sourceUrl, 300), contentId: L.contentId }); saveCat(); return reply(res), true; }
    throw fail(400, "Unbekannte Aktion");
  }
  function proofText(t) {
    const pr = t.license.proof ? proofGet(t.license.proof) : null, L = LICENSES[t.license.key] || {};
    return ["Lizenznachweis Musiktitel", "Titel: " + t.name + " (ID " + t.id + ")", "Quelle: " + (SRC_LABEL[t.source] || t.source), "Lizenz: " + (t.license.text || L.text || t.license.key) + (L.url ? " – " + L.url : ""),
      t.license.artist ? "Künstler: " + t.license.artist : "", t.license.sourceUrl ? "Quelle: " + t.license.sourceUrl : "", t.seed ? "Herkunft: FreePD.com (CC0), Archiv https://a.ocv.me/pub/stuff/music/freepd/" : "",
      pr ? "Erzeugt: " + pr.at + " · Anbieter " + pr.provider + (pr.model ? " · Modell " + pr.model : "") + (pr.jobId ? " · Job " + pr.jobId : "") + (pr.seed ? " · Seed " + pr.seed : "") : "",
      pr && pr.prompt ? "Prompt: " + pr.prompt : "", pr && pr.terms ? "Bedingungen: " + pr.terms + (pr.declaredRevenueBelow1M ? " · Umsatz unter 1 Mio. USD bestätigt am " + pr.declaredRevenueBelow1M : "") : "",
      pr && pr.sha256 ? "SHA-256 (Original): " + pr.sha256 : "", pr && pr.fileSha256 ? "SHA-256 (Datei): " + pr.fileSha256 : "", "Content-ID-Status: " + (t.license.contentId || "unbekannt")].filter(Boolean).join("\n");
  }

  return { MOODS, MOOD_DE, GENRES, INSTRUMENTS, TEMPI, LICENSES, PROFILES, STAB, all, byId, list, publicTrack, profile, wantOf, cleanWant, schema, promptLine, promptBlocks, rank, suggest, pick, placeOf, compose, balance,
    postOp, licenseFor, licenseProblem, creditFor, withCredit, overview, cfgPublic, cfg, budget, handleAdmin, weekly, cleanup, upload, analyse, queueAnalysis, previewFile, proofText, tryRemux, ytAi: post => { const r = (post.media || {}).track; return !!(r && r.ai && cfg().ytAi !== false); },
    _test: { loadCat, saveCat, rec, history, jobFor, stabGenerate, stabOnce, ingest, canSpend, spend, composeBlock, stabilityKey, CATF, PROOF, MDIR, PREV, cutLen, ecOf, quality } };
};
// reine Funktionen für Tests und Werkzeuge (Grundstock-Analyse)
Object.assign(module.exports, { MOODS, GENRES, INSTRUMENTS, LICENSES, PROFILES, STAB, winLufs, parseEbur, signal, features, quality, licenseProblem, creditText, withCredit, buildPrompt, cleanVibe, jaccard, mcEncode, mcDecode, hashNum, AV });
