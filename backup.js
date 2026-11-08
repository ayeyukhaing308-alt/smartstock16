/* SmartStock — backup.js (Phase 7)
 * Backup & Restore (JSON), CSV data exports, and the Backup page.
 *
 * Backup file: {app:'SmartStock', format:1, schemaVersion, appVersion, exportedAt, shop, counts:{key:n},
 *               checksum:{alg, value}, data:{<every storage key>}, images:{imageId: dataURL}|null}
 *  - The file is built, then parsed back and its checksum re-checked BEFORE it is saved, so a broken file is never offered.
 *  - A browser page cannot confirm that a normal download was saved. With the File System Access API (Chrome/Edge)
 *    the write is awaited, so success is real ("confirmed"). Otherwise the wording is "download started — check your
 *    Downloads folder" and nothing claims more than that.
 *  - A full backup contains purchase prices (and the PIN hash), so creating or restoring one needs the admin PIN when a PIN is set.
 *  - Restore validates structure, schema version, ids, checksum and links; shows a preview; needs a safety backup of the
 *    current data and a typed confirmation; replaces ALL collections all-or-nothing and verifies the result (otherwise rolls back).
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatDate, toInt } = SS.utils; const ui = SS.ui;
  const FORMAT = 1, MAX_BYTES = 100 * 1024 * 1024;
  const KEYS = () => SS.storage.KEYS;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const isColl = (k) => Array.isArray(SS.storage.DEFAULTS[k]);

  /* ---------- Checksum (SHA-256 when available, otherwise FNV-1a) ---------- */
  async function checksum(data) {
    const ordered = {}; KEYS().forEach((k) => { ordered[k] = data[k]; }); const text = JSON.stringify(ordered);
    if (window.crypto && crypto.subtle && typeof TextEncoder !== 'undefined') {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return { alg: 'sha256', value: Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('') };
    }
    let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return { alg: 'fnv1a', value: h.toString(16).padStart(8, '0') + ':' + text.length };
  }
  const countsOf = (data) => { const c = {}; KEYS().forEach((k) => { c[k] = isColl(k) ? (data[k] || []).length : Object.keys(data[k] || {}).length; }); return c; };
  const totalRecords = (counts) => KEYS().filter(isColl).reduce((a, k) => a + (counts[k] || 0), 0);

  /* ---------- Structure validation (used before export and before restore) ---------- */
  function validateData(data) {
    const errors = [];
    if (!data || typeof data !== 'object' || Array.isArray(data)) return ['The file has no data section.'];
    KEYS().forEach((k) => {
      const v = data[k];
      if (v === undefined) { errors.push(`The "${k}" section is missing — the file is incomplete.`); return; }
      if (isColl(k) ? !Array.isArray(v) : !(v && typeof v === 'object' && !Array.isArray(v))) { errors.push(`The "${k}" section has the wrong type.`); return; }
      if (!isColl(k)) return;
      const seen = new Set();
      v.forEach((r, i) => {
        if (!r || typeof r !== 'object' || Array.isArray(r)) { errors.push(`${k} #${i + 1} is not a record.`); return; }
        if (typeof r.id !== 'string' || !r.id) errors.push(`${k} #${i + 1} has no id.`);
        else if (seen.has(r.id)) errors.push(`${k} has the id ${r.id} twice.`); else seen.add(r.id);
      });
    });
    if (!errors.length) {
      const bad = (list, f) => list.filter((r) => !Number.isFinite(Number(f(r))));
      if (bad(data.sales, (r) => r.total).length) errors.push('Some sales have no valid total.');
      if (bad(data.payments, (r) => r.amount).length) errors.push('Some payments have no valid amount.');
      if (bad(data.products, (r) => r.stock || 0).length) errors.push('Some products have an invalid stock number.');
    }
    return errors.slice(0, 25);
  }

  /* ---------- Build ---------- */
  function dataUrl(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
  async function collectImages() {
    if (!(SS.products && SS.products.images && window.indexedDB)) return { images: null, note: 'Images are not available in this browser.' };
    try { const all = await SS.products.images.all(); const out = {}; for (const i of all) out[i.id] = await dataUrl(i.blob); return { images: out, note: '' }; }
    catch (e) { return { images: null, note: 'Product images could not be read (' + e.message + '); they are NOT in this backup.' }; }
  }
  /** Builds and self-checks the backup. Returns {text, bytes, counts, records, imageCount, note}. Throws a clear Error on failure. */
  async function build() {
    const snap = SS.storage.exportAll(); const data = clone(snap.data);
    const errs = validateData(data); if (errs.length) throw new Error('Your stored data failed validation, so no backup was made: ' + errs.slice(0, 3).join(' '));
    const { images, note } = await collectImages(); const counts = countsOf(data);
    const file = { app: 'SmartStock', format: FORMAT, schemaVersion: SS.storage.SCHEMA_VERSION, appVersion: (data.meta && data.meta.appVersion) || '', exportedAt: Date.now(), shop: SS.settings.get().shopName || '', counts, checksum: await checksum(data), data, images };
    const text = JSON.stringify(file);
    const check = await validate(JSON.parse(text)); if (!check.ok) throw new Error('The backup file failed its own check, so it was not saved: ' + check.errors[0]);
    return { text, bytes: new Blob([text]).size, counts, records: totalRecords(counts), imageCount: images ? Object.keys(images).length : 0, note };
  }

  /* ---------- Validate a parsed backup (file or internal copy) ---------- */
  async function validate(obj, opts) {
    opts = opts || {}; const errors = [], warnings = [];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['This is not a SmartStock backup file.'], warnings, info: null };
    if (obj.app !== 'SmartStock') errors.push('This file was not made by SmartStock.');
    if (!Number.isInteger(obj.schemaVersion) || obj.schemaVersion < 1) errors.push('The file has no valid schema version.');
    else if (obj.schemaVersion > SS.storage.SCHEMA_VERSION) errors.push(`The backup was made by a newer SmartStock (schema ${obj.schemaVersion}; this app understands up to ${SS.storage.SCHEMA_VERSION}). Update the app first.`);
    else for (let v = obj.schemaVersion; v < SS.storage.SCHEMA_VERSION; v++) if (typeof SS.storage.MIGRATIONS[v] !== 'function') errors.push(`No upgrade path from schema ${v} — this backup cannot be used.`);
    if (!opts.internal && obj.format !== FORMAT) errors.push('Unsupported backup format.');
    const dataErrors = validateData(obj.data); errors.push.apply(errors, dataErrors);
    let counts = null;
    if (!dataErrors.length) {
      counts = countsOf(obj.data);
      if (obj.counts) KEYS().forEach((k) => { if (obj.counts[k] !== undefined && obj.counts[k] !== counts[k]) errors.push(`The record count for "${k}" does not match the file header (${obj.counts[k]} expected, ${counts[k]} found) — the file is damaged.`); });
      if (obj.checksum) { const c = await checksum(obj.data); if (c.alg !== obj.checksum.alg) warnings.push('The checksum type is different, so it could not be checked.'); else if (c.value !== obj.checksum.value) errors.push('The checksum does not match — the file was changed or damaged after it was saved.'); }
      else if (!opts.internal) errors.push('The file has no checksum, so it cannot be verified.');
      const issues = SS.storage.checkIntegrity(obj.data); if (issues.length) warnings.push(`${issues.length} link problem(s) inside the backup, e.g. ${issues[0]}`);
    }
    const imgCount = obj.images && typeof obj.images === 'object' ? Object.keys(obj.images).length : 0;
    return { ok: !errors.length, errors: errors.slice(0, 25), warnings, info: { exportedAt: obj.exportedAt, schemaVersion: obj.schemaVersion, shop: obj.shop || '', counts, images: imgCount, needsUpgrade: obj.schemaVersion < SS.storage.SCHEMA_VERSION } };
  }
  /** Reads a File object into a parsed backup. Never throws; returns {obj} or {error}. */
  async function readFile(file) {
    if (!file) return { error: 'Choose a backup file.' };
    if (file.size > MAX_BYTES) return { error: 'The file is larger than 100 MB, which is too big to be a SmartStock backup.' };
    if (file.size === 0) return { error: 'The file is empty.' };
    let text; try { text = await file.text(); } catch (e) { return { error: 'The file could not be read: ' + e.message }; }
    try { return { obj: JSON.parse(text), bytes: file.size }; } catch (e) { return { error: 'The file is not valid JSON (it may be cut off or damaged): ' + e.message }; }
  }

  /* ---------- Save to disk ---------- */
  function stamp() { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: SS.utils.tz(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}`; }
  /** {confirmed, method, cancelled}. confirmed=true only when the file was really written (File System Access API). */
  async function saveFile(filename, text, mime, ext) {
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: ext === 'csv' ? 'CSV file' : 'SmartStock backup', accept: { [mime]: ['.' + ext] } }] });
        const w = await h.createWritable(); await w.write(text); await w.close(); return { confirmed: true, method: 'picker', name: h.name };
      } catch (e) { if (e && e.name === 'AbortError') return { confirmed: false, cancelled: true, method: 'picker' }; /* fall through to download */ }
    }
    const url = URL.createObjectURL(new Blob([text], { type: mime })); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000);
    return { confirmed: false, method: 'download', name: filename };
  }

  /* ---------- Log ---------- */
  function logEntry(e) {
    const meta = SS.storage.object.get('meta'); const log = (meta.backupLog || []).concat([e]).slice(-15);
    const patch = { backupLog: log }; if (e.kind === 'export' || e.kind === 'safety') patch.lastBackup = e;
    SS.storage.object.patch('meta', patch);
  }
  const lastBackup = () => SS.storage.object.get('meta').lastBackup || null;
  const history = () => (SS.storage.object.get('meta').backupLog || []).slice().reverse();

  /** Creates and saves a backup. kind: 'export' | 'safety'. Returns {ok, cancelled?, confirmed, method, records, bytes, ...}; throws on failure. */
  async function create(kind) {
    if (SS.privacy.hasPin() && !(await SS.privacy.requestUnlock())) return { ok: false, cancelled: true };
    const b = await build(); const name = 'smartstock-' + (kind === 'safety' ? 'before-restore-' : 'backup-') + stamp() + '.json';
    const saved = await saveFile(name, b.text, 'application/json', 'json'); if (saved.cancelled) return { ok: false, cancelled: true };
    const entry = { at: Date.now(), kind: kind || 'export', records: b.records, bytes: b.bytes, images: b.imageCount, confirmed: saved.confirmed, method: saved.method, name: saved.name || name };
    logEntry(entry); SS.audit.record('backup.' + (kind === 'safety' ? 'safety' : 'created'), { type: 'backup', id: entry.name, label: entry.name }, null, { records: b.records, bytes: b.bytes, confirmed: saved.confirmed });
    return Object.assign({ ok: true, note: b.note }, entry);
  }

  /* ---------- Restore ---------- */
  const PRE = 'prerestore';   // safety copy of the data that was replaced, kept in browser storage
  function hasUndo() { return SS.storage.hasAux(PRE); }
  /** Replaces all data with the backup. opts.safetyConfirmed must be true (a backup of the current data was already saved). */
  async function restore(obj, opts) {
    opts = opts || {}; if (!opts.safetyConfirmed) throw new Error('Save a backup of your current data first.');
    const v = await validate(obj, { internal: !!opts.internal }); if (!v.ok) throw new Error('This backup cannot be restored: ' + v.errors[0]);
    let internalCopy = false;
    if (!opts.internal) { try { await SS.storage.flush(); await SS.storage.setAux(PRE, SS.storage.exportAll()); internalCopy = true; } catch (e) { internalCopy = false; /* storage full: the saved safety file is the fallback */ } }
    const db = clone(obj.data);
    try { SS.storage.migrateDb(db, obj.schemaVersion, SS.storage.SCHEMA_VERSION); } catch (e) { throw new Error('The backup could not be upgraded: ' + e.message); }
    db.meta = Object.assign({}, db.meta, { schemaVersion: SS.storage.SCHEMA_VERSION });
    const want = await checksum(db); const snap = SS.storage.snapshot(KEYS());
    try {
      SS.storage.replaceAll(db);
      await SS.storage.flush();   // wait until the new data is really stored (one atomic transaction)
      const back = {}; KEYS().forEach((k) => { back[k] = SS.storage.read(k); });
      const got = await checksum(back); if (got.value !== want.value) throw new Error('The data read back after restoring did not match the backup.');
      const stored = await SS.storage.verifyPersisted(); if (!stored.ok) throw new Error('The stored data does not match the backup (' + stored.mismatches.join(', ') + ').');
    } catch (e) {
      SS.storage.restore(snap); try { await SS.storage.flush(); } catch (_) { /* previous data stays in memory; the status badge shows if it is not stored */ }
      throw new Error('Restore failed and your previous data was put back unchanged. ' + e.message);
    }
    SS.privacy.lock();
    const counts = countsOf(db); let imgOk = 0, imgFail = 0;
    if (obj.images && typeof obj.images === 'object' && SS.products && SS.products.images) {
      for (const id of Object.keys(obj.images)) { try { const blob = await (await fetch(obj.images[id])).blob(); await SS.products.images.putAt(id, blob); imgOk++; } catch (e) { imgFail++; } }
    }
    SS.audit.record(opts.internal ? 'backup.undo_restore' : 'backup.restored', { type: 'backup', id: 'restore', label: formatDate(obj.exportedAt, true) }, null, { records: totalRecords(counts), imagesRestored: imgOk, imagesFailed: imgFail });
    logEntry({ at: Date.now(), kind: opts.internal ? 'undo' : 'restore', records: totalRecords(counts), bytes: 0, images: imgOk, confirmed: true, method: 'restore', name: formatDate(obj.exportedAt, true) });
    return { counts, records: totalRecords(counts), images: { restored: imgOk, failed: imgFail, inFile: obj.images ? Object.keys(obj.images).length : 0 }, internalCopy, upgraded: obj.schemaVersion < SS.storage.SCHEMA_VERSION };
  }
  async function undoRestore() {
    let obj; try { obj = await SS.storage.getAux(PRE); } catch (e) { obj = null; }
    if (!obj) throw new Error('There is no copy to go back to.');
    const res = await restore(obj, { safetyConfirmed: true, internal: true }); try { await SS.storage.removeAux(PRE); } catch (e) { /* ignore */ } return res;
  }

  /* ---------- CSV exports of stored data (cost columns only when unlocked) ---------- */
  const when = (ts) => (ts ? formatDate(ts, true) : '');
  const CSVS = [
    ['products', 'Products', () => {
      const cost = SS.privacy.canViewCost(); const cats = Object.fromEntries(SS.storage.read('categories').map((c) => [c.id, c.name]));
      return { header: ['Name', 'SKU', 'Barcode', 'Category', 'Unit', 'Selling price (MMK)', 'Stock', 'Low stock level', 'Status'].concat(cost ? ['Purchase price (MMK)', 'Average cost (MMK)'] : []),
        rows: SS.storage.read('products').map((p) => [p.name, p.sku, p.barcode || '', cats[p.categoryId] || '', SS.inventory.unitOf(p), p.sellingPrice, p.stock, p.lowStockThreshold == null ? '' : p.lowStockThreshold, p.status || 'active'].concat(cost ? [p.purchasePrice, p.avgCost == null ? '' : p.avgCost] : [])) }; }],
    ['inventory', 'Inventory (stock levels)', () => { const v = SS.finance.valuation(); return { header: ['Product', 'Category', 'Stock', 'Unit', 'Retail value (MMK)'].concat(v.locked ? [] : ['Cost value (MMK)']), rows: v.rows.map((x) => [x.name, x.category, x.stock, x.unit, x.retail].concat(v.locked ? [] : [x.cost])) }; }],
    ['sales', 'Sales', () => ({ header: ['Invoice', 'Date', 'Customer', 'Status', 'Subtotal (MMK)', 'Discount (MMK)', 'Tax (MMK)', 'Total (MMK)', 'Paid (MMK)', 'Balance (MMK)', 'Refunded (MMK)', 'Payment method'],
      rows: SS.storage.read('sales').map((s) => [s.number, when(s.createdAt), s.customerName || 'Walk-in', s.status, s.subtotal, s.discountAmount, s.taxAmount, s.total, s.paid, s.balance, s.refundedTotal || 0, s.method]) })],
    ['saleitems', 'Sale items', () => ({ header: ['Invoice', 'Date', 'Product', 'Quantity', 'Refunded qty', 'Unit price (MMK)', 'Discount (MMK)', 'Line total after discount (MMK)'],
      rows: SS.storage.read('sales').flatMap((s) => (s.lines || []).map((l) => [s.number, when(s.createdAt), l.productName, l.qty, l.refundedQty || 0, l.unitPrice, (l.discountAmount || 0) + (l.txnDiscountShare || 0), l.lineNet != null ? l.lineNet : l.lineTotal])) })],
    ['purchases', 'Purchases (totals)', () => ({ header: ['No.', 'Date', 'Supplier', 'Status', 'Total (MMK)', 'Paid (MMK)', 'Owed (MMK)'], rows: SS.storage.read('purchases').map((p) => [p.number, p.date || '', p.supplierName, p.status, p.total, p.paid, p.balance]) })],
    ['customers', 'Customers', () => ({ header: ['Name', 'Phone', 'Address', 'Owes (MMK)', 'Total purchases (MMK)'], rows: SS.storage.read('customers').map((c) => [c.name, c.phone || '', c.address || '', c.outstandingBalance || 0, c.totalPurchases || 0]) })],
    ['suppliers', 'Suppliers', () => ({ header: ['Name', 'Phone', 'Address', 'You owe (MMK)'], rows: SS.storage.read('suppliers').map((s) => [s.name, s.phone || '', s.address || '', s.outstandingBalance || 0]) })],
    ['expenses', 'Expenses', () => ({ header: ['Date', 'Category', 'Description', 'Paid by', 'Amount (MMK)', 'Status'], rows: SS.storage.read('expenses').map((e) => [e.date, e.category, e.description, e.method, e.amount, e.status || 'active']) })],
    ['movements', 'Stock movements', () => { const n = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p.name])); return { header: ['Time', 'Product', 'Type', 'Change', 'Stock after', 'Reason'], rows: SS.storage.read('stockMovements').map((m) => [when(m.createdAt), n[m.productId] || '(deleted)', m.type, m.quantity, m.newStock, m.reason || '']) }; }]
  ];
  async function exportCsv(id) {
    const def = CSVS.find((c) => c[0] === id); const e = def[2]();
    if (!e.rows.length) { SS.utils.toast('There is nothing to export yet for ' + def[1] + '.', 'warning'); return; }
    const text = SS.csv.build(e.header, e.rows); const r = await saveFile('smartstock-' + id + '-' + stamp() + '.csv', text, 'text/csv', 'csv');
    if (r.cancelled) return; SS.utils.toast(r.confirmed ? `${def[1]} CSV saved (${e.rows.length} rows).` : `${def[1]} CSV download started (${e.rows.length} rows) — check your Downloads folder.`, 'success');
  }

  /* ---------- Page ---------- */
  const fmtBytes = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const LABELS = { products: 'Products', categories: 'Categories', sales: 'Sales', purchases: 'Purchases', suppliers: 'Suppliers', customers: 'Customers', expenses: 'Expenses', payments: 'Payments', stockMovements: 'Stock movements', stocktakes: 'Stocktakes', notifications: 'Notification settings', auditLogs: 'Activity log', cashSessions: 'Cash drawer days' };
  const card = (title, ...kids) => el('div', { class: 'card', style: 'margin-bottom:16px' }, el('div', { class: 'card-head' }, el('h2', null, title)), ...kids);

  function previewNode(v, bytes) {
    const cur = countsOf(Object.fromEntries(KEYS().map((k) => [k, SS.storage.read(k)])));
    const info = v.info; const rows = info && info.counts ? KEYS().filter(isColl).map((k) => el('tr', null, el('td', null, LABELS[k] || k), el('td', { class: 'num' }, String(info.counts[k])), el('td', { class: 'num' }, String(cur[k])))) : [];
    return el('div', null,
      v.errors.length ? el('div', { class: 'card', style: 'border-left:4px solid var(--danger);margin-bottom:12px' }, el('strong', null, 'This file cannot be restored'), el('ul', null, v.errors.map((e) => el('li', null, e))), el('p', { class: 'small muted' }, 'Nothing was changed. Choose a different backup file.')) : null,
      v.warnings.length ? el('div', { class: 'card', style: 'border-left:4px solid var(--warning);margin-bottom:12px' }, el('strong', null, 'Notes'), el('ul', null, v.warnings.map((w) => el('li', null, w)))) : null,
      info ? el('ul', { class: 'list' }, el('li', null, el('span', null, 'Backup made'), el('span', null, info.exportedAt ? formatDate(info.exportedAt, true) : 'unknown')), el('li', null, el('span', null, 'Shop'), el('span', null, info.shop || '—')),
        el('li', null, el('span', null, 'Schema version'), el('span', null, String(info.schemaVersion) + (info.needsUpgrade ? ' (will be upgraded)' : ''))), el('li', null, el('span', null, 'File size'), el('span', null, fmtBytes(bytes))), el('li', null, el('span', null, 'Product images in file'), el('span', null, String(info.images)))) : null,
      rows.length ? el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, el('th', null, 'Records'), el('th', { class: 'num' }, 'In backup'), el('th', { class: 'num' }, 'Now in this browser'))), el('tbody', null, rows))) : null);
  }

  function restoreFlow(obj, v, bytes, onDone) {
    const st = { safe: false }; const status = el('p', { class: 'small muted', id: 'rsSafeMsg' }, 'Step 1: save a backup of the data that is in this browser now.'); const typed = el('input', { class: 'input', id: 'rsType', autocomplete: 'off', 'aria-label': 'Type RESTORE' }); const msg = el('div', { class: 'err', role: 'alert', id: 'rsErr' });
    const go = el('button', { class: 'btn danger', type: 'button', id: 'rsGo', disabled: true }, 'Replace my data with this backup');
    const sync = () => { go.disabled = !(st.safe && typed.value.trim().toUpperCase() === 'RESTORE'); }; typed.addEventListener('input', sync);
    const safeBtn = el('button', { class: 'btn', type: 'button', id: 'rsSafe', onclick: async () => {
      safeBtn.disabled = true; msg.textContent = '';
      try { const r = await create('safety'); if (r.cancelled) { safeBtn.disabled = false; return; } st.safe = true; status.textContent = r.confirmed ? `Step 1 done: safety backup saved (${r.records} records).` : `Step 1 done: safety backup download started (${r.records} records). Check your Downloads folder before continuing.`; sync(); }
      catch (e) { msg.textContent = e.message; safeBtn.disabled = false; } } }, 'Save safety backup');
    go.addEventListener('click', async () => {
      go.disabled = true; msg.textContent = '';
      try { const res = await restore(obj, { safetyConfirmed: st.safe }); SS.utils.closeModal(); onDone(res); }
      catch (e) { msg.textContent = e.message; sync(); } });
    SS.utils.openModal({ title: 'Replace all data with this backup?', body: el('div', null,
      el('p', null, 'This replaces EVERYTHING in this browser (products, sales, purchases, customers, settings, history) with the backup from ' + (v.info.exportedAt ? formatDate(v.info.exportedAt, true) : 'the file') + '. Anything recorded after that backup is lost unless you keep the safety backup.'),
      el('div', { class: 'field' }, safeBtn, status),
      el('div', { class: 'field' }, el('label', { for: 'rsType' }, 'Step 2: type RESTORE to confirm'), typed), msg, el('div', { class: 'btn-row' }, go)), actions: [{ label: 'Cancel' }] });
  }

  const pageState = { result: null, file: null, at: 0 };   // survives SS.app.refresh(); dropped when the page is opened again later
  function page(root) {
    if (Date.now() - pageState.at > 20000) { pageState.result = null; pageState.file = null; }
    const body = el('div'); const state = pageState; const touch = () => { state.at = Date.now(); };
    const draw = () => {
      clear(body); const lb = lastBackup(); const hist = history();
      const nowCounts = totalRecords(countsOf(Object.fromEntries(KEYS().map((k) => [k, SS.storage.read(k)]))));
      body.append(
        card('Create a backup', el('p', null, lb ? `Last backup: ${formatDate(lb.at, true)} — ${lb.records} records, ${fmtBytes(lb.bytes)} (${lb.confirmed ? 'file saved' : 'download started'}).` : 'No backup has been made from this browser yet.'),
          el('p', { class: 'small muted' }, `${nowCounts} records are stored now. The backup is one JSON file with all products, sales, purchases, payments, customers, suppliers, expenses, cash days, stock history, activity log, settings and product images. It also contains purchase prices and the PIN hash — keep it somewhere safe${SS.privacy.hasPin() ? ' (the admin PIN is asked before it is made)' : ''}.`),
          el('div', { class: 'btn-row' }, el('button', { class: 'btn primary', type: 'button', id: 'bkCreate', onclick: async (e) => {
            e.target.disabled = true; try { const r = await create('export'); if (!r.cancelled) { SS.utils.toast(r.confirmed ? `Backup saved: ${r.name} (${r.records} records, ${fmtBytes(r.bytes)}).` : `Backup file created (${r.records} records, ${fmtBytes(r.bytes)}) and the download started. Check your Downloads folder — the browser cannot confirm where it was saved.`, 'success'); if (r.note) SS.utils.toast(r.note, 'warning'); } }
            catch (err) { SS.utils.toast('No backup was made. ' + err.message, 'error'); } draw(); } }, 'Create backup file')),
          el('p', { class: 'small muted' }, 'Data is stored in this browser on this device only. A backup file is the way to move data to another device or browser.')),
        card('Restore from a backup', el('p', { class: 'muted' }, 'Choose a SmartStock backup (.json). The file is checked first and you see a preview before anything changes.'),
          el('div', { class: 'field' }, el('label', { for: 'rsFile' }, 'Backup file'), el('input', { class: 'input', type: 'file', id: 'rsFile', accept: '.json,application/json', onchange: async (e) => {
            const f = e.target.files[0]; state.result = null; state.file = null; touch(); if (!f) { draw(); return; }
            const r = await readFile(f); if (r.error) { state.file = { v: { ok: false, errors: [r.error], warnings: [], info: null } }; draw(); return; }
            const v = await validate(r.obj); state.file = { obj: r.obj, v, bytes: r.bytes }; draw(); } })),
          state.file ? previewNode(state.file.v, state.file.bytes || 0) : null,
          state.file && state.file.v.ok ? el('div', { class: 'btn-row' }, el('button', { class: 'btn danger', type: 'button', id: 'rsStart', onclick: async () => { if (SS.privacy.hasPin() && !(await SS.privacy.requestUnlock())) return; restoreFlow(state.file.obj, state.file.v, state.file.bytes, (res) => { state.result = res; state.file = null; touch(); SS.app.refresh(); }); } }, 'Restore this backup…')) : null,
          state.result ? el('div', { class: 'card', style: 'border-left:4px solid var(--success);margin-top:12px' }, el('strong', null, 'Restore complete'), el('p', null, `${state.result.records} records restored${state.result.upgraded ? ' and upgraded to the current schema' : ''}. Product images: ${state.result.images.restored} restored${state.result.images.failed ? ', ' + state.result.images.failed + ' failed' : ''}.`),
            el('p', { class: 'small muted' }, state.result.internalCopy ? 'A copy of the previous data is kept in this browser so you can undo this restore.' : 'There was not enough browser storage to keep an extra copy — use the safety backup file to go back.')) : null,
          hasUndo() ? el('div', { class: 'btn-row', style: 'margin-top:12px' }, el('button', { class: 'btn', type: 'button', id: 'rsUndo', onclick: async () => { const ok = await SS.utils.confirmDialog('Undo the last restore?', 'This puts back the data that was in this browser before the last restore.', 'Undo restore', true); if (!ok) return; try { const r = await undoRestore(); state.result = r; touch(); SS.utils.toast('Previous data restored.', 'success'); SS.app.refresh(); } catch (e) { SS.utils.toast(e.message, 'error'); } } }, 'Undo last restore')) : null),
        card('Export data to CSV', el('p', { class: 'muted' }, 'Spreadsheet-friendly files (UTF-8, opens in Excel). Purchase prices are included only while the admin PIN is unlocked.'),
          el('div', { class: 'btn-row', style: 'flex-wrap:wrap' }, CSVS.map(([id, label]) => el('button', { class: 'btn', type: 'button', 'data-csv': id, onclick: () => exportCsv(id).catch((e) => SS.utils.toast('Export failed: ' + e.message, 'error')) }, label)))),
        card('Backup history', hist.length ? el('ul', { class: 'list' }, hist.map((h) => el('li', null, el('span', null, formatDate(h.at, true) + ' · ' + ({ export: 'Backup', safety: 'Safety backup', restore: 'Restore', undo: 'Undo restore' }[h.kind] || h.kind)), el('span', { class: 'muted small' }, h.records + ' records' + (h.kind === 'export' || h.kind === 'safety' ? (h.confirmed ? ' · saved' : ' · download started') : ''))))) : el('div', { class: 'empty' }, el('strong', null, 'No backups or restores yet'))));
    };
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('backup')), el('p', null, 'Back up everything to a file, restore it, or export spreadsheets.'))), body);
    draw();
  }

  SS.backup = { FORMAT, build, validate, validateData, readFile, create, restore, undoRestore, hasUndo, lastBackup, history, exportCsv, CSVS, saveFile, checksum };
  SS.pages = SS.pages || {}; SS.pages.backup = page;
})();
