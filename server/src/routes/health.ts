/**
 * routes/health.ts — Enhanced health check with Redis and RabbitMQ status
 */

import { Router } from 'express';
import { isHealthy as redisHealthy } from '../services/redis.js';
import { isHealthy as rabbitmqHealthy } from '../services/rabbitmq.js';
import { PROVIDERS } from './ai.js';

const router = Router();

router.get('/health', async (_req, res) => {
    const startTime = process.uptime();

    const [redis, rabbitmq] = await Promise.all([redisHealthy(), rabbitmqHealthy()]);

    const available = Object.entries(PROVIDERS)
        .filter(([, p]) => !p.keyEnv || process.env[p.keyEnv])
        .map(([name]) => name);

    const allHealthy = redis.connected && rabbitmq;
    const anyHealthy = redis.connected || rabbitmq;

    res.status(allHealthy ? 200 : anyHealthy ? 200 : 503).json({
        status: allHealthy ? 'ok' : anyHealthy ? 'degraded' : 'unhealthy',
        uptime: Math.round(startTime),
        redis: { connected: redis.connected, latencyMs: redis.latencyMs },
        rabbitmq: { connected: rabbitmq },
        providers: available,
    });
});

export default router;
