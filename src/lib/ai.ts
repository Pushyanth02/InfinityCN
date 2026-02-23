/**
 * ai.ts — InfinityCN Multi-Provider AI Engine (V12)
 *
 * Providers:
 *   • 'none'   → fast offline algorithms only (no API calls)
 *   • 'chrome' → window.ai.languageModel (Gemini Nano, in-browser)
 *   • 'gemini' → Google Generative Language REST API
 *   • 'ollama' → local Ollama server
 *
 * All public functions fall back gracefully to algorithms.ts on any failure.
 */

import {
    extractCharacters,
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

// ─── CHROME NANO GLOBAL TYPINGS ────────────────────────────────────────────────

declare global {
    interface Window {
        ai?: {
            languageModel: {
                capabilities: () => Promise<{ available: 'readily' | 'after-download' | 'no' }>;
                create: (options?: Record<string, unknown>) => Promise<{
                    prompt: (text: string) => Promise<string>;
                    destroy: () => void;
                }>;
            };
        };
    }
}

// ═══════════════════════════════════════════════════════════
// ── RETRY HELPER (transient errors: 429, 503, network) ─────
// ═══════════════════════════════════════════════════════════

async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 2000): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err: unknown) {
            const isRetryable = err instanceof Error &&
                (err.message.includes('429') || err.message.includes('503') || err.message.includes('Failed to fetch'));
            if (attempt < retries && isRetryable) {
                await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
                continue;
            }
            throw err;
        }
    }
    throw new Error('Unreachable');
}

// ═══════════════════════════════════════════════════════════
// ── BASE ROUTER (single source of truth for all providers) ─
// ═══════════════════════════════════════════════════════════

async function callAI(prompt: string, config: AIConfig): Promise<string> {
    if (config.provider === 'none') throw new Error('AI_DISABLED');

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
            return await session.prompt(prompt);
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
                    generationConfig: { response_mime_type: 'application/json', temperature: 0.4 }
                })
            }
        );
        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Gemini API error ${res.status}: ${errBody.slice(0, 200)}`);
        }
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
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
                temperature: 0.4
            })
        });
        if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content ?? '';
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
                max_tokens: 4000,
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
        return data.content?.[0]?.text ?? '';
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
                temperature: 0.4
            })
        });
        if (!res.ok) throw new Error(`Groq error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content ?? '';
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
                temperature: 0.4
            })
        });
        if (!res.ok) throw new Error(`DeepSeek error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content ?? '';
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
        return data.response ?? '';
    }

    throw new Error(`Unknown provider: ${config.provider}`);
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

Text (first 15000 chars):
${text.substring(0, 15000)}

Return a JSON array ONLY:
[{"name":"Character Name","description":"Rich narrative description."}]`;

        const raw = await withRetry(() => callAI(prompt, config));
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

