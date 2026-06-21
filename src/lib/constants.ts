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
  theme: `${NS}:theme`,
  profile: `${NS}:profile`,
  sync: `${NS}:sync`,
  api: `${NS}:api`,
  persona: `${NS}:persona`,
  supabase: `${NS}:supabase`,
  usage: `${NS}:usage`,
  tts: `${NS}:tts`,
  appearance: `${NS}:appearance`,
  chat: `${NS}:chat`,
  imagegen: `${NS}:imagegen`,
  vision: `${NS}:vision`,
  chatprefs: `${NS}:chatprefs`,
  memoryOverview: `${NS}:memory-overview`,
} as const

/** 本设备 ID（多端同步用）—— 生成一次后持久化在本地 */
export function getDeviceId(): string {
  try {
    const k = `${NS}:device-id`
    let id = localStorage.getItem(k)
    if (!id) {
      id = 'randomUUID' in crypto ? crypto.randomUUID() : `dev-${Date.now()}`
      localStorage.setItem(k, id)
    }
    return id
  } catch {
    return `dev-${Date.now()}`
  }
}

/** 当前窗口 ID（用于「跨窗口回忆」）—— 每个标签页一个，会话级 */
export const CURRENT_WINDOW_ID =
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `win-${Date.now()}`)

export const BACKUP_VERSION = 1
