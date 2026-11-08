/* SmartStock — reports.js (Phase 5: financial management)
 * SS.finance = the single place where financial figures are calculated. UI code only displays them.
 *
 * Terms (kept apart everywhere):
 *   Revenue          sales excluding tax, minus refunds                    (what you earned)
 *   Collected cash   money actually received (all methods) / paid out       (what moved)
 *   Profit           revenue − cost of goods sold (gross); − expenses (operating)
 *   Inventory value  stock on hand at retail price (and at cost when unlocked)
 *   Receivables      customers owe you        Payables   you owe suppliers
 *
 * PRIVACY (§38): anything built from purchase prices (cost of goods, profit, margins, inventory cost value)
 * is calculated only when SS.privacy.canViewCost(); otherwise the function returns {locked:true} and no cost
 * figure is ever read, so it cannot leak into a locked view.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatNumber, formatQty, formatDate, toInt, dayKey, addDays, daysBetween } = SS.utils; const ui = SS.ui;
  const LOCKED = () => ({ locked: true });
  const inR = (ts, r) => { const k = dayKey(ts); return k >= r[0] && k <= r[1]; };
  const inD = (d, r) => d >= r[0] && d <= r[1];
  const sum = (a, f) => a.reduce((x, y) => x + (f ? f(y) : y), 0);
  const pct = (a, b) => (b ? Math.round(a * 1000 / b) / 10 : 0);
  const completed = (r) => SS.storage.read('sales').filter((s) => s.status === 'completed' && inR(s.createdAt, r));
  const left = (l) => Math.max(0, (Number(l.qty) || 0) - (Number(l.refundedQty) || 0));
  const lineRevenue = (l) => Math.round((l.lineNet != null ? l.lineNet : l.lineTotal) * left(l) / (l.qty || 1));
  const KINDS_IN = ['sale_payment', 'customer_payment'], KINDS_OUT = ['sale_refund', 'supplier_payment'];

  /* ---------- Sales (no cost data) ---------- */
  function salesSummary(r) {
    const sales = completed(r); let revenue = 0, tax = 0, count = sales.length; const byMethod = {};
    sales.forEach((s) => { const n = SS.sales.net(s); revenue += n.revenue; tax += s.taxAmount - sum(s.refunds || [], (x) => x.tax); (s.payments || []).forEach((p) => { byMethod[p.method] = (byMethod[p.method] || 0) + p.amount; }); });
    return { range: r, count, revenue, tax, average: count ? Math.round(revenue / count) : 0, byMethod,
      expenses: sum(SS.storage.read('expenses').filter((e) => e.status !== 'void' && inD(e.date, r)), (e) => toInt(e.amount)) };
  }

  /* ---------- Profit (PIN-gated) ---------- */
  function profit(r) {
    if (!SS.privacy.canViewCost()) return LOCKED();
    const products = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p]));
    const cats = Object.fromEntries(SS.storage.read('categories').map((c) => [c.id, c.name]));
    const byP = {}, byC = {}; let revenue = 0, cogs = 0;
    completed(r).forEach((s) => {
      const n = SS.sales.net(s); revenue += n.revenue; cogs += n.cogs;
      (s.lines || []).forEach((l) => {
        const q = left(l); if (q <= 0) return;
        const b = byP[l.productId] || (byP[l.productId] = { id: l.productId, name: l.productName || l.productId, units: 0, revenue: 0, cogs: 0 });
        b.units += q; b.revenue += lineRevenue(l); b.cogs += Math.round((l.costSnapshot || 0) * q);
      });
    });
    const rows = Object.values(byP).map((b) => Object.assign(b, { gross: b.revenue - b.cogs, margin: pct(b.revenue - b.cogs, b.revenue) }));
    rows.forEach((b) => { const c = cats[(products[b.id] || {}).categoryId] || 'Uncategorised'; const x = byC[c] || (byC[c] = { name: c, revenue: 0, cogs: 0 }); x.revenue += b.revenue; x.cogs += b.cogs; });
    const expenses = sum(SS.storage.read('expenses').filter((e) => e.status !== 'void' && inD(e.date, r)), (e) => toInt(e.amount));
    const gross = revenue - cogs;
    return { range: r, revenue, cogs, gross, margin: pct(gross, revenue), expenses, operating: gross - expenses, products: rows, categories: Object.values(byC).map((c) => Object.assign(c, { gross: c.revenue - c.cogs, margin: pct(c.revenue - c.cogs, c.revenue) })) };
  }

  /* ---------- Inventory ---------- */
  function valuation() {
    const active = SS.storage.read('products').filter((p) => p.status !== 'archived'); const cats = Object.fromEntries(SS.storage.read('categories').map((c) => [c.id, c.name]));
    const unlocked = SS.privacy.canViewCost();
    const rows = active.map((p) => { const st = Number(p.stock) || 0; const retail = Math.round(st * (p.sellingPrice || 0)); const row = { id: p.id, name: p.name, category: cats[p.categoryId] || 'Uncategorised', stock: st, unit: SS.inventory.unitOf(p), retail };
      if (unlocked) { row.cost = Math.round(st * (p.avgCost != null ? p.avgCost : (p.purchasePrice || 0))); row.potential = retail - row.cost; } return row; });
    const out = { locked: !unlocked, units: sum(rows, (x) => x.stock), retail: sum(rows, (x) => x.retail), rows };
    if (unlocked) { out.cost = sum(rows, (x) => x.cost); out.potential = out.retail - out.cost; }
    return out;
  }
  /** Unit-based turnover (no cost needed): units sold in the period vs stock on hand now. */
  function turnover(r) {
    const days = daysBetween(r[0], r[1]); const sold = {};
    completed(r).forEach((s) => (s.lines || []).forEach((l) => { sold[l.productId] = (sold[l.productId] || 0) + left(l); }));
    return SS.storage.read('products').filter((p) => p.status !== 'archived').map((p) => {
      const st = Number(p.stock) || 0; const u = Math.round((sold[p.id] || 0) * 1000) / 1000;
      return { id: p.id, name: p.name, unit: SS.inventory.unitOf(p), stock: st, sold: u, rate: st > 0 ? Math.round(u / st * 100) / 100 : null, coverDays: u > 0 ? Math.round(st / (u / days)) : null };
    }).sort((a, b) => b.sold - a.sold);
  }
  /** Products in stock with no sale in the last `days` days. */
  function slowMoving(days) {
    days = days || 30; const today = dayKey(Date.now()); const since = addDays(today, -(days - 1)); const last = {};
    SS.storage.read('sales').filter((s) => s.status === 'completed').forEach((s) => (s.lines || []).forEach((l) => { if (left(l) > 0) { const k = dayKey(s.createdAt); if (!last[l.productId] || k > last[l.productId]) last[l.productId] = k; } }));
    return SS.storage.read('products').filter((p) => p.status !== 'archived' && (Number(p.stock) || 0) > 0 && !(last[p.id] && last[p.id] >= since))
      .map((p) => ({ id: p.id, name: p.name, unit: SS.inventory.unitOf(p), stock: Number(p.stock) || 0, retail: Math.round((Number(p.stock) || 0) * (p.sellingPrice || 0)), lastSold: last[p.id] || null, idleDays: last[p.id] ? daysBetween(last[p.id], today) - 1 : null }))
      .sort((a, b) => b.retail - a.retail);
  }

  /* ---------- Receivables / payables ---------- */
  function ageBuckets(items, today) {
    const b = { d30: 0, d60: 0, d60plus: 0 };
    items.forEach(([ts, amt]) => { const age = daysBetween(dayKey(ts), today) - 1; if (age <= 30) b.d30 += amt; else if (age <= 60) b.d60 += amt; else b.d60plus += amt; }); return b;
  }
  function receivables() {
    const today = dayKey(Date.now()); const open = SS.storage.read('sales').filter((s) => s.status === 'completed' && s.balance > 0);
    const rows = SS.storage.read('customers').filter((c) => toInt(c.outstandingBalance) > 0).map((c) => {
      const mine = open.filter((s) => s.customerId === c.id); const oldest = mine.length ? Math.min.apply(null, mine.map((s) => s.createdAt)) : null;
      return { id: c.id, name: c.name, phone: c.phone || '', owed: toInt(c.outstandingBalance), unpaidSales: mine.length, oldest: oldest ? dayKey(oldest) : null, ageDays: oldest ? daysBetween(dayKey(oldest), today) - 1 : null };
    }).sort((a, b) => b.owed - a.owed);
    return { total: sum(rows, (x) => x.owed), rows, aging: ageBuckets(open.map((s) => [s.createdAt, s.balance]), today) };
  }
  function payables() {
    const today = dayKey(Date.now()); const open = SS.storage.read('purchases').filter((p) => p.status === 'confirmed' && p.balance > 0);
    const rows = SS.storage.read('suppliers').filter((s) => toInt(s.outstandingBalance) > 0).map((s) => {
      const mine = open.filter((p) => p.supplierId === s.id); const oldest = mine.length ? mine.map((p) => p.date || dayKey(p.confirmedAt)).sort()[0] : null;
      return { id: s.id, name: s.name, phone: s.phone || '', owed: toInt(s.outstandingBalance), unpaidPurchases: mine.length, oldest, ageDays: oldest ? daysBetween(oldest, today) - 1 : null };
    }).sort((a, b) => b.owed - a.owed);
    return { total: sum(rows, (x) => x.owed), rows, aging: ageBuckets(open.map((p) => [p.confirmedAt || Date.parse((p.date || today) + 'T00:00:00Z'), p.balance]), today) };
  }

  /* ---------- Cash flow (all methods; the drawer itself only counts cash) ---------- */
  function cashFlow(r) {
    const pays = SS.storage.read('payments').filter((p) => inR(p.createdAt, r)); const exps = SS.storage.read('expenses').filter((e) => e.status !== 'void' && inD(e.date, r));
    const methods = {}, daily = {}; const m = (k) => methods[k] || (methods[k] = { method: k, in: 0, out: 0 }); const d = (k) => daily[k] || (daily[k] = { date: k, in: 0, out: 0 });
    const sources = { sales: 0, customerPayments: 0, refunds: 0, supplierPayments: 0, expenses: 0 };
    pays.forEach((p) => { const a = toInt(p.amount); const day = dayKey(p.createdAt);
      if (KINDS_IN.includes(p.kind)) { m(p.method).in += a; d(day).in += a; if (p.kind === 'sale_payment') sources.sales += a; else sources.customerPayments += a; }
      else if (KINDS_OUT.includes(p.kind)) { m(p.method).out += a; d(day).out += a; if (p.kind === 'sale_refund') sources.refunds += a; else sources.supplierPayments += a; } });
    exps.forEach((e) => { const a = toInt(e.amount); m(e.method || 'cash').out += a; d(e.date).out += a; sources.expenses += a; });
    const rows = Object.values(methods).map((x) => Object.assign(x, { net: x.in - x.out })).sort((a, b) => b.in - a.in);
    const total = { in: sum(rows, (x) => x.in), out: sum(rows, (x) => x.out) }; total.net = total.in - total.out;
    return { range: r, methods: rows, daily: Object.values(daily).map((x) => Object.assign(x, { net: x.in - x.out })).sort((a, b) => (a.date < b.date ? -1 : 1)), sources, total, cashOnly: SS.cash.flow(r[0], r[1]) };
  }

  /* ---------- Discounts and refunds ---------- */
  function discountsRefunds(r) {
    const sales = completed(r); let lineDisc = 0, saleDisc = 0, gross = 0; const top = [];
    sales.forEach((s) => { const ld = sum(s.lines || [], (l) => l.discountAmount || 0); lineDisc += ld; saleDisc += s.discountAmount || 0; gross += sum(s.lines || [], (l) => l.gross || 0); if (ld + (s.discountAmount || 0) > 0) top.push({ id: s.id, number: s.number, at: s.createdAt, customer: s.customerName, discount: ld + (s.discountAmount || 0), total: s.total }); });
    const refunds = []; SS.storage.read('sales').forEach((s) => (s.refunds || []).forEach((x) => { if (inR(x.at, r)) refunds.push({ saleId: s.id, number: s.number, at: x.at, type: x.type, amount: x.amount, method: x.method, reason: x.reason, cashOut: x.cashOut }); }));
    refunds.sort((a, b) => b.at - a.at);
    return { range: r, lineDiscounts: lineDisc, saleDiscounts: saleDisc, discounts: lineDisc + saleDisc, discountPct: pct(lineDisc + saleDisc, gross), discountedSales: top.length, top: top.sort((a, b) => b.discount - a.discount).slice(0, 10),
      refunds, refundCount: refunds.length, refundAmount: sum(refunds, (x) => x.amount), refundCash: sum(refunds, (x) => x.cashOut), cancelled: SS.storage.read('sales').filter((s) => s.status === 'cancelled' && s.cancelledAt && inR(s.cancelledAt, r)).length };
  }

  /* ---------- Reconciliation: finds mismatches, never "fixes" them silently ---------- */
  function reconcile() {
    const sales = SS.storage.read('sales'), pays = SS.storage.read('payments'), checks = []; const add = (id, label, issues) => checks.push({ id, label, ok: !issues.length, issues });
    const done = sales.filter((s) => s.status === 'completed' || s.status === 'cancelled');
    // 1 customer balances
    add('customers', 'Customer balances equal their unpaid sales', SS.storage.read('customers').map((c) => { const u = sum(sales.filter((s) => s.customerId === c.id && s.status === 'completed'), (s) => s.balance); return u === toInt(c.outstandingBalance) ? null : `${c.name}: balance ${formatMMK(c.outstandingBalance)} but unpaid sales ${formatMMK(u)}`; }).filter(Boolean));
    // 2 supplier balances
    add('suppliers', 'Supplier balances equal their unpaid purchases', SS.storage.read('suppliers').map((s) => { const u = sum(SS.storage.read('purchases').filter((p) => p.supplierId === s.id && p.status === 'confirmed'), (p) => p.balance); return u === toInt(s.outstandingBalance) ? null : `${s.name}: balance ${formatMMK(s.outstandingBalance)} but unpaid purchases ${formatMMK(u)}`; }).filter(Boolean));
    // 3 each sale: paid + balance − refunds paid out = total − refunds
    add('sale-math', 'Each sale: paid + balance matches total and refunds', done.map((s) => { const rf = s.refunds || []; const lhs = s.paid + s.balance - sum(rf, (x) => x.cashOut); const rhs = s.total - sum(rf, (x) => x.amount); return lhs === rhs ? null : `${s.number}: paid ${formatMMK(s.paid)} + balance ${formatMMK(s.balance)} does not match total ${formatMMK(s.total)} after refunds`; }).filter(Boolean));
    // 4 payment records match each sale
    add('payments', 'Payment records match every sale', done.map((s) => { const got = sum(pays.filter((p) => p.saleId === s.id && KINDS_IN.includes(p.kind)), (p) => toInt(p.amount)); const out = sum(pays.filter((p) => p.saleId === s.id && p.kind === 'sale_refund'), (p) => toInt(p.amount)); const rc = sum(s.refunds || [], (x) => x.cashOut);
      if (got !== s.paid) return `${s.number}: payments recorded ${formatMMK(got)} but sale shows paid ${formatMMK(s.paid)}`; if (out !== rc) return `${s.number}: refund payments ${formatMMK(out)} but refunds paid out ${formatMMK(rc)}`; return null; }).filter(Boolean));
    // 5 stock vs movement history
    const lastMove = {}; SS.storage.read('stockMovements').forEach((m) => { lastMove[m.productId] = m; });
    add('stock', 'Stock on hand equals the latest movement record', SS.storage.read('products').map((p) => { const m = lastMove[p.id]; if (!m) return null; return Math.abs((Number(p.stock) || 0) - m.newStock) < 0.0005 ? null : `${p.name}: stock ${formatQty(p.stock)} but history ends at ${formatQty(m.newStock)}`; }).filter(Boolean));
    // 6 closed cash days
    add('cash', 'Closed cash days still agree with their records', SS.storage.read('cashSessions').filter((c) => c.status === 'closed').map((c) => { const now = SS.cash.summary(c.date).expected; return now === c.expectedCash ? null : `${c.date}: closed with expected ${formatMMK(c.expectedCash)}, records now give ${formatMMK(now)} (something was recorded for that day after closing)`; }).filter(Boolean));
    add('batches', 'Batch quantities add up to stock', SS.storage.read('products').filter((p) => p.trackBatches).map((p) => { const have = sum(p.batches || [], (b) => b.qty); return have > (Number(p.stock) || 0) + 0.0005 ? `${p.name}: batches hold ${formatQty(have)} but stock is ${formatQty(p.stock)}` : null; }).filter(Boolean));
    // 7 unfinished work
    add('pending', 'No interrupted sales or purchases', sales.filter((s) => s.status === 'pending').map((s) => s.number + ' is still pending').concat(SS.storage.read('purchases').filter((p) => p.status === 'confirming').map((p) => p.number + ' is still confirming')));
    // 8 stored data integrity
    add('integrity', 'Stored data links are valid (integrity check)', SS.storage.checkIntegrity());
    return { checks, issueCount: sum(checks, (c) => c.issues.length), ranAt: Date.now() };
  }

  /* ---------- Phase 6 report data (none of these read purchase prices) ---------- */
  /** Revenue per day (per month when the range is long) for this period and the equally long period before it. */
  function salesTrend(r) {
    const len = daysBetween(r[0], r[1]); const prev = [addDays(r[0], -len), addDays(r[0], -1)]; const monthly = len > 92;
    const keyOf = (d) => (monthly ? d.slice(0, 7) : d);
    const labelsFor = (rg) => { const out = []; let d = rg[0]; let guard = 0; while (d <= rg[1] && guard++ < 3700) { const k = keyOf(d); if (!out.length || out[out.length - 1] !== k) out.push(k); d = addDays(d, 1); } return out; };
    const cur = {}, pre = {}; let count = 0, pcount = 0, rev = 0, prev_rev = 0;
    completed(r).forEach((x) => { const n = SS.sales.net(x); const k = keyOf(dayKey(x.createdAt)); cur[k] = (cur[k] || 0) + n.revenue; rev += n.revenue; count++; });
    completed(prev).forEach((x) => { const n = SS.sales.net(x); const k = keyOf(dayKey(x.createdAt)); pre[k] = (pre[k] || 0) + n.revenue; prev_rev += n.revenue; pcount++; });
    const L = labelsFor(r), PL = labelsFor(prev);
    return { range: r, previousRange: prev, labels: L, current: L.map((k) => cur[k] || 0), previous: L.map((k, i) => pre[PL[i]] || 0), monthly,
      revenue: rev, previousRevenue: prev_rev, count, previousCount: pcount, change: prev_rev ? Math.round((rev - prev_rev) * 1000 / prev_rev) / 10 : null };
  }
  function productSales(r) {
    const products = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p])); const cats = Object.fromEntries(SS.storage.read('categories').map((c) => [c.id, c.name])); const by = {};
    completed(r).forEach((x) => (x.lines || []).forEach((l) => { const q = left(l); if (q <= 0) return; const b = by[l.productId] || (by[l.productId] = { id: l.productId, name: l.productName || l.productId, category: cats[(products[l.productId] || {}).categoryId] || 'Uncategorised', units: 0, revenue: 0 }); b.units += q; b.revenue += lineRevenue(l); }));
    return Object.values(by).sort((a, b) => b.revenue - a.revenue);
  }
  function categorySales(r) { const by = {}; productSales(r).forEach((p) => { const c = by[p.category] || (by[p.category] = { id: p.category, name: p.category, units: 0, revenue: 0 }); c.units += p.units; c.revenue += p.revenue; }); return Object.values(by).sort((a, b) => b.revenue - a.revenue); }
  function purchaseReport(r) {
    const rows = SS.storage.read('purchases').filter((p) => p.status === 'confirmed' && inD(p.date || dayKey(p.confirmedAt), r)).map((p) => ({ id: p.id, number: p.number, date: p.date || dayKey(p.confirmedAt), supplier: p.supplierName, total: p.total, paid: p.paid, balance: p.balance })).sort((a, b) => (a.date < b.date ? 1 : -1));
    const bySup = {}; rows.forEach((x) => { const b = bySup[x.supplier] || (bySup[x.supplier] = { id: x.supplier, supplier: x.supplier, count: 0, total: 0, balance: 0 }); b.count++; b.total += x.total; b.balance += x.balance; });
    return { rows, total: sum(rows, (x) => x.total), paid: sum(rows, (x) => x.paid), balance: sum(rows, (x) => x.balance), suppliers: Object.values(bySup).sort((a, b) => b.total - a.total), drafts: SS.storage.read('purchases').filter((p) => p.status === 'draft').length };
  }
  function expenseReport(r) {
    const rows = SS.storage.read('expenses').filter((e) => e.status !== 'void' && inD(e.date, r)); const by = {};
    rows.forEach((e) => { const k = SS.expenses.catLabel ? SS.expenses.catLabel(e.category) : e.category; const b = by[k] || (by[k] = { id: k, category: k, count: 0, total: 0 }); b.count++; b.total += toInt(e.amount); });
    return { rows: rows.slice().sort((a, b) => (a.date < b.date ? 1 : -1)), total: sum(rows, (e) => toInt(e.amount)), categories: Object.values(by).sort((a, b) => b.total - a.total) };
  }
  function movementReport(r) {
    const names = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p.name]));
    return SS.storage.read('stockMovements').filter((m) => inR(m.createdAt, r)).map((m) => ({ id: m.id, at: m.createdAt, product: names[m.productId] || '(deleted)', type: (SS.inventory.TYPES[m.type] || {}).label || m.type, quantity: m.quantity, previousStock: m.previousStock, newStock: m.newStock, reason: m.reason || '' })).sort((a, b) => b.at - a.at);
  }
  function stocktakeReport(r) {
    return SS.storage.read('stocktakes').filter((t) => inR(t.createdAt, r)).map((t) => { const counted = t.lines.filter((l) => l.countedQty != null); const diffs = counted.filter((l) => l.countedQty !== l.systemQty);
      return { id: t.id, number: t.number, name: t.name || '', status: t.status, at: t.createdAt, lines: t.lines.length, counted: counted.length, differences: diffs.length, unitsOver: sum(diffs.filter((l) => l.countedQty > l.systemQty), (l) => l.countedQty - l.systemQty), unitsShort: sum(diffs.filter((l) => l.countedQty < l.systemQty), (l) => l.systemQty - l.countedQty) }; }).sort((a, b) => b.at - a.at);
  }

  /** Batches of tracked products with quantity > 0: expired, near expiry (within N days), or fine. */
  function expiryReport(days) {
    days = days || SS.settings.get().nearExpiryDays || 30; const today = dayKey(Date.now()); const limit = addDays(today, days); const rows = [];
    SS.storage.read('products').filter((p) => p.status !== 'archived' && p.trackBatches).forEach((p) => SS.inventory.batchList(p).forEach((b) => {
      const status = !b.expiry ? 'none' : b.expiry < today ? 'expired' : b.expiry <= limit ? 'near' : 'ok';
      rows.push({ id: p.id + ':' + b.id, productId: p.id, product: p.name, unit: SS.inventory.unitOf(p), batch: b.number, expiry: b.expiry, qty: b.qty, retail: Math.round(b.qty * (p.sellingPrice || 0)), status, daysLeft: b.expiry ? daysBetween(today, b.expiry) - 1 : null });
    }));
    rows.sort((a, b) => (a.expiry || '9999') < (b.expiry || '9999') ? -1 : 1);
    const sumBy = (st) => rows.filter((r) => r.status === st);
    return { days, rows, expired: sumBy('expired'), near: sumBy('near'), expiredRetail: sum(sumBy('expired'), (r) => r.retail), nearRetail: sum(sumBy('near'), (r) => r.retail), tracked: SS.storage.read('products').filter((p) => p.trackBatches && p.status !== 'archived').length };
  }

  SS.finance = { expiryReport, salesSummary, profit, valuation, turnover, slowMoving, receivables, payables, cashFlow, discountsRefunds, reconcile, salesTrend, productSales, categorySales, purchaseReport, expenseReport, movementReport, stocktakeReport };

  /* ================= Reports page ================= */
  const TABS = [['overview', 'Overview'], ['sales', 'Sales'], ['profit', 'Profit'], ['inventory', 'Inventory'], ['purchases', 'Purchases'], ['expenses', 'Expenses'], ['movements', 'Stock movements'], ['stocktake', 'Stocktake'], ['expiry', 'Expiry'], ['receivables', 'Receivables'], ['payables', 'Payables'], ['cashflow', 'Cash flow'], ['reconcile', 'Reconciliation'], ['discounts', 'Discounts & refunds']];
  const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['this_month', 'This month'], ['prev_month', 'Previous month'], ['custom', 'Custom']];
  const st = { preset: 'this_month', from: null, to: null };
  const METHOD = (m) => (SS.sales.methodLabel ? SS.sales.methodLabel(m) : m);
  const card = (title, ...kids) => el('div', { class: 'card', style: 'margin-bottom:16px' }, el('div', { class: 'card-head' }, el('h2', null, title)), ...kids);
  const stat = (label, value, help, cls) => el('div', { class: 'stat ' + (cls || '') }, el('div', { class: 'label' }, label), el('div', { class: 'value' }, value), help ? el('div', { class: 'hint' }, help) : null);
  const grid = (...kids) => el('div', { class: 'stat-grid' }, ...kids);
  const num = (v) => formatMMK(v);
  const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + formatMMK(Math.abs(v));
  const lockedBox = (what) => el('div', { class: 'empty' }, el('strong', null, 'Purchase prices are hidden'), el('p', { class: 'muted' }, what + ' is calculated from purchase prices, so it needs the administrator PIN. It hides again when you leave this page.'),
    el('button', { class: 'btn primary', type: 'button', onclick: async () => { if (await SS.privacy.requestUnlock()) SS.app.refresh(); } }, 'Unlock (admin PIN)'));
  const table = (columns, rows, empty, size) => ui.dataTable({ columns, rows, rowKey: 'id', pageSize: size || 10, empty: { title: empty || 'Nothing to show', hint: ' ' } }).node;

  const tabs = {
    overview(r) {
      const s = salesSummary(r), cf = cashFlow(r), rc = receivables(), pb = payables(), v = valuation(), p = profit(r);
      return el('div', null,
        card('This period', grid(
          stat('Revenue (sales, no tax)', num(s.revenue), s.count + ' sale(s) · average ' + num(s.average)),
          stat('Cash & payments received', num(cf.total.in), 'Money that actually came in (all methods)'),
          p.locked ? stat('Profit', '— hidden —', 'Needs the admin PIN') : stat('Gross profit', num(p.gross), 'Margin ' + p.margin + '%'),
          p.locked ? null : stat('Operating profit', signed(p.operating), 'Gross profit − expenses ' + num(p.expenses)),
          stat('Expenses', num(s.expenses), 'Operating costs, not stock purchases'),
          stat('Net money movement', signed(cf.total.net), 'Received ' + num(cf.total.in) + ' − paid out ' + num(cf.total.out)))),
        card('Right now', grid(
          stat('Inventory value (retail)', num(v.retail), formatNumber(v.units) + ' units on hand'),
          v.locked ? stat('Inventory value (cost)', '— hidden —', 'Needs the admin PIN') : stat('Inventory value (cost)', num(v.cost), 'Potential profit ' + num(v.potential)),
          stat('Receivables', num(rc.total), 'Customers owe you'),
          stat('Payables', num(pb.total), 'You owe suppliers'))),
        el('p', { class: 'small muted' }, 'Revenue is what you sold. Cash received is what came in. A credit sale is revenue now but cash later; a stock purchase is not an expense, it becomes cost of goods when sold.'));
    },

    sales(r) {
      const t = salesTrend(r), s = salesSummary(r), cats = categorySales(r), prods = productSales(r); const chg = t.change == null ? 'No sales in the previous period' : (t.change >= 0 ? '▲ ' : '▼ ') + Math.abs(t.change) + '% vs previous period';
      const methods = Object.entries(s.byMethod).map(([m, v]) => ({ label: METHOD(m), value: v }));
      return el('div', null,
        card('Sales performance', grid(stat('Revenue', num(t.revenue), chg), stat('Previous period', num(t.previousRevenue), t.previousRange[0] + ' → ' + t.previousRange[1]), stat('Sales', String(t.count), 'Previous: ' + t.previousCount), stat('Average sale', num(s.average)))),
        card('Revenue trend' + (t.monthly ? ' (by month)' : ' (by day)'), SS.charts.line({ labels: t.monthly ? t.labels : t.labels.map((d) => d.slice(5)), series: [{ name: 'This period', values: t.current }, { name: 'Previous period', values: t.previous, color: '#9AA5B1' }], label: 'Revenue trend: this period compared with the previous period' })),
        el('div', { class: 'grid' }, el('div', { class: 'col-6' }, card('Revenue by category', SS.charts.donut({ items: cats.map((c) => ({ label: c.name, value: c.revenue })), label: 'Revenue by category' }))), el('div', { class: 'col-6' }, card('Money received by method', SS.charts.donut({ items: methods, label: 'Received by payment method' })))),
        card('Best-selling products', SS.charts.bar({ labels: prods.slice(0, 8).map((p) => p.name), series: [{ name: 'Revenue', values: prods.slice(0, 8).map((p) => p.revenue) }], label: 'Revenue of the best-selling products' })),
        card('Product sales', table([{ key: 'name', label: 'Product', sortValue: (x) => x.name }, { key: 'category', label: 'Category', sortValue: (x) => x.category }, { key: 'units', label: 'Units', num: true, sortValue: (x) => x.units, render: (x) => formatQty(x.units) }, { key: 'revenue', label: 'Revenue', num: true, sortValue: (x) => x.revenue, render: (x) => num(x.revenue) }], prods, 'No sales in this period')),
        card('Category performance', table([{ key: 'name', label: 'Category', sortValue: (x) => x.name }, { key: 'units', label: 'Units', num: true, sortValue: (x) => x.units, render: (x) => formatQty(x.units) }, { key: 'revenue', label: 'Revenue', num: true, sortValue: (x) => x.revenue, render: (x) => num(x.revenue) }], cats, 'No sales in this period')));
    },
    purchases(r) {
      const x = purchaseReport(r);
      return el('div', null, card('Purchases (confirmed)', grid(stat('Purchased', num(x.total), x.rows.length + ' purchase(s)'), stat('Paid to suppliers', num(x.paid)), stat('Still owed', num(x.balance)), stat('Drafts waiting', String(x.drafts), 'Not counted until confirmed')),
        el('p', { class: 'small muted' }, 'Totals only — unit costs stay behind the admin PIN in Purchases.')),
        card('By supplier', table([{ key: 'supplier', label: 'Supplier', sortValue: (c) => c.supplier }, { key: 'count', label: 'Purchases', num: true, sortValue: (c) => c.count }, { key: 'total', label: 'Total', num: true, sortValue: (c) => c.total, render: (c) => num(c.total) }, { key: 'balance', label: 'Owed', num: true, sortValue: (c) => c.balance, render: (c) => num(c.balance) }], x.suppliers, 'No purchases in this period')),
        card('Purchase list', table([{ key: 'number', label: 'No.', sortValue: (c) => c.number }, { key: 'date', label: 'Date', sortValue: (c) => c.date }, { key: 'supplier', label: 'Supplier' }, { key: 'total', label: 'Total', num: true, sortValue: (c) => c.total, render: (c) => num(c.total) }, { key: 'paid', label: 'Paid', num: true, sortValue: (c) => c.paid, render: (c) => num(c.paid) }, { key: 'balance', label: 'Owed', num: true, sortValue: (c) => c.balance, render: (c) => num(c.balance) }], x.rows, 'No purchases in this period')));
    },
    expenses(r) {
      const x = expenseReport(r);
      return el('div', null, card('Expenses', grid(stat('Total expenses', num(x.total), x.rows.length + ' entr' + (x.rows.length === 1 ? 'y' : 'ies')), stat('Largest category', x.categories[0] ? x.categories[0].category : '—', x.categories[0] ? num(x.categories[0].total) : ''))),
        card('By category', SS.charts.donut({ items: x.categories.map((c) => ({ label: c.category, value: c.total })), label: 'Expenses by category' })),
        card('Expense list', table([{ key: 'date', label: 'Date', sortValue: (e) => e.date }, { key: 'category', label: 'Category', render: (e) => (SS.expenses.catLabel ? SS.expenses.catLabel(e.category) : e.category) }, { key: 'description', label: 'Description' }, { key: 'method', label: 'Paid by', render: (e) => METHOD(e.method) }, { key: 'amount', label: 'Amount', num: true, sortValue: (e) => e.amount, render: (e) => num(e.amount) }], x.rows, 'No expenses in this period')));
    },
    movements(r) {
      const rows = movementReport(r);
      return el('div', null, card('Stock movements', el('p', { class: 'muted' }, rows.length + ' movement(s) in this period. Every stock change — sales, purchases, returns, adjustments, stocktakes — is listed here.'),
        table([{ key: 'at', label: 'Time', sortValue: (m) => m.at, render: (m) => formatDate(m.at, true) }, { key: 'product', label: 'Product', sortValue: (m) => m.product }, { key: 'type', label: 'Type', sortValue: (m) => m.type }, { key: 'quantity', label: 'Change', num: true, sortValue: (m) => m.quantity, render: (m) => (m.quantity > 0 ? '+' : '') + formatQty(m.quantity) },
          { key: 'newStock', label: 'Stock after', num: true, sortValue: (m) => m.newStock, render: (m) => formatQty(m.newStock) }, { key: 'reason', label: 'Reason' }], rows, 'No stock movements in this period', 15)));
    },
    expiry() {
      const x = expiryReport(); const badge = (r) => (r.status === 'expired' ? ui.badge('Expired', 'danger') : r.status === 'near' ? ui.badge('Expires in ' + r.daysLeft + ' day(s)', 'warning') : r.status === 'ok' ? ui.badge('OK', 'success') : ui.badge('No expiry', 'info'));
      if (!x.tracked) return el('div', { class: 'card' }, el('div', { class: 'empty' }, el('strong', null, 'No product tracks expiry yet'), 'Turn on "Track batch numbers and expiry dates" when you edit a product.'));
      return el('div', null, card('Expiry overview', grid(stat('Expired stock', String(x.expired.length) + ' batch(es)', 'Retail value ' + num(x.expiredRetail), x.expired.length ? 'warn' : ''), stat('Near expiry (' + x.days + ' days)', String(x.near.length) + ' batch(es)', 'Retail value ' + num(x.nearRetail), x.near.length ? 'warn' : ''), stat('Products tracking expiry', String(x.tracked))),
        el('p', { class: 'small muted' }, 'Expired stock is never sold at the POS. Remove it with Inventory → Adjust stock → "Expired goods". Change the warning period in Settings.')),
        card('Batches', table([{ key: 'product', label: 'Product', sortValue: (r) => r.product }, { key: 'batch', label: 'Batch', sortValue: (r) => r.batch }, { key: 'expiry', label: 'Expiry', sortValue: (r) => r.expiry || '9999', render: (r) => r.expiry || '—' },
          { key: 'qty', label: 'Quantity', num: true, sortValue: (r) => r.qty, render: (r) => formatQty(r.qty) + ' ' + r.unit }, { key: 'retail', label: 'Retail value', num: true, sortValue: (r) => r.retail, render: (r) => num(r.retail) }, { key: 'status', label: 'Status', sortValue: (r) => r.status, render: badge }], x.rows, 'No stock in tracked batches')));
    },
    stocktake(r) {
      const rows = stocktakeReport(r);
      return el('div', null, card('Stocktakes started in this period', table([{ key: 'number', label: 'No.', sortValue: (t) => t.number }, { key: 'name', label: 'Name' }, { key: 'at', label: 'Started', sortValue: (t) => t.at, render: (t) => formatDate(t.at, true) }, { key: 'status', label: 'Status', render: (t) => ui.badge(t.status === 'applied' ? 'Applied' : 'Draft', t.status === 'applied' ? 'success' : 'warning') },
        { key: 'counted', label: 'Counted', num: true, sortValue: (t) => t.counted, render: (t) => t.counted + ' / ' + t.lines }, { key: 'differences', label: 'Differences', num: true, sortValue: (t) => t.differences }, { key: 'unitsShort', label: 'Units short', num: true, sortValue: (t) => t.unitsShort, render: (t) => formatQty(t.unitsShort) }, { key: 'unitsOver', label: 'Units over', num: true, sortValue: (t) => t.unitsOver, render: (t) => formatQty(t.unitsOver) }], rows, 'No stocktakes in this period')));
    },
    profit(r) {
      const p = profit(r); if (p.locked) return lockedBox('Profit');
      const cols = [
        { key: 'name', label: 'Product', sortValue: (x) => x.name }, { key: 'units', label: 'Units', num: true, sortValue: (x) => x.units, render: (x) => formatQty(x.units) },
        { key: 'revenue', label: 'Revenue', num: true, sortValue: (x) => x.revenue, render: (x) => num(x.revenue) }, { key: 'cogs', label: 'Cost of goods', num: true, sortValue: (x) => x.cogs, render: (x) => num(x.cogs) },
        { key: 'gross', label: 'Gross profit', num: true, sortValue: (x) => x.gross, render: (x) => num(x.gross) }, { key: 'margin', label: 'Margin', num: true, sortValue: (x) => x.margin, render: (x) => x.margin + '%' }];
      const byProfit = p.products.slice().sort((a, b) => b.gross - a.gross);
      return el('div', null,
        card('Profit summary', grid(stat('Revenue', num(p.revenue)), stat('Cost of goods sold', num(p.cogs), 'Average cost when each item was sold'), stat('Gross profit', num(p.gross), 'Margin ' + p.margin + '%'), stat('Expenses', num(p.expenses)), stat('Operating profit', signed(p.operating)))),
        card('Product profitability (most profitable first)', table(cols, byProfit, 'No sales in this period')),
        card('Gross profit by category', SS.charts.bar({ labels: p.categories.map((c) => c.name), series: [{ name: 'Gross profit', values: p.categories.map((c) => c.gross) }], label: 'Gross profit by category' })),
        card('By category', table([{ key: 'name', label: 'Category' }, { key: 'revenue', label: 'Revenue', num: true, render: (x) => num(x.revenue) }, { key: 'cogs', label: 'Cost of goods', num: true, render: (x) => num(x.cogs) }, { key: 'gross', label: 'Gross profit', num: true, render: (x) => num(x.gross) }, { key: 'margin', label: 'Margin', num: true, render: (x) => x.margin + '%' }].map((c) => Object.assign(c, { sortValue: (x) => (typeof x[c.key] === 'number' ? x[c.key] : String(x[c.key])) })), p.categories.map((c) => Object.assign({ id: c.name }, c)), 'No sales in this period')),
        el('p', { class: 'small muted' }, 'Refunds are taken off the original sale. Product totals are rounded per line, so they can differ from the summary by a few kyat.'));
    },
    inventory(r) {
      const v = valuation(), tr = turnover(r), sm = slowMoving(30), days = daysBetween(r[0], r[1]);
      const vcols = [{ key: 'name', label: 'Product', sortValue: (x) => x.name }, { key: 'category', label: 'Category', sortValue: (x) => x.category }, { key: 'stock', label: 'Stock', num: true, sortValue: (x) => x.stock, render: (x) => formatQty(x.stock) + ' ' + x.unit }, { key: 'retail', label: 'Retail value', num: true, sortValue: (x) => x.retail, render: (x) => num(x.retail) }]
        .concat(v.locked ? [] : [{ key: 'cost', label: 'Cost value', num: true, sortValue: (x) => x.cost, render: (x) => num(x.cost) }, { key: 'potential', label: 'Potential profit', num: true, sortValue: (x) => x.potential, render: (x) => num(x.potential) }]);
      return el('div', null,
        card('Inventory value', grid(stat('At retail price', num(v.retail), formatNumber(v.units) + ' units'), v.locked ? stat('At cost', '— hidden —', 'Needs the admin PIN') : stat('At cost', num(v.cost)), v.locked ? null : stat('Potential gross profit', num(v.potential), 'If all stock sold at current prices')),
          v.locked ? el('div', { style: 'margin-top:12px' }, lockedBox('Cost value')) : null),
        card('Stock by product', table(vcols, v.rows, 'No products')),
        card('Inventory turnover (' + r[0] + ' → ' + r[1] + ', ' + days + ' day(s))', el('p', { class: 'small muted' }, 'Turnover = units sold ÷ units in stock now. Days of cover = how long current stock lasts at this period’s sales speed.'),
          table([{ key: 'name', label: 'Product', sortValue: (x) => x.name }, { key: 'sold', label: 'Units sold', num: true, sortValue: (x) => x.sold, render: (x) => formatQty(x.sold) }, { key: 'stock', label: 'In stock', num: true, sortValue: (x) => x.stock, render: (x) => formatQty(x.stock) },
            { key: 'rate', label: 'Turnover', num: true, sortValue: (x) => (x.rate == null ? -1 : x.rate), render: (x) => (x.rate == null ? '—' : x.rate + '×') }, { key: 'coverDays', label: 'Days of cover', num: true, sortValue: (x) => (x.coverDays == null ? 1e9 : x.coverDays), render: (x) => (x.coverDays == null ? '—' : x.coverDays) }], tr, 'No products')),
        card('Slow-moving stock (in stock, not sold in 30 days)', table([{ key: 'name', label: 'Product', sortValue: (x) => x.name }, { key: 'stock', label: 'In stock', num: true, sortValue: (x) => x.stock, render: (x) => formatQty(x.stock) + ' ' + x.unit }, { key: 'retail', label: 'Retail value tied up', num: true, sortValue: (x) => x.retail, render: (x) => num(x.retail) },
          { key: 'lastSold', label: 'Last sold', sortValue: (x) => x.lastSold || '', render: (x) => x.lastSold || 'Never sold' }], sm, 'No slow-moving stock')));
    },
    receivables() {
      const x = receivables();
      return el('div', null, card('Money customers owe you', grid(stat('Total receivable', num(x.total)), stat('Up to 30 days', num(x.aging.d30)), stat('31–60 days', num(x.aging.d60)), stat('Over 60 days', num(x.aging.d60plus), 'Chase these first', x.aging.d60plus ? 'warn' : ''))),
        card('By customer', table([{ key: 'name', label: 'Customer', sortValue: (c) => c.name }, { key: 'phone', label: 'Phone' }, { key: 'owed', label: 'Owes', num: true, sortValue: (c) => c.owed, render: (c) => num(c.owed) }, { key: 'unpaidSales', label: 'Unpaid sales', num: true, sortValue: (c) => c.unpaidSales },
          { key: 'oldest', label: 'Oldest unpaid', sortValue: (c) => c.oldest || '', render: (c) => (c.oldest ? c.oldest + ' (' + c.ageDays + ' days)' : '—') }], x.rows, 'Nobody owes you money')));
    },
    payables() {
      const x = payables();
      return el('div', null, card('Money you owe suppliers', grid(stat('Total payable', num(x.total)), stat('Up to 30 days', num(x.aging.d30)), stat('31–60 days', num(x.aging.d60)), stat('Over 60 days', num(x.aging.d60plus), 'Overdue', x.aging.d60plus ? 'warn' : ''))),
        card('By supplier', table([{ key: 'name', label: 'Supplier', sortValue: (c) => c.name }, { key: 'phone', label: 'Phone' }, { key: 'owed', label: 'You owe', num: true, sortValue: (c) => c.owed, render: (c) => num(c.owed) }, { key: 'unpaidPurchases', label: 'Unpaid purchases', num: true, sortValue: (c) => c.unpaidPurchases },
          { key: 'oldest', label: 'Oldest unpaid', sortValue: (c) => c.oldest || '', render: (c) => (c.oldest ? c.oldest + ' (' + c.ageDays + ' days)' : '—') }], x.rows, 'You owe no supplier')));
    },
    cashflow(r) {
      const c = cashFlow(r); const o = c.cashOnly;
      return el('div', null,
        card('Money in and out (all payment methods)', grid(stat('Received', num(c.total.in), 'Sales ' + num(c.sources.sales) + ' · customer payments ' + num(c.sources.customerPayments)), stat('Paid out', num(c.total.out), 'Refunds ' + num(c.sources.refunds) + ' · suppliers ' + num(c.sources.supplierPayments) + ' · expenses ' + num(c.sources.expenses)), stat('Net movement', signed(c.total.net)))),
        card('By payment method', table([{ key: 'method', label: 'Method', sortValue: (x) => x.method, render: (x) => METHOD(x.method) }, { key: 'in', label: 'Received', num: true, sortValue: (x) => x.in, render: (x) => num(x.in) }, { key: 'out', label: 'Paid out', num: true, sortValue: (x) => x.out, render: (x) => num(x.out) }, { key: 'net', label: 'Net', num: true, sortValue: (x) => x.net, render: (x) => signed(x.net) }], c.methods.map((m) => Object.assign({ id: m.method }, m)), 'No money moved in this period')),
        card('Money in and out by day', SS.charts.bar({ labels: c.daily.map((d) => d.date.slice(5)), series: [{ name: 'Received', values: c.daily.map((d) => d.in), color: '#27856A' }, { name: 'Paid out', values: c.daily.map((d) => d.out), color: '#D65353' }], label: 'Money received and paid out by day' })),
        card('By day', table([{ key: 'date', label: 'Date', sortValue: (x) => x.date }, { key: 'in', label: 'Received', num: true, sortValue: (x) => x.in, render: (x) => num(x.in) }, { key: 'out', label: 'Paid out', num: true, sortValue: (x) => x.out, render: (x) => num(x.out) }, { key: 'net', label: 'Net', num: true, sortValue: (x) => x.net, render: (x) => signed(x.net) }], c.daily.map((d) => Object.assign({ id: d.date }, d)), 'No money moved in this period', 15)),
        el('p', { class: 'small muted' }, 'Cash drawer only (matches Cash Management): received ' + num(o.in) + ', paid out ' + num(o.out) + ', net ' + signed(o.net) + '. KBZPay, WavePay, bank etc. are not in the drawer.'));
    },
    reconcile() {
      const x = reconcile();
      return el('div', null, card('Reconciliation', el('p', { class: 'muted' }, x.issueCount ? x.issueCount + ' mismatch(es) found. Nothing was changed — each line says what disagrees so you can find the cause.' : 'All checks agree.'),
        el('ul', { class: 'list' }, x.checks.map((c) => el('li', { style: 'display:block' }, el('div', { style: 'display:flex;justify-content:space-between;gap:12px' }, el('span', null, c.label), ui.badge(c.ok ? 'OK' : c.issues.length + ' issue(s)', c.ok ? 'success' : 'danger')),
          c.ok ? null : el('ul', { class: 'small muted' }, c.issues.slice(0, 20).map((i) => el('li', null, i)), c.issues.length > 20 ? el('li', null, '… and ' + (c.issues.length - 20) + ' more') : null))))),
        el('p', { class: 'small muted' }, 'Checked ' + SS.utils.formatDate(x.ranAt, true) + '. Reconciliation only reports; it never edits records.'));
    },
    discounts(r) {
      const d = discountsRefunds(r);
      return el('div', null, card('Discounts', grid(stat('Total discounts given', num(d.discounts), d.discountPct + '% of gross sales'), stat('Item discounts', num(d.lineDiscounts)), stat('Whole-sale discounts', num(d.saleDiscounts)), stat('Sales with a discount', String(d.discountedSales)))),
        card('Biggest discounts', table([{ key: 'number', label: 'Sale', sortValue: (x) => x.number }, { key: 'at', label: 'Date', sortValue: (x) => x.at, render: (x) => SS.utils.formatDate(x.at, true) }, { key: 'customer', label: 'Customer' }, { key: 'discount', label: 'Discount', num: true, sortValue: (x) => x.discount, render: (x) => num(x.discount) }, { key: 'total', label: 'Sale total', num: true, sortValue: (x) => x.total, render: (x) => num(x.total) }], d.top, 'No discounts in this period')),
        card('Refunds and cancellations (by date refunded)', grid(stat('Refunds', String(d.refundCount), 'Cancelled sales: ' + d.cancelled), stat('Refund value', num(d.refundAmount)), stat('Paid back in money', num(d.refundCash), 'The rest reduced what a customer owed')),
          table([{ key: 'number', label: 'Sale', sortValue: (x) => x.number }, { key: 'at', label: 'Date', sortValue: (x) => x.at, render: (x) => SS.utils.formatDate(x.at, true) }, { key: 'type', label: 'Type', render: (x) => (x.type === 'cancel' ? 'Cancelled' : 'Refund') }, { key: 'amount', label: 'Amount', num: true, sortValue: (x) => x.amount, render: (x) => num(x.amount) }, { key: 'reason', label: 'Reason' }], d.refunds.map((x, i) => Object.assign({ id: x.saleId + i }, x)), 'No refunds in this period')),
        el('p', { class: 'small muted' }, 'Revenue and profit already exclude refunded items (taken off the original sale); this list shows when the refund itself happened.'));
    }
  };

  /* ---------- CSV exports: exactly what the tab shows; cost-based data only when unlocked ---------- */
  const when = (ts) => formatDate(ts, true);
  const EXPORTS = {
    overview(r) { const s = salesSummary(r), cf = cashFlow(r), v = valuation(), p = profit(r); const rows = [['Revenue (no tax)', s.revenue], ['Sales count', s.count], ['Expenses', s.expenses], ['Cash and payments received', cf.total.in], ['Paid out', cf.total.out], ['Net money movement', cf.total.net], ['Inventory value (retail)', v.retail], ['Receivables', receivables().total], ['Payables', payables().total]];
      if (!p.locked) rows.push(['Cost of goods sold', p.cogs], ['Gross profit', p.gross], ['Operating profit', p.operating]); if (!v.locked) rows.push(['Inventory value (cost)', v.cost]); return { header: ['Measure', 'Amount (MMK)'], rows }; },
    sales(r) { return { header: ['Product', 'Category', 'Units', 'Revenue (MMK)'], rows: productSales(r).map((x) => [x.name, x.category, x.units, x.revenue]) }; },
    profit(r) { const p = profit(r); return p.locked ? null : { header: ['Product', 'Units', 'Revenue (MMK)', 'Cost of goods (MMK)', 'Gross profit (MMK)', 'Margin %'], rows: p.products.map((x) => [x.name, x.units, x.revenue, x.cogs, x.gross, x.margin]) }; },
    inventory() { const v = valuation(); return { header: ['Product', 'Category', 'Stock', 'Unit', 'Retail value (MMK)'].concat(v.locked ? [] : ['Cost value (MMK)', 'Potential profit (MMK)']), rows: v.rows.map((x) => [x.name, x.category, x.stock, x.unit, x.retail].concat(v.locked ? [] : [x.cost, x.potential])) }; },
    purchases(r) { return { header: ['No.', 'Date', 'Supplier', 'Total (MMK)', 'Paid (MMK)', 'Owed (MMK)'], rows: purchaseReport(r).rows.map((x) => [x.number, x.date, x.supplier, x.total, x.paid, x.balance]) }; },
    expenses(r) { return { header: ['Date', 'Category', 'Description', 'Paid by', 'Amount (MMK)'], rows: expenseReport(r).rows.map((e) => [e.date, e.category, e.description, e.method, e.amount]) }; },
    movements(r) { return { header: ['Time', 'Product', 'Type', 'Change', 'Stock after', 'Reason'], rows: movementReport(r).map((m) => [when(m.at), m.product, m.type, m.quantity, m.newStock, m.reason]) }; },
    stocktake(r) { return { header: ['No.', 'Name', 'Started', 'Status', 'Lines', 'Counted', 'Differences', 'Units short', 'Units over'], rows: stocktakeReport(r).map((t) => [t.number, t.name, when(t.at), t.status, t.lines, t.counted, t.differences, t.unitsShort, t.unitsOver]) }; },
    receivables() { return { header: ['Customer', 'Phone', 'Owes (MMK)', 'Unpaid sales', 'Oldest unpaid'], rows: receivables().rows.map((x) => [x.name, x.phone, x.owed, x.unpaidSales, x.oldest || '']) }; },
    payables() { return { header: ['Supplier', 'Phone', 'You owe (MMK)', 'Unpaid purchases', 'Oldest unpaid'], rows: payables().rows.map((x) => [x.name, x.phone, x.owed, x.unpaidPurchases, x.oldest || '']) }; },
    cashflow(r) { return { header: ['Date', 'Received (MMK)', 'Paid out (MMK)', 'Net (MMK)'], rows: cashFlow(r).daily.map((d) => [d.date, d.in, d.out, d.net]) }; },
    expiry() { return { header: ['Product', 'Batch', 'Expiry', 'Quantity', 'Retail value (MMK)', 'Status'], rows: expiryReport().rows.map((r) => [r.product, r.batch, r.expiry, r.qty, r.retail, r.status]) }; },
    reconcile() { const x = reconcile(); return { header: ['Check', 'Result', 'Detail'], rows: x.checks.flatMap((c) => (c.ok ? [[c.label, 'OK', '']] : c.issues.map((i) => [c.label, 'Issue', i]))) }; },
    discounts(r) { const d = discountsRefunds(r); return { header: ['Sale', 'Date', 'Type', 'Amount (MMK)', 'Paid back (MMK)', 'Reason'], rows: d.refunds.map((x) => [x.number, when(x.at), x.type, x.amount, x.cashOut, x.reason]) }; }
  };
  function exportCsv(tab, r) {
    const e = EXPORTS[tab](r); if (!e) { SS.utils.toast('Unlock with the admin PIN first — this report contains purchase-price data.', 'warning'); return; }
    if (!e.rows.length) { SS.utils.toast('Nothing to export for this period.', 'warning'); return; }
    const res = SS.csv.download('smartstock-' + tab + '-' + r[0] + '_' + r[1] + '.csv', e.header, e.rows); SS.utils.toast('CSV download started (' + res.rows + ' rows).', 'success');
  }

  function page(root, arg) {
    const tab = TABS.some((t) => t[0] === arg) ? arg : 'overview'; const body = el('div');
    const r = SS.utils.dateRange(st.preset, st.from, st.to);
    const needsRange = !['receivables', 'payables', 'reconcile', 'expiry'].includes(tab);
    const title = TABS.find((x) => x[0] === tab)[1];
    const filters = needsRange ? el('div', { class: 'filters', role: 'group', 'aria-label': 'Period' },
      el('select', { class: 'input', id: 'rpPreset', 'aria-label': 'Period', style: 'width:auto', onchange: (e) => { st.preset = e.target.value; SS.app.refresh(); } }, PRESETS.map(([v, l]) => el('option', Object.assign({ value: v }, v === st.preset ? { selected: true } : {}), l))),
      st.preset === 'custom' ? el('input', { class: 'input', type: 'date', id: 'rpFrom', value: r[0], 'aria-label': 'From', style: 'width:auto', onchange: (e) => { st.from = e.target.value; SS.app.refresh(); } }) : null,
      st.preset === 'custom' ? el('input', { class: 'input', type: 'date', id: 'rpTo', value: r[1], 'aria-label': 'To', style: 'width:auto', onchange: (e) => { st.to = e.target.value; SS.app.refresh(); } }) : null,
      el('span', { class: 'small muted' }, r[0] + ' → ' + r[1])) : null;
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('reports')), el('p', null, 'Revenue, cash, profit, stock value, receivables and payables — each kept separate.')),
        el('div', { class: 'btn-row' }, el('button', { class: 'btn', type: 'button', id: 'rpCsv', onclick: () => exportCsv(tab, r) }, 'Download CSV'), el('button', { class: 'btn', type: 'button', id: 'rpPrint', onclick: () => window.print() }, 'Print'))),
      el('div', { class: 'tabs', role: 'tablist' }, TABS.map(([id, label]) => el('a', { class: 'tab' + (id === tab ? ' active' : ''), href: '#/reports/' + id, role: 'tab' }, label))), ...(filters ? [filters] : []), body);
    try { body.append(tabs[tab](r)); } catch (e) { console.error(e); body.append(el('div', { class: 'empty' }, el('strong', null, 'This report could not be built'), e.message)); }
  }

  SS.pages = SS.pages || {}; SS.pages.reports = page;
})();
