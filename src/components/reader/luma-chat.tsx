"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  RefreshCw,
  ListChecks,
  Brain,
  Layers,
  Rocket,
  BookOpen,
  ChevronDown,
} from "lucide-react";
import {
  ankaaPoll,
  ankaaStart,
  fetchScenes,
  lumaChat,
  ouroChat,
  ouroFlashcards,
  ouroGuide,
  ouroQuiz,
  type BotId,
  type Flashcard,
  type QuizQuestion,
} from "@/hooks/use-api";
import type { AiScene, Chapter } from "@/lib/types";
import { AiMarkdown } from "@/components/ui/ai-markdown";
import { LemniscateSpinner } from "@/components/ui/brand-loader";
import { LumaMark, OuroMark, AnkaaMark } from "@/components/ui/bot-logos";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ChatRole = "user" | "bot";
type ChatMessage = {
  id: number;
  role: ChatRole;
  bot?: BotId;
  content: string;
  kind?: "text" | "scenes" | "quiz" | "flashcards" | "guide" | "longform";
  scenes?: AiScene[];
  quiz?: QuizQuestion[];
  flashcards?: Flashcard[];
};

type BotMeta = {
  id: BotId;
  name: string;
  tagline: string;
  blurb: string;
  Logo: typeof LumaMark;
  accent: string; // CSS color for the bot's accent
};

const BOTS: BotMeta[] = [
  {
    id: "luma",
    name: "Luma",
    tagline: "Normal Chatbot",
    blurb: "Fast, vivid chat — storytelling + quick study help for any reader.",
    Logo: LumaMark,
    accent: "#a78bfa",
  },
  {
    id: "ouro",
    name: "Ouro",
    tagline: "Study Buddy",
    blurb: "NotebookLM-style study — quizzes, flashcards, and study guides.",
    Logo: OuroMark,
    accent: "#5eead4",
  },
  {
    id: "ankaa",
    name: "Ankaa",
    tagline: "Agent Mode",
    blurb: "Long-form creative writing — runs in the background with an ETA.",
    Logo: AnkaaMark,
    accent: "#fb7185",
  },
];

export function LumaChat({
  documentId,
  docTitle,
  chapters,
  currentChapterIndex,
}: {
  documentId: string;
  docTitle: string;
  chapters: Chapter[];
  currentChapterIndex: number;
}) {
  const [botId, setBotId] = useState<BotId>("luma");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(currentChapterIndex);
  const msgIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef<BotId | null>(null);

  useEffect(() => setChapterIndex(currentChapterIndex), [currentChapterIndex]);

  const bot = BOTS.find((b) => b.id === botId)!;
  const Logo = bot.Logo;

  // Greet on first open of each bot.
  useEffect(() => {
    if (greetedRef.current === botId) return;
    greetedRef.current = botId;
    (async () => {
      setLoading(true);
      try {
        if (botId === "luma") {
          const { reply } = await lumaChat(documentId, [], chapterIndex);
          setMessages((m) => [...m, { id: ++msgIdRef.current, role: "bot", bot: "luma", content: reply, kind: "text" }]);
        } else if (botId === "ouro") {
          const { reply } = await ouroChat(documentId, [], chapterIndex);
          setMessages((m) => [...m, { id: ++msgIdRef.current, role: "bot", bot: "ouro", content: reply, kind: "text" }]);
        } else {
          // Ankaa greets without an API call.
          setMessages((m) => [...m, {
            id: ++msgIdRef.current,
            role: "bot",
            bot: "ankaa",
            kind: "text",
            content: "I'm **Ankaa**, your creative agent for long-form storytelling. Give me a brief — a new chapter, an alternate ending, an expanded scene — and I'll weave it in the background. You'll see an ETA, and I'll deliver the full work when it's ready.",
          }]);
        }
      } catch {
        setMessages((m) => [...m, {
          id: ++msgIdRef.current,
          role: "bot",
          bot: botId,
          kind: "text",
          content: "Hello — I'm here. Ask me anything about what you're reading.",
        }]);
      } finally {
        setLoading(false);
      }
    })();
  }, [botId, documentId, chapterIndex]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const pushBot = useCallback((msg: Omit<ChatMessage, "id" | "role">) => {
    setMessages((m) => [...m, { id: ++msgIdRef.current, role: "bot", ...msg }]);
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: ChatMessage = { id: ++msgIdRef.current, role: "user", content: text, kind: "text" };
    const history = [...messages, userMsg];
    setMessages(history);
    setLoading(true);
    try {
      if (botId === "luma") {
        const { reply } = await lumaChat(documentId, history.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })), chapterIndex);
        pushBot({ bot: "luma", content: reply, kind: "text" });
      } else if (botId === "ouro") {
        const { reply } = await ouroChat(documentId, history.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })), chapterIndex);
        pushBot({ bot: "ouro", content: reply, kind: "text" });
      } else {
        // Ankaa: start a background long-form job.
        await startAnkaaJob(text);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${bot.name} couldn't reply`);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, botId, bot, documentId, chapterIndex, pushBot]);

  /* ── Ankaa background job with ETA + polling ── */
  const startAnkaaJob = useCallback(async (prompt: string) => {
    pushBot({ bot: "ankaa", content: `Starting a long-form work: *${prompt}*`, kind: "text" });
    try {
      const start = await ankaaStart(documentId, prompt, { chapterIndex });
      const jobMsgId = ++msgIdRef.current;
      setMessages((m) => [...m, {
        id: jobMsgId,
        role: "bot",
        bot: "ankaa",
        kind: "longform",
        content: `__ankaa_job__${start.jobId}__eta__${start.etaSeconds}`,
      }]);
      // Poll until complete.
      const poll = async () => {
        try {
          const status = await ankaaPoll(start.jobId);
          if (status.status === "complete" && status.result) {
            setMessages((m) => m.map((msg) => msg.id === jobMsgId
              ? { ...msg, kind: "text", content: status.result! }
              : msg,
            ));
          } else if (status.status === "error") {
            setMessages((m) => m.map((msg) => msg.id === jobMsgId
              ? { ...msg, kind: "text", content: `Ankaa couldn't finish: ${status.error ?? "unknown error"}` }
              : msg,
            ));
          } else {
            // Still running — poll again in 3s.
            setTimeout(poll, 3000);
          }
        } catch {
          setTimeout(poll, 3000);
        }
      };
      setTimeout(poll, 3000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ankaa couldn't start");
    }
  }, [documentId, chapterIndex, pushBot]);

  /* ── Ouro tool chips ── */
  const runOuroGuide = useCallback(async () => {
    setMessages((m) => [...m, { id: ++msgIdRef.current, role: "user", content: "Build me a study guide", kind: "text" }]);
    setLoading(true);
    try {
      const { guide } = await ouroGuide(documentId, chapterIndex);
      pushBot({ bot: "ouro", content: guide, kind: "guide" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ouro couldn't build the guide");
    } finally {
      setLoading(false);
    }
  }, [documentId, chapterIndex, pushBot]);

  const runOuroQuiz = useCallback(async () => {
    setMessages((m) => [...m, { id: ++msgIdRef.current, role: "user", content: "Quiz me", kind: "text" }]);
    setLoading(true);
    try {
      const { questions } = await ouroQuiz(documentId, chapterIndex);
      pushBot({ bot: "ouro", content: `Here's a ${questions.length}-question quiz. Tap an answer, then reveal.`, kind: "quiz", quiz: questions });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ouro couldn't build the quiz");
    } finally {
      setLoading(false);
    }
  }, [documentId, chapterIndex, pushBot]);

  const runOuroFlash = useCallback(async () => {
    setMessages((m) => [...m, { id: ++msgIdRef.current, role: "user", content: "Make flashcards", kind: "text" }]);
    setLoading(true);
    try {
      const { flashcards } = await ouroFlashcards(documentId, chapterIndex);
      pushBot({ bot: "ouro", content: `${flashcards.length} flashcards. Click a card to flip it.`, kind: "flashcards", flashcards });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ouro couldn't make flashcards");
    } finally {
      setLoading(false);
    }
  }, [documentId, chapterIndex, pushBot]);

  const runCinematize = useCallback(async () => {
    setMessages((m) => [...m, { id: ++msgIdRef.current, role: "user", content: "Cinematize scenes", kind: "text" }]);
    setLoading(true);
    try {
      const { scenes } = await fetchScenes(documentId, false);
      pushBot({ bot: "luma", content: `Here are ${scenes.length} cinematic scenes from the story.`, kind: "scenes", scenes });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't generate scenes");
    } finally {
      setLoading(false);
    }
  }, [documentId, pushBot]);

  // Suggestion chips per bot.
  const chips = (() => {
    if (botId === "luma")
      return [
        { label: "Summarize", icon: RefreshCw, run: async () => { /* delegate to chat */ setInput("Summarize what I'm reading in 2 sentences."); } },
        { label: "Cinematize scenes", icon: BookOpen, run: runCinematize },
        { label: "Explain simply", icon: Brain, run: async () => setInput("Explain this passage in plain language.") },
      ];
    if (botId === "ouro")
      return [
        { label: "Study guide", icon: ListChecks, run: runOuroGuide },
        { label: "Quiz me", icon: Brain, run: runOuroQuiz },
        { label: "Flashcards", icon: Layers, run: runOuroFlash },
      ];
    return [
      { label: "Write the next chapter", icon: Rocket, run: async () => setInput("Write the next chapter of this story, in my voice.") },
      { label: "An alternate ending", icon: RefreshCw, run: async () => setInput("Write an alternate ending — bittersweet and surprising.") },
      { label: "Expand a scene", icon: BookOpen, run: async () => setInput("Pick the most vivid scene and expand it into a rich, detailed passage.") },
    ];
  })();

  return (
    <div className="luma-cosmic flex h-full flex-col" style={{ background: "var(--luma-bg)", color: "var(--luma-ink)" }}>
      <div className="luma-nebula" aria-hidden />
      <div className="luma-stars" aria-hidden />

      {/* Bot selector tabs */}
      <div className="relative px-3 pb-2 pt-1">
        <div className="luma-glass flex gap-1 rounded-xl p-1">
          {BOTS.map((b) => {
            const BLogo = b.Logo;
            const active = b.id === botId;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => { setBotId(b.id); setMessages([]); }}
                aria-pressed={active}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-1.5 transition-all",
                  active ? "bg-[rgba(167,139,250,0.16)]" : "hover:bg-[rgba(167,139,250,0.06)]",
                )}
                style={active ? { boxShadow: `inset 0 0 0 1px ${b.accent}55` } : undefined}
              >
                <BLogo size={22} />
                <span className="text-[10px] font-semibold" style={{ color: active ? b.accent : "var(--luma-ink-mute)" }}>{b.name}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 px-1 text-[11px] leading-tight" style={{ color: "var(--luma-ink-mute)" }}>
          <span style={{ color: bot.accent }} className="font-semibold">{bot.name}</span> · {bot.blurb}
        </p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="relative flex-1 space-y-4 overflow-y-auto px-4 py-2">
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} bot={BOTS.find((b) => b.id === m.bot) ?? BOTS[0]} />
        ))}
        {loading && (
          <div className="flex gap-2.5">
            <span className="mt-0.5 shrink-0"><Logo size={26} /></span>
            <div className="luma-bubble-luma flex items-center gap-2 rounded-2xl rounded-bl-sm px-3.5 py-3">
              <LemniscateSpinner size={32} />
              <span className="text-xs" style={{ color: "var(--luma-ink-mute)" }}>{bot.name} is thinking…</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggestion chips */}
      <div className="relative px-4 pb-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
          {chips.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.label}
                type="button"
                disabled={loading}
                onClick={c.run}
                className="luma-chip flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
              >
                <Icon className="h-3 w-3" />
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Input */}
      <div className="relative flex items-center gap-2 px-4 pb-4 pt-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={botId === "ankaa" ? "Describe a long-form work for Ankaa…" : `Ask ${bot.name} about ${chapters[chapterIndex]?.title ?? "this story"}…`}
          disabled={loading}
          className="luma-input h-10 flex-1 rounded-full px-4 text-sm outline-none placeholder:text-[color:var(--luma-ink-faint)]"
          aria-label={`Message ${bot.name}`}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={loading || !input.trim()}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
          style={{ background: `linear-gradient(180deg, ${bot.accent}, ${bot.accent}dd)`, color: "#0a0a14" }}
        >
          {loading ? <LemniscateSpinner size={26} /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

/* ── Message bubble with rich rendering per kind ── */
function MessageBubble({ msg, bot }: { msg: ChatMessage; bot: BotMeta }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="luma-bubble-user max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm">{msg.content}</div>
      </div>
    );
  }

  // Ankaa longform placeholder (job in progress).
  if (msg.kind === "longform" && msg.content.startsWith("__ankaa_job__")) {
    const [, jobId, etaPart] = msg.content.match(/__ankaa_job__(.+?)__eta__(\d+)/) ?? [];
    const eta = Number(etaPart ?? 0);
    return <AnkaaJobCard jobId={jobId} etaSeconds={eta} prompt={msg.content} bot={bot} />;
  }

  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 shrink-0"><bot.Logo size={26} /></span>
      <div className="luma-bubble-luma min-w-0 max-w-[88%] rounded-2xl rounded-bl-sm px-3.5 py-2.5">
        {msg.kind === "scenes" && msg.scenes && msg.scenes.length > 0 ? (
          <div className="space-y-2.5">
            <AiMarkdown>{msg.content}</AiMarkdown>
            <ol className="space-y-2">
              {msg.scenes.map((sc) => (
                <li key={sc.id ?? sc.ordinal} className="rounded-lg border p-2.5" style={{ borderColor: "var(--luma-border)", background: "rgba(10,10,24,0.4)" }}>
                  <p className="font-display text-sm font-semibold" style={{ color: "var(--luma-ink)" }}>
                    <span className="mr-1.5" style={{ color: "var(--luma-gold)" }}>{sc.ordinal + 1}.</span>{sc.title}
                  </p>
                  {sc.mood && <p className="mt-0.5 text-[11px] italic" style={{ color: "var(--luma-violet-bright)" }}>{sc.mood}</p>}
                  <AiMarkdown>{sc.body}</AiMarkdown>
                </li>
              ))}
            </ol>
          </div>
        ) : msg.kind === "quiz" && msg.quiz ? (
          <QuizView quiz={msg.quiz} />
        ) : msg.kind === "flashcards" && msg.flashcards ? (
          <FlashcardView cards={msg.flashcards} />
        ) : (
          <AiMarkdown>{msg.content}</AiMarkdown>
        )}
      </div>
    </div>
  );
}

/* ── Ankaa job card: progress + ETA ── */
function AnkaaJobCard({ jobId, etaSeconds, bot }: { jobId: string; etaSeconds: number; prompt: string; bot: BotMeta }) {
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(tick);
  }, []);

  // Poll for completion (the parent also polls and replaces the message,
  // but this card self-manages a reveal for resilience).
  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const status = await ankaaPoll(jobId);
        if (status.status === "complete" && status.result) { setDone(status.result); return; }
        if (status.status === "error") { setError(status.error ?? "Ankaa couldn't finish."); return; }
      } catch { /* ignore, keep polling */ }
      setTimeout(poll, 3000);
    };
    setTimeout(poll, 3000);
    return () => { active = false; };
  }, [jobId]);

  const pct = Math.min(100, Math.round((elapsed / Math.max(etaSeconds, 1)) * 100));
  const remaining = Math.max(0, etaSeconds - elapsed);

  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 shrink-0"><bot.Logo size={26} /></span>
      <div className="luma-bubble-luma min-w-0 flex-1 rounded-2xl rounded-bl-sm px-3.5 py-3">
        {done ? (
          <>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: bot.accent }}>
              Ankaa finished · {elapsed}s
            </p>
            {revealed ? (
              <AiMarkdown>{done}</AiMarkdown>
            ) : (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="luma-chip rounded-full px-3 py-1.5 text-xs font-medium"
              >
                Read the work ({done.split(/\s+/).length} words)
              </button>
            )}
          </>
        ) : error ? (
          <p className="text-sm" style={{ color: "#fb7185" }}>{error}</p>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium" style={{ color: "var(--luma-ink)" }}>
                <span style={{ color: bot.accent }}>Ankaa</span> is writing…
              </p>
              <p className="text-[11px]" style={{ color: "var(--luma-ink-mute)" }}>
                ~{remaining}s remaining
              </p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "rgba(167,139,250,0.12)" }}>
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${bot.accent}, ${bot.accent}aa)` }}
              />
            </div>
            <p className="mt-2 text-[11px]" style={{ color: "var(--luma-ink-faint)" }}>
              Estimated {etaSeconds}s · {elapsed}s elapsed · running in the background
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Quiz view (interactive) ── */
function QuizView({ quiz }: { quiz: QuizQuestion[] }) {
  const [picked, setPicked] = useState<(number | null)[]>(quiz.map(() => null));
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="space-y-3">
      <AiMarkdown>{`Here's a ${quiz.length}-question quiz. Tap an answer, then reveal.`}</AiMarkdown>
      <ol className="space-y-3">
        {quiz.map((q, qi) => {
          const p = picked[qi];
          return (
            <li key={qi} className="rounded-lg border p-2.5" style={{ borderColor: "var(--luma-border)", background: "rgba(10,10,24,0.4)" }}>
              <p className="mb-2 text-sm font-medium" style={{ color: "var(--luma-ink)" }}>
                <span className="mr-1" style={{ color: "var(--luma-ink-mute)" }}>{qi + 1}.</span>{q.question}
              </p>
              <div className="space-y-1">
                {q.options.map((opt, oi) => {
                  const isPicked = p === oi;
                  const isCorrect = q.answerIndex === oi;
                  const show = revealed || p !== null;
                  return (
                    <button
                      key={oi}
                      type="button"
                      disabled={revealed}
                      onClick={() => setPicked((s) => s.map((x, i) => (i === qi ? oi : x)))}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                        !show && "border-[var(--luma-border)] hover:bg-[rgba(167,139,250,0.08)]",
                        show && isCorrect && "border-emerald-500/60 bg-emerald-500/10",
                        show && isPicked && !isCorrect && "border-rose-500/60 bg-rose-500/10",
                        show && !isCorrect && !isPicked && "border-[var(--luma-border)] opacity-50",
                      )}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current text-[9px] font-medium">
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span className="flex-1">{opt}</span>
                    </button>
                  );
                })}
              </div>
              {revealed && q.explanation && (
                <p className="mt-1.5 text-[11px] italic" style={{ color: "var(--luma-ink-mute)" }}>{q.explanation}</p>
              )}
            </li>
          );
        })}
      </ol>
      {!revealed && (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="luma-chip rounded-full px-3 py-1.5 text-xs font-medium"
        >
          Reveal answers
        </button>
      )}
      {revealed && (
        <p className="text-xs" style={{ color: "var(--luma-ink-mute)" }}>
          You scored <span className="font-semibold" style={{ color: "var(--luma-ink)" }}>
            {picked.filter((x, i) => x === quiz[i].answerIndex).length}/{quiz.length}
          </span>.
        </p>
      )}
    </div>
  );
}

/* ── Flashcard view (flip cards) ── */
function FlashcardView({ cards }: { cards: Flashcard[] }) {
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  return (
    <div className="space-y-2">
      <AiMarkdown>{`${cards.length} flashcards. Click a card to flip it.`}</AiMarkdown>
      <ol className="space-y-1.5">
        {cards.map((c, i) => {
          const isFlipped = flipped.has(i);
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => setFlipped((s) => { const n = new Set(s); if (n.has(i)) { n.delete(i); } else { n.add(i); } return n; })}
                className="w-full rounded-lg border p-2.5 text-left transition-colors"
                style={{ borderColor: isFlipped ? "var(--luma-border-strong)" : "var(--luma-border)", background: isFlipped ? "rgba(94,234,212,0.08)" : "rgba(10,10,24,0.4)" }}
              >
                <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: isFlipped ? "#5eead4" : "var(--luma-ink-mute)" }}>
                  {isFlipped ? "Answer" : "Question"} {i + 1}
                </p>
                <p className="mt-0.5 text-sm" style={{ color: "var(--luma-ink)" }}>
                  {isFlipped ? c.back : c.front}
                </p>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
