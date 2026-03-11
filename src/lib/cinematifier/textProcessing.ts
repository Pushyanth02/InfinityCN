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

// ─── Public API ──────────────────────────────────────────────

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
