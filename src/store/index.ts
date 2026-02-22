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
            analytics: null,
            error: null,
            currentChapterId: null,

            // AI Settings
            aiProvider: 'none',
            geminiKey: '',
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'llama3',

            // V16: Progress phase label
            progressLabel: '',

            setProgress: (progress) => set({ progress }),
            setProgressLabel: (progressLabel) => set({ progressLabel }),
            setError: (error) => set({ error }),
            setErrorAndStop: (error) => set({ error, isProcessing: false }),
            setProcessing: (isProcessing) => set({ isProcessing }),
            setRawText: (rawText) => set({ rawText }),
            // Zustand shallow-merges by default — no need to spread state
            setMangaData: (data) => set(data as Partial<AppState>),
            setCurrentChapterId: (id) => set({ currentChapterId: id }),
            // setAiConfig can spread because it's a small config sub-object
            setAiConfig: (config) => set(config as Partial<AppState>),

            resetReader: () => set({
                panels: [], characters: [], recap: null, atmosphere: null,
                analytics: null, rawText: '', progress: 0, progressLabel: '', error: null, currentChapterId: null,
            }),
        }),
        {
            name: 'infinity-cn-storage',
            partialize: (state) => ({
                aiProvider: state.aiProvider,
                geminiKey: state.geminiKey,
                ollamaUrl: state.ollamaUrl,
                ollamaModel: state.ollamaModel,
            }),
        }
    )
);

