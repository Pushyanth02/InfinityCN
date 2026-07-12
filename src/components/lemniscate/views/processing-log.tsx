'use client'

/**
 * Lemniscate — Processing log terminal
 * ----------------------------------------------------------------------------
 * The live log stream rendered from realtime log entries. Extracted verbatim
 * from `processing.tsx`; behavior is unchanged.
 */

import { motion, AnimatePresence } from 'framer-motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { spring } from '@/lib/motion'
import { Terminal } from 'lucide-react'
import type { LogEntry } from '../use-realtime'

export function LogTerminal({ logs }: { logs: LogEntry[] }) {
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber/60">
        <Terminal className="h-3.5 w-3.5" /> Processing Log
      </h4>
      <div
        className="rounded-xl border border-amber/10 bg-midnight/50 p-3 font-mono"
        role="log"
        aria-live="polite"
        aria-label="Processing log stream"
      >
        <ScrollArea className="h-44 scrollbar-lemniscate">
          {logs.length === 0 ? (
            <p className="text-xs italic text-slate/50">Awaiting log stream…</p>
          ) : (
            <div className="space-y-0.5 text-[11px] leading-relaxed">
              <AnimatePresence>
                {logs.map((l, i) => (
                  <motion.div
                    key={`${l.timestamp}-${i}-${l.stage}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={spring.snappy}
                    className="flex gap-2"
                  >
                    <span className="shrink-0 text-slate/40">{new Date(l.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                    <span className={`shrink-0 font-semibold ${l.level === 'ERROR' ? 'text-burgundy' : l.level === 'WARN' ? 'text-amber' : l.level === 'DEBUG' ? 'text-slate/50' : 'text-calm'}`}>
                      [{l.level}]
                    </span>
                    <span className="shrink-0 text-amber/60">{l.stage}</span>
                    <span className="text-ivory/80">{l.message}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
