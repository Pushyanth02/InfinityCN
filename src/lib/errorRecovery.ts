/**
 * errorRecovery.ts — Enhanced Error Recovery Utilities
 *
 * Provides robust error handling patterns including:
 * - Exponential backoff retry
 * - Circuit breaker pattern
 * - Graceful degradation
 * - Error categorization and handling
 */

// ═══════════════════════════════════════════════════════════
// 1. TYPES
// ═══════════════════════════════════════════════════════════

export type ErrorCategory =
    | 'network'
    | 'timeout'
    | 'rate_limit'
    | 'auth'
    | 'validation'
    | 'server'
    | 'unknown';

export interface RetryOptions {
    /** Maximum number of retry attempts */
    maxRetries?: number;
    /** Initial delay in milliseconds */
    initialDelay?: number;
    /** Maximum delay in milliseconds */
    maxDelay?: number;
    /** Backoff multiplier */
    backoffFactor?: number;
    /** Add jitter to prevent thundering herd */
    jitter?: boolean;
    /** Error categories to retry on */
    retryOn?: ErrorCategory[];
    /** Callback before each retry */
    onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
}

export interface CircuitBreakerOptions {
    /** Number of failures before opening circuit */
    failureThreshold?: number;
    /** Time in ms before attempting reset */
    resetTimeout?: number;
    /** Success threshold to close circuit */
    successThreshold?: number;
}

export interface CircuitBreakerState {
    state: 'closed' | 'open' | 'half-open';
    failures: number;
    successes: number;
    lastFailure: number | null;
    nextAttempt: number | null;
}

// ═══════════════════════════════════════════════════════════
// 2. ERROR CATEGORIZATION
// ═══════════════════════════════════════════════════════════

/**
 * Categorize an error for appropriate handling
 */
export function categorizeError(error: unknown): ErrorCategory {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        const name = error.name.toLowerCase();

        // Network errors
        if (
            name === 'networkerror' ||
            message.includes('network') ||
            message.includes('fetch') ||
            message.includes('connection') ||
            message.includes('offline') ||
            message.includes('dns')
        ) {
            return 'network';
        }

        // Timeout errors
        if (
            name === 'timeouterror' ||
            message.includes('timeout') ||
            message.includes('timed out') ||
            message.includes('deadline')
        ) {
            return 'timeout';
        }

        // Rate limit errors
        if (
            message.includes('rate limit') ||
            message.includes('too many requests') ||
            message.includes('429') ||
            message.includes('quota')
        ) {
            return 'rate_limit';
        }

        // Auth errors
        if (
            message.includes('unauthorized') ||
            message.includes('forbidden') ||
            message.includes('401') ||
            message.includes('403') ||
            message.includes('api key')
        ) {
            return 'auth';
        }

        // Validation errors
        if (
            message.includes('invalid') ||
            message.includes('validation') ||
            message.includes('bad request') ||
            message.includes('400')
        ) {
            return 'validation';
        }

        // Server errors
        if (message.includes('500') || message.includes('502') || message.includes('503')) {
            return 'server';
        }
    }

    return 'unknown';
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown, retryableCategories?: ErrorCategory[]): boolean {
    const category = categorizeError(error);
    const defaultRetryable: ErrorCategory[] = ['network', 'timeout', 'rate_limit', 'server'];
    const retryable = retryableCategories || defaultRetryable;
    return retryable.includes(category);
}

// ═══════════════════════════════════════════════════════════
// 3. RETRY WITH EXPONENTIAL BACKOFF
// ═══════════════════════════════════════════════════════════

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'signal' | 'onRetry'>> = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
    jitter: true,
    retryOn: ['network', 'timeout', 'rate_limit', 'server'],
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
export function calculateBackoff(
    attempt: number,
    initialDelay: number,
    maxDelay: number,
    backoffFactor: number,
    jitter: boolean,
): number {
    let delay = initialDelay * Math.pow(backoffFactor, attempt);
    delay = Math.min(delay, maxDelay);

    if (jitter) {
        // Add random jitter ±25%
        const jitterRange = delay * 0.25;
        delay += (Math.random() - 0.5) * 2 * jitterRange;
    }

    return Math.round(delay);
}

/**
 * Execute a function with automatic retry on failure
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        // Check for abort
        if (opts.signal?.aborted) {
            throw new Error('Operation aborted');
        }

        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Don't retry if this is the last attempt
            if (attempt >= opts.maxRetries) {
                break;
            }

            // Check if error is retryable
            if (!isRetryableError(error, opts.retryOn)) {
                throw lastError;
            }

            // Calculate delay
            const delay = calculateBackoff(
                attempt,
                opts.initialDelay,
                opts.maxDelay,
                opts.backoffFactor,
                opts.jitter,
            );

            // Notify before retry
            opts.onRetry?.(attempt + 1, lastError, delay);

            // Wait before retry
            await new Promise<void>((resolve, reject) => {
                const timeoutId = setTimeout(resolve, delay);

                if (opts.signal) {
                    opts.signal.addEventListener('abort', () => {
                        clearTimeout(timeoutId);
                        reject(new Error('Operation aborted'));
                    });
                }
            });
        }
    }

    throw lastError;
}

// ═══════════════════════════════════════════════════════════
// 4. CIRCUIT BREAKER PATTERN
// ═══════════════════════════════════════════════════════════

const DEFAULT_CIRCUIT_BREAKER_OPTIONS: Required<CircuitBreakerOptions> = {
    failureThreshold: 5,
    resetTimeout: 30000,
    successThreshold: 2,
};

/**
 * Create a circuit breaker for protecting against cascading failures
 */
export function createCircuitBreaker<T, Args extends unknown[]>(
    fn: (...args: Args) => Promise<T>,
    options: CircuitBreakerOptions = {},
): {
    execute: (...args: Args) => Promise<T>;
    getState: () => CircuitBreakerState;
    reset: () => void;
} {
    const opts = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };

    let state: CircuitBreakerState = {
        state: 'closed',
        failures: 0,
        successes: 0,
        lastFailure: null,
        nextAttempt: null,
    };

    const execute = async (...args: Args): Promise<T> => {
        const now = Date.now();

        // Check if circuit is open
        if (state.state === 'open') {
            if (state.nextAttempt && now < state.nextAttempt) {
                throw new Error('Circuit breaker is open');
            }
            // Move to half-open to test
            state = { ...state, state: 'half-open', successes: 0 };
        }

        try {
            const result = await fn(...args);

            // Success handling
            if (state.state === 'half-open') {
                state.successes++;
                if (state.successes >= opts.successThreshold) {
                    // Close circuit
                    state = {
                        state: 'closed',
                        failures: 0,
                        successes: 0,
                        lastFailure: null,
                        nextAttempt: null,
                    };
                }
            } else {
                // Reset failures on success in closed state
                state.failures = 0;
            }

            return result;
        } catch (error) {
            state.failures++;
            state.lastFailure = now;

            if (state.state === 'half-open' || state.failures >= opts.failureThreshold) {
                // Open circuit
                state = {
                    state: 'open',
                    failures: state.failures,
                    successes: 0,
                    lastFailure: now,
                    nextAttempt: now + opts.resetTimeout,
                };
            }

            throw error;
        }
    };

    const getState = (): CircuitBreakerState => ({ ...state });

    const reset = (): void => {
        state = {
            state: 'closed',
            failures: 0,
            successes: 0,
            lastFailure: null,
            nextAttempt: null,
        };
    };

    return { execute, getState, reset };
}

// ═══════════════════════════════════════════════════════════
// 5. GRACEFUL DEGRADATION
// ═══════════════════════════════════════════════════════════

export interface FallbackOptions<T> {
    /** Fallback value or function */
    fallback: T | (() => T);
    /** Whether to log the error */
    logError?: boolean;
    /** Custom error handler */
    onError?: (error: Error) => void;
}

/**
 * Execute a function with graceful degradation to fallback
 */
export async function withFallback<T>(
    fn: () => Promise<T>,
    options: FallbackOptions<T>,
): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (options.logError !== false) {
            console.warn('Operation failed, using fallback:', error);
        }

        if (options.onError && error instanceof Error) {
            options.onError(error);
        }

        return typeof options.fallback === 'function'
            ? (options.fallback as () => T)()
            : options.fallback;
    }
}

/**
 * Try multiple strategies in order until one succeeds
 */
export async function tryStrategies<T>(
    strategies: Array<{
        name: string;
        execute: () => Promise<T>;
    }>,
    onStrategyFailed?: (name: string, error: Error) => void,
): Promise<T> {
    const errors: Array<{ name: string; error: Error }> = [];

    for (const strategy of strategies) {
        try {
            return await strategy.execute();
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            errors.push({ name: strategy.name, error: err });
            onStrategyFailed?.(strategy.name, err);
        }
    }

    // All strategies failed
    const errorDetails = errors.map(e => `${e.name}: ${e.error.message}`).join('; ');
    throw new Error(`All strategies failed: ${errorDetails}`);
}

// ═══════════════════════════════════════════════════════════
// 6. DEBOUNCE & THROTTLE
// ═══════════════════════════════════════════════════════════

/**
 * Debounce a function - delays execution until after wait ms of no calls
 */
export function debounce<Args extends unknown[]>(
    fn: (...args: Args) => void,
    wait: number,
): {
    (...args: Args): void;
    cancel: () => void;
    flush: () => void;
} {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: Args | null = null;

    const debounced = (...args: Args): void => {
        lastArgs = args;

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = null;
            lastArgs = null;
        }, wait);
    };

    debounced.cancel = (): void => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
            lastArgs = null;
        }
    };

    debounced.flush = (): void => {
        if (timeoutId && lastArgs) {
            clearTimeout(timeoutId);
            fn(...lastArgs);
            timeoutId = null;
            lastArgs = null;
        }
    };

    return debounced;
}

/**
 * Throttle a function - limits execution to once per wait ms
 */
export function throttle<Args extends unknown[]>(
    fn: (...args: Args) => void,
    wait: number,
): {
    (...args: Args): void;
    cancel: () => void;
} {
    let lastCall = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const throttled = (...args: Args): void => {
        const now = Date.now();
        const timeSinceLastCall = now - lastCall;

        if (timeSinceLastCall >= wait) {
            fn(...args);
            lastCall = now;
        } else {
            // Schedule trailing call
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
                fn(...args);
                lastCall = Date.now();
                timeoutId = null;
            }, wait - timeSinceLastCall);
        }
    };

    throttled.cancel = (): void => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return throttled;
}

// ═══════════════════════════════════════════════════════════
// 7. TIMEOUT WRAPPER
// ═══════════════════════════════════════════════════════════

/**
 * Wrap a promise with a timeout
 */
export function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutError?: Error,
): Promise<T> {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(timeoutError || new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        promise
            .then(result => {
                clearTimeout(timeoutId);
                resolve(result);
            })
            .catch(error => {
                clearTimeout(timeoutId);
                reject(error);
            });
    });
}
