/**
 * textProcessingEngine.ts — Deterministic Text Processing Engine
 *
 * Unified pipeline: raw messy text (PDF/OCR) → structured narrative data.
 *
 * Three core stages:
 *   1. reconstructParagraphs() — merge broken lines, detect boundaries, remove artifacts
 *   2. detectDialogue()        — detect speakers, separate dialogue vs narration
 *   3. segmentScenes()         — detect scene shifts via time/location/character/narrative
 *
 * All stages are deterministic-first. No AI calls.
 */

import {
    cleanExtractedText,
    normalizeQuotes,
    normalizeUnicode,
    reconstructParagraphs as baseReconstructParagraphs,
} from './textProcessing';
import {
    detectPOVShift,
    detectNarrativeMode,
    deriveSceneTitle,
    detectSceneBreaks,
} from './sceneDetection';
import { analyzeSentiment } from './sentimentTracker';

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Classification of a text fragment within a paragraph */
export type FragmentType = 'dialogue' | 'narration' | 'action_beat';

/** A single dialogue or narration fragment */
export interface TextFragment {
    type: FragmentType;
    content: string;
    speaker?: string;
    /** Speech verb used in attribution (said, whispered, etc.) */
    verb?: string;
}

/** A reconstructed paragraph with metadata */
export interface ProcessedParagraph {
    /** Paragraph index (0-based) */
    index: number;
    /** Cleaned paragraph text */
    text: string;
    /** Word count */
    wordCount: number;
    /** Whether paragraph contains dialogue */
    hasDialogue: boolean;
    /** Whether paragraph is a heading */
    isHeading: boolean;
    /** Structured fragments (dialogue/narration/action) */
    fragments: TextFragment[];
}

/** A detected scene within the narrative */
export interface DetectedScene {
    id: string;
    title: string;
    /** All paragraphs belonging to this scene */
    paragraphs: ProcessedParagraph[];
    /** Raw concatenated text */
    text: string;
    /** Scene word count */
    wordCount: number;
    /** Dominant narrative mode */
    narrativeMode: 'normal' | 'flashback' | 'dream' | 'memory';
    /** POV character if detected */
    povCharacter?: string;
    /** Sentiment score (-1 to 1) */
    sentimentScore: number;
    /** What triggered this scene break */
    breakReason: SceneBreakReason;
}

export type SceneBreakReason =
    | 'start'
    | 'time_shift'
    | 'location_shift'
    | 'character_change'
    | 'narrative_transition'
    | 'structural_divider'
    | 'emotional_reset'
    | 'paragraph_limit';

/** Full structured output of the text processing engine */
export interface NarrativeDocument {
    /** Original input text (before processing) */
    originalText: string;
    /** Cleaned text after artifact removal */
    cleanedText: string;
    /** Reconstructed paragraphs */
    paragraphs: ProcessedParagraph[];
    /** Detected scenes */
    scenes: DetectedScene[];
    /** Document-level statistics */
    stats: DocumentStats;
    /** Processing duration in ms */
    processingTimeMs: number;
}

export interface DocumentStats {
    totalWords: number;
    totalParagraphs: number;
    totalScenes: number;
    dialogueFragments: number;
    narrationFragments: number;
    uniqueSpeakers: string[];
    averageWordsPerParagraph: number;
    averageWordsPerScene: number;
    /** Ratio of dialogue to total fragments (0-1) */
    dialogueRatio: number;
}

export interface TextProcessingOptions {
    /** Skip OCR artifact removal (for already-clean text) */
    skipCleaning?: boolean;
    /** Attach speaker labels to dialogue fragments */
    detectSpeakers?: boolean;
    /** Minimum paragraph word count to keep (filters noise) */
    minParagraphWords?: number;
}

// ─── OCR Artifact Patterns ─────────────────────────────────────────────────────

/** Patterns specific to noisy OCR text that go beyond standard PDF cleaning */
const OCR_NOISE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
    // Common OCR misreads
    { pattern: /\bl\b(?=\s+[a-z])/g, replacement: 'I' },        // lowercase L → I (contextual)
    { pattern: /\brn\b/g, replacement: 'rn' },                     // keep 'rn' (often misread as 'm')
    { pattern: /(?<=\w)l(?=[.!?]\s)/g, replacement: 'l' },        // trailing l is usually correct
    // Stray OCR punctuation artifacts
    { pattern: /[`´¨¸˘˙˚˝˜]/g, replacement: '' },                // stray diacritical marks
    { pattern: /(?<=[a-z])\s{2,}(?=[a-z])/g, replacement: ' ' }, // multi-space inside words
    // Broken sentences from column extraction
    { pattern: /(\w)-\s*\n\s*(\w)/g, replacement: '$1$2' },       // hyphenated line breaks
    // Tab characters from table extraction
    { pattern: /\t+/g, replacement: ' ' },
    // Form feed / page break characters
    { pattern: /\f/g, replacement: '\n\n' },
    // Multiple consecutive periods that aren't ellipsis
    { pattern: /\.{4,}/g, replacement: '...' },
    // eslint-disable-next-line no-control-regex
    { pattern: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, replacement: '' },
];

/** Header/footer patterns common in OCR-extracted books */
const HEADER_FOOTER_RE =
    /^\s*(?:chapter\s+\d+\s*$|\d{1,4}\s*$|page\s+\d+|[-–—]\s*\d+\s*[-–—]|copyright\s|all\s+rights\s+reserved)/im;

const ALL_CAPS_HEADING_RE = /^[A-Z][A-Z\d\s:.,!?'"-]+$/;
const HEADING_PATTERNS = [
    /^(?:chapter|prologue|epilogue|part|book|act|section|interlude)\s/i,
    /^(?:I{1,4}|IV|VI{0,3}|IX|X{1,3})\s*[.:\-–—]/,  // Roman numerals
    /^\d{1,3}[.)\s]+[A-Z]/,                             // "1. Title"
];

// ─── Dialogue Detection Patterns ───────────────────────────────────────────────

const DIALOGUE_RE = /(?:"([^"\n]+)"|"([^"\n]+)"|'([^'\n]{4,})')/g;

const SPEECH_VERBS = new Set([
    'said', 'asked', 'replied', 'whispered', 'shouted', 'muttered', 'cried',
    'yelled', 'called', 'answered', 'snapped', 'growled', 'sighed', 'added',
    'remarked', 'told', 'exclaimed', 'stammered', 'mumbled', 'screamed',
    'pleaded', 'demanded', 'insisted', 'suggested', 'declared', 'announced',
    'repeated', 'continued', 'interrupted', 'protested', 'agreed', 'warned',
    'promised', 'threatened', 'begged', 'urged', 'laughed', 'sobbed',
    'groaned', 'hissed', 'barked', 'breathed', 'rasped', 'bellowed',
]);

const SPEAKER_NAME_RE = /[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,2}/;
const PRONOUN_SPEAKERS = new Set(['he', 'she', 'they', 'i', 'we']);

// Attribution: "Name verb" or "verb Name" within 180 chars
const TRAILING_ATTR_RE = new RegExp(
    `(${SPEAKER_NAME_RE.source}|he|she|they|i|we)\\s+(${[...SPEECH_VERBS].join('|')})[\\s,;:!?-]*$`,
    'i',
);
const LEADING_ATTR_RE = new RegExp(
    `^[,;:\\s-]*(${SPEAKER_NAME_RE.source}|he|she|they|i|we)\\s+(${[...SPEECH_VERBS].join('|')})\\b`,
    'i',
);
const VERB_FIRST_TRAILING_RE = new RegExp(
    `(${[...SPEECH_VERBS].join('|')})\\s+(${SPEAKER_NAME_RE.source}|he|she|they|i|we)[\\s,;:!?-]*$`,
    'i',
);
const VERB_FIRST_LEADING_RE = new RegExp(
    `^[,;:\\s-]*(${[...SPEECH_VERBS].join('|')})\\s+(${SPEAKER_NAME_RE.source}|he|she|they|i|we)\\b`,
    'i',
);

/** Action beats between dialogue: short narration describing physical action */
const ACTION_BEAT_RE =
    /^(?:He|She|They|[A-Z][a-z]+)\s+(?:paused|nodded|shook|looked|turned|stepped|leaned|crossed|folded|clenched|unclenched|smiled|frowned|shrugged|gestured|pointed|waved|glanced|stared|sighed|laughed|winced|flinched|blinked|swallowed|hesitated|straightened)/;

// ─── Scene Break Patterns ──────────────────────────────────────────────────────

const TIME_SHIFT_RE =
    /\b(later that night|later that day|hours later|days later|weeks later|months later|years later|meanwhile|the next (?:morning|day|night|evening)|the following (?:morning|day|night)|at dawn|at dusk|at nightfall|before sunrise|after sunset|that night|that morning|moments later|a while later|at the same time)\b/i;

const LOCATION_SHIFT_RE =
    /\b(?:[Ii]n|[Aa]t|[Oo]n|[Ii]nside|[Oo]utside|[Nn]ear|[Aa]cross|[Bb]ack at|[Bb]eyond)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/;

const STRUCTURAL_DIVIDER_RE = /^\s*(?:\*{3,}|-{3,}|#{3,}|\.{3,}|—\s*✦\s*—|~{3,}|={3,})\s*$/;

const NARRATIVE_TRANSITION_RE =
    /\b(meanwhile|elsewhere|back in|back at|on the other side|in another place|at the same time|as for)\b/i;

// ─── Helper Functions ──────────────────────────────────────────────────────────

function countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
}

function isHeading(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed.length < 2 || trimmed.length > 120) return false;
    if (ALL_CAPS_HEADING_RE.test(trimmed) && (trimmed.match(/[A-Z]/g) || []).length >= 2) {
        return true;
    }
    return HEADING_PATTERNS.some(re => re.test(trimmed));
}

function normalizeSpeaker(raw: string): string {
    const speaker = raw.trim();
    if (/^i$/i.test(speaker)) return 'I';
    if (PRONOUN_SPEAKERS.has(speaker.toLowerCase())) return speaker.toLowerCase();
    return speaker;
}

function extractSpeaker(
    before: string,
    after: string,
): { speaker: string; verb: string } | undefined {
    const beforeWindow = before.slice(Math.max(0, before.length - 180));
    const afterWindow = after.slice(0, 180);

    // Check trailing attribution: "Name said" or "said Name"
    let match = beforeWindow.match(TRAILING_ATTR_RE);
    if (match) return { speaker: normalizeSpeaker(match[1]), verb: match[2].toLowerCase() };

    match = beforeWindow.match(VERB_FIRST_TRAILING_RE);
    if (match) return { speaker: normalizeSpeaker(match[2]), verb: match[1].toLowerCase() };

    // Check leading attribution: "Name said" or "said Name"
    match = afterWindow.match(LEADING_ATTR_RE);
    if (match) return { speaker: normalizeSpeaker(match[1]), verb: match[2].toLowerCase() };

    match = afterWindow.match(VERB_FIRST_LEADING_RE);
    if (match) return { speaker: normalizeSpeaker(match[2]), verb: match[1].toLowerCase() };

    return undefined;
}

function classifyBreakReason(
    previousParagraph: string | undefined,
    currentParagraph: string,
): SceneBreakReason {
    if (!previousParagraph) return 'start';
    if (STRUCTURAL_DIVIDER_RE.test(currentParagraph)) return 'structural_divider';
    if (TIME_SHIFT_RE.test(currentParagraph)) return 'time_shift';

    const prevLoc = currentParagraph.match(LOCATION_SHIFT_RE)?.[1]?.toLowerCase();
    const curLoc = previousParagraph.match(LOCATION_SHIFT_RE)?.[1]?.toLowerCase();
    if (prevLoc && curLoc && prevLoc !== curLoc) return 'location_shift';

    if (NARRATIVE_TRANSITION_RE.test(currentParagraph)) return 'narrative_transition';

    const prevPOV = detectPOVShift([previousParagraph]);
    const curPOV = detectPOVShift([currentParagraph]);
    if (prevPOV && curPOV && prevPOV !== curPOV) return 'character_change';

    const prevSentiment = analyzeSentiment(previousParagraph);
    const curSentiment = analyzeSentiment(currentParagraph);
    const delta = Math.abs(prevSentiment.score - curSentiment.score);
    if (delta >= 0.55) return 'emotional_reset';

    return 'paragraph_limit';
}

// ─── Stage 1: Paragraph Reconstruction ─────────────────────────────────────────

/**
 * Clean OCR artifacts beyond standard PDF cleaning.
 * Handles stray control characters, broken columns, noisy punctuation.
 */
export function cleanOCRArtifacts(text: string): string {
    let result = text;
    for (const { pattern, replacement } of OCR_NOISE_PATTERNS) {
        result = result.replace(pattern, replacement);
    }

    // Remove likely header/footer lines
    const lines = result.split('\n');
    const cleaned = lines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return true; // keep blank lines for paragraph detection
        // Remove very short lines that look like page artifacts
        if (trimmed.length <= 3 && /^\d+$/.test(trimmed)) return false;
        if (HEADER_FOOTER_RE.test(trimmed) && trimmed.length < 60) return false;
        return true;
    });

    return cleaned.join('\n');
}

/**
 * Stage 1: Reconstruct paragraphs from raw messy text.
 *
 * Pipeline: OCR cleanup → PDF artifact removal → Unicode normalization →
 *           Quote normalization → Paragraph boundary detection → Line merging
 */
export function reconstructParagraphs(
    rawText: string,
    options: TextProcessingOptions = {},
): ProcessedParagraph[] {
    if (!rawText.trim()) return [];

    // Phase 1: Clean
    let text = rawText;
    if (!options.skipCleaning) {
        text = cleanOCRArtifacts(text);
        text = cleanExtractedText(text);
    }
    text = normalizeUnicode(normalizeQuotes(text));

    // Phase 2: Rebuild paragraph boundaries
    const rebuilt = baseReconstructParagraphs(text);

    // Phase 3: Split into paragraphs and build structured output
    const rawParagraphs = rebuilt
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(Boolean);

    const minWords = options.minParagraphWords ?? 0;
    const paragraphs: ProcessedParagraph[] = [];
    let index = 0;

    for (const raw of rawParagraphs) {
        const wc = countWords(raw);
        if (wc < minWords) continue;

        const heading = isHeading(raw);
        const fragments = options.detectSpeakers !== false
            ? extractFragments(raw)
            : [{ type: 'narration' as FragmentType, content: raw }];
        const hasDialogue = fragments.some(f => f.type === 'dialogue');

        paragraphs.push({
            index,
            text: raw,
            wordCount: wc,
            hasDialogue,
            isHeading: heading,
            fragments,
        });
        index++;
    }

    return paragraphs;
}

// ─── Stage 2: Dialogue Detection ───────────────────────────────────────────────

/**
 * Extract structured dialogue/narration/action fragments from a paragraph.
 */
function extractFragments(paragraph: string): TextFragment[] {
    const fragments: TextFragment[] = [];
    let cursor = 0;

    for (const match of paragraph.matchAll(DIALOGUE_RE)) {
        const matchIndex = match.index ?? 0;
        const fullMatch = match[0];
        const dialogueContent = match[1] ?? match[2] ?? match[3] ?? '';

        // Narration before this dialogue
        if (matchIndex > cursor) {
            const narration = paragraph.slice(cursor, matchIndex).trim();
            if (narration) {
                pushNarrationFragments(fragments, narration);
            }
        }

        // Detect speaker from surrounding context
        const before = paragraph.slice(0, matchIndex);
        const after = paragraph.slice(matchIndex + fullMatch.length);
        const attribution = extractSpeaker(before, after);

        fragments.push({
            type: 'dialogue',
            content: dialogueContent.replace(/\s+/g, ' ').trim(),
            speaker: attribution?.speaker,
            verb: attribution?.verb,
        });

        cursor = matchIndex + fullMatch.length;
    }

    // Trailing narration
    if (cursor < paragraph.length) {
        const trailing = paragraph.slice(cursor).trim();
        if (trailing) {
            pushNarrationFragments(fragments, trailing);
        }
    }

    // If no fragments were extracted, treat entire paragraph as narration
    if (fragments.length === 0) {
        fragments.push({ type: 'narration', content: paragraph.trim() });
    }

    return fragments;
}

function pushNarrationFragments(fragments: TextFragment[], text: string): void {
    // Clean up leading/trailing attribution punctuation
    const cleaned = text
        .replace(/^[,;:\-\s]+/, '')
        .replace(/[,;:\-\s]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) return;

    // Check if this is an action beat between dialogue
    if (ACTION_BEAT_RE.test(cleaned) && countWords(cleaned) <= 12) {
        fragments.push({ type: 'action_beat', content: cleaned });
    } else {
        fragments.push({ type: 'narration', content: cleaned });
    }
}

/**
 * Stage 2: Detect dialogue in processed paragraphs.
 *
 * Returns the same paragraphs with enriched fragment data.
 * This is a re-analysis pass that can be used independently.
 */
export function detectDialogue(paragraphs: ProcessedParagraph[]): ProcessedParagraph[] {
    return paragraphs.map(p => {
        if (p.isHeading) return p;

        const fragments = extractFragments(p.text);
        return {
            ...p,
            fragments,
            hasDialogue: fragments.some(f => f.type === 'dialogue'),
        };
    });
}

// ─── Stage 3: Scene Segmentation ───────────────────────────────────────────────

/**
 * Stage 3: Segment paragraphs into scenes.
 *
 * Uses multi-signal heuristics:
 *   - Time changes (hours later, the next morning)
 *   - Location shifts (at the Castle, inside the cave)
 *   - Character POV changes
 *   - Narrative transitions (meanwhile, elsewhere)
 *   - Emotional resets (sentiment polarity flip)
 *   - Structural dividers (***, ---, etc.)
 */
export function segmentScenes(paragraphs: ProcessedParagraph[]): DetectedScene[] {
    if (paragraphs.length === 0) return [];

    // Use existing scene detection on raw text
    const rawParagraphs = paragraphs
        .filter(p => !p.isHeading || paragraphs.length <= 3) // keep headings if very short doc
        .map(p => p.text);

    const sceneGroups = detectSceneBreaks(rawParagraphs);
    const scenes: DetectedScene[] = [];

    // Map scene groups back to ProcessedParagraph objects
    let paragraphCursor = 0;

    for (let sceneIdx = 0; sceneIdx < sceneGroups.length; sceneIdx++) {
        const group = sceneGroups[sceneIdx];
        const sceneParagraphs: ProcessedParagraph[] = [];

        for (const groupText of group) {
            // Find matching paragraph
            while (paragraphCursor < paragraphs.length) {
                const p = paragraphs[paragraphCursor];
                if (p.text === groupText || p.text.includes(groupText) || groupText.includes(p.text)) {
                    sceneParagraphs.push(p);
                    paragraphCursor++;
                    break;
                }
                // Skip headings that weren't in the raw list
                if (p.isHeading) {
                    sceneParagraphs.push(p);
                    paragraphCursor++;
                } else {
                    paragraphCursor++;
                }
            }
        }

        // If paragraph matching failed, fall back to sequential assignment
        if (sceneParagraphs.length === 0) {
            const startIdx = sceneIdx === 0 ? 0 : scenes.reduce((sum, s) => sum + s.paragraphs.length, 0);
            const endIdx = Math.min(startIdx + group.length, paragraphs.length);
            for (let i = startIdx; i < endIdx; i++) {
                sceneParagraphs.push(paragraphs[i]);
            }
        }

        if (sceneParagraphs.length === 0) continue;

        const sceneText = sceneParagraphs.map(p => p.text).join('\n\n');
        const rawTexts = sceneParagraphs.map(p => p.text);
        const sentiment = analyzeSentiment(sceneText);
        const previousScene = scenes.length > 0 ? scenes[scenes.length - 1] : undefined;
        const previousLastParagraph = previousScene
            ? previousScene.paragraphs[previousScene.paragraphs.length - 1]?.text
            : undefined;

        scenes.push({
            id: `scene-${sceneIdx + 1}`,
            title: deriveSceneTitle(rawTexts, sceneIdx + 1),
            paragraphs: sceneParagraphs,
            text: sceneText,
            wordCount: sceneParagraphs.reduce((sum, p) => sum + p.wordCount, 0),
            narrativeMode: detectNarrativeMode(rawTexts[0] ?? ''),
            povCharacter: detectPOVShift(rawTexts) ?? undefined,
            sentimentScore: sentiment.score,
            breakReason: classifyBreakReason(previousLastParagraph, rawTexts[0] ?? ''),
        });
    }

    // Handle any unassigned paragraphs
    if (paragraphCursor < paragraphs.length && scenes.length > 0) {
        const lastScene = scenes[scenes.length - 1];
        for (let i = paragraphCursor; i < paragraphs.length; i++) {
            lastScene.paragraphs.push(paragraphs[i]);
            lastScene.wordCount += paragraphs[i].wordCount;
        }
        lastScene.text = lastScene.paragraphs.map(p => p.text).join('\n\n');
    }

    return scenes;
}

// ─── Unified Pipeline ──────────────────────────────────────────────────────────

/**
 * Run the full deterministic text processing pipeline.
 *
 * Input:  raw messy text (PDF/OCR extracted)
 * Output: NarrativeDocument with structured paragraphs, dialogue, and scenes
 */
export function processText(
    rawText: string,
    options: TextProcessingOptions = {},
): NarrativeDocument {
    const startTime = performance.now();

    if (!rawText.trim()) {
        return {
            originalText: rawText,
            cleanedText: '',
            paragraphs: [],
            scenes: [],
            stats: {
                totalWords: 0,
                totalParagraphs: 0,
                totalScenes: 0,
                dialogueFragments: 0,
                narrationFragments: 0,
                uniqueSpeakers: [],
                averageWordsPerParagraph: 0,
                averageWordsPerScene: 0,
                dialogueRatio: 0,
            },
            processingTimeMs: 0,
        };
    }

    // Stage 1: Paragraph reconstruction (includes cleaning)
    const paragraphs = reconstructParagraphs(rawText, options);
    const cleanedText = paragraphs.map(p => p.text).join('\n\n');

    // Stage 2: Dialogue detection (already done during reconstruction if detectSpeakers)
    // Re-run only if initial pass skipped speaker detection
    const enrichedParagraphs = options.detectSpeakers === false
        ? detectDialogue(paragraphs)
        : paragraphs;

    // Stage 3: Scene segmentation
    const scenes = segmentScenes(enrichedParagraphs);

    // Compute statistics
    const allFragments = enrichedParagraphs.flatMap(p => p.fragments);
    const dialogueFragments = allFragments.filter(f => f.type === 'dialogue').length;
    const narrationFragments = allFragments.filter(f => f.type === 'narration').length;
    const totalFragments = Math.max(1, allFragments.length);

    const speakerSet = new Set<string>();
    for (const f of allFragments) {
        if (f.speaker) speakerSet.add(f.speaker);
    }

    const totalWords = enrichedParagraphs.reduce((sum, p) => sum + p.wordCount, 0);

    const stats: DocumentStats = {
        totalWords,
        totalParagraphs: enrichedParagraphs.length,
        totalScenes: scenes.length,
        dialogueFragments,
        narrationFragments,
        uniqueSpeakers: [...speakerSet].sort(),
        averageWordsPerParagraph: enrichedParagraphs.length > 0
            ? Math.round(totalWords / enrichedParagraphs.length)
            : 0,
        averageWordsPerScene: scenes.length > 0
            ? Math.round(totalWords / scenes.length)
            : 0,
        dialogueRatio: Math.round((dialogueFragments / totalFragments) * 1000) / 1000,
    };

    return {
        originalText: rawText,
        cleanedText,
        paragraphs: enrichedParagraphs,
        scenes,
        stats,
        processingTimeMs: Math.round(performance.now() - startTime),
    };
}
