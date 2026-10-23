/* Marketing: Website der Marke einlesen – Texte (Titel, Beschreibungen, Überschriften, Absätze) und Bilder für die KI.
   Liest die Startseite und bis zu 14 weitere Seiten derselben Domain (Sitemap bzw. Links), höchstens einmal am Tag (Knopf: sofort).
   Bilder landen in marketing/library-web/<marke>/ (Kennung „w-…“) und werden wie die anderen Bibliotheksfotos beschrieben und verwendet.
   Nur öffentliche https-Adressen, keine internen Netze; Größen- und Zeitgrenzen je Abruf. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const UA = "Mozilla/5.0 (compatible; FS-Creative-Marketing/1.0; +https://www.fs-creative.at)";
const PRIVATE = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?|\[?f[cd][0-9a-f]{2}:)/i;
const okUrl = u => { try { const x = new URL(u); return x.protocol === "https:" && !PRIVATE.test(x.hostname) && !/^\d+\.\d+\.\d+\.\d+$/.test(x.hostname) ? x : null; } catch (e) { return null; } };
const decode = s => String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)));
const strip = s => decode(String(s || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

async function get(url, max, accept) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: accept || "text/html,application/xhtml+xml" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  if (!okUrl(r.url)) throw new Error("Weiterleitung auf unerlaubte Adresse");
  const len = +r.headers.get("content-length") || 0; if (len > max) throw new Error("zu groß");
  const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > max) throw new Error("zu groß");
  return { buf, type: String(r.headers.get("content-type") || "").split(";")[0].trim(), url: r.url };
}
// Seite → Text + Bildadressen + Links derselben Domain
function parsePage(html, base) {
  const h = String(html || "").replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  const meta = n => { const m = h.match(new RegExp('<meta[^>]+(?:name|property)=["\']' + n + '["\'][^>]*>', "i")); const c = m && m[0].match(/content=["']([^"']*)["']/i); return c ? decode(c[1]).trim() : ""; };
  const title = strip((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const body = h.replace(/<(nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ");
  const lines = [], seen = new Set();
  (body.match(/<(h1|h2|h3|p|li|blockquote|figcaption|dt|dd)\b[^>]*>[\s\S]*?<\/\1>/gi) || []).forEach(x => { const tag = x.slice(1, 3).toLowerCase(), t = strip(x); if (t.length < (tag[0] === "h" ? 3 : 25) || t.length > 600 || seen.has(t)) return; seen.add(t); lines.push((tag[0] === "h" ? "## " : "") + t); });
  const imgs = [], abs = u => { try { return new URL(decode(u).trim(), base).toString(); } catch (e) { return ""; } };
  const og = meta("og:image") || meta("twitter:image"); if (og) imgs.push({ url: abs(og), alt: meta("og:title") || title, prio: 2 });
  (h.match(/<img\b[^>]*>/gi) || []).forEach(tag => {
    const at = n => { const m = tag.match(new RegExp("\\s" + n + '=["\']([^"\']+)["\']', "i")); return m ? m[1] : ""; };
    let src = at("src"), set = at("srcset") || at("data-srcset"); if (!src || /^data:/.test(src)) src = at("data-src") || "";
    if (set) { const best = set.split(",").map(x => x.trim().split(/\s+/)).filter(x => x[0]).sort((a, b) => (parseInt(b[1], 10) || 0) - (parseInt(a[1], 10) || 0))[0]; if (best) src = best[0]; }
    if (!src || /^data:|\.svg(\?|$)|\.gif(\?|$)/i.test(src)) return;
    let u = abs(src); const nx = u.match(/\/_next\/image\?url=([^&]+)/); if (nx) u = abs(decodeURIComponent(nx[1]));
    const alt = decode(at("alt")), w = parseInt(at("width"), 10) || 0;
    if (/logo|icon|favicon|sprite|avatar|badge|flag|payment|placeholder|spinner/i.test(u + " " + alt) || (w && w < 300)) return;
    imgs.push({ url: u, alt: alt.slice(0, 120), prio: w >= 800 ? 1 : 0 });
  });
  const links = [], host = new URL(base).host;
  (h.match(/<a\b[^>]*href=["']([^"'#]+)["']/gi) || []).forEach(a => { const m = a.match(/href=["']([^"'#]+)["']/i); const u = m && abs(m[1]); try { const x = new URL(u); if (x.host === host && x.protocol === "https:" && !/\.(pdf|jpe?g|png|webp|zip|mp4)$/i.test(x.pathname) && !/(login|anmelden|admin|konto|account|cart|warenkorb|checkout|impressum|datenschutz|agb|privacy|cookie)/i.test(x.pathname)) links.push(x.origin + x.pathname); } catch (e) {} });
  return { title, desc: meta("description") || meta("og:description"), lines, imgs, links };
}

module.exports = function (C) {
  const { S, save, DIR, R, clip, nowIso } = C, WLIB = path.join(DIR, "library-web");
  const RUN = new Map();
  const info = key => ((S().mkt.web = S().mkt.web || {})[key]) || null;
  async function sync(b, force) {
    const start = okUrl(b.url || ""); if (!start || process.env.MKT_WEB === "off") return info(b.key);   // Tests: kein Netz
    const cur = info(b.key); if (!force && cur && cur.at && Date.now() - Date.parse(cur.at) < 24 * 3600e3) return cur;
    if (RUN.has(b.key)) return RUN.get(b.key);
    const job = (async () => {
      const pages = [], queue = [start.toString()], done = new Set(), imgs = [];
      try { const sm = await get(start.origin + "/sitemap.xml", 2e6, "application/xml,text/xml"); (sm.buf.toString("utf8").match(/<loc>([^<]+)<\/loc>/g) || []).map(x => decode(x.slice(5, -6)).trim()).filter(u => { const x = okUrl(u); return x && x.host === start.host && !/\.xml$/i.test(x.pathname); }).sort((a, z) => a.length - z.length).slice(0, 40).forEach(u => queue.push(u)); } catch (e) {}
      while (queue.length && pages.length < 15) {
        const u = queue.shift().replace(/\/$/, "") || start.toString(); if (done.has(u)) continue; done.add(u);
        try { const r = await get(u, 3e6); if (!/html/i.test(r.type)) continue; const pg = parsePage(r.buf.toString("utf8"), r.url);
          pages.push({ url: r.url, title: clip(pg.title, 120), desc: clip(pg.desc, 300), text: clip(pg.lines.join("\n"), 2500) }); pg.imgs.forEach(x => imgs.push(x));
          if (pages.length === 1) pg.links.filter(l => !done.has(l.replace(/\/$/, ""))).slice(0, 30).forEach(l => queue.push(l)); }
        catch (e) { if (!pages.length) throw new Error("Website nicht erreichbar (" + e.message + ")"); }
      }
      // Bilder: bekannte behalten, neue laden (max. 30), nicht mehr vorhandene entfernen
      const dir = path.join(WLIB, b.key); fs.mkdirSync(dir, { recursive: true });
      const want = new Map(); imgs.sort((a, z) => z.prio - a.prio).forEach(x => { const u = okUrl(x.url); if (u && !want.has(u.toString()) && want.size < 30) want.set(u.toString(), x); });
      const keep = new Set(), d = (S().mkt.libDesc = S().mkt.libDesc || {})[b.key] = (S().mkt.libDesc[b.key] || {}); let added = 0;
      for (const [u, x] of want) {
        const f = crypto.createHash("sha1").update(u).digest("hex").slice(0, 16) + ".jpg", file = path.join(dir, f); keep.add(f);
        if (fs.existsSync(file)) continue;
        try {
          const r = await get(u, 12e6, "image/avif,image/webp,image/jpeg,image/png,*/*"); if (!/^image\//.test(r.type) || r.buf.length < 15000) throw new Error("zu klein/kein Bild");
          const raw = file + ".src"; fs.writeFileSync(raw, r.buf);
          try { await R.ffmpeg(["-i", raw, "-vf", "scale='min(1600,iw)':-2", "-frames:v", "1", "-q:v", "3", file]); } finally { try { fs.unlinkSync(raw); } catch (e) {} }
          const sz = C.imgSize ? C.imgSize(fs.readFileSync(file), "image/jpeg") : { w: 1000, h: 1000 };
          if (sz.w < 500 || sz.h < 400) { fs.unlinkSync(file); keep.delete(f); continue; }
          if (x.alt) d["w-" + f] = { d: clip("Foto von der Website: " + x.alt, 160), at: nowIso(), web: true };   // Alt-Text als Beschreibung, sonst beschreibt die KI
          added++;
        } catch (e) { keep.delete(f); try { fs.unlinkSync(file); } catch (e2) {} }
      }
      let fl = []; try { fl = fs.readdirSync(dir); } catch (e) {}
      fl.forEach(f => { if (!keep.has(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} delete d["w-" + f]; } });
      const out = { at: nowIso(), url: start.toString(), pages, images: keep.size, added, error: "" };
      S().mkt.web[b.key] = out; save(); return out;
    })().catch(e => { const out = Object.assign({}, info(b.key) || {}, { at: nowIso(), error: String(e.message || e).slice(0, 200) }); S().mkt.web[b.key] = out; save(); return out; }).finally(() => RUN.delete(b.key));
    RUN.set(b.key, job); return job;
  }
  // Für den KI-Prompt: kompakter Auszug (Startseite zuerst), höchstens ~7000 Zeichen
  function promptText(key) {
    const w = info(key); if (!w || !(w.pages || []).length) return "";
    let out = "", left = 7000;
    for (const p of w.pages) { const blk = "[" + p.url.replace(/^https:\/\/(www\.)?/, "") + "] " + (p.title || "") + (p.desc ? "\n" + p.desc : "") + "\n" + p.text + "\n\n"; if (blk.length > left) { out += blk.slice(0, left); break; } out += blk; left -= blk.length; }
    return "<website>\nAktuelle Inhalte der Website (Fakten, Angebote, Namen, Preise – nur verwenden, was hier steht, nichts dazuerfinden):\n" + out.trim() + "\n</website>\n";
  }
  const libDir = key => path.join(WLIB, key);
  return { sync, promptText, info, libDir, _test: { parsePage, okUrl } };
};
module.exports.parsePage = parsePage;
