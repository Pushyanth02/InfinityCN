/**
 * ai/streaming.ts — Streaming AI Response Handler
 *
 * Async generator `streamAI` yields text chunks in real-time from each provider.
 * Uses a shared SSE parser with per-provider delta extractors.
 */

import type { AIConfig } from './types';
import { MODEL_PRESETS } from './presets';
import { RateLimiter } from '../rateLimiter';
import { SYSTEM_PROMPT, API_PROXY_URL, getTimeoutMs, handleHttpError } from './providers';

// ─── RATE LIMITER (shared with callAI via getRateLimiter) ──

const rateLimiters = new Map<string, RateLimiter>();

export function getRateLimiter(provider: string): RateLimiter {
    if (!rateLimiters.has(provider)) {
        const preset = MODEL_PRESETS[provider] || { rateLimitRPM: 60 };
        rateLimiters.set(provider, new RateLimiter(preset.rateLimitRPM));
    }
    return rateLimiters.get(provider)!;
}

// ─── SSE STREAM PARSER ────────────────────────────────────────────────────────

/**
 * Shared SSE stream parser. Reads chunks, buffers partial lines,
 * and yields deltas extracted by the provider-specific extractor.
 */
async function* parseSSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    extractDelta: (data: unknown) => string | undefined,
): AsyncGenerator<string> {
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (trimmed === 'data: [DONE]') return;
            if (trimmed.startsWith('data: ')) {
                try {
                    const data = JSON.parse(trimmed.slice(6));
                    const delta = extractDelta(data);
                    if (delta) yield delta;
                } catch {
                    // Ignore malformed SSE chunks
                }
            }
        }
    }
}

// ─── SSE DELTA EXTRACTORS ─────────────────────────────────────────────────────

const sseExtractors = {
    openai: (data: unknown) =>
        (data as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta
            ?.content,
    gemini: (data: unknown) =>
        (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
            .candidates?.[0]?.content?.parts?.[0]?.text,
    anthropic: (data: unknown) => {
        const d = data as { type?: string; delta?: { type?: string; text?: string } };
        return d.type === 'content_block_delta' && d.delta?.type === 'text_delta'
            ? d.delta.text
            : undefined;
    },
} as const;

// ─── STREAMING ENTRY POINT ────────────────────────────────────────────────────

/**
 * Streaming entry point. Yields chunks of text as they arrive.
 * Dedup and caching are not applied to streaming to keep things real-time.
 */
export async function* streamAI(prompt: string, config: AIConfig): AsyncGenerator<string> {
    if (config.provider === 'none') {
        throw new Error('AI provider is not configured.');
    }

    const preset = MODEL_PRESETS[config.provider];
    if (!preset) throw new Error(`No model preset configured for provider "${config.provider}".`);

    const sysPrompt = config.systemPrompt ?? SYSTEM_PROMPT;
    const maxTokens = config.rawTextMode ? Math.min(preset.maxTokens, 4096) : 800;
    const timeoutMs = getTimeoutMs(config.rawTextMode);
    // Acquire rate limit token
    const limiter = getRateLimiter(config.provider);
    await limiter.acquire();

    // ── CHROME NANO STREAMING ────────────────────────────────
    if (config.provider === 'chrome') {
        if (!window.ai?.languageModel) {
            throw new Error('Chrome AI is not available.');
        }
        const session = await window.ai.languageModel.create({ systemPrompt: sysPrompt });
        try {
            const stream = session.promptStreaming(prompt);
            let previousLength = 0;
            for await (const chunk of stream) {
                // Chrome returns the FULL accumulated string each time, so we yield only the delta
                const delta = chunk.slice(previousLength);
                previousLength = chunk.length;
                if (delta) yield delta;
            }
        } finally {
            session.destroy();
        }
        return;
    }

    // ── OLLAMA STREAMING ─────────────────────────────────────
    if (config.provider === 'ollama') {
        const ollamaBody = {
            model: config.ollamaModel || preset.model,
            prompt: `${sysPrompt}\n\n${prompt}`,
            stream: true,
        };
        const res = API_PROXY_URL
            ? await (await import('./providers')).proxyFetch('ollama', ollamaBody, timeoutMs)
            : await fetch(`${config.ollamaUrl.replace(/\/$/, '')}/api/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  signal: AbortSignal.timeout(timeoutMs),
                  body: JSON.stringify(ollamaBody),
              });

        if (!res.ok) await handleHttpError(res, 'ollama');
        if (!res.body) throw new Error('No response body from Ollama');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(Boolean);
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    if (data.response) yield data.response;
                } catch {
                    // Ignore parse errors on partial chunks
                }
            }
        }
        return;
    }

    // ── OPENAI COMPATIBLE STREAMING (OpenAI, Groq, DeepSeek) ─
    if (['openai', 'groq', 'deepseek'].includes(config.provider)) {
        let url = '';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };

        if (config.provider === 'openai') {
            if (!API_PROXY_URL && !config.openAiKey) throw new Error('OpenAI key missing');
            url = API_PROXY_URL
                ? `${API_PROXY_URL}/api/ai/openai`
                : 'https://api.openai.com/v1/chat/completions';
            if (!API_PROXY_URL) headers['Authorization'] = `Bearer ${config.openAiKey}`;
        } else if (config.provider === 'groq') {
            if (!API_PROXY_URL && !config.groqKey) throw new Error('Groq key missing');
            url = API_PROXY_URL
                ? `${API_PROXY_URL}/api/ai/groq`
                : 'https://api.groq.com/openai/v1/chat/completions';
            if (!API_PROXY_URL) headers['Authorization'] = `Bearer ${config.groqKey}`;
        } else if (config.provider === 'deepseek') {
            if (!API_PROXY_URL && !config.deepseekKey) throw new Error('Deepseek key missing');
            url = API_PROXY_URL
                ? `${API_PROXY_URL}/api/ai/deepseek`
                : 'https://api.deepseek.com/chat/completions';
            if (!API_PROXY_URL) headers['Authorization'] = `Bearer ${config.deepseekKey}`;
        }

        const body = {
            model: preset.model,
            messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: prompt },
            ],
            stream: true,
            max_tokens: maxTokens,
            temperature: preset.temperature,
        };

        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) await handleHttpError(res, config.provider);
        if (!res.body) throw new Error('No response body');

        yield* parseSSEStream(res.body.getReader(), sseExtractors.openai);
        return;
    }

    // ── GEMINI STREAMING ─────────────────────────────────────
    if (config.provider === 'gemini') {
        if (!API_PROXY_URL && !config.geminiKey) throw new Error('Gemini API key is not set.');

        const geminiBody = {
            system_instruction: { parts: [{ text: sysPrompt }] },
            contents: [{ parts: [{ text: prompt }] }],
            tools: config.useSearchGrounding ? [{ google_search: {} }] : undefined,
            generationConfig: { temperature: preset.temperature, maxOutputTokens: maxTokens },
        };

        const url = API_PROXY_URL
            ? // When using the backend proxy, the standard /api/ai/gemini endpoint is used.
              // The proxy forwards the full request body (which includes stream mode via the
              // :streamGenerateContent upstream URL).  A stale ?stream=true query param was
              // previously appended here but the proxy never read it — removed to avoid confusion.
              `${API_PROXY_URL}/api/ai/gemini`
            : `https://generativelanguage.googleapis.com/v1beta/models/${preset.model}:streamGenerateContent?alt=sse`;

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (!API_PROXY_URL) headers['x-goog-api-key'] = config.geminiKey;

        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(geminiBody),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) await handleHttpError(res, 'gemini');
        if (!res.body) throw new Error('No response body');

        yield* parseSSEStream(res.body.getReader(), sseExtractors.gemini);
        return;
    }

    // ── ANTHROPIC STREAMING ──────────────────────────────────
    if (config.provider === 'anthropic') {
        if (!API_PROXY_URL && !config.anthropicKey)
            throw new Error('Anthropic API key is not set.');

        const anthropicBody = {
            model: preset.model,
            max_tokens: maxTokens,
            system: sysPrompt,
            messages: [{ role: 'user', content: prompt }],
            temperature: preset.temperature,
            stream: true,
        };

        const url = API_PROXY_URL
            ? `${API_PROXY_URL}/api/ai/anthropic`
            : 'https://api.anthropic.com/v1/messages';
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
        };

        if (!API_PROXY_URL) {
            headers['x-api-key'] = config.anthropicKey;
            headers['anthropic-dangerous-direct-browser-access'] = 'true';
        }

        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(anthropicBody),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) await handleHttpError(res, 'anthropic');
        if (!res.body) throw new Error('No response body');

        yield* parseSSEStream(res.body.getReader(), sseExtractors.anthropic);
        return;
    }

    throw new Error(`Streaming not implemented for provider ${config.provider}`);
}
