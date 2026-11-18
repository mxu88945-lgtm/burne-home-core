/**
 * 生理期记录（Zustand，本地持久化）。
 * 跟惟境一样：点「今天来了」开始一次，之后每天自动往后数，点「今天结束了」收尾；
 * 日历上单点某天仍可补记/取消。预测全部由 lib/period 计算。
 * 存：手动/已收尾的日期 days + 进行中的开始日 openStart；对外的 days 是两者合起来的。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import { addDays, dayRange, openPeriodDays, todayStr } from '@/lib/period'

interface Persisted {
  days: string[]
  inject: boolean
  /** 一次经期一般持续几天（预测下次、忘点结束时按它收尾） */
  periodLen: number
  /** 进行中这次的开始日（点了「今天来了」还没点结束）；没有则 null */
  openStart: string | null
}

const DEFAULT: Persisted = { days: [], inject: true, periodLen: 5, openStart: null }

/** 把超时的进行中经期收尾进 days。 */
function settle(p: Persisted, today = todayStr()): Persisted {
  const open = openPeriodDays(p.openStart, today, p.periodLen)
  if (!open.closed) return p
  return { ...p, days: Array.from(new Set([...p.days, ...open.days])).sort(), openStart: null }
}

function effectiveDays(p: Persisted, today = todayStr()): string[] {
  const open = openPeriodDays(p.openStart, today, p.periodLen)
  return open.days.length ? Array.from(new Set([...p.days, ...open.days])).sort() : p.days
}

const loaded = settle({ ...DEFAULT, ...readJSON<Partial<Persisted>>(STORAGE_KEYS.period, {}) })

interface PeriodState {
  /** 实际经期日期（含进行中自动数到今天的） */
  days: string[]
  /** 只存手动/已收尾的日期 */
  savedDays: string[]
  inject: boolean
  periodLen: number
  openStart: string | null
  /** 今天来了：开始一次，之后自动往后数 */
  startToday: () => void
  /** 今天结束了：把这次收尾到今天 */
  endToday: () => void
  /** 点日历某天：补记/取消这一天（进行中的那段先收尾到今天再改） */
  markFrom: (date: string) => void
  setPeriodLen: (n: number) => void
  toggleInject: () => void
  /** 跨天/回到前台时重算 */
  refresh: () => void
}

export const usePeriodStore = create<PeriodState>((set, get) => {
  const current = (): Persisted => ({ days: get().savedDays, inject: get().inject, periodLen: get().periodLen, openStart: get().openStart })
  const commit = (next: Persisted) => {
    const p = settle(next)
    writeJSON(STORAGE_KEYS.period, p)
    set({ savedDays: p.days, days: effectiveDays(p), inject: p.inject, periodLen: p.periodLen, openStart: p.openStart })
  }
  return {
    days: effectiveDays(loaded),
    savedDays: loaded.days,
    inject: loaded.inject,
    periodLen: loaded.periodLen,
    openStart: loaded.openStart,

    startToday: () => {
      const today = todayStr()
      const p = current()
      if (p.openStart) return
      // 昨天还记着经期（比如手动点过），就接着那段往后数
      let start = today
      while (p.days.includes(addDays(start, -1))) start = addDays(start, -1)
      const days = p.days.filter((d) => d < start)
      commit({ ...p, days, openStart: start })
    },

    endToday: () => {
      const today = todayStr()
      const p = current()
      if (!p.openStart) return
      const range = dayRange(p.openStart, today)
      commit({ ...p, days: Array.from(new Set([...p.days, ...range])).sort(), openStart: null })
    },

    markFrom: (date) => {
      let p = current()
      if (p.openStart && date >= p.openStart) {
        // 动到进行中这段：先把它收尾到今天，再按单天改
        const range = openPeriodDays(p.openStart, todayStr(), p.periodLen).days
        p = { ...p, days: Array.from(new Set([...p.days, ...range])).sort(), openStart: null }
      }
      const cur = new Set(p.days)
      if (cur.has(date)) cur.delete(date)
      else cur.add(date)
      commit({ ...p, days: Array.from(cur).sort() })
    },

    setPeriodLen: (n) => {
      const periodLen = Math.max(2, Math.min(10, Math.round(n) || 5))
      commit({ ...current(), periodLen })
    },

    toggleInject: () => {
      commit({ ...current(), inject: !get().inject })
    },

    refresh: () => commit(current()),
  }
})

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') usePeriodStore.getState().refresh()
  })
}
