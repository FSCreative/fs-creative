/* Sicherheit (Prüfung 19.10.2026): echte Besucher-IP, Cockpit-Anmeldung gegen Passwort-Raten, Sitzungsablauf, CSRF-Schutz im Cockpit,
   keine Bibliotheken/Tests öffentlich, Rate-Limit-Zähler ohne „alles leeren“.
   Aufruf: node test/security.test.js   – server.js läuft in einer Temp-Kopie (Dateispeicher, ohne DATABASE_URL). */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto");
const { clientIp, hitCounter } = require("../client-ip.js");

const ROOT = path.join(__dirname, "..");
const SECRET = "test-secret";
const tok = v => encodeURIComponent(v + "." + crypto.createHmac("sha256", SECRET).update(v).digest("hex"));
const COOKIE = "fsadmin=" + tok("s1." + Date.now());
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }

function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-sec-"));
  fs.readdirSync(ROOT).filter(f => /\.(js|json|html|css|xml|txt|webmanifest)$/.test(f) && fs.statSync(path.join(ROOT, f)).isFile()).forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  const cpDir = (d) => { fs.mkdirSync(path.join(dir, d), { recursive: true }); fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => { if (e.isDirectory()) cpDir(path.join(d, e.name)); else fs.copyFileSync(path.join(ROOT, d, e.name), path.join(dir, d, e.name)); }); };
  ["admin-cockpit", "logos", "print", "test"].forEach(cpDir);
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}
async function startServer(dir) {
  const port = 6500 + Math.floor(Math.random() * 400);
  const e = Object.assign({}, process.env, { PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "richtig-123" });
  ["BLITZDINGS_STATS_URL", "BLITZDINGS_STATS_TOKEN", "RAILWAY_API_TOKEN", "CF_API_TOKEN", "ANTHROPIC_API_KEY", "DATABASE_URL", "SEVDESK_API_KEY", "MAIL_API_URL", "PRINTCOM_API_KEY"].forEach((k) => delete e[k]);
  const srv = cp.spawn(process.execPath, ["server.js"], { cwd: dir, env: e, stdio: ["ignore", "pipe", "pipe"] });
  srv.out = ""; srv.stdout.on("data", (d) => (srv.out += d)); srv.stderr.on("data", (d) => (srv.out += d));
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 80; i++) { try { await fetch(base + "/admin/login"); break; } catch (er) { await new Promise((r) => setTimeout(r, 100)); } }
  srv.base = base; return srv;
}
const login = (B, pw, headers) => fetch(B + "/admin/login", { method: "POST", redirect: "manual", headers: Object.assign({ "content-type": "application/x-www-form-urlencoded" }, headers || {}), body: "password=" + encodeURIComponent(pw) });
const req = (xff, cf, sock) => ({ headers: Object.assign({}, xff != null ? { "x-forwarded-for": xff } : {}, cf ? { "cf-connecting-ip": cf } : {}), socket: { remoteAddress: sock || "10.0.0.5" } });

(async () => {
  await t("Besucher-IP: X-Forwarded-For von rechts, Cloudflare-Header nur über Cloudflare, gefälschte Einträge links wirkungslos", async () => {
    assert.strictEqual(clientIp(req("84.112.10.20, 172.70.1.1", "84.112.10.20")), "84.112.10.20");
    assert.strictEqual(clientIp(req("6.6.6.6, 84.112.10.20, 172.70.1.1", "84.112.10.20")), "84.112.10.20", "linker (gefälschter) Eintrag ignoriert");
    assert.strictEqual(clientIp(req("6.6.6.6, 91.5.5.5", "7.7.7.7")), "91.5.5.5", "CF-Connecting-IP ohne Cloudflare-Hop nicht vertraut");
    assert.strictEqual(clientIp(req("2a02:8388::1, 2a06:98c0:3600::103", "2a02:8388::1")), "2a02:8388::1");
    assert.strictEqual(clientIp(req(null, null, "::ffff:127.0.0.1")), "127.0.0.1");
    assert.strictEqual(clientIp(req("1.2.3.4, 10.1.2.3", null, "100.64.0.2")), "1.2.3.4", "interne Railway-Adressen übersprungen");
    // auf Railway: X-Real-IP der Edge zählt (gefälschte X-Forwarded-For/CF-Header wirkungslos); mit eigenem Cloudflare-Proxy davor: CF-Connecting-IP
    process.env.RAILWAY_ENVIRONMENT = "production";
    try {
      const rq = (rip, xff, cf) => Object.assign(req(xff, cf), { headers: Object.assign(req(xff, cf).headers, rip ? { "x-real-ip": rip } : {}) });
      assert.strictEqual(clientIp(rq("91.114.101.246", "91.114.101.246, 34.1.2.3", "91.114.101.246")), "91.114.101.246");
      assert.strictEqual(clientIp(rq("91.114.101.246", "6.6.6.6, 91.114.101.246, 34.1.2.3", "7.7.7.7")), "91.114.101.246", "Fälschung über XFF/CF-Header");
      assert.strictEqual(clientIp(rq("172.70.1.1", "84.112.10.20, 172.70.1.1", "84.112.10.20")), "84.112.10.20", "eigener Cloudflare-Proxy");
      assert.strictEqual(clientIp(rq("", "84.112.10.20, 34.1.2.3", null)), "34.1.2.3", "ohne X-Real-IP: rechter öffentlicher XFF-Eintrag");
    } finally { delete process.env.RAILWAY_ENVIRONMENT; }
  });
  await t("Rate-Limit-Zähler: Flut neuer Schlüssel setzt bestehende Sperren nicht zurück", async () => {
    const H = hitCounter(1000);
    for (let i = 0; i < 6; i++) H.hit("angreifer", 5, 60000);
    assert.strictEqual(H.hit("angreifer", 5, 60000), true);
    for (let i = 0; i < 1500; i++) H.hit("x" + i, 5, 60000);
    assert.ok(H.size <= 1000, "Größe begrenzt: " + H.size);
    assert.strictEqual(H.hit("angreifer", 5, 60000), true, "Sperre bleibt (zuletzt genutzter Schlüssel bleibt erhalten)");
  });

  const dir = copyApp(); const srv = await startServer(dir); const B = srv.base;

  await t("Anmeldung: richtiges Passwort → Sitzung mit Zeitstempel (30 Tage, HttpOnly, Secure, SameSite)", async () => {
    const r = await login(B, "richtig-123"); assert.strictEqual(r.status, 302); assert.strictEqual(r.headers.get("location"), "/admin");
    const c = r.headers.get("set-cookie"); assert.ok(/^fsadmin=s1\.\d{13}\./.test(decodeURIComponent(c)), c);
    assert.ok(/HttpOnly/.test(c) && /Secure/.test(c) && /SameSite=Lax/.test(c) && /Max-Age=2592000/.test(c));
    const a = await fetch(B + "/admin/api/push", { headers: { cookie: c.split(";")[0] } }); assert.strictEqual(a.status, 200);
  });
  await t("Passwort-Raten: nach 8 Fehlversuchen pro IP gesperrt (auch das richtige Passwort), Fehlversuche verzögert", async () => {
    const ip = { "x-forwarded-for": "203.0.113.9" };   // lokal ohne Proxy: XFF-Eintrag gilt als Besucher (rechtester öffentlicher Eintrag)
    const t0 = Date.now(); const r1 = await login(B, "falsch", ip); assert.strictEqual(r1.status, 401); assert.ok(Date.now() - t0 >= 700, "Verzögerung");
    const all = []; for (let i = 0; i < 7; i++) all.push(login(B, "falsch" + i, ip)); (await Promise.all(all)).forEach(r => assert.strictEqual(r.status, 401));
    const r9 = await login(B, "richtig-123", ip); assert.strictEqual(r9.status, 429); assert.ok(/Zu viele Fehlversuche/.test(await r9.text()));
    assert.ok(!r9.headers.get("set-cookie"), "keine Sitzung während der Sperre");
    const other = await login(B, "richtig-123", { "x-forwarded-for": "198.51.100.7" }); assert.strictEqual(other.status, 302, "andere IP nicht betroffen (kein globales Aussperren)");
    const spoof = await login(B, "richtig-123", { "x-forwarded-for": "1.1.1.1, 203.0.113.9" }); assert.strictEqual(spoof.status, 429, "vorangestellte gefälschte IP umgeht die Sperre nicht");
    assert.ok(/Cockpit-Anmeldung fehlgeschlagen \(8 in der letzten Stunde\)/.test(srv.out), "Protokoll");
  });
  await t("Sitzungsablauf: abgelaufene/zukünftige/manipulierte Cookies ungültig; alte Cookies bis Stichtag gültig und werden erneuert", async () => {
    const st = c => fetch(B + "/admin/api/push", { redirect: "manual", headers: { cookie: "fsadmin=" + c } });
    assert.strictEqual((await st(tok("s1." + (Date.now() - 31 * 86400000)))).status, 302, "älter als 30 Tage");
    assert.strictEqual((await st(tok("s1." + (Date.now() + 86400000)))).status, 302, "Zeitstempel in der Zukunft");
    assert.strictEqual((await st(tok("s2." + Date.now()))).status, 302, "unbekanntes Format");
    assert.strictEqual((await st(encodeURIComponent("s1." + Date.now() + ".deadbeef"))).status, 302, "falsche Signatur");
    const old = await st(tok("s1." + (Date.now() - 3 * 86400000))); assert.strictEqual(old.status, 200);
    assert.ok(/^fsadmin=s1\.\d{13}\./.test(decodeURIComponent(old.headers.get("set-cookie") || "")), "Sitzung bei Nutzung erneuert");
    const fresh = await st(tok("s1." + Date.now())); assert.strictEqual(fresh.status, 200); assert.ok(!fresh.headers.get("set-cookie"), "frische Sitzung nicht bei jeder Anfrage neu gesetzt");
    const legacy = await st(tok("ok")); assert.strictEqual(legacy.status, Date.now() < Date.parse("2026-11-20") ? 200 : 302);
    if (legacy.status === 200) assert.ok(/^fsadmin=s1\./.test(decodeURIComponent(legacy.headers.get("set-cookie") || "")), "altes Cookie wird umgestellt");
  });
  await t("CSRF: ändernde Cockpit-Anfragen von fremden Seiten → 403, eigene Seite erlaubt", async () => {
    const post = h => fetch(B + "/admin/api/push", { method: "POST", headers: Object.assign({ cookie: COOKIE, "content-type": "application/json" }, h), body: JSON.stringify({ op: "x" }) });
    assert.strictEqual((await post({ "sec-fetch-site": "cross-site", origin: "https://evil.example" })).status, 403);
    assert.strictEqual((await post({ "sec-fetch-site": "same-site", origin: "https://shop.fs-creative.at" })).status, 403);
    assert.strictEqual((await post({ origin: "https://evil.example" })).status, 403, "ohne Sec-Fetch-Site: Origin geprüft");
    assert.strictEqual((await post({ origin: "null" })).status, 403);
    assert.notStrictEqual((await post({ "sec-fetch-site": "same-origin", origin: B })).status, 403);
    assert.notStrictEqual((await post({})).status, 403, "ohne Header (Skripte/Tests) erlaubt");
    const g = await fetch(B + "/admin/api/push", { headers: { cookie: COOKIE, "sec-fetch-site": "cross-site" } }); assert.strictEqual(g.status, 200, "Lesen per GET unverändert");
  });
  await t("Bibliotheken, Tests und Server-Code nie öffentlich", async () => {
    for (const p of ["/node_modules/pdf-lib/package.json", "/node_modules/pdf-lib/README.md", "/test/print-cms-fixture.json", "/test/security.test.js", "/server.js", "/client-ip.js", "/package.json"]) {
      const r = await fetch(B + p); const h = await r.text();
      assert.ok(r.status === 404 || !/pdf-lib|fixture|require\(|"dependencies"/.test(h), p + " → " + r.status);
    }
    const lic = fs.readdirSync(path.join(ROOT, "node_modules")).map(d => ["LICENSE.txt", "README.txt", "index.html"].map(f => path.join(d, f))).flat().find(f => fs.existsSync(path.join(ROOT, "node_modules", f)));
    if (lic) { const r = await fetch(B + "/node_modules/" + lic); const h = await r.text(); assert.ok(!(r.status === 200 && h === fs.readFileSync(path.join(ROOT, "node_modules", lic), "utf8")), lic + " ausgeliefert"); }
  });

  srv.kill();
  if (fail) console.log(srv.out.split("\n").slice(-20).join("\n"));
  console.log(fails.join("\n")); console.log(pass + " ok, " + fail + " fehlgeschlagen");
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
