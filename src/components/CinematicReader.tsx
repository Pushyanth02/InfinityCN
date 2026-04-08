/**
 * CinematicReader.tsx — Reader for Cinematifier
 *
 * Displays novel content with toggle between Original and Cinematified modes.
 * Features Netflix-inspired dark cinematic UI with ambient effects.
 *
 * Custom hooks (extracted to src/hooks/):
 *   - useReadingProgress   — Progress init, time tracking, chapter marking
 *   - useAmbientAudio      — Web Audio synthesis + emotion sync
 *   - useAutoScroll         — Tension-based auto-scroll pacing
 *   - useChapterProcessing  — On-demand chapter cinematification
 *
 * Sub-components (extracted to reader/):
 *   - CinematicBlockView — Animated block renderer
 *   - OriginalTextView   — Plain text view
 *   - EmotionHeatmap     — Tension heatmap
 *   - ChapterNav         — Chapter navigation sidebar
 *   - ReaderHeader       — Header bar with controls
 *   - ReaderSettingsPanel — Settings dropdown
 *   - ReaderFooter       — Chapter navigation footer
 */

import React, { useRef, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Film, Sparkles } from 'lucide-react';
import { useCinematifierStore } from '../store/cinematifierStore';

// Extracted custom hooks
import { useReadingProgress, useAmbientAudio, useAutoScroll, useChapterProcessing } from '../hooks';

// Extracted sub-components
import {
    CinematicRenderer,
    OriginalTextView,
    EmotionHeatmap,
    ChapterNav,
    ReaderChapterSidebar,
    ReaderCharactersPanel,
    ReaderHeader,
    ReaderSettingsPanel,
    ReaderFooter,
} from './reader';

// Hoisted constant to avoid recreating the threshold array on every render cycle
const OBSERVER_THRESHOLDS: number[] = [0, 0.25, 0.5, 0.75, 1];

interface CinematicReaderProps {
    onClose: () => void;
}

// ─── Main Reader Component ─────────────────────────────────

export const CinematicReader: React.FC<CinematicReaderProps> = ({ onClose }) => {
    const chapterNavTriggerRef = useRef<HTMLButtonElement>(null);
    const book = useCinematifierStore(s => s.book);
    const readerMode = useCinematifierStore(s => s.readerMode);
    const currentChapterIndex = useCinematifierStore(s => s.currentChapterIndex);
    const fontSize = useCinematifierStore(s => s.fontSize);
    const lineSpacing = useCinematifierStore(s => s.lineSpacing);
    const immersionLevel = useCinematifierStore(s => s.immersionLevel);
    const dyslexiaFont = useCinematifierStore(s => s.dyslexiaFont);
    const darkMode = useCinematifierStore(s => s.darkMode);
    const aiProvider = useCinematifierStore(s => s.aiProvider);
    const setReaderMode = useCinematifierStore(s => s.setReaderMode);
    const setCurrentChapter = useCinematifierStore(s => s.setCurrentChapter);
    const setFontSize = useCinematifierStore(s => s.setFontSize);
    const setLineSpacing = useCinematifierStore(s => s.setLineSpacing);
    const setImmersionLevel = useCinematifierStore(s => s.setImmersionLevel);
    const toggleDyslexiaFont = useCinematifierStore(s => s.toggleDyslexiaFont);
    const toggleDarkMode = useCinematifierStore(s => s.toggleDarkMode);

    const [showSettings, setShowSettings] = useState(false);
    const [showChapterNav, setShowChapterNav] = useState(false);

    // Cross-chunk tracking states
    const [activeEmotion, setActiveEmotion] = useState<string>('');
    const [activeTension, setActiveTension] = useState<number>(0);

    const contentRef = useRef<HTMLDivElement>(null);

    const currentChapter = book?.chapters[currentChapterIndex];
    const activeCharacters = currentChapter?.characters ?? book?.characters;

    // ─── Custom Hooks ──────────────────────────────────────────
    const { readingProgress, bookmarks, isBookmarked, toggleBookmark } = useReadingProgress();
    const { isAmbientSoundEnabled, toggleAmbientSound } = useAmbientAudio(
        activeEmotion,
        readerMode,
    );
    const { isAutoScrolling, toggleAutoScroll } = useAutoScroll(
        contentRef,
        activeTension,
        readerMode,
    );
    const { isProcessingChapter, processCurrentChapter, cancelProcessing } = useChapterProcessing(
        currentChapter,
        currentChapterIndex,
        readerMode,
    );

    // Active block tracking for dynamic themes and tension
    useEffect(() => {
        if (readerMode !== 'cinematified' || !contentRef.current) return;

        const root = contentRef.current;
        const observer = new IntersectionObserver(
            (entries: IntersectionObserverEntry[]) => {
                let maxRatio = 0;
                let bestEntry: IntersectionObserverEntry | null = null;

                entries.forEach(entry => {
                    if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
                        maxRatio = entry.intersectionRatio;
                        bestEntry = entry;
                    }
                });

                if (bestEntry) {
                    const target = (bestEntry as IntersectionObserverEntry).target as HTMLElement;
                    setActiveEmotion(target.getAttribute('data-emotion') || '');
                    setActiveTension(Number(target.getAttribute('data-tension')) || 0);
                }
            },
            {
                root,
                rootMargin: '-20% 0px -40% 0px',
                threshold: OBSERVER_THRESHOLDS,
            },
        );

        const timeout = setTimeout(() => {
            root.querySelectorAll('.cine-block').forEach(block => observer.observe(block));
        }, 100);

        return () => {
            clearTimeout(timeout);
            observer.disconnect();
        };
    }, [currentChapter, readerMode]);

    // Scroll to top on chapter change
    useEffect(() => {
        contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, [currentChapterIndex, readerMode]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showSettings) setShowSettings(false);
                else if (showChapterNav) setShowChapterNav(false);
                else onClose();
            } else if (e.key === 'ArrowLeft' && currentChapterIndex > 0) {
                setCurrentChapter(currentChapterIndex - 1);
            } else if (
                e.key === 'ArrowRight' &&
                book &&
                currentChapterIndex < book.chapters.length - 1
            ) {
                setCurrentChapter(currentChapterIndex + 1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentChapterIndex, book, onClose, setCurrentChapter, showSettings, showChapterNav]);

    if (!book || !currentChapter) {
        return (
            <div className="cine-reader cine-reader--empty">
                <p>No book loaded.</p>
                <button onClick={onClose} className="cine-btn cine-btn--primary">
                    Go Back
                </button>
            </div>
        );
    }

    return (
        <div
            className={`cine-reader cine-reader--immersion-${immersionLevel} ${dyslexiaFont ? 'cine-reader--dyslexia' : ''} ${!darkMode ? 'cine-reader--light' : ''}`}
            data-active-emotion={activeEmotion}
        >
            {/* Ambient background effects (cinematic immersion only) */}
            {immersionLevel === 'cinematic' && darkMode && (
                <div className="cine-ambient">
                    <div className="cine-ambient-glow cine-ambient-glow--1" />
                    <div className="cine-ambient-glow cine-ambient-glow--2" />
                    <div className="cine-ambient-vignette" />
                </div>
            )}

            {/* Header */}
            <ReaderHeader
                book={book}
                readerMode={readerMode}
                setReaderMode={setReaderMode}
                isBookmarked={isBookmarked}
                currentChapterIndex={currentChapterIndex}
                toggleBookmark={toggleBookmark}
                isAmbientSoundEnabled={isAmbientSoundEnabled}
                onToggleAmbientSound={toggleAmbientSound}
                isAutoScrolling={isAutoScrolling}
                onToggleAutoScroll={toggleAutoScroll}
                onToggleSettings={() => setShowSettings(!showSettings)}
                onShowChapterNav={() => setShowChapterNav(true)}
                onClose={onClose}
                chapterNavTriggerRef={chapterNavTriggerRef}
            />

            {/* Settings Panel */}
            <AnimatePresence>
                {showSettings && (
                    <ReaderSettingsPanel
                        fontSize={fontSize}
                        setFontSize={setFontSize}
                        lineSpacing={lineSpacing}
                        setLineSpacing={setLineSpacing}
                        immersionLevel={immersionLevel}
                        setImmersionLevel={setImmersionLevel}
                        dyslexiaFont={dyslexiaFont}
                        toggleDyslexiaFont={toggleDyslexiaFont}
                        darkMode={darkMode}
                        toggleDarkMode={toggleDarkMode}
                        aiProvider={aiProvider}
                        bookmarkCount={bookmarks.length}
                    />
                )}
            </AnimatePresence>

            {/* 3-Panel Reader Body */}
            <div className="cine-reader-body">
                <ReaderChapterSidebar
                    chapters={book.chapters}
                    currentChapterIndex={currentChapterIndex}
                    bookmarks={bookmarks}
                    onSelectChapter={setCurrentChapter}
                />
                {/* Scrollable Content */}
                <main
                    className="cine-content"
                    ref={contentRef}
                    style={{
                        '--cine-reader-font-size': `${fontSize}px`,
                        '--cine-reader-line-height': lineSpacing
                    } as React.CSSProperties}
                >
                    <div className="cine-content-inner">
                        {/* Chapter Title */}
                        <div className="cine-chapter-header">
                            <span className="cine-chapter-number">Chapter {currentChapter.number}</span>
                            <h2 className="cine-chapter-title">{currentChapter.title}</h2>
                            <div className="cine-chapter-meta">
                                <span>{currentChapter.wordCount.toLocaleString()} words</span>
                                <span>·</span>
                                <span>{currentChapter.estimatedReadTime} min read</span>
                            </div>
                        </div>

                        {/* Emotion Heatmap */}
                        {currentChapter.cinematifiedBlocks.length > 0 && (
                            <EmotionHeatmap blocks={currentChapter.cinematifiedBlocks} />
                        )}
                        {isProcessingChapter &&
                            readerMode === 'cinematified' &&
                            currentChapter.cinematifiedBlocks.length === 0 && (
                                <div className="cine-processing">
                                    <Sparkles size={24} className="cine-processing-icon" />
                                    <p>Cinematifying chapter…</p>
                                    <button
                                        className="cine-btn cine-btn--secondary cine-mt-1"
                                        onClick={cancelProcessing}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}

                        {readerMode === 'original' ? (
                            <div className="cine-blocks-wrapper">
                                <OriginalTextView text={currentChapter.originalText} />
                            </div>
                        ) : currentChapter.cinematifiedBlocks.length > 0 ? (
                            <div className="cine-blocks-wrapper">
                                <div className="cine-blocks">
                                    <CinematicRenderer
                                        blocks={currentChapter.cinematifiedBlocks}
                                        immersionLevel={immersionLevel}
                                    />
                                    {isProcessingChapter && (
                                        <div className="cine-processing cine-processing-inline">
                                            <Sparkles size={16} className="cine-processing-icon" />
                                            <p>Generating…</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : !isProcessingChapter ? (
                            <div className="cine-blocks-wrapper">
                                <div className="cine-empty-state">
                                    <Film size={48} />
                                    <p>Chapter not yet cinematified</p>
                                    <button
                                        className="cine-btn cine-btn--primary"
                                        onClick={processCurrentChapter}
                                    >
                                        <Sparkles size={16} />
                                        Process Now
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </main>
                <ReaderCharactersPanel characters={activeCharacters} />
            </div>

            {/* Chapter Navigation Footer */}
            <ReaderFooter
                book={book}
                currentChapterIndex={currentChapterIndex}
                setCurrentChapter={setCurrentChapter}
                readingProgress={readingProgress}
            />

            {/* Chapter Navigation Sidebar */}
            <ChapterNav
                chapters={book.chapters}
                currentIndex={currentChapterIndex}
                bookmarks={bookmarks}
                onSelect={setCurrentChapter}
                isOpen={showChapterNav}
                onClose={() => setShowChapterNav(false)}
                triggerRef={chapterNavTriggerRef}
            />
        </div>
    );

};

export default CinematicReader;
