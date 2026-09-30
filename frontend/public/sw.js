// AntiBrainRot service worker.
//
// Its only job is Web Push: receive a push from the backend and show a
// notification, then open or focus the app on the right screen when the
// notification is tapped. There is deliberately no offline caching here,
// so the app stays network-first and never serves a stale build.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "AntiBrainRot";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "New topics are ready.",
      tag: data.tag || "daily-reading",
      data: { url: data.url || "/" },
      icon: "/brand/logo.png",
      badge: "/brand/favicon-32.png",
    })
  );
});

// Focus an existing tab if one is open (navigating it to the target
// screen), otherwise open a new one. Both paths keep a single app window
// rather than piling up tabs.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});
