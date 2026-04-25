/**
 * ai/rateLimiterRegistry.ts — Shared Per-Provider Rate Limiter Registry
 *
 * Single source of truth for rate limiter instances. Both streaming.ts and
 * QueueProcessor reference the same limiter per provider — no more divergent
 * rate limit state between streaming and non-streaming code paths.
 *
 * Replaces the scattered `new Map<string, RateLimiter>()` patterns in
 * streaming.ts and requestPipeline.ts.
 */

import { RateLimiter } from './rateLimiter';
import { MODEL_PRESETS } from './presets';

// ─── SINGLETON REGISTRY ───────────────────────────────────────────────────────

const registry = new Map<string, RateLimiter>();

/**
 * Get or create a rate limiter for a provider.
 *
 * Uses MODEL_PRESETS for default RPM/TPM values. The same instance is
 * returned for the same provider name across all call sites.
 */
export function getRateLimiter(provider: string): RateLimiter {
    const existing = registry.get(provider);
    if (existing) return existing;

    const preset = MODEL_PRESETS[provider];
    const rpm = preset?.rateLimitRPM ?? 60;
    const tpm = preset?.rateLimitTPM ?? 60_000;

    const limiter = new RateLimiter(rpm, tpm);
    registry.set(provider, limiter);
    return limiter;
}

/**
 * Override the rate limiter for a specific provider.
 * Useful for testing or dynamic reconfiguration.
 */
export function setRateLimiter(provider: string, limiter: RateLimiter): void {
    registry.set(provider, limiter);
}

/**
 * Reset all rate limiters. Primarily for testing.
 */
export function resetRateLimiters(): void {
    registry.clear();
}

/**
 * List all providers that currently have a rate limiter instance.
 */
export function listRateLimitedProviders(): string[] {
    return [...registry.keys()];
}
