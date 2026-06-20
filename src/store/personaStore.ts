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
  maxTokens: 4096,
}

/** 读取人设，并对旧的过小 maxTokens 做一次性迁移（默认 1024 太小、回复会被截断） */
function loadPersona(): Persona {
  const p = readJSON<Persona>(STORAGE_KEYS.persona, DEFAULT_PERSONA)
  try {
    const MIG = `${STORAGE_KEYS.persona}-mtmig`
    if (!localStorage.getItem(MIG)) {
      if (!p.maxTokens || p.maxTokens <= 1024) p.maxTokens = DEFAULT_PERSONA.maxTokens
      localStorage.setItem(MIG, '1')
      writeJSON(STORAGE_KEYS.persona, p)
    }
  } catch {
    // ignore
  }
  return p
}

interface PersonaState {
  persona: Persona
  setPersona: (patch: Partial<Persona>) => void
}

export const usePersonaStore = create<PersonaState>((set, get) => ({
  persona: loadPersona(),
  setPersona: (patch) => {
    const next = { ...get().persona, ...patch }
    writeJSON(STORAGE_KEYS.persona, next)
    set({ persona: next })
  },
}))
