/**
 * textUtils.ts — InfinityCN Text Processing Utilities
 *
 * Additional text manipulation functions for enhanced processing,
 * including text cleaning, chunking, and advanced analysis.
 */

// ═══════════════════════════════════════════════════════════
// 1. TEXT CLEANING
// ═══════════════════════════════════════════════════════════

/**
 * Clean and normalize text for processing
 */
export function cleanText(text: string): string {
    return (
        text
            // Normalize whitespace
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            // Remove excessive blank lines
            .replace(/\n{3,}/g, '\n\n')
            // Normalize unicode quotes (double)
            .replace(/[\u201C\u201D]/g, '"')
            // Normalize unicode quotes (single)
            .replace(/[\u2018\u2019]/g, "'")
            // Normalize dashes
            .replace(/[\u2013\u2014]/g, '-')
            // Remove zero-width characters
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            // Normalize spaces
            .replace(/[ \t]+/g, ' ')
            .trim()
    );
}

/**
 * Remove headers/footers commonly found in ebooks
 */
export function removeBookArtifacts(text: string): string {
    const lines = text.split('\n');

    // Filter out common ebook artifacts
    const filtered = lines.filter(line => {
        const trimmed = line.trim().toLowerCase();

        // Skip page numbers
        if (/^(page\s+)?\d+(\s+of\s+\d+)?$/i.test(trimmed)) return false;

        // Skip copyright notices
        if (/^copyright\s+©?\s*\d{4}/i.test(trimmed)) return false;

        // Skip common headers
        if (/^(chapter|part|section)\s+\d+$/i.test(trimmed) && line.length < 20) return false;

        return true;
    });

    return filtered.join('\n');
}

// ═══════════════════════════════════════════════════════════
// 2. TEXT CHUNKING
// ═══════════════════════════════════════════════════════════

export interface TextChunk {
    text: string;
    startIndex: number;
    endIndex: number;
    wordCount: number;
}

/**
 * Split text into chunks of approximately `maxWords` words,
 * preferring to break at paragraph or sentence boundaries.
 */
export function chunkText(text: string, maxWords: number = 500): TextChunk[] {
    // Split while tracking the actual separators
    const paragraphPattern = /\n\n+/g;
    const parts: string[] = [];
    const separators: string[] = [];
    let lastIndex = 0;
    let match;

    while ((match = paragraphPattern.exec(text)) !== null) {
        parts.push(text.slice(lastIndex, match.index));
        separators.push(match[0]);
        lastIndex = match.index + match[0].length;
    }
    parts.push(text.slice(lastIndex));

    const chunks: TextChunk[] = [];
    let currentChunk = '';
    let currentStart = 0;
    let currentWordCount = 0;
    let charOffset = 0;

    for (let i = 0; i < parts.length; i++) {
        const para = parts[i];
        const paraWords = para.split(/\s+/).filter(w => w.length > 0).length;
        const separator = i < separators.length ? separators[i] : '';

        if (currentWordCount + paraWords > maxWords && currentChunk.length > 0) {
            // Save current chunk
            chunks.push({
                text: currentChunk.trim(),
                startIndex: currentStart,
                endIndex: charOffset - 1,
                wordCount: currentWordCount,
            });
            currentChunk = para;
            currentStart = charOffset;
            currentWordCount = paraWords;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + para;
            currentWordCount += paraWords;
        }

        charOffset += para.length + separator.length;
    }

    // Add final chunk
    if (currentChunk.trim().length > 0) {
        chunks.push({
            text: currentChunk.trim(),
            startIndex: currentStart,
            endIndex: Math.min(charOffset, text.length),
            wordCount: currentWordCount,
        });
    }

    return chunks;
}

/**
 * Split text into overlapping chunks for better context preservation
 */
export function chunkTextWithOverlap(
    text: string,
    chunkSize: number = 1000,
    overlap: number = 100,
): TextChunk[] {
    const chunks: TextChunk[] = [];
    const words = text.split(/\s+/);
    let startWord = 0;

    while (startWord < words.length) {
        const endWord = Math.min(startWord + chunkSize, words.length);
        const chunkWords = words.slice(startWord, endWord);

        // Find character indices
        const beforeChunk = words.slice(0, startWord).join(' ');
        const startIndex = beforeChunk.length + (startWord > 0 ? 1 : 0);
        const chunkText = chunkWords.join(' ');

        chunks.push({
            text: chunkText,
            startIndex,
            endIndex: startIndex + chunkText.length,
            wordCount: chunkWords.length,
        });

        startWord += chunkSize - overlap;
        if (startWord >= words.length) break;
    }

    return chunks;
}

// ═══════════════════════════════════════════════════════════
// 3. TEXT STATISTICS
// ═══════════════════════════════════════════════════════════

export interface TextStatistics {
    charCount: number;
    charCountNoSpaces: number;
    wordCount: number;
    sentenceCount: number;
    paragraphCount: number;
    avgWordLength: number;
    avgSentenceLength: number;
    uniqueWords: number;
    estimatedReadingTime: number; // minutes
}

/**
 * Calculate comprehensive text statistics
 */
export function calculateTextStatistics(text: string): TextStatistics {
    const charCount = text.length;
    const charCountNoSpaces = text.replace(/\s/g, '').length;

    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceCount = sentences.length;

    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
    const paragraphCount = paragraphs.length;

    const totalWordLength = words.reduce((sum, w) => sum + w.length, 0);
    const avgWordLength = wordCount > 0 ? totalWordLength / wordCount : 0;

    const avgSentenceLength = sentenceCount > 0 ? wordCount / sentenceCount : 0;

    const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;

    // Average reading speed: 200-250 words per minute
    const estimatedReadingTime = Math.ceil(wordCount / 225);

    return {
        charCount,
        charCountNoSpaces,
        wordCount,
        sentenceCount,
        paragraphCount,
        avgWordLength: parseFloat(avgWordLength.toFixed(2)),
        avgSentenceLength: parseFloat(avgSentenceLength.toFixed(2)),
        uniqueWords,
        estimatedReadingTime,
    };
}

// ═══════════════════════════════════════════════════════════
// 4. SEARCH & HIGHLIGHT
// ═══════════════════════════════════════════════════════════

export interface SearchMatch {
    text: string;
    startIndex: number;
    endIndex: number;
    context: string; // Surrounding text
}

/**
 * Find all occurrences of a search term in text
 */
export function searchText(
    text: string,
    query: string,
    options: { caseSensitive?: boolean; contextLength?: number } = {},
): SearchMatch[] {
    const { caseSensitive = false, contextLength = 50 } = options;

    const searchText = caseSensitive ? text : text.toLowerCase();
    const searchQuery = caseSensitive ? query : query.toLowerCase();

    const matches: SearchMatch[] = [];
    let startIndex = 0;

    while (true) {
        const index = searchText.indexOf(searchQuery, startIndex);
        if (index === -1) break;

        // Extract context
        const contextStart = Math.max(0, index - contextLength);
        const contextEnd = Math.min(text.length, index + query.length + contextLength);
        const context =
            (contextStart > 0 ? '...' : '') +
            text.slice(contextStart, contextEnd) +
            (contextEnd < text.length ? '...' : '');

        matches.push({
            text: text.slice(index, index + query.length),
            startIndex: index,
            endIndex: index + query.length,
            context,
        });

        startIndex = index + 1;
    }

    return matches;
}

/**
 * Highlight search matches in text with HTML tags
 */
export function highlightMatches(
    text: string,
    matches: SearchMatch[],
    tag: string = 'mark',
): string {
    if (matches.length === 0) return text;

    // Sort matches by position (descending) to replace from end to start
    const sorted = [...matches].sort((a, b) => b.startIndex - a.startIndex);

    let result = text;
    for (const match of sorted) {
        const before = result.slice(0, match.startIndex);
        const highlighted = `<${tag}>${result.slice(match.startIndex, match.endIndex)}</${tag}>`;
        const after = result.slice(match.endIndex);
        result = before + highlighted + after;
    }

    return result;
}

// ═══════════════════════════════════════════════════════════
// 5. TEXT EXTRACTION
// ═══════════════════════════════════════════════════════════

/**
 * Extract all URLs from text
 */
export function extractUrls(text: string): string[] {
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    return text.match(urlPattern) || [];
}

/**
 * Extract all email addresses from text
 */
export function extractEmails(text: string): string[] {
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
    return text.match(emailPattern) || [];
}

/**
 * Extract all numbers from text
 */
export function extractNumbers(text: string): number[] {
    // Pattern requires at least one digit, and optional decimal with at least one digit after
    const numberPattern = /-?\d+(?:\.\d+)?/g;
    const matches = text.match(numberPattern) || [];
    return matches.map(Number).filter(n => !isNaN(n));
}

// ═══════════════════════════════════════════════════════════
// 6. TEXT TRANSFORMATION
// ═══════════════════════════════════════════════════════════

/**
 * Convert text to title case
 */
export function toTitleCase(text: string): string {
    const minorWords = new Set([
        'a',
        'an',
        'the',
        'and',
        'but',
        'or',
        'for',
        'nor',
        'on',
        'at',
        'to',
        'by',
        'of',
        'in',
    ]);

    return text
        .toLowerCase()
        .split(' ')
        .map((word, index) => {
            if (index === 0 || !minorWords.has(word)) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            }
            return word;
        })
        .join(' ');
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
    if (text.length <= maxLength) return text;

    // Try to break at a word boundary
    const truncated = text.slice(0, maxLength - suffix.length);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.7) {
        return truncated.slice(0, lastSpace) + suffix;
    }

    return truncated + suffix;
}

/**
 * Remove duplicate whitespace and normalize
 */
export function normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

// ═══════════════════════════════════════════════════════════
// 7. LANGUAGE DETECTION (Simple heuristic)
// ═══════════════════════════════════════════════════════════

const LANGUAGE_PATTERNS: Record<string, RegExp> = {
    // Japanese: must have hiragana or katakana (kana) - these are unique to Japanese
    japanese: /[\u3040-\u309F\u30A0-\u30FF]/g,
    // Chinese: CJK characters without Japanese kana
    chinese: /[\u4E00-\u9FFF]/g,
    korean: /[\uAC00-\uD7AF\u1100-\u11FF]/g,
    arabic: /[\u0600-\u06FF]/g,
    hebrew: /[\u0590-\u05FF]/g,
    cyrillic: /[\u0400-\u04FF]/g,
    greek: /[\u0370-\u03FF]/g,
};

/**
 * Detect primary script/language of text
 */
export function detectScript(text: string): string {
    // Check for Japanese kana first (unique to Japanese)
    const kanaPattern = /[\u3040-\u309F\u30A0-\u30FF]/g;
    const kanaMatches = text.match(kanaPattern) || [];
    if (kanaMatches.length > 0) {
        return 'japanese';
    }

    // Check other scripts
    const scripts: { lang: string; count: number }[] = [];

    for (const [language, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
        if (language === 'japanese') continue; // Already handled above
        const matches = text.match(pattern) || [];
        if (matches.length > 0) {
            scripts.push({ lang: language, count: matches.length });
        }
    }

    if (scripts.length === 0) {
        return 'latin';
    }

    // Return the script with the most matches
    scripts.sort((a, b) => b.count - a.count);
    return scripts[0].lang;
}
