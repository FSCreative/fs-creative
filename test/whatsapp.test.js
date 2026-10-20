/* WhatsApp nur lesen (whatsapp.js) gegen die Graph-API-Attrappe (test/wa-mock.js). Aufruf: node test/whatsapp.test.js
   Teil 1 ruft die Routen direkt auf (Ersatz für req/res), Teil 2 startet server.js in einer Temp-Kopie (Verkabelung, Anmeldung, CSP der Verbinden-Seite).
   Geprüft: Webhook-Prüfung (Token richtig/falsch), Signatur (fehlt/falsch/richtig), eingehend, Echo (am Handy gesendet), Verlauf, Kontaktnamen,
   Bearbeiten/Löschen/Reaktion, doppelte Webhooks, Gruppen/fremde Nummer ignoriert, Medien in zwei Schritten (mit Wiederholung, zu groß), Medien ausliefern
   (inline nur Bild/Audio/Video, Teil-Anfragen, Dokumente als Download in Sandbox), Verbinden (Code → Token → subscribed_apps → Nummer → Abgleich je einmal),
   24-Stunden-Fenster, Status ohne App-Geheimnis/Token, Liste/Suche/gelesen, Seiten, Aufbewahrung, Chat löschen, Trennen (behalten/löschen), Push „wa“. */
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process"), crypto = require("crypto");
const { Readable, Writable } = require("stream");
const createMock = require("./wa-mock.js");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const listen = srv => new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));

// kleiner Ersatz für req/res
function mkReq(method, body, headers) { const r = Readable.from(body == null ? [] : [Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]); r.method = method; r.headers = headers || {}; return r; }
function mkRes() {
  const chunks = [], w = new Writable({ write(c, e, cb) { chunks.push(Buffer.from(c)); cb(); } });
  w.code = 0; w.head = {}; w.headersSent = false;
  w.writeHead = (c, h) => { w.code = c; Object.assign(w.head, h || {}); w.headersSent = true; return w; };
  w.setHeader = (k, v) => { w.head[k] = v; };
  w.done = new Promise(r => w.on("finish", r));
  w.buf = () => Buffer.concat(chunks); w.text = () => w.buf().toString("utf8"); w.json = () => JSON.parse(w.text());
  return w;
}
function send(r, code, body, type, headers) { r.writeHead(code, Object.assign({ "Content-Type": type || "text/plain" }, headers || {})); r.end(body == null || body === "" ? undefined : body); }

(async () => {
  const M = createMock(); const mport = await listen(M.server); M.S.base = "http://127.0.0.1:" + mport;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-wa-")), pushes = [];
  const W = require(path.join(ROOT, "whatsapp.js"))({ send, DATA_DIR: dir, secret: "test-secret", graphBase: M.S.base, publicBase: "https://www.fs-creative.at", background: false, push: (topic, msg) => { pushes.push({ topic, msg }); return Promise.resolve(1); } });
  const call = async (method, p, body, qs, headers) => { const r = mkRes(); await W.handleAdmin(mkReq(method, method === "GET" || method === "HEAD" ? null : (body || {}), headers), r, new URL("http://x" + p + (qs || "")), p); await r.done; return r; };
  const get = async (p, qs) => (await call("GET", p, null, qs)).json();
  const post = async (p, body) => { const r = await call("POST", p, body); return Object.assign(r.json(), { _code: r.code }); };
  const hookRaw = async (raw, headers) => { const r = mkRes(); await W.handleWebhook(mkReq("POST", raw, headers || {}), r, new URL("http://x/api/whatsapp/webhook")); await r.done; return r; };
  const sign = raw => "sha256=" + crypto.createHmac("sha256", M.APP_SECRET).update(raw).digest("hex");
  const hook = async (payload) => { const raw = Buffer.from(JSON.stringify(payload)); const r = await hookRaw(raw, { "x-hub-signature-256": sign(raw) }); await W._test.idle(); return r; };
  const envl = (field, value, opt) => ({ object: "whatsapp_business_account", entry: [{ id: (opt && opt.waba) || M.WABA, changes: [{ field, value: Object.assign({ messaging_product: "whatsapp", metadata: { display_phone_number: "436641234567", phone_number_id: (opt && opt.phone) || M.PHONE } }, value) }] }] });
  const ts = (msAgo) => String(Math.floor((Date.now() - (msAgo || 0)) / 1000));
  const KUNDE = "436601112233", KUNDIN = "4915112345678", DAY = 86400000;
  const msgIn = (id, from, extra, name) => envl("messages", { contacts: [{ profile: { name: name || "Max Muster" }, wa_id: from }], messages: [Object.assign({ from, id, timestamp: ts(), type: "text", text: { body: "Hallo Simon, habt ihr noch Termine frei?" } }, extra || {})] });
  const val = x => { const v = Object.assign({}, x.entry[0].changes[0].value); delete v.metadata; delete v.messaging_product; return v; };
  const thread = async id => get("/admin/api/wa/chat", "?id=" + id + "&limit=500");
  const verify = async (tok, ch) => { const r = mkRes(); await W.handleWebhook(mkReq("GET", null), r, new URL("http://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=" + encodeURIComponent(tok) + "&hub.challenge=" + (ch || "1158201444"))); await r.done; return r; };

  await t("Nicht eingerichtet: Status mit Webhook-Adresse und zufälligem Prüf-Token", async () => {
    const s = await get("/admin/api/wa/status");
    assert.strictEqual(s.ok, true); assert.strictEqual(s.configured, false); assert.strictEqual(s.connected, false);
    assert.strictEqual(s.webhookUrl, "https://www.fs-creative.at/api/whatsapp/webhook"); assert.ok(/^[A-Za-z0-9_-]{20,}$/.test(s.verifyToken), s.verifyToken);
    assert.deepStrictEqual(s.fields, ["messages", "smb_message_echoes", "history", "smb_app_state_sync", "account_update"]);
    assert.strictEqual((await get("/admin/api/wa/status")).verifyToken, s.verifyToken, "Prüf-Token bleibt gleich");
  });
  await t("Webhook ohne App-Geheimnis → 503 (Meta versucht es später nochmal)", async () => { assert.strictEqual((await hookRaw(Buffer.from("{}"), { "x-hub-signature-256": "sha256=00" })).code, 503); });
  await t("Einstellungen: Prüfung der Eingaben, Geheimnis verschlüsselt und nie im Status", async () => {
    let r = await post("/admin/api/wa/settings", { appId: "abc" }); assert.strictEqual(r._code, 400); assert.ok(/Ziffern/.test(r.error));
    r = await post("/admin/api/wa/settings", { appSecret: "kurz" }); assert.strictEqual(r._code, 400);
    r = await post("/admin/api/wa/settings", { appId: M.APP_ID, appSecret: M.APP_SECRET, configId: "555666777888" });
    assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.configured, true); assert.strictEqual(r.hasSecret, true); assert.strictEqual(r.appId, M.APP_ID); assert.strictEqual(r.configId, "555666777888");
    assert.ok(JSON.stringify(r).indexOf(M.APP_SECRET) < 0, "Geheimnis nie im Status");
    const raw = fs.readFileSync(path.join(dir, "whatsapp", "settings.json"), "utf8"); assert.ok(raw.indexOf(M.APP_SECRET) < 0, "Geheimnis verschlüsselt gespeichert");
    r = await post("/admin/api/wa/settings", { appId: M.APP_ID }); assert.strictEqual(r.hasSecret, true, "leeres Geheimnis = behalten");
  });
  await t("Webhook-Prüfung (GET): richtiger Token → hub.challenge, falscher → 403", async () => {
    const tok = (await get("/admin/api/wa/status")).verifyToken;
    let r = await verify(tok); assert.strictEqual(r.code, 200); assert.strictEqual(r.text(), "1158201444");
    r = await verify("falsch"); assert.strictEqual(r.code, 403);
    r = await verify(tok, "%3Cscript%3E"); assert.strictEqual(r.code, 403, "Challenge nur als einfache Zeichenkette zurück");
    assert.ok((await get("/admin/api/wa/status")).verifiedAt, "Bestätigung vermerkt");
  });
  await t("Signatur: fehlt / falsch / über andere Daten → 401, richtig → 200", async () => {
    const raw = Buffer.from(JSON.stringify(msgIn("wamid.X0", KUNDE)));
    assert.strictEqual((await hookRaw(raw, {})).code, 401);
    assert.strictEqual((await hookRaw(raw, { "x-hub-signature-256": "sha256=" + "0".repeat(64) })).code, 401);
    assert.strictEqual((await hookRaw(raw, { "x-hub-signature-256": sign(Buffer.from(raw.toString() + " ")) })).code, 401);
    const r = await hookRaw(raw, { "x-hub-signature-256": sign(raw) }); assert.strictEqual(r.code, 200); await W._test.idle();
  });
  await t("Vor dem Verbinden: Webhooks kommen an, werden aber nicht gespeichert (z. B. Test aus dem Meta-Dashboard)", async () => {
    await hook(msgIn("wamid.T1", KUNDE));
    const s = await get("/admin/api/wa/status"); assert.strictEqual(s.chats, 0); assert.ok(s.lastWebhookAt); assert.strictEqual(s.lastWebhookField, "messages"); assert.strictEqual(pushes.length, 0);
  });
  await t("Verbinden: falscher Code → klare Meldung, nichts gespeichert", async () => {
    const r = await post("/admin/api/wa/connect", { code: "falsch", wabaId: M.WABA, phoneNumberId: M.PHONE });
    assert.strictEqual(r.ok, false); assert.ok(/30 Sekunden/.test(r.error), r.error); assert.strictEqual((await get("/admin/api/wa/status")).connected, false);
    assert.strictEqual(M.count("POST", "/v26.0/" + M.WABA + "/subscribed_apps"), 0);
  });
  await t("Verbinden: Code → Token → App abonnieren → Nummer → Kontakte und Verlauf je einmal angefordert", async () => {
    const r = await post("/admin/api/wa/connect", { code: "good-code", wabaId: M.WABA, phoneNumberId: M.PHONE });
    assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.connected, true); assert.strictEqual(r.number, "+43 664 1234567"); assert.strictEqual(r.name, "FS Creative");
    const ex = M.S.calls.filter(c => c.path === "/v26.0/oauth/access_token").pop(); assert.strictEqual(ex.query.client_id, M.APP_ID); assert.strictEqual(ex.query.code, "good-code");
    assert.strictEqual(M.count("POST", "/v26.0/" + M.WABA + "/subscribed_apps"), 1);
    assert.ok(M.S.calls.find(c => c.method === "POST" && /subscribed_apps/.test(c.path)).auth === "Bearer " + M.TOKEN);
    const sync = M.S.calls.filter(c => c.path === "/v26.0/" + M.PHONE + "/smb_app_data");
    assert.deepStrictEqual(sync.map(c => c.body), [{ messaging_product: "whatsapp", sync_type: "smb_app_state_sync" }, { messaging_product: "whatsapp", sync_type: "history" }]);
    assert.ok(!M.S.calls.some(c => /register/.test(c.path)), "nie /register oder deregister");
    assert.ok(r.sync.contacts.requestedAt && r.sync.history.requestedAt && r.sync.windowOpen);
    const s = JSON.stringify(await get("/admin/api/wa/status")); assert.ok(s.indexOf(M.TOKEN) < 0 && s.indexOf(M.APP_SECRET) < 0, "Status ohne Token und Geheimnis");
    assert.ok(fs.readFileSync(path.join(dir, "whatsapp", "settings.json"), "utf8").indexOf(M.TOKEN) < 0, "Token verschlüsselt gespeichert");
  });
  await t("Abgleich nur einmal; nach 24 Stunden gar nicht mehr", async () => {
    let r = await post("/admin/api/wa/sync", { type: "history" }); assert.strictEqual(r._code, 409); assert.ok(/nur einmal/.test(r.error), r.error);
    assert.strictEqual(M.count("POST", "/v26.0/" + M.PHONE + "/smb_app_data"), 2);
    const s = W._test.settings(), keep = s.connectedAt; s.connectedAt = new Date(Date.now() - 25 * 3600e3).toISOString(); s.sync.contacts.requestedAt = "";
    r = await post("/admin/api/wa/sync", { type: "contacts" }); assert.strictEqual(r._code, 409); assert.ok(/24 Stunden/.test(r.error), r.error);
    assert.strictEqual((await get("/admin/api/wa/status")).sync.windowOpen, false);
    s.connectedAt = keep; s.sync.contacts.requestedAt = "x"; assert.strictEqual(M.count("POST", "/v26.0/" + M.PHONE + "/smb_app_data"), 2);
  });
  await t("Eingehende Textnachricht: Chat mit Profilname, ungelesen, Push „wa“", async () => {
    await hook(msgIn("wamid.A1", KUNDE));
    const l = await get("/admin/api/wa/chats"); assert.strictEqual(l.chats.length, 1); const c = l.chats[0];
    assert.strictEqual(c.id, KUNDE); assert.strictEqual(c.name, "Max Muster"); assert.strictEqual(c.number, "+43 660 1112233"); assert.strictEqual(c.unread, 1); assert.strictEqual(l.unread, 1);
    assert.strictEqual(c.last.dir, "in"); assert.ok(/Termine frei/.test(c.last.text));
    await sleep(10); assert.strictEqual(pushes.length, 1); assert.strictEqual(pushes[0].topic, "wa"); assert.strictEqual(pushes[0].msg.title, "WhatsApp: Max Muster"); assert.strictEqual(pushes[0].msg.url, "/admin#chat");
    assert.ok(pushes[0].msg.body.length <= 80);
  });
  await t("Doppelter Webhook (gleiche wamid) → keine doppelte Nachricht, kein zweiter Push", async () => {
    await hook(msgIn("wamid.A1", KUNDE)); const th = await thread(KUNDE);
    assert.strictEqual(th.messages.length, 1); assert.strictEqual(th.chat.unread, 1); await sleep(10); assert.strictEqual(pushes.length, 1);
  });
  await t("Echo (am Handy gesendet) → „out“, Chat gilt als gelesen, kein Push; Zustellstatus", async () => {
    await hook(envl("smb_message_echoes", { message_echoes: [{ from: "436641234567", to: KUNDE, id: "wamid.E1", timestamp: ts(-1000), type: "text", text: { body: "Ja, Donnerstag geht!" } }] }));
    const th = await thread(KUNDE); const e = th.messages.find(m => m.id === "wamid.E1");
    assert.strictEqual(e.dir, "out"); assert.strictEqual(e.text, "Ja, Donnerstag geht!"); assert.strictEqual(th.chat.unread, 0); await sleep(10); assert.strictEqual(pushes.length, 1);
    await hook(envl("messages", { statuses: [{ id: "wamid.E1", status: "read", timestamp: ts(), recipient_id: KUNDE }] }));
    assert.strictEqual((await thread(KUNDE)).messages.find(m => m.id === "wamid.E1").status, "read");
    await hook(envl("messages", { statuses: [{ id: "wamid.E1", status: "delivered", timestamp: ts(), recipient_id: KUNDE }] }));
    assert.strictEqual((await thread(KUNDE)).messages.find(m => m.id === "wamid.E1").status, "read", "Status geht nicht zurück");
  });
  await t("Kontakte-Abgleich: Name aus dem Adressbuch schlägt Profilname, Entfernen nimmt ihn wieder", async () => {
    await hook(envl("smb_app_state_sync", { state_sync: [{ type: "contact", contact: { full_name: "Max Muster (Hotel Alpenrose)", first_name: "Max", phone_number: "+43 660 1112233" }, action: "add", metadata: { timestamp: ts() } }, { type: "contact", contact: { full_name: "Lisa", phone_number: "4366099999" }, action: "add" }] }));
    assert.strictEqual((await get("/admin/api/wa/chats")).chats[0].name, "Max Muster (Hotel Alpenrose)");
    assert.strictEqual((await get("/admin/api/wa/status")).sync.contacts.count, 2);
    await hook(envl("smb_app_state_sync", { state_sync: [{ type: "contact", contact: { phone_number: "4366099999" }, action: "remove" }] }));
    assert.strictEqual((await get("/admin/api/wa/status")).sync.contacts.count, 1);
  });
  await t("Verlauf: Richtung aus from, nicht ungelesen, media_placeholder übersprungen, Fortschritt; Ablehnung in der App", async () => {
    await hook(envl("history", { history: [{ metadata: { phase: 1, chunk_order: 1, progress: 40 }, threads: [{ id: KUNDIN, messages: [
      { from: KUNDIN, id: "wamid.H1", timestamp: ts(30 * DAY), type: "text", text: { body: "Danke für das Angebot!" }, history_context: { status: "READ" } },
      { from: "436641234567", to: KUNDIN, id: "wamid.H2", timestamp: ts(29 * DAY), type: "text", text: { body: "Gerne, melde dich einfach." }, history_context: { status: "READ" } },
      { from: KUNDIN, id: "wamid.H3", timestamp: ts(28 * DAY), type: "media_placeholder" },
      { from: KUNDIN, id: "wamid.H4", timestamp: ts(400 * DAY), type: "text", text: { body: "uralt" } }] }] }] }));
    const th = await thread(KUNDIN);
    assert.deepStrictEqual(th.messages.map(m => [m.id, m.dir]), [["wamid.H1", "in"], ["wamid.H2", "out"]], "Platzhalter und zu Altes nicht übernommen");
    assert.strictEqual(th.messages[1].status, "read"); assert.strictEqual(th.messages[0].hist, 1); assert.strictEqual(th.chat.unread, 0);
    let s = await get("/admin/api/wa/status"); assert.strictEqual(s.sync.history.progress, 40); assert.strictEqual(s.sync.history.phase, 1);
    await hook(envl("history", { history: [{ metadata: { phase: 2, chunk_order: 2, progress: 100 }, threads: [{ id: KUNDIN, messages: [{ from: KUNDIN, id: "wamid.H1", timestamp: ts(30 * DAY), type: "text", text: { body: "Danke für das Angebot!" } }] }] }] }));
    s = await get("/admin/api/wa/status"); assert.strictEqual(s.sync.history.progress, 100); assert.ok(s.sync.history.doneAt); assert.strictEqual((await thread(KUNDIN)).messages.length, 2, "kein Doppel");
    await hook(envl("history", { history: [{ errors: [{ code: 2593109, title: "History sync is turned off by the business from the WhatsApp Business App" }] }] }));
    assert.ok(/nicht freigegeben/.test((await get("/admin/api/wa/status")).sync.history.error));
    await sleep(10); assert.strictEqual(pushes.length, 1, "Verlauf löst keinen Push aus");
  });
  await t("Bearbeiten, Reaktion, Löschen, Antwort-Zitat", async () => {
    await hook(msgIn("wamid.A2", KUNDE, { text: { body: "Um 10 Uhr?" } }));
    await hook(msgIn("wamid.A3", KUNDE, { type: "edit", edit: { original_message_id: "wamid.A2", message: { type: "text", text: { body: "Um 11 Uhr?" } } } }));
    let m = (await thread(KUNDE)).messages.find(x => x.id === "wamid.A2"); assert.strictEqual(m.text, "Um 11 Uhr?"); assert.ok(m.edited);
    await hook(envl("smb_message_echoes", { message_echoes: [{ from: "436641234567", to: KUNDE, id: "wamid.E2", timestamp: ts(), type: "reaction", reaction: { message_id: "wamid.A2", emoji: "👍" } }] }));
    await hook(msgIn("wamid.A4", KUNDE, { type: "reaction", reaction: { message_id: "wamid.E1", emoji: "❤️" } }));
    let th = await thread(KUNDE); assert.deepStrictEqual(th.messages.find(x => x.id === "wamid.A2").reactions, { out: "👍" }); assert.deepStrictEqual(th.messages.find(x => x.id === "wamid.E1").reactions, { in: "❤️" });
    assert.ok(!th.messages.some(x => x.type === "reaction"), "Reaktion keine eigene Blase");
    await hook(msgIn("wamid.A5", KUNDE, { text: { body: "Passt!" }, context: { from: "436641234567", id: "wamid.E1" } }));
    th = await thread(KUNDE); assert.deepStrictEqual(th.messages.find(x => x.id === "wamid.A5").quote, { dir: "out", text: "Ja, Donnerstag geht!" });
    await hook(msgIn("wamid.A6", KUNDE, { type: "revoke", revoke: { original_message_id: "wamid.A5" } }));
    m = (await thread(KUNDE)).messages.find(x => x.id === "wamid.A5"); assert.ok(m.deleted); assert.strictEqual(m.text, "");
    await hook(msgIn("wamid.A7", KUNDE, { type: "revoke", revoke: { original_message_id: "wamid.SPAET" } }));
    await hook(msgIn("wamid.SPAET", KUNDE, { text: { body: "darf nicht mehr auftauchen" } }));
    assert.ok(!(await thread(KUNDE)).messages.some(x => x.id === "wamid.SPAET"), "gelöscht bleibt gelöscht, auch wenn das Original später kommt (und der Platzhalter ist unsichtbar)");
    await hook(msgIn("wamid.R1", "436501234567", { type: "revoke", revoke: { original_message_id: "wamid.NIE" } }));
    assert.ok(!(await get("/admin/api/wa/chats")).chats.some(c => c.id === "436501234567"), "nur Löschen → kein leerer Chat");
  });
  await t("Andere Typen: Standort, Kontakt, Button-Antwort, unbekannt; Gruppen und fremde Nummer/WABA ignoriert", async () => {
    await hook(msgIn("wamid.L1", KUNDE, { type: "location", location: { latitude: 47.0047, longitude: 10.0328, name: "Gaschurn" } }));
    await hook(msgIn("wamid.K1", KUNDE, { type: "contacts", contacts: [{ name: { formatted_name: "Anna Berger" }, phones: [{ phone: "+43 664 555" }] }] }));
    await hook(msgIn("wamid.B1", KUNDE, { type: "interactive", interactive: { type: "button_reply", button_reply: { id: "x", title: "Ja, bitte" } } }));
    await hook(msgIn("wamid.U1", KUNDE, { type: "unsupported", errors: [{ code: 131051 }] }));
    const th = await thread(KUNDE), by = id => th.messages.find(x => x.id === id);
    assert.deepStrictEqual(by("wamid.L1").loc, { lat: 47.0047, lng: 10.0328, name: "Gaschurn", address: "" }); assert.ok(/Anna Berger – \+43 664 555/.test(by("wamid.K1").text));
    assert.strictEqual(by("wamid.B1").text, "Ja, bitte"); assert.strictEqual(by("wamid.U1").type, "unsupported");
    const n = th.messages.length;
    await hook(msgIn("wamid.G1", KUNDE, { group_id: "120363000000000000" }));
    await hook(envl("messages", val(msgIn("wamid.F2", KUNDE)), { phone: "111111" }));
    await hook(envl("messages", val(msgIn("wamid.F3", KUNDE)), { waba: "999" }));
    const after = (await thread(KUNDE)).messages.map(x => x.id); assert.ok(after.indexOf("wamid.G1") < 0 && after.indexOf("wamid.F2") < 0 && after.indexOf("wamid.F3") < 0, after.join());
  });
  let IMG = null;
  await t("Medien: Bild in zwei Schritten geladen (mit Wiederholung), ausgeliefert inline mit nosniff, Teil-Anfrage", async () => {
    IMG = crypto.randomBytes(5000); M.S.media["MEDIA-IMG-1"] = { mime: "image/jpeg", data: IMG }; M.S.failMedia["MEDIA-IMG-1"] = 2;
    await hook(msgIn("wamid.M1", KUNDE, { type: "image", image: { caption: "So soll das Logo aussehen", mime_type: "image/jpeg", sha256: "abc", id: "MEDIA-IMG-1" } }));
    await W._test.media(true);
    const m = (await thread(KUNDE)).messages.find(x => x.id === "wamid.M1");
    assert.strictEqual(m.media.status, "ok", JSON.stringify(m.media)); assert.strictEqual(m.media.size, 5000); assert.strictEqual(m.caption, "So soll das Logo aussehen"); assert.ok(!m.media.mid && !m.media.file, "keine internen Felder ans Cockpit");
    const step2 = M.S.calls.filter(c => c.path === "/media-bin/MEDIA-IMG-1"); assert.strictEqual(step2.length, 3); assert.ok(step2.every(c => c.auth === "Bearer " + M.TOKEN));
    const r = await call("GET", "/admin/api/wa/media", null, "?c=" + KUNDE + "&m=wamid.M1");
    assert.strictEqual(r.code, 200); assert.strictEqual(r.head["Content-Type"], "image/jpeg"); assert.strictEqual(r.head["X-Content-Type-Options"], "nosniff"); assert.ok(/^inline/.test(r.head["Content-Disposition"]));
    assert.ok(r.buf().equals(IMG));
    const rr = mkRes(); await W.handleAdmin(mkReq("GET", null, { range: "bytes=100-199" }), rr, new URL("http://x/admin/api/wa/media?c=" + KUNDE + "&m=wamid.M1"), "/admin/api/wa/media"); await rr.done;
    assert.strictEqual(rr.code, 206); assert.strictEqual(rr.head["Content-Range"], "bytes 100-199/5000"); assert.ok(rr.buf().equals(IMG.slice(100, 200)));
    const files = fs.readdirSync(path.join(dir, "whatsapp", "media")); assert.deepStrictEqual(files, [crypto.createHash("sha256").update(IMG).digest("hex") + ".jpg"]);
    assert.strictEqual(W._test.queue().length, 0);
  });
  await t("Medien: Dokument nur als Download in Sandbox, zu groß → Hinweis, Sprachnachricht", async () => {
    M.S.media["MEDIA-DOC-1"] = { mime: "text/html", data: Buffer.from("<script>alert(1)</script>") };
    M.S.media["MEDIA-BIG-1"] = { mime: "video/mp4", data: Buffer.from("x"), size: 150 * 1024 * 1024 };
    M.S.media["MEDIA-OGG-1"] = { mime: "audio/ogg; codecs=opus", data: Buffer.from("OggS-voice") };
    await hook(msgIn("wamid.D1", KUNDE, { type: "document", document: { filename: "angebot.html", mime_type: "text/html", id: "MEDIA-DOC-1" } }));
    await hook(msgIn("wamid.V1", KUNDE, { type: "video", video: { mime_type: "video/mp4", id: "MEDIA-BIG-1" } }));
    await hook(msgIn("wamid.S1", KUNDE, { type: "audio", audio: { mime_type: "audio/ogg; codecs=opus", id: "MEDIA-OGG-1", voice: true } }));
    await W._test.media(true);
    const th = await thread(KUNDE), by = id => th.messages.find(x => x.id === id);
    assert.strictEqual(by("wamid.V1").media.status, "zu groß"); assert.ok(!M.S.calls.some(c => c.path === "/media-bin/MEDIA-BIG-1"), "zu Großes gar nicht erst geladen");
    assert.strictEqual(by("wamid.S1").voice, true); assert.strictEqual(by("wamid.S1").media.mime, "audio/ogg");
    const d = await call("GET", "/admin/api/wa/media", null, "?c=" + KUNDE + "&m=wamid.D1");
    assert.strictEqual(d.code, 200); assert.strictEqual(d.head["Content-Type"], "application/octet-stream"); assert.ok(/^attachment; filename="angebot\.html"/.test(d.head["Content-Disposition"])); assert.ok(/sandbox/.test(d.head["Content-Security-Policy"]));
    const a = await call("GET", "/admin/api/wa/media", null, "?c=" + KUNDE + "&m=wamid.S1"); assert.strictEqual(a.head["Content-Type"], "audio/ogg"); assert.ok(/^inline/.test(a.head["Content-Disposition"]));
    const dl = await call("GET", "/admin/api/wa/media", null, "?c=" + KUNDE + "&m=wamid.M1&dl=1"); assert.ok(/^attachment/.test(dl.head["Content-Disposition"]));
    assert.strictEqual((await call("GET", "/admin/api/wa/media", null, "?c=" + KUNDE + "&m=wamid.V1")).code, 404);
    assert.strictEqual((await call("GET", "/admin/api/wa/media", null, "?c=../../etc&m=x")).code, 404);
    assert.strictEqual(by("wamid.D1").media.name, "angebot.html");
  });
  await t("Chatliste: Suche nach Name, Nummer und Text; gelesen markieren; Version spart Daten", async () => {
    let l = await get("/admin/api/wa/chats"); assert.deepStrictEqual(l.chats.map(c => c.id), [KUNDE, KUNDIN]);
    assert.strictEqual((await get("/admin/api/wa/chats", "?v=" + l.ver)).same, true);
    assert.deepStrictEqual((await get("/admin/api/wa/chats", "?q=alpenrose")).chats.map(c => c.id), [KUNDE]);
    assert.deepStrictEqual((await get("/admin/api/wa/chats", "?q=" + encodeURIComponent("+49 151"))).chats.map(c => c.id), [KUNDIN]);
    const tx = (await get("/admin/api/wa/chats", "?q=angebot!")).chats; assert.deepStrictEqual(tx.map(c => c.id), [KUNDIN]); assert.ok(/Angebot/.test(tx[0].snip));
    assert.ok((await get("/admin/api/wa/chats")).chats[0].unread > 0);
    assert.ok((await post("/admin/api/wa/read", { id: KUNDE })).ok); l = await get("/admin/api/wa/chats"); assert.strictEqual(l.chats[0].unread, 0); assert.strictEqual(l.unread, 0);
  });
  await t("Verlauf in Seiten: limit + before, „more“", async () => {
    const all = (await thread(KUNDE)).messages, p1 = await get("/admin/api/wa/chat", "?id=" + KUNDE + "&limit=3");
    assert.deepStrictEqual(p1.messages.map(m => m.id), all.slice(-3).map(m => m.id)); assert.strictEqual(p1.more, true);
    const p2 = await get("/admin/api/wa/chat", "?id=" + KUNDE + "&limit=3&before=" + encodeURIComponent(p1.messages[0].id)); assert.deepStrictEqual(p2.messages.map(m => m.id), all.slice(-6, -3).map(m => m.id));
    assert.strictEqual((await call("GET", "/admin/api/wa/chat", null, "?id=123")).code, 404);
  });
  await t("Konto-Ereignis (account_update) wird vermerkt", async () => {
    await hook(envl("account_update", { phone_number: "436641234567", event: "PARTNER_REMOVED" }));
    assert.strictEqual((await get("/admin/api/wa/status")).account.event, "PARTNER_REMOVED");
  });
  await t("Aufbewahrung: alte Nachrichten und ihre Medien weg, leere Chats weg", async () => {
    M.S.media["MEDIA-OLD-1"] = { mime: "image/png", data: crypto.randomBytes(300) };
    await hook(msgIn("wamid.O1", "4369912345", { timestamp: ts(200 * DAY), type: "image", image: { mime_type: "image/png", id: "MEDIA-OLD-1" } }, "Alt Kunde"));
    await W._test.media(true); assert.strictEqual(fs.readdirSync(path.join(dir, "whatsapp", "media")).length, 4);
    const r = W._test.cleanup(Date.now() + 200 * DAY - DAY);   // in ~200 Tagen: Grenze 12 Monate → die 200 Tage alte Nachricht ist dann ~13 Monate alt
    assert.ok(r.removed >= 1); assert.ok(!(await get("/admin/api/wa/chats")).chats.some(c => c.id === "4369912345"), "Chat ohne Nachrichten entfernt");
    assert.ok(!fs.existsSync(path.join(dir, "whatsapp", "chats", "4369912345.json")));
    assert.strictEqual(r.files, 0, "Medien erst nach 10 Min. ohne Bezug gelöscht (laufende Downloads)");
    assert.ok((await thread(KUNDE)).messages.length > 5, "neue bleiben");
    const s = await post("/admin/api/wa/settings", { retentionMonths: 0 }); assert.strictEqual(s._code, 400);
    assert.strictEqual((await post("/admin/api/wa/settings", { retentionMonths: 24 })).retentionMonths, 24);
  });
  await t("Chat löschen nur mit Bestätigung; Datei und nicht mehr benutzte Medien weg", async () => {
    let r = await post("/admin/api/wa/delete", { id: KUNDE }); assert.strictEqual(r._code, 400);
    r = await post("/admin/api/wa/delete", { id: KUNDE, confirm: true }); assert.ok(r.ok);
    assert.deepStrictEqual((await get("/admin/api/wa/chats")).chats.map(c => c.id), [KUNDIN]); assert.ok(!fs.existsSync(path.join(dir, "whatsapp", "chats", KUNDE + ".json")));
    assert.deepStrictEqual(fs.readdirSync(path.join(dir, "whatsapp", "media")), [], "Medien ohne Chat gelöscht");
  });
  await t("Trennen: Bestätigung nötig, Zugang weg, Daten behalten oder löschen; danach wird nichts mehr gespeichert", async () => {
    let r = await post("/admin/api/wa/disconnect", {}); assert.strictEqual(r._code, 400);
    r = await post("/admin/api/wa/disconnect", { confirm: true }); assert.strictEqual(r.connected, false); assert.strictEqual(r.chats, 1, "Daten behalten");
    assert.strictEqual(M.count("DELETE", "/v26.0/" + M.WABA + "/subscribed_apps"), 1); assert.ok(!M.S.calls.some(c => /register/.test(c.path)));
    await hook(msgIn("wamid.N1", KUNDE)); assert.strictEqual((await get("/admin/api/wa/status")).chats, 1);
    r = await post("/admin/api/wa/connect", { code: "good-code-2" }); assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.wabaId, M.WABA, "WABA aus dem Token"); assert.strictEqual(r.phoneNumberId, M.PHONE, "Nummer aus dem Konto");
    r = await post("/admin/api/wa/disconnect", { confirm: true, deleteData: true }); assert.strictEqual(r.chats, 0); assert.deepStrictEqual(fs.readdirSync(path.join(dir, "whatsapp", "chats")), []);
    assert.strictEqual(r.hasSecret, true, "App-Daten bleiben");
  });

  // ───────── Teil 2: Verkabelung in server.js ─────────
  const SECRET = "test-secret", COOKIE = "fsadmin=" + encodeURIComponent((v => v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("hex"))("s1." + Date.now()));
  const app = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-wa-srv-"));
  fs.readdirSync(ROOT, { withFileTypes: true }).forEach(e => { if (e.isFile() && /\.(js|json|html|css|xml|txt|webmanifest|png)$/i.test(e.name)) fs.copyFileSync(path.join(ROOT, e.name), path.join(app, e.name)); });
  const cpDir = d => { if (!fs.existsSync(path.join(ROOT, d))) return; fs.mkdirSync(path.join(app, d), { recursive: true }); fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach(e => { if (e.isDirectory()) cpDir(path.join(d, e.name)); else fs.copyFileSync(path.join(ROOT, d, e.name), path.join(app, d, e.name)); }); };
  ["admin-cockpit", "logos", "print"].forEach(cpDir);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(app, "node_modules"), "dir");
  const port = 7400 + Math.floor(Math.random() * 500), e = Object.assign({}, process.env, { PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x", WA_APP_ID: M.APP_ID, WA_APP_SECRET: M.APP_SECRET, WA_CONFIG_ID: "555666777888", WA_VERIFY_TOKEN: "pruef-token-123", WA_GRAPH_BASE: M.S.base });
  ["BLITZDINGS_STATS_URL", "BLITZDINGS_STATS_TOKEN", "RAILWAY_API_TOKEN", "CF_API_TOKEN", "ANTHROPIC_API_KEY", "DATABASE_URL", "SEVDESK_API_KEY", "MAIL_API_URL", "MAIL_API_TOKEN"].forEach(k => delete e[k]);
  const srv = cp.spawn(process.execPath, ["server.js"], { cwd: app, env: e, stdio: ["ignore", "pipe", "pipe"] }); srv.out = ""; srv.stdout.on("data", d => (srv.out += d)); srv.stderr.on("data", d => (srv.out += d));
  const B = "http://127.0.0.1:" + port; for (let i = 0; i < 100; i++) { try { await fetch(B + "/admin/login"); break; } catch (er) { await sleep(100); } }
  try {
    await t("Server: Webhook-Route öffentlich (Prüfung + Signatur), Admin-API nur angemeldet, Status aus Railway-Variablen ohne Geheimnis", async () => {
      let r = await fetch(B + "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=pruef-token-123&hub.challenge=4242"); assert.strictEqual(r.status, 200); assert.strictEqual(await r.text(), "4242");
      r = await fetch(B + "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nein&hub.challenge=4242"); assert.strictEqual(r.status, 403);
      const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
      r = await fetch(B + "/api/whatsapp/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: raw }); assert.strictEqual(r.status, 401);
      r = await fetch(B + "/api/whatsapp/webhook", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sign(Buffer.from(raw)) }, body: raw }); assert.strictEqual(r.status, 200);
      r = await fetch(B + "/admin/api/wa/status", { redirect: "manual" }); assert.strictEqual(r.status, 302);
      const s = await (await fetch(B + "/admin/api/wa/status", { headers: { cookie: COOKIE } })).json();
      assert.strictEqual(s.configured, true); assert.strictEqual(s.fromEnv.appSecret, true); assert.strictEqual(s.verifyToken, "pruef-token-123"); assert.ok(s.lastWebhookAt);
      assert.ok(JSON.stringify(s).indexOf(M.APP_SECRET) < 0);
    });
    await t("Server: Verbinden-Seite mit eigener CSP (Facebook-SDK mit Nonce), nur angemeldet; Cockpit lädt zwa.js; Push-Thema „wa“", async () => {
      let r = await fetch(B + "/admin/wa/connect", { redirect: "manual" }); assert.strictEqual(r.status, 302);
      r = await fetch(B + "/admin/wa/connect", { headers: { cookie: COOKIE } }); assert.strictEqual(r.status, 200);
      const csp = r.headers.get("content-security-policy"), html = await r.text(), nonce = (csp.match(/'nonce-([^']+)'/) || [])[1];
      assert.ok(nonce && /script-src 'nonce-[^']+' https:\/\/connect\.facebook\.net/.test(csp) && /frame-ancestors 'none'/.test(csp), csp);
      assert.ok(html.indexOf('nonce="' + nonce + '"') > -1 && /whatsapp_business_app_onboarding/.test(html) && /555666777888/.test(html) && /WA_EMBEDDED_SIGNUP/.test(html));
      assert.ok(!/<script(?![^>]*nonce=)/.test(html), "jedes Skript mit Nonce"); assert.ok(html.indexOf(M.APP_SECRET) < 0);
      const ck = await (await fetch(B + "/admin", { headers: { cookie: COOKIE } })).text(); assert.ok(/zwa\.js/.test(ck) && /zchat\.js/.test(ck));
      assert.ok(/T = \["mail", "lead", "fin", "chat", "mkt", "wa"\]/.test(fs.readFileSync(path.join(ROOT, "server.js"), "utf8")), "Push-Thema wa am Server erlaubt");
      assert.ok(/\["wa","WhatsApp/.test(fs.readFileSync(path.join(ROOT, "admin-cockpit", "zpush.js"), "utf8")), "Thema wa im Push-Dialog");
    });
  } finally { srv.kill(); M.server.close(); }
  try { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(app, { recursive: true, force: true }); } catch (er) {}
  console.log(fails.join("\n")); console.log("WhatsApp: " + pass + " bestanden, " + fail + " fehlgeschlagen");
  if (fail) console.log(srv.out.slice(-2000));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
