/**
 * providers/base.ts — Abstract AI Provider Base Class
 *
 * Shared infrastructure for all AI providers: proxy routing, HTTP error
 * handling, SSE stream parsing, key rotation, and timeout management.
 * Concrete providers extend this class and implement the abstract methods.
 */

import type {
    AIConfig,
    AIProviderName,
    AIResponse,
    GenerateOptions,
    AIProviderInstance,
} from '../types';
import { AIError } from '../errors';
import { AI_JSON_TIMEOUT_MS, AI_RAWTEXT_TIMEOUT_MS, AI_MAX_RETRY_DELAY_MS } from '../../constants';
import { assertSecureEndpoint, normalizeApiKey } from '../../security/aiSecurity';
import { validateKey } from '../../security/keyManager';

// ─── PROXY SUPPORT ────────────────────────────────────────────────────────────

export const API_PROXY_URL = import.meta.env.VITE_API_PROXY_URL as string | undefined;

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────

export const DEFAULT_SYSTEM_PROMPT =
    'You are a precise literary analyst. Output strictly valid JSON only — no markdown, no explanation.';

// ─── ABSTRACT BASE ────────────────────────────────────────────────────────────

export abstract class BaseAIProvider implements AIProviderInstance {
    abstract readonly name: AIProviderName;
    abstract readonly supportsStreaming: boolean;
    readonly costPer1KTokens?: number;

    abstract generate(
        prompt: string,
        config: AIConfig,
        options?: GenerateOptions,
    ): Promise<AIResponse>;
    abstract stream(
        prompt: string,
        config: AIConfig,
        options?: GenerateOptions,
    ): AsyncGenerator<string>;

    async healthCheck(config: AIConfig): Promise<boolean> {
        try {
            const response = await this.generate(
                'Reply with exactly this JSON: {"ok":true}',
                config,
                { maxTokens: 32, temperature: 0, useJSON: true },
            );
            return response.text.includes('"ok"');
        } catch {
            return false;
        }
    }

    // ─── SHARED UTILITIES ─────────────────────────────────────────────────────

    /** Get timeout based on call type. Raw-text mode gets longer timeout. */
    protected getTimeoutMs(options?: GenerateOptions): number {
        if (options?.timeoutMs) return options.timeoutMs;
        return options?.rawTextMode ? AI_RAWTEXT_TIMEOUT_MS : AI_JSON_TIMEOUT_MS;
    }

    /** Get system prompt from options or use default. */
    protected getSystemPrompt(options?: GenerateOptions): string {
        return options?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    }

    /** Build an AbortSignal with timeout. */
    protected buildSignal(options?: GenerateOptions): AbortSignal {
        if (options?.signal) return options.signal;
        return AbortSignal.timeout(this.getTimeoutMs(options));
    }

    /** Route requests through proxy if configured. */
    protected async proxyFetch(
        providerSlug: string,
        body: Record<string, unknown>,
        timeoutMs: number,
    ): Promise<Response> {
        if (!API_PROXY_URL) {
            throw new Error('API proxy URL is not configured (VITE_API_PROXY_URL not set).');
        }
        assertSecureEndpoint(API_PROXY_URL, 'AI proxy URL', { allowHttpLocalhost: true });

        return fetch(`${API_PROXY_URL}/api/ai/${providerSlug}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
        });
    }

    /** Centralised HTTP-error handler. Parses Retry-After on 429. */
    protected async handleHttpError(res: Response, provider: string): Promise<never> {
        if (res.status === 429) {
            const retryAfter = res.headers.get('Retry-After');
            const waitMs = retryAfter
                ? Math.min(parseFloat(retryAfter) * 1000, AI_MAX_RETRY_DELAY_MS)
                : 5000;
            throw new AIError(
                `${provider} rate limit exceeded`,
                'rate_limit',
                provider,
                true,
                waitMs,
            );
        }
        const body = await res.text().catch(() => res.statusText);
        throw new AIError(
            `${provider} error ${res.status}: ${body.slice(0, 200)}`,
            res.status >= 500 ? 'model_unavailable' : 'unknown',
            provider,
            res.status >= 500,
        );
    }

    /** Get API key candidates for rotation (provider-specific key → universal → cross-field). */
    protected getApiKeyCandidates(config: AIConfig, keyFields: (keyof AIConfig)[]): string[] {
        const candidates: string[] = [];

        const push = (value?: string) => {
            const normalized = normalizeApiKey(value);
            if (!normalized || !validateKey(normalized) || candidates.includes(normalized)) return;
            candidates.push(normalized);
        };

        for (const field of keyFields) {
            push(config[field] as string);
        }

        // Universal key fallback
        push(config.universalApiKey);

        // Cross-field fallback
        push(config.openAiKey);
        push(config.geminiKey);
        push(config.anthropicKey);
        push(config.groqKey);
        push(config.deepseekKey);

        return candidates;
    }

    /** Fetch with key rotation — tries each candidate key until one succeeds. */
    protected async fetchWithKeyRotation(
        provider: string,
        keyCandidates: string[],
        request: (apiKey: string) => Promise<Response>,
    ): Promise<Response> {
        if (keyCandidates.length === 0) {
            throw new Error(`${this.capitalize(provider)} API key is not set.`);
        }

        for (let i = 0; i < keyCandidates.length; i++) {
            const response = await request(keyCandidates[i]);

            if (response.ok) {
                return response;
            }

            if (this.isAuthStatus(response.status) && i < keyCandidates.length - 1) {
                continue;
            }

            await this.handleHttpError(response, provider);
        }

        throw new Error(`${this.capitalize(provider)} API key is invalid.`);
    }

    /** Parse SSE stream. Yields deltas extracted by the provider-specific extractor. */
    protected async *parseSSEStream(
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

    /** Build an AIResponse from raw text. */
    protected buildResponse(text: string, model: string): AIResponse {
        return { text, model, provider: this.name };
    }

    protected capitalize(s: string): string {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    private isAuthStatus(status: number): boolean {
        return status === 401 || status === 403;
    }
}
