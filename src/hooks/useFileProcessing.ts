/**
        async (file: File, options: ProcessOptions = {}) => {
 *
 * Handles the full processing pipeline: text extraction → chapter
 * segmentation → cinematification (server or client path) → persistence.
 * Extracted from CinematifierApp.
 */

import { useCallback } from 'react';
import { useCinematifierStore, getCinematifierAIConfig } from '../store/cinematifierStore';
import { extractText } from '../lib/processing/pdfWorker';
import { saveBook } from '../lib/runtime/cinematifierDb';
import {
    segmentChapters,
    createBookFromSegments,
    cinematifyText,
    cinematifyOffline,
    cleanExtractedText,
    reconstructParagraphs,
    extractOverallMetadata,
} from '../lib/cinematifier';

import type { Book, CharacterAppearance, ProcessingProgress } from '../types/cinematifier';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.epub'];

function isSupportedFile(file: File): boolean {
    const loweredName = file.name.toLowerCase();
    return SUPPORTED_EXTENSIONS.some(ext => loweredName.endsWith(ext));
}

function validateInputFile(file: File): void {
    if (!file.name.trim()) {
        throw new Error('Invalid file: missing filename.');
    }
    if (!isSupportedFile(file)) {
        throw new Error('Unsupported file format. Please upload PDF, TXT, or EPUB.');
    }
    if (file.size <= 0) {
        throw new Error('The selected file is empty.');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error('File exceeds the 50 MB upload limit.');
    }
}

function isRetryableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('503') ||
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('failed to fetch')
    );
}

function toUserFacingError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes('429') || lower.includes('rate limit')) {
        return 'AI rate limit reached. Please retry in a moment or switch provider.';
    }
    if (lower.includes('api key') || lower.includes('401') || lower.includes('403')) {
        return 'AI authentication failed. Please verify your provider key in settings.';
    }
    if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('timeout')) {
        return 'Network issue while processing. Please retry.';
    }
    return message || 'Failed to process file';
}

async function retryAsync<T>(operation: () => Promise<T>, retries = 2, baseDelayMs = 800): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt >= retries || !isRetryableError(error)) break;
            const delayMs = Math.min(baseDelayMs * 2 ** attempt, 4000);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function accumulateCharacters(
    target: Record<string, CharacterAppearance>,
    source: Record<string, CharacterAppearance>,
) {
    for (const [charName, charData] of Object.entries(source)) {
        if (!target[charName]) {
            target[charName] = {
                appearances: [],
                dialogueCount: 0,
            };
        }
        target[charName].appearances.push(...charData.appearances);
        target[charName].dialogueCount += charData.dialogueCount;
    }
}

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
                validateInputFile(file);

                // Phase 1: Extract text from file
                setProgress({
                    phase: 'extracting',
                    currentChapter: 0,
                    totalChapters: 0,
                    percentComplete: 10,
                    message: 'Extracting text...',
                });

                let text = await retryAsync(() => extractText(file));
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
                if (segments.length === 0) {
                    throw new Error('Could not detect readable chapters from the uploaded text.');
                }
                const bookTitle = file.name.replace(/\.(pdf|epub|docx|pptx|txt)$/i, '');
                const bookData = createBookFromSegments(segments, bookTitle);

                const bookWithId: Book = {
                    ...bookData,
                    status: 'processing',
                };

                setBook(bookWithId);

                const config = getCinematifierAIConfig();
                const totalChapters = bookWithId.chapters.length;

                // ── Client-side processing path ───────────────────────
                const summary = await processClientSide(
                    bookWithId,
                    totalChapters,
                    config,
                    setProgress,
                    updateChapter,
                    updateBook,
                    setProcessing,
                );

                if (summary.failedChapters > 0) {
                    const chapterLabel = summary.failedChapters === 1 ? 'chapter' : 'chapters';
                    setError(
                        summary.failedChapters === totalChapters
                            ? `Processing failed for all chapters. Please retry with another provider or run offline.`
                            : `Processed with warnings: ${summary.failedChapters} ${chapterLabel} failed and were marked for retry.`,
                    );
                }

                if (summary.failedChapters < totalChapters) {
                    onComplete();
                }
            } catch (err) {
                console.error('[Cinematifier] Processing error:', err);
                setProgress({
                    phase: 'error',
                    currentChapter: 0,
                    totalChapters: 0,
                    percentComplete: 0,
                    message: 'Processing failed. Please retry.',
                });
                setError(toUserFacingError(err));
                setProcessing(false);
            }
        },
        [setProcessing, setProgress, setError, setBook, updateBook, updateChapter, onComplete],
    );

    return processFile;
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
): Promise<{ failedChapters: number }> {
    const progressPerChapter = 45 / totalChapters;

    // Accumulate book-level metadata without mutating bookWithId
    let detectedGenre: Book['genre'] | undefined;
    const allCharacters: Record<string, CharacterAppearance> = {};
    let failedChapters = 0;

    for (let i = 0; i < totalChapters; i++) {
        const chapterNum = i + 1;
        const baseProgress = 50 + i * progressPerChapter;
        updateChapter(i, { status: 'processing', errorMessage: undefined });

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
                status: 'ready',
                errorMessage: undefined,
                toneTags: metadata.toneTags,
                characters: metadata.characters,
            });

            // Accumulate book-level metadata
            if (i === 0 && metadata.genre && bookWithId.genre === 'other') {
                detectedGenre = metadata.genre;
            }

            accumulateCharacters(allCharacters, metadata.characters);
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
                    status: 'ready',
                    errorMessage: 'AI provider failed; offline fallback applied for this chapter.',
                    toneTags: metadata.toneTags,
                    characters: metadata.characters,
                });

                // Accumulate characters from fallback
                accumulateCharacters(allCharacters, metadata.characters);
            } catch (fallbackErr) {
                failedChapters += 1;
                updateChapter(i, {
                    status: 'error',
                    isProcessed: false,
                    errorMessage:
                        fallbackErr instanceof Error
                            ? fallbackErr.message
                            : 'Failed to process chapter. You can retry later.',
                });
            }
        }
    }

    // Push accumulated book-level metadata to the store
    const bookUpdates: Partial<Book> = {
        status: failedChapters === totalChapters ? 'error' : ('ready' as const),
    };
    if (detectedGenre) bookUpdates.genre = detectedGenre;
    if (Object.keys(allCharacters).length > 0) bookUpdates.characters = allCharacters;
    if (failedChapters > 0) {
        bookUpdates.errorMessage = `${failedChapters} chapter${failedChapters === 1 ? '' : 's'} failed to process.`;
    }
    updateBook(bookUpdates);

    if (failedChapters === totalChapters) {
        setProgress({
            phase: 'error',
            currentChapter: totalChapters,
            totalChapters,
            percentComplete: 100,
            message: 'Unable to process chapters. Please retry with another provider or offline mode.',
        });
    } else {
        // Complete
        setProgress({
            phase: 'complete',
            currentChapter: totalChapters,
            totalChapters,
            percentComplete: 100,
            message:
                failedChapters > 0
                    ? 'Processing complete with some chapter failures.'
                    : 'Ready to read!',
        });
    }

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
    return { failedChapters };
}
