const DEFAULT_TIMEOUT_MS = 2400;
const WORD_CACHE_TTL_MS = 45 * 60 * 1000;
const BOOK_CACHE_TTL_MS = 20 * 60 * 1000;

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

export type ReaderApiSource =
    | 'dictionaryapi'
    | 'datamuse'
    | 'openlibrary'
    | 'gutendex'
    | 'googlebooks'
    | 'jikan'
    | 'kitsu';

export type ReaderContentType = 'novel' | 'manga' | 'manhwa' | 'manhua';

export type ReaderSuggestionSource = Extract<
    ReaderApiSource,
    'openlibrary' | 'gutendex' | 'googlebooks' | 'jikan' | 'kitsu'
>;

export interface ReaderWordMeaning {
    partOfSpeech?: string;
    definition: string;
    example?: string;
}

export interface ReaderWordInsight {
    word: string;
    phonetic?: string;
    meanings: ReaderWordMeaning[];
    relatedWords: string[];
    sources: ReaderApiSource[];
}

export interface ReaderBookSuggestion {
    title: string;
    author?: string;
    year?: number;
    source: ReaderSuggestionSource;
    contentType: ReaderContentType;
    score?: number;
    summary?: string;
}

export interface ReaderBookSuggestionOptions {
    timeoutMs?: number;
    includeTypes?: ReaderContentType[];
    limit?: number;
}

interface DictionaryMeaning {
    partOfSpeech?: string;
    definitions?: Array<{
        definition?: string;
        example?: string;
    }>;
}

interface DictionaryEntry {
    word?: string;
    phonetic?: string;
    meanings?: DictionaryMeaning[];
}

interface DatamuseEntry {
    word?: string;
}

interface OpenLibraryDoc {
    title?: string;
    author_name?: string[];
    first_publish_year?: number;
    subject?: string[];
}

interface OpenLibrarySearchResponse {
    docs?: OpenLibraryDoc[];
}

interface GutendexAuthor {
    name?: string;
}

interface GutendexBook {
    title?: string;
    authors?: GutendexAuthor[];
    subjects?: string[];
    summaries?: string[];
}

interface GutendexResponse {
    results?: GutendexBook[];
}

interface GoogleBooksVolumeInfo {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    categories?: string[];
    description?: string;
    averageRating?: number;
}

interface GoogleBooksItem {
    volumeInfo?: GoogleBooksVolumeInfo;
}

interface GoogleBooksResponse {
    items?: GoogleBooksItem[];
}

interface JikanMangaEntity {
    name?: string;
}

interface JikanMangaPublished {
    from?: string;
}

interface JikanMangaEntry {
    title?: string;
    title_english?: string;
    type?: string;
    synopsis?: string;
    score?: number;
    authors?: JikanMangaEntity[];
    genres?: JikanMangaEntity[];
    themes?: JikanMangaEntity[];
    published?: JikanMangaPublished;
}

interface JikanMangaResponse {
    data?: JikanMangaEntry[];
}

interface KitsuMangaAttributes {
    canonicalTitle?: string;
    synopsis?: string;
    averageRating?: string;
    subtype?: string;
    mangaType?: string;
    startDate?: string;
}

interface KitsuMangaEntry {
    attributes?: KitsuMangaAttributes;
}

interface KitsuMangaResponse {
    data?: KitsuMangaEntry[];
}

const wordInsightCache = new Map<string, CacheEntry<ReaderWordInsight | null>>();
const bookSuggestionCache = new Map<string, CacheEntry<ReaderBookSuggestion[]>>();

const ALL_CONTENT_TYPES: ReaderContentType[] = ['novel', 'manga', 'manhwa', 'manhua'];

const READER_SOURCE_PRIORITY: ReaderSuggestionSource[] = [
    'openlibrary',
    'googlebooks',
    'gutendex',
    'jikan',
    'kitsu',
];

function normalizeText(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildTypeCacheKey(includeTypes: ReaderContentType[]): string {
    if (includeTypes.length === 0) return 'all';
    return [...includeTypes].sort().join('|');
}

function parseYear(value?: string): number | undefined {
    if (!value) return undefined;
    const match = value.match(/\b(\d{4})\b/);
    if (!match) return undefined;

    const year = Number(match[1]);
    if (!Number.isFinite(year) || year < 1000 || year > 2100) return undefined;
    return year;
}

function normalizeScore(value: number | undefined): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;

    const normalized = value > 10 ? value / 10 : value;
    return Math.round(normalized * 10) / 10;
}

function inferContentType(hints: Array<string | undefined>): ReaderContentType {
    const normalizedHints = hints
        .filter((hint): hint is string => Boolean(hint))
        .join(' ')
        .toLowerCase();

    if (
        normalizedHints.includes('manhwa') ||
        normalizedHints.includes('korean webtoon') ||
        normalizedHints.includes('korean comics')
    ) {
        return 'manhwa';
    }

    if (
        normalizedHints.includes('manhua') ||
        normalizedHints.includes('chinese comics') ||
        normalizedHints.includes('donghua source')
    ) {
        return 'manhua';
    }

    if (
        normalizedHints.includes('manga') ||
        normalizedHints.includes('shonen') ||
        normalizedHints.includes('shojo') ||
        normalizedHints.includes('seinen') ||
        normalizedHints.includes('josei')
    ) {
        return 'manga';
    }

    return 'novel';
}

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
    meanings: ReaderWordMeaning[];
} {
    if (!payload || payload.length === 0) {
        return { meanings: [] };
    }

    const first = payload[0];
    const meanings = (first.meanings ?? [])
        .flatMap(meaning => {
            const definitions = meaning.definitions ?? [];
            return definitions.map(definition => ({
                partOfSpeech: meaning.partOfSpeech,
                definition: definition.definition?.trim() ?? '',
                example: definition.example?.trim() || undefined,
            }));
        })
        .filter(meaning => meaning.definition.length > 0)
        .slice(0, 6);

    return {
        phonetic: first.phonetic?.trim() || undefined,
        meanings,
    };
}

function parseRelatedWords(payload: DatamuseEntry[] | null): string[] {
    if (!payload || payload.length === 0) return [];

    return uniqueStrings(payload.map(entry => entry.word?.trim() ?? '').filter(Boolean)).slice(
        0,
        10,
    );
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

    const [dictionaryPayload, relatedPayload] = await Promise.all([
        fetchJson<DictionaryEntry[]>(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
            timeoutMs,
        ),
        fetchJson<DatamuseEntry[]>(
            `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=12`,
            timeoutMs,
        ),
    ]);

    const dictionary = parseDictionary(dictionaryPayload);
    const relatedWords = parseRelatedWords(relatedPayload);
    const sources: ReaderApiSource[] = [];

    if (dictionary.meanings.length > 0) {
        sources.push('dictionaryapi');
    }
    if (relatedWords.length > 0) {
        sources.push('datamuse');
    }

    const insight: ReaderWordInsight | null =
        dictionary.meanings.length === 0 && relatedWords.length === 0
            ? null
            : {
                  word,
                  phonetic: dictionary.phonetic,
                  meanings: dictionary.meanings,
                  relatedWords,
                  sources,
              };

    setCached(wordInsightCache, word, insight, WORD_CACHE_TTL_MS);
    return insight;
}

function parseOpenLibrarySuggestions(
    payload: OpenLibrarySearchResponse | null,
): ReaderBookSuggestion[] {
    if (!payload?.docs?.length) return [];

    return payload.docs
        .map(doc => ({
            title: doc.title?.trim() ?? '',
            author: doc.author_name?.[0]?.trim() || undefined,
            year: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : undefined,
            contentType: inferContentType(doc.subject ?? []),
            source: 'openlibrary' as const,
        }))
        .filter(suggestion => suggestion.title.length > 0)
        .slice(0, 6);
}

function parseGutendexSuggestions(payload: GutendexResponse | null): ReaderBookSuggestion[] {
    if (!payload?.results?.length) return [];

    return payload.results
        .map(result => ({
            title: result.title?.trim() ?? '',
            author: result.authors?.[0]?.name?.trim() || undefined,
            contentType: inferContentType(result.subjects ?? []),
            summary: result.summaries?.[0]?.trim() || undefined,
            source: 'gutendex' as const,
        }))
        .filter(suggestion => suggestion.title.length > 0)
        .slice(0, 6);
}

function parseGoogleBooksSuggestions(payload: GoogleBooksResponse | null): ReaderBookSuggestion[] {
    if (!payload?.items?.length) return [];

    return payload.items
        .map(item => item.volumeInfo)
        .filter((info): info is GoogleBooksVolumeInfo => Boolean(info))
        .map(info => ({
            title: info.title?.trim() ?? '',
            author: info.authors?.[0]?.trim() || undefined,
            year: parseYear(info.publishedDate),
            contentType: inferContentType(info.categories ?? []),
            score: normalizeScore(info.averageRating),
            summary: info.description?.trim() || undefined,
            source: 'googlebooks' as const,
        }))
        .filter(suggestion => suggestion.title.length > 0)
        .slice(0, 6);
}

function parseJikanSuggestions(payload: JikanMangaResponse | null): ReaderBookSuggestion[] {
    if (!payload?.data?.length) return [];

    return payload.data
        .map(entry => {
            const genreHints = [
                entry.type,
                ...(entry.genres?.map(genre => genre.name) ?? []),
                ...(entry.themes?.map(theme => theme.name) ?? []),
            ];

            return {
                title: entry.title_english?.trim() || entry.title?.trim() || '',
                author: entry.authors?.[0]?.name?.trim() || undefined,
                year: parseYear(entry.published?.from),
                contentType: inferContentType(genreHints),
                score: normalizeScore(entry.score),
                summary: entry.synopsis?.trim() || undefined,
                source: 'jikan' as const,
            };
        })
        .filter(suggestion => suggestion.title.length > 0)
        .slice(0, 6);
}

function parseKitsuSuggestions(payload: KitsuMangaResponse | null): ReaderBookSuggestion[] {
    if (!payload?.data?.length) return [];

    return payload.data
        .map(entry => entry.attributes)
        .filter((attributes): attributes is KitsuMangaAttributes => Boolean(attributes))
        .map(attributes => ({
            title: attributes.canonicalTitle?.trim() ?? '',
            year: parseYear(attributes.startDate),
            contentType: inferContentType([
                attributes.subtype,
                attributes.mangaType,
                attributes.synopsis,
            ]),
            score: normalizeScore(Number(attributes.averageRating)),
            summary: attributes.synopsis?.trim() || undefined,
            source: 'kitsu' as const,
        }))
        .filter(suggestion => suggestion.title.length > 0)
        .slice(0, 6);
}

function getSourcePriority(source: ReaderSuggestionSource): number {
    const index = READER_SOURCE_PRIORITY.indexOf(source);
    return index === -1 ? READER_SOURCE_PRIORITY.length : index;
}

function mergeBookSuggestions(
    openLibrary: ReaderBookSuggestion[],
    gutendex: ReaderBookSuggestion[],
    googleBooks: ReaderBookSuggestion[],
    jikan: ReaderBookSuggestion[],
    kitsu: ReaderBookSuggestion[],
    includeTypes: ReaderContentType[],
    limit: number,
): ReaderBookSuggestion[] {
    const allowedTypes =
        includeTypes.length > 0 ? new Set(includeTypes) : new Set(ALL_CONTENT_TYPES);
    const merged = [...openLibrary, ...googleBooks, ...gutendex, ...jikan, ...kitsu]
        .filter(suggestion => allowedTypes.has(suggestion.contentType))
        .sort((left, right) => {
            const sourceDelta = getSourcePriority(left.source) - getSourcePriority(right.source);
            if (sourceDelta !== 0) return sourceDelta;

            const scoreDelta = (right.score ?? 0) - (left.score ?? 0);
            if (Math.abs(scoreDelta) > 0.01) return scoreDelta;

            return left.title.localeCompare(right.title);
        });

    const seen = new Set<string>();
    const result: ReaderBookSuggestion[] = [];

    for (const suggestion of merged) {
        const key = `${normalizeText(suggestion.title)}|${normalizeText(suggestion.author ?? '')}`;
        if (seen.has(key)) continue;

        seen.add(key);
        result.push(suggestion);

        if (result.length >= limit) break;
    }

    return result;
}

function resolveSuggestionTypes(types?: ReaderContentType[]): ReaderContentType[] {
    if (!types || types.length === 0) return ALL_CONTENT_TYPES;

    const normalized = uniqueStrings(types)
        .map(type => type.toLowerCase())
        .filter((type): type is ReaderContentType =>
            (ALL_CONTENT_TYPES as string[]).includes(type),
        );

    return normalized.length > 0 ? normalized : ALL_CONTENT_TYPES;
}

export async function fetchReaderStorySuggestions(
    rawTitle: string,
    options?: ReaderBookSuggestionOptions,
): Promise<ReaderBookSuggestion[]> {
    const title = rawTitle.trim();
    if (!title) return [];

    const includeTypes = resolveSuggestionTypes(options?.includeTypes);
    const limit = Math.max(4, Math.min(24, options?.limit ?? 10));

    const cacheKey = `${normalizeText(title)}|${buildTypeCacheKey(includeTypes)}|${limit}`;
    const cached = getCached(bookSuggestionCache, cacheKey);
    if (cached !== null) return cached;

    const timeoutMs = Math.max(1200, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const encoded = encodeURIComponent(title);

    const [openLibraryPayload, gutendexPayload, googleBooksPayload, jikanPayload, kitsuPayload] =
        await Promise.all([
            fetchJson<OpenLibrarySearchResponse>(
                `https://openlibrary.org/search.json?title=${encoded}&limit=8`,
                timeoutMs,
            ),
            fetchJson<GutendexResponse>(`https://gutendex.com/books?search=${encoded}`, timeoutMs),
            fetchJson<GoogleBooksResponse>(
                `https://www.googleapis.com/books/v1/volumes?q=intitle:${encoded}&maxResults=8&printType=books`,
                timeoutMs,
            ),
            fetchJson<JikanMangaResponse>(
                `https://api.jikan.moe/v4/manga?q=${encoded}&limit=8&sfw=true`,
                timeoutMs,
            ),
            fetchJson<KitsuMangaResponse>(
                `https://kitsu.io/api/edge/manga?filter[text]=${encoded}&page[limit]=8`,
                timeoutMs,
            ),
        ]);

    const suggestions = mergeBookSuggestions(
        parseOpenLibrarySuggestions(openLibraryPayload),
        parseGutendexSuggestions(gutendexPayload),
        parseGoogleBooksSuggestions(googleBooksPayload),
        parseJikanSuggestions(jikanPayload),
        parseKitsuSuggestions(kitsuPayload),
        includeTypes,
        limit,
    );

    setCached(bookSuggestionCache, cacheKey, suggestions, BOOK_CACHE_TTL_MS);
    return suggestions;
}

export async function fetchReaderBookSuggestions(
    rawTitle: string,
    options?: ReaderBookSuggestionOptions,
): Promise<ReaderBookSuggestion[]> {
    return fetchReaderStorySuggestions(rawTitle, options);
}

export function clearReaderApiCaches(): void {
    wordInsightCache.clear();
    bookSuggestionCache.clear();
}
