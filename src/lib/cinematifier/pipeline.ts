/**
 * pipeline.ts — Core Cinematification Pipeline Engine
 *
 * Provides a composable pipeline architecture for the cinematification process.
 * Each stage handles a specific task and passes its output to the next stage,
 * producing the final CinematificationResult.
 *
 * Usage:
 *   // AI pipeline
 *   const pipeline = CinematificationPipeline.createAIPipeline(aiConfig);
 *   const result = await pipeline.execute(rawText, { onProgress, onChunk });
 *
 *   // Offline pipeline
 *   const pipeline = CinematificationPipeline.createOfflinePipeline();
 *   const result = await pipeline.execute(rawText);
 *
 *   // Custom pipeline
 *   const pipeline = new CinematificationPipeline()
 *     .addStage(new TextCleaningStage())
 *     .addStage(new ParagraphReconstructionStage())
 *     .addStage(new OfflineCinematificationStage());
 *   const result = await pipeline.execute(rawText);
 */

import type { AIConfig } from '../ai';
import type { CinematicBlock, CinematificationResult } from '../../types/cinematifier';
import { cleanExtractedText, reconstructParagraphs } from './textProcessing';
import { cinematifyOffline } from './offlineEngine';
import { cinematifyText } from './aiEngine';

// ─── Pipeline Context ──────────────────────────────────────

/** Mutable context passed between pipeline stages */
export interface PipelineContext {
    /** The text being processed — stages may transform it */
    text: string;
    /** Accumulated cinematic blocks from processing */
    blocks: CinematicBlock[];
    /** Raw AI/engine output text */
    rawText: string;
    /** Processing metadata counters */
    metadata: {
        sfxCount: number;
        transitionCount: number;
        beatCount: number;
        originalWordCount: number;
    };
    /** Pipeline start time for timing measurement */
    startTime: number;
    /** Optional AI configuration (required for AI stages) */
    aiConfig?: AIConfig;
    /** Optional progress callback */
    onProgress?: (percent: number, message: string) => void;
    /** Optional chunk callback for streaming updates */
    onChunk?: (blocks: CinematicBlock[], isDone: boolean) => void;
}

// ─── Pipeline Stage Interface ──────────────────────────────

/** A single stage in the cinematification pipeline */
export interface PipelineStage {
    /** Human-readable stage name for progress reporting */
    readonly name: string;
    /** Execute this stage, mutating the pipeline context */
    execute(context: PipelineContext): Promise<void> | void;
}

// ─── Built-in Stages ───────────────────────────────────────

/** Stage 1: Cleans raw extracted text (PDF artifacts, whitespace, hyphenation) */
export class TextCleaningStage implements PipelineStage {
    readonly name = 'Text Cleaning';

    execute(context: PipelineContext): void {
        context.text = cleanExtractedText(context.text);
    }
}

/** Stage 2: Reconstructs paragraph boundaries for texts lacking proper breaks */
export class ParagraphReconstructionStage implements PipelineStage {
    readonly name = 'Paragraph Reconstruction';

    execute(context: PipelineContext): void {
        context.text = reconstructParagraphs(context.text);
    }
}

/** Stage 3a: AI-powered cinematification (streaming + context-aware) */
export class AICinematificationStage implements PipelineStage {
    readonly name = 'AI Cinematification';

    async execute(context: PipelineContext): Promise<void> {
        if (!context.aiConfig) {
            throw new Error('AICinematificationStage requires aiConfig in the pipeline context');
        }

        const result = await cinematifyText(
            context.text,
            context.aiConfig,
            context.onProgress,
            context.onChunk,
        );

        context.blocks = result.blocks;
        context.rawText = result.rawText ?? '';
        context.metadata.sfxCount = result.metadata.sfxCount;
        context.metadata.transitionCount = result.metadata.transitionCount;
        context.metadata.beatCount = result.metadata.beatCount;
    }
}

/** Stage 3b: Offline heuristic-based cinematification (no AI needed) */
export class OfflineCinematificationStage implements PipelineStage {
    readonly name = 'Offline Cinematification';

    execute(context: PipelineContext): void {
        const result = cinematifyOffline(context.text);

        context.blocks = result.blocks;
        context.rawText = result.rawText ?? '';
        context.metadata.sfxCount = result.metadata.sfxCount;
        context.metadata.transitionCount = result.metadata.transitionCount;
        context.metadata.beatCount = result.metadata.beatCount;
    }
}

// ─── Pipeline Engine ───────────────────────────────────────

/**
 * Composable cinematification pipeline that executes stages sequentially.
 *
 * Each stage receives and modifies a shared PipelineContext. The pipeline
 * assembles the final CinematificationResult from the context after all
 * stages have completed.
 */
export class CinematificationPipeline {
    private stages: PipelineStage[] = [];

    /** Add a stage to the pipeline. Returns this for chaining. */
    addStage(stage: PipelineStage): this {
        this.stages.push(stage);
        return this;
    }

    /** Get the list of registered stage names */
    getStageNames(): string[] {
        return this.stages.map(s => s.name);
    }

    /**
     * Execute the pipeline on the given text.
     *
     * @param text - Raw input text to process
     * @param options - Optional callbacks and AI configuration
     * @returns The final CinematificationResult
     */
    async execute(
        text: string,
        options: {
            aiConfig?: AIConfig;
            onProgress?: (percent: number, message: string) => void;
            onChunk?: (blocks: CinematicBlock[], isDone: boolean) => void;
        } = {},
    ): Promise<CinematificationResult> {
        const context: PipelineContext = {
            text,
            blocks: [],
            rawText: '',
            metadata: {
                sfxCount: 0,
                transitionCount: 0,
                beatCount: 0,
                originalWordCount: text.split(/\s+/).length,
            },
            startTime: performance.now(),
            aiConfig: options.aiConfig,
            onProgress: options.onProgress,
            onChunk: options.onChunk,
        };

        for (const stage of this.stages) {
            await stage.execute(context);
        }

        const processingTimeMs = Math.round(performance.now() - context.startTime);

        return {
            blocks: context.blocks,
            rawText: context.rawText,
            metadata: {
                originalWordCount: context.metadata.originalWordCount,
                cinematifiedWordCount: context.blocks.reduce(
                    (acc, b) => acc + (b.content?.split(/\s+/).length || 0),
                    0,
                ),
                sfxCount: context.metadata.sfxCount,
                transitionCount: context.metadata.transitionCount,
                beatCount: context.metadata.beatCount,
                processingTimeMs,
            },
        };
    }

    // ─── Factory Methods ───────────────────────────────────

    /**
     * Create a pipeline for AI-powered cinematification.
     *
     * Stages: TextCleaning → ParagraphReconstruction → AICinematification
     */
    static createAIPipeline(): CinematificationPipeline {
        return new CinematificationPipeline()
            .addStage(new TextCleaningStage())
            .addStage(new ParagraphReconstructionStage())
            .addStage(new AICinematificationStage());
    }

    /**
     * Create a pipeline for offline/fallback cinematification.
     *
     * Stages: TextCleaning → ParagraphReconstruction → OfflineCinematification
     */
    static createOfflinePipeline(): CinematificationPipeline {
        return new CinematificationPipeline()
            .addStage(new TextCleaningStage())
            .addStage(new ParagraphReconstructionStage())
            .addStage(new OfflineCinematificationStage());
    }
}
