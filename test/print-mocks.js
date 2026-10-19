/* Attrappen für den Druckshop-Test: Print.com-API, Mollie, VIES und Mailserver in EINEM lokalen HTTP-Server (Pfad-Präfixe).
   /pc/…    Print.com (PRINTCOM_BASE=http://127.0.0.1:<port>/pc)
   /mollie/… Mollie v2   (PRINT_MOLLIE_BASE=http://127.0.0.1:<port>/mollie)
   /vies/…   VIES REST   (VIES_URL=http://127.0.0.1:<port>/vies)
   /mail/api/send        (MAIL_API_URL=http://127.0.0.1:<port>/mail/api/mails)
   Alle Anfragen werden protokolliert; die echten Dienste werden nie angesprochen. */
"use strict";
const http = require("http");

const CATS = { businesscards: ["paper-print", "cards-envelopes"], flyers: ["paper-print", "flyers-folders-posters"], posters: ["paper-print", "flyers-folders-posters"], folders: ["paper-print", "flyers-folders-posters"], stickers: ["stickers-tapes", "stickers"],
  rollupbanners: ["outdoor-advertising", "roller-banners"], "pvc-510": ["materials-samples", "banner"], "t-shirt-budget-5": ["clothing-textile", "clothing", "clothing-per-type", "t-shirts"], "pen-apollo-hardcolor": ["gifts-merchandise-promotional", "writing"], notepads: ["paper-print", "office-print"] };
function product(sku, props, bleed, excludes, extra) { return Object.assign({ sku, bleed, category: CATS[sku], properties: props, excludes: excludes || [[{ property: "material", options: ["400gr_uncoated"] }, { property: "finish", options: ["gloss_laminate"] }]] }, extra || {}); }
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
  // wie live: Offset/Digital wird nicht gewählt (Pflicht, automatisch), 170 g matt geht nur digital, 1/0 Pantone nur Offset, A2 nicht auf 90 g Bankpost
  posters: product("posters", [
    { slug: "size", title: "Format", locked: false, required: true, options: [opt("a1", "A1", { width: "594", height: "841" }), opt("a2", "A2 - 420 x 594 mm", { width: "420", height: "594" }), opt("custom", "custom")] },
    { slug: "material", title: "Papier", locked: false, required: true, options: [opt("90gr_bankpost", "90 g/m² Bankpostpapier holzfrei"), opt("170gr_silk_mc", "170 g/m² Bilderdruckpapier matt"), opt("135gr_mc", "135 g/m² Bilderdruckpapier glänzend")] },
    { slug: "printtype", title: "Druck", locked: false, required: true, options: [opt("10", "1/0 Pantone Schwarz"), opt("40", "4/0"), opt("44", "4/4")] },
    { slug: "finish", title: "Veredelung", locked: false, required: false, options: [opt("none", "Keine"), opt("gloss_laminate", "Glanzfolie")] },
    { slug: "printingmethod", title: "Druckverfahren", locked: false, required: true, options: [opt("offset", "Offset"), opt("digital", "Digital")] },
    copies([1, 2, 5, 10]), urgency], 3, [
    [{ property: "material", options: ["170gr_silk_mc"] }, { property: "printingmethod", options: ["offset"] }],
    [{ property: "printtype", options: ["10"] }, { property: "printingmethod", options: ["digital"] }],
    [{ property: "size", options: ["a2"] }, { property: "material", options: ["90gr_bankpost"] }],
    [{ property: "finish", options: ["gloss_laminate"] }, { property: "printtype", options: [10, 44] }]]),
  folders: product("folders", [
    { slug: "size", title: "Format (gefalzt)", locked: false, required: true, options: [opt("1/3_a4", "1/3 A4 - 99 x 210 mm", { width: "99", height: "210" }), opt("a5", "A5 - 148 x 210 mm", { width: "148", height: "210" })] },
    { slug: "fold", title: "Falzart", locked: false, required: true, options: [opt("wikkel_6", "6-seitiger Wickelfalz"), opt("single_4", "Einbruchfalz Links"), opt("luik_6", "6-seitiger Fensterfalz"), opt("cross_8", "8-seitiger Zweibruch-Kreuzfalz")] },
    { slug: "printtype", title: "Druck", locked: false, required: true, options: [opt("44", "4/4")] },
    copies([50, 100, 250]), urgency], 3),
  stickers: product("stickers", [
    { slug: "size", title: "Format", locked: false, required: true, options: [opt("50x50", "50 × 50 mm", { width: "50", height: "50" })] },
    { slug: "shape", title: "Form", locked: false, required: true, options: [opt("round", "Rund"), opt("square", "Eckig")] },
    copies([50, 100]), urgency], 2),
  rollupbanners: product("rollupbanners", [
    { slug: "size", title: "Format", locked: false, required: true, options: [opt("85x200", "85 × 200 cm", { width: "850", height: "2000" })] },
    copies([1, 2, 3]), urgency], 5),
  // Banner in Wunschgröße (size custom + width/height in mm)
  "pvc-510": product("pvc-510", [
    { slug: "size", title: "Format", locked: false, required: true, options: [opt("100_x100_cm", "100 x 100 cm"), opt("custom", "Individuell")] },
    { slug: "material", title: "Material", locked: false, required: true, options: [opt("510gr_pvc", "510 g PVC Frontlit")] },
    { slug: "printtype", title: "Druck", locked: false, required: true, options: [opt("40", "4/0")] },
    { slug: "printingmethod", title: "Druckverfahren", locked: false, required: true, options: [opt("lfp_latex_320", "Latex")] },
    { slug: "all_sides_equal_finish", title: "Alle Seiten gleich", locked: false, required: true, options: [opt("no", "Nein"), opt("yes", "Ja")] },
    ...["left", "right", "top", "bottom"].map(x => ({ slug: "finish_" + x, title: "Konfektion " + x, locked: false, required: true, options: [opt("none", "Keine"), opt("trimmed", "Trimmed"), opt("hemmed", "Hemmed"), opt("hem_eyelets_50", "Hem + eyelets 50"), opt("hem_eyelets_30", "Hem + eyelets 30"), opt("pole_pocket", "Pole pocket")] })),
    copies([1, 2, 3, 4, 5, 10]), urgency], 40, []),
  "t-shirt-budget-5": product("t-shirt-budget-5", [
    { slug: "brand_name", title: "Marke", locked: false, required: true, options: [opt("fotl_original_t", "Fruit of the Loom Original T")] },
    { slug: "material", title: "Material", locked: false, required: true, options: [opt("145gr_cotton", "145 g Baumwolle")] },
    { slug: "printtype", title: "Druck", locked: false, required: true, options: [opt("variable", "Variabel")] },
    { slug: "quality_level", title: "Qualität", locked: false, required: true, options: [opt("budget", "Budget")] },
    { slug: "size", title: "Größe", locked: false, required: true, options: [opt("t_shirt_nul_price", "T-Shirt")] },
    { slug: "individually_sealed", title: "Einzeln verpackt", locked: false, required: true, options: [opt("yes", "Ja"), opt("no", "Nein")] },
    { slug: "printingmethod", title: "Druckverfahren", locked: false, required: true, options: [opt("heat_transfer", "Transfer"), opt("screen_printing", "Siebdruck")] },
    { slug: "color_textile", title: "Farbe", locked: false, required: true, options: [opt("white_tshirt_fotl_original", "Weiß"), opt("black_tshirt_fotl_original", "Schwarz")] },
    { slug: "textile_sizes", title: "Größe", locked: false, required: true, options: ["s", "m", "l", "xl", "xxl"].map(x => opt(x, x.toUpperCase())) },
    { slug: "positions_chest", title: "Brust", locked: false, required: false, options: [opt("transfer", "Transfer"), opt("1pms", "1 Farbe"), opt("2pms", "2 Farben")] },
    { slug: "positions_back", title: "Rücken", locked: false, required: false, options: [opt("transfer", "Transfer"), opt("1pms", "1 Farbe")] },
    { slug: "positions_front", title: "Vorne", locked: false, required: false, options: [opt("transfer", "Transfer"), opt("1pms", "1 Farbe")] },
    { slug: "positions_sleeve_left", title: "Ärmel links", locked: false, required: false, options: [opt("transfer", "Transfer")] },
    copies([1, 2, 3, 5, 10, 15, 25, 50, 100, 250, 500, 1000]), urgency], 0, [[{ property: "color_textile", options: ["white_tshirt_fotl_original"] }, { property: "textile_sizes", options: ["xxl"] }]]),
  "pen-apollo-hardcolor": product("pen-apollo-hardcolor", [
    { slug: "color", title: "Farbe", locked: false, required: true, options: [opt("blue", "Blau"), opt("red", "Rot"), opt("black", "Schwarz")] },
    { slug: "printtype", title: "Druck", locked: false, required: true, options: [opt("00", "Ohne Druck"), opt("40", "4/0")] },
    { slug: "printingmethod", title: "Druckverfahren", locked: false, required: true, options: [opt("digital_uv", "Digital UV")] },
    { slug: "printing_size", title: "Druckfläche", locked: true, required: true, options: [opt("70_x_6_mm", "70 x 6 mm")] },
    copies([50, 150, 500, 2500]), urgency], 0, []),
  // allgemeines (nicht kuratiertes) Produkt
  // allgemeines Produkt wie live: freie Größe (customSizes), Mengen über rangeSets je Druckverfahren, Reihenfolge über propertyGroups
  notepads: product("notepads", [
    { slug: "size", title: "Format", locked: false, required: true, options: [opt("a5", "A5"), opt("a6", "A6"), opt("custom", "Eigene Größe", { customSizes: { minWidth: 50, minHeight: 50, maxWidth: 210, maxHeight: 297 } })] },
    { slug: "material", title: "Papier", locked: false, required: true, options: [opt("90gr_offset", "90 g Offset")] },
    { slug: "sheets", title: "Blätter", locked: false, required: true, options: [opt("50", "50 Blatt", { description: "<p>50 Blatt je Block</p>" }), opt("25", "25 Blatt")] },
    { slug: "glue", title: "Leimung", locked: false, required: true, viewMode: { reseller: "hidden" }, options: [opt("top", "oben"), opt("left", "links")] },
    { slug: "backing", title: "Rückkarton", locked: false, required: false, options: [opt("none", "ohne"), opt("grey", "grau")] },
    { slug: "summary_image", title: "Bild", locked: false, required: false, options: [opt("x", "x"), opt("y", "y")] },
    { slug: "printingmethod", title: "Druckverfahren", locked: false, required: true, options: [opt("offset", "Offset"), opt("digital", "Digital")] },
    { slug: "copies", title: "Auflage", locked: false, required: true, options: [], rangeSets: [{ summary: [25, 50, 100], options: [{ steps: 1, min: 10, max: 100 }], printingmethod: "digital" }, { summary: [250, 500], options: [{ steps: 250, min: 250, max: 1000 }], printingmethod: "offset" }] }, urgency], 3, [],
    { propertyGroups: [{ columnWidth: { reseller: "default" }, properties: [{ slug: "sheets" }, { slug: "size" }] }, { columnWidth: { reseller: "hidden" }, properties: [{ slug: "backing" }] }] }),
};
const LIST = [{ sku: "businesscards", titleSingle: "Visitenkarte", titlePlural: "Visitenkarten", active: true }, { sku: "flyers", titleSingle: "Flyer", titlePlural: "Flyer", active: true }, { sku: "posters", titlePlural: "Posters", active: true }, { sku: "folders", titlePlural: "Folder", active: true }, { sku: "stickers", titlePlural: "Stickers", active: true }, { sku: "rollupbanners", titlePlural: "Roll-up Banner", active: true }, { sku: "socks", titlePlural: "Socken", active: true },
  { sku: "pvc-510", titlePlural: "PVC Banner", active: true }, { sku: "t-shirt-budget-5", titlePlural: "T-Shirts", active: true }, { sku: "pen-apollo-hardcolor", titlePlural: "Kugelschreiber", active: true },
  { sku: "notepads", titleSingle: "Notizblock", titlePlural: "Notizblöcke", active: true }, { sku: "beachflags", titlePlural: "Beachflags", active: true }, { sku: "mentos-rolls", titlePlural: "Mentos", active: true }, { sku: "aluminium-signs", titlePlural: "Alu-Schilder", active: true },
  { sku: "cardboard-boxes", titlePlural: "Kartons", active: true }, { sku: "umbrellas", titlePlural: "Regenschirme", active: true }, { sku: "tablecloths", titlePlural: "Tischdecken", active: true }, { sku: "inactive-thing", titlePlural: "Alt", active: false }];
// Print.com-Verhalten nachbilden: Ausschlussregel trifft zu, wenn ALLE Bedingungen einer Regel zutreffen
const hit = (pd, o) => (pd.excludes || []).some(r => r.length && r.every(x => o[x.property] != null && x.options.map(String).indexOf(String(o[x.property])) > -1));

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
        if (m === "GET" && q === "/products") return send(res, 200, LIST);
        if (m === "GET" && (mm = q.match(/^\/products\/([\w-]+)$/))) return PRODUCTS[mm[1]] ? send(res, 200, PRODUCTS[mm[1]]) : send(res, 404, { message: "not found" });
        if (m === "POST" && (mm = q.match(/^\/products\/([\w-]+)\/price$/))) { if (!PRODUCTS[mm[1]]) return send(res, 404, { message: "nope" }); if (hit(PRODUCTS[mm[1]], body.options || {})) return send(res, 400, { message: "Invalid combination of options" }); const sp = state.priceOf ? state.priceOf(mm[1], body.options || {}) : state.price.salesPrice; return send(res, 200, { includes: {}, prices: { salesPrice: sp, productPrice: sp, normalPrice: sp, urgencyPrice: 0, deliveryPromisePrice: 0, deliveryPromisePremiumPrice: 0, agreementPriceType: "none" } }); }
        if (m === "POST" && q === "/shipping/shipping-possibilities") return send(res, 200, { results: [{ deliveryDate: "2026-10-22", possibilities: [
          { carrier: "DPD", method: "DPD_B2C", deliveryDate: "2026-10-22", pickupDate: "2026-10-20", urgency: body.item.options.urgency || "standard", price: { base: state.price.shipping, cost: state.price.shipping, urgency: 0 }, reliability: 1, submission: "x", transitDuration: 2, allowedDeliveryPromises: [0] },
          { carrier: "UPS", method: "UPS_EXPRESS", deliveryDate: "2026-10-21", pickupDate: "2026-10-20", urgency: body.item.options.urgency || "standard", price: { base: 19, cost: 19, urgency: 0 }, reliability: 1, submission: "x", transitDuration: 1, allowedDeliveryPromises: [0] }] }] });
        if (m === "POST" && q === "/orders") { const nr = String(6000000 + state.orders.length + 1); state.orders.push(body); return send(res, 200, { page: 1, pagesize: 1, results: [{ orderNumber: nr, orderTotal: 25, grandTotal: 30, status: "ORDERRECEIVED", items: [{ orderNumber: nr, status: "ORDERRECEIVED" }] }] }); }
        if (m === "GET" && (mm = q.match(/^\/orders\/(\d+)$/))) return send(res, 200, { page: 1, pagesize: 1, results: [{ orderNumber: mm[1], status: state.pcOrderStatus, items: [{ status: state.pcOrderStatus }], shipments: state.pcOrderStatus === "SHIPPED" ? [{ shipmentId: 1, shipmentNumber: "S1", orderItemNumbers: ["1"], tracks: [{ id: 1, trackUrl: "https://tracking.example/abc123", reference: "abc123", addressId: "1", combined: false, shipmentId: 1 }] }] : [] }] });
        return send(res, 404, { message: "mock: unbekannt " + m + " " + q });
      }
      if (m === "GET" && p === "/cms/index.json") return send(res, 200, [{ langCode: "nl", fileName: "nl_cms-x.json" }, { langCode: "de", fileName: "de_cms-test.json" }]);
      if (m === "GET" && p === "/cms/de_cms-test.json") return send(res, 200, require("./print-cms-fixture.json"));
      if (m === "POST" && (mm = p.match(/^\/mock\/paid\/(tr_\w+)$/)) && state.payments[mm[1]]) { state.payments[mm[1]].status = "paid"; return send(res, 200, { ok: true }); }   // nur für lokale Klicktests
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
