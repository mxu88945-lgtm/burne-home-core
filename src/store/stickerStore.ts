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
import { putImgRef } from '@/lib/imgRef'

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
  add: (s: Omit<Sticker, 'id'>) => void
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
  add: (s) => {
    const id = newId()
    // 图片本体进 IndexedDB，localStorage 只留 `idb:` 引用（5MB 事故根治，见 HANDOFF H0）
    const img = s.img && s.img.startsWith('data:') ? putImgRef('simg', id, s.img) : s.img
    const stickers = [{ ...s, img, id }, ...get().stickers]
    writeJSON(STORAGE_KEYS.stickers, stickers)
    set({ stickers })
  },
  remove: (id) => {
    const stickers = get().stickers.filter((s) => s.id !== id)
    writeJSON(STORAGE_KEYS.stickers, stickers)
    set({ stickers })
  },
  replaceAll: (stickers) => {
    writeJSON(STORAGE_KEYS.stickers, stickers)
    set({ stickers })
  },
}))
