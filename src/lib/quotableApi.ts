/**
 * quotableApi.ts — Quotable API Client
 *
 * Provides inspirational quotes via the free Quotable API
 * (https://github.com/lukePeavey/quotable) — no API key required.
 *
 * Used to display curated quotes as placeholder content or inspirational
 * headers during processing and idle states.
 */

// ─── Types ─────────────────────────────────────────────────

export interface Quote {
    content: string;
    author: string;
    tags: string[];
}

// ─── API Client ────────────────────────────────────────────

const API_BASE = 'https://api.quotable.kurozeroPB.xyz';

/**
 * Fetch a single random quote from the Quotable API.
 *
 * @param tag - Optional tag to filter quotes (e.g., 'wisdom', 'inspirational')
 * @returns A Quote object, or null on failure
 */
export async function fetchRandomQuote(tag?: string): Promise<Quote | null> {
    try {
        const url = new URL(`${API_BASE}/quotes/random`);
        if (tag) {
            url.searchParams.set('tags', tag);
        }

        const response = await fetch(url.toString());

        if (!response.ok) {
            return null;
        }

        const data = await response.json();

        // API returns an array with one element for random quotes
        const entry = Array.isArray(data) ? data[0] : data;

        if (!entry || !entry.content) {
            return null;
        }

        return {
            content: entry.content,
            author: entry.author ?? 'Unknown',
            tags: entry.tags ?? [],
        };
    } catch {
        return null;
    }
}

/**
 * Curated collection of literary quotes for offline/fallback use.
 * Ensures the app always has inspirational content to display
 * without requiring a network connection.
 */
const FALLBACK_QUOTES: Quote[] = [
    {
        content:
            'A reader lives a thousand lives before he dies. The man who never reads lives only one.',
        author: 'George R.R. Martin',
        tags: ['reading'],
    },
    {
        content: 'The only thing that you absolutely have to know, is the location of the library.',
        author: 'Albert Einstein',
        tags: ['wisdom', 'reading'],
    },
    {
        content: 'There is no friend as loyal as a book.',
        author: 'Ernest Hemingway',
        tags: ['reading'],
    },
    {
        content:
            'Until I feared I would lose it, I never loved to read. One does not love breathing.',
        author: 'Harper Lee',
        tags: ['reading'],
    },
    {
        content: 'I have always imagined that Paradise will be a kind of library.',
        author: 'Jorge Luis Borges',
        tags: ['reading'],
    },
    {
        content: 'So many books, so little time.',
        author: 'Frank Zappa',
        tags: ['reading', 'humor'],
    },
    {
        content: 'Reading is to the mind what exercise is to the body.',
        author: 'Joseph Addison',
        tags: ['reading', 'wisdom'],
    },
    {
        content: 'Books are a uniquely portable magic.',
        author: 'Stephen King',
        tags: ['reading'],
    },
];

/**
 * Get a random quote, trying the API first and falling back to curated quotes.
 * Always returns a quote — never null.
 *
 * @param tag - Optional tag filter for the API call
 */
export async function getQuote(tag?: string): Promise<Quote> {
    const apiQuote = await fetchRandomQuote(tag);
    if (apiQuote) return apiQuote;
    return getOfflineQuote();
}

/**
 * Get a random quote from the curated offline collection.
 * Useful when network is unavailable (PWA/offline mode).
 *
 * @param seed - Optional string seed for deterministic selection.
 *               When provided, the same seed always returns the same quote,
 *               making this safe for React render (pure function).
 */
export function getOfflineQuote(seed?: string): Quote {
    if (seed !== undefined) {
        // Simple hash: sum of char codes mod collection size
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = (hash * 31 + seed.charCodeAt(i)) | 0;
        }
        return FALLBACK_QUOTES[Math.abs(hash) % FALLBACK_QUOTES.length];
    }
    return FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
}
