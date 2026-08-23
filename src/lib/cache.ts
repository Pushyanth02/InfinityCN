/**
 * TTL cache persisted in IndexedDB (`aiCache` store).
 *
 * Used for expensive, reusable AI artifacts: study sets, deep analyses,
 * the OpenRouter model catalog. Keys are namespaced and versioned so a
 * schema change simply orphans old entries instead of breaking them.
 */
import { idbAll, idbClear, idbDelete, idbGet, idbPut } from "./db";

interface CacheRow {
  id: string;
  value: unknown;
  expiresAt: number;
  createdAt: number;
}

const P = "c:";

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const row = await idbGet<CacheRow>("aiCache", P + key);
    if (!row) return null;
    if (row.expiresAt < Date.now()) {
      void idbDelete("aiCache", row.id);
      return null;
    }
    return row.value as T;
  } catch {
    return null;
  }
}

/** Same as cacheGet, but also returns the cache row's createdAt (epoch ms)
 *  so callers can implement stale-while-revalidate. */
export async function cacheGetWithMeta<T>(
  key: string,
): Promise<{ value: T; createdAt: number; expiresAt: number } | null> {
  try {
    const row = await idbGet<CacheRow>("aiCache", P + key);
    if (!row) return null;
    if (row.expiresAt < Date.now()) {
      void idbDelete("aiCache", row.id);
      return null;
    }
    return {
      value: row.value as T,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlMs: number,
): Promise<void> {
  try {
    await idbPut("aiCache", {
      id: P + key,
      value,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
    });
  } catch {
    /* cache is best-effort */
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await idbDelete("aiCache", P + key);
  } catch {
    /* ignore */
  }
}

export async function cacheClearAll(): Promise<void> {
  try {
    await idbClear("aiCache");
  } catch {
    /* ignore */
  }
}

/** Purge every cached artifact belonging to a document (study sets, deep
 *  analyses, scene cards, Ouro artifacts). Called by `deleteDocument` so
 *  orphaned entries don't linger until their TTL expires. Best-effort. */
export async function cachePurgeDoc(docId: string): Promise<void> {
  try {
    const rows = await idbAll<CacheRow>("aiCache");
    const doomed = rows.filter((r) => r.id.includes(`:${docId}:`));
    for (const d of doomed) await idbDelete("aiCache", d.id);
  } catch {
    /* cache is best-effort */
  }
}

export async function cacheStats(): Promise<{
  entries: number;
  bytes: number;
}> {
  try {
    const rows = await idbAll<CacheRow>("aiCache");
    const bytes = rows.reduce((a, r) => a + JSON.stringify(r.value).length, 0);
    return { entries: rows.length, bytes };
  } catch {
    return { entries: 0, bytes: 0 };
  }
}

/* ---------------- well-known keys ---------------- */

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export const studyKey = (
  docId: string,
  scope: string,
  updatedAt: number,
): string => `study:v2:${docId}:${scope}:${updatedAt}`;

export const analysisKey = (docId: string, updatedAt: number): string =>
  `analysis:v2:${docId}:${updatedAt}`;

export const MODELS_KEY = "models:v3";
