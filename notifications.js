/* SmartStock — notifications.js
 * Notification centre. Alerts are GENERATED from stored records every time (nothing is invented); the
 * `notifications` collection only remembers the user's choices: {id: <alert key>, read, dismissed}.
 * An alert key includes the facts it is about (e.g. low:<product>:<stock>), so when the situation changes the
 * alert comes back as new even if an earlier one was dismissed.
 * Alerts never contain purchase prices. Not generated (no data exists for them yet): near-expiry / expired
 * products (products have no expiry date) and .
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatQty, toInt, dayKey, formatDate } = SS.utils; const ui = SS.ui;
  const HIGH_DISCOUNT_PCT = 20, OVERDUE_DAYS = 30;
  const TYPES = { stock: 'Stock', money: 'Money', sales: 'Sales', system: 'System' };
  const listeners = new Set();

  /** Builds the current alerts from data. [{key, type, level:'danger'|'warning'|'info', title, detail, at, href}] */
  function generate() {
    const out = []; const add = (a) => out.push(a); const today = dayKey(Date.now());
    const products = SS.storage.read('products').filter((p) => p.status !== 'archived'); const lastMove = {};
    SS.storage.read('stockMovements').forEach((m) => { lastMove[m.productId] = Math.max(lastMove[m.productId] || 0, m.createdAt || 0); });
    products.forEach((p) => { const s = SS.inventory.stockStatus(p); const unit = SS.inventory.unitOf(p); const at = lastMove[p.id] || p.updatedAt || p.createdAt || Date.now();
      if (s === 'out') add({ key: 'out:' + p.id, type: 'stock', level: 'danger', title: 'Out of stock: ' + p.name, detail: 'No ' + unit + ' left to sell.', at, href: '#/inventory' });
      else if (s === 'low') add({ key: 'low:' + p.id + ':' + p.stock, type: 'stock', level: 'warning', title: 'Low stock: ' + p.name, detail: formatQty(p.stock) + ' ' + unit + ' left.', at, href: '#/inventory' }); });
    if (SS.finance && SS.finance.expiryReport) { const ex = SS.finance.expiryReport();
      ex.rows.filter((r) => r.status === 'expired').forEach((r) => add({ key: 'exp:' + r.id + ':' + r.qty, type: 'stock', level: 'danger', title: 'Expired: ' + r.product + ' (batch ' + r.batch + ')', detail: formatQty(r.qty) + ' ' + r.unit + ' expired on ' + r.expiry + '. It cannot be sold — record it as Expired goods.', at: Date.parse(r.expiry + 'T00:00:00Z') || Date.now(), href: '#/reports/expiry' }));
      ex.rows.filter((r) => r.status === 'near').forEach((r) => add({ key: 'near:' + r.id + ':' + r.qty, type: 'stock', level: 'warning', title: 'Near expiry: ' + r.product + ' (batch ' + r.batch + ')', detail: formatQty(r.qty) + ' ' + r.unit + ' expire in ' + r.daysLeft + ' day(s) on ' + r.expiry + '.', at: Date.now(), href: '#/reports/expiry' })); }
    const sales = SS.storage.read('sales');
    SS.storage.read('customers').filter((c) => toInt(c.outstandingBalance) > 0).forEach((c) => {
      const mine = sales.filter((s) => s.customerId === c.id && s.status === 'completed' && s.balance > 0); const oldest = mine.length ? Math.min.apply(null, mine.map((s) => s.createdAt)) : Date.now();
      const age = SS.utils.daysBetween(dayKey(oldest), today) - 1;
      add({ key: 'cust:' + c.id + ':' + c.outstandingBalance, type: 'money', level: age > OVERDUE_DAYS ? 'danger' : 'info', title: c.name + ' owes ' + formatMMK(c.outstandingBalance), detail: age > OVERDUE_DAYS ? 'Oldest unpaid sale is ' + age + ' days old.' : 'Unpaid balance from credit sales.', at: oldest, href: '#/customers' }); });
    const purchases = SS.storage.read('purchases');
    SS.storage.read('suppliers').filter((s) => toInt(s.outstandingBalance) > 0).forEach((s) => {
      const mine = purchases.filter((p) => p.supplierId === s.id && p.status === 'confirmed' && p.balance > 0); const oldest = mine.length ? Math.min.apply(null, mine.map((p) => p.confirmedAt || Date.now())) : Date.now();
      const age = SS.utils.daysBetween(dayKey(oldest), today) - 1;
      add({ key: 'sup:' + s.id + ':' + s.outstandingBalance, type: 'money', level: age > OVERDUE_DAYS ? 'danger' : 'info', title: 'You owe ' + s.name + ' ' + formatMMK(s.outstandingBalance), detail: age > OVERDUE_DAYS ? 'Oldest unpaid purchase is ' + age + ' days old.' : 'Outstanding supplier payment.', at: oldest, href: '#/suppliers' }); });
    purchases.filter((p) => p.status === 'draft').forEach((p) => add({ key: 'draft:' + p.id, type: 'system', level: 'info', title: 'Purchase ' + p.number + ' is still a draft', detail: 'Stock is not added until it is confirmed.', at: p.updatedAt || p.createdAt || Date.now(), href: '#/purchases' }));
    purchases.filter((p) => p.status === 'confirming').forEach((p) => add({ key: 'conf:' + p.id, type: 'system', level: 'danger', title: 'Purchase ' + p.number + ' was interrupted', detail: 'Reload the app to restore it to a draft.', at: p.updatedAt || Date.now(), href: '#/purchases' }));
    const since = Date.now() - 7 * 864e5;
    sales.filter((s) => s.status === 'completed' && s.createdAt >= since && (s.discountPct || 0) >= HIGH_DISCOUNT_PCT).forEach((s) => add({ key: 'disc:' + s.id, type: 'sales', level: 'warning', title: 'High discount on ' + s.number + ' (' + s.discountPct + '%)', detail: 'Sale total ' + formatMMK(s.total) + '. Check it was intended.', at: s.createdAt, href: '#/sales/history' }));
    const sessions = SS.storage.read('cashSessions'); sessions.filter((c) => c.status === 'open' && c.date < today).forEach((c) => add({ key: 'cash:' + c.id, type: 'money', level: 'warning', title: 'Cash drawer for ' + c.date + ' was never closed', detail: 'Count the cash and close the day.', at: c.openedAt || Date.now(), href: '#/cash' }));
    sessions.filter((c) => c.status === 'closed' && c.difference).forEach((c) => add({ key: 'cashdiff:' + c.id, type: 'money', level: 'warning', title: 'Cash difference on ' + c.date + ': ' + (c.difference > 0 ? '+' : '−') + formatMMK(Math.abs(c.difference)), detail: c.closeNote || 'Counted cash differed from expected.', at: c.closedAt || Date.now(), href: '#/cash' }));
    const hasData = products.length || sales.length || purchases.length; const lb = SS.backup && SS.backup.lastBackup();
    if (hasData && !lb) add({ key: 'backup:never', type: 'system', level: 'warning', title: 'No backup has been made yet', detail: 'Your data lives only in this browser. Create a backup file.', at: Date.now(), href: '#/backup' });
    else if (lb && Date.now() - lb.at > 7 * 864e5) add({ key: 'backup:' + dayKey(lb.at), type: 'system', level: 'warning', title: 'Last backup was ' + (SS.utils.daysBetween(dayKey(lb.at), today) - 1) + ' days ago', detail: 'Make a fresh backup so recent sales are safe.', at: lb.at, href: '#/backup' });
    const rc = SS.finance ? SS.finance.reconcile() : { issueCount: 0 };
    if (rc.issueCount) add({ key: 'recon:' + rc.issueCount, type: 'system', level: 'danger', title: 'Reconciliation found ' + rc.issueCount + ' mismatch(es)', detail: 'Some balances, payments or stock do not agree.', at: rc.ranAt, href: '#/reports/reconcile' });
    return out.sort((a, b) => (b.at || 0) - (a.at || 0));
  }

  const stateMap = () => Object.fromEntries(SS.storage.read('notifications').map((n) => [n.id, n]));
  function all() { const st = stateMap(); return generate().map((a) => Object.assign({}, a, { read: !!(st[a.key] && st[a.key].read), dismissed: !!(st[a.key] && st[a.key].dismissed) })); }
  const unreadCount = () => all().filter((n) => !n.read && !n.dismissed).length;
  function change(keys, patch) {
    const live = new Set(generate().map((a) => a.key)); const cur = SS.storage.read('notifications').filter((n) => live.has(n.id)); const map = new Map(cur.map((n) => [n.id, n]));
    keys.forEach((k) => map.set(k, Object.assign({ id: k, read: false, dismissed: false }, map.get(k) || {}, patch)));
    SS.storage.write('notifications', Array.from(map.values())); listeners.forEach((f) => f());
  }
  const markRead = (keys) => change([].concat(keys), { read: true });
  const dismiss = (keys) => change([].concat(keys), { read: true, dismissed: true });
  const restore = (keys) => change([].concat(keys), { dismissed: false });
  const markAllRead = () => change(all().filter((n) => !n.dismissed).map((n) => n.key), { read: true });

  /* ---------- Page ---------- */
  const st = { filter: 'unread' };
  const FILTERS = [['unread', 'Unread'], ['all', 'All'], ['stock', 'Stock'], ['money', 'Money'], ['sales', 'Sales'], ['system', 'System'], ['dismissed', 'Dismissed']];
  function page(root) {
    const body = el('div');
    function draw() {
      clear(body); const items = all();
      const shown = items.filter((n) => (st.filter === 'dismissed' ? n.dismissed : !n.dismissed && (st.filter === 'all' || (st.filter === 'unread' ? !n.read : n.type === st.filter))));
      body.append(el('div', { class: 'tabs', role: 'tablist' }, FILTERS.map(([id, l]) => {
        const c = id === 'unread' ? items.filter((n) => !n.read && !n.dismissed).length : id === 'dismissed' ? items.filter((n) => n.dismissed).length : id === 'all' ? items.filter((n) => !n.dismissed).length : items.filter((n) => !n.dismissed && n.type === id).length;
        return el('button', { class: 'tab' + (st.filter === id ? ' active' : ''), type: 'button', role: 'tab', 'data-filter': id, onclick: () => { st.filter = id; draw(); } }, l + ' (' + c + ')'); })));
      if (!shown.length) { body.append(el('div', { class: 'empty' }, el('strong', null, st.filter === 'dismissed' ? 'Nothing dismissed' : 'No notifications'), items.length ? 'Nothing matches this filter.' : 'Alerts appear here when stock runs low, balances are unpaid or something needs checking.')); return; }
      body.append(el('ul', { class: 'notif-list' }, shown.map((n) => el('li', { class: 'notif ' + n.level + (n.read ? ' read' : ''), 'data-key': n.key },
        el('div', { class: 'notif-main' }, el('div', { class: 'notif-title' }, n.read ? null : el('span', { class: 'dot', 'aria-label': 'Unread' }), n.title, ui.badge(TYPES[n.type], n.level === 'danger' ? 'danger' : n.level === 'warning' ? 'warning' : 'info')),
          el('div', { class: 'small muted' }, n.detail), el('div', { class: 'small muted' }, formatDate(n.at, true))),
        el('div', { class: 'btn-row' },
          el('a', { class: 'btn sm', href: n.href, onclick: () => { if (!n.read) markRead(n.key); } }, 'Open'),
          n.dismissed ? el('button', { class: 'btn sm', type: 'button', onclick: () => { restore(n.key); draw(); } }, 'Restore')
            : [n.read ? null : el('button', { class: 'btn sm', type: 'button', onclick: () => { markRead(n.key); draw(); } }, 'Mark read'), el('button', { class: 'btn sm', type: 'button', onclick: () => { dismiss(n.key); draw(); } }, 'Dismiss')])))));
    }
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('notifications')), el('p', null, 'Built from your real stock, balances and records. Dismissed alerts return only if the situation changes.')),
      el('button', { class: 'btn', type: 'button', onclick: () => { markAllRead(); draw(); } }, 'Mark all as read')), body);
    draw();
  }

  SS.notifications = { generate, all, unreadCount, markRead, markAllRead, dismiss, restore, onChange: (f) => { listeners.add(f); return () => listeners.delete(f); } };
  SS.pages = SS.pages || {}; SS.pages.notifications = page;
})();
