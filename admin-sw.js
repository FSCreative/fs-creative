/* Service Worker des FS Cockpits: zeigt Push-Benachrichtigungen (neue Mail, Anfrage, Finanzen) und öffnet beim Antippen die passende Seite. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "FS Cockpit", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "FS Cockpit", { body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag, icon: "/logos/cockpit-icon-180.png", badge: "/logos/cockpit-favicon.png", data: { url: d.url || "/admin" } }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close(); var url = (e.notification.data && e.notification.data.url) || "/admin";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if (cs[i].url.indexOf("/admin") > -1 && "focus" in cs[i]) { cs[i].navigate && cs[i].navigate(url); return cs[i].focus(); } }
    return self.clients.openWindow(url);
  }));
});
