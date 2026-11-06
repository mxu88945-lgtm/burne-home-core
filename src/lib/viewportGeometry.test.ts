import { describe, expect, it } from 'vitest'
import { resolveStandaloneViewport } from './viewportGeometry'

describe('iPhone standalone viewport geometry', () => {
  it('keeps the app full height and reserves a normal keyboard inset', () => {
    expect(resolveStandaloneViewport({ fullHeight: 852, visualHeight: 520 })).toEqual({
      appHeight: 852,
      keyboardInset: 332,
      keyboardOpen: true,
      readingSane: true,
    })
  })

  it('does not collapse the app when WebKit reports an impossibly tiny viewport', () => {
    const result = resolveStandaloneViewport({
      fullHeight: 852,
      visualHeight: 148,
      lastKeyboardInset: 332,
    })
    expect(result.appHeight).toBe(852)
    expect(result.keyboardInset).toBe(332)
    expect(result.readingSane).toBe(false)
  })

  it('clears the keyboard inset after the keyboard closes', () => {
    const result = resolveStandaloneViewport({
      fullHeight: 852,
      visualHeight: 844,
      lastKeyboardInset: 332,
    })
    expect(result.keyboardOpen).toBe(false)
    expect(result.keyboardInset).toBe(0)
  })
})
