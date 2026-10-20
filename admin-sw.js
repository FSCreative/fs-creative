/* Service Worker des FS Cockpits: zeigt Push-Benachrichtigungen (neue Mail, Anfrage, Finanzen) und die Hinweise der offenen Cockpit-Seite
   (auch in der installierten App am PC/Handy) und holt beim Antippen das Cockpit nach vorne – ohne Neuladen, die Seite wechselt nur die Ansicht. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
/* gleiche Meldung (gleicher tag) schon sichtbar → still ersetzen statt doppelt klingeln (Push und Seiten-Hinweis zur selben Mail) */
function show(title, o) {
  var same = o.tag ? self.registration.getNotifications({ tag: o.tag }) : Promise.resolve([]);
  return same.then(function (l) { o.renotify = !!o.tag && !l.length; return self.registration.showNotification(title, o); });
}
self.addEventListener("push", function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "FS Cockpit", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(show(d.title || "FS Cockpit", { body: d.body || "", tag: d.tag || undefined, icon: "/logos/cockpit-icon-180.png", badge: "/logos/cockpit-favicon.png", data: { url: d.url || "/admin" } }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close(); var url = (e.notification.data && e.notification.data.url) || "/admin";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if (cs[i].url.indexOf("/admin") > -1 && "focus" in cs[i]) { try { cs[i].postMessage({ type: "fsc-go", url: url }); } catch (x) {} return cs[i].focus(); } }
    return self.clients.openWindow(url);
  }));
});
