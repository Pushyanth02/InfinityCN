/**
 * providers/ollama.ts — Ollama Provider
 *
 * Handles local Ollama's /api/generate endpoint with stream=true/false toggle.
 * Supports custom model names and localhost-only HTTP access.
 */

import type { AIConfig, AIResponse, GenerateOptions } from '../types';
import { MODEL_PRESETS } from '../presets';
import { BaseAIProvider, API_PROXY_URL } from './base';
import { assertSecureEndpoint, normalizeApiKey } from '../../security/aiSecurity';

export class OllamaProvider extends BaseAIProvider {
    readonly name = 'ollama' as const;
    readonly supportsStreaming = true;
    override readonly costPer1KTokens = 0; // Local inference — free

    async generate(
        prompt: string,
        config: AIConfig,
        options?: GenerateOptions,
    ): Promise<AIResponse> {
        const preset = MODEL_PRESETS.ollama;
        const model = options?.model ?? (normalizeApiKey(config.ollamaModel) || preset.model);
        const systemPrompt = this.getSystemPrompt(options);
        const useJSON = options?.useJSON ?? !options?.rawTextMode;
        const timeoutMs = this.getTimeoutMs(options);

        if (!config.ollamaUrl && !API_PROXY_URL) {
            throw new Error('Ollama URL is not configured.');
        }

        const ollamaUrl = config.ollamaUrl?.replace(/\/$/, '') ?? '';
        if (!API_PROXY_URL) {
            assertSecureEndpoint(ollamaUrl, 'Ollama URL', { allowHttpLocalhost: true });
        }

        const body = {
            model,
            prompt: `${systemPrompt}\n\n${prompt}`,
            stream: false,
            ...(useJSON ? { format: 'json' } : {}),
        };

        const res = API_PROXY_URL
            ? await this.proxyFetch('ollama', body, timeoutMs)
            : await fetch(`${ollamaUrl}/api/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  signal: AbortSignal.timeout(timeoutMs),
                  body: JSON.stringify(body),
              });

        if (!res.ok) await this.handleHttpError(res, 'ollama');
        const data = await res.json();
        const text = data.response ?? '';

        return this.buildResponse(text, model);
    }

    async *stream(
        prompt: string,
        config: AIConfig,
        options?: GenerateOptions,
    ): AsyncGenerator<string> {
        const preset = MODEL_PRESETS.ollama;
        const model = options?.model ?? (normalizeApiKey(config.ollamaModel) || preset.model);
        const systemPrompt = this.getSystemPrompt(options);
        const timeoutMs = this.getTimeoutMs(options);

        if (!config.ollamaUrl && !API_PROXY_URL) {
            throw new Error('Ollama URL is not configured.');
        }

        const ollamaUrl = config.ollamaUrl?.replace(/\/$/, '') ?? '';
        if (!API_PROXY_URL) {
            assertSecureEndpoint(ollamaUrl, 'Ollama URL', { allowHttpLocalhost: true });
        }

        const body = {
            model,
            prompt: `${systemPrompt}\n\n${prompt}`,
            stream: true,
        };

        const res = API_PROXY_URL
            ? await this.proxyFetch('ollama', body, timeoutMs)
            : await fetch(`${ollamaUrl}/api/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  signal: AbortSignal.timeout(timeoutMs),
                  body: JSON.stringify(body),
              });

        if (!res.ok) await this.handleHttpError(res, 'ollama');
        if (!res.body) throw new Error('No response body from Ollama');

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
            if (!config.ollamaUrl && !API_PROXY_URL) return false;
            const ollamaUrl = config.ollamaUrl?.replace(/\/$/, '') ?? '';
            const res = await fetch(`${ollamaUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000),
            });
            return res.ok;
        } catch {
            return false;
        }
    }
}
