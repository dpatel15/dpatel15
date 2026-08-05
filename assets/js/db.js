/* ============================================================
   Ledgerly — db.js
   Thin promise-based IndexedDB wrapper.
   Object stores are keyed by string id; most carry a `ws`
   (workspace) index so data is isolated per workspace/tenant.
   ============================================================ */
(function () {
  const L = (window.L = window.L || {});
  const DB_NAME = 'ledgerly';
  const DB_VERSION = 1;

  const STORES = {
    users: { keyPath: 'id', indexes: [{ name: 'email', keyPath: 'email', unique: true }] },
    workspaces: { keyPath: 'id', indexes: [{ name: 'owner', keyPath: 'owner' }] },
    accounts: { keyPath: 'id', indexes: [{ name: 'ws', keyPath: 'ws' }] },
    categories: { keyPath: 'id', indexes: [{ name: 'ws', keyPath: 'ws' }] },
    transactions: { keyPath: 'id', indexes: [{ name: 'ws', keyPath: 'ws' }, { name: 'ws_date', keyPath: ['ws', 'date'] }] },
    budgets: { keyPath: 'id', indexes: [{ name: 'ws', keyPath: 'ws' }] },
    recurring: { keyPath: 'id', indexes: [{ name: 'ws', keyPath: 'ws' }] },
    vendors: { keyPath: 'id', indexes: [{ name: 'ws', keyPath: 'ws' }] },
    receipts: { keyPath: 'id' }, // { id, blobDataUrl } — heavy, kept separate
    meta: { keyPath: 'key' },
  };

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        for (const name in STORES) {
          const spec = STORES[name];
          let store;
          if (!db.objectStoreNames.contains(name)) {
            store = db.createObjectStore(name, { keyPath: spec.keyPath });
          } else {
            store = req.transaction.objectStore(name);
          }
          (spec.indexes || []).forEach((idx) => {
            if (!store.indexNames.contains(idx.name)) {
              store.createIndex(idx.name, idx.keyPath, { unique: !!idx.unique });
            }
          });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode) {
    return open().then((db) => {
      const t = db.transaction(store, mode || 'readonly');
      return { store: t.objectStore(store), done: complete(t) };
    });
  }
  function complete(t) {
    return new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  function reqP(request) {
    return new Promise((res, rej) => {
      request.onsuccess = () => res(request.result);
      request.onerror = () => rej(request.error);
    });
  }

  const DB = {
    async get(store, key) {
      const { store: s } = await tx(store, 'readonly');
      return reqP(s.get(key));
    },
    async getAll(store) {
      const { store: s } = await tx(store, 'readonly');
      return reqP(s.getAll());
    },
    async byIndex(store, index, value) {
      const { store: s } = await tx(store, 'readonly');
      return reqP(s.index(index).getAll(value));
    },
    async oneByIndex(store, index, value) {
      const { store: s } = await tx(store, 'readonly');
      return reqP(s.index(index).get(value));
    },
    async put(store, value) {
      const { store: s, done } = await tx(store, 'readwrite');
      s.put(value);
      await done;
      return value;
    },
    async putMany(store, values) {
      const { store: s, done } = await tx(store, 'readwrite');
      values.forEach((v) => s.put(v));
      await done;
      return values;
    },
    async del(store, key) {
      const { store: s, done } = await tx(store, 'readwrite');
      s.delete(key);
      await done;
    },
    async clear(store) {
      const { store: s, done } = await tx(store, 'readwrite');
      s.clear();
      await done;
    },
    async clearAll() {
      const db = await open();
      const names = Array.from(db.objectStoreNames);
      const t = db.transaction(names, 'readwrite');
      names.forEach((n) => t.objectStore(n).clear());
      await complete(t);
    },
    STORES,
  };

  L.DB = DB;
})();
