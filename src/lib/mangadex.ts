/**
 * mangadex.ts — MangaDex API Client
 *
 * Provides functionality to interact with the MangaDex API for manga search,
 * chapter listing, and content fetching.
 *
 * Note: MangaDex is a manga hosting platform, not an AI service.
 * This module is for fetching manga content, not for AI text processing.
 */

import { MANGADEX_API_URL } from './config';

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface MangaDexManga {
    id: string;
    type: string;
    attributes: {
        title: Record<string, string>;
        altTitles: Array<Record<string, string>>;
        description: Record<string, string>;
        status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
        year: number | null;
        contentRating: 'safe' | 'suggestive' | 'erotica' | 'pornographic';
        tags: Array<{
            id: string;
            attributes: { name: Record<string, string> };
        }>;
        originalLanguage: string;
        lastChapter: string | null;
        lastVolume: string | null;
    };
    relationships: Array<{
        id: string;
        type: string;
        attributes?: Record<string, unknown>;
    }>;
}

export interface MangaDexChapter {
    id: string;
    type: string;
    attributes: {
        volume: string | null;
        chapter: string | null;
        title: string | null;
        translatedLanguage: string;
        pages: number;
        publishAt: string;
        createdAt: string;
        updatedAt: string;
    };
    relationships: Array<{
        id: string;
        type: string;
        attributes?: Record<string, unknown>;
    }>;
}

interface MangaDexSearchResult {
    data: MangaDexManga[];
    total: number;
    limit: number;
    offset: number;
}

interface MangaDexChapterList {
    data: MangaDexChapter[];
    total: number;
    limit: number;
    offset: number;
}

interface MangaDexError {
    result: 'error';
    errors: Array<{
        id: string;
        status: number;
        title: string;
        detail: string;
    }>;
}

// ─── API CLIENT ─────────────────────────────────────────────────────────────

/**
 * Search for manga on MangaDex
 */
export async function searchManga(
    query: string,
    options: {
        limit?: number;
        offset?: number;
        contentRating?: Array<'safe' | 'suggestive' | 'erotica' | 'pornographic'>;
        order?: { relevance?: 'asc' | 'desc'; latestUploadedChapter?: 'asc' | 'desc' };
    } = {},
): Promise<MangaDexSearchResult> {
    const { limit = 10, offset = 0, contentRating = ['safe', 'suggestive'] } = options;

    const params = new URLSearchParams({
        title: query,
        limit: String(limit),
        offset: String(offset),
        'includes[]': 'cover_art',
    });

    contentRating.forEach(rating => {
        params.append('contentRating[]', rating);
    });

    const response = await fetch(`${MANGADEX_API_URL}/manga?${params}`, {
        signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
        let detail = response.statusText;
        try {
            const error = (await response.json()) as MangaDexError;
            detail = error.errors?.[0]?.detail || detail;
        } catch {
            /* non-JSON error body */
        }
        throw new Error(`MangaDex API error: ${detail}`);
    }

    return response.json();
}

/**
 * Get manga details by ID
 */
export async function getMangaDetails(mangaId: string): Promise<MangaDexManga> {
    const params = new URLSearchParams({
        'includes[]': 'cover_art',
    });

    const response = await fetch(`${MANGADEX_API_URL}/manga/${mangaId}?${params}`, {
        signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
        let detail = response.statusText;
        try {
            const error = (await response.json()) as MangaDexError;
            detail = error.errors?.[0]?.detail || detail;
        } catch {
            /* non-JSON error body */
        }
        throw new Error(`MangaDex API error: ${detail}`);
    }

    const result = await response.json();
    return result.data;
}

/**
 * Get chapters for a manga
 */
export async function getMangaChapters(
    mangaId: string,
    options: {
        limit?: number;
        offset?: number;
        translatedLanguage?: string[];
        order?: { chapter?: 'asc' | 'desc'; publishAt?: 'asc' | 'desc' };
    } = {},
): Promise<MangaDexChapterList> {
    const { limit = 100, offset = 0, translatedLanguage = ['en'] } = options;

    const params = new URLSearchParams({
        manga: mangaId,
        limit: String(limit),
        offset: String(offset),
        'order[chapter]': 'asc',
    });

    translatedLanguage.forEach(lang => {
        params.append('translatedLanguage[]', lang);
    });

    const response = await fetch(`${MANGADEX_API_URL}/chapter?${params}`, {
        signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
        let detail = response.statusText;
        try {
            const error = (await response.json()) as MangaDexError;
            detail = error.errors?.[0]?.detail || detail;
        } catch {
            /* non-JSON error body */
        }
        throw new Error(`MangaDex API error: ${detail}`);
    }

    return response.json();
}

/**
 * Get the preferred title from a manga's title object
 */
export function getPreferredTitle(
    titles: Record<string, string>,
    preferredLanguage = 'en',
): string {
    return (
        titles[preferredLanguage] ||
        titles['en'] ||
        titles['ja-ro'] ||
        titles['ja'] ||
        Object.values(titles)[0] ||
        'Untitled'
    );
}
