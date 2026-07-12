'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { AlertCircle, RotateCcw } from 'lucide-react'
import { InfinityFlow } from './logo'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

/**
 * Lemniscate — React Error Boundary
 * ----------------------------------------------------------------------------
 * Catches runtime errors in the view tree and displays a graceful fallback UI
 * instead of a blank white screen. Includes a retry button that clears the
 * error state and re-renders the children.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private fallbackRef = React.createRef<HTMLDivElement>()

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Lemniscate] View crashed:', error, errorInfo)
  }

  componentDidUpdate(_prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState) {
    // Move focus into the fallback so keyboard / screen-reader users land on
    // the error announcement rather than being stranded on the trigger.
    if (!prevState.hasError && this.state.hasError) {
      this.fallbackRef.current?.focus()
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      // Only surface the message in development. In production a bare message
      // can leak implementation details; show a stable identifier instead.
      const isDev = process.env.NODE_ENV !== 'production'
      const detail = isDev ? this.state.error?.message : this.state.error?.name
      return (
        <div
          ref={this.fallbackRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="flex min-h-[70vh] items-center justify-center px-6 py-20 outline-none"
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <InfinityFlow className="mx-auto mb-6 h-12 w-24 text-amber/40" />
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-tension/30 bg-tension/10 text-tension">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h2 className="text-headline text-ivory">Something went wrong</h2>
            <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-slate">
              An unexpected error occurred while rendering this view. You can try
              again — your data is safe.
            </p>
            {detail && (
              <p className="mx-auto mt-2 max-w-md text-xs text-slate/60">
                <code className="rounded bg-midnight/50 px-1.5 py-0.5 text-amber/60">
                  {detail}
                </code>
              </p>
            )}
            <Button
              onClick={this.handleRetry}
              className="mt-6 gap-2 bg-amber text-midnight hover:bg-amber/90"
            >
              <RotateCcw className="h-4 w-4" />
              Try Again
            </Button>
          </motion.div>
        </div>
      )
    }

    return this.props.children
  }
}