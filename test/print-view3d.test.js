/* 3D-Vorschau (print/view3d.js): Klappmodell je Falzart – Felder, Scharniere und Titel-Feld passen zur Falzgeometrie (print-fold.js).
   Nur das Modell (ohne WebGL). Start: node test/print-view3d.test.js */
"use strict";
const assert = require("assert");
global.window = {}; global.document = { createElement() { return { getContext() { return null; }, style: {} }; }, head: { appendChild() {} }, documentElement: { contains() { return true; } } };
require("../print/view3d.js");
const P = global.window.PS3D, { foldSpec } = require("../print-fold.js");
let ok = 0, fail = 0;
const t = (name, fn) => { try { fn(); ok++; } catch (e) { fail++; console.log("✗ " + name + ": " + e.message); } };
const ALL = ["single_4", "singlehorizontal_4", "wikkel_6", "wikkel_8", "wikkel_10", "zigzag_6", "zigzag_8", "zigzag_10", "luik_6", "luik_8", "cross_8", "halffold_8", "zigzagcross_12", "zigzagcross_16", "zigzagcross_20", "zigzagcross_24", "zigzagcross_30"];
const near = (a, b) => Math.abs(a - b) < 0.11;

t("Schnittstelle", () => { assert.ok(P && typeof P.mount === "function" && typeof P._model === "function" && typeof P.supported === "function"); });
ALL.forEach(s => t(s + ": Felder, Scharniere, Titel", () => {
  const f = foldSpec(s, 105, 148), W = f.open.w, H = f.open.h, m = P._model(f, W, H), ps = m.panels, n = (f.x.length + 1) * (f.y.length + 1);
  assert.strictEqual(ps.length, n, "ein Feld je Zelle");
  assert.ok(near(ps.reduce((a, p) => a + (p.x1 - p.x0) * (p.y1 - p.y0), 0), W * H) || Math.abs(ps.reduce((a, p) => a + (p.x1 - p.x0) * (p.y1 - p.y0), 0) - W * H) < W * 0.2, "Felder decken den Bogen");
  assert.strictEqual(ps.filter(p => p.parent === -1).length, 1, "genau ein festes Feld");
  ps.forEach((p, i) => { assert.ok(p.x1 > p.x0 && p.y1 > p.y0 && p.x0 >= -0.01 && p.x1 <= W + 0.01 && p.y0 >= -0.01 && p.y1 <= H + 0.01, "Feld im Bogen");
    if (p.parent === -1) return; assert.ok(p.parent >= 0 && p.parent < n && p.parent !== i, "Elternfeld"); const h = p.h, q = ps[p.parent]; assert.ok(h, "Scharnier");
    /* Scharnier liegt auf einer Falzlinie und auf der gemeinsamen Kante von Feld und Elternfeld */
    if (h.v) { assert.ok(f.x.some(x => near(x, h.pos)), "Falzlinie x " + h.pos); assert.ok((near(p.x0, h.pos) && near(q.x1, h.pos)) || (near(p.x1, h.pos) && near(q.x0, h.pos)), "gemeinsame Kante"); }
    else { assert.ok(f.y.some(y => near(y, h.pos)), "Falzlinie y " + h.pos); assert.ok((near(p.y0, h.pos) && near(q.y1, h.pos)) || (near(p.y1, h.pos) && near(q.y0, h.pos)), "gemeinsame Kante"); }
    assert.ok(h.t1 > h.t0 && h.t0 >= 0 && h.t1 <= 1.0001, "Klappbereich"); assert.ok(h.mt === 1 || h.mt === -1, "Berg/Tal"); });
  /* kein Kreis: jedes Feld erreicht das feste Feld */
  ps.forEach((p, i) => { let k = i, st = 0; while (ps[k].parent !== -1) { k = ps[k].parent; assert.ok(++st <= n, "Kette endet"); } });
  /* das feste Feld ist die Titelseite (Fensterfalz 6-seitig: die Mitte, der Titel sind die beiden Türen) */
  const root = ps.find(p => p.parent === -1), cols = f.x.length + 1, cells = P._cells(f, 0, W, H);
  const hit = cells.find(c => near(c.x0, root.x0) && near(c.x1, root.x1) && near(c.y0, root.y0) && near(c.y1, root.y1)); assert.ok(hit, "festes Feld ist eine Zelle");
  if (s !== "luik_6") assert.ok(/^Titel/.test(hit.t), "festes Feld = Titel (ist: " + hit.t + ")"); else assert.strictEqual(hit.t, "Rückseite");
  assert.ok(m.rest > 0 && m.rest <= 1, "Ruhestellung"); assert.ok(cols >= 1);
}));
t("flach (ohne Falz): ein Feld", () => { const m = P._model(null, 85, 55); assert.strictEqual(m.panels.length, 1); assert.strictEqual(m.panels[0].parent, -1); });

console.log(fail ? "FEHLER: " + ok + " bestanden, " + fail + " fehlgeschlagen" : "OK: " + ok + " bestanden, 0 fehlgeschlagen");
process.exit(fail ? 1 : 0);
