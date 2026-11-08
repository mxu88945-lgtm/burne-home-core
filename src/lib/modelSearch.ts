/**
 * 伯恩主动翻旧账（参照顾祁砚的 [搜索:] 机制）：
 * 模型记不清旧事时只写 [搜索:关键词]，前端藏起标签，用跨窗口原话 + 旧日档案 + 记忆库 + 人物档案查找，
 * 把结果作为工具结果附进系统提示，再生成一次回复。每轮最多 1 次。
 */
import type { ChatSession } from '@/store/chatStore'
import type { MemoryItem } from '@/types/memory'
import { recallCrossSessions } from '@/lib/crossSessionRecall'
import { recallArchiveQueries } from '@/lib/archiveRecall'
import { matchKeyword } from '@/lib/memory'
import { findPerson, sortedEvents, type Person } from '@/lib/people'
import { clipQuote } from '@/lib/quoteFormat'
import {
  archiveHitsFromSemantic,
  chatBoostMap,
  memoryIdsFromHits,
  selectTurnHits,
  type SemanticHit,
} from '@/lib/semanticRecall'
import type { ArchiveRecallHit } from '@/types/archive'

export const MAX_SEARCH_ROUNDS = 1

export const SEARCH_TAG_PROMPT =
  '\n\n【翻旧账】她问起以前的事、而上面的上下文和资料里没有、你又记不清时，先不要回答，只输出一行 [搜索:关键词]（关键词用人名、物品、地点或她当时的说法，2–8 个字），应用会去翻旧聊天和记忆再把原话给你。' +
  '不确定就先搜：不许编造细节，也不许直接说「没有这回事」「你没说过」。搜过仍没找到，就坦白说一时没翻到、请她提示一下。上下文里已经有的不要搜；一轮最多搜一次。'

const TAG = /\[\s*(?:搜索|搜|search)\s*[:：]\s*([^\]\n]+?)\s*\]/i

/** 找出回复里的 [搜索:关键词]（只认第一个），并返回去掉所有搜索标签的正文。 */
export function extractSearchTag(text: string): { query: string | null; clean: string } {
  const m = text.match(TAG)
  const clean = text.replace(new RegExp(TAG.source, 'gi'), '').replace(/\n{3,}/g, '\n\n').trim()
  const query = m?.[1]?.trim() || null
  return { query: query ? Array.from(query).slice(0, 40).join('') : null, clean }
}

export interface ModelSearchOptions {
  query: string
  sessions: ChatSession[]
  activeId: string
  inContextIds: Set<string>
  memories: MemoryItem[]
  people: Person[]
  meName: string
  aiName: string
  now?: Date
  /** 档案查询（测试可替换）；默认走 recallArchiveQueries，遵守「旧日原文召回」开关 */
  archiveSearch?: (query: string, extraHits?: ArchiveRecallHit[]) => Promise<string>
  /** 语义检索（开关关着时不传）；失败/超时自己返回 []。 */
  semantic?: (query: string) => Promise<SemanticHit[]>
}

export interface ModelSearchResult {
  text: string
  found: boolean
  memoryIds: string[]
}

const defaultArchiveSearch = async (query: string, extraHits?: ArchiveRecallHit[]) =>
  (await recallArchiveQueries([query], { maxHits: 4, maxChars: 2400, extraHits })).prompt

export async function runModelSearch(opts: ModelSearchOptions): Promise<ModelSearchResult> {
  const q = opts.query.trim()
  const parts: string[] = []
  const memoryIds: string[] = []
  let semHits: SemanticHit[] = []
  if (opts.semantic) {
    try {
      semHits = selectTurnHits(await opts.semantic(q), opts.inContextIds)
    } catch {
      semHits = []
    }
  }

  // 1) 所有聊天窗口里的原话（包括本窗口已滑出上下文的），带日期和前后各 1 条
  try {
    const cross = recallCrossSessions({
      sessions: opts.sessions,
      activeId: opts.activeId,
      inContextIds: opts.inContextIds,
      userQueries: [q],
      meName: opts.meName,
      aiName: opts.aiName,
      now: opts.now,
      minScore: 1,
      maxHits: 6,
      maxChars: 2000,
      heading: `翻旧账 · 「${q}」在聊天里的原话`,
      ...(semHits.length ? { semanticBoost: chatBoostMap(semHits, opts.sessions, opts.inContextIds) } : {}),
    })
    if (cross.text) parts.push(cross.text.trim())
  } catch {
    /* 忽略单个来源失败 */
  }

  // 2) 导入的旧日档案
  try {
    const extra = archiveHitsFromSemantic(semHits)
    const search = opts.archiveSearch ?? defaultArchiveSearch
    const archive = await (extra.length ? search(q, extra) : search(q))
    if (archive.trim()) parts.push(archive.trim())
  } catch {
    /* 档案库不可用 */
  }

  // 3) 记忆库
  const active = opts.memories.filter((m) => !m.deletedAt && !m.supersededById)
  const keywordMems = active.filter((m) => matchKeyword(m, q))
  const semIds = memoryIdsFromHits(semHits)
  const semMems = semIds
    .map((id) => active.find((m) => m.id === id))
    .filter((m): m is MemoryItem => !!m && !keywordMems.includes(m))
  // 关键词命中在前，语义补充在后，合计最多 5 条
  const mems = [...keywordMems, ...semMems].slice(0, 5)
  if (mems.length) {
    parts.push(`【翻旧账 · 记忆库】\n${mems.map((m) => `- ${clipQuote(m.content, 140)}`).join('\n')}`)
    memoryIds.push(...mems.map((m) => m.id))
  }

  // 4) 人物档案
  const person = findPerson(opts.people, q)
  if (person) {
    const ev = sortedEvents(person).slice(-5).map((e) => `- ${e.date}：${clipQuote(e.text, 90)}`)
    parts.push(
      `【翻旧账 · 人物「${person.name}」】\n背景：${person.background || '（未写）'}${ev.length ? `\n${ev.join('\n')}` : ''}`,
    )
  }

  const found = parts.length > 0
  const head = `\n\n【工具结果 · 你刚才请求的 [搜索:${q}]】\n`
  const text = found
    ? `${head}${parts.join('\n\n')}\n\n请只依据上面实际找到的原话作答；引用时说「你那天说……」，照原文，不要添油加醋。现在直接回答她，不要再输出 [搜索:]。`
    : `${head}没有找到和「${q}」相关的原话或记忆（可能是导入前的事、换了说法，或旧日原文召回没开）。` +
      '不要编造，也不要断言「没有这回事 / 你没说过」；坦白说一时没翻到，请她提示一下时间或说法。现在直接回答她，不要再输出 [搜索:]。'
  return { text, found, memoryIds }
}
