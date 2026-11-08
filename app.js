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

;
/* Burmese phrase dictionary (English -> Burmese). Written by the assistant; needs native-speaker review. */
(function(){'use strict';
window.SmartStock.i18n.addPhrases({"Search…": "ရှာဖွေရန်…", "Dashboard": "ဒက်ရှ်ဘုတ်", "Stock Take": "စတော့ရေတွက်ခြင်း", "Sales / POS": "ရောင်းချမှု / POS", "Cash Management": "ငွေသားစီမံခန့်ခွဲမှု", "Reports & Analytics": "အစီရင်ခံစာနှင့် ခွဲခြမ်းစိတ်ဖြာမှု", "Notifications": "အသိပေးချက်များ", "Activity Log": "လုပ်ဆောင်ချက်မှတ်တမ်း", "Backup & Restore": "အရန်သိမ်းခြင်းနှင့် ပြန်လည်ရယူခြင်း", "Settings": "ဆက်တင်များ", "Online": "အွန်လိုင်း", "Offline": "အော့ဖ်လိုင်း", "Save": "သိမ်းမည်", "Paper size": "စက္ကူအရွယ်အစား", "No records": "မှတ်တမ်း မရှိပါ", "Select all on this page": "ဤစာမျက်နှာရှိ အားလုံးကို ရွေးမည်", "Select row": "ဤအတန်းကို ရွေးမည်", "Products, categories, barcode, stock movements, stocktake and price history": "ကုန်ပစ္စည်းများ၊ အမျိုးအစားများ၊ ဘားကုဒ်၊ စတော့လှုပ်ရှားမှု၊ စတော့ရေတွက်ခြင်းနှင့် ဈေးနှုန်းမှတ်တမ်း", "POS, cart, discounts, payments, receipts and refunds": "POS၊ ခြင်းတောင်း၊ လျှော့ဈေး၊ ငွေပေးချေမှု၊ ဘောက်ချာနှင့် ပြန်အမ်းငွေ", "Purchases, suppliers, customers, payments, expenses and cash management": "ဝယ်ယူမှု၊ ပေးသွင်းသူ၊ ဖောက်သည်၊ ငွေပေးချေမှု၊ အသုံးစရိတ်နှင့် ငွေသားစီမံခန့်ခွဲမှု", "Reports, Chart.js analytics and the notification centre": "အစီရင်ခံစာများ၊ ဇယားခွဲခြမ်းစိတ်ဖြာမှုနှင့် အသိပေးချက်စင်တာ", "JSON backup/restore, CSV export and data migration tools": "JSON အရန်သိမ်းခြင်း/ပြန်ယူခြင်း၊ CSV ထုတ်ယူခြင်းနှင့် ဒေတာရွှေ့ပြောင်းရေးကိရိယာများ", "Search activity…": "လုပ်ဆောင်ချက်များ ရှာရန်…", "Search activity": "လုပ်ဆောင်ချက်များ ရှာရန်", "No activity recorded yet": "လုပ်ဆောင်ချက် မှတ်တမ်း မရှိသေးပါ", "Important actions will be logged here automatically.": "အရေးကြီးသော လုပ်ဆောင်ချက်များကို ဤနေရာတွင် အလိုအလျောက် မှတ်တမ်းတင်ပါမည်။", "Time": "အချိန်", "Action": "လုပ်ဆောင်ချက်", "Record": "မှတ်တမ်း", "Operator": "လုပ်ဆောင်သူ", "Every sale, refund and cancellation. Completed sales are never deleted.": "ရောင်းချမှု၊ ပြန်အမ်းငွေနှင့် ပယ်ဖျက်မှု အားလုံး။ ပြီးစီးသော ရောင်းချမှုများကို ဘယ်တော့မှ မဖျက်ပါ။", "Scan or tap products, then check out.": "ကုန်ပစ္စည်းကို စကင်ဖတ်ပါ သို့မဟုတ် နှိပ်ပါ၊ ပြီးမှ ငွေရှင်းပါ။", "Point of sale": "ရောင်းချရေးကောင်တာ", "Sales history": "ရောင်းချမှုမှတ်တမ်း", "Global search": "အားလုံးရှာဖွေရန်", "Search products, SKUs, barcodes, categories, customers and suppliers.": "ကုန်ပစ္စည်း၊ SKU၊ ဘားကုဒ်၊ အမျိုးအစား၊ ဖောက်သည်နှင့် ပေးသွင်းသူများကို ရှာပါ။", "Products": "ကုန်ပစ္စည်းများ", "Categories": "အမျိုးအစားများ", "Customers": "ဖောက်သည်များ", "Suppliers": "ပေးသွင်းသူများ", "Sales": "ရောင်းချမှုများ", "Purchases": "ဝယ်ယူမှုများ", "No matches": "ကိုက်ညီမှု မရှိပါ", "Purchase prices are never searchable here.": "ဝယ်ဈေးများကို ဤနေရာတွင် ဘယ်တော့မှ ရှာမရပါ။", "New product": "ကုန်ပစ္စည်းအသစ်", "Save current form": "လက်ရှိပုံစံကို သိမ်းမည်", "POS: focus product search": "POS: ကုန်ပစ္စည်းရှာဖွေရာသို့ သွားမည်", "POS: checkout": "POS: ငွေရှင်းမည်", "Close dialog": "ဒိုင်ယာလော့ဂ်ကို ပိတ်မည်", "Confirm focused action": "ရွေးထားသော လုပ်ဆောင်ချက်ကို အတည်ပြုမည်", "Keyboard shortcuts": "ကီးဘုတ် ဖြတ်လမ်းများ", "Close": "ပိတ်မည်", "Data changed in another tab — refreshed.": "အခြား tab တွင် ဒေတာ ပြောင်းလဲသွားသဖြင့် ပြန်လည်ဖော်ပြထားသည်။", "Another tab changed this data. Latest data loaded; please repeat your action.": "အခြား tab က ဤဒေတာကို ပြောင်းလိုက်သည်။ နောက်ဆုံးဒေတာကို ယူပြီးပြီ၊ လုပ်ဆောင်ချက်ကို ထပ်လုပ်ပါ။", "Browser storage is full. Your last change is NOT saved yet. Make a backup now (Backup page — it still works), free some space, then tap “NOT SAVED” at the top to try saving again.": "ဘရောက်ဇာ သိမ်းဆည်းနေရာ ပြည့်နေသည်။ သင့်နောက်ဆုံးပြောင်းလဲမှုကို မသိမ်းရသေးပါ။ ယခုပင် အရန်သိမ်းပါ (အရန်သိမ်းခြင်းစာမျက်နှာ အလုပ်လုပ်ဆဲဖြစ်သည်)၊ နေရာလွတ်လပ်စေပြီး အပေါ်ဘားရှိ “NOT SAVED” ကို နှိပ်၍ ထပ်သိမ်းကြည့်ပါ။", "Saving to browser storage failed: {} Your last change is NOT saved yet. Make a backup now, then tap “NOT SAVED” at the top to try again.": "ဘရောက်ဇာသိမ်းဆည်းရာတွင် မအောင်မြင်ပါ: {} သင့်နောက်ဆုံးပြောင်းလဲမှုကို မသိမ်းရသေးပါ။ ယခုပင် အရန်သိမ်းပါ၊ ပြီးမှ အပေါ်ဘားရှိ “NOT SAVED” ကို နှိပ်၍ ထပ်ကြိုးစားပါ။", "unknown error": "မသိသော အမှား", "Stored \"{}\" data was unreadable. A raw copy was kept; starting that section empty.": "သိမ်းထားသော \"{}\" ဒေတာကို ဖတ်မရပါ။ မူရင်းမိတ္တူကို ထားရှိပြီး ထိုအပိုင်းကို အလွတ်ဖြင့် စတင်ပါမည်။", "Saved.": "သိမ်းပြီးပါပြီ။", "Still could not save. Make a backup and free space.": "ထပ်သိမ်း၍ မရသေးပါ။ အရန်သိမ်းပြီး နေရာလွတ်လပ်စေပါ။", "Your change was NOT saved": "သင့်ပြောင်းလဲမှုကို မသိမ်းရပါ", "OK": "အိုကေ", "NOT SAVED — tap to retry": "မသိမ်းရသေးပါ — ထပ်ကြိုးစားရန် နှိပ်ပါ", "Saving…": "သိမ်းနေသည်…", "Your data was moved to the new, larger storage and checked.": "သင့်ဒေတာကို သိုလှောင်နေရာအသစ်၊ ပိုကြီးသည့်နေရာသို့ ရွှေ့ပြီး စစ်ဆေးပြီးပါပြီ။", "{} interrupted purchase(s) were put back to draft. Check Purchases.": "ကြားဖြတ်ခံရသော ဝယ်ယူမှု {} ခုကို မူကြမ်းသို့ ပြန်ထားပါသည်။ ဝယ်ယူမှုများကို စစ်ကြည့်ပါ။", "{} interrupted sale(s) were rolled back. Check Sales history.": "ကြားဖြတ်ခံရသော ရောင်းချမှု {} ခုကို ပြန်လည်ပယ်ဖျက်ပါသည်။ ရောင်းချမှုမှတ်တမ်းကို စစ်ကြည့်ပါ။", "PIN must be 4–8 digits.": "PIN သည် ဂဏန်း ၄ မှ ၈ လုံး ဖြစ်ရမည်။", "Current PIN is incorrect.": "လက်ရှိ PIN မမှန်ပါ။", "Set an administrator PIN in Settings first.": "ဆက်တင်များတွင် စီမံခန့်ခွဲသူ PIN ကို အရင်သတ်မှတ်ပါ။", "Enter the administrator PIN to show purchase prices. They hide again when you leave the page.": "ဝယ်ဈေးများကို ပြရန် စီမံခန့်ခွဲသူ PIN ထည့်ပါ။ စာမျက်နှာမှ ထွက်လိုက်သည့်အခါ ပြန်ဖျောက်ပါမည်။", "Show purchase prices": "ဝယ်ဈေးများကို ပြမည်", "Shop logo": "ဆိုင်လိုဂို", "Shop logo (shown on receipts)": "ဆိုင်လိုဂို (ဘောက်ချာတွင် ပြမည်)", "Remove": "ဖယ်ရှားမည်", "Shop profile": "ဆိုင်ပရိုဖိုင်", "Shop name": "ဆိုင်အမည်", "Operator label (shown in activity log)": "လုပ်ဆောင်သူအမည် (လုပ်ဆောင်ချက်မှတ်တမ်းတွင် ပြမည်)", "Regional & display": "ဒေသနှင့် ပြသမှု", "Currency display": "ငွေကြေးပြသပုံ", "Display only — all values are stored as integer MMK. No conversion is ever applied.": "ပြသရန်သာ — တန်ဖိုးအားလုံးကို ကိန်းပြည့် MMK အဖြစ် သိမ်းသည်။ ငွေလဲနှုန်း တွက်ချက်မှု လုံးဝမပြုလုပ်ပါ။", "Date format": "ရက်စွဲပုံစံ", "Timezone": "အချိန်ဇုန်", "Asia/Yangon (UTC+06:30)": "အာရှ/ရန်ကုန် (UTC+06:30)", "Theme": "အသွင်အပြင်", "Light": "အလင်း", "Dark": "အမှောင်", "Sales & stock defaults": "ရောင်းချမှုနှင့် စတော့ မူလတန်ဖိုးများ", "Default payment method": "မူလငွေပေးချေနည်း", "Low-stock threshold (units)": "လက်ကျန်နည်းသည့် အဆင့် (ယူနစ်)", "Tax enabled": "အခွန် ဖွင့်ထားသည်", "No": "မဟုတ်ပါ", "Yes": "ဟုတ်ပါသည်", "Tax rate (%)": "အခွန်နှုန်း (%)", "Receipt footer": "ဘောက်ချာအောက်ခြေစာ", "Receipt paper size": "ဘောက်ချာစက္ကူအရွယ်", "Allow partial payments (credit sales)": "တစ်စိတ်တစ်ပိုင်း ပေးချေမှုကို ခွင့်ပြုမည် (အကြွေးရောင်းချမှု)", "No — full payment only": "မဟုတ် — ငွေအပြည့်အဝ ပေးချေမှုသာ", "Yes — unpaid balance goes to the customer": "ဟုတ် — မပေးရသေးသော ကျန်ငွေကို ဖောက်သည်ထံ မှတ်သည်", "Credit needs a named customer; walk-in sales are always paid in full.": "အကြွေးရောင်းရန် ဖောက်သည်အမည် လိုအပ်သည်၊ ကောင်တာတွင် တိုက်ရိုက်ဝယ်သူများသည် ငွေအပြည့်အဝ ပေးရမည်။", "Near-expiry warning (days before expiry)": "သက်တမ်းကုန်ခါနီး သတိပေးချက် (သက်တမ်းမကုန်မီ ရက်အရေအတွက်)", "For products that track batches and expiry.": "အသုတ်နှင့် သက်တမ်းကုန်ရက်ကို မှတ်သားသည့် ကုန်ပစ္စည်းများအတွက်။", "Issue stock with batches": "အသုတ်အလိုက် စတော့ထုတ်ပေးမည့်နည်း", "FEFO — earliest expiry first": "FEFO — သက်တမ်းအစောဆုံးကို အရင်ထုတ်", "FIFO — oldest received first": "FIFO — အရင်ဝင်သည်ကို အရင်ထုတ်", "Please fix the highlighted fields.": "အရောင်ခြယ်ထားသော အကွက်များကို ပြင်ပါ။", "Settings saved.": "ဆက်တင်များကို သိမ်းပြီးပါပြီ။", "Purchase price privacy": "ဝယ်ဈေး ကိုယ်ရေးလုံခြုံမှု", "Purchase prices are hidden by default everywhere except authorised cost views. The PIN is stored in this browser’s storage: it keeps casual viewers out, but it is not strong security against anyone with direct access to this browser profile.": "ဝယ်ဈေးများကို ခွင့်ပြုထားသော ကုန်ကျစရိတ်ကြည့်ရှုမှုများမှလွဲ၍ မည်သည့်နေရာတွင်မဆို မူလအားဖြင့် ဖျောက်ထားသည်။ PIN ကို ဤဘရောက်ဇာ၏ သိုလှောင်မှုတွင် သိမ်းထားသည် — ဘေးလူများ မကြည့်နိုင်စေရန် ကာကွယ်သော်လည်း ဤဘရောက်ဇာပရိုဖိုင်ကို တိုက်ရိုက်အသုံးပြုနိုင်သူအတွက် ခိုင်မာသော လုံခြုံမှု မဟုတ်ပါ။", "Current PIN": "လက်ရှိ PIN", "New PIN (4–8 digits)": "PIN အသစ် (ဂဏန်း ၄–၈ လုံး)", "Set administrator PIN (4–8 digits)": "စီမံခန့်ခွဲသူ PIN သတ်မှတ်ပါ (ဂဏန်း ၄–၈ လုံး)", "Administrator PIN saved.": "စီမံခန့်ခွဲသူ PIN ကို သိမ်းပြီးပါပြီ။", "Change PIN": "PIN ပြောင်းမည်", "Set PIN": "PIN သတ်မှတ်မည်", "Checking…": "စစ်ဆေးနေသည်…", "Install app": "အက်ပ်ကို ထည့်သွင်းမည်", "Not available here: offline mode needs https:// or http://localhost. (The app still works offline once loaded, because your data is stored in this browser.)": "ဤနေရာတွင် မရနိုင်ပါ: အော့ဖ်လိုင်းမုဒ်အတွက် https:// သို့မဟုတ် http://localhost လိုအပ်သည်။ (ဒေတာကို ဤဘရောက်ဇာတွင် သိမ်းထားသဖြင့် တစ်ကြိမ်ဖွင့်ပြီးပါက အက်ပ်သည် အော့ဖ်လိုင်းတွင်လည်း ဆက်အလုပ်လုပ်ပါသည်။)", "Off. Turn it on to cache the app files so it opens with no internet and can be installed.": "ပိတ်ထားသည်။ အင်တာနက်မရှိဘဲ ဖွင့်နိုင်ပြီး ထည့်သွင်းနိုင်စေရန် အက်ပ်ဖိုင်များကို သိမ်းထားရန် ဖွင့်ပါ။", "Starting… reload once if it stays like this.": "စတင်နေသည်… ဤအတိုင်းပင် ရှိနေပါက တစ်ကြိမ် ပြန်ဖွင့်ပါ။", "On. The app files are cached and the app can open without internet. Business data is never put in this cache.": "ဖွင့်ထားသည်။ အက်ပ်ဖိုင်များကို သိမ်းထားပြီး အင်တာနက်မရှိဘဲ ဖွင့်နိုင်သည်။ လုပ်ငန်းဒေတာကို ဤ cache ထဲ ဘယ်တော့မှ မထည့်ပါ။", "Turn off offline app": "အော့ဖ်လိုင်းအက်ပ်ကို ပိတ်မည်", "Turn on offline app": "အော့ဖ်လိုင်းအက်ပ်ကို ဖွင့်မည်", "Offline app turned off and its cache cleared.": "အော့ဖ်လိုင်းအက်ပ်ကို ပိတ်ပြီး cache ကို ရှင်းလင်းပြီးပါပြီ။", "Offline app turned on.": "အော့ဖ်လိုင်းအက်ပ်ကို ဖွင့်ပြီးပါပြီ။", "Offline app": "အော့ဖ်လိုင်းအက်ပ်", "Ask browser to protect it": "ဘရောက်ဇာကို ကာကွယ်ခိုင်းမည်", "not reported by this browser": "ဤဘရောက်ဇာက မပြောပြပါ", "No — the browser may delete data if the device runs very low on space": "မဟုတ်ပါ — စက်၏နေရာ အလွန်နည်းသွားပါက ဘရောက်ဇာက ဒေတာကို ဖျက်ပစ်နိုင်သည်", "Protected.": "ကာကွယ်ထားပါပြီ။", "The browser did not grant protection. Keep making backups.": "ဘရောက်ဇာက ကာကွယ်ခွင့် မပေးပါ။ အရန်သိမ်းခြင်းကို ဆက်လုပ်ပါ။", "Delete the old copy?": "မူလမိတ္တူဟောင်းကို ဖျက်မလား?", "Your data was already moved to the new storage and checked. This only removes the leftover old copy in this browser. Make sure you have a backup.": "သင့်ဒေတာကို သိုလှောင်မှုအသစ်သို့ ရွှေ့ပြီး စစ်ဆေးပြီးဖြစ်သည်။ ဤဘရောက်ဇာတွင် ကျန်နေသော မိတ္တူဟောင်းကိုသာ ဖယ်ရှားမည်ဖြစ်သည်။ အရန်သိမ်းထားကြောင်း သေချာပါစေ။", "Delete old copy": "မိတ္တူဟောင်းကို ဖျက်မည်", "Old copy deleted.": "မိတ္တူဟောင်းကို ဖျက်ပြီးပါပြီ။", "Data & storage": "ဒေတာနှင့် သိမ်းဆည်းမှု", "Storage used by SmartStock": "SmartStock အသုံးပြုသော သိမ်းဆည်းနေရာ", "Browser storage on this device": "ဤစက်ရှိ ဘရောက်ဇာသိမ်းဆည်းနေရာ", "Protected from automatic clean-up": "အလိုအလျောက် ရှင်းလင်းခြင်းမှ ကာကွယ်ထားသည်", "Last backup": "နောက်ဆုံး အရန်သိမ်းမှု", "Never — open Backup": "မလုပ်ဖူးပါ — အရန်သိမ်းခြင်းကို ဖွင့်ပါ", "Financial reconciliation": "ဘဏ္ဍာရေး ကိုက်ညီမှုစစ်ဆေးခြင်း", "Open report": "အစီရင်ခံစာ ဖွင့်မည်", "Integrity check": "ဒေတာမှန်ကန်မှု စစ်ဆေးခြင်း", "Data is saved in this browser (IndexedDB) on this device only. It does not sync to other browsers or devices. Use Backup & Restore to save everything to a file.": "ဒေတာကို ဤစက်ရှိ ဤဘရောက်ဇာ (IndexedDB) တွင်သာ သိမ်းသည်။ အခြားဘရောက်ဇာ သို့မဟုတ် စက်များသို့ မညှိပါ။ အားလုံးကို ဖိုင်တစ်ခုအဖြစ် သိမ်းရန် အရန်သိမ်းခြင်းနှင့် ပြန်လည်ရယူခြင်းကို သုံးပါ။", "Reset application?": "အက်ပ်ကို ပြန်လည်စတင်မလား?", "This permanently deletes ALL SmartStock data in this browser (products, sales, purchases, settings, logs). Create a backup first (Backup & Restore page) — a reset cannot be undone.": "ဤဘရောက်ဇာရှိ SmartStock ဒေတာအားလုံး (ကုန်ပစ္စည်း၊ ရောင်းချမှု၊ ဝယ်ယူမှု၊ ဆက်တင်၊ မှတ်တမ်း) ကို အပြီးအပိုင် ဖျက်မည်။ အရင်ဆုံး အရန်သိမ်းပါ (အရန်သိမ်းခြင်းနှင့် ပြန်လည်ရယူခြင်းစာမျက်နှာ) — ပြန်လည်စတင်ခြင်းကို ပြန်ပြင်၍ မရပါ။", "Delete everything": "အားလုံးကို ဖျက်မည်", "Type RESET": "RESET ဟု ရိုက်ပါ", "Type RESET to confirm": "အတည်ပြုရန် RESET ဟု ရိုက်ပါ", "Reset now": "ယခု ပြန်လည်စတင်မည်", "Type RESET exactly to continue.": "ဆက်လုပ်ရန် RESET ကို အတိအကျ ရိုက်ပါ။", "Reset application": "အက်ပ်ကို ပြန်လည်စတင်မည်", "Reset failed: {}": "ပြန်လည်စတင်ခြင်း မအောင်မြင်ပါ: {}", "No upgrade path from schema {} to {}.": "schema {} မှ {} သို့ အဆင့်မြှင့်ရန် လမ်းကြောင်း မရှိပါ။", "Browser storage is full. Export a backup, remove product images or old data, then try again. Your last change was NOT saved.": "ဘရောက်ဇာ သိမ်းဆည်းနေရာ ပြည့်နေသည်။ အရန်ဖိုင်ထုတ်ပါ၊ ကုန်ပစ္စည်းပုံများ သို့မဟုတ် ဒေတာဟောင်းများကို ဖယ်ရှားပြီး ထပ်ကြိုးစားပါ။ သင့်နောက်ဆုံးပြောင်းလဲမှုကို မသိမ်းရပါ။", "Saving failed": "သိမ်းဆည်းမှု မအောင်မြင်ပါ", "This browser does not support IndexedDB.": "ဤဘရောက်ဇာသည် IndexedDB ကို မပံ့ပိုးပါ။", "Storage has not finished loading yet.": "သိမ်းဆည်းမှုကို မဖတ်ပြီးသေးပါ။", "Invalid data type for \"{}\".": "\"{}\" အတွက် ဒေတာအမျိုးအစား မမှန်ပါ။", "Data could not be converted to JSON.": "ဒေတာကို JSON သို့ ပြောင်း၍ မရပါ။", "This data was changed in another browser tab. The latest data was loaded - your last change was NOT saved, please repeat it.": "ဤဒေတာကို အခြားဘရောက်ဇာ tab တွင် ပြောင်းလိုက်သည်။ နောက်ဆုံးဒေတာကို ယူပြီးပြီ — သင့်နောက်ဆုံးပြောင်းလဲမှုကို မသိမ်းရပါ၊ ထပ်လုပ်ပါ။", "A record with id {} already exists in {}.": "{} ထဲတွင် id {} ပါသော မှတ်တမ်း ရှိပြီးသား ဖြစ်သည်။", "Record {} was not found in {}.": "{} ထဲတွင် မှတ်တမ်း {} ကို မတွေ့ပါ။", "Records in \"{}\" are part of the financial history and cannot be deleted.": "\"{}\" ထဲရှိ မှတ်တမ်းများသည် ဘဏ္ဍာရေးမှတ်တမ်း၏ အစိတ်အပိုင်းဖြစ်၍ ဖျက်၍ မရပါ။", "{}: record without id": "{}: id မပါသော မှတ်တမ်း", "{}: duplicate id {}": "{}: id {} ထပ်နေသည်", "product {}: missing category {}": "ကုန်ပစ္စည်း {}: အမျိုးအစား {} ပျောက်နေသည်", "product {}: missing supplier {}": "ကုန်ပစ္စည်း {}: ပေးသွင်းသူ {} ပျောက်နေသည်", "stock movement {}: missing product {}": "စတော့လှုပ်ရှားမှု {}: ကုန်ပစ္စည်း {} ပျောက်နေသည်", "sale {}: missing product {}": "ရောင်းချမှု {}: ကုန်ပစ္စည်း {} ပျောက်နေသည်", "sale {}: missing customer {}": "ရောင်းချမှု {}: ဖောက်သည် {} ပျောက်နေသည်", "purchase {}: missing supplier {}": "ဝယ်ယူမှု {}: ပေးသွင်းသူ {} ပျောက်နေသည်", "The data has not been moved to the new storage, so the old copy is kept.": "ဒေတာကို သိုလှောင်မှုအသစ်သို့ မရွှေ့ရသေးသဖြင့် မိတ္တူဟောင်းကို ထားရှိပါသည်။", "Could not store the safety copy": "လုံခြုံရေးမိတ္တူကို သိမ်း၍ မရပါ", "Data was saved by a newer SmartStock (schema {}). Update the app before continuing.": "ဒေတာကို SmartStock ဗားရှင်းအသစ် (schema {}) က သိမ်းထားသည်။ ဆက်မလုပ်မီ အက်ပ်ကို အဆင့်မြှင့်ပါ။", "Offline mode needs the app to be opened from https:// or http://localhost (not from a file).": "အော့ဖ်လိုင်းမုဒ်အတွက် အက်ပ်ကို https:// သို့မဟုတ် http://localhost မှ ဖွင့်ရမည် (ဖိုင်မှ တိုက်ရိုက်ဖွင့်၍ မရပါ)။", "Owner": "ပိုင်ရှင်", "No data for this period": "ဤကာလအတွက် ဒေတာ မရှိပါ", "Doughnut chart": "ဒိုးနပ်ဇယား", "Could not generate a unique code.": "မထပ်သော ကုဒ်ကို ဖန်တီး၍ မရပါ။", "(code not printable as Code 39)": "(Code 39 အဖြစ် ပုံနှိပ်၍ မရသော ကုဒ်)", "Select at least one product.": "ကုန်ပစ္စည်း အနည်းဆုံး တစ်ခု ရွေးပါ။", "Barcode labels": "ဘားကုဒ်တံဆိပ်များ", "Labels use Code 39, which most USB scanners read by default. Test one label with your scanner before printing a full sheet.": "တံဆိပ်များသည် Code 39 ကို သုံးပြီး USB စကင်နာအများစုက မူလအတိုင်း ဖတ်နိုင်သည်။ စာရွက်အပြည့် မပုံနှိပ်မီ တံဆိပ်တစ်ခုကို သင့်စကင်နာဖြင့် စမ်းကြည့်ပါ။", "Print": "ပုံနှိပ်မည်", "Category name is required.": "အမျိုးအစားအမည် လိုအပ်သည်။", "A category with this name already exists.": "ဤအမည်ဖြင့် အမျိုးအစား ရှိပြီးသားဖြစ်သည်။", "Edit category": "အမျိုးအစား ပြင်မည်", "New category": "အမျိုးအစားအသစ်", "Category saved.": "အမျိုးအစားကို သိမ်းပြီးပါပြီ။", "Delete category?": "အမျိုးအစားကို ဖျက်မလား?", "“{}” is not used by any product and will be permanently deleted.": "“{}” ကို မည်သည့်ကုန်ပစ္စည်းမျှ မသုံးထားသဖြင့် အပြီးအပိုင် ဖျက်မည်။", "Delete": "ဖျက်မည်", "Category deleted.": "အမျိုးအစားကို ဖျက်ပြီးပါပြီ။", "{} product(s) use this category. Create another category to move them to first, or archive this one instead.": "ကုန်ပစ္စည်း {} ခုက ဤအမျိုးအစားကို သုံးထားသည်။ ၎င်းတို့ကို ရွှေ့ရန် အခြားအမျိုးအစားတစ်ခု အရင်ဖန်တီးပါ၊ သို့မဟုတ် ဤအမျိုးအစားကို သိမ်းဆည်းထားပါ (archive)။", "Reassign products before deleting": "မဖျက်မီ ကုန်ပစ္စည်းများကို ပြောင်းရွှေ့ပါ", "{} product(s) (including archived) use “{}”. Choose a category to move them to.": "ကုန်ပစ္စည်း {} ခု (သိမ်းဆည်းထားသည်များ အပါအဝင်) က “{}” ကို သုံးထားသည်။ ၎င်းတို့ကို ရွှေ့ရန် အမျိုးအစားတစ်ခု ရွေးပါ။", "Move products to": "ကုန်ပစ္စည်းများကို ရွှေ့မည့်နေရာ", "Move & delete": "ရွှေ့ပြီး ဖျက်မည်", "Category deleted; products reassigned.": "အမျိုးအစားကို ဖျက်ပြီး ကုန်ပစ္စည်းများကို ပြောင်းရွှေ့ပြီးပါပြီ။", "No categories yet": "အမျိုးအစား မရှိသေးပါ", "Create your first category to organise products.": "ကုန်ပစ္စည်းများကို စီစဉ်ရန် ပထမဆုံး အမျိုးအစားကို ဖန်တီးပါ။", "Archived": "သိမ်းဆည်းထား", "Active": "အသုံးပြုဆဲ", "Edit": "ပြင်မည်", "Archive": "သိမ်းဆည်းမည် (archive)", "Search categories…": "အမျိုးအစားများ ရှာရန်…", "Search categories": "အမျိုးအစားများ ရှာရန်", "All": "အားလုံး", "+ New category": "+ အမျိုးအစားအသစ်", "Customer not found.": "ဖောက်သည်ကို မတွေ့ပါ။", "{} owes only {}. Enter that amount or less.": "{} မှာ {} သာ ကျန်ပါသည်။ ထိုပမာဏ သို့မဟုတ် ထိုထက်နည်းသော ပမာဏကို ထည့်ပါ။", "That sale has no unpaid balance.": "ထိုရောင်းချမှုတွင် မပေးရသေးသော ကျန်ငွေ မရှိပါ။", "That sale has only {} unpaid.": "ထိုရောင်းချမှုတွင် {} သာ မပေးရသေးပါ။", "This customer’s balance does not match their unpaid sales. Run the integrity check in Settings before taking this payment.": "ဤဖောက်သည်၏ ကျန်ငွေသည် မပေးရသေးသော ရောင်းချမှုများနှင့် မကိုက်ညီပါ။ ဤငွေကို မလက်ခံမီ ဆက်တင်များရှိ ဒေတာမှန်ကန်မှုစစ်ဆေးခြင်းကို လုပ်ပါ။", "Supplier not found.": "ပေးသွင်းသူကို မတွေ့ပါ။", "You owe {} only {}. Enter that amount or less.": "{} ကို သင်က {} သာ ပေးရန်ကျန်သည်။ ထိုပမာဏ သို့မဟုတ် ထိုထက်နည်းသော ပမာဏကို ထည့်ပါ။", "That purchase has no unpaid balance.": "ထိုဝယ်ယူမှုတွင် မပေးရသေးသော ကျန်ငွေ မရှိပါ။", "That purchase has only {} unpaid.": "ထိုဝယ်ယူမှုတွင် {} သာ မပေးရသေးပါ။", "This supplier’s balance does not match their unpaid purchases. Run the integrity check in Settings before making this payment.": "ဤပေးသွင်းသူ၏ ကျန်ငွေသည် မပေးရသေးသော ဝယ်ယူမှုများနှင့် မကိုက်ညီပါ။ ဤငွေကို မပေးမီ ဆက်တင်များရှိ ဒေတာမှန်ကန်မှုစစ်ဆေးခြင်းကို လုပ်ပါ။", "Oldest first (automatic)": "အဟောင်းဆုံးကို အရင် (အလိုအလျောက်)", "Receive payment from {}": "{} ထံမှ ငွေလက်ခံမည်", "Pay supplier {}": "ပေးသွင်းသူ {} ကို ငွေပေးချေမည်", "Owes you {}": "{} က သင့်ကို ပေးရန်ကျန်သည်", "You owe {}": "{} ကို သင်က ပေးရန်ကျန်သည်", "Apply to": "ထည့်သွင်းမည့်နေရာ", "Note (optional)": "မှတ်ချက် (မဖြည့်လည်းရ)", "Record payment": "ငွေပေးချေမှုကို မှတ်တမ်းတင်မည်", "Money": "ငွေကြေး", "System": "စနစ်", "Unpaid balance from credit sales.": "အကြွေးရောင်းချမှုမှ မပေးရသေးသော ကျန်ငွေ။", "Outstanding supplier payment.": "ပေးသွင်းသူအား ပေးရန်ကျန်သော ငွေ။", "Stock is not added until it is confirmed.": "အတည်ပြုသည်အထိ စတော့ကို မတိုးပါ။", "Reload the app to restore it to a draft.": "မူကြမ်းသို့ ပြန်ထားရန် အက်ပ်ကို ပြန်ဖွင့်ပါ။", "Count the cash and close the day.": "ငွေသားရေတွက်ပြီး ရက်ကို ပိတ်ပါ။", "Counted cash differed from expected.": "ရေတွက်ထားသော ငွေသားသည် မျှော်မှန်းထားသည်နှင့် ကွာခြားသည်။", "No backup has been made yet": "အရန်သိမ်းမှု မလုပ်ရသေးပါ", "Your data lives only in this browser. Create a backup file.": "သင့်ဒေတာသည် ဤဘရောက်ဇာတွင်သာ ရှိသည်။ အရန်ဖိုင်တစ်ခု ဖန်တီးပါ။", "Make a fresh backup so recent sales are safe.": "မကြာသေးမီ ရောင်းချမှုများ လုံခြုံစေရန် အရန်အသစ်တစ်ခု သိမ်းပါ။", "Some balances, payments or stock do not agree.": "ကျန်ငွေ၊ ငွေပေးချေမှု သို့မဟုတ် စတော့အချို့ မကိုက်ညီပါ။", "Unread": "မဖတ်ရသေး", "Dismissed": "ပယ်ထားသည်", "Nothing dismissed": "ပယ်ထားသည် မရှိပါ", "No notifications": "အသိပေးချက် မရှိပါ", "Nothing matches this filter.": "ဤစစ်ထုတ်မှုနှင့် ကိုက်ညီသည် မရှိပါ။", "Alerts appear here when stock runs low, balances are unpaid or something needs checking.": "စတော့နည်းလာသောအခါ၊ ကျန်ငွေ မပေးရသေးသောအခါ သို့မဟုတ် တစ်စုံတစ်ရာ စစ်ဆေးရန်လိုအပ်သောအခါ သတိပေးချက်များ ဤနေရာတွင် ပေါ်လာမည်။", "read": "ဖတ်ပြီး", "Mark read": "ဖတ်ပြီးအဖြစ် မှတ်မည်", "Dismiss": "ပယ်မည်", "Built from your real stock, balances and records. Dismissed alerts return only if the situation changes.": "သင့်စတော့၊ ကျန်ငွေနှင့် မှတ်တမ်းအစစ်အမှန်များမှ ဖန်တီးထားသည်။ ပယ်ထားသော သတိပေးချက်များသည် အခြေအနေပြောင်းလဲမှသာ ပြန်ပေါ်လာမည်။", "Mark all as read": "အားလုံးကို ဖတ်ပြီးအဖြစ် မှတ်မည်", "Supplier name is required.": "ပေးသွင်းသူအမည် လိုအပ်သည်။", "A supplier with this name already exists.": "ဤအမည်ဖြင့် ပေးသွင်းသူ ရှိပြီးသားဖြစ်သည်။", "Edit supplier": "ပေးသွင်းသူ ပြင်မည်", "New supplier": "ပေးသွင်းသူအသစ်", "Supplier name": "ပေးသွင်းသူအမည်", "Contact person": "ဆက်သွယ်ရမည့်သူ", "Supplier saved.": "ပေးသွင်းသူကို သိမ်းပြီးပါပြီ။", "Outstanding (you owe)": "ကျန်ငွေ (သင်ပေးရန်)", "Confirmed": "အတည်ပြုပြီး", "No purchases from this supplier yet.": "ဤပေးသွင်းသူထံမှ ဝယ်ယူမှု မရှိသေးပါ။", "Payments made": "ပေးချေပြီးသော ငွေများ", "Purchase": "ဝယ်ယူမှု", "No payments yet.": "ငွေပေးချေမှု မရှိသေးပါ။", "Total owed to suppliers (payables)": "ပေးသွင်းသူများအား ပေးရန်စုစုပေါင်း (ပေးရန်ရှိသည်များ)", "Suppliers with unpaid balance": "ကျန်ငွေရှိသော ပေးသွင်းသူများ", "No suppliers yet": "ပေးသွင်းသူ မရှိသေးပါ", "Add the people you buy stock from, then record purchases.": "စတော့ဝယ်သည့် သူများကို ထည့်ပြီး ဝယ်ယူမှုများကို မှတ်တမ်းတင်ပါ။", "Search suppliers…": "ပေးသွင်းသူများ ရှာရန်…", "Search suppliers": "ပေးသွင်းသူများ ရှာရန်", "+ New supplier": "+ ပေးသွင်းသူအသစ်", "Customer name is required.": "ဖောက်သည်အမည် လိုအပ်သည်။", "A customer with this name and phone number already exists.": "ဤအမည်နှင့် ဖုန်းနံပါတ်ဖြင့် ဖောက်သည် ရှိပြီးသားဖြစ်သည်။", "Edit customer": "ဖောက်သည် ပြင်မည်", "New customer": "ဖောက်သည်အသစ်", "Phone number": "ဖုန်းနံပါတ်", "Customer saved.": "ဖောက်သည်ကို သိမ်းပြီးပါပြီ။", "Total purchases": "စုစုပေါင်း ဝယ်ယူမှု", "Outstanding (owes you)": "ကျန်ငွေ (သင့်ကို ပေးရန်)", "Purchase history": "ဝယ်ယူမှုမှတ်တမ်း", "Total": "စုစုပေါင်း", "Unpaid": "မပေးရသေး", "No purchases yet.": "ဝယ်ယူမှု မရှိသေးပါ။", "Payments received": "လက်ခံရရှိသော ငွေများ", "Sale": "ရောင်းချမှု", "Method": "နည်းလမ်း", "Amount": "ပမာဏ", "No payments received yet.": "လက်ခံရရှိသော ငွေ မရှိသေးပါ။", "Receive payment": "ငွေလက်ခံမည်", "Total owed by customers (receivables)": "ဖောက်သည်များက ပေးရန်စုစုပေါင်း (ရရန်ရှိသည်များ)", "Customers with unpaid balance": "ကျန်ငွေရှိသော ဖောက်သည်များ", "Walk-in customer (default)": "ကောင်တာဝယ်သူ (မူလ)", "No customers yet": "ဖောက်သည် မရှိသေးပါ", "Walk-in sales need no customer. Add customers to sell on credit and track what they owe.": "ကောင်တာတွင် တိုက်ရိုက်ရောင်းချရန် ဖောက်သည် မလိုပါ။ အကြွေးရောင်းရန်နှင့် ပေးရန်ကျန်ငွေကို မှတ်သားရန် ဖောက်သည်များကို ထည့်ပါ။", "Owes you": "သင့်ကို ပေးရန်ကျန်", "Receive": "လက်ခံမည်", "Search name or phone…": "အမည် သို့မဟုတ် ဖုန်း ရှာရန်…", "Search customers": "ဖောက်သည်များ ရှာရန်", "All balances": "ကျန်ငွေအားလုံး", "Owing only": "ပေးရန်ကျန်သူများသာ", "+ New customer": "+ ဖောက်သည်အသစ်", "No active products match this selection.": "ဤရွေးချယ်မှုနှင့် ကိုက်ညီသော အသုံးပြုဆဲ ကုန်ပစ္စည်း မရှိပါ။", "This stocktake is already applied and cannot be edited.": "ဤစတော့ရေတွက်မှုကို အသုံးချပြီးဖြစ်၍ ပြင်၍ မရပါ။", "Stocktake is not in draft state.": "စတော့ရေတွက်မှုသည် မူကြမ်းအခြေအနေတွင် မရှိပါ။", "No stocktakes yet": "စတော့ရေတွက်မှု မရှိသေးပါ", "Start a new stocktake to compare physical counts with system stock.": "ကိုယ်တိုင်ရေတွက်သည့် အရေအတွက်ကို စနစ်ထဲရှိ စတော့နှင့် နှိုင်းယှဉ်ရန် စတော့ရေတွက်မှုအသစ် စတင်ပါ။", "All products": "ကုန်ပစ္စည်းအားလုံး", "Created": "ဖန်တီးသည့်ရက်", "Count what is on the shelf, compare, then apply the differences.": "ကပ်ပေါ်ရှိ ပစ္စည်းကို ရေတွက်ပါ၊ နှိုင်းယှဉ်ပါ၊ ပြီးမှ ကွာခြားချက်များကို အသုံးချပါ။", "+ New stocktake": "+ စတော့ရေတွက်မှုအသစ်", "All active products": "အသုံးပြုဆဲ ကုန်ပစ္စည်းအားလုံး", "One category": "အမျိုးအစားတစ်ခု", "Optional, e.g. “Month-end count”": "မဖြည့်လည်းရ၊ ဥပမာ “လကုန်ရေတွက်မှု”", "New stocktake": "စတော့ရေတွက်မှုအသစ်", "Count": "ရေတွက်မည်", "Start": "စတင်မည်", "Stocktake not found": "စတော့ရေတွက်မှုကို မတွေ့ပါ", "Back to stocktakes": "စတော့ရေတွက်မှုများသို့ ပြန်သွားမည်", "Match": "ကိုက်ညီ", "{} of {} counted · {} difference(s)": "{} / {} ရေတွက်ပြီး · ကွာခြားချက် {} ခု", "Counts saved.": "ရေတွက်ထားသည်များကို သိမ်းပြီးပါပြီ။", "Save progress": "တိုးတက်မှုကို သိမ်းမည်", "{} product(s) will have their stock changed to the counted quantity.{} This creates stock movements and cannot be edited afterwards.": "ကုန်ပစ္စည်း {} ခု၏ စတော့ကို ရေတွက်ထားသော အရေအတွက်သို့ ပြောင်းလဲမည်။{} ၎င်းသည် စတော့လှုပ်ရှားမှုများကို ဖန်တီးမည်ဖြစ်ပြီး နောက်ပိုင်း ပြင်၍ မရပါ။", "Apply stocktake adjustments?": "စတော့ရေတွက်မှု ချိန်ညှိချက်များကို အသုံးချမလား?", "Apply adjustments": "ချိန်ညှိချက်များကို အသုံးချမည်", "‹ All stocktakes": "‹ စတော့ရေတွက်မှုအားလုံး", "System stock": "စနစ်ထဲရှိ စတော့", "Rent": "ဆိုင်ခန်းလခ", "Electricity": "မီးဖိုး", "Transport": "ပို့ဆောင်ခ", "Staff Wages": "ဝန်ထမ်းလစာ", "Packaging": "ထုပ်ပိုးမှု", "Maintenance": "ပြုပြင်ထိန်းသိမ်းမှု", "Other Expenses": "အခြားအသုံးစရိတ်များ", "Choose a category.": "အမျိုးအစားတစ်ခု ရွေးပါ။", "Describe what the money was spent on.": "ငွေကို ဘာအတွက် သုံးခဲ့သည်ကို ဖော်ပြပါ။", "Choose a payment method.": "ငွေပေးချေနည်းတစ်ခု ရွေးပါ။", "Enter the expense date.": "အသုံးစရိတ်ရက်စွဲကို ထည့်ပါ။", "Expense not found.": "အသုံးစရိတ်ကို မတွေ့ပါ။", "A voided expense cannot be edited.": "ပယ်ဖျက်ထားသော အသုံးစရိတ်ကို ပြင်၍ မရပါ။", "This expense is already voided.": "ဤအသုံးစရိတ်ကို ပယ်ဖျက်ပြီးဖြစ်သည်။", "A reason is required to void an expense.": "အသုံးစရိတ်ကို ပယ်ဖျက်ရန် အကြောင်းရင်း လိုအပ်သည်။", "New expense": "အသုံးစရိတ်အသစ်", "Use this for running costs. Stock you buy for resale goes in Purchases, not here.": "ဤနေရာကို လုပ်ငန်းလည်ပတ်စရိတ်များအတွက် သုံးပါ။ ပြန်ရောင်းရန် ဝယ်သောစတော့ကို ဤနေရာတွင်မဟုတ်ဘဲ ဝယ်ယူမှုများတွင် ထည့်ပါ။", "Expense saved.": "အသုံးစရိတ်ကို သိမ်းပြီးပါပြီ။", "The expense stays in the list marked as void and is no longer counted in totals or cash.": "အသုံးစရိတ်သည် ပယ်ဖျက်ထားသည်ဟု မှတ်ထားပြီး စာရင်းထဲတွင် ဆက်ရှိမည်ဖြစ်ပြီး စုစုပေါင်း သို့မဟုတ် ငွေသားတွင် မတွက်တော့ပါ။", "Keep": "ဆက်ထားမည်", "Void expense": "အသုံးစရိတ်ကို ပယ်ဖျက်မည်", "Expense voided.": "အသုံးစရိတ်ကို ပယ်ဖျက်ပြီးပါပြီ။", "By category": "အမျိုးအစားအလိုက်", "No expenses this month.": "ဤလတွင် အသုံးစရိတ် မရှိပါ။", "No expenses found": "အသုံးစရိတ် မတွေ့ပါ", "Record rent, electricity, wages and other running costs here.": "ဆိုင်ခန်းလခ၊ မီးဖိုး၊ လစာနှင့် အခြားလည်ပတ်စရိတ်များကို ဤနေရာတွင် မှတ်တမ်းတင်ပါ။", "Void": "ပယ်ဖျက်မည်", "Recorded": "မှတ်တမ်းတင်ခဲ့သည့်ရက်", "Search description or number…": "ဖော်ပြချက် သို့မဟုတ် နံပါတ် ရှာရန်…", "Search expenses": "အသုံးစရိတ်များ ရှာရန်", "Month": "လ", "All categories": "အမျိုးအစားအားလုံး", "All methods": "နည်းလမ်းအားလုံး", "Hide voided": "ပယ်ဖျက်ထားသည်များကို ဖျောက်မည်", "Show voided": "ပယ်ဖျက်ထားသည်များကို ပြမည်", "Running costs only. Stock purchases are not counted here.": "လည်ပတ်စရိတ်များသာ။ စတော့ဝယ်ယူမှုများကို ဤနေရာတွင် မတွက်ပါ။", "+ New expense": "+ အသုံးစရိတ်အသစ်", "Choose a date.": "ရက်စွဲတစ်ခု ရွေးပါ။", "A cash drawer is already recorded for this date.": "ဤရက်အတွက် ငွေအံဆွဲကို မှတ်တမ်းတင်ပြီးဖြစ်သည်။", "Enter the opening cash (0 or more).": "အဖွင့်ငွေသား ထည့်ပါ (၀ သို့မဟုတ် ထိုထက်များ)။", "The cash drawer for this day is closed.": "ဤနေ့အတွက် ငွေအံဆွဲကို ပိတ်ပြီးဖြစ်သည်။", "Enter an amount greater than 0.": "၀ ထက်ကြီးသော ပမာဏ ထည့်ပါ။", "A reason is required.": "အကြောင်းရင်း လိုအပ်သည်။", "This cash drawer is already closed.": "ဤငွေအံဆွဲကို ပိတ်ပြီးဖြစ်သည်။", "Enter the cash you counted (0 or more).": "ရေတွက်ထားသော ငွေသား ထည့်ပါ (၀ သို့မဟုတ် ထိုထက်များ)။", "The count is different from expected. Add a note explaining the difference.": "ရေတွက်မှုသည် မျှော်မှန်းထားသည်နှင့် ကွာခြားနေသည်။ ကွာခြားချက်ကို ရှင်းပြသော မှတ်ချက်တစ်ခု ထည့်ပါ။", "Opening cash": "အဖွင့်ငွေသား", "+ Cash sales": "+ ငွေသားရောင်းချမှု", "+ Customer payments": "+ ဖောက်သည်ပေးချေမှု", "+ Cash added": "+ ထည့်ထားသော ငွေသား", "− Cash refunds": "− ငွေသားပြန်အမ်းငွေ", "− Cash expenses": "− ငွေသားအသုံးစရိတ်", "− Supplier payments": "− ပေးသွင်းသူအား ပေးချေမှု", "− Cash withdrawn": "− ထုတ်ယူထားသော ငွေသား", "Expected cash": "မျှော်မှန်းထားသော ငွေသား", "Counted cash": "ရေတွက်ထားသော ငွေသား", "Difference": "ကွာခြားချက်", "Add cash to drawer": "အံဆွဲထဲသို့ ငွေသားထည့်မည်", "Withdraw cash": "ငွေသားထုတ်မည်", "Recorded.": "မှတ်တမ်းတင်ပြီးပါပြီ။", "Matches expected cash.": "မျှော်မှန်းထားသော ငွေသားနှင့် ကိုက်ညီသည်။", "Over by {}": "{} ပိုနေသည်", "Short by {}": "{} လိုနေသည်", "Expected cash in drawer: {}": "အံဆွဲထဲ မျှော်မှန်းထားသော ငွေသား: {}", "Counted cash (MMK)": "ရေတွက်ထားသော ငွေသား (MMK)", "Note (needed if different)": "မှတ်ချက် (ကွာခြားပါက လိုအပ်သည်)", "After closing, this day cannot be reopened.": "ပိတ်ပြီးနောက် ဤနေ့ကို ပြန်ဖွင့်၍ မရတော့ပါ။", "Close day": "ရက်ကို ပိတ်မည်", "Day closed.": "ရက်ကို ပိတ်ပြီးပါပြီ။", "The drawer for {} is still open.": "{} အတွက် အံဆွဲသည် ဖွင့်လျက်ပင် ရှိသေးသည်။", "Go to that day": "ထိုနေ့သို့ သွားမည်", "Suggested from the last closing ({}): {}.": "နောက်ဆုံးပိတ်ချိန်မှ အကြံပြုချက် ({}): {}။", "Count the cash in the drawer and enter it as opening cash.": "အံဆွဲထဲရှိ ငွေသားကို ရေတွက်ပြီး အဖွင့်ငွေသားအဖြစ် ထည့်ပါ။", "Opening cash (MMK)": "အဖွင့်ငွေသား (MMK)", "Cash drawer opened.": "ငွေအံဆွဲကို ဖွင့်ပြီးပါပြီ။", "Open drawer": "အံဆွဲဖွင့်မည်", "Closed": "ပိတ်ပြီး", "Open": "ဖွင့်ထား", "+ Customer payments (cash)": "+ ဖောက်သည်ပေးချေမှု (ငွေသား)", "− Supplier payments (cash)": "− ပေးသွင်းသူအား ပေးချေမှု (ငွေသား)", "Expected cash in drawer": "အံဆွဲထဲ မျှော်မှန်းထားသော ငွေသား", "Only cash is counted here. Mobile payments and bank transfers do not go in the drawer.": "ဤနေရာတွင် ငွေသားကိုသာ ရေတွက်သည်။ မိုဘိုင်းငွေပေးချေမှုနှင့် ဘဏ်လွှဲငွေများ အံဆွဲထဲ မဝင်ပါ။", "Add cash": "ငွေသားထည့်မည်", "Close the day": "ရက်ကို ပိတ်မည်", "Closing result": "ပိတ်ချိန်ရလဒ်", "Cash added / withdrawn": "ထည့်ထား / ထုတ်ယူထားသော ငွေသား", "Print closing report": "ပိတ်ချိန်အစီရင်ခံစာကို ပုံနှိပ်မည်", "No manual cash movements today.": "ယနေ့ ကိုယ်တိုင်ထည့်/ထုတ် ငွေသား မရှိပါ။", "No reconciliation history yet": "ကိုက်ညီမှုစစ်ဆေးမှတ်တမ်း မရှိသေးပါ", "Closed days appear here with the cash difference.": "ပိတ်ပြီးသော ရက်များသည် ငွေသားကွာခြားချက်နှင့်အတူ ဤနေရာတွင် ပေါ်မည်။", "Opening": "အဖွင့်", "Expected": "မျှော်မှန်း", "Counted": "ရေတွက်ပြီး", "Reconciliation history": "ကိုက်ညီမှုစစ်ဆေးမှတ်တမ်း", "Count the cash drawer each day and see any difference.": "နေ့စဉ် ငွေအံဆွဲကို ရေတွက်ပြီး ကွာခြားချက်ရှိလျှင် ကြည့်ပါ။", "That product is not available.": "ထိုကုန်ပစ္စည်း မရနိုင်ပါ။", "{}: only {} in stock.": "{}: လက်ကျန် {} သာ ရှိသည်။", "Item discount": "ကုန်ပစ္စည်းလျှော့ဈေး", "Value": "တန်ဖိုး", "Clear": "ရှင်းမည်", "Apply": "အသုံးချမည်", "Name is required.": "အမည် လိုအပ်သည်။", "Add at least one item.": "ပစ္စည်း အနည်းဆုံး တစ်ခု ထည့်ပါ။", "Fix the highlighted items before checkout.": "ငွေမရှင်းမီ အရောင်ခြယ်ထားသော ပစ္စည်းများကို ပြင်ပါ။", "Sale already recorded": "ရောင်းချမှုကို မှတ်တမ်းတင်ပြီးဖြစ်သည်", "Sale complete": "ရောင်းချမှု ပြီးစီးပါပြီ", "Change to give: {}": "ပြန်အမ်းရမည့်ငွေ: {}", "Unpaid balance recorded: {}": "မပေးရသေးသော ကျန်ငွေ မှတ်တမ်းတင်ထားသည်: {}", "New sale": "ရောင်းချမှုအသစ်", "Print receipt": "ဘောက်ချာကို ပုံနှိပ်မည်", "Selling below cost": "ကုန်ကျစရိတ်အောက် ရောင်းနေသည်", "These items would be sold below their purchase cost: {}. Continue?": "ဤပစ္စည်းများကို ဝယ်ဈေးအောက် ရောင်းမည်ဖြစ်သည်: {}။ ဆက်လုပ်မလား?", "Sell anyway": "ဘာပဲဖြစ်ဖြစ် ရောင်းမည်", "Search or scan barcode…  (F2)": "ရှာပါ သို့မဟုတ် ဘားကုဒ်စကင်ဖတ်ပါ…  (F2)", "Search products or scan barcode": "ကုန်ပစ္စည်းရှာပါ သို့မဟုတ် ဘားကုဒ်စကင်ဖတ်ပါ", "No products yet": "ကုန်ပစ္စည်း မရှိသေးပါ", "Add products first, then sell them here.": "ကုန်ပစ္စည်းများကို အရင်ထည့်ပြီး ဤနေရာတွင် ရောင်းချပါ။", "Go to Products": "ကုန်ပစ္စည်းများသို့ သွားမည်", "No matching products": "ကိုက်ညီသော ကုန်ပစ္စည်း မရှိပါ", "Try another name, SKU or barcode.": "အခြားအမည်၊ SKU သို့မဟုတ် ဘားကုဒ်ကို စမ်းကြည့်ပါ။", "Decrease": "လျှော့မည်", "Increase": "တိုးမည်", "Discount": "လျှော့ဈေး", "Walk-in customer": "ကောင်တာဝယ်သူ", "Sale discount": "ရောင်းချမှုလျှော့ဈေး", "Amount received": "လက်ခံရရှိသော ပမာဏ", "Unpaid balance": "မပေးရသေးသော ကျန်ငွေ", "Non-cash payment cannot be more than the total.": "ငွေသားမဟုတ်သော ငွေပေးချေမှုသည် စုစုပေါင်းထက် မများရပါ။", "Current sale": "လက်ရှိရောင်းချမှု", "Cart is empty": "ခြင်းတောင်း ဗလာဖြစ်နေသည်", "Tap a product or scan a barcode.": "ကုန်ပစ္စည်းကို နှိပ်ပါ သို့မဟုတ် ဘားကုဒ်စကင်ဖတ်ပါ။", "Subtotal": "စုစုပေါင်းခွဲ", "Discount applied": "အသုံးချထားသော လျှော့ဈေး", "+ New": "+ အသစ်", "Exact amount": "ငွေအတိအကျ", "Processing…": "လုပ်ဆောင်နေသည်…", "Checkout  (F9)": "ငွေရှင်းမည်  (F9)", "Cart ({}) · {}": "ခြင်းတောင်း ({}) · {}", "Several products match. Tap the one you want.": "ကိုက်ညီသော ကုန်ပစ္စည်း များစွာရှိသည်။ လိုချင်သည်ကို နှိပ်ပါ။", "No product with that name, SKU or barcode.": "ထိုအမည်၊ SKU သို့မဟုတ် ဘားကုဒ်ဖြင့် ကုန်ပစ္စည်း မရှိပါ။", "Opening stock": "အဖွင့်စတော့", "Stock addition": "စတော့တိုးခြင်း", "Stock reduction": "စတော့လျှော့ခြင်း", "Sales deduction": "ရောင်းချမှုကြောင့် နုတ်ခြင်း", "Purchase addition": "ဝယ်ယူမှုကြောင့် တိုးခြင်း", "Customer return": "ဖောက်သည်ပြန်ပေးခြင်း", "Supplier return": "ပေးသွင်းသူသို့ ပြန်ပို့ခြင်း", "Damaged goods": "ပျက်စီးသောပစ္စည်း", "Expired goods": "သက်တမ်းကုန်သောပစ္စည်း", "Lost goods": "ပျောက်ဆုံးသောပစ္စည်း", "Manual adjustment": "လက်ဖြင့် ချိန်ညှိခြင်း", "Stocktake adjustment": "စတော့ရေတွက်မှု ချိန်ညှိခြင်း", "Enter the expiry date as a valid date.": "သက်တမ်းကုန်ရက်ကို မှန်ကန်သော ရက်စွဲဖြင့် ထည့်ပါ။", "Enter the manufacturing date as a valid date.": "ထုတ်လုပ်သည့်ရက်ကို မှန်ကန်သော ရက်စွဲဖြင့် ထည့်ပါ။", "The manufacturing date cannot be after the expiry date.": "ထုတ်လုပ်သည့်ရက်သည် သက်တမ်းကုန်ရက်ထက် နောက်မကျရပါ။", "UNASSIGNED": "အသုတ်မသတ်မှတ်ရသေး", "The batch quantities of {} do not add up to its stock. Open Reports → Reconciliation.": "{} ၏ အသုတ်အရေအတွက်များသည် စတော့နှင့် မကိုက်ညီပါ။ အစီရင်ခံစာများ → ကိုက်ညီမှုစစ်ဆေးခြင်းကို ဖွင့်ပါ။", "OPENING": "အဖွင့်", "PURCHASE": "ဝယ်ယူ", "RETURNED": "ပြန်ပေး", "COUNTED": "ရေတွက်", "ADJUSTED": "ချိန်ညှိ", "ADDED": "ထည့်", "The chosen batch does not have that many units.": "ရွေးထားသော အသုတ်တွင် ထိုမျှ ယူနစ်မရှိပါ။", "Only {} of {} can be sold — the rest is expired. Record it as \"Expired goods\" in Inventory.": "{} ၏ {} သာ ရောင်းနိုင်သည် — ကျန်သည်မှာ သက်တမ်းကုန်နေသည်။ လက်ကျန်ပစ္စည်းတွင် \"သက်တမ်းကုန်သောပစ္စည်း\" အဖြစ် မှတ်တမ်းတင်ပါ။", "Insufficient stock: {} has {} available but {} was requested.": "စတော့ မလုံလောက်ပါ: {} တွင် {} သာ ရနိုင်ပြီး {} တောင်းထားသည်။", "Unknown stock movement type.": "မသိသော စတော့လှုပ်ရှားမှု အမျိုးအစား။", "Quantity must be a non-zero number.": "အရေအတွက်သည် ၀ မဟုတ်သော ဂဏန်းဖြစ်ရမည်။", "Enter a positive quantity — the movement type decides the direction.": "အပေါင်းကိန်း ထည့်ပါ — လှုပ်ရှားမှုအမျိုးအစားက တိုး/လျှော့ကို ဆုံးဖြတ်သည်။", "A reason is required for this stock change.": "ဤစတော့ပြောင်းလဲမှုအတွက် အကြောင်းရင်း လိုအပ်သည်။", "Product not found.": "ကုန်ပစ္စည်းကို မတွေ့ပါ။", "Insufficient stock: {} has {} but {} was requested.": "စတော့ မလုံလောက်ပါ: {} တွင် {} ရှိပြီး {} တောင်းထားသည်။", "(missing product)": "(ပျောက်နေသော ကုန်ပစ္စည်း)", "Add a product first.": "ကုန်ပစ္စည်းတစ်ခု အရင်ထည့်ပါ။", "e.g. delivery received, broken in store": "ဥပမာ ပစ္စည်းလက်ခံရရှိ၊ ဆိုင်ထဲတွင် ကွဲသွား", "Use + to add and − to remove (e.g. -3).": "တိုးရန် + နှင့် လျှော့ရန် − ကိုသုံးပါ (ဥပမာ -3)။", "Quantity to ADD.": "ထည့်မည့် အရေအတွက်။", "Quantity to REMOVE.": "နုတ်မည့် အရေအတွက်။", "Batch number": "အသုတ်နံပါတ်", "Manufacturing date": "ထုတ်လုပ်သည့်ရက်", "Expiry date": "သက်တမ်းကုန်ရက်", "Batch details apply when stock is added.": "အသုတ်အသေးစိတ်သည် စတော့ထည့်သည့်အခါ အသုံးချသည်။", "oldest first": "အဟောင်းဆုံးအရင်", "earliest expiry first": "သက်တမ်းအစောဆုံးအရင်", "Take from batch (when removing)": "အသုတ်မှ ယူမည် (နုတ်သည့်အခါ)", "Unit purchase cost (optional, updates average cost)": "တစ်ခုချင်း ဝယ်ဈေး (မဖြည့်လည်းရ၊ ပျမ်းမျှကုန်ကျစရိတ်ကို အပ်ဒိတ်လုပ်သည်)", "Adjust stock": "စတော့ ချိန်ညှိမည်", "Movement type": "လှုပ်ရှားမှုအမျိုးအစား", "Stock updated.": "စတော့ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။", "In stock": "လက်ကျန်", "Retail value": "လက်လီတန်ဖိုး", "Cost value": "ကုန်ကျစရိတ်တန်ဖိုး", "Adjust": "ချိန်ညှိမည်", "No products to show": "ပြရန် ကုန်ပစ္စည်း မရှိပါ", "Add products on the Products page, or change the filters.": "ကုန်ပစ္စည်းများစာမျက်နှာတွင် ကုန်ပစ္စည်းထည့်ပါ၊ သို့မဟုတ် စစ်ထုတ်မှုများကို ပြောင်းပါ။", "No stock movements": "စတော့လှုပ်ရှားမှု မရှိပါ", "Every stock change is recorded here automatically.": "စတော့ပြောင်းလဲမှုတိုင်းကို ဤနေရာတွင် အလိုအလျောက် မှတ်တမ်းတင်သည်။", "Search name, SKU or barcode…": "အမည်၊ SKU သို့မဟုတ် ဘားကုဒ် ရှာရန်…", "Search": "ရှာဖွေမည်", "No product with that barcode or SKU.": "ထိုဘားကုဒ် သို့မဟုတ် SKU ဖြင့် ကုန်ပစ္စည်း မရှိပါ။", "All stock levels": "လက်ကျန်အဆင့်အားလုံး", "All movement types": "လှုပ်ရှားမှုအမျိုးအစားအားလုံး", "From date": "စတင်ရက်", "To date": "ပြီးဆုံးရက်", "Stock levels": "လက်ကျန်အဆင့်များ", "Stock levels, valuation and the full movement history.": "လက်ကျန်အဆင့်များ၊ တန်ဖိုးသတ်မှတ်ချက်နှင့် လှုပ်ရှားမှုမှတ်တမ်းအပြည့်အစုံ။", "Uncategorised": "အမျိုးအစားမခွဲ", "Today's": "ယနေ့၏", "Period": "ကာလ", "Inventory cost value": "လက်ကျန်ပစ္စည်း ကုန်ကျစရိတ်တန်ဖိုး", "Show (admin PIN)": "ပြမည် (admin PIN)", "Hide": "ဖျောက်မည်", "Date range": "ရက်စွဲအပိုင်းအခြား", "From": "မှ", "To": "အထိ", "Revenue": "ရောင်းရငွေ", "Sales trend": "ရောင်းချမှုလမ်းကြောင်း", "No sales in this period": "ဤကာလတွင် ရောင်းချမှု မရှိပါ", "Completed sales will appear here.": "ပြီးစီးသော ရောင်းချမှုများ ဤနေရာတွင် ပေါ်မည်။", "Sales by category": "အမျိုးအစားအလိုက် ရောင်းချမှု", "No category sales yet": "အမျိုးအစားအလိုက် ရောင်းချမှု မရှိသေးပါ", "Total products": "ကုန်ပစ္စည်းစုစုပေါင်း", "Total stock units": "စတော့ယူနစ်စုစုပေါင်း", "Inventory retail value": "လက်ကျန်ပစ္စည်း လက်လီတန်ဖိုး", "Revenue (net of discounts)": "ရောင်းရငွေ (လျှော့ဈေးနုတ်ပြီး)", "— hidden —": "— ဖျောက်ထားသည် —", "Revenue − cost of goods sold": "ရောင်းရငွေ − ရောင်းချသောပစ္စည်း၏ ကုန်ကျစရိတ်", "Needs the admin PIN (Reports → Profit)": "admin PIN လိုအပ်သည် (အစီရင်ခံစာများ → အမြတ်)", "Operating expenses only": "လည်ပတ်စရိတ်များသာ", "Gross profit − expenses": "စုစုပေါင်းအမြတ် − အသုံးစရိတ်", "Needs the admin PIN": "admin PIN လိုအပ်သည်", "Best-selling products": "အရောင်းရဆုံး ကုန်ပစ္စည်းများ", "No sales yet": "ရောင်းချမှု မရှိသေးပါ", "Low stock": "လက်ကျန်နည်း", "Nothing running low": "နည်းလာသည် မရှိပါ", "Out of stock": "ကုန်သွားပြီ", "Out": "ကုန်", "No out-of-stock products": "ကုန်သွားသော ကုန်ပစ္စည်း မရှိပါ", "Recent transactions": "မကြာသေးမီ ငွေကြေးလုပ်ဆောင်မှုများ", "No transactions yet": "ငွေကြေးလုပ်ဆောင်မှု မရှိသေးပါ", "Recent inventory movements": "မကြာသေးမီ စတော့လှုပ်ရှားမှုများ", "No stock movements yet": "စတော့လှုပ်ရှားမှု မရှိသေးပါ", "Recent activity": "မကြာသေးမီ လုပ်ဆောင်ချက်များ", "No activity yet": "လုပ်ဆောင်ချက် မရှိသေးပါ", "Cash & balances": "ငွေသားနှင့် ကျန်ငွေများ", "Cash received (sales + customer payments)": "လက်ခံရရှိသော ငွေသား (ရောင်းချမှု + ဖောက်သည်ပေးချေမှု)", "Cash paid out (refunds, suppliers, expenses)": "ထုတ်ပေးသော ငွေသား (ပြန်အမ်းငွေ၊ ပေးသွင်းသူ၊ အသုံးစရိတ်)", "Net cash movement": "ငွေသားအသားတင် လှုပ်ရှားမှု", "Pending customer payments (receivables)": "ဖောက်သည်များထံမှ ရရန်ကျန်ငွေ (ရရန်ရှိသည်များ)", "Outstanding supplier payments (payables)": "ပေးသွင်းသူများအား ပေးရန်ကျန်ငွေ (ပေးရန်ရှိသည်များ)", "Choose a supplier.": "ပေးသွင်းသူတစ်ဦး ရွေးပါ။", "Enter the purchase date.": "ဝယ်ယူသည့်ရက်စွဲကို ထည့်ပါ။", "Add at least one product.": "ကုန်ပစ္စည်း အနည်းဆုံး တစ်ခု ထည့်ပါ။", "A product on this purchase no longer exists.": "ဤဝယ်ယူမှုပါ ကုန်ပစ္စည်းတစ်ခု မရှိတော့ပါ။", "Additional costs and discount cannot be negative.": "အပိုကုန်ကျစရိတ်နှင့် လျှော့ဈေးသည် အနုတ်မဖြစ်ရပါ။", "The discount is larger than the purchase amount.": "လျှော့ဈေးသည် ဝယ်ယူမှုပမာဏထက် ကြီးနေသည်။", "Only draft purchases can be edited.": "မူကြမ်းဝယ်ယူမှုများကိုသာ ပြင်နိုင်သည်။", "Only draft purchases can be cancelled.": "မူကြမ်းဝယ်ယူမှုများကိုသာ ပယ်ဖျက်နိုင်သည်။", "Purchase not found.": "ဝယ်ယူမှုကို မတွေ့ပါ။", "This purchase is already confirmed. Stock was added once and cannot be added again.": "ဤဝယ်ယူမှုကို အတည်ပြုပြီးဖြစ်သည်။ စတော့ကို တစ်ကြိမ်ထည့်ပြီး ထပ်ထည့်၍ မရပါ။", "Only draft purchases can be confirmed.": "မူကြမ်းဝယ်ယူမှုများကိုသာ အတည်ပြုနိုင်သည်။", "This supplier is archived. Restore the supplier before confirming.": "ဤပေးသွင်းသူကို သိမ်းဆည်းထားသည်။ အတည်မပြုမီ ပေးသွင်းသူကို ပြန်လည်ရယူပါ။", "Draft": "မူကြမ်း", "Cancelled": "ပယ်ဖျက်ပြီး", "Interrupted": "ကြားဖြတ်ခံရသည်", "Paid": "ပေးချေပြီး", "Add a supplier first (Suppliers page).": "ပေးသွင်းသူတစ်ဦး အရင်ထည့်ပါ (ပေးသွင်းသူများစာမျက်နှာ)။", "Add products first (Products page).": "ကုန်ပစ္စည်းများကို အရင်ထည့်ပါ (ကုန်ပစ္စည်းများစာမျက်နှာ)။", "— choose supplier —": "— ပေးသွင်းသူ ရွေးပါ —", "Type a product name, SKU or scan a barcode, then Enter": "ကုန်ပစ္စည်းအမည်၊ SKU ရိုက်ပါ သို့မဟုတ် ဘားကုဒ်စကင်ဖတ်ပြီး Enter နှိပ်ပါ", "No matching product.": "ကိုက်ညီသော ကုန်ပစ္စည်း မရှိပါ။", "Qty": "အရေအတွက်", "Unit cost (MMK)": "တစ်ခုချင်းကုန်ကျစရိတ် (MMK)", "Line total": "စုစုပေါင်း (တစ်ကြောင်း)", "Batch no.": "အသုတ်နံပါတ်", "Search above to add what you bought.": "ဝယ်ထားသည့်ပစ္စည်းကို ထည့်ရန် အပေါ်တွင် ရှာပါ။", "Products subtotal": "ကုန်ပစ္စည်းများ စုစုပေါင်းခွဲ", "Additional costs (transport, etc.)": "အပိုကုန်ကျစရိတ် (ပို့ဆောင်ခ စသည်)", "Additional costs and discount are spread over the products, so each item’s stock cost includes its share.": "အပိုကုန်ကျစရိတ်နှင့် လျှော့ဈေးကို ကုန်ပစ္စည်းများအပေါ် ခွဲဝေသဖြင့် ပစ္စည်းတစ်ခုချင်း၏ စတော့ကုန်ကျစရိတ်တွင် ၎င်း၏ဝေစုပါဝင်သည်။", "New purchase": "ဝယ်ယူမှုအသစ်", "Purchase date": "ဝယ်ယူသည့်ရက်", "Add product": "ကုန်ပစ္စည်းထည့်မည်", "Additional costs (MMK)": "အပိုကုန်ကျစရိတ် (MMK)", "Save draft": "မူကြမ်းသိမ်းမည်", "Draft saved.": "မူကြမ်းကို သိမ်းပြီးပါပြီ။", "Save & confirm…": "သိမ်းပြီး အတည်ပြုမည်…", "{} will be added to what you owe {}.": "{} ကို သင်ပေးရန်ကျန်သော {} ထံသို့ ပေါင်းထည့်မည်။", "Paid in full.": "ငွေအပြည့်အဝ ပေးချေပြီး။", "Confirming adds the stock to your inventory and cannot be done twice.": "အတည်ပြုခြင်းသည် စတော့ကို သင့်လက်ကျန်ထဲ ထည့်မည်ဖြစ်ပြီး နှစ်ကြိမ်လုပ်၍ မရပါ။", "Amount paid now (MMK)": "ယခုပေးချေသော ပမာဏ (MMK)", "Back": "နောက်သို့", "Confirm purchase": "ဝယ်ယူမှုကို အတည်ပြုမည်", "Purchase confirmed. Stock updated.": "ဝယ်ယူမှုကို အတည်ပြုပြီးပါပြီ။ စတော့ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။", "Item": "ပစ္စည်း", "Unit cost": "တစ်ခုချင်းကုန်ကျစရိတ်", "Additional costs": "အပိုကုန်ကျစရိတ်", "Balance owed": "ပေးရန်ကျန်ငွေ", "A4 invoice": "A4 ပြေစာ", "Stock cost*": "စတော့ကုန်ကျစရိတ်*", "*Stock cost = unit cost plus the item’s share of additional costs, minus discount.": "*စတော့ကုန်ကျစရိတ် = တစ်ခုချင်းကုန်ကျစရိတ် + ပစ္စည်း၏ အပိုကုန်ကျစရိတ်ဝေစု − လျှော့ဈေး။", "Print invoice": "ပြေစာပုံနှိပ်မည်", "Pay supplier": "ပေးသွင်းသူအား ငွေပေးချေမည်", "Unit costs are visible. They hide again when you leave this page.": "တစ်ခုချင်းကုန်ကျစရိတ်များကို ပြထားသည်။ ဤစာမျက်နှာမှ ထွက်လိုက်သည့်အခါ ပြန်ဖျောက်မည်။", "Unit costs are hidden. Totals and balances are shown below; open or create a purchase with the administrator PIN.": "တစ်ခုချင်းကုန်ကျစရိတ်များကို ဖျောက်ထားသည်။ စုစုပေါင်းနှင့် ကျန်ငွေများကို အောက်တွင် ပြထားသည်၊ စီမံခန့်ခွဲသူ PIN ဖြင့် ဝယ်ယူမှုကို ဖွင့်ပါ သို့မဟုတ် ဖန်တီးပါ။", "Hide costs": "ကုန်ကျစရိတ်များ ဖျောက်မည်", "Unlock (admin PIN)": "ဖွင့်မည် (admin PIN)", "No purchases yet": "ဝယ်ယူမှု မရှိသေးပါ", "Record what you buy from suppliers. Confirmed purchases add stock.": "ပေးသွင်းသူများထံမှ ဝယ်ယူသည်များကို မှတ်တမ်းတင်ပါ။ အတည်ပြုပြီးသော ဝယ်ယူမှုများသည် စတော့ကို တိုးစေသည်။", "Owed": "ပေးရန်ကျန်", "Confirm": "အတည်ပြုမည်", "Cancel draft?": "မူကြမ်းကို ပယ်ဖျက်မလား?", "Cancel draft": "မူကြမ်းကို ပယ်ဖျက်မည်", "Cancelled by user": "အသုံးပြုသူက ပယ်ဖျက်သည်", "Pay": "ပေးချေမည်", "Search number or supplier…": "နံပါတ် သို့မဟုတ် ပေးသွင်းသူ ရှာရန်…", "Search purchases": "ဝယ်ယူမှုများ ရှာရန်", "All statuses": "အခြေအနေအားလုံး", "All suppliers": "ပေးသွင်းသူအားလုံး", "Stock you buy from suppliers. Expenses like rent are recorded separately.": "ပေးသွင်းသူများထံမှ ဝယ်သောစတော့။ ဆိုင်ခန်းလခကဲ့သို့ အသုံးစရိတ်များကို သီးခြားမှတ်တမ်းတင်သည်။", "+ New purchase": "+ ဝယ်ယူမှုအသစ်", "Cash": "ငွေသား", "Bank Transfer": "ဘဏ်လွှဲငွေ", "Other": "အခြား", "Discount cannot be negative.": "လျှော့ဈေးသည် အနုတ်မဖြစ်ရပါ။", "Discount percentage must be between 0 and 100.": "လျှော့ဈေးရာခိုင်နှုန်းသည် ၀ နှင့် ၁၀၀ ကြားဖြစ်ရမည်။", "Discount is larger than the amount it applies to.": "လျှော့ဈေးသည် သက်ရောက်သည့်ပမာဏထက် ကြီးနေသည်။", "Product no longer exists.": "ကုန်ပစ္စည်း မရှိတော့ပါ။", "This product is archived and cannot be sold.": "ဤကုန်ပစ္စည်းကို သိမ်းဆည်းထားပြီး ရောင်း၍ မရပါ။", "This product appears twice in the cart.": "ဤကုန်ပစ္စည်းသည် ခြင်းတောင်းထဲတွင် နှစ်ကြိမ်ပါနေသည်။", "Quantity must be greater than 0.": "အရေအတွက်သည် ၀ ထက် ကြီးရမည်။", "This item is sold in whole numbers.": "ဤပစ္စည်းကို ကိန်းပြည့်ဖြင့်သာ ရောင်းသည်။", "Insufficient stock: only {} available.": "စတော့ မလုံလောက်ပါ: {} သာ ရနိုင်သည်။", "The cart is empty.": "ခြင်းတောင်း ဗလာဖြစ်နေသည်။", "The total must be more than 0 MMK.": "စုစုပေါင်းသည် ၀ MMK ထက် ပိုရမည်။", "Choose a valid payment method.": "မှန်ကန်သော ငွေပေးချေနည်းတစ်ခု ရွေးပါ။", "Amount received cannot be negative.": "လက်ခံရရှိသော ပမာဏသည် အနုတ်မဖြစ်ရပါ။", "For non-cash payments the amount received cannot be more than the total.": "ငွေသားမဟုတ်သော ငွေပေးချေမှုတွင် လက်ခံရရှိသော ပမာဏသည် စုစုပေါင်းထက် မများရပါ။", "The selected customer no longer exists.": "ရွေးထားသော ဖောက်သည် မရှိတော့ပါ။", "Partial payment is turned off. Collect the full amount, or allow partial payments in Settings.": "တစ်စိတ်တစ်ပိုင်းပေးချေမှုကို ပိတ်ထားသည်။ ငွေအပြည့်အဝ လက်ခံပါ၊ သို့မဟုတ် ဆက်တင်များတွင် ခွင့်ပြုပါ။", "Choose a customer to record an unpaid balance. Walk-in sales must be paid in full.": "မပေးရသေးသော ကျန်ငွေကို မှတ်တမ်းတင်ရန် ဖောက်သည်တစ်ဦး ရွေးပါ။ ကောင်တာတွင် တိုက်ရိုက်ရောင်းချမှုများသည် ငွေအပြည့်အဝ ပေးရမည်။", "Interrupted before completion; stock and balances were rolled back.": "မပြီးစီးမီ ကြားဖြတ်ခံရသည်၊ စတော့နှင့် ကျန်ငွေများကို ပြန်လည်ပယ်ဖျက်ပြီးဖြစ်သည်။", "Unknown sale line.": "မသိသော ရောင်းချမှုစာကြောင်း။", "Cannot refund {} of {}; only {} left to refund.": "{} ၏ {} ကို ပြန်အမ်း၍ မရပါ၊ ပြန်အမ်းရန် {} သာ ကျန်သည်။", "Select at least one item to refund.": "ပြန်အမ်းရန် ပစ္စည်း အနည်းဆုံး တစ်ခု ရွေးပါ။", "Only completed sales can be refunded or cancelled.": "ပြီးစီးသော ရောင်းချမှုများကိုသာ ပြန်အမ်း သို့မဟုတ် ပယ်ဖျက်နိုင်သည်။", "This sale already has refunds. Refund the remaining items instead of cancelling.": "ဤရောင်းချမှုတွင် ပြန်အမ်းငွေ ရှိပြီးဖြစ်သည်။ ပယ်ဖျက်မည့်အစား ကျန်ပစ္စည်းများကို ပြန်အမ်းပါ။", "Choose a valid refund method.": "မှန်ကန်သော ပြန်အမ်းနည်းတစ်ခု ရွေးပါ။", "Cancelled {}": "{} ကို ပယ်ဖျက်ပြီး", "Refund {}": "ပြန်အမ်းငွေ {}", "Rolled back": "ပြန်လည်ပယ်ဖျက်ပြီး", "Pending": "စောင့်ဆိုင်းဆဲ", "Refunded": "ပြန်အမ်းပြီး", "Partly refunded": "တစ်စိတ်တစ်ပိုင်း ပြန်အမ်းပြီး", "Completed": "ပြီးစီး", "Receipt": "ဘောက်ချာ", "Receipt no.": "ဘောက်ချာနံပါတ်", "Price": "ဈေးနှုန်း", "Tax": "အခွန်", "Payment": "ငွေပေးချေမှု", "Balance due": "ပေးရန်ကျန်ငွေ", "COPY (reprint)": "မိတ္တူ (ပြန်ပုံနှိပ်)", "58 mm thermal": "58 mm သာမယ်", "80 mm thermal": "80 mm သာမယ်", "e.g. damaged item, wrong product": "ဥပမာ ပျက်စီးသောပစ္စည်း၊ ကုန်ပစ္စည်းမှားနေ", "— {} reduces the customer’s unpaid balance, {} is paid back.": "— {} ကို ဖောက်သည်၏ မပေးရသေးသော ကျန်ငွေမှ လျှော့မည်၊ {} ကို ပြန်အမ်းမည်။", "paid back to the customer.": "ဖောက်သည်အား ပြန်အမ်းမည်။", "Sold": "ရောင်းပြီး", "Refundable": "ပြန်အမ်းနိုင်သည်", "Refund qty": "ပြန်အမ်းအရေအတွက်", "Pay refund by": "ပြန်အမ်းငွေပေးချေနည်း", "Record refund": "ပြန်အမ်းငွေကို မှတ်တမ်းတင်မည်", "All items go back into stock and the full amount is returned. The sale stays in the history marked as cancelled.": "ပစ္စည်းအားလုံးသည် စတော့ထဲ ပြန်ဝင်ပြီး ငွေအပြည့်အဝ ပြန်အမ်းမည်။ ရောင်းချမှုသည် ပယ်ဖျက်ထားသည်ဟု မှတ်ကာ မှတ်တမ်းထဲတွင် ဆက်ရှိမည်။", "Return money by": "ငွေပြန်အမ်းနည်း", "Keep sale": "ရောင်းချမှုကို ဆက်ထားမည်", "Cancel sale": "ရောင်းချမှုကို ပယ်ဖျက်မည်", "Sale cancelled.": "ရောင်းချမှုကို ပယ်ဖျက်ပြီးပါပြီ။", "Note": "မှတ်ချက်", "Change given": "ပြန်အမ်းထားသော ငွေ", "Refund history": "ပြန်အမ်းငွေမှတ်တမ်း", "Refund…": "ပြန်အမ်းမည်…", "Cancel sale…": "ရောင်းချမှုကို ပယ်ဖျက်မည်…", "No sales found": "ရောင်းချမှု မတွေ့ပါ", "Completed sales appear here. Change the filters or make a sale in POS.": "ပြီးစီးသော ရောင်းချမှုများ ဤနေရာတွင် ပေါ်မည်။ စစ်ထုတ်မှုများကို ပြောင်းပါ သို့မဟုတ် POS တွင် ရောင်းချပါ။", "Items": "ပစ္စည်းများ", "Reprint": "ပြန်ပုံနှိပ်မည်", "Search number, customer or product…": "နံပါတ်၊ ဖောက်သည် သို့မဟုတ် ကုန်ပစ္စည်း ရှာရန်…", "Search sales": "ရောင်းချမှုများ ရှာရန်", "All payment methods": "ငွေပေးချေနည်းအားလုံး", "All customers": "ဖောက်သည်အားလုံး", "Piece": "ခု", "Pack": "ထုပ်", "Box": "သေတ္တာ", "Bottle": "ပုလင်း", "Kilogram": "ကီလိုဂရမ်", "Gram": "ဂရမ်", "Liter": "လီတာ", "Meter": "မီတာ", "Custom unit": "စိတ်ကြိုက်ယူနစ်", "IndexedDB unavailable": "IndexedDB မရနိုင်ပါ", "Image conversion failed": "ပုံပြောင်းလဲမှု မအောင်မြင်ပါ", "That file is not a readable image.": "ထိုဖိုင်သည် ဖတ်လို့ရသော ပုံမဟုတ်ပါ။", "Product name is required.": "ကုန်ပစ္စည်းအမည် လိုအပ်သည်။", "This SKU is already used by another product.": "ဤ SKU ကို အခြားကုန်ပစ္စည်းက သုံးပြီးသားဖြစ်သည်။", "This code is already used as another product’s barcode.": "ဤကုဒ်ကို အခြားကုန်ပစ္စည်း၏ ဘားကုဒ်အဖြစ် သုံးပြီးသားဖြစ်သည်။", "This barcode is already assigned to another product.": "ဤဘားကုဒ်ကို အခြားကုန်ပစ္စည်းတစ်ခုတွင် သတ်မှတ်ပြီးသားဖြစ်သည်။", "This barcode matches another product’s SKU.": "ဤဘားကုဒ်သည် အခြားကုန်ပစ္စည်း၏ SKU နှင့် တူနေသည်။", "Enter the selling price (whole MMK, 0 or more).": "ရောင်းဈေးကို ထည့်ပါ (ကိန်းပြည့် MMK၊ ၀ သို့မဟုတ် ထိုထက်များ)။", "Purchase price cannot be negative.": "ဝယ်ဈေးသည် အနုတ်မဖြစ်ရပါ။", "Threshold must be 0 or more.": "အဆင့်သည် ၀ သို့မဟုတ် ထိုထက်များရမည်။", "Enter the custom unit name.": "စိတ်ကြိုက်ယူနစ်အမည်ကို ထည့်ပါ။", "Opening stock must be 0 or more.": "အဖွင့်စတော့သည် ၀ သို့မဟုတ် ထိုထက်များရမည်။", "Purchase price (MMK) — admin only": "ဝယ်ဈေး (MMK) — admin အတွက်သာ", "Never shown to customers, on receipts, or in standard lists.": "ဖောက်သည်များအား၊ ဘောက်ချာများတွင်၊ သို့မဟုတ် ပုံမှန်စာရင်းများတွင် ဘယ်တော့မှ မပြပါ။", "Administrator PIN": "စီမံခန့်ခွဲသူ PIN", "Incorrect PIN.": "PIN မမှန်ပါ။", "Purchase price is hidden. Enter the administrator PIN to view or set it.": "ဝယ်ဈေးကို ဖျောက်ထားသည်။ ကြည့်ရန် သို့မဟုတ် သတ်မှတ်ရန် စီမံခန့်ခွဲသူ PIN ထည့်ပါ။", "Unlock": "ဖွင့်မည်", "— none —": "— မရှိ —", "— no suppliers yet (Phase 4) —": "— ပေးသွင်းသူ မရှိသေးပါ —", "Generate code": "ကုဒ်ဖန်တီးမည်", "Custom unit name": "စိတ်ကြိုက်ယူနစ်အမည်", "Product image": "ကုန်ပစ္စည်းပုံ", "Selling price is below purchase cost.": "ရောင်းဈေးသည် ဝယ်ဈေးအောက်တွင် ရှိနေသည်။", "Batch number (opening stock)": "အသုတ်နံပါတ် (အဖွင့်စတော့)", "Product name": "ကုန်ပစ္စည်းအမည်", "SKU / product code": "SKU / ကုန်ပစ္စည်းကုဒ်", "Leave blank to generate one automatically.": "အလိုအလျောက် ဖန်တီးရန် ဗလာထားပါ။", "Brand": "အမှတ်တံဆိပ်", "Low-stock threshold": "လက်ကျန်နည်းသည့် အဆင့်", "Current stock": "လက်ရှိစတော့", "— change it with Adjust stock so the movement is recorded": "— လှုပ်ရှားမှုကို မှတ်တမ်းတင်ရန် \"စတော့ ချိန်ညှိမည်\" ဖြင့် ပြောင်းပါ", "Expiry & batches (optional)": "သက်တမ်းကုန်ရက်နှင့် အသုတ်များ (မဖြည့်လည်းရ)", "Track batch numbers and expiry dates for this product": "ဤကုန်ပစ္စည်းအတွက် အသုတ်နံပါတ်နှင့် သက်တမ်းကုန်ရက်ကို မှတ်သားမည်", "Stock is then issued earliest-expiry-first (FEFO, changeable in Settings), expired stock is never sold, and near-expiry alerts appear.": "ထိုအခါ စတော့ကို သက်တမ်းအစောဆုံးအရင် ထုတ်ပေးမည် (FEFO၊ ဆက်တင်များတွင် ပြောင်းနိုင်သည်)၊ သက်တမ်းကုန်စတော့ကို ဘယ်တော့မှ မရောင်းပါ၊ သက်တမ်းကုန်ခါနီး သတိပေးချက်များ ပေါ်လာမည်။", "Variant (optional)": "မျိုးကွဲ (မဖြည့်လည်းရ)", "Size": "အရွယ်အစား", "Color": "အရောင်", "Model": "မော်ဒယ်", "Image (stored compactly in the browser’s IndexedDB)": "ပုံ (ဘရောက်ဇာ၏ IndexedDB တွင် ချုံ့၍ သိမ်းထားသည်)", "Edit product": "ကုန်ပစ္စည်း ပြင်မည်", "Batches & expiry": "အသုတ်များနှင့် သက်တမ်းကုန်ရက်", "Batch": "အသုတ်", "Expiry": "သက်တမ်းကုန်ရက်", "Expired": "သက်တမ်းကုန်ပြီ", "No stock in any batch.": "မည်သည့်အသုတ်တွင်မျှ စတော့ မရှိပါ။", "Previous": "ယခင်", "New": "အသစ်", "No changes recorded.": "ပြောင်းလဲမှု မှတ်တမ်း မရှိပါ။", "Purchase price": "ဝယ်ဈေး", "Average cost": "ပျမ်းမျှကုန်ကျစရိတ်", "Margin per unit": "တစ်ခုချင်းအမြတ်ဖြတ်", "Purchase price history": "ဝယ်ဈေးမှတ်တမ်း", "Selling price is below purchase cost": "ရောင်းဈေးသည် ဝယ်ဈေးအောက်တွင် ရှိနေသည်", "Purchase price hidden. {}": "ဝယ်ဈေးကို ဖျောက်ထားသည်။ {}", "Show with admin PIN": "admin PIN ဖြင့် ပြမည်", "Variant": "မျိုးကွဲ", "Selling price": "ရောင်းဈေး", "Last updated": "နောက်ဆုံးအပ်ဒိတ်", "Selling price history": "ရောင်းဈေးမှတ်တမ်း", "Recent stock movements": "မကြာသေးမီ စတော့လှုပ်ရှားမှုများ", "No movements yet.": "လှုပ်ရှားမှု မရှိသေးပါ။", "Select products first (use the checkboxes).": "ကုန်ပစ္စည်းများကို အရင်ရွေးပါ (အကွက်များကို သုံးပါ)။", "Change by percentage (%)": "ရာခိုင်နှုန်းဖြင့် ပြောင်းမည် (%)", "Change by amount (MMK)": "ပမာဏဖြင့် ပြောင်းမည် (MMK)", "Set exact price (MMK)": "ဈေးနှုန်းအတိအကျ သတ်မှတ်မည် (MMK)", "e.g. 10 or -5": "ဥပမာ 10 သို့မဟုတ် -5", "Nearest 1 MMK": "အနီးဆုံး ၁ MMK", "Nearest 10 MMK": "အနီးဆုံး ၁၀ MMK", "Nearest 50 MMK": "အနီးဆုံး ၅၀ MMK", "Nearest 100 MMK": "အနီးဆုံး ၁၀၀ MMK", "{} of {} product(s) will change. Example: {}": "ကုန်ပစ္စည်း {} ခုအနက် {} ခု ပြောင်းလဲမည်။ ဥပမာ: {}", "no change": "မပြောင်းလဲ", "Bulk price update ({} products)": "ဈေးနှုန်း အစုလိုက်ပြောင်းခြင်း (ကုန်ပစ္စည်း {} ခု)", "Round to": "ဖြတ်မည့်အဆင့်", "Enter a value.": "တန်ဖိုးတစ်ခု ထည့်ပါ။", "Bulk stock adjustment ({} products)": "စတော့ အစုလိုက်ချိန်ညှိခြင်း (ကုန်ပစ္စည်း {} ခု)", "The same quantity is applied to every selected product. Products that would go negative are skipped and reported.": "ရွေးထားသော ကုန်ပစ္စည်းတိုင်းတွင် အရေအတွက်တူတူ အသုံးချမည်။ အနုတ်ဖြစ်သွားမည့် ကုန်ပစ္စည်းများကို ကျော်ပြီး အစီရင်ခံမည်။", "Quantity each": "တစ်ခုစီ၏ အရေအတွက်", "Quantity and reason are required.": "အရေအတွက်နှင့် အကြောင်းရင်း လိုအပ်သည်။", "{} updated{}.": "{} ခု အပ်ဒိတ်လုပ်ပြီး{}။", "No products found": "ကုန်ပစ္စည်း မတွေ့ပါ", "Add your first product with “+ New product”, or adjust the filters.": "“+ ကုန်ပစ္စည်းအသစ်” ဖြင့် ပထမဆုံးကုန်ပစ္စည်းကို ထည့်ပါ၊ သို့မဟုတ် စစ်ထုတ်မှုများကို ပြင်ပါ။", "SKU / Barcode": "SKU / ဘားကုဒ်", "Low": "နည်း", "Archive product?": "ကုန်ပစ္စည်းကို သိမ်းဆည်းမလား (archive)?", "“{}” will be hidden from lists and POS but stays in all past sales and reports.": "“{}” ကို စာရင်းများနှင့် POS တွင် ဖျောက်ထားမည်ဖြစ်ပြီး ယခင်ရောင်းချမှုများနှင့် အစီရင်ခံစာအားလုံးတွင် ဆက်ရှိမည်။", "Search products": "ကုန်ပစ္စည်းများ ရှာရန်", "Selling prices only — purchase prices stay hidden here.": "ရောင်းဈေးများသာ — ဝယ်ဈေးများကို ဤနေရာတွင် ဖျောက်ထားသည်။", "+ New product": "+ ကုန်ပစ္စည်းအသစ်", "Bulk price update": "ဈေးနှုန်း အစုလိုက်ပြောင်းမည်", "Bulk stock adjust": "စတော့ အစုလိုက်ချိန်ညှိမည်", "Print barcode labels": "ဘားကုဒ်တံဆိပ်များ ပုံနှိပ်မည်", "The file has no data section.": "ဖိုင်တွင် ဒေတာအပိုင်း မပါပါ။", "The \"{}\" section is missing — the file is incomplete.": "\"{}\" အပိုင်း ပျောက်နေသည် — ဖိုင်မပြည့်စုံပါ။", "The \"{}\" section has the wrong type.": "\"{}\" အပိုင်း၏ အမျိုးအစား မှားနေသည်။", "{} #{} is not a record.": "{} #{} သည် မှတ်တမ်းမဟုတ်ပါ။", "{} #{} has no id.": "{} #{} တွင် id မပါပါ။", "{} has the id {} twice.": "{} တွင် id {} နှစ်ကြိမ်ပါနေသည်။", "Some sales have no valid total.": "ရောင်းချမှုအချို့တွင် မှန်ကန်သော စုစုပေါင်း မရှိပါ။", "Some payments have no valid amount.": "ငွေပေးချေမှုအချို့တွင် မှန်ကန်သော ပမာဏ မရှိပါ။", "Some products have an invalid stock number.": "ကုန်ပစ္စည်းအချို့တွင် စတော့ဂဏန်း မမှန်ပါ။", "Images are not available in this browser.": "ဤဘရောက်ဇာတွင် ပုံများ မရနိုင်ပါ။", "This is not a SmartStock backup file.": "ဤသည်မှာ SmartStock အရန်ဖိုင် မဟုတ်ပါ။", "This file was not made by SmartStock.": "ဤဖိုင်ကို SmartStock က မဖန်တီးထားပါ။", "The file has no valid schema version.": "ဖိုင်တွင် မှန်ကန်သော schema ဗားရှင်း မရှိပါ။", "The backup was made by a newer SmartStock (schema {}; this app understands up to {}). Update the app first.": "အရန်ဖိုင်ကို SmartStock ဗားရှင်းအသစ် (schema {}၊ ဤအက်ပ်သည် {} အထိသာ နားလည်သည်) က ပြုလုပ်ထားသည်။ အက်ပ်ကို အရင်အဆင့်မြှင့်ပါ။", "No upgrade path from schema {} — this backup cannot be used.": "schema {} မှ အဆင့်မြှင့်ရန် လမ်းကြောင်း မရှိပါ — ဤအရန်ဖိုင်ကို သုံး၍ မရပါ။", "Unsupported backup format.": "မပံ့ပိုးသော အရန်ဖိုင်ပုံစံ။", "The record count for \"{}\" does not match the file header ({} expected, {} found) — the file is damaged.": "\"{}\" ၏ မှတ်တမ်းအရေအတွက်သည် ဖိုင်ခေါင်းစီးနှင့် မကိုက်ညီပါ ({} မျှော်မှန်း၊ {} တွေ့ရှိ) — ဖိုင်ပျက်စီးနေသည်။", "The checksum type is different, so it could not be checked.": "checksum အမျိုးအစား ကွဲပြားသဖြင့် စစ်ဆေး၍ မရပါ။", "The checksum does not match — the file was changed or damaged after it was saved.": "checksum မကိုက်ညီပါ — ဖိုင်ကို သိမ်းပြီးနောက် ပြောင်းလဲခံရ သို့မဟုတ် ပျက်စီးသွားသည်။", "The file has no checksum, so it cannot be verified.": "ဖိုင်တွင် checksum မပါသဖြင့် စစ်ဆေး၍ မရပါ။", "{} link problem(s) inside the backup, e.g. {}": "အရန်ဖိုင်အတွင်း ချိတ်ဆက်မှုပြဿနာ {} ခု၊ ဥပမာ {}", "Choose a backup file.": "အရန်ဖိုင်တစ်ခု ရွေးပါ။", "The file is larger than 100 MB, which is too big to be a SmartStock backup.": "ဖိုင်သည် 100 MB ထက်ကြီးသဖြင့် SmartStock အရန်ဖိုင်ဖြစ်ရန် ကြီးလွန်းသည်။", "The file is empty.": "ဖိုင်သည် ဗလာဖြစ်နေသည်။", "CSV file": "CSV ဖိုင်", "SmartStock backup": "SmartStock အရန်ဖိုင်", "Save a backup of your current data first.": "သင့်လက်ရှိဒေတာကို အရင်အရန်သိမ်းပါ။", "The data read back after restoring did not match the backup.": "ပြန်ယူပြီးနောက် ပြန်ဖတ်ထားသော ဒေတာသည် အရန်ဖိုင်နှင့် မကိုက်ညီပါ။", "There is no copy to go back to.": "ပြန်သွားရန် မိတ္တူ မရှိပါ။", "The stored data does not match the backup ({}).": "သိမ်းထားသော ဒေတာသည် အရန်ဖိုင်နှင့် မကိုက်ညီပါ ({})။", "Restore failed and your previous data was put back unchanged. {}": "ပြန်လည်ရယူခြင်း မအောင်မြင်ပါ၊ သင့်ယခင်ဒေတာကို မပြောင်းလဲဘဲ ပြန်ထားပြီးဖြစ်သည်။ {}", "This backup cannot be restored: {}": "ဤအရန်ဖိုင်ကို ပြန်လည်ရယူ၍ မရပါ: {}", "The backup could not be upgraded: {}": "အရန်ဖိုင်ကို အဆင့်မြှင့်၍ မရပါ: {}", "Name": "အမည်", "SKU": "SKU", "Barcode": "ဘားကုဒ်", "Category": "အမျိုးအစား", "Unit": "ယူနစ်", "Selling price (MMK)": "ရောင်းဈေး (MMK)", "Stock": "စတော့", "Low stock level": "လက်ကျန်နည်းသည့်အဆင့်", "Status": "အခြေအနေ", "Purchase price (MMK)": "ဝယ်ဈေး (MMK)", "Average cost (MMK)": "ပျမ်းမျှကုန်ကျစရိတ် (MMK)", "Inventory (stock levels)": "လက်ကျန်ပစ္စည်း (စတော့အဆင့်များ)", "Product": "ကုန်ပစ္စည်း", "Retail value (MMK)": "လက်လီတန်ဖိုး (MMK)", "Cost value (MMK)": "ကုန်ကျစရိတ်တန်ဖိုး (MMK)", "Invoice": "ပြေစာ", "Date": "ရက်စွဲ", "Customer": "ဖောက်သည်", "Subtotal (MMK)": "စုစုပေါင်းခွဲ (MMK)", "Discount (MMK)": "လျှော့ဈေး (MMK)", "Tax (MMK)": "အခွန် (MMK)", "Total (MMK)": "စုစုပေါင်း (MMK)", "Paid (MMK)": "ပေးချေပြီး (MMK)", "Balance (MMK)": "ကျန်ငွေ (MMK)", "Refunded (MMK)": "ပြန်အမ်းပြီး (MMK)", "Payment method": "ငွေပေးချေနည်း", "Walk-in": "ကောင်တာဝယ်သူ", "Sale items": "ရောင်းချမှုပစ္စည်းများ", "Quantity": "အရေအတွက်", "Refunded qty": "ပြန်အမ်းပြီး အရေအတွက်", "Unit price (MMK)": "တစ်ခုချင်းဈေး (MMK)", "Line total after discount (MMK)": "လျှော့ဈေးနုတ်ပြီး စုစုပေါင်း (MMK)", "Purchases (totals)": "ဝယ်ယူမှုများ (စုစုပေါင်း)", "No.": "နံပါတ်", "Supplier": "ပေးသွင်းသူ", "Owed (MMK)": "ပေးရန်ကျန် (MMK)", "Phone": "ဖုန်း", "Address": "လိပ်စာ", "Owes (MMK)": "ပေးရန်ကျန် (MMK)", "Total purchases (MMK)": "စုစုပေါင်းဝယ်ယူမှု (MMK)", "You owe (MMK)": "သင်ပေးရန် (MMK)", "Expenses": "အသုံးစရိတ်များ", "Description": "ဖော်ပြချက်", "Paid by": "ပေးချေသူ/နည်း", "Amount (MMK)": "ပမာဏ (MMK)", "Stock movements": "စတော့လှုပ်ရှားမှုများ", "Type": "အမျိုးအစား", "Change": "ပြောင်းလဲမှု", "Stock after": "နောက်ဆုံးစတော့", "Reason": "အကြောင်းရင်း", "(deleted)": "(ဖျက်ပြီး)", "{} CSV saved ({} rows).": "{} CSV ကို သိမ်းပြီးပါပြီ ({} တန်း)။", "{} CSV download started ({} rows) — check your Downloads folder.": "{} CSV ဒေါင်းလုဒ် စတင်ပါပြီ ({} တန်း) — Downloads ဖိုလ်ဒါကို စစ်ကြည့်ပါ။", "There is nothing to export yet for {}.": "{} အတွက် ထုတ်ယူရန် မည်သည့်အရာမျှ မရှိသေးပါ။", "Payments": "ငွေပေးချေမှုများ", "Stocktakes": "စတော့ရေတွက်မှုများ", "Notification settings": "အသိပေးချက်ဆက်တင်များ", "Activity log": "လုပ်ဆောင်ချက်မှတ်တမ်း", "Cash drawer days": "ငွေအံဆွဲရက်များ", "This file cannot be restored": "ဤဖိုင်ကို ပြန်လည်ရယူ၍ မရပါ", "Nothing was changed. Choose a different backup file.": "မည်သည့်အရာမျှ မပြောင်းလဲပါ။ အခြားအရန်ဖိုင်ကို ရွေးပါ။", "Notes": "မှတ်ချက်များ", "Backup made": "အရန်ပြုလုပ်သည့်ရက်", "Shop": "ဆိုင်", "Schema version": "Schema ဗားရှင်း", "(will be upgraded)": "(အဆင့်မြှင့်မည်)", "File size": "ဖိုင်အရွယ်အစား", "Product images in file": "ဖိုင်ထဲရှိ ကုန်ပစ္စည်းပုံများ", "Records": "မှတ်တမ်းများ", "In backup": "အရန်ဖိုင်ထဲ", "Now in this browser": "ယခု ဤဘရောက်ဇာထဲ", "Step 1: save a backup of the data that is in this browser now.": "အဆင့် ၁: ယခု ဤဘရောက်ဇာထဲရှိ ဒေတာကို အရန်သိမ်းပါ။", "Type RESTORE": "RESTORE ဟု ရိုက်ပါ", "Replace my data with this backup": "ကျွန်ုပ်၏ဒေတာကို ဤအရန်ဖိုင်ဖြင့် အစားထိုးမည်", "Step 1 done: safety backup saved ({} records).": "အဆင့် ၁ ပြီးပါပြီ: လုံခြုံရေးအရန်ကို သိမ်းပြီး (မှတ်တမ်း {} ခု)။", "Step 1 done: safety backup download started ({} records). Check your Downloads folder before continuing.": "အဆင့် ၁ ပြီးပါပြီ: လုံခြုံရေးအရန် ဒေါင်းလုဒ်စတင်ပါပြီ (မှတ်တမ်း {} ခု)။ မဆက်မီ Downloads ဖိုလ်ဒါကို စစ်ကြည့်ပါ။", "Save safety backup": "လုံခြုံရေးအရန် သိမ်းမည်", "Replace all data with this backup?": "ဒေတာအားလုံးကို ဤအရန်ဖိုင်ဖြင့် အစားထိုးမလား?", "the file": "ဖိုင်", "Step 2: type RESTORE to confirm": "အဆင့် ၂: အတည်ပြုရန် RESTORE ဟု ရိုက်ပါ", "Cancel": "မလုပ်တော့ပါ", "Create a backup": "အရန်သိမ်းမည်", "Last backup: {} — {} records, {} ({}).": "နောက်ဆုံးအရန်: {} — မှတ်တမ်း {} ခု၊ {} ({})။", "file saved": "ဖိုင်သိမ်းပြီး", "download started": "ဒေါင်းလုဒ်စတင်ပြီး", "No backup has been made from this browser yet.": "ဤဘရောက်ဇာမှ အရန်သိမ်းမှု မလုပ်ရသေးပါ။", "{} records are stored now. The backup is one JSON file with all products, sales, purchases, payments, customers, suppliers, expenses, cash days, stock history, activity log, settings and product images. It also contains purchase prices and the PIN hash — keep it somewhere safe{}.": "ယခု မှတ်တမ်း {} ခု သိမ်းထားသည်။ အရန်ဖိုင်သည် ကုန်ပစ္စည်း၊ ရောင်းချမှု၊ ဝယ်ယူမှု၊ ငွေပေးချေမှု၊ ဖောက်သည်၊ ပေးသွင်းသူ၊ အသုံးစရိတ်၊ ငွေသားရက်များ၊ စတော့မှတ်တမ်း၊ လုပ်ဆောင်ချက်မှတ်တမ်း၊ ဆက်တင်နှင့် ကုန်ပစ္စည်းပုံအားလုံးပါသော JSON ဖိုင်တစ်ခု ဖြစ်သည်။ ၎င်းတွင် ဝယ်ဈေးများနှင့် PIN hash လည်း ပါသဖြင့် လုံခြုံသောနေရာတွင် သိမ်းထားပါ{}။", "(the admin PIN is asked before it is made)": "(မပြုလုပ်မီ admin PIN ကို မေးမည်)", "Backup saved: {} ({} records, {}).": "အရန်သိမ်းပြီးပါပြီ: {} (မှတ်တမ်း {} ခု၊ {})။", "Backup file created ({} records, {}) and the download started. Check your Downloads folder — the browser cannot confirm where it was saved.": "အရန်ဖိုင် ဖန်တီးပြီး (မှတ်တမ်း {} ခု၊ {}) ဒေါင်းလုဒ်စတင်ပါပြီ။ Downloads ဖိုလ်ဒါကို စစ်ကြည့်ပါ — ဘရောက်ဇာက ဘယ်နေရာတွင် သိမ်းသည်ကို အတည်မပြုနိုင်ပါ။", "Create backup file": "အရန်ဖိုင် ဖန်တီးမည်", "Data is stored in this browser on this device only. A backup file is the way to move data to another device or browser.": "ဒေတာကို ဤစက်ရှိ ဤဘရောက်ဇာတွင်သာ သိမ်းထားသည်။ အခြားစက် သို့မဟုတ် ဘရောက်ဇာသို့ ဒေတာရွှေ့ရန် အရန်ဖိုင်ကို သုံးပါ။", "Restore from a backup": "အရန်ဖိုင်မှ ပြန်လည်ရယူမည်", "Choose a SmartStock backup (.json). The file is checked first and you see a preview before anything changes.": "SmartStock အရန်ဖိုင် (.json) ကို ရွေးပါ။ ဖိုင်ကို အရင်စစ်ဆေးပြီး မည်သည့်အရာမျှ မပြောင်းမီ ကြိုကြည့်ရှုမှုကို မြင်ရမည်။", "Backup file": "အရန်ဖိုင်", "Restore this backup…": "ဤအရန်ဖိုင်ကို ပြန်လည်ရယူမည်…", "Restore complete": "ပြန်လည်ရယူမှု ပြီးစီးပါပြီ", "{} records restored{}. Product images: {} restored{}.": "မှတ်တမ်း {} ခု ပြန်လည်ရယူပြီး{}။ ကုန်ပစ္စည်းပုံများ: {} ပုံ ပြန်လည်ရယူပြီး{}။", " and upgraded to the current schema": "နှင့် လက်ရှိ schema သို့ အဆင့်မြှင့်ပြီး", "A copy of the previous data is kept in this browser so you can undo this restore.": "ဤပြန်လည်ရယူမှုကို ပြန်ဖျက်နိုင်ရန် ယခင်ဒေတာ၏ မိတ္တူကို ဤဘရောက်ဇာတွင် ထားရှိသည်။", "There was not enough browser storage to keep an extra copy — use the safety backup file to go back.": "အပို မိတ္တူသိမ်းရန် ဘရောက်ဇာသိမ်းဆည်းနေရာ မလုံလောက်ပါ — ပြန်သွားရန် လုံခြုံရေးအရန်ဖိုင်ကို သုံးပါ။", "Undo the last restore?": "နောက်ဆုံးပြန်လည်ရယူမှုကို ပြန်ဖျက်မလား?", "This puts back the data that was in this browser before the last restore.": "၎င်းသည် နောက်ဆုံးပြန်လည်ရယူမှုမတိုင်မီ ဤဘရောက်ဇာထဲရှိခဲ့သော ဒေတာကို ပြန်ထည့်မည်။", "Undo restore": "ပြန်လည်ရယူမှုကို ပြန်ဖျက်မည်", "Previous data restored.": "ယခင်ဒေတာကို ပြန်ထည့်ပြီးပါပြီ။", "Undo last restore": "နောက်ဆုံးပြန်လည်ရယူမှုကို ပြန်ဖျက်မည်", "Export data to CSV": "ဒေတာကို CSV အဖြစ် ထုတ်ယူမည်", "Spreadsheet-friendly files (UTF-8, opens in Excel). Purchase prices are included only while the admin PIN is unlocked.": "စပရက်ရှစ်နှင့် အဆင်ပြေသော ဖိုင်များ (UTF-8၊ Excel တွင် ဖွင့်နိုင်သည်)။ admin PIN ဖွင့်ထားစဉ်တွင်သာ ဝယ်ဈေးများ ပါဝင်သည်။", "Backup history": "အရန်သိမ်းမှုမှတ်တမ်း", "Backup": "အရန်သိမ်းခြင်း", "Safety backup": "လုံခြုံရေးအရန်", "Restore": "ပြန်လည်ရယူခြင်း", "· saved": "· သိမ်းပြီး", "· download started": "· ဒေါင်းလုဒ်စတင်ပြီး", "No backups or restores yet": "အရန်သိမ်းမှု သို့မဟုတ် ပြန်လည်ရယူမှု မရှိသေးပါ", "Back up everything to a file, restore it, or export spreadsheets.": "အားလုံးကို ဖိုင်တစ်ခုအဖြစ် အရန်သိမ်းပါ၊ ပြန်လည်ရယူပါ၊ သို့မဟုတ် စပရက်ရှစ်များ ထုတ်ယူပါ။", "Customer balances equal their unpaid sales": "ဖောက်သည်ကျန်ငွေများသည် မပေးရသေးသော ရောင်းချမှုများနှင့် ညီမျှသည်", "{}: balance {} but unpaid sales {}": "{}: ကျန်ငွေ {} ဖြစ်သော်လည်း မပေးရသေးသောရောင်းချမှု {}", "Supplier balances equal their unpaid purchases": "ပေးသွင်းသူကျန်ငွေများသည် မပေးရသေးသော ဝယ်ယူမှုများနှင့် ညီမျှသည်", "{}: balance {} but unpaid purchases {}": "{}: ကျန်ငွေ {} ဖြစ်သော်လည်း မပေးရသေးသောဝယ်ယူမှု {}", "Each sale: paid + balance matches total and refunds": "ရောင်းချမှုတစ်ခုချင်း: ပေးချေပြီး + ကျန်ငွေသည် စုစုပေါင်းနှင့် ပြန်အမ်းငွေများနှင့် ကိုက်ညီသည်", "{}: paid {} + balance {} does not match total {} after refunds": "{}: ပေးချေပြီး {} + ကျန်ငွေ {} သည် ပြန်အမ်းပြီးနောက် စုစုပေါင်း {} နှင့် မကိုက်ညီပါ", "Payment records match every sale": "ငွေပေးချေမှုမှတ်တမ်းများသည် ရောင်းချမှုတိုင်းနှင့် ကိုက်ညီသည်", "{}: payments recorded {} but sale shows paid {}": "{}: မှတ်တမ်းတင်ထားသော ငွေပေးချေမှု {} ဖြစ်သော်လည်း ရောင်းချမှုတွင် ပေးချေပြီး {} ဟု ပြသည်", "{}: refund payments {} but refunds paid out {}": "{}: ပြန်အမ်းငွေပေးချေမှု {} ဖြစ်သော်လည်း ပြန်အမ်းထုတ်ပေးငွေ {}", "Stock on hand equals the latest movement record": "လက်ကျန်စတော့သည် နောက်ဆုံးလှုပ်ရှားမှုမှတ်တမ်းနှင့် ညီမျှသည်", "{}: stock {} but history ends at {}": "{}: စတော့ {} ဖြစ်သော်လည်း မှတ်တမ်းသည် {} တွင် ပြီးဆုံးသည်", "Closed cash days still agree with their records": "ပိတ်ပြီးသော ငွေသားရက်များသည် မှတ်တမ်းများနှင့် ဆက်လက်ကိုက်ညီသည်", "{}: closed with expected {}, records now give {} (something was recorded for that day after closing)": "{}: မျှော်မှန်း {} ဖြင့် ပိတ်ခဲ့သော်လည်း မှတ်တမ်းများက ယခု {} ပြသည် (ပိတ်ပြီးနောက် ထိုနေ့အတွက် တစ်စုံတစ်ရာ မှတ်တမ်းတင်ထားသည်)", "Batch quantities add up to stock": "အသုတ်အရေအတွက်များ ပေါင်းလျှင် စတော့နှင့် ညီသည်", "{}: batches hold {} but stock is {}": "{}: အသုတ်များတွင် {} ရှိသော်လည်း စတော့မှာ {}", "No interrupted sales or purchases": "ကြားဖြတ်ခံရသော ရောင်းချမှု သို့မဟုတ် ဝယ်ယူမှု မရှိပါ", "Stored data links are valid (integrity check)": "သိမ်းထားသော ဒေတာချိတ်ဆက်မှုများ မှန်ကန်သည် (ဒေတာမှန်ကန်မှုစစ်ဆေးခြင်း)", "Overview": "အနှစ်ချုပ်", "Profit": "အမြတ်", "Inventory": "လက်ကျန်ပစ္စည်း", "Stocktake": "စတော့ရေတွက်ခြင်း", "Receivables": "ရရန်ရှိသည်များ", "Payables": "ပေးရန်ရှိသည်များ", "Cash flow": "ငွေသားစီးဆင်းမှု", "Reconciliation": "ကိုက်ညီမှုစစ်ဆေးခြင်း", "Discounts & refunds": "လျှော့ဈေးနှင့် ပြန်အမ်းငွေ", "Today": "ယနေ့", "Yesterday": "မနေ့က", "Last 7 days": "လွန်ခဲ့သော ၇ ရက်", "Last 30 days": "လွန်ခဲ့သော ၃၀ ရက်", "This month": "ဤလ", "Previous month": "ပြီးခဲ့သောလ", "Custom": "စိတ်ကြိုက်", "Purchase prices are hidden": "ဝယ်ဈေးများကို ဖျောက်ထားသည်", "Nothing to show": "ပြရန် မရှိပါ", "This period": "ဤကာလ", "Revenue (sales, no tax)": "ရောင်းရငွေ (ရောင်းချမှု၊ အခွန်မပါ)", "Cash & payments received": "လက်ခံရရှိသော ငွေသားနှင့် ငွေပေးချေမှုများ", "Money that actually came in (all methods)": "တကယ်ဝင်လာသော ငွေ (နည်းလမ်းအားလုံး)", "Gross profit": "စုစုပေါင်းအမြတ်", "Operating profit": "လည်ပတ်အမြတ်", "Operating costs, not stock purchases": "လည်ပတ်စရိတ်များ၊ စတော့ဝယ်ယူမှု မပါ", "Net money movement": "ငွေအသားတင်လှုပ်ရှားမှု", "Right now": "ယခုချိန်", "Inventory value (retail)": "လက်ကျန်ပစ္စည်းတန်ဖိုး (လက်လီ)", "Inventory value (cost)": "လက်ကျန်ပစ္စည်းတန်ဖိုး (ကုန်ကျစရိတ်)", "Customers owe you": "ဖောက်သည်များက သင့်ကို ပေးရန်ကျန်သည်", "You owe suppliers": "သင်က ပေးသွင်းသူများကို ပေးရန်ကျန်သည်", "Revenue is what you sold. Cash received is what came in. A credit sale is revenue now but cash later; a stock purchase is not an expense, it becomes cost of goods when sold.": "ရောင်းရငွေဆိုသည်မှာ သင်ရောင်းချခဲ့သည့်ပမာဏ ဖြစ်သည်။ လက်ခံရရှိသော ငွေသားဆိုသည်မှာ တကယ်ဝင်လာသည့်ငွေ ဖြစ်သည်။ အကြွေးရောင်းချမှုသည် ယခု ရောင်းရငွေဖြစ်ပြီး ငွေသားမှာ နောက်မှရမည်၊ စတော့ဝယ်ယူမှုသည် အသုံးစရိတ်မဟုတ်ဘဲ ရောင်းချသည့်အခါ ကုန်ကျစရိတ်ဖြစ်လာသည်။", "No sales in the previous period": "ယခင်ကာလတွင် ရောင်းချမှု မရှိပါ", "Sales performance": "ရောင်းချမှုစွမ်းဆောင်ရည်", "Previous period": "ယခင်ကာလ", "Average sale": "ပျမ်းမျှရောင်းချမှု", "(by month)": "(လအလိုက်)", "(by day)": "(ရက်အလိုက်)", "Revenue trend: this period compared with the previous period": "ရောင်းရငွေလမ်းကြောင်း: ဤကာလကို ယခင်ကာလနှင့် နှိုင်းယှဉ်ခြင်း", "Revenue by category": "အမျိုးအစားအလိုက် ရောင်းရငွေ", "Money received by method": "နည်းလမ်းအလိုက် လက်ခံရရှိသော ငွေ", "Received by payment method": "ငွေပေးချေနည်းအလိုက် လက်ခံရရှိမှု", "Revenue of the best-selling products": "အရောင်းရဆုံး ကုန်ပစ္စည်းများ၏ ရောင်းရငွေ", "Product sales": "ကုန်ပစ္စည်းရောင်းချမှု", "Units": "ယူနစ်များ", "Category performance": "အမျိုးအစားစွမ်းဆောင်ရည်", "Purchases (confirmed)": "ဝယ်ယူမှုများ (အတည်ပြုပြီး)", "Purchased": "ဝယ်ယူပြီး", "Paid to suppliers": "ပေးသွင်းသူများအား ပေးချေပြီး", "Still owed": "ပေးရန်ကျန်သေး", "Drafts waiting": "စောင့်ဆိုင်းနေသော မူကြမ်းများ", "Not counted until confirmed": "အတည်မပြုမချင်း မတွက်ပါ", "Totals only — unit costs stay behind the admin PIN in Purchases.": "စုစုပေါင်းများသာ — တစ်ခုချင်းကုန်ကျစရိတ်များသည် ဝယ်ယူမှုများတွင် admin PIN ၏နောက်၌ ရှိနေသည်။", "By supplier": "ပေးသွင်းသူအလိုက်", "No purchases in this period": "ဤကာလတွင် ဝယ်ယူမှု မရှိပါ", "Purchase list": "ဝယ်ယူမှုစာရင်း", "Total expenses": "အသုံးစရိတ်စုစုပေါင်း", "Largest category": "အကြီးဆုံးအမျိုးအစား", "Expenses by category": "အမျိုးအစားအလိုက် အသုံးစရိတ်", "Expense list": "အသုံးစရိတ်စာရင်း", "No expenses in this period": "ဤကာလတွင် အသုံးစရိတ် မရှိပါ", "No stock movements in this period": "ဤကာလတွင် စတော့လှုပ်ရှားမှု မရှိပါ", "No expiry": "သက်တမ်းကုန်ရက် မရှိ", "No product tracks expiry yet": "သက်တမ်းကုန်ရက်ကို မှတ်သားသော ကုန်ပစ္စည်း မရှိသေးပါ", "Turn on \"Track batch numbers and expiry dates\" when you edit a product.": "ကုန်ပစ္စည်းကို ပြင်သည့်အခါ \"အသုတ်နံပါတ်နှင့် သက်တမ်းကုန်ရက်ကို မှတ်သားမည်\" ကို ဖွင့်ပါ။", "Expiry overview": "သက်တမ်းကုန်ရက် အနှစ်ချုပ်", "Expired stock": "သက်တမ်းကုန်စတော့", "Products tracking expiry": "သက်တမ်းကုန်ရက်မှတ်သားသော ကုန်ပစ္စည်းများ", "Expired stock is never sold at the POS. Remove it with Inventory → Adjust stock → \"Expired goods\". Change the warning period in Settings.": "သက်တမ်းကုန်စတော့ကို POS တွင် ဘယ်တော့မှ မရောင်းပါ။ လက်ကျန်ပစ္စည်း → စတော့ချိန်ညှိမည် → \"သက်တမ်းကုန်သောပစ္စည်း\" ဖြင့် ဖယ်ရှားပါ။ သတိပေးကာလကို ဆက်တင်များတွင် ပြောင်းပါ။", "Batches": "အသုတ်များ", "No stock in tracked batches": "မှတ်သားထားသော အသုတ်များတွင် စတော့ မရှိပါ", "Stocktakes started in this period": "ဤကာလတွင် စတင်သော စတော့ရေတွက်မှုများ", "Started": "စတင်သည့်ရက်", "Applied": "အသုံးချပြီး", "Differences": "ကွာခြားချက်များ", "Units short": "လိုနေသော ယူနစ်", "Units over": "ပိုနေသော ယူနစ်", "No stocktakes in this period": "ဤကာလတွင် စတော့ရေတွက်မှု မရှိပါ", "Cost of goods": "ကုန်ပစ္စည်းကုန်ကျစရိတ်", "Margin": "အမြတ်ဖြတ်", "Profit summary": "အမြတ်အနှစ်ချုပ်", "Cost of goods sold": "ရောင်းချသောပစ္စည်း၏ ကုန်ကျစရိတ်", "Average cost when each item was sold": "ပစ္စည်းတစ်ခုချင်း ရောင်းချသည့်အချိန်က ပျမ်းမျှကုန်ကျစရိတ်", "Product profitability (most profitable first)": "ကုန်ပစ္စည်းအမြတ်ရမှု (အမြတ်အများဆုံးအရင်)", "Gross profit by category": "အမျိုးအစားအလိုက် စုစုပေါင်းအမြတ်", "Refunds are taken off the original sale. Product totals are rounded per line, so they can differ from the summary by a few kyat.": "ပြန်အမ်းငွေများကို မူလရောင်းချမှုမှ နုတ်သည်။ ကုန်ပစ္စည်းစုစုပေါင်းများကို စာကြောင်းတစ်ကြောင်းချင်း ဖြတ်သဖြင့် အနှစ်ချုပ်နှင့် ကျပ်အနည်းငယ် ကွာနိုင်သည်။", "Potential profit": "ဖြစ်နိုင်ချေအမြတ်", "Inventory value": "လက်ကျန်ပစ္စည်းတန်ဖိုး", "At retail price": "လက်လီဈေးဖြင့်", "At cost": "ကုန်ကျစရိတ်ဖြင့်", "Potential gross profit": "ဖြစ်နိုင်ချေ စုစုပေါင်းအမြတ်", "If all stock sold at current prices": "စတော့အားလုံးကို လက်ရှိဈေးဖြင့် ရောင်းလျှင်", "Stock by product": "ကုန်ပစ္စည်းအလိုက် စတော့", "No products": "ကုန်ပစ္စည်း မရှိပါ", "Turnover = units sold ÷ units in stock now. Days of cover = how long current stock lasts at this period’s sales speed.": "လည်ပတ်မှု = ရောင်းချသောယူနစ် ÷ ယခုလက်ကျန်ယူနစ်။ ကာကွယ်ရက် = ဤကာလ၏ ရောင်းချနှုန်းအတိုင်း လက်ရှိစတော့ ဘယ်နှစ်ရက်ခံမည်ကို ဆိုလိုသည်။", "Units sold": "ရောင်းချသော ယူနစ်", "Turnover": "လည်ပတ်မှု", "Days of cover": "ခံနိုင်သောရက်", "Slow-moving stock (in stock, not sold in 30 days)": "ရောင်းချမှုနှေးသော စတော့ (လက်ကျန်ရှိပြီး ရက် ၃၀ အတွင်း မရောင်းရ)", "Retail value tied up": "လက်လီတန်ဖိုး ပိတ်မိနေသည်", "Last sold": "နောက်ဆုံးရောင်းသည့်ရက်", "Never sold": "မရောင်းရသေးပါ", "No slow-moving stock": "ရောင်းချမှုနှေးသော စတော့ မရှိပါ", "Money customers owe you": "ဖောက်သည်များက သင့်ကို ပေးရန်ကျန်သော ငွေ", "Total receivable": "ရရန်စုစုပေါင်း", "Up to 30 days": "ရက် ၃၀ အထိ", "31–60 days": "ရက် ၃၁–၆၀", "Over 60 days": "ရက် ၆၀ ကျော်", "Chase these first": "ဤသူများကို အရင်လိုက်တောင်းပါ", "By customer": "ဖောက်သည်အလိုက်", "Owes": "ပေးရန်ကျန်", "Unpaid sales": "မပေးရသေးသော ရောင်းချမှုများ", "Oldest unpaid": "အဟောင်းဆုံး မပေးရသေး", "Nobody owes you money": "သင့်ကို ပေးရန်ကျန်သူ မရှိပါ", "Money you owe suppliers": "သင်က ပေးသွင်းသူများကို ပေးရန်ကျန်သော ငွေ", "Total payable": "ပေးရန်စုစုပေါင်း", "Overdue": "ကျော်လွန်နေသည်", "You owe": "သင်ပေးရန်ကျန်", "Unpaid purchases": "မပေးရသေးသော ဝယ်ယူမှုများ", "You owe no supplier": "ပေးသွင်းသူအား ပေးရန်ကျန်မရှိပါ", "Money in and out (all payment methods)": "ဝင်ငွေနှင့် ထွက်ငွေ (ငွေပေးချေနည်းအားလုံး)", "Received": "လက်ခံရရှိ", "Paid out": "ထုတ်ပေးပြီး", "Net movement": "အသားတင်လှုပ်ရှားမှု", "By payment method": "ငွေပေးချေနည်းအလိုက်", "Net": "အသားတင်", "No money moved in this period": "ဤကာလတွင် ငွေလှုပ်ရှားမှု မရှိပါ", "Money in and out by day": "ရက်အလိုက် ဝင်ငွေနှင့် ထွက်ငွေ", "Money received and paid out by day": "ရက်အလိုက် လက်ခံရရှိသော နှင့် ထုတ်ပေးသော ငွေ", "By day": "ရက်အလိုက်", "All checks agree.": "စစ်ဆေးမှုအားလုံး ကိုက်ညီသည်။", "Discounts": "လျှော့ဈေးများ", "Total discounts given": "ပေးထားသော လျှော့ဈေးစုစုပေါင်း", "Item discounts": "ပစ္စည်းလျှော့ဈေးများ", "Whole-sale discounts": "ရောင်းချမှုတစ်ခုလုံး လျှော့ဈေးများ", "Sales with a discount": "လျှော့ဈေးပါသော ရောင်းချမှုများ", "Biggest discounts": "အကြီးဆုံး လျှော့ဈေးများ", "Sale total": "ရောင်းချမှုစုစုပေါင်း", "No discounts in this period": "ဤကာလတွင် လျှော့ဈေး မရှိပါ", "Refunds and cancellations (by date refunded)": "ပြန်အမ်းငွေနှင့် ပယ်ဖျက်မှုများ (ပြန်အမ်းသည့်ရက်အလိုက်)", "Refunds": "ပြန်အမ်းငွေများ", "Refund value": "ပြန်အမ်းငွေတန်ဖိုး", "Paid back in money": "ငွေဖြင့် ပြန်အမ်းပြီး", "The rest reduced what a customer owed": "ကျန်သည်မှာ ဖောက်သည်ပေးရန်ကျန်ငွေကို လျှော့ချသည်", "Refund": "ပြန်အမ်းငွေ", "No refunds in this period": "ဤကာလတွင် ပြန်အမ်းငွေ မရှိပါ", "Revenue and profit already exclude refunded items (taken off the original sale); this list shows when the refund itself happened.": "ရောင်းရငွေနှင့် အမြတ်တွင် ပြန်အမ်းထားသော ပစ္စည်းများကို ချန်လှပ်ပြီးဖြစ်သည် (မူလရောင်းချမှုမှ နုတ်ထားသည်)၊ ဤစာရင်းသည် ပြန်အမ်းမှု ဖြစ်ပွားသည့်ရက်ကို ပြသည်။", "Revenue (no tax)": "ရောင်းရငွေ (အခွန်မပါ)", "Sales count": "ရောင်းချမှုအရေအတွက်", "Cash and payments received": "လက်ခံရရှိသော ငွေသားနှင့် ငွေပေးချေမှုများ", "Measure": "တိုင်းတာမှု", "Revenue (MMK)": "ရောင်းရငွေ (MMK)", "Cost of goods (MMK)": "ကုန်ပစ္စည်းကုန်ကျစရိတ် (MMK)", "Gross profit (MMK)": "စုစုပေါင်းအမြတ် (MMK)", "Margin %": "အမြတ်ဖြတ် %", "Potential profit (MMK)": "ဖြစ်နိုင်ချေအမြတ် (MMK)", "Lines": "စာကြောင်းများ", "Received (MMK)": "လက်ခံရရှိ (MMK)", "Paid out (MMK)": "ထုတ်ပေးပြီး (MMK)", "Net (MMK)": "အသားတင် (MMK)", "Check": "စစ်ဆေးမှု", "Result": "ရလဒ်", "Detail": "အသေးစိတ်", "Issue": "ပြဿနာ", "Paid back (MMK)": "ပြန်အမ်းပြီး (MMK)", "Unlock with the admin PIN first — this report contains purchase-price data.": "admin PIN ဖြင့် အရင်ဖွင့်ပါ — ဤအစီရင်ခံစာတွင် ဝယ်ဈေးဒေတာ ပါဝင်သည်။", "Nothing to export for this period.": "ဤကာလအတွက် ထုတ်ယူရန် မရှိပါ။", "Revenue, cash, profit, stock value, receivables and payables — each kept separate.": "ရောင်းရငွေ၊ ငွေသား၊ အမြတ်၊ စတော့တန်ဖိုး၊ ရရန်ရှိသည်များနှင့် ပေးရန်ရှိသည်များ — တစ်ခုချင်း သီးခြားထားသည်။", "Download CSV": "CSV ဒေါင်းလုဒ်လုပ်မည်", "This report could not be built": "ဤအစီရင်ခံစာကို မဖန်တီးနိုင်ပါ", "Skip to content": "အကြောင်းအရာသို့ ကျော်သွားမည်", "Main navigation": "အဓိကမီနူး", "Collapse sidebar": "ဘေးဘားကို ခေါက်မည်", "Open menu": "မီနူးဖွင့်မည်", "Language": "ဘာသာစကား", "Toggle theme": "အသွင်အပြင်ပြောင်းမည်", "{} unread": "မဖတ်ရသေး {}", "Today's {}": "ယနေ့၏ {}", "sales": "ရောင်းချမှု", "gross profit": "စုစုပေါင်းအမြတ်", "expenses": "အသုံးစရိတ်", "operating profit (est.)": "လည်ပတ်အမြတ် (ခန့်မှန်း)", "{} sold": "{} ရောင်းပြီး", "{} left": "{} ကျန်သည်", "{} left.": "{} ကျန်သည်။", "{} units": "{} ယူနစ်", "{} units on hand": "လက်ကျန် {} ယူနစ်", "{} batch(es)": "အသုတ် {} ခု", "{} day(s)": "{} ရက်", "Expires in {} day(s)": "{} ရက်အတွင်း သက်တမ်းကုန်မည်", "Near expiry ({} days)": "သက်တမ်းကုန်ခါနီး ({} ရက်)", "Near expiry: {} (batch {})": "သက်တမ်းကုန်ခါနီး: {} (အသုတ် {})", "{} expire in {} day(s) on {}.": "{} သည် {} ရက်အတွင်း ({}) သက်တမ်းကုန်မည်။", "Low stock: {}": "စတော့နည်း: {}", "Expired: {} (batch {})": "သက်တမ်းကုန်: {} (အသုတ် {})", "Previous: {}": "ယခင်: {}", "Revenue trend ({})": "ရောင်းရငွေလမ်းကြောင်း ({})", "Inventory turnover ({} → {}, {} day(s))": "လက်ကျန်ပစ္စည်းလည်ပတ်မှု ({} → {}, {} ရက်)", "{} sale(s), always paid in full": "ရောင်းချမှု {} ခု၊ အမြဲပြည့်ပြည့်ဝဝပေးချေသည်", "{} expense(s), voided ones excluded": "အသုံးစရိတ် {} ခု၊ ပယ်ဖျက်ထားသည်များ မပါ", "Expenses in {}": "{} ၏ အသုံးစရိတ်များ", "Open the cash drawer for {}": "{} အတွက် ငွေသားအံဆွဲကို ဖွင့်မည်", "Profit is calculated from purchase prices, so it needs the administrator PIN. It hides again when you leave this page.": "အမြတ်ကို ဝယ်ဈေးများမှ တွက်ချက်သဖြင့် စီမံခန့်ခွဲသူ PIN လိုအပ်သည်။ ဤစာမျက်နှာမှ ထွက်လိုက်သည့်အခါ ပြန်ဖျောက်ပါမည်။", "Cost value is calculated from purchase prices, so it needs the administrator PIN. It hides again when you leave this page.": "ကုန်ကျတန်ဖိုးကို ဝယ်ဈေးများမှ တွက်ချက်သဖြင့် စီမံခန့်ခွဲသူ PIN လိုအပ်သည်။ ဤစာမျက်နှာမှ ထွက်လိုက်သည့်အခါ ပြန်ဖျောက်ပါမည်။", "{}% of gross sales": "စုစုပေါင်းရောင်းချမှု၏ {}%", "Checked {}. Reconciliation only reports; it never edits records.": "{} တွင် စစ်ဆေးပြီး။ ကိုက်ညီမှုစစ်ဆေးခြင်းသည် အစီရင်ခံသာသည်၊ မှတ်တမ်းများကို ဘယ်တော့မှ မပြင်ပါ။", "Receipt {}": "ပြေစာ {}", "{} ({} days)": "{} ({} ရက်)", "{} ({}%)": "{} ({}%)", "{} (owes {})": "{} (ပေးရန်ကျန် {})", "All ({})": "အားလုံး ({})", "Stock ({})": "စတော့ ({})", "Money ({})": "ငွေကြေး ({})", "Sales ({})": "ရောင်းချမှု ({})", "System ({})": "စနစ် ({})", "Dismissed ({})": "ပယ်ထားသည် ({})", "Unread ({})": "မဖတ်ရသေး ({})", "CSV download started ({} rows).": "CSV ဒေါင်းလုဒ်စတင်ပြီး (အတန်း {} ခု)။", "Default: {}": "မူလ: {}", "{} MB used of about {} GB": "{} MB သုံးပြီး၊ ခန့်မှန်း {} GB အနက်", "{} KB": "{} KB", "sale": "ရောင်းချမှု", "opening": "အဖွင့်လက်ကျန်", "customer_return": "ဖောက်သည်ပြန်ပေးခြင်း", "defect": "ချို့ယွင်းချက်", "sale {}": "ရောင်းချမှု {}", "product {}": "ကုန်ပစ္စည်း {}", "customer {}": "ဖောက်သည် {}", "expense {}": "အသုံးစရိတ် {}", "supplier {}": "ပေးသွင်းသူ {}", "purchase {}": "ဝယ်ယူမှု {}", "settings {}": "ဆက်တင် {}", "stocktake {}": "စတော့ရေတွက်မှု {}", "payment {}": "ငွေပေးချေမှု {}", "privacy": "ကိုယ်ရေးလုံခြုံမှု", "stock.opening": "စတော့အဖွင့်လက်ကျန်", "product.created": "ကုန်ပစ္စည်းဖန်တီးပြီး", "customer.created": "ဖောက်သည်ဖန်တီးပြီး", "expense.created": "အသုံးစရိတ်ဖန်တီးပြီး", "sale.completed": "ရောင်းချမှုပြီးစီး", "sale.refunded": "ရောင်းချမှုပြန်အမ်းပြီး", "privacy.pin_changed": "PIN ပြောင်းလဲပြီး", "{} · {}": "{} · {}"});
})();

;
/* SmartStock — storage.js
 * Persistent storage on IndexedDB behind a SYNCHRONOUS read/write API:
 *  - all collections are loaded into memory once at start (await SS.storage.init()); reads are instant
 *  - write() updates memory at once and marks the collection "dirty"; everything written during one user action is
 *    saved in ONE atomic IndexedDB transaction (all-or-nothing, also if the browser or tablet dies half way)
 *  - every stored collection has a revision number; a save whose revision is stale (another tab saved first) is
 *    refused, local changes of that save are dropped, the latest data is reloaded and a 'conflict' event is emitted
 *  - tabs tell each other about saved data through BroadcastChannel
 *  - a save that fails (storage full, blocked, ...) is NEVER reported as saved: state() becomes 'unsaved', a
 *    'quota'/'persistfail' event is emitted, and the data stays in memory so it can still be exported as a backup
 *  - one-time, verified migration of data left in localStorage by SmartStock builds before this one
 *  - JSON validation + corrupt-data quarantine, schema versioning + migrations, unique ids, integrity checks
 * NOTE: browser storage is per browser profile and does not sync between devices. Use Backup to move data.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const PREFIX = 'smartstock:';          // old localStorage prefix: only read when migrating
  const DB_NAME = 'smartstock-data', DB_VERSION = 1, STORE = 'kv';
  const SCHEMA_VERSION = 1;

  // key -> default value (objects for meta/settings, arrays for collections)
  const DEFAULTS = {
    meta: {}, settings: {},
    products: [], categories: [], sales: [], purchases: [], suppliers: [], customers: [], expenses: [],
    payments: [], stockMovements: [], stocktakes: [], notifications: [], auditLogs: [], cashSessions: []
  };
  const KEYS = Object.keys(DEFAULTS);
  const PENDING = PREFIX + '_pending';

  // Migrations: MIGRATIONS[n](db) upgrades a plain object {products:[...], sales:[...], meta:{...}, ...} from schema n to n+1
  // IN PLACE. They work on plain data (not on live storage), so the same step is used for stored data at startup and
  // for backup files being restored.
  const MIGRATIONS = {
    // 1: (db) => { db.products.forEach((p) => { ... }); }   // example for a future schema 2
  };
  /** Upgrades db from schema `from` to `to` using `registry` (default MIGRATIONS). Throws if a step is missing. */
  function migrateDb(db, from, to, registry) {
    registry = registry || MIGRATIONS;
    for (let v = from; v < to; v++) {
      if (typeof registry[v] !== 'function') throw new StorageError('NO_MIGRATION', `No upgrade path from schema ${v} to ${v + 1}.`);
      registry[v](db);
    }
    return db;
  }

  class StorageError extends Error {
    constructor(code, message, detail) { super(message); this.name = 'StorageError'; this.code = code; this.detail = detail; }
  }

  const cache = {};        // key -> parsed value (the working copy; reads come from here)
  const revs = {};         // key -> revision of the stored record this tab last saw
  const sizes = {};        // key -> size of the stored JSON (characters), for usage()
  const listeners = new Set();
  function emit(evt) { listeners.forEach((fn) => { try { fn(evt); } catch (e) { console.error(e); } }); }
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const _hooks = { beforeWrite: null };   // TEST ONLY: lets tests make the Nth write() fail. Never set by the app.

  function assertKey(key) { if (!KEYS.includes(key)) throw new StorageError('BAD_KEY', 'Unknown storage key: ' + key); }
  function typeOk(key, v) { return Array.isArray(DEFAULTS[key]) ? Array.isArray(v) : (v && typeof v === 'object' && !Array.isArray(v)); }

  /* ---------- IndexedDB plumbing ---------- */
  let db = null, loaded = false, initPromise = null;
  const auxNames = new Set();            // names of extra records (safety copies, quarantined data)
  function errName(e) { return e && (e.name || (e.error && e.error.name)); }
  function isQuota(e) { const n = errName(e); return n === 'QuotaExceededError' || (e && (e.code === 22 || e.code === 1014)); }
  function toStorageError(e, fallback) {
    if (e instanceof StorageError) return e;
    if (isQuota(e)) return new StorageError('QUOTA', 'Browser storage is full. Export a backup, remove product images or old data, then try again. Your last change was NOT saved.', e);
    return new StorageError('WRITE', (fallback || 'Saving failed') + ': ' + ((e && e.message) || errName(e) || 'unknown error'), e);
  }
  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new StorageError('UNAVAILABLE', 'This browser does not support IndexedDB.')); return; }
      let r; try { r = window.indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(new StorageError('UNAVAILABLE', 'IndexedDB is not available: ' + e.message, e)); return; }
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'key' }); };
      r.onsuccess = () => { const d = r.result; d.onversionchange = () => { try { d.close(); } catch (e) { /* ignore */ } }; resolve(d); };
      r.onerror = () => reject(new StorageError('UNAVAILABLE', 'IndexedDB could not be opened: ' + ((r.error && r.error.message) || 'unknown error'), r.error));
    });
  }
  function getAllRecords() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], 'readonly'); const rq = tx.objectStore(STORE).getAll();
      rq.onsuccess = () => resolve(rq.result || []); rq.onerror = () => reject(rq.error || new Error('read failed'));
    });
  }
  function getRecord(key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], 'readonly'); const rq = tx.objectStore(STORE).get(key);
      rq.onsuccess = () => resolve(rq.result || null); rq.onerror = () => reject(rq.error || new Error('read failed'));
    });
  }
  /** Writes/deletes several records in ONE transaction. entries: {key,json,rev,at} to put, or {key,remove:true}. */
  function commitMany(entries, clear) {
    return new Promise((resolve, reject) => {
      let tx; try { tx = db.transaction([STORE], 'readwrite'); } catch (e) { reject(e); return; }
      const s = tx.objectStore(STORE);
      if (clear) s.clear();
      entries.forEach((e) => { if (e.remove) s.delete(e.key); else s.put(e); });
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error || new Error('transaction aborted')); tx.onerror = () => { /* surfaces through onabort */ };
    });
  }

  /* ---------- Save state (memory -> IndexedDB) ---------- */
  const dirty = new Set(), forced = new Set();
  const failed = new Set(), failedForced = new Set();   // keys whose save failed: kept in memory, retried only on retry() or the next write
  let state = 'saved', lastError = null, scheduled = false, chain = Promise.resolve(), lastFlush = Promise.resolve();
  let lastRunError = null, conflictError = null;   // outcome of the most recent save (queued saves may be done by an earlier run)
  function setState(next, err) { lastError = err || null; if (next !== state || err) { state = next; emit({ type: 'status', state, error: err || null }); } }

  function read(key) {
    assertKey(key);
    if (!loaded) throw new StorageError('NOT_READY', 'Storage has not finished loading yet.');
    return cache[key];
  }

  /** Updates memory immediately and queues an atomic save. Throws only for invalid data (never silently drops data). */
  function write(key, value, opts) {
    assertKey(key);
    if (!loaded) throw new StorageError('NOT_READY', 'Storage has not finished loading yet.');
    if (!typeOk(key, value)) throw new StorageError('BAD_TYPE', `Invalid data type for "${key}".`);
    try { JSON.stringify(value); } catch (e) { throw new StorageError('SERIALIZE', 'Data could not be converted to JSON.', e); }
    if (_hooks.beforeWrite) _hooks.beforeWrite(key);
    cache[key] = value; dirty.add(key); if (opts && opts.force) forced.add(key);
    if (failed.size) { failed.forEach((k) => { dirty.add(k); if (failedForced.has(k)) forced.add(k); }); failed.clear(); failedForced.clear(); }   // a new change also retries earlier failed ones
    if (state === 'saved') setState('saving');
    schedule();
    return value;
  }

  function schedule() { if (scheduled) return; scheduled = true; queueMicrotask(() => { scheduled = false; run(); }); }
  function run() { const p = chain.then(doFlush); chain = p; lastFlush = p; return p; }   // doFlush never rejects: it records its outcome
  /** Resolves when everything written so far is safely stored; rejects (StorageError) if saving failed. */
  function flush() {
    if (failed.size) { failed.forEach((k) => { dirty.add(k); if (failedForced.has(k)) forced.add(k); }); failed.clear(); failedForced.clear(); }
    if (dirty.size) run();
    return lastFlush.then(() => {
      if (conflictError) { const e = conflictError; conflictError = null; throw e; }
      if (failed.size && lastRunError) throw lastRunError;
    });
  }
  const retry = flush;

  function doFlush() {
    const keys = Array.from(dirty);
    if (!keys.length) { if (state !== 'unsaved') setState('saved'); return Promise.resolve(); }   // (an empty run keeps the outcome of the run that really saved)
    const wasForced = new Set(keys.filter((k) => forced.has(k)));
    dirty.clear(); forced.clear();
    let payload;
    try { payload = keys.map((k) => [k, JSON.stringify(cache[k])]); }
    catch (e) { keys.forEach((k) => { failed.add(k); if (wasForced.has(k)) failedForced.add(k); }); const err = new StorageError('SERIALIZE', 'Data could not be converted to JSON.', e); lastRunError = err; setState('unsaved', err); emit({ type: 'persistfail', error: err }); return Promise.resolve(); }
    return new Promise((resolve) => {
      let conflictKey = null; const newRevs = {}; let tx;
      try { tx = db.transaction([STORE], 'readwrite'); } catch (e) { resolve({ error: e }); return; }
      const store = tx.objectStore(STORE);
      payload.forEach(([k, json]) => {
        const g = store.get(k);
        g.onsuccess = () => {
          if (conflictKey) return;
          const cur = g.result, curRev = cur ? cur.rev : 0;
          if (!wasForced.has(k) && curRev !== (revs[k] || 0)) { conflictKey = k; try { tx.abort(); } catch (e) { /* ignore */ } return; }
          newRevs[k] = curRev + 1; store.put({ key: k, json, rev: curRev + 1, at: Date.now() });
        };
      });
      tx.oncomplete = () => resolve({ ok: true, newRevs });
      tx.onabort = () => resolve({ conflictKey, error: tx.error });
      tx.onerror = () => { /* surfaces through onabort */ };
    }).then(async (r) => {
      if (r.ok) {
        payload.forEach(([k, json]) => { revs[k] = r.newRevs[k]; sizes[k] = json.length; });
        broadcast(payload.map(([k, json]) => ({ key: k, rev: r.newRevs[k], json })));
        lastRunError = null; if (dirty.size) schedule(); else setState('saved');
        return;
      }
      if (r.conflictKey) {          // another tab saved first: drop this save's local changes, reload the latest data
        try { await reloadKeys(keys); } catch (e) { /* reload failed: memory kept, state below */ }
        if (!dirty.size) setState('saved');
        conflictError = new StorageError('CONFLICT', 'This data was changed in another browser tab. The latest data was loaded - your last change was NOT saved, please repeat it.');
        emit({ type: 'conflict', key: r.conflictKey });
        return;
      }
      keys.forEach((k) => { failed.add(k); if (wasForced.has(k)) failedForced.add(k); });   // keep for a retry
      const err = toStorageError(r.error);
      lastRunError = err; setState('unsaved', err); emit({ type: isQuota(r.error) ? 'quota' : 'persistfail', error: err });
    });
  }

  /** Replaces memory with what is stored, for these keys (used after a conflict). */
  async function reloadKeys(keys) {
    const recs = await getAllRecords(); const byKey = new Map(recs.map((x) => [x.key, x]));
    keys.forEach((k) => { applyRecord(k, byKey.get(k)); dirty.delete(k); forced.delete(k); });
  }
  function applyRecord(k, rec) {
    if (!rec) { cache[k] = clone(DEFAULTS[k]); revs[k] = 0; sizes[k] = 0; return; }
    try { const v = JSON.parse(rec.json); if (!typeOk(k, v)) throw new Error('unexpected data type'); cache[k] = v; }
    catch (e) { cache[k] = clone(DEFAULTS[k]); }
    revs[k] = rec.rev || 0; sizes[k] = rec.json.length;
  }

  /* ---------- Other tabs ---------- */
  let channel = null;
  const tabId = Math.random().toString(36).slice(2);
  function openChannel() {
    try { if (typeof window.BroadcastChannel !== 'function') return; channel = new window.BroadcastChannel('smartstock-data'); } catch (e) { channel = null; return; }
    channel.onmessage = (ev) => {
      const m = ev.data; if (!m || m.from === tabId || !Array.isArray(m.items)) return;
      m.items.forEach((it) => {
        if (!KEYS.includes(it.key) || dirty.has(it.key) || it.rev <= (revs[it.key] || 0)) return;   // if dirty here, our own save will detect the conflict
        try { cache[it.key] = JSON.parse(it.json); revs[it.key] = it.rev; sizes[it.key] = it.json.length; emit({ type: 'external', key: it.key }); } catch (e) { /* ignore a bad message */ }
      });
    };
  }
  function broadcast(items) { if (channel) { try { channel.postMessage({ from: tabId, items }); } catch (e) { /* ignore */ } } }
  /** Fallback when BroadcastChannel is missing: pick up other tabs' saves when this tab becomes visible again. */
  async function refreshFromDb() {
    if (!loaded) return;
    const recs = await getAllRecords();
    recs.forEach((rec) => { if (KEYS.includes(rec.key) && !dirty.has(rec.key) && rec.rev > (revs[rec.key] || 0)) { applyRecord(rec.key, rec); emit({ type: 'external', key: rec.key }); } });
  }

  /* ---------- IDs ---------- */
  function uid(prefix) {
    const rnd = (window.crypto && crypto.getRandomValues) ? Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('') : Math.random().toString(16).slice(2, 10);
    return `${prefix || 'id'}_${Date.now().toString(36)}${rnd}`;
  }

  /* ---------- Collection API (arrays of records with stable ids) ---------- */
  const collection = {
    all(key) { return read(key).slice(); },
    byId(key, id) { return read(key).find((r) => r.id === id) || null; },
    insert(key, record, prefix) {
      const list = read(key).slice();
      const rec = Object.assign({}, record);
      rec.id = rec.id || uid(prefix || key.slice(0, 3));
      if (list.some((r) => r.id === rec.id)) throw new StorageError('DUPLICATE', `A record with id ${rec.id} already exists in ${key}.`);
      rec.createdAt = rec.createdAt || Date.now(); rec.updatedAt = rec.createdAt;
      list.push(rec); write(key, list); return rec;
    },
    update(key, id, patch) {
      const list = read(key).slice(); const i = list.findIndex((r) => r.id === id);
      if (i < 0) throw new StorageError('MISSING', `Record ${id} was not found in ${key}.`);
      const next = Object.assign({}, list[i], patch, { id, updatedAt: Date.now() });
      list[i] = next; write(key, list); return next;
    },
    replaceAll(key, list) { return write(key, list); },
    /** Hard-delete a record. Financial / historical collections are protected: they are never deleted. */
    remove(key, id) {
      if (PROTECTED.includes(key)) throw new StorageError('PROTECTED', `Records in "${key}" are part of the financial history and cannot be deleted.`);
      const list = read(key);
      if (!list.some((r) => r.id === id)) throw new StorageError('MISSING', `Record ${id} was not found in ${key}.`);
      write(key, list.filter((r) => r.id !== id));
    }
  };
  const PROTECTED = ['sales', 'purchases', 'payments', 'stockMovements', 'auditLogs', 'cashSessions', 'expenses', 'stocktakes'];

  /** Monotonic counter kept in meta (used for human-readable numbers such as ST-0001). */
  function counter(name) {
    const meta = read('meta'); const c = Object.assign({}, meta.counters);
    c[name] = (c[name] || 0) + 1;
    write('meta', Object.assign({}, meta, { counters: c }));
    return c[name];
  }

  const objectStore = {
    get(key) { return Object.assign({}, read(key)); },
    set(key, obj) { return write(key, Object.assign({}, obj)); },
    patch(key, patch) { return write(key, Object.assign({}, read(key), patch)); }
  };

  /* ---------- Integrity ---------- */
  function checkIntegrity(db) {
    const issues = []; const read = db ? (k) => (Array.isArray(db[k]) ? db[k] : []) : readLive;
    const ids = (k) => new Set(read(k).map((r) => r.id));
    const P = ids('products'), C = ids('categories'), S = ids('suppliers'), Cu = ids('customers');
    const seen = new Set();
    for (const k of KEYS) {
      if (!Array.isArray(DEFAULTS[k])) continue;
      seen.clear();
      for (const r of read(k)) {
        if (!r || !r.id) issues.push(`${k}: record without id`);
        else if (seen.has(r.id)) issues.push(`${k}: duplicate id ${r.id}`);
        else seen.add(r.id);
      }
    }
    read('products').forEach((p) => {
      if (p.categoryId && !C.has(p.categoryId)) issues.push(`product ${p.id}: missing category ${p.categoryId}`);
      if (p.supplierId && !S.has(p.supplierId)) issues.push(`product ${p.id}: missing supplier ${p.supplierId}`);
    });
    read('stockMovements').forEach((m) => { if (!P.has(m.productId)) issues.push(`stock movement ${m.id}: missing product ${m.productId}`); });
    read('sales').forEach((s) => {
      (s.lines || []).forEach((l) => { if (!P.has(l.productId)) issues.push(`sale ${s.id}: missing product ${l.productId}`); });
      if (s.customerId && !Cu.has(s.customerId)) issues.push(`sale ${s.id}: missing customer ${s.customerId}`);
    });
    read('purchases').forEach((p) => { if (p.supplierId && !S.has(p.supplierId)) issues.push(`purchase ${p.id}: missing supplier ${p.supplierId}`); });
    return issues;
  }


  const readLive = (k) => read(k);

  /* ---------- Old localStorage data -> IndexedDB (one time, verified, old copy kept) ---------- */
  function legacyKeyList() {
    const out = [];
    try { const ls = window.localStorage; if (!ls) return out; for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(PREFIX)) out.push(k); } } catch (e) { /* no localStorage */ }
    return out;
  }
  /** Info about data an older SmartStock build left in localStorage. Never read again once migrated. */
  function legacyInfo() {
    const keys = legacyKeyList(); let bytes = 0;
    try { keys.forEach((k) => { bytes += k.length + (window.localStorage.getItem(k) || '').length; }); } catch (e) { /* ignore */ }
    return { present: keys.length > 0, keys: keys.length, bytes };
  }
  async function migrateFromLocalStorage() {
    const all = legacyKeyList(); const ls = window.localStorage;
    const biz = all.filter((k) => KEYS.includes(k.slice(PREFIX.length)));
    if (!biz.length) return null;
    const at = Date.now(); const entries = []; const copied = [], skipped = [];
    biz.forEach((k) => {
      const name = k.slice(PREFIX.length); const raw = ls.getItem(k);
      try { const v = JSON.parse(raw); if (!typeOk(name, v)) throw new Error('unexpected data type'); entries.push({ key: name, json: raw, rev: 1, at }); copied.push(name); }
      catch (e) { entries.push({ key: '_aux:corrupt:' + name + ':' + at, json: JSON.stringify(raw), rev: 1, at }); skipped.push(name); }
    });
    all.forEach((k) => {   // safety copies and quarantined data of the old build travel along
      const rest = k.slice(PREFIX.length); let raw;
      if (rest === '_premigration' || rest === '_prerestore') { raw = ls.getItem(k); if (raw) entries.push({ key: '_aux:' + rest.slice(1), json: raw, rev: 1, at }); }
      else if (rest.startsWith('_corrupt:')) { raw = ls.getItem(k); if (raw != null) entries.push({ key: '_aux:' + rest.slice(1), json: JSON.stringify(raw), rev: 1, at }); }
    });
    entries.push({ key: '_migrated', json: JSON.stringify({ at, from: 'localStorage', copied, skipped }), rev: 1, at });
    await commitMany(entries);
    const back = new Map((await getAllRecords()).map((r) => [r.key, r.json]));   // read it back and compare before trusting it
    const bad = entries.filter((e) => back.get(e.key) !== e.json);
    if (bad.length) { try { await commitMany([], true); } catch (e) { /* ignore */ } throw new Error('verification failed for ' + bad.map((b) => b.key).join(', ')); }
    return { copied, skipped };
  }
  /** Deletes the old localStorage copy. Only allowed after a verified migration. */
  async function removeLegacy() {
    const rec = await getRecord('_migrated');
    if (!rec) throw new StorageError('NOT_MIGRATED', 'The data has not been moved to the new storage, so the old copy is kept.');
    legacyKeyList().forEach((k) => { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } });
    return legacyInfo();
  }

  /* ---------- Extra records: safety copies (kept out of the working data) ---------- */
  const hasAux = (name) => auxNames.has(name);
  async function setAux(name, obj) {
    try { await commitMany([{ key: '_aux:' + name, json: JSON.stringify(obj), rev: 1, at: Date.now() }]); } catch (e) { throw toStorageError(e, 'Could not store the safety copy'); }
    auxNames.add(name);
  }
  async function getAux(name) { const r = await getRecord('_aux:' + name); if (!r) return null; try { return JSON.parse(r.json); } catch (e) { return null; } }
  async function removeAux(name) { await commitMany([{ key: '_aux:' + name, remove: true }]); auxNames.delete(name); }

  /* ---------- Init / migrations ---------- */
  function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const result = { recovered: null, migrated: [], errors: [], corrupt: [], legacy: null, fatal: false };
      try { db = await openDb(); } catch (e) { result.errors.push(e.message); result.fatal = true; return result; }
      let recs;
      try {
        recs = await getAllRecords();
        if (!recs.some((r) => KEYS.includes(r.key)) && !recs.some((r) => r.key === '_migrated')) {
          let m = null;
          try { m = await migrateFromLocalStorage(); }
          catch (e) { result.errors.push('Your existing data could not be moved to the new storage (' + e.message + '). It is untouched in the old storage; nothing was changed.'); result.fatal = true; return result; }
          if (m) { result.legacy = m; recs = await getAllRecords(); }
        }
      } catch (e) { result.errors.push('Storage could not be read: ' + e.message); result.fatal = true; return result; }

      const byKey = new Map(recs.map((r) => [r.key, r]));
      recs.forEach((r) => { if (r.key.startsWith('_aux:')) auxNames.add(r.key.slice(5)); });
      for (const k of KEYS) {
        const rec = byKey.get(k);
        if (!rec) { cache[k] = clone(DEFAULTS[k]); revs[k] = 0; sizes[k] = 0; continue; }
        try { const v = JSON.parse(rec.json); if (!typeOk(k, v)) throw new Error('unexpected data type'); cache[k] = v; revs[k] = rec.rev || 0; sizes[k] = rec.json.length; }
        catch (e) {   // keep the unreadable text, start that section empty
          try { await commitMany([{ key: '_aux:corrupt:' + k + ':' + Date.now(), json: JSON.stringify(rec.json), rev: 1, at: Date.now() }]); } catch (_) { /* storage full: still reported */ }
          cache[k] = clone(DEFAULTS[k]); revs[k] = rec.rev || 0; sizes[k] = 0; result.corrupt.push(k);
          emit({ type: 'corrupt', key: k, reason: e.message }); console.error(`[SmartStock] Corrupted data in "${k}" (${e.message}). Raw copy kept as an extra record.`);
        }
      }
      loaded = true; openChannel();
      if (!channel && window.document && typeof window.document.addEventListener === 'function') window.document.addEventListener('visibilitychange', () => { if (window.document.visibilityState === 'visible') refreshFromDb().catch(() => {}); });
      let meta = objectStore.get('meta');
      if (!meta.schemaVersion) { meta = { schemaVersion: SCHEMA_VERSION, createdAt: Date.now(), appVersion: '0.1.0' }; objectStore.set('meta', meta); }
      if (meta.schemaVersion > SCHEMA_VERSION) { result.errors.push(`Data was saved by a newer SmartStock (schema ${meta.schemaVersion}). Update the app before continuing.`); result.fatal = true; return result; }
      if (meta.schemaVersion < SCHEMA_VERSION) {
        await setAux('premigration', exportAll()).catch(() => {});   // safety copy before migrating
        try {
          const dbCopy = clone(exportAll().data); const from = meta.schemaVersion;
          migrateDb(dbCopy, from, SCHEMA_VERSION);
          dbCopy.meta = Object.assign({}, dbCopy.meta, { schemaVersion: SCHEMA_VERSION });
          replaceAll(dbCopy);
          for (let v = from + 1; v <= SCHEMA_VERSION; v++) result.migrated.push(v);
        } catch (e) { result.errors.push('Data upgrade failed and was undone: ' + e.message); }
      }
      try { await flush(); } catch (e) { result.errors.push(e.message); }
      requestPersistence();
      return result;
    })();
    return initPromise;
  }

  function exportAll() {
    const data = {}; KEYS.forEach((k) => { data[k] = read(k); });
    return { app: 'SmartStock', schemaVersion: SCHEMA_VERSION, exportedAt: Date.now(), data };
  }

  /** Approximate size of the stored data in bytes (JSON text). */
  function usage() { return KEYS.reduce((a, k) => a + (sizes[k] || 0), 0); }

  /** Asks the browser not to delete our data when the device runs low on space. May be refused; never assumed. */
  let persistedFlag = null;
  function requestPersistence() {
    try { const st = window.navigator && window.navigator.storage; if (st && st.persist) return st.persist().then((g) => { persistedFlag = !!g; return persistedFlag; }).catch(() => null); } catch (e) { /* ignore */ }
    return Promise.resolve(null);
  }
  async function estimate() {
    try {
      const st = window.navigator && window.navigator.storage; if (!st || !st.estimate) return null;
      const e = await st.estimate(); let p = persistedFlag; if (p == null && st.persisted) { try { p = await st.persisted(); } catch (_) { p = null; } }
      return { usage: e.usage || 0, quota: e.quota || 0, persisted: p };
    } catch (e) { return null; }
  }

  /** Wipes ALL SmartStock data (Settings -> Reset after explicit confirmation). Resolves when it is really gone. */
  async function resetAll() {
    dirty.clear(); forced.clear(); try { await chain; } catch (e) { /* ignore */ }
    await commitMany([], true);
    KEYS.forEach((k) => { cache[k] = clone(DEFAULTS[k]); revs[k] = 0; sizes[k] = 0; }); auxNames.clear(); setState('saved');
  }

  /** Reads the stored records back from IndexedDB and compares them with memory. Call after flush(). */
  async function verifyPersisted() {
    const byKey = new Map((await getAllRecords()).map((r) => [r.key, r.json])); const mismatches = [];
    KEYS.forEach((k) => { const stored = byKey.get(k); const mem = JSON.stringify(cache[k]); if ((stored === undefined ? JSON.stringify(DEFAULTS[k]) : stored) !== mem) mismatches.push(k); });
    return { ok: mismatches.length === 0, mismatches };
  }

  /** Replaces EVERY collection with db[...] all-or-nothing (used by restore and migration). Missing keys become empty. */
  function replaceAll(dbData) {
    KEYS.forEach((k) => { if (dbData[k] !== undefined && !typeOk(k, dbData[k])) throw new StorageError('BAD_TYPE', `Invalid data type for "${k}".`); });
    const snap = snapshot(KEYS);
    try { KEYS.forEach((k) => write(k, dbData[k] !== undefined ? dbData[k] : clone(DEFAULTS[k]), { force: true })); }
    catch (e) { restore(snap); throw e; }
  }

  /* ---------- Multi-key transactions (all-or-nothing) ---------- */
  function snapshot(keys) { const s = {}; keys.forEach((k) => { s[k] = read(k); }); return s; }
  function restore(snap) { Object.keys(snap).forEach((k) => { try { write(k, snap[k], { force: true }); } catch (e) { console.error('[SmartStock] rollback failed for ' + k, e); } }); }
  /** Runs fn(); if it throws, every listed key is put back exactly as it was. Writers always replace arrays, never mutate them.
   *  Everything written inside one user action is saved to IndexedDB as one atomic transaction. */
  function transaction(keys, fn) { const snap = snapshot(keys); try { return fn(); } catch (e) { restore(snap); throw e; } }

  /* Warn before closing the page while a save is still running or has failed. */
  if (typeof window.addEventListener === 'function') window.addEventListener('beforeunload', (e) => { if (state !== 'saved') { e.preventDefault(); e.returnValue = ''; } });

  SS.storage = {
    SCHEMA_VERSION, KEYS, PREFIX, StorageError, init, read, write, uid, counter, collection, object: objectStore,
    checkIntegrity, exportAll, usage, estimate, requestPersistence, resetAll, recoverPending() { return null; }, snapshot, restore, transaction, replaceAll, migrateDb, MIGRATIONS, DEFAULTS,
    flush, retry, status() { return { state, error: lastError }; }, verifyPersisted, refreshFromDb,
    hasAux, getAux, setAux, removeAux, legacyInfo, removeLegacy, _hooks,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();

;
/* SmartStock — audit-log.js
 * Append-only activity log. Entries store previous/new values and an operator label.
 * Purchase-price fields are redacted from log views unless cost access is unlocked (see settings.js).
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const MAX_ENTRIES = 5000;
  const COST_FIELDS = ['purchasePrice', 'unitCost', 'costSnapshot', 'previousPurchasePrice', 'newPurchasePrice'];

  function operator() { return (SS.settings && SS.settings.get().operatorLabel) || 'Owner'; }

  /** record(actionType, relatedRecord:{type,id,label?}, previous, next) */
  function record(actionType, related, previous, next) {
    try {
      const list = SS.storage.read('auditLogs').slice();
      list.push({
        id: SS.storage.uid('act'), actionType, related: related || null,
        previous: previous == null ? null : previous, next: next == null ? null : next,
        timestamp: Date.now(), operator: operator()
      });
      // Keep the log bounded without ever touching financial records themselves.
      SS.storage.write('auditLogs', list.length > MAX_ENTRIES ? list.slice(list.length - MAX_ENTRIES) : list);
    } catch (e) {
      console.error('[SmartStock] audit log write failed', e);
      if (SS.utils) SS.utils.toast('Activity could not be logged: ' + e.message, 'warning');
    }
  }

  function redact(values) {
    if (!values || typeof values !== 'object') return values;
    const out = Array.isArray(values) ? values.slice() : Object.assign({}, values);
    COST_FIELDS.forEach((f) => { if (f in out) out[f] = '••••'; });
    return out;
  }

  /** list({search, limit}) — cost fields redacted unless authorised. */
  function list(opts) {
    opts = opts || {};
    const canCost = SS.privacy && SS.privacy.canViewCost();
    let items = SS.storage.read('auditLogs').slice().reverse();
    if (opts.search) {
      const q = opts.search.toLowerCase();
      items = items.filter((a) => (a.actionType + ' ' + JSON.stringify(a.related || '')).toLowerCase().includes(q));
    }
    if (opts.limit) items = items.slice(0, opts.limit);
    return canCost ? items : items.map((a) => Object.assign({}, a, { previous: redact(a.previous), next: redact(a.next) }));
  }

  SS.audit = { record, list };
})();

;
/* SmartStock — settings.js
 * Settings store + centralised Purchase Price Privacy (SS.privacy).
 * SECURITY NOTE: the admin PIN is stored (salted + hashed) in browser storage. Anyone with direct
 * access to this browser profile / DevTools can read or reset it. It stops casual viewing
 * by staff at the counter; it is NOT strong security.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el } = SS.utils;

  const DEFAULT_SETTINGS = {
    shopName: 'My Shop', shopAddress: '', shopPhone: '', shopLogo: '',
    currencyDisplay: 'ကျပ်', defaultPayment: 'cash', lowStockThreshold: 5,
    taxEnabled: false, taxRate: 0, receiptFooter: 'ကျေးဇူးတင်ပါသည်', dateFormat: 'DD/MM/YYYY',
    timezone: 'Asia/Yangon', theme: 'light', language: 'my', sidebarCollapsed: false,
    operatorLabel: 'Owner', allowPartialPayments: false, receiptSize: '80', privacy: { salt: '', hash: '' }, lastBackupAt: null, offlineApp: false, nearExpiryDays: 30, batchMethod: 'fefo'
  };

  function get() { return Object.assign({}, DEFAULT_SETTINGS, SS.storage.object.get('settings')); }
  function patch(p) { return SS.storage.object.patch('settings', p); }
  SS.settings = { get, patch, DEFAULT_SETTINGS };

  /* ---------- Purchase price privacy ---------- */
  let unlocked = false;     // in-memory only: never persisted, resets on reload
  const subs = new Set();

  function toHex(buf) { return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join(''); }
  async function hashPin(pin, salt) {
    if (window.crypto && crypto.subtle) return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin)));
    // Fallback (non-secure contexts): weak FNV hash — acceptable only because the PIN is not strong security anyway.
    let h = 2166136261; const s = salt + ':' + pin;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'fnv' + (h >>> 0).toString(16);
  }
  function notify() { subs.forEach((fn) => fn(unlocked)); }

  const privacy = {
    hasPin() { return !!get().privacy.hash; },
    /** The ONLY permission check for purchase prices. UI must call this before fetching cost data. */
    canViewCost() { return unlocked; },
    lock() { if (unlocked) { unlocked = false; notify(); } },
    async setPin(newPin, currentPin) {
      if (!/^\d{4,8}$/.test(newPin)) throw new Error('PIN must be 4–8 digits.');
      if (privacy.hasPin() && !(await privacy.verify(currentPin))) throw new Error('Current PIN is incorrect.');
      const salt = SS.storage.uid('salt');
      patch({ privacy: { salt, hash: await hashPin(newPin, salt) } });
      SS.audit.record('privacy.pin_changed', { type: 'settings', id: 'privacy' });
    },
    async verify(pin) { const p = get().privacy; return !!p.hash && (await hashPin(String(pin || ''), p.salt)) === p.hash; },
    /** Verifies a PIN typed into an inline field and unlocks cost access for this page view. */
    async tryUnlock(pin) {
      if (!privacy.hasPin()) throw new Error('Set an administrator PIN in Settings first.');
      if (!(await privacy.verify(pin))) return false;
      unlocked = true; notify(); SS.audit.record('privacy.cost_unlocked', { type: 'settings', id: 'privacy' });
      return true;
    },
    /** Shows PIN dialog; resolves true when cost access was granted. */
    requestUnlock() {
      return new Promise((resolve) => {
        if (unlocked) return resolve(true);
        if (!privacy.hasPin()) {
          SS.utils.toast('Set an administrator PIN in Settings first.', 'warning');
          return resolve(false);
        }
        const input = el('input', { class: 'input', type: 'password', inputmode: 'numeric', autocomplete: 'off', id: 'pinInput', 'aria-label': 'Administrator PIN' });
        const err = el('div', { class: 'err', role: 'alert' });
        let settled = false;
        const done = (v) => { if (!settled) { settled = true; resolve(v); } };
        const body = el('div', null, el('p', { class: 'muted' }, 'Enter the administrator PIN to show purchase prices. They hide again when you leave the page.'), el('div', { class: 'field' }, el('label', { for: 'pinInput' }, 'Administrator PIN'), input, err));
        SS.utils.openModal({
          title: 'Show purchase prices', body,
          actions: [
            { label: SS.i18n.t('cancel'), onClick: () => done(false) },
            { label: 'Unlock', kind: 'primary', onClick: () => {
              privacy.verify(input.value).then((ok) => {
                if (ok) { unlocked = true; notify(); SS.audit.record('privacy.cost_unlocked', { type: 'settings', id: 'privacy' }); done(true); SS.utils.closeModal(); }
                else { err.textContent = 'Incorrect PIN.'; input.select(); }
              });
              return false; // keep dialog open until verified
            } }
          ]
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.querySelector('.modal .btn.primary').click(); } });
        document.addEventListener('ss:modal-closed', () => done(false), { once: true });
      });
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  };
  SS.privacy = privacy;

  /* ---------- Settings page ---------- */
  function field(label, id, control, help) {
    return el('div', { class: 'field' }, el('label', { for: id }, label), control, help ? el('span', { class: 'small muted' }, help) : null);
  }
  function render(root) {
    const s = get();
    const inp = (id, val, type, extra) => el('input', Object.assign({ class: 'input', id, type: type || 'text', value: val == null ? '' : val }, extra || {}));
    const sel = (id, opts, val) => el('select', { class: 'input', id }, opts.map(([v, l]) => el('option', Object.assign({ value: v }, v === val ? { selected: true } : {}), l)));

    let logo = s.shopLogo || '';
    const logoImg = el('img', { class: 'thumb', alt: 'Shop logo', style: logo ? '' : 'display:none', src: logo || '' });
    const logoFile = el('input', { type: 'file', accept: 'image/*', id: 'sLogo', 'aria-label': 'Shop logo' });
    logoFile.addEventListener('change', async () => { if (!logoFile.files[0]) return; try { const blob = await SS.products.images.shrink(logoFile.files[0]); logo = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); logoImg.src = logo; logoImg.style.display = ''; } catch (e) { SS.utils.toast(e.message, 'error'); } });
    const logoField = el('div', { class: 'field' }, el('label', { for: 'sLogo' }, 'Shop logo (shown on receipts)'), el('div', { class: 'toolbar' }, logoImg, logoFile, el('button', { class: 'btn sm', type: 'button', onclick: () => { logo = ''; logoImg.style.display = 'none'; logoFile.value = ''; } }, 'Remove')));
    const form = el('form', { novalidate: true },
      el('fieldset', null, el('legend', null, 'Shop profile'), el('div', { class: 'form-grid' },
        field('Shop name', 'sName', inp('sName', s.shopName)),
        field('Phone number', 'sPhone', inp('sPhone', s.shopPhone, 'tel')),
        field('Address', 'sAddr', inp('sAddr', s.shopAddress)),
        field('Operator label (shown in activity log)', 'sOp', inp('sOp', s.operatorLabel)))),
      el('fieldset', null, el('legend', null, 'Regional & display'), el('div', { class: 'form-grid' },
        field('Currency display', 'sCur', sel('sCur', [['ကျပ်', '1,000 ကျပ်'], ['MMK', 'MMK 1,000']], s.currencyDisplay), 'Display only — all values are stored as integer MMK. No conversion is ever applied.'),
        field('Date format', 'sDate', sel('sDate', [['DD/MM/YYYY', 'DD/MM/YYYY'], ['MM/DD/YYYY', 'MM/DD/YYYY'], ['YYYY-MM-DD', 'YYYY-MM-DD']], s.dateFormat)),
        field('Timezone', 'sTz', sel('sTz', [['Asia/Yangon', 'Asia/Yangon (UTC+06:30)'], ['UTC', 'UTC']], s.timezone)),
        field('Theme', 'sTheme', sel('sTheme', [['light', 'Light'], ['dark', 'Dark']], s.theme)))),
      el('fieldset', null, el('legend', null, 'Sales & stock defaults'), el('div', { class: 'form-grid' },
        field('Default payment method', 'sPay', sel('sPay', [['cash', 'Cash'], ['kbzpay', 'KBZPay'], ['wavepay', 'WavePay'], ['ayapay', 'AYA Pay'], ['bank', 'Bank Transfer'], ['other', 'Other']], s.defaultPayment)),
        field('Low-stock threshold (units)', 'sLow', inp('sLow', s.lowStockThreshold, 'number', { min: '0', step: '1' })),
        field('Tax enabled', 'sTaxOn', sel('sTaxOn', [['0', 'No'], ['1', 'Yes']], s.taxEnabled ? '1' : '0')),
        field('Tax rate (%)', 'sTax', inp('sTax', s.taxRate, 'number', { min: '0', max: '100', step: '0.1' })),
        field('Receipt footer', 'sFoot', inp('sFoot', s.receiptFooter)),
        field('Receipt paper size', 'sRcpt', sel('sRcpt', [['58', '58 mm thermal'], ['80', '80 mm thermal'], ['a4', 'A4 invoice']], s.receiptSize || '80')),
        field('Allow partial payments (credit sales)', 'sPart', sel('sPart', [['0', 'No — full payment only'], ['1', 'Yes — unpaid balance goes to the customer']], s.allowPartialPayments ? '1' : '0'), 'Credit needs a named customer; walk-in sales are always paid in full.'),
        field('Near-expiry warning (days before expiry)', 'sNear', el('input', { class: 'input', id: 'sNear', type: 'number', min: '1', max: '365', value: s.nearExpiryDays }), 'For products that track batches and expiry.'),
        field('Issue stock with batches', 'sBm', sel('sBm', [['fefo', 'FEFO — earliest expiry first'], ['fifo', 'FIFO — oldest received first']], s.batchMethod || 'fefo')),
        logoField)),
      el('div', { class: 'btn-row' }, el('button', { class: 'btn primary', type: 'submit' }, SS.i18n.t('save'))));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const low = SS.utils.toInt(form.sLow.value), tax = Number(form.sTax.value);
      let bad = false;
      [[form.sName, !form.sName.value.trim()], [form.sLow, low < 0], [form.sTax, !(tax >= 0 && tax <= 100)]].forEach(([n, invalid]) => { n.classList.toggle('invalid', invalid); bad = bad || invalid; });
      if (bad) return SS.utils.toast('Please fix the highlighted fields.', 'error');
      const before = get();
      try {
        patch({ shopName: form.sName.value.trim(), shopPhone: form.sPhone.value.trim(), shopAddress: form.sAddr.value.trim(), operatorLabel: form.sOp.value.trim() || 'Owner',
          currencyDisplay: form.sCur.value, dateFormat: form.sDate.value, timezone: form.sTz.value, theme: form.sTheme.value,
          defaultPayment: form.sPay.value, receiptSize: form.sRcpt.value, allowPartialPayments: form.sPart.value === '1', shopLogo: logo, lowStockThreshold: low, taxEnabled: form.sTaxOn.value === '1', taxRate: tax, receiptFooter: form.sFoot.value, nearExpiryDays: Math.min(365, Math.max(1, SS.utils.toInt(form.sNear.value) || 30)), batchMethod: form.sBm.value === 'fifo' ? 'fifo' : 'fefo' });
        SS.audit.record('settings.updated', { type: 'settings', id: 'main' }, { shopName: before.shopName }, { shopName: form.sName.value.trim() });
        SS.app.applyTheme(); SS.utils.toast('Settings saved.', 'success');
      } catch (err) { SS.utils.toast(err.message, 'error'); }
    });

    // Privacy card
    const pinMsg = el('div', { class: 'err', role: 'alert' });
    const cur = el('input', { class: 'input', id: 'pCur', type: 'password', inputmode: 'numeric', autocomplete: 'off' });
    const nw = el('input', { class: 'input', id: 'pNew', type: 'password', inputmode: 'numeric', autocomplete: 'off' });
    const privacyCard = el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', null, 'Purchase price privacy')),
      el('div', { class: 'notice' }, 'Purchase prices are hidden by default everywhere except authorised cost views. The PIN is stored in this browser’s storage: it keeps casual viewers out, but it is not strong security against anyone with direct access to this browser profile.'),
      el('div', { class: 'form-grid' },
        privacy.hasPin() ? field('Current PIN', 'pCur', cur) : el('div'),
        field(privacy.hasPin() ? 'New PIN (4–8 digits)' : 'Set administrator PIN (4–8 digits)', 'pNew', nw)),
      pinMsg,
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn primary', type: 'button', onclick: async () => {
          pinMsg.textContent = '';
          try { await privacy.setPin(nw.value, cur.value); SS.utils.toast('Administrator PIN saved.', 'success'); SS.app.refresh(); }
          catch (e) { pinMsg.textContent = e.message; }
        } }, privacy.hasPin() ? 'Change PIN' : 'Set PIN')));

    // Offline app card (optional service worker)
    const pwaMsg = el('p', { class: 'small muted', id: 'pwaMsg' }, 'Checking…'); const pwaBtn = el('button', { class: 'btn', type: 'button', id: 'pwaBtn', disabled: true }, '…'); const pwaInstall = el('button', { class: 'btn', type: 'button', id: 'pwaInstall', style: 'display:none', onclick: async () => { await SS.pwa.install(); } }, 'Install app');
    const pwaDraw = async () => {
      const st = await SS.pwa.status();
      pwaMsg.textContent = { unsupported: 'Not available here: offline mode needs https:// or http://localhost. (The app still works offline once loaded, because your data is stored in this browser.)', off: 'Off. Turn it on to cache the app files so it opens with no internet and can be installed.', pending: 'Starting… reload once if it stays like this.', on: 'On. The app files are cached and the app can open without internet. Business data is never put in this cache.' }[st];
      pwaBtn.textContent = st === 'on' || st === 'pending' ? 'Turn off offline app' : 'Turn on offline app'; pwaBtn.disabled = st === 'unsupported'; pwaInstall.style.display = SS.pwa.canInstall() ? '' : 'none';
    };
    pwaBtn.addEventListener('click', async () => { pwaBtn.disabled = true; try { if (SS.pwa.enabled()) { await SS.pwa.disable(); SS.utils.toast('Offline app turned off and its cache cleared.', 'info'); } else { await SS.pwa.enable(); SS.utils.toast('Offline app turned on.', 'success'); } } catch (e) { SS.utils.toast(e.message, 'error'); } pwaDraw(); });
    const pwaCard = el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', null, 'Offline app')), pwaMsg, el('div', { class: 'btn-row' }, pwaBtn, pwaInstall)); pwaDraw();
    // Data card
    const issues = SS.storage.checkIntegrity();
    const estVal = el('span', null, '…'), persVal = el('span', null, '…'); const persBtn = el('button', { class: 'btn small', type: 'button' }, 'Ask browser to protect it');
    const drawEst = () => SS.storage.estimate().then((e) => {
      if (!e) { estVal.textContent = 'not reported by this browser'; persVal.textContent = 'unknown'; persBtn.hidden = true; return; }
      const mb = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : (b / 1048576).toFixed(1) + ' MB');
      estVal.textContent = mb(e.usage) + ' used of about ' + mb(e.quota);
      persVal.textContent = ''; persVal.append(el('span', { class: 'badge ' + (e.persisted ? 'success' : 'warning') }, e.persisted ? 'Yes' : 'No — the browser may delete data if the device runs very low on space'));
      persBtn.hidden = !!e.persisted;
    });
    persBtn.addEventListener('click', async () => { persBtn.disabled = true; const g = await SS.storage.requestPersistence(); await drawEst(); persBtn.disabled = false; SS.utils.toast(g ? 'Protected.' : 'The browser did not grant protection. Keep making backups.', g ? 'success' : 'warning'); });
    drawEst();
    const legacy = SS.storage.legacyInfo();
    const legacyLi = legacy.present ? el('li', null, el('span', null, 'Old copy from the previous version (' + (legacy.bytes / 1024).toFixed(0) + ' KB)'), el('button', { class: 'btn small', type: 'button', onclick: async () => {
      const ok = await SS.utils.confirmDialog('Delete the old copy?', 'Your data was already moved to the new storage and checked. This only removes the leftover old copy in this browser. Make sure you have a backup.', 'Delete old copy', true);
      if (!ok) return; try { await SS.storage.removeLegacy(); SS.utils.toast('Old copy deleted.', 'success'); SS.app.refresh(); } catch (e) { SS.utils.toast(e.message, 'error'); }
    } }, 'Delete old copy')) : null;
    const dataCard = el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('h2', null, 'Data & storage')),
      el('ul', { class: 'list' },
        el('li', null, el('span', null, 'Schema version'), el('span', null, String(SS.storage.SCHEMA_VERSION))),
        el('li', null, el('span', null, 'Storage used by SmartStock'), el('span', null, (SS.storage.usage() / 1024).toFixed(1) + ' KB')),
        el('li', null, el('span', null, 'Browser storage on this device'), estVal),
        el('li', null, el('span', null, 'Protected from automatic clean-up'), el('span', { class: 'btn-row' }, persVal, persBtn)),
        legacyLi,
        el('li', null, el('span', null, 'Last backup'), el('a', { class: 'badge ' + (SS.backup && SS.backup.lastBackup() ? 'success' : 'warning'), href: '#/backup' }, SS.backup && SS.backup.lastBackup() ? SS.utils.formatDate(SS.backup.lastBackup().at, true) : 'Never — open Backup')),
        el('li', null, el('span', null, 'Financial reconciliation'), el('a', { class: 'badge info', href: '#/reports/reconcile' }, 'Open report')),
        el('li', null, el('span', null, 'Integrity check'), el('span', { class: 'badge ' + (issues.length ? 'danger' : 'success') }, issues.length ? issues.length + ' issue(s)' : 'OK'))),
      el('p', { class: 'small muted' }, 'Data is saved in this browser (IndexedDB) on this device only. It does not sync to other browsers or devices. Use Backup & Restore to save everything to a file.'),
      el('div', { class: 'btn-row' }, el('button', { class: 'btn danger', type: 'button', onclick: async () => {
        const ok = await SS.utils.confirmDialog('Reset application?', 'This permanently deletes ALL SmartStock data in this browser (products, sales, purchases, settings, logs). Create a backup first (Backup & Restore page) — a reset cannot be undone.', 'Delete everything', true);
        if (!ok) return;
        const typed = el('input', { class: 'input', id: 'rstTxt', 'aria-label': 'Type RESET' });
        SS.utils.openModal({ title: 'Type RESET to confirm', body: el('div', { class: 'field' }, typed), actions: [
          { label: SS.i18n.t('cancel') },
          { label: 'Reset now', kind: 'danger', onClick: async () => { if (typed.value !== 'RESET') { SS.utils.toast('Type RESET exactly to continue.', 'warning'); return false; } try { await SS.storage.resetAll(); location.reload(); } catch (e) { SS.utils.toast('Reset failed: ' + e.message, 'error'); } } }] });
      } }, 'Reset application')));

    root.append(el('div', { class: 'grid' },
      el('div', { class: 'col-8' }, el('div', { class: 'card' }, form)),
      el('div', { class: 'col-4' }, el('div', { style: 'display:grid;gap:16px' }, privacyCard, dataCard, pwaCard))));
  }
  SS.settings.render = render;
})();

;
/* SmartStock — inventory.js
 * Central stock service (SS.inventory) + Inventory page.
 * RULE: product quantities are changed ONLY through SS.inventory.adjust(); no other module writes `stock`.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatQty, qty, formatDate } = SS.utils;
  const ui = SS.ui;

  // sign: +1 adds stock, -1 removes stock, 0 = signed quantity supplied by caller
  const TYPES = {
    opening: { label: 'Opening stock', sign: 1, manual: false },
    addition: { label: 'Stock addition', sign: 1, manual: true },
    reduction: { label: 'Stock reduction', sign: -1, manual: true },
    sale: { label: 'Sales deduction', sign: -1, manual: false },
    purchase: { label: 'Purchase addition', sign: 1, manual: false },
    customer_return: { label: 'Customer return', sign: 1, manual: true },
    supplier_return: { label: 'Supplier return', sign: -1, manual: true },
    damaged: { label: 'Damaged goods', sign: -1, manual: true },
    expired: { label: 'Expired goods', sign: -1, manual: true },
    lost: { label: 'Lost goods', sign: -1, manual: true },
    adjustment: { label: 'Manual adjustment', sign: 0, manual: true },
    stocktake: { label: 'Stocktake adjustment', sign: 0, manual: false }
  };
  const REASON_REQUIRED = ['addition', 'reduction', 'customer_return', 'supplier_return', 'damaged', 'expired', 'lost', 'adjustment'];

  function stockStatus(p) {
    const s = Number(p.stock) || 0;
    const th = p.lowStockThreshold != null && p.lowStockThreshold !== '' ? Number(p.lowStockThreshold) : SS.settings.get().lowStockThreshold;
    return s <= 0 ? 'out' : s <= th ? 'low' : 'ok';
  }


  /* ---------- Optional batch / expiry tracking (product.trackBatches) ----------
   * A tracked product keeps product.batches = [{id, number, expiry:'YYYY-MM-DD'|'', mfg, qty, receivedAt}] whose quantities always add
   * up to product.stock (adjust() is the only writer of both, in one product write). Outgoing stock is taken FEFO (earliest expiry
   * first, batches without an expiry last) or FIFO (oldest received first) — Settings → batchMethod. Sales never use expired batches;
   * "Expired goods" removes expired batches first; refunds put stock back into the batches it came from. */
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const todayKey = () => SS.utils.dayKey(Date.now());
  const isExpired = (b, today) => !!b.expiry && b.expiry < (today || todayKey());
  /** Units that may be sold now (expired batches excluded for tracked products). */
  function sellable(p) { const st = Number(p.stock) || 0; if (!p.trackBatches) return st; const t = todayKey(); return qty(st - (p.batches || []).filter((b) => isExpired(b, t)).reduce((a, b) => a + b.qty, 0)); }
  const cmpExpiry = (a, b) => (a.expiry && b.expiry ? (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0) : a.expiry ? -1 : b.expiry ? 1 : 0);
  function checkBatchInfo(info) {
    const i = info || {}; const out = { number: String(i.number || '').trim(), expiry: String(i.expiry || '').trim(), mfg: String(i.mfg || '').trim() };
    if (out.expiry && !DATE_RE.test(out.expiry)) throw new Error('Enter the expiry date as a valid date.');
    if (out.mfg && !DATE_RE.test(out.mfg)) throw new Error('Enter the manufacturing date as a valid date.');
    if (out.expiry && out.mfg && out.mfg > out.expiry) throw new Error('The manufacturing date cannot be after the expiry date.');
    return out;
  }
  function addToBatch(list, info, q, defaultNumber, receivedAt) {
    const number = info.number || defaultNumber; const hit = list.find((b) => b.number === number && b.expiry === (info.expiry || '') && b.mfg === (info.mfg || ''));
    if (hit) { hit.qty = qty(hit.qty + q); return hit; }
    const b = { id: SS.storage.uid('bat'), number, expiry: info.expiry || '', mfg: info.mfg || '', qty: q, receivedAt }; list.push(b); return b;
  }
  /** Batches of a tracked product as shown to the user (stock not in any batch appears as "UNASSIGNED"). */
  function batchList(p) {
    const list = (p.batches || []).filter((b) => b.qty > 0).map((b) => Object.assign({}, b)); const have = qty(list.reduce((a, b) => a + b.qty, 0)); const st = Number(p.stock) || 0;
    if (have < st - 0.0005) list.push({ id: 'unassigned', number: 'UNASSIGNED', expiry: '', mfg: '', qty: qty(st - have), receivedAt: 0 });
    return list.sort(cmpExpiry);
  }
  /** Returns {batches, used:[{id,number,expiry,qty}]} for a stock change of `delta` on a tracked product. Throws on shortage. */
  function planBatches(p, delta, opts, type, moves) {
    const today = todayKey(); const now = Date.now(); const stock = Number(p.stock) || 0; const list = (p.batches || []).map((b) => Object.assign({}, b));
    const have = qty(list.reduce((a, b) => a + b.qty, 0));
    if (have > stock + 0.0005) throw new Error(`The batch quantities of ${p.name} do not add up to its stock. Open Reports → Reconciliation.`);
    if (have < stock - 0.0005) list.push({ id: SS.storage.uid('bat'), number: 'UNASSIGNED', expiry: '', mfg: '', qty: qty(stock - have), receivedAt: 0 });
    const used = [];
    if (delta > 0) {
      let left = delta;
      if (type === 'customer_return' && opts.relatedId && !opts.batch) {
        const mine = moves.filter((m) => m.relatedId === opts.relatedId && m.productId === p.id && m.batches); const sold = [], back = {};
        mine.forEach((m) => m.batches.forEach((b) => { if (m.type === 'sale') sold.push(b); else if (m.type === 'customer_return') back[b.id] = (back[b.id] || 0) + b.qty; }));
        sold.forEach((b) => { if (left <= 0) return; const r = Math.min(left, qty(b.qty - (back[b.id] || 0))); if (r <= 0) return; const live = list.find((x) => x.id === b.id);
          if (live) live.qty = qty(live.qty + r); else list.push({ id: b.id, number: b.number, expiry: b.expiry || '', mfg: '', qty: r, receivedAt: now }); used.push({ id: b.id, number: b.number, expiry: b.expiry || '', qty: r }); left = qty(left - r); });
      }
      if (left > 0) { const info = checkBatchInfo(opts.batch); const defaults = { opening: 'OPENING', purchase: 'PURCHASE', customer_return: 'RETURNED', stocktake: 'COUNTED', adjustment: 'ADJUSTED', addition: 'ADDED' };
        const b = addToBatch(list, info, left, defaults[type] || 'ADDED', now); used.push({ id: b.id, number: b.number, expiry: b.expiry, qty: left }); }
    } else {
      let need = qty(-delta); let cands = list.filter((b) => b.qty > 0);
      if (opts.batchId) { cands = cands.filter((b) => b.id === opts.batchId); if (qty(cands.reduce((a, b) => a + b.qty, 0)) < need) throw new Error('The chosen batch does not have that many units.'); }
      else if (type === 'sale') cands = cands.filter((b) => !isExpired(b, today));
      const fifo = (SS.settings.get().batchMethod === 'fifo');
      cands.sort((a, b) => (type === 'expired' ? (isExpired(b, today) - isExpired(a, today)) : 0) || (fifo ? (a.receivedAt - b.receivedAt) : (cmpExpiry(a, b) || (a.receivedAt - b.receivedAt))));
      const avail = qty(cands.reduce((a, b) => a + b.qty, 0));
      if (avail < need) throw new Error(type === 'sale' && sellable(p) < need && stock >= need ? `Only ${formatQty(sellable(p))} of ${p.name} can be sold — the rest is expired. Record it as "Expired goods" in Inventory.` : `Insufficient stock: ${p.name} has ${formatQty(avail)} available but ${formatQty(need)} was requested.`);
      cands.forEach((b) => { if (need <= 0) return; const r = Math.min(need, b.qty); b.qty = qty(b.qty - r); need = qty(need - r); used.push({ id: b.id, number: b.number, expiry: b.expiry, qty: r }); });
    }
    return { batches: list.filter((b) => b.qty > 0), used };
  }

  /**
   * adjust({productId, type, quantity, reason, relatedId, unitCost, batch:{number,expiry,mfg}, batchId})
   * quantity: positive magnitude for signed types; signed delta for 'adjustment'/'stocktake'.
   * unitCost (integer MMK, additions only) feeds the weighted-average cost.
   * Writes the movement first, then the product; if the product write fails the movement is rolled back.
   */
  function adjust(opts) {
    const t = TYPES[opts.type];
    if (!t) throw new Error('Unknown stock movement type.');
    let q = qty(opts.quantity);
    if (!q) throw new Error('Quantity must be a non-zero number.');
    if (t.sign !== 0 && q < 0) throw new Error('Enter a positive quantity — the movement type decides the direction.');
    const delta = t.sign === 0 ? q : q * t.sign;
    const reason = String(opts.reason || '').trim();
    if (REASON_REQUIRED.includes(opts.type) && !reason) throw new Error('A reason is required for this stock change.');

    const products = SS.storage.read('products').slice();
    const idx = products.findIndex((p) => p.id === opts.productId);
    if (idx < 0) throw new Error('Product not found.');
    const p = products[idx];
    const prev = Number(p.stock) || 0; const next = qty(prev + delta);
    if (next < 0) throw new Error(`Insufficient stock: ${p.name} has ${formatQty(prev)} but ${formatQty(Math.abs(delta))} was requested.`);

    const plan = p.trackBatches ? planBatches(p, delta, opts, opts.type, SS.storage.read('stockMovements')) : null;
    let avgCost = p.avgCost != null ? p.avgCost : (p.purchasePrice || 0);
    if (delta > 0 && opts.unitCost != null && opts.unitCost !== '') {
      const cost = SS.utils.toInt(opts.unitCost);
      avgCost = next > 0 ? Math.round((prev * avgCost + delta * cost) / next) : cost;   // weighted-average costing
    }
    const mv = { id: SS.storage.uid('mov'), productId: p.id, type: opts.type, quantity: delta, previousStock: prev, newStock: next, reason, relatedId: opts.relatedId || null, createdAt: Date.now() };
    if (plan) mv.batches = plan.used;
    const moves = SS.storage.read('stockMovements').slice();
    const movesBefore = moves.slice();
    moves.push(mv);
    SS.storage.write('stockMovements', moves);
    try {
      products[idx] = Object.assign({}, p, plan ? { stock: next, avgCost, batches: plan.batches, updatedAt: Date.now() } : { stock: next, avgCost, updatedAt: Date.now() });
      SS.storage.write('products', products);
    } catch (e) {
      try { SS.storage.write('stockMovements', movesBefore, { force: true }); } catch (_) { /* best effort rollback */ }
      throw e;
    }
    if (!opts.noAudit) SS.audit.record('stock.' + opts.type, { type: 'product', id: p.id, label: p.name }, { stock: prev }, { stock: next, reason });
    return mv;
  }

  /** Movement list with product-name lookup (archived products stay resolvable). */
  function movements(filter) {
    filter = filter || {};
    const names = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p]));
    const q = (filter.search || '').toLowerCase();
    return SS.storage.read('stockMovements').filter((m) => {
      if (filter.type && m.type !== filter.type) return false;
      if (filter.productId && m.productId !== filter.productId) return false;
      const day = SS.utils.dayKey(m.createdAt);
      if (filter.from && day < filter.from) return false;
      if (filter.to && day > filter.to) return false;
      const p = names[m.productId];
      if (q && !(p && (p.name + ' ' + p.sku).toLowerCase().includes(q))) return false;
      return true;
    }).map((m) => Object.assign({}, m, { productName: names[m.productId] ? names[m.productId].name : '(missing product)' })).reverse();
  }

  /** Stock valuation. Cost value is computed only when cost access is unlocked. */
  function valuation() {
    const active = SS.storage.read('products').filter((p) => p.status !== 'archived');
    const out = { retail: active.reduce((a, p) => a + Math.round((Number(p.stock) || 0) * (p.sellingPrice || 0)), 0), units: active.reduce((a, p) => a + (Number(p.stock) || 0), 0), cost: null };
    if (SS.privacy.canViewCost()) out.cost = active.reduce((a, p) => a + Math.round((Number(p.stock) || 0) * (p.avgCost != null ? p.avgCost : (p.purchasePrice || 0))), 0);
    return out;
  }

  /* ---------- Adjust dialog (reused by Products / Inventory) ---------- */
  function openAdjustDialog(productId, onDone) {
    const products = SS.storage.read('products').filter((p) => p.status !== 'archived');
    if (!products.length) return SS.utils.toast('Add a product first.', 'warning');
    const manual = Object.entries(TYPES).filter(([, v]) => v.manual).map(([k, v]) => [k, v.label]);
    const prod = ui.select('adjProd', products.map((p) => [p.id, `${p.name} (${p.sku}) — ${formatQty(p.stock)}`]), productId);
    const type = ui.select('adjType', manual, 'addition');
    const q = el('input', { class: 'input', id: 'adjQty', type: 'number', step: 'any', inputmode: 'decimal' });
    const reason = el('input', { class: 'input', id: 'adjReason', placeholder: 'e.g. delivery received, broken in store' });
    const hint = el('span', { class: 'small muted', id: 'adjHint' });
    const costWrap = el('div'); const batchWrap = el('div');
    const syncHints = () => {
      hint.textContent = TYPES[type.value].sign === 0 ? 'Use + to add and − to remove (e.g. -3).' : TYPES[type.value].sign > 0 ? 'Quantity to ADD.' : 'Quantity to REMOVE.';
      clear(costWrap); clear(batchWrap);
      const bp = products.find((x) => x.id === prod.value);
      if (bp && bp.trackBatches) {
        if (TYPES[type.value].sign > 0 || (TYPES[type.value].sign === 0)) batchWrap.append(el('div', { class: 'form-grid' }, ui.field('Batch number', 'adjBatch', el('input', { class: 'input', id: 'adjBatch' })), ui.field('Manufacturing date', 'adjMfg', el('input', { class: 'input', id: 'adjMfg', type: 'date' })), ui.field('Expiry date', 'adjExp', el('input', { class: 'input', id: 'adjExp', type: 'date' }))), el('p', { class: 'small muted' }, 'Batch details apply when stock is added.'));
        if (TYPES[type.value].sign < 0 || TYPES[type.value].sign === 0) { const opts = [['', 'Automatic (' + (SS.settings.get().batchMethod === 'fifo' ? 'oldest first' : 'earliest expiry first') + ')']].concat(batchList(bp).filter((b) => b.id !== 'unassigned').map((b) => [b.id, `${b.number}${b.expiry ? ' · exp ' + b.expiry : ''} — ${formatQty(b.qty)}`])); batchWrap.append(ui.field('Take from batch (when removing)', 'adjFrom', ui.select('adjFrom', opts, ''))); }
      }
      if (TYPES[type.value].sign > 0 && SS.privacy.canViewCost()) costWrap.append(ui.field('Unit purchase cost (optional, updates average cost)', 'adjCost', el('input', { class: 'input', id: 'adjCost', type: 'number', min: '0', step: '1' })));
    };
    type.addEventListener('change', syncHints); prod.addEventListener('change', syncHints); syncHints();
    SS.utils.openModal({
      title: 'Adjust stock',
      body: el('div', null, ui.field('Product', 'adjProd', prod), ui.field('Movement type', 'adjType', type), ui.field('Quantity', 'adjQty', q, null), hint, batchWrap, costWrap, ui.field('Reason', 'adjReason', reason)),
      actions: [{ label: SS.i18n.t('cancel') }, { label: SS.i18n.t('save'), kind: 'primary', onClick: () => {
        try {
          const costEl = document.getElementById('adjCost');
          const g = (id) => { const n = document.getElementById(id); return n ? n.value : ''; };
          adjust({ productId: prod.value, type: type.value, quantity: q.value, reason: reason.value, unitCost: costEl ? costEl.value : null, batch: document.getElementById('adjBatch') ? { number: g('adjBatch'), mfg: g('adjMfg'), expiry: g('adjExp') } : null, batchId: g('adjFrom') || null });
          SS.utils.toast('Stock updated.', 'success'); if (onDone) onDone();
        } catch (e) { SS.utils.toast(e.message, 'error'); return false; }
      } }]
    });
  }

  /* ---------- Inventory page ---------- */
  function page(root) {
    const st = { tab: 'levels', search: '', type: '', from: '', to: '', status: '' };
    const cats = Object.fromEntries(SS.storage.read('categories').map((c) => [c.id, c.name]));
    const body = el('div');

    function levels() {
      const canCost = SS.privacy.canViewCost();
      const v = valuation();
      const rows = SS.storage.read('products').filter((p) => p.status !== 'archived').map((p) => ({ p, status: stockStatus(p) }))
        .filter((r) => (!st.status || r.status === st.status) && (!st.search || (r.p.name + ' ' + r.p.sku + ' ' + (r.p.barcode || '')).toLowerCase().includes(st.search.toLowerCase())));
      const cols = [
        { key: 'name', label: 'Product', sortValue: (r) => r.p.name, render: (r) => el('span', null, r.p.name, el('span', { class: 'sub' }, r.p.sku + (r.p.barcode ? ' · ' + r.p.barcode : ''))) },
        { key: 'cat', label: 'Category', sortValue: (r) => cats[r.p.categoryId] || '', render: (r) => cats[r.p.categoryId] || '—' },
        { key: 'stock', label: 'Stock', num: true, sortValue: (r) => Number(r.p.stock) || 0, render: (r) => formatQty(r.p.stock) + ' ' + unitOf(r.p) },
        { key: 'status', label: 'Status', sortValue: (r) => r.status, render: (r) => r.status === 'out' ? ui.badge('Out of stock', 'danger') : r.status === 'low' ? ui.badge('Low stock', 'warning') : ui.badge('In stock', 'success') },
        { key: 'retail', label: 'Retail value', num: true, sortValue: (r) => (Number(r.p.stock) || 0) * (r.p.sellingPrice || 0), render: (r) => formatMMK(Math.round((Number(r.p.stock) || 0) * (r.p.sellingPrice || 0))) }
      ];
      if (canCost) cols.push({ key: 'cost', label: 'Cost value', num: true, sortValue: (r) => (Number(r.p.stock) || 0) * (r.p.avgCost || 0), render: (r) => formatMMK(Math.round((Number(r.p.stock) || 0) * (r.p.avgCost != null ? r.p.avgCost : (r.p.purchasePrice || 0)))) });
      cols.push({ key: 'act', label: '', sortable: false, render: (r) => el('div', { class: 'row-actions' }, el('button', { class: 'btn sm', type: 'button', onclick: () => openAdjustDialog(r.p.id, () => SS.app.refresh()) }, 'Adjust')) });
      const table = ui.dataTable({ columns: cols, rows, rowKey: 'k', empty: { title: 'No products to show', hint: 'Add products on the Products page, or change the filters.' } });
      rows.forEach((r) => { r.k = r.p.id; });
      table.setRows(rows);
      return el('div', null,
        el('div', { class: 'grid', style: 'margin-bottom:16px' },
          el('div', { class: 'col-4' }, el('div', { class: 'card stat' }, el('div', { class: 'label' }, 'Total stock units'), el('div', { class: 'value' }, formatQty(v.units)))),
          el('div', { class: 'col-4' }, el('div', { class: 'card stat' }, el('div', { class: 'label' }, 'Retail value'), el('div', { class: 'value' }, formatMMK(v.retail)))),
          el('div', { class: 'col-4' }, el('div', { class: 'card stat' }, el('div', { class: 'label' }, 'Cost value'), el('div', { class: 'value' }, v.cost == null ? el('span', { class: 'mask' }, '••••••') : formatMMK(v.cost)),
            el('div', { class: 'hint' }, v.cost == null ? el('button', { class: 'btn sm', type: 'button', onclick: () => SS.privacy.requestUnlock().then((ok) => ok && SS.app.refresh()) }, 'Show (admin PIN)') : el('button', { class: 'btn sm', type: 'button', onclick: () => { SS.privacy.lock(); SS.app.refresh(); } }, 'Hide'))))),
        el('div', { class: 'card' }, table.node));
    }

    function moves() {
      const rows = movements({ type: st.type, search: st.search, from: st.from, to: st.to });
      const table = ui.dataTable({ rowKey: 'id', pageSize: 20, rows, empty: { title: 'No stock movements', hint: 'Every stock change is recorded here automatically.' }, columns: [
        { key: 'createdAt', label: 'Time', render: (m) => formatDate(m.createdAt, true) },
        { key: 'productName', label: 'Product' },
        { key: 'type', label: 'Type', render: (m) => (TYPES[m.type] || {}).label || m.type },
        { key: 'quantity', label: 'Change', num: true, render: (m) => (m.quantity > 0 ? '+' : '') + formatQty(m.quantity) },
        { key: 'newStock', label: 'Stock after', num: true, render: (m) => `${formatQty(m.previousStock)} → ${formatQty(m.newStock)}` },
        { key: 'reason', label: 'Reason', sortable: false }] });
      return el('div', { class: 'card' }, table.node);
    }

    function draw() {
      clear(body);
      const search = el('input', { class: 'input grow', type: 'search', placeholder: 'Search name, SKU or barcode…', 'aria-label': 'Search', value: st.search, 'data-scan': '1' });
      search.addEventListener('input', SS.utils.debounce(() => { st.search = search.value; const pos = search.selectionStart; draw(); const n = body.querySelector('input[type=search]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 200));
      search.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return; e.preventDefault();
        const hit = SS.barcode.find(search.value);   // barcode lookup (scanner types the code then Enter)
        if (hit) { st.search = hit.barcode || hit.sku; draw(); SS.utils.toast('Found: ' + hit.name, 'success'); } else SS.utils.toast('No product with that barcode or SKU.', 'warning');
      });
      const bar = el('div', { class: 'toolbar' }, search);
      if (st.tab === 'levels') bar.append(ui.select('fStatus', [['', 'All stock levels'], ['ok', 'In stock'], ['low', 'Low stock'], ['out', 'Out of stock']], st.status));
      else {
        bar.append(ui.select('fType', [['', 'All movement types']].concat(Object.entries(TYPES).map(([k, v]) => [k, v.label])), st.type),
          el('input', { class: 'input', id: 'fFrom', type: 'date', value: st.from, 'aria-label': 'From date' }), el('input', { class: 'input', id: 'fTo', type: 'date', value: st.to, 'aria-label': 'To date' }));
      }
      bar.addEventListener('change', (e) => { const m = { fStatus: 'status', fType: 'type', fFrom: 'from', fTo: 'to' }[e.target.id]; if (m) { st[m] = e.target.value; draw(); } });
      body.append(el('div', { class: 'tabs', role: 'tablist' },
        el('button', { class: 'tab' + (st.tab === 'levels' ? ' active' : ''), type: 'button', role: 'tab', onclick: () => { st.tab = 'levels'; st.search = ''; draw(); } }, 'Stock levels'),
        el('button', { class: 'tab' + (st.tab === 'moves' ? ' active' : ''), type: 'button', role: 'tab', onclick: () => { st.tab = 'moves'; st.search = ''; draw(); } }, 'Stock movements')),
        bar, st.tab === 'levels' ? levels() : moves());
    }

    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('inventory')), el('p', null, 'Stock levels, valuation and the full movement history.')),
      el('button', { class: 'btn primary', type: 'button', onclick: () => openAdjustDialog(null, () => SS.app.refresh()) }, 'Adjust stock')), body);
    draw();
  }
  /** Pieces, packs, boxes and bottles must be sold in whole numbers. */
  function isWholeUnit(unit) { return ['piece', 'pack', 'box', 'bottle'].includes(unit); }
  function unitOf(p) { return p.unit === 'custom' ? (p.customUnit || '') : (p.unit || ''); }

  SS.inventory = { TYPES, isWholeUnit, sellable, batchList, isExpired, checkBatchInfo, adjust, movements, valuation, stockStatus, openAdjustDialog, unitOf };
  SS.pages = SS.pages || {}; SS.pages.inventory = page;
})();

;
/* SmartStock — categories.js */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el } = SS.utils; const ui = SS.ui;

  const all = () => SS.storage.read('categories');
  const productCount = (id, activeOnly) => SS.storage.read('products').filter((p) => p.categoryId === id && (!activeOnly || p.status !== 'archived')).length;
  const nameTaken = (name, exceptId) => all().some((c) => c.id !== exceptId && c.name.trim().toLowerCase() === name.trim().toLowerCase());

  function save(data, id) {
    const name = data.name.trim();
    if (!name) throw new Error('Category name is required.');
    if (nameTaken(name, id)) throw new Error('A category with this name already exists.');
    if (id) {
      const before = SS.storage.collection.byId('categories', id);
      const next = SS.storage.collection.update('categories', id, { name, description: data.description.trim() });
      SS.audit.record('category.updated', { type: 'category', id, label: name }, { name: before.name }, { name });
      return next;
    }
    const rec = SS.storage.collection.insert('categories', { name, description: data.description.trim(), status: 'active' }, 'cat');
    SS.audit.record('category.created', { type: 'category', id: rec.id, label: name }, null, { name });
    return rec;
  }

  function openForm(id, onDone) {
    const cur = id ? SS.storage.collection.byId('categories', id) : null;
    const name = el('input', { class: 'input', id: 'catName', value: cur ? cur.name : '', maxlength: '80' });
    const desc = el('textarea', { class: 'input', id: 'catDesc' }, cur ? cur.description || '' : '');
    SS.utils.openModal({ title: cur ? 'Edit category' : 'New category', body: el('form', { id: 'catForm', novalidate: true }, ui.field('Name', 'catName', name), ui.field('Description', 'catDesc', desc)),
      actions: [{ label: SS.i18n.t('cancel') }, { label: SS.i18n.t('save'), kind: 'primary', onClick: () => {
        try { ui.setError(name, ''); save({ name: name.value, description: desc.value }, id); SS.utils.toast('Category saved.', 'success'); if (onDone) onDone(); }
        catch (e) { ui.setError(name, e.message); return false; }
      } }] });
  }

  function setStatus(id, status) {
    const c = SS.storage.collection.byId('categories', id);
    SS.storage.collection.update('categories', id, { status });
    SS.audit.record('category.' + (status === 'archived' ? 'archived' : 'restored'), { type: 'category', id, label: c.name });
  }

  /** Delete requires reassigning products first when the category is in use. */
  function deleteCategory(id, onDone) {
    const c = SS.storage.collection.byId('categories', id); const n = productCount(id);
    if (!n) {
      SS.utils.confirmDialog('Delete category?', `“${c.name}” is not used by any product and will be permanently deleted.`, 'Delete', true).then((ok) => {
        if (!ok) return; SS.storage.collection.remove('categories', id); SS.audit.record('category.deleted', { type: 'category', id, label: c.name }); SS.utils.toast('Category deleted.', 'success'); onDone();
      });
      return;
    }
    const others = all().filter((x) => x.id !== id && x.status !== 'archived');
    if (!others.length) return SS.utils.toast(`${n} product(s) use this category. Create another category to move them to first, or archive this one instead.`, 'warning');
    const target = ui.select('catTarget', others.map((o) => [o.id, o.name]));
    SS.utils.openModal({ title: 'Reassign products before deleting', body: el('div', null, el('p', null, `${n} product(s) (including archived) use “${c.name}”. Choose a category to move them to.`), ui.field('Move products to', 'catTarget', target)),
      actions: [{ label: SS.i18n.t('cancel') }, { label: 'Move & delete', kind: 'danger', onClick: () => {
        try {
          const products = SS.storage.read('products').map((p) => (p.categoryId === id ? Object.assign({}, p, { categoryId: target.value, updatedAt: Date.now() }) : p));
          SS.storage.write('products', products); SS.storage.collection.remove('categories', id);
          SS.audit.record('category.deleted', { type: 'category', id, label: c.name }, { products: n }, { movedTo: target.value });
          SS.utils.toast('Category deleted; products reassigned.', 'success'); onDone();
        } catch (e) { SS.utils.toast(e.message, 'error'); return false; }
      } }] });
  }

  function page(root) {
    const st = { search: '', status: 'active' };
    const holder = el('div', { class: 'card' });
    function draw() {
      const rows = all().filter((c) => (st.status === 'all' || (c.status || 'active') === st.status) && (!st.search || (c.name + ' ' + (c.description || '')).toLowerCase().includes(st.search.toLowerCase())));
      const t = ui.dataTable({ rows, pageSize: 15, empty: { title: 'No categories yet', hint: 'Create your first category to organise products.' }, columns: [
        { key: 'name', label: 'Category', render: (c) => el('span', null, c.name, c.description ? el('span', { class: 'sub' }, c.description) : null) },
        { key: 'count', label: 'Products', num: true, sortValue: (c) => productCount(c.id, true), render: (c) => String(productCount(c.id, true)) },
        { key: 'status', label: 'Status', render: (c) => (c.status === 'archived' ? ui.badge('Archived', 'warning') : ui.badge('Active', 'success')) },
        { key: 'act', label: '', sortable: false, render: (c) => el('div', { class: 'row-actions' },
          el('button', { class: 'btn sm', type: 'button', onclick: () => openForm(c.id, draw) }, 'Edit'),
          el('button', { class: 'btn sm', type: 'button', onclick: () => { setStatus(c.id, c.status === 'archived' ? 'active' : 'archived'); draw(); } }, c.status === 'archived' ? 'Restore' : 'Archive'),
          el('button', { class: 'btn sm', type: 'button', onclick: () => deleteCategory(c.id, draw) }, 'Delete')) }] });
      SS.utils.clear(holder); holder.append(t.node);
    }
    const search = el('input', { class: 'input grow', type: 'search', placeholder: 'Search categories…', 'aria-label': 'Search categories' });
    search.addEventListener('input', SS.utils.debounce(() => { st.search = search.value; draw(); }, 150));
    const status = ui.select('catStatus', [['active', 'Active'], ['archived', 'Archived'], ['all', 'All']], st.status);
    status.addEventListener('change', () => { st.status = status.value; draw(); });
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('categories'))), el('button', { class: 'btn primary', type: 'button', onclick: () => openForm(null, draw) }, '+ New category')),
      el('div', { class: 'toolbar' }, search, status), holder);
    draw();
  }

  SS.categories = { all, productCount, save, openForm, options(includeArchivedId) { return all().filter((c) => c.status !== 'archived' || c.id === includeArchivedId); } };
  SS.pages = SS.pages || {}; SS.pages.categories = page;
})();

;
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

;
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

;
/* SmartStock — stocktake.js
 * Physical inventory counts: create a session (all products or one category), enter counted quantities,
 * compare with system stock, confirm, then apply as 'stocktake' stock movements. History is preserved.
 * Session shape: {id, number, name, status:'draft'|'applied', scope, categoryId, lines:[{productId,name,sku,systemQty,countedQty|null}], createdAt, appliedAt}
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatQty, qty, formatDate } = SS.utils; const ui = SS.ui;

  function create(scope, categoryId, name) {
    let products = SS.storage.read('products').filter((p) => p.status !== 'archived');
    if (scope === 'category') products = products.filter((p) => p.categoryId === categoryId);
    if (!products.length) throw new Error('No active products match this selection.');
    const number = 'ST-' + String(SS.storage.counter('stocktake')).padStart(4, '0');
    const rec = SS.storage.collection.insert('stocktakes', {
      number, name: (name || '').trim(), status: 'draft', scope, categoryId: scope === 'category' ? categoryId : '',
      lines: products.map((p) => ({ productId: p.id, name: p.name, sku: p.sku, unit: SS.inventory.unitOf(p), systemQty: Number(p.stock) || 0, countedQty: null }))
    }, 'stk');
    SS.audit.record('stocktake.created', { type: 'stocktake', id: rec.id, label: number }, null, { products: rec.lines.length });
    return rec;
  }

  function saveCounts(id, counts) {
    const s = SS.storage.collection.byId('stocktakes', id);
    if (!s || s.status !== 'draft') throw new Error('This stocktake is already applied and cannot be edited.');
    const lines = s.lines.map((l) => (l.productId in counts ? Object.assign({}, l, { countedQty: counts[l.productId] }) : l));
    return SS.storage.collection.update('stocktakes', id, { lines });
  }

  /** Applies differences (counted − current stock) as stock movements, then locks the session. */
  function apply(id) {
    const s = SS.storage.collection.byId('stocktakes', id);
    if (!s || s.status !== 'draft') throw new Error('Stocktake is not in draft state.');
    const current = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p]));
    let changed = 0; const failures = []; const lines = [];
    s.lines.forEach((l) => {
      const p = current[l.productId];
      if (l.countedQty == null || !p) { lines.push(l); return; }
      const delta = qty(l.countedQty - (Number(p.stock) || 0));
      let applied = null;
      if (delta !== 0) {
        try { SS.inventory.adjust({ productId: l.productId, type: 'stocktake', quantity: delta, reason: 'Stocktake ' + s.number }); changed++; applied = delta; }
        catch (e) { failures.push(l.name + ': ' + e.message); }
      } else applied = 0;
      lines.push(Object.assign({}, l, { adjustment: applied }));
    });
    if (failures.length) throw new Error('Some adjustments failed and the stocktake was left open: ' + failures.join('; '));
    SS.storage.collection.update('stocktakes', id, { status: 'applied', appliedAt: Date.now(), lines });
    SS.audit.record('stocktake.applied', { type: 'stocktake', id, label: s.number }, null, { adjusted: changed });
    return changed;
  }

  const diffOf = (l) => (l.countedQty == null ? null : qty(l.countedQty - l.systemQty));

  function listPage(root) {
    const list = SS.storage.read('stocktakes').slice().reverse();
    const t = ui.dataTable({ rows: list, pageSize: 10, empty: { title: 'No stocktakes yet', hint: 'Start a new stocktake to compare physical counts with system stock.' }, columns: [
      { key: 'number', label: 'No.', render: (s) => el('a', { href: '#/stocktake/' + s.id }, s.number) },
      { key: 'name', label: 'Name', render: (s) => s.name || (s.scope === 'category' ? 'By category' : 'All products') },
      { key: 'createdAt', label: 'Created', render: (s) => formatDate(s.createdAt, true) },
      { key: 'lines', label: 'Products', num: true, sortValue: (s) => s.lines.length, render: (s) => String(s.lines.length) },
      { key: 'status', label: 'Status', render: (s) => (s.status === 'applied' ? ui.badge('Applied', 'success') : ui.badge('Draft', 'info')) }] });
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('stocktake')), el('p', null, 'Count what is on the shelf, compare, then apply the differences.')),
      el('button', { class: 'btn primary', type: 'button', onclick: openNew }, '+ New stocktake')), el('div', { class: 'card' }, t.node));
  }

  function openNew() {
    const scope = ui.select('stScope', [['all', 'All active products'], ['category', 'One category']], 'all');
    const cat = ui.select('stCat', SS.categories.all().filter((c) => c.status !== 'archived').map((c) => [c.id, c.name]), '');
    const name = el('input', { class: 'input', id: 'stName', placeholder: 'Optional, e.g. “Month-end count”' });
    const catField = ui.field('Category', 'stCat', cat); catField.style.display = 'none';
    scope.addEventListener('change', () => { catField.style.display = scope.value === 'category' ? '' : 'none'; });
    SS.utils.openModal({ title: 'New stocktake', body: el('div', null, ui.field('Name', 'stName', name), ui.field('Count', 'stScope', scope), catField),
      actions: [{ label: SS.i18n.t('cancel') }, { label: 'Start', kind: 'primary', onClick: () => {
        try { if (scope.value === 'category' && !cat.value) throw new Error('Choose a category.'); const s = create(scope.value, cat.value, name.value); location.hash = '#/stocktake/' + s.id; }
        catch (e) { SS.utils.toast(e.message, 'error'); return false; }
      } }] });
  }

  function sessionPage(root, id) {
    const s = SS.storage.collection.byId('stocktakes', id);
    if (!s) { root.append(el('div', { class: 'card' }, el('div', { class: 'empty' }, el('strong', null, 'Stocktake not found'), el('a', { href: '#/stocktake' }, 'Back to stocktakes')))); return; }
    const draft = s.status === 'draft'; const inputs = {}; const summary = el('div', { class: 'small muted' });
    const rowsEl = s.lines.map((l) => {
      const diffCell = el('td', { class: 'num' }); const inp = draft
        ? el('input', { class: 'input', type: 'number', min: '0', step: 'any', style: 'width:110px;text-align:right', 'aria-label': 'Counted quantity for ' + l.name, value: l.countedQty == null ? '' : l.countedQty }) : null;
      if (inp) inputs[l.productId] = inp;
      const paint = () => {
        const counted = inp ? (inp.value === '' ? null : qty(inp.value)) : l.countedQty; const d = counted == null ? null : qty(counted - l.systemQty);
        clear(diffCell); diffCell.append(d == null ? '—' : d === 0 ? ui.badge('Match', 'success') : d < 0 ? ui.badge('Shortage ' + formatQty(d), 'danger') : ui.badge('Excess +' + formatQty(d), 'warning'));
      };
      if (inp) inp.addEventListener('input', () => { paint(); tally(); });
      paint();
      return el('tr', null, el('td', null, l.name, el('span', { class: 'sub' }, l.sku)), el('td', { class: 'num' }, formatQty(l.systemQty) + ' ' + (l.unit || '')), el('td', { class: 'num' }, inp || (l.countedQty == null ? '—' : formatQty(l.countedQty))), diffCell);
    });
    function counts() { const c = {}; Object.entries(inputs).forEach(([pid, n]) => { c[pid] = n.value === '' ? null : qty(n.value); }); return c; }
    function tally() {
      const c = counts(); const entered = Object.values(c).filter((v) => v != null).length;
      const diffs = s.lines.filter((l) => c[l.productId] != null && qty(c[l.productId] - l.systemQty) !== 0).length;
      summary.textContent = `${entered} of ${s.lines.length} counted · ${diffs} difference(s)`;
    }
    if (draft) tally(); else summary.textContent = 'Applied ' + formatDate(s.appliedAt, true);

    const actions = draft ? el('div', { class: 'btn-row' },
      el('button', { class: 'btn', type: 'button', onclick: () => { try { saveCounts(id, counts()); SS.utils.toast('Counts saved.', 'success'); } catch (e) { SS.utils.toast(e.message, 'error'); } } }, 'Save progress'),
      el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        try { saveCounts(id, counts()); } catch (e) { return SS.utils.toast(e.message, 'error'); }
        const fresh = SS.storage.collection.byId('stocktakes', id); const d = fresh.lines.filter((l) => l.countedQty != null && diffOf(l) !== 0); const un = fresh.lines.filter((l) => l.countedQty == null).length;
        const msg = `${d.length} product(s) will have their stock changed to the counted quantity.${un ? ' ' + un + ' uncounted product(s) will be left untouched.' : ''} This creates stock movements and cannot be edited afterwards.`;
        if (!(await SS.utils.confirmDialog('Apply stocktake adjustments?', msg, 'Apply adjustments'))) return;
        try { const n = apply(id); SS.utils.toast(n + ' adjustment(s) applied.', 'success'); SS.app.refresh(); } catch (e) { SS.utils.toast(e.message, 'error'); }
      } }, 'Apply adjustments')) : null;
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, s.number + (s.name ? ' · ' + s.name : '')), summary), el('div', { class: 'btn-row' }, el('a', { class: 'btn', href: '#/stocktake' }, '‹ All stocktakes'), actions)),
      el('div', { class: 'card' }, el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, el('th', null, 'Product'), el('th', { class: 'num' }, 'System stock'), el('th', { class: 'num' }, 'Counted'), el('th', { class: 'num' }, 'Difference'))), el('tbody', null, rowsEl)))));
  }

  SS.stocktake = { create, saveCounts, apply };
  SS.pages = SS.pages || {};
  SS.pages.stocktake = (root, arg) => (arg ? sessionPage(root, arg) : listPage(root));
})();

;
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

;
/* SmartStock — sales.js
 * Central transaction service (SS.sales): pricing, validation, completion, refunds, cancellations,
 * recovery of interrupted sales, receipt rendering, and the Sales History page.
 *
 * Money rules
 *  - All amounts are integer MMK.
 *  - Net sales revenue = sale total − tax. Tax is collected for the government and is not revenue.
 *  - Every sale line keeps a cost snapshot (weighted-average cost at the time of sale); later cost
 *    changes never rewrite historical profit. Cost snapshots are never shown in any sales UI or receipt.
 *  - Refunds reduce revenue and cost of goods sold of the ORIGINAL sale (not the refund date).
 *  - Completed sales are never deleted. They can only be refunded or cancelled.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatQty, toInt, qty, formatDate, dayKey } = SS.utils;
  const ui = SS.ui;

  const METHODS = [['cash', 'Cash', 'ငွေသား'], ['kbzpay', 'KBZPay', 'KBZPay'], ['wavepay', 'WavePay', 'WavePay'], ['ayapay', 'AYA Pay', 'AYA Pay'], ['bank', 'Bank Transfer', 'ဘဏ်လွှဲ'], ['other', 'Other', 'အခြား']];
  const methodLabel = (id) => (METHODS.find((m) => m[0] === id) || [0, id || '—'])[1];
  const methodReceipt = (id) => { const m = METHODS.find((x) => x[0] === id); return m ? (m[2] === m[1] ? m[1] : m[2] + ' / ' + m[1]) : String(id || '—'); };
  const SALE_KEYS = ['sales', 'products', 'stockMovements', 'payments', 'customers', 'meta'];

  /* ---------- Pricing (pure: no writes) ---------- */
  function discountOf(type, value, base) {
    value = Number(value) || 0; if (value <= 0 || base <= 0) return 0;
    const d = type === 'pct' ? Math.round(base * Math.min(value, 100) / 100) : toInt(value);
    return Math.min(Math.max(d, 0), base);
  }
  function discountProblem(type, value, base) {
    value = Number(value) || 0;
    if (value < 0) return 'Discount cannot be negative.';
    if (type === 'pct' && value > 100) return 'Discount percentage must be between 0 and 100.';
    if (type !== 'pct' && toInt(value) > base) return 'Discount is larger than the amount it applies to.';
    return '';
  }

  /** draft: {lines:[{productId, qty, discountType, discountValue}], discountType, discountValue} */
  function price(draft) {
    const settings = SS.settings.get();
    const products = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p]));
    const seen = new Set();
    const lines = (draft.lines || []).map((l) => {
      const p = products[l.productId]; const q = qty(l.qty);
      const out = { productId: l.productId, qty: q, discountType: l.discountType === 'pct' ? 'pct' : 'amt', discountValue: Number(l.discountValue) || 0, error: '' };
      if (!p) { out.error = 'Product no longer exists.'; out.productName = '(missing product)'; out.unitPrice = 0; out.gross = 0; out.discountAmount = 0; out.lineTotal = 0; return out; }
      Object.assign(out, { productName: p.name, sku: p.sku, unit: SS.inventory.unitOf(p), unitKind: p.unit, unitPrice: toInt(p.sellingPrice), stock: SS.inventory.sellable(p) });
      out.gross = Math.round(out.unitPrice * q);
      out.discountAmount = discountOf(out.discountType, out.discountValue, out.gross);
      out.lineTotal = out.gross - out.discountAmount;
      if (p.status === 'archived') out.error = 'This product is archived and cannot be sold.';
      else if (seen.has(p.id)) out.error = 'This product appears twice in the cart.';
      else if (!(q > 0)) out.error = 'Quantity must be greater than 0.';
      else if (SS.inventory.isWholeUnit(p.unit) && !Number.isInteger(q)) out.error = 'This item is sold in whole numbers.';
      else if (q > out.stock) out.error = `Insufficient stock: only ${formatQty(out.stock)} available.`;
      else out.error = discountProblem(out.discountType, out.discountValue, out.gross);
      seen.add(l.productId);
      return out;
    });
    const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
    const txnType = draft.discountType === 'pct' ? 'pct' : 'amt';
    const discountAmount = discountOf(txnType, draft.discountValue, subtotal);
    // allocate the transaction discount across lines (last line takes the rounding remainder)
    let left = discountAmount;
    lines.forEach((l, i) => {
      const share = i === lines.length - 1 ? left : Math.min(left, subtotal ? Math.round(discountAmount * l.lineTotal / subtotal) : 0);
      l.txnDiscountShare = share; left -= share; l.lineNet = l.lineTotal - share;
    });
    const taxable = subtotal - discountAmount;
    const taxRate = settings.taxEnabled ? Number(settings.taxRate) || 0 : 0;
    const taxAmount = Math.round(taxable * taxRate / 100);
    const gross = lines.reduce((a, l) => a + l.gross, 0);
    const allDiscounts = lines.reduce((a, l) => a + l.discountAmount, 0) + discountAmount;
    return { lines, subtotal, discountType: txnType, discountValue: Number(draft.discountValue) || 0, discountAmount, discountError: discountProblem(txnType, draft.discountValue, subtotal), taxRate, taxAmount, total: taxable + taxAmount,
      discountPct: gross ? Math.round(allDiscounts * 1000 / gross) / 10 : 0, valid: lines.length > 0 && lines.every((l) => !l.error) };
  }

  /** Product names whose discounted price is below their cost. Names only; no cost values leave this function. */
  function belowCost(priced) {
    const products = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p]));
    return priced.lines.filter((l) => { const p = products[l.productId]; const c = p ? (p.avgCost != null ? p.avgCost : (p.purchasePrice || 0)) : 0; return p && l.qty > 0 && l.lineNet < Math.round(c * l.qty); }).map((l) => l.productName);
  }

  /* ---------- Atomic multi-key writes with rollback ---------- */
  function snapshot() { return SS.storage.snapshot(SALE_KEYS); }
  function rollback(s) { SS.storage.restore(s); }
  const costOf = (p) => (p.avgCost != null ? p.avgCost : (p.purchasePrice || 0));

  /* ---------- Completion ---------- */
  function complete(draft, opts) {
    opts = opts || {};
    if (opts.token) { const dup = SS.storage.read('sales').find((s) => s.clientToken === opts.token); if (dup) return { sale: dup, duplicate: true }; }   // duplicate-submission protection
    const settings = SS.settings.get(); const pr = price(draft);
    if (!pr.lines.length) throw new Error('The cart is empty.');
    const bad = pr.lines.filter((l) => l.error); if (bad.length) throw new Error(bad.map((l) => `${l.productName}: ${l.error}`).join(' '));
    if (pr.discountError) throw new Error(pr.discountError);
    if (pr.total <= 0) throw new Error('The total must be more than 0 MMK.');
    const method = opts.method || settings.defaultPayment || 'cash';
    if (!METHODS.some((m) => m[0] === method)) throw new Error('Choose a valid payment method.');
    const received = toInt(opts.received);
    if (received < 0) throw new Error('Amount received cannot be negative.');
    if (method !== 'cash' && received > pr.total) throw new Error('For non-cash payments the amount received cannot be more than the total.');
    const paid = Math.min(received, pr.total); const change = method === 'cash' ? Math.max(0, received - pr.total) : 0; const balance = pr.total - paid;
    const customer = opts.customerId ? SS.storage.collection.byId('customers', opts.customerId) : null;
    if (opts.customerId && !customer) throw new Error('The selected customer no longer exists.');
    if (balance > 0) {
      if (!settings.allowPartialPayments) throw new Error('Partial payment is turned off. Collect the full amount, or allow partial payments in Settings.');
      if (!customer) throw new Error('Choose a customer to record an unpaid balance. Walk-in sales must be paid in full.');
    }
    const products = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p]));
    const snap = snapshot();
    try {
      const number = 'INV-' + String(SS.storage.counter('sale')).padStart(6, '0');
      const lines = pr.lines.map((l) => ({ productId: l.productId, productName: l.productName, sku: l.sku, unit: l.unit, qty: l.qty, unitPrice: l.unitPrice, gross: l.gross, discountType: l.discountType, discountValue: l.discountValue,
        discountAmount: l.discountAmount, lineTotal: l.lineTotal, txnDiscountShare: l.txnDiscountShare, lineNet: l.lineNet, costSnapshot: costOf(products[l.productId]), refundedQty: 0 }));
      let sale = SS.storage.collection.insert('sales', { number, status: 'pending', clientToken: opts.token || '', customerId: customer ? customer.id : '', customerName: customer ? customer.name : 'Walk-in',
        lines, subtotal: pr.subtotal, discountType: pr.discountType, discountValue: pr.discountValue, discountAmount: pr.discountAmount, taxRate: pr.taxRate, taxAmount: pr.taxAmount, total: pr.total,
        paid, balance, method, received, change, discountPct: pr.discountPct, payments: [], refunds: [], refundedTotal: 0, note: String(opts.note || '').trim() }, 'sal');
      lines.forEach((l) => SS.inventory.adjust({ productId: l.productId, type: 'sale', quantity: l.qty, reason: 'Sale ' + number, relatedId: sale.id, noAudit: true }));
      if (paid > 0) SS.storage.collection.insert('payments', { kind: 'sale_payment', direction: 'in', saleId: sale.id, customerId: customer ? customer.id : '', method, amount: paid }, 'pay');
      if (customer) SS.storage.collection.update('customers', customer.id, { outstandingBalance: toInt(customer.outstandingBalance) + balance, totalPurchases: toInt(customer.totalPurchases) + pr.total, lastSaleApplied: sale.id });
      sale = SS.storage.collection.update('sales', sale.id, { status: 'completed', payments: paid > 0 ? [{ method, amount: paid, received, change }] : [] });
      SS.audit.record('sale.completed', { type: 'sale', id: sale.id, label: number }, null, { total: sale.total, items: lines.length, method, balance });
      return { sale, duplicate: false };
    } catch (e) { rollback(snap); throw e; }
  }

  /** Rolls back sales left in 'pending' (browser closed or crashed mid-sale). Safe to run repeatedly. */
  function recover() {
    let n = 0;
    SS.storage.read('sales').filter((s) => s.status === 'pending').forEach((s) => {
      try {
        const net = {};
        SS.storage.read('stockMovements').filter((m) => m.relatedId === s.id).forEach((m) => { net[m.productId] = qty((net[m.productId] || 0) + m.quantity); });
        Object.entries(net).forEach(([pid, q]) => { if (q < 0) SS.inventory.adjust({ productId: pid, type: 'customer_return', quantity: -q, reason: 'Rollback of interrupted sale ' + s.number, relatedId: s.id, noAudit: true }); });
        const pays = SS.storage.read('payments'); if (pays.some((p) => p.saleId === s.id)) SS.storage.write('payments', pays.filter((p) => p.saleId !== s.id));
        const c = s.customerId && SS.storage.collection.byId('customers', s.customerId);
        if (c && c.lastSaleApplied === s.id) SS.storage.collection.update('customers', c.id, { outstandingBalance: toInt(c.outstandingBalance) - s.balance, totalPurchases: toInt(c.totalPurchases) - s.total, lastSaleApplied: '' });
        SS.storage.collection.update('sales', s.id, { status: 'failed', failReason: 'Interrupted before completion; stock and balances were rolled back.' });
        SS.audit.record('sale.rolled_back', { type: 'sale', id: s.id, label: s.number }); n++;
      } catch (e) { console.error('[SmartStock] could not recover sale ' + s.number, e); }
    });
    return n;
  }

  /* ---------- Refunds and cancellations ---------- */
  /** items: [{index, qty}]. Returns the amounts without writing anything. */
  function refundQuote(sale, items) {
    const lines = sale.lines.map((l) => Object.assign({}, l)); let net = 0; const picked = [];
    items.forEach((i) => {
      const q = qty(i.qty); if (!(q > 0)) return;
      const l = lines[i.index]; if (!l) throw new Error('Unknown sale line.');
      const left = qty(l.qty - (l.refundedQty || 0));
      if (q > left) throw new Error(`Cannot refund ${formatQty(q)} of ${l.productName}; only ${formatQty(left)} left to refund.`);
      if (SS.inventory.isWholeUnit((SS.storage.collection.byId('products', l.productId) || {}).unit) && !Number.isInteger(q)) throw new Error(l.productName + ' is refunded in whole numbers.');
      l.refundedQty = qty((l.refundedQty || 0) + q); net += Math.round(l.lineNet * q / l.qty); picked.push({ index: i.index, productId: l.productId, productName: l.productName, qty: q });
    });
    if (!picked.length) throw new Error('Select at least one item to refund.');
    const saleNet = sale.total - sale.taxAmount; const prevNet = (sale.refunds || []).reduce((a, r) => a + r.net, 0); const prevTax = (sale.refunds || []).reduce((a, r) => a + r.tax, 0);
    const full = lines.every((l) => qty(l.qty - (l.refundedQty || 0)) === 0);
    if (full) net = saleNet - prevNet;
    net = Math.max(0, Math.min(net, saleNet - prevNet));
    const tax = full ? sale.taxAmount - prevTax : Math.min(Math.round(net * sale.taxRate / 100), sale.taxAmount - prevTax);
    const amount = net + tax; const balanceReduction = Math.min(amount, sale.balance); const cashOut = amount - balanceReduction;
    return { lines, picked, full, net, tax, amount, balanceReduction, cashOut };
  }

  function applyRefund(saleId, items, opts, mode) {
    opts = opts || {};
    const sale = SS.storage.collection.byId('sales', saleId);
    if (!sale || sale.status !== 'completed') throw new Error('Only completed sales can be refunded or cancelled.');
    const reason = String(opts.reason || '').trim(); if (!reason) throw new Error('A reason is required.');
    if (mode === 'cancel') {
      if ((sale.refunds || []).length) throw new Error('This sale already has refunds. Refund the remaining items instead of cancelling.');
      items = sale.lines.map((l, index) => ({ index, qty: l.qty }));
    }
    const method = opts.method || 'cash'; if (!METHODS.some((m) => m[0] === method)) throw new Error('Choose a valid refund method.');
    const q = refundQuote(sale, items); const snap = snapshot();
    try {
      q.picked.forEach((p) => SS.inventory.adjust({ productId: p.productId, type: 'customer_return', quantity: p.qty, reason: (mode === 'cancel' ? 'Cancelled ' : 'Refund ') + sale.number, relatedId: sale.id, noAudit: true }));
      if (q.cashOut > 0) SS.storage.collection.insert('payments', { kind: 'sale_refund', direction: 'out', saleId: sale.id, customerId: sale.customerId || '', method, amount: q.cashOut }, 'pay');
      const c = sale.customerId && SS.storage.collection.byId('customers', sale.customerId);
      if (c) SS.storage.collection.update('customers', c.id, { outstandingBalance: toInt(c.outstandingBalance) - q.balanceReduction, totalPurchases: Math.max(0, toInt(c.totalPurchases) - q.amount) });
      const refund = { id: SS.storage.uid('ref'), at: Date.now(), type: mode, items: q.picked, net: q.net, tax: q.tax, amount: q.amount, balanceReduction: q.balanceReduction, cashOut: q.cashOut, method, reason };
      const patch = { lines: q.lines, refunds: (sale.refunds || []).concat([refund]), refundedTotal: (sale.refundedTotal || 0) + q.amount, balance: sale.balance - q.balanceReduction };
      if (mode === 'cancel') Object.assign(patch, { status: 'cancelled', cancelReason: reason, cancelledAt: Date.now() });
      const next = SS.storage.collection.update('sales', sale.id, patch);
      SS.audit.record(mode === 'cancel' ? 'sale.cancelled' : 'sale.refunded', { type: 'sale', id: sale.id, label: sale.number }, { refundedTotal: sale.refundedTotal || 0 }, { amount: q.amount, cashOut: q.cashOut, reason });
      return { sale: next, refund };
    } catch (e) { rollback(snap); throw e; }
  }
  const refund = (id, items, opts) => applyRefund(id, items, opts, 'refund');
  const cancel = (id, opts) => applyRefund(id, [], opts, 'cancel');

  /* ---------- Figures used by dashboard and reports ---------- */
  function net(s) {
    if (s.status !== 'completed') return { revenue: 0, cogs: 0, cashIn: 0, refunded: 0 };
    const refunds = s.refunds || [];
    const revenue = (s.total - s.taxAmount) - refunds.reduce((a, r) => a + r.net, 0);
    const cogs = Math.round(s.lines.reduce((a, l) => a + (l.costSnapshot || 0) * (l.qty - (l.refundedQty || 0)), 0));
    const cashIn = (s.payments || []).filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0) - refunds.filter((r) => r.method === 'cash').reduce((a, r) => a + r.cashOut, 0);
    return { revenue, cogs, cashIn, refunded: s.refundedTotal || 0 };
  }
  /** Sale as the UI may see it: cost snapshots removed from lines. */
  function view(s) { return Object.assign({}, s, { lines: s.lines.map((l) => { const c = Object.assign({}, l); delete c.costSnapshot; return c; }) }); }
  const statusOf = (s) => {
    if (s.status === 'cancelled') return ['Cancelled', 'danger']; if (s.status === 'failed') return ['Rolled back', 'warning']; if (s.status === 'pending') return ['Pending', 'info'];
    if ((s.refundedTotal || 0) > 0) return s.lines.every((l) => qty(l.qty - (l.refundedQty || 0)) === 0) ? ['Refunded', 'danger'] : ['Partly refunded', 'info'];
    return s.balance > 0 ? ['Unpaid balance', 'warning'] : ['Completed', 'success'];
  };

  /* ---------- Receipts ---------- */
  const R = {
    my: { receipt: 'ဘောက်ချာ', no: 'ဘောက်ချာအမှတ်', date: 'ရက်စွဲ', customer: 'ဖောက်သည်', item: 'ကုန်ပစ္စည်း', qty: 'အရေအတွက်', price: 'ဈေးနှုန်း', amount: 'ငွေပမာဏ', subtotal: 'စုစုပေါင်း', discount: 'လျှော့ဈေး', tax: 'အခွန်', total: 'ကျသင့်ငွေ', method: 'ပေးချေမှု', received: 'လက်ခံရရှိငွေ', change: 'ပြန်အမ်းငွေ', balance: 'ကျန်ငွေ', copy: 'မိတ္တူ (ပြန်ထုတ်)', refunded: 'ပြန်အမ်းပြီး', walkin: 'ဆိုင်ဝင်ဝယ်သူ' },
    en: { receipt: 'Receipt', no: 'Receipt no.', date: 'Date', customer: 'Customer', item: 'Item', qty: 'Qty', price: 'Price', amount: 'Amount', subtotal: 'Subtotal', discount: 'Discount', tax: 'Tax', total: 'Total', method: 'Payment', received: 'Received', change: 'Change', balance: 'Balance due', copy: 'COPY (reprint)', refunded: 'Refunded', walkin: 'Walk-in' }
  };
  function receiptNode(sale, size, isCopy) {
    const s = SS.settings.get(); const t = R[SS.i18n.getLang()] || R.my; const kv = (k, v, cls) => el('div', { class: 'r-row ' + (cls || '') }, el('span', null, k), el('span', null, v));
    const rows = sale.lines.map((l) => {
      const r = [el('tr', null, el('td', { class: 'r-name' }, l.productName), el('td', { class: 'num' }, formatQty(l.qty)), el('td', { class: 'num' }, formatNumber(l.unitPrice)), el('td', { class: 'num' }, formatNumber(l.gross)))];
      if (l.discountAmount > 0) r.push(el('tr', { class: 'r-sub' }, el('td', { colspan: '3' }, t.discount + (l.discountType === 'pct' ? ` (${l.discountValue}%)` : '')), el('td', { class: 'num' }, '-' + formatNumber(l.discountAmount))));
      return r;
    });
    return el('div', { class: 'receipt ' + (size === 'a4' ? 'a4' : size === '58' ? 'w58' : 'w80') },
      s.shopLogo ? el('img', { class: 'r-logo', src: s.shopLogo, alt: '' }) : null,
      el('div', { class: 'r-shop' }, s.shopName), s.shopAddress ? el('div', { class: 'r-center' }, s.shopAddress) : null, s.shopPhone ? el('div', { class: 'r-center' }, s.shopPhone) : null,
      el('div', { class: 'r-title' }, t.receipt), isCopy ? el('div', { class: 'r-center r-copy' }, t.copy) : null,
      kv(t.no, sale.number), kv(t.date, formatDate(sale.createdAt, true)), kv(t.customer, sale.customerId ? sale.customerName : t.walkin),
      el('table', { class: 'r-table' }, el('thead', null, el('tr', null, el('th', null, t.item), el('th', { class: 'num' }, t.qty), el('th', { class: 'num' }, t.price), el('th', { class: 'num' }, t.amount))), el('tbody', null, rows)),
      el('hr'), kv(t.subtotal, formatNumber(sale.subtotal)),
      sale.discountAmount > 0 ? kv(t.discount + (sale.discountType === 'pct' ? ` (${sale.discountValue}%)` : ''), '-' + formatNumber(sale.discountAmount)) : null,
      sale.taxAmount > 0 ? kv(t.tax + ` (${sale.taxRate}%)`, formatNumber(sale.taxAmount)) : null,
      kv(t.total, formatMMK(sale.total), 'r-total'), kv(t.method, methodReceipt(sale.method)),
      sale.paid > 0 ? kv(t.received, formatMMK(sale.received)) : null, sale.change > 0 ? kv(t.change, formatMMK(sale.change)) : null,
      sale.balance > 0 ? kv(t.balance, formatMMK(sale.balance), 'r-total') : null,
      (sale.refundedTotal || 0) > 0 ? kv(t.refunded, '-' + formatMMK(sale.refundedTotal)) : null,
      s.receiptFooter ? el('div', { class: 'r-center r-foot' }, s.receiptFooter) : null);
  }
  function formatNumber(n) { return SS.utils.formatNumber(n); }

  function printReceipt(sale, isCopy) {
    SS.utils.printDocument({ title: 'Receipt ' + sale.number, size: SS.settings.get().receiptSize || '80', sizes: [['58', '58 mm thermal'], ['80', '80 mm thermal'], ['a4', 'A4 invoice']],
      render: (size) => receiptNode(sale, size, isCopy), onSize: (size) => SS.settings.patch({ receiptSize: size }) });
  }

  /* ---------- History page ---------- */
  function openRefundDialog(sale, onDone) {
    const inputs = sale.lines.map((l, i) => { const left = qty(l.qty - (l.refundedQty || 0)); return { l, i, left, inp: el('input', { class: 'input', type: 'number', min: '0', max: String(left), step: SS.inventory.isWholeUnit((SS.storage.collection.byId('products', l.productId) || {}).unit) ? '1' : 'any', value: '0', style: 'width:110px;text-align:right', 'aria-label': 'Refund quantity for ' + l.productName, disabled: left <= 0 }) }; });
    const reason = el('input', { class: 'input', id: 'rfReason', placeholder: 'e.g. damaged item, wrong product' }); const method = ui.select('rfMethod', METHODS.map((m) => [m[0], m[1]]), 'cash'); const preview = el('p', { class: 'muted small' });
    const items = () => inputs.map((x) => ({ index: x.i, qty: x.inp.value }));
    const upd = () => { try { const q = refundQuote(SS.storage.collection.byId('sales', sale.id), items()); preview.textContent = `Refund ${formatMMK(q.amount)}` + (q.balanceReduction ? ` — ${formatMMK(q.balanceReduction)} reduces the customer’s unpaid balance, ${formatMMK(q.cashOut)} is paid back.` : ' paid back to the customer.'); } catch (e) { preview.textContent = e.message; } };
    inputs.forEach((x) => x.inp.addEventListener('input', upd)); upd();
    SS.utils.openModal({ title: 'Refund ' + sale.number, body: el('div', null, el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, el('th', null, 'Item'), el('th', { class: 'num' }, 'Sold'), el('th', { class: 'num' }, 'Refundable'), el('th', { class: 'num' }, 'Refund qty'))),
      el('tbody', null, inputs.map((x) => el('tr', null, el('td', null, x.l.productName), el('td', { class: 'num' }, formatQty(x.l.qty)), el('td', { class: 'num' }, formatQty(x.left)), el('td', { class: 'num' }, x.inp)))))), preview, ui.field('Reason', 'rfReason', reason), ui.field('Pay refund by', 'rfMethod', method)),
      actions: [{ label: SS.i18n.t('cancel') }, { label: 'Record refund', kind: 'danger', onClick: () => { try { const r = refund(sale.id, items(), { reason: reason.value, method: method.value }); SS.utils.toast('Refund recorded: ' + formatMMK(r.refund.amount), 'success'); onDone(); } catch (e) { SS.utils.toast(e.message, 'error'); return false; } } }] });
  }

  async function openCancelDialog(sale, onDone) {
    const reason = el('input', { class: 'input', id: 'cxReason' }); const method = ui.select('cxMethod', METHODS.map((m) => [m[0], m[1]]), 'cash');
    SS.utils.openModal({ title: 'Cancel ' + sale.number + '?', body: el('div', null, el('p', null, 'All items go back into stock and the full amount is returned. The sale stays in the history marked as cancelled.'), ui.field('Reason', 'cxReason', reason), ui.field('Return money by', 'cxMethod', method)),
      actions: [{ label: 'Keep sale' }, { label: 'Cancel sale', kind: 'danger', onClick: () => { try { cancel(sale.id, { reason: reason.value, method: method.value }); SS.utils.toast('Sale cancelled.', 'success'); onDone(); } catch (e) { SS.utils.toast(e.message, 'error'); return false; } } }] });
  }

  function openDetails(id, onChange) {
    const sale = SS.storage.collection.byId('sales', id); if (!sale) return; const v = view(sale); const [label, kind] = statusOf(sale);
    const row = (a, b) => el('li', null, el('span', { class: 'muted' }, a), el('span', null, b));
    const canAct = sale.status === 'completed' && sale.lines.some((l) => qty(l.qty - (l.refundedQty || 0)) > 0);
    SS.utils.openModal({ title: sale.number, body: el('div', { class: 'wide' }, el('div', { style: 'margin-bottom:8px' }, ui.badge(label, kind)),
      el('ul', { class: 'list' }, row('Date', formatDate(sale.createdAt, true)), row('Customer', sale.customerId ? sale.customerName : 'Walk-in'), row('Payment', methodLabel(sale.method)), sale.note ? row('Note', sale.note) : null),
      el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, ['Item', 'Qty', 'Price', 'Discount', 'Total'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))),
        el('tbody', null, v.lines.map((l) => el('tr', null, el('td', null, l.productName, l.refundedQty ? el('span', { class: 'sub' }, formatQty(l.refundedQty) + ' refunded') : null), el('td', { class: 'num' }, formatQty(l.qty)), el('td', { class: 'num' }, formatMMK(l.unitPrice)), el('td', { class: 'num' }, l.discountAmount ? '-' + formatMMK(l.discountAmount) : '—'), el('td', { class: 'num' }, formatMMK(l.lineTotal))))))),
      el('ul', { class: 'list' }, row('Subtotal', formatMMK(sale.subtotal)), sale.discountAmount ? row('Discount', '-' + formatMMK(sale.discountAmount)) : null, sale.taxAmount ? row('Tax (' + sale.taxRate + '%)', formatMMK(sale.taxAmount)) : null, row('Total', formatMMK(sale.total)),
        row('Paid', formatMMK(sale.paid)), sale.change ? row('Change given', formatMMK(sale.change)) : null, sale.balance ? row('Unpaid balance', formatMMK(sale.balance)) : null, sale.refundedTotal ? row('Refunded', formatMMK(sale.refundedTotal)) : null),
      (sale.refunds || []).length ? el('div', null, el('h2', { class: 'small', style: 'margin:10px 0 4px' }, 'Refund history'), el('ul', { class: 'list' }, sale.refunds.map((r) => el('li', null, el('span', null, formatDate(r.at, true) + ' · ' + r.reason), el('span', null, formatMMK(r.amount)))))) : null,
      sale.cancelReason ? el('p', { class: 'muted small' }, 'Cancelled: ' + sale.cancelReason) : null, sale.failReason ? el('p', { class: 'muted small' }, sale.failReason) : null),
      actions: [{ label: 'Close' }].concat(sale.status === 'completed' || sale.status === 'cancelled' ? [{ label: 'Print receipt', onClick: () => { setTimeout(() => printReceipt(sale, true), 0); } }] : [])
        .concat(canAct ? [{ label: 'Refund…', onClick: () => { setTimeout(() => openRefundDialog(sale, onChange), 0); } }] : [])
        .concat(canAct && !(sale.refunds || []).length ? [{ label: 'Cancel sale…', kind: 'danger', onClick: () => { setTimeout(() => openCancelDialog(sale, onChange), 0); } }] : []) });
  }

  function historyPage(root) {
    const st = { search: '', from: '', to: '', method: '', customer: '', status: '' };
    const holder = el('div', { class: 'card' });
    function rows() {
      const q = st.search.toLowerCase();
      return SS.storage.read('sales').filter((s) => s.status !== 'pending').filter((s) => {
        const day = dayKey(s.createdAt);
        if (st.from && day < st.from) return false; if (st.to && day > st.to) return false;
        if (st.method && s.method !== st.method) return false;
        if (st.customer && (st.customer === 'walkin' ? s.customerId : s.customerId !== st.customer)) return false;
        if (st.status && statusOf(s)[0] !== st.status) return false;
        return !q || (s.number + ' ' + s.customerName + ' ' + s.lines.map((l) => l.productName).join(' ')).toLowerCase().includes(q);
      }).reverse().map(view);
    }
    function draw() {
      const t = ui.dataTable({ rows: rows(), pageSize: 15, empty: { title: 'No sales found', hint: 'Completed sales appear here. Change the filters or make a sale in POS.' }, columns: [
        { key: 'number', label: 'No.', render: (s) => el('button', { class: 'link-btn', type: 'button', onclick: () => openDetails(s.id, () => { draw(); }) }, s.number) },
        { key: 'createdAt', label: 'Time', render: (s) => formatDate(s.createdAt, true) },
        { key: 'customerName', label: 'Customer', render: (s) => (s.customerId ? s.customerName : 'Walk-in') },
        { key: 'items', label: 'Items', num: true, sortValue: (s) => s.lines.length, render: (s) => String(s.lines.length) },
        { key: 'method', label: 'Payment', render: (s) => methodLabel(s.method) },
        { key: 'total', label: 'Total', num: true, render: (s) => formatMMK(s.total) },
        { key: 'balance', label: 'Unpaid', num: true, render: (s) => (s.balance > 0 ? formatMMK(s.balance) : '—') },
        { key: 'status', label: 'Status', sortValue: (s) => statusOf(s)[0], render: (s) => ui.badge(statusOf(s)[0], statusOf(s)[1]) },
        { key: 'act', label: '', sortable: false, render: (s) => el('div', { class: 'row-actions' }, s.status === 'completed' || s.status === 'cancelled' ? el('button', { class: 'btn sm', type: 'button', onclick: () => printReceipt(SS.storage.collection.byId('sales', s.id), true) }, 'Reprint') : null) }] });
      clear(holder); holder.append(t.node);
    }
    const f = (id, node, key) => { node.addEventListener('change', () => { st[key] = node.value; draw(); }); return node; };
    const search = el('input', { class: 'input grow', type: 'search', placeholder: 'Search number, customer or product…', 'aria-label': 'Search sales' });
    search.addEventListener('input', SS.utils.debounce(() => { st.search = search.value; draw(); }, 150));
    root.append(el('div', { class: 'toolbar' }, search,
      f('hFrom', el('input', { class: 'input', id: 'hFrom', type: 'date', 'aria-label': 'From date' }), 'from'), f('hTo', el('input', { class: 'input', id: 'hTo', type: 'date', 'aria-label': 'To date' }), 'to'),
      f('hMethod', ui.select('hMethod', [['', 'All payment methods']].concat(METHODS.map((m) => [m[0], m[1]])), ''), 'method'),
      f('hCust', ui.select('hCust', [['', 'All customers'], ['walkin', 'Walk-in']].concat(SS.storage.read('customers').map((c) => [c.id, c.name])), ''), 'customer'),
      f('hStatus', ui.select('hStatus', [['', 'All statuses'], ['Completed', 'Completed'], ['Unpaid balance', 'Unpaid balance'], ['Partly refunded', 'Partly refunded'], ['Refunded', 'Refunded'], ['Cancelled', 'Cancelled'], ['Rolled back', 'Rolled back']], ''), 'status')), holder);
    draw();
  }

  SS.sales = { METHODS, methodLabel, price, belowCost, complete, recover, refund, cancel, refundQuote, net, view, statusOf, printReceipt, receiptNode, openDetails, historyPage };
})();

;
/* SmartStock — pos.js
 * Point-of-sale screen. All money maths and stock changes go through SS.sales (never done here).
 * Shortcuts: F2 = focus search, F9 = checkout. A USB scanner works from anywhere on the page.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatQty, toInt, qty } = SS.utils;
  const ui = SS.ui;

  let cart = newCart();
  function newCart() { return { lines: [], discountType: 'amt', discountValue: 0, customerId: '', method: '', received: '', receivedEdited: false, note: '', token: SS.storage ? SS.storage.uid('tok') : String(Date.now()), busy: false }; }

  /* ---------- Cart operations ---------- */
  function addProduct(id, q) {
    const p = SS.storage.collection.byId('products', id);
    if (!p || p.status === 'archived') return SS.utils.toast('That product is not available.', 'warning');
    const add = q || (SS.inventory.isWholeUnit(p.unit) ? 1 : 1);
    const line = cart.lines.find((l) => l.productId === id);
    const next = qty((line ? line.qty : 0) + add);
    if (next > (Number(p.stock) || 0)) return SS.utils.toast(`${p.name}: only ${formatQty(p.stock)} in stock.`, 'warning');
    if (line) line.qty = next; else cart.lines.push({ productId: id, qty: add, discountType: 'amt', discountValue: 0 });
    cart.receivedEdited = false; redraw();
  }
  function addByCode(code) {
    const hit = SS.barcode.find(code);
    if (!hit) { SS.utils.toast('No product with code ' + code + '.', 'warning'); return false; }
    addProduct(hit.id); return true;
  }

  let redraw = () => {}; let drawGrid = () => {};

  /* ---------- Dialogs ---------- */
  function openLineDiscount(line) {
    const type = ui.select('ldType', [['amt', 'MMK'], ['pct', '%']], line.discountType); const val = el('input', { class: 'input', id: 'ldVal', type: 'number', min: '0', step: 'any', value: line.discountValue || '' });
    SS.utils.openModal({ title: 'Item discount', body: el('div', { class: 'form-grid' }, ui.field('Type', 'ldType', type), ui.field('Value', 'ldVal', val)),
      actions: [{ label: SS.i18n.t('cancel') }, { label: 'Clear', onClick: () => { line.discountValue = 0; redraw(); } }, { label: 'Apply', kind: 'primary', onClick: () => { line.discountType = type.value; line.discountValue = Number(val.value) || 0; redraw(); } }] });
  }
  function openQuickCustomer() {
    const name = el('input', { class: 'input', id: 'qcName' }); const phone = el('input', { class: 'input', id: 'qcPhone', type: 'tel' });
    SS.utils.openModal({ title: 'New customer', body: el('div', null, ui.field('Name', 'qcName', name), ui.field('Phone', 'qcPhone', phone)), actions: [{ label: SS.i18n.t('cancel') }, { label: SS.i18n.t('save'), kind: 'primary', onClick: () => {
      if (!name.value.trim()) { ui.setError(name, 'Name is required.'); return false; }
      try { const c = SS.storage.collection.insert('customers', { name: name.value.trim(), phone: phone.value.trim(), address: '', notes: '', totalPurchases: 0, outstandingBalance: 0, status: 'active' }, 'cus'); SS.audit.record('customer.created', { type: 'customer', id: c.id, label: c.name }); cart.customerId = c.id; redraw(); }
      catch (e) { SS.utils.toast(e.message, 'error'); return false; }
    } }] });
  }

  function checkout() {
    if (cart.busy) return; const priced = SS.sales.price(cart);
    if (!cart.lines.length) return SS.utils.toast('Add at least one item.', 'warning');
    if (!priced.valid || priced.discountError) return SS.utils.toast('Fix the highlighted items before checkout.', 'warning');
    const go = () => {
      cart.busy = true; redraw();
      try {
        const method = cart.method || SS.settings.get().defaultPayment || 'cash';
        const received = cart.receivedEdited ? cart.received : priced.total;
        const { sale, duplicate } = SS.sales.complete(cart, { customerId: cart.customerId, method, received, token: cart.token, note: cart.note });
        cart = newCart(); redraw(); drawGrid();
        SS.utils.openModal({ title: duplicate ? 'Sale already recorded' : 'Sale complete', body: el('div', null, el('p', { style: 'font-size:22px;font-weight:650;margin:0' }, formatMMK(sale.total)), el('p', { class: 'muted' }, sale.number),
          sale.change > 0 ? el('p', null, 'Change to give: ', el('strong', null, formatMMK(sale.change))) : null, sale.balance > 0 ? el('p', null, 'Unpaid balance recorded: ', el('strong', null, formatMMK(sale.balance))) : null),
          actions: [{ label: 'New sale' }, { label: 'Print receipt', kind: 'primary', onClick: () => { setTimeout(() => SS.sales.printReceipt(sale, false), 0); } }] });
      } catch (e) { cart.busy = false; redraw(); SS.utils.toast(e.message, 'error'); }
    };
    const low = SS.sales.belowCost(priced);
    if (low.length) SS.utils.confirmDialog('Selling below cost', `These items would be sold below their purchase cost: ${low.join(', ')}. Continue?`, 'Sell anyway', true).then((ok) => { if (ok) go(); });
    else go();
  }

  /* ---------- Page ---------- */
  function page(root) {
    const st = { search: '', cat: '' };
    const grid = el('div', { class: 'pos-grid' }); const cartHolder = el('div', { class: 'card pos-cart', id: 'posCart' });
    const search = el('input', { class: 'input grow', type: 'search', id: 'posSearch', placeholder: 'Search or scan barcode…  (F2)', 'aria-label': 'Search products or scan barcode', autocomplete: 'off', 'data-scan': '1' });
    const catSel = ui.select('posCat', [['', 'All categories']].concat(SS.categories.all().filter((c) => c.status !== 'archived').map((c) => [c.id, c.name])), '');
    const fab = el('button', { class: 'btn primary pos-fab', type: 'button', onclick: () => cartHolder.scrollIntoView({ behavior: 'smooth' }) });

    drawGrid = function () {
      clear(grid); const q = st.search.trim().toLowerCase();
      const items = SS.storage.read('products').filter((p) => p.status !== 'archived' && (!st.cat || p.categoryId === st.cat) && (!q || (p.name + ' ' + p.sku + ' ' + (p.barcode || '')).toLowerCase().includes(q)));
      if (!SS.storage.read('products').length) return grid.append(el('div', { class: 'empty' }, el('strong', null, 'No products yet'), 'Add products first, then sell them here.', el('div', { style: 'margin-top:10px' }, el('a', { class: 'btn primary', href: '#/products' }, 'Go to Products'))));
      if (!items.length) return grid.append(el('div', { class: 'empty' }, el('strong', null, 'No matching products'), 'Try another name, SKU or barcode.'));
      items.slice(0, 60).forEach((p) => { const status = SS.inventory.stockStatus(p);
        grid.append(el('button', { class: 'pos-tile', type: 'button', disabled: status === 'out', onclick: () => addProduct(p.id) }, el('span', { class: 'pt-name' }, p.name), el('span', { class: 'pt-price' }, formatMMK(p.sellingPrice || 0)),
          el('span', { class: 'pt-stock ' + status }, status === 'out' ? 'Out of stock' : formatQty(p.stock) + ' ' + SS.inventory.unitOf(p)))); });
      if (items.length > 60) grid.append(el('div', { class: 'muted small', style: 'grid-column:1/-1' }, 'Showing 60 of ' + items.length + '. Search to narrow down.'));
    };

    redraw = function () {
      const pr = SS.sales.price(cart); const settings = SS.settings.get(); clear(cartHolder);
      const method = cart.method || settings.defaultPayment || 'cash';
      const receivedVal = cart.receivedEdited ? toInt(cart.received) : pr.total;
      const lineEls = cart.lines.map((l, i) => { const pl = pr.lines[i];
        const q = el('input', { class: 'input pos-qty', type: 'number', min: '0', step: SS.inventory.isWholeUnit(SS.storage.collection.byId('products', l.productId) && SS.storage.collection.byId('products', l.productId).unit) ? '1' : 'any', value: l.qty, 'aria-label': 'Quantity for ' + pl.productName });
        q.addEventListener('change', () => { l.qty = qty(q.value); if (!(l.qty > 0)) cart.lines.splice(i, 1); cart.receivedEdited = false; redraw(); });
        return el('li', { class: 'pos-line' + (pl.error ? ' bad' : '') },
          el('div', { class: 'pl-top' }, el('span', { class: 'pl-name' }, pl.productName), el('strong', { class: 'num' }, formatMMK(pl.lineTotal))),
          el('div', { class: 'pl-mid' }, el('button', { class: 'btn sm', type: 'button', 'aria-label': 'Decrease', onclick: () => { l.qty = qty(l.qty - 1); if (!(l.qty > 0)) cart.lines.splice(i, 1); cart.receivedEdited = false; redraw(); } }, '−'), q,
            el('button', { class: 'btn sm', type: 'button', 'aria-label': 'Increase', onclick: () => { l.qty = qty(l.qty + 1); cart.receivedEdited = false; redraw(); } }, '+'),
            el('span', { class: 'muted small' }, '× ' + formatMMK(pl.unitPrice)),
            el('button', { class: 'btn sm', type: 'button', onclick: () => openLineDiscount(l) }, pl.discountAmount ? 'Disc −' + formatMMK(pl.discountAmount) : 'Discount'),
            el('button', { class: 'btn sm', type: 'button', 'aria-label': 'Remove ' + pl.productName, onclick: () => { cart.lines.splice(i, 1); cart.receivedEdited = false; redraw(); } }, '✕')),
          pl.error ? el('div', { class: 'err' }, pl.error) : null); });

      const customers = SS.storage.read('customers').filter((c) => c.status !== 'archived');
      const cust = ui.select('posCust', [['', 'Walk-in customer']].concat(customers.map((c) => [c.id, c.name + (c.outstandingBalance > 0 ? ' (owes ' + SS.utils.formatNumber(c.outstandingBalance) + ')' : '')])), cart.customerId);
      cust.addEventListener('change', () => { cart.customerId = cust.value; });
      const dType = ui.select('posDType', [['amt', 'MMK'], ['pct', '%']], cart.discountType); const dVal = el('input', { class: 'input', id: 'posDVal', type: 'number', min: '0', step: 'any', value: cart.discountValue || '', 'aria-label': 'Sale discount', style: 'width:110px' });
      dType.addEventListener('change', () => { cart.discountType = dType.value; redraw(); }); dVal.addEventListener('change', () => { cart.discountValue = Number(dVal.value) || 0; cart.receivedEdited = false; redraw(); });
      const meth = ui.select('posMethod', SS.sales.METHODS.map((m) => [m[0], m[1]]), method); meth.addEventListener('change', () => { cart.method = meth.value; redraw(); });
      const recv = el('input', { class: 'input', id: 'posRecv', type: 'number', min: '0', step: '1', inputmode: 'numeric', value: receivedVal, 'aria-label': 'Amount received' });
      const info = el('div', { class: 'pos-pay-info' });
      const paint = () => { const r = toInt(recv.value); const bal = Math.max(0, pr.total - r); const chg = method === 'cash' ? Math.max(0, r - pr.total) : 0; clear(info);
        info.append(...[chg > 0 ? el('div', { class: 'r-row' }, el('span', null, 'Change'), el('strong', null, formatMMK(chg))) : null, bal > 0 ? el('div', { class: 'r-row warn' }, el('span', null, 'Unpaid balance'), el('strong', null, formatMMK(bal))) : null,
          method !== 'cash' && r > pr.total ? el('div', { class: 'err' }, 'Non-cash payment cannot be more than the total.') : null].filter(Boolean)); };
      recv.addEventListener('input', () => { cart.received = recv.value; cart.receivedEdited = true; paint(); }); paint();

      cartHolder.append(el('div', { class: 'card-head' }, el('h2', null, 'Current sale'), cart.lines.length ? el('button', { class: 'btn sm', type: 'button', onclick: () => { cart = newCart(); redraw(); } }, 'Clear') : null),
        cart.lines.length ? el('ul', { class: 'pos-lines' }, lineEls) : el('div', { class: 'empty' }, el('strong', null, 'Cart is empty'), 'Tap a product or scan a barcode.'),
        el('div', { class: 'pos-sum' },
          el('div', { class: 'r-row' }, el('span', null, 'Subtotal'), el('span', null, formatMMK(pr.subtotal))),
          el('div', { class: 'r-row' }, el('span', null, 'Sale discount'), el('span', { class: 'toolbar', style: 'margin:0' }, dType, dVal)),
          pr.discountError ? el('div', { class: 'err' }, pr.discountError) : null,
          pr.discountAmount ? el('div', { class: 'r-row' }, el('span', { class: 'muted' }, 'Discount applied'), el('span', null, '−' + formatMMK(pr.discountAmount))) : null,
          pr.taxAmount ? el('div', { class: 'r-row' }, el('span', null, 'Tax (' + pr.taxRate + '%)'), el('span', null, formatMMK(pr.taxAmount))) : null,
          el('div', { class: 'r-row pos-total' }, el('span', null, 'Total'), el('span', null, formatMMK(pr.total)))),
        el('div', { class: 'pos-pay' },
          el('div', { class: 'field' }, el('label', { for: 'posCust' }, 'Customer'), el('div', { class: 'toolbar', style: 'margin:0' }, cust, el('button', { class: 'btn sm', type: 'button', onclick: openQuickCustomer }, '+ New'))),
          el('div', { class: 'form-grid' }, el('div', { class: 'field' }, el('label', { for: 'posMethod' }, 'Payment method'), meth), el('div', { class: 'field' }, el('label', { for: 'posRecv' }, 'Amount received'), recv)),
          el('div', { class: 'toolbar', style: 'margin:0 0 8px' }, el('button', { class: 'btn sm', type: 'button', onclick: () => { cart.received = ''; cart.receivedEdited = false; redraw(); } }, 'Exact amount')), info,
          el('button', { class: 'btn primary pos-checkout', type: 'button', disabled: cart.busy || !cart.lines.length, onclick: checkout }, cart.busy ? 'Processing…' : 'Checkout  (F9)')));
      fab.textContent = `Cart (${cart.lines.length}) · ${formatMMK(pr.total)}`; fab.hidden = !cart.lines.length;
    };

    search.addEventListener('input', SS.utils.debounce(() => { st.search = search.value; drawGrid(); }, 120));
    search.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const v = search.value.trim(); if (!v) return;
      if (SS.barcode.find(v)) { addByCode(v); search.value = ''; st.search = ''; drawGrid(); return; }
      const only = SS.storage.read('products').filter((p) => p.status !== 'archived' && (p.name + ' ' + p.sku).toLowerCase().includes(v.toLowerCase()));
      if (only.length === 1) { addProduct(only[0].id); search.value = ''; st.search = ''; drawGrid(); } else SS.utils.toast(only.length ? 'Several products match. Tap the one you want.' : 'No product with that name, SKU or barcode.', 'warning'); });
    catSel.addEventListener('change', () => { st.cat = catSel.value; drawGrid(); });
    SS.barcode.onScan((code) => addByCode(code));

    root.append(el('div', { class: 'pos-layout', id: 'posRoot' }, el('div', null, el('div', { class: 'toolbar' }, search, catSel), grid), cartHolder), fab);
    drawGrid(); redraw(); setTimeout(() => search.focus(), 0);
  }

  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('posRoot') || document.querySelector('.modal')) return;
    if (e.key === 'F2') { e.preventDefault(); const s = document.getElementById('posSearch'); if (s) { s.focus(); s.select(); } }
    if (e.key === 'F9') { e.preventDefault(); checkout(); }
  });

  SS.pos = { page, addProduct, getCart: () => cart };
})();

;
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

;
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

;
/* SmartStock — purchases.js
 * Purchase orders: draft -> confirmed. Confirming adds stock exactly once, updates weighted-average cost
 * (extra costs and discount are spread over the lines as landed cost), records the supplier payment and
 * the unpaid balance owed to the supplier.
 *
 * PRIVACY: this is an authorised section. The list shows totals and balances only; unit costs, the editor,
 * details and invoices need the administrator PIN, and hide again when you leave the page.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatQty, toInt, qty, formatDate, dayKey } = SS.utils; const ui = SS.ui;
  const KEYS = ['purchases', 'products', 'stockMovements', 'payments', 'suppliers', 'meta'];
  const byId = (id) => SS.storage.collection.byId('purchases', id);

  /* ---------- Pure calculation ---------- */
  /** lines: [{qty, unitCost}] -> subtotal, total and the landed (unit) cost of each line. */
  function totals(lines, additional, discount) {
    additional = toInt(additional); discount = toInt(discount);
    const lt = lines.map((l) => Math.round(qty(l.qty) * toInt(l.unitCost))); const subtotal = lt.reduce((a, b) => a + b, 0);
    const adj = additional - discount; let left = adj;
    const out = lines.map((l, i) => {
      const share = i === lines.length - 1 ? left : (subtotal ? Math.round(adj * lt[i] / subtotal) : 0); left -= share;
      const landedTotal = lt[i] + share; return { lineTotal: lt[i], landedTotal, landedUnit: qty(l.qty) > 0 ? Math.round(landedTotal / qty(l.qty)) : 0 };
    });
    return { subtotal, additional, discount, total: subtotal + adj, lines: out };
  }

  /** Small input bound to a purchase line field (batch number / expiry). */
  function batchInput(l, field, label, type, name) { const i = el('input', { class: 'input', type, value: l[field] || '', placeholder: label, 'aria-label': label + ' for ' + name, style: 'width:' + (type === 'date' ? '150' : '110') + 'px;margin-top:4px;margin-right:6px' }); i.addEventListener('change', () => { l[field] = i.value; }); return i; }

  function validate(d) {
    const supplier = SS.storage.collection.byId('suppliers', d.supplierId);
    if (!supplier) throw new Error('Choose a supplier.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) throw new Error('Enter the purchase date.');
    if (!d.lines.length) throw new Error('Add at least one product.');
    const seen = new Set();
    d.lines.forEach((l) => {
      const p = SS.storage.collection.byId('products', l.productId); if (!p) throw new Error('A product on this purchase no longer exists.');
      if (seen.has(l.productId)) throw new Error(p.name + ' appears twice. Combine the quantities into one line.'); seen.add(l.productId);
      if (!(qty(l.qty) > 0)) throw new Error(p.name + ': quantity must be more than 0.');
      if (SS.inventory.isWholeUnit(p.unit) && !Number.isInteger(qty(l.qty))) throw new Error(p.name + ' is bought in whole numbers.');
      if (String(l.unitCost) === '' || toInt(l.unitCost) < 0) throw new Error(p.name + ': enter the unit cost (0 or more).');
      if (p.trackBatches) { try { SS.inventory.checkBatchInfo({ number: l.batchNumber, expiry: l.expiry, mfg: l.mfg }); } catch (e) { throw new Error(p.name + ': ' + e.message); } }
    });
    if (toInt(d.additional) < 0 || toInt(d.discount) < 0) throw new Error('Additional costs and discount cannot be negative.');
    const t = totals(d.lines, d.additional, d.discount); if (t.total < 0) throw new Error('The discount is larger than the purchase amount.');
    return { supplier, t };
  }

  /* ---------- Drafts ---------- */
  function saveDraft(d, id) {
    const { supplier, t } = validate(d);
    const fields = { supplierId: supplier.id, supplierName: supplier.name, date: d.date, method: d.method || 'cash', notes: String(d.notes || '').trim(), additionalCosts: t.additional, discount: t.discount, subtotal: t.subtotal, total: t.total, balance: t.total, paid: 0,
      lines: d.lines.map((l, i) => { const p = SS.storage.collection.byId('products', l.productId); return { productId: p.id, productName: p.name, sku: p.sku, unit: SS.inventory.unitOf(p), qty: qty(l.qty), unitCost: toInt(l.unitCost), lineTotal: t.lines[i].lineTotal, batchNumber: String(l.batchNumber || '').trim(), expiry: String(l.expiry || '').trim(), mfg: String(l.mfg || '').trim() }; }) };
    if (id) {
      const cur = byId(id); if (!cur || cur.status !== 'draft') throw new Error('Only draft purchases can be edited.');
      const rec = SS.storage.collection.update('purchases', id, fields); SS.audit.record('purchase.draft_updated', { type: 'purchase', id, label: cur.number }); return rec;
    }
    const number = 'PO-' + String(SS.storage.counter('purchase')).padStart(6, '0');
    const rec = SS.storage.collection.insert('purchases', Object.assign({ number, status: 'draft' }, fields), 'pur');
    SS.audit.record('purchase.draft_created', { type: 'purchase', id: rec.id, label: number }); return rec;
  }
  function cancelDraft(id, reason) {
    const p = byId(id); if (!p || p.status !== 'draft') throw new Error('Only draft purchases can be cancelled.');
    SS.storage.collection.update('purchases', id, { status: 'cancelled', cancelReason: String(reason || '').trim() }); SS.audit.record('purchase.cancelled', { type: 'purchase', id, label: p.number });
  }

  /* ---------- Confirmation ---------- */
  function confirm(id, o) {
    o = o || {}; const pur = byId(id); if (!pur) throw new Error('Purchase not found.');
    if (pur.status === 'confirmed') throw new Error('This purchase is already confirmed. Stock was added once and cannot be added again.');
    if (pur.status !== 'draft') throw new Error('Only draft purchases can be confirmed.');
    const d = { supplierId: pur.supplierId, date: pur.date, lines: pur.lines, additional: pur.additionalCosts, discount: pur.discount };
    const { supplier, t } = validate(d);
    if (supplier.status === 'archived') throw new Error('This supplier is archived. Restore the supplier before confirming.');
    const paid = toInt(o.paid); if (paid < 0 || paid > t.total) throw new Error('Amount paid must be between 0 and ' + formatMMK(t.total) + '.');
    const method = o.method || pur.method || 'cash'; if (paid > 0 && !SS.payments.METHODS.includes(method)) throw new Error('Choose a payment method.');
    const balance = t.total - paid;
    return SS.storage.transaction(KEYS, () => {
      const prods = Object.fromEntries(SS.storage.read('products').map((p) => [p.id, p]));
      // step 1: mark as confirming and keep what is needed to undo after a crash
      SS.storage.collection.update('purchases', id, { status: 'confirming', paid, balance, undo: pur.lines.map((l) => ({ productId: l.productId, avgCost: prods[l.productId].avgCost, purchasePrice: prods[l.productId].purchasePrice })) });
      pur.lines.forEach((l, i) => {
        SS.inventory.adjust({ productId: l.productId, type: 'purchase', quantity: l.qty, reason: 'Purchase ' + pur.number, relatedId: id, unitCost: t.lines[i].landedUnit, noAudit: true, batch: prods[l.productId].trackBatches ? { number: l.batchNumber || ('PO-' + pur.number), expiry: l.expiry, mfg: l.mfg } : null });
        SS.products.recordPurchasePrice(l.productId, toInt(l.unitCost));
      });
      if (paid > 0) SS.payments.record({ kind: 'supplier_payment', direction: 'out', supplierId: supplier.id, purchaseId: id, method, amount: paid });
      SS.storage.collection.update('suppliers', supplier.id, { outstandingBalance: toInt(supplier.outstandingBalance) + balance, lastPurchaseApplied: id });
      const next = SS.storage.collection.update('purchases', id, { status: 'confirmed', confirmedAt: Date.now(), method, undo: null, lines: pur.lines.map((l, i) => Object.assign({}, l, { landedUnitCost: t.lines[i].landedUnit })) });
      SS.audit.record('purchase.confirmed', { type: 'purchase', id, label: pur.number }, null, { total: t.total, paid, balance, items: pur.lines.length });
      return next;
    });
  }

  /** Puts purchases left in 'confirming' (browser closed mid-confirmation) back to draft. Safe to repeat. */
  function recover() {
    let n = 0;
    SS.storage.read('purchases').filter((p) => p.status === 'confirming').forEach((p) => {
      try {
        const net = {}; SS.storage.read('stockMovements').filter((m) => m.relatedId === p.id).forEach((m) => { net[m.productId] = qty((net[m.productId] || 0) + m.quantity); });
        const recMoves = SS.storage.read('stockMovements').filter((m) => m.relatedId === p.id && m.batches && m.quantity > 0);
        Object.entries(net).forEach(([pid, q]) => {
          if (!(q > 0)) return; const prod = SS.storage.collection.byId('products', pid); const mine = recMoves.filter((m) => m.productId === pid);
          if (prod && prod.trackBatches && mine.length) mine.forEach((m) => m.batches.forEach((b) => SS.inventory.adjust({ productId: pid, type: 'supplier_return', quantity: b.qty, batchId: b.id, reason: 'Rollback of interrupted purchase ' + p.number, relatedId: p.id, noAudit: true })));   // take back from the very batches it created
          else SS.inventory.adjust({ productId: pid, type: 'supplier_return', quantity: q, reason: 'Rollback of interrupted purchase ' + p.number, relatedId: p.id, noAudit: true });
        });
        const undo = new Map((p.undo || []).map((u) => [u.productId, u]));
        SS.storage.write('products', SS.storage.read('products').map((pr) => (undo.has(pr.id) ? Object.assign({}, pr, { avgCost: undo.get(pr.id).avgCost, purchasePrice: undo.get(pr.id).purchasePrice }) : pr)));
        const pays = SS.storage.read('payments'); if (pays.some((x) => x.purchaseId === p.id)) SS.storage.write('payments', pays.filter((x) => x.purchaseId !== p.id));
        const s = SS.storage.collection.byId('suppliers', p.supplierId);
        if (s && s.lastPurchaseApplied === p.id) SS.storage.collection.update('suppliers', s.id, { outstandingBalance: toInt(s.outstandingBalance) - toInt(p.balance), lastPurchaseApplied: '' });
        SS.storage.collection.update('purchases', p.id, { status: 'draft', paid: 0, balance: p.total, undo: null });
        SS.audit.record('purchase.rolled_back', { type: 'purchase', id: p.id, label: p.number }); n++;
      } catch (e) { console.error('[SmartStock] could not recover purchase ' + p.number, e); }
    });
    return n;
  }

  /* ---------- UI ---------- */
  const unlockThen = (fn) => (SS.privacy.canViewCost() ? fn() : SS.privacy.requestUnlock().then((ok) => { if (ok) fn(); }));
  const statusOf = (p) => (p.status === 'draft' ? ['Draft', 'info'] : p.status === 'cancelled' ? ['Cancelled', 'danger'] : p.status === 'confirming' ? ['Interrupted', 'warning'] : p.balance > 0 ? ['Unpaid balance', 'warning'] : ['Paid', 'success']);

  function openEditor(id, onDone) {
    const cur = id ? byId(id) : null; if (cur && cur.status !== 'draft') return openDetails(id, onDone);
    const sups = SS.suppliers.options(cur && cur.supplierId);
    if (!sups.length) return SS.utils.toast('Add a supplier first (Suppliers page).', 'warning');
    if (!SS.storage.read('products').some((p) => p.status !== 'archived')) return SS.utils.toast('Add products first (Products page).', 'warning');
    const lines = cur ? cur.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitCost: l.unitCost, batchNumber: l.batchNumber || '', expiry: l.expiry || '', mfg: l.mfg || '' })) : [];
    const sup = ui.select('poSup', [['', '— choose supplier —']].concat(sups.map((s) => [s.id, s.name])), cur ? cur.supplierId : '');
    const date = el('input', { class: 'input', id: 'poDate', type: 'date', value: cur ? cur.date : dayKey(Date.now()) });
    const addl = el('input', { class: 'input', id: 'poAddl', type: 'number', min: '0', step: '1', value: cur ? cur.additionalCosts || '' : '', placeholder: '0' });
    const disc = el('input', { class: 'input', id: 'poDisc', type: 'number', min: '0', step: '1', value: cur ? cur.discount || '' : '', placeholder: '0' });
    const notes = el('input', { class: 'input', id: 'poNotes', value: cur ? cur.notes || '' : '' });
    const prods = SS.storage.read('products').filter((p) => p.status !== 'archived'); const label = (p) => `${p.name} · ${p.sku}`;
    const pick = el('input', { class: 'input', id: 'poPick', list: 'poProducts', placeholder: 'Type a product name, SKU or scan a barcode, then Enter', autocomplete: 'off', 'data-scan': '1' });
    const dl = el('datalist', { id: 'poProducts' }, prods.map((p) => el('option', { value: label(p) })));
    const body = el('div'); const totalsEl = el('div');
    const add = (p) => { if (!lines.some((l) => l.productId === p.id)) lines.push({ productId: p.id, qty: 1, unitCost: p.purchasePrice || 0 }); pick.value = ''; draw(); };
    pick.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const v = pick.value.trim(); const hit = SS.barcode.find(v) || prods.find((p) => label(p) === v) || prods.find((p) => p.name.toLowerCase() === v.toLowerCase()); if (hit && hit.status !== 'archived') add(hit); else SS.utils.toast('No matching product.', 'warning'); });
    pick.addEventListener('change', () => { const hit = prods.find((p) => label(p) === pick.value); if (hit) add(hit); });
    function current() { return { supplierId: sup.value, date: date.value, lines, additional: addl.value, discount: disc.value, notes: notes.value }; }
    function draw() {
      clear(body); clear(totalsEl); const t = totals(lines, addl.value, disc.value);
      body.append(lines.length ? el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, ['Product', 'Qty', 'Unit cost (MMK)', 'Line total', ''].map((h, i) => el('th', { class: i && i < 4 ? 'num' : '' }, h)))),
        el('tbody', null, lines.map((l, i) => { const p = SS.storage.collection.byId('products', l.productId);
          const q = el('input', { class: 'input', type: 'number', min: '0', step: SS.inventory.isWholeUnit(p.unit) ? '1' : 'any', value: l.qty, style: 'width:90px;text-align:right', 'aria-label': 'Quantity for ' + p.name }); q.addEventListener('change', () => { l.qty = qty(q.value); draw(); });
          const c = el('input', { class: 'input', type: 'number', min: '0', step: '1', value: l.unitCost, style: 'width:120px;text-align:right', 'aria-label': 'Unit cost for ' + p.name }); c.addEventListener('change', () => { l.unitCost = c.value === '' ? '' : toInt(c.value); draw(); });
          return el('tr', null, el('td', null, p.name, el('span', { class: 'sub' }, p.sku), p.trackBatches ? el('div', { class: 'batch-row' }, batchInput(l, 'batchNumber', 'Batch no.', 'text', p.name), batchInput(l, 'expiry', 'Expiry', 'date', p.name)) : null), el('td', { class: 'num' }, q), el('td', { class: 'num' }, c), el('td', { class: 'num' }, formatMMK(t.lines[i].lineTotal)), el('td', null, el('button', { class: 'btn sm', type: 'button', 'aria-label': 'Remove ' + p.name, onclick: () => { lines.splice(i, 1); draw(); } }, '✕'))); })))) : el('div', { class: 'empty' }, el('strong', null, 'No products yet'), 'Search above to add what you bought.'));
      totalsEl.append(el('ul', { class: 'list' }, el('li', null, el('span', null, 'Products subtotal'), el('span', null, formatMMK(t.subtotal))), el('li', null, el('span', null, 'Additional costs (transport, etc.)'), el('span', null, '+' + formatMMK(t.additional))), el('li', null, el('span', null, 'Discount'), el('span', null, '−' + formatMMK(t.discount))), el('li', null, el('strong', null, 'Total'), el('strong', null, formatMMK(t.total)))),
        el('p', { class: 'muted small' }, 'Additional costs and discount are spread over the products, so each item’s stock cost includes its share.'));
    }
    [addl, disc].forEach((n) => n.addEventListener('input', SS.utils.debounce(draw, 250)));
    draw();
    const m = SS.utils.openModal({ title: cur ? 'Edit ' + cur.number : 'New purchase', body: el('div', null, el('div', { class: 'form-grid' }, ui.field('Supplier', 'poSup', sup), ui.field('Purchase date', 'poDate', date)), ui.field('Add product', 'poPick', pick), dl, body, el('div', { class: 'form-grid', style: 'margin-top:12px' }, ui.field('Additional costs (MMK)', 'poAddl', addl), ui.field('Discount (MMK)', 'poDisc', disc)), totalsEl, ui.field('Notes', 'poNotes', notes)),
      actions: [{ label: SS.i18n.t('cancel') },
        { label: 'Save draft', onClick: () => { try { saveDraft(current(), id); SS.utils.toast('Draft saved.', 'success'); if (onDone) onDone(); } catch (e) { SS.utils.toast(e.message, 'error'); return false; } } },
        { label: 'Save & confirm…', kind: 'primary', onClick: () => { try { const rec = saveDraft(current(), id); setTimeout(() => openConfirm(rec.id, onDone), 0); if (onDone) onDone(); } catch (e) { SS.utils.toast(e.message, 'error'); return false; } } }] });
    m.classList.add('wide');
  }

  function openConfirm(id, onDone) {
    const p = byId(id); if (!p || p.status !== 'draft') return;
    const paid = el('input', { class: 'input', id: 'cfPaid', type: 'number', min: '0', max: String(p.total), step: '1', value: p.total }); const method = ui.select('cfMethod', SS.sales.METHODS.map((m) => [m[0], m[1]]), p.method || 'cash');
    const note = el('p', { class: 'muted small' }); const upd = () => { const b = Math.max(0, p.total - toInt(paid.value)); note.textContent = b > 0 ? `${formatMMK(b)} will be added to what you owe ${p.supplierName}.` : 'Paid in full.'; }; paid.addEventListener('input', upd); upd();
    SS.utils.openModal({ title: 'Confirm ' + p.number, body: el('div', null, el('p', null, 'Confirming adds the stock to your inventory and cannot be done twice.'), el('p', null, el('strong', null, 'Total ' + formatMMK(p.total))), ui.field('Amount paid now (MMK)', 'cfPaid', paid), ui.field('Payment method', 'cfMethod', method), note),
      actions: [{ label: 'Back' }, { label: 'Confirm purchase', kind: 'primary', onClick: () => { try { confirm(id, { paid: paid.value, method: method.value }); SS.utils.toast('Purchase confirmed. Stock updated.', 'success'); if (onDone) onDone(); } catch (e) { SS.utils.toast(e.message, 'error'); return false; } } }] });
  }

  function invoiceNode(p) {
    const s = SS.settings.get(); const kv = (a, b, c) => el('div', { class: 'r-row ' + (c || '') }, el('span', null, a), el('span', null, b));
    return el('div', { class: 'receipt a4' }, s.shopLogo ? el('img', { class: 'r-logo', src: s.shopLogo, alt: '' }) : null, el('div', { class: 'r-shop' }, s.shopName), s.shopAddress ? el('div', { class: 'r-center' }, s.shopAddress) : null,
      el('div', { class: 'r-title' }, 'PURCHASE INVOICE / ဝယ်ယူမှုစာရင်း'), kv('No.', p.number), kv('Date', p.date), kv('Supplier', p.supplierName), kv('Status', statusOf(p)[0]),
      el('table', { class: 'r-table' }, el('thead', null, el('tr', null, el('th', null, 'Item'), el('th', { class: 'num' }, 'Qty'), el('th', { class: 'num' }, 'Unit cost'), el('th', { class: 'num' }, 'Amount'))),
        el('tbody', null, p.lines.map((l) => el('tr', null, el('td', { class: 'r-name' }, l.productName), el('td', { class: 'num' }, formatQty(l.qty)), el('td', { class: 'num' }, SS.utils.formatNumber(l.unitCost)), el('td', { class: 'num' }, SS.utils.formatNumber(l.lineTotal)))))),
      el('hr'), kv('Subtotal', formatMMK(p.subtotal)), p.additionalCosts ? kv('Additional costs', '+' + formatMMK(p.additionalCosts)) : null, p.discount ? kv('Discount', '−' + formatMMK(p.discount)) : null,
      kv('Total', formatMMK(p.total), 'r-total'), kv('Paid', formatMMK(p.paid)), p.balance > 0 && p.status === 'confirmed' ? kv('Balance owed', formatMMK(p.balance), 'r-total') : null, p.notes ? el('div', { class: 'r-foot' }, 'Notes: ' + p.notes) : null);
  }
  const printInvoice = (p) => SS.utils.printDocument({ title: 'Invoice ' + p.number, size: 'a4', sizes: [['a4', 'A4 invoice']], render: () => invoiceNode(p) });

  function openDetails(id, onChange) {
    const p = byId(id); if (!p) return;
    const pays = SS.storage.read('payments').filter((x) => x.purchaseId === id).slice().reverse(); const row = (a, b) => el('li', null, el('span', { class: 'muted' }, a), el('span', null, b)); const [label, kind] = statusOf(p);
    SS.utils.openModal({ title: p.number, body: el('div', { class: 'wide' }, el('div', { style: 'margin-bottom:8px' }, ui.badge(label, kind)), el('ul', { class: 'list' }, row('Supplier', p.supplierName), row('Date', p.date), p.notes ? row('Notes', p.notes) : null),
      el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, el('tr', null, ['Item', 'Qty', 'Unit cost', 'Stock cost*', 'Total'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))),
        el('tbody', null, p.lines.map((l) => el('tr', null, el('td', null, l.productName), el('td', { class: 'num' }, formatQty(l.qty)), el('td', { class: 'num' }, formatMMK(l.unitCost)), el('td', { class: 'num' }, l.landedUnitCost != null ? formatMMK(l.landedUnitCost) : '—'), el('td', { class: 'num' }, formatMMK(l.lineTotal))))))),
      el('p', { class: 'muted small' }, '*Stock cost = unit cost plus the item’s share of additional costs, minus discount.'),
      el('ul', { class: 'list' }, row('Subtotal', formatMMK(p.subtotal)), row('Additional costs', formatMMK(p.additionalCosts || 0)), row('Discount', '−' + formatMMK(p.discount || 0)), row('Total', formatMMK(p.total)), row('Paid', formatMMK(p.paid)), row('Balance owed', formatMMK(p.balance))),
      pays.length ? el('div', null, el('h2', { class: 'small', style: 'margin:10px 0 4px' }, 'Payments'), el('ul', { class: 'list' }, pays.map((x) => el('li', null, el('span', null, formatDate(x.createdAt, true) + ' · ' + SS.sales.methodLabel(x.method)), el('span', null, formatMMK(x.amount)))))) : null),
      actions: [{ label: 'Close' }, { label: 'Print invoice', onClick: () => { setTimeout(() => printInvoice(p), 0); } }].concat(p.status === 'confirmed' && p.balance > 0 ? [{ label: 'Pay supplier', kind: 'primary', onClick: () => { setTimeout(() => SS.payments.openDialog({ kind: 'supplier', id: p.supplierId, onDone: onChange }), 0); } }] : []) });
  }

  function page(root) {
    const st = { search: '', status: '', supplier: '' }; const holder = el('div', { class: 'card' }); const banner = el('div');
    function drawBanner() {
      clear(banner); const open = SS.privacy.canViewCost();
      banner.append(el('div', { class: 'notice' }, open ? 'Unit costs are visible. They hide again when you leave this page.' : 'Unit costs are hidden. Totals and balances are shown below; open or create a purchase with the administrator PIN.', ' ',
        open ? el('button', { class: 'btn sm', type: 'button', onclick: () => { SS.privacy.lock(); drawBanner(); } }, 'Hide costs') : el('button', { class: 'btn sm', type: 'button', onclick: () => SS.privacy.requestUnlock().then(drawBanner) }, 'Unlock (admin PIN)')));
    }
    function draw() {
      const q = st.search.toLowerCase();
      const rows = SS.storage.read('purchases').filter((p) => (!st.status || statusOf(p)[0] === st.status) && (!st.supplier || p.supplierId === st.supplier) && (!q || (p.number + ' ' + p.supplierName).toLowerCase().includes(q))).slice().reverse();
      const t = ui.dataTable({ rows, pageSize: 15, empty: { title: 'No purchases yet', hint: 'Record what you buy from suppliers. Confirmed purchases add stock.' }, columns: [
        { key: 'number', label: 'No.', render: (p) => el('button', { class: 'link-btn', type: 'button', onclick: () => unlockThen(() => (p.status === 'draft' ? openEditor(p.id, refresh) : openDetails(p.id, refresh))) }, p.number) },
        { key: 'date', label: 'Date' }, { key: 'supplierName', label: 'Supplier' },
        { key: 'total', label: 'Total', num: true, render: (p) => formatMMK(p.total) }, { key: 'paid', label: 'Paid', num: true, render: (p) => (p.status === 'confirmed' ? formatMMK(p.paid) : '—') },
        { key: 'balance', label: 'Owed', num: true, render: (p) => (p.status === 'confirmed' && p.balance > 0 ? formatMMK(p.balance) : '—') },
        { key: 'status', label: 'Status', sortValue: (p) => statusOf(p)[0], render: (p) => ui.badge(statusOf(p)[0], statusOf(p)[1]) },
        { key: 'act', label: '', sortable: false, render: (p) => el('div', { class: 'row-actions' },
          p.status === 'draft' ? el('button', { class: 'btn sm', type: 'button', onclick: () => unlockThen(() => openConfirm(p.id, refresh)) }, 'Confirm') : null,
          p.status === 'draft' ? el('button', { class: 'btn sm', type: 'button', onclick: async () => { if (await SS.utils.confirmDialog('Cancel draft?', p.number + ' will be marked cancelled. No stock is changed.', 'Cancel draft', true)) { try { cancelDraft(p.id, 'Cancelled by user'); refresh(); } catch (e) { SS.utils.toast(e.message, 'error'); } } } }, 'Cancel') : null,
          p.status === 'confirmed' && p.balance > 0 ? el('button', { class: 'btn sm', type: 'button', onclick: () => SS.payments.openDialog({ kind: 'supplier', id: p.supplierId, onDone: refresh }) }, 'Pay') : null,
          p.status === 'confirmed' ? el('button', { class: 'btn sm', type: 'button', onclick: () => unlockThen(() => printInvoice(p)) }, 'Invoice') : null) }] });
      clear(holder); holder.append(t.node);
    }
    const refresh = () => { drawBanner(); draw(); };
    const search = el('input', { class: 'input grow', type: 'search', placeholder: 'Search number or supplier…', 'aria-label': 'Search purchases' }); search.addEventListener('input', SS.utils.debounce(() => { st.search = search.value; draw(); }, 150));
    const status = ui.select('poStatus', [['', 'All statuses'], ['Draft', 'Draft'], ['Unpaid balance', 'Unpaid balance'], ['Paid', 'Paid'], ['Cancelled', 'Cancelled']], ''); status.addEventListener('change', () => { st.status = status.value; draw(); });
    const sup = ui.select('poSupF', [['', 'All suppliers']].concat(SS.suppliers.all().map((s) => [s.id, s.name])), ''); sup.addEventListener('change', () => { st.supplier = sup.value; draw(); });
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('purchases')), el('p', null, 'Stock you buy from suppliers. Expenses like rent are recorded separately.')), el('button', { class: 'btn primary', type: 'button', onclick: () => unlockThen(() => openEditor(null, refresh)) }, '+ New purchase')),
      banner, el('div', { class: 'toolbar' }, search, status, sup), holder);
    refresh();
  }

  SS.purchases = { totals, validate, saveDraft, cancelDraft, confirm, recover, openEditor, openConfirm, openDetails, printInvoice };
  SS.pages = SS.pages || {}; SS.pages.purchases = page;
})();

;
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

;
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

;
/* SmartStock — charts.js
 * Small dependency-free SVG charts (line, bar, doughnut) with hover tooltips, legends and screen-reader labels.
 * Used instead of Chart.js because no copy of Chart.js could be downloaded when this was built; the whole app
 * therefore keeps working offline with no external library. Charts only draw the numbers they are given, so a
 * caller that has no permission to see a value (e.g. cost) simply never passes it.
 *   SS.charts.line({labels, series:[{name, values, color?}], format?, height?, label?})
 *   SS.charts.bar({labels, series:[...], format?, height?, label?})
 *   SS.charts.donut({items:[{label, value}], format?, label?})
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, formatMMK } = SS.utils;
  const NS = 'http://www.w3.org/2000/svg';
  const PALETTE = ['#C5A46D', '#477BAA', '#27856A', '#D65353', '#8B7BB8', '#D69B36', '#5C8A9B'];
  const colorOf = (s, i) => s.color || PALETTE[i % PALETTE.length];
  const svg = (tag, attrs, ...kids) => { const n = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, attrs[k])); kids.forEach((c) => c && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)); return n; };
  const compact = (v) => { const a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : a >= 1e3 ? (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(Math.round(v)); };

  /** "Nice" axis maximum and tick step. */
  function scale(min, max) {
    if (!(max > min)) max = min + 1;
    const raw = (max - min) / 4; const mag = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / mag; const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step; const ticks = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v); return { lo, hi, ticks };
  }

  function shell(cfg, kind, drawFn, legendItems) {
    const wrap = el('div', { class: 'chart', style: 'position:relative' }); const tip = el('div', { class: 'chart-tip', role: 'status', style: 'display:none' });
    const fmt = cfg.format || formatMMK;
    const show = (e, html) => { tip.textContent = ''; html.forEach((t) => tip.append(el('div', null, t))); tip.style.display = 'block'; const r = wrap.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; tip.style.left = Math.min(Math.max(8, x + 12), Math.max(8, r.width - tip.offsetWidth - 8)) + 'px'; tip.style.top = Math.max(0, y - tip.offsetHeight - 10) + 'px'; };
    const hide = () => { tip.style.display = 'none'; };
    const body = drawFn({ fmt, show, hide }); const total = (cfg.series || cfg.items || []).length;
    wrap.append(body, tip); if (legendItems && (legendItems.length > 1 || kind === 'donut')) wrap.append(el('div', { class: 'chart-legend' }, legendItems.map((l) => el('span', null, el('i', { style: 'background:' + l.color }), l.name))));
    wrap.setAttribute('data-chart', kind); wrap.setAttribute('data-series', String(total)); return wrap;
  }

  function axes(cfg, fmt, lo, hi, ticks, W, H, P, labels, bandOrPoint) {
    const g = svg('g', {}); const y = (v) => P.t + (H - P.t - P.b) * (1 - (v - lo) / (hi - lo));
    ticks.forEach((t) => { g.append(svg('line', { x1: P.l, x2: W - P.r, y1: y(t), y2: y(t), class: 'c-grid' }), svg('text', { x: P.l - 6, y: y(t) + 4, class: 'c-axis', 'text-anchor': 'end' }, compact(t))); });
    const every = Math.max(1, Math.ceil(labels.length / 8));
    labels.forEach((l, i) => { if (i % every === 0 || i === labels.length - 1) g.append(svg('text', { x: bandOrPoint(i), y: H - P.b + 16, class: 'c-axis', 'text-anchor': 'middle' }, String(l))); });
    return { g, y };
  }
  const empty = (msg) => el('div', { class: 'empty' }, el('strong', null, msg || 'No data for this period'));
  const labelFor = (cfg, kind) => cfg.label || (kind + ' chart: ' + (cfg.series || []).map((s) => s.name).join(', '));

  function line(cfg) {
    const labels = cfg.labels || [], series = cfg.series || []; if (!labels.length || !series.length) return empty(cfg.empty);
    return shell(cfg, 'line', ({ fmt, show, hide }) => {
      const W = 640, H = cfg.height || 240, P = { l: 52, r: 12, t: 12, b: 28 }; const all = series.flatMap((s) => s.values); const sc = scale(Math.min(0, Math.min.apply(null, all)), Math.max.apply(null, all));
      const x = (i) => (labels.length === 1 ? (P.l + W - P.r) / 2 : P.l + (W - P.l - P.r) * i / (labels.length - 1));
      const { g, y } = axes(cfg, fmt, sc.lo, sc.hi, sc.ticks, W, H, P, labels, x); const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': labelFor(cfg, 'Line'), class: 'c-svg' }, g);
      series.forEach((s, si) => { const c = colorOf(s, si); root.append(svg('polyline', { points: s.values.map((v, i) => x(i) + ',' + y(v)).join(' '), fill: 'none', stroke: c, 'stroke-width': 2.5, 'stroke-linejoin': 'round' })); });
      series.forEach((s, si) => s.values.forEach((v, i) => { const c = svg('circle', { cx: x(i), cy: y(v), r: 4, fill: colorOf(s, si), class: 'c-pt', tabindex: 0, 'aria-label': `${labels[i]}: ${s.name} ${fmt(v)}` });
        c.addEventListener('mousemove', (e) => show(e, [String(labels[i])].concat(series.map((q) => q.name + ': ' + fmt(q.values[i]))))); c.addEventListener('mouseleave', hide); c.addEventListener('focus', () => { const r = c.getBoundingClientRect(); show({ clientX: r.left, clientY: r.top }, [String(labels[i]), s.name + ': ' + fmt(v)]); }); c.addEventListener('blur', hide); root.append(c); }));
      return root;
    }, series.map((s, i) => ({ name: s.name, color: colorOf(s, i) })));
  }

  function bar(cfg) {
    const labels = cfg.labels || [], series = cfg.series || []; if (!labels.length || !series.length) return empty(cfg.empty);
    return shell(cfg, 'bar', ({ fmt, show, hide }) => {
      const W = 640, H = cfg.height || 240, P = { l: 52, r: 12, t: 12, b: 28 }; const all = series.flatMap((s) => s.values); const sc = scale(Math.min(0, Math.min.apply(null, all)), Math.max.apply(null, all));
      const band = (W - P.l - P.r) / labels.length; const cx = (i) => P.l + band * (i + 0.5);
      const { g, y } = axes(cfg, fmt, sc.lo, sc.hi, sc.ticks, W, H, P, labels, cx); const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': labelFor(cfg, 'Bar'), class: 'c-svg' }, g);
      const bw = Math.min(40, band * 0.7 / series.length); const base = y(Math.max(0, sc.lo));
      series.forEach((s, si) => s.values.forEach((v, i) => { const x0 = cx(i) - bw * series.length / 2 + si * bw; const top = Math.min(y(v), base), h = Math.max(1, Math.abs(y(v) - base));
        const r = svg('rect', { x: x0 + 1, y: top, width: Math.max(1, bw - 2), height: h, rx: 2, fill: colorOf(s, si), class: 'c-bar', tabindex: 0, 'aria-label': `${labels[i]}: ${s.name} ${fmt(v)}` });
        r.addEventListener('mousemove', (e) => show(e, [String(labels[i]), s.name + ': ' + fmt(v)])); r.addEventListener('mouseleave', hide); r.addEventListener('focus', () => { const b = r.getBoundingClientRect(); show({ clientX: b.left, clientY: b.top }, [String(labels[i]), s.name + ': ' + fmt(v)]); }); r.addEventListener('blur', hide); root.append(r); }));
      return root;
    }, series.map((s, i) => ({ name: s.name, color: colorOf(s, i) })));
  }

  function donut(cfg) {
    const items = (cfg.items || []).filter((i) => i.value > 0); if (!items.length) return empty(cfg.empty);
    const total = items.reduce((a, i) => a + i.value, 0);
    return shell(Object.assign({}, cfg, { series: items }), 'donut', ({ fmt, show, hide }) => {
      const S = 200, R = 80, r = 50, c = S / 2; const root = svg('svg', { viewBox: `0 0 ${S} ${S}`, role: 'img', 'aria-label': cfg.label || 'Doughnut chart', class: 'c-svg c-donut' });
      let a0 = -Math.PI / 2;
      items.forEach((it, i) => { const a1 = a0 + (it.value / total) * Math.PI * 2 - (items.length > 1 ? 0.012 : 0); const big = a1 - a0 > Math.PI ? 1 : 0; const p = (rad, a) => (c + rad * Math.cos(a)) + ',' + (c + rad * Math.sin(a));
        const d = items.length === 1 ? `M${c},${c - R} A${R},${R} 0 1 1 ${c - 0.01},${c - R} L${c - 0.01},${c - r} A${r},${r} 0 1 0 ${c},${c - r} Z` : `M${p(R, a0)} A${R},${R} 0 ${big} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${big} 0 ${p(r, a0)} Z`;
        const path = svg('path', { d, fill: PALETTE[i % PALETTE.length], class: 'c-bar', tabindex: 0, 'aria-label': `${it.label}: ${fmt(it.value)} (${Math.round(it.value * 1000 / total) / 10}%)` });
        path.addEventListener('mousemove', (e) => show(e, [it.label, fmt(it.value) + ' · ' + Math.round(it.value * 1000 / total) / 10 + '%'])); path.addEventListener('mouseleave', hide); root.append(path); a0 += (it.value / total) * Math.PI * 2; });
      root.append(svg('text', { x: c, y: c + 4, 'text-anchor': 'middle', class: 'c-center' }, compact(total)));
      return root;
    }, items.map((it, i) => ({ name: it.label + ' (' + Math.round(it.value * 1000 / total) / 10 + '%)', color: PALETTE[i % PALETTE.length] })));
  }

  SS.charts = { line, bar, donut, PALETTE };
})();

;
/* SmartStock — csv.js
 * CSV building and download. UTF-8 with BOM so Excel shows Myanmar text correctly.
 * Cells starting with = + - @ are prefixed with ' so a spreadsheet never runs them as formulas.
 * Callers pass only data the user may see (no purchase prices unless unlocked) — this module never reads storage.
 * "Download started" is the most a browser page can honestly report; it cannot confirm the file was saved.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  function cell(v) {
    let s = v == null ? '' : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function build(header, rows) { return '﻿' + [header].concat(rows).map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'; }
  function download(filename, header, rows) {
    const text = build(header, rows); const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000); return { bytes: blob.size, rows: rows.length };
  }
  SS.csv = { build, download };
})();

;
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

;
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

;
/* SmartStock — notifications.js
 * Notification centre. Alerts are GENERATED from stored records every time (nothing is invented); the
 * `notifications` collection only remembers the user's choices: {id: <alert key>, read, dismissed}.
 * An alert key includes the facts it is about (e.g. low:<product>:<stock>), so when the situation changes the
 * alert comes back as new even if an earlier one was dismissed.
 * Alerts never contain purchase prices. Not generated (no data exists for them yet): near-expiry / expired
 * products (products have no expiry date) and .
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear, formatMMK, formatQty, toInt, dayKey, formatDate } = SS.utils; const ui = SS.ui;
  const HIGH_DISCOUNT_PCT = 20, OVERDUE_DAYS = 30;
  const TYPES = { stock: 'Stock', money: 'Money', sales: 'Sales', system: 'System' };
  const listeners = new Set();

  /** Builds the current alerts from data. [{key, type, level:'danger'|'warning'|'info', title, detail, at, href}] */
  function generate() {
    const out = []; const add = (a) => out.push(a); const today = dayKey(Date.now());
    const products = SS.storage.read('products').filter((p) => p.status !== 'archived'); const lastMove = {};
    SS.storage.read('stockMovements').forEach((m) => { lastMove[m.productId] = Math.max(lastMove[m.productId] || 0, m.createdAt || 0); });
    products.forEach((p) => { const s = SS.inventory.stockStatus(p); const unit = SS.inventory.unitOf(p); const at = lastMove[p.id] || p.updatedAt || p.createdAt || Date.now();
      if (s === 'out') add({ key: 'out:' + p.id, type: 'stock', level: 'danger', title: 'Out of stock: ' + p.name, detail: 'No ' + unit + ' left to sell.', at, href: '#/inventory' });
      else if (s === 'low') add({ key: 'low:' + p.id + ':' + p.stock, type: 'stock', level: 'warning', title: 'Low stock: ' + p.name, detail: formatQty(p.stock) + ' ' + unit + ' left.', at, href: '#/inventory' }); });
    if (SS.finance && SS.finance.expiryReport) { const ex = SS.finance.expiryReport();
      ex.rows.filter((r) => r.status === 'expired').forEach((r) => add({ key: 'exp:' + r.id + ':' + r.qty, type: 'stock', level: 'danger', title: 'Expired: ' + r.product + ' (batch ' + r.batch + ')', detail: formatQty(r.qty) + ' ' + r.unit + ' expired on ' + r.expiry + '. It cannot be sold — record it as Expired goods.', at: Date.parse(r.expiry + 'T00:00:00Z') || Date.now(), href: '#/reports/expiry' }));
      ex.rows.filter((r) => r.status === 'near').forEach((r) => add({ key: 'near:' + r.id + ':' + r.qty, type: 'stock', level: 'warning', title: 'Near expiry: ' + r.product + ' (batch ' + r.batch + ')', detail: formatQty(r.qty) + ' ' + r.unit + ' expire in ' + r.daysLeft + ' day(s) on ' + r.expiry + '.', at: Date.now(), href: '#/reports/expiry' })); }
    const sales = SS.storage.read('sales');
    SS.storage.read('customers').filter((c) => toInt(c.outstandingBalance) > 0).forEach((c) => {
      const mine = sales.filter((s) => s.customerId === c.id && s.status === 'completed' && s.balance > 0); const oldest = mine.length ? Math.min.apply(null, mine.map((s) => s.createdAt)) : Date.now();
      const age = SS.utils.daysBetween(dayKey(oldest), today) - 1;
      add({ key: 'cust:' + c.id + ':' + c.outstandingBalance, type: 'money', level: age > OVERDUE_DAYS ? 'danger' : 'info', title: c.name + ' owes ' + formatMMK(c.outstandingBalance), detail: age > OVERDUE_DAYS ? 'Oldest unpaid sale is ' + age + ' days old.' : 'Unpaid balance from credit sales.', at: oldest, href: '#/customers' }); });
    const purchases = SS.storage.read('purchases');
    SS.storage.read('suppliers').filter((s) => toInt(s.outstandingBalance) > 0).forEach((s) => {
      const mine = purchases.filter((p) => p.supplierId === s.id && p.status === 'confirmed' && p.balance > 0); const oldest = mine.length ? Math.min.apply(null, mine.map((p) => p.confirmedAt || Date.now())) : Date.now();
      const age = SS.utils.daysBetween(dayKey(oldest), today) - 1;
      add({ key: 'sup:' + s.id + ':' + s.outstandingBalance, type: 'money', level: age > OVERDUE_DAYS ? 'danger' : 'info', title: 'You owe ' + s.name + ' ' + formatMMK(s.outstandingBalance), detail: age > OVERDUE_DAYS ? 'Oldest unpaid purchase is ' + age + ' days old.' : 'Outstanding supplier payment.', at: oldest, href: '#/suppliers' }); });
    purchases.filter((p) => p.status === 'draft').forEach((p) => add({ key: 'draft:' + p.id, type: 'system', level: 'info', title: 'Purchase ' + p.number + ' is still a draft', detail: 'Stock is not added until it is confirmed.', at: p.updatedAt || p.createdAt || Date.now(), href: '#/purchases' }));
    purchases.filter((p) => p.status === 'confirming').forEach((p) => add({ key: 'conf:' + p.id, type: 'system', level: 'danger', title: 'Purchase ' + p.number + ' was interrupted', detail: 'Reload the app to restore it to a draft.', at: p.updatedAt || Date.now(), href: '#/purchases' }));
    const since = Date.now() - 7 * 864e5;
    sales.filter((s) => s.status === 'completed' && s.createdAt >= since && (s.discountPct || 0) >= HIGH_DISCOUNT_PCT).forEach((s) => add({ key: 'disc:' + s.id, type: 'sales', level: 'warning', title: 'High discount on ' + s.number + ' (' + s.discountPct + '%)', detail: 'Sale total ' + formatMMK(s.total) + '. Check it was intended.', at: s.createdAt, href: '#/sales/history' }));
    const sessions = SS.storage.read('cashSessions'); sessions.filter((c) => c.status === 'open' && c.date < today).forEach((c) => add({ key: 'cash:' + c.id, type: 'money', level: 'warning', title: 'Cash drawer for ' + c.date + ' was never closed', detail: 'Count the cash and close the day.', at: c.openedAt || Date.now(), href: '#/cash' }));
    sessions.filter((c) => c.status === 'closed' && c.difference).forEach((c) => add({ key: 'cashdiff:' + c.id, type: 'money', level: 'warning', title: 'Cash difference on ' + c.date + ': ' + (c.difference > 0 ? '+' : '−') + formatMMK(Math.abs(c.difference)), detail: c.closeNote || 'Counted cash differed from expected.', at: c.closedAt || Date.now(), href: '#/cash' }));
    const hasData = products.length || sales.length || purchases.length; const lb = SS.backup && SS.backup.lastBackup();
    if (hasData && !lb) add({ key: 'backup:never', type: 'system', level: 'warning', title: 'No backup has been made yet', detail: 'Your data lives only in this browser. Create a backup file.', at: Date.now(), href: '#/backup' });
    else if (lb && Date.now() - lb.at > 7 * 864e5) add({ key: 'backup:' + dayKey(lb.at), type: 'system', level: 'warning', title: 'Last backup was ' + (SS.utils.daysBetween(dayKey(lb.at), today) - 1) + ' days ago', detail: 'Make a fresh backup so recent sales are safe.', at: lb.at, href: '#/backup' });
    const rc = SS.finance ? SS.finance.reconcile() : { issueCount: 0 };
    if (rc.issueCount) add({ key: 'recon:' + rc.issueCount, type: 'system', level: 'danger', title: 'Reconciliation found ' + rc.issueCount + ' mismatch(es)', detail: 'Some balances, payments or stock do not agree.', at: rc.ranAt, href: '#/reports/reconcile' });
    return out.sort((a, b) => (b.at || 0) - (a.at || 0));
  }

  const stateMap = () => Object.fromEntries(SS.storage.read('notifications').map((n) => [n.id, n]));
  function all() { const st = stateMap(); return generate().map((a) => Object.assign({}, a, { read: !!(st[a.key] && st[a.key].read), dismissed: !!(st[a.key] && st[a.key].dismissed) })); }
  const unreadCount = () => all().filter((n) => !n.read && !n.dismissed).length;
  function change(keys, patch) {
    const live = new Set(generate().map((a) => a.key)); const cur = SS.storage.read('notifications').filter((n) => live.has(n.id)); const map = new Map(cur.map((n) => [n.id, n]));
    keys.forEach((k) => map.set(k, Object.assign({ id: k, read: false, dismissed: false }, map.get(k) || {}, patch)));
    SS.storage.write('notifications', Array.from(map.values())); listeners.forEach((f) => f());
  }
  const markRead = (keys) => change([].concat(keys), { read: true });
  const dismiss = (keys) => change([].concat(keys), { read: true, dismissed: true });
  const restore = (keys) => change([].concat(keys), { dismissed: false });
  const markAllRead = () => change(all().filter((n) => !n.dismissed).map((n) => n.key), { read: true });

  /* ---------- Page ---------- */
  const st = { filter: 'unread' };
  const FILTERS = [['unread', 'Unread'], ['all', 'All'], ['stock', 'Stock'], ['money', 'Money'], ['sales', 'Sales'], ['system', 'System'], ['dismissed', 'Dismissed']];
  function page(root) {
    const body = el('div');
    function draw() {
      clear(body); const items = all();
      const shown = items.filter((n) => (st.filter === 'dismissed' ? n.dismissed : !n.dismissed && (st.filter === 'all' || (st.filter === 'unread' ? !n.read : n.type === st.filter))));
      body.append(el('div', { class: 'tabs', role: 'tablist' }, FILTERS.map(([id, l]) => {
        const c = id === 'unread' ? items.filter((n) => !n.read && !n.dismissed).length : id === 'dismissed' ? items.filter((n) => n.dismissed).length : id === 'all' ? items.filter((n) => !n.dismissed).length : items.filter((n) => !n.dismissed && n.type === id).length;
        return el('button', { class: 'tab' + (st.filter === id ? ' active' : ''), type: 'button', role: 'tab', 'data-filter': id, onclick: () => { st.filter = id; draw(); } }, l + ' (' + c + ')'); })));
      if (!shown.length) { body.append(el('div', { class: 'empty' }, el('strong', null, st.filter === 'dismissed' ? 'Nothing dismissed' : 'No notifications'), items.length ? 'Nothing matches this filter.' : 'Alerts appear here when stock runs low, balances are unpaid or something needs checking.')); return; }
      body.append(el('ul', { class: 'notif-list' }, shown.map((n) => el('li', { class: 'notif ' + n.level + (n.read ? ' read' : ''), 'data-key': n.key },
        el('div', { class: 'notif-main' }, el('div', { class: 'notif-title' }, n.read ? null : el('span', { class: 'dot', 'aria-label': 'Unread' }), n.title, ui.badge(TYPES[n.type], n.level === 'danger' ? 'danger' : n.level === 'warning' ? 'warning' : 'info')),
          el('div', { class: 'small muted' }, n.detail), el('div', { class: 'small muted' }, formatDate(n.at, true))),
        el('div', { class: 'btn-row' },
          el('a', { class: 'btn sm', href: n.href, onclick: () => { if (!n.read) markRead(n.key); } }, 'Open'),
          n.dismissed ? el('button', { class: 'btn sm', type: 'button', onclick: () => { restore(n.key); draw(); } }, 'Restore')
            : [n.read ? null : el('button', { class: 'btn sm', type: 'button', onclick: () => { markRead(n.key); draw(); } }, 'Mark read'), el('button', { class: 'btn sm', type: 'button', onclick: () => { dismiss(n.key); draw(); } }, 'Dismiss')])))));
    }
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('notifications')), el('p', null, 'Built from your real stock, balances and records. Dismissed alerts return only if the situation changes.')),
      el('button', { class: 'btn', type: 'button', onclick: () => { markAllRead(); draw(); } }, 'Mark all as read')), body);
    draw();
  }

  SS.notifications = { generate, all, unreadCount, markRead, markAllRead, dismiss, restore, onChange: (f) => { listeners.add(f); return () => listeners.delete(f); } };
  SS.pages = SS.pages || {}; SS.pages.notifications = page;
})();

;
/* SmartStock — analytics.js
 * Dashboard (Phase 1): every figure is computed from stored records; empty states when no data.
 * Chart.js is not bundled yet (offline-first); Phase 6 vendors it locally. Until then trends use
 * lightweight DOM bars.
 * Purchase prices: the inventory COST value is computed only when SS.privacy.canViewCost() is true.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, formatMMK, formatNumber, dayKey, addDays, toInt } = SS.utils;
  const t = (k) => SS.i18n.t(k);

  const state = { preset: 'today', from: null, to: null };

  const range = () => SS.utils.dateRange(state.preset, state.from, state.to);
  const inRange = (ts, [a, b]) => { const k = dayKey(ts); return k >= a && k <= b; };

  /** Pure metrics calculation from storage. */
  function compute() {
    const r = range();
    const products = SS.storage.read('products');
    const active = products.filter((p) => p.status !== 'archived');
    const sales = SS.storage.read('sales').filter((s) => s.status === 'completed' && inRange(s.createdAt, r));
    const expenses = SS.storage.read('expenses').filter((e) => e.status !== 'void' && e.date >= r[0] && e.date <= r[1]);
    const low = SS.settings.get().lowStockThreshold;

    let revenue = 0, cogs = 0, cashIn = 0; const byProduct = {}, byCat = {}, daily = {};
    const catOf = Object.fromEntries(products.map((p) => [p.id, p.categoryId]));
    sales.forEach((s) => {
      const n = SS.sales.net(s);
      revenue += n.revenue; cogs += n.cogs; cashIn += n.cashIn;
      const k = dayKey(s.createdAt); daily[k] = (daily[k] || 0) + n.revenue;
      (s.lines || []).forEach((l) => {
        const left = (Number(l.qty) || 0) - (Number(l.refundedQty) || 0); if (left <= 0) return;
        const b = byProduct[l.productId] || (byProduct[l.productId] = { name: l.productName || l.productId, qty: 0 });
        b.qty += left;
        const c = catOf[l.productId] || '—'; byCat[c] = (byCat[c] || 0) + Math.round((l.lineNet != null ? l.lineNet : l.lineTotal) * left / l.qty);
      });
    });
    const expTotal = expenses.reduce((a, e) => a + toInt(e.amount), 0);
    const catName = Object.fromEntries(SS.storage.read('categories').map((c) => [c.id, c.name]));
    return {
      range: r, productCount: active.length,
      stockUnits: active.reduce((a, p) => a + (Number(p.stock) || 0), 0),
      retailValue: active.reduce((a, p) => a + (Number(p.stock) || 0) * toInt(p.sellingPrice), 0),
      revenue, cogs, gross: revenue - cogs, expenses: expTotal, operating: revenue - cogs - expTotal, cashIn,
      daily, best: Object.values(byProduct).sort((a, b) => b.qty - a.qty).slice(0, 5),
      catSales: Object.entries(byCat).map(([id, v]) => ({ name: catName[id] || 'Uncategorised', value: v })).sort((a, b) => b.value - a.value),
      lowStock: active.filter((p) => (Number(p.stock) || 0) > 0 && (Number(p.stock) || 0) <= (p.lowStockThreshold != null ? toInt(p.lowStockThreshold) : low)),
      outOfStock: active.filter((p) => (Number(p.stock) || 0) <= 0),
      recentSales: SS.storage.read('sales').filter((s) => s.status === 'completed').slice(-5).reverse(),
      recentMoves: SS.storage.read('stockMovements').slice(-5).reverse(),
      cashFlow: SS.cash.flow(r[0], r[1]),
      receivables: SS.storage.read('customers').reduce((a, c) => a + toInt(c.outstandingBalance), 0),
      payables: SS.storage.read('suppliers').reduce((a, s) => a + toInt(s.outstandingBalance), 0)
    };
  }
  /** Cost value — only evaluated when authorised so cost data never reaches an unauthorised component. */
  function inventoryCostValue() {
    if (!SS.privacy.canViewCost()) return null;
    return SS.storage.read('products').filter((p) => p.status !== 'archived').reduce((a, p) => a + (Number(p.stock) || 0) * toInt(p.avgCost != null ? p.avgCost : p.purchasePrice), 0);
  }

  const empty = (title, hint) => el('div', { class: 'empty' }, el('strong', null, title), hint || '');
  function card(title, body, cls) { return el('section', { class: 'card ' + (cls || '') }, el('div', { class: 'card-head' }, el('h2', null, title)), body); }
  function stat(label, value, hint, accent) {
    return el('div', { class: 'card stat' + (accent ? ' accent' : '') }, el('div', { class: 'label' }, label), el('div', { class: 'value' }, value), hint ? el('div', { class: 'hint' }, hint) : null);
  }
  const list = (items) => el('ul', { class: 'list' }, items);

  function render(root) {
    const m = compute();
    const cost = inventoryCostValue();
    const periodLabel = state.preset === 'today' ? "Today's" : 'Period';
    const costBody = cost == null
      ? el('div', { class: 'value' }, el('span', { class: 'mask' }, '••••••'))
      : el('div', { class: 'value' }, formatMMK(cost));
    const costCard = el('div', { class: 'card stat' }, el('div', { class: 'label' }, 'Inventory cost value'), costBody,
      el('div', { class: 'hint' }, cost == null
        ? el('button', { class: 'btn sm', type: 'button', onclick: () => SS.privacy.requestUnlock().then((ok) => ok && SS.app.refresh()) }, 'Show (admin PIN)')
        : el('button', { class: 'btn sm', type: 'button', onclick: () => { SS.privacy.lock(); SS.app.refresh(); } }, 'Hide')));

    const presets = [['today', 'today'], ['yesterday', 'yesterday'], ['last7', 'last7'], ['last30', 'last30'], ['this_month', 'this_month'], ['prev_month', 'prev_month'], ['custom', 'custom']];
    const filters = el('div', { class: 'filters', role: 'group', 'aria-label': 'Date range' },
      presets.map(([id, key]) => el('button', { class: 'chip' + (state.preset === id ? ' active' : ''), type: 'button', onclick: () => { state.preset = id; SS.app.refresh(); } }, t(key))));
    const custom = state.preset === 'custom' ? el('div', { class: 'filters', style: 'margin-top:8px' },
      el('input', { class: 'input', type: 'date', value: m.range[0], 'aria-label': 'From', style: 'width:auto', onchange: (e) => { state.from = e.target.value; SS.app.refresh(); } }),
      el('input', { class: 'input', type: 'date', value: m.range[1], 'aria-label': 'To', style: 'width:auto', onchange: (e) => { state.to = e.target.value; SS.app.refresh(); } })) : null;

    // sales trend
    const days = []; { let d = m.range[0]; let n = 0; while (d <= m.range[1] && n < 62) { days.push(d); d = addDays(d, 1); n++; } }
    const max = Math.max(1, ...days.map((d) => m.daily[d] || 0));
    const hasSales = Object.keys(m.daily).length > 0;
    const trend = hasSales ? SS.charts.bar({ labels: days.map((d) => d.slice(5)), series: [{ name: 'Revenue', values: days.map((d) => m.daily[d] || 0) }], label: 'Sales trend' }) : empty('No sales in this period', 'Completed sales will appear here.');

    const catMax = Math.max(1, ...m.catSales.map((c) => c.value));
    const cats = m.catSales.length ? SS.charts.donut({ items: m.catSales.slice(0, 6).map((c) => ({ label: c.name, value: c.value })), label: 'Sales by category' }) : empty('No category sales yet');
    void catMax;

    const pl = (arr, fmt, emptyTitle, emptyHint) => arr.length ? list(arr.map(fmt)) : empty(emptyTitle, emptyHint);

    root.append(
      el('div', { class: 'page-head' }, el('div', null, el('h1', null, t('dashboard')), el('p', null, `${SS.settings.get().shopName} · ${SS.utils.formatDate(Date.now())}`)), el('div', null, filters, custom)),
      el('div', { class: 'grid' },
        el('div', { class: 'col-3' }, stat('Total products', formatNumber(m.productCount))),
        el('div', { class: 'col-3' }, stat('Total stock units', formatNumber(m.stockUnits))),
        el('div', { class: 'col-3' }, costCard),
        el('div', { class: 'col-3' }, stat('Inventory retail value', formatMMK(m.retailValue))),
        el('div', { class: 'col-3' }, stat(periodLabel + ' sales', formatMMK(m.revenue), 'Revenue (net of discounts)', true)),
        el('div', { class: 'col-3' }, stat(periodLabel + ' gross profit', SS.privacy.canViewCost() ? formatMMK(m.gross) : '— hidden —', SS.privacy.canViewCost() ? 'Revenue − cost of goods sold' : 'Needs the admin PIN (Reports → Profit)')),
        el('div', { class: 'col-3' }, stat(periodLabel + ' expenses', formatMMK(m.expenses), 'Operating expenses only')),
        el('div', { class: 'col-3' }, stat(periodLabel + ' operating profit (est.)', SS.privacy.canViewCost() ? formatMMK(m.operating) : '— hidden —', SS.privacy.canViewCost() ? 'Gross profit − expenses' : 'Needs the admin PIN')),

        el('div', { class: 'col-8' }, card('Sales trend', trend)),
        el('div', { class: 'col-4' }, card('Sales by category', cats)),
        el('div', { class: 'col-4' }, card('Best-selling products', pl(m.best, (b) => el('li', null, el('span', null, b.name), el('span', { class: 'num' }, formatNumber(b.qty) + ' sold')), 'No sales yet'))),
        el('div', { class: 'col-4' }, card('Low stock', pl(m.lowStock.slice(0, 6), (p) => el('li', null, el('span', null, p.name), el('span', { class: 'badge warning' }, formatNumber(p.stock) + ' left')), 'Nothing running low'))),
        el('div', { class: 'col-4' }, card('Out of stock', pl(m.outOfStock.slice(0, 6), (p) => el('li', null, el('span', null, p.name), el('span', { class: 'badge danger' }, 'Out')), 'No out-of-stock products'))),
        el('div', { class: 'col-6' }, card('Recent transactions', pl(m.recentSales, (s) => el('li', null, el('span', null, (s.number || s.id) + ' · ' + SS.utils.formatDate(s.createdAt, true)), el('span', { class: 'num' }, formatMMK(s.total))), 'No transactions yet'))),
        el('div', { class: 'col-6' }, card('Recent inventory movements', pl(m.recentMoves, (mv) => el('li', null, el('span', null, mv.type + ' · ' + SS.utils.formatDate(mv.createdAt, true)), el('span', { class: 'num' }, (mv.quantity > 0 ? '+' : '') + formatNumber(mv.quantity))), 'No stock movements yet'))),
        el('div', { class: 'col-6' }, card('Recent activity', pl(SS.audit.list({ limit: 5 }), (a) => el('li', null, el('span', null, a.actionType), el('span', { class: 'muted small' }, SS.utils.formatDate(a.timestamp, true))), 'No activity yet'))),
        el('div', { class: 'col-6' }, card('Cash & balances', list([
          el('li', null, el('span', null, 'Cash received (sales + customer payments)'), el('span', { class: 'num' }, formatMMK(m.cashFlow.in))),
          el('li', null, el('span', null, 'Cash paid out (refunds, suppliers, expenses)'), el('span', { class: 'num' }, formatMMK(m.cashFlow.out))),
          el('li', null, el('span', null, 'Net cash movement'), el('span', { class: 'num' }, formatMMK(m.cashFlow.net))),
          el('li', null, el('span', null, 'Pending customer payments (receivables)'), el('span', { class: 'num' }, formatMMK(m.receivables))),
          el('li', null, el('span', null, 'Outstanding supplier payments (payables)'), el('span', { class: 'num' }, formatMMK(m.payables)))]))))
    );
  }

  SS.dashboard = { render, compute };
})();

;
/* SmartStock — pwa.js
 * Optional offline/installable app. Off by default so Live Server development is never affected; the user turns it on in
 * Settings. Works only on https:// or localhost (a browser rule) — not on file://.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  let deferred = null;
  const supported = () => 'serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:';
  const enabled = () => !!SS.settings.get().offlineApp;
  async function register() { const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; return reg; }
  async function enable() {
    if (!supported()) throw new Error('Offline mode needs the app to be opened from https:// or http://localhost (not from a file).');
    await register(); SS.settings.patch({ offlineApp: true }); SS.audit.record('pwa.enabled', { type: 'settings', id: 'pwa' });
  }
  async function disable() {
    SS.settings.patch({ offlineApp: false });
    if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); }
    if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.filter((k) => k.startsWith('smartstock-')).map((k) => caches.delete(k))); }
    SS.audit.record('pwa.disabled', { type: 'settings', id: 'pwa' });
  }
  /** 'unsupported' | 'off' | 'on' (service worker active and controlling) | 'pending' */
  async function status() {
    if (!supported()) return 'unsupported'; if (!enabled()) return 'off';
    const reg = await navigator.serviceWorker.getRegistration(); return reg && reg.active ? 'on' : 'pending';
  }
  function start() { if (supported() && enabled()) register().catch((e) => console.warn('[SmartStock] offline mode could not start:', e.message)); }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  const canInstall = () => !!deferred;
  async function install() { if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice; deferred = null; return r.outcome === 'accepted'; }
  SS.pwa = { supported, enabled, enable, disable, status, start, canInstall, install };
})();

;
/* SmartStock — app.js
 * Application shell: navigation, hash router, theme/language, shortcuts, global search, status.
 * Pages for later phases render an honest "not built yet" notice instead of fake data.
 */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el, clear } = SS.utils;
  const t = (k) => SS.i18n.t(k);

  // id, i18n key, icon, build phase (0 = available now)
  const ROUTES = [
    ['dashboard', 'dashboard', '▦', 0], ['products', 'products', '▣', 2], ['categories', 'categories', '☰', 2],
    ['inventory', 'inventory', '⬒', 2], ['stocktake', 'stocktake', '✓', 2], ['sales', 'sales', '◉', 3],
    ['purchases', 'purchases', '⇩', 4], ['suppliers', 'suppliers', '⚑', 4], ['customers', 'customers', '☺', 4],
    ['expenses', 'expenses', '⊖', 4], ['cash', 'cash', '◎', 4], ['reports', 'reports', '▤', 6],
    ['notifications', 'notifications', '✉', 6], ['activity', 'activity', '↺', 0], ['backup', 'backup', '⇄', 7], ['settings', 'settings', '⚙', 0]
  ];
  const PHASE_NOTES = {
    2: 'Products, categories, barcode, stock movements, stocktake and price history',
    3: 'POS, cart, discounts, payments, receipts and refunds',
    4: 'Purchases, suppliers, customers, payments, expenses and cash management',
    6: 'Reports, Chart.js analytics and the notification centre',
    7: 'JSON backup/restore, CSV export and data migration tools'
  };

  let current = 'dashboard';
  let routeArg = '';
  const main = () => document.getElementById('main');

  function navBadge() {
    let n = 0; try { n = SS.notifications ? SS.notifications.unreadCount() : 0; } catch (e) { n = 0; }
    return n > 0 ? el('span', { class: 'nav-badge', 'aria-label': n + ' unread' }, n > 99 ? '99+' : String(n)) : null;
  }

  function renderNav() {
    const nav = clear(document.getElementById('nav'));
    ROUTES.forEach(([id, key, ico]) => {
      nav.append(el('a', { href: '#/' + id, 'aria-current': id === current ? 'page' : null, class: id === current ? 'active' : '' },
        el('span', { class: 'nav-ico', 'aria-hidden': 'true' }, ico), el('span', { class: 'nav-label' }, t(key)), id === 'notifications' ? navBadge() : null));
    });
  }

  function pendingPage(root, route) {
    const [, key, , phase] = route;
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, t(key)))),
      el('div', { class: 'card' }, el('div', { class: 'empty' }, el('strong', null, 'Not built yet — scheduled for Phase ' + phase),
        PHASE_NOTES[phase] + '. No sample data is shown here.')));
  }

  function activityPage(root) {
    const input = el('input', { class: 'input', type: 'search', placeholder: 'Search activity…', 'aria-label': 'Search activity', style: 'max-width:320px' });
    const body = el('div', { class: 'card' });
    const draw = () => {
      clear(body);
      const items = SS.audit.list({ search: input.value, limit: 200 });
      if (!items.length) return body.append(el('div', { class: 'empty' }, el('strong', null, 'No activity recorded yet'), 'Important actions will be logged here automatically.'));
      body.append(el('div', { class: 'table-wrap' }, el('table', null,
        el('thead', null, el('tr', null, ['Time', 'Action', 'Record', 'Operator'].map((h) => el('th', null, h)))),
        el('tbody', null, items.map((a) => el('tr', null,
          el('td', null, SS.utils.formatDate(a.timestamp, true)), el('td', null, a.actionType),
          el('td', null, a.related ? `${a.related.type || ''} ${a.related.label || a.related.id || ''}` : '—'), el('td', null, a.operator)))))));
    };
    input.addEventListener('input', SS.utils.debounce(draw, 150));
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, t('activity'))), input), body);
    draw();
  }

  function salesPage(root) {
    const hist = routeArg === 'history';
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, t('sales')), el('p', null, hist ? 'Every sale, refund and cancellation. Completed sales are never deleted.' : 'Scan or tap products, then check out.'))),
      el('div', { class: 'tabs', role: 'tablist' }, el('a', { class: 'tab' + (hist ? '' : ' active'), href: '#/sales', role: 'tab' }, 'Point of sale'), el('a', { class: 'tab' + (hist ? ' active' : ''), href: '#/sales/history', role: 'tab' }, 'Sales history')));
    if (hist) SS.sales.historyPage(root); else SS.pos.page(root);
  }

  function render() {
    const root = clear(main());
    const route = ROUTES.find((r) => r[0] === current) || ROUTES[0];
    document.title = t(route[1]) + ' · SmartStock';
    if (current === 'dashboard') SS.dashboard.render(root);
    else if (current === 'sales') salesPage(root);
    else if (SS.pages && SS.pages[current]) SS.pages[current](root, routeArg);
    else if (current === 'settings') { root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, t('settings'))))); SS.settings.render(root); }
    else if (current === 'activity') activityPage(root);
    else pendingPage(root, route);
  }

  let routed = false;
  function route() {
    const parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
    const id = parts[0]; routeArg = parts[1] || '';
    const next = ROUTES.some((r) => r[0] === id) ? id : 'dashboard';
    if (next !== current) SS.privacy.lock();   // cost prices re-hide when leaving the view
    SS.barcode.clearScan();
    current = next;
    closeDrawer(); renderNav(); render();
    if (routed) main().focus({ preventScroll: true });   // first load keeps focus at the top so the skip link is the first Tab stop
    routed = true;
  }

  /* ---------- Theme / language / layout ---------- */
  function applyTheme() {
    const s = SS.settings.get();
    document.documentElement.setAttribute('data-theme', s.theme);
    const app = document.getElementById('app'); app.classList.toggle('collapsed', !!s.sidebarCollapsed);
  }
  function closeDrawer() { document.getElementById('app').classList.remove('drawer-open'); document.getElementById('scrim').hidden = true; }
  function updateStatic() {
    document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
    const net = document.getElementById('netStatus');
    net.textContent = navigator.onLine ? t('online') : t('offline'); net.classList.toggle('offline', !navigator.onLine);
    document.getElementById('langBtn').textContent = SS.i18n.getLang() === 'my' ? 'EN' : 'မြန်';
    SS.i18n.applyStatic(document.body);
    document.title = SS.i18n.getLang() === 'my' ? 'SmartStock — ကုန်ပစ္စည်းစီမံခန့်ခွဲမှု' : 'SmartStock';
  }

  /* ---------- Global search (Phase 1 scope: collections that exist) ---------- */
  function openSearch() {
    const input = el('input', { class: 'input', type: 'search', placeholder: t('search_placeholder'), 'aria-label': 'Global search' });
    const out = el('div', { style: 'margin-top:12px;max-height:50vh;overflow:auto' });
    const draw = () => {
      clear(out); const q = input.value.trim().toLowerCase();
      if (!q) return out.append(el('p', { class: 'muted' }, 'Search products, SKUs, barcodes, categories, customers and suppliers.'));
      const groups = [
        ['Products', 'products', 'products', (p) => [p.name, p.sku, p.barcode]], ['Categories', 'categories', 'categories', (c) => [c.name]],
        ['Customers', 'customers', 'customers', (c) => [c.name, c.phone]], ['Suppliers', 'suppliers', 'suppliers', (s) => [s.name, s.phone]],
        ['Sales', 'sales', 'sales', (s) => [s.number, s.id]], ['Purchases', 'purchases', 'purchases', (p) => [p.number, p.id]]];
      let any = false;
      groups.forEach(([label, key, routeId, fields]) => {
        const hits = SS.storage.read(key).filter((r) => fields(r).some((f) => f && String(f).toLowerCase().includes(q))).slice(0, 5);
        if (!hits.length) return; any = true;
        out.append(el('h2', { class: 'small muted', style: 'margin:10px 0 4px' }, label),
          el('ul', { class: 'list' }, hits.map((r) => el('li', null, el('a', { href: '#/' + routeId, onclick: SS.utils.closeModal }, r.name || r.number || r.id)))));
      });
      if (!any) out.append(el('div', { class: 'empty' }, el('strong', null, 'No matches'), 'Purchase prices are never searchable here.'));
    };
    input.addEventListener('input', SS.utils.debounce(draw, 120));
    SS.utils.openModal({ title: 'Global search', body: el('div', null, input, out) });
    draw();
  }

  function openHelp() {
    const rows = [['Ctrl + K', 'Global search'], ['Ctrl + N', 'New product'], ['Ctrl + S', 'Save current form'], ['F2', 'POS: focus product search'], ['F9', 'POS: checkout'], ['Esc', 'Close dialog'], ['Enter', 'Confirm focused action']];
    SS.utils.openModal({ title: 'Keyboard shortcuts', body: el('div', { class: 'kbd-list' }, rows.flatMap(([k, d]) => [el('kbd', null, k), el('span', null, d)])), actions: [{ label: 'Close' }] });
  }

  function bindEvents() {
    document.getElementById('collapseBtn').addEventListener('click', () => { SS.settings.patch({ sidebarCollapsed: !SS.settings.get().sidebarCollapsed }); applyTheme(); });
    document.getElementById('menuBtn').addEventListener('click', () => { document.getElementById('app').classList.add('drawer-open'); document.getElementById('scrim').hidden = false; });
    document.getElementById('scrim').addEventListener('click', closeDrawer);
    document.getElementById('themeBtn').addEventListener('click', () => { SS.settings.patch({ theme: SS.settings.get().theme === 'dark' ? 'light' : 'dark' }); applyTheme(); });
    document.getElementById('langBtn').addEventListener('click', () => { const l = SS.i18n.getLang() === 'my' ? 'en' : 'my'; SS.i18n.setLang(l); SS.settings.patch({ language: l }); updateStatic(); renderNav(); render(); });
    document.getElementById('searchBtn').addEventListener('click', openSearch);
    document.getElementById('helpBtn').addEventListener('click', openHelp);
    window.addEventListener('hashchange', route);
    const skip = document.querySelector('.skip-link');   // href="#main" would hit the hash router, so focus directly
    if (skip) skip.addEventListener('click', (e) => { e.preventDefault(); main().focus(); });
    window.addEventListener('online', updateStatic); window.addEventListener('offline', updateStatic);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.querySelector('.modal')) return SS.utils.closeModal();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        const f = document.querySelector('.modal form'); const b = document.querySelector('.modal .btn.primary');
        if (f && b) { e.preventDefault(); b.click(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !document.querySelector('.modal')) {
        e.preventDefault(); if (current !== 'products') location.hash = '#/products';
        setTimeout(() => SS.products.openForm(null, () => SS.app.refresh()), 0);
      }
    });
    if (SS.notifications) SS.notifications.onChange(() => renderNav());
    SS.storage.onChange((evt) => {
      if (evt.type === 'external') { SS.utils.toast('Data changed in another tab — refreshed.', 'info'); render(); }
      else if (evt.type === 'conflict') { SS.utils.toast('Another tab changed this data. Latest data loaded; please repeat your action.', 'warning'); render(); }
      else if (evt.type === 'quota') alertSaveFailed('Browser storage is full. Your last change is NOT saved yet. Make a backup now (Backup page — it still works), free some space, then tap “NOT SAVED” at the top to try saving again.');
      else if (evt.type === 'persistfail') alertSaveFailed('Saving to browser storage failed: ' + (evt.error && evt.error.message ? evt.error.message : 'unknown error') + ' Your last change is NOT saved yet. Make a backup now, then tap “NOT SAVED” at the top to try again.');
      else if (evt.type === 'corrupt') SS.utils.toast(`Stored "${evt.key}" data was unreadable. A raw copy was kept; starting that section empty.`, 'error');
      else if (evt.type === 'status') drawSaveState(evt.state);
    });
    document.getElementById('saveState').addEventListener('click', () => SS.storage.retry().then(() => SS.utils.toast('Saved.', 'success')).catch(() => SS.utils.toast('Still could not save. Make a backup and free space.', 'error')));
  }

  let lastAlert = 0;
  function alertSaveFailed(msg) {   // one blocking dialog at a time: a failed save must never go unnoticed
    drawSaveState('unsaved'); if (Date.now() - lastAlert < 15000) return; lastAlert = Date.now();
    SS.utils.openModal({ title: 'Your change was NOT saved', body: el('p', null, msg), actions: [{ label: 'OK' }] });
  }
  function drawSaveState(state) {
    const b = document.getElementById('saveState'); if (!b) return;
    b.hidden = state === 'saved'; b.classList.toggle('bad', state === 'unsaved');
    b.textContent = state === 'unsaved' ? 'NOT SAVED — tap to retry' : state === 'saving' ? 'Saving…' : '';
  }

  async function start() {
    SS.i18n.setLang('en'); SS.i18n.applyStatic(document.body);   // remember the original English of the static shell before translating it
    const res = await SS.storage.init();
    const q = new URLSearchParams(location.search).get('lang');   // ?lang=en|my overrides the saved language (for this load only)
    let saved = 'my'; try { saved = SS.settings.get().language; } catch (e) { /* storage failed: keep the default */ }
    SS.i18n.setLang(q === 'en' || q === 'my' ? q : saved);
    SS.i18n.watch(document.body);
    if (res.errors.length) {
      document.getElementById('main').append(el('div', { class: 'notice danger' }, res.errors.join(' ')));
      if (res.fatal) return;
    }
    if (res.legacy) SS.utils.toast('Your data was moved to the new, larger storage and checked.', 'success');
    res.corrupt.forEach((k) => SS.utils.toast(`Stored "${k}" data was unreadable. A raw copy was kept; starting that section empty.`, 'error'));
    if (SS.pwa) SS.pwa.start();
    const poBack = SS.purchases ? SS.purchases.recover() : 0;
    if (poBack) SS.utils.toast(`${poBack} interrupted purchase(s) were put back to draft. Check Purchases.`, 'warning');
    const rolledBack = SS.sales ? SS.sales.recover() : 0;
    if (rolledBack) SS.utils.toast(`${rolledBack} interrupted sale(s) were rolled back. Check Sales history.`, 'warning');
    bindEvents(); applyTheme(); updateStatic(); route();
  }

  SS.app = { start, refresh: render, applyTheme, openSearch };
  document.addEventListener('DOMContentLoaded', start);
})();
