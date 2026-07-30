"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Loader2, Send } from "lucide-react";
import { useNav } from "@/lib/nav-store";
import { ankaaPoll, ankaaStart, createStory } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AiMarkdown } from "@/components/ui/ai-markdown";
import { AnkaaMark } from "@/components/ui/bot-logos";
import { toast } from "sonner";

const STARTERS = [
  "A lighthouse keeper finds a message in a bottle that changes everything.",
  "In a city where stars fall every night, a child collects them.",
  "The old bookshop at the end of the lane only opens at midnight.",
  "A cartographer maps places that don't exist — until she visits them.",
  "The fox who lives in the garden has a secret to tell.",
  "When the moon went missing, only the clockmaker noticed.",
];

const ANKAA_GREETING =
  "I'm **Ankaa**, your creative agent for long-form storytelling. Give me a brief below — a premise, a mood, a first line — and I'll weave a complete story from its true beginning to its natural end. I work in the background, so you'll see an ETA while I write.";

export default function CreateView() {
  const go = useNav((s) => s.go);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ankaaPrompt, setAnkaaPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  // Ankaa background job state.
  const [jobEta, setJobEta] = useState<number | null>(null);
  const [jobElapsed, setJobElapsed] = useState(0);
  const [jobResult, setJobResult] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, []);

  const handleAnkaaWrite = useCallback(async () => {
    const prompt = ankaaPrompt.trim() || "Write an original short story with a strong opening and a satisfying ending.";
    setBusy(true);
    setJobResult(null);
    setJobError(null);
    setRevealed(false);
    setJobElapsed(0);
    try {
      // Ankaa needs a document context. We create a temporary throwaway
      // document from the current draft (if any) so the agent is grounded.
      // For a blank canvas, we pass an empty brief and let Ankaa imagine freely.
      const draftDoc = body.trim()
        ? await createStory(title || "Untitled draft", body)
        : null;
      const documentId = draftDoc?.document?.id;
      if (body.trim() && !documentId) {
        toast.error("Couldn't ground Ankaa on your draft. Try again.");
        setBusy(false);
        return;
      }
      const start = await ankaaStart(
        documentId ?? "blank",
        prompt,
        { wordTarget: 600 },
      );
      setJobEta(start.etaSeconds);
      // Poll loop.
      const startedAt = Date.now();
      const tick = setInterval(() => setJobElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
      const poll = async () => {
        try {
          const status = await ankaaPoll(start.jobId);
          if (status.status === "complete" && status.result) {
            clearInterval(tick);
            setJobResult(status.result);
            setBusy(false);
            toast.success("Ankaa finished writing");
          } else if (status.status === "error") {
            clearInterval(tick);
            setJobError(status.error ?? "Ankaa couldn't finish.");
            setBusy(false);
          } else {
            pollTimer.current = setTimeout(poll, 3000);
          }
        } catch {
          pollTimer.current = setTimeout(poll, 3000);
        }
      };
      pollTimer.current = setTimeout(poll, 3000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ankaa couldn't start");
      setBusy(false);
    }
  }, [ankaaPrompt, body, title]);

  const handleAccept = useCallback(() => {
    if (!jobResult) return;
    setBody((b) => (b.trim() ? `${b.trim()}\n\n${jobResult}` : jobResult));
    setJobResult(null);
    setJobEta(null);
    setRevealed(false);
    toast.success("Added Ankaa's work to your story");
  }, [jobResult]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      toast.error("Give your story a title first.");
      return;
    }
    if (body.trim().length < 10) {
      toast.error("Your story is too short to save.");
      return;
    }
    setSaving(true);
    try {
      const { document, error } = await createStory(title, body);
      if (error) {
        toast.error(error);
      } else if (document) {
        toast.success("Saved to your library");
        go("reader", { documentId: document.id });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the story");
    } finally {
      setSaving(false);
    }
  }, [title, body, go]);

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const pct = jobEta ? Math.min(100, Math.round((jobElapsed / jobEta) * 100)) : 0;

  return (
    <div className="luma-cosmic relative min-h-dvh overflow-hidden">
      <div className="luma-nebula" aria-hidden />
      <div className="luma-stars" aria-hidden />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <button
          type="button"
          onClick={() => go("library")}
          className="luma-btn-ghost flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Library
        </button>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs sm:flex" style={{ color: "var(--luma-ink-mute)" }}>
            <AnkaaMark size={16} />
            Writing with Ankaa
          </span>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="luma-btn-gold rounded-full px-4 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <BookOpen className="mr-1.5 h-4 w-4" />}
            Save &amp; read
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100dvh-64px)] max-w-6xl gap-6 px-5 pb-10 sm:px-8 lg:grid-cols-[1fr_360px]">
        {/* Writing canvas */}
        <section className="luma-glass flex flex-col rounded-2xl p-5 sm:p-7">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled story"
            className="mb-4 bg-transparent font-display text-2xl font-semibold outline-none placeholder:text-[color:var(--luma-ink-faint)] sm:text-3xl"
            style={{ color: "var(--luma-ink)" }}
            aria-label="Story title"
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Begin your story here… Write freely, or ask Ankaa to write for you."
            className="min-h-[50vh] flex-1 resize-none border-0 bg-transparent text-base leading-relaxed outline-none focus-visible:ring-0"
            style={{ color: "var(--luma-ink-dim)" }}
            aria-label="Story body"
          />
          <div className="mt-3 flex items-center justify-between text-xs" style={{ color: "var(--luma-ink-faint)" }}>
            <span>{wordCount} words</span>
            <span>Saves to your library when you press Save</span>
          </div>
        </section>

        {/* Ankaa sidebar */}
        <aside className="luma-glass-strong flex flex-col rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <AnkaaMark size={32} />
            <div className="leading-tight">
              <p className="font-display text-base font-semibold" style={{ color: "var(--luma-ink)" }}>Ankaa</p>
              <p className="text-[11px]" style={{ color: "var(--luma-ink-mute)" }}>Creative agent · long-form</p>
            </div>
          </div>

          <div className="mb-3 rounded-lg border p-3 text-xs leading-relaxed" style={{ borderColor: "var(--luma-border)", background: "rgba(251,113,133,0.06)", color: "var(--luma-ink-dim)" }}>
            <AiMarkdown>{ANKAA_GREETING}</AiMarkdown>
          </div>

          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--luma-ink-mute)" }}>
            Creative brief
          </p>
          <Input
            value={ankaaPrompt}
            onChange={(e) => setAnkaaPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAnkaaWrite();
              }
            }}
            placeholder="e.g., a quiet ghost story set in a coastal town"
            disabled={busy}
            className="luma-input mb-2 h-10 rounded-lg text-sm"
            aria-label="Creative brief for Ankaa"
          />
          <Button
            type="button"
            onClick={handleAnkaaWrite}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: "linear-gradient(180deg, #fb7185, #c026d3)", color: "#1a0a14" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {busy ? "Ankaa is writing…" : "Ask Ankaa to write"}
          </Button>

          {/* Ankaa background job progress */}
          {busy && jobEta !== null && (
            <div className="mt-4 rounded-lg border p-3" style={{ borderColor: "var(--luma-border)", background: "rgba(10,10,24,0.4)" }}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium" style={{ color: "#fb7185" }}>Ankaa is writing…</p>
                <p className="text-[11px]" style={{ color: "var(--luma-ink-mute)" }}>~{Math.max(0, jobEta - jobElapsed)}s left</p>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "rgba(251,113,133,0.12)" }}>
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #fb7185, #c026d3)" }} />
              </div>
              <p className="mt-2 text-[11px]" style={{ color: "var(--luma-ink-faint)" }}>
                {jobElapsed}s elapsed · est. {jobEta}s
              </p>
            </div>
          )}

          {/* Ankaa result */}
          {jobResult && (
            <div className="mt-4 rounded-lg border p-3" style={{ borderColor: "var(--luma-border)", background: "rgba(10,10,24,0.4)" }}>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "#fb7185" }}>
                Ankaa finished · {jobResult.split(/\s+/).length} words
              </p>
              {revealed ? (
                <AiMarkdown>{jobResult}</AiMarkdown>
              ) : (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  className="luma-chip rounded-full px-3 py-1.5 text-xs font-medium"
                >
                  Read the work
                </button>
              )}
              <button
                type="button"
                onClick={handleAccept}
                className="luma-btn-gold mt-3 w-full rounded-lg py-2 text-xs font-semibold"
              >
                Add to my story
              </button>
            </div>
          )}
          {jobError && (
            <p className="mt-4 text-sm" style={{ color: "#fb7185" }}>{jobError}</p>
          )}

          <div className="my-4 h-px" style={{ background: "var(--luma-border)" }} />

          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--luma-ink-mute)" }}>
            Need a spark?
          </p>
          <div className="flex flex-col gap-1.5">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  if (!title.trim()) {
                    const firstWords = s.split(" ").slice(0, 4).join(" ").replace(/[.,].*$/, "");
                    setTitle(firstWords.charAt(0).toUpperCase() + firstWords.slice(1));
                  }
                  setAnkaaPrompt(s);
                }}
                className="luma-chip rounded-lg px-3 py-2 text-left text-xs"
              >
                {s}
              </button>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}
