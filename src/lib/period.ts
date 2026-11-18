/**
 * 生理期计算工具（纯本地、纯函数）。
 * 用「经期日期集合」derive 出分组、平均周期/经期、预测下次与排卵。
 */

function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function toStr(dt: Date): string {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
export function addDays(s: string, n: number): string {
  const dt = toDate(s)
  dt.setDate(dt.getDate() + n)
  return toStr(dt)
}
export function diffDays(a: string, b: string): number {
  return Math.round((toDate(a).getTime() - toDate(b).getTime()) / 86400000)
}
export function todayStr(): string {
  return toStr(new Date())
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

/** 把经期日期按「连续」分组（每段为一次经期），升序 */
export function groupPeriods(days: string[]): string[][] {
  const sorted = Array.from(new Set(days)).sort()
  const groups: string[][] = []
  for (const d of sorted) {
    const last = groups[groups.length - 1]
    if (last && diffDays(d, last[last.length - 1]) === 1) last.push(d)
    else groups.push([d])
  }
  return groups
}

export interface PeriodStat {
  hasData: boolean
  avgCycle: number
  avgLen: number
  /** 今天是经期第几天（1 起；非经期为 null） */
  todayDay: number | null
  /** 距下次经期还有几天（>=0；无数据 null） */
  daysUntilNext: number | null
  /** 预测下次经期开始日 yyyy-mm-dd */
  nextStart: string | null
  /** 预测排卵日 */
  ovulation: string | null
}

export function computeStat(days: string[], periodLen?: number): PeriodStat {
  const g = groupPeriods(days)
  const starts = g.map((x) => x[0])
  let avgCycle = 28
  if (starts.length >= 2) {
    let s = 0
    for (let i = 1; i < starts.length; i++) s += diffDays(starts[i], starts[i - 1])
    avgCycle = clamp(Math.round(s / (starts.length - 1)), 21, 45)
  }
  // 用户设了经期天数就用它；否则按记录平均
  let avgLen = periodLen && periodLen > 0 ? periodLen : 5
  if (!periodLen && g.length)
    avgLen = clamp(Math.round(g.reduce((a, x) => a + x.length, 0) / g.length), 2, 10)

  const today = todayStr()
  let todayDay: number | null = null
  for (const grp of g) {
    if (grp.includes(today)) {
      todayDay = diffDays(today, grp[0]) + 1
      break
    }
  }

  const lastStart = starts.length ? starts[starts.length - 1] : null
  let nextStart = lastStart ? addDays(lastStart, avgCycle) : null
  if (nextStart) while (diffDays(nextStart, today) < 0) nextStart = addDays(nextStart, avgCycle)
  const daysUntilNext = nextStart ? diffDays(nextStart, today) : null
  const ovulation = nextStart ? addDays(nextStart, -14) : null

  return {
    hasData: starts.length > 0,
    avgCycle,
    avgLen,
    todayDay,
    daysUntilNext,
    nextStart,
    ovulation,
  }
}

/** 某天是否落在「预测的下次经期」范围 */
export function isPredictedPeriod(date: string, stat: PeriodStat): boolean {
  if (!stat.nextStart) return false
  const d = diffDays(date, stat.nextStart)
  return d >= 0 && d < stat.avgLen
}

export interface CycleRecord {
  /** 这次经期开始日 */
  start: string
  /** 这次经期结束日 */
  end: string
  /** 持续天数 */
  len: number
  /** 距上一次经期开始的间隔（周期天数）；最早一条为 null */
  cycle: number | null
}

/** 最近 n 次经期记录（最新在前），含每次持续天数与周期间隔 */
export function recentCycles(days: string[], n = 4): CycleRecord[] {
  const g = groupPeriods(days)
  const recs: CycleRecord[] = g.map((grp, i) => ({
    start: grp[0],
    end: grp[grp.length - 1],
    len: grp.length,
    cycle: i > 0 ? diffDays(grp[0], g[i - 1][0]) : null,
  }))
  return recs.reverse().slice(0, n)
}

/** 给聊天注入的生理期关心提示（无则空串） */
export function periodChatNote(days: string[], name: string, periodLen?: number): string {
  const st = computeStat(days, periodLen)
  if (!st.hasData) return ''
  if (st.todayDay)
    return `（${name}正处在生理期第 ${st.todayDay} 天，可能小腹不适、容易累或情绪敏感。请你格外体贴温柔地关心她，自然地提醒她喝热水、别吃凉的、早点休息，别让她劳累。不要生硬说教。）`
  if (st.daysUntilNext != null && st.daysUntilNext <= 3)
    return `（${name}的生理期预计还有 ${st.daysUntilNext} 天到，可以提前温柔关心、提醒她注意休息和保暖。)`
  return ''
}

/** 开着的这次经期最多自动数这么多天；过了还没点「结束」多半是忘了，按经期天数收尾。 */
export const OPEN_PERIOD_LIMIT = 14

/**
 * 点了「今天来了」还没点「结束」的那一段，今天算到哪几天。
 * 超过 OPEN_PERIOD_LIMIT 天就当忘了点结束，按 periodLen 收尾（closed=true）。
 */
export function openPeriodDays(openStart: string | null, today: string, periodLen = 5): { days: string[]; closed: boolean } {
  if (!openStart) return { days: [], closed: false }
  const span = diffDays(today, openStart)
  if (span < 0) return { days: [openStart], closed: false }
  const closed = span >= OPEN_PERIOD_LIMIT
  const count = closed ? Math.max(1, periodLen) : span + 1
  return { days: Array.from({ length: count }, (_, i) => addDays(openStart, i)), closed }
}

/** 从 a 到 b（含两头）的每一天。 */
export function dayRange(a: string, b: string): string[] {
  const n = diffDays(b, a)
  if (n < 0) return [a]
  return Array.from({ length: n + 1 }, (_, i) => addDays(a, i))
}
