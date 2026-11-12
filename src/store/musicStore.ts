/**
 * 音乐播放器（Zustand，本地持久化）。
 * 浮在所有页面上的小播放器：可收成小唱片、可展开控制。
 * 元数据（歌单/开关/当前曲目）存 localStorage；音频文件本体存 IndexedDB（key `music:{id}`，只在本机）。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import type { LyricLine, NowPlaying } from '@/lib/lyrics'

export interface MusicTrack {
  id: string
  /** 显示名（默认取文件名去后缀，可重命名） */
  name: string
  /** 有歌词（本体存 IndexedDB `lyric:{id}`） */
  hasLyrics?: boolean
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
  /** 批量删（管理模式）：一次写盘；当前曲目被删就落到剩下的第一首 */
  removeTracks: (ids: string[]) => void
  renameTrack: (id: string, name: string) => void
  setActive: (id: string) => void
  setHasLyrics: (id: string, on: boolean) => void
  /** 以下不持久化：首页卡片挂载点、正在播放、当前歌曲歌词（给聊天「一起听」用） */
  slot: HTMLElement | null
  setSlot: (el: HTMLElement | null) => void
  now: NowPlaying | null
  setNow: (n: NowPlaying | null) => void
  lyrics: LyricLine[]
  setLyrics: (l: LyricLine[]) => void
  /** 他点歌 / 点歌小条：请播放器切到某首并播放（nonce 每次不同；auto=回复收尾自动切，被拦就安静失败） */
  playRequest: PlayRequest | null
  requestPlay: (trackId: string, msgId?: string, auto?: boolean) => void
  /** 每条点歌消息的播放结果（不持久化）：blocked=浏览器没让自动播（显示「点一下播放」） */
  pickState: Record<string, PickState>
  setPickState: (msgId: string, st: PickState) => void
}

export type PickState = 'playing' | 'blocked' | 'error'
export interface PlayRequest {
  trackId: string
  msgId?: string
  auto: boolean
  nonce: number
}
let playNonce = 0

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
    removeTrack: (id) => get().removeTracks([id]),
    removeTracks: (ids) => {
      const drop = new Set(ids)
      const tracks = get().tracks.filter((t) => !drop.has(t.id))
      const activeId = drop.has(get().activeId) ? tracks[0]?.id ?? '' : get().activeId
      persist({ tracks, activeId })
    },
    renameTrack: (id, name) =>
      persist({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, name: name.trim() || t.name } : t)) }),
    setActive: (id) => persist({ activeId: id }),
    setHasLyrics: (id, on) => persist({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, hasLyrics: on } : t)) }),
    slot: null,
    setSlot: (el) => set({ slot: el }),
    now: null,
    setNow: (n) => set({ now: n }),
    lyrics: [],
    setLyrics: (l) => set({ lyrics: l }),
    playRequest: null,
    requestPlay: (trackId, msgId, auto = false) => set({ playRequest: { trackId, msgId, auto, nonce: ++playNonce } }),
    pickState: {},
    setPickState: (msgId, st) => set({ pickState: { ...get().pickState, [msgId]: st } }),
  }
})

export function musicTrackId(): string {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `mu-${Date.now()}-${Math.random()}`
}
