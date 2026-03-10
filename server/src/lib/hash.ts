/**
 * hash.ts — Content hashing helpers
 */

import { createHash } from 'node:crypto';

/** Generate a SHA-256 hex hash for cache key derivation. */
export function contentHash(provider: string, prompt: string): string {
    return sha256Hex(`${provider}:${prompt}`);
}

/** Generate SHA-256 hex digest for arbitrary input. */
export function sha256Hex(input: string): string {
    return createHash('sha256').update(input).digest('hex');
}
