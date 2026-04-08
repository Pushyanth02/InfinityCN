/**
 * textProcessing.ts — Text Cleaning & Paragraph Reconstruction
 *
 * Handles PDF artifact removal and intelligent paragraph boundary detection
 * for raw extracted text before further processing.
 */

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
    const existingParas = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const avgLen = existingParas.length > 0 ? text.length / existingParas.length : text.length;

    // If average paragraph is < 1000 chars and there are multiple, paragraphs exist
    if (avgLen < 1000 && existingParas.length > 2) {
        return text;
    }

    // Pre-process each paragraph block: preserve verse and headings
    const processedParas: string[] = [];

    for (const para of existingParas) {
        const trimmed = para.trim();

        // Preserve all-caps headings as separate paragraphs
        if (isAllCapsHeading(trimmed)) {
            processedParas.push(trimmed);
            continue;
        }

        // Preserve poetry/verse blocks without merging lines
        if (looksLikeVerse(trimmed)) {
            processedParas.push(trimmed);
            continue;
        }

        // Merge single-newline-separated lines into continuous text
        const merged = trimmed.replace(/([^\n])\n([^\n])/g, '$1 $2');
        processedParas.push(merged);
    }

    const continuousText = processedParas.join('\n\n');

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
        const isHeading = isAllCapsHeading(s);

        if (sentencesInPara === 0) {
            result += s;
            sentencesInPara++;
        } else {
            if (isDialogueStart || isHeading || sentencesInPara >= 4) {
                result += '\n\n' + s;
                sentencesInPara = 1;
            } else {
                result += ' ' + s;
                sentencesInPara++;
            }
        }

        // Force paragraph break after a heading
        if (isHeading) {
            sentencesInPara = 4;
        }

        if (nextIsDialogueStart && sentencesInPara > 0) {
            sentencesInPara = 4; // Force break next iteration
        }
    }

    return result || text;
}
