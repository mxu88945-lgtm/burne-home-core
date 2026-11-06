import { describe, expect, it } from 'vitest'
import { openaiReasoningFields } from './llm'

describe('openaiReasoningFields', () => {
  it('sends nothing when thinking is off', () => {
    expect(openaiReasoningFields({ reasoning: false, reasoningEffort: 'high' }, false)).toEqual({})
  })
  it('auto only enables thinking and leaves depth to the model', () => {
    expect(openaiReasoningFields({ reasoning: true }, false)).toEqual({ reasoning: { enabled: true } })
    expect(openaiReasoningFields({ reasoning: true, reasoningEffort: 'auto' }, true)).toEqual({ reasoning: { enabled: true } })
  })
  it('adds the official reasoning_effort outside OpenRouter', () => {
    expect(openaiReasoningFields({ reasoning: true, reasoningEffort: 'high' }, false)).toEqual({
      reasoning: { effort: 'high' },
      reasoning_effort: 'high',
    })
    expect(openaiReasoningFields({ reasoning: true, reasoningEffort: 'low' }, true)).toEqual({ reasoning: { effort: 'low' } })
  })
})
