/* Blitzdings-Proxy im Cockpit (/admin/api/blitz/*) gegen einen lokalen Blitzdings-Mock.
   Aufruf: node test/blitz.test.js   (keine Abhängigkeiten; server.js läuft in einer Temp-Kopie, damit keine Daten-Dateien im Repo landen) */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto");
const createBlitzMock = require("./blitz-mock.js");

const ROOT = path.join(__dirname, "..");
const SECRET = "test-secret";
const COOKIE = "fsadmin=" + encodeURIComponent("ok." + crypto.createHmac("sha256", SECRET).update("ok").digest("hex"));

let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.message || e)); } }

function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-blitz-"));
  ["server.js", "ki.js", "admin-cockpit.html"].forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
  fs.mkdirSync(path.join(dir, "admin-cockpit"));
  fs.readdirSync(path.join(ROOT, "admin-cockpit")).forEach((f) => fs.copyFileSync(path.join(ROOT, "admin-cockpit", f), path.join(dir, "admin-cockpit", f)));
  return dir;
}
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));

(async () => {
  const mock = createBlitzMock({ token: "tok-123" });
  const mport = await listen(mock.server);
  const dir = copyApp();
  const port = 4600 + Math.floor(Math.random() * 300);
  const env = Object.assign({}, process.env, { PORT: String(port), ADMIN_AUTH_SECRET: SECRET, ADMIN_PASSWORD: "x",
    BLITZDINGS_STATS_URL: "http://127.0.0.1:" + mport + "/api/stats", BLITZDINGS_STATS_TOKEN: "tok-123" });
  ["BLITZDINGS_COCKPIT_URL", "BLITZDINGS_COCKPIT_TOKEN", "SEVDESK_API_KEY", "RAILWAY_API_TOKEN", "CF_API_TOKEN", "MAIL_API_URL", "ANTHROPIC_API_KEY"].forEach((k) => delete env[k]);
  const srv = cp.spawn(process.execPath, ["server.js"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
  let srvOut = ""; srv.stdout.on("data", (d) => (srvOut += d)); srv.stderr.on("data", (d) => (srvOut += d));
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 50; i++) { try { await fetch(base + "/admin/login"); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  const api = (p, o) => fetch(base + p, Object.assign({ redirect: "manual", headers: Object.assign({ cookie: COOKIE }, o && o.body ? { "content-type": "application/json" } : {}) }, o || {}, o && o.body ? { body: JSON.stringify(o.body) } : {}));
  const json = async (p, o) => { const r = await api(p, o); return { status: r.status, j: await r.json().catch(() => null) }; };
  const ymd = (d) => d.toISOString().slice(0, 10);
  const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

  await t("ohne Login → Weiterleitung, kein Proxy", async () => {
    const r = await fetch(base + "/admin/api/blitz/catalog", { redirect: "manual" });
    assert.strictEqual(r.status, 302);
    assert.ok(!mock.state.log.some((l) => l.path === "/api/cockpit/catalog"));
  });
  await t("Katalog: Token nur serverseitig (Header), nicht in der Antwort", async () => {
    const r = await json("/admin/api/blitz/catalog");
    assert.strictEqual(r.status, 200); assert.strictEqual(r.j.packages.length, 3);
    const l = mock.state.log.filter((x) => x.path === "/api/cockpit/catalog").pop();
    assert.strictEqual(l.headerToken, "tok-123"); assert.ok(!/tok-123/.test(l.query));
    assert.ok(!JSON.stringify(r.j).includes("tok-123"));
  });
  await t("Basis-URL aus BLITZDINGS_STATS_URL abgeleitet (/api/stats → /api/cockpit)", async () => {
    assert.ok(mock.state.log.some((l) => l.path === "/api/cockpit/catalog"));
  });
  await t("Verfügbarkeit: Parameter geprüft und weitergereicht", async () => {
    const bad = await json("/admin/api/blitz/availability?from=x&to=y"); assert.strictEqual(bad.status, 400);
    const r = await json("/admin/api/blitz/availability?from=" + day(0) + "&to=" + day(14));
    assert.strictEqual(r.status, 200); assert.strictEqual(r.j.days[day(3)].MINI, "booked"); assert.strictEqual(r.j.days[day(10)].VIDEO360, "blocked");
    assert.strictEqual(r.j.bookings.length, 1);
  });
  let created;
  await t("Buchung anlegen → erscheint sofort in Nächste Termine (Cache verworfen)", async () => {
    const before = await json("/admin/api/cockpit"); assert.strictEqual(before.status, 200, "cockpit " + before.status);
    const n0 = before.j.platforms.blitzdings.upcoming.length;
    const r = await json("/admin/api/blitz/bookings", { method: "POST", body: { packageSlug: "video360", eventDate: day(5), customerName: "Max Muster", customerEmail: "max@example.at", customerMail: "none", source: "evil" } });
    assert.strictEqual(r.status, 201, JSON.stringify(r.j)); created = r.j.booking;
    const after = await json("/admin/api/cockpit");
    assert.strictEqual(after.j.platforms.blitzdings.upcoming.length, n0 + 1);
    assert.ok(after.j.platforms.blitzdings.upcoming.some((b) => b.id === created.id));
  });
  await t("Doppelbuchung → 409 mit Konflikten durchgereicht", async () => {
    const r = await json("/admin/api/blitz/bookings", { method: "POST", body: { packageSlug: "digital", eventDate: day(3), customerName: "Doppelt", customerEmail: "d@example.at" } });
    assert.strictEqual(r.status, 409); assert.strictEqual(r.j.ok, false); assert.strictEqual(r.j.conflicts[0].reference, "BD-AAAA11");
  });
  await t("Storno über booking-status → PATCH an Blitzdings", async () => {
    const r = await json("/admin/api/blitz/booking-status", { method: "POST", body: { id: created.id, status: "CANCELLED" } });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.j.booking.status, "CANCELLED");
    const l = mock.state.log.filter((x) => x.method === "PATCH").pop(); assert.strictEqual(l.path, "/api/cockpit/bookings/" + created.id);
    const after = await json("/admin/api/cockpit");
    assert.ok(!after.j.platforms.blitzdings.upcoming.some((b) => b.id === created.id));
  });
  await t("Ungültige ID wird abgewiesen", async () => {
    const r = await json("/admin/api/blitz/booking-status", { method: "POST", body: { id: "../x", status: "CANCELLED" } }); assert.strictEqual(r.status, 400);
  });
  await t("Tag sperren und freigeben", async () => {
    const r = await json("/admin/api/blitz/block", { method: "POST", body: { date: day(20), reason: "Wartung" } });
    assert.strictEqual(r.status, 201);
    const u = await json("/admin/api/blitz/unblock", { method: "POST", body: { id: r.j.blocked.id } });
    assert.strictEqual(u.status, 200); assert.strictEqual(u.j.deleted, 1);
  });
  await t("Unbekannter Pfad → 404", async () => { const r = await json("/admin/api/blitz/xyz", { method: "POST", body: {} }); assert.strictEqual(r.status, 404); });

  srv.kill(); mock.server.close();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  console.log(pass + " bestanden, " + fail + " fehlgeschlagen");
  if (fail) { console.log(fails.map((f) => "✗ " + f).join("\n")); console.log(srvOut.slice(-1500)); process.exit(1); }
})();
