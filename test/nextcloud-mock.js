// Nextcloud-Attrappe (WebDAV im Speicher) für test/viw.test.js und die lokale Sichtprüfung: PROPFIND, MKCOL, PUT (If-None-Match, X-OC-Mtime),
// GET, DELETE, MOVE (Overwrite), Teil-Upload (uploads/…/.file), Vorschaubilder. Verlangt Content-Length beim PUT (wie PHP hinter manchen Proxys).
"use strict";
const http = require("http");
module.exports = function (opt) {
  opt = opt || {};
  const USER = opt.user || "simon", PASS = opt.pass || "app-pass-123";
  const S = { files: new Map([["/", { dir: true, mtime: Date.now(), id: 1 }]]), uploads: new Map(), trash: [], log: [], nextId: 2 };
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  const put = (p, o) => S.files.set(p, Object.assign({ id: S.nextId++, mtime: Date.now() }, o));
  (opt.seed || []).forEach(([p, o]) => put(p, o));
  const parent = p => p.slice(0, p.lastIndexOf("/")) || "/";
  const kids = p => [...S.files.keys()].filter(k => k !== p && parent(k) === p);
  const under = p => [...S.files.keys()].filter(k => p === "/" || k === p || k.indexOf(p + "/") === 0);
  const sizeOf = p => { const f = S.files.get(p); return f.dir ? under(p).reduce((a, k) => a + ((S.files.get(k).data || "").length || 0), 0) : f.data.length; };
  const enc = p => p.split("/").map(encodeURIComponent).join("/");
  const xe = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const typeOf = n => (/\.pdf$/i.test(n) ? "application/pdf" : /\.png$/i.test(n) ? "image/png" : /\.jpe?g$/i.test(n) ? "image/jpeg" : /\.html?$/i.test(n) ? "text/html" : "application/octet-stream");
  function entry(p) {
    const f = S.files.get(p), href = "/remote.php/dav/files/" + USER + (p === "/" ? "/" : enc(p) + (f.dir ? "/" : ""));
    return "<d:response><d:href>" + xe(href) + "</d:href><d:propstat><d:prop><d:getlastmodified>" + new Date(f.mtime).toUTCString() + "</d:getlastmodified>" +
      (f.dir ? "<d:resourcetype><d:collection/></d:resourcetype><oc:size>" + sizeOf(p) + "</oc:size>" : "<d:resourcetype/><d:getcontentlength>" + f.data.length + "</d:getcontentlength><d:getcontenttype>" + typeOf(p) + "</d:getcontenttype>") +
      "<d:getetag>&quot;" + f.id + "&quot;</d:getetag><oc:fileid>" + f.id + "</oc:fileid><oc:permissions>RGDNVW</oc:permissions><nc:has-preview>" + (/\.(png|jpe?g)$/i.test(p) ? "true" : "false") + "</nc:has-preview>" +
      (p === "/" ? "<d:quota-used-bytes>" + sizeOf("/") + "</d:quota-used-bytes><d:quota-available-bytes>1073741824</d:quota-available-bytes>" : "") +
      "</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat><d:propstat><d:prop><x:missing xmlns:x=\"urn:x\"/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response>";
  }
  const server = http.createServer((req, res) => {
    const ch = []; req.on("data", d => ch.push(d)); req.on("end", () => {
      const body = Buffer.concat(ch), u = new URL(req.url, "http://x"), end = (c, b, h) => { res.writeHead(c, h || {}); res.end(b || ""); };
      S.log.push(req.method + " " + u.pathname);
      const auth = req.headers.authorization || "";
      if (auth !== "Basic " + Buffer.from(USER + ":" + PASS).toString("base64")) return end(401, "", { "WWW-Authenticate": 'Basic realm="Nextcloud"' });
      if (u.pathname === "/index.php/core/preview") { const f = [...S.files.values()].find(x => String(x.id) === u.searchParams.get("fileId")); return f && !f.dir ? end(200, PNG, { "Content-Type": "image/png" }) : end(404); }
      const fpre = "/remote.php/dav/files/" + USER, upre = "/remote.php/dav/uploads/" + USER + "/";
      const pathOf = href => { let x = decodeURIComponent(new URL(href, "http://x").pathname); if (x.indexOf(fpre) !== 0) return null; x = x.slice(fpre.length).replace(/\/+$/, ""); return x || "/"; };
      if (u.pathname.indexOf(upre) === 0) {
        const rest = decodeURIComponent(u.pathname.slice(upre.length)).split("/"), id = rest[0], up = S.uploads.get(id);
        if (req.method === "MKCOL" && rest.length === 1) { S.uploads.set(id, { chunks: new Map(), dest: req.headers.destination || "" }); return end(201); }
        if (!up) return end(404);
        if (req.method === "PUT") { if (!req.headers["content-length"]) return end(400, "Content-Length fehlt"); if (!req.headers.destination) return end(400, "Destination fehlt"); up.chunks.set(rest[1], body); return end(201); }
        if (req.method === "DELETE") { S.uploads.delete(id); return end(204); }
        if (req.method === "MOVE" && rest[1] === ".file") {
          const data = Buffer.concat([...up.chunks.keys()].sort().map(k => up.chunks.get(k))), dst = pathOf(req.headers.destination || "");
          if (!dst) return end(400); if (+req.headers["oc-total-length"] !== data.length) return end(400, "Länge passt nicht");
          if (!S.files.has(parent(dst))) return end(409); const ex = S.files.has(dst); if (ex && req.headers.overwrite === "F") return end(412);
          put(dst, { data, mtime: req.headers["x-oc-mtime"] ? +req.headers["x-oc-mtime"] * 1000 : Date.now() }); S.uploads.delete(id); return end(ex ? 204 : 201);
        }
        return end(405);
      }
      const p = pathOf(u.pathname); if (!p) return end(404);
      const f = S.files.get(p);
      if (req.method === "PROPFIND") {
        if (!f) return end(404);
        const list = req.headers.depth === "0" || !f.dir ? [p] : [p].concat(kids(p));
        return end(207, '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">' + list.map(entry).join("") + "</d:multistatus>", { "Content-Type": "application/xml; charset=utf-8" });
      }
      if (req.method === "MKCOL") { if (f) return end(405); if (!S.files.has(parent(p))) return end(409); put(p, { dir: true }); return end(201); }
      if (req.method === "PUT") {
        if (!req.headers["content-length"]) return end(400, "Content-Length fehlt");
        if (!S.files.has(parent(p))) return end(409); if (f && req.headers["if-none-match"] === "*") return end(412);
        put(p, { data: body, mtime: req.headers["x-oc-mtime"] ? +req.headers["x-oc-mtime"] * 1000 : Date.now() }); return end(f ? 204 : 201);
      }
      if (req.method === "GET") { if (!f) return end(404); if (f.dir) return end(405); return end(200, f.data, { "Content-Type": typeOf(p), "Content-Length": String(f.data.length) }); }
      if (req.method === "DELETE") { if (!f) return end(404); under(p).forEach(k => { S.trash.push(k); S.files.delete(k); }); return end(204); }
      if (req.method === "MOVE") {
        if (!f) return end(404); const dst = pathOf(req.headers.destination || ""); if (!dst) return end(400);
        if (!S.files.has(parent(dst))) return end(409); const ex = S.files.has(dst); if (ex && req.headers.overwrite === "F") return end(412);
        under(p).forEach(k => { const v = S.files.get(k); S.files.delete(k); S.files.set(dst + k.slice(p.length), v); }); return end(ex ? 204 : 201);
      }
      return end(405);
    });
  });
  return { server, state: S, user: USER, pass: PASS };
};
