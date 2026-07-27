/* Attendance CRM service worker
 * ---------------------------------------------------------------------------
 * Rules it must never break:
 *   1. Never respond with undefined — that renders a blank page.
 *   2. Never touch anything that isn't ours (Google Sheets calls go straight out).
 *   3. Never cache admin.html — the console is a desk tool and must always be fresh.
 *   4. A failure anywhere falls through to the network, never to a blank screen.
 */
const CACHE = 'attendance-crm-v3';
const ASSETS = [
  './', './index.html', './config.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // one at a time: a single missing file must not abort the whole install,
    // which would leave an empty cache and a broken app
    await Promise.all(ASSETS.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // anything not on our own site — Apps Script, Google, CDNs — is none of our business
  if (url.origin !== self.location.origin) return;
  // the head-office console must never be served from cache
  if (url.pathname.indexOf('admin.html') > -1) return;

  e.respondWith((async () => {
    // 1. cached copy, refreshed quietly in the background
    try {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) {
        fetch(req).then(r => {
          if (r && r.ok) caches.open(CACHE).then(c => c.put(req, r.clone())).catch(() => {});
        }).catch(() => {});
        return hit;
      }
    } catch (err) { /* fall through to the network */ }

    // 2. straight from the network, cached for next time
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const copy = fresh.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch (err) { /* offline */ }

    // 3. offline and never seen this page — serve the app shell if we have it
    try {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    } catch (err) { /* nothing cached at all */ }

    // 4. last resort — a real response, never undefined
    return new Response(
      'You are offline and this page has not been opened before. ' +
      'Reconnect once and it will work without signal afterwards.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  })());
});
