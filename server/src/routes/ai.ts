/**
 * routes/ai.ts — AI proxy routes with Redis caching
 *
 * Migrated from server/proxy.ts with added cache-check-before-upstream
 * and cache-write-after-response logic via Redis.
 */

import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { getCachedResponse, setCachedResponse } from '../services/cache.js';
import type { ProviderConfig } from '../types.js';

const router = Router();

// ── Provider endpoint configuration ─────────────────────────

export const PROVIDERS: Record<string, ProviderConfig> = {
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
        url: () => `${config.ollamaUrl}/api/generate`,
        keyEnv: '',
        authHeader: () => ({}),
    },
};

// ── Token capping (prevents cost abuse) ──────────────────────

function clampTokens(body: Record<string, unknown>): void {
    for (const key of ['max_tokens', 'max_completion_tokens', 'maxOutputTokens']) {
        if (typeof body[key] === 'number') {
            body[key] = Math.min(body[key] as number, config.maxTokensCap);
        }
    }
    const gc = body.generationConfig as Record<string, unknown> | undefined;
    if (gc && typeof gc.maxOutputTokens === 'number') {
        gc.maxOutputTokens = Math.min(gc.maxOutputTokens, config.maxTokensCap);
    }
}

// ── Cache key extraction from provider-specific body shapes ──

function extractPromptText(provider: string, body: Record<string, unknown>): string {
    try {
        if (provider === 'gemini') {
            const contents = body.contents as Array<{ parts?: Array<{ text?: string }> }>;
            return contents?.[0]?.parts?.[0]?.text ?? '';
        }
        if (provider === 'ollama') {
            return (body.prompt as string) ?? '';
        }
        // OpenAI / Anthropic / Groq / DeepSeek — messages array
        const messages = body.messages as Array<{ content?: string; role?: string }>;
        const userMsg = messages?.filter(m => m.role === 'user').pop();
        return userMsg?.content ?? '';
    } catch {
        return '';
    }
}

// ── Proxy route ──────────────────────────────────────────────

router.post('/api/ai/:provider', async (req: Request<{ provider: string }>, res: Response) => {
    const { provider } = req.params;
    const providerConfig = PROVIDERS[provider];

    if (!providerConfig) {
        res.status(400).json({ error: `Unknown provider: ${provider}` });
        return;
    }

    const apiKey = providerConfig.keyEnv ? process.env[providerConfig.keyEnv] : '';
    if (providerConfig.keyEnv && !apiKey) {
        res.status(503).json({ error: `${provider} API key not configured on server` });
        return;
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        res.status(400).json({ error: 'Request body must be a JSON object' });
        return;
    }

    clampTokens(req.body);

    // ── Cache check ──────────────────────────────────────────
    const promptText = extractPromptText(provider, req.body);
    if (promptText) {
        const cached = await getCachedResponse(provider, promptText);
        if (cached) {
            // Validate cached data is valid JSON before sending
            try {
                JSON.parse(cached);
                res.set('X-Cache', 'HIT').set('Content-Type', 'application/json').send(cached);
                return;
            } catch {
                // Corrupted cache entry — ignore and fetch fresh
            }
        }
    }

    // ── Forward to upstream provider ─────────────────────────
    const targetUrl =
        typeof providerConfig.url === 'function' ? providerConfig.url() : providerConfig.url;

    try {
        const upstream = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...providerConfig.authHeader(apiKey || ''),
            },
            body: JSON.stringify(req.body),
            signal: AbortSignal.timeout(60_000),
        });

        const contentType = upstream.headers.get('content-type') || 'application/json';
        const body = await upstream.text();

        // Cache successful responses
        if (upstream.ok && promptText) {
            void setCachedResponse(provider, promptText, body);
        }

        res.status(upstream.status)
            .set('Content-Type', contentType)
            .set('X-Cache', 'MISS')
            .send(body);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Proxy request failed';
        res.status(502).json({ error: message });
    }
});

export default router;
