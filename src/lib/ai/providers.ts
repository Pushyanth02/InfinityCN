/**
 * ai/providers.ts — AI Provider Implementations (Non-Streaming)
 *
 * Contains the base `callAI` router dispatching to each provider's REST API,
 * plus shared helpers: proxyFetch, handleHttpError, getTimeoutMs.
 */

import type { AIConfig } from './types';
import { MODEL_PRESETS } from './presets';
import { AIError } from './errors';
import { AI_JSON_TIMEOUT_MS, AI_RAWTEXT_TIMEOUT_MS, AI_MAX_RETRY_DELAY_MS } from '../constants';

// ─── UNIFIED SYSTEM PROMPT ────────────────────────────────────────────────────

export const SYSTEM_PROMPT =
    'You are a precise literary analyst. Output strictly valid JSON only — no markdown, no explanation.';

// ─── PROXY SUPPORT ────────────────────────────────────────────────────────────

export const API_PROXY_URL = import.meta.env.VITE_API_PROXY_URL as string | undefined;

/**
 * Returns an appropriate fetch timeout for this call type.
 * Cinematification (rawTextMode) generates up to 4096 tokens of dense narrative
 * per chunk, which can take 60 s+ on slower providers — use a longer timeout.
 */
export function getTimeoutMs(rawTextMode?: boolean): number {
    return rawTextMode ? AI_RAWTEXT_TIMEOUT_MS : AI_JSON_TIMEOUT_MS;
}

/** If a proxy URL is configured, route provider requests through it instead of calling the API directly. */
export async function proxyFetch(
    provider: string,
    body: Record<string, unknown>,
    timeoutMs = AI_JSON_TIMEOUT_MS,
): Promise<Response> {
    if (!API_PROXY_URL) {
        throw new Error('API proxy URL is not configured (VITE_API_PROXY_URL not set).');
    }
    return fetch(`${API_PROXY_URL}/api/ai/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
    });
}

/**
 * Centralised HTTP-error handler for provider responses.
 * Parses the `Retry-After` header on 429 responses so the retry backoff
 * uses the provider's own stated wait time rather than a hard-coded guess.
 */
export async function handleHttpError(res: Response, provider: string): Promise<never> {
    if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const waitMs = retryAfter
            ? Math.min(parseFloat(retryAfter) * 1000, AI_MAX_RETRY_DELAY_MS)
            : 5000;
        throw new AIError(`${provider} rate limit exceeded`, 'rate_limit', provider, true, waitMs);
    }
    // Try to include a snippet of the body for better diagnostics
    const body = await res.text().catch(() => res.statusText);
    throw new AIError(
        `${provider} error ${res.status}: ${body.slice(0, 200)}`,
        res.status >= 500 ? 'model_unavailable' : 'unknown',
        provider,
        res.status >= 500, // 5xx are retryable
    );
}

// ─── BASE ROUTER (single source of truth for all providers) ───────────────────

export async function callAI(prompt: string, config: AIConfig): Promise<string> {
    if (config.provider === 'none')
        throw new Error('AI provider is not configured. Open AI Settings to choose a provider.');

    const preset = MODEL_PRESETS[config.provider];
    if (!preset) throw new Error(`No model preset configured for provider "${config.provider}".`);
    let result = '';

    const sysPrompt = config.systemPrompt ?? SYSTEM_PROMPT;
    const useJSON = !config.rawTextMode;
    const maxTokens = config.rawTextMode ? Math.min(preset.maxTokens, 4096) : 800;
    const timeoutMs = getTimeoutMs(config.rawTextMode);

    // ── CHROME NANO ──────────────────────────────────────────
    if (config.provider === 'chrome') {
        if (!window.ai?.languageModel) {
            throw new Error(
                'Chrome AI is not available in this browser. Enable it in chrome://flags.',
            );
        }
        const caps = await window.ai.languageModel.capabilities();
        if (caps.available === 'no')
            throw new Error('Chrome AI model is unavailable (may need to download).');

        const session = await window.ai.languageModel.create({
            systemPrompt: sysPrompt,
        });
        try {
            result = await session.prompt(prompt);
        } finally {
            session.destroy();
        }
    }

    // ── GEMINI ────────────────────────────────────────────────
    else if (config.provider === 'gemini') {
        if (!API_PROXY_URL && !config.geminiKey) throw new Error('Gemini API key is not set.');

        const geminiBody = {
            system_instruction: {
                parts: [{ text: sysPrompt }],
            },
            contents: [{ parts: [{ text: prompt }] }],
            tools: config.useSearchGrounding ? [{ google_search: {} }] : undefined,
            generationConfig: {
                ...(useJSON ? { response_mime_type: 'application/json' } : {}),
                temperature: preset.temperature,
                maxOutputTokens: maxTokens,
            },
        };

        const res = API_PROXY_URL
            ? await proxyFetch('gemini', geminiBody, timeoutMs)
            : await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/${preset.model}:generateContent`,
                  {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'x-goog-api-key': config.geminiKey,
                      },
                      signal: AbortSignal.timeout(timeoutMs),
                      body: JSON.stringify(geminiBody),
                  },
              );
        if (!res.ok) await handleHttpError(res, 'gemini');
        const data = await res.json();
        result = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }

    // ── OPENAI ────────────────────────────────────────────────
    else if (config.provider === 'openai') {
        if (!API_PROXY_URL && !config.openAiKey) throw new Error('OpenAI API key is not set.');
        const openaiBody = {
            model: preset.model,
            messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: prompt },
            ],
            ...(useJSON ? { response_format: { type: 'json_object' } } : {}),
            max_tokens: maxTokens,
            temperature: preset.temperature,
        };
        const res = API_PROXY_URL
            ? await proxyFetch('openai', openaiBody, timeoutMs)
            : await fetch('https://api.openai.com/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${config.openAiKey}`,
                  },
                  signal: AbortSignal.timeout(timeoutMs),
                  body: JSON.stringify(openaiBody),
              });
        if (!res.ok) await handleHttpError(res, 'openai');
        const data = await res.json();
        result = data.choices?.[0]?.message?.content ?? '';
    }

    // ── ANTHROPIC ─────────────────────────────────────────────
    else if (config.provider === 'anthropic') {
        if (!API_PROXY_URL && !config.anthropicKey)
            throw new Error('Anthropic API key is not set.');
        const anthropicBody = {
            model: preset.model,
            max_tokens: maxTokens,
            system: sysPrompt,
            messages: [{ role: 'user', content: prompt }],
            temperature: preset.temperature,
        };
        const res = API_PROXY_URL
            ? await proxyFetch('anthropic', anthropicBody, timeoutMs)
            : await fetch('https://api.anthropic.com/v1/messages', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      'x-api-key': config.anthropicKey,
                      'anthropic-version': '2023-06-01',
                      // Required for direct browser→Anthropic calls without a backend proxy.
                      // Anthropic blocks browser CORS by default; this header opts in.
                      // Safe here because the key is user-provided and stored locally.
                      'anthropic-dangerous-direct-browser-access': 'true',
                  },
                  signal: AbortSignal.timeout(timeoutMs),
                  body: JSON.stringify(anthropicBody),
              });
        if (!res.ok) await handleHttpError(res, 'anthropic');
        const data = await res.json();
        result = data.content?.[0]?.text ?? '';
    }

    // ── GROQ ──────────────────────────────────────────────────
    else if (config.provider === 'groq') {
        if (!API_PROXY_URL && !config.groqKey) throw new Error('Groq API key is not set.');
        const groqBody = {
            model: preset.model,
            messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: prompt },
            ],
            ...(useJSON ? { response_format: { type: 'json_object' } } : {}),
            max_completion_tokens: maxTokens,
            temperature: preset.temperature,
        };
        const res = API_PROXY_URL
            ? await proxyFetch('groq', groqBody, timeoutMs)
            : await fetch('https://api.groq.com/openai/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${config.groqKey}`,
                  },
                  signal: AbortSignal.timeout(timeoutMs),
                  body: JSON.stringify(groqBody),
              });
        if (!res.ok) await handleHttpError(res, 'groq');
        const data = await res.json();
        result = data.choices?.[0]?.message?.content ?? '';
    }

    // ── DEEPSEEK ──────────────────────────────────────────────
    else if (config.provider === 'deepseek') {
        if (!API_PROXY_URL && !config.deepseekKey) throw new Error('DeepSeek API key is not set.');
        const deepseekBody = {
            model: preset.model,
            messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user', content: prompt },
            ],
            ...(useJSON ? { response_format: { type: 'json_object' } } : {}),
            max_tokens: maxTokens,
            temperature: preset.temperature,
        };
        const res = API_PROXY_URL
            ? await proxyFetch('deepseek', deepseekBody, timeoutMs)
            : await fetch('https://api.deepseek.com/chat/completions', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${config.deepseekKey}`,
                  },
                  signal: AbortSignal.timeout(timeoutMs),
                  body: JSON.stringify(deepseekBody),
              });
        if (!res.ok) await handleHttpError(res, 'deepseek');
        const data = await res.json();
        result = data.choices?.[0]?.message?.content ?? '';
    }

    // ── OLLAMA ────────────────────────────────────────────────
    else if (config.provider === 'ollama') {
        if (!config.ollamaUrl && !API_PROXY_URL) {
            throw new Error('Ollama URL is not configured.');
        }
        const ollamaBody = {
            model: config.ollamaModel || preset.model,
            prompt: `${sysPrompt}\n\n${prompt}`,
            stream: false,
            ...(useJSON ? { format: 'json' } : {}),
        };
        const res = API_PROXY_URL
            ? await proxyFetch('ollama', ollamaBody, timeoutMs)
            : await fetch(`${config.ollamaUrl!.replace(/\/$/, '')}/api/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  signal: AbortSignal.timeout(timeoutMs),
                  body: JSON.stringify(ollamaBody),
              });
        if (!res.ok) await handleHttpError(res, 'ollama');
        const data = await res.json();
        result = data.response ?? '';
    }

    if (result !== '') return result;

    throw new AIError(
        `Empty response from provider: ${config.provider}`,
        'invalid_response',
        config.provider,
        false,
    );
}
