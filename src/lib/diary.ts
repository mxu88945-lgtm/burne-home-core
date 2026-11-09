/**
 * 私人日记（对齐顾祁砚的「私记」）：只有在这一轮有新的情绪转折、值得之后记着时，
 * 伯恩在回复末尾写 [私记:第一人称一小段]。前端把标记藏起来、存成一页日记；
 * 之后每轮把最新 1–2 页和与当前话题相关的旧页（合计约 850 字）作为「他当时的主观感受」带上。
 */

export interface DiaryEntry {
  id: string
  text: string
  createdAt: number
  sourceMessageId?: string
}

export const DIARY_MAX_ENTRY_CHARS = 400
export const DIARY_MIN_ENTRY_CHARS = 12
export const DIARY_PROMPT_CAP = 850

export const DIARY_TAG_PROMPT =
  '\n\n【私记】仅当这一轮有新的、明确的情绪转折或对关系的判断，值得之后一直记着时，在回复最后另起一行写 [私记:第一人称，30–120字]。' +
  '闲聊和日常不写，不替她编造感受。这个标记会自动隐藏，存进只有你自己翻看的私人日记。'

const NAMES = '(?:私记|私人日记|角色日记)'
const MARKER = new RegExp(
  `\\[\\s*${NAMES}\\s*[:：]([\\s\\S]*?)\\]|【\\s*${NAMES}\\s*[:：]([\\s\\S]*?)】|<\\s*${NAMES}\\s*>([\\s\\S]*?)<\\s*\\/\\s*${NAMES}\\s*>`,
  'gi',
)

function tidy(text: string): string {
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function normalizeDiaryText(text: string): string {
  return Array.from((text || '').replace(/\s+/g, ' ').trim()).slice(0, DIARY_MAX_ENTRY_CHARS).join('')
}

/** 取出回复里的私记标记（一次只存第一条），返回去掉标记的正文。 */
export function extractDiaryTags(text: string): { clean: string; saves: string[] } {
  const saves: string[] = []
  let hit = false
  const clean = text.replace(new RegExp(MARKER.source, 'gi'), (_m, a?: string, b?: string, c?: string) => {
    hit = true
    const body = normalizeDiaryText(a ?? b ?? c ?? '')
    if (!saves.length && Array.from(body).length >= DIARY_MIN_ENTRY_CHARS) saves.push(body)
    return ''
  })
  return { clean: hit ? tidy(clean) : text, saves }
}

/** 流式显示用：完整的私记和末尾写了一半的私记（可能跨行）都藏起来。 */
export function hideDiaryWhileStreaming(text: string): string {
  return text
    .replace(new RegExp(MARKER.source, 'gi'), '')
    .replace(/\[\s*(?:私记|私人日记|角色日记)\s*[:：][\s\S]*$/i, '')
    .replace(/【\s*(?:私(?:记|人(?:日(?:记)?)?)?|角(?:色(?:日(?:记)?)?)?)?\s*(?:[:：][\s\S]*)?$/, '')
    .replace(/<\s*(?:私记|私人日记|角色日记)\s*>[\s\S]*$/, '')
}

function grams(text: string): Set<string> {
  const out = new Set<string>()
  const t = text.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ' ')
  for (const word of t.split(' ')) {
    const c = Array.from(word)
    for (let i = 0; i + 1 < c.length; i++) out.add(c[i] + c[i + 1])
  }
  return out
}

/** 和已有日记几乎一样就不重复存 */
export function isDuplicateDiary(text: string, entries: DiaryEntry[]): boolean {
  const t = normalizeDiaryText(text)
  const g = grams(t)
  return entries.slice(-30).some((e) => {
    if (e.text === t) return true
    const eg = grams(e.text)
    if (!g.size || !eg.size) return false
    let shared = 0
    for (const x of g) if (eg.has(x)) shared += 1
    return shared / Math.max(g.size, eg.size) >= 0.8
  })
}

function stamp(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function clip(text: string, n: number): string {
  const c = Array.from(text)
  return c.length > n ? `${c.slice(0, n).join('')}…` : text
}

/** 选出要带进提示的日记：最新 recent 页 + 与 queryText 相关（至少 2 个共同二字片段）的旧页。纯函数。 */
export function selectDiaryForPrompt(
  entries: DiaryEntry[],
  queryText: string,
  opts: { recent?: number; related?: number } = {},
): { recent: DiaryEntry[]; related: DiaryEntry[] } {
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt)
  const recent = sorted.slice(-(opts.recent ?? 2))
  const recentIds = new Set(recent.map((e) => e.id))
  const q = grams(queryText || '')
  if (!q.size) return { recent, related: [] }
  const related = sorted
    .filter((e) => !recentIds.has(e.id))
    .map((e) => {
      let score = 0
      for (const g of grams(e.text)) if (q.has(g)) score += 1
      return { e, score }
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || b.e.createdAt - a.e.createdAt)
    .slice(0, opts.related ?? 3)
    .map((x) => x.e)
  return { recent, related }
}

/** 拼出注入系统提示的日记块；整块不超过 cap 字。没有日记时返回 ''。 */
export function buildDiaryBlock(
  entries: DiaryEntry[],
  queryText: string,
  cap = DIARY_PROMPT_CAP,
): { text: string; ids: string[] } {
  const { recent, related } = selectDiaryForPrompt(entries, queryText)
  if (!recent.length && !related.length) return { text: '', ids: [] }
  const head = '【私人日记·你当时的主观感受，并非她的客观事实】'
  const foot = '只用来自然延续你自己的情绪，不要引用、复述或告诉她日记内容，也不要把旧感受当成现在的事实。'
  let used = Array.from(head).length + Array.from(foot).length + 2
  const lines: string[] = []
  const ids: string[] = []
  const add = (label: string, list: DiaryEntry[]) => {
    const rows: string[] = []
    for (const e of [...list].reverse()) {
      const row = `- [${stamp(e.createdAt)}] ${clip(e.text, 220)}`
      const cost = Array.from(row).length + 1 + (rows.length ? 0 : Array.from(label).length + 1)
      if (used + cost > cap) continue
      used += cost
      rows.push(row)
      ids.push(e.id)
    }
    if (rows.length) lines.push(label, ...rows.reverse())
  }
  add('最近写下：', recent)
  add('从旧日记里翻到、和此刻相关：', related)
  if (!lines.length) return { text: '', ids: [] }
  return { text: `\n\n${head}\n${lines.join('\n')}\n${foot}`, ids }
}
