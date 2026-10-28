"use strict";
// Vertraulichkeitsvereinbarungen (NDA) online unterschreiben – www.fs-creative.at/nda/<token>
// Ablauf: Cockpit „Rechtliches“ legt einen Link an (Token 192 Bit, zufällig, gespeichert) → Gegenpartei liest den Vertrag, ergänzt ihre Daten
// (Live-Vorschau im Vertragstext), bestätigt die Zustimmung und klickt „Digital unterzeichnen“ (einfache elektronische Signatur) → Server prüft, speichert den
// unterschriebenen Stand mit Zeitstempel, gekürzter IP, User-Agent und SHA-256-Prüfwert, erzeugt das PDF und schickt es an beide Seiten.
// Danach zeigt der Link nur noch den unterschriebenen Stand + Download (kein erneutes Unterschreiben).
// Speicher: mit DATABASE_URL in Postgres (Tabelle nda_doc), sonst Dateien unter DATA_DIR/nda (Tests, lokal).
// Vertragstext: Version VERSION – bei jeder inhaltlichen Änderung hochzählen (alte Unterschriften behalten ihr PDF + ihren Prüfwert).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "NDA-2026-10.2";
const FIRM_DEFAULT = { name: "FS Creative", owner: "Simon Leonhard Felder", street: "Dorfstraße 3/1", zip: "6793", city: "Gaschurn", country: "Österreich", uid: "ATU82622967", email: "simon@fs-creative.at", phone: "+43 664 1430620" };
// Grenzen für Eingaben (Zeichen)
const LIM = { company: 120, name: 100, role: 80, street: 120, zip: 12, city: 80, country: 60, email: 160, phone: 40, project: 140, term: 200 };

// ── Vertragstext (formell, neutral). Platzhalter: {{partei1}} {{partei2}} {{projekt}} {{laufzeit}} {{strafe}}; „if“ = nur mit Vertragsstrafe ──
const TITLE = "Vertraulichkeitsvereinbarung";
const SUBTITLE = "Gegenseitige Geheimhaltungsvereinbarung (Non-Disclosure Agreement)";
const TEMPLATE = [
  { h: "", p: ["abgeschlossen zwischen", "1. {{partei1}}", "– im Folgenden „FS Creative“ –", "und", "2. {{partei2}}", "– im Folgenden „Vertragspartner“ –", "(FS Creative und der Vertragspartner gemeinsam die „Parteien“, einzeln auch „Partei“)"] },
  { h: "§ 1 Gegenstand und Zweck", p: [
    "(1) Die Parteien beabsichtigen, die Möglichkeit einer Zusammenarbeit im Projekt „{{projekt}}“ zu prüfen und diese gegebenenfalls durchzuführen (im Folgenden der „Zweck“). In diesem Zusammenhang werden die Parteien einander voraussichtlich vertrauliche Informationen zugänglich machen.",
    "(2) Diese Vereinbarung regelt den Umgang mit sämtlichen vertraulichen Informationen, die eine Partei (die „offenlegende Partei“) der anderen Partei (die „empfangende Partei“) im Zusammenhang mit dem Zweck vor oder nach Abschluss dieser Vereinbarung zugänglich macht oder von denen die empfangende Partei in diesem Zusammenhang auf sonstige Weise Kenntnis erlangt. Die Verpflichtungen aus dieser Vereinbarung gelten für beide Parteien gleichermaßen."] },
  { h: "§ 2 Vertrauliche Informationen", p: [
    "(1) „Vertrauliche Informationen“ sind sämtliche Informationen und Unterlagen gleich welcher Art und Form – insbesondere schriftlich, elektronisch, mündlich, bildlich, in Form von Mustern oder Prototypen oder durch Einsichtnahme –, die der empfangenden Partei im Zusammenhang mit dem Zweck zugänglich werden, und zwar unabhängig davon, ob sie als vertraulich gekennzeichnet sind.",
    "(2) Dazu zählen insbesondere Ideen, Konzepte, Strategien, Entwürfe, Designs, Layouts, Texte, Marken- und Namensvorschläge, Pläne, Spezifikationen, Software und Quellcode, Datenbanken, technische Dokumentationen, Zugangsdaten und Passwörter, Kunden-, Lieferanten- und Preisdaten, Kalkulationen, Angebote, Geschäftsmodelle und Geschäftszahlen sowie Geschäftsgeheimnisse im Sinne der §§ 26a ff UWG.",
    "(3) Als vertrauliche Informationen gelten auch der Umstand und der Inhalt der Gespräche über den Zweck sowie Analysen, Zusammenstellungen, Notizen und sonstige Unterlagen, die die empfangende Partei unter Verwendung vertraulicher Informationen erstellt."] },
  { h: "§ 3 Ausnahmen", p: [
    "(1) Die Verpflichtungen aus dieser Vereinbarung gelten nicht für Informationen, von denen die empfangende Partei nachweist, dass sie",
    "a) ihr bereits vor der Offenlegung durch die offenlegende Partei rechtmäßig und ohne Verpflichtung zur Vertraulichkeit bekannt waren;",
    "b) zum Zeitpunkt der Offenlegung allgemein bekannt oder öffentlich zugänglich waren oder danach ohne Verschulden der empfangenden Partei allgemein bekannt oder öffentlich zugänglich werden;",
    "c) ihr von einem Dritten rechtmäßig und ohne Verletzung einer Vertraulichkeitspflicht überlassen wurden; oder",
    "d) von ihr unabhängig und ohne Verwendung vertraulicher Informationen entwickelt wurden.",
    "(2) Eine Offenlegung ist ferner zulässig, soweit die empfangende Partei aufgrund zwingender gesetzlicher Vorschriften oder einer gerichtlichen oder behördlichen Anordnung dazu verpflichtet ist. In diesem Fall hat sie die offenlegende Partei – soweit rechtlich zulässig – unverzüglich und vor der Offenlegung in Textform zu informieren, damit diese geeignete Schutzmaßnahmen ergreifen kann, und die Offenlegung auf das rechtlich erforderliche Ausmaß zu beschränken.",
    "(3) Die Beweislast für das Vorliegen einer Ausnahme trägt die empfangende Partei."] },
  { h: "§ 4 Geheimhaltung", p: [
    "(1) Die empfangende Partei verpflichtet sich, vertrauliche Informationen streng vertraulich zu behandeln und sie Dritten weder ganz noch teilweise offenzulegen, zugänglich zu machen oder auf sonstige Weise weiterzugeben, sofern die offenlegende Partei nicht vorher ausdrücklich in Textform zugestimmt hat.",
    "(2) Zulässig ist lediglich die Weitergabe an Mitarbeiter, Organe und Erfüllungsgehilfen der empfangenden Partei sowie an berufsrechtlich zur Verschwiegenheit verpflichtete Berater (insbesondere Rechtsanwälte und Steuerberater), soweit diese die Informationen für den Zweck zwingend benötigen („Need-to-know“) und vor der Weitergabe zu einer mindestens gleichwertigen Vertraulichkeit verpflichtet wurden. Die empfangende Partei haftet für das Verhalten dieser Personen wie für ihr eigenes.",
    "(3) Die empfangende Partei hat vertrauliche Informationen mit zumindest derselben Sorgfalt zu schützen, die sie für eigene vertrauliche Informationen anwendet, jedenfalls aber durch angemessene technische und organisatorische Maßnahmen nach dem Stand der Technik gegen unbefugten Zugriff, Verlust und Weitergabe. Zugangsdaten sind sicher aufzubewahren und ausschließlich für den vorgesehenen Zweck zu verwenden.",
    "(4) Erlangt die empfangende Partei Kenntnis von einer unbefugten Offenlegung oder Verwendung vertraulicher Informationen, hat sie die offenlegende Partei unverzüglich zu informieren und sie bei der Begrenzung der Folgen angemessen zu unterstützen."] },
  { h: "§ 5 Verwendungsbeschränkung", p: [
    "(1) Die empfangende Partei darf vertrauliche Informationen ausschließlich für den Zweck verwenden, somit nur für die Prüfung und gegebenenfalls die Durchführung der Zusammenarbeit im Projekt „{{projekt}}“.",
    "(2) Jede Verwendung vertraulicher Informationen außerhalb dieser Zusammenarbeit ist untersagt. Untersagt ist insbesondere die Verwendung für eigene Zwecke oder für Zwecke Dritter, für andere Projekte, für die Entwicklung, Herstellung oder Vermarktung eigener oder fremder Produkte und Dienstleistungen, für die Umsetzung von Ideen, Konzepten oder Entwürfen der offenlegenden Partei ohne deren Beauftragung bzw. ohne vereinbarte Rechteeinräumung sowie jede Verwendung im Wettbewerb mit der offenlegenden Partei. Dies gilt auch dann, wenn eine Zusammenarbeit nicht zustande kommt oder beendet wird.",
    "(3) Die empfangende Partei wird vertrauliche Informationen, insbesondere Software, Muster und Prototypen, weder zurückentwickeln, dekompilieren oder disassemblieren (Reverse Engineering) noch durch Dritte analysieren lassen, soweit dies nicht für den Zweck erforderlich und von der offenlegenden Partei ausdrücklich gestattet ist; zwingende gesetzliche Rechte bleiben unberührt.",
    "(4) Vervielfältigungen sind nur zulässig, soweit sie für den Zweck erforderlich sind. Vertraulichkeits- und Schutzrechtsvermerke dürfen nicht entfernt werden."] },
  { h: "§ 6 Keine Rechteeinräumung", p: [
    "(1) Sämtliche Rechte an vertraulichen Informationen, insbesondere Eigentums-, Urheber-, Marken-, Muster- und Patentrechte sowie Rechte an Know-how, verbleiben bei der offenlegenden Partei. Durch diese Vereinbarung oder durch die Offenlegung werden keine Lizenzen oder sonstigen Nutzungs- oder Verwertungsrechte eingeräumt.",
    "(2) Insbesondere verbleiben sämtliche Rechte an Ideen, Konzepten, Entwürfen, Designs und sonstigen Arbeitsergebnissen, die FS Creative im Rahmen der Prüfung oder Anbahnung der Zusammenarbeit vorlegt, bei FS Creative, bis eine Rechteeinräumung gesondert schriftlich vereinbart und das dafür vereinbarte Entgelt vollständig bezahlt ist.",
    "(3) Vertrauliche Informationen werden ohne Gewähr für ihre Richtigkeit und Vollständigkeit zur Verfügung gestellt, soweit nicht gesondert etwas anderes vereinbart wird; die Haftung für Vorsatz und grobe Fahrlässigkeit bleibt unberührt."] },
  { h: "§ 7 Rückgabe und Löschung", p: [
    "(1) Auf Verlangen der offenlegenden Partei in Textform, spätestens jedoch bei Scheitern oder Beendigung der Zusammenarbeit, hat die empfangende Partei sämtliche vertraulichen Informationen einschließlich aller Kopien, Auszüge und Notizen nach Wahl der offenlegenden Partei unverzüglich zurückzugeben oder dauerhaft zu löschen bzw. zu vernichten und dies auf Verlangen in Textform zu bestätigen.",
    "(2) Ausgenommen sind Informationen, die aufgrund gesetzlicher Aufbewahrungspflichten aufbewahrt werden müssen, sowie Kopien in automatisierten Datensicherungen, deren Löschung technisch nicht oder nur mit unverhältnismäßigem Aufwand möglich ist. Für diese gelten die Verpflichtungen aus dieser Vereinbarung bis zu ihrer Löschung fort."] },
  { h: "§ 8 Inkrafttreten und Dauer der Vertraulichkeitspflicht", p: [
    "(1) Diese Vereinbarung tritt mit ihrem Abschluss in Kraft. Sie erfasst auch vertrauliche Informationen, die bereits vor ihrem Abschluss im Zusammenhang mit dem Zweck zugänglich gemacht wurden.",
    "(2) Die Verpflichtungen zur Geheimhaltung und zur Verwendungsbeschränkung (§§ 4 und 5) gelten für die folgende vereinbarte Dauer: {{laufzeit}} (die „vereinbarte Dauer“), und darüber hinaus für weitere drei (3) Jahre nach deren Ende. Für Geschäftsgeheimnisse gelten sie, solange die betreffenden Informationen Geschäftsgeheimnisse sind, mindestens jedoch für den in Satz 1 genannten Zeitraum.",
    "(3) Die Verpflichtungen nach § 7 sowie bereits entstandene Ansprüche bleiben vom Ende der vereinbarten Dauer unberührt."] },
  { h: "§ 9 Keine Verpflichtung zur Zusammenarbeit", p: [
    "(1) Diese Vereinbarung verpflichtet keine Partei zur Offenlegung bestimmter Informationen, zum Abschluss weiterer Verträge oder zur Durchführung der Zusammenarbeit. Jede Partei kann die Gespräche jederzeit ohne Angabe von Gründen beenden; Ansprüche auf Ersatz von Aufwendungen entstehen dadurch nicht, soweit nicht gesondert etwas anderes vereinbart ist.",
    "(2) Weitere Vereinbarungen über die Zusammenarbeit (insbesondere Angebote, Aufträge und Allgemeine Geschäftsbedingungen) bleiben unberührt. Bei Widersprüchen gehen hinsichtlich der Vertraulichkeit die für die offenlegende Partei günstigeren Bestimmungen vor."] },
  { h: "§ 10 Datenschutz", p: [
    "(1) Soweit vertrauliche Informationen personenbezogene Daten enthalten, verarbeiten die Parteien diese ausschließlich für den Zweck und im Einklang mit der Datenschutz-Grundverordnung (DSGVO) und dem österreichischen Datenschutzgesetz (DSG). Sie treffen angemessene technische und organisatorische Maßnahmen im Sinne des Art. 32 DSGVO. Soweit eine Auftragsverarbeitung erfolgt, schließen die Parteien gesondert eine Vereinbarung nach Art. 28 DSGVO.",
    "(2) Die beim Abschluss dieser Vereinbarung angegebenen Daten verarbeitet FS Creative zum Abschluss, zur Durchführung und zum Nachweis dieser Vereinbarung (Art. 6 Abs. 1 lit. b und f DSGVO)."] },
  { h: "§ 11 Ansprüche bei Verstößen", p: [
    "(1) Bei einem Verstoß gegen diese Vereinbarung stehen der offenlegenden Partei die gesetzlichen Ansprüche zu, insbesondere auf Unterlassung, Beseitigung, Auskunft und Schadenersatz. Die Parteien halten fest, dass ein Verstoß einen erheblichen und schwer bezifferbaren Schaden verursachen kann; Unterlassungsansprüche können auch im Wege der einstweiligen Verfügung geltend gemacht werden.",
    { if: "penalty", t: "(2) Für jeden schuldhaften Verstoß gegen die Verpflichtungen nach §§ 4, 5 oder 7 hat die empfangende Partei der offenlegenden Partei eine Vertragsstrafe von {{strafe}} zu bezahlen, und zwar unabhängig vom Eintritt oder Nachweis eines Schadens. Weitergehende Ansprüche, insbesondere auf Ersatz eines die Vertragsstrafe übersteigenden Schadens und auf Unterlassung, bleiben unberührt." }] },
  { h: "§ 12 Schlussbestimmungen", p: [
    "(1) Diese Vereinbarung unterliegt österreichischem Recht unter Ausschluss der Verweisungsnormen des internationalen Privatrechts und des UN-Kaufrechts.",
    "(2) Gerichtsstand für alle Streitigkeiten aus oder im Zusammenhang mit dieser Vereinbarung ist das für 6793 Gaschurn sachlich zuständige Gericht. Ist der Vertragspartner Verbraucher im Sinne des Konsumentenschutzgesetzes, gelten die gesetzlichen Gerichtsstandsregeln, insbesondere § 14 KSchG.",
    "(3) Änderungen und Ergänzungen dieser Vereinbarung sowie ein Abgehen von diesem Formerfordernis bedürfen der Schriftform; die Textform (z. B. E-Mail) genügt. Mündliche Nebenabreden bestehen nicht.",
    "(4) Sollte eine Bestimmung dieser Vereinbarung ganz oder teilweise unwirksam oder undurchführbar sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt. An die Stelle der unwirksamen oder undurchführbaren Bestimmung tritt eine wirksame Bestimmung, die dem wirtschaftlichen Zweck der ursprünglichen Bestimmung am nächsten kommt. Gleiches gilt für allfällige Lücken.",
    "(5) Diese Vereinbarung wird elektronisch abgeschlossen. FS Creative hat die Vereinbarung durch Bereitstellung des persönlichen Links elektronisch bestätigt; der Vertragspartner erklärt seine Zustimmung durch ausdrückliche Bestätigung und Betätigung der Schaltfläche „Digital unterzeichnen“ (einfache elektronische Signatur durch Bestätigung). Die Parteien erkennen diese Form des Abschlusses als verbindlich an. Beide Parteien erhalten die unterzeichnete Vereinbarung als PDF-Dokument; der darin angegebene Prüfwert (SHA-256) dient dem Nachweis der Unverändertheit."] },
];

module.exports = function (D) {
  D = D || {};
  const DATA_DIR = D.DATA_DIR || __dirname;
  const nowIso = () => new Date().toISOString();
  const clip = (v, n) => String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s{2,}/g, " ").trim().slice(0, n);
  const escH = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const log = (...a) => console.log("NDA:", ...a);
  const firm = () => { const f = (D.firm && D.firm()) || {}, o = Object.assign({}, FIRM_DEFAULT); Object.keys(FIRM_DEFAULT).forEach(k => { if (f[k] != null && String(f[k]).trim()) o[k] = String(f[k]).trim(); }); return o; };
  const publicUrl = () => String(process.env.NDA_PUBLIC_URL || D.ORIGIN || "https://www.fs-creative.at").replace(/\/+$/, "");
  const officeMail = () => String(process.env.NDA_MAIL_TO || firm().email || FIRM_DEFAULT.email).trim();
  const SECRET = crypto.createHmac("sha256", String(process.env.NDA_SECRET || process.env.ADMIN_AUTH_SECRET || "bitte-ADMIN_AUTH_SECRET-setzen")).update("nda-v1").digest();
  const eurTxt = cents => { const v = Math.round(+cents || 0), a = (Math.floor(v / 100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."); return "€ " + a + "," + String(v % 100).padStart(2, "0"); };
  const viennaTime = iso => new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(new Date(iso));
  const viennaDate = iso => new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

  // ───────────────────────── Speicher ─────────────────────────
  const useDb = () => !!(process.env.DATABASE_URL && D.fin);
  let dbReady = null;
  async function db() {
    const c = D.fin.db();
    if (!dbReady) dbReady = (async () => { await D.fin.init(); await c.query("create table if not exists nda_doc (id text primary key, token text unique not null, data jsonb not null, pdf bytea, created_at timestamptz not null default now(), updated_at timestamptz not null default now())"); })().catch(e => { dbReady = null; throw e; });
    await dbReady; return c;
  }
  const FDIR = () => { const d = path.join(DATA_DIR, "nda"); try { fs.mkdirSync(d, { recursive: true }); } catch (e) {} return d; };
  const rdJson = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } };
  const wrJson = (f, o) => { const t = f + ".tmp" + process.pid; fs.writeFileSync(t, JSON.stringify(o)); fs.renameSync(t, f); };
  const okId = id => /^n[a-f0-9]{16}$/.test(String(id || ""));
  const okTok = t => /^[A-Za-z0-9_-]{32}$/.test(String(t || ""));
  const store = {
    async get(id) { if (!okId(id)) return null; if (useDb()) { const r = await (await db()).query("select data from nda_doc where id=$1", [id]); return r.rows[0] ? r.rows[0].data : null; } return rdJson(path.join(FDIR(), id + ".json")); },
    async byToken(t) { if (!okTok(t)) return null; if (useDb()) { const r = await (await db()).query("select data from nda_doc where token=$1", [t]); return r.rows[0] ? r.rows[0].data : null; }
      const l = await store.list(); return l.find(x => x.token.length === t.length && crypto.timingSafeEqual(Buffer.from(x.token), Buffer.from(t))) || null; },
    async put(o, pdf) { o.updatedAt = nowIso(); if (useDb()) { await (await db()).query("insert into nda_doc(id,token,data,pdf) values($1,$2,$3::jsonb,$4) on conflict(id) do update set data=excluded.data, pdf=coalesce(excluded.pdf, nda_doc.pdf), updated_at=now()", [o.id, o.token, JSON.stringify(o), pdf || null]); return o; }
      if (pdf) fs.writeFileSync(path.join(FDIR(), o.id + ".pdf"), pdf); wrJson(path.join(FDIR(), o.id + ".json"), o); return o; },
    async pdf(id) { if (!okId(id)) return null; if (useDb()) { const r = await (await db()).query("select pdf from nda_doc where id=$1", [id]); return r.rows[0] ? r.rows[0].pdf : null; } try { return fs.readFileSync(path.join(FDIR(), id + ".pdf")); } catch (e) { return null; } },
    async list() { if (useDb()) { const r = await (await db()).query("select data from nda_doc order by created_at desc limit 2000"); return r.rows.map(x => x.data); }
      const d = FDIR(); return fs.readdirSync(d).filter(f => /^n[a-f0-9]{16}\.json$/.test(f)).map(f => rdJson(path.join(d, f))).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); },
    async del(id) { if (!okId(id)) return; if (useDb()) { await (await db()).query("delete from nda_doc where id=$1", [id]); return; } ["json", "pdf"].forEach(x => { try { fs.unlinkSync(path.join(FDIR(), id + "." + x)); } catch (e) {} }); },
  };
  const statusOf = o => o.revokedAt ? "revoked" : o.signed ? "signed" : "open";
  const STATUS_DE = { open: "offen", signed: "unterschrieben", revoked: "widerrufen" };
  const linkOf = o => publicUrl() + "/nda/" + o.token;

  // ───────────────────────── Vertragstext ─────────────────────────
  const party1 = () => { const F = firm(); return F.owner + ", Einzelunternehmer, handelnd unter „" + F.name + "“, " + F.street + ", " + F.zip + " " + F.city + ", " + (F.country || "Österreich") + (F.uid ? ", UID " + F.uid : ""); };
  function party2(d) {
    d = d || {}; const who = d.company ? d.company + (d.name ? ", vertreten durch " + d.name + (d.role ? " (" + d.role + ")" : "") : "") : (d.name || "") + (d.role ? " (" + d.role + ")" : "");
    return [who, d.street, [d.zip, d.city].filter(Boolean).join(" "), d.country].filter(x => x && String(x).trim()).join(", ") + (d.email ? ", E-Mail " + d.email : "");
  }
  // Abschnitte für ein NDA: Bedingungen aufgelöst, Partei 1 + Vertragsstrafe eingesetzt; {{partei2}}, {{projekt}}, {{laufzeit}} bleiben für die Live-Vorschau
  function sectionsFor(o) {
    return TEMPLATE.map(s => ({ h: s.h, p: s.p.filter(x => typeof x === "string" || (x.if === "penalty" && o.penaltyCents > 0)).map(x => (typeof x === "string" ? x : x.t).replace(/\{\{partei1\}\}/g, party1()).replace(/\{\{strafe\}\}/g, eurTxt(o.penaltyCents))) }));
  }
  const fill = (t, v) => t.replace(/\{\{(partei2|projekt|laufzeit)\}\}/g, (m, k) => v[k] || "");
  const valsOf = d => ({ partei2: party2(d), projekt: d.project || "", laufzeit: d.term || "" });
  function fullText(o, d) { const v = valsOf(d); return [TITLE, SUBTITLE, "Version " + o.v].concat(sectionsFor(o).map(s => (s.h ? s.h + "\n" : "") + s.p.map(x => fill(x, v)).join("\n"))).join("\n\n"); }

  // ───────────────────────── PDF (Layout an fin-pdf.js „Marke“ angelehnt) ─────────────────────────
  // Standardschrift Helvetica (WinAnsi): Zeichen außerhalb werden vereinfacht (Akzente entfernt) bzw. durch „?“ ersetzt
  const WIN = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""));
  const pdfSafe = s => Array.from(String(s == null ? "" : s)).map(c => { const n = c.charCodeAt(0); if (n < 256 || WIN.has(c)) return c; const b = c.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); return Array.from(b).every(x => x.charCodeAt(0) < 256) ? b : "?"; }).join("");
  const DARK = "#1f1d1e", YEL = "#ffe600", INK = "#1f1d1e", MUTED = "#6b6b6b", LINE = "#e3e1dc", SOFT = "#bdbab3";
  const LOGO = ["Logo Glühbirne Weiss.png", "Logo Glühbirne.png"].map(n => path.join(__dirname, "logos", n)).find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
  function renderPdf(o, d, s) {
    const PDFDocument = require("pdfkit");
    const F = firm(), v = valsOf(d);
    const doc = new PDFDocument({ size: "A4", bufferPages: true, margins: { top: 56, bottom: 70, left: 56, right: 56 },
      info: { Title: pdfSafe(TITLE + " – " + d.project), Author: F.name, Subject: o.v + " SHA-256 " + s.hash, Keywords: pdfSafe("NDA " + d.project + " " + o.v + " " + s.hash), Creator: "FS Creative Cockpit" } });
    const chunks = []; doc.on("data", c => chunks.push(c)); const done = new Promise(r => doc.on("end", () => r(Buffer.concat(chunks))));
    const W = doc.page.width, H = doc.page.height, L = 56, R = W - 56, CW = R - L;
    // Kopf (nur Seite 1): dunkles Band, Logo, Titel, gelber Streifen
    const HH = 104; doc.rect(0, 0, W, HH).fill(DARK); doc.rect(0, HH, W, 5).fill(YEL);
    if (LOGO) { try { doc.image(LOGO, L - 6, 24, { fit: [48, 54], align: "center", valign: "center" }); } catch (e) {} }
    doc.font("Helvetica-Bold").fontSize(19).fillColor("#ffffff").text(pdfSafe(F.name), L + 56, 34, { width: 240, lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor(SOFT).text("Webdesign · Grafik · Digitale Services · Montafon", L + 56, 60, { width: 240, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(YEL).text("VERTRAULICHKEITSVEREINBARUNG", 300, 34, { width: R - 300, align: "right", characterSpacing: 1.4 });
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#ffffff").text(o.v, 300, 50, { width: R - 300, align: "right", lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor(SOFT).text("unterschrieben am " + viennaDate(s.at), 300, 72, { width: R - 300, align: "right", lineBreak: false });
    doc.x = L; doc.y = HH + 34;
    doc.font("Helvetica-Bold").fontSize(17).fillColor(INK).text(TITLE, L, doc.y, { width: CW });
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(SUBTITLE + " · Projekt „" + pdfSafe(d.project) + "“", { width: CW }); doc.moveDown(1.1);
    sectionsFor(o).forEach(sec => {
      if (sec.h) { if (doc.y > H - 140) doc.addPage(); doc.moveDown(.5); doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK).text(sec.h, L, doc.y, { width: CW }); doc.moveDown(.25); }
      sec.p.forEach(t => { const ind = /^[a-d]\) /.test(t) ? 14 : 0, party = /^[12]\. /.test(t), mid = /^(und|abgeschlossen zwischen|– im Folgenden)/.test(t);
        doc.font(party ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(mid ? MUTED : INK).text(pdfSafe(fill(t, v)), L + ind, doc.y, { width: CW - ind, align: party || mid ? "left" : "justify", lineGap: 1.6 }); doc.moveDown(.4); });
    });
    // Unterschriften
    if (doc.y > H - 290) doc.addPage(); else doc.moveDown(1.2);
    const y0 = doc.y, cw = (CW - 24) / 2;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED).text("FÜR FS CREATIVE", L, y0, { width: cw, characterSpacing: 1 }).text("VERTRAGSPARTNER", L + cw + 24, y0, { width: cw, characterSpacing: 1 });
    const ty = y0 + 18;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(pdfSafe(F.name + " · " + F.owner), L, ty, { width: cw });
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text("elektronisch bestätigt durch " + pdfSafe(F.owner) + " am " + viennaTime(s.at) + " (Link erstellt am " + viennaDate(o.createdAt) + ")", L, doc.y + 3, { width: cw });
    const ly = doc.y;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(pdfSafe(d.company ? d.company + " · " + s.sigName : s.sigName), L + cw + 24, ty, { width: cw });
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text("digital unterzeichnet durch " + pdfSafe(s.sigName) + (d.role ? " (" + pdfSafe(d.role) + ")" : "") + " am " + viennaTime(s.at) + " über den Button „Digital unterzeichnen“", L + cw + 24, doc.y + 3, { width: cw });
    doc.y = Math.max(doc.y, ly) + 4; doc.moveTo(L, doc.y).lineTo(R, doc.y).lineWidth(.5).strokeColor(LINE).stroke();
    // Nachweis
    doc.x = L; doc.y += 18;
    if (doc.y > H - 150) doc.addPage();
    const by = doc.y, rows = [["Dokument", TITLE + ", Version " + o.v + ", Projekt „" + d.project + "“"], ["Zeitpunkt", s.at.replace("T", " ").replace(/\.\d+Z$/, " UTC") + " · " + viennaTime(s.at) + " (Europe/Vienna)"],
      ["Signatur", "einfache elektronische Signatur durch Bestätigung (Zustimmung + Button „Digital unterzeichnen“)"], ["IP-Adresse", s.ipTrunc + " (gekürzt)"], ["Gerät/Browser", s.ua || "–"], ["Prüfwert", "SHA-256 " + s.hash]];
    doc.rect(L, by, 3, 10).fill(YEL); doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED).text("NACHWEIS DES ELEKTRONISCHEN ABSCHLUSSES", L + 10, by + 1, { characterSpacing: 1 }); doc.moveDown(.6);
    rows.forEach(r => { const y = doc.y; doc.font("Helvetica").fontSize(7.8).fillColor(MUTED).text(r[0], L, y, { width: 80 }); doc.font("Helvetica").fontSize(7.8).fillColor(INK).text(pdfSafe(r[1]), L + 84, y, { width: CW - 84 }); doc.moveDown(.25); });
    doc.font("Helvetica").fontSize(7).fillColor(MUTED).text("Der Prüfwert wird über den vollständigen Vertragstext dieser Version, die Angaben des Vertragspartners und den Zeitpunkt der Unterzeichnung gebildet. Beide Parteien erhalten dieses Dokument per E-Mail.", L, doc.y + 4, { width: CW });
    // Fußzeile auf jeder Seite: gelbe Linie, Version, Prüfwert, Seitenzahl
    const pr = doc.bufferedPageRange();
    for (let i = 0; i < pr.count; i++) { doc.switchToPage(pr.start + i); const mb = doc.page.margins.bottom; doc.page.margins.bottom = 0; const fy = H - 46;
      doc.rect(L, fy, CW, 1.2).fill(YEL);
      doc.font("Helvetica").fontSize(6.8).fillColor(MUTED).text(pdfSafe(F.name + " · " + F.owner + " · " + F.street + " · " + F.zip + " " + F.city + (F.uid ? " · UID " + F.uid : "")), L, fy + 7, { width: CW - 70, lineBreak: false });
      doc.text("Seite " + (i + 1) + " von " + pr.count, R - 70, fy + 7, { width: 70, align: "right", lineBreak: false });
      doc.text(o.v + " · SHA-256 " + s.hash, L, fy + 17, { width: CW, lineBreak: false }); doc.page.margins.bottom = mb; }
    doc.end(); return done;
  }

  // ───────────────────────── Mails ─────────────────────────
  function mailHtml(title, paras, rows, link) {
    return '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;color:#1d1d1f;max-width:600px">' + "<h2 style=\"font-size:20px;margin:0 0 12px\">" + escH(title) + "</h2>" +
      paras.map(p => "<p style=\"margin:0 0 12px;line-height:1.5\">" + escH(p).replace(/\n/g, "<br>") + "</p>").join("") +
      (link ? '<p style="margin:16px 0 18px"><a href="' + escH(link[1]) + '" style="display:inline-block;background:#1f1d1e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:600">' + escH(link[0]) + "</a></p>" : "") +
      (rows && rows.length ? '<table cellpadding="5" style="border-collapse:collapse;margin:8px 0 14px">' + rows.map(r => "<tr><td style=\"color:#6e6e73;vertical-align:top\">" + escH(r[0]) + "</td><td><b>" + escH(r[1]) + "</b></td></tr>").join("") + "</table>" : "") +
      '<p style="margin:18px 0 0;color:#6e6e73;font-size:13px">FS Creative · Simon Felder · Dorfstraße 3/1 · 6793 Gaschurn · <a href="https://www.fs-creative.at">fs-creative.at</a></p></div>';
  }
  async function mail(m) { if (!D.mailSend) throw new Error("Mailversand nicht eingerichtet"); return D.mailSend(m); }
  function inviteMail(o, to) {
    const p = o.pre || {}, link = linkOf(o), hi = p.name ? "Hallo " + p.name + "," : "Hallo,";
    const paras = [hi, "wie besprochen schicke ich dir die Vertraulichkeitsvereinbarung (NDA)" + (p.project ? " für das Projekt „" + p.project + "“" : "") + ". Du kannst sie über den folgenden Link in Ruhe lesen, deine Daten ergänzen und direkt online unterschreiben. Danach bekommen wir beide das unterschriebene PDF per E-Mail."];
    const outro = ["Bei Fragen melde dich gern jederzeit.", "Liebe Grüße\nSimon Felder\nFS Creative"];
    const text = paras.join("\n\n") + "\n\n" + link + "\n\n" + outro.join("\n\n") + "\n\n-- \nFS Creative · Simon Felder · Dorfstraße 3/1 · 6793 Gaschurn · www.fs-creative.at";
    return { to, subject: "Vertraulichkeitsvereinbarung" + (p.project ? " – " + p.project : "") + " · FS Creative", text, html: mailHtml("Vertraulichkeitsvereinbarung", paras, null, ["Vereinbarung ansehen & unterschreiben", link]), replyTo: firm().email };
  }
  // nach Unterschrift: PDF an Vertragspartner und FS Creative
  async function signedMails(o, pdf) {
    const d = o.signed.data, att = [{ filename: fileName(o), content: pdf.toString("base64"), contentType: "application/pdf" }], who = d.company ? d.company + " (" + d.name + ")" : d.name;
    const rows = [["Projekt", d.project], ["Vertragspartner", who], ["Unterschrieben", viennaTime(o.signed.at)], ["Prüfwert (SHA-256)", o.signed.hash]];
    const out = [];
    const pc = ["Hallo " + d.name + ",", "danke für deine Unterschrift! Im Anhang findest du die unterschriebene Vertraulichkeitsvereinbarung als PDF. Bitte bewahre sie gut auf.", "Liebe Grüße\nSimon Felder\nFS Creative"];
    try { await mail({ to: d.email, subject: "Unterschriebene Vertraulichkeitsvereinbarung – " + d.project + " · FS Creative", text: pc.join("\n\n") + "\n\n" + rows.map(r => r[0] + ": " + r[1]).join("\n"), html: mailHtml("Vertraulichkeitsvereinbarung unterschrieben", pc, rows), replyTo: firm().email, attachments: att }); out.push("partner"); } catch (e) { log("Mail an Vertragspartner fehlgeschlagen:", e.message); }
    const pf = ["Eine Vertraulichkeitsvereinbarung wurde online unterschrieben. Das PDF liegt im Anhang und im Cockpit unter „Rechtliches“."];
    try { await mail({ to: officeMail(), subject: "NDA unterschrieben: " + who + " – " + d.project, text: pf.join("\n\n") + "\n\n" + rows.concat([["E-Mail", d.email], ["Telefon", d.phone || "–"]]).map(r => r[0] + ": " + r[1]).join("\n"), html: mailHtml("NDA unterschrieben", pf, rows.concat([["E-Mail", d.email], ["Telefon", d.phone || "–"]])), replyTo: d.email, attachments: att }); out.push("office"); } catch (e) { log("Mail an FS Creative fehlgeschlagen:", e.message); }
    return out;
  }
  const fileName = o => "Vertraulichkeitsvereinbarung-" + String((o.signed && o.signed.data.project) || (o.pre && o.pre.project) || "FS-Creative").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) + ".pdf";

  // ───────────────────────── Prüfung der Eingaben ─────────────────────────
  const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
  function validate(b, o) {
    const d = {}, f = {}; b = b && typeof b === "object" ? b : {};
    Object.keys(LIM).forEach(k => { d[k] = clip(b[k], LIM[k] + 1); });
    Object.keys(LIM).forEach(k => { if (d[k].length > LIM[k]) f[k] = "Höchstens " + LIM[k] + " Zeichen"; });
    if (!d.country) d.country = "Österreich";
    if (d.name.length < 3 || !/\S+\s+\S+/.test(d.name)) f.name = f.name || "Bitte Vor- und Nachnamen angeben";
    if (!EMAIL.test(d.email)) f.email = f.email || "Bitte eine gültige E-Mail-Adresse angeben";
    if (!d.street) f.street = "Bitte Straße und Hausnummer angeben";
    if (!d.zip || !/^[A-Za-z0-9 -]{3,12}$/.test(d.zip)) f.zip = f.zip || "Bitte PLZ angeben";
    if (!d.city) f.city = "Bitte Ort angeben";
    if (d.phone && !/^[0-9+()\/ .-]{4,40}$/.test(d.phone)) f.phone = "Telefonnummer prüfen";
    if (d.project.length < 2) f.project = f.project || "Bitte den Projektnamen angeben";
    if (d.term.length < 2) f.term = f.term || "Bitte die Dauer der Vertraulichkeitspflicht angeben";
    if (b.accept !== true) f.accept = "Bitte bestätige, dass du die Vereinbarung gelesen hast und ihr zustimmst";
    return { d, f, sigName: d.name, ok: !Object.keys(f).length };   // Unterzeichner = „Vor- und Nachname“
  }
  const truncIp = ip => { ip = String(ip || "").replace(/^::ffff:/, ""); if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.replace(/\.\d+$/, ".0"); if (ip.indexOf(":") > -1) return ip.split(":").slice(0, 3).join(":") + "::"; return ""; };
  const hashIp = ip => crypto.createHmac("sha256", SECRET).update(String(ip || "")).digest("hex").slice(0, 32);
  const sha = x => crypto.createHash("sha256").update(x).digest("hex");

  const LOCK = new Set();
  async function sign(o0, b, req) {
    const id = o0.id;
    if (LOCK.has(id)) throw Object.assign(new Error("Wird gerade verarbeitet – bitte kurz warten"), { status: 409 });
    LOCK.add(id);
    try {
      const o = await store.get(id);   // frisch lesen (parallel unterschrieben?)
      if (!o || o.revokedAt) throw Object.assign(new Error("Dieser Link ist nicht mehr aktiv"), { status: 410 });
      if (o.signed) throw Object.assign(new Error("Diese Vereinbarung wurde bereits unterschrieben"), { status: 409 });
      const v = validate(b, o);
      if (!v.ok) throw Object.assign(new Error("Bitte prüfe die markierten Felder"), { status: 400, fields: v.f });
      const at = nowIso(), ip = ipOf(req), text = fullText(o, v.d);
      const hash = sha(JSON.stringify({ version: o.v, text, party2: v.d, signature: { name: v.sigName, method: "Bestätigung + Button „Digital unterzeichnen“" }, signedAt: at }));
      const s = { at, atVienna: viennaTime(at), data: v.d, sigName: v.sigName, method: "button", textSha: sha(text), hash, ipTrunc: truncIp(ip) || "–", ipHash: hashIp(ip), ua: clip(req.headers["user-agent"], 300) };
      const pdf = await renderPdf(o, v.d, s);
      o.signed = s; o.pdfBytes = pdf.length; await store.put(o, pdf);
      log("unterschrieben", o.id, "·", v.d.project);
      o.signed.mailed = await signedMails(o, pdf); await store.put(o);
      return o;
    } finally { LOCK.delete(id); }
  }

  // ───────────────────────── HTTP-Hilfen ─────────────────────────
  const { clientIp, hitCounter } = require("./client-ip.js");
  const HITS = hitCounter(20000);
  const limited = (bucket, ip, max, windowMs) => HITS.hit(bucket + "|" + ip, max, windowMs);
  const ipOf = clientIp;   // echte Besucher-IP (Cloudflare/Railway, nicht fälschbar über X-Forwarded-For)
  function sameOrigin(req) {
    if (req.headers["x-nda"] !== "1") return false;
    const o = req.headers.origin; if (!o) return true;
    try { const h = new URL(o).host.toLowerCase(); return h === String(req.headers.host || "").toLowerCase() || "https://" + h === String(D.ORIGIN || "").toLowerCase(); } catch (e) { return false; }
  }
  function readJson(req, max) {
    return new Promise((resolve, reject) => {
      const len = parseInt(req.headers["content-length"] || "0", 10); if (len > max) { req.resume(); return reject(Object.assign(new Error("Anfrage zu groß"), { status: 413 })); }
      const chunks = []; let n = 0, dead = false;
      req.on("data", c => { if (dead) return; n += c.length; if (n > max) { dead = true; req.resume(); return reject(Object.assign(new Error("Anfrage zu groß"), { status: 413 })); } chunks.push(c); });
      req.on("end", () => { if (dead) return; try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(Object.assign(new Error("Ungültige Anfrage"), { status: 400 })); } });
      req.on("error", e => { if (!dead) reject(e); });
    });
  }
  const SEC = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff" };
  const J = (res, code, o) => D.send(res, code, JSON.stringify(o), "application/json; charset=utf-8", SEC);
  const html = (req, res, code, body) => (D.sendGz || ((q, r, c, b, t, h) => D.send(r, c, b, t, h)))(req, res, code, body, "text/html; charset=utf-8", SEC);
  const pdfOut = (res, buf, name, dl) => D.send(res, 200, buf, "application/pdf", Object.assign({}, SEC, { "Content-Length": String(buf.length), "Content-Disposition": (dl ? "attachment" : "inline") + '; filename="' + name + '"', "Cache-Control": "private, no-store" }));

  // ───────────────────────── öffentliche Seite ─────────────────────────
  const ICON_BULB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>';
  function shell(title, body, extraHead) {
    return '<!DOCTYPE html>\n<html lang="de">\n<head>\n<meta charset="UTF-8" />\n<script>try{if(localStorage.getItem(\'fsc-theme\')===\'light\')document.documentElement.className+=\' light\';}catch(e){}</script>\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n<title>' + escH(title) + ' | FS Creative</title>\n<meta name="robots" content="noindex, nofollow, noarchive" />\n<meta name="referrer" content="no-referrer" />\n<meta name="theme-color" content="#0a0a0f" />\n' +
      '<link rel="icon" type="image/png" href="/logos/Logo%20Gl%C3%BChbirne%20Weiss.png" />\n<link rel="stylesheet" href="/landing.css?v=6" />\n<style>' + CSS + '</style>\n' + (extraHead || "") + '</head>\n<body>\n<a class="skip" href="#main">Zum Inhalt springen</a>\n<div class="bg-orbs"><div class="orb a"></div><div class="orb b"></div><div class="orb c"></div></div>\n\n' +
      '<input type="checkbox" id="navtoggle" class="nav-toggle" aria-label="Menü öffnen">\n<header class="nav">\n  <div class="nav-inner">\n    <a class="brand" href="/"><span class="mark"><img src="/logos/Logo%20Gl%C3%BChbirne%20Weiss.png" alt="FS Creative Logo"></span> FS Creative</a>\n    <label for="navtoggle" class="burger" aria-label="Menü"><span></span><span></span><span></span></label>\n    <nav class="nav-links">\n      <a href="/">Start</a>\n      <a href="/leistungen">Leistungen</a>\n      <a href="/referenzen">Referenzen</a>\n      <button type="button" class="theme-btn" data-theme-toggle aria-label="Licht an/aus">' + ICON_BULB + 'Licht an/aus</button>\n      <a href="/kontakt" class="nav-cta">Kontakt</a>\n    </nav>\n  </div>\n</header>\n\n<main id="main">\n  <div class="wrap">\n' + body + '\n  </div>\n</main>\n\n' +
      '<footer class="foot">\n  <div class="wrap">\n    <div class="foot-bottom">\n      <span>&copy; ' + new Date().getFullYear() + ' FS Creative &middot; Gaschurn &middot; <a href="/impressum">Impressum</a> &middot; <a href="/datenschutz">Datenschutz</a></span>\n      <span>Mit &hearts; im Montafon gebaut</span>\n    </div>\n  </div>\n</footer>\n\n' +
      '<script>\nwindow.fscToggleTheme=function(){var el=document.documentElement;el.classList.add(\'theming\');var light=el.classList.toggle(\'light\');try{localStorage.setItem(\'fsc-theme\',light?\'light\':\'dark\');}catch(_){}setTimeout(function(){el.classList.remove(\'theming\');},650);};\ndocument.addEventListener(\'click\',function(e){var b=e.target.closest&&e.target.closest(\'[data-theme-toggle]\');if(b){e.preventDefault();window.fscToggleTheme();}});\n</script>\n</body>\n</html>';
  }
  const CSS = '.nda-hero{padding:34px 0 18px}.nda-hero h1{max-width:22ch}' +
    '.nda-grid{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:18px;align-items:start;margin-top:8px}@media(max-width:900px){.nda-grid{grid-template-columns:minmax(0,1fr)}}' +
    '.nda-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px}.nda-card h2{font-size:20px;letter-spacing:-.02em;margin-bottom:6px}.nda-card .sub{color:var(--text-dim);font-size:14px;margin-bottom:16px}' +
    '.nda-form{position:sticky;top:calc(var(--nav-h) + 14px)}@media(max-width:900px){.nda-form{position:static}}' +
    '.nda-f{display:grid;gap:12px}.nda-f2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:10px}.nda-f label{display:grid;gap:5px;font-size:13.5px;color:var(--text-dim);font-weight:500}.nda-f label b{color:var(--text);font-weight:600}.nda-f .opt{color:var(--text-faint);font-weight:400}' +
    '.nda-f input[type=text],.nda-f input[type=email],.nda-f input[type=tel]{font:inherit;font-size:15px;color:var(--text);background:var(--bg-soft);border:1px solid var(--border-2);border-radius:12px;padding:11px 13px;width:100%;transition:border-color .2s}' +
    '.nda-f input::placeholder{color:var(--text-faint)}.nda-f input:focus{outline:none;border-color:var(--accent)}.nda-f .err{color:#ff6b6b;font-size:12.5px;min-height:0}.nda-f .bad input{border-color:#ff6b6b}html.light .nda-f .err{color:#c62828}' +
    '.nda-note{font-size:13px;color:var(--text-dim);background:var(--surface-2);border-radius:12px;padding:10px 12px;line-height:1.5}' +
    '.nda-doc{background:#fbfaf7;color:#1f1d1e;border-radius:var(--radius);padding:34px 36px;box-shadow:0 20px 60px rgba(0,0,0,.35);font-size:14.5px;line-height:1.62}@media(max-width:600px){.nda-doc{padding:22px 18px;font-size:14px}}' +
    '.nda-doc h3{font-size:22px;letter-spacing:-.02em;margin:0}.nda-doc .v{color:#6b6b6b;font-size:13px;margin:2px 0 18px}.nda-doc h4{font-size:15px;margin:18px 0 6px}.nda-doc p{margin:0 0 8px;text-align:justify;hyphens:auto}.nda-doc p.ind{padding-left:18px}.nda-doc p.c{text-align:left;color:#6b6b6b}.nda-doc p.pty{text-align:left;font-weight:600}' +
    '.nda-doc mark{background:#fff3a3;color:inherit;border-radius:4px;padding:0 3px}.nda-doc mark.empty{background:#ffe0e0;color:#a33}.nda-doc .bar{height:4px;background:#ffe600;border-radius:4px;margin:0 0 18px;width:64px}' +
    '.nda-sign{margin-top:18px}.nda-chk{display:flex;gap:12px;align-items:flex-start;font-size:15px;cursor:pointer}.nda-chk input{width:20px;height:20px;margin-top:2px;accent-color:var(--accent);flex:none}' +
    '.nda-btn{font:inherit;cursor:pointer;border:0}.nda-go{font-size:17px;font-weight:600;padding:16px 34px;box-shadow:0 10px 30px rgba(10,132,255,.35)}@media(max-width:600px){.nda-go{width:100%;justify-content:center}}' +
    '.nda-msg{border-radius:12px;padding:12px 14px;font-size:14px;background:rgba(255,80,80,.12);color:var(--text);display:none}.nda-msg.on{display:block}.nda-ok{font-size:44px;line-height:1}' +
    '.nda-kv{display:grid;grid-template-columns:minmax(110px,180px) minmax(0,1fr);gap:8px 14px;font-size:14.5px;margin:16px 0}.nda-kv span{color:var(--text-dim)}.nda-kv b{font-weight:600;overflow-wrap:anywhere}.nda-kv code{font-size:12.5px;overflow-wrap:anywhere}' +
    '.nda-priv{font-size:12.5px;color:var(--text-faint);margin-top:14px;line-height:1.55}.nda-priv a{text-decoration:underline}button.btn.primary[disabled]{opacity:.6;cursor:progress}';
  const PRIV = '<p class="nda-priv"><b>Datenschutz:</b> Deine Angaben verwenden wir ausschließlich zum Abschluss, zur Durchführung und zum Nachweis dieser Vereinbarung (Art. 6 Abs. 1 lit. b und f DSGVO). Gespeichert werden die Formularangaben, der Zeitpunkt der Unterzeichnung, eine gekürzte IP-Adresse und die Browser-Kennung. Die Daten werden nicht an Dritte weitergegeben (außer an unseren Mail- und Hosting-Dienstleister zur technischen Abwicklung) und so lange aufbewahrt, wie die Vereinbarung nachgewiesen werden muss. Mehr unter <a href="/datenschutz">Datenschutz</a>.</p>';
  function docHtml(o, d) {
    const v = valsOf(d), ph = { partei2: "[Angaben des Vertragspartners]", projekt: "[Projektname]", laufzeit: "[Dauer]" };
    const p = t => escH(t).replace(/\{\{(partei2|projekt|laufzeit)\}\}/g, (m, k) => '<mark data-ph="' + k + '"' + (v[k] ? "" : ' class="empty"') + ">" + escH(v[k] || ph[k]) + "</mark>");
    return '<div class="bar"></div><h3>' + TITLE + '</h3><p class="v">' + SUBTITLE + " · Version " + escH(o.v) + "</p>" + sectionsFor(o).map(s => (s.h ? "<h4>" + escH(s.h) + "</h4>" : "") + s.p.map(t => '<p class="' + (/^[a-d]\) /.test(t) ? "ind" : /^[12]\. /.test(t) ? "pty" : /^(und|abgeschlossen zwischen|– im Folgenden|\(FS Creative und)/.test(t) ? "c" : "") + '">' + p(t) + "</p>").join("")).join("");
  }
  function pageOpen(o) {
    const pre = o.pre || {}, d0 = { email: pre.email || "", project: pre.project || "", country: "Österreich" };   // Firma/Name immer selbst eintragen
    const inp = (k, label, opt, attrs, val) => '<label data-f="' + k + '"><span><b>' + label + "</b>" + (opt ? ' <span class="opt">(optional)</span>' : "") + '</span><input type="' + (k === "email" ? "email" : k === "phone" ? "tel" : "text") + '" name="' + k + '" maxlength="' + LIM[k] + '" value="' + escH(val != null ? val : d0[k] || "") + '"' + (attrs || "") + '><span class="err" aria-live="polite"></span></label>';
    const cfg = { lim: LIM };
    return '<section class="lhero nda-hero"><span class="eyebrow">Vertraulichkeitsvereinbarung</span><h1>Vertraulich&shy;keits&shy;vereinbarung</h1><p class="lead">Lies die Vereinbarung in Ruhe, ergänze deine Angaben und unterzeichne direkt online. Danach bekommen du und FS Creative das unterschriebene PDF per E-Mail.</p></section>' +
      '<noscript><div class="nda-msg on">Zum Unterschreiben wird JavaScript benötigt. Alternativ melde dich unter <a href="mailto:simon@fs-creative.at">simon@fs-creative.at</a>.</div></noscript>' +
      '<form id="ndaForm" novalidate autocomplete="on"><div class="nda-grid"><div class="nda-card nda-form"><h2>1. Deine Angaben</h2><p class="sub">Der Vertragstext rechts wird beim Ausfüllen automatisch ergänzt.</p><div class="nda-f">' +
      inp("company", "Firma", true, ' autocomplete="organization"') + inp("name", "Vor- und Nachname", false, ' autocomplete="name" required') + inp("role", "Funktion", true, ' autocomplete="organization-title" placeholder="z. B. Geschäftsführer"') +
      inp("street", "Straße und Hausnummer", false, ' autocomplete="street-address" required') + '<div class="nda-f2">' + inp("zip", "PLZ", false, ' autocomplete="postal-code" inputmode="numeric" required') + inp("city", "Ort", false, ' autocomplete="address-level2" required') + "</div>" +
      inp("country", "Land", false, ' autocomplete="country-name"') + inp("email", "E-Mail", false, ' autocomplete="email" required') + inp("phone", "Telefon", true, ' autocomplete="tel"') +
      inp("project", "Projektname", false, " required") + inp("term", "Gültigkeit / Dauer der Vertraulichkeitspflicht", false, ' placeholder="z. B. bis Go-Live des Projektes" required') +
      '<p class="nda-note">Die Vertraulichkeitspflicht gilt für die hier angegebene Dauer <b>und darüber hinaus noch 3 Jahre</b> nach deren Ende – für Geschäftsgeheimnisse, solange sie solche sind (siehe § 8 der Vereinbarung).</p></div></div>' +
      '<article class="nda-doc" id="ndaDoc" aria-label="Vertragstext">' + docHtml(o, d0) + "</article></div>" +
      '<section class="nda-card nda-sign"><h2>2. Digital unterzeichnen</h2><p class="sub">Mit deiner Bestätigung und dem Klick auf „Digital unterzeichnen“ unterzeichnest du die Vereinbarung elektronisch (einfache elektronische Signatur) – mit deinem oben angegebenen Namen.</p><div class="nda-f">' +
      '<label class="nda-chk" data-f="accept"><input type="checkbox" name="accept" required><span><b>Ich habe die Vereinbarung gelesen und stimme ihr zu.</b></span><span class="err"></span></label>' +
'<div class="nda-msg" id="ndaMsg" role="alert"></div><div class="btn-row" style="margin-top:6px"><button type="submit" class="btn primary nda-btn nda-go" id="ndaSubmit">Digital unterzeichnen</button></div>' + PRIV + "</div></section></form>" +
      '<script type="application/json" id="ndaCfg">' + JSON.stringify(cfg).replace(/</g, "\\u003c") + "</script><script>" + CLIENT + "</script>";
  }
  // Browser: Live-Vorschau (nur Textersetzung, Werte immer escaped), Absenden als JSON
  const CLIENT = '(function(){"use strict";var C=JSON.parse(document.getElementById("ndaCfg").textContent),f=document.getElementById("ndaForm"),doc=document.getElementById("ndaDoc");' +
    'function esc(s){return String(s==null?"":s).replace(/[&<>"\']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","\'":"&#39;"}[c];});}' +
    'function val(k){var e=f.elements[k];return e?(e.type==="checkbox"?e.checked:e.value.replace(/\\s+/g," ").trim()):"";}' +
    'function p2(){var c=val("company"),n=val("name"),r=val("role"),who=c?c+(n?", vertreten durch "+n+(r?" ("+r+")":""):""):n+(r?" ("+r+")":"");var a=[who,val("street"),[val("zip"),val("city")].filter(Boolean).join(" "),val("country")].filter(function(x){return x;}).join(", ");var e=val("email");return a+(e?", E-Mail "+e:"");}' +
    'var PH={partei2:"[Angaben des Vertragspartners]",projekt:"[Projektname]",laufzeit:"[Dauer]"};' +
    'function paint(){var v={partei2:p2(),projekt:val("project"),laufzeit:val("term")};doc.querySelectorAll("mark[data-ph]").forEach(function(m){var k=m.getAttribute("data-ph");m.textContent=v[k]||PH[k];m.className=v[k]?"":"empty";});}' +
    'var t;f.addEventListener("input",function(e){clearTimeout(t);t=setTimeout(paint,60);var l=e.target.closest("[data-f]");if(l){l.classList.remove("bad");var er=l.querySelector(".err");if(er)er.textContent="";}});paint();' +
    'var msg=document.getElementById("ndaMsg"),btn=document.getElementById("ndaSubmit");function show(m){msg.textContent=m;msg.className="nda-msg"+(m?" on":"");}' +
    'f.addEventListener("submit",function(e){e.preventDefault();show("");var b={};Object.keys(C.lim).forEach(function(k){b[k]=val(k);});b.accept=val("accept");' +
    'btn.disabled=true;btn.textContent="Wird unterzeichnet …";fetch(location.pathname.replace(/\\/$/,"")+"/sign",{method:"POST",headers:{"Content-Type":"application/json","X-NDA":"1"},body:JSON.stringify(b),credentials:"same-origin"}).then(function(r){return r.json().catch(function(){return{ok:false,error:"Fehler "+r.status};});}).then(function(j){' +
    'if(j&&j.ok){location.reload();return;}btn.disabled=false;btn.textContent="Digital unterzeichnen";show((j&&j.error)||"Unbekannter Fehler");var first=null;Object.keys((j&&j.fields)||{}).forEach(function(k){var l=f.querySelector("[data-f=\\""+k+"\\"]");if(!l)return;l.classList.add("bad");var er=l.querySelector(".err");if(er)er.textContent=j.fields[k];if(!first)first=l;});if(first)first.scrollIntoView({behavior:"smooth",block:"center"});' +
    '}).catch(function(){btn.disabled=false;btn.textContent="Digital unterzeichnen";show("Keine Verbindung – bitte erneut versuchen.");});});})();';
  function pageSigned(o) {
    const s = o.signed, d = s.data, base = "/nda/" + o.token + "/pdf";
    return '<section class="lhero nda-hero"><div class="nda-ok" aria-hidden="true">✓</div><span class="eyebrow">Vertraulichkeitsvereinbarung</span><h1>Die Vereinbarung ist unterschrieben.</h1><p class="lead">Danke! ' + ((s.mailed || []).indexOf("partner") > -1 ? "Das unterschriebene PDF wurde an " + escH(d.email.replace(/^(.).*(@.*)$/, "$1…$2")) + " geschickt. Du kannst es hier jederzeit herunterladen." : "Bitte lade dir das unterschriebene PDF hier herunter und bewahre es gut auf.") + '</p>' +
      '<div class="btn-row"><a class="btn primary" href="' + base + '?dl=1">PDF herunterladen</a><a class="btn ghost" href="' + base + '" target="_blank" rel="noopener">PDF ansehen</a></div></section>' +
      '<section class="nda-card" style="margin-bottom:40px"><div class="nda-kv"><span>Projekt</span><b>' + escH(d.project) + "</b><span>Vertragspartner</span><b>" + escH(d.company ? d.company + " · " + d.name : d.name) + "</b><span>Unterschrieben am</span><b>" + escH(s.atVienna) + "</b><span>Dauer</span><b>" + escH(d.term) + " + 3 Jahre</b><span>Version</span><b>" + escH(o.v) + "</b><span>Prüfwert (SHA-256)</span><code>" + escH(s.hash) + "</code></div>" + PRIV + "</section>";
  }
  const pageMsg = (h, t) => '<section class="lhero nda-hero"><span class="eyebrow">Vertraulichkeitsvereinbarung</span><h1>' + h + '</h1><p class="lead">' + t + '</p><div class="btn-row"><a class="btn ghost" href="/kontakt">Kontakt</a></div></section>';

  // ───────────────────────── Cockpit ─────────────────────────
  const summary = o => { const s = o.signed, d = s ? s.data : {}; return { id: o.id, status: statusOf(o), statusText: STATUS_DE[statusOf(o)], url: linkOf(o), createdAt: o.createdAt, signedAt: s ? s.at : null, revokedAt: o.revokedAt || null,
    party: s ? (d.company ? d.company + " · " + d.name : d.name) : (o.pre.note || [o.pre.company, o.pre.name].filter(Boolean).join(" · ")), email: s ? d.email : o.pre.email || "", project: s ? d.project : o.pre.project || "", term: s ? d.term : "",
    penalty: o.penaltyCents ? eurTxt(o.penaltyCents) : "", hash: s ? s.hash : "", mails: (o.mails || []).slice(-5), mailed: s ? s.mailed || [] : [], v: o.v }; };
  function parsePenalty(v) { const t = String(v == null ? "" : v).replace(/[€\s]/g, ""); if (!t) return 0; const n = parseFloat(/,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".")); if (!isFinite(n) || n < 0 || n > 1e6) throw Object.assign(new Error("Vertragsstrafe: Betrag zwischen 0 und 1.000.000 €"), { status: 400 }); return Math.round(n * 100); }
  async function create(b) {
    // Name/Firma trägt die Gegenpartei selbst ein; im Cockpit nur interne Notiz (wem der Link geschickt wurde), E-Mail zum Versenden, Projekt-Vorschlag
    const pre = { note: clip(b.note, 120), email: clip(b.email, LIM.email), project: clip(b.project, LIM.project) };
    if (pre.email && !EMAIL.test(pre.email)) throw Object.assign(new Error("E-Mail-Adresse ungültig"), { status: 400 });
    const o = { id: "n" + crypto.randomBytes(8).toString("hex"), token: crypto.randomBytes(24).toString("base64url"), v: VERSION, createdAt: nowIso(), pre, penaltyCents: parsePenalty(b.penalty), mails: [] };
    await store.put(o); return o;
  }
  async function handleAdmin(req, res, u, p) {
    if (!(D.adminAuthed && D.adminAuthed(req))) return J(res, 401, { ok: false, error: "login" });
    try {
      if (p === "/admin/api/nda/list" && req.method === "GET") { const l = await store.list(); return J(res, 200, { ok: true, version: VERSION, mail: !!(D.mailSend && (D.mailReady ? D.mailReady() : process.env.MAIL_API_URL && process.env.MAIL_API_TOKEN)), db: useDb(), office: officeMail(), items: l.map(summary) }); }
      if (p === "/admin/api/nda/pdf" && req.method === "GET") { const o = await store.get(u.searchParams.get("id")); const buf = o && o.signed && await store.pdf(o.id); if (!buf) return J(res, 404, { ok: false, error: "PDF nicht gefunden" }); return pdfOut(res, buf, fileName(o), u.searchParams.get("dl") === "1"); }
      if (req.method !== "POST" || !/application\/json/.test(String(req.headers["content-type"] || ""))) return J(res, 405, { ok: false, error: "method_not_allowed" });
      const b = await readJson(req, 20000);
      if (p === "/admin/api/nda/create") { const o = await create(b); return J(res, 200, { ok: true, item: summary(o) }); }
      if (p === "/admin/api/nda/op") {
        const o = await store.get(String(b.id || "")); if (!o) return J(res, 404, { ok: false, error: "Nicht gefunden" });
        if (b.confirm !== true) return J(res, 400, { ok: false, error: "Bestätigung fehlt" });
        if (b.op === "mail") {
          if (o.signed || o.revokedAt) return J(res, 400, { ok: false, error: "Nur offene Vereinbarungen können verschickt werden" });
          const to = clip(b.to || o.pre.email, LIM.email); if (!EMAIL.test(to)) return J(res, 400, { ok: false, error: "Keine gültige E-Mail-Adresse" });
          await mail(inviteMail(o, to)); o.mails = (o.mails || []).concat([{ to, at: nowIso() }]).slice(-20); if (!o.pre.email) o.pre.email = to; await store.put(o);
          return J(res, 200, { ok: true, item: summary(o) });
        }
        if (b.op === "revoke") { o.revokedAt = nowIso(); await store.put(o); return J(res, 200, { ok: true, item: summary(o) }); }
        if (b.op === "reactivate") { delete o.revokedAt; await store.put(o); return J(res, 200, { ok: true, item: summary(o) }); }
        if (b.op === "delete") { if (o.signed) return J(res, 400, { ok: false, error: "Unterschriebene Vereinbarungen können nicht gelöscht werden – nur widerrufen" }); await store.del(o.id); return J(res, 200, { ok: true }); }
        return J(res, 400, { ok: false, error: "Unbekannte Aktion" });
      }
      return J(res, 404, { ok: false, error: "not_found" });
    } catch (e) { const code = e.status >= 400 && e.status < 600 ? e.status : 500; if (code >= 500) log(p, e.message); return J(res, code, { ok: false, error: code === 500 ? "Fehler: " + String(e.message || e).slice(0, 200) : e.message }); }
  }

  // ───────────────────────── Einstieg (server.js) ─────────────────────────
  async function handle(req, res, u, p) {
    if (p.indexOf("/admin/api/nda/") === 0) return handleAdmin(req, res, u, p);
    const ip = ipOf(req);
    try {
      const m = p.match(/^\/nda\/([A-Za-z0-9_-]{32})(\/pdf|\/sign)?\/?$/);
      if (!m) return html(req, res, 404, shell("Link ungültig", pageMsg("Dieser Link ist ungültig.", "Bitte prüfe den Link oder frag bei FS Creative nach einem neuen.")));
      if (m[2] === "/sign") {
        if (req.method !== "POST") return J(res, 405, { ok: false, error: "method_not_allowed" });
        if (!sameOrigin(req)) return J(res, 403, { ok: false, error: "forbidden" });
        if (limited("sign", ip, 12, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Versuche – bitte später erneut" });
        const o = await store.byToken(m[1]); if (!o) return J(res, 404, { ok: false, error: "Link ungültig" });
        const b = await readJson(req, 20000);
        const r = await sign(o, b, req);
        return J(res, 200, { ok: true, hash: r.signed.hash, mailed: r.signed.mailed });
      }
      if (req.method !== "GET" && req.method !== "HEAD") return J(res, 405, { ok: false, error: "method_not_allowed" });
      if (limited("view", ip, 120, 600e3)) return html(req, res, 429, shell("Zu viele Anfragen", pageMsg("Zu viele Anfragen.", "Bitte versuch es in ein paar Minuten noch einmal.")));
      const o = await store.byToken(m[1]);
      if (!o) return html(req, res, 404, shell("Link ungültig", pageMsg("Dieser Link ist ungültig.", "Bitte prüfe den Link oder frag bei FS Creative nach einem neuen.")));
      if (o.revokedAt) return html(req, res, 410, shell("Link deaktiviert", pageMsg("Dieser Link ist nicht mehr aktiv.", "Die Vereinbarung wurde von FS Creative deaktiviert bzw. widerrufen. Bei Fragen melde dich gern bei uns.")));
      if (m[2] === "/pdf") { const buf = o.signed && await store.pdf(o.id); if (!buf) return html(req, res, 404, shell("Nicht gefunden", pageMsg("Noch kein PDF vorhanden.", "Die Vereinbarung wurde noch nicht unterschrieben."))); return pdfOut(res, buf, fileName(o), u.searchParams.get("dl") === "1"); }
      if (o.signed) return html(req, res, 200, shell("Vereinbarung unterschrieben", pageSigned(o)));
      return html(req, res, 200, shell("Vertraulichkeitsvereinbarung", pageOpen(o)));
    } catch (e) {
      const code = e.status >= 400 && e.status < 600 ? e.status : 500; if (code >= 500) log(p.replace(/[A-Za-z0-9_-]{32}/, "…"), e.message);
      return J(res, code, { ok: false, error: code === 500 ? "Interner Fehler – bitte später erneut versuchen" : String(e.message || e).slice(0, 300), fields: e.fields });
    }
  }
  return { handle, VERSION, _test: { validate, fullText, sectionsFor, party2, pdfSafe, truncIp, parsePenalty, renderPdf } };
};
