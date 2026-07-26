/* Attendance CRM service worker — cache-first, fully offline. */
const CACHE = 'attendance-crm-v2';
const ASSETS = [
  './', './index.html', './admin.html', './config.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // never cache calls to the Google Sheet backend
  if (e.request.url.indexOf('script.google.com') > -1 ||
      e.request.url.indexOf('script.googleusercontent.com') > -1) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      if (hit) {
        // Refresh in the background so updates land on the next launch.
        fetch(e.request).then(r => {
          if (r && r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(e.request)
        .then(r => {
          if (r && r.ok && new URL(e.request.url).origin === location.origin) {
            const copy = r.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return r;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
