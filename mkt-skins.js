/* Marketing: eigener Look je App – abgeleitet von der jeweiligen Website (Schrift, Farben, Formen, Bildsprache).
   kochdu: Outfit, Lila-Verlauf, Lavendel, weiße Karten, gelbe Abzeichen, Essensfotos · Kantineur: Barlow Condensed, Nacht-Blau, Bauplan-Linien,
   Fadenkreuze, Getränke-Kacheln, Strichliste · Blitzdings: Cormorant Garamond, Creme + Gold, feine Karten, Polaroid, Fotoboxen ·
   VALUERO: Merriweather, Bergfotos, Grün, warmes Weiß · Skikaiser: Barlow Condensed kursiv, TV-Weltcup-Grafik (rote Balken, Zeittafel),
   Spielszenen · Hüttengaudi: Fraunces + Fredoka, Loden/Leinen/Holz, Spielbilder in Rahmen · Druckshop/FS Creative: Inter, Schwarz mit Leuchten,
   Verlaufsschrift, Fadenkreuze.
   Jede Marke hat mehrere Layouts je Vorlage (hook, list, compare, stat, quote, cta, photo); o.v (Variante) wechselt sie innerhalb und zwischen Posts.
   Ebenen fürs Reel: layer "bg" = nur Hintergrund/Bilder, "fg" = nur Text (transparent), "all" = beides. */
"use strict";
module.exports = function (U) {
  const { h, img, fit, mix, rgba, onColor } = U;
  const plain = s => String(s || "").replace(/\*/g, "");
  const svg = (body, vb, w, hh) => "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + hh + '" viewBox="' + vb + '">' + body + "</svg>").toString("base64");
  const pick = (arr, v) => arr[((v % arr.length) + arr.length) % arr.length];

  // Wörter einzeln (Umbruch wie Fließtext); *markierte* Teile je Marke anders hervorgehoben (mark: Funktion → Stil)
  function rich(text, size, color, o) {
    o = o || {}; const parts = [];
    String(text || "").split(/(\*[^*]+\*)/).forEach(seg => { if (!seg) return; const hl = /^\*[^*]+\*$/.test(seg); let t = hl ? seg.slice(1, -1) : seg;
      if (!hl && parts.length && /^[?!.,:;…)“"]/.test(t)) { const m = t.match(/^[?!.,:;…)“"]+/)[0]; parts[parts.length - 1].tail = m; t = t.slice(m.length); }
      (hl && t.length <= 24 ? [t.trim()] : t.split(/\s+/)).filter(Boolean).forEach(w => parts.push({ w: o.upper ? w.toUpperCase() : w, hl })); });
    const gap = Math.round(size * (o.wordGap || 0.26));
    // __w/__hl: Merker für die Reel-Animation (mkt-motion.js), werden vor dem Zeichnen entfernt
    const mk = p => p.hl ? h("span", Object.assign({ __hl: 1 }, o.mark ? o.mark(size) : { color: o.hlColor || color }), p.w) : h("span", {}, p.w);
    return h("div", { flexWrap: "wrap", justifyContent: o.center ? "center" : "flex-start", alignItems: "baseline", rowGap: Math.round(size * (o.rowGap != null ? o.rowGap : 0.06)), fontFamily: o.family, fontWeight: o.weight, fontStyle: o.italic ? "italic" : "normal", fontSize: size, lineHeight: o.lh || 1.05, letterSpacing: o.ls != null ? o.ls : -size * 0.02, color, width: o.width },
      parts.map(p => h("div", { marginRight: gap, __w: 1 }, mk(p), p.tail ? h("span", {}, p.tail) : null)));
  }
  // Grundgerüst: Format, Ebenen, Logo
  function base(slide, brand, o, F) {
    const layer = o.layer || "all", story = F.h > 1500;
    // TX = Textelemente (im Reel einzeln animiert: __u), DE = Deko/Bilder (Hintergrund-Ebene)
    return { s: slide || {}, brand, o, F, story, W2: F.w - 2 * F.px, layer, TX: layer === "bg" ? { opacity: 0 } : o.anim ? { __u: 1 } : {}, DE: layer === "fg" ? { opacity: 0 } : {}, v: +o.v || 0,
      image: slide && slide.image || "", image2: slide && slide.image2 || "", url: o.url || "", counter: o.counter || "", swipe: !!o.swipe };
  }
  const rootBg = (c, bg) => c.layer === "fg" ? "transparent" : bg;
  const logoImg = (c, hh, onDark) => { const b = c.brand; if (!b.logo) return h("div", { fontFamily: "Inter", fontWeight: 800, fontSize: Math.round(hh * 0.55), color: onDark ? "#fff" : "#111" }, b.name || ""); return img(b.logo, { height: hh, width: Math.round(hh * (b.logoRatio || 1)) }); };
  const photo = (src, st) => img(src, Object.assign({ objectFit: "cover" }, st));
  // Fußzeile: Wischen-Hinweis bzw. Seitenzähler
  const swipeArrow = col => img(svg('<path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="' + col + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>', "0 0 24 24", 36, 36), { width: 34, height: 34 });
  const crossHair = (col, sz) => img(svg('<path d="M12 0v24M0 12h24" stroke="' + col + '" stroke-width="1.6"/>', "0 0 24 24", sz, sz), { width: sz, height: sz });

  // ═════════════ kochdu ═════════════
  const KD = { purple: "#6645ef", deep: "#4c30d4", lav: "#f0edff", ink: "#1a1814", yellow: "#ffd84d", green: "#2fbf71" };
  function kochdu(c) {
    const { s, F, story, W2, TX, DE, v } = c, tpl = s.template || "hook";
    const head = (txt, size, col, center, maxW) => rich(txt, size, col, { family: "Outfit", weight: 800, center, width: maxW, ls: -size * 0.025, mark: sz => ({ background: KD.yellow, color: KD.ink, borderRadius: Math.round(sz * 0.22), padding: "0 " + Math.round(sz * 0.18) + "px" }) });
    const badge = (t, bg, fg) => h("div", Object.assign({ alignSelf: "flex-start", background: bg || KD.yellow, color: fg || KD.ink, borderRadius: 99, padding: story ? "12px 26px" : "10px 22px", fontFamily: "Outfit", fontWeight: 700, fontSize: story ? 32 : 28 }, TX), plain(t));
    const logoPill = (hh) => h("div", Object.assign({ background: "#ffffff", borderRadius: 99, padding: Math.round(hh * 0.3) + "px " + Math.round(hh * 0.55) + "px", boxShadow: "0 10px 30px rgba(40,20,120,0.18)" }, DE), logoImg(c, hh));
    const topRow = (onDark) => h("div", { justifyContent: "space-between", alignItems: "center", width: W2, flexShrink: 0 }, logoPill(story ? 50 : 42), c.counter ? h("div", Object.assign({ fontFamily: "Outfit", fontWeight: 700, fontSize: 26, color: onDark ? "rgba(255,255,255,0.85)" : KD.purple, background: onDark ? "rgba(255,255,255,0.16)" : "#ffffff", borderRadius: 99, padding: "8px 18px" }, TX), c.counter) : null);
    const foot = (onDark) => h("div", { justifyContent: "space-between", alignItems: "center", width: W2, marginTop: story ? 0 : "auto", flexShrink: 0 },   /* Hochformat (Reel): Inhalt mittig, Fußzeile unten */
      c.swipe ? h("div", Object.assign({ fontFamily: "Outfit", fontWeight: 700, fontSize: 28, color: onDark ? "#fff" : KD.purple, alignItems: "center" }, TX), "Wischen", h("div", { marginLeft: 10 }, swipeArrow(onDark ? "#ffffff" : KD.purple))) :
        s.cta && tpl !== "cta" ? h("div", Object.assign({ background: onDark ? "#ffffff" : KD.purple, color: onDark ? KD.purple : "#fff", fontFamily: "Outfit", fontWeight: 800, fontSize: story ? 34 : 30, borderRadius: 99, padding: story ? "20px 38px" : "16px 32px" }, TX), plain(s.cta)) : h("div", {}),
      h("div", Object.assign({ fontFamily: "Outfit", fontWeight: 600, fontSize: 24, color: onDark ? "rgba(255,255,255,0.8)" : rgba(KD.ink, 0.55) }, TX), c.url || "kochdu.at"));
    const purpleBg = { background: "linear-gradient(150deg, #8a6bff 0%, " + KD.purple + " 45%, " + KD.deep + " 100%)" };
    const circles = [h("div", Object.assign({ position: "absolute", right: -F.w * 0.25, top: -F.w * 0.3, width: F.w * 0.85, height: F.w * 0.85, borderRadius: F.w, background: "rgba(255,255,255,0.09)" }, DE)),
      h("div", Object.assign({ position: "absolute", left: -F.w * 0.3, bottom: -F.w * 0.35, width: F.w * 0.9, height: F.w * 0.9, borderRadius: F.w, background: "rgba(255,255,255,0.06)" }, DE))];
    const pad = F.top + "px " + F.px + "px " + F.bottom + "px";
    const R = (bg, kids, extra) => h("div", Object.assign({ width: F.w, height: F.h, position: "relative", flexDirection: "column", overflow: "hidden", padding: pad, fontFamily: "Outfit", background: rootBg(c, bg) }, extra || {}), kids);
    // Essensfoto oben, weiße Karte unten (wie die Restaurant-Karten der App)
    if ((tpl === "photo" || tpl === "hook") && c.image && v % 2 === 0) {
      const ph = Math.round(F.h * (story ? 0.56 : 0.6));
      return R(KD.lav, [h("div", Object.assign({ position: "absolute", left: 0, top: 0, width: F.w, height: ph }, DE), photo(c.image, { width: F.w, height: ph }), h("div", { position: "absolute", left: 0, top: 0, width: F.w, height: ph, background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 40%)" })),
        topRow(true),
        h("div", { flexDirection: "column", width: W2, marginTop: "auto", background: "#ffffff", borderRadius: 44, padding: story ? "48px 46px" : "42px 40px", boxShadow: "0 30px 70px rgba(60,30,160,0.18)" },
          s.kicker ? badge(s.kicker) : null, h("div", Object.assign({ marginTop: s.kicker ? 22 : 0 }, TX), head(s.headline, fit(plain(s.headline), W2 - 90, 3, story ? 92 : 80, 44, 0.6), KD.ink)),
          s.sub ? h("div", Object.assign({ marginTop: 18, fontSize: story ? 36 : 32, fontWeight: 500, color: rgba(KD.ink, 0.7), lineHeight: 1.3 }, TX), plain(s.sub)) : null,
          h("div", { marginTop: 28, alignItems: "center", justifyContent: "space-between" },
            h("div", Object.assign({ alignItems: "center", gap: 10 }, TX), h("div", { background: "#e5f8ee", color: "#178a4c", fontWeight: 700, fontSize: 24, borderRadius: 99, padding: "6px 16px", alignItems: "center" }, h("div", { width: 12, height: 12, borderRadius: 12, background: "#178a4c", marginRight: 10 }), "Lieferung & Abholung")),
            s.cta ? h("div", Object.assign({ background: KD.purple, color: "#fff", fontWeight: 800, fontSize: story ? 30 : 27, borderRadius: 99, padding: "14px 28px" }, TX), plain(s.cta)) : null)),
        c.swipe ? h("div", Object.assign({ marginTop: 22, justifyContent: "flex-end", width: W2, fontWeight: 700, fontSize: 26, color: KD.purple, alignItems: "center" }, TX), "Wischen", h("div", { marginLeft: 8 }, swipeArrow(KD.purple))) : null]);
    }
    if (tpl === "photo" || (tpl === "hook" && c.image)) {   // Vollbild-Foto mit Lila-Verlauf unten
      return R(KD.deep, [h("div", Object.assign({ position: "absolute", left: 0, top: 0, width: F.w, height: F.h }, DE), c.image ? photo(c.image, { width: F.w, height: F.h }) : null, h("div", { position: "absolute", left: 0, top: 0, width: F.w, height: F.h, background: "linear-gradient(180deg, rgba(40,20,120,0.25) 0%, rgba(40,20,120,0) 35%, rgba(76,48,212,0.92) 78%, " + KD.deep + " 100%)" })),
        topRow(true), h("div", { flexDirection: "column", width: W2, marginTop: "auto" }, s.kicker ? badge(s.kicker) : null,
          h("div", Object.assign({ marginTop: 22 }, TX), head(s.headline, fit(plain(s.headline), W2, 3, story ? 116 : 100, 50, 0.6), "#ffffff")),
          s.sub ? h("div", Object.assign({ marginTop: 18, fontSize: story ? 38 : 34, fontWeight: 500, color: "rgba(255,255,255,0.88)" }, TX), plain(s.sub)) : null),
        h("div", { height: 36 }), foot(true)]);
    }
    if (tpl === "list") {   // Lavendel, weiße Zeilen wie die Kategorie-Kacheln
      const its = (s.items || []).slice(0, 5), em = ["🍕", "🍣", "🍔", "🥗", "🍝", "🛵", "⏱️", "📱"], isz = fit(its.reduce((a, b) => a.length > b.length ? a : b, ""), W2 - 170, 2, story ? 40 : 36, 26, 0.52);
      return R(KD.lav, [topRow(false), h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" },
        s.kicker ? badge(s.kicker, KD.purple, "#fff") : null, h("div", Object.assign({ marginTop: 20 }, TX), head(s.headline, fit(plain(s.headline), W2, 3, story ? 88 : 76, 44, 0.6), KD.ink)),
        h("div", { flexDirection: "column", marginTop: story ? 44 : 34, rowGap: its.length > 4 ? 12 : 16 }, its.map((t, i) => h("div", Object.assign({ alignItems: "center", background: "#ffffff", borderRadius: 30, padding: (its.length > 4 ? 14 : 20) + "px 22px", boxShadow: "0 8px 24px rgba(80,50,200,0.08)" }, TX),
          h("div", { width: 70, height: 70, borderRadius: 22, background: KD.lav, alignItems: "center", justifyContent: "center", fontSize: 38, marginRight: 22, flexShrink: 0 }, pick(em, i + v)),
          h("div", { fontSize: isz, fontWeight: 600, color: KD.ink, lineHeight: 1.25, width: W2 - 150 }, plain(t)))))),
        foot(false)]);
    }
    if (tpl === "stat") {
      return R("", [h("div", Object.assign({ position: "absolute", left: 0, top: 0, width: F.w, height: F.h }, DE, purpleBg)), ...circles, topRow(true),
        h("div", { flexDirection: "column", alignItems: "center", width: W2, marginTop: "auto", marginBottom: "auto" }, s.kicker ? h("div", { alignSelf: "center" }, badge(s.kicker)) : null,
          h("div", Object.assign({ marginTop: 26, fontWeight: 900, fontSize: fit(plain(s.number), W2, 1, story ? 300 : 260, 90, 0.62), color: "#fff", lineHeight: 1, letterSpacing: -8 }, TX), plain(s.number)),
          h("div", Object.assign({ marginTop: 16 }, TX), head(s.label || s.headline, fit(plain(s.label || s.headline), W2, 2, story ? 64 : 56, 34, 0.6), "#fff", true, W2)),
          s.sub ? h("div", Object.assign({ marginTop: 18, fontSize: story ? 36 : 32, color: "rgba(255,255,255,0.85)", textAlign: "center" }, TX), plain(s.sub)) : null), foot(true)]);
    }
    if (tpl === "compare") {
      const col = (title, its, good) => h("div", Object.assign({ flexDirection: "column", width: (W2 - 24) / 2, background: good ? KD.purple : "#ffffff", color: good ? "#fff" : KD.ink, borderRadius: 34, padding: "30px 26px", boxShadow: good ? "0 20px 50px rgba(102,69,239,0.35)" : "none" }, TX),
        h("div", { fontWeight: 800, fontSize: story ? 40 : 34, marginBottom: 14 }, plain(title)),
        (its || []).slice(0, 5).map(t => h("div", { marginTop: 12, fontSize: story ? 31 : 27, fontWeight: 500, lineHeight: 1.25, alignItems: "flex-start" }, h("div", { width: 44, flexShrink: 0, fontSize: 28 }, good ? "✅" : "❌"), h("div", { width: (W2 - 24) / 2 - 100 }, plain(t)))));
      return R(KD.lav, [topRow(false), h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, s.kicker ? badge(s.kicker) : null,
        h("div", Object.assign({ marginTop: 20 }, TX), head(s.headline, fit(plain(s.headline), W2, 3, story ? 84 : 72, 42, 0.6), KD.ink)),
        h("div", { justifyContent: "space-between", marginTop: 36 }, col(s.leftTitle || "Bisher", s.leftItems, false), col(s.rightTitle || "kochdu", s.rightItems, true))), foot(false)]);
    }
    if (tpl === "quote") {
      return R(KD.lav, [topRow(false), h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto", background: "#ffffff", borderRadius: 44, padding: "56px 48px", boxShadow: "0 30px 70px rgba(60,30,160,0.12)" },
        h("div", Object.assign({ fontSize: 90, lineHeight: 1 }, TX), pick(["😋", "🤤", "🙌", "💜"], v)),
        h("div", Object.assign({ marginTop: 18 }, TX), head(s.headline, fit(plain(s.headline), W2 - 96, 6, story ? 72 : 62, 36, 0.58), KD.ink)),
        s.author ? h("div", Object.assign({ marginTop: 26, fontSize: 30, fontWeight: 700, color: KD.purple }, TX), plain(s.author)) : null), foot(false)]);
    }
    if (tpl === "cta") {
      return R("", [h("div", Object.assign({ position: "absolute", left: 0, top: 0, width: F.w, height: F.h }, DE, purpleBg)), ...circles,
        h("div", { flexDirection: "column", alignItems: "center", width: W2, marginTop: "auto", marginBottom: "auto" }, logoPill(story ? 84 : 72),
          s.kicker ? h("div", { marginTop: 40, alignSelf: "center" }, badge(s.kicker)) : null,
          h("div", Object.assign({ marginTop: 26 }, TX), head(s.headline, fit(plain(s.headline), W2, 3, story ? 100 : 88, 46, 0.6), "#fff", true, W2)),
          s.sub ? h("div", Object.assign({ marginTop: 20, fontSize: story ? 38 : 34, color: "rgba(255,255,255,0.88)", textAlign: "center", justifyContent: "center" }, TX), plain(s.sub)) : null,
          h("div", Object.assign({ marginTop: 44, background: KD.yellow, color: KD.ink, fontWeight: 800, fontSize: story ? 40 : 36, borderRadius: 99, padding: story ? "24px 48px" : "20px 42px", boxShadow: "0 16px 40px rgba(0,0,0,0.2)" }, TX), plain(s.cta || "Jetzt bestellen")),
          h("div", Object.assign({ marginTop: 24, alignItems: "center", gap: 16, fontSize: 26, fontWeight: 600, color: "rgba(255,255,255,0.85)" }, TX), "App Store · Google Play · kochdu.at"))]);
    }
    // hook ohne Foto: Lila-Verlauf, große Schrift, Emoji-Aufkleber
    return R("", [h("div", Object.assign({ position: "absolute", left: 0, top: 0, width: F.w, height: F.h }, DE, purpleBg)), ...circles,
      h("div", Object.assign({ position: "absolute", right: 70, top: story ? 360 : 230, width: 170, height: 170, borderRadius: 48, background: "#ffffff", alignItems: "center", justifyContent: "center", fontSize: 100, transform: "rotate(10deg)", boxShadow: "0 20px 50px rgba(0,0,0,0.18)" }, DE), pick(["🍕", "🍔", "🍣", "🥘", "🍝"], v)),
      topRow(true), h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, s.kicker ? badge(s.kicker) : null,
        h("div", Object.assign({ marginTop: 24 }, TX), head(s.headline, fit(plain(s.headline), W2, 4, story ? 128 : 112, 54, 0.6), "#fff")),
        s.sub ? h("div", Object.assign({ marginTop: 24, fontSize: story ? 40 : 36, fontWeight: 500, color: "rgba(255,255,255,0.88)", lineHeight: 1.3 }, TX), plain(s.sub)) : null), foot(true)]);
  }

  // ═════════════ Der Kantineur ═════════════
  const KT = { night: "#1d2d3d", night2: "#16222e", steel: "#94bce3", steel2: "#5980a6", paper: "#f2f2f3", sky: "#a9c7e6" };
  function kantineur(c) {
    const { s, F, story, W2, TX, DE, v } = c, tpl = s.template || "hook";
    const dark = !((tpl === "list" || tpl === "photo") && v % 2) && tpl !== "quote", bg = dark ? KT.night : KT.paper, fg = dark ? "#ffffff" : KT.night, sub = dark ? "rgba(255,255,255,0.72)" : rgba(KT.night, 0.7);
    const head = (txt, size, col, center, w) => rich(txt, size, col, { family: "Barlow Condensed", weight: 800, upper: true, center, width: w, ls: size * 0.005, lh: 0.98, wordGap: 0.22, mark: sz => ({ background: KT.steel, color: KT.night, padding: "0 " + Math.round(sz * 0.14) + "px" }) });
    const grid = h("div", Object.assign({ position: "absolute", left: 0, top: 0, width: F.w, height: F.h, backgroundImage: "linear-gradient(" + (dark ? "rgba(255,255,255,0.045)" : "rgba(29,45,61,0.06)") + " 1px, transparent 1px), linear-gradient(90deg, " + (dark ? "rgba(255,255,255,0.045)" : "rgba(29,45,61,0.06)") + " 1px, transparent 1px)", backgroundSize: "54px 54px" }, DE));
    const cross = [[F.px - 30, F.top - 30], [F.w - F.px - 10, F.top - 30], [F.px - 30, F.h - F.bottom - 10], [F.w - F.px - 10, F.h - F.bottom - 10]].map(([x, y]) => h("div", Object.assign({ position: "absolute", left: x, top: y }, DE), crossHair(dark ? "rgba(148,188,227,0.7)" : "rgba(29,45,61,0.45)", 40)));
    const icon = h("div", { width: story ? 64 : 56, height: story ? 64 : 56, borderRadius: 10, background: dark ? "#ffffff" : KT.night, alignItems: "center", justifyContent: "center" },
      img(svg('<g stroke="' + (dark ? KT.night : "#fff") + '" stroke-width="7" stroke-linecap="round"><path d="M22 20v40M36 20v40M50 20v40M64 20v40"/></g><path d="M14 52L72 28" stroke="' + KT.steel + '" stroke-width="7" stroke-linecap="round"/>', "0 0 86 80", 86, 80), { width: story ? 44 : 38, height: story ? 41 : 35 }));
    const top = h("div", { justifyContent: "space-between", alignItems: "center", width: W2, flexShrink: 0 },
      h("div", Object.assign({ alignItems: "center", gap: 14 }, DE), icon, h("div", { fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: story ? 40 : 34, letterSpacing: 2, color: fg }, "KANTINEUR")),
      c.counter ? h("div", Object.assign({ fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 28, letterSpacing: 2, color: dark ? KT.steel : KT.steel2 }, TX), c.counter) : null);
    const btn = (t) => h("div", Object.assign({ background: KT.steel, color: KT.night, fontFamily: "Barlow Condensed", fontWeight: 800, letterSpacing: 2, fontSize: story ? 36 : 32, padding: story ? "18px 34px" : "15px 30px" }, TX), plain(t).toUpperCase());
    const foot = h("div", { justifyContent: "space-between", alignItems: "center", width: W2, marginTop: story ? 0 : "auto", flexShrink: 0 },   /* Hochformat (Reel): Inhalt mittig, Fußzeile unten */
      c.swipe ? h("div", Object.assign({ fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 30, letterSpacing: 3, color: dark ? KT.steel : KT.steel2, alignItems: "center" }, TX), "WEITER GEHT'S", h("div", { marginLeft: 10 }, swipeArrow(dark ? KT.steel : KT.steel2))) : s.cta && tpl !== "cta" ? btn(s.cta) : h("div", {}),
      h("div", Object.assign({ fontFamily: "Barlow", fontWeight: 500, fontSize: 24, color: sub }, TX), "kantineur.at"));
    const kicker = s.kicker ? h("div", Object.assign({ fontFamily: "Barlow Condensed", fontWeight: 700, letterSpacing: 4, fontSize: story ? 30 : 26, color: dark ? KT.steel : KT.steel2, marginBottom: 20 }, TX), "— " + plain(s.kicker).toUpperCase()) : null;
    const R = kids => h("div", { width: F.w, height: F.h, position: "relative", flexDirection: "column", overflow: "hidden", padding: F.top + "px " + F.px + "px " + F.bottom + "px", fontFamily: "Barlow", background: rootBg(c, bg) }, [grid].concat(cross).concat(kids));
    if (tpl === "list" || tpl === "photo") {
      if (v % 2 === 0) {   // Kiosk-Ansicht: Getränke-Kacheln, eine „GEBUCHT“
        const its = (s.items && s.items.length ? s.items : ["Bier 0,5 l", "Radler", "Spezi", "Mineral", "Kaffee", "Weißwein"]).slice(0, 6), price = ["3,00 €", "3,00 €", "2,50 €", "2,00 €", "2,00 €", "3,50 €"];
        const tw = (W2 - 24) / 2;
        return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kicker, h("div", TX, head(s.headline, fit(plain(s.headline).toUpperCase(), W2, 3, story ? 104 : 90, 50, 0.48), fg)),
          h("div", { flexWrap: "wrap", justifyContent: "space-between", marginTop: 38, rowGap: 22 }, its.map((t, i) => h("div", Object.assign({ width: tw, flexDirection: "column", border: "2px solid " + (i === 0 ? KT.steel : "rgba(148,188,227,0.45)"), background: i === 0 ? KT.steel : "transparent", padding: "20px 22px", position: "relative" }, TX),
            h("div", { fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: fit(plain(t), tw - 50, 2, story ? 46 : 40, 26, 0.45), color: i === 0 ? KT.night : "#fff", lineHeight: 1.05 }, plain(t)),
            h("div", { marginTop: 8, fontSize: 24, color: i === 0 ? KT.night : "rgba(255,255,255,0.65)", justifyContent: "space-between" }, h("span", {}, s.items && s.items.length ? "" : price[i] || ""), i === 0 ? h("span", { fontFamily: "Barlow Condensed", fontWeight: 800, letterSpacing: 2 }, "GEBUCHT") : null))))), foot]);
      }
      const its = (s.items || []).slice(0, 5);   // Strichliste: Punkte mit Strich-Zählern
      return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kicker, h("div", TX, head(s.headline, fit(plain(s.headline).toUpperCase(), W2, 3, story ? 100 : 86, 50, 0.48), fg)),
        h("div", { flexDirection: "column", marginTop: 36, borderTop: "2px solid " + rgba(KT.night, 0.8) }, its.map((t, i) => h("div", Object.assign({ alignItems: "center", borderBottom: "2px solid " + rgba(KT.night, 0.18), padding: (story ? 22 : 18) + "px 0" }, TX),
          h("div", { width: 90, flexShrink: 0 }, img(svg('<g stroke="' + KT.night + '" stroke-width="6" stroke-linecap="round">' + Array.from({ length: Math.min(4, i + 1) }, (_, k) => '<path d="M' + (10 + k * 14) + ' 8v34"/>').join("") + '</g>' + (i >= 4 ? '<path d="M4 36L66 12" stroke="' + KT.steel2 + '" stroke-width="6" stroke-linecap="round"/>' : ""), "0 0 72 50", 72, 50), { width: 58, height: 40 })),
          h("div", { fontSize: story ? 40 : 36, fontWeight: 500, color: KT.night, width: W2 - 100 }, plain(t)))))), foot]);
    }
    if (tpl === "compare") {
      const col = (title, its, good) => h("div", Object.assign({ flexDirection: "column", width: (W2 - 24) / 2, border: "2px solid " + (good ? KT.steel : "rgba(255,255,255,0.25)"), background: good ? "rgba(148,188,227,0.12)" : "transparent", padding: "26px 24px" }, TX),
        h("div", { fontFamily: "Barlow Condensed", fontWeight: 800, letterSpacing: 2, fontSize: story ? 42 : 36, color: good ? KT.steel : "rgba(255,255,255,0.7)", marginBottom: 10 }, plain(title).toUpperCase()),
        (its || []).slice(0, 5).map(t => h("div", { marginTop: 12, fontSize: story ? 32 : 28, color: good ? "#fff" : "rgba(255,255,255,0.65)", lineHeight: 1.25, textDecoration: good ? "none" : "line-through" }, plain(t))));
      return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kicker, h("div", TX, head(s.headline, fit(plain(s.headline).toUpperCase(), W2, 3, story ? 96 : 84, 48, 0.48), fg)),
        h("div", { justifyContent: "space-between", marginTop: 38 }, col(s.leftTitle || "Strichliste", s.leftItems, false), col(s.rightTitle || "Kantineur", s.rightItems, true))), foot]);
    }
    if (tpl === "stat") {
      return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kicker,
        h("div", Object.assign({ fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: fit(plain(s.number), W2, 1, story ? 340 : 300, 100, 0.48), color: KT.steel, lineHeight: 0.9 }, TX), plain(s.number)),
        h("div", Object.assign({ marginTop: 18 }, TX), head(s.label || s.headline, fit(plain(s.label || s.headline).toUpperCase(), W2, 2, story ? 76 : 66, 40, 0.48), fg)),
        s.sub ? h("div", Object.assign({ marginTop: 18, fontSize: story ? 36 : 32, color: sub }, TX), plain(s.sub)) : null), foot]);
    }
    if (tpl === "quote") {
      return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto", borderLeft: "8px solid " + KT.steel2, paddingLeft: 40 },
        h("div", TX, rich(s.headline, fit(plain(s.headline), W2 - 60, 6, story ? 70 : 60, 36, 0.5), KT.night, { family: "Barlow", weight: 600, lh: 1.15, ls: 0, mark: () => ({ color: KT.steel2 }) })),
        s.author ? h("div", Object.assign({ marginTop: 26, fontFamily: "Barlow Condensed", fontWeight: 700, letterSpacing: 3, fontSize: 30, color: KT.steel2 }, TX), "— " + plain(s.author).toUpperCase()) : null), foot]);
    }
    if (tpl === "cta") {
      return R([h("div", { flexDirection: "column", alignItems: "center", width: W2, marginTop: "auto", marginBottom: "auto" },
        h("div", Object.assign({ alignItems: "center", gap: 22 }, DE), h("div", { width: story ? 130 : 112, height: story ? 130 : 112, borderRadius: 18, background: "#fff", alignItems: "center", justifyContent: "center" }, img(svg('<g stroke="' + KT.night + '" stroke-width="7" stroke-linecap="round"><path d="M22 20v40M36 20v40M50 20v40M64 20v40"/></g><path d="M14 52L72 28" stroke="' + KT.steel2 + '" stroke-width="7" stroke-linecap="round"/>', "0 0 86 80", 86, 80), { width: story ? 90 : 78, height: story ? 84 : 72 })),
          h("div", { flexDirection: "column" }, h("div", { fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: story ? 104 : 90, color: "#fff", letterSpacing: 3, lineHeight: 0.95 }, "KANTINEUR"), h("div", { fontFamily: "Barlow", fontSize: story ? 40 : 34, color: KT.steel }, "Antippen. Gebucht."))),
        h("div", Object.assign({ marginTop: 56 }, TX), head(s.headline, fit(plain(s.headline).toUpperCase(), W2, 3, story ? 84 : 72, 42, 0.48), "#fff", true, W2)),
        s.sub ? h("div", Object.assign({ marginTop: 18, fontSize: story ? 36 : 32, color: sub, textAlign: "center", justifyContent: "center" }, TX), plain(s.sub)) : null,
        h("div", { marginTop: 44 }, btn(s.cta || "14 Tage frei testen")), h("div", Object.assign({ marginTop: 20, fontSize: 26, color: sub }, TX), "kantineur.at · 9 € pro Kantine und Monat"))]);
    }
    return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kicker,
      h("div", TX, head(s.headline, fit(plain(s.headline).toUpperCase(), W2, 4, story ? 150 : 132, 60, 0.46), fg)),
      s.sub ? h("div", Object.assign({ marginTop: 28, fontSize: story ? 40 : 36, color: sub, lineHeight: 1.3 }, TX), plain(s.sub)) : null,
      h("div", Object.assign({ marginTop: 34, alignItems: "center", gap: 14 }, DE), img(svg('<g stroke="' + KT.steel + '" stroke-width="6" stroke-linecap="round"><path d="M8 6v40M22 6v40M36 6v40M50 6v40"/></g><path d="M2 40L58 12" stroke="#fff" stroke-width="6" stroke-linecap="round"/>', "0 0 60 52", 60, 52), { width: 90, height: 78 }))), foot]);
  }

  // ═════════════ Blitzdings ═════════════
  const BD = { creme: "#f3efe6", ink: "#1c1a16", gold: "#c79c47", gold2: "#9c7529", line: "#e6dccb" };
  function blitzdings(c) {
    const { s, F, story, W2, TX, DE, v } = c, tpl = s.template || "hook", dark = (tpl === "stat" && v % 2) || (tpl === "hook" && v % 3 === 2);
    const bg = dark ? BD.ink : BD.creme, fg = dark ? "#f3efe6" : BD.ink, sub = dark ? "rgba(243,239,230,0.75)" : rgba(BD.ink, 0.68);
    const head = (txt, size, col, center, w) => rich(txt, size, col, { family: "Cormorant Garamond", weight: 500, center, width: w, ls: -size * 0.01, lh: 1.02, mark: () => ({ color: BD.gold, fontStyle: "italic" }) });
    const kicker = s.kicker ? h("div", Object.assign({ fontFamily: "Inter", fontWeight: 600, letterSpacing: 5, fontSize: story ? 24 : 21, color: BD.gold, marginBottom: 22 }, TX), plain(s.kicker).toUpperCase()) : null;
    const glow = h("div", Object.assign({ position: "absolute", left: -F.w * 0.2, top: -F.w * 0.3, width: F.w * 1.1, height: F.w * 1.1, borderRadius: F.w, background: dark ? "radial-gradient(circle, rgba(199,156,71,0.22) 0%, rgba(0,0,0,0) 65%)" : "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 65%)" }, DE));
    const logo = h("div", Object.assign({ width: story ? 92 : 78, height: story ? 92 : 78, borderRadius: 18, background: "#ffffff", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 30px rgba(28,26,22,0.12)" }, DE), logoImg(c, story ? 62 : 52));
    const top = h("div", { justifyContent: "space-between", alignItems: "center", width: W2, flexShrink: 0 }, logo, c.counter ? h("div", Object.assign({ fontFamily: "Cormorant Garamond", fontWeight: 500, fontStyle: "italic", fontSize: 34, color: BD.gold }, TX), c.counter.replace("/", " / ")) : null);
    const btn = t => h("div", Object.assign({ background: BD.gold, color: "#1c1a16", fontFamily: "Inter", fontWeight: 600, fontSize: story ? 30 : 27, borderRadius: 99, padding: story ? "20px 40px" : "17px 36px", boxShadow: "0 12px 30px rgba(156,117,41,0.3)" }, TX), plain(t));
    const foot = h("div", { justifyContent: "space-between", alignItems: "center", width: W2, marginTop: story ? 0 : "auto", flexShrink: 0 },   /* Hochformat (Reel): Inhalt mittig, Fußzeile unten */
      c.swipe ? h("div", Object.assign({ fontFamily: "Inter", fontWeight: 600, letterSpacing: 4, fontSize: 22, color: BD.gold, alignItems: "center" }, TX), "WEITER", h("div", { marginLeft: 10 }, swipeArrow(BD.gold))) : s.cta && tpl !== "cta" ? btn(s.cta) : h("div", {}),
      h("div", Object.assign({ fontFamily: "Inter", fontSize: 22, letterSpacing: 2, color: sub }, TX), "BLITZDINGS.CO.AT"));
    const R = kids => h("div", { width: F.w, height: F.h, position: "relative", flexDirection: "column", overflow: "hidden", padding: F.top + "px " + F.px + "px " + F.bottom + "px", fontFamily: "Inter", background: rootBg(c, bg) }, [glow].concat(kids));
    const card = (kids, st) => h("div", Object.assign({ flexDirection: "column", background: dark ? "rgba(255,255,255,0.06)" : "#ffffff", border: "1.5px solid " + (dark ? "rgba(199,156,71,0.35)" : BD.line), borderRadius: 30, padding: "30px 30px" }, st || {}, TX), kids);
    const prod = c.image || "", isProd = /^data:image\/png/.test(prod);
    if ((tpl === "photo" || tpl === "hook") && prod) {
      // Produkt (Fotobox) auf weißer Karte bzw. Foto als Polaroid, Text daneben/darunter
      const pw = story ? 560 : 470, ph = story ? 760 : 600;
      const frame = isProd ? h("div", Object.assign({ width: pw, height: ph, background: "#ffffff", borderRadius: 34, border: "1.5px solid " + BD.line, alignItems: "center", justifyContent: "center", boxShadow: "0 30px 70px rgba(28,26,22,0.12)" }, DE), img(prod, { height: ph - 90, width: Math.round((ph - 90) * (s.imageRatio || 0.4)), objectFit: "contain" }))
        : h("div", Object.assign({ width: pw, flexDirection: "column", background: "#ffffff", padding: "22px 22px 70px", boxShadow: "0 30px 70px rgba(28,26,22,0.18)", transform: "rotate(" + (v % 2 ? 3 : -3) + "deg)" }, DE), photo(prod, { width: pw - 44, height: ph - 160 }));
      return R([top, h("div", { flexDirection: story ? "column" : "row", alignItems: story ? "flex-start" : "center", width: W2, marginTop: "auto", marginBottom: "auto", gap: 40 },
        h("div", { flexDirection: "column", width: story ? W2 : W2 - pw - 40 }, kicker, h("div", TX, head(s.headline, fit(plain(s.headline), story ? W2 : W2 - pw - 40, 5, story ? 104 : 80, 44, 0.42), fg)),
          s.sub ? h("div", Object.assign({ marginTop: 22, fontSize: story ? 34 : 28, lineHeight: 1.45, color: sub }, TX), plain(s.sub)) : null), frame), foot]);
    }
    if (tpl === "list") {
      const its = (s.items || []).slice(0, 4), n = its.length || 1, cw = (W2 - 24) / 2;
      return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kicker, h("div", TX, head(s.headline, fit(plain(s.headline), W2, 3, story ? 96 : 84, 46, 0.42), fg)),
        h("div", { flexWrap: "wrap", justifyContent: "space-between", rowGap: 24, marginTop: 40 }, its.map((t, i) => card([
          h("div", { fontFamily: "Cormorant Garamond", fontWeight: 500, fontSize: 52, color: BD.gold, lineHeight: 1 }, String(i + 1).padStart(2, "0")),
          h("div", { marginTop: 14, fontFamily: "Cormorant Garamond", fontWeight: 600, fontSize: fit(plain(t), cw - 60, 3, story ? 44 : 38, 26, 0.42), color: fg, lineHeight: 1.12 }, plain(t))], { width: n === 1 ? W2 : cw, minHeight: story ? 300 : 250 })))), foot]);
    }
    if (tpl === "stat") {
      return R([top, h("div", { flexDirection: "column", alignItems: "center", width: W2, marginTop: "auto", marginBottom: "auto" }, h("div", { alignSelf: "center" }, kicker),
        h("div", Object.assign({ fontFamily: "Cormorant Garamond", fontWeight: 500, fontSize: fit(plain(s.number), W2, 1, story ? 300 : 260, 90, 0.42), color: BD.gold, lineHeight: 1 }, TX), plain(s.number)),
        h("div", Object.assign({ marginTop: 20, fontFamily: "Inter", fontWeight: 600, letterSpacing: 5, fontSize: story ? 28 : 25, color: fg }, TX), plain(s.label || s.headline).toUpperCase()),
        s.sub ? h("div", Object.assign({ marginTop: 26, fontFamily: "Cormorant Garamond", fontStyle: "italic", fontWeight: 500, fontSize: story ? 46 : 40, color: sub, textAlign: "center", justifyContent: "center" }, TX), plain(s.sub)) : null), foot]);
    }
    if (tpl === "compare") {
      const col = (title, its, good) => card([h("div", { fontFamily: "Inter", fontWeight: 600, letterSpacing: 4, fontSize: 20, color: good ? BD.gold : sub }, plain(title).toUpperCase()),
        (its || []).slice(0, 5).map(t => h("div", { marginTop: 16, fontFamily: "Cormorant Garamond", fontWeight: good ? 600 : 500, fontSize: story ? 38 : 33, lineHeight: 1.15, color: good ? fg : sub }, plain(t)))], { width: (W2 - 24) / 2, border: "1.5px solid " + (good ? BD.gold : BD.line) });
      return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kicker, h("div", TX, head(s.headline, fit(plain(s.headline), W2, 3, story ? 92 : 80, 44, 0.42), fg)),
        h("div", { justifyContent: "space-between", marginTop: 40 }, col(s.leftTitle || "Gewöhnlich", s.leftItems, false), col(s.rightTitle || "Blitzdings", s.rightItems, true))), foot]);
    }
    if (tpl === "quote") {
      return R([top, h("div", { flexDirection: "column", alignItems: "center", width: W2, marginTop: "auto", marginBottom: "auto" },
        h("div", Object.assign({ fontFamily: "Cormorant Garamond", fontSize: 200, color: BD.gold, lineHeight: 0.8, height: 120 }, TX), "“"),
        h("div", Object.assign({ marginTop: 10 }, TX), rich(s.headline, fit(plain(s.headline), W2, 5, story ? 80 : 70, 40, 0.4), fg, { family: "Cormorant Garamond", weight: 500, center: true, width: W2, lh: 1.12, mark: () => ({ color: BD.gold, fontStyle: "italic" }) })),
        h("div", Object.assign({ marginTop: 30, width: 90, height: 2, background: BD.gold }, DE)),
        s.author ? h("div", Object.assign({ marginTop: 22, fontFamily: "Inter", fontWeight: 600, letterSpacing: 4, fontSize: 20, color: sub }, TX), plain(s.author).toUpperCase()) : null), foot]);
    }
    if (tpl === "cta") {
      return R([h("div", { flexDirection: "column", alignItems: "center", width: W2, marginTop: "auto", marginBottom: "auto" },
        h("div", Object.assign({ width: story ? 170 : 150, height: story ? 170 : 150, borderRadius: 30, background: "#fff", alignItems: "center", justifyContent: "center", boxShadow: "0 20px 50px rgba(28,26,22,0.14)" }, DE), logoImg(c, story ? 120 : 104)),
        h("div", { marginTop: 40, alignSelf: "center" }, kicker),
        h("div", TX, head(s.headline, fit(plain(s.headline), W2, 3, story ? 110 : 96, 50, 0.42), fg, true, W2)),
        s.sub ? h("div", Object.assign({ marginTop: 20, fontSize: story ? 32 : 28, color: sub, textAlign: "center", justifyContent: "center", lineHeight: 1.4 }, TX), plain(s.sub)) : null,
        h("div", { marginTop: 44 }, btn(s.cta || "Jetzt Termin buchen")), h("div", Object.assign({ marginTop: 22, fontFamily: "Inter", letterSpacing: 3, fontSize: 21, color: sub }, TX), "FOTOBOX & 360° VIDEOBOOTH · VORARLBERG"))]);
    }
    return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kicker,
      h("div", TX, head(s.headline, fit(plain(s.headline), W2, 5, story ? 150 : 132, 60, 0.42), fg)),
      s.sub ? h("div", Object.assign({ marginTop: 30, fontSize: story ? 36 : 31, lineHeight: 1.45, color: sub, width: W2 * 0.85 }, TX), plain(s.sub)) : null,
      h("div", Object.assign({ marginTop: 40, width: 120, height: 2, background: BD.gold }, DE))), foot]);
  }

  // ═════════════ VALUERO ═════════════
  const VA = { green: "#1f6a49", green2: "#154a34", warm: "#f4f1ea", ink: "#141b16", gold: "#c2a05c" };
  function valuero(c) {
    const { s, F, story, W2, TX, DE, v } = c, tpl = s.template || "hook", ph = c.image;
    const head = (txt, size, col, center, w) => rich(txt, size, col, { family: "Merriweather", weight: 900, center, width: w, ls: -size * 0.015, lh: 1.12, wordGap: 0.24, mark: () => ({ color: col === "#ffffff" ? "#e9d9b0" : VA.green }) });
    const mountain = (col, wpx) => img(svg('<path d="M2 58 L34 18 L46 32 L62 8 L98 58" fill="none" stroke="' + col + '" stroke-width="3.5" stroke-linejoin="round"/><path d="M28 26 L34 18 L40 25 M56 16 L62 8 L69 17" fill="none" stroke="' + col + '" stroke-width="3.5" stroke-linejoin="round"/>', "0 0 100 60", 100, 60), { width: wpx, height: Math.round(wpx * 0.6) });
    const kick = (col) => s.kicker ? h("div", Object.assign({ alignItems: "center", gap: 14, marginBottom: 22 }, TX), h("div", { width: 46, height: 2, background: col }), h("div", { fontFamily: "Inter", fontWeight: 700, letterSpacing: 4, fontSize: story ? 24 : 21, color: col }, plain(s.kicker).toUpperCase())) : null;
    const brandRow = (onDark) => h("div", Object.assign({ alignItems: "center", gap: 14 }, DE), mountain(onDark ? "#ffffff" : VA.green, story ? 70 : 60), h("div", { fontFamily: "Merriweather", fontWeight: 400, letterSpacing: 6, fontSize: story ? 30 : 26, color: onDark ? "#ffffff" : VA.ink }, "VALUERO"));
    const top = onDark => h("div", { justifyContent: "space-between", alignItems: "center", width: W2, flexShrink: 0 }, brandRow(onDark), c.counter ? h("div", Object.assign({ fontFamily: "Inter", fontWeight: 600, fontSize: 24, color: onDark ? "rgba(255,255,255,0.8)" : VA.green }, TX), c.counter) : null);
    const btn = (t, onDark) => h("div", Object.assign({ background: onDark ? "#ffffff" : VA.green, color: onDark ? VA.green2 : "#ffffff", fontFamily: "Inter", fontWeight: 700, fontSize: story ? 30 : 27, borderRadius: 99, padding: story ? "20px 38px" : "16px 32px" }, TX), plain(t));
    const foot = onDark => h("div", { justifyContent: "space-between", alignItems: "center", width: W2, marginTop: story ? 0 : "auto", flexShrink: 0 },   /* Hochformat (Reel): Inhalt mittig, Fußzeile unten */
      c.swipe ? h("div", Object.assign({ fontFamily: "Inter", fontWeight: 700, fontSize: 24, letterSpacing: 3, color: onDark ? "#fff" : VA.green, alignItems: "center" }, TX), "MEHR", h("div", { marginLeft: 10 }, swipeArrow(onDark ? "#ffffff" : VA.green))) : s.cta && tpl !== "cta" ? btn(s.cta, onDark) : h("div", {}),
      h("div", Object.assign({ fontFamily: "Inter", fontSize: 22, color: onDark ? "rgba(255,255,255,0.8)" : rgba(VA.ink, 0.6) }, TX), "valuero.at"));
    const R = (bg, kids) => h("div", { width: F.w, height: F.h, position: "relative", flexDirection: "column", overflow: "hidden", padding: F.top + "px " + F.px + "px " + F.bottom + "px", fontFamily: "Inter", background: rootBg(c, bg) }, kids);
    const full = shade => h("div", Object.assign({ position: "absolute", left: 0, top: 0, width: F.w, height: F.h }, DE), ph ? photo(ph, { width: F.w, height: F.h }) : h("div", { width: F.w, height: F.h, background: "linear-gradient(170deg, #5d7c8f 0%, #2c3e46 100%)" }), h("div", { position: "absolute", left: 0, top: 0, width: F.w, height: F.h, background: shade }));
    if (tpl === "photo" || tpl === "hook" || tpl === "cta" || (tpl === "stat" && ph)) {
      const isCta = tpl === "cta";
      return R(VA.ink, [full(isCta ? "linear-gradient(180deg, rgba(20,27,22,0.55) 0%, rgba(20,27,22,0.75) 100%)" : "linear-gradient(180deg, rgba(20,27,22,0.45) 0%, rgba(20,27,22,0.05) 30%, rgba(20,27,22,0.45) 52%, rgba(20,27,22,0.92) 100%)"),
        top(true), h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: isCta ? "auto" : 40, alignItems: isCta ? "center" : "flex-start" }, kick("#e9d9b0"),
          tpl === "stat" ? h("div", Object.assign({ fontFamily: "Merriweather", fontWeight: 900, fontSize: fit(plain(s.number), W2, 1, 240, 90, 0.6), color: "#fff", lineHeight: 1 }, TX), plain(s.number)) : null,
          h("div", TX, head(tpl === "stat" ? (s.label || s.headline) : s.headline, fit(plain(tpl === "stat" ? (s.label || s.headline) : s.headline), W2, 4, story ? 108 : 92, 46, 0.56), "#ffffff", isCta, W2)),
          s.sub ? h("div", Object.assign({ marginTop: 24, fontSize: story ? 36 : 32, lineHeight: 1.45, color: "rgba(255,255,255,0.9)", textAlign: isCta ? "center" : "left", justifyContent: isCta ? "center" : "flex-start" }, TX), plain(s.sub)) : null,
          isCta ? h("div", { marginTop: 40 }, btn(s.cta || "Unterkunft finden", true)) : null), isCta ? h("div", {}) : foot(true)]);
    }
    if (tpl === "list") {
      const its = (s.items || []).slice(0, 4), cw = (W2 - 24) / 2;
      return R(VA.warm, [top(false), h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kick(VA.green), h("div", TX, head(s.headline, fit(plain(s.headline), W2, 3, story ? 88 : 76, 42, 0.56), VA.ink)),
        h("div", { flexWrap: "wrap", justifyContent: "space-between", rowGap: 22, marginTop: 36 }, its.map((t, i) => h("div", Object.assign({ width: its.length === 1 ? W2 : cw, height: story ? 360 : 290, borderRadius: 26, overflow: "hidden", position: "relative", flexDirection: "column", justifyContent: "flex-end" }, TX),
          h("div", Object.assign({ position: "absolute", left: 0, top: 0, width: cw, height: story ? 360 : 290 }, DE), (i === 0 && ph) || (i === 1 && c.image2) ? photo(i === 0 ? ph : c.image2, { width: cw, height: story ? 360 : 290 }) : h("div", { width: cw, height: story ? 360 : 290, background: i % 2 ? VA.green2 : VA.green })),
          h("div", { position: "absolute", left: 0, top: 0, width: cw, height: story ? 360 : 290, background: "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.65) 100%)" }),
          h("div", { padding: "22px 24px", fontFamily: "Merriweather", fontWeight: 700, fontSize: fit(plain(t), cw - 50, 3, story ? 38 : 33, 24, 0.55), color: "#fff", lineHeight: 1.2 }, plain(t)))))), foot(false)]);
    }
    if (tpl === "compare" || tpl === "stat") {
      const isStat = tpl === "stat";
      return R(VA.warm, [top(false), h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kick(VA.green),
        isStat ? h("div", Object.assign({ fontFamily: "Merriweather", fontWeight: 900, fontSize: fit(plain(s.number), W2, 1, story ? 260 : 220, 90, 0.6), color: VA.green, lineHeight: 1 }, TX), plain(s.number)) : null,
        h("div", Object.assign({ marginTop: isStat ? 14 : 0 }, TX), head(isStat ? (s.label || s.headline) : s.headline, fit(plain(isStat ? (s.label || s.headline) : s.headline), W2, 3, story ? 84 : 72, 40, 0.56), VA.ink)),
        isStat ? (s.sub ? h("div", Object.assign({ marginTop: 22, fontSize: story ? 34 : 30, color: rgba(VA.ink, 0.7), lineHeight: 1.45 }, TX), plain(s.sub)) : null) :
          h("div", { justifyContent: "space-between", marginTop: 34 }, [[s.leftTitle || "Massenportal", s.leftItems, false], [s.rightTitle || "VALUERO", s.rightItems, true]].map(([t, its, good]) => h("div", Object.assign({ flexDirection: "column", width: (W2 - 24) / 2, background: good ? VA.green : "#ffffff", color: good ? "#fff" : VA.ink, borderRadius: 24, padding: "26px 24px" }, TX),
            h("div", { fontFamily: "Merriweather", fontWeight: 900, fontSize: story ? 36 : 31 }, plain(t)), (its || []).slice(0, 5).map(x => h("div", { marginTop: 12, fontSize: story ? 30 : 26, lineHeight: 1.3, opacity: good ? 1 : 0.75 }, plain(x))))))), foot(false)]);
    }
    return R(VA.warm, [top(false), h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, h("div", Object.assign({ marginBottom: 26 }, DE), mountain(VA.gold, 120)),
      h("div", TX, rich(s.headline, fit(plain(s.headline), W2, 6, story ? 78 : 66, 38, 0.52), VA.ink, { family: "Merriweather", weight: 400, italic: true, lh: 1.3, ls: 0, mark: () => ({ color: VA.green, fontWeight: 700 }) })),
      s.author ? h("div", Object.assign({ marginTop: 28, fontWeight: 700, letterSpacing: 3, fontSize: 22, color: VA.green }, TX), "— " + plain(s.author).toUpperCase()) : null), foot(false)]);
  }

  // ═════════════ Skikaiser ═════════════
  const SK = { red: "#D81E2C", red2: "#a8121e", ink: "#17191C", gold: "#E9B23A", paper: "#F6F4F0" };
  function skikaiser(c) {
    const { s, F, story, W2, TX, DE, v } = c, tpl = s.template || "hook", ph = c.image;
    const head = (txt, size, col, center, w) => rich(txt, size, col, { family: "Barlow Condensed", weight: 800, italic: true, upper: true, center, width: w, ls: 0, lh: 0.95, wordGap: 0.2, mark: sz => ({ background: SK.red, color: "#fff", padding: "0 " + Math.round(sz * 0.14) + "px" }) });
    const stamp = (t, sz) => h("div", Object.assign({ background: "#ffffff", padding: Math.round(sz * 0.18) + "px " + Math.round(sz * 0.32) + "px", transform: "rotate(-4deg)", boxShadow: "0 12px 30px rgba(0,0,0,0.3)", alignSelf: "flex-start" }, DE),
      h("span", { fontFamily: "Lilita One", fontSize: sz, color: SK.red, letterSpacing: 1 }, "SKI"), h("span", { fontFamily: "Lilita One", fontSize: sz, color: SK.ink, letterSpacing: 1 }, "KAISER!"));
    const top = h("div", { justifyContent: "space-between", alignItems: "center", width: W2, flexShrink: 0 }, c.brand.logo ? h("div", Object.assign({ width: story ? 96 : 84, height: story ? 96 : 84, borderRadius: 22, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }, DE), logoImg(c, story ? 96 : 84)) : stamp("", 40),
      h("div", Object.assign({ alignItems: "center", gap: 10 }, TX), c.counter ? h("div", { fontFamily: "Barlow Condensed", fontWeight: 800, fontStyle: "italic", fontSize: 32, color: "#fff", background: SK.ink, padding: "4px 16px" }, c.counter) : h("div", { alignItems: "center", gap: 8, fontFamily: "Barlow Condensed", fontWeight: 800, fontStyle: "italic", fontSize: 30, color: "#fff", background: SK.red, padding: "6px 16px" }, h("div", { width: 12, height: 12, borderRadius: 12, background: "#fff" }), "LIVE")));
    const bar = (t, sz) => h("div", Object.assign({ background: SK.red, padding: "8px 26px 10px", transform: "skewX(-10deg)", alignSelf: "flex-start" }, TX), h("div", { transform: "skewX(10deg)", fontFamily: "Barlow Condensed", fontWeight: 800, fontStyle: "italic", fontSize: sz, color: "#fff", letterSpacing: 1 }, plain(t).toUpperCase()));
    const foot = h("div", { justifyContent: "space-between", alignItems: "center", width: W2, marginTop: story ? 0 : "auto", flexShrink: 0 },   /* Hochformat (Reel): Inhalt mittig, Fußzeile unten */
      c.swipe ? h("div", Object.assign({ fontFamily: "Barlow Condensed", fontWeight: 800, fontStyle: "italic", fontSize: 34, color: "#fff", alignItems: "center" }, TX), "WEITER", h("div", { marginLeft: 10 }, swipeArrow("#ffffff"))) : s.cta && tpl !== "cta" ? bar(s.cta, story ? 40 : 34) : h("div", {}),
      h("div", Object.assign({ fontFamily: "Barlow Condensed", fontWeight: 700, fontStyle: "italic", fontSize: 28, color: "rgba(255,255,255,0.85)", letterSpacing: 1 }, TX), "BALD IM APP STORE"));
    const R = kids => h("div", { width: F.w, height: F.h, position: "relative", flexDirection: "column", overflow: "hidden", padding: F.top + "px " + F.px + "px " + F.bottom + "px", fontFamily: "Archivo", background: rootBg(c, SK.ink) }, kids);
    const bgPh = shade => h("div", Object.assign({ position: "absolute", left: 0, top: 0, width: F.w, height: F.h }, DE), ph ? photo(ph, { width: F.w, height: F.h }) : h("div", { width: F.w, height: F.h, background: "linear-gradient(160deg, #2a3442 0%, #0f1216 100%)" }), h("div", { position: "absolute", left: 0, top: 0, width: F.w, height: F.h, background: shade }));
    const stripes = h("div", Object.assign({ position: "absolute", right: -120, top: story ? 160 : 60, width: 520, height: 34, background: SK.red, transform: "rotate(-24deg)" }, DE));
    const stripes2 = h("div", Object.assign({ position: "absolute", right: -120, top: story ? 210 : 110, width: 520, height: 14, background: "#ffffff", transform: "rotate(-24deg)" }, DE));
    if (tpl === "stat") {   // Zeittafel wie im TV
      return R([bgPh("linear-gradient(180deg, rgba(10,12,16,0.35) 0%, rgba(10,12,16,0.85) 100%)"), stripes, stripes2, top,
        h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, s.kicker ? bar(s.kicker, story ? 38 : 32) : null,
          h("div", Object.assign({ marginTop: 26, background: "rgba(10,12,16,0.92)", border: "3px solid " + SK.gold, padding: "26px 34px", flexDirection: "column" }, TX),
            h("div", { fontFamily: "Barlow Condensed", fontWeight: 700, fontStyle: "italic", fontSize: story ? 36 : 30, color: SK.gold, letterSpacing: 3 }, plain(s.label || s.headline).toUpperCase()),
            h("div", { fontFamily: "Barlow Condensed", fontWeight: 800, fontStyle: "italic", fontSize: fit(plain(s.number), W2 - 80, 1, story ? 240 : 200, 80, 0.48), color: "#fff", lineHeight: 1 }, plain(s.number))),
          s.sub ? h("div", Object.assign({ marginTop: 22, fontFamily: "Archivo", fontWeight: 500, fontSize: story ? 34 : 30, color: "rgba(255,255,255,0.9)" }, TX), plain(s.sub)) : null), foot]);
    }
    if (tpl === "list") {   // Startliste
      const its = (s.items || []).slice(0, 5);
      return R([bgPh("linear-gradient(180deg, rgba(10,12,16,0.55) 0%, rgba(10,12,16,0.9) 100%)"), top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" },
        h("div", TX, head(s.headline, fit(plain(s.headline).toUpperCase(), W2, 3, story ? 110 : 96, 52, 0.46), "#fff")),
        h("div", { flexDirection: "column", marginTop: 32 }, its.map((t, i) => h("div", Object.assign({ alignItems: "center", marginTop: 10 }, TX),
          h("div", { width: 76, height: 70, background: i === 0 ? SK.gold : SK.red, color: i === 0 ? SK.ink : "#fff", alignItems: "center", justifyContent: "center", fontFamily: "Barlow Condensed", fontWeight: 800, fontStyle: "italic", fontSize: 44, flexShrink: 0 }, String(i + 1)),
          h("div", { height: 70, flexGrow: 1, background: "rgba(255,255,255,0.94)", alignItems: "center", padding: "0 24px", fontFamily: "Barlow Condensed", fontWeight: 700, fontStyle: "italic", fontSize: fit(plain(t).toUpperCase(), W2 - 140, 1, story ? 42 : 38, 24, 0.46), color: SK.ink }, plain(t).toUpperCase()))))), foot]);
    }
    if (tpl === "compare") {
      const col = (title, its, good) => h("div", Object.assign({ flexDirection: "column", width: (W2 - 20) / 2, background: good ? SK.red : "rgba(255,255,255,0.12)", padding: "24px 22px", transform: "skewX(-4deg)" }, TX),
        h("div", { fontFamily: "Barlow Condensed", fontWeight: 800, fontStyle: "italic", fontSize: story ? 46 : 40, color: "#fff" }, plain(title).toUpperCase()), (its || []).slice(0, 5).map(t => h("div", { marginTop: 10, fontFamily: "Archivo", fontWeight: 600, fontSize: story ? 30 : 26, color: "#fff", lineHeight: 1.25 }, plain(t))));
      return R([bgPh("linear-gradient(180deg, rgba(10,12,16,0.5) 0%, rgba(10,12,16,0.9) 100%)"), top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" },
        h("div", TX, head(s.headline, fit(plain(s.headline).toUpperCase(), W2, 3, story ? 100 : 88, 48, 0.46), "#fff")),
        h("div", { justifyContent: "space-between", marginTop: 34 }, col(s.leftTitle || "Training", s.leftItems, false), col(s.rightTitle || "Rennen", s.rightItems, true))), foot]);
    }
    if (tpl === "cta") {
      return R([bgPh("linear-gradient(180deg, rgba(10,12,16,0.4) 0%, rgba(10,12,16,0.85) 100%)"), stripes, stripes2,
        h("div", { flexDirection: "column", alignItems: "center", width: W2, marginTop: "auto", marginBottom: "auto" }, h("div", { alignSelf: "center" }, stamp("", story ? 110 : 96)),
          h("div", Object.assign({ marginTop: 46 }, TX), head(s.headline, fit(plain(s.headline).toUpperCase(), W2, 3, story ? 100 : 88, 48, 0.46), "#fff", true, W2)),
          s.sub ? h("div", Object.assign({ marginTop: 18, fontFamily: "Archivo", fontWeight: 600, fontSize: story ? 32 : 28, color: "rgba(255,255,255,0.9)", textAlign: "center", justifyContent: "center" }, TX), plain(s.sub)) : null,
          h("div", Object.assign({ marginTop: 40, alignSelf: "center" }, TX), bar(s.cta || "Bald im App Store", story ? 48 : 42)),
          h("div", Object.assign({ marginTop: 20, fontFamily: "Barlow Condensed", fontWeight: 700, fontStyle: "italic", letterSpacing: 2, fontSize: 28, color: "#fff" }, TX), "ABFAHRT · SUPER-G · RIESENSLALOM · SLALOM · SNOWBOARDCROSS"))]);
    }
    if (tpl === "quote") {
      return R([bgPh("linear-gradient(180deg, rgba(10,12,16,0.6) 0%, rgba(10,12,16,0.9) 100%)"), top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" },
        bar("Murli meint", story ? 38 : 32), h("div", Object.assign({ marginTop: 26, background: "#fff", padding: "34px 36px", borderRadius: 30, flexDirection: "column" }, TX),
          rich(s.headline, fit(plain(s.headline), W2 - 72, 6, story ? 64 : 56, 34, 0.5), SK.ink, { family: "Archivo", weight: 700, lh: 1.2, ls: 0, mark: () => ({ color: SK.red }) }))), foot]);
    }
    // hook/photo: Vollbild-Spielszene + rote Einblendung (Bauchbinde)
    return R([bgPh("linear-gradient(180deg, rgba(10,12,16,0.35) 0%, rgba(10,12,16,0) 30%, rgba(10,12,16,0.1) 55%, rgba(10,12,16,0.88) 100%)"), stripes, stripes2, top,
      h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: 30 }, s.kicker ? bar(s.kicker, story ? 38 : 32) : null,
        h("div", Object.assign({ marginTop: 18 }, TX), head(s.headline, fit(plain(s.headline).toUpperCase(), W2, 4, story ? 140 : 120, 56, 0.46), "#fff")),
        s.sub ? h("div", Object.assign({ marginTop: 16, alignSelf: "flex-start", background: "rgba(255,255,255,0.95)", padding: "8px 20px", fontFamily: "Barlow Condensed", fontWeight: 700, fontStyle: "italic", fontSize: story ? 36 : 31, color: SK.ink }, TX), plain(s.sub).toUpperCase()) : null), foot]);
  }

  // ═════════════ Hüttengaudi ═════════════
  const HG = { loden: "#2F4A3A", loden2: "#1C2E23", leinen: "#F6F0E4", creme: "#F3EBDD", eiche: "#C9A86A", gold: "#E7C982", rot: "#B8312F", wood: "#8a5a32" };
  function huettengaudi(c) {
    const { s, F, story, W2, TX, DE, v } = c, tpl = s.template || "hook", ph = c.image, dark = tpl === "hook" || tpl === "cta" || tpl === "stat" || (tpl === "photo" && v % 2);
    const bg = dark ? HG.loden : HG.leinen, fg = dark ? "#ffffff" : HG.loden2, sub = dark ? "rgba(255,255,255,0.85)" : rgba(HG.loden2, 0.75);
    const head = (txt, size, col, center, w) => rich(txt, size, col, { family: "Fraunces", weight: 800, center, width: w, ls: -size * 0.015, lh: 1.05, mark: () => ({ color: dark ? HG.gold : HG.rot }) });
    const snow = Array.from({ length: 14 }, (_, i) => h("div", Object.assign({ position: "absolute", left: (i * 173 + v * 61) % F.w, top: (i * 297 + v * 89) % F.h, width: 10 + (i % 3) * 6, height: 10 + (i % 3) * 6, borderRadius: 20, background: "rgba(255,255,255," + (dark ? 0.35 : 0.0) + ")" }, DE)));
    const pill = (t, bgc, fgc, sz) => h("div", Object.assign({ background: bgc, color: fgc, fontFamily: "Fredoka", fontWeight: 600, fontSize: sz || (story ? 32 : 28), borderRadius: 99, padding: story ? "14px 30px" : "12px 26px", boxShadow: "0 6px 0 rgba(0,0,0,0.18)", alignSelf: "flex-start" }, TX), plain(t));
    const icon = h("div", Object.assign({ width: story ? 92 : 80, height: story ? 92 : 80, borderRadius: 22, overflow: "hidden", border: "4px solid #ffffff", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }, DE), logoImg(c, story ? 84 : 72));
    const top = h("div", { justifyContent: "space-between", alignItems: "center", width: W2, flexShrink: 0 }, h("div", { alignItems: "center", gap: 16 }, icon, h("div", Object.assign({ fontFamily: "Fraunces", fontWeight: 800, fontSize: story ? 44 : 38, color: fg }, DE), "Hüttengaudi")),
      c.counter ? h("div", Object.assign({ fontFamily: "Fredoka", fontWeight: 600, fontSize: 26, color: dark ? HG.gold : HG.loden, background: dark ? "rgba(255,255,255,0.12)" : "#fff", borderRadius: 99, padding: "6px 16px" }, TX), c.counter) : null);
    const foot = h("div", { justifyContent: "space-between", alignItems: "center", width: W2, marginTop: story ? 0 : "auto", flexShrink: 0 },   /* Hochformat (Reel): Inhalt mittig, Fußzeile unten */
      c.swipe ? h("div", Object.assign({ fontFamily: "Fredoka", fontWeight: 600, fontSize: 30, color: dark ? HG.gold : HG.loden, alignItems: "center" }, TX), "Weiter", h("div", { marginLeft: 10 }, swipeArrow(dark ? HG.gold : HG.loden))) : s.cta && tpl !== "cta" ? pill(s.cta, HG.gold, HG.loden2) : h("div", {}),
      h("div", Object.assign({ fontFamily: "Fredoka", fontWeight: 500, fontSize: 26, color: sub }, TX), "Bald im App Store"));
    const R = kids => h("div", { width: F.w, height: F.h, position: "relative", flexDirection: "column", overflow: "hidden", padding: F.top + "px " + F.px + "px " + F.bottom + "px", fontFamily: "Fredoka", background: rootBg(c, bg) }, snow.concat(kids));
    const framed = (wpx, hpx, rot) => h("div", Object.assign({ width: wpx, height: hpx, borderRadius: 34, overflow: "hidden", border: "10px solid #ffffff", boxShadow: "0 26px 60px rgba(0,0,0,0.3)", transform: "rotate(" + (rot || 0) + "deg)" }, DE), ph ? photo(ph, { width: wpx - 20, height: hpx - 20 }) : h("div", { width: wpx, height: hpx, background: HG.eiche }));
    if (tpl === "photo" || (tpl === "hook" && ph)) {
      const fw = W2, fh = story ? 980 : 700;
      return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto", alignItems: "center" }, framed(fw, fh, v % 2 ? 1.5 : -1.5),
        h("div", { flexDirection: "column", width: W2, marginTop: 40 }, s.kicker ? pill(s.kicker, HG.rot, "#fff", story ? 28 : 24) : null, h("div", Object.assign({ marginTop: 18 }, TX), head(s.headline, fit(plain(s.headline), W2, 3, story ? 92 : 74, 40, 0.55), fg)),
          s.sub ? h("div", Object.assign({ marginTop: 14, fontSize: story ? 34 : 29, fontWeight: 500, color: sub }, TX), plain(s.sub)) : null)), foot]);
    }
    if (tpl === "list") {
      const its = (s.items || []).slice(0, 5);
      return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, h("div", TX, head(s.headline, fit(plain(s.headline), W2, 3, story ? 88 : 76, 42, 0.55), fg)),
        h("div", { flexDirection: "column", marginTop: 30, rowGap: 14 }, its.map((t, i) => h("div", Object.assign({ alignItems: "center", background: "#ffffff", borderRadius: 26, padding: "16px 20px", border: "3px solid " + HG.eiche, boxShadow: "0 5px 0 " + HG.eiche }, TX),
          h("div", { width: 64, height: 64, borderRadius: 64, background: pick([HG.loden, HG.rot, HG.eiche], i), color: "#fff", alignItems: "center", justifyContent: "center", fontFamily: "Fredoka", fontWeight: 700, fontSize: 32, marginRight: 20, flexShrink: 0 }, String(i + 1)),
          h("div", { fontFamily: "Fredoka", fontWeight: 600, fontSize: fit(plain(t), W2 - 140, 2, story ? 38 : 34, 24, 0.5), color: HG.loden2, width: W2 - 130 }, plain(t)))))), foot]);
    }
    if (tpl === "stat") {
      return R([top, h("div", { flexDirection: "column", alignItems: "center", width: W2, marginTop: "auto", marginBottom: "auto" }, s.kicker ? h("div", { alignSelf: "center" }, pill(s.kicker, HG.rot, "#fff")) : null,
        h("div", Object.assign({ marginTop: 26, background: HG.loden2, border: "6px solid " + HG.gold, borderRadius: 40, padding: "30px 50px", alignItems: "center", gap: 20 }, TX), h("div", { fontSize: 90 }, "🏔️"),
          h("div", { fontFamily: "Fredoka", fontWeight: 700, fontSize: fit(plain(s.number), W2 - 260, 1, story ? 200 : 170, 70, 0.55), color: HG.gold, lineHeight: 1 }, plain(s.number))),
        h("div", Object.assign({ marginTop: 26 }, TX), head(s.label || s.headline, fit(plain(s.label || s.headline), W2, 2, story ? 76 : 66, 40, 0.55), "#fff", true, W2)),
        s.sub ? h("div", Object.assign({ marginTop: 14, fontSize: story ? 34 : 30, color: sub, textAlign: "center", justifyContent: "center" }, TX), plain(s.sub)) : null), foot]);
    }
    if (tpl === "compare") {
      const col = (title, its, good) => h("div", Object.assign({ flexDirection: "column", width: (W2 - 24) / 2, background: good ? HG.loden : "#ffffff", color: good ? "#fff" : HG.loden2, border: "4px solid " + (good ? HG.gold : HG.eiche), borderRadius: 30, padding: "24px 22px" }, TX),
        h("div", { fontFamily: "Fraunces", fontWeight: 800, fontSize: story ? 40 : 34 }, plain(title)), (its || []).slice(0, 5).map(t => h("div", { marginTop: 10, fontSize: story ? 30 : 26, fontWeight: 500, lineHeight: 1.25 }, plain(t))));
      return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, h("div", TX, head(s.headline, fit(plain(s.headline), W2, 3, story ? 84 : 72, 40, 0.55), fg)),
        h("div", { justifyContent: "space-between", marginTop: 32 }, col(s.leftTitle || "Vorher", s.leftItems, false), col(s.rightTitle || "Nachher", s.rightItems, true))), foot]);
    }
    if (tpl === "cta") {
      return R([h("div", { flexDirection: "column", alignItems: "center", width: W2, marginTop: "auto", marginBottom: "auto" },
        h("div", Object.assign({ width: story ? 210 : 180, height: story ? 210 : 180, borderRadius: 48, overflow: "hidden", border: "8px solid #fff", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }, DE), logoImg(c, story ? 194 : 164)),
        h("div", Object.assign({ marginTop: 34, fontFamily: "Fraunces", fontWeight: 800, fontSize: story ? 84 : 72, color: "#fff" }, DE), "Hüttengaudi"),
        h("div", Object.assign({ marginTop: 16 }, TX), head(s.headline, fit(plain(s.headline), W2, 3, story ? 66 : 58, 36, 0.55), HG.gold, true, W2)),
        s.sub ? h("div", Object.assign({ marginTop: 14, fontSize: story ? 34 : 30, color: sub, textAlign: "center", justifyContent: "center" }, TX), plain(s.sub)) : null,
        h("div", { marginTop: 40, alignSelf: "center" }, pill(s.cta || "Bald im App Store", HG.gold, HG.loden2, story ? 38 : 34)))]);
    }
    if (tpl === "quote") {
      return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto", background: "#ffffff", borderRadius: 40, border: "5px solid " + HG.eiche, padding: "44px 40px", boxShadow: "0 8px 0 " + HG.eiche }, h("div", Object.assign({ fontSize: 80 }, TX), "🧑‍🍳"),
        h("div", Object.assign({ marginTop: 14 }, TX), rich(s.headline, fit(plain(s.headline), W2 - 80, 6, story ? 66 : 58, 34, 0.5), HG.loden2, { family: "Fredoka", weight: 600, lh: 1.2, ls: 0, mark: () => ({ color: HG.rot }) })),
        s.author ? h("div", Object.assign({ marginTop: 20, fontFamily: "Fraunces", fontWeight: 700, fontStyle: "italic", fontSize: 32, color: HG.loden }, TX), "– " + plain(s.author)) : null), foot]);
    }
    return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, s.kicker ? pill(s.kicker, HG.rot, "#fff") : null,
      h("div", Object.assign({ marginTop: 24 }, TX), head(s.headline, fit(plain(s.headline), W2, 4, story ? 120 : 104, 52, 0.55), "#fff")),
      s.sub ? h("div", Object.assign({ marginTop: 22, fontSize: story ? 38 : 34, color: sub, lineHeight: 1.3 }, TX), plain(s.sub)) : null,
      h("div", Object.assign({ marginTop: 34, fontSize: 80 }, DE), pick(["🏔️", "⛷️", "🍲", "🚡", "🍺"], v))), foot]);
  }

  // ═════════════ Druckshop & FS Creative ═════════════
  function fs(c, shop) {
    const { s, F, story, W2, TX, DE, v } = c, tpl = s.template || "hook", BL = "#0a84ff", ph = c.image;
    const grad = "linear-gradient(90deg, #3a9bff 0%, #8b5cf6 55%, #ec4899 100%)";
    const head = (txt, size, col, center, w) => rich(txt, size, col, { family: "Inter", weight: 800, center, width: w, ls: -size * 0.035, lh: 1.04, wordGap: 0.24, mark: () => ({ backgroundImage: grad, backgroundClip: "text", color: "transparent" }) });
    const glow = [h("div", Object.assign({ position: "absolute", left: -F.w * 0.3, top: -F.w * 0.25, width: F.w, height: F.w, borderRadius: F.w, background: "radial-gradient(circle, rgba(10,132,255,0.28) 0%, rgba(0,0,0,0) 65%)" }, DE)),
      h("div", Object.assign({ position: "absolute", right: -F.w * 0.35, bottom: -F.w * 0.3, width: F.w * 1.1, height: F.w * 1.1, borderRadius: F.w, background: "radial-gradient(circle, rgba(139,92,246,0.24) 0%, rgba(0,0,0,0) 65%)" }, DE))];
    const corners = shop ? [[F.px - 34, F.top - 34], [F.w - F.px - 6, F.top - 34], [F.px - 34, F.h - F.bottom - 6], [F.w - F.px - 6, F.h - F.bottom - 6]].map(([x, y]) => h("div", Object.assign({ position: "absolute", left: x, top: y }, DE), crossHair("rgba(255,255,255,0.35)", 40))) : [];
    const bulb = img(svg('<path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M9 20h6M10 22h4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>', "0 0 24 24", 48, 48), { width: story ? 46 : 40, height: story ? 46 : 40 });
    const top = h("div", { justifyContent: "space-between", alignItems: "center", width: W2, flexShrink: 0 }, h("div", Object.assign({ alignItems: "center", gap: 12 }, DE), bulb, h("div", { fontFamily: "Inter", fontWeight: 700, fontSize: story ? 34 : 30, color: "#fff" }, "FS Creative"), shop ? h("div", { fontFamily: "Inter", fontWeight: 500, fontSize: story ? 34 : 30, color: "rgba(255,255,255,0.6)" }, "Druckshop") : null),
      c.counter ? h("div", Object.assign({ fontFamily: "Inter", fontWeight: 600, fontSize: 24, color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 99, padding: "6px 16px" }, TX), c.counter) : null);
    const btn = t => h("div", Object.assign({ background: BL, color: "#fff", fontFamily: "Inter", fontWeight: 700, fontSize: story ? 32 : 28, borderRadius: 99, padding: story ? "20px 38px" : "17px 34px", boxShadow: "0 0 40px rgba(10,132,255,0.45)" }, TX), plain(t));
    const kick = s.kicker ? h("div", Object.assign({ alignSelf: "flex-start", border: "1px solid rgba(10,132,255,0.5)", background: "rgba(10,132,255,0.12)", color: "#9cc9ff", borderRadius: 99, padding: "10px 22px", fontFamily: "Inter", fontWeight: 700, letterSpacing: 3, fontSize: story ? 24 : 21, marginBottom: 26 }, TX), plain(s.kicker).toUpperCase()) : null;
    const foot = h("div", { justifyContent: "space-between", alignItems: "center", width: W2, marginTop: story ? 0 : "auto", flexShrink: 0 },   /* Hochformat (Reel): Inhalt mittig, Fußzeile unten */
      c.swipe ? h("div", Object.assign({ fontFamily: "Inter", fontWeight: 700, fontSize: 26, color: "#fff", alignItems: "center" }, TX), "Wischen", h("div", { marginLeft: 10 }, swipeArrow("#ffffff"))) : s.cta && tpl !== "cta" ? btn(s.cta) : h("div", {}),
      h("div", Object.assign({ fontFamily: "Inter", fontSize: 22, color: "rgba(255,255,255,0.6)" }, TX), shop ? "fs-creative.at/print" : "fs-creative.at"));
    const R = kids => h("div", { width: F.w, height: F.h, position: "relative", flexDirection: "column", overflow: "hidden", padding: F.top + "px " + F.px + "px " + F.bottom + "px", fontFamily: "Inter", background: rootBg(c, "#0a0a0f") }, glow.concat(corners).concat(kids));
    const glass = (kids, st) => h("div", Object.assign({ flexDirection: "column", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 30, padding: "28px 28px" }, st || {}, TX), kids);
    if (tpl === "list") {
      const its = (s.items || []).slice(0, 5);
      return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kick, h("div", TX, head(s.headline, fit(plain(s.headline), W2, 3, story ? 108 : 80, 44, 0.6), "#fff")),
        h("div", { flexDirection: "column", marginTop: story ? 44 : 34, rowGap: story ? 18 : 14 }, its.map((t, i) => glass([h("div", { alignItems: "center" },
          h("div", { width: story ? 64 : 52, height: story ? 64 : 52, borderRadius: 16, background: BL, color: "#fff", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: story ? 32 : 26, marginRight: 22, flexShrink: 0 }, String(i + 1)),
          h("div", { fontSize: fit(plain(t), W2 - 150, 2, story ? 48 : 34, 24, 0.55), fontWeight: 600, color: "#fff", width: W2 - 130 }, plain(t)))], { padding: story ? "26px 26px" : "20px 22px" })))), foot]);
    }
    if (tpl === "stat") {
      return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kick,
        glass([h("div", { fontSize: story ? 38 : 28, fontWeight: 600, color: "rgba(255,255,255,0.7)" }, plain(s.label || s.headline)),
          h("div", { marginTop: 10, fontSize: fit(plain(s.number), W2 - 80, 1, story ? 280 : 190, 80, 0.62), fontWeight: 800, letterSpacing: -6, color: "#fff", lineHeight: 1 }, plain(s.number)),
          s.sub ? h("div", { marginTop: 16, fontSize: story ? 32 : 28, color: "rgba(255,255,255,0.7)" }, plain(s.sub)) : null], { padding: "40px 40px" })), foot]);
    }
    if (tpl === "compare") {
      const col = (title, its, good) => glass([h("div", { fontWeight: 800, fontSize: story ? 46 : 33, color: good ? "#9cc9ff" : "rgba(255,255,255,0.65)" }, plain(title)), (its || []).slice(0, 5).map(t => h("div", { marginTop: story ? 16 : 12, fontSize: story ? 38 : 26, color: good ? "#fff" : "rgba(255,255,255,0.6)", lineHeight: 1.3 }, plain(t)))], { width: (W2 - 24) / 2, border: "1px solid " + (good ? "rgba(10,132,255,0.7)" : "rgba(255,255,255,0.12)") });
      return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kick, h("div", TX, head(s.headline, fit(plain(s.headline), W2, 3, story ? 104 : 76, 42, 0.6), "#fff")),
        h("div", { justifyContent: "space-between", marginTop: story ? 44 : 34 }, col(s.leftTitle || "Bisher", s.leftItems, false), col(s.rightTitle || "Mit uns", s.rightItems, true))), foot]);
    }
    if (tpl === "cta") {
      return R([h("div", { flexDirection: "column", alignItems: "center", width: W2, marginTop: "auto", marginBottom: "auto" }, h("div", Object.assign({ width: story ? 150 : 130, height: story ? 150 : 130, borderRadius: 36, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", boxShadow: "0 0 60px rgba(10,132,255,0.35)" }, DE), img(svg('<path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M9 20h6M10 22h4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>', "0 0 24 24", 96, 96), { width: story ? 90 : 78, height: story ? 90 : 78 })),
        h("div", { marginTop: 40, alignSelf: "center" }, kick), h("div", TX, head(s.headline, fit(plain(s.headline), W2, 3, story ? 124 : 88, 46, 0.6), "#fff", true, W2)),
        s.sub ? h("div", Object.assign({ marginTop: 20, fontSize: story ? 40 : 30, color: "rgba(255,255,255,0.7)", textAlign: "center", justifyContent: "center" }, TX), plain(s.sub)) : null,
        h("div", { marginTop: 44 }, btn(s.cta || (shop ? "Jetzt online bestellen" : "Gratis Entwurf anfragen"))), h("div", Object.assign({ marginTop: 22, fontSize: 24, color: "rgba(255,255,255,0.55)" }, TX), shop ? "Versand in ganz Österreich inklusive" : "Gaschurn · Montafon · Vorarlberg"))]);
    }
    if (tpl === "quote") {
      return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, h("div", Object.assign({ fontSize: 160, fontWeight: 800, lineHeight: 0.8, backgroundImage: grad, backgroundClip: "text", color: "transparent", height: 110 }, TX), "“"),
        h("div", TX, head(s.headline, fit(plain(s.headline), W2, 6, story ? 92 : 62, 36, 0.58), "#fff")), s.author ? h("div", Object.assign({ marginTop: 26, fontSize: story ? 34 : 28, fontWeight: 600, color: "rgba(255,255,255,0.6)" }, TX), "— " + plain(s.author)) : null), foot]);
    }
    return R([top, h("div", { flexDirection: "column", width: W2, marginTop: "auto", marginBottom: "auto" }, kick,
      h("div", TX, head(s.headline, fit(plain(s.headline), W2, 4, story ? 156 : 112, 54, 0.6), "#fff")),
      s.sub ? h("div", Object.assign({ marginTop: 26, fontSize: story ? 44 : 34, lineHeight: 1.4, color: "rgba(255,255,255,0.72)" }, TX), plain(s.sub)) : null), foot]);
  }

  const SKINS = { kochdu, kantineur, blitzdings, valuero, skikaiser, huettengaudi, druckshop: c => fs(c, true), "fs-creative": c => fs(c, false) };
  // Welche Vorlagen ein Foto brauchen (aus der Bildersammlung der Marke)
  const PHOTO_TPL = { kochdu: ["photo", "hook"], valuero: ["photo", "hook", "cta", "stat", "list"], skikaiser: ["photo", "hook", "stat", "list", "compare", "cta", "quote"], huettengaudi: ["photo", "hook"], blitzdings: ["photo", "hook"] };
  return {
    has: key => !!SKINS[key],
    el: (slide, brand, o, F) => SKINS[brand.key](base(slide, brand, o, F)),
    wantsPhoto: (key, tpl) => (PHOTO_TPL[key] || []).indexOf(tpl) > -1,
  };
};
