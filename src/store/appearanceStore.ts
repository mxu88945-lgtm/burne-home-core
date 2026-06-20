/**
 * 外观自定义（Zustand，本地持久化）：目前为聊天背景图。
 * 图片以压缩后的 dataURL 形式只存在本设备，不上传、不进仓库。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface Appearance {
  /** 聊天背景图（dataURL，空则用主题底色） */
  chatBg: string
  /** 背景暗化程度 0~0.7：越大越暗，保证文字可读 */
  chatBgDim: number
}

const DEFAULT_APPEARANCE: Appearance = {
  chatBg: '',
  chatBgDim: 0.3,
}

interface AppearanceState {
  appearance: Appearance
  update: (patch: Partial<Appearance>) => void
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  appearance: { ...DEFAULT_APPEARANCE, ...readJSON<Partial<Appearance>>(STORAGE_KEYS.appearance, {}) },
  update: (patch) => {
    const appearance = { ...get().appearance, ...patch }
    writeJSON(STORAGE_KEYS.appearance, appearance)
    set({ appearance })
  },
}))
