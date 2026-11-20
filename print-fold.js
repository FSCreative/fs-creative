/* Falzgeometrie für alle gefalzten Drucksachen (Folder, Klappkarten, Menükarten, gefalzte Visitenkarten, Pläne) – eine Quelle für Preis-Antwort,
   Druckvorlage (PDF), Designer, Upload-Vorschau, Studio im Cockpit und 3D-Vorschau. Reine Rechenfunktion, eigene Datei damit sie einzeln testbar ist
   (test/print-fold.test.js).

   Print.com nennt bei gefalzten Produkten das GEFALZTE Format (z. B. „1/3 A4 – 99 × 210 mm“ = DIN-lang-Folder aus A4); Druckdaten = offenes Format.
   MILLIMETERGENAU nach Print.com (Simon 20.11.2026: „Positionierung der Falzlinien muss millimetergenau sein“), abgeglichen mit drei Quellen des Produktionspartners:
   (1) offene Bogengröße = planoWidth × planoHeight aus der Preisabfrage – für alle 11 Folder-Falzarten × 24 Formate einzeln abgefragt,
   (2) Falzpositionen = Formeln der offiziellen Editor-Overlays (SVG je Falzart, Parameter width = Bogenbreite, sides = Seiten),
   (3) Seitenfolge/Drehung = offizielle Infoblätter.
   X = volles Feld = gefalztes Endformat (die Formatbreite w). Einklappende Felder sind schmäler und VERKÜRZEN DEN BOGEN:
   - Wickelfalz 6-seitig:  außen X−2 | X | X                → Bogen 3·w − 2   (A4: 628 × 297, DIN lang 99: 295 × 210)
   - Wickelfalz 8-seitig:  außen X−3 | X−2 | X | X          → Bogen 4·w − 5   (A4: 835 × 297)
   - Wickelfalz 10-seitig: außen X−4 | X−3 | X−2 | X | X    → Bogen 5·w − 9   (A5: 731 × 210)
   - Fensterfalz 6-seitig: ½X | X | ½X                      → Bogen 2·w
   - geschlossener Fensterfalz 8-seitig: X−1 | X | X | X−1  → Bogen 4·w − 2   (A5: 590 × 210)
   - Zickzack, Einbruch, Kreuzfalz, Pläne: alle Felder gleich → Bogen = Felder × Endformat
   - Ausnahme DIN-Kante: ergibt das 296 mm (2 × 148 bzw. 4 × 74), nimmt Print.com den Bogen mit 297 mm (A4-/A3-Kante) – z. B. A5 Einbruchfalz 297 × 210,
     A5 Kreuzfalz 297 × 420, A7 Zickzack 8-seitig 297 × 105; die Falze liegen dann bei 148,5 bzw. 74,25 mm (Overlay-Formel width/2, width/4 …).
     In allen 32 abgefragten Fällen (7 Produkte) so, sonst nirgends eine Abweichung.
   (Bis 20.11.2026 stand hier bei Wickel-/geschlossenem Fensterfalz „Bogen = Felder × Endformat“ – das war 2/5/9 bzw. 2 mm zu breit, die Falzlinien lagen bis 1,3 mm daneben.)
   x/y = Falzpositionen in mm ab linker/oberer Schnittkante, gemessen auf der Außenseite (Seite 1); Innenseite gespiegelt.

   Felder je Bogenseite (cells.out / cells.in, zeilenweise von links oben, Innenseite so wie sie in der Datei liegt): t = Bezeichnung, p = Seitenzahl wie im
   offiziellen Infoblatt, r = 180 → im offenen Bogen auf dem Kopf anlegen. Lage von Titel/Rückseite, Seitenfolge und Drehung laut offiziellen Infoblättern und
   Vorlagen des Produktionspartners (alle Falzarten einzeln geprüft 20.11.2026, Simon: „100 % richtige Falzlinien … was ist Vorderseite, was innen“):
   - Kreuzfalz: Titel oben rechts, untere Reihe der Außenseite steht auf dem Kopf (erst quer, dann längs gefalzt)
   - Falz oben: Rückseite UND beide Innenseiten stehen auf dem Kopf
   - Zickzack 6-/10-seitig: die Rückseite des gefalzten Folders liegt auf der Innenseite ganz rechts; 8-seitig außen ganz links
   - Fensterfalz 6-seitig: die rechte Klappe der Außenseite ist gefalzt die LINKE Tür der Titelseite
   - Pläne (halffold/zigzagcross): Spalten im Zickzack, dann Reihen – Titel unten rechts; offenes Format = Spalten × Reihen laut offiziellen Vorlagen
   out / in = dieselben Felder als Text (für die Druckvorlage). */
"use strict";
const FOLD_NAMES = { single: "Einbruchfalz", singlehorizontal: "Einbruchfalz oben", wikkel: "Wickelfalz", zigzag: "Zickzackfalz", luik: "Fensterfalz", cross: "Kreuzfalz", halffold: "Kreuzfalz (Plan)", zigzagcross: "Zickzack-Kreuzfalz (Plan)" };
const FOLD_RX = /^(single|singlehorizontal|wikkel|zigzag|luik|cross|halffold|zigzagcross)_(\d+)$/;
const MAP_GRID = { 8: [2, 2], 12: [3, 2], 16: [4, 2], 20: [5, 2], 24: [4, 3], 30: [5, 3] };   // Pläne: Spalten × Reihen

function foldSpec(slug, w, h) {
  const m = String(slug || "").match(FOLD_RX); if (!m || !(w > 0 && h > 0)) return null;
  const t = m[1], pages = +m[2], rd = v => Math.round(v * 100) / 100, name = pages + "-seitiger " + FOLD_NAMES[t];
  const DIN = v => (v === 296 ? 297 : v);   // Bogenkante 296 mm → 297 mm wie bei Print.com (siehe oben)
  const div = (L, k) => Array(k - 1).fill(0).map((x, i) => rd(L * (i + 1) / k));   // gleich breite Felder: Falz bei k-teln der Bogenkante
  const acc = ws => { let c = 0; return ws.slice(0, -1).map(x => rd(c += x)); };
  const C = (tt, p, r) => ({ t: tt, p: p || 0, r: r || 0 }), txt = c => c.t + (c.p ? " · Seite " + c.p : "") + (c.r ? " · 180° gedreht anlegen" : "");
  const fin = o => Object.assign(o, { out: o.cells.out.map(txt), in: o.cells.in.map(txt) });
  if (t === "cross") {
    if (pages !== 8) return null;
    const W2 = DIN(2 * w), H2 = DIN(2 * h);
    return fin({ slug, name, pages, closed: { w, h }, open: { w: W2, h: H2 }, x: div(W2, 2), y: div(H2, 2),
      cells: { out: [C("Rückseite", 8), C("Titel", 1), C("Innen", 3, 180), C("Innen", 2, 180)], in: [C("Plakatseite", 4), C("Plakatseite", 5), C("Plakatseite", 6), C("Plakatseite", 7)] },
      note: "Kreuzfalz: erst quer, dann längs gefalzt – Bogen 2 × 2 Felder. Die untere Reihe der Außenseite (Seiten 3 und 2) steht im offenen Bogen auf dem Kopf." });
  }
  if (t === "halffold" || t === "zigzagcross") {
    const g = MAP_GRID[pages]; if (!g || (t === "halffold") !== (pages === 8)) return null;   // 8 Seiten gibt es nur als Kreuzfalz (halffold), Zickzack-Kreuzfalz ab 12
    const cols = g[0], rows = g[1], out = [], inn = [];
    // Titel = unten rechts (Außenseite). Rückseite des gefalzten Plans: 2 Reihen → Feld über dem Titel (auf dem Kopf); 3 Reihen → oben links
    // (bei ungerader Spaltenzahl liegt sie auf der Innenseite, dort oben rechts)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const title = r === rows - 1 && c === cols - 1, back2 = rows === 2 && r === 0 && c === cols - 1, back3o = rows === 3 && cols % 2 === 0 && r === 0 && c === 0, back3i = rows === 3 && cols % 2 === 1 && r === 0 && c === cols - 1;
      out.push(title ? C("Titel") : back2 ? C("Rückseite", 0, 180) : back3o ? C("Rückseite") : C("Außen"));
      inn.push(back3i ? C("Rückseite") : C("Plan innen"));
    }
    const WM = DIN(cols * w), HM = DIN(rows * h);
    return fin({ slug, name: pages + " Seiten – " + FOLD_NAMES[t], pages, closed: { w, h }, open: { w: WM, h: HM },
      x: div(WM, cols), y: div(HM, rows), cells: { out, in: inn },
      note: "Plan: erst in " + cols + " Spalten im Zickzack, dann " + (rows === 2 ? "einmal quer" : "in 3 Reihen im Zickzack") + " gefalzt – der Titel liegt unten rechts. Innen am besten ein Motiv über den ganzen Bogen." });
  }
  if (t === "singlehorizontal") return fin({ slug, name, pages, closed: { w, h }, open: { w, h: DIN(2 * h) }, x: [], y: div(DIN(2 * h), 2),
    cells: { out: [C("Rückseite", 4, 180), C("Titel", 1)], in: [C("Innen", 3, 180), C("Innen", 2, 180)] },
    note: "Falz oben: Die Rückseite und beide Innenseiten stehen im offenen Bogen auf dem Kopf (180° gedreht anlegen) – nach dem Aufklappen nach oben sind sie richtig herum." });
  let ws, out, inn, note = "";
  const n = t === "single" ? 2 : t === "luik" ? (pages === 6 ? 3 : pages === 8 ? 4 : 0) : pages / 2;
  if (!(n >= 2 && n <= 5 && n === Math.round(n))) return null;   // nur Falzarten mit geprüfter Geometrie (bis 10 Seiten)
  if (t === "single") { ws = [DIN(2 * w) / 2, DIN(2 * w) / 2]; out = [C("Rückseite", 4), C("Titel", 1)]; inn = [C("Innen", 2), C("Innen", 3)]; }
  else if (t === "zigzag") {
    if (n < 3) return null;
    ws = Array(n).fill(DIN(n * w) / n); note = "Zickzackfalz: alle Felder gleich breit.";
    // Seitenzahlen wie im Infoblatt: 6-seitig 5·6·1 / 2·3·4, 8-seitig 8·6·7·1 / 2·3·4·5, 10-seitig 6·7·8·9·1 / 2·3·4·5·10
    const po = { 3: [5, 6, 1], 4: [8, 6, 7, 1], 5: [6, 7, 8, 9, 1] }[n], pi = { 3: [2, 3, 4], 4: [2, 3, 4, 5], 5: [2, 3, 4, 5, 10] }[n];
    out = ws.map((x, i) => i === n - 1 ? C("Titel", 1) : n % 2 === 0 && i === 0 ? C("Rückseite", po[i]) : C("Außen", po[i]));
    inn = ws.map((x, i) => n % 2 === 1 && i === n - 1 ? C("Rückseite", pi[i]) : C("Innen", pi[i]));
    if (n % 2) note += " Die Rückseite des gefalzten Folders liegt auf der Innenseite ganz rechts (Seite " + pi[n - 1] + "), die übrigen Felder der Außenseite liegen gefalzt innen.";
  } else if (t === "wikkel") {
    if (n < 3) return null;
    // Innenseite von links: zwei volle Felder X = Endformatbreite w, dann die einklappenden Felder X−2, X−3, X−4 mm → Bogen = n·w − Σ Abzüge (2 / 5 / 9 mm).
    // Print.com-Overlay: X = (width + Σ) / (sides/2); außen Falz bei X−2, 2X−2 (6-s.) · X−3, 2X−5, 3X−5 (8-s.) · X−4, 2X−7, 3X−9, 4X−9 (10-s.); innen X, 2X, 3X−2, 4X−5
    const d = [2, 3, 4].slice(0, n - 2), X = w;
    const inside = [X, X].concat(d.map(x => X - x)); ws = inside.slice().reverse();   // Außenseite = gespiegelte Innenseite
    // Seitenzahlen wie im Infoblatt: außen von links n+2 … 2n, 1 (z. B. 5·6·1), innen 2 … n+1
    out = ws.map((x, i) => i === n - 1 ? C("Titel", 1) : i === n - 2 ? C("Rückseite", 2 * n) : C("Einklappseite außen", n + 2 + i));
    inn = inside.map((x, i) => i < 2 ? C("Innen", 2 + i) : C("Einklappseite innen", 2 + i));
    note = "Wickelfalz: einklappende Seite" + (n > 3 ? "n sind" : " ist") + " schmäler (" + d.map(x => "−" + x + " mm").join(", ") + "), der Bogen ist deshalb " + d.reduce((a, x) => a + x, 0) + " mm kürzer als " + n + " × Endformat – Texte dort entsprechend einrücken.";
  } else {   // Fensterfalz: 6-seitig ½X, X, ½X (Bogen 2·w); geschlossen 8-seitig X−1, X, X, X−1 mm mit X = w (Bogen 4·w − 2, laut Preisabfrage und Infoblatt)
    if (n !== 3 && n !== 4) return null;
    if (n === 3) { const WL = DIN(2 * w); ws = [WL / 4, WL / 2, WL / 4]; } else ws = [w - 1, w, w, w - 1];
    // 6-seitig laut Infoblatt: außen 2·6·1, innen 3·4·5
    out = n === 3 ? [C("Titel – rechte Tür", 2), C("Rückseite", 6), C("Titel – linke Tür", 1)] : [C("Klappe außen", 3), C("Rückseite", 8), C("Titel", 1), C("Klappe außen", 2)];
    inn = n === 3 ? [C("Klappe innen", 3), C("Innen Mitte", 4), C("Klappe innen", 5)] : [C("Klappe innen", 4), C("Innen", 5), C("Innen", 6), C("Klappe innen", 7)];
    note = n === 3 ? "Fensterfalz: beide Klappen sind halb so breit wie die Mitte und falzen zur Mitte – die rechte Klappe ist gefalzt die linke Tür der Titelseite." : "Geschlossener Fensterfalz: die beiden Außenklappen sind je 1 mm schmäler, der Bogen ist deshalb 2 mm kürzer als 4 × Endformat.";
  }
  return fin({ slug, name, pages, closed: { w, h }, open: { w: rd(ws.reduce((a, x) => a + x, 0)), h }, x: acc(ws), y: [], widths: ws.map(rd), cells: { out, in: inn }, note });
}

/* Falzangaben aus dem OFFENEN Format (so liegt die Druckdatei vor, z. B. im Cockpit je Auftrag): gefalztes Format zurückrechnen. Bogen = a · Endformat + b
   (b = −2/−5/−9 mm bei Wickelfalz, −2 mm beim geschlossenen Fensterfalz, sonst 0) → über zwei Stützstellen bestimmen.
   Aufträge von vor dem 20.11.2026 (Bogen damals Felder × Endformat) bekommen so Falzlinien passend zu IHRER Datei – das Endformat ist dann nicht ganzzahlig. */
function foldFromOpen(slug, ow, oh) {
  const u = foldSpec(slug, 100, 100), v = foldSpec(slug, 200, 200); if (!u || !v || !(ow > 0 && oh > 0)) return null;
  const inv = (o, o1, o2) => { const a = (o2 - o1) / 100, b = o1 - a * 100; return Math.round((o - b) / a * 1000) / 1000; };
  return foldSpec(slug, inv(ow, u.open.w, v.open.w), inv(oh, u.open.h, v.open.h));
}

module.exports = { foldSpec, foldFromOpen, FOLD_RX, FOLD_NAMES, MAP_GRID };
