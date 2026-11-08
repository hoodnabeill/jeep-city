/** Minimal key–value store on IndexedDB (works the same in Tauri, a PWA and a phone wrapper). Never throws. */
const DB = "jc-local", STORE = "kv";
let dbp: Promise<IDBDatabase> | null = null;

function open() {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((resolve) => {
    const q = fn(db.transaction(STORE, mode).objectStore(STORE));
    q.onsuccess = () => resolve(q.result as T);
    q.onerror = () => resolve(undefined);
  })).catch(() => undefined);
}

export const kvGet = <T,>(key: string) => run<T>("readonly", (s) => s.get(key));
export const kvSet = (key: string, value: unknown) => run("readwrite", (s) => s.put(value, key));
export const kvClear = () => run("readwrite", (s) => s.clear());
