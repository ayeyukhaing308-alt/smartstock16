/* SmartStock — suppliers.js
 * Supplier records, payables, supplier payments and purchase history.
 * Purchase unit costs stay behind the admin PIN; this page only shows invoice totals and balances owed.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatDate, toInt } = SS.utils; const ui = SS.ui;

  const all = () => SS.storage.read('suppliers');
  const nameTaken = (name, exceptId) => all().some((s) => s.id !== exceptId && s.name.trim().toLowerCase() === name.trim().toLowerCase());

  function save(d, id) {
    const name = d.name.trim(); if (!name) throw new Error('Supplier name is required.');
    if (nameTaken(name, id)) throw new Error('A supplier with this name already exists.');
    const fields = { name, phone: d.phone.trim(), address: d.address.trim(), contactPerson: d.contactPerson.trim(), notes: d.notes.trim() };
    if (id) {
      const before = SS.storage.collection.byId('suppliers', id); const rec = SS.storage.collection.update('suppliers', id, fields);
      SS.audit.record('supplier.updated', { type: 'supplier', id, label: name }, { name: before.name, phone: before.phone }, { name, phone: fields.phone }); return rec;
    }
    const rec = SS.storage.collection.insert('suppliers', Object.assign({ outstandingBalance: 0, status: 'active' }, fields), 'sup');
    SS.audit.record('supplier.created', { type: 'supplier', id: rec.id, label: name }, null, { name }); return rec;
  }

  function openForm(id, onDone) {
    const cur = id ? SS.storage.collection.byId('suppliers', id) : null; const v = (k) => (cur && cur[k]) || '';
    const f = { name: el('input', { class: 'input', id: 'suName', value: v('name') }), phone: el('input', { class: 'input', id: 'suPhone', type: 'tel', value: v('phone') }), contact: el('input', { class: 'input', id: 'suContact', value: v('contactPerson') }),
      address: el('input', { class: 'input', id: 'suAddr', value: v('address') }), notes: el('textarea', { class: 'input', id: 'suNotes' }, v('notes')) };
    SS.utils.openModal({ title: cur ? 'Edit supplier' : 'New supplier', body: el('div', null, el('div', { class: 'form-grid' }, ui.field('Supplier name', 'suName', f.name), ui.field('Phone number', 'suPhone', f.phone), ui.field('Contact person', 'suContact', f.contact), ui.field('Address', 'suAddr', f.address)), ui.field('Notes', 'suNotes', f.notes)),
      actions: [{ label: SS.i18n.t('cancel') }, { label: SS.i18n.t('save'), kind: 'primary', onClick: () => {
        try { ui.setError(f.name, ''); save({ name: f.name.value, phone: f.phone.value, contactPerson: f.contact.value, address: f.address.value, notes: f.notes.value }, id); SS.utils.toast('Supplier saved.', 'success'); if (onDone) onDone(); }
        catch (e) { ui.setError(f.name, e.message); return false; } } }] });
  }

  function setStatus(id, status) { const s = SS.storage.collection.byId('suppliers', id); SS.storage.collection.update('suppliers', id, { status }); SS.audit.record('supplier.' + (status === 'archived' ? 'archived' : 'restored'), { type: 'supplier', id, label: s.name }); }

  function openDetails(id, onChange) {
    const s = SS.storage.collection.byId('suppliers', id); if (!s) return;
    const purchases = SS.storage.read('purchases').filter((p) => p.supplierId === id && p.status !== 'cancelled').slice().reverse(); const pays = SS.payments.forSupplier(id);
    const num = Object.fromEntries(SS.storage.read('purchases').map((p) => [p.id, p.number]));
    const row = (a, b) => el('li', null, el('span', { class: 'muted' }, a), el('span', null, b));
    const tbl = (head, rows, empty) => rows.length ? el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, head.map((h, i) => el('th', { class: h[1] ? 'num' : '' }, h[0])))), el('tbody', null, rows))) : el('p', { class: 'muted small' }, empty);
    SS.utils.openModal({ title: s.name, body: el('div', { class: 'wide' },
      el('ul', { class: 'list' }, row('Phone', s.phone || '—'), row('Contact person', s.contactPerson || '—'), row('Address', s.address || '—'), s.notes ? row('Notes', s.notes) : null, row('Outstanding (you owe)', formatMMK(s.outstandingBalance))),
      el('h2', { class: 'small', style: 'margin:12px 0 6px' }, 'Purchase history'),
      tbl([['No.'], ['Date'], ['Status'], ['Total', 1], ['Unpaid', 1]], purchases.map((p) => el('tr', null, el('td', null, p.number), el('td', null, p.date), el('td', null, p.status === 'draft' ? ui.badge('Draft', 'info') : ui.badge('Confirmed', 'success')), el('td', { class: 'num' }, formatMMK(p.total)), el('td', { class: 'num' }, p.balance > 0 ? formatMMK(p.balance) : '—'))), 'No purchases from this supplier yet.'),
      el('h2', { class: 'small', style: 'margin:12px 0 6px' }, 'Payments made'),
      tbl([['Date'], ['Purchase'], ['Method'], ['Amount', 1]], pays.map((p) => el('tr', null, el('td', null, formatDate(p.createdAt, true)), el('td', null, num[p.purchaseId] || '—'), el('td', null, SS.sales.methodLabel(p.method)), el('td', { class: 'num' }, formatMMK(p.amount)))), 'No payments yet.')),
      actions: [{ label: 'Close' }, { label: 'Edit', onClick: () => { setTimeout(() => openForm(id, onChange), 0); } }].concat(s.outstandingBalance > 0 ? [{ label: 'Pay supplier', kind: 'primary', onClick: () => { setTimeout(() => SS.payments.openDialog({ kind: 'supplier', id, onDone: onChange }), 0); } }] : []) });
  }

  function page(root) {
    const st = { search: '', status: 'active', owing: false }; const holder = el('div', { class: 'card' }); const summary = el('div', { class: 'grid', style: 'margin-bottom:16px' });
    function draw() {
      const list = all(); const q = st.search.toLowerCase();
      const rows = list.filter((s) => (st.status === 'all' || (s.status || 'active') === st.status) && (!st.owing || s.outstandingBalance > 0) && (!q || (s.name + ' ' + (s.phone || '') + ' ' + (s.contactPerson || '')).toLowerCase().includes(q)));
      clear(summary); const total = list.reduce((a, s) => a + toInt(s.outstandingBalance), 0);
      summary.append(el('div', { class: 'col-4' }, el('div', { class: 'card stat' }, el('div', { class: 'label' }, 'Total owed to suppliers (payables)'), el('div', { class: 'value' }, formatMMK(total)))),
        el('div', { class: 'col-4' }, el('div', { class: 'card stat' }, el('div', { class: 'label' }, 'Suppliers with unpaid balance'), el('div', { class: 'value' }, String(list.filter((s) => s.outstandingBalance > 0).length)))));
      const t = ui.dataTable({ rows, pageSize: 15, empty: { title: 'No suppliers yet', hint: 'Add the people you buy stock from, then record purchases.' }, columns: [
        { key: 'name', label: 'Supplier', render: (s) => el('span', null, el('button', { class: 'link-btn', type: 'button', onclick: () => openDetails(s.id, draw) }, s.name), s.contactPerson ? el('span', { class: 'sub' }, s.contactPerson) : null) },
        { key: 'phone', label: 'Phone', render: (s) => s.phone || '—' },
        { key: 'outstandingBalance', label: 'You owe', num: true, render: (s) => (s.outstandingBalance > 0 ? formatMMK(s.outstandingBalance) : '—') },
        { key: 'status', label: 'Status', render: (s) => (s.status === 'archived' ? ui.badge('Archived', 'warning') : ui.badge('Active', 'success')) },
        { key: 'act', label: '', sortable: false, render: (s) => el('div', { class: 'row-actions' }, s.outstandingBalance > 0 ? el('button', { class: 'btn sm', type: 'button', onclick: () => SS.payments.openDialog({ kind: 'supplier', id: s.id, onDone: draw }) }, 'Pay') : null,
          el('button', { class: 'btn sm', type: 'button', onclick: () => openForm(s.id, draw) }, 'Edit'), el('button', { class: 'btn sm', type: 'button', onclick: () => { setStatus(s.id, s.status === 'archived' ? 'active' : 'archived'); draw(); } }, s.status === 'archived' ? 'Restore' : 'Archive')) }] });
      clear(holder); holder.append(t.node);
    }
    const search = el('input', { class: 'input grow', type: 'search', placeholder: 'Search suppliers…', 'aria-label': 'Search suppliers' }); search.addEventListener('input', SS.utils.debounce(() => { st.search = search.value; draw(); }, 150));
    const status = ui.select('suStatus', [['active', 'Active'], ['archived', 'Archived'], ['all', 'All']], st.status); status.addEventListener('change', () => { st.status = status.value; draw(); });
    const owing = ui.select('suOwing', [['0', 'All balances'], ['1', 'Owing only']], '0'); owing.addEventListener('change', () => { st.owing = owing.value === '1'; draw(); });
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('suppliers'))), el('button', { class: 'btn primary', type: 'button', onclick: () => openForm(null, draw) }, '+ New supplier')), summary, el('div', { class: 'toolbar' }, search, status, owing), holder);
    draw();
  }

  SS.suppliers = { all, save, openForm, openDetails, options: (includeId) => all().filter((s) => s.status !== 'archived' || s.id === includeId) };
  SS.pages = SS.pages || {}; SS.pages.suppliers = page;
})();
