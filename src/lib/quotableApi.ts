/**
 * quotableApi.ts — Literary Quote API Client
 *
 * Fetches inspiring literary quotes from the free Quotable API
 * (https://api.quotable.kurozeroPB.xyz) for chapter transitions,
 * loading screens, and empty states.
 *
 * Features:
 *   - Tag-based filtering for literary/inspirational quotes
 *   - In-memory cache with TTL to minimize network requests
 *   - Fallback quotes when offline or API unavailable
 *   - Random quote rotation
 */

// ─── Types ──────────────────────────────────────────────────

export interface Quote {
    content: string;
    author: string;
    tags: string[];
}

interface QuotableResponse {
    results: Array<{
        content: string;
        author: string;
        tags: string[];
    }>;
    totalCount: number;
}

// ─── Fallback Quotes ─────────────────────────────────────────

const FALLBACK_QUOTES: Quote[] = [
    {
        content:
            'A reader lives a thousand lives before he dies. The man who never reads lives only one.',
        author: 'George R.R. Martin',
        tags: ['literature'],
    },
    {
        content: 'The only thing that you absolutely have to know, is the location of the library.',
        author: 'Albert Einstein',
        tags: ['wisdom'],
    },
    {
        content: 'So many books, so little time.',
        author: 'Frank Zappa',
        tags: ['inspirational'],
    },
    {
        content: 'A room without books is like a body without a soul.',
        author: 'Marcus Tullius Cicero',
        tags: ['wisdom'],
    },
    {
        content: 'I have always imagined that Paradise will be a kind of library.',
        author: 'Jorge Luis Borges',
        tags: ['literature'],
    },
    {
        content: 'Reading is a discount ticket to everywhere.',
        author: 'Mary Schmich',
        tags: ['inspirational'],
    },
    {
        content: 'Think before you speak. Read before you think.',
        author: 'Fran Lebowitz',
        tags: ['wisdom'],
    },
    {
        content: 'The best time to plan a book is while doing the dishes.',
        author: 'Agatha Christie',
        tags: ['literature'],
    },
    {
        content: 'Books are a uniquely portable magic.',
        author: 'Stephen King',
        tags: ['literature'],
    },
    {
        content:
            'One must always be careful of books, and what is inside them, for words have the power to change us.',
        author: 'Cassandra Clare',
        tags: ['literature'],
    },
];

// ─── Cache ───────────────────────────────────────────────────

interface CacheEntry {
    quotes: Quote[];
    expiresAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const cache = new Map<string, CacheEntry>();

function getCacheKey(tag: string): string {
    return `quotes:${tag}`;
}

// ─── API Client ──────────────────────────────────────────────

const API_BASE = 'https://api.quotable.kurozeroPB.xyz';
const FETCH_TIMEOUT_MS = 5000;

/**
 * Fetch quotes from the Quotable API with caching and fallback.
 *
 * @param tag - Quote category tag (e.g., 'inspirational', 'wisdom', 'famous-quotes')
 * @param limit - Maximum number of quotes to fetch (default: 10)
 * @returns Array of Quote objects
 */
export async function fetchQuotes(
    tag: string = 'inspirational',
    limit: number = 10,
): Promise<Quote[]> {
    const cacheKey = getCacheKey(tag);

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.quotes;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const response = await fetch(
            `${API_BASE}/quotes?tags=${encodeURIComponent(tag)}&limit=${limit}&sortBy=dateAdded&order=desc`,
            { signal: controller.signal },
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Quotable API returned ${response.status}`);
        }

        const data: QuotableResponse = await response.json();
        const quotes: Quote[] = data.results.map(q => ({
            content: q.content,
            author: q.author,
            tags: q.tags,
        }));

        // Cache the results
        if (quotes.length > 0) {
            cache.set(cacheKey, {
                quotes,
                expiresAt: Date.now() + CACHE_TTL_MS,
            });
        }

        return quotes.length > 0 ? quotes : FALLBACK_QUOTES;
    } catch {
        // Return fallback quotes on network error
        return FALLBACK_QUOTES;
    }
}

/**
 * Get a single random quote, preferring cached results.
 *
 * @param tag - Quote category tag
 * @returns A single Quote object
 */
export async function getRandomQuote(tag: string = 'inspirational'): Promise<Quote> {
    const quotes = await fetchQuotes(tag);
    return quotes[Math.floor(Math.random() * quotes.length)];
}

/**
 * Get a random fallback quote (no network call).
 * Useful for synchronous contexts like initial render.
 */
export function getOfflineQuote(): Quote {
    return FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
}
