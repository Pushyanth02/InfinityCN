"use client";

import { useEffect, useRef } from "react";
import { cx } from "../lib/utils";
import { usePrefs } from "../lib/store";

/** The Lemniscate mark — an infinity traced in gold. Works large, small,
 *  monochrome or accented, on dark or light surfaces. */
export function BrandMark({ size = 28, animated = false, className, strokeWidth = 3 }: { size?: number; animated?: boolean; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size / 2} viewBox="0 0 64 32" fill="none" className={className} aria-hidden>
      <path
        d="M14 16C14 8.5 22.5 4.5 28.5 10L35.5 16.5L42.5 23C48.5 28.5 57 24.5 57 16C57 7.5 48.5 3.5 42.5 9L35.5 15.5L28.5 22C22.5 27.5 14 23.5 14 16Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={340}
        strokeDasharray={animated ? 340 : undefined}
        style={animated ? { animation: "trace 7s linear infinite" } : undefined}
      />
    </svg>
  );
}

export function Wordmark({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const s = { sm: "text-sm", md: "text-base", lg: "text-xl" }[size];
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={size === "lg" ? 34 : 26} animated={size === "lg"} className="text-gold-500 shrink-0" />
      <span className={cx("font-display font-semibold tracking-[0.22em] uppercase text-mist-100", s)}>Lemniscate</span>
    </span>
  );
}

/** Ambient drifting dust — the landing's quiet atmosphere. Respects reduced motion. */
export function ParticleField({ className, density = 55, tint = "mixed" }: { className?: string; density?: number; tint?: "gold" | "mixed" }) {
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
    interface P { x: number; y: number; vx: number; vy: number; r: number; a: number; c: string; tw: number }
    let parts: P[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const colors = tint === "gold" ? ["217,173,82"] : ["217,173,82", "146,164,244", "232,225,216"];
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
        if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
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

  return <canvas ref={ref} className={cx("absolute inset-0 w-full h-full pointer-events-none", className)} aria-hidden />;
}

/** Persistent atmosphere for interior views — soft glows, sparse dust and
 *  paper grain, fixed behind everything. Quiet on reduced motion. */
export function AppAmbient() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden>
      <div className="absolute -top-40 right-[-12%] w-[840px] h-[620px] rounded-full" style={{ background: "radial-gradient(ellipse, color-mix(in srgb, var(--acc) 10%, transparent), transparent 65%)" }} />
      <div className="absolute top-[36%] left-[-16%] w-[680px] h-[560px] rounded-full" style={{ background: "radial-gradient(ellipse, rgba(109,132,232,0.07), transparent 62%)" }} />
      <div className="absolute bottom-[-24%] right-[16%] w-[560px] h-[460px] rounded-full" style={{ background: "radial-gradient(ellipse, rgba(219,129,76,0.05), transparent 60%)" }} />
      <ParticleField density={26} tint="mixed" />
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "url(/noise.svg)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 0%, transparent 55%, rgba(8,7,10,0.6) 100%)" }} />
    </div>
  );
}

/** Soft cinematic glows used behind hero & dashboard surfaces. */
export function GlowLayer({ variant = "landing" }: { variant?: "landing" | "noir" }) {
  if (variant === "landing") {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-40 right-[-10%] w-[720px] h-[720px] rounded-full" style={{ background: "radial-gradient(circle, rgba(91,91,214,0.12), transparent 65%)" }} />
        <div className="absolute top-[30%] left-[-14%] w-[620px] h-[620px] rounded-full" style={{ background: "radial-gradient(circle, rgba(217,173,82,0.11), transparent 62%)" }} />
        <div className="absolute bottom-[-30%] right-[20%] w-[560px] h-[560px] rounded-full" style={{ background: "radial-gradient(circle, rgba(219,129,76,0.07), transparent 60%)" }} />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute -top-32 left-[8%] w-[640px] h-[420px] rounded-full" style={{ background: "radial-gradient(ellipse, rgba(217,173,82,0.07), transparent 65%)" }} />
      <div className="absolute top-[10%] right-[-8%] w-[560px] h-[460px] rounded-full" style={{ background: "radial-gradient(ellipse, rgba(109,132,232,0.08), transparent 62%)" }} />
    </div>
  );
}
