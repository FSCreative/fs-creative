/* Marketing im Cockpit (Seite admin-cockpit/zmarketing.js): Marken/Apps, Gewinnspiel-Auslosung mit Video.
   Daten im Datenordner unter marketing/ (state.json + Mediendateien). Bilder und Videos erzeugt mkt-render.js am Server (kostenlos).
   Gewinnspiel: Teilnehmer einfügen → doppelte/eigene Konten raus → Ziehung mit kryptografischem Zufall am Server (crypto.randomInt) →
   Protokoll (Zeitpunkt, Anzahl, SHA-256 der Liste, Gewinner, Ersatzgewinner) → Video 1080×1920 (Namen laufen durch, bleiben beim Gewinner stehen). */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const R = require("./mkt-render.js");

module.exports = function (D) {
  const send = D.send, DIR = path.join(D.DATA_DIR, "marketing"), MEDIA = path.join(DIR, "media"), WORK = path.join(DIR, "work"), ROOT = D.ROOT || __dirname;
  try { fs.mkdirSync(MEDIA, { recursive: true }); fs.mkdirSync(WORK, { recursive: true }); } catch (e) {}
  const STATE_FILE = path.join(DIR, "state.json");
  const J = (res, code, o) => send(res, code, JSON.stringify(o), "application/json; charset=utf-8", { "Cache-Control": "no-store" });
  const fail = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
  const clip = (v, n) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, n);
  const newId = p => p + Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
  const nowIso = () => new Date().toISOString();
  const viennaStamp = d => new Date(d || Date.now()).toLocaleString("de-AT", { timeZone: "Europe/Vienna", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const viennaDate = d => new Date(d || Date.now()).toLocaleDateString("de-AT", { timeZone: "Europe/Vienna", day: "2-digit", month: "2-digit", year: "numeric" });

  // ───────────── Speicher ─────────────
  let ST = null;
  function seedBrands() { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "mkt-brands.json"), "utf8")); } catch (e) { return []; } }
  function state() {
    if (ST) return ST;
    let o = {}; try { o = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) || {}; } catch (e) { o = {}; }
    o.brands = o.brands && typeof o.brands === "object" ? o.brands : {};
    o.draws = Array.isArray(o.draws) ? o.draws : [];
    o.order = Array.isArray(o.order) ? o.order : [];
    // neue Marken aus der Vorlage ergänzen (eigene Änderungen bleiben)
    seedBrands().forEach(b => { if (!o.brands[b.key]) { o.brands[b.key] = Object.assign({ enabled: true }, b); if (o.order.indexOf(b.key) < 0) o.order.push(b.key); }
      else if (!o.brands[b.key].logo && b.logo) o.brands[b.key].logo = b.logo; });   // später ergänzte Logos (z. B. App-Icons der Spiele) übernehmen
    ST = o; return ST;
  }
  let saveT = null;
  function save(now) {
    const w = () => { try { const tmp = STATE_FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(ST)); fs.renameSync(tmp, STATE_FILE); } catch (e) { console.error("marketing: speichern", e.message); } };
    clearTimeout(saveT); if (now) w(); else saveT = setTimeout(w, 200);
  }
  function brandList() { const s = state(); return s.order.filter(k => s.brands[k]).map(k => s.brands[k]); }
  function brand(key) { const b = state().brands[String(key || "")]; if (!b) throw fail(400, "Unbekannte Marke"); return b; }

  // ───────────── Logos ─────────────
  // Quelle: hochgeladen (marketing/logo-KEY.*), Datei im Projekt (z. B. kochdu-logo.png) oder Adresse (einmal geladen und zwischengespeichert)
  const LOGO_CACHE = {};
  function imgSize(buf, type) {
    if (/png/.test(type) && buf.length > 24 && buf.readUInt32BE(12) === 0x49484452) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (/svg/.test(type)) { const s = buf.toString("utf8", 0, 4000), vb = s.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i); if (vb) return { w: +vb[1], h: +vb[2] }; const w = s.match(/\swidth\s*=\s*["']([\d.]+)/i), hh = s.match(/\sheight\s*=\s*["']([\d.]+)/i); if (w && hh) return { w: +w[1], h: +hh[1] }; }
    if (/jpe?g/.test(type)) { let i = 2; while (i < buf.length - 9) { if (buf[i] !== 0xff) { i++; continue; } const m = buf[i + 1], len = buf.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc3) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) }; i += 2 + len; } }
    return { w: 1, h: 1 };
  }
  const typeOf = f => /\.svg$/i.test(f) ? "image/svg+xml" : /\.jpe?g$/i.test(f) ? "image/jpeg" : /\.webp$/i.test(f) ? "image/webp" : "image/png";
  async function logoData(b) {
    const up = ["png", "jpg", "svg"].map(x => path.join(DIR, "logo-" + b.key + "." + x)).find(f => fs.existsSync(f));
    const src = up || String(b.logo || "");
    if (!src) return null;
    if (LOGO_CACHE[b.key] && LOGO_CACHE[b.key].src === src) return LOGO_CACHE[b.key];
    let buf = null, type = "";
    try {
      if (/^https:\/\//i.test(src)) {
        const cache = path.join(DIR, "logo-cache-" + b.key + "-" + crypto.createHash("sha1").update(src).digest("hex").slice(0, 10));
        if (fs.existsSync(cache)) { buf = fs.readFileSync(cache); type = fs.readFileSync(cache + ".type", "utf8"); }
        else { const r = await fetch(src, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error("HTTP " + r.status); buf = Buffer.from(await r.arrayBuffer()); type = (r.headers.get("content-type") || typeOf(src)).split(";")[0]; if (buf.length > 3e6) throw new Error("zu groß"); fs.writeFileSync(cache, buf); fs.writeFileSync(cache + ".type", type); }
      } else {
        const f = up || path.join(ROOT, src); if (!up && path.relative(ROOT, f).startsWith("..")) return null;
        buf = fs.readFileSync(f); type = typeOf(f);
      }
    } catch (e) { console.error("marketing: Logo", b.key, e.message); return null; }
    if (!/^image\/(png|jpeg|svg\+xml)$/.test(type)) return null;   // satori kann kein WebP
    const sz = imgSize(buf, type), out = { src, uri: "data:" + type + ";base64," + buf.toString("base64"), ratio: sz.h ? sz.w / sz.h : 1 };
    LOGO_CACHE[b.key] = out; return out;
  }
  async function renderBrand(b) { const l = await logoData(b); return { key: b.key, name: b.name, colors: b.colors || {}, logo: l ? l.uri : "", logoRatio: l ? l.ratio : 1, logoBg: b.logoBg || "light" }; }

  // ───────────── Gewinnspiel ─────────────
  // Eine Zeile = eine Teilnahme. Erstes Wort mit @ oder ein Benutzername ohne Leerzeichen = Name; sonst die ganze Zeile (z. B. „Lisa Müller“).
  // Aus Instagram kopierte Kommentare (Name, Zeitangabe „2 Std.“, Kommentar, „Antworten“ …) werden erkannt: Teilnehmer ist dann die Zeile vor jeder Zeitangabe.
  const TIME_RE = /^(vor\s+)?\d+\s*(sek|min|std|stunden?|t|tg|tage?|wo|wochen?|j|s|m|h|d|w|y)\.?$/i;
  const NOISE_RE = /^(antworten|reply|übersetzung anzeigen|see translation|mehr anzeigen|view replies.*|antworten anzeigen.*|verifiziert|verified|bearbeitet|edited|autor|author|gepinnt|pinned|\d+\s*(„?gefällt mir“?-angaben?|likes?|gefällt mir)|gefällt \d+ mal|— antworten.*)$/i;
  function parseParticipants(text, excludeText, dedupe) {
    const norm = s => s.toLowerCase().replace(/^@/, "");
    const ex = new Set(String(excludeText || "").split(/[\s,;]+/).map(s => s.trim()).filter(Boolean).map(norm));
    const raw = String(text || "").replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean).slice(0, 50000);
    const times = raw.filter(l => TIME_RE.test(l)).length, insta = times >= 2 && times * 6 >= raw.length;
    const names = []; let skipped = 0;
    if (insta) {
      raw.forEach((l, i) => { if (!TIME_RE.test(l)) return; let j = i - 1; while (j >= 0 && /^(verifiziert|verified|autor|author)$/i.test(raw[j])) j--; const u = j >= 0 ? raw[j].replace(/^@/, "") : ""; if (/^[A-Za-z0-9._]{1,40}$/.test(u)) names.push("@" + u); else skipped++; });
    } else raw.forEach(l => {
      if (TIME_RE.test(l) || NOISE_RE.test(l)) { skipped++; return; }
      const m = l.match(/^@([A-Za-z0-9._]{1,40})/);
      let n = m ? "@" + m[1] : l.replace(/^(\d+[.)]\s+|[-–•*]\s+)/, "").trim();   // Nummerierung „1. “/„- “ weg
      if (n.length > 60) n = n.slice(0, 60).trim();
      if (!n) { skipped++; return; } names.push(n);
    });
    const out = [], seen = new Set(); let dupes = 0, excluded = 0;
    names.forEach(n => { const k = norm(n); if (ex.has(k)) { excluded++; return; } if (dedupe !== false && seen.has(k)) { dupes++; return; } seen.add(k); out.push(n); });
    return { participants: out, lines: raw.length, dupes, excluded, skipped, mode: insta ? "instagram" : "zeilen" };
  }
  function drawIndices(n, k) {   // k verschiedene Positionen aus 0..n-1, kryptografischer Zufall
    const pool = Array.from({ length: n }, (_, i) => i), out = [];
    for (let i = 0; i < k && pool.length; i++) { const j = crypto.randomInt(pool.length); out.push(pool[j]); pool.splice(j, 1); }
    return out;
  }
  function shuffled(a) { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); const t = x[i]; x[i] = x[j]; x[j] = t; } return x; }
  // Teilnehmer aus kochdu-Registrierungen: Zeitraum in Wiener Zeit (Tag von–bis, beide inklusive). kochdu liefert nur Vorname + Kunden-ID;
  // Mitarbeiter-, Admin- und Restaurant-Konten zählen nie, auf Wunsch nur bestätigte E-Mail-Adressen. Kürzel (K…) = Prüfsumme der Kunden-ID fürs Protokoll.
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  function viennaOffset(ms) { const p = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Vienna", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms)), g = t => +p.find(x => x.type === t).value;
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ms; }
  function viennaMidnight(day) { const t = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)); return new Date(t - viennaOffset(t)).toISOString(); }
  function kochduRange(x) {
    const from = String(x && x.from || ""), to = String(x && x.to || "");
    if (!DAY_RE.test(from) || !DAY_RE.test(to) || to < from) throw fail(400, "Bitte einen gültigen Zeitraum wählen (von–bis).");
    const next = new Date(Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10) + 1)).toISOString().slice(0, 10);
    return { from, to, start: viennaMidnight(from), end: viennaMidnight(next), verifiedOnly: !!(x && x.verifiedOnly) };
  }
  const kochduCode = id => "K" + crypto.createHash("sha256").update("kochdu:" + id).digest("hex").slice(0, 6).toUpperCase();
  async function kochduEntries(x) {
    if (typeof D.kochdu !== "function") throw fail(503, "kochdu ist nicht angebunden");
    const r = kochduRange(x), j = await D.kochdu("registrations=1&from=" + encodeURIComponent(r.start) + "&to=" + encodeURIComponent(r.end));
    if (!Array.isArray(j.users)) throw fail(502, "kochdu kennt diese Abfrage noch nicht – das Update dort läuft gerade, bitte in ein paar Minuten nochmal.");
    const stats = { total: j.users.length, staff: 0, unverified: 0, unverifiedOut: 0 }, entries = [];
    j.users.forEach(u => {
      if (u.staff) { stats.staff++; return; }
      if (!u.verified) { stats.unverified++; if (r.verifiedOnly) { stats.unverifiedOut++; return; } }
      entries.push({ id: String(u.id), name: clip(u.first, 24) || "Gast", full: clip(u.full, 60) || clip(u.first, 24) || "Gast", code: kochduCode(u.id) });   // name = Vorname (Video), full = Vor- und Nachname (nur Cockpit)
    });
    return { range: r, entries, stats };
  }
  function drawPublic(d) {
    const v = d.video || {};
    return { id: d.id, at: d.at, brand: d.brand, brandName: d.brandName, title: d.title, prize: d.prize, claim: d.claim, count: d.count, lines: d.lines, dupes: d.dupes, excluded: d.excluded, hash: d.hash,
      winners: d.winners, backups: d.backups, winnerCodes: d.winnerCodes || null, backupCodes: d.backupCodes || null, winnerFull: d.winnerFull || null, backupFull: d.backupFull || null, postId: d.postId || "",
      source: !d.source ? null : d.source.type === "kochdu" ? { type: "kochdu", from: d.source.from, to: d.source.to, verifiedOnly: !!d.source.verifiedOnly } : { type: d.source.type, permalink: d.source.permalink }, video: { status: v.status || "", error: v.error || "", duration: v.duration || 0, at: v.at || "", ms: v.ms || 0, file: v.file ? true : false, cover: v.cover ? true : false } };
  }
  async function draw(pl) {
    const b = brand(pl.brand);
    const ko = pl.source && pl.source.type === "kochdu" ? await kochduEntries(pl.source) : null;
    if (ko && b.key !== "kochdu") throw fail(400, "kochdu-Registrierungen gibt es nur bei der Marke kochdu.");
    const p = ko ? { participants: ko.entries.map(e => e.name), lines: ko.stats.total, dupes: 0, excluded: ko.stats.staff + ko.stats.unverifiedOut }
      : parseParticipants(pl.text, pl.exclude, pl.dedupe !== false);
    const nW = Math.max(1, Math.min(10, parseInt(pl.winners, 10) || 1)), nB = Math.max(0, Math.min(10, parseInt(pl.backups, 10) || 0));
    if (p.participants.length < 2) throw fail(400, "Mindestens zwei Teilnahmen einfügen.");
    if (p.participants.length <= nW) throw fail(400, "Es gibt nicht mehr Teilnahmen als Gewinner.");
    const idx = drawIndices(p.participants.length, Math.min(p.participants.length, nW + nB));
    const d = { id: newId("g"), at: nowIso(), brand: b.key, brandName: b.name, title: clip(pl.title, 60) || "Wer gewinnt?", prize: clip(pl.prize, 90), claim: clip(pl.claim, 90),
      count: p.participants.length, lines: p.lines, dupes: p.dupes, excluded: p.excluded, exclude: ko ? "" : clip(pl.exclude, 2000),
      hash: crypto.createHash("sha256").update((ko ? ko.entries.map(e => e.code + " " + e.name) : p.participants).join("\n"), "utf8").digest("hex"),
      winners: idx.slice(0, nW).map(i => p.participants[i]), backups: idx.slice(nW).map(i => p.participants[i]),
      participants: p.participants, method: "crypto.randomInt (Node.js, kryptografischer Zufall) am Server", video: { status: "wartet" },
      source: ko ? { type: "kochdu", from: ko.range.from, to: ko.range.to, verifiedOnly: ko.range.verifiedOnly, stats: ko.stats } : sourceOf(pl.source) };
    if (ko) {   // gleiche Vornamen bleiben unterscheidbar; Kunden-IDs nur am Server (für „Kontakt anzeigen“ beim Gewinner)
      d.codes = ko.entries.map(e => e.code);
      d.winnerCodes = idx.slice(0, nW).map(i => ko.entries[i].code); d.backupCodes = idx.slice(nW).map(i => ko.entries[i].code);
      d.winnerIds = idx.slice(0, nW).map(i => ko.entries[i].id); d.backupIds = idx.slice(nW).map(i => ko.entries[i].id);
      d.winnerFull = idx.slice(0, nW).map(i => ko.entries[i].full); d.backupFull = idx.slice(nW).map(i => ko.entries[i].full);
    }
    const s = state(); s.draws.unshift(d); if (s.draws.length > 100) s.draws.length = 100; save(true);
    queueVideo(d.id);
    return d;
  }
  // Herkunft der Teilnehmer (Instagram-Beitrag und angekreuzte Bedingungen) – nur zur Dokumentation im Protokoll
  function sourceOf(x) {
    if (!x || typeof x !== "object" || x.type !== "instagram") return null;
    const r = x.rules || {}, st = x.stats || {}, n = v => Math.max(0, parseInt(v, 10) || 0);
    return { type: "instagram", permalink: clip(x.permalink, 300), caption: clip(x.caption, 160), loadedAt: clip(x.loadedAt, 40), edited: !!x.edited,
      rules: { minTags: n(r.minTags), keyword: clip(r.keyword, 120), until: clip(r.until, 40), replies: !!r.replies, perComment: !!r.perComment, excludeOwn: r.excludeOwn !== false },
      stats: { total: n(st.total), topLevel: n(st.topLevel), replies: n(st.replies), late: n(st.late), tags: n(st.tags), keyword: n(st.keyword), excluded: n(st.excluded), dupes: n(st.dupes) } };
  }
  function protocol(d) {
    const L = [];
    L.push("GEWINNSPIEL-PROTOKOLL", "", "Marke: " + d.brandName, "Gewinnspiel: " + d.title + (d.prize ? " – " + d.prize : ""), "Ziehung: " + viennaStamp(d.at) + " (Europe/Vienna)", "Ziehungs-ID: " + d.id, "");
    if (d.source && d.source.type === "instagram") {
      const so = d.source, r = so.rules, st = so.stats;
      L.push("Teilnehmer aus Instagram-Kommentaren: " + (so.permalink || "") + (so.caption ? " („" + so.caption + "“)" : ""), "Kommentare geladen: " + (so.loadedAt ? viennaStamp(so.loadedAt) : "") + " – " + st.total + " Kommentare (" + st.topLevel + " direkt, " + (st.total - st.topLevel) + " Antworten)");
      L.push("Bedingungen: " + [r.minTags ? "mindestens " + r.minTags + " markierte Person(en)" : "", r.keyword ? "Kommentar enthält: " + r.keyword : "", r.until ? "Teilnahmeschluss " + viennaStamp(r.until) : "", r.replies ? "Antworten zählen mit" : "nur direkte Kommentare", r.perComment ? "jeder Kommentar = ein Los" : "jede Person nur einmal", r.excludeOwn ? "eigenes Konto ausgeschlossen" : ""].filter(Boolean).join(" · "));
      L.push("Nicht prüfbar über die Instagram-Schnittstelle: „Beitrag gefällt mir“, „folgt dem Konto“, „in der Story geteilt“.");
      if (so.edited) L.push("Hinweis: Die importierte Liste wurde vor der Ziehung von Hand bearbeitet.");
      L.push("Herausgefallen: " + [st.late ? st.late + " nach Teilnahmeschluss" : "", st.tags ? st.tags + " zu wenige Markierungen" : "", st.keyword ? st.keyword + " ohne Stichwort" : "", st.dupes ? st.dupes + " weitere Kommentare derselben Person" : "", st.excluded ? st.excluded + (st.excluded === 1 ? " eigenes/ausgeschlossenes Konto" : " eigene/ausgeschlossene Konten") : "", !r.replies && st.replies ? st.replies + " Antworten" : ""].filter(Boolean).join(" · ") || "keine", "");
    }
    if (d.source && d.source.type === "kochdu") {
      const so = d.source, st = so.stats || {}, dd = x => x.slice(8, 10) + "." + x.slice(5, 7) + "." + x.slice(0, 4);
      L.push("Teilnehmer: alle Registrierungen bei kochdu vom " + dd(so.from) + " bis " + dd(so.to) + " (jeweils ganzer Tag, Europe/Vienna)" + (so.verifiedOnly ? ", nur mit bestätigter E-Mail-Adresse" : ""),
        "Registrierungen im Zeitraum: " + (st.total || 0) + " – nicht dabei: " + (st.staff || 0) + " Mitarbeiter-/Admin-/Restaurant-Konten" + (so.verifiedOnly ? ", " + (st.unverifiedOut || 0) + " ohne bestätigte E-Mail-Adresse" : ""),
        "Angezeigt wird nur der Vorname. Das Kürzel in Klammern (K…) leitet sich aus der kochdu-Kunden-ID ab und unterscheidet Personen mit gleichem Vornamen.", "",
        "Gültige Teilnahmen: " + d.count, "");
    } else
    L.push("Eingefügte Zeilen: " + d.lines, "Doppelte Teilnahmen entfernt: " + d.dupes, "Ausgeschlossen (eigene Konten u. a.): " + d.excluded + (d.exclude ? " – " + d.exclude.replace(/\s+/g, " ") : ""), "Gültige Teilnahmen: " + d.count, "");
    L.push("Prüfsumme der Teilnehmerliste (SHA-256, eine Zeile je Teilnahme): " + d.hash, "Zufallsverfahren: " + d.method, "");
    const tag = (a, i) => a && a[i] ? " (" + a[i] + ")" : "";
    L.push(d.winners.length > 1 ? "GEWINNER" : "GEWINNER/IN"); d.winners.forEach((w, i) => L.push("  " + (i + 1) + ". " + w + tag(d.winnerCodes, i)));
    if (d.backups && d.backups.length) { L.push("", "ERSATZGEWINNER (in dieser Reihenfolge, falls sich jemand nicht meldet)"); d.backups.forEach((w, i) => L.push("  " + (i + 1) + ". " + w + tag(d.backupCodes, i))); }
    L.push("", "TEILNEHMERLISTE (" + d.count + ")"); d.participants.forEach((n, i) => L.push(String(i + 1).padStart(5, " ") + "  " + n + tag(d.codes, i)));
    return L.join("\n") + "\n";
  }

  // ───────────── Aufträge für Bilder/Videos (nacheinander, damit der Server nicht ausgelastet wird) ─────────────
  // Einträge „draw:ID“ (Gewinnspiel-Video) und „post:ID“ (Post-Medien, mkt-posts.js)
  const Q = []; let BUSY = false, CUR = ""; const JOBS = {};
  function enqueue(job) { if (CUR === job) return; if (Q.indexOf(job) < 0) Q.push(job); setImmediate(runQueue); }
  function queueVideo(id) { if (CUR === "draw:" + id) return; const d = state().draws.find(x => x.id === id); if (d) { d.video = Object.assign({}, d.video, { status: "wartet", error: "" }); save(); } enqueue("draw:" + id); }
  JOBS.draw = async function (id) {
    const s = state(), d = s.draws.find(x => x.id === id); if (!d) return;
    const t = Date.now(), work = path.join(WORK, d.id);
    d.video = { status: "läuft", at: nowIso() }; save();
    try {
      if (!R.videoReady()) throw new Error("Video-Erzeugung ist am Server nicht verfügbar (ffmpeg fehlt).");
      const others = shuffled(d.participants.filter(n => d.winners.indexOf(n) < 0)).slice(0, 80);
      const r = await R.giveawayVideo({ brand: await renderBrand(brand(d.brand)), title: d.title, prize: d.prize, claim: d.claim, total: d.count, date: viennaDate(d.at),
        names: others.length ? others : d.winners, winners: d.winners, dir: work, outFile: path.join(MEDIA, d.id + ".mp4"), coverFile: path.join(MEDIA, d.id + "-cover.png"), posterFile: path.join(MEDIA, d.id + "-poster.jpg") });
      d.video = { status: "fertig", file: d.id + ".mp4", cover: d.id + "-cover.png", poster: r.poster ? d.id + "-poster.jpg" : "", duration: r.duration, at: nowIso(), ms: Date.now() - t };
    } catch (e) { console.error("marketing: Video", e.message); d.video = { status: "fehler", error: String(e.message || e).slice(0, 300), at: nowIso() }; }
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) {}
    save(true);
  };
  async function runQueue() {
    if (BUSY) return; const job = Q.shift(); if (!job) return; BUSY = true; CUR = job;
    const i = job.indexOf(":"), kind = job.slice(0, i), id = job.slice(i + 1);
    try { if (JOBS[kind]) await JOBS[kind](id); } catch (e) { console.error("marketing: Auftrag", job, e.message); }
    BUSY = false; CUR = ""; if (Q.length) setImmediate(runQueue);
  }
  // nach einem Neustart: Videos, die beim Beenden noch offen waren, neu erzeugen (nur die aus der gespeicherten Datei – nicht laufende neue)
  const RECOVER = (() => { try { return state().draws.filter(d => d.video && (d.video.status === "läuft" || d.video.status === "wartet")).map(d => d.id); } catch (e) { return []; } })();
  if (RECOVER.length) setTimeout(() => RECOVER.forEach(id => { if (Q.indexOf("draw:" + id) < 0 && CUR !== "draw:" + id) queueVideo(id); }), 5000).unref();

  // ───────────── Dateien ─────────────
  function sendFile(req, res, file, type, dlName, opt) {
    let st; try { st = fs.statSync(file); } catch (e) { return J(res, 404, { ok: false, error: "Datei nicht gefunden" }); }
    const head = { "Content-Type": type, "Cache-Control": opt && opt.public ? "public, max-age=86400" : "private, max-age=3600", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff" };
    if (req.method === "HEAD") { res.writeHead(200, Object.assign(head, { "Content-Length": st.size })); return res.end(); }
    if (dlName) head["Content-Disposition"] = "attachment; filename=\"" + dlName.replace(/[^\w.\-]/g, "_") + "\"";
    const range = String(req.headers.range || "").match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1] || range[2])) {   // Video-Vorschau im Browser (Safari verlangt Teil-Anfragen)
      let a = range[1] ? +range[1] : st.size - +range[2], z = range[1] && range[2] ? +range[2] : st.size - 1; if (!range[1]) z = st.size - 1;
      if (a >= st.size || a > z) { res.writeHead(416, { "Content-Range": "bytes */" + st.size }); return res.end(); }
      res.writeHead(206, Object.assign(head, { "Content-Range": "bytes " + a + "-" + z + "/" + st.size, "Content-Length": z - a + 1 }));
      return fs.createReadStream(file, { start: a, end: z }).pipe(res);
    }
    res.writeHead(200, Object.assign(head, { "Content-Length": st.size })); fs.createReadStream(file).pipe(res);
  }
  function body(req, max) {
    return new Promise((resolve, reject) => { const ch = []; let n = 0; req.on("data", c => { n += c.length; if (n > max) { req.destroy(); reject(fail(413, "Anfrage zu groß")); } else ch.push(c); }); req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(ch).toString("utf8") || "{}")); } catch (e) { reject(fail(400, "Ungültige Anfrage")); } }); req.on("error", reject); });
  }
  function brandPublic(b) { const up = ["png", "jpg", "svg"].some(x => fs.existsSync(path.join(DIR, "logo-" + b.key + "." + x))); return Object.assign({}, b, { logoUploaded: up }); }

  // ───────────── Post-Planer (mkt-posts.js) und Veröffentlichen (mkt-publish.js) ─────────────
  const PUB = require("./mkt-publish.js")(D.publish || {});
  const POSTS = require("./mkt-posts.js")({ state, save, brand, brandList, renderBrand, imgSize, MEDIA, WORK, DIR, ROOT, J, fail, clip, newId, nowIso, body, sendFile, enqueue, JOBS, R, publisher: PUB,
    get KI() { return typeof D.KI === "function" ? D.KI() : D.KI; }, push: D.push, printProducts: D.printProducts, secret: D.secret, publicBase: D.publicBase, background: D.background });

  // ───────────── Routen ─────────────
  async function handleAdmin(req, res, u, p) {
    try {
      if (p === "/admin/api/mkt/state" && req.method === "GET") {
        const s = state();
        return J(res, 200, { ok: true, brands: brandList().map(brandPublic), draws: s.draws.slice(0, 40).map(drawPublic), render: { images: R.ready(), video: R.videoReady() }, queue: Q.length + (BUSY ? 1 : 0) });
      }
      if (p === "/admin/api/mkt/giveaway/parse" && req.method === "POST") {
        const pl = await body(req, 3e6), r = parseParticipants(pl.text, pl.exclude, pl.dedupe !== false);
        return J(res, 200, { ok: true, count: r.participants.length, lines: r.lines, dupes: r.dupes, excluded: r.excluded, skipped: r.skipped, mode: r.mode, sample: r.participants.slice(0, 12) });
      }
      if (p === "/admin/api/mkt/giveaway/kochdu" && req.method === "POST") {   // Vorschau: wie viele Registrierungen im Zeitraum (nur Vornamen)
        const pl = await body(req, 10000), r = await kochduEntries(pl);
        return J(res, 200, { ok: true, from: r.range.from, to: r.range.to, verifiedOnly: r.range.verifiedOnly, count: r.entries.length, stats: r.stats, sample: r.entries.slice(0, 14).map(e => e.full || e.name) });
      }
      if (p === "/admin/api/mkt/giveaway/contact" && req.method === "POST") {   // Name + E-Mail eines Gewinners/Ersatzgewinners (nur kochdu-Verlosungen)
        const pl = await body(req, 10000), d = state().draws.find(x => x.id === String(pl.id || "")); if (!d) throw fail(404, "Ziehung nicht gefunden");
        const ids = pl.kind === "b" ? d.backupIds : d.winnerIds, id = ids && ids[parseInt(pl.i, 10)]; if (!id || typeof D.kochdu !== "function") throw fail(404, "Kein Kontakt hinterlegt");
        const j = await D.kochdu("registrant=" + encodeURIComponent(id)); return J(res, 200, { ok: true, name: clip(j.name, 120), email: clip(j.email, 200) });
      }
      if (p === "/admin/api/mkt/giveaway/draw" && req.method === "POST") {
        const pl = await body(req, 3e6); if (pl.confirm !== true) throw fail(400, "Bestätigung fehlt");
        return J(res, 200, { ok: true, draw: drawPublic(await draw(pl)) });
      }
      if (p === "/admin/api/mkt/giveaway/video" && req.method === "POST") {
        const pl = await body(req, 10000), d = state().draws.find(x => x.id === String(pl.id || "")); if (!d) throw fail(404, "Ziehung nicht gefunden");
        queueVideo(d.id); return J(res, 200, { ok: true, draw: drawPublic(d) });
      }
      if (p === "/admin/api/mkt/giveaway/delete" && req.method === "POST") {
        const pl = await body(req, 10000), s = state(), i = s.draws.findIndex(x => x.id === String(pl.id || "")); if (i < 0) throw fail(404, "Ziehung nicht gefunden");
        const d = s.draws[i]; s.draws.splice(i, 1); save(true);
        [d.id + ".mp4", d.id + "-cover.png", d.id + "-poster.jpg"].forEach(f => { try { fs.unlinkSync(path.join(MEDIA, f)); } catch (e) {} });
        return J(res, 200, { ok: true });
      }
      if (p === "/admin/api/mkt/giveaway/protocol" && req.method === "GET") {
        const d = state().draws.find(x => x.id === String(u.searchParams.get("id") || "")); if (!d) throw fail(404, "Ziehung nicht gefunden");
        return send(res, 200, protocol(d), "text/plain; charset=utf-8", { "Content-Disposition": "attachment; filename=\"Gewinnspiel-Protokoll-" + d.brand + "-" + d.at.slice(0, 10) + ".txt\"", "Cache-Control": "no-store" });
      }
      if (p === "/admin/api/mkt/giveaway/file" && req.method === "GET") {
        const d = state().draws.find(x => x.id === String(u.searchParams.get("id") || "")); if (!d || !d.video || !d.video.file) throw fail(404, "Video nicht gefunden");
        const kind = u.searchParams.get("kind") || "video", dl = u.searchParams.get("dl") === "1";
        const f = kind === "cover" ? d.video.cover : kind === "poster" ? (d.video.poster || d.video.cover) : d.video.file, type = /\.png$/.test(f) ? "image/png" : /\.jpg$/.test(f) ? "image/jpeg" : "video/mp4";
        return sendFile(req, res, path.join(MEDIA, f), type, dl ? ("Gewinnspiel-" + d.brand + "-" + d.at.slice(0, 10) + (kind === "cover" ? ".png" : ".mp4")) : "");
      }
      if (p === "/admin/api/mkt/brand" && req.method === "POST") {
        const pl = await body(req, 3e6), b = brand(pl.key), pa = pl.patch || {};
        ["name", "url", "appStoreUrl", "playStoreUrl", "oneLiner", "whatItIs", "audience", "tone", "seasonality", "guardrails", "logoBg", "standing"].forEach(k => { if (pa[k] !== undefined) b[k] = clip(pa[k], k === "whatItIs" || k === "standing" ? 1500 : 600); });
        ["usps", "pillars", "hashtags", "ctas", "handles"].forEach(k => { if (Array.isArray(pa[k])) b[k] = pa[k].map(x => clip(x, 160)).filter(Boolean).slice(0, 40); });
        if (pa.colors && typeof pa.colors === "object") { b.colors = Object.assign({}, b.colors); ["primary", "dark", "light", "ink", "accent"].forEach(k => { if (/^#[0-9a-f]{6}$/i.test(String(pa.colors[k] || ""))) b.colors[k] = pa.colors[k]; }); }
        if (pa.enabled !== undefined) b.enabled = !!pa.enabled;
        if (pa.logoData) {   // Logo hochladen: data:image/png|jpeg|svg+xml;base64,…
          const m = String(pa.logoData).match(/^data:image\/(png|jpeg|svg\+xml);base64,([A-Za-z0-9+/=]+)$/); if (!m) throw fail(400, "Logo bitte als PNG, JPG oder SVG");
          const buf = Buffer.from(m[2], "base64"); if (buf.length > 3e6) throw fail(400, "Logo zu groß (max. 3 MB)");
          if (m[1] === "svg+xml" && /<script|on\w+\s*=|javascript:/i.test(buf.toString("utf8"))) throw fail(400, "Dieses SVG enthält Skripte");
          ["png", "jpg", "svg"].forEach(x => { try { fs.unlinkSync(path.join(DIR, "logo-" + b.key + "." + x)); } catch (e) {} });
          fs.writeFileSync(path.join(DIR, "logo-" + b.key + "." + (m[1] === "jpeg" ? "jpg" : m[1] === "svg+xml" ? "svg" : "png")), buf); delete LOGO_CACHE[b.key];
        }
        if (pa.logoReset) { ["png", "jpg", "svg"].forEach(x => { try { fs.unlinkSync(path.join(DIR, "logo-" + b.key + "." + x)); } catch (e) {} }); delete LOGO_CACHE[b.key]; }
        save(true); return J(res, 200, { ok: true, brand: brandPublic(b) });
      }
      if (p === "/admin/api/mkt/logo" && req.method === "GET") {
        const b = brand(u.searchParams.get("key")), l = await logoData(b); if (!l) return J(res, 404, { ok: false, error: "Kein Logo" });
        const m = l.uri.match(/^data:([^;]+);base64,(.*)$/); const buf = Buffer.from(m[2], "base64");
        res.writeHead(200, { "Content-Type": m[1], "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" }); return res.end(buf);
      }
      if (p === "/admin/api/mkt/giveaway/post" && req.method === "POST") {   // Gewinnspiel-Video als Reel in den Planer
        const pl = await body(req, 10000), d = state().draws.find(x => x.id === String(pl.id || "")); if (!d) throw fail(404, "Ziehung nicht gefunden");
        const post = POSTS.giveawayPost(d); d.postId = post.id; save(true); return J(res, 200, { ok: true, postId: post.id });
      }
      if (await POSTS.handleAdmin(req, res, u, p)) return;
      return J(res, 404, { ok: false, error: "Nicht gefunden" });
    } catch (e) { if (!res.headersSent) return J(res, e.status || 500, { ok: false, error: String(e.message || e).slice(0, 300) }); try { res.end(); } catch (e2) {} }
  }
  function handlePublic(req, res, p) { try { return POSTS.handlePublic(req, res, p); } catch (e) { return J(res, 404, { ok: false }); } }
  return { handleAdmin, handlePublic, tick: () => POSTS.tick(), googleApp: () => POSTS.appCfg("google"), _test: { parseParticipants, drawIndices, protocol, kochduRange, state, draw, runQueue: () => runQueue(), queue: Q, posts: POSTS, publisher: PUB } };
};
