import React, { useState, useCallback, lazy, Suspense } from 'react';
import { Upload } from './components/Upload';
import { ThemeStudio } from './components/ThemeStudio';
import { useMangaCompiler } from './hooks/useMangaCompiler';
import { useStore } from './store';
import { db } from './lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Clock, Sparkles } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import './App.css';

const AI_LABELS: Record<string, string> = { none: 'Setup AI', chrome: 'Nano', gemini: 'Gemini', ollama: 'Ollama', openai: 'OpenAI', anthropic: 'Claude', groq: 'Groq', deepseek: 'DeepSeek' };

// ── Module-level store selectors (stable refs, no inline closures) ──
const sel = {
  panels: (s: ReturnType<typeof useStore.getState>) => s.panels,
  characters: (s: ReturnType<typeof useStore.getState>) => s.characters,
  recap: (s: ReturnType<typeof useStore.getState>) => s.recap,
  atmosphere: (s: ReturnType<typeof useStore.getState>) => s.atmosphere,
  error: (s: ReturnType<typeof useStore.getState>) => s.error,
  isProcessing: (s: ReturnType<typeof useStore.getState>) => s.isProcessing,
  progress: (s: ReturnType<typeof useStore.getState>) => s.progress,
  progressLabel: (s: ReturnType<typeof useStore.getState>) => s.progressLabel,
  resetReader: (s: ReturnType<typeof useStore.getState>) => s.resetReader,
  setMangaData: (s: ReturnType<typeof useStore.getState>) => s.setMangaData,
  setRawText: (s: ReturnType<typeof useStore.getState>) => s.setRawText,
  setCurrentChapterId: (s: ReturnType<typeof useStore.getState>) => s.setCurrentChapterId,
  aiProvider: (s: ReturnType<typeof useStore.getState>) => s.aiProvider,
};

// Heavy components lazy-loaded — only download when actually needed
const Reader = lazy(() => import('./components/Reader').then(m => ({ default: m.Reader })));
const AISettings = lazy(() => import('./components/AISettings').then(m => ({ default: m.AISettings })));

// ── LIBRARY CARD ──────────────────────────────────────────────────────────────

interface LibraryCardProps {
  chapter: { id?: number; title?: string; createdAt: number; panels: unknown[]; atmosphere?: { mood: string } | null };
  index: number;
  onLoad: (id: number) => void;
  onDelete: (e: React.MouseEvent | React.KeyboardEvent, id: number) => void;
}

const LibraryCard: React.FC<LibraryCardProps> = ({ chapter, index, onLoad, onDelete }) => (
  <motion.li
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.5, delay: 1 + index * 0.07 }}
    className="library-card"
    role="button"
    tabIndex={0}
    aria-label={`Load chapter: ${chapter.title || 'Untitled Fragment'}`}
    onClick={() => chapter.id && onLoad(chapter.id)}
    onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && chapter.id) { e.preventDefault(); onLoad(chapter.id); } }}
  >
    <div className="library-card-index" aria-hidden="true">
      {String(index + 1).padStart(2, '0')}
    </div>
    <div className="library-card-title">{chapter.title || 'Untitled Fragment'}</div>
    <div className="library-card-meta">
      <span className="library-card-tag library-card-tag--date">
        <Clock size={10} aria-hidden="true" />
        {new Date(chapter.createdAt).toLocaleDateString()}
      </span>
      <span className="library-card-tag">{(chapter.panels as unknown[]).length} panels</span>
      {chapter.atmosphere && (
        <span className="library-card-tag library-card-tag--mood">
          {chapter.atmosphere.mood.replace(/_/g, ' ')}
        </span>
      )}
    </div>
    <button
      className="library-card-delete"
      onClick={e => chapter.id && onDelete(e, chapter.id)}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && chapter.id) { e.preventDefault(); onDelete(e, chapter.id); } }}
      title="Delete chapter"
      aria-label={`Delete chapter: ${chapter.title || 'Untitled Fragment'}`}
    >
      <Trash2 size={14} aria-hidden="true" />
    </button>
  </motion.li>
);

const MemoLibraryCard = React.memo(LibraryCard);
MemoLibraryCard.displayName = 'LibraryCard';

// ── APP ROOT ──────────────────────────────────────────────────────────────────

function App() {
  const panels = useStore(sel.panels);
  const characters = useStore(sel.characters);
  const recap = useStore(sel.recap);
  const atmosphere = useStore(sel.atmosphere);
  const insights = useStore(s => s.insights);
  const chapterTitle = useStore(s => s.chapterTitle);
  const error = useStore(sel.error);
  const isProcessing = useStore(sel.isProcessing);
  const progress = useStore(sel.progress);
  const progressLabel = useStore(sel.progressLabel);
  const resetReader = useStore(sel.resetReader);
  const setPanels = useStore(sel.setMangaData);
  const setRawText = useStore(sel.setRawText);
  const setChapter = useStore(sel.setCurrentChapterId);
  const aiProvider = useStore(sel.aiProvider);

  const { compileToManga, generateBonusTools } = useMangaCompiler();
  const [isGeneratingBonus, setIsGeneratingBonus] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);

  const savedChapters = useLiveQuery(() => db.chapters.orderBy('createdAt').reverse().toArray());

  const loadChapter = useCallback((id: number) => {
    db.chapters.get(id).then(chapter => {
      if (!chapter) return;
      setPanels({
        panels: chapter.panels,
        characters: chapter.characters,
        recap: chapter.recap,
        atmosphere: chapter.atmosphere,
        chapterTitle: chapter.title,
        insights: chapter.insights ?? null,
      });
      setRawText(chapter.rawText);
      setChapter(id);
    });
  }, [setPanels, setRawText, setChapter]);

  const deleteChapter = useCallback(async (e: React.MouseEvent | React.KeyboardEvent, id: number) => {
    e.stopPropagation();
    await db.chapters.delete(id);
  }, []);

  const handleGenerateBonus = useCallback(async () => {
    setIsGeneratingBonus(true);
    try { await generateBonusTools(); }
    finally { setIsGeneratingBonus(false); }
  }, [generateBonusTools]);



  const aiLabel = AI_LABELS[aiProvider] || 'AI Off';
  const hasReader = panels.length > 0;

  return (
    <div className="app-container">
      {/* Skip navigation (accessibility) */}
      <a href="#main-content" className="skip-to-content">Skip to content</a>

      {/* ── FLOATING HEADER ── */}
      <header className="app-header-floating" role="banner">
        <div className="header-island">
          <h1 className="logo font-display">InfinityCN</h1>
          <div className="header-actions">
            <div className="ai-trigger-container">
              <button
                className="ai-trigger-button"
                onClick={() => setIsAIOpen(true)}
                aria-label={`AI Settings: ${aiLabel}`}
                aria-expanded={isAIOpen ? "true" : "false"}
                aria-haspopup="dialog"
                title="AI Settings"
              >
                <Sparkles size={16} strokeWidth={2.5} className="ai-trigger-icon" aria-hidden="true" />
                <span className={`ai-trigger-label ai-trigger-label--${aiProvider}`}>{aiLabel}</span>
              </button>
              <div className={`ai-trigger-indicator ai-trigger-indicator--${aiProvider}`} />
            </div>
            <ThemeStudio />
          </div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="app-main" id="main-content" role="main">
        {error && (
          <div className="error-banner" role="alert" aria-live="polite">
            ⚠ {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {hasReader ? (
            <motion.div key="reader" className="reader-wrapper" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
              <Suspense fallback={
                <div className="reader-loading">
                  <div className="skeleton-block skeleton-block-title" />
                  <div className="skeleton-block skeleton-block-subtitle" />
                  <div className="skeleton-block skeleton-block-main" />
                </div>
              }>
                <Reader
                  panels={panels}
                  characters={characters}
                  recap={recap}
                  atmosphere={atmosphere}
                  insights={insights}
                  chapterTitle={chapterTitle}
                  onClose={resetReader}
                  onGenerateBonus={handleGenerateBonus}
                  isGeneratingBonus={isGeneratingBonus}
                />
              </Suspense>
            </motion.div>
          ) : (
            <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} className="landing-view">

              {/* ── HERO ── */}
              <div className="hero-section">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.15 }} className="hero-eyebrow">
                  Offline-First &bull; AI-Enhanced
                </motion.div>
                <motion.h2 className="hero-title font-display" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}>
                  Every Word
                  <span className="line-two">Reimagined.</span>
                </motion.h2>
                <motion.p className="hero-subtitle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.55 }}>
                  Drop a novel PDF or TXT and experience it in breathtaking, cinematic typography. Powered by local and on-device AI for intelligent codexes, recaps, and mood enhancement.
                </motion.p>
              </div>

              {/* ── UPLOAD ── */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.7 }}>
                <Upload onFileSelect={compileToManga} isLoading={isProcessing} />

                {isProcessing && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="progress-container" role="status" aria-live="polite" aria-label={`Processing: ${progress}%`}>
                    <div className="progress-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                      <motion.div className="progress-fill" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ ease: 'easeOut' }} style={{ '--progress-pct': `${progress}%` } as React.CSSProperties} />
                    </div>
                    <motion.span className="progress-label" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }}>
                      {progress}% — {progressLabel || 'Processing…'}
                    </motion.span>
                  </motion.div>
                )}
              </motion.div>

              {/* ── LIBRARY ── */}
              {savedChapters && savedChapters.length > 0 && !isProcessing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.9 }} className="library-section">
                  <div className="library-section-header">
                    <span className="library-section-title">Your Fragments</span>
                    <span className="library-section-count" aria-label={`${savedChapters.length} saved chapters`}>{savedChapters.length}</span>
                  </div>
                  <ul role="list" className="library-list">
                    {savedChapters.map((chapter, index) => (
                      <MemoLibraryCard key={chapter.id} chapter={chapter} index={index} onLoad={loadChapter} onDelete={deleteChapter} />
                    ))}
                  </ul>
                </motion.div>
              )}

            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── FOOTER ── */}
      {!hasReader && (
        <footer className="app-footer" role="contentinfo">
          <span className="app-footer-brand">InfinityCN — AI-Enhanced Reader</span>
          <span className="app-footer-version">v16.0 / optimised</span>
        </footer>
      )}

      {/* ── MODALS ── */}
      {isAIOpen && (
        <Suspense fallback={null}>
          <AISettings isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} />
        </Suspense>
      )}
      <Analytics />
      <SpeedInsights />
    </div>
  );
}

export default App;
