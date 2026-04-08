/**
 * useChapterProcessing — Chapter cinematification hook
 *
 * Handles on-demand processing of a single chapter via the enriched
 * offline pipeline, AI provider, or offline fallback.
 * Extracted from CinematicReader.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useCinematifierStore, getCinematifierAIConfig } from '../store/cinematifierStore';
import { cinematifyText, cinematifyOffline, CinematificationPipeline } from '../lib/cinematifier';
import { saveBook } from '../lib/runtime/cinematifierDb';
import type { CinematicBlock, ReaderMode, Chapter } from '../types/cinematifier';

function toChapterErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes('429') || lower.includes('rate limit')) {
        return 'AI rate limit reached while processing this chapter.';
    }
    if (lower.includes('api key') || lower.includes('401') || lower.includes('403')) {
        return 'AI authentication failed for this chapter.';
    }
    if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('timeout')) {
        return 'Network issue while processing this chapter.';
    }
    return message || 'Failed to process chapter.';
}

export function useChapterProcessing(
    currentChapter: Chapter | undefined,
    currentChapterIndex: number,
    readerMode: ReaderMode,
) {

    const updateChapter = useCinematifierStore(s => s.updateChapter);
    const setError = useCinematifierStore(s => s.setError);
    const [isProcessingChapter, setIsProcessingChapter] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const retryCinematifyText = useCallback(
        async (
            text: string,
            config: ReturnType<typeof getCinematifierAIConfig>,
            onChunk: (blocks: CinematicBlock[], isDone: boolean) => void,
            signal: AbortSignal,
        ) => {
            let lastError: unknown;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    return await cinematifyText(text, config, undefined, onChunk, signal);
                } catch (error) {
                    lastError = error;
                    if (signal.aborted) throw error;
                    if (attempt >= 1) break;
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
            }
            throw lastError instanceof Error ? lastError : new Error(String(lastError));
        },
        [],
    );


    const processCurrentChapter = useCallback(async () => {
        if (!currentChapter || currentChapter.isProcessed) return;
        if (isProcessingChapter) return;

        setIsProcessingChapter(true);
        const controller = new AbortController();
        abortControllerRef.current = controller;
        let streamingFlushFrame: number | null = null;
        let pendingIsDone = false;
        updateChapter(currentChapterIndex, { status: 'processing', errorMessage: undefined });

        try {
            const config = getCinematifierAIConfig();
            let result;

            if (config.provider === 'none') {
                const pipeline = CinematificationPipeline.createEnrichedOfflinePipeline();
                // If pipeline supports abort signal, pass it here (future-proof)
                result = await pipeline.execute(currentChapter.originalText);
            } else {
                const accumulatedBlocks: CinematicBlock[] = [];

                const flushStreamingBlocks = (isDone: boolean) => {
                    updateChapter(currentChapterIndex, {
                        cinematifiedBlocks: [...accumulatedBlocks],
                        isProcessed: isDone,
                    });
                };

                const scheduleStreamingFlush = (isDone: boolean) => {
                    pendingIsDone = pendingIsDone || isDone;
                    if (streamingFlushFrame !== null) return;
                    streamingFlushFrame = window.requestAnimationFrame(() => {
                        streamingFlushFrame = null;
                        flushStreamingBlocks(pendingIsDone);
                        pendingIsDone = false;
                    });
                };

                result = await retryCinematifyText(
                    currentChapter.originalText,
                    config,
                    (blocks, isDone) => {
                        accumulatedBlocks.push(...blocks);
                        scheduleStreamingFlush(isDone);
                    },
                    controller.signal,
                );

                if (streamingFlushFrame !== null) {
                    window.cancelAnimationFrame(streamingFlushFrame);
                    streamingFlushFrame = null;
                }
            }

            updateChapter(currentChapterIndex, {
                cinematifiedBlocks: result.blocks,
                cinematifiedText: result.rawText,
                isProcessed: true,
                status: 'ready',
                errorMessage: undefined,
            });
            const updatedBook = useCinematifierStore.getState().book;
            if (updatedBook)
                saveBook(updatedBook).catch(e => {
                    console.warn('[CinematicReader] Failed to persist book:', e);
                });
        } catch (err) {
            if (streamingFlushFrame !== null) {
                window.cancelAnimationFrame(streamingFlushFrame);
                streamingFlushFrame = null;
            }
            if (controller.signal.aborted) {
                // Cancelled by user, do not update chapter
                return;
            }
            console.error('[CinematicReader] Process error:', err);
            if (!currentChapter) return;
            try {
                const result = cinematifyOffline(currentChapter.originalText);
                updateChapter(currentChapterIndex, {
                    cinematifiedBlocks: result.blocks,
                    cinematifiedText: result.rawText,
                    isProcessed: true,
                    status: 'ready',
                    errorMessage: 'AI provider failed; offline fallback applied for this chapter.',
                });
                setError('AI processing failed for the chapter; offline fallback was applied.');
                const updatedBook = useCinematifierStore.getState().book;
                if (updatedBook)
                    saveBook(updatedBook).catch(e => {
                        console.warn('[CinematicReader] Failed to persist book:', e);
                    });
            } catch (fallbackError) {
                const message = toChapterErrorMessage(fallbackError);
                updateChapter(currentChapterIndex, {
                    status: 'error',
                    isProcessed: false,
                    errorMessage: message,
                });
                setError(`Chapter processing failed: ${message}`);
            }
        } finally {
            if (streamingFlushFrame !== null) {
                window.cancelAnimationFrame(streamingFlushFrame);
            }
            setIsProcessingChapter(false);
            abortControllerRef.current = null;
        }
    }, [currentChapter, currentChapterIndex, isProcessingChapter, updateChapter, setError, retryCinematifyText]);

    const cancelProcessing = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    // Auto-process chapter when it changes
    useEffect(() => {
        if (currentChapter && !currentChapter.isProcessed && readerMode === 'cinematified') {
            processCurrentChapter();
        }
    }, [currentChapter, readerMode, processCurrentChapter]);

    return {
        isProcessingChapter,
        processCurrentChapter,
        cancelProcessing,
    };
}
