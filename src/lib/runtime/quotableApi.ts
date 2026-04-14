/**
 * quotableApi.ts — Literary Quote Utilities
 *
 * Network-first quote retrieval using free public APIs with deterministic
 * offline fallback for reliability and PWA/offline compatibility.
 */

// ─── Types ─────────────────────────────────────────────────

export interface Quote {
    content: string;
    author: string;
    tags: string[];
    source?: 'offline' | 'dummyjson' | 'quotable';
}

interface DummyJsonQuotePayload {
    quote?: string;
    author?: string;
}

interface QuotablePayload {
    content?: string;
    author?: string;
    tags?: string[];
}

interface ProcessingQuoteOptions {
    allowNetwork?: boolean;
    timeoutMs?: number;
}

const NETWORK_QUOTE_TIMEOUT_MS = 2500;
const NETWORK_QUOTE_CACHE_TTL_MS = 5 * 60 * 1000;
const IS_TEST_MODE = import.meta.env?.MODE === 'test';

let cachedNetworkQuote: { quote: Quote; expiresAt: number } | null = null;

export function clearProcessingQuoteCache(): void {
    cachedNetworkQuote = null;
}

// ─── Curated Quotes ────────────────────────────────────────

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

function toValidQuote(
    content: string | undefined,
    author: string | undefined,
    tags: string[],
    source: Quote['source'],
): Quote | null {
    const normalizedContent = content?.trim();
    const normalizedAuthor = author?.trim();

    if (!normalizedContent || !normalizedAuthor) {
        return null;
    }

    return {
        content: normalizedContent,
        author: normalizedAuthor,
        tags,
        source,
    };
}

async function fetchDummyJsonQuote(timeoutMs: number): Promise<Quote | null> {
    const payload = await fetchJson<DummyJsonQuotePayload>(
        'https://dummyjson.com/quotes/random',
        timeoutMs,
    );
    return toValidQuote(payload?.quote, payload?.author, ['inspiration', 'reading'], 'dummyjson');
}

async function fetchQuotableApiQuote(timeoutMs: number): Promise<Quote | null> {
    const payload = await fetchJson<QuotablePayload>(
        'https://api.quotable.io/random?tags=wisdom',
        timeoutMs,
    );
    const fallbackTags = payload?.tags?.length ? payload.tags : ['wisdom', 'reading'];
    return toValidQuote(payload?.content, payload?.author, fallbackTags, 'quotable');
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
    let quote: Quote;

    if (seed !== undefined) {
        // Simple hash: sum of char codes mod collection size
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = (hash * 31 + seed.charCodeAt(i)) | 0;
        }
        quote = FALLBACK_QUOTES[Math.abs(hash) % FALLBACK_QUOTES.length];
    } else {
        quote = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
    }

    return {
        ...quote,
        tags: [...quote.tags],
        source: 'offline',
    };
}

/**
 * Returns a processing quote from free APIs when possible.
 * Falls back to deterministic offline quotes if network is unavailable.
 */
export async function getProcessingQuote(
    seed?: string,
    options: ProcessingQuoteOptions = {},
): Promise<Quote> {
    const allowNetwork = options.allowNetwork ?? !IS_TEST_MODE;
    const timeoutMs = Math.max(1200, options.timeoutMs ?? NETWORK_QUOTE_TIMEOUT_MS);

    if (!allowNetwork) {
        return getOfflineQuote(seed);
    }

    const now = Date.now();
    if (cachedNetworkQuote && cachedNetworkQuote.expiresAt > now) {
        return cachedNetworkQuote.quote;
    }

    const networkQuote =
        (await fetchDummyJsonQuote(timeoutMs)) ?? (await fetchQuotableApiQuote(timeoutMs));

    if (!networkQuote) {
        return getOfflineQuote(seed);
    }

    cachedNetworkQuote = {
        quote: networkQuote,
        expiresAt: now + NETWORK_QUOTE_CACHE_TTL_MS,
    };

    return networkQuote;
}
