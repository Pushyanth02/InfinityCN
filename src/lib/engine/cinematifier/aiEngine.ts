/**
 * aiEngine.ts — AI-Powered Cinematification Engine
 *
 * Orchestrates the AI-powered cinematification pipeline:
 * text chunking → context building (embeddings) → AI streaming/bulk calls →
 * block parsing → metadata accumulation → result assembly.
 */

import { callAIManaged, streamAIManaged, MODEL_PRESETS } from '../../ai';
import type { AIConfig, AIManagerOptions } from '../../ai';
import type { CinematicBlock, CinematificationResult } from '../../../types/cinematifier';
import { generateEmbedding, retrieveRelevantContext } from '../../ai/embeddings';
import type { ChunkEmbedding } from '../../ai/embeddings';
import { MAX_CHUNK_CHARS } from '../../constants';
import { parseCinematifiedText } from './parser';
import { cinematifyOffline } from './offlineEngine';

// ─── Text Chunking ─────────────────────────────────────────

const STREAM_PARSE_MIN_CHARS = 320;

function splitOversizedParagraph(paragraph: string): string[] {
    const trimmed = paragraph.trim();
    if (!trimmed) return [];
    if (trimmed.length <= MAX_CHUNK_CHARS) return [trimmed];

    const parts: string[] = [];
    let remaining = trimmed;

    while (remaining.length > MAX_CHUNK_CHARS) {
        const windowText = remaining.slice(0, MAX_CHUNK_CHARS);
        const candidateBreaks = [
            windowText.lastIndexOf('. '),
            windowText.lastIndexOf('! '),
            windowText.lastIndexOf('? '),
            windowText.lastIndexOf('; '),
            windowText.lastIndexOf(', '),
            windowText.lastIndexOf(' '),
        ];
        let splitIndex = Math.max(...candidateBreaks);

        // Avoid pathological tiny splits when punctuation appears too early.
        if (splitIndex < Math.floor(MAX_CHUNK_CHARS * 0.4)) {
            splitIndex = MAX_CHUNK_CHARS;
        }

        const part = remaining.slice(0, splitIndex).trim();
        if (part) parts.push(part);
        remaining = remaining.slice(splitIndex).trim();
    }

    if (remaining) parts.push(remaining);
    return parts;
}

function chunkText(text: string): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split(/\n\s*\n/);
    let current = '';

    for (const para of paragraphs) {
        const parts = splitOversizedParagraph(para);
        for (const part of parts) {
            if ((current + '\n\n' + part).length > MAX_CHUNK_CHARS && current) {
                chunks.push(current.trim());
                current = part;
            } else {
                current = current ? current + '\n\n' + part : part;
            }
        }
    }
    if (current.trim()) {
        chunks.push(current.trim());
    }

    return chunks;
}

// ─── System Prompt ─────────────────────────────────────────

function buildCinematifierPrompt(isFirstChunk: boolean): string {
    let prompt = `You are a master cinematic storyteller. Transform this book chapter into a dramatically enhanced version.

RULES:
1. Keep ALL original content, characters, plot, dialogue (never remove)
2. Segment the text into cinematic scenes using scene markers:
   - [SCENE: location or transition description]
   - Detect location changes, time shifts, emotional resets, character focus changes
   - Use scene break markers between scenes: — ✦ —
3. Add cinematic pacing:
   - Short, punchy sentences for action scenes
   - Longer, flowing prose for emotional moments
4. Add SFX annotations: SFX: [sound description]
   Examples: SFX: CRASH!, SFX: distant thunder, SFX: silence...
5. Add dramatic beats: BEAT, PAUSE
6. Add scene transitions with explicit markers when changing scenes:
    - [TRANSITION: CUT TO], [TRANSITION: DISSOLVE TO], [TRANSITION: SMASH CUT], [TRANSITION: FADE TO BLACK]
7. Add cinematic camera/atmosphere markers at scene starts when relevant:
    - [CAMERA: WIDE ESTABLISHING|MEDIUM TRACKING|HANDHELD CLOSE|OVER THE SHOULDER|PUSH IN]
    - [AMBIENCE: short atmospheric cue]
8. Mark reflective/introspective passages with [REFLECTION] and [/REFLECTION]
9. Mark high-tension sequences with [TENSION] and [/TENSION]
10. Append inline narrative tags to lines:
   - [EMOTION: joy|fear|sadness|suspense|anger|surprise|neutral]
   - [TENSION: 0-100] (0 = calm, 100 = extreme stress/climax)
   Example: "I can't believe it." [EMOTION: surprise] [TENSION: 40]`;

    if (isFirstChunk) {
        prompt += `\n11. At the end of the text, optionally append overall tags:
   - [GENRE: fantasy|romance|thriller|sci_fi|mystery|historical|literary_fiction|horror|adventure|other]
   - [TONE: dark, romantic, suspenseful, humorous, etc] (Comma separated)
   - [SUMMARY: Brief 1-2 sentence summary of current characters, location, and action to maintain context]`;
    } else {
        prompt += `\n11. At the end of the text, optionally append overall tags:
   - [SUMMARY: Brief 1-2 sentence summary of current characters, location, and action to maintain context]`;
    }

    return prompt + '\n';
}

function buildManagerOptions(config: AIConfig): AIManagerOptions {
    return {
        providerOrder: config.fallbackProviders,
        preferLowerCost: config.preferLowerCost ?? true,
        maxCostUsd: config.maxCostUsd,
        useCache: true,
        maxRetries: 2,
    };
}

export function validateAICinematification(
    blocks: CinematicBlock[],
    originalWordCount: number,
): void {
    if (blocks.length === 0 && originalWordCount > 0) {
        throw new Error('AI hallucination: Zero blocks produced from valid input.');
    }

    const cinematifiedWordCount = blocks.reduce(
        (acc, b) => acc + (b.content?.split(/\s+/).filter(Boolean).length || 0),
        0,
    );

    // If word count dropped significantly, it might be heavily summarising
    if (cinematifiedWordCount < originalWordCount * 0.6) {
        const hasDialogue = blocks.some(b => b.type === 'dialogue');
        // Tolerance for short, mostly-action scenes, but rigid for substantial blocks
        if (!hasDialogue && originalWordCount > 50) {
            throw new Error(
                `AI hallucination: Significant word loss detected (${originalWordCount} -> ${cinematifiedWordCount}). Flow compromised.`,
            );
        }
    }
}

// ─── Block Metadata Counter ────────────────────────────────

function countBlockMetadata(blocks: CinematicBlock[]) {
    let sfxCount = 0;
    let transitionCount = 0;
    let beatCount = 0;

    for (const block of blocks) {
        if (block.sfx) sfxCount++;
        if (block.transition) transitionCount++;
        if (block.beat) beatCount++;
    }

    return { sfxCount, transitionCount, beatCount };
}

// ─── Main AI Cinematification Function ─────────────────────

export async function cinematifyText(
    text: string,
    config: AIConfig,
    onProgress?: (percent: number, message: string) => void,
    onChunk?: (blocks: CinematicBlock[], isDone: boolean) => void,
    abortSignal?: AbortSignal,
): Promise<CinematificationResult> {
    const startTime = performance.now();
    const chunks = chunkText(text);
    const allBlocks: CinematicBlock[] = [];
    const allRawText: string[] = [];
    let sfxCount = 0;
    let transitionCount = 0;
    let beatCount = 0;
    let previousSummary = '';
    const chunkEmbeddings: ChunkEmbedding[] = [];

    for (let i = 0; i < chunks.length; i++) {
        if (abortSignal?.aborted) throw new Error('Processing aborted');
        const chunkProgress = (i + 1) / chunks.length;
        if (onProgress) {
            onProgress(chunkProgress, `Cinematifying section ${i + 1} of ${chunks.length}...`);
        }

        let prompt = buildCinematifierPrompt(i === 0);
        if (previousSummary) {
            prompt += `\n\nPREVIOUS CHUNK CONTEXT:\n"""\n${previousSummary}\n"""\n`;
        }

        if (chunkEmbeddings.length > 1) {
            // Query with the latest completed summary embedding (previous chunk),
            // and search only earlier summaries to avoid self-matching.
            const previousSummaryEmbedding = chunkEmbeddings[chunkEmbeddings.length - 1]?.embedding;
            const earlierSummaryEmbeddings = chunkEmbeddings.slice(0, -1);
            if (previousSummaryEmbedding && earlierSummaryEmbeddings.length > 0) {
                const relevantPastSummaries = retrieveRelevantContext(
                    previousSummaryEmbedding,
                    earlierSummaryEmbeddings,
                );
                if (relevantPastSummaries.length > 0) {
                    prompt += `\n\nRELEVANT PAST CONTEXT (from earlier in the book):\n"""\n${relevantPastSummaries.join('\n\n')}\n"""\n`;
                }
            }
        }

        prompt += `\n\nORIGINAL CHAPTER TEXT:\n"""\n${chunks[i]}\n"""\n\nOUTPUT: Full cinematified version`;

        // Use rawTextMode so the AI engine skips JSON formatting and uses higher token limits
        const cinematifyConfig: AIConfig = { ...config, rawTextMode: true };
        const managerOptions = buildManagerOptions(cinematifyConfig);

        let rawBuffer = '';
        let lastProcessedIndex = 0;
        const chunkStartIndex = allBlocks.length;
        const chunkBlocks: CinematicBlock[] = [];

        try {
            if (abortSignal?.aborted) throw new Error('Processing aborted');
            // Check if provider supports streaming (offline algorithms, deepseek in some configs, might not)
            const preset = config.provider !== 'none' ? MODEL_PRESETS[config.provider] : null;
            const canStream = preset?.supportsStreaming;

            if (canStream) {
                for await (const delta of streamAIManaged(
                    prompt,
                    cinematifyConfig,
                    managerOptions,
                )) {
                    if (abortSignal?.aborted) throw new Error('Processing aborted');
                    rawBuffer += delta;

                    // Look for completed paragraphs to parse and flush block-by-block
                    const doubleNewlineIdx = rawBuffer.lastIndexOf('\n\n');

                    if (doubleNewlineIdx > lastProcessedIndex + STREAM_PARSE_MIN_CHARS) {
                        const completableText = rawBuffer
                            .substring(lastProcessedIndex, doubleNewlineIdx)
                            .trim();
                        if (completableText) {
                            if (abortSignal?.aborted) throw new Error('Processing aborted');
                            const parsedBlocks = parseCinematifiedText(completableText);
                            if (parsedBlocks.length > 0) {
                                allBlocks.push(...parsedBlocks);
                                chunkBlocks.push(...parsedBlocks);
                                if (onChunk) onChunk(parsedBlocks, false);

                                const counts = countBlockMetadata(parsedBlocks);
                                sfxCount += counts.sfxCount;
                                transitionCount += counts.transitionCount;
                                beatCount += counts.beatCount;
                            }
                        }
                        // Advance cursor past the newlines
                        lastProcessedIndex = doubleNewlineIdx + 2;
                    }
                }

                // Flush remaining text
                if (abortSignal?.aborted) throw new Error('Processing aborted');
                const remainingText = rawBuffer.substring(lastProcessedIndex).trim();
                if (remainingText) {
                    if (abortSignal?.aborted) throw new Error('Processing aborted');
                    const parsedBlocks = parseCinematifiedText(remainingText);
                    if (parsedBlocks.length > 0) {
                        allBlocks.push(...parsedBlocks);
                        chunkBlocks.push(...parsedBlocks);
                        if (onChunk) onChunk(parsedBlocks, false);

                        const counts = countBlockMetadata(parsedBlocks);
                        sfxCount += counts.sfxCount;
                        transitionCount += counts.transitionCount;
                        beatCount += counts.beatCount;
                    }
                }
                allRawText.push(rawBuffer);
            } else {
                // Fallback to bulk for non-streaming providers
                if (abortSignal?.aborted) throw new Error('Processing aborted');
                const managedResult = await callAIManaged(prompt, cinematifyConfig, managerOptions);
                if (abortSignal?.aborted) throw new Error('Processing aborted');
                rawBuffer = managedResult.text;
                allRawText.push(managedResult.text);
                const blocks = parseCinematifiedText(managedResult.text);
                if (blocks.length > 0) {
                    allBlocks.push(...blocks);
                    chunkBlocks.push(...blocks);
                    if (onChunk) onChunk(blocks, false);

                    const counts = countBlockMetadata(blocks);
                    sfxCount += counts.sfxCount;
                    transitionCount += counts.transitionCount;
                    beatCount += counts.beatCount;
                }
            }

            // Validate the chunk before proceeding
            if (abortSignal?.aborted) throw new Error('Processing aborted');
            const chunkOriginalWordCount = chunks[i].split(/\s+/).filter(Boolean).length;
            validateAICinematification(chunkBlocks, chunkOriginalWordCount);

            // Extract the summary for the NEXT chunk and save embedding
            if (abortSignal?.aborted) throw new Error('Processing aborted');
            const summaryMatch = rawBuffer.match(/\[SUMMARY:\s*([^\]]+)\]/i);
            if (summaryMatch) {
                previousSummary = summaryMatch[1].trim();
                if (abortSignal?.aborted) throw new Error('Processing aborted');
                const summaryEmbedding = await generateEmbedding(previousSummary).catch(() => null);
                if (abortSignal?.aborted) throw new Error('Processing aborted');
                if (summaryEmbedding) {
                    chunkEmbeddings.push({
                        id: `chunk-${i}`,
                        text: previousSummary,
                        embedding: summaryEmbedding,
                    });
                }
            }
        } catch (err) {
            console.warn(`[Cinematifier] Chunk ${i + 1} fallback:`, err);

            // Revert any blocks uniquely pushed during this broken chunk to prevent dupe fragments.
            // (Note: onChunk UI signal cannot be easily fully reverted without buffering,
            // but the final returned blocks array will remain correct.)
            allBlocks.splice(chunkStartIndex);

            const fallbackResult = cinematifyOffline(chunks[i]);
            allBlocks.push(...fallbackResult.blocks);
            if (onChunk) onChunk(fallbackResult.blocks, false);

            // Re-calc counts since we reverted the AI ones and appended offline ones
            const offlineCounts = countBlockMetadata(fallbackResult.blocks);
            sfxCount += offlineCounts.sfxCount;
            transitionCount += offlineCounts.transitionCount;
            beatCount += offlineCounts.beatCount;
        }
    }

    if (onChunk) onChunk([], true); // Signal completion

    const processingTimeMs = Math.round(performance.now() - startTime);

    return {
        blocks: allBlocks,
        rawText: allRawText.join('\n\n'),
        metadata: {
            originalWordCount: text.split(/\s+/).length,
            cinematifiedWordCount: allBlocks.reduce(
                (acc, b) => acc + (b.content?.split(/\s+/).length || 0),
                0,
            ),
            sfxCount,
            transitionCount,
            beatCount,
            processingTimeMs,
        },
    };
}
