/* Website-Chat (chat.js, chat-widget.js, admin-cockpit/zchat.js) gegen eine Attrappe der Anthropic-API (ANTHROPIC_BASE_URL, nur im Test).
   Aufruf: node test/chat.test.js   – server.js läuft in einer Temp-Kopie ohne Datenbank (Dateispeicher), echte Dienste werden nie angesprochen.
   Geprüft: Overlay auf allen öffentlichen Seiten, Unterhaltung starten, Besucher-Nachricht, Cockpit sieht sie, Antwort, Besucher pollt die Antwort,
   Online/Offline + Ablauf des Herzschlags, KI-Antwort offline (Sonnet, max_tokens 400, kurzer Verlauf), Lead-Anlage, KI schweigt wenn Simon schreibt,
   KI-Limit je Unterhaltung, Rate-Limit, Validierung (ID, Länge, JSON, Herkunft, Honeypot), Text bleibt Text (XSS), Admin-Schutz, Beenden/Löschen. */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto"), http = require("http");

const ROOT = path.join(__dirname, "..");
const SECRET = "test-secret";
const COOKIE = "fsadmin=" + encodeURIComponent((v => v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("hex"))("s1." + Date.now()));
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const end = Date.now() + (ms || 6000); let v; while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(120); } return v; }

// ── Attrappe der Anthropic Messages API (gestreamt wie das SDK es erwartet) ──
function anthropicMock() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let b = ""; req.on("data", c => (b += c)); req.on("end", () => {
      let body = {}; try { body = JSON.parse(b || "{}"); } catch (e) {}
      calls.push({ url: req.url, headers: req.headers, body });
      const msgs = body.messages || [], lastUser = [].concat(msgs).reverse().find(m => m.role === "user") || { content: "" };
      const txt = typeof lastUser.content === "string" ? lastUser.content : (lastUser.content || []).map(x => x.text || "").join(" ");
      const out = /@/.test(txt)
        ? { reply: "Danke, Max! Ich habe alles für Simon notiert.", name: "Max Muster", email: "max@example.com", phone: "", request: "Neue Website für eine Tischlerei in Schruns.", topic: "Website", ready: true }
        : { reply: "Gerne! Wie heißt du und wie kann Simon dich erreichen? <b>kein HTML</b>", name: "", email: "", phone: "", request: /website/i.test(txt) ? "Neue Website" : "", topic: "Website", ready: false };
      const text = JSON.stringify(out), usage = { input_tokens: 812, output_tokens: 64 };
      if (!body.stream) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage })); }
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      const ev = (type, data) => res.write("event: " + type + "\ndata: " + JSON.stringify(Object.assign({ type }, data)) + "\n\n");
      ev("message_start", { message: { id: "msg_1", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: usage.input_tokens, output_tokens: 1 } } });
      ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: text.slice(0, 20) } });
      ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: text.slice(20) } });
      ev("content_block_stop", { index: 0 });
      ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: usage.output_tokens } });
      ev("message_stop", {});
      res.end();
    });
  });
  return { server, calls };
}

function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-chat-"));
  fs.readdirSync(ROOT, { withFileTypes: true }).forEach(e => { if (e.isFile() && /\.(js|html|css|xml|txt|webmanifest|json|png)$/i.test(e.name) && !/^(leads|todos|events|ki-[\w-]+)\.json$/.test(e.name)) fs.copyFileSync(path.join(ROOT, e.name), path.join(dir, e.name)); });
  const cpDir = (d) => { fs.mkdirSync(path.join(dir, d), { recursive: true }); fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => { if (e.isDirectory()) cpDir(path.join(d, e.name)); else fs.copyFileSync(path.join(ROOT, d, e.name), path.join(dir, d, e.name)); }); };
  ["admin-cockpit", "print", "logos"].forEach(cpDir);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}
async function startServer(dir, env) {
  const port = 5900 + Math.floor(Math.random() * 600);
  const e = Object.assign({}, process.env, { PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x" }, env);
  ["BLITZDINGS_STATS_URL", "BLITZDINGS_STATS_TOKEN", "RAILWAY_API_TOKEN", "CF_API_TOKEN", "DATABASE_URL", "MAIL_API_URL", "MAIL_API_TOKEN", "RAILWAY_GIT_COMMIT_SHA", "KI_MONTHLY_LIMIT_EUR"].forEach((k) => { if (!(k in env)) delete e[k]; });
  const srv = cp.spawn(process.execPath, ["server.js"], { cwd: dir, env: e, stdio: ["ignore", "pipe", "pipe"] });
  srv.out = ""; srv.stdout.on("data", (d) => (srv.out += d)); srv.stderr.on("data", (d) => (srv.out += d));
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 80; i++) { try { await fetch(base + "/admin/login"); break; } catch (er) { await sleep(100); } }
  srv.base = base; return srv;
}

(async () => {
  const mock = anthropicMock(); await new Promise(r => mock.server.listen(0, "127.0.0.1", r));
  const dir = copyApp();
  const srv = await startServer(dir, { ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_BASE_URL: "http://127.0.0.1:" + mock.server.address().port, CHAT_BEAT_TTL_MS: "1500", CHAT_AI_CONV_MAX: "4" });
  const B = srv.base;
  let ipN = 1;
  const pub = (p, body, hdr) => fetch(B + p, body ? { method: "POST", headers: Object.assign({ "Content-Type": "application/json", "X-Forwarded-For": "203.0.113." + ipN }, hdr || {}), body: JSON.stringify(body) } : { headers: Object.assign({ "X-Forwarded-For": "203.0.113." + ipN }, hdr || {}) });
  const pj = async (p, body, hdr) => { const r = await pub(p, body, hdr); return Object.assign({ _status: r.status }, await r.json()); };
  const adm = async (p, body) => { const r = await fetch(B + p, body ? { method: "POST", headers: { "Content-Type": "application/json", cookie: COOKIE }, body: JSON.stringify(body) } : { headers: { cookie: COOKIE } }); return Object.assign({ _status: r.status }, await r.json()); };
  const cidOf = s => (s + "x".repeat(24)).replace(/[^a-z0-9]/g, "a").slice(0, 24);
  const A = cidOf("visitora");
  const leads = () => { try { return JSON.parse(fs.readFileSync(path.join(dir, "leads.json"), "utf8")); } catch (e) { return []; } };

  await t("Overlay-Skript /chat/w.js wird ausgeliefert (JS, gzip-fähig), ist auf Startseite, Landingpages und /datenschutz eingebunden", async () => {
    const r = await fetch(B + "/chat/w.js?v=1", { headers: { "Accept-Encoding": "gzip" } }); assert.strictEqual(r.status, 200); assert.ok(/javascript/.test(r.headers.get("content-type")));
    assert.ok(/max-age/.test(r.headers.get("cache-control"))); const js = await r.text(); assert.ok(/fsc-chat/.test(js) && /\/chat\/api\/send/.test(js));
    for (const pg of ["/", "/webdesign-montafon", "/druck", "/website-kosten"]) assert.ok(/<script src="\/chat\/w\.js\?v=\d+" defer><\/script>/.test(await (await fetch(B + pg)).text()), "Overlay fehlt auf " + pg);
    const ds = await (await fetch(B + "/datenschutz")).text(); assert.ok(/Website-Chat/.test(ds) && /Anthropic/.test(ds) && /12 Monate/.test(ds));
    assert.strictEqual((await fetch(B + "/chat-widget.js")).status, 404, "Quelldatei nicht direkt öffentlich");
    assert.strictEqual((await fetch(B + "/chat.js")).status, 404, "Server-Modul nie öffentlich");
  });

  await t("Admin-API nur mit Login", async () => {
    const r = await fetch(B + "/admin/api/chat/state", { redirect: "manual" }); assert.strictEqual(r.status, 302);
    const r2 = await fetch(B + "/admin/api/chat/status", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/json" }, body: "{\"online\":true}" }); assert.strictEqual(r2.status, 302);
  });

  await t("Start: neue Unterhaltung (noch nichts gespeichert), Status offline", async () => {
    const j = await pj("/chat/api/start", { cid: A, page: "/webdesign-montafon" }); assert.strictEqual(j.ok, true); assert.strictEqual(j.exists, false); assert.deepStrictEqual(j.msgs, []); assert.strictEqual(j.online, false);
    const s = await adm("/admin/api/chat/state"); assert.strictEqual(s.convs.length, 0);
  });

  await t("Validierung: ID-Format, Länge ≤ 2000, nur JSON, gleiche Herkunft, Honeypot", async () => {
    assert.strictEqual((await pj("/chat/api/send", { cid: "kurz", text: "hi" }))._status, 400);
    assert.strictEqual((await pj("/chat/api/send", { cid: "../../etc/passwd" + "a".repeat(20), text: "hi" }))._status, 400);
    assert.strictEqual((await pj("/chat/api/poll?c=ABC" + "x".repeat(20)))._status, 400);
    const long = await pj("/chat/api/send", { cid: A, text: "x".repeat(2001) }); assert.strictEqual(long._status, 400); assert.strictEqual(long.error, "too_long");
    assert.strictEqual((await pj("/chat/api/send", { cid: A, text: "   " }))._status, 400);
    assert.strictEqual((await pj("/chat/api/send", { cid: A, text: 42 }))._status, 400);
    const r = await fetch(B + "/chat/api/send", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ cid: A, text: "hi" }) }); assert.strictEqual(r.status, 415);
    assert.strictEqual((await pj("/chat/api/send", { cid: A, text: "hi" }, { Origin: "https://evil.example" }))._status, 403);
    assert.strictEqual((await pj("/chat/api/send", { cid: A, text: "hi" }, { "Sec-Fetch-Site": "cross-site" }))._status, 403);
    const hp = await pj("/chat/api/send", { cid: A, text: "Buy cheap pills", website: "http://spam" }); assert.strictEqual(hp.ok, true); assert.strictEqual(hp.msg, null);
    assert.strictEqual((await adm("/admin/api/chat/state")).convs.length, 0, "Honeypot speichert nichts");
    const big = await fetch(B + "/chat/api/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cid: A, text: "a", pad: "x".repeat(20000) }) }).catch(() => ({ status: 413 })); assert.ok([413, 400].indexOf(big.status) > -1 || big.status === undefined);
    const noCors = await pub("/chat/api/status"); assert.ok(!noCors.headers.get("access-control-allow-origin"), "keine CORS-Freigabe");
  });

  await t("Status online + Herzschlag; Besucher sieht „online“", async () => {
    const s = await adm("/admin/api/chat/status", { online: true }); assert.strictEqual(s.online, true);
    assert.strictEqual((await pj("/chat/api/status")).online, true);
  });

  const XSS = "Hallo <script>alert(1)</script> & \"Grüße\" <img src=x onerror=alert(2)>";
  let lastId = 0;
  await t("Besucher-Nachricht: gespeichert als reiner Text (XSS bleibt Text), JSON mit nosniff, keine KI solange online", async () => {
    const r = await pub("/chat/api/send", { cid: A, text: XSS, name: "Max <b>M</b>", page: "/webdesign-montafon" });
    assert.ok(/application\/json/.test(r.headers.get("content-type"))); assert.strictEqual(r.headers.get("x-content-type-options"), "nosniff");
    const j = await r.json(); assert.strictEqual(j.ok, true); assert.strictEqual(j.msg.text, XSS); assert.strictEqual(j.msg.from, "v"); lastId = j.msg.id;
    await sleep(400); assert.strictEqual(mock.calls.length, 0, "Simon ist online → keine KI");
  });

  await t("Cockpit sieht die Unterhaltung (ungelesen, Seite, Vorschau), Lesen setzt ungelesen zurück", async () => {
    const s = await adm("/admin/api/chat/state"); assert.strictEqual(s.convs.length, 1); const c = s.convs[0];
    assert.strictEqual(c.id, A); assert.strictEqual(c.unread, 1); assert.strictEqual(s.unread, 1); assert.strictEqual(c.page, "/webdesign-montafon"); assert.strictEqual(c.name, "Max <b>M</b>"); assert.strictEqual(c.last.text, XSS.slice(0, 160)); assert.ok(/^\d{4}$/.test(c.no));
    const same = await adm("/admin/api/chat/state?v=" + encodeURIComponent(s.ver)); assert.strictEqual(same.same, true, "unverändert → {same}");
    const cv = await adm("/admin/api/chat/conv?id=" + A + "&read=1"); assert.strictEqual(cv.msgs.length, 1); assert.strictEqual(cv.msgs[0].text, XSS);
    assert.strictEqual((await adm("/admin/api/chat/state")).convs[0].unread, 0);
  });

  await t("Simon antwortet, Besucher holt die Antwort per Poll", async () => {
    const r = await adm("/admin/api/chat/send", { id: A, text: "Hallo Max, wie kann ich helfen?" }); assert.strictEqual(r.ok, true); assert.strictEqual(r.msg.from, "me");
    const p = await pj("/chat/api/poll?c=" + A + "&after=" + lastId); assert.strictEqual(p.online, true); assert.strictEqual(p.msgs.length, 1); assert.strictEqual(p.msgs[0].text, "Hallo Max, wie kann ich helfen?"); assert.strictEqual(p.msgs[0].from, "me");
    lastId = p.msgs[0].id;
    const st = await pj("/chat/api/status?c=" + A + "&a=1"); assert.strictEqual(st.n, 1, "1 neue Antwort für das Abzeichen");
    const again = await pj("/chat/api/start", { cid: A, page: "/kontakt" }); assert.strictEqual(again.exists, true); assert.strictEqual(again.msgs.length, 2, "Verlauf beim Wiederöffnen");
    assert.strictEqual(r.conv.ai, "auto");
  });

  await t("Ohne Herzschlag nach Ablauf (Test: 1,5 s) automatisch offline", async () => {
    await adm("/admin/api/chat/status", { online: true }); assert.strictEqual((await pj("/chat/api/status")).online, true);
    await sleep(1700);
    assert.strictEqual((await pj("/chat/api/status")).online, false); assert.strictEqual((await adm("/admin/api/chat/state")).online, false);
  });

  await t("Offline: KI antwortet (Sonnet, max_tokens 400, kurzer Verlauf, Simons Antwort als Kontext), als „ki“ markiert", async () => {
    const r = await pj("/chat/api/send", { cid: A, text: "Ich brauche eine neue Website" }); assert.strictEqual(r.ok, true);
    const ki = await waitFor(async () => { const p = await pj("/chat/api/poll?c=" + A + "&after=" + lastId); return p.msgs.find(m => m.from === "ki") && p; });
    assert.ok(ki, "KI-Antwort kommt"); const m = ki.msgs.find(x => x.from === "ki"); assert.ok(/Wie heißt du/.test(m.text)); assert.ok(/<b>kein HTML<\/b>/.test(m.text), "Text unverändert, Darstellung escaped der Client");
    lastId = ki.msgs[ki.msgs.length - 1].id;
    assert.strictEqual(mock.calls.length, 1); const c = mock.calls[0].body;
    assert.strictEqual(c.model, "claude-sonnet-5-5"); assert.strictEqual(c.max_tokens, 400); assert.ok(c.messages.length <= 12);
    assert.ok(/FS Creative/.test(JSON.stringify(c.system)) && /Preise/.test(JSON.stringify(c.system)) && /webdesign-montafon|kontakt/.test(JSON.stringify(c.system)));
    assert.strictEqual(c.messages[c.messages.length - 1].role, "user"); assert.strictEqual(c.messages[0].role, "user");
    assert.ok(c.messages.some(x => x.role === "assistant" && /Simon persönlich/.test(x.content)));
    assert.ok(c.output_config && c.output_config.format && c.output_config.format.type === "json_schema");
    assert.ok(/^sk-test$/.test(mock.calls[0].headers["x-api-key"] || ""), "Schlüssel nur serverseitig");
    const conv = (await adm("/admin/api/chat/conv?id=" + A)).conv; assert.strictEqual(conv.aiCount, 1); assert.strictEqual(conv.request, "Neue Website");
  });

  await t("Kontaktdaten + Anliegen → Lead automatisch (Quelle „Website-Chat (KI)“), Bestätigung an den Besucher, Nutzung unter „chat“ geloggt", async () => {
    const before = leads().length;
    await pj("/chat/api/send", { cid: A, text: "Max Muster, max@example.com – Website für meine Tischlerei" });
    const p = await waitFor(async () => { const x = await pj("/chat/api/poll?c=" + A + "&after=" + lastId); return x.msgs.some(m => m.from === "sys" && /angekommen/.test(m.text)) && x; });
    assert.ok(p, "Bestätigung im Chat"); lastId = p.msgs[p.msgs.length - 1].id;
    const L = leads(); assert.strictEqual(L.length, before + 1); const l = L[L.length - 1];
    assert.strictEqual(l.source, "Website-Chat (KI)"); assert.strictEqual(l.email, "max@example.com"); assert.strictEqual(l.topic, "Website"); assert.ok(/Tischlerei/.test(l.message)); assert.ok(/^lead_/.test(l.id));
    assert.strictEqual(l.name, "Max <b>M</b>", "vom Besucher eingegebener Name bleibt");
    const conv = (await adm("/admin/api/chat/conv?id=" + A)).conv; assert.strictEqual(conv.leadId, l.id); assert.strictEqual(conv.email, "max@example.com");
    const todos = JSON.parse(fs.readFileSync(path.join(dir, "todos.json"), "utf8")); assert.ok(todos.some(x => x.id === l.id));
    const u = JSON.parse(fs.readFileSync(path.join(dir, "ki-usage.json"), "utf8")); const mk = Object.keys(u.months).pop(); assert.ok(u.months[mk].chat && u.months[mk].chat.calls === 2 && u.months[mk].chat.model === "claude-sonnet-5-5");
    await sleep(300); await pj("/chat/api/send", { cid: A, text: "Danke!" });
    await waitFor(async () => (await adm("/admin/api/chat/conv?id=" + A)).conv.aiCount === 3);
    assert.strictEqual(leads().length, before + 1, "kein zweiter Lead");
    assert.ok(/bereits an Simon übermittelt/.test(JSON.stringify(mock.calls[mock.calls.length - 1].body.system)));
  });

  await t("Simon online + schreibt → KI schweigt; „KI: An“ übernimmt wieder; „Aus“ schaltet ab", async () => {
    await adm("/admin/api/chat/status", { online: true });
    const n0 = mock.calls.length;
    await adm("/admin/api/chat/send", { id: A, text: "Ich übernehme ab hier." });
    await pj("/chat/api/send", { cid: A, text: "Super, danke Simon" }); await sleep(500);
    assert.strictEqual(mock.calls.length, n0, "keine KI, weil Simon online ist und schreibt");
    const on = await adm("/admin/api/chat/op", { id: A, op: "ai", mode: "on" }); assert.strictEqual(on.conv.ai, "on");
    assert.ok(await waitFor(async () => mock.calls.length === n0 + 1), "KI übernimmt wieder");
    await adm("/admin/api/chat/send", { id: A, text: "Doch ich." }); assert.strictEqual((await adm("/admin/api/chat/conv?id=" + A)).conv.ai, "auto", "Schreiben stoppt die KI");
    await adm("/admin/api/chat/op", { id: A, op: "ai", mode: "off" }); await adm("/admin/api/chat/status", { online: false });
    await pj("/chat/api/send", { cid: A, text: "Noch eine Frage" }); await sleep(500); assert.strictEqual(mock.calls.length, n0 + 1, "KI aus bleibt aus, auch offline");
    assert.strictEqual((await adm("/admin/api/chat/op", { id: A, op: "ai", mode: "bogus" }))._status, 400);
  });

  await t("KI-Limit je Unterhaltung (Test: 4) → danach feste Nachricht, keine weiteren API-Aufrufe", async () => {
    ipN = 2; const C = cidOf("capconv");
    for (let i = 0; i < 6; i++) { const before = (await pj("/chat/api/poll?c=" + C + "&after=0")).msgs.length; await pj("/chat/api/send", { cid: C, text: "Frage " + i }); await waitFor(async () => (await pj("/chat/api/poll?c=" + C + "&after=0")).msgs.length >= before + 2, 4000); }
    const all = (await pj("/chat/api/poll?c=" + C + "&after=0")).msgs; assert.strictEqual(all.filter(m => m.from === "ki").length, 4);
    assert.strictEqual(all.filter(m => m.from === "sys" && /übernimmt Simon persönlich/.test(m.text)).length, 1, "Hinweis nur einmal");
  });

  await t("Rate-Limit: 20 Nachrichten / 10 Min. je IP + Unterhaltung → 429", async () => {
    ipN = 3; const R = cidOf("ratelimit"); await adm("/admin/api/chat/status", { online: true });
    for (let i = 0; i < 20; i++) assert.strictEqual((await pj("/chat/api/send", { cid: R, text: "m" + i }))._status, 200, "Nachricht " + i);
    const r = await pj("/chat/api/send", { cid: R, text: "zu viel" }); assert.strictEqual(r._status, 429); assert.strictEqual(r.error, "too_many");
    ipN = 4; assert.strictEqual((await pj("/chat/api/send", { cid: R, text: "andere IP" }))._status, 200);
  });

  await t("Als Lead übernehmen (Cockpit, vorbefüllt) legt Lead mit Quelle „Website-Chat“ an", async () => {
    const R = cidOf("ratelimit"), before = leads().length;
    assert.strictEqual((await adm("/admin/api/chat/op", { id: R, op: "lead", name: "", company: "" }))._status, 400);
    assert.strictEqual((await adm("/admin/api/chat/op", { id: R, op: "lead", name: "Eva", email: "kaputt" }))._status, 400);
    const j = await adm("/admin/api/chat/op", { id: R, op: "lead", name: "Eva Beispiel", email: "eva@example.com", phone: "+43 664 000000", topic: "Grafik & Branding", message: "Logo" });
    assert.strictEqual(j.ok, true); const l = leads().pop(); assert.strictEqual(leads().length, before + 1); assert.strictEqual(l.source, "Website-Chat"); assert.strictEqual(l.topic, "Grafik & Branding"); assert.strictEqual(j.conv.leadId, l.id);
  });

  await t("Beenden (Besucher sieht „beendet“, neue Nachricht öffnet wieder) und Löschen", async () => {
    const c = await adm("/admin/api/chat/op", { id: A, op: "close" }); assert.strictEqual(c.conv.closed, true);
    const p = await pj("/chat/api/poll?c=" + A + "&after=0"); assert.strictEqual(p.closed, true); assert.ok(p.msgs.some(m => m.from === "sys" && /beendet/.test(m.text)));
    await pj("/chat/api/send", { cid: A, text: "Hallo nochmal" }); assert.strictEqual((await adm("/admin/api/chat/conv?id=" + A)).conv.closed, false);
    const d = await adm("/admin/api/chat/op", { id: A, op: "delete" }); assert.strictEqual(d.ok, true);
    assert.ok(!(await adm("/admin/api/chat/state")).convs.some(x => x.id === A)); assert.strictEqual((await adm("/admin/api/chat/conv?id=" + A))._status, 404);
    assert.deepStrictEqual((await pj("/chat/api/poll?c=" + A + "&after=0")).msgs, []);
    assert.ok(!fs.existsSync(path.join(dir, "chat", A + ".json")), "Datei gelöscht");
  });

  await t("Clients rendern Nachrichten nur als Text; Cockpit-Ansicht und Push-Thema „chat“ registriert", async () => {
    const w = fs.readFileSync(path.join(ROOT, "chat-widget.js"), "utf8");
    (w.match(/\.innerHTML\s*=\s*[^;]+/g) || []).forEach(s => assert.ok(/=\s*(IC|'<svg)/.test(s), "innerHTML nur für feste Symbole: " + s));
    assert.ok(/createTextNode\(m\.text\)/.test(w));
    const z = fs.readFileSync(path.join(ROOT, "admin-cockpit", "zchat.js"), "utf8"); assert.ok(/esc\(m\.text\)/.test(z) && /F\.view\(\{id:"chat",label:"Chat"/.test(z));
    const html = await (await fetch(B + "/admin", { headers: { cookie: COOKIE } })).text(); assert.ok(/zchat\.js/.test(html));
    assert.ok(!/\["chat",/.test(fs.readFileSync(path.join(ROOT, "admin-cockpit", "zpush.js"), "utf8")), "kein Chat-Push (vom Nutzer nicht gewünscht)");
    assert.ok(fs.readFileSync(path.join(ROOT, "server.js"), "utf8").indexOf('T = ["mail", "lead", "fin", "chat"]') > -1, "Push-Thema chat am Server erlaubt");
  });

  srv.kill(); mock.server.close();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  console.log(fails.join("\n"));
  console.log("\nChat: " + pass + " bestanden, " + fail + " fehlgeschlagen");
  if (fail) { console.log("Server-Log:\n" + srv.out.slice(-3000)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
