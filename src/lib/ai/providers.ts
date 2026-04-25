/**
 * ai/providers.ts — AI Provider Dispatch (Backward-Compatible Shim)
 *
 * Delegates to isolated provider classes in ./providers/ while preserving
 * the existing `callAI()` and `prepareAICall()` signatures that the rest
 * of the codebase depends on.
 *
 * All legacy exports are maintained — consumers don't need to change.
 */

import type { AIConfig, AIProvider, ModelPreset } from './types';
import { MODEL_PRESETS } from './presets';
import { AIError } from './errors';
import { AI_JSON_TIMEOUT_MS, AI_RAWTEXT_TIMEOUT_MS, AI_MAX_RETRY_DELAY_MS } from '../constants';
import { buildTokenPlan, type TokenPlan } from './tokenFlow';
import { assertSecureEndpoint, normalizeApiKey } from '../security/aiSecurity';
import { KeyManager, validateKey } from '../security/keyManager';
import { getProvider } from './providers/index';

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
    'nvidia-nim': 'nvidiaNimKey',
    gwen: 'gwenKey',
};

export function getApiKeyCandidates(config: AIConfig, provider: AIProvider): string[] {
    const candidates: string[] = [];

    const push = (value?: string) => {
        const normalized = normalizeApiKey(value);
        if (!normalized || !validateKey(normalized) || candidates.includes(normalized)) return;
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

// ─── BASE ROUTER — DELEGATES TO PROVIDER CLASSES ─────────────────────────────

const sharedKeyManager = new KeyManager();

/**
 * Main provider dispatch. Delegates to the isolated provider class for the
 * configured provider. Preserves the original `callAI()` signature exactly.
 */
export async function callAI(
    prompt: string,
    config: AIConfig,
    preparedCall?: PreparedAICall,
): Promise<string> {
    const prepared = preparedCall ?? prepareAICall(prompt, config);
    const provider = prepared.provider;
    sharedKeyManager.assertBackendOnlyUsage(provider, API_PROXY_URL);

    // Delegate to isolated provider class
    const providerInstance = getProvider(provider);
    const response = await providerInstance.generate(prepared.prompt, config, {
        model: prepared.model,
        maxTokens: prepared.maxTokens,
        temperature: prepared.preset.temperature,
        systemPrompt: prepared.systemPrompt,
        useJSON: prepared.useJSON,
        rawTextMode: config.rawTextMode,
        timeoutMs: prepared.timeoutMs,
    });

    if (response.text !== '') return response.text;

    throw new AIError(
        `Empty response from provider: ${provider}`,
        'invalid_response',
        provider,
        false,
    );
}
