/**
 * Data access layer. All reads are filtered by the local session identity,
 * mirroring server-side ownership isolation. Components subscribe through
 * `useDbVersion` and refetch when the store changes.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type {
  ActivityRow,
  ActivityType,
  AiSceneRow,
  AnalysisJob,
  AnnotationRow,
  BookmarkRow,
  DocumentRow,
  ParsedDoc,
  SceneDraft,
  StoryRow,
  UsageRow,
  BotId,
} from "./types";
import {
  idbAll,
  idbBulkPut,
  idbDelete,
  idbGet,
  idbPut,
  getUserId,
  STORES,
  type StoreName,
} from "./db";
import { cachePurgeDoc } from "./cache";
import { coverGradient, uid } from "./utils";
import { toChapters } from "./engine";
import type { Fileish } from "./ingest-types";

let version = 0;
const bus = new EventTarget();

/** In-memory read-event throttle: documentId → timestamp of the last
 *  "read" activity row written. Replaces a full activity-table scan on
 *  every debounced progress save with an O(1) Map lookup. */
const lastReadEventAt = new Map<string, number>();

/* ────────────────────────────────────────────────────────────
   Per-store version counters — race-free scoped refetches.
   
   The previous design used a single `changedStores: Set | null` that
   was overwritten on every bump. When a job completed, the runner
   fired bump("jobs") then spec.onDone fired bump("stories") +
   bump("activity"). React 19's automatic batching could collapse
   all three bumps into one re-render, so useJobs saw only the LAST
   bump's stores (e.g. Set(["activity"])), found no overlap with
   ["jobs"], and SKIPPED refetching — leaving the header spinner
   stuck on "running" forever.

   The fix: each store has its own monotonic counter. A query
   snapshots the versions of its stores before fetching; on a
   version bump, it compares current versions to its snapshot and
   refetches if ANY of its stores' versions incremented. This is
   race-free because counters are per-store and monotonic — the
   order of bumps within a batched re-render no longer matters.
   ──────────────────────────────────────────────────────────── */
const storeVersions = new Map<StoreName, number>();
for (const s of STORES) storeVersions.set(s, 0);

/** Snapshot of per-store versions — used by useQuery to detect whether
 *  ANY of its stores changed since its last fetch. Returns a frozen
 *  copy so callers can compare by reference after a bump. */
function snapshotVersions(
  stores: readonly StoreName[],
): Map<StoreName, number> {
  const snap = new Map<StoreName, number>();
  for (const s of stores) snap.set(s, storeVersions.get(s) ?? 0);
  return snap;
}

/** Bump the version bus. Optionally pass the specific store(s) that changed
 *  so only queries reading those stores refetch. Without the `stores`
 *  argument, ALL queries refetch (the legacy behavior, used by mutations
 *  that touch multiple stores like deleteDocument). */
export function bump(...stores: StoreName[]): void {
  version++;
  if (stores.length > 0) {
    for (const s of stores)
      storeVersions.set(s, (storeVersions.get(s) ?? 0) + 1);
  } else {
    // Global bump — increment every store so all queries refetch
    for (const s of STORES)
      storeVersions.set(s, (storeVersions.get(s) ?? 0) + 1);
  }
  bus.dispatchEvent(new Event("change"));
}

const subscribe = (fn: () => void) => {
  bus.addEventListener("change", fn);
  return () => bus.removeEventListener("change", fn);
};

export function useDbVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/** Check whether any of the given stores' versions have advanced past
 *  the snapshot. Used by useQuery's scoped-refetch optimization. */
function storesChangedSince(
  stores: readonly StoreName[],
  snapshot: Map<StoreName, number>,
): boolean {
  for (const s of stores) {
    if ((storeVersions.get(s) ?? 0) !== (snapshot.get(s) ?? 0)) return true;
  }
  return false;
}

export interface Query<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** manually re-run the query (error recovery) */
  retry: () => void;
}

export function useQuery<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
  stores?: readonly StoreName[],
): Query<T> {
  const v = useDbVersion();
  const [state, setState] = useState<Omit<Query<T>, "retry">>({
    data: null,
    loading: true,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);
  const hadData = useRef(false);
  const autoRetried = useRef(false);
  const depKey = JSON.stringify(deps);
  const lastDepKey = useRef(depKey);
  const lastV = useRef(v);
  // Hold the latest loader and stores in refs so the effect can stay keyed on
  // stable primitives (v, depKey, attempt, storesKey) without re-running every
  // render — every caller passes a fresh closure and a fresh `stores` array,
  // either of which would otherwise cause an infinite fetch loop once setState
  // triggers a re-render.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const storesRef = useRef(stores);
  storesRef.current = stores;
  // Stable string key for the dependency array — `stores.join(",")` is
  // referentially stable across renders for the same store set, so the
  // effect doesn't re-run just because the caller passed a new array.
  const storesKey = stores?.join(",") ?? "";
  // Snapshot of per-store versions from the last successful fetch. Used by
  // the scoped-refetch optimization: if none of this query's stores advanced
  // since the snapshot, we skip the refetch. This is race-free because each
  // store has its own monotonic counter (see storeVersions above).
  const versionSnapshot = useRef<Map<StoreName, number> | null>(null);

  // Stale-while-revalidate: once data exists, background refetches replace it
  // silently (the reader never flashes a skeleton while progress saves bump
  // the store version). On failure we auto-retry once, then surface a
  // retryable error state for manual recovery.
  useEffect(() => {
    // Scoped-refetch optimization: if this query reads from specific stores
    // (e.g. useDoc reads "documents") and none of those stores' versions
    // advanced since our last fetch, skip the refetch entirely. This prevents
    // the reader's debounced progress save from refetching activity, usage,
    // jobs, scenes, bookmarks and annotations on every tick — while correctly
    // refetching when a relevant store DID change (even if other stores also
    // changed in the same batched re-render).
    const currentStores = storesRef.current;
    if (
      currentStores &&
      currentStores.length > 0 &&
      lastV.current !== v &&
      hadData.current &&
      versionSnapshot.current
    ) {
      if (!storesChangedSince(currentStores, versionSnapshot.current)) {
        lastV.current = v;
        return; // skip refetch — none of this query's stores changed
      }
    }
    lastV.current = v;

    if (lastDepKey.current !== depKey) {
      lastDepKey.current = depKey;
      hadData.current = false;
      autoRetried.current = false;
      setState({ data: null, loading: true, error: null });
    }
    let on = true;
    let retryTimer: number | undefined;
    loaderRef
      .current()
      .then((data) => {
        if (!on) return;
        hadData.current = true;
        autoRetried.current = false;
        // Take a fresh snapshot AFTER a successful fetch so we have the
        // correct baseline. This catches any bumps that fired during the
        // fetch — without it, a bump that landed while we were reading would
        // be "invisible" to the next change check, causing a missed refetch.
        if (currentStores && currentStores.length > 0) {
          versionSnapshot.current = snapshotVersions(currentStores);
        }
        setState({ data, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (!on) return;
        if (!autoRetried.current && !hadData.current) {
          autoRetried.current = true;
          retryTimer = window.setTimeout(() => {
            if (on) setAttempt((a) => a + 1);
          }, 700);
          return;
        }
        setState((s) => ({
          data: hadData.current ? s.data : null,
          loading: false,
          error: e instanceof Error ? e.message : "Something went wrong",
        }));
      });
    return () => {
      on = false;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [v, depKey, attempt, storesKey]);

  return {
    ...state,
    retry: () => {
      autoRetried.current = true;
      setAttempt((a) => a + 1);
    },
  };
}

const me = () => getUserId();

/* ---------------- queries ---------------- */

export function useDocuments(): Query<DocumentRow[]> {
  return useQuery(
    () =>
      idbAll<DocumentRow>("documents").then((rows) =>
        rows.filter((r) => r.userId === me()),
      ),
    [],
    ["documents"],
  );
}

export function useDoc(id: string | null): Query<DocumentRow> {
  return useQuery(
    async () => {
      if (!id) throw new Error("No document selected.");
      const row = await idbGet<DocumentRow>("documents", id);
      if (!row || row.userId !== me())
        throw new Error("This document isn’t in your library.");
      return row;
    },
    [id],
    ["documents"],
  );
}

export function useBookmarks(docId: string | null): Query<BookmarkRow[]> {
  return useQuery(
    () =>
      idbAll<BookmarkRow>("bookmarks").then((r) =>
        r
          .filter((b) => b.userId === me() && b.documentId === docId)
          .sort((a, b) => a.chunkIndex - b.chunkIndex),
      ),
    [docId],
    ["bookmarks"],
  );
}

export function useAnnotations(docId: string | null): Query<AnnotationRow[]> {
  return useQuery(
    () =>
      idbAll<AnnotationRow>("annotations").then((r) =>
        r.filter((a) => a.userId === me() && a.documentId === docId),
      ),
    [docId],
    ["annotations"],
  );
}

export function useScenes(docId: string | null): Query<AiSceneRow[]> {
  return useQuery(
    () =>
      idbAll<AiSceneRow>("scenes").then((r) =>
        r
          .filter((s) => s.userId === me() && s.documentId === docId)
          .sort(
            (a, b) => a.chapterIndex - b.chapterIndex || a.ordinal - b.ordinal,
          ),
      ),
    [docId],
    ["scenes"],
  );
}

export function useActivity(limit = 40): Query<ActivityRow[]> {
  return useQuery(
    () =>
      idbAll<ActivityRow>("activity").then((r) =>
        r
          .filter((a) => a.userId === me())
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit),
      ),
    [limit],
    ["activity"],
  );
}

export function useUsage(): Query<UsageRow[]> {
  return useQuery(
    () =>
      idbAll<UsageRow>("usage").then((r) => r.filter((u) => u.userId === me())),
    [],
    ["usage"],
  );
}

export function useStories(): Query<StoryRow[]> {
  return useQuery(
    () =>
      idbAll<StoryRow>("stories").then((r) =>
        r
          .filter((s) => s.userId === me())
          .sort((a, b) => b.createdAt - a.createdAt),
      ),
    [],
    ["stories"],
  );
}

export function useJobs(docId?: string): Query<AnalysisJob[]> {
  return useQuery(
    () =>
      idbAll<AnalysisJob>("jobs").then((r) =>
        r
          .filter(
            (j) => j.userId === me() && (!docId || j.documentId === docId),
          )
          .sort((a, b) => b.updatedAt - a.updatedAt),
      ),
    [docId],
    ["jobs"],
  );
}

/* ---------------- mutations ---------------- */

export async function logActivity(
  type: ActivityType,
  detail: string,
  documentId: string | null = null,
): Promise<void> {
  const row: ActivityRow = {
    id: uid("act"),
    userId: me(),
    documentId,
    type,
    detail,
    createdAt: Date.now(),
  };
  await idbPut("activity", row);
  bump("activity");
}

export async function logUsage(
  bot: BotId,
  kind: string,
  estTokens: number,
  latencyMs: number,
  status: UsageRow["status"],
  documentId: string | null,
  model?: string,
): Promise<void> {
  const row: UsageRow = {
    id: uid("use"),
    userId: me(),
    bot,
    documentId,
    kind,
    estTokens,
    latencyMs,
    status,
    createdAt: Date.now(),
    ...(model ? { model } : {}),
  };
  await idbPut("usage", row);
  bump("usage");
}

export async function importParsed(
  file: Fileish,
  parsed: ParsedDoc,
): Promise<DocumentRow> {
  const now = Date.now();
  const row: DocumentRow = {
    id: uid("doc"),
    userId: me(),
    title: parsed.title,
    author: parsed.author,
    sourceType: parsed.sourceType,
    mimeType: file.type || "application/octet-stream",
    byteSize: file.size,
    status: "ready",
    error: null,
    warnings: parsed.warnings,
    summary: null,
    language: parsed.language,
    coverGradient: coverGradient(parsed.title + now.toString(36)),
    contentJson: { chapters: parsed.chapters },
    chapterCount: parsed.chapters.length,
    wordCount: parsed.wordCount,
    charCount: parsed.charCount,
    createdAt: now,
    updatedAt: now,
    lastReadAt: null,
    readingProgress: 0,
    lastChunkIndex: 0,
    favorite: false,
    tags: [parsed.sourceType],
    collection: null,
  };
  await idbPut("documents", row);
  await logActivity(
    "upload",
    `Imported “${row.title}” (${row.sourceType.toUpperCase()}, ${row.chapterCount} chapters)`,
    row.id,
  );
  return row;
}

export async function patchDocument(
  id: string,
  patch: Partial<DocumentRow>,
): Promise<void> {
  const row = await idbGet<DocumentRow>("documents", id);
  if (!row || row.userId !== me()) return;
  await idbPut("documents", { ...row, ...patch, id, updatedAt: Date.now() });
  bump("documents");
}

export async function setFavorite(
  id: string,
  favorite: boolean,
): Promise<void> {
  await patchDocument(id, { favorite });
  const row = await idbGet<DocumentRow>("documents", id);
  if (row)
    await logActivity(
      "favorite",
      favorite ? `Starred “${row.title}”` : `Unstarred “${row.title}”`,
      id,
    );
}

export async function updateProgress(
  id: string,
  chunkIndex: number,
  progress: number,
): Promise<void> {
  const row = await idbGet<DocumentRow>("documents", id);
  if (!row || row.userId !== me()) return;
  const finishedNow = progress >= 99.5 && row.readingProgress < 99.5;
  await idbPut("documents", {
    ...row,
    lastChunkIndex: chunkIndex,
    readingProgress: Math.round(progress * 10) / 10,
    lastReadAt: Date.now(),
    updatedAt: Date.now(),
  });
  // Throttle read events: at most one per document per 10 minutes. Kept in
  // memory instead of scanning the whole activity table on every debounced
  // progress save (~every 900ms while reading) — an O(1) check instead of
  // an O(N) full-store read that grows with library history.
  const cutoff = Date.now() - 10 * 60 * 1000;
  if ((lastReadEventAt.get(id) ?? 0) < cutoff) {
    lastReadEventAt.set(id, Date.now());
    await logActivity(
      "read",
      `Reading “${row.title}” — ${Math.round(progress)}%`,
      id,
    );
  }
  if (finishedNow) await logActivity("finish", `Finished “${row.title}”`, id);
  // Scoped bump: only the documents store changed. This prevents the reader's
  // debounced progress save (every 900ms) from triggering useActivity,
  // useUsage, useJobs, useScenes, useBookmarks, useAnnotations to all refetch.
  // logActivity already bumped "activity" if it fired; bump "documents" now.
  bump("documents");
}

export async function deleteDocument(id: string): Promise<void> {
  const row = await idbGet<DocumentRow>("documents", id);
  lastReadEventAt.delete(id);
  await idbDelete("documents", id);
  const cleanup = async (store: StoreName, key: "documentId") => {
    const rows = await idbAll<{ id: string; documentId: string }>(store);
    const doomed = rows.filter((r) => r.documentId === id);
    for (const d of doomed) await idbDelete(store, d.id);
    void key;
  };
  await cleanup("bookmarks", "documentId");
  await cleanup("annotations", "documentId");
  await cleanup("scenes", "documentId");
  const jobs = await idbAll<AnalysisJob>("jobs");
  for (const j of jobs.filter((j) => j.documentId === id))
    await idbDelete("jobs", j.id);
  // Purge cached AI artifacts (study sets, analyses, scenes, Ouro outputs)
  // keyed by this document so they don't linger until TTL expiry.
  await cachePurgeDoc(id);
  if (row)
    await logActivity(
      "delete",
      `Deleted “${row.title}” from the library`,
      null,
    );
  bump();
}

export async function addBookmark(
  documentId: string,
  chunkIndex: number,
  label: string,
  note: string,
): Promise<void> {
  const row: BookmarkRow = {
    id: uid("bm"),
    userId: me(),
    documentId,
    chunkIndex,
    label,
    note,
    createdAt: Date.now(),
  };
  await idbPut("bookmarks", row);
  await logActivity(
    "bookmark",
    label ? `Bookmarked: ${label}` : "Bookmark added",
    documentId,
  );
}

export async function removeBookmark(id: string): Promise<void> {
  await idbDelete("bookmarks", id);
  bump("bookmarks");
}

export async function addAnnotation(
  a: Omit<AnnotationRow, "id" | "createdAt" | "userId">,
): Promise<void> {
  const row: AnnotationRow = {
    ...a,
    userId: me(),
    id: uid("an"),
    createdAt: Date.now(),
  };
  await idbPut("annotations", row);
  await logActivity(
    "annotation",
    `Annotated: “${a.text.slice(0, 48)}${a.text.length > 48 ? "…" : ""}”`,
    a.documentId,
  );
}

export async function removeAnnotation(id: string): Promise<void> {
  await idbDelete("annotations", id);
  bump("annotations");
}

export async function putScenes(
  documentId: string,
  chapterIndex: number,
  scenes: SceneDraft[],
): Promise<void> {
  const existing = await idbAll<AiSceneRow>("scenes");
  for (const s of existing.filter(
    (s) => s.documentId === documentId && s.chapterIndex === chapterIndex,
  )) {
    await idbDelete("scenes", s.id);
  }
  const rows: AiSceneRow[] = scenes.map((s, i) => ({
    id: uid("scn"),
    userId: me(),
    documentId,
    chapterIndex,
    ordinal: i,
    title: s.title,
    body: s.body,
    mood: s.mood,
    characters: s.characters,
    createdAt: Date.now(),
  }));
  await idbBulkPut("scenes", rows);
  bump("scenes"); // scenes must be visible the moment they land — don't wait for the activity row
  await logActivity(
    "scenes",
    `Cinematic scenes rendered for chapter ${chapterIndex + 1}`,
    documentId,
  );
}

/** Turn a finished Ankaa draft into a library document (shared by the
 *  writing desk and the in-reader Ankaa panel). Returns the new row. */
/**
 * Append generated prose to an EXISTING document as a new chapter, so a
 * continuation / new chapter / alternate ending written from the reader
 * becomes part of the same book — not a separate shelf item. Rebuilds chunk
 * indices, word/char counts and the cover gradient seed, then bumps so the
 * open reader reflects the new chapter immediately. Reading position is
 * preserved (only forward chunk indices shift).
 */
export async function appendChapterToDocument(
  docId: string,
  title: string,
  body: string,
): Promise<DocumentRow> {
  const doc = await idbGet<DocumentRow>("documents", docId);
  if (!doc || doc.userId !== getUserId())
    throw new Error("Document not found.");
  const paras = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paras.length)
    throw new Error("Nothing to append — the draft was empty.");
  const chapters = toChapters([
    ...doc.contentJson.chapters.map((c) => ({
      title: c.title,
      paras: c.chunks.map((k) => k.text),
    })),
    { title, paras },
  ]);
  const text = chapters
    .flatMap((c) => c.chunks.map((k) => k.text))
    .join("\n\n");
  const updated: DocumentRow = {
    ...doc,
    contentJson: { chapters },
    chapterCount: chapters.length,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    charCount: text.length,
    updatedAt: Date.now(),
  };
  await idbPut("documents", updated);
  await logActivity(
    "story",
    `Ankaa appended “${title}” to “${doc.title}”`,
    docId,
  );
  bump("documents");
  return updated;
}

export async function saveStoryToLibrary(
  story: StoryRow,
): Promise<DocumentRow> {
  const paras = (story.body ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chapters = toChapters([{ title: story.title, paras }]);
  const text = paras.join("\n\n");
  const now = Date.now();
  const row: DocumentRow = {
    id: uid("doc"),
    userId: getUserId(),
    title: story.title,
    author: "Ankaa · Lemniscate",
    sourceType: "markdown",
    mimeType: "text/plain",
    byteSize: new Blob([text]).size,
    status: "ready",
    error: null,
    warnings: [],
    summary: null,
    language: "en",
    coverGradient: coverGradient(story.title + now.toString(36)),
    contentJson: { chapters },
    chapterCount: chapters.length,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    charCount: text.length,
    createdAt: now,
    updatedAt: now,
    lastReadAt: null,
    readingProgress: 0,
    lastChunkIndex: 0,
    favorite: false,
    tags: ["ankaa", "story"],
    collection: "Ankaa drafts",
  };
  await idbPut("documents", row);
  await logActivity(
    "upload",
    `Saved Ankaa draft “${row.title}” to the library`,
    row.id,
  );
  return row;
}

export async function putStory(story: StoryRow): Promise<void> {
  await idbPut("stories", story);
  bump("stories");
}

export async function patchStory(
  id: string,
  patch: Partial<StoryRow>,
): Promise<void> {
  const row = await idbGet<StoryRow>("stories", id);
  if (!row || row.userId !== me()) return;
  await idbPut("stories", { ...row, ...patch, id });
  bump("stories");
}

/** Delete a draft from the writing desk and refresh every subscriber.
 *  Components must use this instead of raw `idbDelete("stories", …)` —
 *  a bare IndexedDB delete fires no version bump, so the story shelf
 *  would keep showing the deleted row until an unrelated store change. */
export async function deleteStory(id: string): Promise<void> {
  await idbDelete("stories", id);
  bump("stories");
}

export async function putJob(job: AnalysisJob): Promise<void> {
  await idbPut("jobs", job);
  bump("jobs");
}

/* ---------------- storage management ---------------- */

/** Stores that hold user-owned rows (everything except the shared aiCache,
 *  which is non-personal derived output keyed by document). */
const USER_STORES = STORES.filter((s) => s !== "aiCache");

/** One-time ownership migration: rows written before per-user stamping
 *  existed (bookmarks / annotations / scenes) are claimed by the current
 *  local identity so they remain visible and are correctly scoped. */
export async function migrateOwnership(): Promise<void> {
  const uidMe = getUserId();
  const legacyStores: StoreName[] = ["bookmarks", "annotations", "scenes"];
  for (const store of legacyStores) {
    const rows = await idbAll<{ id: string; userId?: string }>(store);
    const orphans = rows.filter((r) => !r.userId);
    for (const r of orphans) await idbPut(store, { ...r, userId: uidMe });
  }
}

export async function exportAllData(): Promise<string> {
  const mine = getUserId();
  const out: Record<string, unknown[]> = {};
  for (const s of USER_STORES) {
    // Only export rows owned by the current identity — never another
    // local profile's documents, bookmarks, annotations or history.
    out[s] = (await idbAll(s)).filter(
      (r) =>
        (r as { userId?: string }).userId === undefined ||
        (r as { userId?: string }).userId === mine,
    );
  }
  return JSON.stringify(
    { app: "lemniscate", exportedAt: new Date().toISOString(), data: out },
    null,
    2,
  );
}

export async function clearAllData(): Promise<void> {
  const mine = getUserId();
  for (const s of USER_STORES) {
    const rows = await idbAll<{ id: string; userId?: string }>(s);
    // Delete only this identity's rows; rows without an owner field
    // (legacy/anonymous) are also cleared as they cannot be attributed.
    for (const r of rows) {
      if (!r.userId || r.userId === mine) await idbDelete(s, r.id);
    }
  }
  bump();
}
