"use strict";
// Belegdateien automatisch zuordnen: Rechnungsmails (PDF/Bild im Anhang) der letzten 60 Tage werden ausgelesen (KI, sonst
// einfache Heuristik aus Absender + Beträgen im Mailtext) und an passende Belege OHNE Datei gehängt (z. B. aus Bankregeln).
// Passend = gleicher Bruttobetrag (±0,02 €; Fremdwährung umgerechnet ±3 %), Belegdatum −10/+20 Tage zum Rechnungsdatum,
// Lieferant/Absender ähnlich. Ein eindeutiger Treffer wird als Vorschlag „Zur Prüfung“ abgelegt (fin-proposals.js) – angehängt wird
// erst nach Bestätigung (handle op "attach"); mehrdeutige Treffer erscheinen nur in der Liste „Belege ohne Datei“.
// Postfach wird nur gelesen (Anhang laden), nie verändert. Ausgelesene Mails liegen in fin_meta „docMatch“ und werden bei
// jedem Lauf erneut gegen die Belege geprüft (der Beleg aus dem Bankumsatz entsteht oft erst Tage nach der Mail).
module.exports = function (D) {
  const { L, getMeta, setMeta, snapshot, fetchAtt, kiReady, kiExtract, onChange } = D;
  const P = () => (typeof D.P === "function" ? D.P() : D.P) || null;   // Vorschläge (fin-proposals.js)
  const DAYS = 60, KEEP_DAYS = 75;
  const r2 = n => Math.round((+n || 0) * 100) / 100;
  const day = v => { const t = String(v || ""); let m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"); m = t.match(/^(\d{4}-\d{2}-\d{2})/); if (m) return m[1]; const p = Date.parse(t); return isFinite(p) ? new Date(p).toISOString().slice(0, 10) : ""; };
  const days = (a, b) => (Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 864e5;
  const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  let ST = null, busy = false, LAST = { at: null, scanned: 0, extracted: 0, attached: 0, err: "" };

  async function state() {
    if (ST) return ST;
    const s = (await getMeta("docMatch").catch(() => null)) || {};
    ST = { items: s.items || {}, seen: Array.isArray(s.seen) ? s.seen : [], log: Array.isArray(s.log) ? s.log : [], last: s.last || null };
    if (ST.last) LAST = ST.last;
    return ST;
  }
  async function persist() {
    const cut = Date.now() - KEEP_DAYS * 864e5;
    Object.keys(ST.items).forEach(k => { const it = ST.items[k]; if (!(Date.parse(it.mail && it.mail.date || "") > cut)) delete ST.items[k]; });
    ST.seen = ST.seen.slice(-5000); ST.log = ST.log.slice(-200); ST.last = LAST;
    await setMeta("docMatch", ST);
  }

  // ── Mails auswählen ──
  const SKIP_FOLDER = /trash|papierkorb|junk|spam|sent|gesendet|draft|entw|outbox|ausgang/i;
  const INV_RX = /rechnung|invoice|receipt|quittung|beleg|faktura|\bbill|zahlungsbest|payment|vorschreibung|abgabe|geb(ü|ue)hr|abrechnung|kontoauszug|statement|bestellung|order confirmation|your .* (plan|subscription)|\babo\b/i;
  const SENDERS = ["railway", "github", "google", "anthropic", "world4you", "gemeinde", "a1.net", "magenta", "drei.at", "cloudflare", "adobe", "openai", "apple", "microsoft", "figma", "notion", "hetzner", "canva", "envato", "paypal", "stripe", "paddle", "vercel", "digitalocean", "netcup", "ionos", "strato", "amazon", "aws", "facebook", "meta", "beds24"];
  const isDocAtt = a => { const fn = String(a.filename || "").toLowerCase(), ct = String(a.contentType || "").toLowerCase();
    if (/\.pdf$/.test(fn) || /pdf/.test(ct)) return true;
    if (/\.(png|jpe?g|webp)$/.test(fn) || /image\/(png|jpe?g|webp)/.test(ct)) return !(a.size > 0 && a.size < 20000) && !/^(image\d*|logo|icon|banner|footer|header|signature)/.test(fn);   // keine Logos/Signaturbilder
    return false; };
  function looksLikeInvoice(m, atts) {
    const hay = ((m.from || "") + " " + (m.fromName || "") + " " + (m.subject || "") + " " + atts.map(a => a.filename || "").join(" ")).toLowerCase();
    return INV_RX.test(hay) || SENDERS.some(s => hay.indexOf(s) > -1);
  }
  // Meta (Facebook/Instagram-Werbung, Zahlung über Zahlungsschwelle): Zahlungsbeleg steht im Mailtext → daraus wird ein PDF-Beleg
  const META_FROM = /facebookmail|facebook\.com|meta\.com|metamail|business\.facebook|ads\.facebook/i, META_SUBJ = /beleg|receipt|zahlung|payment|quittung|abrechnung|rechnung/i;
  const isMetaReceipt = m => META_FROM.test(String(m.from || "") + " " + String(m.fromName || "")) && META_SUBJ.test(String(m.subject || ""));
  // Rechnung nur im Mailtext (ohne PDF-Anhang): Meta-Zahlungsbelege, Beds24-Abrechnung (Guthaben-Aufladung „Rechnungsnummer: B…“, keine Gäste-Buchungsmails)
  const BODY_RCPT = [
    { key: "meta", test: isMetaReceipt, supplier: "Meta Platforms Ireland Limited", label: "Meta-Zahlungsbeleg", nr: /(?:transaktions-?id|transaction id|zahlungs-?id|referenz(?:nummer)?)\s*[:#]?\s*([0-9A-Z-]{6,40})/i },
    { key: "beds24", test: m => /beds24/i.test(String(m.from || "") + " " + String(m.fromName || "")) && !/anmeldelink|login|passwort|password|buchung|booking|reservier/i.test(String(m.subject || "")) && /rechnungsnummer|invoice (?:no|number)|DE328454604/i.test(bodyText(m)),
      supplier: "Beds24 GmbH", label: "Beds24-Rechnung", nr: /(?:rechnungsnummer|invoice (?:no\.?|number))\s*[:#]?\s*(B?\d{6,9})/i },
    // GitHub: „[GitHub] Payment Receipt for …“ – Beleg steht im Mailtext (USD), Abgleich über den Dollarbetrag der Kartenzahlung
    { key: "github", test: m => /github\.com/i.test(String(m.from || "")) && /payment receipt|zahlungsbeleg|receipt/i.test(String(m.subject || "")),
      supplier: "GitHub, Inc.", label: "GitHub-Beleg", nr: /(?:transaction id|receipt (?:no\.?|number|#)|invoice (?:no\.?|number))\s*[:#]?\s*([0-9A-Z-]{6,40})/i }];
  const bodyReceipt = m => BODY_RCPT.find(r => { try { return r.test(m); } catch (e) { return false; } }) || null;
  const bodyText = m => (m.bodyHtml ? String(m.body || "").replace(/<(br|\/p|\/div|\/tr|\/h\d|\/li)[^>]*>/gi, "\n").replace(/<\/t[dh]>/gi, "  ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&euro;/g, "€").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">") : String(m.body || m.preview || "")).replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim().slice(0, 20000);
  function receiptPdf(it) {   // einfacher, gut lesbarer PDF-Beleg aus dem Mailtext (Text 1:1, Kopf mit Absender/Datum/Betreff)
    const PDFDocument = require("pdfkit");
    return new Promise((res, rej) => { const d = new PDFDocument({ size: "A4", margin: 50, info: { Title: it.mail.subject || "Zahlungsbeleg" } }), ch = [];
      d.on("data", c => ch.push(c)); d.on("end", () => res(Buffer.concat(ch))); d.on("error", rej);
      const safe = t => String(t || "").replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff€–—„“”‚‘’…•]/g, "");
      d.font("Helvetica-Bold").fontSize(15).text("Zahlungsbeleg (aus E-Mail übernommen)");
      d.moveDown(0.4).font("Helvetica").fontSize(9).fillColor("#555").text("Von: " + safe((it.mail.fromName ? it.mail.fromName + " " : "") + "<" + it.mail.from + ">")).text("Datum: " + safe(it.mail.date)).text("Betreff: " + safe(it.mail.subject));
      d.moveDown(0.8).fillColor("#000").fontSize(10).text(safe(it.body || ""), { lineGap: 2 });
      d.end(); });
  }
  const mailKey = mm => [mm.account || "", mm.folder || "INBOX", mm.uid || "", mm.index || 0].join("|");
  const msgId = m => String(m.id || [m.account || "", m.folder || "INBOX", m.uid].join("|"));
  function mailInfo(m, a) {
    return { id: String(m.id || ""), account: m.account || "", folder: m.folder || "INBOX", uid: m.uid, index: a.index || 0, filename: String(a.filename || "beleg").slice(0, 160), size: a.size || 0,
      subject: String(m.subject || "").slice(0, 200), from: String(m.from || "").slice(0, 160), fromName: String(m.fromName || "").slice(0, 120), date: m.date || "" };
  }

  // ── Heuristik ohne KI: Beträge mit Währung im Mailtext, Datum = Maildatum, Lieferant = Absender ──
  const CUR = { "€": "EUR", eur: "EUR", "$": "USD", usd: "USD", "us$": "USD", chf: "CHF", gbp: "GBP", "£": "GBP" };
  function parseNum(s) { s = String(s).replace(/\s/g, ""); const i = Math.max(s.lastIndexOf(","), s.lastIndexOf(".")); if (i < 0) return +s; return +(s.slice(0, i).replace(/[.,]/g, "") + "." + s.slice(i + 1)); }
  function amountsIn(t) {
    const out = [], seen = {}; const rx = /(€|eur|us\$|usd|\$|chf|gbp|£)?\s?(\d{1,3}(?:[.,  ]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?!\d)\s?(€|eur|usd|\$|chf|gbp|£)?/gi;
    let m; while ((m = rx.exec(t)) && out.length < 15) {
      const c = CUR[String(m[1] || m[3] || "").toLowerCase()]; if (!c) continue;
      const v = r2(parseNum(m[2])); if (!(v > 0) || v > 100000) continue;
      const k = c + v; if (seen[k]) continue; seen[k] = 1; out.push({ v, cur: c });
    }
    return out;
  }
  function domainLabel(addr) { const d = String(addr || "").toLowerCase().split("@")[1] || ""; const p = d.split(".").filter(Boolean); if (p.length < 2) return ""; const l = p[p.length - 2]; return /^(co|com|gv|or|ac)$/.test(l) && p.length > 2 ? p[p.length - 3] : l; }
  function heuristic(m) {
    const txt = (m.subject || "") + "\n" + (m.bodyHtml ? String(m.body || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&euro;/g, "€") : String(m.body || m.preview || ""));
    const nr = txt.match(/(?:rechnung(?:snummer)?|invoice(?: number)?|receipt(?: number)?|beleg)\s*(?:nr\.?|no\.?|#|number)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]{3,30})/i);
    const sup = String(m.fromName || "").replace(/\b(billing|invoices?|noreply|no-reply|team|support|payments?)\b/gi, "").trim() || domainLabel(m.from);
    return { src: "heur", isInvoice: true, supplier: sup.slice(0, 120), invoiceDate: day(m.date), gross: 0, currency: "", invoiceNumber: nr ? nr[1].slice(0, 40) : "", amounts: amountsIn(txt) };
  }

  // ── Währung: Tageskurs (EZB über frankfurter.app), sonst Näherung mit größerer Toleranz ──
  const FX_FALLBACK = { USD: 0.86, GBP: 1.16, CHF: 1.06 }, FX = new Map();
  async function rate(cur, d) {
    if (cur === "EUR") return { rate: 1, tol: 0 };
    const k = cur + d; if (FX.has(k)) return FX.get(k);
    let out = FX_FALLBACK[cur] ? { rate: FX_FALLBACK[cur], tol: 0.07 } : null;
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch("https://api.frankfurter.app/" + (d <= new Date().toISOString().slice(0, 10) ? d : "latest") + "?from=" + encodeURIComponent(cur) + "&to=EUR", { signal: ctrl.signal }); clearTimeout(t);
      const j = r.ok ? await r.json() : null; if (j && j.rates && j.rates.EUR > 0) out = { rate: +j.rates.EUR, tol: 0.03 };
    } catch (e) {}
    if (out) FX.set(k, out); if (FX.size > 400) FX.delete(FX.keys().next().value);
    return out;
  }

  // ── Abgleich ──
  const STOP = new Set(["gmbh", "inc", "ltd", "llc", "limited", "kg", "og", "ag", "the", "und", "and", "invoice", "invoices", "rechnung", "receipt", "noreply", "reply", "mail", "email", "info", "billing", "support", "team", "payments", "payment", "service", "services", "online", "www", "com", "net", "org", "app", "ireland", "europe", "international", "sarl", "corp", "corporation", "company", "operations", "technologies", "platforms", "mastercard", "visa", "karte", "kartenzahlung", "zahlung", "lastschrift", "abbuchung", "dauerauftrag", "debit", "card", "per", "regel", "fuer", "from", "your", "ihre", "ihr"]);
  const toks = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w));
  function similar(x, mail, v) {
    const vh = norm((v.supplierName || "") + " " + (v.description || "")), mine = toks((x.supplier || "") + " " + (mail.fromName || "")).concat([domainLabel(mail.from)].filter(w => w && w.length >= 3 && !STOP.has(w)));
    if (mine.some(w => vh.indexOf(w) > -1)) return true;
    const mh = norm((x.supplier || "") + " " + (mail.fromName || "") + " " + (mail.from || ""));
    return toks(v.supplierName).some(w => mh.indexOf(w) > -1);
  }
  const noDoc = v => String(v.voucherType || "VOU") === "VOU" && (+v.status || 0) >= 100 && !(v.document && v.document.id);
  async function candidates(it, vouchers) {
    const x = it.x; if (!x || x.isInvoice === false) return [];
    const amts = x.gross > 0 ? [{ v: x.gross, cur: x.currency || "EUR" }] : (x.amounts || []); if (!amts.length) return [];
    const idate = x.invoiceDate || day(it.mail.date); if (!idate) return [];
    const rates = {}; for (const a of amts) if (!(a.cur in rates)) rates[a.cur] = await rate(a.cur, idate);
    const out = [];
    for (const v of vouchers) {
      const vd = day(v.voucherDate); if (!vd) continue;
      const dd = days(vd, idate); if (!(dd >= -10 && dd <= 20)) continue;
      const vg = Math.abs(+v.sumGross || 0); let ok = false, exact = false;
      for (const a of amts) { const r = rates[a.cur]; if (!r) continue; const conv = a.v * r.rate;
        if (a.cur === "EUR" ? Math.abs(vg - a.v) <= 0.02 : Math.abs(vg - conv) <= conv * r.tol + 0.02) { ok = true; if (a.cur === "EUR") exact = true; } }
      if (!ok) continue;
      const sim = similar(x, it.mail, v);
      out.push({ v, sim, exact, dd, score: (sim ? 60 : 0) + (exact ? 25 : 10) + (x.src === "ki" ? 10 : 0) - Math.min(10, Math.abs(dd) / 2) });
    }
    return out.sort((a, b) => b.score - a.score);
  }
  const invName = it => /invoice|rechnung/i.test(it.mail.filename) ? 0 : /receipt|quittung|beleg/i.test(it.mail.filename) ? 1 : 2;

  async function attach(vid, f, src) { const v = await L.attachDoc(vid, f, src); if (onChange) onChange(); return v; }
  async function attachFromMail(vid, it, auto) {
    const att = it.mail.index === -1 ? { buf: await receiptPdf(it), fname: it.mail.filename, ctype: "application/pdf" } : await fetchAtt(it.mail);
    const ext = (att.fname.split(".").pop() || "").toLowerCase();
    const type = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" }[ext] || (/^(application\/pdf|image\/)/.test(att.ctype) ? att.ctype.split(";")[0] : "application/pdf");
    await attach(vid, { buf: att.buf, type, name: att.fname }, { mailId: it.mail.id, from: it.mail.fromName ? it.mail.fromName + " <" + it.mail.from + ">" : it.mail.from, subject: it.mail.subject, mailDate: it.mail.date, filename: att.fname, account: it.mail.account, folder: it.mail.folder, uid: it.mail.uid, index: it.mail.index, auto: !!auto, at: new Date().toISOString() });
    it.usedBy = String(vid);
    ST.log.push({ at: new Date().toISOString(), voucherId: String(vid), key: it.key, subject: it.mail.subject, from: it.mail.from, auto: !!auto });
  }

  // Vorschlagen: Beleg hat genau einen Mail-Kandidaten mit Lieferant-Treffer und dieser Mail-Anhang genau einen Beleg
  async function matchAll() {
    const prop = P(); if (!prop) return 0;
    const vouchers = L.all("Voucher").filter(noDoc); if (!vouchers.length) return 0;
    const items = Object.values(ST.items).filter(it => it.x && !it.usedBy);
    const byVou = {}, cands = {};
    for (const it of items) { const c = await candidates(it, vouchers); cands[it.key] = c; const conf = c.filter(x => x.sim);
      if (c.length === 1 && conf.length === 1) (byVou[conf[0].v.id] = byVou[conf[0].v.id] || []).push(it); }
    let n = 0;
    for (const vid of Object.keys(byVou)) {
      let its = byVou[vid];
      if (its.length > 1) { const mids = new Set(its.map(i => i.mail.id + "|" + i.mail.uid)); if (mids.size > 1) continue; its = its.slice().sort((a, b) => invName(a) - invName(b) || (a.mail.index || 0) - (b.mail.index || 0)); }   // gleiche Mail: Rechnung vor Quittung
      const v = L.get("Voucher", vid); if (!v || !noDoc(v)) continue;
      const it = its[0], x = it.x || {};
      try { if (await prop.add({ kind: "docmatch", key: "doc:" + vid + ":" + it.key, voucherId: String(vid), amount: -r2(Math.abs(+v.sumGross || 0)) * (String(v.creditDebit) === "D" ? -1 : 1), date: day(v.voucherDate), title: "Belegdatei aus Mail anhängen: " + (v.supplierName || "Beleg"), detail: "„" + (it.mail.subject || it.mail.filename || "Anhang") + "“ von " + (it.mail.fromName || it.mail.from || "") + " (" + day(it.mail.date) + ") · " + (it.mail.filename || "") + (x.gross ? " · " + (x.currency && x.currency !== "EUR" ? x.currency + " " + x.gross : x.gross.toFixed(2).replace(".", ",") + " €") : ""), source: "Rechnungsmails", payload: { voucherId: String(vid), key: it.key, mail: { account: it.mail.account, folder: it.mail.folder, uid: it.mail.uid, index: it.mail.index, filename: it.mail.filename } } })) n++; } catch (e) { it.err = String(e.message || e).slice(0, 160); }
    }
    return n;
  }

  async function run(manual) {
    if (busy) return Object.assign({ busy: true }, LAST); busy = true;
    try {
      await L.load(); await state();
      const snap = await snapshot(); const msgs = (snap && Array.isArray(snap.messages)) ? snap.messages : [];
      const since = Date.now() - DAYS * 864e5, seen = new Set(ST.seen), ki = kiReady();
      let kiLeft = ki ? (manual ? 15 : 6) : 0, scanned = 0, extracted = 0;
      for (const m of msgs) {
        if (!m || m.uid == null || m.deleted || m.local || SKIP_FOLDER.test(m.folder || "")) continue;
        if (!(Date.parse(m.date || "") > since) || seen.has(msgId(m))) continue;
        let atts = (m.attachments || []).filter(isDocAtt);
        const br = !atts.length ? bodyReceipt(m) : null;
        if (br) {   // Rechnung/Zahlungsbeleg im Mailtext (Meta, Beds24, GitHub) → PDF aus dem Mailtext
          const mail = mailInfo(m, { index: -1, filename: br.label + "-" + day(m.date) + ".pdf" }), key = mailKey(mail);
          const it = ST.items[key] = ST.items[key] || { key, mail, tries: 0 };
          if (!it.x) { const txt = bodyText(m), x = heuristic(m), tid = txt.match(br.nr);
            x.supplier = br.supplier; if (tid) x.invoiceNumber = tid[1].slice(0, 40);
            const eur = (x.amounts || []).filter(a => a.cur === "EUR").map(a => a.v); if (eur.length) { x.gross = Math.max.apply(null, eur); x.currency = "EUR"; }
            else { const fx = (x.amounts || []).filter(a => a.cur && a.cur !== "EUR"); if (fx.length) { x.gross = Math.max.apply(null, fx.map(a => a.v)); x.currency = fx[0].cur; } }   // z. B. GitHub in USD
            it.body = txt; it.x = x; it.at = new Date().toISOString(); scanned++; extracted++; }
          seen.add(msgId(m)); ST.seen.push(msgId(m)); continue;
        }
        if (!atts.length || !looksLikeInvoice(m, atts)) { seen.add(msgId(m)); ST.seen.push(msgId(m)); continue; }
        scanned++;
        if (!ki) atts = atts.slice().sort((a, b) => (/invoice|rechnung/i.test(a.filename) ? 0 : /pdf$/i.test(a.filename) ? 1 : 2) - (/invoice|rechnung/i.test(b.filename) ? 0 : /pdf$/i.test(b.filename) ? 1 : 2)).slice(0, 1);   // Heuristik: nur der wahrscheinlichste Anhang
        let pending = false;
        for (const a of atts.slice(0, 4)) {
          const mail = mailInfo(m, a), key = mailKey(mail);
          const it = ST.items[key] = ST.items[key] || { key, mail, tries: 0 };
          if (it.x) continue;
          let x = null;
          if (kiLeft > 0 && !(a.size > 15 * 1024 * 1024)) {
            kiLeft--; it.tries++;
            try { const k = await kiExtract(mail, { subject: m.subject, from: m.from, fromName: m.fromName, date: m.date });
              x = { src: "ki", isInvoice: k.isInvoice !== false, supplier: k.supplier || "", invoiceDate: k.invoiceDate || day(m.date), gross: +k.gross || 0, currency: k.currency || "EUR", invoiceNumber: k.invoiceNumber || "", amounts: [] }; }
            catch (e) { it.err = String(e.message || e).slice(0, 160); if (/limit|not_configured|disabled/.test(e.kiCode || "")) kiLeft = 0; }
          }
          if (!x && (!ki || it.tries >= 2 || (a.size > 15 * 1024 * 1024))) x = heuristic(m);
          if (x) { it.x = x; it.at = new Date().toISOString(); extracted++; } else pending = true;
        }
        if (!pending) { seen.add(msgId(m)); ST.seen.push(msgId(m)); }
      }
      const proposed = await matchAll();
      LAST = { at: new Date().toISOString(), scanned, extracted, attached: 0, proposed, err: "", ki };
      await persist();
      return LAST;
    } catch (e) { LAST = Object.assign({}, LAST, { at: new Date().toISOString(), err: String(e.message || e).slice(0, 200) }); return LAST; }
    finally { busy = false; }
  }

  // Liste „Beleg ohne Datei“ (Jahr) mit Vorschlägen aus Mails
  async function missing(year) {
    await L.load(); await state();
    const y = /^\d{4}$/.test(String(year || "")) ? String(year) : new Date().toISOString().slice(0, 4);
    const at = {}; L.all("AccountingType").forEach(a => { at[String(a.id)] = a.name; });
    const posBy = {}; L.all("VoucherPos").forEach(p => { const id = p.voucher && String(p.voucher.id); if (id) (posBy[id] = posBy[id] || []).push(p); });
    const list = L.all("Voucher").filter(v => noDoc(v) && day(v.voucherDate).slice(0, 4) === y);
    const items = Object.values(ST.items).filter(it => it.x && !it.usedBy), sugg = {};
    for (const it of items) for (const c of await candidates(it, list)) (sugg[c.v.id] = sugg[c.v.id] || []).push({ key: it.key, score: Math.round(c.score), sim: c.sim, exact: c.exact,
      subject: it.mail.subject, from: it.mail.from, fromName: it.mail.fromName, date: day(it.mail.date), filename: it.mail.filename,
      account: it.mail.account, folder: it.mail.folder, uid: it.mail.uid, index: it.mail.index,
      supplier: it.x.supplier, gross: it.x.gross || null, currency: it.x.currency || "", invoiceNumber: it.x.invoiceNumber || "", src: it.x.src });
    const out = list.map(v => { const ps = posBy[String(v.id)] || [];
      return { id: String(v.id), date: day(v.voucherDate), supplier: v.supplierName || "", desc: v.description || "", gross: r2(Math.abs(+v.sumGross || 0)), cd: v.creditDebit || "C", status: +v.status || 0, enshrined: !!v.enshrined,
        category: ps.map(p => at[String(p.accountingType && p.accountingType.id)] || "").filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", "),
        suggestions: (sugg[String(v.id)] || []).sort((a, b) => b.score - a.score).slice(0, 3) }; })
      .sort((a, b) => b.date.localeCompare(a.date) || (+b.id - +a.id));
    return { year: y, vouchers: out, last: LAST, mails: Object.keys(ST.items).length, recent: ST.log.slice(-10).reverse() };
  }

  async function handle(pl) {
    const op = String(pl.op || "");
    if (op === "run") return { result: await run(true) };
    await L.load(); await state();
    const vid = String(pl.voucherId || "").replace(/\D/g, ""); const v = vid && L.get("Voucher", vid);
    if (!v) throw new Error("Beleg nicht gefunden");
    if (v.document && v.document.id) throw new Error("Dieser Beleg hat bereits eine Datei");
    if (op === "attach") {
      const r = pl.mailRef || {}; let it = typeof r === "string" ? ST.items[r] : (r.key && ST.items[r.key]);
      if (!it) {   // direkt aus einer Mail (Ordner/UID/Anhang)
        if (r.uid == null || r.uid === "") throw new Error("Mail-Anhang fehlt");
        const mail = { id: String(r.id || ""), account: String(r.account || ""), folder: String(r.folder || "INBOX"), uid: r.uid, index: +r.index || 0, filename: String(r.filename || "beleg.pdf").slice(0, 160), subject: String(r.subject || "").slice(0, 200), from: String(r.from || "").slice(0, 160), fromName: String(r.fromName || "").slice(0, 120), date: r.date || new Date().toISOString() };
        it = ST.items[mailKey(mail)] = ST.items[mailKey(mail)] || { key: mailKey(mail), mail, tries: 0 };
      }
      if (it.usedBy && it.usedBy !== vid) throw new Error("Dieser Mail-Anhang hängt bereits an Beleg " + it.usedBy);
      await attachFromMail(vid, it, false); await persist();
      return { attached: true, voucherId: vid };
    }
    if (op === "upload") {
      const fname = String(pl.filename || "beleg").replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 160) || "beleg";
      const ext = (fname.split(".").pop() || "").toLowerCase();
      const type = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", xml: "application/xml" }[ext] || (/^(application\/pdf|image\/(png|jpeg|webp|gif))$/.test(pl.mime || "") ? pl.mime : "");
      if (!type) throw new Error("Dateityp nicht unterstützt (PDF, JPG, PNG, WebP oder XML)");
      const buf = Buffer.from(String(pl.data || "").replace(/^data:[^,]*,/, ""), "base64");
      if (buf.length < 50) throw new Error("Leere Datei"); if (buf.length > 15 * 1024 * 1024) throw new Error("Die Datei ist größer als 15 MB");
      await attach(vid, { buf, type, name: fname }, { upload: true, filename: fname, at: new Date().toISOString() });
      ST.log.push({ at: new Date().toISOString(), voucherId: vid, upload: fname }); await persist();
      return { attached: true, voucherId: vid };
    }
    throw new Error("unbekannte Aktion");
  }
  // Vorschlag noch gültig? (Beleg ohne Datei, Mail-Anhang noch bekannt und nicht anderweitig verwendet)
  async function stillValid(pl) { await state(); const v = L.get("Voucher", pl.voucherId), it = ST.items[pl.key]; return !!v && noDoc(v) && !!it && (!it.usedBy || it.usedBy === String(pl.voucherId)); }
  return { run, missing, handle, stillValid, status: () => LAST, _test: { isMetaReceipt, bodyReceipt, bodyText, receiptPdf, amountsIn, heuristic, similar, candidates, domainLabel, looksLikeInvoice, isDocAtt, setState: s => { ST = s; } } };
};
