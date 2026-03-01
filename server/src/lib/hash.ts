/**
 * hash.ts — Content hashing for cache keys
 */

import { createHash } from 'node:crypto';

/** Generate a SHA-256 hex hash for cache key derivation. */
export function contentHash(provider: string, prompt: string): string {
    return createHash('sha256').update(`${provider}:${prompt}`).digest('hex');
}
