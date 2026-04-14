/**
 * pipeline.test.ts — Tests for the CinematificationPipeline engine
 *
 * Validates:
 *   • Pipeline stage composition and sequential execution
 *   • Factory methods (createAIPipeline, createOfflinePipeline)
 *   • Individual built-in stages (TextCleaning, ParagraphReconstruction, Offline)
 *   • Custom stage support
 *   • Result assembly with correct metadata
 */

import { describe, it, expect } from 'vitest';
import {
    CinematificationPipeline,
    TextCleaningStage,
    ParagraphReconstructionStage,
    OfflineCinematificationStage,
} from '../cinematifier/pipeline';
import type { PipelineStage, PipelineContext } from '../cinematifier/pipeline';

describe('CinematificationPipeline', () => {
    // ─── Stage Composition ──────────────────────────────────

    it('starts with no stages', () => {
        const pipeline = new CinematificationPipeline();
        expect(pipeline.getStageNames()).toEqual([]);
    });

    it('addStage returns this for chaining', () => {
        const pipeline = new CinematificationPipeline();
        const result = pipeline.addStage(new TextCleaningStage());
        expect(result).toBe(pipeline);
    });

    it('tracks stage names in order', () => {
        const pipeline = new CinematificationPipeline()
            .addStage(new TextCleaningStage())
            .addStage(new ParagraphReconstructionStage())
            .addStage(new OfflineCinematificationStage());
        expect(pipeline.getStageNames()).toEqual([
            'Text Cleaning',
            'Paragraph Reconstruction',
            'Offline Cinematification',
        ]);
    });

    // ─── Pipeline Execution ─────────────────────────────────

    it('executes stages sequentially', async () => {
        const order: string[] = [];

        const stageA: PipelineStage = {
            name: 'Stage A',
            execute: () => {
                order.push('A');
            },
        };
        const stageB: PipelineStage = {
            name: 'Stage B',
            execute: () => {
                order.push('B');
            },
        };

        const pipeline = new CinematificationPipeline().addStage(stageA).addStage(stageB);

        await pipeline.execute('test');
        expect(order).toEqual(['A', 'B']);
    });

    it('handles async stages', async () => {
        const asyncStage: PipelineStage = {
            name: 'Async Stage',
            execute: async (context: PipelineContext) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                context.text = context.text.toUpperCase();
            },
        };

        const pipeline = new CinematificationPipeline().addStage(asyncStage);
        const result = await pipeline.execute('hello');
        // Metadata should be computed from result
        expect(result.metadata.originalWordCount).toBe(1);
    });

    it('returns a valid CinematificationResult with metadata', async () => {
        const pipeline = new CinematificationPipeline().addStage(
            new OfflineCinematificationStage(),
        );

        const sampleText = 'The door slammed shut. SFX: BOOM\n\nShe screamed.';
        const result = await pipeline.execute(sampleText);

        expect(result.blocks).toBeDefined();
        expect(result.blocks.length).toBeGreaterThan(0);
        expect(result.metadata.originalWordCount).toBeGreaterThan(0);
        expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    // ─── Built-in Stages ────────────────────────────────────

    it('TextCleaningStage removes page numbers from context text', async () => {
        const stage = new TextCleaningStage();
        const context: PipelineContext = {
            text: 'Some content.\n42\nMore content.',
            blocks: [],
            rawText: '',
            metadata: { sfxCount: 0, transitionCount: 0, beatCount: 0, originalWordCount: 0 },
            startTime: performance.now(),
            stageTrace: [],
        };

        stage.execute(context);
        expect(context.text).not.toMatch(/^\s*42\s*$/m);
    });

    it('ParagraphReconstructionStage preserves well-formed text', async () => {
        const stage = new ParagraphReconstructionStage();
        const text = 'First para.\n\nSecond para.\n\nThird para.';
        const context: PipelineContext = {
            text,
            blocks: [],
            rawText: '',
            metadata: { sfxCount: 0, transitionCount: 0, beatCount: 0, originalWordCount: 0 },
            startTime: performance.now(),
            stageTrace: [],
        };

        stage.execute(context);
        expect(context.text).toBe(text);
    });

    it('OfflineCinematificationStage produces blocks and metadata', async () => {
        const stage = new OfflineCinematificationStage();
        const context: PipelineContext = {
            text: 'He walked slowly. The rain was falling.\n\n"Watch out!" she shouted.',
            blocks: [],
            rawText: '',
            metadata: { sfxCount: 0, transitionCount: 0, beatCount: 0, originalWordCount: 0 },
            startTime: performance.now(),
            stageTrace: [],
        };

        stage.execute(context);
        expect(context.blocks.length).toBeGreaterThan(0);
    });

    // ─── Factory Methods ────────────────────────────────────

    it('createOfflinePipeline has 3 stages', () => {
        const pipeline = CinematificationPipeline.createOfflinePipeline();
        expect(pipeline.getStageNames()).toEqual([
            'Text Cleaning',
            'Paragraph Reconstruction',
            'Offline Cinematification',
        ]);
    });

    it('createAIPipeline has 3 stages', () => {
        const pipeline = CinematificationPipeline.createAIPipeline();
        expect(pipeline.getStageNames()).toEqual([
            'Text Cleaning',
            'Paragraph Reconstruction',
            'AI Cinematification',
        ]);
    });

    it('enriched offline pipeline ends with Renderer stage', () => {
        const pipeline = CinematificationPipeline.createEnrichedOfflinePipeline();
        const names = pipeline.getStageNames();

        expect(names.at(-1)).toBe('Renderer');
        expect(names).toContain('Scene Segmentation');
        expect(names).toContain('Narrative Analysis');
        expect(names).toContain('Offline Cinematification');
    });

    it('offline pipeline produces valid result', async () => {
        const pipeline = CinematificationPipeline.createOfflinePipeline();
        const text = `
He moved through the shadows. The night was cold.

"Stay back!" she screamed. The door slammed.

Suddenly, an explosion shook the building.
        `.trim();

        const result = await pipeline.execute(text);

        expect(result.blocks).toBeDefined();
        expect(result.blocks.length).toBeGreaterThan(0);
        expect(result.metadata.originalWordCount).toBeGreaterThan(0);
        expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('enriched pipeline returns renderer plan and stage trace', async () => {
        const pipeline = CinematificationPipeline.createEnrichedOfflinePipeline();
        const text = 'A door creaked open.\n\n"Did you hear that?" Maya whispered.';

        const result = await pipeline.execute(text);

        expect(result.renderPlan).toBeDefined();
        expect((result.renderPlan?.cues.length ?? 0) > 0).toBe(true);
        expect(result.stageTrace).toBeDefined();
        expect(result.stageTrace?.length).toBe(pipeline.getStageNames().length);
        expect(result.stageTrace?.at(-1)?.stageName).toBe('Renderer');
    });

    // ─── Custom Stages ──────────────────────────────────────

    it('supports custom stages', async () => {
        const uppercaseStage: PipelineStage = {
            name: 'Uppercase',
            execute: (context: PipelineContext) => {
                context.text = context.text.toUpperCase();
            },
        };

        const pipeline = new CinematificationPipeline()
            .addStage(uppercaseStage)
            .addStage(new OfflineCinematificationStage());

        const result = await pipeline.execute('quiet whisper');
        expect(result.blocks).toBeDefined();
        // The text was uppercased before offline processing
        expect(
            result.blocks.some(b => b.content.includes('QUIET') || b.content.includes('WHISPER')),
        ).toBe(true);
    });

    // ─── Edge Cases ─────────────────────────────────────────

    it('handles empty text gracefully', async () => {
        const pipeline = CinematificationPipeline.createOfflinePipeline();
        const result = await pipeline.execute('');

        expect(result.blocks).toBeDefined();
        expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('pipeline with no stages returns empty result', async () => {
        const pipeline = new CinematificationPipeline();
        const result = await pipeline.execute('some text');

        expect(result.blocks).toEqual([]);
        expect(result.metadata.originalWordCount).toBe(2);
        expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    // ─── Word Count Bug Fixes ───────────────────────────────

    it('word count does not inflate on leading/trailing whitespace', async () => {
        const pipeline = new CinematificationPipeline();
        const result = await pipeline.execute('  hello world  ');

        expect(result.metadata.originalWordCount).toBe(2);
    });

    it('word count is 0 for whitespace-only text', async () => {
        const pipeline = new CinematificationPipeline();
        const result = await pipeline.execute('   ');

        expect(result.metadata.originalWordCount).toBe(0);
    });

    it('word count handles empty string', async () => {
        const pipeline = new CinematificationPipeline();
        const result = await pipeline.execute('');

        expect(result.metadata.originalWordCount).toBe(0);
    });
});
