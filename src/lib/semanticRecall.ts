/**
 * 语义召回（向量）：用她最近 1–2 条消息生成查询向量，在本地向量库里按余弦相似度找相近片段，
 * 再折算成分数并进现有的关键词召回（跨窗口原话 / 旧日原文 / 记忆库），同一套预算、同一套去重。
 * 这里全是纯函数 + 可注入依赖，不直接读 store，便于测试；接线在 semanticRuntime.ts。
 */
import type { ChatSession } from '@/store/chatStore'
import type { ArchiveRecallHit } from '@/types/archive'
import type { Person } from '@/lib/people'
import { clipQuote } from '@/lib/quoteFormat'
import { cosine, normalize, type VectorRecord } from '@/lib/semanticVectorDb'

/** 余弦相似度阈值：bge-m3 中文闲聊里 0.55 以下基本是「同样在聊天」的泛相似。 */
export const SEMANTIC_THRESHOLD = 0.55
export const SEMANTIC_TOP_K = 8
export const SEMANTIC_QUERY_TIMEOUT_MS = 4000
/** 查询前先多取一些候选，过滤掉已经在上下文里的片段后再截到 top K */
export const SEMANTIC_CANDIDATES = 32

export interface SemanticHit {
  record: VectorRecord
  score: number
}

/** 她最近 1–2 条消息拼成查询（最新在后），截到 500 字。 */
export function semanticQueryText(userTexts: string[]): string {
  const parts = userTexts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(-2)
  const joined = parts.join('\n')
  const chars = Array.from(joined)
  return chars.length > 500 ? chars.slice(-500).join('') : joined
}

/** 余弦 top K（阈值以下全丢）。queryVec 会先归一化；记录里的向量已归一化。 */
export function topSemantic(
  queryVec: ArrayLike<number>,
  records: Iterable<VectorRecord>,
  opts: { topK?: number; threshold?: number; exclude?: (r: VectorRecord) => boolean } = {},
): SemanticHit[] {
  const q = normalize(queryVec)
  const threshold = opts.threshold ?? SEMANTIC_THRESHOLD
  const topK = opts.topK ?? SEMANTIC_TOP_K
  const hits: SemanticHit[] = []
  for (const record of records) {
    if (record.dim !== q.length) continue
    if (opts.exclude?.(record)) continue
    const score = cosine(q, record.vec)
    if (score >= threshold) hits.push({ record, score })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, topK)
}

/** 给 promise 加超时；超时会 abort 并抛错。 */
export async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort()
      reject(new Error('语义查询超时'))
    }, ms)
  })
  try {
    return await Promise.race([run(ctl.signal), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export interface SemanticSearchDeps {
  embedQuery: (text: string, signal: AbortSignal) => Promise<number[]>
  loadRecords: () => Promise<Iterable<VectorRecord>>
  topK?: number
  threshold?: number
  timeoutMs?: number
  exclude?: (r: VectorRecord) => boolean
}

/** 生成查询向量并检索。任何失败（超时、网络、库打不开）都返回 []，调用方只用关键词。 */
export async function semanticSearch(query: string, deps: SemanticSearchDeps): Promise<SemanticHit[]> {
  const text = query.trim()
  if (!text) return []
  try {
    const [vec, records] = await Promise.all([
      withTimeout((signal) => deps.embedQuery(text, signal), deps.timeoutMs ?? SEMANTIC_QUERY_TIMEOUT_MS),
      deps.loadRecords(),
    ])
    return topSemantic(vec, records, { topK: deps.topK, threshold: deps.threshold, exclude: deps.exclude })
  } catch {
    return []
  }
}

/* ---------------- 合并打分 ---------------- */

export interface FuseScale {
  /** 刚过阈值时的加分 */
  base: number
  /** 相似度 1.0 时在 base 之上再加的分 */
  span: number
}

/** 各召回通道的折算尺度，和各自关键词分数同量级。 */
export const FUSE = {
  /** 跨窗口原话：关键词分 1–6，最低入选 2 */
  chat: { base: 2, span: 4 },
  /** 记忆库：话题相关度最多 +36 */
  memory: { base: 12, span: 24 },
  /** 旧日原文：原话完整命中 +120、相关词最多 +72 */
  archive: { base: 60, span: 90 },
} satisfies Record<string, FuseScale>

/** 关键词分 + 语义加分（相似度低于阈值不加）。两路都命中的自然排在前面。 */
export function fuseScore(keyword: number, sim: number | undefined, scale: FuseScale, threshold = SEMANTIC_THRESHOLD): number {
  if (sim == null || sim < threshold) return keyword
  const t = Math.min(1, Math.max(0, (sim - threshold) / (1 - threshold)))
  return keyword + scale.base + scale.span * t
}

function semanticBonus(sim: number, scale: FuseScale, threshold = SEMANTIC_THRESHOLD): number {
  return fuseScore(0, sim, scale, threshold)
}

/** 过滤掉已经全部在本轮上下文里的聊天片段（它们本来就在，不该占 top K）。 */
export function selectTurnHits(
  hits: SemanticHit[],
  inContextIds: Set<string>,
  opts: { topK?: number; allowArchive?: boolean; allowedConversationIds?: Set<string> } = {},
): SemanticHit[] {
  return hits
    .filter((h) => {
      const m = h.record.meta
      if (h.record.source === 'chat') {
        const ids = (m.msgIds as string[] | undefined) ?? []
        return ids.some((id) => !inContextIds.has(id))
      }
      if (h.record.source === 'archive') {
        if (opts.allowArchive === false) return false
        if (opts.allowedConversationIds && !opts.allowedConversationIds.has(String(m.conversationId))) return false
      }
      return true
    })
    .slice(0, opts.topK ?? SEMANTIC_TOP_K)
}

/**
 * 聊天片段 → 跨窗口召回的加分表（消息 id → 加分）。
 * 每段只给一条「锚点」加分：优先她自己说的、不在上下文里的那条；召回时再带前后各 1 条。
 * 消息已被删掉的片段自动失效。
 */
export function chatBoostMap(hits: SemanticHit[], sessions: ChatSession[], inContextIds: Set<string>): Map<string, number> {
  const out = new Map<string, number>()
  const byId = new Map<string, { role: 'me' | 'companion' }>()
  for (const s of sessions) for (const m of s.messages) byId.set(m.id, m)
  for (const h of hits) {
    if (h.record.source !== 'chat') continue
    const ids = ((h.record.meta.msgIds as string[] | undefined) ?? []).filter((id) => byId.has(id) && !inContextIds.has(id))
    if (!ids.length) continue
    const anchor = ids.find((id) => byId.get(id)?.role === 'me') ?? ids[0]
    const bonus = semanticBonus(h.score, FUSE.chat)
    out.set(anchor, Math.max(out.get(anchor) ?? 0, bonus))
  }
  return out
}

/** 记忆片段 → 记忆召回的加分表（记忆 id → 加分）。 */
export function memoryBoostMap(hits: SemanticHit[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const h of hits) {
    if (h.record.source !== 'memory') continue
    const id = String(h.record.meta.memoryId ?? '')
    if (id) out.set(id, Math.max(out.get(id) ?? 0, semanticBonus(h.score, FUSE.memory)))
  }
  return out
}

/** 记忆片段命中的 id（相似度从高到低） */
export function memoryIdsFromHits(hits: SemanticHit[]): string[] {
  return hits.filter((h) => h.record.source === 'memory').map((h) => String(h.record.meta.memoryId ?? '')).filter(Boolean)
}

/** 旧日原文片段 → 档案召回候选（分数已折算，交给 recallArchiveQueries 和关键词结果合并去重）。 */
export function archiveHitsFromSemantic(hits: SemanticHit[]): ArchiveRecallHit[] {
  return hits
    .filter((h) => h.record.source === 'archive')
    .map((h) => {
      const m = h.record.meta
      return {
        chunkId: String(m.chunkId),
        conversationId: String(m.conversationId),
        title: String(m.title || '未命名旧会话'),
        startedAt: m.startedAt as string | undefined,
        endedAt: m.endedAt as string | undefined,
        text: h.record.text,
        messageIds: (m.messageIds as string[] | undefined) ?? [],
        score: Math.round(semanticBonus(h.score, FUSE.archive)),
        reasons: ['语义相近'],
        matchedSpeaker: 'unknown' as const,
      }
    })
}

/**
 * 人物事件片段 → 一小段「相关人物近事」。只列事件本身（事件文本本来就写明了是谁），
 * 已经由人物档案整块注入的人跳过；事件已删就不列。
 */
export function personEventBlock(
  hits: SemanticHit[],
  people: Person[],
  skipPersonIds: Set<string>,
  maxChars = 400,
): string {
  const lines: string[] = []
  let used = 0
  const seen = new Set<string>()
  for (const h of hits) {
    if (h.record.source !== 'person') continue
    const pid = String(h.record.meta.personId ?? '')
    const eid = String(h.record.meta.eventId ?? '')
    if (!pid || skipPersonIds.has(pid) || seen.has(eid)) continue
    const person = people.find((p) => p.id === pid)
    const event = person?.events.find((e) => e.id === eid)
    if (!person || !event) continue
    const line = `- ${person.name}（${event.date}）：${clipQuote(event.text, 90)}`
    if (used + line.length > maxChars) break
    lines.push(line)
    used += line.length
    seen.add(eid)
  }
  if (!lines.length) return ''
  return `\n\n【相关人物近事】\n${lines.join('\n')}\n这些是人物档案里记下的事，按人名归属理解，自然想起就好，不要提档案或检索。`
}
