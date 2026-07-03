/**
 * 恋爱主页的个人资料（Zustand，本地持久化）。
 * 名字、纪念日、心情签名、头像 emoji —— 都只存浏览器本地。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import { putImgRef } from '@/lib/imgRef'

export interface Profile {
  nameA: string
  nameB: string
  avatarA: string
  avatarB: string
  /** 用户头像上传图（dataURL，有则优先于 avatarA emoji） */
  avatarAImg?: string
  /** AI/TA 头像上传图（dataURL，有则优先于 avatarB emoji） */
  avatarBImg?: string
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
    // 头像图本体进 IndexedDB，localStorage 只留 `idb:` 引用（5MB 事故根治，见 HANDOFF H0）
    for (const k of ['avatarAImg', 'avatarBImg'] as const) {
      const v = patch[k]
      if (v && v.startsWith('data:')) patch = { ...patch, [k]: putImgRef('av', `${k}-${Date.now()}`, v) }
    }
    const next = { ...get().profile, ...patch }
    writeJSON(STORAGE_KEYS.profile, next)
    set({ profile: next })
  },
}))

/** 计算在一起的天数（>= 0）。容错：支持 2025-05-01 / 2025.5.1 / 2025/5/1 / 2025-5-1
 *  ⚠️ 不用 new Date('2025-5-1') 解析——iOS Safari 对非补零的 ISO 串会判为 Invalid Date（天数恒为 0），
 *  改成手动拆出年月日、按本地零点算整天差。 */
export function daysTogether(anniversary: string): number {
  const m = (anniversary || '').trim().replace(/[./]/g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return 0
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(start.getTime())) return 0
  const today = new Date()
  const startMid = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return Math.max(0, Math.round((todayMid - startMid) / 86400000))
}
