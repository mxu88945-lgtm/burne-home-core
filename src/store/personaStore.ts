/**
 * 角色人设卡（Zustand，本地持久化）。
 * 你写的「灵魂设定 / 身份」等资料会作为聊天的 system prompt 喂给模型。
 */

import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'

export interface Persona {
  /** 角色名（聊天页顶部显示） */
  name: string
  /** 状态行，如 thinking quietly */
  status: string
  /** 灵魂设定 / 身份 / 资料 —— 作为 system prompt */
  systemPrompt: string
  /** 采样温度 */
  temperature: number
  /** 最大回复 tokens */
  maxTokens: number
}

const DEFAULT_PERSONA: Persona = {
  name: '',
  status: 'thinking quietly',
  systemPrompt: '',
  temperature: 0.8,
  maxTokens: 1024,
}

interface PersonaState {
  persona: Persona
  setPersona: (patch: Partial<Persona>) => void
}

export const usePersonaStore = create<PersonaState>((set, get) => ({
  persona: readJSON<Persona>(STORAGE_KEYS.persona, DEFAULT_PERSONA),
  setPersona: (patch) => {
    const next = { ...get().persona, ...patch }
    writeJSON(STORAGE_KEYS.persona, next)
    set({ persona: next })
  },
}))
