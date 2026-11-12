/**
 * 他自己写的卡（移植惟境 v211 / v213 人格窗口「自我卡」到主聊天）：伯恩在相处中慢慢补全自己。
 * - 原卡（人设 systemPrompt）永远不动；自我卡单独存，拼在稳定的第一条 system 里、紧跟原卡。
 * - 他偶尔在回复最后写 [自我卡:栏目|这一栏的新全文]，回复收尾时整栏替换，旧版本进历史（最多 20 版，可恢复）。
 * - 标记和点歌一样：显示 / 流式预览（含写到一半的）/ 发回模型的历史 / 记忆 / 摘要 / 语义索引 / 导出里都去掉。
 */

export const SELF_CARD_SECTIONS = [
  { key: 'personality', label: '性格' },
  { key: 'likes', label: '喜好' },
  { key: 'strengths', label: '优点' },
  { key: 'weaknesses', label: '弱点' },
  { key: 'kinks', label: '性癖' },
  { key: 'flaws', label: '缺陷/小毛病' },
  { key: 'habits', label: '习惯' },
  { key: 'other', label: '其他' },
] as const

export type SelfCardKey = (typeof SELF_CARD_SECTIONS)[number]['key']
export type SelfCard = Partial<Record<SelfCardKey, string>>
export type SelfCardVersion = { at: number; reason: string; card: SelfCard }

export const SELF_CARD_SECTION_MAX = 2000
export const SELF_CARD_TOTAL_MAX = 16000
export const SELF_CARD_HISTORY_MAX = 20

const ALIASES: Record<string, SelfCardKey> = {
  性格: 'personality',
  喜好: 'likes',
  爱好: 'likes',
  优点: 'strengths',
  弱点: 'weaknesses',
  性癖: 'kinks',
  缺陷: 'flaws',
  小毛病: 'flaws',
  '缺陷/小毛病': 'flaws',
  '缺陷／小毛病': 'flaws',
  习惯: 'habits',
  其他: 'other',
  其它: 'other',
}

export const isSelfCardKey = (value: unknown): value is SelfCardKey =>
  SELF_CARD_SECTIONS.some((item) => item.key === value)

export const selfCardLabel = (key: SelfCardKey | string) =>
  SELF_CARD_SECTIONS.find((item) => item.key === key)?.label || key

/** 栏目名（中文，容忍空格 / 全角斜杠 / 「」）→ key；不认识为 null。 */
export function selfCardSection(name: string): SelfCardKey | null {
  const clean = (name || '').replace(/[\s「」『』"“”]/g, '')
  return ALIASES[clean] || null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** 去空、每栏 ≤2000、总计 ≤16000（按栏目顺序，超出的截断）。 */
export function normalizeSelfCard(value: unknown): SelfCard {
  if (!isRecord(value)) return {}
  const out: SelfCard = {}
  let used = 0
  for (const { key } of SELF_CARD_SECTIONS) {
    const raw = typeof value[key] === 'string' ? (value[key] as string).trim() : ''
    if (!raw) continue
    const body = raw.slice(0, Math.min(SELF_CARD_SECTION_MAX, SELF_CARD_TOTAL_MAX - used)).trim()
    if (!body) continue
    out[key] = body
    used += body.length
  }
  return out
}

export function normalizeSelfCardHistory(value: unknown): SelfCardVersion[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((item) => ({
      at: Number(item.at) || 0,
      reason: typeof item.reason === 'string' ? item.reason.slice(0, 60) : '',
      card: normalizeSelfCard(item.card),
    }))
    .slice(-SELF_CARD_HISTORY_MAX)
}

export const selfCardLength = (card: SelfCard | undefined) =>
  Object.values(card || {}).reduce((sum, item) => sum + (item?.length || 0), 0)
export const selfCardIsEmpty = (card: SelfCard | undefined) => selfCardLength(card) === 0
const sameCard = (a: SelfCard, b: SelfCard) => SELF_CARD_SECTIONS.every(({ key }) => (a[key] || '') === (b[key] || ''))

export type SelfCardState = { card: SelfCard; history: SelfCardVersion[] }

/** 整卡替换；旧版本进历史（最新在末尾，最多 20 版）。内容没变就原样返回。 */
export function replaceSelfCard(state: SelfCardState, next: SelfCard, reason: string, now = Date.now()): SelfCardState {
  const previous = normalizeSelfCard(state.card)
  const card = normalizeSelfCard(next)
  if (sameCard(previous, card)) return state
  const history = [
    ...normalizeSelfCardHistory(state.history),
    { at: now, reason: reason.slice(0, 60), card: previous },
  ].slice(-SELF_CARD_HISTORY_MAX)
  return { card, history }
}

/** 改一栏：每栏 ≤2000，总计不超过 16000（超出部分截掉）。空内容 = 清空这一栏。 */
export function setSelfCardSection(
  state: SelfCardState,
  key: SelfCardKey,
  content: string,
  reason: string,
  now = Date.now(),
): SelfCardState {
  const current = normalizeSelfCard(state.card)
  const othersUsed = selfCardLength(current) - (current[key]?.length || 0)
  const room = Math.max(0, Math.min(SELF_CARD_SECTION_MAX, SELF_CARD_TOTAL_MAX - othersUsed))
  const body = (content || '').trim().slice(0, room).trim()
  const next: SelfCard = { ...current }
  if (body) next[key] = body
  else delete next[key]
  return replaceSelfCard(state, next, reason, now)
}

const when = (at: number) =>
  new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** 恢复到历史里的第 index 版；当前版本同样进历史，所以恢复也能撤回。 */
export function restoreSelfCard(state: SelfCardState, index: number, now = Date.now()): SelfCardState {
  const version = normalizeSelfCardHistory(state.history)[index]
  if (!version) return state
  return replaceSelfCard(state, version.card, `恢复到 ${when(version.at)} 的版本`, now)
}

// ---------- 标记 ----------

const OPEN = '[【［'
const CLOSE = '\\]】］'
const CONTENT_MAX = SELF_CARD_SECTION_MAX + 400
/** [自我卡:栏目|内容]，括号可混用，冒号 / 竖线全角半角都行，内容可以换行但不能含右括号。 */
const TAG_SRC = `[${OPEN}]\\s*自我卡\\s*[:：]\\s*([^|｜${CLOSE}\\n]{1,12}?)\\s*[|｜]([^${CLOSE}]{0,${CONTENT_MAX}})[${CLOSE}]`
/** 末尾写到一半的：「[」「【自」「[自我卡:喜」「[自我卡:喜好|还没写完…」 */
const PARTIAL = new RegExp(`[${OPEN}]\\s*(?:自(?:\\s*我(?:\\s*卡(?:\\s*[:：][^${CLOSE}]{0,${CONTENT_MAX + 100}})?)?)?)?$`)

export type SelfCardEdit = { key: SelfCardKey; content: string }

function tidy(text: string): string {
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 回复里最后一个有效的自我卡标记（栏目认得、内容非空）；最多认一个。 */
export function parseSelfCardTag(text: string): SelfCardEdit | null {
  let last: SelfCardEdit | null = null
  for (const match of (text || '').matchAll(new RegExp(TAG_SRC, 'g'))) {
    const key = selfCardSection(match[1] || '')
    const content = (match[2] || '').trim().slice(0, SELF_CARD_SECTION_MAX)
    if (key && content) last = { key, content }
  }
  return last
}

/** 回复收尾：取出最后一个有效标记，并把所有自我卡标记（含无效的）从正文去掉。 */
export function extractSelfCardTag(text: string): { clean: string; edit: SelfCardEdit | null } {
  if (!text || !/[[【［]\s*自我卡/.test(text)) return { clean: text, edit: null }
  return { clean: tidy(text.replace(new RegExp(TAG_SRC, 'g'), '')), edit: parseSelfCardTag(text) }
}

/** 只去掉标记（历史 / 记忆 / 摘要 / 索引 / 导出用），不动其余正文。 */
export function stripSelfCardTags(text: string): string {
  if (!text || !/[[【［]\s*自/.test(text)) return text
  const out = text.replace(new RegExp(TAG_SRC, 'g'), '').replace(PARTIAL, '')
  return out === text ? text : tidy(out)
}

/** 流式显示：完整标记和末尾写了一半的标记都藏起来（含「[」「【自」这种刚起头的）。 */
export function hideSelfCardWhileStreaming(text: string): string {
  if (!text) return text
  return text.replace(new RegExp(TAG_SRC, 'g'), '').replace(PARTIAL, '')
}

// ---------- 提示词 ----------

export const SELF_CARD_HEADING =
  '— 他自己补全的自己（他在相处中写下的，原卡为底，二者冲突时以这里更新的自我认知为准，但不改原卡的身份与背景事实） —'

/** 稳定第一条 system 里的自我卡（紧跟原卡）。只有他改卡 / 她改卡时才变。herName 是她的名字（惟惟）。 */
export function buildSelfCardPrompt(card: SelfCard | undefined, allowEdit: boolean, herName = '她'): string {
  const clean = normalizeSelfCard(card)
  const body = SELF_CARD_SECTIONS.filter(({ key }) => clean[key])
    .map(({ key, label }) => `【${label}】${clean[key]}`)
    .join('\n')
  const parts: string[] = []
  if (body) parts.push(`${SELF_CARD_HEADING}\n${body}`)
  if (allowEdit)
    parts.push(`【自我卡｜你可以慢慢补全自己】
${body ? '上面这份是你自己写的自我卡。' : '你还有一份空着的自我卡。'}栏目：性格、喜好、优点、弱点、性癖、缺陷/小毛病、习惯、其他。
只有在相处中你真的对自己有了新的认识时（偶尔，绝不是每轮），可以在回复最后单独一行写 [自我卡:栏目|这一栏改完后的全文]。第二段会整栏替换，所以要包含这一栏原有的内容，尽量小幅补充，不要推倒重写；每栏不超过 ${SELF_CARD_SECTION_MAX} 字。一次回复最多写一个。
这一行不会显示给${herName}，正文里不要提起或解释它；不要编造和原卡身份、背景事实相矛盾的内容。`)
  return parts.join('\n\n')
}
