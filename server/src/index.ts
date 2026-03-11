/**
 * index.ts — InfinityCN API Server
 */

import express from 'express';
import { config } from './config.js';
import { corsMiddleware } from './middleware/cors.js';
import { jobsRateLimitMiddleware, rateLimitMiddleware } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import { securityHeaders } from './middleware/securityHeaders.js';
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

function enforceProductionSafety(): void {
    if (config.nodeEnv !== 'production') return;

    if (config.rabbitmqUrl.includes('infinitycn_dev')) {
        throw new Error('Unsafe default RabbitMQ credentials detected in production.');
    }

    if (config.allowedOrigins.some(origin => origin.includes('localhost'))) {
        console.warn('[Server] localhost is present in ALLOWED_ORIGINS while NODE_ENV=production');
    }
}

// ── Middleware ────────────────────────────────────────────────

app.use(securityHeaders);
app.use(corsMiddleware);
app.use(express.json({ limit: '1mb' }));

// Rate limiting
app.use('/api/ai', rateLimitMiddleware);
app.use('/api/jobs', jobsRateLimitMiddleware);

// ── Routes ───────────────────────────────────────────────────

app.use(healthRoutes);
app.use(aiRoutes);
app.use(jobRoutes);

// ── Error handler (must be last) ─────────────────────────────

app.use(errorHandler);

// ── Startup ──────────────────────────────────────────────────

async function start(): Promise<void> {
    enforceProductionSafety();

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

    await Promise.allSettled([disconnectRabbitMQ(), disconnectRedis()]);

    process.exit(0);
}

process.on('SIGINT', () => {
    void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
});

process.on('unhandledRejection', (reason: unknown) => {
    console.error('[Server] Unhandled promise rejection:', reason);
    void shutdown('unhandledRejection');
});

void start();
