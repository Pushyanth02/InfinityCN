/**
 * embeddings.test.ts — Unit tests for the pure utility exports of embeddings.ts
 *
 * Covers:
 *   • retrieveRelevantContext — cosine-similarity ranking over pre-computed embeddings
 *
 * Note: generateEmbedding is not tested here because it requires @xenova/transformers
 * (800 KB ONNX runtime) — it is exercised in integration / E2E tests.
 */

import { describe, it, expect } from 'vitest';
import { retrieveRelevantContext } from '../ai/embeddings';
import type { ChunkEmbedding } from '../ai/embeddings';

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Build a unit-vector embedding of dimension `dim` with all values equal to 1/√dim */
function uniformEmbedding(dim = 4): number[] {
    const v = 1 / Math.sqrt(dim);
    return Array(dim).fill(v);
}

/** Build an embedding with 1.0 at position `pos` and 0 elsewhere */
function oneHot(pos: number, dim = 4): number[] {
    const arr = Array(dim).fill(0);
    arr[pos] = 1;
    return arr;
}

// ─── retrieveRelevantContext ──────────────────────────────────────────────────

describe('retrieveRelevantContext', () => {
    it('returns empty array when history is empty', () => {
        const result = retrieveRelevantContext(uniformEmbedding(), []);
        expect(result).toEqual([]);
    });

    it('returns at most topK results', () => {
        const history: ChunkEmbedding[] = [
            { id: '1', text: 'alpha', embedding: oneHot(0) },
            { id: '2', text: 'beta', embedding: oneHot(1) },
            { id: '3', text: 'gamma', embedding: oneHot(2) },
            { id: '4', text: 'delta', embedding: oneHot(3) },
        ];
        const result = retrieveRelevantContext(oneHot(0), history, 2);
        expect(result).toHaveLength(2);
    });

    it('defaults topK to 2', () => {
        const history: ChunkEmbedding[] = [
            { id: '1', text: 'alpha', embedding: oneHot(0) },
            { id: '2', text: 'beta', embedding: oneHot(1) },
            { id: '3', text: 'gamma', embedding: oneHot(2) },
        ];
        // Call without explicit topK — default is 2
        const result = retrieveRelevantContext(oneHot(0), history);
        expect(result).toHaveLength(2);
    });

    it('returns the most similar chunk first', () => {
        const history: ChunkEmbedding[] = [
            { id: '1', text: 'exact match', embedding: oneHot(0) },
            { id: '2', text: 'no match', embedding: oneHot(1) },
            { id: '3', text: 'close match', embedding: oneHot(0).map(v => v * 0.9) },
        ];
        // Query is oneHot(0): should prefer 'exact match'
        const result = retrieveRelevantContext(oneHot(0), history, 1);
        expect(result[0]).toBe('exact match');
    });

    it('returns texts in descending similarity order', () => {
        // oneHot(0) query: chunk at dim 0 is most similar, chunk at dim 1 least
        const history: ChunkEmbedding[] = [
            { id: '1', text: 'dim0', embedding: oneHot(0) },
            { id: '2', text: 'dim1', embedding: oneHot(1) },
        ];
        const result = retrieveRelevantContext(oneHot(0), history, 2);
        expect(result[0]).toBe('dim0');
        expect(result[1]).toBe('dim1');
    });

    it('handles a zero-vector query without crashing (returns texts with score 0)', () => {
        const history: ChunkEmbedding[] = [{ id: '1', text: 'something', embedding: oneHot(0) }];
        const zeroVec = Array(4).fill(0);
        const result = retrieveRelevantContext(zeroVec, history, 1);
        // cosine similarity with zero vector is 0 — should still return topK items
        expect(result).toHaveLength(1);
    });

    it('handles topK larger than history length — returns all items', () => {
        const history: ChunkEmbedding[] = [{ id: '1', text: 'only one', embedding: oneHot(0) }];
        const result = retrieveRelevantContext(oneHot(0), history, 10);
        expect(result).toHaveLength(1);
    });

    it('returns plain text strings (not ChunkEmbedding objects)', () => {
        const history: ChunkEmbedding[] = [{ id: '1', text: 'plain text', embedding: oneHot(0) }];
        const result = retrieveRelevantContext(oneHot(0), history, 1);
        expect(typeof result[0]).toBe('string');
    });

    it('throws on vector dimension mismatch', () => {
        const history: ChunkEmbedding[] = [
            { id: '1', text: 'mismatched', embedding: oneHot(0, 8) }, // 8-dim
        ];
        // Query is 4-dim, history has 8-dim — should throw
        expect(() => retrieveRelevantContext(oneHot(0, 4), history, 1)).toThrow(
            /dimension mismatch/i,
        );
    });
});
