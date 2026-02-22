/**
 * narrativeEngine.ts — Advanced Cinematic Analysis Engine
 *
 * Functions:
 *   detectNarrativeArc   — 5-act structure from tension curve
 *   buildCharacterGraph  — co-occurrence edge graph between characters
 *   computeSymbolicDensity — simile / metaphor / motif density per paragraph
 *   extractDialogueLines — clean speaker-attributed quotes
 */

import { splitSentences, tokenise, scoreTension } from './algorithms';
import type { NamedCharacter } from './algorithms';

// ═══════════════════════════════════════════════════════════
// 1. NARRATIVE ARC DETECTION
// ═══════════════════════════════════════════════════════════

export type NarrativeStage =
    | 'exposition'
    | 'rising_action'
    | 'climax'
    | 'falling_action'
    | 'resolution';

export interface NarrativeArcResult {
    stages: NarrativeStageSegment[];
    climaxIndex: number;       // index of the panel at peak tension
    climaxPercent: number;     // 0-100: where in the chapter the climax falls
    arcShape: 'mountain' | 'plateau' | 'rising' | 'falling' | 'flat';
}

export interface NarrativeStageSegment {
    stage: NarrativeStage;
    startPercent: number;     // 0-100
    endPercent: number;
    avgTension: number;
    label: string;
}

/**
 * Detect 5-act narrative structure from a panel tension array.
 * Uses a sliding window smoothed tension curve to find the climax peak,
 * then partitions the chapter into narrative segments relative to it.
 */
export function detectNarrativeArc(
    panels: Array<{ content: string; tension?: number }>
): NarrativeArcResult {
    if (panels.length < 5) {
        return {
            stages: [{ stage: 'exposition', startPercent: 0, endPercent: 100, avgTension: 0, label: 'Exposition' }],
            climaxIndex: 0, climaxPercent: 50, arcShape: 'flat'
        };
    }

    const tensions = panels.map(p => p.tension ?? scoreTension(p.content));

    // Smooth tension curve with window size 5 to reduce noise
    const windowSize = Math.max(3, Math.round(panels.length * 0.08));
    const smoothed = tensions.map((_, i) => {
        const start = Math.max(0, i - windowSize);
        const end = Math.min(tensions.length, i + windowSize + 1);
        const slice = tensions.slice(start, end);
        return slice.reduce((s, v) => s + v, 0) / slice.length;
    });

    const climaxIndex = smoothed.indexOf(Math.max(...smoothed));
    const climaxPct = (climaxIndex / (panels.length - 1)) * 100;

    // Build five segments based on climax position
    const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    const segmentsRaw: { stage: NarrativeStage; label: string; start: number; end: number }[] = [];

    // Exposition: first 15% or up to climax/4, whichever is smaller
    const expEnd = Math.min(15, climaxPct * 0.3);
    const risingEnd = climaxPct - 5;
    const fallingEnd = climaxPct + Math.min(20, (100 - climaxPct) * 0.5);

    segmentsRaw.push({ stage: 'exposition', label: 'Exposition', start: 0, end: expEnd });
    segmentsRaw.push({ stage: 'rising_action', label: 'Rising Action', start: expEnd, end: Math.max(expEnd + 1, risingEnd) });
    segmentsRaw.push({ stage: 'climax', label: 'Climax', start: risingEnd, end: climaxPct + 5 });
    segmentsRaw.push({ stage: 'falling_action', label: 'Falling Action', start: climaxPct + 5, end: fallingEnd });
    segmentsRaw.push({ stage: 'resolution', label: 'Resolution', start: fallingEnd, end: 100 });

    const stages = segmentsRaw.map(s => {
        const startIdx = Math.floor((s.start / 100) * (panels.length - 1));
        const endIdx = Math.ceil((s.end / 100) * (panels.length - 1));
        return {
            stage: s.stage,
            label: s.label,
            startPercent: parseFloat(s.start.toFixed(1)),
            endPercent: parseFloat(s.end.toFixed(1)),
            avgTension: parseFloat(avg(smoothed.slice(startIdx, endIdx + 1)).toFixed(3)),
        };
    });

    // Determine arc shape
    const firstHalf = avg(smoothed.slice(0, Math.floor(smoothed.length / 2)));
    const secondHalf = avg(smoothed.slice(Math.floor(smoothed.length / 2)));
    const maxTension = Math.max(...smoothed);
    const minTension = Math.min(...smoothed);
    const spread = maxTension - minTension;

    let arcShape: NarrativeArcResult['arcShape'] = 'mountain';
    if (spread < 0.08) arcShape = 'flat';
    else if (climaxPct > 75) arcShape = 'rising';
    else if (climaxPct < 25) arcShape = 'falling';
    else if (firstHalf > 0.4 && secondHalf > 0.4) arcShape = 'plateau';

    return { stages, climaxIndex, climaxPercent: parseFloat(climaxPct.toFixed(1)), arcShape };
}

// ═══════════════════════════════════════════════════════════
// 2. CHARACTER CO-OCCURRENCE GRAPH
// ═══════════════════════════════════════════════════════════

export interface CharacterNode {
    id: string;
    name: string;
    weight: number;   // normalized mention frequency 0-1
    sentiment: number;
}

export interface CharacterEdge {
    source: string;
    target: string;
    weight: number;   // co-occurrence count, normalized 0-1
}

export interface CharacterGraphResult {
    nodes: CharacterNode[];
    edges: CharacterEdge[];
}

/**
 * Build a co-occurrence graph from named characters.
 * Two characters share an edge if they appear within the same sentence ±1.
 */
export function buildCharacterGraph(
    text: string,
    characters: NamedCharacter[]
): CharacterGraphResult {
    if (characters.length < 2) {
        return {
            nodes: characters.map(c => ({
                id: c.name, name: c.name,
                weight: 1, sentiment: c.sentiment,
            })),
            edges: []
        };
    }

    const sentences = splitSentences(text);
    const maxFreq = Math.max(...characters.map(c => c.frequency));
    const coMatrix = new Map<string, number>();

    // Build sentence index per character — O(sentences × characters) once
    const charSentenceIndex = new Map<string, Set<number>>();
    for (const c of characters) {
        const indices = new Set<number>();
        const firstName = c.name.split(' ')[0];
        for (let i = 0; i < sentences.length; i++) {
            if (sentences[i].includes(c.name) || (c.name.includes(' ') && sentences[i].includes(firstName))) {
                indices.add(i);
            }
        }
        charSentenceIndex.set(c.name, indices);
    }

    const edgeKey = (a: string, b: string) =>
        [a, b].sort().join('|||');

    // Count co-occurrences: two chars share a window if their sentence indices are within ±1
    for (let a = 0; a < characters.length; a++) {
        const idxA = charSentenceIndex.get(characters[a].name)!;
        for (let b = a + 1; b < characters.length; b++) {
            const idxB = charSentenceIndex.get(characters[b].name)!;
            let count = 0;
            for (const i of idxA) {
                if (idxB.has(i) || idxB.has(i + 1) || idxB.has(i - 1)) count++;
            }
            if (count > 0) {
                const key = edgeKey(characters[a].name, characters[b].name);
                coMatrix.set(key, (coMatrix.get(key) ?? 0) + count);
            }
        }
    }

    const maxEdgeWeight = Math.max(1, ...coMatrix.values());

    const nodes: CharacterNode[] = characters.map(c => ({
        id: c.name,
        name: c.name,
        weight: Math.round((c.frequency / maxFreq) * 1000) / 1000,
        sentiment: c.sentiment,
    }));

    const edges: CharacterEdge[] = [];
    coMatrix.forEach((count, key) => {
        if (count < 1) return;
        const [source, target] = key.split('|||');
        edges.push({
            source, target,
            weight: Math.round((count / maxEdgeWeight) * 1000) / 1000,
        });
    });

    edges.sort((a, b) => b.weight - a.weight);
    return { nodes, edges: edges.slice(0, 12) };
}

// ═══════════════════════════════════════════════════════════
// 3. SYMBOLIC DENSITY ANALYSER
// ═══════════════════════════════════════════════════════════

export interface SymbolicDensityResult {
    similes: number;   // count of "like a", "as if", "as ... as" patterns
    metaphors: number;   // count of metaphor-indicator patterns
    motifScore: number;   // 0-1: how much the text repeats key motif words
    overallScore: number;   // composite literary richness 0-1
    topMotifs: string[]; // top repeated symbolic words
    label: 'Highly Symbolic' | 'Moderately Symbolic' | 'Literal' | 'Sparse';
}

const SIMILE_PATTERNS = [
    /\blike\s+a[n]?\s+\w+/gi,
    /\bas\s+\w+\s+as/gi,
    /\bas\s+if\b/gi,
    /\bas\s+though\b/gi,
    /\bjust\s+as\b/gi,
];

const METAPHOR_INDICATORS = [
    /\bwas\s+a[n]?\s+[A-Z][a-z]+/gi,  // "was a Storm" / "was a storm"
    /\bbecame?\s+a[n]?\s+\w+/gi,
    /\bis\s+a[n]?\s+(sea|storm|fire|shadow|ghost|blade|wall|river|light|darkness)/gi,
    /\bthe\s+(storm|fire|shadow|silence|darkness|void)\s+(of|inside|within)\b/gi,
];

// Words that carry strong symbolic weight
const SYMBOLIC_WORDS = new Set([
    'shadow', 'darkness', 'light', 'storm', 'silence', 'void', 'fire', 'blood',
    'chains', 'crown', 'sword', 'mirror', 'mask', 'bridge', 'door', 'gate',
    'moon', 'sun', 'star', 'dawn', 'dusk', 'echo', 'ghost', 'dust',
    'heart', 'soul', 'fate', 'curse', 'serpent', 'lion', 'wolf', 'raven',
]);

export function computeSymbolicDensity(text: string): SymbolicDensityResult {
    let similes = 0;
    for (const pattern of SIMILE_PATTERNS) {
        const matches = text.match(pattern);
        similes += matches?.length ?? 0;
    }

    let metaphors = 0;
    for (const pattern of METAPHOR_INDICATORS) {
        const matches = text.match(pattern);
        metaphors += matches?.length ?? 0;
    }

    // Motif detection: symbolic words that appear ≥3 times
    const tokens = tokenise(text);
    const symbolFreq = new Map<string, number>();
    for (const t of tokens) {
        if (SYMBOLIC_WORDS.has(t)) symbolFreq.set(t, (symbolFreq.get(t) ?? 0) + 1);
    }

    const topMotifs = Array.from(symbolFreq.entries())
        .filter(([, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([w]) => w);

    const motifScore = Math.min(1, (topMotifs.length * 0.15) + (symbolFreq.size ? Math.min(0.4, symbolFreq.size / 20) : 0));
    const wordCount = Math.max(1, tokens.length);
    const simileRate = similes / (wordCount / 100);
    const metaphorRate = metaphors / (wordCount / 100);

    const overallScore = Math.min(1, (simileRate * 0.3 + metaphorRate * 0.4 + motifScore * 0.3));

    const label: SymbolicDensityResult['label'] =
        overallScore > 0.55 ? 'Highly Symbolic' :
            overallScore > 0.3 ? 'Moderately Symbolic' :
                overallScore > 0.1 ? 'Literal' : 'Sparse';

    return {
        similes, metaphors, motifScore: parseFloat(motifScore.toFixed(3)),
        overallScore: parseFloat(overallScore.toFixed(3)),
        topMotifs, label,
    };
}

// ═══════════════════════════════════════════════════════════
// 4. DIALOGUE LINE EXTRACTION
// ═══════════════════════════════════════════════════════════

export interface DialogueLine {
    speaker: string;
    line: string;
    tension: number;
    panelIndex: number;
}

/**
 * Extract the most dramatic dialogue lines with speaker attribution.
 * Handles: `"text," said Speaker` and `Speaker: "text"` patterns.
 */
export function extractDialogueLines(
    panels: Array<{ type: string; content: string; speaker?: string; tension?: number }>,
    maxLines = 8
): DialogueLine[] {
    const results: DialogueLine[] = [];

    // Pattern 1: `Speaker: text` (already attributed)
    const colonPattern = /^([A-Z][a-zA-Z\s]{1,20}):\s*["""'"']?(.{10,})/;
    // Pattern 2: `"text," said Speaker` or `"text," Speaker said`
    const saidPattern = /["""'"'"](.{10,})["""'"'"]\s*,?\s*(?:said|whispered|shouted|muttered|called|cried|gasped|snarled|replied|answered)\s+([A-Z][a-z]+)/i;
    // Pattern 3: Dialogue panels with a speaker field
    for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        const tension = p.tension ?? scoreTension(p.content);

        if (p.type === 'dialogue' && p.speaker) {
            results.push({ speaker: p.speaker, line: p.content.slice(0, 200), tension, panelIndex: i });
            continue;
        }

        const colonMatch = colonPattern.exec(p.content);
        if (colonMatch) {
            results.push({ speaker: colonMatch[1].trim(), line: colonMatch[2].trim().slice(0, 200), tension, panelIndex: i });
            continue;
        }

        const saidMatch = saidPattern.exec(p.content);
        if (saidMatch) {
            results.push({ speaker: saidMatch[2].trim(), line: saidMatch[1].trim().slice(0, 200), tension, panelIndex: i });
        }
    }

    // Return the most dramatic lines, deduped by speaker
    return results
        .sort((a, b) => b.tension - a.tension)
        .slice(0, maxLines);
}
