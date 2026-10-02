/* Kleiner sevDesk-Mock (nur was die Angebote brauchen + leere Antworten für den Rest). Protokolliert alle Anfragen.
   Nutzung: const m = createSevMock({ key }); m.server.listen(0) → SEVDESK_API_BASE=http://127.0.0.1:<port>/api/v1 */
"use strict";
const http = require("http");

module.exports = function createSevMock(opts) {
  opts = opts || {};
  const key = opts.key || "sev-test-key";
  const ts = (iso) => String(Math.floor(Date.parse(iso + "T10:00:00Z") / 1000));
  const iso = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const contact = (id, name) => ({ id: String(id), objectName: "Contact", name });
  const state = {
    log: [],
    orders: [
      { id: "501", objectName: "Order", orderNumber: "AN-1001", orderType: "AN", status: "200", orderDate: iso(-10) + "T00:00:00+02:00", header: "Angebot Website-Relaunch", headText: "Vielen Dank für Ihre Anfrage.", footText: "Dieses Angebot ist gültig bis " + iso(20).split("-").reverse().join(".") + ".", contact: contact(11, "Bäckerei Lerch"), sumNet: "2000", sumTax: "400", sumGross: "2400", sendDate: iso(-9) },
      { id: "502", objectName: "Order", orderNumber: "AN-1002", orderType: "AN", status: "100", orderDate: ts(iso(-60)), header: "Angebot", footText: "", contact: contact(12, "Verein Gaschurn"), sumNet: "500", sumTax: "100", sumGross: "600" },
      { id: "503", objectName: "Order", orderNumber: "AN-1003", orderType: "AN", status: "500", orderDate: iso(-40), header: "Angebot Logo", contact: contact(13, "Hotel Silvretta"), sumNet: "800", sumTax: "160", sumGross: "960" },
      { id: "504", objectName: "Order", orderNumber: "AN-1004", orderType: "AN", status: "300", orderDate: iso(-90), header: "Angebot Shop", contact: contact(14, "Sport Huber"), sumNet: "4000", sumTax: "800", sumGross: "4800" },
      { id: "601", objectName: "Order", orderNumber: "AB-2001", orderType: "AB", status: "200", orderDate: iso(-5), header: "Auftragsbestätigung", contact: contact(11, "Bäckerei Lerch"), sumNet: "1", sumTax: "0", sumGross: "1" },
    ],
    pos: [
      { id: "1", order: { id: "501", objectName: "Order" }, name: "Website-Relaunch", quantity: "1", priceNet: "1800", price: "1800", taxRate: "20", positionNumber: "0" },
      { id: "2", order: { id: "501", objectName: "Order" }, name: "Hosting 12 Monate", quantity: "12", priceNet: "16.6667", price: "16.6667", taxRate: "20", positionNumber: "1" },
    ],
    contacts: [contact(11, "Bäckerei Lerch"), contact(12, "Verein Gaschurn"), contact(13, "Hotel Silvretta"), contact(14, "Sport Huber")],
    saved: [], puts: [], invoicesFromOrder: [], createdContacts: [],
    sequence: true,
  };
  const send = (res, status, obj, headers) => { res.writeHead(status, Object.assign({ "content-type": "application/json" }, headers || {})); res.end(typeof obj === "string" ? obj : JSON.stringify(obj)); };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const u = new URL(req.url, "http://x"); const p = u.pathname.replace(/^\/api\/v1/, "");
      let json = null; try { json = body ? JSON.parse(body) : null; } catch (e) {}
      state.log.push({ method: req.method, path: p, query: Object.fromEntries(u.searchParams), auth: req.headers.authorization, body: json });
      if (req.headers.authorization !== key) return send(res, 401, { error: { message: "Authentication required" } });
      const m = req.method;
      if (m === "GET" && p === "/Order") {
        let list = state.orders.slice();
        if (u.searchParams.get("orderType")) list = list.filter((o) => o.orderType === u.searchParams.get("orderType"));
        const off = +u.searchParams.get("offset") || 0, lim = +u.searchParams.get("limit") || 100;
        return send(res, 200, { objects: list.slice(off, off + lim) });
      }
      if (m === "GET" && p === "/OrderPos") { const off = +u.searchParams.get("offset") || 0; return send(res, 200, { objects: off ? [] : state.pos }); }
      if (m === "GET" && p === "/SevSequence/Factory/getByType") {
        if (!state.sequence) return send(res, 400, { error: { message: "nope" } });
        return send(res, 200, { objects: { id: "1", objectName: "SevSequence", format: "AN-[%NUMBER]", nextSequence: String(1005 + state.saved.length), objectType: "Order", type: "AN" } });
      }
      if (m === "GET" && p === "/Contact") return send(res, 200, { objects: state.contacts });
      if (m === "POST" && p === "/Contact") { const id = String(700 + state.createdContacts.length); state.createdContacts.push(json); state.contacts.push(contact(id, json.name)); return send(res, 201, { objects: { id, objectName: "Contact", name: json.name } }); }
      if (m === "POST" && p === "/CommunicationWay") return send(res, 201, { objects: { id: "1" } });
      if (m === "GET" && p === "/StaticCountry") return send(res, 200, { objects: [{ id: "1", code: "de" }, { id: "3", code: "at" }, { id: "47", code: "ch" }] });
      if (m === "POST" && p === "/Order/Factory/saveOrder") {
        state.saved.push(json);
        const net = (json.orderPosSave || []).reduce((s, x) => s + x.price * x.quantity, 0);
        const gross = (json.orderPosSave || []).reduce((s, x) => s + x.price * x.quantity * (1 + x.taxRate / 100), 0);
        const id = String(900 + state.saved.length);
        state.orders.push(Object.assign({}, json.order, { id, status: "100", sumNet: String(net), sumGross: String(gross), contact: contact(json.order.contact.id, (state.contacts.find((c) => c.id === String(json.order.contact.id)) || {}).name || "?") }));
        return send(res, 201, { objects: { order: { id, objectName: "Order", orderNumber: json.order.orderNumber, sumGross: String(Math.round(gross * 100) / 100) }, orderPos: [] } });
      }
      let mm;
      if (m === "GET" && (mm = p.match(/^\/Order\/(\d+)\/getPdf$/))) {
        if (!state.orders.some((o) => o.id === mm[1])) return send(res, 400, { error: { message: "order not found" } });
        return send(res, 200, { objects: { filename: "AN-" + mm[1] + ".pdf", mimeType: "application/pdf", base64encoded: true, content: Buffer.from("%PDF-1.4 Angebot " + mm[1]).toString("base64") } });
      }
      if (m === "PUT" && (mm = p.match(/^\/Order\/(\d+)\/sendBy$/))) { state.puts.push({ id: mm[1], sendBy: json }); const o = state.orders.find((x) => x.id === mm[1]); if (o) o.status = "200"; return send(res, 200, { objects: o || {} }); }
      if (m === "PUT" && (mm = p.match(/^\/Order\/(\d+)$/))) { state.puts.push({ id: mm[1], body: json }); const o = state.orders.find((x) => x.id === mm[1]); if (o && json && json.status) o.status = String(json.status); return send(res, 200, { objects: o || {} }); }
      if (m === "POST" && p === "/Invoice/Factory/createInvoiceFromOrder") { state.invoicesFromOrder.push(json); return send(res, 201, { objects: { id: "7001", objectName: "Invoice", invoiceNumber: "RE-1100", sumGross: "2400" } }); }
      if (m === "GET") return send(res, 200, { objects: [] });   // alles andere (Cockpit-Daten): leer
      return send(res, 404, { error: { message: "mock: unbekannt " + m + " " + p } });
    });
  });
  return { server, state };
};
