/* Offline support for the SDG 4 site.
   Online, pages come from the network and a copy is kept. Offline, the saved copy is used.
   build.py fills in VERSION and SHELL, so each new build replaces the old copies. */
const VERSION = '20261029180003';
const CACHE = 'sdg4-' + VERSION;
const SHELL = ["index.html", "facts.html", "targets.html", "explore.html", "solutions.html", "action.html", "quiz.html", "timer.html", "about.html", "slides.html", "site.css", "site.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
