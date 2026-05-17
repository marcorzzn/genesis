/**
 * @module Persistence
 * @description IndexedDB wrapper for Genesis state persistence.
 * Supports snapshots, delta compression, auto-save, and phylogenetic data.
 */

const DB_NAME = 'genesis_simulation';
const DB_VERSION = 1;
const STORES = { STATE: 'simulation_state', SNAPSHOTS: 'snapshots', PHYLOGENY: 'phylogeny' };

class PersistenceManager {
  constructor() {
    this._db = null;
    this._initialized = false;
    this._autoSaveInterval = null;
    this._lastSavedState = null;
    this._autoSaveIntervalMs = 5 * 60 * 1000;
  }

  async init() {
    if (this._initialized) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORES.STATE))
          db.createObjectStore(STORES.STATE, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(STORES.SNAPSHOTS)) {
          const s = db.createObjectStore(STORES.SNAPSHOTS, { keyPath: 'id' });
          s.createIndex('simTime', 'simTime', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.PHYLOGENY)) {
          const s = db.createObjectStore(STORES.PHYLOGENY, { keyPath: 'id' });
          s.createIndex('parentId', 'parentId', { unique: false });
        }
      };
      request.onsuccess = (e) => { this._db = e.target.result; this._initialized = true; resolve(); };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async _ensureInit() { if (!this._initialized) await this.init(); }

  async saveState(state) {
    await this._ensureInit();
    const tx = this._db.transaction(STORES.STATE, 'readwrite');
    tx.objectStore(STORES.STATE).put({ key: 'current', state, savedAt: Date.now() });
    this._lastSavedState = state;
    return new Promise((r, j) => { tx.oncomplete = r; tx.onerror = () => j(tx.error); });
  }

  async loadState() {
    await this._ensureInit();
    const tx = this._db.transaction(STORES.STATE, 'readonly');
    const req = tx.objectStore(STORES.STATE).get('current');
    return new Promise((r, j) => {
      req.onsuccess = () => { const v = req.result; this._lastSavedState = v?.state ?? null; r(v?.state ?? null); };
      req.onerror = () => j(req.error);
    });
  }

  async createSnapshot(state, label = '') {
    await this._ensureInit();
    const id = `snap_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const snapshot = { id, simTime: state.eventBus?.simTime ?? 0, realTime: Date.now(), label, state };
    const tx = this._db.transaction(STORES.SNAPSHOTS, 'readwrite');
    tx.objectStore(STORES.SNAPSHOTS).put(snapshot);
    this._lastSavedState = state;
    return new Promise((r, j) => { tx.oncomplete = () => r(id); tx.onerror = () => j(tx.error); });
  }

  async loadSnapshot(id) {
    await this._ensureInit();
    const tx = this._db.transaction(STORES.SNAPSHOTS, 'readonly');
    const req = tx.objectStore(STORES.SNAPSHOTS).get(id);
    return new Promise((r, j) => { req.onsuccess = () => r(req.result ?? null); req.onerror = () => j(req.error); });
  }

  async listSnapshots() {
    await this._ensureInit();
    const tx = this._db.transaction(STORES.SNAPSHOTS, 'readonly');
    const req = tx.objectStore(STORES.SNAPSHOTS).openCursor(null, 'prev');
    const results = [];
    return new Promise((r, j) => {
      req.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { const { id, simTime, realTime, label } = c.value; results.push({ id, simTime, realTime, label }); c.continue(); }
        else r(results);
      };
      req.onerror = () => j(req.error);
    });
  }

  async deleteSnapshot(id) {
    await this._ensureInit();
    const tx = this._db.transaction(STORES.SNAPSHOTS, 'readwrite');
    tx.objectStore(STORES.SNAPSHOTS).delete(id);
    return new Promise((r, j) => { tx.oncomplete = r; tx.onerror = () => j(tx.error); });
  }

  async savePhylogenyEvent(event) {
    await this._ensureInit();
    const tx = this._db.transaction(STORES.PHYLOGENY, 'readwrite');
    tx.objectStore(STORES.PHYLOGENY).put(event);
    return new Promise((r, j) => { tx.oncomplete = r; tx.onerror = () => j(tx.error); });
  }

  async getPhylogenyChildren(parentId) {
    await this._ensureInit();
    const tx = this._db.transaction(STORES.PHYLOGENY, 'readonly');
    const req = tx.objectStore(STORES.PHYLOGENY).index('parentId').getAll(parentId);
    return new Promise((r, j) => { req.onsuccess = () => r(req.result ?? []); req.onerror = () => j(req.error); });
  }

  startAutoSave(getStateFn, intervalMs) {
    this.stopAutoSave();
    this._autoSaveInterval = setInterval(async () => {
      try { await this.saveState(getStateFn()); } catch (e) { console.error('[Persistence] Auto-save failed:', e); }
    }, intervalMs ?? this._autoSaveIntervalMs);
  }

  stopAutoSave() {
    if (this._autoSaveInterval !== null) { clearInterval(this._autoSaveInterval); this._autoSaveInterval = null; }
  }

  async clearAll() {
    await this._ensureInit();
    const names = Object.values(STORES);
    const tx = this._db.transaction(names, 'readwrite');
    for (const n of names) tx.objectStore(n).clear();
    this._lastSavedState = null;
    return new Promise((r, j) => { tx.oncomplete = r; tx.onerror = () => j(tx.error); });
  }
}

const persistence = new PersistenceManager();
export default persistence;
export { PersistenceManager };
