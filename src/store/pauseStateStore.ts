import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import { normalizePauseState } from '@/lib/pauseState'

interface PauseStore {
  enabled: boolean
  pausedUntil: number
  setEnabled: (enabled: boolean) => void
  pauseFor: (minutes: number, at?: number) => void
  clear: () => void
}

function load(): Pick<PauseStore, 'enabled' | 'pausedUntil'> {
  const raw = readJSON<{ enabled?: boolean; pausedUntil?: number }>(STORAGE_KEYS.pauseState, {})
  return { enabled: raw.enabled === true, pausedUntil: normalizePauseState(raw).pausedUntil }
}
function save(enabled: boolean, pausedUntil: number) {
  writeJSON(STORAGE_KEYS.pauseState, { enabled, pausedUntil })
}
const initial = load()

export const usePauseStateStore = create<PauseStore>((set, get) => ({
  ...initial,
  setEnabled: (enabled) => {
    const pausedUntil = enabled ? get().pausedUntil : 0
    save(enabled, pausedUntil)
    set({ enabled, pausedUntil })
  },
  pauseFor: (minutes, at = Date.now()) => {
    if (!get().enabled) return
    const pausedUntil = at + Math.max(5, Math.min(24 * 60, Math.round(minutes))) * 60_000
    save(true, pausedUntil)
    set({ pausedUntil })
  },
  clear: () => {
    save(get().enabled, 0)
    set({ pausedUntil: 0 })
  },
}))
