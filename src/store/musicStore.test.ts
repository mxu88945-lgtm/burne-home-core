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

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MapStorage(), configurable: true })
  vi.resetModules()
})

const three = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C' },
]

describe('musicStore.removeTracks', () => {
  it('removes several tracks at once and keeps the active one when it survives', async () => {
    const { useMusicStore } = await import('@/store/musicStore')
    const s = useMusicStore.getState()
    s.addTracks(three)
    s.setActive('c')
    useMusicStore.getState().removeTracks(['a', 'b'])
    const st = useMusicStore.getState()
    expect(st.tracks.map((t) => t.id)).toEqual(['c'])
    expect(st.activeId).toBe('c')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.music) || '{}').tracks).toHaveLength(1)
  })

  it('moves active to the first remaining track when the active one is deleted', async () => {
    const { useMusicStore } = await import('@/store/musicStore')
    useMusicStore.getState().addTracks(three)
    useMusicStore.getState().setActive('b')
    useMusicStore.getState().removeTracks(['a', 'b'])
    expect(useMusicStore.getState().activeId).toBe('c')
    useMusicStore.getState().removeTracks(['c'])
    expect(useMusicStore.getState().tracks).toEqual([])
    expect(useMusicStore.getState().activeId).toBe('')
  })

  it('single removeTrack still works', async () => {
    const { useMusicStore } = await import('@/store/musicStore')
    useMusicStore.getState().addTracks(three)
    useMusicStore.getState().removeTrack('a')
    expect(useMusicStore.getState().tracks.map((t) => t.id)).toEqual(['b', 'c'])
    expect(useMusicStore.getState().activeId).toBe('b')
  })
})
