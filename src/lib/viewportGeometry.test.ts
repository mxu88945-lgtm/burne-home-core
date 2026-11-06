import { describe, expect, it } from 'vitest'
import { resolveStandaloneFrame, resolveStandaloneViewport } from './viewportGeometry'

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

  it('uses visualViewport height without double-applying its page-pan offset', () => {
    const result = resolveStandaloneFrame({
      fullHeight: 852,
      visualHeight: 477,
      offsetTop: 68,
      lastKeyboardInset: 307,
    })

    expect(result.keyboardOpen).toBe(true)
    expect(result.readingSane).toBe(true)
    expect(result.frameHeight).toBe(477)
    expect(result.frameOffset).toBe(0)
  })

  it('keeps the last sane keyboard boundary when WebKit briefly collapses the viewport', () => {
    const result = resolveStandaloneFrame({
      fullHeight: 852,
      visualHeight: 148,
      offsetTop: 64,
      lastKeyboardInset: 307,
    })

    expect(result.readingSane).toBe(false)
    expect(result.frameHeight).toBe(545)
    expect(result.frameOffset).toBe(0)
  })
})
