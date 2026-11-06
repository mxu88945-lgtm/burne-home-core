/**
 * 跨窗口全局回忆（参考顾祁砚 retrieveCrossChat / 旧文召回，独立实现）。
 *
 * 从「其他聊天窗口」和「当前窗口里已经滑出 API 上下文的更早消息」中，
 * 按用户最近原话的关键词 + 指定日期找回原话，并带上前后相邻消息，
 * 有界注入 system。只读原消息，不改存储、不调模型、不花额外 token 请求。
 */
import type { ChatMsg, ChatSession } from '@/store/chatStore'

export interface CrossRecallOptions {
  sessions: ChatSession[]
  activeId: string
  /** 已经在本轮 API 上下文里的消息 id（不重复注入） */
  inContextIds: Set<string>
  /** 用户最近的原话（最新在后） */
  userQueries: string[]
  meName: string
  aiName: string
  now?: Date
  maxHits?: number
  maxChars?: number
}

export interface CrossRecallResult {
  text: string
  hits: number
}

const STOP = new Set(
  '的了是我你他她它们在有就不也都和吗呢吧啊哦嗯呀么这那个一会要说去来到还又很好没想看知道什么怎么今天现在然后就是可以'.split(''),
)
const STOP_BIGRAMS = new Set(['我们', '你们', '他们', '什么', '怎么', '这个', '那个', '就是', '可以', '知道', '现在', '然后', '还是', '没有', '一下', '一个'])
const RECALL_INTENT = /记得|那天|之前|上次|以前|当时|那时|说过|聊过|提过|忘了|回忆/

function tokens(text: string): Map<string, number> {
  const out = new Map<string, number>()
  const lower = text.toLocaleLowerCase()
  for (const w of lower.match(/[a-z0-9]{2,}/g) ?? []) out.set(w, 1.5)
  const cjk = Array.from(lower.replace(/[^\u3400-\u9fff]+/g, ' '))
  for (let i = 0; i < cjk.length - 1; i += 1) {
    const a = cjk[i]
    const b = cjk[i + 1]
    if (a === ' ' || b === ' ') continue
    const bg = a + b
    if (STOP_BIGRAMS.has(bg) || (STOP.has(a) && STOP.has(b))) continue
    out.set(bg, 1)
  }
  return out
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** 识别「11月3号/日」「昨天」「前天」→ 日期 key 集合 */
export function parseDates(text: string, now: Date): Set<string> {
  const keys = new Set<string>()
  for (const m of text.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/g)) {
    const month = Number(m[1])
    const day = Number(m[2])
    if (month < 1 || month > 12 || day < 1 || day > 31) continue
    let year = now.getFullYear()
    if (new Date(year, month - 1, day).getTime() > now.getTime() + 86400000) year -= 1
    keys.add(`${year}-${month}-${day}`)
  }
  const shift = (n: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() - n)
    keys.add(dayKey(d))
  }
  if (/昨天|昨晚|昨日/.test(text)) shift(1)
  if (/前天/.test(text)) shift(2)
  return keys
}

function clip(text: string, n: number): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim())
  return chars.length > n ? `${chars.slice(0, n - 1).join('')}…` : chars.join('')
}

function stamp(msg: ChatMsg, session: ChatSession): string {
  const d = msg.ts ? new Date(msg.ts) : new Date(session.updatedAt || session.createdAt)
  const date = Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}月${d.getDate()}日`
  return msg.ts ? `${date} ${msg.at || ''}`.trim() : `${date}前后 ${msg.at || ''}`.trim()
}

export function recallCrossSessions(opts: CrossRecallOptions): CrossRecallResult {
  const now = opts.now ?? new Date()
  const maxHits = opts.maxHits ?? 6
  const maxChars = opts.maxChars ?? 1800
  const queries = opts.userQueries.map((q) => q.trim()).filter(Boolean)
  if (!queries.length) return { text: '', hits: 0 }
  const latest = queries[queries.length - 1]
  // 最新一句权重最高；省略式追问（"那中午呢"）靠上一句补话题
  const q = new Map<string, number>()
  queries.forEach((text, i) => {
    const w = i === queries.length - 1 ? 1 : 0.5
    for (const [t, v] of tokens(text)) q.set(t, Math.max(q.get(t) ?? 0, v * w))
  })
  const dates = parseDates(latest, now)
  const intent = RECALL_INTENT.test(latest)
  if (!q.size && !dates.size) return { text: '', hits: 0 }

  type Hit = { session: ChatSession; index: number; score: number }
  const hits: Hit[] = []
  for (const session of opts.sessions) {
    const list = session.messages
    list.forEach((msg, index) => {
      if (opts.inContextIds.has(msg.id)) return
      const text = msg.text?.trim()
      if (!text || text.length < 2) return
      const mt = tokens(text)
      let score = 0
      for (const [t, w] of q) if (mt.has(t)) score += w
      if (dates.size && msg.ts && dates.has(dayKey(new Date(msg.ts)))) score += intent ? 3 : 2
      // 用户自己说过的话更可信，略加权
      if (msg.role === 'me') score *= 1.15
      if (score >= 2) hits.push({ session, index, score })
    })
  }
  if (!hits.length) return { text: '', hits: 0 }
  hits.sort((a, b) => b.score - a.score || (b.session.messages[b.index].ts ?? 0) - (a.session.messages[a.index].ts ?? 0))

  // 取前 N 个命中，各带前后一条，按会话 + 原顺序排好
  const picked = new Map<string, { session: ChatSession; idx: Set<number> }>()
  for (const h of hits.slice(0, maxHits)) {
    const entry = picked.get(h.session.id) ?? { session: h.session, idx: new Set<number>() }
    for (const i of [h.index - 1, h.index, h.index + 1]) {
      const m = h.session.messages[i]
      if (m && m.text?.trim() && !opts.inContextIds.has(m.id)) entry.idx.add(i)
    }
    picked.set(h.session.id, entry)
  }

  const blocks: string[] = []
  let used = 0
  for (const { session, idx } of picked.values()) {
    const same = session.id === opts.activeId
    const head = same ? '本窗口更早的对话' : `窗口「${clip(session.title || '对话', 16)}」`
    const lines: string[] = []
    for (const i of [...idx].sort((a, b) => a - b)) {
      const m = session.messages[i]
      const who = m.role === 'me' ? opts.meName : opts.aiName
      const line = `[${stamp(m, session)}] ${who}：${clip(m.text, 160)}`
      if (used + line.length > maxChars) break
      lines.push(line)
      used += line.length
    }
    if (lines.length) blocks.push(`· ${head}\n${lines.join('\n')}`)
    if (used >= maxChars) break
  }
  if (!blocks.length) return { text: '', hits: 0 }
  const text =
    `\n\n【跨窗口回忆 · 之前的原话】\n${blocks.join('\n')}\n` +
    '这些是其他聊天窗口或本窗口更早时候的原话，用来接上之前聊过的事；' +
    '当前对话、人设和用户此刻的说法优先。自然地记得就好，不要生硬复述，也不要提「窗口」「检索」这些词。'
  return { text, hits: Math.min(hits.length, maxHits) }
}
