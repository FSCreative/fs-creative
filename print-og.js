/* Link-Vorschaubilder (og:image) für den Druckshop – Wunsch Simon 15.11.2026:
   Produkt = Print.com-Werbebild + FS-Druckshop-Logo + Produktname, Kategorie = Bild des beliebtesten Produkts,
   sonst ein allgemeines Bild (Collage der Bestseller). 1200 × 630, JPEG (WhatsApp & Co. mögen kleine Dateien).
   Erzeugt mit satori/resvg (mkt-render.js), zwischengespeichert im Datenordner; schlägt etwas fehl → null (Aufrufer nimmt /og-image.png). */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const V = "og4";   // bei Layout-Änderung erhöhen → alle Bilder neu
const W = 1200, H = 630, LW = 660;

module.exports = function createOg(o) {
  const R = o.render, dir = o.dir, log = o.log || (() => {});
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  let LOGO = null;
  const logo = () => { if (LOGO === null) { try { const b = fs.readFileSync(o.logoFile); LOGO = (/\.svg$/i.test(o.logoFile) ? "data:image/svg+xml;base64," : "data:image/png;base64,") + b.toString("base64"); } catch (e) { LOGO = ""; } } return LOGO; };
  const busy = new Map(); let running = 0; const queue = [];
  const slot = () => new Promise(r => { if (running < 2) { running++; r(); } else queue.push(r); });
  const free = () => { const n = queue.shift(); if (n) n(); else running--; };

  // Print.com-Bilder (Contentful) als JPEG in passender Größe holen; andere Adressen so wie sie sind (nur JPEG/PNG)
  async function imgData(url, w) {
    if (!url) return "";
    let u = String(url);
    if (/images\.ctfassets\.net/.test(u)) { const x = new URL(u.startsWith("//") ? "https:" + u : u); x.searchParams.set("fm", "jpg"); x.searchParams.set("w", String(w)); x.searchParams.set("q", "82"); x.searchParams.delete("h"); u = x.toString(); }
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) }); if (!r.ok) return "";
      const ct = String(r.headers.get("content-type") || ""), b = Buffer.from(await r.arrayBuffer());
      const kind = /png/.test(ct) || b.slice(1, 4).toString() === "PNG" ? "png" : /jpe?g/.test(ct) || (b[0] === 0xff && b[1] === 0xd8) ? "jpeg" : "";
      return kind ? "data:image/" + kind + ";base64," + b.toString("base64") : "";
    } catch (e) { return ""; }
  }

  function layout(spec, pics) {
    const h = R.h, img = R.img;
    const left = pics.length >= 4
      ? h("div", { width: LW, height: H, flexWrap: "wrap", background: "#ffffff" }, pics.slice(0, 4).map(p => img(p, { width: LW / 2, height: H / 2, objectFit: "cover" })))
      : pics.length ? h("div", { width: LW, height: H, background: "#ffffff" }, img(pics[0], { width: LW, height: H, objectFit: "cover" }))
        : h("div", { width: LW, height: H, background: "linear-gradient(135deg,#1fb6ff 0%,#e5197d 55%,#ffd21f 100%)" });
    const t = String(spec.title || ""), fs0 = t.length <= 16 ? 66 : t.length <= 26 ? 56 : t.length <= 40 ? 46 : 38;
    const right = h("div", { width: W - LW, height: H, flexDirection: "column", justifyContent: "space-between", padding: "52px 52px 46px", background: "#0f1117", position: "relative" },
      h("div", { position: "absolute", left: 0, top: 0, width: W - LW, height: 8, background: "linear-gradient(90deg,#1fb6ff,#e5197d,#ffd21f)" }),
      logo() ? img(logo(), { width: 330, height: Math.round(330 * (o.logoRatio || 690 / 2170)) }) : h("div", { color: "#fff", fontFamily: "Poppins", fontWeight: 800, fontSize: 40 }, "FS Druckshop"),
      h("div", { flexDirection: "column" },
        spec.kicker ? h("div", { color: "#8fd3ff", fontFamily: "Inter", fontWeight: 700, fontSize: 22, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }, spec.kicker) : null,
        h("div", { color: "#ffffff", fontFamily: "Poppins", fontWeight: 800, fontSize: fs0, lineHeight: 1.08 }, t),
        spec.sub ? h("div", { color: "#c5cad6", fontFamily: "Inter", fontWeight: 500, fontSize: 26, lineHeight: 1.35, marginTop: 18 }, spec.sub) : null),
      h("div", { alignItems: "center", justifyContent: "space-between" },
        h("div", { color: "#ffffff", fontFamily: "Inter", fontWeight: 700, fontSize: 24, whiteSpace: "nowrap" }, "fs-creative.at/print"),
        h("div", { color: "#0f1117", background: "#ffd21f", borderRadius: 999, padding: "8px 18px", fontFamily: "Inter", fontWeight: 800, fontSize: 19, whiteSpace: "nowrap" }, "Versand inklusive")));
    return h("div", { width: W, height: H, background: "#0f1117" }, left, right);
  }

  async function make(spec, file) {
    const imgs = (spec.imgs || []).filter(Boolean).slice(0, 4), w = imgs.length >= 4 ? 700 : 1000;
    const pics = (await Promise.all(imgs.map(u => imgData(u, w)))).filter(Boolean);
    const use = imgs.length >= 4 ? (pics.length >= 4 ? pics : pics.slice(0, 1)) : pics.slice(0, 1);
    const png = await R.png(layout(spec, use), W, H);
    const tmp = file + "." + process.pid + ".png";
    fs.writeFileSync(tmp, png);
    let out = tmp;
    if (R.videoReady && R.videoReady()) { try { await R.ffmpeg(["-y", "-i", tmp, "-q:v", "3", "-pix_fmt", "yuvj420p", file + ".tmp.jpg"]); fs.renameSync(file + ".tmp.jpg", file); out = file; } catch (e) { log("OG-Bild JPEG:", e.message); } }
    if (out === tmp) { fs.renameSync(tmp, file.replace(/\.jpg$/, ".png")); return file.replace(/\.jpg$/, ".png"); }
    try { fs.unlinkSync(tmp); } catch (e) {}
    return file;
  }

  // spec: { id, title, sub, kicker, imgs[] } → Pfad zur Bilddatei oder null
  async function get(spec) {
    if (!R || !R.ready || !R.ready()) return null;
    const hash = crypto.createHash("sha1").update(V + JSON.stringify([spec.title, spec.sub, spec.kicker, spec.imgs])).digest("hex").slice(0, 16);
    const file = path.join(dir, String(spec.id).replace(/[^\w-]/g, "_").slice(0, 80) + "-" + hash + ".jpg");
    for (const f of [file, file.replace(/\.jpg$/, ".png")]) if (fs.existsSync(f)) return f;
    if (busy.has(file)) return busy.get(file);
    const run = (async () => { await slot(); try { return await make(spec, file); } catch (e) { log("OG-Bild " + spec.id + ":", e.message); return null; } finally { free(); busy.delete(file); } })();
    busy.set(file, run); return run;
  }
  return { get, _layout: layout };
};
