/* SmartStock — products.js
 * Product CRUD + archive, search/filter/sort/pagination, bulk price & stock updates, price history,
 * images (IndexedDB, never Base64 in localStorage), barcode integration.
 * PRIVACY: purchasePrice / avgCost are stripped from every object handed to the UI unless
 * SS.privacy.canViewCost() is true (see view()). Selling prices are always visible.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatQty, toInt, qty, formatDate } = SS.utils;
  const ui = SS.ui;

  const UNITS = [['piece', 'Piece'], ['pack', 'Pack'], ['box', 'Box'], ['bottle', 'Bottle'], ['kg', 'Kilogram'], ['g', 'Gram'], ['l', 'Liter'], ['m', 'Meter'], ['custom', 'Custom unit']];
  const COST_KEYS = ['purchasePrice', 'avgCost'];

  /** The ONLY way UI code should obtain a product: strips cost data when not authorised. */
  function view(p) {
    if (!p) return p;
    const v = Object.assign({}, p);
    if (!SS.privacy.canViewCost()) {
      COST_KEYS.forEach((k) => delete v[k]);
      v.priceHistory = (p.priceHistory || []).filter((h) => h.type === 'selling');
    }
    return v;
  }
  const raw = (id) => SS.storage.collection.byId('products', id);
  const views = () => SS.storage.read('products').map(view);

  /* ---------- Images (IndexedDB) ---------- */
  const images = {
    db() {
      return new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('IndexedDB unavailable'));
        const r = indexedDB.open('smartstock-images', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('images');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    },
    async put(blob) { const db = await images.db(); const id = SS.storage.uid('img'); await new Promise((res, rej) => { const tx = db.transaction('images', 'readwrite'); tx.objectStore('images').put(blob, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); return id; },
    async url(id) { const db = await images.db(); return new Promise((res) => { const rq = db.transaction('images').objectStore('images').get(id); rq.onsuccess = () => res(rq.result ? URL.createObjectURL(rq.result) : null); rq.onerror = () => res(null); }); },
    /** Every stored image as [{id, blob}] (for backups). */
    async all() { const db = await images.db(); return new Promise((res, rej) => { const out = []; const rq = db.transaction('images').objectStore('images').openCursor(); rq.onsuccess = () => { const c = rq.result; if (c) { out.push({ id: c.key, blob: c.value }); c.continue(); } else res(out); }; rq.onerror = () => rej(rq.error); }); },
    /** Stores a blob under a given id (for restore). */
    async putAt(id, blob) { const db = await images.db(); await new Promise((res, rej) => { const tx = db.transaction('images', 'readwrite'); tx.objectStore('images').put(blob, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); },
    async remove(id) { try { const db = await images.db(); db.transaction('images', 'readwrite').objectStore('images').delete(id); } catch (e) { /* ignore */ } },
    /** Downscale to max 320px JPEG so images stay small. */
    shrink(file) {
      return new Promise((res, rej) => {
        const img = new Image(); const u = URL.createObjectURL(file);
        img.onload = () => { const s = Math.min(1, 320 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob((b) => (b ? res(b) : rej(new Error('Image conversion failed'))), 'image/jpeg', 0.8); };
        img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('That file is not a readable image.')); };
        img.src = u;
      });
    }
  };

  /* ---------- Validation & persistence ---------- */
  function validate(d, id) {
    const errs = {};
    if (!d.name.trim()) errs.name = 'Product name is required.';
    if (d.sku.trim() && SS.barcode.conflict('sku', d.sku, id)) errs.sku = 'This SKU is already used by another product.';
    if (d.sku.trim() && SS.barcode.conflict('barcode', d.sku, id)) errs.sku = 'This code is already used as another product’s barcode.';
    if (d.barcode.trim() && SS.barcode.conflict('barcode', d.barcode, id)) errs.barcode = 'This barcode is already assigned to another product.';
    if (d.barcode.trim() && SS.barcode.conflict('sku', d.barcode, id)) errs.barcode = 'This barcode matches another product’s SKU.';
    if (!(toInt(d.sellingPrice) >= 0) || d.sellingPrice === '') errs.sellingPrice = 'Enter the selling price (whole MMK, 0 or more).';
    if (d.purchasePrice != null && d.purchasePrice !== '' && toInt(d.purchasePrice) < 0) errs.purchasePrice = 'Purchase price cannot be negative.';
    if (d.lowStockThreshold !== '' && !(Number(d.lowStockThreshold) >= 0)) errs.lowStockThreshold = 'Threshold must be 0 or more.';
    if (d.unit === 'custom' && !d.customUnit.trim()) errs.customUnit = 'Enter the custom unit name.';
    if (!id && d.openingStock !== '' && !(qty(d.openingStock) >= 0)) errs.openingStock = 'Opening stock must be 0 or more.';
    if (d.trackBatches && !id) { try { SS.inventory.checkBatchInfo({ number: d.batchNumber, expiry: d.expiry, mfg: d.mfg }); } catch (e) { errs.expiry = e.message; } }
    return errs;
  }

  function create(d, imageId) {
    const sku = d.sku.trim() || SS.barcode.generateInternal();
    const hasCost = d.purchasePrice != null && d.purchasePrice !== '';
    const cost = hasCost ? toInt(d.purchasePrice) : 0;
    const rec = SS.storage.collection.insert('products', {
      name: d.name.trim(), sku, barcode: d.barcode.trim(), categoryId: d.categoryId || '', supplierId: d.supplierId || '', brand: d.brand.trim(), unit: d.unit, customUnit: d.customUnit.trim(),
      variant: { size: d.size.trim(), color: d.color.trim(), model: d.model.trim() }, purchasePrice: cost, avgCost: cost, sellingPrice: toInt(d.sellingPrice), stock: 0,
      lowStockThreshold: d.lowStockThreshold === '' ? null : Number(d.lowStockThreshold), description: d.description.trim(), imageId: imageId || '', status: 'active',
      trackBatches: !!d.trackBatches, batches: [],
      priceHistory: [{ type: 'selling', previous: null, next: toInt(d.sellingPrice), at: Date.now() }].concat(hasCost ? [{ type: 'purchase', previous: null, next: cost, at: Date.now() }] : [])
    }, 'prd');
    SS.audit.record('product.created', { type: 'product', id: rec.id, label: rec.name }, null, { name: rec.name, sku, sellingPrice: rec.sellingPrice });
    const open = qty(d.openingStock);
    if (open > 0) SS.inventory.adjust({ productId: rec.id, type: 'opening', quantity: open, reason: 'Opening stock', unitCost: hasCost ? cost : null, batch: d.trackBatches ? { number: d.batchNumber, expiry: d.expiry, mfg: d.mfg } : null });
    return rec;
  }

  function update(id, d, imageId) {
    const before = raw(id); if (!before) throw new Error('Product not found.');
    const patch = {
      name: d.name.trim(), sku: d.sku.trim() || before.sku, barcode: d.barcode.trim(), categoryId: d.categoryId || '', supplierId: d.supplierId || '', brand: d.brand.trim(), unit: d.unit, customUnit: d.customUnit.trim(),
      variant: { size: d.size.trim(), color: d.color.trim(), model: d.model.trim() }, sellingPrice: toInt(d.sellingPrice),
      lowStockThreshold: d.lowStockThreshold === '' ? null : Number(d.lowStockThreshold), description: d.description.trim()
    };
    if (imageId) patch.imageId = imageId;
    if (d.trackBatches !== undefined && !!d.trackBatches !== !!before.trackBatches) {
      patch.trackBatches = !!d.trackBatches; if (!d.trackBatches) patch.batches = [];
      SS.audit.record(d.trackBatches ? 'product.batches_enabled' : 'product.batches_disabled', { type: 'product', id, label: patch.name }, null, { trackBatches: patch.trackBatches });
    }
    const history = (before.priceHistory || []).slice(); const now = Date.now();
    if (patch.sellingPrice !== before.sellingPrice) {
      history.push({ type: 'selling', previous: before.sellingPrice, next: patch.sellingPrice, at: now });
      SS.audit.record('product.price_changed', { type: 'product', id, label: patch.name }, { previousSellingPrice: before.sellingPrice }, { newSellingPrice: patch.sellingPrice });
    }
    // Purchase price is editable only while cost access is unlocked (the field is not even rendered otherwise).
    if (SS.privacy.canViewCost() && d.purchasePrice != null && d.purchasePrice !== '' && toInt(d.purchasePrice) !== before.purchasePrice) {
      const next = toInt(d.purchasePrice);
      history.push({ type: 'purchase', previous: before.purchasePrice, next, at: now });
      SS.audit.record('product.purchase_price_changed', { type: 'product', id, label: patch.name }, { previousPurchasePrice: before.purchasePrice }, { newPurchasePrice: next });
      patch.purchasePrice = next;   // latest purchase price; average cost only moves with real stock receipts
    }
    patch.priceHistory = history;
    const rec = SS.storage.collection.update('products', id, patch);
    SS.audit.record('product.updated', { type: 'product', id, label: rec.name }, { name: before.name, sku: before.sku }, { name: rec.name, sku: rec.sku });
    return rec;
  }

  function setArchived(id, archived) {
    const p = raw(id);
    SS.storage.collection.update('products', id, { status: archived ? 'archived' : 'active' });
    SS.audit.record(archived ? 'product.archived' : 'product.restored', { type: 'product', id, label: p.name });
  }

  /** Bulk selling-price update in ONE write. changes: [{id, price}] */
  function applyPrices(changes) {
    const map = new Map(changes.map((c) => [c.id, c.price])); const now = Date.now(); let n = 0;
    const list = SS.storage.read('products').map((p) => {
      if (!map.has(p.id) || map.get(p.id) === p.sellingPrice) return p;
      n++; SS.audit.record('product.price_changed', { type: 'product', id: p.id, label: p.name }, { previousSellingPrice: p.sellingPrice }, { newSellingPrice: map.get(p.id) });
      return Object.assign({}, p, { sellingPrice: map.get(p.id), updatedAt: now, priceHistory: (p.priceHistory || []).concat([{ type: 'selling', previous: p.sellingPrice, next: map.get(p.id), at: now }]) });
    });
    if (n) SS.storage.write('products', list);
    return n;
  }

  /* ---------- Dialogs ---------- */
  function costSection(initial, formState) {
    const box = el('div', { class: 'cost-box' });
    const draw = () => {
      clear(box);
      if (SS.privacy.canViewCost()) {
        const inp = el('input', { class: 'input', id: 'pPurchase', type: 'number', min: '0', step: '1', value: initial == null ? '' : initial });
        formState.costInput = inp;
        box.append(ui.field('Purchase price (MMK) — admin only', 'pPurchase', inp, 'Never shown to customers, on receipts, or in standard lists.'));
      } else {
        formState.costInput = null;
        const pin = el('input', { class: 'input', type: 'password', inputmode: 'numeric', id: 'pPin', 'aria-label': 'Administrator PIN', style: 'max-width:160px', autocomplete: 'off' });
        const msg = el('span', { class: 'err', role: 'alert' });
        const go = async () => { try { if (await SS.privacy.tryUnlock(pin.value)) draw(); else msg.textContent = 'Incorrect PIN.'; } catch (e) { msg.textContent = e.message; } };
        pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(); } });
        box.append(el('div', { class: 'small muted' }, 'Purchase price is hidden. Enter the administrator PIN to view or set it.'), el('div', { class: 'toolbar', style: 'margin:8px 0 0' }, pin, el('button', { class: 'btn sm', type: 'button', onclick: go }, 'Unlock')), msg);
      }
    };
    draw(); return box;
  }

  function openForm(id, onDone) {
    const cur = id ? view(raw(id)) : null;
    const v = (k, d) => (cur && cur[k] != null ? cur[k] : d);
    const state = { imageBlob: null, costInput: null };
    const i = (idn, val, type, extra) => el('input', Object.assign({ class: 'input', id: idn, type: type || 'text', value: val == null ? '' : val }, extra || {}));
    const f = {
      name: i('pName', v('name', '')), sku: i('pSku', v('sku', '')), barcode: i('pBarcode', v('barcode', ''), 'text', { 'data-scan': '1' }), brand: i('pBrand', v('brand', '')),
      selling: i('pSelling', v('sellingPrice', ''), 'number', { min: '0', step: '1' }), low: i('pLow', cur && cur.lowStockThreshold != null ? cur.lowStockThreshold : '', 'number', { min: '0', step: 'any', placeholder: 'Default: ' + SS.settings.get().lowStockThreshold }),
      open: i('pOpen', '', 'number', { min: '0', step: 'any' }), bNum: i('pBatch', ''), bExp: i('pExpiry', '', 'date'), bMfg: i('pMfg', '', 'date'), custom: i('pCustom', v('customUnit', '')),
      size: i('pSize', cur && cur.variant ? cur.variant.size : ''), color: i('pColor', cur && cur.variant ? cur.variant.color : ''), model: i('pModel', cur && cur.variant ? cur.variant.model : ''),
      desc: el('textarea', { class: 'input', id: 'pDesc' }, v('description', ''))
    };
    const unit = ui.select('pUnit', UNITS, v('unit', 'piece'));
    const cat = ui.select('pCat', [['', '— none —']].concat(SS.categories.options(cur && cur.categoryId).map((c) => [c.id, c.name])), v('categoryId', ''));
    const sups = SS.storage.read('suppliers');
    const sup = ui.select('pSup', [['', sups.length ? '— none —' : '— no suppliers yet (Phase 4) —']].concat(sups.map((s) => [s.id, s.name])), v('supplierId', ''));
    const gen = el('button', { class: 'btn sm', type: 'button', onclick: () => { f.barcode.value = SS.barcode.generateInternal(); } }, 'Generate code');
    const customWrap = ui.field('Custom unit name', 'pCustom', f.custom); const syncUnit = () => { customWrap.style.display = unit.value === 'custom' ? '' : 'none'; }; unit.addEventListener('change', syncUnit); syncUnit();
    const thumb = el('img', { class: 'thumb', alt: '', style: 'display:none' });
    if (cur && cur.imageId) images.url(cur.imageId).then((u) => { if (u) { thumb.src = u; thumb.style.display = ''; } });
    const file = el('input', { type: 'file', accept: 'image/*', id: 'pImg', 'aria-label': 'Product image' });
    file.addEventListener('change', async () => { if (!file.files[0]) return; try { state.imageBlob = await images.shrink(file.files[0]); thumb.src = URL.createObjectURL(state.imageBlob); thumb.style.display = ''; } catch (e) { SS.utils.toast(e.message, 'error'); } });
    const warn = el('div', { class: 'notice', style: 'display:none' }, 'Selling price is below purchase cost.');
    const checkMargin = () => { const c = state.costInput ? toInt(state.costInput.value) : (cur && cur.purchasePrice != null ? cur.purchasePrice : null); warn.style.display = c != null && f.selling.value !== '' && toInt(f.selling.value) < c ? '' : 'none'; };
    f.selling.addEventListener('input', checkMargin);

    const track = el('input', { type: 'checkbox', id: 'pTrack', checked: !!(cur && cur.trackBatches) }); const batchBox = el('div', { class: 'form-grid' }, ui.field('Batch number (opening stock)', 'pBatch', f.bNum), ui.field('Manufacturing date', 'pMfg', f.bMfg), ui.field('Expiry date', 'pExpiry', f.bExp));
    const syncTrack = () => { batchBox.style.display = track.checked && !cur ? '' : 'none'; }; track.addEventListener('change', syncTrack); syncTrack();
    const form = el('form', { novalidate: true },
      el('div', { class: 'form-grid' },
        ui.field('Product name', 'pName', f.name), ui.field('SKU / product code', 'pSku', f.sku, 'Leave blank to generate one automatically.'),
        ui.field('Barcode', 'pBarcode', f.barcode), el('div', { style: 'align-self:end;margin-bottom:14px' }, gen),
        ui.field('Category', 'pCat', cat), ui.field('Brand', 'pBrand', f.brand), ui.field('Unit', 'pUnit', unit), customWrap,
        ui.field('Selling price (MMK)', 'pSelling', f.selling), ui.field('Low-stock threshold', 'pLow', f.low),
        cur ? el('div', { class: 'field' }, el('label', null, 'Current stock'), el('div', null, formatQty(cur.stock) + ' ', el('span', { class: 'small muted' }, '— change it with Adjust stock so the movement is recorded'))) : ui.field('Opening stock', 'pOpen', f.open),
        ui.field('Supplier', 'pSup', sup)),
      costSection(cur ? cur.purchasePrice : '', state), warn,
      el('fieldset', null, el('legend', null, 'Expiry & batches (optional)'), el('label', { class: 'check', for: 'pTrack' }, track, ' Track batch numbers and expiry dates for this product'), el('p', { class: 'small muted' }, 'Stock is then issued earliest-expiry-first (FEFO, changeable in Settings), expired stock is never sold, and near-expiry alerts appear.'), batchBox),
      el('fieldset', null, el('legend', null, 'Variant (optional)'), el('div', { class: 'form-grid' }, ui.field('Size', 'pSize', f.size), ui.field('Color', 'pColor', f.color), ui.field('Model', 'pModel', f.model))),
      ui.field('Description', 'pDesc', f.desc), el('div', { class: 'field' }, el('label', { for: 'pImg' }, 'Image (stored compactly in the browser’s IndexedDB)'), el('div', { class: 'toolbar' }, thumb, file)));
    form.addEventListener('submit', (e) => e.preventDefault());

    SS.utils.openModal({ title: cur ? 'Edit product' : 'New product', body: form, actions: [{ label: SS.i18n.t('cancel') }, { label: SS.i18n.t('save'), kind: 'primary', onClick: () => {
      const d = { name: f.name.value, sku: f.sku.value, barcode: f.barcode.value, brand: f.brand.value, categoryId: cat.value, supplierId: sup.value, unit: unit.value, customUnit: f.custom.value,
        sellingPrice: f.selling.value, purchasePrice: state.costInput ? state.costInput.value : (cur ? undefined : ''), lowStockThreshold: f.low.value, openingStock: f.open.value,
        size: f.size.value, color: f.color.value, model: f.model.value, description: f.desc.value, trackBatches: track.checked, batchNumber: f.bNum.value, expiry: f.bExp.value, mfg: f.bMfg.value };
      const errs = validate(d, id);
      const map = { name: f.name, sku: f.sku, barcode: f.barcode, sellingPrice: f.selling, lowStockThreshold: f.low, customUnit: f.custom, openingStock: f.open, purchasePrice: state.costInput, expiry: f.bExp };
      Object.entries(map).forEach(([k, node]) => { if (node) ui.setError(node, errs[k] || ''); });
      if (Object.keys(errs).length) { const first = Object.keys(errs).map((k) => map[k]).find(Boolean); if (first) first.focus(); return false; }
      const finish = (imageId) => {
        try { const rec = id ? update(id, d, imageId) : create(d, imageId); SS.utils.toast('Product saved: ' + rec.name, 'success'); if (cur && imageId && cur.imageId) images.remove(cur.imageId); if (onDone) onDone(); SS.utils.closeModal(); }
        catch (e) { SS.utils.toast(e.message, 'error'); }
      };
      if (state.imageBlob) images.put(state.imageBlob).then(finish).catch((e) => { SS.utils.toast('Image could not be saved (' + e.message + '). Product saved without it.', 'warning'); finish(null); });
      else finish(null);
      return false;   // dialog closes itself after the (possibly async) save succeeds
    } }] });
    checkMargin();
  }

  function batchBlock(p) {
    const list = SS.inventory.batchList(p); const t = SS.utils.dayKey(Date.now());
    return el('div', null, el('h2', { class: 'small', style: 'margin:12px 0 6px' }, 'Batches & expiry'), list.length ? el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, ['Batch', 'Expiry', 'Quantity'].map((h, i) => el('th', { class: i === 2 ? 'num' : '' }, h)))),
      el('tbody', null, list.map((b) => el('tr', null, el('td', null, b.number), el('td', null, b.expiry ? [b.expiry + ' ', b.expiry < t ? ui.badge('Expired', 'danger') : null] : '—'), el('td', { class: 'num' }, formatQty(b.qty))))))) : el('p', { class: 'muted small' }, 'No stock in any batch.'));
  }

  function openDetails(id, onChange) {
    const p = view(raw(id)); if (!p) return;
    const cat = (SS.categories.all().find((c) => c.id === p.categoryId) || {}).name || '—';
    const canCost = SS.privacy.canViewCost();
    const thumb = el('img', { class: 'thumb', alt: '', style: 'display:none' });
    if (p.imageId) images.url(p.imageId).then((u) => { if (u) { thumb.src = u; thumb.style.display = ''; } });
    const hist = (type) => (p.priceHistory || []).filter((h) => h.type === type).slice().reverse();
    const histTable = (type) => hist(type).length ? el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, ['Date', 'Previous', 'New'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))),
      el('tbody', null, hist(type).map((h) => el('tr', null, el('td', null, formatDate(h.at, true)), el('td', { class: 'num' }, h.previous == null ? '—' : formatMMK(h.previous)), el('td', { class: 'num' }, formatMMK(h.next))))))) : el('p', { class: 'muted small' }, 'No changes recorded.');
    const moves = SS.inventory.movements({ productId: id }).slice(0, 6);
    const row = (a, b) => el('li', null, el('span', { class: 'muted' }, a), el('span', null, b));
    const costBlock = canCost
      ? el('div', { class: 'cost-box' }, el('ul', { class: 'list' }, row('Purchase price', formatMMK(p.purchasePrice || 0)), row('Average cost', formatMMK(p.avgCost != null ? p.avgCost : (p.purchasePrice || 0))),
        row('Margin per unit', formatMMK((p.sellingPrice || 0) - (p.avgCost != null ? p.avgCost : (p.purchasePrice || 0))))), el('h2', { class: 'small', style: 'margin:8px 0' }, 'Purchase price history'), histTable('purchase'), (p.sellingPrice < (p.purchasePrice || 0)) ? ui.badge('Selling price is below purchase cost', 'danger') : null)
      : el('div', { class: 'cost-box small muted' }, 'Purchase price hidden. ', el('button', { class: 'link-btn', type: 'button', onclick: () => SS.privacy.requestUnlock().then((ok) => { if (ok) openDetails(id, onChange); else openDetails(id, onChange); }) }, 'Show with admin PIN'));
    SS.utils.openModal({ title: p.name, body: el('div', { class: 'wide' }, el('div', { class: 'toolbar' }, thumb, el('div', null, ui.badge(p.status === 'archived' ? 'Archived' : 'Active', p.status === 'archived' ? 'warning' : 'success'), el('div', { class: 'small muted' }, 'SKU ' + p.sku + (p.barcode ? ' · Barcode ' + p.barcode : '')))),
      el('ul', { class: 'list' }, row('Category', cat), row('Brand', p.brand || '—'), row('Unit', SS.inventory.unitOf(p) || '—'), row('Variant', [p.variant && p.variant.size, p.variant && p.variant.color, p.variant && p.variant.model].filter(Boolean).join(' / ') || '—'),
        row('Selling price', formatMMK(p.sellingPrice || 0)), row('Stock', formatQty(p.stock) + ' ' + SS.inventory.unitOf(p)), row('Last updated', formatDate(p.updatedAt, true))),
      p.description ? el('p', null, p.description) : null, p.trackBatches ? batchBlock(p) : null, costBlock,
      el('h2', { class: 'small', style: 'margin:12px 0 6px' }, 'Selling price history'), histTable('selling'),
      el('h2', { class: 'small', style: 'margin:12px 0 6px' }, 'Recent stock movements'),
      moves.length ? el('ul', { class: 'list' }, moves.map((m) => el('li', null, el('span', null, formatDate(m.createdAt, true) + ' · ' + (SS.inventory.TYPES[m.type] || {}).label), el('span', null, (m.quantity > 0 ? '+' : '') + formatQty(m.quantity))))) : el('p', { class: 'muted small' }, 'No movements yet.')),
      actions: [{ label: 'Close' }, { label: 'Adjust stock', onClick: () => { setTimeout(() => SS.inventory.openAdjustDialog(id, onChange), 0); } }, { label: 'Edit', kind: 'primary', onClick: () => { setTimeout(() => openForm(id, onChange), 0); } }] });
  }

  function openBulkPrice(ids, onDone) {
    if (!ids.length) return SS.utils.toast('Select products first (use the checkboxes).', 'warning');
    const mode = ui.select('bpMode', [['pct', 'Change by percentage (%)'], ['amt', 'Change by amount (MMK)'], ['set', 'Set exact price (MMK)']], 'pct');
    const val = el('input', { class: 'input', id: 'bpVal', type: 'number', step: 'any', placeholder: 'e.g. 10 or -5' });
    const round = ui.select('bpRound', [['1', 'Nearest 1 MMK'], ['10', 'Nearest 10 MMK'], ['50', 'Nearest 50 MMK'], ['100', 'Nearest 100 MMK']], '50');
    const preview = el('p', { class: 'muted small' });
    const compute = () => ids.map((id) => { const p = raw(id); const n = Number(val.value); const r = Number(round.value); let price = mode.value === 'pct' ? p.sellingPrice * (1 + n / 100) : mode.value === 'amt' ? p.sellingPrice + n : n; price = Math.max(0, Math.round(price / r) * r); return { id, price, name: p.name, from: p.sellingPrice }; });
    const upd = () => { const c = compute().filter((x) => val.value !== '' && x.price !== x.from); preview.textContent = val.value === '' ? '' : `${c.length} of ${ids.length} product(s) will change. Example: ${c[0] ? c[0].name + ' ' + formatMMK(c[0].from) + ' → ' + formatMMK(c[0].price) : 'no change'}`; };
    [mode, val, round].forEach((n) => n.addEventListener('input', upd));
    SS.utils.openModal({ title: `Bulk price update (${ids.length} products)`, body: el('div', null, ui.field('Method', 'bpMode', mode), ui.field('Value', 'bpVal', val), ui.field('Round to', 'bpRound', round), preview),
      actions: [{ label: SS.i18n.t('cancel') }, { label: 'Apply', kind: 'primary', onClick: () => {
        if (val.value === '' || !Number.isFinite(Number(val.value))) { SS.utils.toast('Enter a value.', 'warning'); return false; }
        try { const n = applyPrices(compute()); SS.utils.toast(n + ' price(s) updated.', 'success'); onDone(); } catch (e) { SS.utils.toast(e.message, 'error'); return false; }
      } }] });
  }

  function openBulkStock(ids, onDone) {
    if (!ids.length) return SS.utils.toast('Select products first (use the checkboxes).', 'warning');
    const manual = Object.entries(SS.inventory.TYPES).filter(([, v]) => v.manual && v.sign !== 0).map(([k, v]) => [k, v.label]);
    const type = ui.select('bsType', manual, 'addition'); const q = el('input', { class: 'input', id: 'bsQty', type: 'number', min: '0', step: 'any' }); const reason = el('input', { class: 'input', id: 'bsReason' });
    SS.utils.openModal({ title: `Bulk stock adjustment (${ids.length} products)`, body: el('div', null, el('p', { class: 'muted small' }, 'The same quantity is applied to every selected product. Products that would go negative are skipped and reported.'), ui.field('Type', 'bsType', type), ui.field('Quantity each', 'bsQty', q), ui.field('Reason', 'bsReason', reason)),
      actions: [{ label: SS.i18n.t('cancel') }, { label: 'Apply', kind: 'primary', onClick: () => {
        if (!reason.value.trim() || !qty(q.value)) { SS.utils.toast('Quantity and reason are required.', 'warning'); return false; }
        let ok = 0; const failed = [];
        ids.forEach((id) => { try { SS.inventory.adjust({ productId: id, type: type.value, quantity: q.value, reason: reason.value }); ok++; } catch (e) { failed.push((raw(id) || {}).name + ': ' + e.message); } });
        SS.utils.toast(`${ok} updated${failed.length ? ', ' + failed.length + ' skipped' : ''}.`, failed.length ? 'warning' : 'success');
        if (failed.length) console.warn('Bulk stock skipped:', failed); onDone();
      } }] });
  }

  /* ---------- Page ---------- */
  function page(root) {
    const st = { search: '', cat: '', stock: '', archived: 'active' };
    const cats = () => Object.fromEntries(SS.categories.all().map((c) => [c.id, c.name]));
    const holder = el('div', { class: 'card' }); let selected = []; let table = null;
    const bulkInfo = el('span', { class: 'small muted' });

    function rows() {
      const q = st.search.toLowerCase();
      return views().filter((p) => (st.archived === 'all' || (p.status || 'active') === st.archived) && (!st.cat || p.categoryId === st.cat) && (!st.stock || SS.inventory.stockStatus(p) === st.stock)
        && (!q || (p.name + ' ' + p.sku + ' ' + (p.barcode || '') + ' ' + (p.brand || '')).toLowerCase().includes(q)));
    }
    function draw() {
      const cn = cats();
      table = ui.dataTable({ rows: rows(), pageSize: 15, selectable: true, onSelect: (s) => { selected = s; bulkInfo.textContent = s.length ? s.length + ' selected' : ''; }, empty: { title: 'No products found', hint: 'Add your first product with “+ New product”, or adjust the filters.' }, columns: [
        { key: 'name', label: 'Product', render: (p) => el('span', null, el('button', { class: 'link-btn', type: 'button', onclick: () => openDetails(p.id, draw) }, p.name), el('span', { class: 'sub' }, [p.brand, p.variant && [p.variant.size, p.variant.color, p.variant.model].filter(Boolean).join('/')].filter(Boolean).join(' · '))) },
        { key: 'sku', label: 'SKU / Barcode', render: (p) => el('span', null, p.sku, p.barcode ? el('span', { class: 'sub' }, p.barcode) : null) },
        { key: 'cat', label: 'Category', sortValue: (p) => cn[p.categoryId] || '', render: (p) => cn[p.categoryId] || '—' },
        { key: 'sellingPrice', label: 'Selling price', num: true, render: (p) => formatMMK(p.sellingPrice || 0) },
        { key: 'stock', label: 'Stock', num: true, sortValue: (p) => Number(p.stock) || 0, render: (p) => formatQty(p.stock) + ' ' + SS.inventory.unitOf(p) },
        { key: 'status', label: 'Status', sortValue: (p) => (p.status === 'archived' ? 'z' : SS.inventory.stockStatus(p)), render: (p) => p.status === 'archived' ? ui.badge('Archived', 'warning') : { out: ui.badge('Out', 'danger'), low: ui.badge('Low', 'warning'), ok: ui.badge('In stock', 'success') }[SS.inventory.stockStatus(p)] },
        { key: 'act', label: '', sortable: false, render: (p) => el('div', { class: 'row-actions' }, el('button', { class: 'btn sm', type: 'button', onclick: () => openForm(p.id, draw) }, 'Edit'),
          el('button', { class: 'btn sm', type: 'button', onclick: async () => { const a = p.status !== 'archived'; if (a && !(await SS.utils.confirmDialog('Archive product?', `“${p.name}” will be hidden from lists and POS but stays in all past sales and reports.`, 'Archive'))) return; setArchived(p.id, a); draw(); } }, p.status === 'archived' ? 'Restore' : 'Archive')) }] });
      clear(holder); holder.append(table.node);
    }
    const search = el('input', { class: 'input grow', type: 'search', placeholder: 'Search name, SKU or barcode…', 'aria-label': 'Search products', 'data-scan': '1' });
    search.addEventListener('input', SS.utils.debounce(() => { st.search = search.value; draw(); }, 150));
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const hit = SS.barcode.find(search.value); if (hit) { e.preventDefault(); openDetails(hit.id, draw); } } });
    const catSel = ui.select('fCat', [['', 'All categories']].concat(SS.categories.all().map((c) => [c.id, c.name])), ''); const stockSel = ui.select('fStock', [['', 'All stock levels'], ['ok', 'In stock'], ['low', 'Low stock'], ['out', 'Out of stock']], '');
    const archSel = ui.select('fArch', [['active', 'Active'], ['archived', 'Archived'], ['all', 'All']], 'active');
    catSel.addEventListener('change', () => { st.cat = catSel.value; draw(); }); stockSel.addEventListener('change', () => { st.stock = stockSel.value; draw(); }); archSel.addEventListener('change', () => { st.archived = archSel.value; draw(); });
    SS.barcode.onScan((code) => { const hit = SS.barcode.find(code); if (hit) openDetails(hit.id, draw); else SS.utils.toast('No product with code ' + code + '. Use “+ New product” to add it.', 'warning'); });

    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('products')), el('p', null, 'Selling prices only — purchase prices stay hidden here.')),
      el('div', { class: 'btn-row' }, el('button', { class: 'btn primary', type: 'button', onclick: () => openForm(null, draw) }, '+ New product'))),
      el('div', { class: 'toolbar' }, search, catSel, stockSel, archSel),
      el('div', { class: 'toolbar' }, el('button', { class: 'btn sm', type: 'button', onclick: () => openBulkPrice(selected, draw) }, 'Bulk price update'), el('button', { class: 'btn sm', type: 'button', onclick: () => openBulkStock(selected, draw) }, 'Bulk stock adjust'),
        el('button', { class: 'btn sm', type: 'button', onclick: () => SS.barcode.openLabels(selected.map((id) => raw(id)).filter(Boolean).map(view)) }, 'Print barcode labels'), bulkInfo), holder);
    draw();
  }

  /** Records the latest invoice price after a purchase is confirmed (history + audit). Authorised callers only (purchases module). */
  function recordPurchasePrice(id, price) {
    const before = raw(id); if (!before || before.purchasePrice === price) return;
    const history = (before.priceHistory || []).concat([{ type: 'purchase', previous: before.purchasePrice == null ? null : before.purchasePrice, next: price, at: Date.now() }]);
    SS.storage.collection.update('products', id, { purchasePrice: price, priceHistory: history });
    SS.audit.record('product.purchase_price_changed', { type: 'product', id, label: before.name }, { previousPurchasePrice: before.purchasePrice }, { newPurchasePrice: price });
  }

  SS.products = { recordPurchasePrice, view, openForm, openDetails, validate, create, update, setArchived, applyPrices, images, UNITS };
  SS.pages = SS.pages || {}; SS.pages.products = page;
})();
