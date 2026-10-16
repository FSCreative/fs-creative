/* Vorlagen für den Druckshop-Designer. Jede Vorlage = Stil (Farben, Schriften, Dekor) + Layout, berechnet für das gewählte Format.
   Koordinaten in mm relativ zum Endformat (0,0 = linke obere Ecke des Endformats; negative Werte = Beschnitt).
   Elemente: bg, rect, circle, line, text, img (Platzhalter für Bild/Logo), qr. Alle Texte sind editierbare Platzhalter. */
(function () {
  "use strict";
  var TXT = {
    visitenkarten: { H: "Maria Muster", S: "Inhaberin · Gestalterin", O: "Muster Atelier", B: "", F: "+43 664 123 45 67\nmaria@muster-atelier.at\nwww.muster-atelier.at", A: "Dorfstraße 1 · 6793 Gaschurn", W: "www.muster-atelier.at", logo: true },
    flyer: { H: "Sommerfest", S: "Musik · Kulinarik · gute Leute", O: "Samstag, 12. Juni · ab 17 Uhr", B: "Feiere mit uns den Sommer: Live-Musik, regionale Schmankerl und ein buntes Programm für die ganze Familie.", F: "Dorfplatz Gaschurn\nwww.muster-verein.at", A: "Eintritt frei", W: "www.muster-verein.at", img: true, logo: true },
    plakate: { H: "Konzert im Park", S: "Open Air · Live · Regional", O: "Freitag, 18. Juli · 19:30 Uhr", B: "Drei Bands, ein Abend unter freiem Himmel. Für Essen und Getränke ist gesorgt.", F: "Kurpark Schruns\nTickets: www.muster-kultur.at", A: "Vorverkauf 15 €", W: "www.muster-kultur.at", img: true, logo: true },
    folder: { H: "Speisekarte", S: "Gasthaus Muster", O: "Regional & saisonal", B: "Vorspeisen\nHausgemachte Suppe des Tages · 5,90 €\nSalat vom Markt · 7,50 €\n\nHauptspeisen\nKäsknöpfle mit Röstzwiebeln · 14,90 €\nWiener Schnitzel vom Kalb · 21,50 €\n\nDesserts\nApfelstrudel mit Vanilleeis · 6,90 €", F: "Dorfstraße 1 · 6793 Gaschurn\n+43 5558 1234 · www.gasthaus-muster.at", A: "Täglich 11–22 Uhr", W: "www.gasthaus-muster.at", img: true, logo: true },
    aufkleber: { H: "Handmade", S: "in Vorarlberg", O: "", B: "", F: "www.muster-atelier.at", A: "", W: "www.muster-atelier.at", logo: true },
    rollups: { H: "Ihr Partner für Druck & Design", S: "Persönlich. Regional. Schnell.", O: "", B: "• Beratung vor Ort\n• Gestaltung aus einer Hand\n• Lieferung in ganz Österreich", F: "+43 664 123 45 67\nwww.muster-firma.at", A: "", W: "www.muster-firma.at", img: true, logo: true },
  };
  // Grundgrößen (pt) bei Referenzmaß (kürzere Seite bzw. Paneelbreite in mm)
  var SIZE = { visitenkarten: [55, 13, 7.5, 7, 6.6], flyer: [148, 40, 15, 10.5, 9.5], plakate: [420, 118, 40, 26, 22], folder: [99, 26, 11, 8.6, 8], aufkleber: [50, 15, 8, 7, 6.5], rollups: [850, 150, 64, 54, 46] };
  var STYLES = {
    klar: { name: "Klar", bg: "#ffffff", fg: "#1d1d1f", mute: "#6e6e73", ac: "#0a84ff", ac2: "#5ac8fa", fh: "Montserrat", hb: true, fb: "Inter", lay: "left" },
    nacht: { name: "Nachtblau", bg: "#0a0a0f", fg: "#f5f5f7", mute: "#a1a1aa", ac: "#0a84ff", ac2: "#9d4eff", fh: "Poppins", hb: true, fb: "Inter", lay: "left", glow: true },
    elegant: { name: "Elegant", bg: "#f7f3ec", fg: "#2b2622", mute: "#7a6f64", ac: "#b08d57", ac2: "#d9c3a0", fh: "Playfair Display", hb: false, fb: "Lora", lay: "frame" },
    akzent: { name: "Akzentband", bg: "#ffffff", fg: "#1d1d1f", mute: "#6e6e73", ac: "#0a84ff", ac2: "#003a75", fh: "Raleway", hb: true, fb: "Open Sans", lay: "band" },
    bold: { name: "Plakativ", bg: "#ffe600", fg: "#111111", mute: "#3a3a3a", ac: "#111111", ac2: "#ffffff", fh: "Bebas Neue", hb: false, fb: "Montserrat", lay: "bold", upper: true },
    natur: { name: "Natur", bg: "#eef2e6", fg: "#26352a", mute: "#5d6b5f", ac: "#5c7f4f", ac2: "#c9d8b6", fh: "Lora", hb: true, fb: "Nunito", lay: "center", leaves: true },
    split: { name: "Bild & Text", bg: "#ffffff", fg: "#1d1d1f", mute: "#6e6e73", ac: "#ff6b35", ac2: "#ffd2bf", fh: "Oswald", hb: true, fb: "Lato", lay: "split", upper: true },
    kreise: { name: "Kreise", bg: "#101820", fg: "#ffffff", mute: "#b8c2cc", ac: "#ffb703", ac2: "#fb8500", fh: "Montserrat", hb: true, fb: "Nunito", lay: "center", circles: true },
    pastell: { name: "Pastell", bg: "#fdf1ec", fg: "#3b2f36", mute: "#8a7a80", ac: "#e07a8f", ac2: "#f6c9d0", fh: "Poppins", hb: true, fb: "Nunito", lay: "center", blobs: true },
    retro: { name: "Retro", bg: "#f4e9d8", fg: "#2d1e12", mute: "#6b5444", ac: "#d9541e", ac2: "#f2a541", fh: "Bebas Neue", hb: false, fb: "Lato", lay: "bold", upper: true, stripes: true },
    mono: { name: "Minimal", bg: "#ffffff", fg: "#000000", mute: "#5a5a5a", ac: "#000000", ac2: "#d9d9d9", fh: "Inter", hb: true, fb: "Inter", lay: "left" },
    business: { name: "Business", bg: "#ffffff", fg: "#0f2742", mute: "#5b6b7f", ac: "#0f2742", ac2: "#2fb3a0", fh: "Montserrat", hb: true, fb: "Open Sans", lay: "band" },
    neon: { name: "Neon", bg: "#0b0b1a", fg: "#ffffff", mute: "#b3b3d1", ac: "#ff2fb9", ac2: "#00e5ff", fh: "Poppins", hb: true, fb: "Inter", lay: "left", glow: true },
    terracotta: { name: "Terracotta", bg: "#f3e6da", fg: "#3a2a20", mute: "#7d6556", ac: "#c0583a", ac2: "#e9b49a", fh: "Playfair Display", hb: true, fb: "Lato", lay: "split" },
    ozean: { name: "Ozean", bg: "#eaf6fb", fg: "#0b3954", mute: "#4f6d7a", ac: "#087e8b", ac2: "#bfd7ea", fh: "Raleway", hb: true, fb: "Nunito", lay: "center", waves: true },
    kreide: { name: "Kreidetafel", bg: "#22262a", fg: "#f2efe6", mute: "#bdb8ab", ac: "#e8c468", ac2: "#8fb996", fh: "Bebas Neue", hb: false, fb: "Lora", lay: "frame", upper: true },
    festlich: { name: "Festlich", bg: "#5a0f1b", fg: "#fbf3e4", mute: "#e2cfae", ac: "#d4af37", ac2: "#8c1c2c", fh: "Playfair Display", hb: false, fb: "Lora", lay: "frame", dots: true },
    sport: { name: "Sportlich", bg: "#111111", fg: "#ffffff", mute: "#c7c7c7", ac: "#ff3b30", ac2: "#ffd60a", fh: "Oswald", hb: true, fb: "Inter", lay: "split", upper: true },
    frisch: { name: "Frisch", bg: "#ffffff", fg: "#1b1b1b", mute: "#5f6b62", ac: "#1f9d55", ac2: "#c7f5d3", fh: "Poppins", hb: true, fb: "Inter", lay: "left", blobs: true },
    handmade: { name: "Handgemacht", bg: "#e8dcc4", fg: "#3b3326", mute: "#6d624f", ac: "#6b8e23", ac2: "#cbbf9c", fh: "Pacifico", hb: false, fb: "Lora", lay: "center", leaves: true },
    editorial: { name: "Editorial", bg: "#fafafa", fg: "#141414", mute: "#6b6b6b", ac: "#e63946", ac2: "#f1faee", fh: "Merriweather", hb: true, fb: "Open Sans", lay: "band" },
    verspielt: { name: "Verspielt", bg: "#fff8e1", fg: "#2b2b2b", mute: "#6d6d6d", ac: "#7b2ff7", ac2: "#ffcc00", fh: "Dancing Script", hb: true, fb: "Poppins", lay: "center", circles: true, dots: true },
  };
  // dunkler Hintergrund? (für Logo-/QR-Farbe und Rückseiten)
  function dk(hex) { var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "")); if (!m) return false; var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, bl = n & 255; return (0.299 * r + 0.587 * g + 0.114 * bl) < 110; }
  var PER = {
    visitenkarten: ["klar", "nacht", "elegant", "akzent", "bold", "natur", "kreise", "mono", "business", "neon", "pastell", "kreide", "festlich", "frisch", "handmade", "editorial", "verspielt", "ozean", "retro"],
    flyer: ["klar", "split", "nacht", "bold", "elegant", "natur", "retro", "terracotta", "sport", "neon", "pastell", "business", "kreide", "festlich", "ozean", "frisch", "handmade", "editorial", "verspielt", "kreise"],
    plakate: ["bold", "split", "nacht", "klar", "elegant", "kreise", "retro", "sport", "neon", "terracotta", "kreide", "festlich", "pastell", "ozean", "editorial", "verspielt", "mono"],
    folder: ["klar", "nacht", "natur", "elegant", "akzent", "kreise", "business", "kreide", "festlich", "terracotta", "ozean", "pastell", "mono", "editorial"],
    aufkleber: ["klar", "nacht", "bold", "natur", "elegant", "kreise", "retro", "neon", "pastell", "handmade", "verspielt", "festlich", "frisch", "sport"],
    rollups: ["klar", "split", "nacht", "bold", "akzent", "natur", "business", "sport", "neon", "terracotta", "ozean", "editorial", "frisch", "mono"],
  };
  function upper(st, s) { return st.upper ? String(s).toUpperCase() : s; }
  // grobe Höhe eines Textblocks (mm) – für das Stapeln der Elemente
  function textH(text, pt, w, lh, font) {
    var mmPt = 0.3528, cw = pt * mmPt * (/Bebas|Oswald/.test(font) ? 0.42 : 0.54), per = Math.max(1, Math.floor(w / cw)), n = 0;
    String(text).split("\n").forEach(function (l) { n += Math.max(1, Math.ceil(l.length / per)); });
    return n * pt * mmPt * (lh || 1.16);
  }
  function T(x, y, w, text, pt, o) { o = o || {}; return { t: "text", x: x, y: y, w: w, text: text, size: pt, font: o.font, bold: !!o.bold, italic: !!o.italic, color: o.color, align: o.align || "left", ls: o.ls || 0, lh: o.lh || 1.16, role: o.role || "" }; }

  function build(id, ctx) {
    var st = STYLES[id] || STYLES.klar, k = ctx.product, tx = TXT[k] || TXT.flyer, sz = SIZE[k] || SIZE.flyer;
    if (ctx.texts) { tx = Object.assign({}, tx); Object.keys(ctx.texts).forEach(function (x) { if (typeof ctx.texts[x] === "string" && "HSOBFAW".indexOf(x) > -1 && x.length === 1) tx[x] = ctx.texts[x]; }); }
    if (ctx.pal) { st = Object.assign({}, st); ["bg", "fg", "mute", "ac", "ac2"].forEach(function (x) { if (/^#[0-9a-f]{6}$/i.test(ctx.pal[x] || "")) st[x] = ctx.pal[x]; }); if (ctx.pal.fh) st.fh = ctx.pal.fh; if (ctx.pal.fb) st.fb = ctx.pal.fb; }
    var pages = [];
    for (var side = 0; side < ctx.sides; side++) pages.push(k === "folder" ? folderPage(st, tx, sz, ctx, side) : page(st, tx, sz, ctx, side));
    return pages;
  }
  function deco(st, w, h, b, els, strong) {
    var m = Math.min(w, h);
    if (st.glow) { els.push({ t: "circle", cx: w * 0.92, cy: h * 0.05, r: m * 0.55, fill: st.ac, opacity: strong ? 0.35 : 0.22 }); els.push({ t: "circle", cx: w * 0.05, cy: h * 1.02, r: m * 0.42, fill: st.ac2, opacity: 0.22 }); }
    if (st.circles) { els.push({ t: "circle", cx: w * 0.98, cy: h * 0.02, r: m * 0.42, fill: st.ac, opacity: 0.95 }); els.push({ t: "circle", cx: w * 0.86, cy: h * 0.2, r: m * 0.2, fill: st.ac2, opacity: 0.9 }); els.push({ t: "circle", cx: -m * 0.05, cy: h * 1.0, r: m * 0.3, fill: st.ac2, opacity: 0.55 }); }
    if (st.blobs) { els.push({ t: "circle", cx: w * 0.95, cy: h * 0.08, r: m * 0.3, fill: st.ac2, opacity: 0.75 }); els.push({ t: "circle", cx: w * 0.06, cy: h * 0.96, r: m * 0.24, fill: st.ac2, opacity: 0.55 }); els.push({ t: "circle", cx: w * 0.82, cy: h * 0.2, r: m * 0.07, fill: st.ac, opacity: 0.5 }); }
    if (st.waves) { els.push({ t: "circle", cx: w * 0.2, cy: h * 1.18, r: m * 0.55, fill: st.ac2, opacity: 0.9 }); els.push({ t: "circle", cx: w * 0.85, cy: h * 1.22, r: m * 0.6, fill: st.ac, opacity: 0.22 }); }
    if (st.dots) { var ds = m * 0.022, gp = m * 0.06; for (var di = 0; di < 4; di++) for (var dj = 0; dj < 4; dj++) els.push({ t: "circle", cx: w - gp * (1.2 + di), cy: gp * (1.2 + dj), r: ds, fill: st.ac, opacity: 0.55 }); }
    if (st.stripes) { [0, 1, 2].forEach(function (i) { els.push({ t: "rect", x: -b, y: h * 0.06 + i * m * 0.035, w: w * 0.18 + b, h: m * 0.018, fill: i === 1 ? st.ac2 : st.ac }); }); }
    if (st.leaves) { els.push({ t: "circle", cx: w * 1.0, cy: h * 1.0, r: m * 0.5, fill: st.ac2, opacity: 0.9 }); els.push({ t: "circle", cx: w * 0.9, cy: h * 1.05, r: m * 0.28, fill: st.ac, opacity: 0.35 }); }
  }
  function page(st, tx, sz, ctx, side) {
    var w = ctx.w, h = ctx.h, b = ctx.bleed, land = w > h * 1.05, mn = Math.min(w, h), f = mn / sz[0];
    var m = Math.max(ctx.safe + mn * 0.02, mn * 0.08), cw = w - 2 * m;
    var pH = sz[1] * f, pS = sz[2] * f, pB = sz[3] * f, pF = sz[4] * f;
    var card = ctx.product === "visitenkarten" || ctx.product === "aufkleber";
    var els = [{ t: "bg", fill: st.bg }];
    var H = upper(st, tx.H), fh = st.fh, fb = st.fb;
    if (ctx.product === "aufkleber" && ctx.round) { // runder Aufkleber: alles zentriert
      deco(st, w, h, b, els);
      els.push({ t: "circle", cx: w / 2, cy: h / 2, r: mn / 2 - m * 0.55, fill: "", stroke: st.ac, sw: mn * 0.012 });
      if (tx.logo) els.push({ t: "img", x: w / 2 - mn * 0.15, y: h * 0.18, w: mn * 0.3, h: mn * 0.18, label: "Logo" });
      els.push(T(m, h * 0.42, cw, H, pH, { font: fh, bold: st.hb, color: st.fg, align: "center" }));
      els.push(T(m, h * 0.42 + pH * 0.3528 * 1.25, cw, tx.S, pS, { font: fb, italic: true, color: st.mute, align: "center" }));
      els.push(T(m, h * 0.76, cw, tx.W, pF, { font: fb, color: st.ac, align: "center" }));
      return els;
    }
    if (side === 1) return backPage(st, tx, sz, ctx, els, m, cw, pH, pS, pB, pF);
    if (st.lay === "band") {
      if (land) { var bw = w * 0.36; els.push({ t: "rect", x: -b, y: -b, w: bw + b, h: h + 2 * b, fill: st.ac }); els.push({ t: "rect", x: bw, y: -b, w: mn * 0.012, h: h + 2 * b, fill: st.ac2 });
        var tw = bw - m * 1.4, y0 = m;
        if (tx.logo) { els.push({ t: "img", x: m, y: y0, w: tw * 0.7, h: mn * 0.18, label: "Logo", dark: true }); }
        els.push(T(m, h - m - textH(tx.S, pS * 0.9, tw, 1.2, fb) - textH(H, pH * 0.8, tw, 1.1, fh), tw, H, pH * 0.8, { font: fh, bold: st.hb, color: "#ffffff", lh: 1.1 }));
        els.push(T(m, h - m - textH(tx.S, pS * 0.9, tw, 1.2, fb), tw, tx.S, pS * 0.9, { font: fb, color: "#e6f0ff", lh: 1.2 }));
        var x2 = bw + m, w2 = w - x2 - m, y = m;
        if (!card && tx.img) { els.push({ t: "img", x: x2, y: y, w: w2, h: h * 0.38, label: "Bild" }); y += h * 0.38 + m * 0.6; }
        if (tx.O) { els.push(T(x2, y, w2, tx.O, pS, { font: fh, bold: true, color: st.fg })); y += textH(tx.O, pS, w2, 1.16, fh) + m * 0.35; }
        if (tx.B) { els.push(T(x2, y, w2, tx.B, pB, { font: fb, color: st.mute, lh: 1.35 })); }
        els.push(T(x2, h - m - textH(tx.F, pF, w2, 1.4, fb), w2, tx.F, pF, { font: fb, color: st.fg, lh: 1.4 }));
      } else { var bh = h * 0.4; els.push({ t: "rect", x: -b, y: -b, w: w + 2 * b, h: bh + b, fill: st.ac }); els.push({ t: "rect", x: -b, y: bh, w: w + 2 * b, h: mn * 0.012, fill: st.ac2 });
        if (tx.logo) els.push({ t: "img", x: m, y: m, w: cw * 0.35, h: bh * 0.22, label: "Logo", dark: true });
        var hh = textH(H, pH, cw, 1.05, fh), shh = textH(tx.S, pS, cw, 1.2, fb);
        els.push(T(m, bh - m * 0.6 - shh - hh, cw, H, pH, { font: fh, bold: st.hb, color: "#ffffff", lh: 1.05 }));
        els.push(T(m, bh - m * 0.6 - shh, cw, tx.S, pS, { font: fb, color: "#e6f0ff", lh: 1.2 }));
        var yy = bh + m;
        if (!card && tx.img) { els.push({ t: "img", x: m, y: yy, w: cw, h: h * 0.22, label: "Bild" }); yy += h * 0.22 + m * 0.6; }
        if (tx.O) { els.push(T(m, yy, cw, tx.O, pS, { font: fh, bold: true, color: st.fg })); yy += textH(tx.O, pS, cw, 1.16, fh) + m * 0.4; }
        if (tx.B) els.push(T(m, yy, cw, tx.B, pB, { font: fb, color: st.mute, lh: 1.35 }));
        els.push(T(m, h - m - textH(tx.F, pF, cw, 1.4, fb), cw, tx.F, pF, { font: fb, color: st.fg, lh: 1.4 }));
      }
      return els;
    }
    if (st.lay === "split" && tx.img) {
      if (land) { els.push({ t: "img", x: -b, y: -b, w: w * 0.48 + b, h: h + 2 * b, label: "Bild" }); var xs = w * 0.48 + m, ws = w - xs - m, ys = m;
        els.push({ t: "rect", x: xs, y: ys, w: mn * 0.12, h: mn * 0.02, fill: st.ac }); ys += mn * 0.06;
        els.push(T(xs, ys, ws, H, pH * 0.85, { font: fh, bold: st.hb, color: st.fg, lh: 1.02 })); ys += textH(H, pH * 0.85, ws, 1.02, fh) + m * 0.3;
        els.push(T(xs, ys, ws, tx.S, pS, { font: fb, color: st.ac, lh: 1.2 })); ys += textH(tx.S, pS, ws, 1.2, fb) + m * 0.5;
        if (tx.B) els.push(T(xs, ys, ws, tx.B, pB, { font: fb, color: st.mute, lh: 1.35 }));
        els.push(T(xs, h - m - textH(tx.O + "\n" + tx.F, pF, ws, 1.4, fb), ws, tx.O + "\n" + tx.F, pF, { font: fb, color: st.fg, lh: 1.4 }));
      } else { var ih = h * 0.46; els.push({ t: "img", x: -b, y: -b, w: w + 2 * b, h: ih + b, label: "Bild" });
        els.push({ t: "rect", x: m, y: ih - pS * 0.3528 * 1.6, w: Math.min(cw, textH(tx.A || tx.S, pS, 999, 1, fb) ? cw * 0.55 : cw), h: pS * 0.3528 * 2.2, fill: st.ac });
        els.push(T(m + mn * 0.02, ih - pS * 0.3528 * 1.25, cw * 0.55, upper(st, tx.A || tx.S), pS, { font: fh, bold: st.hb, color: "#ffffff", ls: 60 }));
        var y2 = ih + m * 0.9;
        els.push(T(m, y2, cw, H, pH, { font: fh, bold: st.hb, color: st.fg, lh: 1.0 })); y2 += textH(H, pH, cw, 1.0, fh) + m * 0.35;
        if (tx.O) { els.push(T(m, y2, cw, tx.O, pS, { font: fb, bold: true, color: st.ac })); y2 += textH(tx.O, pS, cw, 1.16, fb) + m * 0.35; }
        if (tx.B) els.push(T(m, y2, cw, tx.B, pB, { font: fb, color: st.mute, lh: 1.35 }));
        els.push(T(m, h - m - textH(tx.F, pF, cw, 1.4, fb), cw, tx.F, pF, { font: fb, color: st.fg, lh: 1.4 }));
      }
      return els;
    }
    if (st.lay === "bold") {
      var bh2 = textH(H, pH * 1.35, cw, 0.92, fh);
      els.push({ t: "rect", x: -b, y: h - m - pF * 0.3528 * 5.2, w: w + 2 * b, h: pF * 0.3528 * 5.2 + m + b, fill: st.ac });
      var yb = m;
      if (tx.logo && !card) { els.push({ t: "img", x: w - m - mn * 0.22, y: m, w: mn * 0.22, h: mn * 0.12, label: "Logo" }); }
      if (tx.O) { els.push(T(m, yb, cw * 0.7, upper(st, tx.O), pS, { font: fb, bold: true, color: st.fg, ls: 40 })); yb += textH(tx.O, pS, cw * 0.7, 1.2, fb) + m * 0.4; }
      els.push(T(m, yb, cw, H, pH * 1.35, { font: fh, color: st.fg, lh: 0.92 })); yb += bh2 + m * 0.4;
      els.push(T(m, yb, cw, tx.S, pS, { font: fb, bold: true, color: st.fg, lh: 1.2 })); yb += textH(tx.S, pS, cw, 1.2, fb) + m * 0.5;
      if (!card && tx.img && h - yb - m - pF * 0.3528 * 6 > h * 0.18) els.push({ t: "img", x: m, y: yb, w: cw, h: h - yb - m * 1.6 - pF * 0.3528 * 5.2, label: "Bild" });
      else if (tx.B && !card) els.push(T(m, yb, cw, tx.B, pB, { font: fb, color: st.mute, lh: 1.35 }));
      els.push(T(m, h - m - pF * 0.3528 * 3.6, cw, (card ? tx.F.split("\n").slice(0, 2).join("   ") : tx.F.replace(/\n/g, "   ")), pF, { font: fb, bold: true, color: st.ac2, lh: 1.3 }));
      return els;
    }
    if (st.lay === "center" || st.lay === "frame") {
      deco(st, w, h, b, els);
      if (st.lay === "frame") els.push({ t: "rect", x: m * 0.6, y: m * 0.6, w: w - m * 1.2, h: h - m * 1.2, fill: "", stroke: st.ac, sw: Math.max(0.25, mn * 0.006) });
      var items = [];
      if (tx.logo) items.push({ img: true, h: card ? mn * 0.16 : mn * 0.12 });
      if (tx.O && !card) items.push({ text: upper(st, tx.O), pt: pS * 0.85, font: fb, bold: true, color: st.ac, ls: 120 });
      items.push({ text: H, pt: pH, font: fh, bold: st.hb, color: st.fg, lh: 1.05 });
      items.push({ rule: true, h: mn * 0.04 });
      items.push({ text: tx.S, pt: pS, font: st.lay === "frame" ? fh : fb, italic: st.lay === "frame", color: st.mute, lh: 1.2 });
      if (!card && tx.img) items.push({ img: true, ph: true, h: h * 0.24 });
      if (!card && tx.B) items.push({ text: tx.B, pt: pB, font: fb, color: st.fg, lh: 1.35, w: cw * 0.86 });
      var gap = mn * (card ? 0.035 : 0.03), tot = 0;
      items.forEach(function (it) { it.hh = it.text != null ? textH(it.text, it.pt, it.w || cw, it.lh || 1.16, it.font) : it.h; tot += it.hh + gap; });
      var fH = textH(tx.F, pF, cw, 1.4, fb), avail = h - 2 * m - fH - gap, yc = m + Math.max(0, (avail - tot) / (card ? 2 : 3));
      items.forEach(function (it) {
        var ww = it.w || cw, xx = (w - ww) / 2;
        if (it.img) els.push({ t: "img", x: it.ph ? m : w / 2 - (it.ph ? cw : mn * 0.3) / 2, y: yc, w: it.ph ? cw : mn * 0.3, h: it.hh, label: it.ph ? "Bild" : "Logo", dark: dk(st.bg) });
        else if (it.rule) els.push({ t: "rect", x: w / 2 - mn * 0.06, y: yc + it.hh * 0.4, w: mn * 0.12, h: Math.max(0.3, mn * 0.008), fill: st.ac });
        else els.push(T(xx, yc, ww, it.text, it.pt, { font: it.font, bold: it.bold, italic: it.italic, color: it.color, align: "center", lh: it.lh, ls: it.ls }));
        yc += it.hh + gap;
      });
      els.push(T(m, h - m - fH, cw, card ? tx.F.split("\n").join("  ·  ") : tx.F, card ? pF * 0.95 : pF, { font: fb, color: st.lay === "frame" ? st.fg : st.mute, align: "center", lh: 1.4 }));
      return els;
    }
    // „left“
    deco(st, w, h, b, els, true);
    var yl = m, isDark = dk(st.bg);
    if (tx.logo) els.push({ t: "img", x: w - m - (card ? mn * 0.26 : mn * 0.22), y: m, w: card ? mn * 0.26 : mn * 0.22, h: card ? mn * 0.16 : mn * 0.12, label: "Logo", dark: isDark });
    if (card) {
      var nh = textH(H, pH, cw * 0.7, 1.1, fh);
      yl = h * 0.36;
      els.push(T(m, yl, cw * 0.75, H, pH, { font: fh, bold: st.hb, color: st.fg, lh: 1.1 })); yl += nh + mn * 0.015;
      els.push(T(m, yl, cw * 0.75, tx.S, pS, { font: fb, color: st.ac, lh: 1.2 }));
      els.push({ t: "rect", x: m, y: yl - mn * 0.02 - nh - mn * 0.05, w: mn * 0.1, h: Math.max(0.35, mn * 0.012), fill: st.ac });
      els.push(T(m, h - m - textH(tx.F, pF, cw, 1.4, fb), cw, tx.F, pF, { font: fb, color: st.mute, lh: 1.4 }));
      return els;
    }
    if (tx.O) { els.push(T(m, yl, cw * 0.7, upper(st, tx.O), pS * 0.85, { font: fb, bold: true, color: st.ac, ls: 80 })); yl += textH(tx.O, pS * 0.85, cw * 0.7, 1.16, fb) + m * 0.5; }
    var hw = tx.logo ? cw * 0.72 : cw;   // Platz für das Logo rechts oben
    els.push(T(m, yl, hw, H, pH, { font: fh, bold: st.hb, color: st.fg, lh: 1.02 })); yl += textH(H, pH, hw, 1.02, fh) + m * 0.25;
    els.push({ t: "rect", x: m, y: yl, w: mn * 0.12, h: Math.max(0.5, mn * 0.01), fill: st.ac }); yl += m * 0.45;
    els.push(T(m, yl, cw, tx.S, pS, { font: fb, color: st.mute, lh: 1.2 })); yl += textH(tx.S, pS, cw, 1.2, fb) + m * 0.6;
    var fH2 = textH(tx.F, pF, cw, 1.4, fb);
    if (tx.img) { var ih2 = Math.max(h * 0.12, (h - m - fH2 - m * 0.8) - yl - (tx.B ? textH(tx.B, pB, cw, 1.35, fb) + m * 0.6 : 0)); els.push({ t: "img", x: m, y: yl, w: cw, h: ih2, label: "Bild" }); yl += ih2 + m * 0.6; }
    if (tx.B) els.push(T(m, yl, cw, tx.B, pB, { font: fb, color: st.fg, lh: 1.35 }));
    els.push(T(m, h - m - fH2, cw, tx.F, pF, { font: fb, color: st.mute, lh: 1.4 }));
    if (tx.A && ctx.product !== "rollups") { var r = Math.min(w, h) * 0.13; els.push({ t: "circle", cx: w - m - r, cy: h - m - fH2 - r * 1.3, r: r, fill: st.ac }); els.push(T(w - m - 2 * r, h - m - fH2 - r * 1.3 - pS * 0.3528 * 0.7, 2 * r, tx.A, pS * 0.8, { font: fh, bold: true, color: "#ffffff", align: "center", lh: 1.1 })); }
    return els;
  }
  function backPage(st, tx, sz, ctx, els, m, cw, pH, pS, pB, pF) {
    var w = ctx.w, h = ctx.h, b = ctx.bleed, mn = Math.min(w, h), fb = st.fb, card = ctx.product === "visitenkarten";
    var dark = st.lay === "bold" ? st.ac : (!dk(st.bg) ? st.ac : st.bg);
    if (card) {
      els[0] = { t: "bg", fill: dark };
      deco(st, w, h, b, els);
      els.push({ t: "img", x: w / 2 - mn * 0.22, y: h / 2 - mn * 0.2, w: mn * 0.44, h: mn * 0.26, label: "Logo", dark: true });
      els.push(T(m, h / 2 + mn * 0.12, cw, tx.W, pF * 1.05, { font: fb, color: st.lay === "bold" ? st.ac2 : "#ffffff", align: "center", ls: 60 }));
      return els;
    }
    deco(st, w, h, b, els);
    var y = m;
    els.push(T(m, y, cw, upper(st, tx.H), pS * 1.4, { font: st.fh, bold: st.hb, color: st.fg })); y += textH(tx.H, pS * 1.4, cw, 1.16, st.fh) + m * 0.5;
    if (tx.B) { els.push(T(m, y, cw, tx.B, pB, { font: fb, color: st.fg, lh: 1.4 })); y += textH(tx.B, pB, cw, 1.4, fb) + m * 0.6; }
    if (tx.O) { els.push(T(m, y, cw, tx.O, pS * 0.9, { font: fb, bold: true, color: st.ac })); }
    var q = Math.max(15, mn * 0.2);
    els.push({ t: "qr", x: w - m - q, y: h - m - q, s: q, data: "https://" + tx.W.replace(/^https?:\/\//, ""), color: dk(st.bg) ? "#ffffff" : "#000000" });
    els.push(T(m, h - m - textH(tx.F, pF, cw - q - m, 1.4, fb), cw - q - m, tx.F, pF, { font: fb, color: st.mute, lh: 1.4 }));
    return els;
  }
  // Folder: Seite 1 = außen (rechts Titel, Mitte Rückseite, links Info), Seite 2 = innen (Spalten)
  function folderPage(st, tx, sz, ctx, side) {
    var w = ctx.w, h = ctx.h, b = ctx.bleed, n = ctx.panels || 2, pw = w / n, f = Math.min(pw, h) / sz[0];
    var m = Math.max(ctx.safe + 2, Math.min(pw, h) * 0.09), cw = pw - 2 * m, pH = sz[1] * f, pS = sz[2] * f, pB = sz[3] * f, pF = sz[4] * f;
    var els = [{ t: "bg", fill: st.bg }], fb = st.fb, fh = st.fh, H = upper(st, tx.H);
    if (side === 0) {
      var x0 = (n - 1) * pw;  // Titelseite = rechtes Paneel
      if (st.lay === "band" || st.lay === "bold" || st.glow || st.circles) els.push({ t: "rect", x: x0, y: -b, w: pw + b, h: h + 2 * b, fill: st.lay === "bold" ? st.bg : st.ac, opacity: st.glow || st.circles ? 0.18 : 1 });
      var light = st.lay === "band";
      els.push({ t: "img", x: x0 + m, y: m, w: cw, h: h * 0.42, label: "Bild" });
      els.push(T(x0 + m, h * 0.42 + m * 1.6, cw, H, pH, { font: fh, bold: st.hb, color: light ? "#ffffff" : st.fg, lh: 1.05 }));
      els.push(T(x0 + m, h * 0.42 + m * 1.6 + textH(H, pH, cw, 1.05, fh) + m * 0.3, cw, tx.S, pS, { font: fb, italic: st.lay === "frame", color: light ? "#e6f0ff" : st.ac, lh: 1.2 }));
      els.push({ t: "img", x: x0 + m, y: h - m - h * 0.08, w: cw * 0.45, h: h * 0.08, label: "Logo", dark: light });
      var xb = (n - 2) * pw;  // Rückseite
      els.push(T(xb + m, h - m - textH(tx.F, pF, cw, 1.45, fb) - Math.max(18, cw * 0.32) - m * 0.5, cw, tx.F, pF, { font: fb, color: st.mute, lh: 1.45 }));
      els.push({ t: "qr", x: xb + m, y: h - m - Math.max(18, cw * 0.32), s: Math.max(18, cw * 0.32), data: "https://" + tx.W, color: dk(st.bg) ? "#ffffff" : "#000000" });
      els.push(T(xb + m, m, cw, tx.A, pS, { font: fh, bold: true, color: st.ac }));
      if (n > 2) { els.push(T(m, m, cw, "Willkommen", pS * 1.3, { font: fh, bold: st.hb, color: st.fg })); els.push(T(m, m + pS * 0.3528 * 2.2, cw, "Schön, dass du da bist. Bei uns kommt auf den Teller, was die Region gerade zu bieten hat – frisch, ehrlich und mit viel Liebe gekocht.", pB, { font: fb, color: st.fg, lh: 1.45 })); els.push({ t: "img", x: m, y: h * 0.5, w: cw, h: h * 0.4 - m, label: "Bild" }); }
    } else {
      var parts = tx.B.split("\n\n");
      for (var i = 0; i < n; i++) {
        var xi = i * pw + m, y = m, part = parts[i] || (i === n - 1 ? "Getränke\nAlmdudler 0,33 l · 3,90 €\nMontafoner Bier 0,5 l · 4,80 €\nHauswein 1/8 l · 3,60 €" : "");
        if (i === 0) { els.push(T(xi, y, cw, upper(st, tx.H), pS * 1.5, { font: fh, bold: st.hb, color: st.ac })); y += pS * 0.3528 * 2.6; }
        var lines = part.split("\n"); if (!lines[0]) continue;
        els.push(T(xi, y, cw, lines[0], pS, { font: fh, bold: true, color: st.fg })); y += pS * 0.3528 * 1.7;
        els.push({ t: "rect", x: xi, y: y, w: cw * 0.25, h: 0.5, fill: st.ac }); y += 3;
        els.push(T(xi, y, cw, lines.slice(1).join("\n"), pB, { font: fb, color: st.fg, lh: 1.6 }));
      }
      els.push(T(w - pw + m, h - m - pF * 0.3528 * 1.4, cw, tx.A, pF, { font: fb, italic: true, color: st.mute }));
    }
    return els;
  }
  window.PrintTemplates = {
    styles: STYLES, texts: TXT, isDark: dk,
    list: function (product) { return (PER[product] || PER.flyer).map(function (id) { return { id: id, name: STYLES[id].name }; }); },
    build: build,
    blank: function (ctx) { var p = []; for (var i = 0; i < ctx.sides; i++) p.push([{ t: "bg", fill: "#ffffff" }]); return p; },
  };
})();
