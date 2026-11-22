import { describe, expect, it } from 'vitest'
import { addPrivateEntry, buildPrivacyPrompt, canRequest, decidePrivacyAccess, parsePrivacyDecisionTag, parsePrivateEntryTag, requestPrivacyAccess, stripPrivacyTags } from './privacyRoom'

describe('隐私室', () => {
  it('只在开启且没有冷却时允许申请', () => {
    const base = { enabled: true, entries: [], requestAt: 0, deniedUntil: 0, unlocked: false }
    const requested = requestPrivacyAccess(base, 100)
    expect(requested.requestAt).toBe(100)
    expect(canRequest(requested, 101)).toBe(false)
  })
  it('同意后解锁，拒绝后六小时不能再次申请', () => {
    const requested = requestPrivacyAccess({ enabled: true, entries: [], requestAt: 0, deniedUntil: 0, unlocked: false }, 100)
    const denied = decidePrivacyAccess(requested, 'deny', 100)
    expect(denied.deniedUntil).toBe(100 + 6 * 60 * 60 * 1000)
    expect(canRequest(denied, denied.deniedUntil - 1)).toBe(false)
    expect(canRequest(denied, denied.deniedUntil)).toBe(true)
    const granted = decidePrivacyAccess(requested, 'grant', 200)
    expect(granted.unlocked).toBe(true)
  })
  it('保存内容并剥掉模型标记', () => {
    const raw = '我有个秘密。［隐私室：今晚想写一封信］\n［隐私室决定：拒绝］'
    expect(parsePrivateEntryTag(raw)).toBe('今晚想写一封信')
    expect(parsePrivacyDecisionTag(raw)).toBe('deny')
    expect(stripPrivacyTags(raw)).toBe('我有个秘密。')
    expect(addPrivateEntry({ enabled: true, entries: [], requestAt: 0, deniedUntil: 0, unlocked: false }, '  一件事  ', 10).entries[0]?.text).toBe('一件事')
  })
  it('提示词只讲隐私室的锁、解锁和门禁', () => {
    const prompt = buildPrivacyPrompt({ enabled: true, entries: [], requestAt: 0, deniedUntil: 0, unlocked: false })
    expect(prompt).toContain('上锁')
    expect(prompt).toContain('解锁')
    expect(prompt).toContain('门禁')
    expect(prompt).not.toContain('共享')
  })
})
