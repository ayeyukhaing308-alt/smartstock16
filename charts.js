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
