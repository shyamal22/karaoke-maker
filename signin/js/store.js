/* RCK Sign In — storage layer.
   Hours are payroll data, so this layer is deliberately paranoid:
   - IndexedDB is the working store, but everything is also held in memory and
     mirrored to localStorage after every write (two independent copies).
   - If IndexedDB is unavailable (private mode, locked-down tablet) the app keeps
     running on the localStorage mirror alone.
   - Nothing is ever hard-deleted; records are flagged void and kept.
   - Every write is queued in an outbox for optional cloud sync (Apps Script). */
(function () {
  'use strict';

  const DB_NAME = 'rck-signin', DB_VER = 1;
  const MIRROR = 'rck_signin_mirror';       // full snapshot
  const MIRROR_PREV = 'rck_signin_mirror_prev';  // previous snapshot, one generation back
  const STORES = ['employees', 'entries', 'meta', 'audit', 'outbox'];

  const DEFAULTS = {
    siteName: 'RCK Yard',
    adminPin: '1234',
    alertEmail: '',
    syncUrl: '',
    forgotHours: 24,
    longShiftHours: 14,
    askBreak: false,
    askNotes: true,
    idleSeconds: 60,
    lastBackupAt: '',
    deviceName: '',
  };

  let db = null;
  let idbOK = false;
  const cache = { employees: [], entries: [], meta: {}, audit: [], outbox: [] };
  let mirrorTimer = null;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const nowISO = () => new Date().toISOString();

  // ------------------------------------------------------------------ indexeddb
  function openDB() {
    return new Promise(resolve => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { return resolve(null); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('employees')) d.createObjectStore('employees', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('entries')) d.createObjectStore('entries', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('audit')) d.createObjectStore('audit', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }

  function idbAll(store) {
    return new Promise(resolve => {
      try {
        const r = db.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => resolve([]);
      } catch (e) { resolve([]); }
    });
  }

  function idbPut(store, val) {
    if (!idbOK) return;
    try {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).put(val);
      t.onerror = () => { idbOK = false; };
    } catch (e) { idbOK = false; }
  }

  function idbDelete(store, key) {
    if (!idbOK) return;
    try { db.transaction(store, 'readwrite').objectStore(store).delete(key); } catch (e) { /* mirror still holds it */ }
  }

  // ------------------------------------------------------------------- mirror
  function snapshot() {
    return JSON.stringify({
      v: 1, at: nowISO(),
      employees: cache.employees,
      entries: cache.entries,
      meta: cache.meta,
      audit: cache.audit.slice(-2000),
    });
  }

  function writeMirror() {
    mirrorTimer = null;
    try {
      const prev = localStorage.getItem(MIRROR);
      const snap = snapshot();
      localStorage.setItem(MIRROR, snap);
      if (prev) localStorage.setItem(MIRROR_PREV, prev);
    } catch (e) {
      // Storage full — drop the older generation and the audit tail, then retry once.
      try {
        localStorage.removeItem(MIRROR_PREV);
        cache.audit = cache.audit.slice(-500);
        localStorage.setItem(MIRROR, snapshot());
      } catch (e2) { /* IndexedDB and the sync outbox are still carrying the data */ }
    }
  }

  function touchMirror() {
    if (mirrorTimer) return;
    mirrorTimer = setTimeout(writeMirror, 400);
  }

  function readMirror() {
    for (const key of [MIRROR, MIRROR_PREV]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.entries)) return data;
      } catch (e) { /* try the older generation */ }
    }
    return null;
  }

  // --------------------------------------------------------------------- boot
  async function init() {
    db = await openDB();
    idbOK = !!db;

    if (idbOK) {
      const [employees, entries, meta, audit, outbox] = await Promise.all(STORES.map(idbAll));
      cache.employees = employees;
      cache.entries = entries;
      cache.audit = audit;
      cache.outbox = outbox;
      cache.meta = {};
      meta.forEach(m => { cache.meta[m.key] = m.value; });
    }

    // Nothing in IndexedDB (fresh, cleared, or unavailable) — fall back to the mirror.
    if (!cache.entries.length && !cache.employees.length) {
      const m = readMirror();
      if (m) {
        cache.employees = m.employees || [];
        cache.entries = m.entries || [];
        cache.meta = m.meta || {};
        cache.audit = m.audit || [];
        if (idbOK) {
          cache.employees.forEach(e => idbPut('employees', e));
          cache.entries.forEach(e => idbPut('entries', e));
          Object.keys(cache.meta).forEach(k => idbPut('meta', { key: k, value: cache.meta[k] }));
          log('restore', 'Recovered ' + cache.entries.length + ' records from the on-device backup');
        }
      }
    }

    if (!cache.meta.deviceName) setSetting('deviceName', 'Tablet ' + uid().slice(-4).toUpperCase());
    touchMirror();
    return true;
  }

  // ----------------------------------------------------------------- settings
  function settings() {
    return Object.assign({}, DEFAULTS, cache.meta);
  }
  function setSetting(key, value) {
    cache.meta[key] = value;
    idbPut('meta', { key, value });
    touchMirror();
  }

  // ----------------------------------------------------------------- employees
  function employees() {
    return cache.employees.filter(e => !e.void);
  }
  function employeeById(id) {
    return cache.employees.find(e => e.id === id) || null;
  }
  function saveEmployee(emp) {
    const rec = Object.assign({ id: uid(), createdAt: nowISO() }, emp);
    rec.name = (rec.first + ' ' + rec.last).replace(/\s+/g, ' ').trim();
    rec.updatedAt = nowISO();
    const i = cache.employees.findIndex(e => e.id === rec.id);
    if (i >= 0) cache.employees[i] = rec; else cache.employees.push(rec);
    idbPut('employees', rec);
    queue('employee', rec);
    touchMirror();
    return rec;
  }

  // ------------------------------------------------------------------ entries
  function entries() {
    return cache.entries.filter(e => !e.void);
  }
  function entryById(id) {
    return cache.entries.find(e => e.id === id) || null;
  }
  function openEntries() {
    return entries().filter(e => !e.outAt).sort((a, b) => a.inAt.localeCompare(b.inAt));
  }
  function openEntryFor(employeeId) {
    return openEntries().find(e => e.employeeId === employeeId) || null;
  }
  function saveEntry(entry) {
    const rec = Object.assign({ id: uid(), createdAt: nowISO(), rev: 0 }, entry);
    rec.rev = (rec.rev || 0) + 1;
    rec.updatedAt = nowISO();
    rec.device = rec.device || settings().deviceName;
    const i = cache.entries.findIndex(e => e.id === rec.id);
    if (i >= 0) cache.entries[i] = rec; else cache.entries.push(rec);
    idbPut('entries', rec);
    queue('entry', rec);
    touchMirror();
    return rec;
  }
  function voidEntry(id, reason) {
    const rec = entryById(id);
    if (!rec) return null;
    rec.void = true;
    rec.voidReason = reason || '';
    log('void', 'Removed shift for ' + rec.name + ' (' + (reason || 'no reason given') + ')');
    return saveEntry(rec);
  }

  // -------------------------------------------------------------------- audit
  function log(action, detail) {
    const rec = { id: uid(), at: nowISO(), action, detail };
    cache.audit.push(rec);
    idbPut('audit', rec);
    touchMirror();
    return rec;
  }
  function auditLog() {
    return cache.audit.slice().sort((a, b) => b.at.localeCompare(a.at));
  }

  // --------------------------------------------------------------------- sync
  // Outbox rows are upserts keyed by record id, so re-sending is always safe.
  function queue(kind, rec) {
    const item = { id: kind + ':' + rec.id, kind, recId: rec.id, at: nowISO(), sent: false };
    const i = cache.outbox.findIndex(o => o.id === item.id);
    if (i >= 0) cache.outbox[i] = item; else cache.outbox.push(item);
    idbPut('outbox', item);
    scheduleFlush();
  }

  let flushTimer = null;
  function scheduleFlush() {
    if (flushTimer || !settings().syncUrl) return;
    flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 2500);
  }

  function payloadFor(item) {
    if (item.kind === 'entry') return entryById(item.recId);
    if (item.kind === 'employee') return employeeById(item.recId);
    return null;
  }

  async function post(url, payload) {
    const body = JSON.stringify(payload);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
      });
      return res.ok;
    } catch (e) {
      // Apps Script endpoints often reject the CORS preflight; the opaque
      // no-cors POST still reaches the script, we just can't read the reply.
      try {
        await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
        return true;
      } catch (e2) { return false; }
    }
  }

  let flushing = false;
  async function flush(force) {
    const s = settings();
    if (!s.syncUrl || flushing || !navigator.onLine) return { sent: 0, pending: pendingCount() };
    flushing = true;
    const batch = cache.outbox.filter(o => force || !o.sent).slice(0, 200);
    let sent = 0;
    if (batch.length) {
      const records = batch.map(o => ({ kind: o.kind, data: payloadFor(o) })).filter(r => r.data);
      const ok = await post(s.syncUrl, { type: 'records', device: s.deviceName, site: s.siteName, records });
      if (ok) {
        batch.forEach(o => { o.sent = true; o.sentAt = nowISO(); idbPut('outbox', o); });
        sent = records.length;
        setSetting('lastSyncAt', nowISO());
      }
    }
    flushing = false;
    return { sent, pending: pendingCount() };
  }

  function pendingCount() {
    return cache.outbox.filter(o => !o.sent).length;
  }

  async function resyncAll() {
    cache.entries.forEach(e => queue('entry', e));
    cache.employees.forEach(e => queue('employee', e));
    return flush(true);
  }

  async function sendAlerts(alerts) {
    const s = settings();
    if (!s.syncUrl || !alerts.length) return false;
    return post(s.syncUrl, {
      type: 'alerts', device: s.deviceName, site: s.siteName,
      email: s.alertEmail, alerts,
    });
  }

  // ------------------------------------------------------------ backup / restore
  function exportAll() {
    return {
      app: 'rck-signin', v: 1, exportedAt: nowISO(),
      employees: cache.employees, entries: cache.entries,
      meta: cache.meta, audit: cache.audit,
    };
  }

  function importAll(data, mode) {
    if (!data || data.app !== 'rck-signin') throw new Error('That file is not an RCK Sign In backup.');
    const merge = mode !== 'replace';
    if (!merge) { cache.employees = []; cache.entries = []; }
    let added = 0, updated = 0;
    (data.employees || []).forEach(e => {
      const i = cache.employees.findIndex(x => x.id === e.id);
      if (i < 0) { cache.employees.push(e); added++; } else if ((e.updatedAt || '') > (cache.employees[i].updatedAt || '')) { cache.employees[i] = e; updated++; }
      idbPut('employees', e);
    });
    (data.entries || []).forEach(e => {
      const i = cache.entries.findIndex(x => x.id === e.id);
      if (i < 0) { cache.entries.push(e); added++; } else if ((e.updatedAt || '') > (cache.entries[i].updatedAt || '')) { cache.entries[i] = e; updated++; }
      idbPut('entries', e);
    });
    if (!merge && data.meta) { Object.keys(data.meta).forEach(k => setSetting(k, data.meta[k])); }
    log('import', 'Restored backup — ' + added + ' new, ' + updated + ' updated');
    touchMirror();
    return { added, updated };
  }

  function storageHealth() {
    let mirrorAt = '';
    const m = readMirror();
    if (m) mirrorAt = m.at || '';
    return {
      idb: idbOK,
      mirrorAt,
      entries: entries().length,
      employees: employees().length,
      pending: pendingCount(),
      lastSyncAt: cache.meta.lastSyncAt || '',
      lastBackupAt: cache.meta.lastBackupAt || '',
    };
  }

  window.Store = {
    init, uid, nowISO,
    settings, setSetting, DEFAULTS,
    employees, employeeById, saveEmployee,
    entries, entryById, openEntries, openEntryFor, saveEntry, voidEntry,
    log, auditLog,
    flush, resyncAll, sendAlerts, pendingCount,
    exportAll, importAll, storageHealth,
    forceMirror: writeMirror,
  };
})();
