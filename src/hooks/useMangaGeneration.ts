/**
 * useMangaGeneration.ts — AI/algorithmic generation state and actions
 */

import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { getPreferredTitle } from '../lib/mangadex';
import { updateMangaGenerated } from '../lib/mangadexCache';
import { generateMangaCodex, generateSynopsis, enrichSynopsis } from '../lib/mangadexInference';
import { getAIConfig } from '../store';
import type { MangaWithMeta } from './useMangaDex';

// ─── HOOK ───────────────────────────────────────────────────────────────────

interface UseMangaGenerationResult {
    isGenerating: boolean;
    generationError: string | null;
    generateSynopsis: () => Promise<void>;
    generateCodex: () => Promise<void>;
}

export function useMangaGeneration(
    selectedManga: MangaWithMeta | null,
    setSelectedManga: Dispatch<SetStateAction<MangaWithMeta | null>>,
    online: boolean,
): UseMangaGenerationResult {
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationError, setGenerationError] = useState<string | null>(null);

    const generateSynopsisAction = useCallback(async () => {
        if (!selectedManga) return;

        setIsGenerating(true);
        setGenerationError(null);

        try {
            const manga = selectedManga.manga;
            const existingSynopsis = getPreferredTitle(manga.attributes.description || {}, 'en');

            // Step 1: If MangaDex has a synopsis, enrich it
            if (existingSynopsis && existingSynopsis.length > 50) {
                const enriched = enrichSynopsis(existingSynopsis, manga);
                await updateMangaGenerated(manga.id, { generatedSynopsis: enriched });
                setSelectedManga(prev =>
                    prev ? { ...prev, synopsis: enriched, isEnriched: true } : null,
                );
                return;
            }

            // Step 2: If offline, use algorithmic generation
            if (!online) {
                const generated = generateSynopsis(manga);
                await updateMangaGenerated(manga.id, { generatedSynopsis: generated });
                setSelectedManga(prev =>
                    prev ? { ...prev, synopsis: generated, isEnriched: true } : null,
                );
                return;
            }

            // Step 3: Try AI generation if available
            const aiConfig = getAIConfig();
            if (aiConfig.provider !== 'none') {
                try {
                    const { callAIWithDedup, parseJSON } = await import('../lib/ai');

                    const title = getPreferredTitle(manga.attributes.title);
                    const codex = generateMangaCodex(manga);

                    const prompt = `Generate a compelling 2-3 paragraph synopsis for a manga titled "${title}".
Genre: ${codex.genres.join(', ') || 'Unknown'}
Themes: ${codex.themes.join(', ') || 'Unknown'}
Mood: ${codex.mood}
Status: ${manga.attributes.status}
${existingSynopsis ? `Existing brief description: ${existingSynopsis}` : ''}

Write an engaging synopsis that would make readers want to read this manga. Focus on the setting, main conflict, and what makes it unique. Do NOT include spoilers.

Return JSON: {"synopsis": "..."}`;

                    const response = await callAIWithDedup(prompt, aiConfig);
                    const parsed = parseJSON<{ synopsis?: string }>(response);

                    if (parsed.synopsis) {
                        const synopsisText = parsed.synopsis;
                        await updateMangaGenerated(manga.id, { generatedSynopsis: synopsisText });
                        setSelectedManga(prev =>
                            prev ? { ...prev, synopsis: synopsisText, isEnriched: true } : null,
                        );
                        return;
                    }
                } catch (aiError) {
                    console.warn('AI generation failed, falling back to algorithmic:', aiError);
                }
            }

            // Step 4: Fallback to algorithmic generation
            const generated = generateSynopsis(manga);
            await updateMangaGenerated(manga.id, { generatedSynopsis: generated });
            setSelectedManga(prev =>
                prev ? { ...prev, synopsis: generated, isEnriched: true } : null,
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Generation failed';
            setGenerationError(message);
        } finally {
            setIsGenerating(false);
        }
    }, [selectedManga, online, setSelectedManga]);

    const generateCodexAction = useCallback(async () => {
        if (!selectedManga) return;

        setIsGenerating(true);
        setGenerationError(null);

        try {
            const manga = selectedManga.manga;

            // Step 1: Generate basic codex from tags
            const codex = generateMangaCodex(manga);

            // Step 2: Try AI enrichment if available and online
            const aiConfig = getAIConfig();
            if (online && aiConfig.provider !== 'none') {
                try {
                    const { callAIWithDedup, parseJSON } = await import('../lib/ai');

                    const title = getPreferredTitle(manga.attributes.title);
                    const synopsis =
                        selectedManga.synopsis ||
                        getPreferredTitle(manga.attributes.description || {}, 'en');

                    const prompt = `Analyze this manga and provide enriched metadata.

Title: ${title}
Current genres: ${codex.genres.join(', ')}
Current themes: ${codex.themes.join(', ')}
Synopsis: ${synopsis.substring(0, 500)}

Provide enhanced analysis in JSON format:
{
  "mood": "detailed mood description",
  "narrativeStyle": "detailed narrative style analysis",
  "similarTo": ["list of 3 similar manga titles"],
  "additionalThemes": ["any themes not already listed"]
}`;

                    const response = await callAIWithDedup(prompt, aiConfig);
                    const parsed = parseJSON<{
                        mood?: string;
                        narrativeStyle?: string;
                        similarTo?: string[];
                        additionalThemes?: string[];
                    }>(response);

                    if (parsed.mood) codex.mood = parsed.mood;
                    if (parsed.narrativeStyle) codex.narrativeStyle = parsed.narrativeStyle;
                    if (parsed.similarTo?.length) codex.similarTo = parsed.similarTo;
                    if (parsed.additionalThemes?.length) {
                        codex.themes = [...new Set([...codex.themes, ...parsed.additionalThemes])];
                    }
                } catch (aiError) {
                    console.warn('AI codex enrichment failed:', aiError);
                }
            }

            await updateMangaGenerated(manga.id, { generatedCodex: codex });
            setSelectedManga(prev => (prev ? { ...prev, codex, isEnriched: true } : null));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Codex generation failed';
            setGenerationError(message);
        } finally {
            setIsGenerating(false);
        }
    }, [selectedManga, online, setSelectedManga]);

    return {
        isGenerating,
        generationError,
        generateSynopsis: generateSynopsisAction,
        generateCodex: generateCodexAction,
    };
}
