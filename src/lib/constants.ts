/** 全局常量与 localStorage key 命名空间 */

export const APP_NAME = '伯恩主屋 · 长期记忆'
export const APP_VERSION = '0.1.0'

/** localStorage key 统一前缀，避免与其他应用冲突 */
const NS = 'burne-home-core'

export const STORAGE_KEYS = {
  memories: `${NS}:memories`,
  settings: `${NS}:settings`,
  notionConfig: `${NS}:notion-config`,
  privacy: `${NS}:privacy`,
} as const

/** 当前窗口 ID（用于「跨窗口回忆」）—— 每个标签页一个，会话级 */
export const CURRENT_WINDOW_ID =
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `win-${Date.now()}`)

export const BACKUP_VERSION = 1
