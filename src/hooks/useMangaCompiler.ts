import { extractTextFromPDF } from '../lib/pdfWorker';
import { processTextToManga, processCharacters, processAtmosphere } from '../lib/parser';
import { enhanceCharacters } from '../lib/ai';
import { computeChapterInsights } from '../lib/narrativeEngine';
import { useStore, getAIConfig } from '../store';
import { db } from '../lib/db';

// ── Atomic store selectors (avoids subscribing to all state) ──
const sel = {
    rawText: (s: ReturnType<typeof useStore.getState>) => s.rawText,
    chapterId: (s: ReturnType<typeof useStore.getState>) => s.currentChapterId,
    setProcessing: (s: ReturnType<typeof useStore.getState>) => s.setProcessing,
    setProgress: (s: ReturnType<typeof useStore.getState>) => s.setProgress,
    setProgressLabel: (s: ReturnType<typeof useStore.getState>) => s.setProgressLabel,
    setRawText: (s: ReturnType<typeof useStore.getState>) => s.setRawText,
    setMangaData: (s: ReturnType<typeof useStore.getState>) => s.setMangaData,
    setError: (s: ReturnType<typeof useStore.getState>) => s.setError,
    setErrorAndStop: (s: ReturnType<typeof useStore.getState>) => s.setErrorAndStop,
    setChapterId: (s: ReturnType<typeof useStore.getState>) => s.setCurrentChapterId,
};

export const useMangaCompiler = () => {
    // Atomic selectors — each component only re-renders when its specific slice changes
    const rawText = useStore(sel.rawText);
    const currentChapterId = useStore(sel.chapterId);

    const setProcessing = useStore(sel.setProcessing);
    const setProgress = useStore(sel.setProgress);
    const setProgressLabel = useStore(sel.setProgressLabel);
    const setRawText = useStore(sel.setRawText);
    const setMangaData = useStore(sel.setMangaData);
    const setError = useStore(sel.setError);
    const setErrorAndStop = useStore(sel.setErrorAndStop);
    const setChapterId = useStore(sel.setChapterId);

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
                setErrorAndStop(
                    `File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is 50 MB.`,
                );
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
            const newPanels = await processTextToManga(text, p =>
                setProgress(Math.max(15, Math.round(p * 0.55))),
            );
            setProgress(72);

            // Phase 3: Atmosphere + Insights (parallel)
            setProgressLabel('Analysing atmosphere & insights…');
            const [atmosphere, insights] = await Promise.all([
                processAtmosphere(text),
                Promise.resolve(computeChapterInsights(text, newPanels)),
            ]);

            // Basic title extraction (first non-empty line or "Chapter X")
            const lines = text
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0);
            let parsedTitle = file.name.replace(/\.[^/.]+$/, '');
            if (lines.length > 0) {
                const firstLine = lines[0];
                if (firstLine.length < 50) {
                    parsedTitle = firstLine;
                }
            }

            setProgress(90);

            // Phase 4: Save to IndexedDB
            setProgressLabel('Saving to library…');
            const chapterId = await db.chapters.add({
                title: parsedTitle,
                createdAt: Date.now(),
                panels: newPanels,
                characters: [],
                recap: insights.extractiveRecap || null,
                atmosphere,
                insights,
                rawText: text,
            });
            setChapterId(chapterId as number);

            // Phase 5: Commit to store
            setMangaData({
                panels: newPanels,
                atmosphere,
                insights,
                chapterTitle: parsedTitle,
                recap: insights.extractiveRecap || null,
            });
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
            const panels = useStore.getState().panels;

            const [newChars, newAtmosphere, insights] = await Promise.all([
                enhanceCharacters(rawText, config).catch(() => processCharacters(rawText)),
                processAtmosphere(rawText).catch(() => null),
                Promise.resolve(computeChapterInsights(rawText, panels)),
            ]);

            const recap = insights.extractiveRecap || null;
            setMangaData({
                characters: newChars,
                recap,
                atmosphere: newAtmosphere ?? undefined,
                insights,
            });
            setProgressLabel('');

            if (currentChapterId) {
                await db.chapters.update(currentChapterId, {
                    characters: newChars,
                    recap,
                    atmosphere: newAtmosphere,
                    insights,
                });
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'An error occurred.';
            setErrorAndStop(msg);
        }
    };

    return { compileToManga, generateBonusTools };
};
