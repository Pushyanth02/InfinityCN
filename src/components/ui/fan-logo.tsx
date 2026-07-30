"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * FanLemniscateMark — the abstract fan-style lemniscate logo adapted from
 * the stitch_lemniscate design assets.
 *
 * The left side is a closed lemniscate loop (continuity, infinity). The
 * right side breaks into 5 fanning segments (expansion, unfolding pages).
 * A purple-to-magenta gradient flows across the form, with a soft outer
 * glow against dark backgrounds.
 *
 * Inherits color via `currentColor` when no gradient is applied. Set
 * `gradient` (default true) for the brand purple→magenta fill.
 */

const FAN_GRADIENT_ID = "fan-lem-gradient";
const FAN_GLOW_ID = "fan-lem-glow";

// The left loop: a smooth closed teardrop/oval
const LEFT_LOOP_PATH =
  "M 18 40 C 6 40, 2 30, 2 22 C 2 12, 10 4, 22 4 C 34 4, 42 12, 42 22 C 42 30, 38 38, 30 40 C 26 41, 22 40, 18 40 Z";

// Five fanning segments on the right — curved rectangular blades that
// unfurl upward and outward, like pages being turned.
const FAN_SEGMENTS = [
  // Segment 1 (lowest, most tucked)
  "M 42 22 C 50 18, 58 14, 66 10 C 64 16, 60 22, 54 26 C 50 28, 46 26, 42 24 Z",
  // Segment 2
  "M 44 18 C 54 12, 64 6, 74 2 C 72 10, 66 18, 58 22 C 54 24, 48 22, 44 20 Z",
  // Segment 3 (middle)
  "M 44 14 C 56 6, 68 0, 80 -4 C 78 6, 70 16, 60 20 C 56 22, 48 18, 44 16 Z",
  // Segment 4
  "M 44 10 C 58 0, 72 -6, 86 -10 C 84 2, 74 14, 62 18 C 58 20, 48 14, 44 12 Z",
  // Segment 5 (highest, most extended)
  "M 44 6 C 60 -6, 76 -12, 92 -16 C 90 -2, 78 10, 64 16 C 60 18, 48 10, 44 8 Z",
];

export function FanLemniscateMark({
  className,
  style,
  gradient = true,
  size = 48,
}: {
  className?: string;
  style?: React.CSSProperties;
  gradient?: boolean;
  size?: number;
}) {
  return (
    <svg
      viewBox="-4 -20 100 64"
      fill="none"
      className={className}
      style={style}
      width={size}
      height={(size * 64) / 100}
      aria-hidden
    >
      <defs>
        {gradient && (
          <>
            <linearGradient id={FAN_GRADIENT_ID} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b2e5c" />
              <stop offset="30%" stopColor="#5a4578" />
              <stop offset="60%" stopColor="#8b5cf6" />
              <stop offset="85%" stopColor="#b08ecc" />
              <stop offset="100%" stopColor="#d48de0" />
            </linearGradient>
            <filter id={FAN_GLOW_ID} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </>
        )}
      </defs>
      <g filter={gradient ? `url(#${FAN_GLOW_ID})` : undefined}>
        {/* Left closed loop — continuity */}
        <path
          d={LEFT_LOOP_PATH}
          fill={gradient ? `url(#${FAN_GRADIENT_ID})` : "currentColor"}
          opacity={0.92}
        />
        {/* Left loop inner highlight */}
        <path
          d={LEFT_LOOP_PATH}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.8"
          strokeLinecap="round"
        />
        {/* Connecting bar from loop to fan */}
        <path
          d="M 38 24 C 40 22, 42 22, 44 22"
          fill="none"
          stroke={gradient ? `url(#${FAN_GRADIENT_ID})` : "currentColor"}
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Five fanning segments — expansion */}
        {FAN_SEGMENTS.map((d, i) => (
          <path
            key={i}
            d={d}
            fill={gradient ? `url(#${FAN_GRADIENT_ID})` : "currentColor"}
            opacity={0.88 - i * 0.06}
          />
        ))}
        {/* Edge highlights on fan tips */}
        {FAN_SEGMENTS.map((d, i) => (
          <path
            key={`edge-${i}`}
            d={d}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="0.5"
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  );
}
