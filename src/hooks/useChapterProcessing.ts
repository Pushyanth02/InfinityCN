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

export function useChapterProcessing(
    currentChapter: Chapter | undefined,
    currentChapterIndex: number,
    readerMode: ReaderMode,
) {

    const updateChapter = useCinematifierStore(s => s.updateChapter);
    const [isProcessingChapter, setIsProcessingChapter] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);


    const processCurrentChapter = useCallback(async () => {
        if (!currentChapter || currentChapter.isProcessed) return;
        if (isProcessingChapter) return;

        setIsProcessingChapter(true);
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const config = getCinematifierAIConfig();
            let result;

            if (config.provider === 'none') {
                const pipeline = CinematificationPipeline.createEnrichedOfflinePipeline();
                // If pipeline supports abort signal, pass it here (future-proof)
                result = await pipeline.execute(currentChapter.originalText);
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
                    controller.signal
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
            if (controller.signal.aborted) {
                // Cancelled by user, do not update chapter
                return;
            }
            console.error('[CinematicReader] Process error:', err);
            if (!currentChapter) return;
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
            abortControllerRef.current = null;
        }
    }, [currentChapter, currentChapterIndex, isProcessingChapter, updateChapter]);

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
