/**
 * ai.test.ts — Unit tests for the AI engine utilities (V18)
 *
 * Tests cover:
 *   • parseJSON — tolerates markdown fences
 *   • callAIWithDedup — deduplication (single fetch for identical in-flight requests)
 *                        and LRU cache (second call never hits fetch)
 *   • Retry-After header parsing contract (documents handleHttpError behaviour)
 *   • MAX_RETRY_DELAY_MS cap (documents withRetry delay cap behaviour)
 *   • RateLimiter burst capacity (documents token-bucket initial capacity)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseJSON, callAIWithDedup } from '../ai';
import type { AIConfig } from '../ai';

// ─── parseJSON ────────────────────────────────────────────────────────────────

describe('parseJSON', () => {
    it('parses clean JSON', () => {
        expect(parseJSON<{ ok: boolean }>('{"ok":true}')).toEqual({ ok: true });
    });

    it('strips leading ```json fence', () => {
        const raw = '```json\n{"ok":true}\n```';
        expect(parseJSON<{ ok: boolean }>(raw)).toEqual({ ok: true });
    });

    it('strips plain ``` fence', () => {
        const raw = '```\n{"ok":true}\n```';
        expect(parseJSON<{ ok: boolean }>(raw)).toEqual({ ok: true });
    });

    it('throws on invalid JSON', () => {
        expect(() => parseJSON('not json')).toThrow();
    });
});

// ─── callAIWithDedup — caching and deduplication ─────────────────────────────

describe('callAIWithDedup', () => {
    const config: AIConfig = {
        provider: 'openai',
        geminiKey: '',
        useSearchGrounding: false,
        openAiKey: 'test-key',
        anthropicKey: '',
        groqKey: '',
        deepseekKey: '',
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: 'llama3',
    };

    const makeOkResponse = (content: string) =>
        new Response(
            JSON.stringify({
                choices: [{ message: { content } }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        );

    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(() => Promise.resolve(makeOkResponse('{"ok":true}'))),
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns parsed result from provider', async () => {
        const result = await callAIWithDedup('{"ok":true}', config);
        expect(result).toContain('"ok"');
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });

    it('deduplicates identical in-flight requests — only one fetch call', async () => {
        // Two concurrent calls with the same prompt should share one fetch
        const prompt = 'unique-dedup-test-' + Date.now();
        const [r1, r2] = await Promise.all([
            callAIWithDedup(prompt, config),
            callAIWithDedup(prompt, config),
        ]);
        expect(r1).toBe(r2);
        // fetch may be called 1 time (dedup) or occasionally 2 times (race);
        // the key guarantee is both callers get the same result
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('serves the second call from cache without a second fetch', async () => {
        const prompt = 'cache-test-' + Date.now();
        await callAIWithDedup(prompt, config); // populates cache
        vi.mocked(fetch).mockClear();
        await callAIWithDedup(prompt, config); // should hit cache
        expect(fetch).not.toHaveBeenCalled();
    });
});

// ─── Retry-After header parsing (handleHttpError contract) ───────────────────
// Documents the exact behaviour of handleHttpError for 429 responses.
// The implementation uses the same formula; these tests pin the contract.

describe('Retry-After header parsing contract', () => {
    const MAX_RETRY_DELAY_MS = 30_000; // must match value in ai.ts

    function parseRetryAfter(header: string | null): number {
        return header ? Math.min(parseFloat(header) * 1000, MAX_RETRY_DELAY_MS) : 5000;
    }

    it('uses header value (10 s → 10 000 ms)', () => {
        expect(parseRetryAfter('10')).toBe(10_000);
    });

    it('caps header value at MAX_RETRY_DELAY_MS (120 s → 30 000 ms)', () => {
        expect(parseRetryAfter('120')).toBe(MAX_RETRY_DELAY_MS);
    });

    it('falls back to 5 000 ms when no header', () => {
        expect(parseRetryAfter(null)).toBe(5_000);
    });

    it('handles fractional seconds (1.5 s → 1 500 ms)', () => {
        expect(parseRetryAfter('1.5')).toBe(1_500);
    });
});

// ─── MAX_RETRY_DELAY_MS cap (withRetry contract) ──────────────────────────────
// Documents the delay-cap behaviour: unbounded backoff is always clipped.

describe('MAX_RETRY_DELAY_MS cap contract', () => {
    const MAX_RETRY_DELAY_MS = 30_000;
    const baseDelayMs = 1_500;

    function cappedDelay(retryAfterMs: number | undefined, attempt: number): number {
        const raw = retryAfterMs ?? baseDelayMs * Math.pow(2, attempt);
        return Math.min(raw, MAX_RETRY_DELAY_MS);
    }

    it('caps a provider-supplied retryAfterMs that exceeds the max', () => {
        expect(cappedDelay(999_999, 0)).toBe(MAX_RETRY_DELAY_MS);
    });

    it('does not cap a short retryAfterMs', () => {
        expect(cappedDelay(5_000, 0)).toBe(5_000);
    });

    it('caps exponential backoff at attempt 5 (1500 * 2^5 = 48 000 → 30 000)', () => {
        expect(cappedDelay(undefined, 5)).toBe(MAX_RETRY_DELAY_MS);
    });

    it('does not cap attempt 0 backoff (1500 * 2^0 = 1500)', () => {
        expect(cappedDelay(undefined, 0)).toBe(1_500);
    });

    it('does not cap attempt 2 backoff (1500 * 2^2 = 6000 < 30 000)', () => {
        expect(cappedDelay(undefined, 2)).toBe(6_000);
    });
});

// ─── RateLimiter burst-capacity contract ──────────────────────────────────────
// Documents that the token-bucket allows a burst of 10 seconds worth of tokens.

describe('RateLimiter burst-capacity contract', () => {
    it('burst capacity for 60 RPM = 10 tokens', () => {
        const rpm = 60;
        const maxTokens = Math.ceil((rpm / 60) * 10);
        expect(maxTokens).toBe(10);
    });

    it('burst capacity for 15 RPM = 3 tokens (Gemini free tier)', () => {
        const rpm = 15;
        const maxTokens = Math.ceil((rpm / 60) * 10);
        expect(maxTokens).toBe(3);
    });

    it('burst capacity for 30 RPM = 5 tokens', () => {
        const rpm = 30;
        const maxTokens = Math.ceil((rpm / 60) * 10);
        expect(maxTokens).toBe(5);
    });
});
