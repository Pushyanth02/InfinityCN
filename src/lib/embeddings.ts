import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';

// Singleton for the chunk embedding pipeline
class PipelineSingleton {
    static task = 'feature-extraction';
    static model = 'Xenova/all-MiniLM-L6-v2';
    static instance: FeatureExtractionPipeline | null = null;

    static async getInstance(progressCallback?: (data: unknown) => void) {
        if (this.instance === null) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.instance = (await pipeline(this.task as any, this.model, {
                progress_callback: progressCallback,
            })) as FeatureExtractionPipeline;
        }
        return this.instance;
    }
}

export interface ChunkEmbedding {
    id: string; // usually chunk index
    text: string;
    embedding: number[];
}

/**
 * Generates an embedding for a given text using Xenova's all-MiniLM-L6-v2.
 */
export async function generateEmbedding(
    text: string,
    onProgress?: (data: unknown) => void,
): Promise<number[]> {
    const embedder = await PipelineSingleton.getInstance(onProgress);
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

/**
 * Computes cosine similarity between two vectors.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Given a target embedding and a list of candidate embeddings, returns the top K most similar texts.
 */
export function retrieveRelevantContext(
    queryEmbedding: number[],
    history: ChunkEmbedding[],
    topK = 2,
): string[] {
    if (history.length === 0) return [];

    const scored = history.map(item => ({
        text: item.text,
        score: cosineSimilarity(queryEmbedding, item.embedding),
    }));

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(item => item.text);
}
