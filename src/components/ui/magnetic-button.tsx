"use client";

import { useRef, type ReactNode, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * MagneticButton — a button that gently attracts toward the cursor when
 * hovered, creating a tactile magnetic effect. Resets smoothly on leave.
 * Respects reduced-motion (no movement).
 */
export function MagneticButton({
  children,
  onClick,
  className,
  strength = 0.3,
  ...rest
}: {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  strength?: number;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);

  const onMove = (e: MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - (rect.left + rect.width / 2);
    const y = e.clientY - (rect.top + rect.height / 2);
    el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "";
  };

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn(
        "transition-transform duration-200 ease-out",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
