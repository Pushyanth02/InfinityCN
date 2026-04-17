import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearReaderApiCaches,
    lookupReaderWordInsight,
    searchReaderWordCompletions,
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
                            phonetics: [{ text: '/nwahr/', audio: 'https://cdn.example/noir.mp3' }],
                            meanings: [
                                {
                                    partOfSpeech: 'noun',
                                    definitions: [
                                        {
                                            definition:
                                                'A style marked by cynical characters and stark contrast.',
                                            example: 'The film embraced a noir visual language.',
                                        },
                                    ],
                                },
                            ],
                        },
                    ]),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }

            if (url.includes('rel_ant=')) {
                return new Response(JSON.stringify([{ word: 'bright' }, { word: 'radiant' }]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            if (url.includes('md=s')) {
                return new Response(JSON.stringify([{ word: 'noir', numSyllables: 1 }]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
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
        expect(result?.audioUrl).toBe('https://cdn.example/noir.mp3');
        expect(result?.meanings.length).toBeGreaterThan(0);
        expect(result?.examples.length).toBeGreaterThan(0);
        expect(result?.relatedWords).toContain('shadowy');
        expect(result?.antonyms).toContain('bright');
        expect(result?.syllableCount).toBe(1);
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
        expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('provides word completions for type-ahead lookup', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (!url.includes('/sug?')) {
                return new Response('Not found', { status: 404 });
            }

            return new Response(
                JSON.stringify([
                    { word: 'resonance' },
                    { word: 'resonate' },
                    { word: 'resonant' },
                ]),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
        });

        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const results = await searchReaderWordCompletions('reso');

        expect(results).toContain('resonance');
        expect(results).toContain('resonate');
    });

    it('returns null for too-short queries', async () => {
        const result = await lookupReaderWordInsight('a');
        expect(result).toBeNull();
    });
});
