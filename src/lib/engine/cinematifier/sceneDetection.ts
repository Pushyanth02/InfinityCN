/**
 * sceneDetection.ts — Heuristic Scene Break Detection
 *
 * Uses regex patterns to identify time shifts, location changes, and narrative
 * jumps that typically indicate scene breaks. Provides fallback scene segmentation
 * when AI-powered segmentation is unavailable.
 *
 * Also provides POV-shift detection, narrative-mode classification (flashback,
 * dream, memory), and improved scene-title derivation.
 */

import { analyzeSentiment } from './sentimentTracker';

/** Matches time shifts, location changes, whitespace dividers, and narrative jumps that typically indicate scene breaks */
export const SCENE_BREAK_SIGNALS =
    /(later that night|meanwhile|hours later|at dawn|suddenly|in another place|elsewhere|the next (morning|day|evening|night)|days later|weeks later|months later|years later|across town|back at|far away|on the other side|that morning|at nightfall|before sunrise|after sunset|in a flash|without warning|in an instant|moments later|a while later|at the same time|at that moment|\*\*\*|---|###|\.{3,}|\s{3,})/i;

/** Customizable scene break patterns (user/configurable) */
export const CUSTOM_SCENE_BREAK_PATTERNS: RegExp[] = [
    /^\s*[*\-#=~_]{3,}\s*$/, // e.g., *** --- ###
    /^\s*\.{3,}\s*$/, // e.g., ...
    /^\s*\s*$/, // blank/whitespace-only lines (optional, can be toggled)
];

/** Matches preposition + optional article + capitalized location name (e.g., "in the Forest", "at Castle Rock") */
export const LOCATION_PATTERN =
    /\b(?:[Ii]n|[Aa]t|[Oo]n|[Nn]ear|[Bb]eside|[Ii]nside|[Oo]utside|[Bb]eneath|[Aa]bove|[Aa]cross)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/;

/** Matches time-of-day or temporal phrases for scene title derivation */
export const TIME_PATTERN =
    /\b(that night|that morning|the next day|at dawn|at dusk|hours later|days later|meanwhile)\b/i;

const TIME_SHIFT_PATTERN =
    /\b(later|earlier|meanwhile|the next (?:morning|day|night|evening)|at (?:dawn|dusk|sunrise|sunset|nightfall)|that (?:night|morning|evening)|hours later|days later|weeks later|months later|years later)\b/i;
const LOCATION_SHIFT_PATTERN =
    /\b(?:[Ii]n|[Aa]t|[Oo]n|[Ii]nside|[Oo]utside|[Nn]ear|[Aa]cross|[Bb]ack at|[Bb]eyond)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/;
const NARRATIVE_TRANSITION_PATTERN =
    /\b(meanwhile|elsewhere|back in|back at|on the other side|later|earlier|in another place|at the same time|as for)\b/i;
const EMOTIONAL_RESET_THRESHOLD = 0.55;
const SCENE_BREAK_THRESHOLD = 2;
const MAX_PARAGRAPHS_PER_SCENE = 8;

const ORIGINAL_MODE_TIME_SHIFT_PATTERN =
    /\b(later that night|later that day|hours later|days later|weeks later|months later|years later|meanwhile|the next morning|the next day|the following morning|at dawn|at dusk|at nightfall|before sunrise|after sunset|that night|that morning)\b/i;
const ORIGINAL_MODE_LOCATION_PATTERN =
    /\b(?:in|at|on|inside|outside|near|within|beneath|beyond|across)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i;
const ORIGINAL_MODE_SCENE_DIVIDER_PATTERN = /^\s*(?:\*{3,}|-{3,}|#{3,}|\.{3,}|—\s*✦\s*—)\s*$/;
const ORIGINAL_MODE_STRONG_BREAK_NEWLINES = 3;

export interface Scene {
    id: string;
    text: string;
}

/** Matches a capitalized character name at the start of a sentence followed by a verb */
const POV_NAME_PATTERN =
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:walked|thought|felt|saw|heard|knew|looked|stood|turned|ran|sat|watched|wondered|realized|remembered|noticed|whispered|said|spoke|asked|replied|muttered|sighed|screamed|cried|laughed|smiled|frowned|gazed|stared|glanced|moved|stepped|entered|left|opened|closed|grabbed|held|dropped|pulled|pushed|reached|waited|paused|hesitated|decided|began|started|continued|tried|wanted|needed|wished|hoped|feared|loved|hated)\b/;

const FLASHBACK_PATTERN =
    /\b(he remembered|she remembered|they remembered|remembered when|she recalled|he recalled|they recalled|memories flooded|years ago|long ago)\b/i;
const DREAM_PATTERN = /\b(dreaming|in the dream|the dream faded|woke with a start)\b/i;
const MEMORY_PATTERN = /\b(the memory|recollection)\b/i;

const DIALOGUE_OPENING_PATTERN = /^[""\u201C]/;
const ACTION_PATTERN =
    /\b(explosion|attack|battle|fight|chase|escape|collision|confrontation|argument|scream|crash|gunshot|ambush|pursuit)\b/i;

/** Mood keywords mapped to descriptive prefixes for scene title derivation */
const MOOD_PATTERNS: { pattern: RegExp; prefix: string }[] = [
    { pattern: /\b(terror|dread|horror|fear|scream|dark|shadow|death)\b/i, prefix: 'Dark' },
    { pattern: /\b(joy|laugh|smile|happy|delight|celebrate|cheer)\b/i, prefix: 'Joyful' },
    { pattern: /\b(sorrow|tears|grief|mourn|weep|loss|tragic)\b/i, prefix: 'Sorrowful' },
    { pattern: /\b(tense|danger|threat|warn|urgent|desperate)\b/i, prefix: 'Tense' },
    { pattern: /\b(calm|peace|quiet|gentle|serene|still|rest)\b/i, prefix: 'Quiet' },
];

function extractLocationHint(paragraph: string): string | undefined {
    const match = paragraph.match(LOCATION_SHIFT_PATTERN) || paragraph.match(LOCATION_PATTERN);
    return match?.[1]?.trim().toLowerCase();
}

function hasEmotionalReset(previous: string, current: string): boolean {
    const prevSentiment = analyzeSentiment(previous);
    const currentSentiment = analyzeSentiment(current);

    if (prevSentiment.confidence < 0.05 || currentSentiment.confidence < 0.05) return false;

    const delta = Math.abs(prevSentiment.score - currentSentiment.score);
    const polarityFlipped =
        Math.sign(prevSentiment.score) !== Math.sign(currentSentiment.score) &&
        Math.abs(prevSentiment.score) >= 0.2 &&
        Math.abs(currentSentiment.score) >= 0.2;

    return delta >= EMOTIONAL_RESET_THRESHOLD || polarityFlipped;
}

function shouldStartNewScene(
    previous: string,
    current: string,
    currentSceneLength: number,
): boolean {
    const previousLocation = extractLocationHint(previous);
    const currentLocation = extractLocationHint(current);
    const locationChanged =
        Boolean(previousLocation) &&
        Boolean(currentLocation) &&
        previousLocation !== currentLocation;

    const timeShift = TIME_SHIFT_PATTERN.test(current);
    const legacySignal = SCENE_BREAK_SIGNALS.test(current);
    const narrativeTransition = NARRATIVE_TRANSITION_PATTERN.test(current);
    const modeTransition = detectNarrativeMode(previous) !== detectNarrativeMode(current);
    const emotionalReset = hasEmotionalReset(previous, current);

    let score = 0;
    if (timeShift) score += 2;
    if (locationChanged) score += 2;
    if (legacySignal || narrativeTransition || modeTransition) score += 2;
    if (emotionalReset) score += 2;

    if (currentSceneLength >= MAX_PARAGRAPHS_PER_SCENE && score >= 1) return true;
    return score >= SCENE_BREAK_THRESHOLD;
}

function segmentParagraphsUniversal(paragraphs: string[]): string[][] {
    const scenes: string[][] = [];
    let currentScene: string[] = [];

    for (const paragraph of paragraphs) {
        const p = paragraph.trim();
        if (!p) continue;

        const isStructuralDivider = CUSTOM_SCENE_BREAK_PATTERNS.some(re => re.test(p));
        if (isStructuralDivider) {
            if (currentScene.length) {
                scenes.push(currentScene);
                currentScene = [];
            }
            continue;
        }

        if (
            currentScene.length > 0 &&
            shouldStartNewScene(currentScene[currentScene.length - 1], p, currentScene.length)
        ) {
            scenes.push(currentScene);
            currentScene = [];
        }

        currentScene.push(p);
    }

    if (currentScene.length) scenes.push(currentScene);
    return scenes;
}

function extractOriginalModeLocation(paragraph: string): string | undefined {
    const match = paragraph.match(ORIGINAL_MODE_LOCATION_PATTERN);
    return match?.[1]?.trim().toLowerCase();
}

function splitParagraphsWithBreakStrength(
    text: string,
): Array<{ paragraph: string; breakNewlines: number }> {
    const normalized = text.replace(/\r\n|\r/g, '\n').trim();
    if (!normalized) return [];

    const tokens = normalized.split(/(\n\s*\n+)/);
    const units: Array<{ paragraph: string; breakNewlines: number }> = [];

    for (let i = 0; i < tokens.length; i += 2) {
        const paragraph = (tokens[i] ?? '').trim();
        if (!paragraph) continue;

        const separator = tokens[i + 1] ?? '';
        const breakNewlines = (separator.match(/\n/g) || []).length;
        units.push({ paragraph, breakNewlines });
    }

    return units;
}

/**
 * Deterministic scene detection for original reader mode.
 * Splits scenes on time shifts, location changes, explicit dividers, and strong paragraph breaks.
 */
export function detectOriginalModeScenes(text: string): Scene[] {
    const units = splitParagraphsWithBreakStrength(text);
    if (units.length === 0) return [];

    const scenes: string[][] = [];
    let currentScene: string[] = [];
    let currentLocation: string | undefined;

    for (let i = 0; i < units.length; i++) {
        const { paragraph, breakNewlines } = units[i];

        if (ORIGINAL_MODE_SCENE_DIVIDER_PATTERN.test(paragraph)) {
            if (currentScene.length > 0) {
                scenes.push(currentScene);
                currentScene = [];
                currentLocation = undefined;
            }
            continue;
        }

        const detectedLocation = extractOriginalModeLocation(paragraph);
        const hasLocationShift =
            Boolean(detectedLocation) &&
            Boolean(currentLocation) &&
            detectedLocation !== currentLocation;
        const hasTimeShift = ORIGINAL_MODE_TIME_SHIFT_PATTERN.test(paragraph);
        const hasStrongBreak =
            i > 0 && units[i - 1].breakNewlines >= ORIGINAL_MODE_STRONG_BREAK_NEWLINES;

        const shouldStartNewScene =
            currentScene.length > 0 && (hasTimeShift || hasLocationShift || hasStrongBreak);

        if (shouldStartNewScene) {
            scenes.push(currentScene);
            currentScene = [];
            currentLocation = undefined;
        }

        currentScene.push(paragraph);
        if (detectedLocation) {
            currentLocation = detectedLocation;
        }

        if (breakNewlines >= ORIGINAL_MODE_STRONG_BREAK_NEWLINES && i < units.length - 1) {
            scenes.push(currentScene);
            currentScene = [];
            currentLocation = undefined;
        }
    }

    if (currentScene.length > 0) {
        scenes.push(currentScene);
    }

    return scenes.map((sceneParagraphs, index) => ({
        id: `scene-${index + 1}`,
        text: sceneParagraphs.join('\n\n'),
    }));
}

/**
 * Detect scene breaks in paragraphs using heuristic patterns.
 * Used as fallback when AI scene segmentation is unavailable.
 */
export function detectSceneBreaks(paragraphs: string[]): string[][] {
    return segmentParagraphsUniversal(paragraphs);
}

/**
 * Universal scene segmentation for arbitrary novel text.
 * Detects time shifts, location changes, narrative transitions, and emotional resets.
 */
export function segmentScenesUniversal(text: string): Scene[] {
    const paragraphs = text
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(Boolean);

    const groupedScenes = segmentParagraphsUniversal(paragraphs);
    return groupedScenes.map((sceneParagraphs, index) => ({
        id: `scene-${index + 1}`,
        text: sceneParagraphs.join('\n\n'),
    }));
}

/** Derive a scene title from the first paragraph of a scene group */
export function deriveSceneTitle(sceneParagraphs: string[], sceneNumber: number): string {
    const first = sceneParagraphs[0] || '';

    const locationMatch = first.match(LOCATION_PATTERN);
    if (locationMatch) return locationMatch[1];

    const timeMatch = first.match(TIME_PATTERN);
    if (timeMatch) return timeMatch[1].charAt(0).toUpperCase() + timeMatch[1].slice(1);

    if (DIALOGUE_OPENING_PATTERN.test(first.trim())) {
        const actionMatch = first.match(ACTION_PATTERN);
        if (actionMatch) return `The ${capitalize(actionMatch[1])}`;
        return 'The Conversation';
    }

    const actionMatch = first.match(ACTION_PATTERN);
    if (actionMatch) return `The ${capitalize(actionMatch[1])}`;

    // Mood-based title derivation: scan all paragraphs for emotional tone
    const allText = sceneParagraphs.join(' ');
    for (const { pattern, prefix } of MOOD_PATTERNS) {
        if (pattern.test(allText)) {
            return `${prefix} Scene ${sceneNumber}`;
        }
    }

    // POV-based title: if a POV shift is detected, use the character's name (not pronoun)
    const pov = detectPOVShift(sceneParagraphs);
    const pronouns = ['He', 'She', 'They', 'We', 'I', 'You', 'It'];
    if (pov && !pronouns.includes(pov)) return `${pov}'s Scene`;

    return `Scene ${sceneNumber}`;
}

/**
 * Detect whether the first paragraph signals a POV character.
 * Looks for a capitalized name followed by an action/thought verb at the start.
 */
export function detectPOVShift(paragraphs: string[]): string | undefined {
    if (!paragraphs.length) return undefined;

    const first = paragraphs[0].trim();
    const match = first.match(POV_NAME_PATTERN);
    return match ? match[1] : undefined;
}

/**
 * Classify a paragraph's narrative mode based on flashback, dream, and
 * memory markers.
 */
export function detectNarrativeMode(
    paragraph: string,
): 'normal' | 'flashback' | 'dream' | 'memory' {
    if (FLASHBACK_PATTERN.test(paragraph)) return 'flashback';
    if (DREAM_PATTERN.test(paragraph)) return 'dream';
    if (MEMORY_PATTERN.test(paragraph)) return 'memory';
    return 'normal';
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
