/**
 * chapterEngine.ts — Unified chapter processing entrypoint
 *
 * Centralizes chapter-level cinematification so full-book processing and
 * on-demand reader processing use the same core pipeline path.
 */

import type { AIConfig } from '../../ai';
import type { CinematicBlock, CinematificationResult } from '../../../types/cinematifier';
import {
    CinematificationPipeline,
    SceneSegmentationStage,
    NarrativeAnalysisStage,
    OfflineCinematificationStage,
    AICinematificationStage,
    ReadabilityAnalysisStage,
    TextStatisticsStage,
    SentimentEnrichmentStage,
    PacingAnalysisStage,
    RendererStage,
} from './pipeline';

export interface ChapterEngineOptions {
    onProgress?: (percent: number, message: string) => void;
    onChunk?: (blocks: CinematicBlock[], isDone: boolean) => void;
    signal?: AbortSignal;
    preprocessedInput?: boolean;
}

/**
 * Build the canonical chapter pipeline for the selected provider mode.
 * Order is strict: Text Input -> Paragraph Rebuilder -> Scene Segmentation
 * -> Narrative Analysis -> Cinematization -> Renderer.
 */
export function createChapterPipeline(config: AIConfig): CinematificationPipeline {
    return config.provider === 'none'
        ? CinematificationPipeline.createEnrichedOfflinePipeline()
        : CinematificationPipeline.createEnrichedAIPipeline();
}

/**
 * Build chapter pipeline when input text is already cleaned/rebuilt.
 * Skips duplicate preprocessing stages while preserving canonical stage order.
 */
export function createPreprocessedChapterPipeline(config: AIConfig): CinematificationPipeline {
    const pipeline = new CinematificationPipeline()
        .addStage(new SceneSegmentationStage())
        .addStage(new NarrativeAnalysisStage())
        .addStage(
            config.provider === 'none'
                ? new OfflineCinematificationStage()
                : new AICinematificationStage(),
        )
        .addStage(new ReadabilityAnalysisStage())
        .addStage(new TextStatisticsStage())
        .addStage(new SentimentEnrichmentStage())
        .addStage(new PacingAnalysisStage())
        .addStage(new RendererStage());

    return pipeline;
}

/**
 * Execute chapter processing through the canonical pipeline.
 * This keeps stage behavior aligned across upload-time and reader-time processing.
 */
export async function runChapterEngine(
    text: string,
    config: AIConfig,
    options: ChapterEngineOptions = {},
): Promise<CinematificationResult> {
    const pipeline = options.preprocessedInput
        ? createPreprocessedChapterPipeline(config)
        : createChapterPipeline(config);

    return pipeline.execute(text, {
        aiConfig: config,
        onProgress: options.onProgress,
        onChunk: options.onChunk,
        signal: options.signal,
    });
}
