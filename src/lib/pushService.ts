import { buildPersonaExtras } from '@/store/personaStore'
import { usePersonaStore } from '@/store/personaStore'
import { useMemoryStore } from '@/store/memoryStore'
import { useProfileStore } from '@/store/profileStore'
import { latestSessionId, useChatStore, type ChatMsg } from '@/store/chatStore'
import {
  createPushDevice,
  getExistingPushDevice,
  pushIsReady,
  PUSH_BASE,
  pushUrl,
  usePushStore,
  type PushProactivePerDay,
} from '@/store/pushStore'

export type PushInboxMessage = { id?: string; text?: string; body?: string; ts?: number; conv?: string }

function keyBytes(base64: string) {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64.length + 3) % 4)
  const raw = atob(normalized)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

async function pushPost<T = unknown>(path: string, data: Record<string, unknown> = {}, allowDisabled = false, deviceOverride?: string): Promise<T> {
  const device = deviceOverride || getExistingPushDevice()
  if (!allowDisabled && (!pushIsReady() || !device)) throw new Error('推送还没有开启')
  const response = await fetch(`${PUSH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(device ? { device } : {}), ...data }),
  })
  if (!response.ok) throw new Error(`推送服务 ${response.status}`)
  return await response.json() as T
}

export function currentPushUrl() {
  return pushUrl()
}

export function isPushSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
}

export async function registerPushServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  const base = import.meta.env.BASE_URL || '/'
  const url = `${base.replace(/\/$/, '')}/sw.js`
  return navigator.serviceWorker.register(url, { scope: base })
}

export async function enablePush(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isPushSupported()) return { ok: false, message: '请先从 iPhone 主屏幕打开伯恩，且系统支持网页推送。' }
  if (Notification.permission === 'denied') return { ok: false, message: '通知权限被拒了：请到 iPhone 设置 → 通知 → 伯恩主屋里打开。' }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, message: '没有拿到通知权限；你可以稍后再点开启。' }
    await registerPushServiceWorker()
    const registration = await navigator.serviceWorker.ready
    const vapid = await fetch(`${PUSH_BASE}/vapid`)
    if (!vapid.ok) throw new Error('推送服务暂时不可用')
    const { publicKey } = await vapid.json() as { publicKey?: string }
    if (!publicKey) throw new Error('推送服务没有返回公钥')
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
    }
    const device = getExistingPushDevice() || createPushDevice()
    await pushPost('/subscribe', { subscription: subscription.toJSON() }, true, device)
    usePushStore.getState().setDevice(device)
    usePushStore.getState().setEnabled(true)
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? `开启失败：${error.message}` : '开启失败，请稍后再试。' }
  }
}

export async function sendTestPush(name: string) {
  await pushPost('/test', { title: name || '伯恩', body: '我在。以后到点就这样叫你。', url: currentPushUrl() })
}

export async function disablePush() {
  if (pushIsReady()) await pushPost('/context', { perDay: 0 }).catch(() => undefined)
  usePushStore.getState().setEnabled(false)
}

function longMemoryText() {
  return useMemoryStore.getState().memories
    .filter((item) => item.kind === 'long')
    .slice(0, 40)
    .map((item) => `【${item.title}】${item.content}`)
    .join('\n')
    .slice(0, 9000)
}

function recentText() {
  const { sessions, activeId } = useChatStore.getState()
  const session = sessions.find((item) => item.id === activeId) || sessions.find((item) => item.id === latestSessionId(sessions))
  return (session?.messages || [])
    .filter((item) => !item.failed && !item.sensorEvent)
    .slice(-16)
    .map((item) => `${item.role === 'me' ? '她' : '他'}：${item.text.replace(/\s+/g, ' ').slice(0, 500)}`)
    .join('\n')
    .slice(-6000)
}

export async function syncPushContext() {
  if (!pushIsReady()) return false
  const persona = usePersonaStore.getState().persona
  const profile = useProfileStore.getState().profile
  const { activeId } = useChatStore.getState()
  const { proactivePerDay } = usePushStore.getState()
  const system = [persona.systemPrompt, buildPersonaExtras(persona), `用户称呼：${profile.nameA || '她'}`, `长期记忆：\n${longMemoryText()}`]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 16000)
  await pushPost('/context', {
    perDay: proactivePerDay,
    system,
    recent: recentText(),
    name: persona.name || '伯恩',
    conv: activeId || 'main',
    url: currentPushUrl(),
  })
  return true
}

function targetSessionId() {
  const { sessions, activeId } = useChatStore.getState()
  return sessions.some((item) => item.id === activeId) ? activeId : latestSessionId(sessions)
}

export function appendPushMessage(item: PushInboxMessage) {
  const text = String(item.text || item.body || '').trim()
  const rawId = String(item.id || '').trim()
  if (!text || !rawId) return false
  const proactiveId = `push:${rawId}`
  const { sessions } = useChatStore.getState()
  if (sessions.some((session) => session.messages.some((message) => message.proactiveId === proactiveId))) return false
  const message: ChatMsg = {
    id: `push-msg-${rawId}`,
    role: 'companion',
    text,
    at: new Date(item.ts || Date.now()).toISOString(),
    ts: item.ts || Date.now(),
    proactiveSource: 'push',
    proactiveId,
  }
  const sessionId = targetSessionId()
  if (sessionId) useChatStore.getState().appendToSession(sessionId, message)
  else useChatStore.getState().setMessages([message])
  return true
}

let inboxBusy = false
export async function pullPushInbox() {
  if (!pushIsReady() || inboxBusy) return 0
  inboxBusy = true
  try {
    const body = await pushPost<{ messages?: PushInboxMessage[] }>('/inbox')
    const list = Array.isArray(body.messages) ? body.messages : []
    if (!list.length) return 0
    let added = 0
    const ids: string[] = []
    for (const item of list) {
      if (item.id) ids.push(String(item.id))
      if (appendPushMessage(item)) added++
    }
    if (ids.length) await pushPost('/ack', { ids })
    return added
  } finally {
    inboxBusy = false
  }
}

export async function setPushProactivePerDay(value: PushProactivePerDay) {
  usePushStore.getState().setProactivePerDay(value)
  if (pushIsReady()) await syncPushContext()
}

export function existingPushDevice() {
  return getExistingPushDevice()
}

let runtimeStarted = false
export async function startPushRuntime() {
  if (runtimeStarted) return
  runtimeStarted = true
  await registerPushServiceWorker().catch(() => undefined)
  const pull = () => { if (!document.hidden) void pullPushInbox().catch(() => undefined) }
  pull()
  document.addEventListener('visibilitychange', pull)
  window.addEventListener('focus', pull)
}
