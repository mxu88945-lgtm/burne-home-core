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
  /** TA 主动跟读并冒观点 */
  autoComment: boolean
  /** 已主动评论过的页码（避免翻回去重复评论 / 重复烧 token） */
  commented: number[]
}

const DEFAULT: Persisted = { book: null, page: 0, messages: [], autoComment: true, commented: [] }

const init = { ...DEFAULT, ...readJSON<Partial<Persisted>>(STORAGE_KEYS.reading, {}) }

interface ReadingState extends Persisted {
  setBook: (title: string, content: string) => void
  clearBook: () => void
  setPage: (page: number) => void
  setMessages: (m: ReadingMsg[] | ((prev: ReadingMsg[]) => ReadingMsg[])) => void
  toggleAutoComment: () => void
  markCommented: (page: number) => void
}

function persist(s: Persisted) {
  writeJSON(STORAGE_KEYS.reading, s)
}

export const useReadingStore = create<ReadingState>((set, get) => ({
  book: init.book,
  page: init.page,
  messages: init.messages,
  autoComment: init.autoComment,
  commented: init.commented,

  setBook: (title, content) => {
    const cur = get()
    const next: Persisted = {
      book: { title: title.trim() || '未命名', content },
      page: 0,
      messages: [],
      autoComment: cur.autoComment,
      commented: [],
    }
    persist(next)
    set(next)
  },

  clearBook: () => {
    const next: Persisted = { ...DEFAULT, autoComment: get().autoComment }
    persist(next)
    set({ book: null, page: 0, messages: [], commented: [] })
  },

  setPage: (page) => {
    const { book, messages, autoComment, commented } = get()
    persist({ book, page, messages, autoComment, commented })
    set({ page })
  },

  setMessages: (m) => {
    const { book, page, autoComment, commented } = get()
    const messages = typeof m === 'function' ? m(get().messages) : m
    persist({ book, page, messages, autoComment, commented })
    set({ messages })
  },

  toggleAutoComment: () => {
    const { book, page, messages, commented } = get()
    const autoComment = !get().autoComment
    persist({ book, page, messages, autoComment, commented })
    set({ autoComment })
  },

  markCommented: (page) => {
    if (get().commented.includes(page)) return
    const { book, page: p, messages, autoComment } = get()
    const commented = [...get().commented, page]
    persist({ book, page: p, messages, autoComment, commented })
    set({ commented })
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
