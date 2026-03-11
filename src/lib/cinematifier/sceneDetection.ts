/**
 * sceneDetection.ts — Heuristic Scene Break Detection
 *
 * Uses regex patterns to identify time shifts, location changes, and narrative
 * jumps that typically indicate scene breaks. Provides fallback scene segmentation
 * when AI-powered segmentation is unavailable.
 */

/** Matches time shifts, location changes, and narrative jumps that typically indicate scene breaks */
export const SCENE_BREAK_SIGNALS =
    /(later that night|meanwhile|hours later|at dawn|suddenly|in another place|elsewhere|the next (morning|day|evening|night)|days later|weeks later|months later|years later|across town|back at|far away|on the other side)/i;

/** Matches preposition + optional article + capitalized location name (e.g., "in the Forest", "at Castle Rock") */
export const LOCATION_PATTERN =
    /\b(?:in|at|on|near|beside|inside|outside|beneath|above|across)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/;

/** Matches time-of-day or temporal phrases for scene title derivation */
export const TIME_PATTERN =
    /\b(that night|that morning|the next day|at dawn|at dusk|hours later|days later|meanwhile)\b/i;

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

/** Derive a simple scene title from the first paragraph of a scene group */
export function deriveSceneTitle(sceneParagraphs: string[], sceneNumber: number): string {
    const first = sceneParagraphs[0] || '';
    // Try to extract a location or time indicator
    const locationMatch = first.match(LOCATION_PATTERN);
    if (locationMatch) return locationMatch[1];

    const timeMatch = first.match(TIME_PATTERN);
    if (timeMatch) return timeMatch[1].charAt(0).toUpperCase() + timeMatch[1].slice(1);

    return `Scene ${sceneNumber}`;
}
