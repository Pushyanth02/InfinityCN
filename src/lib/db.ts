/**
 * IndexedDB persistence layer — the local-first backbone.
 * Every store is keyed by `id`; secondary lookups use indexes where they
 * matter (userId / documentId / createdAt) and fall back to in-memory
 * filtering for everything else.
 */

const DB_NAME = "lemniscate";
const DB_VERSION = 3;

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

/** Secondary indexes per store: name → key path. Created idempotently on
 *  every version bump so upgrades from any prior version converge. */
const INDEXES: Partial<Record<StoreName, { name: string; path: string }[]>> = {
  documents: [{ name: "by_user", path: "userId" }],
  bookmarks: [
    { name: "by_user", path: "userId" },
    { name: "by_doc", path: "documentId" },
  ],
  annotations: [
    { name: "by_user", path: "userId" },
    { name: "by_doc", path: "documentId" },
  ],
  scenes: [
    { name: "by_user", path: "userId" },
    { name: "by_doc", path: "documentId" },
  ],
  activity: [
    { name: "by_user", path: "userId" },
    { name: "by_ts", path: "createdAt" },
  ],
  usage: [{ name: "by_user", path: "userId" }],
  stories: [{ name: "by_user", path: "userId" }],
  jobs: [
    { name: "by_user", path: "userId" },
    { name: "by_doc", path: "documentId" },
  ],
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const tx = req.transaction!;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: "id" });
          }
          const os = tx.objectStore(s);
          for (const idx of INDEXES[s] ?? []) {
            if (!os.indexNames.contains(idx.name)) {
              os.createIndex(idx.name, idx.path, { unique: false });
            }
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(req.error ?? new Error("Failed to open local database"));
    });
  }
  return dbPromise;
}

function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (os: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () =>
          reject(req.error ?? new Error(`IndexedDB ${store} operation failed`));
        // A transaction abort fires onabort, not onerror — without this the
        // promise would hang forever if the transaction is aborted (e.g. by
        // a quota error or an unhandled request error in a multi-op tx).
        t.onabort = () =>
          reject(
            t.error ?? new Error(`IndexedDB ${store} transaction aborted`),
          );
      }),
  );
}

export interface Row {
  id: string;
}

export function idbAll<T extends Row>(store: StoreName): Promise<T[]> {
  return tx<T[]>(store, "readonly", (os) => os.getAll());
}

export function idbGet<T extends Row>(
  store: StoreName,
  id: string,
): Promise<T | undefined> {
  return tx<T | undefined>(store, "readonly", (os) => os.get(id));
}

export function idbPut<T extends Row>(
  store: StoreName,
  value: T,
): Promise<void> {
  return tx<IDBValidKey>(store, "readwrite", (os) => os.put(value)).then(
    () => undefined,
  );
}

export function idbBulkPut<T extends Row>(
  store: StoreName,
  values: T[],
): Promise<void> {
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
      }),
  );
}

export function idbDelete(store: StoreName, id: string): Promise<void> {
  return tx<undefined>(store, "readwrite", (os) => os.delete(id)).then(
    () => undefined,
  );
}

export function idbClear(store: StoreName): Promise<void> {
  return tx<undefined>(store, "readwrite", (os) => os.clear()).then(
    () => undefined,
  );
}

export async function idbWhere<T extends Row>(
  store: StoreName,
  pred: (row: T) => boolean,
): Promise<T[]> {
  const all = await idbAll<T>(store);
  return all.filter(pred);
}

/** Fetch rows matching an indexed key (e.g. by_user → userId). Falls back to
 *  an in-memory scan if the index doesn't exist yet (pre-upgrade DB). */
export async function idbByIndex<T extends Row>(
  store: StoreName,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  const db = await openDb();
  const os = db.transaction(store, "readonly").objectStore(store);
  if (!os.indexNames.contains(indexName)) return idbWhere<T>(store, () => true);
  return tx<T[]>(store, "readonly", (os2) =>
    os2.index(indexName).getAll(value),
  );
}

/* ---------------- session identity ---------------- */

/** localStorage keys for the anonymous local identity. Exported so other
 *  surfaces (e.g. Settings' "rotate identity" action) never duplicate the
 *  literals. */
export const UID_KEY = "lemniscate:uid";
export const UID_CREATED_KEY = "lemniscate:uid-created";

/** Anonymous signed-style local identity. All rows are stamped with it so
 *  data access is always filtered by owner — mirroring server-side isolation.
 *  Uses crypto.randomUUID() (CSPRNG) when available; falls back to the
 *  legacy Math.random scheme only in environments without Web Crypto. */
export function getUserId(): string {
  let id = localStorage.getItem(UID_KEY);
  if (!id) {
    const cryptoObj =
      typeof globalThis.crypto !== "undefined" ? globalThis.crypto : null;
    if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
      id = `anon_${cryptoObj.randomUUID()}`;
    } else {
      id = `anon_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    }
    localStorage.setItem(UID_KEY, id);
    localStorage.setItem(UID_CREATED_KEY, String(Date.now()));
  }
  return id;
}

export function getUserIdentity(): { id: string; createdAt: number } {
  const id = getUserId();
  return {
    id,
    createdAt: Number(localStorage.getItem(UID_CREATED_KEY) ?? Date.now()),
  };
}
