import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState } from '../types';

export const useStore = create<AppState>()(
    persist(
        (set) => ({
            isProcessing: false,
            progress: 0,
            rawText: '',
            panels: [],
            characters: [],
            recap: null,
            atmosphere: null,
            error: null,
            currentChapterId: null,
            chapterTitle: null,

            // AI Settings Defaults
            aiProvider: 'none',
            geminiKey: '',
            useSearchGrounding: false,
            openAiKey: '',
            anthropicKey: '',
            groqKey: '',
            deepseekKey: '',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'llama3',

            // V16: Progress phase label
            progressLabel: '',

            setProgress: (progress) => set({ progress }),
            setProgressLabel: (progressLabel) => set({ progressLabel }),
            setError: (error) => set({ error }),
            setErrorAndStop: (error) => set({ error, isProcessing: false }),
            setProcessing: (isProcessing) => set({ isProcessing }),
            setRawText: (text: string) => set({ rawText: text }),
            setMangaData: (data: Partial<Pick<AppState, Extract<keyof AppState, 'panels' | 'characters' | 'recap' | 'atmosphere' | 'chapterTitle'>>>) => set(data as Partial<AppState>),
            setCurrentChapterId: (id: number | null) => set({ currentChapterId: id }),
            // setAiConfig can spread because it's a small config sub-object
            setAiConfig: (config) => set(config as Partial<AppState>),

            resetReader: () => set({
                panels: [], characters: [], recap: null, atmosphere: null,
                rawText: '', progress: 0, progressLabel: '', error: null, currentChapterId: null, chapterTitle: null,
            }),
        }),
        {
            name: 'infinity-cn-storage',
            partialize: (state) => ({
                aiProvider: state.aiProvider,
                geminiKey: state.geminiKey,
                useSearchGrounding: state.useSearchGrounding,
                openAiKey: state.openAiKey,
                anthropicKey: state.anthropicKey,
                groqKey: state.groqKey,
                deepseekKey: state.deepseekKey,
                ollamaUrl: state.ollamaUrl,
                ollamaModel: state.ollamaModel,
            }),
        }
    )
);

