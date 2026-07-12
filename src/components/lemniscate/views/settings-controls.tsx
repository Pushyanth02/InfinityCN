'use client'

/**
 * Lemniscate — Settings reusable controls
 * ----------------------------------------------------------------------------
 * The segmented radio-group control and the toggle switch used throughout the
 * settings sections. Extracted verbatim from `settings.tsx`; behavior is
 * unchanged.
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import { spring } from '@/lib/motion'
import { Check } from 'lucide-react'

// ─── Reusable segmented control ──────────────────────────────────────────────

export interface SegmentedOption<T extends string> {
  key: T
  label: string
  preview?: React.ReactNode
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  columns,
}: {
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (v: T) => void
  ariaLabel: string
  columns?: number
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.key)}
            className={`rounded-lg border p-3 text-center transition-all ${
              active
                ? 'border-amber/40 bg-amber/10'
                : 'border-amber/10 bg-midnight/20 hover:border-amber/25'
            }`}
          >
            {opt.preview}
            <div className="mt-1 text-[11px] text-slate">{opt.label}</div>
            {active && <Check className="mx-auto mt-1 h-3 w-3 text-amber" />}
          </button>
        )
      })}
    </div>
  )
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-amber' : 'bg-midnight/60 border border-amber/20'
      }`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <motion.div
        animate={{ x: checked ? 22 : 2 }}
        transition={spring.snappy}
        className="absolute top-0.5 h-5 w-5 rounded-full bg-ivory shadow"
      />
    </button>
  )
}
