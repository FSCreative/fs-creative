// Reklamationen (claims.js): Erkennung aus Mails (Vorfilter + KI-Attrappe), Verlauf, Vorschläge, Status – nur fiktive Testdaten
const assert = require("assert");
const path = require("path");
function make() {
  const meta = {}, pushes = [];
  const C = require(path.join(__dirname, "..", "claims.js"))({ send: (res, code, b) => { res.out = JSON.parse(b); }, body: async r => r.pl,
    getMeta: async k => (meta[k] ? JSON.parse(JSON.stringify(meta[k])) : null), setMeta: async (k, v) => { meta[k] = JSON.parse(JSON.stringify(v)); },
    snapshot: async () => ({ messages: [] }), push: async (t, m) => { pushes.push(m); return 1; },
    ki: { claimsOn: () => true, claimCheck: async items => items.map(x => ({ key: x.key, isClaim: /kaputt|falsch/i.test(x.text), confidence: /kaputt/i.test(x.text) ? 0.9 : 0.5, reason: "Test", problem: "Problem", category: "beschaedigt", orderNr: "", invoiceNr: "", customer: "Max Test" })) },
    print: () => ({ claimOrders: async q => (q.nr === "D-261120-ABCD" ? [{ id: "o1", nr: "D-261120-ABCD", invoice: { nr: "RE-9999" }, customer: "Max Test" }] : []) }), chat: () => null });
  return { C, meta, pushes };
}
const call = async (C, method, pl, qs) => { const res = {}; await C.handle({ method, pl }, res, new URL("http://x/admin/api/claims" + (qs || ""))); return res.out; };
(async () => {
  let n = 0;
  const { C, pushes } = make();
  assert.strictEqual((await call(C, "GET")).claims.length, 0);
  await new Promise(r => setTimeout(r, 5));
  const t = () => new Date().toISOString();
  await C.onMail({ messages: [
    { id: "m1", uid: 1, folder: "INBOX", account: "fs", from: "kunde@example.org", fromName: "Max Test", subject: "Flyer kaputt angekommen D-261120-ABCD", body: "Die Flyer sind kaputt angekommen.", date: t(), messageId: "<a@x>", attachments: [{ index: "p:2", filename: "foto.jpg", contentType: "image/jpeg", size: 1000 }] },
    { id: "m2", uid: 2, folder: "INBOX", account: "fs", from: "anna@example.org", fromName: "Anna Beispiel", subject: "Frage", body: "Falsche Farbe, stimmt nicht mit dem Entwurf überein", date: t(), messageId: "<b@x>" },
    { id: "m3", uid: 3, folder: "INBOX", account: "fs", from: "info@example.org", subject: "Angebot", body: "Bitte um ein Angebot für 500 Flyer", date: t() }] });
  let v = await call(C, "GET");
  assert.strictEqual(v.claims.length, 1, "sichere Reklamation automatisch angelegt"); n++;
  assert.strictEqual(v.claims[0].orderNr, "D-261120-ABCD"); assert.strictEqual(v.claims[0].invoiceNr, "RE-9999"); n++;
  assert.deepStrictEqual(v.sugg.map(s => s.key), ["m:m2"], "unsichere als Vorschlag, Anfrage ignoriert"); n++;
  assert.strictEqual(pushes.length, 1); n++;
  await C.onMail({ messages: [{ id: "m4", uid: 4, folder: "INBOX", account: "fs", from: "kunde@example.org", fromName: "Max Test", subject: "Re: Flyer kaputt angekommen D-261120-ABCD", body: "Hier noch ein Foto", date: t(), messageId: "<c@x>", inReplyTo: "<a@x>" }] });
  const id = v.claims[0].id, d = await call(C, "GET", null, "?id=" + id);
  assert.strictEqual(d.claim.mails.length, 2, "Antwort im Verlauf angehängt"); assert.strictEqual(d.orders.length, 1); n++;
  const s = await call(C, "POST", { confirm: true, op: "status", id, status: "loesung", resolution: "nachdruck", amount: 12.5 });
  assert.strictEqual(s.claim.status, "loesung"); assert.strictEqual(s.claim.resolution, "nachdruck"); n++;
  const a = await call(C, "POST", { confirm: true, op: "accept", key: "m:m2" }); assert.strictEqual(a.claims.length, 2); assert.strictEqual(a.sugg.length, 0); n++;
  assert.strictEqual((await call(C, "POST", { op: "delete", id })).ok, false, "ohne Bestätigung nichts ändern"); n++;
  assert.strictEqual((await call(C, "POST", { confirm: true, op: "delete", id })).claims.length, 1); n++;
  console.log("Reklamationen: " + n + " bestanden, 0 fehlgeschlagen");
})().catch(e => { console.error(e); process.exit(1); });
