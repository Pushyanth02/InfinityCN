/**
 * cache.ts — Redis-based AI response caching
 *
 * Caches AI provider responses keyed by SHA-256 of (provider + prompt).
 * TTL defaults to 30 minutes (configurable via CACHE_TTL_SECONDS).
 */

import { config } from '../config.js';
import { getClient } from './redis.js';
import { contentHash } from '../lib/hash.js';

const PREFIX = `${config.redisKeyPrefix}cache:`;

/** Check Redis for a cached AI response. Returns null on miss or if Redis is down. */
export async function getCachedResponse(provider: string, prompt: string): Promise<string | null> {
    try {
        const redis = await getClient();
        const key = PREFIX + contentHash(provider, prompt);
        return await redis.get(key);
    } catch (err) {
        console.warn('[Cache] Read failed, skipping cache:', (err as Error).message);
        return null;
    }
}

/** Store an AI response in Redis with TTL. Silently fails if Redis is down. */
export async function setCachedResponse(
    provider: string,
    prompt: string,
    response: string,
): Promise<void> {
    try {
        const redis = await getClient();
        const key = PREFIX + contentHash(provider, prompt);
        await redis.set(key, response, 'EX', config.cacheTtlSeconds);
    } catch (err) {
        console.warn('[Cache] Write failed, response not cached:', (err as Error).message);
    }
}
