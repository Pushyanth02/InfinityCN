/**
 * CinematicReader.tsx — Dual-mode reader for Cinematifier
 *
 * Displays novel content with toggle between Original and Cinematified modes.
 * Features Netflix-inspired dark cinematic UI with ambient effects.
 */

import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    ChevronLeft,
    ChevronRight,
    Film,
    BookOpen,
    Settings,
    Minus,
    Plus,
    Sparkles,
    Volume2,
    Moon,
    Sun,
    List,
    Bookmark,
    BookmarkCheck,
    Play,
    Square,
    Columns,
    Download,
} from 'lucide-react';
import { useCinematifierStore, getCinematifierAIConfig } from '../store/cinematifierStore';
import { cinematifyText, cinematifyOffline } from '../lib/cinematifier';
import { AmbientAudioSynth } from '../lib/audioSynth';
import { saveBook, saveReadingProgress, loadReadingProgress } from '../lib/cinematifierDb';
import { createReadingProgress } from '../lib/cinematifier';
import type { CinematicBlock, Chapter } from '../types/cinematifier';

// Hoisted constant to avoid recreating the threshold array on every render cycle
const OBSERVER_THRESHOLDS: number[] = [0, 0.25, 0.5, 0.75, 1];

interface CinematicReaderProps {
    onClose: () => void;
}

// ─── Block Renderer ────────────────────────────────────────

const CinematicBlockView = React.memo(function CinematicBlockView({
    block,
    index,
    immersionLevel,
}: {
    block: CinematicBlock;
    index: number;
    immersionLevel: 'minimal' | 'balanced' | 'cinematic';
}) {
    const isMinimal = immersionLevel === 'minimal';
    const durationMult = immersionLevel === 'cinematic' ? 1.5 : 1;
    const baseDelay = isMinimal ? 0 : Math.min(index * 0.03, 0.5);

    // Different animations based on block type
    const variants = {
        hidden: isMinimal
            ? {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  filter: 'blur(0px)',
              }
            : {
                  opacity: 0,
                  y: block.type === 'sfx' ? 0 : 30,
                  scale: block.type === 'sfx' ? 0.8 : 1,
                  filter: 'blur(8px)',
              },
        visible: {
            opacity: 1,
            y: 0,
            scale: 1,
            filter: 'blur(0px)',
            transition: isMinimal
                ? { duration: 0 }
                : {
                      duration: (block.type === 'beat' ? 0.8 : 0.6) * durationMult,
                      delay: baseDelay,
                      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
                  },
        },
    };

    const blockClasses = [
        'cine-block',
        `cine-block--${block.type}`,
        `cine-block--${block.intensity}`,
        block.timing ? `cine-block--timing-${block.timing}` : '',
    ]
        .filter(Boolean)
        .join(' ');

    // Render based on block type
    switch (block.type) {
        case 'sfx':
            return (
                <motion.div
                    className={blockClasses}
                    variants={variants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-5% 0px' }}
                    data-index={index}
                    data-emotion={block.emotion || ''}
                    data-tension={block.tensionScore || 0}
                >
                    <div className="cine-sfx">
                        <Volume2 size={16} className="cine-sfx-icon" />
                        <span className="cine-sfx-text">{block.sfx?.sound || block.content}</span>
                    </div>
                </motion.div>
            );

        case 'beat':
            return (
                <motion.div
                    className={blockClasses}
                    variants={variants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-5% 0px' }}
                    data-index={index}
                    data-emotion={block.emotion || ''}
                    data-tension={block.tensionScore || 0}
                >
                    <div className="cine-beat">
                        <span className="cine-beat-dots">• • •</span>
                        <span className="cine-beat-label">{block.beat?.type || 'BEAT'}</span>
                    </div>
                </motion.div>
            );

        case 'transition':
            return (
                <motion.div
                    className={blockClasses}
                    variants={variants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-5% 0px' }}
                    data-index={index}
                    data-emotion={block.emotion || ''}
                    data-tension={block.tensionScore || 0}
                >
                    <div className="cine-transition">
                        <div className="cine-transition-line" />
                        <span className="cine-transition-text">
                            {block.transition?.type || 'CUT TO'}
                            {block.transition?.description && `: ${block.transition.description}`}
                        </span>
                        <div className="cine-transition-line" />
                    </div>
                </motion.div>
            );

        case 'title_card':
            return (
                <motion.div
                    className={blockClasses}
                    variants={variants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-5% 0px' }}
                    data-index={index}
                    data-emotion={block.emotion || ''}
                    data-tension={block.tensionScore || 0}
                >
                    <h2 className="cine-title-card">{block.content}</h2>
                </motion.div>
            );

        case 'dialogue':
            return (
                <motion.div
                    className={blockClasses}
                    variants={variants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-5% 0px' }}
                    data-index={index}
                    data-emotion={block.emotion || ''}
                    data-tension={block.tensionScore || 0}
                >
                    {block.speaker && <div className="cine-speaker">{block.speaker}</div>}
                    <div className="cine-dialogue">
                        <span className="cine-quote">"</span>
                        {block.content}
                        <span className="cine-quote">"</span>
                    </div>
                    {/* Emotion Tag */}
                    {block.emotion && (
                        <div className={`cine-emotion-tag cine-emotion--${block.emotion}`}>
                            {block.emotion}
                        </div>
                    )}
                </motion.div>
            );

        case 'inner_thought':
            return (
                <motion.div
                    className={blockClasses}
                    variants={variants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-5% 0px' }}
                    data-index={index}
                    data-emotion={block.emotion || ''}
                    data-tension={block.tensionScore || 0}
                >
                    <div className="cine-thought">
                        <em>{block.content}</em>
                    </div>
                    {/* Emotion Tag */}
                    {block.emotion && (
                        <div className={`cine-emotion-tag cine-emotion--${block.emotion}`}>
                            {block.emotion}
                        </div>
                    )}
                </motion.div>
            );

        case 'action':
        default:
            return (
                <motion.div
                    className={blockClasses}
                    variants={variants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-5% 0px' }}
                    data-index={index}
                    data-emotion={block.emotion || ''}
                    data-tension={block.tensionScore || 0}
                >
                    {block.cameraDirection && (
                        <div className="cine-camera">({block.cameraDirection})</div>
                    )}
                    <p className="cine-action">{block.content}</p>

                    {/* Emotion & Tension UI */}
                    <div className="cine-action-metadata">
                        {block.emotion && (
                            <div className={`cine-emotion-tag cine-emotion--${block.emotion}`}>
                                {block.emotion}
                            </div>
                        )}
                        {block.tensionScore !== undefined && block.tensionScore > 0 && (
                            <div
                                className="cine-tension-meter"
                                title={`Tension: ${block.tensionScore}`}
                            >
                                <div
                                    className="cine-tension-bar"
                                    style={{
                                        width: `${block.tensionScore}%`,
                                        backgroundColor: `hsl(${120 - block.tensionScore * 1.2}, 80%, 50%)`,
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </motion.div>
            );
    }
});

// ─── Original Text Renderer ────────────────────────────────

const OriginalTextView = React.memo(function OriginalTextView({ text }: { text: string }) {
    const paragraphs = useMemo(() => text.split(/\n\s*\n/).filter(p => p.trim()), [text]);

    return (
        <div className="original-text-view">
            {paragraphs.map((para, i) => (
                <motion.p
                    key={i}
                    className="original-paragraph"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-5% 0px' }}
                    transition={{ duration: 0.5, delay: Math.min(i * 0.02, 0.3) }}
                >
                    {para}
                </motion.p>
            ))}
        </div>
    );
});

// ─── Chapter Navigation ────────────────────────────────────

const ChapterNav = React.memo(function ChapterNav({
    chapters,
    currentIndex,
    bookmarks,
    onSelect,
    isOpen,
    onClose,
}: {
    chapters: Chapter[];
    currentIndex: number;
    bookmarks: number[];
    onSelect: (index: number) => void;
    isOpen: boolean;
    onClose: () => void;
}) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        className="chapter-nav-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.nav
                        className="chapter-nav"
                        initial={{ x: -300, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -300, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    >
                        <div className="chapter-nav-header">
                            <h3>Chapters</h3>
                            <button onClick={onClose} className="chapter-nav-close">
                                <X size={20} />
                            </button>
                        </div>
                        <ul className="chapter-nav-list">
                            {chapters.map((chapter, i) => (
                                <li key={chapter.id}>
                                    <button
                                        className={`chapter-nav-item ${i === currentIndex ? 'active' : ''}`}
                                        onClick={() => {
                                            onSelect(i);
                                            onClose();
                                        }}
                                    >
                                        <span className="chapter-nav-number">{chapter.number}</span>
                                        <span className="chapter-nav-title">{chapter.title}</span>
                                        {bookmarks.includes(i) && (
                                            <BookmarkCheck
                                                size={14}
                                                className="chapter-nav-bookmark"
                                            />
                                        )}
                                        {chapter.isProcessed && (
                                            <Sparkles size={14} className="chapter-nav-processed" />
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </motion.nav>
                </>
            )}
        </AnimatePresence>
    );
});

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
        return () => ambientSynthRef.current?.stop();
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

        // Try to load from IndexedDB first
        loadReadingProgress(book.id)
            .then(stored => {
                if (stored) {
                    setReadingProgress(stored);
                    // Restore chapter position
                    if (stored.currentChapter > 1) {
                        const idx = stored.currentChapter - 1;
                        if (idx < book.chapters.length) {
                            useCinematifierStore.getState().setCurrentChapter(idx);
                        }
                    }
                    // Restore reading mode preference
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
            // Persist progress on unmount
            const progress = useCinematifierStore.getState().readingProgress;
            if (progress) saveReadingProgress(progress).catch(() => {});
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Track chapter changes in reading progress
    useEffect(() => {
        if (!readingProgress || !book) return;

        updateReadingProgress({ currentChapter: currentChapterIndex + 1 });
        // Mark the chapter as read after staying on it
        const timer = setTimeout(() => {
            markChapterRead(currentChapterIndex + 1);
        }, 5_000); // Mark as read after 5 seconds on the chapter

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
                result = await cinematifyText(
                    currentChapter.originalText,
                    config,
                    undefined,
                    (blocks, isDone) => {
                        // Stream parsed blocks incrementally
                        updateChapter(currentChapterIndex, {
                            cinematifiedBlocks: blocks,
                            isProcessed: isDone,
                        });
                    },
                );
            }

            // Final push
            updateChapter(currentChapterIndex, {
                cinematifiedBlocks: result.blocks,
                cinematifiedText: result.rawText,
                isProcessed: true,
            });
            // Persist to IndexedDB
            const updatedBook = useCinematifierStore.getState().book;
            if (updatedBook) saveBook(updatedBook).catch(() => {});
        } catch (err) {
            console.error('[CinematicReader] Process error:', err);
            // Fall back to offline processing
            const result = cinematifyOffline(currentChapter.originalText);
            updateChapter(currentChapterIndex, {
                cinematifiedBlocks: result.blocks,
                cinematifiedText: result.rawText,
                isProcessed: true,
            });
            const updatedBook = useCinematifierStore.getState().book;
            if (updatedBook) saveBook(updatedBook).catch(() => {});
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

        // Small delay to allow react blocks to render before observing
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
                // Base speed is ~40px per second. Tension drastically slows this down to build suspense.
                // activeTension is 0-100. multiplier goes from 1.0 (chill) to 0.3 (very tense)
                const speedMultiplier = 1 - ((activeTension || 0) / 100) * 0.7;
                const pixelsToScroll = (40 * speedMultiplier * dt) / 1000;

                contentRef.current.scrollTop += pixelsToScroll;

                // Stop if bottom is reached
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

    const canGoPrev = currentChapterIndex > 0;
    const canGoNext = currentChapterIndex < book.chapters.length - 1;

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
            <header className="cine-header">
                <div className="cine-header-left">
                    <button
                        className="cine-btn cine-btn--icon"
                        onClick={() => setShowChapterNav(true)}
                        title="Chapter list"
                    >
                        <List size={20} />
                    </button>
                    <h1 className="cine-title">{book.title}</h1>
                </div>

                <div className="cine-header-center">
                    {/* Mode Toggle */}
                    <div className="cine-mode-toggle">
                        <button
                            className={`cine-mode-btn ${readerMode === 'original' ? 'active' : ''}`}
                            onClick={() => setReaderMode('original')}
                        >
                            <BookOpen size={16} />
                            <span>Original</span>
                        </button>
                        <button
                            className={`cine-mode-btn ${readerMode === 'side-by-side' ? 'active' : ''}`}
                            onClick={() => setReaderMode('side-by-side')}
                        >
                            <Columns size={16} />
                            <span>Dual</span>
                        </button>
                        <button
                            className={`cine-mode-btn ${readerMode === 'cinematified' ? 'active' : ''}`}
                            onClick={() => setReaderMode('cinematified')}
                        >
                            <Film size={16} />
                            <span>Cinematic</span>
                        </button>
                    </div>
                </div>

                <div className="cine-header-right">
                    <button
                        className={`cine-btn cine-btn--icon ${isAmbientSoundEnabled ? 'cine-btn--active' : ''}`}
                        onClick={() => {
                            if (!isAmbientSoundEnabled && ambientSynthRef.current) {
                                ambientSynthRef.current.play();
                            } else if (ambientSynthRef.current) {
                                ambientSynthRef.current.stop();
                            }
                            setIsAmbientSoundEnabled(!isAmbientSoundEnabled);
                        }}
                        title={
                            isAmbientSoundEnabled ? 'Disable Ambient Sound' : 'Enable Ambient Sound'
                        }
                    >
                        <Volume2
                            size={20}
                            color={isAmbientSoundEnabled ? 'var(--cine-gold)' : undefined}
                        />
                    </button>
                    <button
                        className={`cine-btn cine-btn--icon ${isAutoScrolling ? 'cine-btn--active' : ''}`}
                        onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                        title={isAutoScrolling ? 'Stop Auto-Scroll' : 'Start Auto-Scroll'}
                    >
                        {isAutoScrolling ? (
                            <Square size={20} color="var(--cine-red)" />
                        ) : (
                            <Play size={20} />
                        )}
                    </button>
                    <button
                        className={`cine-btn cine-btn--icon ${isBookmarked ? 'cine-btn--bookmarked' : ''}`}
                        onClick={() => toggleBookmark(currentChapterIndex)}
                        title={isBookmarked ? 'Remove bookmark' : 'Bookmark chapter'}
                    >
                        {isBookmarked ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
                    </button>
                    <button
                        className="cine-btn cine-btn--icon"
                        onClick={() => {
                            const text = book.chapters
                                .map(c => `Chapter ${c.number}: ${c.title}\n\n${c.originalText}`)
                                .join('\n\n\n');
                            const blob = new Blob([text], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${book.title}_Original_Text.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                        }}
                        title="Export Original Text"
                    >
                        <Download size={20} />
                    </button>
                    <button
                        className="cine-btn cine-btn--icon"
                        onClick={() => setShowSettings(!showSettings)}
                        title="Settings"
                    >
                        <Settings size={20} />
                    </button>
                    <button className="cine-btn cine-btn--icon" onClick={onClose} title="Close">
                        <X size={20} />
                    </button>
                </div>
            </header>

            {/* Settings Panel */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div
                        className="cine-settings"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                    >
                        <div className="cine-settings-group">
                            <label>Font Size</label>
                            <div className="cine-settings-row">
                                <button
                                    className="cine-btn cine-btn--sm"
                                    onClick={() => setFontSize(fontSize - 2)}
                                >
                                    <Minus size={14} />
                                </button>
                                <span className="cine-settings-value">{fontSize}px</span>
                                <button
                                    className="cine-btn cine-btn--sm"
                                    onClick={() => setFontSize(fontSize + 2)}
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                        <div className="cine-settings-group">
                            <label>Line Spacing</label>
                            <div className="cine-settings-row">
                                <button
                                    className="cine-btn cine-btn--sm"
                                    onClick={() => setLineSpacing(lineSpacing - 0.2)}
                                >
                                    <Minus size={14} />
                                </button>
                                <span className="cine-settings-value">
                                    {lineSpacing.toFixed(1)}
                                </span>
                                <button
                                    className="cine-btn cine-btn--sm"
                                    onClick={() => setLineSpacing(lineSpacing + 0.2)}
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                        <div className="cine-settings-group">
                            <label>Immersion</label>
                            <div className="cine-settings-row">
                                {(['minimal', 'balanced', 'cinematic'] as const).map(level => (
                                    <button
                                        key={level}
                                        className={`cine-btn cine-btn--sm ${immersionLevel === level ? 'active' : ''}`}
                                        onClick={() => setImmersionLevel(level)}
                                    >
                                        {level.charAt(0).toUpperCase() + level.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="cine-settings-group">
                            <label>Dyslexia Font</label>
                            <button
                                className={`cine-btn cine-btn--toggle ${dyslexiaFont ? 'active' : ''}`}
                                onClick={toggleDyslexiaFont}
                            >
                                {dyslexiaFont ? 'On' : 'Off'}
                            </button>
                        </div>
                        <div className="cine-settings-group">
                            <label>Theme</label>
                            <button
                                className={`cine-btn cine-btn--toggle ${darkMode ? 'active' : ''}`}
                                onClick={toggleDarkMode}
                            >
                                {darkMode ? <Moon size={16} /> : <Sun size={16} />}
                                {darkMode ? 'Dark' : 'Light'}
                            </button>
                        </div>
                        <div className="cine-settings-group">
                            <label>AI Provider</label>
                            <span className="cine-settings-value cine-settings-value--muted">
                                {aiProvider === 'none' ? 'Offline' : aiProvider}
                            </span>
                        </div>
                        {bookmarks.length > 0 && (
                            <div className="cine-settings-group">
                                <label>Bookmarks</label>
                                <span className="cine-settings-value cine-settings-value--muted">
                                    {bookmarks.length} chapter{bookmarks.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Chapter Title */}
            <div className="cine-chapter-header">
                <span className="cine-chapter-number">Chapter {currentChapter.number}</span>
                <h2 className="cine-chapter-title">{currentChapter.title}</h2>
                <div className="cine-chapter-meta">
                    <span>{currentChapter.wordCount.toLocaleString()} words</span>
                    <span>•</span>
                    <span>{currentChapter.estimatedReadTime} min read</span>
                </div>
            </div>

            {/* Content Area */}
            <main
                className={`cine-content ${readerMode === 'side-by-side' ? 'cine-content--dual' : ''}`}
                ref={contentRef}
                style={{ fontSize: `${fontSize}px`, lineHeight: lineSpacing }}
            >
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
                ) : readerMode === 'side-by-side' ? (
                    <>
                        <div className="cine-dual-pane cine-dual-pane--left">
                            <OriginalTextView text={currentChapter.originalText} />
                        </div>
                        <div className="cine-dual-pane cine-dual-pane--right">
                            {currentChapter.cinematifiedBlocks.length > 0 ? (
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
                            ) : !isProcessingChapter ? (
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
                            ) : null}
                        </div>
                    </>
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
            <footer className="cine-footer">
                <button
                    className="cine-nav-btn"
                    onClick={() => setCurrentChapter(currentChapterIndex - 1)}
                    disabled={!canGoPrev}
                >
                    <ChevronLeft size={24} />
                    <span>Previous</span>
                </button>

                <div className="cine-progress">
                    <span>
                        {currentChapterIndex + 1} / {book.chapters.length}
                        {readingProgress && readingProgress.readChapters.length > 0 && (
                            <span
                                style={{
                                    marginLeft: '0.5rem',
                                    color: 'var(--cine-gold)',
                                    fontSize: '0.625rem',
                                }}
                            >
                                {readingProgress.readChapters.length} read
                            </span>
                        )}
                    </span>
                    <div className="cine-progress-bar">
                        <div
                            className="cine-progress-fill"
                            style={{
                                width: `${((readingProgress?.readChapters.length || 0) / book.chapters.length) * 100}%`,
                            }}
                        />
                    </div>
                </div>

                <button
                    className="cine-nav-btn"
                    onClick={() => setCurrentChapter(currentChapterIndex + 1)}
                    disabled={!canGoNext}
                >
                    <span>Next</span>
                    <ChevronRight size={24} />
                </button>
            </footer>

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
