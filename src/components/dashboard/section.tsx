"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  title,
  eyebrow,
  description,
  action,
  className,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex h-full flex-col space-y-4", className)}>
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <p className="noir-eyebrow mb-1.5">{eyebrow}</p> : null}
          <h2 className="noir-display truncate text-2xl sm:text-[26px]">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              {description}
            </p>
          ) : null}
        </div>
        <div className="shrink-0">{action}</div>
      </header>
      <div className="noir-rule" aria-hidden />
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
