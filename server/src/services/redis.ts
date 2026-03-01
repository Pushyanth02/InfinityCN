/**
 * redis.ts — Redis client singleton with Pub/Sub subscriber
 *
 * Uses ioredis with automatic reconnection. Provides a main client
 * for commands and a separate subscriber client for Pub/Sub
 * (ioredis requires dedicated connections for subscriptions).
 */

import { Redis } from 'ioredis';
import { config } from '../config.js';

let client: Redis | null = null;
let subscriber: Redis | null = null;

function createClient(label: string): Redis {
    const redis = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times: number) {
            const delay = Math.min(times * 500, 5000);
            console.log(`[Redis:${label}] Reconnecting in ${delay}ms (attempt ${times})`);
            return delay;
        },
        lazyConnect: true,
    });

    redis.on('connect', () => console.log(`[Redis:${label}] Connected`));
    redis.on('error', (err: Error) => console.error(`[Redis:${label}] Error:`, err.message));
    redis.on('close', () => console.log(`[Redis:${label}] Connection closed`));

    return redis;
}

/** Get the main Redis client (creates and connects on first call). */
export async function getClient(): Promise<Redis> {
    if (!client) {
        client = createClient('main');
        await client.connect();
    }
    return client;
}

/** Get the subscriber Redis client for Pub/Sub (creates and connects on first call). */
export async function getSubscriber(): Promise<Redis> {
    if (!subscriber) {
        subscriber = createClient('sub');
        await subscriber.connect();
    }
    return subscriber;
}

/** Check if Redis is reachable. Returns latency in ms or -1 if unreachable. */
export async function isHealthy(): Promise<{ connected: boolean; latencyMs: number }> {
    try {
        const c = await getClient();
        const start = Date.now();
        await c.ping();
        return { connected: true, latencyMs: Date.now() - start };
    } catch {
        return { connected: false, latencyMs: -1 };
    }
}

/** Gracefully disconnect both Redis clients. */
export async function disconnect(): Promise<void> {
    const tasks: Promise<void>[] = [];
    if (subscriber) {
        tasks.push(
            subscriber.quit().then(() => {
                subscriber = null;
            }),
        );
    }
    if (client) {
        tasks.push(
            client.quit().then(() => {
                client = null;
            }),
        );
    }
    await Promise.all(tasks);
    console.log('[Redis] Disconnected');
}
