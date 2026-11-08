/* SmartStock — cash-management.js
 * Daily cash drawer. ONLY physical cash is counted: cash sales, cash customer payments, cash refunds,
 * cash expenses, cash supplier payments and manual additions/withdrawals. KBZPay, WavePay, bank etc. never touch the drawer.
 *   cashSession: {id, date, status:'open'|'closed', openingCash, movements:[{id,type:'addition'|'withdrawal',amount,reason,at}],
 *                 countedCash, expectedCash, difference, summary, closeNote, openedAt, closedAt}
 * Cash payments are dated by when they were recorded; expenses by their expense date.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatDate, toInt, dayKey } = SS.utils; const ui = SS.ui;
  const sessions = () => SS.storage.read('cashSessions');
  const sessionOn = (date) => sessions().find((s) => s.date === date) || null;

  function lines(date) {
    const pays = SS.storage.read('payments').filter((p) => p.method === 'cash' && dayKey(p.createdAt) === date);
    const sum = (kind) => pays.filter((p) => p.kind === kind).reduce((a, p) => a + toInt(p.amount), 0);
    const expenses = SS.storage.read('expenses').filter((e) => e.status !== 'void' && e.method === 'cash' && e.date === date).reduce((a, e) => a + e.amount, 0);
    return { cashSales: sum('sale_payment'), customerPayments: sum('customer_payment'), cashRefunds: sum('sale_refund'), supplierPayments: sum('supplier_payment'), cashExpenses: expenses };
  }
  /** Everything the drawer should hold for `date`, from stored records. */
  function summary(date) {
    const s = sessionOn(date); const l = lines(date); const mv = s ? s.movements : [];
    const additions = mv.filter((m) => m.type === 'addition').reduce((a, m) => a + m.amount, 0); const withdrawals = mv.filter((m) => m.type === 'withdrawal').reduce((a, m) => a + m.amount, 0);
    const opening = s ? s.openingCash : 0;
    return Object.assign({ date, opening, additions, withdrawals }, l, { expected: opening + l.cashSales + l.customerPayments + additions - l.cashRefunds - l.cashExpenses - l.supplierPayments - withdrawals });
  }
  /** Cash movement over a date range (for the dashboard): in = sales + customer payments, out = refunds + supplier payments + cash expenses. */
  function flow(from, to) {
    const pays = SS.storage.read('payments').filter((p) => p.method === 'cash').filter((p) => { const d = dayKey(p.createdAt); return d >= from && d <= to; });
    const sum = (kinds) => pays.filter((p) => kinds.includes(p.kind)).reduce((a, p) => a + toInt(p.amount), 0);
    const cashIn = sum(['sale_payment', 'customer_payment']); const expenses = SS.storage.read('expenses').filter((e) => e.status !== 'void' && e.method === 'cash' && e.date >= from && e.date <= to).reduce((a, e) => a + e.amount, 0);
    const out = sum(['sale_refund', 'supplier_payment']) + expenses; return { in: cashIn, out, net: cashIn - out };
  }

  function openSession(date, openingCash) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a date.');
    if (sessionOn(date)) throw new Error('A cash drawer is already recorded for this date.');
    const amount = String(openingCash) === '' ? NaN : toInt(openingCash); if (!(amount >= 0)) throw new Error('Enter the opening cash (0 or more).');
    const rec = SS.storage.collection.insert('cashSessions', { date, status: 'open', openingCash: amount, movements: [], openedAt: Date.now() }, 'csh');
    SS.audit.record('cash.opened', { type: 'cash', id: rec.id, label: date }, null, { openingCash: amount }); return rec;
  }
  function addMovement(id, type, amount, reason) {
    const s = SS.storage.collection.byId('cashSessions', id); if (!s || s.status !== 'open') throw new Error('The cash drawer for this day is closed.');
    const a = toInt(amount); if (!(a > 0)) throw new Error('Enter an amount greater than 0.'); if (!String(reason || '').trim()) throw new Error('A reason is required.');
    if (type === 'withdrawal' && a > summary(s.date).expected) throw new Error('You cannot withdraw more than the expected cash in the drawer (' + formatMMK(summary(s.date).expected) + ').');
    const mv = { id: SS.storage.uid('mov'), type, amount: a, reason: reason.trim(), at: Date.now() };
    const rec = SS.storage.collection.update('cashSessions', id, { movements: s.movements.concat([mv]) }); SS.audit.record('cash.' + type, { type: 'cash', id, label: s.date }, null, { amount: a, reason: mv.reason }); return rec;
  }
  function closeSession(id, counted, note) {
    const s = SS.storage.collection.byId('cashSessions', id); if (!s || s.status !== 'open') throw new Error('This cash drawer is already closed.');
    const c = String(counted) === '' ? NaN : toInt(counted); if (!(c >= 0)) throw new Error('Enter the cash you counted (0 or more).');
    const sum = summary(s.date); const diff = c - sum.expected;
    if (diff !== 0 && !String(note || '').trim()) throw new Error('The count is different from expected. Add a note explaining the difference.');
    const rec = SS.storage.collection.update('cashSessions', id, { status: 'closed', countedCash: c, expectedCash: sum.expected, difference: diff, summary: sum, closeNote: String(note || '').trim(), closedAt: Date.now() });
    SS.audit.record('cash.closed', { type: 'cash', id, label: s.date }, { expected: sum.expected }, { counted: c, difference: diff }); return rec;
  }

  function reportNode(s) {
    const sm = s.summary || summary(s.date); const set = SS.settings.get(); const kv = (a, b, c) => el('div', { class: 'r-row ' + (c || '') }, el('span', null, a), el('span', null, b));
    return el('div', { class: 'receipt w80' }, el('div', { class: 'r-shop' }, set.shopName), el('div', { class: 'r-title' }, 'DAILY CASH CLOSING / ငွေသားပိတ်စာရင်း'), kv('Date', s.date), kv('Opening cash', formatMMK(sm.opening)), kv('+ Cash sales', formatMMK(sm.cashSales)), kv('+ Customer payments', formatMMK(sm.customerPayments)), kv('+ Cash added', formatMMK(sm.additions)),
      kv('− Cash refunds', formatMMK(sm.cashRefunds)), kv('− Cash expenses', formatMMK(sm.cashExpenses)), kv('− Supplier payments', formatMMK(sm.supplierPayments)), kv('− Cash withdrawn', formatMMK(sm.withdrawals)), el('hr'),
      kv('Expected cash', formatMMK(s.expectedCash), 'r-total'), kv('Counted cash', formatMMK(s.countedCash), 'r-total'), kv('Difference', (s.difference > 0 ? '+' : '') + formatMMK(s.difference), 'r-total'), s.closeNote ? el('div', { class: 'r-foot' }, 'Note: ' + s.closeNote) : null,
      el('div', { class: 'r-center r-foot' }, 'Closed ' + formatDate(s.closedAt, true)));
  }

  function page(root) {
    const st = { date: dayKey(Date.now()) }; const view = el('div'); const hist = el('div', { class: 'card', style: 'margin-top:16px' });
    const refresh = () => { draw(); drawHist(); };
    function moneyDialog(s, type) {
      const amt = el('input', { class: 'input', id: 'cmAmt', type: 'number', min: '1', step: '1', inputmode: 'numeric' }); const reason = el('input', { class: 'input', id: 'cmReason' });
      SS.utils.openModal({ title: type === 'addition' ? 'Add cash to drawer' : 'Withdraw cash', body: el('div', null, ui.field('Amount (MMK)', 'cmAmt', amt), ui.field('Reason', 'cmReason', reason)),
        actions: [{ label: SS.i18n.t('cancel') }, { label: SS.i18n.t('save'), kind: 'primary', onClick: () => { try { addMovement(s.id, type, amt.value, reason.value); SS.utils.toast('Recorded.', 'success'); refresh(); } catch (e) { SS.utils.toast(e.message, 'error'); return false; } } }] });
    }
    function closeDialog(s) {
      const sm = summary(s.date); const counted = el('input', { class: 'input', id: 'ccCount', type: 'number', min: '0', step: '1', inputmode: 'numeric' }); const note = el('input', { class: 'input', id: 'ccNote' }); const diff = el('p', { class: 'muted' });
      counted.addEventListener('input', () => { const d = toInt(counted.value) - sm.expected; diff.textContent = counted.value === '' ? '' : d === 0 ? 'Matches expected cash.' : (d > 0 ? 'Over by ' : 'Short by ') + formatMMK(Math.abs(d)) + '. Add a note below.'; });
      SS.utils.openModal({ title: 'Close the day — ' + s.date, body: el('div', null, el('p', null, 'Expected cash in drawer: ', el('strong', null, formatMMK(sm.expected))), ui.field('Counted cash (MMK)', 'ccCount', counted), diff, ui.field('Note (needed if different)', 'ccNote', note), el('p', { class: 'muted small' }, 'After closing, this day cannot be reopened.')),
        actions: [{ label: SS.i18n.t('cancel') }, { label: 'Close day', kind: 'primary', onClick: () => { try { const r = closeSession(s.id, counted.value, note.value); SS.utils.toast('Day closed.', 'success'); refresh(); setTimeout(() => SS.utils.printDocument({ title: 'Closing report ' + r.date, size: '80', sizes: [['80', '80 mm'], ['58', '58 mm']], render: () => reportNode(r) }), 0); } catch (e) { SS.utils.toast(e.message, 'error'); return false; } } }] });
    }
    function draw() {
      clear(view); const s = sessionOn(st.date); const today = dayKey(Date.now());
      const stale = sessions().filter((x) => x.status === 'open' && x.date < today && x.date !== st.date)[0];
      if (stale) view.append(el('div', { class: 'notice' }, `The drawer for ${stale.date} is still open. `, el('button', { class: 'btn sm', type: 'button', onclick: () => { st.date = stale.date; dateIn.value = stale.date; refresh(); } }, 'Go to that day')));
      if (!s) {
        const prev = sessions().filter((x) => x.status === 'closed' && x.date < st.date).sort((a, b) => (a.date < b.date ? 1 : -1))[0]; const open = el('input', { class: 'input', id: 'cmOpen', type: 'number', min: '0', step: '1', inputmode: 'numeric', value: prev ? prev.countedCash : '', placeholder: '0' });
        return view.append(el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', null, 'Open the cash drawer for ' + st.date)), el('p', { class: 'muted' }, prev ? `Suggested from the last closing (${prev.date}): ${formatMMK(prev.countedCash)}.` : 'Count the cash in the drawer and enter it as opening cash.'), ui.field('Opening cash (MMK)', 'cmOpen', open),
          el('button', { class: 'btn primary', type: 'button', onclick: () => { try { openSession(st.date, open.value); SS.utils.toast('Cash drawer opened.', 'success'); refresh(); } catch (e) { SS.utils.toast(e.message, 'error'); } } }, 'Open drawer')));
      }
      const sm = s.status === 'closed' ? s.summary : summary(st.date); const expected = s.status === 'closed' ? s.expectedCash : sm.expected;
      const row = (a, b, c) => el('li', null, el('span', { class: c || '' }, a), el('span', { class: 'num' }, b));
      view.append(el('div', { class: 'grid' },
        el('div', { class: 'col-6' }, el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', null, 'Cash drawer · ' + st.date), s.status === 'closed' ? ui.badge('Closed', 'success') : ui.badge('Open', 'info')),
          el('ul', { class: 'list' }, row('Opening cash', formatMMK(sm.opening)), row('+ Cash sales', formatMMK(sm.cashSales)), row('+ Customer payments (cash)', formatMMK(sm.customerPayments)), row('+ Cash added', formatMMK(sm.additions)), row('− Cash refunds', formatMMK(sm.cashRefunds)), row('− Cash expenses', formatMMK(sm.cashExpenses)), row('− Supplier payments (cash)', formatMMK(sm.supplierPayments)), row('− Cash withdrawn', formatMMK(sm.withdrawals)), row('Expected cash in drawer', el('strong', null, formatMMK(expected)))),
          el('p', { class: 'muted small' }, 'Only cash is counted here. Mobile payments and bank transfers do not go in the drawer.'),
          s.status === 'open' ? el('div', { class: 'btn-row' }, el('button', { class: 'btn', type: 'button', onclick: () => moneyDialog(s, 'addition') }, 'Add cash'), el('button', { class: 'btn', type: 'button', onclick: () => moneyDialog(s, 'withdrawal') }, 'Withdraw cash'), el('button', { class: 'btn primary', type: 'button', onclick: () => closeDialog(s) }, 'Close the day')) : null)),
        el('div', { class: 'col-6' }, el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', null, s.status === 'closed' ? 'Closing result' : 'Cash added / withdrawn')),
          s.status === 'closed' ? el('div', null, el('ul', { class: 'list' }, row('Counted cash', formatMMK(s.countedCash)), row('Expected cash', formatMMK(s.expectedCash)), row('Difference', el('span', { class: 'badge ' + (s.difference === 0 ? 'success' : 'danger') }, (s.difference > 0 ? '+' : '') + formatMMK(s.difference)))), s.closeNote ? el('p', null, 'Note: ' + s.closeNote) : null,
            summary(st.date).expected !== s.expectedCash ? el('div', { class: 'notice' }, 'Cash transactions were recorded for this date after it was closed. Expected cash now would be ' + formatMMK(summary(st.date).expected) + '.') : null,
            el('button', { class: 'btn', type: 'button', onclick: () => SS.utils.printDocument({ title: 'Closing report ' + s.date, size: '80', sizes: [['80', '80 mm'], ['58', '58 mm']], render: () => reportNode(s) }) }, 'Print closing report'))
            : (s.movements.length ? el('ul', { class: 'list' }, s.movements.map((m) => el('li', null, el('span', null, (m.type === 'addition' ? '+ ' : '− ') + m.reason, el('span', { class: 'sub' }, formatDate(m.at, true))), el('span', { class: 'num' }, formatMMK(m.amount))))) : el('div', { class: 'empty' }, 'No manual cash movements today.'))))));
    }
    function drawHist() {
      const rows = sessions().slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      const t = ui.dataTable({ rows, pageSize: 10, empty: { title: 'No reconciliation history yet', hint: 'Closed days appear here with the cash difference.' }, columns: [
        { key: 'date', label: 'Date', render: (s) => el('button', { class: 'link-btn', type: 'button', onclick: () => { st.date = s.date; dateIn.value = s.date; refresh(); } }, s.date) }, { key: 'openingCash', label: 'Opening', num: true, render: (s) => formatMMK(s.openingCash) },
        { key: 'expectedCash', label: 'Expected', num: true, render: (s) => (s.status === 'closed' ? formatMMK(s.expectedCash) : '—') }, { key: 'countedCash', label: 'Counted', num: true, render: (s) => (s.status === 'closed' ? formatMMK(s.countedCash) : '—') },
        { key: 'difference', label: 'Difference', num: true, render: (s) => (s.status === 'closed' ? el('span', { class: 'badge ' + (s.difference === 0 ? 'success' : 'danger') }, (s.difference > 0 ? '+' : '') + formatMMK(s.difference)) : '—') }, { key: 'status', label: 'Status', render: (s) => (s.status === 'closed' ? ui.badge('Closed', 'success') : ui.badge('Open', 'info')) }] });
      clear(hist); hist.append(el('div', { class: 'card-head' }, el('h2', null, 'Reconciliation history')), t.node);
    }
    const dateIn = el('input', { class: 'input', id: 'cmDate', type: 'date', value: st.date, 'aria-label': 'Date' }); dateIn.addEventListener('change', () => { if (dateIn.value) { st.date = dateIn.value; refresh(); } });
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('cash')), el('p', null, 'Count the cash drawer each day and see any difference.')), dateIn), view, hist);
    refresh();
  }

  SS.cash = { summary, flow, sessionOn, openSession, addMovement, closeSession, reportNode };
  SS.pages = SS.pages || {}; SS.pages.cash = page;
})();
