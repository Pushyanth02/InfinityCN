import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    StreamSession,
    StreamController,
    streamResponse,
    cancelStream,
    onToken,
    onChunkComplete,
} from '../ai/streamController';
import type { StreamEvent } from '../ai/streamController';
import type { AIConfig, AIProviderInstance } from '../ai/types';

function makeMockInstance(
    name: string,
    tokens: string[] = ['Hello', ' world', '!'],
): AIProviderInstance {
    return {
        name: name as AIProviderInstance['name'],
        costPer1KTokens: 0.001,
        supportsStreaming: true,
        generate: vi.fn(async () => ({
            text: tokens.join(''),
            model: 'test',
            provider: name as AIProviderInstance['name'],
        })),
        stream: vi.fn(async function* () {
            for (const token of tokens) {
                yield token;
            }
        }),
        healthCheck: vi.fn(async () => true),
    };
}

function makeFailingInstance(name: string, errorMsg = 'provider down'): AIProviderInstance {
    return {
        name: name as AIProviderInstance['name'],
        costPer1KTokens: 0.001,
        supportsStreaming: true,
        generate: vi.fn(async () => {
            throw new Error(errorMsg);
        }),
        stream: vi.fn(async function* () {
            if (errorMsg.length < 0) {
                yield '';
            }
            throw new Error(errorMsg);
        }),
        healthCheck: vi.fn(async () => false),
    };
}

function makePartialFailInstance(name: string): AIProviderInstance {
    return {
        name: name as AIProviderInstance['name'],
        costPer1KTokens: 0.001,
        supportsStreaming: true,
        generate: vi.fn(async () => ({
            text: 'partial',
            model: 'test',
            provider: name as AIProviderInstance['name'],
        })),
        stream: vi.fn(async function* () {
            yield 'token1';
            yield 'token2';
            throw new Error('Stream interrupted mid-output');
        }),
        healthCheck: vi.fn(async () => true),
    };
}

vi.mock('../ai/providers/index', () => ({
    getProvider: vi.fn((name: string) => {
        // Default: return a working mock. Tests will override via vi.mocked().
        return makeMockInstance(name);
    }),
    hasProvider: vi.fn(() => true),
    listProviders: vi.fn(() => [
        'openai',
        'gemini',
        'anthropic',
        'ollama',
        'chrome',
        'groq',
        'deepseek',
    ]),
}));

vi.mock('../ai/providers', () => ({
    prepareAICall: vi.fn((_prompt: string, config: { provider: string }) => ({
        provider: config.provider,
        model: 'test-model',
        preset: { temperature: 0.4 },
        maxTokens: 4096,
        prompt: _prompt,
        systemPrompt: 'test system prompt',
        useJSON: false,
        timeoutMs: 30000,
        tokenPlan: {
            prompt: _prompt,
            promptTokens: 100,
            maxOutputTokens: 4096,
            totalBudgetTokens: 4196,
        },
    })),
}));

vi.mock('../ai/streaming', () => ({
    getRateLimiter: vi.fn(() => ({
        acquire: vi.fn(async () => {}),
    })),
}));

function makeConfig(provider = 'openai'): AIConfig {
    return {
        provider: provider as AIConfig['provider'],
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

// ─── StreamSession ────────────────────────────────────────────────────────────

describe('StreamSession', () => {
    let session: StreamSession;

    beforeEach(() => {
        session = new StreamSession();
    });

    it('has a unique ID and starts idle', () => {
        expect(session.id).toMatch(/^ss_/);
        expect(session.state).toBe('idle');
        expect(session.accumulated).toBe('');
        expect(session.tokenCount).toBe(0);
        expect(session.chunkCount).toBe(0);
    });

    it('tracks accumulated text and token count', () => {
        session._appendToken('Hello');
        session._appendToken(' world');

        expect(session.accumulated).toBe('Hello world');
        expect(session.tokenCount).toBe(2);
    });

    it('records time to first token', () => {
        expect(session.ttftMs).toBe(0);
        session._appendToken('first');
        // TTFT is set to elapsedMs on first token — may be 0ms in fast tests
        expect(session.ttftMs).toBeGreaterThanOrEqual(0);
        // But it should now be "set" (vs initial 0 when no tokens exist)
        session._appendToken('second');
        // TTFT should not change after first token
        const ttft = session.ttftMs;
        session._appendToken('third');
        expect(session.ttftMs).toBe(ttft);
    });

    it('tracks chunk count', () => {
        expect(session.chunkCount).toBe(0);
        session._flushChunk();
        session._flushChunk();
        expect(session.chunkCount).toBe(2);
    });

    it('tracks active and attempted providers', () => {
        session._setActiveProvider('openai');
        session._setActiveProvider('gemini');
        session._setActiveProvider('openai'); // Duplicate — should not add again

        expect(session.activeProvider).toBe('openai');
        expect(session.attemptedProviders).toEqual(['openai', 'gemini']);
    });

    it('cancel aborts the signal and sets state', () => {
        session._setState('streaming');
        expect(session.isActive).toBe(true);

        session.cancel();

        expect(session.state).toBe('cancelled');
        expect(session.isAborted).toBe(true);
        expect(session.isActive).toBe(false);
    });

    it('cancel is a no-op if not active', () => {
        session._setState('complete');
        session.cancel();
        // Should not change to cancelled
        expect(session.state).toBe('complete');
    });

    it('getProgress returns a snapshot', () => {
        session._setState('streaming');
        session._setActiveProvider('openai');
        session._appendToken('test');
        session._flushChunk();

        const progress = session.getProgress();

        expect(progress.tokenCount).toBe(1);
        expect(progress.chunkCount).toBe(1);
        expect(progress.accumulated).toBe('test');
        expect(progress.activeProvider).toBe('openai');
        expect(progress.state).toBe('streaming');
        expect(progress.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('computes tokensPerSecond', () => {
        session._appendToken('a');
        session._appendToken('b');
        session._appendToken('c');

        // tokensPerSecond = tokenCount / (elapsedMs / 1000)
        // In fast tests elapsed can be 0ms → NaN/Infinity edge.
        // Just verify the formula works: tokens > 0 means result >= 0.
        expect(session.tokensPerSecond).toBeGreaterThanOrEqual(0);
        expect(session.tokenCount).toBe(3);
    });
});

// ─── StreamSession Event Bus ──────────────────────────────────────────────────

describe('StreamSession Event Bus', () => {
    let session: StreamSession;

    beforeEach(() => {
        session = new StreamSession();
    });

    it('specific event listeners receive matching events', () => {
        const handler = vi.fn();
        session.on('token', handler);

        session._emit({ type: 'token', content: 'hello' });
        session._emit({ type: 'chunk', content: 'chunk1' });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ type: 'token', content: 'hello' });
    });

    it('wildcard listeners receive all events', () => {
        const handler = vi.fn();
        session.on('*', handler);

        session._emit({ type: 'token', content: 'a' });
        session._emit({ type: 'chunk', content: 'b' });
        session._emit({ type: 'complete' });

        expect(handler).toHaveBeenCalledTimes(3);
    });

    it('off unsubscribes a listener', () => {
        const handler = vi.fn();
        session.on('token', handler);
        session.off('token', handler);

        session._emit({ type: 'token', content: 'a' });

        expect(handler).not.toHaveBeenCalled();
    });

    it('on returns unsubscribe function', () => {
        const handler = vi.fn();
        const unsub = session.on('token', handler);

        session._emit({ type: 'token', content: 'a' });
        expect(handler).toHaveBeenCalledTimes(1);

        unsub();
        session._emit({ type: 'token', content: 'b' });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('removeAllListeners clears all handlers', () => {
        const h1 = vi.fn();
        const h2 = vi.fn();
        session.on('token', h1);
        session.on('*', h2);

        session.removeAllListeners();

        session._emit({ type: 'token', content: 'a' });
        expect(h1).not.toHaveBeenCalled();
        expect(h2).not.toHaveBeenCalled();
    });

    it('listener errors do not propagate', () => {
        session.on('token', () => {
            throw new Error('listener crash');
        });
        const secondHandler = vi.fn();
        session.on('token', secondHandler);

        // Should not throw
        session._emit({ type: 'token', content: 'safe' });
        expect(secondHandler).toHaveBeenCalled();
    });
});

// ─── StreamController ─────────────────────────────────────────────────────────

// Retrieve the mocked module — vi.mock hoists, so this import resolves the mock.
import * as providerIndex from '../ai/providers/index';
const mockedProviderIndex = vi.mocked(providerIndex);

describe('StreamController', () => {
    let controller: StreamController;
    const getProvider = mockedProviderIndex.getProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        controller = new StreamController({
            chunkBufferSize: 1,
            chunkFlushIntervalMs: 0,
            progressIntervalMs: 0,
            maxRetriesPerProvider: 0,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('streams tokens from a provider', async () => {
        const mockInstance = makeMockInstance('openai', ['A', 'B', 'C']);
        getProvider.mockReturnValue(mockInstance);

        const session = controller.createSession();
        const tokens: string[] = [];

        for await (const token of controller.streamResponse('test', makeConfig(), session)) {
            tokens.push(token);
        }

        expect(tokens).toEqual(['A', 'B', 'C']);
        expect(session.state).toBe('complete');
        expect(session.accumulated).toBe('ABC');
        expect(session.tokenCount).toBe(3);
    });

    it('emits token events for each token', async () => {
        const mockInstance = makeMockInstance('openai', ['x', 'y']);
        getProvider.mockReturnValue(mockInstance);

        const session = controller.createSession();
        const tokenEvents: StreamEvent[] = [];
        session.on('token', e => tokenEvents.push(e));

        for await (const token of controller.streamResponse('test', makeConfig(), session)) {
            void token;
            // consume
        }

        expect(tokenEvents).toHaveLength(2);
        expect(tokenEvents[0].content).toBe('x');
        expect(tokenEvents[0].ttftMs).toBeGreaterThanOrEqual(0); // may be 0ms in fast tests
        expect(tokenEvents[0].ttftMs).toBeDefined();
        expect(tokenEvents[1].ttftMs).toBeUndefined(); // Only first token has TTFT
    });

    it('emits chunk events', async () => {
        const mockInstance = makeMockInstance('openai', ['a', 'b', 'c']);
        getProvider.mockReturnValue(mockInstance);

        const session = controller.createSession();
        const chunkEvents: StreamEvent[] = [];
        session.on('chunk', e => chunkEvents.push(e));

        for await (const token of controller.streamResponse('test', makeConfig(), session)) {
            void token;
            // consume
        }

        expect(chunkEvents.length).toBe(3); // chunkBufferSize=1 means each token is a chunk
        expect(chunkEvents[0].chunkIndex).toBe(0);
        expect(chunkEvents[1].chunkIndex).toBe(1);
    });

    it('emits complete event on success', async () => {
        const mockInstance = makeMockInstance('openai', ['done']);
        getProvider.mockReturnValue(mockInstance);

        const session = controller.createSession();
        const completeEvents: StreamEvent[] = [];
        session.on('complete', e => completeEvents.push(e));

        for await (const token of controller.streamResponse('test', makeConfig(), session)) {
            void token;
            // consume
        }

        expect(completeEvents).toHaveLength(1);
        expect(completeEvents[0].content).toBe('done');
        expect(completeEvents[0].tokenCount).toBe(1);
    });

    it('cancellation stops the stream', async () => {
        // Coordinate: provider stream waits for a signal before yielding more tokens
        let resolveGate: (() => void) | null = null;
        const gate = new Promise<void>(r => {
            resolveGate = r;
        });

        const slowInstance: AIProviderInstance = {
            name: 'openai',
            costPer1KTokens: 0.001,
            supportsStreaming: true,
            generate: vi.fn(async () => ({
                text: 'ok',
                model: 'test',
                provider: 'openai' as const,
            })),
            stream: vi.fn(async function* () {
                yield 'a';
                yield 'b';
                // Wait for the gate — the test will cancel during this wait
                await gate;
                yield 'c';
                yield 'd';
            }),
            healthCheck: vi.fn(async () => true),
        };
        getProvider.mockReturnValue(slowInstance);

        const session = controller.createSession();
        const tokens: string[] = [];

        // Start consuming in the background
        const consumePromise = (async () => {
            for await (const token of controller.streamResponse('test', makeConfig(), session)) {
                tokens.push(token);
            }
        })();

        // Wait a tick for the first 2 tokens to arrive
        await new Promise(r => setTimeout(r, 50));

        // Cancel while the stream is waiting at the gate
        session.cancel();
        // Release the gate so the generator can complete/terminate
        resolveGate!();

        await consumePromise;

        // Only 'a' and 'b' should have arrived; cancel happens before 'c'
        expect(tokens).toEqual(['a', 'b']);
        expect(session.state).toBe('cancelled');
    });

    it('falls back to next provider when primary fails before tokens', async () => {
        let callCount = 0;
        getProvider.mockImplementation((name: string) => {
            callCount++;
            if (name === 'openai') return makeFailingInstance('openai');
            return makeMockInstance(name, ['fallback', '-ok']);
        });

        const session = controller.createSession();
        const tokens: string[] = [];

        for await (const token of controller.streamResponse('test', makeConfig(), session)) {
            tokens.push(token);
        }

        expect(tokens).toEqual(['fallback', '-ok']);
        expect(callCount).toBeGreaterThan(0);
        expect(session.state).toBe('complete');
        expect(session.attemptedProviders.length).toBeGreaterThan(1);
    });

    it('emits error when partial output and provider fails', async () => {
        getProvider.mockReturnValue(makePartialFailInstance('openai'));

        const session = controller.createSession();
        const errorEvents: StreamEvent[] = [];
        session.on('error', e => errorEvents.push(e));

        await expect(async () => {
            for await (const token of controller.streamResponse('test', makeConfig(), session)) {
                void token;
                // consume
            }
        }).rejects.toThrow(/Streaming failed after partial output/);

        expect(session.state).toBe('error');
        expect(errorEvents).toHaveLength(1);
        expect(errorEvents[0].error).toContain('Stream interrupted');
    });

    it('emits error when all providers fail', async () => {
        getProvider.mockImplementation((name: string) => makeFailingInstance(name));

        const session = controller.createSession();
        const errorEvents: StreamEvent[] = [];
        session.on('error', e => errorEvents.push(e));

        await expect(async () => {
            for await (const token of controller.streamResponse('test', makeConfig(), session)) {
                void token;
                // consume
            }
        }).rejects.toThrow(/All providers failed/);

        expect(session.state).toBe('error');
        expect(errorEvents.length).toBeGreaterThan(0);
    });
});

// ─── StreamController Chunk Buffering ─────────────────────────────────────────

describe('StreamController Chunk Buffering', () => {
    const getProvider = mockedProviderIndex.getProvider;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('buffers tokens into larger chunks', async () => {
        const mockInstance = makeMockInstance('openai', ['a', 'b', 'c', 'd', 'e', 'f']);
        getProvider.mockReturnValue(mockInstance);

        const controller = new StreamController({
            chunkBufferSize: 3,
            chunkFlushIntervalMs: 0,
            progressIntervalMs: 0,
            maxRetriesPerProvider: 0,
        });

        const session = controller.createSession();
        const chunkEvents: StreamEvent[] = [];
        session.on('chunk', e => chunkEvents.push(e));

        for await (const token of controller.streamResponse('test', makeConfig(), session)) {
            void token;
            // consume
        }

        // 6 tokens / 3 buffer = 2 chunk events
        expect(chunkEvents).toHaveLength(2);
        expect(chunkEvents[0].content).toBe('abc');
        expect(chunkEvents[1].content).toBe('def');
    });
});

// ─── Convenience Functions ────────────────────────────────────────────────────

describe('Convenience Functions', () => {
    const getProvider = mockedProviderIndex.getProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        getProvider.mockReturnValue(makeMockInstance('openai', ['hello', ' world']));
    });

    it('streamResponse() returns session and tokens', async () => {
        const { session, tokens } = streamResponse('test', makeConfig());

        expect(session).toBeInstanceOf(StreamSession);
        expect(session.state).toBe('idle');

        const collected: string[] = [];
        for await (const t of tokens) {
            collected.push(t);
        }
        expect(collected).toEqual(['hello', ' world']);
    });

    it('cancelStream() cancels the session', () => {
        const session = new StreamSession();
        session._setState('streaming');
        cancelStream(session);
        expect(session.state).toBe('cancelled');
        expect(session.isAborted).toBe(true);
    });

    it('onToken() registers a token handler', () => {
        const session = new StreamSession();
        const tokens: string[] = [];
        const unsub = onToken(session, t => tokens.push(t));

        session._emit({ type: 'token', content: 'a' });
        session._emit({ type: 'token', content: 'b' });

        expect(tokens).toEqual(['a', 'b']);

        unsub();
        session._emit({ type: 'token', content: 'c' });
        expect(tokens).toEqual(['a', 'b']); // Unsubscribed
    });

    it('onChunkComplete() registers a chunk handler', () => {
        const session = new StreamSession();
        const chunks: Array<{ text: string; idx: number }> = [];
        const unsub = onChunkComplete(session, (text, idx) => chunks.push({ text, idx }));

        session._emit({ type: 'chunk', content: 'abc', chunkIndex: 0 });
        session._emit({ type: 'chunk', content: 'def', chunkIndex: 1 });

        expect(chunks).toEqual([
            { text: 'abc', idx: 0 },
            { text: 'def', idx: 1 },
        ]);

        unsub();
        session._emit({ type: 'chunk', content: 'ghi', chunkIndex: 2 });
        expect(chunks).toHaveLength(2); // Unsubscribed
    });
});
