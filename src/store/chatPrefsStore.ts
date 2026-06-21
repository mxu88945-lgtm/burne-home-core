/**
 * 聊天偏好（Zustand，本地持久化）：目前为「联网查询」开关。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

interface ChatPrefs {
  /** 联网查询（OpenRouter 走 model:online，让模型能查实时信息/新闻） */
  webSearch: boolean
}

const DEFAULT: ChatPrefs = { webSearch: false }

interface ChatPrefsState extends ChatPrefs {
  toggleWebSearch: () => void
}

const init = { ...DEFAULT, ...readJSON<Partial<ChatPrefs>>(STORAGE_KEYS.chatprefs, {}) }

export const useChatPrefsStore = create<ChatPrefsState>((set, get) => ({
  webSearch: init.webSearch,
  toggleWebSearch: () => {
    const webSearch = !get().webSearch
    writeJSON(STORAGE_KEYS.chatprefs, { webSearch })
    set({ webSearch })
  },
}))
