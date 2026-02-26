/**
 * ai.ts — InfinityCN Multi-Provider AI Engine (V17)
 *
 * Providers:
 *   • 'none'   → fast offline algorithms only (no API calls)
 *   • 'chrome' → window.ai.languageModel (Gemini Nano, in-browser)
 *   • 'gemini' → Google Generative Language REST API
 *   • 'ollama' → local Ollama server
 *   • 'openai' → OpenAI API (gpt-4o-mini)
 *   • 'anthropic' → Anthropic API (claude-3.5-sonnet)
 *   • 'groq' → Groq API (llama-3.3-70b)
 *   • 'deepseek' → DeepSeek API
 *
 * V17 Improvements:
 *   • Unified API client with request deduplication
 *   • Model presets and token limits per provider
 *   • Enhanced caching with TTL
 *   • Request batching support
 *   • Proper rate limiting with token bucket
 *   • Streaming support for supported providers
 *   • Error categorization and recovery
 */

import type { AIConnectionStatus } from '../types';

// ─── PUBLIC CONFIG TYPE ────────────────────────────────────────────────────────

export interface AIConfig {
    provider:
        | 'none'
        | 'chrome'
        | 'gemini'
        | 'ollama'
        | 'openai'
        | 'anthropic'
        | 'groq'
        | 'deepseek';
    geminiKey: string;
    useSearchGrounding: boolean;
    openAiKey: string;
    anthropicKey: string;
    groqKey: string;
    deepseekKey: string;
    ollamaUrl: string;
    ollamaModel: string;
}

// ─── MODEL PRESETS ─────────────────────────────────────────────────────────────

interface ModelPreset {
    model: string;
    maxTokens: number;
    temperature: number;
    supportsJSON: boolean;
    supportsStreaming: boolean;
    rateLimitRPM: number;
}

const MODEL_PRESETS: Record<string, ModelPreset> = {
    chrome: {
        model: 'gemini-nano',
        maxTokens: 2048,
        temperature: 0.4,
        supportsJSON: false,
        supportsStreaming: false,
        rateLimitRPM: 60,
    },
    gemini: {
        model: 'gemini-2.5-flash',
        maxTokens: 8192,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 15,
    },
    openai: {
        model: 'gpt-4o-mini',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 60,
    },
    anthropic: {
        model: 'claude-3-5-sonnet-latest',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: false,
        supportsStreaming: true,
        rateLimitRPM: 60,
    },
    groq: {
        model: 'llama-3.3-70b-versatile',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 30,
    },
    deepseek: {
        model: 'deepseek-chat',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: false,
        rateLimitRPM: 60,
    },
    ollama: {
        model: 'llama3',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: false,
        rateLimitRPM: 120,
    },
};

// ─── CHROME NANO GLOBAL TYPINGS ────────────────────────────────────────────────

declare global {
    interface Window {
        ai?: {
            languageModel: {
                capabilities: () => Promise<{ available: 'readily' | 'after-download' | 'no' }>;
                create: (options?: Record<string, unknown>) => Promise<{
                    prompt: (text: string) => Promise<string>;
                    promptStreaming: (text: string) => AsyncIterable<string>;
                    destroy: () => void;
                }>;
            };
        };
    }
}

// ─── UNIFIED SYSTEM PROMPT ────────────────────────────────────────────────────

const SYSTEM_PROMPT =
    'You are a precise literary analyst. Output strictly valid JSON only — no markdown, no explanation.';

// ═══════════════════════════════════════════════════════════
// ── ENHANCED CACHING SYSTEM ────────────────────────────────
// ═══════════════════════════════════════════════════════════

interface CacheEntry {
    value: string;
    timestamp: number;
    provider: string;
}

const apiCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCacheKey(prompt: string, provider: string): string {
    // DJB2 hash + length + head/tail substring for collision resistance
    let hash = 5381;
    for (let i = 0; i < prompt.length; i++) {
        hash = ((hash << 5) + hash + prompt.charCodeAt(i)) | 0;
    }
    const head = prompt.slice(0, 32);
    const tail = prompt.length > 64 ? prompt.slice(-32) : '';
    return `${provider}:${hash >>> 0}:${prompt.length}:${head}${tail}`;
}

function getFromCache(key: string): string | null {
    const entry = apiCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        apiCache.delete(key);
        return null;
    }
    // Move to end of Map insertion order (LRU touch)
    apiCache.delete(key);
    apiCache.set(key, entry);
    return entry.value;
}

function setCache(key: string, value: string, provider: string): void {
    // O(1) LRU eviction: Map preserves insertion order — oldest is first
    if (apiCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = apiCache.keys().next().value;
        if (oldestKey !== undefined) apiCache.delete(oldestKey);
    }
    apiCache.set(key, { value, timestamp: Date.now(), provider });
}

// ═══════════════════════════════════════════════════════════
// ── RATE LIMITER (Token Bucket) ────────────────────────────
// ═══════════════════════════════════════════════════════════

class RateLimiter {
    private tokens: number;
    private lastRefill: number;
    private readonly maxTokens: number;
    private readonly refillRate: number; // tokens per second

    constructor(rpm: number) {
        this.maxTokens = Math.ceil((rpm / 60) * 10); // Allow burst of 10 seconds worth
        this.tokens = this.maxTokens;
        this.refillRate = rpm / 60;
        this.lastRefill = Date.now();
    }

    async acquire(): Promise<void> {
        // Loop instead of recursion to avoid stack depth under contention
        while (true) {
            this.refill();
            if (this.tokens >= 1) {
                this.tokens -= 1;
                return;
            }
            const waitMs = (1 / this.refillRate) * 1000;
            await new Promise(r => setTimeout(r, waitMs));
        }
    }

    private refill(): void {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        const newTokens = elapsed * this.refillRate;
        this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
        this.lastRefill = now;
    }
}

const rateLimiters = new Map<string, RateLimiter>();

function getRateLimiter(provider: string): RateLimiter {
    if (!rateLimiters.has(provider)) {
        const preset = MODEL_PRESETS[provider] || { rateLimitRPM: 60 };
        rateLimiters.set(provider, new RateLimiter(preset.rateLimitRPM));
    }
    return rateLimiters.get(provider)!;
}

// ═══════════════════════════════════════════════════════════
// ── REQUEST DEDUPLICATION ──────────────────────────────────
// ═══════════════════════════════════════════════════════════

const inflightRequests = new Map<string, Promise<string>>();

// ═══════════════════════════════════════════════════════════
// ── ERROR CLASSIFICATION ───────────────────────────────────
// ═══════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════
// ── RETRY WITH EXPONENTIAL BACKOFF ─────────────────────────
// ═══════════════════════════════════════════════════════════

async function withRetry<T>(
    fn: () => Promise<T>,
    provider: string,
    maxRetries = 2,
    baseDelayMs = 1500,
): Promise<T> {
    let lastError: AIError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err: unknown) {
            lastError = classifyError(err, provider);

            if (!lastError.retryable || attempt >= maxRetries) {
                throw lastError;
            }

            const delay = lastError.retryAfterMs ?? baseDelayMs * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, delay));
        }
    }

    throw lastError ?? new AIError('Unknown error', 'unknown', provider, false);
}

// ═══════════════════════════════════════════════════════════
// ── PROXY SUPPORT ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

const API_PROXY_URL = import.meta.env.VITE_API_PROXY_URL as string | undefined;

/** If a proxy URL is configured, route provider requests through it instead of calling the API directly. */
async function proxyFetch(
    provider: string,
    body: Record<string, unknown>,
    timeoutMs = 30_000,
): Promise<Response> {
    return fetch(`${API_PROXY_URL}/api/ai/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
    });
}

// ═══════════════════════════════════════════════════════════
// ── BASE ROUTER (single source of truth for all providers) ─
// ═══════════════════════════════════════════════════════════

async function callAI(prompt: string, config: AIConfig): Promise<string> {
    if (config.provider === 'none')
        throw new Error('AI provider is not configured. Open AI Settings to choose a provider.');

    const preset = MODEL_PRESETS[config.provider];
    if (!preset) throw new Error(`No model preset configured for provider "${config.provider}".`);
    let result = '';

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
            systemPrompt: SYSTEM_PROMPT,
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
                parts: [{ text: SYSTEM_PROMPT }],
            },
            contents: [{ parts: [{ text: prompt }] }],
            tools: config.useSearchGrounding ? [{ google_search: {} }] : undefined,
            generationConfig: {
                response_mime_type: 'application/json',
                temperature: preset.temperature,
                maxOutputTokens: 800,
            },
        };

        const res = API_PROXY_URL
            ? await proxyFetch('gemini', geminiBody)
            : await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/${preset.model}:generateContent`,
                  {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'x-goog-api-key': config.geminiKey,
                      },
                      signal: AbortSignal.timeout(30_000),
                      body: JSON.stringify(geminiBody),
                  },
              );
        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Gemini API error ${res.status}: ${errBody.slice(0, 200)}`);
        }
        const data = await res.json();
        result = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }

    // ── OPENAI ────────────────────────────────────────────────
    else if (config.provider === 'openai') {
        if (!API_PROXY_URL && !config.openAiKey) throw new Error('OpenAI API key is not set.');
        const openaiBody = {
            model: preset.model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 800,
            temperature: preset.temperature,
        };
        const res = API_PROXY_URL
            ? await proxyFetch('openai', openaiBody)
            : await fetch('https://api.openai.com/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${config.openAiKey}`,
                  },
                  signal: AbortSignal.timeout(30_000),
                  body: JSON.stringify(openaiBody),
              });
        if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        result = data.choices?.[0]?.message?.content ?? '';
    }

    // ── ANTHROPIC ─────────────────────────────────────────────
    else if (config.provider === 'anthropic') {
        if (!API_PROXY_URL && !config.anthropicKey)
            throw new Error('Anthropic API key is not set.');
        const anthropicBody = {
            model: preset.model,
            max_tokens: 800,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }],
            temperature: preset.temperature,
        };
        const res = API_PROXY_URL
            ? await proxyFetch('anthropic', anthropicBody)
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
                  signal: AbortSignal.timeout(30_000),
                  body: JSON.stringify(anthropicBody),
              });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Anthropic error ${res.status}: ${errText.substring(0, 100)}`);
        }
        const data = await res.json();
        result = data.content?.[0]?.text ?? '';
    }

    // ── GROQ ──────────────────────────────────────────────────
    else if (config.provider === 'groq') {
        if (!API_PROXY_URL && !config.groqKey) throw new Error('Groq API key is not set.');
        const groqBody = {
            model: preset.model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            max_completion_tokens: 800,
            temperature: preset.temperature,
        };
        const res = API_PROXY_URL
            ? await proxyFetch('groq', groqBody)
            : await fetch('https://api.groq.com/openai/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${config.groqKey}`,
                  },
                  signal: AbortSignal.timeout(30_000),
                  body: JSON.stringify(groqBody),
              });
        if (!res.ok) throw new Error(`Groq error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        result = data.choices?.[0]?.message?.content ?? '';
    }

    // ── DEEPSEEK ──────────────────────────────────────────────
    else if (config.provider === 'deepseek') {
        if (!API_PROXY_URL && !config.deepseekKey) throw new Error('DeepSeek API key is not set.');
        const deepseekBody = {
            model: preset.model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 800,
            temperature: preset.temperature,
        };
        const res = API_PROXY_URL
            ? await proxyFetch('deepseek', deepseekBody)
            : await fetch('https://api.deepseek.com/chat/completions', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${config.deepseekKey}`,
                  },
                  signal: AbortSignal.timeout(30_000),
                  body: JSON.stringify(deepseekBody),
              });
        if (!res.ok) throw new Error(`DeepSeek error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        result = data.choices?.[0]?.message?.content ?? '';
    }

    // ── OLLAMA ────────────────────────────────────────────────
    else if (config.provider === 'ollama') {
        const ollamaBody = {
            model: config.ollamaModel || preset.model,
            prompt: `${SYSTEM_PROMPT}\n\n${prompt}`,
            stream: false,
            format: 'json',
        };
        const res = API_PROXY_URL
            ? await proxyFetch('ollama', ollamaBody)
            : await fetch(`${config.ollamaUrl.replace(/\/$/, '')}/api/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  signal: AbortSignal.timeout(30_000),
                  body: JSON.stringify(ollamaBody),
              });
        if (!res.ok) throw new Error(`Ollama error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        result = data.response ?? '';
    }

    if (result) return result;

    throw new AIError(
        `Empty response from provider: ${config.provider}`,
        'invalid_response',
        config.provider,
        false,
    );
}

// ═══════════════════════════════════════════════════════════
// ── UNIFIED API CLIENT (with deduplication + rate limiting)
// ═══════════════════════════════════════════════════════════

/**
 * Main entry point for AI calls with deduplication, caching, and rate limiting.
 */
export async function callAIWithDedup(prompt: string, config: AIConfig): Promise<string> {
    const cacheKey = getCacheKey(prompt, config.provider);

    // Check cache first
    const cached = getFromCache(cacheKey);
    if (cached) return cached;

    // Check for inflight request with same key
    if (inflightRequests.has(cacheKey)) {
        return inflightRequests.get(cacheKey)!;
    }

    // Acquire rate limit token
    const limiter = getRateLimiter(config.provider);
    await limiter.acquire();

    // Create and track the request
    const requestPromise = withRetry(() => callAI(prompt, config), config.provider);
    inflightRequests.set(cacheKey, requestPromise);

    try {
        const result = await requestPromise;
        setCache(cacheKey, result, config.provider);
        return result;
    } finally {
        inflightRequests.delete(cacheKey);
    }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Strip accidental markdown code fences from LLM output */
function stripFences(text: string): string {
    return text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

/** Parse JSON from LLM output, tolerating markdown code fences */
export function parseJSON<T>(raw: string): T {
    return JSON.parse(stripFences(raw)) as T;
}

// ═══════════════════════════════════════════════════════════
// ── PUBLIC TASK FUNCTIONS ───────────────────────────────────
// ═══════════════════════════════════════════════════════════

/**
 * Test whether the configured AI provider is reachable.
 * Returns a status object — does NOT throw.
 */
export async function testConnection(config: AIConfig): Promise<AIConnectionStatus> {
    if (config.provider === 'none') {
        return { ok: false, provider: 'none', message: 'AI is disabled — using algorithms.' };
    }

    const t0 = performance.now();
    try {
        const testPrompt = 'Reply with exactly this JSON: {"ok":true}';
        const raw = await callAIWithDedup(testPrompt, config);
        const parsed = parseJSON<{ ok?: boolean }>(raw);
        const latencyMs = Math.round(performance.now() - t0);

        if (parsed.ok) {
            return {
                ok: true,
                provider: config.provider,
                message: `Connected successfully.`,
                latencyMs,
            };
        }
        return {
            ok: false,
            provider: config.provider,
            message: 'Unexpected response from model.',
            latencyMs,
        };
    } catch (err) {
        return {
            ok: false,
            provider: config.provider,
            message: err instanceof Error ? err.message : 'Unknown error.',
        };
    }
}
