import * as React from "react";

/* ========================================================================== */
/*  Bot logos — three distinct, refined SVG marks for Luma, Ouro, and Ankaa.   */
/*  Each is a self-contained, themeable SVG with a unique gradient fill keyed   */
/*  by a React.useId() namespaced id (safe for concurrent rendering).          */
/* ========================================================================== */

type LogoProps = {
  className?: string;
  size?: number;
};

/* ── Luma — a luminous star (the radiant chatbot) ──────────────────────────
   A clean 4-point sparkle/star with a soft glow — evokes a bright idea,
   conversation, illumination. Violet→gold gradient. Recognizable at 16px. */
export function LumaMark({ className, size = 32 }: LogoProps) {
  const id = React.useId();
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} fill="none" aria-hidden>
      <defs>
        <radialGradient id={`${id}-core`} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="40%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#7c3aed" />
        </radialGradient>
        <linearGradient id={`${id}-ray`} x1="20" y1="2" x2="20" y2="38">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      {/* soft outer glow */}
      <circle cx="20" cy="20" r="18" fill={`url(#${id}-core)`} opacity="0.12" />
      {/* 4-point sparkle: two crossed diamonds */}
      <path
        d="M20 3 C 21 12, 28 19, 37 20 C 28 21, 21 28, 20 37 C 19 28, 12 21, 3 20 C 12 19, 19 12, 20 3 Z"
        fill={`url(#${id}-core)`}
      />
      {/* diagonal accent rays */}
      <path d="M20 6 L20 14" stroke={`url(#${id}-ray)`} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M6 20 L14 20" stroke={`url(#${id}-ray)`} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M26 20 L34 20" stroke={`url(#${id}-ray)`} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M20 26 L20 34" stroke={`url(#${id}-ray)`} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      {/* bright center */}
      <circle cx="20" cy="20" r="3.5" fill="#fef3c7" />
      <circle cx="19" cy="19" r="1.2" fill="rgba(255,255,255,0.9)" />
    </svg>
  );
}

/* ── Ouro — an open book / infinity loop (the study companion) ─────────────
   An open book forming a loop — knowledge that folds back on itself.
   Teal→indigo gradient. Clean, legible, scholarly. */
export function OuroMark({ className, size = 32 }: LogoProps) {
  const id = React.useId();
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} fill="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}-page`} x1="0" y1="0" x2="40" y2="40">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="60%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id={`${id}-spine`} x1="20" y1="6" x2="20" y2="34">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      {/* soft glow */}
      <ellipse cx="20" cy="22" rx="18" ry="12" fill="#5eead4" opacity="0.1" />
      {/* left page */}
      <path
        d="M20 10 C 16 8, 10 8, 5 10 L 5 30 C 10 28, 16 28, 20 30 Z"
        fill={`url(#${id}-page)`}
        opacity="0.9"
      />
      {/* right page */}
      <path
        d="M20 10 C 24 8, 30 8, 35 10 L 35 30 C 30 28, 24 28, 20 30 Z"
        fill={`url(#${id}-page)`}
        opacity="0.9"
      />
      {/* center spine */}
      <path d="M20 10 L20 30" stroke={`url(#${id}-spine)`} strokeWidth="1.5" strokeLinecap="round" />
      {/* page lines (text suggestion) */}
      <path d="M9 16 L16 15" stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeLinecap="round" />
      <path d="M9 20 L16 19" stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeLinecap="round" />
      <path d="M9 24 L15 23" stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeLinecap="round" />
      <path d="M24 15 L31 16" stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeLinecap="round" />
      <path d="M24 19 L31 20" stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeLinecap="round" />
      <path d="M25 23 L31 24" stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeLinecap="round" />
      {/* knowledge spark */}
      <circle cx="20" cy="8" r="2" fill="#5eead4" />
      <circle cx="20" cy="8" r="0.8" fill="rgba(255,255,255,0.8)" />
    </svg>
  );
}

/* ── Ankaa — a phoenix feather / quill (the creative-writing agent) ────────
   A quill pen rising with a flame — creative fire, the writer's tool.
   Amber→rose→magenta gradient. Elegant, writeable. */
export function AnkaaMark({ className, size = 32 }: LogoProps) {
  const id = React.useId();
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} fill="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}-feather`} x1="8" y1="34" x2="32" y2="6">
          <stop offset="0%" stopColor="#c026d3" />
          <stop offset="50%" stopColor="#fb7185" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id={`${id}-flame`} x1="20" y1="2" x2="20" y2="20">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0" />
          <stop offset="100%" stopColor="#fb7185" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      {/* soft glow */}
      <circle cx="26" cy="14" r="14" fill="#fb7185" opacity="0.1" />
      {/* rising flame trail */}
      <path d="M22 2 C 20 8, 24 12, 22 18 C 20 14, 24 10, 22 6" stroke={`url(#${id}-flame)`} strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* quill body — a curved feather shape */}
      <path
        d="M8 34 C 10 28, 14 22, 18 18 C 22 14, 27 10, 32 6 C 30 11, 28 16, 25 20 C 22 24, 18 28, 14 31 C 11 33, 9 34, 8 34 Z"
        fill={`url(#${id}-feather)`}
      />
      {/* feather spine (rachis) */}
      <path d="M8 34 C 14 28, 20 22, 32 6" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round" fill="none" />
      {/* barbs (feather barbs) */}
      <path d="M13 28 L18 24" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M16 24 L22 19" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M19 20 L26 14" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M22 16 L29 10" stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" strokeLinecap="round" />
      {/* nib (pen tip) */}
      <path d="M6 36 L8 34 L10 36 L8 38 Z" fill="#7c2d12" />
      <circle cx="8" cy="36" r="0.8" fill="#fde68a" />
    </svg>
  );
}
