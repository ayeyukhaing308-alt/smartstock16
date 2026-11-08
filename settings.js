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
