/**
 * ai/providers.ts — AI Provider Implementations (Non-Streaming)
 *
 * Contains the base `callAI` router dispatching to each provider's REST API,
 * plus shared helpers: proxyFetch, handleHttpError, getTimeoutMs.
 */

import type { AIConfig, AIProvider, ModelPreset } from './types';
import { MODEL_PRESETS } from './presets';
import { AIError } from './errors';
import { AI_JSON_TIMEOUT_MS, AI_RAWTEXT_TIMEOUT_MS, AI_MAX_RETRY_DELAY_MS } from '../constants';
import { buildTokenPlan, type TokenPlan } from './tokenFlow';
import { assertSecureEndpoint, normalizeApiKey } from './security';

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
    assertSecureEndpoint(API_PROXY_URL, 'AI proxy URL', { allowHttpLocalhost: true });

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

function isAuthStatus(status: number): boolean {
    return status === 401 || status === 403;
}

const PROVIDER_KEY_FIELDS: Partial<Record<AIProvider, keyof AIConfig>> = {
    gemini: 'geminiKey',
    openai: 'openAiKey',
    anthropic: 'anthropicKey',
    groq: 'groqKey',
    deepseek: 'deepseekKey',
};

export function getApiKeyCandidates(config: AIConfig, provider: AIProvider): string[] {
    const candidates: string[] = [];

    const push = (value?: string) => {
        const normalized = normalizeApiKey(value);
        if (!normalized || candidates.includes(normalized)) return;
        candidates.push(normalized);
    };

    const providerField = PROVIDER_KEY_FIELDS[provider];
    if (providerField) {
        push(config[providerField] as string);
    }

    // Universal key can be reused across provider selections.
    push(config.universalApiKey);

    // Cross-field fallback recovers from keys pasted into another provider field.
    push(config.openAiKey);
    push(config.geminiKey);
    push(config.anthropicKey);
    push(config.groqKey);
    push(config.deepseekKey);

    return candidates;
}

export async function fetchWithKeyRotation(
    provider: AIProvider,
    keyCandidates: string[],
    request: (apiKey: string) => Promise<Response>,
): Promise<Response> {
    if (keyCandidates.length === 0) {
        throw new Error(`${capitalizeProvider(provider)} API key is not set.`);
    }

    for (let i = 0; i < keyCandidates.length; i++) {
        const response = await request(keyCandidates[i]);

        if (response.ok) {
            return response;
        }

        if (isAuthStatus(response.status) && i < keyCandidates.length - 1) {
            continue;
        }

        await handleHttpError(response, provider);
    }

    throw new Error(`${capitalizeProvider(provider)} API key is invalid.`);
}

export interface PreparedAICall {
    provider: Exclude<AIProvider, 'none'>;
    preset: ModelPreset;
    model: string;
    useJSON: boolean;
    timeoutMs: number;
    systemPrompt: string;
    prompt: string;
    maxTokens: number;
    tokenPlan: TokenPlan;
}

export function prepareAICall(prompt: string, config: AIConfig): PreparedAICall {
    if (config.provider === 'none') {
        throw new Error('AI provider is not configured. Open AI Settings to choose a provider.');
    }

    const preset = MODEL_PRESETS[config.provider];
    if (!preset) {
        throw new Error(`No model preset configured for provider "${config.provider}".`);
    }

    const systemPrompt = config.systemPrompt ?? SYSTEM_PROMPT;
    const useJSON = !config.rawTextMode;
    const desiredMaxTokens = config.rawTextMode ? Math.min(preset.maxTokens, 4096) : 800;

    const defaultModel =
        config.provider === 'ollama'
            ? normalizeApiKey(config.ollamaModel) || preset.model
            : preset.model;
    const model = normalizeApiKey(config.model) || defaultModel;

    const tokenPlan = buildTokenPlan(prompt, systemPrompt, desiredMaxTokens, preset.contextWindow);

    return {
        provider: config.provider,
        preset,
        model,
        useJSON,
        timeoutMs: getTimeoutMs(config.rawTextMode),
        systemPrompt,
        prompt: tokenPlan.prompt,
        maxTokens: tokenPlan.maxOutputTokens,
        tokenPlan,
    };
}

// ─── OPENAI-COMPATIBLE PROVIDER CONFIG ────────────────────────────────────────

interface OpenAICompatibleProviderConfig {
    url: string;
    keyField: keyof AIConfig;
    maxTokensField: string;
}

/** Providers that follow the OpenAI chat-completions API shape. */
export const OPENAI_COMPATIBLE_PROVIDERS: Record<string, OpenAICompatibleProviderConfig> = {
    openai: {
        url: 'https://api.openai.com/v1/chat/completions',
        keyField: 'openAiKey',
        maxTokensField: 'max_tokens',
    },
    groq: {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        keyField: 'groqKey',
        maxTokensField: 'max_completion_tokens',
    },
    deepseek: {
        url: 'https://api.deepseek.com/chat/completions',
        keyField: 'deepseekKey',
        maxTokensField: 'max_tokens',
    },
};

/** Capitalise a provider name for use in user-facing error messages. */
export function capitalizeProvider(provider: string): string {
    return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** Shared fetch logic for OpenAI-compatible providers (OpenAI, Groq, DeepSeek). */
async function callOpenAICompatible(
    config: AIConfig,
    prepared: PreparedAICall,
): Promise<string> {
    const provider = prepared.provider;
    const providerCfg = OPENAI_COMPATIBLE_PROVIDERS[provider];

    const body = {
        model: prepared.model,
        messages: [
            { role: 'system', content: prepared.systemPrompt },
            { role: 'user', content: prepared.prompt },
        ],
        ...(prepared.useJSON ? { response_format: { type: 'json_object' } } : {}),
        [providerCfg.maxTokensField]: prepared.maxTokens,
        temperature: prepared.preset.temperature,
    };

    const res = API_PROXY_URL
        ? await proxyFetch(provider, body, prepared.timeoutMs)
        : await fetchWithKeyRotation(provider, getApiKeyCandidates(config, provider), apiKey => {
              assertSecureEndpoint(providerCfg.url, `${capitalizeProvider(provider)} endpoint`);
              return fetch(providerCfg.url, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${apiKey}`,
                  },
                  signal: AbortSignal.timeout(prepared.timeoutMs),
                  body: JSON.stringify(body),
              });
          });

    if (!res.ok) await handleHttpError(res, provider);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
}

// ─── BASE ROUTER (single source of truth for all providers) ───────────────────

export async function callAI(
    prompt: string,
    config: AIConfig,
    preparedCall?: PreparedAICall,
): Promise<string> {
    const prepared = preparedCall ?? prepareAICall(prompt, config);
    const provider = prepared.provider;
    let result = '';

    // ── CHROME NANO ──────────────────────────────────────────
    if (provider === 'chrome') {
        if (!window.ai?.languageModel) {
            throw new Error(
                'Chrome AI is not available in this browser. Enable it in chrome://flags.',
            );
        }
        const caps = await window.ai.languageModel.capabilities();
        if (caps.available === 'no')
            throw new Error('Chrome AI model is unavailable (may need to download).');

        const session = await window.ai.languageModel.create({
            systemPrompt: prepared.systemPrompt,
        });
        try {
            result = await session.prompt(prepared.prompt);
        } finally {
            session.destroy();
        }
    }

    // ── GEMINI ────────────────────────────────────────────────
    else if (provider === 'gemini') {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${prepared.model}:generateContent`;

        const geminiBody = {
            system_instruction: {
                parts: [{ text: prepared.systemPrompt }],
            },
            contents: [{ parts: [{ text: prepared.prompt }] }],
            tools: config.useSearchGrounding ? [{ google_search: {} }] : undefined,
            generationConfig: {
                ...(prepared.useJSON ? { response_mime_type: 'application/json' } : {}),
                temperature: prepared.preset.temperature,
                maxOutputTokens: prepared.maxTokens,
            },
        };

        const res = API_PROXY_URL
            ? await proxyFetch('gemini', geminiBody, prepared.timeoutMs)
            : await fetchWithKeyRotation(provider, getApiKeyCandidates(config, provider), apiKey => {
                  assertSecureEndpoint(endpoint, 'Gemini endpoint');
                  return fetch(endpoint, {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'x-goog-api-key': apiKey,
                      },
                      signal: AbortSignal.timeout(prepared.timeoutMs),
                      body: JSON.stringify(geminiBody),
                  });
              });

        if (!res.ok) await handleHttpError(res, 'gemini');
        const data = await res.json();
        result = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }

    // ── OPENAI / GROQ / DEEPSEEK (OpenAI-compatible) ────────
    else if (provider in OPENAI_COMPATIBLE_PROVIDERS) {
        result = await callOpenAICompatible(config, prepared);
    }

    // ── ANTHROPIC ─────────────────────────────────────────────
    else if (provider === 'anthropic') {
        const anthropicBody = {
            model: prepared.model,
            max_tokens: prepared.maxTokens,
            system: prepared.systemPrompt,
            messages: [{ role: 'user', content: prepared.prompt }],
            temperature: prepared.preset.temperature,
        };

        const endpoint = 'https://api.anthropic.com/v1/messages';

        const res = API_PROXY_URL
            ? await proxyFetch('anthropic', anthropicBody, prepared.timeoutMs)
            : await fetchWithKeyRotation(provider, getApiKeyCandidates(config, provider), apiKey => {
                  assertSecureEndpoint(endpoint, 'Anthropic endpoint');
                  return fetch(endpoint, {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'x-api-key': apiKey,
                          'anthropic-version': '2023-06-01',
                          // Required for direct browser→Anthropic calls without a backend proxy.
                          // Anthropic blocks browser CORS by default; this header opts in.
                          // Safe here because the key is user-provided and stored locally.
                          'anthropic-dangerous-direct-browser-access': 'true',
                      },
                      signal: AbortSignal.timeout(prepared.timeoutMs),
                      body: JSON.stringify(anthropicBody),
                  });
              });

        if (!res.ok) await handleHttpError(res, 'anthropic');
        const data = await res.json();
        result = data.content?.[0]?.text ?? '';
    }

    // ── OLLAMA ────────────────────────────────────────────────
    else if (provider === 'ollama') {
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
            stream: false,
            ...(prepared.useJSON ? { format: 'json' } : {}),
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
        const data = await res.json();
        result = data.response ?? '';
    }

    if (result !== '') return result;

    throw new AIError(
        `Empty response from provider: ${provider}`,
        'invalid_response',
        provider,
        false,
    );
}
