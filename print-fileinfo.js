"use strict";
/* Datei-Infos für den Prüfbericht im Cockpit (Simon 11.11.2026): Original-Bild bzw. PDF technisch auslesen –
   Pixel, Auflösung (am Endformat bzw. je platziertem Bild), Farbraum + ICC-Profil, Bittiefe, PDF-Version, Ersteller,
   Schriften (eingebettet?), Sonderfarben, PDF/X-Ausgabebedingung. Nur lesen, nie verändern; Fehler → leere Felder. */
const zlib = require("zlib");

const r1 = v => Math.round(v * 10) / 10;

// ICC-Profil: Farbraum aus dem Kopf, Name aus dem „desc“-Tag (v2: desc/ASCII, v4: mluc/UTF-16BE)
function iccInfo(b) {
  try {
    if (!b || b.length < 132) return null;
    const cs = b.slice(16, 20).toString("latin1").trim(), n = b.readUInt32BE(128); let name = "";
    for (let i = 0; i < Math.min(n, 100); i++) {
      const o = 132 + i * 12; if (o + 12 > b.length) break;
      if (b.slice(o, o + 4).toString("latin1") !== "desc") continue;
      const off = b.readUInt32BE(o + 4), typ = b.slice(off, off + 4).toString("latin1");
      if (typ === "desc") { const len = b.readUInt32BE(off + 8); name = b.slice(off + 12, off + 12 + Math.max(0, len - 1)).toString("latin1"); }
      else if (typ === "mluc") { const cnt = b.readUInt32BE(off + 8); if (cnt) { const l = b.readUInt32BE(off + 20), so = b.readUInt32BE(off + 24); const raw = b.slice(off + so, off + so + l); let s = ""; for (let k = 0; k + 1 < raw.length; k += 2) s += String.fromCharCode(raw.readUInt16BE(k)); name = s; } }
      break;
    }
    return { space: cs === "GRAY" ? "Graustufen" : cs === "CMYK" ? "CMYK" : cs === "RGB" ? "RGB" : cs, name: name.replace(/\0/g, "").trim().slice(0, 80) };
  } catch (e) { return null; }
}

function jpgInfo(buf) {
  const out = { type: "JPG", w: 0, h: 0, bits: 8, comps: 0, space: "", icc: "", dpiMeta: 0, adobe: false, progressive: false };
  const icc = []; let i = 2;
  while (i + 4 < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    if (m === 0xDA || m === 0xD9) break;
    const len = buf.readUInt16BE(i + 2), seg = buf.slice(i + 4, i + 2 + len);
    if (m === 0xE0 && seg.slice(0, 5).toString("latin1") === "JFIF\0" && seg.length >= 12) { const u = seg[7], x = seg.readUInt16BE(8); if (u === 1) out.dpiMeta = x; else if (u === 2) out.dpiMeta = Math.round(x * 2.54); }
    if (m === 0xE2 && seg.slice(0, 12).toString("latin1") === "ICC_PROFILE\0") icc.push([seg[12], seg.slice(14)]);
    if (m === 0xEE && seg.slice(0, 5).toString("latin1") === "Adobe") out.adobe = true;
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) { out.bits = seg[0]; out.h = seg.readUInt16BE(1); out.w = seg.readUInt16BE(3); out.comps = seg[5]; out.progressive = m === 0xC2; }
    i += 2 + len;
  }
  out.space = out.comps === 1 ? "Graustufen" : out.comps === 4 ? "CMYK" : out.comps === 3 ? "RGB" : "";
  if (icc.length) { const p = iccInfo(Buffer.concat(icc.sort((a, b) => a[0] - b[0]).map(x => x[1]))); if (p) { out.icc = p.name; if (p.space && !out.space) out.space = p.space; } }
  return out;
}

function pngInfo(buf) {
  const out = { type: "PNG", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bits: buf[24], comps: 0, space: "", icc: "", dpiMeta: 0, alpha: false };
  const ct = buf[25]; out.space = ct === 0 || ct === 4 ? "Graustufen" : "RGB"; out.alpha = ct === 4 || ct === 6;
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i), t = buf.slice(i + 4, i + 8).toString("latin1"), d = buf.slice(i + 8, i + 8 + len);
    if (t === "iCCP") { const z = d.indexOf(0); out.icc = d.slice(0, z).toString("latin1"); try { const p = iccInfo(zlib.inflateSync(d.slice(z + 2))); if (p && p.name) out.icc = p.name; } catch (e) {} }
    if (t === "sRGB" && !out.icc) out.icc = "sRGB";
    if (t === "tRNS") out.alpha = true;
    if (t === "pHYs" && d.length >= 9 && d[8] === 1) out.dpiMeta = Math.round(d.readUInt32BE(0) * 0.0254);
    if (t === "IDAT" || t === "IEND") break;
    i += 12 + len;
  }
  return out;
}

// Inhalts-Stream lesen: q/Q, cm, Do → je platziertem Bild die tatsächliche Auflösung (px / Zoll in der Seite)
function decodeStream(PDFRawStream, s) {
  try {
    if (!(s instanceof PDFRawStream)) return null;
    const { PDFName, PDFArray } = require("pdf-lib"), f = s.dict.lookup(PDFName.of("Filter")), raw = Buffer.from(s.contents);
    const list = !f ? [] : f instanceof PDFArray ? f.asArray().map(String) : [String(f)];
    if (!list.length) return raw;
    if (list.length === 1 && list[0] === "/FlateDecode") return zlib.inflateSync(raw, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    return null;
  } catch (e) { return null; }
}
const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];

async function pdfInfo(buf) {
  const L = require("pdf-lib"), { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, PDFRef, PDFNumber } = L;
  const out = { type: "PDF", version: (buf.slice(0, 16).toString("latin1").match(/%PDF-(\d\.\d)/) || [])[1] || "", pages: 0, producer: "", creator: "", page: null, trim: null,
    spaces: [], spots: [], fonts: { total: 0, embedded: 0, missing: [] }, images: [], outputIntent: "", transparency: false, encrypted: false };
  let d; try { d = await PDFDocument.load(buf, { updateMetadata: false, ignoreEncryption: true }); } catch (e) { out.error = "PDF konnte nicht gelesen werden"; return out; }
  out.encrypted = d.isEncrypted; out.pages = d.getPageCount();
  try { out.producer = String(d.getProducer() || "").slice(0, 80); out.creator = String(d.getCreator() || "").slice(0, 80); } catch (e) {}
  const ctx = d.context, N = PDFName.of, lk = (dict, k) => { try { return dict.lookup(N(k)); } catch (e) { return null; } };
  const spaces = new Set(), spots = new Set();
  const csName = cs => {   // Farbraum-Objekt → lesbarer Name
    try {
      if (!cs) return "";
      if (cs instanceof PDFName) { const n = cs.asString().slice(1); return n === "DeviceRGB" || n === "CalRGB" ? "RGB" : n === "DeviceCMYK" ? "CMYK" : n === "DeviceGray" || n === "CalGray" ? "Graustufen" : n === "Pattern" ? "" : n; }
      if (cs instanceof PDFArray) {
        const t = String(cs.get(0)).slice(1);
        if (t === "ICCBased") { const s = ctx.lookup(cs.get(1)), n = s && s.dict && s.dict.lookup(N("N")); const k = n instanceof PDFNumber ? n.asNumber() : 3; return k === 4 ? "CMYK" : k === 1 ? "Graustufen" : "RGB"; }
        if (t === "Separation") { const nm = String(cs.get(1)).slice(1).replace(/#20/g, " "); if (!/^(All|None)$/.test(nm)) spots.add(nm); return ""; }
        if (t === "DeviceN") { const a = ctx.lookup(cs.get(1)); if (a instanceof PDFArray) for (let i = 0; i < a.size(); i++) { const nm = String(a.get(i)).slice(1).replace(/#20/g, " "); if (!/^(Cyan|Magenta|Yellow|Black|None|All)$/.test(nm)) spots.add(nm); } return ""; }
        if (t === "Indexed") return csName(ctx.lookup(cs.get(1)) || cs.get(1));
        if (t === "Lab") return "Lab";
      }
    } catch (e) {}
    return "";
  };
  // alle Objekte: Bilder, Schriften, Farbräume, Transparenzgruppen
  const imgByRef = new Map(), masks = new Set();
  for (const [, obj] of ctx.enumerateIndirectObjects()) { try { const dd = obj && obj.dict; const sm = dd && dd.get && dd.get(N("SMask")); if (sm instanceof PDFRef) masks.add(sm.toString()); } catch (e) {} }
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    try {
      const dict = obj instanceof PDFDict ? obj : obj && obj.dict instanceof PDFDict ? obj.dict : null; if (!dict) continue;
      const type = String(lk(dict, "Type") || ""), sub = String(lk(dict, "Subtype") || "");
      if (sub === "/Image") { const w = lk(dict, "Width"), h = lk(dict, "Height"), bpc = lk(dict, "BitsPerComponent"), im = lk(dict, "ImageMask");
        if ((im && String(im) === "true") || masks.has(ref.toString())) continue;
        const sp = csName(lk(dict, "ColorSpace")) || (String(lk(dict, "Filter") || "").indexOf("JPX") > -1 ? "JPEG 2000" : ""); if (sp) spaces.add(sp + " (Bilder)");
        imgByRef.set(ref.toString(), { w: w ? w.asNumber() : 0, h: h ? h.asNumber() : 0, bits: bpc ? bpc.asNumber() : 0, space: sp, smask: !!lk(dict, "SMask") }); }
      else if (type === "/Font" && sub !== "/Type0") { out.fonts.total++; const fd = lk(dict, "FontDescriptor"); const name = String(lk(dict, "BaseFont") || "").slice(1).replace(/^[A-Z]{6}\+/, "");
        if (sub === "/Type3" || (fd && (lk(fd, "FontFile") || lk(fd, "FontFile2") || lk(fd, "FontFile3")))) out.fonts.embedded++; else if (out.fonts.missing.length < 8 && name) out.fonts.missing.push(name); }
      else if (type === "/Font" && sub === "/Type0") { /* Unterschrift über DescendantFonts (CIDFont) – wird dort gezählt */ }
      else if (sub === "/CIDFontType0" || sub === "/CIDFontType2") { out.fonts.total++; const fd = lk(dict, "FontDescriptor"); const name = String(lk(dict, "BaseFont") || "").slice(1).replace(/^[A-Z]{6}\+/, "");
        if (fd && (lk(fd, "FontFile") || lk(fd, "FontFile2") || lk(fd, "FontFile3"))) out.fonts.embedded++; else if (out.fonts.missing.length < 8 && name) out.fonts.missing.push(name); }
      if (type === "/Group" || String(lk(dict, "S") || "") === "/Transparency") out.transparency = true;
      if (type === "/ExtGState") { const ca = lk(dict, "ca"), CA = lk(dict, "CA"), bm = String(lk(dict, "BM") || ""); if ((ca && ca.asNumber && ca.asNumber() < 1) || (CA && CA.asNumber && CA.asNumber() < 1) || (bm && !/Normal|Compatible/.test(bm))) out.transparency = true; }
      const csd = lk(dict, "ColorSpace"); if (csd instanceof PDFDict && !sub) for (const [, v] of csd.entries()) { const n = csName(ctx.lookup(v) || v); if (n) spaces.add(n); }
    } catch (e) {}
  }
  // Ausgabebedingung (PDF/X)
  try { const oi = d.catalog.lookup(N("OutputIntents")); if (oi instanceof PDFArray && oi.size()) { const o0 = ctx.lookup(oi.get(0)); const id = o0 && (lk(o0, "OutputConditionIdentifier") || lk(o0, "Info")); const s = String(o0 && lk(o0, "S") || "").slice(1); out.outputIntent = (s ? s.replace(/^GTS_/, "") + ": " : "") + (id ? (id.decodeText ? id.decodeText() : String(id)) : ""); } } catch (e) {}
  // Seite 1 (+2): Größe, TrimBox, platzierte Bilder mit tatsächlicher Auflösung; Vektorfarben aus dem Inhalt
  const pages = d.getPages().slice(0, 2), MM = 72 / 25.4;
  pages.forEach((pg, pi) => {
    try {
      const mb = pg.getMediaBox(), tb = pg.getTrimBox();
      if (pi === 0) { out.page = { w: r1(mb.width / MM), h: r1(mb.height / MM) }; if (Math.abs(tb.width - mb.width) > 0.5 || Math.abs(tb.height - mb.height) > 0.5) out.trim = { w: r1(tb.width / MM), h: r1(tb.height / MM) }; }
      const walk = (contents, res, base, depth) => {
        if (depth > 3 || !contents) return;
        let txt = ""; for (const s of contents) { const b = decodeStream(PDFRawStream, s); if (b) txt += b.toString("latin1") + "\n"; if (txt.length > 8e6) break; }
        if (/\b(rg|RG)\b/.test(txt) && /[\d.]+\s+[\d.]+\s+[\d.]+\s+(rg|RG)\b/.test(txt)) spaces.add("RGB");
        if (/[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+(k|K)\b/.test(txt)) spaces.add("CMYK");
        if (/(^|\s)[\d.]+\s+(g|G)(\s|$)/m.test(txt)) spaces.add("Graustufen");
        try { const csd = res && lk(res, "ColorSpace"); if (csd instanceof PDFDict) for (const [k, v] of csd.entries()) { if (new RegExp("/" + k.asString().slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+(cs|CS)\\b").test(txt)) { const n = csName(ctx.lookup(v) || v); if (n) spaces.add(n); } } } catch (e) {}
        if (/\/DeviceRGB\s+(cs|CS)\b/.test(txt)) spaces.add("RGB"); if (/\/DeviceCMYK\s+(cs|CS)\b/.test(txt)) spaces.add("CMYK"); if (/\/DeviceGray\s+(cs|CS)\b/.test(txt)) spaces.add("Graustufen");
        const xo = res && lk(res, "XObject"), stack = []; let ctm = base.slice(), nums = [];
        const re = /(-?\d*\.?\d+(?:e-?\d+)?)|\/([^\s\/\[\]()<>{}%]+)|([A-Za-z'"*]+)|(\((?:\\.|[^\\)])*\))|(<[0-9A-Fa-f\s]*>)/g; let m, lastName = "";
        while ((m = re.exec(txt))) {
          if (m[1] !== undefined) { nums.push(parseFloat(m[1])); continue; }
          if (m[2] !== undefined) { lastName = m[2]; nums = []; continue; }
          if (m[3] === undefined) { nums = []; continue; }
          const op = m[3];
          if (op === "q") stack.push(ctm.slice());
          else if (op === "Q") ctm = stack.pop() || base.slice();
          else if (op === "cm" && nums.length >= 6) ctm = mul(nums.slice(-6), ctm);
          else if (op === "BI") { const e = txt.indexOf("EI", m.index); if (e > 0) re.lastIndex = e + 2; }
          else if (op === "Do" && xo && lastName) {
            try { const ref = xo.get(N(lastName)), x = ctx.lookup(ref);
              if (x && x.dict) { const st = String(x.dict.lookup(N("Subtype")) || "");
                if (st === "/Image") { const im = imgByRef.get(String(ref)); if (im && im.w) { const sx = Math.hypot(ctm[0], ctm[1]), sy = Math.hypot(ctm[2], ctm[3]); if (sx > 0.5 && sy > 0.5 && out.images.length < 40) out.images.push({ page: pi + 1, w: im.w, h: im.h, space: im.space, mm: [r1(sx / MM), r1(sy / MM)], dpi: Math.round(Math.min(im.w / (sx / 72), im.h / (sy / 72))) }); } }
                else if (st === "/Form") { const fm = x.dict.lookup(N("Matrix")); const mx = fm instanceof PDFArray ? fm.asArray().map(v => v.asNumber ? v.asNumber() : 0) : [1, 0, 0, 1, 0, 0]; walk([x], x.dict.lookup(N("Resources")) || res, mul(mx, ctm), depth + 1); } } } catch (e) {}
          }
          nums = [];
        }
      };
      const c = pg.node.Contents(); const list = !c ? [] : c instanceof PDFArray ? c.asArray().map(r => ctx.lookup(r)) : [c];
      walk(list, pg.node.Resources(), [1, 0, 0, 1, 0, 0], 0);
    } catch (e) {}
  });
  out.spaces = Array.from(spaces).filter(Boolean); out.spots = Array.from(spots).slice(0, 10);
  return out;
}

async function fileInfo(buf, type) {
  try {
    if (!buf || !buf.length) return null;
    const t = type || (buf.slice(0, 5).toString("latin1") === "%PDF-" ? "pdf" : buf[0] === 0xFF && buf[1] === 0xD8 ? "jpg" : buf.readUInt32BE(0) === 0x89504E47 ? "png" : "");
    const base = { bytes: buf.length };
    if (t === "jpg") return Object.assign(base, jpgInfo(buf));
    if (t === "png") return Object.assign(base, pngInfo(buf));
    if (t === "pdf") return Object.assign(base, await pdfInfo(buf));
  } catch (e) { return { error: String(e.message || e).slice(0, 120) }; }
  return null;
}

/* Empfehlungen für den Profi-Datencheck: aus Datei-Infos + Prüfungen + Produkt (Format, Beschnitt, Sicherheitsabstand, empfohlene dpi) */
function recommend(info, ctx) {
  const R = [], add = (lvl, t, d) => R.push({ level: lvl, title: t, text: d || "" });
  const c = ctx || {}, D0 = c.dpi || 300, size = c.size, bleed = +c.bleed || 0, safe = c.safe != null ? +c.safe : 3;
  if (!info || info.error) { add("warn", "Datei manuell öffnen", "Die technischen Daten konnten nicht automatisch gelesen werden – bitte im Acrobat/Preview kontrollieren."); }
  const imgs = info && info.type === "PDF" ? (info.images || []) : info && info.w ? [{ dpi: c.effDpi || 0, w: info.w, h: info.h }] : [];
  const low = imgs.filter(x => x.dpi && x.dpi < Math.floor(D0 * 0.95)), vlow = low.filter(x => x.dpi < D0 * 0.5);
  if (vlow.length) add("bad", "Auflösung zu gering", (info.type === "PDF" ? vlow.length + " Bild(er)" : "Das Bild") + " nur " + Math.min.apply(null, vlow.map(x => x.dpi)) + " dpi (Ziel " + D0 + " dpi). Kunden um größere Datei bitten oder Motiv kleiner platzieren – KI-Hochskalieren nur bei Fotos, nie bei Text/Logos.");
  else if (low.length) add("warn", "Auflösung knapp", Math.min.apply(null, low.map(x => x.dpi)) + " dpi statt " + D0 + " dpi – bei Fotos meist ok, Logos/Schrift auf Schärfe prüfen (Zoom 200 %).");
  const sp = info ? (info.type === "PDF" ? info.spaces || [] : [info.space]) : [];
  if (sp.some(s => /RGB/.test(s || ""))) add("warn", "RGB → CMYK", "Enthält RGB-Farben. Beim Druck wird nach CMYK umgerechnet: leuchtendes Blau, Grün und Orange werden matter. Bei Firmenfarben CMYK-Werte vom Kunden erfragen oder Vorschau in CMYK zeigen.");
  if (info && info.type === "PDF" && info.fonts && info.fonts.total > info.fonts.embedded) add("bad", "Schriften nicht eingebettet", (info.fonts.total - info.fonts.embedded) + " Schrift(en) fehlen" + (info.fonts.missing.length ? " (" + info.fonts.missing.slice(0, 3).join(", ") + ")" : "") + " – Kunden um PDF mit eingebetteten Schriften bzw. in Pfade umgewandelt bitten.");
  if (info && info.spots && info.spots.length) { const cut = info.spots.filter(s => /cut|stanz|kontur|crease|perfo|white|weiß|weiss/i.test(s)), other = info.spots.filter(s => cut.indexOf(s) < 0); if (other.length) add("warn", "Sonderfarben", other.join(", ") + " – werden in CMYK umgerechnet, außer das Produkt sieht Sonderfarben vor. Prüfen, ob das gewollt ist."); if (cut.length) add("ok", "Technische Farben", cut.join(", ") + " – Stanz-/Weiß-Ebenen erkannt, Position und 100 % Überdrucken kontrollieren."); }
  if (info && info.transparency) add("warn", "Transparenzen", "Datei enthält Transparenzen/Effekte – Schatten und Verläufe in der Vorschau auf Streifen oder weiße Kanten kontrollieren.");
  if (info && info.type === "PNG" && info.alpha) add("warn", "Transparenter Hintergrund", "PNG mit Transparenz – freie Flächen werden weiß gedruckt.");
  if (c.noBleed) add("bad", "Beschnitt fehlt", "Hintergrund um " + bleed + " mm je Seite verlängern (im Studio „Rand spiegeln“ oder „Leicht vergrößern“), sonst können weiße Blitzer entstehen.");
  add("check", "Sicherheitsabstand", "Texte, Logos und Ränder mindestens " + String(safe).replace(".", ",") + " mm innerhalb des Endformats" + (size ? " (" + size.w + " × " + size.h + " mm)" : "") + " – in der Vorschau grün gestrichelt.");
  if (c.hem) add("check", "Saum & Ösen", c.hem);
  add("check", "Inhalt", "Rechtschreibung, Telefonnummer, E-Mail, Web-Adresse und QR-Code (mit dem Handy scannen) kontrollieren.");
  if ((c.sides || 1) > 1) add("check", "Vorder-/Rückseite", "Reihenfolge und Ausrichtung beider Seiten prüfen (Rückseite nicht auf dem Kopf).");
  return R;
}

module.exports = { fileInfo, recommend, _t: { jpgInfo, pngInfo, iccInfo } };
