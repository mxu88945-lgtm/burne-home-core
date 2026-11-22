import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import { addPrivateEntry, decidePrivacyAccess, normalizePrivacyRoom, requestPrivacyAccess, type PrivacyRoomState } from '@/lib/privacyRoom'

interface PrivacyRoomStore extends PrivacyRoomState {
  setEnabled: (enabled: boolean) => void
  requestAccess: () => void
  decide: (decision: 'grant' | 'deny') => void
  addEntry: (text: string) => void
  lock: () => void
}

function load(): PrivacyRoomState {
  return normalizePrivacyRoom(readJSON<unknown>(STORAGE_KEYS.privacyRoom, {}))
}
function save(state: PrivacyRoomState) {
  writeJSON(STORAGE_KEYS.privacyRoom, state)
}
const initial = load()

export const usePrivacyRoomStore = create<PrivacyRoomStore>((set, get) => ({
  ...initial,
  setEnabled: (enabled) => {
    const next = { ...get(), enabled, unlocked: enabled ? get().unlocked : false }
    save(next)
    set({ enabled, unlocked: next.unlocked })
  },
  requestAccess: () => {
    const next = requestPrivacyAccess(get())
    save(next)
    set(next)
  },
  decide: (decision) => {
    const next = decidePrivacyAccess(get(), decision)
    save(next)
    set(next)
  },
  addEntry: (text) => {
    const next = addPrivateEntry(get(), text)
    save(next)
    set(next)
  },
  lock: () => {
    const next = { ...get(), unlocked: false, requestAt: 0 }
    save(next)
    set({ unlocked: false, requestAt: 0 })
  },
}))
