import { db } from '@/lib/db'
import { NotFoundError } from '@/lib/domain/errors'

export interface CharacterListOptions {
  narrativeId: string
  limit?: number
  offset?: number
  minMentions?: number
  role?: string
}

export async function listCharacters(opts: CharacterListOptions) {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50))
  const offset = Math.max(0, opts.offset ?? 0)
  const where: { narrativeId: string; mentions?: { gte: number }; role?: string } = { narrativeId: opts.narrativeId }
  if (opts.minMentions != null) where.mentions = { gte: opts.minMentions }
  if (opts.role) where.role = opts.role
  const [characters, total] = await Promise.all([
    db.character.findMany({ where, orderBy: { mentions: 'desc' }, take: limit, skip: offset }),
    db.character.count({ where }),
  ])
  return { characters, total }
}

export async function getCharacter(narrativeId: string, characterId: string) {
  const character = await db.character.findFirst({ where: { id: characterId, narrativeId } })
  if (!character) throw new NotFoundError('Character not found')
  return character
}

export async function getCharacterRoles(narrativeId: string) {
  return db.character.findMany({ where: { narrativeId }, orderBy: { importanceScore: 'desc' }, select: { id: true, name: true, role: true, importanceScore: true, mentions: true, speakingCount: true } })
}
