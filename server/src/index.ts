/**
 * index.ts — InfinityCN API Server
 *
 * Express server with Redis caching/rate-limiting and RabbitMQ job queuing.
 * Replaces the legacy server/proxy.ts with full infrastructure support.
 *
 * Run: npx tsx src/index.ts
 */

import express from 'express';
import { config } from './config.js';
import { corsMiddleware } from './middleware/cors.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import aiRoutes from './routes/ai.js';
import healthRoutes from './routes/health.js';
import jobRoutes from './routes/jobs.js';
import { getClient as getRedis } from './services/redis.js';
import { disconnect as disconnectRedis } from './services/redis.js';
import {
    connect as connectRabbitMQ,
    disconnect as disconnectRabbitMQ,
} from './services/rabbitmq.js';

const app = express();

// ── Middleware ────────────────────────────────────────────────

app.use(corsMiddleware);
app.use(express.json({ limit: '1mb' }));

// Rate limiting on AI proxy routes only
app.use('/api/ai', rateLimitMiddleware);

// ── Routes ───────────────────────────────────────────────────

app.use(healthRoutes);
app.use(aiRoutes);
app.use(jobRoutes);

// ── Error handler (must be last) ─────────────────────────────

app.use(errorHandler);

// ── Startup ──────────────────────────────────────────────────

async function start(): Promise<void> {
    // Connect to Redis (non-blocking — degrades gracefully if unavailable)
    try {
        await getRedis();
        console.log('[Server] Redis connected');
    } catch (err) {
        console.warn(
            '[Server] Redis unavailable, running in degraded mode:',
            (err as Error).message,
        );
    }

    // Connect to RabbitMQ (non-blocking — job endpoints return 503 if unavailable)
    try {
        await connectRabbitMQ();
        console.log('[Server] RabbitMQ connected');
    } catch (err) {
        console.warn(
            '[Server] RabbitMQ unavailable, job queuing disabled:',
            (err as Error).message,
        );
    }

    app.listen(config.port, () => {
        console.log(`[InfinityCN API] listening on http://localhost:${config.port}`);
        console.log(`[InfinityCN API] health: http://localhost:${config.port}/health`);
        console.log(`[InfinityCN API] allowed origins: ${config.allowedOrigins.join(', ')}`);
    });
}

// ── Graceful shutdown ────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
    console.log(`\n[Server] ${signal} received, shutting down...`);

    const timeout = setTimeout(() => {
        console.error('[Server] Shutdown timeout, forcing exit');
        process.exit(1);
    }, 30_000);

    try {
        await Promise.all([disconnectRedis(), disconnectRabbitMQ()]);
    } catch (err) {
        console.error('[Server] Error during shutdown:', (err as Error).message);
    }

    clearTimeout(timeout);
    process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void start().catch(err => {
    console.error('[Server] Fatal startup error:', (err as Error).message);
    process.exit(1);
});
