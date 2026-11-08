/* SmartStock — inventory.js
 * Central stock service (SS.inventory) + Inventory page.
 * RULE: product quantities are changed ONLY through SS.inventory.adjust(); no other module writes `stock`.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatQty, qty, formatDate } = SS.utils;
  const ui = SS.ui;

  // sign: +1 adds stock, -1 removes stock, 0 = signed quantity supplied by caller
  const TYPES = {
    opening: { label: 'Opening stock', sign: 1, manual: false },
    addition: { label: 'Stock addition', sign: 1, manual: true },
    reduction: { label: 'Stock reduction', sign: -1, manual: true },
    sale: { label: 'Sales deduction', sign: -1, manual: false },
    purchase: { label: 'Purchase addition', sign: 1, manual: false },
    customer_return: { label: 'Customer return', sign: 1, manual: true },
    supplier_return: { label: 'Supplier return', sign: -1, manual: true },
    damaged: { label: 'Damaged goods', sign: -1, manual: true },
    expired: { label: 'Expired goods', sign: -1, manual: true },
    lost: { label: 'Lost goods', sign: -1, manual: true },
    adjustment: { label: 'Manual adjustment', sign: 0, manual: true },
    stocktake: { label: 'Stocktake adjustment', sign: 0, manual: false }
  };
  const REASON_REQUIRED = ['addition', 'reduction', 'customer_return', 'supplier_return', 'damaged', 'expired', 'lost', 'adjustment'];

  function stockStatus(p) {
    const s = Number(p.stock) || 0;
    const th = p.lowStockThreshold != null && p.lowStockThreshold !== '' ? Number(p.lowStockThreshold) : SS.settings.get().lowStockThreshold;
    return s <= 0 ? 'out' : s <= th ? 'low' : 'ok';
  }


  /* ---------- Optional batch / expiry tracking (product.trackBatches) ----------
   * A tracked product keeps product.batches = [{id, number, expiry:'YYYY-MM-DD'|'', mfg, qty, receivedAt}] whose quantities always add
   * up to product.stock (adjust() is the only writer of both, in one product write). Outgoing stock is taken FEFO (earliest expiry
   * first, batches without an expiry last) or FIFO (oldest received first) — Settings → batchMethod. Sales never use expired batches;
   * "Expired goods" removes expired batches first; refunds put stock back into the batches it came from. */
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const todayKey = () => SS.utils.dayKey(Date.now());
  const isExpired = (b, today) => !!b.expiry && b.expiry < (today || todayKey());
  /** Units that may be sold now (expired batches excluded for tracked products). */
  function sellable(p) { const st = Number(p.stock) || 0; if (!p.trackBatches) return st; const t = todayKey(); return qty(st - (p.batches || []).filter((b) => isExpired(b, t)).reduce((a, b) => a + b.qty, 0)); }
  const cmpExpiry = (a, b) => (a.expiry && b.expiry ? (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0) : a.expiry ? -1 : b.expiry ? 1 : 0);
  function checkBatchInfo(info) {
    const i = info || {}; const out = { number: String(i.number || '').trim(), expiry: String(i.expiry || '').trim(), mfg: String(i.mfg || '').trim() };
    if (out.expiry && !DATE_RE.test(out.expiry)) throw new Error('Enter the expiry date as a valid date.');
    if (out.mfg && !DATE_RE.test(out.mfg)) throw new Error('Enter the manufacturing date as a valid date.');
    if (out.expiry && out.mfg && out.mfg > out.expiry) throw new Error('The manufacturing date cannot be after the expiry date.');
    return out;
  }
  function addToBatch(list, info, q, defaultNumber, receivedAt) {
    const number = info.number || defaultNumber; const hit = list.find((b) => b.number === number && b.expiry === (info.expiry || '') && b.mfg === (info.mfg || ''));
    if (hit) { hit.qty = qty(hit.qty + q); return hit; }
    const b = { id: SS.storage.uid('bat'), number, expiry: info.expiry || '', mfg: info.mfg || '', qty: q, receivedAt }; list.push(b); return b;
  }
  /** Batches of a tracked product as shown to the user (stock not in any batch appears as "UNASSIGNED"). */
  function batchList(p) {
    const list = (p.batches || []).filter((b) => b.qty > 0).map((b) => Object.assign({}, b)); const have = qty(list.reduce((a, b) => a + b.qty, 0)); const st = Number(p.stock) || 0;
    if (have < st - 0.0005) list.push({ id: 'unassigned', number: 'UNASSIGNED', expiry: '', mfg: '', qty: qty(st - have), receivedAt: 0 });
    return list.sort(cmpExpiry);
  }
  /** Returns {batches, used:[{id,number,expiry,qty}]} for a stock change of `delta` on a tracked product. Throws on shortage. */
  function planBatches(p, delta, opts, type, moves) {
    const today = todayKey(); const now = Date.now(); const stock = Number(p.stock) || 0; const list = (p.batches || []).map((b) => Object.assign({}, b));
    const have = qty(list.reduce((a, b) => a + b.qty, 0));
    if (have > stock + 0.0005) throw new Error(`The batch quantities of ${p.name} do not add up to its stock. Open Reports → Reconciliation.`);
    if (have < stock - 0.0005) list.push({ id: SS.storage.uid('bat'), number: 'UNASSIGNED', expiry: '', mfg: '', qty: qty(stock - have), receivedAt: 0 });
    const used = [];
    if (delta > 0) {
      let left = delta;
      if (type === 'customer_return' && opts.relatedId && !opts.batch) {
        const mine = moves.filter((m) => m.relatedId === opts.relatedId && m.productId === p.id && m.batches); const sold = [], back = {};
        mine.forEach((m) => m.batches.forEach((b) => { if (m.type === 'sale') sold.push(b); else if (m.type === 'customer_return') back[b.id] = (back[b.id] || 0) + b.qty; }));
        sold.forEach((b) => { if (left <= 0) return; const r = Math.min(left, qty(b.qty - (back[b.id] || 0))); if (r <= 0) return; const live = list.find((x) => x.id === b.id);
          if (live) live.qty = qty(live.qty + r); else list.push({ id: b.id, number: b.number, expiry: b.expiry || '', mfg: '', qty: r, receivedAt: now }); used.push({ id: b.id, number: b.number, expiry: b.expiry || '', qty: r }); left = qty(left - r); });
      }
      if (left > 0) { const info = checkBatchInfo(opts.batch); const defaults = { opening: 'OPENING', purchase: 'PURCHASE', customer_return: 'RETURNED', stocktake: 'COUNTED', adjustment: 'ADJUSTED', addition: 'ADDED' };
        const b = addToBatch(list, info, left, defaults[type] || 'ADDED', now); used.push({ id: b.id, number: b.number, expiry: b.expiry, qty: left }); }
    } else {
      let need = qty(-delta); let cands = list.filter((b) => b.qty > 0);
      if (opts.batchId) { cands = cands.filter((b) => b.id === opts.batchId); if (qty(cands.reduce((a, b) => a + b.qty, 0)) < need) throw new Error('The chosen batch does not have that many units.'); }
      else if (type === 'sale') cands = cands.filter((b) => !isExpired(b, today));
      const fifo = (SS.settings.get().batchMethod === 'fifo');
      cands.sort((a, b) => (type === 'expired' ? (isExpired(b, today) - isExpired(a, today)) : 0) || (fifo ? (a.receivedAt - b.receivedAt) : (cmpExpiry(a, b) || (a.receivedAt - b.receivedAt))));
      const avail = qty(cands.reduce((a, b) => a + b.qty, 0));
      if (avail < need) throw new Error(type === 'sale' && sellable(p) < need && stock >= need ? `Only ${formatQty(sellable(p))} of ${p.name} can be sold — the rest is expired. Record it as "Expired goods" in Inventory.` : `Insufficient stock: ${p.name} has ${formatQty(avail)} available but ${formatQty(need)} was requested.`);
      cands.forEach((b) => { if (need <= 0) return; const r = Math.min(need, b.qty); b.qty = qty(b.qty - r); need = qty(need - r); used.push({ id: b.id, number: b.number, expiry: b.expiry, qty: r }); });
    }
    return { batches: list.filter((b) => b.qty > 0), used };
  }

  /**
   * adjust({productId, type, quantity, reason, relatedId, unitCost, batch:{number,expiry,mfg}, batchId})
   * quantity: positive magnitude for signed types; signed delta for 'adjustment'/'stocktake'.
   * unitCost (integer MMK, additions only) feeds the weighted-average cost.
   * Writes the movement first, then the product; if the product write fails the movement is rolled back.
   */
  function adjust(opts) {
    const t = TYPES[opts.type];
    if (!t) throw new Error('Unknown stock movement type.');
    let q = qty(opts.quantity);
    if (!q) throw new Error('Quantity must be a non-zero number.');
    if (t.sign !== 0 && q < 0) throw new Error('Enter a positive quantity — the movement type decides the direction.');
    const delta = t.sign === 0 ? q : q * t.sign;
    const reason = String(opts.reason || '').trim();
    if (REASON_REQUIRED.includes(opts.type) && !reason) throw new Error('A reason is required for this stock change.');

    const products = SS.storage.read('products').slice();
    const idx = products.findIndex((p) => p.id === opts.productId);
    if (idx < 0) throw new Error('Product not found.');
    const p = products[idx];
    const prev = Number(p.stock) || 0; const next = qty(prev + delta);
    if (next < 0) throw new Error(`Insufficient stock: ${p.name} has ${formatQty(prev)} but ${formatQty(Math.abs(delta))} was requested.`);

    const plan = p.trackBatches ? planBatches(p, delta, opts, opts.type, SS.storage.read('stockMovements')) : null;
    let avgCost = p.avgCost != null ? p.avgCost : (p.purchasePrice || 0);
    if (delta > 0 && opts.unitCost != null && opts.unitCost !== '') {
      const cost = SS.utils.toInt(opts.unitCost);
      avgCost = next > 0 ? Math.round((prev * avgCost + delta * cost) / next) : cost;   // weighted-average costing
    }
    const mv = { id: SS.storage.uid('mov'), productId: p.id, type: opts.type, quantity: delta, previousStock: prev, newStock: next, reason, relatedId: opts.relatedId || null, createdAt: Date.now() };
    if (plan) mv.batches = plan.used;
    const moves = SS.storage.read('stockMovements').slice();
    const movesBefore = moves.slice();
    moves.push(mv);
    SS.storage.write('stockMovements', moves);
    try {
      products[idx] = Object.assign({}, p, plan ? { stock: next, avgCost, batches: plan.batches, updatedAt: Date.now() } : { stock: next, avgCost, updatedAt: Date.now() });
      SS.storage.write('products', products);
    } catch (e) {
      try { SS.storage.write('stockMovements', movesBefore, { force: true }); } catch (_) { /* best effort rollback */ }
      throw e;
    }
    if (!opts.noAudit) SS.audit.record('stock.' + opts.type, { type: 'product', id: p.id, label: p.name }, { stock: prev }, { stock: next, reason });
    return mv;
  }

  /** Movement list with product-name lookup (archived products stay resolvable). */
  function movements(filter) {
    filter = filter || {};
    const names = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p]));
    const q = (filter.search || '').toLowerCase();
    return SS.storage.read('stockMovements').filter((m) => {
      if (filter.type && m.type !== filter.type) return false;
      if (filter.productId && m.productId !== filter.productId) return false;
      const day = SS.utils.dayKey(m.createdAt);
      if (filter.from && day < filter.from) return false;
      if (filter.to && day > filter.to) return false;
      const p = names[m.productId];
      if (q && !(p && (p.name + ' ' + p.sku).toLowerCase().includes(q))) return false;
      return true;
    }).map((m) => Object.assign({}, m, { productName: names[m.productId] ? names[m.productId].name : '(missing product)' })).reverse();
  }

  /** Stock valuation. Cost value is computed only when cost access is unlocked. */
  function valuation() {
    const active = SS.storage.read('products').filter((p) => p.status !== 'archived');
    const out = { retail: active.reduce((a, p) => a + Math.round((Number(p.stock) || 0) * (p.sellingPrice || 0)), 0), units: active.reduce((a, p) => a + (Number(p.stock) || 0), 0), cost: null };
    if (SS.privacy.canViewCost()) out.cost = active.reduce((a, p) => a + Math.round((Number(p.stock) || 0) * (p.avgCost != null ? p.avgCost : (p.purchasePrice || 0))), 0);
    return out;
  }

  /* ---------- Adjust dialog (reused by Products / Inventory) ---------- */
  function openAdjustDialog(productId, onDone) {
    const products = SS.storage.read('products').filter((p) => p.status !== 'archived');
    if (!products.length) return SS.utils.toast('Add a product first.', 'warning');
    const manual = Object.entries(TYPES).filter(([, v]) => v.manual).map(([k, v]) => [k, v.label]);
    const prod = ui.select('adjProd', products.map((p) => [p.id, `${p.name} (${p.sku}) — ${formatQty(p.stock)}`]), productId);
    const type = ui.select('adjType', manual, 'addition');
    const q = el('input', { class: 'input', id: 'adjQty', type: 'number', step: 'any', inputmode: 'decimal' });
    const reason = el('input', { class: 'input', id: 'adjReason', placeholder: 'e.g. delivery received, broken in store' });
    const hint = el('span', { class: 'small muted', id: 'adjHint' });
    const costWrap = el('div'); const batchWrap = el('div');
    const syncHints = () => {
      hint.textContent = TYPES[type.value].sign === 0 ? 'Use + to add and − to remove (e.g. -3).' : TYPES[type.value].sign > 0 ? 'Quantity to ADD.' : 'Quantity to REMOVE.';
      clear(costWrap); clear(batchWrap);
      const bp = products.find((x) => x.id === prod.value);
      if (bp && bp.trackBatches) {
        if (TYPES[type.value].sign > 0 || (TYPES[type.value].sign === 0)) batchWrap.append(el('div', { class: 'form-grid' }, ui.field('Batch number', 'adjBatch', el('input', { class: 'input', id: 'adjBatch' })), ui.field('Manufacturing date', 'adjMfg', el('input', { class: 'input', id: 'adjMfg', type: 'date' })), ui.field('Expiry date', 'adjExp', el('input', { class: 'input', id: 'adjExp', type: 'date' }))), el('p', { class: 'small muted' }, 'Batch details apply when stock is added.'));
        if (TYPES[type.value].sign < 0 || TYPES[type.value].sign === 0) { const opts = [['', 'Automatic (' + (SS.settings.get().batchMethod === 'fifo' ? 'oldest first' : 'earliest expiry first') + ')']].concat(batchList(bp).filter((b) => b.id !== 'unassigned').map((b) => [b.id, `${b.number}${b.expiry ? ' · exp ' + b.expiry : ''} — ${formatQty(b.qty)}`])); batchWrap.append(ui.field('Take from batch (when removing)', 'adjFrom', ui.select('adjFrom', opts, ''))); }
      }
      if (TYPES[type.value].sign > 0 && SS.privacy.canViewCost()) costWrap.append(ui.field('Unit purchase cost (optional, updates average cost)', 'adjCost', el('input', { class: 'input', id: 'adjCost', type: 'number', min: '0', step: '1' })));
    };
    type.addEventListener('change', syncHints); prod.addEventListener('change', syncHints); syncHints();
    SS.utils.openModal({
      title: 'Adjust stock',
      body: el('div', null, ui.field('Product', 'adjProd', prod), ui.field('Movement type', 'adjType', type), ui.field('Quantity', 'adjQty', q, null), hint, batchWrap, costWrap, ui.field('Reason', 'adjReason', reason)),
      actions: [{ label: SS.i18n.t('cancel') }, { label: SS.i18n.t('save'), kind: 'primary', onClick: () => {
        try {
          const costEl = document.getElementById('adjCost');
          const g = (id) => { const n = document.getElementById(id); return n ? n.value : ''; };
          adjust({ productId: prod.value, type: type.value, quantity: q.value, reason: reason.value, unitCost: costEl ? costEl.value : null, batch: document.getElementById('adjBatch') ? { number: g('adjBatch'), mfg: g('adjMfg'), expiry: g('adjExp') } : null, batchId: g('adjFrom') || null });
          SS.utils.toast('Stock updated.', 'success'); if (onDone) onDone();
        } catch (e) { SS.utils.toast(e.message, 'error'); return false; }
      } }]
    });
  }

  /* ---------- Inventory page ---------- */
  function page(root) {
    const st = { tab: 'levels', search: '', type: '', from: '', to: '', status: '' };
    const cats = Object.fromEntries(SS.storage.read('categories').map((c) => [c.id, c.name]));
    const body = el('div');

    function levels() {
      const canCost = SS.privacy.canViewCost();
      const v = valuation();
      const rows = SS.storage.read('products').filter((p) => p.status !== 'archived').map((p) => ({ p, status: stockStatus(p) }))
        .filter((r) => (!st.status || r.status === st.status) && (!st.search || (r.p.name + ' ' + r.p.sku + ' ' + (r.p.barcode || '')).toLowerCase().includes(st.search.toLowerCase())));
      const cols = [
        { key: 'name', label: 'Product', sortValue: (r) => r.p.name, render: (r) => el('span', null, r.p.name, el('span', { class: 'sub' }, r.p.sku + (r.p.barcode ? ' · ' + r.p.barcode : ''))) },
        { key: 'cat', label: 'Category', sortValue: (r) => cats[r.p.categoryId] || '', render: (r) => cats[r.p.categoryId] || '—' },
        { key: 'stock', label: 'Stock', num: true, sortValue: (r) => Number(r.p.stock) || 0, render: (r) => formatQty(r.p.stock) + ' ' + unitOf(r.p) },
        { key: 'status', label: 'Status', sortValue: (r) => r.status, render: (r) => r.status === 'out' ? ui.badge('Out of stock', 'danger') : r.status === 'low' ? ui.badge('Low stock', 'warning') : ui.badge('In stock', 'success') },
        { key: 'retail', label: 'Retail value', num: true, sortValue: (r) => (Number(r.p.stock) || 0) * (r.p.sellingPrice || 0), render: (r) => formatMMK(Math.round((Number(r.p.stock) || 0) * (r.p.sellingPrice || 0))) }
      ];
      if (canCost) cols.push({ key: 'cost', label: 'Cost value', num: true, sortValue: (r) => (Number(r.p.stock) || 0) * (r.p.avgCost || 0), render: (r) => formatMMK(Math.round((Number(r.p.stock) || 0) * (r.p.avgCost != null ? r.p.avgCost : (r.p.purchasePrice || 0)))) });
      cols.push({ key: 'act', label: '', sortable: false, render: (r) => el('div', { class: 'row-actions' }, el('button', { class: 'btn sm', type: 'button', onclick: () => openAdjustDialog(r.p.id, () => SS.app.refresh()) }, 'Adjust')) });
      const table = ui.dataTable({ columns: cols, rows, rowKey: 'k', empty: { title: 'No products to show', hint: 'Add products on the Products page, or change the filters.' } });
      rows.forEach((r) => { r.k = r.p.id; });
      table.setRows(rows);
      return el('div', null,
        el('div', { class: 'grid', style: 'margin-bottom:16px' },
          el('div', { class: 'col-4' }, el('div', { class: 'card stat' }, el('div', { class: 'label' }, 'Total stock units'), el('div', { class: 'value' }, formatQty(v.units)))),
          el('div', { class: 'col-4' }, el('div', { class: 'card stat' }, el('div', { class: 'label' }, 'Retail value'), el('div', { class: 'value' }, formatMMK(v.retail)))),
          el('div', { class: 'col-4' }, el('div', { class: 'card stat' }, el('div', { class: 'label' }, 'Cost value'), el('div', { class: 'value' }, v.cost == null ? el('span', { class: 'mask' }, '••••••') : formatMMK(v.cost)),
            el('div', { class: 'hint' }, v.cost == null ? el('button', { class: 'btn sm', type: 'button', onclick: () => SS.privacy.requestUnlock().then((ok) => ok && SS.app.refresh()) }, 'Show (admin PIN)') : el('button', { class: 'btn sm', type: 'button', onclick: () => { SS.privacy.lock(); SS.app.refresh(); } }, 'Hide'))))),
        el('div', { class: 'card' }, table.node));
    }

    function moves() {
      const rows = movements({ type: st.type, search: st.search, from: st.from, to: st.to });
      const table = ui.dataTable({ rowKey: 'id', pageSize: 20, rows, empty: { title: 'No stock movements', hint: 'Every stock change is recorded here automatically.' }, columns: [
        { key: 'createdAt', label: 'Time', render: (m) => formatDate(m.createdAt, true) },
        { key: 'productName', label: 'Product' },
        { key: 'type', label: 'Type', render: (m) => (TYPES[m.type] || {}).label || m.type },
        { key: 'quantity', label: 'Change', num: true, render: (m) => (m.quantity > 0 ? '+' : '') + formatQty(m.quantity) },
        { key: 'newStock', label: 'Stock after', num: true, render: (m) => `${formatQty(m.previousStock)} → ${formatQty(m.newStock)}` },
        { key: 'reason', label: 'Reason', sortable: false }] });
      return el('div', { class: 'card' }, table.node);
    }

    function draw() {
      clear(body);
      const search = el('input', { class: 'input grow', type: 'search', placeholder: 'Search name, SKU or barcode…', 'aria-label': 'Search', value: st.search, 'data-scan': '1' });
      search.addEventListener('input', SS.utils.debounce(() => { st.search = search.value; const pos = search.selectionStart; draw(); const n = body.querySelector('input[type=search]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 200));
      search.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return; e.preventDefault();
        const hit = SS.barcode.find(search.value);   // barcode lookup (scanner types the code then Enter)
        if (hit) { st.search = hit.barcode || hit.sku; draw(); SS.utils.toast('Found: ' + hit.name, 'success'); } else SS.utils.toast('No product with that barcode or SKU.', 'warning');
      });
      const bar = el('div', { class: 'toolbar' }, search);
      if (st.tab === 'levels') bar.append(ui.select('fStatus', [['', 'All stock levels'], ['ok', 'In stock'], ['low', 'Low stock'], ['out', 'Out of stock']], st.status));
      else {
        bar.append(ui.select('fType', [['', 'All movement types']].concat(Object.entries(TYPES).map(([k, v]) => [k, v.label])), st.type),
          el('input', { class: 'input', id: 'fFrom', type: 'date', value: st.from, 'aria-label': 'From date' }), el('input', { class: 'input', id: 'fTo', type: 'date', value: st.to, 'aria-label': 'To date' }));
      }
      bar.addEventListener('change', (e) => { const m = { fStatus: 'status', fType: 'type', fFrom: 'from', fTo: 'to' }[e.target.id]; if (m) { st[m] = e.target.value; draw(); } });
      body.append(el('div', { class: 'tabs', role: 'tablist' },
        el('button', { class: 'tab' + (st.tab === 'levels' ? ' active' : ''), type: 'button', role: 'tab', onclick: () => { st.tab = 'levels'; st.search = ''; draw(); } }, 'Stock levels'),
        el('button', { class: 'tab' + (st.tab === 'moves' ? ' active' : ''), type: 'button', role: 'tab', onclick: () => { st.tab = 'moves'; st.search = ''; draw(); } }, 'Stock movements')),
        bar, st.tab === 'levels' ? levels() : moves());
    }

    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('inventory')), el('p', null, 'Stock levels, valuation and the full movement history.')),
      el('button', { class: 'btn primary', type: 'button', onclick: () => openAdjustDialog(null, () => SS.app.refresh()) }, 'Adjust stock')), body);
    draw();
  }
  /** Pieces, packs, boxes and bottles must be sold in whole numbers. */
  function isWholeUnit(unit) { return ['piece', 'pack', 'box', 'bottle'].includes(unit); }
  function unitOf(p) { return p.unit === 'custom' ? (p.customUnit || '') : (p.unit || ''); }

  SS.inventory = { TYPES, isWholeUnit, sellable, batchList, isExpired, checkBatchInfo, adjust, movements, valuation, stockStatus, openAdjustDialog, unitOf };
  SS.pages = SS.pages || {}; SS.pages.inventory = page;
})();
