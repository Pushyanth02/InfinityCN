/**
 * providers/gemini.ts — Google Gemini Provider
 *
 * Handles the Gemini generateContent and streamGenerateContent endpoints.
 * Supports search grounding when configured.
 */

import type { AIConfig, AIResponse, GenerateOptions } from '../types';
import { MODEL_PRESETS } from '../presets';
import { BaseAIProvider, API_PROXY_URL } from './base';
import { assertSecureEndpoint } from '../../security/aiSecurity';

export class GeminiProvider extends BaseAIProvider {
    readonly name = 'gemini' as const;
    readonly supportsStreaming = true;
    override readonly costPer1KTokens = 0.1;

    async generate(
        prompt: string,
        config: AIConfig,
        options?: GenerateOptions,
    ): Promise<AIResponse> {
        const preset = MODEL_PRESETS.gemini;
        const model = options?.model ?? preset.model;
        const systemPrompt = this.getSystemPrompt(options);
        const maxTokens = options?.maxTokens ?? preset.maxTokens;
        const temperature = options?.temperature ?? preset.temperature;
        const useJSON = options?.useJSON ?? !options?.rawTextMode;
        const timeoutMs = this.getTimeoutMs(options);

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        const body = {
            system_instruction: {
                parts: [{ text: systemPrompt }],
            },
            contents: [{ parts: [{ text: prompt }] }],
            tools: config.useSearchGrounding ? [{ google_search: {} }] : undefined,
            generationConfig: {
                ...(useJSON ? { response_mime_type: 'application/json' } : {}),
                temperature,
                maxOutputTokens: maxTokens,
            },
        };

        const res = API_PROXY_URL
            ? await this.proxyFetch('gemini', body, timeoutMs)
            : await this.fetchWithKeyRotation(
                  'gemini',
                  this.getApiKeyCandidates(config, ['geminiKey']),
                  apiKey => {
                      assertSecureEndpoint(endpoint, 'Gemini endpoint');
                      return fetch(endpoint, {
                          method: 'POST',
                          headers: {
                              'Content-Type': 'application/json',
                              'x-goog-api-key': apiKey,
                          },
                          signal: AbortSignal.timeout(timeoutMs),
                          body: JSON.stringify(body),
                      });
                  },
              );

        if (!res.ok) await this.handleHttpError(res, 'gemini');
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

        return this.buildResponse(text, model);
    }

    async *stream(
        prompt: string,
        config: AIConfig,
        options?: GenerateOptions,
    ): AsyncGenerator<string> {
        const preset = MODEL_PRESETS.gemini;
        const model = options?.model ?? preset.model;
        const systemPrompt = this.getSystemPrompt(options);
        const maxTokens = options?.maxTokens ?? preset.maxTokens;
        const temperature = options?.temperature ?? preset.temperature;
        const timeoutMs = this.getTimeoutMs(options);

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

        const body = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: prompt }] }],
            tools: config.useSearchGrounding ? [{ google_search: {} }] : undefined,
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
            },
        };

        const url = API_PROXY_URL ? `${API_PROXY_URL}/api/ai/gemini` : geminiUrl;

        const res = API_PROXY_URL
            ? await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                  signal: AbortSignal.timeout(timeoutMs),
              })
            : await this.fetchWithKeyRotation(
                  'gemini',
                  this.getApiKeyCandidates(config, ['geminiKey']),
                  apiKey => {
                      assertSecureEndpoint(geminiUrl, 'Gemini streaming endpoint');
                      return fetch(geminiUrl, {
                          method: 'POST',
                          headers: {
                              'Content-Type': 'application/json',
                              'x-goog-api-key': apiKey,
                          },
                          body: JSON.stringify(body),
                          signal: AbortSignal.timeout(timeoutMs),
                      });
                  },
              );

        if (!res.ok) await this.handleHttpError(res, 'gemini');
        if (!res.body) throw new Error('No response body');

        yield* this.parseSSEStream(res.body.getReader(), data => {
            const d = data as {
                candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            return d.candidates?.[0]?.content?.parts?.[0]?.text;
        });
    }
}
