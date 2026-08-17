/* ============================================================================
   SERVICE WORKER
   ----------------------------------------------------------------------------
   Keeps a copy of the app on your phone so it opens instantly and works with no
   signal. Your logged data is never touched by this file — that lives in the
   browser's own storage and is not part of the cache.

   IF YOU EDIT THE APP AND YOUR PHONE STILL SHOWS THE OLD VERSION:
   bump the number in CACHE below (v1 -> v2). That is the switch that tells
   every phone to throw away the old copy and pull the new one.
   ========================================================================== */

const CACHE = 'ascent-v13';

const FILES = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './js/ui.js',
  './js/boot.js',
  './js/engine.js',
  './js/store.js',
  './js/badges.js',
  './js/config.js',
  './js/ids.js',
  './js/icons.js',
  './js/dom.js',
  './js/sheet.js',
  './js/metrics.js',
  './js/metrics-habits.js',
  './js/metrics-workouts.js',
  './js/metrics-weight.js',
  './js/chart.js',
  './js/analyze.js',
  './js/workouts.js',
  './js/train.js',
  './js/weight.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      /* addAll fails the whole install if any single file 404s, so add them
         individually and tolerate misses. */
      .then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* Network first, cache as the safety net: you always get the newest version
   when you have signal, and the app still opens when you don't. */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))),
  );
});
