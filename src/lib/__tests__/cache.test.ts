import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCacheKey, getCached, setCache } from '../ai/cache';
import { AI_CACHE_TTL_MS } from '../constants';

describe('AI cache system', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('creates deterministic hash-based cache keys for same inputs', () => {
        const prompt = 'same input text';
        const keyA = getCacheKey(prompt, 'openai', 'gpt-4');
        const keyB = getCacheKey(prompt, 'openai', 'gpt-4');
        const keyC = getCacheKey(prompt + ' extra', 'openai', 'gpt-4');

        expect(keyA).toBe(keyB);
        expect(keyA).not.toBe(keyC);
    });

    it('reuses cached AI responses via getCached/setCache', () => {
        const key = getCacheKey('reuse this', 'openai', 'gpt-4');
        setCache(key, '{"ok":true}', 'openai');

        expect(getCached(key)).toBe('{"ok":true}');
    });

    it('expires cached entries after TTL to avoid stale reuse', () => {
        vi.useFakeTimers();
        const now = new Date('2026-01-01T00:00:00.000Z').getTime();
        vi.setSystemTime(now);

        const key = getCacheKey('ttl test', 'openai', 'gpt-4');
        setCache(key, 'fresh', 'openai');
        expect(getCached(key)).toBe('fresh');

        vi.setSystemTime(now + AI_CACHE_TTL_MS + 1);
        expect(getCached(key)).toBeNull();
    });
});
