// Attrappe der Social-Media-Schnittstellen für test/mktpost.test.js: Instagram (Login + Graph), Facebook, Threads, LinkedIn, YouTube, TikTok, Pinterest, Bluesky.
// Prüft wie die echten Plattformen das Nötigste (Pflichtfelder, Token) und holt Bilder/Videos über die öffentliche Adresse ab (wie Instagram & Co.).
// Posteingang (test/inbox-anhaenge.test.js): nur wenn state.inbox gesetzt ist – Unterhaltungen mit Anhängen, Markierungen, Bluesky-Benachrichtigungen,
// dazu ein Medien-CDN unter /cdn/… (ok* = Bild/Video mit Range, gone* = 403, redir-ext = Weiterleitung auf fremden Host).
"use strict";
const http = require("http");
module.exports = function () {
  const S = { log: [], posts: [], fetched: [], uploads: {}, n: 1, failNext: {}, records: [], cdn: [], graph: [] };
  // Graph-Felder wie die echte Schnittstelle: nicht angefragte Felder fehlen in der Antwort
  const only = (msgs, fields) => (msgs || []).map(m => { const o = Object.assign({}, m); ["story", "shares", "reactions", "reply_to", "is_unsupported", "sticker"].forEach(k => { if (fields.indexOf(k) < 0) delete o[k]; }); return o; });
  const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7), Buffer.from([0xff, 0xd9])]);
  const id = p => p + (S.n++);
  const server = http.createServer((req, res) => {
    const ch = []; req.on("data", d => ch.push(d)); req.on("end", async () => {
      const raw = Buffer.concat(ch), u = new URL(req.url, "http://x"), p = u.pathname, auth = req.headers.authorization || "";
      let form = {}; if (/x-www-form-urlencoded/.test(req.headers["content-type"] || "")) form = Object.fromEntries(new URLSearchParams(raw.toString()));
      let json = {}; if (/json/.test(req.headers["content-type"] || "")) { try { json = JSON.parse(raw.toString() || "{}"); } catch (e) {} }
      const q = Object.fromEntries(u.searchParams), all = Object.assign({}, q, form);
      S.log.push(req.method + " " + p);
      const end = (c, o, h) => { res.writeHead(c, Object.assign({ "Content-Type": "application/json" }, h || {})); res.end(typeof o === "string" ? o : JSON.stringify(o || {})); };
      const pull = async url => { const r = await fetch(url); S.fetched.push({ url, status: r.status, type: r.headers.get("content-type") }); if (!r.ok) throw new Error("fetch " + r.status); return Buffer.from(await r.arrayBuffer()); };
      try {
        const fk = Object.keys(S.failNext).find(k => p.indexOf(k) > -1 && (!S.failNext[k].method || S.failNext[k].method === req.method)); if (fk) { const m = S.failNext[fk]; if ((m.times || 1) > 1) m.times--; else delete S.failNext[fk]; return end(m.status || 400, { error: { message: m.message || "Fehler" } }); }
        // ── Medien-CDN (lookaside/fbcdn-Ersatz): Range, abgelaufene Links (403), Weiterleitungen ──
        if (p.indexOf("/cdn/") === 0) {
          const f = p.slice(5); S.cdn.push({ f, range: req.headers.range || "" });
          if (/^gone/.test(f)) return end(403, { error: { message: "URL signature expired" } });
          if (f === "redir-ext") { res.writeHead(302, { Location: "http://example.invalid/x.jpg" }); return res.end(); }
          if (f === "redir-ok") { res.writeHead(302, { Location: "/cdn/ok-redirected.jpg" }); return res.end(); }
          const type = /\.mp4$/.test(f) ? (/audio/.test(f) ? "audio/mp4" : "video/mp4") : /\.png$/.test(f) ? "image/png" : /\.gif$/.test(f) ? "image/gif" : /\.pdf$/.test(f) ? "application/pdf" : /\.html$/.test(f) ? "text/html" : "image/jpeg", rg = String(req.headers.range || "").match(/^bytes=(\d+)-(\d*)$/);
          const B0 = (S.cdnFiles || {})[f] || JPG;   // echte Bilder (z. B. für ffmpeg) legt der Test in state.cdnFiles ab
          if (rg) { const a = +rg[1], z = Math.min(B0.length - 1, rg[2] ? +rg[2] : B0.length - 1); res.writeHead(206, { "Content-Type": type, "Content-Range": "bytes " + a + "-" + z + "/" + B0.length, "Content-Length": z - a + 1 }); return res.end(B0.slice(a, z + 1)); }
          res.writeHead(200, { "Content-Type": type, "Content-Length": B0.length }); return res.end(B0);
        }
        // ── Posteingang (nur mit state.inbox) ──
        const IB = S.inbox;
        if (IB && req.method === "GET") {
          const fields = String(u.searchParams.get("fields") || ""); let mm;
          if (p === "/ig/v26.0/me/conversations" || p === "/fb/v26.0/pg1/conversations") {
            const fb = p.indexOf("/fb/") === 0, rej = fb ? IB.fbReject : IB.igReject; S.graph.push({ p, fields, folder: u.searchParams.get("folder") || "" });
            if (rej && rej.test(fields)) return end(400, { error: { message: "(#100) Tried accessing nonexisting field (" + fields.match(rej)[0] + ") on node type (Message)", type: "OAuthException", code: 100 } });
            const list = fb ? (IB.fbConv[u.searchParams.get("folder")] || []) : IB.igConv;
            return end(200, { data: list.map(c => Object.assign({}, c, { messages: { data: only(c.messages.data, fields).filter(m => !(IB.dropAtt || []).includes(m.id) || (delete m.attachments, true)) } })) });
          }
          if ((mm = p.match(/^\/(ig|fb)\/v26\.0\/(mx\w+)$/))) { S.graph.push({ p, fields }); const d = (IB.detail || {})[mm[2]]; return d ? end(200, Object.assign({ id: mm[2] }, d)) : end(404, { error: { message: "Unsupported get request" } }); }
          if (p === "/ig/v26.0/1784/tags") { S.graph.push({ p, fields }); return IB.tagsErr ? end(400, { error: { message: IB.tagsErr, type: "OAuthException" } }) : end(200, { data: IB.tags || [] }); }
          if (p === "/fb/v26.0/pg1/tagged") { S.graph.push({ p, fields }); return end(200, { data: IB.fbTagged || [] }); }
          if (p === "/fb/v26.0/pg1/posts") { S.graph.push({ p, fields }); return IB.fbCmReject && IB.fbCmReject.test(fields) ? end(400, { error: { message: "(#100) Tried accessing nonexisting field (attachment)" } }) : end(200, { data: IB.fbPosts || [] }); }
          if (p === "/th/v1.0/me/threads") return end(200, { data: IB.thPosts || [] });
          if ((mm = p.match(/^\/th\/v1\.0\/(\w+)\/replies$/))) { S.graph.push({ p, fields }); return IB.thReject && IB.thReject.test(fields) ? end(400, { error: { message: "(#100) Tried accessing nonexisting field (media_type)" } }) : end(200, { data: (IB.thReplies || {})[mm[1]] || [] }); }
          if (p === "/bsky/xrpc/app.bsky.notification.listNotifications") return end(200, { notifications: IB.bsNotifs || [] });
          if (p === "/bsky/xrpc/app.bsky.feed.getPosts") { const us = u.searchParams.getAll("uris"); S.graph.push({ p, n: us.length }); if (us.length > 25) return end(400, { message: "too many uris" }); return end(200, { posts: us.map(x => (IB.bsPosts || {})[x]).filter(Boolean) }); }
        }
        // ── Instagram ──
        if (p === "/igapi/oauth/access_token") return all.code === "code-ig" ? end(200, { access_token: "ig-short", user_id: "1784" }) : end(400, { error_message: "bad code" });
        if (p === "/ig/access_token") return end(200, { access_token: "ig-long", expires_in: 5184000 });
        if (p === "/ig/refresh_access_token") return end(200, { access_token: "ig-long-2", expires_in: 5184000 });
        if (p === "/ig/v26.0/me") return end(200, { user_id: "1784", username: "kochdu.at", name: "kochdu" });
        if (/^\/ig\/v26\.0\/1784\/media$/.test(p) && req.method === "GET") return end(200, { data: [{ id: "m-giveaway", caption: "Gewinnspiel! Markiere einen Freund", timestamp: "2026-10-15T10:00:00+0000", permalink: "https://instagram.com/p/gw", media_type: "IMAGE", media_url: "", comments_count: 6 }] });
        if (p === "/ig/v26.0/m-giveaway/comments") {
          if (all.access_token !== "ig-long" && all.access_token !== "ig-long-2") return end(401, { error: { message: "Invalid OAuth access token" } });
          const page = u.searchParams.get("after") === "2" ? 2 : 1, base = "http://" + req.headers.host + p + "?" + new URLSearchParams({ access_token: all.access_token, after: "2" });
          if (page === 1) return end(200, { data: [
            { id: "c1", username: "lisa.montafon", text: "Ich will! @anna.k", timestamp: "2026-10-15T11:00:00+0000", replies: { data: [{ id: "r1", username: "anna.k", text: "@lisa.montafon danke", timestamp: "2026-10-15T11:05:00+0000" }] } },
            { id: "c2", username: "markus_b", text: "Super", timestamp: "2026-10-15T12:00:00+0000" },
            { id: "c3", username: "lisa.montafon", text: "nochmal @tom @eva", timestamp: "2026-10-16T09:00:00+0000" } ], paging: { next: base } });
          return end(200, { data: [{ id: "c4", username: "kochdu.at", text: "Viel Glück @alle", timestamp: "2026-10-16T10:00:00+0000" }, { id: "c5", username: "spaet", text: "@x zu spät", timestamp: "2026-10-25T10:00:00+0000" }, { id: "c6", username: "sepp", text: "#kochdu @freund", timestamp: "2026-10-17T10:00:00+0000" }] });
        }
        let m;
        if ((m = p.match(/^\/ig\/v26\.0\/(igpost\d+)\/comments$/)) && req.method === "POST") { S.comments = (S.comments || []).concat([{ pf: "instagram", on: m[1], text: all.message }]); return end(200, { id: id("cm") }); }
        if ((m = p.match(/^\/fb\/v26\.0\/([\w]+)\/comments$/)) && req.method === "POST") { S.comments = (S.comments || []).concat([{ pf: "facebook", on: m[1], text: all.message }]); return end(200, { id: id("cm") }); }
        if ((m = p.match(/^\/ig\/v26\.0\/1784\/media$/)) && req.method === "POST") {
          S.igParams = (S.igParams || []).concat([Object.assign({}, all, { access_token: undefined })]);
          if (all.location_id && all.location_id !== "106097539419617") return end(400, { error: { message: "Invalid location_id" } });
          if (all.access_token !== "ig-long" && all.access_token !== "ig-long-2") return end(401, { error: { message: "Invalid OAuth access token" } });
          if (all.media_type === "CAROUSEL") { if (!all.children || all.children.split(",").length < 2) return end(400, { error: { message: "children fehlt" } }); return end(200, { id: id("cc") }); }
          if (all.media_type === "REELS") { if (!all.video_url) return end(400, { error: { message: "video_url fehlt" } }); const b = await pull(all.video_url); S.uploads.igVideo = b.length; if (all.cover_url) await pull(all.cover_url); return end(200, { id: id("cr") }); }
          if ((String(all.caption || "").match(/#\w+/g) || []).length > 5) return end(400, { error: { message: "The caption contains more than the maximum allowed number of hashtags." } });
          if (!all.image_url) return end(400, { error: { message: "image_url fehlt" } }); const ib = await pull(all.image_url); if (all.media_type === "STORIES") S.storyBuf = ib; return end(200, { id: id("ci") });
        }
        if ((m = p.match(/^\/ig\/v26\.0\/(c[a-z]*\d+)$/))) return end(200, { status_code: "FINISHED" });
        if (p === "/ig/v26.0/1784/media_publish") { const pid = id("igpost"); S.posts.push({ pf: "instagram", id: pid, creation: all.creation_id }); return end(200, { id: pid }); }
        if ((m = p.match(/^\/ig\/v26\.0\/(igpost\d+)$/))) return end(200, { permalink: "https://www.instagram.com/p/" + m[1] + "/" });
        // ── Facebook ──
        if (p === "/fb/v26.0/oauth/access_token") return end(200, all.grant_type === "fb_exchange_token" ? { access_token: "fb-user-long" } : { access_token: "fb-user-short" });
        if (p === "/fb/v26.0/me/accounts") return end(200, { data: [{ id: "pg1", name: "kochdu", access_token: "pg1-tok" }, { id: "pg2", name: "FS Creative", access_token: "pg2-tok" }] });
        if (p === "/fb/v26.0/pg1/photos") { if (all.access_token !== "pg1-tok") return end(401, { error: { message: "token" } }); await pull(all.url); const pid = id("ph"); if (all.published === "false") return end(200, { id: pid }); S.posts.push({ pf: "facebook", id: "pg1_" + pid, caption: all.caption }); return end(200, { id: pid, post_id: "pg1_" + pid }); }
        if (p === "/fb/v26.0/pg1/feed") { const n = Object.keys(all).filter(k => /^attached_media/.test(k)).length; const pid = "pg1_" + id("f"); S.posts.push({ pf: "facebook", id: pid, images: n, message: all.message, place: all.place || "" }); return end(200, { id: pid }); }
        if ((m = p.match(/^\/fb\/v26\.0\/(pg1_[a-z]*\d+)$/))) return end(200, { permalink_url: "https://www.facebook.com/" + m[1] });
        // ── Threads ──
        if (p === "/th/oauth/access_token") return end(200, { access_token: "th-short", user_id: "th1" });
        if (p === "/th/access_token") return end(200, { access_token: "th-long", expires_in: 5184000 });
        if (p === "/th/v1.0/me") return end(200, { id: "th1", username: "kochdu.at" });
        if (p === "/th/v1.0/th1/threads") { if (all.image_url) await pull(all.image_url); if (all.video_url) await pull(all.video_url); if (String(all.text || "").length > 500) return end(400, { error: { message: "Text zu lang" } }); return end(200, { id: id("tc") }); }
        if ((m = p.match(/^\/th\/v26\.0\/(tc\d+)$/)) || (m = p.match(/^\/th\/v1\.0\/(tc\d+)$/))) return end(200, { status: "FINISHED" });
        if (p === "/th/v1.0/th1/threads_publish") { const pid = id("thp"); S.posts.push({ pf: "threads", id: pid }); return end(200, { id: pid }); }
        if ((m = p.match(/^\/th\/v1\.0\/(thp\d+)$/))) return end(200, { permalink: "https://www.threads.net/@kochdu.at/post/" + m[1] });
        // ── LinkedIn ──
        if (p === "/li/rest/images") { if (!/^Bearer li-tok/.test(auth) || req.headers["linkedin-version"] !== "202610") return end(401, { message: "auth/version" }); const n = id("img"); return end(200, { value: { uploadUrl: "http://" + req.headers.host + "/liup/" + n, image: "urn:li:image:" + n } }); }
        if (p.indexOf("/liup/") === 0) { S.uploads[p] = raw.length; return end(201, "", { etag: "e-" + p.split("/").pop() }); }
        if (p === "/li/rest/posts") { const c = json.content || {}; S.posts.push({ pf: "linkedin", author: json.author, commentary: json.commentary, images: c.multiImage ? c.multiImage.images.length : c.media ? 1 : 0 }); return end(201, "", { "x-restli-id": "urn:li:share:" + id("") }); }
        // ── Bluesky ──
        if (p === "/bsky/xrpc/com.atproto.server.createSession") return json.password === "app-pass-1" ? end(200, { did: "did:plc:kd", handle: "kochdu.bsky.social", accessJwt: "bs-acc", refreshJwt: "bs-ref" }) : end(401, { message: "Invalid identifier or password" });
        if (p === "/bsky/xrpc/com.atproto.repo.uploadBlob") { if (raw.length > 1000000) return end(400, { message: "BlobTooLarge" }); return end(200, { blob: { $type: "blob", ref: { $link: id("blob") }, mimeType: "image/jpeg", size: raw.length } }); }
        if (p === "/bsky/xrpc/com.atproto.repo.createRecord") { const r = json.record || {}; S.records.push({ collection: json.collection, record: r, auth });
          if (json.collection && json.collection !== "app.bsky.feed.post") return end(200, { uri: "at://did:plc:kd/" + json.collection + "/" + id("rk"), cid: "c" + S.n }); if (Array.from(r.text || "").length > 300) return end(400, { message: "text too long" }); S.posts.push({ pf: "bluesky", text: r.text, facets: (r.facets || []).length, images: r.embed && r.embed.images ? r.embed.images.length : 0 }); return end(200, { uri: "at://did:plc:kd/app.bsky.feed.post/" + id("rk") }); }
        // ── YouTube ──
        if (p === "/ytup/youtube/v3/videos") { if (!/^Bearer yt-acc/.test(auth)) return end(401, { error: { message: "auth" } }); S.ytMeta = json; return end(200, {}, { Location: "http://" + req.headers.host + "/ytput/1" }); }
        if (p === "/ytput/1") { S.uploads.yt = raw.length; const vid = id("yt"); S.posts.push({ pf: "youtube", id: vid, title: S.ytMeta.snippet.title }); return end(200, { id: vid }); }
        if (p === "/g/token") return end(200, { access_token: "yt-acc-2", expires_in: 3600 });
        // ── TikTok ──
        if (p === "/tt/v2/oauth/token/") return end(200, { access_token: "tt-neu", refresh_token: "tt-ref-neu", open_id: "openFS", scope: "user.info.basic,video.publish", expires_in: 86400, refresh_expires_in: 31536000 });
        if (p === "/tt/v2/user/info/") return end(200, { data: { user: { open_id: "openFS", display_name: "FS Creative" } }, error: { code: "ok" } });
        // Direct Post: Kontoangaben, Sichtbarkeit muss aus privacy_level_options sein; S.ttUnaudited = ungeprüfte App (nur SELF_ONLY)
        if (p === "/tt/v2/post/publish/creator_info/query/") return end(200, { data: { creator_nickname: "FS Creative", creator_username: "fs.creative.at", creator_avatar_url: "", privacy_level_options: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
          comment_disabled: false, duet_disabled: false, stitch_disabled: true, max_video_post_duration_sec: 600 }, error: { code: "ok" } });
        const direct = p === "/tt/v2/post/publish/video/init/";
        if (p === "/tt/v2/post/publish/inbox/video/init/" || direct) { const si = json.source_info || {}, pi = json.post_info || {}; if (si.source !== "FILE_UPLOAD" || !si.video_size) return end(400, { error: { code: "invalid_params" } });
          const MB = 1024 * 1024, cs = si.chunk_size, vs = si.video_size;   // Regeln wie bei TikTok: 5–64 MB je Stück, unter 5 MB als Ganzes, Anzahl abgerundet
          if (!(cs > 0) || cs > 64 * MB || cs > vs || (vs < 5 * MB ? cs !== vs : cs < 5 * MB) || (vs > 64 * MB && cs === vs) || si.total_chunk_count !== Math.floor(vs / cs)) return end(400, { error: { code: "invalid_params", message: "The chunk size is invalid" } });
          if (direct) { (S.ttDirect = S.ttDirect || []).push(pi);
            if (["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"].indexOf(pi.privacy_level) < 0) return end(400, { error: { code: "privacy_level_option_mismatch" } });
            // ungeprüfte App: auf privatem Konto nur SELF_ONLY (S.ttUnaudited), auf öffentlichem Konto gar nichts (S.ttUnauditedPublic)
            if (S.ttUnauditedPublic || (S.ttUnaudited && pi.privacy_level !== "SELF_ONLY")) return end(403, { error: { code: "unaudited_client_can_only_post_to_private_accounts", message: "Please review our integration guidelines" } }); }
          S.tt = { size: vs, got: 0, direct, privacy: pi.privacy_level }; return end(200, { data: { publish_id: direct ? "pub2" : "pub1", upload_url: "http://" + req.headers.host + "/ttup" }, error: { code: "ok" } }); }
        if (p === "/ttup") { S.tt.got += raw.length; return end(201, ""); }
        if (p === "/tt/v2/post/publish/status/fetch/") { S.posts.push({ pf: "tiktok", bytes: S.tt.got, size: S.tt.size, direct: S.tt.direct });
          if (S.tt.direct) return end(200, '{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[' + (S.tt.privacy === "SELF_ONLY" ? "" : "7431234567890123456") + '],"uploaded_bytes":' + S.tt.got + '},"error":{"code":"ok"}}');   // 19-stellige Zahl wie bei TikTok
          return end(200, { data: { status: "SEND_TO_USER_INBOX" }, error: { code: "ok" } }); }
        return end(404, { error: { message: "unbekannt " + p } });
      } catch (e) { return end(500, { error: { message: String(e.message || e) } }); }
    });
  });
  return { server, state: S };
};
