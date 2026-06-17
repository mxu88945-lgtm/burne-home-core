/**
 * 恋爱主页的个人资料（Zustand，本地持久化）。
 * 名字、纪念日、心情签名、头像 emoji —— 都只存浏览器本地。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface Profile {
  nameA: string
  nameB: string
  avatarA: string
  avatarB: string
  /** 纪念日，ISO 日期 yyyy-mm-dd */
  anniversary: string
  /** 心情签名 */
  signature: string
}

const DEFAULT_PROFILE: Profile = {
  nameA: '我',
  nameB: '你',
  avatarA: '🌸',
  avatarB: '🌙',
  anniversary: new Date().toISOString().slice(0, 10),
  signature: '窗外没有月亮也没关系，我们的记忆都在这里。',
}

interface ProfileState {
  profile: Profile
  setProfile: (patch: Partial<Profile>) => void
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: readJSON<Profile>(STORAGE_KEYS.profile, DEFAULT_PROFILE),
  setProfile: (patch) => {
    const next = { ...get().profile, ...patch }
    writeJSON(STORAGE_KEYS.profile, next)
    set({ profile: next })
  },
}))

/** 计算在一起的天数（>= 0） */
export function daysTogether(anniversary: string): number {
  const start = new Date(anniversary + 'T00:00:00')
  if (Number.isNaN(start.getTime())) return 0
  const today = new Date()
  const diff = today.getTime() - start.getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}
