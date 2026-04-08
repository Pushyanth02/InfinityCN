/**
 * ai/manager.ts — AI Orchestration Layer
 *
 * Provides a modular AIManager with:
 * - Provider interface
 * - OpenAI / Gemini / Claude adapters
 * - fallback provider sequencing
 * - retry with exponential backoff
 */

import { AI_MAX_RETRY_DELAY_MS } from '../constants';
import { callAI, prepareAICall } from './providers';
import { getRateLimiter } from './streaming';
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
}

export interface AIManagerResult {
    text: string;
    providerUsed: AIManagerProvider;
    attemptedProviders: AIManagerProvider[];
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

    private resolveProviderOrder(config: AIConfig, options?: AIManagerOptions): AIManagerProvider[] {
        if (options?.providerOrder && options.providerOrder.length > 0) {
            return dedupeProviders(options.providerOrder).filter(provider =>
                this.providers.has(provider),
            );
        }

        const primary = this.resolvePrimaryProvider(config.provider);
        const baseOrder = primary
            ? [primary, ...this.defaultProviderOrder.filter(provider => provider !== primary)]
            : this.defaultProviderOrder;

        return baseOrder.filter(provider => this.providers.has(provider));
    }

    private async generateWithRetry(
        provider: Provider,
        prompt: string,
        config: AIConfig,
        maxRetries: number,
        baseDelayMs: number,
    ): Promise<string> {
        let lastError: unknown;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await provider.generate(prompt, config);
            } catch (error) {
                lastError = error;
                if (attempt >= maxRetries) break;

                const delay = Math.min(baseDelayMs * Math.pow(2, attempt), AI_MAX_RETRY_DELAY_MS);
                await sleep(delay);
            }
        }

        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }

    async generate(
        prompt: string,
        config: AIConfig,
        options?: AIManagerOptions,
    ): Promise<AIManagerResult> {
        const providerOrder = this.resolveProviderOrder(config, options);
        if (providerOrder.length === 0) {
            throw new Error('No AI providers are configured for AIManager.');
        }

        const maxRetries = options?.maxRetries ?? 2;
        const baseDelayMs = options?.baseDelayMs ?? 1500;
        const attemptedProviders: AIManagerProvider[] = [];
        const providerErrors: string[] = [];

        for (const providerName of providerOrder) {
            const provider = this.providers.get(providerName);
            if (!provider) continue;

            attemptedProviders.push(providerName);

            try {
                const text = await this.generateWithRetry(
                    provider,
                    prompt,
                    config,
                    maxRetries,
                    baseDelayMs,
                );

                if (!text.trim()) {
                    throw new Error(`Empty response from provider: ${providerName}`);
                }

                return {
                    text,
                    providerUsed: providerName,
                    attemptedProviders,
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
}

