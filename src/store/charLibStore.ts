/**
 * 角色库（Zustand，本地持久化）：独立、可复用的角色卡仓库。
 * 导入/新建的角色都进这里；不属于任何对话。
 * 从库里选 1 个角色 → 开 1v1；进对话后可「加成员」变群聊。
 * 安全：只存角色内容，全在本设备。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import type { LoreEntry } from '@/store/dramaStore'

export interface LibChar {
  id: string
  name: string
  /** 头像 emoji */
  avatar: string
  /** 头像图片 dataURL（优先） */
  avatarImg?: string
  /** 人设 / 设定 */
  persona: string
  /** 开场白（开 1v1 时作为出场第一条） */
  greeting?: string
  /** 气泡色 hex */
  color: string
  /** 独立 API 渠道 id（不填＝跟随激活渠道） */
  apiChannelId?: string
  /** 随角色卡带来的世界书 */
  lore?: LoreEntry[]
  createdAt: string
}

const PALETTE = ['#7aa2f7', '#bb9af7', '#f7768e', '#73d39b', '#e0af68', '#ff9e64', '#2ac3de']

function uid(): string {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `lc-${Date.now()}-${Math.random()}`
}

interface State {
  chars: LibChar[]
  addChar: (c: Partial<LibChar>) => LibChar
  updateChar: (id: string, patch: Partial<LibChar>) => void
  removeChar: (id: string) => void
}

const init = readJSON<{ chars?: LibChar[] }>(STORAGE_KEYS.charLib, {})

export const useCharLibStore = create<State>((set, get) => {
  const persist = (chars: LibChar[]) => writeJSON(STORAGE_KEYS.charLib, { chars })
  return {
    chars: init.chars || [],

    addChar: (c) => {
      const char: LibChar = {
        id: uid(),
        name: c.name?.trim() || '新角色',
        avatar: c.avatar || '🎭',
        avatarImg: c.avatarImg,
        persona: c.persona || '',
        greeting: c.greeting || '',
        color: c.color || PALETTE[get().chars.length % PALETTE.length],
        apiChannelId: c.apiChannelId,
        lore: c.lore,
        createdAt: new Date().toISOString(),
      }
      const chars = [char, ...get().chars]
      persist(chars)
      set({ chars })
      return char
    },

    updateChar: (id, patch) => {
      const chars = get().chars.map((c) => (c.id === id ? { ...c, ...patch } : c))
      persist(chars)
      set({ chars })
    },

    removeChar: (id) => {
      const chars = get().chars.filter((c) => c.id !== id)
      persist(chars)
      set({ chars })
    },
  }
})
