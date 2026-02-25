/**
 * useMangaSearch.ts — Search-related state and actions for MangaDex
 */

import { useState, useCallback, useRef, type MutableRefObject } from 'react';
import { searchManga, getPreferredTitle } from '../lib/mangadex';
import {
    getCachedSearch,
    cacheSearch,
    getCachedMangaByIds,
    getAllCachedManga,
} from '../lib/mangadexCache';
import { extractCoverUrl, toMangaWithMeta, bulkCacheManga } from '../lib/mangadexHelpers';
import type { MangaWithMeta } from './useMangaDex';

const ITEMS_PER_PAGE = 20;
const DEBOUNCE_MS = 400;

// ─── HOOK ───────────────────────────────────────────────────────────────────

interface UseMangaSearchResult {
    searchResults: MangaWithMeta[];
    searchTotal: number;
    isSearching: boolean;
    searchError: string | null;
    search: (query: string, page?: number) => Promise<void>;
    clearSearch: () => void;
}

export function useMangaSearch(
    online: boolean,
    mountedRef: MutableRefObject<boolean>,
    onCacheUpdated: () => void,
): UseMangaSearchResult {
    const [searchResults, setSearchResults] = useState<MangaWithMeta[]>([]);
    const [searchTotal, setSearchTotal] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const currentSearchRef = useRef<string>('');
    /** Aborts the previous search cycle (debounce + in-flight work) when a new one starts. */
    const abortRef = useRef<AbortController | null>(null);

    const refreshSearchInBackground = async (query: string, page: number, signal: AbortSignal) => {
        try {
            const result = await searchManga(query, {
                limit: ITEMS_PER_PAGE,
                offset: page * ITEMS_PER_PAGE,
            });

            if (signal.aborted) return;

            // Batch all cache writes into a single IndexedDB transaction
            const entries = result.data.map(m => ({ manga: m, coverUrl: extractCoverUrl(m) }));
            const mangaIds = await bulkCacheManga(entries);
            await cacheSearch(query, mangaIds, result.total);

            if (!mountedRef.current || signal.aborted) return;
            if (currentSearchRef.current === query) {
                setSearchResults(result.data.map(m => toMangaWithMeta(m)));
                setSearchTotal(result.total);
            }
        } catch {
            // Silent fail for background refresh
        }
    };

    const search = useCallback(
        async (query: string, page = 0) => {
            // Cancel any pending debounce timer
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
                searchTimeoutRef.current = undefined;
            }

            // Abort the previous search cycle (debounce + stale in-flight work)
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            const { signal } = controller;

            const trimmedQuery = query.trim();
            currentSearchRef.current = trimmedQuery;

            if (!trimmedQuery) {
                setSearchResults([]);
                setSearchTotal(0);
                setSearchError(null);
                return;
            }

            // Debounce: rejects with AbortError when a newer search fires,
            // preventing zombie promises that never resolve.
            try {
                await new Promise<void>((resolve, reject) => {
                    signal.addEventListener('abort', () =>
                        reject(new DOMException('Debounce cancelled', 'AbortError')),
                    );
                    searchTimeoutRef.current = setTimeout(resolve, DEBOUNCE_MS);
                });
            } catch {
                return; // Debounce was cancelled by a newer keystroke — exit cleanly
            }

            if (signal.aborted || currentSearchRef.current !== trimmedQuery) {
                return;
            }

            setIsSearching(true);
            setSearchError(null);

            try {
                const cached = await getCachedSearch(trimmedQuery);
                if (signal.aborted) return;

                if (cached) {
                    const cachedMangaList = await getCachedMangaByIds(cached.mangaIds);
                    if (signal.aborted) return;

                    if (cachedMangaList.length > 0) {
                        setSearchResults(cachedMangaList.map(c => toMangaWithMeta(c.data, c)));
                        setSearchTotal(cached.total);
                        setIsSearching(false);

                        if (online) {
                            refreshSearchInBackground(trimmedQuery, page, signal);
                        }
                        return;
                    }
                }

                if (!online) {
                    setSearchError('You are offline. Showing cached results only.');
                    const allCached = await getAllCachedManga();
                    if (signal.aborted) return;

                    const filtered = allCached.filter(c =>
                        getPreferredTitle(c.data.attributes.title)
                            .toLowerCase()
                            .includes(trimmedQuery.toLowerCase()),
                    );
                    setSearchResults(filtered.map(c => toMangaWithMeta(c.data, c)));
                    setSearchTotal(filtered.length);
                    setIsSearching(false);
                    return;
                }

                const result = await searchManga(trimmedQuery, {
                    limit: ITEMS_PER_PAGE,
                    offset: page * ITEMS_PER_PAGE,
                });

                if (signal.aborted) return;

                // Batch all cache writes into a single IndexedDB transaction
                const entries = result.data.map(m => ({ manga: m, coverUrl: extractCoverUrl(m) }));
                const mangaIds = await bulkCacheManga(entries);
                await cacheSearch(trimmedQuery, mangaIds, result.total);

                if (signal.aborted) return;

                const enrichedResults = result.data.map(m => toMangaWithMeta(m));
                setSearchResults(enrichedResults);
                setSearchTotal(result.total);

                onCacheUpdated();
            } catch (err) {
                if (signal.aborted) return;

                const message = err instanceof Error ? err.message : 'Search failed';
                setSearchError(message);

                const allCached = await getAllCachedManga();
                if (signal.aborted) return;

                const filtered = allCached.filter(c =>
                    getPreferredTitle(c.data.attributes.title)
                        .toLowerCase()
                        .includes(trimmedQuery.toLowerCase()),
                );
                if (filtered.length > 0) {
                    setSearchResults(filtered.map(c => toMangaWithMeta(c.data, c)));
                    setSearchTotal(filtered.length);
                }
            } finally {
                if (!signal.aborted) {
                    setIsSearching(false);
                }
            }
        },
        [online, mountedRef, onCacheUpdated],
    );

    const clearSearch = useCallback(() => {
        setSearchResults([]);
        setSearchTotal(0);
        setSearchError(null);
        currentSearchRef.current = '';
        // Cancel any in-flight debounce or search operation
        abortRef.current?.abort();
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
            searchTimeoutRef.current = undefined;
        }
    }, []);

    return {
        searchResults,
        searchTotal,
        isSearching,
        searchError,
        search,
        clearSearch,
    };
}
