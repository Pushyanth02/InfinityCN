/**
 * aiProvider.ts — Server-side AI provider calls
 *
 * Adapted from src/lib/ai.ts for Node.js.
 * Strips: chrome (browser-only), import.meta.env, proxy logic (server IS the proxy).
 * Uses config keys directly.
 */

import { config } from '../config.js';

// Provider response shapes vary; we use Record<string, unknown> and optional chaining
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProviderResponse = Record<string, any>;

// ─── Model Presets ──────────────────────────────────────────────

interface ModelPreset {
    model: string;
    maxTokens: number;
    temperature: number;
    supportsJSON: boolean;
}

const MODEL_PRESETS: Record<string, ModelPreset> = {
    gemini: {
        model: 'gemini-2.5-flash',
        maxTokens: 8192,
        temperature: 0.4,
        supportsJSON: true,
    },
    openai: {
        model: 'gpt-4o-mini',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
    },
    anthropic: {
        model: 'claude-3-5-sonnet-latest',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: false,
    },
    groq: {
        model: 'llama-3.3-70b-versatile',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
    },
    deepseek: {
        model: 'deepseek-chat',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
    },
    ollama: {
        model: 'llama3',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
    },
};

// ─── System Prompt ──────────────────────────────────────────────

const SYSTEM_PROMPT =
    'You are a precise literary analyst. Output strictly valid JSON only — no markdown, no explanation.';

// ─── Error Classification ───────────────────────────────────────

type AIErrorType =
    | 'rate_limit'
    | 'auth'
    | 'network'
    | 'timeout'
    | 'invalid_response'
    | 'model_unavailable'
    | 'unknown';

class AIError extends Error {
    type: AIErrorType;
    provider: string;
    retryable: boolean;
    retryAfterMs?: number;

    constructor(
        message: string,
        type: AIErrorType,
        provider: string,
        retryable = false,
        retryAfterMs?: number,
    ) {
        super(message);
        this.name = 'AIError';
        this.type = type;
        this.provider = provider;
        this.retryable = retryable;
        this.retryAfterMs = retryAfterMs;
    }
}

function classifyError(err: unknown, provider: string): AIError {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
        return new AIError(msg, 'rate_limit', provider, true, 5000);
    }
    if (
        msg.includes('401') ||
        msg.includes('403') ||
        msg.toLowerCase().includes('unauthorized') ||
        msg.toLowerCase().includes('api key')
    ) {
        return new AIError(msg, 'auth', provider, false);
    }
    if (
        msg.includes('Failed to fetch') ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('econnrefused')
    ) {
        return new AIError(msg, 'network', provider, true, 2000);
    }
    if (msg.includes('timeout') || msg.includes('aborted')) {
        return new AIError(msg, 'timeout', provider, true, 1000);
    }
    if (msg.includes('503') || msg.toLowerCase().includes('unavailable')) {
        return new AIError(msg, 'model_unavailable', provider, true, 10000);
    }

    return new AIError(msg, 'unknown', provider, false);
}

// ─── Retry with Exponential Backoff ─────────────────────────────

async function withRetry<T>(
    fn: () => Promise<T>,
    provider: string,
    maxRetries = 2,
    baseDelayMs = 1500,
): Promise<T> {
    const MAX_DELAY_MS = 30_000; // Never wait more than 30 seconds
    let lastError: AIError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err: unknown) {
            lastError = classifyError(err, provider);

            if (!lastError.retryable || attempt >= maxRetries) {
                throw lastError;
            }

            const rawDelay = lastError.retryAfterMs ?? baseDelayMs * Math.pow(2, attempt);
            const delay = Math.min(rawDelay, MAX_DELAY_MS);
            await new Promise(r => setTimeout(r, delay));
        }
    }

    throw lastError ?? new AIError('Unknown error', 'unknown', provider, false);
}

// ─── Provider Key Lookup ────────────────────────────────────────

function getProviderKey(provider: string): string {
    switch (provider) {
        case 'gemini':
            return config.geminiKey;
        case 'openai':
            return config.openaiKey;
        case 'anthropic':
            return config.anthropicKey;
        case 'groq':
            return config.groqKey;
        case 'deepseek':
            return config.deepseekKey;
        default:
            return '';
    }
}

// ─── Core AI Call ───────────────────────────────────────────────

async function callAI(prompt: string, provider: string): Promise<string> {
    const preset = MODEL_PRESETS[provider];
    if (!preset) throw new Error(`No model preset for provider "${provider}".`);

    const maxTokens = Math.min(preset.maxTokens, config.maxTokensCap);
    let result = '';

    // ── GEMINI ──────────────────────────────────────────────
    if (provider === 'gemini') {
        const key = getProviderKey('gemini');
        if (!key) throw new Error('Gemini API key is not configured.');

        const geminiBody = {
            system_instruction: {
                parts: [{ text: SYSTEM_PROMPT }],
            },
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                response_mime_type: 'application/json',
                temperature: preset.temperature,
                maxOutputTokens: maxTokens,
            },
        };

        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${preset.model}:generateContent`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': key,
                },
                signal: AbortSignal.timeout(60_000),
                body: JSON.stringify(geminiBody),
            },
        );
        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Gemini API error ${res.status}: ${errBody.slice(0, 200)}`);
        }
        const data = (await res.json().catch(() => null)) as ProviderResponse | null;
        if (!data) throw new Error('Gemini returned invalid JSON');
        result = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }

    // ── OPENAI ──────────────────────────────────────────────
    else if (provider === 'openai') {
        const key = getProviderKey('openai');
        if (!key) throw new Error('OpenAI API key is not configured.');

        const openaiBody = {
            model: preset.model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            max_tokens: maxTokens,
            temperature: preset.temperature,
        };

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            signal: AbortSignal.timeout(60_000),
            body: JSON.stringify(openaiBody),
        });
        if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${res.statusText}`);
        const data = (await res.json().catch(() => null)) as ProviderResponse | null;
        if (!data) throw new Error('OpenAI returned invalid JSON');
        result = data.choices?.[0]?.message?.content ?? '';
    }

    // ── ANTHROPIC ───────────────────────────────────────────
    else if (provider === 'anthropic') {
        const key = getProviderKey('anthropic');
        if (!key) throw new Error('Anthropic API key is not configured.');

        const anthropicBody = {
            model: preset.model,
            max_tokens: maxTokens,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }],
            temperature: preset.temperature,
        };

        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
            },
            signal: AbortSignal.timeout(60_000),
            body: JSON.stringify(anthropicBody),
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Anthropic error ${res.status}: ${errText.substring(0, 100)}`);
        }
        const data = (await res.json().catch(() => null)) as ProviderResponse | null;
        if (!data) throw new Error('Anthropic returned invalid JSON');
        result = data.content?.[0]?.text ?? '';
    }

    // ── GROQ ────────────────────────────────────────────────
    else if (provider === 'groq') {
        const key = getProviderKey('groq');
        if (!key) throw new Error('Groq API key is not configured.');

        const groqBody = {
            model: preset.model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            max_completion_tokens: maxTokens,
            temperature: preset.temperature,
        };

        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            signal: AbortSignal.timeout(60_000),
            body: JSON.stringify(groqBody),
        });
        if (!res.ok) throw new Error(`Groq error ${res.status}: ${res.statusText}`);
        const data = (await res.json().catch(() => null)) as ProviderResponse | null;
        if (!data) throw new Error('Groq returned invalid JSON');
        result = data.choices?.[0]?.message?.content ?? '';
    }

    // ── DEEPSEEK ────────────────────────────────────────────
    else if (provider === 'deepseek') {
        const key = getProviderKey('deepseek');
        if (!key) throw new Error('DeepSeek API key is not configured.');

        const deepseekBody = {
            model: preset.model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            max_tokens: maxTokens,
            temperature: preset.temperature,
        };

        const res = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
            },
            signal: AbortSignal.timeout(60_000),
            body: JSON.stringify(deepseekBody),
        });
        if (!res.ok) throw new Error(`DeepSeek error ${res.status}: ${res.statusText}`);
        const data = (await res.json().catch(() => null)) as ProviderResponse | null;
        if (!data) throw new Error('DeepSeek returned invalid JSON');
        result = data.choices?.[0]?.message?.content ?? '';
    }

    // ── OLLAMA ──────────────────────────────────────────────
    else if (provider === 'ollama') {
        const ollamaBody = {
            model: preset.model,
            prompt: `${SYSTEM_PROMPT}\n\n${prompt}`,
            stream: false,
            format: 'json',
        };

        const res = await fetch(`${config.ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(60_000),
            body: JSON.stringify(ollamaBody),
        });
        if (!res.ok) throw new Error(`Ollama error ${res.status}: ${res.statusText}`);
        const data = (await res.json().catch(() => null)) as ProviderResponse | null;
        if (!data) throw new Error('Ollama returned invalid JSON');
        result = data.response ?? '';
    }

    if (result) return result;

    throw new AIError(
        `Empty response from provider: ${provider}`,
        'invalid_response',
        provider,
        false,
    );
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Call an AI provider with retry logic.
 * Used by the worker to process cinematification chunks.
 *
 * @param prompt - The full prompt to send
 * @param provider - Provider name (gemini, openai, anthropic, groq, deepseek, ollama)
 * @returns The raw text response from the provider
 */
export async function callAIProvider(prompt: string, provider: string): Promise<string> {
    return withRetry(() => callAI(prompt, provider), provider);
}

/** List of providers that have API keys configured on the server */
export function getAvailableProviders(): string[] {
    const available: string[] = [];
    if (config.geminiKey) available.push('gemini');
    if (config.openaiKey) available.push('openai');
    if (config.anthropicKey) available.push('anthropic');
    if (config.groqKey) available.push('groq');
    if (config.deepseekKey) available.push('deepseek');
    // Ollama is always potentially available (local)
    available.push('ollama');
    return available;
}

export { AIError };
