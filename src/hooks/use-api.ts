"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ActivityRow,
  AiScene,
  DocumentRow,
  ParsedDoc,
} from "@/lib/types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any)?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Fetch + cache the full document list. */
export function useDocuments() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await json<{ documents: DocumentRow[] }>(
        await fetch("/api/documents", { cache: "no-store" }),
      );
      setDocs(data.documents);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { docs, loading, error, refresh, setDocs };
}

/** Fetch a single document + its parsed content. */
export function useDocument(id: string | null) {
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [content, setContent] = useState<ParsedDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await json<{ document: DocumentRow; content: ParsedDoc | null }>(
        await fetch(`/api/documents/${id}`, { cache: "no-store" }),
      );
      setDoc(data.document);
      setContent(data.content);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { doc, content, loading, error, refresh, setDoc, setContent };
}

/** Activity feed. */
export function useActivity(limit = 30) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await json<{ activity: ActivityRow[] }>(
        await fetch(`/api/activity?limit=${limit}`, { cache: "no-store" }),
      );
      setRows(data.activity);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, refresh };
}

export interface Stats {
  total: number;
  ready: number;
  processing: number;
  error: number;
  favorites: number;
  totalWords: number;
  totalBytes: number;
  inProgress: number;
  finished: number;
  avgProgress: number;
  bySource: Record<string, number>;
  histogram: { day: string; count: number }[];
  activityTotal: number;
}

export function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await json<Stats>(await fetch("/api/stats", { cache: "no-store" }));
      setStats(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, refresh };
}

/** AI summary generation — novel-level (full document). */
export async function generateSummary(
  documentId: string,
  regenerate = false,
): Promise<{ summary: string; cached: boolean }> {
  const data = await json<{ summary: string; cached: boolean }>(
    await fetch("/api/ai/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, scope: "novel", regenerate }),
    }),
  );
  return data;
}

/** AI summary generation — chapter-level. */
export async function generateChapterSummary(
  documentId: string,
  chapterIndex: number,
  regenerate = false,
): Promise<{
  summary: string;
  cached: boolean;
  chapterIndex: number;
  chapterTitle: string;
}> {
  const data = await json<{
    summary: string;
    cached: boolean;
    chapterIndex: number;
    chapterTitle: string;
  }>(
    await fetch("/api/ai/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, scope: "chapter", chapterIndex, regenerate }),
    }),
  );
  return data;
}

/** Fetch scenes — AI-enhanced cinematic scenes (cached server-side). */
export async function fetchScenes(
  documentId: string,
  regenerate = false,
): Promise<{ scenes: AiScene[]; cached: boolean }> {
  const data = await json<{ scenes: AiScene[]; cached: boolean }>(
    await fetch("/api/ai/scenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, regenerate }),
    }),
  );
  return data;
}

/** AI cinematize (scene cards) — deprecated alias for fetchScenes. */
export async function cinematizeDocument(
  documentId: string,
  regenerate = false,
): Promise<{ scenes: AiScene[]; cached: boolean }> {
  return fetchScenes(documentId, regenerate);
}

/** AI Q&A. */
export async function askQuestion(
  documentId: string,
  question: string,
): Promise<{ answer: string; citations: string[] }> {
  const data = await json<{ answer: string; citations: string[] }>(
    await fetch("/api/ai/qa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, question }),
    }),
  );
  return data;
}

/** Patch a document (progress, favorite, tags...). */
export async function patchDocument(
  id: string,
  patch: Partial<DocumentRow>,
): Promise<DocumentRow> {
  const data = await json<{ document: DocumentRow }>(
    await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
  return data.document;
}

/** Lazily run OCR refinement on a single chapter (background, cached). */
export async function refineChapter(
  documentId: string,
  chapterIndex: number,
  regenerate = false,
): Promise<{
  refined: boolean;
  cached: boolean;
  chapterIndex: number;
  refinedText?: string;
  titleRefined?: string;
  error?: string;
}> {
  const data = await json<{
    refined: boolean;
    cached: boolean;
    chapterIndex: number;
    refinedText?: string;
    titleRefined?: string;
    error?: string;
  }>(
    await fetch(`/api/documents/${documentId}/structure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterIndex, regenerate }),
    }),
  );
  return data;
}

/** Delete a document. */
export async function deleteDocument(id: string): Promise<void> {
  await fetch(`/api/documents/${id}`, { method: "DELETE" });
}

// ── Advanced AI analysis features ──────────────────────────────────────────

/** Dialogue analysis — evaluates conversational structures, context, and tone. */
export async function analyzeDialogue(
  documentId: string,
  chapterIndex?: number,
): Promise<{ analysis: string; scope: string }> {
  return json(
    await fetch("/api/ai/dialogue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, chapterIndex }),
    }),
  );
}

/** Character analysis — assesses personality traits, motivations, and relationships. */
export async function analyzeCharacters(
  documentId: string,
): Promise<{ analysis: string }> {
  return json(
    await fetch("/api/ai/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    }),
  );
}

/** Story summarization — condenses plotline while retaining key events and themes. */
export async function analyzeStory(
  documentId: string,
): Promise<{ analysis: string }> {
  return json(
    await fetch("/api/ai/story-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    }),
  );
}

/** Semantic interpretation — derives meaning, implications, and nuanced understanding. */
export async function analyzeSemantics(
  documentId: string,
): Promise<{ analysis: string }> {
  return json(
    await fetch("/api/ai/semantic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    }),
  );
}

/** Literary criticism — evaluates style, symbolism, and authorial intent. */
export async function analyzeCriticism(
  documentId: string,
): Promise<{ analysis: string }> {
  return json(
    await fetch("/api/ai/criticism", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    }),
  );
}

/** Theme extraction — identifies and categorizes central ideas. */
export async function analyzeThemes(
  documentId: string,
): Promise<{ analysis: string }> {
  return json(
    await fetch("/api/ai/themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    }),
  );
}

/** Content rewriting — enhances clarity, structure, grammar, and tone. */
export async function rewriteContent(
  documentId: string,
  chapterIndex?: number,
  instructions?: string,
): Promise<{ rewritten: string; scope: string; original: string }> {
  return json(
    await fetch("/api/ai/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, chapterIndex, instructions }),
    }),
  );
}

/** Upload a file (server-side parse). Returns the resulting document row. */
export async function uploadFile(
  file: File,
): Promise<{ document: DocumentRow | null; error: string | null }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/documents", { method: "POST", body: form });
  const data = await res.json();
  return { document: data.document ?? null, error: data.error ?? null };
}
