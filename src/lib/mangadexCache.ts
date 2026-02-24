/**
 * mangadexCache.ts — Caching layer for MangaDex API responses
 * 
 * Provides IndexedDB-based caching for manga data, chapters, and cover images.
 * Supports offline browsing of previously fetched content.
 */

import Dexie, { type Table } from 'dexie';
import type { MangaDexManga, MangaDexChapter } from './mangadex';

// ─── CACHE TYPES ────────────────────────────────────────────────────────────

export interface CachedManga {
    id: string;
    data: MangaDexManga;
    coverUrl: string | null;
    fetchedAt: number;
    /** Locally generated or AI-enhanced synopsis */
    generatedSynopsis?: string;
    /** Locally generated codex/metadata */
    generatedCodex?: MangaCodex;
}

export interface CachedChapterList {
    mangaId: string;
    chapters: MangaDexChapter[];
    total: number;
    fetchedAt: number;
}

export interface CachedSearchResult {
    query: string;
    mangaIds: string[];
    total: number;
    fetchedAt: number;
}

export interface MangaCodex {
    genres: string[];
    themes: string[];
    targetAudience: string;
    contentWarnings: string[];
    estimatedLength: 'oneshot' | 'short' | 'medium' | 'long' | 'epic';
    readingTime: string;
    similarTo: string[];
    mood: string;
    narrativeStyle: string;
}

// ─── DATABASE ───────────────────────────────────────────────────────────────

class MangaDexCacheDB extends Dexie {
    manga!: Table<CachedManga>;
    chapters!: Table<CachedChapterList>;
    searches!: Table<CachedSearchResult>;

    constructor() {
        super('MangaDexCache');
        this.version(1).stores({
            manga: 'id, fetchedAt',
            chapters: 'mangaId, fetchedAt',
            searches: 'query, fetchedAt',
        });
    }
}

export const cacheDb = new MangaDexCacheDB();

// Cache TTL in milliseconds
const CACHE_TTL = {
    manga: 24 * 60 * 60 * 1000,      // 24 hours for manga details
    chapters: 6 * 60 * 60 * 1000,    // 6 hours for chapter list
    search: 30 * 60 * 1000,          // 30 minutes for search results
};

// ─── CACHE OPERATIONS ───────────────────────────────────────────────────────

/**
 * Check if a cached entry is still valid
 */
function isValid(fetchedAt: number, ttl: number): boolean {
    return Date.now() - fetchedAt < ttl;
}

/**
 * Get cached manga by ID
 */
export async function getCachedManga(id: string): Promise<CachedManga | null> {
    const cached = await cacheDb.manga.get(id);
    if (cached && isValid(cached.fetchedAt, CACHE_TTL.manga)) {
        return cached;
    }
    return null;
}

/**
 * Cache manga data
 */
export async function cacheManga(
    manga: MangaDexManga,
    coverUrl: string | null
): Promise<void> {
    await cacheDb.manga.put({
        id: manga.id,
        data: manga,
        coverUrl,
        fetchedAt: Date.now(),
    });
}

/**
 * Update manga with generated content
 */
export async function updateMangaGenerated(
    mangaId: string,
    updates: { generatedSynopsis?: string; generatedCodex?: MangaCodex }
): Promise<void> {
    await cacheDb.manga.update(mangaId, updates);
}

/**
 * Get cached chapters for a manga
 */
export async function getCachedChapters(mangaId: string): Promise<CachedChapterList | null> {
    const cached = await cacheDb.chapters.get(mangaId);
    if (cached && isValid(cached.fetchedAt, CACHE_TTL.chapters)) {
        return cached;
    }
    return null;
}

/**
 * Cache chapter list
 */
export async function cacheChapters(
    mangaId: string,
    chapters: MangaDexChapter[],
    total: number
): Promise<void> {
    await cacheDb.chapters.put({
        mangaId,
        chapters,
        total,
        fetchedAt: Date.now(),
    });
}

/**
 * Get cached search results
 */
export async function getCachedSearch(query: string): Promise<CachedSearchResult | null> {
    const cached = await cacheDb.searches.get(query.toLowerCase().trim());
    if (cached && isValid(cached.fetchedAt, CACHE_TTL.search)) {
        return cached;
    }
    return null;
}

/**
 * Cache search results (stores manga IDs, actual manga data cached separately)
 */
export async function cacheSearch(
    query: string,
    mangaIds: string[],
    total: number
): Promise<void> {
    await cacheDb.searches.put({
        query: query.toLowerCase().trim(),
        mangaIds,
        total,
        fetchedAt: Date.now(),
    });
}

/**
 * Get multiple manga by IDs (for reconstructing search results from cache)
 */
export async function getCachedMangaByIds(ids: string[]): Promise<CachedManga[]> {
    const results = await cacheDb.manga.bulkGet(ids);
    return results.filter((m): m is CachedManga => m !== undefined);
}

/**
 * Get all cached manga (for offline browsing)
 */
export async function getAllCachedManga(): Promise<CachedManga[]> {
    return cacheDb.manga.orderBy('fetchedAt').reverse().limit(100).toArray();
}

/**
 * Clear expired cache entries
 */
export async function clearExpiredCache(): Promise<void> {
    const now = Date.now();
    
    await cacheDb.manga
        .where('fetchedAt')
        .below(now - CACHE_TTL.manga * 2)
        .delete();
    
    await cacheDb.chapters
        .where('fetchedAt')
        .below(now - CACHE_TTL.chapters * 2)
        .delete();
    
    await cacheDb.searches
        .where('fetchedAt')
        .below(now - CACHE_TTL.search * 2)
        .delete();
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
    mangaCount: number;
    chaptersCount: number;
    searchesCount: number;
}> {
    const [mangaCount, chaptersCount, searchesCount] = await Promise.all([
        cacheDb.manga.count(),
        cacheDb.chapters.count(),
        cacheDb.searches.count(),
    ]);
    return { mangaCount, chaptersCount, searchesCount };
}

/**
 * Clear all cache
 */
export async function clearAllCache(): Promise<void> {
    await Promise.all([
        cacheDb.manga.clear(),
        cacheDb.chapters.clear(),
        cacheDb.searches.clear(),
    ]);
}
