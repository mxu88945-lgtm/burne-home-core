import { create } from 'zustand'

export const PUSH_BASE = 'https://push.zhouweiweihome.top'
const PUSH_ON_KEY = 'burne-push-on'
const PUSH_DEVICE_KEY = 'burne-push-device'
const PUSH_PROACTIVE_KEY = 'burne-push-proactive'
export const PUSH_PROACTIVE_OPTIONS = [0, 1, 2, 3, 5] as const
export type PushProactivePerDay = (typeof PUSH_PROACTIVE_OPTIONS)[number]

function readOn() {
  try { return localStorage.getItem(PUSH_ON_KEY) === '1' } catch { return false }
}
function readDevice() {
  try { return localStorage.getItem(PUSH_DEVICE_KEY) || '' } catch { return '' }
}
function readProactive(): PushProactivePerDay {
  try {
    const value = Number(localStorage.getItem(PUSH_PROACTIVE_KEY) || 0)
    return (PUSH_PROACTIVE_OPTIONS as readonly number[]).includes(value) ? value as PushProactivePerDay : 0
  } catch { return 0 }
}
function persist(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* 本机存储失败时仍允许页面继续使用 */ }
}
function randomDevice() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}
export function createPushDevice() {
  return randomDevice()
}

interface PushState {
  enabled: boolean
  device: string
  proactivePerDay: PushProactivePerDay
  setEnabled: (enabled: boolean) => void
  setDevice: (device: string) => void
  setProactivePerDay: (value: PushProactivePerDay) => void
}

export const usePushStore = create<PushState>((set) => ({
  enabled: readOn(),
  device: readDevice(),
  proactivePerDay: readProactive(),
  setEnabled: (enabled) => {
    persist(PUSH_ON_KEY, enabled ? '1' : '0')
    set({ enabled })
  },
  setDevice: (device) => {
    persist(PUSH_DEVICE_KEY, device)
    set({ device })
  },
  setProactivePerDay: (value) => {
    persist(PUSH_PROACTIVE_KEY, String(value))
    set({ proactivePerDay: value })
  },
}))

/** 只读取已有 device；不会因为 role-wake 或拉取消息而新建设备。 */
export function getExistingPushDevice() {
  return readDevice()
}

/** 仅在用户完成开启推送流程后调用。 */
export function ensurePushDevice() {
  const existing = readDevice()
  if (existing) return existing
  const device = randomDevice()
  persist(PUSH_DEVICE_KEY, device)
  usePushStore.setState({ device })
  return device
}

export function pushIsReady() {
  return readOn() && !!readDevice()
}

export function pushUrl() {
  return `${location.origin}${location.pathname}`
}
