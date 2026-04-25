/**
 * pacingAnalyzer.test.ts — Tests for the Narrative Pacing Analyzer
 */

import { describe, it, expect } from 'vitest';
import { analyzePacing } from '../engine/cinematifier/pacingAnalyzer';
import type { CinematicBlock } from '../../types/cinematifier';

// ─── Helpers ────────────────────────────────────────────────

function makeBlock(
    type: CinematicBlock['type'],
    overrides?: Partial<CinematicBlock>,
): CinematicBlock {
    return {
        id: `block-${Math.random().toString(36).slice(2, 8)}`,
        type,
        content: 'Test content',
        intensity: 'normal',
        ...overrides,
    };
}

function makeBlocks(types: CinematicBlock['type'][]): CinematicBlock[] {
    return types.map(t => makeBlock(t));
}

// ─── analyzePacing ──────────────────────────────────────────

describe('analyzePacing', () => {
    it('returns default metrics for empty blocks', () => {
        const result = analyzePacing([]);
        expect(result.overallScore).toBe(50);
        expect(result.actionRatio).toBe(0);
        expect(result.dialogueRatio).toBe(0);
        expect(result.tensionArc).toHaveLength(0);
        expect(result.flatZones).toHaveLength(0);
        expect(result.rushedZones).toHaveLength(0);
        expect(result.rhythmLabel).toBe('balanced');
    });

    it('computes block type ratios correctly', () => {
        const blocks = makeBlocks(['action', 'action', 'dialogue', 'dialogue', 'dialogue']);
        const result = analyzePacing(blocks);
        expect(result.actionRatio).toBeCloseTo(0.4, 1);
        expect(result.dialogueRatio).toBeCloseTo(0.6, 1);
    });

    it('computes tension arc from blocks', () => {
        const blocks = makeBlocks([
            'action',
            'action',
            'sfx',
            'beat',
            'dialogue',
            'action',
            'transition',
            'dialogue',
            'beat',
            'action',
        ]);
        const result = analyzePacing(blocks);
        expect(result.tensionArc.length).toBe(blocks.length);
        expect(result.tensionArc.every(v => v >= 0 && v <= 1)).toBe(true);
    });

    it('detects flat zones in monotonous sequences', () => {
        // 20 action blocks with same tension should trigger flat zone detection
        const blocks = Array.from({ length: 20 }, () => makeBlock('action', { tensionScore: 50 }));
        const result = analyzePacing(blocks);
        expect(result.flatZones.length).toBeGreaterThanOrEqual(1);
        expect(result.flatZones[0].type).toBe('flat');
    });

    it('detects rushed zones with clustered high-energy blocks', () => {
        // 10 SFX blocks in a row (all high-energy)
        const blocks = Array.from({ length: 10 }, () => makeBlock('sfx'));
        const result = analyzePacing(blocks);
        expect(result.rushedZones.length).toBeGreaterThanOrEqual(1);
        expect(result.rushedZones[0].type).toBe('rushed');
    });

    it('computes variety score between 0 and 1', () => {
        // High variety
        const diverseBlocks = makeBlocks([
            'action',
            'dialogue',
            'sfx',
            'beat',
            'transition',
            'inner_thought',
        ]);
        const diverseResult = analyzePacing(diverseBlocks);
        expect(diverseResult.varietyScore).toBeGreaterThan(0);
        expect(diverseResult.varietyScore).toBeLessThanOrEqual(1);

        // Low variety
        const uniformBlocks = makeBlocks(['action', 'action', 'action', 'action', 'action']);
        const uniformResult = analyzePacing(uniformBlocks);
        expect(uniformResult.varietyScore).toBeLessThan(diverseResult.varietyScore);
    });

    it('computes average blocks between transitions', () => {
        const blocks = makeBlocks([
            'action',
            'action',
            'transition',
            'action',
            'action',
            'action',
            'transition',
            'action',
        ]);
        const result = analyzePacing(blocks);
        // Transitions at index 2 and 6, gap = 4
        expect(result.avgBlocksBetweenTransitions).toBe(4);
    });

    it('assigns rhythm labels', () => {
        const result = analyzePacing(makeBlocks(['action', 'dialogue', 'beat']));
        expect(['very_slow', 'slow', 'balanced', 'fast', 'very_fast', 'erratic']).toContain(
            result.rhythmLabel,
        );
    });

    it('overall score is between 0 and 100', () => {
        const blocks = makeBlocks([
            'action',
            'dialogue',
            'sfx',
            'beat',
            'transition',
            'action',
            'dialogue',
            'inner_thought',
        ]);
        const result = analyzePacing(blocks);
        expect(result.overallScore).toBeGreaterThanOrEqual(0);
        expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it('handles single block', () => {
        const result = analyzePacing([makeBlock('action')]);
        expect(result.tensionArc).toHaveLength(1);
        expect(result.overallScore).toBeGreaterThanOrEqual(0);
    });
});
