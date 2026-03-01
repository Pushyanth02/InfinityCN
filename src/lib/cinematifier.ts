/**
 * cinematifier.ts — Cinematification Engine
 *
 * Transforms novel text into cinematic screenplay-style content with:
 * - SFX annotations (SFX: BOOM!)
 * - Dramatic beats (BEAT, PAUSE)
 * - Scene transitions (CUT TO, FADE IN)
 * - Camera directions (CLOSE ON, WIDE SHOT)
 * - Enhanced dramatic pacing
 */

import { callAIWithDedup } from './ai';
import type { AIConfig } from './ai';
import type {
    CinematicBlock,
    CinematificationResult,
    Chapter,
    ChapterSegment,
} from '../types/cinematifier';
import { generateEmbedding, retrieveRelevantContext } from './embeddings';
import type { ChunkEmbedding } from './embeddings';

// ─── Session epoch for stable IDs ──────────────────────────
const SESSION_EPOCH = Date.now();
let blockCounter = 0;

function generateBlockId(): string {
    return `cine-${SESSION_EPOCH}-${blockCounter++}`;
}

// ─── Chunk text for LLM processing ─────────────────────────
const MAX_CHUNK_CHARS = 3500; // Stay under token limits

function chunkText(text: string): string[] {
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

const CINEMATIFICATION_SYSTEM_PROMPT = `You are a master cinematic storyteller. Transform this book chapter into a dramatically enhanced version.

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

// ─── Main Cinematification Function ────────────────────────

export async function cinematifyText(
    text: string,
    config: AIConfig,
    onProgress?: (percent: number, message: string) => void,
    onChunk?: (blocks: CinematicBlock[], isDone: boolean) => void,
): Promise<CinematificationResult> {
    const startTime = performance.now();
    const chunks = chunkText(text);
    const allBlocks: CinematicBlock[] = [];
    const allRawText: string[] = [];
    let sfxCount = 0;
    let transitionCount = 0;
    let beatCount = 0;
    let previousSummary = '';
    const chunkEmbeddings: ChunkEmbedding[] = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunkProgress = (i + 1) / chunks.length;
        if (onProgress) {
            onProgress(chunkProgress, `Cinematifying section ${i + 1} of ${chunks.length}...`);
        }

        let prompt = CINEMATIFICATION_SYSTEM_PROMPT;
        if (previousSummary) {
            prompt += `\n\nPREVIOUS CHUNK CONTEXT:\n"""\n${previousSummary}\n"""\n`;
        }

        if (chunkEmbeddings.length > 0) {
            // Find most similar past chunk summary to provide long-term continuity
            const currentEmbedding = await generateEmbedding(chunks[i]).catch(() => null);
            if (currentEmbedding) {
                const relevantPastSummaries = retrieveRelevantContext(
                    currentEmbedding,
                    chunkEmbeddings,
                );
                if (relevantPastSummaries.length > 0) {
                    prompt += `\n\nRELEVANT PAST CONTEXT (from earlier in the book):\n"""\n${relevantPastSummaries.join('\n\n')}\n"""\n`;
                }
            }
        }

        prompt += `\n\nORIGINAL CHAPTER TEXT:\n"""\n${chunks[i]}\n"""\n\nOUTPUT: Full cinematified version`;

        // Use rawTextMode so the AI engine skips JSON formatting and uses higher token limits
        const cinematifyConfig: AIConfig = { ...config, rawTextMode: true };

        let rawBuffer = '';
        let lastProcessedIndex = 0;

        try {
            // Check if provider supports streaming (offline algorithms, deepseek in some configs, might not)
            const { MODEL_PRESETS, streamAI } = await import('./ai');
            const preset = config.provider !== 'none' ? MODEL_PRESETS[config.provider] : null;
            const canStream = preset?.supportsStreaming;

            if (canStream) {
                for await (const delta of streamAI(prompt, cinematifyConfig)) {
                    rawBuffer += delta;

                    // Look for completed paragraphs to parse and flush block-by-block
                    const doubleNewlineIdx = rawBuffer.lastIndexOf('\n\n');

                    if (doubleNewlineIdx > lastProcessedIndex) {
                        const completableText = rawBuffer
                            .substring(lastProcessedIndex, doubleNewlineIdx)
                            .trim();
                        if (completableText) {
                            const parsedBlocks = parseCinematifiedText(completableText);
                            if (parsedBlocks.length > 0) {
                                allBlocks.push(...parsedBlocks);
                                if (onChunk) onChunk(parsedBlocks, false);

                                for (const block of parsedBlocks) {
                                    if (block.sfx) sfxCount++;
                                    if (block.transition) transitionCount++;
                                    if (block.beat) beatCount++;
                                }
                            }
                        }
                        // Advance cursor past the newlines
                        lastProcessedIndex = doubleNewlineIdx + 2;
                    }
                }

                // Flush remaining text
                const remainingText = rawBuffer.substring(lastProcessedIndex).trim();
                if (remainingText) {
                    const parsedBlocks = parseCinematifiedText(remainingText);
                    if (parsedBlocks.length > 0) {
                        allBlocks.push(...parsedBlocks);
                        if (onChunk) onChunk(parsedBlocks, false);

                        for (const block of parsedBlocks) {
                            if (block.sfx) sfxCount++;
                            if (block.transition) transitionCount++;
                            if (block.beat) beatCount++;
                        }
                    }
                }
                allRawText.push(rawBuffer);
            } else {
                // Fallback to bulk for non-streaming providers
                const raw = await callAIWithDedup(prompt, cinematifyConfig);
                rawBuffer = raw;
                allRawText.push(raw);
                const blocks = parseCinematifiedText(raw);
                if (blocks.length > 0) {
                    allBlocks.push(...blocks);
                    if (onChunk) onChunk(blocks, false);

                    for (const block of blocks) {
                        if (block.sfx) sfxCount++;
                        if (block.transition) transitionCount++;
                        if (block.beat) beatCount++;
                    }
                }
            }

            // Extract the summary for the NEXT chunk and save embedding
            const summaryMatch = rawBuffer.match(/\[SUMMARY:\s*([^\]]+)\]/i);
            if (summaryMatch) {
                previousSummary = summaryMatch[1].trim();
                const summaryEmbedding = await generateEmbedding(previousSummary).catch(() => null);
                if (summaryEmbedding) {
                    chunkEmbeddings.push({
                        id: `chunk-${i}`,
                        text: previousSummary,
                        embedding: summaryEmbedding,
                    });
                }
            }
        } catch (err) {
            console.warn(`[Cinematifier] Chunk ${i + 1} fallback:`, err);
            const fallbackBlocks = createFallbackBlocks(chunks[i]);
            allBlocks.push(...fallbackBlocks);
            if (onChunk) onChunk(fallbackBlocks, false);
        }
    }

    if (onChunk) onChunk([], true); // Signal completion

    const processingTimeMs = Math.round(performance.now() - startTime);

    return {
        blocks: allBlocks,
        rawText: allRawText.join('\n\n'),
        metadata: {
            originalWordCount: text.split(/\s+/).length,
            cinematifiedWordCount: allBlocks.reduce(
                (acc, b) => acc + (b.content?.split(/\s+/).length || 0),
                0,
            ),
            sfxCount,
            transitionCount,
            beatCount,
            processingTimeMs,
        },
    };
}

// ─── Parse Cinematified Text into Blocks ──────────────────

/**
 * Parse AI-generated cinematified text into structured CinematicBlock[].
 * Handles: SFX: annotations, BEAT/PAUSE markers, CUT TO/FADE IN transitions,
 * dialogue in quotes, camera directions in parens, and regular action text.
 */
export function parseCinematifiedText(text: string): CinematicBlock[] {
    const blocks: CinematicBlock[] = [];

    // Extract metadata tags at the end of the response: [GENRE: fantasy] [TONE: dark, suspenseful]
    // (We'll handle these later in the orchestration layer by exporting a util to scrape them from text)

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

            // Regular text line (may contain dialogue)
            const parsedBlocks = parseTextLine(line);
            blocks.push(...parsedBlocks);
        }
    }

    return blocks;
}

/** Helper to extract common tags from a line and return the cleaned line + metadata */
function extractBlockMetadata(line: string) {
    let cleaned = line;
    let emotion: import('../types/cinematifier').EmotionCategory | undefined;
    let tensionScore: number | undefined;

    const emotionMatch = cleaned.match(/\[EMOTION:\s*([a-z]+)\]/i);
    if (emotionMatch) {
        const e = emotionMatch[1].toLowerCase();
        if (['joy', 'fear', 'sadness', 'suspense', 'anger', 'surprise', 'neutral'].includes(e)) {
            emotion = e as import('../types/cinematifier').EmotionCategory;
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

/** Guess SFX intensity from the sound description */
function guessSFXIntensity(sound: string): import('../types/cinematifier').SFXIntensity {
    const upper = sound.toUpperCase();
    if (/CRASH|BANG|BOOM|BLAST|EXPLOSI|SHATTER|THUNDER|GUNSHOT|ROAR/.test(upper)) return 'loud';
    if (/SILENCE|WHISPER|SOFT|GENTLE|HUM|DRIP|TICK|CREAK/.test(upper)) return 'soft';
    if (/SLAM|STOMP|CANNON|DETONA/.test(upper)) return 'explosive';
    return 'medium';
}

// ─── Offline/Fallback Cinematification ─────────────────────

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

function createFallbackBlocks(text: string): CinematicBlock[] {
    const blocks: CinematicBlock[] = [];
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

    // Scene transition patterns
    const transitionPatterns = [
        /^(later|meanwhile|the next|hours later|days later|suddenly|elsewhere)/i,
        /^\*{3,}/,
        /^---+/,
    ];

    // SFX trigger words — combined into a single regex for O(1) per paragraph
    const sfxCombined =
        /\b(explod|blast|detona|thunder|lightning|crash|shatter|smash|gunshot|shot|fires?\b|knock|door|creak|whisper|murmur|hush|scream|shout|yell|footstep|stride|stomp|rain|storm|wind|heart|pulse|beat)\b/i;
    const sfxLookup: Record<string, [string, 'soft' | 'medium' | 'loud' | 'explosive']> = {
        explod: ['EXPLOSION', 'explosive'],
        blast: ['EXPLOSION', 'explosive'],
        detona: ['EXPLOSION', 'explosive'],
        thunder: ['THUNDER', 'loud'],
        lightning: ['THUNDER', 'loud'],
        crash: ['CRASH', 'loud'],
        shatter: ['CRASH', 'loud'],
        smash: ['CRASH', 'loud'],
        gunshot: ['GUNSHOT', 'loud'],
        shot: ['GUNSHOT', 'loud'],
        fire: ['GUNSHOT', 'loud'],
        fires: ['GUNSHOT', 'loud'],
        fired: ['GUNSHOT', 'loud'],
        knock: ['DOOR', 'medium'],
        door: ['DOOR', 'medium'],
        creak: ['DOOR', 'medium'],
        whisper: ['WHISPER', 'soft'],
        murmur: ['WHISPER', 'soft'],
        hush: ['WHISPER', 'soft'],
        scream: ['SCREAM', 'loud'],
        shout: ['SCREAM', 'loud'],
        yell: ['SCREAM', 'loud'],
        footstep: ['FOOTSTEPS', 'medium'],
        stride: ['FOOTSTEPS', 'medium'],
        stomp: ['FOOTSTEPS', 'medium'],
        rain: ['WIND HOWLING', 'medium'],
        storm: ['WIND HOWLING', 'medium'],
        wind: ['WIND HOWLING', 'medium'],
        heart: ['HEARTBEAT', 'soft'],
        pulse: ['HEARTBEAT', 'soft'],
        beat: ['HEARTBEAT', 'soft'],
    };

    // Dialogue pattern
    const dialoguePattern = /"([^"]+)"/g;
    const speakerBeforePattern =
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|whispered|shouted|muttered|replied|asked|exclaimed)/;
    const speakerAfterPattern =
        /(?:said|whispered|shouted|muttered|replied|asked|exclaimed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;

    for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i].trim();
        if (!para) continue;

        // Check for scene transition
        if (transitionPatterns.some(p => p.test(para))) {
            blocks.push({
                id: generateBlockId(),
                type: 'transition',
                content: para,
                intensity: 'normal',
                transition: { type: 'CUT TO' },
            });

            // Add a beat after transitions
            blocks.push({
                id: generateBlockId(),
                type: 'beat',
                content: '',
                intensity: 'normal',
                beat: { type: 'BEAT' },
            });
            continue;
        }

        // Check for chapter headers
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

        // Check for dialogue
        const dialogueMatches = [...para.matchAll(dialoguePattern)];
        if (dialogueMatches.length > 0) {
            // Find speaker
            let speaker: string | undefined;
            const beforeMatch = para.match(speakerBeforePattern);
            const afterMatch = para.match(speakerAfterPattern);
            if (beforeMatch) speaker = beforeMatch[1].toUpperCase();
            else if (afterMatch) speaker = afterMatch[1].toUpperCase();

            for (const match of dialogueMatches) {
                const dialogue = match[1];

                // Determine intensity from punctuation and context
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
            // Regular narration/action
            let intensity: CinematicBlock['intensity'] = 'normal';
            if (para.includes('!')) intensity = 'emphasis';
            if (para.includes('...') || para.includes('\u2026')) intensity = 'whisper';

            blocks.push({
                id: generateBlockId(),
                type: 'action',
                content: para,
                intensity,
            });
        }

        // Check for SFX triggers in the paragraph (single regex, O(1))
        const sfxMatch = para.match(sfxCombined);
        if (sfxMatch) {
            const key = sfxMatch[1].toLowerCase().replace(/[sd]$/, '');
            const entry = sfxLookup[key] ?? sfxLookup[sfxMatch[1].toLowerCase()];
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

        // Add dramatic beats for emotional moments
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

// ─── Text Cleaning (PDF artifacts) ────────────────────────

/**
 * Clean extracted PDF text by removing common artifacts:
 * page numbers, headers/footers, excessive whitespace, and hyphenation.
 */
export function cleanExtractedText(text: string): string {
    return (
        text
            // Remove standalone page numbers (lines that are just a number)
            .replace(/^\s*\d{1,4}\s*$/gm, '')
            // Remove common header/footer patterns: "Page X of Y", "- X -"
            .replace(/^\s*page\s+\d+\s*(of\s+\d+)?\s*$/gim, '')
            .replace(/^\s*-\s*\d+\s*-\s*$/gm, '')
            // Fix hyphenated line breaks (word- \n continuation)
            .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
            // Collapse 3+ consecutive blank lines into 2
            .replace(/\n{4,}/g, '\n\n\n')
            // Trim leading/trailing whitespace per line
            .replace(/^[ \t]+|[ \t]+$/gm, '')
            .trim()
    );
}

// ─── Intelligent Paragraph Reconstruction ───────────────────

// Common abbreviations that end with a period but are NOT sentence boundaries.
const ABBREVIATIONS = new Set([
    'mr',
    'mrs',
    'ms',
    'dr',
    'prof',
    'sr',
    'jr',
    'st',
    'ave',
    'blvd',
    'gen',
    'gov',
    'sgt',
    'cpl',
    'pvt',
    'lt',
    'col',
    'capt',
    'maj',
    'dept',
    'univ',
    'assn',
    'bros',
    'inc',
    'ltd',
    'co',
    'corp',
    'vs',
    'etc',
    'approx',
    'appt',
    'est',
    'min',
    'max',
    'al', // et al.
    'fig',
    'eq',
    'vol',
    'rev',
    'no',
    'op',
]);

/**
 * Split text into sentences using heuristics that handle abbreviations,
 * decimals, ellipses, and quoted speech.
 */
const CLOSING_QUOTE_RE = /["'"')\]]/;
const AFTER_SPACE_RE = /^\s*(\S)/;

function splitSentences(text: string): string[] {
    const sentences: string[] = [];
    let start = 0; // Track start index instead of building current string

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        // Only consider sentence-ending punctuation
        if (ch !== '.' && ch !== '!' && ch !== '?') continue;

        // Absorb trailing quotes/brackets that close the sentence
        let j = i + 1;
        while (j < text.length && CLOSING_QUOTE_RE.test(text[j])) {
            j++;
        }

        // Must be followed by whitespace or end of text to be a boundary
        if (j < text.length && !/\s/.test(text[j])) {
            i = j - 1; // skip absorbed chars
            continue;
        }

        // Not a boundary: ellipsis ("..." or "…")
        if (ch === '.' && i >= 2 && text[i - 1] === '.' && text[i - 2] === '.') {
            i = j - 1;
            continue;
        }
        // Not a boundary: preceded by unicode ellipsis character
        if (i > 0 && text[i - 1] === '\u2026') {
            i = j - 1;
            continue;
        }

        // Not a boundary: decimal number  e.g. "3.99"
        if (ch === '.' && i > 0 && /\d/.test(text[i - 1]) && j < text.length) {
            const afterSpace = text.substring(j).match(AFTER_SPACE_RE);
            if (afterSpace && /[a-z\d]/.test(afterSpace[1])) {
                i = j - 1;
                continue;
            }
        }

        // Not a boundary: known abbreviation  e.g. "Dr."
        if (ch === '.') {
            const before = text.substring(start, i);
            const wordMatch = before.match(/([A-Za-z]+)$/);
            if (wordMatch) {
                const word = wordMatch[1].toLowerCase();
                if (ABBREVIATIONS.has(word)) {
                    i = j - 1;
                    continue;
                }
                // Single uppercase letter (initials like "J." or "U.S.")
                if (wordMatch[1].length === 1 && /[A-Z]/.test(wordMatch[1])) {
                    i = j - 1;
                    continue;
                }
            }
        }

        // It's a sentence boundary — extract via substring (no incremental concat)
        const sentence = text.substring(start, j).trim();
        if (sentence) sentences.push(sentence);
        start = j;
        i = j - 1; // advance past absorbed chars
    }

    // Don't lose trailing fragment
    const remaining = text.substring(start).trim();
    if (remaining) {
        sentences.push(remaining);
    }

    return sentences;
}

/**
 * Detects if text lacks paragraph breaks and uses sentence-boundary heuristics
 * to insert \n\n breaks. This is critical for LLM chunking.
 */
export function reconstructParagraphs(text: string): string {
    const existingParas = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const avgLen = existingParas.length > 0 ? text.length / existingParas.length : text.length;

    // If average paragraph is < 1000 chars and there are multiple, paragraphs exist
    if (avgLen < 1000 && existingParas.length > 2) {
        return text;
    }

    // Collapse single newlines that aren't already part of a double newline
    const continuousText = text.replace(/([^\n])\n([^\n])/g, '$1 $2');

    const sentences = splitSentences(continuousText);
    if (sentences.length <= 1) return text;

    let result = '';
    let sentencesInPara = 0;

    for (let i = 0; i < sentences.length; i++) {
        const s = sentences[i];
        if (!s) continue;

        const isDialogueStart = /^["'"']/.test(s);
        const nextS = i + 1 < sentences.length ? sentences[i + 1] : '';
        const nextIsDialogueStart = /^["'"']/.test(nextS);

        if (sentencesInPara === 0) {
            result += s;
            sentencesInPara++;
        } else {
            if (isDialogueStart || sentencesInPara >= 4) {
                result += '\n\n' + s;
                sentencesInPara = 1;
            } else {
                result += ' ' + s;
                sentencesInPara++;
            }
        }

        if (nextIsDialogueStart && sentencesInPara > 0) {
            sentencesInPara = 4; // Force break next iteration
        }
    }

    return result || text;
}

// ─── Chapter Segmentation ──────────────────────────────────

const CHAPTER_PATTERNS = [
    /^(chapter\s+)(\d+|[ivxlcdm]+|\w+)(?:\s*[:.\-–—]\s*(.*))?$/im,
    /^(part\s+)(\d+|[ivxlcdm]+|\w+)(?:\s*[:.\-–—]\s*(.*))?$/im,
    /^(book\s+)(\d+|[ivxlcdm]+|\w+)(?:\s*[:.\-–—]\s*(.*))?$/im,
    /^(prologue|epilogue)(?:\s*[:.\-–—]\s*(.*))?$/im,
    /^\*{3,}\s*$/m, // *** dividers
    /^-{3,}\s*$/m, // --- dividers
];

export function segmentChapters(fullText: string): ChapterSegment[] {
    const lines = fullText.split('\n');
    const segments: ChapterSegment[] = [];
    let currentSegment: { title: string; startLine: number; lines: string[] } | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Check if this line is a chapter marker
        let isChapterStart = false;
        let chapterTitle = '';

        for (const pattern of CHAPTER_PATTERNS) {
            const match = line.match(pattern);
            if (match) {
                isChapterStart = true;
                // Build chapter title from match groups
                if (match[3]) {
                    chapterTitle = match[1] + match[2] + ': ' + match[3];
                } else if (match[2]) {
                    chapterTitle = match[1] + match[2];
                } else if (match[1]) {
                    chapterTitle = match[1].trim();
                } else {
                    chapterTitle = line;
                }
                break;
            }
        }

        // Handle dividers as chapter breaks
        if (/^[*-]{3,}\s*$/.test(line)) {
            isChapterStart = true;
            chapterTitle = 'Section ' + String(segments.length + 1);
        }

        if (isChapterStart) {
            // Save previous segment
            if (currentSegment && currentSegment.lines.length > 0) {
                const content = currentSegment.lines.join('\n').trim();
                if (content.length > 100) {
                    // Minimum chapter length
                    segments.push({
                        title: currentSegment.title,
                        content,
                        startIndex: currentSegment.startLine,
                        endIndex: i - 1,
                    });
                }
            }

            // Start new segment
            currentSegment = {
                title: chapterTitle,
                startLine: i,
                lines: [],
            };
        } else if (currentSegment) {
            currentSegment.lines.push(lines[i]);
        } else {
            // Content before first chapter marker
            if (!currentSegment) {
                currentSegment = {
                    title: 'Introduction',
                    startLine: 0,
                    lines: [],
                };
            }
            currentSegment.lines.push(lines[i]);
        }
    }

    // Don't forget the last segment
    if (currentSegment && currentSegment.lines.length > 0) {
        const content = currentSegment.lines.join('\n').trim();
        if (content.length > 100) {
            segments.push({
                title: currentSegment.title,
                content,
                startIndex: currentSegment.startLine,
                endIndex: lines.length - 1,
            });
        }
    }

    // If no chapters were found, create one chapter from all text
    if (segments.length === 0 && fullText.trim().length > 0) {
        segments.push({
            title: 'Full Text',
            content: fullText.trim(),
            startIndex: 0,
            endIndex: lines.length - 1,
        });
    }

    return segments;
}

// ─── Create Book Entity ────────────────────────────────────

export function createBookFromSegments(
    segments: ChapterSegment[],
    title: string = 'Untitled Novel',
    options: {
        author?: string;
        description?: string;
        genre?: import('../types/cinematifier').BookGenre;
        isPublic?: boolean;
    } = {},
): import('../types/cinematifier').Book {
    const bookId = 'book-' + String(SESSION_EPOCH);

    const chapters: Chapter[] = segments.map((seg, index) => ({
        id: 'chapter-' + String(SESSION_EPOCH) + '-' + String(index),
        bookId,
        number: index + 1,
        title: seg.title,
        originalText: seg.content,
        cinematifiedBlocks: [],
        status: 'pending' as const,
        isProcessed: false,
        wordCount: seg.content.split(/\s+/).length,
        estimatedReadTime: Math.ceil(seg.content.split(/\s+/).length / 200),
    }));

    return {
        id: bookId,
        title,
        author: options.author,
        description: options.description,
        genre: options.genre || 'other',
        status: 'processing',
        totalChapters: chapters.length,
        processedChapters: 0,
        isPublic: options.isPublic ?? false,
        chapters,
        totalWordCount: chapters.reduce((acc, ch) => acc + ch.wordCount, 0),
        createdAt: Date.now(),
    };
}

// ─── Create Reading Progress Entity ────────────────────────

export function createReadingProgress(
    bookId: string,
): import('../types/cinematifier').ReadingProgress {
    return {
        id: 'progress-' + bookId,
        bookId,
        currentChapter: 1,
        scrollPosition: 0,
        readingMode: 'cinematified',
        bookmarks: [],
        completed: false,
        lastReadAt: Date.now(),
        readChapters: [],
        totalReadTime: 0,
    };
}

// ─── Validation Helpers ────────────────────────────────────

import type { BeatType, TransitionType } from '../types/cinematifier';

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
    'CUT TO',
    'DISSOLVE TO',
    'SMASH CUT',
    'MATCH CUT',
    'JUMP CUT',
    'WIPE TO',
    'IRIS IN',
    'IRIS OUT',
]);

function validateBeatType(type: string): BeatType {
    return VALID_BEAT_TYPES.has(type) ? (type as BeatType) : 'BEAT';
}

function validateTransitionType(type: string): TransitionType {
    return VALID_TRANSITION_TYPES.has(type) ? (type as TransitionType) : 'CUT TO';
}

// ─── Metadata Orchestration ────────────────────────────────

interface NarrativeMetadata {
    genre?: import('../types/cinematifier').BookGenre;
    toneTags?: string[];
    characters: Record<string, import('../types/cinematifier').CharacterAppearance>;
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
                metadata.genre = rawGenre as import('../types/cinematifier').BookGenre;
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

    // Build characters from dialogue tags
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
