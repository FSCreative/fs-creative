// WhatsApp Business im Cockpit – nur lesen (Seite „Chat“ → Umschalter „WhatsApp“, admin-cockpit/zwa.js). Das Cockpit sendet nie WhatsApp-Nachrichten.
// Weg: offizielle WhatsApp Business Platform (Cloud API) mit „Coexistence“ – die WhatsApp-Business-App am Handy läuft normal weiter, Meta schickt Webhooks:
//  • messages (eingehend, auch Bearbeiten/Löschen/Reaktionen), smb_message_echoes (am Handy oder in WhatsApp Web/Mac gesendet),
//  • history (Verlauf bis 6 Monate, nur einmal), smb_app_state_sync (Kontakte), account_update (getrennt/wieder verbunden).
// Verbinden: eigene Meta-App + Embedded Signup auf /admin/wa/connect (eigene CSP für connect.facebook.net) → Code → Token am Server (mit App-Geheimnis)
//  → App am WhatsApp-Konto (WABA) abonnieren → Nummer lesen → gleich Kontakte und Verlauf anfordern (je nur einmal, nur 24 h nach dem Verbinden).
//  Nie /register oder deregister aufrufen – die Nummer gehört weiter der App am Handy.
// Webhook: GET/POST /api/whatsapp/webhook – GET prüft hub.verify_token, POST prüft X-Hub-Signature-256 (HMAC-SHA256 mit dem App-Geheimnis über die Rohdaten),
//  antwortet sofort 200 und verarbeitet danach (Meta wiederholt bis 7 Tage → doppelte Nachrichten über die wamid aussortiert).
// Speicher DATA_DIR/whatsapp/: settings.json (App-Geheimnis, Token, Prüf-Token AES-256-GCM, Schlüssel aus ADMIN_AUTH_SECRET), index.json (Chats, Kontakte, Profilnamen),
//  chats/<wa_id>.json (Nachrichten, max. 5000 je Chat), media/<sha256>.<ext> (sofort geladen – Medien-IDs verfallen nach 7 Tagen, max. 100 MB), queue.json (offene Downloads).
// Aufbewahrung: Standard 12 Monate (im Cockpit einstellbar), Bereinigung täglich. Ersatzweise Railway-Variablen WA_APP_ID, WA_APP_SECRET, WA_CONFIG_ID, WA_VERIFY_TOKEN.
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");

module.exports = function (D) {
  const send = D.send, doFetch = D.fetchImpl || ((u, o) => fetch(u, o));
  const GRAPH = String(D.graphBase || process.env.WA_GRAPH_BASE || "https://graph.facebook.com").replace(/\/+$/, ""), GV = process.env.WA_GRAPH_VERSION || "v26.0";
  const PUBLIC = String(D.publicBase || "https://www.fs-creative.at").replace(/\/+$/, ""), HOOK = "/api/whatsapp/webhook";
  const FIELDS = ["messages", "smb_message_echoes", "history", "smb_app_state_sync", "account_update"];
  const DIR = path.join(D.DATA_DIR || __dirname, "whatsapp"), CHATS = path.join(DIR, "chats"), MEDIA = path.join(DIR, "media");
  try { fs.mkdirSync(CHATS, { recursive: true }); fs.mkdirSync(MEDIA, { recursive: true }); } catch (e) {}
  const SET_FILE = path.join(DIR, "settings.json"), IDX_FILE = path.join(DIR, "index.json"), Q_FILE = path.join(DIR, "queue.json");
  const MAX_MSG = 5000, MAX_MEDIA = 100 * 1024 * 1024, MAX_HOOK = 5 * 1024 * 1024, DAY = 86400000, UA = "FS-Cockpit/1.0 (+https://www.fs-creative.at)";
  const J = (res, code, o) => send(res, code, JSON.stringify(o), "application/json; charset=utf-8", { "Cache-Control": "no-store" });
  const fail = (status, msg, extra) => Object.assign(new Error(msg), { status }, extra || {});
  const clip = (v, n) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, n);
  const arr = v => (Array.isArray(v) ? v : []);
  const nowIso = () => new Date().toISOString();
  const digits = v => String(v == null ? "" : v).replace(/\D/g, "").replace(/^00/, "").slice(0, 20);
  const tsIso = v => { const n = +v; return new Date(n > 0 ? (n < 1e12 ? n * 1000 : n) : Date.now()).toISOString(); };
  const env = k => String(process.env[k] || "").trim();
  const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); };
  const fmtNum = d => { d = digits(d); const m = d.match(/^(43|49|41|39)(\d{3})(\d+)$/); return d ? (m ? "+" + m[1] + " " + m[2] + " " + m[3] : "+" + d) : ""; };
  const qs = o => Object.keys(o).map(k => encodeURIComponent(k) + "=" + encodeURIComponent(o[k])).join("&");
  function writeJson(f, o, mode) { const tmp = f + "." + process.pid + "-" + crypto.randomBytes(3).toString("hex") + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(o), mode ? { mode } : undefined); fs.renameSync(tmp, f); }
  function readJsonFile(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } }

  // ───────────── Einstellungen (Geheimes verschlüsselt, nie zurück ans Cockpit) ─────────────
  const KEY = crypto.createHash("sha256").update("whatsapp|" + String(D.secret || "")).digest();
  function seal(t) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", KEY, iv), e = Buffer.concat([c.update(String(t), "utf8"), c.final()]); return [iv, c.getAuthTag(), e].map(b => b.toString("base64")).join("."); }
  function unseal(x) { try { const [iv, tag, e] = String(x).split(".").map(v => Buffer.from(v, "base64")); const d = crypto.createDecipheriv("aes-256-gcm", KEY, iv); d.setAuthTag(tag); return Buffer.concat([d.update(e), d.final()]).toString("utf8"); } catch (err) { return ""; } }
  const SEALED = ["appSecret", "accessToken", "verifyToken"];
  let SET = null;
  function settings() {
    if (SET) return SET;
    const o = readJsonFile(SET_FILE) || {};
    SEALED.forEach(k => { o[k] = o[k] ? unseal(o[k]) : ""; });
    o.sync = o.sync && typeof o.sync === "object" ? o.sync : {}; o.sync.contacts = o.sync.contacts || {}; o.sync.history = o.sync.history || {};
    return (SET = o);
  }
  function saveSettings() { const o = Object.assign({}, SET); SEALED.forEach(k => { o[k] = SET[k] ? seal(SET[k]) : ""; }); writeJson(SET_FILE, o, 0o600); }
  // Werte aus dem Cockpit gehen vor, sonst Railway-Variablen; Prüf-Token: WA_VERIFY_TOKEN, sonst einmal zufällig erzeugt
  function cfg() {
    const s = settings();
    if (!env("WA_VERIFY_TOKEN") && !s.verifyToken) { s.verifyToken = crypto.randomBytes(18).toString("base64url"); saveSettings(); }
    return { appId: s.appId || env("WA_APP_ID"), appSecret: s.appSecret || env("WA_APP_SECRET"), configId: s.configId || env("WA_CONFIG_ID"), verifyToken: env("WA_VERIFY_TOKEN") || s.verifyToken };
  }
  const retention = () => Math.min(120, Math.max(1, +settings().retentionMonths || 12));
  function cutoff(now) { const d = new Date(now || Date.now()); d.setMonth(d.getMonth() - retention()); return d.toISOString(); }

  // ───────────── Chats: Übersicht im Speicher, Nachrichten je Chat als Datei ─────────────
  let IDX = null;
  function idx() { if (IDX) return IDX; const o = readJsonFile(IDX_FILE) || {}; ["chats", "contacts", "profiles"].forEach(k => { if (!o[k] || typeof o[k] !== "object") o[k] = {}; }); o.rev = +o.rev || 0; return (IDX = o); }
  function saveIdx() { idx().rev++; writeJson(IDX_FILE, IDX); }
  const nameOf = id => idx().contacts[id] || idx().profiles[id] || "";
  const CACHE = new Map(), IDS = new WeakMap();
  const chatFile = id => path.join(CHATS, id + ".json");
  function peekChat(id) { if (CACHE.has(id)) return CACHE.get(id); const c = readJsonFile(chatFile(id)); return c && Array.isArray(c.messages) ? c : { waId: id, messages: [] }; }
  function loadChat(id) { let c = CACHE.get(id); if (c) CACHE.delete(id); else c = peekChat(id); CACHE.set(id, c); if (CACHE.size > 60) CACHE.delete(CACHE.keys().next().value); return c; }
  function byId(c) { let m = IDS.get(c); if (!m) { m = new Map(c.messages.map(x => [x.id, x])); IDS.set(c, m); } return m; }
  const find = (c, id) => (id ? byId(c).get(id) || null : null);
  function addMsg(c, o) { if (!o.id || o.at < cutoff() || byId(c).has(o.id)) return false; c.messages.push(o); byId(c).set(o.id, o); return true; }
  function entry(id) { const ix = idx(); return ix.chats[id] || (ix.chats[id] = { waId: id, unread: 0 }); }
  // nach Änderungen: sortieren, auf 5000 kürzen, speichern, Übersicht nachziehen (leerer Chat → weg)
  function finish(c) {
    c.messages.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    if (c.messages.length > MAX_MSG) { c.messages.splice(0, c.messages.length - MAX_MSG); IDS.delete(c); }
    const ix = idx(), vis = c.messages.filter(m => !m.ghost);
    if (!vis.length) { delete ix.chats[c.waId]; CACHE.delete(c.waId); try { fs.unlinkSync(chatFile(c.waId)); } catch (e) {} return; }
    writeJson(chatFile(c.waId), c);
    const e = entry(c.waId), last = vis[vis.length - 1];
    e.count = vis.length; e.lastAt = last.at; e.last = { dir: last.dir, text: preview(last).slice(0, 140) };
  }
  function preview(m) {
    if (m.deleted) return "Nachricht gelöscht";
    const t = m.media ? m.caption : m.text;
    if (m.type === "document") return "Dokument" + (m.media && m.media.name ? ": " + m.media.name : "") + (t ? " – " + t : "");
    if (m.type === "location") return "Standort" + (m.loc && (m.loc.name || m.loc.address) ? ": " + (m.loc.name || m.loc.address) : "");
    if (m.type === "contacts") return "Kontakt: " + String(m.text || "").split("\n")[0];
    const L = { image: "Foto", video: "Video", audio: m.voice ? "Sprachnachricht" : "Audio", sticker: "Sticker" }[m.type];
    return L ? L + (t ? ": " + t : "") : String(t || (m.type === "unsupported" ? "Nachricht (nur in der App sichtbar)" : ""));
  }

  // ───────────── Nachrichten aus den Webhooks übernehmen ─────────────
  const MEDIA_T = ["image", "video", "audio", "document", "sticker"], RANK = { sent: 1, delivered: 2, read: 3, played: 4, failed: 9 };
  function conv(m, dir) {
    const t = String(m.type || "unknown"), o = { id: clip(m.id, 200), dir, at: tsIso(m.timestamp), type: t }, ctx = m.context || {};
    if (ctx.id) o.reply_to = clip(ctx.id, 200);
    if (ctx.forwarded || ctx.frequently_forwarded) o.fwd = true;
    if (t === "text") o.text = clip(m.text && m.text.body, 8000);
    else if (MEDIA_T.indexOf(t) > -1) {
      const x = m[t] || {}; o.caption = clip(x.caption, 3000);
      o.media = { mid: clip(x.id, 100), mime: clip(x.mime_type, 120), name: clip(x.filename, 200), status: x.id ? "wartet" : "fehlt" };
      if (t === "audio" && x.voice) o.voice = true;
    } else if (t === "location") { const l = m.location || {}; o.loc = { lat: +l.latitude || 0, lng: +l.longitude || 0, name: clip(l.name, 200), address: clip(l.address, 300) }; }
    else if (t === "contacts") o.text = arr(m.contacts).slice(0, 10).map(c => [c.name && (c.name.formatted_name || [c.name.first_name, c.name.last_name].filter(Boolean).join(" ")), arr(c.phones).map(p => p.phone || p.wa_id).filter(Boolean).join(", ")].filter(Boolean).join(" – ")).join("\n").slice(0, 2000);
    else if (t === "interactive") { const i = m.interactive || {}, r = i.button_reply || i.list_reply || {}; o.text = clip(r.title || (i.nfm_reply && (i.nfm_reply.body || i.nfm_reply.name)), 2000) + (i.list_reply && i.list_reply.description ? "\n" + clip(i.list_reply.description, 500) : ""); }
    else if (t === "button") o.text = clip(m.button && (m.button.text || m.button.payload), 2000);
    else if (t === "order") o.text = "Bestellung (" + arr(m.order && m.order.product_items).length + " Artikel)" + (m.order && m.order.text ? ": " + clip(m.order.text, 1000) : "");
    else if (t === "system") o.text = clip(m.system && m.system.body, 2000);
    else { o.type = "unsupported"; o.text = ""; }
    return o;
  }
  // Bearbeiten/Löschen: Ziel-ID im Unterobjekt (original_message_id) – fehlt das Original noch, merken wir uns die ID (kommt es später, bleibt es so)
  const targetOf = (m, k) => { const x = m[k] || {}; return clip(x.original_message_id || x.message_id || x.id || (m.context && m.context.id), 200); };
  function edit(c, m, dir) {
    const id = targetOf(m, "edit"); if (!id) return false;
    const x = m.edit || {}, nm = x.message || x, nt = clip((nm.text && nm.text.body) || (typeof nm.text === "string" ? nm.text : "") || nm.body || (nm[nm.type] && nm[nm.type].caption), 8000);
    let tg = find(c, id); if (!tg) { tg = { id, dir, at: tsIso(m.timestamp), type: "text", text: "" }; if (!addMsg(c, tg)) return false; }
    if (tg.deleted) return false;
    if (tg.media) tg.caption = nt; else tg.text = nt;
    tg.edited = tsIso(m.timestamp); return true;
  }
  function revoke(c, m, dir) {
    const id = targetOf(m, "revoke"); if (!id) return false;
    let tg = find(c, id); if (!tg) { tg = { id, dir, at: tsIso(m.timestamp), type: "text", ghost: 1 }; if (!addMsg(c, tg)) return false; }   // Original nie gesehen: unsichtbar, blockt es nur
    tg.deleted = tsIso(m.timestamp); tg.text = ""; tg.caption = ""; delete tg.loc; delete tg.reactions; if (tg.media) tg.media = { status: "gelöscht" };
    return true;
  }
  function react(c, m, dir) {
    const r = m.reaction || {}, tg = find(c, clip(r.message_id, 200)); if (!tg || tg.deleted) return false;
    tg.reactions = tg.reactions || {}; if (r.emoji) tg.reactions[dir] = clip(r.emoji, 16); else delete tg.reactions[dir];
    if (!Object.keys(tg.reactions).length) delete tg.reactions;
    return true;
  }
  function onLive(B, m, dir) {
    if (!m || !m.id || m.group_id || (m.context && m.context.group_id)) return;   // Gruppen werden nicht unterstützt
    const id = digits(dir === "in" ? m.from : m.to); if (!id) return;
    const c = B.get(id), t = String(m.type || "");
    if (t === "reaction") { if (react(c, m, dir)) B.dirty.add(id); return; }
    if (t === "edit" || t === "revoke") { if ((t === "edit" ? edit : revoke)(c, m, dir)) { B.dirty.add(id); entry(id); } return; }
    const o = conv(m, dir); if (!addMsg(c, o)) return;   // schon gespeichert (Meta wiederholt Webhooks) oder älter als die Aufbewahrung
    B.dirty.add(id); const e = entry(id);
    if (dir === "in") { e.unread = (+e.unread || 0) + 1; B.push.set(id, o); } else { e.unread = 0; B.push.delete(id); }   // am Handy geantwortet = gelesen
    if (o.media && o.media.mid) B.media.push([id, o]);
  }
  function onStatus(B, st) {
    const id = digits(st && st.recipient_id); if (!id || !idx().chats[id]) return;
    const c = B.get(id), tg = find(c, clip(st.id, 200)), v = String(st.status || "").toLowerCase();
    if (!tg || tg.dir !== "out" || !RANK[v] || (RANK[tg.status] || 0) >= RANK[v]) return;
    tg.status = v; B.dirty.add(id);
  }
  function onHistory(B, h) {
    const hs = settings().sync.history;
    if (arr(h && h.errors).length) { const er = h.errors[0]; hs.error = +er.code === 2593109 ? "Der Verlauf wurde in der WhatsApp-App nicht freigegeben – es kommen nur neue Nachrichten." : clip(er.title || er.message || "Fehler " + er.code, 300); return; }
    const md = (h && h.metadata) || {};
    if (md.progress != null) hs.progress = Math.max(+hs.progress || 0, Math.min(100, +md.progress || 0));
    if (md.phase != null) hs.phase = +md.phase;
    hs.chunks = (+hs.chunks || 0) + 1; hs.lastAt = nowIso(); if (hs.progress >= 100 && !hs.doneAt) hs.doneAt = nowIso();
    for (const th of arr(h && h.threads)) {
      const id = digits(th.id); if (!id) continue; const c = B.get(id); let n = 0;
      for (const m of arr(th.messages)) {
        if (!m || !m.id || m.type === "media_placeholder") continue;   // das echte Medium kommt später mit derselben ID
        const dir = digits(m.from) === id ? "in" : "out", t = String(m.type || "");
        if (t === "reaction") { if (react(c, m, dir)) n++; continue; }
        if (t === "edit" || t === "revoke") { if ((t === "edit" ? edit : revoke)(c, m, dir)) n++; continue; }
        const o = conv(m, dir), hc = m.history_context || {}; o.hist = 1;
        if (dir === "out" && RANK[String(hc.status || "").toLowerCase()]) o.status = String(hc.status).toLowerCase();
        if (addMsg(c, o)) { n++; if (o.media && o.media.mid) B.media.push([id, o]); }
      }
      if (n) { B.dirty.add(id); entry(id); }
    }
  }
  function onContact(x) {
    if (!x || (x.type && x.type !== "contact")) return;
    const ct = x.contact || {}, num = digits(ct.phone_number || ct.wa_id), ix = idx(), k = settings().sync.contacts; if (!num) return;
    if (String(x.action || "add") === "remove") delete ix.contacts[num];
    else { const nm = clip(ct.full_name || [ct.first_name, ct.last_name].filter(Boolean).join(" ") || ct.business_name, 120); if (nm) ix.contacts[num] = nm; }
    k.lastAt = nowIso();
  }
  function accountUpdate(v) { const ev = clip(v && v.event, 60).toUpperCase(); if (!ev) return; const info = v.disconnection_info || v.ban_info || v.violation_info || v.restriction_info; settings().account = { event: ev, at: nowIso(), info: info ? clip(JSON.stringify(info), 300) : "" }; }
  function notify(id, o) { if (!D.push) return; const nm = nameOf(id) || fmtNum(id); Promise.resolve().then(() => D.push("wa", { title: "WhatsApp: " + nm, body: preview(o).slice(0, 80), url: "/admin#chat", tag: "wa-" + id })).catch(() => {}); }

  function ingest(body) {
    const s = settings(), B = { chats: new Map(), dirty: new Set(), push: new Map(), media: [], get: id => { let c = B.chats.get(id); if (!c) { c = loadChat(id); B.chats.set(id, c); } return c; } };
    s.lastWebhookAt = nowIso();
    for (const e of arr(body && body.entry)) for (const ch of arr(e && e.changes)) {
      const f = clip(ch && ch.field, 40), v = (ch && ch.value) || {}; s.lastWebhookField = f;
      if (s.wabaId && e.id && String(e.id) !== s.wabaId) continue;   // anderes WhatsApp-Konto oder Test-Webhook aus dem Meta-Dashboard
      if (f === "account_update") { accountUpdate(v); continue; }
      if (!s.phoneNumberId || (v.metadata && v.metadata.phone_number_id && String(v.metadata.phone_number_id) !== s.phoneNumberId)) continue;   // nicht (mehr) verbunden / andere Nummer
      if (f === "messages") {
        arr(v.contacts).forEach(x => { const id = digits(x && x.wa_id), nm = clip(x && x.profile && x.profile.name, 120); if (id && nm) idx().profiles[id] = nm; });
        arr(v.messages).forEach(m => onLive(B, m, "in")); arr(v.statuses).forEach(x => onStatus(B, x));
        if (arr(v.errors).length) s.lastError = "Meta: " + clip(v.errors[0].title || v.errors[0].message, 200);
      } else if (f === "smb_message_echoes") arr(v.message_echoes).forEach(m => onLive(B, m, "out"));
      else if (f === "history") arr(v.history).forEach(h => onHistory(B, h));
      else if (f === "smb_app_state_sync") arr(v.state_sync).forEach(onContact);
    }
    B.dirty.forEach(id => finish(B.chats.get(id)));
    B.media.forEach(([id, o]) => { if (idx().chats[id]) enqueue(id, o); });
    saveIdx(); saveSettings();
    B.push.forEach((o, id) => notify(id, o));
    if (B.media.length) kick();
  }

  // ───────────── Medien: sofort laden (IDs verfallen nach 7 Tagen), nacheinander, mit Wiederholung ─────────────
  let Q = null, QRUN = null, QT = null;
  function queue() { if (!Q) { Q = readJsonFile(Q_FILE); if (!Array.isArray(Q)) Q = []; } return Q; }
  const saveQ = () => writeJson(Q_FILE, queue());
  function enqueue(id, o) { const q = queue(); if (q.some(j => j.c === id && j.m === o.id)) return; q.push({ c: id, m: o.id, mid: o.media.mid, tries: 0, next: 0, added: Date.now() }); saveQ(); }
  function kick(force) { if (!QRUN) QRUN = runQueue(force).catch(e => console.error("WhatsApp-Medien:", e && e.message)).then(() => { QRUN = null; }); return QRUN; }
  const BACKOFF = [30e3, 120e3, 600e3, 3600e3];
  async function runQueue(force) {
    const tried = new Set();
    for (;;) {
      if (!settings().accessToken) return;
      const now = Date.now(), j = queue().find(x => !tried.has(x) && (force || (+x.next || 0) <= now));
      if (!j) { const q = queue(); if (q.length) { const nx = Math.min.apply(null, q.map(x => +x.next || 0)); clearTimeout(QT); QT = setTimeout(() => kick(), Math.max(1000, nx - now)); if (QT.unref) QT.unref(); } return; }
      let r; try { r = await download(j); } catch (e) { r = { error: e }; }
      const q = queue(), i = q.indexOf(j);
      if (r.error && r.error.code === 190) { settings().lastError = "WhatsApp-Zugang abgelaufen oder entzogen – bitte neu verbinden."; saveSettings(); j.next = Date.now() + 3600e3; saveQ(); return; }
      if (r.error) {
        j.tries = (+j.tries || 0) + 1; j.err = clip(r.error.message, 200);
        if (r.error.retry === false || j.tries > BACKOFF.length) { if (i > -1) q.splice(i, 1); setMedia(j, { status: r.error.mstatus || "fehler" }); }
        else { j.next = Date.now() + BACKOFF[j.tries - 1]; if (!force) tried.add(j); }
      } else { if (i > -1) q.splice(i, 1); if (!r.drop) setMedia(j, r); }
      saveQ();
    }
  }
  function setMedia(j, r) {
    if (!idx().chats[j.c]) return; const c = loadChat(j.c), m = find(c, j.m);   // frisch holen – während des Downloads kann sich der Chat geändert haben
    if (!m || !m.media || m.media.mid !== j.mid) return;
    Object.assign(m.media, r); writeJson(chatFile(c.waId), c); saveIdx();
  }
  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/3gpp": "3gp", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/amr": "amr", "audio/mp4": "m4a", "application/pdf": "pdf" };
  const cleanMime = v => { const t = String(v || "").split(";")[0].trim().toLowerCase(); return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(t) ? t : "application/octet-stream"; };
  const extFor = (mime, name) => EXT[mime] || ((String(name || "").match(/\.([a-z0-9]{1,8})$/i) || [])[1] || "bin").toLowerCase();
  // Bearer-Token nur an Meta-Adressen (bzw. dieselbe Adresse wie die Graph-API, z. B. im Test)
  const mediaHostOk = u => (u.protocol === "https:" && /(^|\.)(fbsbx\.com|facebook\.com|fbcdn\.net|whatsapp\.net)$/i.test(u.hostname)) || u.host === new URL(GRAPH).host;
  async function download(j) {
    const c0 = idx().chats[j.c] ? peekChat(j.c) : null, m0 = c0 && c0.messages.find(x => x.id === j.m);
    if (!m0 || !m0.media || m0.media.mid !== j.mid || m0.deleted) return { drop: true };
    if (Date.now() - (+j.added || 0) > 7 * DAY) throw fail(410, "abgelaufen", { retry: false, mstatus: "abgelaufen" });
    const meta = await graph("GET", "/" + encodeURIComponent(j.mid));
    if (+meta.file_size > MAX_MEDIA) throw fail(413, "zu groß", { retry: false, mstatus: "zu groß" });
    let url; try { url = new URL(meta.url); } catch (e) { throw fail(502, "Keine Medien-Adresse von Meta", { retry: false }); }
    if (!mediaHostOk(url)) throw fail(502, "Unbekannte Medien-Adresse", { retry: false });
    let r; try { r = await doFetch(url.href, { headers: { Authorization: "Bearer " + settings().accessToken, "User-Agent": UA }, signal: AbortSignal.timeout(600000) }); }
    catch (e) { throw fail(502, "Medium nicht erreichbar"); }
    if (!r.ok || !r.body) { if (r.body) r.body.cancel().catch(() => {}); throw fail(502, "Medium: HTTP " + r.status, { retry: r.status !== 404 && r.status !== 410 }); }
    const mime = cleanMime(meta.mime_type || m0.media.mime), tmp = path.join(MEDIA, ".dl-" + crypto.randomBytes(6).toString("hex")), h = crypto.createHash("sha256"), ws = fs.createWriteStream(tmp, { mode: 0o600 });
    let n = 0;
    try {
      for await (const ch of r.body) {
        n += ch.length; if (n > MAX_MEDIA) throw fail(413, "zu groß", { retry: false, mstatus: "zu groß" });
        h.update(ch); if (!ws.write(ch)) await new Promise(ok => ws.once("drain", ok));
      }
      await new Promise((ok, no) => { ws.on("error", no); ws.end(ok); });
    } catch (e) { ws.destroy(); try { fs.unlinkSync(tmp); } catch (x) {} throw e; }
    const file = h.digest("hex") + "." + extFor(mime, m0.media.name), dest = path.join(MEDIA, file);
    if (fs.existsSync(dest)) fs.unlinkSync(tmp); else fs.renameSync(tmp, dest);
    return { status: "ok", file, mime, size: n };
  }

  // ───────────── Graph-API ─────────────
  async function gfetch(url, init) {
    let r; try { r = await doFetch(url, Object.assign({ signal: AbortSignal.timeout(30000) }, init)); }
    catch (e) { throw fail(502, "Meta nicht erreichbar" + (e && e.name === "TimeoutError" ? " (Zeitüberschreitung)" : "")); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || (j && j.error)) { const er = (j && j.error) || {}; throw fail(r.status >= 500 ? 502 : 400, "Meta: " + clip(er.error_user_msg || er.message || "HTTP " + r.status, 300), { code: er.code, retry: r.status >= 500 || r.status === 429 }); }
    return j || {};
  }
  function graph(method, p, body, token) {
    const tok = token || settings().accessToken; if (!tok) return Promise.reject(fail(400, "Nicht mit WhatsApp verbunden"));
    const h = { Authorization: "Bearer " + tok, Accept: "application/json", "User-Agent": UA }; if (body) h["Content-Type"] = "application/json";
    return gfetch(GRAPH + "/" + GV + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  }

  // ───────────── Verbinden (Embedded Signup) ─────────────
  const windowOpen = s => !!s.connectedAt && Date.now() < Date.parse(s.connectedAt) + DAY;
  async function requestSync(kind) {
    const s = settings(), st = s.sync[kind]; if (!st) throw fail(400, "Unbekannter Abgleich");
    if (!s.accessToken || !s.phoneNumberId) throw fail(400, "Nicht mit WhatsApp verbunden");
    if (st.requestedAt) throw fail(409, (kind === "history" ? "Der Verlauf" : "Die Kontakte") + " wurde" + (kind === "history" ? "" : "n") + " schon angefordert – das geht nur einmal.");
    if (!windowOpen(s)) throw fail(409, "Die 24 Stunden nach dem Verbinden sind vorbei – Kontakte und Verlauf gibt es jetzt nur nach neuem Verbinden (in der App trennen, dann hier neu verbinden).");
    try { await graph("POST", "/" + s.phoneNumberId + "/smb_app_data", { messaging_product: "whatsapp", sync_type: kind === "history" ? "history" : "smb_app_state_sync" }); }
    catch (e) { st.error = clip(e.message, 300); saveSettings(); throw e; }
    st.requestedAt = nowIso(); st.error = ""; saveSettings(); return st;
  }
  async function connect(pl) {
    const c = cfg(); if (!c.appId || !c.appSecret) throw fail(400, "Erst App-ID und App-Geheimnis im Cockpit eintragen.");
    const code = String(pl.code || "").trim(); if (!code || code.length > 4000 || /\s/.test(code)) throw fail(400, "Kein Code von Facebook erhalten – bitte nochmal verbinden.");
    let waba = digits(pl.wabaId), pid = digits(pl.phoneNumberId), tok = "";
    // 1) Code → Token (der Code gilt nur 30 Sekunden)
    try { tok = String((await gfetch(GRAPH + "/" + GV + "/oauth/access_token?" + qs({ client_id: c.appId, client_secret: c.appSecret, code }), { headers: { Accept: "application/json", "User-Agent": UA } })).access_token || ""); }
    catch (e) { throw fail(400, "Facebook-Code konnte nicht eingelöst werden (" + e.message + "). Er gilt nur 30 Sekunden – bitte nochmal verbinden."); }
    if (!tok) throw fail(400, "Kein Zugang von Meta erhalten – bitte nochmal verbinden.");
    // 2) fehlen die IDs (Nachricht aus dem Facebook-Fenster kam nicht an) → aus dem Token bzw. dem Konto lesen
    if (!waba) { const d = await gfetch(GRAPH + "/" + GV + "/debug_token?" + qs({ input_token: tok, access_token: c.appId + "|" + c.appSecret }), { headers: { Accept: "application/json" } }).catch(() => ({}));
      const gs = arr(d.data && d.data.granular_scopes), g = gs.find(x => x.scope === "whatsapp_business_management") || gs.find(x => x.scope === "whatsapp_business_messaging"); waba = digits(g && arr(g.target_ids)[0]); }
    if (!waba) throw fail(400, "WhatsApp-Konto nicht erkannt – bitte nochmal verbinden und im Facebook-Fenster bis zum Ende durchklicken.");
    if (!pid) { const l = await graph("GET", "/" + waba + "/phone_numbers?fields=id,display_phone_number,verified_name", null, tok); pid = digits(arr(l.data)[0] && l.data[0].id); }
    if (!pid) throw fail(400, "Keine Telefonnummer im WhatsApp-Konto gefunden.");
    // 3) Webhooks für dieses Konto an unsere App (kein /register, kein deregister – die Nummer bleibt in der App am Handy)
    try { await graph("POST", "/" + waba + "/subscribed_apps", null, tok); } catch (e) { throw fail(400, "Webhooks konnten nicht abonniert werden (" + e.message + ")"); }
    const ph = await graph("GET", "/" + pid + "?fields=display_phone_number,verified_name", null, tok).catch(() => ({}));
    const s = settings();
    Object.assign(s, { accessToken: tok, wabaId: waba, phoneNumberId: pid, displayNumber: clip(ph.display_phone_number, 40), verifiedName: clip(ph.verified_name, 120), connectedAt: nowIso(), account: null, lastError: "", sync: { contacts: {}, history: {} } });
    saveSettings();
    // 4) gleich Kontakte, dann Verlauf anfordern – jeweils nur einmal möglich und nur in den ersten 24 Stunden
    for (const k of ["contacts", "history"]) await requestSync(k).catch(e => console.error("WhatsApp-Abgleich " + k + ":", e.message));
    kick();
    return status();
  }
  async function disconnect(pl) {
    if (pl.confirm !== true) throw fail(400, "Bestätigung fehlt");
    const s = settings();
    if (s.wabaId && s.accessToken) await graph("DELETE", "/" + s.wabaId + "/subscribed_apps").catch(() => {});   // nur die Webhooks abbestellen – nie deregister
    ["accessToken", "wabaId", "phoneNumberId", "displayNumber", "verifiedName", "connectedAt", "account", "lastError"].forEach(k => { delete s[k]; });
    s.sync = { contacts: {}, history: {} }; saveSettings();
    if (pl.deleteData === true) wipe();
    return status();
  }
  function wipe() {
    CACHE.clear(); const rev = idx().rev; IDX = { chats: {}, contacts: {}, profiles: {}, rev }; saveIdx(); Q = []; saveQ();
    for (const d of [CHATS, MEDIA]) for (const f of fs.readdirSync(d)) { try { fs.unlinkSync(path.join(d, f)); } catch (e) {} }
  }
  function deleteChat(id) {
    const ix = idx(); if (!ix.chats[id]) throw fail(404, "Chat nicht gefunden");
    delete ix.chats[id]; delete ix.profiles[id]; CACHE.delete(id); try { fs.unlinkSync(chatFile(id)); } catch (e) {}
    Q = queue().filter(j => j.c !== id); saveQ(); saveIdx(); sweepMedia(0);
  }
  // Mediendateien ohne Nachricht dazu löschen (abgebrochene Downloads nach 1 Std.)
  function sweepMedia(minAge) {
    const used = new Set(); let n = 0;
    for (const id of Object.keys(idx().chats)) for (const m of peekChat(id).messages) if (m.media && m.media.file) used.add(m.media.file);
    for (const f of fs.readdirSync(MEDIA)) {
      if (used.has(f)) continue; const fp = path.join(MEDIA, f); let st; try { st = fs.statSync(fp); } catch (e) { continue; }
      if (Date.now() - st.mtimeMs < (/^\.dl-/.test(f) ? 3600e3 : minAge)) continue;
      try { fs.unlinkSync(fp); n++; } catch (e) {}
    }
    return n;
  }
  // Aufbewahrung: ältere Nachrichten (und ihre Medien) löschen – täglich
  function cleanup(now) {
    const cut = cutoff(now), ix = idx(); let removed = 0;
    for (const id of Object.keys(ix.chats)) { const c = loadChat(id), n = c.messages.length; c.messages = c.messages.filter(m => m.at >= cut); if (c.messages.length !== n) { removed += n - c.messages.length; IDS.delete(c); finish(c); } }
    Object.keys(ix.profiles).forEach(k => { if (!ix.chats[k]) delete ix.profiles[k]; });
    Q = queue().filter(j => ix.chats[j.c]); saveQ();
    const files = sweepMedia(10 * 60e3); settings().cleanupAt = new Date(now || Date.now()).toISOString(); saveSettings(); saveIdx();
    return { removed, files };
  }

  // ───────────── Status, Liste, Verlauf ─────────────
  function status() {
    const s = settings(), c = cfg(), ix = idx(), list = Object.values(ix.chats), h = s.sync.history || {}, k = s.sync.contacts || {}, win = s.connectedAt ? Date.parse(s.connectedAt) + DAY : 0;
    return { ok: true, configured: !!(c.appId && c.appSecret && c.configId), appId: c.appId || "", configId: c.configId || "", hasSecret: !!c.appSecret,
      fromEnv: { appId: !s.appId && !!env("WA_APP_ID"), appSecret: !s.appSecret && !!env("WA_APP_SECRET"), configId: !s.configId && !!env("WA_CONFIG_ID"), verifyToken: !!env("WA_VERIFY_TOKEN") },
      webhookUrl: PUBLIC + HOOK, verifyToken: c.verifyToken || "", fields: FIELDS, verifiedAt: s.verifiedAt || "", lastWebhookAt: s.lastWebhookAt || "", lastWebhookField: s.lastWebhookField || "",
      connected: !!(s.accessToken && s.phoneNumberId), number: s.displayNumber || "", name: s.verifiedName || "", wabaId: s.wabaId || "", phoneNumberId: s.phoneNumberId || "", connectedAt: s.connectedAt || "",
      sync: { windowOpen: !!win && Date.now() < win, windowEnds: win ? new Date(win).toISOString() : "",
        contacts: { requestedAt: k.requestedAt || "", error: k.error || "", count: Object.keys(ix.contacts).length, lastAt: k.lastAt || "" },
        history: { requestedAt: h.requestedAt || "", error: h.error || "", progress: +h.progress || 0, phase: h.phase == null ? null : +h.phase, chunks: +h.chunks || 0, doneAt: h.doneAt || "", lastAt: h.lastAt || "" } },
      account: s.account || null, lastError: s.lastError || "", retentionMonths: retention(), cleanupAt: s.cleanupAt || "",
      chats: list.length, unread: list.reduce((a, e) => a + (+e.unread || 0), 0), mediaQueue: queue().length };
  }
  function listChats(q) {
    const ix = idx(), ql = q.toLowerCase(), qd = /^[\d\s+()\/-]{3,}$/.test(q) ? digits(q) : "", out = [];
    for (const e of Object.values(ix.chats)) {
      const o = { id: e.waId, name: nameOf(e.waId), number: fmtNum(e.waId), unread: +e.unread || 0, lastAt: e.lastAt || "", last: e.last || null };
      if (q && !((o.name && o.name.toLowerCase().indexOf(ql) > -1) || (qd && e.waId.indexOf(qd) > -1))) {
        if (ql.length < 2) continue;
        const ms = peekChat(e.waId).messages; let hit = null;   // Volltext: neueste passende Nachricht
        for (let i = ms.length - 1; i >= 0 && !hit; i--) { const m = ms[i]; if (!m.deleted && [m.text, m.caption, m.media && m.media.name, m.loc && m.loc.name].filter(Boolean).join(" ").toLowerCase().indexOf(ql) > -1) hit = m; }
        if (!hit) continue; o.snip = preview(hit).slice(0, 140); o.hitAt = hit.at;
      }
      out.push(o);
    }
    return out.sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0)).slice(0, 500);
  }
  function msgOut(m, c) {
    const o = Object.assign({}, m);
    if (m.media) o.media = { status: m.media.status, mime: m.media.mime || "", size: m.media.size || 0, name: m.media.name || "" };
    if (m.reply_to) { const t = find(c, m.reply_to); if (t) o.quote = { dir: t.dir, text: preview(t).slice(0, 160) }; }
    return o;
  }
  function chatPage(id, before, limit) {
    const e = idx().chats[id]; if (!e) throw fail(404, "Chat nicht gefunden");
    const c = loadChat(id), all = c.messages.filter(m => !m.ghost); let end = all.length;
    if (before) { const i = all.findIndex(m => m.id === before); if (i >= 0) end = i; }
    const start = Math.max(0, end - limit);
    return { chat: { id, name: nameOf(id), number: fmtNum(id), unread: +e.unread || 0, lastAt: e.lastAt || "", count: e.count || all.length }, messages: all.slice(start, end).map(m => msgOut(m, c)), more: start > 0 };
  }
  // Mediendatei ans Cockpit: Bilder/Audio/Video im Browser (mit Teil-Anfragen für Safari), alles andere als Download in einer Sandbox
  function serveMedia(req, res, id, mid, dl) {
    const m = /^\d{5,20}$/.test(id) && idx().chats[id] ? find(loadChat(id), mid) : null, md = m && m.media;
    if (!md || md.status !== "ok" || !/^[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(md.file || "")) return J(res, 404, { ok: false, error: "Medium nicht vorhanden" });
    const file = path.join(MEDIA, md.file); let st; try { st = fs.statSync(file); } catch (e) { return J(res, 404, { ok: false, error: "Medium nicht vorhanden" }); }
    const type = cleanMime(md.mime), inline = !dl && /^(image\/(jpeg|png|gif|webp)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+)$/.test(type);
    const name = (md.name || "whatsapp-" + m.type + "-" + m.at.slice(0, 10) + "." + md.file.split(".").pop()).replace(/[\x00-\x1f]/g, "_");
    const head = { "Content-Type": inline ? type : "application/octet-stream", "Content-Disposition": (inline ? "inline" : "attachment") + "; filename=\"" + name.replace(/[^\x20-\x7e]|["\\]/g, "_") + "\"; filename*=UTF-8''" + encodeURIComponent(name),
      "Cache-Control": "private, max-age=86400", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'" };
    if (req.method === "HEAD") { res.writeHead(200, Object.assign(head, { "Content-Length": st.size })); return res.end(); }
    const range = String(req.headers.range || "").match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1] || range[2])) {
      let a = range[1] ? +range[1] : Math.max(0, st.size - +range[2]), z = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
      if (a >= st.size || a > z) { res.writeHead(416, { "Content-Range": "bytes */" + st.size }); return res.end(); }
      res.writeHead(206, Object.assign(head, { "Content-Range": "bytes " + a + "-" + z + "/" + st.size, "Content-Length": z - a + 1 }));
      return fs.createReadStream(file, { start: a, end: z }).pipe(res);
    }
    res.writeHead(200, Object.assign(head, { "Content-Length": st.size })); fs.createReadStream(file).pipe(res);
  }

  // ───────────── Seite „Verbinden“ (Embedded Signup) – eigene CSP nur für diese Seite ─────────────
  function handleConnectPage(req, res) {
    const c = cfg(), nonce = crypto.randomBytes(16).toString("base64"), ready = !!(c.appId && c.appSecret && c.configId);
    const csp = ["default-src 'self'", "script-src 'nonce-" + nonce + "' https://connect.facebook.net", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https://*.facebook.com https://*.fbcdn.net https://*.facebook.net",
      "frame-src https://*.facebook.com https://*.facebook.net", "connect-src 'self' https://*.facebook.com https://*.facebook.net", "form-action 'none'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'"].join("; ");
    const data = JSON.stringify({ appId: c.appId, configId: c.configId, v: GV }).replace(/</g, "\\u003c");
    const html = '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>WhatsApp verbinden – FS Cockpit</title><style>' +
      ':root{color-scheme:light dark;--bg:#0f1218;--panel:#171b23;--line:#2a303c;--ink:#e9ecf2;--ink3:#97a0b1;--ok:#3ecf8e;--bad:#f87171;--btn:#25d366}@media(prefers-color-scheme:light){:root{--bg:#f4f5f8;--panel:#fff;--line:#e2e5ec;--ink:#151922;--ink3:#5d6677;--ok:#0f8a5f;--bad:#c2364b;--btn:#1fa855}}' +
      'body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:16px;box-sizing:border-box}' +
      'main{max-width:560px;width:100%;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px}h1{font-size:21px;margin:0 0 6px}p{margin:8px 0}ol{padding-left:20px;margin:12px 0}li{margin:5px 0}' +
      'button{font:inherit;font-weight:700;border:0;border-radius:12px;background:var(--btn);color:#fff;padding:13px 20px;cursor:pointer;width:100%;margin-top:8px}button:disabled{opacity:.55;cursor:default}' +
      '#msg{min-height:24px;font-weight:600}#msg.bad{color:var(--bad)}#msg.ok{color:var(--ok)}.small{font-size:13px;color:var(--ink3)}a{color:inherit}</style></head><body><main>' +
      '<h1>WhatsApp Business verbinden</h1><p class="small">Nur lesen: Das Cockpit zeigt deine WhatsApp-Chats an – antworten tust du weiter in der WhatsApp-Business-App.</p>' +
      (ready ? '<ol><li>Auf „Mit WhatsApp Business verbinden“ klicken – ein Facebook-Fenster geht auf.</li><li>Mit deinem Facebook-Konto anmelden und das Unternehmensportfolio von FS Creative wählen.</li>' +
        '<li>„Bestehende WhatsApp Business App verbinden“ wählen und deine Nummer eingeben.</li><li>Am Handy in der WhatsApp-Business-App bestätigen und das Teilen des Chatverlaufs erlauben.</li><li>Die App am Handy offen lassen, bis der Abgleich fertig ist.</li></ol>' +
        '<button id="go" type="button" disabled>Lade Facebook …</button><p id="msg" role="status" aria-live="polite"></p>'
        : '<p id="msg" class="bad">Noch nicht eingerichtet: Bitte zuerst App-ID, App-Geheimnis und Konfigurations-ID im Cockpit unter Chat → WhatsApp eintragen.</p>') +
      '<p class="small"><a href="/admin#chat">Zurück zum Cockpit</a></p></main>' +
      (ready ? '<script nonce="' + nonce + '">(function(){"use strict";var C=' + data + ',code=null,ids=null,sent=false,wait=null,btn=document.getElementById("go"),msg=document.getElementById("msg");' +
        'function say(t,cls){msg.textContent=t;msg.className=cls||"";}' +
        'window.fbAsyncInit=function(){FB.init({appId:C.appId,autoLogAppEvents:true,xfbml:false,version:C.v});btn.disabled=false;btn.textContent="Mit WhatsApp Business verbinden";};' +
        'setTimeout(function(){if(!window.FB){btn.textContent="Facebook nicht geladen";say("Facebook konnte nicht geladen werden – Werbeblocker oder Tracking-Schutz für diese Seite ausschalten und neu laden.","bad");}},15000);' +
        'window.addEventListener("message",function(e){if(!/^https:\\/\\/([a-z0-9-]+\\.)*facebook\\.com$/.test(e.origin))return;var d;try{d=typeof e.data==="string"?JSON.parse(e.data):e.data;}catch(x){return;}' +
          'if(!d||d.type!=="WA_EMBEDDED_SIGNUP")return;var x=d.data||{};' +
          'if(/^FINISH/.test(d.event||"")){ids={wabaId:String(x.waba_id||""),phoneNumberId:String(x.phone_number_id||"")};say("Konto gewählt – verbinde …");go();}' +
          'else if(d.event==="CANCEL"){say("Abgebrochen"+(x.current_step?" (bei: "+x.current_step+")":"")+". Du kannst es nochmal versuchen.","bad");btn.disabled=false;}' +
          'else if(d.event==="ERROR"){say("Fehler bei Facebook: "+(x.error_message||"unbekannt"),"bad");btn.disabled=false;}});' +
        'function go(force){if(sent||!code)return;if(!ids&&!force){clearTimeout(wait);wait=setTimeout(function(){go(true);},4000);return;}sent=true;clearTimeout(wait);' +
          'say("Verbinde … (Zugang holen, Webhooks abonnieren, Kontakte und Verlauf anfordern)");' +
          'fetch("/admin/api/wa/connect",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({code:code,wabaId:ids?ids.wabaId:"",phoneNumberId:ids?ids.phoneNumberId:""})})' +
          '.then(function(r){return r.json().catch(function(){return{ok:false,error:"HTTP "+r.status};});}).then(function(j){' +
            'if(!j||!j.ok){sent=false;code=null;say((j&&j.error)||"Verbinden fehlgeschlagen","bad");btn.disabled=false;return;}' +
            'btn.textContent="Verbunden ✓";say("Verbunden: "+(j.number||"deine Nummer")+(j.name?" ("+j.name+")":"")+". Kontakte und Verlauf werden jetzt abgeglichen – das kann einige Minuten dauern. Die WhatsApp-Business-App am Handy offen lassen.","ok");' +
            'try{if(window.opener&&!window.opener.closed){window.opener.postMessage({type:"fsc-wa-connected"},location.origin);setTimeout(function(){window.close();},6000);return;}}catch(x){}' +
            'setTimeout(function(){location.href="/admin#chat";},6000);})' +
          '.catch(function(){sent=false;code=null;say("Keine Verbindung zum Server.","bad");btn.disabled=false;});}' +
        'btn.addEventListener("click",function(){if(!window.FB)return;btn.disabled=true;code=null;ids=null;sent=false;say("Das Facebook-Fenster ist offen – dort anmelden und die Schritte durchgehen …");' +
          'FB.login(function(r){if(r&&r.authResponse&&r.authResponse.code){code=r.authResponse.code;go();}else if(!sent){say("Anmeldung abgebrochen oder nicht erlaubt.","bad");btn.disabled=false;}},' +
          '{config_id:C.configId,response_type:"code",override_default_response_type:true,extras:{setup:{},featureType:"whatsapp_business_app_onboarding",sessionInfoVersion:"3"}});});' +
        '})();</script><script async defer crossorigin="anonymous" src="https://connect.facebook.net/de_DE/sdk.js" nonce="' + nonce + '"></script>' : '') +
      '</body></html>';
    return send(res, 200, html, "text/html; charset=utf-8", { "Content-Security-Policy": csp, "Cache-Control": "no-store" });
  }

  // ───────────── Webhook (öffentlich) ─────────────
  let CHAIN = Promise.resolve();
  function readBody(req, max) {
    return new Promise((resolve, reject) => { const ch = []; let n = 0;
      req.on("data", d => { n += d.length; if (n > max) { reject(fail(413, "zu groß")); req.destroy(); return; } ch.push(d); });
      req.on("end", () => resolve(Buffer.concat(ch))); req.on("error", reject); });
  }
  async function readJson(req) { const b = await readBody(req, 20000); try { return JSON.parse(b.toString("utf8") || "{}"); } catch (e) { throw fail(400, "Ungültige Anfrage"); } }
  async function handleWebhook(req, res, u) {
    if (req.method === "GET") {
      const c = cfg(), ch = String(u.searchParams.get("hub.challenge") || "");
      if (u.searchParams.get("hub.mode") === "subscribe" && safeEq(u.searchParams.get("hub.verify_token") || "", c.verifyToken || "") && /^[A-Za-z0-9_.-]{1,256}$/.test(ch)) {
        settings().verifiedAt = nowIso(); saveSettings();
        return send(res, 200, ch, "text/plain; charset=utf-8", { "Cache-Control": "no-store" });
      }
      return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    }
    if (req.method !== "POST") return send(res, 405, "", "text/plain", { Allow: "GET, POST" });
    let raw; try { raw = await readBody(req, MAX_HOOK); } catch (e) { return send(res, 413, "Too large", "text/plain"); }
    const secret = cfg().appSecret; if (!secret) return send(res, 503, "nicht eingerichtet", "text/plain; charset=utf-8");   // Meta versucht es später nochmal
    const exp = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
    if (!safeEq(String(req.headers["x-hub-signature-256"] || ""), exp)) return send(res, 401, "invalid signature", "text/plain");
    send(res, 200, "OK", "text/plain");
    let body; try { body = JSON.parse(raw.toString("utf8")); } catch (e) { return; }
    CHAIN = CHAIN.then(() => new Promise(r => setImmediate(r))).then(() => ingest(body)).catch(e => console.error("WhatsApp-Webhook:", e && e.message));
  }

  // ───────────── Cockpit-API /admin/api/wa/… ─────────────
  async function handleAdmin(req, res, u, p) {
    try {
      const q = k => String(u.searchParams.get(k) || ""), POST = req.method === "POST", GET = req.method === "GET" || req.method === "HEAD";
      if (p === "/admin/wa/connect" && GET) return handleConnectPage(req, res);
      if (p === "/admin/api/wa/status" && GET) return J(res, 200, status());
      if (p === "/admin/api/wa/chats" && GET) {
        const ver = String(idx().rev), qq = clip(q("q"), 100);
        if (!qq && q("v") === ver) return J(res, 200, { ok: true, same: true, ver });
        const s = settings(), h = s.sync.history || {};
        return J(res, 200, { ok: true, ver, chats: listChats(qq), unread: Object.values(idx().chats).reduce((a, e) => a + (+e.unread || 0), 0),
          conn: { connected: !!(s.accessToken && s.phoneNumberId), progress: +h.progress || 0, history: !!h.requestedAt, lastWebhookAt: s.lastWebhookAt || "", account: s.account ? s.account.event : "" } });
      }
      if (p === "/admin/api/wa/chat" && GET) { const lim = Math.min(2000, Math.max(1, parseInt(q("limit"), 10) || 150)); return J(res, 200, Object.assign({ ok: true }, chatPage(digits(q("id")), clip(q("before"), 200), lim))); }
      if (p === "/admin/api/wa/media" && GET) return serveMedia(req, res, digits(q("c")), clip(q("m"), 200), q("dl") === "1");
      if (!POST) return J(res, 404, { ok: false, error: "nicht gefunden" });
      const pl = await readJson(req);
      if (p === "/admin/api/wa/read") { const e = idx().chats[digits(pl.id)]; if (!e) throw fail(404, "Chat nicht gefunden"); if (e.unread) { e.unread = 0; saveIdx(); } return J(res, 200, { ok: true }); }
      if (p === "/admin/api/wa/settings") {
        const s = settings(), before = retention();
        if (pl.appId !== undefined) { const v = clip(pl.appId, 40); if (v && !/^\d{5,25}$/.test(v)) throw fail(400, "Die App-ID besteht nur aus Ziffern."); s.appId = v; }
        if (pl.configId !== undefined) { const v = clip(pl.configId, 40); if (v && !/^\d{5,25}$/.test(v)) throw fail(400, "Die Konfigurations-ID besteht nur aus Ziffern."); s.configId = v; }
        if (pl.appSecret) { const v = clip(pl.appSecret, 200); if (!/^[A-Za-z0-9]{16,128}$/.test(v)) throw fail(400, "Das App-Geheimnis sieht nicht richtig aus (32 Zeichen aus „App-Einstellungen → Allgemein“)."); s.appSecret = v; }
        if (pl.retentionMonths !== undefined) { const n = parseInt(pl.retentionMonths, 10); if (!(n >= 1 && n <= 120)) throw fail(400, "Aufbewahrung: 1 bis 120 Monate"); s.retentionMonths = n; }
        if (pl.newVerifyToken === true) { if (env("WA_VERIFY_TOKEN")) throw fail(400, "Der Prüf-Token kommt aus der Railway-Variable WA_VERIFY_TOKEN."); s.verifyToken = crypto.randomBytes(18).toString("base64url"); }
        saveSettings(); if (retention() < before) cleanup();
        return J(res, 200, status());
      }
      if (p === "/admin/api/wa/connect") return J(res, 200, Object.assign(await connect(pl), { ok: true }));
      if (p === "/admin/api/wa/sync") { const k = pl.type === "history" ? "history" : pl.type === "contacts" ? "contacts" : ""; if (!k) throw fail(400, "Unbekannter Abgleich"); await requestSync(k); return J(res, 200, status()); }
      if (p === "/admin/api/wa/delete") { if (pl.confirm !== true) throw fail(400, "Bestätigung fehlt"); deleteChat(digits(pl.id)); return J(res, 200, { ok: true }); }
      if (p === "/admin/api/wa/disconnect") return J(res, 200, await disconnect(pl));
      return J(res, 404, { ok: false, error: "nicht gefunden" });
    } catch (e) {
      if (res.headersSent) { try { res.end(); } catch (x) {} return; }
      const st = e.status || 500; if (st >= 500 && st !== 502) console.error("WhatsApp:", e.message);
      return J(res, st, { ok: false, error: String(e.message || e).slice(0, 400) });
    }
  }

  if (D.background !== false) {   // Medien nach dem Start weiterladen, Bereinigung einmal am Tag
    const t1 = setTimeout(() => kick(), 30e3), t2 = setInterval(() => {
      try { const s = settings(); if (!s.cleanupAt || Date.now() - Date.parse(s.cleanupAt) > 20 * 3600e3) cleanup(); } catch (e) { console.error("WhatsApp-Bereinigung:", e.message); }
      kick();
    }, 3600e3);
    if (t1.unref) t1.unref(); if (t2.unref) t2.unref();
  }
  return { handleAdmin, handleWebhook, handleConnectPage, status,
    _test: { idle: () => CHAIN.then(() => QRUN), media: force => kick(force), cleanup, ingest, settings, queue: () => queue(), reset: () => { SET = null; IDX = null; Q = null; CACHE.clear(); } } };
};
