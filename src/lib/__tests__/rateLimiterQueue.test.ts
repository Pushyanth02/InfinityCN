import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter, RequestQueueLimiter } from '../ai/rateLimiter';

describe('RequestQueueLimiter', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('processes queued requests in order', async () => {
        const limiter = new RequestQueueLimiter({ rpm: 6000, tpm: 6_000_000 }, { rpm: 6000, tpm: 6_000_000 });
        const order: string[] = [];

        const first = limiter.enqueueRequest({
            userId: 'user-a',
            execute: async () => {
                order.push('first');
                return 'first-result';
            },
        });

        const second = limiter.enqueueRequest({
            userId: 'user-a',
            execute: async () => {
                order.push('second');
                return 'second-result';
            },
        });

        const [firstResult, secondResult] = await Promise.all([first, second]);
        expect(firstResult).toBe('first-result');
        expect(secondResult).toBe('second-result');
        expect(order).toEqual(['first', 'second']);
    });

    it('deduplicates requests sharing the same dedupKey', async () => {
        const limiter = new RequestQueueLimiter({ rpm: 6000, tpm: 6_000_000 }, { rpm: 6000, tpm: 6_000_000 });
        let calls = 0;

        const first = limiter.enqueueRequest({
            userId: 'user-a',
            dedupKey: 'same-prompt',
            execute: async () => {
                calls += 1;
                return 'shared-result';
            },
        });

        const second = limiter.enqueueRequest({
            userId: 'user-a',
            dedupKey: 'same-prompt',
            execute: async () => {
                calls += 1;
                return 'shared-result';
            },
        });

        expect(second).toBe(first);
        const [r1, r2] = await Promise.all([first, second]);
        expect(r1).toBe('shared-result');
        expect(r2).toBe('shared-result');
        expect(calls).toBe(1);
    });

    it('applies both global and per-user limiters per request', async () => {
        const limiter = new RequestQueueLimiter({ rpm: 6000, tpm: 6_000_000 }, { rpm: 6000, tpm: 6_000_000 });
        const acquireSpy = vi.spyOn(RateLimiter.prototype, 'acquire');

        await limiter.enqueueRequest({
            userId: 'user-a',
            budget: { requests: 1, tokens: 42 },
            execute: async () => 'ok',
        });

        expect(acquireSpy).toHaveBeenCalledTimes(2);
        expect(acquireSpy).toHaveBeenNthCalledWith(1, { requests: 1, tokens: 42 });
        expect(acquireSpy).toHaveBeenNthCalledWith(2, { requests: 1, tokens: 42 });
    });
});

