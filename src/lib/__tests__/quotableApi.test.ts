/**
 * quotableApi.test.ts — Tests for Quotable API Client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRandomQuote, getQuote, getOfflineQuote } from '../quotableApi';

// ─── Mock fetch ────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
});

// ─── fetchRandomQuote ──────────────────────────────────────

describe('fetchRandomQuote', () => {
    it('returns a quote on success', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve([
                    {
                        content: 'Be yourself; everyone else is already taken.',
                        author: 'Oscar Wilde',
                        tags: ['wisdom'],
                    },
                ]),
        });

        const quote = await fetchRandomQuote();
        expect(quote).not.toBeNull();
        expect(quote!.content).toBe('Be yourself; everyone else is already taken.');
        expect(quote!.author).toBe('Oscar Wilde');
        expect(quote!.tags).toContain('wisdom');
    });

    it('returns null on fetch failure', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 500 });
        expect(await fetchRandomQuote()).toBeNull();
    });

    it('returns null on network error', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));
        expect(await fetchRandomQuote()).toBeNull();
    });

    it('passes tag filter to the URL', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve([{ content: 'Test quote', author: 'Author', tags: ['wisdom'] }]),
        });

        await fetchRandomQuote('wisdom');
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('tags=wisdom'));
    });

    it('handles non-array API response', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    content: 'Direct object response',
                    author: 'Author',
                    tags: [],
                }),
        });

        const quote = await fetchRandomQuote();
        expect(quote).not.toBeNull();
        expect(quote!.content).toBe('Direct object response');
    });
});

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

// ─── getQuote ──────────────────────────────────────────────

describe('getQuote', () => {
    it('returns API quote when available', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve([{ content: 'API quote', author: 'API Author', tags: [] }]),
        });

        const quote = await getQuote();
        expect(quote.content).toBe('API quote');
    });

    it('falls back to offline quote on API failure', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        const quote = await getQuote();
        expect(quote).not.toBeNull();
        expect(quote.content.length).toBeGreaterThan(0);
        expect(quote.author.length).toBeGreaterThan(0);
    });
});
