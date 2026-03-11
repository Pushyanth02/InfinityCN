/**
 * aiEngine.ts — AI-Powered Cinematification Engine
 *
 * Orchestrates the AI-powered cinematification pipeline:
 * text chunking → context building (embeddings) → AI streaming/bulk calls →
 * block parsing → metadata accumulation → result assembly.
 */

import { callAIWithDedup, streamAI, MODEL_PRESETS } from '../ai';
import type { AIConfig } from '../ai';
import type { CinematicBlock, CinematificationResult } from '../../types/cinematifier';
import { generateEmbedding, retrieveRelevantContext } from '../embeddings';
import type { ChunkEmbedding } from '../embeddings';
import { MAX_CHUNK_CHARS } from '../constants';
import { parseCinematifiedText } from './parser';
import { cinematifyOffline } from './offlineEngine';

// ─── Text Chunking ─────────────────────────────────────────

function chunkText(text: string): string[] {
    const chunks: string[] = [];
    const paragraphs = text.split(/\n\s*\n/);
    let current = '';

    for (const para of paragraphs) {
        if ((current + '\n\n' + para).length > MAX_CHUNK_CHARS && current) {
            chunks.push(current.trim());
            current = para;
        } else {
            current = current ? current + '\n\n' + para : para;
        }
    }
    if (current.trim()) {
        chunks.push(current.trim());
    }

    return chunks;
}

// ─── System Prompt ─────────────────────────────────────────

const CINEMATIFICATION_SYSTEM_PROMPT = `You are a master cinematic storyteller. Transform this book chapter into a dramatically enhanced version.

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
6. Add scene transitions: CUT TO: [location], FADE IN, FADE TO BLACK
7. Mark reflective/introspective passages with [REFLECTION] and [/REFLECTION]
8. Mark high-tension sequences with [TENSION] and [/TENSION]
9. Append inline narrative tags to lines:
   - [EMOTION: joy|fear|sadness|suspense|anger|surprise|neutral]
   - [TENSION: 0-100] (0 = calm, 100 = extreme stress/climax)
   Example: "I can't believe it." [EMOTION: surprise] [TENSION: 40]
10. At the end of the text, optionally append overall tags:
   - [GENRE: fantasy|romance|thriller|sci_fi|mystery|historical|literary_fiction|horror|adventure|other] (Only if it's the first chapter)
   - [TONE: dark, romantic, suspenseful, humorous, etc] (Comma separated)
   - [SUMMARY: Brief 1-2 sentence summary of current characters, location, and action to maintain context]
`;

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
        const chunkProgress = (i + 1) / chunks.length;
        if (onProgress) {
            onProgress(chunkProgress, `Cinematifying section ${i + 1} of ${chunks.length}...`);
        }

        let prompt = CINEMATIFICATION_SYSTEM_PROMPT;
        if (previousSummary) {
            prompt += `\n\nPREVIOUS CHUNK CONTEXT:\n"""\n${previousSummary}\n"""\n`;
        }

        if (chunkEmbeddings.length > 0) {
            // Find most similar past chunk summary to provide long-term continuity
            const currentEmbedding = await generateEmbedding(chunks[i]).catch(() => null);
            if (currentEmbedding) {
                const relevantPastSummaries = retrieveRelevantContext(
                    currentEmbedding,
                    chunkEmbeddings,
                );
                if (relevantPastSummaries.length > 0) {
                    prompt += `\n\nRELEVANT PAST CONTEXT (from earlier in the book):\n"""\n${relevantPastSummaries.join('\n\n')}\n"""\n`;
                }
            }
        }

        prompt += `\n\nORIGINAL CHAPTER TEXT:\n"""\n${chunks[i]}\n"""\n\nOUTPUT: Full cinematified version`;

        // Use rawTextMode so the AI engine skips JSON formatting and uses higher token limits
        const cinematifyConfig: AIConfig = { ...config, rawTextMode: true };

        let rawBuffer = '';
        let lastProcessedIndex = 0;

        try {
            // Check if provider supports streaming (offline algorithms, deepseek in some configs, might not)
            const preset = config.provider !== 'none' ? MODEL_PRESETS[config.provider] : null;
            const canStream = preset?.supportsStreaming;

            if (canStream) {
                for await (const delta of streamAI(prompt, cinematifyConfig)) {
                    rawBuffer += delta;

                    // Look for completed paragraphs to parse and flush block-by-block
                    const doubleNewlineIdx = rawBuffer.lastIndexOf('\n\n');

                    if (doubleNewlineIdx > lastProcessedIndex) {
                        const completableText = rawBuffer
                            .substring(lastProcessedIndex, doubleNewlineIdx)
                            .trim();
                        if (completableText) {
                            const parsedBlocks = parseCinematifiedText(completableText);
                            if (parsedBlocks.length > 0) {
                                allBlocks.push(...parsedBlocks);
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
                const remainingText = rawBuffer.substring(lastProcessedIndex).trim();
                if (remainingText) {
                    const parsedBlocks = parseCinematifiedText(remainingText);
                    if (parsedBlocks.length > 0) {
                        allBlocks.push(...parsedBlocks);
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
                const raw = await callAIWithDedup(prompt, cinematifyConfig);
                rawBuffer = raw;
                allRawText.push(raw);
                const blocks = parseCinematifiedText(raw);
                if (blocks.length > 0) {
                    allBlocks.push(...blocks);
                    if (onChunk) onChunk(blocks, false);

                    const counts = countBlockMetadata(blocks);
                    sfxCount += counts.sfxCount;
                    transitionCount += counts.transitionCount;
                    beatCount += counts.beatCount;
                }
            }

            // Extract the summary for the NEXT chunk and save embedding
            const summaryMatch = rawBuffer.match(/\[SUMMARY:\s*([^\]]+)\]/i);
            if (summaryMatch) {
                previousSummary = summaryMatch[1].trim();
                const summaryEmbedding = await generateEmbedding(previousSummary).catch(() => null);
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
            const fallbackResult = cinematifyOffline(chunks[i]);
            allBlocks.push(...fallbackResult.blocks);
            if (onChunk) onChunk(fallbackResult.blocks, false);
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
