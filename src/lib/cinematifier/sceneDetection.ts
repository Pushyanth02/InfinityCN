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

/** Matches time shifts, location changes, whitespace dividers, and narrative jumps that typically indicate scene breaks */
export const SCENE_BREAK_SIGNALS =
    /(later that night|meanwhile|hours later|at dawn|suddenly|in another place|elsewhere|the next (morning|day|evening|night)|days later|weeks later|months later|years later|across town|back at|far away|on the other side|that morning|at nightfall|before sunrise|after sunset|in a flash|without warning|in an instant|moments later|a while later|at the same time|at that moment|\*\*\*|---|###|\.{3,}|\s{3,})/i;

/** Customizable scene break patterns (user/configurable) */
export const CUSTOM_SCENE_BREAK_PATTERNS: RegExp[] = [
    /^\s*[*\-#=~_]{3,}\s*$/, // e.g., *** --- ###
    /^\s*\.{3,}\s*$/,       // e.g., ...
    /^\s*\s*$/               // blank/whitespace-only lines (optional, can be toggled)
];

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

/** Mood keywords mapped to descriptive prefixes for scene title derivation */
const MOOD_PATTERNS: { pattern: RegExp; prefix: string }[] = [
    { pattern: /\b(terror|dread|horror|fear|scream|dark|shadow|death)\b/i, prefix: 'Dark' },
    { pattern: /\b(joy|laugh|smile|happy|delight|celebrate|cheer)\b/i, prefix: 'Joyful' },
    { pattern: /\b(sorrow|tears|grief|mourn|weep|loss|tragic)\b/i, prefix: 'Sorrowful' },
    { pattern: /\b(tense|danger|threat|warn|urgent|desperate)\b/i, prefix: 'Tense' },
    { pattern: /\b(calm|peace|quiet|gentle|serene|still|rest)\b/i, prefix: 'Quiet' },
];

/**
 * Detect scene breaks in paragraphs using heuristic patterns.
 * Used as fallback when AI scene segmentation is unavailable.
 */
export function detectSceneBreaks(paragraphs: string[]): string[][] {
    const scenes: string[][] = [];
    let currentScene: string[] = [];

    for (const p of paragraphs) {
        // Normalize paragraph for break detection
        const normalized = p.toLowerCase().replace(/[.,!?;:()"'-]/g, ''); // preserve spaces
        // Check for built-in and custom scene break signals (substring match)
        const isCustomBreak = CUSTOM_SCENE_BREAK_PATTERNS.some(re => re.test(p));
        const isSignalBreak = normalized.match(SCENE_BREAK_SIGNALS) !== null;
        
        if ((isCustomBreak || isSignalBreak) && currentScene.length > 0) {
            scenes.push(currentScene);
            currentScene = [];
        }
        
        // Drop the line entirely if it's just a structural divider
        if (!isCustomBreak) {
            currentScene.push(p);
        }
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
