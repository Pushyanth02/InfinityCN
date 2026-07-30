import * as React from "react";
import { cn } from "@/lib/utils";

// The lemniscate (∞) — the shape the product is named for. Shared by the
// marketing nav, the app header, and the loader so the brand reads the same
// everywhere.
const LEMNISCATE_PATH =
  "M10 10 C 10 2, 20 2, 20 10 S 30 18, 30 10 S 20 2, 20 10 S 10 18, 10 10 Z";

/** Static brand glyph. Inherits color via `currentColor`. */
export function LemniscateMark({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg viewBox="0 0 40 20" fill="none" className={className} style={style} aria-hidden>
      <path d={LEMNISCATE_PATH} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Animated loader: a gold comet continuously traces the lemniscate curve over
 * a faint track. Resolution-independent via `pathLength="1"`. Freezes under
 * the global reduced-motion override, leaving a tasteful static mark.
 */
export function LemniscateSpinner({
  size = 64,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size / 2}
      viewBox="0 0 40 20"
      fill="none"
      role="img"
      aria-label="Loading"
      className={cn("overflow-visible", className)}
    >
      <path
        d={LEMNISCATE_PATH}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="text-border"
        opacity={0.35}
      />
      <path
        d={LEMNISCATE_PATH}
        pathLength={1}
        stroke="var(--brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="0.32 0.68"
        style={{
          animation: "lem-trace 1.5s linear infinite",
          filter: "drop-shadow(0 0 6px color-mix(in oklab, var(--brand) 70%, transparent))",
        }}
      />
    </svg>
  );
}

/**
 * Centered, branded loading state. Inline by default (fills the route content
 * region); pass `className` to adjust. Announced politely to assistive tech.
 */
export function LoadingScreen({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        "mx-auto flex min-h-[50dvh] w-full flex-col items-center justify-center gap-5 px-6 text-center",
        className,
      )}
    >
      <LemniscateSpinner size={72} />
      <p className="text-sm tracking-wide text-muted-foreground">{label}…</p>
    </div>
  );
}
