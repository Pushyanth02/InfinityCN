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
6. Make fight scenes visceral with rapid-fire sentences
7. Heighten emotional moments with sensory details`;

// ─── Main Cinematification Function ────────────────────────

export async function cinematifyText(
    text: string,
    config: AIConfig,
    onProgress?: (percent: number, message: string) => void,
): Promise<CinematificationResult> {
    const startTime = performance.now();
    const chunks = chunkText(text);
    const allBlocks: CinematicBlock[] = [];
    const allRawText: string[] = [];
    let sfxCount = 0;
    let transitionCount = 0;
    let beatCount = 0;

    for (let i = 0; i < chunks.length; i++) {
        const chunkProgress = (i + 1) / chunks.length; // 0 to 1
        onProgress?.(chunkProgress, `Cinematifying section ${i + 1} of ${chunks.length}...`);

        const prompt = `${CINEMATIFICATION_SYSTEM_PROMPT}

ORIGINAL CHAPTER TEXT:
"""
${chunks[i]}
"""

OUTPUT: Full cinematified version`;

        try {
            const raw = await callAIWithDedup(prompt, config);
            allRawText.push(raw);

            const blocks = parseCinematifiedText(raw);
            for (const block of blocks) {
                allBlocks.push(block);
                if (block.sfx) sfxCount++;
                if (block.transition) transitionCount++;
                if (block.beat) beatCount++;
            }
        } catch (err) {
            console.warn(`[Cinematifier] Chunk ${i + 1} fallback:`, err);
            const fallbackBlocks = createFallbackBlocks(chunks[i]);
            allBlocks.push(...fallbackBlocks);
        }
    }

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

    // Normalize smart quotes
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
                    content: `SFX: ${sound}`,
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
                    content: `SFX: ${sound}`,
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
            blocks.push(...parseTextLine(line));
        }
    }

    return blocks;
}

/** Parse a single text line into one or more CinematicBlocks */
function parseTextLine(line: string): CinematicBlock[] {
    const blocks: CinematicBlock[] = [];

    // Dialogue: line starts with "quoted text"
    const dialogueMatch = line.match(/^"([^"]+)"(.*)$/);
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
    if (/^\*[^*]+\*$/.test(line) || /^_[^_]+_$/.test(line)) {
        blocks.push({
            id: generateBlockId(),
            type: 'inner_thought',
            content: line.replace(/^\*|\*$|^_|_$/g, ''),
            intensity: 'whisper',
        });
        return blocks;
    }

    // Regular action/narrative line
    const wordCount = line.split(/\s+/).length;
    let intensity: CinematicBlock['intensity'] = 'normal';
    let timing: CinematicBlock['timing'] = 'normal';

    if (line.includes('!')) intensity = 'emphasis';
    if (/\.{3}|…|—\s*$/.test(line)) intensity = 'whisper';
    if (/scream|roar|explod/i.test(line)) intensity = 'shout';

    if (wordCount <= 4) timing = 'rapid';
    else if (wordCount <= 8) timing = 'quick';
    else if (wordCount > 30) timing = 'slow';

    blocks.push({
        id: generateBlockId(),
        type: 'action',
        content: line,
        intensity,
        timing,
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

    // SFX trigger words
    const sfxPatterns: [RegExp, string, 'soft' | 'medium' | 'loud' | 'explosive'][] = [
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
            if (para.includes('...')) intensity = 'whisper';

            blocks.push({
                id: generateBlockId(),
                type: 'action',
                content: para,
                intensity,
            });
        }

        // Check for SFX triggers in the paragraph
        for (const [pattern, sound, sfxIntensity] of sfxPatterns) {
            if (pattern.test(para)) {
                blocks.push({
                    id: generateBlockId(),
                    type: 'sfx',
                    content: `SFX: ${sound}`,
                    intensity: sfxIntensity === 'explosive' ? 'explosive' : 'emphasis',
                    sfx: { sound, intensity: sfxIntensity },
                });
                break; // Only one SFX per paragraph
            }
        }

        // Add dramatic beats for emotional moments
        if (/\.\.\.|—$|sudden|shock|realiz|gasp/i.test(para)) {
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
                    chapterTitle = `${match[1]}${match[2]}: ${match[3]}`.trim();
                } else if (match[2]) {
                    chapterTitle = `${match[1]}${match[2]}`.trim();
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
            chapterTitle = `Section ${segments.length + 1}`;
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
    const bookId = `book-${SESSION_EPOCH}`;

    const chapters: Chapter[] = segments.map((seg, index) => ({
        id: `chapter-${SESSION_EPOCH}-${index}`,
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
        id: `progress-${bookId}`,
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

function validateBeatType(type: string): BeatType {
    const valid: BeatType[] = ['BEAT', 'PAUSE', 'LONG PAUSE', 'SILENCE', 'TENSION', 'RELEASE'];
    return valid.includes(type as BeatType) ? (type as BeatType) : 'BEAT';
}

function validateTransitionType(type: string): TransitionType {
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
    return valid.includes(type as TransitionType) ? (type as TransitionType) : 'CUT TO';
}

export { CINEMATIFICATION_SYSTEM_PROMPT };
