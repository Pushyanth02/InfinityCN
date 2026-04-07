/**
 * ai/cache.ts — AI Response Cache (LRU)
 *
 * Simple in-memory LRU cache for AI responses.
 * Prevents redundant API calls for identical prompts.
 */

import { AI_CACHE_TTL_MS, AI_MAX_CACHE_SIZE } from '../constants';

interface CacheEntry {
    value: string;
    timestamp: number;
    provider: string;
}

const apiCache = new Map<string, CacheEntry>();

export function getCacheKey(prompt: string, provider: string, model = ''): string {
    // DJB2 hash + length + head/tail substring for collision resistance
    let hash = 5381;
    for (let i = 0; i < prompt.length; i++) {
        hash = ((hash << 5) + hash + prompt.charCodeAt(i)) | 0;
    }
    const head = prompt.slice(0, 32);
    const tail = prompt.length > 64 ? prompt.slice(-32) : '';
    return `${provider}:${model}:${hash >>> 0}:${prompt.length}:${head}${tail}`;
}

export function getFromCache(key: string): string | null {
    const entry = apiCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > AI_CACHE_TTL_MS) {
        apiCache.delete(key);
        return null;
    }
    // LRU touch: just refresh timestamp (avoids Map reordering overhead)
    entry.timestamp = Date.now();
    return entry.value;
}

export function setCache(key: string, value: string, provider: string): void {
    if (apiCache.size >= AI_MAX_CACHE_SIZE) {
        // Evict the entry with the oldest timestamp
        let oldestKey = '';
        let oldestTs = Infinity;
        for (const [k, v] of apiCache) {
            if (v.timestamp < oldestTs) {
                oldestTs = v.timestamp;
                oldestKey = k;
            }
        }
        if (oldestKey) apiCache.delete(oldestKey);
    }
    apiCache.set(key, { value, timestamp: Date.now(), provider });
}
