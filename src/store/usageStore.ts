/**
 * 用量统计（Zustand，本地持久化）。
 * 每次聊天调用记一条：模型、token、花费（OpenRouter 含真实 cost）。
 * 仅存本地，不上云。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface UsageEntry {
  at: string // ISO
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** 美元花费，若服务商返回则有（OpenRouter） */
  cost?: number
}

const MAX_ENTRIES = 1000

interface UsageState {
  entries: UsageEntry[]
  add: (e: UsageEntry) => void
  clear: () => void
}

export const useUsageStore = create<UsageState>((set, get) => ({
  entries: readJSON<UsageEntry[]>(STORAGE_KEYS.usage, []),
  add: (e) => {
    const next = [e, ...get().entries].slice(0, MAX_ENTRIES)
    writeJSON(STORAGE_KEYS.usage, next)
    set({ entries: next })
  },
  clear: () => {
    writeJSON(STORAGE_KEYS.usage, [])
    set({ entries: [] })
  },
}))
