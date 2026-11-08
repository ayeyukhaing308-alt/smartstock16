/* SmartStock — pwa.js
 * Optional offline/installable app. Off by default so Live Server development is never affected; the user turns it on in
 * Settings. Works only on https:// or localhost (a browser rule) — not on file://.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  let deferred = null;
  const supported = () => 'serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:';
  const enabled = () => !!SS.settings.get().offlineApp;
  async function register() { const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; return reg; }
  async function enable() {
    if (!supported()) throw new Error('Offline mode needs the app to be opened from https:// or http://localhost (not from a file).');
    await register(); SS.settings.patch({ offlineApp: true }); SS.audit.record('pwa.enabled', { type: 'settings', id: 'pwa' });
  }
  async function disable() {
    SS.settings.patch({ offlineApp: false });
    if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); }
    if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.filter((k) => k.startsWith('smartstock-')).map((k) => caches.delete(k))); }
    SS.audit.record('pwa.disabled', { type: 'settings', id: 'pwa' });
  }
  /** 'unsupported' | 'off' | 'on' (service worker active and controlling) | 'pending' */
  async function status() {
    if (!supported()) return 'unsupported'; if (!enabled()) return 'off';
    const reg = await navigator.serviceWorker.getRegistration(); return reg && reg.active ? 'on' : 'pending';
  }
  function start() { if (supported() && enabled()) register().catch((e) => console.warn('[SmartStock] offline mode could not start:', e.message)); }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  const canInstall = () => !!deferred;
  async function install() { if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice; deferred = null; return r.outcome === 'accepted'; }
  SS.pwa = { supported, enabled, enable, disable, status, start, canInstall, install };
})();
