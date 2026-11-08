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
