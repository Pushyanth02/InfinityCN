import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearReaderApiCaches,
    fetchReaderBookSuggestions,
    lookupReaderWordInsight,
} from '../runtime/readerApis';

describe('readerApis', () => {
    beforeEach(() => {
        clearReaderApiCaches();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('builds word insight from dictionary and related-word APIs', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);

            if (url.includes('dictionaryapi.dev')) {
                return new Response(
                    JSON.stringify([
                        {
                            word: 'noir',
                            phonetic: '/nwahr/',
                            meanings: [
                                {
                                    partOfSpeech: 'noun',
                                    definitions: [
                                        {
                                            definition:
                                                'A style marked by cynical characters and stark contrast.',
                                        },
                                    ],
                                },
                            ],
                        },
                    ]),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }

            if (url.includes('api.datamuse.com')) {
                return new Response(
                    JSON.stringify([{ word: 'shadowy' }, { word: 'dark' }, { word: 'grim' }]),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }

            return new Response('Not found', { status: 404 });
        });

        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const result = await lookupReaderWordInsight('Noir');

        expect(result).not.toBeNull();
        expect(result?.word).toBe('noir');
        expect(result?.phonetic).toBe('/nwahr/');
        expect(result?.meanings.length).toBeGreaterThan(0);
        expect(result?.relatedWords).toContain('shadowy');
        expect(result?.sources).toContain('dictionaryapi');
        expect(result?.sources).toContain('datamuse');
    });

    it('caches word insight responses between calls', async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response(
                    JSON.stringify([
                        {
                            word: 'tempo',
                            meanings: [{ definitions: [{ definition: 'Rate of speed.' }] }],
                        },
                    ]),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                ),
        );

        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const first = await lookupReaderWordInsight('tempo');
        const second = await lookupReaderWordInsight('tempo');

        expect(first).toEqual(second);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('merges related title suggestions from multiple free book APIs', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);

            if (url.includes('openlibrary.org')) {
                return new Response(
                    JSON.stringify({
                        docs: [
                            {
                                title: 'The Left Hand of Darkness',
                                author_name: ['Ursula K. Le Guin'],
                                first_publish_year: 1969,
                            },
                            {
                                title: 'Dune',
                                author_name: ['Frank Herbert'],
                                first_publish_year: 1965,
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }

            if (url.includes('gutendex.com')) {
                return new Response(
                    JSON.stringify({
                        results: [
                            {
                                title: 'Dune',
                                authors: [{ name: 'Frank Herbert' }],
                            },
                            {
                                title: 'Solaris',
                                authors: [{ name: 'Stanislaw Lem' }],
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }

            return new Response('Not found', { status: 404 });
        });

        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const suggestions = await fetchReaderBookSuggestions('Dune');

        expect(suggestions.length).toBeGreaterThanOrEqual(3);
        expect(suggestions.some(entry => entry.title === 'Dune')).toBe(true);
        expect(suggestions.some(entry => entry.title === 'Solaris')).toBe(true);
        expect(suggestions.some(entry => entry.source === 'openlibrary')).toBe(true);
        expect(suggestions.some(entry => entry.source === 'gutendex')).toBe(true);
    });

    it('aggregates manga, manhwa, manhua, and novel results from expanded discovery APIs', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);

            if (url.includes('openlibrary.org')) {
                return new Response(
                    JSON.stringify({
                        docs: [
                            {
                                title: 'The Name of the Wind',
                                author_name: ['Patrick Rothfuss'],
                                first_publish_year: 2007,
                                subject: ['fantasy novel'],
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }

            if (url.includes('gutendex.com')) {
                return new Response(
                    JSON.stringify({
                        results: [
                            {
                                title: 'Twenty Thousand Leagues Under the Seas',
                                authors: [{ name: 'Jules Verne' }],
                                subjects: ['science fiction'],
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }

            if (url.includes('googleapis.com/books')) {
                return new Response(
                    JSON.stringify({
                        items: [
                            {
                                volumeInfo: {
                                    title: 'Omniscient Reader',
                                    authors: ['Sing N Song'],
                                    categories: ['Korean manhwa'],
                                    averageRating: 4.7,
                                },
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }

            if (url.includes('api.jikan.moe')) {
                return new Response(
                    JSON.stringify({
                        data: [
                            {
                                title: 'One Piece',
                                type: 'Manga',
                                score: 8.9,
                                authors: [{ name: 'Eiichiro Oda' }],
                                genres: [{ name: 'Shonen' }],
                            },
                            {
                                title: "The King's Avatar",
                                type: 'Manhua',
                                score: 8.1,
                                authors: [{ name: 'Butterfly Blue' }],
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }

            if (url.includes('kitsu.io')) {
                return new Response(
                    JSON.stringify({
                        data: [
                            {
                                attributes: {
                                    canonicalTitle: 'Solo Leveling',
                                    subtype: 'manhwa',
                                    averageRating: '89.4',
                                },
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }

            return new Response('Not found', { status: 404 });
        });

        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const allSuggestions = await fetchReaderBookSuggestions('Solo Leveling');

        expect(allSuggestions.some(entry => entry.contentType === 'novel')).toBe(true);
        expect(allSuggestions.some(entry => entry.contentType === 'manga')).toBe(true);
        expect(allSuggestions.some(entry => entry.contentType === 'manhwa')).toBe(true);
        expect(allSuggestions.some(entry => entry.contentType === 'manhua')).toBe(true);
        expect(allSuggestions.some(entry => entry.source === 'jikan')).toBe(true);
        expect(allSuggestions.some(entry => entry.source === 'kitsu')).toBe(true);
        expect(allSuggestions.some(entry => entry.source === 'googlebooks')).toBe(true);

        const manhwaOnly = await fetchReaderBookSuggestions('Solo Leveling', {
            includeTypes: ['manhwa'],
            limit: 10,
        });

        expect(manhwaOnly.length).toBeGreaterThan(0);
        expect(manhwaOnly.every(entry => entry.contentType === 'manhwa')).toBe(true);
    });
});
