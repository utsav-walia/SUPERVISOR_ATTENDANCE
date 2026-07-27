/* Attendance CRM service worker
 * ---------------------------------------------------------------------------
 * Rules it must never break:
 *   1. Never respond with undefined — that renders a blank page.
 *   2. Never touch anything that isn't ours (Google Sheets calls go straight out).
 *   3. Never cache admin.html — the console is a desk tool and must always be fresh.
 *   4. A failure anywhere falls through to the network, never to a blank screen.
 *   5. Cache under the address WITHOUT its query string. Supervisors always
 *      arrive at ./?s=TOKEN; if the refreshed copy is filed under the token while
 *      lookups keep matching the plain ./ entry, the phone serves the install-time
 *      app for ever and no fix ever reaches it. This bit is load-bearing.
 */
const CACHE = 'attendance-crm-v4';
const ASSETS = [
  './', './index.html', './config.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];

/** The cache key for a request: same address, query and hash stripped. */
function keyFor(input) {
  const u = new URL(typeof input === 'string' ? input : input.url, self.location.href);
  u.search = '';
  u.hash = '';
  return u.href;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // one at a time: a single missing file must not abort the whole install,
    // which would leave an empty cache and a broken app
    await Promise.all(ASSETS.map(async u => {
      try {
        const r = await fetch(u, { cache: 'reload' });
        if (r && r.ok) await c.put(keyFor(u), r);
      } catch (err) { /* offline during install; the network path will cope */ }
    }));
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

  const key = keyFor(req);

  e.respondWith((async () => {
    // 1. cached copy, refreshed quietly in the background under the same key
    try {
      const hit = await caches.match(key);
      if (hit) {
        fetch(req).then(r => {
          if (r && r.ok) caches.open(CACHE).then(c => c.put(key, r.clone())).catch(() => {});
        }).catch(() => {});
        return hit;
      }
    } catch (err) { /* fall through to the network */ }

    // 2. straight from the network, cached for next time
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const copy = fresh.clone();
        caches.open(CACHE).then(c => c.put(key, copy)).catch(() => {});
      }
      return fresh;
    } catch (err) { /* offline */ }

    // 3. offline and never seen this page — serve the app shell if we have it
    try {
      const shell = await caches.match(keyFor('./index.html'));
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
