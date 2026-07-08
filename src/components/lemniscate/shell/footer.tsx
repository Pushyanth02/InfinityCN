'use client'

import { InfinityMark, Flourish } from '../logo'
import { ShieldCheck, Server, Github } from 'lucide-react'

export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-amber/10 bg-midnight/40">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex justify-center">
          <Flourish className="h-3 w-32 text-amber/30" />
        </div>
        <div className="mt-6 flex flex-col items-center justify-between gap-3 text-[11px] text-slate sm:flex-row">
          <div className="flex items-center gap-2">
            <InfinityMark className="h-4 w-4 text-amber/60" />
            <span>© {new Date().getFullYear()} Lemniscate — Transform Documents Into Living Narratives</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-calm" /> Privacy-first
            </span>
            <span className="text-amber/30">·</span>
            <span className="inline-flex items-center gap-1">
              <Server className="h-3 w-3 text-amber" /> Self-hostable
            </span>
            <span className="text-amber/30">·</span>
            <span className="inline-flex items-center gap-1">
              <Github className="h-3 w-3" /> Open
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
