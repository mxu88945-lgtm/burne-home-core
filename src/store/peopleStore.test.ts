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

describe('peopleStore', () => {
  it('seeds the four preset people once and persists tag changes', async () => {
    const { usePeopleStore } = await import('@/store/peopleStore')
    const s = usePeopleStore.getState()
    expect(s.people.map((p) => p.name)).toEqual(['顾屿', '裴屿', '顾祁砚', '伯恩'])
    expect(s.people.every((p) => p.background === '')).toBe(true)

    const r = s.applyTags([
      { name: '裴屿', content: '最近在学吉他' },
      { name: '裴屿', content: '最近在学吉他' },
      { name: '小林', content: '她的大学室友' },
    ])
    expect(r).toEqual({ created: 1, events: 1 })
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.people) || '[]')
    expect(saved.find((p: { name: string }) => p.name === '裴屿').events).toHaveLength(1)
    expect(saved.some((p: { name: string }) => p.name === '小林')).toBe(true)
  })

  it('does not bring back a preset she deleted', async () => {
    const first = (await import('@/store/peopleStore')).usePeopleStore
    const gu = first.getState().people.find((p) => p.name === '伯恩')!
    first.getState().removePerson(gu.id)
    vi.resetModules()
    const second = (await import('@/store/peopleStore')).usePeopleStore
    expect(second.getState().people.some((p) => p.name === '伯恩')).toBe(false)
  })

  it('supports add / edit / event CRUD', async () => {
    const { usePeopleStore } = await import('@/store/peopleStore')
    const p = usePeopleStore.getState().addPerson('阿宁', { aliases: ['宁宁'], background: '邻居' })!
    usePeopleStore.getState().updatePerson(p.id, { background: '楼下邻居' })
    usePeopleStore.getState().addEvent(p.id, '送了橘子', '2026-11-01')
    let cur = usePeopleStore.getState().people.find((x) => x.id === p.id)!
    expect(cur.background).toBe('楼下邻居')
    expect(cur.events[0]).toMatchObject({ date: '2026-11-01', text: '送了橘子' })
    usePeopleStore.getState().updateEvent(p.id, cur.events[0].id, { text: '送了两个橘子' })
    cur = usePeopleStore.getState().people.find((x) => x.id === p.id)!
    expect(cur.events[0].text).toBe('送了两个橘子')
    usePeopleStore.getState().removeEvent(p.id, cur.events[0].id)
    expect(usePeopleStore.getState().people.find((x) => x.id === p.id)!.events).toEqual([])
  })
})
