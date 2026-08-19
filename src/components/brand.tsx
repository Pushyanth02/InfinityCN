"use client";

import { useEffect, useRef } from "react";
import { cx } from "../lib/utils";
import { usePrefs } from "../lib/store";

export interface BrandMarkProps {
  size?: number;
  animated?: boolean;
  className?: string;
  strokeWidth?: number;
  variant?: "default" | "gold" | "glow" | "ribbon";
}

/**
 * The Lemniscate mark — a mathematically smooth Bernoulli infinity traced in gold.
 * Features C1-continuous bezier geometry, multi-stop luminous amber gradients,
 * and scalable stroke rendering across all surfaces.
 */
export function BrandMark({
  size = 28,
  animated = false,
  className,
  strokeWidth = 2.75,
  variant = "default",
}: BrandMarkProps) {
  const pathD =
    "M 32 16 C 38.5 8.8 47.5 6.2 54 10 C 60.5 13.8 60.5 20.2 54 24 C 47.5 27.8 38.5 25.2 32 16 C 25.5 6.8 16.5 4.2 10 8 C 3.5 11.8 3.5 18.2 10 22 C 16.5 25.8 25.5 23.2 32 16 Z";

  return (
    <svg
      width={size}
      height={size / 2}
      viewBox="0 0 64 32"
      fill="none"
      className={cx("overflow-visible select-none shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="lemniscate-gold-flow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-gold-200, #f8eac2)" />
          <stop offset="35%" stopColor="var(--color-gold-400, #e6c270)" />
          <stop offset="70%" stopColor="var(--color-gold-500, #d9ad52)" />
          <stop offset="100%" stopColor="var(--color-gold-700, #946d2e)" />
        </linearGradient>

        <filter id="lemniscate-mark-glow" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Optional ambient soft glow underlay */}
      {(variant === "glow" || animated) && (
        <path
          d={pathD}
          stroke={variant === "gold" ? "url(#lemniscate-gold-flow)" : "currentColor"}
          strokeWidth={strokeWidth + 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.25}
          className="blur-[2px]"
        />
      )}

      {/* Primary Lemniscate Stroke */}
      <path
        d={pathD}
        stroke={variant === "gold" ? "url(#lemniscate-gold-flow)" : "currentColor"}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={340}
        strokeDasharray={animated ? 340 : undefined}
        style={animated ? { animation: "trace 7s linear infinite" } : undefined}
        filter={variant === "glow" ? "url(#lemniscate-mark-glow)" : undefined}
      />
    </svg>
  );
}

/**
 * Luxury squircle badge with dark obsidian background, gold perimeter border,
 * subtle radiant ember glow, and the central gold lemniscate.
 */
export function BrandBadge({
  size = 40,
  animated = false,
  className,
}: {
  size?: number;
  animated?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "relative rounded-xl flex items-center justify-center bg-ink-950 border border-gold-500/20 shadow-card overflow-hidden shrink-0 group",
        className
      )}
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0 opacity-40 group-hover:opacity-75 transition-opacity"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(217,173,82,0.22) 0%, transparent 70%)",
        }}
        aria-hidden
      />
      <BrandMark
        size={Math.round(size * 0.68)}
        animated={animated}
        variant="gold"
        className="relative z-10"
      />
    </div>
  );
}

/**
 * Brand Wordmark with optional size scale and subtitle/tagline.
 */
export function Wordmark({
  size = "md",
  subtitle,
  animated = false,
  className,
}: {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  subtitle?: string;
  animated?: boolean;
  className?: string;
}) {
  const sizeMap = {
    xs: { text: "text-xs", mark: 20, track: "tracking-[0.18em]" },
    sm: { text: "text-sm", mark: 24, track: "tracking-[0.2em]" },
    md: { text: "text-base", mark: 28, track: "tracking-[0.22em]" },
    lg: { text: "text-xl", mark: 34, track: "tracking-[0.24em]" },
    xl: { text: "text-2xl", mark: 40, track: "tracking-[0.26em]" },
  }[size];

  return (
    <span className={cx("inline-flex items-center gap-2.5 select-none", className)}>
      <BrandMark
        size={sizeMap.mark}
        animated={animated || size === "lg" || size === "xl"}
        className="text-gold-500 shrink-0"
      />
      <span className="flex flex-col">
        <span
          className={cx(
            "font-display font-semibold uppercase text-mist-100 leading-none",
            sizeMap.text,
            sizeMap.track
          )}
        >
          Lemniscate
        </span>
        {subtitle && (
          <span className="text-[9px] font-display uppercase tracking-[0.26em] text-mist-500 mt-1">
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Full Brand Lockup with emblem badge, luxury wordmark, and literary tagline.
 */
export function BrandLogo({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const badgeSize = { sm: 32, md: 40, lg: 48 }[size];
  const titleSize = { sm: "text-sm", md: "text-base", lg: "text-lg" }[size];

  return (
    <div className={cx("inline-flex items-center gap-3 select-none", className)}>
      <BrandBadge size={badgeSize} />
      <div className="flex flex-col">
        <span
          className={cx(
            "font-display font-semibold uppercase tracking-[0.22em] text-mist-100 leading-tight",
            titleSize
          )}
        >
          Lemniscate
        </span>
        <span className="text-[10px] font-display uppercase tracking-[0.24em] text-gold-400/80">
          AI Reading Room
        </span>
      </div>
    </div>
  );
}

/** Ambient drifting dust — the landing's quiet atmosphere. Respects reduced motion. */
export function ParticleField({
  className,
  density = 55,
  tint = "mixed",
}: {
  className?: string;
  density?: number;
  tint?: "gold" | "mixed";
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const motionOff = usePrefs((s) => !s.prefs.reader.motion);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduceOs = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (motionOff || reduceOs) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    interface P {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      a: number;
      c: string;
      tw: number;
    }
    let parts: P[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const colors =
        tint === "gold" ? ["217,173,82"] : ["217,173,82", "146,164,244", "232,225,216"];
      parts = Array.from({ length: density }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.04 - Math.random() * 0.14,
        r: 0.6 + Math.random() * 1.6,
        a: 0.12 + Math.random() * 0.4,
        c: colors[Math.floor(Math.random() * colors.length)],
        tw: Math.random() * Math.PI * 2,
      }));
    };

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.tw += 0.012;
        if (p.y < -4) {
          p.y = h + 4;
          p.x = Math.random() * w;
        }
        if (p.x < -4) p.x = w + 4;
        if (p.x > w + 4) p.x = -4;
        const alpha = p.a * (0.65 + 0.35 * Math.sin(p.tw));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.c},${alpha.toFixed(3)})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    raf = requestAnimationFrame(tick);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [density, tint, motionOff]);

  return (
    <canvas
      ref={ref}
      className={cx("absolute inset-0 w-full h-full pointer-events-none", className)}
      aria-hidden
    />
  );
}

/** Persistent atmosphere for interior views — soft glows, sparse dust and
 *  paper grain, fixed behind everything. Quiet on reduced motion. */
export function AppAmbient() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden>
      <div
        className="absolute -top-40 right-[-12%] w-210 h-155 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse, color-mix(in srgb, var(--acc) 10%, transparent), transparent 65%)",
        }}
      />
      <div
        className="absolute top-[36%] left-[-16%] w-170 h-140 rounded-full"
        style={{
          background: "radial-gradient(ellipse, rgba(109,132,232,0.07), transparent 62%)",
        }}
      />
      <div
        className="absolute bottom-[-24%] right-[16%] w-140 h-115 rounded-full"
        style={{
          background: "radial-gradient(ellipse, rgba(219,129,76,0.05), transparent 60%)",
        }}
      />
      <ParticleField density={26} tint="mixed" />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: "url(/noise.svg)" }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, transparent 55%, rgba(8,7,10,0.6) 100%)",
        }}
      />
    </div>
  );
}

/** Soft cinematic glows used behind hero & dashboard surfaces. */
export function GlowLayer({ variant = "landing" }: { variant?: "landing" | "noir" }) {
  if (variant === "landing") {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div
          className="absolute -top-40 right-[-10%] w-180 h-180 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(91,91,214,0.12), transparent 65%)",
          }}
        />
        <div
          className="absolute top-[30%] left-[-14%] w-155 h-155 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(217,173,82,0.11), transparent 62%)",
          }}
        />
        <div
          className="absolute bottom-[-30%] right-[20%] w-140 h-140 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(219,129,76,0.07), transparent 60%)",
          }}
        />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div
        className="absolute -top-32 left-[8%] w-160 h-105 rounded-full"
        style={{
          background: "radial-gradient(ellipse, rgba(217,173,82,0.07), transparent 65%)",
        }}
      />
      <div
        className="absolute top-[10%] right-[-8%] w-140 h-115 rounded-full"
        style={{
          background: "radial-gradient(ellipse, rgba(109,132,232,0.08), transparent 62%)",
        }}
      />
    </div>
  );
}
