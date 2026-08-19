import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  MessageCircleHeart, ScrollText, Send, RefreshCw, Clapperboard, BookOpen, Trash2,
  Bookmark, Highlighter, ChevronLeft, ChevronRight, Sun, Moon, Coffee, RotateCcw, StopCircle, PenLine,
  Copy, Quote, Eraser, PenTool, Eye, Save, Loader2, HelpCircle, Compass, Lightbulb, Languages, ListChecks, FilePlus2,
  Columns2,
} from "lucide-react";
import { Sheet, Button, IconBtn, Badge, Slider, Select, Toggle, Segmented, Skeleton, Tabs, Progress, Dialog } from "../components/ui";
import { usePrefs, useNav, useShallow, toast } from "../lib/store";
import { useScenes, useBookmarks, useAnnotations, putScenes, removeBookmark, removeAnnotation, putStory, patchStory, saveStoryToLibrary, appendChapterToDocument } from "../lib/data";
import { askLumaStream, getOuroArtifact, TASK_TITLES, LUMA_QUESTIONS, cinematizeChapter, regenerateScene, CINEMA_STEPS, AiUnavailable, activeModelFor, runAnkaaLong, ankaaSteps, detectDepth, ankaaSectionsFor, aiConfigured, type OuroTask, type OuroArtifact, type AnkaaDepth } from "../lib/ai";
import { enqueueJob } from "../lib/jobs";
import { getUserId } from "../lib/db";
import type { AnkaaMode, ChatMsg, DocumentRow, QuizQuestion, ReaderFontId, SceneDraft, StoryRow } from "../lib/types";
import { cx, uid, clamp } from "../lib/utils";

/* ================= Companion drawer (Luma + Ouro + Ankaa) ================= */

export type CompanionTab = "luma" | "ouro" | "ankaa";

export function CompanionDrawer({ open, onClose, doc, chapterIndex, tab, setTab, selection }: {
  open: boolean; onClose: () => void; doc: DocumentRow; chapterIndex: number;
  tab: CompanionTab; setTab: (t: CompanionTab) => void; selection: string | null;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      width="max-w-lg"
      title={
        <Tabs
          value={tab}
          onChange={(id) => setTab(id as CompanionTab)}
          tabs={[
            { id: "luma", label: "Luma", icon: <MessageCircleHeart className="w-3.5 h-3.5" /> },
            { id: "ouro", label: "Ouro", icon: <ScrollText className="w-3.5 h-3.5" /> },
            { id: "ankaa", label: "Ankaa", icon: <PenTool className="w-3.5 h-3.5" /> },
          ]}
        />
      }
    >
      {/* All three panels stay MOUNTED and are hidden via CSS when not the
          active tab — this preserves their useState (chat messages, study
          feed, draft prompt, live job state) across tab switches. */}
      <div className={cx("flex flex-col h-full", tab !== "luma" && "hidden")} aria-hidden={tab !== "luma"}>
        <LumaChat doc={doc} chapterIndex={chapterIndex} selection={selection} />
      </div>
      <div className={cx("flex flex-col h-full", tab !== "ouro" && "hidden")} aria-hidden={tab !== "ouro"}>
        <OuroPanel doc={doc} chapterIndex={chapterIndex} />
      </div>
      <div className={cx("flex flex-col h-full", tab !== "ankaa" && "hidden")} aria-hidden={tab !== "ankaa"}>
        <AnkaaPanel doc={doc} />
      </div>
    </Sheet>
  );
}

/* ---------- lightweight rich text (bold, italics, quotes, bullets) ---------- */

function InlineRich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold text-mist-100">{p.slice(2, -2)}</strong>;
        if (p.startsWith("_") && p.endsWith("_") && p.length > 2) return <em key={i} className="opacity-75">{p.slice(1, -1)}</em>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function RichText({ text }: { text: string }) {
  const blocks = text.split("\n");
  return (
    <div className="space-y-2">
      {blocks.map((ln, i) => {
        if (ln.startsWith("> ")) {
          return <blockquote key={i} className="border-l-2 border-gold-600/70 pl-3 my-1 italic opacity-90 font-literata leading-relaxed"><InlineRich text={ln.slice(2)} /></blockquote>;
        }
        if (ln.startsWith("- ")) {
          return (
            <div key={i} className="flex gap-2.5">
              <span className="text-gold-500 shrink-0 leading-relaxed mt-0.5">·</span>
              <span className="flex-1"><InlineRich text={ln.slice(2)} /></span>
            </div>
          );
        }
        if (!ln.trim()) return <div key={i} className="h-1.5" />;
        return <p key={i} className="leading-relaxed"><InlineRich text={ln} /></p>;
      })}
    </div>
  );
}

/* ---------- Luma — streaming chat ---------- */

function clipQuote(s: string, n = 140): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function LumaChat({ doc, chapterIndex, selection }: { doc: DocumentRow; chapterIndex: number; selection: string | null }) {
  const motion = usePrefs((s) => s.prefs.reader.motion);
  // OpenRouter key status — synchronous peek at the in-memory key set via
  // `setSessionKey()` (typically from Settings). The Luma header pill
  // ("online" vs "Anchor engine") reflects whether a key is set.
  const serverOnline = aiConfigured();
  const storeKey = `lemniscate:luma:${doc.id}`;
  const chapterTitle = doc.contentJson.chapters[chapterIndex]?.title ?? "this chapter";
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) return JSON.parse(raw) as ChatMsg[];
    } catch { /* fresh thread */ }
    return [{ id: uid("m"), role: "assistant", at: Date.now(), text: `Hello — I’m Luma, reading “${doc.title}” beside you. Ask about this chapter, a passage, a word — or have me paint the scene.` }];
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [lastOffline, setLastOffline] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Mirror `messages` into a ref so `send` can read the latest history
  // without depending on `messages` in its deps. This keeps the
  // `regenerate` → `send` flow correct: `send` always sees the post-slice
  // state, not the stale closure value (which would re-send the old bot
  // response as context and duplicate the user message).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify(messages.slice(-30))); } catch { /* full */ }
    endRef.current?.scrollIntoView({ behavior: motion ? "smooth" : "auto", block: "end" });
  }, [messages, storeKey, motion]);

  const append = useCallback((msgId: string, chunk: string) => {
    setMessages((m) => m.map((x) => (x.id === msgId ? { ...x, text: x.text + chunk } : x)));
  }, []);

  const send = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    const userMsg: ChatMsg = { id: uid("m"), role: "user", text: q, at: Date.now() };
    const botId = uid("m");
    setMessages((m) => [...m, userMsg, { id: botId, role: "assistant", text: "", at: Date.now() }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLastOffline(null);
    try {
      const history = messagesRef.current.filter((m) => m.text).map((m) => ({ role: m.role, text: m.text }));
      const res = await askLumaStream(doc, chapterIndex, q, history, (chunk) => append(botId, chunk), ctrl.signal);
      setModel(res.model ?? null);
      setLastOffline(res.offline);
    } catch (e) {
      if (ctrl.signal.aborted) {
        setMessages((m) => m.map((x) => (x.id === botId && !x.text ? { ...x, text: "_Stopped._" } : x)));
      } else {
        const msg = e instanceof AiUnavailable ? e.message : "Luma lost the thread for a moment. Try again?";
        setMessages((m) => m.map((x) => (x.id === botId && !x.text ? { ...x, text: msg } : x)));
        if (e instanceof AiUnavailable) toast("error", msg);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }, [busy, doc, chapterIndex, append]);

  const regenerate = useCallback(() => {
    const lastUser = [...messagesRef.current].reverse().find((m) => m.role === "user");
    if (!lastUser || busy) return;
    const idx = messagesRef.current.findIndex((x) => x.id === lastUser.id);
    // Slice off the last user message AND any bot response that followed it,
    // then synchronously update the ref so `send` reads the trimmed history.
    // `send` adds a fresh user message + bot placeholder, so keeping the old
    // user message would duplicate it in the UI.
    const trimmed = messagesRef.current.slice(0, idx);
    messagesRef.current = trimmed;
    setMessages(trimmed);
    void send(lastUser.text);
  }, [busy, send]);

  const clearThread = useCallback(() => {
    setMessages([{ id: uid("m"), role: "assistant", at: Date.now(), text: `Fresh page. What shall we look at in “${chapterTitle}”?` }]);
    setModel(null);
    setLastOffline(null);
    try { localStorage.removeItem(storeKey); } catch { /* ignore */ }
  }, [chapterTitle, storeKey]);

  const autosize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(140, el.scrollHeight) + "px";
  };

  return (
    <div className="flex flex-col h-full">
      {/* header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-ink-700 flex items-center gap-3 shrink-0 bg-ink-875/50">
        <span className={cx(
          "relative w-10 h-10 rounded-xl border flex items-center justify-center font-garamond italic text-lg shrink-0 transition-colors",
          busy ? "border-gold-400 bg-gold-500/20 text-gold-200" : "border-gold-700/60 bg-gold-500/10 text-gold-300"
        )}>
          L
          <span className={cx("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-ink-875", busy ? "bg-warn-400 animate-pulse" : "bg-ok-500")} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-display text-mist-100 flex items-center gap-2 leading-tight">
            Luma
            {model
              ? <span className="text-[10px] font-mono text-mist-500 truncate max-w-32">{model}</span>
              : <Badge tone={serverOnline ? "gold" : "muted"}>{serverOnline ? "online" : "Anchor engine"}</Badge>}
          </p>
          <p className="text-[11px] text-mist-500 truncate mt-0.5">grounded in “{chapterTitle}”</p>
        </div>
        <IconBtn label="Clear conversation" onClick={clearThread}><Eraser className="w-4 h-4" /></IconBtn>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1;
          const streaming = busy && isLast && m.role === "assistant";
          return m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13px] leading-relaxed bg-gold-500/15 border border-gold-700/50 text-mist-100 whitespace-pre-wrap">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="group">
              <div className="rounded-2xl border border-ink-700 bg-ink-800/80 px-4 py-3.5 text-[13px] leading-relaxed text-mist-300">
                {!m.text ? (
                  <span className="inline-flex items-center gap-1.5 text-mist-500 py-1" aria-label="Luma is thinking">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-400/60 animate-pulse [animation-delay:120ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-400/30 animate-pulse [animation-delay:240ms]" />
                  </span>
                ) : (
                  <>
                    <RichText text={m.text} />
                    {streaming && <span className="inline-block w-[7px] h-[15px] bg-gold-400/80 ml-0.5 align-[-2px] animate-pulse rounded-sm" aria-hidden />}
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5 pl-1 min-h-6">
                {m.text && !streaming && (
                  <>
                    <button
                      onClick={() => { void navigator.clipboard.writeText(m.text).then(() => toast("success", "Copied to clipboard.")); }}
                      className="text-[10px] font-display uppercase tracking-[0.14em] text-mist-600 hover:text-gold-300 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    >
                      <Copy className="w-3 h-3" />Copy
                    </button>
                    {isLast && !busy && (
                      <button
                        onClick={regenerate}
                        className="text-[10px] font-display uppercase tracking-[0.14em] text-mist-600 hover:text-gold-300 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      >
                        <RefreshCw className="w-3 h-3" />Regenerate
                      </button>
                    )}
                    {lastOffline !== null && isLast && (
                      <span className="text-[10px] font-display text-mist-600 ml-auto">{lastOffline ? "Anchor engine" : "live model"}</span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        <div ref={endRef} />
      </div>

      {/* ask about the reader selection */}
      {selection && !busy && (
        <div className="px-4 sm:px-5 pb-2 shrink-0">
          <button
            onClick={() => void send(`Explain this passage: “${clipQuote(selection)}”`)}
            className="w-full flex items-center gap-2.5 rounded-xl border border-gold-700/50 bg-gold-500/[0.07] px-3 py-2.5 text-left hover:bg-gold-500/[0.13] hover:border-gold-600/70 transition-all press"
          >
            <Quote className="w-4 h-4 text-gold-400 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-display uppercase tracking-[0.16em] text-gold-400">Ask about your selection</span>
              <span className="block text-xs text-mist-400 italic font-literata truncate mt-0.5">“{selection}”</span>
            </span>
          </button>
        </div>
      )}

      {/* quick prompts — the single home for Luma's templates */}
      <div className="px-4 sm:px-5 pb-2 shrink-0">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
          {LUMA_QUESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => void send(s)}
              disabled={busy}
              className="shrink-0 text-[11px] font-display px-3 py-1.5 rounded-full border border-ink-600 text-mist-400 hover:border-gold-700 hover:text-gold-300 hover:bg-ink-750/60 transition-all disabled:opacity-40 disabled:pointer-events-none"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* composer */}
      <form
        className="px-4 sm:px-5 pb-5 pt-1.5 shrink-0"
        onSubmit={(e) => { e.preventDefault(); void send(input); }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-ink-600 bg-ink-850 focus-within:border-gold-600 focus-within:shadow-[0_0_0_3px_var(--acc-soft)] transition-all p-2">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => { setInput(e.target.value); autosize(e.target); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); }
            }}
            placeholder="Ask about the text…"
            aria-label="Ask Luma"
            className="flex-1 bg-transparent resize-none outline-none text-sm text-mist-100 placeholder:text-mist-600 max-h-[140px] px-2 py-1.5 leading-relaxed"
          />
          {busy ? (
            <Button type="button" variant="danger" size="sm" aria-label="Stop answer" onClick={() => abortRef.current?.abort()}>
              <StopCircle className="w-4 h-4" />
            </Button>
          ) : (
            <Button type="submit" variant="gold" size="sm" aria-label="Send question" disabled={!input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-[10px] text-mist-600 mt-1.5 px-1 hidden sm:block">Enter to send · Shift+Enter for a new line</p>
      </form>
    </div>
  );
}

/* ---------- Ouro — study companion (ask, then build) ----------
   Ouro starts by asking what you actually need and builds ONE focused
   artifact per request — summary, quiz, guide, themes, vocab, essays or
   the full set. Results accumulate as cards and are cached per task+scope,
   so chapter work and whole-text work stay distinct. */

const OURO_TASKS: { task: OuroTask; label: string; icon: typeof BookOpen; hint: string }[] = [
  { task: "summary", label: "Summary", icon: BookOpen, hint: "What happens, distilled" },
  { task: "quiz", label: "Quiz me", icon: HelpCircle, hint: "Sourced multiple-choice" },
  { task: "guide", label: "Study guide", icon: Compass, hint: "Objectives + close-reading steps" },
  { task: "themes", label: "Themes & cast", icon: Lightbulb, hint: "Motifs and their carriers" },
  { task: "vocab", label: "Vocabulary", icon: Languages, hint: "Words worth keeping" },
  { task: "essays", label: "Essay prompts", icon: PenLine, hint: "University-level questions" },
  { task: "full", label: "Full study set", icon: ListChecks, hint: "Everything in one pass" },
];

interface FeedItem {
  key: string;
  task: OuroTask;
  scope: "chapter" | "whole";
  status: "loading" | "done" | "error";
  artifact?: OuroArtifact;
  error?: string;
}

export function OuroPanel({ doc, chapterIndex }: { doc: DocumentRow; chapterIndex: number }) {
  const [scope, setScope] = useState<"chapter" | "whole">("chapter");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const chapterTitle = doc.contentJson.chapters[chapterIndex]?.title ?? "this chapter";
  const scopeLabel = scope === "chapter" ? `“${chapterTitle}”` : "the whole text";

  const request = useCallback(async (task: OuroTask) => {
    const itemScope = scope;
    const key = uid("ouro");
    setFeed((f) => [...f, { key, task, scope: itemScope, status: "loading" }]);
    try {
      const artifact = await getOuroArtifact(doc, itemScope === "chapter" ? chapterIndex : null, task);
      setFeed((f) => f.map((x) => (x.key === key ? { ...x, status: "done", artifact } : x)));
    } catch (e) {
      const msg = e instanceof AiUnavailable ? e.message : "Ouro couldn’t build that one. Try again?";
      setFeed((f) => f.map((x) => (x.key === key ? { ...x, status: "error", error: msg } : x)));
    }
  }, [doc, chapterIndex, scope]);

  return (
    <div className="flex flex-col h-full">
      {/* context strip */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-ink-700 shrink-0 bg-ink-875/50">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Segmented
            ariaLabel="Study scope"
            value={scope}
            onChange={(v) => setScope(v)}
            options={[{ value: "chapter", label: "This chapter" }, { value: "whole", label: "Whole text" }]}
          />
          <p className="text-[11px] text-mist-500 truncate">grounded in {scopeLabel}</p>
        </div>
      </div>

      {/* feed */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
        {feed.length === 0 && (
          <div className="text-center pt-6 pb-2">
            <span className="inline-flex w-12 h-12 rounded-2xl border border-ouro-500/50 bg-ouro-500/10 items-center justify-center mb-3">
              <ScrollText className="w-5 h-5 text-ouro-400" />
            </span>
            <p className="text-sm font-display text-mist-200">What do you need from {scopeLabel}?</p>
            <p className="text-xs text-mist-500 mt-1.5 max-w-xs mx-auto leading-relaxed">
              Tell me in the box below, or start with one of these — I’ll build exactly that, and cache it.
            </p>
          </div>
        )}

        {/* task tiles / chips */}
        {feed.length === 0 ? (
          <div className="grid grid-cols-2 gap-2.5">
            {OURO_TASKS.map((t) => (
              <button
                key={t.task}
                onClick={() => void request(t.task)}
                className="text-left rounded-xl border border-ink-600 bg-ink-875 px-3.5 py-3 hover:border-ouro-500/70 hover:bg-ink-800 hover-lift transition-all press"
              >
                <t.icon className="w-4 h-4 text-ouro-400 mb-1.5" />
                <span className="block text-xs text-mist-200 font-display">{t.label}</span>
                <span className="block text-[10px] text-mist-500 mt-0.5 leading-snug">{t.hint}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
            {OURO_TASKS.map((t) => (
              <button
                key={t.task}
                onClick={() => void request(t.task)}
                className="shrink-0 text-[11px] font-display px-3 py-1.5 rounded-full border border-ink-600 text-mist-400 hover:border-ouro-500/70 hover:text-ouro-300 hover:bg-ink-750/60 transition-all"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {feed.map((item) => (
          <div key={item.key} className="rounded-xl border border-ink-700 bg-ink-800/80 overflow-hidden hover-lift">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-ink-700/70 bg-ink-875/60">
              <span className="text-[10px] font-display uppercase tracking-[0.16em] text-ouro-300">{TASK_TITLES[item.task]}</span>
              <span className="text-[10px] text-mist-600">· {item.scope === "chapter" ? "this chapter" : "whole text"}</span>
              {item.status === "done" && item.artifact && (
                <Badge tone={item.artifact.offline ? "muted" : "ouro"} className="ml-auto">{item.artifact.offline ? "LOA" : "model"}</Badge>
              )}
              {item.status === "loading" && <Loader2 className="w-3.5 h-3.5 animate-spin text-ouro-400 ml-auto" />}
            </div>
            <div className="px-4 py-3.5 text-[13px] leading-relaxed text-mist-300">
              {item.status === "loading" && (
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-11/12" />
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3.5 w-9/12" />
                  <p className="text-[11px] text-mist-500 pt-1.5 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full border-2 border-ouro-400 border-t-transparent animate-spin inline-block" />
                    Ouro is reading carefully…
                  </p>
                </div>
              )}
              {item.status === "error" && (
                <div>
                  <p className="text-xs text-danger-400 mb-2.5">{item.error}</p>
                  <Button size="xs" variant="outline" onClick={() => void request(item.task)}><RefreshCw className="w-3 h-3" />Retry</Button>
                </div>
              )}
              {item.status === "done" && item.artifact && (
                <>
                  <RichText text={item.artifact.body} />
                  {item.artifact.quiz && item.artifact.quiz.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-ink-700/60"><QuizBlock quiz={item.artifact.quiz} /></div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ask Ouro directly */}
      <OuroAsk onAsk={(task) => void request(task)} />
    </div>
  );
}

function OuroAsk({ onAsk }: { onAsk: (task: OuroTask) => void }) {
  const [text, setText] = useState("");
  const pick = (): OuroTask => {
    const t = text.toLowerCase();
    if (/quiz|test|question/.test(t)) return "quiz";
    if (/guide|how (do|to) study|plan/.test(t)) return "guide";
    if (/theme|character|cast|motif/.test(t)) return "themes";
    if (/vocab|word|terminolog/.test(t)) return "vocab";
    if (/essay|prompt|write about/.test(t)) return "essays";
    if (/summar|recap|about/.test(t)) return "summary";
    return "full";
  };
  return (
    <form
      className="px-4 sm:px-5 pb-5 pt-1.5 shrink-0"
      onSubmit={(e) => { e.preventDefault(); onAsk(pick()); setText(""); }}
    >
      <div className="flex items-end gap-2 rounded-xl border border-ink-600 bg-ink-850 focus-within:border-ouro-500 focus-within:shadow-[0_0_0_3px_rgb(109_132_232_/_0.12)] transition-all p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. “quiz me on this chapter”"
          aria-label="Ask Ouro for a study task"
          className="flex-1 bg-transparent outline-none text-sm text-mist-100 placeholder:text-mist-600 px-2 py-1.5"
        />
        <Button type="submit" variant="gold" size="sm" aria-label="Build study artifact" disabled={!text.trim()}>
          <ScrollText className="w-4 h-4" />
        </Button>
      </div>
    </form>
  );
}

function OuroSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] font-display uppercase tracking-[0.2em] text-ouro-300 mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

function QuizBlock({ quiz }: { quiz: QuizQuestion[] }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const answered = Object.keys(answers).length;
  const correct = Object.entries(answers).filter(([qi, a]) => quiz[Number(qi)].answer === a).length;
  return (
    <OuroSection title={`Quiz — ${answered === 0 ? `${quiz.length} questions` : `${correct}/${answered} correct`}`}>
      <div className="space-y-3">
        {quiz.map((q, qi) => (
          <div key={qi} className="hairline rounded-lg bg-ink-875 p-3.5">
            <p className="text-[13px] text-mist-200 leading-relaxed mb-3">{q.q}</p>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {q.options.map((opt, oi) => {
                const chosen = answers[qi];
                const isAnswer = q.answer === oi;
                const isChosen = chosen === oi;
                return (
                  <button
                    key={oi}
                    onClick={() => chosen === undefined && setAnswers((a) => ({ ...a, [qi]: oi }))}
                    disabled={chosen !== undefined}
                    className={cx(
                      "text-left text-xs px-3 py-2 rounded-lg border transition-all press",
                      chosen === undefined && "border-ink-600 text-mist-300 hover:border-ouro-500 hover:text-ouro-300 hover:bg-ink-800",
                      chosen !== undefined && isAnswer && "border-ok-500/60 bg-ok-500/10 text-ok-400",
                      chosen !== undefined && isChosen && !isAnswer && "border-danger-500/60 bg-danger-500/10 text-danger-400",
                      chosen !== undefined && !isChosen && !isAnswer && "border-ink-700 text-mist-600"
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {answers[qi] !== undefined && <p className="text-[11px] text-mist-500 mt-2.5 italic font-literata leading-relaxed">Source: “{q.why}”</p>}
          </div>
        ))}
      </div>
    </OuroSection>
  );
}

/* ---------- Ankaa — write from inside the reader ---------- */

const ANKAA_MODES: { id: AnkaaMode; label: string; hint: string }[] = [
  { id: "continue", label: "Continue", hint: "Pick up where the text left off" },
  { id: "chapter", label: "New chapter", hint: "Draft the next chapter" },
  { id: "whatif", label: "What if…", hint: "One hinge, another door" },
  { id: "alternate", label: "Alternate ending", hint: "Fork the last turning point" },
  { id: "lore", label: "World lore", hint: "Histories the text only implies" },
  { id: "children", label: "For children", hint: "The same story, gentler hands" },
];

export function AnkaaPanel({ doc }: { doc: DocumentRow }) {
  const openDoc = useNav((s) => s.openDoc);
  const [mode, setMode] = useState<AnkaaMode>("continue");
  const [prompt, setPrompt] = useState("");
  // The reader's Ankaa panel always has a source document attached, so depth
  // is normally "long" — but a user who types "short scene about X" should
  // still get a short draft. detectDepth honors short-form cue words even
  // when a doc is present (the doc just means the writer is continuing
  // from a book, not that they want a full chapter).
  const depth = useMemo<AnkaaDepth>(() => {
    // If the user typed a short-form cue, honor it even with a doc attached.
    const q = prompt.trim().toLowerCase();
    if (/\b(short|brief|scene|moment|flash|vignette|drabble|paragraph|sketch)\b/.test(q)) return "short";
    return detectDepth(prompt, doc);
  }, [prompt, doc]);
  const steps = useMemo(() => ankaaSteps(depth), [depth]);
  const [live, setLive] = useState<{ stepIdx: number; words: number; status: "running" | "done" | "failed"; error?: string } | null>(null);
  const [result, setResult] = useState<{ id: string; title: string; body: string; words: number; offline: boolean } | null>(null);
  const [preview, setPreview] = useState(false);
  const [appending, setAppending] = useState(false);
  const [appended, setAppended] = useState(false);
  const running = live?.status === "running";

  /** Weave the finished draft into THIS book as a new chapter, so the story
   *  continues in place rather than living on a separate shelf. */
  const append = async () => {
    if (!result || appending) return;
    setAppending(true);
    try {
      const chapterTitle = result.title.includes("—") ? result.title.split("—").pop()!.trim() : result.title;
      await appendChapterToDocument(doc.id, chapterTitle, result.body);
      setAppended(true);
      toast("success", `Added “${chapterTitle}” as chapter ${doc.chapterCount + 1} of “${doc.title}”.`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn’t append the draft.");
    } finally {
      setAppending(false);
    }
  };

  const generate = async () => {
    if (running) return;
    // Capture depth at dispatch time so the running job keeps its own snapshot
    // even if the user keeps typing.
    const runDepth = depth;
    const id = uid("story");
    setResult(null);
    setPreview(false);
    setAppended(false);
    setLive({ stepIdx: 0, words: 0, status: "running" });
    const story: StoryRow = {
      id, userId: getUserId(), title: `Draft — ${doc.title}`, mode, body: "",
      sourceDocumentId: doc.id, status: "running", progress: 0, step: "Queued", error: null, createdAt: Date.now(),
    };
    await putStory(story);
    enqueueJob({
      label: `Ankaa · ${ANKAA_MODES.find((m) => m.id === mode)?.label ?? "draft"}`,
      bot: "ankaa",
      kind: mode,
      documentId: doc.id,
      steps,
      run: async (report) =>
        runAnkaaLong(mode, prompt, doc, (stepIdx, frac, words) => {
          report({ step: stepIdx, fraction: frac, words });
          setLive((l) => (l && l.status === "running" ? { ...l, stepIdx, words } : l));
          void patchStory(id, { step: steps[stepIdx], progress: Math.round(((stepIdx + frac) / steps.length) * 100) });
        }, undefined, runDepth),
      onDone: async (res) => {
        await putStory({ ...story, title: res.title, body: res.body, status: "done", progress: 100, step: "Complete" });
        setResult({ id, title: res.title, body: res.body, words: res.words, offline: res.offline });
        setLive({ stepIdx: steps.length, words: res.words, status: "done" });
        toast("success", `Ankaa finished — ${res.words.toLocaleString()} words${res.offline ? " (Anchor engine)" : ""}.`);
      },
      onError: async (err) => {
        await patchStory(id, { status: "failed", error: err.message });
        setLive({ stepIdx: 0, words: 0, status: "failed", error: err.message });
        toast("error", err.message);
      },
    });
  };

  const save = async () => {
    if (!result) return;
    const row = await saveStoryToLibrary({
      id: result.id, userId: getUserId(), title: result.title, mode, body: result.body,
      sourceDocumentId: doc.id, status: "done", progress: 100, step: "Complete", error: null, createdAt: Date.now(),
    });
    toast("success", `“${row.title}” is now in your library.`);
    openDoc(row.id);
  };

  const stepLabel = running ? steps[clamp(live?.stepIdx ?? 0, 0, steps.length - 1)] : null;

  return (
    <div className="flex flex-col h-full">
      {/* context strip */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-ink-700 flex items-center gap-3 shrink-0 bg-ink-875/50">
        <span className="w-10 h-10 rounded-xl border border-ankaa-500/50 bg-ankaa-500/10 flex items-center justify-center font-garamond italic text-lg text-ankaa-300 shrink-0">A</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-display text-mist-100 leading-tight">Ankaa · long-form</p>
          <p className="text-[11px] text-mist-500 truncate mt-0.5">writing from “{doc.title}” — runs in the background</p>
        </div>
        <Badge tone={activeModelFor("ankaa").startsWith("meridian/") || !aiConfigured() ? "muted" : "ok"}>
          {aiConfigured() ? "model" : "Anchor engine"}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-5">
        {/* approach */}
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.2em] text-mist-500 mb-2.5">Approach</p>
          <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Writing approach">
            {ANKAA_MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                className={cx(
                  "text-left rounded-xl border p-3 transition-all press",
                  mode === m.id ? "border-ankaa-500/70 bg-ankaa-500/[0.09] shadow-[0_0_0_3px_rgb(219_129_76_/_0.10)]" : "border-ink-600 hover:border-ink-500 bg-ink-875 hover:bg-ink-800"
                )}
              >
                <span className={cx("block text-xs font-display", mode === m.id ? "text-ankaa-300" : "text-mist-200")}>{m.label}</span>
                <span className="block text-[10px] text-mist-500 mt-0.5 leading-snug">{m.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* prompt */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-display uppercase tracking-[0.2em] text-mist-500">What should it be about?</p>
            <Badge tone="ankaa" title={`${ankaaSectionsFor(depth)} sections · ${depth}-form draft`}>
              {depth === "short" ? "Short-form" : depth === "medium" ? "Medium-form" : "Long-form"}
              <span className="opacity-60 ml-1">· {ankaaSectionsFor(depth)}</span>
            </Badge>
          </div>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Optional but powerful — name characters, places, tone. e.g. “A winter storm, an unsent letter, and ${doc.author === "Unknown author" ? "the keeper's confession" : "a confession at the door"}.”`}
            aria-label="Ankaa writing prompt"
            className="w-full rounded-xl border border-ink-600 bg-ink-850 px-3.5 py-3 text-sm text-mist-100 placeholder:text-mist-600 focus:border-ankaa-500 focus:shadow-[0_0_0_3px_rgb(219_129_76_/_0.12)] outline-none transition-all resize-y leading-relaxed"
          />
          <p className="text-[10px] text-mist-600 mt-1.5 leading-relaxed">Everything you name becomes canon — Ankaa weaves it through every section. Type “short scene…” to get a brief draft instead of a full chapter.</p>
        </div>

        {/* progress / result */}
        {running && live && (
          <div className="rounded-xl border border-ankaa-500/40 bg-ankaa-500/[0.06] p-4">
            <div className="flex items-center gap-2.5 mb-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-ankaa-400" />
              <p className="text-xs font-display text-ankaa-300">{stepLabel}…</p>
              <span className="ml-auto text-[11px] text-mist-400 tabular-nums">{live.words.toLocaleString()} words</span>
            </div>
            <Progress value={((live.stepIdx + 0.4) / steps.length) * 100} />
            <p className="text-[10px] text-mist-600 mt-2 leading-relaxed">Visible in the header job tray — safe to keep reading meanwhile.</p>
          </div>
        )}

        {live?.status === "failed" && (
          <div className="rounded-xl border border-danger-500/40 bg-danger-500/[0.06] p-4">
            <p className="text-xs text-danger-400 mb-2.5 leading-relaxed">{live.error}</p>
            <Button size="sm" variant="outline" onClick={() => void generate()}><RefreshCw className="w-3.5 h-3.5" />Try again</Button>
          </div>
        )}

        {live?.status === "done" && result && (
          <div className="rounded-xl border border-ok-500/40 bg-ok-500/[0.06] p-4">
            <p className="text-sm font-display text-mist-100 mb-0.5">{result.title}</p>
            <p className="text-[11px] text-mist-500 mb-3.5">{result.words.toLocaleString()} words{result.offline ? " · Anchor engine" : ""} · written from this book’s context</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="gold" onClick={() => void append()} loading={appending} disabled={appended}>
                <FilePlus2 className="w-3.5 h-3.5" />{appended ? "Added to this book" : "Continue this book"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPreview(true)}><Eye className="w-3.5 h-3.5" />Read the draft</Button>
              <Button size="sm" variant="outline" onClick={() => void save()}><Save className="w-3.5 h-3.5" />Save separately</Button>
              <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(result.body).then(() => toast("success", "Copied to clipboard.")); }}>
                <Copy className="w-3.5 h-3.5" />Copy
              </Button>
            </div>
            {appended && (
              <p className="text-[10px] text-ok-400 mt-2.5 leading-relaxed">
                The draft is now chapter {doc.chapterCount + 1} of “{doc.title}” — find it in the chapter index (t) or keep reading.
              </p>
            )}
          </div>
        )}

        {!live && (
          <p className="text-[11px] text-mist-600 leading-relaxed">
            Ankaa outlines first, then writes section by section with a live word count. Length scales
            to your prompt — type “short scene…” for ~400 words, or leave it long for a full chapter
            (~2,500 with a model, ~1,800 with the Anchor engine).
          </p>
        )}
      </div>

      <div className="px-4 sm:px-5 pb-5 shrink-0">
        <Button variant="gold" className="w-full" onClick={() => void generate()} loading={running} disabled={running}>
          <PenTool className="w-4 h-4" />{running ? "Ankaa is writing…" : "Begin the draft"}
        </Button>
      </div>

      {/* preview */}
      <Dialog open={preview && !!result} onClose={() => setPreview(false)} title={result?.title ?? ""} wide>
        {result && (
          <>
            <div className="max-h-[52vh] overflow-y-auto pr-1 space-y-4 font-literata text-[15px] leading-relaxed text-mist-300">
              {result.body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <div className="flex flex-wrap justify-between items-center gap-2 mt-5 pt-4 border-t border-ink-700">
              <span className="text-[11px] text-mist-500 tabular-nums">{result.words.toLocaleString()} words</span>
              <div className="flex gap-2 flex-wrap">
                <Button variant="gold" onClick={() => { void append(); setPreview(false); }} loading={appending} disabled={appended}>
                  <FilePlus2 className="w-4 h-4" />{appended ? "Added" : "Continue this book"}
                </Button>
                <Button variant="outline" onClick={() => void save()}><Save className="w-4 h-4" />Save separately</Button>
                <Button variant="ghost" onClick={() => setPreview(false)}>Close</Button>
              </div>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}

/* ================= Scene view ================= */

/** Map a scene's mood string to a cinematic gradient for the card's letterbox strip. */
function moodGradient(mood: string): string {
  const m = (mood || "").toLowerCase();
  if (/dawn|morn|sun|gold|warm|amber|cream/.test(m)) return "linear-gradient(135deg, #2a1f12, #6b4d2a 35%, #c39a45 80%, #f0d088)";
  if (/night|dark|midnight|shadow|gloom|moon/.test(m)) return "linear-gradient(135deg, #06060c, #1a1a2e 45%, #16213e 90%)";
  if (/storm|rain|grey|gray|cold|winter|frost/.test(m)) return "linear-gradient(135deg, #0d141b, #2c3e50 50%, #4a5a6e 95%)";
  if (/dusk|sunset|ember|red|fire|blood|crimson/.test(m)) return "linear-gradient(135deg, #1a0808, #6b2e2a 40%, #c0392b 80%, #d97e4a)";
  if (/forest|green|nature|spring|moss|leaf/.test(m)) return "linear-gradient(135deg, #0d1810, #2d4a3e 50%, #4a7050 95%)";
  if (/sea|ocean|water|aqua|river/.test(m)) return "linear-gradient(135deg, #0a1620, #1e3a5f 50%, #4a90a4 95%)";
  if (/interior|indoors|lamp|candle|hearth/.test(m)) return "linear-gradient(135deg, #1a1206, #3a2e1a 40%, #6b4d2a 80%, #c39a45)";
  // cinematic default — gold-to-ink
  return "linear-gradient(135deg, #0a0a14, #2a1f12 40%, #6b4d2a 75%, #c39a45)";
}

/** Cinematic letterbox skeleton — pulses while scenes generate. */
function SceneSkeleton() {
  return (
    <div className="panel overflow-hidden" aria-hidden>
      <Skeleton className="h-32 w-full rounded-none" />
      <div className="p-5 sm:p-6 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-20 w-full mt-2" />
      </div>
    </div>
  );
}

export function ScenesView({ doc, chapterIndex, onExit, onPrev, onNext, onExitToChunk }: {
  doc: DocumentRow;
  chapterIndex: number;
  onExit: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Exit scene mode and scroll the reader to a specific chunk in this chapter.
   *  When provided, scene cards' "View source passage" button calls it; when
   *  absent, the source passage is shown inline as an expandable quote. */
  onExitToChunk?: (localChunkIdx: number) => void;
}) {
  const scenesQ = useScenes(doc.id);
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [genFrac, setGenFrac] = useState(0);
  const [engine, setEngine] = useState<"model" | "loa" | null>(null);
  const [incoming, setIncoming] = useState<SceneDraft[]>([]);
  const [layout, setLayout] = useState<"scenes" | "split">("scenes");
  const [mobileTab, setMobileTab] = useState<"scenes" | "text">("scenes");
  const [regenOrdinal, setRegenOrdinal] = useState<number | null>(null);
  const [expandedSource, setExpandedSource] = useState<number | null>(null);
  const genToken = useRef(0);
  const regenToken = useRef(0);
  const autoGen = useRef<Set<number>>(new Set());
  const chapter = doc.contentJson.chapters[chapterIndex];
  const chunks = useMemo(() => chapter?.chunks ?? [], [chapter]);
  const chapterScenes = useMemo(
    () => (scenesQ.data ?? []).filter((s) => s.chapterIndex === chapterIndex),
    [scenesQ.data, chapterIndex]
  );

  /* Generation is token-guarded: clicking Next/Previous mid-run invalidates
     the in-flight job, so stale results can never land on the wrong chapter,
     and each chapter auto-generates at most once per visit cycle. */
  const generate = useCallback(async (silent = false, salt = 0) => {
    const token = ++genToken.current;
    const stale = () => genToken.current !== token;
    setGenerating(true);
    setGenStep(0);
    setGenFrac(0);
    setIncoming([]);
    setExpandedSource(null);
    try {
      const res = await cinematizeChapter(
        doc, chapterIndex, salt,
        (i, f) => { if (!stale()) { setGenStep(i); setGenFrac(f); } },
        (s) => { if (!stale()) setIncoming((p) => [...p, s]); }
      );
      if (stale()) return;
      await putScenes(doc.id, chapterIndex, res.scenes);
      setEngine(res.offline ? "loa" : "model");
      if (!silent) toast("success", `Cinematized “${chapter?.title}” into ${res.scenes.length} scene${res.scenes.length === 1 ? "" : "s"}${res.offline ? " (Anchor engine)" : ""}.`);
    } catch (e) {
      if (stale()) return;
      toast("error", e instanceof AiUnavailable ? e.message : "Cinematization failed — try Regenerate; the Anchor engine will step in.");
    } finally {
      // keep `incoming` until persisted scenes arrive — no skeleton flicker
      if (!stale()) setGenerating(false);
    }
  }, [doc, chapterIndex, chapter?.title]);

  /* Per-scene regenerate: re-runs just one scene's AI call with a fresh salt
     and patches it into the persisted set without touching the others. */
  const regenerateOne = useCallback(async (ordinal: number) => {
    if (regenOrdinal !== null || generating) return;
    const token = ++regenToken.current;
    const stale = () => regenToken.current !== token;
    setRegenOrdinal(ordinal);
    try {
      const salt = 1 + Math.floor(Math.random() * 976);
      const scene = await regenerateScene(doc, chapterIndex, ordinal, salt);
      if (stale() || !scene) return;
      // Build the next scene set from whatever is currently on screen
      // (persisted chapterScenes, or the in-flight `incoming` drafts if
      // persistence hasn't landed yet), swap the targeted ordinal, and
      // recommit the whole chapter so putScenes can replace cleanly.
      const base: SceneDraft[] = chapterScenes.length
        ? chapterScenes.map((s) => ({ title: s.title, mood: s.mood, characters: s.characters, body: s.body }))
        : incoming;
      const next = base.map((s, i) => (i === ordinal ? scene : s));
      await putScenes(doc.id, chapterIndex, next);
      toast("success", `Scene ${ordinal + 1} rewritten.`);
    } catch (e) {
      if (stale()) return;
      toast("error", e instanceof AiUnavailable ? e.message : "Couldn't regenerate that scene — try again.");
    } finally {
      if (!stale()) setRegenOrdinal(null);
    }
  }, [doc, chapterIndex, chapterScenes, incoming, generating, regenOrdinal]);

  useEffect(() => {
    if (!scenesQ.loading && chapterScenes.length === 0 && !autoGen.current.has(chapterIndex) && !generating) {
      autoGen.current.add(chapterIndex);
      void generate(true, 0);
    }
  }, [scenesQ.loading, chapterScenes.length, chapterIndex, generate, generating]);

  // persisted scenes win; freshly landed scenes bridge the refetch gap
  const shown: SceneDraft[] = chapterScenes.length ? chapterScenes : incoming;

  // Best-matching source chunk for a scene — keyword overlap of the scene's
  // title + body against each chunk's text. Used by "View source passage".
  const sourceChunkFor = useCallback((scene: SceneDraft): number => {
    if (!chunks.length) return 0;
    const probe = (scene.title + " " + scene.body).toLowerCase();
    const words = Array.from(new Set(probe.split(/\W+/).filter((w) => w.length > 4))).slice(0, 24);
    let best = 0;
    let bestScore = -1;
    chunks.forEach((c, i) => {
      const t = c.text.toLowerCase();
      let score = 0;
      for (const w of words) if (t.includes(w)) score++;
      score -= i * 0.01; // FIFO tiebreak — earlier chunks win ties
      if (score > bestScore) { bestScore = score; best = i; }
    });
    return best;
  }, [chunks]);

  const handleViewSource = useCallback((ordinal: number) => {
    const scene = shown[ordinal];
    if (!scene) return;
    const localIdx = sourceChunkFor(scene);
    if (onExitToChunk) {
      onExitToChunk(localIdx);
    } else {
      setExpandedSource((cur) => (cur === ordinal ? null : ordinal));
    }
  }, [shown, sourceChunkFor, onExitToChunk]);

  // Rough scene-count estimate (mirrors cinematizeChapter's heuristic) so
  // the progress UX can say "scene 2 of 3 written" while the writer runs.
  const estimatedSceneCount = useMemo(() => {
    const text = chunks.map((c) => c.text).join("\n\n");
    return text.length > 5500 ? 3 : 2;
  }, [chunks]);

  const isSplit = layout === "split";
  const showSkeletons = shown.length === 0 && (generating || scenesQ.loading);
  const totalScenes = shown.length || estimatedSceneCount;
  const sceneGridClassName = isSplit
    ? "grid grid-cols-1 gap-5"
    : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-5";

  /* ── header ── */
  const headerActions = (
    <div className="flex items-center gap-2 flex-wrap">
      {engine && !generating && (
        <Badge tone={engine === "model" ? "ok" : "muted"}>
          {engine === "model"
            ? `ankaa · ${activeModelFor("ankaa").startsWith("meridian/") ? "smart router" : activeModelFor("ankaa").split("/").pop()}`
            : "Anchor engine"}
        </Badge>
      )}
      {/* desktop layout toggle */}
      <div className="hidden sm:block">
        <Segmented
          ariaLabel="Scene layout"
          value={layout}
          onChange={(v) => setLayout(v)}
          options={[
            { value: "scenes", label: <span className="inline-flex items-center gap-1.5"><Clapperboard className="w-3.5 h-3.5" />Scenes</span>, title: "Scenes only" },
            { value: "split", label: <span className="inline-flex items-center gap-1.5"><Columns2 className="w-3.5 h-3.5" />Split</span>, title: "Chapter text alongside scenes" },
          ]}
        />
      </div>
      {/* mobile tab toggle (Text / Scenes) */}
      <div className="sm:hidden">
        <Segmented
          ariaLabel="Mobile scene view"
          value={mobileTab}
          onChange={(v) => setMobileTab(v)}
          options={[
            { value: "scenes", label: <span className="inline-flex items-center gap-1.5"><Clapperboard className="w-3.5 h-3.5" />Scenes</span> },
            { value: "text", label: <span className="inline-flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" />Text</span> },
          ]}
        />
      </div>
      <Button variant="outline" size="sm" onClick={() => void generate(false, 1 + Math.floor(Math.random() * 976))} loading={generating}>
        <RefreshCw className="w-3.5 h-3.5" /><span className="hidden sm:inline">Regenerate</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={onExit}>
        <BookOpen className="w-3.5 h-3.5" /><span className="hidden sm:inline">Return to reading</span>
      </Button>
    </div>
  );

  /* ── progress panel (CINEMA_STEPS + "scene N of M written") ── */
  const progressPanel = generating && (
    <div className="panel p-5 sm:p-6 mb-6">
      <div className="flex items-center gap-3 mb-3">
        <Clapperboard className="w-5 h-5 text-gold-400 shrink-0 motion-safe:animate-pulse" />
        <p className="text-sm font-display text-mist-200 truncate flex-1">
          {CINEMA_STEPS[genStep]}
          {genStep === 2 && incoming.length > 0 ? (
            <span className="text-gold-300"> — scene {Math.min(incoming.length, estimatedSceneCount)} of {estimatedSceneCount} written…</span>
          ) : (
            <span className="text-mist-600">…</span>
          )}
        </p>
        <span className="text-xs text-mist-500 tabular-nums shrink-0">
          {Math.round(((genStep + genFrac) / CINEMA_STEPS.length) * 100)}%
        </span>
      </div>
      <Progress value={((genStep + genFrac) / CINEMA_STEPS.length) * 100} className="mb-4" />
      <p className="text-[11px] text-mist-600 leading-relaxed">
        Ankaa is staging the chapter — enlarging the prose into atmosphere, light and subtext rather than compressing it.
        {incoming.length > 0 && <span className="text-ankaa-300"> {incoming.length} scene{incoming.length === 1 ? "" : "s"} landed…</span>}
        <span className="block mt-1.5">Navigate freely — this run is bound to “{chapter?.title}”.</span>
      </p>
    </div>
  );

  /* ── chapter text panel (split-view, or mobile Text tab) ── */
  const chapterPanelContent = (
    <div className="panel p-5 sm:p-6 lg:sticky lg:top-6">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="w-3.5 h-3.5 text-gold-500" />
        <span className="text-[10px] font-display uppercase tracking-[0.18em] text-mist-500">Source chapter</span>
      </div>
      <h2 className="font-garamond italic text-xl sm:text-2xl text-mist-100 mb-5 leading-tight">{chapter?.title}</h2>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto scrollbar-thin pr-1 font-literata text-[15px] leading-relaxed text-mist-300">
        {chunks.map((c, i) => (
          <p key={i} className="whitespace-pre-wrap">{c.text}</p>
        ))}
        {chunks.length === 0 && <p className="text-mist-500 italic">This chapter has no readable text.</p>}
      </div>
    </div>
  );

  /* ── scenes column (progress + grid + nav) ── */
  const scenesColumnContent = (
    <>
      {progressPanel}

      {showSkeletons ? (
        <div className={sceneGridClassName}>
          {[...Array(2)].map((_, i) => <SceneSkeleton key={i} />)}
        </div>
      ) : (
        <div className={sceneGridClassName}>
          {shown.map((s, i) => {
            const sourceChunkIdx = sourceChunkFor(s);
            const sourceText = chunks[sourceChunkIdx]?.text ?? "";
            const sourceExcerpt = sourceText.length > 280 ? sourceText.slice(0, 279) + "…" : sourceText;
            const isRegen = regenOrdinal === i;
            const isExpanded = expandedSource === i;
            return (
              <motion.article
                key={`${s.title}-${i}`}
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.14, ease: [0.22, 1, 0.36, 1] }}
                className={cx(
                  "panel overflow-hidden hover-lift hover:border-gold-700/60 flex flex-col transition-opacity",
                  isRegen && "opacity-70"
                )}
              >
                {/* Cinematic letterbox strip with mood gradient */}
                <div className="relative aspect-[21/9] w-full overflow-hidden" aria-hidden>
                  <div className="absolute inset-0" style={{ background: moodGradient(s.mood) }} />
                  {/* subtle film-grain dots */}
                  <div
                    className="absolute inset-0 opacity-30 mix-blend-overlay"
                    style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1px)", backgroundSize: "3px 3px" }}
                  />
                  {/* letterbox bars top & bottom — the cinematic cue */}
                  <div className="absolute inset-x-0 top-0 h-3 bg-black/45" />
                  <div className="absolute inset-x-0 bottom-0 h-3 bg-black/45" />
                  {/* scene number badge */}
                  <span className="absolute top-3 right-3 inline-flex items-center gap-1.5 text-[10px] font-display uppercase tracking-[0.18em] text-white/95 bg-black/55 backdrop-blur-sm px-2.5 py-1 rounded-md border border-white/10">
                    <Clapperboard className="w-3 h-3" />Scene {i + 1} of {totalScenes}
                  </span>
                  {/* title overlay */}
                  <h2 className="absolute bottom-4 left-5 right-5 font-garamond italic text-2xl sm:text-3xl text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] leading-tight">
                    “{s.title}”
                  </h2>
                </div>

                {/* body */}
                <div className="p-5 sm:p-6 flex-1 flex flex-col">
                  <p className="text-xs text-mist-500 font-display tracking-wide mb-3">{s.mood}</p>
                  {s.characters.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {s.characters.map((c) => (
                        <span key={c} className="text-[11px] font-display px-2 py-0.5 rounded-full border border-ink-600 bg-ink-800 text-mist-200">{c}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-[15px] leading-relaxed text-mist-300 font-literata flex-1">{s.body}</p>

                  {/* actions */}
                  <div className="mt-5 pt-4 border-t border-ink-700/60 flex items-center gap-2 flex-wrap">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => handleViewSource(i)}
                      title={onExitToChunk ? "Open the source passage in the reader" : "Show the source passage"}
                    >
                      <Eye className="w-3.5 h-3.5" />View source passage
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => void regenerateOne(i)}
                      loading={isRegen}
                      disabled={generating || regenOrdinal !== null}
                      title="Re-run this scene with a new variation seed"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />{isRegen ? "Rewriting…" : "Regenerate scene"}
                    </Button>
                  </div>

                  {/* inline source passage (fallback when no onExitToChunk handler) */}
                  {isExpanded && sourceExcerpt && (
                    <p className="mt-3 text-xs text-mist-400 italic font-literata leading-relaxed border-l-2 border-gold-700/50 pl-3">
                      “{sourceExcerpt}”
                      <span className="block mt-1 not-italic text-[10px] font-display uppercase tracking-[0.14em] text-mist-600">passage {sourceChunkIdx + 1} of {chunks.length}</span>
                    </p>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      <nav className="mt-10 flex items-center justify-between gap-2" aria-label="Chapter navigation">
        <Button variant="outline" size="sm" disabled={chapterIndex === 0} onClick={onPrev}><ChevronLeft className="w-4 h-4" /><span className="hidden sm:inline">Previous</span></Button>
        <Button variant="outline" size="sm" disabled={chapterIndex >= doc.contentJson.chapters.length - 1} onClick={onNext}><span className="hidden sm:inline">Next</span><ChevronRight className="w-4 h-4" /></Button>
      </nav>
    </>
  );

  return (
    <div className={cx("mx-auto", isSplit ? "max-w-6xl" : "max-w-3xl")}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <p className="text-[11px] font-display uppercase tracking-[0.24em] text-gold-400 mb-1.5">Scene view · chapter {chapterIndex + 1}</p>
          <h1 className="font-garamond italic text-2xl sm:text-3xl text-mist-100 break-words">{chapter?.title}</h1>
        </div>
        {headerActions}
      </div>

      {isSplit ? (
        <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-start">
          {/* Chapter panel — desktop always visible, mobile only when Text tab */}
          <aside className={cx("min-w-0", mobileTab === "text" ? "block" : "hidden", "lg:block")} aria-label="Source chapter text">
            {chapterPanelContent}
          </aside>
          {/* Scenes column — desktop always visible, mobile only when Scenes tab */}
          <section className={cx("min-w-0", mobileTab === "scenes" ? "block" : "hidden", "lg:block")} aria-label="Cinematic scenes">
            {scenesColumnContent}
          </section>
        </div>
      ) : (
        <>
          {/* Mobile-only chapter view (hidden on desktop, where scenes-only is the layout) */}
          <aside
            className={cx("min-w-0 lg:hidden mb-6", mobileTab === "text" ? "block" : "hidden")}
            aria-label="Source chapter text"
          >
            {chapterPanelContent}
          </aside>
          {/* Scenes column — always visible on desktop, mobile only when Scenes tab */}
          <section
            className={cx("min-w-0", mobileTab === "scenes" ? "block" : "hidden", "lg:block")}
            aria-label="Cinematic scenes"
          >
            {scenesColumnContent}
          </section>
        </>
      )}
    </div>
  );
}

/* ================= Reader settings ================= */

const FONT_OPTIONS: { value: ReaderFontId; label: string }[] = [
  { value: "literata", label: "Literata" },
  { value: "garamond", label: "EB Garamond" },
  { value: "spectral", label: "Spectral" },
  { value: "sourceserif", label: "Source Serif" },
  { value: "georgia", label: "Georgia" },
  { value: "bookerly", label: "Bookerly / Charter" },
  { value: "baskerville", label: "Baskerville" },
  { value: "palatino", label: "Palatino" },
];

const ACCENTS: { id: string; color: string; label: string }[] = [
  { id: "gold", color: "#c39a45", label: "Gold" },
  { id: "ouro", color: "#6d84e8", label: "Indigo" },
  { id: "ankaa", color: "#d97e4a", label: "Ember" },
  { id: "ok", color: "#63b478", label: "Moss" },
];

export function ReaderSettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { prefs, setReader } = usePrefs(useShallow((s) => ({ prefs: s.prefs, setReader: s.setReader })));
  const rs = prefs.reader;
  return (
    <Sheet open={open} onClose={onClose} title="Reader settings" side="right" width="max-w-sm">
      <div className="p-4 sm:p-5 space-y-6">
        <section>
          <h3 className="text-[10px] font-display uppercase tracking-[0.2em] text-mist-500 mb-3">Theme</h3>
          <Segmented
            ariaLabel="Reader theme"
            value={rs.theme}
            onChange={(v) => setReader({ theme: v })}
            options={[
              { value: "light", label: <span className="inline-flex items-center gap-1.5"><Sun className="w-3.5 h-3.5" />Light</span> },
              { value: "dark", label: <span className="inline-flex items-center gap-1.5"><Moon className="w-3.5 h-3.5" />Dark</span> },
              { value: "sepia", label: <span className="inline-flex items-center gap-1.5"><Coffee className="w-3.5 h-3.5" />Sepia</span> },
            ]}
          />
          <p className="text-[11px] text-mist-600 mt-2.5 leading-relaxed">Reader themes are independent of the app’s vellum theme.</p>
        </section>

        <section>
          <h3 className="text-[10px] font-display uppercase tracking-[0.2em] text-mist-500 mb-3">Typography</h3>
          <Select label="Typeface" value={rs.fontFamily} onChange={(e) => setReader({ fontFamily: e.target.value as ReaderFontId })}>
            {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
          <div className="mt-3 space-y-1">
            <Slider label="Font size" value={rs.fontSize} min={14} max={26} step={1} unit="px" onChange={(v) => setReader({ fontSize: v })} />
            <Slider label="Line height" value={rs.lineHeight} min={1.3} max={2.2} step={0.05} onChange={(v) => setReader({ lineHeight: v })} />
            <Slider label="Letter spacing" value={rs.letterSpacing} min={0} max={25} step={1} unit={rs.letterSpacing ? ` ${rs.letterSpacing / 100}em` : ""} onChange={(v) => setReader({ letterSpacing: v })} />
            <Slider label="Reading width" value={rs.width} min={48} max={92} step={1} unit="ch" onChange={(v) => setReader({ width: v })} />
          </div>
          <div className="hairline rounded-xl p-4 mt-3 relative overflow-hidden" style={{ fontFamily: `var(--font-${rs.fontFamily})`, fontSize: `${rs.fontSize * 0.82}px`, lineHeight: rs.lineHeight }}>
            <span className="absolute top-2 right-2 text-[9px] font-display uppercase tracking-[0.16em] text-mist-600">preview</span>
            The lamp kept its post, and the threshold became what thresholds are secretly for.
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-display uppercase tracking-[0.2em] text-mist-500 mb-3">Accent</h3>
          <div className="flex gap-3" role="radiogroup" aria-label="Accent color">
            {ACCENTS.map((a) => (
              <button key={a.id} role="radio" aria-checked={rs.accent === a.id} aria-label={a.label} title={a.label} onClick={() => setReader({ accent: a.id })}
                className={cx("w-9 h-9 rounded-full border-2 transition-transform press", rs.accent === a.id ? "border-mist-100 scale-110 shadow-[0_0_12px_var(--acc-glow)]" : "border-transparent hover:scale-105")}
                style={{ background: a.color }} />
            ))}
          </div>
        </section>

        <section className="space-y-1">
          <h3 className="text-[10px] font-display uppercase tracking-[0.2em] text-mist-500 mb-3">Experience</h3>
          <Toggle label="Focus mode" hint="Dim surrounding paragraphs; nothing is hidden." checked={rs.focusMode} onChange={(v) => setReader({ focusMode: v })} />
          <div className="py-2">
            <span className="block text-sm text-mist-200 mb-2">Contrast</span>
            <Segmented ariaLabel="Contrast" value={rs.contrast} onChange={(v) => setReader({ contrast: v })} options={[{ value: "normal", label: "Normal" }, { value: "high", label: "High" }]} />
          </div>
          <Toggle label="Motion" hint="Disable decorative animation across the app." checked={rs.motion} onChange={(v) => setReader({ motion: v })} />
          {rs.motion && <Slider label="Animation speed" value={rs.animSpeed} min={0.5} max={1.5} step={0.1} unit="×" onChange={(v) => setReader({ animSpeed: v })} />}
          <Toggle label="Keyboard hints" hint="Show shortcut affordances in the reader." checked={rs.kbdHints} onChange={(v) => setReader({ kbdHints: v })} />
        </section>

        <Button variant="outline" className="w-full" onClick={() => setReader({ fontFamily: "literata", fontSize: 18, lineHeight: 1.7, letterSpacing: 0, width: 68, theme: "dark", focusMode: false, accent: "gold", contrast: "normal", motion: true, animSpeed: 1, kbdHints: true })}>
          <RotateCcw className="w-4 h-4" />Reset to defaults
        </Button>
      </div>
    </Sheet>
  );
}

/* ================= Chapter index ================= */

export function ChapterIndexSheet({ open, onClose, doc, chapterIndex, onJumpChapter, onJumpChunk }: {
  open: boolean; onClose: () => void; doc: DocumentRow; chapterIndex: number;
  onJumpChapter: (i: number) => void; onJumpChunk: (gi: number) => void;
}) {
  const [tab, setTab] = useState("chapters");
  const bookmarks = useBookmarks(doc.id);
  const annotations = useAnnotations(doc.id);
  useEffect(() => { if (open) setTab("chapters"); }, [open]);

  const chunkText = (gi: number) => {
    for (const ch of doc.contentJson.chapters) {
      if (gi < ch.startChunk + ch.chunks.length) return ch.chunks[gi - ch.startChunk]?.text ?? "";
    }
    return "";
  };
  return (
    <Sheet open={open} onClose={onClose} title="Index" side="left" width="max-w-sm">
      <div className="sticky top-0 bg-ink-875/95 backdrop-blur-md z-10 px-4 sm:px-5 pt-3 border-b border-ink-700">
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: "chapters", label: "Chapters", icon: <BookOpen className="w-3.5 h-3.5" /> },
          { id: "bookmarks", label: `Bookmarks`, icon: <Bookmark className="w-3.5 h-3.5" /> },
          { id: "notes", label: "Notes", icon: <Highlighter className="w-3.5 h-3.5" /> },
        ]} />
      </div>
      <div className="p-3 sm:p-4">
        {tab === "chapters" && (
          <ul className="space-y-1">
            {doc.contentJson.chapters.map((ch, i) => {
              const words = ch.chunks.reduce((a, c) => a + c.text.split(/\s+/).length, 0);
              const read = ch.startChunk <= doc.lastChunkIndex;
              return (
                <li key={ch.id}>
                  <button
                    onClick={() => { onJumpChapter(i); onClose(); }}
                    className={cx("w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all", i === chapterIndex ? "bg-gold-500/10 border border-gold-700/50" : "hover:bg-ink-750 border border-transparent")}
                  >
                    <span className={cx("w-1.5 h-1.5 rounded-full shrink-0", read ? "bg-gold-500" : "bg-ink-600")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cx("block text-sm truncate", i === chapterIndex ? "text-gold-300 font-display" : "text-mist-300")}>{ch.title}</span>
                      <span className="block text-[11px] text-mist-600 mt-0.5">{ch.chunks.length} passages · {words.toLocaleString()} words</span>
                    </span>
                    {i === chapterIndex && <Badge tone="gold">now</Badge>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {tab === "bookmarks" && (
          bookmarks.loading ? <Skeleton className="h-24" /> :
          (bookmarks.data ?? []).length === 0 ? (
            <p className="text-sm text-mist-500 px-3 py-8 text-center leading-relaxed">No bookmarks yet. Press <kbd>b</kbd> while reading.</p>
          ) : (
            <ul className="space-y-2.5">
              {(bookmarks.data ?? []).map((b) => (
                <li key={b.id} className="hairline rounded-xl bg-ink-875 p-3.5 hover-lift">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-sm text-gold-300 font-display truncate">{b.label || "Bookmark"}</p>
                    <IconBtn label="Delete bookmark" className="w-7 h-7 shrink-0" onClick={() => { void removeBookmark(b.id); toast("info", "Bookmark removed."); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconBtn>
                  </div>
                  <p className="text-xs text-mist-500 italic font-literata line-clamp-2 leading-relaxed">“{chunkText(b.chunkIndex)}”</p>
                  {b.note && <p className="text-xs text-mist-400 mt-2 leading-relaxed">{b.note}</p>}
                  <Button size="xs" variant="ghost" className="mt-2.5" onClick={() => { onJumpChunk(b.chunkIndex); onClose(); }}>Jump to passage</Button>
                </li>
              ))}
            </ul>
          )
        )}
        {tab === "notes" && (
          annotations.loading ? <Skeleton className="h-24" /> :
          (annotations.data ?? []).length === 0 ? (
            <p className="text-sm text-mist-500 px-3 py-8 text-center leading-relaxed">Select any passage while reading to annotate it.</p>
          ) : (
            <ul className="space-y-2.5">
              {(annotations.data ?? []).sort((a, b) => a.chunkIndex - b.chunkIndex).map((a) => (
                <li key={a.id} className="hairline rounded-xl bg-ink-875 p-3.5 hover-lift">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-2 text-[11px] text-mist-500">
                      <span className="w-3 h-3 rounded-full" style={{ background: { gold: "#c39a45", ouro: "#6d84e8", ankaa: "#d97e4a", ok: "#63b478" }[a.color] }} />
                      passage {a.chunkIndex + 1}
                    </span>
                    <IconBtn label="Delete annotation" className="w-7 h-7 shrink-0" onClick={() => { void removeAnnotation(a.id); toast("info", "Annotation removed."); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconBtn>
                  </div>
                  <p className="text-xs text-mist-300 italic font-literata line-clamp-2 leading-relaxed">“{a.text}”</p>
                  {a.note && <p className="text-xs text-mist-400 mt-2 leading-relaxed">{a.note}</p>}
                  <Button size="xs" variant="ghost" className="mt-2.5" onClick={() => { onJumpChunk(a.chunkIndex); onClose(); }}>Jump to passage</Button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </Sheet>
  );
}

void activeModelFor;
