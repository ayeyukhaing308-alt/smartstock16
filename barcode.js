/* SmartStock — barcode.js
 * - Internal code generation (unique), duplicate detection, lookup
 * - USB keyboard-wedge scanner capture (fast keystrokes + Enter) -> SS.barcode.onScan handler
 * - Code 39 label rendering (inline SVG) + printable label sheet. No scanner API required.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el } = SS.utils;

  const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();

  function find(code) {
    const c = norm(code); if (!c) return null;
    return SS.storage.read('products').find((p) => (p.barcode && norm(p.barcode) === c) || norm(p.sku) === c) || null;
  }
  /** Returns the product using this barcode/SKU other than exceptId, or null. */
  function conflict(field, value, exceptId) {
    const v = norm(value); if (!v) return null;
    return SS.storage.read('products').find((p) => p.id !== exceptId && norm(p[field]) === v) || null;
  }
  /** Generates a unique internal code: SS + 6 digits, checked against all SKUs and barcodes. */
  function generateInternal() {
    for (let i = 0; i < 1000; i++) {
      const code = 'SS' + String(SS.storage.counter('productCode')).padStart(6, '0');
      if (!conflict('sku', code) && !conflict('barcode', code)) return code;
    }
    throw new Error('Could not generate a unique code.');
  }

  /* ---------- Scanner capture ---------- */
  const scan = { handler: null, buf: '', last: 0 };
  const MAX_GAP = 60;      // ms between keystrokes for a scanner (humans are slower)
  document.addEventListener('keydown', (e) => {
    if (!scan.handler || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (typing) return;                      // inputs with data-scan handle their own Enter
    const now = Date.now();
    if (e.key === 'Enter') {
      if (scan.buf.length >= 3) { const code = scan.buf; scan.buf = ''; e.preventDefault(); scan.handler(code); }
      scan.buf = ''; return;
    }
    if (e.key.length !== 1) return;
    if (now - scan.last > MAX_GAP) scan.buf = '';
    scan.buf += e.key; scan.last = now;
  });

  /* ---------- Code 39 (digits, A–Z, space and - . $ / + %) ---------- */
  const C39 = { '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
    A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
    K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
    U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn' };
  const svgNS = 'http://www.w3.org/2000/svg';
  function code39Supported(text) { return /^[0-9A-Z\-. ]+$/.test(String(text).toUpperCase()); }
  function code39Svg(text) {
    const data = '*' + String(text).toUpperCase() + '*';
    const N = 1, W = 3; let x = 0; const rects = [];
    for (let ci = 0; ci < data.length; ci++) {
      const pat = C39[data[ci]]; if (!pat) return null;
      for (let i = 0; i < 9; i++) {
        const w = pat[i] === 'w' ? W : N;
        if (i % 2 === 0) rects.push([x, w]);
        x += w;
      }
      x += N;   // inter-character gap
    }
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${x} 40`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Barcode ' + text);
    rects.forEach(([rx, rw]) => { const r = document.createElementNS(svgNS, 'rect'); r.setAttribute('x', rx); r.setAttribute('y', 0); r.setAttribute('width', rw); r.setAttribute('height', 40); r.setAttribute('fill', '#000'); svg.appendChild(r); });
    return svg;
  }

  /** Printable label sheet for products (uses barcode, falling back to SKU). */
  function labelSheet(products) {
    const sheet = el('div', { class: 'label-sheet' });
    products.forEach((p) => {
      const code = p.barcode || p.sku; const svg = code39Supported(code) ? code39Svg(code) : null;
      sheet.append(el('div', { class: 'label' }, el('div', { class: 'l-name' }, p.name), svg || el('div', { class: 'small' }, '(code not printable as Code 39)'), el('div', { class: 'l-code' }, code), el('div', { class: 'small' }, SS.utils.formatMMK(p.sellingPrice || 0))));
    });
    return sheet;
  }
  function openLabels(products) {
    if (!products.length) return SS.utils.toast('Select at least one product.', 'warning');
    SS.utils.openModal({ title: 'Barcode labels', body: el('div', null, el('p', { class: 'muted small' }, 'Labels use Code 39, which most USB scanners read by default. Test one label with your scanner before printing a full sheet.'), labelSheet(products)),
      actions: [{ label: 'Close' }, { label: 'Print', kind: 'primary', onClick: () => { window.print(); return false; } }] });
  }

  SS.barcode = { find, conflict, generateInternal, labelSheet, openLabels, code39Supported, onScan(fn) { scan.handler = fn; }, clearScan() { scan.handler = null; } };
})();
