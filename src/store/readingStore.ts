/**
 * 「一起看书」书架（Zustand）。多本书共存。
 * 每本正文（可能上百万字）各存 IndexedDB；书架列表/进度/讨论等小数据存 localStorage。
 * 全部只存本设备，不上传、不进仓库。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { idbGet, idbSet, idbDel } from '@/lib/idb'
import { STORAGE_KEYS } from '@/lib/constants'

export interface ReadingMsg {
  id: string
  role: 'me' | 'companion'
  text: string
  at: string
}

/** 书架上的一本书（不含正文；正文按 contentKey 存 IndexedDB） */
export interface ShelfBook {
  id: string
  title: string
  addedAt: number
  page: number
  messages: ReadingMsg[]
  commented: number[]
  /** 正文在 IndexedDB 里的 key */
  contentKey: string
}

interface Persisted {
  books: ShelfBook[]
  activeId: string
  autoComment: boolean
}

const DEFAULT: Persisted = { books: [], activeId: '', autoComment: true }

function uid() {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `b-${Date.now()}-${Math.random()}`
}

// 读取 + 兼容旧的单本结构（迁移成书架的第一本）
function loadPersisted(): Persisted {
  const raw = readJSON<Record<string, unknown>>(STORAGE_KEYS.reading, {})
  if (Array.isArray(raw.books)) {
    return {
      books: raw.books as ShelfBook[],
      activeId: typeof raw.activeId === 'string' ? raw.activeId : '',
      autoComment: raw.autoComment !== false,
    }
  }
  // 更老结构：book{title,content} 直接存在 localStorage → 先把正文写进 IDB
  const oldBook = raw.book as { title?: string; content?: string } | undefined
  if (oldBook && typeof oldBook.content === 'string') void idbSet('current-book', oldBook.content)
  // 单本 meta 结构：{ title, page, messages, commented, autoComment } + IDB 'current-book'
  const title = (raw.title as string) || oldBook?.title
  if (typeof title === 'string' && title) {
    const book: ShelfBook = {
      id: uid(),
      title,
      addedAt: Date.now(),
      page: typeof raw.page === 'number' ? raw.page : 0,
      messages: Array.isArray(raw.messages) ? (raw.messages as ReadingMsg[]) : [],
      commented: Array.isArray(raw.commented) ? (raw.commented as number[]) : [],
      contentKey: 'current-book',
    }
    const p: Persisted = { books: [book], activeId: '', autoComment: raw.autoComment !== false }
    writeJSON(STORAGE_KEYS.reading, p)
    return p
  }
  return { ...DEFAULT }
}

const init = loadPersisted()

interface ReadingState extends Persisted {
  /** 当前打开的书的正文（从 IndexedDB 异步载入） */
  content: string
  /** 当前书正文是否载入完成 */
  loaded: boolean
  loadActive: () => Promise<void>
  openBook: (id: string) => Promise<void>
  closeBook: () => void
  addBook: (title: string, content: string) => Promise<void>
  deleteBook: (id: string) => Promise<void>
  setPage: (page: number) => void
  setMessages: (m: ReadingMsg[] | ((prev: ReadingMsg[]) => ReadingMsg[])) => void
  markCommented: (page: number) => void
  toggleAutoComment: () => void
}

function persist(books: ShelfBook[], activeId: string, autoComment: boolean) {
  writeJSON(STORAGE_KEYS.reading, { books, activeId, autoComment })
}

export const useReadingStore = create<ReadingState>((set, get) => ({
  books: init.books,
  activeId: init.activeId,
  autoComment: init.autoComment,
  content: '',
  loaded: init.activeId === '',

  loadActive: async () => {
    const { activeId, books, autoComment } = get()
    if (!activeId) {
      set({ content: '', loaded: true })
      return
    }
    const b = books.find((x) => x.id === activeId)
    if (!b) {
      persist(books, '', autoComment)
      set({ activeId: '', content: '', loaded: true })
      return
    }
    const content = (await idbGet<string>(b.contentKey)) ?? ''
    set({ content, loaded: true })
  },

  openBook: async (id) => {
    const b = get().books.find((x) => x.id === id)
    if (!b) return
    persist(get().books, id, get().autoComment)
    set({ activeId: id, content: '', loaded: false })
    const content = (await idbGet<string>(b.contentKey)) ?? ''
    if (get().activeId === id) set({ content, loaded: true })
  },

  closeBook: () => {
    persist(get().books, '', get().autoComment)
    set({ activeId: '', content: '', loaded: true })
  },

  addBook: async (title, content) => {
    const id = uid()
    const contentKey = `book:${id}`
    await idbSet(contentKey, content)
    const book: ShelfBook = {
      id,
      title: title.trim() || '未命名',
      addedAt: Date.now(),
      page: 0,
      messages: [],
      commented: [],
      contentKey,
    }
    const books = [book, ...get().books]
    persist(books, id, get().autoComment)
    set({ books, activeId: id, content, loaded: true })
  },

  deleteBook: async (id) => {
    const b = get().books.find((x) => x.id === id)
    if (b) await idbDel(b.contentKey)
    const books = get().books.filter((x) => x.id !== id)
    const wasActive = get().activeId === id
    const activeId = wasActive ? '' : get().activeId
    persist(books, activeId, get().autoComment)
    set({ books, activeId, ...(wasActive ? { content: '', loaded: true } : {}) })
  },

  setPage: (page) => {
    const books = get().books.map((b) => (b.id === get().activeId ? { ...b, page } : b))
    persist(books, get().activeId, get().autoComment)
    set({ books })
  },

  setMessages: (m) => {
    const cur = get().books.find((b) => b.id === get().activeId)
    if (!cur) return
    const messages = typeof m === 'function' ? m(cur.messages) : m
    const books = get().books.map((b) => (b.id === get().activeId ? { ...b, messages } : b))
    persist(books, get().activeId, get().autoComment)
    set({ books })
  },

  markCommented: (page) => {
    const cur = get().books.find((b) => b.id === get().activeId)
    if (!cur || cur.commented.includes(page)) return
    const books = get().books.map((b) =>
      b.id === get().activeId ? { ...b, commented: [...b.commented, page] } : b,
    )
    persist(books, get().activeId, get().autoComment)
    set({ books })
  },

  toggleAutoComment: () => {
    const autoComment = !get().autoComment
    persist(get().books, get().activeId, autoComment)
    set({ autoComment })
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
