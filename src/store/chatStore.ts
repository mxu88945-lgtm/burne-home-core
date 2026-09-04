/**
 * 聊天记录（Zustand，本地持久化）——多会话。
 * 退出/刷新都保留；只存本设备 localStorage。旧的单会话数据会自动迁移成第一个会话。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import { isFailedTransportMessage } from '@/lib/chatTransportError'

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
  /** 思考耗时（ms）：流式思考结束→出正文时记录，收起后显示「深度思考 (x.xs)」 */
  thinkMs?: number
  /** 文件附件（只存本地） */
  file?: {
    name: string
    size: number
    /** dataURL，用于下载 */
    url: string
    /** 文本类文件的内容（会一起发给模型；二进制文件不存） */
    text?: string
  }
  /** TA 下的任务（带倒计时，嵌在对话里） */
  task?: {
    text: string
    minutes: number
    /** 起始时间戳 ms */
    startedAt: number
    /** 截止时间戳 ms */
    deadline: number
    status: 'active' | 'done' | 'cancelled'
    /** 完成时间戳 ms */
    doneAt?: number
  }
}

/** Rolling context summary used only when building the next API request. */
export interface ChatContextSummary {
  text: string
  /** The last raw message represented by this summary. */
  coveredThroughId: string
  updatedAt: string
  version: number
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMsg[]
  /** Raw messages remain intact; this is a separate, replaceable API aid. */
  contextSummary?: ChatContextSummary
  createdAt: string
  updatedAt: string
}

function uid(prefix: string) {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`
}
function freshSession(): ChatSession {
  const t = new Date().toISOString()
  return { id: uid('chat'), title: '新对话', messages: [], createdAt: t, updatedAt: t }
}

const DEFAULT_TITLE = '新对话'

interface Persisted {
  sessions: ChatSession[]
  activeId: string
}

function load(): Persisted {
  const raw = readJSON<unknown>(STORAGE_KEYS.chat, null)
  // 新结构。activeId 为空（''）= 空白新对话，尚未落库
  if (raw && typeof raw === 'object' && Array.isArray((raw as Persisted).sessions)) {
    const p = raw as Persisted
    const validActive = p.activeId && p.sessions.some((s) => s.id === p.activeId) ? p.activeId : ''
    return {
      sessions: p.sessions.map((session) => ({
        ...session,
        messages: session.messages.filter((message) => !isFailedTransportMessage(message)),
      })),
      activeId: validActive,
    }
  }
  // 旧结构：单会话 ChatMsg[]
  if (Array.isArray(raw) && raw.length) {
    const t = new Date().toISOString()
    const s: ChatSession = { id: uid('chat'), title: '对话', messages: (raw as ChatMsg[]).filter((message) => !isFailedTransportMessage(message)), createdAt: t, updatedAt: t }
    return { sessions: [s], activeId: '' }
  }
  // 全新：无任何会话，从空白开始（不预先生成空会话）
  return { sessions: [], activeId: '' }
}

interface ChatState {
  sessions: ChatSession[]
  activeId: string
  setMessages: (m: ChatMsg[] | ((prev: ChatMsg[]) => ChatMsg[])) => void
  setContextSummary: (summary: ChatContextSummary | undefined) => void
  setSessionContextSummary: (sessionId: string, summary: ChatContextSummary | undefined) => void
  /** 进入空白新对话（不落库，发第一条消息时才真正创建会话） */
  startBlank: () => void
  createSession: () => void
  switchSession: (id: string) => void
  removeSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  /** 整体替换会话列表（图片迁移到 IndexedDB 用） */
  replaceSessions: (sessions: ChatSession[]) => void
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
    let curId = activeId
    let curSessions = sessions
    // 空白状态（activeId 无对应会话）→ 此刻懒创建会话
    if (!sessions.some((s) => s.id === activeId)) {
      const s = freshSession()
      curId = s.id
      curSessions = [s, ...sessions]
    }
    const next = curSessions.map((s) => {
      if (s.id !== curId) return s
      const messages = typeof m === 'function' ? m(s.messages) : m
      return { ...s, messages, updatedAt: new Date().toISOString() }
    })
    persist(next, curId)
    set({ sessions: next, activeId: curId })
  },

  setContextSummary: (summary) => {
    const { sessions, activeId } = get()
    if (!sessions.some((s) => s.id === activeId)) return
    const next = sessions.map((s) =>
      s.id === activeId
        ? { ...s, contextSummary: summary, updatedAt: new Date().toISOString() }
        : s,
    )
    persist(next, activeId)
    set({ sessions: next })
  },

  setSessionContextSummary: (sessionId, summary) => {
    const { sessions, activeId } = get()
    if (!sessions.some((s) => s.id === sessionId)) return
    const next = sessions.map((s) =>
      s.id === sessionId
        ? { ...s, contextSummary: summary, updatedAt: new Date().toISOString() }
        : s,
    )
    persist(next, activeId)
    set({ sessions: next })
  },

  startBlank: () => {
    persist(get().sessions, '')
    set({ activeId: '' })
  },

  // 「＋ 新对话」：进入空白态即可，不预先生成空会话（发消息时才落库）
  createSession: () => {
    persist(get().sessions, '')
    set({ activeId: '' })
  },

  switchSession: (id) => {
    if (!get().sessions.some((s) => s.id === id)) return
    persist(get().sessions, id)
    set({ activeId: id })
  },

  removeSession: (id) => {
    const sessions = get().sessions.filter((s) => s.id !== id)
    // 删的是当前会话 → 回到空白态
    const activeId = get().activeId === id ? '' : get().activeId
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

  replaceSessions: (sessions) => {
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
