import { create } from 'zustand'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import { afterReplyBody, applyBodyTag, currentBody, DEFAULT_BODY_STATE, normalizeBodyState, type BodyState, type BodyTag } from '@/lib/bodyState'

interface BodyStateStore {
  enabled: boolean
  body: BodyState
  setEnabled: (enabled: boolean) => void
  refresh: (at?: number) => void
  afterReply: (at?: number) => void
  applyTag: (tag: BodyTag, at?: number) => void
}

interface PersistedBody {
  enabled?: boolean
  body?: unknown
}

function load(): Pick<BodyStateStore, 'enabled' | 'body'> {
  const raw = readJSON<PersistedBody>(STORAGE_KEYS.bodyState, {})
  return {
    enabled: raw?.enabled === true,
    body: normalizeBodyState(raw?.body ?? DEFAULT_BODY_STATE),
  }
}

function save(enabled: boolean, body: BodyState) {
  writeJSON(STORAGE_KEYS.bodyState, { enabled, body })
}

const initial = load()

export const useBodyStateStore = create<BodyStateStore>((set, get) => ({
  ...initial,
  setEnabled: (enabled) => {
    const body = currentBody(get().body)
    save(enabled, body)
    set({ enabled, body })
  },
  refresh: (at = Date.now()) => {
    const body = currentBody(get().body, at)
    save(get().enabled, body)
    set({ body })
  },
  afterReply: (at = Date.now()) => {
    if (!get().enabled) return
    const body = afterReplyBody(get().body, at)
    save(true, body)
    set({ body })
  },
  applyTag: (tag, at = Date.now()) => {
    if (!get().enabled) return
    const body = applyBodyTag(get().body, tag, at)
    save(true, body)
    set({ body })
  },
}))
