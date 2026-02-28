/**
 * CinematifierApp.tsx — Main Application Component
 *
 * Handles the full flow: Document Upload → Processing → Reading
 */

import React, { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Film, Upload, Settings, X, Sparkles, AlertCircle, Moon, Sun } from 'lucide-react';
import { useCinematifierStore, getCinematifierAIConfig } from '../store/cinematifierStore';
import { extractText, detectFormat, ACCEPTED_EXTENSIONS } from '../lib/pdfWorker';
import {
    segmentChapters,
    createBookFromSegments,
    cinematifyText,
    cinematifyOffline,
    cleanExtractedText,
    reconstructParagraphs,
    extractOverallMetadata,
} from '../lib/cinematifier';
import { saveBook, loadLatestBook } from '../lib/cinematifierDb';
import type { Book, ProcessingProgress, CharacterAppearance } from '../types/cinematifier';

// Lazy load components
const CinematicReader = lazy(() =>
    import('./CinematicReader').then(m => ({ default: m.CinematicReader })),
);
const CinematifierSettings = lazy(() =>
    import('./CinematifierSettings').then(m => ({ default: m.CinematifierSettings })),
);

// ─── Upload Zone Component ─────────────────────────────────

interface UploadZoneProps {
    onFileSelect: (file: File) => void;
    isProcessing: boolean;
}

const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelect, isProcessing }) => {
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                try {
                    detectFormat(file);
                    onFileSelect(file);
                } catch {
                    // Unsupported format — silently ignore drag
                }
            }
        },
        [onFileSelect],
    );

    const handleClick = useCallback(() => {
        inputRef.current?.click();
    }, []);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                onFileSelect(files[0]);
            }
        },
        [onFileSelect],
    );

    return (
        <div
            className={`cine-upload-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    handleClick();
                }
            }}
        >
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                style={{ display: 'none' }}
                onChange={handleChange}
                disabled={isProcessing}
            />
            <div className="cine-upload-content">
                <Upload size={48} className="cine-upload-icon" />
                <p className="cine-upload-text">
                    {isDragging ? 'Drop your file here' : 'Drop a document or click to upload'}
                </p>
                <p className="cine-upload-hint">PDF, EPUB, DOCX, PPTX, TXT supported</p>
            </div>
        </div>
    );
};

// ─── Processing Overlay ────────────────────────────────────

interface ProcessingOverlayProps {
    progress: ProcessingProgress | null;
}

const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({ progress }) => {
    if (!progress) return null;

    return (
        <motion.div
            className="cine-processing-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <div className="cine-processing-content">
                <div className="cine-processing-spinner" />
                <p className="cine-processing-phase">{progress.message}</p>
                <div className="cine-processing-bar">
                    <div
                        className="cine-processing-bar-fill"
                        style={{ width: `${progress.percentComplete}%` }}
                    />
                </div>
                <span className="cine-processing-percent">{progress.percentComplete}%</span>
            </div>
        </motion.div>
    );
};

// ─── Main App Component ────────────────────────────────────

export const CinematifierApp: React.FC = () => {
    const book = useCinematifierStore(s => s.book);
    const isProcessing = useCinematifierStore(s => s.isProcessing);
    const processingProgress = useCinematifierStore(s => s.processingProgress);
    const error = useCinematifierStore(s => s.error);
    const aiProvider = useCinematifierStore(s => s.aiProvider);
    const darkMode = useCinematifierStore(s => s.darkMode);
    const setBook = useCinematifierStore(s => s.setBook);
    const setProcessing = useCinematifierStore(s => s.setProcessing);
    const setProgress = useCinematifierStore(s => s.setProgress);
    const setError = useCinematifierStore(s => s.setError);
    const updateBook = useCinematifierStore(s => s.updateBook);
    const updateChapter = useCinematifierStore(s => s.updateChapter);
    const toggleDarkMode = useCinematifierStore(s => s.toggleDarkMode);
    const reset = useCinematifierStore(s => s.reset);

    const [showSettings, setShowSettings] = useState(false);
    const [showReader, setShowReader] = useState(false);

    // Hydrate book from IndexedDB on mount
    useEffect(() => {
        if (!book) {
            loadLatestBook()
                .then(stored => {
                    if (stored) setBook(stored);
                })
                .catch(() => {
                    /* IndexedDB unavailable */
                });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Process uploaded file
    const processFile = useCallback(
        async (file: File) => {
            setProcessing(true);
            setError(null);

            try {
                // Phase 1: Extract text from file
                setProgress({
                    phase: 'extracting',
                    currentChapter: 0,
                    totalChapters: 0,
                    percentComplete: 10,
                    message: 'Extracting text...',
                });

                let text = await extractText(file);
                const isPDF = file.name.toLowerCase().endsWith('.pdf');
                if (isPDF) {
                    text = cleanExtractedText(text);
                }

                // Apply intelligent paragraph reconstruction for all documents
                text = reconstructParagraphs(text);

                if (!text || text.trim().length < 100) {
                    throw new Error(
                        'Could not extract enough text from the file (minimum 100 characters). The file may be empty, image-based, or encrypted.',
                    );
                }

                // Phase 2: Segment into chapters
                setProgress({
                    phase: 'segmenting',
                    currentChapter: 0,
                    totalChapters: 0,
                    percentComplete: 30,
                    message: 'Detecting chapters...',
                });

                const segments = segmentChapters(text);
                const bookTitle = file.name.replace(/\.(pdf|epub|docx|pptx|txt)$/i, '');
                const bookData = createBookFromSegments(segments, bookTitle);

                const bookWithId: Book = {
                    ...bookData,
                    id: `book-${Date.now()}`,
                    status: 'processing',
                };

                setBook(bookWithId);

                // Phase 3: Cinematify ALL chapters upfront
                const config = getCinematifierAIConfig();
                const totalChapters = bookWithId.chapters.length;
                const progressPerChapter = 45 / totalChapters; // 50% to 95% across all chapters

                // Accumulate book-level metadata without mutating bookWithId
                let detectedGenre: Book['genre'] | undefined;
                const allCharacters: Record<string, CharacterAppearance> = {};

                for (let i = 0; i < totalChapters; i++) {
                    const chapterNum = i + 1;
                    const baseProgress = 50 + i * progressPerChapter;

                    setProgress({
                        phase: 'cinematifying',
                        currentChapter: chapterNum,
                        totalChapters,
                        percentComplete: Math.round(baseProgress),
                        message: `Cinematifying chapter ${chapterNum} of ${totalChapters}...`,
                    });

                    // Yield to the event loop so React can paint progress updates
                    await new Promise(r => setTimeout(r, 0));

                    try {
                        const chapter = bookWithId.chapters[i];
                        let result;

                        if (config.provider === 'none') {
                            result = cinematifyOffline(chapter.originalText);
                        } else {
                            result = await cinematifyText(
                                chapter.originalText,
                                config,
                                (pct, msg) => {
                                    setProgress({
                                        phase: 'cinematifying',
                                        currentChapter: chapterNum,
                                        totalChapters,
                                        percentComplete: Math.round(
                                            baseProgress + pct * progressPerChapter,
                                        ),
                                        message: msg,
                                    });
                                },
                            );
                        }

                        const metadata = extractOverallMetadata(result.rawText, result.blocks);

                        updateChapter(i, {
                            cinematifiedBlocks: result.blocks,
                            cinematifiedText: result.rawText,
                            isProcessed: true,
                            toneTags: metadata.toneTags,
                            characters: metadata.characters,
                        });

                        // Accumulate book-level metadata
                        if (i === 0 && metadata.genre && bookWithId.genre === 'other') {
                            detectedGenre = metadata.genre;
                        }

                        for (const [charName, charData] of Object.entries(metadata.characters)) {
                            if (!allCharacters[charName]) {
                                allCharacters[charName] = {
                                    appearances: [],
                                    dialogueCount: 0,
                                };
                            }
                            allCharacters[charName].appearances.push(...charData.appearances);
                            allCharacters[charName].dialogueCount += charData.dialogueCount;
                        }
                    } catch (chapterErr) {
                        console.warn(`[Cinematifier] Chapter ${chapterNum} fallback:`, chapterErr);
                        // Use offline fallback for this chapter
                        try {
                            const chapter = bookWithId.chapters[i];
                            const fallbackResult = cinematifyOffline(chapter.originalText);
                            const metadata = extractOverallMetadata(
                                fallbackResult.rawText,
                                fallbackResult.blocks,
                            );
                            updateChapter(i, {
                                cinematifiedBlocks: fallbackResult.blocks,
                                cinematifiedText: fallbackResult.rawText,
                                isProcessed: true,
                                toneTags: metadata.toneTags,
                                characters: metadata.characters,
                            });

                            // Accumulate characters from fallback
                            for (const [charName, charData] of Object.entries(
                                metadata.characters,
                            )) {
                                if (!allCharacters[charName]) {
                                    allCharacters[charName] = {
                                        appearances: [],
                                        dialogueCount: 0,
                                    };
                                }
                                allCharacters[charName].appearances.push(...charData.appearances);
                                allCharacters[charName].dialogueCount += charData.dialogueCount;
                            }
                        } catch {
                            // Skip this chapter - user can retry later
                        }
                    }
                }

                // Push accumulated book-level metadata to the store
                const bookUpdates: Partial<Book> = { status: 'ready' as const };
                if (detectedGenre) bookUpdates.genre = detectedGenre;
                if (Object.keys(allCharacters).length > 0) bookUpdates.characters = allCharacters;
                updateBook(bookUpdates);

                // Complete
                setProgress({
                    phase: 'complete',
                    currentChapter: totalChapters,
                    totalChapters,
                    percentComplete: 100,
                    message: 'Ready to read!',
                });

                // Persist processed book to IndexedDB
                const finalBook = useCinematifierStore.getState().book;
                if (finalBook) {
                    saveBook(finalBook).catch(err =>
                        console.warn('[Cinematifier] Failed to persist book:', err),
                    );
                }

                // Short delay then show reader
                await new Promise(r => setTimeout(r, 500));
                setProcessing(false);
                setShowReader(true);
            } catch (err) {
                console.error('[Cinematifier] Processing error:', err);
                setError(err instanceof Error ? err.message : 'Failed to process file');
                setProcessing(false);
            }
        },
        [setProcessing, setProgress, setError, setBook, updateBook, updateChapter],
    );

    // Close reader and go back to home
    const handleCloseReader = useCallback(() => {
        setShowReader(false);
    }, []);

    // Continue reading existing book
    const handleContinueReading = useCallback(() => {
        if (book) {
            setShowReader(true);
        }
    }, [book]);

    // Start fresh
    const handleNewBook = useCallback(() => {
        reset();
    }, [reset]);

    return (
        <div className={`cinematifier-app ${!darkMode ? 'cinematifier-app--light' : ''}`}>
            {/* Reader View */}
            {showReader && book && (
                <Suspense
                    fallback={
                        <div className="cine-reader cine-reader--empty">
                            <div className="cine-processing-spinner" />
                        </div>
                    }
                >
                    <CinematicReader onClose={handleCloseReader} />
                </Suspense>
            )}

            {/* Home View */}
            {!showReader && (
                <div className="cine-home">
                    {/* Header */}
                    <header className="cine-home-header">
                        <div className="cine-logo">
                            <Film size={32} />
                            <span className="cine-logo-text">Cinematifier</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                className="cine-btn cine-btn--icon"
                                onClick={toggleDarkMode}
                                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                            >
                                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                            </button>
                            <button
                                className="cine-btn cine-btn--icon"
                                onClick={() => setShowSettings(true)}
                                title="AI Settings"
                            >
                                <Settings size={20} />
                            </button>
                        </div>
                    </header>

                    {/* Main Content */}
                    <main className="cine-home-content">
                        <div className="cine-home-hero">
                            <h1>Transform Novels into Cinematic Experiences</h1>
                            <p>
                                Upload a novel and watch it come alive with dramatic SFX, cinematic
                                transitions, and screenplay-style formatting. AI-powered
                                transformation for an immersive reading experience.
                            </p>
                        </div>

                        {/* Show existing novel option or upload */}
                        {book && !isProcessing && (
                            <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
                                <p
                                    style={{
                                        color: 'var(--cine-text-secondary)',
                                        marginBottom: '1rem',
                                    }}
                                >
                                    Continue reading <strong>{book.title}</strong>?
                                </p>
                                <div
                                    style={{
                                        display: 'flex',
                                        gap: '1rem',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <button
                                        className="cine-btn cine-btn--primary"
                                        onClick={handleContinueReading}
                                    >
                                        <Sparkles size={16} />
                                        Continue Reading
                                    </button>
                                    <button className="cine-btn" onClick={handleNewBook}>
                                        New Book
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Upload Zone */}
                        {(!book || isProcessing) && (
                            <UploadZone onFileSelect={processFile} isProcessing={isProcessing} />
                        )}

                        {/* Error Display */}
                        {error && (
                            <motion.div
                                className="cine-error"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                            >
                                <AlertCircle size={24} />
                                <p className="cine-error-text">{error}</p>
                                <button className="cine-btn" onClick={() => setError(null)}>
                                    Dismiss
                                </button>
                            </motion.div>
                        )}

                        {/* AI Provider Status */}
                        <div
                            style={{
                                marginTop: '2rem',
                                textAlign: 'center',
                                color: 'var(--cine-text-muted)',
                                fontSize: '0.875rem',
                            }}
                        >
                            AI: {aiProvider === 'none' ? 'Offline mode' : aiProvider}
                            {aiProvider === 'none' && (
                                <span style={{ display: 'block', marginTop: '0.25rem' }}>
                                    Click settings to configure an AI provider for enhanced results
                                </span>
                            )}
                        </div>
                    </main>
                </div>
            )}

            {/* Processing Overlay */}
            <AnimatePresence>
                {isProcessing && <ProcessingOverlay progress={processingProgress} />}
            </AnimatePresence>

            {/* AI Settings Modal */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div
                        className="cine-settings-modal-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowSettings(false)}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0, 0, 0, 0.8)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 200,
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            onClick={e => e.stopPropagation()}
                            style={{
                                background: 'var(--cine-bg-secondary)',
                                borderRadius: '12px',
                                padding: '1.5rem',
                                maxWidth: '500px',
                                width: '90%',
                                maxHeight: '80vh',
                                overflow: 'auto',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '1rem',
                                }}
                            >
                                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>AI Settings</h2>
                                <button
                                    className="cine-btn cine-btn--icon"
                                    onClick={() => setShowSettings(false)}
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <Suspense fallback={<div>Loading...</div>}>
                                <CinematifierSettings onClose={() => setShowSettings(false)} />
                            </Suspense>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CinematifierApp;
