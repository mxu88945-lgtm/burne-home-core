/**
 * 音乐播放器（Zustand，本地持久化）。
 * 浮在所有页面上的小播放器：可收成小唱片、可展开控制。
 * 元数据（歌单/开关/当前曲目）存 localStorage；音频文件本体存 IndexedDB（key `music:{id}`，只在本机）。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface MusicTrack {
  id: string
  /** 显示名（默认取文件名去后缀，可重命名） */
  name: string
}

interface Persisted {
  /** 是否显示播放器（外观页开关） */
  enabled: boolean
  /** 收起成小唱片 */
  collapsed: boolean
  tracks: MusicTrack[]
  activeId: string
}

const DEFAULT: Persisted = { enabled: true, collapsed: true, tracks: [], activeId: '' }
const init = { ...DEFAULT, ...readJSON<Partial<Persisted>>(STORAGE_KEYS.music, {}) }

interface MusicState extends Persisted {
  setEnabled: (on: boolean) => void
  setCollapsed: (on: boolean) => void
  addTracks: (list: MusicTrack[]) => void
  removeTrack: (id: string) => void
  renameTrack: (id: string, name: string) => void
  setActive: (id: string) => void
}

export const useMusicStore = create<MusicState>((set, get) => {
  const persist = (patch: Partial<Persisted>) => {
    const next = { ...get(), ...patch }
    writeJSON(STORAGE_KEYS.music, {
      enabled: next.enabled,
      collapsed: next.collapsed,
      tracks: next.tracks,
      activeId: next.activeId,
    })
    set(patch)
  }
  return {
    ...init,
    setEnabled: (on) => persist({ enabled: on }),
    setCollapsed: (on) => persist({ collapsed: on }),
    addTracks: (list) => {
      const tracks = [...get().tracks, ...list]
      persist({ tracks, activeId: get().activeId || list[0]?.id || '' })
    },
    removeTrack: (id) => {
      const tracks = get().tracks.filter((t) => t.id !== id)
      const activeId = get().activeId === id ? tracks[0]?.id ?? '' : get().activeId
      persist({ tracks, activeId })
    },
    renameTrack: (id, name) =>
      persist({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, name: name.trim() || t.name } : t)) }),
    setActive: (id) => persist({ activeId: id }),
  }
})

export function musicTrackId(): string {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `mu-${Date.now()}-${Math.random()}`
}
