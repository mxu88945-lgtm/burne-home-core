/**
 * 语义召回的切片：把所有会话消息、旧日原文档案、长期记忆、人物事件切成要嵌入的片段。
 * 纯函数，不读存储；哈希只看「模型 + 原文」，同样的文字永远同一个 key。
 */
import type { ChatSession } from '@/store/chatStore'
import type { ArchiveChunk } from '@/types/archive'
import type { MemoryItem } from '@/types/memory'
import type { Person } from '@/lib/people'
import { stripSongTags } from '@/lib/songPick'

export type SegmentSource = 'chat' | 'archive' | 'memory' | 'person'

export interface Segment {
  key: string
  source: SegmentSource
  /** 送去嵌入的文字 */
  text: string
  meta: Record<string, unknown>
}

export const SEG_MIN_CHARS = 300
export const SEG_MAX_CHARS = 600
export const SEG_MIN_MSGS = 2
export const SEG_MAX_MSGS = 4
/** 单条超长消息/档案块送去嵌入时的截断长度（bge-m3 支持长文本，但别浪费流量） */
export const EMBED_TEXT_MAX = 1200

/** cyrb53：快速、同步、稳定的 53 位字符串哈希（不做安全用途，只去重）。 */
export function contentHash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function segmentKey(model: string, text: string): string {
  return `${contentHash(`${model}\n${text}`)}-${text.length.toString(36)}`
}

function clipChars(text: string, n: number): string {
  const chars = Array.from(text)
  return chars.length > n ? chars.slice(0, n).join('') : text
}

function len(text: string): number {
  return Array.from(text).length
}

function lineOf(role: 'me' | 'companion', text: string): string {
  return `${role === 'me' ? '她' : '他'}：${text.replace(/\s+/g, ' ').trim()}`
}

/**
 * 一个会话按相邻 2–4 条一段切：攒到 ≥300 字且 ≥2 条、或满 600 字、或满 4 条就收段。
 * 从头贪心切，旧消息不变时旧段边界也不变，哈希稳定，不会重复嵌入。
 * 最后不足 2 条的尾巴先不切（还在聊，等下一条进来再一起嵌）。
 */
export function segmentSession(session: ChatSession, model: string, opts: { includeTail?: boolean } = {}): Segment[] {
  const out: Segment[] = []
  let buf: Array<{ id: string; role: 'me' | 'companion'; text: string; ts?: number }> = []
  let chars = 0
  const flush = () => {
    if (!buf.length) return
    const text = clipChars(buf.map((m) => lineOf(m.role, m.text)).join('\n'), EMBED_TEXT_MAX)
    out.push({
      key: segmentKey(model, text),
      source: 'chat',
      text,
      meta: {
        sessionId: session.id,
        msgIds: buf.map((m) => m.id),
        firstId: buf[0].id,
        lastId: buf[buf.length - 1].id,
        ts: buf.find((m) => m.ts)?.ts,
        at: session.updatedAt || session.createdAt,
      },
    })
    buf = []
    chars = 0
  }
  for (const m of session.messages) {
    const text = stripSongTags(m.text || '').trim()
    if (!text || len(text) < 2) continue
    const l = len(text)
    // 这条加进来会超 600 字，且已有 ≥2 条：先收段
    if (buf.length >= SEG_MIN_MSGS && chars + l > SEG_MAX_CHARS) flush()
    buf.push({ id: m.id, role: m.role, text, ts: m.ts })
    chars += l
    if (buf.length >= SEG_MAX_MSGS || chars >= SEG_MAX_CHARS || (buf.length >= SEG_MIN_MSGS && chars >= SEG_MIN_CHARS)) flush()
  }
  if (buf.length >= SEG_MIN_MSGS || (opts.includeTail && buf.length)) flush()
  return out
}

export function segmentArchiveChunk(chunk: ArchiveChunk, model: string): Segment {
  const text = clipChars(chunk.text.trim(), EMBED_TEXT_MAX)
  return {
    key: segmentKey(model, text),
    source: 'archive',
    text,
    meta: {
      chunkId: chunk.id,
      conversationId: chunk.conversationId,
      title: chunk.title,
      startedAt: chunk.startedAt,
      endedAt: chunk.endedAt,
      messageIds: chunk.messageIds,
    },
  }
}

export function segmentMemory(memory: MemoryItem, model: string): Segment | null {
  if (memory.deletedAt || memory.supersededById) return null
  const body = memory.content.trim()
  if (!body) return null
  const text = clipChars(memory.title?.trim() ? `${memory.title.trim()}：${body}` : body, EMBED_TEXT_MAX)
  return { key: segmentKey(model, text), source: 'memory', text, meta: { memoryId: memory.id } }
}

export function segmentPersonEvents(person: Person, model: string): Segment[] {
  return person.events
    .filter((e) => e.text.trim())
    .map((e) => {
      const text = clipChars(`${person.name}：${e.text.trim()}`, EMBED_TEXT_MAX)
      return {
        key: segmentKey(model, text),
        source: 'person' as const,
        text,
        meta: { personId: person.id, eventId: e.id, date: e.date },
      }
    })
}

export interface SegmentInputs {
  sessions: ChatSession[]
  archiveChunks: ArchiveChunk[]
  memories: MemoryItem[]
  people: Person[]
}

/** 全部片段，按 key 去重（同样的文字只留第一处）。 */
export function buildAllSegments(input: SegmentInputs, model: string): Segment[] {
  const all: Segment[] = []
  for (const s of input.sessions) all.push(...segmentSession(s, model))
  for (const c of input.archiveChunks) all.push(segmentArchiveChunk(c, model))
  for (const m of input.memories) {
    const seg = segmentMemory(m, model)
    if (seg) all.push(seg)
  }
  for (const p of input.people) all.push(...segmentPersonEvents(p, model))
  const seen = new Set<string>()
  return all.filter((s) => (seen.has(s.key) ? false : (seen.add(s.key), true)))
}
