"use strict";
// Passkey (WebAuthn) als zweiter Faktor: Registrierung und Anmeldung mit einem echten P-256-Schlüssel, dazu die wichtigsten Ablehnungen.
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pk-"));
const PK = require("../passkey.js")({ DATA_DIR: dir });
const req = { headers: { host: "www.example.test" } };
const b64u = b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
// kleiner CBOR-Schreiber (nur was wir brauchen)
function enc(v) {
  const head = (mt, n) => n < 24 ? Buffer.from([mt << 5 | n]) : n < 256 ? Buffer.from([mt << 5 | 24, n]) : Buffer.from([mt << 5 | 25, n >> 8, n & 255]);
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === "string") { const b = Buffer.from(v); return Buffer.concat([head(3, b.length), b]); }
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size)].concat([...v].flatMap(([k, x]) => [enc(k), enc(x)])));
  throw new Error("enc");
}
const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = publicKey.export({ format: "jwk" });
const credId = crypto.randomBytes(16), rpHash = crypto.createHash("sha256").update("www.example.test").digest();
const cd = (type, challenge, origin) => b64u(Buffer.from(JSON.stringify({ type, challenge, origin: origin || "https://www.example.test" })));
function authData(flags, counter, attested) {
  const c = Buffer.alloc(4); c.writeUInt32BE(counter);
  if (!attested) return Buffer.concat([rpHash, Buffer.from([flags]), c]);
  const cose = enc(new Map([[1, 2], [3, -7], [-1, 1], [-2, unb64u(jwk.x)], [-3, unb64u(jwk.y)]])), len = Buffer.from([credId.length >> 8, credId.length & 255]);
  return Buffer.concat([rpHash, Buffer.from([flags | 64]), c, Buffer.alloc(16), len, credId, cose]);
}
function register() {
  const o = PK.registerOptions(req);
  const att = enc(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData(5, 0, true)]]));
  return PK.register(req, { name: "Test", clientDataJSON: cd("webauthn.create", o.challenge), attestationObject: b64u(att) });
}
function assertion(o, opts) {
  opts = opts || {};
  const ad = authData(opts.flags != null ? opts.flags : 5, opts.counter || 0, false), cdj = cd("webauthn.get", opts.challenge || o.challenge, opts.origin);
  const sig = crypto.sign("sha256", Buffer.concat([ad, crypto.createHash("sha256").update(unb64u(cdj)).digest()]), opts.key || privateKey);
  return { id: b64u(credId), clientDataJSON: cdj, authenticatorData: b64u(ad), signature: b64u(sig) };
}

test("Passkey: Registrierung, Anmeldung, Ablehnungen", () => {
  assert.strictEqual(PK.enabled(), false);
  register();
  assert.strictEqual(PK.enabled(), true);
  assert.strictEqual(PK.list().length, 1);
  assert.throws(() => register(), /schon eingetragen/);
  let o = PK.loginOptions(req); assert.strictEqual(PK.verifyLogin(req, assertion(o)), true);
  o = PK.loginOptions(req); const a = assertion(o); PK.verifyLogin(req, a); assert.throws(() => PK.verifyLogin(req, a), /abgelaufen/, "Challenge nur einmal");
  o = PK.loginOptions(req); assert.throws(() => PK.verifyLogin(req, assertion(o, { origin: "https://evil.test" })), /Herkunft/);
  o = PK.loginOptions(req); assert.throws(() => PK.verifyLogin(req, assertion(o, { flags: 1 })), /bestätigt/, "ohne Face ID/Touch ID");
  const other = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
  o = PK.loginOptions(req); assert.throws(() => PK.verifyLogin(req, assertion(o, { key: other })), /Signatur/);
  assert.throws(() => PK.verifyLogin(req, assertion({ challenge: "erfunden" })), /abgelaufen/);
  process.env.ADMIN_PASSKEY_OFF = "1"; assert.strictEqual(PK.enabled(), false); delete process.env.ADMIN_PASSKEY_OFF;
  PK.remove(PK.list()[0].id); assert.strictEqual(PK.enabled(), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
