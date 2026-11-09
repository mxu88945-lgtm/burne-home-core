import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '@/lib/constants'

class MapStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, String(value)) }
}

const idb = new Map<string, unknown>()
vi.mock('@/lib/idb', () => ({
  idbGet: async (k: string) => idb.get(k) ?? null,
  idbSet: async (k: string, v: unknown) => { idb.set(k, v) },
  idbDel: async (k: string) => { idb.delete(k) },
}))
vi.mock('@/api/largeStorage', () => ({ flushLargeStorage: async () => {} }))

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MapStorage(), configurable: true })
  idb.clear()
  vi.resetModules()
})

describe('album store', () => {
  it('keeps the image in IDB, metadata in localStorage, and is included in full backup', async () => {
    const { useAlbumStore } = await import('@/store/albumStore')
    const entry = await useAlbumStore.getState().addPhoto('data:image/jpeg;base64,AAA', { title: '海边', category: 'me' })
    expect(entry.src).toBe(`idb:album:${entry.id}`)
    expect(idb.get(`album:${entry.id}`)).toBe('data:image/jpeg;base64,AAA')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.album) || '[]')
    expect(stored[0].title).toBe('海边')
    expect(JSON.stringify(stored)).not.toContain('base64')

    const { buildFullBackup } = await import('@/api/backup')
    const b = await buildFullBackup(false)
    expect(b.idb?.[`album:${entry.id}`]).toBe('data:image/jpeg;base64,AAA')

    useAlbumStore.getState().removeEntry(entry.id)
    await new Promise((r) => setTimeout(r, 0))
    expect(useAlbumStore.getState().entries).toEqual([])
    expect(idb.has(`album:${entry.id}`)).toBe(false)
  })
})

describe('diary store', () => {
  it('saves pages, skips duplicates and short ones, deletes', async () => {
    const { useDiaryStore } = await import('@/store/diaryStore')
    const s = useDiaryStore.getState()
    expect(s.addEntry('她今天终于肯说自己累了，我心里松了一口气。', 'm1')).toBe(true)
    expect(s.addEntry('她今天终于肯说自己累了，我心里松了一口气。')).toBe(false)
    expect(s.addEntry('短')).toBe(false)
    const list = useDiaryStore.getState().entries
    expect(list.length).toBe(1)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.diary) || '[]')[0].sourceMessageId).toBe('m1')
    useDiaryStore.getState().removeEntry(list[0].id)
    expect(useDiaryStore.getState().entries).toEqual([])
  })
})
