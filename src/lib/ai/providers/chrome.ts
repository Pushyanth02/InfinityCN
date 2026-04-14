/**
 * providers/chrome.ts — Chrome AI (Gemini Nano) Provider
 *
 * Uses the browser-native window.ai.languageModel API available in
 * Chrome Canary with experimental flags enabled.
 */

import type { AIConfig, AIResponse, GenerateOptions } from '../types';
import { BaseAIProvider } from './base';

export class ChromeProvider extends BaseAIProvider {
    readonly name = 'chrome' as const;
    readonly supportsStreaming = true;
    override readonly costPer1KTokens = 0; // Local inference — free

    async generate(
        prompt: string,
        _config: AIConfig,
        options?: GenerateOptions,
    ): Promise<AIResponse> {
        if (!window.ai?.languageModel) {
            throw new Error(
                'Chrome AI is not available in this browser. Enable it in chrome://flags.',
            );
        }

        const caps = await window.ai.languageModel.capabilities();
        if (caps.available === 'no') {
            throw new Error('Chrome AI model is unavailable (may need to download).');
        }

        const systemPrompt = this.getSystemPrompt(options);
        const session = await window.ai.languageModel.create({ systemPrompt });

        try {
            const text = await session.prompt(prompt);
            return this.buildResponse(text, 'gemini-nano');
        } finally {
            session.destroy();
        }
    }

    async *stream(
        prompt: string,
        _config: AIConfig,
        options?: GenerateOptions,
    ): AsyncGenerator<string> {
        if (!window.ai?.languageModel) {
            throw new Error('Chrome AI is not available.');
        }

        const systemPrompt = this.getSystemPrompt(options);
        const session = await window.ai.languageModel.create({ systemPrompt });

        try {
            const stream = session.promptStreaming(prompt);
            let previousLength = 0;
            for await (const chunk of stream) {
                // Chrome returns the FULL accumulated string each time, so yield only the delta
                const delta = chunk.slice(previousLength);
                previousLength = chunk.length;
                if (delta) yield delta;
            }
        } finally {
            session.destroy();
        }
    }

    override async healthCheck(_config: AIConfig): Promise<boolean> {
        void _config;
        try {
            if (!window.ai?.languageModel) return false;
            const caps = await window.ai.languageModel.capabilities();
            return caps.available !== 'no';
        } catch {
            return false;
        }
    }
}
