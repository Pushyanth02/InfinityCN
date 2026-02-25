/**
 * useMangaDetail.ts — Detail/chapters state and actions for MangaDex
 */

import { useState, useCallback, useRef, type MutableRefObject } from 'react';
import { getMangaDetails, getMangaChapters, type MangaDexChapter } from '../lib/mangadex';
import { getCachedManga, cacheManga, getCachedChapters, cacheChapters } from '../lib/mangadexCache';
import { extractCoverUrl, toMangaWithMeta } from '../lib/mangadexHelpers';
import type { MangaWithMeta } from './useMangaDex';

const CHAPTERS_PER_LOAD = 50;

// ─── HOOK ───────────────────────────────────────────────────────────────────

interface UseMangaDetailResult {
    selectedManga: MangaWithMeta | null;
    setSelectedManga: React.Dispatch<React.SetStateAction<MangaWithMeta | null>>;
    chapters: MangaDexChapter[];
    chaptersTotal: number;
    isLoadingDetail: boolean;
    detailError: string | null;
    selectManga: (mangaId: string) => Promise<void>;
    clearSelection: () => void;
    loadMoreChapters: () => Promise<void>;
    clearGenerationError: () => void;
}

export function useMangaDetail(
    online: boolean,
    mountedRef: MutableRefObject<boolean>,
    onCacheUpdated: () => void,
): UseMangaDetailResult {
    const [selectedManga, setSelectedManga] = useState<MangaWithMeta | null>(null);
    const [chapters, setChapters] = useState<MangaDexChapter[]>([]);
    const [chaptersTotal, setChaptersTotal] = useState(0);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    const chaptersOffsetRef = useRef(0);
    // Mirrors `chapters` state so loadMoreChapters avoids stale closures
    const chaptersRef = useRef<MangaDexChapter[]>([]);
    // Cancels stale requests when a new selectManga call supersedes the previous one
    const abortRef = useRef<AbortController | null>(null);
    // Guards against concurrent loadMoreChapters calls from rapid scroll events
    const isLoadingMoreRef = useRef(false);

    /** Update both the chapters state and the mirrored ref in one call. */
    const updateChapters = useCallback((next: MangaDexChapter[]) => {
        chaptersRef.current = next;
        setChapters(next);
    }, []);

    const refreshMangaInBackground = async (mangaId: string, signal: AbortSignal) => {
        try {
            // Parallelize independent API calls
            const [manga, chapterResult] = await Promise.all([
                getMangaDetails(mangaId),
                getMangaChapters(mangaId, { limit: CHAPTERS_PER_LOAD }),
            ]);

            if (signal.aborted || !mountedRef.current) return;

            const coverUrl = extractCoverUrl(manga);

            // Parallelize independent cache writes
            await Promise.all([
                cacheManga(manga, coverUrl),
                cacheChapters(mangaId, chapterResult.data, chapterResult.total),
            ]);

            if (signal.aborted || !mountedRef.current) return;

            const cached = await getCachedManga(mangaId);
            if (signal.aborted) return;

            if (cached) {
                setSelectedManga(toMangaWithMeta(manga, cached));
            }
            updateChapters(chapterResult.data);
            setChaptersTotal(chapterResult.total);
            chaptersOffsetRef.current = chapterResult.data.length;
        } catch {
            // Silent fail for background refresh
        }
    };

    const selectManga = useCallback(
        async (mangaId: string) => {
            // Cancel any in-flight request from a previous selectManga call
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            const { signal } = controller;

            setIsLoadingDetail(true);
            setDetailError(null);
            updateChapters([]);
            setChaptersTotal(0);
            chaptersOffsetRef.current = 0;

            try {
                const cached = await getCachedManga(mangaId);
                if (signal.aborted) return;

                if (cached) {
                    setSelectedManga(toMangaWithMeta(cached.data, cached));

                    const cachedChaps = await getCachedChapters(mangaId);
                    if (signal.aborted) return;

                    if (cachedChaps) {
                        updateChapters(cachedChaps.chapters);
                        setChaptersTotal(cachedChaps.total);
                    }

                    if (online) {
                        refreshMangaInBackground(mangaId, signal);
                    }

                    setIsLoadingDetail(false);
                    return;
                }

                if (!online) {
                    setDetailError('You are offline and this manga is not cached.');
                    setIsLoadingDetail(false);
                    return;
                }

                // Parallelize independent API calls
                const [manga, chapterResult] = await Promise.all([
                    getMangaDetails(mangaId),
                    getMangaChapters(mangaId, { limit: CHAPTERS_PER_LOAD }),
                ]);

                if (signal.aborted) return;

                const coverUrl = extractCoverUrl(manga);
                await cacheManga(manga, coverUrl);

                setSelectedManga(toMangaWithMeta(manga));
                updateChapters(chapterResult.data);
                setChaptersTotal(chapterResult.total);
                chaptersOffsetRef.current = chapterResult.data.length;

                await cacheChapters(mangaId, chapterResult.data, chapterResult.total);

                onCacheUpdated();
            } catch (err) {
                if (signal.aborted) return;
                const message = err instanceof Error ? err.message : 'Failed to load manga';
                setDetailError(message);
            } finally {
                if (!signal.aborted) {
                    setIsLoadingDetail(false);
                }
            }
        },
        [online, mountedRef, onCacheUpdated, updateChapters],
    );

    const clearSelection = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setSelectedManga(null);
        updateChapters([]);
        setChaptersTotal(0);
        setDetailError(null);
        chaptersOffsetRef.current = 0;
    }, [updateChapters]);

    const loadMoreChapters = useCallback(async () => {
        if (!selectedManga || !online || isLoadingMoreRef.current) return;

        isLoadingMoreRef.current = true;
        try {
            const result = await getMangaChapters(selectedManga.manga.id, {
                limit: CHAPTERS_PER_LOAD,
                offset: chaptersOffsetRef.current,
            });

            // Read from chaptersRef (not the closure value) to avoid stale data
            const allChapters = [...chaptersRef.current, ...result.data];
            updateChapters(allChapters);
            chaptersOffsetRef.current += result.data.length;

            await cacheChapters(selectedManga.manga.id, allChapters, result.total);
        } catch {
            // Silent fail
        } finally {
            isLoadingMoreRef.current = false;
        }
    }, [selectedManga, online, updateChapters]);

    const clearGenerationError = useCallback(() => {
        setDetailError(null);
    }, []);

    return {
        selectedManga,
        setSelectedManga,
        chapters,
        chaptersTotal,
        isLoadingDetail,
        detailError,
        selectManga,
        clearSelection,
        loadMoreChapters,
        clearGenerationError,
    };
}
