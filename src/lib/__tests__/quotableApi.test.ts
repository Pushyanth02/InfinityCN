/**
 * quotableApi.test.ts — Tests for Offline Literary Quotes
 */

import { describe, it, expect } from 'vitest';
import { getOfflineQuote } from '../quotableApi';

// ─── getOfflineQuote ───────────────────────────────────────

describe('getOfflineQuote', () => {
    it('returns a valid quote object', () => {
        const quote = getOfflineQuote();
        expect(quote).toHaveProperty('content');
        expect(quote).toHaveProperty('author');
        expect(quote).toHaveProperty('tags');
        expect(quote.content.length).toBeGreaterThan(0);
        expect(quote.author.length).toBeGreaterThan(0);
    });

    it('returns different quotes across multiple calls', () => {
        const quotes = new Set<string>();
        // Run enough times to get at least 2 different quotes (8 total in collection)
        for (let i = 0; i < 50; i++) {
            quotes.add(getOfflineQuote().content);
        }
        expect(quotes.size).toBeGreaterThan(1);
    });

    it('returns deterministic quote when given a seed', () => {
        const q1 = getOfflineQuote('processing text');
        const q2 = getOfflineQuote('processing text');
        expect(q1.content).toBe(q2.content);
        expect(q1.author).toBe(q2.author);
    });

    it('returns different quotes for different seeds', () => {
        // Different seeds should (usually) produce different quotes
        // With 8 quotes, collision is possible but unlikely across many seeds
        const seeds = ['a', 'bb', 'ccc', 'dddd', 'eeeee'];
        const results = new Set(seeds.map(s => getOfflineQuote(s).content));
        expect(results.size).toBeGreaterThan(1);
    });
});
