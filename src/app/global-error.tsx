"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LemniscateMark } from "@/components/ui/brand-loader";

/**
 * Global error boundary for the app router. Catches unhandled errors in
 * any route or component and displays a branded error page with a retry
 * button. This prevents white-screen crashes in production.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console in development; in production this could be sent
    // to an error tracking service (Sentry, LogRocket, etc.)
    if (process.env.NODE_ENV !== "production") {
      console.error("Global error:", error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh bg-background text-foreground">
        <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
          <LemniscateMark className="h-8 w-16 text-brand" />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Something went wrong
            </h1>
            <p className="max-w-md text-sm text-muted-foreground">
              An unexpected error occurred. You can try again — your library is safe.
            </p>
            {process.env.NODE_ENV !== "production" && error?.message && (
              <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {error.message}
              </p>
            )}
          </div>
          <Button onClick={reset} size="lg">
            Try again
          </Button>
        </div>
      </body>
    </html>
  );
}
