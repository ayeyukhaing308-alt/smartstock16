/* SmartStock — stocktake.js
 * Physical inventory counts: create a session (all products or one category), enter counted quantities,
 * compare with system stock, confirm, then apply as 'stocktake' stock movements. History is preserved.
 * Session shape: {id, number, name, status:'draft'|'applied', scope, categoryId, lines:[{productId,name,sku,systemQty,countedQty|null}], createdAt, appliedAt}
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatQty, qty, formatDate } = SS.utils; const ui = SS.ui;

  function create(scope, categoryId, name) {
    let products = SS.storage.read('products').filter((p) => p.status !== 'archived');
    if (scope === 'category') products = products.filter((p) => p.categoryId === categoryId);
    if (!products.length) throw new Error('No active products match this selection.');
    const number = 'ST-' + String(SS.storage.counter('stocktake')).padStart(4, '0');
    const rec = SS.storage.collection.insert('stocktakes', {
      number, name: (name || '').trim(), status: 'draft', scope, categoryId: scope === 'category' ? categoryId : '',
      lines: products.map((p) => ({ productId: p.id, name: p.name, sku: p.sku, unit: SS.inventory.unitOf(p), systemQty: Number(p.stock) || 0, countedQty: null }))
    }, 'stk');
    SS.audit.record('stocktake.created', { type: 'stocktake', id: rec.id, label: number }, null, { products: rec.lines.length });
    return rec;
  }

  function saveCounts(id, counts) {
    const s = SS.storage.collection.byId('stocktakes', id);
    if (!s || s.status !== 'draft') throw new Error('This stocktake is already applied and cannot be edited.');
    const lines = s.lines.map((l) => (l.productId in counts ? Object.assign({}, l, { countedQty: counts[l.productId] }) : l));
    return SS.storage.collection.update('stocktakes', id, { lines });
  }

  /** Applies differences (counted − current stock) as stock movements, then locks the session. */
  function apply(id) {
    const s = SS.storage.collection.byId('stocktakes', id);
    if (!s || s.status !== 'draft') throw new Error('Stocktake is not in draft state.');
    const current = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p]));
    let changed = 0; const failures = []; const lines = [];
    s.lines.forEach((l) => {
      const p = current[l.productId];
      if (l.countedQty == null || !p) { lines.push(l); return; }
      const delta = qty(l.countedQty - (Number(p.stock) || 0));
      let applied = null;
      if (delta !== 0) {
        try { SS.inventory.adjust({ productId: l.productId, type: 'stocktake', quantity: delta, reason: 'Stocktake ' + s.number }); changed++; applied = delta; }
        catch (e) { failures.push(l.name + ': ' + e.message); }
      } else applied = 0;
      lines.push(Object.assign({}, l, { adjustment: applied }));
    });
    if (failures.length) throw new Error('Some adjustments failed and the stocktake was left open: ' + failures.join('; '));
    SS.storage.collection.update('stocktakes', id, { status: 'applied', appliedAt: Date.now(), lines });
    SS.audit.record('stocktake.applied', { type: 'stocktake', id, label: s.number }, null, { adjusted: changed });
    return changed;
  }

  const diffOf = (l) => (l.countedQty == null ? null : qty(l.countedQty - l.systemQty));

  function listPage(root) {
    const list = SS.storage.read('stocktakes').slice().reverse();
    const t = ui.dataTable({ rows: list, pageSize: 10, empty: { title: 'No stocktakes yet', hint: 'Start a new stocktake to compare physical counts with system stock.' }, columns: [
      { key: 'number', label: 'No.', render: (s) => el('a', { href: '#/stocktake/' + s.id }, s.number) },
      { key: 'name', label: 'Name', render: (s) => s.name || (s.scope === 'category' ? 'By category' : 'All products') },
      { key: 'createdAt', label: 'Created', render: (s) => formatDate(s.createdAt, true) },
      { key: 'lines', label: 'Products', num: true, sortValue: (s) => s.lines.length, render: (s) => String(s.lines.length) },
      { key: 'status', label: 'Status', render: (s) => (s.status === 'applied' ? ui.badge('Applied', 'success') : ui.badge('Draft', 'info')) }] });
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('stocktake')), el('p', null, 'Count what is on the shelf, compare, then apply the differences.')),
      el('button', { class: 'btn primary', type: 'button', onclick: openNew }, '+ New stocktake')), el('div', { class: 'card' }, t.node));
  }

  function openNew() {
    const scope = ui.select('stScope', [['all', 'All active products'], ['category', 'One category']], 'all');
    const cat = ui.select('stCat', SS.categories.all().filter((c) => c.status !== 'archived').map((c) => [c.id, c.name]), '');
    const name = el('input', { class: 'input', id: 'stName', placeholder: 'Optional, e.g. “Month-end count”' });
    const catField = ui.field('Category', 'stCat', cat); catField.style.display = 'none';
    scope.addEventListener('change', () => { catField.style.display = scope.value === 'category' ? '' : 'none'; });
    SS.utils.openModal({ title: 'New stocktake', body: el('div', null, ui.field('Name', 'stName', name), ui.field('Count', 'stScope', scope), catField),
      actions: [{ label: SS.i18n.t('cancel') }, { label: 'Start', kind: 'primary', onClick: () => {
        try { if (scope.value === 'category' && !cat.value) throw new Error('Choose a category.'); const s = create(scope.value, cat.value, name.value); location.hash = '#/stocktake/' + s.id; }
        catch (e) { SS.utils.toast(e.message, 'error'); return false; }
      } }] });
  }

  function sessionPage(root, id) {
    const s = SS.storage.collection.byId('stocktakes', id);
    if (!s) { root.append(el('div', { class: 'card' }, el('div', { class: 'empty' }, el('strong', null, 'Stocktake not found'), el('a', { href: '#/stocktake' }, 'Back to stocktakes')))); return; }
    const draft = s.status === 'draft'; const inputs = {}; const summary = el('div', { class: 'small muted' });
    const rowsEl = s.lines.map((l) => {
      const diffCell = el('td', { class: 'num' }); const inp = draft
        ? el('input', { class: 'input', type: 'number', min: '0', step: 'any', style: 'width:110px;text-align:right', 'aria-label': 'Counted quantity for ' + l.name, value: l.countedQty == null ? '' : l.countedQty }) : null;
      if (inp) inputs[l.productId] = inp;
      const paint = () => {
        const counted = inp ? (inp.value === '' ? null : qty(inp.value)) : l.countedQty; const d = counted == null ? null : qty(counted - l.systemQty);
        clear(diffCell); diffCell.append(d == null ? '—' : d === 0 ? ui.badge('Match', 'success') : d < 0 ? ui.badge('Shortage ' + formatQty(d), 'danger') : ui.badge('Excess +' + formatQty(d), 'warning'));
      };
      if (inp) inp.addEventListener('input', () => { paint(); tally(); });
      paint();
      return el('tr', null, el('td', null, l.name, el('span', { class: 'sub' }, l.sku)), el('td', { class: 'num' }, formatQty(l.systemQty) + ' ' + (l.unit || '')), el('td', { class: 'num' }, inp || (l.countedQty == null ? '—' : formatQty(l.countedQty))), diffCell);
    });
    function counts() { const c = {}; Object.entries(inputs).forEach(([pid, n]) => { c[pid] = n.value === '' ? null : qty(n.value); }); return c; }
    function tally() {
      const c = counts(); const entered = Object.values(c).filter((v) => v != null).length;
      const diffs = s.lines.filter((l) => c[l.productId] != null && qty(c[l.productId] - l.systemQty) !== 0).length;
      summary.textContent = `${entered} of ${s.lines.length} counted · ${diffs} difference(s)`;
    }
    if (draft) tally(); else summary.textContent = 'Applied ' + formatDate(s.appliedAt, true);

    const actions = draft ? el('div', { class: 'btn-row' },
      el('button', { class: 'btn', type: 'button', onclick: () => { try { saveCounts(id, counts()); SS.utils.toast('Counts saved.', 'success'); } catch (e) { SS.utils.toast(e.message, 'error'); } } }, 'Save progress'),
      el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        try { saveCounts(id, counts()); } catch (e) { return SS.utils.toast(e.message, 'error'); }
        const fresh = SS.storage.collection.byId('stocktakes', id); const d = fresh.lines.filter((l) => l.countedQty != null && diffOf(l) !== 0); const un = fresh.lines.filter((l) => l.countedQty == null).length;
        const msg = `${d.length} product(s) will have their stock changed to the counted quantity.${un ? ' ' + un + ' uncounted product(s) will be left untouched.' : ''} This creates stock movements and cannot be edited afterwards.`;
        if (!(await SS.utils.confirmDialog('Apply stocktake adjustments?', msg, 'Apply adjustments'))) return;
        try { const n = apply(id); SS.utils.toast(n + ' adjustment(s) applied.', 'success'); SS.app.refresh(); } catch (e) { SS.utils.toast(e.message, 'error'); }
      } }, 'Apply adjustments')) : null;
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, s.number + (s.name ? ' · ' + s.name : '')), summary), el('div', { class: 'btn-row' }, el('a', { class: 'btn', href: '#/stocktake' }, '‹ All stocktakes'), actions)),
      el('div', { class: 'card' }, el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, el('th', null, 'Product'), el('th', { class: 'num' }, 'System stock'), el('th', { class: 'num' }, 'Counted'), el('th', { class: 'num' }, 'Difference'))), el('tbody', null, rowsEl)))));
  }

  SS.stocktake = { create, saveCounts, apply };
  SS.pages = SS.pages || {};
  SS.pages.stocktake = (root, arg) => (arg ? sessionPage(root, arg) : listPage(root));
})();
