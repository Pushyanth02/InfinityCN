"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Brain,
  ChevronLeft,
  ChevronRight,
  Feather,
  Film,
  List,
  MessageSquareQuote,
  Moon,
  RefreshCw,
  Settings2,
  Sparkles,
  Sun,
  Tags,
  Type as TypeIcon,
  Users,
  Send,
  BookHeart,
  Rocket,
  Palette,
  Globe2,
  HelpCircle,
  SpellCheck2,
  ListChecks,
  Lightbulb,
  PenLine,
} from "lucide-react";

import { useNav } from "@/lib/nav-store";
import {
  alternateEnding,
  analyzeCharacters,
  analyzeCriticism,
  analyzeThemes,
  askQuestion,
  continueStory,
  explainSimply,
  fetchScenes,
  generateChapterSummary,
  generateSummary,
  imaginePicture,
  meetCharacters,
  patchDocument,
  quizMe,
  refineChapter,
  retellForKids,
  studyGuide,
  useDocument,
  vocabulary,
  whatIf,
  worldLore,
} from "@/hooks/use-api";
import { useReaderSettings } from "@/hooks/use-reader-settings";
import {
  formatBytes,
  SOURCE_LABELS,
  timeAgo,
  type AiScene,
  type Chapter,
  type ReaderSettings,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { AiMarkdown } from "@/components/ui/ai-markdown";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LemniscateSpinner, LoadingScreen } from "@/components/ui/brand-loader";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ---------- constants ---------- */

interface MoodColor {
  label: string;
  color: string; // oklch string (or CSS var) used for text + chip
}

/**
 * Mood → oklch color mapping for the cinematified scene chips.
 * `narrative` is the neutral fallback used by original (structured) scenes.
 */
const MOOD_COLORS: Record<string, MoodColor> = {
  tense: { label: "Tense", color: "oklch(0.65 0.22 25)" },
  tender: { label: "Tender", color: "oklch(0.70 0.18 350)" },
  eerie: { label: "Eerie", color: "oklch(0.60 0.20 285)" },
  exuberant: { label: "Exuberant", color: "oklch(0.75 0.18 70)" },
  melancholic: { label: "Melancholic", color: "oklch(0.55 0.15 240)" },
  radiant: { label: "Radiant", color: "oklch(0.75 0.15 85)" },
  brooding: { label: "Brooding", color: "oklch(0.45 0.03 260)" },
  narrative: { label: "Narrative", color: "var(--muted-foreground)" },
};

function moodColor(mood?: string | null): MoodColor {
  const key = (mood ?? "").toLowerCase().trim();
  return MOOD_COLORS[key] ?? MOOD_COLORS.narrative;
}

/** Build a translucent background tint from a mood color. */
function moodChipStyle(color: string): React.CSSProperties {
  return {
    color,
    backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
    borderColor: `color-mix(in oklab, ${color} 38%, transparent)`,
  };
}

const ACCENT_SWATCHES: { label: string; value: string }[] = [
  { label: "Gold", value: "#c9a84c" },
  { label: "Indigo", value: "#6366f1" },
  { label: "Rose", value: "#e11d48" },
  { label: "Emerald", value: "#10b981" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Slate", value: "#64748b" },
];

const FONT_OPTIONS: { label: string; value: ReaderSettings["fontFamily"] }[] = [
  { label: "Open Sans", value: "open-sans" },
  { label: "Literata", value: "literata" },
  { label: "Georgia", value: "georgia" },
  { label: "Verdana", value: "verdana" },
  { label: "Bookerly", value: "bookerly" },
  { label: "Garamond", value: "garamond" },
];

const THEME_OPTIONS: {
  label: string;
  value: ReaderSettings["theme"];
  Icon: typeof Sun;
}[] = [
  { label: "Light", value: "light", Icon: Sun },
  { label: "Dark", value: "dark", Icon: Moon },
  { label: "Sepia", value: "sepia", Icon: BookOpen },
];

const ANIM_SPEED_OPTIONS: {
  label: string;
  value: ReaderSettings["animSpeed"];
}[] = [
  { label: "Off", value: "off" },
  { label: "Normal", value: "normal" },
  { label: "Fast", value: "fast" },
  { label: "Slow", value: "slow" },
];

const CONTRAST_OPTIONS: {
  label: string;
  value: ReaderSettings["contrast"];
}[] = [
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
];

interface QaItem {
  id: number;
  question: string;
  answer: string;
  citations: string[];
}

interface CachedChapterSummary {
  summary: string;
  chapterTitle: string;
}

type SummaryScope = "chapter" | "novel";

type AnalysisTabKey =
  | "characters"
  | "criticism"
  | "themes";

/** The three audience modes the AI companion adapts to. */
type AiMode = "story" | "kids" | "study";

/** Tab keys for the creative/educational tools (markdown-rendered results). */
type ToolTabKey =
  // Story Lover
  | "continue"
  | "ending"
  | "world"
  | "scenes"
  // Story Time (kids)
  | "retell"
  | "meet"
  | "whatif"
  | "imagine"
  // Study Buddy
  | "guide"
  | "vocab"
  | "quiz"
  | "explain"
  // Shared
  | "summary"
  | "ask"
  | "characters"
  | "themes"
  | "criticism";

interface QuizState {
  questions: { question: string; options: string[]; answerIndex: number; explanation: string }[];
  scope: string;
  picked: (number | null)[];
  revealed: boolean;
}

/* ---------- small UI helpers ---------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function OptionRow<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid grid-flow-col gap-1 rounded-md border border-border bg-muted/40 p-1"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-sm px-2 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <SectionLabel>{label}</SectionLabel>
        <span className="text-xs tabular-nums text-foreground/80">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        aria-label={label}
      />
    </div>
  );
}

/** Two-button segmented toggle used at the top of the Summary and Scenes tabs. */
function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid w-full grid-cols-2 gap-1 rounded-md border border-border bg-muted/40 p-1"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Shared body for the markdown-rendered tool tabs. Shows a Generate/Regenerate
 * button, a LemniscateSpinner loading state, and the cached result rendered as
 * Markdown (fixes literal "##"/"**" display). Optional `children` slot injects
 * extra controls (e.g. chapter selector, instructions input) above the button.
 */
function AnalysisTabPanel({
  loading,
  cached,
  description,
  loadingLabel,
  onGenerate,
  children,
  generateLabel = "Generate",
  regenerateLabel = "Regenerate",
  icon,
}: {
  loading: boolean;
  cached: string | null;
  description: string;
  loadingLabel: string;
  onGenerate: () => void;
  children?: React.ReactNode;
  generateLabel?: string;
  regenerateLabel?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {children}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{description}</p>
        <Button
          size="sm"
          className="shrink-0 gap-1"
          disabled={loading}
          onClick={onGenerate}
        >
          {loading ? (
            <LemniscateSpinner size={28} />
          ) : cached ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            icon ?? <Sparkles className="h-3.5 w-3.5" />
          )}
          {cached ? regenerateLabel : generateLabel}
        </Button>
      </div>
      {loading && !cached ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-10 text-center">
          <LemniscateSpinner size={56} />
          <p className="text-xs text-muted-foreground">{loadingLabel}</p>
        </div>
      ) : cached ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <AiMarkdown>{cached}</AiMarkdown>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Click <strong>{generateLabel}</strong> to begin.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Effective chunk count for a chapter. If the chapter has been OCR-refined,
 * we split the refined text into ~1200-char chunks at paragraph boundaries.
 * Otherwise we use the parser-produced chunks.
 */
function chapterChunkCount(ch: Chapter | undefined): number {
  if (!ch) return 0;
  if (ch.refinedText) {
    // Split refined text into chunks for focus-mode navigation
    const paras = ch.refinedText.split(/\n{2,}/).filter(Boolean);
    return Math.max(1, Math.ceil(paras.length / 3));
  }
  return ch.chunks.length;
}

/** Split refined text into paragraph groups for rendering. */
function refinedTextGroups(text: string): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const groups: string[] = [];
  for (let i = 0; i < paras.length; i += 3) {
    groups.push(paras.slice(i, i + 3).join("\n\n"));
  }
  return groups;
}

/* ---------- main component ---------- */

export default function ReaderView() {
  const documentId = useNav((s) => s.activeDocumentId);
  const go = useNav((s) => s.go);

  const { doc, content: docContent, loading, error, setDoc, setContent, refresh } = useDocument(documentId);
  const { settings, update } = useReaderSettings();

  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [activeChunkIndex, setActiveChunkIndex] = useState(0);

  const [chapterSheetOpen, setChapterSheetOpen] = useState(false);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>("story");
  const [aiTab, setAiTab] = useState<ToolTabKey>("summary");

  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [sessionMarkedRead, setSessionMarkedRead] = useState(false);

  // --- Summary state (chapter + novel) ---
  const [summaryScope, setSummaryScope] = useState<SummaryScope>("chapter");
  const [summaryChapterIndex, setSummaryChapterIndex] = useState(0);
  const [chapterSummaries, setChapterSummaries] = useState<
    Record<number, CachedChapterSummary>
  >({});
  const [chapterSummaryLoading, setChapterSummaryLoading] = useState<
    number | null
  >(null);
  const [novelSummary, setNovelSummary] = useState<string | null>(null);
  const [novelSummaryLoading, setNovelSummaryLoading] = useState(false);

  // --- Q&A state ---
  const [qaList, setQaList] = useState<QaItem[]>([]);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaInput, setQaInput] = useState("");
  const qaIdRef = useRef(0);

  // --- Scenes state (cinematic scenes, cached server-side) ---
  const [scenes, setScenes] = useState<AiScene[] | null>(null);
  const [scenesFetched, setScenesFetched] = useState(false);
  const [scenesLoading, setScenesLoading] = useState(false);

  // --- Analysis cache for literary tools (characters, themes, criticism) ---
  const [analysisCache, setAnalysisCache] = useState<
    Record<AnalysisTabKey, string | null>
  >({
    characters: null,
    criticism: null,
    themes: null,
  });
  const [analysisLoading, setAnalysisLoading] = useState<AnalysisTabKey | null>(
    null,
  );

  // --- Creative tool caches (Story Lover mode) ---
  const [continueResult, setContinueResult] = useState<string | null>(null);
  const [continueLoading, setContinueLoading] = useState(false);
  const [endingResult, setEndingResult] = useState<string | null>(null);
  const [endingLoading, setEndingLoading] = useState(false);
  const [endingTwist, setEndingTwist] = useState("");
  const [worldResult, setWorldResult] = useState<string | null>(null);
  const [worldLoading, setWorldLoading] = useState(false);

  // --- Story Time (kids) caches ---
  const [retellResult, setRetellResult] = useState<string | null>(null);
  const [retellLoading, setRetellLoading] = useState(false);
  const [retellScope, setRetellScope] = useState<SummaryScope>("chapter");
  const [meetResult, setMeetResult] = useState<string | null>(null);
  const [meetLoading, setMeetLoading] = useState(false);
  const [whatifResult, setWhatifResult] = useState<string | null>(null);
  const [whatifLoading, setWhatifLoading] = useState(false);
  const [imagineResult, setImagineResult] = useState<string | null>(null);
  const [imagineLoading, setImagineLoading] = useState(false);

  // --- Study Buddy caches ---
  const [guideResult, setGuideResult] = useState<string | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideScope, setGuideScope] = useState<SummaryScope>("chapter");
  const [vocabResult, setVocabResult] = useState<string | null>(null);
  const [vocabLoading, setVocabLoading] = useState(false);
  const [vocabScope, setVocabScope] = useState<SummaryScope>("chapter");
  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizScope, setQuizScope] = useState<SummaryScope>("chapter");
  const [explainResult, setExplainResult] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainScope, setExplainScope] = useState<SummaryScope>("chapter");

  // --- Per-chapter OCR refinement state ---
  const [refining, setRefining] = useState(false);
  const [refineTriggered, setRefineTriggered] = useState<Set<number>>(new Set());
  const refineAbortRef = useRef<number | null>(null);

  const content = docContent;
  const chapters: Chapter[] = content?.chapters ?? [];

  const totalChunks = useMemo(
    () => chapters.reduce((acc, ch) => acc + chapterChunkCount(ch), 0),
    [chapters],
  );

  const globalChunkIndex = useMemo(() => {
    let g = 0;
    for (let i = 0; i < currentChapterIndex && i < chapters.length; i++) {
      g += chapterChunkCount(chapters[i]);
    }
    g += activeChunkIndex;
    return g;
  }, [chapters, currentChapterIndex, activeChunkIndex]);

  const readingProgress =
    totalChunks > 0 ? Math.min(1, (globalChunkIndex + 1) / totalChunks) : 0;
  const progressPct = Math.round(readingProgress * 100);

  const currentChapter = chapters[currentChapterIndex];
  const currentChunk = currentChapter?.chunks[activeChunkIndex];

  const isLastChunk =
    chapters.length > 0 &&
    currentChapterIndex === chapters.length - 1 &&
    activeChunkIndex === chapterChunkCount(currentChapter) - 1;
  const isFirstChunk = currentChapterIndex === 0 && activeChunkIndex === 0;

  const bookmarkKey = `${currentChapterIndex}:${activeChunkIndex}`;
  const isBookmarked = bookmarks.has(bookmarkKey);

  /* ---------- initialize position from doc.lastChunkIndex ---------- */
  useEffect(() => {
    if (!doc || chapters.length === 0) return;
    const lastGlobal = Math.max(
      0,
      Math.min(doc.lastChunkIndex ?? 0, totalChunks - 1),
    );
    let chapterIdx = 0;
    let chunkIdx = 0;
    let acc = 0;
    let placed = false;
    for (let i = 0; i < chapters.length; i++) {
      const len = chapterChunkCount(chapters[i]);
      if (acc + len > lastGlobal) {
        chapterIdx = i;
        chunkIdx = lastGlobal - acc;
        placed = true;
        break;
      }
      acc += len;
    }
    if (!placed) {
      chapterIdx = chapters.length - 1;
      chunkIdx = chapterChunkCount(chapters[chapters.length - 1]) - 1;
    }
    setCurrentChapterIndex(chapterIdx);
    setActiveChunkIndex(Math.max(0, chunkIdx));
    // Only on doc open — subsequent changes come from navigation.
  }, [doc?.id]);

  /* ---------- pre-seed novel summary from doc.summary ---------- */
  useEffect(() => {
    if (
      aiSheetOpen &&
      aiTab === "summary" &&
      doc?.summary &&
      novelSummary === null
    ) {
      setNovelSummary(doc.summary);
    }
  }, [aiSheetOpen, aiTab, doc?.summary, novelSummary]);

  /* ---------- auto-load cached scenes when scenes tab opens ---------- */
  // fetchScenes(documentId, false) returns cached scenes if they exist, or an
  // empty array if not. We auto-load on first open of the Scenes tab so any
  // previously-generated cinematic scenes show up immediately.
  useEffect(() => {
    if (!aiSheetOpen || aiTab !== "scenes" || !documentId) return;
    if (scenesFetched || scenes) return;
    let cancelled = false;
    setScenesLoading(true);
    fetchScenes(documentId, false)
      .then((r) => {
        if (cancelled) return;
        setScenes(r.scenes);
        setScenesFetched(true);
      })
      .catch(() => {
        if (cancelled) return;
        setScenes([]);
        setScenesFetched(true);
      })
      .finally(() => {
        if (!cancelled) setScenesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [aiSheetOpen, aiTab, scenesFetched, scenes, documentId]);

  // Clear refining state when chapter changes (the previous chapter's
  // refinement job is abandoned — its result will be ignored via the abort ref)
  useEffect(() => {
    setRefining(false);
    refineAbortRef.current = null;
  }, [currentChapterIndex]);

  /* ---------- per-chapter OCR refinement (background, non-blocking) ----------
   * When a chapter is opened, it renders instantly with raw text. Then this
   * effect triggers OCR refinement in the background. When refinement
   * completes, the chapter's `refinedText` is updated and the reader
   * re-renders with the cleaned text. The refinement is persisted server-side
   * so the chapter is never reprocessed. */
  const currentChapterRefined = currentChapter?.refinedText;
  useEffect(() => {
    if (!documentId || !content || !currentChapter) return;
    const chIdx = currentChapterIndex;

    // Already refined? Skip.
    if (currentChapterRefined) return;
    // Already triggered for this chapter? Skip.
    if (refineTriggered.has(chIdx)) return;

    // Mark as triggered
    setRefineTriggered((prev) => new Set(prev).add(chIdx));
    setRefining(true);
    refineAbortRef.current = chIdx;

    let cancelled = false;
    refineChapter(documentId, chIdx, false)
      .then((result) => {
        if (cancelled || refineAbortRef.current !== chIdx) return;
        if (result.refined && result.refinedText) {
          // Update the chapter's refinedText in local state
          setContent((prev) => {
            if (!prev) return prev;
            const newChapters = prev.chapters.map((ch, i) =>
              i === chIdx ? { ...ch, refinedText: result.refinedText } : ch,
            );
            return { ...prev, chapters: newChapters };
          });
        }
      })
      .catch(() => {
        // Best-effort — silently ignore (rate limits, network errors, etc.)
      })
      .finally(() => {
        if (cancelled || refineAbortRef.current !== chIdx) return;
        setRefining(false);
      });

    // Safety timeout — don't show the indicator for more than 60 seconds
    const safetyTimer = setTimeout(() => {
      if (!cancelled && refineAbortRef.current === chIdx) {
        setRefining(false);
      }
    }, 60_000);

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
  }, [documentId, currentChapterIndex, currentChapterRefined, content, refineTriggered]);

  /* ---------- scroll active chunk into view ---------- */
  const scrollRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      if (!currentChapter) return;
      const el = document.querySelector(
        `.reader-article [data-ordinal="${activeChunkIndex}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [currentChapterIndex, activeChunkIndex, currentChapter]);

  /* ---------- debounced progress patch ---------- */
  // Use refs to avoid a feedback loop: patching updates `doc`, which would
  // otherwise re-fire this effect and patch again.
  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionMarkedReadRef = useRef(false);
  useEffect(() => {
    sessionMarkedReadRef.current = sessionMarkedRead;
  }, [sessionMarkedRead]);
  useEffect(() => {
    if (!documentId || totalChunks === 0) return;
    if (patchTimer.current) clearTimeout(patchTimer.current);
    patchTimer.current = setTimeout(async () => {
      const patch: Partial<{
        readingProgress: number;
        lastChunkIndex: number;
        lastReadAt: string;
      }> = {
        readingProgress,
        lastChunkIndex: globalChunkIndex,
      };
      if (!sessionMarkedReadRef.current) {
        patch.lastReadAt = new Date().toISOString();
        setSessionMarkedRead(true);
      }
      try {
        const updated = await patchDocument(documentId, patch);
        setDoc((prev) => (prev ? { ...prev, ...updated } : prev));
      } catch {
        // ignore network hiccups
      }
    }, 600);
    return () => {
      if (patchTimer.current) clearTimeout(patchTimer.current);
    };
  }, [
    globalChunkIndex,
    readingProgress,
    documentId,
    totalChunks,
    setDoc,
  ]);

  /* ---------- navigation ---------- */
  const nextChunk = useCallback(() => {
    if (!currentChapter || chapters.length === 0) return;
    if (activeChunkIndex < chapterChunkCount(currentChapter) - 1) {
      setActiveChunkIndex((i) => i + 1);
    } else if (currentChapterIndex < chapters.length - 1) {
      setCurrentChapterIndex((i) => i + 1);
      setActiveChunkIndex(0);
    }
    // At the very last chunk: no-op (Finish is an explicit button in the footer).
  }, [
    currentChapter,
    activeChunkIndex,
    currentChapterIndex,
    chapters.length,
  ]);

  const prevChunk = useCallback(() => {
    if (isFirstChunk) return;
    if (activeChunkIndex > 0) {
      setActiveChunkIndex((i) => i - 1);
    } else if (currentChapterIndex > 0) {
      const prev = chapters[currentChapterIndex - 1];
      setCurrentChapterIndex((i) => i - 1);
      setActiveChunkIndex(Math.max(0, chapterChunkCount(prev) - 1));
    }
  }, [activeChunkIndex, currentChapterIndex, chapters, isFirstChunk]);

  const jumpToChapter = useCallback((idx: number) => {
    setCurrentChapterIndex(idx);
    setActiveChunkIndex(0);
    setChapterSheetOpen(false);
  }, []);

  const nextChapter = useCallback(() => {
    if (currentChapterIndex < chapters.length - 1) {
      setCurrentChapterIndex((i) => i + 1);
      setActiveChunkIndex(0);
    }
  }, [currentChapterIndex, chapters.length]);

  const prevChapter = useCallback(() => {
    if (currentChapterIndex > 0) {
      setCurrentChapterIndex((i) => i - 1);
      setActiveChunkIndex(0);
    }
  }, [currentChapterIndex]);

  const finish = useCallback(async () => {
    if (!documentId) return;
    try {
      const updated = await patchDocument(documentId, {
        readingProgress: 1,
        lastChunkIndex: globalChunkIndex,
        lastReadAt: new Date().toISOString(),
      });
      setDoc(updated);
      toast.success("🎉 Finished!");
    } catch {
      // ignore
    }
  }, [documentId, globalChunkIndex, setDoc]);

  /* ---------- keyboard navigation ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "ArrowRight" || (e.key === " " && !isTyping)) {
        e.preventDefault();
        nextChunk();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevChunk();
      } else if ((e.key === "f" || e.key === "F") && !isTyping) {
        e.preventDefault();
        update({ focusMode: !settings.focusMode });
      } else if (e.key === "Escape") {
        setChapterSheetOpen(false);
        setSettingsSheetOpen(false);
        setAiSheetOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextChunk, prevChunk, settings.focusMode, update]);

  /* ---------- open AI panel: default summary chapter to current ---------- */
  const openAiPanel = useCallback(() => {
    setSummaryChapterIndex(currentChapterIndex);
    setAiSheetOpen(true);
  }, [currentChapterIndex]);

  /* ---------- AI handlers ---------- */
  const handleGenerateChapterSummary = useCallback(
    async (chapterIndex: number, regenerate: boolean) => {
      if (!documentId) return;
      setChapterSummaryLoading(chapterIndex);
      try {
        const { summary, chapterTitle } = await generateChapterSummary(
          documentId,
          chapterIndex,
          regenerate,
        );
        setChapterSummaries((prev) => ({
          ...prev,
          [chapterIndex]: { summary, chapterTitle },
        }));
        toast.success(
          regenerate ? "Chapter summary regenerated" : "Chapter summary generated",
        );
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Failed to generate chapter summary",
        );
      } finally {
        setChapterSummaryLoading(null);
      }
    },
    [documentId],
  );

  const handleGenerateNovelSummary = useCallback(
    async (regenerate: boolean) => {
      if (!documentId) return;
      setNovelSummaryLoading(true);
      try {
        const { summary } = await generateSummary(documentId, regenerate);
        setNovelSummary(summary);
        setDoc((d) => (d ? { ...d, summary } : d));
        toast.success(
          regenerate ? "Novel summary regenerated" : "Novel summary generated",
        );
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Failed to generate novel summary",
        );
      } finally {
        setNovelSummaryLoading(false);
      }
    },
    [documentId, setDoc],
  );

  const handleAsk = useCallback(async () => {
    if (!documentId || !qaInput.trim() || qaLoading) return;
    const question = qaInput.trim();
    setQaInput("");
    setQaLoading(true);
    const id = ++qaIdRef.current;
    try {
      const { answer, citations } = await askQuestion(documentId, question);
      setQaList((list) => [{ id, question, answer, citations }, ...list]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to answer");
    } finally {
      setQaLoading(false);
    }
  }, [documentId, qaInput, qaLoading]);

  const handleFetchScenes = useCallback(
    async (regenerate: boolean) => {
      if (!documentId) return;
      setScenesLoading(true);
      try {
        const { scenes: fetched } = await fetchScenes(documentId, regenerate);
        setScenes(fetched);
        setScenesFetched(true);
        toast.success(regenerate ? "Scenes regenerated" : "Scenes generated");
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Failed to generate scenes",
        );
      } finally {
        setScenesLoading(false);
      }
    },
    [documentId],
  );

  // Generic analysis handler for the literary analysis tabs (Characters,
  // Criticism, Themes). Caches the result so switching tabs and coming back
  // doesn't lose the analysis.
  const handleAnalysis = useCallback(
    async (tab: AnalysisTabKey, fn: () => Promise<{ analysis: string }>) => {
      if (!documentId) return;
      setAnalysisLoading(tab);
      try {
        const result = await fn();
        setAnalysisCache((prev) => ({ ...prev, [tab]: result.analysis }));
      } catch {
        /* ignore — best-effort, non-blocking */
      } finally {
        setAnalysisLoading(null);
      }
    },
    [documentId],
  );

  /* ---------- Creative tool handlers (Story Lover) ---------- */
  const handleContinueStory = useCallback(async () => {
    if (!documentId) return;
    setContinueLoading(true);
    try {
      const { continuation } = await continueStory(documentId, summaryChapterIndex);
      setContinueResult(continuation);
      toast.success("Continuation written");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to continue the story");
    } finally {
      setContinueLoading(false);
    }
  }, [documentId, summaryChapterIndex]);

  const handleAlternateEnding = useCallback(async () => {
    if (!documentId) return;
    setEndingLoading(true);
    try {
      const { ending } = await alternateEnding(documentId, endingTwist);
      setEndingResult(ending);
      toast.success("Alternate ending written");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to write an alternate ending");
    } finally {
      setEndingLoading(false);
    }
  }, [documentId, endingTwist]);

  const handleWorldLore = useCallback(async () => {
    if (!documentId) return;
    setWorldLoading(true);
    try {
      const { lore } = await worldLore(documentId);
      setWorldResult(lore);
      toast.success("World & lore expanded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to expand the world");
    } finally {
      setWorldLoading(false);
    }
  }, [documentId]);

  /* ---------- Story Time handlers (kids) ---------- */
  const handleRetell = useCallback(async () => {
    if (!documentId) return;
    setRetellLoading(true);
    try {
      const { story } = await retellForKids(
        documentId,
        retellScope === "chapter" ? summaryChapterIndex : undefined,
      );
      setRetellResult(story);
      toast.success("Story retold for kids");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to retell the story");
    } finally {
      setRetellLoading(false);
    }
  }, [documentId, retellScope, summaryChapterIndex]);

  const handleMeet = useCallback(async () => {
    if (!documentId) return;
    setMeetLoading(true);
    try {
      const { intro } = await meetCharacters(documentId);
      setMeetResult(intro);
      toast.success("Characters introduced");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to introduce characters");
    } finally {
      setMeetLoading(false);
    }
  }, [documentId]);

  const handleWhatIf = useCallback(async () => {
    if (!documentId) return;
    setWhatifLoading(true);
    try {
      const { scenarios } = await whatIf(documentId);
      setWhatifResult(scenarios);
      toast.success("What-if scenarios ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invent scenarios");
    } finally {
      setWhatifLoading(false);
    }
  }, [documentId]);

  const handleImagine = useCallback(async () => {
    if (!documentId) return;
    setImagineLoading(true);
    try {
      const { prompts } = await imaginePicture(documentId);
      setImagineResult(prompts);
      toast.success("Picture prompts ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to imagine the picture");
    } finally {
      setImagineLoading(false);
    }
  }, [documentId]);

  /* ---------- Study Buddy handlers ---------- */
  const handleStudyGuide = useCallback(async () => {
    if (!documentId) return;
    setGuideLoading(true);
    try {
      const { guide } = await studyGuide(
        documentId,
        guideScope === "chapter" ? summaryChapterIndex : undefined,
      );
      setGuideResult(guide);
      toast.success("Study guide ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to build the study guide");
    } finally {
      setGuideLoading(false);
    }
  }, [documentId, guideScope, summaryChapterIndex]);

  const handleVocabulary = useCallback(async () => {
    if (!documentId) return;
    setVocabLoading(true);
    try {
      const { vocabulary: vocab } = await vocabulary(
        documentId,
        vocabScope === "chapter" ? summaryChapterIndex : undefined,
      );
      setVocabResult(vocab);
      toast.success("Vocabulary list ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to extract vocabulary");
    } finally {
      setVocabLoading(false);
    }
  }, [documentId, vocabScope, summaryChapterIndex]);

  const handleQuiz = useCallback(async () => {
    if (!documentId) return;
    setQuizLoading(true);
    try {
      const { questions, scope } = await quizMe(
        documentId,
        quizScope === "chapter" ? summaryChapterIndex : undefined,
      );
      setQuizState({
        questions,
        scope,
        picked: questions.map(() => null),
        revealed: false,
      });
      toast.success("Quiz ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate the quiz");
    } finally {
      setQuizLoading(false);
    }
  }, [documentId, quizScope, summaryChapterIndex]);

  const handleExplain = useCallback(async () => {
    if (!documentId) return;
    setExplainLoading(true);
    try {
      const { explanation } = await explainSimply(
        documentId,
        explainScope === "chapter" ? summaryChapterIndex : undefined,
      );
      setExplainResult(explanation);
      toast.success("Explanation ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to explain simply");
    } finally {
      setExplainLoading(false);
    }
  }, [documentId, explainScope, summaryChapterIndex]);

  const toggleBookmark = useCallback(() => {
    if (!currentChapter) return;
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(bookmarkKey)) {
        next.delete(bookmarkKey);
        toast("Bookmark removed");
      } else {
        next.add(bookmarkKey);
        toast.success("Bookmarked this chunk");
      }
      return next;
    });
  }, [bookmarkKey, currentChapter]);

  /* ---------- early returns ---------- */
  if (!documentId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <BookOpen className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-lg font-medium">No document selected</p>
        <Button onClick={() => go("library")}>Open library</Button>
      </div>
    );
  }

  if (loading) {
    return <LoadingScreen label="Opening document" className="min-h-dvh" />;
  }

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <div className="max-w-md rounded-lg border border-border bg-card p-6 text-left">
          <p className="text-lg font-medium">Couldn&apos;t open this document</p>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" onClick={() => go("library")}>
            Back to library
          </Button>
        </div>
      </div>
    );
  }

  if (!doc) return null;

  if (doc.status === "processing") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <LemniscateSpinner size={72} />
        <p className="text-lg font-medium">Still processing</p>
        <p className="text-sm text-muted-foreground">
          Check back in a moment — we&apos;re parsing this file.
        </p>
        <Button variant="outline" onClick={() => go("library")}>
          Back to library
        </Button>
      </div>
    );
  }

  if (doc.status === "error" || chapters.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <div className="max-w-md rounded-lg border border-border bg-card p-6 text-left">
          <p className="text-lg font-medium">
            {doc.status === "error"
              ? "This document failed to parse"
              : "No readable content yet"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {doc.error ?? "Try re-uploading the file."}
          </p>
          <Button className="mt-4" onClick={() => go("library")}>
            Back to library
          </Button>
        </div>
      </div>
    );
  }

  /* ---------- main render ---------- */

  const sourceLabel = SOURCE_LABELS[doc.sourceType] ?? "DOC";

  // Resolve the currently-relevant summary view-model.
  const activeChapterSummary =
    chapterSummaries[summaryChapterIndex] ?? null;
  const isChapterSummaryLoading =
    chapterSummaryLoading === summaryChapterIndex;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* ---- ReaderHeader ---- */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          {/* Left: back */}
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => go("library")}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Library</span>
            </Button>
          </div>

          {/* Center: title + meta */}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-2 text-center">
            <p className="line-clamp-1 max-w-md text-sm font-medium text-foreground">
              {doc.title}
            </p>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="rounded-full border border-border px-1.5 py-px text-[10px] uppercase tracking-wider">
                {sourceLabel}
              </span>
              {doc.author ? (
                <span className="line-clamp-1">{doc.author}</span>
              ) : null}
              {doc.author && doc.lastReadAt ? (
                <span aria-hidden className="text-border">
                  ·
                </span>
              ) : null}
              {doc.lastReadAt ? (
                <span className="line-clamp-1">read {timeAgo(doc.lastReadAt)}</span>
              ) : null}
            </span>
          </div>

          {/* Right: actions — 4 icon buttons (5 total with back) */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="Chapter index"
              onClick={() => setChapterSheetOpen(true)}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="AI panel"
              onClick={openAiPanel}
            >
              <Sparkles className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="Reader settings"
              onClick={() => setSettingsSheetOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-9 w-9", isBookmarked && "text-foreground")}
              aria-label={
                isBookmarked ? "Remove bookmark" : "Bookmark this chunk"
              }
              aria-pressed={isBookmarked}
              onClick={toggleBookmark}
            >
              <Bookmark
                className={cn("h-4 w-4", isBookmarked && "fill-current")}
              />
            </Button>
          </div>
        </div>
      </header>

      {/* ---- ReaderProgress ---- */}
      <div
        className="sticky top-[calc(2.5rem+1px)] z-20 h-0.5 w-full bg-border/40"
        aria-hidden
      >
        <div
          className="h-full bg-gradient-to-r from-amber-500/40 via-amber-400 to-amber-600/80 transition-[width] duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* ---- OCR refinement indicator (subtle, non-blocking) ---- */}
      {refining && (
        <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-md backdrop-blur">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          Refining OCR…
        </div>
      )}

      {/* ---- Main reading column ---- */}
      <main className="mx-auto max-w-3xl px-6 py-10">
        {/* ChapterNav */}
        <section className="mb-8" aria-label="Chapter navigation">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground hover:text-foreground"
              disabled={currentChapterIndex === 0}
              onClick={prevChapter}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Prev chapter</span>
            </Button>
            <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Chapter {(currentChapter?.ordinal ?? currentChapterIndex) + 1} of{" "}
                {chapters.length}
              </p>
              <p className="line-clamp-1 max-w-[18rem] text-xs text-foreground/70 sm:max-w-sm">
                {currentChapter?.title ?? "Untitled"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground hover:text-foreground"
              disabled={currentChapterIndex === chapters.length - 1}
              onClick={nextChapter}
            >
              <span className="hidden sm:inline">Next chapter</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <h1
            key={currentChapterIndex}
            className="reader-chapter-heading mt-4 text-left font-display text-2xl leading-tight text-foreground sm:text-3xl"
          >
            {currentChapter?.title ?? "Untitled"}
          </h1>
          <div
            className="mt-2 h-px w-full bg-gradient-to-r from-border via-border/40 to-transparent"
            aria-hidden
          />
        </section>

        {/* Article */}
        {currentChapter &&
        (currentChapter.refinedText || currentChapter.chunks.length > 0) ? (
          <article
            className="reader-article mx-auto space-y-6 text-foreground"
            data-focus={settings.focusMode ? "true" : "false"}
            data-reading-width
          >
            {currentChapter.refinedText
              ? (() => {
                  const groups = refinedTextGroups(currentChapter.refinedText);
                  const groupCount = groups.length;
                  return groups.map((text, i) => {
                    const isActive = i === activeChunkIndex;
                    const paragraphs = text
                      .split(/\n{2,}/)
                      .map((p) => p.trim())
                      .filter(Boolean);
                    return (
                      <div
                        key={`rf-${i}`}
                        data-ordinal={i}
                        data-active={isActive ? "true" : "false"}
                        className={cn(
                          "reader-chunk cursor-pointer rounded-lg py-1",
                          !settings.focusMode && isActive && "bg-muted/20",
                        )}
                        onClick={() => setActiveChunkIndex(i)}
                        role="article"
                        aria-label={`Section ${i + 1} of ${groupCount}`}
                      >
                        {paragraphs.map((p, j) => (
                          <p
                            key={j}
                            className={cn(
                              "whitespace-pre-wrap leading-[var(--pref-line-height)]",
                              j < paragraphs.length - 1 && "mb-5",
                            )}
                            style={{
                              textIndent: j > 0 ? "1.5em" : undefined,
                            }}
                          >
                            {p}
                          </p>
                        ))}
                      </div>
                    );
                  });
                })()
              : currentChapter.chunks.map((chunk, i) => {
                const paragraphs = chunk.text
                  .split(/\n{2,}/)
                  .map((p) => p.trim())
                  .filter(Boolean);
                const isActive = i === activeChunkIndex;
                return (
                  <div
                    key={chunk.index ?? i}
                    data-ordinal={i}
                    data-active={isActive ? "true" : "false"}
                    className={cn(
                      "reader-chunk cursor-pointer rounded-lg py-1",
                      !settings.focusMode && isActive && "bg-muted/20",
                    )}
                    onClick={() => setActiveChunkIndex(i)}
                    role="article"
                    aria-label={`Section ${i + 1} of ${currentChapter.chunks.length}`}
                  >
                    {paragraphs.length > 1 ? (
                      paragraphs.map((p, j) => (
                        <p
                          key={j}
                          className={cn(
                            "whitespace-pre-wrap leading-[var(--pref-line-height)]",
                            j < paragraphs.length - 1 && "mb-5",
                          )}
                          style={{
                            textIndent: j > 0 ? "1.5em" : undefined,
                          }}
                        >
                          {p}
                        </p>
                      ))
                    ) : (
                      <p className="whitespace-pre-wrap leading-[var(--pref-line-height)]">
                        {paragraphs[0] ?? ""}
                      </p>
                    )}
                  </div>
                );
              })}
          </article>
        ) : (
          <p className="mx-auto max-w-prose text-center text-sm text-muted-foreground">
            This chapter has no readable content.
          </p>
        )}

        {/* FooterNav */}
        <footer
          className="mt-12 flex flex-col gap-4 border-t border-border pt-6"
          aria-label="Chunk navigation"
        >
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={isFirstChunk}
              onClick={prevChunk}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Prev</span>
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              {totalChunks > 0 ? (
                <>
                  Section{" "}
                  <span className="tabular-nums">{globalChunkIndex + 1}</span> of{" "}
                  <span className="tabular-nums">{totalChunks}</span>
                  <span className="mx-2 text-border">·</span>
                  <span className="tabular-nums">{progressPct}%</span> read
                </>
              ) : null}
            </p>

            {isLastChunk ? (
              <Button size="sm" className="gap-1" onClick={finish}>
                Finish
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={nextChunk}
              >
                <span className="hidden sm:inline">Next</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Progress value={progressPct} className="h-1" />
        </footer>
      </main>

      {/* ---- Side panels ---- */}

      {/* Chapter index sheet */}
      <Sheet open={chapterSheetOpen} onOpenChange={setChapterSheetOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-sm"
          aria-describedby={undefined}
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 font-display text-xl">
              <List className="h-4 w-4" />
              Chapters
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              {chapters.length} chapter{chapters.length === 1 ? "" : "s"} ·{" "}
              {totalChunks} chunks
            </p>
          </SheetHeader>
          <div className="max-h-[calc(100dvh-7rem)] overflow-y-auto px-2 pb-6">
            <ol className="space-y-1">
              {chapters.map((ch, i) => {
                const active = i === currentChapterIndex;
                return (
                  <li key={ch.id ?? i}>
                    <button
                      type="button"
                      onClick={() => jumpToChapter(i)}
                      className={cn(
                        "group flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                        active
                          ? "border-foreground/20 bg-muted/60"
                          : "border-transparent hover:bg-muted/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                          active
                            ? "bg-foreground text-background"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {(ch.ordinal ?? i) + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "line-clamp-2 block text-sm font-medium",
                            active ? "text-foreground" : "text-foreground/90",
                          )}
                        >
                          {ch.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {chapterChunkCount(ch)} chunk
                          {chapterChunkCount(ch) === 1 ? "" : "s"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </SheetContent>
      </Sheet>

      {/* Settings sheet */}
      <Sheet open={settingsSheetOpen} onOpenChange={setSettingsSheetOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-sm"
          aria-describedby={undefined}
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 font-display text-xl">
              <Settings2 className="h-4 w-4" />
              Reader settings
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Adjust typography, theme, and reading width.
            </p>
          </SheetHeader>

          <div className="space-y-6 px-4 pb-10">
            {/* Typography */}
            <section className="space-y-4">
              <SectionLabel>Typography</SectionLabel>

              <div className="space-y-1.5">
                <SectionLabel>Font family</SectionLabel>
                <OptionRow
                  options={FONT_OPTIONS}
                  value={settings.fontFamily}
                  onChange={(v) => update({ fontFamily: v })}
                  ariaLabel="Font family"
                />
              </div>

              <SliderRow
                label="Font size"
                value={settings.fontSize}
                display={`${settings.fontSize}px`}
                min={14}
                max={28}
                step={1}
                onChange={(v) => update({ fontSize: v })}
              />

              <SliderRow
                label="Line height"
                value={settings.lineHeight}
                display={settings.lineHeight.toFixed(1)}
                min={1.3}
                max={2}
                step={0.1}
                onChange={(v) => update({ lineHeight: v })}
              />

              <SliderRow
                label="Letter spacing"
                value={settings.letterSpacing}
                display={`${settings.letterSpacing.toFixed(2)}em`}
                min={-0.02}
                max={0.05}
                step={0.01}
                onChange={(v) => update({ letterSpacing: v })}
              />

              <SliderRow
                label="Reading width"
                value={settings.readingWidth}
                display={`${settings.readingWidth}ch`}
                min={50}
                max={90}
                step={1}
                onChange={(v) => update({ readingWidth: v })}
              />
            </section>

            {/* Theme */}
            <section className="space-y-3">
              <SectionLabel>Theme</SectionLabel>
              <div className="grid grid-cols-3 gap-2">
                {THEME_OPTIONS.map((opt) => {
                  const active = settings.theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update({ theme: opt.value })}
                      aria-pressed={active}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-md border px-2 py-3 text-xs font-medium transition-colors",
                        active
                          ? "border-foreground/30 bg-muted/60 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <opt.Icon className="h-4 w-4" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Accent */}
            <section className="space-y-3">
              <SectionLabel>Accent color</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {ACCENT_SWATCHES.map((sw) => {
                  const active =
                    settings.accent.toLowerCase() === sw.value.toLowerCase();
                  return (
                    <button
                      key={sw.value}
                      type="button"
                      onClick={() => update({ accent: sw.value })}
                      aria-label={`Accent: ${sw.label}`}
                      aria-pressed={active}
                      className={cn(
                        "relative h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
                        active
                          ? "border-foreground"
                          : "border-transparent",
                      )}
                      style={{ backgroundColor: sw.value }}
                    >
                      {active ? (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white mix-blend-difference">
                          ✓
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Reading behavior — focus mode lives here now */}
            <section className="space-y-3">
              <SectionLabel>Reading behavior</SectionLabel>
              <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm">
                  <TypeIcon className="h-4 w-4 text-muted-foreground" />
                  Focus mode
                </span>
                <Switch
                  checked={settings.focusMode}
                  onCheckedChange={(v) => update({ focusMode: v })}
                  aria-label="Toggle focus mode"
                />
              </label>
              <p className="text-[11px] text-muted-foreground">
                Dims surrounding paragraphs so you can read one chunk at a time.
                Press <kbd className="rounded border border-border px-1">F</kbd>{" "}
                to toggle.
              </p>
            </section>

            {/* Motion & contrast */}
            <section className="space-y-4">
              <SectionLabel>Motion &amp; contrast</SectionLabel>
              <div className="space-y-1.5">
                <SectionLabel>Animation speed</SectionLabel>
                <OptionRow
                  options={ANIM_SPEED_OPTIONS}
                  value={settings.animSpeed}
                  onChange={(v) => update({ animSpeed: v })}
                  ariaLabel="Animation speed"
                />
              </div>
              <div className="space-y-1.5">
                <SectionLabel>Contrast</SectionLabel>
                <OptionRow
                  options={CONTRAST_OPTIONS}
                  value={settings.contrast}
                  onChange={(v) => update({ contrast: v })}
                  ariaLabel="Contrast"
                />
              </div>
            </section>

            {/* Keyboard hints */}
            <section className="space-y-3">
              <SectionLabel>Keyboard</SectionLabel>
              <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
                <span className="text-sm">Show keyboard hints</span>
                <Switch
                  checked={settings.kbdHints}
                  onCheckedChange={(v) => update({ kbdHints: v })}
                  aria-label="Toggle keyboard hints"
                />
              </label>
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                <li>
                  <kbd className="rounded border border-border px-1">→</kbd>{" "}
                  / <kbd className="rounded border border-border px-1">Space</kbd>{" "}
                  — next chunk
                </li>
                <li>
                  <kbd className="rounded border border-border px-1">←</kbd> —
                  previous chunk
                </li>
                <li>
                  <kbd className="rounded border border-border px-1">F</kbd> —
                  toggle focus mode
                </li>
                <li>
                  <kbd className="rounded border border-border px-1">Esc</kbd> —
                  close panels
                </li>
              </ul>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      {/* AI sheet — Summary / Ask / Scenes */}
      <Sheet open={aiSheetOpen} onOpenChange={setAiSheetOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-md"
          aria-describedby={undefined}
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 font-display text-xl">
              <Sparkles className="h-4 w-4" />
              AI companion
            </SheetTitle>
            <p className="line-clamp-1 text-xs text-muted-foreground">
              {doc.title} · {formatBytes(doc.byteSize)}
            </p>
          </SheetHeader>

          {/* ── Audience mode selector ── */}
          <div className="px-4 pt-2">
            <SegmentedToggle<AiMode>
              ariaLabel="AI companion mode"
              options={[
                { label: "Story Lover", value: "story" },
                { label: "Story Time", value: "kids" },
                { label: "Study Buddy", value: "study" },
              ]}
              value={aiMode}
              onChange={(m) => {
                setAiMode(m);
                // Pick a sensible default tab per mode.
                if (m === "story") setAiTab("summary");
                else if (m === "kids") setAiTab("retell");
                else setAiTab("guide");
              }}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {aiMode === "story" &&
                "For novel readers — expand the story, meet its people, and reimagine its turns."}
              {aiMode === "kids" &&
                "For young imaginations — cozy retellings, friendly faces, and things to draw."}
              {aiMode === "study" &&
                "For students — study guides, vocabulary, quizzes, and plain-language explanations."}
            </p>
          </div>

          <Tabs
            value={aiTab}
            onValueChange={(v) => setAiTab(v as ToolTabKey)}
            className="flex flex-1 flex-col px-4 pb-6"
          >
            <TabsList className="flex h-auto w-full gap-1 overflow-x-auto p-1">
              {aiMode === "story" && (
                <>
                  <TabsTrigger value="summary" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <Sparkles className="h-3.5 w-3.5" /> Summary
                  </TabsTrigger>
                  <TabsTrigger value="characters" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <Users className="h-3.5 w-3.5" /> Characters
                  </TabsTrigger>
                  <TabsTrigger value="themes" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <Tags className="h-3.5 w-3.5" /> Themes
                  </TabsTrigger>
                  <TabsTrigger value="criticism" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <Feather className="h-3.5 w-3.5" /> Criticism
                  </TabsTrigger>
                  <TabsTrigger value="scenes" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <Film className="h-3.5 w-3.5" /> Scenes
                  </TabsTrigger>
                  <TabsTrigger value="continue" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <PenLine className="h-3.5 w-3.5" /> Continue
                  </TabsTrigger>
                  <TabsTrigger value="ending" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <Rocket className="h-3.5 w-3.5" /> Alt Ending
                  </TabsTrigger>
                  <TabsTrigger value="world" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <Globe2 className="h-3.5 w-3.5" /> World
                  </TabsTrigger>
                  <TabsTrigger value="ask" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <MessageSquareQuote className="h-3.5 w-3.5" /> Ask
                  </TabsTrigger>
                </>
              )}
              {aiMode === "kids" && (
                <>
                  <TabsTrigger value="retell" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <BookHeart className="h-3.5 w-3.5" /> Retell
                  </TabsTrigger>
                  <TabsTrigger value="meet" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <Users className="h-3.5 w-3.5" /> Meet
                  </TabsTrigger>
                  <TabsTrigger value="whatif" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <HelpCircle className="h-3.5 w-3.5" /> What If?
                  </TabsTrigger>
                  <TabsTrigger value="imagine" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <Palette className="h-3.5 w-3.5" /> Imagine
                  </TabsTrigger>
                  <TabsTrigger value="ask" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <MessageSquareQuote className="h-3.5 w-3.5" /> Ask
                  </TabsTrigger>
                </>
              )}
              {aiMode === "study" && (
                <>
                  <TabsTrigger value="guide" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <ListChecks className="h-3.5 w-3.5" /> Study Guide
                  </TabsTrigger>
                  <TabsTrigger value="vocab" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <SpellCheck2 className="h-3.5 w-3.5" /> Vocabulary
                  </TabsTrigger>
                  <TabsTrigger value="quiz" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <Brain className="h-3.5 w-3.5" /> Quiz
                  </TabsTrigger>
                  <TabsTrigger value="explain" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <Lightbulb className="h-3.5 w-3.5" /> Explain
                  </TabsTrigger>
                  <TabsTrigger value="summary" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <Sparkles className="h-3.5 w-3.5" /> Summary
                  </TabsTrigger>
                  <TabsTrigger value="ask" className="shrink-0 gap-1 px-2 py-1 text-xs">
                    <MessageSquareQuote className="h-3.5 w-3.5" /> Ask
                  </TabsTrigger>
                </>
              )}
            </TabsList>

            {/* ───────── Summary tab (shared by story + study) ───────── */}
            <TabsContent value="summary" className="mt-4 space-y-4">
              <SegmentedToggle<SummaryScope>
                ariaLabel="Summary scope"
                options={[
                  { label: "Chapter", value: "chapter" },
                  { label: "Novel", value: "novel" },
                ]}
                value={summaryScope}
                onChange={setSummaryScope}
              />

              {summaryScope === "chapter" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <SectionLabel>Chapter</SectionLabel>
                    <Select
                      value={String(summaryChapterIndex)}
                      onValueChange={(v) => setSummaryChapterIndex(Number(v))}
                    >
                      <SelectTrigger className="w-full" aria-label="Select chapter">
                        <SelectValue placeholder="Select a chapter" />
                      </SelectTrigger>
                      <SelectContent>
                        {chapters.map((ch, i) => (
                          <SelectItem key={ch.id ?? i} value={String(i)}>
                            Chapter {(ch.ordinal ?? i) + 1}: {ch.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {activeChapterSummary
                        ? "Summary cached — regenerate to refresh."
                        : "Generate a tight summary of this chapter."}
                    </p>
                    <Button
                      size="sm"
                      className="shrink-0 gap-1"
                      disabled={isChapterSummaryLoading}
                      onClick={() =>
                        handleGenerateChapterSummary(
                          summaryChapterIndex,
                          Boolean(activeChapterSummary),
                        )
                      }
                    >
                      {isChapterSummaryLoading ? (
                        <LemniscateSpinner size={28} />
                      ) : activeChapterSummary ? (
                        <RefreshCw className="h-3.5 w-3.5" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {activeChapterSummary ? "Regenerate" : "Generate"}
                    </Button>
                  </div>

                  {isChapterSummaryLoading && !activeChapterSummary ? (
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-10 text-center">
                      <LemniscateSpinner size={56} />
                      <p className="text-xs text-muted-foreground">
                        Reading this chapter…
                      </p>
                    </div>
                  ) : activeChapterSummary ? (
                    <blockquote className="rounded-lg border-l-2 border-foreground/30 bg-muted/30 p-4">
                      <p className="mb-2 font-display text-sm font-medium text-foreground">
                        {activeChapterSummary.chapterTitle}
                      </p>
                      <AiMarkdown>{activeChapterSummary.summary}</AiMarkdown>
                    </blockquote>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        No chapter summary yet. Click{" "}
                        <strong>Generate</strong> to create one.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {novelSummary
                        ? "Novel summary cached — regenerate to refresh."
                        : "Generate a summary of the entire document."}
                    </p>
                    <Button
                      size="sm"
                      className="shrink-0 gap-1"
                      disabled={novelSummaryLoading}
                      onClick={() =>
                        handleGenerateNovelSummary(Boolean(novelSummary))
                      }
                    >
                      {novelSummaryLoading ? (
                        <LemniscateSpinner size={28} />
                      ) : novelSummary ? (
                        <RefreshCw className="h-3.5 w-3.5" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {novelSummary ? "Regenerate" : "Generate"}
                    </Button>
                  </div>

                  {novelSummaryLoading && !novelSummary ? (
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-10 text-center">
                      <LemniscateSpinner size={56} />
                      <p className="text-xs text-muted-foreground">
                        Reading through the document…
                      </p>
                    </div>
                  ) : novelSummary ? (
                    <blockquote className="rounded-lg border-l-2 border-foreground/30 bg-muted/30 p-4">
                      <p className="mb-2 font-display text-sm font-medium text-foreground">
                        {doc.title}
                      </p>
                      <AiMarkdown>{novelSummary}</AiMarkdown>
                    </blockquote>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        No novel summary yet. Click{" "}
                        <strong>Generate</strong> to create one.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ───────── Characters tab ───────── */}
            <TabsContent value="characters" className="mt-4">
              <AnalysisTabPanel
                loading={analysisLoading === "characters"}
                cached={analysisCache.characters}
                description="Assess personality traits, motivations, and relationships."
                loadingLabel="Analyzing characters…"
                onGenerate={() =>
                  handleAnalysis("characters", () => analyzeCharacters(documentId))
                }
                icon={<Users className="h-3.5 w-3.5" />}
              />
            </TabsContent>

            {/* ───────── Themes tab ───────── */}
            <TabsContent value="themes" className="mt-4">
              <AnalysisTabPanel
                loading={analysisLoading === "themes"}
                cached={analysisCache.themes}
                description="Identify and categorize the central ideas of the text."
                loadingLabel="Extracting themes…"
                onGenerate={() =>
                  handleAnalysis("themes", () => analyzeThemes(documentId))
                }
                icon={<Tags className="h-3.5 w-3.5" />}
              />
            </TabsContent>

            {/* ───────── Criticism tab ───────── */}
            <TabsContent value="criticism" className="mt-4">
              <AnalysisTabPanel
                loading={analysisLoading === "criticism"}
                cached={analysisCache.criticism}
                description="Evaluate style, symbolism, and authorial intent."
                loadingLabel="Applying literary criticism…"
                onGenerate={() =>
                  handleAnalysis("criticism", () => analyzeCriticism(documentId))
                }
                icon={<Feather className="h-3.5 w-3.5" />}
              />
            </TabsContent>

            {/* ───────── Scenes tab ───────── */}
            <TabsContent value="scenes" className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {scenes && scenes.length > 0
                    ? "Cinematic scene cards — mood, beats, and cast."
                    : "Turn prose into a sequence of cinematic scene cards."}
                </p>
                <Button
                  size="sm"
                  className="shrink-0 gap-1"
                  disabled={scenesLoading}
                  onClick={() =>
                    handleFetchScenes(Boolean(scenes && scenes.length > 0))
                  }
                >
                  {scenesLoading ? (
                    <LemniscateSpinner size={28} />
                  ) : scenes && scenes.length > 0 ? (
                    <RefreshCw className="h-3.5 w-3.5" />
                  ) : (
                    <Film className="h-3.5 w-3.5" />
                  )}
                  {scenes && scenes.length > 0 ? "Regenerate" : "Generate scenes"}
                </Button>
              </div>

              {!scenesFetched ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-10 text-center">
                  <LemniscateSpinner size={48} />
                  <p className="text-xs text-muted-foreground">
                    Loading cached scenes…
                  </p>
                </div>
              ) : scenesLoading && (!scenes || scenes.length === 0) ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-10 text-center">
                  <LemniscateSpinner size={56} />
                  <p className="text-xs text-muted-foreground">
                    Adapting the prose into scenes…
                  </p>
                </div>
              ) : scenes && scenes.length > 0 ? (
                <ol className="space-y-3">
                  {scenes.map((sc) => {
                    const mood = moodColor(sc.mood);
                    const characters = sc.characters ?? [];
                    return (
                      <li
                        key={sc.id ?? sc.ordinal}
                        className="rounded-lg border border-border bg-card p-4"
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold tabular-nums text-background">
                            {sc.ordinal + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-display text-lg leading-tight text-foreground">
                              {sc.title}
                            </h4>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {sc.mood ? (
                                <span
                                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
                                  style={moodChipStyle(mood.color)}
                                >
                                  {mood.label}
                                </span>
                              ) : null}
                              {characters.map((c, j) => (
                                <span
                                  key={j}
                                  className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                            <div className="mt-3">
                              <AiMarkdown>{sc.body}</AiMarkdown>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    No scenes yet. Click <strong>Generate scenes</strong> to
                    begin.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* ───────── Continue the Story tab (Story Lover) ───────── */}
            <TabsContent value="continue" className="mt-4">
              <AnalysisTabPanel
                loading={continueLoading}
                cached={continueResult}
                description="Let the AI write the next passage in the author's voice."
                loadingLabel="Writing the next passage…"
                onGenerate={handleContinueStory}
                generateLabel="Continue"
                regenerateLabel="Regenerate"
                icon={<PenLine className="h-3.5 w-3.5" />}
              >
                <div className="space-y-1.5">
                  <SectionLabel>Chapter to continue from</SectionLabel>
                  <Select
                    value={String(summaryChapterIndex)}
                    onValueChange={(v) => setSummaryChapterIndex(Number(v))}
                  >
                    <SelectTrigger className="w-full" aria-label="Select chapter to continue">
                      <SelectValue placeholder="Select a chapter" />
                    </SelectTrigger>
                    <SelectContent>
                      {chapters.map((ch, i) => (
                        <SelectItem key={ch.id ?? i} value={String(i)}>
                          Chapter {(ch.ordinal ?? i) + 1}: {ch.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </AnalysisTabPanel>
            </TabsContent>

            {/* ───────── Alternate Ending tab (Story Lover) ───────── */}
            <TabsContent value="ending" className="mt-4">
              <AnalysisTabPanel
                loading={endingLoading}
                cached={endingResult}
                description="Reimagine how the story could end — add a twist if you like."
                loadingLabel="Writing an alternate ending…"
                onGenerate={handleAlternateEnding}
                generateLabel="Write ending"
                regenerateLabel="Regenerate"
                icon={<Rocket className="h-3.5 w-3.5" />}
              >
                <div className="space-y-1.5">
                  <SectionLabel>Optional twist to honor</SectionLabel>
                  <Input
                    value={endingTwist}
                    onChange={(e) => setEndingTwist(e.target.value)}
                    placeholder="e.g., the hero changes their mind, it was all a dream"
                    disabled={endingLoading}
                  />
                </div>
              </AnalysisTabPanel>
            </TabsContent>

            {/* ───────── World & Lore tab (Story Lover) ───────── */}
            <TabsContent value="world" className="mt-4">
              <AnalysisTabPanel
                loading={worldLoading}
                cached={worldResult}
                description="Expand the setting, history, and rules of the story's world."
                loadingLabel="Building the world…"
                onGenerate={handleWorldLore}
                generateLabel="Expand"
                regenerateLabel="Regenerate"
                icon={<Globe2 className="h-3.5 w-3.5" />}
              />
            </TabsContent>

            {/* ───────── Retell for Kids tab (Story Time) ───────── */}
            <TabsContent value="retell" className="mt-4">
              <AnalysisTabPanel
                loading={retellLoading}
                cached={retellResult}
                description="A warm, wonder-filled retelling for a young reader."
                loadingLabel="Retelling the story…"
                onGenerate={handleRetell}
                generateLabel="Retell"
                regenerateLabel="Retell again"
                icon={<BookHeart className="h-3.5 w-3.5" />}
              >
                <SegmentedToggle<SummaryScope>
                  ariaLabel="Retell scope"
                  options={[
                    { label: "This chapter", value: "chapter" },
                    { label: "Whole story", value: "novel" },
                  ]}
                  value={retellScope}
                  onChange={setRetellScope}
                />
                {retellScope === "chapter" && (
                  <div className="space-y-1.5">
                    <SectionLabel>Chapter</SectionLabel>
                    <Select
                      value={String(summaryChapterIndex)}
                      onValueChange={(v) => setSummaryChapterIndex(Number(v))}
                    >
                      <SelectTrigger className="w-full" aria-label="Select chapter to retell">
                        <SelectValue placeholder="Select a chapter" />
                      </SelectTrigger>
                      <SelectContent>
                        {chapters.map((ch, i) => (
                          <SelectItem key={ch.id ?? i} value={String(i)}>
                            Chapter {(ch.ordinal ?? i) + 1}: {ch.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </AnalysisTabPanel>
            </TabsContent>

            {/* ───────── Meet the Characters tab (Story Time) ───────── */}
            <TabsContent value="meet" className="mt-4">
              <AnalysisTabPanel
                loading={meetLoading}
                cached={meetResult}
                description="Friendly, vivid introductions to the people of the story."
                loadingLabel="Introducing the characters…"
                onGenerate={handleMeet}
                generateLabel="Meet them"
                regenerateLabel="Regenerate"
                icon={<Users className="h-3.5 w-3.5" />}
              />
            </TabsContent>

            {/* ───────── What If? tab (Story Time) ───────── */}
            <TabsContent value="whatif" className="mt-4">
              <AnalysisTabPanel
                loading={whatifLoading}
                cached={whatifResult}
                description="Playful hypothetical twists that spark imagination."
                loadingLabel="Inventing what-ifs…"
                onGenerate={handleWhatIf}
                generateLabel="Invent"
                regenerateLabel="Invent again"
                icon={<HelpCircle className="h-3.5 w-3.5" />}
              />
            </TabsContent>

            {/* ───────── Imagine the Picture tab (Story Time) ───────── */}
            <TabsContent value="imagine" className="mt-4">
              <AnalysisTabPanel
                loading={imagineLoading}
                cached={imagineResult}
                description="Vivid scene descriptions a child could illustrate."
                loadingLabel="Painting picture prompts…"
                onGenerate={handleImagine}
                generateLabel="Imagine"
                regenerateLabel="Regenerate"
                icon={<Palette className="h-3.5 w-3.5" />}
              />
            </TabsContent>

            {/* ───────── Study Guide tab (Study Buddy) ───────── */}
            <TabsContent value="guide" className="mt-4">
              <AnalysisTabPanel
                loading={guideLoading}
                cached={guideResult}
                description="Key points, themes, terms, and discussion questions."
                loadingLabel="Building the study guide…"
                onGenerate={handleStudyGuide}
                generateLabel="Build guide"
                regenerateLabel="Regenerate"
                icon={<ListChecks className="h-3.5 w-3.5" />}
              >
                <SegmentedToggle<SummaryScope>
                  ariaLabel="Study guide scope"
                  options={[
                    { label: "This chapter", value: "chapter" },
                    { label: "Whole text", value: "novel" },
                  ]}
                  value={guideScope}
                  onChange={setGuideScope}
                />
                {guideScope === "chapter" && (
                  <div className="space-y-1.5">
                    <SectionLabel>Chapter</SectionLabel>
                    <Select
                      value={String(summaryChapterIndex)}
                      onValueChange={(v) => setSummaryChapterIndex(Number(v))}
                    >
                      <SelectTrigger className="w-full" aria-label="Select chapter">
                        <SelectValue placeholder="Select a chapter" />
                      </SelectTrigger>
                      <SelectContent>
                        {chapters.map((ch, i) => (
                          <SelectItem key={ch.id ?? i} value={String(i)}>
                            Chapter {(ch.ordinal ?? i) + 1}: {ch.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </AnalysisTabPanel>
            </TabsContent>

            {/* ───────── Vocabulary tab (Study Buddy) ───────── */}
            <TabsContent value="vocab" className="mt-4">
              <AnalysisTabPanel
                loading={vocabLoading}
                cached={vocabResult}
                description="Definitions of the challenging and notable words in the text."
                loadingLabel="Gathering vocabulary…"
                onGenerate={handleVocabulary}
                generateLabel="List words"
                regenerateLabel="Regenerate"
                icon={<SpellCheck2 className="h-3.5 w-3.5" />}
              >
                <SegmentedToggle<SummaryScope>
                  ariaLabel="Vocabulary scope"
                  options={[
                    { label: "This chapter", value: "chapter" },
                    { label: "Whole text", value: "novel" },
                  ]}
                  value={vocabScope}
                  onChange={setVocabScope}
                />
                {vocabScope === "chapter" && (
                  <div className="space-y-1.5">
                    <SectionLabel>Chapter</SectionLabel>
                    <Select
                      value={String(summaryChapterIndex)}
                      onValueChange={(v) => setSummaryChapterIndex(Number(v))}
                    >
                      <SelectTrigger className="w-full" aria-label="Select chapter">
                        <SelectValue placeholder="Select a chapter" />
                      </SelectTrigger>
                      <SelectContent>
                        {chapters.map((ch, i) => (
                          <SelectItem key={ch.id ?? i} value={String(i)}>
                            Chapter {(ch.ordinal ?? i) + 1}: {ch.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </AnalysisTabPanel>
            </TabsContent>

            {/* ───────── Quiz tab (Study Buddy) ───────── */}
            <TabsContent value="quiz" className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {quizState
                    ? `${quizState.questions.length} questions — ${quizState.scope}.`
                    : "Generate multiple-choice comprehension questions."}
                </p>
                <div className="flex items-center gap-2">
                  {quizState && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() =>
                        setQuizState((q) =>
                          q
                            ? { ...q, picked: q.questions.map(() => null), revealed: false }
                            : null,
                        )
                      }
                    >
                      Reset
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="shrink-0 gap-1"
                    disabled={quizLoading}
                    onClick={handleQuiz}
                  >
                    {quizLoading ? (
                      <LemniscateSpinner size={28} />
                    ) : quizState ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : (
                      <Brain className="h-3.5 w-3.5" />
                    )}
                    {quizState ? "Regenerate" : "New quiz"}
                  </Button>
                </div>
              </div>

              <SegmentedToggle<SummaryScope>
                ariaLabel="Quiz scope"
                options={[
                  { label: "This chapter", value: "chapter" },
                  { label: "Whole text", value: "novel" },
                ]}
                value={quizScope}
                onChange={setQuizScope}
              />
              {quizScope === "chapter" && (
                <div className="space-y-1.5">
                  <SectionLabel>Chapter</SectionLabel>
                  <Select
                    value={String(summaryChapterIndex)}
                    onValueChange={(v) => setSummaryChapterIndex(Number(v))}
                  >
                    <SelectTrigger className="w-full" aria-label="Select chapter">
                      <SelectValue placeholder="Select a chapter" />
                    </SelectTrigger>
                    <SelectContent>
                      {chapters.map((ch, i) => (
                        <SelectItem key={ch.id ?? i} value={String(i)}>
                          Chapter {(ch.ordinal ?? i) + 1}: {ch.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {quizLoading && !quizState ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-10 text-center">
                  <LemniscateSpinner size={56} />
                  <p className="text-xs text-muted-foreground">Writing questions…</p>
                </div>
              ) : quizState ? (
                <ol className="space-y-4">
                  {quizState.questions.map((q, qi) => {
                    const picked = quizState.picked[qi];
                    return (
                      <li key={qi} className="rounded-lg border border-border bg-card p-4">
                        <p className="mb-3 text-sm font-medium text-foreground">
                          <span className="mr-1.5 text-muted-foreground">{qi + 1}.</span>
                          {q.question}
                        </p>
                        <div className="space-y-1.5">
                          {q.options.map((opt, oi) => {
                            const isPicked = picked === oi;
                            const isCorrect = q.answerIndex === oi;
                            const showState = quizState.revealed || picked !== null;
                            return (
                              <button
                                key={oi}
                                type="button"
                                disabled={quizState.revealed}
                                onClick={() =>
                                  setQuizState((s) =>
                                    s
                                      ? {
                                          ...s,
                                          picked: s.picked.map((p, i) =>
                                            i === qi ? oi : p,
                                          ),
                                        }
                                      : s,
                                  )
                                }
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                                  !showState &&
                                    "border-border hover:bg-muted/40",
                                  showState &&
                                    isCorrect &&
                                    "border-emerald-500/60 bg-emerald-500/10 text-foreground",
                                  showState &&
                                    isPicked &&
                                    !isCorrect &&
                                    "border-rose-500/60 bg-rose-500/10 text-foreground",
                                  showState &&
                                    !isCorrect &&
                                    !isPicked &&
                                    "border-border text-muted-foreground",
                                )}
                              >
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-medium">
                                  {String.fromCharCode(65 + oi)}
                                </span>
                                <span className="flex-1">{opt}</span>
                                {showState && isCorrect && (
                                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                    correct
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {quizState.revealed && q.explanation && (
                          <p className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs italic text-muted-foreground">
                            {q.explanation}
                          </p>
                        )}
                      </li>
                    );
                  })}
                  {!quizState.revealed &&
                    quizState.picked.every((p) => p !== null) && (
                      <Button
                        className="w-full"
                        onClick={() =>
                          setQuizState((s) => (s ? { ...s, revealed: true } : s))
                        }
                      >
                        Reveal answers
                      </Button>
                    )}
                  {quizState.revealed && (
                    <p className="text-center text-sm text-muted-foreground">
                      You scored{" "}
                      <span className="font-semibold text-foreground">
                        {
                          quizState.picked.filter(
                            (p, i) => p === quizState.questions[i].answerIndex,
                          ).length
                        }
                        /{quizState.questions.length}
                      </span>
                      .
                    </p>
                  )}
                </ol>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    No quiz yet. Click <strong>New quiz</strong> to begin.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* ───────── Explain Simply tab (Study Buddy) ───────── */}
            <TabsContent value="explain" className="mt-4">
              <AnalysisTabPanel
                loading={explainLoading}
                cached={explainResult}
                description="Restate the text in plain, friendly language."
                loadingLabel="Explaining simply…"
                onGenerate={handleExplain}
                generateLabel="Explain"
                regenerateLabel="Regenerate"
                icon={<Lightbulb className="h-3.5 w-3.5" />}
              >
                <SegmentedToggle<SummaryScope>
                  ariaLabel="Explain scope"
                  options={[
                    { label: "This chapter", value: "chapter" },
                    { label: "Whole text", value: "novel" },
                  ]}
                  value={explainScope}
                  onChange={setExplainScope}
                />
                {explainScope === "chapter" && (
                  <div className="space-y-1.5">
                    <SectionLabel>Chapter</SectionLabel>
                    <Select
                      value={String(summaryChapterIndex)}
                      onValueChange={(v) => setSummaryChapterIndex(Number(v))}
                    >
                      <SelectTrigger className="w-full" aria-label="Select chapter">
                        <SelectValue placeholder="Select a chapter" />
                      </SelectTrigger>
                      <SelectContent>
                        {chapters.map((ch, i) => (
                          <SelectItem key={ch.id ?? i} value={String(i)}>
                            Chapter {(ch.ordinal ?? i) + 1}: {ch.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </AnalysisTabPanel>
            </TabsContent>

            {/* ───────── Ask tab (shared) ───────── */}
            <TabsContent value="ask" className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  value={qaInput}
                  onChange={(e) => setQaInput(e.target.value)}
                  placeholder="Ask anything about this document…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAsk();
                    }
                  }}
                  disabled={qaLoading}
                  className="flex-1"
                />
                <Button
                  size="icon"
                  onClick={handleAsk}
                  disabled={qaLoading || !qaInput.trim()}
                  aria-label="Send question"
                >
                  {qaLoading ? (
                    <LemniscateSpinner size={28} />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {qaLoading && qaList.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-10 text-center">
                  <LemniscateSpinner size={56} />
                  <p className="text-xs text-muted-foreground">
                    Searching the text for an answer…
                  </p>
                </div>
              ) : qaList.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Ask a question and Lemniscate will answer using the
                    document&apos;s text.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {qaList.map((item) => (
                    <div key={item.id} className="space-y-2">
                      <div className="rounded-md bg-muted/40 px-3 py-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Q
                        </p>
                        <p className="text-sm text-foreground">
                          {item.question}
                        </p>
                      </div>
                      <blockquote className="rounded-md border-l-2 border-foreground/30 bg-muted/20 py-2 pl-3 pr-2">
                        <AiMarkdown>{item.answer}</AiMarkdown>
                      </blockquote>
                      {item.citations.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">
                            Cited:
                          </span>
                          {item.citations.map((c, j) => (
                            <span
                              key={j}
                              className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  );
}
