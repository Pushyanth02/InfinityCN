/**
 * dictionaryApi.ts — Free Dictionary API Client
 *
 * Provides word definitions, phonetics, and usage examples via the
 * Free Dictionary API (https://dictionaryapi.dev/) — no API key required.
 *
 * Used by the reader to provide on-demand word lookups for difficult vocabulary.
 */

// ─── Types ─────────────────────────────────────────────────

export interface DictionaryEntry {
    word: string;
    phonetic?: string;
    meanings: DictionaryMeaning[];
    sourceUrl?: string;
}

export interface DictionaryMeaning {
    partOfSpeech: string;
    definitions: DictionaryDefinition[];
}

export interface DictionaryDefinition {
    definition: string;
    example?: string;
    synonyms: string[];
    antonyms: string[];
}

// ─── API Client ────────────────────────────────────────────

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en';

/**
 * Look up a word using the Free Dictionary API.
 *
 * @param word - The English word to look up
 * @returns A DictionaryEntry with meanings, or null if not found
 * @throws Error on network failures (non-404)
 */
export async function lookupWord(word: string): Promise<DictionaryEntry | null> {
    const trimmed = word.trim().toLowerCase();
    if (!trimmed || !/^[a-z'-]+$/i.test(trimmed)) {
        return null;
    }

    const response = await fetch(`${API_BASE}/${encodeURIComponent(trimmed)}`);

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`Dictionary API error: ${response.status} ${response.statusText}`);
    }

    const data: DictionaryApiResponse[] = await response.json();

    if (!data || data.length === 0) {
        return null;
    }

    return mapApiResponse(data[0]);
}

// ─── Internal Helpers ──────────────────────────────────────

interface DictionaryApiResponse {
    word: string;
    phonetic?: string;
    phonetics?: Array<{ text?: string; audio?: string }>;
    meanings: Array<{
        partOfSpeech: string;
        definitions: Array<{
            definition: string;
            example?: string;
            synonyms?: string[];
            antonyms?: string[];
        }>;
    }>;
    sourceUrls?: string[];
}

function mapApiResponse(raw: DictionaryApiResponse): DictionaryEntry {
    const phonetic = raw.phonetic ?? raw.phonetics?.find(p => p.text)?.text ?? undefined;

    return {
        word: raw.word,
        phonetic,
        meanings: raw.meanings.map(m => ({
            partOfSpeech: m.partOfSpeech,
            definitions: m.definitions.map(d => ({
                definition: d.definition,
                example: d.example,
                synonyms: d.synonyms ?? [],
                antonyms: d.antonyms ?? [],
            })),
        })),
        sourceUrl: raw.sourceUrls?.[0],
    };
}
