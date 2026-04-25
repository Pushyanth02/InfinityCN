/**
 * quotableApi.test.ts — Tests for Offline Literary Quotes
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearProcessingQuoteCache, getOfflineQuote, getProcessingQuote } from '../runtime/quotableApi';

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

// ─── getProcessingQuote ───────────────────────────────────

describe('getProcessingQuote', () => {
    beforeEach(() => {
        clearProcessingQuoteCache();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('prefers free network quote APIs when available', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ quote: 'Read with courage.', author: 'A. Reader' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const quote = await getProcessingQuote('network-seed', {
            allowNetwork: true,
            timeoutMs: 1500,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(quote.content).toBe('Read with courage.');
        expect(quote.author).toBe('A. Reader');
        expect(quote.source).toBe('dummyjson');
    });

    it('falls back to offline quotes when network calls fail', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('Network unavailable'));
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const quote = await getProcessingQuote('offline-seed', {
            allowNetwork: true,
            timeoutMs: 1200,
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(quote.source).toBe('offline');
        expect(quote.content.length).toBeGreaterThan(0);
        expect(quote.author.length).toBeGreaterThan(0);
    });

    it('reuses cached network quote results within cache TTL', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ quote: 'One page at a time.', author: 'M. Story' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const first = await getProcessingQuote(undefined, { allowNetwork: true });
        const second = await getProcessingQuote(undefined, { allowNetwork: true });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(second).toEqual(first);
    });
});
