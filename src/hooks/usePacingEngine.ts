/**
 * usePacingEngine.ts — Dynamic Pacing & Spacing Engine
 *
 * Computes cinematic spacing, typography, and transition styles from block
 * metadata (timing, tensionScore, intensity, type). Pure computation —
 * no side effects or DOM access.
 *
 * Rules:
 *   - Timing-based spacing: rapid → tight, slow → generous
 *   - Tension-based spacing: high tension → more dramatic breathing room
 *   - Intensity mapping: whisper → subtle opacity, explosive → tracking
 *   - Scene breaks: visual dividers between detected scene boundaries
 *   - Immersion-aware: minimal disables pacing, cinematic amplifies it
 */

import { useMemo } from 'react';
import type { CinematicBlock, ImmersionLevel } from '../types/cinematifier';

// ─── Public Types ──────────────────────────────────────────────────────────────

export interface PacingStyle {
    /** CSS margin-block applied to the block wrapper */
    marginBlock: string;
    /** Letter spacing for dramatic effect */
    letterSpacing: string;
    /** Subtle opacity for whisper intensity */
    opacity: number;
    /** Stagger delay for enter animation (seconds) */
    transitionDelay: string;
    /** Whether a scene divider should precede this block */
    isSceneBreak: boolean;
    /** CSS class for pacing category */
    pacingClass: string;
}

// ─── Spacing Constants (rem) ───────────────────────────────────────────────────

const TIMING_SPACING: Record<NonNullable<CinematicBlock['timing']>, number> = {
    rapid: 0.5,
    quick: 0.75,
    normal: 1,
    slow: 1.5,
};

const TYPE_SPACING: Partial<Record<CinematicBlock['type'], number>> = {
    transition: 2.25,
    title_card: 2.5,
    chapter_header: 3,
    beat: 1.5,
    dialogue: 1.15,
    inner_thought: 1.35,
    sfx: 1,
};

const INTENSITY_OPACITY: Record<CinematicBlock['intensity'], number> = {
    whisper: 0.82,
    normal: 1,
    emphasis: 1,
    shout: 1,
    explosive: 1,
};

const INTENSITY_TRACKING: Record<CinematicBlock['intensity'], string> = {
    whisper: '0.02em',
    normal: '0em',
    emphasis: '0.01em',
    shout: '0.02em',
    explosive: '0.035em',
};

// Scene-break detection: these block types usually start new scenes
const SCENE_BREAK_TYPES = new Set<CinematicBlock['type']>([
    'transition',
    'title_card',
    'chapter_header',
]);

// ─── Core Computation ──────────────────────────────────────────────────────────

/**
 * Compute the pacing style for a single block, relative to its predecessor.
 */
export function computePacingStyle(
    block: CinematicBlock,
    prevBlock: CinematicBlock | null,
    index: number,
    immersion: ImmersionLevel,
): PacingStyle {
    // Minimal immersion = no pacing adjustments
    if (immersion === 'minimal') {
        return {
            marginBlock: '1rem',
            letterSpacing: '0em',
            opacity: 1,
            transitionDelay: '0s',
            isSceneBreak: false,
            pacingClass: '',
        };
    }

    const amplify = immersion === 'cinematic' ? 1.3 : 1;

    // 1. Base spacing from timing
    const timing = block.timing ?? 'normal';
    let spacing = TIMING_SPACING[timing];

    // 2. Override with type-specific spacing if larger
    const typeSpacing = TYPE_SPACING[block.type];
    if (typeSpacing !== undefined && typeSpacing > spacing) {
        spacing = typeSpacing;
    }

    // 3. Tension adjustment
    const tension = block.tensionScore ?? 0;
    if (tension > 80) {
        spacing += 0.5;
    } else if (tension > 60) {
        spacing += 0.25;
    } else if (tension < 20 && spacing > 0.75) {
        spacing -= 0.15;
    }

    // 4. Apply immersion amplifier
    spacing *= amplify;

    // 5. Detect scene breaks
    const isSceneBreak =
        index > 0 && SCENE_BREAK_TYPES.has(block.type) && (prevBlock == null || !SCENE_BREAK_TYPES.has(prevBlock.type));

    if (isSceneBreak) {
        spacing = Math.max(spacing, 2.5 * amplify);
    }

    // 6. Intensity → opacity and letter-spacing
    const intensity = block.intensity ?? 'normal';
    const opacity = INTENSITY_OPACITY[intensity];
    const letterSpacing = INTENSITY_TRACKING[intensity];

    // 7. Stagger delay (capped)
    const delay = immersion === 'cinematic' ? Math.min(index * 0.025, 0.4) : 0;

    // 8. Pacing class
    const pacingClass =
        timing === 'rapid' || timing === 'quick'
            ? 'cine-pacing--rapid'
            : timing === 'slow'
              ? 'cine-pacing--slow'
              : tension > 70
                ? 'cine-pacing--tense'
                : '';

    return {
        marginBlock: `${spacing.toFixed(2)}rem`,
        letterSpacing,
        opacity,
        transitionDelay: `${delay.toFixed(3)}s`,
        isSceneBreak,
        pacingClass,
    };
}

/**
 * Batch-compute pacing styles for an array of blocks.
 * Returns a parallel array of PacingStyle objects.
 */
export function computeAllPacingStyles(
    blocks: CinematicBlock[],
    immersion: ImmersionLevel,
): PacingStyle[] {
    return blocks.map((block, i) => computePacingStyle(block, i > 0 ? blocks[i - 1] : null, i, immersion));
}

// ─── React Hook ────────────────────────────────────────────────────────────────

/**
 * Hook that memoizes pacing styles for the current block list.
 *
 * @param blocks - The cinematic blocks to compute pacing for
 * @param immersionLevel - Current immersion level from reader settings
 * @returns Array of PacingStyle objects, one per block
 */
export function usePacingEngine(
    blocks: CinematicBlock[],
    immersionLevel: ImmersionLevel,
): PacingStyle[] {
    return useMemo(
        () => computeAllPacingStyles(blocks, immersionLevel),
        [blocks, immersionLevel],
    );
}
