"use client";

import React, { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Reusable React error boundary for major UI sections.
 * Catches errors within its children without crashing the entire app.
 */
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[section-error:${this.props.label ?? "unknown"}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="space-y-2">
            <h2 className="font-display text-2xl font-semibold">Something went wrong</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {process.env.NODE_ENV === "production"
                ? `An error occurred${this.props.label ? ` in ${this.props.label}` : ""}. Try again, or navigate to a different page.`
                : this.state.error?.message}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => this.setState({ hasError: false, error: null })}
              variant="outline"
            >
              Try again
            </Button>
            <Button onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
