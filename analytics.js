/* SmartStock — analytics.js
 * Dashboard (Phase 1): every figure is computed from stored records; empty states when no data.
 * Chart.js is not bundled yet (offline-first); Phase 6 vendors it locally. Until then trends use
 * lightweight DOM bars.
 * Purchase prices: the inventory COST value is computed only when SS.privacy.canViewCost() is true.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, formatMMK, formatNumber, dayKey, addDays, toInt } = SS.utils;
  const t = (k) => SS.i18n.t(k);

  const state = { preset: 'today', from: null, to: null };

  const range = () => SS.utils.dateRange(state.preset, state.from, state.to);
  const inRange = (ts, [a, b]) => { const k = dayKey(ts); return k >= a && k <= b; };

  /** Pure metrics calculation from storage. */
  function compute() {
    const r = range();
    const products = SS.storage.read('products');
    const active = products.filter((p) => p.status !== 'archived');
    const sales = SS.storage.read('sales').filter((s) => s.status === 'completed' && inRange(s.createdAt, r));
    const expenses = SS.storage.read('expenses').filter((e) => e.status !== 'void' && e.date >= r[0] && e.date <= r[1]);
    const low = SS.settings.get().lowStockThreshold;

    let revenue = 0, cogs = 0, cashIn = 0; const byProduct = {}, byCat = {}, daily = {};
    const catOf = Object.fromEntries(products.map((p) => [p.id, p.categoryId]));
    sales.forEach((s) => {
      const n = SS.sales.net(s);
      revenue += n.revenue; cogs += n.cogs; cashIn += n.cashIn;
      const k = dayKey(s.createdAt); daily[k] = (daily[k] || 0) + n.revenue;
      (s.lines || []).forEach((l) => {
        const left = (Number(l.qty) || 0) - (Number(l.refundedQty) || 0); if (left <= 0) return;
        const b = byProduct[l.productId] || (byProduct[l.productId] = { name: l.productName || l.productId, qty: 0 });
        b.qty += left;
        const c = catOf[l.productId] || '—'; byCat[c] = (byCat[c] || 0) + Math.round((l.lineNet != null ? l.lineNet : l.lineTotal) * left / l.qty);
      });
    });
    const expTotal = expenses.reduce((a, e) => a + toInt(e.amount), 0);
    const catName = Object.fromEntries(SS.storage.read('categories').map((c) => [c.id, c.name]));
    return {
      range: r, productCount: active.length,
      stockUnits: active.reduce((a, p) => a + (Number(p.stock) || 0), 0),
      retailValue: active.reduce((a, p) => a + (Number(p.stock) || 0) * toInt(p.sellingPrice), 0),
      revenue, cogs, gross: revenue - cogs, expenses: expTotal, operating: revenue - cogs - expTotal, cashIn,
      daily, best: Object.values(byProduct).sort((a, b) => b.qty - a.qty).slice(0, 5),
      catSales: Object.entries(byCat).map(([id, v]) => ({ name: catName[id] || 'Uncategorised', value: v })).sort((a, b) => b.value - a.value),
      lowStock: active.filter((p) => (Number(p.stock) || 0) > 0 && (Number(p.stock) || 0) <= (p.lowStockThreshold != null ? toInt(p.lowStockThreshold) : low)),
      outOfStock: active.filter((p) => (Number(p.stock) || 0) <= 0),
      recentSales: SS.storage.read('sales').filter((s) => s.status === 'completed').slice(-5).reverse(),
      recentMoves: SS.storage.read('stockMovements').slice(-5).reverse(),
      cashFlow: SS.cash.flow(r[0], r[1]),
      receivables: SS.storage.read('customers').reduce((a, c) => a + toInt(c.outstandingBalance), 0),
      payables: SS.storage.read('suppliers').reduce((a, s) => a + toInt(s.outstandingBalance), 0)
    };
  }
  /** Cost value — only evaluated when authorised so cost data never reaches an unauthorised component. */
  function inventoryCostValue() {
    if (!SS.privacy.canViewCost()) return null;
    return SS.storage.read('products').filter((p) => p.status !== 'archived').reduce((a, p) => a + (Number(p.stock) || 0) * toInt(p.avgCost != null ? p.avgCost : p.purchasePrice), 0);
  }

  const empty = (title, hint) => el('div', { class: 'empty' }, el('strong', null, title), hint || '');
  function card(title, body, cls) { return el('section', { class: 'card ' + (cls || '') }, el('div', { class: 'card-head' }, el('h2', null, title)), body); }
  function stat(label, value, hint, accent) {
    return el('div', { class: 'card stat' + (accent ? ' accent' : '') }, el('div', { class: 'label' }, label), el('div', { class: 'value' }, value), hint ? el('div', { class: 'hint' }, hint) : null);
  }
  const list = (items) => el('ul', { class: 'list' }, items);

  function render(root) {
    const m = compute();
    const cost = inventoryCostValue();
    const periodLabel = state.preset === 'today' ? "Today's" : 'Period';
    const costBody = cost == null
      ? el('div', { class: 'value' }, el('span', { class: 'mask' }, '••••••'))
      : el('div', { class: 'value' }, formatMMK(cost));
    const costCard = el('div', { class: 'card stat' }, el('div', { class: 'label' }, 'Inventory cost value'), costBody,
      el('div', { class: 'hint' }, cost == null
        ? el('button', { class: 'btn sm', type: 'button', onclick: () => SS.privacy.requestUnlock().then((ok) => ok && SS.app.refresh()) }, 'Show (admin PIN)')
        : el('button', { class: 'btn sm', type: 'button', onclick: () => { SS.privacy.lock(); SS.app.refresh(); } }, 'Hide')));

    const presets = [['today', 'today'], ['yesterday', 'yesterday'], ['last7', 'last7'], ['last30', 'last30'], ['this_month', 'this_month'], ['prev_month', 'prev_month'], ['custom', 'custom']];
    const filters = el('div', { class: 'filters', role: 'group', 'aria-label': 'Date range' },
      presets.map(([id, key]) => el('button', { class: 'chip' + (state.preset === id ? ' active' : ''), type: 'button', onclick: () => { state.preset = id; SS.app.refresh(); } }, t(key))));
    const custom = state.preset === 'custom' ? el('div', { class: 'filters', style: 'margin-top:8px' },
      el('input', { class: 'input', type: 'date', value: m.range[0], 'aria-label': 'From', style: 'width:auto', onchange: (e) => { state.from = e.target.value; SS.app.refresh(); } }),
      el('input', { class: 'input', type: 'date', value: m.range[1], 'aria-label': 'To', style: 'width:auto', onchange: (e) => { state.to = e.target.value; SS.app.refresh(); } })) : null;

    // sales trend
    const days = []; { let d = m.range[0]; let n = 0; while (d <= m.range[1] && n < 62) { days.push(d); d = addDays(d, 1); n++; } }
    const max = Math.max(1, ...days.map((d) => m.daily[d] || 0));
    const hasSales = Object.keys(m.daily).length > 0;
    const trend = hasSales ? SS.charts.bar({ labels: days.map((d) => d.slice(5)), series: [{ name: 'Revenue', values: days.map((d) => m.daily[d] || 0) }], label: 'Sales trend' }) : empty('No sales in this period', 'Completed sales will appear here.');

    const catMax = Math.max(1, ...m.catSales.map((c) => c.value));
    const cats = m.catSales.length ? SS.charts.donut({ items: m.catSales.slice(0, 6).map((c) => ({ label: c.name, value: c.value })), label: 'Sales by category' }) : empty('No category sales yet');
    void catMax;

    const pl = (arr, fmt, emptyTitle, emptyHint) => arr.length ? list(arr.map(fmt)) : empty(emptyTitle, emptyHint);

    root.append(
      el('div', { class: 'page-head' }, el('div', null, el('h1', null, t('dashboard')), el('p', null, `${SS.settings.get().shopName} · ${SS.utils.formatDate(Date.now())}`)), el('div', null, filters, custom)),
      el('div', { class: 'grid' },
        el('div', { class: 'col-3' }, stat('Total products', formatNumber(m.productCount))),
        el('div', { class: 'col-3' }, stat('Total stock units', formatNumber(m.stockUnits))),
        el('div', { class: 'col-3' }, costCard),
        el('div', { class: 'col-3' }, stat('Inventory retail value', formatMMK(m.retailValue))),
        el('div', { class: 'col-3' }, stat(periodLabel + ' sales', formatMMK(m.revenue), 'Revenue (net of discounts)', true)),
        el('div', { class: 'col-3' }, stat(periodLabel + ' gross profit', SS.privacy.canViewCost() ? formatMMK(m.gross) : '— hidden —', SS.privacy.canViewCost() ? 'Revenue − cost of goods sold' : 'Needs the admin PIN (Reports → Profit)')),
        el('div', { class: 'col-3' }, stat(periodLabel + ' expenses', formatMMK(m.expenses), 'Operating expenses only')),
        el('div', { class: 'col-3' }, stat(periodLabel + ' operating profit (est.)', SS.privacy.canViewCost() ? formatMMK(m.operating) : '— hidden —', SS.privacy.canViewCost() ? 'Gross profit − expenses' : 'Needs the admin PIN')),

        el('div', { class: 'col-8' }, card('Sales trend', trend)),
        el('div', { class: 'col-4' }, card('Sales by category', cats)),
        el('div', { class: 'col-4' }, card('Best-selling products', pl(m.best, (b) => el('li', null, el('span', null, b.name), el('span', { class: 'num' }, formatNumber(b.qty) + ' sold')), 'No sales yet'))),
        el('div', { class: 'col-4' }, card('Low stock', pl(m.lowStock.slice(0, 6), (p) => el('li', null, el('span', null, p.name), el('span', { class: 'badge warning' }, formatNumber(p.stock) + ' left')), 'Nothing running low'))),
        el('div', { class: 'col-4' }, card('Out of stock', pl(m.outOfStock.slice(0, 6), (p) => el('li', null, el('span', null, p.name), el('span', { class: 'badge danger' }, 'Out')), 'No out-of-stock products'))),
        el('div', { class: 'col-6' }, card('Recent transactions', pl(m.recentSales, (s) => el('li', null, el('span', null, (s.number || s.id) + ' · ' + SS.utils.formatDate(s.createdAt, true)), el('span', { class: 'num' }, formatMMK(s.total))), 'No transactions yet'))),
        el('div', { class: 'col-6' }, card('Recent inventory movements', pl(m.recentMoves, (mv) => el('li', null, el('span', null, mv.type + ' · ' + SS.utils.formatDate(mv.createdAt, true)), el('span', { class: 'num' }, (mv.quantity > 0 ? '+' : '') + formatNumber(mv.quantity))), 'No stock movements yet'))),
        el('div', { class: 'col-6' }, card('Recent activity', pl(SS.audit.list({ limit: 5 }), (a) => el('li', null, el('span', null, a.actionType), el('span', { class: 'muted small' }, SS.utils.formatDate(a.timestamp, true))), 'No activity yet'))),
        el('div', { class: 'col-6' }, card('Cash & balances', list([
          el('li', null, el('span', null, 'Cash received (sales + customer payments)'), el('span', { class: 'num' }, formatMMK(m.cashFlow.in))),
          el('li', null, el('span', null, 'Cash paid out (refunds, suppliers, expenses)'), el('span', { class: 'num' }, formatMMK(m.cashFlow.out))),
          el('li', null, el('span', null, 'Net cash movement'), el('span', { class: 'num' }, formatMMK(m.cashFlow.net))),
          el('li', null, el('span', null, 'Pending customer payments (receivables)'), el('span', { class: 'num' }, formatMMK(m.receivables))),
          el('li', null, el('span', null, 'Outstanding supplier payments (payables)'), el('span', { class: 'num' }, formatMMK(m.payables)))]))))
    );
  }

  SS.dashboard = { render, compute };
})();
