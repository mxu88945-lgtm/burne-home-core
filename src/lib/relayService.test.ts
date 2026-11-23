import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canUseRelay, getRelayConfig, getRelayPending, recoverPendingRelay, saveRelayConfig, startRelay } from './relayService'

const channel = { id: 'main', name: '主', provider: 'openai' as const, baseUrl: 'https://api.example.com/v1', apiKey: 'model-secret', model: 'model' }

const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  clear: () => storage.clear(),
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  key: (index: number) => [...storage.keys()][index] ?? null,
  get length() { return storage.size },
})

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('lock-screen relay', () => {
  it('is disabled by default and stores config outside the backup namespace', () => {
    expect(getRelayConfig()).toEqual({ enabled: false, url: '', key: '' })
    saveRelayConfig({ enabled: true, url: 'https://relay.example', key: 'relay-secret' })
    expect(canUseRelay(channel)).toBe(true)
    expect(localStorage.key(0)).toBe('burne-local.relay')
    expect(localStorage.getItem('burne-home-core:relay')).toBeNull()
  })

  it('sends Bearer auth, model key only in the request, and pending is cleared on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('hello from relay', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    saveRelayConfig({ enabled: true, url: 'https://relay.example/', key: 'relay-secret' })
    await expect(startRelay({ id: 'r1', sessionId: 's1', channel, messages: [{ role: 'user', content: 'hi' }], system: 'sys' })).resolves.toBe('hello from relay')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://relay.example/start')
    expect(init.headers.Authorization).toBe('Bearer relay-secret')
    const body = JSON.parse(init.body)
    expect(body.key).toBe('model-secret')
    expect(body.body.stream).toBe(true)
    expect(getRelayPending()).toEqual([])
  })

  it('keeps pending when the phone loses the start connection, then recovers through result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))
    saveRelayConfig({ enabled: true, url: 'https://relay.example', key: 'relay-secret' })
    await expect(startRelay({ id: 'r2', sessionId: 's2', channel, messages: [], system: '' })).rejects.toThrow('Failed to fetch')
    expect(getRelayPending()).toHaveLength(1)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'done', text: '[记忆:她喜欢夜风]' }), { status: 200 })))
    const recovered = await recoverPendingRelay()
    expect(recovered[0].result.text).toContain('夜风')
    expect(getRelayPending()).toEqual([])
  })

  it('only includes push routing when push is already enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    saveRelayConfig({ enabled: true, url: 'https://relay.example', key: 'relay-secret' })
    await startRelay({ id: 'r3', sessionId: 's3', channel, messages: [], system: '' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).pushDevice).toBeUndefined()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).pushUrl).toBeUndefined()
  })
})
