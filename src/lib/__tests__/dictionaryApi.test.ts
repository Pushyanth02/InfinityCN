/**
 * dictionaryApi.test.ts — Tests for the Free Dictionary API Client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookupWord, lookupWords } from '../dictionaryApi';

describe('dictionaryApi', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('lookupWord', () => {
        it('returns null for empty string', async () => {
            const result = await lookupWord('');
            expect(result).toBeNull();
        });

        it('returns null for whitespace-only input', async () => {
            const result = await lookupWord('   ');
            expect(result).toBeNull();
        });

        it('returns null when fetch fails', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

            const result = await lookupWord('hello');
            expect(result).toBeNull();
        });

        it('returns null when word is not found (404)', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue({
                    ok: false,
                    status: 404,
                }),
            );

            const result = await lookupWord('xyznonexistent');
            expect(result).toBeNull();
        });

        it('parses valid API response', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue({
                    ok: true,
                    json: () =>
                        Promise.resolve([
                            {
                                word: 'test',
                                phonetic: '/tɛst/',
                                meanings: [
                                    {
                                        partOfSpeech: 'noun',
                                        definitions: [
                                            {
                                                definition: 'A procedure for assessment.',
                                                example: 'She took a test.',
                                            },
                                        ],
                                        synonyms: ['exam', 'trial'],
                                    },
                                ],
                            },
                        ]),
                }),
            );

            const result = await lookupWord('test');
            expect(result).not.toBeNull();
            expect(result!.word).toBe('test');
            expect(result!.phonetic).toBe('/tɛst/');
            expect(result!.meanings).toHaveLength(1);
            expect(result!.meanings[0].partOfSpeech).toBe('noun');
            expect(result!.meanings[0].definitions[0].definition).toBe(
                'A procedure for assessment.',
            );
            expect(result!.meanings[0].synonyms).toContain('exam');
        });

        it('normalises word to lowercase', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve([
                        {
                            word: 'hello',
                            meanings: [
                                {
                                    partOfSpeech: 'exclamation',
                                    definitions: [{ definition: 'A greeting.' }],
                                },
                            ],
                        },
                    ]),
            });
            vi.stubGlobal('fetch', mockFetch);

            await lookupWord('HELLO');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/hello'),
                expect.anything(),
            );
        });

        it('uses cache on second call', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve([
                        {
                            word: 'cached',
                            meanings: [
                                {
                                    partOfSpeech: 'adjective',
                                    definitions: [{ definition: 'Stored in cache.' }],
                                },
                            ],
                        },
                    ]),
            });
            vi.stubGlobal('fetch', mockFetch);

            const first = await lookupWord('cached');
            const second = await lookupWord('cached');

            expect(first).toEqual(second);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('handles empty meanings array', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue({
                    ok: true,
                    json: () =>
                        Promise.resolve([
                            {
                                word: 'unknown',
                                meanings: [],
                            },
                        ]),
                }),
            );

            const result = await lookupWord('unknown');
            expect(result).not.toBeNull();
            expect(result!.meanings).toEqual([]);
        });
    });

    describe('lookupWords', () => {
        it('returns empty map for empty array', async () => {
            const result = await lookupWords([]);
            expect(result.size).toBe(0);
        });

        it('deduplicates words', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve([
                        {
                            word: 'deduped',
                            meanings: [
                                {
                                    partOfSpeech: 'exclamation',
                                    definitions: [{ definition: 'A greeting.' }],
                                },
                            ],
                        },
                    ]),
            });
            vi.stubGlobal('fetch', mockFetch);

            await lookupWords(['deduped', 'DEDUPED', 'Deduped']);
            // Should only call fetch once due to deduplication + cache
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('handles mixed found and not-found words', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockImplementation((url: string) => {
                    if (url.includes('/found')) {
                        return Promise.resolve({
                            ok: true,
                            json: () =>
                                Promise.resolve([
                                    {
                                        word: 'found',
                                        meanings: [
                                            {
                                                partOfSpeech: 'verb',
                                                definitions: [{ definition: 'Discovered.' }],
                                            },
                                        ],
                                    },
                                ]),
                        });
                    }
                    return Promise.resolve({ ok: false, status: 404 });
                }),
            );

            const result = await lookupWords(['found', 'notfound']);
            expect(result.has('found')).toBe(true);
            expect(result.has('notfound')).toBe(false);
        });
    });
});
