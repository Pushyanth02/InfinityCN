/**
 * Lemniscate — Relationship Engine Tests
 * ----------------------------------------------------------------------------
 * Tests for the deterministic social-graph analysis engine.
 */

import { describe, it, expect } from 'vitest'
import { analyzeRelationships } from './relationships'
import type { DetectedCharacter } from './analysis-types'
import type { RelationshipAnalysisInput } from '@/lib/providers/types'

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Create a minimal detected character for testing. */
function makeChar(
  id: string,
  name: string,
  overrides: Partial<DetectedCharacter> = {},
): DetectedCharacter {
  return {
    id,
    canonicalName: name,
    aliases: [],
    honorifics: [],
    gender: 'UNKNOWN',
    mentions: 10,
    nameMentions: 10,
    resolvedPronounMentions: 0,
    speakingCount: 5,
    scenes: [],
    firstAppearanceOffset: 0,
    lastAppearanceOffset: 1000,
    importanceScore: 50,
    confidenceScore: 80,
    role: 'SUPPORTING',
    ...overrides,
  }
}

/** Build the standard analysis input from characters + scene sets. */
function makeInput(
  characters: DetectedCharacter[],
  sceneParticipants: Map<number, Set<string>>,
  dialogueLines: Array<{ speaker: string; offset: number; text: string }> = [],
  totalScenes = 5,
): RelationshipAnalysisInput {
  return { characters, sceneParticipants, dialogueLines, totalScenes }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Relationship Engine', () => {
  describe('analyzeRelationships — edge cases', () => {
    it('returns an empty graph for zero characters', () => {
      const input = makeInput([], new Map(), [], 0)
      const graph = analyzeRelationships(input)

      expect(graph.edges).toHaveLength(0)
      expect(graph.centralities).toHaveLength(0)
      expect(graph.communities).toHaveLength(0)
      expect(graph.edgeCount).toBe(0)
      expect(graph.maxStrength).toBe(0)
    })

    it('returns a valid graph for a single character (no edges)', () => {
      const alice = makeChar('alice', 'Alice')
      const input = makeInput([alice], new Map(), [], 3)
      const graph = analyzeRelationships(input)

      expect(graph.edges).toHaveLength(0)
      expect(graph.edgeCount).toBe(0)
      expect(graph.maxStrength).toBe(0)
      expect(graph.centralities).toHaveLength(1)
      expect(graph.centralities[0].name).toBe('Alice')
      expect(graph.centralities[0].degree).toBe(0)
      expect(graph.communities.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('analyzeRelationships — co-occurrence edges', () => {
    it('creates edges from scene co-occurrence', () => {
      const alice = makeChar('alice', 'Alice')
      const bob = makeChar('bob', 'Bob')

      const sceneParticipants = new Map<number, Set<string>>([
        [0, new Set(['alice', 'bob'])],
        [1, new Set(['alice', 'bob'])],
        [2, new Set(['alice'])],
      ])

      const input = makeInput([alice, bob], sceneParticipants)
      const graph = analyzeRelationships(input)

      expect(graph.edges).toHaveLength(1)
      const edge = graph.edges[0]
      expect(edge.sourceCharacterId).toBe('alice')
      expect(edge.targetCharacterId).toBe('bob')
      expect(edge.coOccurrences).toBe(2)
      expect(edge.strength).toBeGreaterThan(0)
      expect(edge.strength).toBeLessThanOrEqual(100)
    })

    it('normalizes strength so the strongest edge is 100', () => {
      const a = makeChar('a', 'Alpha')
      const b = makeChar('b', 'Bravo')
      const c = makeChar('c', 'Charlie')

      const sceneParticipants = new Map<number, Set<string>>([
        [0, new Set(['a', 'b', 'c'])],
        [1, new Set(['a', 'b'])],
      ])

      const input = makeInput([a, b, c], sceneParticipants)
      const graph = analyzeRelationships(input)

      expect(graph.maxStrength).toBe(100)
    })
  })

  describe('analyzeRelationships — dialogue interactions', () => {
    it('counts sequential dialogue turns between characters', () => {
      const alice = makeChar('alice', 'Alice')
      const bob = makeChar('bob', 'Bob')

      const sceneParticipants = new Map<number, Set<string>>([
        [0, new Set(['alice', 'bob'])],
      ])

      const dialogueLines = [
        { speaker: 'Alice', offset: 100, text: 'Hello Bob' },
        { speaker: 'Bob', offset: 200, text: 'Hello Alice' },
        { speaker: 'Alice', offset: 300, text: 'How are you?' },
        { speaker: 'Bob', offset: 400, text: 'Fine, thanks' },
      ]

      const input = makeInput([alice, bob], sceneParticipants, dialogueLines)
      const graph = analyzeRelationships(input)

      const edge = graph.edges[0]
      expect(edge.dialogueInteractions).toBeGreaterThan(0)
    })

    it('does not count dialogue from the same speaker as interaction', () => {
      const alice = makeChar('alice', 'Alice')

      const sceneParticipants = new Map<number, Set<string>>([
        [0, new Set(['alice'])],
      ])

      const dialogueLines = [
        { speaker: 'Alice', offset: 100, text: 'I am talking' },
        { speaker: 'Alice', offset: 200, text: 'To myself' },
      ]

      const input = makeInput([alice], sceneParticipants, dialogueLines)
      const graph = analyzeRelationships(input)

      expect(graph.edges).toHaveLength(0)
    })
  })

  describe('analyzeRelationships — centrality metrics', () => {
    it('computes degree centrality correctly', () => {
      // Star graph: center connected to 3 leaves
      const center = makeChar('center', 'Center')
      const leaf1 = makeChar('leaf1', 'Leaf1')
      const leaf2 = makeChar('leaf2', 'Leaf2')
      const leaf3 = makeChar('leaf3', 'Leaf3')

      const sceneParticipants = new Map<number, Set<string>>([
        [0, new Set(['center', 'leaf1'])],
        [1, new Set(['center', 'leaf2'])],
        [2, new Set(['center', 'leaf3'])],
      ])

      const input = makeInput([center, leaf1, leaf2, leaf3], sceneParticipants, [], 3)
      const graph = analyzeRelationships(input)

      const centerCentrality = graph.centralities.find((c) => c.characterId === 'center')!
      expect(centerCentrality.degree).toBe(3)
      expect(centerCentrality.degreeCentrality).toBe(1) // 3 / (4-1) = 1

      const leafCentrality = graph.centralities.find((c) => c.characterId === 'leaf1')!
      expect(leafCentrality.degree).toBe(1)
    })

    it('computes betweenness centrality - bridge node has highest betweenness', () => {
      // Linear graph: a - bridge - c
      // bridge should have highest betweenness
      const a = makeChar('a', 'Alpha')
      const bridge = makeChar('bridge', 'Bridge')
      const c = makeChar('c', 'Charlie')

      const sceneParticipants = new Map<number, Set<string>>([
        [0, new Set(['a', 'bridge'])],
        [1, new Set(['bridge', 'c'])],
      ])

      const input = makeInput([a, bridge, c], sceneParticipants, [], 2)
      const graph = analyzeRelationships(input)

      const bridgeCentrality = graph.centralities.find((c) => c.characterId === 'bridge')!
      const aCentrality = graph.centralities.find((c) => c.characterId === 'a')!

      expect(bridgeCentrality.betweennessCentrality).toBeGreaterThan(aCentrality.betweennessCentrality)
    })

    it('computes closeness centrality', () => {
      const a = makeChar('a', 'Alpha')
      const b = makeChar('b', 'Bravo')

      const sceneParticipants = new Map<number, Set<string>>([
        [0, new Set(['a', 'b'])],
      ])

      const input = makeInput([a, b], sceneParticipants, [], 1)
      const graph = analyzeRelationships(input)

      for (const c of graph.centralities) {
        expect(c.closenessCentrality).toBeGreaterThan(0)
        expect(c.closenessCentrality).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('analyzeRelationships — community detection', () => {
    it('groups connected characters into communities', () => {
      const a = makeChar('a', 'Alpha')
      const b = makeChar('b', 'Bravo')
      const c = makeChar('c', 'Charlie')
      const d = makeChar('d', 'Delta')

      // Two disconnected pairs: {a,b} and {c,d}
      const sceneParticipants = new Map<number, Set<string>>([
        [0, new Set(['a', 'b'])],
        [1, new Set(['c', 'd'])],
      ])

      const input = makeInput([a, b, c, d], sceneParticipants, [], 2)
      const graph = analyzeRelationships(input)

      expect(graph.communities.length).toBeGreaterThanOrEqual(2)
    })

    it('computes cohesion for communities', () => {
      const a = makeChar('a', 'Alpha')
      const b = makeChar('b', 'Bravo')
      const c = makeChar('c', 'Charlie')

      // Fully connected triangle — cohesion should be 1
      const sceneParticipants = new Map<number, Set<string>>([
        [0, new Set(['a', 'b', 'c'])],
      ])

      const input = makeInput([a, b, c], sceneParticipants, [], 1)
      const graph = analyzeRelationships(input)

      const community = graph.communities[0]
      expect(community.cohesion).toBe(1) // all possible edges exist
    })
  })

  describe('analyzeRelationships — determinism', () => {
    it('produces identical output for identical input', () => {
      const alice = makeChar('alice', 'Alice')
      const bob = makeChar('bob', 'Bob')
      const charlie = makeChar('charlie', 'Charlie')

      const sceneParticipants = new Map<number, Set<string>>([
        [0, new Set(['alice', 'bob', 'charlie'])],
        [1, new Set(['alice', 'bob'])],
      ])

      const dialogueLines = [
        { speaker: 'Alice', offset: 100, text: 'Hi' },
        { speaker: 'Bob', offset: 200, text: 'Hello' },
      ]

      const input = makeInput([alice, bob, charlie], sceneParticipants, dialogueLines)
      const graph1 = analyzeRelationships(input)
      const graph2 = analyzeRelationships(input)

      expect(graph1).toEqual(graph2)
    })
  })

  describe('analyzeRelationships — alias-aware dialogue matching', () => {
    it('matches dialogue speakers by alias', () => {
      const alice = makeChar('alice', 'Alice', {
        aliases: ['Ali'],
      })
      const bob = makeChar('bob', 'Bob')

      const sceneParticipants = new Map<number, Set<string>>([
        [0, new Set(['alice', 'bob'])],
      ])

      const dialogueLines = [
        { speaker: 'Ali', offset: 100, text: 'Hey Bob' },
        { speaker: 'Bob', offset: 200, text: 'Hey Ali' },
      ]

      const input = makeInput([alice, bob], sceneParticipants, dialogueLines)
      const graph = analyzeRelationships(input)

      const edge = graph.edges[0]
      expect(edge.dialogueInteractions).toBeGreaterThan(0)
    })
  })
})