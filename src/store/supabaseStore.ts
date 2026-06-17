/**
 * Supabase 多设备同步配置（Zustand，本地持久化）。
 * 只存 url / anonKey(publishable) / email（都不是私密密钥）；
 * 登录会话由 supabase-js 自行管理，密码不持久化。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface SupabaseConfig {
  url?: string
  anonKey?: string
  /** 仅用于登录框回填，方便换设备 */
  email?: string
}

interface SupabaseState {
  config: SupabaseConfig
  /** 已登录的用户邮箱（运行时） */
  userEmail?: string
  setConfig: (patch: Partial<SupabaseConfig>) => void
  setUserEmail: (email?: string) => void
}

export const useSupabaseStore = create<SupabaseState>((set, get) => ({
  config: readJSON<SupabaseConfig>(STORAGE_KEYS.supabase, {}),
  userEmail: undefined,
  setConfig: (patch) => {
    const next = { ...get().config, ...patch }
    writeJSON(STORAGE_KEYS.supabase, next)
    set({ config: next })
  },
  setUserEmail: (userEmail) => set({ userEmail }),
}))
