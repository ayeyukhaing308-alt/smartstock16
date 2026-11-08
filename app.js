/* SmartStock — app.js
 * Application shell: navigation, hash router, theme/language, shortcuts, global search, status.
 * Pages for later phases render an honest "not built yet" notice instead of fake data.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear } = SS.utils;
  const t = (k) => SS.i18n.t(k);

  // id, i18n key, icon, build phase (0 = available now)
  const ROUTES = [
    ['dashboard', 'dashboard', '▦', 0], ['products', 'products', '▣', 2], ['categories', 'categories', '☰', 2],
    ['inventory', 'inventory', '⬒', 2], ['stocktake', 'stocktake', '✓', 2], ['sales', 'sales', '◉', 3],
    ['purchases', 'purchases', '⇩', 4], ['suppliers', 'suppliers', '⚑', 4], ['customers', 'customers', '☺', 4],
    ['expenses', 'expenses', '⊖', 4], ['cash', 'cash', '◎', 4], ['reports', 'reports', '▤', 6],
    ['notifications', 'notifications', '✉', 6], ['activity', 'activity', '↺', 0], ['backup', 'backup', '⇄', 7], ['settings', 'settings', '⚙', 0]
  ];
  const PHASE_NOTES = {
    2: 'Products, categories, barcode, stock movements, stocktake and price history',
    3: 'POS, cart, discounts, payments, receipts and refunds',
    4: 'Purchases, suppliers, customers, payments, expenses and cash management',
    6: 'Reports, Chart.js analytics and the notification centre',
    7: 'JSON backup/restore, CSV export and data migration tools'
  };

  let current = 'dashboard';
  let routeArg = '';
  const main = () => document.getElementById('main');

  function navBadge() {
    let n = 0; try { n = SS.notifications ? SS.notifications.unreadCount() : 0; } catch (e) { n = 0; }
    return n > 0 ? el('span', { class: 'nav-badge', 'aria-label': n + ' unread' }, n > 99 ? '99+' : String(n)) : null;
  }

  function renderNav() {
    const nav = clear(document.getElementById('nav'));
    ROUTES.forEach(([id, key, ico]) => {
      nav.append(el('a', { href: '#/' + id, 'aria-current': id === current ? 'page' : null, class: id === current ? 'active' : '' },
        el('span', { class: 'nav-ico', 'aria-hidden': 'true' }, ico), el('span', { class: 'nav-label' }, t(key)), id === 'notifications' ? navBadge() : null));
    });
  }

  function pendingPage(root, route) {
    const [, key, , phase] = route;
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, t(key)))),
      el('div', { class: 'card' }, el('div', { class: 'empty' }, el('strong', null, 'Not built yet — scheduled for Phase ' + phase),
        PHASE_NOTES[phase] + '. No sample data is shown here.')));
  }

  function activityPage(root) {
    const input = el('input', { class: 'input', type: 'search', placeholder: 'Search activity…', 'aria-label': 'Search activity', style: 'max-width:320px' });
    const body = el('div', { class: 'card' });
    const draw = () => {
      clear(body);
      const items = SS.audit.list({ search: input.value, limit: 200 });
      if (!items.length) return body.append(el('div', { class: 'empty' }, el('strong', null, 'No activity recorded yet'), 'Important actions will be logged here automatically.'));
      body.append(el('div', { class: 'table-wrap' }, el('table', null,
        el('thead', null, el('tr', null, ['Time', 'Action', 'Record', 'Operator'].map((h) => el('th', null, h)))),
        el('tbody', null, items.map((a) => el('tr', null,
          el('td', null, SS.utils.formatDate(a.timestamp, true)), el('td', null, a.actionType),
          el('td', null, a.related ? `${a.related.type || ''} ${a.related.label || a.related.id || ''}` : '—'), el('td', null, a.operator)))))));
    };
    input.addEventListener('input', SS.utils.debounce(draw, 150));
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, t('activity'))), input), body);
    draw();
  }

  function salesPage(root) {
    const hist = routeArg === 'history';
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, t('sales')), el('p', null, hist ? 'Every sale, refund and cancellation. Completed sales are never deleted.' : 'Scan or tap products, then check out.'))),
      el('div', { class: 'tabs', role: 'tablist' }, el('a', { class: 'tab' + (hist ? '' : ' active'), href: '#/sales', role: 'tab' }, 'Point of sale'), el('a', { class: 'tab' + (hist ? ' active' : ''), href: '#/sales/history', role: 'tab' }, 'Sales history')));
    if (hist) SS.sales.historyPage(root); else SS.pos.page(root);
  }

  function render() {
    const root = clear(main());
    const route = ROUTES.find((r) => r[0] === current) || ROUTES[0];
    document.title = t(route[1]) + ' · SmartStock';
    if (current === 'dashboard') SS.dashboard.render(root);
    else if (current === 'sales') salesPage(root);
    else if (SS.pages && SS.pages[current]) SS.pages[current](root, routeArg);
    else if (current === 'settings') { root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, t('settings'))))); SS.settings.render(root); }
    else if (current === 'activity') activityPage(root);
    else pendingPage(root, route);
  }

  let routed = false;
  function route() {
    const parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
    const id = parts[0]; routeArg = parts[1] || '';
    const next = ROUTES.some((r) => r[0] === id) ? id : 'dashboard';
    if (next !== current) SS.privacy.lock();   // cost prices re-hide when leaving the view
    SS.barcode.clearScan();
    current = next;
    closeDrawer(); renderNav(); render();
    if (routed) main().focus({ preventScroll: true });   // first load keeps focus at the top so the skip link is the first Tab stop
    routed = true;
  }

  /* ---------- Theme / language / layout ---------- */
  function applyTheme() {
    const s = SS.settings.get();
    document.documentElement.setAttribute('data-theme', s.theme);
    const app = document.getElementById('app'); app.classList.toggle('collapsed', !!s.sidebarCollapsed);
  }
  function closeDrawer() { document.getElementById('app').classList.remove('drawer-open'); document.getElementById('scrim').hidden = true; }
  function updateStatic() {
    document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
    const net = document.getElementById('netStatus');
    net.textContent = navigator.onLine ? t('online') : t('offline'); net.classList.toggle('offline', !navigator.onLine);
    document.getElementById('langBtn').textContent = SS.i18n.getLang() === 'my' ? 'EN' : 'မြန်';
    SS.i18n.applyStatic(document.body);
    document.title = SS.i18n.getLang() === 'my' ? 'SmartStock — ကုန်ပစ္စည်းစီမံခန့်ခွဲမှု' : 'SmartStock';
  }

  /* ---------- Global search (Phase 1 scope: collections that exist) ---------- */
  function openSearch() {
    const input = el('input', { class: 'input', type: 'search', placeholder: t('search_placeholder'), 'aria-label': 'Global search' });
    const out = el('div', { style: 'margin-top:12px;max-height:50vh;overflow:auto' });
    const draw = () => {
      clear(out); const q = input.value.trim().toLowerCase();
      if (!q) return out.append(el('p', { class: 'muted' }, 'Search products, SKUs, barcodes, categories, customers and suppliers.'));
      const groups = [
        ['Products', 'products', 'products', (p) => [p.name, p.sku, p.barcode]], ['Categories', 'categories', 'categories', (c) => [c.name]],
        ['Customers', 'customers', 'customers', (c) => [c.name, c.phone]], ['Suppliers', 'suppliers', 'suppliers', (s) => [s.name, s.phone]],
        ['Sales', 'sales', 'sales', (s) => [s.number, s.id]], ['Purchases', 'purchases', 'purchases', (p) => [p.number, p.id]]];
      let any = false;
      groups.forEach(([label, key, routeId, fields]) => {
        const hits = SS.storage.read(key).filter((r) => fields(r).some((f) => f && String(f).toLowerCase().includes(q))).slice(0, 5);
        if (!hits.length) return; any = true;
        out.append(el('h2', { class: 'small muted', style: 'margin:10px 0 4px' }, label),
          el('ul', { class: 'list' }, hits.map((r) => el('li', null, el('a', { href: '#/' + routeId, onclick: SS.utils.closeModal }, r.name || r.number || r.id)))));
      });
      if (!any) out.append(el('div', { class: 'empty' }, el('strong', null, 'No matches'), 'Purchase prices are never searchable here.'));
    };
    input.addEventListener('input', SS.utils.debounce(draw, 120));
    SS.utils.openModal({ title: 'Global search', body: el('div', null, input, out) });
    draw();
  }

  function openHelp() {
    const rows = [['Ctrl + K', 'Global search'], ['Ctrl + N', 'New product'], ['Ctrl + S', 'Save current form'], ['F2', 'POS: focus product search'], ['F9', 'POS: checkout'], ['Esc', 'Close dialog'], ['Enter', 'Confirm focused action']];
    SS.utils.openModal({ title: 'Keyboard shortcuts', body: el('div', { class: 'kbd-list' }, rows.flatMap(([k, d]) => [el('kbd', null, k), el('span', null, d)])), actions: [{ label: 'Close' }] });
  }

  function bindEvents() {
    document.getElementById('collapseBtn').addEventListener('click', () => { SS.settings.patch({ sidebarCollapsed: !SS.settings.get().sidebarCollapsed }); applyTheme(); });
    document.getElementById('menuBtn').addEventListener('click', () => { document.getElementById('app').classList.add('drawer-open'); document.getElementById('scrim').hidden = false; });
    document.getElementById('scrim').addEventListener('click', closeDrawer);
    document.getElementById('themeBtn').addEventListener('click', () => { SS.settings.patch({ theme: SS.settings.get().theme === 'dark' ? 'light' : 'dark' }); applyTheme(); });
    document.getElementById('langBtn').addEventListener('click', () => { const l = SS.i18n.getLang() === 'my' ? 'en' : 'my'; SS.i18n.setLang(l); SS.settings.patch({ language: l }); updateStatic(); renderNav(); render(); });
    document.getElementById('searchBtn').addEventListener('click', openSearch);
    document.getElementById('helpBtn').addEventListener('click', openHelp);
    window.addEventListener('hashchange', route);
    const skip = document.querySelector('.skip-link');   // href="#main" would hit the hash router, so focus directly
    if (skip) skip.addEventListener('click', (e) => { e.preventDefault(); main().focus(); });
    window.addEventListener('online', updateStatic); window.addEventListener('offline', updateStatic);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.querySelector('.modal')) return SS.utils.closeModal();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        const f = document.querySelector('.modal form'); const b = document.querySelector('.modal .btn.primary');
        if (f && b) { e.preventDefault(); b.click(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !document.querySelector('.modal')) {
        e.preventDefault(); if (current !== 'products') location.hash = '#/products';
        setTimeout(() => SS.products.openForm(null, () => SS.app.refresh()), 0);
      }
    });
    if (SS.notifications) SS.notifications.onChange(() => renderNav());
    SS.storage.onChange((evt) => {
      if (evt.type === 'external') { SS.utils.toast('Data changed in another tab — refreshed.', 'info'); render(); }
      else if (evt.type === 'conflict') { SS.utils.toast('Another tab changed this data. Latest data loaded; please repeat your action.', 'warning'); render(); }
      else if (evt.type === 'quota') alertSaveFailed('Browser storage is full. Your last change is NOT saved yet. Make a backup now (Backup page — it still works), free some space, then tap “NOT SAVED” at the top to try saving again.');
      else if (evt.type === 'persistfail') alertSaveFailed('Saving to browser storage failed: ' + (evt.error && evt.error.message ? evt.error.message : 'unknown error') + ' Your last change is NOT saved yet. Make a backup now, then tap “NOT SAVED” at the top to try again.');
      else if (evt.type === 'corrupt') SS.utils.toast(`Stored "${evt.key}" data was unreadable. A raw copy was kept; starting that section empty.`, 'error');
      else if (evt.type === 'status') drawSaveState(evt.state);
    });
    document.getElementById('saveState').addEventListener('click', () => SS.storage.retry().then(() => SS.utils.toast('Saved.', 'success')).catch(() => SS.utils.toast('Still could not save. Make a backup and free space.', 'error')));
  }

  let lastAlert = 0;
  function alertSaveFailed(msg) {   // one blocking dialog at a time: a failed save must never go unnoticed
    drawSaveState('unsaved'); if (Date.now() - lastAlert < 15000) return; lastAlert = Date.now();
    SS.utils.openModal({ title: 'Your change was NOT saved', body: el('p', null, msg), actions: [{ label: 'OK' }] });
  }
  function drawSaveState(state) {
    const b = document.getElementById('saveState'); if (!b) return;
    b.hidden = state === 'saved'; b.classList.toggle('bad', state === 'unsaved');
    b.textContent = state === 'unsaved' ? 'NOT SAVED — tap to retry' : state === 'saving' ? 'Saving…' : '';
  }

  async function start() {
    SS.i18n.setLang('en'); SS.i18n.applyStatic(document.body);   // remember the original English of the static shell before translating it
    const res = await SS.storage.init();
    const q = new URLSearchParams(location.search).get('lang');   // ?lang=en|my overrides the saved language (for this load only)
    let saved = 'my'; try { saved = SS.settings.get().language; } catch (e) { /* storage failed: keep the default */ }
    SS.i18n.setLang(q === 'en' || q === 'my' ? q : saved);
    SS.i18n.watch(document.body);
    if (res.errors.length) {
      document.getElementById('main').append(el('div', { class: 'notice danger' }, res.errors.join(' ')));
      if (res.fatal) return;
    }
    if (res.legacy) SS.utils.toast('Your data was moved to the new, larger storage and checked.', 'success');
    res.corrupt.forEach((k) => SS.utils.toast(`Stored "${k}" data was unreadable. A raw copy was kept; starting that section empty.`, 'error'));
    if (SS.pwa) SS.pwa.start();
    const poBack = SS.purchases ? SS.purchases.recover() : 0;
    if (poBack) SS.utils.toast(`${poBack} interrupted purchase(s) were put back to draft. Check Purchases.`, 'warning');
    const rolledBack = SS.sales ? SS.sales.recover() : 0;
    if (rolledBack) SS.utils.toast(`${rolledBack} interrupted sale(s) were rolled back. Check Sales history.`, 'warning');
    bindEvents(); applyTheme(); updateStatic(); route();
  }

  SS.app = { start, refresh: render, applyTheme, openSearch };
  document.addEventListener('DOMContentLoaded', start);
})();
