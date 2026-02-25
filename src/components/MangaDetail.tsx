/**
 * MangaDetail.tsx — Detailed manga view component
 *
 * Shows full manga information including:
 * - Cover and metadata
 * - Synopsis (with generate option)
 * - Codex/metadata (with generate option)
 * - Chapter list with pagination
 */

import React, { useState, useCallback, useMemo, memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    BookOpen,
    User,
    Palette,
    Calendar,
    Sparkles,
    ChevronDown,
    Loader,
    WifiOff,
    Wifi,
    BookMarked,
    Info,
    Layers,
    ExternalLink,
    RefreshCw,
} from 'lucide-react';
import type { MangaWithMeta } from '../hooks/useMangaDex';
import { useScrollLock } from './ui/useScrollLock';
import type { MangaDexChapter } from '../lib/mangadex';
import { STATUS_CONFIG } from '../lib/mangadexConstants';

interface MangaDetailProps {
    manga: MangaWithMeta;
    chapters: MangaDexChapter[];
    chaptersTotal: number;
    isLoading: boolean;
    error: string | null;
    isGenerating: boolean;
    generationError: string | null;
    online: boolean;
    onClose: () => void;
    onLoadMoreChapters: () => void;
    onGenerateSynopsis: () => void;
    onGenerateCodex: () => void;
}

type Tab = 'synopsis' | 'codex' | 'chapters';
const TABS: Tab[] = ['synopsis', 'codex', 'chapters'];

const MangaDetailComponent: React.FC<MangaDetailProps> = ({
    manga,
    chapters,
    chaptersTotal,
    isLoading,
    error,
    isGenerating,
    generationError,
    online,
    onClose,
    onLoadMoreChapters,
    onGenerateSynopsis,
    onGenerateCodex,
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('synopsis');
    const [imageLoaded, setImageLoaded] = useState(false);

    // Extract author and artist from relationships
    const author = useMemo(
        () => manga.manga.relationships.find(r => r.type === 'author'),
        [manga.manga.relationships],
    );
    const artist = useMemo(
        () => manga.manga.relationships.find(r => r.type === 'artist'),
        [manga.manga.relationships],
    );
    const authorName = author?.attributes ? (author.attributes as { name?: string }).name : null;
    const artistName = artist?.attributes ? (artist.attributes as { name?: string }).name : null;

    const status = STATUS_CONFIG[manga.manga.attributes.status] || STATUS_CONFIG.ongoing;
    const year = manga.manga.attributes.year;
    const contentRating = manga.manga.attributes.contentRating;

    // Extract all tags
    const allTags = useMemo(
        () =>
            manga.manga.attributes.tags
                .map(tag => {
                    const name = tag.attributes?.name;
                    return name?.['en'] || Object.values(name || {})[0] || '';
                })
                .filter(Boolean),
        [manga.manga.attributes.tags],
    );

    // Lock body scroll when detail is open
    useScrollLock(true);

    // Handle escape key
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // Infinite scroll for chapters
    const handleChaptersScroll = useCallback(
        (e: React.UIEvent<HTMLDivElement>) => {
            const target = e.currentTarget;
            if (
                target.scrollHeight - target.scrollTop <= target.clientHeight + 100 &&
                chapters.length < chaptersTotal &&
                !isLoading
            ) {
                onLoadMoreChapters();
            }
        },
        [chapters.length, chaptersTotal, isLoading, onLoadMoreChapters],
    );

    const synopsisProps = { manga, isGenerating, generationError, online, onGenerateSynopsis };
    const codexProps = { manga, isGenerating, generationError, onGenerateCodex };
    const chaptersProps = {
        chapters,
        chaptersTotal,
        isLoading,
        onLoadMoreChapters,
        handleChaptersScroll,
    };

    return (
        <motion.div
            className="manga-detail-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="manga-detail-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="manga-detail-header">
                    <button
                        className="manga-detail-back"
                        onClick={onClose}
                        aria-label="Close details"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <h2 className="manga-detail-header-title">Manga Details</h2>
                    <div className="manga-detail-header-status">
                        {online ? (
                            <span className="manga-detail-online">
                                <Wifi size={14} />
                                Online
                            </span>
                        ) : (
                            <span className="manga-detail-offline">
                                <WifiOff size={14} />
                                Offline
                            </span>
                        )}
                    </div>
                </div>

                {error ? (
                    <div className="manga-detail-error-full">
                        <p>{error}</p>
                        <button onClick={onClose}>Go Back</button>
                    </div>
                ) : (
                    <>
                        {/* Hero */}
                        <div className="manga-detail-hero">
                            <div className="manga-detail-cover">
                                {!imageLoaded && (
                                    <div className="manga-detail-cover-skeleton">
                                        <BookOpen size={40} />
                                    </div>
                                )}
                                {manga.coverUrl && (
                                    <img
                                        src={manga.coverUrl.replace('.256.jpg', '.512.jpg')}
                                        alt={manga.title}
                                        className={`manga-detail-cover-img ${imageLoaded ? 'loaded' : ''}`}
                                        onLoad={() => setImageLoaded(true)}
                                    />
                                )}
                            </div>

                            <div className="manga-detail-meta">
                                <h1 className="manga-detail-title">{manga.title}</h1>

                                <div className="manga-detail-badges">
                                    <span
                                        className="manga-detail-badge manga-detail-badge--status"
                                        style={
                                            { '--badge-color': status.color } as React.CSSProperties
                                        }
                                    >
                                        {status.icon(14)}
                                        {status.label}
                                    </span>

                                    {contentRating && contentRating !== 'safe' && (
                                        <span
                                            className={`manga-detail-badge manga-detail-badge--rating manga-detail-badge--${contentRating}`}
                                        >
                                            {contentRating === 'suggestive' ? '16+' : '18+'}
                                        </span>
                                    )}

                                    {year && (
                                        <span className="manga-detail-badge">
                                            <Calendar size={12} />
                                            {year}
                                        </span>
                                    )}
                                </div>

                                {(authorName || artistName) && (
                                    <div className="manga-detail-creators">
                                        {authorName && (
                                            <span className="manga-detail-creator">
                                                <User size={12} />
                                                {authorName}
                                            </span>
                                        )}
                                        {artistName && artistName !== authorName && (
                                            <span className="manga-detail-creator">
                                                <Palette size={12} />
                                                {artistName}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {allTags.length > 0 && (
                                    <div className="manga-detail-tags">
                                        {allTags.slice(0, 6).map((tag, i) => (
                                            <span key={i} className="manga-detail-tag">
                                                {tag}
                                            </span>
                                        ))}
                                        {allTags.length > 6 && (
                                            <span className="manga-detail-tag manga-detail-tag--more">
                                                +{allTags.length - 6}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="manga-detail-tabs" role="tablist">
                            {TABS.map(tab => (
                                <button
                                    key={tab}
                                    role="tab"
                                    aria-selected={activeTab === tab}
                                    className={`manga-detail-tab ${activeTab === tab ? 'manga-detail-tab--active' : ''}`}
                                    onClick={() => setActiveTab(tab)}
                                >
                                    {tab === 'synopsis' && <Info size={14} />}
                                    {tab === 'codex' && <Layers size={14} />}
                                    {tab === 'chapters' && <BookMarked size={14} />}
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                    {tab === 'chapters' && chaptersTotal > 0 && (
                                        <span className="manga-detail-tab-count">
                                            {chaptersTotal}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="manga-detail-content">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTab}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {activeTab === 'synopsis' && <SynopsisTab {...synopsisProps} />}
                                    {activeTab === 'codex' && <CodexTab {...codexProps} />}
                                    {activeTab === 'chapters' && <ChaptersTab {...chaptersProps} />}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </>
                )}
            </motion.div>
        </motion.div>
    );
};

// ─── TAB COMPONENTS ─────────────────────────────────────────────────────────

const SynopsisTab = memo(function SynopsisTab({
    manga,
    isGenerating,
    generationError,
    online,
    onGenerateSynopsis,
}: {
    manga: MangaWithMeta;
    isGenerating: boolean;
    generationError: string | null;
    online: boolean;
    onGenerateSynopsis: () => void;
}) {
    return (
        <div className="manga-detail-synopsis">
            {manga.synopsis ? (
                <p className="manga-detail-synopsis-text">{manga.synopsis}</p>
            ) : (
                <p className="manga-detail-synopsis-empty">No synopsis available.</p>
            )}

            <button
                className="manga-detail-generate-btn"
                onClick={onGenerateSynopsis}
                disabled={isGenerating}
            >
                {isGenerating ? (
                    <>
                        <Loader size={14} className="spin-icon" />
                        Generating...
                    </>
                ) : manga.isEnriched ? (
                    <>
                        <RefreshCw size={14} />
                        Regenerate Synopsis
                    </>
                ) : (
                    <>
                        <Sparkles size={14} />
                        Generate Synopsis
                    </>
                )}
            </button>

            {generationError && <p className="manga-detail-error">{generationError}</p>}

            {!online && (
                <p className="manga-detail-offline-note">
                    <WifiOff size={12} />
                    Offline mode: Using algorithmic generation
                </p>
            )}
        </div>
    );
});

const CodexTab = memo(function CodexTab({
    manga,
    isGenerating,
    generationError,
    onGenerateCodex,
}: {
    manga: MangaWithMeta;
    isGenerating: boolean;
    generationError: string | null;
    onGenerateCodex: () => void;
}) {
    return (
        <div className="manga-detail-codex">
            {manga.codex ? (
                <div className="manga-detail-codex-content">
                    <CodexSection title="Genres" items={manga.codex.genres} />
                    <CodexSection title="Themes" items={manga.codex.themes} />

                    <div className="manga-detail-codex-row">
                        <span className="manga-detail-codex-label">Target Audience</span>
                        <span className="manga-detail-codex-value">
                            {manga.codex.targetAudience}
                        </span>
                    </div>

                    <div className="manga-detail-codex-row">
                        <span className="manga-detail-codex-label">Estimated Length</span>
                        <span className="manga-detail-codex-value">
                            {manga.codex.estimatedLength.charAt(0).toUpperCase() +
                                manga.codex.estimatedLength.slice(1)}{' '}
                            ({manga.codex.readingTime})
                        </span>
                    </div>

                    <div className="manga-detail-codex-row">
                        <span className="manga-detail-codex-label">Mood</span>
                        <span className="manga-detail-codex-value">{manga.codex.mood}</span>
                    </div>

                    <div className="manga-detail-codex-row">
                        <span className="manga-detail-codex-label">Narrative Style</span>
                        <span className="manga-detail-codex-value">
                            {manga.codex.narrativeStyle}
                        </span>
                    </div>

                    {manga.codex.similarTo.length > 0 && (
                        <CodexSection title="Similar To" items={manga.codex.similarTo} />
                    )}

                    {manga.codex.contentWarnings.length > 0 && (
                        <div className="manga-detail-codex-warnings">
                            <span className="manga-detail-codex-label">Content Warnings</span>
                            <div className="manga-detail-codex-tags manga-detail-codex-tags--warning">
                                {manga.codex.contentWarnings.map((warning, i) => (
                                    <span
                                        key={i}
                                        className="manga-detail-codex-tag manga-detail-codex-tag--warning"
                                    >
                                        {warning}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <p className="manga-detail-codex-empty">
                    No codex generated yet. Generate to get detailed metadata analysis.
                </p>
            )}

            <button
                className="manga-detail-generate-btn"
                onClick={onGenerateCodex}
                disabled={isGenerating}
            >
                {isGenerating ? (
                    <>
                        <Loader size={14} className="spin-icon" />
                        Generating...
                    </>
                ) : manga.codex ? (
                    <>
                        <RefreshCw size={14} />
                        Regenerate Codex
                    </>
                ) : (
                    <>
                        <Sparkles size={14} />
                        Generate Codex
                    </>
                )}
            </button>

            {generationError && <p className="manga-detail-error">{generationError}</p>}
        </div>
    );
});

const ChaptersTab = memo(function ChaptersTab({
    chapters,
    chaptersTotal,
    isLoading,
    onLoadMoreChapters,
    handleChaptersScroll,
}: {
    chapters: MangaDexChapter[];
    chaptersTotal: number;
    isLoading: boolean;
    onLoadMoreChapters: () => void;
    handleChaptersScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}) {
    return (
        <div className="manga-detail-chapters" onScroll={handleChaptersScroll}>
            {chapters.length === 0 && !isLoading && (
                <p className="manga-detail-chapters-empty">No chapters available.</p>
            )}

            {chapters.map((chapter, index) => (
                <ChapterItem key={chapter.id} chapter={chapter} index={index} />
            ))}

            {isLoading && (
                <div className="manga-detail-chapters-loading">
                    <Loader size={16} className="spin-icon" />
                    Loading chapters...
                </div>
            )}

            {chapters.length < chaptersTotal && !isLoading && (
                <button className="manga-detail-load-more" onClick={onLoadMoreChapters}>
                    <ChevronDown size={14} />
                    Load More ({chapters.length} / {chaptersTotal})
                </button>
            )}
        </div>
    );
});

// ─── SUB-COMPONENTS ─────────────────────────────────────────────────────────

const CodexSection: React.FC<{ title: string; items: string[] }> = ({ title, items }) => {
    if (items.length === 0) return null;

    return (
        <div className="manga-detail-codex-section">
            <span className="manga-detail-codex-label">{title}</span>
            <div className="manga-detail-codex-tags">
                {items.map((item, i) => (
                    <span key={i} className="manga-detail-codex-tag">
                        {item}
                    </span>
                ))}
            </div>
        </div>
    );
};

const ChapterItem: React.FC<{ chapter: MangaDexChapter; index: number }> = memo(
    ({ chapter, index }) => {
        const chapterNum = chapter.attributes.chapter;
        const volume = chapter.attributes.volume;
        const title = chapter.attributes.title;
        const pages = chapter.attributes.pages;
        const date = new Date(chapter.attributes.publishAt).toLocaleDateString();

        return (
            <div
                className="manga-detail-chapter"
                style={{ '--chapter-index': index } as React.CSSProperties}
            >
                <div className="manga-detail-chapter-num">
                    {volume && <span className="manga-detail-chapter-vol">Vol. {volume}</span>}
                    <span>Ch. {chapterNum || '?'}</span>
                </div>
                <div className="manga-detail-chapter-info">
                    <span className="manga-detail-chapter-title">
                        {title || `Chapter ${chapterNum || index + 1}`}
                    </span>
                    <span className="manga-detail-chapter-meta">
                        {pages > 0 && `${pages} pages • `}
                        {date}
                    </span>
                </div>
                <a
                    href={`https://mangadex.org/chapter/${chapter.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="manga-detail-chapter-link"
                    onClick={e => e.stopPropagation()}
                    aria-label="Read on MangaDex"
                >
                    <ExternalLink size={14} />
                </a>
            </div>
        );
    },
);
ChapterItem.displayName = 'ChapterItem';

export const MangaDetail = memo(MangaDetailComponent);
MangaDetail.displayName = 'MangaDetail';
