/**
 * nlp.worker.ts — Web Worker for Heavy NLP Processing
 *
 * Offloads computationally intensive text analysis to a background thread,
 * preventing UI blocking during large document processing.
 *
 * Usage:
 *   const worker = new Worker(new URL('./workers/nlp.worker.ts', import.meta.url), { type: 'module' });
 *   worker.postMessage({ operation: 'analyze', text: '...', options: {} });
 *   worker.onmessage = (e) => console.log(e.data.result);
 */

import {
    tokenise,
    splitSentences,
    analyseSentiment,
    computeReadability,
    computeVocabRichness,
    scoreTension,
    detectSceneBoundaries,
    extractCharacters,
    analysePacing,
    computeEmotionalArc,
    generateExtractiveRecap,
    extractKeywords,
} from '../lib/algorithms';

// ═══════════════════════════════════════════════════════════
// 1. MESSAGE TYPES
// ═══════════════════════════════════════════════════════════

export type NLPOperation =
    | 'tokenise'
    | 'splitSentences'
    | 'analyseSentiment'
    | 'computeReadability'
    | 'computeVocabRichness'
    | 'scoreTension'
    | 'detectSceneBoundaries'
    | 'extractCharacters'
    | 'analysePacing'
    | 'computeEmotionalArc'
    | 'generateExtractiveRecap'
    | 'extractKeywords'
    | 'fullAnalysis';

export interface NLPWorkerRequest {
    id: string;
    operation: NLPOperation;
    text: string;
    options?: {
        recapSentences?: number;
        maxCharacters?: number;
        maxKeywords?: number;
    };
}

export interface NLPWorkerResponse {
    id: string;
    success: boolean;
    operation: NLPOperation;
    result?: unknown;
    error?: string;
    processingTime: number;
}

// ═══════════════════════════════════════════════════════════
// 2. OPERATION HANDLERS
// ═══════════════════════════════════════════════════════════

function executeOperation(request: NLPWorkerRequest): unknown {
    const { operation, text, options = {} } = request;
    const sentences = splitSentences(text);

    switch (operation) {
        case 'tokenise':
            return tokenise(text);

        case 'splitSentences':
            return sentences;

        case 'analyseSentiment':
            return analyseSentiment(text);

        case 'computeReadability':
            return computeReadability(text);

        case 'computeVocabRichness':
            return computeVocabRichness(text);

        case 'scoreTension':
            return scoreTension(text);

        case 'detectSceneBoundaries':
            return detectSceneBoundaries(sentences);

        case 'extractCharacters':
            return extractCharacters(text, options.maxCharacters);

        case 'analysePacing':
            return analysePacing(text);

        case 'computeEmotionalArc': {
            // Build panels from sentences with pre-computed metrics
            const panels = sentences.map(sentence => ({
                content: sentence,
                tension: scoreTension(sentence),
                sentiment: analyseSentiment(sentence).score,
            }));
            return computeEmotionalArc(panels);
        }

        case 'generateExtractiveRecap':
            return generateExtractiveRecap(text, options.recapSentences);

        case 'extractKeywords':
            return extractKeywords(text, options.maxKeywords);

        case 'fullAnalysis': {
            const panelsForArc = sentences.map(sentence => ({
                content: sentence,
                tension: scoreTension(sentence),
                sentiment: analyseSentiment(sentence).score,
            }));
            return {
                sentiment: analyseSentiment(text),
                readability: computeReadability(text),
                vocabulary: computeVocabRichness(text),
                tension: scoreTension(text),
                scenes: detectSceneBoundaries(sentences),
                characters: extractCharacters(text, options.maxCharacters),
                pacing: analysePacing(text),
                emotionalArc: computeEmotionalArc(panelsForArc),
                recap: generateExtractiveRecap(text, options.recapSentences || 5),
                keywords: extractKeywords(text, options.maxKeywords),
            };
        }

        default:
            throw new Error(`Unknown operation: ${operation}`);
    }
}

// ═══════════════════════════════════════════════════════════
// 3. MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════

self.onmessage = (event: MessageEvent<NLPWorkerRequest>) => {
    const request = event.data;
    const startTime = performance.now();

    try {
        const result = executeOperation(request);
        const processingTime = performance.now() - startTime;

        const response: NLPWorkerResponse = {
            id: request.id,
            success: true,
            operation: request.operation,
            result,
            processingTime,
        };

        self.postMessage(response);
    } catch (error) {
        const processingTime = performance.now() - startTime;

        const response: NLPWorkerResponse = {
            id: request.id,
            success: false,
            operation: request.operation,
            error: error instanceof Error ? error.message : 'Unknown error',
            processingTime,
        };

        self.postMessage(response);
    }
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
