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
  const el = () => ({ setAttribute() {}, replaceWith() {} })
  const root = { dataset: {} as Record<string, string>, style: { setProperty() {}, removeProperty() {} } }
  Object.defineProperty(globalThis, 'document', { value: { documentElement: root, querySelector: () => null, createElement: el, head: { appendChild() {} } }, configurable: true })
  vi.resetModules()
})

describe('chat font per theme', () => {
  it('keeps old size, drops old global weight, and stores per theme', async () => {
    localStorage.setItem(`${STORAGE_KEYS.theme}:chat-font`, JSON.stringify({ size: 14.5, weight: 600 }))
    localStorage.setItem(STORAGE_KEYS.theme, JSON.stringify({ id: 'warmtea' }))
    const m = await import('./themeStore')
    expect(m.readStoredChatFont('warmtea')).toEqual({ size: 14.5, weight: 0 })
    m.useChatFontStore.getState().setChatFont({ weight: 500 })
    expect(m.readStoredChatFont('warmtea').weight).toBe(500)
    expect(m.readStoredChatFont('claude').weight).toBe(0)
    m.useThemeStore.getState().setTheme('claude')
    expect(m.useChatFontStore.getState().chatFont.weight).toBe(0)
    m.useThemeStore.getState().setTheme('warmtea')
    expect(m.useChatFontStore.getState().chatFont.weight).toBe(500)
  })
})
