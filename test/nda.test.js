/* Vertraulichkeitsvereinbarungen (nda.js) gegen den Mailserver-Mock (test/print-mocks.js).
   Aufruf: node test/nda.test.js   – server.js läuft in einer Temp-Kopie (Dateispeicher, ohne DATABASE_URL).
   Geprüft: Link anlegen (nur Admin), öffentliche Seite (noindex, Firmendaten, Vertragsstrafe, Platzhalter), CSRF-Schutz, Prüfung der Eingaben,
   Projektname nur Vorschlag (änderbar), „Digital unterzeichnen“ ohne Namensfeld/Zeichenfeld → PDF (%PDF, Projekt + Prüfwert) + Mails an beide Seiten mit Anhang, kein zweites Unterschreiben, Einladungsmail,
   Widerrufen/Reaktivieren, Löschen nur unsigniert, Escaping, Cockpit-Modul, Begrenzung der Versuche. */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto");
const createMocks = require("./print-mocks.js");

const ROOT = path.join(__dirname, "..");
const SECRET = "test-secret";
const COOKIE = "fsadmin=" + encodeURIComponent((v => v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("hex"))("s1." + Date.now()));
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }

function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-nda-"));
  fs.readdirSync(ROOT).filter(f => /\.(js|html|css|xml|txt|webmanifest)$/.test(f) && fs.statSync(path.join(ROOT, f)).isFile()).forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  const cpDir = (d) => { fs.mkdirSync(path.join(dir, d), { recursive: true }); fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => { if (e.isDirectory()) cpDir(path.join(d, e.name)); else fs.copyFileSync(path.join(ROOT, d, e.name), path.join(dir, d, e.name)); }); };
  ["admin-cockpit", "logos"].forEach(cpDir);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
async function startServer(dir, env) {
  const port = 5900 + Math.floor(Math.random() * 600);
  const e = Object.assign({}, process.env, { PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x" }, env);
  ["BLITZDINGS_STATS_URL", "BLITZDINGS_STATS_TOKEN", "RAILWAY_API_TOKEN", "CF_API_TOKEN", "ANTHROPIC_API_KEY", "DATABASE_URL", "NDA_SECRET", "NDA_MAIL_TO", "NDA_PUBLIC_URL", "SEVDESK_API_KEY"].forEach((k) => { if (!(k in env)) delete e[k]; });
  const srv = cp.spawn(process.execPath, ["server.js"], { cwd: dir, env: e, stdio: ["ignore", "pipe", "pipe"] });
  srv.out = ""; srv.stdout.on("data", (d) => (srv.out += d)); srv.stderr.on("data", (d) => (srv.out += d));
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 80; i++) { try { await fetch(base + "/admin/login"); break; } catch (er) { await new Promise((r) => setTimeout(r, 100)); } }
  srv.base = base; return srv;
}
(async () => {
  const mocks = createMocks(); const mport = await listen(mocks.server); const M = mocks.state;
  const dir = copyApp();
  const srv = await startServer(dir, { MAIL_API_URL: "http://127.0.0.1:" + mport + "/mail/api/mails", MAIL_API_TOKEN: "mt" });
  const B = srv.base;
  const admin = async (p, body) => { const r = await fetch(B + p, body ? { method: "POST", headers: { cookie: COOKIE, "content-type": "application/json" }, body: JSON.stringify(body) } : { headers: { cookie: COOKIE } }); return Object.assign(await r.json().catch(() => ({})), { _status: r.status }); };
  const sign = async (tok, body, headers) => { const r = await fetch(B + "/nda/" + tok + "/sign", { method: "POST", headers: Object.assign({ "content-type": "application/json", "x-nda": "1" }, headers || {}), body: JSON.stringify(body) }); return { status: r.status, j: await r.json().catch(() => null) }; };
  const tokOf = url => url.split("/nda/")[1];
  const GOOD = { company: "<b>Muster</b> & Co GmbH", name: "Maria Muster", role: "Geschäftsführerin", street: "Silvrettastraße 12", zip: "6793", city: "Gaschurn", country: "Österreich", email: "maria@example.com", phone: "+43 664 1234567", term: "bis Go-Live des Projektes", accept: true };
  let A, tokA;

  await t("Cockpit-API nur mit Anmeldung", async () => {
    const r = await fetch(B + "/admin/api/nda/list"); assert.strictEqual(r.status, 401);
    const c = await fetch(B + "/admin/api/nda/create", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); assert.strictEqual(c.status, 401);
  });
  await t("Link anlegen: Token ≥ 128 Bit, Liste zeigt „offen“, Vertragsstrafe formatiert", async () => {
    const j = await admin("/admin/api/nda/create", { company: "Muster GmbH", name: "Maria Muster", email: "maria@example.com", project: "Projekt Alpine 2027", penalty: "5.000" });
    assert.strictEqual(j.ok, true, JSON.stringify(j)); A = j.item; tokA = tokOf(A.url);
    assert.ok(/^https:\/\/www\.fs-creative\.at\/nda\/[A-Za-z0-9_-]{32}$/.test(A.url), A.url); assert.ok(Buffer.from(tokA, "base64url").length >= 16);
    assert.strictEqual(A.status, "open"); assert.strictEqual(A.penalty, "€ 5.000,00");
    const l = await admin("/admin/api/nda/list"); assert.strictEqual(l.ok, true); assert.ok(l.items.some(x => x.id === A.id && x.statusText === "offen")); assert.strictEqual(l.version, "NDA-2026-10.2"); assert.strictEqual(l.mail, true);
    const bad = await admin("/admin/api/nda/create", { penalty: "abc€" }); assert.strictEqual(bad._status, 400);
    const bad2 = await admin("/admin/api/nda/create", { email: "keine-mail" }); assert.strictEqual(bad2._status, 400);
  });
  await t("öffentliche Seite: noindex, kein Referrer, Partei 1, Projekt, Vertragsstrafe, Platzhalter, Datenschutz-Hinweis", async () => {
    const r = await fetch(B + "/nda/" + tokA); assert.strictEqual(r.status, 200); const h = await r.text();
    assert.ok(/noindex/.test(r.headers.get("x-robots-tag")) && /noindex, nofollow/.test(h)); assert.strictEqual(r.headers.get("referrer-policy"), "no-referrer"); assert.strictEqual(r.headers.get("x-frame-options"), "DENY");
    assert.ok(/Simon Leonhard Felder/.test(h) && /Dorfstraße 3\/1, 6793 Gaschurn, Österreich, UID ATU82622967/.test(h));
    assert.ok(/name="project"[^>]*value="Projekt Alpine 2027"/.test(h) && !/readonly/.test(h), "Projekt nur vorausgefüllt, änderbar");
    assert.ok(/>Digital unterzeichnen</.test(h) && !/name="sigName"/.test(h) && !/<canvas/.test(h), "nur Zustimmung + Button");
    assert.ok(/Ich habe die Vereinbarung gelesen und stimme ihr zu/.test(h) && /Betätigung der Schaltfläche „Digital unterzeichnen“/.test(h) && !/Unterschrift am Bildschirm/.test(h));
    assert.ok(/Vertragsstrafe von € 5\.000,00/.test(h)); assert.ok(/placeholder="z\. B\. bis Go-Live des Projektes"/.test(h));
    assert.ok(/außerhalb dieser Zusammenarbeit ist untersagt/.test(h) && /Dritten weder ganz noch teilweise/.test(h), "Weitergabe + Verwendung geregelt");
    assert.ok(/3 Jahre/.test(h) && /Datenschutz:/.test(h) && /§ 14 KSchG/.test(h) && /UN-Kaufrechts/.test(h));
    assert.ok(/\/landing\.css/.test(h) && /fsc-theme/.test(h));
  });
  await t("ungültige Links → 404 (noindex)", async () => {
    const r = await fetch(B + "/nda/" + "A".repeat(32)); assert.strictEqual(r.status, 404); assert.ok(/noindex/.test(r.headers.get("x-robots-tag")));
    assert.strictEqual((await fetch(B + "/nda/kurz")).status, 404); assert.strictEqual((await fetch(B + "/nda")).status, 404);
    assert.strictEqual((await fetch(B + "/nda.js")).status, 404, "Server-Code nie öffentlich");
  });
  await t("Unterschreiben nur mit X-NDA-Header und gleicher Herkunft", async () => {
    let r = await sign(tokA, GOOD, { "x-nda": "" }); assert.strictEqual(r.status, 403);
    r = await sign(tokA, GOOD, { origin: "https://evil.example" }); assert.strictEqual(r.status, 403);
  });
  await t("Prüfung der Eingaben: Pflichtfelder, Name = Unterschrift, Längen, Unterschrift-Bild", async () => {
    let r = await sign(tokA, {}); assert.strictEqual(r.status, 400);
    ["name", "email", "street", "zip", "city", "project", "term", "accept"].forEach(k => assert.ok(r.j.fields[k], "Feld " + k + " " + JSON.stringify(r.j.fields)));
    r = await sign(tokA, Object.assign({}, GOOD, { term: "x".repeat(201) })); assert.strictEqual(r.status, 400); assert.ok(r.j.fields.term);
    r = await sign(tokA, Object.assign({}, GOOD, { accept: "true" })); assert.strictEqual(r.status, 400); assert.ok(r.j.fields.accept);
    assert.strictEqual(M.mails.length, 0, "keine Mails bei Fehlern");
  });
  let hash;
  await t("Unterschreiben: Prüfwert, PDF (Projekt + Prüfwert), Mails mit PDF an Vertragspartner und office@", async () => {
    const r = await sign(tokA, Object.assign({}, GOOD, { project: "Projekt Alpine 2028", sigName: "Jemand Anderer", sigImg: "data:image/png;base64,AAAA" }), { "x-forwarded-for": "203.0.113.77" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.j)); hash = r.j.hash; assert.ok(/^[a-f0-9]{64}$/.test(hash)); assert.deepStrictEqual(r.j.mailed, ["partner", "office"]);
    const p = await fetch(B + "/nda/" + tokA + "/pdf?dl=1"); assert.strictEqual(p.status, 200); assert.strictEqual(p.headers.get("content-type"), "application/pdf"); assert.ok(/attachment; filename="Vertraulichkeitsvereinbarung-Projekt-Alpine-2028\.pdf"/.test(p.headers.get("content-disposition")));
    const buf = Buffer.from(await p.arrayBuffer()), raw = buf.toString("latin1");
    assert.strictEqual(raw.slice(0, 4), "%PDF"); assert.ok(raw.indexOf("Projekt Alpine 2028") > -1, "geänderter Projektname im PDF"); assert.ok(raw.indexOf(hash) > -1, "Prüfwert im PDF"); assert.ok(raw.indexOf("Projekt Alpine 2027") < 0, "Vorschlag ersetzt");
    assert.strictEqual((raw.match(/\/Subtype \/Image/g) || []).length, 2, "nur das Logo (Bild + Transparenzmaske), kein Unterschriftsbild");
    const toP = M.mails.find(m => m.to === "maria@example.com"), toO = M.mails.find(m => m.to === "office@fs-creative.at");
    assert.ok(toP && toO, JSON.stringify(M.mails.map(m => m.to)));
    [toP, toO].forEach(m => { assert.strictEqual(m.attachments.length, 1); assert.strictEqual(m.attachments[0].contentType, "application/pdf"); assert.strictEqual(Buffer.from(m.attachments[0].content, "base64").slice(0, 4).toString(), "%PDF"); assert.ok(m.text.indexOf(hash) > -1); });
    assert.ok(/Projekt Alpine 2028/.test(toO.subject)); assert.strictEqual(toO.replyTo, "maria@example.com");
    assert.ok(toP.html.indexOf("<b>Muster</b>") < 0 && toO.html.indexOf("&lt;b&gt;Muster") > -1, "Mail-HTML escaped");
  });
  await t("nach Unterschrift: Seite zeigt Status + Download, kein Formular, Eingaben escaped; gespeichert mit gekürzter IP", async () => {
    const h = await (await fetch(B + "/nda/" + tokA)).text();
    assert.ok(/Die Vereinbarung ist unterschrieben/.test(h) && h.indexOf(hash) > -1 && /\/pdf\?dl=1/.test(h)); assert.ok(!/id="ndaForm"/.test(h));
    assert.ok(h.indexOf("<b>Muster</b>") < 0 && h.indexOf("&lt;b&gt;Muster&lt;/b&gt; &amp; Co GmbH") > -1);
    const f = JSON.parse(fs.readFileSync(path.join(dir, "nda", A.id + ".json"), "utf8"));
    assert.strictEqual(f.signed.ipTrunc, "203.0.113.0"); assert.ok(JSON.stringify(f).indexOf("203.0.113.77") < 0, "keine volle IP"); assert.strictEqual(f.signed.sigName, "Maria Muster", "Unterzeichner = Vor- und Nachname"); assert.strictEqual(f.signed.method, "button"); assert.ok(!/sigImg|Jemand Anderer/.test(JSON.stringify(f)), "keine Bild-/Namensfelder übernommen");
    assert.ok(/MESZ|MEZ|GMT/.test(f.signed.atVienna) && /Z$/.test(f.signed.at));
    const l = await admin("/admin/api/nda/list"); const it = l.items.find(x => x.id === A.id); assert.strictEqual(it.status, "signed"); assert.strictEqual(it.term, "bis Go-Live des Projektes"); assert.strictEqual(it.project, "Projekt Alpine 2028");
  });
  await t("kein zweites Unterschreiben; unterschriebene nicht löschbar; Admin-PDF", async () => {
    const r = await sign(tokA, GOOD); assert.strictEqual(r.status, 409);
    const d = await admin("/admin/api/nda/op", { op: "delete", id: A.id, confirm: true }); assert.strictEqual(d._status, 400);
    const p = await fetch(B + "/admin/api/nda/pdf?id=" + A.id, { headers: { cookie: COOKIE } }); assert.strictEqual(p.status, 200); assert.strictEqual(Buffer.from(await p.arrayBuffer()).slice(0, 4).toString(), "%PDF");
    assert.strictEqual((await fetch(B + "/admin/api/nda/pdf?id=" + A.id)).status, 401);
  });
  let Bn, tokB;
  await t("Einladung per Mail: nur mit Bestätigung, Link im Text", async () => {
    const j = await admin("/admin/api/nda/create", { note: "Max Beispiel", project: "", penalty: "" }); Bn = j.item; tokB = tokOf(Bn.url);
    assert.strictEqual(Bn.penalty, ""); const h = await (await fetch(B + "/nda/" + tokB)).text(); assert.ok(!/Vertragsstrafe/.test(h), "ohne Betrag keine Vertragsstrafe-Klausel"); assert.ok(!/name="project"[^>]*readonly/.test(h), "Projekt frei");
    let r = await admin("/admin/api/nda/op", { op: "mail", id: Bn.id, to: "max@example.com" }); assert.strictEqual(r._status, 400);
    const n0 = M.mails.length; r = await admin("/admin/api/nda/op", { op: "mail", id: Bn.id, to: "max@example.com", confirm: true }); assert.strictEqual(r.ok, true, JSON.stringify(r));
    const m = M.mails[n0]; assert.strictEqual(m.to, "max@example.com"); assert.ok(m.text.indexOf(Bn.url) > -1 && m.html.indexOf(Bn.url) > -1); assert.ok(/^Hallo,/.test(m.text), "ohne Namen – den trägt der Kunde selbst ein");
    assert.strictEqual(r.item.email, "max@example.com"); assert.strictEqual(r.item.mails.length, 1);
  });
  await t("Widerrufen → Link zeigt „nicht mehr aktiv“, Unterschreiben gesperrt; Reaktivieren", async () => {
    await admin("/admin/api/nda/op", { op: "revoke", id: Bn.id, confirm: true });
    let r = await fetch(B + "/nda/" + tokB); assert.strictEqual(r.status, 410); assert.ok(/nicht mehr aktiv/.test(await r.text()));
    const s = await sign(tokB, Object.assign({}, GOOD, { project: "X Projekt", name: "Max Beispiel" })); assert.strictEqual(s.status, 410);
    const l = await admin("/admin/api/nda/list"); assert.strictEqual(l.items.find(x => x.id === Bn.id).statusText, "widerrufen");
    await admin("/admin/api/nda/op", { op: "reactivate", id: Bn.id, confirm: true }); r = await fetch(B + "/nda/" + tokB); assert.strictEqual(r.status, 200);
    await admin("/admin/api/nda/op", { op: "revoke", id: A.id, confirm: true }); assert.strictEqual((await fetch(B + "/nda/" + tokA + "/pdf")).status, 410, "widerrufene: kein PDF über den Link");
  });
  await t("unsignierte löschen → Link ungültig", async () => {
    const d = await admin("/admin/api/nda/op", { op: "delete", id: Bn.id, confirm: true }); assert.strictEqual(d.ok, true);
    assert.strictEqual((await fetch(B + "/nda/" + tokB)).status, 404); assert.ok(!(await admin("/admin/api/nda/list")).items.some(x => x.id === Bn.id));
  });
  await t("Cockpit-Modul „Rechtliches“ wird ausgeliefert", async () => {
    const h = await (await fetch(B + "/admin/neu", { headers: { cookie: COOKIE } })).text(); assert.ok(/\/admin\/neu\/zlegal\.js/.test(h), "Modul eingebunden");
    const js = await (await fetch(B + "/admin/neu/zlegal.js", { headers: { cookie: COOKIE } })).text(); assert.ok(/label:"Rechtliches"/.test(js) && /1336/.test(js) && /keine Rechtsberatung/.test(js));
  });
  await t("Begrenzung: zu viele Unterschrifts-Versuche → 429", async () => {
    const j = await admin("/admin/api/nda/create", {}); const tok = tokOf(j.item.url); let got = 0;
    for (let i = 0; i < 16; i++) { const r = await sign(tok, {}); if (r.status === 429) got++; }
    assert.ok(got > 0);
  });

  srv.kill(); mocks.server.close();
  if (fail) console.log(srv.out.split("\n").filter(l => /NDA|Error|error/.test(l)).slice(-20).join("\n"));
  console.log(fails.join("\n")); console.log(pass + " ok, " + fail + " fehlgeschlagen");
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
