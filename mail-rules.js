"use strict";
// Mail-Regeln wie in Outlook: Bedingungen (Absender, Empfänger/Konto, Betreff, Text, Anhang) → Aktionen (gelesen, markieren,
// verschieben, löschen, Spam). Läuft am Server für neue Mails im Posteingang – auch wenn das Cockpit geschlossen ist.
// Eine Regel greift automatisch nur für Mails, die nach dem Anlegen/Aktivieren ankommen; bestehende nur per „Jetzt anwenden“.
module.exports = function (D) {
  const { getMeta, setMeta, snapshot, action } = D;
  let RULES = null, SEEN = null, busy = false, last = { at: null, applied: 0, error: "" };
  const low = s => String(s || "").toLowerCase();
  async function load() {
    if (RULES) return RULES;
    RULES = (await getMeta("mailRules").catch(() => null)) || [];
    SEEN = new Set(((await getMeta("mailRulesSeen").catch(() => null)) || []).slice(-6000));
    return RULES;
  }
  async function saveRules() { await setMeta("mailRules", RULES); }
  async function saveSeen() { await setMeta("mailRulesSeen", Array.from(SEEN).slice(-6000)); }
  const terms = s => String(s || "").split(/[;,\n]/).map(x => x.trim().toLowerCase()).filter(Boolean);
  function matches(r, m) {
    const c = r.cond || {}; let any = false;
    const has = (field, hay) => { const t = terms(field); if (!t.length) return true; any = true; return t.some(x => hay.indexOf(x) > -1); };
    if (!has(c.from, low(m.from + " " + m.fromName))) return false;
    if (!has(c.to, low([m.to, m.toName].concat((m.toList || []).map(a => a.address + " " + a.name)).concat((m.ccList || []).map(a => a.address)).join(" ")))) return false;
    if (!has(c.subject, low(m.subject))) return false;
    if (!has(c.body, low(m.subject + " " + m.preview + " " + (m.body || "").replace(/<[^>]+>/g, " ")))) return false;
    if (c.account) { any = true; if (String(m.account || "") !== String(c.account)) return false; }
    if (c.attach) { any = true; if (!(m.attachments && m.attachments.length)) return false; }
    return any;   // Regel ohne jede Bedingung greift nie (Schutz vor „alles löschen“)
  }
  function plan(r, msgs) {
    const out = {}; const a = r.act || {};
    const items = msgs.map(m => ({ folder: m.folder || "INBOX", uid: m.uid, account: m.account }));
    if (!items.length) return out;
    if (a.seen) out.seen = items;
    if (a.flag) out.flag = items;
    if (a.spam) out.spam = items;
    else if (a.trash) out.trash = items;
    else if (a.move) { const [acc, path] = String(a.move).split("|"); const its = items.filter(i => !acc || String(i.account) === acc); if (its.length && path) out.move = { items: its, target: path }; }
    return out;
  }
  async function run(ops) {
    let n = 0;
    for (const op of ["seen", "flag"]) if (ops[op]) { await action(op, ops[op]); n += ops[op].length; }
    if (ops.move) { await action("move", ops.move.items, ops.move.target); n += ops.move.items.length; }
    if (ops.spam) { await action("spam", ops.spam); n += ops.spam.length; }
    if (ops.trash) { await action("trash", ops.trash); n += ops.trash.length; }
    return n;
  }
  function inbox(snap) { return ((snap && snap.messages) || []).filter(m => (m.folder || "INBOX") === "INBOX" && m.uid != null); }
  // neue Mails: jede Mail nur einmal, pro Mail die passenden Regeln in Reihenfolge („danach keine weiteren Regeln“ stoppt)
  async function tick() {
    if (busy) return; busy = true;
    try {
      await load(); const act = RULES.filter(r => r.active);
      if (!act.length) return;
      const snap = await snapshot(); if (!snap) return;
      const fresh = inbox(snap).filter(m => !SEEN.has(m.id));
      if (!fresh.length) return;
      const ops = {}; let hits = 0;
      for (const m of fresh) {
        SEEN.add(m.id);
        for (const r of act) {
          if (m.date && r.since && m.date < r.since) continue;
          if (!matches(r, m)) continue;
          const p = plan(r, [m]); Object.keys(p).forEach(op => { if (op === "move") { const k = "move:" + p.move.target; ops[k] = ops[k] || { items: [], target: p.move.target }; ops[k].items.push(...p.move.items); } else (ops[op] = ops[op] || []).push(...p[op]); });
          r.hits = (r.hits || 0) + 1; r.lastHit = new Date().toISOString(); hits++;
          if (r.stop || (r.act && (r.act.trash || r.act.spam || r.act.move))) break;
        }
      }
      for (const k of Object.keys(ops)) { if (k.indexOf("move:") === 0) await run({ move: ops[k] }); else await run({ [k]: ops[k] }); }
      await saveSeen(); if (hits) await saveRules();
      last = { at: new Date().toISOString(), applied: hits, error: "" };
    } catch (e) { last = { at: new Date().toISOString(), applied: 0, error: String(e.message || e).slice(0, 200) }; console.error("Mail-Regeln:", e.message); }
    finally { busy = false; }
  }
  function clean(r) {
    const c = r.cond || {}, a = r.act || {};
    return { id: r.id || ("r" + Date.now().toString(36)), name: String(r.name || "Regel").slice(0, 80), active: r.active !== false,
      cond: { from: String(c.from || "").slice(0, 300), to: String(c.to || "").slice(0, 300), subject: String(c.subject || "").slice(0, 300), body: String(c.body || "").slice(0, 300), account: String(c.account || "").slice(0, 120), attach: !!c.attach },
      act: { seen: !!a.seen, flag: !!a.flag, move: String(a.move || "").slice(0, 300), trash: !!a.trash, spam: !!a.spam }, stop: !!r.stop,
      since: r.since || new Date().toISOString(), hits: +r.hits || 0, lastHit: r.lastHit || null };
  }
  async function handle(pl) {
    await load();
    const op = String(pl.op || "");
    if (op === "save") {
      const r = clean(pl.rule || {}); const i = RULES.findIndex(x => x.id === r.id);
      const old = i > -1 ? RULES[i] : null; if (old) { r.hits = old.hits; r.lastHit = old.lastHit; r.since = old.active || !r.active ? old.since : new Date().toISOString(); }
      const a = r.act; if (!(a.seen || a.flag || a.move || a.trash || a.spam)) throw new Error("Bitte mindestens eine Aktion wählen");
      if (!(r.cond.from || r.cond.to || r.cond.subject || r.cond.body || r.cond.account || r.cond.attach)) throw new Error("Bitte mindestens eine Bedingung angeben");
      if (i > -1) RULES[i] = r; else RULES.push(r); await saveRules(); return { rule: r };
    }
    if (op === "delete") { RULES = RULES.filter(x => x.id !== pl.id); await saveRules(); return {}; }
    if (op === "order") { const ids = pl.ids || []; RULES.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); await saveRules(); return {}; }
    if (op === "preview" || op === "apply") {
      const r = pl.rule ? clean(pl.rule) : RULES.find(x => x.id === pl.id); if (!r) throw new Error("Regel nicht gefunden");
      const snap = await snapshot(); const hit = inbox(snap).filter(m => matches(r, m));
      if (op === "preview") return { count: hit.length, sample: hit.slice(0, 8).map(m => ({ from: m.fromName || m.from, subject: m.subject, date: m.date })) };
      const n = await run(plan(r, hit)); const i = RULES.findIndex(x => x.id === r.id); if (i > -1) { RULES[i].hits = (RULES[i].hits || 0) + hit.length; RULES[i].lastHit = new Date().toISOString(); await saveRules(); }
      hit.forEach(m => SEEN.add(m.id)); await saveSeen(); return { count: hit.length, affected: n };
    }
    throw new Error("unbekannte Aktion");
  }
  async function list() { await load(); return { rules: RULES, last }; }
  return { tick, handle, list };
};
