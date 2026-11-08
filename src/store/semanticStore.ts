/**
 * 语义召回（向量）配置 + 索引进度。
 * 只存「开关 / 用哪个渠道 / 向量模型」，key 复用渠道里那把，不另外存。
 */
import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export const DEFAULT_EMBED_MODEL = 'BAAI/bge-m3'

export interface SemanticConfig {
  enabled: boolean
  /** useApiStore 里的渠道 id */
  channelId: string
  model: string
}

export const DEFAULT_SEMANTIC: SemanticConfig = { enabled: false, channelId: '', model: DEFAULT_EMBED_MODEL }

export interface SemanticProgress {
  indexed: number
  total: number
  running: boolean
  error?: string
  /** 失败退避到这个时间点（ms） */
  backoffUntil?: number
  lastRunAt?: number
}

interface SemanticState {
  config: SemanticConfig
  progress: SemanticProgress
  update: (patch: Partial<SemanticConfig>) => void
  setProgress: (patch: Partial<SemanticProgress>) => void
}

export const useSemanticStore = create<SemanticState>((set, get) => ({
  config: { ...DEFAULT_SEMANTIC, ...readJSON<Partial<SemanticConfig>>(STORAGE_KEYS.semantic, {}) },
  progress: { indexed: 0, total: 0, running: false },
  update: (patch) => {
    const config = { ...get().config, ...patch }
    writeJSON(STORAGE_KEYS.semantic, config)
    set({ config })
  },
  setProgress: (patch) => set({ progress: { ...get().progress, ...patch } }),
}))
