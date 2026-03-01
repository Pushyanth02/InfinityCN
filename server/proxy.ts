/**
 * @deprecated This file is superseded by server/src/index.ts which adds
 * Redis caching, RabbitMQ job queues, and SSE progress streaming.
 * Use `cd server && npm run dev` instead of `npx tsx server/proxy.ts`.
 *
 * InfinityCN — Legacy API Proxy Server
 *
 * Proxies AI provider requests so API keys stay server-side.
 * Run: npx tsx server/proxy.ts
 *
 * Environment variables (set in .env or shell):
 *   PORT                 (default: 3001)
 *   ALLOWED_ORIGINS      (comma-separated, default: http://localhost:5173)
 *   GEMINI_API_KEY
 *   OPENAI_API_KEY
 *   ANTHROPIC_API_KEY
 *   GROQ_API_KEY
 *   DEEPSEEK_API_KEY
 *   OLLAMA_URL           (default: http://localhost:11434)
 */

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// ── CORS — restrict to known origins ───────────────────────────────────────

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(
    cors({
        origin(origin, cb) {
            // Allow requests with no origin (curl, server-to-server)
            if (!origin || ALLOWED_ORIGINS.includes(origin)) {
                cb(null, true);
            } else {
                cb(new Error(`Origin ${origin} not allowed by CORS`));
            }
        },
    }),
);

app.use(express.json({ limit: '1mb' }));

// ── Per-IP rate limiter (sliding window) ───────────────────────────────────

const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_MAX_REQUESTS = 30; // per window per IP

const ipHits = new Map<string, number[]>();

function rateLimit(req: express.Request, res: express.Response): boolean {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    const hits = (ipHits.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS);
    if (hits.length >= RATE_MAX_REQUESTS) {
        res.status(429).json({ error: 'Rate limit exceeded. Try again shortly.' });
        return false;
    }
    hits.push(now);
    ipHits.set(ip, hits);
    return true;
}

// Periodically prune stale IP entries (every 5 minutes)
setInterval(() => {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    for (const [ip, hits] of ipHits) {
        const live = hits.filter(t => t > cutoff);
        if (live.length === 0) ipHits.delete(ip);
        else ipHits.set(ip, live);
    }
}, 5 * 60_000);

// ── Provider endpoints ──────────────────────────────────────────────────────

const PROVIDERS: Record<
    string,
    {
        url: string | (() => string);
        keyEnv: string;
        authHeader: (key: string) => Record<string, string>;
    }
> = {
    gemini: {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        keyEnv: 'GEMINI_API_KEY',
        authHeader: key => ({ 'x-goog-api-key': key }),
    },
    openai: {
        url: 'https://api.openai.com/v1/chat/completions',
        keyEnv: 'OPENAI_API_KEY',
        authHeader: key => ({ Authorization: `Bearer ${key}` }),
    },
    anthropic: {
        url: 'https://api.anthropic.com/v1/messages',
        keyEnv: 'ANTHROPIC_API_KEY',
        authHeader: key => ({
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
        }),
    },
    groq: {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        keyEnv: 'GROQ_API_KEY',
        authHeader: key => ({ Authorization: `Bearer ${key}` }),
    },
    deepseek: {
        url: 'https://api.deepseek.com/chat/completions',
        keyEnv: 'DEEPSEEK_API_KEY',
        authHeader: key => ({ Authorization: `Bearer ${key}` }),
    },
    ollama: {
        url: () =>
            `${(process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '')}/api/generate`,
        keyEnv: '',
        authHeader: () => ({}),
    },
};

// ── Max tokens cap per provider (prevents cost abuse) ───────────────────────

const MAX_TOKENS_CAP = 2048;

function clampTokens(body: Record<string, unknown>): void {
    for (const key of ['max_tokens', 'max_completion_tokens', 'maxOutputTokens']) {
        if (typeof body[key] === 'number') {
            body[key] = Math.min(body[key] as number, MAX_TOKENS_CAP);
        }
    }
    // Gemini nests under generationConfig
    const gc = body.generationConfig as Record<string, unknown> | undefined;
    if (gc && typeof gc.maxOutputTokens === 'number') {
        gc.maxOutputTokens = Math.min(gc.maxOutputTokens, MAX_TOKENS_CAP);
    }
}

// ── Health check ────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
    const available = Object.entries(PROVIDERS)
        .filter(([, p]) => !p.keyEnv || process.env[p.keyEnv])
        .map(([name]) => name);
    res.json({ status: 'ok', providers: available });
});

// ── Proxy route ─────────────────────────────────────────────────────────────

app.post('/api/ai/:provider', async (req, res) => {
    if (!rateLimit(req, res)) return;

    const { provider } = req.params;
    const config = PROVIDERS[provider];

    if (!config) {
        res.status(400).json({ error: `Unknown provider: ${provider}` });
        return;
    }

    const apiKey = config.keyEnv ? process.env[config.keyEnv] : '';
    if (config.keyEnv && !apiKey) {
        res.status(503).json({ error: `${provider} API key not configured on server` });
        return;
    }

    // Validate body is a non-null object
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        res.status(400).json({ error: 'Request body must be a JSON object' });
        return;
    }

    // Prevent cost abuse by capping max output tokens
    clampTokens(req.body);

    const targetUrl = typeof config.url === 'function' ? config.url() : config.url;

    try {
        const upstream = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...config.authHeader(apiKey || ''),
            },
            body: JSON.stringify(req.body),
            signal: AbortSignal.timeout(60_000),
        });

        const contentType = upstream.headers.get('content-type') || 'application/json';
        const body = await upstream.text();

        res.status(upstream.status).set('Content-Type', contentType).send(body);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Proxy request failed';
        res.status(502).json({ error: message });
    }
});

// ── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`[InfinityCN Proxy] listening on http://localhost:${PORT}`);
    console.log(`[InfinityCN Proxy] health check: http://localhost:${PORT}/health`);
    console.log(`[InfinityCN Proxy] allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});
