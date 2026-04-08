/**
 * ai/index.ts — AI Engine Barrel Export
 *
 * Re-exports the public API from the modular ai engine sub-modules.
 * Consumers can import from 'lib/ai' and get the same API as before.
 */

// ─── Types ─────────────────────────────────────────────────
export type { AIConfig, ModelPreset, AIErrorType } from './types';

// ─── Presets ───────────────────────────────────────────────
export { MODEL_PRESETS } from './presets';

// ─── Orchestrator ──────────────────────────────────────────
export { AIManager } from './manager';
export type { Provider, AIManagerProvider, AIManagerOptions, AIManagerResult } from './manager';

// ─── Cache ─────────────────────────────────────────────────
import { getCacheKey, getFromCache, setCache } from './cache';

// ─── Errors ────────────────────────────────────────────────
import { withRetry } from './errors';

// ─── Providers ─────────────────────────────────────────────
import { callAI, prepareAICall } from './providers';

// ─── Streaming ─────────────────────────────────────────────
export { streamAI } from './streaming';
import { getRateLimiter } from './streaming';
export { getRateLimiter };

// ─── REQUEST DEDUPLICATION ─────────────────────────────────

const inflightRequests = new Map<string, Promise<string>>();

// ─── UNIFIED API CLIENT (with deduplication + rate limiting)

import type { AIConfig } from './types';

/**
 * Main entry point for AI calls with deduplication, caching, and rate limiting.
 *
 * Deduplication is guaranteed even for truly-concurrent callers: the shared
 * promise is created and registered in `inflightRequests` synchronously (before
 * the first `await`) so any subsequent call with the same key joins the already-
 * running request rather than launching a duplicate.
 */
export async function callAIWithDedup(prompt: string, config: AIConfig): Promise<string> {
    const cacheKey = getCacheKey(prompt, config.provider, config.model ?? '');

    // Check cache first
    const cached = getFromCache(cacheKey);
    if (cached) return cached;

    // If an identical request is already in flight, share its promise.
    if (inflightRequests.has(cacheKey)) {
        return inflightRequests.get(cacheKey)!;
    }

    // Register the promise synchronously — before the first `await` — so that
    // any concurrent caller that reaches this point will hit the check above
    // instead of launching a duplicate network request.
    const requestPromise = (async () => {
        const prepared = prepareAICall(prompt, config);
        const limiter = getRateLimiter(config.provider);
        await limiter.acquire({ requests: 1, tokens: prepared.tokenPlan.totalBudgetTokens });
        return withRetry(() => callAI(prompt, config, prepared), config.provider);
    })();

    inflightRequests.set(cacheKey, requestPromise);

    try {
        const result = await requestPromise;
        setCache(cacheKey, result, config.provider);
        return result;
    } catch (e) {
        inflightRequests.delete(cacheKey);
        throw e;
    } finally {
        // Clean up if the request succeeded (error path already cleaned up above)
        inflightRequests.delete(cacheKey);
    }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Strip accidental markdown code fences from LLM output */
function stripFences(text: string): string {
    return text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

/** Parse JSON from LLM output, tolerating markdown code fences */
export function parseJSON<T>(raw: string): T {
    return JSON.parse(stripFences(raw)) as T;
}

// ─── PUBLIC TASK FUNCTIONS ────────────────────────────────────────────────────

import type { AIConnectionStatus } from './types';

/**
 * Test whether the configured AI provider is reachable.
 * Returns a status object — does NOT throw.
 */
export async function testConnection(config: AIConfig): Promise<AIConnectionStatus> {
    if (config.provider === 'none') {
        return { ok: false, provider: 'none', message: 'AI is disabled — using algorithms.' };
    }

    const t0 = performance.now();
    try {
        const testPrompt = 'Reply with exactly this JSON: {"ok":true}';
        const raw = await callAIWithDedup(testPrompt, config);
        const parsed = parseJSON<{ ok?: boolean }>(raw);
        const latencyMs = Math.round(performance.now() - t0);

        if (parsed.ok) {
            return {
                ok: true,
                provider: config.provider,
                message: `Connected successfully.`,
                latencyMs,
            };
        }
        return {
            ok: false,
            provider: config.provider,
            message: 'Unexpected response from model.',
            latencyMs,
        };
    } catch (err) {
        return {
            ok: false,
            provider: config.provider,
            message: err instanceof Error ? err.message : 'Unknown error.',
        };
    }
}
