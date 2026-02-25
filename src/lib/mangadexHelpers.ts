/**
 * mangadexHelpers.ts — Shared helpers for MangaDex hooks
 *
 * Extracted from useMangaSearch.ts and useMangaDetail.ts to eliminate duplication.
 */

import { getPreferredTitle, type MangaDexManga } from './mangadex';
import { cacheManga as cacheMangaSingle, cacheDb, type CachedManga } from './mangadexCache';
import type { MangaWithMeta } from '../hooks/useMangaDex';

export function extractCoverUrl(manga: MangaDexManga): string | null {
    const coverRel = manga.relationships.find(r => r.type === 'cover_art');
    if (coverRel?.attributes) {
        const fileName = (coverRel.attributes as { fileName?: string }).fileName;
        if (fileName) {
            return `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.256.jpg`;
        }
    }
    return null;
}

export function toMangaWithMeta(manga: MangaDexManga, cached?: CachedManga | null): MangaWithMeta {
    const coverUrl = cached?.coverUrl ?? extractCoverUrl(manga);
    const existingSynopsis = getPreferredTitle(manga.attributes.description || {}, 'en');

    return {
        manga,
        coverUrl,
        title: getPreferredTitle(manga.attributes.title),
        synopsis: cached?.generatedSynopsis ?? existingSynopsis ?? '',
        codex: cached?.generatedCodex ?? null,
        isEnriched: !!(cached?.generatedSynopsis || cached?.generatedCodex),
    };
}

/**
 * Batch-cache multiple manga in a single IndexedDB transaction.
 * Replaces sequential `cacheManga()` calls in search loops.
 */
export async function bulkCacheManga(
    items: Array<{ manga: MangaDexManga; coverUrl: string | null }>,
): Promise<string[]> {
    if (items.length === 0) return [];

    const now = Date.now();
    const records = items.map(({ manga, coverUrl }) => ({
        id: manga.id,
        data: manga,
        coverUrl,
        fetchedAt: now,
    }));

    try {
        await cacheDb.manga.bulkPut(records);
    } catch {
        // Fallback to sequential writes if bulk fails
        for (const item of items) {
            await cacheMangaSingle(item.manga, item.coverUrl).catch(() => {});
        }
    }

    return items.map(i => i.manga.id);
}
