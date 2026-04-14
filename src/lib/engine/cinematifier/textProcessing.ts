/**
 * textProcessing.ts — Text Cleaning & Paragraph Reconstruction
 *
 * Handles PDF artifact removal and intelligent paragraph boundary detection
 * for raw extracted text before further processing.
 */

import { rebuildParagraphsWithBreakerApis } from './paragraphBreakers';

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

const CLOSING_QUOTE_RE = /["'"')\]]/;
const AFTER_SPACE_RE = /^\s*(\S)/;

// Lines consisting solely of a repeated character (e.g. "======", "______")
const REPEATED_CHAR_LINE_RE = /^(.)\1{2,}$/;

// All-caps heading: at least 2 characters, entirely uppercase letters/spaces/digits/punctuation
const ALL_CAPS_HEADING_RE = /^[A-Z][A-Z\d\s:.,!?'-]+$/;

const SENTENCE_TERMINATOR_RE = /[.!?]["')\]]*$/;
const DIALOGUE_SENTENCE_START_RE = /^["'\u201c\u201d\u2018\u2019]/;
const SENTENCE_CONTINUATION_RE =
    /^(?:and|but|or|so|because|that|which|who|whom|when|while|where|if|then|than|as|however|therefore|meanwhile|later|suddenly)\b/i;

// Unicode ligature map
const LIGATURE_MAP: ReadonlyMap<string, string> = new Map([
    ['\uFB00', 'ff'],
    ['\uFB01', 'fi'],
    ['\uFB02', 'fl'],
    ['\uFB03', 'ffi'],
    ['\uFB04', 'ffl'],
    ['\uFB05', 'st'],
    ['\uFB06', 'st'],
]);

// Zero-width characters to strip (each replaced individually to avoid joined-char-class lint)
const ZERO_WIDTH_CHARS = [
    '\u200B', // zero-width space
    '\u200C', // zero-width non-joiner
    '\u200D', // zero-width joiner
    '\u200E', // left-to-right mark
    '\u200F', // right-to-left mark
    '\uFEFF', // byte order mark / zero-width no-break space
];

/**
 * Split text into sentences using heuristics that handle abbreviations,
 * decimals, ellipses, and quoted speech.
 */
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
 * Detects whether a block of text looks like poetry/verse:
 * multiple short lines (≤60 chars) with no sentence-ending punctuation on most lines.
 */
function looksLikeVerse(block: string): boolean {
    const lines = block.split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 2) return false;

    const shortLines = lines.filter(l => l.trim().length <= 60);
    const noTerminalPunct = lines.filter(l => !/[.!?]$/.test(l.trim()));

    // At least 75% of lines are short AND at least 50% lack terminal punctuation
    return shortLines.length / lines.length >= 0.75 && noTerminalPunct.length / lines.length >= 0.5;
}

/**
 * Checks whether a line is an all-caps heading.
 */
function isAllCapsHeading(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed.length < 2 || trimmed.length > 120) return false;
    // Must contain at least 2 letter characters
    const letterCount = (trimmed.match(/[A-Z]/g) || []).length;
    if (letterCount < 2) return false;
    return ALL_CAPS_HEADING_RE.test(trimmed);
}

function normalizeRebuildWhitespace(text: string): string {
    return text
        .replace(/\u00A0/g, ' ')
        .replace(/\r\n|\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n[ ]+/g, '\n')
        .replace(/[ ]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function shouldJoinBrokenLine(previousLine: string, nextLine: string): boolean {
    const prev = previousLine.trim();
    const next = nextLine.trim();
    if (!prev || !next) return false;

    if (prev.endsWith('-')) return true;
    if (!SENTENCE_TERMINATOR_RE.test(prev)) return true;
    if (/^[a-z0-9(]/.test(next)) return true;
    if (SENTENCE_CONTINUATION_RE.test(next)) return true;

    return false;
}

function mergeBrokenLines(block: string): string {
    const lines = block
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    if (lines.length <= 1) {
        return block.trim();
    }

    const mergedLines: string[] = [];
    let current = lines[0];

    for (let i = 1; i < lines.length; i++) {
        const next = lines[i];
        if (shouldJoinBrokenLine(current, next)) {
            current = current.endsWith('-') ? `${current}${next}` : `${current} ${next}`;
        } else {
            mergedLines.push(current.trim());
            current = next;
        }
    }

    mergedLines.push(current.trim());
    return mergedLines
        .join(' ')
        .replace(/[ ]{2,}/g, ' ')
        .trim();
}

function groupSentencesIntoParagraphs(text: string): string[] {
    const sentences = splitSentences(text)
        .map(sentence => sentence.trim())
        .filter(Boolean);

    if (sentences.length <= 1) {
        return [text.trim()];
    }

    const paragraphs: string[] = [];
    let currentParagraph: string[] = [];
    let currentLength = 0;

    const flushParagraph = () => {
        if (currentParagraph.length === 0) return;
        paragraphs.push(currentParagraph.join(' '));
        currentParagraph = [];
        currentLength = 0;
    };

    for (const sentence of sentences) {
        const startsDialogue = DIALOGUE_SENTENCE_START_RE.test(sentence);
        const startsHeading = isAllCapsHeading(sentence);
        const exceedsSentenceBudget = currentParagraph.length >= 4;
        const exceedsLengthBudget =
            currentParagraph.length >= 2 && currentLength + sentence.length > 480;
        const shouldBreak =
            (startsDialogue && currentParagraph.length > 0) ||
            startsHeading ||
            exceedsSentenceBudget ||
            exceedsLengthBudget;

        if (shouldBreak) {
            flushParagraph();
        }

        currentParagraph.push(sentence);
        currentLength += sentence.length + 1;
    }

    flushParagraph();
    return paragraphs.length > 0 ? paragraphs : [text.trim()];
}

const DIALOGUE_RE = /"[^"\n]+"/g;
const SPEECH_VERB_PATTERN =
    'said|asked|replied|whispered|shouted|muttered|cried|yelled|called|answered|snapped|growled|sighed|added|remarked|told';
const SPEAKER_PATTERN = "[A-Z][A-Za-z'\\-]*(?:\\s+[A-Z][A-Za-z'\\-]*){0,2}|he|she|they|we|i";

const TRAILING_NAME_ATTRIBUTION_RE = new RegExp(
    `(${SPEAKER_PATTERN})\\s+(?:${SPEECH_VERB_PATTERN})[\\s,;:!?-]*$`,
    'i',
);
const TRAILING_VERB_ATTRIBUTION_RE = new RegExp(
    `(?:${SPEECH_VERB_PATTERN})\\s+(${SPEAKER_PATTERN})[\\s,;:!?-]*$`,
    'i',
);
const LEADING_NAME_ATTRIBUTION_RE = new RegExp(
    `^[,;:\\s-]*(${SPEAKER_PATTERN})\\s+(?:${SPEECH_VERB_PATTERN})\\b`,
    'i',
);
const LEADING_VERB_ATTRIBUTION_RE = new RegExp(
    `^[,;:\\s-]*(?:${SPEECH_VERB_PATTERN})\\s+(${SPEAKER_PATTERN})\\b`,
    'i',
);

export interface DialogueStructureOptions {
    attachSpeaker?: boolean;
    preserveExactContent?: boolean;
}

function normalizeSpeakerLabel(rawSpeaker: string): string {
    const speaker = rawSpeaker.trim();
    if (/^i$/i.test(speaker)) return 'I';
    if (/^(he|she|they|we)$/i.test(speaker)) return speaker.toLowerCase();
    return speaker;
}

function normalizeNarrationChunk(chunk: string, preserveExactContent: boolean): string {
    if (preserveExactContent) {
        return chunk.replace(/\s+/g, ' ').trim();
    }

    return chunk
        .replace(/^[,;:\-\s]+/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function detectSpeakerFromBeforeQuote(before: string): string | undefined {
    const window = before.slice(Math.max(0, before.length - 180));
    const nameFirst = window.match(TRAILING_NAME_ATTRIBUTION_RE);
    if (nameFirst?.[1]) return normalizeSpeakerLabel(nameFirst[1]);

    const verbFirst = window.match(TRAILING_VERB_ATTRIBUTION_RE);
    if (verbFirst?.[1]) return normalizeSpeakerLabel(verbFirst[1]);

    return undefined;
}

function detectSpeakerFromAfterQuote(after: string): string | undefined {
    const window = after.slice(0, 180);
    const nameFirst = window.match(LEADING_NAME_ATTRIBUTION_RE);
    if (nameFirst?.[1]) return normalizeSpeakerLabel(nameFirst[1]);

    const verbFirst = window.match(LEADING_VERB_ATTRIBUTION_RE);
    if (verbFirst?.[1]) return normalizeSpeakerLabel(verbFirst[1]);

    return undefined;
}

function structureDialogueBlock(block: string, options: DialogueStructureOptions): string[] {
    const attachSpeaker = options.attachSpeaker ?? true;
    const preserveExactContent = options.preserveExactContent ?? false;
    const parts: string[] = [];
    let cursor = 0;

    for (const match of block.matchAll(DIALOGUE_RE)) {
        const index = match.index ?? 0;
        const dialogue = match[0].replace(/\s+/g, ' ').trim();

        const narrationBefore = normalizeNarrationChunk(
            block.slice(cursor, index),
            preserveExactContent,
        );
        if (narrationBefore) {
            parts.push(narrationBefore);
        }

        const beforeContext = block.slice(0, index);
        const afterContext = block.slice(index + dialogue.length);
        const speaker =
            detectSpeakerFromBeforeQuote(beforeContext) ??
            detectSpeakerFromAfterQuote(afterContext);

        parts.push(attachSpeaker && speaker ? `${speaker}: ${dialogue}` : dialogue);
        cursor = index + dialogue.length;
    }

    const trailingNarration = normalizeNarrationChunk(block.slice(cursor), preserveExactContent);
    if (trailingNarration) {
        parts.push(trailingNarration);
    }

    return parts;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Converts curly/smart quotes to straight quotes,
 * normalizes dash types to em-dashes,
 * and normalizes ellipsis characters and multi-dot sequences.
 */
export function normalizeQuotes(text: string): string {
    return (
        text
            // Curly double quotes → straight double quotes
            .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
            // Curly single quotes → straight single quotes
            .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
            // En-dash, em-dash, and horizontal bar → consistent em-dash
            .replace(/[\u2013\u2014\u2015]/g, '\u2014')
            // Ellipsis character → three dots
            .replace(/\u2026/g, '...')
            // Four or more dots → three dots
            .replace(/\.{4,}/g, '...')
    );
}

/**
 * Applies NFC Unicode normalization, strips zero-width characters,
 * and converts common Unicode ligatures to ASCII equivalents.
 */
export function normalizeUnicode(text: string): string {
    // NFC normalization
    let result = text.normalize('NFC');

    // Strip zero-width characters
    for (const ch of ZERO_WIDTH_CHARS) {
        result = result.replaceAll(ch, '');
    }

    // Replace ligatures
    for (const [ligature, replacement] of LIGATURE_MAP) {
        result = result.replaceAll(ligature, replacement);
    }

    return result;
}

/**
 * Clean extracted PDF text by removing common artifacts:
 * page numbers, headers/footers, excessive whitespace, hyphenation,
 * OCR noise, repeated-character lines, and normalizes quotes/unicode.
 */
export function cleanExtractedText(text: string): string {
    let cleaned = text
        // Remove standalone page numbers (lines that are just a number)
        .replace(/^\s*\d{1,4}\s*$/gm, '')
        // Remove common header/footer patterns: "Page X of Y", "- X -"
        .replace(/^\s*page\s+\d+\s*(of\s+\d+)?\s*$/gim, '')
        .replace(/^\s*-\s*\d+\s*-\s*$/gm, '')
        // Fix hyphenated line breaks (word- \n continuation)
        .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
        // Remove standalone OCR noise characters
        .replace(/^\s*[|§¶©®]\s*$/gm, '');

    // Remove lines that are just repeated characters (e.g. "======", "______", "######")
    cleaned = cleaned
        .split('\n')
        .filter(line => !REPEATED_CHAR_LINE_RE.test(line.trim()))
        .join('\n');

    // Normalize quotes and unicode
    cleaned = normalizeQuotes(cleaned);
    cleaned = normalizeUnicode(cleaned);

    // Collapse 3+ consecutive blank lines into 2, trim whitespace per line
    cleaned = cleaned
        .replace(/\n{4,}/g, '\n\n\n')
        .replace(/^[ \t]+|[ \t]+$/gm, '')
        .trim();

    return cleaned;
}

/**
 * Detects if text lacks paragraph breaks and uses sentence-boundary heuristics
 * to insert \n\n breaks. This is critical for LLM chunking.
 *
 * Enhanced to detect poetry/verse (short lines preserved) and all-caps headings
 * that should remain as separate paragraphs.
 */
export function reconstructParagraphs(text: string): string {
    return rebuildParagraphs(text);
}

/**
 * Rebuild paragraph boundaries from raw extracted text.
 * Repairs hard-wrapped lines, splits merged paragraphs by sentence boundaries,
 * normalizes spacing, and preserves original wording.
 */
export function rebuildParagraphs(text: string): string {
    const normalized = normalizeRebuildWhitespace(text);
    if (!normalized) return '';

    const sourceBlocks = normalized
        .split(/\n\s*\n/)
        .map(block => block.trim())
        .filter(Boolean);

    const rebuiltBlocks: string[] = [];

    for (const block of sourceBlocks) {
        if (isAllCapsHeading(block) || looksLikeVerse(block)) {
            rebuiltBlocks.push(block);
            continue;
        }

        const merged = mergeBrokenLines(block);
        const heuristicParagraphs = groupSentencesIntoParagraphs(merged);

        const shouldUseBreakerApis = heuristicParagraphs.length <= 1 || merged.length >= 420;
        if (!shouldUseBreakerApis) {
            rebuiltBlocks.push(...heuristicParagraphs);
            continue;
        }

        const breakerParagraphs = rebuildParagraphsWithBreakerApis(merged, {
            maxSentencesPerParagraph: 4,
            maxWordsPerParagraph: 95,
        });

        if (breakerParagraphs.length === 0) {
            rebuiltBlocks.push(...heuristicParagraphs);
            continue;
        }

        const candidate = breakerParagraphs.join('\n\n');
        const canonicalMatch =
            canonicalWithoutWhitespace(candidate) === canonicalWithoutWhitespace(merged);

        if (!canonicalMatch) {
            rebuiltBlocks.push(...heuristicParagraphs);
            continue;
        }

        if (breakerParagraphs.length >= heuristicParagraphs.length) {
            rebuiltBlocks.push(...breakerParagraphs);
        } else {
            rebuiltBlocks.push(...heuristicParagraphs);
        }
    }

    return rebuiltBlocks
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function canonicalWithoutWhitespace(text: string): string {
    return text.replace(/\s+/g, '');
}

function normalizeOriginalModeSpacing(text: string): string {
    return text
        .replace(/\u00A0/g, ' ')
        .replace(/\r\n|\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n[ ]+/g, '\n')
        .replace(/[ ]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Structure narration and quoted dialogue into readable blocks.
 * Dialogue is placed on dedicated lines and speaker labels are attached when detectable.
 */
export function structureDialogue(text: string, options: DialogueStructureOptions = {}): string {
    const preserveExactContent = options.preserveExactContent ?? false;
    const normalized = preserveExactContent
        ? normalizeRebuildWhitespace(text)
        : normalizeRebuildWhitespace(normalizeUnicode(normalizeQuotes(text)));
    if (!normalized) return '';

    const blocks = normalized
        .split(/\n\s*\n/)
        .map(block => block.trim())
        .filter(Boolean);

    const structured: string[] = [];
    for (const block of blocks) {
        structured.push(...structureDialogueBlock(block, options));
    }

    return structured
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Original mode formatter focused on readability only.
 * Cleans paragraph boundaries, spacing, and dialogue presentation without rewriting content.
 */
export function formatOriginalText(text: string): string {
    const normalized = normalizeOriginalModeSpacing(text);
    if (!normalized) return '';

    const rebuilt = rebuildParagraphs(normalized);
    const safeRebuilt =
        canonicalWithoutWhitespace(rebuilt) === canonicalWithoutWhitespace(normalized)
            ? rebuilt
            : normalized;

    const structured = structureDialogue(safeRebuilt, {
        attachSpeaker: false,
        preserveExactContent: true,
    });
    const safeStructured =
        canonicalWithoutWhitespace(structured) === canonicalWithoutWhitespace(safeRebuilt)
            ? structured
            : safeRebuilt;

    return normalizeOriginalModeSpacing(safeStructured);
}
