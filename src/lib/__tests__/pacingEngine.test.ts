/**
 * pacingEngine.test.ts — Tests for usePacingEngine
 *
 * Covers:
 *   - Timing-based spacing (rapid, quick, normal, slow)
 *   - Tension-based spacing adjustments
 *   - Intensity mapping (opacity, letter-spacing)
 *   - Block type spacing overrides
 *   - Scene break detection
 *   - Immersion level behavior (minimal = no pacing, cinematic = amplified)
 *   - Batch computation
 */

import { describe, it, expect } from 'vitest';
import { computePacingStyle, computeAllPacingStyles } from '../../hooks/usePacingEngine';
import type { CinematicBlock } from '../../types/cinematifier';

// ─── Test Helpers ──────────────────────────────────────────────────────────────

function createBlock(overrides?: Partial<CinematicBlock>): CinematicBlock {
    return {
        id: `block-${Math.random().toString(36).slice(2, 8)}`,
        type: 'action',
        content: 'Test content.',
        intensity: 'normal',
        timing: 'normal',
        ...overrides,
    };
}

// ─── Timing-Based Spacing ──────────────────────────────────────────────────────

describe('Timing-Based Spacing', () => {
    it('rapid timing produces tight spacing', () => {
        const block = createBlock({ timing: 'rapid' });
        const style = computePacingStyle(block, null, 0, 'balanced');
        expect(parseFloat(style.marginBlock)).toBeLessThan(0.8);
    });

    it('slow timing produces generous spacing', () => {
        const block = createBlock({ timing: 'slow' });
        const style = computePacingStyle(block, null, 0, 'balanced');
        expect(parseFloat(style.marginBlock)).toBeGreaterThan(1.2);
    });

    it('normal timing produces standard spacing', () => {
        const block = createBlock({ timing: 'normal', tensionScore: 50 });
        const style = computePacingStyle(block, null, 0, 'balanced');
        const spacing = parseFloat(style.marginBlock);
        expect(spacing).toBeGreaterThanOrEqual(0.9);
        expect(spacing).toBeLessThanOrEqual(1.3);
    });

    it('ordering: rapid < quick < normal < slow', () => {
        const timings: CinematicBlock['timing'][] = ['rapid', 'quick', 'normal', 'slow'];
        const spacings = timings.map(timing => {
            const block = createBlock({ timing });
            return parseFloat(computePacingStyle(block, null, 0, 'balanced').marginBlock);
        });

        for (let i = 1; i < spacings.length; i++) {
            expect(spacings[i]).toBeGreaterThanOrEqual(spacings[i - 1]);
        }
    });
});

// ─── Tension-Based Spacing ─────────────────────────────────────────────────────

describe('Tension-Based Spacing', () => {
    it('high tension (>80) adds extra spacing', () => {
        const normalBlock = createBlock({ tensionScore: 50 });
        const tenseBlock = createBlock({ tensionScore: 85 });

        const normalSpacing = parseFloat(
            computePacingStyle(normalBlock, null, 0, 'balanced').marginBlock,
        );
        const tenseSpacing = parseFloat(
            computePacingStyle(tenseBlock, null, 0, 'balanced').marginBlock,
        );

        expect(tenseSpacing).toBeGreaterThan(normalSpacing);
    });

    it('low tension (<20) slightly reduces spacing', () => {
        const normalBlock = createBlock({ tensionScore: 50 });
        const calmBlock = createBlock({ tensionScore: 10 });

        const normalSpacing = parseFloat(
            computePacingStyle(normalBlock, null, 0, 'balanced').marginBlock,
        );
        const calmSpacing = parseFloat(
            computePacingStyle(calmBlock, null, 0, 'balanced').marginBlock,
        );

        expect(calmSpacing).toBeLessThanOrEqual(normalSpacing);
    });

    it('high tension applies cine-pacing--tense class', () => {
        const block = createBlock({ tensionScore: 75 });
        const style = computePacingStyle(block, null, 0, 'balanced');
        expect(style.pacingClass).toBe('cine-pacing--tense');
    });
});

// ─── Intensity Mapping ─────────────────────────────────────────────────────────

describe('Intensity Mapping', () => {
    it('whisper intensity reduces opacity', () => {
        const block = createBlock({ intensity: 'whisper' });
        const style = computePacingStyle(block, null, 0, 'balanced');
        expect(style.opacity).toBeLessThan(1);
    });

    it('normal intensity has full opacity', () => {
        const block = createBlock({ intensity: 'normal' });
        const style = computePacingStyle(block, null, 0, 'balanced');
        expect(style.opacity).toBe(1);
    });

    it('explosive intensity increases letter-spacing', () => {
        const block = createBlock({ intensity: 'explosive' });
        const style = computePacingStyle(block, null, 0, 'balanced');
        expect(parseFloat(style.letterSpacing)).toBeGreaterThan(0);
    });

    it('normal intensity has zero letter-spacing', () => {
        const block = createBlock({ intensity: 'normal' });
        const style = computePacingStyle(block, null, 0, 'balanced');
        expect(style.letterSpacing).toBe('0em');
    });
});

// ─── Block Type Overrides ──────────────────────────────────────────────────────

describe('Block Type Spacing Overrides', () => {
    it('transitions get extra spacing', () => {
        const actionBlock = createBlock({ type: 'action' });
        const transitionBlock = createBlock({ type: 'transition' });

        const actionSpacing = parseFloat(
            computePacingStyle(actionBlock, null, 0, 'balanced').marginBlock,
        );
        const transitionSpacing = parseFloat(
            computePacingStyle(transitionBlock, null, 0, 'balanced').marginBlock,
        );

        expect(transitionSpacing).toBeGreaterThan(actionSpacing);
    });

    it('beats get more spacing than dialogue', () => {
        const dialogueBlock = createBlock({ type: 'dialogue' });
        const beatBlock = createBlock({ type: 'beat' });

        const dialogueSpacing = parseFloat(
            computePacingStyle(dialogueBlock, null, 0, 'balanced').marginBlock,
        );
        const beatSpacing = parseFloat(
            computePacingStyle(beatBlock, null, 0, 'balanced').marginBlock,
        );

        expect(beatSpacing).toBeGreaterThan(dialogueSpacing);
    });

    it('title cards get the most spacing', () => {
        const block = createBlock({ type: 'title_card' });
        const style = computePacingStyle(block, null, 0, 'balanced');
        expect(parseFloat(style.marginBlock)).toBeGreaterThan(2);
    });
});

// ─── Scene Break Detection ─────────────────────────────────────────────────────

describe('Scene Break Detection', () => {
    it('detects transition after non-transition as scene break', () => {
        const prevBlock = createBlock({ type: 'action' });
        const transitionBlock = createBlock({ type: 'transition' });

        const style = computePacingStyle(transitionBlock, prevBlock, 5, 'balanced');
        expect(style.isSceneBreak).toBe(true);
    });

    it('does not flag first block as scene break', () => {
        const block = createBlock({ type: 'transition' });
        const style = computePacingStyle(block, null, 0, 'balanced');
        expect(style.isSceneBreak).toBe(false);
    });

    it('consecutive transitions are not scene breaks', () => {
        const prev = createBlock({ type: 'transition' });
        const curr = createBlock({ type: 'title_card' });
        const style = computePacingStyle(curr, prev, 3, 'balanced');
        expect(style.isSceneBreak).toBe(false);
    });

    it('scene breaks get generous spacing', () => {
        const prev = createBlock({ type: 'action' });
        const transition = createBlock({ type: 'transition' });
        const style = computePacingStyle(transition, prev, 5, 'balanced');
        expect(parseFloat(style.marginBlock)).toBeGreaterThanOrEqual(2.2);
    });
});

// ─── Immersion Levels ──────────────────────────────────────────────────────────

describe('Immersion Levels', () => {
    it('minimal immersion returns flat spacing', () => {
        const block = createBlock({ timing: 'slow', tensionScore: 90, intensity: 'explosive' });
        const style = computePacingStyle(block, null, 10, 'minimal');

        expect(style.marginBlock).toBe('1rem');
        expect(style.letterSpacing).toBe('0em');
        expect(style.opacity).toBe(1);
        expect(style.transitionDelay).toBe('0s');
        expect(style.isSceneBreak).toBe(false);
        expect(style.pacingClass).toBe('');
    });

    it('cinematic immersion amplifies spacing', () => {
        const block = createBlock({ timing: 'slow' });
        const balanced = parseFloat(computePacingStyle(block, null, 0, 'balanced').marginBlock);
        const cinematic = parseFloat(computePacingStyle(block, null, 0, 'cinematic').marginBlock);

        expect(cinematic).toBeGreaterThan(balanced);
    });

    it('cinematic immersion adds transition delay', () => {
        const block = createBlock();
        const style = computePacingStyle(block, null, 5, 'cinematic');
        expect(parseFloat(style.transitionDelay)).toBeGreaterThan(0);
    });

    it('balanced immersion has zero transition delay', () => {
        const block = createBlock();
        const style = computePacingStyle(block, null, 5, 'balanced');
        expect(parseFloat(style.transitionDelay)).toBe(0);
    });
});

// ─── Pacing Classes ────────────────────────────────────────────────────────────

describe('Pacing Classes', () => {
    it('rapid timing produces rapid class', () => {
        const block = createBlock({ timing: 'rapid' });
        const style = computePacingStyle(block, null, 0, 'balanced');
        expect(style.pacingClass).toBe('cine-pacing--rapid');
    });

    it('quick timing produces rapid class', () => {
        const block = createBlock({ timing: 'quick' });
        const style = computePacingStyle(block, null, 0, 'balanced');
        expect(style.pacingClass).toBe('cine-pacing--rapid');
    });

    it('slow timing produces slow class', () => {
        const block = createBlock({ timing: 'slow' });
        const style = computePacingStyle(block, null, 0, 'balanced');
        expect(style.pacingClass).toBe('cine-pacing--slow');
    });

    it('normal timing with low tension produces no class', () => {
        const block = createBlock({ timing: 'normal', tensionScore: 30 });
        const style = computePacingStyle(block, null, 0, 'balanced');
        expect(style.pacingClass).toBe('');
    });
});

// ─── Batch Computation ─────────────────────────────────────────────────────────

describe('Batch Computation', () => {
    it('computes styles for all blocks', () => {
        const blocks = [
            createBlock({ timing: 'rapid' }),
            createBlock({ timing: 'normal' }),
            createBlock({ timing: 'slow' }),
        ];

        const styles = computeAllPacingStyles(blocks, 'balanced');
        expect(styles).toHaveLength(3);
        expect(parseFloat(styles[0].marginBlock)).toBeLessThan(parseFloat(styles[2].marginBlock));
    });

    it('returns empty array for empty blocks', () => {
        expect(computeAllPacingStyles([], 'balanced')).toEqual([]);
    });

    it('detects scene breaks in batch', () => {
        const blocks = [
            createBlock({ type: 'action' }),
            createBlock({ type: 'action' }),
            createBlock({ type: 'transition' }),
            createBlock({ type: 'action' }),
        ];

        const styles = computeAllPacingStyles(blocks, 'balanced');
        expect(styles[0].isSceneBreak).toBe(false);
        expect(styles[1].isSceneBreak).toBe(false);
        expect(styles[2].isSceneBreak).toBe(true);
        expect(styles[3].isSceneBreak).toBe(false);
    });
});
