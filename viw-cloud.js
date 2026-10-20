// VIW Cloud: Dateien in der Nextcloud von VIW direkt aus dem Cockpit – Ordner ansehen, hoch- und herunterladen (auch ganze Ordner),
// Ordner anlegen, umbenennen, verschieben, löschen (landet im Papierkorb der Nextcloud), Mail-Anhänge ablegen.
// Zugang über WebDAV – Anmeldefenster im Cockpit (Zugangsdaten verschlüsselt am Server, Schlüssel aus ADMIN_AUTH_SECRET; nie zurück ans Cockpit),
// ersatzweise Railway-Variablen VIW_CLOUD_URL, VIW_CLOUD_USER, VIW_CLOUD_PASSWORD. Zwei Arten:
//  • Anmeldung (auch Gastzugang): Adresse + Login (E-Mail/Benutzer) + Passwort bzw. App-Passwort; die interne Benutzer-ID holt sich das Modul selbst.
//  • Freigabe-Link (…/s/TOKEN): nur der Link, ggf. mit Link-Passwort – öffentliche WebDAV-Schnittstelle der Freigabe.
// Große Dateien bei Anmeldung in Teilen zu 10 MB (Nextcloud-Chunking); über einen Freigabe-Link in einem Stück (durchgereicht). Cockpit-Seite: admin-cockpit/zviw.js
"use strict";
const crypto = require("crypto");
const { Readable } = require("stream");

module.exports = function (D) {
  const send = D.send, mailAttachment = D.mailAttachment;
  const MAX_PART = 10.5 * 1024 * 1024;
  const INLINE_OK = /^(application\/pdf|image\/(png|jpe?g|gif|webp|bmp|heic)|text\/plain|audio\/|video\/)/i;
  const J = (res, code, o) => send(res, code, JSON.stringify(o), "application/json; charset=utf-8", { "Cache-Control": "no-store" });
  const fail = (status, msg) => { const e = new Error(msg); e.status = status; return e; };

  // ---- gespeicherte Anmeldung (Datei im Datenordner, Passwort AES-256-GCM) ----
  const path = require("path"), fs = require("fs");
  const LOGIN_FILE = path.join(D.DATA_DIR || __dirname, "viw-cloud.json");
  const KEY = crypto.createHash("sha256").update("viw-cloud|" + String(D.secret || "")).digest();
  function seal(t) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", KEY, iv), e = Buffer.concat([c.update(String(t), "utf8"), c.final()]); return [iv, c.getAuthTag(), e].map(b => b.toString("base64")).join("."); }
  function unseal(x) { try { const [iv, tag, e] = String(x).split(".").map(v => Buffer.from(v, "base64")); const d = crypto.createDecipheriv("aes-256-gcm", KEY, iv); d.setAuthTag(tag); return Buffer.concat([d.update(e), d.final()]).toString("utf8"); } catch (err) { return null; } }
  let STORED;   // undefined = noch nicht gelesen, null = keine
  function stored() {
    if (STORED !== undefined) return STORED;
    try { const j = JSON.parse(fs.readFileSync(LOGIN_FILE, "utf8")); const pass = j.pass ? unseal(j.pass) : ""; STORED = j && j.url && pass !== null ? { url: j.url, user: j.user || "", pass, at: j.at } : null; }
    catch (e) { STORED = null; }
    return STORED;
  }
  function saveLogin(v) { fs.writeFileSync(LOGIN_FILE, JSON.stringify({ url: v.url, user: v.user || "", pass: v.pass ? seal(v.pass) : "", at: new Date().toISOString() }), { mode: 0o600 }); STORED = undefined; ACC = null; }
  function clearLogin() { try { fs.unlinkSync(LOGIN_FILE); } catch (e) {} STORED = undefined; ACC = null; }
  function cfg() { const st = stored(); return st ? Object.assign(cfgFrom(st), { source: "login" }) : Object.assign(cfgFrom({ url: process.env.VIW_CLOUD_URL, user: process.env.VIW_CLOUD_USER, pass: process.env.VIW_CLOUD_PASSWORD }), { source: "env" }); }
  function cfgFrom(v) {
    let url = String(v.url || "").trim();
    const sm = url.match(/\/(?:index\.php\/)?s\/([A-Za-z0-9]{5,64})(?:[/?#]|$)/), token = sm ? sm[1] : "";
    url = url.replace(/[?#].*$/, "");
    // auch kopierte Browser-Adressen wie …/index.php/apps/files/?dir=/ oder …/remote.php/dav/files/… annehmen
    url = url.replace(/\/remote\.php(\/.*)?$/i, "").replace(/\/(index\.php\/)?(apps|s|f|login)(\/.*)?$/i, "").replace(/\/index\.php\/?$/i, "").replace(/\/+$/, "");
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    return { url, token, mode: token ? "share" : "user", user: String(v.user || "").trim(), pass: String(v.pass || "") };
  }
  function cfgError(c) {
    if (!c.url || (c.mode === "user" && (!c.user || !c.pass))) return "nicht eingerichtet";
    let u; try { u = new URL(c.url); } catch (e) { return "Die Adresse ist ungültig"; }
    if (u.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return "Die Adresse muss mit https:// beginnen";
    return "";
  }
  const basic = (u, p) => "Basic " + Buffer.from(u + ":" + p).toString("base64");

  // Pfade aus dem Cockpit: „/Ordner/Datei.pdf“ – keine „.“/„..“-Teile, keine Steuerzeichen
  function parts(p) {
    const a = String(p == null ? "" : p).split("/").filter(s => s !== "");
    for (const s of a) if (s === "." || s === ".." || /[\x00-\x1f\\]/.test(s) || s.length > 250) throw fail(400, "Ungültiger Pfad");
    if (a.length > 40) throw fail(400, "Pfad zu tief");
    return a;
  }
  const norm = p => "/" + parts(p).join("/");
  const parentOf = p => { const a = parts(p); a.pop(); return "/" + a.join("/"); };
  const baseOf = p => parts(p).pop() || "";
  function validName(n) {
    n = String(n == null ? "" : n).trim();
    if (!n) throw fail(400, "Bitte einen Namen eingeben");
    if (n.length > 200) throw fail(400, "Name zu lang");
    if (/[\/\\\x00-\x1f]/.test(n) || n === "." || n === "..") throw fail(400, "Ungültiger Name – bitte ohne / und \\");
    return n;
  }
  const enc = p => { const a = parts(p); return a.length ? "/" + a.map(encodeURIComponent).join("/") : ""; };
  const filesUrl = (a, p) => a.root + enc(p);
  const uploadsUrl = (a, id, n) => { if (!a.uploads) throw fail(400, "Über einen Freigabe-Link geht kein Teil-Upload"); return a.uploads + "/" + id + (n != null ? "/" + n : ""); };

  async function rawFetch(method, url, auth, opt) {
    opt = opt || {};
    const init = { method, headers: Object.assign({ Authorization: auth, "OCS-APIRequest": "true" }, opt.headers || {}), redirect: "manual", signal: AbortSignal.timeout(opt.timeout || 30000) };
    if (opt.body !== undefined) { init.body = opt.body; if (opt.body && typeof opt.body.pipe === "function") init.duplex = "half"; }
    try { return await fetch(url, init); }
    catch (x) { throw fail(502, "VIW Cloud nicht erreichbar" + (x && x.name === "TimeoutError" ? " (Zeitüberschreitung)" : "")); }
  }
  // Zugang einmal ermitteln (je Konfiguration zwischengespeichert): WebDAV-Wurzel, Anmeldung, ggf. Teil-Upload-Ordner
  let ACC = null;
  const PF0 = { Depth: "0", "Content-Type": "application/xml; charset=utf-8" };
  async function acct(cand) {
    const c = cand || cfg(), e = cfgError(c); if (e) throw fail(503, e === "nicht eingerichtet" ? "VIW Cloud nicht eingerichtet" : e);
    const key = [c.url, c.mode, c.token, c.user, crypto.createHash("sha256").update(c.pass).digest("hex")].join("|");
    if (ACC && ACC.key === key) return ACC;
    if (c.mode === "share") {
      // Nextcloud ab 29: /public.php/dav/files/TOKEN (Link-Passwort mit Benutzer „anonymous“), ältere: /public.php/webdav (Benutzer = Token)
      const a = { key, mode: "share", root: c.url + "/public.php/dav/files/" + c.token, auth: basic("anonymous", c.pass), web: c.url + "/index.php/s/" + c.token };
      const r = await rawFetch("PROPFIND", a.root + "/", a.auth, { headers: PF0, body: PROPS });
      if (r.status === 207) return (ACC = a);
      const b = Object.assign({}, a, { root: c.url + "/public.php/webdav", auth: basic(c.token, c.pass) });
      const r2 = await rawFetch("PROPFIND", b.root + "/", b.auth, { headers: PF0, body: PROPS });
      if (r2.status === 207) return (ACC = b);
      if (r.status === 401 || r2.status === 401) throw fail(502, c.pass ? "Freigabe-Link: Passwort stimmt nicht (VIW_CLOUD_PASSWORD)" : "Freigabe-Link ist mit Passwort geschützt – bitte VIW_CLOUD_PASSWORD setzen");
      if (r.status === 404 && r2.status === 404) throw fail(404, "Freigabe-Link nicht gefunden – abgelaufen oder entfernt?");
      throw davError(r2, "Freigabe öffnen");
    }
    // Anmeldung (auch Gastzugang): Login darf die E-Mail sein – die WebDAV-Pfade brauchen die interne Benutzer-ID
    const auth = basic(c.user, c.pass); let id = c.user;
    const credErr = () => fail(502, "Anmeldung bei der VIW Cloud abgelehnt – Login (E-Mail) und Passwort prüfen. Mit Zwei-Faktor-Anmeldung geht es nur mit App-Passwort.");
    const o = await rawFetch("GET", c.url + "/ocs/v2.php/cloud/user?format=json", auth, { headers: { Accept: "application/json" } });
    if (o.status === 401) throw credErr();
    if (o.ok) { const j = await o.json().catch(() => null); const v = j && j.ocs && j.ocs.data && j.ocs.data.id; if (v) id = String(v); }
    const a = { key, mode: "user", id, root: c.url + "/remote.php/dav/files/" + encodeURIComponent(id), uploads: c.url + "/remote.php/dav/uploads/" + encodeURIComponent(id), auth, web: c.url };
    const r = await rawFetch("PROPFIND", a.root + "/", a.auth, { headers: PF0, body: PROPS });
    if (r.status === 401) throw credErr();
    if (r.status !== 207) throw davError(r, "Anmelden");
    return (ACC = a);
  }
  async function dav(method, url, opt) { const a = await acct(); return rawFetch(method, url, a.auth, opt); }
  function davError(r, what) {
    const s = r.status;
    if (s === 401) return fail(502, "Anmeldung bei der VIW Cloud abgelehnt – Benutzername und App-Passwort prüfen");
    if (s === 403) return fail(403, "Keine Berechtigung in der VIW Cloud" + (what ? " (" + what + ")" : ""));
    if (s === 404) return fail(404, "Nicht gefunden – evtl. in der Nextcloud verschoben oder gelöscht");
    if (s === 405 && what === "Ordner anlegen") return fail(409, "Diesen Ordner gibt es schon");
    if (s === 409) return fail(409, "Der Zielordner fehlt");
    if (s === 412) return fail(409, "exists");
    if (s === 413) return fail(413, "Datei zu groß für die VIW Cloud");
    if (s === 423) return fail(423, "Gerade gesperrt – wird in der Nextcloud bearbeitet");
    if (s === 507) return fail(507, "Speicherplatz in der VIW Cloud ist voll");
    if (s >= 300 && s < 400) return fail(502, "VIW Cloud leitet um – Adresse prüfen (VIW_CLOUD_URL)");
    return fail(502, "VIW Cloud: Fehler " + s + (what ? " (" + what + ")" : ""));
  }

  // ---- PROPFIND-Antwort (multistatus) lesen ----
  const PROPS = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:prop>' +
    '<d:getlastmodified/><d:getcontentlength/><d:getcontenttype/><d:resourcetype/><d:getetag/><oc:fileid/><oc:size/><oc:permissions/><nc:has-preview/>' +
    '<d:quota-used-bytes/><d:quota-available-bytes/></d:prop></d:propfind>';
  const unx = s => String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, "&");
  function tag(b, name) { const m = b.match(new RegExp("<(?:[\\w-]+:)?" + name + "(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?" + name + "\\s*>)", "i")); return m ? (m[1] == null ? "" : m[1]) : null; }
  function parseMulti(xml, c) {
    const base = decodeURIComponent(new URL(c.root + "/").pathname);
    const out = [];
    for (const b of String(xml).split(/<(?:[\w-]+:)?response(?=[\s>])/i).slice(1)) {
      let href = unx(tag(b, "href") || "").replace(/^https?:\/\/[^/]+/i, "");
      try { href = decodeURIComponent(href); } catch (e) {}
      if ((href.replace(/\/?$/, "/")).indexOf(base) !== 0) continue;
      const rel = href.slice(base.length).replace(/\/+$/, ""), dir = /collection/i.test(tag(b, "resourcetype") || "");
      const lm = unx(tag(b, "getlastmodified") || ""), used = tag(b, "quota-used-bytes"), avail = tag(b, "quota-available-bytes");
      out.push({ path: "/" + rel, name: rel.split("/").pop(), dir, size: +unx(tag(b, dir ? "size" : "getcontentlength") || tag(b, "size") || "0") || 0,
        modified: lm && !isNaN(Date.parse(lm)) ? new Date(lm).toISOString() : "", type: dir ? "" : unx(tag(b, "getcontenttype") || ""),
        fileid: unx(tag(b, "fileid") || ""), perms: unx(tag(b, "permissions") || ""), preview: /true/i.test(tag(b, "has-preview") || ""),
        quota: used != null && used !== "" ? { used: +used || 0, avail: +avail } : null });
    }
    return out;
  }
  async function propfind(p, depth) {
    const c = await acct(), r = await dav("PROPFIND", filesUrl(c, p) + "/", { headers: { Depth: String(depth), "Content-Type": "application/xml; charset=utf-8" }, body: PROPS });
    if (r.status !== 207) throw davError(r, "Ordner lesen");
    return parseMulti(await r.text(), c);
  }
  async function list(p) {
    const at = norm(p), all = await propfind(at, 1);
    const self = all.find(x => x.path === at) || { path: at, name: baseOf(at), dir: true };
    const items = all.filter(x => x.path !== at).sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" }) : a.dir ? -1 : 1));
    return { path: at, self, items };
  }
  async function exists(p) { const r = await dav("PROPFIND", filesUrl(await acct(), p), { headers: { Depth: "0", "Content-Type": "application/xml; charset=utf-8" }, body: PROPS }); if (r.status === 207) return true; if (r.status === 404) return false; throw davError(r, "prüfen"); }

  // ---- Ändern ----
  async function mkdir(p) { const r = await dav("MKCOL", filesUrl(await acct(), p)); if (r.status !== 201) throw davError(r, "Ordner anlegen"); return { path: norm(p) }; }
  async function mkdirs(p) {   // ganzer Pfad, vorhandene Ordner sind kein Fehler (Ordner-Upload)
    const a = parts(p); let cur = "";
    for (const s of a) { cur += "/" + s; const r = await dav("MKCOL", filesUrl(await acct(), cur)); if (r.status !== 201 && r.status !== 405) throw davError(r, "Ordner anlegen"); }
    return { path: "/" + a.join("/") };
  }
  async function moveTo(from, to, overwrite) {
    const c = await acct(); if (norm(from) === "/") throw fail(400, "Der oberste Ordner bleibt");
    if (norm(to) === norm(from)) return { path: norm(to) };
    if ((norm(to) + "/").indexOf(norm(from) + "/") === 0) throw fail(400, "Ein Ordner kann nicht in sich selbst verschoben werden");
    const r = await dav("MOVE", filesUrl(c, from), { headers: { Destination: filesUrl(c, to), Overwrite: overwrite ? "T" : "F" }, timeout: 120000 });
    if (r.status !== 201 && r.status !== 204) throw davError(r, "verschieben");
    return { path: norm(to) };
  }
  async function remove(p) { if (norm(p) === "/") throw fail(400, "Der oberste Ordner bleibt"); const r = await dav("DELETE", filesUrl(await acct(), p), { timeout: 120000 }); if (r.status !== 204 && r.status !== 200) throw davError(r, "löschen"); return { path: norm(p) }; }
  async function putFile(p, buf, opt) {
    opt = opt || {}; const h = { "Content-Type": "application/octet-stream", "Content-Length": String(buf.length) };
    if (!opt.overwrite) h["If-None-Match"] = "*";
    if (opt.mtime > 0) h["X-OC-Mtime"] = String(Math.floor(opt.mtime));
    const r = await dav("PUT", filesUrl(await acct(), p), { headers: h, body: buf, timeout: 600000 });
    if (r.status !== 201 && r.status !== 204) throw davError(r, "hochladen");
    return { path: norm(p) };
  }
  async function putStream(p, req, len, opt) {
    const h = { "Content-Type": "application/octet-stream", "Content-Length": String(len) };
    if (!opt.overwrite) h["If-None-Match"] = "*";
    if (opt.mtime > 0) h["X-OC-Mtime"] = String(Math.floor(opt.mtime));
    const r = await dav("PUT", filesUrl(await acct(), p), { headers: h, body: req, timeout: 3600000 });
    if (r.status !== 201 && r.status !== 204) throw davError(r, "hochladen");
    return { path: norm(p) };
  }
  // freier Name: „Datei.pdf“, sonst „Datei (2).pdf“ …
  async function freeName(dir, name) {
    const dot = name.lastIndexOf("."), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
    for (let i = 1; i < 50; i++) { const n = i === 1 ? name : stem + " (" + i + ")" + ext, p = (norm(dir) === "/" ? "" : norm(dir)) + "/" + n; if (!(await exists(p))) return p; }
    throw fail(409, "Kein freier Dateiname gefunden");
  }
  // Teil-Upload (Nextcloud-Chunking v2): Ordner anlegen → Teile 00001… → „.file“ ans Ziel verschieben
  const chunkId = id => { if (!/^fsc-[a-f0-9]{16,40}$/.test(String(id || ""))) throw fail(400, "Ungültige Upload-Kennung"); return String(id); };
  async function chunkStart(p) { const c = await acct(), id = "fsc-" + crypto.randomBytes(12).toString("hex"); const r = await dav("MKCOL", uploadsUrl(c, id), { headers: { Destination: filesUrl(c, p) } }); if (r.status !== 201) throw davError(r, "Upload vorbereiten"); return { id }; }
  async function chunkPut(id, n, p, total, buf) {
    const c = await acct(); n = parseInt(n, 10); if (!(n >= 1 && n <= 10000)) throw fail(400, "Ungültiger Teil");
    const r = await dav("PUT", uploadsUrl(c, chunkId(id), String(n).padStart(5, "0")), { headers: { Destination: filesUrl(c, p), "OC-Total-Length": String(+total || 0), "Content-Type": "application/octet-stream", "Content-Length": String(buf.length) }, body: buf, timeout: 600000 });
    if (r.status !== 201 && r.status !== 204) throw davError(r, "Teil " + n + " hochladen");
    return { n };
  }
  async function chunkDone(id, p, total, mtime, overwrite) {
    const c = await acct(), h = { Destination: filesUrl(c, p), "OC-Total-Length": String(+total || 0), Overwrite: overwrite ? "T" : "F" };
    if (mtime > 0) h["X-OC-Mtime"] = String(Math.floor(mtime));
    const r = await dav("MOVE", uploadsUrl(c, chunkId(id), ".file"), { headers: h, timeout: 600000 });
    if (r.status !== 201 && r.status !== 204) { dav("DELETE", uploadsUrl(c, id)).catch(() => {}); throw davError(r, "zusammensetzen"); }
    return { path: norm(p) };
  }
  async function chunkAbort(id) { await dav("DELETE", uploadsUrl(await acct(), chunkId(id))).catch(() => {}); return { id }; }

  function readBody(req, max) {
    return new Promise((resolve, reject) => { const ch = []; let n = 0;
      req.on("data", d => { n += d.length; if (n > max) { reject(fail(413, "Teil zu groß")); req.destroy(); return; } ch.push(d); });
      req.on("end", () => resolve(Buffer.concat(ch))); req.on("error", reject); });
  }
  function readJson(req) { return readBody(req, 20000).then(b => { try { return JSON.parse(b.toString("utf8") || "{}"); } catch (e) { throw fail(400, "bad_json"); } }); }
  const cdName = (kind, n) => kind + "; filename=\"" + String(n).replace(/[^\x20-\x7e]|["\\]/g, "_") + "\"; filename*=UTF-8''" + encodeURIComponent(n);

  async function status(check) {
    const c = cfg(), e = cfgError(c);
    const st = c.source === "login" ? stored() : null;
    const out = { ok: true, configured: !e, error: e && e !== "nicht eingerichtet" ? e : "", source: c.source, form: st ? { url: st.url, user: st.user } : null, mode: c.mode, user: c.mode === "share" ? "" : c.user,
      web: e ? "" : c.mode === "share" ? c.url + "/index.php/s/" + c.token : c.url, host: (() => { try { return new URL(c.url).host; } catch (x) { return ""; } })() };
    if (!out.configured || !check) return out;
    try { const r = await propfind("/", 0); out.reachable = true; out.quota = r[0] && r[0].quota; }
    catch (x) { out.reachable = false; out.error = x.message; }
    return out;
  }

  let TRIES = [];
  async function handleAdmin(req, res, u, p) {
    try {
      const q = k => u.searchParams.get(k);
      if (p === "/admin/api/viw/status" && req.method === "GET") return J(res, 200, await status(q("check") === "1"));
      // Anmeldefenster: Zugang prüfen und erst dann (verschlüsselt) speichern; Abmelden löscht ihn
      if (p === "/admin/api/viw/login" && req.method === "POST") {
        const pl = await readJson(req);
        if (pl.op === "logout") { clearLogin(); return J(res, 200, { ok: true }); }
        TRIES = TRIES.filter(t => Date.now() - t < 600000);
        if (TRIES.length >= 6) return J(res, 429, { ok: false, error: "Zu viele Versuche – bitte in 10 Minuten nochmal (schützt deinen VIW-Zugang vor einer Sperre)." });
        const v = { url: String(pl.url || "").trim().slice(0, 500), user: String(pl.user || "").trim().slice(0, 200), pass: String(pl.pass || "").slice(0, 500) };
        const c = cfgFrom(v), e = cfgError(c);
        if (e) return J(res, 200, { ok: false, error: e === "nicht eingerichtet" ? (!c.url ? "Bitte die Adresse der VIW Cloud eingeben." : "Bitte Login und Passwort eingeben – oder einen Freigabe-Link (…/s/…).") : e });
        TRIES.push(Date.now());
        await acct(c); saveLogin(v); TRIES = [];
        return J(res, 200, Object.assign(await status(true), { ok: true }));
      }
      if (p === "/admin/api/viw/list" && req.method === "GET") return J(res, 200, Object.assign({ ok: true }, await list(q("path") || "/")));
      if ((p === "/admin/api/viw/file" || p === "/admin/api/viw/preview") && req.method === "GET") {
        const c = cfg(), prev = p === "/admin/api/viw/preview";
        if (prev && c.mode === "share") return send(res, 404, "");   // Vorschaubilder nur mit Anmeldung
        const r = prev ? await dav("GET", c.url + "/index.php/core/preview?fileId=" + encodeURIComponent(String(q("fileid") || "").replace(/\D/g, "")) + "&x=96&y=96&a=1&mode=cover&forceIcon=0")
          : await dav("GET", filesUrl(await acct(), q("path") || ""), { timeout: 600000 });
        const type = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
        if (prev) { if (!r.ok || !/^image\/(png|jpe?g|gif|webp)$/.test(type)) { if (r.body) r.body.cancel().catch(() => {}); return send(res, 404, ""); }
          res.writeHead(200, { "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" }); return Readable.fromWeb(r.body).pipe(res); }
        if (!r.ok) { if (r.body) r.body.cancel().catch(() => {}); const e = davError(r, "herunterladen"); return send(res, e.status || 502, e.message, "text/plain; charset=utf-8", { "Cache-Control": "no-store" }); }
        const inline = q("inline") === "1" && INLINE_OK.test(type), h = { "Content-Type": inline ? r.headers.get("content-type") : "application/octet-stream", "Content-Disposition": cdName(inline ? "inline" : "attachment", baseOf(q("path")) || "datei"),
          "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
        if (r.headers.get("content-length")) h["Content-Length"] = r.headers.get("content-length");
        res.writeHead(200, h); return Readable.fromWeb(r.body).pipe(res);
      }
      if (p === "/admin/api/viw/upload" && req.method === "PUT") {
        const dir = parentOf(q("path")), name = validName(baseOf(q("path"))), target = (dir === "/" ? "" : dir) + "/" + name, o = { overwrite: q("overwrite") === "1", mtime: +q("mtime") || 0 };
        const len = +req.headers["content-length"] || 0;
        if (len > MAX_PART) {   // große Datei in einem Stück (Freigabe-Link kennt keine Teile): direkt durchreichen, nicht zwischenspeichern
          if ((await acct()).mode !== "share") { req.resume(); throw fail(413, "Große Dateien gehen in Teilen – bitte die Seite neu laden"); }
          return J(res, 200, Object.assign({ ok: true }, await putStream(target, req, len, o)));
        }
        return J(res, 200, Object.assign({ ok: true }, await putFile(target, await readBody(req, MAX_PART), o)));
      }
      if (p === "/admin/api/viw/chunk" && req.method === "PUT") { const buf = await readBody(req, MAX_PART); return J(res, 200, Object.assign({ ok: true }, await chunkPut(q("id"), q("n"), q("path"), q("total"), buf))); }
      if (p === "/admin/api/viw/op" && req.method === "POST") {
        const pl = await readJson(req), op = String(pl.op || "");
        if (op === "mkdir") { const parent = norm(pl.dir || "/"); return J(res, 200, Object.assign({ ok: true }, await mkdir((parent === "/" ? "" : parent) + "/" + validName(pl.name)))); }
        if (op === "mkdirs") return J(res, 200, Object.assign({ ok: true }, await mkdirs(pl.path)));
        if (op === "rename") { const dir = parentOf(pl.path); return J(res, 200, Object.assign({ ok: true }, await moveTo(pl.path, (dir === "/" ? "" : dir) + "/" + validName(pl.name), false))); }
        if (op === "move") { const to = norm(pl.to || "/"); return J(res, 200, Object.assign({ ok: true }, await moveTo(pl.path, (to === "/" ? "" : to) + "/" + baseOf(pl.path), false))); }
        if (op === "delete") { if (pl.confirm !== true) return J(res, 400, { ok: false, error: "Bestätigung fehlt" }); return J(res, 200, Object.assign({ ok: true }, await remove(pl.path))); }
        if (op === "exists") return J(res, 200, { ok: true, exists: await exists(pl.path) });
        if (op === "chunkstart") return J(res, 200, Object.assign({ ok: true }, await chunkStart(pl.path)));
        if (op === "chunkdone") return J(res, 200, Object.assign({ ok: true }, await chunkDone(pl.id, pl.path, pl.total, +pl.mtime || 0, !!pl.overwrite)));
        if (op === "chunkabort") return J(res, 200, Object.assign({ ok: true }, await chunkAbort(pl.id)));
        if (op === "frommail") {   // Mail-Anhänge ablegen: { mails:[{folder,uid,index,account,filename}], dir } – vorhandene Namen bekommen „(2)“
          if (!mailAttachment) throw fail(503, "Postfach nicht verbunden");
          const dir = norm(pl.dir || "/"), list = (Array.isArray(pl.mails) ? pl.mails : [pl.mail]).filter(Boolean).slice(0, 30), saved = [];
          for (const m of list) {
            const a = await mailAttachment(m), name = validName(String(a.fname || m.filename || "anhang").replace(/[\/\\\x00-\x1f]/g, "_").slice(0, 200));
            const target = await freeName(dir, name); await putFile(target, a.buf, {}); saved.push(target);
          }
          return J(res, 200, { ok: true, saved });
        }
        return J(res, 400, { ok: false, error: "unbekannte Aktion" });
      }
      return J(res, 404, { ok: false, error: "nicht gefunden" });
    } catch (e) {
      if (res.headersSent) { try { res.end(); } catch (x) {} return; }
      const st = e.status || 500; if (st >= 500 && st !== 502 && st !== 503) console.error("VIW Cloud:", e.message);
      return J(res, st === 409 && e.message === "exists" ? 409 : 200, { ok: false, error: e.message === "exists" ? "exists" : String(e.message || e).slice(0, 300) });
    }
  }
  return { handleAdmin, status, _test: { parseMulti, parts, cfg, reset: () => { ACC = null; } } };
};
