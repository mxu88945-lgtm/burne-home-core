/**
 * 文生图配置（OpenAI 兼容 images/generations）—— Zustand，本地持久化。
 * 安全红线：apiKey 只存浏览器 localStorage，绝不进仓库、绝不写死在代码。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface ImageGenConfig {
  /** 接口地址（到 /v1），默认 https://api.openai.com/v1 */
  baseUrl: string
  apiKey: string
  /** 模型，如 dall-e-3 / gpt-image-1 / 兼容网关的出图模型 */
  model: string
  /** 尺寸，如 1024x1024 */
  size: string
  /** 经自己的 Worker 中转（解决浏览器跨域） */
  viaWorker: boolean
  /** Worker 地址（留空则复用「多端同步」的 workerUrl） */
  workerUrl: string
}

export const DEFAULT_IMAGEGEN: ImageGenConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'dall-e-3',
  size: '1024x1024',
  viaWorker: false,
  workerUrl: '',
}

interface ImageGenState {
  config: ImageGenConfig
  update: (patch: Partial<ImageGenConfig>) => void
}

export const useImageGenStore = create<ImageGenState>((set, get) => ({
  config: { ...DEFAULT_IMAGEGEN, ...readJSON<Partial<ImageGenConfig>>(STORAGE_KEYS.imagegen, {}) },
  update: (patch) => {
    const config = { ...get().config, ...patch }
    writeJSON(STORAGE_KEYS.imagegen, config)
    set({ config })
  },
}))
