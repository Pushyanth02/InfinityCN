/**
 * dictionaryApi.ts — Free Dictionary API Client
 *
 * Provides word definitions, phonetics, and usage examples from the
 * Free Dictionary API (https://api.dictionaryapi.dev) for the reader's
 * vocabulary lookup feature.
 *
 * Features:
 *   - Word definitions with part-of-speech tagging
 *   - Phonetic pronunciation data (IPA)
 *   - Usage examples and synonyms
 *   - In-memory LRU cache to minimize network requests
 *   - Graceful fallback when offline or API unavailable
 */

// ─── Types ──────────────────────────────────────────────────

export interface WordDefinition {
    word: string;
    phonetic: string;
    meanings: WordMeaning[];
}

export interface WordMeaning {
    partOfSpeech: string;
    definitions: Array<{
        definition: string;
        example?: string;
    }>;
    synonyms: string[];
}

interface DictionaryApiResponse {
    word: string;
    phonetic?: string;
    phonetics?: Array<{ text?: string }>;
    meanings: Array<{
        partOfSpeech: string;
        definitions: Array<{
            definition: string;
            example?: string;
        }>;
        synonyms?: string[];
    }>;
}

// ─── Cache ───────────────────────────────────────────────────

const CACHE_MAX_SIZE = 200;
const cache = new Map<string, WordDefinition>();

function setCache(key: string, value: WordDefinition): void {
    if (cache.size >= CACHE_MAX_SIZE) {
        // Evict oldest entry (first key in iteration order)
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) cache.delete(firstKey);
    }
    cache.set(key, value);
}

// ─── API Client ──────────────────────────────────────────────

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const FETCH_TIMEOUT_MS = 5000;

/**
 * Look up a word's definition, phonetics, and usage examples.
 *
 * @param word - The word to look up
 * @returns WordDefinition or null if the word is not found
 */
export async function lookupWord(word: string): Promise<WordDefinition | null> {
    const normalised = word.trim().toLowerCase();
    if (!normalised) return null;

    // Check cache
    const cached = cache.get(normalised);
    if (cached) return cached;

    try {
        const response = await fetch(`${API_BASE}/${encodeURIComponent(normalised)}`, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (!response.ok) {
            // 404 means word not found — not an error
            return null;
        }

        const data: DictionaryApiResponse[] = await response.json();
        if (!data || data.length === 0) return null;

        const entry = data[0];
        const result: WordDefinition = {
            word: entry.word,
            phonetic: entry.phonetic || entry.phonetics?.find(p => p.text)?.text || '',
            meanings: entry.meanings.map(m => ({
                partOfSpeech: m.partOfSpeech,
                definitions: m.definitions.slice(0, 3).map(d => ({
                    definition: d.definition,
                    example: d.example,
                })),
                synonyms: (m.synonyms ?? []).slice(0, 5),
            })),
        };

        setCache(normalised, result);
        return result;
    } catch {
        // Network error or timeout — return null
        return null;
    }
}

/**
 * Look up multiple words in parallel, returning results keyed by word.
 * Useful for batch vocabulary analysis of a chapter.
 *
 * @param words - Array of words to look up
 * @returns Map of word → WordDefinition (entries missing for unknown words)
 */
export async function lookupWords(words: string[]): Promise<Map<string, WordDefinition>> {
    const unique = [...new Set(words.map(w => w.trim().toLowerCase()).filter(Boolean))];
    const results = new Map<string, WordDefinition>();

    // Process in parallel batches of 5 to avoid overwhelming the API
    const BATCH_SIZE = 5;
    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
        const batch = unique.slice(i, i + BATCH_SIZE);
        const settled = await Promise.allSettled(batch.map(w => lookupWord(w)));

        for (let j = 0; j < batch.length; j++) {
            const result = settled[j];
            if (result.status === 'fulfilled' && result.value) {
                results.set(batch[j], result.value);
            }
        }
    }

    return results;
}
