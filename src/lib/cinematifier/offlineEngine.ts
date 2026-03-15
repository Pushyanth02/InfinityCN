/**
 * offlineEngine.ts — Offline/Fallback Cinematification Engine
 *
 * Provides heuristic-based cinematification when AI processing is unavailable.
 * Uses pattern matching for dialogue detection, SFX triggers, scene transitions,
 * dramatic beats, chapter headers, inner thoughts, and character tracking.
 *
 * Features:
 * - Enhanced title/chapter detection (Act, Scene, Section, Roman numerals, ALL-CAPS)
 * - Cross-paragraph character name tracking for dialogue attribution
 * - Inner thought detection (*asterisk*, _underscore_, and introspective patterns)
 * - Expanded SFX vocabulary (metal, water, nature, human, mechanical, impact)
 * - Screenplay-style scene transitions (INT./EXT., FLASHBACK, DREAM SEQUENCE)
 * - Intensity mapping based on sentence structure (staccato, flowing, question-heavy)
 */

import type {
    CinematicBlock,
    CinematificationResult,
    EmotionCategory,
} from '../../types/cinematifier';
import { generateBlockId } from './parser';
import { detectSceneBreaks, deriveSceneTitle } from './sceneDetection';

// ─── Title / Chapter Detection ─────────────────────────────

/** Matches traditional chapter/part/book headers (e.g. "Chapter 1", "Prologue") */
const CHAPTER_HEADER_PATTERN = /^(chapter|part|book|prologue|epilogue)\s*[\d\w]+/i;

/** Matches Act/Scene/Section headers (e.g. "Act I", "Scene 3", "Section 12") */
const ACT_SCENE_SECTION_PATTERN = /^(act|scene|section)\s+(\d+|[IVXLCDM]+)\b/i;

/** Matches standalone Roman numeral lines used as numbered chapter titles */
const ROMAN_NUMERAL_PATTERN = /^(M{0,3})(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

/**
 * Detect whether a trimmed paragraph is an ALL-CAPS title.
 * Must be short (≤ 8 words), fully uppercase letters/spaces/punctuation,
 * contain at least one letter, and not look like a regular sentence.
 */
function isAllCapsTitle(line: string): boolean {
    if (line.length === 0) return false;
    const words = line.split(/\s+/);
    if (words.length > 8) return false;
    // Must contain only uppercase letters, spaces, digits, or common punctuation
    if (!/^[A-Z\s\d:.,!?'"\-—]+$/.test(line)) return false;
    // Must contain at least two letters to avoid matching single punctuation lines
    if ((line.match(/[A-Z]/g) || []).length < 2) return false;
    return true;
}

/**
 * Check if a standalone line is a Roman numeral title (e.g. "I", "IV", "XII").
 * Only matches valid Roman numerals that evaluate to at least 1.
 */
function isRomanNumeralTitle(line: string): boolean {
    const trimmed = line.trim();
    if (!ROMAN_NUMERAL_PATTERN.test(trimmed)) return false;
    // Ensure the match is non-empty (the pattern can match empty string)
    return trimmed.length > 0;
}

// ─── Scene Transition Detection ────────────────────────────

/** Scene transition patterns including screenplay-style headers */
const TRANSITION_PATTERNS = [
    /^(later|meanwhile|the next|hours later|days later|suddenly|elsewhere)/i,
    /^\*{3,}/,
    /^---+/,
    /^(INT\.|EXT\.)\s+/i,
    /^(FLASHBACK|DREAM SEQUENCE|MEMORY|END FLASHBACK|END DREAM)\b/i,
];

// ─── SFX Vocabulary ────────────────────────────────────────

/**
 * SFX trigger words — combined into a single regex for O(1) per paragraph.
 * Covers: explosions, weather, impacts, doors, whispers, screams, footsteps,
 * wind/rain, heartbeats, metal, water, nature, human, mechanical, and impact sounds.
 */
const SFX_COMBINED =
    /\b(explod|blast|detona|thunder|lightning|crash|shatter|smash|gunshot|shot|fires?\b|knock|door|creak|whisper|murmur|hush|scream|shout|yell|footstep|stride|stomp|rain|storm|wind|heart|pulse|beat|clang|clatter|ring|chime|splash|drip|gurgle|rush|rustle|howl|chirp|growl|sigh|gasp|sob|laugh|groan|cough|click|buzz|hum|grind|whir|engine|motor|thud|crack|snap|pop|rip|tear)\b/i;

/** Maps matched SFX stems to [display name, intensity] */
const SFX_LOOKUP: Record<string, [string, 'soft' | 'medium' | 'loud' | 'explosive']> = {
    // Explosions
    explod: ['EXPLOSION', 'explosive'],
    blast: ['EXPLOSION', 'explosive'],
    detona: ['EXPLOSION', 'explosive'],
    // Weather
    thunder: ['THUNDER', 'loud'],
    lightning: ['THUNDER', 'loud'],
    // Crashes
    crash: ['CRASH', 'loud'],
    shatter: ['CRASH', 'loud'],
    smash: ['CRASH', 'loud'],
    // Gunfire
    gunshot: ['GUNSHOT', 'loud'],
    shot: ['GUNSHOT', 'loud'],
    fire: ['GUNSHOT', 'loud'],
    // Doors
    knock: ['DOOR', 'medium'],
    door: ['DOOR', 'medium'],
    creak: ['DOOR', 'medium'],
    // Quiet sounds
    whisper: ['WHISPER', 'soft'],
    murmur: ['WHISPER', 'soft'],
    hush: ['WHISPER', 'soft'],
    // Screams
    scream: ['SCREAM', 'loud'],
    shout: ['SCREAM', 'loud'],
    yell: ['SCREAM', 'loud'],
    // Footsteps
    footstep: ['FOOTSTEPS', 'medium'],
    stride: ['FOOTSTEPS', 'medium'],
    stomp: ['FOOTSTEPS', 'medium'],
    // Wind / Rain
    rain: ['WIND HOWLING', 'medium'],
    storm: ['WIND HOWLING', 'medium'],
    wind: ['WIND HOWLING', 'medium'],
    // Heartbeat
    heart: ['HEARTBEAT', 'soft'],
    pulse: ['HEARTBEAT', 'soft'],
    beat: ['HEARTBEAT', 'soft'],
    // Metal sounds
    clang: ['CLANG', 'loud'],
    clatter: ['CLATTER', 'medium'],
    ring: ['RING', 'medium'],
    chime: ['CHIME', 'soft'],
    // Water sounds
    splash: ['SPLASH', 'medium'],
    drip: ['DRIP', 'soft'],
    gurgle: ['GURGLE', 'soft'],
    rush: ['RUSHING WATER', 'medium'],
    // Nature sounds
    rustle: ['RUSTLE', 'soft'],
    howl: ['HOWL', 'loud'],
    chirp: ['CHIRP', 'soft'],
    growl: ['GROWL', 'medium'],
    // Human sounds
    sigh: ['SIGH', 'soft'],
    gasp: ['GASP', 'medium'],
    sob: ['SOB', 'soft'],
    laugh: ['LAUGH', 'medium'],
    groan: ['GROAN', 'medium'],
    cough: ['COUGH', 'medium'],
    // Mechanical sounds
    click: ['CLICK', 'soft'],
    buzz: ['BUZZ', 'medium'],
    hum: ['HUM', 'soft'],
    grind: ['GRIND', 'medium'],
    whir: ['WHIR', 'soft'],
    engine: ['ENGINE', 'medium'],
    motor: ['MOTOR', 'medium'],
    // Impact sounds
    thud: ['THUD', 'medium'],
    crack: ['CRACK', 'loud'],
    snap: ['SNAP', 'medium'],
    pop: ['POP', 'medium'],
    rip: ['RIP', 'medium'],
    tear: ['TEAR', 'medium'],
};

// ─── Dialogue & Character Detection ────────────────────────

/** Matches double-quoted dialogue (non-global; use with matchAll via inline regex) */
const DIALOGUE_RE_SOURCE = '"([^"]+)"';

/** Speech verbs used for speaker attribution */
const SPEECH_VERBS =
    'said|whispered|shouted|muttered|replied|asked|exclaimed|called|cried|growled|hissed|barked|snapped|answered|declared|insisted|demanded|pleaded|stammered|murmured';

/** Matches "Name said" patterns before dialogue */
const SPEAKER_BEFORE_PATTERN = new RegExp(
    `([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\s+(?:${SPEECH_VERBS})`,
);

/** Matches "said Name" patterns after dialogue */
const SPEAKER_AFTER_PATTERN = new RegExp(
    `(?:${SPEECH_VERBS})\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)`,
);

/**
 * Action verbs that indicate a character name at the start of a paragraph.
 * Used for "Name verb..." character detection (e.g. "Sarah walked slowly").
 */
const CHARACTER_ACTION_VERBS =
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:walked|ran|stood|sat|looked|turned|moved|stepped|leaned|reached|grabbed|pulled|pushed|opened|closed|entered|left|paused|stopped|started|began|continued|watched|waited|listened|nodded|shook|smiled|frowned|sighed|gasped|laughed|cried|hesitated|stared|glanced|approached|retreated|followed|led|held|dropped|picked|threw|caught|fell|rose|climbed|jumped|knelt|crouched|whispered|shouted|screamed|muttered)\b/;

// ─── Inner Thought Detection ───────────────────────────────

/** Matches text fully wrapped in *asterisks* */
const ASTERISK_THOUGHT_PATTERN = /^\*([^*]+)\*$/;

/** Matches text fully wrapped in _underscores_ */
const UNDERSCORE_THOUGHT_PATTERN = /^_([^_]+)_$/;

/** Introspective sentence patterns that suggest inner thoughts */
const INTROSPECTIVE_PATTERN =
    /^(he|she|they|i)\s+(wondered|thought|realized|knew|felt|couldn't help thinking|couldn't stop thinking|asked (himself|herself|themselves)|considered|pondered|reflected|mused|recalled|remembered)\b/i;

/** Question-form inner thoughts (e.g. "Why had he...", "What if she...") */
const INTROSPECTIVE_QUESTION_PATTERN =
    /^(why|what if|how could|what had|where had|when had|could (he|she|they|it)|would (he|she|they|it)|was (he|she|they|it)|had (he|she|they|it))\b/i;

// ─── Intensity & Pacing Analysis ───────────────────────────

/** Emotion assigned to question-heavy paragraphs (≥ 2 question marks) */
const QUESTION_HEAVY_EMOTION: EmotionCategory = 'suspense';

/** Emotion assigned to introspective inner-thought blocks */
const INTROSPECTIVE_EMOTION: EmotionCategory = 'suspense';

/** Emotion assigned to asterisk/underscore-wrapped inner thoughts */
const WRAPPED_THOUGHT_EMOTION: EmotionCategory = 'neutral';

/**
 * Analyse a paragraph's sentence structure and punctuation to determine
 * intensity, timing, and emotion overrides beyond the basic `!` / `...` checks.
 */
function analyseParagraphPacing(para: string): {
    intensity: CinematicBlock['intensity'];
    timing?: CinematicBlock['timing'];
    emotion?: EmotionCategory;
} {
    // Count question marks
    const questionCount = (para.match(/\?/g) || []).length;
    if (questionCount >= 2) {
        return { intensity: 'normal', timing: 'normal', emotion: QUESTION_HEAVY_EMOTION };
    }

    // Check for short staccato sentences: split on sentence-ending punctuation
    const sentences = para.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    if (sentences.length >= 2) {
        const shortSentences = sentences.filter(s => s.split(/\s+/).length < 5);
        if (shortSentences.length >= 2 && shortSentences.length / sentences.length >= 0.5) {
            return { intensity: 'emphasis', timing: 'rapid' };
        }
    }

    // Check for long flowing sentences (> 30 words)
    const wordCount = para.split(/\s+/).length;
    if (sentences.length === 1 && wordCount > 30) {
        return { intensity: 'normal', timing: 'slow' };
    }
    // If any single sentence exceeds 30 words, use slow timing
    for (const sentence of sentences) {
        if (sentence.split(/\s+/).length > 30) {
            return { intensity: 'normal', timing: 'slow' };
        }
    }

    // Existing intensity checks
    if (para.includes('!')) {
        return { intensity: 'emphasis' };
    }
    if (para.includes('...') || para.includes('\u2026')) {
        return { intensity: 'whisper' };
    }

    return { intensity: 'normal' };
}

// ─── Character Name Matching ───────────────────────────────

/**
 * Convert an UPPERCASE name to Title Case (e.g. "SARAH JONES" → "Sarah Jones").
 * Handles multi-word names by capitalising each word.
 */
function toTitleCase(name: string): string {
    return name
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Check if a paragraph starts with a previously-identified character name.
 * Returns the uppercase name if found, otherwise undefined.
 */
function matchKnownCharacter(para: string, knownCharacters: Set<string>): string | undefined {
    for (const name of knownCharacters) {
        const titled = toTitleCase(name);
        if (para.startsWith(titled + ' ') || para.startsWith(titled + ',')) {
            return name;
        }
    }
    return undefined;
}

// ─── Fallback Block Creation ───────────────────────────────

/**
 * Transform raw text into an array of CinematicBlocks using heuristic analysis.
 * Handles scene breaks, transitions, chapter headers, dialogue, inner thoughts,
 * SFX triggers, dramatic beats, and character tracking across paragraphs.
 */
function createFallbackBlocks(text: string): CinematicBlock[] {
    const blocks: CinematicBlock[] = [];
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

    // Use heuristic scene detection to group paragraphs into scenes
    const scenes = detectSceneBreaks(paragraphs);

    // Track character names across the entire text for dialogue attribution
    const knownCharacters = new Set<string>();

    // Create a fresh global regex per call to avoid shared lastIndex state
    const dialoguePattern = new RegExp(DIALOGUE_RE_SOURCE, 'g');

    for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i].trim();
        if (!para) continue;

        // ── Scene title cards ──────────────────────────────
        if (scenes.length > 1) {
            for (let s = 0; s < scenes.length; s++) {
                if (scenes[s][0] === para && (s > 0 || i === 0)) {
                    if (s > 0) {
                        blocks.push({
                            id: generateBlockId(),
                            type: 'beat',
                            content: '— ✦ —',
                            intensity: 'normal',
                            beat: { type: 'PAUSE' },
                        });
                    }
                    const sceneTitle = deriveSceneTitle(scenes[s], s + 1);
                    blocks.push({
                        id: generateBlockId(),
                        type: 'title_card',
                        content: sceneTitle,
                        intensity: 'normal',
                    });
                    break;
                }
            }
        }

        // ── Scene transitions (including INT./EXT. and flashback markers) ──
        if (TRANSITION_PATTERNS.some(p => p.test(para))) {
            blocks.push({
                id: generateBlockId(),
                type: 'transition',
                content: para,
                intensity: 'normal',
                transition: { type: 'CUT TO' },
            });

            blocks.push({
                id: generateBlockId(),
                type: 'beat',
                content: '',
                intensity: 'normal',
                beat: { type: 'BEAT' },
            });
            continue;
        }

        // ── Chapter headers (Chapter, Part, Book, Prologue, Epilogue) ──
        if (CHAPTER_HEADER_PATTERN.test(para)) {
            blocks.push({
                id: generateBlockId(),
                type: 'title_card',
                content: para.toUpperCase(),
                intensity: 'emphasis',
            });

            blocks.push({
                id: generateBlockId(),
                type: 'transition',
                content: '',
                intensity: 'normal',
                transition: { type: 'FADE IN' },
            });
            continue;
        }

        // ── Act / Scene / Section headers ──
        if (ACT_SCENE_SECTION_PATTERN.test(para)) {
            blocks.push({
                id: generateBlockId(),
                type: 'title_card',
                content: para.toUpperCase(),
                intensity: 'emphasis',
            });

            blocks.push({
                id: generateBlockId(),
                type: 'transition',
                content: '',
                intensity: 'normal',
                transition: { type: 'FADE IN' },
            });
            continue;
        }

        // ── Standalone Roman numeral titles (e.g. "III") ──
        if (isRomanNumeralTitle(para)) {
            blocks.push({
                id: generateBlockId(),
                type: 'title_card',
                content: para,
                intensity: 'emphasis',
            });

            blocks.push({
                id: generateBlockId(),
                type: 'transition',
                content: '',
                intensity: 'normal',
                transition: { type: 'FADE IN' },
            });
            continue;
        }

        // ── ALL-CAPS title lines (e.g. "THE BEGINNING") ──
        if (isAllCapsTitle(para)) {
            blocks.push({
                id: generateBlockId(),
                type: 'title_card',
                content: para,
                intensity: 'emphasis',
            });

            blocks.push({
                id: generateBlockId(),
                type: 'transition',
                content: '',
                intensity: 'normal',
                transition: { type: 'FADE IN' },
            });
            continue;
        }

        // ── Inner thought: *asterisk-wrapped* or _underscore-wrapped_ text ──
        const asteriskMatch = para.match(ASTERISK_THOUGHT_PATTERN);
        const underscoreMatch = !asteriskMatch ? para.match(UNDERSCORE_THOUGHT_PATTERN) : null;
        if (asteriskMatch || underscoreMatch) {
            const content = asteriskMatch ? asteriskMatch[1] : underscoreMatch![1];
            blocks.push({
                id: generateBlockId(),
                type: 'inner_thought',
                content,
                intensity: 'whisper',
                emotion: WRAPPED_THOUGHT_EMOTION,
            });
            continue;
        }

        // ── Inner thought: introspective sentence patterns ──
        if (INTROSPECTIVE_PATTERN.test(para) || INTROSPECTIVE_QUESTION_PATTERN.test(para)) {
            // Only treat as inner thought if no dialogue is present
            if (!new RegExp(DIALOGUE_RE_SOURCE).test(para)) {
                blocks.push({
                    id: generateBlockId(),
                    type: 'inner_thought',
                    content: para,
                    intensity: 'whisper',
                    emotion: INTROSPECTIVE_EMOTION,
                });
                continue;
            }
        }

        // ── Dialogue detection ─────────────────────────────
        dialoguePattern.lastIndex = 0;
        const dialogueMatches = [...para.matchAll(dialoguePattern)];
        if (dialogueMatches.length > 0) {
            // Find speaker from speech-verb patterns
            let speaker: string | undefined;
            const beforeMatch = para.match(SPEAKER_BEFORE_PATTERN);
            const afterMatch = para.match(SPEAKER_AFTER_PATTERN);
            if (beforeMatch) {
                speaker = beforeMatch[1].toUpperCase();
                knownCharacters.add(speaker);
            } else if (afterMatch) {
                speaker = afterMatch[1].toUpperCase();
                knownCharacters.add(speaker);
            }

            // If no speech-verb match, check for "Name verb" at paragraph start
            if (!speaker) {
                const actionMatch = para.match(CHARACTER_ACTION_VERBS);
                if (actionMatch) {
                    speaker = actionMatch[1].toUpperCase();
                    knownCharacters.add(speaker);
                }
            }

            // If still no speaker, check if paragraph starts with a known character name
            if (!speaker) {
                speaker = matchKnownCharacter(para, knownCharacters);
            }

            for (const match of dialogueMatches) {
                const dialogue = match[1];

                let intensity: CinematicBlock['intensity'] = 'normal';
                if (dialogue.includes('!') || /shout|scream|yell/i.test(para)) {
                    intensity = 'shout';
                } else if (/whisper|murmur|softly/i.test(para)) {
                    intensity = 'whisper';
                }

                blocks.push({
                    id: generateBlockId(),
                    type: 'dialogue',
                    content: dialogue,
                    speaker,
                    intensity,
                });
            }

            // Add narration for non-dialogue parts
            dialoguePattern.lastIndex = 0;
            const narration = para.replace(dialoguePattern, '').trim();
            if (narration.length > 20) {
                blocks.push({
                    id: generateBlockId(),
                    type: 'action',
                    content: narration,
                    intensity: 'normal',
                });
            }
        } else {
            // ── Character name tracking from action paragraphs ──
            const actionMatch = para.match(CHARACTER_ACTION_VERBS);
            if (actionMatch) {
                knownCharacters.add(actionMatch[1].toUpperCase());
            }

            // ── Regular narration/action with enhanced pacing ──
            const pacing = analyseParagraphPacing(para);

            blocks.push({
                id: generateBlockId(),
                type: 'action',
                content: para,
                intensity: pacing.intensity,
                ...(pacing.timing && { timing: pacing.timing }),
                ...(pacing.emotion && { emotion: pacing.emotion }),
            });
        }

        // ── SFX triggers (single regex, O(1) per paragraph) ──
        const sfxMatch = para.match(SFX_COMBINED);
        if (sfxMatch) {
            const key = sfxMatch[1].toLowerCase().replace(/[sd]$/, '');
            const entry = SFX_LOOKUP[key] ?? SFX_LOOKUP[sfxMatch[1].toLowerCase()];
            if (entry) {
                const [sound, sfxIntensity] = entry;
                blocks.push({
                    id: generateBlockId(),
                    type: 'sfx',
                    content: 'SFX: ' + sound,
                    intensity: sfxIntensity === 'explosive' ? 'explosive' : 'emphasis',
                    sfx: { sound, intensity: sfxIntensity },
                });
            }
        }

        // ── Dramatic beats for emotional moments ──
        if (/\.\.\.|…|—$|sudden|shock|realiz|gasp/i.test(para)) {
            blocks.push({
                id: generateBlockId(),
                type: 'beat',
                content: '',
                intensity: 'normal',
                beat: { type: 'BEAT' },
            });
        }
    }

    return blocks;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Cinematify text using offline heuristics (no AI required).
 * Produces a full CinematificationResult with blocks, raw text, and metadata.
 *
 * @param text - Raw text to cinematify
 * @returns CinematificationResult with blocks and processing metadata
 */
export function cinematifyOffline(text: string): CinematificationResult {
    const startTime = performance.now();
    const blocks = createFallbackBlocks(text);

    let sfxCount = 0;
    let transitionCount = 0;
    let beatCount = 0;

    for (const block of blocks) {
        if (block.sfx) sfxCount++;
        if (block.transition) transitionCount++;
        if (block.beat) beatCount++;
    }

    return {
        blocks,
        rawText: blocks.map(b => b.content).join('\n\n'),
        metadata: {
            originalWordCount: text.split(/\s+/).length,
            cinematifiedWordCount: blocks.reduce(
                (acc, b) => acc + (b.content?.split(/\s+/).length || 0),
                0,
            ),
            sfxCount,
            transitionCount,
            beatCount,
            processingTimeMs: Math.round(performance.now() - startTime),
        },
    };
}
