/* Sonderform des Endformats (Kreis/Oval, Sechseck, sonst Rechteck) – Erkennung aus gewählter Form bzw. Format.
   Namen und Schlüssel stammen aus dem echten Katalog (Komplett-Check 23.11.2026: „Viereck mit abgerundeten Ecken“ wurde im Designer als Oval
   gezeichnet, „Rund Ø 85 mm“ als Rechteck, Sechseck-Fotoplatten als Rechteck). Designer (shapeOfSel) und Shop (shapeNow in app.js) müssen
   dieselben Regeln haben. Start: node test/print-shape.test.js */
"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path");
const des = fs.readFileSync(path.join(__dirname, "..", "print", "designer.js"), "utf8");
const m = /function shapeOfSel\(opts\) \{[\s\S]*?\n  \}/.exec(des);
let ok = 0, fail = 0;
const t = (name, fn) => { try { fn(); ok++; } catch (e) { fail++; console.log("✗ " + name + ": " + e.message); } };
t("shapeOfSel im Designer vorhanden", () => { assert.ok(m, "Funktion nicht gefunden"); });
const shapeOfSel = m ? new Function(m[0] + "; return shapeOfSel;")() : () => "?";
const S = (shape, shapeName, size, sizeName) => shapeOfSel({ sel: Object.assign({}, shape ? { shape } : {}, size ? { size } : {}), labels: [].concat(shape ? [["shape", shapeName]] : [], size ? [["size", sizeName]] : []) });
const CASES = [
  // Bierdeckel: die Form entscheidet
  ["square_beer", "Viereck mit abgerundeten Ecken", "85_x_55_mm_rectangle", "85 × 55 mm (mit rechteckigen Ecken)", ""],
  ["square_beer", "Viereck mit abgerundeten Ecken", "93_x_93_mm", "Quadratisch 93 mm (mit abgerundeten Ecken)", ""],
  ["circle_beer", "Rund", "100_mm_circle", "Rund Ø 100 mm", "round"],
  ["oval_beer", "Oval", "oval_beer", "Oval - 125 × 95 mm", "round"],
  ["double_circle_beer", "Doppelter runder Bierdeckel", "double_circle_beer_mat", "Doppelter runder Bierdeckel - 160 × 90 mm", ""],
  ["heart_beer", "Herzförmig", "heart_beer_mat", "Herzförmiger Bierdeckel - 118 × 117 mm", ""],
  ["bottle_cap_contour_beer", "Kronkorken-Form", "bottle_cap_beer_mat", "Bierdeckel Kronkorkenform - 100 × 100 mm", ""],
  ["modern_beer", "Bierdeckel in moderner Form", "modern_beer_mat", "Moderne Form – 100 × 100 mm", ""],
  ["custom_shape", "Eigene Form", "custom", "Eigenes Format", ""],
  // Aufkleber
  ["circle_sticker", "Rund oder Oval (1 Kontur)", "custom", "Eigenes Format", "round"],
  ["custom_shape_sticker", "Eigene Form (1 Kontur mit abgerundeten Ecken)", "custom", "Eigenes Format", ""],
  ["rectangle_sticker", "Rechteck oder Quadrat", "custom", "Eigenes Format", ""],
  // Lesezeichen, Saatpapier
  ["rectangle", "Rechteckig", "custom", "Eigenes Format", ""],
  ["circle", "Rund", "custom", "Eigenes Format", "round"],
  // ohne Form-Option entscheidet das Format
  ["", "", "round_85mm", "Rund Ø 85 mm", "round"],
  ["", "", "rond_small", "Rund klein Ø 45 mm", "round"],
  ["", "", "oval_small", "Oval Klein - 48 × 70 mm", "round"],
  ["", "", "circle_15_cm", "Kreis 15 cm", "round"],
  ["", "", "round_152_cm", "Rund 152 cm", "round"],
  ["", "", "hexagon_15_cm_width", "Sechseck 15 cm breit", "hex"],
  ["", "", "bunting_flag_round_bottom", "Runde Unterseite - 150 × 210 mm - 4 Flaggen pro Meter", ""],
  ["", "", "bunting_flag_circle", "Rund - 200 × 200 mm - 3 Flaggen pro Meter", "round"],
  ["", "", "a5", "A5 - 148 × 210 mm", ""],
  ["", "", "85_x_55_mm_rounded_corners", "85 × 55 mm (mit abgerundeten Ecken)", ""],
  ["", "", "wrap_around", "Rundum bedruckt 200 × 90 mm", ""],
  ["", "", "", "", ""]
];
CASES.forEach(c => t((c[1] || "–") + " / " + (c[3] || "–") + " → " + (c[4] || "Rechteck"), () => { assert.strictEqual(S(c[0], c[1], c[2], c[3]), c[4]); }));
t("Designer zeichnet Kreis, Sechseck und Rechteck über trimPath", () => { assert.ok(/function trimPath\(ctx, T, d\)/.test(des)); assert.ok(/D\.shape === "hex"/.test(des) && /D\.shape === "round"/.test(des)); assert.ok(!/round: \/rund\|round\|kreis\|circle\/i/.test(des), "alte Erkennung noch da"); });
t("Textil ohne Oberteil-Foto (Schürze, Cap, Weste, Decke): neutrale Ansicht statt T-Shirt", () => {
  assert.ok(/if \(k === "other"\) return "other";/.test(des), "texKind kennt other nicht"); assert.ok(/if \(k === "other"\) return \{ view: "front", ax: -w \/ 2, ay: 0 \};/.test(des), "texPlace ohne other");
  assert.ok(/if \(texKind\(\) === "other"\) \{ var pd = /.test(des), "garmentBox ohne other"); assert.ok(/Ansicht ohne Produktfoto/.test(des));
});
t("Maße im Designer mit Komma (mmT)", () => { assert.ok(/mmT\(D\.mm\.w\) \+ " × " \+ mmT\(D\.mm\.h\) \+ " mm · Beschnitt " \+ mmT\(D\.b\)/.test(des)); });
// gleiche Regeln im Shop (app.js) – beim Aufruf mit SKIP_APP=1 ausgelassen
if (!process.env.SKIP_APP) t("Shop (shapeNow) hat dieselben Regeln wie der Designer", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "print", "app.js"), "utf8");
  const rx = /\/hexagon\|sechseck\/i\.test\(sh \+ " " \+ sz\) \? "hex" : (\/.*?\/i)\.test\(t\) && !(\/.*?\/i)\.test\(t\) \? "round" : ""/, a = rx.exec(app), d = rx.exec(des);
  assert.ok(a, "shapeNow in app.js nicht gefunden"); assert.ok(d); assert.strictEqual(a[1], d[1]); assert.strictEqual(a[2], d[2]);
  /* Schürzen, Caps, Westen, Decken … bekommen im Shop die Art "other" (kein T-Shirt-Foto) */
  const km = /kind: (\/.*?\/)\.test\(k\) \? "other"/.exec(app); assert.ok(km, "Textil-Art other fehlt in app.js"); const rxK = new RegExp(km[1].slice(1, -1));
  ["grillschürzen", "latzschürzen basic", "base caps", "trucker caps", "fleecedecken", "safety vest", "sicherheitsweste für kinder", "trainingsweste"].forEach(x => assert.ok(rxK.test(x), x + " sollte other sein"));
  ["t-shirt basic (fruit of the loom)", "hoodie stanley/stella cruiser 2.0", "polo premium", "clique basic active t", "sol's sporty", "sweater budget", "zip hoodie"].forEach(x => assert.ok(!rxK.test(x), x + " darf nicht other sein"));
});
console.log(fail ? "FEHLER: " + ok + " bestanden, " + fail + " fehlgeschlagen" : "OK: " + ok + " bestanden, 0 fehlgeschlagen");
process.exit(fail ? 1 : 0);
