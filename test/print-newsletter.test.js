/* Druckshop-Newsletter (print-newsletter.js): Weihnachtsblock und weihnachtliche Entwürfe – direkt gegen das Modul mit Attrappen (kein Server, kein Mailversand).
   Aufruf: node test/print-newsletter.test.js
   Geprüft: Saison wie die Weihnachtsabteilung (Montag bis 23.12.), Betreff/Einleitung weihnachtlich (mit/ohne Monatscode), Block nach Intro und Monatscode,
   Bilder nur über unseren Proxy (absolute URL, JPG – nie Contentful direkt, nie WebP), Preis/Liefertermin nur aus frischen Daten und nie in der Vergangenheit,
   was erst nach Weihnachten ankäme, wird nicht vorgeschlagen, kein Lieferanten-Name, Text-Teil mit Link, ab 24.12. kein Block mehr,
   von Hand bearbeitete Entwürfe bleiben unverändert, alte automatische Entwürfe werden neu aufgebaut. */
"use strict";
const assert = require("assert");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const NL = require(path.join(ROOT, "print-newsletter.js"));
const X = require(path.join(ROOT, "print-xmas.js"));
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }

const CF = "https://images.ctfassets.net/ez9mp376cw6o/";
const PRODUCTS = [
  { key: "flyer", title: "Flyer", desc: "Individuell bedruckt.", img: CF + "3FkW0yZxD7vQ1abcDEF12/0123456789abcdef0123456789abcdef/flyer.jpg?fm=webp&w=600" },
  { key: "plakate", title: "Plakate in Print.com-Qualität", desc: "Plakate von Print.com", img: CF + "4GkW0yZxD7vQ1abcDEF12/1123456789abcdef0123456789abcdef/printcom-poster.jpg?fm=webp&w=600" },
  { key: "folder", title: "Folder", desc: "", img: CF + "5HkW0yZxD7vQ1abcDEF12/2123456789abcdef0123456789abcdef/folder.jpg?fm=webp&w=600" },
  { key: "postcards", title: "Postkarten", desc: "", img: CF + "6IkW0yZxD7vQ1abcDEF12/3123456789abcdef0123456789abcdef/cards.jpg?fm=webp&w=600" },
  { key: "pvc-banner", title: "PVC-Banner", desc: "", img: CF + "7JkW0yZxD7vQ1abcDEF12/4123456789abcdef0123456789abcdef/banner.jpg?fm=webp&w=600" },
  { key: "rollups", title: "Roll-ups", desc: "", img: "" },
  { key: "tshirt-basic", title: "T-Shirts", desc: "", img: CF + "8KkW0yZxD7vQ1abcDEF12/5123456789abcdef0123456789abcdef/logo.svg" },
  { key: "basic-advent-calendar", title: "Adventskalender", desc: "" }, { key: "wine-bags", title: "Weintaschen", desc: "" },
  { key: "card-sets", title: "Kartensets", desc: "" }, { key: "gift-wrapping", title: "Geschenkpapier", desc: "" }, { key: "luxurious-labels", title: "Etiketten", desc: "" }, { key: "christmas-baubles", title: "Kugeln", desc: "" }
];
const AT = "2026-10-28T08:00:00.000Z";
// Weihnachts-Zwischenspeicher (wie print-shop.js xmasData(): nur frische Einträge)
const XD = {
  postcards: { ok: true, gross: 45.72, copies: 250, start: 250, date: "2026-11-12", at: AT },
  "basic-advent-calendar": { ok: true, gross: 312.5, copies: 100, start: 100, date: "2026-11-20", at: AT },
  "gift-wrapping": { ok: true, gross: 1669.44, copies: 500, start: 1000, date: "2026-11-16", at: AT },   // Startauflage ging nicht → Link mit Menge; Tausendertrennzeichen
  "wine-bags": { ok: true, gross: 189, copies: 50, start: 50, date: "2026-11-16", at: AT },
  "card-sets": { ok: true, gross: 69.24, copies: 250, start: 250, date: "2026-12-28", at: AT },         // käme erst nach Weihnachten
  "christmas-baubles": { ok: false, why: "kein Preis", at: AT },
  "premium-advent-calendar": { ok: true, gross: 500, copies: 50, start: 50, date: "2026-11-20", at: AT }, // nicht im Shop freigeschaltet
  "luxurious-labels": { ok: true, gross: 80, copies: 500, start: 500, date: "2026-10-20", at: AT }        // Liefertermin schon vorbei → ohne Termin
};
function mk(o) {
  o = o || {}; const meta = { print_newsletter: o.meta ? JSON.parse(JSON.stringify(o.meta)) : null };
  const D = {
    store: { getMeta: async k => meta[k] || null, setMeta: async (k, v) => { meta[k] = JSON.parse(JSON.stringify(v)); } },
    sig: () => "abc123", sigOk: () => true, nowIso: () => "2026-10-28T10:00:00.000Z", log: () => {}, limited: () => false,
    publicUrl: () => "https://www.fs-creative.at",
    firm: () => ({ name: "FS Creative", owner: "Simon Leonhard Felder", street: "Dorfstraße 3/1", zip: "6793", city: "Gaschurn", uid: "ATU82622967", email: "simon@fs-creative.at", phone: "+43 664 1430620" }),
    products: async () => PRODUCTS, priceFrom: async k => (k === "rollups" ? null : { gross: 49.9, copies: 500 }),
    xmasData: o.xmasData || (async () => o.xd || XD), now: () => Date.parse(o.now || "2026-10-28T10:00:00Z")
  };
  if (o.scrub !== false) D.scrub = s => String(s).replace(/\b(?:bei |von )?print\.com\b/gi, m => /^(bei|von) /i.test(m) ? m.split(" ")[0] + " uns" : "FS Creative");
  return { T: NL(D)._test, meta };
}
const imgs = h => (h.match(/<img [^>]*>/g) || []).map(i => (i.match(/ src="([^"]*)"/) || [])[1]);

(async () => {
  delete process.env.PRINT_XMAS;
  await t("Saison wie die Weihnachtsabteilung: Ausgaben mit Montag 15.10.–23.12. sind Weihnachtsausgaben", async () => {
    const { T } = mk();
    assert.deepStrictEqual(["2026-10-12", "2026-10-19", "2026-11-02", "2026-12-21", "2026-12-28", "2027-01-04"].map(T.xmIssue), [false, true, true, true, false, false]);
  });

  await t("Entwurf 02.11.2026 (erste Ausgabe im Monat): Betreff „Weihnachten mit deinem Design (KW 45) + 5 % Rabatt“, weihnachtliche Einleitung mit Code, keine Postkarten unter den Empfehlungen", async () => {
    const { T } = mk(), d = await T.draftFor("2026-11-02");
    assert.strictEqual(d.subject, "Weihnachten mit deinem Design (KW 45) + 5 % Rabatt");
    assert.ok(/Weihnacht/.test(d.intro) && /5 %/.test(d.intro) && /Monatscode/.test(d.intro), d.intro);
    assert.strictEqual(d.code, "NLNOV26"); assert.ok(d.auto === true && d.v === 3 && d.xmas === true);
    assert.ok(d.products.length === 3 && d.products.indexOf("postcards") < 0, "Postkarten kommen als Weihnachtskarten im Block: " + d.products);
  });

  await t("Einleitungen: ohne Code ohne Rabatt-Zusatz, 3 rotierende Texte in Du-Form, keine falschen Versprechen; außerhalb der Saison wie bisher", async () => {
    const { T } = mk(), ds = [];
    for (const mon of ["2026-11-09", "2026-11-16", "2026-11-23"]) ds.push(await T.draftFor(mon));
    assert.deepStrictEqual(ds.map(d => d.subject), ["Weihnachten mit deinem Design (KW 46)", "Weihnachten mit deinem Design (KW 47)", "Weihnachten mit deinem Design (KW 48)"]);
    assert.strictEqual(new Set(ds.map(d => d.intro)).size, 3, "Einleitung rotiert");
    const all = ds.concat([await T.draftFor("2026-12-07"), await T.draftFor("2027-01-04")]).map(d => d.intro);
    all.forEach(i => { assert.ok(!/\bSie\b|\bIhr(e|en)?\b/.test(i), "Du-Form: " + i); assert.ok(!/garantiert|sicher(?:er)? rechtzeitig|kommt (bestimmt|garantiert)|versandkostenfrei|gratis/i.test(i), "kein Versprechen: " + i); assert.ok(!/\{pct\}/.test(i)); });
    assert.ok(/Weihnacht/.test(all[0]) && !/Rabatt|Code/.test(ds[0].intro), "ohne Code kein Rabatt-Hinweis: " + ds[0].intro);
    const dez = await T.draftFor("2026-12-07"); assert.strictEqual(dez.subject, "Weihnachten mit deinem Design (KW 50) + 5 % Rabatt");
    assert.strictEqual((await T.draftFor("2026-10-12")).subject, "Druck-Tipps der Woche (KW 42)");
    const jan = await T.draftFor("2027-01-04"); assert.ok(jan.subject === "Druck-Tipps der Woche (KW 1) + 5 % Rabatt" && jan.xmas === false && !/Weihnacht/.test(jan.intro), jan.subject);
    const dez28 = await T.draftFor("2026-12-28"); assert.ok(!/Weihnacht/.test(dez28.subject + dez28.intro), "ab 24.12. nicht mehr weihnachtlich");
  });

  await t("Ausgabe 02.11.2026: Weihnachtsblock nach Intro und Monatscode – Titelbild über unseren Proxy (JPG), 3 Karten mit Preis/Liefertermin, Button zur Weihnachtsabteilung", async () => {
    const { T } = mk(), iss = await T.issueFor("2026-11-02", true), r = await T.render(iss, "kunde@example.com"), h = r.html;
    const iIntro = h.indexOf(">" + iss.intro.slice(0, 30)), iCode = h.indexOf("NLNOV26"), iX = h.indexOf("Weihnachten mit deinem Design</div>"), iRec = h.indexOf("Unsere Empfehlungen der Woche");
    assert.ok(iIntro > 0 && iCode > iIntro && iX > iCode && iRec > iX, "Reihenfolge Intro → Code → Weihnachten → Empfehlungen: " + [iIntro, iCode, iX, iRec]);
    const hero = "https://www.fs-creative.at/print/bild/ez9mp376cw6o/" + X.HERO.img + "?fm=jpg&amp;w=1200&amp;q=80";
    assert.ok(h.indexOf('<a href="https://www.fs-creative.at/print/weihnachten?utm_source=newsletter&amp;utm_campaign=kw45"><img src="' + hero + '"') > -1, "Titelbild verlinkt, über unseren Proxy");
    assert.ok(/>Weihnachtsideen ansehen<\/a>/.test(h) && h.indexOf('href="https://www.fs-creative.at/print/weihnachten?utm_source=newsletter&amp;utm_campaign=kw45" style="display:inline-block;background:#b3261e') > -1, "Button");
    assert.ok(/rechtzeitig bestellen: Bei jedem Produkt steht, wann es voraussichtlich ankommt/.test(h));
    ["Weihnachtskarten", "Adventskalender", "Geschenkpapier"].forEach(n => assert.ok(h.indexOf(">" + n + "</div>") > -1, n));
    assert.ok(/ab <b[^>]*>€ 45,72<\/b> <span[^>]*>für 250 Stk\.<\/span>/.test(h) && /Lieferung voraussichtlich ab <span[^>]*>Do\. 12\.11\.<\/span>/.test(h), "Preis und Liefertermin");
    assert.ok(/<style>@media only screen and \(max-width:520px\)\{td\.nl-c\{display:block!important/.test(h) && (h.match(/<td class="nl-c"/g) || []).length === 6, "am Handy untereinander (3 Weihnachts- + 3 Empfehlungskarten)");
    assert.ok(h.indexOf("/print?produkt=gift-wrapping&amp;menge=500&amp;utm_source=newsletter&amp;utm_campaign=kw45") > -1, "andere Menge als die Startauflage: Link mit Menge");
    assert.ok(/ab <b[^>]*>€ 1\u00a0669,44<\/b> <span[^>]*>für 500 Stk\.<\/span>/.test(h), "Tausendertrennzeichen wie auf der Weihnachtsseite");
    assert.ok(h.indexOf("Kartensets") < 0 && h.indexOf("Kugeln") < 0, "zu spät für Weihnachten bzw. ohne Preis: nicht vorgeschlagen");
    assert.ok(h.indexOf("ez9mp376cw6o/NU31pWTaiPaj8IRMpPGoO/") > -1 && h.indexOf("?fm=jpg&amp;w=400&amp;h=300&amp;fit=fill&amp;q=80") > -1, "Weihnachtsfoto der Karte, einheitlich 4:3");
    imgs(h).forEach(s => { assert.ok(/^https:\/\/www\.fs-creative\.at\/(print\/bild\/ez9mp376cw6o\/|logos\/)/.test(s), "nur eigene Bild-URLs: " + s); assert.ok(!/fm=webp/.test(s), "kein WebP: " + s); });
    assert.ok(!/images\.ctfassets\.net/.test(h + r.text), "nie Contentful direkt"); assert.ok(!/print\.?com/i.test(h + r.text), "kein Lieferanten-Name");
    assert.ok(/Fotos sind Beispiele\. Liefertermine sind voraussichtliche Termine/.test(h), "Hinweis in den Pflichtangaben");
    // Text-Teil
    assert.ok(/\nWEIHNACHTEN MIT DEINEM DESIGN\n/.test(r.text) && r.text.indexOf("Weihnachtsideen ansehen: https://www.fs-creative.at/print/weihnachten?utm_source=newsletter&utm_campaign=kw45") > -1, r.text);
    assert.ok(r.text.indexOf("• Weihnachtskarten – ab € 45,72 für 250 Stk., Lieferung voraussichtlich ab Do. 12.11.") > -1, "Vorschläge im Text-Teil");
    assert.ok(r.text.indexOf("DEIN MONATSCODE") < r.text.indexOf("WEIHNACHTEN MIT DEINEM DESIGN") && r.text.indexOf("WEIHNACHTEN MIT DEINEM DESIGN") < r.text.indexOf("EMPFEHLUNGEN DER WOCHE"));
  });

  await t("Karten: Liefertermin in der Vergangenheit nie zeigen, nicht freigeschaltete Produkte nie, Daten fehlen → Block ohne Karten (Bild, Text, Button bleiben)", async () => {
    const xd = Object.assign({}, XD, { postcards: Object.assign({}, XD.postcards, { date: "2026-10-30" }) });   // vor dem Montag 02.11. → beim Versand schon vorbei
    let r = await (async () => { const { T } = mk({ xd }); return T.render(await T.issueFor("2026-11-02", true)); })();
    assert.ok(r.html.indexOf(">Weihnachtskarten</div>") > -1 && !/Lieferung voraussichtlich ab Fr\. 30\.10\./.test(r.html) && !/30\.10\./.test(r.text), "ohne vergangenen Termin");
    assert.ok(r.html.indexOf("premium-advent-calendar") < 0, "nicht im Shop → nie");
    const { T } = mk({ xmasData: async () => { throw new Error("weg"); } }); r = await T.render(await T.issueFor("2026-11-02", true));
    assert.ok(/Weihnachten mit deinem Design<\/div>/.test(r.html) && /Weihnachtsideen ansehen/.test(r.html) && !/Jetzt gestalten →<\/a><\/div><\/td>/.test(r.html), "ohne Daten: Block ohne Karten");
    const t2 = mk({ xd: { "luxurious-labels": XD["luxurious-labels"], "wine-bags": XD["wine-bags"] } }).T; r = await t2.render(await t2.issueFor("2026-11-09", true));
    assert.ok(r.html.indexOf(">Weinetiketten</div>") > -1 && r.html.indexOf(">Weintaschen</div>") > -1 && /style="width:50%;padding:6px"/.test(r.html), "zwei Karten, nächster passender Vorschlag rückt nach");
    const sea = X.season("2026-11-23T12:00:00Z"), adv = { "basic-advent-calendar": Object.assign({}, XD["basic-advent-calendar"], { date: "2026-12-03" }), "premium-advent-calendar": Object.assign({}, XD["premium-advent-calendar"], { date: "2026-11-27" }) };
    assert.deepStrictEqual(X.mailPicks(adv, null, sea, { ref: "2026-11-23" }).map(x => x.key), ["premium-advent-calendar"], "Adventskalender nur, wenn er vor dem 1.12. ankommt");
    assert.deepStrictEqual(X.mailPicks({ "basic-advent-calendar": Object.assign({}, adv["basic-advent-calendar"], { date: "" }) }, null, X.season("2026-12-07T12:00:00Z"), { ref: "2026-12-07" }), [], "im Dezember keine Adventskalender");
  });

  await t("Nicht in der Saison bzw. ab 24.12.: kein Weihnachtsblock", async () => {
    const plain = async (mon, now) => { const { T } = mk({ now }); const r = await T.render(await T.issueFor(mon, true)); return r.html + r.text; };
    for (const [mon, now] of [["2026-10-12", "2026-10-10T10:00:00Z"], ["2026-12-28", "2026-12-27T10:00:00Z"], ["2027-01-04", "2027-01-02T10:00:00Z"], ["2026-12-21", "2026-12-24T09:00:00Z"]]) {
      const h = await plain(mon, now); assert.ok(!/print\/weihnachten|Weihnachtsideen ansehen|WEIHNACHTEN MIT DEINEM DESIGN|Fotos sind Beispiele/.test(h), "kein Block: " + mon + " (heute " + now + ")");
    }
    const { T } = mk({ now: "2026-12-14T10:00:00Z" }), r = await T.render(await T.issueFor("2026-12-21", true));
    assert.ok(/Weihnachtsideen ansehen/.test(r.html) && r.html.indexOf("Kartensets") < 0, "letzte Ausgabe vor Weihnachten: Block, aber nichts, was erst nach Weihnachten ankommt");
  });

  await t("Bestehende Entwürfe: von Hand bearbeitete nie überschreiben, versendete nie, alte automatische ohne Weihnachtsinhalt neu aufbauen (einmal)", async () => {
    const manual = { monday: "2026-11-09", kw: 46, status: "draft", subject: "Mein eigener Betreff", intro: "Meine Einleitung", products: ["flyer"], tipTitle: "T", tipText: "X", code: "", auto: false, editedAt: "2026-10-27T09:00:00.000Z", v: 2 };
    const meta = { subs: {}, settings: {}, issues: {
      "2026-11-02": { monday: "2026-11-02", kw: 45, status: "draft", subject: "Druck-Tipps der Woche (KW 45) + 5 % Rabatt", intro: "Neuer Monat, neuer Code", products: ["flyer", "postcards", "pvc-banner"], code: "NLNOV26", auto: true, v: 2 },
      "2026-11-09": manual,
      "2026-11-16": { monday: "2026-11-16", kw: 47, status: "sent", subject: "Alt (versendet)", auto: true, v: 2 },
      "2026-11-23": { monday: "2026-11-23", kw: 48, status: "draft", subject: "Ohne Kennzeichen", intro: "x", products: [], v: 2 } } };
    const { T, meta: M } = mk({ meta });
    const a = await T.issueFor("2026-11-02", true); assert.ok(a.subject === "Weihnachten mit deinem Design (KW 45) + 5 % Rabatt" && a.v === 3 && a.auto === true, "neu aufgebaut: " + a.subject);
    assert.strictEqual(M.print_newsletter.issues["2026-11-02"].v, 3, "gespeichert");
    a.marker = 1; assert.strictEqual((await T.issueFor("2026-11-02", true)).marker, 1, "nur einmal neu aufgebaut");
    assert.deepStrictEqual(await T.issueFor("2026-11-09", true), manual, "von Hand bearbeitet: unverändert");
    assert.strictEqual((await T.issueFor("2026-11-16", true)).subject, "Alt (versendet)");
    assert.strictEqual((await T.issueFor("2026-11-23", true)).subject, "Ohne Kennzeichen", "ohne auto: true nie überschreiben");
    const r = await T.render(await T.issueFor("2026-11-09", true));
    assert.ok(/Mein eigener Betreff/.test(r.html) && /Meine Einleitung/.test(r.html) && /Weihnachtsideen ansehen/.test(r.html), "bearbeitete Ausgabe behält Betreff/Einleitung, bekommt aber den Block");
    assert.deepStrictEqual(M.print_newsletter.issues["2026-11-09"], manual);
  });

  await t("Empfehlungen: Katalogtexte ohne Lieferanten-Namen, Katalogbilder über unseren Proxy als JPG (SVG/Lieferanten-Dateiname ohne Bild)", async () => {
    for (const scrub of [true, false]) {
      const { T } = mk({ scrub }), iss = Object.assign(await T.draftFor("2026-11-02"), { products: ["flyer", "plakate", "tshirt-basic"] }), r = await T.render(iss);
      assert.ok(!/print\.?com/i.test(r.html + r.text), "kein Lieferanten-Name (scrub " + scrub + ")");
      assert.ok(r.html.indexOf('src="https://www.fs-creative.at/print/bild/ez9mp376cw6o/3FkW0yZxD7vQ1abcDEF12/0123456789abcdef0123456789abcdef/flyer.jpg?fm=jpg&amp;w=400&amp;q=80"') > -1, "Flyer-Bild über den Proxy");
      assert.ok(!/logo\.svg|poster\.jpg/.test(r.html), "SVG bzw. Lieferanten-Dateiname: ohne Bild");
    }
  });

  if (fail) { console.log(fails.join("\n\n")); console.log("\nFEHLER: " + pass + " bestanden, " + fail + " fehlgeschlagen"); process.exit(1); }
  console.log("OK: " + pass + " bestanden, 0 fehlgeschlagen");
})().catch(e => { console.error(e); process.exit(1); });
