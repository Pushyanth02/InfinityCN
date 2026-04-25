/**
 * sentimentTracker.test.ts — Tests for the Sentiment Flow Tracker
 */

import { describe, it, expect } from 'vitest';
import {
    analyzeSentiment,
    analyzeSentimentFlow,
    scoreToEmotion,
} from '../engine/cinematifier/sentimentTracker';

// ─── scoreToEmotion ────────────────────────────────────────

describe('scoreToEmotion', () => {
    it('maps positive scores to joy', () => {
        expect(scoreToEmotion(0.5)).toBe('joy');
        expect(scoreToEmotion(0.3)).toBe('joy');
    });

    it('maps slight positive to surprise', () => {
        expect(scoreToEmotion(0.15)).toBe('surprise');
    });

    it('maps neutral to neutral', () => {
        expect(scoreToEmotion(0)).toBe('neutral');
        expect(scoreToEmotion(0.05)).toBe('neutral');
        expect(scoreToEmotion(-0.05)).toBe('neutral');
    });

    it('maps negative scores to sadness/fear', () => {
        expect(scoreToEmotion(-0.3)).toBe('sadness');
        expect(scoreToEmotion(-0.5)).toBe('fear');
    });

    it('maps slightly negative to anger', () => {
        expect(scoreToEmotion(-0.15)).toBe('anger');
    });
});

// ─── analyzeSentiment ──────────────────────────────────────

describe('analyzeSentiment', () => {
    it('returns positive sentiment for happy text', () => {
        const result = analyzeSentiment('I love this wonderful beautiful day');
        expect(result.score).toBeGreaterThan(0);
        expect(result.emotion).toBe('joy');
    });

    it('returns negative sentiment for sad text', () => {
        const result = analyzeSentiment('This is horrible and terrible pain and suffering');
        expect(result.score).toBeLessThan(0);
        expect(['fear', 'sadness', 'anger']).toContain(result.emotion);
    });

    it('returns near-neutral for neutral text', () => {
        const result = analyzeSentiment('The table is in the room next to the window');
        expect(Math.abs(result.score)).toBeLessThan(0.5);
    });

    it('handles negation', () => {
        const positive = analyzeSentiment('I love this');
        const negated = analyzeSentiment('I do not love this');
        expect(negated.score).toBeLessThan(positive.score);
    });

    it('handles intensifiers', () => {
        const normal = analyzeSentiment('It was good');
        const intensified = analyzeSentiment('It was very good');
        expect(intensified.rawScore).toBeGreaterThan(normal.rawScore);
    });

    it('returns confidence between 0 and 1', () => {
        const result = analyzeSentiment('I love this beautiful amazing wonderful day');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('normalizes score between -1 and 1', () => {
        const veryPositive = analyzeSentiment(
            'love joy happy wonderful amazing beautiful great triumph victory',
        );
        const veryNegative = analyzeSentiment(
            'hate death murder torture agony horror terror nightmare evil',
        );
        expect(veryPositive.score).toBeLessThanOrEqual(1);
        expect(veryPositive.score).toBeGreaterThanOrEqual(-1);
        expect(veryNegative.score).toBeLessThanOrEqual(1);
        expect(veryNegative.score).toBeGreaterThanOrEqual(-1);
    });

    it('handles empty text', () => {
        const result = analyzeSentiment('');
        expect(result.score).toBe(0);
        expect(result.emotion).toBe('neutral');
    });

    it('detects stemmed words', () => {
        const result = analyzeSentiment('She was feeling joyful and loving');
        // "joyful" should stem to "joy", "loving" to "lov" (→ "love")
        expect(result.sentimentWordCount).toBeGreaterThan(0);
    });
});

// ─── analyzeSentimentFlow ──────────────────────────────────

describe('analyzeSentimentFlow', () => {
    it('returns flow array with one entry per sentence', () => {
        const text = 'I love sunshine. The storm was scary. Everything is fine.';
        const result = analyzeSentimentFlow(text);
        expect(result.flow).toHaveLength(3);
    });

    it('detects emotional shifts', () => {
        const text =
            'Joy and happiness filled the room. Then horror struck like lightning. Peace returned slowly.';
        const result = analyzeSentimentFlow(text);
        expect(result.shiftCount).toBeGreaterThan(0);
    });

    it('computes emotional range', () => {
        const text = 'I love this beautiful day. This horrible nightmare destroyed everything.';
        const result = analyzeSentimentFlow(text);
        expect(result.emotionalRange).toBeGreaterThan(0);
    });

    it('finds dominant emotion', () => {
        const text = 'Love is wonderful. Joy fills the air. Happiness abounds. Beautiful day.';
        const result = analyzeSentimentFlow(text);
        expect(result.dominantEmotion).not.toBe('fear');
    });

    it('handles empty text', () => {
        const result = analyzeSentimentFlow('');
        expect(result.flow).toHaveLength(0);
        expect(result.shiftCount).toBe(0);
    });

    it('returns overall sentiment', () => {
        const result = analyzeSentimentFlow('This is a great wonderful day.');
        expect(result.overall).toHaveProperty('score');
        expect(result.overall).toHaveProperty('emotion');
        expect(result.overall).toHaveProperty('confidence');
    });

    it('flow points have correct structure', () => {
        const result = analyzeSentimentFlow('Happy day. Sad night.');
        for (const point of result.flow) {
            expect(point).toHaveProperty('index');
            expect(point).toHaveProperty('score');
            expect(point).toHaveProperty('emotion');
            expect(point).toHaveProperty('isShift');
        }
    });
});
