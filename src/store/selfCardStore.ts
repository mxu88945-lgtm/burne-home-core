/**
 * 他自己写的卡（主聊天 · 伯恩）。Zustand + localStorage，key = burne-home-core:self-card，
 * 整包备份（buildFullBackup 收 burne-home-core: 前缀的所有 key）自动带上。原卡（人设）永远不动。
 */
import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import {
  normalizeSelfCard,
  normalizeSelfCardHistory,
  restoreSelfCard,
  selfCardLabel,
  setSelfCardSection,
  type SelfCard,
  type SelfCardKey,
  type SelfCardState,
  type SelfCardVersion,
} from '@/lib/selfCard'

interface SelfCardStore {
  card: SelfCard
  history: SelfCardVersion[]
  /** 改一栏（她在设置页改 / 他在回复里改）；who 决定历史里的原因写「她改了」还是「他改了」 */
  setSection: (key: SelfCardKey, content: string, who: 'her' | 'him') => boolean
  restore: (index: number) => void
}

export function loadSelfCard(): SelfCardState {
  const raw = readJSON<Partial<SelfCardState>>(STORAGE_KEYS.selfCard, {})
  return { card: normalizeSelfCard(raw?.card), history: normalizeSelfCardHistory(raw?.history) }
}

export const useSelfCardStore = create<SelfCardStore>((set, get) => {
  const commit = (next: SelfCardState) => {
    const { card, history } = get()
    if (next.card === card && next.history === history) return false
    writeJSON(STORAGE_KEYS.selfCard, next)
    set({ card: next.card, history: next.history })
    return true
  }
  return {
    ...loadSelfCard(),
    setSection: (key, content, who) => {
      const { card, history } = get()
      const reason = `${who === 'him' ? '他' : '她'}改了「${selfCardLabel(key)}」`
      return commit(setSelfCardSection({ card, history }, key, content, reason))
    },
    restore: (index) => {
      const { card, history } = get()
      commit(restoreSelfCard({ card, history }, index))
    },
  }
})
