import { describe, expect, it } from 'vitest'
import { afterReplyBody, applyBodyTag, buildBodyPrompt, currentBody, DEFAULT_BODY_STATE, parseBodyTag, stripBodyTags } from './bodyState'

describe('身体状态', () => {
  it('规范化并限制数值', () => {
    expect(parseBodyTag('好。［身体状态：120|0|想睡了］')).toEqual({ energy: 100, drowsiness: 0, line: '想睡了' })
  })
  it('随时间恢复，但不超过边界', () => {
    const state = { energy: 40, drowsiness: 70, line: '累', updatedAt: 1_000 }
    const next = currentBody(state, 1_000 + 3_600_000)
    expect(next.energy).toBe(44)
    expect(next.drowsiness).toBe(67)
  })
  it('回复消耗精力并增加困意', () => {
    const next = afterReplyBody({ ...DEFAULT_BODY_STATE, energy: 50, drowsiness: 20, updatedAt: 100 }, 100)
    expect(next.energy).toBe(48)
    expect(next.drowsiness).toBe(22)
  })
  it('解析并剥掉模型标记', () => {
    const raw = '我还在。\n[身体状态:66|31|今天还醒着]'
    const tag = parseBodyTag(raw)
    expect(tag?.line).toBe('今天还醒着')
    expect(stripBodyTags(raw)).toBe('我还在。')
    expect(applyBodyTag(DEFAULT_BODY_STATE, tag!, 10).energy).toBe(66)
  })
  it('提示词不暴露其他锁或角色内容', () => {
    const prompt = buildBodyPrompt(DEFAULT_BODY_STATE)
    expect(prompt).toContain('身体状态')
    expect(prompt).not.toContain('锁')
  })
})
