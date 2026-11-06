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
  /** 系统指令：独立附加，不替换灵魂设定；专门写执行/输出/格式要求 */
  systemInstruction?: string
  /** 预设条目：启用的按顺序和人设一起发给模型；关掉保留内容但不发送 */
  presets?: PromptPreset[]
  /** 采样温度 */
  temperature: number
  /** 最大回复 tokens */
  maxTokens: number
  /** 显示思考过程（reasoning / thinking） */
  reasoning?: boolean
  /** 思考强度（开思考时生效）：auto=交给模型自己定，默认 auto */
  reasoningEffort?: 'auto' | 'low' | 'medium' | 'high'
}

export interface PromptPreset {
  id: string
  name: string
  content: string
  enabled: boolean
}

/** 把系统指令 + 启用的预设拼成一段，接在灵魂设定后面发给模型 */
export function buildPersonaExtras(p: Persona): string {
  const parts: string[] = []
  for (const item of p.presets ?? []) {
    if (item.enabled && item.content.trim()) {
      parts.push(`【预设 · ${item.name.trim() || '未命名预设'}】\n${item.content.trim()}`)
    }
  }
  if (p.systemInstruction?.trim()) parts.push(`【系统指令】\n${p.systemInstruction.trim()}`)
  return parts.join('\n\n')
}

const DEFAULT_PERSONA: Persona = {
  name: '',
  status: 'thinking quietly',
  systemPrompt: '',
  temperature: 0.8,
  maxTokens: 4096,
  reasoning: false,
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
