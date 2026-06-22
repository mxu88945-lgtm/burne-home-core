/**
 * 生理期记录（Zustand，本地持久化）。
 * 只存经期日期集合 + 是否注入聊天；预测全部由 lib/period 计算。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import { addDays } from '@/lib/period'

interface Persisted {
  days: string[]
  inject: boolean
  /** 一次经期一般持续几天（点开始日时自动标这么多天） */
  periodLen: number
}

const DEFAULT: Persisted = { days: [], inject: true, periodLen: 5 }
const init = { ...DEFAULT, ...readJSON<Partial<Persisted>>(STORAGE_KEYS.period, {}) }

interface PeriodState extends Persisted {
  /** 点某天：若该天已是经期则取消其所在整段，否则从该天起标 periodLen 天 */
  markFrom: (date: string) => void
  setPeriodLen: (n: number) => void
  toggleInject: () => void
}

function persist(s: Persisted) {
  writeJSON(STORAGE_KEYS.period, s)
}

/** 找出包含 date 的连续整段（升序日期数组） */
function runOf(daysSet: Set<string>, date: string): string[] {
  if (!daysSet.has(date)) return []
  const run = [date]
  let p = addDays(date, -1)
  while (daysSet.has(p)) {
    run.unshift(p)
    p = addDays(p, -1)
  }
  let n = addDays(date, 1)
  while (daysSet.has(n)) {
    run.push(n)
    n = addDays(n, 1)
  }
  return run
}

export const usePeriodStore = create<PeriodState>((set, get) => ({
  days: init.days,
  inject: init.inject,
  periodLen: init.periodLen,

  markFrom: (date) => {
    const cur = new Set(get().days)
    let days: string[]
    if (cur.has(date)) {
      // 取消整段
      const run = new Set(runOf(cur, date))
      days = get().days.filter((d) => !run.has(d))
    } else {
      // 从该天起标 periodLen 天
      const add: string[] = []
      for (let i = 0; i < get().periodLen; i++) add.push(addDays(date, i))
      days = Array.from(new Set([...get().days, ...add])).sort()
    }
    persist({ days, inject: get().inject, periodLen: get().periodLen })
    set({ days })
  },

  setPeriodLen: (n) => {
    const periodLen = Math.max(2, Math.min(10, Math.round(n) || 5))
    persist({ days: get().days, inject: get().inject, periodLen })
    set({ periodLen })
  },

  toggleInject: () => {
    const inject = !get().inject
    persist({ days: get().days, inject, periodLen: get().periodLen })
    set({ inject })
  },
}))
