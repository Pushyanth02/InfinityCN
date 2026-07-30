"use client";

import { useMemo } from "react";

/**
 * ParticleField — a performant CSS-only field of drifting particles.
 * Each particle is a 2px dot that rises from the bottom to the top with
 * randomized duration, delay, horizontal drift, and opacity. Respects
 * reduced-motion (particles are hidden via the global CSS guard).
 *
 * @param count - number of particles (default 24)
 * @param className - optional className for positioning context
 */
export function ParticleField({
  count = 24,
  className,
}: {
  count?: number;
  className?: string;
}) {
  const particles = useMemo(() => {
    // Deterministic-ish pseudo-random so SSR and client match.
    const items: {
      left: string;
      size: number;
      duration: number;
      delay: number;
      drift: string;
      opacity: number;
    }[] = [];
    let seed = 42;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < count; i++) {
      items.push({
        left: `${rand() * 100}%`,
        size: 1 + rand() * 2.5,
        duration: 14 + rand() * 20,
        delay: -rand() * 30,
        drift: `${(rand() - 0.5) * 80}px`,
        opacity: 0.2 + rand() * 0.4,
      });
    }
    return items;
  }, [count]);

  return (
    <div
      aria-hidden
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      {particles.map((p, i) => (
        <span
          key={i}
          className="ld-particle"
          style={
            {
              left: p.left,
              width: `${p.size}px`,
              height: `${p.size}px`,
              // Use the full animation shorthand to avoid mixing shorthand
              // (in the .ld-particle CSS class) with non-shorthand properties
              // (animationDuration/animationDelay) in inline style.
              animation: `particle-rise ${p.duration}s linear ${p.delay}s infinite`,
              "--p-drift": p.drift,
              "--p-opacity": p.opacity,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
