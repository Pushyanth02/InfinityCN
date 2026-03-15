/**
 * textStatistics.test.ts — Tests for Text Statistics API
 */

import { describe, it, expect } from 'vitest';
import { computeTextStatistics, getTopWords } from '../textStatistics';

// ─── computeTextStatistics ─────────────────────────────────

describe('computeTextStatistics', () => {
    const sampleText =
        'The quick brown fox jumps over the lazy dog. The dog barked loudly. The fox ran away quickly.';

    it('returns all required fields', () => {
        const stats = computeTextStatistics(sampleText);
        expect(stats).toHaveProperty('characterCount');
        expect(stats).toHaveProperty('characterCountNoSpaces');
        expect(stats).toHaveProperty('wordCount');
        expect(stats).toHaveProperty('sentenceCount');
        expect(stats).toHaveProperty('paragraphCount');
        expect(stats).toHaveProperty('readingTimeMinutes');
        expect(stats).toHaveProperty('speakingTimeMinutes');
        expect(stats).toHaveProperty('avgWordLength');
        expect(stats).toHaveProperty('avgSentenceLength');
        expect(stats).toHaveProperty('longestWord');
        expect(stats).toHaveProperty('uniqueWordPercentage');
        expect(stats).toHaveProperty('topWords');
    });

    it('counts characters correctly', () => {
        const stats = computeTextStatistics('hello world');
        expect(stats.characterCount).toBe(11);
        expect(stats.characterCountNoSpaces).toBe(10);
    });

    it('counts words correctly', () => {
        const stats = computeTextStatistics(sampleText);
        expect(stats.wordCount).toBe(18);
    });

    it('counts sentences correctly', () => {
        const stats = computeTextStatistics(sampleText);
        expect(stats.sentenceCount).toBe(3);
    });

    it('counts paragraphs correctly', () => {
        const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
        const stats = computeTextStatistics(text);
        expect(stats.paragraphCount).toBe(3);
    });

    it('computes reading and speaking time', () => {
        // 238 wpm reading, 150 wpm speaking
        const stats = computeTextStatistics(sampleText);
        expect(stats.readingTimeMinutes).toBeGreaterThanOrEqual(0);
        expect(stats.speakingTimeMinutes).toBeGreaterThanOrEqual(stats.readingTimeMinutes);
    });

    it('computes average word length', () => {
        const stats = computeTextStatistics('hi there everyone');
        expect(stats.avgWordLength).toBeGreaterThan(0);
    });

    it('finds the longest word', () => {
        const stats = computeTextStatistics(sampleText);
        expect(stats.longestWord).toBe('quickly');
    });

    it('computes unique word percentage between 0 and 100', () => {
        const stats = computeTextStatistics(sampleText);
        expect(stats.uniqueWordPercentage).toBeGreaterThan(0);
        expect(stats.uniqueWordPercentage).toBeLessThanOrEqual(100);
    });

    it('handles empty text gracefully', () => {
        const stats = computeTextStatistics('');
        expect(stats.wordCount).toBe(0);
        expect(stats.characterCount).toBe(0);
        expect(stats.readingTimeMinutes).toBe(0);
    });

    it('handles single-word text', () => {
        const stats = computeTextStatistics('Hello');
        expect(stats.wordCount).toBe(1);
        expect(stats.sentenceCount).toBeGreaterThanOrEqual(1);
    });
});

// ─── getTopWords ───────────────────────────────────────────

describe('getTopWords', () => {
    it('returns most frequent non-stop words', () => {
        const words = ['cat', 'the', 'cat', 'dog', 'a', 'cat', 'dog', 'bird'];
        const top = getTopWords(words, 3);
        expect(top[0].word).toBe('cat');
        expect(top[0].count).toBe(3);
        expect(top[1].word).toBe('dog');
        expect(top[1].count).toBe(2);
    });

    it('excludes stop words', () => {
        const words = ['the', 'the', 'the', 'is', 'a', 'cat'];
        const top = getTopWords(words);
        const topWordsSet = top.map(t => t.word);
        expect(topWordsSet).not.toContain('the');
        expect(topWordsSet).not.toContain('is');
        expect(topWordsSet).toContain('cat');
    });

    it('respects the limit parameter', () => {
        const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
        const top = getTopWords(words, 2);
        expect(top).toHaveLength(2);
    });

    it('handles empty input', () => {
        expect(getTopWords([])).toHaveLength(0);
    });
});
