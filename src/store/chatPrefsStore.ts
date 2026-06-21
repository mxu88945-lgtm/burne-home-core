/**
 * 聊天偏好（Zustand，本地持久化）：联网查询、自动沉淀记忆、对话样式。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export type ChatStyle = 'bubble' | 'flat'

interface ChatPrefs {
  /** 联网查询（OpenRouter 走 model:online） */
  webSearch: boolean
  /** 自动沉淀记忆：每轮让 AI 判断有无值得长期记住的，自动存入记忆库 */
  autoMemory: boolean
  /** 对话样式：气泡式 / 平铺式（头像名字在上、无气泡、文字铺满） */
  chatStyle: ChatStyle
}

const DEFAULT: ChatPrefs = { webSearch: false, autoMemory: false, chatStyle: 'bubble' }

interface ChatPrefsState extends ChatPrefs {
  toggleWebSearch: () => void
  toggleAutoMemory: () => void
  setChatStyle: (s: ChatStyle) => void
}

const init = { ...DEFAULT, ...readJSON<Partial<ChatPrefs>>(STORAGE_KEYS.chatprefs, {}) }

export const useChatPrefsStore = create<ChatPrefsState>((set, get) => ({
  webSearch: init.webSearch,
  autoMemory: init.autoMemory,
  chatStyle: init.chatStyle,
  toggleWebSearch: () => {
    const webSearch = !get().webSearch
    writeJSON(STORAGE_KEYS.chatprefs, { ...pick(get()), webSearch })
    set({ webSearch })
  },
  toggleAutoMemory: () => {
    const autoMemory = !get().autoMemory
    writeJSON(STORAGE_KEYS.chatprefs, { ...pick(get()), autoMemory })
    set({ autoMemory })
  },
  setChatStyle: (chatStyle) => {
    writeJSON(STORAGE_KEYS.chatprefs, { ...pick(get()), chatStyle })
    set({ chatStyle })
  },
}))

function pick(s: ChatPrefsState): ChatPrefs {
  return { webSearch: s.webSearch, autoMemory: s.autoMemory, chatStyle: s.chatStyle }
}
