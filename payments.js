/* SmartStock — payments.js
 * Money movements that are not part of a sale checkout:
 *  - customer payments against unpaid (credit) sales, allocated oldest-first
 *  - supplier payments against unpaid purchases, allocated oldest-first
 * Every payment is a record in `payments` (never edited or deleted) so cash management can be rebuilt from it.
 *   payment: {id, kind, direction:'in'|'out', method, amount, date:'YYYY-MM-DD', customerId|supplierId, saleId|purchaseId, note, createdAt}
 *   kinds: sale_payment, sale_refund, customer_payment, supplier_payment
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { toInt, dayKey } = SS.utils;

  const METHODS = ['cash', 'kbzpay', 'wavepay', 'ayapay', 'bank', 'other'];

  function record(o) { return SS.storage.collection.insert('payments', Object.assign({ date: dayKey(Date.now()) }, o), 'pay'); }

  function checkInput(o) {
    const amount = toInt(o.amount);
    if (!(amount > 0)) throw new Error('Enter an amount greater than 0.');
    if (!METHODS.includes(o.method)) throw new Error('Choose a payment method.');
    return amount;
  }

  /** Collect money owed by a customer. o: {customerId, amount, method, note, saleId?} */
  function receiveFromCustomer(o) {
    const amount = checkInput(o);
    const customer = SS.storage.collection.byId('customers', o.customerId); if (!customer) throw new Error('Customer not found.');
    if (amount > toInt(customer.outstandingBalance)) throw new Error(`${customer.name} owes only ${SS.utils.formatMMK(customer.outstandingBalance)}. Enter that amount or less.`);
    let open = SS.storage.read('sales').filter((s) => s.customerId === customer.id && s.status === 'completed' && s.balance > 0).sort((a, b) => a.createdAt - b.createdAt);
    if (o.saleId) { open = open.filter((s) => s.id === o.saleId); if (!open.length) throw new Error('That sale has no unpaid balance.'); if (amount > open[0].balance) throw new Error(`That sale has only ${SS.utils.formatMMK(open[0].balance)} unpaid.`); }
    let left = amount; const alloc = [];
    open.forEach((s) => { if (left <= 0) return; const a = Math.min(left, s.balance); alloc.push({ sale: s, amount: a }); left -= a; });
    if (left > 0) throw new Error('This customer’s balance does not match their unpaid sales. Run the integrity check in Settings before taking this payment.');
    return SS.storage.transaction(['sales', 'payments', 'customers'], () => {
      const ids = new Map(alloc.map((x) => [x.sale.id, x.amount]));
      SS.storage.write('sales', SS.storage.read('sales').map((s) => (ids.has(s.id) ? Object.assign({}, s, { paid: s.paid + ids.get(s.id), balance: s.balance - ids.get(s.id), updatedAt: Date.now() }) : s)));
      const recs = alloc.map((x) => record({ kind: 'customer_payment', direction: 'in', customerId: customer.id, saleId: x.sale.id, method: o.method, amount: x.amount, note: String(o.note || '').trim() }));
      SS.storage.collection.update('customers', customer.id, { outstandingBalance: toInt(customer.outstandingBalance) - amount });
      SS.audit.record('customer.payment', { type: 'customer', id: customer.id, label: customer.name }, { outstanding: customer.outstandingBalance }, { received: amount, method: o.method });
      return { amount, allocations: alloc.map((x) => ({ saleId: x.sale.id, number: x.sale.number, amount: x.amount })), records: recs };
    });
  }

  /** Pay money owed to a supplier. o: {supplierId, amount, method, note, purchaseId?} */
  function payToSupplier(o) {
    const amount = checkInput(o);
    const supplier = SS.storage.collection.byId('suppliers', o.supplierId); if (!supplier) throw new Error('Supplier not found.');
    if (amount > toInt(supplier.outstandingBalance)) throw new Error(`You owe ${supplier.name} only ${SS.utils.formatMMK(supplier.outstandingBalance)}. Enter that amount or less.`);
    let open = SS.storage.read('purchases').filter((p) => p.supplierId === supplier.id && p.status === 'confirmed' && p.balance > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
    if (o.purchaseId) { open = open.filter((p) => p.id === o.purchaseId); if (!open.length) throw new Error('That purchase has no unpaid balance.'); if (amount > open[0].balance) throw new Error(`That purchase has only ${SS.utils.formatMMK(open[0].balance)} unpaid.`); }
    let left = amount; const alloc = [];
    open.forEach((p) => { if (left <= 0) return; const a = Math.min(left, p.balance); alloc.push({ purchase: p, amount: a }); left -= a; });
    if (left > 0) throw new Error('This supplier’s balance does not match their unpaid purchases. Run the integrity check in Settings before making this payment.');
    return SS.storage.transaction(['purchases', 'payments', 'suppliers'], () => {
      const ids = new Map(alloc.map((x) => [x.purchase.id, x.amount]));
      SS.storage.write('purchases', SS.storage.read('purchases').map((p) => (ids.has(p.id) ? Object.assign({}, p, { paid: p.paid + ids.get(p.id), balance: p.balance - ids.get(p.id), updatedAt: Date.now() }) : p)));
      const recs = alloc.map((x) => record({ kind: 'supplier_payment', direction: 'out', supplierId: supplier.id, purchaseId: x.purchase.id, method: o.method, amount: x.amount, note: String(o.note || '').trim() }));
      SS.storage.collection.update('suppliers', supplier.id, { outstandingBalance: toInt(supplier.outstandingBalance) - amount });
      SS.audit.record('supplier.payment', { type: 'supplier', id: supplier.id, label: supplier.name }, { outstanding: supplier.outstandingBalance }, { paid: amount, method: o.method });
      return { amount, allocations: alloc.map((x) => ({ purchaseId: x.purchase.id, number: x.purchase.number, amount: x.amount })), records: recs };
    });
  }

  const forCustomer = (id) => SS.storage.read('payments').filter((p) => p.customerId === id).slice().reverse();
  const forSupplier = (id) => SS.storage.read('payments').filter((p) => p.supplierId === id).slice().reverse();

  /** Payment dialog shared by the Customers and Suppliers pages. o: {kind:'customer'|'supplier', id, onDone} */
  function openDialog(o) {
    const { el } = SS.utils; const ui = SS.ui; const isCust = o.kind === 'customer';
    const party = SS.storage.collection.byId(isCust ? 'customers' : 'suppliers', o.id); if (!party) return;
    const owed = SS.utils.toInt(party.outstandingBalance);
    if (owed <= 0) return SS.utils.toast(party.name + ' has nothing outstanding.', 'info');
    const open = isCust ? SS.storage.read('sales').filter((s) => s.customerId === party.id && s.status === 'completed' && s.balance > 0) : SS.storage.read('purchases').filter((p) => p.supplierId === party.id && p.status === 'confirmed' && p.balance > 0);
    const target = ui.select('payTarget', [['', 'Oldest first (automatic)']].concat(open.map((x) => [x.id, x.number + ' — unpaid ' + SS.utils.formatNumber(x.balance)])), '');
    const amount = el('input', { class: 'input', id: 'payAmt', type: 'number', min: '1', step: '1', inputmode: 'numeric', value: owed });
    const method = ui.select('payMethod', SS.sales.METHODS.map((m) => [m[0], m[1]]), SS.settings.get().defaultPayment || 'cash');
    const note = el('input', { class: 'input', id: 'payNote' });
    target.addEventListener('change', () => { const x = open.find((y) => y.id === target.value); amount.value = x ? x.balance : owed; });
    SS.utils.openModal({ title: (isCust ? 'Receive payment from ' : 'Pay supplier ') + party.name,
      body: el('div', null, el('p', { class: 'muted' }, (isCust ? 'Owes you ' : 'You owe ') + SS.utils.formatMMK(owed)), ui.field('Apply to', 'payTarget', target), ui.field('Amount (MMK)', 'payAmt', amount), ui.field('Payment method', 'payMethod', method), ui.field('Note (optional)', 'payNote', note)),
      actions: [{ label: SS.i18n.t('cancel') }, { label: 'Record payment', kind: 'primary', onClick: () => {
        try {
          const args = { amount: amount.value, method: method.value, note: note.value }; let r;
          if (isCust) r = receiveFromCustomer(Object.assign({ customerId: party.id, saleId: target.value || undefined }, args));
          else r = payToSupplier(Object.assign({ supplierId: party.id, purchaseId: target.value || undefined }, args));
          SS.utils.toast('Payment recorded: ' + SS.utils.formatMMK(r.amount), 'success'); if (o.onDone) o.onDone();
        } catch (e) { SS.utils.toast(e.message, 'error'); return false; }
      } }] });
  }

  SS.payments = { openDialog, METHODS, record, receiveFromCustomer, payToSupplier, forCustomer, forSupplier };
})();
