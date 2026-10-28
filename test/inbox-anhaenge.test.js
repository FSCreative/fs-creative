process.env.MKT_WEB = "off";
/* Marketing › Posteingang: Anhänge, Story-Erwähnungen, Markierungen, Teilen (mkt-publish.js inbox/attsOf, mkt-posts.js Durchreich-Proxy und Aktionen)
   gegen die Plattform-Attrappe test/social-mock.js mit echten Graph-/Bluesky-Antwortformen: Foto, Video, Sprachnachricht, Datei, Sticker, GIF, geteiltes Reel,
   Story-Erwähnung (frisch, abgelaufen, gelöscht), Antwort auf Story, nicht unterstützt, Einmal-Ansicht; Feldleiter, Einzelabruf, Ablaufprüfung, Markierungen,
   Facebook-Anfragen, Bluesky-Embeds; Proxy ohne Speichern, Deep-Link/QR, Story-Neu-Upload nur mit Einverständnis, Reposten/Zitieren, Mitteilungen, Größe des Zwischenspeichers. */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const ROOT = path.join(__dirname, "..");
const R = require(path.join(ROOT, "mkt-render.js"));

let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }
const listen = srv => new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ago = min => new Date(Date.now() - min * 60e3).toISOString();
function send(r, code, body, type, headers) { r.writeHead(code, Object.assign({ "Content-Type": type }, headers || {})); r.end(body); }
const files = d => { const out = []; (function walk(x) { let l = []; try { l = fs.readdirSync(x, { withFileTypes: true }); } catch (e) { return; } l.forEach(e => e.isDirectory() ? walk(path.join(x, e.name)) : out.push(path.join(x, e.name))); })(d); return out.sort(); };

(async () => {
  const mock = require(path.join(__dirname, "social-mock.js"))(), mport = await listen(mock.server), MB = "http://127.0.0.1:" + mport, CDN = MB + "/cdn/", S = mock.state;

  // ── Testdaten in der Form der Graph API v26.0 (Instagram-Login bzw. Seiten-Token) ──
  function fixture() {
    const me = { id: "1784", username: "kochdu.at" }, lisa = { id: "u1", username: "lisa.montafon" }, markus = { id: "u2", username: "markus_b" };
    const M = (id, min, o) => Object.assign({ id, created_time: ago(min), from: o.mine ? me : lisa, to: { data: [o.mine ? lisa : me] } }, o.x);
    const cvA = { id: "cvA", updated_time: ago(5), participants: { data: [me, lisa] }, messages: { data: [
      M("mx01", 5, { x: { message: "Schau mal, unser Abend!", attachments: { data: [{ id: "a1", mime_type: "image/jpeg", image_data: { url: CDN + "ok-img1.jpg", preview_url: CDN + "ok-img1p.jpg", width: 1080, height: 1350 } }] }, reactions: { data: [{ reaction: "love", users: [me] }] } } }),
      M("mx02", 10, { x: { attachments: { data: [{ id: "a2", mime_type: "video/mp4", video_data: { url: CDN + "ok-video1.mp4", preview_url: CDN + "ok-v1p.jpg", width: 720, height: 1280 } }] } } }),
      M("mx03", 15, { x: { attachments: { data: [{ id: "a3", mime_type: "audio/mp4", name: "audioclip-1730.mp4", size: 23456, file_url: CDN + "ok-audio.mp4" }] } } }),
      M("mx04", 20, { x: { attachments: { data: [{ id: "a4", mime_type: "application/pdf", name: "Angebot Hochzeit.pdf", size: 182345, file_url: CDN + "ok-file.pdf" }] } } }),
      M("mx05", 25, { x: { attachments: { data: [{ id: "a5", mime_type: "image/png", image_data: { url: CDN + "ok-sticker.png", width: 240, height: 240, render_as_sticker: true } }] } } }),
      M("mx13", 28, { x: { attachments: { data: [{ id: "a13", mime_type: "image/gif", image_data: { url: CDN + "ok-gif-still.jpg", animated_gif_url: CDN + "ok-gif.gif", width: 480, height: 270 } }] } } }),
      M("mx06", 30, { x: { shares: { data: [{ id: "17999", type: "ig_reel", url: CDN + "ok-reel.mp4", title: "So schnell geht Pizza 🍕" }] } } }),
      M("mx11", 35, { x: { attachments: { data: [{ id: "a11a", image_data: { url: CDN + "ok-k1.jpg", width: 800, height: 800 } }, { id: "a11b", image_data: { url: CDN + "ok-k2.jpg", width: 800, height: 600 } }] } } }),
      M("mx12", 40, { x: { attachments: { data: [{ id: "a12" }] } } }),
      M("mx10", 45, { x: { is_unsupported: true } }),
      M("mx07", 120, { x: { story: { mention: { link: CDN + "ok-story.jpg", id: "st1" } } } }),
      M("mx14", 180, { x: { story: { mention: { link: CDN + "gone-story.jpg", id: "st3" } } } }),
      M("mx09", 240, { x: { message: "Wie geil 😍", story: { reply_to: { link: CDN + "ok-story2.jpg", id: "st2" } } } }),
      M("mx08", 30 * 60, { x: { story: { mention: { link: CDN + "ok-story-old.jpg", id: "st0" } } } }),
      M("mx15", 31 * 60, { mine: true, x: { message: "Danke fürs Erwähnen!" } })] } };
    const cvB = { id: "cvB", updated_time: ago(50), participants: { data: [me, markus] }, messages: { data: [
      { id: "mxB2", created_time: ago(50), from: markus },   // ohne Text und Anhang: Story-Erwähnung, die nur der Einzelabruf liefert
      { id: "mxB1", created_time: ago(55), from: markus, message: "Hallo!" }] } };
    const page = { id: "pg1", name: "kochdu" }, anna = { id: "f1", name: "Anna Berger" }, tom = { id: "f2", name: "Tom Neu" }, bot = { id: "f3", name: "Gewinn Bot" };
    return {
      igConv: [cvA, cvB],
      detail: { mxB2: { story: { mention: { link: CDN + "ok-storyB.jpg", id: "stB" } } }, mx07: { story: { mention: { link: CDN + "ok-story.jpg", id: "st1" } } }, mx14: { story: { mention: { link: CDN + "gone-story.jpg", id: "st3" } } },
        mx08: { story: { mention: { link: CDN + "ok-story-old.jpg", id: "st0" } } }, mx06: { shares: { data: [{ id: "17999", type: "ig_reel", url: CDN + "ok-reel.mp4", title: "So schnell geht Pizza 🍕" }] } } },
      tags: [{ id: "tg1", username: "anna.k", caption: "Pizzaabend mit @kochdu.at 🍕", media_type: "IMAGE", media_url: CDN + "ok-tag1.jpg", permalink: "https://www.instagram.com/p/TAG1/", timestamp: ago(500) },
        { id: "tg2", username: "sepp.m", caption: "Reel mit lizenzierter Musik", media_type: "VIDEO", thumbnail_url: CDN + "ok-tag2t.jpg", permalink: "https://www.instagram.com/reel/TAG2/", timestamp: ago(600) }],
      fbConv: {
        inbox: [{ id: "fcv1", updated_time: ago(60), participants: { data: [page, anna] }, messages: { data: [
          { id: "mxF2", created_time: ago(60), from: anna, sticker: CDN + "ok-fbsticker.png", attachments: { data: [{ id: "fa", image_data: { url: CDN + "ok-fbsticker.png", width: 120, height: 120, render_as_sticker: true } }] } },
          { id: "mxF1", created_time: ago(70), from: anna, message: "Schaut euch das an", shares: { data: [{ type: "post", link: "https://www.facebook.com/kochdu/posts/1", url: CDN + "ok-fbshare.jpg", title: "Neue Karte" }] } }] } }],
        pending: [{ id: "fcv2", updated_time: ago(90), participants: { data: [page, tom] }, messages: { data: [{ id: "mxF3", created_time: ago(90), from: tom, message: "Hallo, macht ihr auch Catering?" }] } }],
        other: [{ id: "fcv3", updated_time: ago(95), participants: { data: [page, bot] }, messages: { data: [{ id: "mxF4", created_time: ago(95), from: bot, message: "Sie haben gewonnen!!!" }] } }],
        page_done: [] },
      fbPosts: [{ id: "pg1_1", message: "Neue Karte", permalink_url: "https://www.facebook.com/pg1/posts/1", created_time: ago(300), reactions: { summary: { total_count: 4 } },
        comments: { summary: { total_count: 1 }, data: [{ id: "fc9", from: { id: "f5", name: "Eva" }, created_time: ago(200), attachment: { type: "sticker", media: { image: { src: CDN + "ok-fbcs.png", width: 240, height: 240 } }, target: { url: "https://www.facebook.com/x" }, url: "https://www.facebook.com/x" } }] } }],
      fbTagged: [{ id: "pg9_77", message: "Super Abend bei @kochdu", created_time: ago(400), permalink_url: "https://www.facebook.com/pg9/posts/77", full_picture: CDN + "ok-fbtag.jpg" }],
      thPosts: [{ id: "thp1", text: "Neuer Beitrag", permalink: "https://www.threads.net/@kochdu.at/post/1", timestamp: ago(800) }],
      thReplies: { thp1: [{ id: "thr1", text: "", username: "lisa.m", timestamp: ago(700), media_type: "IMAGE", media_url: CDN + "ok-thimg.jpg", permalink: "https://www.threads.net/@lisa.m/post/2" }] },
      bsNotifs: bsNotifs(), bsPosts: bsPosts() };
  }
  // Bluesky: 28 Likes auf verschiedene eigene Beiträge + Erwähnung, Zitat, Antwort → 31 Adressen für getPosts (2 Aufrufe)
  function bsNotifs() {
    const au = (did, h, dn) => ({ did, handle: h, displayName: dn });
    return Array.from({ length: 28 }, (_, i) => ({ uri: "at://did:plc:l" + i + "/app.bsky.feed.like/" + i, cid: "cl" + i, reason: "like", reasonSubject: "at://did:plc:kd/app.bsky.feed.post/p" + i, author: au("did:plc:l" + i, "fan" + i + ".bsky.social"), indexedAt: ago(1000 + i), isRead: true }))
      .concat([{ uri: "at://did:plc:u5/app.bsky.feed.post/m1", cid: "cm1", reason: "mention", author: au("did:plc:u5", "eva.bsky.social", "Eva"), record: { text: "Danke @kochdu.bsky.social für den Abend!" }, indexedAt: ago(30), isRead: false },
        { uri: "at://did:plc:u6/app.bsky.feed.post/q1", cid: "cq1", reason: "quote", reasonSubject: "at://did:plc:kd/app.bsky.feed.post/p0", author: au("did:plc:u6", "max.bsky.social", "Max"), record: { text: "Genau so!" }, indexedAt: ago(40), isRead: false },
        { uri: "at://did:plc:u7/app.bsky.feed.post/r1", cid: "cr1", reason: "reply", reasonSubject: "at://did:plc:kd/app.bsky.feed.post/p1", author: au("did:plc:u7", "ina.bsky.social", "Ina"), record: { text: "", reply: { root: { uri: "at://did:plc:kd/app.bsky.feed.post/p1", cid: "cp1" }, parent: { uri: "at://did:plc:kd/app.bsky.feed.post/p1", cid: "cp1" } } }, indexedAt: ago(50), isRead: false }]);
  }
  function bsPosts() {
    const o = {}, img = n => ({ thumb: "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:x/" + n + "@jpeg", fullsize: "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:x/" + n + "@jpeg", alt: "Foto " + n, aspectRatio: { width: 4, height: 5 } });
    for (let i = 0; i < 28; i++) o["at://did:plc:kd/app.bsky.feed.post/p" + i] = { uri: "at://did:plc:kd/app.bsky.feed.post/p" + i, record: { text: "Eigener Beitrag " + i }, indexedAt: ago(5000), embed: i === 0 ? { $type: "app.bsky.embed.images#view", images: [img("own0")] } : undefined };
    o["at://did:plc:u5/app.bsky.feed.post/m1"] = { uri: "at://did:plc:u5/app.bsky.feed.post/m1", record: { text: "Danke!" }, embed: { $type: "app.bsky.embed.images#view", images: [img("m1a"), img("m1b")] } };
    o["at://did:plc:u6/app.bsky.feed.post/q1"] = { uri: "at://did:plc:u6/app.bsky.feed.post/q1", record: { text: "Genau so!" }, embed: { $type: "app.bsky.embed.recordWithMedia#view", media: { $type: "app.bsky.embed.external#view", external: { uri: "https://kochdu.at/karte", title: "Unsere Karte", description: "", thumb: "https://cdn.bsky.app/img/ext/k@jpeg" } }, record: { record: { $type: "app.bsky.embed.record#viewNotFound", uri: "at://x/y/z", notFound: true } } } };
    o["at://did:plc:u7/app.bsky.feed.post/r1"] = { uri: "at://did:plc:u7/app.bsky.feed.post/r1", record: { text: "" }, embed: { $type: "app.bsky.embed.video#view", cid: "v", playlist: "https://video.bsky.app/watch/did:plc:u7/v/playlist.m3u8", thumbnail: "https://video.bsky.app/watch/did:plc:u7/v/thumbnail.jpg", aspectRatio: { width: 9, height: 16 } } };
    return o;
  }
  S.inbox = fixture();
  const P = require(path.join(ROOT, "mkt-publish.js"))({ waitMs: 5, pollMax: 5, base: { ig: MB + "/ig", fb: MB + "/fb", th: MB + "/th", bsky: MB + "/bsky" }, cdnHosts: ["127.0.0.1:" + mport] });
  const igCh = { platform: "instagram", account: { id: "1784", handle: "@kochdu.at" } }, igTok = { access: "ig-long" };
  const convCalls = () => S.graph.filter(g => g.p === "/ig/v26.0/me/conversations");
  let base;

  // ═════════════ Teil A: Abruf je Plattform (mkt-publish.js) ═════════════
  await t("Instagram: alle Anhangsarten im Verlauf (Text bleibt, Foto, Video, Sprachnachricht, Datei, Sticker, GIF, Reel, Story, Einmal-Ansicht, nicht unterstützt)", async () => {
    S.cdn.length = 0; const o = { st: {}, msgx: {} }, r = await P.inbox("instagram", igCh, igTok, o); base = r;
    const cv = r.items.find(i => i.id === "ig:m:cvA"), th = id => cv.thread.find(m => m.id === id), a = id => th(id).att || [];
    assert.ok(cv, "Unterhaltung da"); assert.strictEqual(o.st.msgLvl.n, 0, "reichste Feldstufe");
    assert.strictEqual(th("mx01").text, "Schau mal, unser Abend!", "(a) Text bleibt"); assert.strictEqual(a("mx01")[0].t, "image"); assert.strictEqual(a("mx01")[0].w, 1080); assert.ok(a("mx01")[0].prev);
    assert.deepStrictEqual(th("mx01").react, [{ e: "❤️" }], "Reaktion");
    assert.strictEqual(a("mx02")[0].t, "video", "(b)"); assert.ok(/ok-v1p/.test(a("mx02")[0].prev)); assert.strictEqual(th("mx02").label, "🎬 Video");
    assert.strictEqual(a("mx03")[0].t, "audio", "(c)"); assert.strictEqual(th("mx03").label, "🎤 Sprachnachricht");
    assert.strictEqual(a("mx04")[0].t, "file", "(d)"); assert.strictEqual(a("mx04")[0].name, "Angebot Hochzeit.pdf"); assert.strictEqual(a("mx04")[0].size, 182345); assert.strictEqual(th("mx04").label, "📎 Datei „Angebot Hochzeit.pdf“");
    assert.strictEqual(a("mx05")[0].t, "sticker", "(e)");
    assert.strictEqual(a("mx13")[0].t, "gif"); assert.ok(/ok-gif\.gif$/.test(a("mx13")[0].url), "animiertes GIF statt Standbild");
    assert.strictEqual(a("mx06")[0].t, "reel", "(f)"); assert.strictEqual(a("mx06")[0].title, "So schnell geht Pizza 🍕"); assert.strictEqual(th("mx06").label, "🎞 Geteiltes Reel");
    const sm = a("mx07")[0]; assert.strictEqual(sm.t, "story_mention", "(g)"); assert.strictEqual(Date.parse(sm.exp), Date.parse(th("mx07").at) + 864e5, "exp = Erwähnung + 24 h");
    assert.strictEqual(sm.state, "ok"); assert.strictEqual(sm.mime, "image/jpeg", "Ablaufprüfung liefert den Typ"); assert.strictEqual(th("mx07").label, "📣 hat dich in der Story erwähnt");
    assert.strictEqual(cv.flags.storyMention, true); assert.strictEqual(cv.flags.sm, "mx07", "jüngste Story-Erwähnung"); assert.strictEqual(cv.can.story, "app");
    assert.strictEqual(a("mx08")[0].state, "expired", "(h) nach 24 h abgelaufen"); assert.ok(!S.cdn.some(c => c.f === "ok-story-old.jpg"), "abgelaufen ohne Netzabfrage");
    assert.strictEqual(a("mx14")[0].state, "expired", "gelöschte Story (403) → abgelaufen");
    assert.strictEqual(a("mx09")[0].t, "story_reply", "(i)"); assert.strictEqual(th("mx09").text, "Wie geil 😍"); assert.strictEqual(cv.flags.storyReply, true);
    assert.strictEqual(a("mx10")[0].t, "unsupported", "(j)"); assert.strictEqual(th("mx10").label, "Nachricht nur in der App sichtbar");
    assert.strictEqual(a("mx11").length, 2, "(k) beide Anhänge"); assert.strictEqual(th("mx11").label, "📷 Foto (+1)");
    assert.strictEqual(a("mx12")[0].t, "ephemeral", "(l)"); assert.strictEqual(a("mx12")[0].state, "ephemeral"); assert.ok(/Einmal/.test(th("mx12").label));
    assert.strictEqual(cv.text, "Schau mal, unser Abend!"); assert.strictEqual(cv.links.app, "https://ig.me/m/lisa.montafon"); assert.strictEqual(cv.links.web, "https://www.instagram.com/lisa.montafon/");
    const probes = S.cdn.filter(c => c.range === "bytes=0-0"); assert.ok(probes.length >= 3 && probes.length <= 10, "Ablaufprüfungen " + probes.length);
    const b = r.items.find(i => i.id === "ig:m:cvB").thread.find(m => m.id === "mxB2"); assert.strictEqual(b.att[0].t, "unsupported"); assert.strictEqual(b.att[0].state, "unknown");
    assert.ok(!S.graph.some(g => /\/mx/.test(g.p)), "auf voller Feldstufe kein Einzelabruf");
  });
  await t("Instagram: Markierungen (/tags) als Erwähnung mit Bild, Link und Teilen-Möglichkeit; ohne media_url nur „in der App“", async () => {
    const t1 = base.items.find(i => i.id === "ig:t:tg1"), t2 = base.items.find(i => i.id === "ig:t:tg2");
    assert.strictEqual(t1.kind, "mention"); assert.strictEqual(t1.sub, "tag"); assert.strictEqual(t1.from.handle, "@anna.k"); assert.strictEqual(t1.text, "Pizzaabend mit @kochdu.at 🍕");
    assert.strictEqual(t1.media[0].t, "image"); assert.strictEqual(t1.media[0].link, "https://www.instagram.com/p/TAG1/"); assert.strictEqual(t1.media[0].owner, "@anna.k");
    assert.strictEqual(t1.can.story, "app+reupload"); assert.strictEqual(t1.can.reply, false); assert.strictEqual(t1.ref.owner, "anna.k"); assert.ok(/ok-tag1/.test(t1.ref.mediaUrl));
    assert.strictEqual(t2.can.story, "app", "lizenzierte Musik: kein Neu-Upload"); assert.strictEqual(t2.media[0].t, "video");
  });
  await t("Feldleiter: kennt Instagram ein Feld nicht, nächste Stufe ohne Hinweis – gemerkt (nur noch eine Abfrage)", async () => {
    S.inbox.igReject = /reactions/; S.graph.length = 0; const o = { st: {}, msgx: {} };
    const r = await P.inbox("instagram", igCh, igTok, o);
    assert.strictEqual(convCalls().length, 2); assert.ok(/reactions/.test(convCalls()[0].fields) && !/reactions/.test(convCalls()[1].fields));
    assert.strictEqual(o.st.msgLvl.n, 1); assert.ok(!r.notes.some(n => /Nachrichten/.test(n)), r.notes.join("|")); assert.ok(r.items.find(i => i.id === "ig:m:cvA").flags.storyMention, "Story kommt auf Stufe 2");
    S.graph.length = 0; await P.inbox("instagram", igCh, igTok, o); assert.strictEqual(convCalls().length, 1, "gemerkte Stufe"); assert.ok(!/reactions/.test(convCalls()[0].fields));
    o.st.msgLvl.at -= 8 * 864e5; S.graph.length = 0; await P.inbox("instagram", igCh, igTok, o); assert.strictEqual(convCalls().length, 2, "nach 7 Tagen wieder von oben"); S.inbox.igReject = null;
  });
  await t("Schlichte Stufe: Story/Share nur per Einzelabruf (GET /<Nachricht>?fields=story,…), je Nachricht nur einmal", async () => {
    S.inbox.igReject = /story|shares/; S.graph.length = 0; const o = { st: {}, msgx: {} };
    const r = await P.inbox("instagram", igCh, igTok, o); assert.strictEqual(o.st.msgLvl.n, 3, "Stufe 4");
    const det = S.graph.filter(g => /\/mx\w+$/.test(g.p)); assert.ok(det.length >= 5 && det.length <= 10, "Einzelabrufe " + det.length); assert.strictEqual(det[0].fields, "story,shares,attachments");
    const b = r.items.find(i => i.id === "ig:m:cvB").thread.find(m => m.id === "mxB2"); assert.strictEqual(b.att[0].t, "story_mention"); assert.strictEqual(b.label, "📣 hat dich in der Story erwähnt");
    const a = r.items.find(i => i.id === "ig:m:cvA"); assert.strictEqual(a.thread.find(m => m.id === "mx06").att[0].t, "reel"); assert.strictEqual(a.thread.find(m => m.id === "mx08").att[0].state, "expired");
    assert.ok(o.msgx.mxB2 && o.msgxDirty, "gemerkt"); assert.ok(o.msgx.mx10, "auch „gibt es so nicht“ wird gemerkt");
    S.graph.length = 0; await P.inbox("instagram", igCh, igTok, o); assert.strictEqual(S.graph.filter(g => /\/mx\w+$/.test(g.p)).length, 0, "kein zweiter Einzelabruf");
    S.inbox.igReject = null;
  });
  await t("Letzter Stand: ältere Nachrichten ohne Angaben behalten ihren Anhang, „gelöscht“ bleibt bei gleicher Adresse, neue Adresse → wieder ok", async () => {
    const prev = JSON.parse(JSON.stringify(base.items)), pa = prev.find(i => i.id === "ig:m:cvA").thread;
    pa.find(m => m.id === "mx02").att[0].state = "gone"; pa.find(m => m.id === "mx03").att[0].state = "gone"; S.inbox.dropAtt = ["mx01"];
    S.inbox.igConv[0].messages.data.find(m => m.id === "mx03").attachments.data[0].file_url = CDN + "ok-audio-neu.mp4";
    const r = await P.inbox("instagram", igCh, igTok, { st: {}, msgx: {}, prev }), th = r.items.find(i => i.id === "ig:m:cvA").thread;
    assert.strictEqual(th.find(m => m.id === "mx01").att[0].t, "image", "Anhang aus dem letzten Stand");
    assert.strictEqual(th.find(m => m.id === "mx02").att[0].state, "gone", "gleiche Adresse bleibt gelöscht"); assert.strictEqual(th.find(m => m.id === "mx03").att[0].state, "ok", "neue Signatur → ok");
    S.inbox = fixture();
  });
  await t("Facebook: Anfragen (pending/other), Sticker- und Share-Nachrichten, Sticker-Kommentar, Markierung der Seite ohne Absender", async () => {
    const fb = { platform: "facebook", account: { id: "pg1", name: "kochdu" } }, o = { st: {}, msgx: {} }; S.graph.length = 0;
    const r = await P.inbox("facebook", fb, { access: "pg1-tok" }, o), it = id => r.items.find(i => i.id === id);
    assert.strictEqual(it("fb:m:fcv2").request, true); assert.ok(!it("fb:m:fcv2").filtered); assert.strictEqual(it("fb:m:fcv3").request, true); assert.strictEqual(it("fb:m:fcv3").filtered, true); assert.ok(!it("fb:m:fcv1").request);
    const f2 = it("fb:m:fcv1").thread.find(m => m.id === "mxF2"); assert.strictEqual(f2.att.length, 1, "Sticker nur einmal"); assert.strictEqual(f2.att[0].t, "sticker"); assert.strictEqual(it("fb:m:fcv1").text, "Sticker");
    const f1 = it("fb:m:fcv1").thread.find(m => m.id === "mxF1"); assert.strictEqual(f1.att[0].t, "post"); assert.strictEqual(f1.att[0].link, "https://www.facebook.com/kochdu/posts/1");
    const c = it("fb:c:fc9"); assert.strictEqual(c.media[0].t, "sticker"); assert.strictEqual(c.label, "Sticker"); assert.strictEqual(c.text, "");
    const tg = it("fb:t:pg9_77"); assert.strictEqual(tg.from.name, "Jemand"); assert.strictEqual(tg.can.reply, true); assert.deepStrictEqual(tg.ref, { comment: "pg9_77" }); assert.strictEqual(tg.media[0].t, "image"); assert.strictEqual(tg.links.web, "https://www.facebook.com/pg9/posts/77");
    const inb = S.graph.filter(g => g.p === "/fb/v26.0/pg1/conversations"); assert.strictEqual(inb[0].folder, "inbox", "Hauptordner zuerst (Feldleiter)"); assert.strictEqual(inb.length, 4);
    S.inbox.fbCmReject = /attachment/; const r2 = await P.inbox("facebook", fb, { access: "pg1-tok" }, { st: {}, msgx: {} }); assert.ok(r2.items.find(i => i.id === "fb:c:fc9"), "Kommentare ohne Anhang-Feld"); S.inbox.fbCmReject = null;
  });
  await t("Markierungen: Fehler → Hinweis, höchstens alle 30 Minuten (Berechtigung: 1× am Tag) – dazwischen der letzte Stand", async () => {
    S.inbox.tagsErr = "(#10) Application does not have permission for this action"; const o = { st: {}, msgx: {} };
    const r = await P.inbox("instagram", igCh, igTok, o); assert.ok(r.notes.some(n => /Markierungen in fremden Beiträgen: mit dem Instagram-Login nicht abrufbar/.test(n)), r.notes.join("|")); assert.strictEqual(o.st.tags.perm, true);
    S.graph.length = 0; const r2 = await P.inbox("instagram", igCh, igTok, o); assert.ok(!S.graph.some(g => /\/tags$/.test(g.p)), "nicht bei jedem Abruf neu"); assert.ok(r2.notes.some(n => /Markierungen/.test(n)));
    S.inbox.tagsErr = null; S.graph.length = 0;
    const r3 = await P.inbox("instagram", igCh, igTok, { st: { tags: { at: Date.now() } }, msgx: {}, prev: base.items }); assert.ok(!S.graph.some(g => /\/tags$/.test(g.p))); assert.ok(r3.items.some(i => i.id === "ig:t:tg1"), "letzter Stand");
  });
  await t("Threads: Antwort mit Bild → Anhang; kennt Threads die Felder nicht, ohne", async () => {
    const th = { platform: "threads", account: { id: "th1", handle: "@kochdu.at" } }, r = await P.inbox("threads", th, { access: "th-long" }, { st: {} });
    const c = r.items.find(i => i.id === "th:c:thr1"); assert.strictEqual(c.media[0].t, "image"); assert.strictEqual(c.label, "📷 Foto");
    S.inbox.thReject = /media_type/; const r2 = await P.inbox("threads", th, { access: "th-long" }, { st: {} }); assert.ok(r2.items.find(i => i.id === "th:c:thr1"), "ohne Medienfelder"); assert.ok(!r2.notes.length, r2.notes.join("|")); S.inbox.thReject = null;
  });
  await t("Bluesky: getPosts in Paketen zu 25, Bilder/Video/Link-Karte/gelöschtes Zitat, Reposten/Zitieren bei Erwähnung und Zitat, Vorschaubild eigener Beiträge", async () => {
    S.graph.length = 0; const bs = { platform: "bluesky", account: { id: "did:plc:kd" } }, r = await P.inbox("bluesky", bs, { access: "bs-acc", handle: "kochdu.bsky.social" }, {});
    const gp = S.graph.filter(g => g.p === "/bsky/xrpc/app.bsky.feed.getPosts"); assert.strictEqual(gp.length, 2); assert.deepStrictEqual(gp.map(g => g.n).sort((a, b) => b - a), [25, 6]);
    const m = r.items.find(i => i.id === "bs:at://did:plc:u5/app.bsky.feed.post/m1"); assert.strictEqual(m.media.length, 2); assert.ok(/^https:\/\/cdn\.bsky\.app\/img\/feed_fullsize/.test(m.media[0].url)); assert.ok(/feed_thumbnail/.test(m.media[0].prev));
    assert.deepStrictEqual([m.can.repost, m.can.quote], [true, true]); assert.strictEqual(m.links.web, "https://bsky.app/profile/eva.bsky.social/post/m1");
    const q = r.items.find(i => i.id === "bs:at://did:plc:u6/app.bsky.feed.post/q1"); assert.strictEqual(q.sub, "quote"); assert.deepStrictEqual(q.media.map(a => a.t), ["link", "quote"]); assert.strictEqual(q.media[1].state, "gone"); assert.ok(/gelöscht/.test(q.media[1].title));
    const v = r.items.find(i => i.id === "bs:at://did:plc:u7/app.bsky.feed.post/r1"); assert.strictEqual(v.kind, "comment"); assert.strictEqual(v.media[0].t, "video"); assert.ok(/playlist\.m3u8$/.test(v.media[0].hls)); assert.strictEqual(v.can.repost, false); assert.strictEqual(v.label, "🎬 Video");
    const like = r.items.find(i => i.kind === "like" && i.post && i.post.id === "at://did:plc:kd/app.bsky.feed.post/p0"); assert.ok(/feed_thumbnail.*own0/.test(like.post.thumb), "Vorschaubild");
  });

  // ═════════════ Teil B: Cockpit-Routen (mkt-posts.js) über marketing.js ═════════════
  S.inbox = fixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsc-anh-")), MEDIA = path.join(dir, "marketing", "media");
  let M = null; const pushes = [];
  const adm = http.createServer(async (q, s) => { const u = new URL(q.url, "http://x");
    try { if (u.pathname.indexOf("/m/") === 0) return M.handlePublic(q, s, u.pathname); if (!(await M.handleAdmin(q, s, u, u.pathname))) { s.writeHead(404); s.end(); } }
    catch (e) { if (!s.headersSent) { s.writeHead(e.status || 500, { "Content-Type": "application/json" }); s.end(JSON.stringify({ ok: false, error: e.message })); } } });
  const aport = await listen(adm), ADM = "http://127.0.0.1:" + aport;
  M = require(path.join(ROOT, "marketing.js"))({ send, DATA_DIR: dir, ROOT, secret: "anh-secret", KI: () => null, publicBase: ADM, background: false, push: async (topic, msg) => { pushes.push(msg); return 1; },
    publish: { waitMs: 5, pollMax: 5, cdnHosts: ["127.0.0.1:" + mport], base: { ig: MB + "/ig", fb: MB + "/fb", th: MB + "/th", bsky: MB + "/bsky" } } });
  const PT = M._test.posts._test;
  PT.upsertChannel("kochdu", { platform: "instagram", account: { id: "1784", handle: "@kochdu.at", name: "kochdu" }, tok: { access: "ig-long", expiresAt: new Date(Date.now() + 60 * 864e5).toISOString() } });
  PT.upsertChannel("kochdu", { platform: "facebook", account: { id: "pg1", name: "kochdu" }, tok: { access: "pg1-tok" } });
  PT.upsertChannel("kochdu", { platform: "bluesky", account: { id: "did:plc:kd", handle: "@kochdu.bsky.social", name: "kochdu.bsky.social" }, tok: { access: "bs-acc", handle: "kochdu.bsky.social" } });
  const api = async (p, body, headers) => { const r = await fetch(ADM + p, { method: body ? "POST" : "GET", headers: Object.assign(body ? { "Content-Type": "application/json" } : {}, headers || {}), body: body ? JSON.stringify(body) : undefined }); const buf = Buffer.from(await r.arrayBuffer()); let j = null; try { j = JSON.parse(buf.toString("utf8")); } catch (e) {} return { status: r.status, headers: r.headers, buf, j }; };
  const act = b => api("/admin/api/mkt/inbox/act", Object.assign({ brand: "kochdu" }, b));
  const item = (pf, id) => PT.INBOX.get("kochdu").channels.find(c => c.platform === pf).items.find(i => i.id === id);
  await PT.refreshInbox("kochdu");

  await t("Cockpit bekommt Anhänge ohne Meta-Adressen (nur Kennungen f/p), ohne ref/Token; Bluesky-Medien direkt", async () => {
    const r = await api("/admin/api/mkt/inbox/all"), txt = r.buf.toString("utf8"), j = r.j, ig = j.brands.kochdu.channels.find(c => c.platform === "instagram"), bs = j.brands.kochdu.channels.find(c => c.platform === "bluesky");
    assert.ok(!/"ref"/.test(txt) && txt.indexOf("ig-long") < 0 && txt.indexOf("pg1-tok") < 0 && txt.indexOf("bs-acc") < 0, "keine Antwort-Adressen/Tokens");
    assert.ok(txt.indexOf("/cdn/") < 0, "keine Meta-CDN-Adressen im Cockpit");
    const cv = ig.items.find(i => i.id === "ig:m:cvA"), a1 = cv.thread.find(m => m.id === "mx01").att[0]; assert.strictEqual(a1.f, 1); assert.strictEqual(a1.p, 1); assert.ok(!a1.url && !a1.prev);
    assert.strictEqual(cv.flags.storyMention, true); assert.strictEqual(cv.links.app, "https://ig.me/m/lisa.montafon");
    const tg = ig.items.find(i => i.id === "ig:t:tg1"); assert.strictEqual(tg.media[0].f, 1); assert.strictEqual(tg.media[0].link, "https://www.instagram.com/p/TAG1/"); assert.ok(!tg.media[0].mediaId);
    const m = bs.items.find(i => i.kind === "mention"); assert.ok(/^https:\/\/cdn\.bsky\.app/.test(m.media[0].url), "Bluesky direkt");
  });
  await t("Unbekannte Aktion → 400, es wird KEINE Antwort gesendet; Löschen nur bei Kommentaren", async () => {
    const before = S.log.filter(l => /\/messages$/.test(l)).length;
    const r = await act({ platform: "instagram", id: "ig:m:cvA", op: "repot", text: "Hallo" }); assert.strictEqual(r.status, 400); assert.ok(/Unbekannte Aktion/.test(r.j.error));
    assert.strictEqual(S.log.filter(l => /\/messages$/.test(l)).length, before, "nichts gesendet");
    const d = await act({ platform: "facebook", id: "fb:t:pg9_77", op: "delete" }); assert.strictEqual(d.status, 400); assert.ok(!S.log.some(l => /DELETE .*pg9_77/.test(l)), "fremder Beitrag nicht gelöscht");
  });
  await t("Durchreich-Proxy: Bytes und Range, nur bekannte Hosts (auch nach Weiterleitung), 403 → 410 + Status im Zwischenspeicher, nichts auf der Platte", async () => {
    const before = files(dir).filter(f => !/(inbox-cache|state|inbox-msgx)[^/]*$/.test(f));
    const q = (id, m, a, v) => "/admin/api/mkt/inbox/media?brand=kochdu&pf=instagram&id=" + encodeURIComponent(id) + (m ? "&m=" + m : "") + "&a=" + (a || 0) + "&v=" + (v || "full");
    const r = await api(q("ig:m:cvA", "mx01")); assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get("content-type"), "image/jpeg"); assert.strictEqual(r.buf[0], 0xff); assert.ok(/sandbox/.test(r.headers.get("content-security-policy"))); assert.ok(/private/.test(r.headers.get("cache-control")));
    const g = await api(q("ig:m:cvA", "mx02"), null, { Range: "bytes=0-9" }); assert.strictEqual(g.status, 206); assert.strictEqual(g.buf.length, 10); assert.ok(/^bytes 0-9\//.test(g.headers.get("content-range")));
    const pdf = await api(q("ig:m:cvA", "mx04")); assert.strictEqual(pdf.status, 200); assert.strictEqual(pdf.headers.get("content-type"), "application/octet-stream"); assert.ok(/attachment; filename="Angebot_Hochzeit\.pdf"/.test(pdf.headers.get("content-disposition")));
    const tg = await api("/admin/api/mkt/inbox/media?brand=kochdu&pf=instagram&id=ig:t:tg1&a=0&v=prev"); assert.strictEqual(tg.status, 200, "Markierung ohne Nachricht (item.media)");
    assert.strictEqual((await api(q("ig:m:gibtsnicht", "mx01"))).status, 404); assert.strictEqual((await api(q("ig:m:cvA", "mx01", 5))).status, 404); assert.strictEqual((await api(q("ig:m:cvA", "mx01").replace("brand=kochdu", "brand=valuero"))).status, 404);
    const th = item("instagram", "ig:m:cvA").thread, k1 = th.find(m => m.id === "mx11").att;
    k1[0].url = "https://evil.example.com/x.jpg"; const ev = await api(q("ig:m:cvA", "mx11", 0)); assert.strictEqual(ev.status, 404, "fremder Host (SSRF)");
    k1[1].url = CDN + "redir-ext"; const rx = await api(q("ig:m:cvA", "mx11", 1)); assert.strictEqual(rx.status, 404, "Weiterleitung auf fremden Host");
    th.find(m => m.id === "mx05").att[0].url = CDN + "redir-ok"; assert.strictEqual((await api(q("ig:m:cvA", "mx05"))).status, 200, "Weiterleitung innerhalb des CDN");
    th.find(m => m.id === "mx02").att[0].url = CDN + "gone-video.mp4"; const gv = await api(q("ig:m:cvA", "mx02")); assert.strictEqual(gv.status, 410); assert.strictEqual(gv.j.state, "gone"); assert.strictEqual(th.find(m => m.id === "mx02").att[0].state, "gone");
    th.find(m => m.id === "mx07").att[0].url = CDN + "gone-story-b.jpg"; const gs = await api(q("ig:m:cvA", "mx07")); assert.strictEqual(gs.status, 410); assert.strictEqual(gs.j.state, "expired", "Story → abgelaufen");
    await PT.inboxFlush(); const after = files(dir).filter(f => !/(inbox-cache|state|inbox-msgx)[^/]*$/.test(f)); assert.deepStrictEqual(after, before, "keine Datei gespeichert");
    const saved = fs.readFileSync(path.join(dir, "marketing", "inbox-cache.json"), "utf8"); assert.ok(/"state":"expired"/.test(saved) && saved.indexOf("ig-long") < 0);
  });
  await t("„In meine Story teilen“: Deep-Link + QR nur aus der Allowlist; „Geteilt“ wird vermerkt und bleibt nach dem Auffrischen", async () => {
    const r = await act({ platform: "instagram", id: "ig:m:cvA", op: "deeplink" }); assert.strictEqual(r.status, 200, JSON.stringify(r.j)); assert.strictEqual(r.j.url, "https://ig.me/m/lisa.montafon"); assert.ok(/<svg[\s>]/.test(r.j.qr), "QR-Code als SVG");
    const tg = await act({ platform: "instagram", id: "ig:t:tg1", op: "deeplink" }); assert.strictEqual(tg.j.url, "https://www.instagram.com/p/TAG1/");
    const it = item("instagram", "ig:m:cvB"); it.links = { app: "javascript:alert(1)", web: "https://evil.example.com/" };
    const bad = await act({ platform: "instagram", id: "ig:m:cvB", op: "deeplink" }); assert.strictEqual(bad.status, 400);
    const pub = (await api("/admin/api/mkt/inbox/all")).j.brands.kochdu.channels.find(c => c.platform === "instagram").items.find(i => i.id === "ig:m:cvB"); assert.deepStrictEqual(pub.links, {}, "manipulierte Links gehen nicht ans Cockpit");
    const sh = await act({ platform: "instagram", id: "ig:m:cvA", op: "shared" }); assert.strictEqual(sh.j.item.shared.via, "app"); assert.strictEqual(sh.j.item.done, true);
    await PT.refreshInbox("kochdu"); assert.ok(item("instagram", "ig:m:cvA").shared, "bleibt nach dem Auffrischen");
  });
  await t("Als eigene Story hochladen: ohne Häkchen 400, Story-Erwähnung 400; mit Einverständnis 1080×1920-JPEG über /m/s….jpg, Urheber markiert, Datei danach weg", async () => {
    const no = await act({ platform: "instagram", id: "ig:t:tg1", op: "story_reupload" }); assert.strictEqual(no.status, 400); assert.ok(/bestätigen/.test(no.j.error));
    const sm = await act({ platform: "instagram", id: "ig:m:cvA", op: "story_reupload", consent: true }); assert.strictEqual(sm.status, 400); assert.strictEqual(sm.j.error, "Story-Erwähnungen lassen sich nur in der Instagram-App teilen.");
    if (!R.videoReady()) { console.log("  (Story-Neu-Upload übersprungen: ffmpeg fehlt)"); return; }
    const src = path.join(dir, "tag-src.jpg"); await R.ffmpeg(["-y", "-f", "lavfi", "-i", "color=c=orange:s=640x800", "-frames:v", "1", src]); S.cdnFiles = { "ok-tag1.jpg": fs.readFileSync(src) }; fs.unlinkSync(src);
    S.fetched.length = 0; S.igParams = [];
    const ok = await act({ platform: "instagram", id: "ig:t:tg1", op: "story_reupload", consent: true }); assert.strictEqual(ok.status, 200, JSON.stringify(ok.j));
    const pr = S.igParams[0]; assert.strictEqual(pr.media_type, "STORIES"); assert.deepStrictEqual(JSON.parse(pr.user_tags), [{ username: "anna.k" }]);
    const f = S.fetched.find(x => /\/m\/s[0-9a-f]{16}\.jpg$/.test(x.url)); assert.ok(f && f.status === 200 && f.type === "image/jpeg", "Instagram holt die Datei");
    const name = f.url.split("/").pop(); assert.ok(!fs.existsSync(path.join(MEDIA, name)), "Datei gelöscht");
    const jb = S.storyBuf, sof = (() => { for (let i = 2; i < jb.length - 9; i++) if (jb[i] === 0xff && (jb[i + 1] === 0xc0 || jb[i + 1] === 0xc2)) return [jb.readUInt16BE(i + 7), jb.readUInt16BE(i + 5)]; return null; })();
    assert.deepStrictEqual(sof, [1080, 1920], "Story-Format 1080×1920"); if (process.env.ANH_DUMP) fs.writeFileSync(process.env.ANH_DUMP, jb);   // zum Ansehen assert.strictEqual((await fetch(ADM + "/m/" + name)).status, 404, "nicht mehr öffentlich");
    assert.strictEqual(ok.j.item.shared.via, "reupload"); assert.ok(S.posts.some(p => p.pf === "instagram"));
    // Markierung abgelehnt → ohne, mit Hinweis
    S.igParams = []; S.failNext["/ig/v26.0/1784/media"] = { status: 400, message: "Invalid parameter: user_tags", method: "POST" };
    const nt = await act({ platform: "instagram", id: "ig:t:tg1", op: "story_reupload", consent: true }); assert.strictEqual(nt.status, 200, JSON.stringify(nt.j)); assert.ok(/Markierung/.test(nt.j.note)); assert.ok(!S.igParams[0].user_tags, "zweiter Versuch ohne Markierung");
    const t2 = await act({ platform: "instagram", id: "ig:t:tg2", op: "story_reupload", consent: true }); assert.strictEqual(t2.status, 400, "ohne media_url nur in der App");
    assert.ok(!files(MEDIA).some(x => /\/s[0-9a-f]{16}\./.test(x)), "keine Story-Dateien übrig");
  });
  await t("/m/: Story-Dateien nur solange vorgemerkt, Post-Dateien wie bisher", async () => {
    fs.mkdirSync(MEDIA, { recursive: true }); fs.writeFileSync(path.join(MEDIA, "s0123456789abcdef.jpg"), "x");
    assert.strictEqual((await fetch(ADM + "/m/s0123456789abcdef.jpg")).status, 404); assert.strictEqual((await fetch(ADM + "/m/s0123.jpg")).status, 404); assert.strictEqual((await fetch(ADM + "/m/pabc-0123456789abcdef.jpg")).status, 404);
  });
  await t("Bluesky: Reposten und Zitieren (richtige Collection, Bezug), Ergebnis bleibt; bei Antworten nicht erlaubt", async () => {
    const id = "bs:at://did:plc:u5/app.bsky.feed.post/m1"; S.records.length = 0;
    const r = await act({ platform: "bluesky", id, op: "repost" }); assert.strictEqual(r.status, 200, JSON.stringify(r.j)); assert.ok(r.j.item.reposted);
    assert.strictEqual(S.records[0].collection, "app.bsky.feed.repost"); assert.deepStrictEqual(S.records[0].record.subject, { uri: "at://did:plc:u5/app.bsky.feed.post/m1", cid: "cm1" });
    const qq = await act({ platform: "bluesky", id, op: "quote", text: "Danke dir, Eva! #kochdu" }); assert.strictEqual(qq.status, 200, JSON.stringify(qq.j));
    const rec = S.records[1]; assert.strictEqual(rec.collection, "app.bsky.feed.post"); assert.strictEqual(rec.record.embed.$type, "app.bsky.embed.record"); assert.strictEqual(rec.record.embed.record.uri, "at://did:plc:u5/app.bsky.feed.post/m1"); assert.strictEqual(rec.record.facets.length, 1);
    const no = await act({ platform: "bluesky", id: "bs:at://did:plc:u7/app.bsky.feed.post/r1", op: "repost" }); assert.strictEqual(no.status, 400);
    await PT.refreshInbox("kochdu"); assert.ok(item("bluesky", id).reposted && item("bluesky", id).quoted);
  });
  await t("Mitteilung: neue Story-Erwähnung mit Restzeit und eigenem Tag, nie doppelt; Markierung mit eigenem Titel", async () => {
    const box = () => PT.INBOX.get("kochdu"); box().at -= 5 * 60e3; await PT.pollInbox(); pushes.length = 0;   // erster Durchlauf merkt nur
    const lisa = { id: "u1", username: "lisa.montafon" };
    S.inbox.igConv[0].messages.data.unshift({ id: "mx30", created_time: ago(1), from: lisa, story: { mention: { link: CDN + "ok-story30.jpg", id: "st30" } } });
    S.inbox.tags.unshift({ id: "tg9", username: "toni.r", caption: "Mit @kochdu.at", media_type: "IMAGE", media_url: CDN + "ok-tag9.jpg", permalink: "https://www.instagram.com/p/TAG9/", timestamp: ago(2) });
    box().at -= 5 * 60e3; Object.values(PT.S().mkt.inboxLvl).forEach(s => { if (s.tags) s.tags.at = 0; });
    await PT.pollInbox();
    const sm = pushes.filter(p => /Story-Erwähnung/.test(p.title)); assert.strictEqual(sm.length, 1, JSON.stringify(pushes)); assert.strictEqual(sm[0].title, "📣 Story-Erwähnung: @lisa.montafon"); assert.strictEqual(sm[0].tag, "mkt-sm-mx30"); assert.ok(/^noch 2[34] h teilbar · /.test(sm[0].body), sm[0].body);
    assert.ok(pushes.some(p => /Markiert: toni\.r/.test(p.title)), JSON.stringify(pushes));
    pushes.length = 0; box().at -= 5 * 60e3; await PT.pollInbox(); assert.strictEqual(pushes.length, 0, "nicht doppelt");
  });
  await t("Zwischenspeicher: 5 Marken × 25 Unterhaltungen × 50 Nachrichten (20 % mit Anhang) bleiben unter 6 MB", async () => {
    const save = new Map(PT.INBOX); PT.INBOX.clear(); const u = n => "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=" + "1".repeat(16) + n + "&signature=" + "AbC".repeat(60);
    for (const k of ["kochdu", "valuero", "skikaiser", "blitzdings", "kantineur"]) PT.INBOX.set(k, { at: Date.now(), channels: [{ platform: "instagram", label: "Instagram", account: "@x", posts: [], notes: [],
      items: Array.from({ length: 25 }, (_, c) => ({ id: "ig:m:c" + c, kind: "message", from: { name: "nutzer" + c }, text: "Hallo", at: ago(c), links: { app: "https://ig.me/m/nutzer" + c }, can: { reply: true }, ref: { recipient: "r" + c },
        thread: Array.from({ length: 50 }, (_, i) => Object.assign({ id: "m" + c + "_" + i, from: { name: "nutzer" + c }, text: i % 5 ? "Nachricht Nummer " + i + " mit etwas Text, wie man ihn halt so schreibt." : "", at: ago(c * 60 + i), mine: i % 3 === 0 },
          i % 5 ? {} : { label: "📷 Foto", att: [{ t: "image", url: u(c * 100 + i), prev: u(c * 100 + i) + "&p=1", w: 1080, h: 1350, state: "ok" }] })) })) }] });
    await PT.inboxFlush(); const sz = fs.statSync(path.join(dir, "marketing", "inbox-cache.json")).size;
    assert.ok(sz < 6e6, "Größe " + sz); const j = JSON.parse(fs.readFileSync(path.join(dir, "marketing", "inbox-cache.json"), "utf8")); assert.strictEqual(Object.keys(j.boxes).length, 5);
    PT.INBOX.clear(); save.forEach((v, k) => PT.INBOX.set(k, v));
  });

  adm.close(); mock.server.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  console.log("inbox-anhaenge: " + pass + " ok, " + fail + " fehlgeschlagen");
  if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
  process.exit(0);
})();
