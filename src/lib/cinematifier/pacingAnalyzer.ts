/**
 * pacingAnalyzer.ts — Narrative Pacing Analysis Engine
 *
 * Analyzes the distribution and rhythm of cinematic block types to detect
 * pacing issues like flat zones, rushed sequences, and monotonous patterns.
 * Computes tension arc curves and action/dialogue/beat ratios.
 *
 * Pure computation — no AI dependencies. Works on CinematicBlock[] arrays.
 */

import type { CinematicBlock } from '../../types/cinematifier';

// ─── Types ──────────────────────────────────────────────────

export interface PacingMetrics {
    /** Overall pacing score (0–100, 50 = balanced) */
    overallScore: number;
    /** Ratio of action blocks to total */
    actionRatio: number;
    /** Ratio of dialogue blocks to total */
    dialogueRatio: number;
    /** Ratio of beat/pause blocks to total */
    beatRatio: number;
    /** Ratio of SFX blocks to total */
    sfxRatio: number;
    /** Ratio of transition blocks to total */
    transitionRatio: number;
    /** Computed tension arc curve (normalized 0–1 values for each window) */
    tensionArc: number[];
    /** Detected flat zones (indices where tension stays unchanged for too long) */
    flatZones: PacingIssue[];
    /** Detected rushed zones (indices where blocks are too dense) */
    rushedZones: PacingIssue[];
    /** Block variety score (0–1, higher = more varied block types) */
    varietyScore: number;
    /** Average blocks between scene transitions */
    avgBlocksBetweenTransitions: number;
    /** Pacing rhythm label */
    rhythmLabel: PacingRhythm;
}

export type PacingRhythm = 'very_slow' | 'slow' | 'balanced' | 'fast' | 'very_fast' | 'erratic';

export interface PacingIssue {
    /** Start block index */
    startIndex: number;
    /** End block index */
    endIndex: number;
    /** Type of issue */
    type: 'flat' | 'rushed' | 'monotonous';
    /** Description of the issue */
    description: string;
}

// ─── Block Weights ───────────────────────────────────────────

/** Pacing "energy" weights for each block type */
const BLOCK_ENERGY: Record<string, number> = {
    action: 0.6,
    dialogue: 0.5,
    inner_thought: 0.3,
    sfx: 0.9,
    beat: 0.1,
    transition: 0.2,
    title_card: 0.1,
    chapter_header: 0.0,
};

// ─── Core Analysis ──────────────────────────────────────────

/**
 * Compute a rolling tension arc from block energy + tension scores.
 * Uses a sliding window to smooth the curve.
 */
function computeTensionArc(blocks: CinematicBlock[], windowSize = 5): number[] {
    if (blocks.length === 0) return [];

    // Compute per-block energy
    const energies = blocks.map(b => {
        const baseEnergy = BLOCK_ENERGY[b.type] ?? 0.5;
        const tensionFactor = (b.tensionScore ?? 50) / 100;
        return baseEnergy * 0.4 + tensionFactor * 0.6;
    });

    // Sliding window average
    const arc: number[] = [];
    const halfWindow = Math.floor(windowSize / 2);

    for (let i = 0; i < energies.length; i++) {
        const start = Math.max(0, i - halfWindow);
        const end = Math.min(energies.length, i + halfWindow + 1);
        const windowSlice = energies.slice(start, end);
        const avg = windowSlice.reduce((a, b) => a + b, 0) / windowSlice.length;
        arc.push(Math.round(avg * 1000) / 1000);
    }

    return arc;
}

/**
 * Detect flat zones where tension barely changes over consecutive blocks.
 */
function detectFlatZones(tensionArc: number[], minLength = 8, threshold = 0.05): PacingIssue[] {
    const issues: PacingIssue[] = [];
    let flatStart = 0;

    for (let i = 1; i < tensionArc.length; i++) {
        if (Math.abs(tensionArc[i] - tensionArc[flatStart]) > threshold) {
            if (i - flatStart >= minLength) {
                issues.push({
                    startIndex: flatStart,
                    endIndex: i - 1,
                    type: 'flat',
                    description: `Tension remains flat for ${i - flatStart} blocks (indices ${flatStart}–${i - 1})`,
                });
            }
            flatStart = i;
        }
    }

    // Check final segment
    if (tensionArc.length - flatStart >= minLength) {
        issues.push({
            startIndex: flatStart,
            endIndex: tensionArc.length - 1,
            type: 'flat',
            description: `Tension remains flat for ${tensionArc.length - flatStart} blocks at end`,
        });
    }

    return issues;
}

/**
 * Detect rushed zones where high-energy blocks cluster too densely.
 */
function detectRushedZones(
    blocks: CinematicBlock[],
    windowSize = 5,
    threshold = 0.8,
): PacingIssue[] {
    const issues: PacingIssue[] = [];

    for (let i = 0; i <= blocks.length - windowSize; i++) {
        const window = blocks.slice(i, i + windowSize);
        const highEnergyCount = window.filter(b => {
            const energy = BLOCK_ENERGY[b.type] ?? 0.5;
            return energy >= 0.7;
        }).length;

        const density = highEnergyCount / windowSize;
        if (density >= threshold) {
            // Check we haven't already captured this zone
            const lastIssue = issues[issues.length - 1];
            if (lastIssue && lastIssue.endIndex >= i) {
                lastIssue.endIndex = i + windowSize - 1;
            } else {
                issues.push({
                    startIndex: i,
                    endIndex: i + windowSize - 1,
                    type: 'rushed',
                    description: `${highEnergyCount}/${windowSize} high-energy blocks clustered together`,
                });
            }
        }
    }

    return issues;
}

/**
 * Compute block type variety using Shannon entropy.
 * Returns 0–1 where 1 means all block types are equally represented.
 */
function computeVarietyScore(blocks: CinematicBlock[]): number {
    if (blocks.length === 0) return 0;

    const counts: Record<string, number> = {};
    for (const b of blocks) {
        counts[b.type] = (counts[b.type] || 0) + 1;
    }

    const total = blocks.length;
    const typeCount = Object.keys(counts).length;
    if (typeCount <= 1) return 0;

    // Shannon entropy
    let entropy = 0;
    for (const count of Object.values(counts)) {
        const p = count / total;
        if (p > 0) entropy -= p * Math.log2(p);
    }

    // Normalize to 0–1 (max entropy = log2 of number of possible types)
    const maxEntropy = Math.log2(8); // 8 block types
    return Math.round((entropy / maxEntropy) * 1000) / 1000;
}

/**
 * Determine pacing rhythm label from metrics.
 */
function classifyRhythm(overallScore: number, varietyScore: number): PacingRhythm {
    if (varietyScore < 0.3) return 'erratic';
    if (overallScore >= 80) return 'very_fast';
    if (overallScore >= 60) return 'fast';
    if (overallScore >= 40) return 'balanced';
    if (overallScore >= 20) return 'slow';
    return 'very_slow';
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Analyze pacing of a cinematified block sequence.
 * Returns comprehensive metrics about narrative rhythm and pacing quality.
 */
export function analyzePacing(blocks: CinematicBlock[]): PacingMetrics {
    if (blocks.length === 0) {
        return {
            overallScore: 50,
            actionRatio: 0,
            dialogueRatio: 0,
            beatRatio: 0,
            sfxRatio: 0,
            transitionRatio: 0,
            tensionArc: [],
            flatZones: [],
            rushedZones: [],
            varietyScore: 0,
            avgBlocksBetweenTransitions: 0,
            rhythmLabel: 'balanced',
        };
    }

    const total = blocks.length;

    // Block type ratios
    const typeCounts: Record<string, number> = {};
    for (const b of blocks) {
        typeCounts[b.type] = (typeCounts[b.type] || 0) + 1;
    }

    const actionRatio = Math.round(((typeCounts['action'] || 0) / total) * 1000) / 1000;
    const dialogueRatio = Math.round(((typeCounts['dialogue'] || 0) / total) * 1000) / 1000;
    const beatRatio = Math.round(((typeCounts['beat'] || 0) / total) * 1000) / 1000;
    const sfxRatio = Math.round(((typeCounts['sfx'] || 0) / total) * 1000) / 1000;
    const transitionRatio = Math.round(((typeCounts['transition'] || 0) / total) * 1000) / 1000;

    // Tension arc
    const tensionArc = computeTensionArc(blocks);

    // Pacing issues
    const flatZones = detectFlatZones(tensionArc);
    const rushedZones = detectRushedZones(blocks);

    // Variety
    const varietyScore = computeVarietyScore(blocks);

    // Average blocks between transitions
    const transitionIndices = blocks
        .map((b, i) => (b.type === 'transition' ? i : -1))
        .filter(i => i >= 0);
    let avgBlocksBetweenTransitions: number;
    if (transitionIndices.length > 1) {
        let gapSum = 0;
        for (let i = 1; i < transitionIndices.length; i++) {
            gapSum += transitionIndices[i] - transitionIndices[i - 1];
        }
        avgBlocksBetweenTransitions =
            Math.round((gapSum / (transitionIndices.length - 1)) * 10) / 10;
    } else {
        avgBlocksBetweenTransitions = total;
    }

    // Overall pacing score
    // Balanced = good variety, not too flat, not too rushed
    const issuePenalty = flatZones.length * 5 + rushedZones.length * 8;
    const balanceScore = 50 + (varietyScore - 0.5) * 40;
    const overallScore = Math.max(0, Math.min(100, Math.round(balanceScore - issuePenalty)));

    return {
        overallScore,
        actionRatio,
        dialogueRatio,
        beatRatio,
        sfxRatio,
        transitionRatio,
        tensionArc,
        flatZones,
        rushedZones,
        varietyScore,
        avgBlocksBetweenTransitions,
        rhythmLabel: classifyRhythm(overallScore, varietyScore),
    };
}
