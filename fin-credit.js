"use strict";
// Gutschrift-Vorschläge zu Plattform-Rechnungen (Plattform-Audit 28.10.2026, Teil B). Nie automatisch: Die Läufe legen nur einen Vorschlag
// „Zur Prüfung“ an (fin-proposals.js, Art „invoice-credit“), gebucht wird erst mit Simons Klick (exec). Bestehende Rechnungen werden nie
// geändert oder storniert – Gutschriften gibt es (wie in sevDesk) nur zu bezahlten bzw. teilbezahlten Rechnungen.
//  1) Mollie-Erstattung (Umsatz „refund“) zu einer bezahlten Rechnung, in deren Text die Mollie-ID steht (Kantineur: „Mollie tr_…“ in der
//     Notiz) → Gutschrift über genau den erstatteten Betrag (Mollie initialAmount, nicht abzüglich Gebühren) und Zuordnung des Umsatzes (KA-2).
//     Hat Mollie eine Gebühr abgezogen, nur die Gutschrift – den Umsatz ordnet Simon von Hand zu (Gutschrift + Gebühr).
//     Rückbuchungen (Chargebacks) sind keine Entgeltminderung – die Forderung besteht weiter → nie ein Gutschrift-Vorschlag (Review B10).
//  2) Die Kantineur-Statistik meldet eine Erstattung (payments[].refundedCents), der Mollie-Umsatz ist aber nicht im Cockpit (z. B.
//     Mollie-Organisation nicht verbunden) → Gutschrift ohne Zuordnung; kommt der Umsatz später, schlägt Weg 1 nur noch die Zuordnung zu
//     dieser Gutschrift vor (kein zweites Mal gutschreiben). Gefunden wird die Rechnung über invoiceId bzw. eindeutig über die Mollie-ID.
//  3) kochdu: doppelt verrechnete Bar-Gebühren eines Monats (restaurants[].months[].doubleBilledCents, KO-2) → Gutschrift zur Monatsrechnung
//     über den Rest: abzüglich schon gebuchter Gutschriften zur Monatsrechnung (auch von Hand) und stornierter Cockpit-Rechnungen der
//     Verrechnung von Hand (Review B4).
// Gutschrift bruttogenau (grossPricing): Betrag = erstattet bzw. doppelt verrechnet, USt daraus zurückgerechnet. Ist-Besteuerung: die USt
// mindert sich mit der Zahlung der Gutschrift (Erstattungsumsatz) – liegt die in einem gemeldeten Zeitraum, gleicht das die Jahreserklärung aus.
module.exports = function (D) {
  const { L } = D;
  const P = () => (typeof D.P === "function" ? D.P() : D.P) || null;
  const CAT = "CheckAccountTransaction";
  const r2 = n => Math.round((+n || 0) * 100) / 100, day = v => String(v || "").slice(0, 10);
  const eu = n => r2(n).toFixed(2).replace(".", ",") + " €";
  const todayIso = () => (typeof D.today === "function" ? D.today() : new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date()));
  const isInv = i => !!i && !i.cancelled && ["RE", "AR", "ER", "TR"].indexOf(String(i.invoiceType || "RE")) > -1;
  const paidInv = i => isInv(i) && ["750", "1000"].indexOf(String(i.status)) > -1;
  const credits = invId => L.all("CreditNote").filter(c => c.refSrcInvoice && String(c.refSrcInvoice.id) === String(invId));
  const creditedSum = invId => r2(credits(invId).reduce((a, c) => a + (+c.sumGross || 0), 0));
  const refundTx = t => !!t && String(t.mollieType || "") === "refund" && String(t.status) === "100" && +t.amount < 0 && /^tr_\w{4,}$/.test(String(t.molliePayment || ""));
  // erstatteter Betrag = Mollie initialAmount (mollieGross); sonst Umsatz abzüglich vermerkter Gebühr bzw. „brutto …, Gebühr …“ im Verwendungszweck.
  // Ältere Umsätze ohne diese Angaben: Umsatzbetrag, aber „unbekannt“ (kann die Gebühr enthalten, R3-10). feeOf = von Mollie zusätzlich abgezogen
  function refInfo(t) {
    const a = Math.abs(+(t && t.amount) || 0);
    if (t && t.mollieGross != null && isFinite(+t.mollieGross) && Math.abs(+t.mollieGross) > 0.004) return { amt: Math.abs(+t.mollieGross), known: true };
    if (t && +t.mollieFeeAmt > 0.004) return { amt: r2(a - Math.abs(+t.mollieFeeAmt)), known: true };
    const m = String((t && t.paymtPurpose) || "").match(/brutto (-?\d+(?:\.\d+)?), Gebühr (\d+(?:\.\d+)?)/);
    if (m && Math.abs(+m[1]) > 0.004) return { amt: Math.abs(+m[1]), known: true };
    return { amt: a, known: false };
  }
  const refAmt = t => refInfo(t).amt;
  const feeOf = t => r2(Math.abs(+(t && t.amount) || 0) - refAmt(t));
  const absSum = txs => r2(txs.reduce((a, t) => a + refAmt(t), 0));
  // genau ein Steuersatz auf der Rechnung (sonst wäre die Aufteilung der Gutschrift eine Ermessensfrage → nur von Hand)
  function rateOf(inv) {
    const rates = Array.from(new Set(L.positionsOf("Invoice", inv.id).filter(p => Math.abs(+p.sumGross || +p.sumNet || 0) > 0.004).map(p => +p.taxRate || 0)));
    return rates.length === 1 ? rates[0] : null;
  }
  // Mollie-ID als ganzes Wort in Rechnungstext bzw. Notiz (wie fin-mollie.js pidInvoices)
  const pidTxt = i => [i.invoiceNumber, i.header, i.headText, i.footText, i.customerInternalNote, i.address].join(" ").toLowerCase();
  function invoicesOfPid(pid) {
    pid = String(pid || "").toLowerCase(); if (!/^tr_[a-z0-9_]{4,}$/.test(pid)) return [];
    const rx = new RegExp("(^|[^a-z0-9_])" + pid + "(?![a-z0-9_])");
    return L.all("Invoice").filter(i => isInv(i) && rx.test(pidTxt(i)));
  }
  // kochdu (B4/R4-1): Doppelt verrechnet ist laut CONTRACT-fs-order der Teil der Bar-Gebühren eines Monats, den eine Verrechnung von Hand
  // (Cockpit-Rechnung, Abrechnung kochdu:<Lokal>) schon gedeckt hatte – Verrechnungen ab Monatsbeginn bis 21.10.2026 (danach überspringt kochdu
  // Monate mit Monatsrechnung) bzw. vor der Monatsrechnung; kochdu ordnet sie den ältesten offenen Gebühren zu. Ist eine solche Rechnung
  // storniert (bzw. gutgeschrieben), ist die Doppelung insoweit schon aufgehoben – abzüglich danach gültig neu ausgestellter Verrechnungen von
  // Hand (korrigiert neu ausgestellt). Verbraucht wird wie bei kochdu ab dem ältesten doppelten Monat. Im Zweifel lieber kein bzw. ein kleinerer
  // Vorschlag als ein zu hoher.
  const KOCHDU_AWARE_DAY = "2026-10-21";
  function kochduManual(rid) {
    let bill = null; try { bill = typeof D.billing === "function" ? D.billing() : null; } catch (e) { bill = null; }
    return ((bill && bill.invoices && rid && bill.invoices["kochdu:" + rid]) || []).filter(x => x && x.id && L.get("Invoice", x.id));
  }
  function kochduRemovals(rid) {
    const recs = kochduManual(rid), gOf = x => Math.abs(+L.get("Invoice", x.id).sumGross || +x.gross || 0), items = [];
    recs.forEach(x => { const i = L.get("Invoice", x.id), d = day(x.date);
      if (i.cancelled) { const sr = L.all("Invoice").find(o => String(o.invoiceType) === "SR" && o.origin && String(o.origin.id) === String(i.id)); items.push({ date: d, cdate: day(sr && sr.invoiceDate) || d, amt: gOf(x), storno: true }); }
      else { const c = creditedSum(i.id); if (c > 0.004) items.push({ date: d, cdate: d, amt: c, storno: false }); } });
    // gültige Verrechnung von Hand nach einem Storno = neu ausgestellt: hebt das Storno (betragsunabhängig, bis zu ihrem Betrag) wieder auf
    recs.filter(x => !L.get("Invoice", x.id).cancelled).sort((a, b) => day(a.date).localeCompare(day(b.date))).forEach(v => {
      let left = gOf(v);
      items.filter(it => it.storno && it.cdate <= day(v.date) && it.amt > 0.004).sort((a, b) => b.cdate.localeCompare(a.cdate)).forEach(it => { const t = Math.min(left, it.amt); it.amt = r2(it.amt - t); left = r2(left - t); });
    });
    return items.filter(it => it.amt > 0.004).sort((a, b) => a.date.localeCompare(b.date));
  }
  // list: doppelt verrechnete Monate eines Lokals [{ month, cents, inv }] → je Monat der schon aufgehobene Teil (€)
  function kochduCuts(rid, list) {
    const items = kochduRemovals(rid), out = {};
    list.filter(m => m && /^\d{4}-\d{2}$/.test(String(m.month || ""))).sort((a, b) => String(a.month).localeCompare(String(b.month))).forEach(m => {
      const lo = m.month + "-01", invD = day(m.inv && m.inv.invoiceDate), hi = invD > KOCHDU_AWARE_DAY ? invD : KOCHDU_AWARE_DAY;
      let need = Math.max(0, r2((+m.cents || 0) / 100 - (m.inv ? creditedSum(m.inv.id) : 0))), cut = 0;
      items.filter(it => it.date >= lo && it.date <= hi).forEach(it => { const t = Math.min(need, it.amt); it.amt = r2(it.amt - t); need = r2(need - t); cut = r2(cut + t); });
      out[m.month] = cut;
    });
    return out;
  }
  // prior: frühere doppelt verrechnete Monate desselben Lokals [{ month, cents, docId }] (verbrauchen stornierte Verrechnungen zuerst)
  const kochduRest = (inv, need, rid, month, prior) => {
    const list = (Array.isArray(prior) ? prior : []).filter(p => p && String(p.month || "") < String(month)).map(p => ({ month: String(p.month), cents: +p.cents || 0, inv: L.get("Invoice", p.docId) }))
      .concat([{ month: String(month || ""), cents: Math.round(need * 100), inv }]);
    return r2(need - creditedSum(inv.id) - (kochduCuts(rid, list)[String(month || "")] || 0));
  };
  // liegt ein Datum in einem schon gemeldeten UVA-Zeitraum? (nur Hinweis – korrigiert wird über die Jahreserklärung)
  function reported(d) { let rep = null; try { rep = typeof D.reportedPeriods === "function" ? D.reportedPeriods() : null; } catch (e) { rep = null; } return !!rep && rep.some(x => x && d >= String(x.from) && d <= String(x.to)); }

  // ── Ausführen (Klick auf „Bestätigen“) ──
  async function exec(pl) {
    pl = pl || {};
    const inv = L.get("Invoice", pl.invoiceId);
    if (!paidInv(inv)) throw new Error("Die Rechnung ist nicht (mehr) bezahlt – eine Gutschrift gibt es nur zu bezahlten Rechnungen. Bitte von Hand prüfen.");
    const gross = r2((+pl.cents || 0) / 100); if (!(gross > 0)) throw new Error("Betrag fehlt");
    const txs = (pl.txIds || []).map(id => L.get(CAT, id));
    if (txs.some(t => !t || String(t.status) !== "100")) throw new Error("Der Erstattungsumsatz ist nicht mehr offen");
    if (txs.some(t => String(t.mollieType || "") !== "refund")) throw new Error("Rückbuchungen sind keine Gutschrift – die Forderung besteht weiter");
    if (txs.some(t => feeOf(t) > 0.004)) throw new Error("Mollie hat beim Erstatten eine Gebühr abgezogen – den Umsatz bitte von Hand zuordnen");
    if (txs.length && Math.abs(absSum(txs) - gross) > 0.005) throw new Error("Der Erstattungsbetrag passt nicht mehr zur Gutschrift");
    // schon angelegt (z. B. Abbruch zwischen Gutschrift und Zuordnung) → dieselbe Gutschrift nehmen, nie eine zweite
    let cn = (pl.key && L.all("CreditNote").find(c => c.creditKey === pl.key)) || (pl.creditNoteId ? L.get("CreditNote", pl.creditNoteId) : null);
    if (cn && (!cn.refSrcInvoice || String(cn.refSrcInvoice.id) !== String(inv.id) || Math.abs((+cn.sumGross || 0) - gross) > 0.005)) throw new Error("Die Gutschrift passt nicht mehr zur Rechnung");
    if (cn && txs.length && (+cn.paidAmount || 0) > 0.004) throw new Error("Die Gutschrift ist schon bezahlt");
    if (!cn) {
      const rate = pl.rate != null ? +pl.rate : rateOf(inv);
      if (rate == null || !isFinite(rate)) throw new Error("Rechnung mit mehreren Steuersätzen – Gutschrift bitte von Hand anlegen");
      if (creditedSum(inv.id) + gross > r2(+inv.sumGross || 0) + 0.005) throw new Error("Gutschriften wären höher als die Rechnung");
      cn = (await L.request("POST", "/Fin/creditNoteFromInvoice", { body: { invoiceId: String(inv.id), creditKey: pl.key || undefined, reason: pl.reason || undefined,
        positions: [{ name: pl.posName || ("Gutschrift zu Rechnung " + (inv.invoiceNumber || "")), text: pl.posText || "", quantity: 1, priceGross: gross, grossPricing: true, taxRate: rate }] } })).objects;
    }
    let booked = 0;
    for (const t of txs) {
      await L.request("PUT", "/CreditNote/" + cn.id + "/bookAmount", { body: { amount: r2(refAmt(t)), date: day(t.valueDate), checkAccountTransaction: { id: String(t.id) } } });
      booked++;
    }
    return { creditNoteId: String(cn.id), nr: cn.creditNoteNumber || "", gross: r2(+cn.sumGross || gross), booked };
  }
  // Vorschlag noch gültig? (Rechnung bezahlt, Betrag noch offen, Gutschrift nicht schon anders angelegt)
  function valid(it) {
    const pl = (it && it.payload) || {}, inv = L.get("Invoice", pl.invoiceId);
    if (!paidInv(inv)) return false;
    const mine = L.all("CreditNote").find(c => c.creditKey === it.key);
    if (mine) return (pl.txIds || []).length > 0 && !((+mine.paidAmount || 0) > 0.004);   // angelegt, nur die Zuordnung fehlt noch
    if (pl.creditNoteId) { const c = L.get("CreditNote", pl.creditNoteId); return !!c && String(c.status) === "200" && !((+c.paidAmount || 0) > 0.004); }
    const want = r2((+pl.cents || 0) / 100);
    if (pl.src === "kantineur") {   // Weg 2: inzwischen gutgeschrieben oder der Mollie-Umsatz ist da (→ Weg 1)
      const open = L.all(CAT).filter(t => refundTx(t) && String(t.molliePayment) === String(pl.pid));
      return r2((+pl.need || 0) / 100 - creditedSum(inv.id) - absSum(open)) >= want - 0.005;
    }
    if (pl.src === "kochdu") return kochduRest(inv, r2((+pl.need || +pl.cents || 0) / 100), pl.rid, pl.month, pl.prior) >= want - 0.005 && creditedSum(inv.id) + want <= r2(+inv.sumGross || 0) + 0.005;
    return creditedSum(inv.id) + want <= r2(+inv.sumGross || 0) + 0.005;
  }

  // ── 1) + 2) Erstattungen und Rückbuchungen ──
  // hints (Kantineur-Statistik): [{ invoiceId, pid, cents, chargeback }] – cents = erstattet + zurückgebucht (kumuliert, wie Mollie meldet)
  async function refunds(hints) {
    const prop = P(); if (!prop) return 0;
    let n = 0; const open = L.all(CAT).filter(refundTx), byInv = {};
    for (const t of open) { const invs = invoicesOfPid(t.molliePayment); if (invs.length !== 1) continue; const i = invs[0]; (byInv[i.id] = byInv[i.id] || { inv: i, txs: [] }).txs.push(t); }
    const hintBy = {}; (hints || []).forEach(h => { if (h && h.pid) hintBy[String(h.pid)] = (hintBy[String(h.pid)] || 0) + (+h.cents || 0); });
    for (const id of Object.keys(byInv)) {
      const { inv, txs } = byInv[id]; if (!paidInv(inv)) continue;   // offene Rechnung: kein Vorschlag (nie stornieren) – Hinweis im Kantineur-Bereich
      let gross = absSum(txs), fee = r2(txs.reduce((a, t) => a + Math.max(0, feeOf(t)), 0));
      // Plausibilität mit der Kantineur-Statistik: mehr Erstattungsumsatz als insgesamt erstattet (z. B. Gebühr im Umsatz) → nur von Hand
      const pids = Array.from(new Set(txs.map(t => String(t.molliePayment)))), hintSum = pids.every(x => hintBy[x] != null) ? r2(pids.reduce((a, x) => a + hintBy[x], 0) / 100) : null;
      if (txs.some(t => !refInfo(t).known)) {
        // ältere Umsätze ohne Bruttobetrag: nie mehr gutschreiben als erstattet (R3-10) – Kantineur-Meldung als Obergrenze (Rest = Gebühr, Umsatz von Hand);
        // ohne Meldung nur eine volle Erstattung (Umsatz = offener Rechnungsbetrag), sonst kein Vorschlag (Betrag unbekannt, Erstattung von Hand gutschreiben)
        if (hintSum != null) { if (gross > hintSum + 0.005) { fee = r2(gross - hintSum); gross = hintSum; } }
        else if (!(txs.length === 1 && Math.abs(gross - r2((+inv.sumGross || 0) - creditedSum(inv.id))) <= 0.005)) { console.log("Gutschrift-Vorschlag ausgelassen (Erstattungsbetrag unbekannt – ältere Mollie-Buchung ohne Bruttobetrag, kann die Gebühr enthalten; bitte von Hand gutschreiben):", inv.invoiceNumber || inv.id); continue; }
      } else if (hintSum != null && gross > hintSum + 0.005) { console.log("Gutschrift-Vorschlag ausgelassen (Betrag passt nicht zur Kantineur-Meldung):", inv.invoiceNumber || inv.id); continue; }
      if (!(gross > 0.004)) continue;
      const ids = fee > 0.004 ? [] : txs.map(t => String(t.id)).sort();   // mit Mollie-Gebühr: Gutschrift über den erstatteten Betrag, Umsatz von Hand
      const cn = credits(inv.id).find(c => String(c.status) === "200" && !((+c.paidAmount || 0) > 0.004) && Math.abs((+c.sumGross || 0) - gross) <= 0.005);
      if (cn && !ids.length) continue;   // Gutschrift gibt es schon, Zuordnung mit Gebühr nur von Hand
      if (!cn && (rateOf(inv) == null || creditedSum(inv.id) + gross > r2(+inv.sumGross || 0) + 0.005)) continue;
      const what = "Erstattung", nr = inv.invoiceNumber || inv.id, d = day(txs[0].valueDate);
      const note = reported(d) ? " · Zahlung liegt in einem schon gemeldeten UVA-Zeitraum – Ausgleich über die Jahreserklärung" : "";
      try {
        if (await prop.add({ kind: "invoice-credit", key: "rcredit:" + inv.id + ":" + (ids.length ? ids.join(",") : "fee:" + txs.map(t => String(t.id)).sort().join(",")), invoiceId: String(inv.id), txIds: ids, amount: -gross, date: d,
          title: cn ? what + " (Mollie) der Gutschrift " + (cn.creditNoteNumber || "") + " zu Rechnung " + nr + " zuordnen" : "Gutschrift über " + eu(gross) + " zu Rechnung " + nr + (ids.length ? " und Zuordnung der " + what + " (Mollie)" : " (Mollie-" + what + ")"),
          detail: txs.map(t => t.molliePayment).filter((v, k, a) => a.indexOf(v) === k).join(", ") + " · " + String(txs[0].mollieDesc || txs[0].paymtPurpose || "").slice(0, 100) + (ids.length ? "" : " · Mollie hat zusätzlich " + eu(fee) + " Gebühr abgezogen – Erstattungsumsatz danach von Hand zuordnen (Gutschrift + Gebühr)") + note, source: "Mollie-Abruf",
          payload: { invoiceId: String(inv.id), cents: Math.round(gross * 100), txIds: ids, creditNoteId: cn ? String(cn.id) : null, src: "mollie",
            reason: what + " über Mollie (" + txs.map(t => t.molliePayment).filter((v, k, a) => a.indexOf(v) === k).join(", ") + ") – wir schreiben Ihnen folgenden Betrag zu Rechnung " + nr + " gut:", posName: what + " zu Rechnung " + nr } })) n++;
      } catch (e) { console.error("Gutschrift-Vorschlag:", e.message); }
    }
    for (const h of hints || []) {
      if (!h || h.chargeback) continue;   // Rückbuchung: keine Gutschrift (B10)
      const byPid = invoicesOfPid(h.pid), inv = L.get("Invoice", h.invoiceId) || (byPid.length === 1 ? byPid[0] : null);   // ohne invoiceId: eindeutig über die Mollie-ID (B11)
      if (!paidInv(inv) || rateOf(inv) == null) continue;
      const need = r2((+h.cents || 0) / 100), pend = absSum(open.filter(t => String(t.molliePayment) === String(h.pid)));
      const rest = r2(need - creditedSum(inv.id) - pend); if (rest < 0.01) continue;
      if (creditedSum(inv.id) + rest > r2(+inv.sumGross || 0) + 0.005) continue;
      const what = "Erstattung", nr = inv.invoiceNumber || inv.id;
      try {
        if (await prop.add({ kind: "invoice-credit", key: "kacredit:" + inv.id + ":" + Math.round(need * 100), invoiceId: String(inv.id), amount: -rest, date: todayIso(),
          title: "Gutschrift über " + eu(rest) + " zu Rechnung " + nr + " (Kantineur meldet " + what + ")", detail: (h.pid || "") + " · Mollie-Umsatz dazu ist nicht im Cockpit – Gutschrift ohne Zuordnung, die Auszahlung ordnest du später zu", source: "Kantineur-Statistik",
          payload: { invoiceId: String(inv.id), cents: Math.round(rest * 100), txIds: [], pid: String(h.pid || ""), need: Math.round(need * 100), src: "kantineur",
            reason: what + " des Abo-Betrags (Mollie " + (h.pid || "") + ") – wir schreiben Ihnen folgenden Betrag zu Rechnung " + nr + " gut:", posName: what + " Kantineur-Abo zu Rechnung " + nr } })) n++;
      } catch (e) { console.error("Gutschrift-Vorschlag (Kantineur):", e.message); }
    }
    return n;
  }

  // ── 3) kochdu: doppelt verrechnet (Verrechnung von Hand + Monatsrechnung, z. B. 09/2026) ──
  async function kochduDouble(restaurants) {
    const prop = P(); if (!prop) return 0; let n = 0;
    for (const r of restaurants || []) {
     // alle doppelt verrechneten Monate des Lokals (auch mit offener Monatsrechnung) – für die Reihenfolge beim Abziehen stornierter Verrechnungen
     const dbl = ((r && r.months) || []).filter(m => m && Math.round(+m.doubleBilledCents || 0) > 0 && m.doc && m.doc.docId).map(m => ({ month: String(m.month || ""), cents: Math.round(+m.doubleBilledCents), docId: String(m.doc.docId) }));
     const storno = kochduManual(r && r.id).some(x => L.get("Invoice", x.id).cancelled);
     for (const m of (r && r.months) || []) {
      const cents = Math.round(+m.doubleBilledCents || 0), doc = m.doc || {}; if (!(cents > 0) || !doc.docId) continue;
      const inv = L.get("Invoice", doc.docId); if (!paidInv(inv)) continue;   // Monatsrechnung noch offen → nur Hinweis im kochdu-Bereich
      // Rest: schon gebuchte Gutschriften zur Monatsrechnung (auch von Hand) und stornierte Cockpit-Rechnungen der Verrechnung von Hand abziehen (B4)
      const prior = dbl.filter(p => p.month < String(m.month || ""));
      const rest = Math.min(r2(cents / 100), kochduRest(inv, r2(cents / 100), r && r.id, m.month, prior)); if (rest < 0.01) continue;
      if (creditedSum(inv.id) + rest > r2(+inv.sumGross || 0) + 0.005) continue;
      const restC = Math.round(rest * 100), mm = String(m.month || "").split("-").reverse().join("/"), nr = inv.invoiceNumber || doc.nr || inv.id;
      try {
        if (await prop.add({ kind: "invoice-credit", key: "kodouble:" + inv.id + ":" + restC, invoiceId: String(inv.id), amount: -rest, date: todayIso(),
          title: "Gutschrift über " + eu(rest) + " zu Rechnung " + nr + " (kochdu " + (r.name || "") + ", " + mm + " doppelt verrechnet)",
          detail: "Bar-Gebühren " + mm + " schon per Verrechnung von Hand abgerechnet" + (+m.manualCents > 0 ? " (" + eu(+m.manualCents / 100) + ")" : "") + " und nochmals in der Monatsrechnung " + nr + (restC < cents ? " · bereits gutgeschrieben bzw. storniert: " + eu(cents / 100 - rest) : "") + (storno ? " · Achtung: stornierte Verrechnung von Hand vorhanden – bitte prüfen" : ""), source: "kochdu-Statistik",
          payload: { invoiceId: String(inv.id), cents: restC, need: cents, rid: String((r && r.id) || ""), month: String(m.month || ""), prior, txIds: [], rate: 20, src: "kochdu", reason: "Die kochdu-Gebühren " + mm + " wurden teilweise doppelt verrechnet (Verrechnung von Hand und Monatsrechnung " + nr + "). Wir schreiben dir folgenden Betrag gut:",
            posName: "kochdu-Gebühr Barzahlungen " + mm + " – doppelt verrechnet" } })) n++;
      } catch (e) { console.error("Gutschrift-Vorschlag (kochdu):", e.message); }
     }
    }
    return n;
  }
  return { exec, valid, refunds, kochduDouble, invoicesOfPid, rateOf, kochduRest };
};
