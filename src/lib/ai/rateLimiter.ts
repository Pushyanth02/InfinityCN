/**
 * rateLimiter.ts — Request + token flow limiter
 *
 * Enforces both request-per-minute (RPM) and token-per-minute (TPM) ceilings
 * using dual token buckets. One limiter instance is created per AI provider so
 * bursts on one provider do not affect others.
 */

interface Bucket {
    tokens: number;
    readonly capacity: number;
    readonly refillPerSecond: number;
    lastRefill: number;
}

export interface AcquireBudget {
    requests?: number;
    tokens?: number;
}

export class RateLimiter {
    private readonly requestBucket: Bucket;
    private readonly tokenBucket: Bucket;

    constructor(rpm: number, tpm = rpm * 1000) {
        const now = Date.now();

        // Keep a short burst window (10s) to avoid sudden hard stalls.
        const requestCapacity = Math.max(1, Math.ceil((rpm / 60) * 10));
        const tokenCapacity = Math.max(1, Math.ceil((tpm / 60) * 10));

        this.requestBucket = {
            capacity: requestCapacity,
            tokens: requestCapacity,
            refillPerSecond: Math.max(0.01, rpm / 60),
            lastRefill: now,
        };

        this.tokenBucket = {
            capacity: tokenCapacity,
            tokens: tokenCapacity,
            refillPerSecond: Math.max(1, tpm / 60),
            lastRefill: now,
        };
    }

    async acquire(budget: AcquireBudget = {}): Promise<void> {
        const requestUnits = Math.max(0, Math.ceil(budget.requests ?? 1));
        const tokenUnits = Math.max(0, Math.ceil(budget.tokens ?? 0));

        // Loop instead of recursion to avoid stack depth under contention
        while (true) {
            this.refillBuckets();

            if (
                this.requestBucket.tokens >= requestUnits &&
                this.tokenBucket.tokens >= tokenUnits
            ) {
                this.requestBucket.tokens -= requestUnits;
                this.tokenBucket.tokens -= tokenUnits;
                return;
            }

            const requestWaitMs =
                this.requestBucket.tokens >= requestUnits
                    ? 0
                    : ((requestUnits - this.requestBucket.tokens) /
                          this.requestBucket.refillPerSecond) *
                      1000;

            const tokenWaitMs =
                this.tokenBucket.tokens >= tokenUnits
                    ? 0
                    : ((tokenUnits - this.tokenBucket.tokens) / this.tokenBucket.refillPerSecond) *
                      1000;

            const waitMs = Math.max(25, Math.ceil(Math.max(requestWaitMs, tokenWaitMs)));
            await new Promise(r => setTimeout(r, waitMs));
        }
    }

    snapshot(): { requestTokens: number; tokenTokens: number } {
        this.refillBuckets();
        return {
            requestTokens: this.requestBucket.tokens,
            tokenTokens: this.tokenBucket.tokens,
        };
    }

    private refillBuckets(): void {
        this.refillBucket(this.requestBucket);
        this.refillBucket(this.tokenBucket);
    }

    private refillBucket(bucket: Bucket): void {
        const now = Date.now();
        const elapsed = (now - bucket.lastRefill) / 1000;
        const newTokens = elapsed * bucket.refillPerSecond;
        bucket.tokens = Math.min(bucket.capacity, bucket.tokens + newTokens);
        bucket.lastRefill = now;
    }
}

export interface QueueRateLimitConfig {
    rpm: number;
    tpm?: number;
}

export interface QueueRequest<T> {
    userId: string;
    dedupKey?: string;
    budget?: AcquireBudget;
    execute: () => Promise<T>;
}

interface QueueItem {
    userId: string;
    dedupKey?: string;
    budget: AcquireBudget;
    execute: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
}

export interface QueueSnapshot {
    queued: number;
    inflight: number;
}

/**
 * Queue-based limiter that applies:
 * - global request/token limits
 * - per-user request/token limits
 * - deduplication for same `dedupKey`
 */
export class RequestQueueLimiter {
    private readonly globalLimiter: RateLimiter;
    private readonly perUserLimit: QueueRateLimitConfig;
    private readonly userLimiters = new Map<string, RateLimiter>();
    private readonly queue: QueueItem[] = [];
    private readonly dedupPromises = new Map<string, Promise<unknown>>();
    private readonly inflightKeys = new Set<string>();
    private processing = false;

    constructor(
        globalLimit: QueueRateLimitConfig = { rpm: 60, tpm: 60_000 },
        perUserLimit: QueueRateLimitConfig = { rpm: 30, tpm: 30_000 },
    ) {
        this.globalLimiter = new RateLimiter(globalLimit.rpm, globalLimit.tpm);
        this.perUserLimit = perUserLimit;
    }

    enqueueRequest<T>(request: QueueRequest<T>): Promise<T> {
        const dedupKey = request.dedupKey?.trim() || undefined;
        if (dedupKey) {
            const existing = this.dedupPromises.get(dedupKey);
            if (existing) return existing as Promise<T>;
        }

        const promise = new Promise<T>((resolve, reject) => {
            this.queue.push({
                userId: request.userId,
                dedupKey,
                budget: request.budget ?? { requests: 1, tokens: 0 },
                execute: request.execute as () => Promise<unknown>,
                resolve: resolve as (value: unknown) => void,
                reject,
            });
        });

        if (dedupKey) {
            this.dedupPromises.set(dedupKey, promise);
        }

        // Fire and forget: requests are drained serially.
        void this.processQueue();
        return promise;
    }

    async processQueue(): Promise<void> {
        if (this.processing) return;
        this.processing = true;

        try {
            while (this.queue.length > 0) {
                const item = this.queue.shift();
                if (!item) continue;

                await this.globalLimiter.acquire(item.budget);
                await this.getUserLimiter(item.userId).acquire(item.budget);

                const dedupKey = item.dedupKey;
                if (dedupKey) this.inflightKeys.add(dedupKey);

                try {
                    const result = await item.execute();
                    item.resolve(result);
                } catch (error) {
                    item.reject(error);
                } finally {
                    if (dedupKey) {
                        this.inflightKeys.delete(dedupKey);
                        this.dedupPromises.delete(dedupKey);
                    }
                }
            }
        } finally {
            this.processing = false;
        }
    }

    snapshot(): QueueSnapshot {
        return {
            queued: this.queue.length,
            inflight: this.inflightKeys.size,
        };
    }

    private getUserLimiter(userId: string): RateLimiter {
        const key = userId.trim() || 'anonymous';
        const existing = this.userLimiters.get(key);
        if (existing) return existing;

        const limiter = new RateLimiter(this.perUserLimit.rpm, this.perUserLimit.tpm);
        this.userLimiters.set(key, limiter);
        return limiter;
    }
}

const defaultRequestQueue = new RequestQueueLimiter();

export function enqueueRequest<T>(request: QueueRequest<T>): Promise<T> {
    return defaultRequestQueue.enqueueRequest(request);
}

export function processQueue(): Promise<void> {
    return defaultRequestQueue.processQueue();
}
