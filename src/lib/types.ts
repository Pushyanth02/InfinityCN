/** Shared domain types for Lemniscate. No `any` — keep the contract explicit. */

export type SourceType =
  | "pdf"
  | "epub"
  | "docx"
  | "pptx"
  | "markdown"
  | "txt"
  | "html";
export type DocumentStatus = "processing" | "ready" | "error";
export type BotId = "luma" | "ouro" | "ankaa";

export type ChunkKind = "p" | "h";
export interface Chunk {
  id: string;
  kind: ChunkKind;
  text: string;
}

export interface Chapter {
  id: string;
  title: string;
  /** global index of this chapter's first chunk */
  startChunk: number;
  chunks: Chunk[];
}

export interface QualityReport {
  score: number;
  notes: string[];
}

export interface ParsedDoc {
  title: string;
  author: string;
  language: string;
  sourceType: SourceType;
  chapters: Chapter[];
  wordCount: number;
  charCount: number;
  quality: QualityReport;
  warnings: string[];
}

export interface DocumentRow {
  id: string;
  userId: string;
  title: string;
  author: string;
  sourceType: SourceType;
  mimeType: string;
  byteSize: number;
  status: DocumentStatus;
  error: string | null;
  warnings: string[];
  summary: string | null;
  language: string;
  coverGradient: string;
  contentJson: { chapters: Chapter[] };
  chapterCount: number;
  wordCount: number;
  charCount: number;
  createdAt: number;
  updatedAt: number;
  lastReadAt: number | null;
  readingProgress: number; // 0..100
  lastChunkIndex: number;
  favorite: boolean;
  tags: string[];
  collection: string | null;
}

export interface BookmarkRow {
  id: string;
  userId: string;
  documentId: string;
  chunkIndex: number;
  label: string;
  note: string;
  createdAt: number;
}

export type AnnotationColor = "gold" | "ouro" | "ankaa" | "ok";
export interface AnnotationRow {
  id: string;
  userId: string;
  documentId: string;
  chunkIndex: number;
  start: number;
  end: number;
  text: string;
  note: string;
  color: AnnotationColor;
  createdAt: number;
}

export type ActivityType =
  | "upload"
  | "read"
  | "bookmark"
  | "annotation"
  | "summary"
  | "scenes"
  | "delete"
  | "favorite"
  | "story"
  | "analyze"
  | "finish";

export interface ActivityRow {
  id: string;
  userId: string;
  documentId: string | null;
  type: ActivityType;
  detail: string;
  createdAt: number;
}

export interface AiSceneRow {
  id: string;
  userId: string;
  documentId: string;
  chapterIndex: number;
  ordinal: number;
  title: string;
  body: string;
  mood: string;
  characters: string[];
  createdAt: number;
}

export interface UsageRow {
  id: string;
  userId: string;
  bot: BotId;
  documentId: string | null;
  kind: string;
  estTokens: number;
  latencyMs: number;
  status: "ok" | "error" | "offline";
  createdAt: number;
}

export interface DeepAnalysis {
  summary: string;
  themes: { name: string; note: string }[];
  characters: { name: string; note: string }[];
  criticism: string;
}

export interface AnalysisJob {
  id: string;
  documentId: string;
  userId: string;
  status: "queued" | "running" | "done" | "failed";
  step: string;
  progress: number; // 0..100
  etaSec: number | null;
  results: DeepAnalysis | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  /* optional metadata for the background job tray */
  label?: string;
  bot?: BotId;
  words?: number;
  /** live writing rate (words / minute) — populated when `words > 0`. */
  wordsPerMinute?: number | null;
}

export type AnkaaMode =
  | "continue"
  | "alternate"
  | "chapter"
  | "lore"
  | "children"
  | "whatif";
export interface StoryRow {
  id: string;
  userId: string;
  title: string;
  mode: AnkaaMode;
  body: string;
  sourceDocumentId: string | null;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  step: string;
  error: string | null;
  createdAt: number;
}

/** Book-reading faces: Literata & Spectral & Source Serif 4 (designed for
 *  sustained screen reading), EB Garamond & Baskerville & Palatino (classic
 *  novel typography), Georgia (ubiquitous screen serif), Bookerly/Charter
 *  (Kindle-grade system stacks). */
export type ReaderFontId =
  | "literata"
  | "garamond"
  | "spectral"
  | "sourceserif"
  | "georgia"
  | "bookerly"
  | "baskerville"
  | "palatino";
export type ReaderThemeId = "light" | "dark" | "sepia";

export interface ReaderSettings {
  fontFamily: ReaderFontId;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number; // em * 100
  width: number; // ch
  theme: ReaderThemeId;
  focusMode: boolean;
  accent: string;
  contrast: "normal" | "high";
  motion: boolean;
  animSpeed: number; // 0.5..1.5
  kbdHints: boolean;
}

export interface Prefs {
  reader: ReaderSettings;
  accent: string;
  maxUploadMB: number;
  aiModels: Partial<Record<BotId, string>>;
  dailyQuota: number;
  ring: "normal" | "strong";
  seeded: boolean;
  /** when true and a key is set, imports get an AI structure-refinement pass */
  aiRefine: boolean;
  /** local profile — display name + monogram color, purely on this device */
  profile: { name: string; color: string };
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface StudyData {
  summary: string;
  guide: string[];
  themes: { name: string; note: string }[];
  characters: { name: string; note: string }[];
  vocab: { term: string; context: string }[];
  quiz: QuizQuestion[];
  cards: Flashcard[];
  /** Learning objectives — added by the academic upgrade; optional for old caches. */
  objectives?: string[];
  /** Essay / discussion prompts. */
  essays?: string[];
}

export interface AiModelInfo {
  id: string;
  name: string;
  context: number;
  /** USD per 1M prompt tokens */
  inPerM: number;
  /** USD per 1M completion tokens */
  outPerM: number;
}

export interface SceneDraft {
  title: string;
  mood: string;
  characters: string[];
  body: string;
}

export type View =
  | "landing"
  | "dashboard"
  | "library"
  | "upload"
  | "reader"
  | "settings"
  | "account"
  | "analytics"
  | "history"
  | "create";
