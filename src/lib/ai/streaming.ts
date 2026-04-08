/**
 * ai/streaming.ts — Streaming AI Response Handler
 *
 * Async generator `streamAI` yields text chunks in real-time from each provider.
 * Uses a shared SSE parser with per-provider delta extractors.
 */

import type { AIConfig } from './types';
import { MODEL_PRESETS } from './presets';
import { RateLimiter } from './rateLimiter';
import {
    API_PROXY_URL,
    handleHttpError,
    proxyFetch,
    OPENAI_COMPATIBLE_PROVIDERS,
    prepareAICall,
    getApiKeyCandidates,
    fetchWithKeyRotation,
} from './providers';
import { assertSecureEndpoint } from '../security/aiSecurity';

// ─── RATE LIMITER (shared with callAI via getRateLimiter) ──

const rateLimiters = new Map<string, RateLimiter>();

export function getRateLimiter(provider: string): RateLimiter {
    if (!rateLimiters.has(provider)) {
        const preset = MODEL_PRESETS[provider] || { rateLimitRPM: 60, rateLimitTPM: 60_000 };
        rateLimiters.set(provider, new RateLimiter(preset.rateLimitRPM, preset.rateLimitTPM));
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
    const prepared = prepareAICall(prompt, config);
    const provider = prepared.provider;

    // Acquire rate limit token
    const limiter = getRateLimiter(provider);
    await limiter.acquire({ requests: 1, tokens: prepared.tokenPlan.totalBudgetTokens });

    // ── CHROME NANO STREAMING ────────────────────────────────
    if (provider === 'chrome') {
        if (!window.ai?.languageModel) {
            throw new Error('Chrome AI is not available.');
        }
        const session = await window.ai.languageModel.create({ systemPrompt: prepared.systemPrompt });
        try {
            const stream = session.promptStreaming(prepared.prompt);
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
    if (provider === 'ollama') {
        if (!config.ollamaUrl && !API_PROXY_URL) {
            throw new Error('Ollama URL is not configured.');
        }

        const ollamaUrl = config.ollamaUrl?.replace(/\/$/, '') ?? '';
        if (!API_PROXY_URL) {
            assertSecureEndpoint(ollamaUrl, 'Ollama URL', { allowHttpLocalhost: true });
        }

        const ollamaBody = {
            model: prepared.model,
            prompt: `${prepared.systemPrompt}\n\n${prepared.prompt}`,
            stream: true,
        };
        const res = API_PROXY_URL
            ? await proxyFetch('ollama', ollamaBody, prepared.timeoutMs)
            : await fetch(`${ollamaUrl}/api/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  signal: AbortSignal.timeout(prepared.timeoutMs),
                  body: JSON.stringify(ollamaBody),
              });

        if (!res.ok) await handleHttpError(res, 'ollama');
        if (!res.body) throw new Error('No response body from Ollama');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.trim()) continue;
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
    if (provider in OPENAI_COMPATIBLE_PROVIDERS) {
        const providerCfg = OPENAI_COMPATIBLE_PROVIDERS[provider];
        const url = API_PROXY_URL ? `${API_PROXY_URL}/api/ai/${provider}` : providerCfg.url;

        const body = {
            model: prepared.model,
            messages: [
                { role: 'system', content: prepared.systemPrompt },
                { role: 'user', content: prepared.prompt },
            ],
            stream: true,
            [providerCfg.maxTokensField]: prepared.maxTokens,
            temperature: prepared.preset.temperature,
        };

        const res = API_PROXY_URL
            ? await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                  signal: AbortSignal.timeout(prepared.timeoutMs),
              })
            : await fetchWithKeyRotation(provider, getApiKeyCandidates(config, provider), apiKey => {
                  assertSecureEndpoint(providerCfg.url, `${provider} endpoint`);
                  return fetch(providerCfg.url, {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${apiKey}`,
                      },
                      body: JSON.stringify(body),
                      signal: AbortSignal.timeout(prepared.timeoutMs),
                  });
              });

        if (!res.ok) await handleHttpError(res, provider);
        if (!res.body) throw new Error('No response body');

        yield* parseSSEStream(res.body.getReader(), sseExtractors.openai);
        return;
    }

    // ── GEMINI STREAMING ─────────────────────────────────────
    if (provider === 'gemini') {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${prepared.model}:streamGenerateContent?alt=sse`;

        const geminiBody = {
            system_instruction: { parts: [{ text: prepared.systemPrompt }] },
            contents: [{ parts: [{ text: prepared.prompt }] }],
            tools: config.useSearchGrounding ? [{ google_search: {} }] : undefined,
            generationConfig: {
                temperature: prepared.preset.temperature,
                maxOutputTokens: prepared.maxTokens,
            },
        };

        const url = API_PROXY_URL
            ? // When using the backend proxy, the standard /api/ai/gemini endpoint is used.
              // The proxy forwards the full request body (which includes stream mode via the
              // :streamGenerateContent upstream URL).  A stale ?stream=true query param was
              // previously appended here but the proxy never read it — removed to avoid confusion.
              `${API_PROXY_URL}/api/ai/gemini`
            : geminiUrl;

        const res = API_PROXY_URL
            ? await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(geminiBody),
                  signal: AbortSignal.timeout(prepared.timeoutMs),
              })
            : await fetchWithKeyRotation(provider, getApiKeyCandidates(config, provider), apiKey => {
                  assertSecureEndpoint(geminiUrl, 'Gemini streaming endpoint');
                  return fetch(geminiUrl, {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'x-goog-api-key': apiKey,
                      },
                      body: JSON.stringify(geminiBody),
                      signal: AbortSignal.timeout(prepared.timeoutMs),
                  });
              });

        if (!res.ok) await handleHttpError(res, 'gemini');
        if (!res.body) throw new Error('No response body');

        yield* parseSSEStream(res.body.getReader(), sseExtractors.gemini);
        return;
    }

    // ── ANTHROPIC STREAMING ──────────────────────────────────
    if (provider === 'anthropic') {
        const anthropicUrl = 'https://api.anthropic.com/v1/messages';

        const anthropicBody = {
            model: prepared.model,
            max_tokens: prepared.maxTokens,
            system: prepared.systemPrompt,
            messages: [{ role: 'user', content: prepared.prompt }],
            temperature: prepared.preset.temperature,
            stream: true,
        };

        const url = API_PROXY_URL ? `${API_PROXY_URL}/api/ai/anthropic` : anthropicUrl;

        const res = API_PROXY_URL
            ? await fetch(url, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      'anthropic-version': '2023-06-01',
                  },
                  body: JSON.stringify(anthropicBody),
                  signal: AbortSignal.timeout(prepared.timeoutMs),
              })
            : await fetchWithKeyRotation(provider, getApiKeyCandidates(config, provider), apiKey => {
                  assertSecureEndpoint(anthropicUrl, 'Anthropic streaming endpoint');
                  return fetch(anthropicUrl, {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'anthropic-version': '2023-06-01',
                          'x-api-key': apiKey,
                          'anthropic-dangerous-direct-browser-access': 'true',
                      },
                      body: JSON.stringify(anthropicBody),
                      signal: AbortSignal.timeout(prepared.timeoutMs),
                  });
              });

        if (!res.ok) await handleHttpError(res, 'anthropic');
        if (!res.body) throw new Error('No response body');

        yield* parseSSEStream(res.body.getReader(), sseExtractors.anthropic);
        return;
    }

    throw new Error(`Streaming not implemented for provider ${provider}`);
}
