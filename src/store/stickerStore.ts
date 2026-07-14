/**
 * 表情贴纸库（Zustand）。
 *
 * 贴纸 = 一个名字 + 一个 emoji 或一张图片(dataURL)。内置一批可爱 emoji 贴纸，
 * 用户也能上传自己的图当贴纸。小手机里：用户可点发，TA 也能用 [[sticker|名字]] 挑着发。
 * 只存浏览器本地。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import { idbDel, idbSet } from '@/lib/idb'

export interface Sticker {
  id: string
  name: string
  /** emoji 贴纸 */
  emoji?: string
  /** 图片贴纸（dataURL） */
  img?: string
}

const DEFAULTS: Sticker[] = [
  { id: 'd-kaixin', name: '开心', emoji: '😄' },
  { id: 'd-xiaoku', name: '笑哭', emoji: '😂' },
  { id: 'd-sajiao', name: '撒娇', emoji: '🥺' },
  { id: 'd-qinqin', name: '亲亲', emoji: '😘' },
  { id: 'd-aini', name: '爱你', emoji: '🥰' },
  { id: 'd-bixin', name: '比心', emoji: '🫶' },
  { id: 'd-haixiu', name: '害羞', emoji: '☺️' },
  { id: 'd-weiqu', name: '委屈', emoji: '🥹' },
  { id: 'd-shengqi', name: '生气', emoji: '😤' },
  { id: 'd-ku', name: '哭', emoji: '😭' },
  { id: 'd-wuyu', name: '无语', emoji: '🙄' },
  { id: 'd-kun', name: '困', emoji: '😴' },
  { id: 'd-chan', name: '馋', emoji: '🤤' },
  { id: 'd-gou', name: '狗头', emoji: '🐶' },
  { id: 'd-zan', name: '赞', emoji: '👍' },
  { id: 'd-baobao', name: '抱抱', emoji: '🤗' },
  { id: 'd-huaixiao', name: '坏笑', emoji: '😏' },
  { id: 'd-sikao', name: '思考', emoji: '🤔' },
]

function newId() {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `st-${Date.now()}-${Math.random()}`
}

interface StickerState {
  stickers: Sticker[]
  add: (s: Omit<Sticker, 'id'>) => Promise<void>
  remove: (id: string) => void
  /** 整体替换（图片迁移到 IndexedDB 用） */
  replaceAll: (stickers: Sticker[]) => void
}

function load(): Sticker[] {
  const raw = readJSON<Sticker[] | null>(STORAGE_KEYS.stickers, null)
  return Array.isArray(raw) ? raw : DEFAULTS
}

export const useStickerStore = create<StickerState>((set, get) => ({
  stickers: load(),
  add: async (s) => {
    const id = newId()
    // 先等图片本体落盘，再登记引用；避免页面退出/同步时留下只有目录的空贴纸。
    let img = s.img
    if (img?.startsWith('data:')) {
      const key = `simg:${id}`
      await idbSet(key, img)
      img = `idb:${key}`
    }
    const stickers = [{ ...s, img, id }, ...get().stickers]
    writeJSON(STORAGE_KEYS.stickers, stickers)
    set({ stickers })
  },
  remove: (id) => {
    const old = get().stickers.find((s) => s.id === id)
    if (old?.img?.startsWith('idb:')) void idbDel(old.img.slice(4))
    const stickers = get().stickers.filter((s) => s.id !== id)
    writeJSON(STORAGE_KEYS.stickers, stickers)
    set({ stickers })
  },
  replaceAll: (stickers) => {
    writeJSON(STORAGE_KEYS.stickers, stickers)
    set({ stickers })
  },
}))
