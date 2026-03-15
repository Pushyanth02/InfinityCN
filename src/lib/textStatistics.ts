/**
 * textStatistics.ts — Text Statistics & Metrics API
 *
 * Provides comprehensive text statistics including:
 *   • Character, word, sentence, paragraph counts
 *   • Estimated reading & speaking time
 *   • Average word/sentence length
 *   • Unique word ratio
 *   • Top word frequency analysis
 *
 * All computation is pure — no AI or external dependencies.
 * Designed to enrich the cinematification pipeline or standalone analysis.
 */

// ─── Types ─────────────────────────────────────────────────

export interface TextStatistics {
    /** Total character count (including spaces) */
    characterCount: number;
    /** Character count without spaces */
    characterCountNoSpaces: number;
    /** Total word count */
    wordCount: number;
    /** Total sentence count */
    sentenceCount: number;
    /** Total paragraph count */
    paragraphCount: number;
    /** Estimated reading time in minutes (at 238 wpm average) */
    readingTimeMinutes: number;
    /** Estimated speaking time in minutes (at 150 wpm average) */
    speakingTimeMinutes: number;
    /** Average word length in characters */
    avgWordLength: number;
    /** Average sentence length in words */
    avgSentenceLength: number;
    /** Longest word found in the text */
    longestWord: string;
    /** Percentage of unique words (0–100) */
    uniqueWordPercentage: number;
    /** Top N most frequent words (excluding stop words) */
    topWords: WordFrequency[];
}

export interface WordFrequency {
    word: string;
    count: number;
}

// ─── Constants ─────────────────────────────────────────────

/** Average silent reading speed (words per minute) */
const READING_WPM = 238;

/** Average speaking speed (words per minute) */
const SPEAKING_WPM = 150;

/** Common English stop words excluded from frequency analysis */
const STOP_WORDS = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'is',
    'it',
    'as',
    'was',
    'are',
    'be',
    'has',
    'had',
    'have',
    'do',
    'did',
    'not',
    'that',
    'this',
    'from',
    'he',
    'she',
    'they',
    'we',
    'you',
    'i',
    'his',
    'her',
    'its',
    'my',
    'our',
    'your',
    'their',
    'will',
    'would',
    'could',
    'should',
    'can',
    'may',
    'if',
    'so',
    'no',
    'up',
    'out',
    'all',
    'been',
    'were',
    'what',
    'when',
    'who',
    'which',
    'there',
    'then',
    'than',
    'into',
    'just',
    'about',
    'more',
    'some',
    'them',
    'him',
]);

// ─── Core Functions ────────────────────────────────────────

/** Split text into words (alphabetic tokens, preserving apostrophes/hyphens) */
function tokenizeWords(text: string): string[] {
    return text
        .split(/\s+/)
        .map(w => w.replace(/[^a-zA-Z'-]/g, ''))
        .filter(w => w.length > 0);
}

/** Split text into sentences (delimited by .!?) */
function tokenizeSentences(text: string): string[] {
    return text
        .split(/[.!?]+(?:\s|$)/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

/** Split text into paragraphs (delimited by blank lines) */
function tokenizeParagraphs(text: string): string[] {
    return text
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0);
}

/**
 * Compute the top N most frequent non-stop-words in the text.
 */
export function getTopWords(words: string[], n: number = 10): WordFrequency[] {
    const freq = new Map<string, number>();

    for (const word of words) {
        const lower = word.toLowerCase();
        if (lower.length <= 1 || STOP_WORDS.has(lower)) continue;
        freq.set(lower, (freq.get(lower) ?? 0) + 1);
    }

    return Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([word, count]) => ({ word, count }));
}

// ─── Main API ──────────────────────────────────────────────

/**
 * Compute comprehensive text statistics for a given passage.
 *
 * @param text - The text to analyze
 * @param topWordCount - Number of top words to return (default 10)
 * @returns TextStatistics object with all computed metrics
 */
export function computeTextStatistics(text: string, topWordCount: number = 10): TextStatistics {
    const words = tokenizeWords(text);
    const sentences = tokenizeSentences(text);
    const paragraphs = tokenizeParagraphs(text);

    const wordCount = words.length;
    const sentenceCount = Math.max(1, sentences.length);

    // Character counts
    const characterCount = text.length;
    const characterCountNoSpaces = text.replace(/\s/g, '').length;

    // Time estimates
    const readingTimeMinutes = Math.round((wordCount / READING_WPM) * 10) / 10;
    const speakingTimeMinutes = Math.round((wordCount / SPEAKING_WPM) * 10) / 10;

    // Averages
    const totalWordLen = words.reduce((sum, w) => sum + w.length, 0);
    const avgWordLength = wordCount > 0 ? Math.round((totalWordLen / wordCount) * 10) / 10 : 0;
    const avgSentenceLength = Math.round((wordCount / sentenceCount) * 10) / 10;

    // Longest word
    const longestWord = words.reduce((longest, w) => (w.length > longest.length ? w : longest), '');

    // Unique word ratio
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    const uniqueWordPercentage =
        wordCount > 0 ? Math.round((uniqueWords.size / wordCount) * 1000) / 10 : 0;

    // Top words
    const topWords = getTopWords(words, topWordCount);

    return {
        characterCount,
        characterCountNoSpaces,
        wordCount,
        sentenceCount,
        paragraphCount: paragraphs.length,
        readingTimeMinutes,
        speakingTimeMinutes,
        avgWordLength,
        avgSentenceLength,
        longestWord,
        uniqueWordPercentage,
        topWords,
    };
}
