/**
        async (file: File, options: ProcessOptions = {}) => {
 *
 * Handles the full processing pipeline: text extraction → chapter
 * segmentation → cinematification (server or client path) → persistence.
 * Extracted from CinematifierApp.
 */

import { useCallback } from 'react';
import { useCinematifierStore, getCinematifierAIConfig } from '../store/cinematifierStore';
import { saveBook } from '../lib/runtime/cinematifierDb';
import { enrichBookMetadataFromFreeApis } from '../lib/runtime/freeApis';
import {
    cinematifyOffline,
    runFullSystemPipeline,
    extractOverallMetadata,
} from '../lib/cinematifier';
import { ingestDocument, IngestionError } from '../lib/processing/documentIngestion';

import type { Book, CharacterAppearance, ProcessingProgress } from '../types/cinematifier';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Supported by the unified ingestDocument -> extractText pipeline.
const SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.epub', '.docx', '.pptx'];
const CINEMATIFY_PROGRESS_START = 68;
const CINEMATIFY_PROGRESS_END = 98;
const AVERAGE_READING_WPM = 220;

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
}

function isSupportedFile(file: File): boolean {
    const loweredName = file.name.toLowerCase();
    return SUPPORTED_EXTENSIONS.some(ext => loweredName.endsWith(ext));
}

function validateInputFile(file: File): void {
    if (!file.name.trim()) {
        throw new Error('Invalid file: missing filename.');
    }
    if (!isSupportedFile(file)) {
        throw new Error('Unsupported file format. Please upload PDF, TXT, EPUB, DOCX, or PPTX.');
    }
    if (file.size <= 0) {
        throw new Error('The selected file is empty.');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error('File exceeds the 50 MB upload limit.');
    }
}

function isRetryableError(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
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
    if (error instanceof IngestionError) {
        return error.userMessage;
    }
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes('429') || lower.includes('rate limit')) {
        return 'AI rate limit reached. Please retry in a moment or switch provider.';
    }
    if (lower.includes('api key') || lower.includes('401') || lower.includes('403')) {
        return 'AI authentication failed. Please verify your provider key in settings.';
    }
    if (
        lower.includes('network') ||
        lower.includes('failed to fetch') ||
        lower.includes('timeout')
    ) {
        return 'Network issue while processing. Please retry.';
    }
    return message || 'Failed to process file';
}

function toProcessingPhase(
    stage: 'validating' | 'extracting' | 'cleaning' | 'normalizing' | 'detecting_chapters' | 'processing_text' | 'complete',
): ProcessingProgress['phase'] {
    switch (stage) {
        case 'validating':
            return 'uploading';
        case 'extracting':
        case 'cleaning':
        case 'normalizing':
            return 'extracting';
        case 'detecting_chapters':
            return 'segmenting';
        case 'processing_text':
            return 'structuring';
        case 'complete':
            return 'structuring';
    }
}

async function retryAsync<T>(
    operation: () => Promise<T>,
    retries = 2,
    baseDelayMs = 800,
): Promise<T> {
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

                setProgress({
                    phase: 'uploading',
                    currentChapter: 0,
                    totalChapters: 0,
                    percentComplete: 2,
                    message: `Preparing ${file.name}...`,
                });
                const ingestionResult = await retryAsync(() =>
                    ingestDocument(file, {
                        onProgress: update => {
                            setProgress({
                                phase: toProcessingPhase(update.stage),
                                currentChapter: 0,
                                totalChapters: 0,
                                percentComplete: clampPercent(update.percentComplete),
                                message: update.message,
                            });
                        },
                    }),
                );

                const totalWords = ingestionResult.totalWords;
                const now = Date.now();
                const bookId = `book-${now}`;
                const bookData = {
                    id: bookId,
                    title: ingestionResult.title,
                    genre: 'other' as const,
                    status: 'processing' as const,
                    totalChapters: ingestionResult.chapters.length,
                    processedChapters: 0,
                    isPublic: false,
                    chapters: ingestionResult.chapters.map((chapter, index) => ({
                        id: `chapter-${now}-${index}`,
                        bookId,
                        number: index + 1,
                        title: chapter.title || `Chapter ${index + 1}`,
                        originalText: chapter.content,
                        cinematifiedBlocks: [],
                        status: 'pending' as const,
                        wordCount: chapter.narrative.stats.totalWords,
                        isProcessed: false,
                        estimatedReadTime: Math.max(
                            1,
                            Math.ceil(chapter.narrative.stats.totalWords / AVERAGE_READING_WPM),
                        ),
                    })),
                    totalWordCount: totalWords,
                    createdAt: now,
                };

                const bookWithId: Book = {
                    ...bookData,
                    status: 'processing',
                };

                setBook(bookWithId);

                // Non-blocking metadata enrichment from free public APIs.
                void enrichBookMetadataFromFreeApis({ title: ingestionResult.title, timeoutMs: 2200 })
                    .then(metadata => {
                        if (!metadata) return;

                        const updates: Partial<Book> = {};
                        if (metadata.title && metadata.title !== 'Untitled Novel') {
                            updates.title = metadata.title;
                        }
                        if (metadata.author) updates.author = metadata.author;
                        if (metadata.description) updates.description = metadata.description;
                        if (metadata.genre && metadata.genre !== 'other') {
                            updates.genre = metadata.genre;
                        }

                        if (Object.keys(updates).length > 0) {
                            updateBook(updates);
                        }
                    })
                    .catch(error => {
                        console.warn('[Cinematifier] Free API metadata enrichment skipped:', error);
                    });

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
                if (ingestionResult.warnings.length > 0) {
                    const prefix = summary.failedChapters > 0 ? 'Also detected: ' : '';
                    const warningMessage = `${prefix}${ingestionResult.warnings.join(' ')}`;
                    setError(warningMessage);
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
                    percentComplete: 100,
                    message: 'Processing failed. Please retry.',
                });
                setError(toUserFacingError(err));

                // Keep failed state visible briefly so users can read the status update.
                await new Promise(resolve => setTimeout(resolve, 700));
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
    onPipelineProgress?: (percent: number) => void,
): Promise<{ failedChapters: number }> {
    const totalCinematifySpan = CINEMATIFY_PROGRESS_END - CINEMATIFY_PROGRESS_START;
    const progressPerChapter = totalCinematifySpan / Math.max(1, totalChapters);

    // Accumulate book-level metadata without mutating bookWithId
    let detectedGenre: Book['genre'] | undefined;
    const allCharacters: Record<string, CharacterAppearance> = {};
    let failedChapters = 0;

    for (let i = 0; i < totalChapters; i++) {
        const chapterNum = i + 1;
        const baseProgress = CINEMATIFY_PROGRESS_START + i * progressPerChapter;
        updateChapter(i, { status: 'processing', errorMessage: undefined });

        setProgress({
            phase: 'cinematifying',
            currentChapter: chapterNum,
            totalChapters,
            percentComplete: clampPercent(Math.round(baseProgress)),
            message: `Cinematifying chapter ${chapterNum} of ${totalChapters}...`,
        });
        onPipelineProgress?.(clampPercent(Math.round(baseProgress)));

        // Yield to the event loop so React can paint progress updates
        await new Promise(r => setTimeout(r, 0));

        try {
            const chapter = bookWithId.chapters[i];
            const result = await runFullSystemPipeline(chapter.originalText, config, {
                inputIsRebuilt: true,
                onProgress: (pct, msg) => {
                    const percent = clampPercent(
                        Math.round(baseProgress + pct * progressPerChapter),
                    );
                    setProgress({
                        phase: 'cinematifying',
                        currentChapter: chapterNum,
                        totalChapters,
                        percentComplete: percent,
                        message: msg,
                    });
                    onPipelineProgress?.(percent);
                },
            });

            const metadata = extractOverallMetadata(
                result.cinematizedMode.rawText,
                result.cinematizedMode.blocks,
            );

            updateChapter(i, {
                originalModeText: result.originalMode.text,
                originalModeScenes: result.originalMode.scenes,
                cinematifiedBlocks: result.cinematizedMode.blocks,
                cinematifiedText: result.cinematizedMode.rawText,
                isProcessed: true,
                status: 'ready',
                errorMessage: undefined,
                toneTags: metadata.toneTags,
                characters: metadata.characters,
                renderPlan: result.cinematizedMode.renderPlan,
                stageTrace: result.cinematizedMode.stageTrace,
                cinematizedScenes: result.cinematizedMode.scenes,
                narrativeMode: result.cinematizedMode.narrativeMode,
                povCharacter: result.cinematizedMode.povCharacter,
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
                    originalModeText: chapter.originalModeText ?? chapter.originalText,
                    cinematifiedBlocks: fallbackResult.blocks,
                    cinematifiedText: fallbackResult.rawText,
                    isProcessed: true,
                    status: 'ready',
                    errorMessage: 'AI provider failed; offline fallback applied for this chapter.',
                    toneTags: metadata.toneTags,
                    characters: metadata.characters,
                    renderPlan: undefined,
                    stageTrace: undefined,
                    cinematizedScenes: undefined,
                    narrativeMode: undefined,
                    povCharacter: undefined,
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
            message:
                'Unable to process chapters. Please retry with another provider or offline mode.',
        });
        onPipelineProgress?.(100);
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
        onPipelineProgress?.(100);
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
