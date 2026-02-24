/**
 * MangaDexBrowser.tsx — Main MangaDex browsing interface
 * 
 * Provides:
 * - Search bar with debouncing
 * - Manga grid display
 * - Cached manga section for offline browsing
 * - Detail panel integration
 */

import React, { useState, useCallback, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, X, Wifi, WifiOff, Database, BookOpen,
    Loader, AlertCircle, ChevronLeft, RefreshCw
} from 'lucide-react';
import { useMangaDex } from '../hooks/useMangaDex';
import { MangaCard } from './MangaCard';
import { MangaDetail } from './MangaDetail';

interface MangaDexBrowserProps {
    isOpen: boolean;
    onClose: () => void;
}

type ViewMode = 'search' | 'cached' | 'trending';

const MangaDexBrowserComponent: React.FC<MangaDexBrowserProps> = ({ isOpen, onClose }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('search');
    
    const {
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
        search,
        clearSearch,
        selectManga,
        clearSelection,
        loadMoreChapters,
        generateSynopsis,
        generateCodex,
        refreshCache,
    } = useMangaDex();
    
    // Lock body scroll when browser is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = '';
            };
        }
    }, [isOpen]);
    
    // Handle search input
    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchQuery(value);
        setViewMode('search');
        search(value);
    }, [search]);
    
    // Clear search
    const handleClearSearch = useCallback(() => {
        setSearchQuery('');
        clearSearch();
    }, [clearSearch]);
    
    // Handle escape key
    useEffect(() => {
        if (!isOpen) return;
        
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (selectedManga) {
                    clearSelection();
                } else {
                    onClose();
                }
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen, selectedManga, clearSelection, onClose]);
    
    // Get display manga based on view mode
    const displayManga = viewMode === 'cached' ? 
        cachedManga.map(c => ({
            manga: c.data,
            coverUrl: c.coverUrl,
            title: c.data.attributes.title['en'] || Object.values(c.data.attributes.title)[0] || 'Untitled',
            synopsis: c.generatedSynopsis || '',
            codex: c.generatedCodex || null,
            isEnriched: !!(c.generatedSynopsis || c.generatedCodex),
        })) : searchResults;
    
    if (!isOpen) return null;
    
    return (
        <AnimatePresence>
            <motion.div
                className="mangadex-browser-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <motion.div
                    className="mangadex-browser"
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                >
                    {/* Header */}
                    <header className="mangadex-browser-header">
                        <button
                            className="mangadex-browser-back"
                            onClick={onClose}
                            aria-label="Close browser"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        
                        <div className="mangadex-browser-title-row">
                            <h1 className="mangadex-browser-title font-display">
                                MangaDex
                            </h1>
                            <span className={`mangadex-browser-status ${online ? 'online' : 'offline'}`}>
                                {online ? <Wifi size={14} /> : <WifiOff size={14} />}
                                {online ? 'Online' : 'Offline'}
                            </span>
                        </div>
                        
                        <button
                            className="mangadex-browser-refresh"
                            onClick={refreshCache}
                            aria-label="Refresh cache"
                            title="Refresh cache"
                        >
                            <RefreshCw size={16} />
                        </button>
                    </header>
                    
                    {/* Search Bar */}
                    <div className="mangadex-browser-search">
                        <div className="mangadex-browser-search-input-wrap">
                            <Search size={18} className="mangadex-browser-search-icon" />
                            <input
                                type="text"
                                className="mangadex-browser-search-input"
                                placeholder="Search manga by title, author, or tags..."
                                value={searchQuery}
                                onChange={handleSearchChange}
                                autoFocus
                            />
                            {searchQuery && (
                                <button
                                    className="mangadex-browser-search-clear"
                                    onClick={handleClearSearch}
                                    aria-label="Clear search"
                                >
                                    <X size={16} />
                                </button>
                            )}
                            {isSearching && (
                                <Loader size={16} className="mangadex-browser-search-loading spin-icon" />
                            )}
                        </div>
                    </div>
                    
                    {/* View Mode Tabs */}
                    <div className="mangadex-browser-tabs">
                        <button
                            className={`mangadex-browser-tab ${viewMode === 'search' ? 'active' : ''}`}
                            onClick={() => setViewMode('search')}
                        >
                            <Search size={14} />
                            Search
                            {searchTotal > 0 && (
                                <span className="mangadex-browser-tab-count">{searchTotal}</span>
                            )}
                        </button>
                        <button
                            className={`mangadex-browser-tab ${viewMode === 'cached' ? 'active' : ''}`}
                            onClick={() => setViewMode('cached')}
                        >
                            <Database size={14} />
                            Cached
                            {cachedManga.length > 0 && (
                                <span className="mangadex-browser-tab-count">{cachedManga.length}</span>
                            )}
                        </button>
                    </div>
                    
                    {/* Content */}
                    <div className="mangadex-browser-content">
                        {/* Error State */}
                        {searchError && (
                            <div className="mangadex-browser-error">
                                <AlertCircle size={20} />
                                <span>{searchError}</span>
                            </div>
                        )}
                        
                        {/* Empty States */}
                        {viewMode === 'search' && !searchQuery && displayManga.length === 0 && (
                            <div className="mangadex-browser-empty">
                                <BookOpen size={48} strokeWidth={1} />
                                <h3>Search MangaDex</h3>
                                <p>
                                    Enter a title, author, or genre to search the MangaDex catalog.
                                    {!online && ' You are offline — only cached manga will be shown.'}
                                </p>
                            </div>
                        )}
                        
                        {viewMode === 'cached' && cachedManga.length === 0 && (
                            <div className="mangadex-browser-empty">
                                <Database size={48} strokeWidth={1} />
                                <h3>No Cached Manga</h3>
                                <p>
                                    Browse and view manga while online to cache them for offline access.
                                </p>
                            </div>
                        )}
                        
                        {searchQuery && displayManga.length === 0 && !isSearching && !searchError && (
                            <div className="mangadex-browser-empty">
                                <Search size={48} strokeWidth={1} />
                                <h3>No Results</h3>
                                <p>
                                    No manga found for "{searchQuery}". Try a different search term.
                                </p>
                            </div>
                        )}
                        
                        {/* Manga Grid */}
                        {displayManga.length > 0 && (
                            <motion.div
                                className="mangadex-browser-grid"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                            >
                                {displayManga.map((manga, index) => (
                                    <MangaCard
                                        key={manga.manga.id}
                                        manga={manga}
                                        index={index}
                                        onClick={() => selectManga(manga.manga.id)}
                                    />
                                ))}
                            </motion.div>
                        )}
                        
                        {/* Loading More Indicator */}
                        {isSearching && displayManga.length > 0 && (
                            <div className="mangadex-browser-loading-more">
                                <Loader size={20} className="spin-icon" />
                                <span>Loading more...</span>
                            </div>
                        )}
                        
                        {/* Results Count */}
                        {viewMode === 'search' && searchTotal > 0 && (
                            <div className="mangadex-browser-results-info">
                                Showing {displayManga.length} of {searchTotal} results
                            </div>
                        )}
                    </div>
                    
                    {/* Detail Panel */}
                    <AnimatePresence>
                        {selectedManga && (
                            <MangaDetail
                                manga={selectedManga}
                                chapters={chapters}
                                chaptersTotal={chaptersTotal}
                                isLoading={isLoadingDetail}
                                error={detailError}
                                isGenerating={isGenerating}
                                generationError={generationError}
                                online={online}
                                onClose={clearSelection}
                                onLoadMoreChapters={loadMoreChapters}
                                onGenerateSynopsis={generateSynopsis}
                                onGenerateCodex={generateCodex}
                            />
                        )}
                    </AnimatePresence>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export const MangaDexBrowser = memo(MangaDexBrowserComponent);
MangaDexBrowser.displayName = 'MangaDexBrowser';
