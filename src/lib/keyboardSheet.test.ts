import { describe, expect, it } from 'vitest'
import { centeredScrollTop } from './keyboardSheet'

describe('keyboard-aware sheet centering', () => {
  it('centers a field that sits below the visible area', () => {
    expect(centeredScrollTop({ elTop: 400, elHeight: 52, viewHeight: 300, scrollHeight: 600 })).toBe(276)
  })
  it('never scrolls above the top', () => {
    expect(centeredScrollTop({ elTop: 20, elHeight: 52, viewHeight: 300, scrollHeight: 600 })).toBe(0)
  })
  it('clamps to the maximum scroll', () => {
    expect(centeredScrollTop({ elTop: 560, elHeight: 40, viewHeight: 300, scrollHeight: 600 })).toBe(300)
  })
  it('does nothing when the content fits', () => {
    expect(centeredScrollTop({ elTop: 200, elHeight: 52, viewHeight: 500, scrollHeight: 480 })).toBe(0)
  })
})
