/* SmartStock — expenses.js
 * Operating expenses (rent, electricity, wages...). Kept separate from inventory purchases so product
 * purchases are never counted twice. Expenses are never deleted: they can be edited (audited) or voided.
 *   expense: {id, number, category, description, amount (integer MMK), method, date 'YYYY-MM-DD', notes, status:'active'|'void', voidReason}
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatDate, toInt, dayKey } = SS.utils; const ui = SS.ui;

  const CATEGORIES = [['rent', 'Rent', 'ဆိုင်ငှားရမ်းခ'], ['electricity', 'Electricity', 'မီးဖိုး'], ['transport', 'Transport', 'ပို့ဆောင်ခ'], ['wages', 'Staff Wages', 'ဝန်ထမ်းလစာ'], ['packaging', 'Packaging', 'ထုပ်ပိုးမှု'], ['maintenance', 'Maintenance', 'ပြုပြင်ထိန်းသိမ်းမှု'], ['other', 'Other Expenses', 'အခြားအသုံးစရိတ်']];
  const catLabel = (id) => { const c = CATEGORIES.find((x) => x[0] === id); return c ? (SS.i18n.getLang() === 'my' ? c[2] : c[1]) : id; };
  const byId = (id) => SS.storage.collection.byId('expenses', id);
  const active = () => SS.storage.read('expenses').filter((e) => e.status !== 'void');

  function validate(d) {
    if (!CATEGORIES.some((c) => c[0] === d.category)) throw new Error('Choose a category.');
    if (!String(d.description || '').trim()) throw new Error('Describe what the money was spent on.');
    if (!(toInt(d.amount) > 0)) throw new Error('Enter an amount greater than 0.');
    if (!SS.payments.METHODS.includes(d.method)) throw new Error('Choose a payment method.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) throw new Error('Enter the expense date.');
  }
  function save(d, id) {
    validate(d);
    const fields = { category: d.category, description: d.description.trim(), amount: toInt(d.amount), method: d.method, date: d.date, notes: String(d.notes || '').trim() };
    if (id) {
      const b = byId(id); if (!b) throw new Error('Expense not found.'); if (b.status === 'void') throw new Error('A voided expense cannot be edited.');
      const rec = SS.storage.collection.update('expenses', id, fields);
      SS.audit.record('expense.updated', { type: 'expense', id, label: b.number }, { category: b.category, description: b.description, amount: b.amount, method: b.method, date: b.date }, { category: fields.category, description: fields.description, amount: fields.amount, method: fields.method, date: fields.date }); return rec;
    }
    const number = 'EXP-' + String(SS.storage.counter('expense')).padStart(4, '0');
    const rec = SS.storage.collection.insert('expenses', Object.assign({ number, status: 'active' }, fields), 'exp');
    SS.audit.record('expense.created', { type: 'expense', id: rec.id, label: number }, null, { amount: fields.amount, category: fields.category }); return rec;
  }
  function voidExpense(id, reason) {
    const b = byId(id); if (!b || b.status === 'void') throw new Error('This expense is already voided.');
    if (!String(reason || '').trim()) throw new Error('A reason is required to void an expense.');
    SS.storage.collection.update('expenses', id, { status: 'void', voidReason: reason.trim(), voidedAt: Date.now() });
    SS.audit.record('expense.voided', { type: 'expense', id, label: b.number }, { amount: b.amount }, { reason: reason.trim() });
  }
  /** month: 'YYYY-MM' -> {total, count, byCategory:[{category, amount}]} (voided expenses excluded) */
  function monthly(month) {
    const rows = active().filter((e) => e.date.slice(0, 7) === month); const by = {};
    rows.forEach((e) => { by[e.category] = (by[e.category] || 0) + e.amount; });
    return { total: rows.reduce((a, e) => a + e.amount, 0), count: rows.length, byCategory: CATEGORIES.map((c) => ({ category: c[0], amount: by[c[0]] || 0 })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount) };
  }

  function openForm(id, onDone) {
    const cur = id ? byId(id) : null; const v = (k, d) => (cur && cur[k] != null ? cur[k] : d);
    const cat = ui.select('exCat', CATEGORIES.map((c) => [c[0], catLabel(c[0])]), v('category', 'other')); const desc = el('input', { class: 'input', id: 'exDesc', value: v('description', '') });
    const amt = el('input', { class: 'input', id: 'exAmt', type: 'number', min: '1', step: '1', inputmode: 'numeric', value: v('amount', '') }); const method = ui.select('exMethod', SS.sales.METHODS.map((m) => [m[0], m[1]]), v('method', 'cash'));
    const date = el('input', { class: 'input', id: 'exDate', type: 'date', value: v('date', dayKey(Date.now())) }); const notes = el('textarea', { class: 'input', id: 'exNotes' }, v('notes', ''));
    SS.utils.openModal({ title: cur ? 'Edit ' + cur.number : 'New expense', body: el('div', null, el('div', { class: 'form-grid' }, ui.field('Category', 'exCat', cat), ui.field('Date', 'exDate', date), ui.field('Amount (MMK)', 'exAmt', amt), ui.field('Paid by', 'exMethod', method)), ui.field('Description', 'exDesc', desc), ui.field('Notes', 'exNotes', notes),
      el('p', { class: 'muted small' }, 'Use this for running costs. Stock you buy for resale goes in Purchases, not here.')),
      actions: [{ label: SS.i18n.t('cancel') }, { label: SS.i18n.t('save'), kind: 'primary', onClick: () => { try { save({ category: cat.value, description: desc.value, amount: amt.value, method: method.value, date: date.value, notes: notes.value }, id); SS.utils.toast('Expense saved.', 'success'); if (onDone) onDone(); } catch (e) { SS.utils.toast(e.message, 'error'); return false; } } }] });
  }
  function openVoid(id, onDone) {
    const e0 = byId(id); const reason = el('input', { class: 'input', id: 'exVoid' });
    SS.utils.openModal({ title: 'Void ' + e0.number + '?', body: el('div', null, el('p', null, 'The expense stays in the list marked as void and is no longer counted in totals or cash.'), ui.field('Reason', 'exVoid', reason)),
      actions: [{ label: 'Keep' }, { label: 'Void expense', kind: 'danger', onClick: () => { try { voidExpense(id, reason.value); SS.utils.toast('Expense voided.', 'success'); onDone(); } catch (e) { SS.utils.toast(e.message, 'error'); return false; } } }] });
  }

  function page(root) {
    const st = { search: '', category: '', method: '', month: dayKey(Date.now()).slice(0, 7), showVoid: false };
    const summary = el('div', { class: 'grid', style: 'margin-bottom:16px' }); const holder = el('div', { class: 'card' });
    function draw() {
      const m = st.month ? monthly(st.month) : null; clear(summary);
      if (m) {
        const max = Math.max(1, ...m.byCategory.map((x) => x.amount));
        summary.append(el('div', { class: 'col-4' }, el('div', { class: 'card stat accent' }, el('div', { class: 'label' }, 'Expenses in ' + st.month), el('div', { class: 'value' }, formatMMK(m.total)), el('div', { class: 'hint' }, m.count + ' expense(s), voided ones excluded'))),
          el('div', { class: 'col-8' }, el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', null, 'By category')), m.byCategory.length ? el('ul', { class: 'list' }, m.byCategory.map((x) => el('li', null, el('span', { style: 'flex:1' }, catLabel(x.category), el('span', { style: `display:block;height:4px;margin-top:4px;border-radius:2px;background:var(--gold);width:${Math.round(x.amount / max * 100)}%` })), el('span', { class: 'num' }, formatMMK(x.amount))))) : el('div', { class: 'empty' }, 'No expenses this month.'))));
      }
      const q = st.search.toLowerCase();
      const rows = SS.storage.read('expenses').filter((e) => (st.showVoid || e.status !== 'void') && (!st.month || e.date.slice(0, 7) === st.month) && (!st.category || e.category === st.category) && (!st.method || e.method === st.method) && (!q || (e.number + ' ' + e.description + ' ' + (e.notes || '')).toLowerCase().includes(q))).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
      const t = ui.dataTable({ rows, pageSize: 15, empty: { title: 'No expenses found', hint: 'Record rent, electricity, wages and other running costs here.' }, columns: [
        { key: 'date', label: 'Date' }, { key: 'number', label: 'No.' }, { key: 'category', label: 'Category', sortValue: (e) => catLabel(e.category), render: (e) => catLabel(e.category) },
        { key: 'description', label: 'Description', render: (e) => el('span', null, e.description, e.status === 'void' ? el('span', { class: 'sub' }, 'Void: ' + e.voidReason) : null) },
        { key: 'method', label: 'Paid by', render: (e) => SS.sales.methodLabel(e.method) }, { key: 'amount', label: 'Amount', num: true, render: (e) => (e.status === 'void' ? el('s', null, formatMMK(e.amount)) : formatMMK(e.amount)) },
        { key: 'status', label: 'Status', render: (e) => (e.status === 'void' ? ui.badge('Void', 'danger') : ui.badge('Recorded', 'success')) },
        { key: 'act', label: '', sortable: false, render: (e) => (e.status === 'void' ? null : el('div', { class: 'row-actions' }, el('button', { class: 'btn sm', type: 'button', onclick: () => openForm(e.id, draw) }, 'Edit'), el('button', { class: 'btn sm', type: 'button', onclick: () => openVoid(e.id, draw) }, 'Void'))) }] });
      clear(holder); holder.append(t.node);
    }
    const search = el('input', { class: 'input grow', type: 'search', placeholder: 'Search description or number…', 'aria-label': 'Search expenses' }); search.addEventListener('input', SS.utils.debounce(() => { st.search = search.value; draw(); }, 150));
    const month = el('input', { class: 'input', id: 'exMonth', type: 'month', value: st.month, 'aria-label': 'Month' }); month.addEventListener('change', () => { st.month = month.value; draw(); });
    const cat = ui.select('exCatF', [['', 'All categories']].concat(CATEGORIES.map((c) => [c[0], catLabel(c[0])])), ''); cat.addEventListener('change', () => { st.category = cat.value; draw(); });
    const meth = ui.select('exMethF', [['', 'All methods']].concat(SS.sales.METHODS.map((m) => [m[0], m[1]])), ''); meth.addEventListener('change', () => { st.method = meth.value; draw(); });
    const vd = ui.select('exVoidF', [['0', 'Hide voided'], ['1', 'Show voided']], '0'); vd.addEventListener('change', () => { st.showVoid = vd.value === '1'; draw(); });
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('expenses')), el('p', null, 'Running costs only. Stock purchases are not counted here.')), el('button', { class: 'btn primary', type: 'button', onclick: () => openForm(null, draw) }, '+ New expense')),
      summary, el('div', { class: 'toolbar' }, search, month, cat, meth, vd), holder);
    draw();
  }

  SS.expenses = { CATEGORIES, catLabel, validate, save, voidExpense, monthly, openForm };
  SS.pages = SS.pages || {}; SS.pages.expenses = page;
})();
