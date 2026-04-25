/**
 * ai/streaming.ts — Streaming AI Response Handler
 *
 * Delegates to isolated provider classes for streaming. Preserves the
 * original `streamAI()` signature and `getRateLimiter()` export.
 *
 * Rate limiting now delegates to the shared rateLimiterRegistry to ensure
 * streaming and non-streaming paths share the same per-provider state.
 */

import type { AIConfig } from './types';
import { prepareAICall } from './providers';
import { getProvider } from './providers/index';
import { getRateLimiter } from './rateLimiterRegistry';

// Re-export getRateLimiter from the shared registry for backwards compat
export { getRateLimiter } from './rateLimiterRegistry';

// ─── STREAMING ENTRY POINT ────────────────────────────────────────────────────

/**
 * Streaming entry point. Yields chunks of text as they arrive.
 * Dedup and caching are not applied to streaming to keep things real-time.
 *
 * Delegates to the provider's stream() method via the provider registry.
 */
export async function* streamAI(prompt: string, config: AIConfig): AsyncGenerator<string> {
    if (config.provider === 'none') {
        throw new Error('AI provider is not configured. Open AI Settings to choose a provider before streaming.');
    }
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
