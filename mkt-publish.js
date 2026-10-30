/* Marketing: Veröffentlichen über die offiziellen Schnittstellen (kostenlos) – Anmeldung (OAuth), Token erneuern, Posten.
   Plattformen: Instagram (Instagram-Login, graph.instagram.com), Facebook-Seite, Threads, LinkedIn (Profil), YouTube Shorts, TikTok (direkt aufs Profil, sonst als Entwurf in die App),
   Pinterest, Bluesky (App-Passwort). X/Twitter kostet seit 2026 pro Post – nicht eingebaut.
   TikTok wahlweise über Zernio (zernio.com, von TikTok geprüfte App, API-Schlüssel statt eigener App): öffentlich mit Text und Hashtags – TikTok prüft keine internen Werkzeuge für Direct Post.
   Medien holen Instagram/Facebook/Threads/Pinterest (und Zernio) selbst über eine öffentliche Adresse (marketing.js: /m/…); LinkedIn, YouTube, TikTok und Bluesky bekommen die Datei hochgeladen.
   Alle Adressen sind über D.base überschreibbar (Tests mit Attrappen). Fehler kommen als lesbare deutsche Meldung zurück. */
"use strict";
const fs = require("fs");

const GV = "v26.0";
const DEF = {
  igAuth: "https://www.instagram.com/oauth/authorize", igToken: "https://api.instagram.com/oauth/access_token", ig: "https://graph.instagram.com",
  fbAuth: "https://www.facebook.com/" + GV + "/dialog/oauth", fb: "https://graph.facebook.com", fbUpload: "https://rupload.facebook.com",
  thAuth: "https://threads.net/oauth/authorize", th: "https://graph.threads.net",
  liAuth: "https://www.linkedin.com/oauth/v2/authorization", liToken: "https://www.linkedin.com/oauth/v2/accessToken", li: "https://api.linkedin.com",
  gAuth: "https://accounts.google.com/o/oauth2/v2/auth", gToken: "https://oauth2.googleapis.com/token", yt: "https://www.googleapis.com", ytUpload: "https://www.googleapis.com/upload",
  ttAuth: "https://www.tiktok.com/v2/auth/authorize/", tt: "https://open.tiktokapis.com",
  pinAuth: "https://www.pinterest.com/oauth/", pin: "https://api.pinterest.com",
  bsky: "https://bsky.social", bskyVideo: "https://video.bsky.app",
  zn: "https://zernio.com/api",
};
// Plattform → Anbieter (App-Zugang), Formate, Textgrenzen
const PLATFORMS = {
  instagram: { label: "Instagram", provider: "instagram", formats: ["bild", "karussell", "reel"], max: 2200, tags: 5 },   // Instagram erlaubt seit Dez. 2025 höchstens 5 Hashtags je Post/Reel (mehr → Post wird abgelehnt)
  facebook: { label: "Facebook", provider: "facebook", formats: ["bild", "karussell", "reel"], max: 5000, tags: 5 },
  threads: { label: "Threads", provider: "threads", formats: ["bild", "karussell", "reel"], max: 500, tags: 1 },
  tiktok: { label: "TikTok", provider: "tiktok", formats: ["reel"], max: 2200, tags: 6 },
  youtube: { label: "YouTube Shorts", provider: "google", formats: ["reel"], max: 5000, tags: 3 },
  linkedin: { label: "LinkedIn", provider: "linkedin", formats: ["bild", "karussell", "reel"], max: 3000, tags: 5 },
  pinterest: { label: "Pinterest", provider: "pinterest", formats: ["bild", "karussell"], max: 500, tags: 5 },
  bluesky: { label: "Bluesky", provider: "bluesky", formats: ["bild", "karussell", "reel"], max: 300, tags: 3 },
};
const PROVIDERS = {
  instagram: { label: "Instagram (Meta)", portal: "https://developers.facebook.com/apps", hint: "Meta-App (Typ Business) → Produkt „Instagram“ → „API-Einrichtung mit Instagram-Login“: Instagram-App-ID und -Geheimschlüssel. Dein Instagram-Konto muss ein Business- oder Creator-Konto sein." },
  facebook: { label: "Facebook (Meta)", portal: "https://developers.facebook.com/apps", hint: "Dieselbe Meta-App: App-ID und App-Geheimcode (App-Einstellungen → Allgemeines). „Facebook Login for Business“ → Konfiguration mit den Seiten-Berechtigungen anlegen und deren Konfigurations-ID eintragen. Damit Posts öffentlich sind, muss die App auf „Live“ stehen." },
  threads: { label: "Threads (Meta)", portal: "https://developers.facebook.com/apps", hint: "Meta-App mit Anwendungsfall „Threads-API“: Threads-App-ID und -Geheimschlüssel; dich als Threads-Tester eintragen und in Threads bestätigen." },
  google: { label: "YouTube (Google)", portal: "https://console.cloud.google.com/apis/credentials", hint: "Google-Cloud-Projekt → YouTube Data API v3 aktivieren → OAuth-Client (Webanwendung). Zustimmungsbildschirm auf „In Produktion“ stellen, sonst läuft die Anmeldung nach 7 Tagen ab." },
  tiktok: { label: "TikTok", portal: "https://developers.tiktok.com/apps", hint: "Nur nötig, wenn TikTok nicht über Zernio verbunden ist (empfohlen, siehe unten beim TikTok-Konto). Eigene TikTok-App mit Login Kit und Content Posting API: Videos landen als Entwurf in deiner TikTok-App – direktes Posten gibt TikTok internen Werkzeugen nicht frei." },
  linkedin: { label: "LinkedIn", portal: "https://www.linkedin.com/developers/apps", hint: "LinkedIn-App mit „Share on LinkedIn“ und „Sign In with LinkedIn using OpenID Connect“. Postet auf dein Profil; die Anmeldung gilt 60 Tage." },
  pinterest: { label: "Pinterest", portal: "https://developers.pinterest.com/apps", hint: "Pinterest-App (Business-Konto). Mit „Trial access“ sind Pins nur für dich sichtbar – für öffentliche Pins „Standard access“ beantragen." },
  bluesky: { label: "Bluesky", portal: "https://bsky.app/settings/app-passwords", hint: "Kein Entwickler-Zugang nötig: in Bluesky unter Einstellungen → App-Passwörter ein App-Passwort anlegen und beim Verbinden eingeben." },
};

module.exports = function (D) {
  D = D || {};
  const B = Object.assign({}, DEF, D.base || {});
  const pubErr = (msg, extra) => { const e = new Error(msg); Object.assign(e, extra || {}); return e; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitMs = D.waitMs || 5000;

  async function req(method, url, o) {
    o = o || {};
    const headers = Object.assign({}, o.headers || {});
    let body = o.body;
    if (o.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(o.json); }
    else if (o.form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(o.form).toString(); }
    if (o.token) headers.Authorization = "Bearer " + o.token;
    let r;
    try { r = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(o.timeout || 60000), redirect: "follow" }); }
    catch (e) { throw pubErr("Keine Verbindung zu " + new URL(url).host + (e && e.name === "TimeoutError" ? " (Zeitüberschreitung)" : "")); }
    const txt = o.raw ? "" : await r.text();
    let j = null; try { j = txt ? JSON.parse(txt) : {}; } catch (e) { j = { _text: txt.slice(0, 300) }; }
    if (!r.ok && !o.okStatus) {
      const m = j && ((j.error && (j.error.error_user_msg || j.error.message || j.error.description || (typeof j.error === "string" ? j.error : ""))) || j.error_description || j.message || j.error_message || (j.error && j.error.code) || j._text);
      const auth = r.status === 401 || /OAuth|token|expired|invalid_grant|session/i.test(String(m || ""));
      throw pubErr((auth ? "Anmeldung abgelaufen oder ungültig – bitte neu verbinden. " : "") + new URL(url).host + " meldet " + r.status + (m ? ": " + String(m).slice(0, 220) : ""), { status: r.status, auth });
    }
    return o.withHeaders ? { j, headers: r.headers, status: r.status } : o.withText ? { j, txt } : j;
  }
  const q = o => "?" + new URLSearchParams(o).toString();

  // ───────────── Anmeldung (OAuth) ─────────────
  function authUrl(provider, c) {   // c: { clientId, redirect, state }
    const st = c.state, rd = c.redirect;
    switch (provider) {
      case "instagram": return B.igAuth + q({ client_id: c.clientId, redirect_uri: rd, response_type: "code", scope: "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages,instagram_business_manage_insights", state: st, enable_fb_login: "0", force_authentication: "1" });
      // Facebook Login for Business: Berechtigungen stehen in der Konfiguration (config_id), sonst klassisch per scope
      case "facebook": return B.fbAuth + q(c.configId ? { client_id: c.clientId, redirect_uri: rd, state: st, response_type: "code", config_id: c.configId, override_default_response_type: "true" }
        : { client_id: c.clientId, redirect_uri: rd, state: st, response_type: "code", scope: "pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement,pages_read_user_content,pages_messaging,read_insights" });
      case "threads": return B.thAuth + q({ client_id: c.clientId, redirect_uri: rd, scope: "threads_basic,threads_content_publish,threads_read_replies,threads_manage_replies,threads_manage_insights", response_type: "code", state: st });
      case "linkedin": return B.liAuth + q({ response_type: "code", client_id: c.clientId, redirect_uri: rd, scope: "openid profile w_member_social", state: st });
      case "google": return B.gAuth + q({ client_id: c.clientId, redirect_uri: rd, response_type: "code", scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl", access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: st });
      case "tiktok": return B.ttAuth + q({ client_key: c.clientId, scope: "user.info.basic,video.upload,video.publish", response_type: "code", redirect_uri: rd, state: st });
      case "pinterest": return B.pinAuth + q({ client_id: c.clientId, redirect_uri: rd, response_type: "code", scope: "boards:read,pins:read,pins:write,user_accounts:read", state: st });
    }
    throw pubErr("Unbekannter Anbieter");
  }
  const inSec = s => s ? new Date(Date.now() + (+s) * 1000).toISOString() : "";
  // Code → Zugang + Konten zur Auswahl: [{ platform, account:{id,name,handle}, tok:{access, refresh, expiresAt, ...} }]
  async function exchange(provider, c, code) {
    if (provider === "instagram") {
      const a = await req("POST", B.igToken, { form: { client_id: c.clientId, client_secret: c.secret, grant_type: "authorization_code", redirect_uri: c.redirect, code } });
      const short = a.access_token || (a.data && a.data[0] && a.data[0].access_token);
      const l = await req("GET", B.ig + "/access_token" + q({ grant_type: "ig_exchange_token", client_secret: c.secret, access_token: short }));
      const me = await req("GET", B.ig + "/" + GV + "/me" + q({ fields: "user_id,username,name", access_token: l.access_token }));
      return [{ platform: "instagram", account: { id: String(me.user_id || me.id), name: me.name || me.username, handle: me.username ? "@" + me.username : "" }, tok: { access: l.access_token, expiresAt: inSec(l.expires_in || 5184000) } }];
    }
    if (provider === "facebook") {
      const s = await req("GET", B.fb + "/" + GV + "/oauth/access_token" + q({ client_id: c.clientId, client_secret: c.secret, redirect_uri: c.redirect, code }));
      const l = await req("GET", B.fb + "/" + GV + "/oauth/access_token" + q({ grant_type: "fb_exchange_token", client_id: c.clientId, client_secret: c.secret, fb_exchange_token: s.access_token }));
      const pages = await req("GET", B.fb + "/" + GV + "/me/accounts" + q({ fields: "id,name,access_token,username", limit: "100", access_token: l.access_token }));
      const list = (pages.data || []).filter(p => p.access_token);
      // Seiten aus einem Business-Portfolio fehlen in /me/accounts – die bei der Anmeldung ausgewählten Seiten stehen in den granularen Berechtigungen
      try {
        const dbg = await req("GET", B.fb + "/" + GV + "/debug_token" + q({ input_token: l.access_token, access_token: c.clientId + "|" + c.secret }));
        const ids = [...new Set(((dbg.data && dbg.data.granular_scopes) || []).filter(g => /^pages_/.test(g.scope)).flatMap(g => g.target_ids || []))].filter(id => !list.some(p => String(p.id) === String(id)));
        for (const id of ids.slice(0, 50)) { try { const pg = await req("GET", B.fb + "/" + GV + "/" + id + q({ fields: "id,name,access_token,username", access_token: l.access_token })); if (pg.access_token) list.push(pg); } catch (e) {} }
      } catch (e) {}
      if (!list.length) throw pubErr("Keine Facebook-Seite gefunden – du musst Admin einer Seite sein und sie beim Anmelden freigeben.");
      return list.map(p => ({ platform: "facebook", account: { id: String(p.id), name: p.name, handle: p.username ? "@" + p.username : "" }, tok: { access: p.access_token, expiresAt: "" } }));
    }
    if (provider === "threads") {
      const a = await req("POST", B.th + "/oauth/access_token", { form: { client_id: c.clientId, client_secret: c.secret, grant_type: "authorization_code", redirect_uri: c.redirect, code } });
      const l = await req("GET", B.th + "/access_token" + q({ grant_type: "th_exchange_token", client_secret: c.secret, access_token: a.access_token }));
      const me = await req("GET", B.th + "/v1.0/me" + q({ fields: "id,username,name", access_token: l.access_token }));
      return [{ platform: "threads", account: { id: String(me.id || a.user_id), name: me.name || me.username, handle: me.username ? "@" + me.username : "" }, tok: { access: l.access_token, expiresAt: inSec(l.expires_in || 5184000) } }];
    }
    if (provider === "linkedin") {
      const a = await req("POST", B.liToken, { form: { grant_type: "authorization_code", code, redirect_uri: c.redirect, client_id: c.clientId, client_secret: c.secret } });
      const me = await req("GET", B.li + "/v2/userinfo", { token: a.access_token });
      return [{ platform: "linkedin", account: { id: "urn:li:person:" + me.sub, name: me.name || [me.given_name, me.family_name].filter(Boolean).join(" "), handle: "" }, tok: { access: a.access_token, refresh: a.refresh_token || "", expiresAt: inSec(a.expires_in || 5184000) } }];
    }
    if (provider === "google") {
      const a = await req("POST", B.gToken, { form: { code, client_id: c.clientId, client_secret: c.secret, redirect_uri: c.redirect, grant_type: "authorization_code" } });
      if (!a.refresh_token) throw pubErr("Google hat keinen dauerhaften Zugang geliefert – bitte die App unter myaccount.google.com/permissions entfernen und neu verbinden.");
      const ch = await req("GET", B.yt + "/youtube/v3/channels" + q({ part: "snippet", mine: "true" }), { token: a.access_token });
      const it = (ch.items || [])[0]; if (!it) throw pubErr("Kein YouTube-Kanal zu diesem Google-Konto gefunden.");
      return [{ platform: "youtube", account: { id: it.id, name: it.snippet && it.snippet.title, handle: it.snippet && it.snippet.customUrl || "" }, tok: { access: a.access_token, refresh: a.refresh_token, expiresAt: inSec(a.expires_in || 3600) } }];
    }
    if (provider === "tiktok") {
      const a = await req("POST", B.tt + "/v2/oauth/token/", { form: { client_key: c.clientId, client_secret: c.secret, code, grant_type: "authorization_code", redirect_uri: c.redirect } });
      if (a.error && a.error !== "ok") throw pubErr("TikTok: " + (a.error_description || a.error));
      let name = ""; try { const u = await req("GET", B.tt + "/v2/user/info/" + q({ fields: "open_id,display_name" }), { token: a.access_token }); name = u.data && u.data.user && u.data.user.display_name || ""; } catch (e) {}
      return [{ platform: "tiktok", account: { id: a.open_id, name: name || "TikTok", handle: "" }, tok: { access: a.access_token, refresh: a.refresh_token, scope: a.scope || "", expiresAt: inSec(a.expires_in || 86400), refreshExpiresAt: inSec(a.refresh_expires_in || 31536000) } }];
    }
    if (provider === "pinterest") {
      const a = await req("POST", B.pin + "/v5/oauth/token", { form: { grant_type: "authorization_code", code, redirect_uri: c.redirect, continuous_refresh: "true" }, headers: { Authorization: "Basic " + Buffer.from(c.clientId + ":" + c.secret).toString("base64") } });
      const me = await req("GET", B.pin + "/v5/user_account", { token: a.access_token });
      const boards = await req("GET", B.pin + "/v5/boards" + q({ page_size: "100" }), { token: a.access_token });
      const list = boards.items || []; if (!list.length) throw pubErr("Keine Pinnwand gefunden – bitte zuerst in Pinterest eine Pinnwand anlegen.");
      return list.map(b => ({ platform: "pinterest", account: { id: b.id, name: (me.username ? "@" + me.username + " · " : "") + b.name, handle: me.username ? "@" + me.username : "" }, tok: { access: a.access_token, refresh: a.refresh_token, expiresAt: inSec(a.expires_in || 2592000) } }));
    }
    throw pubErr("Unbekannter Anbieter");
  }
  async function bskyLogin(handle, appPassword) {
    const s = await req("POST", B.bsky + "/xrpc/com.atproto.server.createSession", { json: { identifier: String(handle).replace(/^@/, ""), password: appPassword } });
    return { platform: "bluesky", account: { id: s.did, name: s.handle, handle: "@" + s.handle }, tok: { access: s.accessJwt, refresh: s.refreshJwt, pass: appPassword, handle: s.handle, expiresAt: inSec(3600) } };
  }
  // TikTok über Zernio: Schlüssel prüfen und die dort verbundenen TikTok-Konten holen (das TikTok-Konto verbindet Simon bei Zernio selbst)
  async function zreq(method, pth, tok, o) {
    o = o || {};
    const r = await req(method, B.zn + pth, Object.assign({ token: tok.key, okStatus: true, withHeaders: true, timeout: o.timeout || 30000 }, o.json !== undefined ? { json: o.json } : {})), j = r.j || {};
    if (r.status >= 400 && (o.ok || []).indexOf(r.status) < 0) {
      const m = typeof j.error === "string" ? j.error : (j.error && j.error.message) || j.message || j._text || "";
      throw pubErr("TikTok (Zernio): " + (r.status === 401 ? "API-Schlüssel ungültig – bitte neu verbinden." : String(m || "Fehler " + r.status).slice(0, 240)), { status: r.status, auth: r.status === 401 });
    }
    return { j, status: r.status };
  }
  async function zernioLogin(key) {
    key = String(key || "").trim(); if (!key) throw pubErr("Zernio: Bitte den API-Schlüssel eintragen.");
    const { j } = await zreq("GET", "/v1/accounts" + q({ platform: "tiktok" }), { key });
    const acc = (j.accounts || []).filter(a => a && a.platform === "tiktok" && a.isActive !== false);
    if (!acc.length) throw pubErr("Zernio: Dort ist noch kein TikTok-Konto verbunden – in Zernio zuerst TikTok verbinden, dann hier nochmal.");
    return acc.map(a => { const h = String(a.username || "").replace(/^@/, "");
      return { platform: "tiktok", account: { id: String(a._id), name: a.displayName || h || "TikTok", handle: h ? "@" + h : "" }, tok: { via: "zernio", key, account: String(a._id), handle: h, scope: "video.publish", expiresAt: "" } }; });
  }
  // Zugang auffrischen (vor dem Posten bzw. täglich). Liefert neue tok oder null (unverändert).
  async function refresh(platform, tok, c) {
    if (tok && tok.via === "zernio") return null;   // API-Schlüssel läuft nicht ab
    const left = tok.expiresAt ? Date.parse(tok.expiresAt) - Date.now() : Infinity;
    if (platform === "instagram" && left < 20 * 864e5) { const r = await req("GET", B.ig + "/refresh_access_token" + q({ grant_type: "ig_refresh_token", access_token: tok.access })); return Object.assign({}, tok, { access: r.access_token, expiresAt: inSec(r.expires_in || 5184000) }); }
    if (platform === "threads" && left < 20 * 864e5) { const r = await req("GET", B.th + "/refresh_access_token" + q({ grant_type: "th_refresh_token", access_token: tok.access })); return Object.assign({}, tok, { access: r.access_token, expiresAt: inSec(r.expires_in || 5184000) }); }
    if (platform === "youtube" && left < 5 * 60e3) { const r = await req("POST", B.gToken, { form: { client_id: c.clientId, client_secret: c.secret, refresh_token: tok.refresh, grant_type: "refresh_token" } }); return Object.assign({}, tok, { access: r.access_token, expiresAt: inSec(r.expires_in || 3600) }); }
    if (platform === "tiktok" && left < 30 * 60e3) { const r = await req("POST", B.tt + "/v2/oauth/token/", { form: { client_key: c.clientId, client_secret: c.secret, grant_type: "refresh_token", refresh_token: tok.refresh } }); if (r.error && r.error !== "ok") throw pubErr("TikTok: " + (r.error_description || r.error), { auth: true }); return Object.assign({}, tok, { access: r.access_token, refresh: r.refresh_token || tok.refresh, scope: r.scope || tok.scope || "", expiresAt: inSec(r.expires_in || 86400) }); }
    if (platform === "pinterest" && left < 3 * 864e5 && tok.refresh) { const r = await req("POST", B.pin + "/v5/oauth/token", { form: { grant_type: "refresh_token", refresh_token: tok.refresh, continuous_refresh: "true" }, headers: { Authorization: "Basic " + Buffer.from(c.clientId + ":" + c.secret).toString("base64") } }); return Object.assign({}, tok, { access: r.access_token, refresh: r.refresh_token || tok.refresh, expiresAt: inSec(r.expires_in || 2592000) }); }
    if (platform === "bluesky" && left < 5 * 60e3) {
      try { const r = await req("POST", B.bsky + "/xrpc/com.atproto.server.refreshSession", { token: tok.refresh }); return Object.assign({}, tok, { access: r.accessJwt, refresh: r.refreshJwt, expiresAt: inSec(3600) }); }
      catch (e) { if (!tok.pass) throw e; const n = await bskyLogin(tok.handle, tok.pass); return n.tok; }
    }
    if (platform === "linkedin" && left < 0) throw pubErr("LinkedIn-Anmeldung ist abgelaufen (gilt 60 Tage) – bitte neu verbinden.", { auth: true });
    return null;
  }

  // ───────────── Posten ─────────────
  // m: { format, caption, title, link, alt, images:[{url,file}], video:{url,file,size}, cover:{url,file} }
  async function igWait(base, id, token, what, ver) {
    for (let i = 0; i < (D.pollMax || 72); i++) {
      const s = await req("GET", base + "/" + (ver || GV) + "/" + id + q({ fields: what === "Threads" ? "status,error_message" : "status_code,status", access_token: token }));
      const st = s.status_code || s.status || "";
      if (/FINISHED|PUBLISHED/i.test(st)) return; if (/ERROR|EXPIRED/i.test(st)) throw pubErr((what || "Instagram") + " konnte die Datei nicht verarbeiten (" + (s.status || st) + ").");
      await sleep(waitMs);
    }
    throw pubErr((what || "Instagram") + " braucht zu lange für die Verarbeitung.");
  }
  // Instagram voll ausgefüllt: Caption + Hashtags, Standort, Alt-Text (Bilder), Titelbild + Tonspur-Name (Reels), erster Kommentar.
  // Lehnt Instagram die Extras ab (z. B. mehr als 5 Hashtags, unbekannter Ort), zweiter Versuch schlicht – der Post geht nicht verloren.
  async function instagram(ch, tok, m) {
    const ig = ch.account.id, t = tok.access, base = B.ig, P = (path, form) => { const f = { access_token: t }; Object.keys(form).forEach(k => { if (form[k] !== "" && form[k] != null) f[k] = form[k]; }); return req("POST", base + "/" + GV + "/" + path, { form: f }); };
    const build = async full => {
      const loc = full && m.place ? m.place.id : "", alt = full ? String(m.alt || "").slice(0, 1000) : "", cap = full ? m.caption : (m.captionSafe || m.caption);
      // markierte Personen (auf dem Bild verteilt, beim Reel ohne Position) und Collab-Partner (gemeinsamer Beitrag, max. 3 – die Partner bestätigen in Instagram)
      const tags = full ? (m.tags || []).slice(0, 20) : [], col = full && m.collabs && m.collabs.length ? JSON.stringify(m.collabs.slice(0, 3)) : "";
      const ut = withPos => tags.length ? JSON.stringify(tags.map((u, i) => withPos ? { username: u, x: Math.round((0.2 + 0.6 * ((i % 4) / 3 || 0)) * 100) / 100, y: Math.round((0.75 - 0.12 * Math.floor(i / 4)) * 100) / 100 } : { username: u })) : "";
      const o = m.opts || {};
      if (m.format === "reel") { const c = (await P(ig + "/media", { media_type: "REELS", video_url: m.video.url, caption: cap, share_to_feed: o.igShareToFeed === false ? "false" : "true",
        cover_url: m.cover && !(o.igThumbOffset > 0) ? m.cover.url : "", thumb_offset: o.igThumbOffset > 0 ? String(Math.round(o.igThumbOffset)) : "", location_id: loc,
        audio_name: full ? String(o.igAudioName || m.audioName || "").slice(0, 80) : "", user_tags: ut(false), collaborators: col,
        trial_params: full && o.igTrial ? JSON.stringify({ graduation_strategy: "SS_PERFORMANCE" }) : "" })).id; await igWait(base, c, t, "Instagram"); return c; }
      if (m.images.length > 1) {
        const kids = []; let first = true; for (const im of m.images.slice(0, 20)) { kids.push((await P(ig + "/media", { image_url: im.url, is_carousel_item: "true", alt_text: alt, user_tags: first ? ut(true) : "" })).id); first = false; }
        for (const k of kids) await igWait(base, k, t, "Instagram");
        const c = (await P(ig + "/media", { media_type: "CAROUSEL", children: kids.join(","), caption: cap, location_id: loc, collaborators: col })).id; await igWait(base, c, t, "Instagram"); return c;
      }
      const c = (await P(ig + "/media", { image_url: m.images[0].url, caption: cap, location_id: loc, alt_text: alt, user_tags: ut(true), collaborators: col })).id; await igWait(base, c, t, "Instagram"); return c;
    };
    let creation, note = "";
    try { creation = await build(true); }
    catch (e) { if (e.auth || !(e.status >= 400 && e.status < 500)) throw e; creation = await build(false); note = "Instagram hat die Extras abgelehnt – schlicht gepostet (5 Hashtags, ohne Standort/Alt-Text" + ((m.tags || []).length || (m.collabs || []).length ? ", ohne Markierungen/Collab – Benutzernamen prüfen" : "") + ")."; }
    const pub = await P(ig + "/media_publish", { creation_id: creation });
    let url = ""; try { url = (await req("GET", base + "/" + GV + "/" + pub.id + q({ fields: "permalink", access_token: t }))).permalink || ""; } catch (e) {}
    if (m.firstComment) { try { await P(pub.id + "/comments", { message: m.firstComment }); } catch (e) { note = (note ? note + " " : "") + "Erster Kommentar ging nicht (" + String(e.message || "").slice(0, 80) + ")."; } }
    const o = m.opts || {};
    if (o.igCommentsOff) { try { await P(pub.id, { comment_enabled: "false" }); } catch (e) { note = (note ? note + " " : "") + "Kommentare abschalten ging nicht."; } }
    if (o.igStory) {   // zusätzlich als Story (Bild: erstes Bild, Reel: Video)
      try { const sc = (await P(ig + "/media", m.format === "reel" ? { media_type: "STORIES", video_url: m.video.url } : { media_type: "STORIES", image_url: (m.story || m.images[0]).url })).id; await igWait(base, sc, t, "Instagram"); await P(ig + "/media_publish", { creation_id: sc }); note = (note ? note + " " : "") + "Auch als Story geteilt."; }
      catch (e) { note = (note ? note + " " : "") + "Story ging nicht (" + String(e.message || "").slice(0, 80) + ")."; } }
    return { id: pub.id, url, note };
  }
  // Facebook-Story der Seite (Bild: unveröffentlichtes Foto → photo_stories, Video: video_stories wie Reels)
  async function fbStory(pg, t, base, m) {
    if (m.format === "reel") {
      const st = await req("POST", base + "/" + pg + "/video_stories", { form: { upload_phase: "start", access_token: t } });
      await req("POST", B.fbUpload + "/video-upload/" + GV + "/" + st.video_id, { headers: { Authorization: "OAuth " + t, file_url: m.video.url } });
      await req("POST", base + "/" + pg + "/video_stories", { form: { upload_phase: "finish", video_id: st.video_id, access_token: t } }); return;
    }
    const ph = await req("POST", base + "/" + pg + "/photos", { form: { url: (m.story || m.images[0]).url, published: "false", access_token: t } });
    await req("POST", base + "/" + pg + "/photo_stories", { form: { photo_id: ph.id, access_token: t } });
  }
  async function facebook(ch, tok, m) {
    const r = await facebook0(ch, tok, m);
    if (m.opts && m.opts.fbStory) { try { await fbStory(ch.account.id, tok.access, B.fb + "/" + GV, m); r.note = (r.note ? r.note + " " : "") + "Auch als Story geteilt."; } catch (e) { r.note = (r.note ? r.note + " " : "") + "Story ging nicht (" + String(e.message || "").slice(0, 80) + ")."; } }
    return r;
  }
  async function facebook0(ch, tok, m) {
    const pg = ch.account.id, t = tok.access, base = B.fb + "/" + GV;
    const link = async id => { try { return (await req("GET", base + "/" + id + q({ fields: "permalink_url", access_token: t }))).permalink_url || ""; } catch (e) { return ""; } };
    const fbComment = async id => { if (!m.firstComment) return {}; try { await req("POST", base + "/" + id + "/comments", { form: { message: m.firstComment, access_token: t } }); return {}; } catch (e) { return { note: "Erster Kommentar ging nicht – Facebook-Konto bitte einmal neu verbinden." }; } };
    if (m.format === "reel") {
      const st = await req("POST", base + "/" + pg + "/video_reels", { form: { upload_phase: "start", access_token: t } });
      await req("POST", B.fbUpload + "/video-upload/" + GV + "/" + st.video_id, { headers: { Authorization: "OAuth " + t, file_url: m.video.url } });
      for (let i = 0; i < (D.pollMax || 72); i++) { const s = await req("GET", base + "/" + st.video_id + q({ fields: "status", access_token: t })); const up = s.status && (s.status.uploading_phase || {}).status; if (up === "complete" || (s.status && s.status.video_status === "ready")) break; if (s.status && s.status.video_status === "error") throw pubErr("Facebook konnte das Video nicht verarbeiten."); await sleep(waitMs); }
      await req("POST", base + "/" + pg + "/video_reels", { form: { upload_phase: "finish", video_id: st.video_id, video_state: "PUBLISHED", description: m.caption, access_token: t } });
      return Object.assign({ id: st.video_id, url: (await link(st.video_id)) || "https://www.facebook.com/reel/" + st.video_id }, await fbComment(st.video_id));
    }
    if (m.images.length > 1) {
      const ids = []; for (const im of m.images.slice(0, 10)) ids.push((await req("POST", base + "/" + pg + "/photos", { form: Object.assign({ url: im.url, published: "false", access_token: t }, m.alt ? { alt_text_custom: String(m.alt).slice(0, 1000) } : {}) })).id);
      const form = Object.assign({ message: m.caption, access_token: t }, m.place ? { place: m.place.id } : {}); ids.forEach((id, i) => { form["attached_media[" + i + "]"] = JSON.stringify({ media_fbid: id }); });
      let p; try { p = await req("POST", base + "/" + pg + "/feed", { form }); } catch (e) { if (!form.place || e.auth) throw e; delete form.place; p = await req("POST", base + "/" + pg + "/feed", { form }); }
      return Object.assign({ id: p.id, url: (await link(p.id)) || "https://www.facebook.com/" + p.id }, await fbComment(p.id));
    }
    const form = Object.assign({ url: m.images[0].url, caption: m.caption, access_token: t }, m.place ? { place: m.place.id } : {}, m.alt ? { alt_text_custom: String(m.alt).slice(0, 1000) } : {});
    let p; try { p = await req("POST", base + "/" + pg + "/photos", { form }); } catch (e) { if (e.auth || (!form.place && !form.alt_text_custom)) throw e; delete form.place; delete form.alt_text_custom; p = await req("POST", base + "/" + pg + "/photos", { form }); }
    const pid = p.post_id || p.id; return Object.assign({ id: pid, url: (await link(pid)) || "https://www.facebook.com/" + pid }, await fbComment(pid));
  }
  async function threads(ch, tok, m) {
    const o = m.opts || {}, ex = Object.assign({}, /^(everyone|accounts_you_follow|mentioned_only|parent_post_author_only|followers_only)$/.test(o.thReplyControl || "") ? { reply_control: o.thReplyControl } : {}, o.thTopic ? { topic_tag: String(o.thTopic).replace(/^#/, "").slice(0, 50) } : {});
    const uid = ch.account.id, t = tok.access, base = B.th + "/v1.0", P = (form) => req("POST", base + "/" + uid + "/threads", { form: Object.assign({ access_token: t }, form.is_carousel_item ? {} : ex, form) });
    let cr;
    if (m.format === "reel") cr = (await P({ media_type: "VIDEO", video_url: m.video.url, text: m.caption })).id;
    else if (m.images.length > 1) { const kids = []; for (const im of m.images.slice(0, 20)) kids.push((await P(Object.assign({ media_type: "IMAGE", image_url: im.url, is_carousel_item: "true" }, m.alt ? { alt_text: String(m.alt).slice(0, 1000) } : {}))).id); for (const k of kids) await igWait(B.th, k, t, "Threads", "v1.0"); cr = (await P({ media_type: "CAROUSEL", children: kids.join(","), text: m.caption })).id; }
    else cr = (await P(Object.assign({ media_type: "IMAGE", image_url: m.images[0].url, text: m.caption }, m.alt ? { alt_text: String(m.alt).slice(0, 1000) } : {}))).id;
    await igWait(B.th, cr, t, "Threads", "v1.0");
    const pub = await req("POST", base + "/" + uid + "/threads_publish", { form: { creation_id: cr, access_token: t } });
    let url = ""; try { url = (await req("GET", base + "/" + pub.id + q({ fields: "permalink", access_token: t }))).permalink || ""; } catch (e) {}
    return { id: pub.id, url };
  }
  const LIH = { "LinkedIn-Version": "202610", "X-Restli-Protocol-Version": "2.0.0" };
  // LinkedIn-„little text“: reservierte Zeichen mit Backslash, außer #Hashtags
  function liText(s) { return String(s || "").replace(/[\\|{}@\[\]()<>*_~]/g, c => "\\" + c).replace(/#(?![\wäöüÄÖÜß])/g, "\\#"); }
  async function linkedin(ch, tok, m) {
    const owner = ch.account.id, t = tok.access, H = Object.assign({}, LIH);
    const putFile = async (url, buf) => { const r = await fetch(url, { method: "PUT", headers: { Authorization: "Bearer " + t, "Content-Type": "application/octet-stream" }, body: buf, signal: AbortSignal.timeout(120000) }); if (!r.ok) throw pubErr("LinkedIn: Hochladen fehlgeschlagen (" + r.status + ")"); return r.headers.get("etag") || ""; };
    let content;
    if (m.format === "reel") {
      const size = fs.statSync(m.video.file).size;
      const init = await req("POST", B.li + "/rest/videos?action=initializeUpload", { token: t, headers: H, json: { initializeUploadRequest: { owner, fileSizeBytes: size, uploadCaptions: false, uploadThumbnail: false } } });
      const v = init.value, fd = fs.openSync(m.video.file, "r"), ids = [];
      try { for (const ins of v.uploadInstructions) { const len = ins.lastByte - ins.firstByte + 1, buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, ins.firstByte); ids.push(await putFile(ins.uploadUrl, buf)); } } finally { fs.closeSync(fd); }
      await req("POST", B.li + "/rest/videos?action=finalizeUpload", { token: t, headers: H, json: { finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken || "", uploadedPartIds: ids } } });
      for (let i = 0; i < (D.pollMax || 72); i++) { const s = await req("GET", B.li + "/rest/videos/" + encodeURIComponent(v.video), { token: t, headers: H }); if (s.status === "AVAILABLE") break; if (s.status === "PROCESSING_FAILED") throw pubErr("LinkedIn konnte das Video nicht verarbeiten."); await sleep(waitMs); }
      content = { media: { id: v.video, title: m.title || "" } };
    } else {
      const ims = [];
      for (const im of m.images.slice(0, 20)) { const init = await req("POST", B.li + "/rest/images?action=initializeUpload", { token: t, headers: H, json: { initializeUploadRequest: { owner } } }); await putFile(init.value.uploadUrl, fs.readFileSync(im.file)); ims.push(init.value.image); }
      content = ims.length > 1 ? { multiImage: { images: ims.map(id => ({ id, altText: m.alt || "" })) } } : { media: { id: ims[0], altText: m.alt || "" } };
    }
    const r = await req("POST", B.li + "/rest/posts", { token: t, headers: H, withHeaders: true, json: { author: owner, commentary: liText(m.caption), visibility: (m.opts || {}).liVisibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, content, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: !!(m.opts || {}).liNoReshare } });
    const urn = r.headers.get("x-restli-id") || (r.j && r.j.id) || "";
    return { id: urn, url: urn ? "https://www.linkedin.com/feed/update/" + urn + "/" : "" };
  }
  async function youtube(ch, tok, m) {
    const size = fs.statSync(m.video.file).size;
    const tags = (m.tags || []).map(s => s.replace(/^#/, "")).slice(0, 15);
    const meta = { snippet: { title: String(m.title || m.caption).slice(0, 100), description: String(m.caption).slice(0, 4900), tags, categoryId: m.ytCategory || "22", defaultLanguage: "de", defaultAudioLanguage: "zxx" }, status: { privacyStatus: /^(public|unlisted|private)$/.test((m.opts || {}).ytPrivacy || "") ? m.opts.ytPrivacy : "public", selfDeclaredMadeForKids: !!(m.opts || {}).ytKids, containsSyntheticMedia: !!(m.opts || {}).ytAi } };
    const init = await req("POST", B.ytUpload + "/youtube/v3/videos?uploadType=resumable&part=snippet,status", { token: tok.access, json: meta, withHeaders: true, headers: { "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(size) } });
    const loc = init.headers.get("location"); if (!loc) throw pubErr("YouTube hat keine Upload-Adresse geliefert.");
    const r = await fetch(loc, { method: "PUT", headers: { Authorization: "Bearer " + tok.access, "Content-Type": "video/mp4", "Content-Length": String(size) }, body: fs.readFileSync(m.video.file), signal: AbortSignal.timeout(600000) });
    const j = await r.json().catch(() => ({})); if (!r.ok || !j.id) throw pubErr("YouTube: Hochladen fehlgeschlagen (" + r.status + (j.error && j.error.message ? ": " + j.error.message : "") + ")", { auth: r.status === 401 });
    return { id: j.id, url: "https://www.youtube.com/shorts/" + j.id };
  }
  // TikTok-Stücke: bis 64 MB als Ganzes (unter 5 MB Pflicht), darüber 10-MB-Stücke, der Rest hängt am letzten Stück (Media Transfer Guide)
  function ttChunks(size) { const MB = 1024 * 1024, chunk = size <= 64 * MB ? size : 10 * MB; return { chunk, n: Math.max(1, Math.floor(size / chunk)) }; }
  const TT_MSG = { spam_risk_too_many_posts: "Für heute sind auf diesem Konto zu viele Posts – später nochmal.", spam_risk_user_banned_from_posting: "Dieses Konto darf gerade nicht posten.",
    reached_active_user_cap: "Die App hat ihr Tageslimit bei TikTok erreicht – später nochmal.",
    spam_risk_too_many_pending_share: "In deiner TikTok-App warten schon 5 Entwürfe aus dem Cockpit (Posteingang → System-Benachrichtigungen) – erst diese posten oder löschen, dann „nochmal“.", unaudited_client_can_only_post_to_private_accounts: "Die App ist von TikTok noch nicht geprüft – bis dahin gehen nur private Posts.",
    privacy_level_option_mismatch: "Die gewählte Sichtbarkeit gibt es für dieses Konto nicht – im Planer neu wählen.", scope_not_authorized: "Direktes Posten ist nicht freigegeben – TikTok neu verbinden.",
    access_token_invalid: "Anmeldung abgelaufen – TikTok neu verbinden." };
  const ttMsg = er => "TikTok: " + (TT_MSG[er.code] || er.message || er.code);
  const ttAuthErr = code => /token|scope/i.test(String(code || ""));
  // Konto-Angaben fürs direkte Posten: Spitzname, erlaubte Sichtbarkeiten, ausgeschaltete Interaktionen, Höchstlänge – laut TikTok vor jedem Posten frisch holen
  async function tiktokCreator(tok) {
    if (tok.via === "zernio") {
      const { j } = await zreq("GET", "/v1/accounts/" + encodeURIComponent(tok.account) + "/tiktok/creator-info" + q({ mediaType: "video" }), tok, { timeout: 15000 });
      const cr = j.creator || {}, lim = j.postingLimits || {}, is = lim.interactionSettings || {}, off = k => !!(is[k] && is[k].enabled === false);
      return { nickname: cr.nickname || "", username: tok.handle || "", avatar: cr.avatarUrl || "", privacy: (j.privacyLevels || []).map(x => x && x.value).filter(Boolean),
        commentOff: off("allow_comment"), duetOff: off("allow_duet"), stitchOff: off("allow_stitch"), maxSec: +lim.maxVideoDurationSec || 0 };
    }
    const r = await req("POST", B.tt + "/v2/post/publish/creator_info/query/", { token: tok.access, json: {}, okStatus: true }), er = r && r.error;
    if (er && er.code && er.code !== "ok") throw pubErr(ttMsg(er), { auth: ttAuthErr(er.code) });
    const d = r.data || {};
    return { nickname: d.creator_nickname || "", username: d.creator_username || "", avatar: d.creator_avatar_url || "", privacy: Array.isArray(d.privacy_level_options) ? d.privacy_level_options : [],
      commentOff: !!d.comment_disabled, duetOff: !!d.duet_disabled, stitchOff: !!d.stitch_disabled, maxSec: +d.max_video_post_duration_sec || 0 };
  }
  // Direkt aufs Profil (Direct Post, Scope video.publish), sobald im Planer die Sichtbarkeit gewählt ist (opts.ttPrivacy, TikTok verlangt die Wahl ohne Vorgabe).
  // Ohne Wahl oder ohne Freigabe: als Entwurf in die TikTok-App. Ungeprüfte App: TikTok nimmt nur Posts auf private Konten an („Nur ich“) –
  // erst privat versuchen, bei öffentlichem Konto dann als Entwurf (audit: "private" bzw. "draft" → Hinweis im Cockpit).
  // Über Zernio: dieselbe Wahl aus dem TikTok-Fenster (Sichtbarkeit ohne Vorgabe, Kommentare/Duett/Stitch, Werbekennzeichnung), Text samt Hashtags,
  // Video holt Zernio über die öffentliche Adresse. Zernio lehnt denselben Inhalt binnen 24 h ab (409) – dann gilt der schon angelegte Post (kein Doppelpost bei „nochmal“).
  async function zernioTiktok(ch, tok, m) {
    const o = m.opts || {}, privacy = o.ttPrivacy;
    if (!privacy) throw pubErr("TikTok: Bitte im Planer wählen, wer das Video sehen darf (Bearbeiten → Mehr Optionen → TikTok), dann „nochmal“.");
    if (!m.video || !m.video.url) throw pubErr("TikTok: Video fehlt.");
    const ci = await tiktokCreator(tok);
    if (ci.maxSec && m.duration > ci.maxSec) throw pubErr("TikTok: Das Video ist " + Math.round(m.duration) + " s lang, dieses Konto darf höchstens " + ci.maxSec + " s posten.");
    if (ci.privacy.length && ci.privacy.indexOf(privacy) < 0) throw pubErr(ttMsg({ code: "privacy_level_option_mismatch" }) + (ci.privacy.length === 1 && ci.privacy[0] === "PUBLIC_TO_EVERYONE" ? " Über Zernio gehen Videos nur öffentlich („Alle“)." : ""));
    const ts = { privacy_level: privacy, allow_comment: !!o.ttComment && !ci.commentOff, allow_duet: !!o.ttDuet && !ci.duetOff, allow_stitch: !!o.ttStitch && !ci.stitchOff,
      content_preview_confirmed: true, express_consent_given: true, video_made_with_ai: !!o.ytAi, commercialContentType: o.ttBrandPaid ? "brand_content" : o.ttBrandOwn ? "brand_organic" : "none" };
    if (o.ttBrandPaid && o.ttBrandOwn) ts.isBrandOrganicPost = true;
    const tgt = p => ((p && p.platforms) || []).find(x => x.platform === "tiktok") || {}, fin = s => /^(published|failed|cancelled)$/.test(s || "");
    let { j, status } = await zreq("POST", "/v1/posts", tok, { timeout: 300000, ok: [409], json: { content: String(m.caption || "").slice(0, 2200), mediaItems: [{ type: "video", url: m.video.url }],
      platforms: [{ platform: "tiktok", accountId: tok.account }], tiktokSettings: ts, publishNow: true } });
    if (status === 409) { const ex = j.details && j.details.existingPostId; if (!ex) throw pubErr("TikTok (Zernio): " + String(j.error || "Dieser Inhalt wurde schon gepostet.").slice(0, 240)); j = (await zreq("GET", "/v1/posts/" + encodeURIComponent(ex), tok)).j; }
    let post = j.post || {}, t = tgt(post);
    for (let i = 0; i < 48 && post._id && !fin(t.status); i++) { await sleep(waitMs); post = (await zreq("GET", "/v1/posts/" + encodeURIComponent(post._id), tok)).j.post || post; t = tgt(post); }
    if (t.status === "failed" || t.status === "cancelled") throw pubErr("TikTok (Zernio): " + String(t.errorMessage || "Veröffentlichen fehlgeschlagen").slice(0, 240) + (t.errorCategory === "auth_expired" ? " – in Zernio TikTok neu verbinden." : ""));
    const prof = tok.handle ? "https://www.tiktok.com/@" + tok.handle : "";
    if (t.status !== "published") return { id: String(post._id || ""), zid: String(post._id || ""), url: prof, note: "Zernio postet das Video gerade – es erscheint in ein paar Minuten auf deinem Profil.", privacy };
    return { id: String(t.platformPostId || post._id || ""), zid: String(post._id || ""), url: t.platformPostUrl || prof, note: t.platformPostUrl ? "" : "TikTok verarbeitet das Video noch – es erscheint in ein paar Minuten auf deinem Profil.", privacy };
  }
  async function tiktok(ch, tok, m) {
    if (tok.via === "zernio") return zernioTiktok(ch, tok, m);
    const o = m.opts || {}, size = fs.statSync(m.video.file).size, { chunk, n } = ttChunks(size), src = { source: "FILE_UPLOAD", video_size: size, chunk_size: chunk, total_chunk_count: n };
    const sc = String(tok.scope || ""); let direct = !!o.ttPrivacy && /video\.publish/.test(sc), audit = "";
    if (!direct && /video\.publish/.test(sc) && !/video\.upload/.test(sc)) throw pubErr("TikTok: Bitte im Planer wählen, wer das Video sehen darf (Bearbeiten → Mehr Optionen → TikTok), dann „nochmal“.");
    let init, ci = null, privacy = o.ttPrivacy, note = "";
    const inboxInit = () => req("POST", B.tt + "/v2/post/publish/inbox/video/init/", { token: tok.access, json: { source_info: src }, okStatus: true });
    const unaudited = r => r.error && r.error.code === "unaudited_client_can_only_post_to_private_accounts";
    if (direct) {
      ci = await tiktokCreator(tok);
      if (ci.maxSec && m.duration > ci.maxSec) throw pubErr("TikTok: Das Video ist " + Math.round(m.duration) + " s lang, dieses Konto darf höchstens " + ci.maxSec + " s posten.");
      if (ci.privacy.length && ci.privacy.indexOf(privacy) < 0) throw pubErr(ttMsg({ code: "privacy_level_option_mismatch" }));
      const info = pv => ({ title: String(m.caption || "").slice(0, 2200), privacy_level: pv, disable_comment: !o.ttComment || ci.commentOff, disable_duet: !o.ttDuet || ci.duetOff, disable_stitch: !o.ttStitch || ci.stitchOff,
        brand_organic_toggle: !!o.ttBrandOwn, brand_content_toggle: !!o.ttBrandPaid, is_aigc: !!o.ytAi });
      const go = pv => req("POST", B.tt + "/v2/post/publish/video/init/", { token: tok.access, json: { post_info: info(pv), source_info: src }, okStatus: true });
      init = await go(privacy);
      if (unaudited(init) && privacy !== "SELF_ONLY" && !o.ttBrandPaid && ci.privacy.indexOf("SELF_ONLY") > -1) {
        privacy = "SELF_ONLY"; init = await go(privacy); audit = "private";
        note = "Nur für dich sichtbar gepostet – öffentlich erst, wenn TikTok die App geprüft hat. Bis dahin in der TikTok-App beim Video: ··· → Datenschutzeinstellungen → „Alle“.";
      }
      if (unaudited(init) && /video\.upload/.test(sc)) { direct = false; audit = "draft"; init = await inboxInit(); }
    } else init = await inboxInit();
    if (init.error && init.error.code && init.error.code !== "ok") throw pubErr(ttMsg(init.error), { auth: ttAuthErr(init.error.code) });
    const d = init.data || {}, fd = fs.openSync(m.video.file, "r");
    try {
      for (let i = 0; i < n; i++) { const a = i * chunk, z = i === n - 1 ? size - 1 : a + chunk - 1, buf = Buffer.alloc(z - a + 1); fs.readSync(fd, buf, 0, buf.length, a);
        const r = await fetch(d.upload_url, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(buf.length), "Content-Range": "bytes " + a + "-" + z + "/" + size }, body: buf, signal: AbortSignal.timeout(300000) });
        if (!r.ok && r.status !== 206) throw pubErr("TikTok: Hochladen fehlgeschlagen (" + r.status + ")"); }
    } finally { fs.closeSync(fd); }
    let status = "", s = {}, txt = "";
    for (let i = 0; i < (direct ? 36 : 24); i++) { ({ j: s, txt } = await req("POST", B.tt + "/v2/post/publish/status/fetch/", { token: tok.access, json: { publish_id: d.publish_id }, withText: true })); status = s.data && s.data.status || ""; if (/PUBLISH_COMPLETE/.test(status) || (!direct && /SEND_TO_USER_INBOX/.test(status))) break; if (/FAILED/.test(status)) throw pubErr("TikTok: Verarbeitung fehlgeschlagen (" + (s.data.fail_reason || "") + ")"); await sleep(waitMs); }
    if (!direct) return { id: d.publish_id, url: "", draft: true, audit, note: (audit ? "TikTok lässt direktes Posten erst nach der Prüfung der App zu – bis dahin als Entwurf. " : "") + "Liegt als Entwurf in deiner TikTok-App: Posteingang → System-Benachrichtigungen → Video öffnen, Text aus dem Cockpit einfügen („TikTok-Text kopieren“) und auf „Posten“ tippen." };
    const pid = (String(txt).match(/"publi[a-z]*_available_post_id"\s*:\s*\[\s*"?(\d+)/) || [])[1];   // aus dem Rohtext (TikTok schreibt „publicaly“): 19-stellige IDs verliert JSON.parse
    if (status !== "PUBLISH_COMPLETE") note = (note ? note + " " : "") + "TikTok verarbeitet das Video noch – es erscheint in ein paar Minuten auf deinem Profil.";
    return { id: String(pid || d.publish_id || ""), url: pid && ci.username ? "https://www.tiktok.com/@" + ci.username + "/video/" + pid : ci.username ? "https://www.tiktok.com/@" + ci.username : "", note, privacy, audit };
  }
  async function pinterest(ch, tok, m) {
    const ms = m.images.length > 1 ? { source_type: "multiple_image_urls", items: m.images.slice(0, 5).map(im => ({ url: im.url, title: String(m.title || "").slice(0, 100), description: String(m.caption).slice(0, 500), link: m.link || "" })) } : { source_type: "image_url", url: m.images[0].url };
    m = Object.assign({}, m, (m.opts || {}).pinLink ? { link: m.opts.pinLink } : {});
    const p = await req("POST", B.pin + "/v5/pins", { token: tok.access, json: { board_id: ch.account.id, title: String(m.title || "").slice(0, 100), description: String(m.caption).slice(0, 500), link: m.link || undefined, alt_text: String(m.alt || "").slice(0, 500), media_source: ms } });
    return { id: p.id, url: "https://www.pinterest.com/pin/" + p.id + "/" };
  }
  // Bluesky: Text höchstens 300 Zeichen, Hashtags/Links nur mit „facets“ (Byte-Positionen) klickbar
  function bskyFacets(text) {
    const facets = [], enc = s => Buffer.byteLength(s, "utf8");
    const re = /(https?:\/\/[^\s]+)|(^|\s)(#[\wäöüÄÖÜß]+)/g; let mm;
    while ((mm = re.exec(text))) {
      if (mm[1]) { const s = enc(text.slice(0, mm.index)); facets.push({ index: { byteStart: s, byteEnd: s + enc(mm[1]) }, features: [{ $type: "app.bsky.richtext.facet#link", uri: mm[1] }] }); }
      else { const st = mm.index + mm[2].length, s = enc(text.slice(0, st)); facets.push({ index: { byteStart: s, byteEnd: s + enc(mm[3]) }, features: [{ $type: "app.bsky.richtext.facet#tag", tag: mm[3].slice(1) }] }); }
    }
    return facets;
  }
  async function bluesky(ch, tok, m) {
    const did = ch.account.id, t = tok.access; let embed;
    if (m.format === "reel") {
      const svc = await req("GET", B.bsky + "/xrpc/com.atproto.server.getServiceAuth" + q({ aud: "did:web:" + new URL(tok.pds || B.bsky).host, lxm: "com.atproto.repo.uploadBlob", exp: String(Math.floor(Date.now() / 1000) + 1800) }), { token: t });
      const up = await req("POST", B.bskyVideo + "/xrpc/app.bsky.video.uploadVideo" + q({ did, name: "reel.mp4" }), { token: svc.token, body: fs.readFileSync(m.video.file), headers: { "Content-Type": "video/mp4" }, okStatus: true, timeout: 300000 });
      const jobId = up.jobId || (up.jobStatus && up.jobStatus.jobId); let blob = up.blob || (up.jobStatus && up.jobStatus.blob);
      for (let i = 0; !blob && jobId && i < 60; i++) { await sleep(waitMs); const s = await req("GET", B.bskyVideo + "/xrpc/app.bsky.video.getJobStatus" + q({ jobId }), { token: t }); const js = s.jobStatus || {}; if (js.blob) blob = js.blob; if (js.state === "JOB_STATE_FAILED") throw pubErr("Bluesky konnte das Video nicht verarbeiten" + (js.error ? ": " + js.error : "") + "."); }
      if (!blob) throw pubErr("Bluesky: Video-Upload nicht bestätigt (für Videos muss die E-Mail-Adresse in Bluesky bestätigt sein)." );
      embed = { $type: "app.bsky.embed.video", video: blob, aspectRatio: { width: 1080, height: 1920 }, alt: String(m.alt || "").slice(0, 1000) };
    } else {
      const images = [];
      for (const im of m.images.slice(0, 4)) { const buf = fs.readFileSync(im.small || im.file); const r = await req("POST", B.bsky + "/xrpc/com.atproto.repo.uploadBlob", { token: t, body: buf, headers: { "Content-Type": "image/jpeg" } }); images.push({ alt: String(m.alt || "").slice(0, 1000), image: r.blob, aspectRatio: { width: 1080, height: 1350 } }); }
      embed = { $type: "app.bsky.embed.images", images };
    }
    const text = m.caption;
    const o = m.opts || {}, lang = /^[a-z]{2}$/.test(o.bsLang || "") ? o.bsLang : "de";
    const r = await req("POST", B.bsky + "/xrpc/com.atproto.repo.createRecord", { token: t, json: { repo: did, collection: "app.bsky.feed.post", record: { $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString(), langs: [lang], facets: bskyFacets(text), embed } } });
    const rkey = String(r.uri || "").split("/").pop();
    if (/^(nobody|followers|following|mentioned)$/.test(o.bsReply || "")) {   // Antworten einschränken (Threadgate, gleiche Kennung wie der Post)
      const allow = o.bsReply === "nobody" ? [] : [{ $type: "app.bsky.feed.threadgate#" + ({ followers: "followerRule", following: "followingRule", mentioned: "mentionRule" })[o.bsReply] }];
      try { await req("POST", B.bsky + "/xrpc/com.atproto.repo.createRecord", { token: t, json: { repo: did, collection: "app.bsky.feed.threadgate", rkey, record: { $type: "app.bsky.feed.threadgate", post: r.uri, allow, createdAt: new Date().toISOString() } } }); } catch (e) {}
    }
    return { id: r.uri, url: "https://bsky.app/profile/" + (tok.handle || did) + "/post/" + rkey };
  }
  const RUN = { instagram, facebook, threads, linkedin, youtube, tiktok, pinterest, bluesky };
  // ───────────── Nach dem Posten: Text ändern, löschen, Kommentare (nur was die Schnittstellen erlauben) ─────────────
  const CAN = { edit: ["facebook", "linkedin", "youtube", "pinterest"], remove: ["facebook", "threads", "linkedin", "youtube", "pinterest", "bluesky"], comments: ["instagram"] };
  async function editRemote(platform, ch, tok, ref, o) {   // ref = { id, format }, o = { text, title }
    const t = tok.access, text = String(o.text || "");
    if (platform === "facebook") { await req("POST", B.fb + "/" + GV + "/" + ref.id, { form: Object.assign(ref.format === "reel" ? { description: text } : { message: text }, { access_token: t }) }); return; }
    if (platform === "linkedin") { await req("POST", B.li + "/rest/posts/" + encodeURIComponent(ref.id), { token: t, headers: Object.assign({ "X-RestLi-Method": "PARTIAL_UPDATE" }, LIH), json: { patch: { $set: { commentary: liText(text) } } } }); return; }
    if (platform === "youtube") {
      const cur = await req("GET", B.yt + "/youtube/v3/videos" + q({ part: "snippet", id: ref.id }), { token: t }), sn = ((cur.items || [])[0] || {}).snippet; if (!sn) throw pubErr("YouTube-Video nicht gefunden.");
      await req("PUT", B.yt + "/youtube/v3/videos?part=snippet", { token: t, json: { id: ref.id, snippet: { title: String(o.title || sn.title).slice(0, 100), description: text.slice(0, 4900), categoryId: sn.categoryId, tags: sn.tags || [], defaultLanguage: sn.defaultLanguage } } }); return; }
    if (platform === "pinterest") { await req("PATCH", B.pin + "/v5/pins/" + encodeURIComponent(ref.id), { token: t, json: Object.assign({ description: text.slice(0, 500) }, o.title ? { title: String(o.title).slice(0, 100) } : {}) }); return; }
    throw pubErr("Diese Plattform erlaubt kein nachträgliches Ändern über die Schnittstelle.");
  }
  async function removeRemote(platform, ch, tok, ref) {
    const t = tok.access;
    if (platform === "facebook") return req("DELETE", B.fb + "/" + GV + "/" + ref.id + q({ access_token: t }));
    if (platform === "threads") return req("DELETE", B.th + "/v1.0/" + ref.id + q({ access_token: t }));
    if (platform === "linkedin") return req("DELETE", B.li + "/rest/posts/" + encodeURIComponent(ref.id), { token: t, headers: LIH, okStatus: true });
    if (platform === "youtube") return req("DELETE", B.yt + "/youtube/v3/videos" + q({ id: ref.id }), { token: t });
    if (platform === "pinterest") return req("DELETE", B.pin + "/v5/pins/" + encodeURIComponent(ref.id), { token: t });
    if (platform === "bluesky") { const rkey = String(ref.id).split("/").pop(); return req("POST", B.bsky + "/xrpc/com.atproto.repo.deleteRecord", { token: t, json: { repo: ch.account.id, collection: "app.bsky.feed.post", rkey } }); }
    throw pubErr("Diese Plattform erlaubt kein Löschen über die Schnittstelle – bitte in der App löschen.");
  }
  async function commentsRemote(platform, ch, tok, ref, on) {
    if (platform !== "instagram") throw pubErr("Kommentare lassen sich nur bei Instagram über die Schnittstelle ein- und ausschalten.");
    return req("POST", B.ig + "/" + GV + "/" + ref.id, { form: { comment_enabled: on ? "true" : "false", access_token: tok.access } });
  }
  // Zahlen zu einem veröffentlichten Beitrag: { views, reach, likes, comments, shares, saves } (null = liefert die Plattform nicht).
  // Fehlt die Statistik-Berechtigung, kommen die frei lesbaren Werte (Likes, Kommentare) und need: "insights"; none: Plattform gibt gar keine Aufrufe heraus.
  async function statsRemote(platform, ch, tok, ref) {   // ref = { id, format, zid }
    const t = tok.access, out = { views: null, reach: null, likes: null, comments: null, shares: null, saves: null };
    const num = v => v == null || v === "" || !isFinite(+v) ? null : +v, fill = o => { Object.keys(o).forEach(k => { if (o[k] != null) out[k] = o[k]; }); return out; };
    const noPerm = e => /permission|scope|not authorized|nicht berechtigt|insufficient|requires|\(#(10|200|230|3)\)/i.test(String(e && e.message));
    const badMetric = e => /\(#100\)|metric/i.test(String(e && e.message)) && !noPerm(e);
    // Insights-Antwort (Meta/Threads): data[].total_value.value oder letzter Wert in values[]
    const ins = data => (data || []).reduce((o, x) => { const v = x.total_value ? x.total_value.value : x.values && x.values.length ? x.values[x.values.length - 1].value : null;
      o[x.name] = typeof v === "number" ? v : v && typeof v === "object" ? Object.keys(v).reduce((a, k) => a + (+v[k] || 0), 0) : null; return o; }, {});
    // Meta lehnt die ganze Abfrage ab, wenn eine Metrik für diesen Beitrag nicht passt → kürzere Listen probieren
    const tryIns = async (url, lists) => { let last; for (const l of lists) { try { return ins((await req("GET", url(l.join(",")))).data); } catch (e) { if (e.auth || !badMetric(e)) throw e; last = e; } } throw last; };
    const insErr = e => { if (e.auth) throw e; if (noPerm(e)) out.need = "insights"; else out.note = String(e.message || e).slice(0, 160); };
    if (platform === "instagram") {
      const base = B.ig + "/" + GV + "/" + ref.id;
      try { const f = await req("GET", base + q({ fields: "like_count,comments_count", access_token: t })); fill({ likes: num(f.like_count), comments: num(f.comments_count) }); } catch (e) { if (e.auth) throw e; }
      try { const m = await tryIns(l => base + "/insights" + q({ metric: l, access_token: t }), [["views", "reach", "likes", "comments", "shares", "saved"], ["views", "reach"], ["reach"]]);
        fill({ views: num(m.views), reach: num(m.reach), likes: num(m.likes), comments: num(m.comments), shares: num(m.shares), saves: num(m.saved) }); } catch (e) { insErr(e); }
      return out;
    }
    if (platform === "facebook") {
      const base = B.fb + "/" + GV + "/" + ref.id, reel = ref.format === "reel", sum = x => x && x.summary ? num(x.summary.total_count) : null;
      try { const f = await req("GET", base + q({ fields: "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)" + (reel ? "" : ",shares"), access_token: t }));
        fill({ likes: sum(f.reactions), comments: sum(f.comments), shares: reel ? null : f.shares ? num(f.shares.count) : 0 }); } catch (e) { if (e.auth) throw e; }
      try {
        if (reel) { const m = await tryIns(l => base + "/video_insights" + q({ metric: l, access_token: t }), [["blue_reels_play_count", "post_impressions_unique"], ["fb_reels_total_plays"], ["total_video_views"]]);
          fill({ views: num(m.blue_reels_play_count != null ? m.blue_reels_play_count : m.fb_reels_total_plays != null ? m.fb_reels_total_plays : m.total_video_views), reach: num(m.post_impressions_unique) }); }
        else { const m = await tryIns(l => base + "/insights" + q({ metric: l, access_token: t }), [["post_media_view", "post_total_media_view_unique"], ["post_media_view"], ["post_impressions", "post_impressions_unique"]]);
          fill({ views: num(m.post_media_view != null ? m.post_media_view : m.post_impressions), reach: num(m.post_total_media_view_unique != null ? m.post_total_media_view_unique : m.post_impressions_unique) }); }
      } catch (e) { insErr(e); }
      return out;
    }
    if (platform === "threads") {
      try { const m = ins((await req("GET", B.th + "/v1.0/" + ref.id + "/insights" + q({ metric: "views,likes,replies,reposts,quotes", access_token: t }))).data);
        fill({ views: num(m.views), likes: num(m.likes), comments: num(m.replies), shares: m.reposts != null || m.quotes != null ? (m.reposts || 0) + (m.quotes || 0) : null }); } catch (e) { insErr(e); }
      return out;
    }
    if (platform === "tiktok") {
      if (tok.via !== "zernio") return Object.assign(out, { none: "Zahlen zu TikTok-Videos gibt es nur, wenn TikTok über Zernio verbunden ist." });
      const { j, status } = await zreq("GET", "/v1/analytics" + q({ postId: ref.zid || ref.id, accountId: tok.account }), tok, { ok: [202, 402, 404, 424] });
      if (status === 402) return Object.assign(out, { none: "Zernio gibt Zahlen nur mit dem Analyse-Zusatz im Zernio-Tarif heraus." });
      if (status === 202) return Object.assign(out, { wait: true });
      if (status === 404 || status === 424) return Object.assign(out, { none: "Zernio findet zu diesem Video keine Zahlen." });
      const pa = (j.platformAnalytics || []).find(x => x && x.platform === "tiktok"), a = (pa && pa.analytics) || j.analytics || {};
      return fill({ views: num(a.views), reach: num(a.reach), likes: num(a.likes), comments: num(a.comments), shares: num(a.shares), saves: num(a.saves) });
    }
    if (platform === "youtube") {
      const s = (((await req("GET", B.yt + "/youtube/v3/videos" + q({ part: "statistics", id: ref.id }), { token: t })).items || [])[0] || {}).statistics || {};
      return fill({ views: num(s.viewCount), likes: num(s.likeCount), comments: num(s.commentCount) });
    }
    if (platform === "pinterest") {   // Pinterest liefert höchstens 90 Tage rückwirkend
      const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
      const r = await req("GET", B.pin + "/v5/pins/" + encodeURIComponent(ref.id) + "/analytics" + q({ start_date: day(89), end_date: day(0), metric_types: "IMPRESSION,SAVE", app_types: "ALL" }), { token: t });
      const s = (r.all && (r.all.lifetime_metrics || r.all.summary_metrics)) || {}; return fill({ views: num(s.IMPRESSION), saves: num(s.SAVE) });
    }
    if (platform === "bluesky") {
      const p = ((await req("GET", B.bsky + "/xrpc/app.bsky.feed.getPosts" + q({ uris: ref.id }), { token: t })).posts || [])[0] || {};
      return Object.assign(fill({ likes: num(p.likeCount), comments: num(p.replyCount), shares: p.repostCount != null ? (p.repostCount || 0) + (p.quoteCount || 0) : null }), { none: "Bluesky zählt keine Aufrufe." });
    }
    if (platform === "linkedin") return Object.assign(out, { none: "LinkedIn zeigt Zahlen zu Profil-Beiträgen nur in der LinkedIn-App." });
    throw pubErr("Für diese Plattform gibt es keine Zahlen.");
  }
  // Orte suchen (Facebook-Seiten mit Adresse, nutzbar für Instagram und Facebook) – braucht ein verbundenes Facebook-Konto
  async function placeSearch(ch, tok, query) {
    const r = await req("GET", B.fb + "/" + GV + "/pages/search" + q({ q: String(query).slice(0, 80), fields: "id,name,location,link", limit: "15", access_token: tok.access }));
    return (r.data || []).filter(x => x && x.id).map(x => ({ id: String(x.id), name: String(x.name || "").slice(0, 80), city: x.location ? [x.location.street, x.location.city, x.location.country].filter(Boolean).join(", ").slice(0, 120) : "", hasLoc: !!(x.location && (x.location.latitude || x.location.city)) }));
  }
  async function publish(platform, ch, tok, m) { if (!RUN[platform]) throw pubErr("Plattform nicht unterstützt"); return RUN[platform](ch, tok, m); }

  // Instagram: eigene Beiträge und deren Kommentare (für die Gewinnspiel-Auslosung)
  async function igMedia(ch, tok) { const r = await req("GET", B.ig + "/" + GV + "/" + ch.account.id + "/media" + q({ fields: "id,caption,timestamp,permalink,media_type,thumbnail_url,media_url,comments_count", limit: "18", access_token: tok.access })); return r.data || []; }
  // Kommentare samt Antworten (je Kommentar bis 50 Antworten über das Feld replies)
  async function igComments(ch, tok, mediaId) {
    const out = []; let url = B.ig + "/" + GV + "/" + mediaId + "/comments" + q({ fields: "id,username,text,timestamp,replies.limit(50){id,username,text,timestamp}", limit: "50", access_token: tok.access });
    for (let i = 0; url && i < 400; i++) {
      const r = await req("GET", url);
      (r.data || []).forEach(c => { out.push({ id: c.id, username: c.username || "", text: c.text || "", at: c.timestamp || "", reply: false });
        ((c.replies && c.replies.data) || []).forEach(x => out.push({ id: x.id, username: x.username || "", text: x.text || "", at: x.timestamp || "", reply: true, parent: c.id })); });
      url = r.paging && r.paging.next || "";
    }
    return out;
  }
  // ───────────── Posteingang: Kommentare, Nachrichten, Likes je Kanal (lesen, antworten, liken) ─────────────
  // Einheitlich: { items:[{ id, kind:"comment"|"message"|"like"|"mention", from:{name,handle,id}, text, at, mine, post:{id,text,url,thumb},
  //   replies:[{from,text,at,mine}], can:{reply,like}, ref:{…für Antwort/Like} }], posts:[{id,text,url,thumb,at,likes,comments}], notes:[…] }
  const clipT = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
  const permNote = (e, what) => /permission|scope|not authorized|\(#(10|200|230|3|190)\)|OAuthException|nicht berechtigt|insufficient/i.test(String(e && e.message)) ? what + ": Berechtigung fehlt – Konto unter Kanäle neu verbinden." : what + ": " + String(e && e.message || e).slice(0, 160);
  // Lesen im Posteingang: höchstens 25 s je Anfrage (eine hängende Plattform hält die Marke nicht eine Minute auf)
  const RD = { timeout: 25000 }, get = (url, o) => req("GET", url, Object.assign({}, RD, o || {}));
  // Seitenweise laden (Graph-API „paging.next“), höchstens n Seiten
  async function pages(url, n) { let out = [], u = url; for (let i = 0; u && i < n; i++) { const r = await get(u); out = out.concat(r.data || []); u = r.paging && r.paging.next; } return out; }
  // je Beitrag eine Anfrage – gleichzeitig, aber höchstens n auf einmal (Ratenlimits der Plattformen); Ergebnisse in der Reihenfolge der Liste
  async function mapLimit(list, n, fn) { const out = new Array(list.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } })); return out; }
  const PAR = 4;
  // ───────────── Posteingang: Anhänge (Fotos, GIFs, Sticker, Videos, Sprachnachrichten, Dateien, geteilte Beiträge/Reels, Story-Erwähnungen) ─────────────
  // Kompakt je Anhang: { t, url, prev, w, h, mime, name, size, title, link, owner, mediaId, storyId, exp, state:"ok"|"expired"|"gone"|"ephemeral"|"unsupported"|"unknown" }
  // Gespeichert werden nur Adresse und Angaben, NIE die Datei (Meta verbietet das für Story-Erwähnungen) – angezeigt über den Durchreich-Proxy in mkt-posts.js.
  const H24 = 864e5;
  // Medien-Adressen der Plattformen: nur bekannte CDN-Hosts über https (Tests: zusätzlich D.cdnHosts) – nie beliebige Adressen abrufen (SSRF)
  const CDN_RE = /(^|\.)(fbsbx\.com|fbcdn\.net|cdninstagram\.com|facebook\.com)$/i, CDN_X = (D.cdnHosts || []).map(String);
  function cdnOk(v) { try { const x = new URL(String(v)); return (x.protocol === "https:" && CDN_RE.test(x.hostname)) || (CDN_X.indexOf(x.host) > -1 && /^https?:$/.test(x.protocol)); } catch (e) { return false; } }
  const urlOf = v => { v = String(v || "").trim(); return v.length < 3000 && (/^https:\/\/[^\s"'<>\\]+$/i.test(v) || cdnOk(v)) ? v : ""; };
  // Links, die das Cockpit öffnen darf (Deep-Links in die Apps, Permalinks)
  const LINK_OK = /^https:\/\/(ig\.me|(www\.)?instagram\.com|(www\.)?threads\.(net|com)|bsky\.app|(www\.|m\.|business\.)?facebook\.com)\/[^\s"'<>\\]*$/;
  const linkOf = v => LINK_OK.test(String(v || "")) ? String(v).slice(0, 500) : "";
  const tidy = o => { Object.keys(o).forEach(k => { const v = o[k]; if (v === "" || v == null || v === false || (typeof v === "number" && !(v > 0))) delete o[k]; }); return o; };
  const EMO = { love: "❤️", like: "👍", haha: "😂", wow: "😮", sad: "😢", angry: "😠", smile: "😊", yay: "🎉" };
  const ms = t => Date.parse(t || 0) || 0;
  // Graph-Nachricht (Instagram/Facebook) → alle Anhänge, auch neben Text
  function attsOf(x) {
    const out = [], at = ms(x.created_time), exp = at ? new Date(at + H24).toISOString() : "";
    const add = a => { a.state = a.state || "ok"; out.push(tidy(a)); };
    ((x.attachments && x.attachments.data) || []).forEach(a => {
      const im = a.image_data, vd = a.video_data, mt = String(a.mime_type || "").toLowerCase(), py = a.payload || {}, ty = String(a.type || "").toLowerCase(), fu = urlOf(a.file_url || py.url);
      if (im) { const gif = urlOf(im.animated_gif_url); return add({ t: im.render_as_sticker ? "sticker" : gif ? "gif" : "image", url: gif || urlOf(im.url), prev: gif ? urlOf(im.url) : urlOf(im.preview_url), w: +im.width, h: +im.height }); }
      if (vd) return add({ t: "video", url: urlOf(vd.url), prev: urlOf(vd.preview_url), w: +vd.width, h: +vd.height });
      if (a.generic_template) { const g = a.generic_template; return add({ t: "template", title: clipT([g.title, g.subtitle].filter(Boolean).join(" – "), 300), url: urlOf(g.media_url || g.image_url), link: urlOf(g.url || (g.cta && g.cta.url) || (g.default_action && g.default_action.url)) }); }
      // Webhook-Form (type + payload), die manche Konten auch im Abruf liefern
      if (/story_mention/.test(ty)) return add({ t: "story_mention", url: fu, exp });
      if (/reel/.test(ty)) return add({ t: "reel", url: fu, title: clipT(py.title, 300), mediaId: String(py.reel_video_id || "") });
      if (/ig_post|share/.test(ty) && fu) return add({ t: "post", url: fu, title: clipT(py.title, 300), mediaId: String(py.ig_post_media_id || "") });
      if (fu) return add({ t: /^audio\//.test(mt) || ty === "audio" ? "audio" : /animated/.test(ty) ? "gif" : /^image\//.test(mt) || ty === "image" ? "image" : /^video\//.test(mt) || ty === "video" ? "video" : "file", url: fu, mime: mt, name: clipT(a.name, 120), size: +a.size });
      add({ t: "ephemeral", state: "ephemeral" });   // Anhang ohne Adresse: Einmal-Foto/-Video, nur in der App sichtbar
    });
    ((x.shares && x.shares.data) || []).forEach(s => {   // geteilte Beiträge/Reels: Bild- bzw. Video-Adresse und Text, meist ohne Permalink
      const ty = String(s.type || "").toLowerCase(), link = urlOf(s.link), url = urlOf(s.url);
      if (!url && !link && !s.title && !s.name && !s.description) return;
      add({ t: /reel/.test(ty) ? "reel" : /post|media|photo|video/.test(ty) || (url && !link) ? "post" : "link", url: url !== link ? url : "", link, title: clipT(s.title || s.description || s.name, 300), mediaId: s.id ? String(s.id) : "" });
    });
    const st = x.story || {}, rs = x.reply_to && x.reply_to.story;
    if (st.mention) add({ t: "story_mention", url: urlOf(st.mention.link || st.mention.url), storyId: String(st.mention.id || ""), exp });
    if (st.reply_to || rs) { const r = st.reply_to || rs; add({ t: "story_reply", url: urlOf(r.link || r.url), storyId: String(r.id || ""), exp }); }
    if (typeof x.sticker === "string" && urlOf(x.sticker) && !out.some(a => a.t === "sticker")) add({ t: "sticker", url: urlOf(x.sticker) });
    if (x.is_unsupported) add({ t: "unsupported", state: "unsupported" });
    return out.slice(0, 10);
  }
  // Ablauf ohne Netzabfrage: Storys sind 24 h nach dem Erwähnen weg
  function stamp(a) { if (/^story_/.test(a.t)) { if (a.exp && ms(a.exp) < Date.now()) a.state = "expired"; else if (!a.url && a.state === "ok") a.state = "unknown"; } return a; }
  // Kurztext für Liste und Mitteilung (statt „📎 Anhang“)
  const LBL = { image: "📷 Foto", gif: "GIF", sticker: "Sticker", video: "🎬 Video", audio: "🎤 Sprachnachricht", file: "📎 Datei", post: "🔗 Geteilter Beitrag", reel: "🎞 Geteiltes Reel", link: "🔗 Link", template: "🔗 Karte", quote: "💬 Zitat",
    story_mention: "📣 hat dich in der Story erwähnt", story_reply: "↩︎ hat auf deine Story geantwortet", ephemeral: "👁 Einmal-Foto/-Video (nur in der App)", unsupported: "Nachricht nur in der App sichtbar" };
  function labelOf(atts) {
    const a = (atts || [])[0]; if (!a) return ""; if (a.old) return "Anhang (älter, nur in der App)";
    let l = LBL[a.t] || "📎 Anhang"; if (a.t === "file" && a.name) l += " „" + clipT(a.name, 60) + "“"; if ((a.t === "post" || a.t === "reel") && a.owner) l += " von " + a.owner;
    return atts.length > 1 ? l + " (+" + (atts.length - 1) + ")" : l;
  }
  // Feldleiter: reichster Feldsatz zuerst; meldet Meta „unbekanntes Feld“, der nächste. Die funktionierende Stufe wird je Kanal gemerkt (st), nach 7 Tagen neu probiert.
  const fieldErr = e => !e.auth && e.status === 400 && /nonexisting field|unknown field|invalid field|\(#100\)/i.test(String(e.message || ""));
  async function ladder(st, key, levels, run) {
    const m = st[key], start = m && Date.now() - m.at < 7 * H24 ? Math.min(m.n, levels.length - 1) : 0;
    for (let k = start; k < levels.length; k++) {
      try { const r = await run(levels[k], k); st[key] = { n: k, at: m && m.n === k && start === k && k > 0 ? m.at : Date.now() }; return r; }
      catch (e) { if (!fieldErr(e) || k === levels.length - 1) throw e; }
    }
  }
  const ATT_F = "attachments{id,mime_type,name,size,file_url,image_data{url,preview_url,width,height,render_as_sticker,animated_gif_url},video_data{url,preview_url,width,height},generic_template}";
  const SHR_F = "shares{id,name,description,link,type,url,title}", MSG0 = "id,from,to,message,created_time";
  const IG_MSG = [MSG0 + "," + ATT_F + "," + SHR_F + ",story,reactions,reply_to,is_unsupported", MSG0 + "," + ATT_F + "," + SHR_F + ",story", MSG0 + ",attachments,shares,story", MSG0 + ",attachments"];
  const FB_MSG = [MSG0 + "," + ATT_F + "," + SHR_F + ",sticker,reactions,reply_to,is_unsupported", MSG0 + "," + ATT_F + "," + SHR_F, MSG0 + ",attachments,shares", MSG0 + ",attachments"];
  // Ablaufprüfung einer Medien-Adresse (1 Byte, Weiterleitungen einzeln geprüft), Ergebnis 15 min gemerkt: ok | gone (403/404/410) | unknown
  async function cdnFetch(url, o) {
    o = o || {}; let u = String(url || "");
    for (let i = 0; i < 4; i++) {
      if (!cdnOk(u)) throw pubErr("Unbekannte Medien-Adresse", { status: 404, host: true });
      const r = await fetch(u, { headers: Object.assign({ "User-Agent": "Mozilla/5.0 (FS-Cockpit)" }, o.range ? { Range: o.range } : {}), redirect: "manual", signal: o.signal || AbortSignal.timeout(o.timeout || 20000) });
      const loc = r.status >= 300 && r.status < 400 && r.headers.get("location");
      if (!loc) return r;
      try { if (r.body) await r.body.cancel(); } catch (e) {}
      u = new URL(loc, u).toString();
    }
    throw pubErr("Zu viele Weiterleitungen", { status: 502 });
  }
  const PROBE = new Map();
  async function probe(url) {
    const c = PROBE.get(url); if (c && Date.now() - c.at < 15 * 60e3) return c;
    const o = { at: Date.now(), st: "unknown", mime: "" };
    try { const r = await cdnFetch(url, { range: "bytes=0-0", timeout: 5000 }); o.st = r.ok ? "ok" : [403, 404, 410].indexOf(r.status) > -1 ? "gone" : "unknown"; if (r.ok) o.mime = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase().slice(0, 60); try { if (r.body) await r.body.cancel(); } catch (e) {} } catch (e) {}
    PROBE.set(url, o); if (PROBE.size > 2000) PROBE.delete(PROBE.keys().next().value); return o;
  }
  // Unterhaltungen (Instagram/Facebook) → Einträge mit Verlauf und allen Anhängen.
  // x: { o (Optionen von inbox), base, t, detail (Felder Einzelabruf), isMine(m), nameOf(m, other), other(c), item(c, other) → Grundeintrag }
  async function convItems(cvAll, x) {
    const o = x.o, prevAtt = new Map(), need = [], rows = [];
    (o.prev || []).forEach(i => (i.thread || []).forEach(m => { if (m.id && m.att && m.att.length) prevAtt.set(m.id, m.att); }));
    cvAll.forEach(c => {
      const raw = (c.messages && c.messages.data) || []; if (!raw.length) return; const other = x.other(c);
      const thread = raw.map((m, idx) => {
        let att = attsOf(m); const text = String(m.message || ""), keep = prevAtt.get(m.id);
        // Zusammenführen mit dem letzten Stand: gleiche Adresse behält „abgelaufen/gelöscht“; Meta liefert Angaben nur für die 20 neuesten Nachrichten
        if (keep) { if (!att.length) att = keep.map(a => Object.assign({}, a)); else att.forEach((a, k) => { const p = keep[k]; if (p && p.t === a.t && p.url && p.url === a.url) { if (p.state === "gone" || p.state === "expired") a.state = p.state; if (p.mime && !a.mime) a.mime = p.mime; } }); }
        if (!att.length && !text && o.msgx && o.msgx[m.id]) att = (o.msgx[m.id].att || []).map(a => Object.assign({}, a));
        const r = { id: m.id, from: { name: x.nameOf(m, other) }, text, at: m.created_time || "", mine: x.isMine(m) };
        if (att.length) r.att = att; else if (!text && idx < 20 && !(o.msgx && o.msgx[m.id])) need.push(r);
        r._i = idx;
        const re = ((m.reactions && m.reactions.data) || []).map(z => ({ e: z.emoji || EMO[String(z.reaction || "").toLowerCase()] || "❤️" })).slice(0, 6); if (re.length) r.react = re;
        const rt = m.reply_to && (m.reply_to.mid || m.reply_to.id); if (rt) r.replyTo = { mid: String(rt) };
        return r;
      }).reverse();
      rows.push({ c, other, thread });
    });
    // Einzelabruf (GET /<Nachricht>?fields=story,…) nur, wenn die Feldleiter auf einer schlichten Stufe steht – je Nachricht nur einmal (o.msgx), höchstens 10 je Abruf
    if (need.length && x.poor) {
      await mapLimit(need.slice(0, 10), PAR, async r => {
        let att = []; try { att = attsOf(Object.assign({ created_time: r.at }, await get(x.base + "/" + encodeURIComponent(r.id) + q({ fields: x.detail, access_token: x.t }), { timeout: 10000 }))); }
        catch (e) { if (e.auth || !(e.status >= 400 && e.status < 500)) return; }   // Meta kennt die Nachricht so nicht → merken (leer), nicht bei jedem Abruf neu fragen
        if (att.length) r.att = att; if (o.msgx) { o.msgx[r.id] = { t: Date.now(), att }; o.msgxDirty = true; }
      });
    }
    const stories = [];
    rows.forEach(rw => rw.thread.forEach(r => {
      if (!r.text && !r.att) r.att = [tidy({ t: "unsupported", state: "unknown", old: r._i >= 20 ? 1 : 0 })];
      delete r._i; (r.att || []).forEach(a => { stamp(a); if (/^story_/.test(a.t) && a.state === "ok" && a.url) stories.push({ at: ms(r.at), a }); });
      if (!r.text && r.att) r.label = labelOf(r.att);
      if (r.replyTo) { const z = rw.thread.find(y => y.id === r.replyTo.mid); if (z) r.replyTo.text = clipT(z.text || z.label, 120); }
    }));
    // noch nicht abgelaufene Storys prüfen (gelöscht? Bild oder Video?), die 10 neuesten je Kanal
    await mapLimit(stories.sort((a, b) => b.at - a.at).slice(0, 10), PAR, async s => { const p = await probe(s.a.url); if (p.st === "gone") s.a.state = "expired"; if (p.mime && !s.a.mime) s.a.mime = p.mime; });
    return rows.map(rw => {
      const th = rw.thread, last = th[th.length - 1], it = x.item(rw.c, rw.other), wk = Date.now() - 7 * H24;
      const theirs = t0 => th.filter(r => !r.mine && ms(r.at) > wk && (r.att || []).some(a => a.t === t0)).pop();
      const sm = theirs("story_mention"), sr = theirs("story_reply"), sh = th.some(r => !r.mine && ms(r.at) > wk && (r.att || []).some(a => a.t === "post" || a.t === "reel"));
      if (sm || sr || sh) { const a = sm && sm.att.find(z => z.t === "story_mention"); it.flags = tidy({ storyMention: !!sm, storyReply: !!sr, share: sh, sm: sm ? sm.id : "", smExp: a && a.exp || "", smState: a && a.state || "" }); }
      if (sm && it.can) it.can.story = "app";
      return Object.assign(it, { text: last.text || last.label || "", at: last.at || it.at || "", mine: !!last.mine, thread: th });
    });
  }
  // Markierungen in fremden Beiträgen (Instagram /tags, Facebook-Seite /tagged): höchstens alle 30 Minuten (Fehler wegen Berechtigung: 1× am Tag), dazwischen der letzte Stand
  async function tagsOf(st, key, prefix, prev, fetchItems, note) {
    const s = st[key] = st[key] || {}, old = (prev || []).filter(i => String(i.id).indexOf(prefix) === 0);
    if (s.at && Date.now() - s.at < (s.perm ? 24 * 3600e3 : 30 * 60e3)) return { items: old, note: s.err ? note(s) : "" };
    s.at = Date.now();
    try { const items = await fetchItems(); s.err = ""; s.perm = false; return { items }; }
    catch (e) { s.err = String(e && e.message || e).slice(0, 160); s.perm = !!(e && e.auth) || /permission|scope|not authorized|\((#)?(10|100|200|230|3)\)|OAuthException|insufficient|nonexisting|unsupported get request|does not exist/i.test(s.err); return { items: old, note: note(s) }; }
  }
  function igTagItem(m) {
    const un = /^[\w.]{1,30}$/.test(m.username || "") ? m.username : "", ty = String(m.media_type || "").toUpperCase(), link = linkOf(m.permalink), full = urlOf(m.media_url), th = urlOf(m.thumbnail_url);
    const a = tidy({ t: ty === "VIDEO" ? "video" : ty === "CAROUSEL_ALBUM" ? "post" : "image", url: full || th, prev: th && th !== (full || th) ? th : "", link, owner: un ? "@" + un : "", mediaId: String(m.id), state: full || th ? "ok" : "unknown" });
    // media_url fehlt bei lizenzierter Musik bzw. gesperrtem Download → nur in der App teilen
    return { id: "ig:t:" + m.id, kind: "mention", sub: "tag", from: { name: un || "Instagram-Nutzer", handle: un ? "@" + un : "" }, text: clipT(m.caption, 2000), label: "📸 hat dich in einem Beitrag markiert", at: m.timestamp || "", mine: false,
      media: [a], links: link ? { app: link, web: link } : {}, can: { reply: false, like: false, story: full ? "app+reupload" : "app" }, ref: { mediaId: String(m.id), owner: un, mediaUrl: full, mediaType: ty } };
  }
  function fbTagItem(p) {
    const link = linkOf(p.permalink_url), pic = urlOf(p.full_picture);
    return { id: "fb:t:" + p.id, kind: "mention", sub: "tag", from: p.from && p.from.name ? { name: p.from.name, id: String(p.from.id || "") } : { name: "Jemand" }, text: clipT(p.message, 2000), label: "🏷 hat deine Seite markiert", at: p.created_time || "", mine: false,
      media: pic ? [tidy({ t: "image", url: pic, link, state: "ok" })] : undefined, links: link ? { web: link } : {}, replies: [], can: { reply: true, like: false, story: false }, ref: { comment: String(p.id) } };
  }
  // Facebook-Kommentar mit Sticker, Foto, GIF oder Link-Vorschau
  function fbAtt(a) {
    if (!a) return null; const ty = String(a.type || "").toLowerCase(), im = (a.media && a.media.image) || {}, src = urlOf(im.src), vid = urlOf(a.media && a.media.source), link = urlOf(a.target && a.target.url) || urlOf(a.url);
    if (!src && !link) return null;
    return tidy({ t: /sticker/.test(ty) ? "sticker" : /animated|gif/.test(ty) ? "gif" : vid && /video/.test(ty) ? "video" : src ? "image" : "link", url: vid && /video/.test(ty) ? vid : src, prev: vid && /video/.test(ty) ? src : "", w: +im.width, h: +im.height,
      link: /facebook\.com/.test(link) ? "" : link, title: clipT(a.title || a.description, 300), state: "ok" });
  }
  // Threads-Antwort mit Bild/Video
  function thAtt(c) {
    const ty = String(c.media_type || "").toUpperCase(), url = urlOf(c.media_url), th = urlOf(c.thumbnail_url);
    if (ty === "IMAGE" && url) return [tidy({ t: "image", url, state: "ok" })];
    if (ty === "VIDEO" && url) return [tidy({ t: "video", url, prev: th, state: "ok" })];
    if (ty === "CAROUSEL_ALBUM" && (url || th)) return [tidy({ t: "image", url: url || th, state: "ok" })];
    return undefined;
  }
  // Bluesky: fertige Embed-Ansichten aus getPosts (Bilder, Video, Link-Karte, Zitat) – öffentliche Adressen, lädt das Cockpit direkt
  function bskyAtts(e, out) {
    out = out || []; if (!e) return out; const ty = String(e.$type || ""), ar = v => v && v.aspectRatio || {};
    if (/(images|gallery)#view$/.test(ty)) (e.images || e.items || []).slice(0, 4).forEach(im => out.push(tidy({ t: "image", url: urlOf(im.fullsize), prev: urlOf(im.thumb), w: +ar(im).width, h: +ar(im).height, title: clipT(im.alt, 300), state: "ok" })));
    else if (/video#view$/.test(ty)) out.push(tidy({ t: "video", prev: urlOf(e.thumbnail), hls: urlOf(e.playlist), w: +ar(e).width, h: +ar(e).height, title: clipT(e.alt, 300), state: "ok" }));
    else if (/external#view$/.test(ty)) { const x = e.external || {}; out.push(tidy({ t: "link", link: urlOf(x.uri), title: clipT(x.title || x.uri, 300), prev: urlOf(x.thumb), state: "ok" })); }
    else if (/recordWithMedia#view$/.test(ty)) { bskyAtts(e.media, out); bskyQuote(e.record && e.record.record, out); }
    else if (/record#view$/.test(ty)) bskyQuote(e.record, out);
    return out;
  }
  function bskyQuote(r, out) {
    if (!r) return; const ty = String(r.$type || "");
    if (/viewNotFound$/.test(ty)) return out.push({ t: "quote", state: "gone", title: "Zitierter Beitrag wurde gelöscht" });
    if (/viewBlocked$/.test(ty)) return out.push({ t: "quote", state: "gone", title: "Zitierter Beitrag ist blockiert" });
    if (/viewDetached$/.test(ty)) return out.push({ t: "quote", state: "gone", title: "Zitat wurde vom Autor gelöst" });
    if (!/viewRecord$/.test(ty)) return;
    const h = r.author && r.author.handle || "", rk = String(r.uri || "").split("/").pop(), im = ((r.embeds || [])[0] || {});
    out.push(tidy({ t: "quote", title: clipT(r.value && r.value.text, 300), owner: h ? "@" + h : "", link: h ? linkOf("https://bsky.app/profile/" + h + "/post/" + rk) : "", prev: urlOf(im.images && im.images[0] && im.images[0].thumb || im.thumbnail), state: "ok" }));
  }
  const bskyThumb = e => { const a = bskyAtts(e, []).find(x => x.t === "image" || x.t === "video"); return a ? a.prev || a.url || "" : ""; };
  async function inbox(platform, ch, tok, o) {
    // o: { posts, prev (Einträge des letzten Stands dieses Kanals), st (Feldstufen/Abrufzeiten je Kanal, wird verändert), msgx (Einzelabrufe je Nachrichten-ID, wird ergänzt) }
    o = o || {}; const nPosts = o.posts || 25, st = o.st || {};
    if (platform === "instagram") {
      const t = tok.access, me = String(ch.account.handle || "").replace(/^@/, "").toLowerCase(), out = { items: [], posts: [], notes: [] };
      // Nachrichten (mit Feldleiter) und Markierungen parallel zu Beiträgen/Kommentaren laden (unabhängig voneinander)
      const cvJob = ladder(st, "msgLvl", IG_MSG, f => pages(B.ig + "/" + GV + "/me/conversations" + q({ platform: "instagram", fields: "id,updated_time,participants,messages.limit(50){" + f + "}", limit: "25", access_token: t }), 4)).then(l => ({ l }), e => ({ e }));
      const tagJob = tagsOf(st, "tags", "ig:t:", o.prev, async () => ((await get(B.ig + "/" + GV + "/" + ch.account.id + "/tags" + q({ fields: "id,username,caption,media_type,media_url,thumbnail_url,permalink,timestamp", limit: "25", access_token: t }))).data || []).map(igTagItem),
        s => s.perm ? "Markierungen in fremden Beiträgen: mit dem Instagram-Login nicht abrufbar – die siehst du in der App." : "Markierungen: " + s.err);
      const media = (await get(B.ig + "/" + GV + "/" + ch.account.id + "/media" + q({ fields: "id,caption,timestamp,permalink,media_type,thumbnail_url,media_url,like_count,comments_count", limit: String(nPosts), access_token: t }))).data || [];
      // Kommentare nur für Beiträge mit Kommentaren, je Beitrag eine Anfrage – höchstens 4 gleichzeitig
      const cms = await mapLimit(media, PAR, m => m.comments_count ? get(B.ig + "/" + GV + "/" + m.id + "/comments" + q({ fields: "id,username,text,timestamp,like_count,replies.limit(50){id,username,text,timestamp}", limit: "100", access_token: t })) : null);
      media.forEach((m, mi) => {
        const post = { id: m.id, text: clipT(m.caption, 140), url: m.permalink || "", thumb: m.thumbnail_url || m.media_url || "", at: m.timestamp || "" };
        out.posts.push(Object.assign({ likes: m.like_count || 0, comments: m.comments_count || 0 }, post));
        const r = cms[mi]; if (!r) return;
        (r.data || []).forEach(c => out.items.push({ id: "ig:c:" + c.id, kind: "comment", from: { name: c.username || "", handle: c.username ? "@" + c.username : "" }, text: c.text || "", at: c.timestamp || "", likes: c.like_count || 0,
          mine: String(c.username || "").toLowerCase() === me, post, replies: ((c.replies && c.replies.data) || []).map(x => ({ from: { name: x.username || "", handle: x.username ? "@" + x.username : "" }, text: x.text || "", at: x.timestamp || "", mine: String(x.username || "").toLowerCase() === me })).sort((a, b) => a.at < b.at ? -1 : 1),
          can: { reply: true, like: false }, ref: { comment: c.id } }));
      });
      try {
        const cv = await cvJob; if (cv.e) throw cv.e;
        (await convItems(cv.l, { o, base: B.ig + "/" + GV, t, poor: (st.msgLvl || {}).n >= 2, detail: "story,shares,attachments",
          isMine: x => String(x.from && x.from.id) === String(ch.account.id) || String(x.from && x.from.username || "").toLowerCase() === me,
          nameOf: (x, other) => (x.from && (x.from.username || x.from.name)) || other.username || "",
          other: c => ((c.participants && c.participants.data) || []).find(p => String(p.id) !== String(ch.account.id) && String(p.username || "").toLowerCase() !== me) || {},
          // ig.me öffnet die Unterhaltung in der Instagram-App (dort „Zu deiner Story hinzufügen“), sonst das Profil
          item: (c, other) => { const un = /^[\w.]{1,30}$/.test(other.username || "") ? other.username : "";
            return { id: "ig:m:" + c.id, kind: "message", from: { name: other.username || other.name || "Instagram-Nutzer", handle: un ? "@" + un : "", id: other.id || "" }, at: c.updated_time || "",
              links: un ? { app: "https://ig.me/m/" + un, web: "https://www.instagram.com/" + un + "/" } : {}, can: { reply: !!other.id, like: false }, ref: { recipient: other.id || "" } }; } })).forEach(i => out.items.push(i));
        if ((st.msgLvl || {}).n > 0 && !st.msgLvlTold) { st.msgLvlTold = 1; console.log("marketing: Instagram-Nachrichten mit Feldstufe L" + (st.msgLvl.n + 1)); }
      } catch (e) { out.notes.push(permNote(e, "Instagram-Nachrichten")); }
      const tg = await tagJob; tg.items.forEach(i => out.items.push(i)); if (tg.note) out.notes.push(tg.note);
      return out;
    }
    if (platform === "facebook") {
      const t = tok.access, pid = ch.account.id, out = { items: [], posts: [], notes: [] };
      // Messenger: alle vier Ordner gleichzeitig und parallel zu den Beiträgen (Fehler im Hauptordner → Hinweis wie bisher, andere Ordner sind freiwillig)
      // Ordner: „pending“ = Nachrichtenanfrage, „other“ = gefiltert; mit Feldleiter (Hauptordner zuerst, ist die Stufe bekannt, alle gleichzeitig)
      const FOLDERS = ["inbox", "other", "pending", "page_done"];
      const fbConv = (folder, f) => pages(B.fb + "/" + GV + "/" + pid + "/conversations" + q({ platform: "messenger", folder, fields: "id,updated_time,participants,messages.limit(50){" + f + "}", limit: "25", access_token: t }), 4);
      const lv0 = st.msgLvl && Date.now() - st.msgLvl.at < 7 * H24 ? Math.min(st.msgLvl.n, FB_MSG.length - 1) : -1;
      const cvJob = (async () => {
        const restAt = n => Promise.all(FOLDERS.slice(1).map(folder => fbConv(folder, FB_MSG[n]).catch(() => [])));
        const early = lv0 >= 0 ? restAt(lv0) : null, inb = await ladder(st, "msgLvl", FB_MSG, f => fbConv("inbox", f));
        return [inb].concat(early && st.msgLvl.n === lv0 ? await early : await restAt(st.msgLvl.n));
      })().then(l => ({ l }), e => ({ e }));
      const tagJob = tagsOf(st, "tagged", "fb:t:", o.prev, async () => ((await get(B.fb + "/" + GV + "/" + pid + "/tagged" + q({ fields: "id,message,created_time,permalink_url,full_picture,from", limit: "25", access_token: t }))).data || []).map(fbTagItem),
        s => s.perm ? "Facebook-Markierungen: Berechtigung fehlt (pages_read_user_content) – Konto unter Kanäle neu verbinden." : "Facebook-Markierungen: " + s.err);
      // Kommentare mit Anhang (Sticker, Foto, GIF): Feld „attachment“ – lehnt Facebook es ab, ohne
      const CM_F = ["id,message,from,created_time,like_count,parent,attachment", "id,message,from,created_time,like_count,parent"];
      const ps = await ladder(st, "cmLvl", CM_F, async f => (await get(B.fb + "/" + GV + "/" + pid + "/posts" + q({ fields: "id,message,created_time,permalink_url,full_picture,reactions.summary(total_count).limit(0),comments.summary(true).filter(stream).order(reverse_chronological).limit(100){" + f + "}", limit: String(nPosts), access_token: t }))).data || []);
      for (const p of ps) {
        const post = { id: p.id, text: clipT(p.message, 140), url: p.permalink_url || "", thumb: p.full_picture || "", at: p.created_time || "" }, cm = (p.comments && p.comments.data) || [];
        out.posts.push(Object.assign({ likes: (p.reactions && p.reactions.summary && p.reactions.summary.total_count) || 0, comments: (p.comments && p.comments.summary && p.comments.summary.total_count) || cm.length }, post));
        const top = cm.filter(c => !c.parent), sub = cm.filter(c => c.parent), isMe = c => String(c.from && c.from.id) === String(pid);
        top.forEach(c => { const a = fbAtt(c.attachment), media = a ? [a] : undefined;
          out.items.push(Object.assign({ id: "fb:c:" + c.id, kind: "comment", from: { name: (c.from && c.from.name) || "Facebook-Nutzer", id: c.from && c.from.id || "" }, text: c.message || "", at: c.created_time || "", likes: c.like_count || 0, mine: isMe(c), post,
            replies: sub.filter(x => x.parent && x.parent.id === c.id).map(x => ({ from: { name: (x.from && x.from.name) || "" }, text: x.message || (x.attachment ? labelOf([fbAtt(x.attachment)].filter(Boolean)) : ""), at: x.created_time || "", mine: isMe(x) })).sort((a, b) => a.at < b.at ? -1 : 1),
            can: { reply: true, like: true }, ref: { comment: c.id } }, media ? { media, label: c.message ? "" : labelOf(media) } : {})); });
      }
      try {
        const seenCv = new Set(), cvAll = [], cv = await cvJob; if (cv.e) throw cv.e;
        cv.l.forEach((l, k) => l.forEach(c => { if (!seenCv.has(c.id)) { seenCv.add(c.id); c._folder = FOLDERS[k]; cvAll.push(c); } }));
        (await convItems(cvAll, { o, base: B.fb + "/" + GV, t, poor: (st.msgLvl || {}).n >= 2, detail: "shares,attachments,sticker",
          isMine: x => String(x.from && x.from.id) === String(pid), nameOf: (x, other) => (x.from && x.from.name) || other.name || "",
          other: c => ((c.participants && c.participants.data) || []).find(p => String(p.id) !== String(pid)) || {},
          item: (c, other) => Object.assign({ id: "fb:m:" + c.id, kind: "message", from: { name: other.name || "Facebook-Nutzer", id: other.id || "" }, at: c.updated_time || "",
            links: { web: "https://business.facebook.com/latest/inbox/all" }, can: { reply: !!other.id, like: false }, ref: { recipient: other.id || "" } }, c._folder === "pending" || c._folder === "other" ? { request: true } : {}, c._folder === "other" ? { filtered: true } : {}) })).forEach(i => out.items.push(i));
      } catch (e) { out.notes.push(permNote(e, "Messenger-Nachrichten")); }
      const tg = await tagJob; tg.items.forEach(i => out.items.push(i)); if (tg.note) out.notes.push(tg.note);
      return out;
    }
    if (platform === "threads") {
      const t = tok.access, me = String(ch.account.handle || "").replace(/^@/, "").toLowerCase(), out = { items: [], posts: [], notes: [] };
      // Threads liefert keine Antwortzahl je Beitrag → Antworten der 15 neuesten Beiträge abfragen, höchstens 4 gleichzeitig
      const th = ((await get(B.th + "/v1.0/me/threads" + q({ fields: "id,text,permalink,timestamp,media_url,thumbnail_url", limit: String(Math.min(nPosts, 15)), access_token: t }))).data || []).slice(0, 15);
      let bad = null;   // fehlt die Berechtigung, nicht noch 14 weitere Male fragen
      // Antworten mit Bild/Video (media_type/media_url); kennt Threads die Felder nicht, ohne (Stufe je Kanal gemerkt)
      const RP_F = ["id,text,username,timestamp,permalink,media_type,media_url,thumbnail_url", "id,text,username,timestamp"];
      const rp = (p, f) => get(B.th + "/v1.0/" + p.id + "/replies" + q({ fields: f, reverse: "false", access_token: t }));
      const rr = await mapLimit(th, PAR, (p, k) => bad ? { e: bad } : (k ? rp(p, RP_F[(st.rpLvl || {}).n || 0]).catch(e => fieldErr(e) ? rp(p, RP_F[1]) : Promise.reject(e)) : ladder(st, "rpLvl", RP_F, f => rp(p, f))).then(r => ({ rs: r.data || [] }), e => { bad = bad || e; return { e }; }));
      for (let pi = 0; pi < th.length; pi++) {
        const p = th[pi], post = { id: p.id, text: clipT(p.text, 140), url: p.permalink || "", thumb: p.thumbnail_url || p.media_url || "", at: p.timestamp || "" };
        if (rr[pi].e) { out.notes.push(permNote(rr[pi].e, "Threads-Antworten")); break; } const rs = rr[pi].rs;
        out.posts.push(Object.assign({ likes: null, comments: rs.length }, post));
        rs.forEach(c => { const media = thAtt(c); out.items.push(Object.assign({ id: "th:c:" + c.id, kind: "comment", from: { name: c.username || "", handle: c.username ? "@" + c.username : "" }, text: c.text || "", at: c.timestamp || "", mine: String(c.username || "").toLowerCase() === me, post, replies: [], can: { reply: true, like: false }, ref: { replyTo: c.id } },
          media ? { media, label: c.text ? "" : labelOf(media) } : {}, linkOf(c.permalink) ? { links: { web: linkOf(c.permalink) } } : {})); });
      }
      return out;
    }
    if (platform === "bluesky") {
      const t = tok.access, did = ch.account.id, out = { items: [], posts: [], notes: [] };
      const n = (await get(B.bsky + "/xrpc/app.bsky.notification.listNotifications" + q({ limit: "60" }), { token: t })).notifications || [];
      // eigene Beiträge (reasonSubject) und die Antworten/Erwähnungen/Zitate selbst (für Bilder, Video, Link-Karten, Zitate) – je Aufruf höchstens 25 Adressen
      const own = n.filter(x => /^(reply|mention|quote)$/.test(x.reason)).map(x => x.uri), subj = n.filter(x => x.reasonSubject).map(x => x.reasonSubject);
      const uris = [...new Set(subj.concat(own))].slice(0, 75), posts = {}, parts = []; for (let i = 0; i < uris.length; i += 25) parts.push(uris.slice(i, i + 25));
      await mapLimit(parts, 3, async part => { try { ((await get(B.bsky + "/xrpc/app.bsky.feed.getPosts?" + part.map(x => "uris=" + encodeURIComponent(x)).join("&"), { token: t })).posts || []).forEach(p => { posts[p.uri] = p; }); } catch (e) {} });
      const pOf = uri => { const p = posts[uri]; const rk = String(uri || "").split("/").pop(); return p ? { id: uri, text: clipT(p.record && p.record.text, 140), url: "https://bsky.app/profile/" + (tok.handle || did) + "/post/" + rk, thumb: urlOf(bskyThumb(p.embed)), at: p.indexedAt || "" } : null; };
      n.forEach(x => {
        const from = { name: (x.author && (x.author.displayName || x.author.handle)) || "", handle: x.author && x.author.handle ? "@" + x.author.handle : "", id: x.author && x.author.did || "" };
        if (x.reason === "like" || x.reason === "repost" || x.reason === "follow") out.items.push({ id: "bs:" + x.uri, kind: "like", sub: x.reason, from, text: x.reason === "like" ? "gefällt dein Beitrag" : x.reason === "repost" ? "hat deinen Beitrag geteilt" : "folgt dir jetzt", at: x.indexedAt || "", post: pOf(x.reasonSubject), isNew: !x.isRead, can: { reply: false, like: false } });
        else if (x.reason === "reply" || x.reason === "mention" || x.reason === "quote") {
          const rec = x.record || {}, root = rec.reply && rec.reply.root ? rec.reply.root : { uri: x.uri, cid: x.cid };
          const media = bskyAtts(posts[x.uri] && posts[x.uri].embed, []), h = x.author && x.author.handle || "", rp = x.reason !== "reply", web = h ? linkOf("https://bsky.app/profile/" + h + "/post/" + String(x.uri || "").split("/").pop()) : "";
          out.items.push(Object.assign({ id: "bs:" + x.uri, kind: x.reason === "reply" ? "comment" : "mention", from, text: rec.text || "", at: x.indexedAt || "", post: pOf(rec.reply && rec.reply.parent ? rec.reply.parent.uri : x.reasonSubject), isNew: !x.isRead, replies: [],
            can: { reply: true, like: true, repost: rp, quote: rp }, ref: { uri: x.uri, cid: x.cid, root } }, x.reason === "quote" ? { sub: "quote" } : {}, media.length ? { media, label: rec.text ? "" : labelOf(media) } : {}, web ? { links: { web } } : {}));
        }
      });
      return out;
    }
    if (platform === "youtube") {
      const t = tok.access, out = { items: [], posts: [], notes: [] };
      const r = await get(B.yt + "/youtube/v3/commentThreads" + q({ part: "snippet,replies", allThreadsRelatedToChannelId: ch.account.id, maxResults: "40", order: "time", textFormat: "plainText" }), { token: t });
      (r.items || []).forEach(it => { const s = it.snippet && it.snippet.topLevelComment && it.snippet.topLevelComment.snippet || {}, vid = it.snippet && it.snippet.videoId || "";
        const mine = c => String(c.authorChannelId && c.authorChannelId.value) === String(ch.account.id);
        out.items.push({ id: "yt:" + it.id, kind: "comment", from: { name: s.authorDisplayName || "" }, text: s.textOriginal || s.textDisplay || "", at: s.publishedAt || "", likes: s.likeCount || 0, mine: mine(s),
          post: vid ? { id: vid, text: "", url: "https://www.youtube.com/shorts/" + vid, thumb: "https://i.ytimg.com/vi/" + vid + "/default.jpg" } : null,
          replies: ((it.replies && it.replies.comments) || []).map(c => ({ from: { name: c.snippet.authorDisplayName || "" }, text: c.snippet.textOriginal || "", at: c.snippet.publishedAt || "", mine: mine(c.snippet) })).sort((a, b) => a.at < b.at ? -1 : 1),
          can: { reply: true, like: false }, ref: { parent: it.snippet.topLevelComment.id } }); });
      return out;
    }
    return { items: [], posts: [], notes: [(PLATFORMS[platform] || {}).label + ": Kommentare und Nachrichten gibt die Plattform über ihre Schnittstelle nicht heraus – bitte direkt in der App antworten."] };
  }
  // Kommentar löschen (Instagram, Facebook) bzw. ausblenden (Threads, YouTube: ablehnen) – Direktnachrichten lassen sich über keine Schnittstelle löschen
  async function inboxDelete(platform, ch, tok, ref, kind) {
    const t = tok.access; if (kind === "message") throw pubErr("Nachrichten lassen sich über die Schnittstelle nicht löschen.");
    if (kind !== "comment") throw pubErr("Löschen geht nur bei Kommentaren unter deinen Beiträgen.");   // Markierungen/Erwähnungen gehören anderen
    if (platform === "instagram" && ref.comment) return req("DELETE", B.ig + "/" + GV + "/" + ref.comment + q({ access_token: t }));
    if (platform === "facebook" && ref.comment) return req("DELETE", B.fb + "/" + GV + "/" + ref.comment + q({ access_token: t }));
    if (platform === "threads" && ref.replyTo) return req("POST", B.th + "/v1.0/" + ref.replyTo + "/manage_reply", { form: { hide: "true", access_token: t } });
    if (platform === "youtube" && ref.parent) return req("POST", B.yt + "/youtube/v3/comments/setModerationStatus" + q({ id: ref.parent, moderationStatus: "rejected" }), { token: t, okStatus: false });
    throw pubErr("Löschen ist hier über die Schnittstelle nicht möglich.");
  }
  async function inboxReply(platform, ch, tok, ref, text, kind) {
    const t = tok.access, msg = String(text || "").trim().slice(0, 2000); if (!msg) throw pubErr("Bitte einen Text eingeben.");
    if (platform === "instagram") {
      if (kind === "message") return req("POST", B.ig + "/" + GV + "/" + ch.account.id + "/messages", { json: { recipient: { id: ref.recipient }, message: { text: msg } }, token: t });
      return req("POST", B.ig + "/" + GV + "/" + ref.comment + "/replies", { form: { message: msg, access_token: t } });
    }
    if (platform === "facebook") {
      if (kind === "message") return req("POST", B.fb + "/" + GV + "/" + ch.account.id + "/messages" + q({ access_token: t }), { json: { recipient: { id: ref.recipient }, messaging_type: "RESPONSE", message: { text: msg } } });
      return req("POST", B.fb + "/" + GV + "/" + ref.comment + "/comments", { form: { message: msg, access_token: t } });
    }
    if (platform === "threads") {
      const c = await req("POST", B.th + "/v1.0/me/threads", { form: { media_type: "TEXT", text: msg.slice(0, 500), reply_to_id: ref.replyTo, access_token: t } });
      await igWait(B.th, c.id, t, "Threads", "v1.0").catch(() => {});
      return req("POST", B.th + "/v1.0/me/threads_publish", { form: { creation_id: c.id, access_token: t } });
    }
    if (platform === "bluesky") {
      return req("POST", B.bsky + "/xrpc/com.atproto.repo.createRecord", { token: t, json: { repo: ch.account.id, collection: "app.bsky.feed.post", record: { $type: "app.bsky.feed.post", text: msg.slice(0, 300), createdAt: new Date().toISOString(), langs: ["de"], facets: bskyFacets(msg.slice(0, 300)),
        reply: { root: { uri: ref.root.uri, cid: ref.root.cid }, parent: { uri: ref.uri, cid: ref.cid } } } } });
    }
    if (platform === "youtube") return req("POST", B.yt + "/youtube/v3/comments" + q({ part: "snippet" }), { token: t, json: { snippet: { parentId: ref.parent, textOriginal: msg } } });
    throw pubErr("Antworten ist hier nicht möglich.");
  }
  async function inboxLike(platform, ch, tok, ref) {
    if (platform === "facebook") return req("POST", B.fb + "/" + GV + "/" + ref.comment + "/likes", { form: { access_token: tok.access } });
    if (platform === "bluesky") return req("POST", B.bsky + "/xrpc/com.atproto.repo.createRecord", { token: tok.access, json: { repo: ch.account.id, collection: "app.bsky.feed.like", record: { $type: "app.bsky.feed.like", subject: { uri: ref.uri, cid: ref.cid }, createdAt: new Date().toISOString() } } });
    throw pubErr("Liken ist hier über die Schnittstelle nicht möglich.");
  }
  // Bluesky: Erwähnung bzw. Zitat reposten oder mit eigenem Text zitieren (Threads bräuchte die Erwähnungen – Berechtigung threads_manage_mentions fehlt noch)
  async function inboxRepost(platform, ch, tok, ref) {
    if (platform === "bluesky" && ref && ref.uri && ref.cid) return req("POST", B.bsky + "/xrpc/com.atproto.repo.createRecord", { token: tok.access, json: { repo: ch.account.id, collection: "app.bsky.feed.repost", record: { $type: "app.bsky.feed.repost", subject: { uri: ref.uri, cid: ref.cid }, createdAt: new Date().toISOString() } } });
    throw pubErr("Reposten ist hier über die Schnittstelle nicht möglich.");
  }
  async function inboxQuote(platform, ch, tok, ref, text) {
    const msg = Array.from(String(text || "").trim()).slice(0, 300).join(""); if (!msg) throw pubErr("Bitte einen Text eingeben.");
    if (platform === "bluesky" && ref && ref.uri && ref.cid) return req("POST", B.bsky + "/xrpc/com.atproto.repo.createRecord", { token: tok.access, json: { repo: ch.account.id, collection: "app.bsky.feed.post", record: { $type: "app.bsky.feed.post", text: msg, createdAt: new Date().toISOString(), langs: ["de"], facets: bskyFacets(msg),
      embed: { $type: "app.bsky.embed.record", record: { uri: ref.uri, cid: ref.cid } } } } });
    throw pubErr("Zitieren ist hier über die Schnittstelle nicht möglich.");
  }
  // Instagram-Story aus einer vom Server vorbereiteten Datei (öffentliche Adresse /m/s….jpg|mp4) – Urheber als Markierung (user_tags, seit 07/2025 auch bei Storys).
  // Lehnt Instagram die Markierung ab, ohne – mit Hinweis.
  async function igStory(ch, tok, m) {   // m: { image | video, user }
    const ig = ch.account.id, t = tok.access, P = form => req("POST", B.ig + "/" + GV + "/" + ig + "/" + (form.creation_id ? "media_publish" : "media"), { form: Object.assign({ access_token: t }, form) });
    const lim = e => /limit|too many|\(#(4|9|32|613)\)/i.test(String(e && e.message)) ? pubErr("Tageslimit für Instagram-Posts erreicht (100 je 24 Stunden) – morgen nochmal.", { status: 429 }) : e;
    const base = m.video ? { media_type: "STORIES", video_url: m.video } : { media_type: "STORIES", image_url: m.image };
    let c, note = "";
    try { c = (await P(Object.assign({}, base, m.user ? { user_tags: JSON.stringify([{ username: m.user }]) } : {}))).id; }
    catch (e) { if (e.auth || !m.user || !(e.status >= 400 && e.status < 500) || /limit/i.test(String(e.message))) throw lim(e); try { c = (await P(base)).id; } catch (e2) { throw lim(e2); } note = "Die Markierung von @" + m.user + " hat Instagram nicht übernommen – bitte in der App ergänzen."; }
    await igWait(B.ig, c, t, "Instagram");
    const pub = await P({ creation_id: c }).catch(e => { throw lim(e); });
    return { id: pub.id, note };
  }
  // Zugang prüfen, ohne etwas zu verändern: eine leichte Leseanfrage je Konto (tägliche Kontrolle in mkt-posts.js und „Verbindungen“)
  async function verify(platform, ch, tok) {
    const t = tok.access, o = { timeout: 15000 }, bearer = Object.assign({ token: t }, o);
    if (platform === "instagram") return req("GET", B.ig + "/" + GV + "/me" + q({ fields: "user_id,username", access_token: t }), o);
    if (platform === "facebook") return req("GET", B.fb + "/" + GV + "/me" + q({ fields: "id,name", access_token: t }), o);   // Seiten-Zugang → liefert die Seite
    if (platform === "threads") return req("GET", B.th + "/v1.0/me" + q({ fields: "id,username", access_token: t }), o);
    if (platform === "linkedin") return req("GET", B.li + "/v2/userinfo", bearer);
    if (platform === "youtube") return req("GET", B.yt + "/youtube/v3/channels" + q({ part: "id", mine: "true" }), bearer);
    if (platform === "tiktok" && tok.via === "zernio") {   // Schlüssel gültig (401 → neu verbinden) und TikTok bei Zernio noch verbunden
      const { j } = await zreq("GET", "/v1/accounts/" + encodeURIComponent(tok.account) + "/health", tok, { timeout: 15000 });
      if (j.status === "error" || (j.tokenStatus && j.tokenStatus.valid === false)) throw pubErr("TikTok (Zernio): Die TikTok-Verbindung bei Zernio ist abgelaufen – in Zernio TikTok neu verbinden.");
      return j;
    }
    if (platform === "tiktok") { const r = await req("GET", B.tt + "/v2/user/info/" + q({ fields: "open_id" }), bearer); const er = r && r.error; if (er && er.code && er.code !== "ok") throw pubErr("TikTok: " + (er.message || er.code), { auth: /token|auth/i.test(String(er.code)) }); return r; }
    if (platform === "pinterest") return req("GET", B.pin + "/v5/user_account", bearer);
    if (platform === "bluesky") return req("GET", B.bsky + "/xrpc/com.atproto.server.getSession", bearer);
    throw pubErr("Unbekannte Plattform");
  }
  return { PLATFORMS, PROVIDERS, CAN, authUrl, exchange, refresh, verify, bskyLogin, zernioLogin, publish, editRemote, removeRemote, commentsRemote, statsRemote, placeSearch, igMedia, igComments, inbox, inboxReply, inboxLike, inboxDelete,
    inboxRepost, inboxQuote, igStory, cdnOk, cdnFetch, linkOk: v => !!linkOf(v), labelOf, tiktokCreator, _test: { liText, bskyFacets, attsOf, labelOf, probe, PROBE, ttChunks } };
};
module.exports.PLATFORMS = PLATFORMS;
module.exports.PROVIDERS = PROVIDERS;
