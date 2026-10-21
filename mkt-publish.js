/* Marketing: Veröffentlichen über die offiziellen Schnittstellen (kostenlos) – Anmeldung (OAuth), Token erneuern, Posten.
   Plattformen: Instagram (Instagram-Login, graph.instagram.com), Facebook-Seite, Threads, LinkedIn (Profil), YouTube Shorts, TikTok (als Entwurf in die App),
   Pinterest, Bluesky (App-Passwort). X/Twitter kostet seit 2026 pro Post – nicht eingebaut.
   Medien holen Instagram/Facebook/Threads/Pinterest selbst über eine öffentliche Adresse (marketing.js: /m/…); LinkedIn, YouTube, TikTok und Bluesky bekommen die Datei hochgeladen.
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
  tiktok: { label: "TikTok", portal: "https://developers.tiktok.com/apps", hint: "TikTok-App mit Login Kit und Content Posting API (Upload). Videos landen als Entwurf in deiner TikTok-App – dort tippst du auf Posten (TikTok erlaubt direktes Posten erst nach einer Prüfung)." },
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
    return o.withHeaders ? { j, headers: r.headers, status: r.status } : j;
  }
  const q = o => "?" + new URLSearchParams(o).toString();

  // ───────────── Anmeldung (OAuth) ─────────────
  function authUrl(provider, c) {   // c: { clientId, redirect, state }
    const st = c.state, rd = c.redirect;
    switch (provider) {
      case "instagram": return B.igAuth + q({ client_id: c.clientId, redirect_uri: rd, response_type: "code", scope: "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments", state: st, enable_fb_login: "0", force_authentication: "1" });
      // Facebook Login for Business: Berechtigungen stehen in der Konfiguration (config_id), sonst klassisch per scope
      case "facebook": return B.fbAuth + q(c.configId ? { client_id: c.clientId, redirect_uri: rd, state: st, response_type: "code", config_id: c.configId, override_default_response_type: "true" }
        : { client_id: c.clientId, redirect_uri: rd, state: st, response_type: "code", scope: "pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement" });
      case "threads": return B.thAuth + q({ client_id: c.clientId, redirect_uri: rd, scope: "threads_basic,threads_content_publish", response_type: "code", state: st });
      case "linkedin": return B.liAuth + q({ response_type: "code", client_id: c.clientId, redirect_uri: rd, scope: "openid profile w_member_social", state: st });
      case "google": return B.gAuth + q({ client_id: c.clientId, redirect_uri: rd, response_type: "code", scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly", access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: st });
      case "tiktok": return B.ttAuth + q({ client_key: c.clientId, scope: "user.info.basic,video.upload", response_type: "code", redirect_uri: rd, state: st });
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
      return [{ platform: "tiktok", account: { id: a.open_id, name: name || "TikTok", handle: "" }, tok: { access: a.access_token, refresh: a.refresh_token, expiresAt: inSec(a.expires_in || 86400), refreshExpiresAt: inSec(a.refresh_expires_in || 31536000) } }];
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
  // Zugang auffrischen (vor dem Posten bzw. täglich). Liefert neue tok oder null (unverändert).
  async function refresh(platform, tok, c) {
    const left = tok.expiresAt ? Date.parse(tok.expiresAt) - Date.now() : Infinity;
    if (platform === "instagram" && left < 20 * 864e5) { const r = await req("GET", B.ig + "/refresh_access_token" + q({ grant_type: "ig_refresh_token", access_token: tok.access })); return Object.assign({}, tok, { access: r.access_token, expiresAt: inSec(r.expires_in || 5184000) }); }
    if (platform === "threads" && left < 20 * 864e5) { const r = await req("GET", B.th + "/refresh_access_token" + q({ grant_type: "th_refresh_token", access_token: tok.access })); return Object.assign({}, tok, { access: r.access_token, expiresAt: inSec(r.expires_in || 5184000) }); }
    if (platform === "youtube" && left < 5 * 60e3) { const r = await req("POST", B.gToken, { form: { client_id: c.clientId, client_secret: c.secret, refresh_token: tok.refresh, grant_type: "refresh_token" } }); return Object.assign({}, tok, { access: r.access_token, expiresAt: inSec(r.expires_in || 3600) }); }
    if (platform === "tiktok" && left < 30 * 60e3) { const r = await req("POST", B.tt + "/v2/oauth/token/", { form: { client_key: c.clientId, client_secret: c.secret, grant_type: "refresh_token", refresh_token: tok.refresh } }); if (r.error && r.error !== "ok") throw pubErr("TikTok: " + (r.error_description || r.error), { auth: true }); return Object.assign({}, tok, { access: r.access_token, refresh: r.refresh_token || tok.refresh, expiresAt: inSec(r.expires_in || 86400) }); }
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
      if (m.format === "reel") { const c = (await P(ig + "/media", { media_type: "REELS", video_url: m.video.url, caption: cap, share_to_feed: "true", cover_url: m.cover ? m.cover.url : "", location_id: loc, audio_name: full && m.audioName ? String(m.audioName).slice(0, 80) : "" })).id; await igWait(base, c, t, "Instagram"); return c; }
      if (m.images.length > 1) {
        const kids = []; for (const im of m.images.slice(0, 20)) kids.push((await P(ig + "/media", { image_url: im.url, is_carousel_item: "true", alt_text: alt })).id);
        for (const k of kids) await igWait(base, k, t, "Instagram");
        const c = (await P(ig + "/media", { media_type: "CAROUSEL", children: kids.join(","), caption: cap, location_id: loc })).id; await igWait(base, c, t, "Instagram"); return c;
      }
      const c = (await P(ig + "/media", { image_url: m.images[0].url, caption: cap, location_id: loc, alt_text: alt })).id; await igWait(base, c, t, "Instagram"); return c;
    };
    let creation, note = "";
    try { creation = await build(true); }
    catch (e) { if (e.auth || !(e.status >= 400 && e.status < 500)) throw e; creation = await build(false); note = "Instagram hat die Extras abgelehnt – schlicht gepostet (5 Hashtags, ohne Standort/Alt-Text)."; }
    const pub = await P(ig + "/media_publish", { creation_id: creation });
    let url = ""; try { url = (await req("GET", base + "/" + GV + "/" + pub.id + q({ fields: "permalink", access_token: t }))).permalink || ""; } catch (e) {}
    if (m.firstComment) { try { await P(pub.id + "/comments", { message: m.firstComment }); } catch (e) { note = (note ? note + " " : "") + "Erster Kommentar ging nicht (" + String(e.message || "").slice(0, 80) + ")."; } }
    return { id: pub.id, url, note };
  }
  async function facebook(ch, tok, m) {
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
    const uid = ch.account.id, t = tok.access, base = B.th + "/v1.0", P = (form) => req("POST", base + "/" + uid + "/threads", { form: Object.assign({ access_token: t }, form) });
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
    const r = await req("POST", B.li + "/rest/posts", { token: t, headers: H, withHeaders: true, json: { author: owner, commentary: liText(m.caption), visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, content, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false } });
    const urn = r.headers.get("x-restli-id") || (r.j && r.j.id) || "";
    return { id: urn, url: urn ? "https://www.linkedin.com/feed/update/" + urn + "/" : "" };
  }
  async function youtube(ch, tok, m) {
    const size = fs.statSync(m.video.file).size;
    const tags = (m.tags || []).map(s => s.replace(/^#/, "")).slice(0, 15);
    const meta = { snippet: { title: String(m.title || m.caption).slice(0, 100), description: String(m.caption).slice(0, 4900), tags, categoryId: m.ytCategory || "22", defaultLanguage: "de", defaultAudioLanguage: "zxx" }, status: { privacyStatus: "public", selfDeclaredMadeForKids: false, containsSyntheticMedia: false } };
    const init = await req("POST", B.ytUpload + "/youtube/v3/videos?uploadType=resumable&part=snippet,status", { token: tok.access, json: meta, withHeaders: true, headers: { "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(size) } });
    const loc = init.headers.get("location"); if (!loc) throw pubErr("YouTube hat keine Upload-Adresse geliefert.");
    const r = await fetch(loc, { method: "PUT", headers: { Authorization: "Bearer " + tok.access, "Content-Type": "video/mp4", "Content-Length": String(size) }, body: fs.readFileSync(m.video.file), signal: AbortSignal.timeout(600000) });
    const j = await r.json().catch(() => ({})); if (!r.ok || !j.id) throw pubErr("YouTube: Hochladen fehlgeschlagen (" + r.status + (j.error && j.error.message ? ": " + j.error.message : "") + ")", { auth: r.status === 401 });
    return { id: j.id, url: "https://www.youtube.com/shorts/" + j.id };
  }
  async function tiktok(ch, tok, m) {
    const size = fs.statSync(m.video.file).size, CH = 10 * 1024 * 1024, chunk = size < 5 * 1024 * 1024 ? size : CH, n = Math.max(1, Math.floor(size / chunk));
    const init = await req("POST", B.tt + "/v2/post/publish/inbox/video/init/", { token: tok.access, json: { source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunk, total_chunk_count: n } } });
    if (init.error && init.error.code && init.error.code !== "ok") throw pubErr("TikTok: " + (init.error.message || init.error.code), { auth: /token/i.test(init.error.code) });
    const d = init.data || {}, fd = fs.openSync(m.video.file, "r");
    try {
      for (let i = 0; i < n; i++) { const a = i * chunk, z = i === n - 1 ? size - 1 : a + chunk - 1, buf = Buffer.alloc(z - a + 1); fs.readSync(fd, buf, 0, buf.length, a);
        const r = await fetch(d.upload_url, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(buf.length), "Content-Range": "bytes " + a + "-" + z + "/" + size }, body: buf, signal: AbortSignal.timeout(300000) });
        if (!r.ok && r.status !== 206) throw pubErr("TikTok: Hochladen fehlgeschlagen (" + r.status + ")"); }
    } finally { fs.closeSync(fd); }
    let status = "";
    for (let i = 0; i < 24; i++) { const s = await req("POST", B.tt + "/v2/post/publish/status/fetch/", { token: tok.access, json: { publish_id: d.publish_id } }); status = s.data && s.data.status || ""; if (/SEND_TO_USER_INBOX|PUBLISH_COMPLETE/.test(status)) break; if (/FAILED/.test(status)) throw pubErr("TikTok: Verarbeitung fehlgeschlagen (" + (s.data.fail_reason || "") + ")"); await sleep(waitMs); }
    return { id: d.publish_id, url: "", draft: true, note: "Liegt als Entwurf in deiner TikTok-App – Text aus dem Cockpit kopieren („TikTok-Text kopieren“), einfügen und auf „Posten“ tippen." };
  }
  async function pinterest(ch, tok, m) {
    const ms = m.images.length > 1 ? { source_type: "multiple_image_urls", items: m.images.slice(0, 5).map(im => ({ url: im.url, title: String(m.title || "").slice(0, 100), description: String(m.caption).slice(0, 500), link: m.link || "" })) } : { source_type: "image_url", url: m.images[0].url };
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
    const r = await req("POST", B.bsky + "/xrpc/com.atproto.repo.createRecord", { token: t, json: { repo: did, collection: "app.bsky.feed.post", record: { $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString(), langs: ["de"], facets: bskyFacets(text), embed } } });
    const rkey = String(r.uri || "").split("/").pop();
    return { id: r.uri, url: "https://bsky.app/profile/" + (tok.handle || did) + "/post/" + rkey };
  }
  const RUN = { instagram, facebook, threads, linkedin, youtube, tiktok, pinterest, bluesky };
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
  return { PLATFORMS, PROVIDERS, authUrl, exchange, refresh, bskyLogin, publish, igMedia, igComments, _test: { liText, bskyFacets } };
};
module.exports.PLATFORMS = PLATFORMS;
module.exports.PROVIDERS = PROVIDERS;
