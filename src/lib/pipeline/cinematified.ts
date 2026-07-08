/**
 * Lemniscate — CINEMATIFIED MODE Engine (composition layer)
 * ----------------------------------------------------------------------------
 * Detect scenes, characters, locations, events, narrative arcs, momentum and
 * emotional peaks. Never invents facts, characters, or dialogue. Never alters
 * chronology.
 *
 * This module is a THIN COORDINATOR: the heavy deterministic analysis lives in
 * dedicated, individually-testable engines under `src/lib/nlp`:
 *   - scenes.ts        → weighted scene segmentation (Task 5)
 *   - characters.ts    → character detection + pronoun resolution (Tasks 2, 3)
 *   - intelligence.ts  → roles / protagonist / antagonist / viewpoint (Task 4)
 *   - emotion.ts       → valence / arousal / peaks / timeline (Task 6)
 *   - momentum.ts      → normalized momentum timeline (Task 7)
 *   - structure.ts     → dramatic-phase detection (Task 8)
 *
 * Public API and result shape are preserved for backwards compatibility;
 * v2 fields are additive. Output is 100% deterministic.
 */
import { splitSentences, isLikelyDialogue } from '../nlp/core'
import {
  INTENSIFIERS, VIOLENCE_LEXICON, CONFLICT_LEXICON,
  LOCATION_INDOOR, LOCATION_OUTDOOR, LOCATION_URBAN, LOCATION_NATURE, LOCATION_VEHICLE,
  TIME_OF_DAY_SIGNALS,
} from '../nlp/lexicons'
import { detectScenes as detectSceneSegments } from '../nlp/scenes'
import { analyzeCharacters } from '../nlp/characters'
import { computeIntelligence, assignRoles } from '../nlp/intelligence'
import { analyzeEmotion } from '../nlp/emotion'
import { analyzeMomentum } from '../nlp/momentum'
import { analyzeStructure } from '../nlp/structure'
import type {
  CharacterIntelligence, CoOccurrenceGraph, EmotionTimelinePoint,
  MomentumPoint, StoryStructure, Gender, StructurePhase,
} from '../nlp/analysis-types'
import type { OriginalParagraph } from './original'

// ---------------------------------------------------------------------------
// Public result types (v2 fields are additive — backwards compatible)
// ---------------------------------------------------------------------------

export interface CinematifiedCharacter {
  /** Deterministic id (slug of canonical name). */
  id: string
  name: string
  aliases: string[]
  /** Titles observed for this character (e.g. "Mr", "Captain"). */
  honorifics: string[]
  /** Inferred coarse gender (heuristic; UNKNOWN when unsure). */
  gender: Gender
  mentions: number
  firstAppearanceOffset: number
  lastAppearanceOffset: number
  role: 'PROTAGONIST' | 'ANTAGONIST' | 'SUPPORTING' | 'MINOR'
  /** Kept for backwards compatibility — mirrors speakingCount. */
  dialogueLines: number
  speakingCount: number
  /** Scene indices the character participates in (ascending). */
  scenes: number[]
  importanceScore: number
  confidenceScore: number
}

export interface CinematifiedLocation { name: string; mentions: number; type: 'INDOOR' | 'OUTDOOR' | 'URBAN' | 'NATURE' | 'VEHICLE' | 'GENERIC'; firstAppearanceOffset: number }
export interface CinematifiedEvent { index: number; type: 'ACTION' | 'DIALOGUE' | 'DISCOVERY' | 'CONFLICT' | 'RESOLUTION' | 'TRANSITION'; description: string; participants: string[]; offset: number; intensity: number; sceneIndex: number }
export interface CinematifiedScene {
  index: number; title: string; summary: string; heading: string;
  location: string | null; locationType: string | null; timeOfDay: string | null; mood: string | null;
  tensionScore: number; emotionScore: number; dominantEmotion: string;
  /** v2: arousal (activation) 0..100. */
  arousalScore: number;
  /** v2: signed valence -100..100. */
  valence: number;
  /** v2: normalized momentum 0..100. */
  momentumScore: number;
  /** v2: dramatic phase assigned to this scene. */
  structurePhase: StructurePhase | null;
  dialogueRatio: number; eventCount: number;
  startOffset: number; endOffset: number; charCount: number; paragraphCount: number;
  paragraphs: OriginalParagraph[]; events: CinematifiedEvent[]
}
export interface CinematifiedArc { name: string; arcType: 'INCITING' | 'RISING' | 'CLIMAX' | 'FALLING' | 'RESOLUTION'; startSceneIdx: number; endSceneIdx: number; intensity: number; summary: string }
export interface CinematifiedPeak { offset: number; intensity: number; emotion: string; snippet: string; sceneIndex: number | null }
export interface CinematifiedResult {
  title: string; content: string; plainText: string;
  scenes: CinematifiedScene[]; characters: CinematifiedCharacter[]; locations: CinematifiedLocation[];
  events: CinematifiedEvent[]; arcs: CinematifiedArc[]; peaks: CinematifiedPeak[];
  sceneCount: number; transforms: string[];
  // v2 analysis artifacts (additive)
  intelligence: CharacterIntelligence;
  coOccurrence: CoOccurrenceGraph;
  emotionTimeline: EmotionTimelinePoint[];
  momentumTimeline: MomentumPoint[];
  structure: StoryStructure;
}

// ---------------------------------------------------------------------------
// Pre-compiled regex cache (compiled once, reused across every call)
// ---------------------------------------------------------------------------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function compileWordRe(word: string): RegExp { return new RegExp(`\\b${escapeRe(word)}\\b`, 'gi') }

const LOCATION_GAZETTEER_REGEXES: Array<{ re: RegExp; name: string; type: CinematifiedLocation['type'] }> = (() => {
  const gazetteers: Array<[Set<string>, CinematifiedLocation['type']]> = [
    [LOCATION_INDOOR, 'INDOOR'], [LOCATION_OUTDOOR, 'OUTDOOR'], [LOCATION_URBAN, 'URBAN'],
    [LOCATION_NATURE, 'NATURE'], [LOCATION_VEHICLE, 'VEHICLE'],
  ]
  const out: Array<{ re: RegExp; name: string; type: CinematifiedLocation['type'] }> = []
  for (const [gaz, type] of gazetteers) for (const word of gaz) out.push({ re: compileWordRe(word), name: word, type })
  return out
})()

const TIME_OF_DAY_REGEXES: Array<{ re: RegExp; tod: string }> = (() => {
  const out: Array<{ re: RegExp; tod: string }> = []
  for (const [tod, signals] of Object.entries(TIME_OF_DAY_SIGNALS)) {
    const combined = signals.map(escapeRe).join('|')
    out.push({ re: new RegExp(`\\b(?:${combined})\\b`, 'gi'), tod })
  }
  return out
})()

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function transformCinematified(text: string, paragraphs: OriginalParagraph[], titleHint?: string): CinematifiedResult {
  const transforms: string[] = []

  // ---- 1. Scene segmentation (weighted heuristics) ----------------------
  const segments = detectSceneSegments(paragraphs)
  const locations = detectLocations(text)
  const scenes: CinematifiedScene[] = segments.map((seg) => ({
    index: seg.index, title: '', summary: '', heading: '',
    location: seg.location, locationType: null, timeOfDay: null, mood: null,
    tensionScore: 0, emotionScore: 50, dominantEmotion: 'NEUTRAL', arousalScore: 0, valence: 0,
    momentumScore: 0, structurePhase: null,
    dialogueRatio: seg.dialogueRatio, eventCount: 0,
    startOffset: seg.startOffset, endOffset: seg.endOffset, charCount: seg.charCount,
    paragraphCount: seg.paragraphCount, paragraphs: seg.paragraphs, events: [],
  }))
  transforms.push(`Segmented into ${scenes.length} scenes.`)

  // Pre-compute joined text + sentences ONCE per scene (shared by every engine).
  const sceneAnalysis = scenes.map((scene) => {
    const joined = scene.paragraphs.map((p) => p.text).join(' ')
    return { scene, joined, sentences: splitSentences(joined) }
  })

  // ---- 2. Character detection + intelligence ----------------------------
  const charAnalysis = analyzeCharacters(
    text,
    paragraphs.map((p) => ({ text: p.text, startOffset: p.startOffset })),
    scenes.map((s) => ({ index: s.index, startOffset: s.startOffset, endOffset: s.endOffset })),
  )
  const intelligence = computeIntelligence(charAnalysis, scenes.length)
  const detected = assignRoles(charAnalysis.characters, intelligence)
  const characters: CinematifiedCharacter[] = detected.map((c) => ({
    id: c.id, name: c.canonicalName, aliases: c.aliases, honorifics: c.honorifics, gender: c.gender,
    mentions: c.mentions, firstAppearanceOffset: c.firstAppearanceOffset, lastAppearanceOffset: c.lastAppearanceOffset,
    role: c.role, dialogueLines: c.speakingCount, speakingCount: c.speakingCount, scenes: c.scenes,
    importanceScore: c.importanceScore, confidenceScore: c.confidenceScore,
  }))
  transforms.push(`Detected ${characters.length} characters, ${locations.length} locations.`)

  // ---- 3. Emotion + momentum + structure --------------------------------
  const emotion = analyzeEmotion(
    sceneAnalysis.map(({ scene, joined, sentences }) => ({ index: scene.index, text: joined, startOffset: scene.startOffset, sentences })),
  )
  const momentum = analyzeMomentum(
    sceneAnalysis.map(({ scene, joined }, i) => ({ index: scene.index, text: joined, dialogueRatio: scene.dialogueRatio, valence: emotion.timeline[i]?.valence ?? 0 })),
  )
  const structure = analyzeStructure(
    sceneAnalysis.map(({ scene, joined }) => ({ index: scene.index, text: joined })),
    momentum.timeline,
  )
  transforms.push(`Scored emotion, momentum, and ${structure.segments.length} structural phases.`)

  // Phase lookup for per-scene tagging.
  const phaseByScene = new Map<number, StructurePhase>()
  for (const seg of structure.segments) {
    for (let i = seg.startSceneIndex; i <= seg.endSceneIndex; i++) phaseByScene.set(i, seg.phase)
  }

  // ---- 4. Events (verbatim from scene sentences) ------------------------
  const events = detectEvents(sceneAnalysis, characters)
  transforms.push(`Detected ${events.length} events.`)

  // ---- 5. Populate scene fields -----------------------------------------
  for (let i = 0; i < sceneAnalysis.length; i++) {
    const { scene, sentences } = sceneAnalysis[i]
    const em = emotion.sceneEmotions[i]
    const mo = momentum.timeline[i]
    scene.emotionScore = em?.emotionScore ?? 50
    scene.dominantEmotion = em?.dominant ?? 'NEUTRAL'
    scene.arousalScore = em?.arousal ?? 0
    scene.valence = em?.valence ?? 0
    scene.momentumScore = mo?.score ?? 0
    scene.structurePhase = phaseByScene.get(scene.index) ?? null
    // Tension blends conflict density (momentum) with emotional arousal.
    scene.tensionScore = Math.max(0, Math.min(100, Math.round(0.65 * (mo?.components.conflict ?? 0) + 0.35 * (em?.arousal ?? 0))))
    scene.timeOfDay = detectTimeOfDay(sceneAnalysis[i].joined)
    const loc = locations.find((l) => l.name.toLowerCase() === (scene.location || '').toLowerCase())
    scene.locationType = loc?.type ?? null
    scene.mood = deriveMood(scene)
    scene.heading = buildSceneHeading(scene)
    scene.title = buildSceneTitle(scene)
    scene.summary = buildSceneSummary(sentences)
    scene.eventCount = scene.events.length
  }

  // ---- 6. Arcs (derived from detected structure, not equal partitioning) --
  const arcs = buildArcs(structure, momentum.timeline, scenes.length)
  transforms.push(`Mapped ${arcs.length} narrative arcs.`)

  // ---- 7. Emotional peaks ------------------------------------------------
  const peaks: CinematifiedPeak[] = emotion.peaks.map((p) => ({
    offset: p.offset, intensity: p.intensity, emotion: p.emotion, snippet: p.snippet, sceneIndex: p.sceneIndex,
  }))
  transforms.push(`Identified ${peaks.length} emotional peaks.`)

  // ---- 8. Render ---------------------------------------------------------
  const title = titleHint?.trim() || inferTitle(paragraphs) || 'Untitled Cinematic Narrative'
  const { content, plainText } = renderCinematic(title, scenes)
  transforms.push('Reconstructed into cinematic screenplay-style narrative.')

  return {
    title, content, plainText, scenes, characters, locations, events, arcs, peaks,
    sceneCount: scenes.length, transforms,
    intelligence, coOccurrence: charAnalysis.coOccurrence,
    emotionTimeline: emotion.timeline, momentumTimeline: momentum.timeline, structure,
  }
}

// ---------------------------------------------------------------------------
// Location detection (gazetteer-based, deterministic)
// ---------------------------------------------------------------------------

function detectLocations(text: string): CinematifiedLocation[] {
  const found = new Map<string, { mentions: number; firstOffset: number; type: CinematifiedLocation['type'] }>()
  for (const { re, name, type } of LOCATION_GAZETTEER_REGEXES) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      let entry = found.get(name)
      if (!entry) { entry = { mentions: 0, firstOffset: m.index, type }; found.set(name, entry) }
      entry.mentions += 1
    }
  }
  return [...found.entries()]
    .map(([name, info]) => ({ name, mentions: info.mentions, type: info.type, firstAppearanceOffset: info.firstOffset }))
    .sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name))
}

function detectTimeOfDay(text: string): string | null {
  let best: { tod: string; count: number } | null = null
  for (const { re, tod } of TIME_OF_DAY_REGEXES) {
    re.lastIndex = 0
    const count = (text.match(re) || []).length
    if (count > 0 && (!best || count > best.count)) best = { tod, count }
  }
  return best?.tod ?? null
}

// ---------------------------------------------------------------------------
// Event detection (verbatim sentence classification)
// ---------------------------------------------------------------------------

type SceneAnalysis = Array<{ scene: CinematifiedScene; joined: string; sentences: ReturnType<typeof splitSentences> }>

const DISCOVERY_VERBS = new Set(['discovered', 'found', 'realized', 'noticed', 'spotted', 'uncovered', 'revealed', 'learned', 'saw'])
const RESOLUTION_VERBS = new Set(['resolved', 'agreed', 'accepted', 'forgave', 'reconciled', 'ended', 'concluded', 'settled', 'decided'])
const ACTION_VERB_RE = /\b(ran|jumped|grabbed|struck|fell|drew|slammed|threw|lunged|sprang|dashed|rushed|charged|climbed|ducked|dodged|swung|slashed|punched|kicked|seized|clutched|pulled|pushed|lifted|dropped|smashed|crashed|burst|bolted|sprinted)\b/

function detectEvents(sceneAnalysis: SceneAnalysis, characters: CinematifiedCharacter[]): CinematifiedEvent[] {
  const events: CinematifiedEvent[] = []
  let idx = 0
  const charNames = characters.map((c) => c.name)
  for (const { scene, sentences } of sceneAnalysis) {
    for (const sent of sentences) {
      const words = sent.text.split(/\s+/).map((w) => w.toLowerCase().replace(/[^a-z]/g, ''))
      const participants = charNames.filter((n) => sent.text.includes(n)).slice(0, 3)
      let type: CinematifiedEvent['type'] = 'ACTION'; let intensity = 10
      if (words.some((w) => DISCOVERY_VERBS.has(w))) { type = 'DISCOVERY'; intensity = 30 }
      else if (words.some((w) => CONFLICT_LEXICON.has(w))) { type = 'CONFLICT'; intensity = 60 }
      else if (words.some((w) => VIOLENCE_LEXICON.has(w))) { type = 'CONFLICT'; intensity = 80 }
      else if (words.some((w) => RESOLUTION_VERBS.has(w))) { type = 'RESOLUTION'; intensity = 40 }
      else if (words.some((w) => ACTION_VERB_RE.test(w))) { type = 'ACTION'; intensity = 35 }
      else if (isLikelyDialogue(sent.text)) { type = 'DIALOGUE'; intensity = 15 }
      else continue
      events.push({
        index: idx++, type, description: sent.text, participants,
        offset: scene.startOffset + sent.start,
        intensity: Math.max(0, Math.min(100, intensity + intensityBoost(sent.text))),
        sceneIndex: scene.index,
      })
    }
  }
  for (const { scene } of sceneAnalysis) scene.events = events.filter((e) => e.sceneIndex === scene.index)
  return events
}

function intensityBoost(text: string): number {
  const words = text.split(/\s+/).map((w) => w.toLowerCase().replace(/[^a-z]/g, '')); let boost = 0
  for (const w of words) { if (INTENSIFIERS.has(w)) boost += 5; if (VIOLENCE_LEXICON.has(w)) boost += 8 }
  if (/[!?]{2,}/.test(text)) boost += 10
  return boost
}

// ---------------------------------------------------------------------------
// Scene presentation helpers
// ---------------------------------------------------------------------------

function deriveMood(scene: CinematifiedScene): string | null {
  if (scene.tensionScore > 70) return 'VIOLENT'
  if (scene.tensionScore > 45) return 'TENSE'
  if (scene.dominantEmotion === 'JOY' || scene.dominantEmotion === 'LOVE') return 'JOYFUL'
  if (scene.dominantEmotion === 'SADNESS') return 'SOMBER'
  if (scene.dominantEmotion === 'FEAR') return 'TENSE'
  if (scene.dominantEmotion === 'ANGER') return 'VIOLENT'
  if (scene.dominantEmotion === 'SURPRISE') return 'MYSTERIOUS'
  if (scene.timeOfDay === 'NIGHT') return 'MYSTERIOUS'
  if (scene.timeOfDay === 'DAWN') return 'HOPEFUL'
  return 'CALM'
}

function buildSceneHeading(scene: CinematifiedScene): string {
  const prefix = scene.locationType === 'INDOOR' || scene.locationType === 'VEHICLE' ? 'INT.'
    : scene.locationType === 'OUTDOOR' || scene.locationType === 'URBAN' || scene.locationType === 'NATURE' ? 'EXT.' : '—'
  const loc = scene.location ? scene.location.toUpperCase() : 'UNKNOWN LOCATION'
  const tod = scene.timeOfDay || 'CONTINUOUS'
  return `${prefix} ${loc} — ${tod}`
}

function buildSceneTitle(scene: CinematifiedScene): string {
  const loc = scene.location || 'Unknown'
  return loc.replace(/\b([a-z])/g, (_, c) => c.toUpperCase())
}

function buildSceneSummary(sentences: ReturnType<typeof splitSentences>): string {
  const firstSentence = sentences[0]?.text || ''
  return firstSentence.length > 140 ? firstSentence.slice(0, 137) + '...' : firstSentence
}

// ---------------------------------------------------------------------------
// Arc derivation from detected story structure
// ---------------------------------------------------------------------------

const PHASE_TO_ARC: Record<StructurePhase, CinematifiedArc['arcType']> = {
  EXPOSITION: 'RISING',
  INCITING_INCIDENT: 'INCITING',
  RISING_ACTION: 'RISING',
  MIDPOINT: 'RISING',
  CLIMAX: 'CLIMAX',
  FALLING_ACTION: 'FALLING',
  RESOLUTION: 'RESOLUTION',
}

function buildArcs(structure: StoryStructure, momentum: MomentumPoint[], sceneCount: number): CinematifiedArc[] {
  if (sceneCount === 0) return []
  return structure.segments.map((seg) => {
    const arcType = PHASE_TO_ARC[seg.phase]
    // Intensity = average momentum across the segment (fallback: confidence).
    let sum = 0; let count = 0
    for (let i = seg.startSceneIndex; i <= seg.endSceneIndex; i++) {
      const p = momentum[i]
      if (p) { sum += p.score; count++ }
    }
    const intensity = count > 0 ? Math.round(sum / count) : seg.confidence
    return {
      name: `${arcType} Arc`, arcType,
      startSceneIdx: seg.startSceneIndex, endSceneIdx: seg.endSceneIndex,
      intensity: Math.max(0, Math.min(100, intensity)),
      summary: seg.startSceneIndex === seg.endSceneIndex
        ? `Scene ${seg.startSceneIndex + 1}`
        : `Scenes ${seg.startSceneIndex + 1}–${seg.endSceneIndex + 1}`,
    }
  })
}

// ---------------------------------------------------------------------------
// Title inference + rendering
// ---------------------------------------------------------------------------

function inferTitle(paragraphs: OriginalParagraph[]): string {
  const structural = /^(chapter\s+|prologue|epilogue|part\s+|book\s+|act\s+|scene\s+|introduction|preface|foreword|afterword|appendix)/i
  for (const p of paragraphs) {
    if (p.type === 'HEADING' && p.wordCount <= 12 && !structural.test(p.text.trim())) return p.text.replace(/^#+\s*/, '').trim()
  }
  return ''
}

function renderCinematic(title: string, scenes: CinematifiedScene[]): { content: string; plainText: string } {
  const md: string[] = [`# ${title}`, '']
  for (const scene of scenes) {
    md.push(`## ${scene.title}`, '', `**${scene.heading}**`, '')
    for (const p of scene.paragraphs) {
      if (p.type === 'HEADING') md.push(`### ${p.text}`, '')
      else if (p.type === 'DIALOGUE') md.push(`> ${p.text}`, '')
      else md.push(p.text, '')
    }
    md.push('---', '')
  }
  return { content: md.join('\n').trim(), plainText: scenes.map((s) => s.paragraphs.map((p) => p.text).join('\n')).join('\n\n') }
}
