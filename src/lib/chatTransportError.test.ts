import { describe, expect, it } from 'vitest'
import { isFailedTransportMessage } from './chatTransportError'

describe('failed transport messages', () => {
  it('recognizes only stored companion error placeholders', () => {
    const text = '（消息没送到：This request requires more credits, or fewer max_tokens.）'
    expect(isFailedTransportMessage({ role: 'companion', text })).toBe(true)
    expect(isFailedTransportMessage({ role: 'me', text })).toBe(false)
    expect(isFailedTransportMessage({ role: 'companion', text: '我在这里。' })).toBe(false)
  })
})
