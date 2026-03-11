/**
 * quotableApi.test.ts — Tests for the Literary Quote API Client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchQuotes, getRandomQuote, getOfflineQuote } from '../quotableApi';

describe('quotableApi', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('getOfflineQuote', () => {
        it('returns a quote with content and author', () => {
            const quote = getOfflineQuote();
            expect(quote).toHaveProperty('content');
            expect(quote).toHaveProperty('author');
            expect(quote).toHaveProperty('tags');
            expect(quote.content.length).toBeGreaterThan(0);
            expect(quote.author.length).toBeGreaterThan(0);
        });

        it('returns different quotes on repeated calls (eventually)', () => {
            const quotes = new Set<string>();
            for (let i = 0; i < 50; i++) {
                quotes.add(getOfflineQuote().content);
            }
            // Should have gotten at least 2 different quotes out of 50 tries
            expect(quotes.size).toBeGreaterThan(1);
        });
    });

    describe('fetchQuotes', () => {
        it('returns fallback quotes when fetch fails', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

            const quotes = await fetchQuotes('inspirational');
            expect(quotes.length).toBeGreaterThan(0);
            expect(quotes[0]).toHaveProperty('content');
            expect(quotes[0]).toHaveProperty('author');
        });

        it('returns fallback quotes when response is not ok', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue({
                    ok: false,
                    status: 500,
                }),
            );

            const quotes = await fetchQuotes('wisdom');
            expect(quotes.length).toBeGreaterThan(0);
        });

        it('parses valid API response', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            results: [
                                {
                                    content: 'Test quote content',
                                    author: 'Test Author',
                                    tags: ['test'],
                                },
                            ],
                            totalCount: 1,
                        }),
                }),
            );

            const quotes = await fetchQuotes('test');
            expect(quotes).toHaveLength(1);
            expect(quotes[0].content).toBe('Test quote content');
            expect(quotes[0].author).toBe('Test Author');
        });

        it('uses cached results on second call', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        results: [{ content: 'Cached quote', author: 'Cache Author', tags: [] }],
                        totalCount: 1,
                    }),
            });
            vi.stubGlobal('fetch', mockFetch);

            const first = await fetchQuotes('cache-test');
            const second = await fetchQuotes('cache-test');

            expect(first).toEqual(second);
            expect(mockFetch).toHaveBeenCalledTimes(1); // Only fetched once
        });
    });

    describe('getRandomQuote', () => {
        it('returns a single quote when fetch fails', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));

            const quote = await getRandomQuote();
            expect(quote).toHaveProperty('content');
            expect(quote).toHaveProperty('author');
        });
    });
});
