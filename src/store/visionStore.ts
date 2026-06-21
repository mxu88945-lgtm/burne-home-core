/**
 * 读图模型配置（Zustand，本地持久化）。
 * 当聊天主模型不支持读图时，开启它：对话里有图片的那次回复改用这个支持视觉的模型。
 * 安全红线：apiKey 只存浏览器 localStorage，绝不进仓库、绝不写死在代码。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface VisionConfig {
  /** 开关：开了之后，含图片的消息用这个模型回复 */
  enabled: boolean
  /** 接口地址（到 /v1），OpenAI 兼容（含 OpenRouter） */
  baseUrl: string
  apiKey: string
  /** 支持读图的模型，如 google/gemini-2.5-flash */
  model: string
}

export const DEFAULT_VISION: VisionConfig = {
  enabled: false,
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: '',
  model: '',
}

interface VisionState {
  config: VisionConfig
  update: (patch: Partial<VisionConfig>) => void
}

export const useVisionStore = create<VisionState>((set, get) => ({
  config: { ...DEFAULT_VISION, ...readJSON<Partial<VisionConfig>>(STORAGE_KEYS.vision, {}) },
  update: (patch) => {
    const config = { ...get().config, ...patch }
    writeJSON(STORAGE_KEYS.vision, config)
    set({ config })
  },
}))
