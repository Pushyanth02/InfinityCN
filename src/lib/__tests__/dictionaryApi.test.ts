/**
 * dictionaryApi.test.ts — Tests for Free Dictionary API Client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookupWord } from '../dictionaryApi';

// ─── Mock fetch ────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
});

// ─── lookupWord ────────────────────────────────────────────

describe('lookupWord', () => {
    it('returns null for empty input', async () => {
        expect(await lookupWord('')).toBeNull();
        expect(await lookupWord('   ')).toBeNull();
    });

    it('returns null for non-alphabetic input', async () => {
        expect(await lookupWord('123')).toBeNull();
        expect(await lookupWord('hello!')).toBeNull();
    });

    it('returns null for 404 responses', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 });
        expect(await lookupWord('xyznonword')).toBeNull();
    });

    it('throws on non-404 errors', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
        });
        await expect(lookupWord('test')).rejects.toThrow('Dictionary API error');
    });

    it('parses a valid API response', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
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
                                        definition: 'A procedure to assess quality.',
                                        example: 'She passed the test.',
                                        synonyms: ['exam', 'quiz'],
                                        antonyms: [],
                                    },
                                ],
                            },
                        ],
                        sourceUrls: ['https://en.wiktionary.org/wiki/test'],
                    },
                ]),
        });

        const result = await lookupWord('test');
        expect(result).not.toBeNull();
        expect(result!.word).toBe('test');
        expect(result!.phonetic).toBe('/tɛst/');
        expect(result!.meanings).toHaveLength(1);
        expect(result!.meanings[0].partOfSpeech).toBe('noun');
        expect(result!.meanings[0].definitions[0].definition).toBe(
            'A procedure to assess quality.',
        );
        expect(result!.meanings[0].definitions[0].synonyms).toContain('exam');
        expect(result!.sourceUrl).toBe('https://en.wiktionary.org/wiki/test');
    });

    it('handles responses without phonetics', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve([
                    {
                        word: 'cat',
                        meanings: [
                            {
                                partOfSpeech: 'noun',
                                definitions: [{ definition: 'A small domesticated feline.' }],
                            },
                        ],
                    },
                ]),
        });

        const result = await lookupWord('cat');
        expect(result).not.toBeNull();
        expect(result!.phonetic).toBeUndefined();
        expect(result!.meanings[0].definitions[0].synonyms).toEqual([]);
    });

    it('converts input to lowercase', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 });
        await lookupWord('HELLO');
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/hello'));
    });

    it('returns null for empty API response array', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve([]),
        });
        expect(await lookupWord('test')).toBeNull();
    });
});
