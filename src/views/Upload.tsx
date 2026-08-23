import { useCallback, useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  BookOpen,
  AlertTriangle,
  ScanText,
  ShieldCheck,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import { useNav, usePrefs, useShallow, toast } from "../lib/store";
import { ingestFile, verifyParsed, FORMATS } from "../lib/engine";
import { refineStructure, aiConfigured } from "../lib/ai";
import { importParsed } from "../lib/data";
import type { ParsedDoc } from "../lib/types";
import { fmtBytes, uid, cx } from "../lib/utils";
import { Button, Panel, Badge, Progress, Eyebrow } from "../components/ui";
import type { IngestError } from "../lib/engine";

const STAGES = [
  "Detecting format",
  "Parsing content",
  "Cleaning text",
  "Detecting chapters",
  "AI structure pass",
  "Scoring quality",
  "Shelving",
];

interface QueueItem {
  id: string;
  name: string;
  size: number;
  stage: "queued" | "working" | "done" | "error";
  step: number;
  error?: string;
  result?: ParsedDoc;
  docId?: string;
  file?: File;
  passages?: number;
  refined?: boolean;
}

export default function Upload() {
  const { go, openDoc, pendingFile, setPendingFile } = useNav(
    useShallow((s) => ({
      go: s.go,
      openDoc: s.openDoc,
      pendingFile: s.pendingFile,
      setPendingFile: s.setPendingFile,
    })),
  );
  const { aiRefine, maxUploadMB } = usePrefs(
    useShallow((s) => ({
      aiRefine: s.prefs.aiRefine,
      maxUploadMB: s.prefs.maxUploadMB,
    })),
  );
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const aiOn = aiRefine && aiConfigured();

  /* Consume a file handed off from the Landing page. The Landing dropzone /
     hero button sets `pendingFile` on the nav store and navigates here; this
     effect picks it up on mount and runs it through the same intake pipeline. */
  useEffect(() => {
    if (pendingFile) {
      const f = pendingFile;
      setPendingFile(null); // clear immediately so it doesn't re-process
      void processFileRef.current?.(f);
    }
  }, [pendingFile, setPendingFile]);

  const update = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((q) =>
      q.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      const id = uid("up");
      setQueue((q) => [
        ...q,
        {
          id,
          name: file.name,
          size: file.size,
          stage: "working",
          step: 0,
          file,
        },
      ]);
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      try {
        update(id, { step: 0 });
        await wait(240);
        update(id, { step: 1 });
        let parsed = await ingestFile(file, maxUploadMB);
        const check = verifyParsed(parsed);
        if (!check.ok) {
          update(id, { stage: "error", error: check.reason });
          toast("error", check.reason);
          return;
        }
        for (let s = 2; s <= 3; s++) {
          update(id, { step: s });
          await wait(200);
        }
        let refined = false;
        if (aiOn) {
          update(id, { step: 4 });
          const res = await refineStructure(parsed);
          if (res.refined) {
            parsed = res.parsed;
            refined = true;
          }
        }
        update(id, { step: 5 });
        await wait(180);
        update(id, { step: 6 });
        const row = await importParsed(file, parsed);
        await wait(160);
        update(id, {
          stage: "done",
          step: STAGES.length,
          result: parsed,
          docId: row.id,
          passages: check.passages,
          refined,
        });
        toast(
          "success",
          `“${parsed.title}” is ready — ${parsed.chapters.length} chapter${parsed.chapters.length === 1 ? "" : "s"}, quality ${parsed.quality.score}/100${refined ? " · AI-structured" : ""}.`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Import failed.";
        update(id, { stage: "error", error: msg });
        toast("error", msg);
      }
    },
    [maxUploadMB, aiOn, update],
  );

  // Keep a ref to processFile so the pendingFile effect can call it without
  // adding processFile to its dependency array (which would re-run on every
  // render since processFile is recreated when maxUploadMB/aiOn change).
  const processFileRef = useRef(processFile);
  processFileRef.current = processFile;

  const onFiles = useCallback(
    (files: FileList | File[]) => {
      for (const f of Array.from(files)) void processFile(f);
    },
    [processFile],
  );

  const done = queue.filter((q) => q.stage === "done");
  const failed = queue.filter((q) => q.stage === "error");
  const working = queue.filter(
    (q) => q.stage === "working" || q.stage === "queued",
  );
  const active = working[0];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <Eyebrow className="mb-3">Intake desk</Eyebrow>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h1 className="font-display font-semibold text-3xl sm:text-4xl lg:text-5xl text-mist-100 tracking-tight leading-[1.05]">
            Bring a{" "}
            <span className="font-garamond italic font-medium text-gold-400">
              document
            </span>
          </h1>
          <p className="text-sm text-mist-500 mt-3 max-w-md leading-relaxed">
            Drop a file on the desk — Lemniscate will parse, clean and shelf it,
            all on this device.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Badge tone="muted">
            <ShieldCheck className="w-3 h-3" />
            on-device
          </Badge>
          <p className="text-xs text-mist-500">
            Max{" "}
            <span className="text-gold-400 font-display tabular-nums">
              {maxUploadMB} MB
            </span>
          </p>
        </div>
      </div>

      {/* ─── the tray ─── */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload documents"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
        }}
        className={cx(
          "relative mt-8 sm:mt-10 rounded-xl overflow-hidden cursor-pointer text-center px-5 sm:px-8 py-12 sm:py-16 outline-none transition-all duration-300 group",
          "border-2 border-dashed",
          dragOver
            ? "border-gold-500 bg-gold-500/7 scale-[1.005] shadow-glow-gold"
            : "border-ink-600 bg-ink-850/70 hover:border-gold-700 hover:bg-ink-875",
        )}
      >
        {/* layered ambience */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden
          style={{
            background:
              "radial-gradient(640px 260px at 50% 0%, var(--acc-soft), transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          aria-hidden
          style={{
            background:
              "radial-gradient(380px 200px at 50% 30%, var(--acc-soft), transparent 70%)",
          }}
        />
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={FORMATS.flatMap((f) => f.exts.map((e) => `.${e}`)).join(",")}
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="relative flex flex-col items-center">
          <div
            className={cx(
              "relative inline-flex w-16 h-16 sm:w-20 sm:h-20 rounded-2xl items-center justify-center mb-5 transition-all duration-300",
              dragOver
                ? "bg-gold-500/20 -translate-y-1 shadow-glow-gold"
                : "bg-ink-800 border border-ink-600 group-hover:border-gold-700/60",
            )}
          >
            {dragOver ? (
              <ArrowUpRight className="w-8 h-8 text-gold-300" />
            ) : (
              <UploadCloud className="w-8 h-8 text-mist-400 group-hover:text-gold-300 transition-colors" />
            )}
            {dragOver && (
              <span
                className="absolute -inset-2 rounded-2xl border border-gold-500/40 animate-pulse-soft"
                aria-hidden
              />
            )}
          </div>
          <p className="relative font-display text-lg sm:text-xl text-mist-100 px-2">
            {dragOver
              ? "Let go — the room will take it from here"
              : "Drop documents here, or click to browse"}
          </p>
          <p className="relative text-xs sm:text-sm text-mist-500 mt-2 max-w-sm">
            Validated by extension, MIME and content signature — not just by
            name
          </p>
          <div className="relative mt-6 flex flex-wrap justify-center gap-1.5">
            {FORMATS.map((f) => (
              <span
                key={f.type}
                className="px-2 py-1 rounded-md border border-ink-600/70 bg-ink-875/80 text-[10px] font-display uppercase tracking-[0.14em] text-mist-400"
              >
                {f.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ─── no-book onboarding hint ─── */}
      {queue.length === 0 && !active && (
        <div className="mt-5 flex items-center justify-center gap-2.5 text-center">
          <p className="text-sm text-mist-500">
            Don’t have a book to upload?{" "}
            <button
              onClick={() => go("create")}
              className="text-gold-400 hover:text-gold-300 underline underline-offset-4 decoration-gold-700/50 hover:decoration-gold-500 transition-colors font-display min-h-9 inline-flex items-center"
            >
              Try creating your own story
            </button>
            .
          </p>
        </div>
      )}

      {/* ─── live pipeline ─── */}
      {active && (
        <Panel className="mt-7 p-5 sm:p-6 hover-lift">
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <span className="w-9 h-9 rounded-lg border border-gold-700/60 bg-gold-500/10 flex items-center justify-center text-gold-400 shrink-0">
              <Loader2 className="w-4 h-4 animate-spin" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-display text-mist-100 truncate">
                {active.name}
              </p>
              <p className="text-[11px] text-mist-500">
                <span className="text-gold-300 tabular-nums">
                  Stage {Math.min(active.step + 1, STAGES.length)}
                </span>
                <span className="text-mist-600"> of {STAGES.length}</span>
                <span className="text-mist-600"> · </span>
                <span className="tabular-nums">{fmtBytes(active.size)}</span>
              </p>
            </div>
            <span className="text-[11px] font-display uppercase tracking-[0.14em] text-gold-300 tabular-nums">
              {Math.round((active.step / STAGES.length) * 100)}%
            </span>
          </div>

          <ol className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
            {STAGES.map((s, i) => {
              const state =
                i < active.step ? "done" : i === active.step ? "now" : "todo";
              return (
                <li
                  key={s}
                  className={cx(
                    "shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] font-display transition-colors",
                    state === "done" &&
                      "bg-gold-500/10 border-gold-700/40 text-gold-300",
                    state === "now" &&
                      "bg-ink-800 border-gold-500/60 text-gold-200",
                    state === "todo" &&
                      "bg-ink-875 border-ink-600/70 text-mist-600",
                  )}
                >
                  <span
                    className={cx(
                      "w-4 h-4 rounded-full flex items-center justify-center text-[9px] shrink-0",
                      state === "done"
                        ? "bg-gold-500/30 text-gold-200"
                        : state === "now"
                          ? "bg-gold-500/20 text-gold-200"
                          : "bg-ink-700 text-mist-600",
                    )}
                  >
                    {state === "done" ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : state === "now" ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span>{s}</span>
                </li>
              );
            })}
          </ol>
          <Progress
            value={(active.step / STAGES.length) * 100}
            className="mt-5"
          />
        </Panel>
      )}

      {/* ─── queue results ─── */}
      {queue.length > 0 && (
        <div className="mt-7 space-y-3">
          {queue.map((item) => (
            <Panel
              key={item.id}
              className={cx(
                "p-4 sm:p-5 hover-lift",
                item.stage === "error" && "border-danger-500/40",
                item.stage === "done" && "border-gold-700/50",
              )}
            >
              <div className="flex items-start gap-3.5 sm:gap-4">
                <span
                  className={cx(
                    "w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-colors",
                    item.stage === "done"
                      ? "border-gold-700/60 bg-gold-500/10 text-gold-400"
                      : item.stage === "error"
                        ? "border-danger-500/50 bg-danger-500/10 text-danger-400"
                        : "border-ink-600 bg-ink-800 text-mist-400",
                  )}
                >
                  {item.stage === "done" ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : item.stage === "error" ? (
                    <XCircle className="w-5 h-5" />
                  ) : item.stage === "working" ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <FileText className="w-5 h-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-mist-100 truncate font-medium">
                      {item.name}
                    </p>
                    <span className="text-[11px] text-mist-600 tabular-nums">
                      {fmtBytes(item.size)}
                    </span>
                    {item.result && (
                      <Badge tone="gold">{item.result.sourceType}</Badge>
                    )}
                    {item.result && (
                      <Badge tone="muted">
                        quality {item.result.quality.score}
                      </Badge>
                    )}
                    {item.result && (
                      <Badge tone="muted">{item.passages} passages</Badge>
                    )}
                    {item.refined && (
                      <Badge tone="ouro">
                        <ScanText className="w-3 h-3" />
                        AI-structured
                      </Badge>
                    )}
                  </div>
                  {item.stage === "working" && (
                    <p className="text-xs text-gold-400/90 mt-1.5 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-gold-400 animate-pulse-soft" />
                      {STAGES[Math.min(item.step, STAGES.length - 1)]}…
                    </p>
                  )}
                  {item.stage === "done" && item.result && (
                    <p className="text-xs text-mist-500 mt-1.5 leading-relaxed">
                      <span className="font-garamond italic text-mist-300">
                        “{item.result.title}”
                      </span>
                      <span className="text-mist-600"> · </span>
                      {item.result.author}
                      <span className="text-mist-600"> · </span>
                      {item.result.chapters.length} chapters
                      <span className="text-mist-600"> · </span>
                      {item.result.wordCount.toLocaleString()} words
                      {item.result.warnings.length > 0 && (
                        <span className="text-warn-400">
                          {" "}
                          · {item.result.warnings.length} note
                          {item.result.warnings.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </p>
                  )}
                  {item.stage === "error" && (
                    <p className="text-xs text-danger-400 mt-1.5 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {item.error}
                    </p>
                  )}
                </div>
                <div className="shrink-0 flex flex-col sm:flex-row gap-2">
                  {item.stage === "done" && item.docId && (
                    <Button
                      variant="gold"
                      size="sm"
                      onClick={() => openDoc(item.docId!)}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      Read now
                    </Button>
                  )}
                  {item.stage === "error" && item.file && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const f = item.file!;
                        setQueue((q) => q.filter((x) => x.id !== item.id));
                        void processFile(f);
                      }}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            </Panel>
          ))}

          {(done.length > 0 || failed.length > 0) && working.length === 0 && (
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-ink-700/60">
              <p className="text-sm text-mist-400">
                {done.length > 0 && (
                  <span className="text-gold-300 font-display">
                    {done.length} ready
                  </span>
                )}
                {done.length > 0 && failed.length > 0 && (
                  <span className="text-mist-600"> · </span>
                )}
                {failed.length > 0 && (
                  <span className="text-danger-400 font-display">
                    {failed.length} rejected
                  </span>
                )}
              </p>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => setQueue([])}>
                Clear queue
              </Button>
              <Button variant="gold" size="sm" onClick={() => go("library")}>
                Open library
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ─── what happens ─── */}
      <div className="mt-14 sm:mt-16">
        <div className="flex items-center gap-3 mb-5">
          <Sparkles className="w-4 h-4 text-gold-500" />
          <h2 className="text-[11px] font-display uppercase tracking-[0.22em] text-mist-500">
            What happens to your file
          </h2>
          <span className="gold-rule flex-1" aria-hidden />
        </div>
        <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            {
              t: "Validate",
              b: "Extension, MIME and actual magic bytes are cross-checked; size limits enforced.",
              icon: ShieldCheck,
            },
            {
              t: "Parse & clean",
              b: "Boilerplate stripped, broken lines mended, running headers removed, whitespace normalized.",
              icon: FileText,
            },
            {
              t: "Structure & score",
              b: "Chapters detected from real headings and typography — never arbitrary splits — then quality-scored.",
              icon: ScanText,
            },
          ].map(({ t, b, icon: Icon }, i) => (
            <Panel key={t} className="p-5 hover-lift group">
              <div className="flex items-center justify-between mb-3">
                <span className="w-9 h-9 rounded-lg border border-ink-600 bg-ink-800 flex items-center justify-center text-gold-400 group-hover:border-gold-700/60 group-hover:text-gold-300 transition-colors">
                  <Icon className="w-4 h-4" />
                </span>
                <span className="font-display text-xl text-mist-700 group-hover:text-gold-500 transition-colors tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <p className="font-display text-sm text-mist-100">{t}</p>
              <p className="text-xs text-mist-500 leading-relaxed mt-1.5">
                {b}
              </p>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}

export type { IngestError };
