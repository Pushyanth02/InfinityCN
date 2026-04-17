const DEFAULT_TIMEOUT_MS = 2400;
const WORD_CACHE_TTL_MS = 45 * 60 * 1000;
const SUGGESTION_CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

export type ReaderApiSource = 'dictionaryapi' | 'datamuse';

export interface ReaderWordMeaning {
    partOfSpeech?: string;
    definition: string;
    example?: string;
    synonyms: string[];
    antonyms: string[];
}

export interface ReaderWordInsight {
    word: string;
    phonetic?: string;
    audioUrl?: string;
    meanings: ReaderWordMeaning[];
    relatedWords: string[];
    antonyms: string[];
    examples: string[];
    syllableCount?: number;
    sources: ReaderApiSource[];
}

interface DictionaryMeaning {
    partOfSpeech?: string;
    synonyms?: string[];
    antonyms?: string[];
    definitions?: Array<{
        definition?: string;
        example?: string;
        synonyms?: string[];
        antonyms?: string[];
    }>;
}

interface DictionaryEntry {
    phonetic?: string;
    phonetics?: Array<{
        text?: string;
        audio?: string;
    }>;
    meanings?: DictionaryMeaning[];
}

interface DatamuseEntry {
    word?: string;
    score?: number;
    numSyllables?: number;
    tags?: string[];
}

const wordInsightCache = new Map<string, CacheEntry<ReaderWordInsight | null>>();
const wordSuggestionCache = new Map<string, CacheEntry<string[]>>();

function normalizeWord(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z'-]/g, '')
        .trim();
}

function uniqueStrings(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        const normalized = value.trim();
        if (!normalized) continue;

        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;

        seen.add(key);
        result.push(normalized);
    }

    return result;
}

function timeoutSignal(timeoutMs: number): AbortSignal {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        return AbortSignal.timeout(timeoutMs);
    }

    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs);
    return controller.signal;
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: timeoutSignal(timeoutMs),
        });

        if (!response.ok) return null;
        return (await response.json()) as T;
    } catch {
        return null;
    }
}

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const cached = cache.get(key);
    if (!cached) return null;

    if (cached.expiresAt < Date.now()) {
        cache.delete(key);
        return null;
    }

    return cached.value;
}

function setCached<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    value: T,
    ttlMs: number,
): void {
    cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
    });
}

function parseDictionary(payload: DictionaryEntry[] | null): {
    phonetic?: string;
    audioUrl?: string;
    meanings: ReaderWordMeaning[];
    synonyms: string[];
    antonyms: string[];
    examples: string[];
} {
    if (!payload || payload.length === 0) {
        return {
            meanings: [],
            synonyms: [],
            antonyms: [],
            examples: [],
        };
    }

    const first = payload[0];
    const dictionarySynonyms: string[] = [];
    const dictionaryAntonyms: string[] = [];
    const dictionaryExamples: string[] = [];

    const meanings = (first.meanings ?? [])
        .flatMap(meaning => {
            const definitions = meaning.definitions ?? [];
            return definitions.map(definition => ({
                partOfSpeech: meaning.partOfSpeech,
                definition: definition.definition?.trim() ?? '',
                example: definition.example?.trim() || undefined,
                synonyms: uniqueStrings([
                    ...(meaning.synonyms ?? []),
                    ...(definition.synonyms ?? []),
                ]),
                antonyms: uniqueStrings([
                    ...(meaning.antonyms ?? []),
                    ...(definition.antonyms ?? []),
                ]),
            }));
        })
        .filter(meaning => {
            if (meaning.definition.length === 0) {
                return false;
            }

            dictionarySynonyms.push(...meaning.synonyms);
            dictionaryAntonyms.push(...meaning.antonyms);
            if (meaning.example) {
                dictionaryExamples.push(meaning.example);
            }

            return true;
        })
        .slice(0, 6);

    const phoneticText =
        first.phonetic?.trim() ||
        first.phonetics?.map(entry => entry.text?.trim() ?? '').find(Boolean) ||
        undefined;
    const audioUrl =
        first.phonetics?.map(entry => entry.audio?.trim() ?? '').find(Boolean) || undefined;

    return {
        phonetic: phoneticText,
        audioUrl,
        meanings,
        synonyms: uniqueStrings(dictionarySynonyms),
        antonyms: uniqueStrings(dictionaryAntonyms),
        examples: uniqueStrings(dictionaryExamples).slice(0, 4),
    };
}

function parseWordEntries(payload: DatamuseEntry[] | null): string[] {
    if (!payload || payload.length === 0) return [];

    return uniqueStrings(payload.map(entry => entry.word?.trim() ?? '').filter(Boolean)).slice(
        0,
        12,
    );
}

function parseSyllableCount(payload: DatamuseEntry[] | null): number | undefined {
    if (!payload || payload.length === 0) return undefined;

    const value = payload[0]?.numSyllables;
    if (typeof value !== 'number' || value <= 0) return undefined;
    return Math.round(value);
}

function mergeLexicalWords(baseWord: string, ...groups: string[][]): string[] {
    const lowered = baseWord.toLowerCase();
    return uniqueStrings(groups.flat()).filter(word => word.toLowerCase() !== lowered);
}

export async function lookupReaderWordInsight(
    rawWord: string,
    options?: { timeoutMs?: number },
): Promise<ReaderWordInsight | null> {
    const word = normalizeWord(rawWord);
    if (word.length < 2) return null;

    const cached = getCached(wordInsightCache, word);
    if (cached !== null) return cached;

    const timeoutMs = Math.max(1200, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const [
        dictionaryPayload,
        synonymPayload,
        relatedPayload,
        antonymPayload,
        syllablePayload,
    ] = await Promise.all([
        fetchJson<DictionaryEntry[]>(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
            timeoutMs,
        ),
        fetchJson<DatamuseEntry[]>(
            `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=12`,
            timeoutMs,
        ),
        fetchJson<DatamuseEntry[]>(
            `https://api.datamuse.com/words?ml=${encodeURIComponent(word)}&max=10`,
            timeoutMs,
        ),
        fetchJson<DatamuseEntry[]>(
            `https://api.datamuse.com/words?rel_ant=${encodeURIComponent(word)}&max=10`,
            timeoutMs,
        ),
        fetchJson<DatamuseEntry[]>(
            `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=s&max=1`,
            timeoutMs,
        ),
    ]);

    const dictionary = parseDictionary(dictionaryPayload);
    const relatedWords = mergeLexicalWords(
        word,
        dictionary.synonyms,
        parseWordEntries(synonymPayload),
        parseWordEntries(relatedPayload),
    ).slice(0, 14);
    const antonyms = mergeLexicalWords(
        word,
        dictionary.antonyms,
        parseWordEntries(antonymPayload),
    ).slice(0, 10);
    const syllableCount = parseSyllableCount(syllablePayload);
    const sources: ReaderApiSource[] = [];

    if (dictionary.meanings.length > 0) {
        sources.push('dictionaryapi');
    }
    if (relatedWords.length > 0 || antonyms.length > 0 || typeof syllableCount === 'number') {
        sources.push('datamuse');
    }

    const insight: ReaderWordInsight | null =
        dictionary.meanings.length === 0 && relatedWords.length === 0 && antonyms.length === 0
            ? null
            : {
                  word,
                  phonetic: dictionary.phonetic,
                  audioUrl: dictionary.audioUrl,
                  meanings: dictionary.meanings,
                  relatedWords,
                  antonyms,
                  examples: dictionary.examples,
                  syllableCount,
                  sources,
              };

    setCached(wordInsightCache, word, insight, WORD_CACHE_TTL_MS);
    return insight;
}

export async function searchReaderWordCompletions(
    rawQuery: string,
    options?: { timeoutMs?: number },
): Promise<string[]> {
    const query = normalizeWord(rawQuery);
    if (query.length < 2) return [];

    const cached = getCached(wordSuggestionCache, query);
    if (cached !== null) return cached;

    const timeoutMs = Math.max(1000, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const payload = await fetchJson<DatamuseEntry[]>(
        `https://api.datamuse.com/sug?s=${encodeURIComponent(query)}&max=10`,
        timeoutMs,
    );

    const suggestions = parseWordEntries(payload)
        .filter(word => word.toLowerCase() !== query)
        .slice(0, 8);
    setCached(wordSuggestionCache, query, suggestions, SUGGESTION_CACHE_TTL_MS);
    return suggestions;
}

export function clearReaderApiCaches(): void {
    wordInsightCache.clear();
    wordSuggestionCache.clear();
}
