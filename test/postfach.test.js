/* Postfach im Browser (post.js / post-extra.js): Unterhaltungen nur bei Unterhaltungs-Zeilen, Rückgängig/Fehler beim Verschieben, Verschieben-Menü,
   Sortieren, Auswahl nur Sichtbares, Suche (Befehle, Markierung, doppelte Gmail-Treffer), Papierkorb (endgültig mit Verzögerung, leeren am Server),
   Tastatur mit Auswahl, Absender-Gruppen. Mail-Dienst wird im Browser simuliert (page.route), alle Daten fiktiv.
   Aufruf: PLAYWRIGHT_CORE=<pfad>/playwright-core node test/postfach.test.js   (ohne playwright-core: übersprungen) */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const SECRET = "test-secret";
const COOKIE_VAL = encodeURIComponent((v => v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("hex"))("s1." + Date.now()));
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }
let pw; try { pw = require(process.env.PLAYWRIGHT_CORE || "playwright-core"); } catch (e) { console.log("postfach: playwright-core nicht gefunden – übersprungen (PLAYWRIGHT_CORE=<pfad> setzen)"); process.exit(0); }
function copyApp() {   // gleiche Dateien wie test/offers.test.js
  const src = fs.readFileSync(path.join(__dirname, "offers.test.js"), "utf8"), list = JSON.parse(src.match(/\[("server\.js"[^\]]+)\]/)[0]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-post-"));
  list.forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  fs.mkdirSync(path.join(dir, "admin-cockpit")); fs.readdirSync(path.join(ROOT, "admin-cockpit")).forEach((f) => fs.copyFileSync(path.join(ROOT, "admin-cockpit", f), path.join(dir, "admin-cockpit", f)));
  if (fs.existsSync(path.join(ROOT, "fonts"))) fs.cpSync(path.join(ROOT, "fonts"), path.join(dir, "fonts"), { recursive: true });
  return dir;
}
const H = 3600e3, now = Date.now(), iso = (ms) => new Date(now - ms).toISOString();
const MSGS = [
  { id: "m1", uid: 1, folder: "INBOX", from: "anna@kunde.test", fromName: "Anna Muster", to: "me@fs.test", subject: "Angebot Website", messageId: "<a1@kunde.test>", date: iso(5 * H), read: false, preview: "Hallo, bitte um ein Angebot" },
  { id: "m2", uid: 2, folder: "Sent", from: "me@fs.test", to: "anna@kunde.test", toName: "Anna Muster", subject: "Re: Angebot Website", messageId: "<a2@fs.test>", inReplyTo: "<a1@kunde.test>", date: iso(4 * H), read: true },
  { id: "m3", uid: 3, folder: "INBOX", from: "anna@kunde.test", fromName: "Anna Muster", to: "me@fs.test", subject: "Re: Angebot Website", messageId: "<a3@kunde.test>", inReplyTo: "<a2@fs.test>", date: iso(3 * H), read: false, preview: "Danke, passt so" },
  { id: "m4", uid: 4, folder: "INBOX", from: "noreply@shop.test", fromName: "Shop", subject: "Ihre Bestellung", messageId: "<o1@shop.test>", date: iso(50 * H), read: true },
  { id: "m5", uid: 5, folder: "INBOX", from: "noreply@shop.test", fromName: "Shop", subject: "Ihre Bestellung", messageId: "<o2@shop.test>", date: iso(26 * H), read: true },
  { id: "m6", uid: 6, folder: "INBOX", from: "bob@firma.test", fromName: "Bob Beispiel", subject: "Einladung Straßenfest", messageId: "<s1@firma.test>", date: iso(70 * H), read: true, preview: "Am Samstag in der Hauptstraße" },
  { id: "m7", uid: 7, folder: "Kunden", from: "anna@kunde.test", fromName: "Anna Muster", subject: "Rechnung Oktober", messageId: "<r1@kunde.test>", date: iso(120 * H), read: true },
  { id: "m8", uid: 8, folder: "Trash", from: "alt@alt.test", fromName: "Alt", subject: "Alte Mail", messageId: "<x1@alt.test>", date: iso(200 * H), read: true },
  { id: "m9", uid: 9, folder: "INBOX", from: "zed@z.test", fromName: "Zed", subject: "Ohne Datum", messageId: "<z1@z.test>", date: "", read: true }
];
const FOLDERS = [{ path: "INBOX", name: "Posteingang", delim: "/", total: 6 }, { path: "Archiv", name: "Archiv", special: "\\Archive", delim: "/", total: 0 }, { path: "Kunden", name: "Kunden", delim: "/", total: 1 },
  { path: "Kunden/Alt", name: "Alt", delim: "/", total: 0 }, { path: "Sent", name: "Gesendet", special: "\\Sent", delim: "/" }, { path: "Trash", name: "Papierkorb", special: "\\Trash", delim: "/", total: 7 }, { path: "Junk", name: "Spam", special: "\\Junk", delim: "/", total: 0 }]
  .map((f) => Object.assign({ account: "fs", unread: 0 }, f));

(async () => {
  const dir = copyApp(), port = 5300 + Math.floor(Math.random() * 300);
  const env = Object.assign({}, process.env, { PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x" });
  ["BLITZDINGS_STATS_URL", "BLITZDINGS_STATS_TOKEN", "BLITZDINGS_COCKPIT_URL", "BLITZDINGS_COCKPIT_TOKEN", "RAILWAY_API_TOKEN", "CF_API_TOKEN", "MAIL_API_URL", "ANTHROPIC_API_KEY", "SEVDESK_API_KEY"].forEach((k) => delete env[k]);
  const srv = cp.spawn(process.execPath, ["server.js"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
  let srvOut = ""; srv.stdout.on("data", (d) => (srvOut += d)); srv.stderr.on("data", (d) => (srvOut += d));
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 80; i++) { try { await fetch(base + "/admin/login"); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  const browser = await pw.chromium.launch({ channel: "chrome", headless: true });
  const errors = [], actions = [], folderOps = []; let failNext = false, searchHits = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([{ name: "fsadmin", value: COOKIE_VAL, url: base }]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
    const J = (route, o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    await page.route("**/admin/api/mail**", (route) => {
      const u = new URL(route.request().url()), p = u.pathname, body = route.request().postData();
      if (p === "/admin/api/mail") return u.searchParams.get("etag") ? J(route, { same: true }) : J(route, { messages: MSGS, folders: FOLDERS, accounts: [{ key: "fs", label: "FS", user: "me@fs.test", primary: true, configured: true, ok: true }], account: "me@fs.test", fetchedAt: new Date().toISOString(), etag: "e1" });
      if (p === "/admin/api/mail-action") { actions.push(JSON.parse(body)); if (failNext) { failNext = false; return J(route, { ok: false, error: "simuliert" }); } return J(route, { ok: true }); }
      if (p === "/admin/api/mail-folder") { const b = JSON.parse(body); folderOps.push(b); return J(route, b.op === "empty" ? { ok: true, deleted: 7 } : b.op === "create" ? { ok: true, path: b.name } : { ok: true }); }
      if (p === "/admin/api/mail-search") return J(route, { ok: true, messages: searchHits });
      return J(route, { ok: false, error: "nicht simuliert" });
    });
    const ev = (fn, a) => page.evaluate(fn, a);
    const rows = () => page.$$eval("#mlistS .mrow2", (els) => els.map((e) => e.getAttribute("data-mid")));
    const toast = () => page.textContent("#toast");
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const shot = async (n) => { if (process.env.POST_SHOT) await page.screenshot({ path: process.env.POST_SHOT.replace(/\.png$/, "-" + n + ".png") }); };
    await page.goto(base + "/admin#post");
    await page.waitForSelector('#mlistS .mrow2[data-mid="m3"]', { timeout: 20000 });

    await t("Liste: breite Spalte, Unterhaltung nach letzter Aktivität, noreply-Betreffe nicht zusammengefasst, ungültiges Datum zuletzt", async () => {
      const w = await page.$eval(".mlistp", (e) => e.getBoundingClientRect().width); assert.ok(w >= 420, "Listenbreite " + w);
      const r = await rows(); assert.deepStrictEqual(r, ["m3", "m5", "m4", "m6", "m9"], r.join(","));
      assert.ok(/3/.test(await page.textContent('.mrow2[data-mid="m3"] .thn')), "Unterhaltung mit 3 Mails (inkl. Gesendet)");
      assert.ok(!(await page.$('.mrow2[data-mid="m5"] .thn')), "noreply: kein Zusammenfassen über den Betreff");
    });
    await t("Unterhaltung: zugeklappte Zeile nimmt alles mit, Suche/aufgeklappte Mail nur genau diese; Rückgängig", async () => {
      await ev(() => { FSC.UI.mthOpen = null; FSC.M.trash(["m3"]); });
      assert.deepStrictEqual(await ev(() => ["m1", "m3"].map((id) => FSC.M.find(id).deleted)), [true, true]);
      assert.ok(/Unterhaltung \(2 Mails\) gelöscht/.test(await toast()), await toast());
      await ev(() => FSC.M.undoLast()); assert.deepStrictEqual(await ev(() => ["m1", "m3"].map((id) => !!FSC.M.find(id).deleted)), [false, false]);
      await ev(() => { FSC.UI.mq = "Angebot"; FSC.render(); FSC.M.trash(["m3"]); });
      assert.deepStrictEqual(await ev(() => ["m1", "m3"].map((id) => !!FSC.M.find(id).deleted)), [false, true], "Suche: nur die gewählte Mail");
      await ev(() => { FSC.M.undoLast(); FSC.UI.mq = ""; FSC.render(); });
      await page.click('.mrow2[data-mid="m3"]'); await page.waitForSelector(".mthbar");
      assert.ok(/Ganze Unterhaltung \(3\)/.test(await page.textContent(".mthbar"))); await shot("thread");
      assert.ok(await page.$('.mrow2.thc[data-mid="m1"]'), "ältere Mail aufgeklappt");
      const n0 = actions.length; await ev(() => FSC.M.archive(["m1"])); await wait(150);
      const a = actions.slice(n0).find((x) => x.op === "move"); assert.ok(a, "move gesendet"); assert.deepStrictEqual(a.items.map((i) => i.uid), [1]); assert.strictEqual(a.target, "Archiv");
      assert.ok(/^Mail archiviert/.test(await toast()) && /Rückgängig/.test(await toast()), await toast());
    });
    await t("Verschieben: Fehler am Mailserver → Mail wieder am alten Platz, nichts mehr unterwegs", async () => {
      failNext = true; await ev(() => FSC.M.moveMessages(["m6"], "Kunden", "move")); await wait(300);
      assert.deepStrictEqual(await ev(() => [FSC.M.find("m6").folder, !!(FSC.M.ov.m6 && "folder" in FSC.M.ov.m6)]), ["INBOX", false]);
      assert.ok(await page.$('#mlistS .mrow2[data-mid="m6"]'), "wieder in der Liste");
    });
    await t("Verschieben-Menü: am Knopf, Suchfeld mit Fokus, Enter = erster Treffer, Unterordner „Eltern › Kind“, zuletzt verwendet", async () => {
      await ev(() => { FSC.UI.msel = null; FSC.render(); });
      await page.hover('.mrow2[data-mid="m6"]'); const bb = await page.$eval('[data-act="mqa:move|m6"]', (e) => { const r = e.getBoundingClientRect(); return [r.left, r.bottom]; });
      await page.click('[data-act="mqa:move|m6"]'); await page.waitForSelector(".mmv");
      const box = await page.$eval(".mmv", (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top]; });
      assert.ok(box[0] > 300 && Math.abs(box[0] - Math.min(bb[0], 1440 - 326)) < 40, "neben dem Knopf statt am linken Rand: " + box + " / " + bb);
      assert.strictEqual(await ev(() => document.activeElement && document.activeElement.className), "mmv-q");
      assert.ok(/Kunden › Alt|Kunden ›/.test(await page.textContent(".mmv-l")), "Unterordner als Eltern › Kind"); await shot("move");
      await page.keyboard.type("kund"); const first = await page.textContent(".mmv-i.on"); assert.ok(/Kunden/.test(first), first);
      const n0 = actions.length; await page.keyboard.press("Enter"); await wait(150);
      assert.ok(!(await page.$(".mmv")), "Menü zu"); const a = actions.slice(n0).find((x) => x.op === "move"); assert.strictEqual(a.target, "Kunden");
      assert.deepStrictEqual(await ev(() => FSC.ls("fsc_mmove_recent").fs[0]), "Kunden");
      assert.ok(/verschoben nach „Kunden“/.test(await toast()) && /Rückgängig/.test(await toast()), await toast());
      await page.keyboard.press("v");   // ohne offene Mail und Auswahl: nichts
      assert.ok(!(await page.$(".mmv")));
      await ev(() => { delete FSC.M.ov.m6; FSC.M.find("m6").folder = "INBOX"; FSC.M.lastUndo = null; FSC.M.changed(); FSC.render(); });   // Mock-Server kennt keine Verschiebung
    });
    await t("Sortieren je Ordner: älteste zuerst, gemerkt; ohne Datum bleibt hinten", async () => {
      await page.click('.mlh [data-act="msortm"]'); await page.click('.mctx button:has-text("älteste zuerst")'); await wait(100);
      const r = await rows(); assert.strictEqual(r[r.length - 1], "m9", r.join(",")); assert.strictEqual(r[0], "m6", r.join(","));
      assert.strictEqual(await ev(() => FSC.ls("fsc_msort").inbox), "old");
      await page.click('.mlh [data-act="msortm"]'); await page.click('.mctx button:has-text("neueste zuerst")'); await wait(100);
      assert.strictEqual((await rows())[0], "m3");
    });
    await t("Auswahl: Suche kürzt die Auswahl, Markierung trotz ß, Befehle in:/ist:, doppelte Gmail-Treffer zusammen", async () => {
      await ev(() => { FSC.M.togglePick("m4"); }); assert.ok(/1 ausgewählt/.test(await page.textContent(".mbulk")));
      searchHits = [Object.assign({}, MSGS[5], { id: "g6", uid: 66, folder: "[Gmail]/Alle Nachrichten", lite: true })];
      await page.fill("#msearch", "strasse"); await wait(900);
      assert.deepStrictEqual(await ev(() => FSC.M.selectedIds()), []); assert.ok(!(await page.$(".mbulk")), "keine Auswahl-Leiste für Unsichtbares");
      assert.deepStrictEqual(await rows(), ["m6"], "Gmail-Kopie zusammengefasst"); await shot("search");
      assert.ok(/Posteingang · /.test(await page.textContent('.mrow2[data-mid="m6"] .tag.grey')), "Ordner zusammen angezeigt");
      assert.deepStrictEqual(await page.$$eval('.mrow2[data-mid="m6"] mark', (e) => e.map((x) => x.textContent)), ["Straße", "straße"], "Betreff und Vorschau markiert");
      if (process.env.PDEBUG) console.log("DBG2", await page.$$eval(".msinfo>*", (e) => e.map((x) => x.tagName + "." + x.className + ":" + Math.round(x.getBoundingClientRect().height) + "/" + getComputedStyle(x).display)).then((x) => x.join(" ")), await page.$eval(".msinfo", (e) => getComputedStyle(e).display + " " + getComputedStyle(e).flexWrap + " " + e.outerHTML.slice(0, 300)));
      const mh = await page.$$eval(".msinfo", (e) => e[0].getBoundingClientRect().height); assert.ok(mh < 34, "Trefferzeile einzeilig: " + mh);
      await page.fill("#msearch", "in:kunden"); await wait(400); assert.deepStrictEqual(await rows(), ["m7"]);
      await page.fill("#msearch", "ist:ungelesen von:anna"); await wait(400); assert.deepStrictEqual(await rows(), ["m1"], "m3 ist durchs Öffnen gelesen");
      await page.fill("#msearch", "Bestellung"); await wait(400); await page.click('[data-act="msrall"]');
      assert.deepStrictEqual((await ev(() => FSC.M.selectedIds())).sort(), ["m4", "m5"]);
      await page.press("#msearch", "Escape"); await wait(200); assert.strictEqual(await ev(() => FSC.UI.msr), null);
      if (process.env.PDEBUG) console.log("DBG", await ev(() => JSON.stringify({ mq: FSC.UI.mq, f: FSC.UI.mf, filt: FSC.UI.mfilt, ids: FSC.M.viewIds(), h: document.querySelector(".msinfo") ? 1 : 0 })));
    });
    await t("Tastatur: Auswahl ohne offene Mail – # löscht, z holt zurück, ⇧I gelesen, ⌘A wählt alle", async () => {
      await ev(() => { FSC.UI.mpick = {}; FSC.UI.msel = null; FSC.M.togglePick("m6"); }); await page.click(".mlh-t");
      await page.keyboard.press("#"); assert.strictEqual(await ev(() => !!FSC.M.find("m6").deleted), true);
      await page.keyboard.press("z"); assert.strictEqual(await ev(() => !!FSC.M.find("m6").deleted), false);
      await ev(() => FSC.M.togglePick("m3")); await page.keyboard.press("Shift+I"); assert.strictEqual(await ev(() => FSC.M.find("m3").read), true);
      await page.keyboard.press("Escape"); assert.deepStrictEqual(await ev(() => FSC.M.selectedIds()), []);
      await page.keyboard.press("Control+a"); assert.strictEqual((await ev(() => FSC.M.selectedIds())).length, 5);
      await page.keyboard.press("Escape");
    });
    await t("Rechtsklick: Absender-Aktionen und Regel aus dieser Mail", async () => {
      await page.click('.mrow2[data-mid="m6"]', { button: "right" }); const txt = await page.textContent(".mctx");
      assert.ok(/Alle von Bob Beispiel auswählen/.test(txt) && /Alle von Bob Beispiel löschen/.test(txt) && /Regel aus dieser Mail/.test(txt), txt);
      await page.$eval('.mctx button:has-text("Regel aus dieser Mail")', (b) => b.click());   // langes Menü: nicht scrollen lassen await page.waitForSelector("#mrBox [data-mrc=from]");
      assert.strictEqual(await page.inputValue("#mrBox [data-mrc=from]"), "bob@firma.test"); await ev(() => FSC.closeModal());
    });
    await t("Nach Absender gruppieren: Gruppen mit Anzahl, aufklappbar", async () => {
      await page.click('.mlh [data-act="mgroup"]'); await page.waitForSelector(".msg");
      const g = await page.$$eval(".msg-h", (e) => e.map((x) => x.textContent)); assert.ok(g.some((x) => /Shop.*2/.test(x)), g.join("|"));
      assert.ok(!(await page.$('.mrow2[data-mid="m4"]')), "zugeklappt"); await page.click('.msg-h:has-text("Shop")'); assert.ok(await page.$('.mrow2[data-mid="m4"]')); await shot("group");
      await page.click('.mlh [data-act="mgroup"]');
    });
    await t("Papierkorb: Herkunft gemerkt, Leiste mit Wiederherstellen/Endgültig, endgültig mit 5 s Rückgängig, Leeren am Server mit Anzahl", async () => {
      await ev(() => FSC.M.trash(["m7"])); assert.strictEqual(await ev(() => FSC.M.trashedFrom(FSC.M.find("m7"))), "Kunden");
      await ev(() => FSC.M.undoLast());
      await ev(() => FSC.actions.mfolder("trash")); await page.waitForSelector('.mrow2[data-mid="m8"]');
      await ev(() => FSC.M.togglePick("m8")); const bar = await page.textContent(".mbulk");
      assert.ok(/Wiederherstellen/.test(bar) && /Endgültig löschen/.test(bar) && !/Archivieren/.test(bar) && !/Spam/.test(bar), bar);
      await ev(() => { FSC.UI.mpick = {}; FSC.M.purge(["m8"]); });
      assert.ok(!(await ev(() => document.getElementById("modalHost").innerHTML)), "keine Rückfrage für eine Mail");
      assert.ok(!(await page.$('.mrow2[data-mid="m8"]')), "ausgeblendet"); assert.ok(/Endgültig löschen/.test(await toast()));
      const n0 = actions.length; await ev(() => FSC.M.undoLast()); await wait(100); assert.ok(await page.$('.mrow2[data-mid="m8"]'), "zurück"); assert.strictEqual(actions.length, n0, "nichts gesendet");
      await page.click('[data-act="mempty"]'); const q = await page.textContent("#modalHost h2"); assert.ok(/7 Mails werden endgültig gelöscht/.test(q), q);
      await page.click("#cfOk"); await wait(200); assert.ok(folderOps.some((o) => o.op === "empty" && o.path === "Trash"));
      await ev(() => FSC.actions.mfolder("inbox"));
    });
    await t("Handy: Liste ohne Fehler, Wischgesten-Einstellung, Verschieben als Blatt", async () => {
      await page.setViewportSize({ width: 390, height: 844 }); await ev(() => FSC.render()); await wait(200);
      await ev(() => FSC.actions.mswipecfg()); await page.selectOption('[data-mswcfg="l"]', "archive");
      assert.deepStrictEqual(await ev(() => FSC.ls("fsc_mswipe")), { l: "archive", r: "read" }); await ev(() => FSC.closeModal());
      await shot("mobile"); await ev(() => FSC.M.showMoveMenu(10, 10, ["m6"])); assert.ok(await page.$(".mmv.sheet")); await wait(350); await shot("mobile-move"); await page.keyboard.press("Escape"); assert.ok(!(await page.$(".mmv")));
      await page.setViewportSize({ width: 1440, height: 900 });
    });
  } finally { await browser.close(); srv.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  await t("keine JS-Fehler", async () => assert.deepStrictEqual(errors, []));
  console.log("postfach: " + pass + " bestanden, " + fail + " fehlgeschlagen");
  if (fail) { console.log(fails.map((f) => "✗ " + f).join("\n")); console.log(srvOut.slice(-800)); process.exit(1); }
})();
