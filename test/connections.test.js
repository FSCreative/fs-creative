/* Verbindungen (connections.js + Registry in server.js) gegen eigene Attrappen (Mail-Dienst, Plattform-Statistiken, Wetter, VIES, Wechselkurs).
   Aufruf: node test/connections.test.js – server.js läuft in einer Temp-Kopie (Dateispeicher, ohne DATABASE_URL).
   Geprüft: nur mit Anmeldung, Pflichtfelder, nicht eingerichtet → off (mit Weg), echte Prüfung → Fehler mit deutschem Grund,
   „Jetzt prüfen“ gebremst (30 s je Verbindung), Liste/Einstellungen aus dem Zwischenspeicher (keine neuen Abrufe), keine Geheimnisse in Antworten und Datei,
   Cockpit-Daten: Kurzfassung, Wetter, Mail-Status, platformStatus. */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto"), http = require("http");

const ROOT = path.join(__dirname, "..");
const SECRET = "test-secret";
const COOKIE = "fsadmin=" + encodeURIComponent((v => v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("hex"))("s1." + Date.now()));
const SECRETS = { MAIL_API_TOKEN: "geheim-mail-789", KOCHDU_STATS_TOKEN: "geheim-kochdu-123", KANTINEUR_STATS_TOKEN: "geheim-kantineur-456", BLITZDINGS_STATS_TOKEN: "geheim-blitz-321" };
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }

// ── Attrappen ──
function mocks() {
  const S = { hits: {}, mailsFail: true, health: { accounts: [{ key: "fs", label: "FS Creative", user: "simon@fs-creative.at", ok: true, configured: true }, { key: "gm", label: "Gmail", user: "x@gmail.com", ok: false, configured: true, error: "AUTH failed" }] } };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x"), p = u.pathname; S.hits[p] = (S.hits[p] || 0) + 1;
    const J = (code, o) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    const tok = req.headers["x-api-token"] || "";
    if (p === "/mail/api/health") return J(200, S.health);
    if (p === "/mail/api/mails") { if (tok !== SECRETS.MAIL_API_TOKEN) return J(401, { error: "unauthorized" }); return S.mailsFail ? J(500, { error: "boom" }) : J(200, { etag: "e1", fetchedAt: new Date().toISOString(), accounts: S.health.accounts, messages: [] }); }
    if (p === "/mail/api/calendar") return J(200, { events: [{ id: "c1", title: "Termin", date: "2026-10-28", time: "10:00" }] });
    if (p === "/kochdu/api/stats") return J(401, { error: "unauthorized" });
    if (p === "/kantineur/api/stats") return J(200, { error: "Datenbank weg (Anfrage mit " + SECRETS.KANTINEUR_STATS_TOKEN + ")" });   // Fehlertext enthält den Schlüssel → darf nie ausgegeben werden
    if (p === "/blitz/api/stats") return (u.searchParams.get("token") || tok) === SECRETS.BLITZDINGS_STATS_TOKEN ? J(200, { revenue: {}, bookings: {}, upcoming: [] }) : J(401, {});   // Header oder ?token= (getJSON merkt sich 401 je Host)
    if (p === "/blitz/api/cockpit/catalog") return tok === SECRETS.BLITZDINGS_STATS_TOKEN ? J(200, { ok: true, packages: [] }) : J(401, { ok: false });
    if (p === "/wx") return J(200, { current: { time: "2026-10-27T10:15", temperature_2m: 5.6, weather_code: 71, is_day: 1 }, daily: { temperature_2m_max: [7.4], temperature_2m_min: [1.2] },
      hourly: { time: ["2026-10-27T09:00", "2026-10-27T10:00"], freezing_level_height: [2000, 2120] } });
    if (p === "/vies/check-status") return J(200, { vow: { available: true }, countries: [{ countryCode: "AT", availability: "Available" }, { countryCode: "DE", availability: "Unavailable" }] });
    if (p === "/fx") return J(200, { rates: { EUR: 0.9 } });
    return J(404, { error: "nf" });
  });
  return { server, S };
}
function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-conn-"));
  fs.readdirSync(ROOT).filter(f => /\.(js|json|html|css|xml|txt|webmanifest)$/.test(f) && !/^package(-lock)?\.json$/.test(f) && fs.statSync(path.join(ROOT, f)).isFile()).forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  const cpDir = (d) => { fs.mkdirSync(path.join(dir, d), { recursive: true }); fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => { if (e.isDirectory()) cpDir(path.join(d, e.name)); else fs.copyFileSync(path.join(ROOT, d, e.name), path.join(dir, d, e.name)); }); };
  ["admin-cockpit", "logos"].forEach(cpDir);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const STRIP = /^(RAILWAY_|CF_API_TOKEN|ANTHROPIC_|DATABASE_URL|PRINTCOM_|PRINT_MOLLIE|MOLLIE_|EB_|PAYPAL_|FON_|VIW_|WA_|MKT_|GOOGLE_|PEXELS_|SKIKAISER_|HUETTENGAUDI_|VALUERO_|ANTONHAUS_|ALPINAPPART_|FINAPI_|ICLOUD_|SEVDESK_|MAIL_API_|KOCHDU_|KANTINEUR_|BLITZDINGS_|NDA_)/;
async function startServer(dir, env) {
  const port = 6100 + Math.floor(Math.random() * 600);
  const e = Object.assign({}, process.env);
  Object.keys(e).forEach(k => { if (STRIP.test(k)) delete e[k]; });
  Object.assign(e, { PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x" }, env);
  const srv = cp.spawn(process.execPath, ["server.js"], { cwd: dir, env: e, stdio: ["ignore", "pipe", "pipe"] });
  srv.out = ""; srv.stdout.on("data", (d) => (srv.out += d)); srv.stderr.on("data", (d) => (srv.out += d));
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 80; i++) { try { await fetch(base + "/admin/login"); break; } catch (er) { await new Promise((r) => setTimeout(r, 100)); } }
  srv.base = base; return srv;
}

(async () => {
  const M = mocks(), mport = await listen(M.server), mb = "http://127.0.0.1:" + mport;
  const dir = copyApp();
  const srv = await startServer(dir, { MAIL_API_URL: mb + "/mail/api/mails", MAIL_API_TOKEN: SECRETS.MAIL_API_TOKEN, KOCHDU_STATS_URL: mb + "/kochdu/api/stats", KOCHDU_STATS_TOKEN: SECRETS.KOCHDU_STATS_TOKEN,
    KANTINEUR_STATS_URL: mb + "/kantineur/api/stats", KANTINEUR_STATS_TOKEN: SECRETS.KANTINEUR_STATS_TOKEN, BLITZDINGS_STATS_URL: mb + "/blitz/api/stats", BLITZDINGS_STATS_TOKEN: SECRETS.BLITZDINGS_STATS_TOKEN,
    WEATHER_URL: mb + "/wx", VIES_URL: mb + "/vies/ms", FX_URL: mb + "/fx", MAIL_API_INTERNAL: mb + "/nichts/api/mails" });
  const B = srv.base, seen = [];
  const admin = async (p, body, headers) => {
    const r = await fetch(B + p, body ? { method: "POST", headers: Object.assign({ cookie: COOKIE, "content-type": "application/json" }, headers || {}), body: JSON.stringify(body) } : { headers: { cookie: COOKIE } });
    const txt = await r.text(); seen.push(txt); let j = {}; try { j = JSON.parse(txt); } catch (e) {} return Object.assign(j, { _status: r.status });
  };
  const item = (j, k) => (j.items || []).find(x => x.key === k);

  await t("nur mit Anmeldung; ändernde Anfrage nur von der eigenen Seite", async () => {
    let r = await fetch(B + "/admin/api/connections", { redirect: "manual" }); assert.strictEqual(r.status, 302); assert.ok(/\/admin\/login/.test(r.headers.get("location")));
    r = await fetch(B + "/admin/api/connections/check", { method: "POST", redirect: "manual", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) }); assert.strictEqual(r.status, 302);
    const x = await admin("/admin/api/connections/check", { key: "kochdu" }, { origin: "https://evil.example" }); assert.strictEqual(x._status, 403);
    assert.ok(!M.S.hits["/kochdu/api/stats"], "ohne Anmeldung/fremd keine Prüfung");
  });
  let first;
  await t("Liste: alle Verbindungen mit Pflichtfeldern, Kategorien, Kurzfassung", async () => {
    first = await admin("/admin/api/connections"); assert.strictEqual(first._status, 200); assert.strictEqual(first.ok, true);
    assert.ok(first.items.length >= 37, "Anzahl " + first.items.length);
    const keys = first.items.map(x => x.key); assert.strictEqual(new Set(keys).size, keys.length, "Schlüssel eindeutig");
    ["mail", "mail-calendar", "icloud", "cloudflare", "railway", "postgres", "buchhaltung", "kochdu", "kantineur", "blitzdings", "valuero", "skikaiser", "huettengaudi", "finapi", "ebank", "mollie-org", "mollie-print", "paypal", "printcom",
      "finanzonline", "vies", "fx", "ki", "google-seo", "pagespeed", "mkt-instagram", "mkt-facebook", "mkt-threads", "mkt-linkedin", "mkt-youtube", "mkt-tiktok", "mkt-pinterest", "mkt-bluesky", "pexels", "whatsapp", "viw", "push"]
      .forEach(k => assert.ok(keys.indexOf(k) > -1, "fehlt: " + k));
    first.items.forEach(x => {
      assert.ok(x.label && typeof x.label === "string" && x.category && x.icon, x.key);
      assert.ok(["ok", "warn", "error", "off"].indexOf(x.state) > -1, x.key + " " + x.state);
      assert.strictEqual(typeof x.detail, "string"); assert.ok(Array.isArray(x.usedBy), x.key);
      assert.ok("checkedAt" in x && "lastOkAt" in x && "fix" in x, x.key);
      if (x.fix) assert.ok(["action", "railway", "link", "none"].indexOf(x.fix.kind) > -1 && x.fix.label, x.key);
      assert.ok(!("meta" in x), "meta bleibt am Server");
    });
    assert.ok(first.categories.indexOf("Plattformen") > -1);
    const s = first.summary; assert.strictEqual(s.ok + s.warn + s.error + s.off + s.pending, s.total);
  });
  await t("nicht eingerichtet → off, mit Weg zur Einrichtung (Railway-Variable)", async () => {
    ["railway", "cloudflare", "ki", "printcom", "postgres", "ebank", "finanzonline"].forEach(k => assert.strictEqual(item(first, k).state, "off", k));
    const rw = item(first, "railway"); assert.strictEqual(rw.fix.kind, "railway"); assert.deepStrictEqual(rw.fix.vars, ["RAILWAY_API_TOKEN"]); assert.ok(/Railway-Variable RAILWAY_API_TOKEN/.test(rw.detail), rw.detail);
    assert.ok(/ANTHROPIC_API_KEY/.test(item(first, "ki").detail));
    const ic = item(first, "icloud"); assert.strictEqual(ic.state, "off"); assert.strictEqual(ic.fix.kind, "action"); assert.strictEqual(ic.fix.act, "settings:icloud");
    assert.strictEqual(item(first, "kochdu").pending, true, "eingerichtet, aber noch nicht geprüft");
  });
  await t("Prüfung: abgelehnter Schlüssel → Störung mit deutschem Grund und Railway-Weg", async () => {
    const r = await admin("/admin/api/connections/check", { key: "kochdu" }); assert.strictEqual(r._status, 200);
    assert.strictEqual(r.item.state, "error"); assert.ok(/Schlüssel abgelehnt/.test(r.item.detail) && /KOCHDU_STATS_TOKEN/.test(r.item.detail), r.item.detail);
    assert.strictEqual(r.item.fix.kind, "railway"); assert.ok(r.item.fix.vars.indexOf("KOCHDU_STATS_TOKEN") > -1); assert.ok(r.item.checkedAt && !r.item.lastOkAt);
    assert.ok(r.summary.problems.some(p => p.key === "kochdu" && p.state === "error"));
    const k = await admin("/admin/api/connections/check", { key: "kantineur" }); assert.strictEqual(k.item.state, "error"); assert.ok(/^Statistik meldet: Datenbank weg/.test(k.item.detail), k.item.detail);
    const b = await admin("/admin/api/connections/check", { key: "blitzdings" }); assert.strictEqual(b.item.state, "ok", b.item.detail); assert.ok(b.item.lastOkAt);
    const m = await admin("/admin/api/connections/check", { key: "mail" }); assert.strictEqual(m.item.state, "warn", m.item.detail);
    assert.ok(/Anmeldung fehlgeschlagen: Gmail/.test(m.item.detail), m.item.detail); assert.strictEqual(m.item.fix.act, "settings:mail");
    const c = await admin("/admin/api/connections/check", { key: "mail-calendar" }); assert.strictEqual(c.item.state, "ok"); assert.ok(/1 Termine/.test(c.item.detail), c.item.detail);
    const v = await admin("/admin/api/connections/check", { key: "vies" }); assert.strictEqual(v.item.state, "ok"); assert.ok(/DE/.test(v.item.detail), v.item.detail);
    const fx = await admin("/admin/api/connections/check", { key: "fx" }); assert.strictEqual(fx.item.state, "ok"); assert.ok(/0,9000/.test(fx.item.detail), fx.item.detail);
    const u = await admin("/admin/api/connections/check", { key: "gibtsnicht" }); assert.strictEqual(u._status, 404);
  });
  await t("„Jetzt prüfen“ höchstens alle 30 s; Liste und Einstellungen nur aus dem Zwischenspeicher", async () => {
    const n0 = M.S.hits["/kochdu/api/stats"] || 0, h0 = M.S.hits["/mail/api/health"] || 0;
    const r = await admin("/admin/api/connections/check", { key: "kochdu" }); assert.strictEqual(r.limited, true); assert.ok(r.retryIn > 0 && r.retryIn <= 30, String(r.retryIn)); assert.strictEqual(r.item.state, "error");
    for (let i = 0; i < 3; i++) { const l = await admin("/admin/api/connections"); assert.strictEqual(item(l, "kochdu").state, "error"); }
    for (let i = 0; i < 3; i++) { const st = await admin("/admin/api/settings"); assert.strictEqual(st._status, 200); }
    assert.strictEqual(M.S.hits["/kochdu/api/stats"] || 0, n0, "keine neuen Abrufe bei kochdu");
    assert.strictEqual(M.S.hits["/mail/api/health"] || 0, h0, "Einstellungen fragen den Mail-Dienst nicht bei jeder Abfrage");
  });
  await t("Einstellungen: Status aus der Prüfung statt „verbunden, weil Variable da“", async () => {
    const st = await admin("/admin/api/settings");
    const ko = st.integrations.find(x => x.key === "kochdu"); assert.strictEqual(ko.ok, false); assert.strictEqual(ko.state, "error");
    assert.strictEqual(st.integrations.find(x => x.key === "railway").state, "off");
    assert.ok(st.accounts.some(a => a.key === "gm" && a.ok === false), JSON.stringify(st.accounts));
    assert.ok(st.connections && st.connections.error >= 2, JSON.stringify(st.connections));
  });
  await t("Alle prüfen: frisch, danach gebremst", async () => {
    const r = await admin("/admin/api/connections/check", { all: true }); assert.strictEqual(r._status, 200); assert.ok(!r.limited);
    assert.ok(r.items.length >= 37); assert.strictEqual(r.items.filter(x => x.pending).length, 0, "nichts mehr offen");
    assert.ok(r.summary.error >= 2 && r.summary.ok >= 3, JSON.stringify(r.summary));
    const again = await admin("/admin/api/connections/check", { all: true }); assert.strictEqual(again.limited, true);
  });
  await t("Mail-Dienst ohne Daten: Fehler mit Grund (Postfach und Cockpit)", async () => {
    const m = await admin("/admin/api/mail"); assert.strictEqual(m._status, 503); assert.ok(/Mail-Dienst meldet einen Fehler \(HTTP 500\)/.test(m.detail), JSON.stringify(m));
    const c = await admin("/admin/api/cockpit"); assert.strictEqual(c._status, 200, JSON.stringify(c).slice(0, 200));
    assert.strictEqual(c.mail.stale, false); assert.ok(/Mail-Dienst/.test(c.mail.error), JSON.stringify(c.mail.error));
    M.S.mailsFail = false;
    const ok = await admin("/admin/api/mail?fresh=1"); assert.strictEqual(ok._status, 200); assert.ok(!ok.error && !ok.stale);
    const c2 = await admin("/admin/api/cockpit"); assert.strictEqual(c2.mail.error, ""); assert.strictEqual(c2.mail.stale, false);
  });
  await t("Cockpit-Daten: Kurzfassung (nur Cache), Wetter Gaschurn, Plattform-Status mit Grund", async () => {
    const h0 = M.S.hits["/kochdu/api/stats"] || 0;
    const c = await admin("/admin/api/cockpit");
    const k = c.connections; assert.ok(k && k.total >= 37 && k.problems.some(p => p.key === "kochdu" && p.fix && p.fix.kind === "railway"), JSON.stringify(k));
    ["ok", "warn", "error", "off", "total", "checkedAt"].forEach(f => assert.ok(f in k, f));
    const w = c.weather; assert.ok(w, "Wetter fehlt"); assert.strictEqual(w.temp, 6); assert.strictEqual(w.text, "leichter Schneefall"); assert.strictEqual(w.icon, "snow");
    assert.strictEqual(w.min, 1); assert.strictEqual(w.max, 7); assert.strictEqual(w.place, "Gaschurn"); assert.strictEqual(w.snowLine, 1800);
    assert.strictEqual(c.platformStatus.kochdu.configured, true); assert.strictEqual(c.platformStatus.kochdu.auth, true); assert.strictEqual(c.platformStatus.blitzdings.ok, true);
    assert.strictEqual(c.platformStatus.skikaiser.configured, false);
    assert.ok((M.S.hits["/kochdu/api/stats"] || 0) - h0 <= 1, "Cockpit-Aufbau ruft höchstens die Statistik selbst ab, keine Verbindungsprüfung");
  });
  await t("keine Geheimnisse in Antworten und in connections.json", async () => {
    await new Promise(r => setTimeout(r, 1800));   // Datei wird verzögert geschrieben
    const file = fs.readFileSync(path.join(dir, "connections.json"), "utf8"), all = seen.join("\n") + file;
    Object.keys(SECRETS).forEach(k => assert.ok(all.indexOf(SECRETS[k]) < 0, k + " sichtbar"));
    assert.ok(all.indexOf(SECRET) < 0, "ADMIN_AUTH_SECRET sichtbar"); assert.ok(!/Bearer\s+geheim/.test(all));
    const j = JSON.parse(file); assert.ok(j.results.kochdu && j.results.kochdu.state === "error"); assert.ok(!Object.keys(j.results).some(k => "meta" in j.results[k]), "meta nicht gespeichert");
  });
  await t("Cockpit-Modul: Seite „Verbindungen“ ausgeliefert", async () => {
    const h = await (await fetch(B + "/admin", { headers: { cookie: COOKIE } })).text(); const m = h.match(/\/admin\/neu\/zconn\.js\?v=[\w]+/); assert.ok(m, "zconn.js nicht eingebunden");
    const js = await (await fetch(B + m[0], { headers: { cookie: COOKIE } })).text();
    assert.ok(/F\.view\(\{id:"conn"/.test(js) && /hidden:true/.test(js) && /F\.action\("conn"/.test(js) && /F\.feed\(/.test(js));
    assert.ok(/\/admin\/api\/connections\/check/.test(js));
  });

  srv.kill(); M.server.close();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  fails.forEach(f => console.log(f));
  if (fail) console.log(srv.out.slice(-3000));
  console.log("\nVerbindungen: " + pass + " bestanden, " + fail + " fehlgeschlagen");
  process.exit(fail ? 1 : 0);
})();
