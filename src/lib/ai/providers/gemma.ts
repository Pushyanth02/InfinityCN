/**
 * providers/gemma.ts — Gemma Provider
 *
 * Gemma models can be served via Ollama (local) or through any
 * OpenAI-compatible endpoint. This provider defaults to Ollama-based
 * inference using the gemma model family.
 */

import type { AIConfig, AIResponse, GenerateOptions } from '../types';
import { MODEL_PRESETS } from '../presets';
import { BaseAIProvider, API_PROXY_URL } from './base';
import { assertSecureEndpoint } from '../../security/aiSecurity';

export class GemmaProvider extends BaseAIProvider {
    readonly name = 'gemma' as const;
    readonly supportsStreaming = true;
    override readonly costPer1KTokens = 0; // Local inference via Ollama — free

    async generate(
        prompt: string,
        config: AIConfig,
        options?: GenerateOptions,
    ): Promise<AIResponse> {
        const preset = MODEL_PRESETS.gemma;
        const model = options?.model ?? preset?.model ?? 'gemma2:27b';
        const systemPrompt = this.getSystemPrompt(options);
        const useJSON = options?.useJSON ?? !options?.rawTextMode;
        const timeoutMs = this.getTimeoutMs(options);

        // Gemma runs through Ollama's local endpoint
        const ollamaUrl = this.getOllamaUrl(config);

        const body = {
            model,
            prompt: `${systemPrompt}\n\n${prompt}`,
            stream: false,
            ...(useJSON ? { format: 'json' } : {}),
        };

        const res = API_PROXY_URL
            ? await this.proxyFetch('gemma', body, timeoutMs)
            : await fetch(`${ollamaUrl}/api/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  signal: AbortSignal.timeout(timeoutMs),
                  body: JSON.stringify(body),
              });

        if (!res.ok) await this.handleHttpError(res, 'gemma');
        const data = await res.json();
        const text = data.response ?? '';

        return this.buildResponse(text, model);
    }

    async *stream(
        prompt: string,
        config: AIConfig,
        options?: GenerateOptions,
    ): AsyncGenerator<string> {
        const preset = MODEL_PRESETS.gemma;
        const model = options?.model ?? preset?.model ?? 'gemma2:27b';
        const systemPrompt = this.getSystemPrompt(options);
        const timeoutMs = this.getTimeoutMs(options);

        const ollamaUrl = this.getOllamaUrl(config);

        const body = {
            model,
            prompt: `${systemPrompt}\n\n${prompt}`,
            stream: true,
        };

        const res = API_PROXY_URL
            ? await this.proxyFetch('gemma', body, timeoutMs)
            : await fetch(`${ollamaUrl}/api/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  signal: AbortSignal.timeout(timeoutMs),
                  body: JSON.stringify(body),
              });

        if (!res.ok) await this.handleHttpError(res, 'gemma');
        if (!res.body) throw new Error('No response body from Gemma/Ollama');

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
                    if (data.response) yield data.response;
                } catch {
                    // Ignore parse errors on partial chunks
                }
            }
        }
    }

    override async healthCheck(config: AIConfig): Promise<boolean> {
        try {
            const ollamaUrl = this.getOllamaUrl(config);
            const res = await fetch(`${ollamaUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) return false;
            const data = await res.json();
            // Check if any gemma model is available
            const models = data.models as Array<{ name: string }> | undefined;
            return models?.some(m => m.name.toLowerCase().includes('gemma')) ?? false;
        } catch {
            return false;
        }
    }

    private getOllamaUrl(config: AIConfig): string {
        if (!config.ollamaUrl && !API_PROXY_URL) {
            throw new Error('Gemma requires Ollama. Configure the Ollama URL in AI Settings.');
        }
        const url = config.ollamaUrl?.replace(/\/$/, '') ?? '';
        if (!API_PROXY_URL) {
            assertSecureEndpoint(url, 'Ollama URL (Gemma)', { allowHttpLocalhost: true });
        }
        return url;
    }
}
