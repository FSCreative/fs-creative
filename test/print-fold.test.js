/* Falzgeometrie (print-fold.js): Bogenmaße, Falzpositionen und Lage von Titel/Rückseite je Falzart – laut offiziellen Infoblättern des Produktionspartners.
   Start: node test/print-fold.test.js */
"use strict";
const assert = require("assert");
const { foldSpec, foldFromOpen, FOLD_RX, MAP_GRID } = require("../print-fold.js");
let ok = 0, fail = 0;
const t = (name, fn) => { try { fn(); ok++; } catch (e) { fail++; console.log("✗ " + name + ": " + e.message); } };
const lab = a => a.map(c => c.t + (c.p ? " " + c.p : "") + (c.r ? " r" : ""));
const sum = a => Math.round(a.reduce((x, y) => x + y, 0) * 10) / 10;

t("Einbruchfalz 4-seitig", () => { const f = foldSpec("single_4", 148, 210);
  assert.deepStrictEqual(f.open, { w: 297, h: 210 }); assert.deepStrictEqual(f.x, [148.5]); assert.deepStrictEqual(f.y, []);   /* A5: Bogen = A4 quer 297 mm, nicht 296 */
  assert.deepStrictEqual(foldSpec("single_4", 105, 148).open, { w: 210, h: 148 }); assert.deepStrictEqual(foldSpec("single_4", 105, 148).x, [105]);
  assert.deepStrictEqual(lab(f.cells.out), ["Rückseite 4", "Titel 1"]); assert.deepStrictEqual(lab(f.cells.in), ["Innen 2", "Innen 3"]); });
t("Einbruchfalz oben: Rückseite und Innenseiten auf dem Kopf", () => { const f = foldSpec("singlehorizontal_4", 148, 105);
  assert.deepStrictEqual(f.open, { w: 148, h: 210 }); assert.deepStrictEqual(f.x, []); assert.deepStrictEqual(f.y, [105]);
  assert.deepStrictEqual(lab(f.cells.out), ["Rückseite 4 r", "Titel 1"]); assert.deepStrictEqual(lab(f.cells.in), ["Innen 3 r", "Innen 2 r"]); });
t("Wickelfalz 6/8/10: volle Felder = Endformat, Einklappseiten schmäler, Bogen entsprechend kürzer", () => {
  [[6, 3, [2]], [8, 4, [2, 3]], [10, 5, [2, 3, 4]]].forEach(([pg, n, d]) => { const f = foldSpec("wikkel_" + pg, 99, 210), cut = d.reduce((a, x) => a + x, 0);
    assert.strictEqual(f.open.w, n * 99 - cut, "Bogen = n × Endformat − " + cut + " mm"); assert.strictEqual(f.open.h, 210); assert.strictEqual(f.x.length, n - 1); assert.strictEqual(sum(f.widths), n * 99 - cut);
    assert.strictEqual(f.widths[n - 1], 99, "Titel = Endformat"); assert.strictEqual(f.widths[n - 2], 99, "Rückseite = Endformat");
    d.forEach((mm, i) => assert.strictEqual(f.widths[n - 3 - i], 99 - mm, "Einklappseite −" + mm + " mm"));
    assert.strictEqual(f.cells.out[n - 1].t, "Titel"); assert.strictEqual(f.cells.out[n - 2].t, "Rückseite"); assert.strictEqual(f.cells.out[n - 2].p, pg);
    assert.deepStrictEqual(f.cells.in.map(c => c.p), Array.from({ length: n }, (x, i) => i + 2)); });
  assert.deepStrictEqual(lab(foldSpec("wikkel_6", 148, 210).cells.out), ["Einklappseite außen 5", "Rückseite 6", "Titel 1"]);
  /* Falzpositionen wie die Formeln im offiziellen Editor-Overlay (width = Bogenbreite W): 6-s. X = (W+2)/3 → außen X−2, 2X−2 · innen X, 2X;
     8-s. X = (W+5)/4 → außen X−3, 2X−5, 3X−5 · innen X, 2X, 3X−2; 10-s. X = (W+9)/5 → außen X−4, 2X−7, 3X−9, 4X−9 · innen X, 2X, 3X−2, 4X−5 */
  const inner = f => f.x.map(x => Math.round((f.open.w - x) * 10) / 10).sort((a, b) => a - b);
  [99, 105, 148, 210].forEach(w => {
    const a = foldSpec("wikkel_6", w, 210), Xa = (a.open.w + 2) / 3; assert.deepStrictEqual(a.x, [Xa - 2, 2 * Xa - 2]); assert.deepStrictEqual(inner(a), [Xa, 2 * Xa]);
    const b = foldSpec("wikkel_8", w, 210), Xb = (b.open.w + 5) / 4; assert.deepStrictEqual(b.x, [Xb - 3, 2 * Xb - 5, 3 * Xb - 5]); assert.deepStrictEqual(inner(b), [Xb, 2 * Xb, 3 * Xb - 2]);
    const c = foldSpec("wikkel_10", w, 210), Xc = (c.open.w + 9) / 5; assert.deepStrictEqual(c.x, [Xc - 4, 2 * Xc - 7, 3 * Xc - 9, 4 * Xc - 9]); assert.deepStrictEqual(inner(c), [Xc, 2 * Xc, 3 * Xc - 2, 4 * Xc - 5]); }); });
t("Bogengrößen = planoWidth × planoHeight der Print.com-Preisabfrage (abgefragt 20.11.2026)", () => {
  /* [Falzart, Formatbreite, Formathöhe, planoWidth, planoHeight] – Stichprobe aus 184 abgefragten Folder-Ausführungen + Menükarten */
  [["single_4", 297, 420, 594, 420], ["single_4", 99, 210, 198, 210], ["single_4", 121, 120, 242, 120], ["singlehorizontal_4", 210, 297, 210, 594], ["singlehorizontal_4", 135, 135, 135, 270],
   ["wikkel_6", 210, 297, 628, 297], ["wikkel_6", 148, 210, 442, 210], ["wikkel_6", 105, 148, 313, 148], ["wikkel_6", 74, 105, 220, 105], ["wikkel_6", 99, 210, 295, 210], ["wikkel_6", 135, 135, 403, 135], ["wikkel_6", 140, 297, 418, 297], ["wikkel_6", 121, 120, 361, 120], ["wikkel_6", 210, 148, 628, 148],
   ["zigzag_6", 210, 297, 630, 297], ["zigzag_6", 99, 210, 297, 210], ["zigzag_6", 135, 135, 405, 135], ["luik_6", 210, 297, 420, 297], ["luik_6", 99, 210, 198, 210], ["luik_6", 297, 420, 594, 420],
   ["wikkel_8", 210, 297, 835, 297], ["wikkel_8", 148, 210, 587, 210], ["wikkel_8", 105, 148, 415, 148], ["wikkel_8", 74, 105, 291, 105], ["wikkel_8", 99, 210, 391, 210], ["wikkel_8", 135, 135, 535, 135], ["wikkel_8", 140, 297, 555, 297], ["wikkel_8", 121, 120, 479, 120],
   ["zigzag_8", 210, 297, 840, 297], ["zigzag_8", 99, 210, 396, 210], ["zigzag_8", 148, 210, 592, 210], ["zigzag_8", 74, 105, 297, 105], ["zigzag_8", 74, 210, 297, 210],
   ["single_4", 148, 210, 297, 210], ["single_4", 148, 105, 297, 105], ["single_4", 74, 105, 148, 105], ["singlehorizontal_4", 105, 148, 105, 297], ["singlehorizontal_4", 210, 148, 210, 297], ["luik_6", 148, 210, 297, 210], ["luik_6", 148, 148, 297, 148],
   ["cross_8", 148, 210, 297, 420], ["cross_8", 105, 148, 210, 297], ["cross_8", 148, 148, 297, 297], ["cross_8", 210, 148, 420, 297], ["zigzag_6", 148, 210, 444, 210], ["zigzag_6", 74, 105, 222, 105], ["cross_8", 210, 297, 420, 594], ["cross_8", 148, 420, 297, 840], ["cross_8", 140, 297, 280, 594], ["luik_8", 148, 210, 590, 210],
   ["wikkel_10", 148, 210, 731, 210], ["wikkel_10", 105, 148, 516, 148], ["wikkel_10", 74, 105, 361, 105], ["wikkel_10", 99, 210, 486, 210], ["wikkel_10", 135, 135, 666, 135], ["wikkel_10", 140, 297, 691, 297], ["wikkel_10", 121, 120, 596, 120],
   ["zigzag_10", 148, 210, 740, 210], ["zigzag_10", 99, 210, 495, 210], ["zigzag_10", 121, 120, 605, 120]
  ].forEach(([s, w, h, pw, ph]) => { const f = foldSpec(s, w, h); assert.deepStrictEqual(f.open, { w: pw, h: ph }, s + " " + w + " × " + h); assert.deepStrictEqual(f.closed, { w, h });
    f.x.concat(f.y).forEach(v => assert.strictEqual(v, Math.round(v * 4) / 4, s + ": Falz auf ¼ mm genau (" + v + ")")); }); });
t("DIN-Kante 296 → 297 mm: Falz genau in der Bogenmitte bzw. bei den Vierteln (Overlay-Formeln width/2, 2·width/sides, width/4)", () => {
  assert.deepStrictEqual(foldSpec("single_4", 148, 210).x, [148.5]); assert.deepStrictEqual(foldSpec("singlehorizontal_4", 105, 148).y, [148.5]);
  assert.deepStrictEqual(foldSpec("zigzag_8", 74, 105).x, [74.25, 148.5, 222.75]); assert.deepStrictEqual(foldSpec("luik_6", 148, 210).x, [74.25, 222.75]);
  const c = foldSpec("cross_8", 148, 148); assert.deepStrictEqual([c.x, c.y], [[148.5], [148.5]]); assert.deepStrictEqual(foldSpec("zigzag_8", 148, 210).x, [148, 296, 444]);
  assert.deepStrictEqual(foldSpec("halffold_8", 148, 210).open, { w: 297, h: 420 }); assert.deepStrictEqual(foldSpec("single_4", 148, 210).closed, { w: 148, h: 210 }); });
t("Zickzack: Rückseite innen rechts (6/10) bzw. außen links (8)", () => {
  const a = foldSpec("zigzag_6", 99, 210), b = foldSpec("zigzag_8", 148, 210), c = foldSpec("zigzag_10", 105, 297);
  assert.deepStrictEqual(a.x, [99, 198]); assert.deepStrictEqual(b.x, [148, 296, 444]); assert.deepStrictEqual(c.x, [105, 210, 315, 420]);
  assert.deepStrictEqual(lab(a.cells.out), ["Außen 5", "Außen 6", "Titel 1"]); assert.deepStrictEqual(lab(a.cells.in), ["Innen 2", "Innen 3", "Rückseite 4"]);
  assert.deepStrictEqual(lab(b.cells.out), ["Rückseite 8", "Außen 6", "Außen 7", "Titel 1"]); assert.deepStrictEqual(lab(b.cells.in), ["Innen 2", "Innen 3", "Innen 4", "Innen 5"]);
  assert.deepStrictEqual(lab(c.cells.out), ["Außen 6", "Außen 7", "Außen 8", "Außen 9", "Titel 1"]); assert.strictEqual(lab(c.cells.in)[4], "Rückseite 10"); });
t("Fensterfalz 6 und 8", () => { const a = foldSpec("luik_6", 210, 297), b = foldSpec("luik_8", 105, 297);
  assert.deepStrictEqual(a.widths, [105, 210, 105]); assert.deepStrictEqual(a.x, [105, 315]); assert.deepStrictEqual(a.open, { w: 420, h: 297 });
  assert.deepStrictEqual(lab(a.cells.out), ["Titel – rechte Tür 2", "Rückseite 6", "Titel – linke Tür 1"]);
  assert.deepStrictEqual(b.widths, [104, 105, 105, 104]); assert.strictEqual(b.open.w, 418); assert.deepStrictEqual(b.x, [104, 209, 314]);
  assert.deepStrictEqual(lab(b.cells.out), ["Klappe außen 3", "Rückseite 8", "Titel 1", "Klappe außen 2"]); assert.deepStrictEqual(b.cells.in.map(c => c.p), [4, 5, 6, 7]); });
t("Kreuzfalz 8: untere Reihe außen auf dem Kopf", () => { const f = foldSpec("cross_8", 148, 210);
  assert.deepStrictEqual(f.open, { w: 297, h: 420 }); assert.deepStrictEqual(f.x, [148.5]); assert.deepStrictEqual(f.y, [210]);
  assert.deepStrictEqual(lab(f.cells.out), ["Rückseite 8", "Titel 1", "Innen 3 r", "Innen 2 r"]); assert.deepStrictEqual(f.cells.in.map(c => c.p), [4, 5, 6, 7]); });
t("Pläne: Spalten × Reihen, Titel unten rechts", () => { Object.keys(MAP_GRID).forEach(pg => { const g = MAP_GRID[pg], f = foldSpec((+pg === 8 ? "halffold_" : "zigzagcross_") + pg, 100, 210);
    assert.deepStrictEqual(f.open, { w: g[0] * 100, h: g[1] * 210 }); assert.strictEqual(f.x.length, g[0] - 1); assert.strictEqual(f.y.length, g[1] - 1);
    assert.strictEqual(f.cells.out.length, g[0] * g[1]); assert.strictEqual(f.cells.out[g[0] * g[1] - 1].t, "Titel");
    assert.strictEqual(f.cells.out.concat(f.cells.in).filter(c => c.t === "Rückseite").length, 1, "genau eine Rückseite"); });
  assert.strictEqual(foldSpec("halffold_8", 148, 210).cells.out[1].r, 180); assert.strictEqual(foldSpec("zigzagcross_24", 100, 210).cells.out[0].t, "Rückseite"); assert.strictEqual(foldSpec("zigzagcross_30", 100, 210).cells.in[4].t, "Rückseite"); });
t("jede Falzart: Felder passen zu den Falzlinien, Textfassung gleich lang", () => {
  ["single_4", "singlehorizontal_4", "wikkel_6", "wikkel_8", "wikkel_10", "zigzag_6", "zigzag_8", "zigzag_10", "luik_6", "luik_8", "cross_8", "halffold_8", "zigzagcross_12", "zigzagcross_16", "zigzagcross_20", "zigzagcross_24", "zigzagcross_30"].forEach(s => {
    const f = foldSpec(s, 105, 148), n = (f.x.length + 1) * (f.y.length + 1); assert.ok(FOLD_RX.test(s));
    assert.strictEqual(f.cells.out.length, n, s); assert.strictEqual(f.cells.in.length, n, s); assert.strictEqual(f.out.length, n); assert.strictEqual(f.in.length, n);
    assert.strictEqual(f.cells.out.filter(c => /^Titel/.test(c.t)).length >= 1, true, s + " Titel");
    f.x.concat(f.y).forEach((v, i, a) => assert.ok(v > 0 && (!i || a[i - 1] !== v), s + " Falzposition"));
    const b = foldFromOpen(s, f.open.w, f.open.h); assert.deepStrictEqual(b.open, f.open, s + " zurückgerechnet"); assert.deepStrictEqual(b.x, f.x); assert.deepStrictEqual(b.y, f.y);
    assert.ok(Math.abs(b.closed.w - 105) <= 0.5 && Math.abs(b.closed.h - 148) <= 0.5, s + " Endformat"); }); });
t("Altaufträge (Bogen früher Felder × Endformat): Falzlinien passen zur vorhandenen Datei", () => { const f = foldFromOpen("wikkel_6", 630, 297);
  assert.deepStrictEqual(f.open, { w: 630, h: 297 }); assert.ok(Math.abs(f.x[0] - 208.67) < 0.02 && Math.abs(f.x[1] - 419.33) < 0.02); assert.strictEqual(foldFromOpen("zigzag_6", 630, 297).closed.w, 210); });
t("nicht unterstützt → null (keine erfundenen Falzlinien)", () => {
  ["no_fold", "not_fold", "zigzag_4", "zigzag_12", "wikkel_12", "cross_12", "halffold_12", "zigzagcross_8", "luik_10", "", null, "single_4x"].forEach(s => assert.strictEqual(foldSpec(s, 100, 100), null, String(s)));
  assert.strictEqual(foldSpec("single_4", 0, 100), null); assert.strictEqual(foldFromOpen("no_fold", 100, 100), null); });

console.log(fail ? "FEHLER: " + ok + " bestanden, " + fail + " fehlgeschlagen" : "OK: " + ok + " bestanden, 0 fehlgeschlagen");
process.exit(fail ? 1 : 0);
