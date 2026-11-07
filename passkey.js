"use strict";
/* Passkey als zweiter Faktor fürs Cockpit (Simon 07.11.2026): nach dem Passwort Face ID / Touch ID (WebAuthn).
   Eigene, schlanke Prüfung ohne Fremdbibliothek: Attestation „none“, Algorithmen ES256 (-7) und RS256 (-257).
   Geprüft wird: Challenge (einmalig, 5 Min.), Herkunft (https://<host>), rpIdHash, „Benutzer anwesend + verifiziert“, Signatur und Zähler.
   Gespeichert werden nur öffentliche Schlüssel (DATA_DIR/admin-passkeys.json). Notausgang: Railway-Variable ADMIN_PASSKEY_OFF=1. */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

module.exports = function (D) {
  const FILE = path.join(D.DATA_DIR, "admin-passkeys.json");
  const load = () => { try { return JSON.parse(fs.readFileSync(FILE, "utf8")) || []; } catch (e) { return []; } };
  const save = l => fs.writeFileSync(FILE, JSON.stringify(l));
  const b64u = b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64u = s => Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const CH = new Map();   // challenge → {kind, exp}
  function challenge(kind) { const c = b64u(crypto.randomBytes(32)); CH.set(c, { kind, exp: Date.now() + 300000 }); for (const [k, v] of CH) if (v.exp < Date.now()) CH.delete(k); return c; }
  function takeChallenge(c, kind) { const v = CH.get(c); CH.delete(c); return !!(v && v.kind === kind && v.exp > Date.now()); }

  // ── minimaler CBOR-Leser (reicht für attestationObject und COSE-Schlüssel) ──
  function cbor(buf) {
    let i = 0;
    const len = ai => { if (ai < 24) return ai; if (ai === 24) return buf[i++]; if (ai === 25) { const v = buf.readUInt16BE(i); i += 2; return v; } if (ai === 26) { const v = buf.readUInt32BE(i); i += 4; return v; } throw new Error("CBOR: Länge nicht unterstützt"); };
    function item() {
      const b = buf[i++], mt = b >> 5, ai = b & 31;
      if (mt === 0) return len(ai);
      if (mt === 1) return -1 - len(ai);
      if (mt === 2) { const n = len(ai), v = buf.slice(i, i + n); i += n; return v; }
      if (mt === 3) { const n = len(ai), v = buf.slice(i, i + n).toString("utf8"); i += n; return v; }
      if (mt === 4) { const n = len(ai), a = []; for (let k = 0; k < n; k++) a.push(item()); return a; }
      if (mt === 5) { const n = len(ai), m = new Map(); for (let k = 0; k < n; k++) { const key = item(); m.set(key, item()); } return m; }
      if (mt === 7) { if (ai === 20) return false; if (ai === 21) return true; if (ai === 22) return null; }
      throw new Error("CBOR: Typ nicht unterstützt");
    }
    const v = item(); return { value: v, end: i };
  }
  function coseToKey(m) {
    const kty = m.get(1), alg = m.get(3);
    if (kty === 2 && alg === -7) return { alg, jwk: { kty: "EC", crv: "P-256", x: b64u(m.get(-2)), y: b64u(m.get(-3)) } };
    if (kty === 3 && alg === -257) return { alg, jwk: { kty: "RSA", n: b64u(m.get(-1)), e: b64u(m.get(-2)) } };
    throw new Error("Schlüsseltyp nicht unterstützt");
  }
  function parseAuthData(a) {
    const rpIdHash = a.slice(0, 32), flags = a[32], counter = a.readUInt32BE(33), out = { rpIdHash, flags, counter, up: !!(flags & 1), uv: !!(flags & 4) };
    if (flags & 64) {   // angehängte Zugangsdaten (nur bei der Registrierung)
      const idLen = a.readUInt16BE(53), credId = a.slice(55, 55 + idLen), c = cbor(a.slice(55 + idLen));
      out.credId = credId; out.key = coseToKey(c.value);
    }
    return out;
  }
  const rpId = req => String(req.headers.host || "").split(":")[0].toLowerCase();
  const origin = req => "https://" + String(req.headers.host || "").toLowerCase();
  function clientData(raw, type, req) {
    const cd = JSON.parse(unb64u(raw).toString("utf8"));
    if (cd.type !== type) throw new Error("Falscher Ablauf");
    if (cd.origin !== origin(req)) throw new Error("Falsche Herkunft");
    return cd;
  }

  return {
    enabled: () => !process.env.ADMIN_PASSKEY_OFF && load().length > 0,
    list: () => load().map(k => ({ id: k.id, name: k.name, created: k.created, lastUsed: k.lastUsed || null })),
    remove(id) { const l = load(), n = l.filter(k => k.id !== id); if (n.length === l.length) throw new Error("Nicht gefunden"); save(n); return n.length; },
    registerOptions(req) {
      return { challenge: challenge("reg"), rp: { id: rpId(req), name: "FS Cockpit" }, user: { id: b64u(Buffer.from("fs-cockpit-admin")), name: "simon", displayName: "Simon · FS Cockpit" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }], timeout: 120000, attestation: "none",
        authenticatorSelection: { residentKey: "preferred", userVerification: "required" }, excludeCredentials: load().map(k => ({ type: "public-key", id: k.id })) };
    },
    register(req, b) {
      const cd = clientData(b.clientDataJSON, "webauthn.create", req);
      if (!takeChallenge(cd.challenge, "reg")) throw new Error("Anfrage abgelaufen – bitte noch einmal");
      const att = cbor(unb64u(b.attestationObject)).value, ad = parseAuthData(att.get("authData"));
      if (!ad.rpIdHash.equals(crypto.createHash("sha256").update(rpId(req)).digest())) throw new Error("Falsche Domain");
      if (!ad.up || !ad.uv) throw new Error("Face ID / Touch ID wurde nicht bestätigt");
      if (!ad.credId || !ad.key) throw new Error("Kein Schlüssel erhalten");
      crypto.createPublicKey({ key: ad.key.jwk, format: "jwk" });   // Schlüssel muss gültig sein
      const l = load(), id = b64u(ad.credId); if (l.some(k => k.id === id)) throw new Error("Dieser Passkey ist schon eingetragen");
      l.push({ id, alg: ad.key.alg, jwk: ad.key.jwk, counter: ad.counter, name: String(b.name || "Passkey").slice(0, 60), created: new Date().toISOString() }); save(l);
      return { id };
    },
    loginOptions(req) { return { challenge: challenge("auth"), rpId: rpId(req), timeout: 120000, userVerification: "required", allowCredentials: load().map(k => ({ type: "public-key", id: k.id })) }; },
    verifyLogin(req, b) {
      const cd = clientData(b.clientDataJSON, "webauthn.get", req);
      if (!takeChallenge(cd.challenge, "auth")) throw new Error("Anfrage abgelaufen – bitte noch einmal");
      const l = load(), k = l.find(x => x.id === b.id); if (!k) throw new Error("Unbekannter Passkey");
      const ad = unb64u(b.authenticatorData), info = parseAuthData(ad);
      if (!info.rpIdHash.equals(crypto.createHash("sha256").update(rpId(req)).digest())) throw new Error("Falsche Domain");
      if (!info.up || !info.uv) throw new Error("Face ID / Touch ID wurde nicht bestätigt");
      const data = Buffer.concat([ad, crypto.createHash("sha256").update(unb64u(b.clientDataJSON)).digest()]);
      const key = crypto.createPublicKey({ key: k.jwk, format: "jwk" });
      const ok = k.alg === -7 ? crypto.verify("sha256", data, { key, dsaEncoding: "der" }, unb64u(b.signature)) : crypto.verify("sha256", data, key, unb64u(b.signature));
      if (!ok) throw new Error("Signatur ungültig");
      if (info.counter > 0 && info.counter <= (k.counter || 0)) throw new Error("Passkey-Zähler passt nicht (Kopie?)");   // Apple-Passkeys melden 0 – dann keine Zählerprüfung
      k.counter = info.counter; k.lastUsed = new Date().toISOString(); save(l);
      return true;
    },
    _test: { cbor, parseAuthData, coseToKey, b64u, unb64u }
  };
};
