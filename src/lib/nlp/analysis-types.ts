/**
 * Lemniscate — Narrative Intelligence Engine v2 · Shared Analysis Types
 * ----------------------------------------------------------------------------
 * Central type contracts shared by every deterministic NLP module
 * (characters, intelligence, scenes, emotion, momentum, structure). Keeping the
 * contracts in one place avoids circular dependencies between the engines and
 * lets `cinematified.ts` act as a thin composition layer.
 *
 * Design rules honoured by every producer of these types:
 *   - deterministic: identical input ⇒ byte-identical output
 *   - bounded: all *Score fields are integers in [0,100] unless noted
 *   - verbatim: any `text`/`snippet`/`description` is copied verbatim from source
 *   - no invention: entities are only emitted when grounded in the source text
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Gender = 'MALE' | 'FEMALE' | 'UNKNOWN'

export type CharacterRoleV2 = 'PROTAGONIST' | 'ANTAGONIST' | 'SUPPORTING' | 'MINOR'

export type EmotionLabel =
  | 'JOY' | 'ANGER' | 'FEAR' | 'SADNESS'
  | 'SURPRISE' | 'DISGUST' | 'LOVE' | 'NEUTRAL'

export type StructurePhase =
  | 'EXPOSITION' | 'INCITING_INCIDENT' | 'RISING_ACTION' | 'MIDPOINT'
  | 'CLIMAX' | 'FALLING_ACTION' | 'RESOLUTION'

// ---------------------------------------------------------------------------
// Character detection (Task 2 + 3)
// ---------------------------------------------------------------------------

/** A single grounded surface mention of a character in the source text. */
export interface CharacterMention {
  /** The exact surface form as it appeared (verbatim). */
  surface: string
  /** Character offset of the mention within the reconstructed text. */
  offset: number
  /** True when the mention is the speaker of an attributed dialogue line. */
  isSpeaker: boolean
  /** True when the mention was recovered via pronoun resolution (not a name). */
  isPronoun: boolean
}

/** Fully-resolved character produced by the Character Detection Engine v2. */
export interface DetectedCharacter {
  /** Deterministic id derived from the canonical name (slug + ordinal). */
  id: string
  /** Canonical display name (longest/most-qualified observed surface form). */
  canonicalName: string
  /** Distinct alternate surface forms merged into this character (verbatim). */
  aliases: string[]
  /** Honorifics observed for this character (e.g. "Mr", "Captain"). */
  honorifics: string[]
  /** Inferred coarse gender (from honorific/name lexicons; UNKNOWN if unsure). */
  gender: Gender
  /** Total grounded mentions (names + resolved pronouns). */
  mentions: number
  /** Mentions attributable to direct name/alias surface forms only. */
  nameMentions: number
  /** Mentions recovered through conservative pronoun resolution. */
  resolvedPronounMentions: number
  /** Number of dialogue lines attributed to this character as speaker. */
  speakingCount: number
  /** Indices of scenes in which this character participates (ascending). */
  scenes: number[]
  /** Offset of the first grounded appearance. */
  firstAppearanceOffset: number
  /** Offset of the last grounded appearance. */
  lastAppearanceOffset: number
  /** Weighted importance score in [0,100]. */
  importanceScore: number
  /** Detection confidence in [0,100] (higher = more corroborating signals). */
  confidenceScore: number
  /** Assigned narrative role (finalized by the intelligence engine). */
  role: CharacterRoleV2
}

/** An undirected co-occurrence edge between two characters (by id). */
export interface CoOccurrenceEdge {
  /** Lower character id (deterministic ordering). */
  source: string
  /** Higher character id. */
  target: string
  /** Number of scenes in which both characters co-occur. */
  weight: number
}

/** Deterministic co-occurrence graph over detected characters. */
export interface CoOccurrenceGraph {
  edges: CoOccurrenceEdge[]
  /** Highest edge weight (0 when there are no edges). */
  maxWeight: number
}

/** Output of the character detection + pronoun-resolution pipeline. */
export interface CharacterAnalysis {
  characters: DetectedCharacter[]
  coOccurrence: CoOccurrenceGraph
}

// ---------------------------------------------------------------------------
// Character intelligence (Task 4)
// ---------------------------------------------------------------------------

/** A ranked character entry with the score that produced the ranking. */
export interface RankedCharacter {
  id: string
  name: string
  score: number
}

/** High-level narrative intelligence derived from detected characters. */
export interface CharacterIntelligence {
  /** Characters ranked by protagonist likelihood (descending). */
  protagonistRanking: RankedCharacter[]
  /** Characters ranked by supporting likelihood (descending). */
  supportingRanking: RankedCharacter[]
  /** Estimated antagonist id (null when signal is insufficient). */
  antagonistId: string | null
  /** Estimated viewpoint (POV) character id (null when undetermined). */
  viewpointId: string | null
  /** Fraction of total mentions concentrated in the top character, [0,1]. */
  narrativeFocus: number
  /** Fraction of total dialogue lines spoken by the top speaker, [0,1]. */
  speakingDominance: number
  /** Mean scene participation across detected characters, [0,1]. */
  sceneParticipation: number
}

// ---------------------------------------------------------------------------
// Emotion (Task 6)
// ---------------------------------------------------------------------------

/** Per-scene emotional summary. */
export interface SceneEmotion {
  sceneIndex: number
  /** Dominant emotion label for the scene. */
  dominant: EmotionLabel
  /** Signed valence in [-100,100]. */
  valence: number
  /** Arousal (activation) in [0,100]. */
  arousal: number
  /** UI-friendly emotion score in [0,100] (valence normalized to 0..100). */
  emotionScore: number
}

/** A single point on the whole-narrative emotional timeline. */
export interface EmotionTimelinePoint {
  sceneIndex: number
  valence: number
  arousal: number
  dominant: EmotionLabel
}

/** A high-intensity emotional moment, grounded verbatim in the source. */
export interface EmotionalPeakV2 {
  offset: number
  intensity: number
  emotion: EmotionLabel
  /** Verbatim snippet from the source sentence. */
  snippet: string
  sceneIndex: number | null
}

export interface EmotionAnalysis {
  sceneEmotions: SceneEmotion[]
  timeline: EmotionTimelinePoint[]
  peaks: EmotionalPeakV2[]
}

// ---------------------------------------------------------------------------
// Momentum (Task 7)
// ---------------------------------------------------------------------------

/** A single normalized momentum reading for one scene. */
export interface MomentumPoint {
  sceneIndex: number
  /** Normalized momentum in [0,100]. */
  score: number
  /** Component contributions (each in [0,100]) for transparency/debugging. */
  components: {
    pacing: number
    conflict: number
    action: number
    dialogue: number
    urgency: number
    lexicalIntensity: number
    sentimentShift: number
  }
}

export interface MomentumAnalysis {
  timeline: MomentumPoint[]
  /** Index of the peak-momentum scene (−1 when there are no scenes). */
  peakSceneIndex: number
}

// ---------------------------------------------------------------------------
// Story structure (Task 8)
// ---------------------------------------------------------------------------

/** A contiguous span of scenes assigned to a structural phase. */
export interface StructureSegment {
  phase: StructurePhase
  startSceneIndex: number
  endSceneIndex: number
  /** Confidence of this phase assignment in [0,100]. */
  confidence: number
}

export interface StoryStructure {
  segments: StructureSegment[]
  /** Scene index of the detected inciting incident (−1 when undetermined). */
  incitingIncidentScene: number
  /** Scene index of the detected midpoint (−1 when undetermined). */
  midpointScene: number
  /** Scene index of the detected climax (−1 when undetermined). */
  climaxScene: number
}
