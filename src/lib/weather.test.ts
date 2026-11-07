import { describe, it, expect, beforeEach } from 'vitest'
import { buildWeatherNote, elapsedNote, simplifyPlace, WX_CACHE_KEY } from './weather'

const mem = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  },
})

describe('weather note', () => {
  beforeEach(() => localStorage.clear())
  it('无缓存或关闭时不注入', () => {
    expect(buildWeatherNote(true)).toBe('')
    localStorage.setItem(WX_CACHE_KEY, JSON.stringify({ temp: 22, code: 61, high: 25, low: 18, at: Date.now(), place: '廣東省潮州市', tomorrow: { high: 19, low: 14, code: 63 } }))
    expect(buildWeatherNote(false)).toBe('')
  })
  it('注入地名、天气和明天提醒', () => {
    localStorage.setItem(WX_CACHE_KEY, JSON.stringify({ temp: 22, code: 61, high: 25, low: 18, at: Date.now(), place: '廣東省潮州市', tomorrow: { high: 19, low: 14, code: 63 } }))
    const n = buildWeatherNote(true)
    expect(n).toContain('广东省潮州市')
    expect(n).toContain('雨')
    expect(n).toContain('带伞')
    expect(n).toContain('降温6°C')
  })
  it('缓存超过 3 小时不注入', () => {
    localStorage.setItem(WX_CACHE_KEY, JSON.stringify({ temp: 22, code: 0, high: 25, low: 18, at: Date.now() - 4 * 3600_000 }))
    expect(buildWeatherNote(true)).toBe('')
  })
  it('简繁转换', () => expect(simplifyPlace('湘橋區')).toBe('湘桥区'))
})

describe('elapsedNote', () => {
  const now = Date.now()
  it('超过一小时才提，刚发的那条不算', () => {
    const msgs = [{ role: 'companion', ts: now - 3 * 3600_000 - 5 * 60_000 }, { role: 'me', ts: now - 1000 }]
    expect(elapsedNote(msgs, now)).toContain('3小时5分钟')
    expect(elapsedNote([{ role: 'companion', ts: now - 20 * 60_000 }], now)).toBe('')
    expect(elapsedNote([{ role: 'me' }], now)).toBe('')
  })
})
