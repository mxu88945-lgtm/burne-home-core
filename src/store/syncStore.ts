/**
 * 多端同步配置（Zustand，本地持久化）。
 * workerUrl / spaceId / syncKey 只存本地、不提交仓库。
 * deviceId 本设备唯一，生成一次后持久化。
 */

import { create } from 'zustand'
import type { SyncStatus } from '@/types/memory'
import type { SyncRemoteConfig } from '@/api/sync'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS, getDeviceId } from '@/lib/constants'
import { env } from '@/config/env'

interface SyncConfig extends SyncRemoteConfig {
  /** 自动同步（启动时 / 间隔） */
  autoSync: boolean
  lastSyncedAt?: string
}

const defaults: SyncConfig = {
  workerUrl: env.syncWorkerUrl || undefined,
  spaceId: env.syncSpaceId || undefined,
  autoSync: false,
}

interface SyncState {
  deviceId: string
  config: SyncConfig
  status: SyncStatus
  setConfig: (patch: Partial<SyncConfig>) => void
  setStatus: (s: SyncStatus) => void
  markSynced: () => void
}

export const useSyncStore = create<SyncState>((set, get) => ({
  deviceId: getDeviceId(),
  config: readJSON<SyncConfig>(STORAGE_KEYS.sync, defaults),
  status: 'idle',

  setConfig: (patch) => {
    const next = { ...get().config, ...patch }
    writeJSON(STORAGE_KEYS.sync, next)
    set({ config: next })
  },
  setStatus: (status) => set({ status }),
  markSynced: () => {
    const next = { ...get().config, lastSyncedAt: new Date().toISOString() }
    writeJSON(STORAGE_KEYS.sync, next)
    set({ config: next })
  },
}))
