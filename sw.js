/* SmartStock service worker — OPTIONAL. Only registered when the user turns on "Offline app" in Settings.
 * Caches the app files (HTML, CSS, JS, icons) so the app opens with no internet. It never touches business data:
 * records live in localStorage/IndexedDB, not in this cache, and only GET requests for app files and fonts are cached.
 * Same-origin files are fetched network-first, so editing code during development (Live Server) still shows your
 * changes while online. Fonts are cached the first time they load online, so they are not guaranteed offline before that.
 */
const VERSION = 'smartstock-shell-v10';
const FONTS = 'smartstock-fonts-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/styles.css', 'css/responsive.css', 'css/print.css',
  'js/utils.js', 'js/i18n-my.js', 'js/storage.js', 'js/audit-log.js', 'js/settings.js', 'js/inventory.js', 'js/categories.js', 'js/barcode.js', 'js/products.js', 'js/stocktake.js', 'js/payments.js', 'js/sales.js', 'js/pos.js',
  'js/suppliers.js', 'js/customers.js', 'js/purchases.js', 'js/expenses.js', 'js/cash-management.js', 'js/charts.js', 'js/csv.js', 'js/reports.js', 'js/backup.js', 'js/notifications.js', 'js/analytics.js', 'js/pwa.js', 'js/app.js',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png', 'assets/icon.svg'];

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
