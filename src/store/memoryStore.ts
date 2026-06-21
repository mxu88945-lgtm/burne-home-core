/**
 * 记忆库状态管理（Zustand）。
 *
 * 这一轮提供「地基级」状态与动作（增删改查、标星、摘要聚合），
 * 数据持久化到 localStorage。具体页面交互（搜索/编辑面板等）第二轮接。
 */

import { create } from 'zustand'
import type {
  MemoryItem,
  MemorySummary,
  NewMemoryInput,
} from '@/types/memory'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS, CURRENT_WINDOW_ID } from '@/lib/constants'

interface MemoryState {
  memories: MemoryItem[]
  /** 记忆摘要概述（AI 生成或手写，单独持久化） */
  overview: string
  addMemory: (input: NewMemoryInput) => MemoryItem
  updateMemory: (id: string, patch: Partial<MemoryItem>) => void
  removeMemory: (id: string) => void
  toggleStar: (id: string) => void
  /** 整体替换（恢复备份用） */
  replaceAll: (memories: MemoryItem[]) => void
  setOverview: (text: string) => void
  getSummary: () => MemorySummary
}

function newId(): string {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `mem-${Date.now()}`
}

function persist(memories: MemoryItem[]) {
  writeJSON(STORAGE_KEYS.memories, memories)
}

/** 旧分类迁移：core→long，normal/auto→short */
function migrate(list: MemoryItem[]): MemoryItem[] {
  let changed = false
  const next = list.map((m) => {
    const k = m.kind as string
    if (k === 'long' || k === 'short') return m
    changed = true
    return { ...m, kind: k === 'core' ? 'long' : 'short' } as MemoryItem
  })
  if (changed) persist(next)
  return next
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  memories: migrate(readJSON<MemoryItem[]>(STORAGE_KEYS.memories, [])),
  overview: readJSON<string>(STORAGE_KEYS.memoryOverview, ''),

  addMemory: (input) => {
    const now = new Date().toISOString()
    const item: MemoryItem = {
      id: newId(),
      title: input.title,
      content: input.content,
      kind: input.kind ?? 'long',
      source: input.source ?? 'manual',
      starred: input.starred ?? false,
      tags: input.tags ?? [],
      windowId: input.windowId ?? CURRENT_WINDOW_ID,
      createdAt: now,
      updatedAt: now,
    }
    const next = [item, ...get().memories]
    persist(next)
    set({ memories: next })
    return item
  },

  updateMemory: (id, patch) => {
    const next = get().memories.map((m) =>
      m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m
    )
    persist(next)
    set({ memories: next })
  },

  removeMemory: (id) => {
    const next = get().memories.filter((m) => m.id !== id)
    persist(next)
    set({ memories: next })
  },

  toggleStar: (id) => {
    const next = get().memories.map((m) =>
      m.id === id ? { ...m, starred: !m.starred } : m
    )
    persist(next)
    set({ memories: next })
  },

  replaceAll: (memories) => {
    const next = migrate(memories)
    persist(next)
    set({ memories: next })
  },

  setOverview: (text) => {
    writeJSON(STORAGE_KEYS.memoryOverview, text)
    set({ overview: text })
  },

  getSummary: () => {
    const list = get().memories
    return {
      total: list.length,
      longCount: list.filter((m) => m.kind === 'long').length,
      shortCount: list.filter((m) => m.kind === 'short').length,
      lastUpdatedAt: list[0]?.updatedAt,
    }
  },
}))
