/**
 * ai/index.ts — AI Engine Barrel Export
 *
 * Re-exports the public API from the modular ai engine sub-modules.
 * Consumers can import from 'lib/ai' and get the same API as before.
 *
 * Consolidation:
 * - callAIWithDedup now delegates to the AIResponseCache + RequestDeduplicator
 *   from requestPipeline.ts instead of maintaining a parallel cache/dedup path.
 * - getRateLimiter delegates to the shared rateLimiterRegistry.
 * - Task-based routing is available via callByTask() from taskRouter.ts.
 */

// ─── Types ─────────────────────────────────────────────────
export type {
    AIConfig,
    AIProviderName,
    AIResponse,
    GenerateOptions,
    AIProviderInstance,
    ModelPreset,
    AIErrorType,
    AIFallbackProvider,
} from './types';

// ─── Presets ───────────────────────────────────────────────
export { MODEL_PRESETS } from './presets';

// ─── Orchestrator ──────────────────────────────────────────
export { AIManager } from './manager';
export type {
    Provider,
    AIManagerProvider,
    AIManagerOptions,
    AIManagerResult,
    AIManagerCostSummary,
} from './manager';
import { AIManager } from './manager';
import type { AIManagerOptions, AIManagerResult } from './manager';

// ─── Cost Control ──────────────────────────────────────────
export { estimateProviderCallCostUsd, getProviderPricing, isWithinCostBudget } from './costControl';

// ─── Router ────────────────────────────────────────────────
export {
    AIProviderRouter,
    ProviderScoreCalculator,
    FallbackChain,
    ProviderHealthTracker,
    getDefaultRouter,
    chooseProvider,
    hashPromptForRouting,
    ROUTING_POLICIES,
} from './router';
export type {
    RequestPolicy,
    RequestComplexity,
    ProviderProfile,
    ProviderScore,
    RoutingDecision,
    RouterConfig,
} from './router';

// ─── Task Router ──────────────────────────────────────────
export {
    callByTask,
    routeTask,
    getTaskProfile,
    listTaskTypes,
    getTaskCacheKey,
} from './taskRouter';
export type { AITaskType, TaskProfile } from './taskRouter';

// ─── Request Pipeline (Cache + Retry + RateLimit + Dedup) ──
export {
    createCacheKey,
    AIResponseCache,
    RetryPolicy,
    RequestDeduplicator,
    QueueProcessor,
    RequestPipeline,
    getDefaultPipeline,
} from './requestPipeline';
export type {
    CacheKeyInput,
    CacheEntry,
    CacheStats,
    AIResponseCacheOptions,
    RetryPolicyConfig,
    RetryAttempt,
    RetryEventHandler,
    DedupStats,
    QueuePriority,
    QueueJob,
    QueueProcessorOptions,
    QueueProcessorStats,
    PipelineOptions,
} from './requestPipeline';

// ─── Rate Limiter Registry ────────────────────────────────
export {
    getRateLimiter,
    setRateLimiter,
    resetRateLimiters,
    listRateLimitedProviders,
} from './rateLimiterRegistry';

// ─── Errors ────────────────────────────────────────────────
export { AIError, classifyError } from './errors';

// ─── Providers ─────────────────────────────────────────────
import { callAI, prepareAICall } from './providers';

// ─── Provider Registry ─────────────────────────────────────
export { getProvider, registerProvider, listProviders, hasProvider } from './providers/index';

// ─── Streaming ─────────────────────────────────────────────
export { streamAI } from './streaming';

// ─── Stream Controller ─────────────────────────────────────
export {
    StreamController,
    StreamSession,
    getDefaultStreamController,
    streamResponse,
    cancelStream,
    onToken,
    onChunkComplete,
} from './streamController';
export type {
    StreamEvent,
    StreamEventType,
    StreamProgress,
    StreamSessionState,
    StreamEventHandler,
    StreamControllerOptions,
} from './streamController';

// ─── UNIFIED API CLIENT ──────────────────────────────────────────────────────
//
// callAIWithDedup is preserved for backward compatibility but now delegates to
// the unified AIResponseCache + RequestDeduplicator from requestPipeline.ts.
// New code should use callByTask() or callAIManaged() instead.
//

import type { AIConfig } from './types';
import {
    AIResponseCache,
    RequestDeduplicator,
    createCacheKey,
} from './requestPipeline';
import { getRateLimiter } from './rateLimiterRegistry';
import { withRetry } from './errors';

/** Shared singleton instances for the legacy callAIWithDedup path. */
const _legacyCache = new AIResponseCache();
const _legacyDedup = new RequestDeduplicator();

/**
 * Main entry point for AI calls with deduplication, caching, and rate limiting.
 *
 * Uses the unified AIResponseCache and RequestDeduplicator — no more
 * parallel Map instances. For new code, prefer callByTask() or callAIManaged().
 */
export async function callAIWithDedup(prompt: string, config: AIConfig): Promise<string> {
    const cacheKey = createCacheKey({
        provider: config.provider,
        model: config.model,
        prompt,
    });

    // Check cache first (unified AIResponseCache)
    const cached = _legacyCache.get(cacheKey);
    if (cached !== null) return cached;

    // Dedup + execute (unified RequestDeduplicator)
    const { result } = await _legacyDedup.execute(
        cacheKey,
        async () => {
            const prepared = prepareAICall(prompt, config);
            const limiter = getRateLimiter(config.provider);
            await limiter.acquire({ requests: 1, tokens: prepared.tokenPlan.totalBudgetTokens });
            return withRetry(() => callAI(prompt, config, prepared), config.provider);
        },
    );

    // Cache on success
    _legacyCache.set(cacheKey, result, { provider: config.provider, model: config.model });
    return result;
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

// ─── LEGACY COMPAT: getCacheKey, getCached, setCache ──────────────────────────
//
// These are preserved for any external consumers that imported them directly.
// They now delegate to the unified AIResponseCache.
//

/**
 * @deprecated Use createCacheKey() from requestPipeline instead.
 */
export function getCacheKey(prompt: string, provider: string, model = ''): string {
    return createCacheKey({ provider, model, prompt });
}

/**
 * @deprecated Use AIResponseCache.get() instead.
 */
export function getCached(key: string): string | null {
    return _legacyCache.get(key);
}

/**
 * @deprecated Use AIResponseCache.set() instead.
 */
export function setCache(key: string, value: string, provider: string): void {
    _legacyCache.set(key, value, { provider });
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

const defaultAIManager = new AIManager();

export function getDefaultAIManager(): AIManager {
    return defaultAIManager;
}

export async function callAIManaged(
    prompt: string,
    config: AIConfig,
    options?: AIManagerOptions,
): Promise<AIManagerResult> {
    return defaultAIManager.generate(prompt, config, options);
}

export async function* streamAIManaged(
    prompt: string,
    config: AIConfig,
    options?: AIManagerOptions,
): AsyncGenerator<string> {
    yield* defaultAIManager.stream(prompt, config, options);
}
