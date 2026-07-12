'use client'

/**
 * Lemniscate — Processing view
 * ----------------------------------------------------------------------------
 * Orchestrator for the live processing view: polls the job/document, subscribes
 * to realtime progress, and renders the header, progress bar, pipeline stages,
 * log terminal, and completion/failure panels. The stages strip and log
 * terminal live in sibling `processing-*` modules; shapes and stage config in
 * `processing-shared`.
 */

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useLemniscate } from '../store'
import { useRealtime } from '../use-realtime'
import { InfinityFlow } from '../logo'
import { spring } from '@/lib/motion'
import {
  ArrowLeft,
  Film,
  Type,
  CheckCircle2,
  AlertCircle,
  Cpu,
} from 'lucide-react'

import type { ProcessingJob, ProcessingDoc } from './processing-shared'
import { PipelineStages } from './processing-stages'
import { LogTerminal } from './processing-log'

export function ProcessingView() {
  const jobId = useLemniscate((s) => s.activeJobId)
  const documentId = useLemniscate((s) => s.activeDocumentId)
  const openLibrary = useLemniscate((s) => s.openLibrary)
  const openReader = useLemniscate((s) => s.openReader)
  const progressState = useLemniscate((s) => (jobId ? s.progress[jobId] : undefined))

  const { logs, connected } = useRealtime(jobId ? [jobId] : [])
  const [job, setJob] = React.useState<ProcessingJob | null>(null)
  const [doc, setDoc] = React.useState<ProcessingDoc | null>(null)

  React.useEffect(() => {
    if (!jobId) return
    let cancelled = false
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (cancelled) return
      try {
        const [jr, dr] = await Promise.all([
          fetch(`/api/jobs/${jobId}`, { signal: controller.signal }).then((r) => r.json()),
          documentId
            ? fetch(`/api/documents/${documentId}`, { signal: controller.signal }).then((r) => r.json())
            : Promise.resolve(null),
        ])
        if (cancelled) return
        setJob(jr.job)
        if (dr?.document) setDoc(dr.document)
        if (jr.job?.status === 'COMPLETED' || jr.job?.status === 'FAILED') return
      } catch {
        /* ignore */
      }
      if (!cancelled) timer = setTimeout(tick, 2000)
    }
    tick()
    return () => {
      cancelled = true
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [jobId, documentId])

  const stage = progressState?.stage ?? job?.stage ?? 'QUEUED'
  const progress = progressState?.progress ?? job?.progress ?? 0
  const status = progressState?.status ?? job?.status ?? 'QUEUED'
  const message = progressState?.message
  const narratives: { id: string; mode: string; title: string; sceneCount: number }[] = job?.narratives ?? []

  if (!jobId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <InfinityFlow className="mx-auto h-12 w-24 text-amber/40" />
          <p className="mt-4 text-sm text-slate">No active job.</p>
          <Button variant="outline" size="sm" onClick={openLibrary} className="mt-4 gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to library
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={openLibrary} className="gap-1.5 text-slate hover:text-amber">
          <ArrowLeft className="h-4 w-4" /> Library
        </Button>
        <Badge variant="outline" className={`gap-1.5 ${connected ? 'border-calm/30 text-calm' : 'border-slate/30 text-slate'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-calm' : 'bg-slate'}`} />
          {connected ? 'Realtime' : 'Polling'}
        </Badge>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.gentle}
      >
        <Card className="overflow-hidden border-amber/12 surface-raised">
          <div className="divider-gold" />
          <CardHeader className="border-b border-amber/8 bg-linear-to-br from-amber/5 to-transparent">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 font-serif text-xl text-ivory">
                  {status === 'COMPLETED' ? (
                    <CheckCircle2 className="h-5 w-5 text-calm" />
                  ) : status === 'FAILED' ? (
                    <AlertCircle className="h-5 w-5 text-burgundy" />
                  ) : (
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}>
                      <InfinityFlow className="h-5 w-10 text-amber" />
                    </motion.div>
                  )}
                  {doc?.originalName ?? 'Processing…'}
                </CardTitle>
                <p className="flex items-center gap-2 text-xs text-slate">
                  <span>Mode: <span className="text-amber">{job?.mode ?? '—'}</span></span>
                  <span className="text-amber/20">·</span>
                  <span>Job: <code className="rounded bg-midnight/60 px-1.5 py-0.5 text-[10px] text-amber/70">{jobId?.slice(-8)}</code></span>
                </p>
              </div>
              <div className="text-right">
                <motion.div
                  key={progress}
                  initial={{ scale: 0.9, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={spring.snappy}
                  className="font-serif text-4xl font-medium text-amber-gradient"
                  // Announce progress to screen readers. Assertive would be too noisy
                  // (fires on every percent); polite lets the SR pick a natural gap.
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span aria-hidden="true">{progress}%</span>
                  <span className="sr-only">{progress} percent — {status}</span>
                </motion.div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-slate">{status}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            {/* Progress bar */}
            <div
              className="relative h-1.5 w-full overflow-hidden rounded-full bg-midnight/60"
              role="progressbar"
              aria-label="Processing progress"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <motion.div
                className="h-full rounded-full bg-linear-to-r from-amber via-amber to-burgundy"
                animate={{ width: `${progress}%` }}
                transition={spring.gentle}
              />
              {status !== 'COMPLETED' && status !== 'FAILED' && (
                <motion.div
                  className="absolute inset-0 bg-linear-to-r from-transparent via-amber/20 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </div>
            {message && <p className="text-xs italic text-slate">{message}</p>}

            {/* Pipeline stages */}
            <PipelineStages stage={stage} status={status} />

            {/* Log terminal */}
            <LogTerminal logs={logs} />

            {/* Completion */}
            <AnimatePresence>
              {status === 'COMPLETED' && narratives.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={spring.gentle}
                  className="rounded-xl border border-calm/25 bg-calm/5 p-5"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-calm" />
                    <h4 className="font-serif text-sm font-medium text-ivory">Narrative Ready</h4>
                  </div>
                  <p className="mt-1 text-xs text-slate">{narratives.length} narrative(s) generated. Choose a reading experience:</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {narratives.map((n) => (
                      <Button
                        key={n.id}
                        size="sm"
                        onClick={() => openReader(n.id, n.mode as 'ORIGINAL' | 'CINEMATIFIED', documentId ?? undefined)}
                        className={`gap-1.5 ${
                          n.mode === 'CINEMATIFIED'
                            ? 'border-amber/30 bg-linear-to-br from-amber/20 to-amber/5 text-amber hover:from-amber/30 hover:to-amber/10'
                            : 'border-amber/15 bg-transparent text-ivory hover:bg-amber/5'
                        }`}
                      >
                        {n.mode === 'CINEMATIFIED' ? <Film className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}
                        {n.mode === 'CINEMATIFIED' ? 'Cinematified' : 'Original'}
                        {n.mode === 'CINEMATIFIED' && n.sceneCount > 0 && (
                          <Badge variant="outline" className="ml-1 border-amber/20 text-[10px] text-amber">{n.sceneCount} scenes</Badge>
                        )}
                      </Button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {status === 'FAILED' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-burgundy/25 bg-burgundy/5 p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-burgundy" />
                  <h4 className="font-serif text-sm font-medium text-burgundy">Processing Failed</h4>
                </div>
                <p className="mt-1 text-xs text-slate">{job?.error ?? message ?? 'An unexpected error occurred.'}</p>
              </motion.div>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-amber/8 bg-midnight/20 p-3">
              <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber/60" />
              <p className="text-[11px] leading-snug text-slate">All processing runs locally via the deterministic pipeline. No outbound network calls, no AI APIs.</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
