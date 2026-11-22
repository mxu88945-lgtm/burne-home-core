import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import { DEFAULT_SENSE_SETTINGS, type SenseKind, type SenseSettings } from '@/lib/senseInteraction'

export interface SenseState extends SenseSettings {
  permissionMessage: Partial<Record<SenseKind, string>>
  setEnabled: (enabled: boolean) => void
  setKind: (kind: SenseKind, enabled: boolean) => void
  setPermissionMessage: (kind: SenseKind, message: string) => void
  clearPermissionMessage: (kind: SenseKind) => void
}

const stored = readJSON<Partial<SenseSettings>>(STORAGE_KEYS.sense, {})
const initial: SenseSettings = { ...DEFAULT_SENSE_SETTINGS, ...stored }

function persist(next: SenseSettings) {
  writeJSON(STORAGE_KEYS.sense, next)
}

export const useSenseStore = create<SenseState>((set, get) => ({
  ...initial,
  permissionMessage: {},
  setEnabled: (enabled) => {
    const state = get()
    persist({ enabled, blow: state.blow, shake: state.shake, rotation: state.rotation, longPress: state.longPress })
    set({ enabled })
  },
  setKind: (kind, enabled) => {
    const state = get()
    const next: SenseSettings = {
      enabled: state.enabled,
      blow: kind === 'blow' ? enabled : state.blow,
      shake: kind === 'shake' ? enabled : state.shake,
      rotation: kind === 'rotation' ? enabled : state.rotation,
      longPress: kind === 'longPress' ? enabled : state.longPress,
    }
    persist(next)
    set({ [kind]: enabled })
  },
  setPermissionMessage: (kind, message) => set((state) => ({ permissionMessage: { ...state.permissionMessage, [kind]: message } })),
  clearPermissionMessage: (kind) => set((state) => {
    const permissionMessage = { ...state.permissionMessage }
    delete permissionMessage[kind]
    return { permissionMessage }
  }),
}))
