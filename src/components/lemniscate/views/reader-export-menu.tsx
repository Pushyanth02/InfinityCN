'use client'

/**
 * Lemniscate — Reader Export Menu
 * ----------------------------------------------------------------------------
 * Dropdown of deterministic export formats (Markdown / printable HTML / EPUB).
 * Extracted from `reader.tsx` (Phase 4 decomposition) — behavior unchanged;
 * each option opens `/api/narratives/[id]/export?format=…`.
 */
import { motion } from 'framer-motion'
import { spring } from '@/lib/motion'
import { FileText, FileDown, BookOpen, X, Download } from 'lucide-react'

interface ExportMenuProps {
  narrativeId: string
  onClose: () => void
}

export function ExportMenu({ narrativeId, onClose }: ExportMenuProps) {
  const options: Array<{
    format: 'markdown' | 'pdf' | 'epub'
    label: string
    desc: string
    Icon: typeof FileText
  }> = [
    {
      format: 'markdown',
      label: 'Markdown',
      desc: 'Plain text · .md',
      Icon: FileText,
    },
    {
      format: 'pdf',
      label: 'Printable',
      desc: 'HTML · print to PDF',
      Icon: FileDown,
    },
    {
      format: 'epub',
      label: 'EPUB',
      desc: 'E-reader · .epub',
      Icon: BookOpen,
    },
  ]
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -4 }}
      transition={spring.snappy}
      className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-xl border border-amber/20 bg-plum/95 p-1.5 shadow-cinema backdrop-blur-2xl"
      role="menu"
      aria-label="Export narrative"
    >
      <div className="flex items-center justify-between px-2 py-1.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber/60">
          Export
        </p>
        <button
          onClick={onClose}
          aria-label="Close export menu"
          className="text-slate transition-colors hover:text-amber"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {options.map(({ format, label, desc, Icon }) => (
        <button
          key={format}
          role="menuitem"
          onClick={() => {
            window.open(
              `/api/narratives/${narrativeId}/export?format=${format}`,
              '_blank',
              'noopener,noreferrer',
            )
            onClose()
          }}
          className="group flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-amber/10"
        >
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber/70 transition-colors group-hover:text-amber" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ivory">{label}</p>
            <p className="text-[11px] text-slate">{desc}</p>
          </div>
          <Download className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber/40 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      ))}
      <div className="mt-1 border-t border-amber/10 px-2 pt-1.5">
        <p className="text-[10px] italic text-slate/70">
          Generated deterministically · offline
        </p>
      </div>
    </motion.div>
  )
}
