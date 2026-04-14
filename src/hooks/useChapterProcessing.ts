/**
 * useChapterProcessing — Chapter cinematification hook
 *
 * Handles on-demand processing of a single chapter via the enriched
 * offline pipeline, AI provider, or offline fallback.
 * Extracted from CinematicReader.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useCinematifierStore, getCinematifierAIConfig } from '../store/cinematifierStore';
import {
    runFullSystemPipeline,
    cinematifyOffline,
    extractOverallMetadata,
} from '../lib/cinematifier';
import { CinematicStreamAdapter } from '../lib/rendering/cinematicStreamAdapter';
import { useRenderBridge } from './useRenderBridge';
import { saveBook } from '../lib/runtime/cinematifierDb';
import type { ReaderMode, Chapter } from '../types/cinematifier';

function toChapterErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes('429') || lower.includes('rate limit')) {
        return 'AI rate limit reached while processing this chapter.';
    }
    if (lower.includes('api key') || lower.includes('401') || lower.includes('403')) {
        return 'AI authentication failed for this chapter.';
    }
    if (
        lower.includes('network') ||
        lower.includes('failed to fetch') ||
        lower.includes('timeout')
    ) {
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
    const bridgeHook = useRenderBridge({
        mode: readerMode === 'cinematified' ? 'cinematized' : 'original',
    });

    const processCurrentChapter = useCallback(async () => {
        if (!currentChapter || currentChapter.isProcessed) return;
        if (isProcessingChapter) return;

        setIsProcessingChapter(true);
        const controller = new AbortController();
        abortControllerRef.current = controller;
        updateChapter(currentChapterIndex, { status: 'processing', errorMessage: undefined });

        const config = getCinematifierAIConfig();
        const chapterSourceText = currentChapter.originalModeText ?? currentChapter.originalText;
        const adapter = new CinematicStreamAdapter();
        const unbindStream = bridgeHook.bindStream(adapter, [currentChapter.id]);

        try {
            adapter.start(config.provider);
            const result = await runFullSystemPipeline(chapterSourceText, config, {
                inputIsRebuilt: true,
                onChunk:
                    config.provider === 'none'
                        ? undefined
                        : (blocks, isDone) => {
                              adapter.pushChunk(blocks);
                              if (isDone) adapter.complete();
                          },
                signal: controller.signal,
            });
            adapter.complete();

            const metadata = extractOverallMetadata(
                result.cinematizedMode.rawText,
                result.cinematizedMode.blocks,
            );

            updateChapter(currentChapterIndex, {
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
            const updatedBook = useCinematifierStore.getState().book;
            if (updatedBook)
                saveBook(updatedBook).catch(e => {
                    console.warn('[CinematicReader] Failed to persist book:', e);
                });
        } catch (err) {
            if (controller.signal.aborted) {
                adapter.error('Cancelled by user');
                return;
            }
            adapter.error(toChapterErrorMessage(err));
            console.error('[CinematicReader] Process error:', err);
            if (!currentChapter) return;
            try {
                const sourceText = currentChapter.originalModeText ?? currentChapter.originalText;
                const result = cinematifyOffline(sourceText);
                const metadata = extractOverallMetadata(result.rawText, result.blocks);
                updateChapter(currentChapterIndex, {
                    originalModeText: sourceText,
                    cinematifiedBlocks: result.blocks,
                    cinematifiedText: result.rawText,
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
            unbindStream();
            setIsProcessingChapter(false);
            abortControllerRef.current = null;
        }
    }, [
        currentChapter,
        currentChapterIndex,
        isProcessingChapter,
        updateChapter,
        setError,
        bridgeHook,
    ]);

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
        sceneState: bridgeHook.sceneState,
    };
}
