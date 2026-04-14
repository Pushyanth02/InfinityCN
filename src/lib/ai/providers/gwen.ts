/**
 * providers/gwen.ts — Gwen Custom Adapter
 *
 * Stub provider for the Gwen custom AI endpoint. Implements the full
 * AIProviderInstance contract with a generic REST API shape.
 *
 * Expects:
 *   - config.gwenUrl  — base URL for the Gwen API
 *   - config.gwenKey  — bearer token for authentication
 *
 * API contract (assumed):
 *   POST {gwenUrl}/v1/generate
 *   Headers: Authorization: Bearer {gwenKey}
 *   Body: { prompt, system, max_tokens, temperature, stream }
 *   Response: { text, model, usage? }
 *   Stream: NDJSON with { text } chunks
 */

import type { AIConfig, AIResponse, GenerateOptions } from '../types';
import { MODEL_PRESETS } from '../presets';
import { BaseAIProvider, API_PROXY_URL } from './base';
import { assertSecureEndpoint, normalizeApiKey } from '../../security/aiSecurity';

export class GwenProvider extends BaseAIProvider {
    readonly name = 'gwen' as const;
    readonly supportsStreaming = true;
    override readonly costPer1KTokens = undefined; // Unknown — custom deployment

    async generate(
        prompt: string,
        config: AIConfig,
        options?: GenerateOptions,
    ): Promise<AIResponse> {
        const preset = MODEL_PRESETS.gwen;
        const model = options?.model ?? preset?.model ?? 'gwen-default';
        const systemPrompt = this.getSystemPrompt(options);
        const maxTokens = options?.maxTokens ?? preset?.maxTokens ?? 4096;
        const temperature = options?.temperature ?? preset?.temperature ?? 0.4;
        const timeoutMs = this.getTimeoutMs(options);

        const baseUrl = this.getGwenUrl(config);
        const apiKey = this.getGwenKey(config);
        const endpoint = `${baseUrl}/v1/generate`;

        const body = {
            prompt,
            system: systemPrompt,
            max_tokens: maxTokens,
            temperature,
            stream: false,
        };

        const res = API_PROXY_URL
            ? await this.proxyFetch('gwen', body, timeoutMs)
            : await fetch(endpoint, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                  },
                  signal: AbortSignal.timeout(timeoutMs),
                  body: JSON.stringify(body),
              });

        if (!res.ok) await this.handleHttpError(res, 'gwen');
        const data = await res.json();
        const text = data.text ?? data.response ?? data.content ?? '';

        return this.buildResponse(text, data.model ?? model);
    }

    async *stream(
        prompt: string,
        config: AIConfig,
        options?: GenerateOptions,
    ): AsyncGenerator<string> {
        const preset = MODEL_PRESETS.gwen;
        const model = options?.model ?? preset?.model ?? 'gwen-default';
        const systemPrompt = this.getSystemPrompt(options);
        const maxTokens = options?.maxTokens ?? preset?.maxTokens ?? 4096;
        const temperature = options?.temperature ?? preset?.temperature ?? 0.4;
        const timeoutMs = this.getTimeoutMs(options);

        const baseUrl = this.getGwenUrl(config);
        const apiKey = this.getGwenKey(config);
        const endpoint = `${baseUrl}/v1/generate`;

        const body = {
            prompt,
            system: systemPrompt,
            max_tokens: maxTokens,
            temperature,
            stream: true,
            model,
        };

        const res = API_PROXY_URL
            ? await this.proxyFetch('gwen', body, timeoutMs)
            : await fetch(endpoint, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                  },
                  signal: AbortSignal.timeout(timeoutMs),
                  body: JSON.stringify(body),
              });

        if (!res.ok) await this.handleHttpError(res, 'gwen');
        if (!res.body) throw new Error('No response body from Gwen');

        // Gwen uses NDJSON streaming (one JSON object per line)
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
                    const chunk = data.text ?? data.response ?? data.content ?? '';
                    if (chunk) yield chunk;
                } catch {
                    // Ignore parse errors on partial chunks
                }
            }
        }
    }

    override async healthCheck(config: AIConfig): Promise<boolean> {
        try {
            const baseUrl = this.getGwenUrl(config);
            const apiKey = this.getGwenKey(config);
            const res = await fetch(`${baseUrl}/v1/health`, {
                headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
                signal: AbortSignal.timeout(5000),
            });
            return res.ok;
        } catch {
            return false;
        }
    }

    private getGwenUrl(config: AIConfig): string {
        const url = config.gwenUrl?.replace(/\/$/, '') ?? '';
        if (!url && !API_PROXY_URL) {
            throw new Error('Gwen URL is not configured. Set gwenUrl in AI Settings.');
        }
        if (!API_PROXY_URL && url) {
            assertSecureEndpoint(url, 'Gwen endpoint', { allowHttpLocalhost: true });
        }
        return url;
    }

    private getGwenKey(config: AIConfig): string {
        return normalizeApiKey(config.gwenKey);
    }
}
