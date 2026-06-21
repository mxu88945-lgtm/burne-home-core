/**
 * 聊天记录（Zustand，本地持久化）——多会话。
 * 退出/刷新都保留；只存本设备 localStorage。旧的单会话数据会自动迁移成第一个会话。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface ChatMsg {
  id: string
  role: 'me' | 'companion'
  text: string
  at: string
  /** 图片（压缩后的 dataURL，只存本地） */
  image?: string
  /** 这条 AI 回复消耗的总 token（有就显示） */
  tokens?: number
  /** 思考过程（开启 reasoning 时，折叠展示） */
  reasoning?: string
  /** 文件附件（只存本地） */
  file?: {
    name: string
    size: number
    /** dataURL，用于下载 */
    url: string
    /** 文本类文件的内容（会一起发给模型；二进制文件不存） */
    text?: string
  }
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMsg[]
  createdAt: string
  updatedAt: string
}

function uid(prefix: string) {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`
}
function nowLabel() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
function welcome(): ChatMsg {
  return { id: uid('msg'), role: 'companion', text: '欢迎回家呀～有什么想跟我说的吗？♡', at: nowLabel() }
}
function freshSession(): ChatSession {
  const t = new Date().toISOString()
  return { id: uid('chat'), title: '新对话', messages: [welcome()], createdAt: t, updatedAt: t }
}

const DEFAULT_TITLE = '新对话'

interface Persisted {
  sessions: ChatSession[]
  activeId: string
}

function load(): Persisted {
  const raw = readJSON<unknown>(STORAGE_KEYS.chat, null)
  // 新结构
  if (raw && typeof raw === 'object' && Array.isArray((raw as Persisted).sessions)) {
    const p = raw as Persisted
    if (p.sessions.length) return { sessions: p.sessions, activeId: p.activeId || p.sessions[0].id }
  }
  // 旧结构：单会话 ChatMsg[]
  if (Array.isArray(raw) && raw.length) {
    const t = new Date().toISOString()
    const s: ChatSession = { id: uid('chat'), title: '对话', messages: raw as ChatMsg[], createdAt: t, updatedAt: t }
    return { sessions: [s], activeId: s.id }
  }
  const s = freshSession()
  return { sessions: [s], activeId: s.id }
}

interface ChatState {
  sessions: ChatSession[]
  activeId: string
  setMessages: (m: ChatMsg[] | ((prev: ChatMsg[]) => ChatMsg[])) => void
  createSession: () => void
  switchSession: (id: string) => void
  removeSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  /** 若标题仍是默认，则用首句话自动命名 */
  autoTitle: (text: string) => void
}

const init = load()

function persist(sessions: ChatSession[], activeId: string) {
  writeJSON(STORAGE_KEYS.chat, { sessions, activeId })
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: init.sessions,
  activeId: init.activeId,

  setMessages: (m) => {
    const { sessions, activeId } = get()
    const next = sessions.map((s) => {
      if (s.id !== activeId) return s
      const messages = typeof m === 'function' ? m(s.messages) : m
      return { ...s, messages, updatedAt: new Date().toISOString() }
    })
    persist(next, activeId)
    set({ sessions: next })
  },

  createSession: () => {
    const s = freshSession()
    const sessions = [s, ...get().sessions]
    persist(sessions, s.id)
    set({ sessions, activeId: s.id })
  },

  switchSession: (id) => {
    if (!get().sessions.some((s) => s.id === id)) return
    persist(get().sessions, id)
    set({ activeId: id })
  },

  removeSession: (id) => {
    let sessions = get().sessions.filter((s) => s.id !== id)
    if (!sessions.length) sessions = [freshSession()]
    const activeId = get().activeId === id ? sessions[0].id : get().activeId
    persist(sessions, activeId)
    set({ sessions, activeId })
  },

  renameSession: (id, title) => {
    const t = title.trim()
    if (!t) return
    const sessions = get().sessions.map((s) => (s.id === id ? { ...s, title: t } : s))
    persist(sessions, get().activeId)
    set({ sessions })
  },

  autoTitle: (text) => {
    const { sessions, activeId } = get()
    const cur = sessions.find((s) => s.id === activeId)
    if (!cur || cur.title !== DEFAULT_TITLE) return
    const title = text.trim().slice(0, 16) || DEFAULT_TITLE
    const next = sessions.map((s) => (s.id === activeId ? { ...s, title } : s))
    persist(next, activeId)
    set({ sessions: next })
  },
}))
