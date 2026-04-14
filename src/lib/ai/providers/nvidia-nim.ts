/**
 * providers/nvidia-nim.ts — NVIDIA NIM API Provider
 *
 * NVIDIA NIM uses an OpenAI-compatible chat completions API at
 * https://integrate.api.nvidia.com/v1/chat/completions.
 * Extends the OpenAI-compatible base class.
 */

import { OpenAICompatibleProvider } from './openai';
import type { OpenAICompatibleEndpoint } from './openai';

const NIM_ENDPOINT: OpenAICompatibleEndpoint = {
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    keyFields: ['nvidiaNimKey'],
    maxTokensField: 'max_tokens',
    providerSlug: 'nvidia-nim',
};

export class NvidiaNimProvider extends OpenAICompatibleProvider {
    constructor() {
        super('nvidia-nim', NIM_ENDPOINT, 0.12);
    }
}
