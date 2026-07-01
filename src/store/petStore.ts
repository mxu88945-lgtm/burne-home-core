/**
 * 桌宠 / 小挂件（Zustand，本地持久化）。
 * 浮在所有页面上的小家伙：可拖动、点一下有反应、新消息冒小气泡、可开关。
 * 只存本地：开关 / 造型 / 位置。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface PetState {
  /** 是否显示 */
  enabled: boolean
  /** 造型 emoji */
  emoji: string
  /** 停靠位置（相对 app 列的百分比 0~1，换设备/旋转也不跑飞） */
  x: number
  y: number
}

/** 可选造型（第一个是默认，偏可爱的爬宠/小动物） */
export const PET_CHOICES = ['🦎', '🐈', '🐹', '🦖', '🐸', '🐥', '🐙', '🦊', '🐧', '🦉', '🐬', '🦋']

const DEFAULT: PetState = { enabled: true, emoji: '🦎', x: 0.86, y: 0.7 }

interface Store extends PetState {
  setEnabled: (on: boolean) => void
  setEmoji: (e: string) => void
  setPos: (x: number, y: number) => void
}

const init = { ...DEFAULT, ...readJSON<Partial<PetState>>(STORAGE_KEYS.pet, {}) }

export const usePetStore = create<Store>((set, get) => {
  const persist = () => {
    const { enabled, emoji, x, y } = get()
    writeJSON(STORAGE_KEYS.pet, { enabled, emoji, x, y })
  }
  return {
    ...init,
    setEnabled: (on) => {
      set({ enabled: on })
      persist()
    },
    setEmoji: (e) => {
      set({ emoji: e })
      persist()
    },
    setPos: (x, y) => {
      set({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) })
      persist()
    },
  }
})
