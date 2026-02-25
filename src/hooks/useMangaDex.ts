/**
 * useMangaDex.ts — Composition hook for MangaDex data management
 *
 * Composes three focused hooks:
 * - useMangaSearch  — search with debouncing and caching
 * - useMangaDetail  — manga details and chapter pagination
 * - useMangaGeneration — AI/algorithmic synopsis and codex generation
 *
 * Also manages shared state: connectivity, cached manga list, mount ref.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { MangaDexManga, MangaDexChapter } from '../lib/mangadex';
import { getAllCachedManga, type CachedManga, type MangaCodex } from '../lib/mangadexCache';
import { isOnline } from '../lib/mangadexInference';
import { useMangaSearch } from './useMangaSearch';
import { useMangaDetail } from './useMangaDetail';
import { useMangaGeneration } from './useMangaGeneration';

// ─── TYPES (re-exported for consumers) ──────────────────────────────────────

export interface MangaWithMeta {
    manga: MangaDexManga;
    coverUrl: string | null;
    title: string;
    synopsis: string;
    codex: MangaCodex | null;
    isEnriched: boolean;
}

interface UseMangaDexState {
    searchResults: MangaWithMeta[];
    searchTotal: number;
    isSearching: boolean;
    searchError: string | null;
    selectedManga: MangaWithMeta | null;
    chapters: MangaDexChapter[];
    chaptersTotal: number;
    isLoadingDetail: boolean;
    detailError: string | null;
    isGenerating: boolean;
    generationError: string | null;
    online: boolean;
    cachedManga: CachedManga[];
}

interface UseMangaDexActions {
    search: (query: string, page?: number) => Promise<void>;
    clearSearch: () => void;
    selectManga: (mangaId: string) => Promise<void>;
    clearSelection: () => void;
    loadMoreChapters: () => Promise<void>;
    generateSynopsis: () => Promise<void>;
    generateCodex: () => Promise<void>;
    refreshCache: () => Promise<void>;
}

// ─── COMPOSITION HOOK ───────────────────────────────────────────────────────

export function useMangaDex(): UseMangaDexState & UseMangaDexActions {
    // Shared state
    const [online, setOnline] = useState(isOnline());
    const [cachedManga, setCachedManga] = useState<CachedManga[]>([]);
    const mountedRef = useRef(true);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Online/offline detection
    useEffect(() => {
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Load cached manga on mount
    useEffect(() => {
        getAllCachedManga().then(setCachedManga);
    }, []);

    const refreshCache = useCallback(async () => {
        const cached = await getAllCachedManga();
        setCachedManga(cached);
    }, []);

    // Compose sub-hooks
    const searchHook = useMangaSearch(online, mountedRef, refreshCache);
    const detailHook = useMangaDetail(online, mountedRef, refreshCache);
    const generationHook = useMangaGeneration(
        detailHook.selectedManga,
        detailHook.setSelectedManga,
        online,
    );

    // Wrap clearSelection to also clear generation error
    const clearSelection = useCallback(() => {
        detailHook.clearSelection();
    }, [detailHook]);

    return {
        // Search state
        searchResults: searchHook.searchResults,
        searchTotal: searchHook.searchTotal,
        isSearching: searchHook.isSearching,
        searchError: searchHook.searchError,

        // Detail state
        selectedManga: detailHook.selectedManga,
        chapters: detailHook.chapters,
        chaptersTotal: detailHook.chaptersTotal,
        isLoadingDetail: detailHook.isLoadingDetail,
        detailError: detailHook.detailError,

        // Generation state
        isGenerating: generationHook.isGenerating,
        generationError: generationHook.generationError,

        // Shared state
        online,
        cachedManga,

        // Actions
        search: searchHook.search,
        clearSearch: searchHook.clearSearch,
        selectManga: detailHook.selectManga,
        clearSelection,
        loadMoreChapters: detailHook.loadMoreChapters,
        generateSynopsis: generationHook.generateSynopsis,
        generateCodex: generationHook.generateCodex,
        refreshCache,
    };
}
