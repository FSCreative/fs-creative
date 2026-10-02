/* Lokaler Mock der Blitzdings-API (/api/stats + /api/cockpit/*) für Tests des Cockpit-Proxys und der Oberfläche.
   Gleiche Antwortformen wie blitzdings/src/app/api/cockpit/*. Start einzeln: node test/blitz-mock.js [port] */
"use strict";
const http = require("http");

function createBlitzMock(opts) {
  opts = opts || {};
  const TOKEN = opts.token || "test-token";
  const today = new Date(); const iso = (d) => d.toISOString().slice(0, 10);
  const plus = (n) => { const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + n)); return iso(d); };
  const S = {
    log: [],
    resources: [{ type: "MINI", name: "Mini-Box", quantity: 1 }, { type: "BUSINESS", name: "Business-Box", quantity: 1 }, { type: "VIDEO360", name: "360° Booth", quantity: 1 }],
    packages: [
      { slug: "digital", name: "Digital", tagline: "", priceCents: 24900, resourceTypes: ["MINI"], canSelfPickup: true, active: true, extraSlugs: [] },
      { slug: "all-inclusive", name: "All-Inclusive", tagline: "", priceCents: 44900, resourceTypes: ["MINI"], canSelfPickup: false, active: true, extraSlugs: ["drucker", "requisiten"] },
      { slug: "video360", name: "360° Video", tagline: "", priceCents: 49900, resourceTypes: ["VIDEO360"], canSelfPickup: false, active: true, extraSlugs: [] },
    ],
    extras: [
      { slug: "drucker", name: "Sofortdruck", description: "", priceCents: 9900, active: true },
      { slug: "requisiten", name: "Requisiten-Koffer", description: "", priceCents: 2900, active: true },
    ],
    bookings: [
      { id: "bk1", reference: "BD-AAAA11", eventDate: plus(3), eventEndDate: null, status: "CONFIRMED", paymentStatus: "UNPAID", paymentMethod: "INVOICE", source: "web",
        packageSlug: "all-inclusive", customerName: "Anna Berger", customerEmail: "anna@example.at", customerPhone: "+43 660 1234567", eventLocation: "Schruns", totalCents: 54700,
        extras: [{ name: "Sofortdruck", priceCents: 9900 }], note: "", createdAt: new Date().toISOString() },
    ],
    blocked: [{ id: "bl1", date: plus(10), type: null, reason: "Urlaub" }],
  };
  let seq = 1;
  const pkg = (slug) => S.packages.find((p) => p.slug === slug);
  const range = (b) => { const out = []; let d = b.eventDate; const e = b.eventEndDate || b.eventDate; while (d <= e) { out.push(d); const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); d = iso(x); } return out; };
  function occupied(types, dates, excludeId) {
    const c = [];
    S.bookings.filter((b) => b.status !== "CANCELLED" && b.id !== excludeId).forEach((b) => {
      const bt = pkg(b.packageSlug).resourceTypes; range(b).forEach((d) => { if (dates.indexOf(d) > -1) bt.forEach((t) => { if (types.indexOf(t) > -1) c.push({ date: d, type: t, reason: "booked", reference: b.reference }); }); });
    });
    S.blocked.forEach((x) => { if (dates.indexOf(x.date) > -1) (x.type ? [x.type] : types).forEach((t) => { if (types.indexOf(t) > -1) c.push({ date: x.date, type: t, reason: "blocked", note: x.reason }); }); });
    return c;
  }
  const out = (b) => { const p = pkg(b.packageSlug); return Object.assign({}, b, { package: { slug: p.slug, name: p.name }, resourceTypes: p.resourceTypes, blocking: b.status === "CONFIRMED", customerType: b.customerType || "PRIVATE", companyName: b.companyName || "", billingStreet: b.billingStreet || "", billingZip: b.billingZip || "", billingCity: b.billingCity || "", voucherCode: "", sevdeskInvoiceId: "" }); };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x"); let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const j = (st, o) => { res.writeHead(st, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (e) { return j(400, { error: "bad_json" }); }
      S.log.push({ method: req.method, path: u.pathname, query: u.search, headerToken: req.headers["x-api-token"] || "", body });
      // /api/stats (bestehende API, Token per Query bzw. Body)
      if (u.pathname === "/api/stats") {
        if (req.method === "POST") { if (body.token !== TOKEN) return j(401, { error: "unauthorized" }); const b = S.bookings.find((x) => x.id === body.id); if (!b) return j(500, { ok: false }); b.paymentStatus = body.paid ? "PAID" : "UNPAID"; return j(200, { ok: true, id: b.id, paymentStatus: b.paymentStatus }); }
        if (u.searchParams.get("token") !== TOKEN) return j(401, { error: "unauthorized" });
        const t = iso(today); const up = S.bookings.filter((b) => b.status !== "CANCELLED" && b.eventDate >= t).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
        const paid = S.bookings.filter((b) => b.paymentStatus === "PAID"), open = S.bookings.filter((b) => b.paymentStatus === "UNPAID" && b.status !== "CANCELLED");
        const sum = (a) => a.reduce((s, b) => s + b.totalCents, 0);
        return j(200, { account: "blitzdings", fetchedAt: new Date().toISOString(), revenue: { paidCents: sum(paid), openCents: sum(open), refundedCents: 0, thisMonthPaidCents: sum(paid) },
          bookings: { total: S.bookings.length, paidCount: paid.length, openCount: open.length, upcomingCount: up.length, byStatus: {}, byPayment: {} },
          upcoming: up.map((b) => ({ id: b.id, reference: b.reference, eventDate: b.eventDate, eventEndDate: b.eventEndDate || "", location: b.eventLocation || "", package: pkg(b.packageSlug).name, customerName: b.customerName, customerPhone: b.customerPhone || "", totalCents: b.totalCents, paymentStatus: b.paymentStatus, status: b.status, extras: b.extras })) });
      }
      if (u.pathname.indexOf("/api/cockpit/") !== 0) return j(404, { error: "nf" });
      if (req.headers["x-api-token"] !== TOKEN) return j(401, { ok: false, error: "unauthorized" });
      const p = u.pathname.slice("/api/cockpit".length);
      if (p === "/catalog" && req.method === "GET") return j(200, { ok: true, packages: S.packages, extras: S.extras, resources: S.resources, pricing: { extraDayFactor: 0.9 } });
      if (p === "/availability" && req.method === "GET") {
        const from = u.searchParams.get("from"), to = u.searchParams.get("to");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) return j(400, { ok: false, error: "from/to" });
        const days = {}, dayBookings = {}; range({ eventDate: from, eventEndDate: to }).forEach((d) => { days[d] = { MINI: "free", BUSINESS: "free", VIDEO360: "free" }; });
        const inR = S.bookings.filter((b) => b.status !== "CANCELLED" && b.eventDate <= to && (b.eventEndDate || b.eventDate) >= from);
        inR.forEach((b) => range(b).forEach((d) => { if (!days[d]) return; pkg(b.packageSlug).resourceTypes.forEach((t) => { if (days[d][t] !== "blocked") days[d][t] = "booked"; }); (dayBookings[d] = dayBookings[d] || []).push(b.id); }));
        S.blocked.forEach((x) => { if (days[x.date]) (x.type ? [x.type] : ["MINI", "BUSINESS", "VIDEO360"]).forEach((t) => (days[x.date][t] = "blocked")); });
        return j(200, { ok: true, from, to, fetchedAt: new Date().toISOString(), holdMinutes: 30, resources: S.resources, days, dayBookings, bookings: inR.map(out), blocked: S.blocked.filter((x) => x.date >= from && x.date <= to) });
      }
      if (p === "/bookings" && req.method === "POST") {
        const P = pkg(body.packageSlug);
        if (!P || !P.active) return j(404, { ok: false, error: "Paket nicht verfügbar." });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.eventDate || "") || !body.customerName || !/@/.test(body.customerEmail || "")) return j(400, { ok: false, error: "Ungültige Eingabe" });
        const end = body.eventEndDate && body.eventEndDate > body.eventDate ? body.eventEndDate : null;
        const conflicts = body.allowOverlap ? [] : occupied(P.resourceTypes, range({ eventDate: body.eventDate, eventEndDate: end }));
        if (conflicts.length) return j(409, { ok: false, error: "Dieser Termin ist für das gewählte Paket nicht mehr frei.", conflicts });
        const days = range({ eventDate: body.eventDate, eventEndDate: end }).length;
        const ex = S.extras.filter((e) => (body.extras || []).indexOf(e.slug) > -1);
        const gross = Math.round(P.priceCents * (1 + 0.9 * (days - 1))) + ex.reduce((s, e) => s + e.priceCents, 0);
        const total = body.totalCentsOverride != null ? body.totalCentsOverride : Math.max(0, gross - (body.discountCents || 0));
        const b = { id: "new" + seq, reference: "BD-NEW" + String(seq++).padStart(3, "0"), eventDate: body.eventDate, eventEndDate: end, status: "CONFIRMED", paymentStatus: body.paymentStatus || "UNPAID", paymentMethod: body.paymentMethod || "INVOICE",
          source: "cockpit", packageSlug: P.slug, customerName: body.customerName, customerEmail: String(body.customerEmail).toLowerCase(), customerPhone: body.customerPhone || "", eventLocation: body.eventLocation || "", totalCents: total,
          extras: ex.map((e) => ({ name: e.name, priceCents: e.priceCents })), note: [body.eventTime ? "Uhrzeit: " + body.eventTime : "", body.note || ""].filter(Boolean).join("\n"), createdAt: new Date().toISOString(),
          customerType: body.customerType, companyName: body.companyName, billingStreet: body.billingStreet, billingZip: body.billingZip, billingCity: body.billingCity };
        S.bookings.push(b);
        return j(201, { ok: true, booking: { id: b.id, reference: b.reference, totalCents: b.totalCents, eventDate: b.eventDate, eventEndDate: b.eventEndDate, status: b.status, paymentStatus: b.paymentStatus },
          totals: { days, totalCents: total }, effects: { mailSent: body.customerMail === "none" ? null : true, adminNotified: null, sevdeskInvoiceId: null, googleSyncAttempted: true } });
      }
      const m = p.match(/^\/bookings\/([^/]+)$/);
      if (m && req.method === "PATCH") {
        const b = S.bookings.find((x) => x.id === decodeURIComponent(m[1])); if (!b) return j(404, { ok: false, error: "not_found" });
        if (body.status) b.status = body.status; if (body.paymentStatus) b.paymentStatus = body.paymentStatus;
        return j(200, { ok: true, booking: { id: b.id, reference: b.reference, status: b.status, paymentStatus: b.paymentStatus } });
      }
      if (p === "/blocked" && req.method === "POST") { const x = { id: "bl" + (seq++), date: body.date, type: body.type || null, reason: body.reason || "" }; S.blocked.push(x); return j(201, { ok: true, blocked: x }); }
      if (p === "/blocked" && req.method === "DELETE") { const id = u.searchParams.get("id"); const n = S.blocked.length; S.blocked = S.blocked.filter((x) => x.id !== id); return j(200, { ok: true, deleted: n - S.blocked.length }); }
      return j(404, { ok: false, error: "nf" });
    });
  });
  return { server, state: S, token: TOKEN };
}
module.exports = createBlitzMock;

if (require.main === module) {
  const port = +process.argv[2] || 4397;
  const m = createBlitzMock({ token: process.env.MOCK_TOKEN || "test-token" });
  m.server.listen(port, "127.0.0.1", () => console.log("blitz mock on " + port));
}
