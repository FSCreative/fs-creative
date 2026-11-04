/* FS Creative Druckshop – technische Zeichnungen (Flats) für den Shirt-Designer (Wunsch Simon 04.11.2026): T-Shirt, Polo, Hoodie, Zip-Hoodie, Pullover.
   Je Modell Vorderseite, Rückseite und Seitenansicht (Ärmel) als SVG in mm. Ursprung = Mitte auf Höhe Halsansatz (HPS), y nach unten.
   Geometrie aus Maßtabellen Größe L (flach gemessen): Schulter, Schulterneigung, Armloch, Ärmellänge/-winkel/-öffnung, Bündchen werden berechnet.
   Farbe frei: Grundfläche in Stofffarbe, darüber Licht/Schatten (Verläufe, weichgezeichnete Falten), Nähte, Rippbündchen, Schlagschatten.
   Browser: window.PrintFlats.svg(kind, view, color) → { svg, box:[x0,y0,x1,y1] } · Node: module.exports (Vorschau-Tests). */
(function (root) {
  "use strict";
  var R = function (n) { return Math.round(n * 10) / 10; };
  var pt = function (p) { return R(p[0]) + " " + R(p[1]); };
  var add = function (a, b, k) { k = k == null ? 1 : k; return [a[0] + b[0] * k, a[1] + b[1] * k]; };
  var dirOf = function (deg) { var r = deg * Math.PI / 180; return [Math.cos(r), Math.sin(r)]; };
  var mir = function (p) { return [-p[0], p[1]]; };
  var mid = function (a, b, ox, oy) { return [(a[0] + b[0]) / 2 + (ox || 0), (a[1] + b[1]) / 2 + (oy || 0)]; };
  function hexRgb(h) { h = String(h || "#ffffff").replace("#", ""); if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join(""); return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16) || 0; }); }
  function lum(h) { var c = hexRgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  function mix(h, f) { var c = hexRgb(h).map(function (v) { return Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); }); return "rgb(" + c.join(",") + ")"; }

  // ── Maßtabellen (mm, Größe L, flach) ──
  var SPEC = {
    tee:    { neck: 190, dropF: 100, dropB: 25, rib: 20, shoulder: 490, slope: 42, chest: 560, armhole: 250, length: 760, hem: 570, sleeveLen: 225, sleeveOpen: 195, sleeveAng: 38, sleeveHem: 24, bottomHem: 24, depth: 125 },
    polo:   { neck: 180, dropF: 30, dropB: 20, rib: 0, shoulder: 490, slope: 40, chest: 550, armhole: 250, length: 750, hem: 560, sleeveLen: 230, sleeveOpen: 185, sleeveAng: 38, sleeveRib: 26, bottomHem: 24, depth: 125 },
    sweat:  { neck: 190, dropF: 90, dropB: 25, rib: 26, shoulder: 600, slope: 52, chest: 600, armhole: 280, length: 700, hem: 570, sleeveLen: 610, sleeveOpen: 112, sleeveAng: 79, cuff: 70, waist: 70, depth: 140, drop: true },
    hoodie: { neck: 200, dropF: 90, dropB: 20, rib: 0, shoulder: 640, slope: 58, chest: 620, armhole: 290, length: 710, hem: 590, sleeveLen: 620, sleeveOpen: 118, sleeveAng: 79, cuff: 80, waist: 85, depth: 148, drop: true, hood: true }
  };
  SPEC.zip = Object.assign({}, SPEC.hoodie, { zip: true });

  function cut(k) {
    var s = SPEC[k], N = [s.neck / 2, 0], S = [s.shoulder / 2, s.slope], d = dirOf(s.sleeveAng), pp = [-d[1], d[0]];
    var C1 = add(S, d, s.sleeveLen), C2 = add(C1, pp, s.sleeveOpen), A = [s.chest / 2, s.armhole], H = [s.hem / 2, s.length];
    return { s: s, N: N, S: S, C1: C1, C2: C2, A: A, H: H, d: d, pp: pp };
  }
  // Kontur (vorn = hinten): Schulter → Ärmel außen (leicht gewölbt) → Ärmelöffnung → Unterarm → Achsel → Seite (leicht tailliert) → Saum
  function half(g, f) {
    var S = g.S, C1 = g.C1, C2 = g.C2, A = g.A, H = g.H, s = g.s, bow = s.drop ? 14 : 8;
    return { S: f(S), outer: f(mid(S, C1, bow * g.d[1], -bow * g.d[0] * 0.6)), C1: f(C1), C2: f(C2), under: f(s.drop ? [C2[0] + 2, (A[1] + C2[1]) / 2] : [A[0] + 6, (A[1] + C2[1]) / 2 + 6]), A: f(A), s1: f([A[0] - 6, A[1] + 140]), s2: f([H[0] + (s.drop ? 6 : -4), H[1] - 220]), H: f(H) };
  }
  function outline(g) {
    var l = half(g, mir), r = half(g, function (p) { return p; });
    return "M" + pt(mir(g.N)) + " L" + pt(l.S) + " Q" + pt(l.outer) + " " + pt(l.C1) + " L" + pt(l.C2) + " Q" + pt(l.under) + " " + pt(l.A) + " C" + pt(l.s1) + " " + pt(l.s2) + " " + pt(l.H) +
      " Q0 " + R(g.H[1] + 8) + " " + pt(r.H) + " C" + pt(r.s2) + " " + pt(r.s1) + " " + pt(r.A) + " Q" + pt(r.under) + " " + pt(r.C2) + " L" + pt(r.C1) + " Q" + pt(r.outer) + " " + pt(r.S) + " L" + pt(g.N) + " Z";
  }
  function sleeve(g, sd) {
    var f = sd < 0 ? mir : function (p) { return p; }, h = half(g, f), S = g.S, A = g.A;
    return "M" + pt(h.S) + " Q" + pt(h.outer) + " " + pt(h.C1) + " L" + pt(h.C2) + " Q" + pt(h.under) + " " + pt(h.A) + " C" + pt(f([A[0] - 24, A[1] - 80])) + " " + pt(f([S[0] - 20, S[1] + 90])) + " " + pt(h.S) + " Z";
  }
  function armhole(g, sd) { var f = sd < 0 ? mir : function (p) { return p; }, S = g.S, A = g.A; return "M" + pt(f(S)) + " C" + pt(f([S[0] - 20, S[1] + 90])) + " " + pt(f([A[0] - 24, A[1] - 80])) + " " + pt(f(A)); }
  function along(a, b, dist) { var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, n = [dy / l, -dx / l]; return [add(a, n, dist), add(b, n, dist)]; }

  // ── Zeichenstil ──
  function Kit(col, id) {
    var L = lum(col), dark = L < 0.4, K = { col: col, dark: dark, id: id, defs: [], out: [] };
    K.shA = dark ? 0.5 : 0.13 + 0.1 * (1 - L); K.hiA = dark ? 0.1 : 0.3;
    K.ink = dark ? mix(col, 0.38) : mix(col, -0.45); K.thin = dark ? "rgba(255,255,255,.17)" : "rgba(0,0,0,.17)"; K.stitch = dark ? "rgba(255,255,255,.33)" : "rgba(0,0,0,.3)";
    K.o = function (a) { return R(a * 100) / 100; };
    K.defs.push('<filter id="' + id + 'b" filterUnits="userSpaceOnUse" x="-1500" y="-1500" width="3000" height="3000"><feGaussianBlur stdDeviation="8"/></filter>',
      '<filter id="' + id + 'b2" filterUnits="userSpaceOnUse" x="-1500" y="-1500" width="3000" height="3000"><feGaussianBlur stdDeviation="3.5"/></filter>',
      '<filter id="' + id + 'ds" filterUnits="userSpaceOnUse" x="-1500" y="-1500" width="3000" height="3000"><feGaussianBlur stdDeviation="16"/></filter>');
    K.fill = function (d, c) { K.out.push('<path d="' + d + '" fill="' + (c || col) + '"/>'); };
    K.shadow = function (d) { K.out.push('<path d="' + d + '" transform="translate(0 18)" fill="rgba(20,24,40,.26)" filter="url(#' + id + 'ds)"/>'); };
    K.line = function (d, w, c) { K.out.push('<path d="' + d + '" fill="none" stroke="' + (c || K.ink) + '" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round"/>'); };
    K.seam = function (d, w) { K.out.push('<path d="' + d + '" fill="none" stroke="' + K.stitch + '" stroke-width="' + (w || 1.5) + '" stroke-dasharray="5 3.5" stroke-linecap="round"/>'); };
    K.fold = function (d, a, w, light, sharp) { K.out.push('<g filter="url(#' + id + (sharp ? "b2" : "b") + ')"><path d="' + d + '" fill="none" stroke="' + (light ? "#fff" : "#000") + '" stroke-opacity="' + K.o(a) + '" stroke-width="' + (w || 14) + '" stroke-linecap="round"/></g>'); };
    K.clipStart = function (d, cid) { K.defs.push('<clipPath id="' + id + cid + '"><path d="' + d + '"/></clipPath>'); K.out.push('<g clip-path="url(#' + id + cid + ')">'); };
    K.clipEnd = function () { K.out.push("</g>"); };
    K.hgrad = function (x0, x1, y0, y1, gid, strength) {   // Rundung quer: Ränder dunkel, Mitte Licht
      var st = strength || 1; K.defs.push('<linearGradient id="' + id + gid + '" x1="' + R(x0) + '" x2="' + R(x1) + '" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#000" stop-opacity="' + K.o(K.shA * 0.85 * st) + '"/><stop offset=".17" stop-color="#000" stop-opacity="0"/><stop offset=".46" stop-color="#fff" stop-opacity="' + K.o(K.hiA * 0.5 * st) + '"/><stop offset=".6" stop-color="#fff" stop-opacity="' + K.o(K.hiA * 0.3 * st) + '"/><stop offset=".85" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="' + K.o(K.shA * st) + '"/></linearGradient>');
      K.out.push('<rect x="' + R(x0 - 300) + '" y="' + R(y0) + '" width="' + R(x1 - x0 + 600) + '" height="' + R(y1 - y0) + '" fill="url(#' + id + gid + ')"/>'); };
    K.vgrad = function (y0, y1, gid) { K.defs.push('<linearGradient id="' + id + gid + '" x1="0" x2="0" y1="' + R(y0) + '" y2="' + R(y1) + '" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="' + K.o(K.hiA * 0.45) + '"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".86" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="' + K.o(K.shA * 0.45) + '"/></linearGradient>');
      K.out.push('<rect x="-700" y="' + R(y0) + '" width="1400" height="' + R(y1 - y0) + '" fill="url(#' + id + gid + ')"/>'); };
    K.agrad = function (a, b, gid, k) {   // Verlauf quer über einen Ärmel (a → b)
      K.defs.push('<linearGradient id="' + id + gid + '" gradientUnits="userSpaceOnUse" x1="' + R(a[0]) + '" y1="' + R(a[1]) + '" x2="' + R(b[0]) + '" y2="' + R(b[1]) + '"><stop offset="0" stop-color="#000" stop-opacity="' + K.o(K.shA * 0.5 * (k || 1)) + '"/><stop offset=".4" stop-color="#fff" stop-opacity="' + K.o(K.hiA * 0.35) + '"/><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="' + K.o(K.shA * 0.45 * (k || 1)) + '"/></linearGradient>');
      return "url(#" + id + gid + ")"; };
    K.rib = function (d, a, b, step) {   // Rippbündchen: dunkler + feine Rippen parallel zu a→b
      K.fill(d, mix(col, dark ? 0.03 : -0.05)); var cid = "r" + K.out.length; K.clipStart(d, cid);
      var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, n = [-dy / l, dx / l], s0 = [a[0] - n[0] * 400, a[1] - n[1] * 400];
      for (var i = 0; i < 800; i += step || 9) { var p = add(s0, n, i); K.out.push('<path d="M' + pt(add(p, [dx / l, dy / l], -60)) + " L" + pt(add(p, [dx / l, dy / l], l + 60)) + '" stroke="' + (dark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)") + '" stroke-width="1.6"/>'); }
      K.clipEnd(); K.line(d, 1.4, K.thin); };
    K.svg = function (B) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + B[0] + " " + B[1] + " " + (B[2] - B[0]) + " " + (B[3] - B[1]) + '" width="' + (B[2] - B[0]) + '" height="' + (B[3] - B[1]) + '"><defs>' + K.defs.join("") + "</defs>" + K.out.join("") + "</svg>"; };
    return K;
  }

  // ── Vorder- und Rückseite ──
  function flat(k, view, K) {
    var g = cut(k), s = g.s, body = outline(g), X = s.chest / 2, Y = s.length, front = view === "front", nx = s.neck / 2;
    if (s.hood) hoodBehind(g, K, front);
    K.shadow(body); K.fill(body);
    K.clipStart(body, "c");
    K.hgrad(-X, X, -80, Y + 40, "h"); K.vgrad(-20, Y + 20, "v");
    [1, -1].forEach(function (sd) {
      var m = function (p) { return [p[0] * sd, p[1]]; };
      K.out.push('<path d="' + sleeve(g, sd) + '" fill="' + K.agrad(m(g.C1), m(g.C2), "s" + (sd > 0 ? "r" : "l"), K.dark ? 0.3 : 0.55) + '"/>');
      K.fold(armhole(g, sd), K.shA * 0.75, 16);
      var A = g.A;   // Zugfalten Achsel → Brust, Licht dazwischen
      K.fold("M" + pt(m([A[0] - 6, A[1] + 14])) + " Q" + pt(m([A[0] - 60, A[1] + 40])) + " " + pt(m([A[0] - 125, A[1] + 48])), K.shA * 0.7, 9, false, true);
      K.fold("M" + pt(m([A[0] - 12, A[1] + 32])) + " Q" + pt(m([A[0] - 64, A[1] + 58])) + " " + pt(m([A[0] - 120, A[1] + 70])), K.hiA * 0.8, 7, true, true);
      K.fold("M" + pt(m([A[0] - 8, A[1] + 48])) + " Q" + pt(m([A[0] - 48, A[1] + 84])) + " " + pt(m([A[0] - 92, A[1] + 100])), K.shA * 0.45, 7, false, true);
      K.fold("M" + pt(m([nx + 26, 14])) + " Q" + pt(m([nx + 64, 40])) + " " + pt(m([nx + 54, 115])), K.shA * 0.3, 14);
      if (s.drop) {   // hängender Ärmel: Knick am Ellbogen, Falten über dem Bündchen
        var e = add(g.S, g.d, s.sleeveLen * 0.55), e2 = add(e, g.pp, s.sleeveOpen * 0.9);
        K.fold("M" + pt(m(e)) + " Q" + pt(m(mid(e, e2, 0, 10))) + " " + pt(m(e2)), K.shA * 0.6, 8, false, true);
        var c1 = add(g.C1, g.d, -s.cuff - 30), c2 = add(c1, g.pp, s.sleeveOpen);
        K.fold("M" + pt(m(c1)) + " Q" + pt(m(mid(c1, c2, 0, 12))) + " " + pt(m(c2)), K.shA * 0.5, 7, false, true);
        K.fold("M" + pt(m([X * 0.62, Y - s.waist - 70])) + " Q" + pt(m([X * 0.58, Y - s.waist - 30])) + " " + pt(m([X * 0.66, Y - s.waist])), K.shA * 0.4, 9, false, true);
      }
    });
    K.clipEnd();
    // Bündchen (Pullover/Hoodie): Saum und Ärmel
    if (s.waist) { var wy = Y - s.waist, wb = "M" + pt([-g.H[0] - 1, wy]) + " Q0 " + R(wy + 6) + " " + pt([g.H[0] + 1, wy]) + " L" + pt(g.H) + " Q0 " + R(Y + 8) + " " + pt(mir(g.H)) + " Z"; K.rib(wb, [0, wy], [0, Y], 9); }
    if (s.cuff) [1, -1].forEach(function (sd) { var f = sd < 0 ? mir : function (p) { return p; }, a = f(add(g.C1, g.d, -s.cuff)), b = f(add(g.C2, g.d, -s.cuff)), cf = "M" + pt(a) + " L" + pt(f(g.C1)) + " L" + pt(f(g.C2)) + " L" + pt(b) + " Z"; K.rib(cf, a, f(g.C1), 8); });
    if (s.sleeveRib) [1, -1].forEach(function (sd) { var f = sd < 0 ? mir : function (p) { return p; }, a = f(add(g.C1, g.d, -s.sleeveRib)), b = f(add(g.C2, g.d, -s.sleeveRib)), cf = "M" + pt(a) + " L" + pt(f(g.C1)) + " L" + pt(f(g.C2)) + " L" + pt(b) + " Z"; K.rib(cf, a, f(g.C1), 7); });
    // Nähte
    [1, -1].forEach(function (sd) { var f = sd < 0 ? mir : function (p) { return p; };
      K.line(armhole(g, sd), 1.4, K.thin); K.line("M" + pt(f(g.N)) + " L" + pt(f(g.S)), 1.3, K.thin);
      if (s.sleeveHem) { var o1 = along(f(g.C1), f(g.C2), -sd * s.sleeveHem), o2 = along(f(g.C1), f(g.C2), -sd * (s.sleeveHem + 6)); K.seam("M" + pt(o1[0]) + " L" + pt(o1[1])); K.seam("M" + pt(o2[0]) + " L" + pt(o2[1])); }
    });
    if (s.bottomHem) { var hy = Y - s.bottomHem; K.seam("M" + pt([-g.H[0] + 3, hy]) + " Q0 " + R(hy + 8) + " " + pt([g.H[0] - 3, hy])); K.seam("M" + pt([-g.H[0] + 3, hy - 6]) + " Q0 " + R(hy + 2) + " " + pt([g.H[0] - 3, hy - 6])); }
    // Ausschnitt / Kragen / Kapuze / Tasche
    if (k === "polo") poloCollar(g, K, front);
    else if (s.hood) hoodFront(g, K, front, k);
    else neckRib(g, K, front);
    if (front && k === "hoodie") pocket(g, K);
    if (front && s.zip) zipper(g, K);
    K.line(body, 2.2);
    if (s.hood && front) hoodOpening(g, K);
    if (front && k === "hoodie") strings(g, K);
    var hw = Math.max(g.C1[0], g.C2[0], X) + 40;
    return [-hw, s.hood ? -350 : -40, hw, Y + 70];
  }
  function neckRib(g, K, front) {
    var s = g.s, nx = s.neck / 2, rb = s.rib;
    if (front) {
      var fr = "M" + R(nx) + " 0 C" + R(nx - 4) + " " + R(s.dropF * 0.72) + " " + R(nx * 0.46) + " " + R(s.dropF) + " 0 " + R(s.dropF) + " C" + R(-nx * 0.46) + " " + R(s.dropF) + " " + R(-nx + 4) + " " + R(s.dropF * 0.72) + " " + R(-nx) + " 0";
      var inner = fr + " C" + R(-nx * 0.7) + " " + R(s.dropB) + " " + R(nx * 0.7) + " " + R(s.dropB) + " " + R(nx) + " 0 Z";
      K.fill(inner, mix(K.col, K.dark ? 0.1 : -0.12));
      K.defs.push('<linearGradient id="' + K.id + 'in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="' + (K.dark ? 0.3 : 0.16) + '"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>');
      K.fill(inner, "url(#" + K.id + "in)");
      K.out.push('<rect x="-17" y="' + R(s.dropB + 4) + '" width="34" height="20" rx="2" fill="' + (K.dark ? "#e4e4e8" : "#fff") + '" stroke="rgba(0,0,0,.18)" stroke-width="1"/>');
      var ro = "M" + R(nx + rb * 0.9) + " 2 C" + R(nx + rb - 2) + " " + R(s.dropF * 0.8 + rb) + " " + R(nx * 0.5) + " " + R(s.dropF + rb) + " 0 " + R(s.dropF + rb) + " C" + R(-nx * 0.5) + " " + R(s.dropF + rb) + " " + R(-nx - rb + 2) + " " + R(s.dropF * 0.8 + rb) + " " + R(-nx - rb * 0.9) + " 2";
      var band = fr.replace(/^M/, "M") + " L" + R(-nx - rb * 0.9) + " 2 C" + R(-nx - rb + 2) + " " + R(s.dropF * 0.8 + rb) + " " + R(-nx * 0.5) + " " + R(s.dropF + rb) + " 0 " + R(s.dropF + rb) + " C" + R(nx * 0.5) + " " + R(s.dropF + rb) + " " + R(nx + rb - 2) + " " + R(s.dropF * 0.8 + rb) + " " + R(nx + rb * 0.9) + " 2 Z";
      K.rib(band, [0, s.dropF], [0, s.dropF + rb], 7); K.line(fr, 1.6); K.line(ro, 1.4, K.thin);
      K.seam("M" + R(nx + rb - 5) + " 8 C" + R(nx + rb - 7) + " " + R(s.dropF * 0.8 + rb - 3) + " " + R(nx * 0.5) + " " + R(s.dropF + rb + 5) + " 0 " + R(s.dropF + rb + 5) + " C" + R(-nx * 0.5) + " " + R(s.dropF + rb + 5) + " " + R(-nx - rb + 7) + " " + R(s.dropF * 0.8 + rb - 3) + " " + R(-nx - rb + 5) + " 8", 1.3);
    } else {
      var bn = "M" + R(-nx) + " 0 C" + R(-nx * 0.7) + " " + R(s.dropB) + " " + R(nx * 0.7) + " " + R(s.dropB) + " " + R(nx) + " 0";
      var br = bn + " L" + R(nx + rb * 0.9) + " 3 C" + R(nx * 0.75) + " " + R(s.dropB + rb) + " " + R(-nx * 0.75) + " " + R(s.dropB + rb) + " " + R(-nx - rb * 0.9) + " 3 Z";
      K.rib(br, [0, s.dropB], [0, s.dropB + rb], 7); K.line(bn, 1.6);
      K.seam("M" + R(-nx - rb * 0.6) + " " + R(rb * 0.45 + 6) + " C" + R(-nx * 0.72) + " " + R(s.dropB + rb + 5) + " " + R(nx * 0.72) + " " + R(s.dropB + rb + 5) + " " + R(nx + rb * 0.6) + " " + R(rb * 0.45 + 6), 1.3);
    }
  }
  function poloCollar(g, K, front) {
    var s = g.s, nx = s.neck / 2;
    if (front) {
      var pl = "M-18 26 L18 26 L18 175 Q0 182 -18 175 Z"; K.fill(pl, mix(K.col, K.dark ? 0.04 : -0.03)); K.line(pl, 1.3, K.thin); K.seam("M-13 30 L-13 170"); K.seam("M13 30 L13 170");
      [62, 108, 152].forEach(function (y) { K.out.push('<circle cx="0" cy="' + y + '" r="6.5" fill="' + (K.dark ? "#e8e8ec" : "#fafafa") + '" stroke="rgba(0,0,0,.25)" stroke-width="1"/><circle cx="-1.8" cy="' + y + '" r="1" fill="rgba(0,0,0,.35)"/><circle cx="1.8" cy="' + y + '" r="1" fill="rgba(0,0,0,.35)"/>'); });
      K.fill("M" + R(-nx) + " 0 C-60 26 60 26 " + R(nx) + " 0 L18 26 L-18 26 Z", mix(K.col, K.dark ? 0.1 : -0.18));
      [1, -1].forEach(function (sd) { var c = "M" + R(sd * nx) + " -2 C" + R(sd * (nx + 22)) + " 36 " + R(sd * (nx - 6)) + " 96 " + R(sd * 58) + " 118 L" + R(sd * 4) + " 34 C" + R(sd * 30) + " 22 " + R(sd * (nx - 30)) + " 12 " + R(sd * nx) + " -2 Z";
        K.out.push('<path d="' + c + '" transform="translate(0 4)" fill="rgba(0,0,0,.18)" filter="url(#' + K.id + 'b2)"/>'); K.fill(c); K.fill(c, K.agrad([sd * nx, 0], [sd * 40, 110], "pc" + (sd > 0 ? "r" : "l"), 0.6)); K.line(c, 1.6); K.seam("M" + R(sd * (nx + 6)) + " 8 C" + R(sd * (nx + 18)) + " 40 " + R(sd * (nx - 10)) + " 92 " + R(sd * 56) + " 108", 1.2); });
    } else {
      var cb = "M" + R(-nx - 4) + " -4 C-60 22 60 22 " + R(nx + 4) + " -4 L" + R(nx + 10) + " 30 C60 58 -60 58 " + R(-nx - 10) + " 30 Z";
      K.out.push('<path d="' + cb + '" transform="translate(0 5)" fill="rgba(0,0,0,.16)" filter="url(#' + K.id + 'b2)"/>'); K.fill(cb); K.fill(cb, K.agrad([0, -4], [0, 56], "pb", 0.5)); K.line(cb, 1.6); K.seam("M" + R(-nx - 4) + " 22 C-60 50 60 50 " + R(nx + 4) + " 22", 1.2);
    }
  }
  function hoodBehind(g, K, front) {
    var hb = front ? "M-100 14 C-176 -60 -160 -296 0 -318 C160 -296 176 -60 100 14 Z" : "M-102 12 C-190 -40 -180 -306 0 -318 C180 -306 190 -40 102 12 C94 118 46 180 0 186 C-46 180 -94 118 -102 12 Z";
    if (!front) return;   // Rückseite: Kapuze liegt auf dem Rücken (hoodFront zeichnet sie nach dem Körper)
    K.shadow(hb); K.fill(hb, mix(K.col, K.dark ? 0.03 : -0.04)); K.clipStart(hb, "hb"); K.hgrad(-170, 170, -330, 20, "hh", 0.9); K.clipEnd(); K.line(hb, 2);
  }
  function hoodFront(g, K, front, k) {
    if (front) return;   // vorne: Öffnung wird nach der Kontur gezeichnet (hoodOpening)
    var hk = "M-102 12 C-190 -40 -180 -306 0 -318 C180 -306 190 -40 102 12 C94 118 46 180 0 186 C-46 180 -94 118 -102 12 Z";
    K.out.push('<path d="' + hk + '" transform="translate(0 10)" fill="rgba(0,0,0,.2)" filter="url(#' + K.id + 'b)"/>'); K.fill(hk); K.clipStart(hk, "hk"); K.hgrad(-185, 185, -330, 190, "hk2", 1.1); K.vgrad(-330, 190, "hk3"); K.fold("M-60 70 C-40 120 -20 160 0 182", K.shA * 0.6, 12); K.fold("M60 70 C40 120 20 160 0 182", K.shA * 0.6, 12); K.clipEnd(); K.line(hk, 1.8); K.seam("M0 -312 L0 180", 1.3);
  }
  function hoodOpening(g, K) {
    var op = "M-64 66 C-122 -14 -108 -238 0 -254 C108 -238 122 -14 64 66 C34 42 -34 42 -64 66 Z";
    K.fill(op, mix(K.col, K.dark ? 0.12 : -0.26));
    K.defs.push('<linearGradient id="' + K.id + 'ho" x1="0" y1="-254" x2="0" y2="66" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#000" stop-opacity="' + (K.dark ? 0.35 : 0.3) + '"/><stop offset="1" stop-color="#000" stop-opacity=".05"/></linearGradient>');
    K.fill(op, "url(#" + K.id + "ho)"); K.line(op, 1.8); K.seam("M-76 72 C-136 -18 -122 -256 0 -270 C122 -256 136 -18 76 72", 1.3);
  }
  function strings(g, K) {
    [-1, 1].forEach(function (sd) {
      K.out.push('<circle cx="' + sd * 34 + '" cy="50" r="7" fill="' + (K.dark ? "#b9bcc4" : "#cfd1d6") + '" stroke="rgba(0,0,0,.3)" stroke-width="1"/>');
      K.out.push('<path d="M' + sd * 34 + ' 52 C' + sd * 40 + ' 130 ' + sd * 30 + ' 210 ' + sd * 42 + ' 296" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="9" stroke-linecap="round" filter="url(#' + K.id + 'b2)" transform="translate(3 4)"/>');
      K.out.push('<path d="M' + sd * 34 + ' 52 C' + sd * 40 + ' 130 ' + sd * 30 + ' 210 ' + sd * 42 + ' 296" fill="none" stroke="' + (K.dark ? mix(K.col, 0.55) : mix(K.col, -0.1)) + '" stroke-width="7" stroke-linecap="round"/>');
      K.out.push('<rect x="' + (sd * 42 - 5) + '" y="292" width="10" height="28" rx="3" fill="' + (K.dark ? "#d7d9de" : "#e6e7eb") + '" stroke="rgba(0,0,0,.3)" stroke-width="1"/>');
    });
  }
  function pocket(g, K) {
    var s = g.s, y0 = s.length - s.waist - 175, y1 = s.length - s.waist - 4, pk = "M-170 " + y0 + " L170 " + y0 + " C188 " + R(y0 + 50) + " 202 " + R(y1 - 60) + " 210 " + y1 + " L-210 " + y1 + " C-202 " + R(y1 - 60) + " -188 " + R(y0 + 50) + " -170 " + y0 + " Z";
    K.out.push('<path d="M-170 ' + y0 + ' L170 ' + y0 + '" stroke="rgba(0,0,0,.28)" stroke-width="10" filter="url(#' + K.id + 'b2)" transform="translate(0 5)"/>');
    K.fill(pk, mix(K.col, K.dark ? 0.03 : -0.015)); K.line(pk, 1.4, K.thin); K.seam("M-162 " + (y0 + 9) + " L162 " + (y0 + 9));
    [1, -1].forEach(function (sd) { var d = "M" + sd * 170 + " " + y0 + " Q" + sd * 146 + " " + R(y0 + 80) + " " + sd * 198 + " " + R(y1 - 30); K.fold(d, K.shA * 0.8, 10, false, true); K.line(d, 1.6); });
  }
  function zipper(g, K) {
    var s = g.s; K.out.push('<rect x="-6" y="56" width="12" height="' + R(s.length - 56) + '" fill="' + (K.dark ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.14)") + '"/>');
    K.seam("M-12 60 L-12 " + R(s.length - 4)); K.seam("M12 60 L12 " + R(s.length - 4)); K.line("M0 60 L0 " + R(s.length), 1.2, K.thin);
    K.out.push('<rect x="-7" y="66" width="14" height="36" rx="3" fill="#7d8089" stroke="rgba(0,0,0,.4)" stroke-width="1"/><rect x="-3" y="98" width="6" height="26" rx="2" fill="#9a9da5"/>');
    [1, -1].forEach(function (sd) { var y0 = s.length - s.waist - 190, d = "M" + sd * 120 + " " + y0 + " L" + sd * 190 + " " + R(y0 + 150); K.fold(d, K.shA * 0.8, 9, false, true); K.line(d, 1.6); K.seam("M" + (sd * 128) + " " + (y0 - 4) + " L" + (sd * 198) + " " + R(y0 + 146), 1.1); });
  }

  // Ärmel-Ansicht: der Ärmel als aufrechtes Detail (Außenseite), oben die Armkugel mit Ansatznaht, unten Saum bzw. Bündchen.
  // Ursprung = Mitte oben an der Armkugel; Breite oben = Oberarmweite, unten = Ärmelöffnung (flach, Größe L)
  function sleeveView(k, K, right) {
    var s = SPEC[k], heavy = !!s.drop, top = heavy ? 250 : 215, bot = heavy ? s.sleeveOpen : s.sleeveOpen, len = heavy ? s.sleeveLen : s.sleeveLen + 30, cap = heavy ? 34 : 62;
    var tx = top / 2, bx = bot / 2, lean = right ? -1 : 1;   // leichte Neigung nach vorne (Daumen zeigt nach vorne)
    var d = "M" + R(-tx) + " " + cap + " C" + R(-tx + 8) + " " + R(cap * 0.15) + " " + R(-tx * 0.45) + " 0 0 0 C" + R(tx * 0.45) + " 0 " + R(tx - 8) + " " + R(cap * 0.15) + " " + R(tx) + " " + cap +
      " C" + R(tx - 4) + " " + R(len * 0.45) + " " + R(bx + 10 + lean * 6) + " " + R(len * 0.8) + " " + R(bx + lean * 8) + " " + len + " Q" + R(lean * 8) + " " + R(len + 6) + " " + R(-bx + lean * 8) + " " + len +
      " C" + R(-bx - 10 + lean * 6) + " " + R(len * 0.8) + " " + R(-tx + 4) + " " + R(len * 0.45) + " " + R(-tx) + " " + cap + " Z";
    // Andeutung von Schulter/Körper oben (gestrichelt), damit klar ist, wo der Ärmel sitzt
    K.out.push('<path d="M' + R(-tx - 70) + " " + R(cap - 26) + " Q0 " + R(-46) + " " + R(tx + 70) + " " + R(cap - 26) + '" fill="none" stroke="rgba(0,0,0,.14)" stroke-width="2" stroke-dasharray="7 6"/>');
    K.shadow(d); K.fill(d); K.clipStart(d, "sv");
    K.hgrad(-tx, tx, -20, len + 20, "sv1", 0.9); K.vgrad(-10, len + 10, "sv2");
    if (heavy) { K.fold("M" + R(-tx * 0.5) + " " + R(len * 0.42) + " Q0 " + R(len * 0.46) + " " + R(tx * 0.45) + " " + R(len * 0.41), K.shA * 0.7, 10, false, true); K.fold("M" + R(-bx * 0.9) + " " + R(len - s.cuff - 40) + " Q0 " + R(len - s.cuff - 26) + " " + R(bx * 0.9) + " " + R(len - s.cuff - 44), K.shA * 0.6, 9, false, true); K.fold("M" + R(-tx * 0.3) + " " + R(len * 0.18) + " Q" + R(-tx * 0.38) + " " + R(len * 0.28) + " " + R(-tx * 0.3) + " " + R(len * 0.36), K.hiA * 0.7, 9, true, true); }
    else { K.fold("M" + R(-tx * 0.55) + " " + R(cap + 30) + " Q" + R(-tx * 0.2) + " " + R(cap + 60) + " " + R(tx * 0.1) + " " + R(cap + 70), K.shA * 0.45, 12); K.fold("M" + R(tx * 0.35) + " " + R(cap + 40) + " Q" + R(tx * 0.42) + " " + R(len * 0.6) + " " + R(tx * 0.3) + " " + R(len * 0.85), K.hiA * 0.6, 10, true); }
    K.clipEnd();
    K.seam("M" + R(-tx + 10) + " " + R(cap + 4) + " C" + R(-tx + 16) + " " + R(cap * 0.2 + 8) + " " + R(-tx * 0.45) + " 9 0 9 C" + R(tx * 0.45) + " 9 " + R(tx - 16) + " " + R(cap * 0.2 + 8) + " " + R(tx - 10) + " " + R(cap + 4), 1.3);
    if (heavy) K.rib("M" + R(-bx - 6 + lean * 8) + " " + R(len - s.cuff) + " Q" + R(lean * 8) + " " + R(len - s.cuff + 5) + " " + R(bx + 6 + lean * 8) + " " + R(len - s.cuff) + " L" + R(bx + lean * 8) + " " + len + " Q" + R(lean * 8) + " " + R(len + 6) + " " + R(-bx + lean * 8) + " " + len + " Z", [0, len - s.cuff], [0, len], 8);
    else if (k === "polo") K.rib("M" + R(-bx - 4 + lean * 8) + " " + R(len - s.sleeveRib) + " Q" + R(lean * 8) + " " + R(len - s.sleeveRib + 5) + " " + R(bx + 4 + lean * 8) + " " + R(len - s.sleeveRib) + " L" + R(bx + lean * 8) + " " + len + " Q" + R(lean * 8) + " " + R(len + 6) + " " + R(-bx + lean * 8) + " " + len + " Z", [0, len - s.sleeveRib], [0, len], 7);
    else { [s.sleeveHem, s.sleeveHem + 6].forEach(function (o) { K.seam("M" + R(-bx - 2 + lean * 8) + " " + R(len - o) + " Q" + R(lean * 8) + " " + R(len - o + 6) + " " + R(bx + 2 + lean * 8) + " " + R(len - o)); }); }
    K.line(d, 2.2);
    return [-tx - 110, -60, tx + 110, len + 80];
  }
  var CACHE = {};
  function svgFor(kind, view, color) {
    var k = SPEC[kind] ? kind : "tee", sl = /sleeve|side/.test(view), v = sl ? (/R|right/.test(view) ? "sleeveR" : "sleeveL") : view === "back" ? "back" : "front", key = k + "|" + v + "|" + color;
    if (CACHE[key]) return CACHE[key];
    var K = Kit(color || "#ffffff", "f" + k[0] + v[0] + v.slice(-1) + String(color || "").replace(/\W/g, "").slice(0, 6));
    var box = sl ? sleeveView(k, K, v === "sleeveR") : flat(k, v, K);
    return (CACHE[key] = { svg: K.svg(box), box: box });
  }
  var api = { svg: svgFor, SPEC: SPEC };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PrintFlats = api;
})(this);
