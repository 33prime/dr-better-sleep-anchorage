// Dr. Better Sleep — service worker for offline use.
// Strategy: cache the app shell + screens at install; network-first for navigations
// (so updates appear), cache-first for static assets.

const CACHE = 'dr-better-sleep-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/screens/_anchorage.css',
  '/screens/01-dashboard-light.html',
  '/screens/02-dashboard-dark.html',
  '/screens/03-morning-reveal.html',
  '/screens/04-chat.html',
  '/screens/05-trends.html',
  '/screens/06-night.html',
  '/screens/07-onboarding-triage.html',
  '/screens/08-detailed-night.html',
  '/screens/09-boil-and-bite.html',
  '/screens/10-device-overview.html',
  '/screens/11-chat-rich.html',
  '/screens/12-comparisons.html',
  '/screens/13-reorder.html',
  '/screens/14-science.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle same-origin requests; let the network handle Google Fonts etc.
  if (url.origin !== self.location.origin) return;

  // HTML / navigations → network first, fall back to cache.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((m) => m || caches.match('/index.html'))
        )
    );
    return;
  }

  // Static assets → cache first, then network.
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
