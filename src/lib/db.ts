/**
 * IndexedDB persistence layer — the local-first backbone.
 * Every store is keyed by `id`; secondary lookups filter in memory
 * (collections stay small enough that this is fast and simple).
 */

const DB_NAME = "lemniscate";
const DB_VERSION = 2;

export const STORES = [
  "documents",
  "bookmarks",
  "annotations",
  "scenes",
  "activity",
  "usage",
  "stories",
  "jobs",
  "aiCache",
] as const;

export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: "id" });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Failed to open local database"));
    });
  }
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, run: (os: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error ?? new Error(`IndexedDB ${store} operation failed`));
        // A transaction abort fires onabort, not onerror — without this the
        // promise would hang forever if the transaction is aborted (e.g. by
        // a quota error or an unhandled request error in a multi-op tx).
        t.onabort = () => reject(t.error ?? new Error(`IndexedDB ${store} transaction aborted`));
      })
  );
}

export interface Row {
  id: string;
}

export function idbAll<T extends Row>(store: StoreName): Promise<T[]> {
  return tx<T[]>(store, "readonly", (os) => os.getAll());
}

export function idbGet<T extends Row>(store: StoreName, id: string): Promise<T | undefined> {
  return tx<T | undefined>(store, "readonly", (os) => os.get(id));
}

export function idbPut<T extends Row>(store: StoreName, value: T): Promise<void> {
  return tx<IDBValidKey>(store, "readwrite", (os) => os.put(value)).then(() => undefined);
}

export function idbBulkPut<T extends Row>(store: StoreName, values: T[]): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(store, "readwrite");
        const os = t.objectStore(store);
        for (const v of values) os.put(v);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error ?? new Error("Bulk write failed"));
        // An abort (e.g. quota exceeded or a failed request) fires onabort,
        // not onerror — without this handler the promise would hang forever.
        t.onabort = () => reject(t.error ?? new Error("Bulk write aborted"));
      })
  );
}

export function idbDelete(store: StoreName, id: string): Promise<void> {
  return tx<undefined>(store, "readwrite", (os) => os.delete(id)).then(() => undefined);
}

export function idbClear(store: StoreName): Promise<void> {
  return tx<undefined>(store, "readwrite", (os) => os.clear()).then(() => undefined);
}

export async function idbWhere<T extends Row>(store: StoreName, pred: (row: T) => boolean): Promise<T[]> {
  const all = await idbAll<T>(store);
  return all.filter(pred);
}

/* ---------------- session identity ---------------- */

const UID_KEY = "lemniscate:uid";
const UID_CREATED_KEY = "lemniscate:uid-created";

/** Anonymous signed-style local identity. All rows are stamped with it so
 *  data access is always filtered by owner — mirroring server-side isolation. */
export function getUserId(): string {
  let id = localStorage.getItem(UID_KEY);
  if (!id) {
    id = `anon_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    localStorage.setItem(UID_KEY, id);
    localStorage.setItem(UID_CREATED_KEY, String(Date.now()));
  }
  return id;
}

export function getUserIdentity(): { id: string; createdAt: number } {
  const id = getUserId();
  return { id, createdAt: Number(localStorage.getItem(UID_CREATED_KEY) ?? Date.now()) };
}
