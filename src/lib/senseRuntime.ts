import {
  SenseInteractionRuntime,
  type SenseKind,
  type SensorEventBundle,
  permissionMessage,
} from '@/lib/senseInteraction'
import { useSenseStore } from '@/store/senseStore'

const runtime = new SenseInteractionRuntime({
  getTouchElement: () => document.querySelector('.bw-chat-messages') || undefined,
  onPermissionError: (kind, message) => useSenseStore.getState().setPermissionMessage(kind, message),
  onBundle: (bundle) => {
    window.dispatchEvent(new CustomEvent<SensorEventBundle>('bw:sense-bundle', { detail: bundle }))
  },
})

const ALL_KINDS: SenseKind[] = ['blow', 'shake', 'rotation', 'longPress']
let started = false

export async function setSenseKind(kind: SenseKind, enabled: boolean): Promise<boolean> {
  if (!enabled) {
    runtime.disable(kind)
    useSenseStore.getState().setKind(kind, false)
    return false
  }
  useSenseStore.getState().clearPermissionMessage(kind)
  try {
    await runtime.set(kind, true)
    useSenseStore.getState().setKind(kind, true)
    return true
  } catch (error) {
    useSenseStore.getState().setKind(kind, false)
    useSenseStore.getState().setPermissionMessage(kind, permissionMessage(error))
    return false
  }
}

export async function setSenseEnabled(enabled: boolean) {
  useSenseStore.getState().setEnabled(enabled)
  if (!enabled) {
    runtime.pause()
    return
  }
  for (const kind of ALL_KINDS) {
    if (useSenseStore.getState()[kind]) await setSenseKind(kind, true)
  }
}

export async function startSavedSense() {
  if (started) return
  started = true
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) runtime.pause()
    else if (useSenseStore.getState().enabled) void runtime.resume()
  })
  if (!document.hidden && useSenseStore.getState().enabled) {
    for (const kind of ALL_KINDS) {
      if (useSenseStore.getState()[kind]) await setSenseKind(kind, true)
    }
  }
}

export { runtime as senseRuntime }
