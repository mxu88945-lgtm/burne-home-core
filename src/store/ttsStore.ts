/**
 * TTS 语音朗读配置（MiniMax 海螺）—— Zustand，本地持久化。
 *
 * 安全红线：API Key / GroupId 只存浏览器 localStorage，绝不进仓库、绝不写死在代码。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface TtsConfig {
  /** 总开关：聊天里是否显示 🔊 播放按钮 */
  enabled: boolean
  /** 接口地址，默认 https://api.minimax.chat（国际站可填 https://api.minimaxi.chat） */
  baseUrl: string
  /** API Key（只存本地） */
  apiKey: string
  /** GroupId（MiniMax 控制台拿，只存本地） */
  groupId: string
  /** 模型，默认 speech-01-turbo */
  model: string
  /** 音色 ID，如 male-qn-qingse / female-shaonv 等 */
  voiceId: string
  /** 语速 0.5~2，默认 1 */
  speed: number
  /** 经自己的 Worker 中转（解决浏览器跨域） */
  viaWorker: boolean
  /** Worker 地址（勾了中转才用；留空则复用「多端同步」的 workerUrl） */
  workerUrl: string
}

export const DEFAULT_TTS: TtsConfig = {
  enabled: false,
  baseUrl: 'https://api.minimax.chat',
  apiKey: '',
  groupId: '',
  model: 'speech-01-turbo',
  voiceId: 'female-tianmei',
  speed: 1,
  viaWorker: false,
  workerUrl: '',
}

/** 常用音色预设（用户也可手填任意 voice_id） */
export const VOICE_PRESETS: { id: string; label: string }[] = [
  { id: 'female-tianmei', label: '甜美女声' },
  { id: 'female-shaonv', label: '少女音' },
  { id: 'female-yujie', label: '御姐音' },
  { id: 'male-qn-qingse', label: '青涩青年' },
  { id: 'male-qn-jingying', label: '精英青年' },
  { id: 'presenter_female', label: '女主播' },
  { id: 'audiobook_female_1', label: '有声书女声' },
]

interface TtsState {
  config: TtsConfig
  update: (patch: Partial<TtsConfig>) => void
}

export const useTtsStore = create<TtsState>((set, get) => ({
  config: { ...DEFAULT_TTS, ...readJSON<Partial<TtsConfig>>(STORAGE_KEYS.tts, {}) },
  update: (patch) => {
    const config = { ...get().config, ...patch }
    writeJSON(STORAGE_KEYS.tts, config)
    set({ config })
  },
}))
