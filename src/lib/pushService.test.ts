import { describe, expect, it, beforeEach, vi } from 'vitest'
import { appendPushMessage, pullPushInbox, sendTestPush } from './pushService'
import { PUSH_PROACTIVE_OPTIONS, pushIsReady, usePushStore } from '@/store/pushStore'
import { useChatStore, type ChatSession } from '@/store/chatStore'

function session(): ChatSession {
  return {
    id: 'push-test-session',
    title: '测试对话',
    messages: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
}

const localValues = new Map<string, string>()

describe('push proactive inbox', () => {
  beforeEach(() => {
    localValues.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => localValues.get(key) ?? null,
        setItem: (key: string, value: string) => localValues.set(key, value),
        removeItem: (key: string) => localValues.delete(key),
        key: (index: number) => [...localValues.keys()][index] ?? null,
        get length() { return localValues.size },
      },
    })
    useChatStore.getState().replaceSessions([session()])
    useChatStore.getState().switchSession('push-test-session')
  })

  it('only accepts supported proactive per-day options', () => {
    expect(PUSH_PROACTIVE_OPTIONS).toEqual([0, 1, 2, 3, 5])
  })

  it('adds a push message to the recent chat and deduplicates by id', () => {
    const item = { id: 'server-message-1', text: '我刚刚想起你了。', ts: 1700000000000 }
    expect(appendPushMessage(item)).toBe(true)
    expect(appendPushMessage(item)).toBe(false)
    const messages = useChatStore.getState().sessions[0].messages
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      text: item.text,
      role: 'companion',
      proactiveSource: 'push',
      proactiveId: 'push:server-message-1',
    })
  })

  it('is not ready without a locally saved device and enabled flag', () => {
    expect(pushIsReady()).toBe(false)
    expect(usePushStore.getState().enabled).toBe(false)
  })

  it('posts the existing device to the test endpoint', async () => {
    localValues.set('burne-push-on', '1')
    localValues.set('burne-push-device', 'device-test')
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://example.test', pathname: '/burne-home-core/' } })
    const fetchMock = async (url: string, init: RequestInit) => {
      expect(url).toBe('https://push.zhouweiweihome.top/test')
      expect(JSON.parse(String(init.body))).toMatchObject({ device: 'device-test', title: '伯恩' })
      return { ok: true, json: async () => ({ ok: true }) }
    }
    vi.stubGlobal('fetch', fetchMock)
    await sendTestPush('伯恩')
  })

  it('pulls inbox messages and acknowledges every returned id', async () => {
    localValues.set('burne-push-on', '1')
    localValues.set('burne-push-device', 'device-test')
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url)
      return calls.length === 1
        ? { ok: true, json: async () => ({ messages: [{ id: 'inbox-1', text: '记得喝水。' }] }) }
        : { ok: true, json: async () => ({ ok: true }) }
    })
    expect(await pullPushInbox()).toBe(1)
    expect(calls).toEqual([
      'https://push.zhouweiweihome.top/inbox',
      'https://push.zhouweiweihome.top/ack',
    ])
    expect(useChatStore.getState().sessions[0].messages[0].proactiveId).toBe('push:inbox-1')
  })
})
