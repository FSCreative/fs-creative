process.env.MKT_WEB = "off";
/* Marketing (marketing.js, mkt-render.js): Teilnehmer erkennen, faire Ziehung, Protokoll, Routen, Video (wenn ffmpeg vorhanden). */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const ROOT = path.join(__dirname, "..");
const R = require(path.join(ROOT, "mkt-render.js"));

let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }

// kleiner Ersatz für req/res, damit die Routen ohne Server laufen
function req(method, body) { const r = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []); r.method = method; r.headers = {}; return r; }
function res() {
  const o = { code: 0, head: {}, chunks: [], writeHead(c, h) { o.code = c; Object.assign(o.head, h || {}); }, setHeader(k, v) { o.head[k] = v; }, write(c) { o.chunks.push(Buffer.from(c)); }, end(c) { if (c) o.chunks.push(Buffer.from(c)); o.done(); }, on() {}, once() {}, emit() {} };
  o.finished = new Promise(r => { o.done = r; }); o.json = () => JSON.parse(Buffer.concat(o.chunks).toString("utf8")); o.text = () => Buffer.concat(o.chunks).toString("utf8"); return o;
}
function send(r, code, body, type, headers) { r.writeHead(code, Object.assign({ "Content-Type": type }, headers || {})); r.end(body); }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-mkt-"));
  const M = require(path.join(ROOT, "marketing.js"))({ send, DATA_DIR: dir, ROOT });
  const P = M._test.parseParticipants;
  const call = async (method, p, body, qs) => { const r = res(); await M.handleAdmin(req(method, body), r, new URL("http://x" + p + (qs || "")), p); await r.finished; return r; };

  await t("Zeilen: @Name, Klarnamen, Nummerierung, doppelte und eigene Konten", async () => {
    const r = P("@lisa.montafon\n@markus_bludenz\n2 Std.\nAntworten\n@Lisa.Montafon super!\nJulia Huber\n1. Max Muster\n- Eva\n@kochdu.at", "@kochdu.at");
    assert.deepStrictEqual(r.participants, ["@lisa.montafon", "@markus_bludenz", "Julia Huber", "Max Muster", "Eva"]);
    assert.strictEqual(r.dupes, 1); assert.strictEqual(r.excluded, 1); assert.strictEqual(r.skipped, 2); assert.strictEqual(r.mode, "zeilen");
  });
  await t("Instagram-Kommentare: Name vor der Zeitangabe, Kommentartext zählt nicht", async () => {
    const ig = "lisa.montafon\n2 Std.\nIch will gewinnen @markus_b\n3 „Gefällt mir“-Angaben\nAntworten\nmarkus_bludenz\nVerifiziert\n1 Std.\n@anna dabei!\nAntworten\nlisa.montafon\n45 Min.\nnochmal @x\nAntworten\nkochdu.at\nAutor\n30 Min.\nViel Glück!\nAntworten";
    const r = P(ig, "@kochdu.at");
    assert.strictEqual(r.mode, "instagram"); assert.deepStrictEqual(r.participants, ["@lisa.montafon", "@markus_bludenz"]); assert.strictEqual(r.dupes, 1); assert.strictEqual(r.excluded, 1);
  });
  await t("Doppelte zählen mehrfach, wenn ausgeschaltet", async () => { assert.strictEqual(P("@a\n@a\n@b", "", false).participants.length, 3); });
  await t("Ziehung: verschiedene Positionen, alle im Bereich, gleichmäßig verteilt", async () => {
    for (let i = 0; i < 200; i++) { const x = M._test.drawIndices(10, 4); assert.strictEqual(new Set(x).size, 4); x.forEach(v => assert.ok(v >= 0 && v < 10)); }
    const cnt = new Array(5).fill(0); for (let i = 0; i < 5000; i++) cnt[M._test.drawIndices(5, 1)[0]]++;
    cnt.forEach(c => assert.ok(c > 850 && c < 1150, "Verteilung " + cnt.join("/")));
  });
  await t("Marken aus der Vorlage geladen", async () => {
    const r = await call("GET", "/admin/api/mkt/state"); const j = r.json();
    assert.ok(j.ok); assert.ok(j.brands.find(b => b.key === "kochdu" && b.colors.primary === "#6645ef")); assert.ok(j.brands.length >= 8);
  });
  await t("Zählen per Route", async () => {
    const j = (await call("POST", "/admin/api/mkt/giveaway/parse", { text: "@a\n@b\n@a", exclude: "" })).json();
    assert.strictEqual(j.count, 2); assert.strictEqual(j.dupes, 1);
  });
  await t("Auslosen braucht Bestätigung und genug Teilnahmen", async () => {
    let r = await call("POST", "/admin/api/mkt/giveaway/draw", { brand: "kochdu", text: "@a\n@b\n@c" }); assert.strictEqual(r.code, 400); assert.ok(/Bestätigung/.test(r.json().error));
    r = await call("POST", "/admin/api/mkt/giveaway/draw", { confirm: true, brand: "kochdu", text: "@a\n@b", winners: 2 }); assert.strictEqual(r.code, 400);
    r = await call("POST", "/admin/api/mkt/giveaway/draw", { confirm: true, brand: "gibtsnicht", text: "@a\n@b\n@c" }); assert.strictEqual(r.code, 400);
  });
  let drawId = "";
  await t("Auslosen: Gewinner + Ersatz aus der Liste, Protokoll vollständig", async () => {
    const names = Array.from({ length: 40 }, (_, i) => "@teilnehmer_" + i);
    const r = await call("POST", "/admin/api/mkt/giveaway/draw", { confirm: true, brand: "kochdu", prize: "Gewinn: 50 € Gutschein", text: names.concat(["@teilnehmer_3", "@kochdu.at"]).join("\n"), exclude: "@kochdu.at", winners: 2, backups: 2 });
    const d = r.json().draw; drawId = d.id;
    assert.strictEqual(d.count, 40); assert.strictEqual(d.dupes, 1); assert.strictEqual(d.excluded, 1); assert.strictEqual(d.winners.length, 2); assert.strictEqual(d.backups.length, 2);
    const all = d.winners.concat(d.backups); assert.strictEqual(new Set(all).size, 4); all.forEach(w => assert.ok(names.indexOf(w) > -1));
    assert.ok(/^[0-9a-f]{64}$/.test(d.hash)); assert.ok(!("participants" in d), "Teilnehmerliste geht nicht ans Cockpit zurück");
    const pr = await call("GET", "/admin/api/mkt/giveaway/protocol", null, "?id=" + d.id); const txt = pr.text();
    assert.ok(/GEWINNSPIEL-PROTOKOLL/.test(txt) && txt.indexOf(d.hash) > -1 && txt.indexOf(d.winners[0]) > -1 && /ERSATZGEWINNER/.test(txt) && /crypto\.randomInt/.test(txt));
    assert.ok(/attachment; filename="Gewinnspiel-Protokoll-kochdu-/.test(pr.head["Content-Disposition"]));
  });
  await t("Marke bearbeiten: Farben, Listen, Logo nur als Bild ohne Skript", async () => {
    let j = (await call("POST", "/admin/api/mkt/brand", { key: "kantineur", patch: { colors: { primary: "#112233", dark: "kaputt" }, hashtags: ["#Verein", "#Kassa"], tone: "trocken" } })).json();
    assert.strictEqual(j.brand.colors.primary, "#112233"); assert.strictEqual(j.brand.colors.dark, "#1d2d3d"); assert.deepStrictEqual(j.brand.hashtags, ["#Verein", "#Kassa"]);
    const svgBad = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString("base64");
    let r = await call("POST", "/admin/api/mkt/brand", { key: "kantineur", patch: { logoData: svgBad } }); assert.strictEqual(r.code, 400);
    const svgOk = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><rect width="200" height="50" fill="#123"/></svg>').toString("base64");
    j = (await call("POST", "/admin/api/mkt/brand", { key: "kantineur", patch: { logoData: svgOk } })).json(); assert.ok(j.brand.logoUploaded);
    r = await call("GET", "/admin/api/mkt/logo", null, "?key=kantineur"); assert.strictEqual(r.code, 200); assert.strictEqual(r.head["Content-Type"], "image/svg+xml"); assert.strictEqual(r.head["Content-Security-Policy"], "sandbox");
  });
  if (R.videoReady()) {
    await t("Video: wird erzeugt (MP4 + Titelbild + Standbild), Download mit Teil-Anfragen", async () => {
      for (let i = 0; i < 240; i++) { const s = M._test.state().draws.find(d => d.id === drawId); if (s.video.status === "fertig" || s.video.status === "fehler") break; await new Promise(r => setTimeout(r, 500)); }
      const d = M._test.state().draws.find(x => x.id === drawId); assert.strictEqual(d.video.status, "fertig", d.video.error);
      assert.ok(d.video.duration > 15 && d.video.duration < 40, "Dauer " + d.video.duration);
      const st = fs.statSync(path.join(dir, "marketing", "media", d.video.file)); assert.ok(st.size > 100000);
      const r = res(); const rq = req("GET"); rq.headers.range = "bytes=0-99"; await M.handleAdmin(rq, r, new URL("http://x/admin/api/mkt/giveaway/file?id=" + drawId), "/admin/api/mkt/giveaway/file"); await r.finished;
      assert.strictEqual(r.code, 206); assert.strictEqual(Buffer.concat(r.chunks).length, 100);
      assert.ok(fs.existsSync(path.join(dir, "marketing", "media", d.video.cover)) && fs.existsSync(path.join(dir, "marketing", "media", d.video.poster)));
      assert.ok(!fs.existsSync(path.join(dir, "marketing", "work", drawId)), "Arbeitsordner aufgeräumt");
    });
  } else console.log("  (Video-Test übersprungen – ffmpeg/satori nicht verfügbar)");
  await t("Löschen entfernt Ziehung und Dateien", async () => {
    const r = await call("POST", "/admin/api/mkt/giveaway/delete", { id: drawId }); assert.ok(r.json().ok);
    assert.ok(!M._test.state().draws.find(d => d.id === drawId)); assert.ok(!fs.existsSync(path.join(dir, "marketing", "media", drawId + ".mp4")));
  });
  if (R.ready()) await t("Marken-Looks: jede App rendert alle Vorlagen (Feed + Story, Text- und Hintergrund-Ebene)", async () => {
    const sl = { kicker: "Test", headline: "Ein *Test* mit Umlauten äöü ß €", sub: "Unterzeile", cta: "Los", items: ["Eins", "Zwei", "Drei"], number: "9 €", label: "pro *Monat*", author: "Team", leftTitle: "Alt", leftItems: ["a"], rightTitle: "Neu", rightItems: ["b"] };
    const jpg = "data:image/jpeg;base64," + fs.readFileSync(path.join(ROOT, "mkt-assets", "kochdu", "essen-1.jpg")).toString("base64");
    for (const key of ["kochdu", "kantineur", "blitzdings", "valuero", "skikaiser", "huettengaudi", "druckshop", "fs-creative"]) {
      assert.ok(R.hasSkin(key), key);
      for (const tpl of ["hook", "photo", "list", "compare", "stat", "quote", "cta"]) for (const format of ["feed", "story"]) {
        const b = await R.slidePng(Object.assign({}, sl, { template: tpl, image: tpl === "photo" ? jpg : "" }), { key, name: key, colors: {} }, { format, v: tpl.length, counter: "2/5" });
        assert.ok(b.length > 5000 && b.readUInt32BE(16) === 1080, key + " " + tpl + " " + format);
      }
      const bg = await R.slidePng(Object.assign({}, sl, { template: "hook" }), { key, name: key, colors: {} }, { format: "story", layer: "fg" }); assert.ok(bg.length > 1000);
    }
  });
  await t("Bildersammlung: Grundstock je Marke, eigene Uploads, ausblenden", async () => {
    let j = (await call("GET", "/admin/api/mkt/library", null, "?brand=kochdu")).json(); assert.ok(j.items.length >= 5 && j.items.every(x => x.kind === "photo" && !x.own));
    j = (await call("GET", "/admin/api/mkt/library", null, "?brand=skikaiser")).json(); assert.ok(j.items.some(x => x.kind === "clip"));
    const png = "data:image/png;base64," + fs.readFileSync(path.join(ROOT, "mkt-assets", "blitzdings", "box-mini.png")).toString("base64");
    let r = (await call("POST", "/admin/api/mkt/library", { brand: "kantineur", name: "Tablet Foto.png", data: png })).json(); assert.ok(r.ok && /^u-tablet-foto-/.test(r.id));
    r = await call("POST", "/admin/api/mkt/library", { brand: "kantineur", data: "data:image/gif;base64,R0lGOD" }); assert.strictEqual(r.code, 400);
    const first = (await call("GET", "/admin/api/mkt/library", null, "?brand=kochdu")).json().items[0];
    await call("POST", "/admin/api/mkt/library", { brand: "kochdu", remove: first.id });
    j = (await call("GET", "/admin/api/mkt/library", null, "?brand=kochdu")).json(); assert.ok(!j.items.find(x => x.id === first.id), "ausgeblendet");
    assert.ok(fs.existsSync(path.join(ROOT, "mkt-assets", "kochdu", first.name)), "Grundstock bleibt im Projekt");
  });
  await t("Text einpassen: lange Einzelwörter werden kleiner statt abgeschnitten", async () => {
    const s1 = R.fit("@florian.st.gallenkirch", 770, 2, 112, 40, 0.66), s2 = R.fit("@anna", 770, 2, 112, 40, 0.66);
    assert.ok(s1 < 60, "lang " + s1); assert.strictEqual(s2, 112);
  });

  // ───────────── Verlosung unter kochdu-Registrierungen (kochdu liefert nur Vornamen) ─────────────
  const KQ = [], USERS = [
    { id: "u1", first: "Lisa", at: "2026-09-22T08:00:00Z", verified: true, staff: false }, { id: "u2", first: "Lisa", at: "2026-09-25T08:00:00Z", verified: true, staff: false },
    { id: "u3", first: "Lisa", at: "2026-10-01T08:00:00Z", verified: false, staff: false }, { id: "u4", first: "Markus", full: "Markus Huber", at: "2026-10-02T08:00:00Z", verified: true, staff: false },
    { id: "u5", first: "Simon", at: "2026-10-03T08:00:00Z", verified: true, staff: true }, { id: "u6", first: "Anna", at: "2026-10-10T20:00:00Z", verified: true, staff: false }];
  let OLD_KOCHDU = false;
  const M2 = require(path.join(ROOT, "marketing.js"))({ send, DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "fsc-mkt2-")), ROOT,
    kochdu: async q => { KQ.push(q); const u = new URLSearchParams(q);
      if (u.get("registrant")) { const x = USERS.find(y => y.id === u.get("registrant")); if (!x) throw new Error("Bei kochdu nicht gefunden"); return { ok: true, name: x.first + " Muster", email: x.id + "@example.org" }; }
      if (OLD_KOCHDU) return { ok: true, year: 2026, restaurants: [] };
      return { ok: true, users: USERS.filter(y => y.at >= u.get("from") && y.at < u.get("to")) }; } });
  const call2 = async (method, p, body) => { const r = res(); await M2.handleAdmin(req(method, body), r, new URL("http://x" + p), p); await r.finished; return r; };
  await t("kochdu: Zeitraum in Wiener Zeit, bis-Tag ganz inklusive (Sommer- und Winterzeit)", async () => {
    const r = M2._test.kochduRange({ from: "2026-09-22", to: "2026-10-10" });
    assert.strictEqual(r.start, "2026-09-21T22:00:00.000Z"); assert.strictEqual(r.end, "2026-10-10T22:00:00.000Z");
    assert.strictEqual(M2._test.kochduRange({ from: "2026-11-01", to: "2026-11-01" }).start, "2026-10-31T23:00:00.000Z");
    assert.throws(() => M2._test.kochduRange({ from: "2026-10-10", to: "2026-09-22" }), /Zeitraum/);
  });
  await t("kochdu: Vorschau zählt Registrierungen, Mitarbeiter nie dabei, nur Vornamen in der Antwort", async () => {
    const r = await call2("POST", "/admin/api/mkt/giveaway/kochdu", { from: "2026-09-22", to: "2026-10-10" }), j = r.json();
    assert.strictEqual(j.ok, true, j.error); assert.strictEqual(j.count, 5); assert.strictEqual(j.stats.staff, 1); assert.strictEqual(j.stats.unverified, 1); assert.strictEqual(j.stats.unverifiedOut, 0);
    assert.deepStrictEqual(j.sample, ["Lisa", "Lisa", "Lisa", "Markus Huber", "Anna"]); assert.ok(!/@|u\d/.test(r.text()), "keine E-Mail/ID in der Antwort");
    const v = (await call2("POST", "/admin/api/mkt/giveaway/kochdu", { from: "2026-09-22", to: "2026-10-10", verifiedOnly: true })).json();
    assert.strictEqual(v.count, 4); assert.strictEqual(v.stats.unverifiedOut, 1);
    assert.strictEqual((await call2("POST", "/admin/api/mkt/giveaway/kochdu", { from: "2026-09-22", to: "2026-10-09" })).json().count, 4, "Anna am 10.10. abends Wiener Zeit fällt raus");
  });
  await t("kochdu: Ziehung – gleiche Vornamen bleiben eigene Lose, Protokoll mit Kürzeln statt E-Mail, Kontakt nur für Gewinner", async () => {
    const d = await M2._test.draw({ brand: "kochdu", winners: 1, backups: 2, title: "Wer gewinnt?", source: { type: "kochdu", from: "2026-09-22", to: "2026-10-10" } }); M2._test.queue.length = 0;
    assert.strictEqual(d.count, 5); assert.strictEqual(d.dupes, 0); assert.strictEqual(d.excluded, 1); assert.strictEqual(d.participants.filter(n => n === "Lisa").length, 3);
    assert.strictEqual(new Set(d.codes).size, 5); assert.ok(d.codes.every(c => /^K[0-9A-F]{6}$/.test(c)));
    assert.strictEqual(d.winnerCodes.length, 1); assert.strictEqual(d.backupCodes.length, 2); assert.strictEqual(d.winnerFull.length, 1); assert.ok(d.participants.indexOf("Markus Huber") < 0, "Video/Liste nur mit Vornamen"); assert.strictEqual(d.source.type, "kochdu");
    const pr = M2._test.protocol(d); assert.ok(/alle Registrierungen bei kochdu vom 22\.09\.2026 bis 10\.10\.2026/.test(pr), pr); assert.ok(pr.indexOf("(" + d.winnerCodes[0] + ")") > -1); assert.ok(!/@/.test(pr), "keine E-Mail im Protokoll");
    const pub = (await call2("GET", "/admin/api/mkt/state")).json().draws[0]; assert.ok(!("winnerIds" in pub) && !("codes" in pub)); assert.deepStrictEqual(pub.source, { type: "kochdu", from: "2026-09-22", to: "2026-10-10", verifiedOnly: false });
    const c = (await call2("POST", "/admin/api/mkt/giveaway/contact", { id: d.id, kind: "w", i: 0 })).json(); assert.strictEqual(c.ok, true, c.error); assert.ok(/@example\.org$/.test(c.email)); assert.ok(c.name.indexOf(d.winners[0]) === 0);
    assert.strictEqual((await call2("POST", "/admin/api/mkt/giveaway/contact", { id: d.id, kind: "w", i: 5 })).code, 404);
  });
  await t("kochdu: nur bei der Marke kochdu, verständlicher Hinweis solange kochdu das Update noch nicht hat", async () => {
    await assert.rejects(M2._test.draw({ brand: "blitzdings", source: { type: "kochdu", from: "2026-09-22", to: "2026-10-10" } }), /nur bei der Marke kochdu/);
    OLD_KOCHDU = true; const j = (await call2("POST", "/admin/api/mkt/giveaway/kochdu", { from: "2026-09-22", to: "2026-10-10" })).json(); OLD_KOCHDU = false;
    assert.strictEqual(j.ok, false); assert.ok(/Update/.test(j.error), j.error);
  });

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  console.log("marketing: " + pass + " ok, " + fail + " fehlgeschlagen");
  if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
  process.exit(0);
})();
