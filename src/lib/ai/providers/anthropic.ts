/**
 * providers/anthropic.ts — Anthropic Claude Provider
 *
 * Handles the Anthropic Messages API with content_block_delta streaming.
 * Includes the `anthropic-dangerous-direct-browser-access` header for
 * direct browser→API calls without a backend proxy.
 */

import type { AIConfig, AIResponse, GenerateOptions } from '../types';
import { MODEL_PRESETS } from '../presets';
import { BaseAIProvider, API_PROXY_URL } from './base';
import { assertSecureEndpoint } from '../../security/aiSecurity';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export class AnthropicProvider extends BaseAIProvider {
    readonly name = 'anthropic' as const;
    readonly supportsStreaming = true;
    override readonly costPer1KTokens = 3.0;

    async generate(
        prompt: string,
        config: AIConfig,
        options?: GenerateOptions,
    ): Promise<AIResponse> {
        const preset = MODEL_PRESETS.anthropic;
        const model = options?.model ?? preset.model;
        const systemPrompt = this.getSystemPrompt(options);
        const maxTokens = options?.maxTokens ?? preset.maxTokens;
        const temperature = options?.temperature ?? preset.temperature;
        const timeoutMs = this.getTimeoutMs(options);

        const body = {
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content: prompt }],
            temperature,
        };

        const res = API_PROXY_URL
            ? await this.proxyFetch('anthropic', body, timeoutMs)
            : await this.fetchWithKeyRotation(
                  'anthropic',
                  this.getApiKeyCandidates(config, ['anthropicKey']),
                  apiKey => {
                      assertSecureEndpoint(ANTHROPIC_URL, 'Anthropic endpoint');
                      return fetch(ANTHROPIC_URL, {
                          method: 'POST',
                          headers: {
                              'Content-Type': 'application/json',
                              'x-api-key': apiKey,
                              'anthropic-version': ANTHROPIC_VERSION,
                              // Required for direct browser→Anthropic calls without a backend proxy.
                              // Anthropic blocks browser CORS by default; this header opts in.
                              // Safe here because the key is user-provided and stored locally.
                              'anthropic-dangerous-direct-browser-access': 'true',
                          },
                          signal: AbortSignal.timeout(timeoutMs),
                          body: JSON.stringify(body),
                      });
                  },
              );

        if (!res.ok) await this.handleHttpError(res, 'anthropic');
        const data = await res.json();
        const text = data.content?.[0]?.text ?? '';

        return this.buildResponse(text, model);
    }

    async *stream(
        prompt: string,
        config: AIConfig,
        options?: GenerateOptions,
    ): AsyncGenerator<string> {
        const preset = MODEL_PRESETS.anthropic;
        const model = options?.model ?? preset.model;
        const systemPrompt = this.getSystemPrompt(options);
        const maxTokens = options?.maxTokens ?? preset.maxTokens;
        const temperature = options?.temperature ?? preset.temperature;
        const timeoutMs = this.getTimeoutMs(options);

        const body = {
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            stream: true,
        };

        const url = API_PROXY_URL ? `${API_PROXY_URL}/api/ai/anthropic` : ANTHROPIC_URL;

        const res = API_PROXY_URL
            ? await fetch(url, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      'anthropic-version': ANTHROPIC_VERSION,
                  },
                  body: JSON.stringify(body),
                  signal: AbortSignal.timeout(timeoutMs),
              })
            : await this.fetchWithKeyRotation(
                  'anthropic',
                  this.getApiKeyCandidates(config, ['anthropicKey']),
                  apiKey => {
                      assertSecureEndpoint(ANTHROPIC_URL, 'Anthropic streaming endpoint');
                      return fetch(ANTHROPIC_URL, {
                          method: 'POST',
                          headers: {
                              'Content-Type': 'application/json',
                              'anthropic-version': ANTHROPIC_VERSION,
                              'x-api-key': apiKey,
                              'anthropic-dangerous-direct-browser-access': 'true',
                          },
                          body: JSON.stringify(body),
                          signal: AbortSignal.timeout(timeoutMs),
                      });
                  },
              );

        if (!res.ok) await this.handleHttpError(res, 'anthropic');
        if (!res.body) throw new Error('No response body');

        yield* this.parseSSEStream(res.body.getReader(), data => {
            const d = data as { type?: string; delta?: { type?: string; text?: string } };
            return d.type === 'content_block_delta' && d.delta?.type === 'text_delta'
                ? d.delta.text
                : undefined;
        });
    }
}
