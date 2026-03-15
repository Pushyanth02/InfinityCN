/**
 * CinematicReader.tsx — Reader for Cinematifier
 *
 * Displays novel content with toggle between Original and Cinematified modes.
 * Features Netflix-inspired dark cinematic UI with ambient effects.
 *
 * Sub-components extracted to reader/:
 *   - CinematicBlockView — Animated block renderer
 *   - OriginalTextView   — Plain text view
 *   - EmotionHeatmap     — Tension heatmap
 *   - ChapterNav         — Chapter navigation sidebar
 *   - ReaderHeader       — Header bar with controls
 *   - ReaderSettingsPanel — Settings dropdown
 *   - ReaderFooter       — Chapter navigation footer
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Film, Sparkles } from 'lucide-react';
import { useCinematifierStore, getCinematifierAIConfig } from '../store/cinematifierStore';
import { cinematifyText, cinematifyOffline } from '../lib/cinematifier';
import { AmbientAudioSynth } from '../lib/audioSynth';
import { saveBook, saveReadingProgress, loadReadingProgress } from '../lib/cinematifierDb';
import { createReadingProgress } from '../lib/cinematifier';
import type { CinematicBlock } from '../types/cinematifier';

// Extracted sub-components
import {
    CinematicBlockView,
    OriginalTextView,
    EmotionHeatmap,
    ChapterNav,
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
    const toggleBookmark = useCinematifierStore(s => s.toggleBookmark);
    const updateChapter = useCinematifierStore(s => s.updateChapter);
    const readingProgress = useCinematifierStore(s => s.readingProgress);
    const setReadingProgress = useCinematifierStore(s => s.setReadingProgress);
    const markChapterRead = useCinematifierStore(s => s.markChapterRead);
    const updateReadingProgress = useCinematifierStore(s => s.updateReadingProgress);
    const addReadingTime = useCinematifierStore(s => s.addReadingTime);

    const bookmarks = readingProgress?.bookmarks ?? [];
    const isBookmarked = bookmarks.includes(currentChapterIndex);

    const [isProcessingChapter, setIsProcessingChapter] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showChapterNav, setShowChapterNav] = useState(false);

    // Cross-chunk tracking states
    const [activeEmotion, setActiveEmotion] = useState<string>('');
    const [activeTension, setActiveTension] = useState<number>(0);
    const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false);
    const [isAmbientSoundEnabled, setIsAmbientSoundEnabled] = useState<boolean>(false);

    const contentRef = useRef<HTMLDivElement>(null);
    const readingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const autoScrollRef = useRef<number | null>(null);
    const ambientSynthRef = useRef<AmbientAudioSynth | null>(null);

    // Initialize audio synth
    useEffect(() => {
        ambientSynthRef.current = new AmbientAudioSynth();
        return () => ambientSynthRef.current?.destroy();
    }, []);

    // Sync audio theme with scrolling/reading position
    useEffect(() => {
        if (!isAmbientSoundEnabled || readerMode !== 'cinematified') {
            ambientSynthRef.current?.stop();
            return;
        }

        if (activeEmotion) {
            ambientSynthRef.current?.setEmotion(activeEmotion);
        } else {
            ambientSynthRef.current?.setEmotion('neutral');
        }
    }, [activeEmotion, readerMode, isAmbientSoundEnabled]);

    const currentChapter = book?.chapters[currentChapterIndex];

    // Initialize reading progress on mount
    useEffect(() => {
        if (!book) return;
        if (readingProgress && readingProgress.bookId === book.id) return;

        loadReadingProgress(book.id)
            .then(stored => {
                if (stored) {
                    setReadingProgress(stored);
                    if (stored.currentChapter > 1) {
                        const idx = stored.currentChapter - 1;
                        if (idx < book.chapters.length) {
                            useCinematifierStore.getState().setCurrentChapter(idx);
                        }
                    }
                    if (stored.readingMode) {
                        useCinematifierStore.getState().setReaderMode(stored.readingMode);
                    }
                } else {
                    setReadingProgress(createReadingProgress(book.id));
                }
            })
            .catch(() => {
                setReadingProgress(createReadingProgress(book.id));
            });
    }, [book, readingProgress, setReadingProgress]);

    // Track reading time (increment every 30 seconds while reader is open)
    useEffect(() => {
        readingTimerRef.current = setInterval(() => {
            addReadingTime(30);
        }, 30_000);

        return () => {
            if (readingTimerRef.current) clearInterval(readingTimerRef.current);
            const progress = useCinematifierStore.getState().readingProgress;
            if (progress)
                saveReadingProgress(progress).catch(e => {
                    console.warn('[CinematicReader] Failed to persist reading progress:', e);
                });
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Track chapter changes in reading progress
    useEffect(() => {
        if (!readingProgress || !book) return;

        updateReadingProgress({ currentChapter: currentChapterIndex + 1 });
        const timer = setTimeout(() => {
            markChapterRead(currentChapterIndex + 1);
        }, 5_000);

        return () => clearTimeout(timer);
    }, [currentChapterIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    // Process current chapter if not yet cinematified
    const processCurrentChapter = useCallback(async () => {
        if (!currentChapter || currentChapter.isProcessed) return;
        if (isProcessingChapter) return;

        setIsProcessingChapter(true);

        try {
            const config = getCinematifierAIConfig();
            let result;

            if (config.provider === 'none') {
                result = cinematifyOffline(currentChapter.originalText);
            } else {
                const accumulatedBlocks: CinematicBlock[] = [];
                result = await cinematifyText(
                    currentChapter.originalText,
                    config,
                    undefined,
                    (blocks, isDone) => {
                        accumulatedBlocks.push(...blocks);
                        updateChapter(currentChapterIndex, {
                            cinematifiedBlocks: [...accumulatedBlocks],
                            isProcessed: isDone,
                        });
                    },
                );
            }

            updateChapter(currentChapterIndex, {
                cinematifiedBlocks: result.blocks,
                cinematifiedText: result.rawText,
                isProcessed: true,
            });
            const updatedBook = useCinematifierStore.getState().book;
            if (updatedBook)
                saveBook(updatedBook).catch(e => {
                    console.warn('[CinematicReader] Failed to persist book:', e);
                });
        } catch (err) {
            console.error('[CinematicReader] Process error:', err);
            const result = cinematifyOffline(currentChapter.originalText);
            updateChapter(currentChapterIndex, {
                cinematifiedBlocks: result.blocks,
                cinematifiedText: result.rawText,
                isProcessed: true,
            });
            const updatedBook = useCinematifierStore.getState().book;
            if (updatedBook)
                saveBook(updatedBook).catch(e => {
                    console.warn('[CinematicReader] Failed to persist book:', e);
                });
        } finally {
            setIsProcessingChapter(false);
        }
    }, [currentChapter, currentChapterIndex, isProcessingChapter, updateChapter]);

    // Auto-process chapter when it changes
    useEffect(() => {
        if (currentChapter && !currentChapter.isProcessed && readerMode === 'cinematified') {
            processCurrentChapter();
        }
    }, [currentChapter, readerMode, processCurrentChapter]);

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

    // Tension-based Auto-Scroll Pacing
    useEffect(() => {
        if (!isAutoScrolling || !contentRef.current || readerMode !== 'cinematified') {
            if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current);
            return;
        }

        let lastTime = performance.now();
        const scrollStep = (time: number) => {
            const dt = time - lastTime;
            lastTime = time;

            if (contentRef.current) {
                const speedMultiplier = 1 - ((activeTension || 0) / 100) * 0.7;
                const pixelsToScroll = (40 * speedMultiplier * dt) / 1000;

                contentRef.current.scrollTop += pixelsToScroll;

                if (
                    contentRef.current.scrollTop + contentRef.current.clientHeight >=
                    contentRef.current.scrollHeight - 2
                ) {
                    setIsAutoScrolling(false);
                    return;
                }
            }

            autoScrollRef.current = requestAnimationFrame(scrollStep);
        };

        autoScrollRef.current = requestAnimationFrame(scrollStep);

        return () => {
            if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current);
        };
    }, [isAutoScrolling, activeTension, readerMode]);

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
                onToggleAmbientSound={() => {
                    if (!isAmbientSoundEnabled && ambientSynthRef.current) {
                        ambientSynthRef.current.play();
                    } else if (ambientSynthRef.current) {
                        ambientSynthRef.current.stop();
                    }
                    setIsAmbientSoundEnabled(!isAmbientSoundEnabled);
                }}
                isAutoScrolling={isAutoScrolling}
                onToggleAutoScroll={() => setIsAutoScrolling(!isAutoScrolling)}
                onToggleSettings={() => setShowSettings(!showSettings)}
                onShowChapterNav={() => setShowChapterNav(true)}
                onClose={onClose}
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

            {/* Content Area */}
            <main
                className="cine-content"
                ref={contentRef}
                style={{ fontSize: `${fontSize}px`, lineHeight: lineSpacing }}
            >
                {/* Chapter Title — inside scrollable area so it doesn't cover content */}
                <div className="cine-chapter-header">
                    <span className="cine-chapter-number">Chapter {currentChapter.number}</span>
                    <h2 className="cine-chapter-title">{currentChapter.title}</h2>
                    <div className="cine-chapter-meta">
                        <span>{currentChapter.wordCount.toLocaleString()} words</span>
                        <span>•</span>
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
                            <p>Cinematifying chapter...</p>
                        </div>
                    )}

                {readerMode === 'original' ? (
                    <div className="cine-blocks-wrapper">
                        <OriginalTextView text={currentChapter.originalText} />
                    </div>
                ) : currentChapter.cinematifiedBlocks.length > 0 ? (
                    <div className="cine-blocks-wrapper">
                        <div className="cine-blocks">
                            {currentChapter.cinematifiedBlocks.map((block, i) => (
                                <CinematicBlockView
                                    key={block.id}
                                    block={block}
                                    index={i}
                                    immersionLevel={immersionLevel}
                                />
                            ))}
                            {isProcessingChapter && (
                                <div className="cine-processing cine-processing-inline">
                                    <Sparkles size={16} className="cine-processing-icon" />
                                    <p>Generating...</p>
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
            </main>

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
            />
        </div>
    );
};

export default CinematicReader;
