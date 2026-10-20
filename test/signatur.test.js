"use strict";
// Signatur in Rechnungs-/Mahnungsmails (sevdesk-ops.js): Vorschlagstext ohne doppelten Gruß, beim Senden Signatur darunter, abschaltbar.
const assert = require("assert"), path = require("path");
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push("✗ " + name + "\n    " + (e && e.stack || e)); } }
(async () => {
  const SIG = 'Liebe Grüße<br><br><table><tr><td><p style="margin:0"><b>Simon Felder</b></p><p>FS Creative · Webdesign &amp; Digitalagentur</p><p>+43 664 1430620</p></td></tr></table>';
  let sig = SIG; const sent = [];
  const O = require(path.join(__dirname, "..", "sevdesk-ops.js"))({ sev: async (m, p, o) => { if (/sendViaEmail/.test(p)) sent.push(o.body); return { objects: {} }; }, sevAll: async () => [], sevNum: x => +x || 0, sevDay: x => String(x || "").slice(0, 10),
    sevName: x => (x && x.name) || "", sevDateDE: d => d, sevNet: (g, r) => g / (1 + r / 100), viennaToday: () => "2026-10-20", sevMeta: async () => ({}), snapshot: async () => ({}), invalidate: () => {}, sevBook: async () => ({}), mailSignature: () => sig });
  const inv = { nr: "RE-1300", gross: 120, contact: { name: "Muster GmbH" }, type: "RE" };
  await t("Vorschlagstext: Gruß und Name entfallen, wenn die Signatur grüßt", async () => {
    const md = O.mailDefaults(inv, "", ""); assert.ok(/Vielen Dank für Ihren Auftrag!$/.test(md.text), md.text); assert.strictEqual(md.signature, SIG);
  });
  await t("Senden: Text + Signatur als HTML, Gruß aus dem Text nicht doppelt", async () => {
    await O.invoiceOp({ confirm: true, op: "send", id: "123", toEmail: "kunde@example.com", subject: "Rechnung", text: "Guten Tag,\n\nanbei die Rechnung.\n\nFreundliche Grüße\nSimon Felder\nFS Creative" });
    const h = sent.pop().text; assert.ok(h.indexOf("anbei die Rechnung.<br><br>Liebe Grüße") > -1, h); assert.ok(!/Freundliche Grüße/.test(h)); assert.strictEqual((h.match(/Simon Felder/g) || []).length, 1);
  });
  await t("Eigener Schlusssatz bleibt; Signatur abwählbar; ohne gespeicherte Signatur wie bisher", async () => {
    await O.invoiceOp({ confirm: true, op: "send", id: "123", toEmail: "k@example.com", subject: "R", text: "Hallo Maria,\n\nanbei die Rechnung. Melde dich bei Fragen jederzeit." });
    assert.ok(/jederzeit\.<br><br>Liebe Grüße/.test(sent.pop().text));
    await O.invoiceOp({ confirm: true, op: "send", id: "123", toEmail: "k@example.com", subject: "R", text: "Hallo\n\nFreundliche Grüße\nSimon", signature: false });
    assert.strictEqual(sent.pop().text, "Hallo<br><br>Freundliche Grüße<br>Simon");
    sig = ""; const md = O.mailDefaults(inv, "", ""); assert.ok(/Freundliche Grüße\nSimon Felder\nFS Creative$/.test(md.text));
    await O.invoiceOp({ confirm: true, op: "send", id: "123", toEmail: "k@example.com", subject: "R", text: md.text }); assert.ok(/FS Creative$/.test(sent.pop().text));
  });
  await t("Signatur ohne Gruß: Gruß im Text bleibt, nur der Name entfällt", async () => {
    sig = "<b>Simon Felder</b><br>FS Creative"; assert.strictEqual(O._sig.trimForSig("Danke!\n\nFreundliche Grüße\nSimon Felder", sig), "Danke!\n\nFreundliche Grüße");
  });
  console.log(fails.join("\n")); console.log("Signatur: " + pass + " bestanden, " + fail + " fehlgeschlagen");
  process.exit(fail ? 1 : 0);
})();
