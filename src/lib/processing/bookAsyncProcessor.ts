import { reconstructParagraphs } from '../cinematifier';
import { getJob, savePartialCompletion, updateProgress } from './pdfJobs';

const DEFAULT_CHUNK_SIZE = 4000;

export interface ProcessBookAsyncOptions {
    chunkSize?: number;
    maxChunksPerRun?: number;
    checkpointInterval?: number;
    progressStart?: number;
    progressEnd?: number;
    signal?: AbortSignal;
    onProgress?: (progressPercent: number, processedChunks: number, totalChunks: number) => void;
}

function clampProgress(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
}

function mapRange(progress: number, start: number, end: number): number {
    const clamped = clampProgress(progress);
    return Math.round(start + ((end - start) * clamped) / 100);
}

function splitTextIntoChunks(text: string, chunkSize: number): string[] {
    const paragraphs = text
        .split(/\n\s*\n/)
        .map(part => part.trim())
        .filter(Boolean);

    if (paragraphs.length === 0) return [];

    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        if (!currentChunk) {
            currentChunk = paragraph;
            continue;
        }

        const candidate = `${currentChunk}\n\n${paragraph}`;
        if (candidate.length > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = paragraph;
            continue;
        }

        currentChunk = candidate;
    }

    if (currentChunk) {
        chunks.push(currentChunk);
    }

    return chunks;
}

function flushChunkBuffer(chunks: string[], chunkBuffer: string): void {
    if (!chunkBuffer.trim()) return;
    chunks.push(chunkBuffer.trim());
}

function appendChunkResult(existing: string, addition: string): string {
    const next = addition.trim();
    if (!next) return existing;
    if (!existing.trim()) return next;
    return `${existing}\n\n${next}`.trim();
}

async function yieldToMainThread(): Promise<void> {
    await new Promise<void>(resolve => {
        setTimeout(resolve, 0);
    });
}

/**
 * Process a persisted book job in small chunks so UI remains responsive.
 * The function checkpoints each chunk and can resume from last processed chunk.
 */
export async function processBookAsync(
    jobId: string,
    options: ProcessBookAsyncOptions = {},
): Promise<string> {
    const job = getJob(jobId);
    if (!job) {
        throw new Error(`Job ${jobId} was not found.`);
    }

    const sourceText = job.sourceText?.trim();
    if (!sourceText) {
        throw new Error(`Job ${jobId} has no source text to process.`);
    }

    const chunkSize = Math.max(500, options.chunkSize ?? DEFAULT_CHUNK_SIZE);
    const checkpointInterval = Math.max(1, options.checkpointInterval ?? 2);
    const progressStart = clampProgress(options.progressStart ?? 0);
    const progressEnd = clampProgress(options.progressEnd ?? 100);
    const maxChunksPerRun = Math.max(1, options.maxChunksPerRun ?? Number.POSITIVE_INFINITY);

    const chunks = splitTextIntoChunks(sourceText, chunkSize);
    if (chunks.length === 0) {
        const finalText = reconstructParagraphs(sourceText).trim();
        savePartialCompletion(jobId, finalText, 1, 1, progressEnd);
        options.onProgress?.(progressEnd, 1, 1);
        return finalText;
    }

    const startChunk = Math.min(Math.max(0, job.processedChunks ?? 0), chunks.length);
    let handledThisRun = 0;
    let partialResult = (job.partialResult ?? job.result ?? '').trim();
    let bufferedProcessedChunks: string[] = [];

    const checkpoint = (processedChunks: number) => {
        if (bufferedProcessedChunks.length > 0) {
            partialResult = appendChunkResult(partialResult, bufferedProcessedChunks.join('\n\n'));
            bufferedProcessedChunks = [];
        }

        const chunkProgress = Math.round((processedChunks / chunks.length) * 100);
        const mappedProgress = mapRange(chunkProgress, progressStart, progressEnd);

        updateProgress(jobId, mappedProgress);
        savePartialCompletion(jobId, partialResult, processedChunks, chunks.length, mappedProgress);
        options.onProgress?.(mappedProgress, processedChunks, chunks.length);
    };

    for (let i = startChunk; i < chunks.length; i++) {
        if (options.signal?.aborted) break;
        if (handledThisRun >= maxChunksPerRun) break;

        const processedChunk = reconstructParagraphs(chunks[i]);
        flushChunkBuffer(bufferedProcessedChunks, processedChunk);
        const processedChunks = i + 1;
        handledThisRun += 1;

        const shouldCheckpoint =
            handledThisRun % checkpointInterval === 0 ||
            processedChunks === chunks.length ||
            handledThisRun >= maxChunksPerRun ||
            options.signal?.aborted;

        if (shouldCheckpoint) {
            checkpoint(processedChunks);
        }

        await yieldToMainThread();
    }

    if (bufferedProcessedChunks.length > 0) {
        const processedChunks = Math.min(startChunk + handledThisRun, chunks.length);
        checkpoint(processedChunks);
    }

    return partialResult;
}
