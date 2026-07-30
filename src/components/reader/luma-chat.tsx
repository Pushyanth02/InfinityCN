"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  Sparkles,
  BookHeart,
  Baby,
  GraduationCap,
  RefreshCw,
  ChevronDown,
  Film,
  Users,
  Tags,
  Feather,
  PenLine,
  Rocket,
  Globe2,
  HelpCircle,
  Palette,
  ListChecks,
  SpellCheck2,
  Lightbulb,
  MessageSquareQuote,
} from "lucide-react";
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
  lumaChat,
  meetCharacters,
  retellForKids,
  studyGuide,
  vocabulary,
  whatIf,
  worldLore,
  type LumaMode,
} from "@/hooks/use-api";
import type { AiScene, Chapter } from "@/lib/types";
import { AiMarkdown } from "@/components/ui/ai-markdown";
import { LemniscateSpinner } from "@/components/ui/brand-loader";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ChatMessage = {
  id: number;
  role: "user" | "luma";
  content: string;
  /** Rich payload rendered instead of markdown (e.g. scene cards, quiz). */
  kind?: "scenes" | "text";
  scenes?: AiScene[];
};

type ChipDef = {
  label: string;
  icon: typeof Sparkles;
  run: () => Promise<{ content: string; scenes?: AiScene[] }>;
};

const MODE_META: Record<LumaMode, { label: string; icon: typeof Sparkles; blurb: string }> = {
  story: { label: "Story Lover", icon: BookHeart, blurb: "For novel readers" },
  kids: { label: "Story Time", icon: Baby, blurb: "For young imaginations" },
  study: { label: "Study Buddy", icon: GraduationCap, blurb: "For students" },
};

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
  const [mode, setMode] = useState<LumaMode>("story");
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(currentChapterIndex);
  const msgIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);

  // Keep the chapter scope in sync with the reader when the panel opens.
  useEffect(() => {
    setChapterIndex(currentChapterIndex);
  }, [currentChapterIndex]);

  // Greet on first open.
  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    (async () => {
      setLoading(true);
      try {
        const { reply } = await lumaChat(documentId, mode, [], chapterIndex);
        setMessages([{ id: ++msgIdRef.current, role: "luma", content: reply, kind: "text" }]);
      } catch {
        setMessages([
          {
            id: ++msgIdRef.current,
            role: "luma",
            content: "Hello — I'm **Luma**. Ask me anything about what you're reading, or tap a suggestion below.",
            kind: "text",
          },
        ]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const pushLuma = useCallback((content: string, scenes?: AiScene[]) => {
    setMessages((m) => [
      ...m,
      { id: ++msgIdRef.current, role: "luma", content, kind: scenes ? "scenes" : "text", scenes },
    ]);
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
      const { reply } = await lumaChat(documentId, mode, history.map((m) => ({ role: m.role, content: m.content })), chapterIndex);
      pushLuma(reply);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Luma couldn't reply");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, documentId, mode, chapterIndex, pushLuma]);

  /** Run a tool chip and append its result as a Luma message. */
  const runChip = useCallback(
    async (label: string, fn: () => Promise<{ content: string; scenes?: AiScene[] }>) => {
      setMessages((m) => [...m, { id: ++msgIdRef.current, role: "user", content: label, kind: "text" }]);
      setLoading(true);
      try {
        const result = await fn();
        pushLuma(result.content, result.scenes);
      } catch (e) {
        pushLuma(`Sorry — that didn't work. ${e instanceof Error ? e.message : ""}`);
      } finally {
        setLoading(false);
      }
    },
    [pushLuma],
  );

  /** Context-aware suggestion chips per mode. */
  const chips: ChipDef[] = (() => {
    const wrap = (label: string, icon: ChipDef["icon"], fn: ChipDef["run"]): ChipDef => ({ label, icon, run: fn });
    const ch = chapters[chapterIndex];

    if (mode === "story") {
      return [
        wrap("Summarize chapter", Sparkles, async () => {
          const { summary, chapterTitle } = await generateChapterSummary(documentId, chapterIndex, false);
          return { content: `**${chapterTitle}** — ${summary}` };
        }),
        wrap("Continue the story", PenLine, async () => {
          const { continuation } = await continueStory(documentId, chapterIndex);
          return { content: continuation };
        }),
        wrap("Alternate ending", Rocket, async () => {
          const { ending } = await alternateEnding(documentId);
          return { content: ending };
        }),
        wrap("Expand the world", Globe2, async () => {
          const { lore } = await worldLore(documentId);
          return { content: lore };
        }),
        wrap("Analyze characters", Users, async () => {
          const { analysis } = await analyzeCharacters(documentId);
          return { content: analysis };
        }),
        wrap("Themes", Tags, async () => {
          const { analysis } = await analyzeThemes(documentId);
          return { content: analysis };
        }),
        wrap("Criticism", Feather, async () => {
          const { analysis } = await analyzeCriticism(documentId);
          return { content: analysis };
        }),
        wrap("Cinematize scenes", Film, async () => {
          const { scenes } = await fetchScenes(documentId, false);
          return { content: `Here are ${scenes.length} cinematic scenes from the story.`, scenes };
        }),
      ];
    }
    if (mode === "kids") {
      return [
        wrap("Retell for kids", BookHeart, async () => {
          const { story } = await retellForKids(documentId, chapterIndex);
          return { content: story };
        }),
        wrap("Meet the characters", Users, async () => {
          const { intro } = await meetCharacters(documentId);
          return { content: intro };
        }),
        wrap("What if?", HelpCircle, async () => {
          const { scenarios } = await whatIf(documentId);
          return { content: scenarios };
        }),
        wrap("Imagine a picture", Palette, async () => {
          const { prompts } = await imaginePicture(documentId);
          return { content: prompts };
        }),
      ];
    }
    // study
    return [
      wrap("Study guide", ListChecks, async () => {
        const { guide } = await studyGuide(documentId, chapterIndex);
        return { content: guide };
      }),
      wrap("Vocabulary", SpellCheck2, async () => {
        const { vocabulary: vocab } = await vocabulary(documentId, chapterIndex);
        return { content: vocab };
      }),
      wrap("Quiz me", Sparkles, async () => {
        // Defer to the quiz route via a grounded explanation + nudge.
        const { reply } = await lumaChat(documentId, mode, [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: "Quiz me on what I just read." },
        ], chapterIndex);
        return { content: reply };
      }),
      wrap("Explain simply", Lightbulb, async () => {
        const { explanation } = await explainSimply(documentId, chapterIndex);
        return { content: explanation };
      }),
      wrap("Summarize", Sparkles, async () => {
        const { summary } = await generateSummary(documentId, false);
        return { content: summary };
      }),
    ];
  })();

  const ModeIcon = MODE_META[mode].icon;

  return (
    <div className="luma-cosmic flex h-full flex-col" style={{ background: "var(--luma-bg)", color: "var(--luma-ink)" }}>
      {/* Cosmic backdrop */}
      <div className="luma-nebula" aria-hidden />
      <div className="luma-stars" aria-hidden />

      {/* Header — Luma orb + mode selector */}
      <div className="relative flex items-center justify-between gap-2 px-4 pb-3 pt-1">
        <div className="flex items-center gap-2.5">
          <span className="luma-orb block h-7 w-7 rounded-full" aria-hidden />
          <div className="leading-tight">
            <p className="font-display text-base font-semibold" style={{ color: "var(--luma-ink)" }}>
              Luma
            </p>
            <p className="line-clamp-1 text-[11px]" style={{ color: "var(--luma-ink-mute)" }}>
              {docTitle}
            </p>
          </div>
        </div>
        {/* Mode dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setModeMenuOpen((o) => !o)}
            className="luma-glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
            aria-haspopup="menu"
            aria-expanded={modeMenuOpen}
            aria-label="Choose Luma's mode"
          >
            <ModeIcon className="h-3.5 w-3.5" style={{ color: "var(--luma-gold)" }} />
            {MODE_META[mode].label}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          {modeMenuOpen && (
            <div
              role="menu"
              className="luma-glass-strong absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-xl py-1 shadow-2xl"
            >
              {(Object.keys(MODE_META) as LumaMode[]).map((m) => {
                const M = MODE_META[m];
                const Icon = M.icon;
                return (
                  <button
                    key={m}
                    role="menuitemradio"
                    aria-checked={m === mode}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setModeMenuOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors",
                      m === mode ? "bg-[rgba(167,139,250,0.16)]" : "hover:bg-[rgba(167,139,250,0.08)]",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: "var(--luma-gold)" }} />
                    <span className="flex-1">
                      <span className="block font-medium" style={{ color: "var(--luma-ink)" }}>{M.label}</span>
                      <span className="block text-[10px]" style={{ color: "var(--luma-ink-mute)" }}>{M.blurb}</span>
                    </span>
                    {m === mode && <Sparkles className="h-3 w-3" style={{ color: "var(--luma-violet-bright)" }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="relative flex-1 space-y-4 overflow-y-auto px-4 py-2">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="luma-bubble-user max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2.5">
              <span className="luma-orb mt-0.5 h-6 w-6 shrink-0 rounded-full" aria-hidden />
              <div className="luma-bubble-luma min-w-0 max-w-[88%] rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                {m.kind === "scenes" && m.scenes && m.scenes.length > 0 ? (
                  <div className="space-y-2.5">
                    <AiMarkdown>{m.content}</AiMarkdown>
                    <ol className="space-y-2">
                      {m.scenes.map((sc) => (
                        <li key={sc.id ?? sc.ordinal} className="rounded-lg border p-2.5" style={{ borderColor: "var(--luma-border)", background: "rgba(10,10,24,0.4)" }}>
                          <p className="font-display text-sm font-semibold" style={{ color: "var(--luma-ink)" }}>
                            <span className="mr-1.5" style={{ color: "var(--luma-gold)" }}>{sc.ordinal + 1}.</span>
                            {sc.title}
                          </p>
                          {sc.mood && (
                            <p className="mt-0.5 text-[11px] italic" style={{ color: "var(--luma-violet-bright)" }}>{sc.mood}</p>
                          )}
                          <AiMarkdown>{sc.body}</AiMarkdown>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <AiMarkdown>{m.content}</AiMarkdown>
                )}
              </div>
            </div>
          ),
        )}
        {loading && (
          <div className="flex gap-2.5">
            <span className="luma-orb mt-0.5 h-6 w-6 shrink-0 rounded-full" aria-hidden />
            <div className="luma-bubble-luma flex items-center gap-2 rounded-2xl rounded-bl-sm px-3.5 py-3">
              <LemniscateSpinner size={32} />
              <span className="text-xs" style={{ color: "var(--luma-ink-mute)" }}>Luma is thinking…</span>
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
                onClick={() => runChip(c.label, c.run)}
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
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={`Ask Luma about ${chapters[chapterIndex]?.title ?? "this story"}…`}
          disabled={loading}
          className="luma-input h-10 flex-1 rounded-full px-4 text-sm outline-none placeholder:text-[color:var(--luma-ink-faint)]"
          aria-label="Message Luma"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={loading || !input.trim()}
          aria-label="Send message"
          className="luma-btn-gold flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
        >
          {loading ? <LemniscateSpinner size={26} /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
