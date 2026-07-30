"use client";

import { useCallback, useState } from "react";
import { ArrowLeft, Send, Sparkles, BookOpen, Loader2 } from "lucide-react";
import { useNav } from "@/lib/nav-store";
import { createStory, lumaCreateContinue } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AiMarkdown } from "@/components/ui/ai-markdown";
import { LemniscateSpinner } from "@/components/ui/brand-loader";
import { toast } from "sonner";

const STARTERS = [
  "A lighthouse keeper finds a message in a bottle that changes everything.",
  "In a city where stars fall every night, a child collects them.",
  "The old bookshop at the end of the lane only opens at midnight.",
  "A cartographer maps places that don't exist — until she visits them.",
  "The fox who lives in the garden has a secret to tell.",
  "When the moon went missing, only the clockmaker noticed.",
];

export default function CreateView() {
  const go = useNav((s) => s.go);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [lumaPrompt, setLumaPrompt] = useState("");
  const [lumaBusy, setLumaBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleContinue = useCallback(async () => {
    const prompt = lumaPrompt.trim() || "Continue the story naturally.";
    if (!body.trim()) {
      toast.error("Write a few lines first — Luma needs something to continue from.");
      return;
    }
    setLumaBusy(true);
    try {
      const { continuation } = await lumaCreateContinue(body, prompt);
      setBody((b) => (b.trim() ? `${b.trim()}\n\n${continuation}` : continuation));
      setLumaPrompt("");
      toast.success("Luma wrote the next passage");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Luma couldn't continue");
    } finally {
      setLumaBusy(false);
    }
  }, [body, lumaPrompt]);

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
            <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--luma-gold)" }} />
            Co-writing with Luma
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
            placeholder="Begin your story here… Write freely, or tap a starter on the right."
            className="min-h-[50vh] flex-1 resize-none border-0 bg-transparent text-base leading-relaxed outline-none focus-visible:ring-0"
            style={{ color: "var(--luma-ink-dim)" }}
            aria-label="Story body"
          />
          <div className="mt-3 flex items-center justify-between text-xs" style={{ color: "var(--luma-ink-faint)" }}>
            <span>{wordCount} words</span>
            <span>Auto-saves to your library when you press Save</span>
          </div>
        </section>

        {/* Luma co-writer sidebar */}
        <aside className="luma-glass-strong flex flex-col rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="luma-orb h-7 w-7 rounded-full" aria-hidden />
            <div className="leading-tight">
              <p className="font-display text-base font-semibold" style={{ color: "var(--luma-ink)" }}>Luma</p>
              <p className="text-[11px]" style={{ color: "var(--luma-ink-mute)" }}>Your co-writer</p>
            </div>
          </div>

          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--luma-ink-mute)" }}>
            Ask Luma to write next
          </p>
          <Input
            value={lumaPrompt}
            onChange={(e) => setLumaPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleContinue();
              }
            }}
            placeholder="e.g., introduce a mysterious stranger"
            disabled={lumaBusy}
            className="luma-input mb-2 h-10 rounded-lg text-sm"
            aria-label="Instruction for Luma"
          />
          <Button
            type="button"
            onClick={handleContinue}
            disabled={lumaBusy}
            className="luma-btn-gold flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
          >
            {lumaBusy ? <LemniscateSpinner size={26} /> : <Send className="h-4 w-4" />}
            {lumaBusy ? "Luma is writing…" : "Continue the story"}
          </Button>

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
                  setBody((b) => (b.trim() ? `${b.trim()}\n\n${s}` : s));
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
