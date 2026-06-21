/**
 * 文生图渠道管理（Zustand，本地持久化）——可保存多个画图 API，随时切换、互不覆盖。
 * 安全红线：apiKey 只存浏览器 localStorage，绝不进仓库、绝不写死在代码。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface ImageGenConfig {
  /** images = OpenAI images/generations（DALL·E）；chat = 聊天接口出图（OpenRouter/Gemini） */
  mode: 'images' | 'chat'
  baseUrl: string
  apiKey: string
  model: string
  /** 尺寸，如 1024x1024（chat 模式忽略） */
  size: string
  viaWorker: boolean
  /** Worker 地址（留空则复用「多端同步」的 workerUrl） */
  workerUrl: string
}

export interface ImageGenChannel extends ImageGenConfig {
  id: string
  name: string
}

function uid() {
  return 'randomUUID' in crypto ? crypto.randomUUID() : `img-${Date.now()}`
}

const BLANK: ImageGenConfig = {
  mode: 'images',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'dall-e-3',
  size: '1024x1024',
  viaWorker: false,
  workerUrl: '',
}

function blankChannel(): ImageGenChannel {
  return { ...BLANK, id: uid(), name: '新渠道' }
}

interface Persisted {
  channels: ImageGenChannel[]
  activeId?: string
}

function load(): Persisted {
  const raw = readJSON<unknown>(STORAGE_KEYS.imagegen, null)
  if (raw && typeof raw === 'object' && Array.isArray((raw as Persisted).channels)) {
    const p = raw as Persisted
    if (p.channels.length) return { channels: p.channels, activeId: p.activeId ?? p.channels[0].id }
  }
  // 迁移旧的单配置（含 baseUrl 字段）
  if (raw && typeof raw === 'object' && 'baseUrl' in (raw as object)) {
    const old = raw as ImageGenConfig
    const ch: ImageGenChannel = { ...BLANK, ...old, id: uid(), name: old.mode === 'chat' ? 'OpenRouter' : '渠道' }
    return { channels: [ch], activeId: ch.id }
  }
  return { channels: [], activeId: undefined }
}

interface ImageGenState {
  channels: ImageGenChannel[]
  activeId?: string
  addChannel: () => ImageGenChannel
  updateChannel: (id: string, patch: Partial<ImageGenConfig & { name: string }>) => void
  removeChannel: (id: string) => void
  setActive: (id: string) => void
  getActive: () => ImageGenChannel | undefined
}

const init = load()
function persist(channels: ImageGenChannel[], activeId?: string) {
  writeJSON(STORAGE_KEYS.imagegen, { channels, activeId })
}

export const useImageGenStore = create<ImageGenState>((set, get) => ({
  channels: init.channels,
  activeId: init.activeId,

  addChannel: () => {
    const ch = blankChannel()
    const channels = [...get().channels, ch]
    persist(channels, ch.id)
    set({ channels, activeId: ch.id })
    return ch
  },

  updateChannel: (id, patch) => {
    const channels = get().channels.map((c) => (c.id === id ? { ...c, ...patch } : c))
    persist(channels, get().activeId)
    set({ channels })
  },

  removeChannel: (id) => {
    const channels = get().channels.filter((c) => c.id !== id)
    const activeId = get().activeId === id ? channels[0]?.id : get().activeId
    persist(channels, activeId)
    set({ channels, activeId })
  },

  setActive: (id) => {
    persist(get().channels, id)
    set({ activeId: id })
  },

  getActive: () => {
    const { channels, activeId } = get()
    return channels.find((c) => c.id === activeId) ?? channels[0]
  },
}))
