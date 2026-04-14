/**
 * providers/openai.ts — OpenAI Provider
 *
 * Handles OpenAI chat completions API. Also serves as the base pattern for
 * Groq, DeepSeek, and NVIDIA NIM which share the same API shape.
 */

import type { AIConfig, AIProviderName, AIResponse, GenerateOptions } from '../types';
import { MODEL_PRESETS } from '../presets';
import { BaseAIProvider, API_PROXY_URL } from './base';
import { assertSecureEndpoint } from '../../security/aiSecurity';

// ─── OPENAI-COMPATIBLE ENDPOINT CONFIG ────────────────────────────────────────

export interface OpenAICompatibleEndpoint {
    url: string;
    keyFields: (keyof AIConfig)[];
    maxTokensField: string;
    providerSlug: string;
    extraHeaders?: Record<string, string>;
}

export const OPENAI_ENDPOINTS: Record<string, OpenAICompatibleEndpoint> = {
    openai: {
        url: 'https://api.openai.com/v1/chat/completions',
        keyFields: ['openAiKey'],
        maxTokensField: 'max_tokens',
        providerSlug: 'openai',
    },
    groq: {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        keyFields: ['groqKey'],
        maxTokensField: 'max_completion_tokens',
        providerSlug: 'groq',
    },
    deepseek: {
        url: 'https://api.deepseek.com/chat/completions',
        keyFields: ['deepseekKey'],
        maxTokensField: 'max_tokens',
        providerSlug: 'deepseek',
    },
};

// ─── OPENAI-COMPATIBLE BASE ───────────────────────────────────────────────────

/**
 * Base class for all OpenAI-compatible providers.
 * Override `name`, `endpoint`, and optionally `costPer1KTokens`.
 */
export class OpenAICompatibleProvider extends BaseAIProvider {
    readonly name: AIProviderName;
    readonly supportsStreaming = true;
    override readonly costPer1KTokens?: number;
    protected readonly endpoint: OpenAICompatibleEndpoint;

    constructor(
        name: AIProviderName,
        endpoint: OpenAICompatibleEndpoint,
        costPer1KTokens?: number,
    ) {
        super();
        this.name = name;
        this.endpoint = endpoint;
        this.costPer1KTokens = costPer1KTokens;
    }

    async generate(
        prompt: string,
        config: AIConfig,
        options?: GenerateOptions,
    ): Promise<AIResponse> {
        const preset = MODEL_PRESETS[this.name];
        const model = options?.model ?? preset?.model ?? 'gpt-4o-mini';
        const systemPrompt = this.getSystemPrompt(options);
        const maxTokens = options?.maxTokens ?? preset?.maxTokens ?? 4096;
        const temperature = options?.temperature ?? preset?.temperature ?? 0.4;
        const useJSON = options?.useJSON ?? !options?.rawTextMode;
        const timeoutMs = this.getTimeoutMs(options);

        const body = {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ],
            ...(useJSON ? { response_format: { type: 'json_object' } } : {}),
            [this.endpoint.maxTokensField]: maxTokens,
            temperature,
        };

        const res = API_PROXY_URL
            ? await this.proxyFetch(this.endpoint.providerSlug, body, timeoutMs)
            : await this.fetchWithKeyRotation(
                  this.name,
                  this.getApiKeyCandidates(config, this.endpoint.keyFields),
                  apiKey => {
                      assertSecureEndpoint(
                          this.endpoint.url,
                          `${this.capitalize(this.name)} endpoint`,
                      );
                      return fetch(this.endpoint.url, {
                          method: 'POST',
                          headers: {
                              'Content-Type': 'application/json',
                              Authorization: `Bearer ${apiKey}`,
                              ...this.endpoint.extraHeaders,
                          },
                          signal: AbortSignal.timeout(timeoutMs),
                          body: JSON.stringify(body),
                      });
                  },
              );

        if (!res.ok) await this.handleHttpError(res, this.name);
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? '';

        return this.buildResponse(text, model);
    }

    async *stream(
        prompt: string,
        config: AIConfig,
        options?: GenerateOptions,
    ): AsyncGenerator<string> {
        const preset = MODEL_PRESETS[this.name];
        const model = options?.model ?? preset?.model ?? 'gpt-4o-mini';
        const systemPrompt = this.getSystemPrompt(options);
        const maxTokens = options?.maxTokens ?? preset?.maxTokens ?? 4096;
        const temperature = options?.temperature ?? preset?.temperature ?? 0.4;
        const timeoutMs = this.getTimeoutMs(options);

        const body = {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ],
            stream: true,
            [this.endpoint.maxTokensField]: maxTokens,
            temperature,
        };

        const url = API_PROXY_URL
            ? `${API_PROXY_URL}/api/ai/${this.endpoint.providerSlug}`
            : this.endpoint.url;

        const res = API_PROXY_URL
            ? await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                  signal: AbortSignal.timeout(timeoutMs),
              })
            : await this.fetchWithKeyRotation(
                  this.name,
                  this.getApiKeyCandidates(config, this.endpoint.keyFields),
                  apiKey => {
                      assertSecureEndpoint(this.endpoint.url, `${this.name} endpoint`);
                      return fetch(this.endpoint.url, {
                          method: 'POST',
                          headers: {
                              'Content-Type': 'application/json',
                              Authorization: `Bearer ${apiKey}`,
                              ...this.endpoint.extraHeaders,
                          },
                          body: JSON.stringify(body),
                          signal: AbortSignal.timeout(timeoutMs),
                      });
                  },
              );

        if (!res.ok) await this.handleHttpError(res, this.name);
        if (!res.body) throw new Error('No response body');

        yield* this.parseSSEStream(res.body.getReader(), data => {
            const d = data as { choices?: Array<{ delta?: { content?: string } }> };
            return d.choices?.[0]?.delta?.content;
        });
    }
}

// ─── CONCRETE OPENAI PROVIDER ─────────────────────────────────────────────────

export class OpenAIProvider extends OpenAICompatibleProvider {
    constructor() {
        super('openai', OPENAI_ENDPOINTS.openai, 0.15);
    }
}

// ─── GROQ PROVIDER ────────────────────────────────────────────────────────────

export class GroqProvider extends OpenAICompatibleProvider {
    constructor() {
        super('groq', OPENAI_ENDPOINTS.groq, 0.05);
    }
}

// ─── DEEPSEEK PROVIDER ────────────────────────────────────────────────────────

export class DeepSeekProvider extends OpenAICompatibleProvider {
    constructor() {
        super('deepseek', OPENAI_ENDPOINTS.deepseek, 0.07);
    }
}
