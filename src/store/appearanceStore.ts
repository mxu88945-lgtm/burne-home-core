/**
 * 外观自定义（Zustand，本地持久化）：目前为聊天背景图。
 * 图片只存本设备，不上传、不进仓库。
 * 背景图本体存 IndexedDB（`idb:` 引用），不占 localStorage 的 5MB（写满会静默丢对话，见 HANDOFF H0）。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import { putImgRef } from '@/lib/imgRef'
import { idbDel } from '@/lib/idb'

/** dataURL 背景 → 存 IDB 换成 `idb:` 引用；顺手删旧图。每次换新 key，保证引用字符串变化触发重渲。 */
function divertBg(next: string, prev: string): string {
  if (prev.startsWith('idb:') && next !== prev) void idbDel(prev.slice(4))
  if (!next.startsWith('data:')) return next
  return putImgRef('bg', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, next)
}

export interface Appearance {
  /** 聊天背景图（dataURL，空则用主题底色） */
  chatBg: string
  /** 背景暗化程度 0~0.7：越大越暗，保证文字可读 */
  chatBgDim: number
  /** 背景显影（不透明度）0.2~1：越小背景越淡、越融入底色 */
  chatBgOpacity: number
  /** 背景模糊 0~20 px */
  chatBgBlur: number
  /** 铺法：cover=铺满 / contain=完整显示 */
  chatBgFit: 'cover' | 'contain'
  /** 戏剧背景图（剧场列表 + 戏剧房间，dataURL，空则跟随主题底色） */
  dramaBg: string
  /** 戏剧背景模糊 0~20 px */
  dramaBgBlur: number
  /** 戏剧毛玻璃度（白纱不透明度）0~0.7：越大越朦胧、文字越清楚 */
  dramaBgFrost: number
}

const DEFAULT_APPEARANCE: Appearance = {
  chatBg: '',
  chatBgDim: 0,
  chatBgOpacity: 1,
  chatBgBlur: 0,
  chatBgFit: 'cover',
  dramaBg: '',
  dramaBgBlur: 0,
  dramaBgFrost: 0.28,
}

interface AppearanceState {
  appearance: Appearance
  update: (patch: Partial<Appearance>) => void
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  appearance: { ...DEFAULT_APPEARANCE, ...readJSON<Partial<Appearance>>(STORAGE_KEYS.appearance, {}) },
  update: (patch) => {
    const prev = get().appearance
    if (typeof patch.chatBg === 'string') patch = { ...patch, chatBg: divertBg(patch.chatBg, prev.chatBg) }
    if (typeof patch.dramaBg === 'string') patch = { ...patch, dramaBg: divertBg(patch.dramaBg, prev.dramaBg) }
    const appearance = { ...prev, ...patch }
    writeJSON(STORAGE_KEYS.appearance, appearance)
    set({ appearance })
  },
}))
