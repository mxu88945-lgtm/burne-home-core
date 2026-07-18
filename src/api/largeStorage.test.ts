import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { flushLargeStorage, loadLargeJSON, readLargeJSONSync, writeLargeJSON } from './largeStorage'
import { idbGet } from '@/lib/idb'
import { buildFullBackup } from './backup'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, String(value)) }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })
  Object.defineProperty(globalThis, 'CustomEvent', {
    value: class CustomEvent { constructor(public type: string, public init?: unknown) {} },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'dispatchEvent', { value: () => true, configurable: true })
})

describe('largeStorage', () => {
  it('先写入 IndexedDB，成功后才把旧 localStorage 换成引用', async () => {
    const key = `burne-home-core:test-migrate-${Date.now()}`
    const legacy = { scenes: [{ id: 's1', text: '完整旧剧情' }] }
    localStorage.setItem(key, JSON.stringify(legacy))

    expect(readLargeJSONSync(key, { scenes: [] })).toEqual(legacy)
    await expect(loadLargeJSON(key, { scenes: [] })).resolves.toEqual(legacy)

    const ref = JSON.parse(localStorage.getItem(key)!) as string
    expect(ref).toBe(`idb:state:${key}`)
    await expect(idbGet(ref.slice(4))).resolves.toEqual(legacy)
  })

  it('连续写入按顺序落盘，最后保留最新快照', async () => {
    const key = `burne-home-core:test-queue-${Date.now()}`
    writeLargeJSON(key, { version: 1 })
    writeLargeJSON(key, { version: 2 })
    await flushLargeStorage()

    await expect(loadLargeJSON(key, { version: 0 })).resolves.toEqual({ version: 2 })
  })

  it('引用存在但正文缺失时拒绝空状态启动', async () => {
    const key = `burne-home-core:test-missing-${Date.now()}`
    localStorage.setItem(key, JSON.stringify(`idb:state:${key}`))
    await expect(loadLargeJSON(key, { chars: [] })).rejects.toThrow('大型本地数据缺失')
  })

  it('安全备份会清掉所有独立模型配置里的密钥', async () => {
    localStorage.setItem('burne-home-core:api', JSON.stringify({ channels: [{ apiKey: 'main-secret' }] }))
    localStorage.setItem('burne-home-core:imagegen', JSON.stringify({ channels: [{ apiKey: 'image-secret' }] }))
    for (const key of ['vision', 'stt', 'tts', 'memory-model']) {
      localStorage.setItem(`burne-home-core:${key}`, JSON.stringify({ apiKey: `${key}-secret` }))
    }
    localStorage.setItem('burne-home-core:sync', JSON.stringify({ syncKey: 'sync-secret' }))
    localStorage.setItem('burne-home-core:notion-config', JSON.stringify({ token: 'notion-secret' }))

    const backup = await buildFullBackup(false)
    const store = backup.store as Record<string, any>
    expect(store['burne-home-core:api'].channels[0].apiKey).toBe('')
    expect(store['burne-home-core:imagegen'].channels[0].apiKey).toBe('')
    for (const key of ['vision', 'stt', 'tts', 'memory-model']) {
      expect(store[`burne-home-core:${key}`].apiKey).toBe('')
    }
    expect(store['burne-home-core:sync'].syncKey).toBeUndefined()
    expect(store['burne-home-core:notion-config'].token).toBeUndefined()
  })
})
