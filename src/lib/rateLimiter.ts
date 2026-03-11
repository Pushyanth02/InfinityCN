/**
 * rateLimiter.ts — Token-bucket rate limiter
 *
 * A simple in-process rate limiter that enforces a maximum request-per-minute
 * ceiling using a token-bucket algorithm.  One limiter instance is created per
 * AI provider so that bursts on one provider do not affect others.
 */

export class RateLimiter {
    private tokens: number;
    private lastRefill: number;
    private readonly maxTokens: number;
    private readonly refillRate: number; // tokens per second

    constructor(rpm: number) {
        this.maxTokens = Math.ceil((rpm / 60) * 10); // Allow burst of 10 seconds worth
        this.tokens = this.maxTokens;
        this.refillRate = rpm / 60;
        this.lastRefill = Date.now();
    }

    async acquire(): Promise<void> {
        // Loop instead of recursion to avoid stack depth under contention
        while (true) {
            this.refill();
            if (this.tokens >= 1) {
                this.tokens -= 1;
                return;
            }
            const waitMs = (1 / this.refillRate) * 1000;
            await new Promise(r => setTimeout(r, waitMs));
        }
    }

    private refill(): void {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        const newTokens = elapsed * this.refillRate;
        this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
        this.lastRefill = now;
    }
}
