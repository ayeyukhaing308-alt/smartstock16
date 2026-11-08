/* SmartStock — pos.js
 * Point-of-sale screen. All money maths and stock changes go through SS.sales (never done here).
 * Shortcuts: F2 = focus search, F9 = checkout. A USB scanner works from anywhere on the page.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatQty, toInt, qty } = SS.utils;
  const ui = SS.ui;

  let cart = newCart();
  function newCart() { return { lines: [], discountType: 'amt', discountValue: 0, customerId: '', method: '', received: '', receivedEdited: false, note: '', token: SS.storage ? SS.storage.uid('tok') : String(Date.now()), busy: false }; }

  /* ---------- Cart operations ---------- */
  function addProduct(id, q) {
    const p = SS.storage.collection.byId('products', id);
    if (!p || p.status === 'archived') return SS.utils.toast('That product is not available.', 'warning');
    const add = q || (SS.inventory.isWholeUnit(p.unit) ? 1 : 1);
    const line = cart.lines.find((l) => l.productId === id);
    const next = qty((line ? line.qty : 0) + add);
    if (next > (Number(p.stock) || 0)) return SS.utils.toast(`${p.name}: only ${formatQty(p.stock)} in stock.`, 'warning');
    if (line) line.qty = next; else cart.lines.push({ productId: id, qty: add, discountType: 'amt', discountValue: 0 });
    cart.receivedEdited = false; redraw();
  }
  function addByCode(code) {
    const hit = SS.barcode.find(code);
    if (!hit) { SS.utils.toast('No product with code ' + code + '.', 'warning'); return false; }
    addProduct(hit.id); return true;
  }

  let redraw = () => {}; let drawGrid = () => {};

  /* ---------- Dialogs ---------- */
  function openLineDiscount(line) {
    const type = ui.select('ldType', [['amt', 'MMK'], ['pct', '%']], line.discountType); const val = el('input', { class: 'input', id: 'ldVal', type: 'number', min: '0', step: 'any', value: line.discountValue || '' });
    SS.utils.openModal({ title: 'Item discount', body: el('div', { class: 'form-grid' }, ui.field('Type', 'ldType', type), ui.field('Value', 'ldVal', val)),
      actions: [{ label: SS.i18n.t('cancel') }, { label: 'Clear', onClick: () => { line.discountValue = 0; redraw(); } }, { label: 'Apply', kind: 'primary', onClick: () => { line.discountType = type.value; line.discountValue = Number(val.value) || 0; redraw(); } }] });
  }
  function openQuickCustomer() {
    const name = el('input', { class: 'input', id: 'qcName' }); const phone = el('input', { class: 'input', id: 'qcPhone', type: 'tel' });
    SS.utils.openModal({ title: 'New customer', body: el('div', null, ui.field('Name', 'qcName', name), ui.field('Phone', 'qcPhone', phone)), actions: [{ label: SS.i18n.t('cancel') }, { label: SS.i18n.t('save'), kind: 'primary', onClick: () => {
      if (!name.value.trim()) { ui.setError(name, 'Name is required.'); return false; }
      try { const c = SS.storage.collection.insert('customers', { name: name.value.trim(), phone: phone.value.trim(), address: '', notes: '', totalPurchases: 0, outstandingBalance: 0, status: 'active' }, 'cus'); SS.audit.record('customer.created', { type: 'customer', id: c.id, label: c.name }); cart.customerId = c.id; redraw(); }
      catch (e) { SS.utils.toast(e.message, 'error'); return false; }
    } }] });
  }

  function checkout() {
    if (cart.busy) return; const priced = SS.sales.price(cart);
    if (!cart.lines.length) return SS.utils.toast('Add at least one item.', 'warning');
    if (!priced.valid || priced.discountError) return SS.utils.toast('Fix the highlighted items before checkout.', 'warning');
    const go = () => {
      cart.busy = true; redraw();
      try {
        const method = cart.method || SS.settings.get().defaultPayment || 'cash';
        const received = cart.receivedEdited ? cart.received : priced.total;
        const { sale, duplicate } = SS.sales.complete(cart, { customerId: cart.customerId, method, received, token: cart.token, note: cart.note });
        cart = newCart(); redraw(); drawGrid();
        SS.utils.openModal({ title: duplicate ? 'Sale already recorded' : 'Sale complete', body: el('div', null, el('p', { style: 'font-size:22px;font-weight:650;margin:0' }, formatMMK(sale.total)), el('p', { class: 'muted' }, sale.number),
          sale.change > 0 ? el('p', null, 'Change to give: ', el('strong', null, formatMMK(sale.change))) : null, sale.balance > 0 ? el('p', null, 'Unpaid balance recorded: ', el('strong', null, formatMMK(sale.balance))) : null),
          actions: [{ label: 'New sale' }, { label: 'Print receipt', kind: 'primary', onClick: () => { setTimeout(() => SS.sales.printReceipt(sale, false), 0); } }] });
      } catch (e) { cart.busy = false; redraw(); SS.utils.toast(e.message, 'error'); }
    };
    const low = SS.sales.belowCost(priced);
    if (low.length) SS.utils.confirmDialog('Selling below cost', `These items would be sold below their purchase cost: ${low.join(', ')}. Continue?`, 'Sell anyway', true).then((ok) => { if (ok) go(); });
    else go();
  }

  /* ---------- Page ---------- */
  function page(root) {
    const st = { search: '', cat: '' };
    const grid = el('div', { class: 'pos-grid' }); const cartHolder = el('div', { class: 'card pos-cart', id: 'posCart' });
    const search = el('input', { class: 'input grow', type: 'search', id: 'posSearch', placeholder: 'Search or scan barcode…  (F2)', 'aria-label': 'Search products or scan barcode', autocomplete: 'off', 'data-scan': '1' });
    const catSel = ui.select('posCat', [['', 'All categories']].concat(SS.categories.all().filter((c) => c.status !== 'archived').map((c) => [c.id, c.name])), '');
    const fab = el('button', { class: 'btn primary pos-fab', type: 'button', onclick: () => cartHolder.scrollIntoView({ behavior: 'smooth' }) });

    drawGrid = function () {
      clear(grid); const q = st.search.trim().toLowerCase();
      const items = SS.storage.read('products').filter((p) => p.status !== 'archived' && (!st.cat || p.categoryId === st.cat) && (!q || (p.name + ' ' + p.sku + ' ' + (p.barcode || '')).toLowerCase().includes(q)));
      if (!SS.storage.read('products').length) return grid.append(el('div', { class: 'empty' }, el('strong', null, 'No products yet'), 'Add products first, then sell them here.', el('div', { style: 'margin-top:10px' }, el('a', { class: 'btn primary', href: '#/products' }, 'Go to Products'))));
      if (!items.length) return grid.append(el('div', { class: 'empty' }, el('strong', null, 'No matching products'), 'Try another name, SKU or barcode.'));
      items.slice(0, 60).forEach((p) => { const status = SS.inventory.stockStatus(p);
        grid.append(el('button', { class: 'pos-tile', type: 'button', disabled: status === 'out', onclick: () => addProduct(p.id) }, el('span', { class: 'pt-name' }, p.name), el('span', { class: 'pt-price' }, formatMMK(p.sellingPrice || 0)),
          el('span', { class: 'pt-stock ' + status }, status === 'out' ? 'Out of stock' : formatQty(p.stock) + ' ' + SS.inventory.unitOf(p)))); });
      if (items.length > 60) grid.append(el('div', { class: 'muted small', style: 'grid-column:1/-1' }, 'Showing 60 of ' + items.length + '. Search to narrow down.'));
    };

    redraw = function () {
      const pr = SS.sales.price(cart); const settings = SS.settings.get(); clear(cartHolder);
      const method = cart.method || settings.defaultPayment || 'cash';
      const receivedVal = cart.receivedEdited ? toInt(cart.received) : pr.total;
      const lineEls = cart.lines.map((l, i) => { const pl = pr.lines[i];
        const q = el('input', { class: 'input pos-qty', type: 'number', min: '0', step: SS.inventory.isWholeUnit(SS.storage.collection.byId('products', l.productId) && SS.storage.collection.byId('products', l.productId).unit) ? '1' : 'any', value: l.qty, 'aria-label': 'Quantity for ' + pl.productName });
        q.addEventListener('change', () => { l.qty = qty(q.value); if (!(l.qty > 0)) cart.lines.splice(i, 1); cart.receivedEdited = false; redraw(); });
        return el('li', { class: 'pos-line' + (pl.error ? ' bad' : '') },
          el('div', { class: 'pl-top' }, el('span', { class: 'pl-name' }, pl.productName), el('strong', { class: 'num' }, formatMMK(pl.lineTotal))),
          el('div', { class: 'pl-mid' }, el('button', { class: 'btn sm', type: 'button', 'aria-label': 'Decrease', onclick: () => { l.qty = qty(l.qty - 1); if (!(l.qty > 0)) cart.lines.splice(i, 1); cart.receivedEdited = false; redraw(); } }, '−'), q,
            el('button', { class: 'btn sm', type: 'button', 'aria-label': 'Increase', onclick: () => { l.qty = qty(l.qty + 1); cart.receivedEdited = false; redraw(); } }, '+'),
            el('span', { class: 'muted small' }, '× ' + formatMMK(pl.unitPrice)),
            el('button', { class: 'btn sm', type: 'button', onclick: () => openLineDiscount(l) }, pl.discountAmount ? 'Disc −' + formatMMK(pl.discountAmount) : 'Discount'),
            el('button', { class: 'btn sm', type: 'button', 'aria-label': 'Remove ' + pl.productName, onclick: () => { cart.lines.splice(i, 1); cart.receivedEdited = false; redraw(); } }, '✕')),
          pl.error ? el('div', { class: 'err' }, pl.error) : null); });

      const customers = SS.storage.read('customers').filter((c) => c.status !== 'archived');
      const cust = ui.select('posCust', [['', 'Walk-in customer']].concat(customers.map((c) => [c.id, c.name + (c.outstandingBalance > 0 ? ' (owes ' + SS.utils.formatNumber(c.outstandingBalance) + ')' : '')])), cart.customerId);
      cust.addEventListener('change', () => { cart.customerId = cust.value; });
      const dType = ui.select('posDType', [['amt', 'MMK'], ['pct', '%']], cart.discountType); const dVal = el('input', { class: 'input', id: 'posDVal', type: 'number', min: '0', step: 'any', value: cart.discountValue || '', 'aria-label': 'Sale discount', style: 'width:110px' });
      dType.addEventListener('change', () => { cart.discountType = dType.value; redraw(); }); dVal.addEventListener('change', () => { cart.discountValue = Number(dVal.value) || 0; cart.receivedEdited = false; redraw(); });
      const meth = ui.select('posMethod', SS.sales.METHODS.map((m) => [m[0], m[1]]), method); meth.addEventListener('change', () => { cart.method = meth.value; redraw(); });
      const recv = el('input', { class: 'input', id: 'posRecv', type: 'number', min: '0', step: '1', inputmode: 'numeric', value: receivedVal, 'aria-label': 'Amount received' });
      const info = el('div', { class: 'pos-pay-info' });
      const paint = () => { const r = toInt(recv.value); const bal = Math.max(0, pr.total - r); const chg = method === 'cash' ? Math.max(0, r - pr.total) : 0; clear(info);
        info.append(...[chg > 0 ? el('div', { class: 'r-row' }, el('span', null, 'Change'), el('strong', null, formatMMK(chg))) : null, bal > 0 ? el('div', { class: 'r-row warn' }, el('span', null, 'Unpaid balance'), el('strong', null, formatMMK(bal))) : null,
          method !== 'cash' && r > pr.total ? el('div', { class: 'err' }, 'Non-cash payment cannot be more than the total.') : null].filter(Boolean)); };
      recv.addEventListener('input', () => { cart.received = recv.value; cart.receivedEdited = true; paint(); }); paint();

      cartHolder.append(el('div', { class: 'card-head' }, el('h2', null, 'Current sale'), cart.lines.length ? el('button', { class: 'btn sm', type: 'button', onclick: () => { cart = newCart(); redraw(); } }, 'Clear') : null),
        cart.lines.length ? el('ul', { class: 'pos-lines' }, lineEls) : el('div', { class: 'empty' }, el('strong', null, 'Cart is empty'), 'Tap a product or scan a barcode.'),
        el('div', { class: 'pos-sum' },
          el('div', { class: 'r-row' }, el('span', null, 'Subtotal'), el('span', null, formatMMK(pr.subtotal))),
          el('div', { class: 'r-row' }, el('span', null, 'Sale discount'), el('span', { class: 'toolbar', style: 'margin:0' }, dType, dVal)),
          pr.discountError ? el('div', { class: 'err' }, pr.discountError) : null,
          pr.discountAmount ? el('div', { class: 'r-row' }, el('span', { class: 'muted' }, 'Discount applied'), el('span', null, '−' + formatMMK(pr.discountAmount))) : null,
          pr.taxAmount ? el('div', { class: 'r-row' }, el('span', null, 'Tax (' + pr.taxRate + '%)'), el('span', null, formatMMK(pr.taxAmount))) : null,
          el('div', { class: 'r-row pos-total' }, el('span', null, 'Total'), el('span', null, formatMMK(pr.total)))),
        el('div', { class: 'pos-pay' },
          el('div', { class: 'field' }, el('label', { for: 'posCust' }, 'Customer'), el('div', { class: 'toolbar', style: 'margin:0' }, cust, el('button', { class: 'btn sm', type: 'button', onclick: openQuickCustomer }, '+ New'))),
          el('div', { class: 'form-grid' }, el('div', { class: 'field' }, el('label', { for: 'posMethod' }, 'Payment method'), meth), el('div', { class: 'field' }, el('label', { for: 'posRecv' }, 'Amount received'), recv)),
          el('div', { class: 'toolbar', style: 'margin:0 0 8px' }, el('button', { class: 'btn sm', type: 'button', onclick: () => { cart.received = ''; cart.receivedEdited = false; redraw(); } }, 'Exact amount')), info,
          el('button', { class: 'btn primary pos-checkout', type: 'button', disabled: cart.busy || !cart.lines.length, onclick: checkout }, cart.busy ? 'Processing…' : 'Checkout  (F9)')));
      fab.textContent = `Cart (${cart.lines.length}) · ${formatMMK(pr.total)}`; fab.hidden = !cart.lines.length;
    };

    search.addEventListener('input', SS.utils.debounce(() => { st.search = search.value; drawGrid(); }, 120));
    search.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const v = search.value.trim(); if (!v) return;
      if (SS.barcode.find(v)) { addByCode(v); search.value = ''; st.search = ''; drawGrid(); return; }
      const only = SS.storage.read('products').filter((p) => p.status !== 'archived' && (p.name + ' ' + p.sku).toLowerCase().includes(v.toLowerCase()));
      if (only.length === 1) { addProduct(only[0].id); search.value = ''; st.search = ''; drawGrid(); } else SS.utils.toast(only.length ? 'Several products match. Tap the one you want.' : 'No product with that name, SKU or barcode.', 'warning'); });
    catSel.addEventListener('change', () => { st.cat = catSel.value; drawGrid(); });
    SS.barcode.onScan((code) => addByCode(code));

    root.append(el('div', { class: 'pos-layout', id: 'posRoot' }, el('div', null, el('div', { class: 'toolbar' }, search, catSel), grid), cartHolder), fab);
    drawGrid(); redraw(); setTimeout(() => search.focus(), 0);
  }

  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('posRoot') || document.querySelector('.modal')) return;
    if (e.key === 'F2') { e.preventDefault(); const s = document.getElementById('posSearch'); if (s) { s.focus(); s.select(); } }
    if (e.key === 'F9') { e.preventDefault(); checkout(); }
  });

  SS.pos = { page, addProduct, getCart: () => cart };
})();
