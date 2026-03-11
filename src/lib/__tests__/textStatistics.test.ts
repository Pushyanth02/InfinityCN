/**
 * textStatistics.test.ts — Tests for the Text Statistics Engine
 */

import { describe, it, expect } from 'vitest';
import { computeTextStatistics } from '../textStatistics';

describe('computeTextStatistics', () => {
    // ─── Empty / Edge Cases ─────────────────────────────────

    it('returns zero stats for empty string', () => {
        const stats = computeTextStatistics('');
        expect(stats.wordCount).toBe(0);
        expect(stats.sentenceCount).toBe(0);
        expect(stats.paragraphCount).toBe(0);
        expect(stats.characterCount).toBe(0);
        expect(stats.avgWordsPerSentence).toBe(0);
        expect(stats.avgWordLength).toBe(0);
        expect(stats.vocabularyDiversity).toBe(0);
        expect(stats.dialoguePercent).toBe(0);
        expect(stats.readingTime.average).toBe(0);
        expect(stats.topWords).toEqual([]);
    });

    it('returns zero stats for whitespace-only string', () => {
        const stats = computeTextStatistics('   \n\n   ');
        expect(stats.wordCount).toBe(0);
    });

    // ─── Word Counting ──────────────────────────────────────

    it('counts words accurately', () => {
        const stats = computeTextStatistics('The quick brown fox jumps.');
        expect(stats.wordCount).toBe(5);
    });

    it('does not inflate word count on extra whitespace', () => {
        const stats = computeTextStatistics('  hello   world  ');
        expect(stats.wordCount).toBe(2);
    });

    // ─── Sentence Counting ──────────────────────────────────

    it('counts sentences', () => {
        const stats = computeTextStatistics('Hello world. How are you? I am fine!');
        expect(stats.sentenceCount).toBeGreaterThanOrEqual(3);
    });

    // ─── Paragraph Counting ─────────────────────────────────

    it('counts paragraphs separated by double newlines', () => {
        const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
        const stats = computeTextStatistics(text);
        expect(stats.paragraphCount).toBe(3);
    });

    it('counts single paragraph with no breaks', () => {
        const stats = computeTextStatistics('Just one paragraph here.');
        expect(stats.paragraphCount).toBe(1);
    });

    // ─── Character Count ────────────────────────────────────

    it('character count excludes whitespace', () => {
        const stats = computeTextStatistics('ab cd');
        expect(stats.characterCount).toBe(4); // 'a','b','c','d'
    });

    // ─── Vocabulary Diversity ───────────────────────────────

    it('vocabulary diversity is 1.0 when all words are unique', () => {
        const stats = computeTextStatistics('apple banana cherry');
        expect(stats.vocabularyDiversity).toBe(1);
    });

    it('vocabulary diversity is less than 1 with repeated words', () => {
        const stats = computeTextStatistics('the the the same same');
        expect(stats.vocabularyDiversity).toBeLessThan(1);
    });

    // ─── Dialogue Detection ─────────────────────────────────

    it('detects dialogue percentage', () => {
        const text = 'He walked in. "Hello there," he said. She nodded.';
        const stats = computeTextStatistics(text);
        expect(stats.dialoguePercent).toBeGreaterThan(0);
    });

    it('dialoguePercent is 0 when no quotes present', () => {
        const stats = computeTextStatistics('No dialogue in this text at all.');
        expect(stats.dialoguePercent).toBe(0);
    });

    // ─── Reading Time ───────────────────────────────────────

    it('estimates reading time', () => {
        // ~250 words should take ~1 min at average speed
        const words = 'word '.repeat(250);
        const stats = computeTextStatistics(words);
        expect(stats.readingTime.average).toBe(1);
        expect(stats.readingTime.slow).toBeGreaterThan(stats.readingTime.average);
        expect(stats.readingTime.fast).toBeLessThanOrEqual(stats.readingTime.average);
    });

    // ─── Top Words ──────────────────────────────────────────

    it('excludes stop words from top words', () => {
        const text = 'the the the cat cat sat sat on the the mat mat';
        const stats = computeTextStatistics(text);
        const topWordTexts = stats.topWords.map(w => w.word);
        expect(topWordTexts).not.toContain('the');
        expect(topWordTexts).not.toContain('on');
        // 'cat', 'sat', 'mat' should appear
        expect(topWordTexts).toContain('cat');
        expect(topWordTexts).toContain('sat');
        expect(topWordTexts).toContain('mat');
    });

    it('returns at most 10 top words', () => {
        // Create text with 15 unique content words repeated
        const words = Array.from({ length: 15 }, (_, i) => `word${i}abc`);
        const text = words.join(' ') + ' ' + words.join(' ');
        const stats = computeTextStatistics(text);
        expect(stats.topWords.length).toBeLessThanOrEqual(10);
    });

    it('top words are sorted by frequency descending', () => {
        const text = 'dragon dragon dragon knight knight sword';
        const stats = computeTextStatistics(text);
        for (let i = 1; i < stats.topWords.length; i++) {
            expect(stats.topWords[i - 1].count).toBeGreaterThanOrEqual(stats.topWords[i].count);
        }
    });

    // ─── Average Metrics ────────────────────────────────────

    it('computes average words per sentence', () => {
        const stats = computeTextStatistics('One two three. Four five six.');
        expect(stats.avgWordsPerSentence).toBeGreaterThan(0);
    });

    it('computes average word length', () => {
        const stats = computeTextStatistics('cat dog');
        expect(stats.avgWordLength).toBe(3);
    });
});
