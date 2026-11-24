/* Druckshop: nicht eingebettete Standardschriften maßgleich einbetten (print-fontfix.js, Simon 20.11.2026, D-261119-CTMM).
   Prüft: Namenszuordnung, Einbettung nur bei exakt gleichen Breiten aller gedruckten Zeichen, keine Änderung bei Abweichung,
   ungenutzte Schriften bleiben unberührt, eingebettete Schriften bleiben unberührt. Testdaten fiktiv. */
"use strict";
const assert = require("assert");
const path = require("path");
const F = require(path.join(__dirname, "..", "print-fontfix.js"));
const PL = require("pdf-lib");
const { PDFDocument, StandardFonts, PDFName, PDFDict } = PL;

let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }

async function mk(draw) { const d = await PDFDocument.create(); const p = d.addPage([420, 595]); await draw(d, p); return Buffer.from(await d.save({ useObjectStreams: false })); }
async function fontsOf(buf) {
  const d = await PDFDocument.load(buf), out = [];
  for (const [, o] of d.context.enumerateIndirectObjects()) {
    if (!(o instanceof PDFDict) || String(o.get(PDFName.of("Type"))) !== "/Font") continue;
    const fd = o.lookup(PDFName.of("FontDescriptor"));
    out.push({ base: String(o.get(PDFName.of("BaseFont"))).slice(1), sub: String(o.get(PDFName.of("Subtype"))).slice(1), emb: !!(fd && (fd.get(PDFName.of("FontFile2")) || fd.get(PDFName.of("FontFile")) || fd.get(PDFName.of("FontFile3")))) });
  }
  return out;
}

(async () => {
  await t("Namen: nur eindeutige, maßgleiche Familien", async () => {
    const ok = { "Helvetica": "helvetica", "Helvetica-BoldOblique": "helvetica", "ArialMT": "arial", "Arial,Bold": "arial", "ABCDEF+Arial-BoldItalicMT": "arial", "TimesNewRomanPSMT": "timesnewroman", "Times-Roman": "times", "CourierNewPS-BoldMT": "couriernew", "Calibri-Italic": "calibri", "Cambria": "cambria" };
    for (const [n, fam] of Object.entries(ok)) { const m = F.matchName(n); assert.ok(m, n); assert.strictEqual(m.fam, fam, n); }
    assert.strictEqual(F.matchName("Helvetica-Bold").style, 1); assert.strictEqual(F.matchName("Arial-ItalicMT").style, 2); assert.strictEqual(F.matchName("Times-BoldItalic").style, 3);
    for (const n of ["HelveticaNeue", "HelveticaNeue-Bold", "Arial-Black", "ArialNarrow", "Arial-Narrow", "CambriaMath", "Calibri-Light", "Symbol", "ZapfDingbats", "Futura"]) assert.strictEqual(F.matchName(n), null, n);
  });

  await t("Helvetica + Helvetica-Bold im Text → Nimbus Sans eingebettet, auch mit · € ä ß", async () => {
    const buf = await mk(async (d, p) => {
      const h = await d.embedFont(StandardFonts.Helvetica), hb = await d.embedFont(StandardFonts.HelveticaBold);
      p.drawText("Baklava · 3 Stück 4,00 € Größe", { x: 20, y: 500, size: 8, font: h });
      p.drawText("DESSERT", { x: 20, y: 520, size: 9, font: hb });
    });
    const before = await fontsOf(buf); assert.ok(before.every(f => !f.emb));
    const r = await F.embedStdFonts(buf);
    assert.deepStrictEqual(r.replaced.map(x => x.name).sort(), ["Helvetica", "Helvetica-Bold"]);
    const after = await fontsOf(r.buf);
    assert.ok(after.every(f => f.emb && f.sub === "TrueType"), JSON.stringify(after));
    assert.deepStrictEqual(after.map(f => f.base).sort(), ["NimbusSans-Bold", "NimbusSans-Regular"]);
    const plan = await F.planStdFonts(buf); assert.strictEqual(plan.replaced.length, 2);
    const again = await F.embedStdFonts(r.buf); assert.strictEqual(again.replaced.length, 0); assert.strictEqual(again.buf, r.buf);   // schon eingebettet → unverändert
  });

  await t("Times-Roman und Courier → Nimbus Roman / Nimbus Mono", async () => {
    const buf = await mk(async (d, p) => {
      p.drawText("Speisekarte Seite 1", { x: 20, y: 500, size: 8, font: await d.embedFont(StandardFonts.TimesRoman) });
      p.drawText("Tisch 12", { x: 20, y: 480, size: 8, font: await d.embedFont(StandardFonts.Courier) });
    });
    const r = await F.embedStdFonts(buf);
    assert.deepStrictEqual((await fontsOf(r.buf)).map(f => f.base).sort(), ["NimbusMonoPS-Regular", "NimbusRoman-Regular"]);
  });

  await t("Arial mit eigenen Breiten: Liberation Sans nur bei exakt gleichen Breiten", async () => {
    const make = async (bump) => {
      const buf = await mk(async (d, p) => { p.drawText("Pizza Margherita 10,50", { x: 20, y: 500, size: 8, font: await d.embedFont(StandardFonts.Helvetica) }); });
      const d = await PDFDocument.load(buf);
      for (const [, o] of d.context.enumerateIndirectObjects()) if (o instanceof PDFDict && String(o.get(PDFName.of("Type"))) === "/Font") {
        o.set(PDFName.of("BaseFont"), PDFName.of("ArialMT"));
        const fnt = await PDFDocument.create(); const ws = []; const sf = require("@pdf-lib/standard-fonts"); const H = sf.Font.load("Helvetica"); const win = sf.Encodings.WinAnsi;
        for (let c = 32; c < 256; c++) { const e = Object.values(win.unicodeMappings).find(v => v[0] === c); let w = e ? (H.getWidthOfGlyph(e[1]) || 0) : 0; if (c === 97) w += bump; ws.push(w); }   // „a“ ggf. absichtlich verfälscht
        o.set(PDFName.of("FirstChar"), d.context.obj(32)); o.set(PDFName.of("LastChar"), d.context.obj(255)); o.set(PDFName.of("Widths"), d.context.obj(ws));
      }
      return Buffer.from(await d.save({ useObjectStreams: false }));
    };
    const good = await F.embedStdFonts(await make(0));
    assert.deepStrictEqual((await fontsOf(good.buf)).map(f => f.base), ["LiberationSans"]);
    const badIn = await make(40), bad = await F.embedStdFonts(badIn);
    assert.strictEqual(bad.replaced.length, 0); assert.strictEqual(bad.buf, badIn);
    assert.ok(/anders breit/.test(bad.skipped[0].reason), bad.skipped[0].reason);
    // ≥ 95 % → als „fast gleich“ gemeldet (Vergleich im Cockpit), eingebettet erst mit Freigabe
    assert.strictEqual(bad.near.length, 1); assert.strictEqual(bad.near[0].name, "ArialMT"); assert.ok(bad.near[0].score >= 0.95 && bad.near[0].score < 1, String(bad.near[0].score));
    assert.deepStrictEqual(bad.near[0].diffs.map(x => x.ch), ["a"]);
    const ok2 = await F.embedStdFonts(badIn, { allowNear: ["ArialMT"] });
    assert.strictEqual(ok2.replaced.length, 1); assert.strictEqual(ok2.replaced[0].approved, true);
    assert.ok((await fontsOf(ok2.buf)).every(f => f.emb));
    const other = await F.embedStdFonts(badIn, { allowNear: ["Helvetica"] }); assert.strictEqual(other.replaced.length, 0);   // Freigabe gilt nur für die genannte Schrift
    // deutlich anders (< 95 %) → kein Vergleich, bleibt Warnung
    const far = await F.embedStdFonts(await make(900)); assert.strictEqual(far.near.length, 0); assert.strictEqual(far.replaced.length, 0);
  });

  await t("Nicht benutzte Schrift wird nicht angefasst (übernimmt dropUnusedFonts)", async () => {
    const buf = await mk(async (d, p) => { await d.embedFont(StandardFonts.Helvetica); p.drawRectangle({ x: 10, y: 10, width: 50, height: 50 }); });
    const r = await F.embedStdFonts(buf); assert.strictEqual(r.replaced.length, 0); assert.strictEqual(r.buf, buf);
  });

  await t("Text in Formular-XObjects (eingebettete Seiten) wird erkannt", async () => {
    const inner = await mk(async (d, p) => { p.drawText("Zustellservice", { x: 20, y: 500, size: 8, font: await d.embedFont(StandardFonts.HelveticaBold) }); });
    const d = await PDFDocument.create(); const [ep] = await d.embedPdf(inner); const p = d.addPage([430, 605]); p.drawPage(ep, { x: 5, y: 5 }); p.drawPage(ep, { x: -400, y: 5, xScale: -1 });
    const buf = Buffer.from(await d.save({ useObjectStreams: false }));
    const r = await F.embedStdFonts(buf);
    assert.deepStrictEqual(r.replaced.map(x => x.name), ["Helvetica-Bold"]);
    assert.ok((await fontsOf(r.buf)).every(f => f.emb));
  });

  await t("Lexer: Strings mit Klammern, Escapes, Hex und Inline-Bild", async () => {
    const seen = [];
    F._lexOps("BT /F1 8 Tf (a\\(b\\)c) Tj [(x) -20 <4142>] TJ ET BI /W 1 /H 1 ID \x00\x01EI\n BT (z) Tj ET", (op, a) => { if (op === "Tj" || op === "TJ") seen.push(JSON.stringify(a.map(x => x.s || (x.a && x.a.map(y => y.s || y.v))))); });
    assert.deepStrictEqual(seen, ['[[97,40,98,41,99]]', '[[[120],-20,[65,66]]]', '[[122]]']);
  });

  // Simon 24.11.2026 (Visitenkarte): Schrift in eigenem leeren BT-Block gesetzt + „•“ als Code 127 → gilt als benutzt und wird eingebettet
  await t("Tf in eigenem BT/ET-Block + Aufzählungspunkt \\177", async () => {
    const d = await PDFDocument.create(), p = d.addPage([240, 156]), ctx = d.context;
    const f1 = ctx.register(ctx.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica", Encoding: "WinAnsiEncoding" })), f2 = ctx.register(ctx.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica-Bold", Encoding: "WinAnsiEncoding" }));
    p.node.set(PDFName.of("Resources"), ctx.obj({ Font: { F1: f1, F2: f2 } }));
    const cs = "BT /F1 12 Tf 14.4 TL ET\nBT /F2 16 Tf 19.2 TL ET\nBT 1 0 0 1 60 128 Tm (MUSTER) Tj T* ET\nBT /F1 5.4 Tf 6.48 TL ET\nBT 1 0 0 1 78 120 Tm (A \\177 B \\344) Tj T* ET\n";
    p.node.set(PDFName.of("Contents"), ctx.register(ctx.flateStream(Buffer.from(cs, "latin1"))));
    const buf = Buffer.from(await d.save({ useObjectStreams: false }));
    const u = await F.usedFontRefs(buf); assert.strictEqual(u.size, 2, "beide Schriften drucken Text");
    const r = await F.embedStdFonts(buf); assert.deepStrictEqual(r.replaced.map(x => x.name).sort(), ["Helvetica", "Helvetica-Bold"], JSON.stringify(r.skipped));
    assert.ok((await fontsOf(r.buf)).every(f => f.emb), "alles eingebettet");
  });

  console.log(fail ? "FEHLER: " + pass + " bestanden, " + fail + " fehlgeschlagen\n  " + fails.join("\n  ") : "OK: " + pass + " bestanden, 0 fehlgeschlagen");
  process.exit(fail ? 1 : 0);
})();
