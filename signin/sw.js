/* RCK Sign In service worker — cache the app shell so the tablet keeps working
   if the office wifi drops. Records live in IndexedDB, not in this cache. */
const CACHE = 'rck-signin-v1';
const ASSETS = [
  './', './index.html', './app.css',
  './js/store.js', './js/reports.js', './js/xlsx.js', './js/pdf.js', './js/app.js',
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;   // never cache the sync endpoint
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
