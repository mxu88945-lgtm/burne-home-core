import { describe, expect, it } from 'vitest'
import { buildRecentStateNote, extractMemoryTags, hideMemoryTagsWhileStreaming } from '@/lib/memoryTags'
import type { ChatMsg } from '@/store/chatStore'

describe('memory tags', () => {
  it('pulls tags out and hides them', () => {
    const r = extractMemoryTags('乖，去吃饭。\n[记忆:她家养了九只玄凤]\n[记忆：她不喜欢太复杂的界面]')
    expect(r.clean).toBe('乖，去吃饭。')
    expect(r.saves).toEqual(['她家养了九只玄凤', '她不喜欢太复杂的界面'])
    expect(extractMemoryTags('没有标记').saves).toEqual([])
  })

  it('hides half-written tags while streaming', () => {
    expect(hideMemoryTagsWhileStreaming('好。\n[记忆:她喜')).toBe('好。')
    expect(hideMemoryTagsWhileStreaming('好。\n[记')).toBe('好。')
    expect(hideMemoryTagsWhileStreaming('[剧情账]还在')).toBe('[剧情账]还在')
  })

  it('collects recent life notes from her own words only', () => {
    const now = Date.UTC(2026, 10, 8, 4, 0)
    const mk = (id: string, role: ChatMsg['role'], text: string, hoursAgo: number): ChatMsg => ({
      id, role, text, at: '', ts: now - hoursAgo * 3600_000,
    })
    const msgs = [
      mk('a', 'me', '今天早餐吃了鸡蛋', 40),
      mk('b', 'me', '我刚吃完早饭了', 2),
      mk('c', 'companion', '吃了什么', 2),
      mk('d', 'me', '哈哈', 1),
      mk('e', 'me', '有点不舒服，鼻子干', 0.5),
    ]
    const note = buildRecentStateNote(msgs, new Set(['e']), '惟惟', now)
    expect(note).toContain('我刚吃完早饭了')
    expect(note).not.toContain('鸡蛋')
    expect(note).not.toContain('鼻子干')
  })
})
