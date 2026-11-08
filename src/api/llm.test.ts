import { describe, expect, it } from 'vitest'
import { withThinkingRoom } from '@/api/llm'

describe('withThinkingRoom', () => {
  it('adds a thinking budget on top of the reply length only when thinking is on', () => {
    expect(withThinkingRoom(4096, {})).toBe(4096)
    expect(withThinkingRoom(0, { reasoning: true })).toBe(0)
    expect(withThinkingRoom(4096, { reasoning: true })).toBe(12096)
    expect(withThinkingRoom(4096, { reasoning: true, reasoningEffort: 'high' })).toBe(12288)
  })
})
