// Attrappe der Social-Media-Schnittstellen für test/mktpost.test.js: Instagram (Login + Graph), Facebook, Threads, LinkedIn, YouTube, TikTok, Pinterest, Bluesky.
// Prüft wie die echten Plattformen das Nötigste (Pflichtfelder, Token) und holt Bilder/Videos über die öffentliche Adresse ab (wie Instagram & Co.).
"use strict";
const http = require("http");
module.exports = function () {
  const S = { log: [], posts: [], fetched: [], uploads: {}, n: 1, failNext: {} };
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
        const fk = Object.keys(S.failNext).find(k => p.indexOf(k) > -1); if (fk) { const m = S.failNext[fk]; delete S.failNext[fk]; return end(m.status || 400, { error: { message: m.message || "Fehler" } }); }
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
        if ((m = p.match(/^\/ig\/v26\.0\/1784\/media$/)) && req.method === "POST") {
          if (all.access_token !== "ig-long" && all.access_token !== "ig-long-2") return end(401, { error: { message: "Invalid OAuth access token" } });
          if (all.media_type === "CAROUSEL") { if (!all.children || all.children.split(",").length < 2) return end(400, { error: { message: "children fehlt" } }); return end(200, { id: id("cc") }); }
          if (all.media_type === "REELS") { if (!all.video_url) return end(400, { error: { message: "video_url fehlt" } }); const b = await pull(all.video_url); S.uploads.igVideo = b.length; if (all.cover_url) await pull(all.cover_url); return end(200, { id: id("cr") }); }
          if ((String(all.caption || "").match(/#\w+/g) || []).length > 5) return end(400, { error: { message: "The caption contains more than the maximum allowed number of hashtags." } });
          if (!all.image_url) return end(400, { error: { message: "image_url fehlt" } }); await pull(all.image_url); return end(200, { id: id("ci") });
        }
        if ((m = p.match(/^\/ig\/v26\.0\/(c[a-z]*\d+)$/))) return end(200, { status_code: "FINISHED" });
        if (p === "/ig/v26.0/1784/media_publish") { const pid = id("igpost"); S.posts.push({ pf: "instagram", id: pid, creation: all.creation_id }); return end(200, { id: pid }); }
        if ((m = p.match(/^\/ig\/v26\.0\/(igpost\d+)$/))) return end(200, { permalink: "https://www.instagram.com/p/" + m[1] + "/" });
        // ── Facebook ──
        if (p === "/fb/v26.0/oauth/access_token") return end(200, all.grant_type === "fb_exchange_token" ? { access_token: "fb-user-long" } : { access_token: "fb-user-short" });
        if (p === "/fb/v26.0/me/accounts") return end(200, { data: [{ id: "pg1", name: "kochdu", access_token: "pg1-tok" }, { id: "pg2", name: "FS Creative", access_token: "pg2-tok" }] });
        if (p === "/fb/v26.0/pg1/photos") { if (all.access_token !== "pg1-tok") return end(401, { error: { message: "token" } }); await pull(all.url); const pid = id("ph"); if (all.published === "false") return end(200, { id: pid }); S.posts.push({ pf: "facebook", id: "pg1_" + pid, caption: all.caption }); return end(200, { id: pid, post_id: "pg1_" + pid }); }
        if (p === "/fb/v26.0/pg1/feed") { const n = Object.keys(all).filter(k => /^attached_media/.test(k)).length; const pid = "pg1_" + id("f"); S.posts.push({ pf: "facebook", id: pid, images: n, message: all.message }); return end(200, { id: pid }); }
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
        if (p === "/bsky/xrpc/com.atproto.repo.createRecord") { const r = json.record || {}; if (Array.from(r.text || "").length > 300) return end(400, { message: "text too long" }); S.posts.push({ pf: "bluesky", text: r.text, facets: (r.facets || []).length, images: r.embed && r.embed.images ? r.embed.images.length : 0 }); return end(200, { uri: "at://did:plc:kd/app.bsky.feed.post/" + id("rk") }); }
        // ── YouTube ──
        if (p === "/ytup/youtube/v3/videos") { if (!/^Bearer yt-acc/.test(auth)) return end(401, { error: { message: "auth" } }); S.ytMeta = json; return end(200, {}, { Location: "http://" + req.headers.host + "/ytput/1" }); }
        if (p === "/ytput/1") { S.uploads.yt = raw.length; const vid = id("yt"); S.posts.push({ pf: "youtube", id: vid, title: S.ytMeta.snippet.title }); return end(200, { id: vid }); }
        if (p === "/g/token") return end(200, { access_token: "yt-acc-2", expires_in: 3600 });
        // ── TikTok ──
        if (p === "/tt/v2/post/publish/inbox/video/init/") { const si = json.source_info || {}; if (si.source !== "FILE_UPLOAD" || !si.video_size) return end(400, { error: { code: "invalid_params" } }); S.tt = { size: si.video_size, got: 0 }; return end(200, { data: { publish_id: "pub1", upload_url: "http://" + req.headers.host + "/ttup" }, error: { code: "ok" } }); }
        if (p === "/ttup") { S.tt.got += raw.length; return end(201, ""); }
        if (p === "/tt/v2/post/publish/status/fetch/") { S.posts.push({ pf: "tiktok", bytes: S.tt.got, size: S.tt.size }); return end(200, { data: { status: "SEND_TO_USER_INBOX" }, error: { code: "ok" } }); }
        return end(404, { error: { message: "unbekannt " + p } });
      } catch (e) { return end(500, { error: { message: String(e.message || e) } }); }
    });
  });
  return { server, state: S };
};
