/**
 * 语音输入（STT 语音转文字）配置 —— Zustand，本地持久化。
 * 录音 → 转文字 → 填进输入框（可选自动发送）。OpenAI 兼容 /audio/transcriptions（如 whisper）。
 * 安全红线：apiKey 只存浏览器 localStorage，绝不进仓库、绝不写死在代码。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface SttConfig {
  /** 总开关：开了才在输入框显示 🎤 */
  enabled: boolean
  /** 接口地址（到 /v1），OpenAI 兼容 */
  baseUrl: string
  apiKey: string
  /** 转写模型，如 whisper-1 / gpt-4o-mini-transcribe */
  model: string
  /** 语言提示（可留空自动识别），如 zh */
  language: string
  /** 转写完是否自动发送（实时对话靠它） */
  autoSend: boolean
  /** 经自己的 Worker 中转（建议开，绕过浏览器跨域） */
  viaWorker: boolean
  /** Worker 地址（留空则复用「多端同步」的 workerUrl） */
  workerUrl: string
}

export const DEFAULT_STT: SttConfig = {
  enabled: false,
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'whisper-1',
  language: 'zh',
  autoSend: false,
  viaWorker: true,
  workerUrl: '',
}

interface SttState {
  config: SttConfig
  update: (patch: Partial<SttConfig>) => void
}

export const useSttStore = create<SttState>((set, get) => ({
  config: { ...DEFAULT_STT, ...readJSON<Partial<SttConfig>>(STORAGE_KEYS.stt, {}) },
  update: (patch) => {
    const config = { ...get().config, ...patch }
    writeJSON(STORAGE_KEYS.stt, config)
    set({ config })
  },
}))
