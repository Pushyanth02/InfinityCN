"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

/**
 * AiMarkdown — renders AI-generated text as properly formatted Markdown.
 *
 * This fixes the "##" / "**" literal-display problem: AI responses contain
 * Markdown headings, bold, lists, etc. Previously they were rendered with
 * `whitespace-pre-wrap`, so `## Heading` and `**bold**` showed up verbatim.
 * Now they render as real styled HTML.
 *
 * Styling is scoped via `.ai-md` so it never leaks into the reader article
 * or other UI. See globals.css for the `.ai-md` rules.
 */
export function AiMarkdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("ai-md", className)}>
      <ReactMarkdown
        components={{
          // Map headings to scoped, well-styled elements.
          h1: ({ children }) => (
            <h3 className="mt-4 mb-2 font-display text-base font-semibold text-foreground first:mt-0">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="mt-4 mb-2 font-display text-base font-semibold text-foreground first:mt-0">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-3 mb-1.5 font-display text-sm font-semibold text-foreground first:mt-0">
              {children}
            </h4>
          ),
          h4: ({ children }) => (
            <h4 className="mt-3 mb-1.5 text-sm font-semibold text-foreground first:mt-0">
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="mt-2 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="mt-2 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">
              {children}
            </h6>
          ),
          p: ({ children }) => (
            <p className="mb-3 leading-relaxed text-sm text-foreground/90 last:mb-0">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 ml-4 list-disc space-y-1 text-sm text-foreground/90 last:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 ml-4 list-decimal space-y-1 text-sm text-foreground/90 last:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-foreground/30 pl-3 italic text-foreground/80">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-border" />,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2 hover:text-foreground/80"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-3 overflow-x-auto rounded-md border border-border bg-muted/50 p-3 text-xs">
              {children}
            </pre>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
