/**
 * 「小手机」状态管理（Zustand）。
 *
 * 一个独立的「像发微信一样」短句聊天角色：有自己的名字 / 头像 / 个性签名 / 灵魂设定，
 * 自己的对话记录；但**和主聊天共用同一个记忆库**（在 PhonePage 注入 memoryStore）。
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
}

const DEFAULT_PERSONA: PhonePersona = {
  name: '小狗',
  avatar: '🐶',
  signature: '在线 · 随时找我聊天',
  systemPrompt: '',
}

interface Saved {
  persona: PhonePersona
  messages: PhoneMsg[]
}

function load(): Saved {
  const raw = readJSON<Partial<Saved>>(STORAGE_KEYS.phone, {})
  return {
    persona: { ...DEFAULT_PERSONA, ...(raw.persona || {}) },
    messages: Array.isArray(raw.messages) ? raw.messages : [],
  }
}

function save(s: Saved) {
  writeJSON(STORAGE_KEYS.phone, s)
}

interface PhoneState {
  persona: PhonePersona
  messages: PhoneMsg[]
  setPersona: (p: Partial<PhonePersona>) => void
  setMessages: (m: PhoneMsg[] | ((prev: PhoneMsg[]) => PhoneMsg[])) => void
  clear: () => void
}

export const usePhoneStore = create<PhoneState>((set, get) => ({
  ...load(),
  setPersona: (p) => {
    const persona = { ...get().persona, ...p }
    save({ persona, messages: get().messages })
    set({ persona })
  },
  setMessages: (m) => {
    const messages = typeof m === 'function' ? m(get().messages) : m
    save({ persona: get().persona, messages })
    set({ messages })
  },
  clear: () => {
    save({ persona: get().persona, messages: [] })
    set({ messages: [] })
  },
}))
