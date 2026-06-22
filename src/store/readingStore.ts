/**
 * 「一起看书」房间状态（Zustand）。
 * 书正文（可能上百万字）存 IndexedDB；页码/讨论/偏好等小数据存 localStorage。
 * 全部只存本设备，不上传、不进仓库。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { idbGet, idbSet, idbDel } from '@/lib/idb'
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

/** IndexedDB 里书正文的 key */
const BOOK_KEY = 'current-book'

/** localStorage 里的轻量元数据（不含正文） */
interface Meta {
  title: string | null
  page: number
  messages: ReadingMsg[]
  autoComment: boolean
  commented: number[]
}

const DEFAULT_META: Meta = { title: null, page: 0, messages: [], autoComment: true, commented: [] }

// 旧数据迁移时，把正文先留在内存里供首帧直接用，避免与 IDB 写入竞态
let migratedContent: string | null = null

// 读取 + 兼容旧结构（旧版把整本 book{title,content} 存在 localStorage）
function loadMeta(): Meta {
  const raw = readJSON<Record<string, unknown>>(STORAGE_KEYS.reading, {})
  const oldBook = raw.book as { title?: string; content?: string } | null | undefined
  if (oldBook && typeof oldBook === 'object' && typeof oldBook.content === 'string') {
    // 旧数据迁移：正文移到 IndexedDB，localStorage 只留元数据
    const meta: Meta = {
      title: oldBook.title || '未命名',
      page: typeof raw.page === 'number' ? raw.page : 0,
      messages: Array.isArray(raw.messages) ? (raw.messages as ReadingMsg[]) : [],
      autoComment: raw.autoComment !== false,
      commented: Array.isArray(raw.commented) ? (raw.commented as number[]) : [],
    }
    migratedContent = oldBook.content
    void idbSet(BOOK_KEY, oldBook.content)
    writeJSON(STORAGE_KEYS.reading, meta)
    return meta
  }
  return { ...DEFAULT_META, ...(raw as Partial<Meta>) }
}

const initMeta = loadMeta()

interface ReadingState extends Meta {
  /** 当前书（含正文，正文从 IndexedDB 异步载入） */
  book: Book | null
  /** 正文是否已从 IndexedDB 载入完成 */
  loaded: boolean
  loadContent: () => Promise<void>
  setBook: (title: string, content: string) => Promise<void>
  clearBook: () => Promise<void>
  setPage: (page: number) => void
  setMessages: (m: ReadingMsg[] | ((prev: ReadingMsg[]) => ReadingMsg[])) => void
  toggleAutoComment: () => void
  markCommented: (page: number) => void
}

function persistMeta(s: { title: string | null } & Omit<Meta, 'title'>) {
  const meta: Meta = {
    title: s.title,
    page: s.page,
    messages: s.messages,
    autoComment: s.autoComment,
    commented: s.commented,
  }
  writeJSON(STORAGE_KEYS.reading, meta)
}

export const useReadingStore = create<ReadingState>((set, get) => ({
  title: initMeta.title,
  page: initMeta.page,
  messages: initMeta.messages,
  autoComment: initMeta.autoComment,
  commented: initMeta.commented,
  // 有书名说明存过书，正文待异步载入；迁移场景正文已在内存，直接可用
  book: initMeta.title != null ? { title: initMeta.title, content: migratedContent ?? '' } : null,
  loaded: initMeta.title == null || migratedContent != null,

  loadContent: async () => {
    if (get().loaded) return
    const content = (await idbGet<string>(BOOK_KEY)) ?? ''
    const title = get().title
    set({
      book: title != null ? { title, content } : null,
      loaded: true,
    })
  },

  setBook: async (title, content) => {
    const t = title.trim() || '未命名'
    await idbSet(BOOK_KEY, content)
    const next = { title: t, page: 0, messages: [] as ReadingMsg[], autoComment: get().autoComment, commented: [] as number[] }
    persistMeta(next)
    set({ ...next, book: { title: t, content }, loaded: true })
  },

  clearBook: async () => {
    await idbDel(BOOK_KEY)
    const next = { title: null, page: 0, messages: [] as ReadingMsg[], autoComment: get().autoComment, commented: [] as number[] }
    persistMeta(next)
    set({ ...next, book: null, loaded: true })
  },

  setPage: (page) => {
    const { title, messages, autoComment, commented } = get()
    persistMeta({ title, page, messages, autoComment, commented })
    set({ page })
  },

  setMessages: (m) => {
    const { title, page, autoComment, commented } = get()
    const messages = typeof m === 'function' ? m(get().messages) : m
    persistMeta({ title, page, messages, autoComment, commented })
    set({ messages })
  },

  toggleAutoComment: () => {
    const { title, page, messages, commented } = get()
    const autoComment = !get().autoComment
    persistMeta({ title, page, messages, autoComment, commented })
    set({ autoComment })
  },

  markCommented: (page) => {
    if (get().commented.includes(page)) return
    const { title, page: p, messages, autoComment } = get()
    const commented = [...get().commented, page]
    persistMeta({ title, page: p, messages, autoComment, commented })
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
