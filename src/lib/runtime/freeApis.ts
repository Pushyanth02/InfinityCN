import type { BookGenre } from '../../types/cinematifier';

const DEFAULT_TIMEOUT_MS = 2500;

type MetadataSource = 'openlibrary' | 'gutendex' | 'googlebooks' | 'wikipedia';

export interface FreeBookMetadata {
    title?: string;
    author?: string;
    description?: string;
    subjects: string[];
    genre?: BookGenre;
    sources: MetadataSource[];
}

interface OpenLibraryDoc {
    title?: string;
    author_name?: string[];
    first_sentence?: string | { value?: string } | Array<{ value?: string } | string>;
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
    description?: string;
    categories?: string[];
}

interface GoogleBooksItem {
    volumeInfo?: GoogleBooksVolumeInfo;
}

interface GoogleBooksResponse {
    items?: GoogleBooksItem[];
}

interface WikipediaSummaryResponse {
    type?: string;
    title?: string;
    description?: string;
    extract?: string;
}

interface EnrichBookMetadataInput {
    title: string;
    timeoutMs?: number;
}

const GENRE_KEYWORDS: Array<{ genre: BookGenre; keywords: string[] }> = [
    { genre: 'fantasy', keywords: ['fantasy', 'dragon', 'magic', 'myth', 'sorcery'] },
    { genre: 'romance', keywords: ['romance', 'love story', 'courtship'] },
    { genre: 'thriller', keywords: ['thriller', 'suspense', 'spy', 'conspiracy'] },
    { genre: 'sci_fi', keywords: ['science fiction', 'sci-fi', 'space', 'robot', 'dystopia'] },
    { genre: 'mystery', keywords: ['mystery', 'detective', 'crime', 'whodunit'] },
    { genre: 'historical', keywords: ['historical', 'history', 'war', 'victorian'] },
    { genre: 'literary_fiction', keywords: ['literary', 'classic', 'character study'] },
    { genre: 'horror', keywords: ['horror', 'ghost', 'haunted', 'supernatural terror'] },
    { genre: 'adventure', keywords: ['adventure', 'quest', 'expedition', 'journey'] },
];

function normalizeTitle(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanDescription(value?: string): string | undefined {
    if (!value) return undefined;

    const cleaned = value
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return cleaned || undefined;
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

function pickBestOpenLibraryDoc(title: string, docs: OpenLibraryDoc[]): OpenLibraryDoc | null {
    if (docs.length === 0) return null;

    const normalizedTarget = normalizeTitle(title);
    const exact = docs.find(doc => normalizeTitle(doc.title ?? '') === normalizedTarget);

    if (exact) return exact;
    return docs[0] ?? null;
}

function pickLongestString(candidates: Array<string | undefined>): string | undefined {
    const filtered = candidates
        .map(candidate => candidate?.trim())
        .filter((candidate): candidate is string => Boolean(candidate));

    if (filtered.length === 0) return undefined;
    return filtered.sort((a, b) => b.length - a.length)[0];
}

function pickFirstString(candidates: Array<string | undefined>): string | undefined {
    for (const candidate of candidates) {
        const value = candidate?.trim();
        if (value) return value;
    }
    return undefined;
}

function extractFirstSentence(firstSentence: OpenLibraryDoc['first_sentence']): string | undefined {
    if (!firstSentence) return undefined;
    if (typeof firstSentence === 'string') return firstSentence.trim() || undefined;

    if (Array.isArray(firstSentence)) {
        const candidate = firstSentence.find(entry =>
            typeof entry === 'string' ? entry.trim().length > 0 : Boolean(entry.value?.trim()),
        );

        if (!candidate) return undefined;
        if (typeof candidate === 'string') return candidate.trim() || undefined;
        return candidate.value?.trim() || undefined;
    }

    return firstSentence.value?.trim() || undefined;
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

export function inferGenreFromSubjects(subjects: string[]): BookGenre | undefined {
    const normalized = subjects.map(subject => subject.toLowerCase());

    for (const entry of GENRE_KEYWORDS) {
        const matched = entry.keywords.some(keyword =>
            normalized.some(subject => subject.includes(keyword)),
        );

        if (matched) return entry.genre;
    }

    return undefined;
}

async function fetchOpenLibraryMetadata(
    title: string,
    timeoutMs: number,
): Promise<FreeBookMetadata | null> {
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=5`;
    const payload = await fetchJson<OpenLibrarySearchResponse>(url, timeoutMs);
    const doc = pickBestOpenLibraryDoc(title, payload?.docs ?? []);

    if (!doc) return null;

    const subjects = uniqueStrings(doc.subject ?? []);
    return {
        title: doc.title?.trim() || undefined,
        author: doc.author_name?.[0]?.trim() || undefined,
        description: extractFirstSentence(doc.first_sentence),
        subjects,
        genre: inferGenreFromSubjects(subjects),
        sources: ['openlibrary'],
    };
}

async function fetchGutendexMetadata(
    title: string,
    timeoutMs: number,
): Promise<FreeBookMetadata | null> {
    const url = `https://gutendex.com/books?search=${encodeURIComponent(title)}`;
    const payload = await fetchJson<GutendexResponse>(url, timeoutMs);
    const first = payload?.results?.[0];

    if (!first) return null;

    const subjects = uniqueStrings(first.subjects ?? []);
    return {
        title: first.title?.trim() || undefined,
        author: first.authors?.[0]?.name?.trim() || undefined,
        description: first.summaries?.[0]?.trim() || undefined,
        subjects,
        genre: inferGenreFromSubjects(subjects),
        sources: ['gutendex'],
    };
}

async function fetchGoogleBooksMetadata(
    title: string,
    timeoutMs: number,
): Promise<FreeBookMetadata | null> {
    const query = encodeURIComponent(`intitle:${title}`);
    const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=5&printType=books&langRestrict=en`;
    const payload = await fetchJson<GoogleBooksResponse>(url, timeoutMs);
    const first = payload?.items?.[0]?.volumeInfo;

    if (!first) return null;

    const subjects = uniqueStrings(first.categories ?? []);
    return {
        title: first.title?.trim() || undefined,
        author: first.authors?.[0]?.trim() || undefined,
        description: cleanDescription(first.description),
        subjects,
        genre: inferGenreFromSubjects(subjects),
        sources: ['googlebooks'],
    };
}

async function fetchWikipediaMetadata(
    title: string,
    timeoutMs: number,
): Promise<FreeBookMetadata | null> {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const payload = await fetchJson<WikipediaSummaryResponse>(url, timeoutMs);

    if (!payload) return null;
    if (payload.type === 'disambiguation') return null;

    const description = cleanDescription(payload.extract ?? payload.description);
    if (!description && !payload.title) return null;

    const subjects = uniqueStrings(
        [payload.description]
            .filter((value): value is string => Boolean(value))
            .flatMap(value => value.split(/,|;|\//g)),
    );

    return {
        title: payload.title?.trim() || undefined,
        author: undefined,
        description,
        subjects,
        genre: inferGenreFromSubjects(subjects),
        sources: ['wikipedia'],
    };
}

function mergeMetadata(results: Array<FreeBookMetadata | null>): FreeBookMetadata | null {
    const available = results.filter((entry): entry is FreeBookMetadata => Boolean(entry));
    if (available.length === 0) return null;

    const orderedByPriority = [...available].sort((a, b) => {
        const priority = (source: MetadataSource | undefined): number => {
            if (!source) return 99;
            switch (source) {
                case 'openlibrary':
                    return 1;
                case 'googlebooks':
                    return 2;
                case 'gutendex':
                    return 3;
                case 'wikipedia':
                    return 4;
            }
        };

        return priority(a.sources[0]) - priority(b.sources[0]);
    });

    const subjects = uniqueStrings(orderedByPriority.flatMap(entry => entry.subjects));

    return {
        title: pickFirstString(orderedByPriority.map(entry => entry.title)),
        author: pickFirstString(orderedByPriority.map(entry => entry.author)),
        description: pickLongestString(orderedByPriority.map(entry => entry.description)),
        subjects,
        genre:
            (pickFirstString(orderedByPriority.map(entry => entry.genre)) as
                | BookGenre
                | undefined) ?? inferGenreFromSubjects(subjects),
        sources: uniqueStrings(
            orderedByPriority.flatMap(entry => entry.sources),
        ) as MetadataSource[],
    };
}

export async function enrichBookMetadataFromFreeApis(
    input: EnrichBookMetadataInput,
): Promise<FreeBookMetadata | null> {
    const title = input.title.trim();
    if (!title) return null;

    const timeoutMs = Math.max(1200, input.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const [openLibraryResult, googleBooksResult, gutendexResult, wikipediaResult] =
        await Promise.all([
            fetchOpenLibraryMetadata(title, timeoutMs),
            fetchGoogleBooksMetadata(title, timeoutMs),
            fetchGutendexMetadata(title, timeoutMs),
            fetchWikipediaMetadata(title, timeoutMs),
        ]);

    return mergeMetadata([openLibraryResult, googleBooksResult, gutendexResult, wikipediaResult]);
}
