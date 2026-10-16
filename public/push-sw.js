// Reminders (docs/backend.md, "Reminders"), loaded into the service worker
// that vite-plugin-pwa makes (vite.config.js, workbox.importScripts). The
// server sends { title, body, url, tag }, encrypted for this device.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Lingo", {
      body: data.body || "",
      tag: data.tag || "lingo",
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      lang: data.lang,
      data: { url: data.url || "/" },
    })
  );
});

// Opens Lingo, or brings an open Lingo window to the front.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow(url.href);
    })
  );
});
