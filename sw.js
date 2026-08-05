/* Ledgerly service worker — offline-first caching of the app shell.
   User data lives in IndexedDB (not here); this only caches static assets. */
const VERSION = 'ledgerly-v1';
const ASSETS = [
  './app/',
  './app/index.html',
  './assets/css/app.css',
  './assets/js/util.js',
  './assets/js/db.js',
  './assets/js/store.js',
  './assets/js/charts.js',
  './assets/js/modals.js',
  './assets/js/views.js',
  './assets/js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Network-first for HTML/navigation so updates land; cache-first for assets.
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(fetch(req).then((res) => { cachePut(req, res.clone()); return res; }).catch(() => caches.match(req).then((m) => m || caches.match('./app/'))));
    return;
  }
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => { cachePut(req, res.clone()); return res; }).catch(() => cached))
  );
});

function cachePut(req, res) {
  if (res && res.status === 200) caches.open(VERSION).then((c) => c.put(req, res)).catch(() => {});
}
