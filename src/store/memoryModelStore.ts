/**
 * 记忆模型配置（Zustand，本地持久化）。
 * 开启后：自动沉淀记忆改用这个单独的小模型来提炼，不再占用/混合主聊天模型。
 * 安全红线：apiKey 只存浏览器 localStorage，绝不进仓库、绝不写死在代码。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface MemoryModelConfig {
  /** 开关：开了之后，自动记忆用这个单独的模型来提炼 */
  enabled: boolean
  /** 接口地址（到 /v1），OpenAI 兼容（含 OpenRouter） */
  baseUrl: string
  apiKey: string
  /** 用来提炼记忆的模型，建议挑便宜/快的小模型 */
  model: string
}

export const DEFAULT_MEMORY_MODEL: MemoryModelConfig = {
  enabled: false,
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: '',
  model: '',
}

interface MemoryModelState {
  config: MemoryModelConfig
  update: (patch: Partial<MemoryModelConfig>) => void
}

export const useMemoryModelStore = create<MemoryModelState>((set, get) => ({
  config: {
    ...DEFAULT_MEMORY_MODEL,
    ...readJSON<Partial<MemoryModelConfig>>(STORAGE_KEYS.memoryModel, {}),
  },
  update: (patch) => {
    const config = { ...get().config, ...patch }
    writeJSON(STORAGE_KEYS.memoryModel, config)
    set({ config })
  },
}))
