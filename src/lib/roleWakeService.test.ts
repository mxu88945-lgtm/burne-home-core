import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appendRoleWakeMessage, pullRoleWakeInbox, syncRoleWakeAfterChat } from './roleWakeService'
import { useChatStore, type ChatSession } from '@/store/chatStore'

const values = new Map<string, string>()
const testSession: ChatSession = {
  id: 'wake-session',
  title: '测试对话',
  messages: [{ id: 'm1', role: 'me', text: '今天有点累。', at: '10:00' }],
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
}

beforeEach(() => {
  values.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size },
    },
  })
  useChatStore.getState().replaceSessions([testSession])
  useChatStore.getState().switchSession(testSession.id)
})

describe('role-wake client', () => {
  it('does not create or send push fields when push is not enabled', async () => {
    values.set('burne-role-wake-enabled', '1')
    values.set('burne-role-wake-url', 'https://wake.example.test')
    values.set('burne-role-wake-key', 'wake-key')
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      expect(body.pushDevice).toBeUndefined()
      expect(body.pushUrl).toBeUndefined()
      return { ok: true }
    })
    expect(await syncRoleWakeAfterChat()).toBe(true)
    expect(values.has('burne-push-device')).toBe(false)
  })

  it('adds a push device and URL only when push is already ready', async () => {
    values.set('burne-role-wake-enabled', '1')
    values.set('burne-role-wake-url', 'https://wake.example.test')
    values.set('burne-role-wake-key', 'wake-key')
    values.set('burne-push-on', '1')
    values.set('burne-push-device', 'existing-device')
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://example.test', pathname: '/burne-home-core/' } })
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      expect(body.pushDevice).toBe('existing-device')
      expect(body.pushUrl).toBe('https://example.test/burne-home-core/')
      return { ok: true }
    })
    expect(await syncRoleWakeAfterChat()).toBe(true)
  })

  it('pulls role-wake inbox without ack and deduplicates by wake id', async () => {
    values.set('burne-role-wake-enabled', '1')
    values.set('burne-role-wake-url', 'https://wake.example.test')
    values.set('burne-role-wake-key', 'wake-key')
    let calls = 0
    vi.stubGlobal('fetch', async () => {
      calls++
      return { ok: true, json: async () => ({ messages: [{ id: 'wake-1', text: '我来找你了。' }] }) }
    })
    expect(await pullRoleWakeInbox()).toBe(1)
    expect(appendRoleWakeMessage({ id: 'wake-1', text: '我来找你了。' })).toBe(false)
    expect(calls).toBe(1)
    expect(useChatStore.getState().sessions[0].messages.at(-1)?.proactiveId).toBe('role-wake:wake-1')
  })
})
