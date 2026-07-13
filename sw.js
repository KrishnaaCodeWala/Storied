/* STORIED service worker — cache-first so the game runs offline once
   visited. Pack JSON is cached at first play (runtime caching), so any
   pack you've opened works offline forever. Bump VERSION on changes. */
const VERSION = "storied-v3.5.0";
const FILES = [
  ".", "index.html", "style.css", "strings.js", "motifs.js", "packstore.js",
  "packcheck.js", "online.js", "achievements.js", "decks.js", "studio.js", "game.js", "manifest.json", "icon-192.png", "icon-512.png",
  "packs/index.json", "packs/core.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const isPack = new URL(e.request.url).pathname.includes("/packs/");
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        // runtime-cache pack files so played packs survive offline
        if (isPack && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      });
    })
  );
});
