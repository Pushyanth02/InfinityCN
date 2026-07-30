"use client";

import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  onClick?: () => void;
}

export function Breadcrumbs({ items }: { items?: Crumb[] }) {
  if (!items || items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-xs md:flex">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground/50">/</span>}
            {c.onClick && !last ? (
              <button
                onClick={c.onClick}
                className="truncate text-muted-foreground transition hover:text-foreground"
              >
                {c.label}
              </button>
            ) : (
              <span className={cn("truncate", last ? "text-foreground" : "text-muted-foreground")}>
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
