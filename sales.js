/* SmartStock — sales.js
 * Central transaction service (SS.sales): pricing, validation, completion, refunds, cancellations,
 * recovery of interrupted sales, receipt rendering, and the Sales History page.
 *
 * Money rules
 *  - All amounts are integer MMK.
 *  - Net sales revenue = sale total − tax. Tax is collected for the government and is not revenue.
 *  - Every sale line keeps a cost snapshot (weighted-average cost at the time of sale); later cost
 *    changes never rewrite historical profit. Cost snapshots are never shown in any sales UI or receipt.
 *  - Refunds reduce revenue and cost of goods sold of the ORIGINAL sale (not the refund date).
 *  - Completed sales are never deleted. They can only be refunded or cancelled.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatQty, toInt, qty, formatDate, dayKey } = SS.utils;
  const ui = SS.ui;

  const METHODS = [['cash', 'Cash', 'ငွေသား'], ['kbzpay', 'KBZPay', 'KBZPay'], ['wavepay', 'WavePay', 'WavePay'], ['ayapay', 'AYA Pay', 'AYA Pay'], ['bank', 'Bank Transfer', 'ဘဏ်လွှဲ'], ['other', 'Other', 'အခြား']];
  const methodLabel = (id) => (METHODS.find((m) => m[0] === id) || [0, id || '—'])[1];
  const methodReceipt = (id) => { const m = METHODS.find((x) => x[0] === id); return m ? (m[2] === m[1] ? m[1] : m[2] + ' / ' + m[1]) : String(id || '—'); };
  const SALE_KEYS = ['sales', 'products', 'stockMovements', 'payments', 'customers', 'meta'];

  /* ---------- Pricing (pure: no writes) ---------- */
  function discountOf(type, value, base) {
    value = Number(value) || 0; if (value <= 0 || base <= 0) return 0;
    const d = type === 'pct' ? Math.round(base * Math.min(value, 100) / 100) : toInt(value);
    return Math.min(Math.max(d, 0), base);
  }
  function discountProblem(type, value, base) {
    value = Number(value) || 0;
    if (value < 0) return 'Discount cannot be negative.';
    if (type === 'pct' && value > 100) return 'Discount percentage must be between 0 and 100.';
    if (type !== 'pct' && toInt(value) > base) return 'Discount is larger than the amount it applies to.';
    return '';
  }

  /** draft: {lines:[{productId, qty, discountType, discountValue}], discountType, discountValue} */
  function price(draft) {
    const settings = SS.settings.get();
    const products = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p]));
    const seen = new Set();
    const lines = (draft.lines || []).map((l) => {
      const p = products[l.productId]; const q = qty(l.qty);
      const out = { productId: l.productId, qty: q, discountType: l.discountType === 'pct' ? 'pct' : 'amt', discountValue: Number(l.discountValue) || 0, error: '' };
      if (!p) { out.error = 'Product no longer exists.'; out.productName = '(missing product)'; out.unitPrice = 0; out.gross = 0; out.discountAmount = 0; out.lineTotal = 0; return out; }
      Object.assign(out, { productName: p.name, sku: p.sku, unit: SS.inventory.unitOf(p), unitKind: p.unit, unitPrice: toInt(p.sellingPrice), stock: SS.inventory.sellable(p) });
      out.gross = Math.round(out.unitPrice * q);
      out.discountAmount = discountOf(out.discountType, out.discountValue, out.gross);
      out.lineTotal = out.gross - out.discountAmount;
      if (p.status === 'archived') out.error = 'This product is archived and cannot be sold.';
      else if (seen.has(p.id)) out.error = 'This product appears twice in the cart.';
      else if (!(q > 0)) out.error = 'Quantity must be greater than 0.';
      else if (SS.inventory.isWholeUnit(p.unit) && !Number.isInteger(q)) out.error = 'This item is sold in whole numbers.';
      else if (q > out.stock) out.error = `Insufficient stock: only ${formatQty(out.stock)} available.`;
      else out.error = discountProblem(out.discountType, out.discountValue, out.gross);
      seen.add(l.productId);
      return out;
    });
    const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
    const txnType = draft.discountType === 'pct' ? 'pct' : 'amt';
    const discountAmount = discountOf(txnType, draft.discountValue, subtotal);
    // allocate the transaction discount across lines (last line takes the rounding remainder)
    let left = discountAmount;
    lines.forEach((l, i) => {
      const share = i === lines.length - 1 ? left : Math.min(left, subtotal ? Math.round(discountAmount * l.lineTotal / subtotal) : 0);
      l.txnDiscountShare = share; left -= share; l.lineNet = l.lineTotal - share;
    });
    const taxable = subtotal - discountAmount;
    const taxRate = settings.taxEnabled ? Number(settings.taxRate) || 0 : 0;
    const taxAmount = Math.round(taxable * taxRate / 100);
    const gross = lines.reduce((a, l) => a + l.gross, 0);
    const allDiscounts = lines.reduce((a, l) => a + l.discountAmount, 0) + discountAmount;
    return { lines, subtotal, discountType: txnType, discountValue: Number(draft.discountValue) || 0, discountAmount, discountError: discountProblem(txnType, draft.discountValue, subtotal), taxRate, taxAmount, total: taxable + taxAmount,
      discountPct: gross ? Math.round(allDiscounts * 1000 / gross) / 10 : 0, valid: lines.length > 0 && lines.every((l) => !l.error) };
  }

  /** Product names whose discounted price is below their cost. Names only; no cost values leave this function. */
  function belowCost(priced) {
    const products = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p]));
    return priced.lines.filter((l) => { const p = products[l.productId]; const c = p ? (p.avgCost != null ? p.avgCost : (p.purchasePrice || 0)) : 0; return p && l.qty > 0 && l.lineNet < Math.round(c * l.qty); }).map((l) => l.productName);
  }

  /* ---------- Atomic multi-key writes with rollback ---------- */
  function snapshot() { return SS.storage.snapshot(SALE_KEYS); }
  function rollback(s) { SS.storage.restore(s); }
  const costOf = (p) => (p.avgCost != null ? p.avgCost : (p.purchasePrice || 0));

  /* ---------- Completion ---------- */
  function complete(draft, opts) {
    opts = opts || {};
    if (opts.token) { const dup = SS.storage.read('sales').find((s) => s.clientToken === opts.token); if (dup) return { sale: dup, duplicate: true }; }   // duplicate-submission protection
    const settings = SS.settings.get(); const pr = price(draft);
    if (!pr.lines.length) throw new Error('The cart is empty.');
    const bad = pr.lines.filter((l) => l.error); if (bad.length) throw new Error(bad.map((l) => `${l.productName}: ${l.error}`).join(' '));
    if (pr.discountError) throw new Error(pr.discountError);
    if (pr.total <= 0) throw new Error('The total must be more than 0 MMK.');
    const method = opts.method || settings.defaultPayment || 'cash';
    if (!METHODS.some((m) => m[0] === method)) throw new Error('Choose a valid payment method.');
    const received = toInt(opts.received);
    if (received < 0) throw new Error('Amount received cannot be negative.');
    if (method !== 'cash' && received > pr.total) throw new Error('For non-cash payments the amount received cannot be more than the total.');
    const paid = Math.min(received, pr.total); const change = method === 'cash' ? Math.max(0, received - pr.total) : 0; const balance = pr.total - paid;
    const customer = opts.customerId ? SS.storage.collection.byId('customers', opts.customerId) : null;
    if (opts.customerId && !customer) throw new Error('The selected customer no longer exists.');
    if (balance > 0) {
      if (!settings.allowPartialPayments) throw new Error('Partial payment is turned off. Collect the full amount, or allow partial payments in Settings.');
      if (!customer) throw new Error('Choose a customer to record an unpaid balance. Walk-in sales must be paid in full.');
    }
    const products = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p]));
    const snap = snapshot();
    try {
      const number = 'INV-' + String(SS.storage.counter('sale')).padStart(6, '0');
      const lines = pr.lines.map((l) => ({ productId: l.productId, productName: l.productName, sku: l.sku, unit: l.unit, qty: l.qty, unitPrice: l.unitPrice, gross: l.gross, discountType: l.discountType, discountValue: l.discountValue,
        discountAmount: l.discountAmount, lineTotal: l.lineTotal, txnDiscountShare: l.txnDiscountShare, lineNet: l.lineNet, costSnapshot: costOf(products[l.productId]), refundedQty: 0 }));
      let sale = SS.storage.collection.insert('sales', { number, status: 'pending', clientToken: opts.token || '', customerId: customer ? customer.id : '', customerName: customer ? customer.name : 'Walk-in',
        lines, subtotal: pr.subtotal, discountType: pr.discountType, discountValue: pr.discountValue, discountAmount: pr.discountAmount, taxRate: pr.taxRate, taxAmount: pr.taxAmount, total: pr.total,
        paid, balance, method, received, change, discountPct: pr.discountPct, payments: [], refunds: [], refundedTotal: 0, note: String(opts.note || '').trim() }, 'sal');
      lines.forEach((l) => SS.inventory.adjust({ productId: l.productId, type: 'sale', quantity: l.qty, reason: 'Sale ' + number, relatedId: sale.id, noAudit: true }));
      if (paid > 0) SS.storage.collection.insert('payments', { kind: 'sale_payment', direction: 'in', saleId: sale.id, customerId: customer ? customer.id : '', method, amount: paid }, 'pay');
      if (customer) SS.storage.collection.update('customers', customer.id, { outstandingBalance: toInt(customer.outstandingBalance) + balance, totalPurchases: toInt(customer.totalPurchases) + pr.total, lastSaleApplied: sale.id });
      sale = SS.storage.collection.update('sales', sale.id, { status: 'completed', payments: paid > 0 ? [{ method, amount: paid, received, change }] : [] });
      SS.audit.record('sale.completed', { type: 'sale', id: sale.id, label: number }, null, { total: sale.total, items: lines.length, method, balance });
      return { sale, duplicate: false };
    } catch (e) { rollback(snap); throw e; }
  }

  /** Rolls back sales left in 'pending' (browser closed or crashed mid-sale). Safe to run repeatedly. */
  function recover() {
    let n = 0;
    SS.storage.read('sales').filter((s) => s.status === 'pending').forEach((s) => {
      try {
        const net = {};
        SS.storage.read('stockMovements').filter((m) => m.relatedId === s.id).forEach((m) => { net[m.productId] = qty((net[m.productId] || 0) + m.quantity); });
        Object.entries(net).forEach(([pid, q]) => { if (q < 0) SS.inventory.adjust({ productId: pid, type: 'customer_return', quantity: -q, reason: 'Rollback of interrupted sale ' + s.number, relatedId: s.id, noAudit: true }); });
        const pays = SS.storage.read('payments'); if (pays.some((p) => p.saleId === s.id)) SS.storage.write('payments', pays.filter((p) => p.saleId !== s.id));
        const c = s.customerId && SS.storage.collection.byId('customers', s.customerId);
        if (c && c.lastSaleApplied === s.id) SS.storage.collection.update('customers', c.id, { outstandingBalance: toInt(c.outstandingBalance) - s.balance, totalPurchases: toInt(c.totalPurchases) - s.total, lastSaleApplied: '' });
        SS.storage.collection.update('sales', s.id, { status: 'failed', failReason: 'Interrupted before completion; stock and balances were rolled back.' });
        SS.audit.record('sale.rolled_back', { type: 'sale', id: s.id, label: s.number }); n++;
      } catch (e) { console.error('[SmartStock] could not recover sale ' + s.number, e); }
    });
    return n;
  }

  /* ---------- Refunds and cancellations ---------- */
  /** items: [{index, qty}]. Returns the amounts without writing anything. */
  function refundQuote(sale, items) {
    const lines = sale.lines.map((l) => Object.assign({}, l)); let net = 0; const picked = [];
    items.forEach((i) => {
      const q = qty(i.qty); if (!(q > 0)) return;
      const l = lines[i.index]; if (!l) throw new Error('Unknown sale line.');
      const left = qty(l.qty - (l.refundedQty || 0));
      if (q > left) throw new Error(`Cannot refund ${formatQty(q)} of ${l.productName}; only ${formatQty(left)} left to refund.`);
      if (SS.inventory.isWholeUnit((SS.storage.collection.byId('products', l.productId) || {}).unit) && !Number.isInteger(q)) throw new Error(l.productName + ' is refunded in whole numbers.');
      l.refundedQty = qty((l.refundedQty || 0) + q); net += Math.round(l.lineNet * q / l.qty); picked.push({ index: i.index, productId: l.productId, productName: l.productName, qty: q });
    });
    if (!picked.length) throw new Error('Select at least one item to refund.');
    const saleNet = sale.total - sale.taxAmount; const prevNet = (sale.refunds || []).reduce((a, r) => a + r.net, 0); const prevTax = (sale.refunds || []).reduce((a, r) => a + r.tax, 0);
    const full = lines.every((l) => qty(l.qty - (l.refundedQty || 0)) === 0);
    if (full) net = saleNet - prevNet;
    net = Math.max(0, Math.min(net, saleNet - prevNet));
    const tax = full ? sale.taxAmount - prevTax : Math.min(Math.round(net * sale.taxRate / 100), sale.taxAmount - prevTax);
    const amount = net + tax; const balanceReduction = Math.min(amount, sale.balance); const cashOut = amount - balanceReduction;
    return { lines, picked, full, net, tax, amount, balanceReduction, cashOut };
  }

  function applyRefund(saleId, items, opts, mode) {
    opts = opts || {};
    const sale = SS.storage.collection.byId('sales', saleId);
    if (!sale || sale.status !== 'completed') throw new Error('Only completed sales can be refunded or cancelled.');
    const reason = String(opts.reason || '').trim(); if (!reason) throw new Error('A reason is required.');
    if (mode === 'cancel') {
      if ((sale.refunds || []).length) throw new Error('This sale already has refunds. Refund the remaining items instead of cancelling.');
      items = sale.lines.map((l, index) => ({ index, qty: l.qty }));
    }
    const method = opts.method || 'cash'; if (!METHODS.some((m) => m[0] === method)) throw new Error('Choose a valid refund method.');
    const q = refundQuote(sale, items); const snap = snapshot();
    try {
      q.picked.forEach((p) => SS.inventory.adjust({ productId: p.productId, type: 'customer_return', quantity: p.qty, reason: (mode === 'cancel' ? 'Cancelled ' : 'Refund ') + sale.number, relatedId: sale.id, noAudit: true }));
      if (q.cashOut > 0) SS.storage.collection.insert('payments', { kind: 'sale_refund', direction: 'out', saleId: sale.id, customerId: sale.customerId || '', method, amount: q.cashOut }, 'pay');
      const c = sale.customerId && SS.storage.collection.byId('customers', sale.customerId);
      if (c) SS.storage.collection.update('customers', c.id, { outstandingBalance: toInt(c.outstandingBalance) - q.balanceReduction, totalPurchases: Math.max(0, toInt(c.totalPurchases) - q.amount) });
      const refund = { id: SS.storage.uid('ref'), at: Date.now(), type: mode, items: q.picked, net: q.net, tax: q.tax, amount: q.amount, balanceReduction: q.balanceReduction, cashOut: q.cashOut, method, reason };
      const patch = { lines: q.lines, refunds: (sale.refunds || []).concat([refund]), refundedTotal: (sale.refundedTotal || 0) + q.amount, balance: sale.balance - q.balanceReduction };
      if (mode === 'cancel') Object.assign(patch, { status: 'cancelled', cancelReason: reason, cancelledAt: Date.now() });
      const next = SS.storage.collection.update('sales', sale.id, patch);
      SS.audit.record(mode === 'cancel' ? 'sale.cancelled' : 'sale.refunded', { type: 'sale', id: sale.id, label: sale.number }, { refundedTotal: sale.refundedTotal || 0 }, { amount: q.amount, cashOut: q.cashOut, reason });
      return { sale: next, refund };
    } catch (e) { rollback(snap); throw e; }
  }
  const refund = (id, items, opts) => applyRefund(id, items, opts, 'refund');
  const cancel = (id, opts) => applyRefund(id, [], opts, 'cancel');

  /* ---------- Figures used by dashboard and reports ---------- */
  function net(s) {
    if (s.status !== 'completed') return { revenue: 0, cogs: 0, cashIn: 0, refunded: 0 };
    const refunds = s.refunds || [];
    const revenue = (s.total - s.taxAmount) - refunds.reduce((a, r) => a + r.net, 0);
    const cogs = Math.round(s.lines.reduce((a, l) => a + (l.costSnapshot || 0) * (l.qty - (l.refundedQty || 0)), 0));
    const cashIn = (s.payments || []).filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0) - refunds.filter((r) => r.method === 'cash').reduce((a, r) => a + r.cashOut, 0);
    return { revenue, cogs, cashIn, refunded: s.refundedTotal || 0 };
  }
  /** Sale as the UI may see it: cost snapshots removed from lines. */
  function view(s) { return Object.assign({}, s, { lines: s.lines.map((l) => { const c = Object.assign({}, l); delete c.costSnapshot; return c; }) }); }
  const statusOf = (s) => {
    if (s.status === 'cancelled') return ['Cancelled', 'danger']; if (s.status === 'failed') return ['Rolled back', 'warning']; if (s.status === 'pending') return ['Pending', 'info'];
    if ((s.refundedTotal || 0) > 0) return s.lines.every((l) => qty(l.qty - (l.refundedQty || 0)) === 0) ? ['Refunded', 'danger'] : ['Partly refunded', 'info'];
    return s.balance > 0 ? ['Unpaid balance', 'warning'] : ['Completed', 'success'];
  };

  /* ---------- Receipts ---------- */
  const R = {
    my: { receipt: 'ဘောက်ချာ', no: 'ဘောက်ချာအမှတ်', date: 'ရက်စွဲ', customer: 'ဖောက်သည်', item: 'ကုန်ပစ္စည်း', qty: 'အရေအတွက်', price: 'ဈေးနှုန်း', amount: 'ငွေပမာဏ', subtotal: 'စုစုပေါင်း', discount: 'လျှော့ဈေး', tax: 'အခွန်', total: 'ကျသင့်ငွေ', method: 'ပေးချေမှု', received: 'လက်ခံရရှိငွေ', change: 'ပြန်အမ်းငွေ', balance: 'ကျန်ငွေ', copy: 'မိတ္တူ (ပြန်ထုတ်)', refunded: 'ပြန်အမ်းပြီး', walkin: 'ဆိုင်ဝင်ဝယ်သူ' },
    en: { receipt: 'Receipt', no: 'Receipt no.', date: 'Date', customer: 'Customer', item: 'Item', qty: 'Qty', price: 'Price', amount: 'Amount', subtotal: 'Subtotal', discount: 'Discount', tax: 'Tax', total: 'Total', method: 'Payment', received: 'Received', change: 'Change', balance: 'Balance due', copy: 'COPY (reprint)', refunded: 'Refunded', walkin: 'Walk-in' }
  };
  function receiptNode(sale, size, isCopy) {
    const s = SS.settings.get(); const t = R[SS.i18n.getLang()] || R.my; const kv = (k, v, cls) => el('div', { class: 'r-row ' + (cls || '') }, el('span', null, k), el('span', null, v));
    const rows = sale.lines.map((l) => {
      const r = [el('tr', null, el('td', { class: 'r-name' }, l.productName), el('td', { class: 'num' }, formatQty(l.qty)), el('td', { class: 'num' }, formatNumber(l.unitPrice)), el('td', { class: 'num' }, formatNumber(l.gross)))];
      if (l.discountAmount > 0) r.push(el('tr', { class: 'r-sub' }, el('td', { colspan: '3' }, t.discount + (l.discountType === 'pct' ? ` (${l.discountValue}%)` : '')), el('td', { class: 'num' }, '-' + formatNumber(l.discountAmount))));
      return r;
    });
    return el('div', { class: 'receipt ' + (size === 'a4' ? 'a4' : size === '58' ? 'w58' : 'w80') },
      s.shopLogo ? el('img', { class: 'r-logo', src: s.shopLogo, alt: '' }) : null,
      el('div', { class: 'r-shop' }, s.shopName), s.shopAddress ? el('div', { class: 'r-center' }, s.shopAddress) : null, s.shopPhone ? el('div', { class: 'r-center' }, s.shopPhone) : null,
      el('div', { class: 'r-title' }, t.receipt), isCopy ? el('div', { class: 'r-center r-copy' }, t.copy) : null,
      kv(t.no, sale.number), kv(t.date, formatDate(sale.createdAt, true)), kv(t.customer, sale.customerId ? sale.customerName : t.walkin),
      el('table', { class: 'r-table' }, el('thead', null, el('tr', null, el('th', null, t.item), el('th', { class: 'num' }, t.qty), el('th', { class: 'num' }, t.price), el('th', { class: 'num' }, t.amount))), el('tbody', null, rows)),
      el('hr'), kv(t.subtotal, formatNumber(sale.subtotal)),
      sale.discountAmount > 0 ? kv(t.discount + (sale.discountType === 'pct' ? ` (${sale.discountValue}%)` : ''), '-' + formatNumber(sale.discountAmount)) : null,
      sale.taxAmount > 0 ? kv(t.tax + ` (${sale.taxRate}%)`, formatNumber(sale.taxAmount)) : null,
      kv(t.total, formatMMK(sale.total), 'r-total'), kv(t.method, methodReceipt(sale.method)),
      sale.paid > 0 ? kv(t.received, formatMMK(sale.received)) : null, sale.change > 0 ? kv(t.change, formatMMK(sale.change)) : null,
      sale.balance > 0 ? kv(t.balance, formatMMK(sale.balance), 'r-total') : null,
      (sale.refundedTotal || 0) > 0 ? kv(t.refunded, '-' + formatMMK(sale.refundedTotal)) : null,
      s.receiptFooter ? el('div', { class: 'r-center r-foot' }, s.receiptFooter) : null);
  }
  function formatNumber(n) { return SS.utils.formatNumber(n); }

  function printReceipt(sale, isCopy) {
    SS.utils.printDocument({ title: 'Receipt ' + sale.number, size: SS.settings.get().receiptSize || '80', sizes: [['58', '58 mm thermal'], ['80', '80 mm thermal'], ['a4', 'A4 invoice']],
      render: (size) => receiptNode(sale, size, isCopy), onSize: (size) => SS.settings.patch({ receiptSize: size }) });
  }

  /* ---------- History page ---------- */
  function openRefundDialog(sale, onDone) {
    const inputs = sale.lines.map((l, i) => { const left = qty(l.qty - (l.refundedQty || 0)); return { l, i, left, inp: el('input', { class: 'input', type: 'number', min: '0', max: String(left), step: SS.inventory.isWholeUnit((SS.storage.collection.byId('products', l.productId) || {}).unit) ? '1' : 'any', value: '0', style: 'width:110px;text-align:right', 'aria-label': 'Refund quantity for ' + l.productName, disabled: left <= 0 }) }; });
    const reason = el('input', { class: 'input', id: 'rfReason', placeholder: 'e.g. damaged item, wrong product' }); const method = ui.select('rfMethod', METHODS.map((m) => [m[0], m[1]]), 'cash'); const preview = el('p', { class: 'muted small' });
    const items = () => inputs.map((x) => ({ index: x.i, qty: x.inp.value }));
    const upd = () => { try { const q = refundQuote(SS.storage.collection.byId('sales', sale.id), items()); preview.textContent = `Refund ${formatMMK(q.amount)}` + (q.balanceReduction ? ` — ${formatMMK(q.balanceReduction)} reduces the customer’s unpaid balance, ${formatMMK(q.cashOut)} is paid back.` : ' paid back to the customer.'); } catch (e) { preview.textContent = e.message; } };
    inputs.forEach((x) => x.inp.addEventListener('input', upd)); upd();
    SS.utils.openModal({ title: 'Refund ' + sale.number, body: el('div', null, el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, el('th', null, 'Item'), el('th', { class: 'num' }, 'Sold'), el('th', { class: 'num' }, 'Refundable'), el('th', { class: 'num' }, 'Refund qty'))),
      el('tbody', null, inputs.map((x) => el('tr', null, el('td', null, x.l.productName), el('td', { class: 'num' }, formatQty(x.l.qty)), el('td', { class: 'num' }, formatQty(x.left)), el('td', { class: 'num' }, x.inp)))))), preview, ui.field('Reason', 'rfReason', reason), ui.field('Pay refund by', 'rfMethod', method)),
      actions: [{ label: SS.i18n.t('cancel') }, { label: 'Record refund', kind: 'danger', onClick: () => { try { const r = refund(sale.id, items(), { reason: reason.value, method: method.value }); SS.utils.toast('Refund recorded: ' + formatMMK(r.refund.amount), 'success'); onDone(); } catch (e) { SS.utils.toast(e.message, 'error'); return false; } } }] });
  }

  async function openCancelDialog(sale, onDone) {
    const reason = el('input', { class: 'input', id: 'cxReason' }); const method = ui.select('cxMethod', METHODS.map((m) => [m[0], m[1]]), 'cash');
    SS.utils.openModal({ title: 'Cancel ' + sale.number + '?', body: el('div', null, el('p', null, 'All items go back into stock and the full amount is returned. The sale stays in the history marked as cancelled.'), ui.field('Reason', 'cxReason', reason), ui.field('Return money by', 'cxMethod', method)),
      actions: [{ label: 'Keep sale' }, { label: 'Cancel sale', kind: 'danger', onClick: () => { try { cancel(sale.id, { reason: reason.value, method: method.value }); SS.utils.toast('Sale cancelled.', 'success'); onDone(); } catch (e) { SS.utils.toast(e.message, 'error'); return false; } } }] });
  }

  function openDetails(id, onChange) {
    const sale = SS.storage.collection.byId('sales', id); if (!sale) return; const v = view(sale); const [label, kind] = statusOf(sale);
    const row = (a, b) => el('li', null, el('span', { class: 'muted' }, a), el('span', null, b));
    const canAct = sale.status === 'completed' && sale.lines.some((l) => qty(l.qty - (l.refundedQty || 0)) > 0);
    SS.utils.openModal({ title: sale.number, body: el('div', { class: 'wide' }, el('div', { style: 'margin-bottom:8px' }, ui.badge(label, kind)),
      el('ul', { class: 'list' }, row('Date', formatDate(sale.createdAt, true)), row('Customer', sale.customerId ? sale.customerName : 'Walk-in'), row('Payment', methodLabel(sale.method)), sale.note ? row('Note', sale.note) : null),
      el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, ['Item', 'Qty', 'Price', 'Discount', 'Total'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))),
        el('tbody', null, v.lines.map((l) => el('tr', null, el('td', null, l.productName, l.refundedQty ? el('span', { class: 'sub' }, formatQty(l.refundedQty) + ' refunded') : null), el('td', { class: 'num' }, formatQty(l.qty)), el('td', { class: 'num' }, formatMMK(l.unitPrice)), el('td', { class: 'num' }, l.discountAmount ? '-' + formatMMK(l.discountAmount) : '—'), el('td', { class: 'num' }, formatMMK(l.lineTotal))))))),
      el('ul', { class: 'list' }, row('Subtotal', formatMMK(sale.subtotal)), sale.discountAmount ? row('Discount', '-' + formatMMK(sale.discountAmount)) : null, sale.taxAmount ? row('Tax (' + sale.taxRate + '%)', formatMMK(sale.taxAmount)) : null, row('Total', formatMMK(sale.total)),
        row('Paid', formatMMK(sale.paid)), sale.change ? row('Change given', formatMMK(sale.change)) : null, sale.balance ? row('Unpaid balance', formatMMK(sale.balance)) : null, sale.refundedTotal ? row('Refunded', formatMMK(sale.refundedTotal)) : null),
      (sale.refunds || []).length ? el('div', null, el('h2', { class: 'small', style: 'margin:10px 0 4px' }, 'Refund history'), el('ul', { class: 'list' }, sale.refunds.map((r) => el('li', null, el('span', null, formatDate(r.at, true) + ' · ' + r.reason), el('span', null, formatMMK(r.amount)))))) : null,
      sale.cancelReason ? el('p', { class: 'muted small' }, 'Cancelled: ' + sale.cancelReason) : null, sale.failReason ? el('p', { class: 'muted small' }, sale.failReason) : null),
      actions: [{ label: 'Close' }].concat(sale.status === 'completed' || sale.status === 'cancelled' ? [{ label: 'Print receipt', onClick: () => { setTimeout(() => printReceipt(sale, true), 0); } }] : [])
        .concat(canAct ? [{ label: 'Refund…', onClick: () => { setTimeout(() => openRefundDialog(sale, onChange), 0); } }] : [])
        .concat(canAct && !(sale.refunds || []).length ? [{ label: 'Cancel sale…', kind: 'danger', onClick: () => { setTimeout(() => openCancelDialog(sale, onChange), 0); } }] : []) });
  }

  function historyPage(root) {
    const st = { search: '', from: '', to: '', method: '', customer: '', status: '' };
    const holder = el('div', { class: 'card' });
    function rows() {
      const q = st.search.toLowerCase();
      return SS.storage.read('sales').filter((s) => s.status !== 'pending').filter((s) => {
        const day = dayKey(s.createdAt);
        if (st.from && day < st.from) return false; if (st.to && day > st.to) return false;
        if (st.method && s.method !== st.method) return false;
        if (st.customer && (st.customer === 'walkin' ? s.customerId : s.customerId !== st.customer)) return false;
        if (st.status && statusOf(s)[0] !== st.status) return false;
        return !q || (s.number + ' ' + s.customerName + ' ' + s.lines.map((l) => l.productName).join(' ')).toLowerCase().includes(q);
      }).reverse().map(view);
    }
    function draw() {
      const t = ui.dataTable({ rows: rows(), pageSize: 15, empty: { title: 'No sales found', hint: 'Completed sales appear here. Change the filters or make a sale in POS.' }, columns: [
        { key: 'number', label: 'No.', render: (s) => el('button', { class: 'link-btn', type: 'button', onclick: () => openDetails(s.id, () => { draw(); }) }, s.number) },
        { key: 'createdAt', label: 'Time', render: (s) => formatDate(s.createdAt, true) },
        { key: 'customerName', label: 'Customer', render: (s) => (s.customerId ? s.customerName : 'Walk-in') },
        { key: 'items', label: 'Items', num: true, sortValue: (s) => s.lines.length, render: (s) => String(s.lines.length) },
        { key: 'method', label: 'Payment', render: (s) => methodLabel(s.method) },
        { key: 'total', label: 'Total', num: true, render: (s) => formatMMK(s.total) },
        { key: 'balance', label: 'Unpaid', num: true, render: (s) => (s.balance > 0 ? formatMMK(s.balance) : '—') },
        { key: 'status', label: 'Status', sortValue: (s) => statusOf(s)[0], render: (s) => ui.badge(statusOf(s)[0], statusOf(s)[1]) },
        { key: 'act', label: '', sortable: false, render: (s) => el('div', { class: 'row-actions' }, s.status === 'completed' || s.status === 'cancelled' ? el('button', { class: 'btn sm', type: 'button', onclick: () => printReceipt(SS.storage.collection.byId('sales', s.id), true) }, 'Reprint') : null) }] });
      clear(holder); holder.append(t.node);
    }
    const f = (id, node, key) => { node.addEventListener('change', () => { st[key] = node.value; draw(); }); return node; };
    const search = el('input', { class: 'input grow', type: 'search', placeholder: 'Search number, customer or product…', 'aria-label': 'Search sales' });
    search.addEventListener('input', SS.utils.debounce(() => { st.search = search.value; draw(); }, 150));
    root.append(el('div', { class: 'toolbar' }, search,
      f('hFrom', el('input', { class: 'input', id: 'hFrom', type: 'date', 'aria-label': 'From date' }), 'from'), f('hTo', el('input', { class: 'input', id: 'hTo', type: 'date', 'aria-label': 'To date' }), 'to'),
      f('hMethod', ui.select('hMethod', [['', 'All payment methods']].concat(METHODS.map((m) => [m[0], m[1]])), ''), 'method'),
      f('hCust', ui.select('hCust', [['', 'All customers'], ['walkin', 'Walk-in']].concat(SS.storage.read('customers').map((c) => [c.id, c.name])), ''), 'customer'),
      f('hStatus', ui.select('hStatus', [['', 'All statuses'], ['Completed', 'Completed'], ['Unpaid balance', 'Unpaid balance'], ['Partly refunded', 'Partly refunded'], ['Refunded', 'Refunded'], ['Cancelled', 'Cancelled'], ['Rolled back', 'Rolled back']], ''), 'status')), holder);
    draw();
  }

  SS.sales = { METHODS, methodLabel, price, belowCost, complete, recover, refund, cancel, refundQuote, net, view, statusOf, printReceipt, receiptNode, openDetails, historyPage };
})();
