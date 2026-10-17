"use strict";
/* Druckshop-Newsletter (www.fs-creative.at/print): wöchentlich montags – Produkttipps der Woche, Designer-Tipp (rotiert), 5-%-Wochencode, Pflichtangaben.
   Anmeldung nur mit Double-Opt-in (§ 174 TKG 2021, DSGVO): Shop-Fußzeile/Kasse → Bestätigungslink; Kundenkonten mit Häkchen „Newsletter“ (E-Mail bestätigt) zählen mit.
   Abmeldung in jeder Ausgabe mit einem Klick (Bestätigungsseite, damit Link-Scanner nicht abmelden). Versand nur nach Freigabe im Cockpit – „automatisch montags“ ist ein Schalter (Standard AUS).
   Daten: Meta „print_newsletter“ { subs: {email: {status, source, createdAt, confirmedAt, unsubAt}}, settings, issues: {"2026-10-26": {...}} }. */
module.exports = function (D) {
  const { store, mailSend, sig, sigOk, nowIso, log, publicUrl, firm, products, priceFrom, vouchers, saveVouchers, accounts, limited } = D;
  const KEY = "print_newsletter";
  const DEF = { autoSend: false, sendHour: 8, pct: 5, codeDays: 14, testTo: "simon@fs-creative.at" };
  let NL = null;
  async function data() { if (!NL) { NL = (await store.getMeta(KEY).catch(() => null)) || {}; NL.subs = NL.subs || {}; NL.issues = NL.issues || {}; NL.settings = Object.assign({}, DEF, NL.settings || {}); } return NL; }
  const save = async () => { await store.setMeta(KEY, NL); };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
  const emailOk = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(e);
  const eur = n => "€ " + (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
  const deDate = iso => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "." + m[2] + "." + m[1] : ""; };

  // ── Kalender (Europe/Vienna): Montag der Woche, Kalenderwoche ──
  function vienna(d) {
    const p = {}; new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(d || new Date()).forEach(x => { p[x.type] = x.value; });
    return { date: p.year + "-" + p.month + "-" + p.day, hour: +p.hour, wd: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) };
  }
  const addDays = (iso, n) => { const t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  function kw(iso) { const t = new Date(iso + "T12:00:00Z"), day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const y = t.getUTCFullYear(), j4 = new Date(Date.UTC(y, 0, 4)); return 1 + Math.round(((t - j4) / 864e5 - 3 + ((j4.getUTCDay() + 6) % 7)) / 7); }
  // Nächste Ausgabe: der Montag dieser Woche (bis Mittwoch, solange nicht versendet), sonst der kommende Montag
  async function targetMonday() {
    const v = vienna(), mon = addDays(v.date, -v.wd), d = await data(), cur = d.issues[mon];
    return (v.wd <= 2 && !(cur && cur.status === "sent")) ? mon : addDays(mon, 7);
  }

  // ── Inhalte: Designer-Tipps (wöchentlich ein anderer) und Einleitungen ──
  const TIPS = [
    ["Beschnitt nie vergessen", "Hintergründe und Bilder immer bis zur roten Beschnittlinie ziehen – so bleibt nach dem Schneiden kein weißer Rand. Im Online-Designer ist die Linie eingezeichnet, der Datencheck warnt automatisch."],
    ["Texte in den Sicherheitsabstand", "Wichtige Texte und Logos gehören innerhalb der gestrichelten Linie. Ein Klick auf „In den Sicherheitsabstand schieben“ im Prüfen-Reiter erledigt das für dich."],
    ["Vorlage statt leeres Blatt", "Über 20 Vorlagen-Stile im Designer: Stil wählen, Texte tauschen, Logo rein – fertig. Farben und Schriften passen sich automatisch an."],
    ["Der KI-Assistent schreibt mit", "Beschreib in einem Satz, was du brauchst („Flyer fürs Sommerfest, Eintritt frei“) – der KI-Assistent im Designer schlägt Texte, Vorlage und Farben vor. Gratis."],
    ["Bilder in Druckqualität", "Für scharfen Druck braucht ein Foto rund 300 dpi in der gedruckten Größe. Der Designer zeigt bei jedem Bild an, ob die Auflösung reicht."],
    ["QR-Code in Sekunden", "Unter „QR-Code“ im Designer: Link oder Kontaktdaten eingeben, Farbe wählen, platzieren. Tipp: mindestens 2 × 2 cm groß drucken, damit jedes Handy ihn liest."],
    ["Deine Markenfarben merken", "Im Reiter „Marke“ speicherst du Logo und Farben einmal – bei jedem neuen Produkt sind sie sofort griffbereit."],
    ["Folder richtig anlegen", "Beim Folder wählst du das gefaltete Format, gestaltet wird das offene. Der Designer zeigt die Falzlinien – Texte nie direkt auf die Falz setzen."],
    ["Druckvorlage zum Download", "Du gestaltest lieber in InDesign, Illustrator, Affinity oder Canva? Bei jedem Produkt gibt es eine PDF-Vorlage mit Beschnitt, Sicherheitsabstand und Falzlinien."],
    ["Lesbare Schriftgrößen", "Fließtext auf Flyern und Karten mindestens 8–9 pt, auf Plakaten deutlich größer. Lieber weniger Text und mehr Luft – das wirkt professioneller."],
    ["Entwurf per Link sichern", "Mit „Link“ speicherst du deinen Entwurf und machst später auf einem anderen Gerät weiter – oder schickst ihn zur Freigabe an Kolleg:innen."],
    ["Mehrere Motive, eine Auflage", "500 Flyer, aber zwei Designs? Wähle „Anzahl Motive“ und verteile die Stückzahl frei – ohne Aufpreis."]
  ];
  const INTROS = [
    "Neue Woche, neue Ideen: Hier sind unsere Druck-Tipps für dich – und wie immer 5 % Rabatt obendrauf.",
    "Damit deine Werbung diese Woche auffällt: drei Produkte, die sich gerade lohnen, und ein Profi-Tipp für den Designer.",
    "Du planst ein Event, eine Aktion oder einfach neue Visitenkarten? Diese Woche haben wir drei Empfehlungen für dich.",
    "Gut gedruckt ist halb gewonnen. Unsere Auswahl der Woche – persönlich geprüft und in ganz Österreich versandkostenfrei.",
    "Kurz und knackig: drei Druck-Ideen, ein Designer-Tipp und dein Wochencode."
  ];
  const DESC = { flyer: "Der Klassiker für Angebote und Events – von A6 bis A3, matt oder glänzend.", visitenkarten: "Der erste Eindruck zum Mitnehmen – auf Wunsch mit edler Veredelung.", plakate: "Große Wirkung ab 1 Stück – für Veranstaltungen, Aktionen und Schaufenster.",
    folder: "Gefalzt für Speisekarten, Preislisten und Prospekte – mit Falz-Vorlage.", postcards: "Karten für Mailings, Einladungen und Grüße – in vielen Formaten.", aufkleber: "Logo-Sticker, Etiketten und Aufkleber in deiner Wunschform.",
    rollups: "Mobiler Blickfang für Messe und Empfang – inklusive System und Tasche.", "pvc-banner": "Wetterfestes Banner in Wunschgröße – mit Saum und Ösen.", "mesh-banner": "Winddurchlässiges Gitterbanner für Zäune und Gerüste.",
    "stapled-magazines": "Broschüren mit Rückenheftung – für Kataloge, Vereinshefte und Programme.", "printed-letterheads": "Briefpapier mit deinem Logo – seriös auf jedem Schreibtisch.", blocknotes: "Notizblöcke mit Logo – Werbung, die täglich in der Hand liegt.",
    "tshirt-basic": "Shirts mit Logo für Team, Verein und Event – schon ab 1 Stück.", "tshirt-bio": "Bio-Shirts von Stanley/Stella – fair, weich und mit deinem Design.", tasse: "Tassen mit Logo – das Werbegeschenk für jeden Tag.",
    baumwolltasche: "Stofftaschen mit Aufdruck – nachhaltig und gern getragen.", kugelschreiber: "Kugelschreiber mit Logo – der Klassiker unter den Give-aways.", bookmarks: "Lesezeichen für Buchhandlungen, Bibliotheken und Events.",
    "tear-off-calendars": "Abreißkalender mit deinem Logo – ein ganzes Jahr präsent.", beachflags: "Beachflags für Events, Eingänge und Sportplätze – weithin sichtbar." };
  // Empfehlungen: Produkte, bei denen wir laut Preisvergleich günstiger als druck.at/Flyeralarm sind (im Cockpit frei änderbar)
  const PICKS = ["flyer", "postcards", "plakate", "pvc-banner", "folder", "tshirt-basic", "rollups", "mesh-banner", "tshirt-bio", "bauzaun"];
  async function draftFor(mon) {
    const w = kw(mon), list = (await products()).filter(p => PICKS.indexOf(p.key) > -1).sort((a, b) => PICKS.indexOf(a.key) - PICKS.indexOf(b.key));
    const n = list.length || 1, pick = [0, 1, 2].map(i => list[(w * 3 + i * 7) % n]).filter(Boolean).filter((p, i, a) => a.indexOf(p) === i).map(p => p.key);
    const tip = TIPS[w % TIPS.length], d = await data();
    return { monday: mon, kw: w, status: "draft", subject: "Druck-Tipps der Woche (KW " + w + ") + " + d.settings.pct + " % Rabatt", intro: INTROS[w % INTROS.length], products: pick.slice(0, 3),
      tipTitle: tip[0], tipText: tip[1], code: "NL" + String(mon).slice(2, 4) + "KW" + String(w).padStart(2, "0"), createdAt: nowIso(), auto: true };
  }
  async function issueFor(mon, create) { const d = await data(); if (!d.issues[mon] && create) { d.issues[mon] = await draftFor(mon); await save(); } return d.issues[mon] || null; }

  // ── E-Mail (HTML + Text) ──
  async function render(iss, to) {
    const d = await data(), base = publicUrl(), F = firm(), all = await products(), until = addDays(iss.monday, d.settings.codeDays - 1);
    const items = [];
    for (const k of iss.products || []) { const p = all.find(x => x.key === k); if (!p) continue; let pr = null; try { pr = await priceFrom(k); } catch (e) {} items.push({ p, pr, url: base + "/print?produkt=" + encodeURIComponent(k) + "&utm_source=newsletter&utm_campaign=kw" + iss.kw }); }
    const unsub = to ? base + "/print/newsletter/abmelden?e=" + encodeURIComponent(to) + "&t=" + sig("nlu", to.toLowerCase()) : base + "/print/newsletter/abmelden";
    const shop = base + "/print?utm_source=newsletter&utm_campaign=kw" + iss.kw;
    const legal = [
      "Du erhältst diesen Newsletter, weil du ihn im FS Creative Druckshop abonniert und bestätigt hast. Abmelden ist jederzeit kostenlos mit einem Klick möglich: " + unsub,
      "Gutschein " + iss.code + ": " + String(d.settings.pct).replace(".", ",") + " % Rabatt auf den Bestellwert (netto, inkl. Versand) einer Bestellung im Druckshop www.fs-creative.at/print, gültig bis " + deDate(until) + ", einmal je Kundin/Kunde einlösbar, nicht mit anderen Gutscheincodes kombinierbar, keine Barablöse. Der Bonusrabatt für Firmen bleibt zusätzlich erhalten.",
      "Alle Preise in Euro inkl. 20 % USt und Versand innerhalb Österreichs, Stand " + deDate(iss.monday) + "; „ab“-Preise gelten für die angegebene Stückzahl in Standardausführung. Druck- und Satzfehler vorbehalten. Es gelten unsere AGB für den Druckshop: " + base + "/print/agb",
      "Medieninhaber, Herausgeber und Verantwortlicher (Offenlegung gem. § 25 MedienG, Angaben gem. § 5 ECG): " + F.name + " – " + F.owner + ", Einzelunternehmen, " + F.street + ", " + F.zip + " " + F.city + ", Österreich · " + F.email + " · " + F.phone + " · UID " + F.uid + ". Grundlegende Richtung: Informationen über Angebote und Neuheiten des FS Creative Druckshops. Impressum: " + base + "/impressum · Datenschutz: " + base + "/datenschutz"
    ];
    const btn = (href, t) => '<a href="' + esc(href) + '" style="display:inline-block;background:#0a84ff;color:#ffffff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:999px;font-size:15px">' + esc(t) + "</a>";
    const card = x => '<td valign="top" style="width:33%;padding:6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5ea;border-radius:14px;overflow:hidden;background:#ffffff"><tr><td>' +
      (x.p.img ? '<a href="' + esc(x.url) + '"><img src="' + esc(x.p.img) + '" alt="' + esc(x.p.title) + '" width="180" style="display:block;width:100%;height:auto;border:0"></a>' : "") +
      '</td></tr><tr><td style="padding:12px 12px 14px"><div style="font-weight:700;font-size:15px;margin-bottom:4px">' + esc(x.p.title) + '</div><div style="font-size:13px;color:#6e6e73;line-height:1.4;margin-bottom:8px">' + esc(String(DESC[x.p.key] || x.p.desc || "").slice(0, 110)) + "</div>" +
      (x.pr ? '<div style="font-size:13px;margin-bottom:10px">' + (+x.pr.copies).toLocaleString("de-AT") + " Stk. ab <b>" + eur(x.pr.gross) + "</b></div>" : "") + '<a href="' + esc(x.url) + '" style="color:#0a84ff;font-weight:600;text-decoration:none;font-size:14px">Jetzt gestalten →</a></td></tr></table></td>';
    const html = '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(iss.subject) + '</title></head><body style="margin:0;background:#f5f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1f">' +
      '<div style="display:none;max-height:0;overflow:hidden">' + esc(iss.intro) + "</div>" +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7"><tr><td align="center" style="padding:20px 10px">' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden">' +
      '<tr><td style="background:#0b0b10;color:#ffffff;padding:22px 26px"><div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7db6ff">FS Creative Druckshop · KW ' + iss.kw + '</div><div style="font-size:24px;font-weight:700;margin-top:6px">Druck-Tipps der Woche</div></td></tr>' +
      '<tr><td style="padding:22px 26px 6px;font-size:16px;line-height:1.5">' + esc(iss.intro).replace(/\n/g, "<br>") + "</td></tr>" +
      '<tr><td style="padding:12px 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px dashed #0a84ff;border-radius:14px;background:#f0f7ff"><tr><td align="center" style="padding:16px"><div style="font-size:14px;color:#3a3a3c">Dein Newsletter-Code für ' + String(d.settings.pct).replace(".", ",") + ' % Rabatt</div><div style="font-size:26px;font-weight:800;letter-spacing:.08em;margin:6px 0;font-family:ui-monospace,Menlo,monospace">' + esc(iss.code) + '</div><div style="font-size:13px;color:#6e6e73">gültig bis ' + deDate(until) + " · einfach an der Kasse eingeben</div></td></tr></table></td></tr>" +
      (items.length ? '<tr><td style="padding:16px 20px 6px"><div style="font-size:18px;font-weight:700;padding:0 6px 8px">Unsere Empfehlungen der Woche</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + items.map(card).join("") + "</tr></table></td></tr>" : "") +
      '<tr><td style="padding:14px 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;border-radius:14px"><tr><td style="padding:16px 18px"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6e6e73">Designer-Tipp der Woche</div><div style="font-size:16px;font-weight:700;margin:4px 0 6px">' + esc(iss.tipTitle) + '</div><div style="font-size:14px;line-height:1.5;color:#3a3a3c">' + esc(iss.tipText) + '</div><div style="margin-top:8px"><a href="' + esc(base + "/print/hilfe#designer") + '" style="color:#0a84ff;font-weight:600;text-decoration:none;font-size:14px">Mehr zum Online-Designer →</a></div></td></tr></table></td></tr>' +
      '<tr><td align="center" style="padding:10px 26px 26px">' + btn(shop, "Zum Druckshop") + '<div style="font-size:13px;color:#6e6e73;margin-top:10px">Persönlich geprüft vor jedem Druck · Versand in Österreich inklusive</div></td></tr>' +
      '<tr><td style="padding:18px 26px;background:#fafafa;border-top:1px solid #e5e5ea;font-size:11.5px;line-height:1.5;color:#86868b">' + legal.map(t => "<p style=\"margin:0 0 8px\">" + esc(t).replace(esc(unsub), '<a href="' + esc(unsub) + '" style="color:#6e6e73">Newsletter abbestellen</a>') + "</p>").join("") + "</td></tr>" +
      "</table></td></tr></table></body></html>";
    const text = ["FS Creative Druckshop – Druck-Tipps der Woche (KW " + iss.kw + ")", "", iss.intro, "", "DEIN CODE: " + iss.code + " – " + d.settings.pct + " % Rabatt, gültig bis " + deDate(until), "",
      "EMPFEHLUNGEN DER WOCHE"].concat(items.map(x => "• " + x.p.title + (x.pr ? " – " + x.pr.copies + " Stk. ab " + eur(x.pr.gross) : "") + "\n  " + x.url),
      ["", "DESIGNER-TIPP: " + iss.tipTitle, iss.tipText, "", "Zum Druckshop: " + shop, "", "—"], legal).join("\n");
    return { html, text, unsub, until };
  }

  // ── Wochencode als Gutschein anlegen (5 %, 1× je Kunde, befristet) ──
  async function ensureCode(iss) {
    const d = await data(), all = await vouchers(), code = String(iss.code || "").toUpperCase(), until = addDays(iss.monday, d.settings.codeDays - 1);
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw Object.assign(new Error("Ungültiger Code"), { status: 400 });
    const prev = all[code] || { code, createdAt: nowIso(), used: 0, usedBy: [] };
    all[code] = Object.assign(prev, { pct: d.settings.pct, maxUses: 0, until, perCustomer: true, active: true, note: "Newsletter KW " + iss.kw });
    await saveVouchers(all);
  }

  // ── Empfänger: bestätigte Anmeldungen + Kundenkonten mit Newsletter-Häkchen (E-Mail bestätigt), ohne Abmeldungen ──
  async function recipients() {
    const d = await data(), out = new Map();
    Object.values(d.subs).forEach(s => { if (s.status === "active") out.set(s.email, { email: s.email, source: s.source || "Anmeldung" }); });
    for (const c of await accounts().catch(() => [])) {
      const e = String(c.email || "").toLowerCase(), s = d.subs[e];
      if (!c.newsletter || !c.verified || !emailOk(e)) continue;
      if (s && s.status === "unsub" && !(c.newsletterAt && c.newsletterAt > s.unsubAt)) continue;
      if (!out.has(e)) out.set(e, { email: e, source: "Kundenkonto" });
    }
    return [...out.values()];
  }
  let SENDING = false;
  async function send(mon, onlyTo) {
    const d = await data(), iss = await issueFor(mon, true);
    if (!onlyTo && (iss.status === "sent" || iss.status === "sending")) throw Object.assign(new Error("Diese Ausgabe wurde schon versendet"), { status: 409 });
    if (SENDING && !onlyTo) throw Object.assign(new Error("Versand läuft bereits"), { status: 409 });
    if (!mailSend) throw Object.assign(new Error("Mailserver nicht eingerichtet"), { status: 503 });
    await ensureCode(iss);
    if (onlyTo) { const r = await render(iss, onlyTo); await mailSend({ to: onlyTo, subject: "[Test] " + iss.subject, text: r.text, html: r.html }); return { test: true }; }
    const list = await recipients(); SENDING = true; iss.status = "sending"; iss.startedAt = nowIso(); iss.total = list.length; iss.sent = 0; iss.failed = 0; await save();
    (async () => {
      for (const r of list) {
        try { const m = await render(iss, r.email); await mailSend({ to: r.email, subject: iss.subject, text: m.text, html: m.html }); iss.sent++; }
        catch (e) { iss.failed++; log("Newsletter an " + r.email.replace(/^[^@]+/, "…") + ":", e.message); }
        if ((iss.sent + iss.failed) % 20 === 0) await save().catch(() => {});
        await new Promise(res => setTimeout(res, 400));
      }
      iss.status = "sent"; iss.sentAt = nowIso(); SENDING = false; await save().catch(() => {}); log("Newsletter KW " + iss.kw + " versendet: " + iss.sent + " ok, " + iss.failed + " Fehler");
    })().catch(e => { SENDING = false; log("Newsletter-Versand:", e.message); });
    return { started: true, total: list.length };
  }

  // Stündlich: Entwurf der nächsten Ausgabe bereitstellen; mit „automatisch“ montags ab der eingestellten Stunde versenden
  async function tick() {
    try {
      const d = await data(), v = vienna(), mon = addDays(v.date, -v.wd);
      await issueFor(await targetMonday(), true);
      const iss = d.issues[mon];
      if (d.settings.autoSend && v.wd === 0 && v.hour >= d.settings.sendHour && iss && iss.status === "draft" && !SENDING) { log("Newsletter KW " + iss.kw + ": automatischer Versand"); await send(mon); }
    } catch (e) { log("Newsletter-Tick:", e.message); }
  }

  // ── öffentliche Seiten ──
  const page = (title, body) => '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + esc(title) + ' – FS Creative Druckshop</title><link rel="stylesheet" href="/landing.css"><style>body{background:var(--bg);color:var(--text)}main{max-width:620px;margin:0 auto;padding:110px 20px 60px}.box{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:28px}.code{font:800 26px ui-monospace,Menlo,monospace;letter-spacing:.08em;padding:12px 16px;border:2px dashed #0a84ff;border-radius:12px;display:inline-block;margin:10px 0}button{font:inherit}</style></head><body><main><div class="box">' + body + '</div><p style="margin-top:18px"><a href="/print">← Zum Druckshop</a></p></main></body></html>';
  async function handlePublic(req, res, p, u, ip, J, readJson, sameOrigin) {
    if (p === "/print/api/newsletter" && req.method === "POST") {
      if (!sameOrigin(req)) return J(res, 403, { ok: false, error: "forbidden" });
      if (limited("nl", ip, 8, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Versuche – bitte später erneut" });
      const b = await readJson(req, 2000), email = String(b.email || "").trim().toLowerCase();
      if (!emailOk(email)) return J(res, 400, { ok: false, error: "Bitte eine gültige E-Mail-Adresse eingeben" });
      if (b.consent !== true) return J(res, 400, { ok: false, error: "Bitte bestätige die Einwilligung" });
      const d = await data(), s = d.subs[email];
      if (s && s.status === "active") return J(res, 200, { ok: true, already: true, msg: "Du bist schon angemeldet – der nächste Newsletter kommt am Montag." });
      d.subs[email] = Object.assign(s || {}, { email, status: "pending", source: clip(b.source || "Shop", 40), requestedAt: nowIso(), consentText: "Wöchentlicher Druckshop-Newsletter mit Produkttipps und Rabattcode per E-Mail; Abmeldung jederzeit" });
      if (Object.keys(d.subs).length > 50000) return J(res, 503, { ok: false, error: "Gerade nicht möglich" });
      await save();
      const link = publicUrl() + "/print/newsletter/bestaetigen?e=" + encodeURIComponent(email) + "&t=" + sig("nlc", email);
      if (mailSend) await mailSend({ to: email, subject: "Bitte bestätige deine Newsletter-Anmeldung", text: "Hallo!\n\nBitte bestätige deine Anmeldung zum Newsletter des FS Creative Druckshops (wöchentlich montags: Produkttipps, Designer-Tipp und " + d.settings.pct + " %-Rabattcode):\n\n" + link + "\n\nWenn du dich nicht angemeldet hast, ignoriere diese E-Mail einfach – ohne Bestätigung erhältst du nichts.\n\nFS Creative · " + firm().owner + " · " + firm().street + " · " + firm().zip + " " + firm().city,
        html: '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;color:#1d1d1f;max-width:560px"><h2 style="font-size:20px">Bitte bestätige deine Anmeldung</h2><p>Du bekommst dann jeden Montag unsere Druck-Tipps der Woche, einen Designer-Tipp und einen ' + d.settings.pct + '-%-Rabattcode.</p><p><a href="' + esc(link) + '" style="display:inline-block;background:#0a84ff;color:#fff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:999px">Anmeldung bestätigen</a></p><p style="color:#6e6e73;font-size:13px">Wenn du dich nicht angemeldet hast, ignoriere diese E-Mail einfach – ohne Bestätigung erhältst du nichts.</p><p style="color:#6e6e73;font-size:12px">FS Creative · ' + esc(firm().owner) + " · " + esc(firm().street) + " · " + esc(firm().zip + " " + firm().city) + "</p></div>" }).catch(e => log("Newsletter-Bestätigung:", e.message));
      return J(res, 200, { ok: true, msg: "Fast geschafft! Bitte bestätige die Anmeldung über den Link in der E-Mail an " + email + "." });
    }
    if (p === "/print/newsletter/bestaetigen" && req.method === "GET") {
      const email = String(u.searchParams.get("e") || "").toLowerCase();
      if (!emailOk(email) || !sigOk("nlc", email, u.searchParams.get("t"))) return D.send(res, 400, page("Link ungültig", "<h1>Link ungültig</h1><p>Der Bestätigungslink ist ungültig oder unvollständig. Bitte melde dich erneut an.</p>"), "text/html; charset=utf-8");
      const d = await data(), s = d.subs[email] || { email, source: "Link" };
      const was = s.status === "active"; s.status = "active"; if (!was) s.confirmedAt = nowIso(); delete s.unsubAt; d.subs[email] = s; await save();
      const iss = await issueFor(await targetMonday(), true);
      return D.send(res, 200, page("Anmeldung bestätigt", "<h1>Danke – du bist dabei! 🎉</h1><p>Ab sofort bekommst du jeden Montag unsere Druck-Tipps der Woche. Mit deinem ersten Code sparst du gleich " + esc(String(d.settings.pct).replace(".", ",")) + " %:</p><div class=\"code\">" + esc(iss.code) + "</div><p class=\"muted\">Gültig bis " + deDate(addDays(iss.monday, d.settings.codeDays - 1)) + ", einmal je Kunde, an der Kasse eingeben. Abmelden kannst du dich jederzeit über den Link in jedem Newsletter.</p>"), "text/html; charset=utf-8");
    }
    if (p === "/print/newsletter/abmelden") {
      const email = String(u.searchParams.get("e") || "").toLowerCase(), t = u.searchParams.get("t");
      if (!emailOk(email) || !sigOk("nlu", email, t)) return D.send(res, 400, page("Abmelden", "<h1>Abmelden</h1><p>Dieser Abmeldelink ist ungültig. Schreib uns einfach an <a href=\"mailto:" + esc(firm().email) + "\">" + esc(firm().email) + "</a> – wir tragen dich sofort aus.</p>"), "text/html; charset=utf-8");
      if (req.method === "POST") {   // auch RFC-8058-One-Click
        const d = await data(); d.subs[email] = Object.assign(d.subs[email] || { email }, { status: "unsub", unsubAt: nowIso() }); await save();
        return D.send(res, 200, page("Abgemeldet", "<h1>Du bist abgemeldet</h1><p>Du erhältst keinen Newsletter mehr an <b>" + esc(email) + "</b>. Bestellbestätigungen und Rechnungen bekommst du natürlich weiterhin.</p><p class=\"muted\">Versehentlich? Im Druckshop kannst du dich jederzeit wieder anmelden.</p>"), "text/html; charset=utf-8");
      }
      return D.send(res, 200, page("Newsletter abmelden", "<h1>Newsletter abmelden</h1><p>Möchtest du den wöchentlichen Druckshop-Newsletter an <b>" + esc(email) + "</b> abbestellen?</p><form method=\"post\"><button type=\"submit\" class=\"btn primary\">Ja, abmelden</button></form>"), "text/html; charset=utf-8");
    }
    return false;
  }

  // ── Cockpit ──
  async function state() {
    const d = await data(), mon = await targetMonday(), iss = await issueFor(mon, true), rec = await recipients();
    const subs = Object.values(d.subs).sort((a, b) => String(b.confirmedAt || b.requestedAt || "").localeCompare(String(a.confirmedAt || a.requestedAt || "")));
    return { settings: d.settings, issue: iss, recipients: rec.length, sending: SENDING, counts: { active: subs.filter(s => s.status === "active").length, pending: subs.filter(s => s.status === "pending").length, unsub: subs.filter(s => s.status === "unsub").length, accounts: rec.filter(r => r.source === "Kundenkonto").length },
      subs: subs.slice(0, 500).map(s => ({ email: s.email, status: s.status, source: s.source || "", at: s.confirmedAt || s.requestedAt || s.unsubAt || "" })),
      history: Object.values(d.issues).filter(x => x.status !== "draft").sort((a, b) => b.monday.localeCompare(a.monday)).slice(0, 30).map(x => ({ monday: x.monday, kw: x.kw, subject: x.subject, status: x.status, sent: x.sent || 0, failed: x.failed || 0, total: x.total || 0, sentAt: x.sentAt || "" })),
      tips: TIPS.map(t => t[0]), picks: (await products()).map(p => ({ key: p.key, title: (PICKS.indexOf(p.key) > -1 ? "★ " : "") + p.title, o: PICKS.indexOf(p.key) > -1 ? PICKS.indexOf(p.key) : 999 })).sort((x, y) => x.o - y.o || x.title.localeCompare(y.title, "de")).map(p => ({ key: p.key, title: p.title })) };
  }
  async function handleAdmin(req, res, p, J, readJson) {
    if (p !== "/admin/api/print/newsletter") return false;
    if (req.method === "GET") return J(res, 200, Object.assign({ ok: true }, await state()));
    const b = await readJson(req, 40000), d = await data();
    try {
      if (b.op === "settings") {
        const s = d.settings; if (b.autoSend !== undefined) s.autoSend = b.autoSend === true;
        if (b.sendHour !== undefined) s.sendHour = Math.max(5, Math.min(20, parseInt(b.sendHour, 10) || 8));
        if (b.pct !== undefined) { const n = parseFloat(String(b.pct).replace(",", ".")); if (n > 0 && n <= 30) s.pct = Math.round(n * 10) / 10; }
        if (b.codeDays !== undefined) s.codeDays = Math.max(3, Math.min(60, parseInt(b.codeDays, 10) || 14));
        if (b.testTo !== undefined && emailOk(String(b.testTo).trim())) s.testTo = String(b.testTo).trim();
        await save(); return J(res, 200, Object.assign({ ok: true }, await state()));
      }
      const mon = /^\d{4}-\d{2}-\d{2}$/.test(String(b.monday || "")) ? String(b.monday) : await targetMonday();
      if (b.op === "save") {
        const iss = await issueFor(mon, true); if (iss.status !== "draft") return J(res, 409, { ok: false, error: "Schon versendet – nicht mehr änderbar" });
        if (b.subject !== undefined) iss.subject = clip(b.subject, 160) || iss.subject; if (b.intro !== undefined) iss.intro = clip(b.intro, 1200);
        if (Array.isArray(b.products)) { const keys = (await products()).map(x => x.key); iss.products = b.products.map(String).filter(k => keys.indexOf(k) > -1).slice(0, 3); }
        if (b.tipTitle !== undefined) iss.tipTitle = clip(b.tipTitle, 120); if (b.tipText !== undefined) iss.tipText = clip(b.tipText, 800);
        if (b.code !== undefined) { const c = String(b.code).toUpperCase().replace(/\s+/g, "").slice(0, 40); if (!/^[A-Z0-9_-]{3,40}$/.test(c)) return J(res, 400, { ok: false, error: "Code: 3–40 Zeichen, A–Z, 0–9, - und _" }); iss.code = c; }
        iss.auto = false; iss.editedAt = nowIso(); await save(); return J(res, 200, Object.assign({ ok: true }, await state()));
      }
      if (b.op === "regen") { const old = d.issues[mon]; if (old && old.status !== "draft") return J(res, 409, { ok: false, error: "Schon versendet" }); d.issues[mon] = await draftFor(mon); await save(); return J(res, 200, Object.assign({ ok: true }, await state())); }
      if (b.op === "preview") { const r = await render(await issueFor(mon, true), d.settings.testTo); return J(res, 200, { ok: true, html: r.html }); }
      if (b.op === "test") { const to = emailOk(String(b.to || "").trim()) ? String(b.to).trim() : d.settings.testTo; await send(mon, to); return J(res, 200, { ok: true, msg: "Testmail an " + to + " gesendet" }); }
      if (b.op === "send") { if (b.confirm !== true) return J(res, 400, { ok: false, error: "Bitte bestätigen" }); const r = await send(mon); return J(res, 200, Object.assign({ ok: true }, r)); }
      if (b.op === "unsub") { const e = String(b.email || "").toLowerCase(); if (!d.subs[e]) d.subs[e] = { email: e }; Object.assign(d.subs[e], { status: "unsub", unsubAt: nowIso() }); await save(); return J(res, 200, Object.assign({ ok: true }, await state())); }
      if (b.op === "export") { const rec = await recipients(); return J(res, 200, { ok: true, csv: "email;quelle\n" + rec.map(r => r.email + ";" + r.source).join("\n") }); }
    } catch (e) { return J(res, e.status || 500, { ok: false, error: e.message }); }
    return J(res, 400, { ok: false, error: "Unbekannte Aktion" });
  }
  return { handlePublic, handleAdmin, tick, recipients, _test: { kw, addDays, vienna } };
};
