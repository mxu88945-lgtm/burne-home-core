/**
 * 「小手机」状态管理（Zustand）。
 *
 * 一个独立的「像发微信一样」短句聊天角色：有自己的名字 / 头像 / 个性签名 / 灵魂设定，
 * 支持**多个会话**（像主聊天那样可新建/切换/删除/重命名）；
 * 和主聊天**共用同一个记忆库**（在 PhonePage 注入 memoryStore）。
 * 全部只存浏览器本地。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface PhoneMsg {
  id: string
  role: 'me' | 'ta'
  text: string
  at: string
  /** 图片消息（dataURL，可选） */
  image?: string
  /** 表情贴纸消息（emoji 或图片 dataURL） */
  sticker?: { emoji?: string; img?: string; name?: string }
  /** 倒计时指令卡 */
  task?: {
    text: string
    minutes: number
    startedAt: number
    deadline: number
    status: 'active' | 'done' | 'cancelled'
    doneAt?: number
  }
}

export interface PhoneSession {
  id: string
  title: string
  messages: PhoneMsg[]
  createdAt: number
}

export interface PhonePersona {
  /** TA 的名字 */
  name: string
  /** 头像 emoji（无图时显示） */
  avatar: string
  /** 头像图片 dataURL（可选，优先显示） */
  avatarImg?: string
  /** 个性签名 / 状态一句话 */
  signature: string
  /** 灵魂设定（system prompt），留空用默认 */
  systemPrompt: string
  /** 单独的聊天渠道 id（不填则用主聊天激活的渠道） */
  apiChannelId?: string
  /** 是否自动把重要内容写进共用记忆库（默认开，高门槛） */
  autoMemory?: boolean
  /** 是否允许 TA 下「倒计时指令卡」（默认关） */
  allowTasks?: boolean
  /** 我的气泡颜色（hex，默认玫粉） */
  meColor?: string
  /** TA 气泡颜色（hex，默认浅灰） */
  taColor?: string
}

const DEFAULT_PERSONA: PhonePersona = {
  name: '小狗',
  avatar: '🐶',
  signature: '在线 · 随时找我聊天',
  systemPrompt: '',
  autoMemory: true,
}

function newId() {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `ps-${Date.now()}-${Math.random()}`
}
function freshSession(): PhoneSession {
  return { id: newId(), title: '新对话', messages: [], createdAt: Date.now() }
}

interface Saved {
  persona: PhonePersona
  sessions: PhoneSession[]
  activeId: string
}

function load(): Saved {
  const raw = readJSON<Record<string, unknown>>(STORAGE_KEYS.phone, {})
  const persona = { ...DEFAULT_PERSONA, ...((raw.persona as Partial<PhonePersona>) || {}) }
  // 多会话
  if (Array.isArray(raw.sessions) && raw.sessions.length) {
    const sessions = raw.sessions as PhoneSession[]
    const activeId =
      typeof raw.activeId === 'string' && sessions.some((s) => s.id === raw.activeId)
        ? (raw.activeId as string)
        : sessions[0].id
    return { persona, sessions, activeId }
  }
  // 旧单会话迁移：把 messages 搬进一个默认会话
  const old = Array.isArray(raw.messages) ? (raw.messages as PhoneMsg[]) : []
  const s = freshSession()
  s.messages = old
  return { persona, sessions: [s], activeId: s.id }
}

function save(s: Saved) {
  writeJSON(STORAGE_KEYS.phone, s)
}

interface PhoneState {
  persona: PhonePersona
  sessions: PhoneSession[]
  activeId: string
  setPersona: (p: Partial<PhonePersona>) => void
  /** 改当前会话的消息 */
  setMessages: (m: PhoneMsg[] | ((prev: PhoneMsg[]) => PhoneMsg[])) => void
  createSession: () => void
  switchSession: (id: string) => void
  removeSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  /** 首句话自动命名当前会话（仍是「新对话」时才改） */
  autoTitle: (firstText: string) => void
  /** 清空当前会话 */
  clear: () => void
}

export const usePhoneStore = create<PhoneState>((set, get) => ({
  ...load(),
  setPersona: (p) => {
    const persona = { ...get().persona, ...p }
    save({ persona, sessions: get().sessions, activeId: get().activeId })
    set({ persona })
  },
  setMessages: (m) => {
    const { sessions, activeId } = get()
    const next = sessions.map((s) => {
      if (s.id !== activeId) return s
      const messages = typeof m === 'function' ? m(s.messages) : m
      return { ...s, messages }
    })
    save({ persona: get().persona, sessions: next, activeId })
    set({ sessions: next })
  },
  createSession: () => {
    const s = freshSession()
    const sessions = [s, ...get().sessions]
    save({ persona: get().persona, sessions, activeId: s.id })
    set({ sessions, activeId: s.id })
  },
  switchSession: (id) => {
    if (!get().sessions.some((s) => s.id === id)) return
    save({ persona: get().persona, sessions: get().sessions, activeId: id })
    set({ activeId: id })
  },
  removeSession: (id) => {
    let sessions = get().sessions.filter((s) => s.id !== id)
    if (!sessions.length) sessions = [freshSession()]
    const activeId = get().activeId === id ? sessions[0].id : get().activeId
    save({ persona: get().persona, sessions, activeId })
    set({ sessions, activeId })
  },
  renameSession: (id, title) => {
    const sessions = get().sessions.map((s) => (s.id === id ? { ...s, title } : s))
    save({ persona: get().persona, sessions, activeId: get().activeId })
    set({ sessions })
  },
  autoTitle: (firstText) => {
    const { sessions, activeId } = get()
    const next = sessions.map((s) =>
      s.id === activeId && s.title === '新对话'
        ? { ...s, title: firstText.trim().slice(0, 16) || '新对话' }
        : s,
    )
    save({ persona: get().persona, sessions: next, activeId })
    set({ sessions: next })
  },
  clear: () => {
    const { sessions, activeId } = get()
    const next = sessions.map((s) => (s.id === activeId ? { ...s, messages: [] } : s))
    save({ persona: get().persona, sessions: next, activeId })
    set({ sessions: next })
  },
}))
