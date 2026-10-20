// Graph-API-Attrappe (Meta / WhatsApp Cloud API) für test/whatsapp.test.js: Code → Token, debug_token, subscribed_apps, Nummer lesen,
// phone_numbers, smb_app_data (Abgleich), Medien in zwei Schritten (GET /{media-id} → url, GET url mit Bearer → Datei). Alle Aufrufe in S.calls.
"use strict";
const http = require("http");
module.exports = function (opt) {
  opt = opt || {};
  const V = opt.version || "v26.0", APP_ID = opt.appId || "1234567890", APP_SECRET = opt.appSecret || "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
  const TOKEN = opt.token || "EAAtoken-geheim-123", WABA = opt.waba || "102030405060", PHONE = opt.phone || "998877665544";
  const S = { calls: [], media: {}, failMedia: {}, base: "", codes: { "good-code": TOKEN } };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x"), p = u.pathname; let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      const auth = String(req.headers.authorization || ""), j = (code, o) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
      S.calls.push({ method: req.method, path: p, query: Object.fromEntries(u.searchParams), body: body ? JSON.parse(body) : null, auth });
      const bad = () => j(401, { error: { message: "Invalid OAuth access token.", type: "OAuthException", code: 190 } });
      // Medien-Datei (Schritt 2): nur mit Bearer
      if (p.indexOf("/media-bin/") === 0) {
        if (auth !== "Bearer " + TOKEN) return bad();
        const id = p.slice(11), m = S.media[id]; if (!m) return j(404, { error: { message: "not found" } });
        if (S.failMedia[id] > 0) { S.failMedia[id]--; res.writeHead(503); return res.end("busy"); }
        res.writeHead(200, { "Content-Type": m.mime, "Content-Length": m.data.length }); return res.end(m.data);
      }
      if (p.indexOf("/" + V + "/") !== 0) return j(404, { error: { message: "unknown version" } });
      const rest = p.slice(V.length + 2);
      if (rest === "oauth/access_token") {
        if (u.searchParams.get("client_id") !== APP_ID || u.searchParams.get("client_secret") !== APP_SECRET) return j(400, { error: { message: "Error validating client secret.", code: 1 } });
        const t = S.codes[u.searchParams.get("code")]; if (!t) return j(400, { error: { message: "Invalid verification code format.", type: "OAuthException", code: 100 } });
        delete S.codes[u.searchParams.get("code")]; S.codes["good-code-2"] = TOKEN;   // Codes gelten nur einmal
        return j(200, { access_token: t, token_type: "bearer" });
      }
      if (rest === "debug_token") return j(200, { data: { app_id: APP_ID, is_valid: true, granular_scopes: [{ scope: "whatsapp_business_management", target_ids: [WABA] }, { scope: "whatsapp_business_messaging", target_ids: [WABA] }] } });
      if (auth !== "Bearer " + TOKEN) return bad();
      if (rest === WABA + "/subscribed_apps") return j(200, { success: true });
      if (rest === WABA + "/phone_numbers") return j(200, { data: [{ id: PHONE, display_phone_number: "+43 664 1234567", verified_name: "FS Creative" }] });
      if (rest === PHONE && req.method === "GET") return j(200, { id: PHONE, display_phone_number: "+43 664 1234567", verified_name: "FS Creative" });
      if (rest === PHONE + "/smb_app_data" && req.method === "POST") return j(200, { success: true });
      const m = S.media[rest];
      if (m && req.method === "GET") return j(200, { messaging_product: "whatsapp", url: S.base + "/media-bin/" + rest, mime_type: m.mime, sha256: "x", file_size: m.size != null ? m.size : m.data.length, id: rest });
      return j(400, { error: { message: "Unsupported get request.", code: 100 } });
    });
  });
  return { server, S, APP_ID, APP_SECRET, TOKEN, WABA, PHONE, count: (method, path) => S.calls.filter(c => c.method === method && c.path === path).length };
};
