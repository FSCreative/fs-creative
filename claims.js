"use strict";
/* Reklamationen (Cockpit „Reklamationen“, admin-cockpit/zclaims.js) – Wunsch Simon 26.11.2026.
   Eine Reklamation: Kunde, Problem, Kategorie, Status-Ablauf (Neu → In Prüfung → Bei Print.com → Lösung vereinbart → Erledigt; Abgelehnt),
   Lösung (Nachdruck, Gutschrift, Teil-/Erstattung, Kulanz), Frist, Verlauf, verknüpfte Mails/Chats/Bestellung/Rechnung.
   Automatische Erkennung: neue Mails im Posteingang (ON_NEW_MAIL) und neue Chat-Nachrichten von Besuchern.
   Erst ein günstiger Stichwort-Vorfilter, dann die KI (ki.claimCheck, Haiku). Sicher (≥ 0,75) → Reklamation wird angelegt,
   unsicher (≥ 0,4) → „Vorschlag“ zum Übernehmen/Verwerfen. Mails im selben Verlauf oder zur selben Bestellung werden an die
   bestehende Reklamation gehängt. Es wird nie etwas an Kunden gesendet und kein Geld bewegt – Antworten nur als Entwurf im Cockpit.
   Die letzten 30 Tage werden beim ersten Start einmal durchsucht und nur als Vorschläge angeboten. */
module.exports = function (D) {
  const { getMeta, setMeta } = D;
  const nowIso = () => new Date().toISOString();
  const clip = (v, n) => String(v == null ? "" : v).replace(/\r/g, "").slice(0, n);
  const low = s => String(s || "").toLowerCase();
  const log = (...a) => console.log("Reklamationen:", ...a);
  const STATUS = ["neu", "pruefung", "printcom", "loesung", "erledigt", "abgelehnt"];
  const OPEN = ["neu", "pruefung", "printcom", "loesung"];
  const RESOL = ["", "nachdruck", "gutschrift", "teilerstattung", "erstattung", "kulanz", "keine"];
  const CATS = ["druck", "farbe", "format", "beschaedigt", "fehlt", "falsch", "lieferung", "rechnung", "sonstiges"];
  const SUGGEST_MIN = 0.4, AUTO_MIN = 0.75, SEEN_MAX = 3000;
  /* Vorfilter: nur Nachrichten mit typischen Reklamations-Wörtern gehen an die KI */
  const KW = /reklam|beanstand|mangel|mängel|mangelhaft|fehlerhaft|\bfehler\b|beschädig|kaputt|zerkratzt|zerknittert|geknickt|eingerissen|verschmiert|unscharf|verpixelt|verschoben|abgeschnitten|falsch(e|en|er|es)? (geliefert|farbe|format|größe|groesse|motiv|anzahl|menge|produkt|artikel|papier|druck)|falsch geliefert|farbe(n)? (stimm|passt|weich|ist|sind) |farbabweich|blasser|zu dunkel|zu hell|stimmt nicht|nicht (angekommen|erhalten|geliefert|bekommen)|noch nicht (angekommen|erhalten|da)|fehl(t|en) (noch|ein|eine|zwei|stück|teil)|unvollständig|zu wenig|verspät|ersatz|nachdruck|neu druck|neu gedruckt|gutschrift|rückerstatt|erstattung|geld zurück|storn|unzufrieden|enttäuscht|ärgerlich|nicht in ordnung|so nicht|qualität|complaint|damaged|wrong|refund|defect/i;
  const OWN = /@fs-creative\.at$|noreply|no-reply|donotreply|mailer-daemon|postmaster|newsletter|notification|notifications@|info@print\.com|@print\.com$|mollie|paypal|stripe|google|facebook|meta|instagram|tiktok|linkedin|railway|github|amazon|world4you|a1\.net|feratel/i;
  const ORDER_RX = /\bD-\d{6}-[A-Z0-9]{4}\b/i, INV_RX = /\bRE-\d{3,6}\b/i;
  const stripHtml = h => String(h || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  /* Nur der neue Teil einer Antwort (zitierte Vorgänger-Mails abschneiden) */
  const fresh = t => { const s = String(t || ""); const cut = s.search(/\n\s*(Am .{5,80}schrieb|On .{5,80}wrote|-----\s*Original|Von:\s.+\n\s*(Gesendet|Datum):|From:\s.+\n\s*(Sent|Date):)/i); return (cut > 40 ? s.slice(0, cut) : s).replace(/\n>.*$/gm, ""); };
  const mailText = m => fresh(m.bodyHtml ? stripHtml(m.body) : String(m.body || m.preview || "")).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const normSubj = s => low(s).replace(/^((re|aw|wg|fw|fwd|antw)\s*:\s*)+/g, "").replace(/\s+/g, " ").trim();
  const addOf = s => { const m = String(s || "").match(/[^\s<>"]+@[^\s<>"]+/); return m ? m[0].toLowerCase() : ""; };

  let ST = null, LOADING = null, busy = false, again = null, chatT = new Map(), scanning = false;
  async function load() {
    if (ST) return ST;
    if (!LOADING) LOADING = (async () => {
      const d = (await getMeta("claims").catch(() => null)) || {};
      ST = { claims: Array.isArray(d.claims) ? d.claims : [], sugg: Array.isArray(d.sugg) ? d.sugg : [], seq: +d.seq || 1000, auto: d.auto !== false,
        since: d.since || nowIso(), scanned: d.scanned || "", lastRun: d.lastRun || null, seen: new Set(Array.isArray(d.seen) ? d.seen : []), dismissed: new Set(Array.isArray(d.dismissed) ? d.dismissed : []) };
      if (!d.since) await save();
    })().catch(e => { LOADING = null; throw e; });
    await LOADING; return ST;
  }
  async function save() {
    const seen = Array.from(ST.seen).slice(-SEEN_MAX), dis = Array.from(ST.dismissed).slice(-SEEN_MAX);
    await setMeta("claims", { claims: ST.claims, sugg: ST.sugg.slice(0, 80), seq: ST.seq, auto: ST.auto, since: ST.since, scanned: ST.scanned, lastRun: ST.lastRun, seen, dismissed: dis });
  }
  const byId = id => ST.claims.find(c => c.id === id);
  const addDays = (iso, n) => { const d = new Date(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const ev = (c, kind, text, by, extra) => { c.timeline = c.timeline || []; c.timeline.push(Object.assign({ at: nowIso(), kind, text: clip(text, 1000), by: by || "simon" }, extra || {})); c.updated = nowIso(); };
  const mailRef = m => ({ id: clip(m.id, 60), messageId: clip(m.messageId, 300), inReplyTo: clip(m.inReplyTo, 300), account: clip(m.account, 40), folder: clip(m.folder || "INBOX", 120), uid: m.uid != null ? +m.uid || 0 : 0,
    subject: clip(m.subject, 300), from: clip(m.from, 200), fromName: clip(m.fromName, 120), date: clip(m.date, 40), text: clip(m.text != null ? m.text : mailText(m), 4000),
    atts: (Array.isArray(m.attachments) ? m.attachments : []).slice(0, 20).map(a => ({ index: clip(a.index, 20), filename: clip(a.filename, 200), contentType: clip(a.contentType, 80), size: +a.size || 0 })) });
  const summary = c => ({ id: c.id, no: c.no, created: c.created, updated: c.updated, status: c.status, resolution: c.resolution || "", title: c.title, problem: c.problem, category: c.category, customer: c.customer,
    orderNr: c.orderNr || "", invoiceNr: c.invoiceNr || "", due: c.due || "", source: c.source, auto: !!c.auto, amount: c.amount || 0, mails: (c.mails || []).length, chats: (c.chats || []).length,
    mailIds: (c.mails || []).map(x => x.id), msgIds: (c.mails || []).map(x => x.messageId).filter(Boolean), convIds: (c.chats || []).map(x => x.convId), unseen: !!c.unseen, pcRef: c.pcRef || "" });
  function view() {
    const counts = {}; STATUS.forEach(s => { counts[s] = 0; }); ST.claims.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
    return { ok: true, claims: ST.claims.slice().sort((a, b) => (b.updated || "").localeCompare(a.updated || "")).map(summary), sugg: ST.sugg, counts,
      open: ST.claims.filter(c => OPEN.indexOf(c.status) > -1).length, fresh: ST.claims.filter(c => c.status === "neu").length,
      auto: ST.auto, since: ST.since, scanned: ST.scanned, scanning, lastRun: ST.lastRun, ki: !!(D.ki && D.ki.claimsOn && D.ki.claimsOn()) };
  }
  function newClaim(x) {
    ST.seq++; const t = nowIso();
    const c = { id: "rk" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), no: "R-" + ST.seq, created: t, updated: t, status: "neu", resolution: "", amount: 0,
      title: clip(x.title || x.problem || "Reklamation", 160), problem: clip(x.problem, 1000), category: CATS.indexOf(x.category) > -1 ? x.category : "sonstiges",
      customer: { name: clip(x.customer && x.customer.name, 120), email: clip(x.customer && x.customer.email, 160).toLowerCase(), phone: clip(x.customer && x.customer.phone, 40) },
      orderNr: clip(x.orderNr, 30).toUpperCase(), orderId: clip(x.orderId, 60), invoiceNr: clip(x.invoiceNr, 20).toUpperCase(), due: addDays(t, 2), source: x.source || "manuell", auto: !!x.auto,
      confidence: x.confidence != null ? +x.confidence : null, reason: clip(x.reason, 300), mails: [], chats: [], timeline: [], pcRef: "", unseen: !!x.auto };
    ST.claims.push(c); return c;
  }
  /* bestehende offene Reklamation für dieselbe Mail-Unterhaltung oder Bestellung */
  function findOpenFor(ref, orderNr, email) {
    const open = ST.claims.filter(c => OPEN.indexOf(c.status) > -1);
    if (ref) {
      const ids = [ref.messageId, ref.inReplyTo].filter(Boolean);
      const hit = open.find(c => (c.mails || []).some(x => ids.indexOf(x.messageId) > -1 || (x.inReplyTo && x.inReplyTo === ref.messageId)));
      if (hit) return hit;
      const ns = normSubj(ref.subject), fa = addOf(ref.from);
      if (ns && fa) { const h2 = open.find(c => (c.mails || []).some(x => normSubj(x.subject) === ns && addOf(x.from) === fa)); if (h2) return h2; }
    }
    if (orderNr) { const h3 = open.find(c => c.orderNr && c.orderNr === orderNr); if (h3) return h3; }
    return null;
  }
  async function enrich(c) {
    try {
      if (!c.orderNr && !c.customer.email) return;
      const pr = D.print && D.print(); if (!pr || !pr.claimOrders) return;
      const os = await pr.claimOrders({ nr: c.orderNr, email: c.orderNr ? "" : c.customer.email });
      if (os.length === 1) { const o = os[0]; c.orderNr = c.orderNr || o.nr || ""; c.orderId = o.id || ""; if (!c.invoiceNr && o.invoice && o.invoice.nr) c.invoiceNr = o.invoice.nr; if (!c.customer.name && o.customer) c.customer.name = clip(o.customer, 120); }
    } catch (e) {}
  }
  function attachMail(c, ref, by) {
    c.mails = c.mails || [];
    if (c.mails.some(x => x.id === ref.id || (ref.messageId && x.messageId === ref.messageId))) return false;
    c.mails.push(ref); ev(c, "mail", "Mail von " + (ref.fromName || ref.from) + ": „" + ref.subject + "“", by, { mailId: ref.id });
    if (c.status === "erledigt" || c.status === "abgelehnt") return true;
    if (by === "auto") c.unseen = true;
    return true;
  }
  function attachChat(c, conv, text, by) {
    c.chats = c.chats || [];
    if (!c.chats.some(x => x.convId === conv.id)) c.chats.push({ convId: conv.id, name: clip(conv.name || ("Besucher #" + (conv.no || "")), 120), at: nowIso() });
    ev(c, "chat", "Chat " + (conv.name || ("Besucher #" + (conv.no || ""))) + (text ? ": „" + clip(text, 200) + "“" : ""), by, { convId: conv.id });
    if (by === "auto") c.unseen = true;
  }
  function notify(c) {
    if (!D.push) return;
    D.push("mail", { title: "Neue Reklamation " + c.no + (c.customer.name ? ": " + c.customer.name : ""), body: clip(c.problem || c.title, 160), url: "/admin#reklamationen", tag: "claim-" + c.id }).catch(() => {});
  }

  /* ── Erkennung ── */
  function candMail(m) {
    if (!m || m.uid == null) return null;
    const fa = low(m.from); if (!fa || OWN.test(fa)) return null;
    const txt = mailText(m), hay = (m.subject || "") + "\n" + txt;
    if (!KW.test(hay)) return null;
    return { key: "m:" + m.id, kind: "mail", m, from: (m.fromName ? m.fromName + " " : "") + "<" + m.from + ">", subject: m.subject || "", text: txt };
  }
  async function kiCheck(cands) {
    const ki = D.ki; if (!ki || !ki.claimsOn || !ki.claimsOn() || !cands.length) return [];
    const out = []; for (let i = 0; i < cands.length; i += 10) { try { out.push(...await ki.claimCheck(cands.slice(i, i + 10))); } catch (e) { log("KI:", e.message); break; } }
    return out;
  }
  function suggestion(cd, r) {
    const base = { key: cd.key, kind: cd.kind, at: nowIso(), confidence: r ? r.confidence : 0, reason: r ? r.reason : "Stichwort-Treffer", problem: r ? r.problem : "", category: r ? r.category : "sonstiges",
      orderNr: (r && r.orderNr) || ((cd.subject + " " + cd.text).match(ORDER_RX) || [""])[0].toUpperCase(), invoiceNr: (r && r.invoiceNr) || ((cd.subject + " " + cd.text).match(INV_RX) || [""])[0].toUpperCase(), customer: (r && r.customer) || "" };
    if (cd.kind === "mail") base.mail = mailRef(cd.m); else base.chat = { convId: cd.conv.id, name: cd.conv.name || ("Besucher #" + (cd.conv.no || "")), email: cd.conv.email || "", phone: cd.conv.phone || "", text: clip(cd.text, 2000) };
    return base;
  }
  async function fromSuggestion(s, auto) {
    const existing = s.mail ? findOpenFor(s.mail, s.orderNr) : (s.orderNr ? findOpenFor(null, s.orderNr) : null);
    if (existing) { if (s.mail) attachMail(existing, s.mail, auto ? "auto" : "simon"); else attachChat(existing, { id: s.chat.convId, name: s.chat.name }, s.chat.text, auto ? "auto" : "simon"); return { claim: existing, added: true }; }
    const cust = s.mail ? { name: s.customer || s.mail.fromName, email: addOf(s.mail.from) } : { name: s.customer || s.chat.name, email: s.chat.email, phone: s.chat.phone };
    const c = newClaim({ title: s.problem || (s.mail ? s.mail.subject : "Reklamation im Chat"), problem: s.problem, category: s.category, customer: cust, orderNr: s.orderNr, invoiceNr: s.invoiceNr, source: s.kind === "chat" ? "chat" : "mail", auto, confidence: s.confidence, reason: s.reason });
    ev(c, "created", auto ? "Automatisch erkannt" + (s.reason ? ": " + s.reason : "") : "Angelegt aus " + (s.kind === "chat" ? "Chat" : "Mail"), auto ? "auto" : "simon");
    if (s.mail) attachMail(c, s.mail, auto ? "auto" : "simon"); else attachChat(c, { id: s.chat.convId, name: s.chat.name }, s.chat.text, auto ? "auto" : "simon");
    await enrich(c); if (auto) notify(c);
    return { claim: c, added: false };
  }
  /* neue Mails (frischer Stand vom Mailserver) */
  async function onMail(snap) {
    if (busy) { again = snap || again || true; return; } busy = true;
    try {
      await load(); if (!ST.auto) return;
      const msgs = ((snap && snap.messages) || []).filter(m => (m.folder || "INBOX") === "INBOX" && m.uid != null && !ST.seen.has(m.id));
      if (!msgs.length) return;
      const since = ST.since, cands = []; let changed = false;
      for (const m of msgs) {
        ST.seen.add(m.id); changed = true;
        if (!m.date || m.date < since) continue;
        // Antwort in einer bekannten Reklamation → immer anhängen (auch ohne Stichwort)
        const ref = mailRef(m), ex = !OWN.test(low(m.from)) && findOpenFor(ref, "");
        if (ex) { if (attachMail(ex, ref, "auto")) { ev(ex, "info", "Neue Antwort des Kunden – bitte ansehen", "auto"); } continue; }
        const cd = candMail(m); if (cd) cands.push(cd);
      }
      const res = await kiCheck(cands);
      for (const cd of cands) {
        const r = res.find(x => x.key === cd.key);
        if (!r || !r.isClaim || r.confidence < SUGGEST_MIN) continue;
        const s = suggestion(cd, r);
        if (r.confidence >= AUTO_MIN) await fromSuggestion(s, true);
        else if (!ST.sugg.some(x => x.key === s.key)) ST.sugg.unshift(s);
      }
      ST.lastRun = { at: nowIso(), checked: msgs.length, candidates: cands.length };
      if (changed) await save();
    } catch (e) { log(e.message); }
    finally { busy = false; if (again) { const a = again; again = null; setImmediate(() => onMail(a === true ? null : a)); } }
  }
  /* neue Chat-Nachricht eines Besuchers: 90 s warten (er schreibt oft mehrere Nachrichten), dann die Unterhaltung prüfen */
  function onVisitor(conv) {
    if (!conv || !conv.id) return;
    clearTimeout(chatT.get(conv.id));
    const t = setTimeout(() => { chatT.delete(conv.id); checkChat(conv.id, false).catch(e => log("Chat:", e.message)); }, 90 * 1000);
    if (t.unref) t.unref(); chatT.set(conv.id, t);
  }
  async function chatCand(id) {
    const ch = D.chat && D.chat(); if (!ch || !ch.claimConv) return null;
    const x = await ch.claimConv(id); if (!x) return null;
    const vt = x.msgs.filter(m => m.from === "v" && !m.file).map(m => m.text).join("\n").slice(-3000);
    return { key: "c:" + id + ":" + (x.msgs.length ? x.msgs[x.msgs.length - 1].id : 0), kind: "chat", conv: x.conv, from: x.conv.name || "Website-Besucher", subject: "Website-Chat", text: vt, lastAt: (x.conv.updated || "") };
  }
  async function checkChat(id, manualScan) {
    await load(); if (!ST.auto && !manualScan) return;
    const cd = await chatCand(id); if (!cd || !cd.text || !KW.test(cd.text)) return;
    const linked = ST.claims.find(c => (c.chats || []).some(x => x.convId === id) && OPEN.indexOf(c.status) > -1);
    if (linked) { attachChat(linked, cd.conv, cd.text.split("\n").pop(), "auto"); await save(); return; }
    if (ST.dismissed.has("c:" + id) || ST.sugg.some(x => x.chat && x.chat.convId === id)) return;
    const r = (await kiCheck([cd]))[0];
    if (!r || !r.isClaim || r.confidence < SUGGEST_MIN) return;
    const s = suggestion(cd, r);
    if (r.confidence >= AUTO_MIN && !manualScan) await fromSuggestion(s, true); else ST.sugg.unshift(s);
    await save();
  }
  /* letzte 30 Tage einmal durchsuchen → nur Vorschläge */
  async function scan(days) {
    if (scanning) return; scanning = true;
    try {
      await load(); const lim = new Date(Date.now() - (days || 30) * 86400000).toISOString();
      const snap = await D.snapshot().catch(() => null);
      const known = new Set(ST.claims.flatMap(c => (c.mails || []).map(x => "m:" + x.id)).concat(ST.sugg.map(s => s.key)));
      const msgs = ((snap && snap.messages) || []).filter(m => m.uid != null && m.date >= lim && !/^(sent|gesendet|trash|papierkorb|spam|junk|drafts|entw)/i.test(String(m.folder || "INBOX").split(/[./]/).pop()) && !/sent|gesendet|trash|spam|junk|draft|entw/i.test(String(m.folder || "")));
      const cands = msgs.map(candMail).filter(cd => cd && !known.has(cd.key) && !ST.dismissed.has(cd.key)).slice(0, 40);
      const res = await kiCheck(cands);
      for (const cd of cands) { const r = res.find(x => x.key === cd.key); if (r && r.isClaim && r.confidence >= SUGGEST_MIN) ST.sugg.push(suggestion(cd, r)); }
      const ch = D.chat && D.chat();
      if (ch && ch.recentConvs) { const cs = await ch.recentConvs(days || 30).catch(() => []); for (const c of cs.slice(0, 40)) await checkChat(c.id, true).catch(() => {}); }
      ST.sugg.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      ST.scanned = nowIso(); await save();
    } finally { scanning = false; }
  }

  /* ── Cockpit-API ── */
  const J = (res, code, o) => D.send(res, code, JSON.stringify(o), "application/json; charset=utf-8", { "Cache-Control": "no-store" });
  async function handle(req, res, u) {
    try {
      await load();
      if (req.method === "GET") {
        const id = u.searchParams.get("id");
        if (id) {
          const c = byId(id); if (!c) return J(res, 200, { ok: false, error: "Reklamation nicht gefunden" });
          let orders = []; try { const pr = D.print && D.print(); if (pr && pr.claimOrders) orders = await pr.claimOrders({ id: c.orderId, nr: c.orderNr, email: c.orderNr || c.orderId ? "" : c.customer.email }); } catch (e) {}
          if (c.unseen) { c.unseen = false; await save(); }
          return J(res, 200, { ok: true, claim: c, orders });
        }
        if (!ST.scanned && !scanning) scan(30).catch(e => log("Suche:", e.message));   // einmalig beim ersten Öffnen
        return J(res, 200, view());
      }
      const pl = await D.body(req, 200000); if (pl.confirm !== true) return J(res, 400, { ok: false, error: "Bestätigung fehlt" });
      const op = String(pl.op || ""), c = pl.id ? byId(String(pl.id)) : null;
      if (op === "create") {
        let s;
        if (pl.mail && pl.mail.id) {
          const ref = mailRef(pl.mail), ex = findOpenFor(ref, clip(pl.orderNr, 30).toUpperCase());
          if (ex && !pl.forceNew) { attachMail(ex, ref, "simon"); await save(); return J(res, 200, Object.assign(view(), { id: ex.id, added: true })); }
          const t = ref.subject + "\n" + ref.text;
          s = { key: "m:" + ref.id, kind: "mail", mail: ref, problem: clip(pl.problem, 1000), category: pl.category, customer: ref.fromName, orderNr: clip(pl.orderNr || (t.match(ORDER_RX) || [""])[0], 30).toUpperCase(), invoiceNr: clip(pl.invoiceNr || (t.match(INV_RX) || [""])[0], 20).toUpperCase() };
          if (!s.problem && D.ki && D.ki.claimsOn && D.ki.claimsOn()) { try { const r = (await D.ki.claimCheck([{ key: s.key, kind: "mail", from: ref.fromName + " <" + ref.from + ">", subject: ref.subject, text: ref.text }]))[0]; if (r) { s.problem = r.problem; if (CATS.indexOf(r.category) > -1 && !pl.category) s.category = r.category; s.orderNr = s.orderNr || r.orderNr; s.invoiceNr = s.invoiceNr || r.invoiceNr; } } catch (e) {} }
          const r0 = await fromSuggestion(s, false); ST.sugg = ST.sugg.filter(x => x.key !== s.key); await save(); return J(res, 200, Object.assign(view(), { id: r0.claim.id, added: r0.added }));
        }
        if (pl.convId) {
          const cd = await chatCand(String(pl.convId)); if (!cd) return J(res, 200, { ok: false, error: "Unterhaltung nicht gefunden" });
          const linked = ST.claims.find(x => (x.chats || []).some(y => y.convId === cd.conv.id) && OPEN.indexOf(x.status) > -1);
          if (linked) return J(res, 200, Object.assign(view(), { id: linked.id, added: true }));
          const t = cd.text; s = { key: cd.key, kind: "chat", chat: { convId: cd.conv.id, name: cd.conv.name || ("Besucher #" + (cd.conv.no || "")), email: cd.conv.email || "", phone: cd.conv.phone || "", text: clip(t, 2000) },
            problem: clip(pl.problem, 1000), category: pl.category, customer: cd.conv.name || "", orderNr: clip((t.match(ORDER_RX) || [""])[0], 30).toUpperCase(), invoiceNr: clip((t.match(INV_RX) || [""])[0], 20).toUpperCase() };
          const r1 = await fromSuggestion(s, false); ST.sugg = ST.sugg.filter(x => !(x.chat && x.chat.convId === cd.conv.id)); await save(); return J(res, 200, Object.assign(view(), { id: r1.claim.id }));
        }
        const n = newClaim({ title: pl.title || pl.problem, problem: pl.problem, category: pl.category, customer: pl.customer || {}, orderNr: pl.orderNr, invoiceNr: pl.invoiceNr, source: "manuell" });
        ev(n, "created", "Von Hand angelegt"); await enrich(n); await save(); return J(res, 200, Object.assign(view(), { id: n.id }));
      }
      if (op === "accept" || op === "discard") {
        const s = ST.sugg.find(x => x.key === String(pl.key || "")); if (!s) return J(res, 200, Object.assign(view(), { ok: false, error: "Vorschlag nicht mehr vorhanden" }));
        ST.sugg = ST.sugg.filter(x => x !== s);
        let id = "";
        if (op === "accept") id = (await fromSuggestion(s, false)).claim.id; else ST.dismissed.add(s.chat ? "c:" + s.chat.convId : s.key);
        await save(); return J(res, 200, Object.assign(view(), { id }));
      }
      if (op === "scan") { scan(30).catch(e => log("Suche:", e.message)); return J(res, 200, Object.assign(view(), { scanning: true })); }
      if (op === "settings") { if (typeof pl.auto === "boolean") { ST.auto = pl.auto; if (pl.auto) ST.since = nowIso(); } await save(); return J(res, 200, view()); }
      if (!c) return J(res, 200, { ok: false, error: "Reklamation nicht gefunden" });
      if (op === "status") {
        const st = String(pl.status || ""); if (STATUS.indexOf(st) < 0) return J(res, 400, { ok: false, error: "Unbekannter Status" });
        const LBL = { neu: "Neu", pruefung: "In Prüfung", printcom: "Bei Print.com reklamiert", loesung: "Lösung vereinbart", erledigt: "Erledigt", abgelehnt: "Abgelehnt" };
        if (st !== c.status) { ev(c, "status", "Status: " + LBL[c.status] + " → " + LBL[st] + (pl.note ? " – " + clip(pl.note, 500) : ""), "simon", { status: st }); c.status = st; if (st === "erledigt" || st === "abgelehnt") c.closedAt = nowIso(); else delete c.closedAt;
          if (st === "pruefung" && !c.due) c.due = addDays(nowIso(), 2); if (st === "printcom") c.due = addDays(nowIso(), 5); }
        if (pl.resolution != null && RESOL.indexOf(String(pl.resolution)) > -1 && String(pl.resolution) !== (c.resolution || "")) { c.resolution = String(pl.resolution); ev(c, "status", "Lösung: " + (c.resolution || "–"), "simon"); }
        if (pl.amount != null && isFinite(+pl.amount)) c.amount = Math.round(+pl.amount * 100) / 100;
        c.unseen = false; await save(); return J(res, 200, Object.assign(view(), { claim: c }));
      }
      if (op === "update") {
        const f = pl.fields || {};
        if (f.title != null) c.title = clip(f.title, 160);
        if (f.problem != null) c.problem = clip(f.problem, 1000);
        if (f.category != null && CATS.indexOf(f.category) > -1) c.category = f.category;
        if (f.orderNr != null) { c.orderNr = clip(f.orderNr, 30).toUpperCase(); c.orderId = ""; }
        if (f.invoiceNr != null) c.invoiceNr = clip(f.invoiceNr, 20).toUpperCase();
        if (f.due != null) c.due = /^\d{4}-\d{2}-\d{2}$/.test(f.due) ? f.due : "";
        if (f.pcRef != null) c.pcRef = clip(f.pcRef, 60);
        if (f.customer && typeof f.customer === "object") ["name", "email", "phone"].forEach(k => { if (f.customer[k] != null) c.customer[k] = clip(f.customer[k], k === "email" ? 160 : 120); });
        c.updated = nowIso(); if (f.orderNr != null) await enrich(c); await save(); return J(res, 200, Object.assign(view(), { claim: c }));
      }
      if (op === "note") { const t = clip(pl.text, 2000).trim(); if (!t) return J(res, 400, { ok: false, error: "Notiz ist leer" }); ev(c, "note", t, "simon"); await save(); return J(res, 200, Object.assign(view(), { claim: c })); }
      if (op === "draftlog") { ev(c, "draft", "Antwort-Entwurf geöffnet", "simon"); await save(); return J(res, 200, { ok: true }); }
      if (op === "delete") { ST.claims = ST.claims.filter(x => x !== c); (c.mails || []).forEach(m => ST.dismissed.add("m:" + m.id)); await save(); return J(res, 200, view()); }
      return J(res, 400, { ok: false, error: "unbekannte Aktion" });
    } catch (e) { return J(res, 200, { ok: false, error: String(e.message || e).slice(0, 300) }); }
  }
  async function count() { try { await load(); return { open: ST.claims.filter(c => OPEN.indexOf(c.status) > -1).length, fresh: ST.claims.filter(c => c.status === "neu").length, sugg: ST.sugg.length }; } catch (e) { return null; } }
  return { handle, onMail, onVisitor, scan, count, _test: { KW, OWN, candMail, mailText, normSubj, fresh } };
};
