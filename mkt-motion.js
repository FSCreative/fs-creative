/* Marketing: bewegte Reels. Ein Reel ist eine Folge von Szenen (Folien) im Look der Marke (mkt-skins.js).
   Hintergrund: Foto/Video mit Kamerafahrt (ffmpeg). Vordergrund: Text Bild für Bild aus dem Layout gerechnet (satori → resvg) –
   Zeilen, Wörter, Markierungen und Zahlen erscheinen einzeln, im Bewegungsstil der Marke (springen, knallen, gleiten, schweben …).
   Szenenwechsel liegen auf Taktschlägen der Musik (bpm/beat0 bzw. Startpunkt/Verstärkung aus mkt-music.js) und haben je Marke eigene Übergänge (ffmpeg xfade);
   dazu Fortschrittsbalken oben und dezente Geräusche (Wusch beim Wechsel, Plopp beim Erscheinen).
   Nur die Bewegungsphase wird Bild für Bild gerechnet (danach steht der Text – ffmpeg wiederholt das letzte Bild), daher bleibt es schnell. */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const os = require("os");

module.exports = function (R) {
  const W = 1080, H = 1920, FPS = 30;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const E = {
    out3: p => 1 - Math.pow(1 - p, 3),
    outExpo: p => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p),
    outBack: p => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
    inOut: p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
  };
  const rnd = (i, j) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };

  // ───────────── Bewegungsstil je Marke ─────────────
  // unit/word: Art des Erscheinens · st/ws: Abstand Zeilen/Wörter (s) · du/wd: Dauer · trans: Übergänge (xfade-Namen, „cut“ = harter Schnitt
  // mit Ruck) · tx: Übergangsdauer · sfx: Geräusche · hl: Markierung (sweep = Leuchtstift wischt über das Wort)
  const MOTION = {
    kochdu: { unit: "pop", word: "pop", st: 0.16, ws: 0.07, du: 0.5, wd: 0.42, hl: "sweep", trans: ["slideup", "circleopen", "cut", "smoothleft", "zoomin"], tx: 0.42, sfx: { cut: "whoosh", unit: "pop" }, bar: "#ffd84d" },
    kantineur: { unit: "slam", word: "slam", st: 0.14, ws: 0.06, du: 0.34, wd: 0.3, hl: "sweep", trans: ["cut", "wipeleft", "cut", "slideleft", "rectcrop"], tx: 0.32, sfx: { cut: "whoosh", unit: "thump" }, bar: "#f2b134" },
    blitzdings: { unit: "rise", word: "fade", st: 0.2, ws: 0.06, du: 0.8, wd: 0.7, hl: "sweep", trans: ["fade", "smoothup", "fadewhite", "smoothleft"], tx: 0.6, sfx: { cut: "soft", unit: "" }, bar: "#c9a45c", pace: 1.3 },
    valuero: { unit: "rise", word: "fade", st: 0.22, ws: 0.07, du: 0.9, wd: 0.8, hl: "sweep", trans: ["fade", "smoothdown", "fadeblack", "smoothup"], tx: 0.7, sfx: { cut: "soft", unit: "" }, bar: "#3f7d4f", pace: 1.45 },
    skikaiser: { unit: "slideL", word: "slam", st: 0.12, ws: 0.05, du: 0.38, wd: 0.3, hl: "sweep", trans: ["cut", "slideleft", "cut", "wiperight", "zoomin"], tx: 0.3, sfx: { cut: "whoosh", unit: "tick" }, bar: "#e30613" },
    huettengaudi: { unit: "swing", word: "pop", st: 0.17, ws: 0.07, du: 0.55, wd: 0.45, hl: "sweep", trans: ["circleopen", "slideup", "radial", "cut", "smoothright"], tx: 0.45, sfx: { cut: "whoosh", unit: "pop" }, bar: "#c8873a" },
    druckshop: { unit: "glitch", word: "scramble", st: 0.13, ws: 0.05, du: 0.45, wd: 0.5, hl: "sweep", trans: ["pixelize", "cut", "hblur", "zoomin", "rectcrop"], tx: 0.38, sfx: { cut: "whoosh", unit: "tick" }, bar: "#7c5cff" },
    "fs-creative": { unit: "glitch", word: "scramble", st: 0.13, ws: 0.05, du: 0.45, wd: 0.5, hl: "sweep", trans: ["pixelize", "cut", "hblur", "zoomin", "rectcrop"], tx: 0.38, sfx: { cut: "whoosh", unit: "tick" }, bar: "#7c5cff" },
  };
  const DEF = { unit: "rise", word: "pop", st: 0.16, ws: 0.06, du: 0.5, wd: 0.42, hl: "sweep", trans: ["slideup", "fade", "cut", "smoothleft"], tx: 0.42, sfx: { cut: "whoosh", unit: "pop" }, bar: "", pace: 1 };   // pace: Szenenlänge (ruhige Marken länger)
  const profile = key => Object.assign({}, DEF, MOTION[key] || {});

  // Erscheinen: Fortschritt p (0…1) → Deckkraft + Transform
  function anim(kind, p, k) {
    if (p <= 0) return { o: 0, tf: "" };
    if (p >= 1) return { o: 1, tf: "" };
    let o = 1, tx = 0, ty = 0, s = 1, r = 0, e;
    switch (kind) {
      case "pop": e = E.outBack(p); o = clamp(p * 2.6, 0, 1); s = 0.3 + 0.7 * e; ty = (1 - e) * 26; break;
      case "slam": e = E.outExpo(p); o = clamp(p * 4, 0, 1); s = 1 + 0.85 * (1 - e); r = (k % 2 ? -1 : 1) * (1 - e) * 5; break;
      case "slideL": e = E.outExpo(p); o = clamp(p * 3, 0, 1); tx = -(1 - e) * 320; break;
      case "slideR": e = E.outExpo(p); o = clamp(p * 3, 0, 1); tx = (1 - e) * 320; break;
      case "swing": e = E.outBack(p); o = clamp(p * 2.5, 0, 1); r = (1 - e) * (k % 2 ? 9 : -9); ty = (1 - e) * 46; break;
      case "fade": e = E.inOut(p); o = e; ty = (1 - e) * 16; break;
      case "glitch": o = p < 0.45 ? (Math.floor(p * 26) % 3 === 0 ? 0.25 : 1) : 1; tx = p < 0.55 ? (rnd(k, Math.floor(p * 30)) - 0.5) * 46 * (1 - p) : 0; break;
      case "scramble": o = clamp(p * 5, 0, 1); break;
      default: e = E.out3(p); o = e; ty = (1 - e) * 64;   // rise
    }
    const tf = (tx || ty ? "translate(" + tx.toFixed(1) + "px, " + ty.toFixed(1) + "px)" : "") + (s !== 1 ? " scale(" + s.toFixed(4) + ")" : "") + (r ? " rotate(" + r.toFixed(2) + "deg)" : "");
    return { o, tf: tf.trim() };
  }
  const GLYPH = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789#%&";
  function scramble(txt, p, k) {   // Zeichen rasten von links nach rechts ein
    const ch = Array.from(txt), n = ch.length, fixed = Math.floor(n * E.out3(p));   // Zeichen statt UTF-16-Einheiten (Emojis bleiben ganz)
    let out = ""; for (let i = 0; i < n; i++) { const c = ch[i]; out += i < fixed || /\s/.test(c) || !/[A-Za-zÄÖÜäöüß0-9]/.test(c) ? c : GLYPH[Math.floor(rnd(k * 7 + i, Math.floor(p * 40)) * GLYPH.length)]; }
    return out;
  }
  // Zahl hochzählen: Format (Tausenderpunkt, Komma, Einheit) bleibt
  function countFmt(txt, f) {
    const m = String(txt).match(/^([^\d]*)(\d[\d.,]*)(.*)$/); if (!m) return txt;
    const raw = m[2], dec = /,\d{1,2}$/.test(raw) ? raw.split(",")[1].length : 0, val = parseFloat(raw.replace(/\./g, "").replace(",", ".")); if (!isFinite(val)) return txt;
    const v = val * f, s = dec ? v.toFixed(dec).replace(".", ",") : String(Math.round(v)), grp = /\d\.\d{3}/.test(raw);
    return m[1] + (grp ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : s) + m[3];
  }

  // ───────────── Layout vorbereiten: Einheiten (Zeilen/Blöcke), Wörter, Markierungen, Zahlen ─────────────
  function prepare(root, P, grid) {
    const units = [], nums = [];
    (function walk(node, cur, inh) {   // inh: geerbte Schriftgröße/Laufweite (für die Fächer des Zählers)
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(n => walk(n, cur, inh)); return; }
      const pr = node.props || (node.props = {}), st = pr.style || {};
      inh = { fs: +st.fontSize || inh.fs, ls: st.letterSpacing != null ? st.letterSpacing : inh.ls, ta: st.textAlign || inh.ta };
      let u = cur;
      if (st.__u && !cur) { u = { node, words: [], hls: [], st0: st }; units.push(u); }
      if (st.__w && u) u.words.push({ node, st0: st });
      if (st.__hl && u) u.hls.push({ node, st0: st, w: u.words[u.words.length - 1] || null });
      const ch = pr.children;
      if (u && typeof ch === "string" && /^[^\d\s]{0,2}\d[\d.,]*\s?(%|€|k|K|\+|x|×|h|min|km|m)?$/.test(ch.trim()) && (+st.fontSize || 0) >= 90) {
        const ls = typeof inh.ls === "number" ? inh.ls : /em$/.test(inh.ls) ? parseFloat(inh.ls) * inh.fs : parseFloat(inh.ls) || 0;
        nums.push({ node, u, text: ch, align: inh.ta, ls });
      }
      if (u && u.words.length && typeof ch === "string" && st.__w === undefined) { /* Wort-Text unter dem Wort */ }
      walk(ch, u, inh);
    })(root, null, { fs: 16, ls: 0, ta: "" });
    // keine Merker (Layout ohne eigenen Look): Kinder der Wurzel als Einheiten
    if (!units.length) { const kids = [].concat((root.props && root.props.children) || []).filter(x => x && typeof x === "object"); kids.forEach(n => units.push({ node: n, words: [], hls: [], st0: (n.props && n.props.style) || {} })); }
    // Zeitplan: Einheiten nacheinander; Blöcke ohne Wörter (Listenpunkte, Knöpfe) auf halben Taktschlägen
    let t = 0, end = 0, k = 0;
    units.forEach((u, i) => {
      if (!u.words.length && grid > 0 && i > 0) t = Math.ceil(t / grid - 1e-6) * grid;
      u.t0 = t;
      if (u.words.length) { u.words.forEach((w, j) => { w.t0 = t + j * P.ws; w.k = k++; }); u.t1 = t + (u.words.length - 1) * P.ws + P.wd; t += Math.max(P.st, u.words.length * P.ws * 0.75); }
      else { u.k = k++; u.t1 = t + P.du; t += P.st; }
      u.hls.forEach(hl => { hl.t0 = (hl.w ? hl.w.t0 : u.t0) + 0.04; hl.t1 = hl.t0 + Math.max(0.3, P.wd * 0.8); end = Math.max(end, hl.t1); });   // Marker gleich mit dem Wort (dunkle Schrift braucht ihn)
      end = Math.max(end, u.t1);
    });
    nums.forEach(n => { n.t0 = n.u.t0; n.t1 = n.t0 + 0.95; end = Math.max(end, n.t1); });
    // Wort-Texte für „scramble“
    units.forEach(u => u.words.forEach(w => { w.txt = []; (function f(n) { if (!n || typeof n !== "object") return; if (Array.isArray(n)) return n.forEach(f); const c = n.props && n.props.children; if (typeof c === "string") w.txt.push({ node: n, s: c }); else f(c); })(w.node); }));
    return { root, units, nums, end };
  }
  /* Scramble ohne Umbruch-Springen: das echte Wort bleibt unsichtbar im Layout (hält Breite und Zeilen fest), die gewürfelten Zeichen
     liegen mittig darüber – sonst verschieben sich je Bild alle folgenden Wörter, manchmal bricht sogar die Zeile anders um. */
  function steady(real, shown) {
    return { type: "div", props: { style: { display: "flex", position: "relative" }, children: [{ type: "span", props: { style: { opacity: 0 }, children: real } },
      { type: "div", props: { style: { display: "flex", position: "absolute", left: 0, right: 0, top: 0, justifyContent: "center", whiteSpace: "nowrap" }, children: shown } }] } };
  }
  /* Zähler: die Zahl wird Zeichen für Zeichen in Fächer gesetzt, jedes so breit wie das Zeichen der fertigen Zahl (rechtsbündig zugeordnet:
     Einer über Einern). Die zählende Ziffer steht mittig in ihrem Fach – sonst springt die Zahl je Bild hin und her, weil „1“ schmal und
     „0“ breit ist. Auch die fertige Zahl bleibt in den Fächern (kein Ruck am Ende; einziger Unterschied zum Standbild: keine Unterschneidung). */
  function counter(real, shown, ls, align) {
    const R = Array.from(real), S = Array.from(shown), off = R.length - S.length;
    if (off < 0) return shown;
    // satori setzt die Laufweite nur zwischen Zeichen eines Textes – im Fach (ein Zeichen) fehlt sie, daher als Abstand nachgetragen
    const cell = (c, ch, last) => ({ type: "div", props: { style: Object.assign({ display: "flex", position: "relative" }, ls && !last ? { marginRight: ls } : {}), children: [
      { type: "span", props: { style: Object.assign({ opacity: 0 }, /\s/.test(c) ? { whiteSpace: "pre" } : {}), children: c } }].concat(ch && !/\s/.test(ch) ?
      [{ type: "div", props: { style: { display: "flex", position: "absolute", left: 0, right: 0, top: 0, justifyContent: "center" }, children: ch } }] : []) } });
    // Vorzeichen/Währung vorne („+“, „€“) bleibt in seinem Fach, nur die Ziffern füllen ihre Fächer rechtsbündig (sonst hüpft „+“ bei jeder neuen Stelle nach links)
    const m = String(real).match(/^([^\d]*)(\d[\d.,]*)(.*)$/), pre = m ? Array.from(m[1]).length : 0, suf = m ? Array.from(m[3]).length : 0;
    const keepPre = pre > 0 && off > 0 && S.slice(0, pre).join("") === m[1] && S.slice(S.length - suf).join("") === m[3];
    const at = i => keepPre ? (i < pre ? S[i] : i >= pre + off ? S[i - off] : "") : i >= off ? S[i - off] : "";
    const words = [[]]; R.forEach((c, i) => { words[words.length - 1].push(cell(c, at(i), i === R.length - 1)); if (/\s/.test(c)) words.push([]); });   // Leerzeichen bleibt am Wort davor (Umbruch wie im Text)
    return { type: "div", props: { style: { display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start" },
      children: words.filter(w => w.length).map(w => ({ type: "div", props: { style: { display: "flex" }, children: w } })) } };
  }
  // Zustand zum Zeitpunkt t setzen (verändert die Stile im Baum); Rückgabe: Schlüssel zum Wiederverwenden gleicher Bilder
  function setState(pp, P, t) {
    const key = [];
    const mix = (st0, a) => { const s = Object.assign({}, st0); if (a.o < 1) s.opacity = (st0.opacity != null ? +st0.opacity : 1) * a.o; if (a.tf) s.transform = a.tf + (st0.transform ? " " + st0.transform : ""); return s; };
    pp.units.forEach(u => {
      if (u.words.length) {
        u.node.props.style = u.st0;
        u.words.forEach(w => {
          const p = clamp((t - w.t0) / P.wd, 0, 1), a = anim(P.word, p, w.k); w.node.props.style = mix(w.st0, a); key.push(Math.round(p * 1000));
          if (P.word === "scramble") w.txt.forEach((x, i) => { x.node.props.children = p >= 1 ? x.s : steady(x.s, scramble(x.s, p, w.k + i)); });
        });
      } else { const p = clamp((t - u.t0) / P.du, 0, 1); u.node.props.style = mix(u.st0, anim(P.unit, p, u.k)); key.push(Math.round(p * 1000)); }
      u.hls.forEach(hl => {
        const bg = hl.st0.background || hl.st0.backgroundColor, solid = typeof bg === "string" && !/gradient|url\(/.test(bg) && !hl.st0.backgroundClip;
        if (!solid) return; const p = E.inOut(clamp((t - hl.t0) / (hl.t1 - hl.t0), 0, 1)); key.push(Math.round(p * 1000));
        const s = Object.assign({}, hl.st0); delete s.backgroundColor;
        s.background = p >= 1 ? bg : p <= 0 ? "rgba(0,0,0,0)" : "linear-gradient(90deg, " + bg + " 0%, " + bg + " " + (p * 100).toFixed(1) + "%, rgba(0,0,0,0) " + (p * 100).toFixed(1) + "%)";
        hl.node.props.style = s;
      });
    });
    pp.nums.forEach(n => { const p = clamp((t - n.t0) / (n.t1 - n.t0), 0, 1); n.node.props.children = counter(n.text, p >= 1 ? n.text : countFmt(n.text, E.outExpo(p)), n.ls, n.align); key.push(Math.round(p * 1000)); });
    return key.join(",");
  }

  // ───────────── Takt ─────────────
  // energy ≥ 4 (mkt-music.js): Schnitte dürfen auf jeden Schlag fallen (ab 0,42 s je Schlag) statt auf jeden zweiten
  function beatGrid(music) {
    const bpm = music && +music.bpm > 40 && +music.bpm < 220 ? +music.bpm : 0, beat = bpm ? 60 / bpm : 0.5, hi = !!bpm && +music.energy >= 4;
    return { beat, b0: bpm ? +music.beat0 || 0 : 0, cut: beat >= (hi ? 0.42 : 0.55) ? beat : beat * 2, half: Math.max(0.2, beat / 2), synced: !!bpm, energy: (music && +music.energy) || 0 };
  }
  /* Musik formt die Bewegung (nur mit den neuen musicMeta-Feldern aus mkt-music.js, sonst wie bisher):
     Animationstempo aus BPM (schnelle Titel → knackigere Wörter, ruhige → weicher), Energie ≥ 4 → mehr harte Schnitte,
     Energie ≤ 2 → keine harten Schnitte, längere Übergänge, Effekte −3 dB; viel Perkussion → nur jeder zweite Erscheinen-Tick */
  function tune(P, G, mm) {
    if (!mm || mm.energy == null) return P;
    const e = +mm.energy || 3;
    if (G.synced) { const k = clamp(115 / (60 / G.beat), 0.8, 1.25); P.ws *= k; P.du *= k; P.wd *= k; P.st *= k; }
    if (e >= 4) P.trans = P.trans.map((t, i) => i % 2 ? "cut" : t);
    if (e <= 2) { P.trans = P.trans.map(t => t === "cut" ? "fade" : t); P.tx *= 1.2; P.sfxVol = 0.71; }
    if (+mm.onsetRate > 4) P.unitHalf = true;
    P.ec = e >= 4 ? "hi" : e <= 2 ? "lo" : "mid";
    return P;
  }
  // Szenenlängen → Schnitte auf dem Takt, Gesamtlänge (für reel() und plan())
  function timeline(scenes, brand, o, mm) {
    const G = beatGrid(mm), P = tune(profile(brand && brand.key), G, mm);
    const durs = scenes.map((s, i) => { const d = +(o.durations && o.durations[i]) || R.sceneDur(s) * 0.9 * P.pace; return i === 0 ? clamp(d, 1.8, 2.8 * P.pace) : clamp(d, 1.8, 5.5); });
    const c = cuts(durs, G), n = scenes.length;
    while (c[n] < 7.5) c[n] = +(c[n] + G.cut).toFixed(3);   // mindestens 7,5 s: die letzte Szene (Aufruf) bleibt länger stehen
    return { P, G, durs, c, T: c[n] };
  }
  // Nur planen (ohne Rendern): Schnitte und Länge für einen Musik-Takt – mkt-music.js wählt damit Startpunkt und Drop auf dem Aufruf-Schnitt
  function plan(scenes, brand, mm, o) { const tl = timeline(scenes, brand, o || {}, mm || null); return { cuts: tl.c, T: tl.T, cut: tl.G.cut, synced: tl.G.synced, ec: tl.P.ec || "mid" }; }
  // Szenenlängen (Lesezeit) → Schnittzeitpunkte auf Taktschlägen
  function cuts(durs, G) {
    const c = [0]; let at = 0;
    durs.forEach((d, i) => {
      const want = at + d, n = Math.max(1, Math.round((want - G.b0) / G.cut)); let x = G.b0 + n * G.cut;
      while (x - at < Math.min(1.5, d * 0.8)) x += G.cut;
      if (i === durs.length - 1) x = Math.max(x, at + 1.6);
      c.push(+x.toFixed(3)); at = x;
    });
    return c;
  }

  // ───────────── ffmpeg ─────────────
  function ff(args, stdinFrames) {
    return new Promise((resolve, reject) => {
      const bin = R.FFMPEG(); if (!bin) return reject(new Error("ffmpeg fehlt"));
      const p = spawn(bin, ["-hide_banner", "-loglevel", "error", "-y"].concat(args), { stdio: [stdinFrames ? "pipe" : "ignore", "ignore", "pipe"] });
      let err = ""; p.stderr.on("data", d => { err += d; if (err.length > 20000) err = err.slice(-20000); });
      const to = setTimeout(() => { try { p.kill("SIGKILL"); } catch (e) {} }, 8 * 60 * 1000);
      p.on("error", e => { clearTimeout(to); reject(e); });
      p.on("close", code => { clearTimeout(to); code === 0 ? resolve() : reject(new Error("ffmpeg: " + (err.trim().split("\n").slice(-3).join(" | ") || "Code " + code))); });
      if (stdinFrames) stdinFrames(p.stdin).then(() => p.stdin.end(), e => { try { p.stdin.destroy(); } catch (x) {} reject(e); });
    });
  }
  const write = (s, buf) => new Promise((res, rej) => { if (s.destroyed) return rej(new Error("ffmpeg beendet")); s.write(buf) ? res() : s.once("drain", res); });

  // ───────────── Ebenen: Hintergrund (mit Kamerafahrt) und Vordergrund (steht still) ─────────────
  /* Die Kamerafahrt läuft nur über den Hintergrund: Wurzel-Fläche und Deko (__de: Fotos, Verläufe, Kreise, Sticker).
     Text, Karten unter dem Text (ungemarkte Flächen) und das Logo bilden den Vordergrund und stehen nach dem Einfliegen pixelgenau still –
     so laufen Logo/Karten und Text nicht auseinander, und die Schrift wird nicht Bild für Bild neu abgetastet (früher lief die Fahrt über
     das fertige Bild: Kanten flimmerten, der Encoder rechnete die Schrift in jedem Bild neu → „zittert“). */
  const isLogo = (n, logo) => { const st = (n.props && n.props.style) || {}; return !!st.__logo || (n.type === "img" && !!logo && n.props.src === logo); };
  function hasLogo(n, logo) { if (!n || typeof n !== "object") return false; if (Array.isArray(n)) return n.some(x => hasLogo(x, logo)); return isLogo(n, logo) || hasLogo(n.props && n.props.children, logo); }
  // Fläche/Farbe entfernen, Größe und Lage behalten (Rahmenbreite bleibt, nur unsichtbar)
  function unpaint(st, type) {
    const s = Object.assign({}, st);
    ["background", "backgroundColor", "backgroundImage", "boxShadow", "textShadow"].forEach(k => delete s[k]);
    ["border", "borderTop", "borderRight", "borderBottom", "borderLeft"].forEach(k => { if (typeof s[k] === "string") { const m = s[k].trim().match(/^(\S+)(?:\s+(solid|dashed|dotted|double))?/); s[k] = (m ? m[1] : "0px") + " " + ((m && m[2]) || "solid") + " transparent"; } });
    if (s.borderColor) s.borderColor = "transparent";
    s.color = "transparent";
    if (type === "img") s.opacity = 0;
    return s;
  }
  // Hintergrund: nur Wurzel-Fläche und Deko zeichnen (Logo nicht – das steht im Vordergrund)
  function bgLayer(root, logo) {
    (function walk(n, top) {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(x => walk(x, false));
      const pr = n.props || (n.props = {}), st = pr.style || {};
      if (st.__de) { if (hasLogo(n, logo)) pr.style = Object.assign({}, st, { opacity: 0 }); return; }
      if (!top) pr.style = unpaint(st, n.type);
      walk(pr.children, false);
    })(root, true);
    return root;
  }
  /* Vordergrund: alles außer Deko. Dazu kommen das Logo (steckt in Deko; nur wenn die Szene es zeigt – über Video gibt es keins) und
     Deko innerhalb eines Text-Blocks (z. B. Foto-Kachel einer Liste – gehört zum Block und fliegt mit ihm ein; fehlte früher im Reel ganz).
     Unsichtbare Fotos werden durch ein leeres Bild ersetzt (spart das Dekodieren je Bild). */
  const BLANK = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>').toString("base64");
  function fgLayer(root, logo, withLogo) {
    (function walk(n, hidden, unit) {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(x => walk(x, hidden, unit));
      const pr = n.props || (n.props = {}), st = pr.style || {};
      if (st.__u) unit = true;
      if (st.__de && !hidden) { if (unit || (withLogo && hasLogo(n, logo))) { const s = Object.assign({}, st); delete s.opacity; pr.style = s; } else hidden = true; }
      if (hidden && n.type === "img" && typeof pr.src === "string" && pr.src.length > 4000 && +(pr.width || st.width) > 0 && +(pr.height || st.height) > 0) pr.src = BLANK;
      walk(pr.children, hidden, unit);
    })(root, false, false);
    return root;
  }

  /* Kamerafahrt über den Hintergrund – wechselt je Szene. A = Stärke (Foto/Video kräftiger, reines Layout sanft), Ruck beim harten Schnitt nur leicht.
     Umsetzung mit „perspective“ (Subpixel, kubisch interpoliert) statt zoompan: zoompan rundet Ausschnitt-Position je Bild auf ganze Pixel → Wackeln/Zittern. */
  const KB = [   // [Zoom, Lage x 0…1, Lage y 0…1] als Ausdruck in u (0→1 über die Szene, weich ein-/ausgeblendet)
    A => ["1+" + A + "*U", "0.5", "0.5"],
    A => ["1+" + A + "*(1-U)", "0.5", "0.5"],
    A => ["1+" + A, "U", "0.5"],
    A => ["1+" + A, "(1-U)", "0.5"],
    A => ["1+" + A, "0.5", "(1-U)"],
  ];
  function camera(kb, N, punch, d0) {
    const U = "(st(1,clip(on/" + N + ",0,1))*0+ld(1)*ld(1)*(3-2*ld(1))*0.35+ld(1)*0.65)";   // fast linear, sanft an den Enden
    const Z = "(" + kb[0].replace(/U/g, U) + (punch ? "+0.035*pow(max(0,1-max(0,on/30-" + d0 + ")/0.35),2)*gte(on/30," + d0 + ")" : "") + ")";
    const w = "(W/" + Z + ")", h = "(H/" + Z + ")", l = "(" + kb[1].replace(/U/g, U) + "*(W-" + w + "))", t = "(" + kb[2].replace(/U/g, U) + "*(H-" + h + "))";
    const q = v => "'" + v + "'";
    return "perspective=x0=" + q(l) + ":y0=" + q(t) + ":x1=" + q(l + "+" + w) + ":y1=" + q(t) + ":x2=" + q(l) + ":y2=" + q(t + "+" + h) + ":x3=" + q(l + "+" + w) + ":y3=" + q(t + "+" + h) + ":interpolation=cubic:eval=frame";
  }

  // Eine Szene: Hintergrund (Kamerafahrt/Video) + Vordergrund-Animation ab „delay“ (= Mitte des Übergangs) → seg.mp4
  async function sceneSeg(s, brand, o, i, len, delay, punch) {
    const P = o.P, dir = o.dir, bgVid = o.bgVideos && o.bgVideos[i];
    const variant = s.template === "cta" ? "brand" : (o.variants ? o.variants[i % o.variants.length] : (i % 2 ? "dark" : "brand"));
    const base = { format: "reel", variant: bgVid ? "dark" : variant, url: o.url || "", overVideo: !!bgVid, v: (o.v || 0) + i, cover: i === 0, cv: o.cv || 0 }, LF = R.fmtFor(base, brand);   // Layout-Größe (reel: 900×1600 → 1080×1920)
    const logo = (brand && brand.logo) || "", bgPng = path.join(dir, "bg" + i + ".png"), bgTree = R.postEl(s, brand, Object.assign({}, base, { layer: "bg", anim: true })), withLogo = hasLogo(bgTree, logo);
    fs.writeFileSync(bgPng, await R.png(bgLayer(bgTree, logo), LF.w, LF.h, { scale: W / LF.w }));
    const tree = fgLayer(R.postEl(s, brand, Object.assign({}, base, { layer: "fg", anim: true })), logo, withLogo);
    const pp = prepare(tree, P, o.G.half), N = Math.round(len * FPS), animEndF = Math.min(N, Math.ceil((delay + pp.end + 0.05) * FPS) + 1);
    const inBg = bgVid ? ["-stream_loop", "-1", "-t", len.toFixed(3), "-i", bgVid, "-loop", "1", "-framerate", String(FPS), "-t", len.toFixed(3), "-i", bgPng]
      : ["-loop", "1", "-framerate", String(FPS), "-t", len.toFixed(3), "-i", bgPng];
    const fgIdx = bgVid ? 2 : 1;
    const bgF = bgVid ? "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,eq=brightness=-0.06:saturation=1.08[b0];[b0][1:v]overlay=0:0[b]"
      : "[0:v]scale=1080:1920,setsar=1,fps=30[b]";
    const kb = KB[(o.v + i) % KB.length](bgVid || s.image ? 0.07 : 0.035), d0 = delay.toFixed(3);
    // Kamerafahrt nur über den Hintergrund (RGB, kubisch), Text-Ebene darüber an fester Stelle (nach dem Einfliegen: letztes Bild steht).
    // overlay im gepackten RGB: mit format=gbrp/yuv444 rechnet ffmpeg 6 vormultipliziertes Alpha falsch (Weiß → #efefef)
    const fc = bgF + ";[b]format=gbrp," + camera(kb, N, punch, d0) + ",format=rgb24[bc];[" + fgIdx + ":v]format=rgba[f];[bc][f]overlay=0:0:alpha=premultiplied:eof_action=repeat:format=rgb,format=yuv420p[v]";
    const seg = path.join(dir, "seg" + i + ".mp4"), units = [];
    pp.units.forEach(u => units.push(delay + u.t0));
    let lastKey = null, lastBuf = null, frames = 0, tJs = 0; const t0 = Date.now();
    await ff(inBg.concat(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", W + "x" + H, "-framerate", String(FPS), "-i", "pipe:0", "-filter_complex", fc, "-map", "[v]", "-t", len.toFixed(3)]).concat(R.VENC).concat([seg]),
      async stdin => { for (let f = 0; f < animEndF; f++) { const key = setState(pp, P, f / FPS - delay); if (key !== lastKey) { const tj = Date.now(); lastBuf = await R.rawFrame(pp.root, LF.w, LF.h, W); tJs += Date.now() - tj; lastKey = key; frames++; } await write(stdin, lastBuf); } });
    if (process.env.MOTION_DEBUG) console.log("motion: Szene " + i + " · " + frames + " Bilder gerechnet (" + tJs + " ms) · gesamt " + (Date.now() - t0) + " ms");
    return { seg, units, rendered: frames, animEnd: delay + pp.end };
  }

  /* Szenen parallel in Threads (mkt-motion-worker.js) – je Szene eigener satori/resvg; bis zu 4 gleichzeitig.
     Scheitert ein Thread (z. B. kein worker_threads), rechnet der Hauptthread die Szenen nacheinander. */
  async function runScenes(jobs, brand, o) {
    const oo = { dir: o.dir, url: o.url, v: o.v, bgVideos: o.bgVideos || null, variants: o.variants || null, P: o.P, G: o.G };
    const nw = Math.max(1, Math.min(jobs.length, 4, (os.cpus() || []).length || 1, +process.env.MOTION_THREADS || 4));
    let W0 = null; try { W0 = require("worker_threads").Worker; } catch (e) { W0 = null; }
    if (!W0 || nw < 2 || process.env.MOTION_THREADS === "1") { const out = []; for (const j of jobs) out.push(await sceneSeg(j.s, brand, oo, j.i, j.len, j.delay, j.punch)); return out; }
    const out = new Array(jobs.length), workers = []; let next = 0, failed = null;
    try {
      await Promise.all(Array.from({ length: nw }, () => new Promise((resolve) => {
        let wk; try { wk = new W0(path.join(__dirname, "mkt-motion-worker.js")); } catch (e) { failed = e; return resolve(); }
        workers.push(wk);
        const go = () => { if (failed || next >= jobs.length) return resolve(); const j = jobs[next++]; wk.postMessage({ id: j.i, s: j.s, brand, o: oo, i: j.i, len: j.len, delay: j.delay, punch: j.punch }); };
        wk.on("message", m => { if (m.ok) out[m.id] = m.r; else failed = failed || new Error(m.error); go(); });
        wk.on("error", e => { failed = failed || e; resolve(); });
        go();
      })));
    } finally { workers.forEach(w => { try { w.terminate(); } catch (e) {} }); }
    if (failed) throw failed;
    return out;
  }

  // ───────────── Reel ─────────────
  /* scenes: Folien · brand: renderBrand · o: { dir, url, v, bgVideos, music (Datei), musicMeta, outFile, coverFile, variants, durations }
     musicMeta: { bpm, beat0 } wie bisher; neu (mkt-music.js): offset (Startpunkt im Titel, auf dem Takt → beat0 = 0), gainDb (statisch auf −14 LUFS),
     fadeIn, fadeOut, energy (1–5), onsetRate, drop (Sekunden ab Start, liegt auf dem Aufruf-Schnitt). Ohne die neuen Felder: Verhalten wie bisher. */
  async function reel(scenes, brand, o) {
    if (!R.videoReady()) throw new Error("Video-Erzeugung nicht verfügbar (ffmpeg fehlt)");
    o = Object.assign({}, o || {}); fs.mkdirSync(o.dir, { recursive: true });
    const mm = o.music ? o.musicMeta : null, tl = timeline(scenes, brand, o, mm), P = o.P = tl.P, G = o.G = tl.G; o.v = +o.v || 0;
    const c = tl.c, n = scenes.length, T = tl.T, fresh = !!(mm && (mm.gainDb != null || +mm.offset > 0 || mm.energy != null));
    // Übergänge: je Wechsel ein Typ aus dem Markenprofil (rotierend), „cut“ = harter Schnitt mit Ruck
    const tr = []; for (let k = 1; k < n; k++) { const t = P.trans[(o.v + k - 1) % P.trans.length]; tr[k] = { type: t === "cut" ? "fade" : t, X: t === "cut" ? 0.06 : Math.min(P.tx, (c[k] - c[k - 1]) * 0.4, (c[k + 1] - c[k]) * 0.4), cut: t === "cut" }; }
    const X = k => (k >= 1 && k < n ? tr[k].X : 0);
    const segs = [], unitTimes = [], jobs = scenes.map((s, i) => ({ s, i, len: c[i + 1] - c[i] + X(i) / 2 + X(i + 1) / 2, delay: X(i) / 2 + (i === 0 ? 0.08 : 0.04), start: c[i] - X(i) / 2, punch: i > 0 && tr[i].cut }));
    const res = await runScenes(jobs, brand, o);
    jobs.forEach((jb, i) => { segs.push(res[i].seg); res[i].units.forEach(t => unitTimes.push(jb.start + t)); });
    // Geräusche: Wusch kurz vor jedem Wechsel, Plopp/Tick beim Erscheinen (gedämpft), Rums am Anfang
    const ev = [];
    if (P.sfx.cut === "whoosh") for (let k = 1; k < n; k++) ev.push({ type: "whoosh", t: Math.max(0, c[k] - 0.24), d: 0.46, v: tr[k].cut ? 0.22 : 0.3 });
    if (P.sfx.cut === "soft") for (let k = 1; k < n; k++) ev.push({ type: "whoosh", t: Math.max(0, c[k] - 0.4), d: 0.8, v: 0.12 });
    if (P.sfx.unit) unitTimes.slice(0, 40).filter((t, j) => !P.unitHalf || j % 2 === 0).forEach((t, j) => ev.push(P.sfx.unit === "pop" ? { type: "tick", t, f: 900 + (j % 3) * 180, v: 0.1 } : P.sfx.unit === "thump" ? { type: j % 4 ? "tick" : "thump", t, f: 1500, v: 0.08 } : { type: "tick", t, f: 2600, v: 0.07 }));
    const sfx = ev.length ? path.join(o.dir, "sfx.wav") : ""; if (sfx) fs.writeFileSync(sfx, R.wav(T + 0.5, ev));
    // zusammensetzen: Übergänge (xfade), Fortschrittsbalken, Ton
    const out = o.outFile || path.join(o.dir, "reel.mp4"), music = o.music && fs.existsSync(o.music) ? o.music : "";
    const args = []; segs.forEach(s => args.push("-i", s));
    let fc = "", last = "[0:v]";
    for (let k = 1; k < n; k++) { const lbl = "[x" + k + "]"; fc += last + "[" + k + ":v]xfade=transition=" + tr[k].type + ":duration=" + tr[k].X.toFixed(3) + ":offset=" + (c[k] - tr[k].X / 2).toFixed(3) + lbl + ";"; last = lbl; }
    const bar = (P.bar || (brand && brand.colors && brand.colors.primary) || "#ffffff").replace("#", "0x");
    fc += "color=c=" + bar + ":s=1080x10:r=30:d=" + T.toFixed(3) + "[pb];" + last + "drawbox=x=0:y=0:w=iw:h=10:color=white@0.22:t=fill[xb];[xb][pb]overlay=x='-w+w*t/" + T.toFixed(3) + "':y=0:shortest=1,format=yuv420p[v]";
    let ai = n; const sfxVol = 0.9 * (P.sfxVol || 1);
    if (music) { args.push("-stream_loop", "-1", "-i", music); fc += ";" + musicChain("[" + ai + ":a]", fresh ? mm : null, T) + "[m]"; ai++; }
    if (sfx) { args.push("-i", sfx); fc += ";[" + ai + ":a]atrim=0:" + T.toFixed(3) + ",volume=" + sfxVol.toFixed(3) + "[s]"; ai++; }
    // neue Musik (gainDb): Limiter −1,5 dBFS, damit nach AAC kein True Peak über −1 dBTP entsteht; bisher 0,95
    const lim = "alimiter=limit=" + (fresh ? "0.84" : "0.95") + ":level=disabled";
    if (music && sfx) fc += ";[m][s]amix=inputs=2:duration=first:normalize=0," + lim + "[a]"; else if (music) fc += fresh ? ";[m]" + lim + "[a]" : ";[m]anull[a]"; else if (sfx) fc += ";[s]apad=whole_dur=" + T.toFixed(3) + "[a]";
    else { args.push("-f", "lavfi", "-t", T.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo"); fc += ";[" + ai + ":a]anull[a]"; }
    await ff(args.concat(["-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-t", T.toFixed(3)]).concat(R.VENC).concat(["-c:a", "aac", "-b:a", "160k", "-ar", "48000", out]));
    const ld = music && fresh ? await loudFix(out) : {};
    // Titelbild: erste Szene, wenn der Text steht
    const cover = o.coverFile || path.join(o.dir, "cover.jpg"), ct = Math.min(c[1] - 0.15, Math.max(1.0, unitTimes.filter(t => t < c[1]).pop() + 0.6 || 1.2));
    await ff(["-ss", ct.toFixed(2), "-i", out, "-frames:v", "1", "-q:v", "2", cover]);
    // sfx (Ereignisliste, klein) + Raster: damit „Andere Musik“ nur den Ton neu mischen kann, ohne das Video neu zu rechnen
    return { file: out, cover, duration: Math.round(T * 10) / 10, cuts: c, synced: G.synced, sfx: ev, grid: { T, cuts: c, cut: G.cut, synced: G.synced, ec: P.ec || "mid", sfxVol: P.sfxVol || 1 }, lufs: ld.lufs, tp: ld.tp };
  }
  // Musik-Kette (ffmpeg-Filter): R.musicChain aus mkt-render.js – Startpunkt, statische Verstärkung, Fades (ohne neue Felder wie bisher)
  function musicChain(label, mm, T) {
    if (R.musicChain) return R.musicChain(label, mm, T);
    return label + "atrim=0:" + T.toFixed(3) + ",asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.25,afade=t=out:st=" + Math.max(0, T - 1.1).toFixed(3) + ":d=1.1,volume=0.9";
  }
  // Lautheit messen (ebur128 auf dem fertigen Ton) → { lufs, tp }
  function measure(file) {
    return new Promise(resolve => {
      const bin = R.FFMPEG(); if (!bin) return resolve({});
      const p = spawn(bin, ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "ebur128=peak=true:framelog=verbose", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
      let err = ""; p.stderr.on("data", d => { err += d; if (err.length > 200000) err = err.slice(-200000); }); p.on("error", () => resolve({}));
      p.on("close", () => { const s = err.slice(err.lastIndexOf("Summary:")), I = s.match(/I:\s*(-?[\d.]+)\s*LUFS/), tp = s.match(/Peak:\s*(-?[\d.]+|-inf)\s*dBFS/);
        resolve({ lufs: I ? +I[1] : null, tp: tp && isFinite(+tp[1]) ? +tp[1] : null }); });
    });
  }
  // Nachkontrolle: weicht das fertige Reel mehr als 0,5 LU von −14 LUFS ab (Fades kurzer Reels drücken etwas), nur den Ton neu muxen (Video bleibt, -c:v copy)
  async function loudFix(out) {
    let m = await measure(out);
    if (m.lufs != null && Math.abs(m.lufs + 14) > 0.5) {
      const tmp = out.replace(/\.mp4$/, "") + ".fix.mp4", g = Math.max(-12, Math.min(12, -14 - m.lufs));
      await ff(["-i", out, "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-af", "volume=" + g.toFixed(2) + "dB,alimiter=limit=0.79:level=disabled", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", tmp]);
      fs.renameSync(tmp, out); m = await measure(out);
    }
    return { lufs: m.lufs != null ? Math.round(m.lufs * 10) / 10 : null, tp: m.tp != null ? Math.round(m.tp * 10) / 10 : null };
  }
  /* „Andere Musik“ mit gleichem Schnittraster: Video bleibt (-c:v copy), Ton = neue Musik (Startpunkt/Verstärkung/Tempo-Angleichung) + gemerkte Effekte.
     o: { video, sfx (Ereignisse aus reel()), sfxVol, T, music, musicMeta { offset, gainDb, fadeIn, fadeOut, tempo }, outFile, dir } */
  async function remux(o) {
    if (!R.videoReady()) throw new Error("ffmpeg fehlt");
    const dir = o.dir || path.join(os.tmpdir(), "remux-" + process.pid + "-" + Date.now()); fs.mkdirSync(dir, { recursive: true });
    try {
      const T = +o.T, ev = Array.isArray(o.sfx) ? o.sfx : [], sfx = path.join(dir, "sfx.wav"); if (ev.length) fs.writeFileSync(sfx, R.wav(T + 0.5, ev));
      const args = ["-i", o.video, "-stream_loop", "-1", "-i", o.music].concat(ev.length ? ["-i", sfx] : []), lim = "alimiter=limit=0.84:level=disabled";
      let fc = musicChain("[1:a]", Object.assign({ gainDb: 0 }, o.musicMeta || {}), T) + "[m]";
      fc += ev.length ? ";[2:a]atrim=0:" + T.toFixed(3) + ",volume=" + (0.9 * (+o.sfxVol || 1)).toFixed(3) + "[s];[m][s]amix=inputs=2:duration=first:normalize=0," + lim + "[a]" : ";[m]" + lim + "[a]";
      await ff(args.concat(["-filter_complex", fc, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-t", T.toFixed(3), "-movflags", "+faststart", o.outFile]));
      return Object.assign({ file: o.outFile }, await loudFix(o.outFile));
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  }
  // ───────────── Tempo eines Musikstücks (für eigene Uploads; Bibliothek hat bpm/beat0 schon in index.json) ─────────────
  // Spektraler Fluss (FFT 1024, Schritt 256 bei 22,05 kHz) → Autokorrelation 70–170 BPM → Phase des ersten Schlags
  function tempo(file) {
    return new Promise((resolve) => {
      const bin = R.FFMPEG(); if (!bin) return resolve(null);
      const p = spawn(bin, ["-hide_banner", "-loglevel", "error", "-i", file, "-t", "40", "-ac", "1", "-ar", "22050", "-f", "f32le", "pipe:1"], { stdio: ["ignore", "pipe", "ignore"] });
      const chunks = []; p.stdout.on("data", d => chunks.push(d)); p.on("error", () => resolve(null));
      p.on("close", () => { try { const b = Buffer.concat(chunks); resolve(b.length > 22050 * 16 ? tempoOf(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4))) : null); } catch (e) { resolve(null); } });
    });
  }
  function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const h = i + k + len / 2, vr = re[h] * cr - im[h] * ci, vi = re[h] * ci + im[h] * cr; re[h] = re[i + k] - vr; im[h] = im[i + k] - vi; re[i + k] += vr; im[i + k] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
  function tempoOf(x) {
    const SR = 22050, N = 1024, HOP = 256, frames = Math.floor((x.length - N) / HOP), win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    let prev = new Float32Array(N / 2); const flux = new Float32Array(frames), re = new Float32Array(N), im = new Float32Array(N);
    for (let f = 0; f < frames; f++) { for (let i = 0; i < N; i++) { re[i] = x[f * HOP + i] * win[i]; im[i] = 0; } fft(re, im);
      let s = 0; const mag = new Float32Array(N / 2); for (let k = 1; k < N / 2; k++) { mag[k] = Math.log(1 + 100 * Math.hypot(re[k], im[k])); const d = mag[k] - prev[k]; if (d > 0) s += d; } prev = mag; flux[f] = s; }
    const on = new Float32Array(frames); for (let i = 0; i < frames; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - 20); k < Math.min(frames, i + 20); k++) { s += flux[k]; c++; } on[i] = Math.max(0, flux[i] - s / c); }
    const fps = SR / HOP, val = t => { const i = Math.floor(t), f = t - i; return (on[i] || 0) * (1 - f) + (on[i + 1] || 0) * f; };
    const score = bpm => { const lag = fps * 60 / bpm; let s = 0; for (let i = 0; i + 4 * lag < frames; i++) s += on[i] * (val(i + lag) + val(i + 2 * lag) * 0.6 + val(i + 4 * lag) * 0.4); return s; };
    let best = 0, bb = 0; const all = []; for (let bpm = 70; bpm <= 170; bpm += 0.25) { const s = score(bpm) * Math.exp(-Math.pow(Math.log2(bpm / 112), 2) / 0.6); all.push(s); if (s > best) { best = s; bb = bpm; } }
    let b2 = bb, s2 = 0; for (let bpm = bb - 0.5; bpm <= bb + 0.5; bpm += 0.02) { const s = score(bpm); if (s > s2) { s2 = s; b2 = bpm; } }
    const per = fps * 60 / b2; let bp = 0, bs = -1; for (let ph = 0; ph < per; ph += 0.25) { let s = 0; for (let t = ph; t < frames; t += per) s += val(t); if (s > bs) { bs = s; bp = ph; } }
    const bpm = Math.abs(b2 - Math.round(b2)) < 0.25 ? Math.round(b2) : Math.round(b2 * 100) / 100, b0 = Math.round((bp * HOP + N / 2) / SR * 1000) / 1000;
    const med = all.sort((a, b) => a - b)[Math.floor(all.length / 2)] || 0;   // Konfidenz: 1 − Median/Bestwert (unter 0,35 gilt der Titel als ungesynct, siehe mkt-music.js)
    return best > 0 ? { bpm, beat0: b0 < 0.05 ? 0 : b0, conf: Math.round(Math.max(0, 1 - med / best) * 100) / 100 } : null;
  }
  return { reel, plan, remux, measure, tempo, MOTION, profile, _scene: sceneSeg, _test: { prepare, setState, anim, countFmt, scramble, cuts, beatGrid, bgLayer, fgLayer, steady, counter, tune, timeline } };
};
