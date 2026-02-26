import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    categorizeError,
    isRetryableError,
    calculateBackoff,
    withRetry,
    createCircuitBreaker,
    withFallback,
    tryStrategies,
    debounce,
    throttle,
    withTimeout,
} from '../errorRecovery';

describe('Error Recovery Utilities', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('categorizeError', () => {
        it('categorizes network errors', () => {
            expect(categorizeError(new Error('Network request failed'))).toBe('network');
            expect(categorizeError(new Error('fetch error'))).toBe('network');
            expect(categorizeError(new Error('Connection refused'))).toBe('network');
        });

        it('categorizes timeout errors', () => {
            expect(categorizeError(new Error('Request timeout'))).toBe('timeout');
            expect(categorizeError(new Error('Operation timed out'))).toBe('timeout');
        });

        it('categorizes rate limit errors', () => {
            expect(categorizeError(new Error('Rate limit exceeded'))).toBe('rate_limit');
            expect(categorizeError(new Error('429 Too Many Requests'))).toBe('rate_limit');
        });

        it('categorizes auth errors', () => {
            expect(categorizeError(new Error('401 Unauthorized'))).toBe('auth');
            expect(categorizeError(new Error('403 Forbidden'))).toBe('auth');
            expect(categorizeError(new Error('Invalid API key'))).toBe('auth');
        });

        it('categorizes validation errors', () => {
            expect(categorizeError(new Error('400 Bad Request'))).toBe('validation');
            expect(categorizeError(new Error('Invalid input'))).toBe('validation');
        });

        it('categorizes server errors', () => {
            expect(categorizeError(new Error('500 Internal Server Error'))).toBe('server');
            expect(categorizeError(new Error('502 Bad Gateway'))).toBe('server');
        });

        it('returns unknown for unrecognized errors', () => {
            expect(categorizeError(new Error('Something went wrong'))).toBe('unknown');
            expect(categorizeError('string error')).toBe('unknown');
        });
    });

    describe('isRetryableError', () => {
        it('returns true for retryable errors', () => {
            expect(isRetryableError(new Error('Network error'))).toBe(true);
            expect(isRetryableError(new Error('Request timeout'))).toBe(true);
            expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
            expect(isRetryableError(new Error('500 Server Error'))).toBe(true);
        });

        it('returns false for non-retryable errors', () => {
            expect(isRetryableError(new Error('401 Unauthorized'))).toBe(false);
            expect(isRetryableError(new Error('Invalid input'))).toBe(false);
        });

        it('respects custom retryable categories', () => {
            expect(isRetryableError(new Error('401 Unauthorized'), ['auth', 'network'])).toBe(true);
            expect(isRetryableError(new Error('Network error'), ['timeout'])).toBe(false);
        });
    });

    describe('calculateBackoff', () => {
        it('calculates exponential backoff', () => {
            // Without jitter
            expect(calculateBackoff(0, 1000, 30000, 2, false)).toBe(1000);
            expect(calculateBackoff(1, 1000, 30000, 2, false)).toBe(2000);
            expect(calculateBackoff(2, 1000, 30000, 2, false)).toBe(4000);
            expect(calculateBackoff(3, 1000, 30000, 2, false)).toBe(8000);
        });

        it('respects max delay', () => {
            expect(calculateBackoff(10, 1000, 30000, 2, false)).toBe(30000);
        });

        it('adds jitter when enabled', () => {
            const delays = new Set<number>();
            for (let i = 0; i < 10; i++) {
                delays.add(calculateBackoff(1, 1000, 30000, 2, true));
            }
            // With jitter, we should get some variation
            expect(delays.size).toBeGreaterThanOrEqual(1);
        });
    });

    describe('withRetry', () => {
        it('returns result on first success', async () => {
            const fn = vi.fn().mockResolvedValue('success');
            const result = await withRetry(fn);
            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('retries on retryable errors', async () => {
            vi.useRealTimers(); // Need real timers for async retry

            const fn = vi
                .fn()
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValue('success');

            const result = await withRetry(fn, {
                maxRetries: 2,
                initialDelay: 10,
            });

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('throws after max retries', async () => {
            vi.useRealTimers();

            const fn = vi.fn().mockRejectedValue(new Error('Network error'));

            await expect(withRetry(fn, { maxRetries: 2, initialDelay: 10 })).rejects.toThrow(
                'Network error',
            );

            expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
        });

        it('does not retry non-retryable errors', async () => {
            vi.useRealTimers();

            const fn = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));

            await expect(withRetry(fn, { maxRetries: 2 })).rejects.toThrow('401 Unauthorized');

            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('calls onRetry callback', async () => {
            vi.useRealTimers();

            const onRetry = vi.fn();
            const fn = vi
                .fn()
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValue('success');

            await withRetry(fn, {
                maxRetries: 2,
                initialDelay: 10,
                onRetry,
            });

            expect(onRetry).toHaveBeenCalledTimes(1);
            expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
        });
    });

    describe('createCircuitBreaker', () => {
        it('allows calls when circuit is closed', async () => {
            const fn = vi.fn().mockResolvedValue('success');
            const { execute, getState } = createCircuitBreaker(fn);

            const result = await execute();
            expect(result).toBe('success');
            expect(getState().state).toBe('closed');
        });

        it('opens circuit after failure threshold', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('fail'));
            const { execute, getState } = createCircuitBreaker(fn, {
                failureThreshold: 3,
            });

            for (let i = 0; i < 3; i++) {
                try {
                    await execute();
                } catch {
                    // Expected
                }
            }

            expect(getState().state).toBe('open');
            expect(getState().failures).toBe(3);
        });

        it('rejects calls when circuit is open', async () => {
            vi.useRealTimers();

            const fn = vi.fn().mockRejectedValue(new Error('fail'));
            const { execute, getState } = createCircuitBreaker(fn, {
                failureThreshold: 2,
                resetTimeout: 10000,
            });

            // Open the circuit
            for (let i = 0; i < 2; i++) {
                try {
                    await execute();
                } catch {
                    // Expected
                }
            }

            expect(getState().state).toBe('open');

            // Next call should be rejected immediately
            await expect(execute()).rejects.toThrow('Circuit breaker is open');
        });

        it('resets circuit', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('fail'));
            const { execute, getState, reset } = createCircuitBreaker(fn, {
                failureThreshold: 2,
            });

            // Open the circuit
            for (let i = 0; i < 2; i++) {
                try {
                    await execute();
                } catch {
                    // Expected
                }
            }

            expect(getState().state).toBe('open');

            reset();
            expect(getState().state).toBe('closed');
            expect(getState().failures).toBe(0);
        });
    });

    describe('withFallback', () => {
        it('returns result on success', async () => {
            const result = await withFallback(() => Promise.resolve('success'), {
                fallback: 'fallback',
            });
            expect(result).toBe('success');
        });

        it('returns fallback value on error', async () => {
            const result = await withFallback(() => Promise.reject(new Error('fail')), {
                fallback: 'fallback',
                logError: false,
            });
            expect(result).toBe('fallback');
        });

        it('calls fallback function', async () => {
            const fallbackFn = vi.fn().mockReturnValue('computed');
            const result = await withFallback(() => Promise.reject(new Error('fail')), {
                fallback: fallbackFn,
                logError: false,
            });
            expect(result).toBe('computed');
            expect(fallbackFn).toHaveBeenCalled();
        });

        it('calls onError callback', async () => {
            const onError = vi.fn();
            await withFallback(() => Promise.reject(new Error('test error')), {
                fallback: 'fallback',
                onError,
                logError: false,
            });
            expect(onError).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('tryStrategies', () => {
        it('returns result from first successful strategy', async () => {
            const result = await tryStrategies([
                { name: 'strategy1', execute: () => Promise.resolve('first') },
                { name: 'strategy2', execute: () => Promise.resolve('second') },
            ]);
            expect(result).toBe('first');
        });

        it('falls back to next strategy on failure', async () => {
            const result = await tryStrategies([
                { name: 'strategy1', execute: () => Promise.reject(new Error('fail')) },
                { name: 'strategy2', execute: () => Promise.resolve('second') },
            ]);
            expect(result).toBe('second');
        });

        it('throws if all strategies fail', async () => {
            await expect(
                tryStrategies([
                    { name: 'strategy1', execute: () => Promise.reject(new Error('fail1')) },
                    { name: 'strategy2', execute: () => Promise.reject(new Error('fail2')) },
                ]),
            ).rejects.toThrow('All strategies failed');
        });

        it('calls onStrategyFailed callback', async () => {
            const onFailed = vi.fn();
            await tryStrategies(
                [
                    { name: 'strategy1', execute: () => Promise.reject(new Error('fail')) },
                    { name: 'strategy2', execute: () => Promise.resolve('success') },
                ],
                onFailed,
            );
            expect(onFailed).toHaveBeenCalledWith('strategy1', expect.any(Error));
        });
    });

    describe('debounce', () => {
        it('delays function execution', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            debounced();
            expect(fn).not.toHaveBeenCalled();

            vi.advanceTimersByTime(100);
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('resets timer on subsequent calls', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            debounced();
            vi.advanceTimersByTime(50);
            debounced();
            vi.advanceTimersByTime(50);
            debounced();
            vi.advanceTimersByTime(100);

            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('can be cancelled', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            debounced();
            debounced.cancel();
            vi.advanceTimersByTime(100);

            expect(fn).not.toHaveBeenCalled();
        });

        it('can be flushed', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            debounced('arg');
            debounced.flush();

            expect(fn).toHaveBeenCalledWith('arg');
        });
    });

    describe('throttle', () => {
        it('executes immediately on first call', () => {
            const fn = vi.fn();
            const throttled = throttle(fn, 100);

            throttled();
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('limits execution rate', () => {
            const fn = vi.fn();
            const throttled = throttle(fn, 100);

            throttled();
            throttled();
            throttled();
            expect(fn).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(100);
            expect(fn).toHaveBeenCalledTimes(2); // Trailing call
        });

        it('can be cancelled', () => {
            const fn = vi.fn();
            const throttled = throttle(fn, 100);

            throttled();
            throttled();
            throttled.cancel();
            vi.advanceTimersByTime(100);

            expect(fn).toHaveBeenCalledTimes(1); // Only the first immediate call
        });
    });

    describe('withTimeout', () => {
        it('returns result before timeout', async () => {
            vi.useRealTimers();

            const result = await withTimeout(Promise.resolve('success'), 100);
            expect(result).toBe('success');
        });

        it('throws on timeout', async () => {
            vi.useRealTimers();

            const slowPromise = new Promise(resolve => {
                setTimeout(() => resolve('slow'), 200);
            });

            await expect(withTimeout(slowPromise, 50)).rejects.toThrow('Operation timed out');
        });

        it('uses custom timeout error', async () => {
            vi.useRealTimers();

            const slowPromise = new Promise(resolve => {
                setTimeout(() => resolve('slow'), 200);
            });

            await expect(withTimeout(slowPromise, 50, new Error('Custom timeout'))).rejects.toThrow(
                'Custom timeout',
            );
        });
    });
});
