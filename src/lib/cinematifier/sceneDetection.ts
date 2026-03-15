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

/** Matches time shifts, location changes, and narrative jumps that typically indicate scene breaks */
export const SCENE_BREAK_SIGNALS =
    /(later that night|meanwhile|hours later|at dawn|suddenly|in another place|elsewhere|the next (morning|day|evening|night)|days later|weeks later|months later|years later|across town|back at|far away|on the other side|that morning|at nightfall|before sunrise|after sunset|in a flash|without warning|in an instant|moments later|a while later|at the same time|at that moment)/i;

/** Matches preposition + optional article + capitalized location name (e.g., "in the Forest", "at Castle Rock") */
export const LOCATION_PATTERN =
    /\b(?:in|at|on|near|beside|inside|outside|beneath|above|across)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/;

/** Matches time-of-day or temporal phrases for scene title derivation */
export const TIME_PATTERN =
    /\b(that night|that morning|the next day|at dawn|at dusk|hours later|days later|meanwhile)\b/i;

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

/**
 * Detect scene breaks in paragraphs using heuristic patterns.
 * Used as fallback when AI scene segmentation is unavailable.
 */
export function detectSceneBreaks(paragraphs: string[]): string[][] {
    const scenes: string[][] = [];
    let currentScene: string[] = [];

    for (const p of paragraphs) {
        if (SCENE_BREAK_SIGNALS.test(p) && currentScene.length > 0) {
            scenes.push(currentScene);
            currentScene = [];
        }

        currentScene.push(p);
    }

    if (currentScene.length) scenes.push(currentScene);

    return scenes;
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
