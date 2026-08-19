import { useMemo, useState } from "react";
import {
  ArrowRight, Shuffle, BookOpen, ScrollText, Baby, HelpCircle, PenTool,
  Save, Copy, Trash2, PenLine, CheckCircle2, Eye, Loader2, Circle, XCircle, MessageCircleHeart, Clock3,
} from "lucide-react";
import { useNav, toast } from "../lib/store";
import { useDocuments, useStories, putStory, patchStory, logActivity, saveStoryToLibrary } from "../lib/data";
import { idbDelete, getUserId } from "../lib/db";
import { runAnkaaLong, ankaaSteps, detectDepth, ankaaSectionsFor, aiConfigured, AiUnavailable, extractAnchors, type AnkaaDepth } from "../lib/ai";
import { enqueueJob } from "../lib/jobs";
import type { AnkaaMode, StoryRow } from "../lib/types";
import { fmtWords, timeAgo, uid, cx } from "../lib/utils";
import { Button, Panel, Badge, Select, Progress, Skeleton, EmptyState, Dialog, Eyebrow } from "../components/ui";

const MODES: { id: AnkaaMode; label: string; icon: typeof PenTool; hint: string }[] = [
  { id: "continue", label: "Continue the story", icon: ArrowRight, hint: "Pick up where the text left off" },
  { id: "alternate", label: "Alternate ending", icon: Shuffle, hint: "Fork the last turning point" },
  { id: "chapter", label: "New chapter", icon: BookOpen, hint: "Draft the next chapter" },
  { id: "lore", label: "World lore", icon: ScrollText, hint: "Histories the text only implies" },
  { id: "children", label: "Retell for children", icon: Baby, hint: "The same story, gentler hands" },
  { id: "whatif", label: "What if…", icon: HelpCircle, hint: "One small hinge, another door" },
];

interface LiveDraft {
  storyId: string;
  stepIdx: number;
  words: number;
  etaSec: number | null;
  status: "running" | "done" | "failed";
  error?: string;
}

export default function Create() {
  const openDoc = useNav((s) => s.openDoc);
  const docsQ = useDocuments();
  const storiesQ = useStories();
  // OpenRouter key status — synchronous peek at the in-memory key set via
  // `setSessionKey()` (typically from Settings). When no key is set, Ankaa
  // falls back to the grounded Anchor engine (~1,800 words on-device).
  const serverOnline = aiConfigured();

  const [mode, setMode] = useState<AnkaaMode>("continue");
  const [sourceId, setSourceId] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [live, setLive] = useState<LiveDraft | null>(null);
  const [current, setCurrent] = useState<StoryRow | null>(null);
  const [preview, setPreview] = useState<StoryRow | null>(null);

  const sourceDoc = useMemo(() => (docsQ.data ?? []).find((d) => d.id === sourceId) ?? null, [docsQ.data, sourceId]);
  // Depth (short / medium / long) is derived from the prompt + whether a
  // source document is attached. It drives section count, per-section word
  // targets, the step list shown in the progress UI, and the model's token
  // budget — so a terse "scene about a lamp" yields ~400 words, while a long
  // prompt or a book continuation warrants the full 5-section pipeline.
  const depth = useMemo<AnkaaDepth>(() => detectDepth(prompt, sourceDoc), [prompt, sourceDoc]);
  const steps = useMemo(() => ankaaSteps(depth), [depth]);
  const readyDocs = (docsQ.data ?? []).filter((d) => d.status === "ready");
  const running = live?.status === "running";
  const anchors = useMemo(() => extractAnchors(prompt), [prompt]);

  const generate = async () => {
    if (running) return;
    // Capture depth at dispatch time — the live job keeps its own snapshot.
    const runDepth = depth;
    const modeMeta = MODES.find((m) => m.id === mode);
    const promptTitle = prompt.trim().length > 52 ? prompt.trim().slice(0, 51) + "…" : prompt.trim();
    const story: StoryRow = {
      id: uid("story"), userId: getUserId(),
      title: promptTitle || `${modeMeta?.label ?? "Draft"}${sourceDoc ? ` — ${sourceDoc.title}` : ""}`,
      mode, body: "", sourceDocumentId: sourceDoc?.id ?? null,
      status: "running", progress: 0, step: "Queued", error: null, createdAt: Date.now(),
    };
    await putStory(story);
    setCurrent(story);
    setLive({ storyId: story.id, stepIdx: 0, words: 0, etaSec: null, status: "running" });

    const { id: jobId } = enqueueJob({
      label: `Ankaa · ${modeMeta?.label ?? "draft"}`,
      bot: "ankaa",
      kind: mode,
      documentId: sourceDoc?.id ?? null,
      steps,
      run: async (report) => {
        const started = performance.now();
        return runAnkaaLong(mode, prompt, sourceDoc, (stepIdx, _fraction, words) => {
          const elapsed = (performance.now() - started) / 1000;
          const overall = (stepIdx + _fraction) / steps.length;
          const eta = overall > 0.06 ? Math.max(1, Math.round((elapsed / overall) * (1 - overall))) : null;
          report({ step: stepIdx, fraction: _fraction, words });
          setLive((l) => (l && l.storyId === story.id ? { ...l, stepIdx, words, etaSec: eta } : l));
          void patchStory(story.id, { step: steps[stepIdx], progress: Math.round(overall * 100) });
        }, undefined, runDepth);
      },
      onDone: async (res) => {
        const done: StoryRow = { ...story, title: res.title, body: res.body, status: "done", progress: 100, step: "Complete" };
        await putStory(done);
        setCurrent(done);
        setLive((l) => (l && l.storyId === story.id ? { ...l, status: "done", words: res.words } : l));
        await logActivity("story", `Ankaa drafted “${res.title}” (${res.words.toLocaleString()} words)`, sourceDoc?.id ?? null);
        toast("success", res.offline ? `Draft complete — ${res.words.toLocaleString()} words (Anchor engine).` : `Draft complete — ${res.words.toLocaleString()} words.`);
      },
      onError: async (err) => {
        const msg = err instanceof AiUnavailable ? err.message : err.message || "Ankaa couldn’t finish the draft.";
        await patchStory(story.id, { status: "failed", error: msg });
        setCurrent({ ...story, status: "failed", error: msg });
        setLive((l) => (l && l.storyId === story.id ? { ...l, status: "failed", error: msg } : l));
        toast("error", msg);
      },
    });
    void jobId;
  };

  const saveToLibrary = async (story: StoryRow) => {
    const row = await saveStoryToLibrary(story);
    toast("success", `“${row.title}” is now in your library.`);
    openDoc(row.id);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
      {/* ─── header ─── */}
      <div className="flex flex-wrap items-end justify-between gap-6 mb-9 sm:mb-10">
        <div className="min-w-0 flex-1">
          <Eyebrow className="mb-3 !text-ankaa-400">Ankaa · the long-form agent</Eyebrow>
          <h1 className="font-display font-semibold text-3xl sm:text-4xl lg:text-5xl text-mist-100 tracking-tight leading-[1.05]">
            The <span className="font-garamond italic font-medium text-ankaa-400">writing</span> desk
          </h1>
          <p className="text-sm text-mist-500 mt-3 sm:mt-4 max-w-xl leading-relaxed">
            Tell Ankaa what to write. The prompt drives the outline, the tone, and every section that follows.
            {aiConfigured() && serverOnline ? " Connected to your model." : " The Anchor engine writes ~1,800; add your OpenRouter key in Settings for the full pipeline."}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="relative w-11 h-11 rounded-full border border-ankaa-500/50 bg-ankaa-500/10 flex items-center justify-center font-garamond italic text-xl text-ankaa-300">
            A
            <span className="absolute -inset-1 rounded-full border border-ankaa-500/30 animate-pulse-soft" aria-hidden />
          </span>
          <Badge tone={serverOnline ? "ok" : "muted"}>{serverOnline ? "model connected" : "Anchor engine"}</Badge>
        </div>
      </div>

      {/* ─── prompt-first composer: Ankaa asks, the user answers ─── */}
      <Panel className="p-6 sm:p-8 lg:p-10 mb-5 sm:mb-6">
        {/* Ankaa's question — conversational, inviting */}
        <div className="flex items-start gap-3 sm:gap-4 mb-5">
          <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-ankaa-500/50 bg-ankaa-500/10 flex items-center justify-center font-garamond italic text-lg sm:text-xl text-ankaa-300 shrink-0 mt-0.5">
            A
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-garamond italic text-xl sm:text-2xl lg:text-3xl text-mist-100 leading-snug">
              What should Ankaa write?
            </h2>
            <p className="text-[12px] sm:text-[13px] text-mist-500 mt-1.5 leading-relaxed">
              Describe a scene, a character, a world, a what-if — anything. Ankaa will outline, draft section by section, and deliver a finished piece.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <Badge tone="ankaa" title={`${ankaaSectionsFor(depth)} sections · ${depth}-form draft`}>
              {depth === "short" ? "Short" : depth === "medium" ? "Medium" : "Long"}
              <span className="opacity-60 ml-1">· {ankaaSectionsFor(depth)}</span>
            </Badge>
            {prompt.trim().length > 0 && (
              <span className="text-[10px] font-display text-mist-600 tabular-nums">{prompt.trim().length} chars</span>
            )}
          </div>
        </div>

        {/* The prompt input — large, central, inviting */}
        <div className="relative">
          <textarea
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !running) { e.preventDefault(); void generate(); } }}
            placeholder={"e.g. A cold harbor town the morning the lighthouse goes dark. The keeper's daughter walks the breakwater and finds the light has moved into the sea. Slow, salt-heavy prose; end on a door left open."}
            aria-label="What should Ankaa write?"
            className="w-full rounded-xl border border-ink-600 bg-ink-875 px-4 sm:px-5 py-4 sm:py-5 text-[15px] sm:text-base font-literata leading-relaxed text-mist-100 placeholder:text-mist-600 hover:border-ink-500 focus:border-ankaa-500 focus:shadow-[0_0_24px_-12px_var(--acc-glow)] outline-none transition-all resize-y min-h-[120px] sm:min-h-[140px]"
          />
          <span className="absolute right-3 bottom-3 pointer-events-none text-[10px] font-display uppercase tracking-[0.14em] text-mist-700">
            ⌘ + ↵
          </span>
        </div>

        {/* Detected characters / canon — shown only when the prompt has names */}
        {anchors.cast.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-mist-500">
            <span className="font-display uppercase tracking-[0.14em] text-[10px] text-ankaa-400">Detected</span>
            {anchors.cast.map((c) => (
              <span key={c} className="px-2 py-0.5 rounded-full border border-ankaa-500/50 bg-ankaa-500/10 text-ankaa-300 font-display">{c}</span>
            ))}
            <span className="text-mist-600">— Ankaa will build the piece around these.</span>
          </p>
        )}

        {/* Secondary controls — revealed below the prompt */}
        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.2em] text-mist-500 mb-2.5">Approach</p>
            <Select value={mode} onChange={(e) => setMode(e.target.value as AnkaaMode)} aria-label="Writing mode">
              {MODES.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.hint}</option>)}
            </Select>
          </div>
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.2em] text-mist-500 mb-2.5">Source document</p>
            <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)} aria-label="Source document">
              <option value="">No source — write an original story</option>
              {readyDocs.map((d) => <option key={d.id} value={d.id}>{d.title} · {d.author}</option>)}
            </Select>
          </div>
        </div>

        <Button variant="gold" size="lg" className="w-full mt-5" onClick={() => void generate()} loading={running} disabled={running}>
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenTool className="w-4 h-4" />}
          {running ? "Ankaa is writing…" : "Begin the draft"}
        </Button>
        {!serverOnline && (
          <p className="text-[11px] text-mist-600 leading-relaxed mt-3 flex items-start gap-1.5">
            <MessageCircleHeart className="w-3 h-3 text-ankaa-500 mt-0.5 shrink-0" />
            <span>Tip: with an OpenRouter key set in Settings, Ankaa runs a true multi-section pipeline (outline → 5 sections → bind) on the model you choose.</span>
          </p>
        )}
      </Panel>

      {/* ─── job board + story shelf ─── */}
      <div className="space-y-5 min-w-0">
          {live && current && (
            <Panel className={cx(
              "p-5 sm:p-6 hover-lift",
              live.status === "done" && "border-ok-500/40",
              live.status === "failed" && "border-danger-500/40"
            )}>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className={cx(
                  "w-10 h-10 rounded-xl border flex items-center justify-center shrink-0",
                  live.status === "done" ? "border-ok-500/50 bg-ok-500/10 text-ok-400" :
                  live.status === "failed" ? "border-danger-500/50 bg-danger-500/10 text-danger-400" :
                  "border-ankaa-500/50 bg-ankaa-500/10 text-ankaa-400"
                )}>
                  {live.status === "done" ? <CheckCircle2 className="w-5 h-5" /> : live.status === "failed" ? <XCircle className="w-5 h-5" /> : <PenTool className="w-5 h-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-display text-mist-100 truncate">{current.title}</p>
                  <p className="text-[11px] text-mist-500 flex items-center gap-1.5 flex-wrap">
                    <span>background job</span>
                    <span className="text-mist-600">·</span>
                    <span className="text-ankaa-300 tabular-nums">{live.words.toLocaleString()} words</span>
                    <span className="text-mist-600">so far</span>
                    {live.status === "running" && live.etaSec && (
                      <>
                        <span className="text-mist-600">·</span>
                        <Clock3 className="w-3 h-3" />~{live.etaSec}s left
                      </>
                    )}
                  </p>
                </div>
                {live.status === "done" && <Badge tone="ok">complete</Badge>}
                {live.status === "failed" && <Badge tone="danger">failed</Badge>}
              </div>

              <div className="flex items-center gap-3 mb-4">
                <Progress value={live.status === "done" ? 100 : (live.stepIdx / steps.length) * 100} tone={live.status === "done" ? "ok" : "gold"} />
                <span className="text-[11px] font-display text-gold-300 tabular-nums shrink-0">
                  {live.status === "done" ? 100 : Math.round((live.stepIdx / steps.length) * 100)}%
                </span>
              </div>

              <ol className="grid sm:grid-cols-2 gap-x-4 gap-y-2 mb-4">
                {steps.map((s, i) => {
                  const state = live.status === "done" || i < live.stepIdx ? "done" : i === live.stepIdx && live.status === "running" ? "now" : live.status === "failed" && i === live.stepIdx ? "fail" : "todo";
                  return (
                    <li key={s} className="flex items-center gap-2.5 text-[13px]">
                      {state === "done" ? <CheckCircle2 className="w-4 h-4 text-ok-400 shrink-0" />
                        : state === "now" ? <Loader2 className="w-4 h-4 animate-spin text-ankaa-400 shrink-0" />
                        : state === "fail" ? <XCircle className="w-4 h-4 text-danger-400 shrink-0" />
                        : <Circle className="w-4 h-4 text-ink-600 shrink-0" />}
                      <span className={cx(
                        state === "now" && "text-ankaa-300",
                        state === "done" && "text-mist-300",
                        state === "fail" && "text-danger-400",
                        state === "todo" && "text-mist-600"
                      )}>{s}</span>
                    </li>
                  );
                })}
              </ol>

              {live.error && <p className="text-xs text-danger-400 mb-3 leading-relaxed">{live.error}</p>}

              {live.status === "done" && current.body && (
                <div className="flex flex-wrap gap-2.5 pt-3 border-t border-ink-700/60">
                  <Button variant="gold" size="sm" onClick={() => setPreview(current)}><Eye className="w-3.5 h-3.5" />Read the draft</Button>
                  <Button variant="outline" size="sm" onClick={() => void saveToLibrary(current)}><Save className="w-3.5 h-3.5" />Save to library</Button>
                  <Button variant="ghost" size="sm" onClick={async () => { await navigator.clipboard.writeText(current.body); toast("success", "Draft copied to clipboard."); }}>
                    <Copy className="w-3.5 h-3.5" />Copy
                  </Button>
                </div>
              )}
            </Panel>
          )}

          {/* story shelf */}
          <div>
            <div className="flex items-center justify-between mb-3 gap-3">
              <h2 className="text-[11px] font-display uppercase tracking-[0.2em] text-mist-500">Earlier drafts</h2>
              {(storiesQ.data ?? []).length > 0 && (
                <span className="text-[11px] font-display text-mist-600 tabular-nums">{(storiesQ.data ?? []).length} total</span>
              )}
            </div>
            {storiesQ.loading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : (storiesQ.data ?? []).length === 0 ? (
              <Panel>
                <EmptyState
                  icon={<PenLine className="w-5 h-5" />}
                  title="The desk drawer is empty"
                  body="Drafts you finish land here — preview them, keep them in the library, or let them go."
                />
              </Panel>
            ) : (
              <ul className="space-y-2.5">
                {(storiesQ.data ?? []).map((s) => (
                  <li key={s.id} className="panel p-4 flex items-center gap-3.5 hover-lift">
                    <span className={cx(
                      "w-9 h-9 rounded-lg border flex items-center justify-center shrink-0",
                      s.status === "done" ? "border-ankaa-500/50 bg-ankaa-500/10 text-ankaa-400" :
                      s.status === "failed" ? "border-danger-500/50 bg-danger-500/10 text-danger-400" :
                      "border-ink-600 bg-ink-800 text-mist-500"
                    )}>
                      {s.status === "done" ? <PenTool className="w-4 h-4" /> : s.status === "failed" ? <XCircle className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-mist-200 truncate font-medium">{s.title}</p>
                      <p className="text-[11px] text-mist-600 flex items-center gap-1.5 flex-wrap">
                        <span>{timeAgo(s.createdAt)}</span>
                        <span className="text-mist-700">·</span>
                        <span>{s.body ? fmtWords(s.body.split(/\s+/).filter(Boolean).length) : s.step}</span>
                        {s.status === "failed" && s.error ? <><span className="text-mist-700">·</span><span className="text-danger-400 truncate">{s.error}</span></> : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {s.status === "done" && (
                        <>
                          <Button size="xs" variant="ghost" onClick={() => setPreview(s)}><Eye className="w-3.5 h-3.5" />Read</Button>
                          <Button size="xs" variant="outline" onClick={() => void saveToLibrary(s)}><Save className="w-3.5 h-3.5" />Keep</Button>
                        </>
                      )}
                      <button
                        aria-label={`Delete draft ${s.title}`}
                        onClick={async () => { await idbDelete("stories", s.id); if (current?.id === s.id) setCurrent(null); toast("info", "Draft discarded."); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-mist-600 hover:text-danger-400 hover:bg-danger-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
      </div>

      {/* ─── preview dialog ─── */}
      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview?.title ?? ""} wide>
        {preview && (
          <>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-ink-700/60">
              <Badge tone="ankaa"><PenTool className="w-3 h-3" />Ankaa draft</Badge>
              <span className="text-[11px] text-mist-500">{preview.body.split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
              <span className="text-[11px] text-mist-600">·</span>
              <span className="text-[11px] text-mist-500">{timeAgo(preview.createdAt)}</span>
            </div>
            <div className="max-h-[55vh] overflow-y-auto pr-2 -mr-2 reader-scope" data-rtheme="dark">
              <div className="reader-prose font-literata text-[15px] leading-[1.85] text-[var(--r-fg)] space-y-4">
                {preview.body.split(/\n{2,}/).map((p, i) => <p key={i} className={i === 0 ? "dropcap" : undefined}>{p}</p>)}
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-ink-700 flex flex-wrap items-center gap-3">
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={async () => { await navigator.clipboard.writeText(preview.body); toast("success", "Copied."); }}>
                <Copy className="w-3.5 h-3.5" />Copy
              </Button>
              <Button variant="gold" size="sm" onClick={() => void saveToLibrary(preview)}><Save className="w-3.5 h-3.5" />Save to library</Button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
