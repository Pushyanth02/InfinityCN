/**
 * ai/requestPipeline.ts — Caching, Retry, Rate Limiting & Deduplication Subsystem
 *
 * Unifies the scattered caching/retry/rate-limit/dedup primitives into a
 * composable, production-grade pipeline for the multi-provider AI stack.
 *
 * Architecture:
 *   Request → Dedup → Cache → RateLimit → Retry → Provider → Cache write → Result
 *
 * Components:
 *   - AIResponseCache: structured hash-based prompt + response cache with stats
 *   - RetryPolicy: configurable exponential backoff with provider fallback
 *   - RequestDeduplicator: prevents identical concurrent requests
 *   - QueueProcessor: ordered execution with per-provider + per-user rate limits
 *   - createCacheKey(): deterministic hash from prompt + provider + model + options
 *
 * No UI code. No business logic outside the pipeline layer.
 */

import type { AIProviderName } from './types';
import { RateLimiter } from './rateLimiter';
import type { AcquireBudget, QueueRateLimitConfig, QueueSnapshot } from './rateLimiter';
import { classifyError, AIError } from './errors';
import { AI_MAX_RETRY_DELAY_MS, AI_CACHE_TTL_MS, AI_MAX_CACHE_SIZE } from '../constants';

// ─── CACHE KEY GENERATION ─────────────────────────────────────────────────────

/**
 * Stable, deterministic hash for cache key generation.
 *
 * Uses FNV-1a (32-bit) — fast, low collision, and doesn't need crypto.
 * Handles full prompt + options serialization.
 */
function fnv1a32(input: string): number {
    let hash = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = (hash * 0x01000193) | 0; // FNV prime
    }
    return hash >>> 0;
}

/**
 * Normalize and sort an options object for deterministic serialization.
 * Strips undefined values and sorts keys alphabetically.
 */
function stableStringify(obj: Record<string, unknown>): string {
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const key of keys) {
        const value = obj[key];
        if (value === undefined) continue;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            parts.push(`${key}:{${stableStringify(value as Record<string, unknown>)}}`);
        } else {
            parts.push(`${key}:${JSON.stringify(value)}`);
        }
    }
    return parts.join('|');
}

export interface CacheKeyInput {
    provider: string;
    model?: string;
    prompt: string;
    options?: Record<string, unknown>;
}

/**
 * Create a deterministic cache key from prompt + provider + model + options.
 *
 * Guarantees: same logical input → same key, different input → different key.
 * Uses FNV-1a hash for speed, with collision-resistant length + head/tail guards.
 */
export function createCacheKey(input: CacheKeyInput): string {
    const normalizedPrompt = input.prompt.trim();
    const optionsSuffix = input.options ? `|${stableStringify(input.options)}` : '';
    const raw = `${input.provider}|${input.model ?? 'default'}|${normalizedPrompt}${optionsSuffix}`;

    const hash = fnv1a32(raw);
    const len = normalizedPrompt.length;
    // Include head + tail of prompt as collision guard
    const head = normalizedPrompt.slice(0, 24);
    const tail = len > 48 ? normalizedPrompt.slice(-24) : '';

    return `${input.provider}:${input.model ?? 'd'}:${hash.toString(36)}:${len}:${head}${tail ? '…' + tail : ''}`;
}

// ─── AI RESPONSE CACHE ───────────────────────────────────────────────────────

export interface CacheEntry {
    key: string;
    value: string;
    provider: string;
    model: string;
    /** When this entry was created. */
    createdAt: number;
    /** When this entry was last accessed. */
    lastAccessedAt: number;
    /** Number of cache hits on this entry. */
    hitCount: number;
    /** Estimated token count of the cached response. */
    estimatedTokens: number;
    /** Optional scene identifier for scene-level dedup. */
    sceneId?: string;
}

export interface CacheStats {
    /** Total entries in cache. */
    size: number;
    /** Total cache hits since creation. */
    hits: number;
    /** Total cache misses since creation. */
    misses: number;
    /** Hit rate as a fraction (0–1). */
    hitRate: number;
    /** Number of evictions performed. */
    evictions: number;
    /** Number of TTL expirations. */
    expirations: number;
}

export interface AIResponseCacheOptions {
    /** Maximum number of entries. Default: AI_MAX_CACHE_SIZE. */
    maxSize?: number;
    /** TTL in ms before entries expire. Default: AI_CACHE_TTL_MS. */
    ttlMs?: number;
    /** Whether to track per-scene deduplication. Default: true. */
    trackScenes?: boolean;
}

/**
 * Structured AI response cache with:
 * - Hash-based prompt keys via createCacheKey()
 * - TTL expiration
 * - LRU eviction
 * - Scene-level deduplication tracking
 * - Hit/miss statistics
 */
export class AIResponseCache {
    private readonly entries = new Map<string, CacheEntry>();
    private readonly sceneIndex = new Map<string, Set<string>>(); // sceneId → Set<cacheKey>
    private readonly maxSize: number;
    private readonly ttlMs: number;
    private readonly trackScenes: boolean;

    private _hits = 0;
    private _misses = 0;
    private _evictions = 0;
    private _expirations = 0;

    constructor(options?: AIResponseCacheOptions) {
        this.maxSize = options?.maxSize ?? AI_MAX_CACHE_SIZE;
        this.ttlMs = options?.ttlMs ?? AI_CACHE_TTL_MS;
        this.trackScenes = options?.trackScenes ?? true;
    }

    /**
     * Get a cached response. Returns null if not found or expired.
     */
    get(key: string): string | null {
        const entry = this.entries.get(key);
        if (!entry) {
            this._misses++;
            return null;
        }

        // TTL check
        if (Date.now() - entry.createdAt > this.ttlMs) {
            this.evictEntry(key);
            this._expirations++;
            this._misses++;
            return null;
        }

        // LRU touch
        entry.lastAccessedAt = Date.now();
        entry.hitCount++;
        this._hits++;
        return entry.value;
    }

    /**
     * Store a response in the cache.
     */
    set(
        key: string,
        value: string,
        metadata: { provider: string; model?: string; sceneId?: string },
    ): void {
        // Evict if at capacity
        if (this.entries.size >= this.maxSize && !this.entries.has(key)) {
            this.evictLRU();
        }

        const now = Date.now();
        const entry: CacheEntry = {
            key,
            value,
            provider: metadata.provider,
            model: metadata.model ?? 'default',
            createdAt: now,
            lastAccessedAt: now,
            hitCount: 0,
            estimatedTokens: Math.ceil(value.length / 4),
            sceneId: metadata.sceneId,
        };

        this.entries.set(key, entry);

        // Index by scene
        if (this.trackScenes && metadata.sceneId) {
            if (!this.sceneIndex.has(metadata.sceneId)) {
                this.sceneIndex.set(metadata.sceneId, new Set());
            }
            this.sceneIndex.get(metadata.sceneId)!.add(key);
        }
    }

    /**
     * Check if a scene has already been processed (any cache entry with this sceneId exists).
     */
    hasScene(sceneId: string): boolean {
        const keys = this.sceneIndex.get(sceneId);
        if (!keys || keys.size === 0) return false;

        // Verify at least one key is still valid
        for (const key of keys) {
            const entry = this.entries.get(key);
            if (entry && Date.now() - entry.createdAt <= this.ttlMs) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get all cached responses for a scene.
     */
    getSceneResponses(sceneId: string): CacheEntry[] {
        const keys = this.sceneIndex.get(sceneId);
        if (!keys) return [];

        const results: CacheEntry[] = [];
        for (const key of keys) {
            const entry = this.entries.get(key);
            if (entry && Date.now() - entry.createdAt <= this.ttlMs) {
                results.push(entry);
            }
        }
        return results;
    }

    /**
     * Remove a specific entry.
     */
    delete(key: string): boolean {
        return this.evictEntry(key);
    }

    /**
     * Invalidate all entries for a specific scene.
     */
    invalidateScene(sceneId: string): number {
        const keys = this.sceneIndex.get(sceneId);
        if (!keys) return 0;

        let removed = 0;
        for (const key of keys) {
            if (this.entries.delete(key)) removed++;
        }
        this.sceneIndex.delete(sceneId);
        return removed;
    }

    /**
     * Invalidate all entries for a specific provider.
     */
    invalidateProvider(provider: string): number {
        let removed = 0;
        for (const [key, entry] of this.entries) {
            if (entry.provider === provider) {
                this.evictEntry(key);
                removed++;
            }
        }
        return removed;
    }

    /**
     * Clear the entire cache.
     */
    clear(): void {
        this.entries.clear();
        this.sceneIndex.clear();
    }

    /**
     * Get cache statistics.
     */
    getStats(): CacheStats {
        const total = this._hits + this._misses;
        return {
            size: this.entries.size,
            hits: this._hits,
            misses: this._misses,
            hitRate: total > 0 ? this._hits / total : 0,
            evictions: this._evictions,
            expirations: this._expirations,
        };
    }

    /**
     * Reset statistics counters.
     */
    resetStats(): void {
        this._hits = 0;
        this._misses = 0;
        this._evictions = 0;
        this._expirations = 0;
    }

    get size(): number {
        return this.entries.size;
    }

    // ─── Internal ─────────────────────────────────────────────────────────

    private evictEntry(key: string): boolean {
        const entry = this.entries.get(key);
        if (!entry) return false;

        // Remove from scene index
        if (entry.sceneId) {
            const sceneKeys = this.sceneIndex.get(entry.sceneId);
            if (sceneKeys) {
                sceneKeys.delete(key);
                if (sceneKeys.size === 0) this.sceneIndex.delete(entry.sceneId);
            }
        }

        this.entries.delete(key);
        this._evictions++;
        return true;
    }

    private evictLRU(): void {
        let oldestKey = '';
        let oldestAccess = Infinity;

        for (const [key, entry] of this.entries) {
            if (entry.lastAccessedAt < oldestAccess) {
                oldestAccess = entry.lastAccessedAt;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.evictEntry(oldestKey);
        }
    }
}

// ─── RETRY POLICY ─────────────────────────────────────────────────────────────

export interface RetryPolicyConfig {
    /** Maximum retry attempts before giving up. Default: 3. */
    maxRetries?: number;
    /** Base delay in ms for exponential backoff. Default: 1000. */
    baseDelayMs?: number;
    /** Maximum delay cap in ms. Default: AI_MAX_RETRY_DELAY_MS. */
    maxDelayMs?: number;
    /** Backoff multiplier. Default: 2. */
    backoffMultiplier?: number;
    /** Jitter factor (0–1). Adds randomness to prevent thundering herd. Default: 0.1. */
    jitterFactor?: number;
    /** Whether to attempt fallback to alternate provider after max retries. Default: true. */
    fallbackOnExhaust?: boolean;
    /** Fallback provider order. Default: []. */
    fallbackProviders?: AIProviderName[];
}

export interface RetryAttempt {
    attempt: number;
    provider: string;
    error: AIError;
    delayMs: number;
    willRetry: boolean;
}

export type RetryEventHandler = (attempt: RetryAttempt) => void;

/**
 * Configurable retry policy with exponential backoff, jitter, and provider fallback.
 *
 * Workflow:
 * 1. Execute against primary provider with retries
 * 2. If all retries exhausted and fallbackOnExhaust is true, try fallback providers
 * 3. Each fallback provider gets its own retry cycle
 * 4. If all providers exhausted, throw aggregate error
 *
 * Usage:
 * ```ts
 * const policy = new RetryPolicy({ maxRetries: 3, fallbackProviders: ['gemini', 'openai'] });
 * const result = await policy.execute('anthropic', async (provider) => {
 *     return callProvider(provider, prompt);
 * });
 * ```
 */
export class RetryPolicy {
    private readonly config: Required<RetryPolicyConfig>;
    private readonly listeners: RetryEventHandler[] = [];

    constructor(config?: RetryPolicyConfig) {
        this.config = {
            maxRetries: config?.maxRetries ?? 3,
            baseDelayMs: config?.baseDelayMs ?? 1000,
            maxDelayMs: config?.maxDelayMs ?? AI_MAX_RETRY_DELAY_MS,
            backoffMultiplier: config?.backoffMultiplier ?? 2,
            jitterFactor: config?.jitterFactor ?? 0.1,
            fallbackOnExhaust: config?.fallbackOnExhaust ?? true,
            fallbackProviders: config?.fallbackProviders ?? [],
        };
    }

    /** Subscribe to retry events for monitoring. */
    onRetry(handler: RetryEventHandler): () => void {
        this.listeners.push(handler);
        return () => {
            const idx = this.listeners.indexOf(handler);
            if (idx !== -1) this.listeners.splice(idx, 1);
        };
    }

    /**
     * Execute a function with retry + provider fallback.
     *
     * @param primaryProvider - The first provider to attempt.
     * @param fn - The function to execute. Receives the current provider name.
     * @returns The result from the first successful execution.
     */
    async execute<T>(
        primaryProvider: string,
        fn: (provider: string) => Promise<T>,
    ): Promise<{ result: T; provider: string; attempts: RetryAttempt[] }> {
        const allAttempts: RetryAttempt[] = [];

        // Build provider chain: primary first, then fallbacks
        const providers = [primaryProvider];
        if (this.config.fallbackOnExhaust) {
            for (const fb of this.config.fallbackProviders) {
                if (!providers.includes(fb)) providers.push(fb);
            }
        }

        const providerErrors: string[] = [];

        for (const provider of providers) {
            for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
                try {
                    const result = await fn(provider);
                    return { result, provider, attempts: allAttempts };
                } catch (err) {
                    const classified = classifyError(err, provider);
                    const willRetry = classified.retryable && attempt < this.config.maxRetries;
                    const delayMs = willRetry ? this.computeDelay(attempt, classified) : 0;

                    const attemptRecord: RetryAttempt = {
                        attempt,
                        provider,
                        error: classified,
                        delayMs,
                        willRetry,
                    };

                    allAttempts.push(attemptRecord);
                    this.emitRetry(attemptRecord);

                    if (!willRetry) {
                        providerErrors.push(
                            `${provider}[attempt ${attempt}]: ${classified.message}`,
                        );
                        break; // Move to next provider
                    }

                    await sleep(delayMs);
                }
            }
        }

        throw new AIError(
            `RetryPolicy exhausted all providers (${providers.join(' → ')}). Errors: ${providerErrors.join(' | ')}`,
            'unknown',
            primaryProvider,
            false,
        );
    }

    /** Compute delay with exponential backoff + jitter. */
    private computeDelay(attempt: number, error: AIError): number {
        // Use provider-suggested retry-after if available
        if (error.retryAfterMs) {
            return Math.min(error.retryAfterMs, this.config.maxDelayMs);
        }

        const exponential =
            this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt);
        const capped = Math.min(exponential, this.config.maxDelayMs);

        // Add jitter: ±jitterFactor
        const jitter = capped * this.config.jitterFactor * (Math.random() * 2 - 1);
        return Math.max(0, Math.round(capped + jitter));
    }

    private emitRetry(attempt: RetryAttempt): void {
        for (const handler of this.listeners) {
            try {
                handler(attempt);
            } catch {
                /* swallow listener errors */
            }
        }
    }
}

// ─── REQUEST DEDUPLICATOR ─────────────────────────────────────────────────────

export interface DedupStats {
    /** Total requests that were deduplicated (shared an inflight promise). */
    deduplicated: number;
    /** Total unique requests executed. */
    executed: number;
    /** Currently inflight unique requests. */
    inflight: number;
}

/**
 * Prevents identical concurrent requests from producing duplicate API calls.
 *
 * When two callers request the same prompt at the same time, the second caller
 * receives the same promise as the first — no duplicate network request.
 *
 * Scene-level dedup: if a sceneId is provided, all requests for that scene
 * share the same dedup key regardless of prompt variations.
 */
export class RequestDeduplicator {
    private readonly inflight = new Map<string, Promise<string>>();
    private readonly sceneInflight = new Map<string, Promise<string>>();
    private _deduplicated = 0;
    private _executed = 0;

    /**
     * Execute a request with deduplication.
     *
     * @param key - Unique request key (typically from createCacheKey).
     * @param fn - The function to execute if not already inflight.
     * @param sceneId - Optional scene identifier for scene-level dedup.
     * @returns The result from the executed or shared promise.
     */
    async execute(
        key: string,
        fn: () => Promise<string>,
        sceneId?: string,
    ): Promise<{ result: string; deduplicated: boolean }> {
        // Scene-level dedup: if this scene is already being processed, share that promise
        if (sceneId) {
            const scenePromise = this.sceneInflight.get(sceneId);
            if (scenePromise) {
                this._deduplicated++;
                const result = await scenePromise;
                return { result, deduplicated: true };
            }
        }

        // Request-level dedup
        const existing = this.inflight.get(key);
        if (existing) {
            this._deduplicated++;
            const result = await existing;
            return { result, deduplicated: true };
        }

        // New unique request
        this._executed++;
        const promise = fn();
        this.inflight.set(key, promise);
        if (sceneId) this.sceneInflight.set(sceneId, promise);

        try {
            const result = await promise;
            return { result, deduplicated: false };
        } finally {
            this.inflight.delete(key);
            if (sceneId) this.sceneInflight.delete(sceneId);
        }
    }

    /** Check if a request key is currently inflight. */
    isInflight(key: string): boolean {
        return this.inflight.has(key);
    }

    /** Check if a scene is currently being processed. */
    isSceneInflight(sceneId: string): boolean {
        return this.sceneInflight.has(sceneId);
    }

    /** Get deduplication statistics. */
    getStats(): DedupStats {
        return {
            deduplicated: this._deduplicated,
            executed: this._executed,
            inflight: this.inflight.size,
        };
    }

    /** Reset statistics. */
    resetStats(): void {
        this._deduplicated = 0;
        this._executed = 0;
    }
}

// ─── QUEUE PROCESSOR ──────────────────────────────────────────────────────────

export type QueuePriority = 'low' | 'normal' | 'high' | 'critical';

const PRIORITY_WEIGHTS: Record<QueuePriority, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
};

export interface QueueJob<T = string> {
    /** Unique job ID. */
    id: string;
    /** User who submitted this request. */
    userId: string;
    /** Priority level. Default: 'normal'. */
    priority?: QueuePriority;
    /** Provider to use. */
    provider: AIProviderName;
    /** Deduplication key. */
    dedupKey?: string;
    /** Scene ID for scene-level dedup. */
    sceneId?: string;
    /** Rate limit budget. */
    budget?: AcquireBudget;
    /** The function to execute. */
    execute: () => Promise<T>;
}

export interface QueueProcessorOptions {
    /** Global rate limit. */
    globalLimit?: QueueRateLimitConfig;
    /** Per-user rate limit. */
    perUserLimit?: QueueRateLimitConfig;
    /** Per-provider rate limits. */
    perProviderLimits?: Partial<Record<AIProviderName, QueueRateLimitConfig>>;
    /** Maximum concurrent jobs. Default: 5. */
    maxConcurrency?: number;
}

export interface QueueProcessorStats extends QueueSnapshot {
    /** Total jobs completed successfully. */
    completed: number;
    /** Total jobs that failed. */
    failed: number;
    /** Jobs currently executing. */
    active: number;
}

interface InternalQueueItem {
    job: QueueJob;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    priority: number;
}

/**
 * Priority-aware queue processor with per-provider + per-user rate limiting.
 *
 * Features:
 * - Priority ordering (critical > high > normal > low)
 * - Concurrent execution (configurable maxConcurrency)
 * - Per-provider rate limiters (separate buckets per provider)
 * - Per-user rate limiters (prevent single user from starving others)
 * - Global rate limiter (overall system protection)
 * - Deduplication via RequestDeduplicator
 */
export class QueueProcessor {
    private readonly globalLimiter: RateLimiter;
    private readonly userLimiters = new Map<string, RateLimiter>();
    private readonly providerLimiters = new Map<string, RateLimiter>();
    private readonly deduplicator = new RequestDeduplicator();

    private readonly queue: InternalQueueItem[] = [];
    private readonly perUserConfig: QueueRateLimitConfig;
    private readonly perProviderConfigs: Partial<Record<AIProviderName, QueueRateLimitConfig>>;
    private readonly maxConcurrency: number;

    private activeCount = 0;
    private processing = false;
    private _completed = 0;
    private _failed = 0;

    constructor(options?: QueueProcessorOptions) {
        const globalLimit = options?.globalLimit ?? { rpm: 120, tpm: 120_000 };
        this.globalLimiter = new RateLimiter(globalLimit.rpm, globalLimit.tpm);
        this.perUserConfig = options?.perUserLimit ?? { rpm: 30, tpm: 30_000 };
        this.perProviderConfigs = options?.perProviderLimits ?? {};
        this.maxConcurrency = options?.maxConcurrency ?? 5;
    }

    /**
     * Submit a job to the queue. Returns a promise that resolves with the result.
     */
    submit<T>(job: QueueJob<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push({
                job: job as QueueJob,
                resolve: resolve as (value: unknown) => void,
                reject,
                priority: PRIORITY_WEIGHTS[job.priority ?? 'normal'],
            });

            // Re-sort by priority (stable sort — maintains insertion order within same priority)
            this.queue.sort((a, b) => a.priority - b.priority);

            void this.drainQueue();
        });
    }

    /**
     * Get processor statistics.
     */
    getStats(): QueueProcessorStats {
        return {
            queued: this.queue.length,
            inflight: this.activeCount,
            active: this.activeCount,
            completed: this._completed,
            failed: this._failed,
        };
    }

    /**
     * Get deduplicator stats.
     */
    getDedupStats(): DedupStats {
        return this.deduplicator.getStats();
    }

    // ─── Internal ─────────────────────────────────────────────────────────

    private async drainQueue(): Promise<void> {
        if (this.processing) return;
        this.processing = true;

        try {
            while (this.queue.length > 0 && this.activeCount < this.maxConcurrency) {
                const item = this.queue.shift();
                if (!item) continue;

                this.activeCount++;
                void this.processItem(item).finally(() => {
                    this.activeCount--;
                    // Recursively drain after each completion
                    void this.drainQueue();
                });
            }
        } finally {
            this.processing = false;
        }
    }

    private async processItem(item: InternalQueueItem): Promise<void> {
        const { job, resolve, reject } = item;
        const budget = job.budget ?? { requests: 1, tokens: 0 };

        try {
            // Acquire rate limit tokens: global → provider → user
            await this.globalLimiter.acquire(budget);
            await this.getProviderLimiter(job.provider).acquire(budget);
            await this.getUserLimiter(job.userId).acquire(budget);

            // Dedup check
            if (job.dedupKey || job.sceneId) {
                const dedupKey = job.dedupKey ?? `scene:${job.sceneId}`;
                const { result } = await this.deduplicator.execute(
                    dedupKey,
                    job.execute as () => Promise<string>,
                    job.sceneId,
                );
                this._completed++;
                resolve(result);
            } else {
                const result = await job.execute();
                this._completed++;
                resolve(result);
            }
        } catch (error) {
            this._failed++;
            reject(error);
        }
    }

    private getUserLimiter(userId: string): RateLimiter {
        const key = userId.trim() || 'anonymous';
        let limiter = this.userLimiters.get(key);
        if (!limiter) {
            limiter = new RateLimiter(this.perUserConfig.rpm, this.perUserConfig.tpm);
            this.userLimiters.set(key, limiter);
        }
        return limiter;
    }

    private getProviderLimiter(provider: AIProviderName): RateLimiter {
        let limiter = this.providerLimiters.get(provider);
        if (!limiter) {
            const config = this.perProviderConfigs[provider] ?? { rpm: 60, tpm: 60_000 };
            limiter = new RateLimiter(config.rpm, config.tpm);
            this.providerLimiters.set(provider, limiter);
        }
        return limiter;
    }
}

// ─── INTEGRATED PIPELINE ──────────────────────────────────────────────────────

export interface PipelineOptions {
    /** Cache configuration. */
    cache?: AIResponseCacheOptions;
    /** Retry policy configuration. */
    retry?: RetryPolicyConfig;
    /** Queue processor configuration. */
    queue?: QueueProcessorOptions;
}

/**
 * Unified request pipeline: Cache → Dedup → RateLimit → Retry → Provider.
 *
 * Composes AIResponseCache, RequestDeduplicator, RetryPolicy, and QueueProcessor
 * into a single call path that handles the full request lifecycle.
 *
 * Usage:
 * ```ts
 * const pipeline = new RequestPipeline();
 *
 * const result = await pipeline.call({
 *     prompt: 'Analyze this scene...',
 *     provider: 'openai',
 *     model: 'gpt-4o',
 *     userId: 'user-123',
 *     sceneId: 'ch1-scene-3',
 *     execute: (provider) => callProvider(provider, prompt),
 * });
 * ```
 */
export class RequestPipeline {
    readonly cache: AIResponseCache;
    readonly retry: RetryPolicy;
    readonly deduplicator: RequestDeduplicator;
    readonly queue: QueueProcessor;

    constructor(options?: PipelineOptions) {
        this.cache = new AIResponseCache(options?.cache);
        this.retry = new RetryPolicy(options?.retry);
        this.deduplicator = new RequestDeduplicator();
        this.queue = new QueueProcessor(options?.queue);
    }

    /**
     * Execute a request through the full pipeline.
     *
     * Steps:
     * 1. Generate cache key
     * 2. Check cache → return immediately if hit
     * 3. Check inflight dedup → share promise if duplicate
     * 4. Execute with retry policy (includes provider fallback)
     * 5. Cache the result on success
     * 6. Return result with metadata
     */
    async call(request: {
        prompt: string;
        provider: AIProviderName;
        model?: string;
        options?: Record<string, unknown>;
        userId: string;
        sceneId?: string;
        execute: (provider: string) => Promise<string>;
    }): Promise<{
        result: string;
        provider: string;
        cacheHit: boolean;
        deduplicated: boolean;
        attempts: RetryAttempt[];
    }> {
        const cacheKey = createCacheKey({
            provider: request.provider,
            model: request.model,
            prompt: request.prompt,
            options: request.options,
        });

        // 1. Cache check
        const cached = this.cache.get(cacheKey);
        if (cached !== null) {
            return {
                result: cached,
                provider: request.provider,
                cacheHit: true,
                deduplicated: false,
                attempts: [],
            };
        }

        // 2. Scene dedup check
        if (request.sceneId && this.cache.hasScene(request.sceneId)) {
            const sceneResponses = this.cache.getSceneResponses(request.sceneId);
            if (sceneResponses.length > 0) {
                return {
                    result: sceneResponses[0].value,
                    provider: sceneResponses[0].provider,
                    cacheHit: true,
                    deduplicated: false,
                    attempts: [],
                };
            }
        }

        // 3. Dedup + Retry execution
        const { result: dedupResult, deduplicated } = await this.deduplicator.execute(
            cacheKey,
            async () => {
                const { result, provider } = await this.retry.execute(
                    request.provider,
                    request.execute,
                );
                // Cache on success
                this.cache.set(cacheKey, result, {
                    provider,
                    model: request.model,
                    sceneId: request.sceneId,
                });
                return result;
            },
            request.sceneId,
        );

        return {
            result: dedupResult,
            provider: request.provider,
            cacheHit: false,
            deduplicated,
            attempts: [],
        };
    }

    /**
     * Get combined stats from all subsystems.
     */
    getStats(): {
        cache: CacheStats;
        dedup: DedupStats;
        queue: QueueProcessorStats;
    } {
        return {
            cache: this.cache.getStats(),
            dedup: this.deduplicator.getStats(),
            queue: this.queue.getStats(),
        };
    }

    /**
     * Clear all caches and reset stats.
     */
    reset(): void {
        this.cache.clear();
        this.cache.resetStats();
        this.deduplicator.resetStats();
    }
}

// ─── DEFAULT INSTANCES ────────────────────────────────────────────────────────

let defaultPipeline: RequestPipeline | null = null;

/** Get the default singleton pipeline instance. */
export function getDefaultPipeline(): RequestPipeline {
    if (!defaultPipeline) {
        defaultPipeline = new RequestPipeline();
    }
    return defaultPipeline;
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
