/* Angebotsnummern der eigenen Buchhaltung (fin-local.js): immer „AN-…“, nie doppelt, Nummernkreis zählt weiter;
   alte Angebote mit nackter Nummer („1052“, Fehler bis 28.10.2026) werden beim Laden einmalig umnummeriert.
   Aufruf: node test/angebotsnummer.test.js   (Dateispeicher statt Postgres, keine Produktivdaten) */
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path"), os = require("os");

const ROOT = path.join(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-annr-"));
fs.copyFileSync(path.join(ROOT, "fin-local.js"), path.join(TMP, "fin-local.js"));

let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }

function fileFin(seed) {
  const OBJ = path.join(TMP, "fin_obj_" + Math.random().toString(36).slice(2) + ".json");
  const rd = () => { try { return JSON.parse(fs.readFileSync(OBJ, "utf8")); } catch (e) { return {}; } };
  const wr = o => fs.writeFileSync(OBJ, JSON.stringify(o));
  const o0 = {}; seed.forEach(([type, data]) => { o0[type + "|" + data.id] = { type, id: String(data.id), data }; }); wr(o0);
  const meta = {};
  return {
    init: async () => true,
    db: () => ({ query: async (sql, args) => {
      const o = rd();
      if (/^select type, id, data from fin_obj/.test(sql)) return { rows: Object.values(o) };
      if (/^insert into fin_obj/.test(sql)) { o[args[0] + "|" + args[1]] = { type: args[0], id: String(args[1]), data: JSON.parse(args[2]) }; wr(o); return { rowCount: 1 }; }
      if (/^delete from fin_obj where type=\$1 and id=\$2/.test(sql)) { delete o[args[0] + "|" + args[1]]; wr(o); return { rowCount: 1 }; }
      return { rows: [], rowCount: 0 };
    } }),
    getMeta: async k => (k in meta ? meta[k] : null), setMeta: async (k, v) => { meta[k] = v; },
    putFileRaw: async () => {}, getFile: async () => null,
    stored: (type, id) => (rd()[type + "|" + id] || {}).data,
  };
}
const seq = { id: "77", objectType: "Order", forObject: "Order", type: "AN", nextSequence: "1052", format: "" };   // wie übernommen: ohne [%NUMBER]
const order = (id, nr, create, extra) => ["Order", Object.assign({ id, objectName: "Order", orderNumber: nr, orderType: "AN", status: "100", orderDate: "2026-10-28T00:00:00+01:00", header: "Angebot", create, contact: { id: "1", objectName: "Contact" } }, extra || {})];
const SEED = [["SevSequence", seq],
  order("30421417", "AN-1051", "2026-09-16T10:00:00+02:00"), order("30425123", "AN-1052", "2026-09-16T11:00:00+02:00"),
  order("900000000", "1052", "2026-10-28T09:00:00+01:00", { status: "200", header: "Angebot 1052", footText: "Dieses Angebot ist gültig bis 27.11.2026.\nMit besten Grüßen" }), order("900000001", "1052", "2026-10-28T10:00:00+01:00"),
  order("30340510", "AN-1049", "2026-09-11T10:00:00+02:00", { status: "500", footText: "Dieses Angebot ist gültig bis 11.10.2026." }),
  order("30340511", "AN-1048", "2026-09-10T10:00:00+02:00", { status: "200", footText: "Gültig bis: 1.2.2027" })];

(async () => {
  const fin = fileFin(SEED);
  const L = require(path.join(TMP, "fin-local.js"))({ fin, renderPdf: async () => Buffer.from("%PDF"), mailSend: async () => ({}) });
  await L.load();

  await t("bestehende Angebote mit nackter Nummer werden in Anlage-Reihenfolge umnummeriert, alte Nummer bleibt vermerkt", async () => {
    const a = L.get("Order", "900000000"), b = L.get("Order", "900000001");
    assert.strictEqual(a.orderNumber, "AN-1053"); assert.strictEqual(a.formerNumber, "1052"); assert.strictEqual(a.header, "Angebot AN-1053");
    assert.strictEqual(b.orderNumber, "AN-1054"); assert.strictEqual(b.formerNumber, "1052"); assert.strictEqual(b.header, "Angebot");
    assert.strictEqual(a.status, "200", "Status bleibt"); assert.strictEqual(L.get("Order", "30425123").orderNumber, "AN-1052", "echte AN-1052 bleibt");
    assert.strictEqual(fin.stored("Order", "900000000").orderNumber, "AN-1053", "gespeichert");
  });
  await t("offene Angebote gelten bis 31.12.2026 (Satz ersetzt bzw. ergänzt, PDF wird neu erzeugt), angenommene und längere bleiben", async () => {
    const a = L.get("Order", "900000000"), b = L.get("Order", "900000001");
    assert.strictEqual(a.footText, "Dieses Angebot ist gültig bis 31.12.2026.\nMit besten Grüßen"); assert.strictEqual(a._dirty, true);
    assert.strictEqual(b.footText, "Dieses Angebot ist gültig bis 31.12.2026.");
    assert.strictEqual(L.get("Order", "30340510").footText, "Dieses Angebot ist gültig bis 11.10.2026.", "angenommen (500) unverändert");
    assert.strictEqual(L.get("Order", "30340511").footText, "Gültig bis: 1.2.2027", "schon länger gültig → unverändert");
  });
  await t("Umnummerieren läuft nur einmal (zweites Laden ändert nichts)", async () => {
    await L.load(true);
    assert.strictEqual(L.get("Order", "900000000").orderNumber, "AN-1053"); assert.strictEqual(L.get("Order", "900000001").orderNumber, "AN-1054");
  });
  await t("Nummernkreis-Abfrage liefert Präfix und die nächste freie Nummer", async () => {
    const r = await L.request("GET", "/SevSequence/Factory/getByType", { query: { objectType: "Order", type: "AN" } });
    const s = r.objects[0]; assert.strictEqual(s.format, "AN-[%NUMBER]"); assert.strictEqual(s.nextSequence, "1055");
  });
  const newOrder = async nr => (await L.request("POST", "/Order/Factory/saveOrder", { body: { order: Object.assign({ objectName: "Order", orderType: "AN", orderDate: "28.10.2026", header: "Angebot", contact: { id: "1", objectName: "Contact" } }, nr ? { orderNumber: nr } : {}), orderPosSave: [] } })).objects.order.orderNumber;
  await t("mitgeschickte freie Nummer wird übernommen und der Nummernkreis zählt weiter", async () => {
    assert.strictEqual(await newOrder("AN-1055"), "AN-1055");
    const s = (await L.request("GET", "/SevSequence/Factory/getByType", { query: { objectType: "Order", type: "AN" } })).objects[0];
    assert.strictEqual(s.nextSequence, "1056");
  });
  await t("nackte oder doppelte Nummer → nächste freie AN-Nummer", async () => {
    assert.strictEqual(await newOrder("1052"), "AN-1056");
    assert.strictEqual(await newOrder("AN-1051"), "AN-1057");
  });
  await t("ohne Nummer → nächste freie AN-Nummer", async () => { assert.strictEqual(await newOrder(""), "AN-1058"); });
  await t("keine Angebotsnummer doppelt", async () => {
    const nrs = L.all("Order").map(o => o.orderNumber); assert.strictEqual(new Set(nrs).size, nrs.length, nrs.join(","));
  });

  fs.rmSync(TMP, { recursive: true, force: true });
  if (fails.length) console.log(fails.join("\n\n"));
  console.log("angebotsnummer: " + pass + " bestanden, " + fail + " fehlgeschlagen");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
