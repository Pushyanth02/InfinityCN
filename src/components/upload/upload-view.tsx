"use client";

import { useCallback, useRef, useState } from "react";
import { AppHeader } from "@/components/nav/app-header";
import { useNav } from "@/lib/nav-store";
import { useDocuments, uploadFile } from "@/hooks/use-api";
import { sourceTypeFromMime, formatBytes, SOURCE_LABELS, type SourceType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  FileText,
  Lock,
  Sparkles,
  WifiOff,
  Upload as UploadIcon,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileUp,
} from "lucide-react";

const ACCEPTED = ".pdf,.epub,.docx,.md,.markdown,.txt,.html,.htm";
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const TIPS = [
  {
    icon: WifiOff,
    title: "Server-parsed",
    body: "Files are parsed server-side by the Lemniscate Core Engine and stored in a persistent library.",
  },
  {
    icon: Lock,
    title: "Private by default",
    body: "Your library lives in the project database. Optional AI features run only when you request them.",
  },
  {
    icon: Sparkles,
    title: "Ready to explore",
    body: "Once processed, open a document in the Reader or use the AI panel for analysis.",
  },
];

interface UploadRow {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  documentId?: string;
}

export function UploadView() {
  const { go } = useNav();
  const { refresh } = useDocuments();
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File exceeds ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB limit`;
    }
    if (file.size === 0) return "File is empty";
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const validExts = ["pdf", "epub", "docx", "md", "markdown", "txt", "html", "htm"];
    if (!validExts.includes(ext)) {
      return `Unsupported file type: .${ext}`;
    }
    return null;
  };

  const enqueue = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      const newRows: UploadRow[] = arr.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: "uploading",
      }));
      setRows((r) => [...r, ...newRows]);

      for (const row of newRows) {
        const validationError = validateFile(row.file);
        if (validationError) {
          setRows((r) =>
            r.map((x) =>
              x.id === row.id ? { ...x, status: "error", error: validationError } : x,
            ),
          );
          toast.error(`${row.file.name}: ${validationError}`);
          continue;
        }
        try {
          const { document, error } = await uploadFile(row.file);
          setRows((r) =>
            r.map((x) =>
              x.id === row.id
                ? {
                    ...x,
                    status: error ? "error" : "done",
                    error: error ?? undefined,
                    documentId: document?.id,
                  }
                : x,
            ),
          );
          if (error) toast.error(`Failed to parse ${row.file.name}: ${error}`);
          else toast.success(`Imported ${row.file.name}`);
        } catch (e: any) {
          setRows((r) =>
            r.map((x) =>
              x.id === row.id ? { ...x, status: "error", error: e?.message ?? "Upload failed" } : x,
            ),
          );
          toast.error(`Upload failed: ${row.file.name}`);
        }
      }
      refresh();
    },
    [refresh],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files?.length) enqueue(e.dataTransfer.files);
    },
    [enqueue],
  );

  const dismiss = (id: string) => setRows((r) => r.filter((x) => x.id !== id));
  const clearFinished = () =>
    setRows((r) => r.filter((x) => x.status === "uploading" || x.status === "pending"));

  const openDoc = (docId?: string) => {
    if (docId) go("reader", { documentId: docId });
  };

  return (
    <div className="dashboard-noir min-h-dvh">
      <AppHeader
        breadcrumbs={[
          { label: "Dashboard", onClick: () => go("dashboard") },
          { label: "Import" },
        ]}
      />

      <main id="main-content" className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="min-w-0 space-y-3">
          <p className="noir-eyebrow">Add to your library</p>
          <h1 className="noir-display text-4xl sm:text-5xl">Import documents</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Drop in a PDF, EPUB, DOCX, Markdown, TXT, or HTML file. The Lemniscate
            Core Engine parses each upload into chapters, strips boilerplate, and
            scores text quality — all server-side.
          </p>
        </header>

        <div className="noir-card space-y-4 p-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            className={cn(
              "relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition",
              dragging
                ? "border-[var(--noir-gold)] bg-[color-mix(in_oklab,var(--noir-gold)_8%,transparent)]"
                : "border-[var(--noir-border-soft)] hover:border-[var(--noir-border)] hover:bg-[color-mix(in_oklab,var(--noir-gold)_4%,transparent)]",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) enqueue(e.target.files);
                e.target.value = "";
              }}
            />
            <div
              className="grid size-12 place-items-center rounded-2xl"
              style={{
                background: "color-mix(in oklab, var(--noir-gold) 14%, transparent)",
                color: "var(--noir-gold-soft)",
              }}
              aria-hidden
            >
              <FileUp className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Drop files here, or{" "}
                <span style={{ color: "var(--noir-gold-soft)" }}>browse</span>
              </p>
              <p className="text-xs text-muted-foreground">
                PDF, EPUB, DOCX, Markdown, TXT, HTML · up to 200 MB
              </p>
            </div>
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs text-muted-foreground">
                  {rows.filter((r) => r.status === "uploading").length}{" "}
                  processing · {rows.filter((r) => r.status === "done").length}{" "}
                  done · {rows.filter((r) => r.status === "error").length} failed
                </p>
                <button
                  onClick={clearFinished}
                  className="text-xs text-muted-foreground transition hover:text-foreground"
                >
                  Clear finished
                </button>
              </div>
              <ul className="space-y-2">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-3 rounded-xl border border-[var(--noir-border-soft)] bg-[var(--noir-surface)] p-3"
                  >
                    <div
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-[10px] font-semibold"
                      style={{
                        background: "color-mix(in oklab, var(--noir-gold) 12%, transparent)",
                        color: "var(--noir-gold-soft)",
                      }}
                    >
                      {
                        SOURCE_LABELS[
                          sourceTypeFromMime(row.file.type, row.file.name) as SourceType
                        ]
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(row.file.size)}
                        {row.status === "done" && row.documentId && (
                          <span className="ml-2" style={{ color: "var(--noir-gold-soft)" }}>
                            · Ready
                          </span>
                        )}
                        {row.status === "error" && row.error && (
                          <span className="ml-2 text-destructive">· {row.error}</span>
                        )}
                      </p>
                    </div>
                    {row.status === "uploading" && (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    )}
                    {row.status === "done" && (
                      <CheckCircle2 className="size-4" style={{ color: "var(--noir-gold)" }} />
                    )}
                    {row.status === "error" && <AlertCircle className="size-4 text-destructive" />}
                    {row.status === "done" && row.documentId && (
                      <button
                        onClick={() => openDoc(row.documentId)}
                        className="noir-btn-ghost rounded-full px-3 py-1 text-xs"
                      >
                        Read
                      </button>
                    )}
                    <button
                      onClick={() => dismiss(row.id)}
                      className="text-muted-foreground transition hover:text-foreground"
                      aria-label="Dismiss"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <section className="grid gap-4 sm:grid-cols-3">
          {TIPS.map((t) => (
            <div key={t.title} className="noir-card p-4">
              <div
                className="mb-3 grid size-9 place-items-center rounded-xl"
                style={{
                  background: "color-mix(in oklab, #c9a84c 12%, transparent)",
                  color: "var(--noir-gold-soft)",
                }}
                aria-hidden
              >
                <t.icon className="size-4" />
              </div>
              <h3 className="text-sm font-semibold">{t.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t.body}</p>
            </div>
          ))}
        </section>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--noir-border-soft)] p-4">
          <div className="flex items-center gap-3">
            <FileText className="size-5" style={{ color: "var(--noir-gold)" }} />
            <p className="text-sm text-muted-foreground">
              Looking for something you already imported?
            </p>
          </div>
          <button
            onClick={() => go("library")}
            className="noir-btn-ghost inline-flex shrink-0 items-center rounded-full px-4 py-2 text-sm font-medium"
          >
            Open library
          </button>
        </div>
      </main>
    </div>
  );
}
