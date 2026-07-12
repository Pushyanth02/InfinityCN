'use client'

/**
 * Lemniscate — Landing FAQ
 * ----------------------------------------------------------------------------
 * The accordion of frequently asked questions. Extracted verbatim from
 * `landing.tsx`; behavior is unchanged.
 */

import { motion } from 'framer-motion'
import { staggerContainer, revealUp, revealBlur } from '@/lib/motion'
import { Card } from '@/components/ui/card'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { SectionEyebrow } from './landing-shared'

// ═══════════════════════════════════════════════════════════════════════════
// 6. FAQ
// ═══════════════════════════════════════════════════════════════════════════

const FAQS = [
  {
    q: 'Is this an AI writer?',
    a: 'No. Lemniscate uses deterministic classical NLP — tokenization, gazetteer matching, regex, and curated lexicons. There are no neural networks, no LLMs, no probabilistic generation. Every transformation is fully reproducible: the same input always yields the same output, byte for byte.',
  },
  {
    q: 'What file types are supported?',
    a: 'PDF, DOCX, DOC, plain TXT, and Markdown. PDF parsing runs in an isolated child process so a malformed file never crashes the server. DOCX uses mammoth; TXT and Markdown are read directly. Files up to 25 MB are accepted.',
  },
  {
    q: 'Does my data leave my device?',
    a: 'Never. All processing happens in-process or in your own self-hosted worker. No content is sent to external APIs. The only network requests are the local API calls between your browser and the Lemniscate service running on your machine or server.',
  },
  {
    q: 'Can I self-host?',
    a: 'Yes. The entire stack is open and self-hostable: Next.js + Prisma + SQLite + an optional Redis-compatible queue. One command starts the worker; the web service can run with an embedded poller so you don’t even need Redis. Deploy on a single VM or a container.',
  },
  {
    q: 'How does the cinematification work?',
    a: 'Classical NLP detects scenes (location, time, topic, heading boundaries), characters (honorifics + attribution verbs + proper nouns), locations (gazetteers + prepositional phrases), events (action verbs + signal lexicons), and per-scene tension & emotion (AFINN-style valence with negation and intensifier multipliers). The source text is never invented — only structurally reorganized into cinematic form with INT./EXT. headings, screenplay dialogue, and transition cues.',
  },
]

export function FAQ() {
  return (
    <section
      aria-labelledby="faq-heading"
      className="relative px-4 py-24 sm:px-6 sm:py-32"
    >
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="flex flex-col items-center"
        >
          <SectionEyebrow>Questions</SectionEyebrow>
          <motion.h2
            id="faq-heading"
            variants={revealBlur}
            className="text-headline text-center text-ivory"
          >
            Frequently{' '}
            <span className="text-amber-gradient">asked</span>
          </motion.h2>
        </motion.div>

        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          variants={revealUp}
          className="mt-12"
        >
          <Card className="glass gap-0 rounded-2xl border-amber/15 px-6 py-2 sm:px-8">
          <Accordion
            type="single"
            collapsible
            defaultValue="faq-0"
          >
            {FAQS.map((faq, i) => (
              <AccordionItem
                key={faq.q}
                value={`faq-${i}`}
                className="border-amber/15"
              >
                <AccordionTrigger className="text-left text-base font-medium text-ivory hover:text-amber hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent>
                  <p
                    className="text-pretty leading-relaxed text-slate"
                    style={{ fontFamily: 'var(--font-reader)' }}
                  >
                    {faq.a}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          </Card>
        </motion.div>
      </div>
    </section>
  )
}
