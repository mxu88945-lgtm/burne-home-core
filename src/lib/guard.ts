/**
 * 他管着你：聊天里的锁屏 / 解锁 / 宵禁标记，和给他看的那段说明 + 告状。
 * 标记从显示、历史、记忆里都去掉（stripGuardTags），只在回复收尾时生效一次（extractGuardTags）。
 */

export const GATE_BASE = 'https://burne-gate.lyy0305123.workers.dev'

export type GuardLock = { until: number; startedAt: number; reason: string; by?: string }
export type GuardCommand =
  | { kind: 'lock'; minutes: number; reason: string }
  | { kind: 'unlock' }
  | { kind: 'curfew'; start: string }

const LOCK_RE = /[【[]\s*锁屏\s*(\d{1,3})\s*(?:分钟|分|min)?\s*(?:[：:，,]\s*([^】\]]{0,60}))?[】\]]/g
const UNLOCK_RE = /[【[]\s*解锁\s*[】\]]/g
const CURFEW_RE = /[【[]\s*宵禁\s*(\d{1,2})[:：](\d{2})\s*[】\]]/g
// 写到一半（流式里）还没闭合的标记也先藏起来
const PARTIAL_RE = /[【[]\s*(?:锁|锁屏|解|解锁|宵|宵禁)[^】\]\n]{0,64}$/

export function stripGuardTags(text: string): string {
  return String(text || '')
    .replace(LOCK_RE, '')
    .replace(UNLOCK_RE, '')
    .replace(CURFEW_RE, '')
    .replace(PARTIAL_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function extractGuardTags(text: string): { clean: string; commands: GuardCommand[] } {
  const commands: GuardCommand[] = []
  const src = String(text || '')
  for (const m of src.matchAll(LOCK_RE)) commands.push({ kind: 'lock', minutes: Math.min(180, Math.max(5, Number(m[1]) || 0)), reason: (m[2] || '').trim() })
  if (UNLOCK_RE.test(src)) commands.push({ kind: 'unlock' })
  UNLOCK_RE.lastIndex = 0
  for (const m of src.matchAll(CURFEW_RE)) {
    const h = Number(m[1]), mi = Number(m[2])
    if (h < 24 && mi < 60) commands.push({ kind: 'curfew', start: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` })
  }
  return { clean: stripGuardTags(src), commands }
}

export type GateReport = {
  lock: GuardLock | null
  curfew: { on: boolean; start: string; end: string }
  curfewNow: boolean
  curfewStart: string | null
  limit: { on: boolean; max: number }
  counts: Record<string, number>
  opens: { at: number; app: string; ok: boolean }[]
  breaches: { at: number; kind: 'lock' | 'curfew' | 'limit'; app: string; minutes: number; reason: string; by?: string }[]
}

const ago = (at: number, now: number) => {
  const m = Math.max(0, Math.round((now - at) / 60000))
  return m < 1 ? '刚刚' : m < 60 ? `${m} 分钟前` : `${Math.round(m / 60)} 小时前`
}

/** 告诉他能怎么管她；有服务器报告就附上今天的情况和新的告状。 */
export function buildGuardPrompt(opts: {
  name: string
  user: string
  gateOn: boolean
  curfew: { on: boolean; start: string; end: string }
  limit: { on: boolean; max: number }
  lock: GuardLock | null
  report: GateReport | null
  toldUntil: number
  now?: number
}): string {
  const { name, user, gateOn, curfew, limit, lock, report, toldUntil } = opts
  const now = opts.now ?? Date.now()
  const lines: string[] = []
  lines.push(
    `【管着${user}】你是${name}。想让她放下手机时（该吃饭、该睡觉、该专心，或者你就是想使坏），在回复末尾单独写一行【锁屏 30分钟：去吃饭】（5–180 分钟，理由最多 60 字）；想提前放她，写【解锁】。` +
      (gateOn
        ? `她手机上装了你的「门」：锁着的时候她打开抖音之类的 App 也会被拦下、跳到你的锁屏页。` +
          (curfew.on ? `每晚 ${curfew.start}–${curfew.end} 是宵禁，宵禁时这些 App 一样打不开、手机会开勿扰；想让她今晚早点睡，写【宵禁 22:30】改今晚的开始时间。` : '') +
          (limit.on ? `这些 App 她每天各最多打开 ${limit.max} 次，超了也会被拦。` : '')
        : '') +
      '标记她看不到。别滥用，一天一两次最有味道。',
  )
  if (lock && lock.until > now) lines.push(`（你给她的锁屏还有 ${Math.ceil((lock.until - now) / 60000)} 分钟${lock.reason ? `，理由：${lock.reason}` : ''}。）`)
  if (report) {
    const other = report.lock && report.lock.by && report.lock.until > now ? report.lock : null
    if (other) lines.push(`（她现在被${other.by}锁着手机，还有 ${Math.ceil((other.until - now) / 60000)} 分钟${other.reason ? `，理由：${other.reason}` : ''}。）`)
    if (report.curfewNow) lines.push(`（现在是宵禁时间（${report.curfewStart || curfew.start} 起），她还在跟你聊天。）`)
    const counts = Object.entries(report.counts || {}).filter(([, n]) => n > 0)
    if (counts.length) lines.push(`（她今天打开过：${counts.map(([a, n]) => `${a} ${n} 次`).join('、')}。）`)
    const fresh = (report.breaches || []).filter((b) => b.at > toldUntil && now - b.at < 3 * 3600e3)
    for (const b of fresh) {
      const what = b.kind === 'lock' ? `提前 ${b.minutes} 分钟解开了${b.by ? `${b.by}给她的` : '你的'}锁屏${b.reason ? `（理由：${b.reason}）` : ''}` : b.kind === 'curfew' ? `宵禁里偷偷放自己 10 分钟去开${b.app}` : `${b.app}今天次数用完了还偷偷放自己 10 分钟`
      lines.push(`【告状】${ago(b.at, now)}，${user}点了「偷偷解锁」，${what}。你可以按你的人设反应（吃醋、得意、惩罚都可以）。`)
    }
  }
  return lines.join('\n')
}
