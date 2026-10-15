"use strict";
// Push-Benachrichtigungen fürs Handy (Web Push; iPhone ab iOS 16.4 nur als „Zum Home-Bildschirm“-App).
// VAPID-Schlüssel werden einmalig am Server erzeugt und in der Datenbank gehalten (nie im Browser sichtbar außer dem öffentlichen Teil).
// Abos je Gerät; Themen: mail (neue Mail im Posteingang), lead (neue Anfrage), fin (Mahnungen/Zahllast/Belege), chat (Website-Chat). Abgelaufene Abos (404/410) fliegen raus.
let webpush = null;   // erst bei Bedarf laden
module.exports = function (D) {
  const { getMeta, setMeta } = D;
  let ST = null;
  async function load() {
    if (ST) return ST;
    if (!webpush) webpush = require("web-push");
    ST = (await getMeta("push").catch(() => null)) || {};
    if (!ST.vapid) { ST.vapid = webpush.generateVAPIDKeys(); ST.subs = ST.subs || []; await setMeta("push", ST); }
    ST.subs = ST.subs || [];
    webpush.setVapidDetails("mailto:office@fs-creative.at", ST.vapid.publicKey, ST.vapid.privateKey);
    return ST;
  }
  const save = () => setMeta("push", ST);
  async function publicKey() { return (await load()).vapid.publicKey; }
  async function subscribe(sub, device, topics) {
    await load(); if (!sub || !sub.endpoint || !sub.keys || !/^https:\/\//.test(sub.endpoint)) throw new Error("Ungültiges Abo");
    ST.subs = ST.subs.filter(s => s.endpoint !== sub.endpoint);
    ST.subs.push({ endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh || ""), auth: String(sub.keys.auth || "") }, device: String(device || "Gerät").slice(0, 80), topics: topics && topics.length ? topics : ["mail", "lead", "fin", "chat"], at: new Date().toISOString() });
    await save(); return { ok: true, count: ST.subs.length };
  }
  async function unsubscribe(endpoint) { await load(); ST.subs = ST.subs.filter(s => s.endpoint !== endpoint); await save(); return { ok: true }; }
  async function setTopics(endpoint, topics) { await load(); const s = ST.subs.find(x => x.endpoint === endpoint); if (s) { s.topics = topics; await save(); } return { ok: !!s }; }
  // an alle Geräte mit dem Thema; tag fasst gleichartige Meldungen zusammen
  async function send(topic, msg) {
    await load(); if (!ST.subs.length) return 0;
    const body = JSON.stringify({ title: String(msg.title || "FS Cockpit").slice(0, 80), body: String(msg.body || "").slice(0, 180), url: msg.url || "/admin", tag: msg.tag || topic });
    let n = 0, dead = [];
    for (const s of ST.subs.filter(x => (x.topics || []).indexOf(topic) > -1)) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 3600, urgency: "normal" }); n++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint); else console.error("Push:", e.statusCode || "", String(e.body || e.message || e).slice(0, 120)); }
    }
    if (dead.length) { ST.subs = ST.subs.filter(s => dead.indexOf(s.endpoint) < 0); await save(); }
    return n;
  }
  async function status(endpoint) { await load(); const s = endpoint && ST.subs.find(x => x.endpoint === endpoint); return { devices: ST.subs.map(x => ({ device: x.device, at: x.at, topics: x.topics })), mine: s ? { topics: s.topics } : null }; }
  // Neue Mails: Posteingang vergleichen, erste Runde nur merken (kein Schwall nach dem Neustart)
  let seen = null;
  async function mailTick(snapshot) {
    await load(); if (!ST.subs.some(s => (s.topics || []).indexOf("mail") > -1)) return;
    const snap = await snapshot(); const msgs = ((snap && snap.messages) || []).filter(m => (m.folder || "INBOX") === "INBOX" && m.id);
    if (!seen) { seen = new Set(msgs.map(m => m.id)); return; }
    const fresh = msgs.filter(m => !seen.has(m.id) && !m.read && !m.deleted); msgs.forEach(m => seen.add(m.id));
    if (!fresh.length) return;
    if (fresh.length === 1) { const m = fresh[0]; await send("mail", { title: m.fromName || m.from || "Neue Mail", body: m.subject || "(ohne Betreff)", url: "/admin#post", tag: "mail-" + m.id }); }
    else await send("mail", { title: fresh.length + " neue Mails", body: fresh.slice(0, 3).map(m => (m.fromName || m.from || "") + ": " + (m.subject || "")).join(" · "), url: "/admin#post", tag: "mail" });
  }
  return { publicKey, subscribe, unsubscribe, setTopics, send, status, mailTick };
};
