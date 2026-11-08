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
