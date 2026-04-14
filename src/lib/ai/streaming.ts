/**
 * ai/streaming.ts — Streaming AI Response Handler
 *
 * Delegates to isolated provider classes for streaming. Preserves the
 * original `streamAI()` signature and `getRateLimiter()` export.
 */

import type { AIConfig } from './types';
import { MODEL_PRESETS } from './presets';
import { RateLimiter } from './rateLimiter';
import { prepareAICall } from './providers';
import { getProvider } from './providers/index';

// ─── RATE LIMITER (shared with callAI via getRateLimiter) ──

const rateLimiters = new Map<string, RateLimiter>();

export function getRateLimiter(provider: string): RateLimiter {
    if (!rateLimiters.has(provider)) {
        const preset = MODEL_PRESETS[provider] || { rateLimitRPM: 60, rateLimitTPM: 60_000 };
        rateLimiters.set(provider, new RateLimiter(preset.rateLimitRPM, preset.rateLimitTPM));
    }
    return rateLimiters.get(provider)!;
}

// ─── STREAMING ENTRY POINT ────────────────────────────────────────────────────

/**
 * Streaming entry point. Yields chunks of text as they arrive.
 * Dedup and caching are not applied to streaming to keep things real-time.
 *
 * Delegates to the provider's stream() method via the provider registry.
 */
export async function* streamAI(prompt: string, config: AIConfig): AsyncGenerator<string> {
    const prepared = prepareAICall(prompt, config);
    const provider = prepared.provider;

    // Acquire rate limit token
    const limiter = getRateLimiter(provider);
    await limiter.acquire({ requests: 1, tokens: prepared.tokenPlan.totalBudgetTokens });

    // Delegate to isolated provider class
    const providerInstance = getProvider(provider);
    yield* providerInstance.stream(prepared.prompt, config, {
        model: prepared.model,
        maxTokens: prepared.maxTokens,
        temperature: prepared.preset.temperature,
        systemPrompt: prepared.systemPrompt,
        useJSON: prepared.useJSON,
        rawTextMode: config.rawTextMode,
        timeoutMs: prepared.timeoutMs,
    });
}
