import * as React from "react";

/* ========================================================================== */
/*  Bot logos — three distinct SVG marks for Luma, Ouro, and Ankaa.            */
/*  Each is a self-contained, themeable SVG that inherits currentColor for     */
/*  its stroke, with a unique gradient fill keyed by an id.                    */
/* ========================================================================== */

type LogoProps = {
  className?: string;
  size?: number;
};

/* ── Luma — the luminous orb / comet ──────────────────────────────────────
   A glowing core orbited by a comet trail; represents the fast, radiant
   default chatbot. Warm violet→gold gradient. */
export function LumaMark({ className, size = 32 }: LogoProps) {
  const id = React.useId();
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} fill="none" aria-hidden>
      <defs>
        <radialGradient id={`${id}-core`} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#f5d99a" />
          <stop offset="55%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#7c3aed" />
        </radialGradient>
        <linearGradient id={`${id}-trail`} x1="0" y1="40" x2="40" y2="0">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0" />
          <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {/* comet trail arc */}
      <path d="M4 36 C 10 24, 22 22, 30 14" stroke={`url(#${id}-trail)`} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M8 36 C 14 26, 24 24, 32 16" stroke={`url(#${id}-trail)`} strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.5" />
      {/* core orb */}
      <circle cx="28" cy="14" r="8" fill={`url(#${id}-core)`} />
      <circle cx="26" cy="12" r="2.5" fill="rgba(255,255,255,0.55)" />
    </svg>
  );
}

/* ── Ouro — the learning loop (ouroboros-inspired) ────────────────────────
   A circular serpent-forming loop: the endless cycle of learning, quiz →
   recall → master. Cool teal→violet gradient, geometric (not literal snake). */
export function OuroMark({ className, size = 32 }: LogoProps) {
  const id = React.useId();
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} fill="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="40" y2="40">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      {/* the loop — two arcs forming an infinity/ouroboros */}
      <circle cx="20" cy="20" r="13" stroke={`url(#${id}-ring)`} strokeWidth="3" strokeLinecap="round" fill="none" strokeDasharray="62 20" transform="rotate(-30 20 20)" />
      <circle cx="20" cy="20" r="13" stroke={`url(#${id}-ring)`} strokeWidth="3" strokeLinecap="round" fill="none" strokeDasharray="62 20" transform="rotate(150 20 20)" opacity="0.55" />
      {/* head dot where the loop closes */}
      <circle cx="32.6" cy="13.4" r="3" fill="#5eead4" />
      <circle cx="32.6" cy="13.4" r="1.2" fill="rgba(255,255,255,0.7)" />
      {/* inner spark — knowledge */}
      <circle cx="20" cy="20" r="2.5" fill={`url(#${id}-ring)`} opacity="0.8" />
    </svg>
  );
}

/* ── Ankaa — the phoenix star (creative fire) ────────────────────────────
   A multi-pointed star burst rising like a phoenix; represents the creative
   agent for long-form storytelling. Warm amber→rose→magenta gradient, with
   radiating points suggesting ignition. */
export function AnkaaMark({ className, size = 32 }: LogoProps) {
  const id = React.useId();
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rOut = 16;
    const rIn = 7;
    const x1 = 20 + Math.cos(a) * rOut;
    const y1 = 20 + Math.sin(a) * rOut;
    const a2 = a + Math.PI / 8;
    const x2 = 20 + Math.cos(a2) * rIn;
    const y2 = 20 + Math.sin(a2) * rIn;
    return `${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} fill="none" aria-hidden>
      <defs>
        <radialGradient id={`${id}-burst`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="45%" stopColor="#fb7185" />
          <stop offset="100%" stopColor="#c026d3" />
        </radialGradient>
        <linearGradient id={`${id}-flame`} x1="20" y1="4" x2="20" y2="36">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0" />
          <stop offset="100%" stopColor="#fb7185" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {/* rising flame trail */}
      <path d="M20 4 C 17 14, 23 18, 20 28 C 18 22, 22 18, 20 14" stroke={`url(#${id}-flame)`} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* star burst */}
      <polygon points={pts} fill={`url(#${id}-burst)`} />
      <circle cx="20" cy="20" r="3" fill="rgba(255,255,255,0.6)" />
    </svg>
  );
}
