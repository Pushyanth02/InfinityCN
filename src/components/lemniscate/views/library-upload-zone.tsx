'use client'

/**
 * Lemniscate — Library upload zone
 * ----------------------------------------------------------------------------
 * The collapsible upload panel: transformation-mode selector and a drag-and-drop
 * (or click-to-browse) drop zone that posts to the upload endpoint. Extracted
 * verbatim from `library.tsx`; behavior is unchanged.
 */

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileUp, ChevronDown, Layers, Type, Film, Loader2, Upload } from 'lucide-react'

import { useLemniscate } from '../store'
import { useToast } from '@/hooks/use-toast'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { spring } from '@/lib/motion'
import { ACCEPTED, uploadDocument } from './library-shared'

// ─── Upload zone (collapsible) ───────────────────────────────────────────────

export function UploadZone({
  onUploaded,
}: {
  onUploaded: (jobId: string, documentId: string) => void
}) {
  const { toast } = useToast()
  const uploadMode = useLemniscate((s) => s.uploadMode)
  const setUploadMode = useLemniscate((s) => s.setUploadMode)
  const [open, setOpen] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleFile = React.useCallback(
    async (file: File) => {
      setUploading(true)
      try {
        const { jobId, documentId } = await uploadDocument(file, uploadMode)
        toast({
          title: 'Document queued',
          description: `${file.name} → ${uploadMode}. Processing has begun.`,
        })
        onUploaded(jobId, documentId)
      } catch (err) {
        toast({
          title: 'Upload failed',
          description: (err as Error).message,
          variant: 'destructive',
        })
      } finally {
        setUploading(false)
      }
    },
    [uploadMode, onUploaded, toast],
  )

  return (
    <div className="surface-raised overflow-hidden rounded-xl border-amber/12">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-amber/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/40"
        aria-expanded={open}
        aria-controls="upload-zone-panel"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber/20 bg-amber/10 text-amber">
            <FileUp className="h-4 w-4" />
          </span>
          <span>
            <span className="block font-serif text-sm font-medium text-ivory">
              Upload a document
            </span>
            <span className="block text-[11px] text-muted-foreground">
              Drag &amp; drop · PDF / DOCX / TXT · mode: <span className="text-amber/80">{uploadMode}</span>
            </span>
          </span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring.snappy}>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="upload-zone-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-amber/10 p-4">
              {/* Mode selector */}
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Layers className="h-3.5 w-3.5 text-amber/70" />
                  <span className="uppercase tracking-[0.15em]">Transformation mode</span>
                </div>
                <Tabs
                  value={uploadMode}
                  onValueChange={(v) => setUploadMode(v as typeof uploadMode)}
                >
                  <TabsList className="bg-midnight/60">
                    <TabsTrigger
                      value="ORIGINAL"
                      className="gap-1.5 text-xs data-[state=active]:bg-amber/15 data-[state=active]:text-amber"
                    >
                      <Type className="h-3.5 w-3.5" />
                      Original
                    </TabsTrigger>
                    <TabsTrigger
                      value="CINEMATIFIED"
                      className="gap-1.5 text-xs data-[state=active]:bg-amber/15 data-[state=active]:text-amber"
                    >
                      <Film className="h-3.5 w-3.5" />
                      Cinematified
                    </TabsTrigger>
                    <TabsTrigger
                      value="BOTH"
                      className="gap-1.5 text-xs data-[state=active]:bg-amber/15 data-[state=active]:text-amber"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Both
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Drop zone */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Drop a file here or press Enter to browse for a document"
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFile(f)
                }}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    inputRef.current?.click()
                  }
                }}
                className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50 ${
                  dragging
                    ? 'border-amber bg-amber/10 shadow-glow-amber'
                    : 'border-amber/25 hover:border-amber/50 hover:bg-amber/5'
                }`}
              >
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-amber" />
                ) : (
                  <Upload className="h-8 w-8 text-muted-foreground transition-colors group-hover:text-amber" />
                )}
                <div className="space-y-1">
                  <p className="font-serif text-sm font-medium text-ivory">
                    {uploading ? 'Uploading…' : 'Drop a file or click to browse'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    PDF · DOCX · TXT · MD · max 25 MB
                  </p>
                </div>

                {/* File type icons */}
                <div className="mt-2 flex items-center gap-2" aria-hidden>
                  {['PDF', 'DOCX', 'TXT'].map((label, i) => (
                    <span
                      key={label}
                      className="rounded-md border border-amber/15 bg-midnight/40 px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground"
                      style={{ opacity: 0.5 + i * 0.15 }}
                    >
                      {label}
                    </span>
                  ))}
                </div>

                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
