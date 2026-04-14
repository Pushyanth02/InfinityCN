import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enrichBookMetadataFromFreeApis, inferGenreFromSubjects } from '../runtime/freeApis';

describe('freeApis', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('infers genre from subject keywords', () => {
        expect(inferGenreFromSubjects(['Science fiction stories', 'Space travel'])).toBe('sci_fi');
        expect(inferGenreFromSubjects(['Detective and mystery stories'])).toBe('mystery');
        expect(inferGenreFromSubjects(['Uncategorized topic'])).toBeUndefined();
    });

    it('merges metadata from Open Library, Google Books, Gutendex, and Wikipedia', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('openlibrary.org')) {
                return new Response(
                    JSON.stringify({
                        docs: [
                            {
                                title: 'Dune',
                                author_name: ['Frank Herbert'],
                                first_sentence:
                                    'A beginning is the time for taking the most delicate care.',
                                subject: ['Science fiction stories'],
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }

            if (url.includes('googleapis.com/books/v1/volumes')) {
                return new Response(
                    JSON.stringify({
                        items: [
                            {
                                volumeInfo: {
                                    title: 'Dune',
                                    authors: ['Frank Herbert'],
                                    description: '<p>Epic science fiction on a desert world.</p>',
                                    categories: ['Science Fiction'],
                                },
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
                                subjects: ['Adventure stories'],
                                summaries: ['A desert planet and political intrigue.'],
                            },
                        ],
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }

            if (url.includes('wikipedia.org/api/rest_v1/page/summary/')) {
                return new Response(
                    JSON.stringify({
                        title: 'Dune',
                        description: 'Science fiction novel',
                        extract: 'Dune is a 1965 epic science fiction novel by Frank Herbert.',
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }

            return new Response('Not found', { status: 404 });
        });

        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const metadata = await enrichBookMetadataFromFreeApis({
            title: 'Dune',
            timeoutMs: 1800,
        });

        expect(metadata).not.toBeNull();
        expect(metadata?.title).toBe('Dune');
        expect(metadata?.author).toBe('Frank Herbert');
        expect(metadata?.description?.length ?? 0).toBeGreaterThan(0);
        expect(metadata?.subjects).toContain('Science fiction stories');
        expect(metadata?.subjects).toContain('Adventure stories');
        expect(metadata?.genre).toBe('sci_fi');
        expect(metadata?.sources).toContain('openlibrary');
        expect(metadata?.sources).toContain('googlebooks');
        expect(metadata?.sources).toContain('gutendex');
        expect(metadata?.sources).toContain('wikipedia');
    });

    it('returns null when free APIs are unreachable', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
        vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

        const metadata = await enrichBookMetadataFromFreeApis({
            title: 'Unknown Book',
            timeoutMs: 1200,
        });

        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(metadata).toBeNull();
    });
});
