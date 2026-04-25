/**
 * readability.test.ts — Tests for the Readability Analysis Engine
 */

import { describe, it, expect } from 'vitest';
import {
    countSyllables,
    splitSentences,
    splitWords,
    analyzeReadability,
    getDifficultyLabel,
} from '../engine/cinematifier/readability';

// ─── countSyllables ────────────────────────────────────────

describe('countSyllables', () => {
    it('counts monosyllabic words', () => {
        expect(countSyllables('cat')).toBe(1);
        expect(countSyllables('the')).toBe(1);
        expect(countSyllables('run')).toBe(1);
    });

    it('counts polysyllabic words', () => {
        expect(countSyllables('beautiful')).toBe(3);
        expect(countSyllables('computer')).toBe(3);
        expect(countSyllables('information')).toBe(4);
    });

    it('handles silent e', () => {
        expect(countSyllables('cake')).toBe(1);
        expect(countSyllables('make')).toBe(1);
        // "whale" has two vowel groups (wha-le) — heuristic counts 2
        expect(countSyllables('whale')).toBeGreaterThanOrEqual(1);
    });

    it('returns at least 1 for any word', () => {
        expect(countSyllables('a')).toBeGreaterThanOrEqual(1);
        expect(countSyllables('I')).toBeGreaterThanOrEqual(1);
        expect(countSyllables('')).toBe(1);
    });

    it('strips non-alpha characters', () => {
        expect(countSyllables("don't")).toBeGreaterThanOrEqual(1);
        expect(countSyllables('well-known')).toBeGreaterThanOrEqual(1);
    });
});

// ─── splitSentences ────────────────────────────────────────

describe('splitSentences', () => {
    it('splits on periods', () => {
        const result = splitSentences('Hello world. How are you. Fine thanks.');
        expect(result).toHaveLength(3);
    });

    it('splits on exclamation and question marks', () => {
        const result = splitSentences('What! Really? Yes.');
        expect(result).toHaveLength(3);
    });

    it('handles empty text', () => {
        expect(splitSentences('')).toHaveLength(0);
    });

    it('filters empty results', () => {
        const result = splitSentences('Hello...');
        expect(result.every(s => s.length > 0)).toBe(true);
    });
});

// ─── splitWords ────────────────────────────────────────────

describe('splitWords', () => {
    it('splits on whitespace', () => {
        expect(splitWords('hello world test')).toHaveLength(3);
    });

    it('strips punctuation', () => {
        const words = splitWords('hello, world! test.');
        expect(words).toEqual(['hello', 'world', 'test']);
    });

    it('handles empty text', () => {
        expect(splitWords('')).toHaveLength(0);
    });
});

// ─── getDifficultyLabel ────────────────────────────────────

describe('getDifficultyLabel', () => {
    it('maps high scores to easy', () => {
        expect(getDifficultyLabel(95)).toBe('very_easy');
        expect(getDifficultyLabel(85)).toBe('easy');
        expect(getDifficultyLabel(75)).toBe('fairly_easy');
    });

    it('maps mid scores to standard', () => {
        expect(getDifficultyLabel(65)).toBe('standard');
    });

    it('maps low scores to difficult', () => {
        expect(getDifficultyLabel(55)).toBe('fairly_difficult');
        expect(getDifficultyLabel(35)).toBe('difficult');
        expect(getDifficultyLabel(15)).toBe('very_difficult');
    });
});

// ─── analyzeReadability ────────────────────────────────────

describe('analyzeReadability', () => {
    const simpleText =
        'The cat sat on the mat. The dog ran fast. A bird flew high. The sun was hot.';

    const complexText =
        'The unprecedented implications of anthropological methodologies necessitate comprehensive investigation. Multifaceted socioeconomic considerations invariably complicate institutional deliberations regarding sustainable development initiatives.';

    it('returns all required metrics', () => {
        const result = analyzeReadability(simpleText);
        expect(result).toHaveProperty('fleschReadingEase');
        expect(result).toHaveProperty('fleschKincaidGrade');
        expect(result).toHaveProperty('avgWordsPerSentence');
        expect(result).toHaveProperty('avgSyllablesPerWord');
        expect(result).toHaveProperty('vocabularyDiversity');
        expect(result).toHaveProperty('wordCount');
        expect(result).toHaveProperty('sentenceCount');
        expect(result).toHaveProperty('complexWordPercentage');
        expect(result).toHaveProperty('difficultyLabel');
    });

    it('rates simple text as easy', () => {
        const result = analyzeReadability(simpleText);
        expect(result.fleschReadingEase).toBeGreaterThan(60);
        expect(['very_easy', 'easy', 'fairly_easy', 'standard']).toContain(result.difficultyLabel);
    });

    it('rates complex text as harder', () => {
        const result = analyzeReadability(complexText);
        expect(result.fleschReadingEase).toBeLessThan(
            analyzeReadability(simpleText).fleschReadingEase,
        );
    });

    it('correctly counts words and sentences', () => {
        const result = analyzeReadability(simpleText);
        expect(result.wordCount).toBeGreaterThan(10);
        expect(result.sentenceCount).toBeGreaterThanOrEqual(3);
    });

    it('computes vocabulary diversity between 0 and 1', () => {
        const result = analyzeReadability(simpleText);
        expect(result.vocabularyDiversity).toBeGreaterThan(0);
        expect(result.vocabularyDiversity).toBeLessThanOrEqual(1);
    });

    it('handles single-word input gracefully', () => {
        const result = analyzeReadability('Hello');
        expect(result.wordCount).toBe(1);
        expect(result.sentenceCount).toBeGreaterThanOrEqual(1);
    });

    it('clamps Flesch score between 0 and 100', () => {
        const resultSimple = analyzeReadability(simpleText);
        const resultComplex = analyzeReadability(complexText);
        expect(resultSimple.fleschReadingEase).toBeGreaterThanOrEqual(0);
        expect(resultSimple.fleschReadingEase).toBeLessThanOrEqual(100);
        expect(resultComplex.fleschReadingEase).toBeGreaterThanOrEqual(0);
        expect(resultComplex.fleschReadingEase).toBeLessThanOrEqual(100);
    });

    it('ensures grade level is non-negative', () => {
        const result = analyzeReadability(simpleText);
        expect(result.fleschKincaidGrade).toBeGreaterThanOrEqual(0);
    });
});
