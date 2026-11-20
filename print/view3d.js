/* PS3D – 3D-Vorschau für Drucksachen (Simon 20.11.2026): Folder je Falzart richtig auf- und zuklappen, flache Drucksachen (Visitenkarten, Flyer,
   Karten, Aufkleber …) drehen – mit Lichtreflexen je Veredelung und echten Schatten. Reines WebGL, keine Bibliothek.

   PS3D.mount(host, {
     pages:  [Bild Außen/Vorderseite, Bild Innen/Rückseite]   (URL, data-URL, <img> oder <canvas>; fehlt die 2. Seite → weißes Papier)
     mm:     { w, h }        Endformat offen in mm
     bleed:  0               Beschnitt in mm, der in den Bildern enthalten ist (wird weggeschnitten)
     folds:  { slug, x:[mm], y:[mm], cells } | null   Falzgeometrie vom Server (foldSpec) – Positionen auf der Außenseite
     shape:  "" | "round" | "hex",  radius: Eckenradius in mm
     finish: "gloss" | "matt" | "soft" | "coated" | "none",  gsm: Papiergewicht
     labels: true            statt Bildern beschriftete Felder zeigen (Titel, Rückseite, Innen …)
   }) → { destroy(), fold(0…1), flip() } oder null (kein WebGL → Aufrufer zeigt die bisherige Vorschau)

   Falzrichtungen und Seitenfolge laut offiziellen Infoblättern des Produktionspartners (geprüft 20.11.2026):
   Einbruch/Wickel/Fenster/Kreuz: alle Brüche „außen“ (Innenseiten klappen aufeinander); Zickzack abwechselnd, der Bruch am Titel „außen“;
   Kreuzfalz erst quer, dann längs; Wickelfalz von innen nach außen. */
(function () {
  "use strict";
  if (window.PS3D) return;
  var PI = Math.PI, INST = [];

  // ───────── Rechnen: 4×4-Matrizen (spaltenweise) ─────────
  function mMul(a, b) { var o = new Array(16), c, r; for (c = 0; c < 4; c++) for (r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
  function mI() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  function mT(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; }
  function mR(ax, ay, az, a) { var c = Math.cos(a), s = Math.sin(a), t = 1 - c; return [t * ax * ax + c, t * ax * ay + s * az, t * ax * az - s * ay, 0, t * ax * ay - s * az, t * ay * ay + c, t * ay * az + s * ax, 0, t * ax * az + s * ay, t * ay * az - s * ax, t * az * az + c, 0, 0, 0, 0, 1]; }
  function mAbout(px, py, pz, ax, ay, az, a) { return mMul(mT(px, py, pz), mMul(mR(ax, ay, az, a), mT(-px, -py, -pz))); }
  function tp(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
  function tv(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function mPersp(fovy, asp, n, f) { var t = 1 / Math.tan(fovy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
  function mOrtho(l, r, b, t, n, f) { return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]; }
  function mLook(e, c, u) { var z = norm(sub(e, c)), x = norm(cross(u, z)), y = cross(z, x); return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ease(u) { u = clamp(u, 0, 1); return 0.5 - 0.5 * Math.cos(PI * u); }

  // ───────── Falzmodell: Felder + Scharniere (Koordinaten des offenen Bogens, Außenseite, mm, y nach unten) ─────────
  // Feld: { x0, x1, y0, y1, parent, h: { v: senkrechter Bruch?, pos, mt: +1 „außen“ (Innenseiten aufeinander) / −1 „innen“, gap: Lagen-Abstand in Papierstärken, t0, t1 } }
  function foldModel(f, W, H) {
    var m = f && /^(single|singlehorizontal|wikkel|zigzag|luik|cross)_(\d+)$/.exec(String(f.slug || "")), type = m ? m[1] : "";
    var xs = [0].concat(((f && f.x) || []).slice().sort(function (a, b) { return a - b; })).concat([W]), ys = [0].concat(((f && f.y) || []).slice().sort(function (a, b) { return a - b; })).concat([H]);
    var n = xs.length - 1, P = [], i, k;
    var col = function (c, parent, h) { return { x0: xs[c], x1: xs[c + 1], y0: 0, y1: H, parent: parent, h: h || null }; };
    var cell = function (c, r, parent, h) { return { x0: xs[c], x1: xs[c + 1], y0: ys[r], y1: ys[r + 1], parent: parent, h: h || null }; };
    var V = function (pos, mt, gap, t0, t1) { return { v: true, pos: pos, mt: mt, gap: gap, t0: t0, t1: t1 }; }, Hh = function (pos, mt, gap, t0, t1) { return { v: false, pos: pos, mt: mt, gap: gap, t0: t0, t1: t1 }; };
    if (!f || (n < 2 && ys.length < 3)) return { panels: [{ x0: 0, x1: W, y0: 0, y1: H, parent: -1, h: null }], pose: "float", rest: 0, type: "" };
    if (type === "cross" && n === 2 && ys.length === 3) {   // 2 × 2: Titel oben rechts; erst quer (untere Hälfte nach hinten), dann längs (linke Hälfte nach hinten)
      P.push(cell(1, 0, -1)); P.push(cell(1, 1, 0, Hh(ys[1], 1, 1, 0, 0.5))); P.push(cell(0, 0, 0, V(xs[1], 1, 3, 0.5, 1))); P.push(cell(0, 1, 2, Hh(ys[1], 1, 1, 0, 0.5)));
      return { panels: P, pose: "stand", rest: 0.74, type: type };
    }
    if ((type === "halffold" || type === "zigzagcross" || (!type && n >= 2 && ys.length >= 3)) && n >= 2 && ys.length >= 3) {
      // Pläne: Titel unten rechts. Erst die Spalten im Zickzack (unterste Reihe trägt die Spalte), dann die Reihen im Zickzack nach hinten.
      // Lagen: Spalte mit Stapel-Platz j (0 = Titelspalte) → Abstand unten/Mitte (2C−1−2j) Papierstärken, Mitte/oben (2j+1); Richtung wechselt mit jeder Spalte.
      var C = n, R = ys.length - 1, at = {}, c, r;
      for (c = C - 1; c >= 0; c--) { var j = C - 1 - c;
        P.push(cell(c, R - 1, c === C - 1 ? -1 : at[(c + 1) + "_" + (R - 1)], c === C - 1 ? null : V(xs[c + 1], (j - 1) % 2 ? -1 : 1, 1, 0, 0.46))); at[c + "_" + (R - 1)] = P.length - 1;
        for (r = R - 2; r >= 0; r--) { var s = R - 2 - r, dir = (s % 2 ? -1 : 1) * (j % 2 ? -1 : 1);
          P.push(cell(c, r, at[c + "_" + (r + 1)], Hh(ys[r + 1], dir, s === 0 ? 2 * C - 1 - 2 * j : 2 * j + 1, 0.54, 1))); at[c + "_" + r] = P.length - 1; } }
      return { panels: P, pose: "stand", rest: 0.3, type: type || "grid" };
    }
    if (type === "singlehorizontal" || (n < 2 && ys.length === 3)) {   // Falz oben: Titel unten, Rückseite oben (steht auf dem Kopf) → wie ein Zelt
      P.push(cell(0, 1, -1)); P.push(cell(0, 0, 0, Hh(ys[1], 1, 1, 0, 1)));
      return { panels: P, pose: "tent", rest: 0.62, type: "singlehorizontal" };
    }
    if (type === "wikkel" && n >= 3) {   // von links (Außenseite): innerste Klappe … Rückseite, Titel; innen zuerst falzen
      var folds = n - 1, lead = folds > 1 ? 0.16 : 0, span = 1 - (folds - 1) * lead, idx = {};
      P.push(col(n - 1, -1)); idx[n - 1] = 0;
      P.push(col(n - 2, 0, V(xs[n - 1], 1, n - 1, (folds - 1) * lead, 1))); idx[n - 2] = 1;
      for (k = n - 3; k >= 0; k--) { var ord = k; /* Feld 0 (innerste Klappe) zuerst */ P.push(col(k, idx[k + 1], V(xs[k + 1], 1, k + 1, ord * lead, ord * lead + span))); idx[k] = P.length - 1; }
      return { panels: P, pose: "stand", rest: 0.5, type: type };
    }
    if (type === "luik" && n === 3) {   // Fensterfalz: beide halben Klappen zur Mitte
      P.push(col(1, -1)); P.push(col(0, 0, V(xs[1], 1, 1, 0, 1))); P.push(col(2, 0, V(xs[2], 1, 1, 0, 1)));
      return { panels: P, pose: "stand", rest: 0.5, type: type, turn: true };
    }
    if (type === "luik" && n === 4) {   // geschlossener Fensterfalz: Klappen nach innen, dann in der Mitte zusammen
      P.push(col(2, -1)); P.push(col(3, 0, V(xs[3], 1, 1, 0, 0.56))); P.push(col(1, 0, V(xs[2], 1, 3, 0.44, 1))); P.push(col(0, 2, V(xs[1], 1, 1, 0, 0.56)));
      return { panels: P, pose: "stand", rest: 0.62, type: type };
    }
    if (n >= 2) {   // Einbruchfalz und Zickzack (auch unbekannte senkrechte Falzarten): Titel rechts, Bruch am Titel „außen“, dann abwechselnd
      var zig = type !== "single" || n > 2, prev = 0; P.push(col(n - 1, -1));
      for (i = n - 2, k = 0; i >= 0; i--, k++) { P.push(col(i, prev, V(xs[i + 1], zig && k % 2 ? -1 : 1, 1, 0, 1))); prev = P.length - 1; }
      return { panels: P, pose: "stand", rest: n === 2 ? 0.56 : 0.6, type: type || "zigzag" };
    }
    return { panels: [{ x0: 0, x1: W, y0: 0, y1: H, parent: -1, h: null }], pose: "float", rest: 0, type: "" };
  }
  function hingeM(p, t, W, H, tau) {
    var h = p.h, th = PI * ease((t - h.t0) / Math.max(1e-6, h.t1 - h.t0)), z = -h.mt * h.gap * tau / 2;
    if (h.v) { var right = (p.x0 + p.x1) / 2 > h.pos; return mAbout(h.pos - W / 2, 0, z, 0, 1, 0, th * (right ? 1 : -1) * h.mt); }
    var below = (p.y0 + p.y1) / 2 > h.pos; return mAbout(0, H / 2 - h.pos, z, 1, 0, 0, th * (below ? 1 : -1) * h.mt);
  }

  // ───────── Umriss des Endformats (flache Drucksachen): Rechteck, runde Ecken, Kreis/Oval, Sechseck ─────────
  function outline(W, H, shape, radius) {
    var pts = [], i, a;
    if (shape === "round") { for (i = 0; i < 72; i++) { a = i / 72 * 2 * PI; pts.push([W / 2 + Math.cos(a) * W / 2, H / 2 + Math.sin(a) * H / 2]); } return pts; }
    if (shape === "hex") { if (W >= H) { var q = W / 4; return [[0, H / 2], [q, 0], [W - q, 0], [W, H / 2], [W - q, H], [q, H]]; } var q2 = H / 4; return [[W / 2, 0], [W, q2], [W, H - q2], [W / 2, H], [0, H - q2], [0, q2]]; }
    var r = clamp(+radius || 0, 0, Math.min(W, H) / 2);
    if (!r) return [[0, 0], [W, 0], [W, H], [0, H]];
    var cs = [[W - r, r, -PI / 2], [W - r, H - r, 0], [r, H - r, PI / 2], [r, r, PI]];
    cs.forEach(function (c) { for (i = 0; i <= 8; i++) { a = c[2] + i / 8 * PI / 2; pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } });
    return pts;
  }

  // ───────── Geometrie: je Feld eine dünne Platte (Vorderseite = Außen-Bild, Rückseite = Innen-Bild gespiegelt, Kanten papierweiß), Rücken an den Brüchen ─────────
  function build(st, t) {
    var mdl = st.model, W = st.W, H = st.H, tau = st.tau, tf = tau * 0.6, P = mdl.panels, world = [], v = [], i;
    var push = function (p, n, u, w, side) { v.push(p[0], p[1], p[2], n[0], n[1], n[2], u, w, side); };
    for (i = 0; i < P.length; i++) world[i] = P[i].parent < 0 ? mI() : mMul(world[P[i].parent], hingeM(P[i], t, W, H, tau));   // Eltern stehen immer vor ihren Kindern
    // Gesamtlage: Zelt (Falz oben) kippt mit, flache Sachen lehnen leicht zurück
    var G = mI();
    if (mdl.pose === "tent") { var th = PI * ease(t); G = mAbout(0, H / 2 - P[1].h.pos, 0, 1, 0, 0, -(PI - th) / 2); }
    else if (mdl.pose === "float") G = mR(1, 0, 0, -0.14);
    if (mdl.turn) G = mMul(mR(0, 1, 0, PI * ease(t)), G);
    var L = function (x, y, z) { return [x - W / 2, H / 2 - y, z]; };
    P.forEach(function (p, pi) {
      var M = mMul(G, world[pi]), o = P.length === 1 ? st.outline : [[p.x0, p.y0], [p.x1, p.y0], [p.x1, p.y1], [p.x0, p.y1]], cx = 0, cy = 0, k, a, b;
      o.forEach(function (q) { cx += q[0] / o.length; cy += q[1] / o.length; });
      var nf = tv(M, 0, 0, 1), nb = tv(M, 0, 0, -1), at = function (q, z) { var l = L(q[0], q[1], z); return tp(M, l[0], l[1], l[2]); };
      for (k = 0; k < o.length; k++) { a = o[k]; b = o[(k + 1) % o.length];
        push(at([cx, cy], tf / 2), nf, cx / W, cy / H, 0); push(at(a, tf / 2), nf, a[0] / W, a[1] / H, 0); push(at(b, tf / 2), nf, b[0] / W, b[1] / H, 0);
        push(at([cx, cy], -tf / 2), nb, 1 - cx / W, cy / H, 1); push(at(b, -tf / 2), nb, 1 - b[0] / W, b[1] / H, 1); push(at(a, -tf / 2), nb, 1 - a[0] / W, a[1] / H, 1);
        // Kante nur am Außenrand des Bogens (an den Brüchen sitzt der Rücken)
        var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, outer = P.length === 1 || mx < 0.01 || mx > W - 0.01 || my < 0.01 || my > H - 0.01;
        if (outer) { var ex = b[0] - a[0], ey = b[1] - a[1], nx = ey, ny = -ex, l2 = Math.sqrt(nx * nx + ny * ny) || 1; nx /= l2; ny /= l2; if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }
          var ne = tv(M, nx, -ny, 0), a1 = at(a, tf / 2), b1 = at(b, tf / 2), a2 = at(a, -tf / 2), b2 = at(b, -tf / 2);
          push(a1, ne, 0, 0, 2); push(b1, ne, 0, 0, 2); push(b2, ne, 0, 0, 2); push(a1, ne, 0, 0, 2); push(b2, ne, 0, 0, 2); push(a2, ne, 0, 0, 2); }
      }
      if (p.h) {   // Rücken: verbindet die Falzkante des Elternfelds mit der des Kinds (zeigt das Bild an der Falz, damit dunkle Motive nicht weiß aufbrechen)
        var Mp = mMul(G, world[p.parent]), h = p.h, e0 = h.v ? [h.pos, p.y0] : [p.x0, h.pos], e1 = h.v ? [h.pos, p.y1] : [p.x1, h.pos];
        var pa = L(e0[0], e0[1], 0), pb = L(e1[0], e1[1], 0), A0 = tp(Mp, pa[0], pa[1], 0), A1 = tp(Mp, pb[0], pb[1], 0), B0 = tp(M, pa[0], pa[1], 0), B1 = tp(M, pb[0], pb[1], 0);
        var nn = norm(cross(sub(A1, A0), sub(B0, A0))), sd = (h.mt > 0 ? 0 : 1) + 10, uu = function (q) { return h.mt > 0 ? q[0] / W : 1 - q[0] / W; };
        if (dot(sub(B0, A0), sub(B0, A0)) > 1e-8) { push(A0, nn, uu(e0), e0[1] / H, sd); push(A1, nn, uu(e1), e1[1] / H, sd); push(B1, nn, uu(e1), e1[1] / H, sd); push(A0, nn, uu(e0), e0[1] / H, sd); push(B1, nn, uu(e1), e1[1] / H, sd); push(B0, nn, uu(e0), e0[1] / H, sd); }
      }
    });
    // auf den Boden stellen und mittig ausrichten
    var mn = [1e9, 1e9, 1e9], mxx = [-1e9, -1e9, -1e9]; for (i = 0; i < v.length; i += 9) for (var c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], v[i + c]); mxx[c] = Math.max(mxx[c], v[i + c]); }
    var lift = mdl.pose === "float" ? Math.max(W, H) * 0.09 : mdl.pose === "tent" ? tau * 0.5 : tau, ox = -(mn[0] + mxx[0]) / 2, oy = -mn[1] + lift, oz = -(mn[2] + mxx[2]) / 2;
    for (i = 0; i < v.length; i += 9) { v[i] += ox; v[i + 1] += oy; v[i + 2] += oz; }
    st.cy = (mxx[1] - mn[1]) / 2 + lift; var r2 = 0; for (i = 0; i < v.length; i += 9) { var dy = v[i + 1] - st.cy; r2 = Math.max(r2, v[i] * v[i] + dy * dy + v[i + 2] * v[i + 2]); }
    st.rad = Math.sqrt(r2); st.verts = new Float32Array(v); st.vcount = v.length / 9;
  }

  // ───────── Schattierer ─────────
  var VS = "attribute vec3 aPos;attribute vec3 aNrm;attribute vec2 aUv;attribute float aSide;uniform mat4 uVP;uniform mat4 uLVP;uniform float uNOff;varying vec3 vPos;varying vec3 vNrm;varying vec2 vUv;varying float vSide;varying vec4 vSh;" +
    "void main(){vPos=aPos;vNrm=aNrm;vUv=aUv;vSide=aSide;vSh=uLVP*vec4(aPos+aNrm*uNOff,1.0);gl_Position=uVP*vec4(aPos,1.0);}";
  var HP = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
  var SHF = "uniform sampler2D uSh;uniform float uShTex;varying vec4 vSh;float unp(vec4 c){return dot(c,vec4(1.0,1.0/255.0,1.0/65025.0,1.0/16581375.0));}" +
    "float shadow(float bias,float spread){vec3 p=vSh.xyz/vSh.w*0.5+0.5;if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0||p.z>1.0)return 1.0;float s=0.0;" +
    "for(int i=0;i<4;i++)for(int j=0;j<4;j++){vec2 o=(vec2(float(i),float(j))-1.5)*uShTex*spread;s+=step(p.z-bias,unp(texture2D(uSh,p.xy+o)));}return s/16.0;}";
  var FS = HP + "uniform sampler2D uT0;uniform sampler2D uT1;uniform vec3 uEye;uniform vec3 uL;uniform vec3 uPaper;uniform vec4 uMat;varying vec3 vPos;varying vec3 vNrm;varying vec2 vUv;varying float vSide;" + SHF +
    "void main(){float two=step(9.5,vSide),sd=vSide-two*10.0;vec3 N=normalize(vNrm),V=normalize(uEye-vPos);if(two>0.5&&dot(N,V)<0.0)N=-N;" +
    "vec3 base=sd<0.5?texture2D(uT0,vUv).rgb:(sd<1.5?texture2D(uT1,vUv).rgb:uPaper);" +
    "float ndl=dot(N,uL),sh=shadow(0.0007,1.3),dif=max(ndl,0.0)*sh;" +
    "float fill=max(dot(N,normalize(vec3(0.55,0.30,-0.78))),0.0)*0.36+max(dot(N,normalize(vec3(-0.15,-0.25,0.95))),0.0)*0.10;" +
    "vec3 col=base*(0.56+0.50*dif+fill);" +
    /* Glanz: Spitzlicht der Hauptlampe + gespiegelte Softbox und Lichtstreifen – wandern beim Drehen über die Fläche */
    "vec3 Hh=normalize(uL+V);float spec=pow(max(dot(N,Hh),0.0),uMat.y)*uMat.x*sh;vec3 R=reflect(-V,N);float fres=0.30+0.70*pow(1.0-max(dot(N,V),0.0),3.0);" +
    "float box=smoothstep(0.80,0.975,dot(R,normalize(vec3(-0.30,0.78,0.55))));float hf=1.0-smoothstep(0.55,0.96,abs(R.y));" +
    /* zwei stehende Lichtfelder links/rechts (wie im Fotostudio): breites weiches Feld + schmaler Streifen */
    "float s1=exp(-pow(dot(R,normalize(vec3(0.97,0.0,0.25)))*4.2,2.0))*0.55;float s2=exp(-pow(dot(R,normalize(vec3(0.62,0.0,-0.78)))*13.0,2.0))*0.75;" +
    "col+=vec3(spec)+vec3(1.0,0.985,0.96)*(box+(s1+s2)*hf)*uMat.z*fres*(0.6+0.4*sh);" +
    "gl_FragColor=vec4(min(col,vec3(1.0)),1.0);}";
  var FSG = HP + "uniform vec2 uFall;uniform sampler2D uMask;varying vec3 vPos;" + SHF + "void main(){vec3 p=vSh.xyz/vSh.w*0.5+0.5;float m=(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0)?0.0:texture2D(uMask,p.xy).r;float s=1.0-shadow(0.0007,1.6);" +
    "float f=1.0-smoothstep(uFall.x,uFall.y,length(vPos.xz));float a=clamp(m*0.40+s*0.10,0.0,0.55)*f;gl_FragColor=vec4(0.0,0.0,0.0,a);}";
  var FSM = HP + "void main(){gl_FragColor=vec4(1.0);}";
  var VSB = "attribute vec3 aPos;varying vec2 vQ;void main(){vQ=aPos.xy*0.5+0.5;gl_Position=vec4(aPos.xy,0.0,1.0);}";
  var FSB = HP + "uniform sampler2D uSrc;uniform vec2 uDir;varying vec2 vQ;void main(){float s=0.0,w=0.0;for(int i=-7;i<=7;i++){float g=exp(-float(i*i)/24.0);s+=texture2D(uSrc,vQ+uDir*float(i)).r*g;w+=g;}gl_FragColor=vec4(vec3(s/w),1.0);}";
  var VSD = "attribute vec3 aPos;uniform mat4 uLVP;void main(){gl_Position=uLVP*vec4(aPos,1.0);}";
  var FSD = HP + "vec4 pk(float d){vec4 e=fract(d*vec4(1.0,255.0,65025.0,16581375.0));e-=e.yzww*vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0);return e;}void main(){gl_FragColor=pk(gl_FragCoord.z);}";

  var MATS = {   // Glanzstärke, Glanzschärfe, Spiegelung
    gloss: [0.55, 110, 0.60], coated: [0.22, 46, 0.24], matt: [0.10, 16, 0.09], soft: [0.05, 9, 0.05], none: [0.03, 10, 0.02]
  };

  function prog(gl, vs, fs) {
    var mk = function (type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "Shader"); return s; };
    var p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, "aPos"); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "Programm");
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS), i; for (i = 0; i < n; i++) { var nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
    return { p: p, u: u, a: { pos: gl.getAttribLocation(p, "aPos"), nrm: gl.getAttribLocation(p, "aNrm"), uv: gl.getAttribLocation(p, "aUv"), side: gl.getAttribLocation(p, "aSide") } };
  }
  function pot(n, max) { var p = 1; while (p < n && p < max) p *= 2; return p; }

  // ───────── Beschriftete Felder statt Bild (Erklär-Ansicht „So wird gefalzt“) ─────────
  function cellsOf(f, side, W, H) {
    var xs = [0].concat(((f && f.x) || []).map(function (x) { return side ? W - x : x; }).sort(function (a, b) { return a - b; })).concat([W]), ys = [0].concat(((f && f.y) || []).slice().sort(function (a, b) { return a - b; })).concat([H]);
    var info = f && f.cells ? (side ? f.cells["in"] : f.cells.out) : null, txt = f ? (side ? f["in"] : f.out) : null, out = [], r, c, i = 0;
    for (r = 0; r < ys.length - 1; r++) for (c = 0; c < xs.length - 1; c++, i++) { var ci = (info && info[i]) || {}; out.push({ x0: xs[c], x1: xs[c + 1], y0: ys[r], y1: ys[r + 1], t: ci.t || (txt && txt[i]) || "", p: ci.p || 0, r: ci.r || 0 }); }
    return out;
  }
  function labelCanvas(f, side, W, H) {
    var k = 1600 / Math.max(W, H), cv = document.createElement("canvas"); cv.width = Math.round(W * k); cv.height = Math.round(H * k); var x = cv.getContext("2d");
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, cv.width, cv.height);
    cellsOf(f, side, W, H).forEach(function (c, i) {
      var cw = (c.x1 - c.x0) * k, ch = (c.y1 - c.y0) * k, key = /titel/i.test(c.t), back = /rückseite/i.test(c.t);
      x.fillStyle = key ? "#dbeafe" : back ? "#e0f2fe" : side ? (i % 2 ? "#f1f5f9" : "#f8fafc") : (i % 2 ? "#fef3c7" : "#fffbeb"); x.fillRect(c.x0 * k, c.y0 * k, cw, ch);
      x.save(); x.translate(c.x0 * k + cw / 2, c.y0 * k + ch / 2); if (c.r) x.rotate(PI); x.textAlign = "center"; x.textBaseline = "middle";
      var fs = Math.min(cw * 0.34, ch * 0.2); if (c.p) { x.fillStyle = key ? "#1d4ed8" : "#334155"; x.font = "800 " + fs + "px Inter,system-ui,Arial,sans-serif"; x.fillText(String(c.p), 0, -fs * 0.35); }
      var t = String(c.t || "").replace(/\s*[·(].*$/, ""), ts = Math.min(fs * 0.34, cw * 0.11); x.fillStyle = "#475569"; x.font = "600 " + ts + "px Inter,system-ui,Arial,sans-serif";
      var words = t.split(" "), lines = [""], maxW = cw * 0.86; words.forEach(function (w) { var cand = (lines[lines.length - 1] + " " + w).trim(); if (x.measureText(cand).width > maxW && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = cand; });
      lines.forEach(function (ln, li) { x.fillText(ln, 0, (c.p ? fs * 0.45 : -((lines.length - 1) * ts * 0.6)) + li * ts * 1.2); });
      x.restore();
    });
    x.strokeStyle = "#16a34a"; x.lineWidth = Math.max(2, cv.width / 600); x.setLineDash([cv.width / 90, cv.width / 140]);
    ((f && f.x) || []).forEach(function (fx) { var X = (side ? W - fx : fx) * k; x.beginPath(); x.moveTo(X, 0); x.lineTo(X, cv.height); x.stroke(); });
    ((f && f.y) || []).forEach(function (fy) { x.beginPath(); x.moveTo(0, fy * k); x.lineTo(cv.width, fy * k); x.stroke(); });
    return cv;
  }

  var CSS = ".ps3d{position:relative;width:100%;border-radius:18px;overflow:hidden;background:radial-gradient(120% 95% at 32% 12%,#ffffff 0,#eef1f5 52%,#d9dee6 100%);touch-action:none;user-select:none;-webkit-user-select:none}" +
    ".ps3d.dark{background:radial-gradient(120% 95% at 32% 12%,#434956 0,#262a32 55%,#15171c 100%)}" +
    ".ps3d canvas{display:block;width:100%;height:100%;cursor:grab;outline:none}.ps3d.drag canvas{cursor:grabbing}" +
    ".ps3d-bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;padding:10px 12px;flex-wrap:wrap;justify-content:center;pointer-events:none}" +
    ".ps3d-bar>*{pointer-events:auto}.ps3d-bar button{font:600 13px/1 Inter,system-ui,sans-serif;border:1px solid rgba(15,23,42,.14);background:rgba(255,255,255,.86);color:#0f172a;border-radius:99px;padding:9px 14px;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 2px 8px rgba(15,23,42,.10)}" +
    ".ps3d-bar button:hover{background:#fff}.ps3d.dark .ps3d-bar button{background:rgba(30,33,40,.78);color:#fff;border-color:rgba(255,255,255,.18)}" +
    ".ps3d-sl{display:flex;align-items:center;gap:8px;font:600 12px/1 Inter,system-ui,sans-serif;color:#334155;background:rgba(255,255,255,.86);border:1px solid rgba(15,23,42,.14);border-radius:99px;padding:6px 12px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}" +
    ".ps3d.dark .ps3d-sl{background:rgba(30,33,40,.78);color:#e2e8f0;border-color:rgba(255,255,255,.18)}.ps3d-sl input{width:min(38vw,190px);accent-color:#0a84ff}" +
    ".ps3d-hint{position:absolute;left:12px;top:10px;font:500 12px/1.2 Inter,system-ui,sans-serif;color:rgba(15,23,42,.55);pointer-events:none;transition:opacity .4s}.ps3d.dark .ps3d-hint{color:rgba(255,255,255,.6)}.ps3d.used .ps3d-hint{opacity:0}" +
    ".ps3d-cap{position:absolute;right:12px;top:10px;font:500 11.5px/1.2 Inter,system-ui,sans-serif;color:rgba(15,23,42,.45);pointer-events:none;text-align:right;max-width:55%}.ps3d.dark .ps3d-cap{color:rgba(255,255,255,.5)}";
  function css() { if (document.getElementById("ps3dCss")) return; var s = document.createElement("style"); s.id = "ps3dCss"; s.textContent = CSS; document.head.appendChild(s); }

  var SUP = null;
  function supported() { if (SUP != null) return SUP; try { var c = document.createElement("canvas"); SUP = !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); } catch (e) { SUP = false; } return SUP; }

  function mount(host, o) {
    o = o || {}; if (!host || !o.mm || !(o.mm.w > 0 && o.mm.h > 0)) return null;
    // aufräumen: alte Ansichten, die nicht mehr auf der Seite sind (Browser erlauben nur wenige WebGL-Flächen)
    INST.slice().forEach(function (x) { if (x.host === host || !document.documentElement.contains(x.host)) x.destroy(); });
    css();
    var W = +o.mm.w, H = +o.mm.h, model = foldModel(o.folds, W, H), folded = model.panels.length > 1;
    var gsm = +o.gsm || (folded ? 135 : 300), tau = clamp(gsm * 0.0016, 0.22, 0.75) * Math.max(1, Math.max(W, H) / 420);
    var st = { W: W, H: H, model: model, tau: tau, outline: outline(W, H, folded ? "" : o.shape || "", folded ? 0 : o.radius), verts: null, vcount: 0, cy: H / 2 };
    var de = document.documentElement, dark = o.dark != null ? !!o.dark : !de.classList.contains("light") && de.getAttribute("data-theme") !== "light" && (de.classList.contains("dark") || de.getAttribute("data-theme") === "dark");
    var root = document.createElement("div"); root.className = "ps3d" + (dark ? " dark" : ""); root.style.height = (o.height || Math.round(clamp(host.clientWidth * 0.68, 300, 560))) + "px";
    var cv = document.createElement("canvas"); cv.tabIndex = 0; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", folded ? "3D-Vorschau: Folder zum Drehen und Auf- und Zuklappen" : "3D-Vorschau zum Drehen"); root.appendChild(cv);
    var hint = document.createElement("div"); hint.className = "ps3d-hint"; hint.textContent = "Ziehen zum Drehen · Mausrad/zwei Finger zum Zoomen"; root.appendChild(hint);
    if (o.caption) { var cap = document.createElement("div"); cap.className = "ps3d-cap"; cap.textContent = o.caption; root.appendChild(cap); }
    var bar = document.createElement("div"); bar.className = "ps3d-bar";
    bar.innerHTML = (folded ? '<button type="button" data-3d="toggle">Zuklappen</button><label class="ps3d-sl"><span>offen</span><input type="range" min="0" max="1000" value="0" aria-label="Auf- und Zuklappen"><span>gefalzt</span></label>' : '<button type="button" data-3d="flip">Umdrehen</button>') + '<button type="button" data-3d="reset" title="Ansicht zurücksetzen">Ansicht zurücksetzen</button>';
    root.appendChild(bar);
    var gl; try { gl = cv.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true }) || cv.getContext("experimental-webgl", { antialias: true, alpha: true, premultipliedAlpha: true }); } catch (e) { gl = null; }
    if (!gl) return null;

    var P, PG, PD, PM, PB, buf, gbuf, qbuf, mk = [], MKN = 512, tex = [null, null], shTex, shFbo, SHN = 2048, dead = false, raf = 0, dirty = true, geoT = -1;
    var R0 = 0.5 * Math.sqrt(W * W + H * H), cam = { yaw: 0.42, pitch: 0.22, zoom: 1, vy: 0, vp: 0 }, home = { yaw: 0.42, pitch: 0.22, zoom: 1 };
    var t = 0, tGoal = folded ? model.rest : 0, tAuto = true, flipGoal = null, used = false, reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches, t0 = performance.now(), last = t0;
    if (reduce) t = tGoal;
    var mat = MATS[o.finish] || MATS.coated, Ldir = norm([-0.46, 0.82, 0.52]);
    var slider = bar.querySelector("input"), tog = bar.querySelector('[data-3d="toggle"]');

    function texFrom(src, i, noBleed) {
      var maxT = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048), b = noBleed ? 0 : +o.bleed || 0;
      var put = function (im, raw) { if (dead) return; var b0 = b; if (raw) b = 0; var iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height; if (!iw || !ih) return;
        var bx = b > 0 ? iw * b / (W + 2 * b) : 0, by = b > 0 ? ih * b / (H + 2 * b) : 0, tw = pot(Math.min(iw - 2 * bx, 2048), maxT), th = pot(Math.min(ih - 2 * by, 2048), maxT);
        var c = document.createElement("canvas"); c.width = tw; c.height = th; var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, tw, th);
        try { x.drawImage(im, bx, by, iw - 2 * bx, ih - 2 * by, 0, 0, tw, th); } catch (e) { return; }
        var tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx);
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); } catch (e2) { return; }
        gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        var an = gl.getExtension("EXT_texture_filter_anisotropic") || gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic"); if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1));
        if (tex[i]) gl.deleteTexture(tex[i]); tex[i] = tx; dirty = true; b = b0; kick(); };
      if (!src) return put(blank(), true);
      if (typeof src === "string") { var im = new Image(); if (!/^data:|^blob:/.test(src)) im.crossOrigin = "anonymous"; im.onload = function () { put(im); }; im.onerror = function () { put(blank(), true); }; im.src = src; if (!tex[i]) put(blank(), true); }
      else put(src);
    }
    function blank() { var c = document.createElement("canvas"); c.width = c.height = 4; var x = c.getContext("2d"); x.fillStyle = "#fbfbf9"; x.fillRect(0, 0, 4, 4); return c; }
    function init() {
      P = prog(gl, VS, FS); PG = prog(gl, VS, FSG); PD = prog(gl, VSD, FSD); PM = prog(gl, VSD, FSM); PB = prog(gl, VSB, FSB);
      buf = gl.createBuffer(); gbuf = gl.createBuffer();
      var g = R0 * 7, gv = [-g, 0, -g, 0, 1, 0, 0, 0, 2, g, 0, -g, 0, 1, 0, 0, 0, 2, g, 0, g, 0, 1, 0, 0, 0, 2, -g, 0, -g, 0, 1, 0, 0, 0, 2, g, 0, g, 0, 1, 0, 0, 0, 2, -g, 0, g, 0, 1, 0, 0, 0, 2];
      gl.bindBuffer(gl.ARRAY_BUFFER, gbuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gv), gl.STATIC_DRAW);
      SHN = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 1024);
      shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, shTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SHN, SHN, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SHN, SHN);
      shFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, shFbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shTex, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      qbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qbuf); var qv = []; [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]].forEach(function (c) { qv.push(c[0], c[1], 0, 0, 0, 1, 0, 0, 0); }); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(qv), gl.STATIC_DRAW);
      mk = [0, 1].map(function () { var tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, MKN, MKN, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        var fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0); return { t: tx, f: fb }; });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      tex = [null, null]; geoT = -1;
      var pages = o.pages || [];
      if (o.labels || !pages[0]) { texFrom(labelCanvas(o.folds, 0, W, H), 0, true); texFrom(labelCanvas(o.folds, 1, W, H), 1, true); }
      else { texFrom(pages[0], 0); texFrom(pages[1] || null, 1); }
    }
    function bind(pr, b) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b); var S = 36;
      gl.enableVertexAttribArray(pr.a.pos); gl.vertexAttribPointer(pr.a.pos, 3, gl.FLOAT, false, S, 0);
      [["nrm", 3, 12], ["uv", 2, 24], ["side", 1, 32]].forEach(function (a) { var loc = pr.a[a[0]]; if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, a[1], gl.FLOAT, false, S, a[2]); } });
    }
    function unbind(pr) { ["nrm", "uv", "side"].forEach(function (a) { if (pr.a[a] > 0) gl.disableVertexAttribArray(pr.a[a]); }); }
    function size() { var dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(2, Math.round(root.clientWidth * dpr)), h = Math.max(2, Math.round(root.clientHeight * dpr)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; dirty = true; } }
    function draw() {
      if (dead || !tex[0] || !tex[1]) return;
      size();
      if (geoT !== t) { build(st, t); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, st.verts, gl.DYNAMIC_DRAW); geoT = t; }
      var Rn = Math.max(st.rad || R0, R0 * 0.2), asp = cv.width / cv.height, fov = 30 * PI / 180, fit = Rn / Math.sin(Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * asp)) / 2) * 1.08, dist = fit * cam.zoom;
      var tgt = [0, st.cy, 0], cp = Math.cos(cam.pitch), eye = [tgt[0] + Math.sin(cam.yaw) * cp * dist, tgt[1] + Math.sin(cam.pitch) * dist, tgt[2] + Math.cos(cam.yaw) * cp * dist];
      var VP = mMul(mPersp(fov, asp, dist * 0.12, dist * 6 + R0 * 8), mLook(eye, tgt, [0, 1, 0]));
      var lc = [0, st.cy, 0], lr = Rn * 1.3, LVP = mMul(mOrtho(-lr, lr, -lr, lr, lr * 1.1, lr * 3.5), mLook([lc[0] + Ldir[0] * lr * 2.3, lc[1] + Ldir[1] * lr * 2.3, lc[2] + Ldir[2] * lr * 2.3], lc, [0, 1, 0]));
      // 1) Schattenkarte aus Sicht der Lampe
      gl.bindFramebuffer(gl.FRAMEBUFFER, shFbo); gl.viewport(0, 0, SHN, SHN); gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      gl.useProgram(PD.p); gl.uniformMatrix4fv(PD.u.uLVP, false, new Float32Array(LVP)); bind(PD, buf); gl.drawArrays(gl.TRIANGLES, 0, st.vcount);
      // 1b) Bodenschatten: Umriss aus Sicht der Lampe, zweimal weichgezeichnet (quer, hoch)
      gl.disable(gl.DEPTH_TEST); gl.bindFramebuffer(gl.FRAMEBUFFER, mk[0].f); gl.viewport(0, 0, MKN, MKN); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(PM.p); gl.uniformMatrix4fv(PM.u.uLVP, false, new Float32Array(LVP)); bind(PM, buf); gl.drawArrays(gl.TRIANGLES, 0, st.vcount);
      gl.useProgram(PB.p); bind(PB, qbuf); gl.activeTexture(gl.TEXTURE3); gl.uniform1i(PB.u.uSrc, 3);
      for (var bp = 0; bp < 2; bp++) { gl.bindFramebuffer(gl.FRAMEBUFFER, mk[1].f); gl.bindTexture(gl.TEXTURE_2D, mk[0].t); gl.uniform2f(PB.u.uDir, (1.3 + bp) / MKN, 0); gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindFramebuffer(gl.FRAMEBUFFER, mk[0].f); gl.bindTexture(gl.TEXTURE_2D, mk[1].t); gl.uniform2f(PB.u.uDir, 0, (1.3 + bp) / MKN); gl.drawArrays(gl.TRIANGLES, 0, 6); }
      gl.enable(gl.DEPTH_TEST);
      // 2) Bild: erst der Schatten am Boden, dann die Drucksache
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, shTex);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.useProgram(PG.p); gl.uniformMatrix4fv(PG.u.uVP, false, new Float32Array(VP)); gl.uniformMatrix4fv(PG.u.uLVP, false, new Float32Array(LVP)); gl.uniform1i(PG.u.uSh, 2); gl.uniform1f(PG.u.uShTex, 1 / SHN); gl.uniform1f(PG.u.uNOff, 2 * lr / SHN * 3.4); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, mk[0].t); gl.uniform1i(PG.u.uMask, 3); gl.uniform2f(PG.u.uFall, Rn * 2.4, Rn * 5);
      bind(PG, gbuf); if (eye[1] > 0) gl.drawArrays(gl.TRIANGLES, 0, 6); unbind(PG);
      gl.depthMask(true); gl.disable(gl.BLEND);
      gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, new Float32Array(VP)); gl.uniformMatrix4fv(P.u.uLVP, false, new Float32Array(LVP));
      gl.uniform3f(P.u.uEye, eye[0], eye[1], eye[2]); gl.uniform3f(P.u.uL, Ldir[0], Ldir[1], Ldir[2]); gl.uniform3f(P.u.uPaper, 0.97, 0.965, 0.95); gl.uniform4f(P.u.uMat, mat[0], mat[1], mat[2], 1);
      gl.uniform1i(P.u.uSh, 2); gl.uniform1f(P.u.uShTex, 1 / SHN); gl.uniform1f(P.u.uNOff, 2 * lr / SHN * 3.4);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[0]); gl.uniform1i(P.u.uT0, 0); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[1]); gl.uniform1i(P.u.uT1, 1);
      bind(P, buf); gl.drawArrays(gl.TRIANGLES, 0, st.vcount); unbind(P);
    }
    function sync() { if (slider && document.activeElement !== slider) slider.value = String(Math.round(t * 1000)); if (tog) tog.textContent = tGoal > 0.5 || t > 0.5 ? "Aufklappen" : "Zuklappen"; }
    function frame(now) {
      raf = 0; if (dead) return; var dt = Math.min(0.05, (now - last) / 1000); last = now; var moving = false;
      if (Math.abs(tGoal - t) > 0.0005) { var sp = 0.55 * dt; t += clamp(tGoal - t, -sp, sp); moving = true; dirty = true; sync(); } else if (t !== tGoal) { t = tGoal; dirty = true; sync(); }
      if (flipGoal != null) { var d = flipGoal - cam.yaw; if (Math.abs(d) < 0.004) { cam.yaw = flipGoal; flipGoal = null; } else { cam.yaw += d * Math.min(1, dt * 5.5); moving = true; } dirty = true; }
      if (!drag && (Math.abs(cam.vy) > 0.0004 || Math.abs(cam.vp) > 0.0004)) { cam.yaw += cam.vy; cam.pitch = clamp(cam.pitch + cam.vp, 0.03, 1.45); cam.vy *= 0.92; cam.vp *= 0.9; moving = true; dirty = true; }
      if (!used && !reduce && flipGoal == null) { cam.yaw = home.yaw + Math.sin((now - t0) / 2600) * 0.34; moving = true; dirty = true; }   // sanftes Schwenken, bis jemand anfasst
      if (dirty) { dirty = false; draw(); }
      if (moving) kick();
    }
    function kick() { if (!raf && !dead) raf = requestAnimationFrame(frame); }

    // ── Bedienung ──
    var drag = null, pts = {}, pinch = 0;
    function touchStart() { if (!used) { used = true; root.classList.add("used"); home.yaw = cam.yaw; } flipGoal = null; }
    cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); pts[e.pointerId] = [e.clientX, e.clientY]; touchStart(); drag = { x: e.clientX, y: e.clientY }; cam.vy = cam.vp = 0; root.classList.add("drag"); e.preventDefault(); });
    cv.addEventListener("pointermove", function (e) { if (!pts[e.pointerId]) return; pts[e.pointerId] = [e.clientX, e.clientY]; var ids = Object.keys(pts);
      if (ids.length >= 2) { var a = pts[ids[0]], b = pts[ids[1]], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) cam.zoom = clamp(cam.zoom * pinch / dd, 0.55, 2.2); pinch = dd; dirty = true; kick(); return; }
      if (!drag) return; var k = 3.2 / Math.max(240, root.clientWidth), dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k; drag.x = e.clientX; drag.y = e.clientY;
      cam.yaw -= dx; cam.pitch = clamp(cam.pitch + dy, 0.03, 1.45); cam.vy = -dx * 0.6; cam.vp = dy * 0.4; dirty = true; kick(); });
    var up = function (e) { delete pts[e.pointerId]; pinch = 0; if (!Object.keys(pts).length) { drag = null; root.classList.remove("drag"); kick(); } };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", function (e) { e.preventDefault(); touchStart(); cam.zoom = clamp(cam.zoom * Math.exp(e.deltaY * 0.0012), 0.55, 2.2); dirty = true; kick(); }, { passive: false });
    cv.addEventListener("dblclick", function () { reset(); });
    cv.addEventListener("keydown", function (e) { var k = e.key; if (k === "ArrowLeft" || k === "ArrowRight") { touchStart(); cam.yaw += k === "ArrowLeft" ? -0.18 : 0.18; } else if (k === "ArrowUp" || k === "ArrowDown") { touchStart(); cam.pitch = clamp(cam.pitch + (k === "ArrowUp" ? 0.1 : -0.1), 0.03, 1.45); } else if (k === " " || k === "Enter") { toggle(); } else return; e.preventDefault(); dirty = true; kick(); });
    function reset() { touchStart(); cam.zoom = home.zoom; cam.pitch = 0.22; flipGoal = 0.42 + Math.round((cam.yaw - 0.42) / (2 * PI)) * 2 * PI; cam.vy = cam.vp = 0; if (folded) tGoal = model.rest; kick(); }
    function toggle() { if (!folded) return flip(); touchStart(); tGoal = (tGoal > 0.5 ? 0 : 1); sync(); kick(); }
    function flip() { touchStart(); flipGoal = cam.yaw + PI; kick(); }
    bar.addEventListener("click", function (e) { var b = e.target.closest ? e.target.closest("[data-3d]") : null; if (!b) return; var a = b.getAttribute("data-3d"); if (a === "toggle") toggle(); else if (a === "flip") flip(); else reset(); });
    if (slider) slider.addEventListener("input", function () { touchStart(); t = tGoal = clamp(+slider.value / 1000, 0, 1); dirty = true; sync(); kick(); });
    var ro = window.ResizeObserver ? new ResizeObserver(function () { dirty = true; kick(); }) : null; if (ro) ro.observe(root);
    cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); if (raf) cancelAnimationFrame(raf); raf = 0; });
    cv.addEventListener("webglcontextrestored", function () { try { init(); dirty = true; kick(); } catch (e) {} });

    try { init(); } catch (e) { if (window.console) console.warn("PS3D:", e.message); return null; }
    host.innerHTML = ""; host.appendChild(root);
    sync(); kick();
    var chk = setInterval(function () { if (!document.documentElement.contains(root)) api.destroy(); }, 1500);   // Fenster geschlossen → WebGL-Fläche freigeben
    var api = { host: host, el: root,
      fold: function (v) { touchStart(); tGoal = clamp(+v || 0, 0, 1); kick(); }, flip: flip, reset: reset,
      /* schärfere Seitenbilder nachreichen (Studio: startet sofort mit der bereits gerenderten Ansicht, feine Fassung folgt) – Ansicht und Klappstellung bleiben */
      setPages: function (pg, bleed) { if (dead || !pg || !pg[0]) return; var nb = !(+bleed > 0); if (!nb) o.bleed = +bleed; texFrom(pg[0], 0, nb); if (pg[1]) texFrom(pg[1], 1, nb); },
      _set: function (tt, yaw, pitch, zoom) { touchStart(); t = tGoal = clamp(+tt || 0, 0, 1); if (yaw != null) cam.yaw = +yaw; if (pitch != null) cam.pitch = +pitch; if (zoom) cam.zoom = +zoom; cam.vy = cam.vp = 0; sync(); dirty = false; draw(); },
      state: function () { return { t: t, goal: tGoal, yaw: cam.yaw, pitch: cam.pitch, panels: model.panels.length, type: model.type, pose: model.pose, verts: st.vcount }; },
      destroy: function () { if (dead) return; dead = true; clearInterval(chk); if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); var i = INST.indexOf(api); if (i > -1) INST.splice(i, 1);
        try { var lc2 = gl.getExtension("WEBGL_lose_context"); if (lc2) lc2.loseContext(); } catch (e) {} if (root.parentNode) root.parentNode.removeChild(root); } };
    INST.push(api); return api;
  }

  window.PS3D = { mount: mount, supported: supported, _model: foldModel, _cells: cellsOf, _labelCanvas: labelCanvas };
})();
