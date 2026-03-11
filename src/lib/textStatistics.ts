/**
 * textStatistics.ts — Advanced Text Statistics Engine
 *
 * Provides detailed text analysis metrics using built-in browser APIs
 * (Intl.Segmenter for proper word/sentence segmentation) for enhanced
 * readability insights and writing quality analysis.
 *
 * Features:
 *   - Accurate word, sentence, and paragraph counting
 *   - Vocabulary diversity (type-token ratio)
 *   - Average sentence/word length
 *   - Dialogue vs. narrative ratio
 *   - Estimated reading time at different speeds
 *   - Top frequent words (excluding stop words)
 */

// ─── Types ──────────────────────────────────────────────────

export interface TextStatistics {
    /** Total word count */
    wordCount: number;
    /** Total sentence count */
    sentenceCount: number;
    /** Total paragraph count */
    paragraphCount: number;
    /** Total character count (excluding whitespace) */
    characterCount: number;
    /** Average words per sentence */
    avgWordsPerSentence: number;
    /** Average characters per word */
    avgWordLength: number;
    /** Unique words / total words (0–1) — higher means more diverse vocabulary */
    vocabularyDiversity: number;
    /** Percentage of text that is dialogue (0–100) */
    dialoguePercent: number;
    /** Estimated reading time in minutes at different speeds */
    readingTime: {
        slow: number; // 150 WPM
        average: number; // 250 WPM
        fast: number; // 400 WPM
    };
    /** Top 10 most frequent content words */
    topWords: Array<{ word: string; count: number }>;
}

// ─── Stop Words ──────────────────────────────────────────────

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
    'was',
    'are',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'shall',
    'can',
    'it',
    'its',
    'i',
    'he',
    'she',
    'we',
    'they',
    'you',
    'me',
    'him',
    'her',
    'us',
    'them',
    'my',
    'his',
    'your',
    'our',
    'their',
    'this',
    'that',
    'these',
    'those',
    'not',
    'no',
    'so',
    'if',
    'as',
    'from',
    'up',
    'out',
    'about',
    'into',
    'than',
    'then',
    'just',
    'also',
    'very',
    'all',
    'any',
    'each',
    'more',
    'some',
    'such',
    'only',
    'other',
    'new',
    'when',
    'what',
    'which',
    'who',
    'how',
    'where',
    'there',
    'here',
]);

// ─── Core Analysis ───────────────────────────────────────────

/**
 * Tokenise text into words using Intl.Segmenter if available, fallback to regex.
 */
function tokeniseWords(text: string): string[] {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
        const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
        return [...segmenter.segment(text)]
            .filter(s => s.isWordLike)
            .map(s => s.segment.toLowerCase());
    }
    // Fallback
    return text
        .toLowerCase()
        .split(/\s+/)
        .filter(w => /[a-z]/.test(w))
        .map(w => w.replace(/^[^a-z]+|[^a-z]+$/g, ''));
}

/**
 * Split text into sentences.
 */
function splitSentences(text: string): string[] {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
        const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
        return [...segmenter.segment(text)].map(s => s.segment.trim()).filter(s => s.length > 0);
    }
    // Fallback: split on sentence-ending punctuation
    return text
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

/**
 * Compute comprehensive text statistics.
 *
 * @param text - Raw input text to analyse
 * @returns TextStatistics object with all computed metrics
 */
export function computeTextStatistics(text: string): TextStatistics {
    if (!text || !text.trim()) {
        return {
            wordCount: 0,
            sentenceCount: 0,
            paragraphCount: 0,
            characterCount: 0,
            avgWordsPerSentence: 0,
            avgWordLength: 0,
            vocabularyDiversity: 0,
            dialoguePercent: 0,
            readingTime: { slow: 0, average: 0, fast: 0 },
            topWords: [],
        };
    }

    const words = tokeniseWords(text);
    const sentences = splitSentences(text);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    const wordCount = words.length;
    const sentenceCount = Math.max(sentences.length, 1);
    const characterCount = text.replace(/\s/g, '').length;

    // Vocabulary diversity (type-token ratio)
    const uniqueWords = new Set(words);
    const vocabularyDiversity = wordCount > 0 ? uniqueWords.size / wordCount : 0;

    // Average word length
    const totalChars = words.reduce((acc, w) => acc + w.length, 0);
    const avgWordLength = wordCount > 0 ? totalChars / wordCount : 0;

    // Dialogue detection: count characters inside quotes
    const dialogueMatches = text.match(/"[^"]*"|"[^"]*"/g) || [];
    const dialogueChars = dialogueMatches.reduce((acc, m) => acc + m.length, 0);
    const dialoguePercent = characterCount > 0 ? (dialogueChars / characterCount) * 100 : 0;

    // Reading time
    const readingTime = {
        slow: Math.ceil(wordCount / 150),
        average: Math.ceil(wordCount / 250),
        fast: Math.ceil(wordCount / 400),
    };

    // Top words (excluding stop words)
    const wordFreq = new Map<string, number>();
    for (const w of words) {
        if (w.length > 2 && !STOP_WORDS.has(w)) {
            wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
        }
    }
    const topWords = [...wordFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, count]) => ({ word, count }));

    return {
        wordCount,
        sentenceCount,
        paragraphCount: paragraphs.length,
        characterCount,
        avgWordsPerSentence: Math.round((wordCount / sentenceCount) * 10) / 10,
        avgWordLength: Math.round(avgWordLength * 10) / 10,
        vocabularyDiversity: Math.round(vocabularyDiversity * 1000) / 1000,
        dialoguePercent: Math.round(dialoguePercent * 10) / 10,
        readingTime,
        topWords,
    };
}
