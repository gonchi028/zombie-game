// Offline support. Every file the game loads is kept in a cache, and served from it when there's no
// network. Network first, so a new deploy reaches players right away whenever they're online.
// main.js registers this and then sends the list of files the page already loaded (before the worker
// was running), so the very first visit is enough to play offline afterwards.
const CACHE = 'last-light';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// the page's own files (same origin, plain GETs); never the dev sandbox
const cacheable = (url) => url.origin === location.origin && !url.pathname.includes('/dev');

self.addEventListener('message', (e) => {
  if (e.data?.type !== 'precache') return;
  const urls = e.data.urls.filter((u) => cacheable(new URL(u)));
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(urls.map((u) => c.add(u).catch(() => {})))));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || !cacheable(url)) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: true });
        // offline on a URL we never cached (say /index.html instead of /): open the game anyway
        const page = !hit && req.mode === 'navigate' ? await caches.match(new URL('./', location.href)) : null;
        return hit || page || Response.error();
      }),
  );
});
