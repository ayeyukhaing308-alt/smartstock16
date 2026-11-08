/* SmartStock — utils.js
 * Shared helpers: namespace, i18n, MMK formatting, dates, safe DOM, toast, modal.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});

  /* ---------- i18n (Burmese-first, English support) ---------- */
  const DICT = {
    my: {
      search_placeholder: 'ရှာဖွေရန်…',
      dashboard: 'ဒက်ရှ်ဘုတ်', products: 'ကုန်ပစ္စည်းများ', categories: 'အမျိုးအစားများ', inventory: 'လက်ကျန်ပစ္စည်း',
      stocktake: 'စတော့ရေတွက်ခြင်း', sales: 'ရောင်းချမှု / POS', purchases: 'ဝယ်ယူမှုများ', suppliers: 'ပေးသွင်းသူများ',
      customers: 'ဖောက်သည်များ', expenses: 'အသုံးစရိတ်များ', cash: 'ငွေသားစီမံခန့်ခွဲမှု', reports: 'အစီရင်ခံစာနှင့် ခွဲခြမ်းစိတ်ဖြာမှု',
      notifications: 'အသိပေးချက်များ', activity: 'လုပ်ဆောင်ချက်မှတ်တမ်း', backup: 'အရန်သိမ်းခြင်းနှင့် ပြန်လည်ရယူခြင်း', settings: 'ဆက်တင်များ',
      online: 'အွန်လိုင်း', offline: 'အော့ဖ်လိုင်း',
      today: 'ယနေ့', yesterday: 'မနေ့က', last7: 'ရက် ၇ ရက်', last30: 'ရက် ၃၀', this_month: 'ဤလ', prev_month: 'ပြီးခဲ့သောလ', custom: 'စိတ်ကြိုက်',
      save: 'သိမ်းမည်', cancel: 'မလုပ်တော့ပါ', confirm: 'အတည်ပြုမည်'
    },
    en: {
      search_placeholder: 'Search…',
      dashboard: 'Dashboard', products: 'Products', categories: 'Categories', inventory: 'Inventory', stocktake: 'Stock Take',
      sales: 'Sales / POS', purchases: 'Purchases', suppliers: 'Suppliers', customers: 'Customers', expenses: 'Expenses',
      cash: 'Cash Management', reports: 'Reports & Analytics', notifications: 'Notifications', activity: 'Activity Log',
      backup: 'Backup & Restore', settings: 'Settings',
      online: 'Online', offline: 'Offline',
      today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 days', last30: 'Last 30 days', this_month: 'This month', prev_month: 'Previous month', custom: 'Custom',
      save: 'Save', cancel: 'Cancel', confirm: 'Confirm'
    }
  };
  let lang = 'my';

  /* Phrase translation (English source text -> Burmese). The app's screens are written in English; when the language
   * is Burmese every text that reaches the screen goes through tr(): el() text nodes and label attributes, toasts,
   * dialogs, validation messages. Entries are exact texts, or templates where {} stands for a changing value
   * ("{} of {} counted"); in the Burmese side {} / {1} {2} put the values back, and the values are translated too.
   * Text with no entry is shown unchanged (English) - see the coverage test. Data typed by the user is never in the
   * dictionary, so it is never changed (only a name identical to a whole UI phrase would be). */
  const PH = {}, BUCKET = {}, LEAD = []; const memo = new Map();
  const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function addPhrases(map) {
    const touched = new Set();
    Object.keys(map).forEach((en) => {
      const my = map[en];
      if (en.indexOf('{}') < 0) { PH[en] = my; return; }
      const parts = en.split('{}'); const p = { re: new RegExp('^' + parts.map(escRe).join('([\\s\\S]*?)') + '$'), my, len: en.length };
      const k = parts[0].length >= 3 ? parts[0].slice(0, 3) : null;
      if (k) { (BUCKET[k] = BUCKET[k] || []).push(p); touched.add(k); } else { LEAD.push(p); }
    });
    touched.forEach((k) => BUCKET[k].sort((a, b) => b.len - a.len)); LEAD.sort((a, b) => b.len - a.len); memo.clear();
  }
  function fromPattern(core) {
    const cand = (BUCKET[core.slice(0, 3)] || []).concat(LEAD);
    for (let i = 0; i < cand.length; i++) {
      const mm = cand[i].re.exec(core);
      if (mm) { let seq = 0; return cand[i].my.replace(/\{(\d*)\}/g, (_, d) => tr(mm[(d ? Number(d) : ++seq)])); }
    }
    return undefined;
  }
  function lookup(s) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s); const core = m[2]; if (!core) return s;
    let r = PH[core]; if (r === undefined) r = fromPattern(core);
    return r === undefined ? s : m[1] + r + m[3];
  }
  function tr(s) {
    if (lang !== 'my' || typeof s !== 'string' || s.length < 2 || !/[A-Za-z]/.test(s)) return s;
    let v = memo.get(s); if (v !== undefined) return v;
    v = lookup(s); if (memo.size > 8000) memo.clear(); memo.set(s, v); return v;
  }
  const TR_ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'label'];
  /* Safety net for text put on the screen without el() (textContent, innerHTML, SVG text): translated after the fact. */
  function watch(root) {
    if (typeof MutationObserver !== 'function' || !root) return;
    const fixText = (n) => { if (n.parentNode && /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName)) return; const t = tr(n.data); if (t !== n.data) n.data = t; };
    const fixAttrs = (e) => TR_ATTRS.forEach((a) => { const v = e.getAttribute(a); if (v) { const t = tr(v); if (t !== v) e.setAttribute(a, t); } });
    const fixTree = (n) => {
      if (n.nodeType === 3) return fixText(n);
      if (n.nodeType !== 1) return;
      fixAttrs(n); const w = document.createTreeWalker(n, 5);   // 1 elements + 4 text
      for (let c = w.nextNode(); c; c = w.nextNode()) { if (c.nodeType === 3) fixText(c); else fixAttrs(c); }
    };
    new MutationObserver((muts) => {
      if (lang !== 'my') return;
      muts.forEach((m) => { if (m.type === 'characterData') fixText(m.target); else if (m.type === 'attributes') fixAttrs(m.target); else m.addedNodes.forEach(fixTree); });
    }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: TR_ATTRS });
  }
  /* The fixed page shell (index.html): remember the English once, show Burmese or English on demand. */
  const staticOrig = new Map();
  function applyStatic(root) {
    const walk = (n) => {
      if (n.nodeType === 3) { if ((staticOrig.has(n) || /[A-Za-z]/.test(n.data)) && !(n.parentNode && n.parentNode.hasAttribute && n.parentNode.hasAttribute('data-i18n'))) { if (!staticOrig.has(n)) staticOrig.set(n, n.data); const o = staticOrig.get(n); const t = lang === 'my' ? tr(o) : o; if (t !== n.data) n.data = t; } return; }
      if (n.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(n.nodeName) || n.id === 'main' || n.id === 'modalRoot' || n.id === 'toasts') return;
      TR_ATTRS.forEach((a) => { const v = n.getAttribute(a); if (!v) return; const key = n.__trOrig = n.__trOrig || {}; if (key[a] === undefined) key[a] = v; const t = lang === 'my' ? tr(key[a]) : key[a]; if (t !== v) n.setAttribute(a, t); });
      Array.from(n.childNodes).forEach(walk);
    };
    walk(root);
  }
  const i18n = {
    setLang(l) { lang = DICT[l] ? l : 'my'; document.documentElement.lang = lang === 'my' ? 'my' : 'en'; memo.clear(); },
    getLang() { return lang; },
    t(key) { return (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key; },
    extend(l, entries) { Object.assign(DICT[l] = DICT[l] || {}, entries); },
    tr, addPhrases, watch, applyStatic
  };

  /* ---------- Escaping & safe DOM ---------- */
  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  /** el('div', {class:'x', onclick:fn}, 'text' | Node | [children]) — text is always inserted as text nodes. */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, (k === 'placeholder' || k === 'title' || k === 'aria-label' || k === 'alt' || k === 'label') && typeof v === 'string' ? i18n.tr(v) : v);
    }
    (function add(list) {
      for (const c of list) {
        if (c == null || c === false) continue;
        if (Array.isArray(c)) add(c);
        else node.append(c.nodeType ? c : document.createTextNode(i18n.tr(String(c))));
      }
    })(children);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  /* ---------- Money (integer MMK) ---------- */
  function toInt(v) {
    const n = Math.round(Number(String(v == null ? '' : v).replace(/,/g, '')));
    return Number.isFinite(n) ? n : 0;
  }
  function formatNumber(n) { return toInt(n).toLocaleString('en-US'); }
  /** 1250000 -> "1,250,000 ကျပ်" (or "MMK 1,250,000" when currency display = 'MMK'). */
  function formatMMK(n) {
    const s = SS.settings ? SS.settings.get() : {};
    const txt = formatNumber(n);
    return s.currencyDisplay === 'MMK' ? 'MMK ' + txt : txt + ' ကျပ်';
  }

  /* ---------- Dates (default Asia/Yangon) ---------- */
  function tz() { return (SS.settings && SS.settings.get().timezone) || 'Asia/Yangon'; }
  /** Returns 'YYYY-MM-DD' for a timestamp in the configured timezone. */
  const dayFmt = {};   // one formatter per timezone: building an Intl formatter per call made reports slow with thousands of sales
  function dayKey(ts) {
    const z = tz();
    const f = dayFmt[z] || (dayFmt[z] = new Intl.DateTimeFormat('en-CA', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit' }));
    return f.format(new Date(ts));
  }
  function addDays(key, n) {
    const d = new Date(key + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function formatDate(ts, withTime) {
    const s = SS.settings ? SS.settings.get() : {};
    const key = dayKey(ts); const [y, m, d] = key.split('-');
    let out = s.dateFormat === 'MM/DD/YYYY' ? `${m}/${d}/${y}` : s.dateFormat === 'YYYY-MM-DD' ? key : `${d}/${m}/${y}`;
    if (withTime) out += ' ' + new Intl.DateTimeFormat('en-GB', { timeZone: tz(), hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
    return out;
  }

  /* ---------- Misc ---------- */
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function isTypingTarget(e) {
    const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  /* ---------- Toast ---------- */
  function toast(message, type) {
    const root = document.getElementById('toasts'); if (!root) return;
    const node = el('div', { class: 'toast ' + (type || 'info'), role: type === 'error' ? 'alert' : 'status' }, message);
    root.append(node);
    setTimeout(() => node.remove(), type === 'error' ? 7000 : 3800);
  }

  /* ---------- Modal ---------- */
  let lastFocus = null;
  function closeModal() {
    const root = document.getElementById('modalRoot'); clear(root);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    document.dispatchEvent(new CustomEvent('ss:modal-closed'));
  }
  /** openModal({title, body:Node|string, actions:[{label, kind, onClick}]}) */
  function openModal(opts) {
    const root = document.getElementById('modalRoot'); clear(root);
    lastFocus = document.activeElement;
    const actions = (opts.actions || []).map((a) => el('button', {
      type: 'button', class: 'btn ' + (a.kind || ''),
      onclick: () => { const keep = a.onClick ? a.onClick() : undefined; if (keep !== false) closeModal(); }
    }, a.label));
    const modal = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || '' },
      opts.title ? el('h2', null, opts.title) : null,
      typeof opts.body === 'string' ? el('p', null, opts.body) : opts.body,
      actions.length ? el('div', { class: 'modal-actions' }, actions) : null);
    const back = el('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) closeModal(); } }, modal);
    back.addEventListener('keydown', (e) => {   // keep Tab inside the dialog
      if (e.key !== 'Tab') return;
      const f = Array.from(modal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter((n) => n.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === a || !modal.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && (document.activeElement === z || !modal.contains(document.activeElement))) { e.preventDefault(); a.focus(); }
    });
    root.append(back);
    const first = modal.querySelector('input,select,textarea,button'); if (first) first.focus();
    return modal;
  }
  /** Preview + print dialog shared by receipts, invoices and reports. opts: {title, size, sizes:[[value,label]], render(size)->Node, onSize(size)} */
  function printDocument(opts) {
    let size = opts.size; const holder = el('div'); const sel = ui.select('prSize', opts.sizes, size);
    const draw = () => { clear(holder); holder.append(opts.render(size)); };
    sel.addEventListener('change', () => { size = sel.value; if (opts.onSize) opts.onSize(size); draw(); }); draw();
    const m = openModal({ title: opts.title, body: el('div', null, opts.sizes.length > 1 ? el('div', { class: 'field no-print' }, el('label', { for: 'prSize' }, 'Paper size'), sel) : null, el('div', { class: 'receipt-preview' }, holder)),
      actions: [{ label: 'Close' }, { label: 'Print', kind: 'primary', onClick: () => {
        const st = el('style', { id: 'pageStyle' }, size === 'a4' ? '@page{size:A4;margin:12mm}' : `@page{size:${size}mm auto;margin:2mm}`);
        document.head.append(st); document.body.classList.add('printing-receipt');
        const done = () => { document.body.classList.remove('printing-receipt'); st.remove(); window.removeEventListener('afterprint', done); };
        window.addEventListener('afterprint', done); setTimeout(done, 60000); window.print(); return false;
      } }] });
    m.classList.add('wide'); return m;
  }
  function confirmDialog(title, message, confirmLabel, danger) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      openModal({
        title, body: message,
        actions: [
          { label: i18n.t('cancel'), onClick: () => finish(false) },
          { label: confirmLabel || i18n.t('confirm'), kind: danger ? 'danger' : 'primary', onClick: () => finish(true) }
        ]
      });
      document.addEventListener('ss:modal-closed', () => finish(false), { once: true });
    });
  }

  /* ---------- Quantities (units like kg / litre can be fractional; money never is) ---------- */
  function qty(v) { const n = Math.round(Number(String(v == null ? '' : v).replace(/,/g, '')) * 1000) / 1000; return Number.isFinite(n) ? n : 0; }
  function formatQty(v) { return (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 3 }); }

  /* ---------- Reusable UI components ---------- */
  const ui = {
    field(label, id, control, help) {
      return el('div', { class: 'field' }, el('label', { for: id }, label), control, help ? el('span', { class: 'small muted' }, help) : null,
        el('span', { class: 'err', id: id + 'Err', role: 'alert' }));
    },
    setError(input, message) {
      input.classList.toggle('invalid', !!message);
      const e = document.getElementById(input.id + 'Err'); if (e) e.textContent = i18n.tr(message || '');
      return !!message;
    },
    badge(text, kind) { return el('span', { class: 'badge ' + (kind || 'info') }, text); },
    select(id, options, value) {
      return el('select', { class: 'input', id }, options.map(([v, l]) => el('option', Object.assign({ value: v }, String(v) === String(value) ? { selected: true } : {}), l)));
    },
    /** Sortable, paginated table. cfg: {columns:[{key,label,num,sortable,sortValue,render}], rows, pageSize, rowKey, selectable, onSelect, empty:{title,hint}} */
    dataTable(cfg) {
      const st = { rows: cfg.rows || [], sortKey: null, dir: 1, page: 0, selected: new Set() };
      const size = cfg.pageSize || 15, rk = cfg.rowKey || 'id';
      const wrap = el('div');
      const notify = () => cfg.onSelect && cfg.onSelect(Array.from(st.selected));
      function sorted() {
        if (!st.sortKey) return st.rows;
        const col = cfg.columns.find((c) => c.key === st.sortKey); const f = col.sortValue || ((r) => r[col.key]);
        return st.rows.slice().sort((a, b) => {
          const x = f(a), y = f(b);
          if (typeof x === 'number' && typeof y === 'number') return (x - y) * st.dir;
          return String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), undefined, { numeric: true }) * st.dir;
        });
      }
      function draw() {
        clear(wrap);
        const all = sorted(); const pages = Math.max(1, Math.ceil(all.length / size));
        if (st.page >= pages) st.page = pages - 1;
        if (!all.length) { wrap.append(el('div', { class: 'empty' }, el('strong', null, (cfg.empty && cfg.empty.title) || 'No records'), (cfg.empty && cfg.empty.hint) || '')); return; }
        const slice = all.slice(st.page * size, st.page * size + size);
        const head = el('tr', null,
          cfg.selectable ? el('th', null, el('input', { type: 'checkbox', 'aria-label': 'Select all on this page', checked: slice.every((r) => st.selected.has(r[rk])),
            onchange: (e) => { slice.forEach((r) => (e.target.checked ? st.selected.add(r[rk]) : st.selected.delete(r[rk]))); draw(); notify(); } })) : null,
          cfg.columns.map((c) => {
            const sortable = c.sortable !== false && c.key;
            return el('th', { class: c.num ? 'num' : '', 'aria-sort': st.sortKey === c.key ? (st.dir === 1 ? 'ascending' : 'descending') : null },
              sortable ? el('button', { type: 'button', class: 'th-btn', onclick: () => { if (st.sortKey === c.key) st.dir *= -1; else { st.sortKey = c.key; st.dir = 1; } draw(); } },
                c.label + (st.sortKey === c.key ? (st.dir === 1 ? ' ▲' : ' ▼') : '')) : c.label);
          }));
        const body = slice.map((r) => el('tr', null,
          cfg.selectable ? el('td', null, el('input', { type: 'checkbox', 'aria-label': 'Select row', checked: st.selected.has(r[rk]),
            onchange: (e) => { e.target.checked ? st.selected.add(r[rk]) : st.selected.delete(r[rk]); notify(); } })) : null,
          cfg.columns.map((c) => el('td', { class: c.num ? 'num' : '' }, c.render ? c.render(r) : r[c.key]))));
        wrap.append(el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, head), el('tbody', null, body))),
          el('div', { class: 'pager' },
            el('span', { class: 'small muted' }, `${st.page * size + 1}–${st.page * size + slice.length} / ${all.length}`),
            el('div', { class: 'btn-row' },
              el('button', { class: 'btn sm', type: 'button', disabled: st.page === 0, onclick: () => { st.page--; draw(); } }, '‹'),
              el('button', { class: 'btn sm', type: 'button', disabled: st.page >= pages - 1, onclick: () => { st.page++; draw(); } }, '›'))));
      }
      draw();
      return {
        node: wrap,
        setRows(rows) { st.rows = rows; st.page = 0; const keep = new Set(rows.map((r) => r[rk])); st.selected.forEach((k) => { if (!keep.has(k)) st.selected.delete(k); }); draw(); notify(); },
        selected() { return Array.from(st.selected); }
      };
    }
  };

  /** Date ranges used by the dashboard and Reports: returns [from, to] as YYYY-MM-DD (Asia/Yangon). */
  function dateRange(preset, from, to) {
    const today = dayKey(Date.now());
    switch (preset) {
      case 'yesterday': { const y = addDays(today, -1); return [y, y]; }
      case 'last7': return [addDays(today, -6), today];
      case 'last30': return [addDays(today, -29), today];
      case 'this_month': return [today.slice(0, 8) + '01', today];
      case 'prev_month': { const lastPrev = addDays(today.slice(0, 8) + '01', -1); return [lastPrev.slice(0, 8) + '01', lastPrev]; }
      case 'custom': { const a = from || today, b = to || today; return a <= b ? [a, b] : [b, a]; }
      default: return [today, today];
    }
  }
  /** Number of days from a to b, both included. */
  function daysBetween(a, b) { return Math.max(1, Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5) + 1); }

  SS.ui = ui;
  SS.i18n = i18n;
  SS.utils = { qty, formatQty, escapeHtml, el, clear, toInt, formatNumber, formatMMK, dayKey, addDays, formatDate, debounce, isTypingTarget, toast, openModal, closeModal, confirmDialog, printDocument, tz, dateRange, daysBetween };
})();
