/**
 * useFileProcessing — File upload and cinematification hook
 *
 * Handles the full processing pipeline: text extraction → chapter
 * segmentation → cinematification (server or client path) → persistence.
 * Extracted from CinematifierApp.
 */

import { useCallback } from 'react';
import { useCinematifierStore, getCinematifierAIConfig } from '../store/cinematifierStore';
import { extractText } from '../lib/pdfWorker';
import { saveBook } from '../lib/cinematifierDb';
import {
    segmentChapters,
    createBookFromSegments,
    cinematifyText,
    cinematifyOffline,
    cleanExtractedText,
    reconstructParagraphs,
    extractOverallMetadata,
} from '../lib/cinematifier';
import {
    isServerProcessingAvailable,
    submitBookForServerProcessing,
    connectToJobEvents,
    getProcessedChapter,
} from '../lib/serverJobs';
import type { Book, CharacterAppearance, ProcessingProgress } from '../types/cinematifier';
import { toClientBlocks } from '../types/cinematifier';

export function useFileProcessing(onComplete: () => void) {
    const setBook = useCinematifierStore(s => s.setBook);
    const setProcessing = useCinematifierStore(s => s.setProcessing);
    const setProgress = useCinematifierStore(s => s.setProgress);
    const setError = useCinematifierStore(s => s.setError);
    const updateBook = useCinematifierStore(s => s.updateBook);
    const updateChapter = useCinematifierStore(s => s.updateChapter);

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
                    status: 'processing',
                };

                setBook(bookWithId);

                // ── Server-side processing path ──────────────────────
                const config = getCinematifierAIConfig();
                const totalChapters = bookWithId.chapters.length;

                if (
                    isServerProcessingAvailable() &&
                    config.provider !== 'none' &&
                    config.provider !== 'chrome'
                ) {
                    await processServerSide(
                        bookWithId,
                        totalChapters,
                        config,
                        setProgress,
                        updateChapter,
                        updateBook,
                        setProcessing,
                        onComplete,
                    );
                    return;
                }

                // ── Client-side processing path ───────────────────────
                await processClientSide(
                    bookWithId,
                    totalChapters,
                    config,
                    setProgress,
                    updateChapter,
                    updateBook,
                    setProcessing,
                    onComplete,
                );
            } catch (err) {
                console.error('[Cinematifier] Processing error:', err);
                setError(err instanceof Error ? err.message : 'Failed to process file');
                setProcessing(false);
            }
        },
        [setProcessing, setProgress, setError, setBook, updateBook, updateChapter, onComplete],
    );

    return processFile;
}

// ─── Server-side processing helper ──────────────────────────

async function processServerSide(
    bookWithId: Book,
    totalChapters: number,
    config: ReturnType<typeof getCinematifierAIConfig>,
    setProgress: (progress: ProcessingProgress) => void,
    updateChapter: (
        index: number,
        updates: Partial<import('../types/cinematifier').Chapter>,
    ) => void,
    updateBook: (updates: Partial<Book>) => void,
    setProcessing: (v: boolean) => void,
    onComplete: () => void,
) {
    setProgress({
        phase: 'cinematifying',
        currentChapter: 0,
        totalChapters,
        percentComplete: 50,
        message: 'Submitting to server for processing...',
    });

    const chaptersPayload = bookWithId.chapters.map(ch => ({
        title: ch.title,
        originalText: ch.originalText,
    }));

    await submitBookForServerProcessing(
        bookWithId.id,
        bookWithId.title,
        chaptersPayload,
        config.provider,
    );

    // Connect SSE and wait for completion
    await new Promise<void>((resolve, reject) => {
        const cleanup = connectToJobEvents(
            bookWithId.id,
            // onProgress
            event => {
                const processed = event.processedChapters ?? 0;
                const total = event.totalChapters ?? totalChapters;
                const pct = 50 + Math.round((processed / total) * 45);
                setProgress({
                    phase: 'cinematifying',
                    currentChapter: (event.chapterIndex ?? processed) + 1,
                    totalChapters: total,
                    percentComplete: pct,
                    message: `Server processing chapter ${(event.chapterIndex ?? processed) + 1} of ${total}...`,
                });
            },
            // onComplete
            async () => {
                try {
                    for (let i = 0; i < totalChapters; i++) {
                        const result = await getProcessedChapter(bookWithId.id, i);
                        updateChapter(i, {
                            cinematifiedBlocks: toClientBlocks(result.blocks),
                            cinematifiedText: result.rawText,
                            isProcessed: true,
                        });
                    }
                    resolve();
                } catch (err) {
                    reject(err);
                }
            },
            // onError
            errorMsg => {
                cleanup();
                reject(new Error(errorMsg));
            },
        );
    });

    // Finalize
    updateBook({ status: 'ready' as const });

    setProgress({
        phase: 'complete',
        currentChapter: totalChapters,
        totalChapters,
        percentComplete: 100,
        message: 'Ready to read!',
    });

    const finalBook = useCinematifierStore.getState().book;
    if (finalBook) {
        saveBook(finalBook).catch(err =>
            console.warn('[Cinematifier] Failed to persist book:', err),
        );
    }

    await new Promise(r => setTimeout(r, 500));
    setProcessing(false);
    onComplete();
}

// ─── Client-side processing helper ──────────────────────────

async function processClientSide(
    bookWithId: Book,
    totalChapters: number,
    config: ReturnType<typeof getCinematifierAIConfig>,
    setProgress: (progress: ProcessingProgress) => void,
    updateChapter: (
        index: number,
        updates: Partial<import('../types/cinematifier').Chapter>,
    ) => void,
    updateBook: (updates: Partial<Book>) => void,
    setProcessing: (v: boolean) => void,
    onComplete: () => void,
) {
    const progressPerChapter = 45 / totalChapters;

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
                result = await cinematifyText(chapter.originalText, config, (pct, msg) => {
                    setProgress({
                        phase: 'cinematifying',
                        currentChapter: chapterNum,
                        totalChapters,
                        percentComplete: Math.round(baseProgress + pct * progressPerChapter),
                        message: msg,
                    });
                });
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
        saveBook(finalBook).catch((err: unknown) =>
            console.warn('[Cinematifier] Failed to persist book:', err),
        );
    }

    // Short delay then show reader
    await new Promise(r => setTimeout(r, 500));
    setProcessing(false);
    onComplete();
}
