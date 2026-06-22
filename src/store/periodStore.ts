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
}

const DEFAULT: Persisted = { days: [], inject: true }
const init = { ...DEFAULT, ...readJSON<Partial<Persisted>>(STORAGE_KEYS.period, {}) }

interface PeriodState extends Persisted {
  toggleDay: (date: string) => void
  toggleInject: () => void
}

function persist(days: string[], inject: boolean) {
  writeJSON(STORAGE_KEYS.period, { days, inject })
}

export const usePeriodStore = create<PeriodState>((set, get) => ({
  days: init.days,
  inject: init.inject,
  toggleDay: (date) => {
    const has = get().days.includes(date)
    const days = has ? get().days.filter((d) => d !== date) : [...get().days, date].sort()
    persist(days, get().inject)
    set({ days })
  },
  toggleInject: () => {
    const inject = !get().inject
    persist(get().days, inject)
    set({ inject })
  },
}))
