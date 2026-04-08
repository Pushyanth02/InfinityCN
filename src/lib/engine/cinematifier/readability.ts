/**
 * readability.ts — Readability Analysis Engine
 *
 * Provides text readability scoring using industry-standard formulas:
 *   • Flesch-Kincaid Reading Ease (0–100)
 *   • Flesch-Kincaid Grade Level
 *   • Sentence complexity analysis
 *   • Vocabulary diversity (type-token ratio)
 *
 * All computation is pure math — no AI or external dependencies.
 * Designed to run as a pipeline stage enriching cinematification metadata.
 */

// ─── Syllable Counter ──────────────────────────────────────

/**
 * Estimate syllable count for an English word using heuristics.
 * Based on the "vowel group" method with common adjustments.
 */
export function countSyllables(word: string): number {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 2) return 1;

    // Count vowel groups
    const vowelGroups = w.match(/[aeiouy]+/g);
    let count = vowelGroups ? vowelGroups.length : 1;

    // Subtract silent 'e' at end (except "le" endings like "table")
    if (w.endsWith('e') && !w.endsWith('le') && count > 1) {
        count--;
    }

    // Common suffixes that don't add syllables
    if (w.endsWith('ed') && count > 1 && !/[dt]ed$/.test(w)) {
        count--;
    }

    // Ensure at least 1 syllable
    return Math.max(1, count);
}

// ─── Text Tokenization ─────────────────────────────────────

/** Split text into sentences using common boundary patterns */
export function splitSentences(text: string): string[] {
    return text
        .split(/[.!?]+(?:\s|$)/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

/** Split text into words (non-empty, alphabetic tokens) */
export function splitWords(text: string): string[] {
    return text
        .split(/\s+/)
        .map(w => w.replace(/[^a-zA-Z'-]/g, ''))
        .filter(w => w.length > 0);
}

// ─── Readability Metrics ────────────────────────────────────

export interface ReadabilityMetrics {
    /** Flesch Reading Ease score (0–100, higher = easier) */
    fleschReadingEase: number;
    /** Flesch-Kincaid Grade Level (US school grade) */
    fleschKincaidGrade: number;
    /** Average words per sentence */
    avgWordsPerSentence: number;
    /** Average syllables per word */
    avgSyllablesPerWord: number;
    /** Type-token ratio: unique words / total words (0–1, higher = more diverse vocabulary) */
    vocabularyDiversity: number;
    /** Total word count */
    wordCount: number;
    /** Total sentence count */
    sentenceCount: number;
    /** Percentage of "complex" words (3+ syllables) */
    complexWordPercentage: number;
    /** Human-readable difficulty label */
    difficultyLabel: ReadabilityLevel;
}

export type ReadabilityLevel =
    | 'very_easy'
    | 'easy'
    | 'fairly_easy'
    | 'standard'
    | 'fairly_difficult'
    | 'difficult'
    | 'very_difficult';

/**
 * Map Flesch Reading Ease score to a human-readable label.
 */
export function getDifficultyLabel(fleschScore: number): ReadabilityLevel {
    if (fleschScore >= 90) return 'very_easy';
    if (fleschScore >= 80) return 'easy';
    if (fleschScore >= 70) return 'fairly_easy';
    if (fleschScore >= 60) return 'standard';
    if (fleschScore >= 50) return 'fairly_difficult';
    if (fleschScore >= 30) return 'difficult';
    return 'very_difficult';
}

/**
 * Compute comprehensive readability metrics for a text passage.
 *
 * Uses the Flesch-Kincaid formulas:
 *   Reading Ease = 206.835 − 1.015 × (words/sentences) − 84.6 × (syllables/words)
 *   Grade Level  = 0.39 × (words/sentences) + 11.8 × (syllables/words) − 15.59
 */
export function analyzeReadability(text: string): ReadabilityMetrics {
    const sentences = splitSentences(text);
    const words = splitWords(text);

    const sentenceCount = Math.max(1, sentences.length);
    const wordCount = Math.max(1, words.length);

    // Count syllables
    let totalSyllables = 0;
    let complexWords = 0;
    const uniqueWords = new Set<string>();

    for (const word of words) {
        const syllables = countSyllables(word);
        totalSyllables += syllables;
        if (syllables >= 3) complexWords++;
        uniqueWords.add(word.toLowerCase());
    }

    const avgWordsPerSentence = wordCount / sentenceCount;
    const avgSyllablesPerWord = totalSyllables / wordCount;

    // Flesch Reading Ease
    const fleschReadingEase = Math.max(
        0,
        Math.min(
            100,
            Math.round((206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord) * 10) /
                10,
        ),
    );

    // Flesch-Kincaid Grade Level
    const fleschKincaidGrade =
        Math.round((0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59) * 10) / 10;

    // Vocabulary diversity (type-token ratio)
    const vocabularyDiversity = Math.round((uniqueWords.size / wordCount) * 1000) / 1000;

    // Complex word percentage
    const complexWordPercentage = Math.round((complexWords / wordCount) * 1000) / 10;

    return {
        fleschReadingEase,
        fleschKincaidGrade: Math.max(0, fleschKincaidGrade),
        avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
        avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 100) / 100,
        vocabularyDiversity,
        wordCount,
        sentenceCount,
        complexWordPercentage,
        difficultyLabel: getDifficultyLabel(fleschReadingEase),
    };
}
