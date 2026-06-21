/**
 * 隐私锁（Zustand）—— 简单密码锁。
 *
 * 只存「密码的 SHA-256 哈希」在本地 localStorage，绝不存明文、绝不上传。
 * 启用后每次打开/刷新 App 都要输对密码才解锁（unlocked 是运行时状态，不持久化）。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

interface Persisted {
  enabled: boolean
  /** 密码哈希（hex），空表示未设密码 */
  hash: string
}

/** 计算口令哈希（加固定前缀盐，避免裸 SHA-256） */
async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode('bw-lock::' + text)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const raw = readJSON<Partial<Persisted>>(STORAGE_KEYS.privacy, {})
// 旧数据兼容：只有 enabled 没 hash → 视为未启用
const initHash = typeof raw.hash === 'string' ? raw.hash : ''
const initEnabled = !!raw.enabled && !!initHash

interface PrivacyState {
  enabled: boolean
  hash: string
  /** 运行时是否已解锁 */
  unlocked: boolean
  /** 设/改密码（设完即解锁） */
  setPassword: (pw: string) => Promise<void>
  /** 启用（需已设密码） */
  enable: () => void
  /** 关闭隐私锁并清除密码 */
  disable: () => void
  /** 校验密码 */
  verify: (pw: string) => Promise<boolean>
  lock: () => void
  unlock: () => void
}

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  enabled: initEnabled,
  hash: initHash,
  // 启用且已设密码 → 启动即锁定
  unlocked: !initEnabled,

  setPassword: async (pw) => {
    const hash = await sha256(pw)
    writeJSON(STORAGE_KEYS.privacy, { enabled: get().enabled, hash })
    set({ hash, unlocked: true })
  },

  enable: () => {
    if (!get().hash) return
    writeJSON(STORAGE_KEYS.privacy, { enabled: true, hash: get().hash })
    set({ enabled: true })
  },

  disable: () => {
    writeJSON(STORAGE_KEYS.privacy, { enabled: false, hash: '' })
    set({ enabled: false, hash: '', unlocked: true })
  },

  verify: async (pw) => (await sha256(pw)) === get().hash,

  lock: () => set({ unlocked: false }),
  unlock: () => set({ unlocked: true }),
}))
