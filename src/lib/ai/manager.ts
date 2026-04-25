/**
 * ai/manager.ts — AI Orchestration Layer
 *
 * Provides a modular AIManager with:
 * - Provider interface
 * - OpenAI / Gemini / Claude adapters
 * - fallback provider sequencing
 * - retry with exponential backoff (via RetryPolicy)
 * - request caching (via AIResponseCache) and inflight deduplication (via RequestDeduplicator)
 * - cost-aware routing and budget guardrails
 * - streaming fallback between providers
 *
 * Consolidation: cache, dedup, and retry are now delegated to requestPipeline.ts
 * components instead of maintaining parallel implementations.
 */

import { AI_MAX_RETRY_DELAY_MS } from '../constants';
import {
    AIResponseCache,
    RequestDeduplicator,
    createCacheKey,
} from './requestPipeline';
import {
    estimateProviderCallCostUsd,
    isWithinCostBudget,
    sortProvidersByEstimatedCost,
} from './costControl';
import { classifyError } from './errors';
import { callAI, prepareAICall } from './providers';
import type { PreparedAICall } from './providers';
import { getRateLimiter } from './rateLimiterRegistry';
import { streamAI } from './streaming';
import { estimateTokens } from './tokenFlow';
import type { AIConfig } from './types';

export type AIManagerProvider = 'openai' | 'gemini' | 'claude';

export interface Provider {
    readonly name: AIManagerProvider;
    generate(prompt: string, config: AIConfig): Promise<string>;
}

export interface AIManagerOptions {
    providerOrder?: AIManagerProvider[];
    maxRetries?: number;
    baseDelayMs?: number;
    useCache?: boolean;
    /** Sort fallback providers by estimated cost while preserving primary provider priority. */
    preferLowerCost?: boolean;
    /** Skip provider attempts whose estimated call cost exceeds this USD budget. */
    maxCostUsd?: number;
}

export interface AIManagerResult {
    text: string;
    providerUsed: AIManagerProvider;
    attemptedProviders: AIManagerProvider[];
    cacheHit: boolean;
    estimatedCostUsd: number;
    actualCostUsd: number;
}

export interface AIManagerCostSummary {
    estimatedUsd: number;
    actualUsd: number;
}

const PROVIDER_MAP: Record<AIManagerProvider, AIConfig['provider']> = {
    openai: 'openai',
    gemini: 'gemini',
    claude: 'anthropic',
};

const DEFAULT_PROVIDER_ORDER: AIManagerProvider[] = ['openai', 'gemini', 'claude'];

class NetworkProviderAdapter implements Provider {
    readonly name: AIManagerProvider;

    constructor(name: AIManagerProvider) {
        this.name = name;
    }

    async generate(prompt: string, config: AIConfig): Promise<string> {
        const mappedProvider = PROVIDER_MAP[this.name];
        const providerConfig: AIConfig = {
            ...config,
            provider: mappedProvider,
        };

        const prepared = prepareAICall(prompt, providerConfig);
        const limiter = getRateLimiter(mappedProvider);
        await limiter.acquire({ requests: 1, tokens: prepared.tokenPlan.totalBudgetTokens });

        return callAI(prompt, providerConfig, prepared);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function dedupeProviders(providers: AIManagerProvider[]): AIManagerProvider[] {
    const deduped: AIManagerProvider[] = [];
    for (const provider of providers) {
        if (!deduped.includes(provider)) deduped.push(provider);
    }
    return deduped;
}

export class AIManager {
    private readonly providers = new Map<AIManagerProvider, Provider>();
    private readonly defaultProviderOrder: AIManagerProvider[];

    /**
     * Unified cache — replaces the old simple LRU from cache.ts.
     * Supports TTL, LRU eviction, scene-level dedup, and hit/miss stats.
     */
    private readonly cache = new AIResponseCache();

    /**
     * Unified deduplicator — replaces the old inline inflightRequests Map.
     * Supports both request-level and scene-level dedup with stats.
     */
    private readonly deduplicator = new RequestDeduplicator();

    private estimatedSpendUsd = 0;
    private actualSpendUsd = 0;

    constructor(
        providers: Provider[] = [
            new NetworkProviderAdapter('openai'),
            new NetworkProviderAdapter('gemini'),
            new NetworkProviderAdapter('claude'),
        ],
        defaultProviderOrder: AIManagerProvider[] = DEFAULT_PROVIDER_ORDER,
    ) {
        for (const provider of providers) {
            this.providers.set(provider.name, provider);
        }
        this.defaultProviderOrder = dedupeProviders(defaultProviderOrder);
    }

    private resolvePrimaryProvider(provider: AIConfig['provider']): AIManagerProvider | null {
        if (provider === 'openai' || provider === 'gemini') return provider;
        if (provider === 'anthropic') return 'claude';
        return null;
    }

    private createProviderConfig(config: AIConfig, providerName: AIManagerProvider): AIConfig {
        return {
            ...config,
            provider: PROVIDER_MAP[providerName],
        };
    }

    private buildCacheKey(prompt: string, providerName: AIManagerProvider, model: string): string {
        return createCacheKey({
            provider: providerName,
            model,
            prompt,
        });
    }

    private prepareProviderCall(
        prompt: string,
        config: AIConfig,
        providerName: AIManagerProvider,
    ): { providerConfig: AIConfig; prepared: PreparedAICall; cacheKey: string } {
        const providerConfig = this.createProviderConfig(config, providerName);
        const prepared = prepareAICall(prompt, providerConfig);
        const cacheKey = this.buildCacheKey(prompt, providerName, prepared.model);

        return {
            providerConfig,
            prepared,
            cacheKey,
        };
    }

    private estimateCallCost(
        providerName: AIManagerProvider,
        prepared: PreparedAICall,
        outputTokens: number,
    ): number {
        return estimateProviderCallCostUsd(
            providerName,
            prepared.tokenPlan.promptTokens,
            outputTokens,
        );
    }

    private estimateMaxCostSafe(
        providerName: AIManagerProvider,
        prompt: string,
        config: AIConfig,
    ): number {
        try {
            const { prepared } = this.prepareProviderCall(prompt, config, providerName);
            return this.estimateCallCost(providerName, prepared, prepared.maxTokens);
        } catch {
            return Number.POSITIVE_INFINITY;
        }
    }

    private resolveProviderOrder(
        config: AIConfig,
        prompt: string,
        options?: AIManagerOptions,
    ): AIManagerProvider[] {
        if (options?.providerOrder && options.providerOrder.length > 0) {
            return dedupeProviders(options.providerOrder).filter(provider =>
                this.providers.has(provider),
            );
        }

        const primary = this.resolvePrimaryProvider(config.provider);
        const baseOrder = primary
            ? [primary, ...this.defaultProviderOrder.filter(provider => provider !== primary)]
            : this.defaultProviderOrder;

        const availableOrder = baseOrder.filter(provider => this.providers.has(provider));
        if (!options?.preferLowerCost || availableOrder.length <= 1) {
            return availableOrder;
        }

        if (primary && availableOrder.includes(primary)) {
            const fallbackProviders = availableOrder.filter(provider => provider !== primary);
            const sortedFallback = sortProvidersByEstimatedCost(fallbackProviders, candidate =>
                this.estimateMaxCostSafe(candidate, prompt, config),
            );
            return [primary, ...sortedFallback];
        }

        return sortProvidersByEstimatedCost(availableOrder, candidate =>
            this.estimateMaxCostSafe(candidate, prompt, config),
        );
    }

    private recordCost(estimatedCostUsd: number, actualCostUsd: number): void {
        this.estimatedSpendUsd += estimatedCostUsd;
        this.actualSpendUsd += actualCostUsd;
    }

    getCostSummary(): AIManagerCostSummary {
        return {
            estimatedUsd: this.estimatedSpendUsd,
            actualUsd: this.actualSpendUsd,
        };
    }

    resetCostSummary(): void {
        this.estimatedSpendUsd = 0;
        this.actualSpendUsd = 0;
    }

    /** Get cache stats for diagnostics. */
    getCacheStats() {
        return this.cache.getStats();
    }

    /** Get dedup stats for diagnostics. */
    getDedupStats() {
        return this.deduplicator.getStats();
    }

    /** Clear all caches and reset stats. */
    resetCache(): void {
        this.cache.clear();
        this.cache.resetStats();
        this.deduplicator.resetStats();
    }

    async generate(
        prompt: string,
        config: AIConfig,
        options?: AIManagerOptions,
    ): Promise<AIManagerResult> {
        const providerOrder = this.resolveProviderOrder(config, prompt, options);
        if (providerOrder.length === 0) {
            throw new Error('No AI providers are configured for AIManager.');
        }

        const maxRetries = options?.maxRetries ?? 2;
        const baseDelayMs = options?.baseDelayMs ?? 1500;
        const useCache = options?.useCache ?? true;
        const attemptedProviders: AIManagerProvider[] = [];
        const providerErrors: string[] = [];

        for (const providerName of providerOrder) {
            const provider = this.providers.get(providerName);
            if (!provider) continue;

            let providerConfig: AIConfig;
            let prepared: PreparedAICall;
            let cacheKey: string;
            try {
                ({ providerConfig, prepared, cacheKey } = this.prepareProviderCall(
                    prompt,
                    config,
                    providerName,
                ));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                providerErrors.push(`${providerName}: ${message}`);
                continue;
            }

            const estimatedCostUsd = this.estimateCallCost(
                providerName,
                prepared,
                prepared.maxTokens,
            );
            if (!isWithinCostBudget(estimatedCostUsd, options?.maxCostUsd)) {
                providerErrors.push(
                    `${providerName}: estimated cost ${estimatedCostUsd.toFixed(6)} exceeds maxCostUsd ${
                        options?.maxCostUsd?.toFixed(6) ?? '0.000000'
                    }`,
                );
                continue;
            }

            // ── Cache check (unified AIResponseCache) ────────────────────
            if (useCache) {
                const cached = this.cache.get(cacheKey);
                if (cached !== null) {
                    return {
                        text: cached,
                        providerUsed: providerName,
                        attemptedProviders: [...attemptedProviders, providerName],
                        cacheHit: true,
                        estimatedCostUsd: 0,
                        actualCostUsd: 0,
                    };
                }
            }

            attemptedProviders.push(providerName);

            // ── Dedup + Retry execution ──────────────────────────────────
            try {
                const { result: text, deduplicated } = await this.deduplicator.execute(
                    cacheKey,
                    async () => {
                        // Retry loop inlined (replaces withRetry)
                        let lastError: unknown;
                        for (let attempt = 0; attempt <= maxRetries; attempt++) {
                            try {
                                return await provider.generate(prompt, providerConfig);
                            } catch (err) {
                                lastError = err;
                                const classified = classifyError(err, providerName);
                                if (!classified.retryable || attempt >= maxRetries) {
                                    throw classified;
                                }
                                const rawDelay =
                                    classified.retryAfterMs ??
                                    baseDelayMs * Math.pow(2, attempt);
                                const delay = Math.min(rawDelay, AI_MAX_RETRY_DELAY_MS);
                                await sleep(delay);
                            }
                        }
                        throw lastError;
                    },
                );

                if (!text.trim()) {
                    throw new Error(`Empty response from provider: ${providerName}`);
                }

                const actualOutputTokens = estimateTokens(text);
                const actualCostUsd = this.estimateCallCost(
                    providerName,
                    prepared,
                    actualOutputTokens,
                );
                this.recordCost(estimatedCostUsd, actualCostUsd);

                // Cache on success (unified AIResponseCache)
                if (useCache) {
                    this.cache.set(cacheKey, text, {
                        provider: prepared.provider,
                        model: prepared.model,
                    });
                }

                return {
                    text,
                    providerUsed: providerName,
                    attemptedProviders,
                    cacheHit: deduplicated,
                    estimatedCostUsd,
                    actualCostUsd,
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                providerErrors.push(`${providerName}: ${message}`);
            }
        }

        throw new Error(
            `AIManager failed across providers (${attemptedProviders.join(' -> ')}). ${providerErrors.join(' | ')}`,
        );
    }

    async *stream(
        prompt: string,
        config: AIConfig,
        options?: AIManagerOptions,
    ): AsyncGenerator<string> {
        const providerOrder = this.resolveProviderOrder(config, prompt, options);
        if (providerOrder.length === 0) {
            throw new Error('No AI providers are configured for AIManager streaming.');
        }

        const maxRetries = options?.maxRetries ?? 2;
        const baseDelayMs = options?.baseDelayMs ?? 1500;
        const useCache = options?.useCache ?? true;
        const attemptedProviders: AIManagerProvider[] = [];
        const providerErrors: string[] = [];

        for (const providerName of providerOrder) {
            let providerConfig: AIConfig;
            let prepared: PreparedAICall;
            let cacheKey: string;

            try {
                ({ providerConfig, prepared, cacheKey } = this.prepareProviderCall(
                    prompt,
                    config,
                    providerName,
                ));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                providerErrors.push(`${providerName}: ${message}`);
                continue;
            }

            const estimatedCostUsd = this.estimateCallCost(
                providerName,
                prepared,
                prepared.maxTokens,
            );
            if (!isWithinCostBudget(estimatedCostUsd, options?.maxCostUsd)) {
                providerErrors.push(
                    `${providerName}: estimated cost ${estimatedCostUsd.toFixed(6)} exceeds maxCostUsd ${
                        options?.maxCostUsd?.toFixed(6) ?? '0.000000'
                    }`,
                );
                continue;
            }

            // ── Cache check (unified AIResponseCache) ────────────────────
            if (useCache) {
                const cached = this.cache.get(cacheKey);
                if (cached !== null) {
                    yield cached;
                    return;
                }
            }

            attemptedProviders.push(providerName);

            let lastError: unknown;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                let output = '';
                let emittedAnyChunk = false;

                try {
                    for await (const chunk of streamAI(prompt, providerConfig)) {
                        emittedAnyChunk = true;
                        output += chunk;
                        yield chunk;
                    }

                    if (!output.trim()) {
                        throw new Error(`Empty response from provider: ${providerName}`);
                    }

                    const actualOutputTokens = estimateTokens(output);
                    const actualCostUsd = this.estimateCallCost(
                        providerName,
                        prepared,
                        actualOutputTokens,
                    );
                    this.recordCost(estimatedCostUsd, actualCostUsd);

                    // Cache on success (unified AIResponseCache)
                    if (useCache) {
                        this.cache.set(cacheKey, output, {
                            provider: prepared.provider,
                            model: prepared.model,
                        });
                    }

                    return;
                } catch (error) {
                    if (emittedAnyChunk) {
                        const message = error instanceof Error ? error.message : String(error);
                        throw new Error(
                            `Streaming failed after partial output on ${providerName}: ${message}`,
                            { cause: error },
                        );
                    }

                    const classified = classifyError(error, providerName);
                    lastError = classified;

                    if (!classified.retryable || attempt >= maxRetries) {
                        break;
                    }

                    const rawDelay = classified.retryAfterMs ?? baseDelayMs * Math.pow(2, attempt);
                    const delay = Math.min(rawDelay, AI_MAX_RETRY_DELAY_MS);
                    await sleep(delay);
                }
            }

            const finalMessage =
                lastError instanceof Error
                    ? lastError.message
                    : String(lastError ?? 'Unknown error');
            providerErrors.push(`${providerName}: ${finalMessage}`);
        }

        throw new Error(
            `AIManager streaming failed across providers (${attemptedProviders.join(' -> ')}). ${providerErrors.join(' | ')}`,
        );
    }
}
