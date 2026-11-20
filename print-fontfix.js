/* Nicht eingebettete Standardschriften automatisch einbetten (Simon 20.11.2026, D-261119-CTMM: Print.com „Verarbeitung hat nicht geklappt“,
   Speisekarte mit Helvetica/Helvetica-Bold ohne Einbettung – „nimm ganz viele und ersetze sie nur wenn sie auch wirklich gleich sind“).

   Vorgehen je nicht eingebetteter Schrift (einfache Type1-/TrueType-Schriften, keine Type0/Type3/Symbol):
   1. Name muss eindeutig zu einer maßgleichen freien Schrift passen (Ordner print-fonts/):
      Helvetica/Arial → Liberation Sans, Times/Times New Roman → Liberation Serif, Courier/Courier New → Liberation Mono,
      Calibri → Carlito, Cambria → Caladea – jeweils Normal/Fett/Kursiv/Fett-Kursiv. Helvetica Neue, Arial Narrow/Black usw. werden NICHT ersetzt.
   2. Es werden alle Zeichen gesammelt, die in der Datei mit dieser Schrift wirklich gedruckt werden (Seiten, Formulare, Formularfeld-Ansichten).
   3. Ersetzt wird nur, wenn JEDES dieser Zeichen in der Ersatzschrift vorhanden und exakt gleich breit ist (±1/1000 em) – verglichen mit den
      Breiten in der PDF (/Widths) bzw. bei den 14 Standardschriften mit deren amtlichen Maßen. Sonst bleibt die Schrift unverändert.
   Die Breiten-Tabelle der PDF bleibt erhalten, Textposition und Umbrüche ändern sich dadurch nicht.
   Schriftlizenzen: Liberation (SIL OFL 1.1), Carlito/Caladea (SIL OFL 1.1) – Einbetten in PDFs erlaubt, Lizenztexte liegen in print-fonts/. */
"use strict";
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "print-fonts");
const STYLES = { regular: 0, bold: 1, italic: 2, bolditalic: 3 };
// Ersatzschriften (je 4 Schnitte: Normal, Fett, Kursiv, Fett-Kursiv). Nimbus = exakte Nachbauten der PDF-Standardschriften (URW, AGPL mit
// ausdrücklicher Erlaubnis zum Einbetten in PDFs), Liberation = maßgleich zu Arial/Times New Roman/Courier New, Carlito/Caladea = Calibri/Cambria.
const SETS = {
  nimbusSans: { files: ["NimbusSans-Regular", "NimbusSans-Bold", "NimbusSans-Italic", "NimbusSans-BoldItalic"], serif: false, fixed: false, label: "Nimbus Sans" },
  libSans: { files: ["LiberationSans-Regular", "LiberationSans-Bold", "LiberationSans-Italic", "LiberationSans-BoldItalic"], serif: false, fixed: false, label: "Liberation Sans" },
  nimbusRoman: { files: ["NimbusRoman-Regular", "NimbusRoman-Bold", "NimbusRoman-Italic", "NimbusRoman-BoldItalic"], serif: true, fixed: false, label: "Nimbus Roman" },
  libSerif: { files: ["LiberationSerif-Regular", "LiberationSerif-Bold", "LiberationSerif-Italic", "LiberationSerif-BoldItalic"], serif: true, fixed: false, label: "Liberation Serif" },
  nimbusMono: { files: ["NimbusMonoPS-Regular", "NimbusMonoPS-Bold", "NimbusMonoPS-Italic", "NimbusMonoPS-BoldItalic"], serif: true, fixed: true, label: "Nimbus Mono" },
  libMono: { files: ["LiberationMono-Regular", "LiberationMono-Bold", "LiberationMono-Italic", "LiberationMono-BoldItalic"], serif: true, fixed: true, label: "Liberation Mono" },
  carlito: { files: ["Carlito-Regular", "Carlito-Bold", "Carlito-Italic", "Carlito-BoldItalic"], serif: false, fixed: false, label: "Carlito" },
  caladea: { files: ["Caladea-Regular", "Caladea-Bold", "Caladea-Italic", "Caladea-BoldItalic"], serif: true, fixed: false, label: "Caladea" },
};
const AFM = { sans: ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"], serif: ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"], mono: ["Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"] };
// Name → Kandidaten in Reihenfolge (der erste, bei dem alle gedruckten Zeichen exakt gleich breit sind, gewinnt)
const CANDS = {
  helvetica: ["nimbusSans", "libSans"], arial: ["libSans", "nimbusSans"],
  times: ["nimbusRoman", "libSerif"], timesroman: ["nimbusRoman", "libSerif"], timesnewroman: ["libSerif", "nimbusRoman"],
  courier: ["nimbusMono", "libMono"], couriernew: ["libMono", "nimbusMono"],
  calibri: ["carlito"], cambria: ["caladea"],
};
const AFMOF = { helvetica: "sans", arial: "sans", times: "serif", timesroman: "serif", timesnewroman: "serif", courier: "mono", couriernew: "mono" };

// Schriftname → Kandidaten + Schnitt (null = kein sicherer Ersatz)
function matchName(base) {
  const n = String(base || "").replace(/^\/?([A-Z]{6}\+)?/, "").replace(/#20/g, "").toLowerCase().replace(/[\s_]/g, "");
  const m = n.match(/^(helvetica|arial|timesnewroman|timesroman|times|couriernew|courier|calibri|cambria)(ps)?(mt)?(?:[-,](.*))?$/);
  if (!m) return null;
  const fam = m[1];
  let st = (m[4] || "").replace(/[-,]/g, "").replace(/(ps)?mt$/, "").replace(/^ps/, "");
  if (m[1] === "timesroman" && !st) st = "regular";
  st = st.replace(/oblique/g, "italic").replace(/^(regular|roman|book|normal)$/, "regular").replace(/^italicbold$/, "bolditalic");
  if (st === "") st = "regular";
  if (!(st in STYLES)) return null;   // z. B. Arial-Narrow, Arial-Black, HelveticaNeue … → nicht ersetzen
  return { fam, style: STYLES[st] };
}

// Glyphennamen ↔ Unicode / Codes (WinAnsi aus pdf-lib, StandardEncoding nach PDF-Referenz Anhang D)
let TABLES = null;
function tables() {
  if (TABLES) return TABLES;
  const sf = require("@pdf-lib/standard-fonts");
  const name2u = {}, win = {};
  for (const [u, [code, name]] of Object.entries(sf.Encodings.WinAnsi.unicodeMappings)) { if (!(name in name2u)) name2u[name] = +u; if (!(code in win)) win[code] = name; }
  Object.assign(name2u, { fi: 0xFB01, fl: 0xFB02, fraction: 0x2044, dotlessi: 0x131, Lslash: 0x141, lslash: 0x142, hungarumlaut: 0x2DD, ogonek: 0x2DB, caron: 0x2C7, breve: 0x2D8, dotaccent: 0x2D9, ring: 0x2DA, quotesingle: 0x27, grave: 0x60, florin: 0x192, minus: 0x2212, Euro: 0x20AC, nbspace: 0xA0, sfthyphen: 0xAD });
  const std = {};
  for (let c = 32; c < 127; c++) std[c] = win[c];
  std[39] = "quoteright"; std[96] = "quoteleft";
  const hi = { 161: "exclamdown", 162: "cent", 163: "sterling", 164: "fraction", 165: "yen", 166: "florin", 167: "section", 168: "currency", 169: "quotesingle", 170: "quotedblleft", 171: "guillemotleft", 172: "guilsinglleft", 173: "guilsinglright", 174: "fi", 175: "fl", 177: "endash", 178: "dagger", 179: "daggerdbl", 180: "periodcentered", 182: "paragraph", 183: "bullet", 184: "quotesinglbase", 185: "quotedblbase", 186: "quotedblright", 187: "guillemotright", 188: "ellipsis", 189: "perthousand", 191: "questiondown", 193: "grave", 194: "acute", 195: "circumflex", 196: "tilde", 197: "macron", 198: "breve", 199: "dotaccent", 200: "dieresis", 202: "ring", 203: "cedilla", 205: "hungarumlaut", 206: "ogonek", 207: "caron", 208: "emdash", 225: "AE", 227: "ordfeminine", 232: "Lslash", 233: "Oslash", 234: "OE", 235: "ordmasculine", 241: "ae", 245: "dotlessi", 248: "lslash", 249: "oslash", 250: "oe", 251: "germandbls" };
  Object.assign(std, hi);
  const afm = {};
  TABLES = { name2u, win, std, sf, afm };
  return TABLES;
}
function afmFont(name) { const t = tables(); return t.afm[name] || (t.afm[name] = t.sf.Font.load(name)); }

const FONTS = {};
function loadFont(file) {
  if (FONTS[file]) return FONTS[file];
  const bytes = fs.readFileSync(path.join(DIR, file + ".ttf"));
  const f = require("fontkit").create(bytes);
  return (FONTS[file] = { bytes, f, upm: f.unitsPerEm });
}
function subWidth(sub, u) { const g = sub.f.glyphForCodePoint(u); return g && g.id ? g.advanceWidth * 1000 / sub.upm : null; }

// ---- Inhalts-Streams lesen: welche Codes werden mit welcher Schrift gedruckt? ----
function lexOps(txt, onOp) {
  const n = txt.length, st = [];
  let i = 0, arr = null;
  const isWs = c => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
  const isDelim = c => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
  const push = v => (arr ? arr.push(v) : st.push(v));
  while (i < n) {
    const c = txt.charCodeAt(i);
    if (isWs(c)) { i++; continue; }
    if (c === 37) { while (i < n && txt[i] !== "\n" && txt[i] !== "\r") i++; continue; }   // Kommentar
    if (c === 40) {   // (Literal-String)
      let depth = 1, out = []; i++;
      while (i < n && depth) {
        const ch = txt[i];
        if (ch === "\\") { const nx = txt[i + 1]; i += 2;
          if (nx === "n") out.push(10); else if (nx === "r") out.push(13); else if (nx === "t") out.push(9); else if (nx === "b") out.push(8); else if (nx === "f") out.push(12);
          else if (nx === "\r") { if (txt[i] === "\n") i++; } else if (nx === "\n") { /* Zeilenfortsetzung */ }
          else if (nx >= "0" && nx <= "7") { let o = nx; while (o.length < 3 && txt[i] >= "0" && txt[i] <= "7") o += txt[i++]; out.push(parseInt(o, 8) & 255); }
          else if (nx !== undefined) out.push(nx.charCodeAt(0));
          continue; }
        if (ch === "(") depth++; else if (ch === ")") { depth--; if (!depth) { i++; break; } }
        out.push(ch.charCodeAt(0)); i++;
      }
      push({ s: out }); continue;
    }
    if (c === 60 && txt[i + 1] !== "<") {   // <Hex-String>
      const e = txt.indexOf(">", i); const hex = txt.slice(i + 1, e < 0 ? n : e).replace(/[^0-9a-fA-F]/g, ""); i = e < 0 ? n : e + 1;
      const out = []; for (let k = 0; k < hex.length; k += 2) out.push(parseInt((hex.slice(k, k + 2) + "0").slice(0, 2), 16));
      push({ s: out }); continue;
    }
    if (c === 60 || c === 62) { i += 2; push({ d: 1 }); continue; }   // << >> (Dicts in Operanden, z. B. BDC)
    if (c === 91) { arr = []; i++; continue; }
    if (c === 93) { const a = arr || []; arr = null; st.push({ a }); i++; continue; }
    if (c === 47) { let j = i + 1; while (j < n && !isWs(txt.charCodeAt(j)) && !isDelim(txt.charCodeAt(j))) j++; push({ n: txt.slice(i, j) }); i = j; continue; }
    let j = i; while (j < n && !isWs(txt.charCodeAt(j)) && !isDelim(txt.charCodeAt(j))) j++;
    if (j === i) { i++; continue; }
    const tok = txt.slice(i, j); i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) { push({ v: +tok }); continue; }
    if (tok === "true" || tok === "false" || tok === "null") { push({ v: 0 }); continue; }
    if (tok === "ID") {   // Inline-Bild überspringen bis EI
      const m = /EI(?=\s|$)/g; m.lastIndex = i + 1; const r = m.exec(txt); i = r ? r.index + 2 : n; st.length = 0; continue;
    }
    onOp(tok, st); st.length = 0;
  }
}

function collectUse(PL, d) {
  const { PDFName, PDFDict, PDFArray, PDFRawStream, PDFRef, decodePDFRawStream } = PL, ctx = d.context;
  const use = new Map();   // Font-Ref-String → Set(Codes)
  const seen = new Set();
  const look = x => (x instanceof PDFRef ? ctx.lookup(x) : x);
  const streamText = s => { try { return Buffer.from(decodePDFRawStream(s).decode()).toString("latin1"); } catch (e) { return null; } };
  function fontsOf(res) { const out = {}; const f = res instanceof PDFDict && look(res.get(PDFName.of("Font"))); if (f instanceof PDFDict) for (const [k, v] of f.entries()) out[k.toString()] = v instanceof PDFRef ? v.toString() : null; return out; }
  function run(txt, res) {
    const fonts = fontsOf(res); let cur = null; const stack = [];
    const add = bytes => { if (!cur || !fonts[cur]) return; let set = use.get(fonts[cur]); if (!set) use.set(fonts[cur], (set = new Set())); for (const b of bytes) set.add(b); };
    lexOps(txt, (op, a) => {
      if (op === "Tf") { const nm = a.length >= 2 && a[a.length - 2].n; if (nm) cur = nm; }
      else if (op === "q") stack.push(cur); else if (op === "Q") { if (stack.length) cur = stack.pop(); }
      else if (op === "Tj" || op === "'") { const s = a[a.length - 1]; if (s && s.s) add(s.s); }
      else if (op === "\"") { const s = a[a.length - 1]; if (s && s.s) add(s.s); }
      else if (op === "TJ") { const s = a[a.length - 1]; if (s && s.a) s.a.forEach(x => x.s && add(x.s)); }
    });
  }
  function walkForms(res, depth) {
    if (!(res instanceof PDFDict) || depth > 12) return;
    const xo = look(res.get(PDFName.of("XObject")));
    if (xo instanceof PDFDict) for (const [, v] of xo.entries()) form(v, res, depth + 1);
  }
  function form(ref, parentRes, depth) {
    const s = look(ref); if (!(s instanceof PDFRawStream)) return;
    const stn = s.dict.get(PDFName.of("Subtype")); if (!stn || stn.toString() !== "/Form") return;
    const key = ref instanceof PDFRef ? ref.toString() : null; if (key) { if (seen.has(key)) return; seen.add(key); }
    const res = look(s.dict.get(PDFName.of("Resources"))) || parentRes;
    const txt = streamText(s); if (txt != null) run(txt, res);
    walkForms(res, depth);
  }
  for (const p of d.getPages()) {
    const res = p.node.Resources();
    const c = p.node.get(PDFName.of("Contents")), co = look(c);
    const parts = co instanceof PDFArray ? co.asArray().map(look) : [co];
    const txt = parts.filter(x => x instanceof PDFRawStream).map(streamText).filter(x => x != null).join("\n");
    run(txt, res); walkForms(res, 0);
    const an = look(p.node.get(PDFName.of("Annots")));
    if (an instanceof PDFArray) for (const a of an.asArray().map(look)) {
      const ap = a instanceof PDFDict && look(a.get(PDFName.of("AP"))); const nn = ap instanceof PDFDict && ap.get(PDFName.of("N")); const nl = look(nn);
      if (nl instanceof PDFRawStream) form(nn, res, 1); else if (nl instanceof PDFDict) for (const [, v] of nl.entries()) form(v, res, 1);
    }
  }
  return use;
}

// Codes → Glyphennamen nach der Kodierung der Schrift
function encodingOf(PL, font, ctx) {
  const { PDFName, PDFDict, PDFArray, PDFNumber } = PL, t = tables();
  const e = font.lookup ? font.lookup(PDFName.of("Encoding")) : null;
  let base = "Standard", diffs = {};
  const nm = x => String(x || "").replace(/^\//, "");
  if (e && !(e instanceof PDFDict)) base = nm(e).replace(/Encoding$/, "");
  else if (e instanceof PDFDict) {
    const b = e.get(PDFName.of("BaseEncoding")); if (b) base = nm(b).replace(/Encoding$/, "");
    const df = e.lookup(PDFName.of("Differences"));
    if (df instanceof PDFArray) { let code = 0; for (const x of df.asArray()) { const v = x instanceof PDFNumber ? x.asNumber() : null; if (v != null) code = v; else { diffs[code] = nm(x); code++; } } }
  }
  const map = base === "WinAnsi" ? t.win : base === "Standard" ? t.std : null;
  if (!map) return null;   // MacRoman/eigene Kodierung → lieber nicht anfassen
  return code => diffs[code] || map[code] || null;
}

const NEAR_MIN = 0.95;   // ab 95 % Übereinstimmung: Vergleich im Cockpit, Einbetten erst nach Freigabe durch Simon
const label = (fam, style) => fam.files[style].replace(/-/, " ").replace(/Regular$/, "").trim();
function analyse(PL, d, allowNear) {
  const { PDFName, PDFDict, PDFArray, PDFNumber, PDFRef } = PL, ctx = d.context, t = tables();
  const use = collectUse(PL, d), plans = [], skipped = [], nearList = [];
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const ty = obj.get(PDFName.of("Type")); if (!ty || ty.toString() !== "/Font") continue;
    const sub = String(obj.get(PDFName.of("Subtype")) || ""); if (sub !== "/Type1" && sub !== "/TrueType" && sub !== "/MMType1") continue;
    const fd = obj.lookup(PDFName.of("FontDescriptor"));
    if (fd instanceof PDFDict && (fd.get(PDFName.of("FontFile")) || fd.get(PDFName.of("FontFile2")) || fd.get(PDFName.of("FontFile3")))) continue;   // schon eingebettet
    const baseName = String(obj.get(PDFName.of("BaseFont")) || "?").replace(/^\/([A-Z]{6}\+)?/, "");
    const codes = use.get(ref.toString());
    if (!codes || !codes.size) continue;   // nicht benutzt → übernimmt dropUnusedFonts
    const m = matchName(baseName); if (!m) { skipped.push({ name: baseName, reason: "keine maßgleiche Ersatzschrift" }); continue; }
    if (fd instanceof PDFDict) { const fl = fd.lookup(PDFName.of("Flags")); const fv = fl instanceof PDFNumber ? fl.asNumber() : 32; if ((fv & 4) && !(fv & 32)) { skipped.push({ name: baseName, reason: "Symbolschrift" }); continue; } }
    const enc = encodingOf(PL, obj, ctx); if (!enc) { skipped.push({ name: baseName, reason: "Kodierung nicht unterstützt" }); continue; }
    const fc = obj.lookup(PDFName.of("FirstChar")), wa = obj.lookup(PDFName.of("Widths"));
    const first = fc instanceof PDFNumber ? fc.asNumber() : null, widths = wa instanceof PDFArray ? wa.asArray().map(x => { const y = x instanceof PDFRef ? ctx.lookup(x) : x; return y instanceof PDFNumber ? y.asNumber() : null; }) : null;
    const afm = !widths && AFMOF[m.fam] ? afmFont(AFM[AFMOF[m.fam]][m.style]) : null;
    if (!widths && !afm) { skipped.push({ name: baseName, reason: "Breiten unbekannt" }); continue; }
    // Jeder Kandidat: exakt (alle gedruckten Zeichen ±1/1000 em) oder Übereinstimmung in % (1 − Σ|Abweichung| / Σ Breite)
    let pick = null, near = null, why = [];
    for (const key of CANDS[m.fam]) {
      const fam = SETS[key], file = fam.files[m.style];
      if (!fs.existsSync(path.join(DIR, file + ".ttf"))) { why.push(fam.label + " fehlt"); continue; }
      const sf = loadFont(file); let hard = null, sumRef = 0, sumDev = 0; const diffs = [];
      for (const code of codes) {
        const g = enc(code), u = g && t.name2u[g];
        if (!g || u == null) { hard = "Zeichen " + code + " ohne Zuordnung"; break; }
        const ref0 = widths ? (first != null && code >= first && code - first < widths.length ? widths[code - first] : null) : afm.getWidthOfGlyph(g);
        if (ref0 == null) { hard = "Breite für „" + String.fromCodePoint(u) + "“ fehlt"; break; }
        const w = subWidth(sf, u);
        if (w == null) { hard = "„" + String.fromCodePoint(u) + "“ fehlt in " + fam.label; break; }
        sumRef += Math.max(ref0, 1); const dv = Math.abs(w - ref0);
        if (dv > 1) { sumDev += dv; diffs.push({ ch: String.fromCodePoint(u), ref: Math.round(ref0), sub: Math.round(w) }); }
      }
      if (hard) { why.push(fam.label + ": " + hard); continue; }
      if (!diffs.length) { pick = { fam, file }; break; }
      const score = Math.max(0, 1 - sumDev / (sumRef || 1));
      why.push(fam.label + ": " + diffs.slice(0, 4).map(x => "„" + x.ch + "“ " + x.ref + " statt " + x.sub).join(", ") + " anders breit (" + Math.floor(score * 100) + " %)");
      if (!near || score > near.score) near = { fam, file, score, diffs };
    }
    if (pick) { plans.push({ ref, obj, fd, baseName, fam: pick.fam, style: m.style, file: pick.file, enc, widths, first, afm, codes }); continue; }
    if (near && near.score >= NEAR_MIN) {
      const n = { name: baseName, with: label(near.fam, m.style), score: near.score, diffs: near.diffs };
      if (allowNear && (allowNear === true || allowNear.indexOf(baseName) >= 0)) { plans.push({ ref, obj, fd, baseName, fam: near.fam, style: m.style, file: near.file, enc, widths, first, afm, codes, near: n }); continue; }
      nearList.push(n);
    }
    skipped.push({ name: baseName, reason: why.join("; ") || "keine Ersatzschrift" });
  }
  return { plans, skipped, near: nearList };
}

// opts.allowNear: true oder Liste von Schriftnamen, die Simon nach dem Vergleich freigegeben hat (≥ 95 %, nicht exakt)
async function embedStdFonts(buf, opts) {
  if (!buf || buf.length > 60e6) return { buf, replaced: [], skipped: [], near: [] };
  const PL = require("pdf-lib"), { PDFDocument, PDFName, PDFNumber, PDFString } = PL;
  const d = await PDFDocument.load(buf, { updateMetadata: false }), ctx = d.context, t = tables();
  const { plans, skipped, near } = analyse(PL, d, opts && opts.allowNear);
  if (!plans.length) return { buf, replaced: [], skipped, near };
  const files = {};   // je Ersatzschrift ein gemeinsamer FontFile2-Stream + Deskriptor
  for (const p of plans) {
    const sf = loadFont(p.file), f = sf.f, s = 1000 / sf.upm, fam = p.fam;
    if (!files[p.file]) {
      const stream = ctx.flateStream(sf.bytes, { Length1: sf.bytes.length });
      const bb = f.bbox, italic = p.style >= 2;
      const flags = 32 | (fam.fixed ? 1 : 0) | (fam.serif ? 2 : 0) | (italic ? 64 : 0);
      const desc = ctx.obj({ Type: "FontDescriptor", FontName: f.postscriptName, Flags: flags, FontBBox: [Math.round(bb.minX * s), Math.round(bb.minY * s), Math.round(bb.maxX * s), Math.round(bb.maxY * s)],
        ItalicAngle: f.italicAngle || 0, Ascent: Math.round(f.ascent * s), Descent: Math.round(f.descent * s), CapHeight: Math.round((f.capHeight || f.ascent * 0.7) * s), StemV: p.style % 2 ? 120 : 80 });
      desc.set(PDFName.of("FontFile2"), ctx.register(stream));
      files[p.file] = { desc: ctx.register(desc), ps: f.postscriptName };
    }
    // Kodierung: WinAnsi als Basis, abweichende Glyphennamen als Differences (damit der Viewer über Unicode die richtige Glyphe findet)
    const diffs = []; let last = -2;
    for (let c = 32; c < 256; c++) { const g = p.enc(c); if (!g || g === t.win[c] || t.name2u[g] == null) continue; if (c !== last + 1) diffs.push(c); diffs.push(PDFName.of(g)); last = c; }
    const encDict = ctx.obj({ Type: "Encoding", BaseEncoding: "WinAnsiEncoding" }); if (diffs.length) encDict.set(PDFName.of("Differences"), ctx.obj(diffs));
    let first = p.first, widths = p.widths;
    if (!widths) { first = 32; widths = []; for (let c = 32; c < 256; c++) { const g = p.enc(c), w = g && p.afm.getWidthOfGlyph(g); widths.push(w != null ? w : (g && t.name2u[g] != null ? Math.round(subWidth(sf, t.name2u[g]) || 0) : 0)); } }
    const o = p.obj;
    o.set(PDFName.of("Subtype"), PDFName.of("TrueType"));
    o.set(PDFName.of("BaseFont"), PDFName.of(files[p.file].ps));
    o.set(PDFName.of("Encoding"), ctx.register(encDict));
    o.set(PDFName.of("FirstChar"), PDFNumber.of(first));
    o.set(PDFName.of("LastChar"), PDFNumber.of(first + widths.length - 1));
    o.set(PDFName.of("Widths"), ctx.obj(widths.map(w => (w == null ? 0 : w))));
    o.set(PDFName.of("FontDescriptor"), files[p.file].desc);
    o.delete(PDFName.of("ToUnicode"));
  }
  const out = Buffer.from(await d.save({ useObjectStreams: false }));
  const replaced = [...new Map(plans.map(p => [p.baseName + "→" + p.fam.files[p.style], Object.assign({ name: p.baseName, with: label(p.fam, p.style) }, p.near ? { score: p.near.score, approved: true } : {})])).values()];
  return { buf: out, replaced, skipped, near };
}

// Nur prüfen (für die Kontrolle im Cockpit): was würde eingebettet, was nicht?
async function planStdFonts(buf) {
  if (!buf || buf.length > 60e6) return { replaced: [], skipped: [], near: [] };
  const PL = require("pdf-lib"); const d = await PL.PDFDocument.load(buf, { updateMetadata: false });
  const { plans, skipped, near } = analyse(PL, d);
  return { replaced: [...new Map(plans.map(p => [p.baseName, { name: p.baseName, with: label(p.fam, p.style) }])).values()], skipped, near };
}

module.exports = { embedStdFonts, planStdFonts, matchName, NEAR_MIN, _lexOps: lexOps };
