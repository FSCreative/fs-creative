"use strict";
// Bankkonten direkt (PSD2, nur Kontoinformation – keine Zahlungen) über Enable Banking: George / Erste Bank & Sparkassen.
// Ablauf: „Bank verbinden“ → Freigabe in George (bis 180 Tage) → Rückkehr ins Cockpit → täglicher Abruf der gebuchten Umsätze.
// Umsätze laufen durch denselben Import wie der Kontoauszug (Doppelte aus CSV/CAMT werden erkannt, Geldtransit, Bankregeln).
// Zugang: EB_APP_ID + EB_PRIVATE_KEY (PEM der bei Enable Banking registrierten App). Freigabe wird nur als Sitzungs-ID gespeichert.
const crypto = require("crypto");
module.exports = function (D) {
  const { L, getMeta, setMeta, hash, after } = D;
  const BASE = "https://api.enablebanking.com";
  const r2 = n => Math.round((+n || 0) * 100) / 100, day = v => String(v || "").slice(0, 10), today = () => new Date().toISOString().slice(0, 10);
  let STATE = { at: null, running: false, last: null, error: "" }, META = null;
  const cfg = () => ({ app: String(process.env.EB_APP_ID || "").trim(), key: String(process.env.EB_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim() });
  const b64 = o => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
  function jwt() {
    const c = cfg(); if (!c.app || !c.key) throw new Error("Bankanbindung nicht eingerichtet (EB_APP_ID / EB_PRIVATE_KEY)");
    const now = Math.floor(Date.now() / 1000), h = b64({ typ: "JWT", alg: "RS256", kid: c.app }), p = b64({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 });
    return h + "." + p + "." + crypto.createSign("RSA-SHA256").update(h + "." + p).sign(c.key).toString("base64url");
  }
  async function api(method, path, body) {
    const r = await (D.fetch || fetch)(BASE + path, { method, headers: { Authorization: "Bearer " + jwt(), "Content-Type": "application/json", Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error("Bank " + r.status + ": " + (j.message || j.error || j.detail || "Fehler")); e.status = r.status; throw e; } return j;
  }
  async function meta() { if (!META) META = (await getMeta("ebank").catch(() => null)) || { sessions: [], pending: null }; return META; }
  async function saveMeta() { await setMeta("ebank", META); }
  // Banken eines Landes (für die Auswahl; Standard: Erste Bank / Sparkassen in Österreich)
  async function banks(country) { const j = await api("GET", "/aspsps?country=" + encodeURIComponent(country || "AT") + "&psu_type=business"); return (j.aspsps || []).map(a => ({ name: a.name, country: a.country, psu: a.psu_types || [] })); }
  async function start(o) {
    await meta(); const state = crypto.randomBytes(16).toString("hex"), until = new Date(Date.now() + 179 * 864e5).toISOString();
    let bank = o.bank;   // Standard: Erste Bank / Sparkassen (George) – exakter Name laut Bankenliste von Enable Banking
    if (!bank) { const l = await api("GET", "/aspsps?country=" + encodeURIComponent(o.country || "AT")); const hit = (l.aspsps || []).find(a => /erste/i.test(a.name)) || (l.aspsps || []).find(a => /sparkasse/i.test(a.name)); if (!hit) throw new Error("Erste Bank nicht in der Bankenliste gefunden"); bank = hit.name; }
    const j = await api("POST", "/auth", { access: { valid_until: until }, aspsp: { name: bank, country: o.country || "AT" }, state, redirect_url: o.redirect, psu_type: o.psu === "personal" ? "personal" : "business" });
    META.pending = { state, bank, at: new Date().toISOString() }; await saveMeta();
    return { url: j.url };
  }
  // Rückkehr aus George: code gegen Sitzung tauschen, Konten den Cockpit-Konten zuordnen (IBAN/Name, sonst neues Konto)
  async function finish(code, state) {
    await meta(); if (!META.pending || META.pending.state !== state) throw new Error("Freigabe passt nicht zur Anfrage – bitte neu verbinden");
    const s = await api("POST", "/sessions", { code }); await L.load();
    const accs = [];
    for (const a of (s.accounts || [])) {
      const iban = String((a.account_id || {}).iban || "").replace(/\s/g, ""), tail = iban.slice(-4);
      const all = L.all("CheckAccount").filter(x => String(x.status) !== "0" && !x.paypal && !x.mollieBalance && !/kasse|register/i.test((x.name || "") + " " + (x.type || "")));
      let acc = all.find(x => x.ebankUid === a.uid) || all.find(x => iban && String(x.iban || "").replace(/\s/g, "") === iban) || (all.filter(x => /george|erste|sparkasse|giro|bank/i.test(x.name || "")).length === 1 ? all.find(x => /george|erste|sparkasse|giro|bank/i.test(x.name || "")) : null);
      if (!acc) acc = (await L.request("POST", "/CheckAccount", { body: { name: "George" + (tail ? " …" + tail : ""), type: "online", importType: "EBANK", currency: a.currency || "EUR", status: "100", defaultAccount: "0", iban } })).objects;
      if (!acc.ebankSince) { const last = L.all("CheckAccountTransaction").filter(x => x.checkAccount && String(x.checkAccount.id) === String(acc.id)).map(x => day(x.valueDate)).sort().pop(); acc.ebankSince = last || today(); acc.ebankOpening = !last; }
      acc.ebankUid = a.uid; if (iban && !acc.iban) acc.iban = iban; await L.save("CheckAccount", acc);
      accs.push({ uid: a.uid, iban, accountId: String(acc.id), name: acc.name });
    }
    META.sessions = (META.sessions || []).filter(x => x.bank !== META.pending.bank).concat([{ id: s.session_id, bank: META.pending.bank, validUntil: (s.access || {}).valid_until || null, accounts: accs, at: new Date().toISOString() }]);
    META.pending = null; await saveMeta();
    return { accounts: accs };
  }
  async function sync() {
    if (STATE.running) return STATE.last; STATE.running = true; STATE.error = "";
    try {
      await meta(); await L.load(); const res = [];
      for (const s of (META.sessions || [])) {
        if (s.validUntil && s.validUntil < new Date().toISOString()) { res.push({ bank: s.bank, error: "Freigabe abgelaufen – bitte neu verbinden" }); continue; }
        for (const a of s.accounts) {
          const acc = L.get("CheckAccount", a.accountId); if (!acc) continue;
          try {
            const from = acc.ebankLast && acc.ebankLast > acc.ebankSince ? new Date(Date.parse(acc.ebankLast) - 5 * 864e5).toISOString().slice(0, 10) : acc.ebankSince, items = [];
            let ck = null, n = 0;
            do {
              const j = await api("GET", "/accounts/" + encodeURIComponent(a.uid) + "/transactions?date_from=" + from + (ck ? "&continuation_key=" + encodeURIComponent(ck) : ""));
              for (const t of (j.transactions || [])) {
                if (t.status && t.status !== "BOOK") continue;                                       // nur gebuchte, keine vorgemerkten
                const amt = +(t.transaction_amount || {}).amount || 0; if (!amt) continue;
                const out = t.credit_debit_indicator === "DBIT", sign = out ? -1 : 1, d = day(t.value_date || t.booking_date), bd = day(t.booking_date) || d; if (!d || (bd < acc.ebankSince && d < acc.ebankSince)) continue;
                const party = out ? t.creditor : t.debtor, pacc = out ? t.creditor_account : t.debtor_account;
                const purpose = [].concat(t.remittance_information || []).join(" ").replace(/\s+/g, " ").trim() || String(t.bank_transaction_code && t.bank_transaction_code.description || "");
                items.push({ date: d, bookDate: day(t.booking_date) || d, amount: r2(sign * Math.abs(amt)), name: (party && party.name) || "", iban: (pacc && pacc.iban) || "", purpose, ref: t.entry_reference || t.transaction_id || "" });
              }
              ck = j.continuation_key || null; n++;
            } while (ck && n < 40);
            const imp = items.length ? await L.importBank(acc.id, items, hash) : { added: 0, dup: 0, paired: 0 };
            let bal = null;
            try { const b = await api("GET", "/accounts/" + encodeURIComponent(a.uid) + "/balances"); const bl = b.balances || [], pick = ["CLBD", "ITBD", "XPCD", "OPBD", "CLAV", "ITAV"].map(k => bl.find(x => x.balance_type === k)).find(Boolean) || bl[0]; acc.ebankBalTypes = bl.map(x => x.balance_type + " " + (x.balance_amount || {}).amount).join(", "); if (pick) bal = r2(+(pick.balance_amount || {}).amount || 0); } catch (e) {}
            const mine = () => L.all("CheckAccountTransaction").filter(x => x.checkAccount && String(x.checkAccount.id) === String(acc.id));
            if (bal != null && acc.ebankOpening && !mine().some(x => x.importRef === "opening")) {
              const open = r2(bal - mine().reduce((s2, x) => s2 + (+x.amount || 0), 0));
              if (Math.abs(open) > 0.004) await L.request("POST", "/CheckAccountTransaction", { body: { checkAccount: { id: String(acc.id), objectName: "CheckAccount" }, status: "400", transitWith: "opening", valueDate: acc.ebankSince + "T00:00:00+02:00", entryDate: acc.ebankSince + "T00:00:00+02:00", amount: open.toFixed(2), payeePayerName: "Bank", paymtPurpose: "Anfangsbestand beim Umstieg (bereits über sevDesk verbucht)", importRef: "opening" } });
            }
            if (bal != null) { acc.ebankBalance = bal; acc.ebankDiff = r2(bal - mine().reduce((s2, x) => s2 + (+x.amount || 0), 0)); }
            acc.ebankLast = today(); acc.ebankAt = new Date().toISOString(); await L.save("CheckAccount", acc);
            res.push({ bank: s.bank, account: acc.name, added: imp.added || 0, dup: imp.dup || 0, paired: imp.paired || 0, balance: bal, diff: acc.ebankDiff });
          } catch (e) { res.push({ bank: s.bank, account: acc.name, error: e.status === 401 || e.status === 403 ? "Freigabe ungültig – bitte neu verbinden" : e.message }); }
        }
      }
      const post = after ? await after().catch(() => ({})) : {};
      STATE.last = { at: new Date().toISOString(), accounts: res, post }; STATE.at = STATE.last.at; return STATE.last;
    } catch (e) { STATE.error = e.message; throw e; } finally { STATE.running = false; }
  }
  async function disconnect(bank) { await meta(); const s = (META.sessions || []).find(x => x.bank === bank); if (s) { try { await api("DELETE", "/sessions/" + encodeURIComponent(s.id)); } catch (e) {} } META.sessions = (META.sessions || []).filter(x => x.bank !== bank); await saveMeta(); return {}; }
  async function status() {
    const c = cfg(); await meta();
    return { configured: !!(c.app && c.key), at: STATE.at, running: STATE.running, last: STATE.last, error: STATE.error,
      sessions: (META.sessions || []).map(s => ({ bank: s.bank, validUntil: s.validUntil, accounts: s.accounts.map(a => { const acc = L.get("CheckAccount", a.accountId) || {}; return { name: acc.name || a.name, iban: a.iban, balance: acc.ebankBalance, diff: acc.ebankDiff, at: acc.ebankAt }; }) })) };
  }
  return { banks, start, finish, sync, disconnect, status };
};
