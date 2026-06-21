/**
 * 聊天偏好（Zustand，本地持久化）：联网查询、自动沉淀记忆。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

interface ChatPrefs {
  /** 联网查询（OpenRouter 走 model:online） */
  webSearch: boolean
  /** 自动沉淀记忆：每轮让 AI 判断有无值得长期记住的，自动存入记忆库 */
  autoMemory: boolean
}

const DEFAULT: ChatPrefs = { webSearch: false, autoMemory: false }

interface ChatPrefsState extends ChatPrefs {
  toggleWebSearch: () => void
  toggleAutoMemory: () => void
}

const init = { ...DEFAULT, ...readJSON<Partial<ChatPrefs>>(STORAGE_KEYS.chatprefs, {}) }

function save(s: ChatPrefs) {
  writeJSON(STORAGE_KEYS.chatprefs, s)
}

export const useChatPrefsStore = create<ChatPrefsState>((set, get) => ({
  webSearch: init.webSearch,
  autoMemory: init.autoMemory,
  toggleWebSearch: () => {
    const next = { webSearch: !get().webSearch, autoMemory: get().autoMemory }
    save(next)
    set({ webSearch: next.webSearch })
  },
  toggleAutoMemory: () => {
    const next = { webSearch: get().webSearch, autoMemory: !get().autoMemory }
    save(next)
    set({ autoMemory: next.autoMemory })
  },
}))
