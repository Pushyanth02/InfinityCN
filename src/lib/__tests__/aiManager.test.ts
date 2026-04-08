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

        const result = await manager.generate('test', createConfig('openai'));

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

        const result = await manager.generate('test', createConfig('openai'), { maxRetries: 0 });

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
            if (attempts < 3) throw new Error('temporary failure');
            return 'recovered';
        });
        const manager = new AIManager([flaky], ['openai']);

        const promise = manager.generate('test', createConfig('openai'), {
            maxRetries: 2,
            baseDelayMs: 100,
        });

        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.text).toBe('recovered');
        expect(attempts).toBe(3);
        expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
        expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);
    });
});

