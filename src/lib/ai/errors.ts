/**
 * ai/errors.ts — AI Error Classification & Retry Logic
 *
 * Provides structured error types, classification heuristics,
 * and exponential backoff retry with a max delay cap.
 */

import type { AIErrorType } from './types';
import { AI_MAX_RETRY_DELAY_MS } from '../constants';

export class AIError extends Error {
    type: AIErrorType;
    provider: string;
    retryable: boolean;
    retryAfterMs?: number;

    constructor(
        message: string,
        type: AIErrorType,
        provider: string,
        retryable = false,
        retryAfterMs?: number,
    ) {
        super(message);
        this.name = 'AIError';
        this.type = type;
        this.provider = provider;
        this.retryable = retryable;
        this.retryAfterMs = retryAfterMs;
    }
}

export function classifyError(err: unknown, provider: string): AIError {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
        return new AIError(msg, 'rate_limit', provider, true, 5000);
    }
    if (
        msg.includes('401') ||
        msg.includes('403') ||
        msg.toLowerCase().includes('unauthorized') ||
        msg.toLowerCase().includes('api key')
    ) {
        return new AIError(msg, 'auth', provider, false);
    }
    if (
        msg.includes('Failed to fetch') ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('econnrefused')
    ) {
        return new AIError(msg, 'network', provider, true, 2000);
    }
    if (msg.includes('timeout') || msg.includes('aborted')) {
        return new AIError(msg, 'timeout', provider, true, 1000);
    }
    if (msg.includes('503') || msg.toLowerCase().includes('unavailable')) {
        return new AIError(msg, 'model_unavailable', provider, true, 10000);
    }

    return new AIError(msg, 'unknown', provider, false);
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    provider: string,
    maxRetries = 2,
    baseDelayMs = 1500,
): Promise<T> {
    let lastError: AIError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err: unknown) {
            lastError = classifyError(err, provider);

            if (!lastError.retryable || attempt >= maxRetries) {
                throw lastError;
            }

            const rawDelay = lastError.retryAfterMs ?? baseDelayMs * Math.pow(2, attempt);
            const delay = Math.min(rawDelay, AI_MAX_RETRY_DELAY_MS);
            await new Promise(r => setTimeout(r, delay));
        }
    }

    throw lastError ?? new AIError('Unknown error', 'unknown', provider, false);
}
