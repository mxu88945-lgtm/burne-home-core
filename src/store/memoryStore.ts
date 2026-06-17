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
  addMemory: (input: NewMemoryInput) => MemoryItem
  updateMemory: (id: string, patch: Partial<MemoryItem>) => void
  removeMemory: (id: string) => void
  toggleStar: (id: string) => void
  /** 整体替换（恢复备份用） */
  replaceAll: (memories: MemoryItem[]) => void
  getSummary: () => MemorySummary
}

function newId(): string {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `mem-${Date.now()}`
}

function persist(memories: MemoryItem[]) {
  writeJSON(STORAGE_KEYS.memories, memories)
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  memories: readJSON<MemoryItem[]>(STORAGE_KEYS.memories, []),

  addMemory: (input) => {
    const now = new Date().toISOString()
    const item: MemoryItem = {
      id: newId(),
      title: input.title,
      content: input.content,
      kind: input.kind ?? 'normal',
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
    persist(memories)
    set({ memories })
  },

  getSummary: () => {
    const list = get().memories
    return {
      total: list.length,
      coreCount: list.filter((m) => m.kind === 'core' || m.starred).length,
      normalCount: list.filter((m) => m.kind === 'normal').length,
      autoCount: list.filter((m) => m.kind === 'auto').length,
      lastUpdatedAt: list[0]?.updatedAt,
    }
  },
}))
