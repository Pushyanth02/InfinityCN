"use client";

import type { LucideIcon } from "lucide-react";
import {
  FilePlus2, BookOpen, Bookmark, Highlighter, Sparkles, Clapperboard, Trash2,
  Star, Feather, ScanText, CheckCircle2, Activity,
} from "lucide-react";
import type { ActivityRow, ActivityType, DocumentRow } from "../lib/types";
import { coverInitial, cx, timeAgo } from "../lib/utils";

export function CoverArt({ doc, className, showInitial = true }: { doc: DocumentRow; className?: string; showInitial?: boolean }) {
  return (
    <div className={cx("relative overflow-hidden rounded-lg cover-noise", className)} style={{ background: doc.coverGradient }} aria-hidden>
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.08), transparent 40%, rgba(0,0,0,0.35))" }} />
      {showInitial && (
        <span className="absolute inset-0 flex items-center justify-center font-garamond italic text-4xl text-white/75 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
          {coverInitial(doc.title)}
        </span>
      )}
    </div>
  );
}

export function activityIcon(type: ActivityType): LucideIcon {
  const map: Record<ActivityType, LucideIcon> = {
    upload: FilePlus2, read: BookOpen, bookmark: Bookmark, annotation: Highlighter,
    summary: Sparkles, scenes: Clapperboard, delete: Trash2, favorite: Star,
    story: Feather, analyze: ScanText, finish: CheckCircle2,
  };
  return map[type] ?? Activity;
}

export function ActivityLine({ row, onOpen, dense }: { row: ActivityRow; onOpen?: (docId: string) => void; dense?: boolean }) {
  const Icon = activityIcon(row.type);
  return (
    <button
      onClick={() => row.documentId && onOpen?.(row.documentId)}
      disabled={!row.documentId}
      className={cx("w-full flex items-start gap-3 text-left rounded-lg px-2 -mx-2 transition-colors", row.documentId && onOpen && "hover:bg-ink-750/60 cursor-pointer", dense ? "py-1.5" : "py-2.5")}
    >
      <span className="w-8 h-8 rounded-lg border border-ink-600/70 bg-ink-800 flex items-center justify-center text-gold-500 shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-mist-300 leading-snug truncate">{row.detail}</span>
        <span className="block text-[11px] text-mist-600 mt-0.5">{timeAgo(row.createdAt)}</span>
      </span>
    </button>
  );
}

export function StatTile({ label, value, sub, onClick }: { label: string; value: string; sub?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} className={cx("panel p-5 text-left rounded-xl hover-lift", onClick && "hover:border-gold-700/60 cursor-pointer")}>
      <p className="text-[10px] font-display uppercase tracking-[0.18em] text-mist-500">{label}</p>
      <p className="font-display text-2xl text-mist-100 mt-2 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-mist-500 mt-1">{sub}</p>}
    </button>
  );
}
