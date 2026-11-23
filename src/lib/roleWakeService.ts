import { usePersonaStore } from '@/store/personaStore'
import { useMemoryStore } from '@/store/memoryStore'
import { latestSessionId, useChatStore, type ChatMsg } from '@/store/chatStore'
import { currentPushUrl, existingPushDevice } from '@/lib/pushService'
import { pushIsReady } from '@/store/pushStore'
import { roleWakeConfig, roleWakeReady } from '@/store/roleWakeStore'
import { isPaused } from '@/lib/pauseState'
import { usePauseStateStore } from '@/store/pauseStateStore'

const ROLE_ID = 'burne-main'

function headers() {
  return { Authorization: `Bearer ${roleWakeConfig().key}`, 'Content-Type': 'application/json' }
}
function personaSummary() {
  const persona = usePersonaStore.getState().persona
  const memories = useMemoryStore.getState().memories
    .filter((item) => item.kind === 'long')
    .slice(0, 30)
    .map((item) => `【${item.title}】${item.content}`)
    .join('\n')
  return [persona.systemPrompt, persona.systemInstruction, ...(persona.presets || []).filter((item) => item.enabled).map((item) => item.content), `长期记忆：\n${memories}`]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 6000)
}
function recentSummary() {
  const { sessions, activeId } = useChatStore.getState()
  const session = sessions.find((item) => item.id === activeId) || sessions.find((item) => item.id === latestSessionId(sessions))
  return (session?.messages || [])
    .filter((item) => !item.failed && !item.sensorEvent)
    .slice(-8)
    .map((item) => `${item.role === 'me' ? '她' : '他'}：${item.text.replace(/\s+/g, ' ').slice(0, 260)}`)
    .join('\n')
    .slice(-1800)
}

export async function syncRoleWakeAfterChat() {
  const pause = usePauseStateStore.getState()
  if (pause.enabled && isPaused({ pausedUntil: pause.pausedUntil })) return false
  if (!roleWakeReady()) return false
  const config = roleWakeConfig()
  const body: Record<string, unknown> = {
    roleId: ROLE_ID,
    roleName: usePersonaStore.getState().persona.name || '伯恩',
    personaSummary: personaSummary(),
    recentSummary: recentSummary(),
    lastChatAt: Date.now(),
  }
  // 只读取已有 device；role-wake 关闭推送时绝不会帮忙生成一个。
  if (pushIsReady() && existingPushDevice()) {
    body.pushDevice = existingPushDevice()
    body.pushUrl = currentPushUrl()
  }
  try {
    const response = await fetch(`${config.url}/sync`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
    return response.ok
  } catch {
    return false
  }
}

function targetSessionId() {
  const { sessions, activeId } = useChatStore.getState()
  return sessions.some((item) => item.id === activeId) ? activeId : latestSessionId(sessions)
}

export function appendRoleWakeMessage(item: { id?: string; wakeId?: string; text?: string; ts?: number }) {
  const text = String(item.text || '').trim()
  const id = String(item.wakeId || item.id || '').trim()
  if (!text || !id) return false
  const proactiveId = `role-wake:${id}`
  const { sessions } = useChatStore.getState()
  if (sessions.some((session) => session.messages.some((message) => message.proactiveId === proactiveId))) return false
  const message: ChatMsg = {
    id: `role-wake-msg-${id}`,
    role: 'companion',
    text,
    at: new Date(item.ts || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    ts: item.ts || Date.now(),
    proactiveSource: 'role-wake',
    proactiveId,
  }
  const sessionId = targetSessionId()
  if (sessionId) useChatStore.getState().appendToSession(sessionId, message)
  else useChatStore.getState().setMessages([message])
  return true
}

let inboxBusy = false
export async function pullRoleWakeInbox() {
  const pause = usePauseStateStore.getState()
  if (pause.enabled && isPaused({ pausedUntil: pause.pausedUntil })) return 0
  if (!roleWakeReady() || inboxBusy) return 0
  inboxBusy = true
  try {
    const config = roleWakeConfig()
    const response = await fetch(`${config.url}/inbox?roleId=${encodeURIComponent(ROLE_ID)}`, { headers: headers() })
    if (!response.ok) return 0
    const body = await response.json() as { messages?: Array<{ id?: string; wakeId?: string; text?: string; ts?: number }> }
    const list = Array.isArray(body.messages) ? body.messages : []
    let added = 0
    for (const item of list) if (appendRoleWakeMessage(item)) added++
    return added
  } catch {
    return 0
  } finally {
    inboxBusy = false
  }
}

let runtimeStarted = false
export function startRoleWakeRuntime() {
  if (runtimeStarted) return
  runtimeStarted = true
  const pull = () => { if (!document.hidden) void pullRoleWakeInbox() }
  pull()
  document.addEventListener('visibilitychange', pull)
  window.addEventListener('focus', pull)
}
