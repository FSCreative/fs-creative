"use strict";
/* Leichte Vorschau-PDF für große Druckdateien (Simon 23.11.2026, Aquarena: 66-MB-Canva-PDF lud im Studio ewig).
   Vektoren/Text bleiben unverändert, nur große Bilder werden verkleinert (ca. 1,2 MP je Bild) und als Flate (verlustfrei gepackt) neu eingesetzt:
   - FlateDecode 8 bit (auch mit PNG-Predictor), Gray/RGB/CMYK: entpacken, Box-Filter verkleinern
   - DCTDecode (JPEG) Gray/RGB/CMYK: mit jpeg-js (vendor/, reines JS) dekodieren – CMYK/YCCK mit Adobe-Marker farbtreu wie Poppler/pdf.js
   Nur für die Bildschirm-Vorschau – gedruckt wird immer die Originaldatei. */
const zlib = require("zlib");
const jpegDecode = require("./vendor/jpeg-js/decoder.js");

const MAX_PX = 1.2e6;

function boxScale(src, W, H, n, w, h) {
  const out = Buffer.alloc(w * h * n), fx = W / w, fy = H / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.min(H, Math.floor((y + 1) * fy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.min(W, Math.floor((x + 1) * fx))), cnt = (y1 - y0) * (x1 - x0);
      for (let c = 0; c < n; c++) {
        let s = 0;
        for (let yy = y0; yy < y1; yy++) { let i = (yy * W + x0) * n + c; for (let xx = x0; xx < x1; xx++, i += n) s += src[i]; }
        out[(y * w + x) * n + c] = Math.round(s / cnt);
      }
    }
  }
  return out;
}

// PNG-Predictor (10–15) rückgängig machen: Zeilen mit Filter-Byte → reine Pixeldaten
function unpredict(buf, W, H, n) {
  const row = W * n, out = Buffer.alloc(row * H); let p = 0;
  for (let y = 0; y < H; y++) {
    const ft = buf[p++], o = y * row, up = o - row;
    for (let x = 0; x < row; x++) {
      const a = x >= n ? out[o + x - n] : 0, b = y ? out[up + x] : 0, c = x >= n && y ? out[up + x - n] : 0, v = buf[p++];
      let r;
      if (ft === 0) r = v; else if (ft === 1) r = v + a; else if (ft === 2) r = v + b; else if (ft === 3) r = v + ((a + b) >> 1);
      else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[o + x] = r & 255;
    }
  }
  return out;
}

function compsOf(cs, ctx, PDFName, PDFArray) {
  if (!cs) return 0;
  cs = ctx.lookup(cs) || cs;
  if (cs instanceof PDFName) { const s = String(cs); return s === "/DeviceGray" ? 1 : s === "/DeviceRGB" ? 3 : s === "/DeviceCMYK" ? 4 : 0; }
  if (cs instanceof PDFArray) {
    const k = String(cs.get(0));
    if (k === "/ICCBased") { const st = ctx.lookup(cs.get(1)); const nn = st && st.dict && st.dict.get(PDFName.of("N")); return nn ? +String(nn) : 0; }
    if (k === "/CalRGB" || k === "/Lab") return 3; if (k === "/CalGray") return 1;
  }
  return 0;
}

async function shrinkPdf(buf, opt) {
  const { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFNumber, PDFDict } = require("pdf-lib");
  const o = Object.assign({ maxPx: MAX_PX, deadline: Date.now() + 120000 }, opt || {});
  const doc = await PDFDocument.load(buf, { updateMetadata: false, ignoreEncryption: true });
  const ctx = doc.context, N = s => PDFName.of(s); let done = 0, skipped = 0;
  const yieldNow = () => new Promise(r => setImmediate(r));
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (Date.now() > o.deadline) break;
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (String(d.get(N("Subtype"))) !== "/Image" || d.get(N("ImageMask"))) continue;
    const W = +String(d.get(N("Width"))), H = +String(d.get(N("Height"))), bpc = +String(d.get(N("BitsPerComponent")) || 8);
    if (!(W * H > o.maxPx) || bpc !== 8) continue;
    let f = d.get(N("Filter")); if (f instanceof PDFArray) f = f.size() === 1 ? f.get(0) : null; f = f ? String(f) : "";
    const s = Math.sqrt(o.maxPx / (W * H)), w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
    const hasCs = !!d.get(N("ColorSpace")), n = hasCs ? compsOf(d.get(N("ColorSpace")), ctx, PDFName, PDFArray) : 1;   // ohne ColorSpace: SMask (1 Kanal)
    try {
      let px = null;
      if (f === "/FlateDecode" && n) {
        let raw = zlib.inflateSync(Buffer.from(obj.contents));
        const dp = ctx.lookup(d.get(N("DecodeParms")));
        if (dp instanceof PDFDict) {
          const pr = +String(dp.get(N("Predictor")) || 1), cols = +String(dp.get(N("Columns")) || W), col = +String(dp.get(N("Colors")) || n), b = +String(dp.get(N("BitsPerComponent")) || 8);
          if (pr >= 10 && cols === W && col === n && b === 8) raw = unpredict(raw, W, H, n); else if (pr !== 1) { skipped++; continue; }
        }
        if (raw.length < W * H * n) { skipped++; continue; }
        px = boxScale(raw, W, H, n, w, h);
      } else if (f === "/DCTDecode" && (n === 1 || n === 3 || n === 4) && !d.get(N("Decode"))) {
        const im = jpegDecode(Buffer.from(obj.contents), { raw: true, outW: w, outH: h, maxMemoryUsageInMB: 1500, maxResolutionInMP: 400 });
        if (im.components !== n) { skipped++; continue; }
        px = Buffer.from(im.data.buffer, im.data.byteOffset, im.data.length);
        if (n === 4) { px = Buffer.from(px); for (let i = 0; i < px.length; i++) px[i] = 255 - px[i]; }   // Adobe-CMYK: jpeg-js liefert invertiert
      } else { skipped++; continue; }
      const data = zlib.deflateSync(px, { level: 6 });
      d.set(N("Width"), PDFNumber.of(w)); d.set(N("Height"), PDFNumber.of(h)); d.set(N("Filter"), N("FlateDecode")); d.delete(N("DecodeParms")); d.set(N("Length"), PDFNumber.of(data.length));
      ctx.assign(ref, PDFRawStream.of(d, new Uint8Array(data))); done++;
    } catch (e) { skipped++; }
    await yieldNow();
  }
  if (!done) return null;
  const out = Buffer.from(await doc.save({ useObjectStreams: false }));
  return { pdf: out, images: done, skipped };
}

module.exports = { shrinkPdf };
