/**
 * 聊天记录（Zustand，本地持久化）。
 * 退出/刷新都保留；只存本设备 localStorage。后续可选接入云同步。
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

function newId() {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `msg-${Date.now()}`
}
function nowLabel() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/** 首次进入的欢迎语 */
function welcome(): ChatMsg {
  return { id: newId(), role: 'companion', text: '欢迎回家呀～有什么想跟我说的吗？♡', at: nowLabel() }
}

interface ChatState {
  messages: ChatMsg[]
  /** 兼容 React setState 风格：可传新数组或 (prev)=>next */
  setMessages: (m: ChatMsg[] | ((prev: ChatMsg[]) => ChatMsg[])) => void
  /** 清空对话，回到欢迎语 */
  clear: () => void
}

const initial = readJSON<ChatMsg[]>(STORAGE_KEYS.chat, [welcome()])

export const useChatStore = create<ChatState>((set, get) => ({
  messages: initial,
  setMessages: (m) => {
    const next = typeof m === 'function' ? m(get().messages) : m
    writeJSON(STORAGE_KEYS.chat, next)
    set({ messages: next })
  },
  clear: () => {
    const next = [welcome()]
    writeJSON(STORAGE_KEYS.chat, next)
    set({ messages: next })
  },
}))
