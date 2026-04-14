import { describe, it, expect, vi, afterEach } from 'vitest';
import { AIManager } from '../ai/manager';
import type { Provider, AIManagerProvider } from '../ai/manager';
import type { AIConfig } from '../ai/types';

function createConfig(provider: AIConfig['provider']): AIConfig {
    return {
        provider,
        model: '',
        universalApiKey: '',
        geminiKey: 'g',
        useSearchGrounding: false,
        openAiKey: 'o',
        anthropicKey: 'a',
        groqKey: '',
        deepseekKey: '',
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: 'llama3',
    };
}

function createProvider(name: AIManagerProvider, generate: Provider['generate']): Provider {
    return {
        name,
        generate,
    };
}

describe('AIManager', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('uses primary provider when it succeeds', async () => {
        const openai = createProvider('openai', async () => 'openai-response');
        const gemini = createProvider('gemini', async () => 'gemini-response');
        const claude = createProvider('claude', async () => 'claude-response');
        const manager = new AIManager([openai, gemini, claude]);
        const prompt = `primary-${Date.now()}`;

        const result = await manager.generate(prompt, createConfig('openai'));

        expect(result.providerUsed).toBe('openai');
        expect(result.text).toBe('openai-response');
        expect(result.attemptedProviders).toEqual(['openai']);
    });

    it('falls back to next provider when primary fails', async () => {
        const openai = createProvider('openai', async () => {
            throw new Error('openai-down');
        });
        const gemini = createProvider('gemini', async () => 'gemini-response');
        const claude = createProvider('claude', async () => 'claude-response');
        const manager = new AIManager([openai, gemini, claude], ['openai', 'gemini', 'claude']);
        const prompt = `fallback-${Date.now()}`;

        const result = await manager.generate(prompt, createConfig('openai'), { maxRetries: 0 });

        expect(result.providerUsed).toBe('gemini');
        expect(result.text).toBe('gemini-response');
        expect(result.attemptedProviders).toEqual(['openai', 'gemini']);
    });

    it('retries with exponential backoff before succeeding', async () => {
        vi.useFakeTimers();
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

        let attempts = 0;
        const flaky = createProvider('openai', async () => {
            attempts += 1;
            if (attempts < 3) throw new Error('network failure');
            return 'recovered';
        });
        const manager = new AIManager([flaky], ['openai']);
        const prompt = `retry-${Date.now()}`;

        const promise = manager.generate(prompt, createConfig('openai'), {
            maxRetries: 2,
            baseDelayMs: 100,
        });

        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.text).toBe('recovered');
        expect(attempts).toBe(3);
        expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 2000);
        expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 2000);
    });

    it('uses cache for repeated prompt/provider calls', async () => {
        const generate = vi.fn(async () => 'cached-response');
        const openai = createProvider('openai', generate);
        const manager = new AIManager([openai], ['openai']);
        const prompt = `cache-${Date.now()}`;

        const first = await manager.generate(prompt, createConfig('openai'));
        const second = await manager.generate(prompt, createConfig('openai'));

        expect(first.cacheHit).toBe(false);
        expect(second.cacheHit).toBe(true);
        expect(generate).toHaveBeenCalledTimes(1);
    });

    it('reorders fallback providers by estimated cost when enabled', async () => {
        const openai = createProvider('openai', async () => {
            throw new Error('openai-down');
        });
        const claudeGenerate = vi.fn(async () => 'claude-response');
        const geminiGenerate = vi.fn(async () => 'gemini-response');

        const manager = new AIManager(
            [
                openai,
                createProvider('claude', claudeGenerate),
                createProvider('gemini', geminiGenerate),
            ],
            ['openai', 'claude', 'gemini'],
        );

        const result = await manager.generate(`cost-route-${Date.now()}`, createConfig('openai'), {
            maxRetries: 0,
            preferLowerCost: true,
        });

        expect(result.providerUsed).toBe('gemini');
        expect(result.attemptedProviders).toEqual(['openai', 'gemini']);
        expect(claudeGenerate).not.toHaveBeenCalled();
        expect(geminiGenerate).toHaveBeenCalledTimes(1);
    });

    it('skips providers that exceed maxCostUsd guardrail', async () => {
        const claudeGenerate = vi.fn(async () => 'claude-response');
        const openaiGenerate = vi.fn(async () => 'openai-response');
        const geminiGenerate = vi.fn(async () => 'gemini-response');

        const manager = new AIManager(
            [
                createProvider('claude', claudeGenerate),
                createProvider('openai', openaiGenerate),
                createProvider('gemini', geminiGenerate),
            ],
            ['claude', 'openai', 'gemini'],
        );

        const result = await manager.generate(
            `budget-route-${Date.now()}`,
            createConfig('anthropic'),
            {
                maxRetries: 0,
                maxCostUsd: 0.00035,
            },
        );

        expect(result.providerUsed).toBe('gemini');
        expect(result.attemptedProviders).toEqual(['gemini']);
        expect(claudeGenerate).not.toHaveBeenCalled();
        expect(openaiGenerate).not.toHaveBeenCalled();
        expect(geminiGenerate).toHaveBeenCalledTimes(1);
    });
});
