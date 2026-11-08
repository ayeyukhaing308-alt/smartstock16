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
