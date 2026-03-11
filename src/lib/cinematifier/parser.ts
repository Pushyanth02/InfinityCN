/**
 * parser.ts — Cinematic Block Parser
 *
 * Parses AI-generated cinematified text into structured CinematicBlock arrays.
 * Handles: [SCENE:] markers, SFX: annotations, BEAT/PAUSE markers, CUT TO/FADE IN
 * transitions, scene breaks (— ✦ —), [REFLECTION]/[TENSION] wrappers, dialogue,
 * camera directions, and regular action text.
 *
 * Also exports shared helpers (generateBlockId, guessSFXIntensity, validation)
 * used by the offline engine.
 */

import type { CinematicBlock, BeatType, TransitionType } from '../../types/cinematifier';

// ─── Session epoch for stable IDs ──────────────────────────
const SESSION_EPOCH = Date.now();
let blockCounter = 0;

export function generateBlockId(): string {
    return `cine-${SESSION_EPOCH}-${blockCounter++}`;
}

// ─── Validation Helpers ────────────────────────────────────

const VALID_BEAT_TYPES = new Set<string>([
    'BEAT',
    'PAUSE',
    'LONG PAUSE',
    'SILENCE',
    'TENSION',
    'RELEASE',
]);
const VALID_TRANSITION_TYPES = new Set<string>([
    'FADE IN',
    'FADE OUT',
    'FADE TO BLACK',
    'CUT TO',
    'DISSOLVE TO',
    'SMASH CUT',
    'MATCH CUT',
    'JUMP CUT',
    'WIPE TO',
    'IRIS IN',
    'IRIS OUT',
]);

export function validateBeatType(type: string): BeatType {
    return VALID_BEAT_TYPES.has(type) ? (type as BeatType) : 'BEAT';
}

export function validateTransitionType(type: string): TransitionType {
    return VALID_TRANSITION_TYPES.has(type) ? (type as TransitionType) : 'CUT TO';
}

// ─── SFX Intensity Heuristic ───────────────────────────────

/** Guess SFX intensity from the sound description */
export function guessSFXIntensity(sound: string): import('../../types/cinematifier').SFXIntensity {
    const upper = sound.toUpperCase();
    if (/CRASH|BANG|BOOM|BLAST|EXPLOSI|SHATTER|THUNDER|GUNSHOT|ROAR/.test(upper)) return 'loud';
    if (/SILENCE|WHISPER|SOFT|GENTLE|HUM|DRIP|TICK|CREAK/.test(upper)) return 'soft';
    if (/SLAM|STOMP|CANNON|DETONA/.test(upper)) return 'explosive';
    return 'medium';
}

// ─── Internal Helpers ──────────────────────────────────────

/** Helper to extract common tags from a line and return the cleaned line + metadata */
function extractBlockMetadata(line: string) {
    let cleaned = line;
    let emotion: import('../../types/cinematifier').EmotionCategory | undefined;
    let tensionScore: number | undefined;

    const emotionMatch = cleaned.match(/\[EMOTION:\s*([a-z]+)\]/i);
    if (emotionMatch) {
        const e = emotionMatch[1].toLowerCase();
        if (['joy', 'fear', 'sadness', 'suspense', 'anger', 'surprise', 'neutral'].includes(e)) {
            emotion = e as import('../../types/cinematifier').EmotionCategory;
        }
        cleaned = cleaned.replace(emotionMatch[0], '');
    }

    const tensionMatch = cleaned.match(/\[TENSION:\s*(\d+)\]/i);
    if (tensionMatch) {
        tensionScore = Math.max(0, Math.min(100, parseInt(tensionMatch[1], 10)));
        cleaned = cleaned.replace(tensionMatch[0], '');
    }

    return { cleaned: cleaned.trim(), emotion, tensionScore };
}

/** Parse a single text line into one or more CinematicBlocks */
function parseTextLine(line: string): CinematicBlock[] {
    const blocks: CinematicBlock[] = [];
    const { cleaned, emotion, tensionScore } = extractBlockMetadata(line);

    if (!cleaned) return blocks;

    // Dialogue: line starts with "quoted text"
    const dialogueMatch = cleaned.match(/^"([^"]+)"(.*)$/);
    if (dialogueMatch) {
        const dialogue = dialogueMatch[1];
        const remainder = dialogueMatch[2]?.trim();

        // Try to detect speaker from remainder
        let speaker: string | undefined;
        const speakerAfter = remainder?.match(
            /\b(?:said|whispered|shouted|muttered|replied|asked|exclaimed|called|cried|growled|hissed|barked|snapped)\s+([A-Z][a-z]+)/,
        );
        const speakerBefore = remainder?.match(
            /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|whispered|shouted|muttered)/,
        );
        if (speakerAfter) speaker = speakerAfter[1].toUpperCase();
        else if (speakerBefore) speaker = speakerBefore[1].toUpperCase();

        let intensity: CinematicBlock['intensity'] = 'normal';
        if (dialogue.includes('!')) intensity = 'shout';
        if (/whisper|soft|quiet/i.test(remainder || '')) intensity = 'whisper';

        blocks.push({
            id: generateBlockId(),
            type: 'dialogue',
            content: dialogue,
            speaker,
            intensity,
            emotion,
            tensionScore,
        });

        // Add remainder as action if substantial
        if (remainder && remainder.length > 5) {
            blocks.push({
                id: generateBlockId(),
                type: 'action',
                content: remainder,
                intensity: 'normal',
            });
        }

        return blocks;
    }

    // Inner thought: *italicized text* or _underscored_
    if (/^\*[^*]+\*$/.test(cleaned) || /^_[^_]+_$/.test(cleaned)) {
        blocks.push({
            id: generateBlockId(),
            type: 'inner_thought',
            content: cleaned.replace(/^\*|\*$|^_|_$/g, ''),
            intensity: 'whisper',
            emotion,
            tensionScore,
        });
        return blocks;
    }

    // Regular action/narrative line
    const wordCount = cleaned.split(/\s+/).length;
    let intensity: CinematicBlock['intensity'] = 'normal';
    let timing: CinematicBlock['timing'] = 'normal';

    if (cleaned.includes('!')) intensity = 'emphasis';
    if (/\.{3}|…|—\s*$/.test(cleaned)) intensity = 'whisper';
    if (/scream|roar|explod/i.test(cleaned)) intensity = 'shout';

    if (wordCount <= 4) timing = 'rapid';
    else if (wordCount <= 8) timing = 'quick';
    else if (wordCount > 30) timing = 'slow';

    blocks.push({
        id: generateBlockId(),
        type: 'action',
        content: cleaned,
        intensity,
        timing,
        emotion,
        tensionScore,
    });

    return blocks;
}

// ─── Main Parser ───────────────────────────────────────────

/**
 * Parse AI-generated cinematified text into structured CinematicBlock[].
 * Handles: [SCENE:] markers, SFX: annotations, BEAT/PAUSE markers, CUT TO/FADE IN transitions,
 * scene breaks (— ✦ —), [REFLECTION]/[TENSION] wrappers, dialogue, camera directions,
 * and regular action text.
 */
export function parseCinematifiedText(text: string): CinematicBlock[] {
    const blocks: CinematicBlock[] = [];

    // Track wrapper state for [TENSION] and [REFLECTION] blocks
    let inTensionBlock = false;
    let inReflectionBlock = false;

    // Clean inline tags from normalizing but preserve them for parsing
    const normalized = text
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

    const paragraphs = normalized.split(/\n\s*\n/).filter(p => p.trim());

    for (const para of paragraphs) {
        const lines = para
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);

        for (const line of lines) {
            // [SCENE: description] marker — scene title
            const sceneMatch = line.match(/^\[SCENE:\s*(.+?)\]\s*$/i);
            if (sceneMatch) {
                blocks.push({
                    id: generateBlockId(),
                    type: 'title_card',
                    content: sceneMatch[1].trim(),
                    intensity: 'normal',
                });
                continue;
            }

            // Scene break: — ✦ — or *** or ---
            if (/^(—\s*✦\s*—|\*{3,}|-{3,})\s*$/.test(line)) {
                blocks.push({
                    id: generateBlockId(),
                    type: 'beat',
                    content: '— ✦ —',
                    intensity: 'normal',
                    beat: { type: 'PAUSE' },
                });
                continue;
            }

            // [TENSION] wrapper open
            if (/^\[TENSION\]\s*$/i.test(line)) {
                inTensionBlock = true;
                continue;
            }

            // [/TENSION] wrapper close
            if (/^\[\/TENSION\]\s*$/i.test(line)) {
                inTensionBlock = false;
                continue;
            }

            // [REFLECTION] wrapper open
            if (/^\[REFLECTION\]\s*$/i.test(line)) {
                inReflectionBlock = true;
                continue;
            }

            // [/REFLECTION] wrapper close
            if (/^\[\/REFLECTION\]\s*$/i.test(line)) {
                inReflectionBlock = false;
                continue;
            }

            // BEAT / PAUSE / SILENCE (standalone marker)
            if (/^(BEAT|PAUSE|SILENCE|TENSION|RELEASE)\.?\s*$/i.test(line)) {
                const beatType = line.replace(/[.\s]+$/, '').toUpperCase();
                blocks.push({
                    id: generateBlockId(),
                    type: 'beat',
                    content: '',
                    intensity: 'normal',
                    beat: { type: validateBeatType(beatType) },
                });
                continue;
            }

            // Scene transitions: CUT TO:, FADE IN, FADE OUT, FADE TO BLACK, etc.
            const transMatch = line.match(
                /^(CUT TO|FADE IN|FADE OUT|FADE TO BLACK|DISSOLVE TO|SMASH CUT|MATCH CUT|JUMP CUT|WIPE TO|IRIS IN|IRIS OUT):?\s*(.*)/i,
            );
            if (transMatch) {
                const rawType = transMatch[1].toUpperCase();
                const desc = transMatch[2]?.trim() || undefined;
                blocks.push({
                    id: generateBlockId(),
                    type: 'transition',
                    content: desc || '',
                    intensity: 'normal',
                    transition: { type: validateTransitionType(rawType), description: desc },
                });
                continue;
            }

            // Standalone SFX line
            if (/^SFX:\s*/i.test(line)) {
                const sound = line.replace(/^SFX:\s*/i, '').trim();
                blocks.push({
                    id: generateBlockId(),
                    type: 'sfx',
                    content: 'SFX: ' + sound,
                    intensity: 'emphasis',
                    sfx: { sound, intensity: guessSFXIntensity(sound) },
                });
                continue;
            }

            // Inline SFX: text followed by SFX: annotation on same line
            const inlineSfx = line.match(/^(.+?)\s+SFX:\s*(.+)$/i);
            if (inlineSfx) {
                blocks.push(...parseTextLine(inlineSfx[1].trim()));
                const sound = inlineSfx[2].trim();
                blocks.push({
                    id: generateBlockId(),
                    type: 'sfx',
                    content: 'SFX: ' + sound,
                    intensity: 'emphasis',
                    sfx: { sound, intensity: guessSFXIntensity(sound) },
                });
                continue;
            }

            // Camera direction: (CLOSE ON: subject), (WIDE SHOT), (POV), (SLOW MOTION)
            const cameraMatch = line.match(/^\(([A-Z][A-Z\s]+?)(?::(.+))?\)\s*$/);
            if (cameraMatch) {
                const direction = cameraMatch[1].trim();
                const desc = cameraMatch[2]?.trim();
                blocks.push({
                    id: generateBlockId(),
                    type: 'action',
                    content: desc || '',
                    intensity: 'normal',
                    cameraDirection: direction,
                });
                continue;
            }

            // Content inside [REFLECTION] wrapper → inner_thought
            if (inReflectionBlock) {
                const { cleaned, emotion, tensionScore } = extractBlockMetadata(line);
                if (cleaned) {
                    blocks.push({
                        id: generateBlockId(),
                        type: 'inner_thought',
                        content: cleaned,
                        intensity: 'whisper',
                        emotion,
                        tensionScore,
                    });
                }
                continue;
            }

            // Content inside [TENSION] wrapper → action with heightened tension
            if (inTensionBlock) {
                const { cleaned, emotion } = extractBlockMetadata(line);
                if (cleaned) {
                    blocks.push({
                        id: generateBlockId(),
                        type: 'action',
                        content: cleaned,
                        intensity: 'emphasis',
                        timing: cleaned.split(/\s+/).length <= 4 ? 'rapid' : 'quick',
                        emotion: emotion || 'suspense',
                        tensionScore: 80,
                    });
                }
                continue;
            }

            // Regular text line (may contain dialogue)
            const parsedBlocks = parseTextLine(line);
            blocks.push(...parsedBlocks);
        }
    }

    return blocks;
}
