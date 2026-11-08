/* SmartStock — purchases.js
 * Purchase orders: draft -> confirmed. Confirming adds stock exactly once, updates weighted-average cost
 * (extra costs and discount are spread over the lines as landed cost), records the supplier payment and
 * the unpaid balance owed to the supplier.
 *
 * PRIVACY: this is an authorised section. The list shows totals and balances only; unit costs, the editor,
 * details and invoices need the administrator PIN, and hide again when you leave the page.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatQty, toInt, qty, formatDate, dayKey } = SS.utils; const ui = SS.ui;
  const KEYS = ['purchases', 'products', 'stockMovements', 'payments', 'suppliers', 'meta'];
  const byId = (id) => SS.storage.collection.byId('purchases', id);

  /* ---------- Pure calculation ---------- */
  /** lines: [{qty, unitCost}] -> subtotal, total and the landed (unit) cost of each line. */
  function totals(lines, additional, discount) {
    additional = toInt(additional); discount = toInt(discount);
    const lt = lines.map((l) => Math.round(qty(l.qty) * toInt(l.unitCost))); const subtotal = lt.reduce((a, b) => a + b, 0);
    const adj = additional - discount; let left = adj;
    const out = lines.map((l, i) => {
      const share = i === lines.length - 1 ? left : (subtotal ? Math.round(adj * lt[i] / subtotal) : 0); left -= share;
      const landedTotal = lt[i] + share; return { lineTotal: lt[i], landedTotal, landedUnit: qty(l.qty) > 0 ? Math.round(landedTotal / qty(l.qty)) : 0 };
    });
    return { subtotal, additional, discount, total: subtotal + adj, lines: out };
  }

  /** Small input bound to a purchase line field (batch number / expiry). */
  function batchInput(l, field, label, type, name) { const i = el('input', { class: 'input', type, value: l[field] || '', placeholder: label, 'aria-label': label + ' for ' + name, style: 'width:' + (type === 'date' ? '150' : '110') + 'px;margin-top:4px;margin-right:6px' }); i.addEventListener('change', () => { l[field] = i.value; }); return i; }

  function validate(d) {
    const supplier = SS.storage.collection.byId('suppliers', d.supplierId);
    if (!supplier) throw new Error('Choose a supplier.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) throw new Error('Enter the purchase date.');
    if (!d.lines.length) throw new Error('Add at least one product.');
    const seen = new Set();
    d.lines.forEach((l) => {
      const p = SS.storage.collection.byId('products', l.productId); if (!p) throw new Error('A product on this purchase no longer exists.');
      if (seen.has(l.productId)) throw new Error(p.name + ' appears twice. Combine the quantities into one line.'); seen.add(l.productId);
      if (!(qty(l.qty) > 0)) throw new Error(p.name + ': quantity must be more than 0.');
      if (SS.inventory.isWholeUnit(p.unit) && !Number.isInteger(qty(l.qty))) throw new Error(p.name + ' is bought in whole numbers.');
      if (String(l.unitCost) === '' || toInt(l.unitCost) < 0) throw new Error(p.name + ': enter the unit cost (0 or more).');
      if (p.trackBatches) { try { SS.inventory.checkBatchInfo({ number: l.batchNumber, expiry: l.expiry, mfg: l.mfg }); } catch (e) { throw new Error(p.name + ': ' + e.message); } }
    });
    if (toInt(d.additional) < 0 || toInt(d.discount) < 0) throw new Error('Additional costs and discount cannot be negative.');
    const t = totals(d.lines, d.additional, d.discount); if (t.total < 0) throw new Error('The discount is larger than the purchase amount.');
    return { supplier, t };
  }

  /* ---------- Drafts ---------- */
  function saveDraft(d, id) {
    const { supplier, t } = validate(d);
    const fields = { supplierId: supplier.id, supplierName: supplier.name, date: d.date, method: d.method || 'cash', notes: String(d.notes || '').trim(), additionalCosts: t.additional, discount: t.discount, subtotal: t.subtotal, total: t.total, balance: t.total, paid: 0,
      lines: d.lines.map((l, i) => { const p = SS.storage.collection.byId('products', l.productId); return { productId: p.id, productName: p.name, sku: p.sku, unit: SS.inventory.unitOf(p), qty: qty(l.qty), unitCost: toInt(l.unitCost), lineTotal: t.lines[i].lineTotal, batchNumber: String(l.batchNumber || '').trim(), expiry: String(l.expiry || '').trim(), mfg: String(l.mfg || '').trim() }; }) };
    if (id) {
      const cur = byId(id); if (!cur || cur.status !== 'draft') throw new Error('Only draft purchases can be edited.');
      const rec = SS.storage.collection.update('purchases', id, fields); SS.audit.record('purchase.draft_updated', { type: 'purchase', id, label: cur.number }); return rec;
    }
    const number = 'PO-' + String(SS.storage.counter('purchase')).padStart(6, '0');
    const rec = SS.storage.collection.insert('purchases', Object.assign({ number, status: 'draft' }, fields), 'pur');
    SS.audit.record('purchase.draft_created', { type: 'purchase', id: rec.id, label: number }); return rec;
  }
  function cancelDraft(id, reason) {
    const p = byId(id); if (!p || p.status !== 'draft') throw new Error('Only draft purchases can be cancelled.');
    SS.storage.collection.update('purchases', id, { status: 'cancelled', cancelReason: String(reason || '').trim() }); SS.audit.record('purchase.cancelled', { type: 'purchase', id, label: p.number });
  }

  /* ---------- Confirmation ---------- */
  function confirm(id, o) {
    o = o || {}; const pur = byId(id); if (!pur) throw new Error('Purchase not found.');
    if (pur.status === 'confirmed') throw new Error('This purchase is already confirmed. Stock was added once and cannot be added again.');
    if (pur.status !== 'draft') throw new Error('Only draft purchases can be confirmed.');
    const d = { supplierId: pur.supplierId, date: pur.date, lines: pur.lines, additional: pur.additionalCosts, discount: pur.discount };
    const { supplier, t } = validate(d);
    if (supplier.status === 'archived') throw new Error('This supplier is archived. Restore the supplier before confirming.');
    const paid = toInt(o.paid); if (paid < 0 || paid > t.total) throw new Error('Amount paid must be between 0 and ' + formatMMK(t.total) + '.');
    const method = o.method || pur.method || 'cash'; if (paid > 0 && !SS.payments.METHODS.includes(method)) throw new Error('Choose a payment method.');
    const balance = t.total - paid;
    return SS.storage.transaction(KEYS, () => {
      const prods = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p]));
      // step 1: mark as confirming and keep what is needed to undo after a crash
      SS.storage.collection.update('purchases', id, { status: 'confirming', paid, balance, undo: pur.lines.map((l) => ({ productId: l.productId, avgCost: prods[l.productId].avgCost, purchasePrice: prods[l.productId].purchasePrice })) });
      pur.lines.forEach((l, i) => {
        SS.inventory.adjust({ productId: l.productId, type: 'purchase', quantity: l.qty, reason: 'Purchase ' + pur.number, relatedId: id, unitCost: t.lines[i].landedUnit, noAudit: true, batch: prods[l.productId].trackBatches ? { number: l.batchNumber || ('PO-' + pur.number), expiry: l.expiry, mfg: l.mfg } : null });
        SS.products.recordPurchasePrice(l.productId, toInt(l.unitCost));
      });
      if (paid > 0) SS.payments.record({ kind: 'supplier_payment', direction: 'out', supplierId: supplier.id, purchaseId: id, method, amount: paid });
      SS.storage.collection.update('suppliers', supplier.id, { outstandingBalance: toInt(supplier.outstandingBalance) + balance, lastPurchaseApplied: id });
      const next = SS.storage.collection.update('purchases', id, { status: 'confirmed', confirmedAt: Date.now(), method, undo: null, lines: pur.lines.map((l, i) => Object.assign({}, l, { landedUnitCost: t.lines[i].landedUnit })) });
      SS.audit.record('purchase.confirmed', { type: 'purchase', id, label: pur.number }, null, { total: t.total, paid, balance, items: pur.lines.length });
      return next;
    });
  }

  /** Puts purchases left in 'confirming' (browser closed mid-confirmation) back to draft. Safe to repeat. */
  function recover() {
    let n = 0;
    SS.storage.read('purchases').filter((p) => p.status === 'confirming').forEach((p) => {
      try {
        const net = {}; SS.storage.read('stockMovements').filter((m) => m.relatedId === p.id).forEach((m) => { net[m.productId] = qty((net[m.productId] || 0) + m.quantity); });
        const recMoves = SS.storage.read('stockMovements').filter((m) => m.relatedId === p.id && m.batches && m.quantity > 0);
        Object.entries(net).forEach(([pid, q]) => {
          if (!(q > 0)) return; const prod = SS.storage.collection.byId('products', pid); const mine = recMoves.filter((m) => m.productId === pid);
          if (prod && prod.trackBatches && mine.length) mine.forEach((m) => m.batches.forEach((b) => SS.inventory.adjust({ productId: pid, type: 'supplier_return', quantity: b.qty, batchId: b.id, reason: 'Rollback of interrupted purchase ' + p.number, relatedId: p.id, noAudit: true })));   // take back from the very batches it created
          else SS.inventory.adjust({ productId: pid, type: 'supplier_return', quantity: q, reason: 'Rollback of interrupted purchase ' + p.number, relatedId: p.id, noAudit: true });
        });
        const undo = new Map((p.undo || []).map((u) => [u.productId, u]));
        SS.storage.write('products', SS.storage.read('products').map((pr) => (undo.has(pr.id) ? Object.assign({}, pr, { avgCost: undo.get(pr.id).avgCost, purchasePrice: undo.get(pr.id).purchasePrice }) : pr)));
        const pays = SS.storage.read('payments'); if (pays.some((x) => x.purchaseId === p.id)) SS.storage.write('payments', pays.filter((x) => x.purchaseId !== p.id));
        const s = SS.storage.collection.byId('suppliers', p.supplierId);
        if (s && s.lastPurchaseApplied === p.id) SS.storage.collection.update('suppliers', s.id, { outstandingBalance: toInt(s.outstandingBalance) - toInt(p.balance), lastPurchaseApplied: '' });
        SS.storage.collection.update('purchases', p.id, { status: 'draft', paid: 0, balance: p.total, undo: null });
        SS.audit.record('purchase.rolled_back', { type: 'purchase', id: p.id, label: p.number }); n++;
      } catch (e) { console.error('[SmartStock] could not recover purchase ' + p.number, e); }
    });
    return n;
  }

  /* ---------- UI ---------- */
  const unlockThen = (fn) => (SS.privacy.canViewCost() ? fn() : SS.privacy.requestUnlock().then((ok) => { if (ok) fn(); }));
  const statusOf = (p) => (p.status === 'draft' ? ['Draft', 'info'] : p.status === 'cancelled' ? ['Cancelled', 'danger'] : p.status === 'confirming' ? ['Interrupted', 'warning'] : p.balance > 0 ? ['Unpaid balance', 'warning'] : ['Paid', 'success']);

  function openEditor(id, onDone) {
    const cur = id ? byId(id) : null; if (cur && cur.status !== 'draft') return openDetails(id, onDone);
    const sups = SS.suppliers.options(cur && cur.supplierId);
    if (!sups.length) return SS.utils.toast('Add a supplier first (Suppliers page).', 'warning');
    if (!SS.storage.read('products').some((p) => p.status !== 'archived')) return SS.utils.toast('Add products first (Products page).', 'warning');
    const lines = cur ? cur.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitCost: l.unitCost, batchNumber: l.batchNumber || '', expiry: l.expiry || '', mfg: l.mfg || '' })) : [];
    const sup = ui.select('poSup', [['', '— choose supplier —']].concat(sups.map((s) => [s.id, s.name])), cur ? cur.supplierId : '');
    const date = el('input', { class: 'input', id: 'poDate', type: 'date', value: cur ? cur.date : dayKey(Date.now()) });
    const addl = el('input', { class: 'input', id: 'poAddl', type: 'number', min: '0', step: '1', value: cur ? cur.additionalCosts || '' : '', placeholder: '0' });
    const disc = el('input', { class: 'input', id: 'poDisc', type: 'number', min: '0', step: '1', value: cur ? cur.discount || '' : '', placeholder: '0' });
    const notes = el('input', { class: 'input', id: 'poNotes', value: cur ? cur.notes || '' : '' });
    const prods = SS.storage.read('products').filter((p) => p.status !== 'archived'); const label = (p) => `${p.name} · ${p.sku}`;
    const pick = el('input', { class: 'input', id: 'poPick', list: 'poProducts', placeholder: 'Type a product name, SKU or scan a barcode, then Enter', autocomplete: 'off', 'data-scan': '1' });
    const dl = el('datalist', { id: 'poProducts' }, prods.map((p) => el('option', { value: label(p) })));
    const body = el('div'); const totalsEl = el('div');
    const add = (p) => { if (!lines.some((l) => l.productId === p.id)) lines.push({ productId: p.id, qty: 1, unitCost: p.purchasePrice || 0 }); pick.value = ''; draw(); };
    pick.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const v = pick.value.trim(); const hit = SS.barcode.find(v) || prods.find((p) => label(p) === v) || prods.find((p) => p.name.toLowerCase() === v.toLowerCase()); if (hit && hit.status !== 'archived') add(hit); else SS.utils.toast('No matching product.', 'warning'); });
    pick.addEventListener('change', () => { const hit = prods.find((p) => label(p) === pick.value); if (hit) add(hit); });
    function current() { return { supplierId: sup.value, date: date.value, lines, additional: addl.value, discount: disc.value, notes: notes.value }; }
    function draw() {
      clear(body); clear(totalsEl); const t = totals(lines, addl.value, disc.value);
      body.append(lines.length ? el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, ['Product', 'Qty', 'Unit cost (MMK)', 'Line total', ''].map((h, i) => el('th', { class: i && i < 4 ? 'num' : '' }, h)))),
        el('tbody', null, lines.map((l, i) => { const p = SS.storage.collection.byId('products', l.productId);
          const q = el('input', { class: 'input', type: 'number', min: '0', step: SS.inventory.isWholeUnit(p.unit) ? '1' : 'any', value: l.qty, style: 'width:90px;text-align:right', 'aria-label': 'Quantity for ' + p.name }); q.addEventListener('change', () => { l.qty = qty(q.value); draw(); });
          const c = el('input', { class: 'input', type: 'number', min: '0', step: '1', value: l.unitCost, style: 'width:120px;text-align:right', 'aria-label': 'Unit cost for ' + p.name }); c.addEventListener('change', () => { l.unitCost = c.value === '' ? '' : toInt(c.value); draw(); });
          return el('tr', null, el('td', null, p.name, el('span', { class: 'sub' }, p.sku), p.trackBatches ? el('div', { class: 'batch-row' }, batchInput(l, 'batchNumber', 'Batch no.', 'text', p.name), batchInput(l, 'expiry', 'Expiry', 'date', p.name)) : null), el('td', { class: 'num' }, q), el('td', { class: 'num' }, c), el('td', { class: 'num' }, formatMMK(t.lines[i].lineTotal)), el('td', null, el('button', { class: 'btn sm', type: 'button', 'aria-label': 'Remove ' + p.name, onclick: () => { lines.splice(i, 1); draw(); } }, '✕'))); })))) : el('div', { class: 'empty' }, el('strong', null, 'No products yet'), 'Search above to add what you bought.'));
      totalsEl.append(el('ul', { class: 'list' }, el('li', null, el('span', null, 'Products subtotal'), el('span', null, formatMMK(t.subtotal))), el('li', null, el('span', null, 'Additional costs (transport, etc.)'), el('span', null, '+' + formatMMK(t.additional))), el('li', null, el('span', null, 'Discount'), el('span', null, '−' + formatMMK(t.discount))), el('li', null, el('strong', null, 'Total'), el('strong', null, formatMMK(t.total)))),
        el('p', { class: 'muted small' }, 'Additional costs and discount are spread over the products, so each item’s stock cost includes its share.'));
    }
    [addl, disc].forEach((n) => n.addEventListener('input', SS.utils.debounce(draw, 250)));
    draw();
    const m = SS.utils.openModal({ title: cur ? 'Edit ' + cur.number : 'New purchase', body: el('div', null, el('div', { class: 'form-grid' }, ui.field('Supplier', 'poSup', sup), ui.field('Purchase date', 'poDate', date)), ui.field('Add product', 'poPick', pick), dl, body, el('div', { class: 'form-grid', style: 'margin-top:12px' }, ui.field('Additional costs (MMK)', 'poAddl', addl), ui.field('Discount (MMK)', 'poDisc', disc)), totalsEl, ui.field('Notes', 'poNotes', notes)),
      actions: [{ label: SS.i18n.t('cancel') },
        { label: 'Save draft', onClick: () => { try { saveDraft(current(), id); SS.utils.toast('Draft saved.', 'success'); if (onDone) onDone(); } catch (e) { SS.utils.toast(e.message, 'error'); return false; } } },
        { label: 'Save & confirm…', kind: 'primary', onClick: () => { try { const rec = saveDraft(current(), id); setTimeout(() => openConfirm(rec.id, onDone), 0); if (onDone) onDone(); } catch (e) { SS.utils.toast(e.message, 'error'); return false; } } }] });
    m.classList.add('wide');
  }

  function openConfirm(id, onDone) {
    const p = byId(id); if (!p || p.status !== 'draft') return;
    const paid = el('input', { class: 'input', id: 'cfPaid', type: 'number', min: '0', max: String(p.total), step: '1', value: p.total }); const method = ui.select('cfMethod', SS.sales.METHODS.map((m) => [m[0], m[1]]), p.method || 'cash');
    const note = el('p', { class: 'muted small' }); const upd = () => { const b = Math.max(0, p.total - toInt(paid.value)); note.textContent = b > 0 ? `${formatMMK(b)} will be added to what you owe ${p.supplierName}.` : 'Paid in full.'; }; paid.addEventListener('input', upd); upd();
    SS.utils.openModal({ title: 'Confirm ' + p.number, body: el('div', null, el('p', null, 'Confirming adds the stock to your inventory and cannot be done twice.'), el('p', null, el('strong', null, 'Total ' + formatMMK(p.total))), ui.field('Amount paid now (MMK)', 'cfPaid', paid), ui.field('Payment method', 'cfMethod', method), note),
      actions: [{ label: 'Back' }, { label: 'Confirm purchase', kind: 'primary', onClick: () => { try { confirm(id, { paid: paid.value, method: method.value }); SS.utils.toast('Purchase confirmed. Stock updated.', 'success'); if (onDone) onDone(); } catch (e) { SS.utils.toast(e.message, 'error'); return false; } } }] });
  }

  function invoiceNode(p) {
    const s = SS.settings.get(); const kv = (a, b, c) => el('div', { class: 'r-row ' + (c || '') }, el('span', null, a), el('span', null, b));
    return el('div', { class: 'receipt a4' }, s.shopLogo ? el('img', { class: 'r-logo', src: s.shopLogo, alt: '' }) : null, el('div', { class: 'r-shop' }, s.shopName), s.shopAddress ? el('div', { class: 'r-center' }, s.shopAddress) : null,
      el('div', { class: 'r-title' }, 'PURCHASE INVOICE / ဝယ်ယူမှုစာရင်း'), kv('No.', p.number), kv('Date', p.date), kv('Supplier', p.supplierName), kv('Status', statusOf(p)[0]),
      el('table', { class: 'r-table' }, el('thead', null, el('tr', null, el('th', null, 'Item'), el('th', { class: 'num' }, 'Qty'), el('th', { class: 'num' }, 'Unit cost'), el('th', { class: 'num' }, 'Amount'))),
        el('tbody', null, p.lines.map((l) => el('tr', null, el('td', { class: 'r-name' }, l.productName), el('td', { class: 'num' }, formatQty(l.qty)), el('td', { class: 'num' }, SS.utils.formatNumber(l.unitCost)), el('td', { class: 'num' }, SS.utils.formatNumber(l.lineTotal)))))),
      el('hr'), kv('Subtotal', formatMMK(p.subtotal)), p.additionalCosts ? kv('Additional costs', '+' + formatMMK(p.additionalCosts)) : null, p.discount ? kv('Discount', '−' + formatMMK(p.discount)) : null,
      kv('Total', formatMMK(p.total), 'r-total'), kv('Paid', formatMMK(p.paid)), p.balance > 0 && p.status === 'confirmed' ? kv('Balance owed', formatMMK(p.balance), 'r-total') : null, p.notes ? el('div', { class: 'r-foot' }, 'Notes: ' + p.notes) : null);
  }
  const printInvoice = (p) => SS.utils.printDocument({ title: 'Invoice ' + p.number, size: 'a4', sizes: [['a4', 'A4 invoice']], render: () => invoiceNode(p) });

  function openDetails(id, onChange) {
    const p = byId(id); if (!p) return;
    const pays = SS.storage.read('payments').filter((x) => x.purchaseId === id).slice().reverse(); const row = (a, b) => el('li', null, el('span', { class: 'muted' }, a), el('span', null, b)); const [label, kind] = statusOf(p);
    SS.utils.openModal({ title: p.number, body: el('div', { class: 'wide' }, el('div', { style: 'margin-bottom:8px' }, ui.badge(label, kind)), el('ul', { class: 'list' }, row('Supplier', p.supplierName), row('Date', p.date), p.notes ? row('Notes', p.notes) : null),
      el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, ['Item', 'Qty', 'Unit cost', 'Stock cost*', 'Total'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))),
        el('tbody', null, p.lines.map((l) => el('tr', null, el('td', null, l.productName), el('td', { class: 'num' }, formatQty(l.qty)), el('td', { class: 'num' }, formatMMK(l.unitCost)), el('td', { class: 'num' }, l.landedUnitCost != null ? formatMMK(l.landedUnitCost) : '—'), el('td', { class: 'num' }, formatMMK(l.lineTotal))))))),
      el('p', { class: 'muted small' }, '*Stock cost = unit cost plus the item’s share of additional costs, minus discount.'),
      el('ul', { class: 'list' }, row('Subtotal', formatMMK(p.subtotal)), row('Additional costs', formatMMK(p.additionalCosts || 0)), row('Discount', '−' + formatMMK(p.discount || 0)), row('Total', formatMMK(p.total)), row('Paid', formatMMK(p.paid)), row('Balance owed', formatMMK(p.balance))),
      pays.length ? el('div', null, el('h2', { class: 'small', style: 'margin:10px 0 4px' }, 'Payments'), el('ul', { class: 'list' }, pays.map((x) => el('li', null, el('span', null, formatDate(x.createdAt, true) + ' · ' + SS.sales.methodLabel(x.method)), el('span', null, formatMMK(x.amount)))))) : null),
      actions: [{ label: 'Close' }, { label: 'Print invoice', onClick: () => { setTimeout(() => printInvoice(p), 0); } }].concat(p.status === 'confirmed' && p.balance > 0 ? [{ label: 'Pay supplier', kind: 'primary', onClick: () => { setTimeout(() => SS.payments.openDialog({ kind: 'supplier', id: p.supplierId, onDone: onChange }), 0); } }] : []) });
  }

  function page(root) {
    const st = { search: '', status: '', supplier: '' }; const holder = el('div', { class: 'card' }); const banner = el('div');
    function drawBanner() {
      clear(banner); const open = SS.privacy.canViewCost();
      banner.append(el('div', { class: 'notice' }, open ? 'Unit costs are visible. They hide again when you leave this page.' : 'Unit costs are hidden. Totals and balances are shown below; open or create a purchase with the administrator PIN.', ' ',
        open ? el('button', { class: 'btn sm', type: 'button', onclick: () => { SS.privacy.lock(); drawBanner(); } }, 'Hide costs') : el('button', { class: 'btn sm', type: 'button', onclick: () => SS.privacy.requestUnlock().then(drawBanner) }, 'Unlock (admin PIN)')));
    }
    function draw() {
      const q = st.search.toLowerCase();
      const rows = SS.storage.read('purchases').filter((p) => (!st.status || statusOf(p)[0] === st.status) && (!st.supplier || p.supplierId === st.supplier) && (!q || (p.number + ' ' + p.supplierName).toLowerCase().includes(q))).slice().reverse();
      const t = ui.dataTable({ rows, pageSize: 15, empty: { title: 'No purchases yet', hint: 'Record what you buy from suppliers. Confirmed purchases add stock.' }, columns: [
        { key: 'number', label: 'No.', render: (p) => el('button', { class: 'link-btn', type: 'button', onclick: () => unlockThen(() => (p.status === 'draft' ? openEditor(p.id, refresh) : openDetails(p.id, refresh))) }, p.number) },
        { key: 'date', label: 'Date' }, { key: 'supplierName', label: 'Supplier' },
        { key: 'total', label: 'Total', num: true, render: (p) => formatMMK(p.total) }, { key: 'paid', label: 'Paid', num: true, render: (p) => (p.status === 'confirmed' ? formatMMK(p.paid) : '—') },
        { key: 'balance', label: 'Owed', num: true, render: (p) => (p.status === 'confirmed' && p.balance > 0 ? formatMMK(p.balance) : '—') },
        { key: 'status', label: 'Status', sortValue: (p) => statusOf(p)[0], render: (p) => ui.badge(statusOf(p)[0], statusOf(p)[1]) },
        { key: 'act', label: '', sortable: false, render: (p) => el('div', { class: 'row-actions' },
          p.status === 'draft' ? el('button', { class: 'btn sm', type: 'button', onclick: () => unlockThen(() => openConfirm(p.id, refresh)) }, 'Confirm') : null,
          p.status === 'draft' ? el('button', { class: 'btn sm', type: 'button', onclick: async () => { if (await SS.utils.confirmDialog('Cancel draft?', p.number + ' will be marked cancelled. No stock is changed.', 'Cancel draft', true)) { try { cancelDraft(p.id, 'Cancelled by user'); refresh(); } catch (e) { SS.utils.toast(e.message, 'error'); } } } }, 'Cancel') : null,
          p.status === 'confirmed' && p.balance > 0 ? el('button', { class: 'btn sm', type: 'button', onclick: () => SS.payments.openDialog({ kind: 'supplier', id: p.supplierId, onDone: refresh }) }, 'Pay') : null,
          p.status === 'confirmed' ? el('button', { class: 'btn sm', type: 'button', onclick: () => unlockThen(() => printInvoice(p)) }, 'Invoice') : null) }] });
      clear(holder); holder.append(t.node);
    }
    const refresh = () => { drawBanner(); draw(); };
    const search = el('input', { class: 'input grow', type: 'search', placeholder: 'Search number or supplier…', 'aria-label': 'Search purchases' }); search.addEventListener('input', SS.utils.debounce(() => { st.search = search.value; draw(); }, 150));
    const status = ui.select('poStatus', [['', 'All statuses'], ['Draft', 'Draft'], ['Unpaid balance', 'Unpaid balance'], ['Paid', 'Paid'], ['Cancelled', 'Cancelled']], ''); status.addEventListener('change', () => { st.status = status.value; draw(); });
    const sup = ui.select('poSupF', [['', 'All suppliers']].concat(SS.suppliers.all().map((s) => [s.id, s.name])), ''); sup.addEventListener('change', () => { st.supplier = sup.value; draw(); });
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('purchases')), el('p', null, 'Stock you buy from suppliers. Expenses like rent are recorded separately.')), el('button', { class: 'btn primary', type: 'button', onclick: () => unlockThen(() => openEditor(null, refresh)) }, '+ New purchase')),
      banner, el('div', { class: 'toolbar' }, search, status, sup), holder);
    refresh();
  }

  SS.purchases = { totals, validate, saveDraft, cancelDraft, confirm, recover, openEditor, openConfirm, openDetails, printInvoice };
  SS.pages = SS.pages || {}; SS.pages.purchases = page;
})();
