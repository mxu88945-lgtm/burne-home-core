/**
 * 生理期记录（Zustand，本地持久化）。
 * 只存经期日期集合 + 是否注入聊天；预测全部由 lib/period 计算。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

interface Persisted {
  days: string[]
  inject: boolean
  /** 一次经期一般持续几天（仅用于预测下次经期长度；不会自动标记） */
  periodLen: number
}

const DEFAULT: Persisted = { days: [], inject: true, periodLen: 5 }
const init = { ...DEFAULT, ...readJSON<Partial<Persisted>>(STORAGE_KEYS.period, {}) }

interface PeriodState extends Persisted {
  /** 点某天：只标/取消这一天（纯手动，只记你实际来的日子） */
  markFrom: (date: string) => void
  setPeriodLen: (n: number) => void
  toggleInject: () => void
}

function persist(s: Persisted) {
  writeJSON(STORAGE_KEYS.period, s)
}

export const usePeriodStore = create<PeriodState>((set, get) => ({
  days: init.days,
  inject: init.inject,
  periodLen: init.periodLen,

  markFrom: (date) => {
    // 单天开关：点一下记这天、再点取消；不再自动往后标一整段
    const cur = new Set(get().days)
    if (cur.has(date)) cur.delete(date)
    else cur.add(date)
    const days = Array.from(cur).sort()
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
