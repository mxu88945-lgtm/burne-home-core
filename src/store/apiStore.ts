/**
 * 前端 API 渠道管理（Zustand，本地持久化）。
 *
 * 像「我的 API」那样：可加多条渠道、填 key、拉取模型、切换激活。
 * key 只存浏览器本地（localStorage），不进仓库、不写死在代码。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export type ApiProvider = 'openai' | 'anthropic'

export interface ApiChannel {
  id: string
  name: string
  provider: ApiProvider
  /** openai 兼容填到 /v1；anthropic 填 https://api.anthropic.com */
  baseUrl: string
  apiKey: string
  model: string
  /** 经自己的 Worker 中转（解决跨域 / 不想浏览器直连时）*/
  viaWorker?: boolean
}

function newId() {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `api-${Date.now()}`
}

interface ApiState {
  channels: ApiChannel[]
  activeId?: string
  addChannel: (c: Omit<ApiChannel, 'id'>) => ApiChannel
  updateChannel: (id: string, patch: Partial<ApiChannel>) => void
  removeChannel: (id: string) => void
  setActive: (id: string) => void
  getActive: () => ApiChannel | undefined
}

interface Persisted {
  channels: ApiChannel[]
  activeId?: string
}

function persist(s: Persisted) {
  writeJSON(STORAGE_KEYS.api, s)
}

const initial = readJSON<Persisted>(STORAGE_KEYS.api, { channels: [] })

export const useApiStore = create<ApiState>((set, get) => ({
  channels: initial.channels,
  activeId: initial.activeId,

  addChannel: (c) => {
    const channel: ApiChannel = { ...c, id: newId() }
    const channels = [...get().channels, channel]
    const activeId = get().activeId ?? channel.id
    persist({ channels, activeId })
    set({ channels, activeId })
    return channel
  },

  updateChannel: (id, patch) => {
    const channels = get().channels.map((c) =>
      c.id === id ? { ...c, ...patch } : c
    )
    persist({ channels, activeId: get().activeId })
    set({ channels })
  },

  removeChannel: (id) => {
    const channels = get().channels.filter((c) => c.id !== id)
    const activeId = get().activeId === id ? channels[0]?.id : get().activeId
    persist({ channels, activeId })
    set({ channels, activeId })
  },

  setActive: (id) => {
    persist({ channels: get().channels, activeId: id })
    set({ activeId: id })
  },

  getActive: () => {
    const { channels, activeId } = get()
    return channels.find((c) => c.id === activeId) ?? channels[0]
  },
}))
