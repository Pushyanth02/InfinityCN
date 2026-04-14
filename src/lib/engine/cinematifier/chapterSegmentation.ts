/**
 * chapterSegmentation.ts — Chapter Boundary Detection
 *
 * Splits raw book text into chapter segments by detecting heading patterns
 * (Chapter N, Part I, Act II, Scene 3, Section IV, Prologue, etc.),
 * ALL-CAPS named titles, and divider markers (***, ---).
 *
 * Supports both uppercase and lowercase Roman numerals (I–L+ and beyond),
 * multi-line titles, and colon / dash / en-dash / em-dash subtitle separators.
 */

import type { ChapterSegment } from '../../../types/cinematifier';

// Validated Roman numeral pattern — matches I through MMMCMXCIX (and beyond L).
// Case-insensitivity is provided by the `i` flag on each compiled regex.
const ROMAN = '(?=[ivxlcdm])m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})';

// Separator characters accepted between a heading label and its subtitle:
// colon, period, hyphen, en-dash (–), em-dash (—)
const SEP = '[\\-:.–—]';

const CHAPTER_PATTERNS: RegExp[] = [
    // Chapter / Part / Book headings
    new RegExp(`^(chapter\\s+)(\\d+|${ROMAN}|\\w+)(?:\\s*${SEP}\\s*(.*))?$`, 'im'),
    new RegExp(`^(part\\s+)(\\d+|${ROMAN}|\\w+)(?:\\s*${SEP}\\s*(.*))?$`, 'im'),
    new RegExp(`^(book\\s+)(\\d+|${ROMAN}|\\w+)(?:\\s*${SEP}\\s*(.*))?$`, 'im'),
    // Act / Scene headings
    new RegExp(`^(act\\s+)(\\d+|${ROMAN}|\\w+)(?:\\s*${SEP}\\s*(.*))?$`, 'im'),
    new RegExp(`^(scene\\s+)(\\d+|${ROMAN}|\\w+)(?:\\s*${SEP}\\s*(.*))?$`, 'im'),
    // Section headings (e.g. "Section 1", "Section III")
    new RegExp(`^(section\\s+)(\\d+|${ROMAN}|\\w+)(?:\\s*${SEP}\\s*(.*))?$`, 'im'),
    // Prologue / Epilogue / other book parts with optional subtitle
    /^(prologue|epilogue|introduction|foreword|afterword|preface|appendix|postscript)(?:\s*[:.\-–—]\s*(.*))?$/im,
    // Book/Part/Section/Volume/Act/Scene with Roman numerals or words (e.g., "Book One", "Part I")
    /^\s*(book|part|section|volume|act|scene)[ .:,-]*([\divxlc]+)?[ .:,-]*([\w\s'"-]*)$/i,
    // Numbered chapter headings: "1. The Beginning" or "II. The Return"
    new RegExp(`^(\\d+|${ROMAN})[.)]\\s+(.+)$`, 'im'),
    // Numbered chapter headings: "1 - The Beginning" or "IV: The Return"
    new RegExp(`^(\\d+|${ROMAN})\\s*${SEP}\\s*(.+)$`, 'im'),
    // Standalone PROLOGUE/EPILOGUE
    /^\s*(prologue|epilogue)\s*$/i,
    // Dividers (***, ---, ###, ..., etc.)
    /^\*{3,}\s*$/m,
    /^-{3,}\s*$/m,
    /^#{3,}\s*$/m,
    /^\.{3,}\s*$/m,
    // ALL-CAPS standalone named titles (≥ 4 uppercase letters/spaces, e.g. "THE AWAKENING")
    /^([A-Z][A-Z ]{2,}[A-Z])\s*$/m,
];

const DIVIDER_RE = /^[-*#=~_]{3,}\s*$|^\.{3,}\s*$/;
const TITLE_FALLBACK = 'Untitled Novel';
const TITLE_LABEL_RE = /^(?:title|book\s*title)\s*[:-–—]\s*(.+)$/i;
const MARKDOWN_TITLE_RE = /^#{1,2}\s+(.+)$/;
const BYLINE_RE = /^by\s+[\p{L}\d][\p{L}\d\s.'’-]{1,80}$/iu;
const CHAPTER_HEADING_RE =
    /^(chapter|part|book|act|scene|section|prologue|epilogue|introduction|foreword|afterword|preface|appendix|postscript)\b/i;
const NOISE_LINE_RE =
    /^(copyright|all rights reserved|published by|printed in|isbn|project gutenberg|www\.|https?:\/\/|table of contents|contents)\b/i;

function normalizeTitleCandidate(line: string): string {
    return line
        .replace(/^[\s"'“”‘’[\](){}]+/, '')
        .replace(/[\s"'“”‘’[\](){}]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isLikelyTitleCase(line: string): boolean {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 14) return false;

    const connectorWords = new Set([
        'a',
        'an',
        'and',
        'as',
        'at',
        'by',
        'for',
        'from',
        'in',
        'of',
        'on',
        'or',
        'the',
        'to',
        'with',
    ]);

    let titleLikeWords = 0;
    for (let i = 0; i < words.length; i++) {
        const bare = words[i].replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '');
        if (!bare) continue;

        const lower = bare.toLowerCase();
        if (connectorWords.has(lower) && i > 0) {
            titleLikeWords++;
            continue;
        }

        if (/^[A-Z\d]/.test(bare)) {
            titleLikeWords++;
        }
    }

    return titleLikeWords / words.length >= 0.75;
}

function looksLikeNarrativeSentence(line: string): boolean {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 7) return false;

    return /[.!?]$/.test(line) || /\b(he|she|they|we|i|the)\b/i.test(line);
}

/**
 * Extract likely book title from early document lines.
 * Strategy:
 *  - inspect first lines of text
 *  - detect explicit title patterns
 *  - score candidates and fallback if confidence is low
 */
export function extractTitle(text: string): string {
    const normalizedText = text.replace(/\r\n|\r/g, '\n').trim();
    if (!normalizedText) return TITLE_FALLBACK;

    const earlyLines = normalizedText
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, 40);

    if (earlyLines.length === 0) return TITLE_FALLBACK;

    // Priority 1: explicit title labels in the first lines.
    for (let i = 0; i < Math.min(12, earlyLines.length); i++) {
        const labelMatch = earlyLines[i].match(TITLE_LABEL_RE);
        if (!labelMatch) continue;

        const candidate = normalizeTitleCandidate(labelMatch[1]);
        if (candidate.length >= 2 && candidate.length <= 120) {
            return candidate;
        }
    }

    let bestCandidate = '';
    let bestScore = -Infinity;

    for (let i = 0; i < earlyLines.length; i++) {
        const raw = earlyLines[i];
        const markdownMatch = raw.match(MARKDOWN_TITLE_RE);
        const line = normalizeTitleCandidate(markdownMatch ? markdownMatch[1] : raw);
        if (!line) continue;

        if (line.length < 2 || line.length > 120) continue;
        if (NOISE_LINE_RE.test(line) || BYLINE_RE.test(line) || CHAPTER_HEADING_RE.test(line))
            continue;

        const words = line.split(/\s+/).filter(Boolean);
        let score = 0;

        // Earlier lines are stronger title candidates.
        score += Math.max(0, 30 - i * 2);

        if (markdownMatch) score += 40;
        if (/^[A-Z\d][A-Z\d\s'’&,:\-–—]+$/.test(line) && words.length >= 2) score += 35;
        if (isLikelyTitleCase(line)) score += 28;
        if (words.length >= 2 && words.length <= 12) score += 16;
        if (words.length > 16) score -= 15;
        if (looksLikeNarrativeSentence(line)) score -= 25;
        if (/[;:]$/.test(line)) score -= 8;

        // Boost if followed by a byline.
        const next = earlyLines[i + 1];
        if (next && BYLINE_RE.test(next)) score += 20;

        if (score > bestScore) {
            bestScore = score;
            bestCandidate = line;
        }
    }

    return bestScore >= 40 ? bestCandidate : TITLE_FALLBACK;
}

/** Tests whether a trimmed line matches any chapter heading pattern. */
function matchesAnyPattern(line: string): boolean {
    return CHAPTER_PATTERNS.some(p => p.test(line));
}

/**
 * Returns true if `line` qualifies as a multi-line subtitle continuation:
 * non-empty, reasonably short, and not itself a heading.
 */
function isSubtitleLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.length > 0 && trimmed.length < 80 && !matchesAnyPattern(trimmed);
}

export function segmentChapters(fullText: string): ChapterSegment[] {
    if (fullText.trim().length === 0) return [];
    const lines = fullText.split('\n');
    const segments: ChapterSegment[] = [];
    let currentSegment: { title: string; startLine: number; lines: string[] } | null = null;
    let skipTo = -1;

    for (let i = 0; i < lines.length; i++) {
        if (i < skipTo) continue;

        const line = lines[i].trim();

        // Check if this line is a chapter marker
        let isChapterStart = false;
        let chapterTitle = '';
        let hasSubtitle = false;

        for (const pattern of CHAPTER_PATTERNS) {
            const match = line.match(pattern);
            if (match) {
                isChapterStart = true;
                // Build chapter title from match groups
                if (match[3]) {
                    chapterTitle = match[1].trim() + ' ' + match[2] + ': ' + match[3];
                    hasSubtitle = true;
                } else if (match[2]) {
                    chapterTitle = match[1].trim() + ' ' + match[2];
                } else if (match[1]) {
                    chapterTitle = match[1].trim();
                } else {
                    chapterTitle = line;
                }
                break;
            }
        }

        // Handle dividers as chapter breaks — preserves the existing dual-match
        // behaviour where dividers match BOTH a CHAPTER_PATTERNS entry AND this
        // test, resulting in a "Section N" title override.
        if (DIVIDER_RE.test(line)) {
            isChapterStart = true;
            chapterTitle = 'Section ' + String(segments.length + 1);
        }

        // Multi-line title: when the heading has no inline subtitle, peek ahead
        // at the next non-blank line and treat it as a subtitle if it is short
        // and doesn't look like another heading.
        if (isChapterStart && !hasSubtitle && !DIVIDER_RE.test(line)) {
            let nextIdx = i + 1;
            while (nextIdx < lines.length && lines[nextIdx].trim() === '') {
                nextIdx++;
            }
            if (nextIdx < lines.length && isSubtitleLine(lines[nextIdx])) {
                chapterTitle += ': ' + lines[nextIdx].trim();
                skipTo = nextIdx + 1;
            }
        }

        if (isChapterStart) {
            // Save previous segment
            if (currentSegment && currentSegment.lines.length > 0) {
                const content = currentSegment.lines.join('\n').trim();
                if (content.length > 100 || segments.length === 0) {
                    // Minimum chapter length, but always allow first segment
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
            // Content before first chapter marker — create an implicit introduction segment
            currentSegment = {
                title: 'Introduction',
                startLine: 0,
                lines: [],
            };
            currentSegment.lines.push(lines[i]);
        }
    }

    // Don't forget the last segment
    if (currentSegment && currentSegment.lines.length > 0) {
        const content = currentSegment.lines.join('\n').trim();
        if (content.length > 100 || segments.length === 0) {
            segments.push({
                title: currentSegment.title,
                content,
                startIndex: currentSegment.startLine,
                endIndex: lines.length - 1,
            });
        }
    }

    // If no chapters were found, create one chapter from all text (AI fallback stub)
    if (segments.length === 0 && fullText.trim().length > 0) {
        // TODO: In future, call AI/ML model to suggest boundaries
        segments.push({
            title: 'Full Text',
            content: fullText.trim(),
            startIndex: 0,
            endIndex: lines.length - 1,
        });
    }

    return segments;
}

export interface ChapterContent {
    title: string;
    content: string;
}

/**
 * Split full book text into ordered chapters with only title/content fields.
 */
export function splitBookIntoChapters(fullText: string): ChapterContent[] {
    return segmentChapters(fullText)
        .sort((a, b) => a.startIndex - b.startIndex)
        .map(segment => ({
            title: segment.title,
            content: segment.content,
        }));
}
