"use strict";
// Mail-Regeln: greifen sofort mit dem frischen Stand, weggeräumte Mails sind bis zum Abschluss verborgen
const test = require("node:test");
const assert = require("node:assert");

test("Mail-Regeln: sofort mit Stand, Treffer verborgen, ohne Treffer sichtbar", async () => {
  const meta = { mailRules: [{ id: "r1", name: "Lieferant → Ordner", active: true, cond: { from: "lieferant-test.example", account: "fs" }, act: { move: "fs|INBOX.Lieferant", seen: true }, since: "2020-01-01T00:00:00.000Z" }] };
  const calls = []; let release; const gate = new Promise(r => { release = r; });
  const R = require("../mail-rules.js")({
    getMeta: async k => meta[k] || null, setMeta: async (k, v) => { meta[k] = v; },
    snapshot: async () => { throw new Error("darf nicht abgefragt werden, Stand wurde mitgegeben"); },
    action: async (op, items, target) => { calls.push([op, items.length, target || ""]); await gate; },
  });
  const snap = { messages: [
    { id: "a1", account: "fs", folder: "INBOX", uid: 11, from: "rechnung@lieferant-test.example", fromName: "Lieferant", subject: "Rechnung 1", date: "2026-11-05T10:00:00.000Z" },
    { id: "b2", account: "fs", folder: "INBOX", uid: 12, from: "kunde@beispiel.example", fromName: "Kunde", subject: "Anfrage", date: "2026-11-05T10:01:00.000Z" },
  ] };
  const p = R.tick(snap);
  await new Promise(r => setImmediate(r));
  assert.strictEqual(R.hidden("a1"), true, "Treffer bleibt verborgen, solange verschoben wird");
  assert.strictEqual(R.hidden("b2"), false, "andere Mails bleiben sichtbar");
  release(); await p;
  assert.deepStrictEqual(calls, [["seen", 1, ""], ["move", 1, "INBOX.Lieferant"]]);
  assert.strictEqual(meta.mailRules[0].hits, 1);
  // gleiche Mail kommt noch einmal im Stand vor (Mailserver noch nicht nachgezogen) → nicht doppelt anwenden
  await R.tick(snap); assert.strictEqual(calls.length, 2);
});
