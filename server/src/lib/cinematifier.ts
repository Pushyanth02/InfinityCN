/**
 * cinematifier.ts — Server-side cinematification engine (pure functions)
 *
 * Ported from src/lib/cinematifier.ts for Node.js worker usage.
 * Includes: chunkText, parseCinematifiedText, cinematifyOffline,
 * createFallbackBlocks, extractOverallMetadata, and validation helpers.
 */

import type { CinematicBlock, ChapterResult } from '../types.js';

// ─── Session epoch for stable IDs ──────────────────────────
const SESSION_EPOCH = Date.now();
let blockCounter = 0;

function generateBlockId(): string {
    // Reset at 1M to prevent unbounded growth in long-running workers
    if (blockCounter > 1_000_000) blockCounter = 0;
    return `cine-${SESSION_EPOCH}-${blockCounter++}`;
}

// ─── Chunk text for LLM processing ─────────────────────────
const MAX_CHUNK_CHARS = 3500;

export function chunkText(text: string): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split(/\n\s*\n/);
    let current = '';

    for (const para of paragraphs) {
        if ((current + '\n\n' + para).length > MAX_CHUNK_CHARS && current) {
            chunks.push(current.trim());
            current = para;
        } else {
            current = current ? current + '\n\n' + para : para;
        }
    }
    if (current.trim()) {
        chunks.push(current.trim());
    }

    return chunks;
}

// ─── Cinematification System Prompt ────────────────────────

export const CINEMATIFICATION_SYSTEM_PROMPT = `You are a master cinematic storyteller. Transform this book chapter into a dramatically enhanced version.

RULES:
1. Keep ALL original content, characters, plot, dialogue (never remove)
2. Add cinematic pacing:
   - Short, punchy sentences for action scenes
   - Longer, flowing prose for emotional moments
3. Add SFX annotations: SFX: [sound description]
   Examples: SFX: CRASH!, SFX: distant thunder, SFX: silence...
4. Add dramatic beats: BEAT, PAUSE
5. Add scene transitions: CUT TO: [location], FADE IN, FADE TO BLACK
6. Append inline narrative tags to lines:
   - [EMOTION: joy|fear|sadness|suspense|anger|surprise|neutral]
   - [TENSION: 0-100] (0 = calm, 100 = extreme stress/climax)
   Example: "I can't believe it." [EMOTION: surprise] [TENSION: 40]
7. At the end of the text, optionally append overall tags:
   - [GENRE: fantasy|romance|thriller|sci_fi|mystery|historical|literary_fiction|horror|adventure|other] (Only if it's the first chapter)
   - [TONE: dark, romantic, suspenseful, humorous, etc] (Comma separated)
   - [SUMMARY: Brief 1-2 sentence summary of current characters, location, and action to maintain context]
`;

// ─── Parse Cinematified Text into Blocks ──────────────────

export function parseCinematifiedText(text: string): CinematicBlock[] {
    const blocks: CinematicBlock[] = [];

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

            // Scene transitions
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

            // Inline SFX
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

            // Camera direction
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

            // Regular text line
            const parsedBlocks = parseTextLine(line);
            blocks.push(...parsedBlocks);
        }
    }

    return blocks;
}

// ─── Helpers ────────────────────────────────────────────────

function extractBlockMetadata(line: string) {
    let cleaned = line;
    let emotion: string | undefined;
    let tensionScore: number | undefined;

    const emotionMatch = cleaned.match(/\[EMOTION:\s*([a-z]+)\]/i);
    if (emotionMatch) {
        const e = emotionMatch[1].toLowerCase();
        if (['joy', 'fear', 'sadness', 'suspense', 'anger', 'surprise', 'neutral'].includes(e)) {
            emotion = e;
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

function parseTextLine(line: string): CinematicBlock[] {
    const blocks: CinematicBlock[] = [];
    const { cleaned, emotion, tensionScore } = extractBlockMetadata(line);

    if (!cleaned) return blocks;

    // Dialogue
    const dialogueMatch = cleaned.match(/^"([^"]+)"(.*)$/);
    if (dialogueMatch) {
        const dialogue = dialogueMatch[1];
        const remainder = dialogueMatch[2]?.trim();

        let speaker: string | undefined;
        const speakerAfter = remainder?.match(
            /\b(?:said|whispered|shouted|muttered|replied|asked|exclaimed|called|cried|growled|hissed|barked|snapped)\s+([A-Z][a-z]+)/,
        );
        const speakerBefore = remainder?.match(
            /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|whispered|shouted|muttered)/,
        );
        if (speakerAfter) speaker = speakerAfter[1].toUpperCase();
        else if (speakerBefore) speaker = speakerBefore[1].toUpperCase();

        let intensity: string = 'normal';
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

    // Inner thought
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

    // Regular action/narrative
    const wordCount = cleaned.split(/\s+/).length;
    let intensity: string = 'normal';
    let timing: string = 'normal';

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

function guessSFXIntensity(sound: string): string {
    const upper = sound.toUpperCase();
    if (/CRASH|BANG|BOOM|BLAST|EXPLOSI|SHATTER|THUNDER|GUNSHOT|ROAR/.test(upper)) return 'loud';
    if (/SILENCE|WHISPER|SOFT|GENTLE|HUM|DRIP|TICK|CREAK/.test(upper)) return 'soft';
    if (/SLAM|STOMP|CANNON|DETONA/.test(upper)) return 'explosive';
    return 'medium';
}

// ─── Validation Helpers ────────────────────────────────────

type BeatType = 'BEAT' | 'PAUSE' | 'LONG PAUSE' | 'SILENCE' | 'TENSION' | 'RELEASE';
type TransitionType =
    | 'FADE IN'
    | 'FADE OUT'
    | 'CUT TO'
    | 'DISSOLVE TO'
    | 'SMASH CUT'
    | 'MATCH CUT'
    | 'JUMP CUT'
    | 'WIPE TO'
    | 'IRIS IN'
    | 'IRIS OUT';

function validateBeatType(type: string): string {
    const valid: BeatType[] = ['BEAT', 'PAUSE', 'LONG PAUSE', 'SILENCE', 'TENSION', 'RELEASE'];
    return valid.includes(type as BeatType) ? type : 'BEAT';
}

function validateTransitionType(type: string): string {
    const valid: TransitionType[] = [
        'FADE IN',
        'FADE OUT',
        'CUT TO',
        'DISSOLVE TO',
        'SMASH CUT',
        'MATCH CUT',
        'JUMP CUT',
        'WIPE TO',
        'IRIS IN',
        'IRIS OUT',
    ];
    return valid.includes(type as TransitionType) ? type : 'CUT TO';
}

// ─── Offline/Fallback Cinematification ─────────────────────

export function cinematifyOffline(text: string): ChapterResult {
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

export function createFallbackBlocks(text: string): CinematicBlock[] {
    const blocks: CinematicBlock[] = [];
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

    const transitionPatterns = [
        /^(later|meanwhile|the next|hours later|days later|suddenly|elsewhere)/i,
        /^\*{3,}/,
        /^---+/,
    ];

    const sfxPatterns: [RegExp, string, string][] = [
        [/\b(explod|blast|detona)/i, 'EXPLOSION', 'explosive'],
        [/\b(thunder|lightning)/i, 'THUNDER', 'loud'],
        [/\b(crash|shatter|smash)/i, 'CRASH', 'loud'],
        [/\b(gunshot|shot|fire[ds]?)\b/i, 'GUNSHOT', 'loud'],
        [/\b(knock|door|creak)/i, 'DOOR', 'medium'],
        [/\b(whisper|murmur|hush)/i, 'WHISPER', 'soft'],
        [/\b(scream|shout|yell)/i, 'SCREAM', 'loud'],
        [/\b(footstep|stride|stomp)/i, 'FOOTSTEPS', 'medium'],
        [/\b(rain|storm|wind)/i, 'WIND HOWLING', 'medium'],
        [/\b(heart|pulse|beat)/i, 'HEARTBEAT', 'soft'],
    ];

    const dialoguePattern = /"([^"]+)"/g;
    const speakerBeforePattern =
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|whispered|shouted|muttered|replied|asked|exclaimed)/;
    const speakerAfterPattern =
        /(?:said|whispered|shouted|muttered|replied|asked|exclaimed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;

    for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i].trim();
        if (!para) continue;

        // Scene transition
        if (transitionPatterns.some(p => p.test(para))) {
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

        // Chapter headers
        if (/^(chapter|part|book|prologue|epilogue)\s*[\d\w]+/i.test(para)) {
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

        // Dialogue
        const dialogueMatches = [...para.matchAll(dialoguePattern)];
        if (dialogueMatches.length > 0) {
            let speaker: string | undefined;
            const beforeMatch = para.match(speakerBeforePattern);
            const afterMatch = para.match(speakerAfterPattern);
            if (beforeMatch) speaker = beforeMatch[1].toUpperCase();
            else if (afterMatch) speaker = afterMatch[1].toUpperCase();

            for (const match of dialogueMatches) {
                const dialogue = match[1];

                let intensity: string = 'normal';
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
            let intensity: string = 'normal';
            if (para.includes('!')) intensity = 'emphasis';
            if (para.includes('...') || para.includes('\u2026')) intensity = 'whisper';

            blocks.push({
                id: generateBlockId(),
                type: 'action',
                content: para,
                intensity,
            });
        }

        // SFX triggers
        for (const [pattern, sound, sfxIntensity] of sfxPatterns) {
            if (pattern.test(para)) {
                blocks.push({
                    id: generateBlockId(),
                    type: 'sfx',
                    content: 'SFX: ' + sound,
                    intensity: sfxIntensity === 'explosive' ? 'explosive' : 'emphasis',
                    sfx: { sound, intensity: sfxIntensity },
                });
                break;
            }
        }

        // Dramatic beats
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

// ─── Metadata Extraction ────────────────────────────────────

export interface NarrativeMetadata {
    genre?: string;
    toneTags?: string[];
    characters: Record<string, { appearances: number[]; dialogueCount: number }>;
}

export function extractOverallMetadata(
    rawText: string | undefined,
    blocks: CinematicBlock[],
): NarrativeMetadata {
    const metadata: NarrativeMetadata = { characters: {} };

    if (rawText) {
        const genreMatch = rawText.match(/\[GENRE:\s*([^\]]+)\]/i);
        if (genreMatch) {
            const rawGenre = genreMatch[1].trim().toLowerCase().replace(/\s+/g, '_');
            const validGenres = [
                'fantasy',
                'romance',
                'thriller',
                'sci_fi',
                'mystery',
                'historical',
                'literary_fiction',
                'horror',
                'adventure',
            ];
            if (validGenres.includes(rawGenre)) {
                metadata.genre = rawGenre;
            }
        }

        const toneMatch = rawText.match(/\[TONE:\s*([^\]]+)\]/i);
        if (toneMatch) {
            metadata.toneTags = toneMatch[1]
                .split(',')
                .map(t => t.trim().toLowerCase())
                .filter(Boolean);
        }
    }

    blocks.forEach((block, index) => {
        if (block.type === 'dialogue' && block.speaker) {
            const name = block.speaker.toUpperCase();
            if (!metadata.characters[name]) {
                metadata.characters[name] = { appearances: [], dialogueCount: 0 };
            }
            metadata.characters[name].appearances.push(index);
            metadata.characters[name].dialogueCount++;
        }
    });

    return metadata;
}
