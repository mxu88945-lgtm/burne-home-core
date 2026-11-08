/**
 * 人物档案召回：她最近 1–2 条消息提到谁，就把谁的档案（背景、最近 5 条事件、
 * 2–3 段带日期的原话、含名字的长期记忆）注入提示。每人约 800 字，一次最多 3 人。
 */
import type { ChatSession } from '@/store/chatStore'
import type { MemoryItem } from '@/types/memory'
import { recallArchive } from '@/lib/archiveRecall'
import {
  archiveSnippetAround,
  buildPersonBlock,
  findNameSnippetsInSessions,
  matchMentionedPeople,
  memoriesMentioning,
  wrapPeopleBlocks,
  type Person,
} from '@/lib/people'

export type ArchiveNameLookup = (name: string) => Promise<Array<{ text: string; startedAt?: string; endedAt?: string }>>

export interface PeopleRecallOptions {
  people: Person[]
  /** 她最近的原话（最新在后），只看最后 2 条 */
  userTexts: string[]
  sessions: ChatSession[]
  inContextIds: Set<string>
  memories: MemoryItem[]
  archiveLookup?: ArchiveNameLookup
  now?: Date
  maxPeople?: number
  perPersonChars?: number
}

export interface PeopleRecallResult {
  text: string
  personIds: string[]
  eventIds: string[]
  memoryIds: string[]
}

const defaultArchiveLookup: ArchiveNameLookup = async (name) => (await recallArchive(name, { maxHits: 2 })).hits

export async function recallPeople(opts: PeopleRecallOptions): Promise<PeopleRecallResult> {
  const empty: PeopleRecallResult = { text: '', personIds: [], eventIds: [], memoryIds: [] }
  const matched = matchMentionedPeople(opts.people, opts.userTexts, opts.maxPeople ?? 3)
  if (!matched.length) return empty
  const lookup = opts.archiveLookup ?? defaultArchiveLookup
  const blocks: string[] = []
  const result: PeopleRecallResult = { ...empty, personIds: [], eventIds: [], memoryIds: [] }
  for (const person of matched) {
    const names = [person.name, ...person.aliases].filter((n) => Array.from(n.trim()).length >= 2)
    const windowSnips = findNameSnippetsInSessions(opts.sessions, person, opts.inContextIds, 3).map((s) => s.lines)
    let archiveSnips: string[][] = []
    if (windowSnips.length < 3) {
      try {
        const hits = await lookup(person.name)
        archiveSnips = hits
          .map((h) => archiveSnippetAround(h.text, names, h.startedAt ?? h.endedAt))
          .filter(Boolean)
          .slice(0, 3 - windowSnips.length)
          .map((line) => [line])
      } catch {
        // 档案库不可用时只用窗口里的原话
      }
    }
    const built = buildPersonBlock({
      person,
      snippets: [...windowSnips, ...archiveSnips],
      memories: memoriesMentioning(opts.memories, person, opts.now),
      maxChars: opts.perPersonChars ?? 800,
    })
    blocks.push(built.text)
    result.personIds.push(person.id)
    result.eventIds.push(...built.eventIds)
    result.memoryIds.push(...built.memoryIds)
  }
  result.text = wrapPeopleBlocks(blocks)
  return result
}
