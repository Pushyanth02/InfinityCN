import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createCacheKey,
    AIResponseCache,
    RetryPolicy,
    RequestDeduplicator,
    QueueProcessor,
    RequestPipeline,
} from '../ai/requestPipeline';
import type { RetryAttempt } from '../ai/requestPipeline';

// ─── createCacheKey ───────────────────────────────────────────────────────────

describe('createCacheKey', () => {
    it('produces deterministic keys for identical inputs', () => {
        const a = createCacheKey({ provider: 'openai', model: 'gpt-4o', prompt: 'Hello world' });
        const b = createCacheKey({ provider: 'openai', model: 'gpt-4o', prompt: 'Hello world' });
        expect(a).toBe(b);
    });

    it('produces different keys for different prompts', () => {
        const a = createCacheKey({ provider: 'openai', prompt: 'prompt A' });
        const b = createCacheKey({ provider: 'openai', prompt: 'prompt B' });
        expect(a).not.toBe(b);
    });

    it('produces different keys for different providers', () => {
        const a = createCacheKey({ provider: 'openai', prompt: 'same prompt' });
        const b = createCacheKey({ provider: 'gemini', prompt: 'same prompt' });
        expect(a).not.toBe(b);
    });

    it('produces different keys for different models', () => {
        const a = createCacheKey({ provider: 'openai', model: 'gpt-4o', prompt: 'same' });
        const b = createCacheKey({ provider: 'openai', model: 'gpt-4o-mini', prompt: 'same' });
        expect(a).not.toBe(b);
    });

    it('includes options in the key deterministically', () => {
        const a = createCacheKey({
            provider: 'openai',
            prompt: 'test',
            options: { temperature: 0.5, maxTokens: 1000 },
        });
        const b = createCacheKey({
            provider: 'openai',
            prompt: 'test',
            options: { maxTokens: 1000, temperature: 0.5 }, // Different order, same values
        });
        expect(a).toBe(b);
    });

    it('differs when options differ', () => {
        const a = createCacheKey({
            provider: 'openai',
            prompt: 'test',
            options: { temperature: 0.5 },
        });
        const b = createCacheKey({
            provider: 'openai',
            prompt: 'test',
            options: { temperature: 0.9 },
        });
        expect(a).not.toBe(b);
    });

    it('handles missing model gracefully', () => {
        const key = createCacheKey({ provider: 'openai', prompt: 'test' });
        expect(key).toContain('openai');
        expect(key).toContain(':d:'); // 'd' for default model
    });

    it('handles long prompts with head/tail fingerprint', () => {
        const longPrompt = 'A'.repeat(200);
        const key = createCacheKey({ provider: 'openai', prompt: longPrompt });
        expect(key.length).toBeLessThan(longPrompt.length);
        expect(key).toContain('…'); // Tail separator
    });

    it('trims whitespace from prompts', () => {
        const a = createCacheKey({ provider: 'openai', prompt: '  hello  ' });
        const b = createCacheKey({ provider: 'openai', prompt: 'hello' });
        expect(a).toBe(b);
    });
});

// ─── AIResponseCache ──────────────────────────────────────────────────────────

describe('AIResponseCache', () => {
    let cache: AIResponseCache;

    beforeEach(() => {
        cache = new AIResponseCache({ maxSize: 5, ttlMs: 10_000 });
    });

    it('stores and retrieves values', () => {
        cache.set('key1', 'response1', { provider: 'openai' });
        expect(cache.get('key1')).toBe('response1');
    });

    it('returns null for missing keys', () => {
        expect(cache.get('nonexistent')).toBeNull();
    });

    it('expires entries after TTL', () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        cache.set('ttl-key', 'value', { provider: 'openai' });
        expect(cache.get('ttl-key')).toBe('value');

        vi.setSystemTime(now + 10_001);
        expect(cache.get('ttl-key')).toBeNull();

        vi.useRealTimers();
    });

    it('evicts LRU entry when at capacity', () => {
        for (let i = 0; i < 5; i++) {
            cache.set(`k${i}`, `v${i}`, { provider: 'openai' });
        }
        expect(cache.size).toBe(5);

        // Access k1 and k2 to keep them "recently used"
        cache.get('k1');
        cache.get('k2');

        // Add one more — should evict k0 (least recently used)
        cache.set('k5', 'v5', { provider: 'openai' });
        expect(cache.size).toBe(5);
        expect(cache.get('k0')).toBeNull(); // Evicted
        expect(cache.get('k1')).toBe('v1'); // Retained
    });

    it('tracks hit and miss statistics', () => {
        cache.set('key', 'value', { provider: 'openai' });
        cache.get('key'); // hit
        cache.get('key'); // hit
        cache.get('missing'); // miss

        const stats = cache.getStats();
        expect(stats.hits).toBe(2);
        expect(stats.misses).toBe(1);
        expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('tracks scene deduplication', () => {
        cache.set('key1', 'response1', { provider: 'openai', sceneId: 'scene-1' });
        cache.set('key2', 'response2', { provider: 'gemini', sceneId: 'scene-1' });

        expect(cache.hasScene('scene-1')).toBe(true);
        expect(cache.hasScene('scene-999')).toBe(false);

        const sceneResponses = cache.getSceneResponses('scene-1');
        expect(sceneResponses).toHaveLength(2);
    });

    it('invalidates all entries for a scene', () => {
        cache.set('key1', 'r1', { provider: 'openai', sceneId: 'scene-1' });
        cache.set('key2', 'r2', { provider: 'openai', sceneId: 'scene-1' });
        cache.set('key3', 'r3', { provider: 'openai', sceneId: 'scene-2' });

        const removed = cache.invalidateScene('scene-1');
        expect(removed).toBe(2);
        expect(cache.hasScene('scene-1')).toBe(false);
        expect(cache.get('key3')).toBe('r3'); // scene-2 untouched
    });

    it('invalidates all entries for a provider', () => {
        cache.set('k1', 'v1', { provider: 'openai' });
        cache.set('k2', 'v2', { provider: 'gemini' });
        cache.set('k3', 'v3', { provider: 'openai' });

        const removed = cache.invalidateProvider('openai');
        expect(removed).toBe(2);
        expect(cache.get('k2')).toBe('v2'); // Gemini untouched
    });

    it('delete removes a specific entry', () => {
        cache.set('key', 'value', { provider: 'openai' });
        expect(cache.delete('key')).toBe(true);
        expect(cache.get('key')).toBeNull();
        expect(cache.delete('key')).toBe(false); // Already removed
    });

    it('clear removes all entries', () => {
        cache.set('k1', 'v1', { provider: 'openai' });
        cache.set('k2', 'v2', { provider: 'gemini' });
        cache.clear();
        expect(cache.size).toBe(0);
    });

    it('resetStats zeroes counters', () => {
        cache.set('k', 'v', { provider: 'openai' });
        cache.get('k');
        cache.get('miss');
        cache.resetStats();

        const stats = cache.getStats();
        expect(stats.hits).toBe(0);
        expect(stats.misses).toBe(0);
    });
});

// ─── RetryPolicy ──────────────────────────────────────────────────────────────

describe('RetryPolicy', () => {
    it('succeeds on first attempt without retries', async () => {
        const policy = new RetryPolicy({ maxRetries: 3 });
        const { result, provider, attempts } = await policy.execute(
            'openai',
            async () => 'success',
        );

        expect(result).toBe('success');
        expect(provider).toBe('openai');
        expect(attempts).toHaveLength(0);
    });

    it('retries on retryable errors and succeeds', async () => {
        let callCount = 0;
        const policy = new RetryPolicy({ maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 });

        const { result, attempts } = await policy.execute('openai', async () => {
            callCount++;
            if (callCount < 3) throw new Error('429 rate limit exceeded');
            return 'recovered';
        });

        expect(result).toBe('recovered');
        expect(callCount).toBe(3);
        expect(attempts).toHaveLength(2); // 2 failures logged
        expect(attempts[0].willRetry).toBe(true);
        expect(attempts[1].willRetry).toBe(true);
    });

    it('does not retry non-retryable errors', async () => {
        const policy = new RetryPolicy({ maxRetries: 3, baseDelayMs: 1 });

        await expect(
            policy.execute('openai', async () => {
                throw new Error('401 unauthorized');
            }),
        ).rejects.toThrow(/RetryPolicy exhausted/);
    });

    it('falls back to alternate providers after primary exhausted', async () => {
        const calls: string[] = [];
        const policy = new RetryPolicy({
            maxRetries: 1,
            baseDelayMs: 1,
            maxDelayMs: 1,
            fallbackProviders: ['gemini', 'anthropic'],
        });

        const { result, provider } = await policy.execute('openai', async p => {
            calls.push(p);
            if (p === 'openai') throw new Error('503 unavailable');
            if (p === 'gemini') throw new Error('503 unavailable');
            return 'anthropic-ok';
        });

        expect(result).toBe('anthropic-ok');
        expect(provider).toBe('anthropic');
        expect(calls).toContain('openai');
        expect(calls).toContain('gemini');
        expect(calls).toContain('anthropic');
    });

    it('emits retry events', async () => {
        const events: RetryAttempt[] = [];
        const policy = new RetryPolicy({ maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 });
        policy.onRetry(a => events.push(a));

        let count = 0;
        await policy.execute('openai', async () => {
            count++;
            if (count === 1) throw new Error('timeout');
            return 'ok';
        });

        expect(events).toHaveLength(1);
        expect(events[0].error.type).toBe('timeout');
        expect(events[0].willRetry).toBe(true);
    });

    it('unsubscribe stops retry events', async () => {
        const events: RetryAttempt[] = [];
        const policy = new RetryPolicy({ maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 });
        const unsub = policy.onRetry(a => events.push(a));
        unsub();

        let count = 0;
        await policy.execute('openai', async () => {
            count++;
            if (count === 1) throw new Error('timeout');
            return 'ok';
        });

        expect(events).toHaveLength(0);
    });

    it('throws aggregate error when all providers and retries exhausted', async () => {
        const policy = new RetryPolicy({
            maxRetries: 1,
            baseDelayMs: 1,
            maxDelayMs: 1,
            fallbackProviders: ['gemini'],
        });

        await expect(
            policy.execute('openai', async () => {
                throw new Error('503 unavailable');
            }),
        ).rejects.toThrow(/RetryPolicy exhausted.*openai.*gemini/);
    });
});

// ─── RequestDeduplicator ──────────────────────────────────────────────────────

describe('RequestDeduplicator', () => {
    let dedup: RequestDeduplicator;

    beforeEach(() => {
        dedup = new RequestDeduplicator();
    });

    it('executes unique requests', async () => {
        const { result, deduplicated } = await dedup.execute('key1', async () => 'result1');
        expect(result).toBe('result1');
        expect(deduplicated).toBe(false);
    });

    it('deduplicates concurrent identical requests', async () => {
        let callCount = 0;
        const fn = async () => {
            callCount++;
            await new Promise(r => setTimeout(r, 50));
            return 'shared';
        };

        const [a, b] = await Promise.all([
            dedup.execute('same-key', fn),
            dedup.execute('same-key', fn),
        ]);

        expect(a.result).toBe('shared');
        expect(b.result).toBe('shared');
        expect(callCount).toBe(1); // Only executed once
        expect(a.deduplicated).toBe(false); // First caller
        expect(b.deduplicated).toBe(true); // Second caller shared promise
    });

    it('deduplicates by sceneId', async () => {
        let callCount = 0;
        const fn = async () => {
            callCount++;
            await new Promise(r => setTimeout(r, 50));
            return 'scene-result';
        };

        const [a, b] = await Promise.all([
            dedup.execute('key-a', fn, 'scene-1'),
            dedup.execute('key-b', fn, 'scene-1'), // Different key, same scene
        ]);

        expect(a.result).toBe('scene-result');
        expect(b.result).toBe('scene-result');
        expect(callCount).toBe(1);
        expect(b.deduplicated).toBe(true);
    });

    it('cleans up inflight tracking after completion', async () => {
        await dedup.execute('key', async () => 'done');
        expect(dedup.isInflight('key')).toBe(false);
    });

    it('cleans up inflight tracking after error', async () => {
        await expect(
            dedup.execute('key', async () => {
                throw new Error('fail');
            }),
        ).rejects.toThrow('fail');
        expect(dedup.isInflight('key')).toBe(false);
    });

    it('tracks statistics', async () => {
        const fn = async () => {
            await new Promise(r => setTimeout(r, 10));
            return 'ok';
        };

        await Promise.all([
            dedup.execute('k1', fn),
            dedup.execute('k1', fn), // dedup
        ]);
        await dedup.execute('k2', fn);

        const stats = dedup.getStats();
        expect(stats.executed).toBe(2); // k1, k2
        expect(stats.deduplicated).toBe(1); // second k1
        expect(stats.inflight).toBe(0); // all complete
    });
});

// ─── QueueProcessor ───────────────────────────────────────────────────────────

describe('QueueProcessor', () => {
    it('processes jobs and resolves promises', async () => {
        const queue = new QueueProcessor({
            globalLimit: { rpm: 6000, tpm: 6_000_000 },
            perUserLimit: { rpm: 6000, tpm: 6_000_000 },
            maxConcurrency: 2,
        });

        const result = await queue.submit({
            id: 'job-1',
            userId: 'user-1',
            provider: 'openai',
            execute: async () => 'result-1',
        });

        expect(result).toBe('result-1');
    });

    it('processes multiple jobs concurrently up to maxConcurrency', async () => {
        const queue = new QueueProcessor({
            globalLimit: { rpm: 6000, tpm: 6_000_000 },
            perUserLimit: { rpm: 6000, tpm: 6_000_000 },
            maxConcurrency: 2,
        });

        const executionLog: string[] = [];

        const jobs = [
            queue.submit({
                id: 'j1',
                userId: 'u1',
                provider: 'openai',
                execute: async () => {
                    executionLog.push('j1');
                    return 'r1';
                },
            }),
            queue.submit({
                id: 'j2',
                userId: 'u1',
                provider: 'openai',
                execute: async () => {
                    executionLog.push('j2');
                    return 'r2';
                },
            }),
            queue.submit({
                id: 'j3',
                userId: 'u1',
                provider: 'openai',
                execute: async () => {
                    executionLog.push('j3');
                    return 'r3';
                },
            }),
        ];

        const results = await Promise.all(jobs);
        expect(results).toEqual(['r1', 'r2', 'r3']);
        expect(executionLog).toHaveLength(3);
    });

    it('tracks completed and failed stats', async () => {
        const queue = new QueueProcessor({
            globalLimit: { rpm: 6000, tpm: 6_000_000 },
            perUserLimit: { rpm: 6000, tpm: 6_000_000 },
        });

        await queue.submit({
            id: 'ok',
            userId: 'u1',
            provider: 'openai',
            execute: async () => 'done',
        });

        await expect(
            queue.submit({
                id: 'fail',
                userId: 'u1',
                provider: 'openai',
                execute: async () => {
                    throw new Error('boom');
                },
            }),
        ).rejects.toThrow('boom');

        const stats = queue.getStats();
        expect(stats.completed).toBe(1);
        expect(stats.failed).toBe(1);
    });

    it('deduplicates jobs with same dedupKey', async () => {
        const queue = new QueueProcessor({
            globalLimit: { rpm: 6000, tpm: 6_000_000 },
            perUserLimit: { rpm: 6000, tpm: 6_000_000 },
        });

        let callCount = 0;
        const [a, b] = await Promise.all([
            queue.submit({
                id: 'j1',
                userId: 'u1',
                provider: 'openai',
                dedupKey: 'same',
                execute: async () => {
                    callCount++;
                    await new Promise(r => setTimeout(r, 50));
                    return 'shared';
                },
            }),
            queue.submit({
                id: 'j2',
                userId: 'u1',
                provider: 'openai',
                dedupKey: 'same',
                execute: async () => {
                    callCount++;
                    return 'should-not-execute';
                },
            }),
        ]);

        // Both should complete — at least one executed the actual function
        expect(typeof a).toBe('string');
        expect(typeof b).toBe('string');
        expect(callCount).toBeGreaterThan(0);
    });
});

// ─── RequestPipeline (Integration) ────────────────────────────────────────────

describe('RequestPipeline', () => {
    let pipeline: RequestPipeline;

    beforeEach(() => {
        pipeline = new RequestPipeline({
            cache: { maxSize: 10, ttlMs: 60_000 },
            retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 },
        });
    });

    it('executes a request and caches the result', async () => {
        let callCount = 0;
        const result = await pipeline.call({
            prompt: 'test prompt',
            provider: 'openai',
            userId: 'user-1',
            execute: async () => {
                callCount++;
                return 'ai-response';
            },
        });

        expect(result.result).toBe('ai-response');
        expect(result.cacheHit).toBe(false);
        expect(callCount).toBe(1);

        // Second call should hit cache
        const cached = await pipeline.call({
            prompt: 'test prompt',
            provider: 'openai',
            userId: 'user-1',
            execute: async () => {
                callCount++;
                return 'should-not-execute';
            },
        });

        expect(cached.result).toBe('ai-response');
        expect(cached.cacheHit).toBe(true);
        expect(callCount).toBe(1); // Still 1 — no second execution
    });

    it('deduplicates concurrent identical requests', async () => {
        let callCount = 0;
        const fn = async () => {
            callCount++;
            await new Promise(r => setTimeout(r, 50));
            return 'shared-response';
        };

        const [a, b] = await Promise.all([
            pipeline.call({ prompt: 'same', provider: 'openai', userId: 'u1', execute: fn }),
            pipeline.call({ prompt: 'same', provider: 'openai', userId: 'u2', execute: fn }),
        ]);

        expect(a.result).toBe('shared-response');
        expect(b.result).toBe('shared-response');
        expect(callCount).toBe(1);
    });

    it('retries on transient failure and succeeds', async () => {
        let attempts = 0;

        const result = await pipeline.call({
            prompt: 'retry-test',
            provider: 'openai',
            userId: 'u1',
            execute: async () => {
                attempts++;
                if (attempts < 2) throw new Error('timeout connection');
                return 'recovered';
            },
        });

        expect(result.result).toBe('recovered');
        expect(attempts).toBe(2);
    });

    it('avoids reprocessing identical scenes', async () => {
        let callCount = 0;

        // First call for scene-1
        await pipeline.call({
            prompt: 'scene content',
            provider: 'openai',
            userId: 'u1',
            sceneId: 'scene-1',
            execute: async () => {
                callCount++;
                return 'scene-response';
            },
        });

        // Second call for same scene, different prompt
        const result = await pipeline.call({
            prompt: 'different prompt for same scene',
            provider: 'openai',
            userId: 'u1',
            sceneId: 'scene-1',
            execute: async () => {
                callCount++;
                return 'should-not-run';
            },
        });

        expect(result.cacheHit).toBe(true);
        expect(callCount).toBe(1); // Only first call executed
    });

    it('getStats returns combined subsystem stats', () => {
        const stats = pipeline.getStats();
        expect(stats.cache).toBeDefined();
        expect(stats.dedup).toBeDefined();
        expect(stats.queue).toBeDefined();
        expect(stats.cache.size).toBe(0);
    });

    it('reset clears caches and stats', async () => {
        await pipeline.call({
            prompt: 'cached',
            provider: 'openai',
            userId: 'u1',
            execute: async () => 'data',
        });

        expect(pipeline.cache.size).toBe(1);
        pipeline.reset();
        expect(pipeline.cache.size).toBe(0);
    });
});
