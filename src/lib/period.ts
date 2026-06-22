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
