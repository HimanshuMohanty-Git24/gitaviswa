// GitaViswa service worker — makes the graph, verses, commentaries and app shell available offline.
// Cache-first for immutable build assets and the knowledge-graph data; network-first for pages and APIs.
// Bump VERSION when files under /images/ are replaced in place (they are cache-first and not content-hashed).
const VERSION = "gitaviswa-v2";
const SHELL = ["/", "/data/gita-verses.json", "/data/gita-graph.json", "/favicon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const cacheFirst = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/data/") || url.pathname.startsWith("/images/");
  if (cacheFirst) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && e.request.mode === "navigate") caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("/"))),
  );
});
