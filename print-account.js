"use strict";
// Druckshop-Kundenkonten: Registrierung mit E-Mail + Passwort, Bestätigung per 6-stelligem Code (Mail), Login, Passwort vergessen (Code),
// Profil (Rechnungs-/Lieferadresse), Warenkorb im Konto (30 Tage), letzte Bestellungen. Sitzung = signiertes Cookie (30 Tage, HttpOnly).
// Gespeichert in print_meta „print_customers“ (eine Map, für die Größe des Shops ausreichend). Passwörter nur als scrypt-Hash.
const crypto = require("crypto");

module.exports = function (D) {
  const { store, mail, sig, sigOk, limited, nowIso } = D;
  const COOKIE = "ps_kunde", DAY = 864e5, SESSION_DAYS = 30, CODE_MIN = 15, CART_DAYS = 30;
  const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
  const normMail = e => clip(e, 160).toLowerCase();
  const mailOk = e => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e);
  let CACHE = null;
  async function all() { if (!CACHE) CACHE = (await store.getMeta("print_customers").catch(() => null)) || {}; return CACHE; }
  async function save() { await store.setMeta("print_customers", CACHE || {}); }
  const byId = async id => { const m = await all(); return Object.values(m).find(c => c.id === id) || null; };
  const hash = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString("hex");
  function pwOk(c, pw) { if (!c || !c.pw) return false; const h = Buffer.from(hash(pw, c.pw.salt), "hex"), x = Buffer.from(c.pw.h, "hex"); return h.length === x.length && crypto.timingSafeEqual(h, x); }
  function setPw(c, pw) { const salt = crypto.randomBytes(16).toString("hex"); c.pw = { salt, h: hash(pw, salt) }; }
  const pwBad = pw => String(pw || "").length < 8 ? "Das Passwort braucht mindestens 8 Zeichen." : null;
  // Code: 6 Ziffern, nur als Hash gespeichert, 15 Minuten gültig, max. 5 Versuche
  function newCode(c, purpose) { const code = String(crypto.randomInt(0, 1e6)).padStart(6, "0"); c.code = { h: crypto.createHash("sha256").update(code + c.id).digest("hex"), purpose, exp: Date.now() + CODE_MIN * 60e3, tries: 0 }; return code; }
  function codeOk(c, code, purpose) {
    const k = c && c.code; if (!k || k.purpose !== purpose || Date.now() > k.exp) return "Der Code ist abgelaufen – bitte einen neuen anfordern.";
    if (k.tries >= 5) return "Zu viele Versuche – bitte einen neuen Code anfordern.";
    const h = crypto.createHash("sha256").update(String(code || "").replace(/\D/g, "") + c.id).digest("hex");
    if (h !== k.h) { k.tries++; return "Der Code stimmt nicht."; }
    c.code = null; return null;
  }
  async function sendCode(c, purpose, to) {
    const code = newCode(c, purpose); await save();
    const t = purpose === "reset" ? "Passwort zurücksetzen" : purpose === "email" ? "Neue E-Mail-Adresse bestätigen" : "E-Mail-Adresse bestätigen";
    await mail(to || c.email, code + " – dein Code für den FS Creative Druckshop", t, ["Hallo" + (c.firstName ? " " + c.firstName : "") + ",",
      purpose === "reset" ? "mit diesem Code kannst du ein neues Passwort für dein Kundenkonto im Druckshop setzen:" : purpose === "email" ? "du möchtest die E-Mail-Adresse deines Kundenkontos im FS Creative Druckshop auf diese Adresse ändern. Bitte bestätige mit diesem Code:" : "danke für deine Registrierung im FS Creative Druckshop. Bitte bestätige deine E-Mail-Adresse mit diesem Code:"],
      [["Dein Code", code]], ["Der Code ist " + CODE_MIN + " Minuten gültig. Wenn du das nicht angefordert hast, kannst du diese Mail ignorieren."]);
  }
  // ── Sitzung ──
  const cookieOf = req => { const m = String(req.headers.cookie || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)")); return m ? decodeURIComponent(m[1]) : ""; };
  async function current(req) {
    const v = cookieOf(req), m = v.match(/^([A-Za-z0-9]{8,40})\.(\d{10,13})\.([a-f0-9]{40})$/); if (!m) return null;
    if (+m[2] < Date.now() || !sigOk("kunde", m[1] + "." + m[2], m[3])) return null;
    const c = await byId(m[1]); return c && c.verified ? c : null;
  }
  function cookie(c) { const exp = Date.now() + SESSION_DAYS * DAY, v = c.id + "." + exp + "." + sig("kunde", c.id + "." + exp);
    return COOKIE + "=" + encodeURIComponent(v) + "; Path=/; Max-Age=" + SESSION_DAYS * 86400 + "; HttpOnly; SameSite=Lax" + (D.secure ? "; Secure" : ""); }
  const clearCookie = () => COOKIE + "=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" + (D.secure ? "; Secure" : "");
  // ── Profil ──
  const ADDR = ["type", "company", "uid", "firstName", "lastName", "phone", "street", "zip", "city", "country"];
  // keepType: Profil-Formular darf Kontotyp nicht ändern (Umstellung Privat ↔ Firma nur über /account/type in den Einstellungen)
  function profileIn(c, p, keepType) { p = Object.assign({}, p || {}); if (keepType) { delete p.type; if (c.type !== "company") { delete p.company; delete p.uid; } }
    ADDR.forEach(k => { if (p[k] !== undefined) c[k] = clip(p[k], k === "street" ? 120 : k === "company" ? 120 : 80); });
    c.type = c.type === "company" ? "company" : "private"; c.country = "AT"; if (c.uid) c.uid = c.uid.replace(/[\s.\-]/g, "").toUpperCase(); }
  const pub = c => ({ id: c.id, email: c.email, verified: !!c.verified, createdAt: c.createdAt, type: c.type || "private", company: c.company || "", uid: c.uid || "", firstName: c.firstName || "", lastName: c.lastName || "",
    phone: c.phone || "", street: c.street || "", zip: c.zip || "", city: c.city || "", country: c.country || "AT", newsletter: !!c.newsletter,
    uidValid: c.uidCheck ? !!c.uidCheck.valid : null, typeAt: c.typeAt || "", pendingEmail: c.pendingEmail || "", drafts: draftsOf(c), saved: savedOf(c) });
  // Merkliste: gespeicherte Konfigurationen (Produkt + Optionen als Link-Code, Preis beim Merken), max. 30
  const savedOf = c => (c.saved || []).slice(0, 30);
  const cleanSaved = x => x && typeof x === "object" && typeof x.product === "string" && typeof x.c === "string" && /^[A-Za-z0-9_-]{5,3000}$/.test(x.c) ? {
    id: clip(x.id, 40) || crypto.randomBytes(5).toString("hex"), product: clip(x.product, 80), title: clip(x.title, 120), img: /^https:\/\/images\.ctfassets\.net\//.test(String(x.img || "")) ? clip(x.img, 400) : "",
    sum: clip(x.sum, 220), n: Math.max(0, Math.min(1e6, parseInt(x.n, 10) || 0)), gross: x.gross != null && isFinite(+x.gross) ? Math.round(+x.gross * 100) / 100 : null, c: String(x.c).replace(/[^A-Za-z0-9_-]/g, ""), at: clip(x.at, 30) || nowIso() } : null;
  // Entwürfe aus dem Designer (per Link gespeichert, 60 Tage gültig) – im Konto gelistet
  const draftsOf = c => (c.drafts || []).filter(d => Date.now() - Date.parse(d.at) < 60 * DAY).slice(0, 12);
  async function addDraft(c, d) { const m = await all(), x = m[c.email]; if (!x) return; x.drafts = [{ id: clip(d.id, 40), t: clip(d.t, 60), product: clip(d.product, 80), title: clip(d.title, 120), preview: /^data:image\/jpeg;base64,/.test(d.preview || "") && d.preview.length < 16000 ? d.preview : "", at: nowIso() }].concat(draftsOf(x).filter(y => y.id !== d.id)).slice(0, 12); await save(); }
  // Warenkorb: Positionen mit Ausführung, Datei-Referenz (signiert) und Preis zum Zeitpunkt des Hinzufügens; nach 30 Tagen verfällt er
  function cartClean(items) {
    return (Array.isArray(items) ? items : []).slice(0, 30).map(x => x && typeof x === "object" ? JSON.parse(JSON.stringify(x)) : null)
      .filter(x => x && typeof x.product === "string" && JSON.stringify(x).length < 20000);
  }
  const cartOf = c => (c.cart && c.cartAt && Date.now() - Date.parse(c.cartAt) < CART_DAYS * DAY ? c.cart : []);
  // Anlage aus dem Checkout (Häkchen „Kundenkonto anlegen“): Konto unbestätigt, Code per Mail; Bestellungen werden verknüpft
  async function createFromCheckout(cust, pw) {
    const m = await all(), email = normMail(cust.email); if (!mailOk(email)) return null;
    if (m[email]) return m[email];   // gibt es schon – Bestellung wird über die E-Mail im Profil angezeigt, sobald bestätigt
    if (pwBad(pw)) throw Object.assign(new Error(pwBad(pw)), { status: 400 });
    const c = { id: "K" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString("hex"), email, createdAt: nowIso(), verified: false };
    setPw(c, pw); profileIn(c, cust); m[email] = c; await sendCode(c, "verify"); return c;
  }

  async function handle(req, res, p, ip, J, readJson, ordersOf, bonusOf) {
    const full = async c => ({ ok: true, customer: pub(c), cart: cartOf(c), orders: await ordersOf(c), bonus: bonusOf ? await bonusOf(c) : null });
    const send = (code, o, ck) => { if (ck) res.setHeader("Set-Cookie", ck); return J(res, code, o); };
    if (p === "/print/api/account/me" && req.method === "GET") {
      const c = await current(req); if (!c) return send(200, { ok: true, customer: null });
      return send(200, await full(c));
    }
    if (p === "/print/api/account/export" && req.method === "GET") {   // Auskunft (Art. 15 DSGVO): eigene Daten als Datei
      const c = await current(req); if (!c) return J(res, 401, { ok: false, error: "Bitte anmelden." });
      const data = { erstellt: nowIso(), hinweis: "Deine im FS Creative Druckshop gespeicherten Kontodaten. Bestellungen bewahren wir aus steuerlichen Gründen 7 Jahre auf.",
        konto: Object.assign(pub(c), { drafts: undefined, lastLogin: c.lastLogin || "", newsletterAt: c.newsletterAt || "", verifiedAt: c.verifiedAt || "" }), warenkorb: cartOf(c).map(x => ({ produkt: x.title, stueck: x.n, datei: x.fileName })),
        entwuerfe: draftsOf(c).map(d => ({ produkt: d.title, gespeichert: d.at })), merkliste: savedOf(c).map(x => ({ produkt: x.title, ausfuehrung: x.sum, stueck: x.n, preisBeimMerken: x.gross, gemerkt: x.at })), bestellungen: (await ordersOf(c)).map(o => ({ nr: o.nr, datum: o.createdAt, produkt: o.product, stueck: o.copies, status: o.statusText, brutto: o.gross })) };
      res.setHeader("Content-Disposition", 'attachment; filename="druckshop-meine-daten.json"'); return J(res, 200, data);
    }
    if (req.method !== "POST") return J(res, 405, { ok: false, error: "method_not_allowed" });
    if (limited("acct", ip, 40, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Versuche – bitte später erneut" });
    const b = await readJson(req, 40000), m = await all(), email = normMail(b.email);
    if (p === "/print/api/account/register") {
      if (!mailOk(email)) return J(res, 400, { ok: false, error: "Bitte eine gültige E-Mail-Adresse eingeben." });
      const e = pwBad(b.password); if (e) return J(res, 400, { ok: false, error: e });
      let c = m[email];
      if (c && c.verified) return J(res, 409, { ok: false, error: "Für diese E-Mail gibt es schon ein Konto – bitte anmelden." });
      if (!c) c = m[email] = { id: "K" + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString("hex"), email, createdAt: nowIso(), verified: false };
      setPw(c, b.password); profileIn(c, { firstName: b.firstName, lastName: b.lastName }); c.newsletter = b.newsletter === true; if (c.newsletter) c.newsletterAt = nowIso();
      await sendCode(c, "verify"); return J(res, 200, { ok: true, needCode: true });
    }
    if (p === "/print/api/account/verify") {
      const c = m[email]; if (!c) return J(res, 400, { ok: false, error: "Konto nicht gefunden." });
      const e = codeOk(c, b.code, "verify"); if (e) { await save(); return J(res, 400, { ok: false, error: e }); }
      c.verified = true; c.verifiedAt = nowIso(); await save();
      return send(200, await full(c), cookie(c));
    }
    if (p === "/print/api/account/resend") { const c = m[email]; if (c && (b.purpose === "reset" ? c.verified : !c.verified)) await sendCode(c, b.purpose === "reset" ? "reset" : "verify"); return J(res, 200, { ok: true }); }
    if (p === "/print/api/account/login") {
      const c = m[email];
      if (!c || !pwOk(c, b.password)) return J(res, 400, { ok: false, error: "E-Mail oder Passwort stimmt nicht." });
      if (!c.verified) { await sendCode(c, "verify"); return J(res, 200, { ok: true, needCode: true, info: "Bitte bestätige zuerst deine E-Mail-Adresse – wir haben dir einen neuen Code geschickt." }); }
      c.lastLogin = nowIso(); await save();
      return send(200, await full(c), cookie(c));
    }
    if (p === "/print/api/account/forgot") { const c = m[email]; if (c && c.verified) await sendCode(c, "reset"); return J(res, 200, { ok: true }); }   // keine Auskunft, ob es das Konto gibt
    if (p === "/print/api/account/reset") {
      const c = m[email]; if (!c) return J(res, 400, { ok: false, error: "Der Code stimmt nicht." });
      const e0 = pwBad(b.password); if (e0) return J(res, 400, { ok: false, error: e0 });
      const e = codeOk(c, b.code, "reset"); if (e) { await save(); return J(res, 400, { ok: false, error: e }); }
      setPw(c, b.password); c.verified = true; await save();
      return send(200, await full(c), cookie(c));
    }
    if (p === "/print/api/account/logout") return send(200, { ok: true }, clearCookie());
    // ab hier nur angemeldet
    const c = await current(req); if (!c) return J(res, 401, { ok: false, error: "Bitte anmelden." });
    if (p === "/print/api/account/profile") { profileIn(c, b, true); if (b.newsletter !== undefined) { if (b.newsletter === true && !c.newsletter) c.newsletterAt = nowIso(); c.newsletter = b.newsletter === true; } await save(); return J(res, 200, { ok: true, customer: pub(c), bonus: bonusOf ? await bonusOf(c) : null }); }
    if (p === "/print/api/account/password") {
      if (!pwOk(c, b.current)) return J(res, 400, { ok: false, error: "Das aktuelle Passwort stimmt nicht." });
      const e = pwBad(b.password); if (e) return J(res, 400, { ok: false, error: e }); setPw(c, b.password); await save(); return J(res, 200, { ok: true });
    }
    if (p === "/print/api/account/type") {   // Umstellung Privat ↔ Firma (nur hier, mit Bestätigung)
      if (b.confirm !== true) return J(res, 400, { ok: false, error: "Bitte bestätige die Umstellung." });
      if (b.type === "company") {
        const company = clip(b.company, 120), uid = clip(b.uid, 20).replace(/[\s.\-]/g, "").toUpperCase();
        if (company.length < 2) return J(res, 400, { ok: false, error: "Bitte den Firmennamen angeben." });
        if (uid && !/^[A-Z]{2}[0-9A-Z]{8,12}$/.test(uid)) return J(res, 400, { ok: false, error: "Die UID-Nummer hat ein ungültiges Format (z. B. ATU12345678)." });
        let chk = null; if (uid && D.uidCheck) { chk = await D.uidCheck(uid).catch(() => null);
          if (chk && chk.format === false) return J(res, 400, { ok: false, error: "Die UID-Nummer hat ein ungültiges Format (z. B. ATU12345678)." });
          if (chk && !chk.valid && !chk.unreachable && chk.why !== "Prüfung nicht verfügbar") return J(res, 400, { ok: false, error: "Die UID-Nummer " + uid + " ist laut EU-Prüfung (VIES) nicht gültig." }); }
        c.company = company; c.uid = uid; c.uidCheck = chk ? { valid: chk.valid, name: chk.name || "", at: nowIso() } : null;
      } else if (b.type !== "private") return J(res, 400, { ok: false, error: "Unbekannter Kontotyp." });
      if (c.type !== b.type) { c.typeLog = (c.typeLog || []).concat([{ from: c.type || "private", to: b.type, at: nowIso() }]).slice(-10); c.typeAt = nowIso(); }
      c.type = b.type; await save(); return J(res, 200, { ok: true, customer: pub(c), bonus: bonusOf ? await bonusOf(c) : null });
    }
    if (p === "/print/api/account/email") {   // neue E-Mail-Adresse: Passwort + Code an die neue Adresse
      if (!pwOk(c, b.password)) return J(res, 400, { ok: false, error: "Das Passwort stimmt nicht." });
      const ne = normMail(b.newEmail); if (!mailOk(ne)) return J(res, 400, { ok: false, error: "Bitte eine gültige neue E-Mail-Adresse eingeben." });
      if (ne === c.email) return J(res, 400, { ok: false, error: "Das ist schon deine E-Mail-Adresse." });
      if (m[ne]) return J(res, 409, { ok: false, error: "Für diese E-Mail-Adresse gibt es schon ein Konto." });
      c.pendingEmail = ne; await sendCode(c, "email", ne); return J(res, 200, { ok: true, customer: pub(c) });
    }
    if (p === "/print/api/account/email-verify") {
      const ne = c.pendingEmail; if (!ne) return J(res, 400, { ok: false, error: "Keine Änderung offen." });
      const e = codeOk(c, b.code, "email"); if (e) { await save(); return J(res, 400, { ok: false, error: e }); }
      if (m[ne]) { c.pendingEmail = ""; await save(); return J(res, 409, { ok: false, error: "Für diese E-Mail-Adresse gibt es inzwischen ein Konto." }); }
      delete m[c.email]; c.emailLog = (c.emailLog || []).concat([{ from: c.email, at: nowIso() }]).slice(-5); c.email = ne; c.pendingEmail = ""; m[ne] = c; await save();
      return J(res, 200, { ok: true, customer: pub(c) });
    }
    if (p === "/print/api/account/email-cancel") { c.pendingEmail = ""; c.code = null; await save(); return J(res, 200, { ok: true, customer: pub(c) }); }
    if (p === "/print/api/account/saved") {   // Merkliste: add | del | merge (lokal Gemerktes beim Anmelden übernehmen)
      const cur = savedOf(c), same = (a, b) => a.product === b.product && a.c === b.c;
      if (b.op === "add") { const it = cleanSaved(b.item); if (!it) return J(res, 400, { ok: false, error: "Ungültige Konfiguration" }); c.saved = [it].concat(cur.filter(x => !same(x, it))).slice(0, 30); }
      else if (b.op === "del") c.saved = cur.filter(x => x.id !== String(b.id || ""));
      else if (b.op === "merge") { const add = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map(cleanSaved).filter(Boolean).filter(a => !cur.some(x => same(x, a))); c.saved = cur.concat(add).slice(0, 30); }
      else return J(res, 400, { ok: false, error: "op" });
      await save(); return J(res, 200, { ok: true, customer: pub(c) });
    }
    if (p === "/print/api/account/draft-del") { c.drafts = (c.drafts || []).filter(d => d.id !== String(b.id || "")); await save(); return J(res, 200, { ok: true, customer: pub(c) }); }
    if (p === "/print/api/account/reorder") {   // „Nochmal bestellen“: Warenkorb-Position aus einer eigenen Bestellung (gleiche Datei, aktueller Preis)
      if (!D.reorderOf) return J(res, 404, { ok: false, error: "not_found" });
      const it = await D.reorderOf(c, String(b.orderId || "")); if (!it) return J(res, 404, { ok: false, error: "Diese Bestellung kann nicht erneut bestellt werden." });
      return J(res, 200, { ok: true, item: it });
    }
    if (p === "/print/api/account/cart") { c.cart = cartClean(b.items); c.cartAt = nowIso(); await save(); return J(res, 200, { ok: true, cart: c.cart }); }
    if (p === "/print/api/account/delete") {
      if (!pwOk(c, b.password)) return J(res, 400, { ok: false, error: "Das Passwort stimmt nicht." });
      delete m[c.email]; await save(); return send(200, { ok: true }, clearCookie());   // Bestellungen bleiben (Aufbewahrungspflicht), nur das Konto wird gelöscht
    }
    return J(res, 404, { ok: false, error: "not_found" });
  }
  // Cockpit: alle Kunden, eigener Rabatt je Kunde (zusätzlich zum Bonusprogramm – der höhere gilt)
  async function listAll() { const m = await all(); return Object.values(m).map(c => Object.assign(pub(c), { newsletterAt: c.newsletterAt || "", lastLogin: c.lastLogin || "", discountPct: +c.discountPct || 0, discountNote: c.discountNote || "" })); }
  async function setDiscount(id, pct, note) { const c = await byId(id); if (!c) return null; const n = parseFloat(String(pct == null ? "" : pct).replace(",", ".")); c.discountPct = isFinite(n) && n > 0 ? Math.min(50, Math.round(n * 10) / 10) : 0; c.discountNote = clip(note, 200); await save(); return c; }
  return { handle, current, createFromCheckout, pub, listAll, setDiscount, addDraft, _test: { codeOk, newCode, hash } };
};
