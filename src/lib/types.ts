// Shared Lemniscate types — used by client views and API routes.

export type SourceType = "pdf" | "epub" | "docx" | "md" | "txt" | "html" | "other";
export type DocStatus = "ready" | "processing" | "error";

export interface Chunk {
  index: number;
  text: string;
  charOffset: number;
}

export interface Chapter {
  id: string;
  title: string;
  chunks: Chunk[];
  ordinal: number;
  /** OCR-refined text for the entire chapter. Present after the background
   *  OCR refinement job completes. When present, the reader renders this
   *  instead of the raw chunks. Cached per-chapter so it's never reprocessed. */
  refinedText?: string;
}

export interface ParsedDoc {
  chapters: Chapter[];
  wordCount: number;
  charCount: number;
  language?: string;
  title?: string;
  author?: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  author?: string | null;
  sourceType: SourceType;
  mimeType?: string | null;
  byteSize: number;
  status: DocStatus;
  error?: string | null;
  warnings?: string[];
  summary?: string | null;
  language?: string | null;
  coverGradient?: string | null;
  chapterCount: number;
  wordCount: number;
  charCount: number;
  createdAt: string;
  updatedAt: string;
  lastReadAt?: string | null;
  readingProgress: number;
  lastChunkIndex: number;
  favorite: boolean;
  tags: string[];
  collection?: string | null;
}

export type ViewName =
  | "landing"
  | "dashboard"
  | "library"
  | "upload"
  | "reader"
  | "settings"
  | "account"
  | "analytics"
  | "history"
  | "search";

export interface ReaderSettings {
  // The six reader-selectable families from the typographic brief, plus
  // generic sans/serif/mono for backwards compatibility.
  fontFamily:
    | "sans"
    | "serif"
    | "mono"
    | "georgia"
    | "open-sans"
    | "verdana"
    | "bookerly"
    | "literata"
    | "garamond";
  fontSize: number; // px
  lineHeight: number;
  letterSpacing: number; // em
  readingWidth: number; // ch
  theme: "light" | "dark" | "sepia";
  focusMode: boolean;
  accent: string;
  contrast: "normal" | "high";
  motion: "normal" | "reduced";
  animSpeed: "normal" | "off" | "fast" | "slow";
  kbdHints: boolean;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontFamily: "open-sans",
  fontSize: 18,
  lineHeight: 1.7,
  letterSpacing: 0,
  readingWidth: 68,
  theme: "light",
  focusMode: false,
  accent: "#c9a84c",
  contrast: "normal",
  motion: "normal",
  animSpeed: "normal",
  kbdHints: false,
};

export interface AiScene {
  id: string;
  documentId: string;
  ordinal: number;
  title: string;
  body: string;
  mood?: string | null;
  characters?: string[] | null;
}

export interface ActivityRow {
  id: string;
  documentId?: string | null;
  type: string;
  detail?: string | null;
  createdAt: string;
  documentTitle?: string | null;
}

export function sourceTypeFromMime(mime: string | null | undefined, filename = ""): SourceType {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "epub" || mime === "application/epub+zip") return "epub";
  if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return "docx";
  if (ext === "md" || ext === "markdown" || mime === "text/markdown") return "md";
  if (ext === "txt" || mime === "text/plain") return "txt";
  if (ext === "html" || ext === "htm" || mime === "text/html") return "html";
  return "other";
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export function isRecent(iso: string, days = 7): boolean {
  return Date.now() - new Date(iso).getTime() < days * 86_400_000;
}

export const SOURCE_LABELS: Record<SourceType, string> = {
  pdf: "PDF",
  epub: "EPUB",
  docx: "DOCX",
  md: "MD",
  txt: "TXT",
  html: "HTML",
  other: "DOC",
};

const COVER_GRADIENTS = [
  "linear-gradient(135deg, #3a2a1a, #7a5a2a)",
  "linear-gradient(135deg, #1a2a3a, #2a4a6a)",
  "linear-gradient(135deg, #2a1a2a, #5a2a4a)",
  "linear-gradient(135deg, #1a2a1a, #3a5a2a)",
  "linear-gradient(135deg, #2a1a1a, #6a3a2a)",
  "linear-gradient(135deg, #1a1a2a, #3a2a5a)",
  "linear-gradient(135deg, #2a2a1a, #5a5a2a)",
  "linear-gradient(135deg, #1a2a2a, #2a5a5a)",
];

export function gradientForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COVER_GRADIENTS[h % COVER_GRADIENTS.length];
}
