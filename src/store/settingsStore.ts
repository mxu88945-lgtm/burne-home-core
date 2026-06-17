/**
 * Notion 同步配置状态（Zustand）。
 *
 * ⚠️ token 等敏感字段只存浏览器本地，绝不提交仓库、绝不写死。
 * 这一轮只做配置的本地读写，真正的同步逻辑第三轮实现。
 */

import { create } from 'zustand'
import type { NotionSyncConfig, SyncStatus } from '@/types/memory'
import { readJSON, writeJSON } from '@/api/storage'
import { STORAGE_KEYS } from '@/lib/constants'
import { env } from '@/config/env'

interface SettingsState {
  notion: NotionSyncConfig
  syncStatus: SyncStatus
  setNotionConfig: (patch: Partial<NotionSyncConfig>) => void
  setSyncStatus: (status: SyncStatus) => void
}

const defaultNotion: NotionSyncConfig = {
  enabled: false,
  proxyUrl: env.notionProxyUrl || undefined,
  databaseId: env.notionDatabaseId || undefined,
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  notion: readJSON<NotionSyncConfig>(STORAGE_KEYS.notionConfig, defaultNotion),
  syncStatus: 'idle',

  setNotionConfig: (patch) => {
    const next = { ...get().notion, ...patch }
    writeJSON(STORAGE_KEYS.notionConfig, next)
    set({ notion: next })
  },

  setSyncStatus: (status) => set({ syncStatus: status }),
}))
