/**
 * 「一起看书」房间状态（Zustand，本地持久化）。
 * 存导入的书（标题 + 正文）、当前页码、讨论消息。只存本设备 localStorage。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface Book {
  title: string
  content: string
}

export interface ReadingMsg {
  id: string
  role: 'me' | 'companion'
  text: string
  at: string
}

interface Persisted {
  book: Book | null
  page: number
  messages: ReadingMsg[]
}

const DEFAULT: Persisted = { book: null, page: 0, messages: [] }

const init = { ...DEFAULT, ...readJSON<Partial<Persisted>>(STORAGE_KEYS.reading, {}) }

interface ReadingState extends Persisted {
  setBook: (title: string, content: string) => void
  clearBook: () => void
  setPage: (page: number) => void
  setMessages: (m: ReadingMsg[] | ((prev: ReadingMsg[]) => ReadingMsg[])) => void
}

function persist(s: Persisted) {
  writeJSON(STORAGE_KEYS.reading, s)
}

export const useReadingStore = create<ReadingState>((set, get) => ({
  book: init.book,
  page: init.page,
  messages: init.messages,

  setBook: (title, content) => {
    const next: Persisted = { book: { title: title.trim() || '未命名', content }, page: 0, messages: [] }
    persist(next)
    set(next)
  },

  clearBook: () => {
    persist(DEFAULT)
    set({ book: null, page: 0, messages: [] })
  },

  setPage: (page) => {
    const { book, messages } = get()
    persist({ book, page, messages })
    set({ page })
  },

  setMessages: (m) => {
    const { book, page } = get()
    const messages = typeof m === 'function' ? m(get().messages) : m
    persist({ book, page, messages })
    set({ messages })
  },
}))

/** 把正文按段落切成一页页（约 700 字/页，超长段落硬切）。 */
export function paginate(content: string): string[] {
  const paras = content
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const pages: string[] = []
  let buf = ''
  const flush = () => {
    if (buf) {
      pages.push(buf)
      buf = ''
    }
  }
  for (const p of paras) {
    if (buf && buf.length + p.length > 700) flush()
    buf = buf ? `${buf}\n\n${p}` : p
    while (buf.length > 1100) {
      pages.push(buf.slice(0, 1100))
      buf = buf.slice(1100)
    }
  }
  flush()
  return pages.length ? pages : ['（这本书还没有内容）']
}
