/**
 * 人物档案：她生活和故事里的人，每人一页——名字、别名、一句话背景、按日期的事件。
 *
 * - 伯恩可以在回复里写隐藏标签 [人物:名字|一句话背景或新事件]，前端藏起来并归档：
 *   名字（或别名）不存在就新建，存在就把内容作为带今天日期的事件追加，同一句话去重。
 * - 她最近 1–2 条消息提到某人的名字或别名时，往系统提示里注入这个人的档案块。
 *
 * 这里只放纯函数；持久化在 store/peopleStore.ts。
 */
import type { ChatSession } from '@/store/chatStore'
import type { MemoryItem } from '@/types/memory'
import { QUOTE_RULE, clipQuote, monthDay, quoteLine } from '@/lib/quoteFormat'

export interface PersonEvent {
  id: string
  /** 本地日期 YYYY-MM-DD */
  date: string
  text: string
  createdAt: string
  hitCount?: number
  lastUsedAt?: string
}

export interface Person {
  id: string
  name: string
  aliases: string[]
  /** 与她的关系或背景，一句话 */
  background: string
  events: PersonEvent[]
  createdAt: string
  updatedAt: string
  hitCount?: number
  lastUsedAt?: string
}

/** 预置人物，背景留空让她自己填。 */
export const PRESET_PEOPLE = ['顾屿', '裴屿', '顾祁砚', '伯恩']

export const PERSON_TAG_PROMPT =
  '\n\n【人物】她提到一个人，并说了关于这个人的新事实或新事件时，在回复最后另起一行写 [人物:名字|一句话背景或新事件]（例如 [人物:裴屿|她说裴屿最近在学吉他]），一次最多两条；只写她说的或明确发生的，不猜测、不重复已知内容。这个标记会自动隐藏并存进人物档案。'

const TAG = /\[\s*人物\s*[:：]\s*([^\]|｜\n]+?)\s*[|｜]\s*([^\]\n]+?)\s*\]/g

export function newPeopleId(prefix = 'p'): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${rnd}`
}

export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function norm(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/[\s，。,.!！?？、；;：:“”"'‘’（）()【】[\]…~～-]+/gu, '')
}

export function createPerson(name: string, now: Date = new Date(), patch: Partial<Person> = {}): Person {
  const iso = now.toISOString()
  return {
    id: newPeopleId(),
    name: name.trim(),
    aliases: [],
    background: '',
    events: [],
    createdAt: iso,
    updatedAt: iso,
    ...patch,
  }
}

/** 首次使用时补上预置人物（只做一次，她删掉的不会再回来）。 */
export function seedPresetPeople(list: Person[], now: Date = new Date()): Person[] {
  const next = [...list]
  for (const name of PRESET_PEOPLE) {
    if (!findPerson(next, name)) next.push(createPerson(name, now))
  }
  return next
}

/** 名字或别名（不分大小写）找人。 */
export function findPerson(list: Person[], name: string): Person | undefined {
  const key = norm(name)
  if (!key) return undefined
  return list.find((p) => norm(p.name) === key || p.aliases.some((a) => norm(a) === key))
}

export function parseAliases(raw: string): string[] {
  return Array.from(new Set(raw.split(/[,，、\s/]+/u).map((a) => a.trim()).filter(Boolean)))
}

/** 取出回复里的 [人物:名字|内容] 标签。 */
export function extractPersonTags(text: string): { clean: string; tags: Array<{ name: string; content: string }> } {
  const tags: Array<{ name: string; content: string }> = []
  const clean = text.replace(new RegExp(TAG.source, 'g'), (_m, n: string, c: string) => {
    const name = (n || '').trim()
    const content = (c || '').trim()
    if (name && content && !tags.some((t) => t.name === name && t.content === content)) tags.push({ name, content })
    return ''
  })
  if (!tags.length) return { clean: text, tags }
  return { clean: clean.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), tags }
}

/**
 * 把一条 [人物:] 标签合进人物库。新人：内容作为背景；已有的人：内容作为今天的事件追加。
 * 同一句话（忽略空白标点）已经在背景或事件里就跳过。
 */
export function applyPersonTag(
  list: Person[],
  name: string,
  content: string,
  now: Date = new Date(),
): { people: Person[]; change: 'created' | 'event' | 'duplicate' } {
  const text = content.trim()
  const existing = findPerson(list, name)
  if (!existing) {
    return { people: [...list, createPerson(name, now, { background: text })], change: 'created' }
  }
  const key = norm(text)
  if (!key || norm(existing.background) === key || existing.events.some((e) => norm(e.text) === key)) {
    return { people: list, change: 'duplicate' }
  }
  const iso = now.toISOString()
  const event: PersonEvent = { id: newPeopleId('ev'), date: localDate(now), text, createdAt: iso }
  return {
    people: list.map((p) => (p.id === existing.id ? { ...p, events: [...p.events, event], updatedAt: iso } : p)),
    change: 'event',
  }
}

export function sortedEvents(person: Person): PersonEvent[] {
  return [...person.events].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
}

/** 可用于匹配的名字：名字 + 别名，至少两个字，避免单字误命中。 */
function namesOf(person: Person): string[] {
  return [person.name, ...person.aliases].map((n) => n.trim()).filter((n) => Array.from(n).length >= 2)
}

function containsName(text: string, name: string): boolean {
  return text.toLocaleLowerCase().includes(name.toLocaleLowerCase())
}

/**
 * 她最近 1–2 条消息里提到的人。越靠近最新一句、提到越多的越靠前；常被召回的人在并列时略优先。
 */
export function matchMentionedPeople(list: Person[], userTexts: string[], max = 3): Person[] {
  const texts = userTexts.filter(Boolean).slice(-2)
  if (!texts.length) return []
  const scored: Array<{ p: Person; score: number }> = []
  for (const p of list) {
    const names = namesOf(p)
    let score = 0
    texts.forEach((t, i) => {
      const w = i === texts.length - 1 ? 10 : 6
      if (names.some((n) => containsName(t, n))) score += w
    })
    if (!score) continue
    score += Math.min(2, Math.log2(1 + (p.hitCount ?? 0)) * 0.5)
    scored.push({ p, score })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((s) => s.p)
}

export interface NameSnippet {
  /** 用于排序的时间（毫秒） */
  at: number
  /** 已经格式化好的几行原话 */
  lines: string[]
  /** 去重 key */
  key: string
}

/** 所有聊天窗口里提到这个人的原话，每段带前后各 1 条，最新的在前。 */
export function findNameSnippetsInSessions(
  sessions: ChatSession[],
  person: Person,
  inContextIds: Set<string>,
  max = 3,
): NameSnippet[] {
  const names = namesOf(person)
  if (!names.length) return []
  const found: NameSnippet[] = []
  for (const session of sessions) {
    const msgs = session.messages
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const m = msgs[i]
      if (!m?.text?.trim() || inContextIds.has(m.id)) continue
      if (!names.some((n) => containsName(m.text, n))) continue
      const lines: string[] = []
      for (const j of [i - 1, i, i + 1]) {
        const x = msgs[j]
        if (!x?.text?.trim() || inContextIds.has(x.id)) continue
        const when = x.ts ?? session.updatedAt ?? session.createdAt
        lines.push(quoteLine(when, x.role === 'me' ? 'me' : 'companion', x.text, { max: j === i ? 120 : 70, approximate: !x.ts }))
      }
      found.push({ at: m.ts ?? (Date.parse(session.updatedAt || session.createdAt) || 0), lines, key: `${session.id}:${i}` })
    }
  }
  // 相邻命中合并：同一窗口相距 ≤2 的只留最新那段
  found.sort((a, b) => b.at - a.at)
  const picked: NameSnippet[] = []
  for (const s of found) {
    const [sid, idx] = s.key.split(':')
    if (picked.some((p) => p.key.split(':')[0] === sid && Math.abs(Number(p.key.split(':')[1]) - Number(idx)) <= 2)) continue
    picked.push(s)
    if (picked.length >= max) break
  }
  return picked
}

/** 旧日档案（导入的整段原文）里提到此名字的片段：截名字附近一小段，带日期。 */
export function archiveSnippetAround(text: string, names: string[], when?: string, max = 160): string {
  const lower = text.toLocaleLowerCase()
  let hit = -1
  for (const n of names) {
    const i = lower.indexOf(n.toLocaleLowerCase())
    if (i >= 0 && (hit < 0 || i < hit)) hit = i
  }
  if (hit < 0) return ''
  // 往前找这段话的说话人前缀
  const before = text.slice(0, hit)
  const u = before.lastIndexOf('用户原话')
  const a = before.lastIndexOf('当时的助手原话')
  const who = Math.max(u, a) < 0 ? '' : u > a ? '她' : '他'
  const start = Math.max(0, hit - 40)
  const body = text.slice(start, hit + max).replace(/(?:用户原话|当时的助手原话)[:：]/gu, ' / ').trim()
  const md = monthDay(when) || '日期不详'
  return `${md} ${who ? `${who}说` : '旧文'}：${start > 0 ? '…' : ''}${clipQuote(body, max)}`
}

export interface PersonRecallInput {
  person: Person
  /** 已格式化的原话片段（窗口 + 档案），最多取 3 段 */
  snippets: string[][]
  memories: MemoryItem[]
  maxChars?: number
}

/** 含此名字的长期记忆（未删除、未被取代、未过期）。 */
export function memoriesMentioning(memories: MemoryItem[], person: Person, now: Date = new Date(), max = 3): MemoryItem[] {
  const names = namesOf(person)
  if (!names.length) return []
  return memories
    .filter((m) => m.kind === 'long' && !m.deletedAt && !m.supersededById)
    .filter((m) => !m.expiresAt || new Date(m.expiresAt).getTime() > now.getTime())
    .filter((m) => names.some((n) => containsName(`${m.title} ${m.content} ${m.tags.join(' ')}`, n)))
    .sort((a, b) => (b.hitCount ?? 0) - (a.hitCount ?? 0) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, max)
}

function eventLine(e: PersonEvent): string {
  const [, m, d] = e.date.split('-').map(Number)
  const md = m && d ? `${m}月${d}日` : e.date
  return `- ${md}：${clipQuote(e.text, 90)}`
}

/** 一个人的档案块（约 800 字以内），返回文本和实际用上的事件 / 记忆 id。 */
export function buildPersonBlock(input: PersonRecallInput): { text: string; eventIds: string[]; memoryIds: string[] } {
  const { person } = input
  const maxChars = input.maxChars ?? 800
  const out: string[] = []
  let used = 0
  const push = (line: string): boolean => {
    if (used + line.length + 1 > maxChars) return false
    out.push(line)
    used += line.length + 1
    return true
  }
  const alias = person.aliases.length ? `（也叫：${person.aliases.join('、')}）` : ''
  push(`◆ ${person.name}${alias}`)
  push(`背景：${person.background.trim() ? clipQuote(person.background, 120) : '（她还没写）'}`)
  const eventIds: string[] = []
  const events = sortedEvents(person).slice(-5)
  if (events.length && push('近事：')) {
    for (const e of events) if (push(eventLine(e))) eventIds.push(e.id)
  }
  const snippets = input.snippets.filter((s) => s.length).slice(0, 3)
  if (snippets.length && push('提到 TA 的原话：')) {
    for (const s of snippets) {
      const block = s.join('\n')
      if (!push(block)) {
        // 预算不够时只留命中的那一行
        const mid = s[Math.floor(s.length / 2)] ?? s[0]
        if (mid) push(mid)
      }
    }
  }
  const memoryIds: string[] = []
  if (input.memories.length && push('相关长期记忆：')) {
    for (const m of input.memories) {
      if (push(`- ${clipQuote(m.title && !m.content.startsWith(m.title) ? `${m.title}：${m.content}` : m.content, 120)}`)) memoryIds.push(m.id)
    }
  }
  return { text: out.join('\n'), eventIds, memoryIds }
}

export function wrapPeopleBlocks(blocks: string[]): string {
  if (!blocks.length) return ''
  return (
    '\n\n【人物档案——她刚提到的人】\n' +
    blocks.join('\n\n') +
    '\n按档案里的主语归属，别把别人的事安到她或你自己身上；自然接上就好，不要提「档案」。' +
    QUOTE_RULE
  )
}

/** 记一次召回：hitCount +1、lastUsedAt。不动 updatedAt。 */
export function markPeopleUsed(list: Person[], personIds: string[], eventIds: string[], now: Date = new Date()): Person[] {
  if (!personIds.length && !eventIds.length) return list
  const iso = now.toISOString()
  const pid = new Set(personIds)
  const eid = new Set(eventIds)
  return list.map((p) => {
    const touched = pid.has(p.id) || p.events.some((e) => eid.has(e.id))
    if (!touched) return p
    return {
      ...p,
      ...(pid.has(p.id) ? { hitCount: (p.hitCount ?? 0) + 1, lastUsedAt: iso } : {}),
      events: p.events.map((e) => (eid.has(e.id) ? { ...e, hitCount: (e.hitCount ?? 0) + 1, lastUsedAt: iso } : e)),
    }
  })
}
