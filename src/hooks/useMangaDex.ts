/**
 * useMangaDex.ts — React hook for MangaDex data management
 * 
 * Provides unified interface for:
 * - Searching manga (with debouncing)
 * - Fetching manga details
 * - Fetching chapters
 * - Generating/enriching metadata (fallback hierarchy)
 * - Offline/online state management
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
    searchManga,
    getMangaDetails,
    getMangaChapters,
    getPreferredTitle,
    type MangaDexManga,
    type MangaDexChapter,
} from '../lib/mangadex';
import {
    getCachedManga,
    cacheManga,
    getCachedChapters,
    cacheChapters,
    getCachedSearch,
    cacheSearch,
    getCachedMangaByIds,
    getAllCachedManga,
    updateMangaGenerated,
    type CachedManga,
    type MangaCodex,
} from '../lib/mangadexCache';
import {
    generateMangaCodex,
    generateSynopsis,
    enrichSynopsis,
    isOnline,
} from '../lib/mangadexInference';
import { useStore } from '../store';
import type { AIConfig } from '../lib/ai';

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface MangaWithMeta {
    manga: MangaDexManga;
    coverUrl: string | null;
    title: string;
    synopsis: string;
    codex: MangaCodex | null;
    isEnriched: boolean;
}

export interface UseMangaDexState {
    // Search
    searchResults: MangaWithMeta[];
    searchTotal: number;
    isSearching: boolean;
    searchError: string | null;
    
    // Detail
    selectedManga: MangaWithMeta | null;
    chapters: MangaDexChapter[];
    chaptersTotal: number;
    isLoadingDetail: boolean;
    detailError: string | null;
    
    // Generation
    isGenerating: boolean;
    generationError: string | null;
    
    // Connectivity
    online: boolean;
    
    // Cache
    cachedManga: CachedManga[];
}

export interface UseMangaDexActions {
    search: (query: string, page?: number) => Promise<void>;
    clearSearch: () => void;
    selectManga: (mangaId: string) => Promise<void>;
    clearSelection: () => void;
    loadMoreChapters: () => Promise<void>;
    generateSynopsis: () => Promise<void>;
    generateCodex: () => Promise<void>;
    refreshCache: () => Promise<void>;
}

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 20;
const CHAPTERS_PER_LOAD = 50;
const DEBOUNCE_MS = 400;

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

/**
 * Extract cover URL from manga relationships
 */
function extractCoverUrl(manga: MangaDexManga): string | null {
    const coverRel = manga.relationships.find(r => r.type === 'cover_art');
    if (coverRel?.attributes) {
        const fileName = (coverRel.attributes as { fileName?: string }).fileName;
        if (fileName) {
            return `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.256.jpg`;
        }
    }
    return null;
}

/**
 * Convert MangaDex manga to our enriched format
 */
function toMangaWithMeta(
    manga: MangaDexManga,
    cached?: CachedManga | null
): MangaWithMeta {
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
 * Get AI config from store
 */
function getAIConfig(): AIConfig {
    const state = useStore.getState();
    return {
        provider: state.aiProvider,
        geminiKey: state.geminiKey,
        useSearchGrounding: state.useSearchGrounding,
        openAiKey: state.openAiKey,
        anthropicKey: state.anthropicKey,
        groqKey: state.groqKey,
        deepseekKey: state.deepseekKey,
        ollamaUrl: state.ollamaUrl,
        ollamaModel: state.ollamaModel,
    };
}

// ─── HOOK ───────────────────────────────────────────────────────────────────

export function useMangaDex(): UseMangaDexState & UseMangaDexActions {
    // State
    const [searchResults, setSearchResults] = useState<MangaWithMeta[]>([]);
    const [searchTotal, setSearchTotal] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    
    const [selectedManga, setSelectedManga] = useState<MangaWithMeta | null>(null);
    const [chapters, setChapters] = useState<MangaDexChapter[]>([]);
    const [chaptersTotal, setChaptersTotal] = useState(0);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);
    
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationError, setGenerationError] = useState<string | null>(null);
    
    const [online, setOnline] = useState(isOnline());
    const [cachedManga, setCachedManga] = useState<CachedManga[]>([]);
    
    // Refs for debouncing
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const currentSearchRef = useRef<string>('');
    const chaptersOffsetRef = useRef(0);
    
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
    
    /**
     * Search for manga with debouncing
     */
    const search = useCallback(async (query: string, page = 0) => {
        // Clear previous timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
        
        const trimmedQuery = query.trim();
        currentSearchRef.current = trimmedQuery;
        
        if (!trimmedQuery) {
            setSearchResults([]);
            setSearchTotal(0);
            setSearchError(null);
            return;
        }
        
        // Debounce
        await new Promise<void>(resolve => {
            searchTimeoutRef.current = setTimeout(resolve, DEBOUNCE_MS);
        });
        
        // Check if query changed during debounce
        if (currentSearchRef.current !== trimmedQuery) {
            return;
        }
        
        setIsSearching(true);
        setSearchError(null);
        
        try {
            // Try cache first
            const cached = await getCachedSearch(trimmedQuery);
            if (cached) {
                const cachedMangaList = await getCachedMangaByIds(cached.mangaIds);
                if (cachedMangaList.length > 0) {
                    setSearchResults(cachedMangaList.map(c => toMangaWithMeta(c.data, c)));
                    setSearchTotal(cached.total);
                    setIsSearching(false);
                    
                    // Refresh in background if online
                    if (online) {
                        refreshSearchInBackground(trimmedQuery, page);
                    }
                    return;
                }
            }
            
            // If offline and no cache, show error
            if (!online) {
                setSearchError('You are offline. Showing cached results only.');
                const allCached = await getAllCachedManga();
                const filtered = allCached.filter(c => 
                    getPreferredTitle(c.data.attributes.title)
                        .toLowerCase()
                        .includes(trimmedQuery.toLowerCase())
                );
                setSearchResults(filtered.map(c => toMangaWithMeta(c.data, c)));
                setSearchTotal(filtered.length);
                setIsSearching(false);
                return;
            }
            
            // Fetch from API
            const result = await searchManga(trimmedQuery, {
                limit: ITEMS_PER_PAGE,
                offset: page * ITEMS_PER_PAGE,
            });
            
            // Cache results
            const mangaIds: string[] = [];
            for (const manga of result.data) {
                const coverUrl = extractCoverUrl(manga);
                await cacheManga(manga, coverUrl);
                mangaIds.push(manga.id);
            }
            await cacheSearch(trimmedQuery, mangaIds, result.total);
            
            // Update state
            const enrichedResults = result.data.map(m => toMangaWithMeta(m));
            setSearchResults(enrichedResults);
            setSearchTotal(result.total);
            
            // Update cached manga list
            getAllCachedManga().then(setCachedManga);
            
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Search failed';
            setSearchError(message);
            
            // Try to show cached results on error
            const allCached = await getAllCachedManga();
            const filtered = allCached.filter(c => 
                getPreferredTitle(c.data.attributes.title)
                    .toLowerCase()
                    .includes(trimmedQuery.toLowerCase())
            );
            if (filtered.length > 0) {
                setSearchResults(filtered.map(c => toMangaWithMeta(c.data, c)));
                setSearchTotal(filtered.length);
            }
        } finally {
            setIsSearching(false);
        }
    }, [online]);
    
    /**
     * Background refresh for cached search results
     */
    const refreshSearchInBackground = async (query: string, page: number) => {
        try {
            const result = await searchManga(query, {
                limit: ITEMS_PER_PAGE,
                offset: page * ITEMS_PER_PAGE,
            });
            
            const mangaIds: string[] = [];
            for (const manga of result.data) {
                const coverUrl = extractCoverUrl(manga);
                await cacheManga(manga, coverUrl);
                mangaIds.push(manga.id);
            }
            await cacheSearch(query, mangaIds, result.total);
            
            if (currentSearchRef.current === query) {
                setSearchResults(result.data.map(m => toMangaWithMeta(m)));
                setSearchTotal(result.total);
            }
        } catch {
            // Silent fail for background refresh
        }
    };
    
    /**
     * Clear search results
     */
    const clearSearch = useCallback(() => {
        setSearchResults([]);
        setSearchTotal(0);
        setSearchError(null);
        currentSearchRef.current = '';
    }, []);
    
    /**
     * Select and load manga details
     */
    const selectManga = useCallback(async (mangaId: string) => {
        setIsLoadingDetail(true);
        setDetailError(null);
        setChapters([]);
        setChaptersTotal(0);
        chaptersOffsetRef.current = 0;
        
        try {
            // Try cache first
            const cached = await getCachedManga(mangaId);
            if (cached) {
                setSelectedManga(toMangaWithMeta(cached.data, cached));
                
                // Load cached chapters
                const cachedChaps = await getCachedChapters(mangaId);
                if (cachedChaps) {
                    setChapters(cachedChaps.chapters);
                    setChaptersTotal(cachedChaps.total);
                }
                
                // Refresh in background if online
                if (online) {
                    refreshMangaInBackground(mangaId);
                }
                
                setIsLoadingDetail(false);
                return;
            }
            
            // Fetch from API if online
            if (!online) {
                setDetailError('You are offline and this manga is not cached.');
                setIsLoadingDetail(false);
                return;
            }
            
            const manga = await getMangaDetails(mangaId);
            const coverUrl = extractCoverUrl(manga);
            await cacheManga(manga, coverUrl);
            
            setSelectedManga(toMangaWithMeta(manga));
            
            // Load chapters
            const chapterResult = await getMangaChapters(mangaId, {
                limit: CHAPTERS_PER_LOAD,
            });
            setChapters(chapterResult.data);
            setChaptersTotal(chapterResult.total);
            chaptersOffsetRef.current = chapterResult.data.length;
            
            // Cache chapters
            await cacheChapters(mangaId, chapterResult.data, chapterResult.total);
            
            // Update cached manga list
            getAllCachedManga().then(setCachedManga);
            
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load manga';
            setDetailError(message);
        } finally {
            setIsLoadingDetail(false);
        }
    }, [online]);
    
    /**
     * Background refresh for manga details
     */
    const refreshMangaInBackground = async (mangaId: string) => {
        try {
            const manga = await getMangaDetails(mangaId);
            const coverUrl = extractCoverUrl(manga);
            await cacheManga(manga, coverUrl);
            
            const chapterResult = await getMangaChapters(mangaId, {
                limit: CHAPTERS_PER_LOAD,
            });
            await cacheChapters(mangaId, chapterResult.data, chapterResult.total);
            
            // Update state with fresh data
            const cached = await getCachedManga(mangaId);
            if (cached) {
                setSelectedManga(toMangaWithMeta(manga, cached));
            }
            setChapters(chapterResult.data);
            setChaptersTotal(chapterResult.total);
            chaptersOffsetRef.current = chapterResult.data.length;
        } catch {
            // Silent fail for background refresh
        }
    };
    
    /**
     * Clear manga selection
     */
    const clearSelection = useCallback(() => {
        setSelectedManga(null);
        setChapters([]);
        setChaptersTotal(0);
        setDetailError(null);
        setGenerationError(null);
        chaptersOffsetRef.current = 0;
    }, []);
    
    /**
     * Load more chapters (pagination)
     */
    const loadMoreChapters = useCallback(async () => {
        if (!selectedManga || !online) return;
        
        try {
            const result = await getMangaChapters(selectedManga.manga.id, {
                limit: CHAPTERS_PER_LOAD,
                offset: chaptersOffsetRef.current,
            });
            
            setChapters(prev => [...prev, ...result.data]);
            chaptersOffsetRef.current += result.data.length;
            
            // Update cache
            await cacheChapters(
                selectedManga.manga.id,
                [...chapters, ...result.data],
                result.total
            );
        } catch {
            // Silent fail
        }
    }, [selectedManga, online, chapters]);
    
    /**
     * Generate synopsis using fallback hierarchy
     */
    const generateSynopsisAction = useCallback(async () => {
        if (!selectedManga) return;
        
        setIsGenerating(true);
        setGenerationError(null);
        
        try {
            const manga = selectedManga.manga;
            const existingSynopsis = getPreferredTitle(manga.attributes.description || {}, 'en');
            
            // Step 1: If MangaDex has a synopsis, use it (enriched)
            if (existingSynopsis && existingSynopsis.length > 50) {
                const enriched = enrichSynopsis(existingSynopsis, manga);
                await updateMangaGenerated(manga.id, { generatedSynopsis: enriched });
                setSelectedManga(prev => prev ? { ...prev, synopsis: enriched, isEnriched: true } : null);
                setIsGenerating(false);
                return;
            }
            
            // Step 2: If offline, use algorithmic generation
            if (!online) {
                const generated = generateSynopsis(manga);
                await updateMangaGenerated(manga.id, { generatedSynopsis: generated });
                setSelectedManga(prev => prev ? { ...prev, synopsis: generated, isEnriched: true } : null);
                setIsGenerating(false);
                return;
            }
            
            // Step 3: Try AI generation if available
            const aiConfig = getAIConfig();
            if (aiConfig.provider !== 'none') {
                try {
                    // Dynamic import to avoid loading AI module unnecessarily
                    const { callAIWithDedup } = await import('../lib/ai');
                    
                    const title = getPreferredTitle(manga.attributes.title);
                    const codex = generateMangaCodex(manga);
                    
                    const prompt = `Generate a compelling 2-3 paragraph synopsis for a manga titled "${title}".
Genre: ${codex.genres.join(', ') || 'Unknown'}
Themes: ${codex.themes.join(', ') || 'Unknown'}
Mood: ${codex.mood}
Status: ${manga.attributes.status}
${existingSynopsis ? `Existing brief description: ${existingSynopsis}` : ''}

Write an engaging synopsis that would make readers want to read this manga. Focus on the setting, main conflict, and what makes it unique. Do NOT include spoilers.

Return JSON: {"synopsis": "..."}`;
                    
                    const response = await callAIWithDedup(prompt, aiConfig);
                    const parsed = JSON.parse(response.replace(/```json\s*/gi, '').replace(/```/g, ''));
                    
                    if (parsed.synopsis) {
                        await updateMangaGenerated(manga.id, { generatedSynopsis: parsed.synopsis });
                        setSelectedManga(prev => prev ? { ...prev, synopsis: parsed.synopsis, isEnriched: true } : null);
                        setIsGenerating(false);
                        return;
                    }
                } catch (aiError) {
                    console.warn('AI generation failed, falling back to algorithmic:', aiError);
                }
            }
            
            // Step 4: Fallback to algorithmic generation
            const generated = generateSynopsis(manga);
            await updateMangaGenerated(manga.id, { generatedSynopsis: generated });
            setSelectedManga(prev => prev ? { ...prev, synopsis: generated, isEnriched: true } : null);
            
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Generation failed';
            setGenerationError(message);
        } finally {
            setIsGenerating(false);
        }
    }, [selectedManga, online]);
    
    /**
     * Generate codex/metadata using fallback hierarchy
     */
    const generateCodexAction = useCallback(async () => {
        if (!selectedManga) return;
        
        setIsGenerating(true);
        setGenerationError(null);
        
        try {
            const manga = selectedManga.manga;
            
            // Step 1: Generate basic codex from tags (always works)
            const codex = generateMangaCodex(manga);
            
            // Step 2: Try AI enrichment if available and online
            const aiConfig = getAIConfig();
            if (online && aiConfig.provider !== 'none') {
                try {
                    const { callAIWithDedup } = await import('../lib/ai');
                    
                    const title = getPreferredTitle(manga.attributes.title);
                    const synopsis = selectedManga.synopsis || getPreferredTitle(manga.attributes.description || {}, 'en');
                    
                    const prompt = `Analyze this manga and provide enriched metadata.

Title: ${title}
Current genres: ${codex.genres.join(', ')}
Current themes: ${codex.themes.join(', ')}
Synopsis: ${synopsis.substring(0, 500)}

Provide enhanced analysis in JSON format:
{
  "mood": "detailed mood description",
  "narrativeStyle": "detailed narrative style analysis",
  "similarTo": ["list of 3 similar manga titles"],
  "additionalThemes": ["any themes not already listed"]
}`;
                    
                    const response = await callAIWithDedup(prompt, aiConfig);
                    const parsed = JSON.parse(response.replace(/```json\s*/gi, '').replace(/```/g, ''));
                    
                    // Merge AI insights with algorithmic codex
                    if (parsed.mood) codex.mood = parsed.mood;
                    if (parsed.narrativeStyle) codex.narrativeStyle = parsed.narrativeStyle;
                    if (parsed.similarTo?.length) codex.similarTo = parsed.similarTo;
                    if (parsed.additionalThemes?.length) {
                        codex.themes = [...new Set([...codex.themes, ...parsed.additionalThemes])];
                    }
                } catch (aiError) {
                    console.warn('AI codex enrichment failed:', aiError);
                }
            }
            
            // Save codex
            await updateMangaGenerated(manga.id, { generatedCodex: codex });
            setSelectedManga(prev => prev ? { ...prev, codex, isEnriched: true } : null);
            
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Codex generation failed';
            setGenerationError(message);
        } finally {
            setIsGenerating(false);
        }
    }, [selectedManga, online]);
    
    /**
     * Refresh cached manga list
     */
    const refreshCache = useCallback(async () => {
        const cached = await getAllCachedManga();
        setCachedManga(cached);
    }, []);
    
    return {
        // State
        searchResults,
        searchTotal,
        isSearching,
        searchError,
        selectedManga,
        chapters,
        chaptersTotal,
        isLoadingDetail,
        detailError,
        isGenerating,
        generationError,
        online,
        cachedManga,
        
        // Actions
        search,
        clearSearch,
        selectManga,
        clearSelection,
        loadMoreChapters,
        generateSynopsis: generateSynopsisAction,
        generateCodex: generateCodexAction,
        refreshCache,
    };
}
