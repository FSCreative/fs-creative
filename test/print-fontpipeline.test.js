/* Schriften-Kette vor der Übergabe an Print.com (Simon 24.11.2026, Stadium Cutz: Text zu groß, danach „Verarbeitung hat nicht geklappt“):
   Datei wie aus einem Web-Generator (Schrift in leerem BT-Block gesetzt, „•“ als \177, Helvetica nicht eingebettet) → wie „Farben erweitern“ mehrfach
   eingebettet (je Kopie eigene Schrift-Objekte, gleiche Namen /F1 /F2) → embedStdFonts → dropUnusedFonts.
   Geprüft mit Poppler: alles eingebettet, keine Strukturfehler („Unknown font tag“), jedes Wort an gleicher Stelle in gleicher Größe. Testdaten fiktiv. */
"use strict";
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
const F = require(path.join(__dirname, "..", "print-fontfix.js"));
const PL = require("pdf-lib"), { PDFDocument, PDFName } = PL;

let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }
const has = b => { try { cp.execFileSync(b, ["-v"], { stdio: "ignore" }); return true; } catch (e) { return !!(e && e.status !== undefined && e.code !== "ENOENT"); } };
const POP = has("pdffonts") && has("pdftotext") && has("pdftoppm");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fontpipe-"));
const write = (n, b) => { const p = path.join(tmp, n); fs.writeFileSync(p, b); return p; };
const run = (b, args) => { const r = cp.spawnSync(b, args, { encoding: "utf8" }); return { out: r.stdout || "", err: r.stderr || "" }; };
function fontsOk(p) { const lines = run("pdffonts", [p]).out.split("\n").slice(2).filter(Boolean); return { n: lines.length, notEmb: lines.filter(l => !/\s(yes)\s+(yes|no)\s+(yes|no)\s+\d+\s+\d+\s*$/.test(l)) }; }
function words(p) { const x = run("pdftotext", ["-bbox", p, "-"]).out, out = []; const re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g; let m; while ((m = re.exec(x))) out.push({ w: m[5], x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4] }); return out; }
function popplerErrors(p) { return run("pdftoppm", ["-r", "40", "-png", p, path.join(tmp, "r")]).err.split("\n").filter(l => /Error|Unknown font/i.test(l)); }

// Quelle: 2 Seiten wie die Visitenkarte – Seite 1 setzt nur die Schrift (kein Text), Seite 2 druckt mit Tf in eigenem BT-Block
async function source() {
  const d = await PDFDocument.create(), ctx = d.context;
  const f1 = ctx.register(ctx.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica", Encoding: "WinAnsiEncoding" }));
  const f2 = ctx.register(ctx.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica-Bold", Encoding: "WinAnsiEncoding" }));
  const unused = ctx.register(ctx.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Times-Roman", Encoding: "WinAnsiEncoding" }));
  const mk = (cs, fonts) => { const p = d.addPage([240.94, 155.91]); p.node.set(PDFName.of("Resources"), ctx.obj({ Font: fonts })); p.node.set(PDFName.of("Contents"), ctx.register(ctx.flateStream(Buffer.from(cs, "latin1")))); };
  mk("1 0 0 1 0 0 cm  BT /F1 12 Tf 14.4 TL ET\n0.05 0.05 0.06 rg 0 0 240.94 155.91 re f\n", { F1: f1, F9: unused });
  mk("BT /F1 12 Tf 14.4 TL ET\n0.05 0.05 0.06 rg 0 0 240.94 155.91 re f\n0.96 0.96 0.97 rg\nBT /F2 16 Tf 19.2 TL ET\nBT 1 0 0 1 60.48 128.41 Tm (MUSTER STUDIO) Tj T* ET\n" +
    "BT /F1 5.4 Tf 6.48 TL ET\nBT 1 0 0 1 78.26 120.19 Tm (W I E N   \\177   S A L O N) Tj T* ET\nBT /F1 7.2 Tf 8.64 TL ET\nBT 1 0 0 1 56.69 81.92 Tm (0664 1234567 \\344\\366\\374\\337) Tj T* ET\n" +
    "BT /F2 5.7 Tf 6.84 TL ET\nBT 1 0 0 1 30 20 Tm (\\326FFNUNGSZEITEN) Tj T* ET\n", { F1: f1, F2: f2 });
  return Buffer.from(await d.save({ useObjectStreams: false }));
}
// wie „Farben erweitern“: jede Seite 9× eingebettet (8 beschnittene Randkopien + Mitte) → je Kopie eigene Schrift-Objekte mit gleichen Namen
async function bleedLike(buf) {
  const src = await PDFDocument.load(buf), out = await PDFDocument.create(), b = 4.25;
  for (const sp of src.getPages()) { const { width: W, height: H } = sp.getSize(), pg = out.addPage([W + 2 * b, H + 2 * b]);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]) { const e = await out.embedPage(sp);
      pg.pushOperators(PL.pushGraphicsState(), PL.rectangle(sx < 0 ? 0 : sx > 0 ? W + b : b, sy < 0 ? 0 : sy > 0 ? H + b : b, sx ? b : W, sy ? b : H), PL.clip(), PL.endPath());
      pg.drawPage(e, { x: b + sx * 2, y: b + sy * 2, xScale: 1, yScale: 1 }); pg.pushOperators(PL.popGraphicsState()); }
    pg.drawPage(await out.embedPage(sp), { x: b, y: b }); pg.setTrimBox(b, b, W, H); }
  return Buffer.from(await out.save({ useObjectStreams: false }));
}

(async () => {
  if (!POP) { console.log("OK: übersprungen (Poppler fehlt)"); process.exit(0); }
  const src = await source(), bled = await bleedLike(src);
  const emb = (await F.embedStdFonts(bled)).buf, fin = await F.dropUnusedFonts(emb);
  const pB = write("bled.pdf", bled), pF = write("final.pdf", fin);

  await t("Schrift-Prüfung: alle druckenden Schriften gelten als benutzt", async () => {
    const c = await F.fontCheck(bled); assert.ok(c && /automatisch durch die maßgleiche Schrift/.test(c.text), JSON.stringify(c));
    assert.ok(!/Times-Roman/.test(c.text) || /nicht verwendet/.test(c.text), "Times wird nicht gedruckt");
  });
  await t("Ergebnis: alle Schriften eingebettet, ungenutzte Times entfernt", async () => {
    const f = fontsOk(pF); assert.strictEqual(f.notEmb.length, 0, f.notEmb.join("\n")); assert.ok(!/Times/.test(run("pdffonts", [pF]).out), "Times-Roman gelöscht");
  });
  await t("Ergebnis: keine Strukturfehler (jede Tf-Schrift im eigenen Verzeichnis vorhanden)", async () => {
    assert.deepStrictEqual(popplerErrors(pF), []);
  });
  await t("Ergebnis: jedes Wort an gleicher Stelle und gleich groß wie vorher", async () => {
    const a = words(pB), b = words(pF); assert.ok(a.length >= 10, "Wörter gefunden: " + a.length); assert.strictEqual(b.length, a.length, "Anzahl Wörter");
    // x/Breite streng (falsche Größe ändert die Breite sofort); Höhe kommt bei Poppler aus Ober-/Unterlänge der Schrift (Ersatz vorher ≠ Nimbus) → Mitte ±1 pt, Höhe ±15 %
    a.forEach((w, i) => { const v = b[i]; assert.strictEqual(v.w, w.w); for (const k of ["x0", "x1"]) assert.ok(Math.abs(v[k] - w[k]) < 0.3, w.w + " " + k + ": " + w[k] + " → " + v[k]);
      assert.ok(Math.abs((v.y0 + v.y1) / 2 - (w.y0 + w.y1) / 2) < 1, w.w + " Mitte"); assert.ok(Math.abs((v.y1 - v.y0) / (w.y1 - w.y0) - 1) < 0.15, w.w + " Höhe " + (w.y1 - w.y0) + " → " + (v.y1 - v.y0)); });
    assert.ok(b.some(w => w.w === "•"), "Aufzählungspunkt"); assert.ok(b.some(w => /äöüß/.test(w.w)), "Umlaute"); assert.ok(b.some(w => w.w === "ÖFFNUNGSZEITEN"), "Ö");
  });
  await t("Ohne nicht eingebettete Schriften bleibt die Datei unverändert", async () => {
    assert.strictEqual(Buffer.compare(await F.dropUnusedFonts(fin), fin), 0);
  });
  await t("Echte ungenutzte Schrift ohne Tf: wird entfernt, Rest bleibt", async () => {
    const d = await PDFDocument.create(), ctx = d.context, p = d.addPage([100, 100]);
    const u = ctx.register(ctx.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Courier" }));
    p.node.set(PDFName.of("Resources"), ctx.obj({ Font: { F7: u } })); p.node.set(PDFName.of("Contents"), ctx.register(ctx.flateStream(Buffer.from("0 0 1 rg 10 10 50 50 re f\n", "latin1"))));
    const o = await F.dropUnusedFonts(Buffer.from(await d.save())), po = write("u.pdf", o);
    assert.ok(!/Courier/.test(run("pdffonts", [po]).out)); assert.deepStrictEqual(popplerErrors(po), []);
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fail ? "FEHLER: " + pass + " bestanden, " + fail + " fehlgeschlagen\n  " + fails.join("\n  ") : "OK: " + pass + " bestanden, 0 fehlgeschlagen");
  process.exit(fail ? 1 : 0);
})();
