import { create } from 'zustand'

const ENABLED_KEY = 'burne-role-wake-enabled'
const URL_KEY = 'burne-role-wake-url'
const SECRET_KEY = 'burne-role-wake-key'

function read(key: string) {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* 本机存储失败不阻断聊天 */ }
}

export interface RoleWakeConfig {
  enabled: boolean
  url: string
  key: string
}
interface RoleWakeState extends RoleWakeConfig {
  setConfig: (patch: Partial<RoleWakeConfig>) => void
}

export const useRoleWakeStore = create<RoleWakeState>((set, get) => ({
  enabled: read(ENABLED_KEY) === '1',
  url: read(URL_KEY),
  key: read(SECRET_KEY),
  setConfig: (patch) => {
    const next = { enabled: patch.enabled ?? get().enabled, url: patch.url ?? get().url, key: patch.key ?? get().key }
    save(ENABLED_KEY, next.enabled ? '1' : '0')
    save(URL_KEY, next.url)
    save(SECRET_KEY, next.key)
    set(next)
  },
}))

export function roleWakeConfig(): RoleWakeConfig {
  return { enabled: read(ENABLED_KEY) === '1', url: read(URL_KEY).trim().replace(/\/+$/, ''), key: read(SECRET_KEY) }
}

export function roleWakeReady() {
  const config = roleWakeConfig()
  return config.enabled && /^https:\/\//i.test(config.url) && !!config.key
}
