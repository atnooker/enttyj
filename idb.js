/**
 * idb.js - IndexedDB Promise 封装
 * 零依赖，浏览器原生支持
 * 导出全局变量 idb
 */
(function (global) {
  const idb = {
    _db: null,
    DB_NAME: 'WordMasterDBYJ',
    DB_VERSION: 1,               // 需要改结构时+1
    STORE_CONFIG: 'config',
    STORE_VOCABS: 'vocabularies',
    STORE_PROGRESS: 'dailyProgress',

    async _ensureDB() {
      if (this._db) return this._db;
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve((this._db = req.result));
        req.onupgradeneeded = e => {
          const db = e.target.result;
          [this.STORE_CONFIG, this.STORE_VOCABS, this.STORE_PROGRESS]
            .forEach(name => {
              if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
              db.createObjectStore(name, { keyPath: null }); // out-of-line
            });
        };
      });
    },

    async get(store, key) {
      const db = await this._ensureDB();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, 'readonly');
        const rq = tx.objectStore(store).get(key);
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
    },

    async set(store, key, value) {
      const db = await this._ensureDB();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    }
  };

  // 暴露到全局
  global.idb = idb;
})(typeof window !== 'undefined' ? window : this);