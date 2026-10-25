"use strict";
/* Druckshop-Newsletter (www.fs-creative.at/print): wöchentlich montags – Produkttipps der Woche, Designer-Tipp (rotiert), Pflichtangaben.
   Rabattcode (5 %) nur in der ersten Ausgabe im Monat (Montag 1.–7.), 14 Tage gültig; die übrigen Wochen ohne Code.
   Anmeldung mit Einwilligungs-Häkchen ist sofort aktiv (Wunsch Simon 25.10.2026, statt Double-Opt-in): Shop-Fußzeile/Kasse → Willkommensmail mit Abmeldelink;
   Einwilligung wird mit Text und Zeitpunkt gespeichert (Nachweis). Kundenkonten mit Häkchen „Newsletter“ (E-Mail bestätigt) zählen mit.
   Abmeldung in jeder Ausgabe mit einem Klick (Bestätigungsseite, damit Link-Scanner nicht abmelden). Versand nur nach Freigabe im Cockpit – „automatisch montags“ ist ein Schalter (Standard AUS).
   Daten: Meta „print_newsletter“ { subs: {email: {status, source, createdAt, confirmedAt, unsubAt}}, settings, issues: {"2026-10-26": {...}} }. */
module.exports = function (D) {
  const { store, mailSend, sig, sigOk, nowIso, log, publicUrl, firm, products, priceFrom, vouchers, saveVouchers, accounts, limited } = D;
  const KEY = "print_newsletter";
  const DEF = { autoSend: false, sendHour: 8, pct: 5, codeDays: 14, testTo: "simon@fs-creative.at" };
  const CODE_DAYS = 14;   // Monatscode: 2 Wochen gültig
  const MON3 = ["JAN", "FEB", "MAR", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"], MONDE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const codeIssue = mon => +String(mon).slice(8, 10) <= 7;   // erster Montag im Monat
  const monthCode = mon => "NL" + MON3[+String(mon).slice(5, 7) - 1] + String(mon).slice(2, 4);   // z. B. NLNOV26
  let NL = null;
  // Willkommensmail statt Bestätigungsanfrage – mit laufendem Monatscode (falls gültig) und Abmeldelink
  function currentCode(d) { const today = vienna().date; return Object.values(d.issues).filter(x => x.code && x.status === "sent" && addDays(x.monday, CODE_DAYS - 1) >= today).sort((a, b) => b.monday.localeCompare(a.monday))[0]; }
  async function welcome(email) {
    if (!mailSend) return; const d = await data(), pct = String(d.settings.pct).replace(".", ","), cur = currentCode(d), f = firm();
    const unsub = publicUrl() + "/print/newsletter/abmelden?e=" + encodeURIComponent(email) + "&t=" + sig("nlu", email);
    const codeTxt = cur ? "\n\nDer aktuelle Code gilt noch – du sparst damit gleich " + pct + " %: " + cur.code + " (gültig bis " + deDate(addDays(cur.monday, CODE_DAYS - 1)) + ", einmal je Kunde, an der Kasse eingeben)." : "";
    const codeHtml = cur ? '<p>Der aktuelle Code gilt noch – du sparst damit gleich ' + esc(pct) + ' %:</p><p style="font-size:22px;font-weight:700;letter-spacing:.06em;background:#f2f2f7;border-radius:12px;padding:12px 16px;display:inline-block">' + esc(cur.code) + '</p><p style="color:#6e6e73;font-size:13px">Gültig bis ' + esc(deDate(addDays(cur.monday, CODE_DAYS - 1))) + ', einmal je Kunde, an der Kasse eingeben.</p>' : "";
    await mailSend({ to: email, subject: "Willkommen beim Druckshop-Newsletter 🎉",
      text: "Hallo!\n\nDanke für deine Anmeldung – du bist dabei! Ab sofort bekommst du jeden Montag unsere Druck-Tipps der Woche und einen Designer-Tipp, und mit dem ersten Newsletter im Monat einen " + pct + "-%-Rabattcode." + codeTxt + "\n\nAbmelden kannst du dich jederzeit: " + unsub + "\n\nFS Creative · " + f.owner + " · " + f.street + " · " + f.zip + " " + f.city,
      html: '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;color:#1d1d1f;max-width:560px"><h2 style="font-size:20px">Danke – du bist dabei! 🎉</h2><p>Ab sofort bekommst du jeden Montag unsere Druck-Tipps der Woche und einen Designer-Tipp – und mit dem ersten Newsletter im Monat einen ' + esc(pct) + '-%-Rabattcode.</p>' + codeHtml +
        '<p><a href="' + esc(publicUrl() + "/print") + '" style="display:inline-block;background:#0a84ff;color:#fff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:999px">Zum Druckshop</a></p><p style="color:#6e6e73;font-size:12px">Du hast dich nicht angemeldet oder willst keine Mails mehr? <a href="' + esc(unsub) + '" style="color:#6e6e73">Abmelden</a><br>FS Creative · ' + esc(f.owner) + " · " + esc(f.street) + " · " + esc(f.zip + " " + f.city) + "</p></div>" });
  }
  // Einmalig: offene (unbestätigte) Anmeldungen aus der Double-Opt-in-Zeit aktivieren und begrüßen
  let MIGRATED = false;
  async function activatePending() {
    if (MIGRATED) return; MIGRATED = true; const d = await data(), now = nowIso(), list = Object.values(d.subs).filter(s => s.status === "pending");
    if (!list.length) return;
    list.forEach(s => { s.status = "active"; s.confirmedAt = now; s.confirmNote = "ohne Bestätigungslink aktiviert (Einwilligung bei der Anmeldung)"; });
    await save(); log("Newsletter: " + list.length + " offene Anmeldung(en) aktiviert");
    for (const s of list) await welcome(s.email).catch(e => log("Newsletter-Willkommen:", e.message));
  }
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
  const INTROS_CODE = [
    "Neuer Monat, neuer Code: Hier sind unsere Druck-Tipps für dich – und 5 % Rabatt obendrauf, zwei Wochen lang.",
    "Der Monat startet mit einem Dankeschön: Dein Rabattcode für die nächsten zwei Wochen, dazu drei Druck-Ideen und ein Designer-Tipp.",
    "Monatsanfang ist Code-Zeit: 5 % auf deine nächste Bestellung – plus unsere Empfehlungen der Woche."
  ];
  const INTROS = [
    "Neue Woche, neue Ideen: Hier sind unsere Druck-Tipps für dich.",
    "Damit deine Werbung diese Woche auffällt: drei Produkte, die sich gerade lohnen, und ein Profi-Tipp für den Designer.",
    "Du planst ein Event, eine Aktion oder einfach neue Visitenkarten? Diese Woche haben wir drei Empfehlungen für dich.",
    "Gut gedruckt ist halb gewonnen. Unsere Auswahl der Woche – in ganz Österreich versandkostenfrei.",
    "Kurz und knackig: drei Druck-Ideen und ein Designer-Tipp für deine Woche."
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
    // Mischung: ein Papierprodukt, ein Großformat, abwechselnd Textil oder ein zweites Papierprodukt (jede Woche andere)
    const have = k => list.some(p => p.key === k), PA = ["flyer", "postcards", "plakate", "folder"].filter(have), BI = ["pvc-banner", "rollups", "mesh-banner", "bauzaun"].filter(have), TX = ["tshirt-basic", "tshirt-bio"].filter(have);
    let pick = [PA[w % (PA.length || 1)], BI[w % (BI.length || 1)], w % 2 === 0 && TX.length ? TX[(w / 2) % TX.length] : PA[(w + 2) % (PA.length || 1)]].filter(Boolean).filter((k, i, a) => a.indexOf(k) === i);
    if (pick.length < 3) pick = pick.concat(list.map(p => p.key).filter(k => pick.indexOf(k) < 0)).slice(0, 3);
    const tip = TIPS[w % TIPS.length], d = await data(), wc = codeIssue(mon);
    return { monday: mon, kw: w, status: "draft", subject: "Druck-Tipps der Woche (KW " + w + ")" + (wc ? " + " + String(d.settings.pct).replace(".", ",") + " % Rabatt" : ""), intro: wc ? INTROS_CODE[w % INTROS_CODE.length] : INTROS[w % INTROS.length], products: pick.slice(0, 3),
      tipTitle: tip[0], tipText: tip[1], code: wc ? monthCode(mon) : "", createdAt: nowIso(), auto: true, v: 2 };
  }
  // Nicht bearbeitete Entwürfe aus der Zeit mit Wochencode neu aufbauen (Code jetzt nur in der ersten Ausgabe im Monat)
  async function issueFor(mon, create) { const d = await data(), c = d.issues[mon];
    if ((!c && create) || (c && c.status === "draft" && c.auto && c.v !== 2)) { d.issues[mon] = await draftFor(mon); await save(); }
    return d.issues[mon] || null; }

  // ── E-Mail (HTML + Text) ──
  async function render(iss, to) {
    const d = await data(), base = publicUrl(), F = firm(), all = await products(), until = addDays(iss.monday, CODE_DAYS - 1), hasCode = !!iss.code;
    const nextMon = MONDE[(+String(iss.monday).slice(5, 7)) % 12];
    const items = [];
    for (const k of iss.products || []) { const p = all.find(x => x.key === k); if (!p) continue; let pr = null; try { pr = await priceFrom(k); } catch (e) {} items.push({ p, pr, url: base + "/print?produkt=" + encodeURIComponent(k) + "&utm_source=newsletter&utm_campaign=kw" + iss.kw }); }
    const unsub = to ? base + "/print/newsletter/abmelden?e=" + encodeURIComponent(to) + "&t=" + sig("nlu", to.toLowerCase()) : base + "/print/newsletter/abmelden";
    const shop = base + "/print?utm_source=newsletter&utm_campaign=kw" + iss.kw;
    const legal = [
      "Du erhältst diesen Newsletter, weil du ihn im FS Creative Druckshop abonniert und bestätigt hast. Abmelden ist jederzeit kostenlos mit einem Klick möglich: " + unsub,
 hasCode ? "Gutschein " + iss.code + ": " + String(d.settings.pct).replace(".", ",") + " % Rabatt auf den Bestellwert (netto, inkl. Versand) einer Bestellung im Druckshop www.fs-creative.at/print, gültig bis " + deDate(until) + ", einmal je Kundin/Kunde einlösbar, nicht mit anderen Gutscheincodes kombinierbar, keine Barablöse. Der Bonusrabatt für Firmen bleibt zusätzlich erhalten." : "",
      "Alle Preise in Euro inkl. 20 % USt und Versand innerhalb Österreichs, Stand " + deDate(iss.monday) + "; „ab“-Preise gelten für die angegebene Stückzahl in Standardausführung. Druck- und Satzfehler vorbehalten. Es gelten unsere AGB für den Druckshop: " + base + "/print/agb",
      "Medieninhaber, Herausgeber und Verantwortlicher (Offenlegung gem. § 25 MedienG, Angaben gem. § 5 ECG): " + F.name + " – " + F.owner + ", Einzelunternehmen, " + F.street + ", " + F.zip + " " + F.city + ", Österreich · " + F.email + " · " + F.phone + " · UID " + F.uid + ". Grundlegende Richtung: Informationen über Angebote und Neuheiten des FS Creative Druckshops. Impressum: " + base + "/impressum · Datenschutz: " + base + "/datenschutz"
    ].filter(Boolean);
    const btn = (href, t) => '<a href="' + esc(href) + '" style="display:inline-block;background:#0a84ff;color:#ffffff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:999px;font-size:15px">' + esc(t) + "</a>";
    const card = x => '<td valign="top" style="width:33%;padding:6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5ea;border-radius:14px;overflow:hidden;background:#ffffff"><tr><td>' +
      (x.p.img ? '<a href="' + esc(x.url) + '"><img src="' + esc(x.p.img) + '" alt="' + esc(x.p.title) + '" width="180" style="display:block;width:100%;height:auto;border:0"></a>' : "") +
      '</td></tr><tr><td style="padding:12px 12px 14px"><div style="font-weight:700;font-size:15px;margin-bottom:4px">' + esc(x.p.title) + '</div><div style="font-size:13px;color:#6e6e73;line-height:1.4;margin-bottom:8px">' + esc(String(DESC[x.p.key] || x.p.desc || "").slice(0, 110)) + "</div>" +
      (x.pr ? '<div style="font-size:13px;margin-bottom:10px">' + (+x.pr.copies).toLocaleString("de-AT") + " Stk. ab <b>" + eur(x.pr.gross) + "</b></div>" : "") + '<a href="' + esc(x.url) + '" style="color:#0a84ff;font-weight:600;text-decoration:none;font-size:14px">Jetzt gestalten →</a></td></tr></table></td>';
    const html = '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(iss.subject) + '</title></head><body style="margin:0;background:#f5f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1f">' +
      '<div style="display:none;max-height:0;overflow:hidden">' + esc(iss.intro) + "</div>" +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7"><tr><td align="center" style="padding:20px 10px">' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden">' +
      '<tr><td style="background:#0b0b10;color:#ffffff;padding:20px 26px 22px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle" style="padding-right:12px"><a href="' + esc(shop) + '"><img src="' + esc(base) + '/logos/mail-logo-weiss.png" width="44" height="44" alt="FS Creative" style="display:block;width:44px;height:44px;border:0"></a></td><td valign="middle" style="font-size:19px;font-weight:700;letter-spacing:-.01em;color:#ffffff">FS Creative<div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#7db6ff;margin-top:2px">Druckshop · KW ' + iss.kw + '</div></td></tr></table><div style="font-size:24px;font-weight:700;margin-top:16px">Druck-Tipps der Woche</div></td></tr>' +
      '<tr><td style="padding:22px 26px 6px;font-size:16px;line-height:1.5">' + esc(iss.intro).replace(/\n/g, "<br>") + "</td></tr>" +
      (hasCode ? '<tr><td style="padding:12px 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px dashed #0a84ff;border-radius:14px;background:#f0f7ff"><tr><td align="center" style="padding:16px"><div style="font-size:14px;color:#3a3a3c">🎉 Dein Monatscode für ' + String(d.settings.pct).replace(".", ",") + ' % Rabatt</div><div style="font-size:26px;font-weight:800;letter-spacing:.08em;margin:6px 0;font-family:ui-monospace,Menlo,monospace">' + esc(iss.code) + '</div><div style="font-size:13px;color:#6e6e73">gültig bis ' + deDate(until) + " (2 Wochen) · einfach an der Kasse eingeben</div></td></tr></table></td></tr>" : "") +
      (items.length ? '<tr><td style="padding:16px 20px 6px"><div style="font-size:18px;font-weight:700;padding:0 6px 8px">Unsere Empfehlungen der Woche</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + items.map(card).join("") + "</tr></table></td></tr>" : "") +
      '<tr><td style="padding:14px 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;border-radius:14px"><tr><td style="padding:16px 18px"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6e6e73">Designer-Tipp der Woche</div><div style="font-size:16px;font-weight:700;margin:4px 0 6px">' + esc(iss.tipTitle) + '</div><div style="font-size:14px;line-height:1.5;color:#3a3a3c">' + esc(iss.tipText) + '</div><div style="margin-top:8px"><a href="' + esc(base + "/print/hilfe#designer") + '" style="color:#0a84ff;font-weight:600;text-decoration:none;font-size:14px">Mehr zum Online-Designer →</a></div></td></tr></table></td></tr>' +
      '<tr><td align="center" style="padding:10px 26px 26px">' + btn(shop, "Zum Druckshop") + '<div style="font-size:13px;color:#6e6e73;margin-top:10px">Automatischer Datencheck · Versand in Österreich inklusive' + (hasCode ? "" : "<br>Den nächsten Rabattcode bekommst du mit dem ersten Newsletter im " + nextMon + ".") + "</div></td></tr>" +
      '<tr><td style="padding:18px 26px;background:#fafafa;border-top:1px solid #e5e5ea;font-size:11.5px;line-height:1.5;color:#86868b">' + legal.map(t => "<p style=\"margin:0 0 8px\">" + esc(t).replace(esc(unsub), '<a href="' + esc(unsub) + '" style="color:#6e6e73">Newsletter abbestellen</a>') + "</p>").join("") + "</td></tr>" +
      "</table></td></tr></table></body></html>";
    const text = ["FS Creative Druckshop – Druck-Tipps der Woche (KW " + iss.kw + ")", "", iss.intro, ""].concat(hasCode ? ["DEIN MONATSCODE: " + iss.code + " – " + d.settings.pct + " % Rabatt, gültig bis " + deDate(until), ""] : [], [
      "EMPFEHLUNGEN DER WOCHE"]).concat(items.map(x => "• " + x.p.title + (x.pr ? " – " + x.pr.copies + " Stk. ab " + eur(x.pr.gross) : "") + "\n  " + x.url),
      ["", "DESIGNER-TIPP: " + iss.tipTitle, iss.tipText, "", "Zum Druckshop: " + shop, "", "—"], legal).join("\n");
    return { html, text, unsub, until };
  }

  // ── Monatscode als Gutschein anlegen (5 %, 1× je Kunde, 14 Tage) ──
  async function ensureCode(iss) {
    if (!iss.code) return;
    const d = await data(), all = await vouchers(), code = String(iss.code || "").toUpperCase(), until = addDays(iss.monday, CODE_DAYS - 1);
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw Object.assign(new Error("Ungültiger Code"), { status: 400 });
    const prev = all[code] || { code, createdAt: nowIso(), used: 0, usedBy: [] };
    all[code] = Object.assign(prev, { pct: d.settings.pct, maxUses: 0, until, perCustomer: true, active: true, note: "Newsletter " + MONDE[+String(iss.monday).slice(5, 7) - 1] + " (KW " + iss.kw + ")" });
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
      await activatePending().catch(e => log("Newsletter-Aktivierung:", e.message));
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
      d.subs[email] = Object.assign(s || {}, { email, status: "active", source: clip(b.source || "Shop", 40), requestedAt: nowIso(), confirmedAt: nowIso(), consentText: "Wöchentlicher Druckshop-Newsletter mit Produkttipps, einmal im Monat mit Rabattcode, per E-Mail; Abmeldung jederzeit" });
      if (Object.keys(d.subs).length > 50000) return J(res, 503, { ok: false, error: "Gerade nicht möglich" });
      await save();
      delete d.subs[email].unsubAt;
      welcome(email).catch(e => log("Newsletter-Willkommen:", e.message));
      return J(res, 200, { ok: true, msg: "Danke – du bist angemeldet! Eine Willkommensmail ist unterwegs an " + email + "." });
    }
    if (p === "/print/newsletter/bestaetigen" && req.method === "GET") {
      const email = String(u.searchParams.get("e") || "").toLowerCase();
      if (!emailOk(email) || !sigOk("nlc", email, u.searchParams.get("t"))) return D.send(res, 400, page("Link ungültig", "<h1>Link ungültig</h1><p>Der Bestätigungslink ist ungültig oder unvollständig. Bitte melde dich erneut an.</p>"), "text/html; charset=utf-8");
      const d = await data(), s = d.subs[email] || { email, source: "Link" };
      const was = s.status === "active"; s.status = "active"; if (!was) s.confirmedAt = nowIso(); delete s.unsubAt; d.subs[email] = s; await save();
      // Laufender Monatscode (schon versendet und noch gültig) als Willkommen – sonst Hinweis auf den nächsten
      const today = vienna().date, cur = Object.values(d.issues).filter(x => x.code && x.status === "sent" && addDays(x.monday, CODE_DAYS - 1) >= today).sort((a, b) => b.monday.localeCompare(a.monday))[0];
      return D.send(res, 200, page("Anmeldung bestätigt", "<h1>Danke – du bist dabei! 🎉</h1><p>Ab sofort bekommst du jeden Montag unsere Druck-Tipps der Woche – und mit dem ersten Newsletter im Monat einen " + esc(String(d.settings.pct).replace(".", ",")) + "-%-Rabattcode.</p>" +
        (cur ? "<p>Der aktuelle Code gilt noch – du sparst damit gleich " + esc(String(d.settings.pct).replace(".", ",")) + " %:</p><div class=\"code\">" + esc(cur.code) + "</div><p class=\"muted\">Gültig bis " + deDate(addDays(cur.monday, CODE_DAYS - 1)) + ", einmal je Kunde, an der Kasse eingeben.</p>" : "") +
        "<p class=\"muted\">Abmelden kannst du dich jederzeit über den Link in jedem Newsletter.</p>"), "text/html; charset=utf-8");
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
    return { settings: d.settings, codeDays: CODE_DAYS, codeIssue: codeIssue(iss.monday), issue: iss, recipients: rec.length, sending: SENDING, counts: { active: subs.filter(s => s.status === "active").length, pending: subs.filter(s => s.status === "pending").length, unsub: subs.filter(s => s.status === "unsub").length, accounts: rec.filter(r => r.source === "Kundenkonto").length },
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
        if (b.testTo !== undefined && emailOk(String(b.testTo).trim())) s.testTo = String(b.testTo).trim();
        await save(); return J(res, 200, Object.assign({ ok: true }, await state()));
      }
      const mon = /^\d{4}-\d{2}-\d{2}$/.test(String(b.monday || "")) ? String(b.monday) : await targetMonday();
      if (b.op === "save") {
        const iss = await issueFor(mon, true); if (iss.status !== "draft") return J(res, 409, { ok: false, error: "Schon versendet – nicht mehr änderbar" });
        if (b.subject !== undefined) iss.subject = clip(b.subject, 160) || iss.subject; if (b.intro !== undefined) iss.intro = clip(b.intro, 1200);
        if (Array.isArray(b.products)) { const keys = (await products()).map(x => x.key); iss.products = b.products.map(String).filter(k => keys.indexOf(k) > -1).slice(0, 3); }
        if (b.tipTitle !== undefined) iss.tipTitle = clip(b.tipTitle, 120); if (b.tipText !== undefined) iss.tipText = clip(b.tipText, 800);
        if (b.code !== undefined) { const c = String(b.code).toUpperCase().replace(/\s+/g, "").slice(0, 40); if (c && !/^[A-Z0-9_-]{3,40}$/.test(c)) return J(res, 400, { ok: false, error: "Code: 3–40 Zeichen, A–Z, 0–9, - und _ (leer = ohne Code)" }); iss.code = c; }
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
  return { handlePublic, handleAdmin, tick, recipients, _test: { kw, addDays, vienna, codeIssue, monthCode } };
};
