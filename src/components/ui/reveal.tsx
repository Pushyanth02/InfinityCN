"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Reveal — wraps children, fades them up on scroll into view using
 * IntersectionObserver. Uses the global `fade-up` keyframe. Smoother
 * cubic-bezier easing. On browsers without IntersectionObserver, renders
 * normally (no animation, fully visible).
 */
export function Reveal({
  children,
  className,
  delay = 0,
  duration = 600,
  as: Tag = "div",
  once = true,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  as?: React.ElementType;
  once?: boolean;
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) io.disconnect();
            break;
          } else if (!once) {
            setVisible(false);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn(className)}
      style={{
        opacity: visible ? undefined : 0,
        // Combine animation name, duration, easing, delay, and fill into a
        // single shorthand to avoid React's "mixing shorthand and non-shorthand"
        // warning when animationDelay is set separately from animation.
        animation: visible
          ? `fade-up ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both`
          : undefined,
        willChange: visible ? "opacity, transform" : undefined,
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * ScrollProgress — a fixed 2px bar pinned to the top of the viewport that
 * fills with the brand color as the user scrolls down the page. Enhanced
 * with a subtle glow.
 */
export function ScrollProgress() {
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    let raf = 0;

    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const next = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      setProgress(next);
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden
      style={
        {
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "2px",
          background: "var(--brand)",
          zIndex: 60,
          transform: `scaleX(${progress})`,
          transformOrigin: "0 50%",
          transition: "transform 90ms linear",
          boxShadow: progress > 0.02 ? "0 0 8px var(--brand)" : "none",
          "--p": String(progress),
        } as React.CSSProperties
      }
    />
  );
}
