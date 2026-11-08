/* SmartStock service worker — OPTIONAL. Only registered when the user turns on "Offline app" in Settings.
 * Caches the app files (HTML, CSS, JS, icons) so the app opens with no internet. It never touches business data:
 * records live in localStorage/IndexedDB, not in this cache, and only GET requests for app files and fonts are cached.
 * Same-origin files are fetched network-first, so editing code during development (Live Server) still shows your
 * changes while online. Fonts are cached the first time they load online, so they are not guaranteed offline before that.
 */
const VERSION = 'smartstock-shell-v11';
const FONTS = 'smartstock-fonts-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'styles.css', 'print.css', 'app.js', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('smartstock-') && k !== VERSION && k !== FONTS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return; const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then((c) => c.match(req).then((hit) => { const net = fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => hit); return hit || net; })));
  }
});
