/* TEE Tracker service worker — stale-while-revalidate, offline-first.
   Bump VERSION on every release so old caches are removed on activate. */
const VERSION = 'v1';
const PREFIX = 'tee-tracker-';
const CACHE = PREFIX + VERSION;

// Same-origin files are resolved relative to sw.js, so this works in a GitHub Pages subfolder.
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
// Third-party script(s): cached best-effort as opaque (no-cors) responses.
const CDN = ['https://cdn.tailwindcss.com'];
const CDN_HOSTS = ['cdn.tailwindcss.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 'reload' bypasses the HTTP cache so a new version never precaches stale files.
    await cache.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));
    await Promise.all(CDN.map(async u => {
      try { await cache.put(u, await fetch(new Request(u, { mode: 'no-cors' }))); }
      catch (_) { /* offline during install: it will be cached on first online load */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const ours = url.origin === self.location.origin;
  if (!ours && !CDN_HOSTS.includes(url.hostname)) return; // leave everything else to the browser

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req)
      .then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; })
      .catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }       // instant, refresh in background
    const fresh = await network;
    if (fresh) return fresh;
    if (req.mode === 'navigate') { const shell = await cache.match('./index.html'); if (shell) return shell; }
    return Response.error();
  })());
});
