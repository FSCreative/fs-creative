"use strict";
// Eigene Buchhaltung: Datenspeicher (Postgres) + einmalige Vollübernahme aus sevDesk (alle Jahre, alle Objekte, alle PDFs/Belegdateien).
// sevDesk wird dabei nur gelesen. Objekte werden 1:1 (gleiche IDs, Rohdaten) gespeichert, damit Nummernkreise,
// Verknüpfungen und Steuerberechnungen unverändert weiterlaufen. Dateien liegen als bytea in fin_file.
const crypto = require("crypto");
module.exports = function (D) {
  const { sev, sevAll } = D;
  let pool = null, ready = null;
  function db() {
    if (!process.env.DATABASE_URL) { const e = new Error("Keine Datenbank (DATABASE_URL fehlt)"); e.status = 503; throw e; }
    if (!pool) {
      const { Pool } = require("pg");
      pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, ssl: /sslmode=disable|railway\.internal|localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
      pool.on("error", e => console.error("fin db:", e && e.message));
    }
    return pool;
  }
  async function init() {
    if (ready) return ready;
    ready = (async () => {
      const c = db();
      await c.query(`create table if not exists fin_obj (type text not null, id text not null, data jsonb not null, src text not null default 'sevdesk', updated_at timestamptz not null default now(), primary key (type, id))`);
      await c.query(`create index if not exists fin_obj_type on fin_obj(type)`);
      await c.query(`create table if not exists fin_file (kind text not null, ref_type text not null, ref_id text not null, filename text, mime text, size int, sha256 text, data bytea, created_at timestamptz not null default now(), primary key (kind, ref_type, ref_id))`);
      await c.query(`create table if not exists fin_meta (key text primary key, value jsonb, updated_at timestamptz not null default now())`);
      return true;
    })().catch(e => { ready = null; throw e; });
    return ready;
  }
  async function putObjs(type, arr) {
    if (!arr.length) return 0;
    const c = db(); let n = 0;
    for (let i = 0; i < arr.length; i += 200) {
      const chunk = arr.slice(i, i + 200), vals = [], params = [];
      chunk.forEach((o, k) => { params.push(type, String(o.id), JSON.stringify(o)); vals.push("($" + (k * 3 + 1) + ",$" + (k * 3 + 2) + ",$" + (k * 3 + 3) + "::jsonb)"); });
      await c.query("insert into fin_obj(type,id,data) values " + vals.join(",") + " on conflict (type,id) do update set data=excluded.data, updated_at=now()", params);
      n += chunk.length;
    }
    return n;
  }
  async function setMeta(key, value) { await db().query("insert into fin_meta(key,value) values($1,$2::jsonb) on conflict(key) do update set value=excluded.value, updated_at=now()", [key, JSON.stringify(value)]); }
  async function getMeta(key) { const r = await db().query("select value from fin_meta where key=$1", [key]); return r.rows[0] ? r.rows[0].value : null; }
  async function hasFile(kind, refType, refId) { const r = await db().query("select 1 from fin_file where kind=$1 and ref_type=$2 and ref_id=$3", [kind, refType, String(refId)]); return r.rowCount > 0; }
  async function putFile(kind, refType, refId, f) {
    const sha = crypto.createHash("sha256").update(f.buf).digest("hex");
    await db().query("insert into fin_file(kind,ref_type,ref_id,filename,mime,size,sha256,data) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict (kind,ref_type,ref_id) do update set filename=excluded.filename, mime=excluded.mime, size=excluded.size, sha256=excluded.sha256, data=excluded.data",
      [kind, refType, String(refId), f.name || null, f.type || null, f.buf.length, sha, f.buf]);
  }
  async function getFile(kind, refType, refId) { const r = await db().query("select filename,mime,size,data from fin_file where kind=$1 and ref_type=$2 and ref_id=$3", [kind, refType, String(refId)]); return r.rows[0] || null; }

  // sevDesk-Antwort mit Datei → {buf,type,name}
  function fileFrom(rr, fallback) {
    if (rr && rr.buf && rr.buf.length > 16) { const m = String(rr.disposition || "").match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i); return { buf: rr.buf, type: rr.type || "application/octet-stream", name: m ? decodeURIComponent(m[1]) : fallback }; }
    const o = rr && rr.json && rr.json.objects; const x = o && (o.content ? o : (Array.isArray(o) ? o[0] : null));
    if (x && x.content) return { buf: Buffer.from(String(x.content), x.base64encoded === false ? "binary" : "base64"), type: x.mimeType || x.mimetype || "application/pdf", name: x.filename || fallback };
    return null;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Übernahme ──
  // Reihenfolge: Stammdaten → Belege/Rechnungen → Bank → Dateien. Unbekannte/gesperrte Endpunkte werden übersprungen und protokolliert.
  const ENTITIES = [
    ["Contact", { depth: 1 }], ["ContactAddress", {}], ["CommunicationWay", {}], ["CommunicationWayKey", {}], ["ContactCustomField", {}], ["ContactCustomFieldSetting", {}],
    ["Category", {}], ["Unity", {}], ["TaxSet", {}], ["TaxRule", {}], ["AccountingType", {}], ["SevUser", {}],
    ["Part", {}], ["Tag", {}], ["TagRelation", {}], ["TextTemplate", {}],
    ["Invoice", {}], ["InvoicePos", {}], ["CreditNote", {}], ["CreditNotePos", {}], ["Order", {}], ["OrderPos", {}],
    ["Voucher", {}], ["VoucherPos", {}],
    ["CheckAccount", {}], ["CheckAccountTransaction", {}], ["CheckAccountTransactionLog", {}],
    ["DocumentFolder", {}], ["Document", {}], ["SevSequence", {}], ["SevClient", {}],
  ];
  const JOB = { running: false, phase: "", done: 0, total: 0, counts: {}, files: { ok: 0, fail: 0, skip: 0 }, errors: [], startedAt: null, finishedAt: null, docPath: null };
  function log(msg) { JOB.errors.push(String(msg).slice(0, 300)); if (JOB.errors.length > 200) JOB.errors.shift(); console.log("fin-import:", msg); }
  async function importAll(opts) {
    opts = opts || {};
    if (JOB.running) throw new Error("Übernahme läuft bereits");
    await init();
    Object.assign(JOB, { running: true, phase: "Stammdaten & Belege", done: 0, total: ENTITIES.length, counts: {}, files: { ok: 0, fail: 0, skip: 0 }, errors: [], startedAt: new Date().toISOString(), finishedAt: null });
    try {
      for (const [type, q] of ENTITIES) {
        JOB.phase = "Lade " + type;
        try {
          let arr = await sevAll("/" + type, q, 200000);
          if (type === "Order") {   // sevDesk liefert ohne Typ nicht alle Angebote/Aufträge/Lieferscheine – je Typ nachladen
            const seen = new Set(arr.map(o => String(o.id)));
            for (const ot of ["AN", "AB", "LI"]) { try { (await sevAll("/Order", { orderType: ot }, 200000)).forEach(o => { if (!seen.has(String(o.id))) { seen.add(String(o.id)); arr.push(o); } }); } catch (e) {} }
          }
          JOB.counts[type] = await putObjs(type, arr);
        }
        catch (e) { JOB.counts[type] = "–"; log(type + ": " + (e.status || "") + " " + (e.message || e)); }
        JOB.done++;
      }
      await setMeta("import", { at: new Date().toISOString(), counts: JOB.counts });
      if (!opts.noFiles) await importFiles();
      JOB.phase = "Fertig";
      await setMeta("import", { at: new Date().toISOString(), counts: JOB.counts, files: JOB.files, docPath: JOB.docPath });
    } catch (e) { log("Abbruch: " + (e.message || e)); JOB.phase = "Fehler"; }
    finally { JOB.running = false; JOB.finishedAt = new Date().toISOString(); }
  }
  async function ids(type) { const r = await db().query("select id, data from fin_obj where type=$1 order by (id)::bigint", [type]); return r.rows; }
  async function importFiles() {
    const inv = await ids("Invoice"), cn = await ids("CreditNote"), ord = await ids("Order"), vou = await ids("Voucher");
    const vouDocs = vou.filter(r => r.data && r.data.document && r.data.document.id);
    JOB.total = inv.length + cn.length + ord.length + vouDocs.length; JOB.done = 0;
    const one = async (kind, refType, id, path, name) => {
      JOB.done++;
      if (await hasFile(kind, refType, id)) { JOB.files.skip++; return true; }
      try {
        const rr = await sev("GET", path, { query: { download: "true", preventSendBy: "true" }, timeout: 60000, binary: true });
        const f = fileFrom(rr, name); if (!f) throw new Error("leere Antwort");
        await putFile(kind, refType, id, f); JOB.files.ok++; return true;
      } catch (e) { return e; }
      finally { await sleep(120); }
    };
    JOB.phase = "PDFs Rechnungen";
    for (const r of inv) { const res = await one("pdf", "Invoice", r.id, "/Invoice/" + r.id + "/getPdf", (r.data.invoiceNumber || "Rechnung-" + r.id) + ".pdf"); if (res !== true) { JOB.files.fail++; log("Invoice " + r.id + ": " + (res && res.message)); } }
    JOB.phase = "PDFs Gutschriften";
    for (const r of cn) { const res = await one("pdf", "CreditNote", r.id, "/CreditNote/" + r.id + "/getPdf", (r.data.creditNoteNumber || "Gutschrift-" + r.id) + ".pdf"); if (res !== true) { JOB.files.fail++; log("CreditNote " + r.id + ": " + (res && res.message)); } }
    JOB.phase = "PDFs Angebote/Aufträge";
    for (const r of ord) { const res = await one("pdf", "Order", r.id, "/Order/" + r.id + "/getPdf", (r.data.orderNumber || "Auftrag-" + r.id) + ".pdf"); if (res !== true) { JOB.files.fail++; log("Order " + r.id + ": " + (res && res.message)); } }
    // Belegdateien: Endpunkt ist nicht dokumentiert – bekannte Varianten probieren und die funktionierende merken
    JOB.phase = "Belegdateien";
    const cand = (vid, did) => [["/Document/" + did + "/download", {}], ["/Document/" + did + "/getFile", {}], ["/Voucher/" + vid + "/getDocument", {}], ["/Document/" + did, { download: "true" }]];
    for (const r of vouDocs) {
      JOB.done++;
      const vid = r.id, did = String(r.data.document.id);
      if (await hasFile("doc", "Voucher", vid)) { JOB.files.skip++; continue; }
      let ok = false, last = "";
      const tries = JOB.docPath != null ? [cand(vid, did)[JOB.docPath]] : cand(vid, did);
      for (let t = 0; t < tries.length && !ok; t++) {
        try {
          const rr = await sev("GET", tries[t][0], { query: Object.assign({ download: "true" }, tries[t][1]), timeout: 60000, binary: true });
          const f = fileFrom(rr, (r.data.document.filename || ("Beleg-" + vid)));
          if (f) { await putFile("doc", "Voucher", vid, f); ok = true; if (JOB.docPath == null) { JOB.docPath = t; log("Belegdateien über " + tries[t][0].replace(/\d+/g, "{id}")); } }
          else last = "leere Antwort";
        } catch (e) { last = (e.status || "") + " " + (e.message || e); }
      }
      if (ok) JOB.files.ok++; else { JOB.files.fail++; log("Voucher " + vid + " (Dokument " + did + "): " + last); }
      await sleep(120);
    }
  }
  async function status() {
    let stored = null, meta = null;
    try { await init(); const r = await db().query("select type, count(*)::int n from fin_obj group by type order by type"); stored = r.rows; const f = await db().query("select kind, ref_type, count(*)::int n, coalesce(sum(size),0)::bigint bytes from fin_file group by kind, ref_type"); stored = { objects: r.rows, files: f.rows }; meta = await getMeta("import"); }
    catch (e) { stored = { error: e.message }; }
    return { ok: true, job: JOB, stored, last: meta };
  }

  // ── Routen (/admin/api/fin/…) ──
  async function handle(req, res, u, p, send, body) {
    const J = (code, o) => send(res, code, JSON.stringify(o), "application/json; charset=utf-8", { "Cache-Control": "no-store" });
    try {
      if (p === "/admin/api/fin/import" && req.method === "GET") return J(200, await status());
      if (p === "/admin/api/fin/import" && req.method === "POST" && !D.importAllowed) return J(410, { ok: false, error: "Die sevDesk-Verbindung ist entfernt – es gibt nichts mehr zu übernehmen." });
      if (p === "/admin/api/fin/import" && req.method === "POST") {
        const pl = await body(req); if (pl.confirm !== true) return J(400, { ok: false, error: "Bestätigung fehlt" });
        importAll({ noFiles: !!pl.noFiles }).catch(e => log(e.message));
        return J(200, { ok: true, started: true });
      }
      if (p === "/admin/api/fin/obj" && req.method === "GET") {   // Einsicht in übernommene Rohdaten (nur Admin)
        await init(); const t = u.searchParams.get("type") || "", id = u.searchParams.get("id"), qq = u.searchParams.get("q") || "";
        const r = id ? await db().query("select data from fin_obj where type=$1 and id=$2", [t, id]) : await db().query("select data from fin_obj where type=$1 and ($2 = '' or data::text ilike '%' || $2 || '%') order by updated_at desc limit $3", [t, qq, Math.min(500, Math.max(1, parseInt(u.searchParams.get("limit") || "5", 10) || 5))]);
        return J(200, { ok: true, objects: r.rows.map(x => x.data) });
      }
      if (p === "/admin/api/fin/file" && req.method === "GET") {
        const f = await getFile(u.searchParams.get("kind") || "pdf", u.searchParams.get("type") || "Invoice", u.searchParams.get("id") || "");
        if (!f) return send(res, 404, "Datei nicht vorhanden", "text/plain; charset=utf-8");
        const nm = String(f.filename || "datei").replace(/[^\w.\- ]/g, "_");
        return send(res, 200, f.data, f.mime || "application/octet-stream", { "Content-Disposition": (u.searchParams.get("dl") === "1" ? "attachment" : "inline") + '; filename="' + nm + '"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
      }
    } catch (e) { return J(200, { ok: false, error: String(e.message || e).slice(0, 300) }); }
    return J(404, { ok: false, error: "not_found" });
  }
  return { init, handle, status, db, getFile, putFileRaw: putFile, putObjs, setMeta, getMeta };
};
