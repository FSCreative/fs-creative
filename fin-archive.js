"use strict";
// Buchhaltungs-Archiv je Jahr als ZIP (Aufbewahrungspflicht 7 Jahre, § 132 BAO): alle Rechnungen/Gutschriften/Angebote als PDF,
// alle Belegdateien, Bankumsätze und Listen als CSV, Rohdaten als JSON, Prüfsummen. Unabhängig von Cockpit und sevDesk lesbar.
// Wird gestreamt (Datei für Datei), damit große Jahre den Arbeitsspeicher nicht füllen. Nur lesend – bis auf das einmalige
// Ablegen fehlender PDFs abgeschlossener Dokumente (wie beim ersten Öffnen im Cockpit).
const crypto = require("crypto");
const zlib = require("zlib");

const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
const crc32 = buf => { if (typeof zlib.crc32 === "function") return zlib.crc32(buf) >>> 0; let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

module.exports = function (D) {
  const { fin, local } = D;
  const year = v => String(v || "").slice(0, 4);
  const day = v => { const t = String(v || ""); const m = t.match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ""; };
  const safe = s => String(s || "").normalize("NFC").replace(/[\\/:*?"<>|\r\n\t]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 60);
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const eur = v => num(v).toFixed(2).replace(".", ",");
  const csv = rows => "﻿" + rows.map(r => r.map(c => { const s = String(c == null ? "" : c); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(";")).join("\r\n") + "\r\n";
  const extOf = (name, mime) => { const m = String(name || "").match(/\.([a-z0-9]{2,5})$/i); if (m) return m[1].toLowerCase();
    return { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/webp": "webp", "text/xml": "xml", "application/xml": "xml" }[String(mime || "").toLowerCase()] || "bin"; };
  const contactName = id => { const c = id && local.get("Contact", String(id)); if (!c) return "";
    return String(c.name || [c.surename, c.familyname].filter(Boolean).join(" ") || c.name2 || "").trim(); };
  const STATUS = { 50: "Entwurf", 100: "Entwurf", 200: "offen", 750: "teilbezahlt", 1000: "bezahlt" };

  // ── ZIP-Schreiber (stored, Datei für Datei auf den Response) ──
  function zipWriter(res) {
    const central = []; let offset = 0, count = 0;
    const now = new Date(), dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const write = buf => new Promise(r => { if (res.write(buf)) r(); else res.once("drain", r); });
    return {
      async add(name, data) {
        const nm = Buffer.from(name, "utf8"), crc = crc32(data);
        const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
        lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26); lh.writeUInt16LE(0, 28);
        await write(Buffer.concat([lh, nm])); await write(data);
        const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
        ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(offset, 42);
        central.push(ch, nm); offset += 30 + nm.length + data.length; count++;
      },
      async end() {
        const cd = Buffer.concat(central), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(count, 8); e.writeUInt16LE(count, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16);
        await write(cd); await new Promise(r => res.end(e, r));
      }
    };
  }

  // Inhalt eines Jahres zusammenstellen (ohne Dateiinhalte – die werden beim Schreiben einzeln geladen)
  function plan(y) {
    const inv = local.all("Invoice").filter(o => year(o.invoiceDate) === y && String(o.status) !== "100" && String(o.status) !== "50");
    const cn = local.all("CreditNote").filter(o => year(o.creditNoteDate) === y && String(o.status) !== "100" && String(o.status) !== "50");
    const ord = local.all("Order").filter(o => year(o.orderDate) === y && String(o.status) !== "100");
    const vou = local.all("Voucher").filter(o => year(o.voucherDate) === y);
    const tx = local.all("CheckAccountTransaction").filter(o => year(o.valueDate) === y);
    return { inv, cn, ord, vou, tx };
  }
  function summary() {
    const ys = new Set(); ["Invoice:invoiceDate", "Voucher:voucherDate", "CheckAccountTransaction:valueDate"].forEach(k => { const [t, f] = k.split(":"); local.all(t).forEach(o => { const v = year(o[f]); if (/^20\d\d$/.test(v)) ys.add(v); }); });
    return [...ys].sort().reverse().map(y => { const p = plan(y); return { year: y, invoices: p.inv.length, creditNotes: p.cn.length, offers: p.ord.length, vouchers: p.vou.length, withFile: p.vou.filter(v => v.document && v.document.id).length, bank: p.tx.length }; });
  }

  async function pdfOf(type, o) {
    const f = await fin.getFile("pdf", type, o.id);
    if (f && f.data) return { buf: f.data, name: f.filename };
    const r = await local.request("GET", "/" + type + "/" + o.id + "/getPdf", { binary: true });   // abgeschlossen, aber noch nie geöffnet: erzeugen und unveränderlich ablegen
    return { buf: r.buf, name: "" };
  }

  async function stream(res, y) {
    await local.load();
    const p = plan(y), z = zipWriter(res), sums = [], missing = [], top = "Buchhaltung_" + y + "/";
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="FS-Creative_Buchhaltung_' + y + '.zip"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    const add = async (name, buf) => { await z.add(top + name, buf); sums.push(crypto.createHash("sha256").update(buf).digest("hex") + "  " + name); };
    const docs = [["Invoice", p.inv, "Rechnungen", o => o.invoiceNumber, o => o.invoiceDate], ["CreditNote", p.cn, "Gutschriften", o => o.creditNoteNumber, o => o.creditNoteDate], ["Order", p.ord, "Angebote", o => o.orderNumber, o => o.orderDate]];
    for (const [type, list, dir, nr, dt] of docs) {
      for (const o of list.slice().sort((a, b) => String(dt(a)).localeCompare(String(dt(b))) || String(nr(a)).localeCompare(String(nr(b))))) {
        try { const f = await pdfOf(type, o); await add(dir + "/" + safe([day(dt(o)), nr(o) || type + "-" + o.id, contactName(o.contact && o.contact.id)].filter(Boolean).join("_")) + ".pdf", f.buf); }
        catch (e) { missing.push(dir + ": " + (nr(o) || o.id) + " – " + (e.message || e)); }
      }
    }
    const used = new Set();
    for (const v of p.vou.slice().sort((a, b) => String(a.voucherDate).localeCompare(String(b.voucherDate)))) {
      if (!(v.document && v.document.id)) continue;
      const f = await fin.getFile("doc", "Voucher", v.id).catch(() => null);
      if (!f || !f.data) { missing.push("Beleg " + v.id + " (" + day(v.voucherDate) + ", " + (v.supplierName || v.supplierNameAtSave || "") + "): Datei fehlt"); continue; }
      let nm = safe([day(v.voucherDate), v.supplierName || v.supplierNameAtSave || contactName(v.supplier && v.supplier.id) || "Beleg", eur(v.sumGross) + " EUR", v.id].filter(Boolean).join("_")) + "." + extOf(f.filename, f.mime);
      if (used.has(nm)) nm = nm.replace(/(\.[a-z0-9]+)$/i, "_" + v.id + "$1"); used.add(nm);
      await add("Belege/" + nm, f.data);
    }
    // Listen
    await add("Listen/Rechnungen.csv", Buffer.from(csv([["Nummer", "Typ", "Datum", "Kunde", "Netto", "USt", "Brutto", "bezahlt", "Status", "storniert"]].concat(
      p.inv.slice().sort((a, b) => String(a.invoiceDate).localeCompare(String(b.invoiceDate))).map(o => [o.invoiceNumber, o.invoiceType || "RE", day(o.invoiceDate), contactName(o.contact && o.contact.id), eur(o.sumNet), eur(o.sumTax), eur(o.sumGross), eur(o.paidAmount), STATUS[o.status] || o.status, o.cancelled ? "ja" : ""])))));
    await add("Listen/Gutschriften.csv", Buffer.from(csv([["Nummer", "Datum", "Kunde", "Netto", "USt", "Brutto", "Status"]].concat(p.cn.map(o => [o.creditNoteNumber, day(o.creditNoteDate), contactName(o.contact && o.contact.id), eur(o.sumNet), eur(o.sumTax), eur(o.sumGross), STATUS[o.status] || o.status])))));
    await add("Listen/Belege.csv", Buffer.from(csv([["ID", "Datum", "Lieferant", "Beschreibung", "Art", "Netto", "Steuer", "Brutto", "Status", "Datei"]].concat(
      p.vou.slice().sort((a, b) => String(a.voucherDate).localeCompare(String(b.voucherDate))).map(v => [v.id, day(v.voucherDate), v.supplierName || v.supplierNameAtSave || contactName(v.supplier && v.supplier.id), v.description || "", v.creditDebit === "D" ? "Einnahme" : "Ausgabe", eur(v.sumNet), eur(v.sumTax), eur(v.sumGross), STATUS[v.status] || v.status, v.document && v.document.id ? "ja" : "nein"])))));
    const accs = local.all("CheckAccount");
    const byAcc = {}; p.tx.forEach(t => { const a = (t.checkAccount && String(t.checkAccount.id)) || "-"; (byAcc[a] = byAcc[a] || []).push(t); });
    for (const a of Object.keys(byAcc)) {
      const acc = accs.find(x => String(x.id) === a) || {};
      await add("Bank/" + safe(acc.name || ("Konto " + a)) + ".csv", Buffer.from(csv([["Valuta", "Buchung", "Betrag", "Name", "Verwendungszweck", "Status", "ID"]].concat(
        byAcc[a].sort((x, w) => String(x.valueDate).localeCompare(String(w.valueDate))).map(t => [day(t.valueDate), day(t.entryDate), eur(t.amount), t.payeePayerName || "", String(t.paymtPurpose || "").replace(/\s+/g, " "), t.status || "", t.id])))));
    }
    // Rohdaten (maschinenlesbar, alle Felder) – Stammdaten vollständig, Bewegungsdaten dieses Jahres
    const ids = (arr) => new Set(arr.map(o => String(o.id)));
    const invIds = ids(p.inv), cnIds = ids(p.cn), ordIds = ids(p.ord), vouIds = ids(p.vou), txIds = ids(p.tx);
    const raw = {
      Invoice: p.inv, InvoicePos: local.all("InvoicePos").filter(x => x.invoice && invIds.has(String(x.invoice.id))),
      CreditNote: p.cn, CreditNotePos: local.all("CreditNotePos").filter(x => x.creditNote && cnIds.has(String(x.creditNote.id))),
      Order: p.ord, OrderPos: local.all("OrderPos").filter(x => x.order && ordIds.has(String(x.order.id))),
      Voucher: p.vou, VoucherPos: local.all("VoucherPos").filter(x => x.voucher && vouIds.has(String(x.voucher.id))),
      CheckAccountTransaction: p.tx, CheckAccountTransactionLog: local.all("CheckAccountTransactionLog").filter(x => x.checkAccountTransaction && txIds.has(String(x.checkAccountTransaction.id))),
      Contact: local.all("Contact"), ContactAddress: local.all("ContactAddress"), CheckAccount: accs, TaxRule: local.all("TaxRule"), TaxSet: local.all("TaxSet"), Part: local.all("Part")
    };
    for (const k of Object.keys(raw)) await add("Rohdaten/" + k + ".json", Buffer.from(JSON.stringify(raw[k], null, 1)));
    const info = ["FS Creative – Buchhaltungsarchiv " + y, "Erstellt: " + new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC (FS Cockpit, eigene Buchhaltung; Daten bis 14.10.2026 aus sevDesk übernommen)", "",
      "Rechnungen: " + p.inv.length + " · Gutschriften: " + p.cn.length + " · Angebote: " + p.ord.length, "Belege: " + p.vou.length + " (davon mit Datei: " + p.vou.filter(v => v.document && v.document.id).length + ")", "Bankumsätze: " + p.tx.length, "",
      "Ordner: Rechnungen, Gutschriften, Angebote (PDF) · Belege (Originaldateien) · Bank (CSV je Konto) · Listen (CSV, Excel-tauglich) · Rohdaten (JSON, alle Felder)",
      "Pruefsummen.txt: SHA-256 jeder Datei (Unveränderbarkeit prüfbar).", "Aufbewahrung: 7 Jahre ab Ende des Kalenderjahres (§ 132 BAO).",
      missing.length ? "\nNicht im Archiv:\n" + missing.join("\n") : ""].join("\n");
    await add("LIESMICH.txt", Buffer.from(info));
    await z.add(top + "Pruefsummen.txt", Buffer.from(sums.join("\n") + "\n"));
    await z.end();
  }

  async function handle(req, res, u, send) {
    const y = String(u.searchParams.get("year") || "");
    if (!y) { await local.load(); return send(res, 200, JSON.stringify({ ok: true, years: summary() }), "application/json; charset=utf-8", { "Cache-Control": "no-store" }); }
    if (!/^20\d\d$/.test(y)) return send(res, 400, JSON.stringify({ ok: false, error: "Jahr ungültig" }), "application/json; charset=utf-8");
    try { await stream(res, y); }
    catch (e) { if (!res.headersSent) return send(res, 500, JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 200) }), "application/json; charset=utf-8"); try { res.destroy(e); } catch (x) {} }
  }
  return { handle, summary, _test: { plan, csv, safe } };
};
