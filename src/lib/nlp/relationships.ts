/**
 * Lemniscate — Relationship Engine
 * ----------------------------------------------------------------------------
 * Deterministic social-graph analysis over detected characters. Builds a
 * weighted relationship graph from co-occurrence and dialogue interaction
 * data, then computes centrality metrics and detects communities.
 *
 * Every algorithm here is fully deterministic (identical input ⇒ byte-identical
 * output). No randomness, no models, no network.
 *
 * Pipeline:
 *   1. Build edges from co-occurrence + dialogue interaction counts
 *   2. Compute composite strength scores [0..100]
 *   3. Compute centrality metrics (degree, betweenness, closeness)
 *   4. Detect communities via label propagation
 */

import type {
  DetectedCharacter,
} from './analysis-types'
import type {
  RelationshipGraph,
  RelationshipEdge,
  CharacterCentrality,
  CharacterCommunity,
} from '@/lib/domain/entities'
import type { RelationshipAnalysisInput } from '@/lib/providers/types'

// ---------------------------------------------------------------------------
// Edge Construction
// ---------------------------------------------------------------------------

/** Internal intermediate edge built from raw co-occurrence + dialogue data. */
interface RawEdge {
  sourceId: string
  sourceName: string
  targetId: string
  targetName: string
  coOccurrences: number
  dialogueInteractions: number
}

/**
 * Build weighted relationship edges from co-occurrence and dialogue data.
 * An edge exists when two characters share at least one scene.
 * Dialogue interactions are counted from sequential (within 2-line window)
 * dialogue turns between the pair.
 */
function buildEdges(
  characters: DetectedCharacter[],
  sceneParticipants: Map<number, Set<string>>,
  dialogueLines: Array<{ speaker: string; offset: number; text: string }>,
): RawEdge[] {
  const idToName = new Map<string, string>()
  for (const c of characters) {
    idToName.set(c.id, c.canonicalName)
  }

  // ---- Co-occurrence counting (scene-level) ----
  const coOccurCounts = new Map<string, number>()
  for (const [, participantSet] of sceneParticipants) {
    const ids = [...participantSet].sort((a, b) => a.localeCompare(b))
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}\u0000${ids[j]}`
        coOccurCounts.set(key, (coOccurCounts.get(key) ?? 0) + 1)
      }
    }
  }

  // ---- Dialogue interaction counting ----
  // Map each surface name to character IDs (alias-aware). A speaker name
  // might match multiple characters; we attribute to all matches conservatively.
  const nameToIds = new Map<string, string[]>()
  for (const c of characters) {
    const forms = [c.canonicalName, ...c.aliases]
    for (const f of forms) {
      const key = f.toLowerCase()
      const existing = nameToIds.get(key)
      if (existing) {
        if (!existing.includes(c.id)) existing.push(c.id)
      } else {
        nameToIds.set(key, [c.id])
      }
    }
  }

  const dialogueInteractions = new Map<string, number>()
  // Sort dialogue lines by offset for sequential analysis
  const sortedLines = [...dialogueLines].sort((a, b) => a.offset - b.offset)

  // Count interactions: two characters interacting within a 2-line window
  const WINDOW = 2
  for (let i = 0; i < sortedLines.length; i++) {
    const speakerA = sortedLines[i].speaker
    const idsA = nameToIds.get(speakerA.toLowerCase())
    if (!idsA || idsA.length === 0) continue

    for (let j = i + 1; j <= Math.min(i + WINDOW, sortedLines.length - 1); j++) {
      const speakerB = sortedLines[j].speaker
      if (speakerA === speakerB) continue
      const idsB = nameToIds.get(speakerB.toLowerCase())
      if (!idsB || idsB.length === 0) continue

      // For each unique pair (if aliases overlap, pick deterministic pair)
      for (const aId of idsA) {
        for (const bId of idsB) {
          if (aId === bId) continue
          const [lo, hi] = aId < bId ? [aId, bId] : [bId, aId]
          const key = `${lo}\u0000${hi}`
          dialogueInteractions.set(key, (dialogueInteractions.get(key) ?? 0) + 1)
        }
      }
    }
  }

  // ---- Merge into edges ----
  const allPairs = new Set<string>([...coOccurCounts.keys(), ...dialogueInteractions.keys()])
  const edges: RawEdge[] = []

  for (const pair of allPairs) {
    const [sourceId, targetId] = pair.split('\u0000')
    const coOcc = coOccurCounts.get(pair) ?? 0
    const dialogue = dialogueInteractions.get(pair) ?? 0
    // Require at least one co-occurrence OR one dialogue interaction
    if (coOcc === 0 && dialogue === 0) continue

    edges.push({
      sourceId,
      sourceName: idToName.get(sourceId) ?? sourceId,
      targetId,
      targetName: idToName.get(targetId) ?? targetId,
      coOccurrences: coOcc,
      dialogueInteractions: dialogue,
    })
  }

  // Deterministic ordering: strength desc, then source, then target
  edges.sort((a, b) => {
    const sa = computeStrength(a.coOccurrences, a.dialogueInteractions)
    const sb = computeStrength(b.coOccurrences, b.dialogueInteractions)
    if (sb !== sa) return sb - sa
    if (a.sourceId !== b.sourceId) return a.sourceId.localeCompare(b.sourceId)
    return a.targetId.localeCompare(b.targetId)
  })

  return edges
}

// ---------------------------------------------------------------------------
// Strength Scoring
// ---------------------------------------------------------------------------

/** Maximum values for normalization (computed per-graph in analyzeRelationships). */

/**
 * Compute a composite relationship strength score in [0..100].
 * Weights:
 *   - Co-occurrence (shared scenes): 60% — structural presence together
 *   - Dialogue interaction: 40% — active conversational engagement
 */
function computeStrength(coOccurrences: number, dialogueInteractions: number): number {
  // Weighted raw score (pre-normalization)
  return 0.6 * coOccurrences + 0.4 * dialogueInteractions
}

/**
 * Normalize a raw strength to [0..100] using the graph's max raw strength.
 */
function normalizeStrength(raw: number, maxRaw: number): number {
  if (maxRaw <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((raw / maxRaw) * 100)))
}

// ---------------------------------------------------------------------------
// Centrality Metrics
// ---------------------------------------------------------------------------

/** Build an adjacency list from finalized edges. */
function buildAdjacency(
  characterIds: string[],
  edges: RelationshipEdge[],
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  for (const id of characterIds) adj.set(id, new Set())
  for (const e of edges) {
    adj.get(e.sourceCharacterId)?.add(e.targetCharacterId)
    adj.get(e.targetCharacterId)?.add(e.sourceCharacterId)
  }
  return adj
}

/**
 * Compute degree centrality for all characters.
 * Degree centrality = degree / (n-1), where n is total characters.
 */
function computeDegreeCentrality(
  characterIds: string[],
  adj: Map<string, Set<string>>,
): Map<string, { degree: number; centrality: number }> {
  const n = characterIds.length
  const denom = Math.max(1, n - 1)
  const result = new Map<string, { degree: number; centrality: number }>()

  for (const id of characterIds) {
    const degree = adj.get(id)?.size ?? 0
    result.set(id, {
      degree,
      centrality: Math.round((degree / denom) * 1000) / 1000,
    })
  }
  return result
}

/**
 * Compute betweenness centrality using Brandes' algorithm (deterministic).
 * Betweenness = sum over all pairs (s,t) of the fraction of shortest paths
 * through this node.
 */
function computeBetweennessCentrality(
  characterIds: string[],
  adj: Map<string, Set<string>>,
): Map<string, number> {
  const betweenness = new Map<string, number>()
  for (const id of characterIds) betweenness.set(id, 0)

  for (const source of characterIds) {
    // BFS to find shortest paths
    const stack: string[] = []
    const queue: string[] = [source]
    const visited = new Set<string>([source])
    const dist = new Map<string, number>([[source, 0]])
    const sigma = new Map<string, number>([[source, 1]]) // path count
    const predecessors = new Map<string, string[]>()

    while (queue.length > 0) {
      const v = queue.shift()!
      stack.push(v)
      for (const w of adj.get(v) ?? []) {
        if (!visited.has(w)) {
          visited.add(w)
          queue.push(w)
          dist.set(w, (dist.get(v) ?? 0) + 1)
        }
        if ((dist.get(w) ?? Infinity) === (dist.get(v) ?? 0) + 1) {
          sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0))
          const preds = predecessors.get(w)
          if (preds) preds.push(v)
          else predecessors.set(w, [v])
        }
      }
    }

    // Accumulation (back-propagation)
    const delta = new Map<string, number>()
    for (const id of characterIds) delta.set(id, 0)

    while (stack.length > 0) {
      const w = stack.pop()!
      for (const v of predecessors.get(w) ?? []) {
        const ratio = (sigma.get(v) ?? 0) / Math.max(1, sigma.get(w) ?? 1)
        delta.set(v, (delta.get(v) ?? 0) + ratio * (1 + (delta.get(w) ?? 0)))
      }
      if (w !== source) {
        betweenness.set(w, (betweenness.get(w) ?? 0) + (delta.get(w) ?? 0))
      }
    }
  }

  // Normalize: divide by ((n-1)(n-2)/2) for undirected graphs
  const n = characterIds.length
  const normFactor = n > 2 ? 2 / ((n - 1) * (n - 2)) : 1

  const normalized = new Map<string, number>()
  for (const [id, val] of betweenness) {
    normalized.set(id, Math.round(val * normFactor * 1000) / 1000)
  }
  return normalized
}

/**
 * Compute closeness centrality for all characters.
 * Closeness = (n-1) / sum of shortest distances to all other reachable nodes.
 */
function computeClosenessCentrality(
  characterIds: string[],
  adj: Map<string, Set<string>>,
): Map<string, number> {
  const n = characterIds.length
  const result = new Map<string, number>()

  for (const source of characterIds) {
    // BFS shortest paths
    const queue: string[] = [source]
    const visited = new Set<string>([source])
    const dist = new Map<string, number>([[source, 0]])
    let totalDist = 0
    let reachable = 0

    while (queue.length > 0) {
      const v = queue.shift()!
      for (const w of adj.get(v) ?? []) {
        if (!visited.has(w)) {
          visited.add(w)
          queue.push(w)
          const d = (dist.get(v) ?? 0) + 1
          dist.set(w, d)
          totalDist += d
          reachable++
        }
      }
    }

    // Closeness: harmonic mean variant — (reachable * (n-1)) / totalDist
    // This handles disconnected graphs gracefully.
    if (reachable > 0 && totalDist > 0) {
      const closeness = (reachable * (n - 1)) / totalDist
      result.set(source, Math.round(closeness * 1000) / 1000)
    } else {
      result.set(source, 0)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Community Detection (Label Propagation Algorithm)
// ---------------------------------------------------------------------------

/**
 * Detect communities using deterministic label propagation.
 * Each node starts with a unique label. Iteratively, each node adopts the
 * label shared by the majority of its neighbors (ties broken by label order).
 * Convergence is guaranteed within n iterations for connected graphs.
 *
 * @param maxIterations Safety cap (default: number of characters).
 */
function detectCommunities(
  characterIds: string[],
  adj: Map<string, Set<string>>,
  maxIterations = Math.max(characterIds.length, 10),
): Map<string, number> {
  // Initialize: each character gets a unique community label (by index)
  const labels = new Map<string, number>()
  characterIds.forEach((id, idx) => labels.set(id, idx))

  // Iterative label propagation
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false
    // Process in deterministic order (sorted by id)
    for (const node of characterIds) {
      const neighbors = adj.get(node)
      if (!neighbors || neighbors.size === 0) continue

      // Count labels among neighbors
      const labelCounts = new Map<number, number>()
      for (const nb of neighbors) {
        const label = labels.get(nb) ?? 0
        labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1)
      }

      // Find the majority label (ties broken by lowest label number)
      let bestLabel = labels.get(node)!
      for (const [label, _count] of [...labelCounts.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1] // count desc
        return a[0] - b[0] // label asc (tie-break)
      })) {
        bestLabel = label
        break
      }

      if (bestLabel !== labels.get(node)) {
        labels.set(node, bestLabel)
        changed = true
      }
    }

    if (!changed) break // Converged
  }

  // Relabel to consecutive integers (0, 1, 2, ...) sorted by first appearance
  const seenLabels = new Map<number, number>() // old → new
  let nextLabel = 0
  const result = new Map<string, number>()
  for (const id of characterIds) {
    const oldLabel = labels.get(id)!
    if (!seenLabels.has(oldLabel)) {
      seenLabels.set(oldLabel, nextLabel++)
    }
    result.set(id, seenLabels.get(oldLabel)!)
  }

  return result
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Full relationship analysis: edges → centrality → communities.
 *
 * @param input  Character set + scene participation + dialogue lines.
 * @returns      Complete RelationshipGraph with edges, centralities, communities.
 */
export function analyzeRelationships(input: RelationshipAnalysisInput): RelationshipGraph {
  const { characters, sceneParticipants, dialogueLines } = input

  if (characters.length === 0) {
    return {
      edges: [],
      centralities: [],
      communities: [],
      edgeCount: 0,
      maxStrength: 0,
    }
  }

  // ---- 1. Build raw edges ----
  const rawEdges = buildEdges(characters, sceneParticipants, dialogueLines)

  // ---- 2. Compute max raw strength for normalization ----
  const maxRaw = rawEdges.length > 0
    ? Math.max(...rawEdges.map(e => computeStrength(e.coOccurrences, e.dialogueInteractions)))
    : 0

  // ---- 3. Finalize edges with normalized strength ----
  const edges: RelationshipEdge[] = rawEdges.map(e => ({
    sourceCharacterId: e.sourceId,
    sourceName: e.sourceName,
    targetCharacterId: e.targetId,
    targetName: e.targetName,
    coOccurrences: e.coOccurrences,
    strength: normalizeStrength(computeStrength(e.coOccurrences, e.dialogueInteractions), maxRaw),
    dialogueInteractions: e.dialogueInteractions,
  }))

  // ---- 4. Centrality metrics ----
  const characterIds = characters.map(c => c.id)
  const adj = buildAdjacency(characterIds, edges)
  const degreeMap = computeDegreeCentrality(characterIds, adj)
  const betweennessMap = computeBetweennessCentrality(characterIds, adj)
  const closenessMap = computeClosenessCentrality(characterIds, adj)

  const centralities: CharacterCentrality[] = characters.map(c => {
    const deg = degreeMap.get(c.id) ?? { degree: 0, centrality: 0 }
    return {
      characterId: c.id,
      name: c.canonicalName,
      degree: deg.degree,
      degreeCentrality: deg.centrality,
      betweennessCentrality: betweennessMap.get(c.id) ?? 0,
      closenessCentrality: closenessMap.get(c.id) ?? 0,
    }
  })

  // Sort centrality by degree desc (most connected first), then name
  centralities.sort((a, b) =>
    b.degree - a.degree ||
    b.degreeCentrality - a.degreeCentrality ||
    a.name.localeCompare(b.name),
  )

  // ---- 5. Community detection ----
  const communityLabels = detectCommunities(characterIds, adj)

  // Group characters by community
  const communityMembers = new Map<number, string[]>()
  for (const c of characters) {
    const label = communityLabels.get(c.id) ?? 0
    const members = communityMembers.get(label)
    if (members) members.push(c.id)
    else communityMembers.set(label, [c.id])
  }

  // Compute cohesion (internal edge density) for each community
  const communities: CharacterCommunity[] = []
  for (const [commId, memberIds] of [...communityMembers.entries()].sort((a, b) => a[0] - b[0])) {
    const memberNames = memberIds
      .map(id => characters.find(c => c.id === id)?.canonicalName ?? id)
      .sort((a, b) => a.localeCompare(b))

    // Cohesion = fraction of possible internal edges that exist
    const memberSet = new Set(memberIds)
    const possibleEdges = (memberIds.length * (memberIds.length - 1)) / 2
    let actualEdges = 0
    for (const e of edges) {
      if (memberSet.has(e.sourceCharacterId) && memberSet.has(e.targetCharacterId)) {
        actualEdges++
      }
    }
    const cohesion = possibleEdges > 0
      ? Math.round((actualEdges / possibleEdges) * 1000) / 1000
      : 0

    communities.push({
      id: commId,
      memberIds: [...memberIds].sort((a, b) => a.localeCompare(b)),
      memberNames,
      cohesion,
    })
  }

  // ---- 6. Return complete graph ----
  const maxStrength = edges.length > 0 ? Math.max(...edges.map(e => e.strength)) : 0

  return {
    edges,
    centralities,
    communities,
    edgeCount: edges.length,
    maxStrength,
  }
}