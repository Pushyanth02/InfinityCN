import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    ProviderScoreCalculator,
    FallbackChain,
    AIProviderRouter,
    ProviderHealthTracker,
    hashPromptForRouting,
    ROUTING_POLICIES,
} from '../ai/router';
import type { RequestPolicy, ProviderProfile, ProviderScore } from '../ai/router';
import type { AIProviderInstance, ModelPreset } from '../ai/types';

// Mock the provider registry at module level to avoid loading real implementations
vi.mock('../ai/providers/index', () => ({
    getProvider: vi.fn((name: string) => makeMockInstance(name)),
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

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makePreset(overrides: Partial<ModelPreset> = {}): ModelPreset {
    return {
        model: 'test-model',
        contextWindow: 128000,
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 60,
        rateLimitTPM: 300000,
        ...overrides,
    };
}

function makeMockInstance(name: string, cost = 0.001): AIProviderInstance {
    return {
        name: name as AIProviderInstance['name'],
        costPer1KTokens: cost,
        supportsStreaming: true,
        generate: vi.fn(async () => ({
            text: 'ok',
            model: 'test',
            provider: name as AIProviderInstance['name'],
        })),
        stream: vi.fn(async function* () {
            yield 'ok';
        }),
        healthCheck: vi.fn(async () => true),
    };
}

function makeProfile(name: string, overrides: Partial<ProviderProfile> = {}): ProviderProfile {
    return {
        name: name as ProviderProfile['name'],
        preset: makePreset(),
        costPer1KTokens: 0.001,
        latencyMs: 400,
        healthy: true,
        instance: makeMockInstance(name),
        ...overrides,
    };
}

function defaultPolicy(overrides: Partial<RequestPolicy> = {}): RequestPolicy {
    return {
        complexity: 'medium',
        needsStreaming: false,
        maxCost: 0.05,
        preferFastest: false,
        requireStructuredJSON: false,
        ...overrides,
    };
}

// ─── ProviderScoreCalculator ──────────────────────────────────────────────────

describe('ProviderScoreCalculator', () => {
    const scorer = new ProviderScoreCalculator();

    it('scores a healthy provider with non-zero total', () => {
        const profile = makeProfile('openai');
        const policy = defaultPolicy();
        const score = scorer.score(profile, policy);

        expect(score.provider).toBe('openai');
        expect(score.totalScore).toBeGreaterThan(0);
        expect(score.disqualifiedReason).toBeUndefined();
    });

    it('disqualifies unhealthy providers', () => {
        const profile = makeProfile('openai', { healthy: false });
        const score = scorer.score(profile, defaultPolicy());

        expect(score.totalScore).toBe(0);
        expect(score.disqualifiedReason).toContain('unhealthy');
    });

    it('disqualifies providers over budget', () => {
        const profile = makeProfile('anthropic', { costPer1KTokens: 0.009 });
        const policy = defaultPolicy({ maxCost: 0.0001 });
        const score = scorer.score(profile, policy);

        expect(score.totalScore).toBe(0);
        expect(score.disqualifiedReason).toContain('exceeds budget');
    });

    it('disqualifies non-streaming providers when streaming required', () => {
        const profile = makeProfile('test', {
            preset: makePreset({ supportsStreaming: false }),
        });
        const policy = defaultPolicy({ needsStreaming: true });
        const score = scorer.score(profile, policy);

        expect(score.disqualifiedReason).toContain('does not support streaming');
    });

    it('disqualifies non-JSON providers when JSON required', () => {
        const profile = makeProfile('test', {
            preset: makePreset({ supportsJSON: false }),
        });
        const policy = defaultPolicy({ requireStructuredJSON: true });
        const score = scorer.score(profile, policy);

        expect(score.disqualifiedReason).toContain('does not support structured JSON');
    });

    it('disqualifies non-critical-tier providers for critical tasks', () => {
        const profile = makeProfile('ollama');
        const policy = defaultPolicy({ complexity: 'critical' });
        const score = scorer.score(profile, policy);

        expect(score.disqualifiedReason).toContain('not in critical-tier');
    });

    it('ranks cheaper providers higher for low complexity', () => {
        const cheap = makeProfile('gemini', { costPer1KTokens: 0.0001 });
        const expensive = makeProfile('anthropic', { costPer1KTokens: 0.009 });
        const policy = defaultPolicy({ complexity: 'low' });

        const cheapScore = scorer.score(cheap, policy);
        const expensiveScore = scorer.score(expensive, policy);

        expect(cheapScore.totalScore).toBeGreaterThan(expensiveScore.totalScore);
    });

    it('ranks higher-capability providers for high complexity', () => {
        const highCap = makeProfile('openai', {
            preset: makePreset({ contextWindow: 200000 }),
        });
        const lowCap = makeProfile('ollama', {
            preset: makePreset({ contextWindow: 4096 }),
        });
        // Use 'high' instead of 'critical' to avoid the critical-tier disqualification
        const policy = defaultPolicy({ complexity: 'high' });

        const highScore = scorer.score(highCap, policy);
        const lowScore = scorer.score(lowCap, policy);

        expect(highScore.totalScore).toBeGreaterThan(lowScore.totalScore);
    });

    it('prefers faster providers when preferFastest is true', () => {
        const fast = makeProfile('chrome', { latencyMs: 50 });
        const slow = makeProfile('anthropic', { latencyMs: 700 });
        const policy = defaultPolicy({ complexity: 'low', preferFastest: true });

        const fastScore = scorer.score(fast, policy);
        const slowScore = scorer.score(slow, policy);

        expect(fastScore.breakdown.latency).toBeGreaterThan(slowScore.breakdown.latency);
    });

    it('rankAll sorts by score descending', () => {
        const profiles = [
            makeProfile('anthropic', { costPer1KTokens: 0.009, latencyMs: 700 }),
            makeProfile('gemini', { costPer1KTokens: 0.0001, latencyMs: 300 }),
            makeProfile('openai', { costPer1KTokens: 0.001, latencyMs: 500 }),
        ];
        const policy = defaultPolicy({ complexity: 'medium' });

        const ranked = scorer.rankAll(profiles, policy);

        expect(ranked[0].provider).toBe('gemini');
        expect(
            ranked[ranked.length - 1].disqualifiedReason ?? ranked[ranked.length - 1].totalScore,
        ).toBeLessThanOrEqual(ranked[0].totalScore);
    });

    it('puts disqualified providers at end of ranking', () => {
        const profiles = [
            makeProfile('unhealthy', { healthy: false }),
            makeProfile('gemini', { costPer1KTokens: 0.0001 }),
        ];
        const ranked = scorer.rankAll(profiles, defaultPolicy());

        expect(ranked[0].provider).toBe('gemini');
        expect(ranked[1].provider).toBe('unhealthy');
        expect(ranked[1].disqualifiedReason).toBeDefined();
    });
});

// ─── FallbackChain ────────────────────────────────────────────────────────────

describe('FallbackChain', () => {
    it('builds from ranked scores, excluding disqualified', () => {
        const scores: ProviderScore[] = [
            {
                provider: 'openai',
                totalScore: 80,
                breakdown: {} as ProviderScore['breakdown'],
                estimatedCostUsd: 0.001,
            },
            {
                provider: 'gemini',
                totalScore: 60,
                breakdown: {} as ProviderScore['breakdown'],
                estimatedCostUsd: 0.0001,
            },
            {
                provider: 'anthropic',
                totalScore: 0,
                breakdown: {} as ProviderScore['breakdown'],
                estimatedCostUsd: 0.01,
                disqualifiedReason: 'too expensive',
            },
        ];

        const chain = new FallbackChain(scores);

        expect(chain.primary).toBe('openai');
        expect(chain.fallbacks).toEqual(['gemini']);
        expect(chain.length).toBe(2);
        expect(chain.isEmpty).toBe(false);
    });

    it('isEmpty when all providers disqualified', () => {
        const scores: ProviderScore[] = [
            {
                provider: 'openai',
                totalScore: 0,
                breakdown: {} as ProviderScore['breakdown'],
                estimatedCostUsd: 0,
                disqualifiedReason: 'dead',
            },
        ];
        const chain = new FallbackChain(scores);
        expect(chain.isEmpty).toBe(true);
        expect(chain.primary).toBeUndefined();
    });

    it('execute tries providers in order and returns first success', async () => {
        const scores: ProviderScore[] = [
            {
                provider: 'openai',
                totalScore: 80,
                breakdown: {} as ProviderScore['breakdown'],
                estimatedCostUsd: 0.001,
            },
            {
                provider: 'gemini',
                totalScore: 60,
                breakdown: {} as ProviderScore['breakdown'],
                estimatedCostUsd: 0.0001,
            },
        ];
        const chain = new FallbackChain(scores);

        const { result, provider, attempted } = await chain.execute(async p => {
            if (p === 'openai') throw new Error('openai down');
            return `result-from-${p}`;
        });

        expect(result).toBe('result-from-gemini');
        expect(provider).toBe('gemini');
        expect(attempted).toEqual(['openai', 'gemini']);
    });

    it('throws when all providers fail', async () => {
        const scores: ProviderScore[] = [
            {
                provider: 'openai',
                totalScore: 80,
                breakdown: {} as ProviderScore['breakdown'],
                estimatedCostUsd: 0.001,
            },
        ];
        const chain = new FallbackChain(scores);

        await expect(
            chain.execute(async () => {
                throw new Error('fail');
            }),
        ).rejects.toThrow(/FallbackChain exhausted/);
    });
});

// ─── ProviderHealthTracker ────────────────────────────────────────────────────

describe('ProviderHealthTracker', () => {
    let tracker: ProviderHealthTracker;

    beforeEach(() => {
        tracker = new ProviderHealthTracker();
    });

    it('assumes healthy for unknown providers', () => {
        expect(tracker.isHealthy('openai')).toBe(true);
    });

    it('records success and updates latency', () => {
        tracker.recordSuccess('openai', 350);
        expect(tracker.isHealthy('openai')).toBe(true);
        expect(tracker.getLatencyMs('openai')).toBe(350);
    });

    it('marks unhealthy after 3 consecutive failures', () => {
        tracker.recordFailure('openai');
        expect(tracker.isHealthy('openai')).toBe(true);
        tracker.recordFailure('openai');
        expect(tracker.isHealthy('openai')).toBe(true);
        tracker.recordFailure('openai');
        expect(tracker.isHealthy('openai')).toBe(false);
    });

    it('recovers health on success after failures', () => {
        tracker.recordFailure('openai');
        tracker.recordFailure('openai');
        tracker.recordFailure('openai');
        expect(tracker.isHealthy('openai')).toBe(false);

        tracker.recordSuccess('openai', 400);
        expect(tracker.isHealthy('openai')).toBe(true);
    });

    it('reset clears health for a provider', () => {
        tracker.recordFailure('openai');
        tracker.recordFailure('openai');
        tracker.recordFailure('openai');
        tracker.reset('openai');
        expect(tracker.isHealthy('openai')).toBe(true);
    });

    it('returns 0 latency for unknown providers', () => {
        expect(tracker.getLatencyMs('unknown' as AIProviderInstance['name'])).toBe(0);
    });
});

// ─── hashPromptForRouting ─────────────────────────────────────────────────────

describe('hashPromptForRouting', () => {
    it('returns a non-empty string', () => {
        const hash = hashPromptForRouting('test prompt');
        expect(hash).toBeTruthy();
        expect(typeof hash).toBe('string');
    });

    it('returns same hash for same prompt', () => {
        const a = hashPromptForRouting('hello world');
        const b = hashPromptForRouting('hello world');
        expect(a).toBe(b);
    });

    it('returns different hash for different prompts', () => {
        const a = hashPromptForRouting('prompt A');
        const b = hashPromptForRouting('prompt B');
        expect(a).not.toBe(b);
    });
});

// ─── ROUTING_POLICIES ─────────────────────────────────────────────────────────

describe('ROUTING_POLICIES', () => {
    it('metadataExtraction has low complexity and requires JSON', () => {
        expect(ROUTING_POLICIES.metadataExtraction.complexity).toBe('low');
        expect(ROUTING_POLICIES.metadataExtraction.requireStructuredJSON).toBe(true);
        expect(ROUTING_POLICIES.metadataExtraction.preferFastest).toBe(true);
    });

    it('cinematification has high complexity and needs streaming', () => {
        expect(ROUTING_POLICIES.cinematification.complexity).toBe('high');
        expect(ROUTING_POLICIES.cinematification.needsStreaming).toBe(true);
    });

    it('narrativeAnalysis has critical complexity', () => {
        expect(ROUTING_POLICIES.narrativeAnalysis.complexity).toBe('critical');
        expect(ROUTING_POLICIES.narrativeAnalysis.maxCost).toBe(0.1);
    });

    it('textRepair has lowest budget', () => {
        expect(ROUTING_POLICIES.textRepair.maxCost).toBeLessThan(
            ROUTING_POLICIES.metadataExtraction.maxCost,
        );
    });
});

// ─── AIProviderRouter (integration) ───────────────────────────────────────────

describe('AIProviderRouter', () => {
    let router: AIProviderRouter;

    beforeEach(() => {
        router = new AIProviderRouter();
    });

    it('routes and returns a valid decision', () => {
        const decision = router.route(defaultPolicy());

        expect(decision.provider).toBeTruthy();
        expect(decision.provider).not.toBe('none');
        expect(decision.fallbackChain.length).toBeGreaterThan(0);
        expect(decision.scores.length).toBeGreaterThan(0);
        expect(decision.cached).toBe(false);
    });

    it('caches route decisions', () => {
        const policy = defaultPolicy();
        const first = router.route(policy, 'hash1');
        const second = router.route(policy, 'hash1');

        expect(first.cached).toBe(false);
        expect(second.cached).toBe(true);
    });

    it('different prompt hashes produce separate cache entries', () => {
        const policy = defaultPolicy();
        router.route(policy, 'hash1');
        const different = router.route(policy, 'hash2');

        expect(different.cached).toBe(false);
    });

    it('clearRouteCache invalidates cached decisions', () => {
        const policy = defaultPolicy();
        router.route(policy, 'hash1');
        expect(router.routeCacheSize).toBe(1);

        router.clearRouteCache();
        expect(router.routeCacheSize).toBe(0);
    });

    it('respects excludeProviders', () => {
        const policy = defaultPolicy({ excludeProviders: ['openai', 'anthropic'] });
        const decision = router.route(policy);

        const scored = decision.scores.map(s => s.provider);
        expect(scored).not.toContain('openai');
        expect(scored).not.toContain('anthropic');
    });

    it('respects allowedProviders', () => {
        const policy = defaultPolicy({ allowedProviders: ['gemini'] });
        const decision = router.route(policy);

        const scored = decision.scores.map(s => s.provider);
        expect(scored).toEqual(['gemini']);
    });

    it('buildFallbackChain creates a valid chain', () => {
        const decision = router.route(defaultPolicy());
        const chain = router.buildFallbackChain(decision);

        expect(chain.isEmpty).toBe(false);
        expect(chain.primary).toBeTruthy();
    });

    it('routeWithChain returns both decision and chain', () => {
        const { decision, chain } = router.routeWithChain(defaultPolicy());

        expect(decision.provider).toBeTruthy();
        expect(chain.primary).toBe(decision.provider);
    });

    it('health tracking affects routing', () => {
        // Mark openai as unhealthy
        router.recordFailure('openai');
        router.recordFailure('openai');
        router.recordFailure('openai');

        const decision = router.route(defaultPolicy());

        // OpenAI should be disqualified
        const openaiScore = decision.scores.find(s => s.provider === 'openai');
        expect(openaiScore?.disqualifiedReason).toContain('unhealthy');
    });
});
