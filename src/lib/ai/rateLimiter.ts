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

            if (this.requestBucket.tokens >= requestUnits && this.tokenBucket.tokens >= tokenUnits) {
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
