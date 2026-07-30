"use client";

import { LemniscateSpinner } from "@/components/ui/brand-loader";

/**
 * PageTransition — branded transition overlay shown on view changes.
 * Uses a key-based remount so the CSS animation restarts on each trigger.
 * The overlay fades in quickly, holds briefly, then fades out — giving a
 * smooth, intentional transition between views. No setState-in-effect;
 * the element is always mounted and the `key` change retriggers the CSS
 * animation. Respects reduced-motion (animation disabled globally).
 */
export function PageTransition({ trigger }: { trigger: string }) {
  return (
    <div
      key={trigger}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center"
      style={{
        background: "color-mix(in oklab, var(--background) 72%, transparent)",
        backdropFilter: "blur(4px)",
        animation: "lem-fade-out 420ms ease forwards",
      }}
    >
      <div style={{ animation: "lem-float 1.6s ease-in-out infinite" }}>
        <LemniscateSpinner size={88} />
      </div>
      <style>{`
        @keyframes lem-fade-out {
          0% { opacity: 0; }
          18% { opacity: 1; }
          65% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
