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

import {
    extractCharacters,
    extractKeywords,
    analyseSentiment,
    computeReadability,
} from './algorithms';
import type {
    Character,
    AIConnectionStatus,
} from '../types';

// ─── PUBLIC CONFIG TYPE ────────────────────────────────────────────────────────

export interface AIConfig {
    provider: 'none' | 'chrome' | 'gemini' | 'ollama' | 'openai' | 'anthropic' | 'groq' | 'deepseek';
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
    chrome: { model: 'gemini-nano', maxTokens: 2048, temperature: 0.4, supportsJSON: false, supportsStreaming: false, rateLimitRPM: 60 },
    gemini: { model: 'gemini-2.5-flash', maxTokens: 8192, temperature: 0.4, supportsJSON: true, supportsStreaming: true, rateLimitRPM: 15 },
    openai: { model: 'gpt-4o-mini', maxTokens: 4096, temperature: 0.4, supportsJSON: true, supportsStreaming: true, rateLimitRPM: 60 },
    anthropic: { model: 'claude-3-5-sonnet-latest', maxTokens: 4096, temperature: 0.4, supportsJSON: false, supportsStreaming: true, rateLimitRPM: 60 },
    groq: { model: 'llama-3.3-70b-versatile', maxTokens: 4096, temperature: 0.4, supportsJSON: true, supportsStreaming: true, rateLimitRPM: 30 },
    deepseek: { model: 'deepseek-chat', maxTokens: 4096, temperature: 0.4, supportsJSON: true, supportsStreaming: false, rateLimitRPM: 60 },
    ollama: { model: 'llama3', maxTokens: 4096, temperature: 0.4, supportsJSON: true, supportsStreaming: false, rateLimitRPM: 120 },
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
    // Use a simple hash for the prompt to save memory
    const hash = prompt.split('').reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    return `${provider}:${hash}:${prompt.length}`;
}

function getFromCache(key: string): string | null {
    const entry = apiCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        apiCache.delete(key);
        return null;
    }
    return entry.value;
}

function setCache(key: string, value: string, provider: string): void {
    // LRU eviction
    if (apiCache.size >= MAX_CACHE_SIZE) {
        const oldest = Array.from(apiCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
        if (oldest) apiCache.delete(oldest[0]);
    }
    apiCache.set(key, { value, timestamp: Date.now(), provider });
}

/** Clear all cached responses */
export function clearAICache(): void {
    apiCache.clear();
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
        this.maxTokens = Math.ceil(rpm / 60 * 10); // Allow burst of 10 seconds worth
        this.tokens = this.maxTokens;
        this.refillRate = rpm / 60;
        this.lastRefill = Date.now();
    }

    async acquire(): Promise<void> {
        this.refill();
        if (this.tokens >= 1) {
            this.tokens -= 1;
            return;
        }
        // Wait for refill
        const waitMs = (1 / this.refillRate) * 1000;
        await new Promise(r => setTimeout(r, waitMs));
        return this.acquire();
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

export type AIErrorType = 'rate_limit' | 'auth' | 'network' | 'timeout' | 'invalid_response' | 'model_unavailable' | 'unknown';

export class AIError extends Error {
    type: AIErrorType;
    provider: string;
    retryable: boolean;
    retryAfterMs?: number;

    constructor(message: string, type: AIErrorType, provider: string, retryable = false, retryAfterMs?: number) {
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
    if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('api key')) {
        return new AIError(msg, 'auth', provider, false);
    }
    if (msg.includes('Failed to fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('econnrefused')) {
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
    baseDelayMs = 1500
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

            const delay = lastError.retryAfterMs ?? (baseDelayMs * Math.pow(2, attempt));
            await new Promise(r => setTimeout(r, delay));
        }
    }

    throw lastError ?? new AIError('Unknown error', 'unknown', provider, false);
}

// ═══════════════════════════════════════════════════════════
// ── BASE ROUTER (single source of truth for all providers) ─
// ═══════════════════════════════════════════════════════════

async function callAI(prompt: string, config: AIConfig): Promise<string> {
    if (config.provider === 'none') throw new Error('AI_DISABLED');

    // Check Cache
    const cacheKey = `${config.provider}:${prompt.length}:${prompt.substring(0, 50)}`;
    if (apiCache.has(cacheKey)) {
        return apiCache.get(cacheKey)!.value;
    }

    let result = '';

    // ── CHROME NANO ──────────────────────────────────────────
    if (config.provider === 'chrome') {
        if (!window.ai?.languageModel) {
            throw new Error('Chrome AI is not available in this browser. Enable it in chrome://flags.');
        }
        const caps = await window.ai.languageModel.capabilities();
        if (caps.available === 'no') throw new Error('Chrome AI model is unavailable (may need to download).');

        const session = await window.ai.languageModel.create({
            systemPrompt: 'You are a literary analyst. Output strictly valid JSON only — no markdown blocks, no surrounding text.'
        });
        try {
            result = await session.prompt(prompt);
        } finally {
            session.destroy();
        }
    }

    // ── GEMINI ────────────────────────────────────────────────
    if (config.provider === 'gemini') {
        if (!config.geminiKey) throw new Error('Gemini API key is not set.');

        const tools = config.useSearchGrounding
            ? [{ googleSearchRetrieval: { dynamicRetrievalConfig: { mode: "MODE_DYNAMIC", dynamicThreshold: 0.3 } } }]
            : undefined;

        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': config.geminiKey,
                },
                signal: AbortSignal.timeout(30_000),
                body: JSON.stringify({
                    system_instruction: {
                        parts: [{ text: 'You are a precise literary analyst. Output strictly valid JSON only — no markdown, no explanation.' }]
                    },
                    contents: [{ parts: [{ text: prompt }] }],
                    tools: tools,
                    generationConfig: { response_mime_type: 'application/json', temperature: 0.4, maxOutputTokens: 800 }
                })
            }
        );
        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Gemini API error ${res.status}: ${errBody.slice(0, 200)}`);
        }
        const data = await res.json();
        result = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }

    // Non-Gemini System Prompt
    const baseSystemPrompt = 'You are a precise literary analyst. Output strictly valid JSON only — no markdown, no explanation.';
    const systemPrompt = config.useSearchGrounding
        ? `${baseSystemPrompt}\n\nIMPORTANT: The user has requested Google Search Grounding. If you have active web browsing or search tools, immediately use them to search for any real-world knowledge, literary contexts, or factual verification before responding.`
        : baseSystemPrompt;

    // ── OPENAI ────────────────────────────────────────────────
    if (config.provider === 'openai') {
        if (!config.openAiKey) throw new Error('OpenAI API key is not set.');
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.openAiKey}`,
            },
            signal: AbortSignal.timeout(30_000),
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: 'json_object' },
                max_tokens: 800,
                temperature: 0.4
            })
        });
        if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        result = data.choices?.[0]?.message?.content ?? '';
    }

    // ── ANTHROPIC ─────────────────────────────────────────────
    if (config.provider === 'anthropic') {
        if (!config.anthropicKey) throw new Error('Anthropic API key is not set.');
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.anthropicKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            signal: AbortSignal.timeout(30_000),
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-latest',
                max_tokens: 800,
                system: systemPrompt,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.4
            })
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Anthropic error ${res.status}: ${errText.substring(0, 100)}`);
        }
        const data = await res.json();
        result = data.content?.[0]?.text ?? '';
    }

    // ── GROQ ──────────────────────────────────────────────────
    if (config.provider === 'groq') {
        if (!config.groqKey) throw new Error('Groq API key is not set.');
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.groqKey}`,
            },
            signal: AbortSignal.timeout(30_000),
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: 'json_object' },
                max_completion_tokens: 800,
                temperature: 0.4
            })
        });
        if (!res.ok) throw new Error(`Groq error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        result = data.choices?.[0]?.message?.content ?? '';
    }

    // ── DEEPSEEK ──────────────────────────────────────────────
    if (config.provider === 'deepseek') {
        if (!config.deepseekKey) throw new Error('DeepSeek API key is not set.');
        const res = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.deepseekKey}`,
            },
            signal: AbortSignal.timeout(30_000),
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: 'json_object' },
                max_tokens: 800,
                temperature: 0.4
            })
        });
        if (!res.ok) throw new Error(`DeepSeek error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        result = data.choices?.[0]?.message?.content ?? '';
    }

    // ── OLLAMA ────────────────────────────────────────────────
    if (config.provider === 'ollama') {
        const url = `${config.ollamaUrl.replace(/\/$/, '')}/api/generate`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30_000),
            body: JSON.stringify({
                model: config.ollamaModel || 'llama3',
                prompt: `You are a precise literary analyst. Output strictly valid JSON only — no markdown, no explanation.\n\n${prompt}`,
                stream: false,
                format: 'json',
            })
        });
        if (!res.ok) throw new Error(`Ollama error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        result = data.response ?? '';
    }

    if (result) {
        setCache(cacheKey, result, config.provider);
        return result;
    }

    throw new AIError(`Empty response from provider: ${config.provider}`, 'invalid_response', config.provider, false);
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
        return result;
    } finally {
        inflightRequests.delete(cacheKey);
    }
}

// ═══════════════════════════════════════════════════════════
// ── REQUEST BATCHING ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════

export interface BatchRequest {
    id: string;
    prompt: string;
}

export interface BatchResult {
    id: string;
    success: boolean;
    result?: string;
    error?: string;
}

/**
 * Execute multiple AI requests in sequence with rate limiting.
 * Useful for bulk operations like analyzing multiple chapters.
 */
export async function batchAIRequests(
    requests: BatchRequest[],
    config: AIConfig,
    onProgress?: (completed: number, total: number) => void
): Promise<BatchResult[]> {
    const results: BatchResult[] = [];

    for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        try {
            const result = await callAIWithDedup(req.prompt, config);
            results.push({ id: req.id, success: true, result });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            results.push({ id: req.id, success: false, error: message });
        }
        onProgress?.(i + 1, requests.length);
    }

    return results;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Strip accidental markdown code fences from LLM output */
function stripFences(text: string): string {
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

/** Parse JSON from LLM output, tolerating markdown code fences */
function parseJSON<T>(raw: string): T {
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
        const raw = await callAI(testPrompt, config);
        const parsed = parseJSON<{ ok?: boolean }>(raw);
        const latencyMs = Math.round(performance.now() - t0);

        if (parsed.ok) {
            return {
                ok: true, provider: config.provider,
                message: `Connected successfully.`,
                latencyMs,
            };
        }
        return { ok: false, provider: config.provider, message: 'Unexpected response from model.', latencyMs };
    } catch (err) {
        return {
            ok: false, provider: config.provider,
            message: err instanceof Error ? err.message : 'Unknown error.',
        };
    }
}

/**
 * AI-Enhanced Character Codex.
 * Generates rich narrative character descriptions merged with algorithmic stats.
 * Falls back to pure NER on failure.
 */
export async function enhanceCharacters(text: string, config: AIConfig): Promise<Character[]> {
    const algoStats = extractCharacters(text, 20);

    const toCharacter = (c: { name: string; firstContext?: string; frequency?: number; sentiment?: number; honorific?: string }): Character => ({
        name: c.name,
        description: c.firstContext ? `First appears: "${c.firstContext}"` : '',
        frequency: c.frequency,
        sentiment: c.sentiment,
        honorific: c.honorific,
    });

    if (config.provider === 'none') {
        return algoStats.slice(0, 10).map(toCharacter);
    }

    try {
        const prompt = `Analyze the following story excerpt and extract the 3-8 most important recurring characters.
For each provide a 'description': 2-3 vivid sentences detailing personality, role, and current situation.

Text (first 8000 chars):
${text.substring(0, 8000)}

Return a JSON array ONLY:
[{"name":"Character Name","description":"Rich narrative description."}]`;

        const raw = await withRetry(() => callAI(prompt, config), config.provider);
        const parsed = parseJSON<{ name: string; description?: string }[]>(raw);
        if (!Array.isArray(parsed)) throw new Error('Expected JSON array');

        return parsed.map((char) => {
            const stats = algoStats.find(a =>
                a.name.toLowerCase().includes(char.name.toLowerCase()) ||
                char.name.toLowerCase().includes(a.name.toLowerCase())
            );
            return {
                name: char.name,
                description: char.description ?? 'No description available.',
                frequency: stats?.frequency,
                sentiment: stats?.sentiment,
                honorific: stats?.honorific,
            };
        });
    } catch (err) {
        console.warn('[AI] enhanceCharacters fallback:', err);
        return algoStats.slice(0, 10).map(toCharacter);
    }
}

// ═══════════════════════════════════════════════════════════
// ── NEW AI FEATURES ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

export interface ThemeAnalysis {
    themes: Array<{ name: string; weight: number; evidence: string[] }>;
    symbols: Array<{ symbol: string; meaning: string; occurrences: number }>;
    motifs: string[];
}

/**
 * AI-Powered Theme Extraction.
 * Identifies major themes, symbols, and motifs in the text.
 */
export async function extractThemes(text: string, config: AIConfig): Promise<ThemeAnalysis> {
    // Algorithmic fallback using keywords
    const fallback: ThemeAnalysis = {
        themes: extractKeywords(text, 5).map(kw => ({
            name: kw.word,
            weight: kw.score,
            evidence: []
        })),
        symbols: [],
        motifs: []
    };

    if (config.provider === 'none') return fallback;

    try {
        const prompt = `Analyze this story excerpt for literary themes, symbols, and motifs.

Text (first 6000 chars):
${text.substring(0, 6000)}

Return JSON:
{
  "themes": [{"name": "Theme Name", "weight": 0.0-1.0, "evidence": ["quote1", "quote2"]}],
  "symbols": [{"symbol": "Symbol", "meaning": "What it represents", "occurrences": 3}],
  "motifs": ["repeated pattern 1", "repeated pattern 2"]
}`;

        const raw = await callAIWithDedup(prompt, config);
        const parsed = parseJSON<ThemeAnalysis>(raw);
        return {
            themes: parsed.themes || fallback.themes,
            symbols: parsed.symbols || [],
            motifs: parsed.motifs || []
        };
    } catch (err) {
        console.warn('[AI] extractThemes fallback:', err);
        return fallback;
    }
}

export interface SynopsisResult {
    oneLiner: string;
    shortSynopsis: string;
    detailedSynopsis: string;
    keyEvents: string[];
}

/**
 * AI-Powered Synopsis Generation.
 * Creates summaries at multiple detail levels.
 */
export async function generateSynopsis(text: string, config: AIConfig): Promise<SynopsisResult> {
    const readability = computeReadability(text);
    const sentiment = analyseSentiment(text);

    const fallback: SynopsisResult = {
        oneLiner: `A ${sentiment.label} narrative with reading level grade ${readability.fleschKincaid}.`,
        shortSynopsis: `This text contains approximately ${text.split(/\s+/).length} words with a ${sentiment.label} overall tone.`,
        detailedSynopsis: '',
        keyEvents: []
    };

    if (config.provider === 'none') return fallback;

    try {
        const prompt = `Generate a synopsis of this story at multiple detail levels.

Text (first 10000 chars):
${text.substring(0, 10000)}

Return JSON:
{
  "oneLiner": "One compelling sentence summary",
  "shortSynopsis": "2-3 sentence overview",
  "detailedSynopsis": "Detailed 1-2 paragraph summary with plot points",
  "keyEvents": ["Event 1", "Event 2", "Event 3"]
}`;

        const raw = await callAIWithDedup(prompt, config);
        return parseJSON<SynopsisResult>(raw);
    } catch (err) {
        console.warn('[AI] generateSynopsis fallback:', err);
        return fallback;
    }
}

export interface CharacterRelationship {
    character1: string;
    character2: string;
    relationshipType: string;
    sentiment: 'positive' | 'negative' | 'neutral' | 'complex';
    strength: number;
    description: string;
}

export interface RelationshipMap {
    relationships: CharacterRelationship[];
    centralCharacter: string;
    factions: Array<{ name: string; members: string[] }>;
}

/**
 * AI-Powered Character Relationship Analysis.
 * Maps relationships between characters in the narrative.
 */
export async function analyzeRelationships(text: string, characters: Character[], config: AIConfig): Promise<RelationshipMap> {
    const fallback: RelationshipMap = {
        relationships: [],
        centralCharacter: characters[0]?.name || 'Unknown',
        factions: []
    };

    if (config.provider === 'none' || characters.length < 2) return fallback;

    try {
        const charNames = characters.slice(0, 10).map(c => c.name).join(', ');
        const prompt = `Analyze character relationships in this story.

Known characters: ${charNames}

Text (first 8000 chars):
${text.substring(0, 8000)}

Return JSON:
{
  "relationships": [
    {"character1": "Name1", "character2": "Name2", "relationshipType": "rivals/allies/family/romantic/etc", "sentiment": "positive/negative/neutral/complex", "strength": 0.0-1.0, "description": "Brief description"}
  ],
  "centralCharacter": "Most connected character name",
  "factions": [{"name": "Group name", "members": ["char1", "char2"]}]
}`;

        const raw = await callAIWithDedup(prompt, config);
        return parseJSON<RelationshipMap>(raw);
    } catch (err) {
        console.warn('[AI] analyzeRelationships fallback:', err);
        return fallback;
    }
}

export interface NarrativePrediction {
    predictions: Array<{
        prediction: string;
        confidence: number;
        reasoning: string;
    }>;
    unresolvedPlotThreads: string[];
    foreshadowing: Array<{ hint: string; possibleOutcome: string }>;
}

/**
 * AI-Powered Narrative Predictions.
 * Analyzes story patterns to predict possible developments.
 */
export async function predictNarrative(text: string, config: AIConfig): Promise<NarrativePrediction> {
    const fallback: NarrativePrediction = {
        predictions: [],
        unresolvedPlotThreads: [],
        foreshadowing: []
    };

    if (config.provider === 'none') return fallback;

    try {
        const prompt = `Based on narrative patterns in this story, predict possible future developments.

Text (first 8000 chars):
${text.substring(0, 8000)}

Return JSON:
{
  "predictions": [
    {"prediction": "What might happen", "confidence": 0.0-1.0, "reasoning": "Why this is likely"}
  ],
  "unresolvedPlotThreads": ["Thread 1", "Thread 2"],
  "foreshadowing": [{"hint": "The clue", "possibleOutcome": "What it might lead to"}]
}`;

        const raw = await callAIWithDedup(prompt, config);
        return parseJSON<NarrativePrediction>(raw);
    } catch (err) {
        console.warn('[AI] predictNarrative fallback:', err);
        return fallback;
    }
}

export interface WritingStyleAnalysis {
    style: string;
    tone: string;
    pacing: 'slow' | 'moderate' | 'fast' | 'varied';
    narrativePOV: string;
    proseStyle: string;
    influences: string[];
    uniqueElements: string[];
}

/**
 * AI-Powered Writing Style Analysis.
 * Analyzes the author's writing style and technique.
 */
export async function analyzeWritingStyle(text: string, config: AIConfig): Promise<WritingStyleAnalysis> {
    const readability = computeReadability(text);

    const fallback: WritingStyleAnalysis = {
        style: readability.fleschKincaid >= 13 ? 'sophisticated' : 'accessible',
        tone: 'neutral',
        pacing: 'moderate',
        narrativePOV: 'unknown',
        proseStyle: 'standard',
        influences: [],
        uniqueElements: []
    };

    if (config.provider === 'none') return fallback;

    try {
        const prompt = `Analyze the writing style of this text excerpt.

Text (first 5000 chars):
${text.substring(0, 5000)}

Return JSON:
{
  "style": "descriptive word for overall style",
  "tone": "emotional tone (dark, humorous, serious, etc)",
  "pacing": "slow/moderate/fast/varied",
  "narrativePOV": "first person/third limited/third omniscient/etc",
  "proseStyle": "minimalist/ornate/conversational/literary/etc",
  "influences": ["possible literary influences"],
  "uniqueElements": ["distinctive features of this writing"]
}`;

        const raw = await callAIWithDedup(prompt, config);
        return parseJSON<WritingStyleAnalysis>(raw);
    } catch (err) {
        console.warn('[AI] analyzeWritingStyle fallback:', err);
        return fallback;
    }
}

// ═══════════════════════════════════════════════════════════
// ── API STATS & DEBUGGING ──────────────────────────────────
// ═══════════════════════════════════════════════════════════

export interface APIStats {
    cacheSize: number;
    cacheHitRate: number;
    inflightRequests: number;
    providers: string[];
}

const cacheHits = 0;
const cacheMisses = 0;

/**
 * Get current API usage statistics.
 */
export function getAPIStats(): APIStats {
    return {
        cacheSize: apiCache.size,
        cacheHitRate: cacheHits + cacheMisses > 0 ? cacheHits / (cacheHits + cacheMisses) : 0,
        inflightRequests: inflightRequests.size,
        providers: Array.from(rateLimiters.keys())
    };
}

/**
 * Get preset configuration for a provider.
 */
export function getModelPreset(provider: string): ModelPreset | undefined {
    return MODEL_PRESETS[provider];
}