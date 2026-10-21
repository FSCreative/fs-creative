/* Marketing › Posteingang (mkt-publish.js inbox/inboxReply/inboxLike): Kommentare, Nachrichten, Likes je Plattform einheitlich, Antworten an die richtige Adresse. */
"use strict";
const assert = require("assert");
const http = require("http");
const path = require("path");
let pass = 0, fail = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; fails.push(name + "\n    " + (e && e.stack || e)); } }

const calls = [];
const srv = http.createServer((req, res) => {
  let b = ""; req.on("data", c => { b += c; }); req.on("end", () => {
    const u = new URL(req.url, "http://x"), p = u.pathname; calls.push({ m: req.method, p, q: Object.fromEntries(u.searchParams), body: b, auth: req.headers.authorization || "" });
    const J = (o, s) => { res.writeHead(s || 200, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    // Instagram
    if (p === "/ig/v26.0/17841/media") return J({ data: [{ id: "m1", caption: "Pizza-Tag", permalink: "https://ig/p/1", timestamp: "2026-10-20T10:00:00+0000", like_count: 42, comments_count: 2, media_url: "https://img/1.jpg" }, { id: "m2", caption: "leer", like_count: 3, comments_count: 0 }] });
    if (p === "/ig/v26.0/m1/comments") return J({ data: [{ id: "c1", username: "lisa", text: "Lecker!", timestamp: "2026-10-20T11:00:00+0000", like_count: 1, replies: { data: [{ id: "c1r", username: "kochdu_at", text: "Danke!", timestamp: "2026-10-20T12:00:00+0000" }] } }] });
    if (p === "/ig/v26.0/me/conversations") return u.searchParams.get("access_token") === "nomsg" ? J({ error: { message: "(#3) Application does not have the capability", type: "OAuthException" } }, 400)
      : J({ data: [{ id: "cv1", updated_time: "2026-10-21T08:00:00+0000", participants: { data: [{ id: "17841", username: "kochdu_at" }, { id: "u77", username: "markus" }] }, messages: { data: [{ id: "x2", from: { id: "u77", username: "markus" }, message: "Liefert ihr nach Schruns?", created_time: "2026-10-21T08:00:00+0000" }, { id: "x1", from: { id: "17841", username: "kochdu_at" }, message: "Hallo!", created_time: "2026-10-21T07:00:00+0000" }] } }] });
    if (p === "/ig/v26.0/c1/replies" && req.method === "POST") return J({ id: "new1" });
    if (p === "/ig/v26.0/17841/messages" && req.method === "POST") return J({ message_id: "mid" });
    // Facebook
    if (p === "/fb/v26.0/555/posts") return J({ data: [{ id: "555_1", message: "Neue Karte", permalink_url: "https://fb/p", full_picture: "https://img/f.jpg", created_time: "2026-10-19T10:00:00+0000", reactions: { summary: { total_count: 17 } },
      comments: { summary: { total_count: 2 }, data: [{ id: "fc1", message: "Super", from: { id: "9", name: "Anna" }, created_time: "2026-10-19T11:00:00+0000" }, { id: "fc2", message: "Danke Anna", from: { id: "555", name: "kochdu" }, created_time: "2026-10-19T12:00:00+0000", parent: { id: "fc1" } }] } }] });
    if (p === "/fb/v26.0/555/conversations") return J({ data: [] });
    if (p === "/fb/v26.0/fc1/comments" && req.method === "POST") return J({ id: "fc3" });
    if (p === "/fb/v26.0/fc1/likes" && req.method === "POST") return J({ success: true });
    // Bluesky
    if (p === "/bsky/xrpc/app.bsky.notification.listNotifications") return J({ notifications: [
      { uri: "at://u1/like/1", cid: "c", reason: "like", reasonSubject: "at://me/app.bsky.feed.post/p1", author: { did: "u1", handle: "eva.bsky.social", displayName: "Eva" }, indexedAt: "2026-10-21T09:00:00Z", isRead: false },
      { uri: "at://u2/app.bsky.feed.post/r1", cid: "cr1", reason: "reply", reasonSubject: "at://me/app.bsky.feed.post/p1", author: { did: "u2", handle: "max.bsky.social" }, record: { text: "Wann öffnet ihr?", reply: { root: { uri: "at://me/app.bsky.feed.post/p1", cid: "cp1" }, parent: { uri: "at://me/app.bsky.feed.post/p1", cid: "cp1" } } }, indexedAt: "2026-10-21T09:30:00Z", isRead: true }] });
    if (p === "/bsky/xrpc/app.bsky.feed.getPosts") return J({ posts: [{ uri: "at://me/app.bsky.feed.post/p1", record: { text: "Hallo Montafon" }, indexedAt: "2026-10-21T08:00:00Z" }] });
    if (p === "/bsky/xrpc/com.atproto.repo.createRecord") return J({ uri: "at://me/x/1", cid: "n" });
    J({ error: { message: "unbekannt " + p } }, 404);
  });
});

(async () => {
  await new Promise(r => srv.listen(0, "127.0.0.1", r)); const base = "http://127.0.0.1:" + srv.address().port;
  const P = require(path.join(__dirname, "..", "mkt-publish.js"))({ base: { ig: base + "/ig", fb: base + "/fb", bsky: base + "/bsky" }, waitMs: 1 });
  const ig = { platform: "instagram", account: { id: "17841", handle: "@kochdu_at" } };

  await t("Instagram: Kommentare mit eigener Antwort, Likes je Beitrag, Direktnachricht als Verlauf", async () => {
    const r = await P.inbox("instagram", ig, { access: "tok" });
    assert.deepStrictEqual(r.posts.map(p => p.likes), [42, 3]); assert.ok(!calls.some(c => c.p === "/ig/v26.0/m2/comments"), "Beitrag ohne Kommentare wird nicht abgefragt");
    const c = r.items.find(i => i.kind === "comment"); assert.strictEqual(c.from.name, "lisa"); assert.strictEqual(c.replies[0].mine, true); assert.strictEqual(c.post.text, "Pizza-Tag"); assert.deepStrictEqual(c.ref, { comment: "c1" });
    const m = r.items.find(i => i.kind === "message"); assert.strictEqual(m.from.name, "markus"); assert.strictEqual(m.text, "Liefert ihr nach Schruns?"); assert.strictEqual(m.thread[0].mine, true); assert.strictEqual(m.thread[1].mine, false); assert.strictEqual(m.ref.recipient, "u77");
  });
  await t("Instagram: fehlende Nachrichten-Berechtigung → Hinweis statt Fehler, Kommentare bleiben", async () => {
    const r = await P.inbox("instagram", ig, { access: "nomsg" }); assert.ok(r.items.some(i => i.kind === "comment")); assert.ok(/Nachrichten: Berechtigung fehlt/.test(r.notes[0]), r.notes[0]);
  });
  await t("Instagram: Antwort auf Kommentar und Direktnachricht gehen an die richtige Schnittstelle", async () => {
    await P.inboxReply("instagram", ig, { access: "tok" }, { comment: "c1" }, "Danke dir!", "comment");
    const a = calls.filter(c => c.p === "/ig/v26.0/c1/replies").pop(); assert.ok(/message=Danke\+dir/.test(a.body));
    await P.inboxReply("instagram", ig, { access: "tok" }, { recipient: "u77" }, "Ja, tun wir!", "message");
    const b = JSON.parse(calls.filter(c => c.p === "/ig/v26.0/17841/messages").pop().body); assert.deepStrictEqual(b, { recipient: { id: "u77" }, message: { text: "Ja, tun wir!" } });
    await assert.rejects(P.inboxReply("instagram", ig, { access: "tok" }, { comment: "c1" }, "   ", "comment"), /Text/);
  });
  await t("Facebook: Antworten unter dem Kommentar, Reaktionen je Beitrag, Kommentar liken", async () => {
    const fb = { platform: "facebook", account: { id: "555" } }, r = await P.inbox("facebook", fb, { access: "pt" });
    assert.strictEqual(r.posts[0].likes, 17); assert.strictEqual(r.items.length, 1, "Antwort ist kein eigener Eintrag"); assert.strictEqual(r.items[0].replies[0].mine, true); assert.strictEqual(r.items[0].can.like, true);
    await P.inboxLike("facebook", fb, { access: "pt" }, { comment: "fc1" }); assert.ok(calls.some(c => c.p === "/fb/v26.0/fc1/likes"));
    await P.inboxReply("facebook", fb, { access: "pt" }, { comment: "fc1" }, "Gern!", "comment"); assert.ok(calls.some(c => c.p === "/fb/v26.0/fc1/comments" && /Gern/.test(c.body)));
  });
  await t("Bluesky: Likes mit Namen, Antworten mit Thread-Bezug", async () => {
    const bs = { platform: "bluesky", account: { id: "did:me" } }, r = await P.inbox("bluesky", bs, { access: "jwt", handle: "kochdu.bsky.social" });
    const like = r.items.find(i => i.kind === "like"); assert.strictEqual(like.from.name, "Eva"); assert.strictEqual(like.post.text, "Hallo Montafon"); assert.strictEqual(like.isNew, true);
    const rep = r.items.find(i => i.kind === "comment"); assert.strictEqual(rep.text, "Wann öffnet ihr?");
    await P.inboxReply("bluesky", bs, { access: "jwt" }, rep.ref, "Ab 11 Uhr!", "comment");
    const rec = JSON.parse(calls.filter(c => c.p === "/bsky/xrpc/com.atproto.repo.createRecord").pop().body).record;
    assert.strictEqual(rec.reply.parent.uri, "at://u2/app.bsky.feed.post/r1"); assert.strictEqual(rec.reply.root.uri, "at://me/app.bsky.feed.post/p1");
  });
  await t("Plattformen ohne Schnittstelle: verständlicher Hinweis", async () => {
    const r = await P.inbox("tiktok", { account: {} }, { access: "x" }); assert.strictEqual(r.items.length, 0); assert.ok(/direkt in der App/.test(r.notes[0]));
  });
  srv.close();
  console.log("inbox: " + pass + " ok, " + fail + " fehlgeschlagen");
  if (fail) { fails.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
  process.exit(0);
})();
