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
  /** 回复里显示链接来源（默认关：隐藏联网引用的域名链接） */
  showLinks: boolean
  /** 允许 TA 给我下带倒计时的小任务/提醒 */
  allowTasks: boolean
}

const DEFAULT: ChatPrefs = {
  webSearch: false,
  autoMemory: false,
  chatStyle: 'bubble',
  showLinks: false,
  allowTasks: false,
}

interface ChatPrefsState extends ChatPrefs {
  toggleWebSearch: () => void
  toggleAutoMemory: () => void
  setChatStyle: (s: ChatStyle) => void
  toggleShowLinks: () => void
  toggleAllowTasks: () => void
}

const init = { ...DEFAULT, ...readJSON<Partial<ChatPrefs>>(STORAGE_KEYS.chatprefs, {}) }

export const useChatPrefsStore = create<ChatPrefsState>((set, get) => ({
  webSearch: init.webSearch,
  autoMemory: init.autoMemory,
  chatStyle: init.chatStyle,
  showLinks: init.showLinks,
  allowTasks: init.allowTasks,
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
  toggleShowLinks: () => {
    const showLinks = !get().showLinks
    writeJSON(STORAGE_KEYS.chatprefs, { ...pick(get()), showLinks })
    set({ showLinks })
  },
  toggleAllowTasks: () => {
    const allowTasks = !get().allowTasks
    writeJSON(STORAGE_KEYS.chatprefs, { ...pick(get()), allowTasks })
    set({ allowTasks })
  },
}))

function pick(s: ChatPrefsState): ChatPrefs {
  return {
    webSearch: s.webSearch,
    autoMemory: s.autoMemory,
    chatStyle: s.chatStyle,
    showLinks: s.showLinks,
    allowTasks: s.allowTasks,
  }
}
