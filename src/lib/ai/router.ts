/**
 * ai/router.ts — Cost-Aware AI Provider Routing Engine
 *
 * Chooses the optimal provider for each request based on:
 *   cost · latency · capability · health · streaming · complexity
 *
 * Architecture:
 *   RequestPolicy → ProviderScoreCalculator → Ranked candidates → FallbackChain → Result
 *
 * Pipeline:
 *   1. Ingest request policy (complexity, budget, preferences)
 *   2. Score every available provider on multiple weighted axes
 *   3. Filter out disqualified providers (budget, capability, health)
 *   4. Build an ordered FallbackChain from ranked survivors
 *   5. Execute the chain: try top pick → fallback on failure → cache decision
 *
 * No UI code. No business logic outside the routing layer.
 */

import type { AIProviderName, AIProviderInstance, ModelPreset } from './types';
import { MODEL_PRESETS } from './presets';
import { getProvider, hasProvider, listProviders } from './providers/index';

// ─── CORE TYPES ───────────────────────────────────────────────────────────────

export type RequestComplexity = 'low' | 'medium' | 'high' | 'critical';

export interface RequestPolicy {
    /** Task complexity — drives model tier selection. */
    complexity: RequestComplexity;
    /** Whether the consumer needs streaming output. */
    needsStreaming: boolean;
    /** Maximum allowed cost in USD for this single request. */
    maxCost: number;
    /** Prefer lowest-latency provider over cheapest. */
    preferFastest: boolean;
    /** Task requires structured JSON output from the model. */
    requireStructuredJSON: boolean;
    /** Estimated input token count (optional — derived from prompt if omitted). */
    estimatedInputTokens?: number;
    /** Estimated output token count (optional — uses preset maxTokens if omitted). */
    estimatedOutputTokens?: number;
    /** Explicit provider allowlist — only consider these providers. */
    allowedProviders?: AIProviderName[];
    /** Providers to explicitly exclude from routing. */
    excludeProviders?: AIProviderName[];
}

// ─── PROVIDER PROFILE ─────────────────────────────────────────────────────────

/** Static + runtime profile used for scoring. */
export interface ProviderProfile {
    name: AIProviderName;
    preset: ModelPreset;
    costPer1KTokens: number;
    /** Provider-reported or measured latency in ms (0 = unknown). */
    latencyMs: number;
    /** Whether the provider is currently reachable. */
    healthy: boolean;
    /** Instance reference for execution. */
    instance: AIProviderInstance;
}

// ─── SCORE RESULT ─────────────────────────────────────────────────────────────

export interface ProviderScore {
    provider: AIProviderName;
    /** Final composite score (higher = better). Range: 0–100. */
    totalScore: number;
    /** Score breakdown by axis. */
    breakdown: {
        cost: number;
        capability: number;
        latency: number;
        streaming: number;
        health: number;
        json: number;
    };
    /** Estimated cost for this request in USD. */
    estimatedCostUsd: number;
    /** Why the provider was disqualified (empty if qualified). */
    disqualifiedReason?: string;
}

// ─── ROUTING RESULT ───────────────────────────────────────────────────────────

export interface RoutingDecision {
    /** The selected provider. */
    provider: AIProviderName;
    /** The ordered fallback chain. */
    fallbackChain: AIProviderName[];
    /** All calculated scores. */
    scores: ProviderScore[];
    /** Whether this decision came from the route cache. */
    cached: boolean;
    /** The policy that produced this decision. */
    policy: RequestPolicy;
}

// ─── COMPLEXITY ↔ CAPABILITY MAPPING ──────────────────────────────────────────

/**
 * Maps task complexity to minimum capability tiers.
 *
 * Capability is derived from context window and model tier:
 *   - low: any model (even nano)
 *   - medium: 32K+ context, supports JSON
 *   - high: 128K+ context, good reasoning
 *   - critical: 200K+ context, top-tier reasoning (Claude, GPT-4o, Gemini Pro)
 */
const COMPLEXITY_MIN_CONTEXT: Record<RequestComplexity, number> = {
    low: 0,
    medium: 32_000,
    high: 128_000,
    critical: 200_000,
};

/** Providers that are considered "top tier" for critical cinematic tasks. */
const CRITICAL_TIER_PROVIDERS: ReadonlySet<AIProviderName> = new Set([
    'openai',
    'anthropic',
    'gemini',
]);

// ─── COST TABLE ───────────────────────────────────────────────────────────────

/**
 * Approximate cost per 1K tokens (USD) for scoring purposes.
 * Intentionally conservative. Covers both input+output averaged.
 */
const PROVIDER_COST_PER_1K: Record<string, number> = {
    chrome: 0,
    ollama: 0,
    gemma: 0,
    gemini: 0.00025,
    groq: 0.00027,
    deepseek: 0.0003,
    'nvidia-nim': 0.0006,
    openai: 0.00075,
    gwen: 0.001,
    anthropic: 0.009,
};

/** Estimated latency for providers without live data (ms). */
const DEFAULT_LATENCY_MS: Record<string, number> = {
    chrome: 50,
    ollama: 200,
    gemma: 250,
    groq: 300,
    gemini: 400,
    'nvidia-nim': 450,
    openai: 500,
    deepseek: 550,
    gwen: 600,
    anthropic: 700,
};

// ─── SCORE WEIGHTS ────────────────────────────────────────────────────────────

interface ScoreWeights {
    cost: number;
    capability: number;
    latency: number;
    streaming: number;
    health: number;
    json: number;
}

function weightsForPolicy(policy: RequestPolicy): ScoreWeights {
    // Critical / high complexity → emphasize capability
    if (policy.complexity === 'critical') {
        return { cost: 5, capability: 40, latency: 10, streaming: 10, health: 25, json: 10 };
    }
    if (policy.complexity === 'high') {
        return { cost: 10, capability: 30, latency: 10, streaming: 10, health: 25, json: 15 };
    }
    // Low complexity + prefer fastest → emphasize latency
    if (policy.preferFastest && policy.complexity === 'low') {
        return { cost: 15, capability: 5, latency: 35, streaming: 10, health: 25, json: 10 };
    }
    // Default (medium / low budget-conscious)
    return { cost: 30, capability: 15, latency: 15, streaming: 10, health: 20, json: 10 };
}

// ─── PROVIDER SCORE CALCULATOR ────────────────────────────────────────────────

export class ProviderScoreCalculator {
    /**
     * Score a single provider against a request policy.
     * Returns a ProviderScore with breakdown and disqualification reason.
     */
    score(profile: ProviderProfile, policy: RequestPolicy): ProviderScore {
        const weights = weightsForPolicy(policy);
        const estimatedTokens = this.estimateRequestTokens(profile, policy);
        const estimatedCostUsd = (estimatedTokens / 1000) * profile.costPer1KTokens;

        const breakdown = {
            cost: 0,
            capability: 0,
            latency: 0,
            streaming: 0,
            health: 0,
            json: 0,
        };

        let disqualifiedReason: string | undefined;

        // ─── Disqualification Checks ─────────────────────────────────────

        if (!profile.healthy) {
            disqualifiedReason = `${profile.name} is unhealthy.`;
        } else if (estimatedCostUsd > policy.maxCost && policy.maxCost > 0) {
            disqualifiedReason = `Estimated cost $${estimatedCostUsd.toFixed(6)} exceeds budget $${policy.maxCost.toFixed(6)}.`;
        } else if (policy.needsStreaming && !profile.preset.supportsStreaming) {
            disqualifiedReason = `${profile.name} does not support streaming.`;
        } else if (policy.requireStructuredJSON && !profile.preset.supportsJSON) {
            disqualifiedReason = `${profile.name} does not support structured JSON output.`;
        } else if (policy.complexity === 'critical' && !CRITICAL_TIER_PROVIDERS.has(profile.name)) {
            disqualifiedReason = `${profile.name} is not in critical-tier providers.`;
        }

        if (disqualifiedReason) {
            return {
                provider: profile.name,
                totalScore: 0,
                breakdown,
                estimatedCostUsd,
                disqualifiedReason,
            };
        }

        // ─── Cost Score (0–100, lower cost = higher score) ───────────────

        const maxCostRef = Math.max(0.01, ...Object.values(PROVIDER_COST_PER_1K));
        breakdown.cost = Math.max(0, 100 - (profile.costPer1KTokens / maxCostRef) * 100);

        // ─── Capability Score ────────────────────────────────────────────

        const minContext = COMPLEXITY_MIN_CONTEXT[policy.complexity];
        const contextRatio = Math.min(1, profile.preset.contextWindow / Math.max(1, minContext));
        const isCriticalTier = CRITICAL_TIER_PROVIDERS.has(profile.name);
        const tierBonus = policy.complexity === 'critical' && isCriticalTier ? 30 : 0;
        breakdown.capability = Math.min(100, contextRatio * 70 + tierBonus);

        // ─── Latency Score (0–100, lower latency = higher score) ────────

        const maxLatencyRef = 1000;
        breakdown.latency = Math.max(0, 100 - (profile.latencyMs / maxLatencyRef) * 100);

        // ─── Streaming Score ─────────────────────────────────────────────

        if (!policy.needsStreaming) {
            breakdown.streaming = 50; // Neutral — doesn't matter
        } else {
            breakdown.streaming = profile.preset.supportsStreaming ? 100 : 0;
        }

        // ─── Health Score ────────────────────────────────────────────────

        breakdown.health = profile.healthy ? 100 : 0;

        // ─── JSON Score ─────────────────────────────────────────────────

        if (!policy.requireStructuredJSON) {
            breakdown.json = 50; // Neutral
        } else {
            breakdown.json = profile.preset.supportsJSON ? 100 : 0;
        }

        // ─── Weighted Total ──────────────────────────────────────────────

        const totalWeight =
            weights.cost +
            weights.capability +
            weights.latency +
            weights.streaming +
            weights.health +
            weights.json;

        const totalScore =
            totalWeight === 0
                ? 0
                : (breakdown.cost * weights.cost +
                      breakdown.capability * weights.capability +
                      breakdown.latency * weights.latency +
                      breakdown.streaming * weights.streaming +
                      breakdown.health * weights.health +
                      breakdown.json * weights.json) /
                  totalWeight;

        return {
            provider: profile.name,
            totalScore: Math.round(totalScore * 100) / 100,
            breakdown,
            estimatedCostUsd,
        };
    }

    /**
     * Score and rank all providers. Returns sorted by totalScore (descending).
     */
    rankAll(profiles: ProviderProfile[], policy: RequestPolicy): ProviderScore[] {
        return profiles
            .map(p => this.score(p, policy))
            .sort((a, b) => {
                // Disqualified always sorted last
                if (a.disqualifiedReason && !b.disqualifiedReason) return 1;
                if (!a.disqualifiedReason && b.disqualifiedReason) return -1;
                return b.totalScore - a.totalScore;
            });
    }

    private estimateRequestTokens(profile: ProviderProfile, policy: RequestPolicy): number {
        const input = policy.estimatedInputTokens ?? 500;
        const output = policy.estimatedOutputTokens ?? profile.preset.maxTokens;
        return input + output;
    }
}

// ─── FALLBACK CHAIN ───────────────────────────────────────────────────────────

/**
 * Ordered list of providers to attempt. Executes top-down, stopping on first success.
 */
export class FallbackChain {
    private readonly chain: AIProviderName[];

    constructor(rankedScores: ProviderScore[]) {
        this.chain = rankedScores.filter(s => !s.disqualifiedReason).map(s => s.provider);
    }

    /** Get the ordered provider names. */
    get providers(): readonly AIProviderName[] {
        return this.chain;
    }

    /** Get the primary (top-ranked) provider. */
    get primary(): AIProviderName | undefined {
        return this.chain[0];
    }

    /** Get fallback providers (everything except primary). */
    get fallbacks(): AIProviderName[] {
        return this.chain.slice(1);
    }

    /** Whether any providers are available. */
    get isEmpty(): boolean {
        return this.chain.length === 0;
    }

    /** Number of providers in the chain. */
    get length(): number {
        return this.chain.length;
    }

    /**
     * Execute the chain: try each provider in order until one succeeds.
     * Returns the result and which provider succeeded.
     */
    async execute<T>(
        fn: (provider: AIProviderName) => Promise<T>,
    ): Promise<{ result: T; provider: AIProviderName; attempted: AIProviderName[] }> {
        const attempted: AIProviderName[] = [];
        const errors: string[] = [];

        for (const provider of this.chain) {
            attempted.push(provider);
            try {
                const result = await fn(provider);
                return { result, provider, attempted };
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                errors.push(`${provider}: ${msg}`);
            }
        }

        throw new Error(
            `FallbackChain exhausted (${attempted.join(' → ')}). Errors: ${errors.join(' | ')}`,
        );
    }
}

// ─── ROUTE CACHE ──────────────────────────────────────────────────────────────

interface RouteCacheEntry {
    decision: RoutingDecision;
    timestamp: number;
}

const ROUTE_CACHE_TTL_MS = 60_000; // 1 minute
const ROUTE_CACHE_MAX = 200;

class RouteCache {
    private readonly cache = new Map<string, RouteCacheEntry>();

    /**
     * Build a deterministic cache key from a request policy + prompt hash.
     */
    static buildKey(policy: RequestPolicy, promptHash?: string): string {
        const parts = [
            policy.complexity,
            policy.needsStreaming ? 'stream' : 'batch',
            policy.maxCost.toFixed(4),
            policy.preferFastest ? 'fast' : 'cheap',
            policy.requireStructuredJSON ? 'json' : 'text',
            policy.allowedProviders?.sort().join(',') ?? 'all',
            policy.excludeProviders?.sort().join(',') ?? 'none',
            promptHash ?? 'nohash',
        ];
        return parts.join('|');
    }

    get(key: string): RoutingDecision | null {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > ROUTE_CACHE_TTL_MS) {
            this.cache.delete(key);
            return null;
        }
        return entry.decision;
    }

    set(key: string, decision: RoutingDecision): void {
        if (this.cache.size >= ROUTE_CACHE_MAX) {
            // Evict oldest
            let oldestKey = '';
            let oldestTs = Infinity;
            for (const [k, v] of this.cache) {
                if (v.timestamp < oldestTs) {
                    oldestTs = v.timestamp;
                    oldestKey = k;
                }
            }
            if (oldestKey) this.cache.delete(oldestKey);
        }
        this.cache.set(key, { decision, timestamp: Date.now() });
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}

// ─── HEALTH TRACKER ───────────────────────────────────────────────────────────

export class ProviderHealthTracker {
    private readonly healthState = new Map<
        AIProviderName,
        {
            healthy: boolean;
            lastCheckAt: number;
            consecutiveFailures: number;
            latencyMs: number;
        }
    >();

    private readonly healthTtlMs: number;

    constructor(healthTtlMs = 120_000) {
        this.healthTtlMs = healthTtlMs;
    }

    /** Record a successful provider call. */
    recordSuccess(provider: AIProviderName, latencyMs: number): void {
        this.healthState.set(provider, {
            healthy: true,
            lastCheckAt: Date.now(),
            consecutiveFailures: 0,
            latencyMs,
        });
    }

    /** Record a failed provider call. */
    recordFailure(provider: AIProviderName): void {
        const current = this.healthState.get(provider);
        const failures = (current?.consecutiveFailures ?? 0) + 1;
        this.healthState.set(provider, {
            healthy: failures < 3, // Mark unhealthy after 3 consecutive failures
            lastCheckAt: Date.now(),
            consecutiveFailures: failures,
            latencyMs: current?.latencyMs ?? 0,
        });
    }

    /** Check if a provider is considered healthy. */
    isHealthy(provider: AIProviderName): boolean {
        const state = this.healthState.get(provider);
        if (!state) return true; // Assume healthy if never checked
        if (Date.now() - state.lastCheckAt > this.healthTtlMs) return true; // Stale → re-check
        return state.healthy;
    }

    /** Get measured latency (0 if unknown). */
    getLatencyMs(provider: AIProviderName): number {
        return this.healthState.get(provider)?.latencyMs ?? 0;
    }

    /** Reset health for a provider. */
    reset(provider: AIProviderName): void {
        this.healthState.delete(provider);
    }

    /** Reset all health data. */
    resetAll(): void {
        this.healthState.clear();
    }
}

// ─── AI PROVIDER ROUTER ───────────────────────────────────────────────────────

export interface RouterConfig {
    /** Custom health check TTL in ms. Default: 120_000. */
    healthTtlMs?: number;
    /** Custom latency overrides per provider. */
    latencyOverrides?: Partial<Record<AIProviderName, number>>;
    /** Custom cost overrides per provider (per 1K tokens). */
    costOverrides?: Partial<Record<AIProviderName, number>>;
}

/**
 * Cost-aware AI provider routing engine.
 *
 * Usage:
 * ```ts
 * const router = new AIProviderRouter();
 * const decision = router.route({
 *     complexity: 'high',
 *     needsStreaming: true,
 *     maxCost: 0.05,
 *     preferFastest: false,
 *     requireStructuredJSON: false,
 * });
 *
 * const chain = router.buildFallbackChain(decision);
 * const { result, provider } = await chain.execute((p) => callProvider(p, prompt));
 * router.recordSuccess(provider, 350);
 * ```
 */
export class AIProviderRouter {
    private readonly scorer = new ProviderScoreCalculator();
    private readonly routeCache = new RouteCache();
    readonly health: ProviderHealthTracker;
    private readonly costOverrides: Partial<Record<AIProviderName, number>>;
    private readonly latencyOverrides: Partial<Record<AIProviderName, number>>;

    constructor(config?: RouterConfig) {
        this.health = new ProviderHealthTracker(config?.healthTtlMs);
        this.costOverrides = config?.costOverrides ?? {};
        this.latencyOverrides = config?.latencyOverrides ?? {};
    }

    // ─── Route ────────────────────────────────────────────────────────────

    /**
     * Choose the optimal provider for a request.
     *
     * Steps:
     * 1. Check route cache
     * 2. Build provider profiles (cost, latency, health, capability)
     * 3. Score all providers against the policy
     * 4. Return ranked decision with fallback chain
     */
    route(policy: RequestPolicy, promptHash?: string): RoutingDecision {
        // 1. Cache check
        const cacheKey = RouteCache.buildKey(policy, promptHash);
        const cached = this.routeCache.get(cacheKey);
        if (cached) {
            return { ...cached, cached: true };
        }

        // 2. Build profiles
        const profiles = this.buildProfiles(policy);

        // 3. Score & rank
        const scores = this.scorer.rankAll(profiles, policy);

        // 4. Build decision
        const qualified = scores.filter(s => !s.disqualifiedReason);
        const chosen = qualified[0]?.provider ?? 'none';

        const decision: RoutingDecision = {
            provider: chosen as AIProviderName,
            fallbackChain: qualified.map(s => s.provider),
            scores,
            cached: false,
            policy,
        };

        // 5. Cache
        this.routeCache.set(cacheKey, decision);

        return decision;
    }

    /**
     * Build a FallbackChain from a routing decision.
     */
    buildFallbackChain(decision: RoutingDecision): FallbackChain {
        return new FallbackChain(decision.scores);
    }

    /**
     * Convenience: route + build chain in one call.
     */
    routeWithChain(
        policy: RequestPolicy,
        promptHash?: string,
    ): {
        decision: RoutingDecision;
        chain: FallbackChain;
    } {
        const decision = this.route(policy, promptHash);
        const chain = this.buildFallbackChain(decision);
        return { decision, chain };
    }

    // ─── Health Integration ───────────────────────────────────────────────

    /** Record a successful provider call (updates health + latency). */
    recordSuccess(provider: AIProviderName, latencyMs: number): void {
        this.health.recordSuccess(provider, latencyMs);
    }

    /** Record a failed provider call (updates health). */
    recordFailure(provider: AIProviderName): void {
        this.health.recordFailure(provider);
    }

    // ─── Cache Control ────────────────────────────────────────────────────

    /** Clear the route decision cache. */
    clearRouteCache(): void {
        this.routeCache.clear();
    }

    /** Get the number of cached route decisions. */
    get routeCacheSize(): number {
        return this.routeCache.size;
    }

    // ─── Profile Building ─────────────────────────────────────────────────

    private buildProfiles(policy: RequestPolicy): ProviderProfile[] {
        const profiles: ProviderProfile[] = [];

        // Determine which providers to consider
        let candidates = listProviders().filter(name => hasProvider(name));

        if (policy.allowedProviders && policy.allowedProviders.length > 0) {
            const allowSet = new Set(policy.allowedProviders);
            candidates = candidates.filter(name => allowSet.has(name));
        }

        if (policy.excludeProviders && policy.excludeProviders.length > 0) {
            const excludeSet = new Set(policy.excludeProviders);
            candidates = candidates.filter(name => !excludeSet.has(name));
        }

        for (const name of candidates) {
            const preset = MODEL_PRESETS[name];
            if (!preset) continue;

            let instance: AIProviderInstance;
            try {
                instance = getProvider(name);
            } catch {
                continue; // Provider not available
            }

            const costPer1K =
                this.costOverrides[name] ??
                instance.costPer1KTokens ??
                PROVIDER_COST_PER_1K[name] ??
                0.001;

            const latencyMs =
                this.latencyOverrides[name] ??
                (this.health.getLatencyMs(name) || DEFAULT_LATENCY_MS[name]) ??
                500;

            profiles.push({
                name,
                preset,
                costPer1KTokens: costPer1K,
                latencyMs,
                healthy: this.health.isHealthy(name),
                instance,
            });
        }

        return profiles;
    }
}

// ─── DEFAULT INSTANCE ─────────────────────────────────────────────────────────

let defaultRouter: AIProviderRouter | null = null;

/** Get the default singleton router instance. */
export function getDefaultRouter(): AIProviderRouter {
    if (!defaultRouter) {
        defaultRouter = new AIProviderRouter();
    }
    return defaultRouter;
}

// ─── CONVENIENCE FUNCTIONS ────────────────────────────────────────────────────

/**
 * Quick-route helper: choose the best provider for a given complexity level.
 */
export function chooseProvider(policy: RequestPolicy, promptHash?: string): RoutingDecision {
    return getDefaultRouter().route(policy, promptHash);
}

/**
 * Utility: estimate a prompt hash for cache keying.
 */
export function hashPromptForRouting(prompt: string): string {
    // DJB2 hash — fast and good enough for cache keying
    let hash = 5381;
    const len = Math.min(prompt.length, 512); // Only hash first 512 chars
    for (let i = 0; i < len; i++) {
        hash = ((hash << 5) + hash + prompt.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(36);
}

// ─── POLICY PRESETS ───────────────────────────────────────────────────────────

/**
 * Pre-built policies for common InfinityCN use cases.
 */
export const ROUTING_POLICIES = {
    /** Quick metadata extraction — cheap and fast. */
    metadataExtraction: {
        complexity: 'low' as RequestComplexity,
        needsStreaming: false,
        maxCost: 0.001,
        preferFastest: true,
        requireStructuredJSON: true,
    } satisfies RequestPolicy,

    /** Chapter summarization — medium cost, needs JSON. */
    chapterSummary: {
        complexity: 'medium' as RequestComplexity,
        needsStreaming: false,
        maxCost: 0.01,
        preferFastest: false,
        requireStructuredJSON: true,
    } satisfies RequestPolicy,

    /** Full cinematification — high quality, streaming, generous budget. */
    cinematification: {
        complexity: 'high' as RequestComplexity,
        needsStreaming: true,
        maxCost: 0.05,
        preferFastest: false,
        requireStructuredJSON: false,
    } satisfies RequestPolicy,

    /** Critical narrative analysis — top-tier only. */
    narrativeAnalysis: {
        complexity: 'critical' as RequestComplexity,
        needsStreaming: true,
        maxCost: 0.1,
        preferFastest: false,
        requireStructuredJSON: false,
    } satisfies RequestPolicy,

    /** Simple text repair — cheapest possible. */
    textRepair: {
        complexity: 'low' as RequestComplexity,
        needsStreaming: false,
        maxCost: 0.0005,
        preferFastest: true,
        requireStructuredJSON: false,
    } satisfies RequestPolicy,
} as const;
