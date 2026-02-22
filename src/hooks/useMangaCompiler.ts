import { extractTextFromPDF } from '../lib/pdfWorker';
import {
    processTextToManga,
    processCharacters,
    processRecap,
    processAtmosphere,
    processAnalytics,
} from '../lib/parser';
import {
    enhanceCharacters,
    enhanceRecap,
    analyseStyle,
    enhanceMood,
    generateInsights,
} from '../lib/ai';
import type { AIConfig } from '../lib/ai';
import { useStore } from '../store';
import { db } from '../lib/db';

// ── Atomic store selectors (avoids subscribing to all state) ──
const sel = {
    rawText: (s: ReturnType<typeof useStore.getState>) => s.rawText,
    chapterId: (s: ReturnType<typeof useStore.getState>) => s.currentChapterId,
    analytics: (s: ReturnType<typeof useStore.getState>) => s.analytics,
};

/** Build an AIConfig snapshot from the current store state — does NOT trigger re-renders */
function getAIConfig(): AIConfig {
    const { aiProvider, geminiKey, ollamaUrl, ollamaModel } = useStore.getState();
    return { provider: aiProvider, geminiKey, ollamaUrl, ollamaModel };
}

export const useMangaCompiler = () => {
    // Atomic selectors — each component only re-renders when its specific slice changes
    const rawText = useStore(sel.rawText);
    const currentChapterId = useStore(sel.chapterId);

    const setProcessing = useStore(s => s.setProcessing);
    const setProgress = useStore(s => s.setProgress);
    const setProgressLabel = useStore(s => s.setProgressLabel);
    const setRawText = useStore(s => s.setRawText);
    const setMangaData = useStore(s => s.setMangaData);
    const setError = useStore(s => s.setError);
    const setErrorAndStop = useStore(s => s.setErrorAndStop);
    const setChapterId = useStore(s => s.setCurrentChapterId);

    /** Primary: upload PDF or TXT → extract text → generate panels + analytics */
    const compileToManga = async (file: File) => {
        try {
            setProcessing(true);
            setProgress(5);
            setProgressLabel('Preparing…');
            setError(null);

            // Validate file size (50 MB limit)
            const MAX_BYTES = 50 * 1024 * 1024;
            if (file.size > MAX_BYTES) {
                setErrorAndStop(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is 50 MB.`);
                return;
            }

            // Phase 1: Extract text
            setProgressLabel('Extracting text…');
            let text: string;
            if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
                text = await file.text();
            } else {
                text = await extractTextFromPDF(file);
            }
            setRawText(text);
            setProgress(15);

            // Phase 2: Parse into panels (async, time-sliced)
            setProgressLabel('Parsing narrative structure…');
            const newPanels = await processTextToManga(text, (p) =>
                setProgress(Math.max(15, Math.round(p * 0.55)))
            );
            setProgress(72);

            // Phase 3: Analytics + Atmosphere (parallel)
            setProgressLabel('Running analytics…');
            const [analytics, atmosphere] = await Promise.all([
                processAnalytics(text, newPanels),
                processAtmosphere(text),
            ]);
            setProgress(90);

            // Phase 4: Persist to IndexedDB
            setProgressLabel('Saving chapter…');
            const chapterId = await db.chapters.add({
                title: file.name.replace(/\.[^/.]+$/, ''),
                createdAt: Date.now(),
                panels: newPanels,
                characters: [],
                recap: null,
                atmosphere,
                analytics,
                rawText: text,
            });
            setChapterId(chapterId as number);

            // Phase 5: Commit to store
            setMangaData({ panels: newPanels, atmosphere, analytics });
            setProgress(100);
            setProgressLabel('Done');
            setProcessing(false);

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'An error occurred during processing.';
            setErrorAndStop(msg);
        }
    };

    /**
     * On-demand: generate Character Codex + Recap (AI-enhanced if enabled).
     * Called when user clicks "Generate" in the Reader.
     */
    const generateBonusTools = async () => {
        try {
            setError(null);
            setProgressLabel('Generating Character Codex & Recap…');
            const config = getAIConfig();

            const [newChars, newRecap, newAtmosphere] = await Promise.all([
                enhanceCharacters(rawText, config).catch(() => processCharacters(rawText)),
                enhanceRecap(rawText, config).catch(() => processRecap(rawText)),
                processAtmosphere(rawText).catch(() => null),
            ]);

            setMangaData({ characters: newChars, recap: newRecap, atmosphere: newAtmosphere ?? undefined });
            setProgressLabel('');

            if (currentChapterId) {
                await db.chapters.update(currentChapterId, {
                    characters: newChars,
                    recap: newRecap,
                    atmosphere: newAtmosphere,
                });
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'An error occurred.';
            setErrorAndStop(msg);
        }
    };

    /**
     * On-demand: run the extended AI intelligence suite.
     * Style Analysis + Key Insights + Mood Enhancement.
     */
    const generateIntelligence = async () => {
        try {
            setError(null);
            setProgressLabel('Analysing style & generating insights…');
            const config = getAIConfig();

            const [style, insights, aiMoodDescription] = await Promise.all([
                analyseStyle(rawText, config).catch(() => undefined),
                generateInsights(rawText, config).catch(() => []),
                enhanceMood(rawText, config).catch(() => ''),
            ]);

            // Read analytics via getState() to avoid stale closure
            const currentAnalytics = useStore.getState().analytics;
            const updatedAnalytics = currentAnalytics
                ? { ...currentAnalytics, style, insights, aiMoodDescription }
                : null;

            setMangaData({ analytics: updatedAnalytics });
            setProgressLabel('');

            if (currentChapterId && updatedAnalytics) {
                await db.chapters.update(currentChapterId, { analytics: updatedAnalytics });
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Intelligence generation failed.';
            setErrorAndStop(msg);
        }
    };

    return { compileToManga, generateBonusTools, generateIntelligence };
};
