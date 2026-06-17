/**
 * 隐私锁状态（Zustand）。
 *
 * 这一轮只做开关 + 运行时解锁标记的骨架。
 * 真正的口令校验 / 加密第三轮再做（口令哈希也只存本地）。
 */

import { create } from 'zustand'
import type { PrivacyLockState } from '@/types/memory'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

interface PrivacyState extends PrivacyLockState {
  setEnabled: (enabled: boolean) => void
  lock: () => void
  unlock: () => void
}

const persisted = readJSON<{ enabled: boolean }>(STORAGE_KEYS.privacy, {
  enabled: false,
})

export const usePrivacyStore = create<PrivacyState>((set) => ({
  enabled: persisted.enabled,
  // 未启用时默认解锁；启用时初始为锁定
  unlocked: !persisted.enabled,

  setEnabled: (enabled) => {
    writeJSON(STORAGE_KEYS.privacy, { enabled })
    set({ enabled, unlocked: !enabled })
  },

  lock: () => set({ unlocked: false }),
  unlock: () => set({ unlocked: true }),
}))
