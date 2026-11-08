/* SmartStock — customers.js
 * Customer records, credit sales (receivables), customer payments, purchase history.
 * Walk-in sales have no customer record (customerId ''); the pinned "Walk-in" row summarises them.
 * Receivables are tracked separately from cash: outstandingBalance is money owed, not money collected.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatDate, toInt } = SS.utils; const ui = SS.ui;

  const all = () => SS.storage.read('customers');

  function save(d, id) {
    const name = d.name.trim(); if (!name) throw new Error('Customer name is required.');
    const phone = d.phone.trim();
    if (all().some((c) => c.id !== id && c.name.trim().toLowerCase() === name.toLowerCase() && (c.phone || '') === phone)) throw new Error('A customer with this name and phone number already exists.');
    const fields = { name, phone, address: d.address.trim(), notes: d.notes.trim() };
    if (id) { const b = SS.storage.collection.byId('customers', id); const rec = SS.storage.collection.update('customers', id, fields); SS.audit.record('customer.updated', { type: 'customer', id, label: name }, { name: b.name, phone: b.phone }, { name, phone }); return rec; }
    const rec = SS.storage.collection.insert('customers', Object.assign({ totalPurchases: 0, outstandingBalance: 0, status: 'active' }, fields), 'cus');
    SS.audit.record('customer.created', { type: 'customer', id: rec.id, label: name }, null, { name }); return rec;
  }

  function openForm(id, onDone) {
    const cur = id ? SS.storage.collection.byId('customers', id) : null; const v = (k) => (cur && cur[k]) || '';
    const f = { name: el('input', { class: 'input', id: 'cuName', value: v('name') }), phone: el('input', { class: 'input', id: 'cuPhone', type: 'tel', value: v('phone') }), address: el('input', { class: 'input', id: 'cuAddr', value: v('address') }), notes: el('textarea', { class: 'input', id: 'cuNotes' }, v('notes')) };
    SS.utils.openModal({ title: cur ? 'Edit customer' : 'New customer', body: el('div', null, el('div', { class: 'form-grid' }, ui.field('Name', 'cuName', f.name), ui.field('Phone number', 'cuPhone', f.phone)), ui.field('Address', 'cuAddr', f.address), ui.field('Notes', 'cuNotes', f.notes)),
      actions: [{ label: SS.i18n.t('cancel') }, { label: SS.i18n.t('save'), kind: 'primary', onClick: () => {
        try { ui.setError(f.name, ''); save({ name: f.name.value, phone: f.phone.value, address: f.address.value, notes: f.notes.value }, id); SS.utils.toast('Customer saved.', 'success'); if (onDone) onDone(); }
        catch (e) { ui.setError(f.name, e.message); return false; } } }] });
  }

  function setStatus(id, status) { const c = SS.storage.collection.byId('customers', id); SS.storage.collection.update('customers', id, { status }); SS.audit.record('customer.' + (status === 'archived' ? 'archived' : 'restored'), { type: 'customer', id, label: c.name }); }

  function openDetails(id, onChange) {
    const c = SS.storage.collection.byId('customers', id); if (!c) return;
    const sales = SS.storage.read('sales').filter((s) => s.customerId === id && (s.status === 'completed' || s.status === 'cancelled')).slice().reverse().map(SS.sales.view); const pays = SS.payments.forCustomer(id).filter((p) => p.kind === 'customer_payment');
    const num = Object.fromEntries(SS.storage.read('sales').map((s) => [s.id, s.number]));
    const row = (a, b) => el('li', null, el('span', { class: 'muted' }, a), el('span', null, b));
    const tbl = (head, rows, empty) => rows.length ? el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, head.map((h) => el('th', { class: h[1] ? 'num' : '' }, h[0])))), el('tbody', null, rows))) : el('p', { class: 'muted small' }, empty);
    SS.utils.openModal({ title: c.name, body: el('div', { class: 'wide' },
      el('ul', { class: 'list' }, row('Phone', c.phone || '—'), row('Address', c.address || '—'), c.notes ? row('Notes', c.notes) : null, row('Total purchases', formatMMK(c.totalPurchases)), row('Outstanding (owes you)', formatMMK(c.outstandingBalance))),
      el('h2', { class: 'small', style: 'margin:12px 0 6px' }, 'Purchase history'),
      tbl([['No.'], ['Date'], ['Status'], ['Total', 1], ['Unpaid', 1]], sales.map((s) => el('tr', null, el('td', null, el('button', { class: 'link-btn', type: 'button', onclick: () => SS.sales.openDetails(s.id, onChange) }, s.number)), el('td', null, formatDate(s.createdAt, true)), el('td', null, ui.badge(SS.sales.statusOf(s)[0], SS.sales.statusOf(s)[1])), el('td', { class: 'num' }, formatMMK(s.total)), el('td', { class: 'num' }, s.balance > 0 ? formatMMK(s.balance) : '—'))), 'No purchases yet.'),
      el('h2', { class: 'small', style: 'margin:12px 0 6px' }, 'Payments received'),
      tbl([['Date'], ['Sale'], ['Method'], ['Amount', 1]], pays.map((p) => el('tr', null, el('td', null, formatDate(p.createdAt, true)), el('td', null, num[p.saleId] || '—'), el('td', null, SS.sales.methodLabel(p.method)), el('td', { class: 'num' }, formatMMK(p.amount)))), 'No payments received yet.')),
      actions: [{ label: 'Close' }, { label: 'Edit', onClick: () => { setTimeout(() => openForm(id, onChange), 0); } }].concat(c.outstandingBalance > 0 ? [{ label: 'Receive payment', kind: 'primary', onClick: () => { setTimeout(() => SS.payments.openDialog({ kind: 'customer', id, onDone: onChange }), 0); } }] : []) });
  }

  function page(root) {
    const st = { search: '', status: 'active', owing: false }; const holder = el('div', { class: 'card' }); const summary = el('div', { class: 'grid', style: 'margin-bottom:16px' });
    function draw() {
      const list = all(); const q = st.search.toLowerCase();
      const rows = list.filter((c) => (st.status === 'all' || (c.status || 'active') === st.status) && (!st.owing || c.outstandingBalance > 0) && (!q || (c.name + ' ' + (c.phone || '')).toLowerCase().includes(q)));
      const walk = SS.storage.read('sales').filter((s) => !s.customerId && s.status === 'completed'); const walkTotal = walk.reduce((a, s) => a + s.total - (s.refundedTotal || 0), 0);
      clear(summary); const owed = list.reduce((a, c) => a + toInt(c.outstandingBalance), 0);
      summary.append(el('div', { class: 'col-4' }, el('div', { class: 'card stat' }, el('div', { class: 'label' }, 'Total owed by customers (receivables)'), el('div', { class: 'value' }, formatMMK(owed)))),
        el('div', { class: 'col-4' }, el('div', { class: 'card stat' }, el('div', { class: 'label' }, 'Customers with unpaid balance'), el('div', { class: 'value' }, String(list.filter((c) => c.outstandingBalance > 0).length)))),
        el('div', { class: 'col-4' }, el('div', { class: 'card stat' }, el('div', { class: 'label' }, 'Walk-in customer (default)'), el('div', { class: 'value' }, formatMMK(walkTotal)), el('div', { class: 'hint' }, walk.length + ' sale(s), always paid in full'))));
      const t = ui.dataTable({ rows, pageSize: 15, empty: { title: 'No customers yet', hint: 'Walk-in sales need no customer. Add customers to sell on credit and track what they owe.' }, columns: [
        { key: 'name', label: 'Customer', render: (c) => el('button', { class: 'link-btn', type: 'button', onclick: () => openDetails(c.id, draw) }, c.name) },
        { key: 'phone', label: 'Phone', render: (c) => c.phone || '—' },
        { key: 'totalPurchases', label: 'Total purchases', num: true, render: (c) => formatMMK(c.totalPurchases) },
        { key: 'outstandingBalance', label: 'Owes you', num: true, render: (c) => (c.outstandingBalance > 0 ? formatMMK(c.outstandingBalance) : '—') },
        { key: 'status', label: 'Status', render: (c) => (c.status === 'archived' ? ui.badge('Archived', 'warning') : ui.badge('Active', 'success')) },
        { key: 'act', label: '', sortable: false, render: (c) => el('div', { class: 'row-actions' }, c.outstandingBalance > 0 ? el('button', { class: 'btn sm', type: 'button', onclick: () => SS.payments.openDialog({ kind: 'customer', id: c.id, onDone: draw }) }, 'Receive') : null,
          el('button', { class: 'btn sm', type: 'button', onclick: () => openForm(c.id, draw) }, 'Edit'), el('button', { class: 'btn sm', type: 'button', onclick: () => { setStatus(c.id, c.status === 'archived' ? 'active' : 'archived'); draw(); } }, c.status === 'archived' ? 'Restore' : 'Archive')) }] });
      clear(holder); holder.append(t.node);
    }
    const search = el('input', { class: 'input grow', type: 'search', placeholder: 'Search name or phone…', 'aria-label': 'Search customers' }); search.addEventListener('input', SS.utils.debounce(() => { st.search = search.value; draw(); }, 150));
    const status = ui.select('cuStatus', [['active', 'Active'], ['archived', 'Archived'], ['all', 'All']], st.status); status.addEventListener('change', () => { st.status = status.value; draw(); });
    const owing = ui.select('cuOwing', [['0', 'All balances'], ['1', 'Owing only']], '0'); owing.addEventListener('change', () => { st.owing = owing.value === '1'; draw(); });
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('customers'))), el('button', { class: 'btn primary', type: 'button', onclick: () => openForm(null, draw) }, '+ New customer')), summary, el('div', { class: 'toolbar' }, search, status, owing), holder);
    draw();
  }

  SS.customers = { all, save, openForm, openDetails };
  SS.pages = SS.pages || {}; SS.pages.customers = page;
})();
