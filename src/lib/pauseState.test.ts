import { describe, expect, it } from 'vitest'
import { buildPausePrompt, isPaused, parsePauseTag, pauseLabel, pauseRemainingMs, stripPauseTags } from './pauseState'

describe('暂停的权利', () => {
  it('解析和剥掉暂停标记，并限制最短时长', () => {
    const raw = '我歇一会儿。\n［暂停:3分钟］'
    expect(parsePauseTag(raw)).toBe(5)
    expect(stripPauseTags(raw)).toBe('我歇一会儿。')
  })
  it('在到点前暂停，到点自动恢复', () => {
    const state = { pausedUntil: 10 * 60_000 }
    expect(isPaused(state, 1)).toBe(true)
    expect(pauseRemainingMs(state, 1)).toBe(599_999)
    expect(isPaused(state, 10 * 60_000)).toBe(false)
    expect(pauseLabel(state, 1)).toContain('暂停中')
  })
  it('暂停提示词不带其他锁内容', () => {
    expect(buildPausePrompt(false, 0)).toContain('暂停的权利')
    expect(buildPausePrompt(false, 0)).not.toContain('共享')
  })
})
