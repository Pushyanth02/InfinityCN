/**
 * Lemniscate — Character Detection Engine v2
 * ----------------------------------------------------------------------------
 * A multi-stage, fully deterministic character-detection pipeline. No models,
 * no randomness, no network. Identical input ⇒ byte-identical output.
 *
 * Stages
 *   1. Named-entity detection      — proper-noun sequences (verbatim surfaces)
 *   2. Honorific detection         — "Mr Darcy", "Captain Ahab", …
 *   3. Dialogue-speaker detection  — attribution verbs + quoted-line speakers
 *   4. Mention aggregation         — count/offsets per normalized surface
 *   5. Alias & nickname resolution — conservative clustering of surface forms
 *   6. Canonical-name selection    — longest, most-supported surface wins
 *   7. Scene participation         — offset → scene mapping
 *   8. Pronoun resolution (Task 3) — conservative nearest-entity heuristic
 *   9. Co-occurrence graph (Task 3)— scene-level pair counts
 *  10. Scoring                     — importance + confidence in [0,100]
 *
 * The engine never invents an entity: every character is grounded in at least
 * one verbatim surface mention from the source text.
 */

import { extractDialogue } from './core'
import {
  HONORIFICS,
  ATTRIBUTION_VERBS_LOWER,
  STOP_WORDS,
  COMMON_GIVEN_NAMES,
  NICKNAME_TO_CANONICAL,
  NICKNAMES,
  normalizeToken,
  inferGenderFromName,
  inferGenderFromHonorific,
} from './lexicons'
import type {
  DetectedCharacter,
  CharacterAnalysis,
  CoOccurrenceGraph,
  CoOccurrenceEdge,
  Gender,
} from './analysis-types'

// ---------------------------------------------------------------------------
// Compiled regex (module-scope — compiled once, reused across every call)
// ---------------------------------------------------------------------------

/** Proper-noun sequence: 1–3 capitalized words (accents/apostrophes allowed). */
const NAME_RE =
  /\b([A-Z][a-zA-ZÀ-ÖØ-öø-ÿ'’\-]{1,}(?:\s+[A-Z][a-zA-ZÀ-ÖØ-öø-ÿ'’\-]{1,}){0,2})\b/g

/** Capitalized words that are never characters (sentence openers, calendar…). */
const CAPITALIZED_STOP_WORDS = new Set([
  'The', 'A', 'An', 'It', 'He', 'She', 'They', 'We', 'You', 'I', 'His', 'Her',
  'Their', 'Its', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
  'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December', 'Christmas',
  'Easter', 'Yes', 'No', 'Oh', 'Ah', 'Wow', 'Hey', 'God', 'Lord', 'Heaven',
  'Hell', 'Earth', 'Sir', 'Madam', 'Well', 'Then', 'Now', 'But', 'And', 'So',
  'When', 'While', 'Where', 'What', 'Who', 'Why', 'How', 'This', 'That', 'These',
  'Those', 'There', 'Here', 'Once', 'Chapter', 'Prologue', 'Epilogue', 'Part',
  'Book', 'Act', 'Scene',
])

const honorificAlternation = [...HONORIFICS].map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
/** Honorific + name: captures the honorific (g1) and the following name (g2). */
const HONORIFIC_NAME_RE = new RegExp(
  `\\b(${honorificAlternation})\\.?\\s+([A-Z][a-zà-öø-ÿ'’\\-]+(?:\\s+[A-Z][a-zà-öø-ÿ'’\\-]+){0,2})`,
  'g',
)

const attrVerbAlternation = [...ATTRIBUTION_VERBS_LOWER].map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
/** "<Name> said/asked/…" — subject-before-verb attribution. */
const ATTR_NAME_VERB_RE = new RegExp(
  `\\b([A-Z][a-zà-öø-ÿ'’\\-]+(?:\\s+[A-Z][a-zà-öø-ÿ'’\\-]+){0,2})\\s+(?:${attrVerbAlternation})\\b`,
  'g',
)

/** Pronoun surface forms grouped by the gender they require for resolution. */
const MALE_PRONOUNS = new Set(['he', 'him', 'his', 'himself'])
const FEMALE_PRONOUNS = new Set(['she', 'her', 'hers', 'herself'])
const PRONOUN_RE = /\b(he|him|his|himself|she|her|hers|herself)\b/gi

/** Bounded search window (characters) for pronoun antecedent resolution. */
const PRONOUN_WINDOW = 300

/** Honorific tokens, lowercased — used to strip leading titles from surfaces. */
const HONORIFICS_LOWER = new Set([...HONORIFICS].map((h) => h.toLowerCase()))

// ---------------------------------------------------------------------------
// Internal working structures
// ---------------------------------------------------------------------------

interface RawSurface {
  /** Verbatim display form (original casing, honorific stripped). */
  display: string
  /** Normalized tokens (lowercase, letters-only). */
  tokens: string[]
  offsets: number[]
  speakingCount: number
  honorifics: Set<string>
}

interface Cluster {
  members: RawSurface[]
  /** Union of normalized given-name tokens (first tokens + nickname canon). */
  givenTokens: Set<string>
  /** Union of normalized surname tokens (last tokens of multi-word forms). */
  surnameTokens: Set<string>
  /** Union of every normalized token seen in the cluster. */
  allTokens: Set<string>
  honorifics: Set<string>
}

// ---------------------------------------------------------------------------
// Stage 1–4: candidate surface extraction & aggregation
// ---------------------------------------------------------------------------

/**
 * Extract and aggregate candidate character surfaces from the text and the
 * reconstructed paragraphs. Returns a normalized-key → RawSurface map.
 */
function collectSurfaces(text: string, paragraphs: { text: string; startOffset: number }[]): Map<string, RawSurface> {
  const surfaces = new Map<string, RawSurface>()

  const record = (display: string, offset: number, isSpeaker: boolean, honorific?: string) => {
    const trimmed = display.trim().replace(/[’']s$/, '') // drop trailing possessive
    if (!trimmed) return
    const words = trimmed.split(/\s+/)
    let tokens = words.map(normalizeToken).filter(Boolean)
    if (tokens.length === 0) return
    // Strip any leading honorific tokens embedded in the captured surface
    // (e.g. "Mr Darcy" → name "Darcy" + honorific "Mr"). Keeps canonical names
    // free of titles and lets honorific/plain surfaces cluster together.
    const strippedHonorifics: string[] = []
    while (tokens.length > 1 && HONORIFICS_LOWER.has(tokens[0])) {
      strippedHonorifics.push(cap(tokens[0]))
      tokens = tokens.slice(1)
      words.shift()
    }
    const cleanDisplay = words.join(' ').trim() || trimmed
    const key = tokens.join(' ')
    let s = surfaces.get(key)
    if (!s) {
      s = { display: cleanDisplay, tokens, offsets: [], speakingCount: 0, honorifics: new Set() }
      surfaces.set(key, s)
    }
    s.offsets.push(offset)
    if (isSpeaker) s.speakingCount += 1
    if (honorific) s.honorifics.add(honorific.replace(/\.$/, ''))
    for (const h of strippedHonorifics) s.honorifics.add(h)
  }

  // Stage 2 — Honorific + name.
  let m: RegExpExecArray | null
  HONORIFIC_NAME_RE.lastIndex = 0
  while ((m = HONORIFIC_NAME_RE.exec(text)) !== null) {
    record(m[2], m.index, false, m[1])
  }

  // Stage 3a — Attribution "<Name> said".
  ATTR_NAME_VERB_RE.lastIndex = 0
  while ((m = ATTR_NAME_VERB_RE.exec(text)) !== null) {
    record(m[1], m.index, true)
  }

  // Stage 3b — Quoted-dialogue speakers (from paragraph-level extraction).
  for (const p of paragraphs) {
    for (const d of extractDialogue(p.text)) {
      if (d.speaker) record(d.speaker, p.startOffset + d.start, true)
    }
  }

  // Stage 1 — Proper-noun sequences.
  NAME_RE.lastIndex = 0
  while ((m = NAME_RE.exec(text)) !== null) {
    const name = m[1]
    const firstTok = name.split(/\s+/)[0]
    // A capitalized word directly after a sentence terminator is usually just a
    // sentence opener — only keep it when it is a recognised given name.
    const preceding = text.slice(Math.max(0, m.index - 3), m.index)
    const atSentenceStart = /[.!?]\s$/.test(preceding) || m.index === 0
    if (atSentenceStart && !COMMON_GIVEN_NAMES.has(firstTok)) continue
    if (CAPITALIZED_STOP_WORDS.has(name) || CAPITALIZED_STOP_WORDS.has(firstTok)) continue
    if (STOP_WORDS.has(name.toLowerCase())) continue
    record(name, m.index, false)
  }

  return surfaces
}

/** Keep only surfaces that clear the "is this really a character?" bar. */
function filterSurfaces(surfaces: Map<string, RawSurface>): RawSurface[] {
  const kept: RawSurface[] = []
  for (const s of surfaces.values()) {
    const first = s.tokens[0]
    if (s.tokens.every((t) => STOP_WORDS.has(t))) continue
    const isKnownName = COMMON_GIVEN_NAMES.has(cap(first)) || !!NICKNAME_TO_CANONICAL[first]
    const hasHonorific = s.honorifics.size > 0
    const isSpeaker = s.speakingCount > 0
    // Require corroboration: repeated mention, a known name, a speaker role, or
    // an honorific. This is what keeps stray capitalised nouns out.
    if (s.offsets.length < 2 && !isKnownName && !hasHonorific && !isSpeaker) continue
    kept.push(s)
  }
  return kept
}

// ---------------------------------------------------------------------------
// Stage 5–6: alias / nickname resolution + canonical selection
// ---------------------------------------------------------------------------

/** Canonical given-name for a token (resolves nicknames deterministically). */
function canonicalGiven(token: string): string {
  return NICKNAME_TO_CANONICAL[token] ?? token
}

/**
 * Decide whether a surface belongs to an existing cluster. Conservative: a
 * single ambiguous surname does not merge (the caller only merges on a UNIQUE
 * match, so ambiguity naturally keeps entities separate).
 */
function clusterMatch(cluster: Cluster, s: RawSurface): boolean {
  if (s.tokens.length >= 2) {
    // Multi-word: the given name must line up, and the surname must either match
    // or the cluster must not yet have a (conflicting) surname. This lets
    // "Elizabeth" ↔ "Elizabeth Bennet" merge while keeping "Mary Smith" and
    // "Mary Jones" apart.
    const given = canonicalGiven(s.tokens[0])
    const surname = s.tokens[s.tokens.length - 1]
    const givenOk = cluster.givenTokens.has(given) || cluster.givenTokens.has(s.tokens[0])
    const surnameOk = cluster.surnameTokens.has(surname) || cluster.surnameTokens.size === 0
    return givenOk && surnameOk
  }
  // Single token: match by given-name (incl. nickname canon) or unique surname.
  const t = s.tokens[0]
  const canon = canonicalGiven(t)
  if (cluster.givenTokens.has(canon) || cluster.givenTokens.has(t)) return true
  if (cluster.surnameTokens.has(t)) return true
  // Nickname of a cluster's canonical given name.
  const nicks = NICKNAMES[canon]
  if (nicks && [...cluster.givenTokens].some((g) => canonicalGiven(g) === canon)) return true
  return false
}

function addToCluster(cluster: Cluster, s: RawSurface): void {
  cluster.members.push(s)
  for (const h of s.honorifics) cluster.honorifics.add(h)
  for (const tok of s.tokens) cluster.allTokens.add(tok)
  if (s.tokens.length >= 2) {
    cluster.givenTokens.add(canonicalGiven(s.tokens[0]))
    cluster.surnameTokens.add(s.tokens[s.tokens.length - 1])
  } else {
    cluster.givenTokens.add(canonicalGiven(s.tokens[0]))
  }
}

function newCluster(s: RawSurface): Cluster {
  const c: Cluster = {
    members: [],
    givenTokens: new Set(),
    surnameTokens: new Set(),
    allTokens: new Set(),
    honorifics: new Set(),
  }
  addToCluster(c, s)
  return c
}

/** Cluster surfaces into character groups (deterministic, order-stable). */
function clusterSurfaces(surfaces: RawSurface[]): Cluster[] {
  // Sort by strength so the most-supported surface seeds each cluster first:
  // mentions desc, then earliest offset asc, then key asc (total order).
  const ordered = [...surfaces].sort((a, b) => {
    if (b.offsets.length !== a.offsets.length) return b.offsets.length - a.offsets.length
    const af = Math.min(...a.offsets)
    const bf = Math.min(...b.offsets)
    if (af !== bf) return af - bf
    return a.tokens.join(' ').localeCompare(b.tokens.join(' '))
  })

  const clusters: Cluster[] = []
  for (const s of ordered) {
    const matches = clusters.filter((c) => clusterMatch(c, s))
    if (matches.length === 1) addToCluster(matches[0], s)
    else clusters.push(newCluster(s)) // 0 matches OR ambiguous ⇒ keep separate
  }
  return clusters
}

/** Build the deterministic id slug for a canonical name, ensuring uniqueness. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'character'
}

function cap(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word
}

// ---------------------------------------------------------------------------
// Public entry: build base characters (stages 1–6 + preliminary metrics)
// ---------------------------------------------------------------------------

/**
 * Detect characters from the text + paragraphs (stages 1–6). Scene membership
 * and pronoun resolution are layered on in {@link analyzeCharacters}. Scores
 * are preliminary here; the full pipeline finalizes them.
 */
export function detectCharacters(
  text: string,
  paragraphs: { text: string; startOffset: number }[],
): DetectedCharacter[] {
  const surfaces = filterSurfaces(collectSurfaces(text, paragraphs))
  if (surfaces.length === 0) return []
  const clusters = clusterSurfaces(surfaces)

  const usedIds = new Set<string>()
  const characters: DetectedCharacter[] = clusters.map((cluster) => {
    // Canonical name: prefer the richest surface (most tokens), then most
    // mentions, then earliest offset — a stable total order.
    const canonicalMember = [...cluster.members].sort((a, b) => {
      if (b.tokens.length !== a.tokens.length) return b.tokens.length - a.tokens.length
      if (b.offsets.length !== a.offsets.length) return b.offsets.length - a.offsets.length
      return Math.min(...a.offsets) - Math.min(...b.offsets)
    })[0]
    const canonicalName = canonicalMember.display

    const allOffsets: number[] = []
    let speakingCount = 0
    for (const mMember of cluster.members) {
      allOffsets.push(...mMember.offsets)
      speakingCount += mMember.speakingCount
    }
    allOffsets.sort((a, b) => a - b)

    const aliases = Array.from(new Set(cluster.members.map((mm) => mm.display)))
      .filter((d) => d !== canonicalName)
      .sort((a, b) => a.localeCompare(b))

    const honorifics = [...cluster.honorifics].sort((a, b) => a.localeCompare(b))

    // Gender: honorific evidence first, then name lexicons.
    let gender: Gender = 'UNKNOWN'
    for (const h of honorifics) {
      const g = inferGenderFromHonorific(h)
      if (g !== 'UNKNOWN') { gender = g; break }
    }
    if (gender === 'UNKNOWN') gender = inferGenderFromName(canonicalName)

    // Deterministic unique id.
    let id = slugify(canonicalName)
    if (usedIds.has(id)) {
      let n = 2
      while (usedIds.has(`${id}-${n}`)) n++
      id = `${id}-${n}`
    }
    usedIds.add(id)

    return {
      id,
      canonicalName,
      aliases,
      honorifics,
      gender,
      mentions: allOffsets.length,
      nameMentions: allOffsets.length,
      resolvedPronounMentions: 0,
      speakingCount,
      scenes: [],
      firstAppearanceOffset: allOffsets[0] ?? 0,
      lastAppearanceOffset: allOffsets[allOffsets.length - 1] ?? 0,
      importanceScore: 0,
      confidenceScore: 0,
      role: 'SUPPORTING',
    }
  })

  // Deterministic ordering: mentions desc, earliest appearance, name asc.
  characters.sort(
    (a, b) =>
      b.mentions - a.mentions ||
      a.firstAppearanceOffset - b.firstAppearanceOffset ||
      a.canonicalName.localeCompare(b.canonicalName),
  )
  return characters
}

// ---------------------------------------------------------------------------
// Stage 8: conservative pronoun resolution (Task 3)
// ---------------------------------------------------------------------------

interface NameMentionRef {
  offset: number
  charIndex: number
  gender: Gender
}

/**
 * Resolve gendered pronouns to the nearest gender-agreeing character mention
 * within a bounded window. Conservative: never creates entities, skips when no
 * gender-matching antecedent is found. Mutates `characters` (resolvedPronoun
 * counts) and returns per-character resolved-pronoun offsets for scene mapping.
 */
export function resolvePronouns(
  text: string,
  characters: DetectedCharacter[],
  nameMentionsByChar: number[][],
): number[][] {
  const resolvedOffsets: number[][] = characters.map(() => [])
  if (characters.length === 0) return resolvedOffsets

  // Flatten grounded name mentions into an offset-sorted list with gender.
  const refs: NameMentionRef[] = []
  for (let ci = 0; ci < characters.length; ci++) {
    for (const off of nameMentionsByChar[ci]) {
      refs.push({ offset: off, charIndex: ci, gender: characters[ci].gender })
    }
  }
  refs.sort((a, b) => a.offset - b.offset)
  if (refs.length === 0) return resolvedOffsets

  let m: RegExpExecArray | null
  PRONOUN_RE.lastIndex = 0
  let refCursor = 0
  while ((m = PRONOUN_RE.exec(text)) !== null) {
    const pron = m[1].toLowerCase()
    const required: Gender = MALE_PRONOUNS.has(pron) ? 'MALE' : FEMALE_PRONOUNS.has(pron) ? 'FEMALE' : 'UNKNOWN'
    if (required === 'UNKNOWN') continue
    const pOffset = m.index

    // Advance cursor to the last ref before this pronoun.
    while (refCursor < refs.length && refs[refCursor].offset < pOffset) refCursor++
    // Scan backward for the nearest gender-agreeing antecedent in-window.
    let best = -1
    for (let i = refCursor - 1; i >= 0; i--) {
      if (pOffset - refs[i].offset > PRONOUN_WINDOW) break
      if (refs[i].gender === required) { best = i; break }
    }
    if (best === -1) continue
    const ci = refs[best].charIndex
    characters[ci].resolvedPronounMentions += 1
    resolvedOffsets[ci].push(pOffset)
  }
  return resolvedOffsets
}

// ---------------------------------------------------------------------------
// Stage 7 + 9: scene participation & co-occurrence graph (Task 3)
// ---------------------------------------------------------------------------

export interface SceneRange {
  index: number
  startOffset: number
  endOffset: number
}

/**
 * Assign each character the ascending list of scene indices in which any of its
 * grounded offsets (names + resolved pronouns) falls. Mutates `characters`.
 */
function assignScenes(
  characters: DetectedCharacter[],
  offsetsByChar: number[][],
  scenes: SceneRange[],
): Set<string>[] {
  const perScene: Set<string>[] = scenes.map(() => new Set<string>())
  if (scenes.length === 0) {
    for (const c of characters) c.scenes = []
    return perScene
  }
  // Sort scenes by start for a deterministic offset→scene lookup.
  const ordered = [...scenes].sort((a, b) => a.startOffset - b.startOffset)
  for (let ci = 0; ci < characters.length; ci++) {
    const sceneSet = new Set<number>()
    for (const off of offsetsByChar[ci]) {
      for (const s of ordered) {
        if (off >= s.startOffset && off <= s.endOffset) {
          sceneSet.add(s.index)
          perScene[scenes.findIndex((x) => x.index === s.index)]?.add(characters[ci].id)
          break
        }
      }
    }
    characters[ci].scenes = [...sceneSet].sort((a, b) => a - b)
  }
  return perScene
}

/** Build the undirected co-occurrence graph from per-scene character sets. */
export function buildCoOccurrence(perScene: Set<string>[]): CoOccurrenceGraph {
  const counts = new Map<string, number>()
  for (const set of perScene) {
    const ids = [...set].sort((a, b) => a.localeCompare(b))
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}\u0000${ids[j]}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  const edges: CoOccurrenceEdge[] = []
  let maxWeight = 0
  for (const [key, weight] of counts) {
    const [source, target] = key.split('\u0000')
    edges.push({ source, target, weight })
    if (weight > maxWeight) maxWeight = weight
  }
  // Deterministic edge ordering: weight desc, then source, then target.
  edges.sort(
    (a, b) => b.weight - a.weight || a.source.localeCompare(b.source) || a.target.localeCompare(b.target),
  )
  return { edges, maxWeight }
}

// ---------------------------------------------------------------------------
// Stage 10: importance & confidence scoring
// ---------------------------------------------------------------------------

/** Compute bounded importance + confidence scores (mutates `characters`). */
function scoreCharacters(characters: DetectedCharacter[], sceneCount: number): void {
  const maxMentions = Math.max(1, ...characters.map((c) => c.mentions))
  const maxSpeaking = Math.max(1, ...characters.map((c) => c.speakingCount))
  const maxScenes = Math.max(1, sceneCount)

  for (const c of characters) {
    const mentionRatio = c.mentions / maxMentions
    const speakingRatio = c.speakingCount / maxSpeaking
    const sceneRatio = c.scenes.length / maxScenes
    // Weighted blend — mentions dominate, speaking + presence refine.
    const importance = 100 * (0.55 * mentionRatio + 0.25 * speakingRatio + 0.2 * sceneRatio)
    c.importanceScore = clampInt(importance)

    // Confidence: sum of corroborating signals.
    let conf = 20
    if (c.speakingCount > 0) conf += 25
    if (c.honorifics.length > 0) conf += 15
    if (c.mentions >= 3) conf += 15
    else if (c.mentions >= 2) conf += 8
    if (inferGenderFromName(c.canonicalName) !== 'UNKNOWN' || COMMON_GIVEN_NAMES.has(c.canonicalName.split(/\s+/)[0])) conf += 10
    if (c.canonicalName.trim().includes(' ')) conf += 10 // full name
    if (c.aliases.length > 0) conf += 5
    c.confidenceScore = clampInt(conf)
  }
}

function clampInt(x: number): number {
  return Math.max(0, Math.min(100, Math.round(x)))
}

// ---------------------------------------------------------------------------
// Orchestration: full character analysis (Tasks 2 + 3)
// ---------------------------------------------------------------------------

/**
 * Full character analysis: detection → scene participation → pronoun
 * resolution → co-occurrence graph → scoring. Pure & deterministic.
 */
export function analyzeCharacters(
  text: string,
  paragraphs: { text: string; startOffset: number }[],
  scenes: SceneRange[],
): CharacterAnalysis {
  const characters = detectCharacters(text, paragraphs)
  if (characters.length === 0) {
    return { characters, coOccurrence: { edges: [], maxWeight: 0 } }
  }

  // Reconstruct grounded name-mention offsets per character by re-running the
  // surface collection and mapping via canonical/alias membership. To avoid a
  // second parse we recompute offsets directly from the detected surfaces.
  const nameOffsetsByChar = collectNameOffsets(text, paragraphs, characters)

  // Pronoun resolution (adds resolved counts + offsets).
  const resolvedOffsetsByChar = resolvePronouns(text, characters, nameOffsetsByChar)

  // Combined grounded offsets (names + resolved pronouns) for scene mapping.
  const combinedOffsets = characters.map((_, i) => [...nameOffsetsByChar[i], ...resolvedOffsetsByChar[i]])

  // Reconcile counts with the authoritative full-text surface matches (this
  // recovers sentence-initial mentions that the detection pass conservatively
  // skips), then fold in resolved pronouns and refresh first/last offsets.
  for (let i = 0; i < characters.length; i++) {
    const c = characters[i]
    c.nameMentions = Math.max(c.nameMentions, nameOffsetsByChar[i].length)
    c.mentions = c.nameMentions + c.resolvedPronounMentions
    const all = combinedOffsets[i]
    if (all.length > 0) {
      c.firstAppearanceOffset = Math.min(...all)
      c.lastAppearanceOffset = Math.max(...all)
    }
  }

  const perScene = assignScenes(characters, combinedOffsets, scenes)
  const coOccurrence = buildCoOccurrence(perScene)
  scoreCharacters(characters, scenes.length)

  return { characters, coOccurrence }
}

/**
 * Recompute grounded name-mention offsets for each detected character by
 * matching its canonical name + aliases against the text (word-boundary,
 * case-sensitive on the leading capital). Deterministic and allocation-light.
 */
function collectNameOffsets(
  text: string,
  _paragraphs: { text: string; startOffset: number }[],
  characters: DetectedCharacter[],
): number[][] {
  const offsetsByChar: number[][] = characters.map(() => [])
  // Build a single alternation of every surface form → owning character index.
  const formToChar = new Map<string, number>()
  for (let i = 0; i < characters.length; i++) {
    const forms = [characters[i].canonicalName, ...characters[i].aliases]
    for (const f of forms) {
      const norm = f.trim()
      if (norm && !formToChar.has(norm)) formToChar.set(norm, i)
    }
  }
  // Longest forms first so "Elizabeth Bennet" wins over "Elizabeth".
  const forms = [...formToChar.keys()].sort((a, b) => b.length - a.length)
  if (forms.length === 0) return offsetsByChar

  // Single alternation regex: one pass over text instead of N passes.
  // Each form is escaped and wrapped in a named-like pattern. We use a single
  // regex and resolve which form matched by length-descending check at each
  // match position (avoids the O(F*T) cost of N separate regex scans).
  const alternation = forms
    .map((f) => `\\b${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    .join('|')
  const re = new RegExp(alternation, 'g')

  const claimed: Array<[number, number]> = [] // [start,end) spans already matched
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const start = m.index
    const end = start + m[0].length
    // Skip if inside an already-claimed (longer) span.
    if (claimed.some(([s, e]) => start >= s && end <= e)) continue
    // Find which form matched (longest first — deterministic).
    const matched = m[0]
    const ci = formToChar.get(matched)
    if (ci === undefined) continue
    offsetsByChar[ci].push(start)
    claimed.push([start, end])
  }

  for (const arr of offsetsByChar) arr.sort((a, b) => a - b)
  return offsetsByChar
}
