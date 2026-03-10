/**
 * rateLimit.ts — Redis-based sliding window rate limiter
 *
 * Uses a sorted set per IP with atomic Lua scripting to ensure
 * consistency across multiple API server instances. Falls back
 * to pass-through if Redis is unavailable.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { getClient } from '../services/redis.js';

const PREFIX = `${config.redisKeyPrefix}rl:`;

// Atomic Lua script: prune expired, check count, add if under limit
const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  return 0
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return 1
`;

interface RateLimitOptions {
    bucket: string;
    windowMs: number;
    maxRequests: number;
    errorMessage: string;
}

export function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
    return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
        const ip = req.ip ?? 'unknown';
        const key = `${PREFIX}${options.bucket}:${ip}`;
        const now = Date.now();
        const member = `${now}:${randomUUID()}`;

        try {
            const redis = await getClient();
            const allowed = await redis.eval(
                RATE_LIMIT_SCRIPT,
                1,
                key,
                String(now),
                String(options.windowMs),
                String(options.maxRequests),
                member,
            );

            if (allowed === 0) {
                res.status(429).json({ error: options.errorMessage });
                return;
            }
        } catch (err) {
            // Redis down — degrade gracefully, allow the request
            console.warn(
                '[RateLimit] Redis unavailable, allowing request:',
                (err as Error).message,
            );
        }

        next();
    };
}

/** AI route limiter (existing behavior). */
export const rateLimitMiddleware = createRateLimitMiddleware({
    bucket: 'ai',
    windowMs: config.rateWindowMs,
    maxRequests: config.rateMaxRequests,
    errorMessage: 'Rate limit exceeded. Try again shortly.',
});

/** Jobs API limiter to protect queue/status endpoints from abuse. */
export const jobsRateLimitMiddleware = createRateLimitMiddleware({
    bucket: 'jobs',
    windowMs: config.jobsRateWindowMs,
    maxRequests: config.jobsRateMaxRequests,
    errorMessage: 'Too many job requests. Please slow down.',
});
