/* Attrappen für den Druckshop-Test: Print.com-API, Mollie, VIES und Mailserver in EINEM lokalen HTTP-Server (Pfad-Präfixe).
   /pc/…    Print.com (PRINTCOM_BASE=http://127.0.0.1:<port>/pc)
   /mollie/… Mollie v2   (PRINT_MOLLIE_BASE=http://127.0.0.1:<port>/mollie)
   /vies/…   VIES REST   (VIES_URL=http://127.0.0.1:<port>/vies)
   /mail/api/send        (MAIL_API_URL=http://127.0.0.1:<port>/mail/api/mails)
   Alle Anfragen werden protokolliert; die echten Dienste werden nie angesprochen. */
"use strict";
const http = require("http");

function product(sku, props, bleed) { return { sku, bleed, properties: props, excludes: [[{ property: "material", options: ["400gr_uncoated"] }, { property: "finish", options: ["gloss_laminate"] }]] }; }
const opt = (slug, name, extra) => Object.assign({ slug, name, nullable: false }, extra || {});
const copies = arr => ({ slug: "copies", title: "Auflage", locked: false, required: true, options: arr.map(n => opt(String(n), String(n))) });
const urgency = { slug: "urgency", title: "Lieferzeit", locked: false, required: false, options: [opt("standard", "Standard"), opt("quick", "Schnell"), opt("urgent", "Express")] };
const PRODUCTS = {
  businesscards: product("businesscards", [
    { slug: "size", title: "Format", locked: false, required: true, options: [opt("85x55", "85 × 55 mm", { width: "85", height: "55" }), opt("85x85", "85 × 85 mm", { width: "85", height: "85" })] },
    { slug: "material", title: "Papier", locked: false, required: true, options: [opt("350gr_mc", "350 g Bilderdruck matt"), opt("400gr_uncoated", "400 g Naturpapier")] },
    { slug: "printtype", title: "Druck", locked: false, required: true, options: [opt("40", "Einseitig 4/0"), opt("44", "Beidseitig 4/4")] },
    { slug: "finish", title: "Veredelung", locked: false, required: false, options: [opt("none", "Keine"), opt("gloss_laminate", "Glanzfolie")] },
    { slug: "printingmethod", title: "Druckverfahren", locked: false, required: true, options: [opt("digital", "Digital"), opt("offset", "Offset")] },
    { slug: "clean_cut", title: "Clean cut", locked: true, required: false, options: [opt("no", "Nein")] },
    copies([50, 100, 250, 500, 1000, 2500]), urgency], 2),
  flyers: product("flyers", [
    { slug: "size", title: "Format", locked: false, required: true, options: [opt("a6", "A6"), opt("a5", "A5"), opt("a4", "A4")] },
    { slug: "material", title: "Papier", locked: false, required: true, options: [opt("135gr_mc", "135 g Bilderdruck")] },
    { slug: "printtype", title: "Druck", locked: false, required: true, options: [opt("40", "4/0"), opt("44", "4/4")] },
    copies([100, 250, 500, 1000]), urgency], 3),
  posters: product("posters", [
    { slug: "size", title: "Format", locked: false, required: true, options: [opt("a2", "A2", { width: "420", height: "594" }), opt("a1", "A1", { width: "594", height: "841" })] },
    { slug: "material", title: "Papier", locked: false, required: true, options: [opt("150gr_mc", "150 g")] },
    copies([1, 2, 5, 10]), urgency], 3),
};

module.exports = function createMocks() {
  const state = { log: [], orders: [], payments: {}, refunds: [], mails: [], pcOrderStatus: "ACCEPTEDBYSUPPLIER", price: { salesPrice: 20, shipping: 5 }, vies: { DE123456789: true, ATU12345678: true } };
  const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  const server = http.createServer((req, res) => {
    let raw = ""; req.setEncoding("utf8");
    req.on("data", c => (raw += c));
    req.on("end", () => {
      const u = new URL(req.url, "http://x"), p = u.pathname, m = req.method;
      let body = null; try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = raw; }
      state.log.push({ method: m, path: p, auth: req.headers.authorization || "", body, lang: req.headers["accept-language"] || "" });
      let mm;
      if (p.indexOf("/pc/") === 0) {
        if (req.headers.authorization !== "PrintApiKey pc-test-key") return send(res, 401, { message: "unauthorized" });
        const q = p.slice(3);
        if (m === "GET" && q === "/products") return send(res, 200, [{ sku: "businesscards", titleSingle: "Visitenkarte", titlePlural: "Visitenkarten", active: true }, { sku: "flyers", titleSingle: "Flyer", titlePlural: "Flyer", active: true }, { sku: "posters", titlePlural: "Posters", active: true }, { sku: "socks", titlePlural: "Socken", active: true }]);
        if (m === "GET" && (mm = q.match(/^\/products\/([\w-]+)$/))) return PRODUCTS[mm[1]] ? send(res, 200, PRODUCTS[mm[1]]) : send(res, 404, { message: "not found" });
        if (m === "POST" && (mm = q.match(/^\/products\/([\w-]+)\/price$/))) { if (!PRODUCTS[mm[1]]) return send(res, 404, { message: "nope" }); return send(res, 200, { includes: {}, prices: { salesPrice: state.price.salesPrice, productPrice: state.price.salesPrice, normalPrice: state.price.salesPrice, urgencyPrice: 0, deliveryPromisePrice: 0, deliveryPromisePremiumPrice: 0, agreementPriceType: "none" } }); }
        if (m === "POST" && q === "/shipping/shipping-possibilities") return send(res, 200, { results: [{ deliveryDate: "2026-10-22", possibilities: [
          { carrier: "DPD", method: "DPD_B2C", deliveryDate: "2026-10-22", pickupDate: "2026-10-20", urgency: body.item.options.urgency || "standard", price: { base: state.price.shipping, cost: state.price.shipping, urgency: 0 }, reliability: 1, submission: "x", transitDuration: 2, allowedDeliveryPromises: [0] },
          { carrier: "UPS", method: "UPS_EXPRESS", deliveryDate: "2026-10-21", pickupDate: "2026-10-20", urgency: body.item.options.urgency || "standard", price: { base: 19, cost: 19, urgency: 0 }, reliability: 1, submission: "x", transitDuration: 1, allowedDeliveryPromises: [0] }] }] });
        if (m === "POST" && q === "/orders") { const nr = String(6000000 + state.orders.length + 1); state.orders.push(body); return send(res, 200, { page: 1, pagesize: 1, results: [{ orderNumber: nr, orderTotal: 25, grandTotal: 30, status: "ORDERRECEIVED", items: [{ orderNumber: nr, status: "ORDERRECEIVED" }] }] }); }
        if (m === "GET" && (mm = q.match(/^\/orders\/(\d+)$/))) return send(res, 200, { page: 1, pagesize: 1, results: [{ orderNumber: mm[1], status: state.pcOrderStatus, items: [{ status: state.pcOrderStatus }], shipments: state.pcOrderStatus === "SHIPPED" ? [{ shipmentId: 1, shipmentNumber: "S1", orderItemNumbers: ["1"], tracks: [{ id: 1, trackUrl: "https://tracking.example/abc123", reference: "abc123", addressId: "1", combined: false, shipmentId: 1 }] }] : [] }] });
        return send(res, 404, { message: "mock: unbekannt " + m + " " + q });
      }
      if (p.indexOf("/mollie/") === 0) {
        if (req.headers.authorization !== "Bearer test_mollie_print") return send(res, 401, { title: "Unauthorized", detail: "bad key" });
        const q = p.slice(7);
        if (m === "POST" && q === "/payments") { const id = "tr_test" + (Object.keys(state.payments).length + 1); state.payments[id] = { id, status: "open", amount: body.amount, metadata: body.metadata, description: body.description, redirectUrl: body.redirectUrl, webhookUrl: body.webhookUrl }; return send(res, 201, Object.assign({}, state.payments[id], { _links: { checkout: { href: "https://mollie.example/checkout/" + id } } })); }
        if (m === "GET" && (mm = q.match(/^\/payments\/(tr_\w+)$/))) return state.payments[mm[1]] ? send(res, 200, state.payments[mm[1]]) : send(res, 404, { title: "Not Found" });
        if (m === "POST" && (mm = q.match(/^\/payments\/(tr_\w+)\/refunds$/))) { state.refunds.push({ payment: mm[1], body }); return send(res, 201, { id: "re_" + state.refunds.length, status: "pending", amount: body.amount }); }
        return send(res, 404, { title: "unknown" });
      }
      if ((mm = p.match(/^\/vies\/(\w\w)\/vat\/(\w+)$/))) { const uid = (mm[1] === "EL" ? "GR" : mm[1]) + mm[2]; return send(res, 200, { isValid: !!state.vies[uid], name: state.vies[uid] ? "Testfirma GmbH" : "", userError: state.vies[uid] ? "VALID" : "INVALID" }); }
      if (p === "/mail/api/send" && m === "POST") { state.mails.push(body); return send(res, 200, { ok: true }); }
      send(res, 404, { error: "unknown" });
    });
  });
  return { server, state };
};
