import { describe, expect, it } from 'vitest'
import { recallMemories } from '@/lib/memoryRecall'
import type { MemoryItem } from '@/types/memory'

const now = new Date('2026-08-09T12:00:00.000Z')

function memory(partial: Partial<MemoryItem> & Pick<MemoryItem, 'id' | 'title' | 'content'>): MemoryItem {
  return {
    kind: 'long',
    source: 'manual',
    starred: false,
    tags: [],
    createdAt: '2026-08-08T12:00:00.000Z',
    updatedAt: '2026-08-08T12:00:00.000Z',
    ...partial,
  }
}

describe('memory recall', () => {
  it('keeps core memories, ranks the current topic, and records the trace', () => {
    const result = recallMemories({
      now,
      scope: 'chat',
      query: '猫和睡前习惯',
      memories: [
        memory({ id: 'core', title: '关系原则', content: '遇到冲突先安抚她。', starred: true }),
        memory({ id: 'hit', title: '睡前习惯', content: '她喜欢睡前听一会儿音乐。', tags: ['睡眠'] }),
        memory({ id: 'other', title: '项目', content: '某个旧项目的技术记录。' }),
      ],
    })

    expect(result.text).toContain('睡前习惯')
    expect(result.diagnostic.used.map((item) => item.id)).toContain('core')
    expect(result.diagnostic.used.map((item) => item.id)).toContain('hit')
    expect(result.diagnostic.totalChars).toBe(result.text.length)
  })

  it('does not inject expired, superseded, or out-of-scope memories', () => {
    const result = recallMemories({
      now,
      scope: 'phone',
      query: '安排',
      memories: [
        memory({ id: 'expired', title: '过期', content: '昨天的安排', kind: 'short', expiresAt: '2026-08-08T11:00:00.000Z' }),
        memory({ id: 'old', title: '旧版本', content: '已被新事实取代', supersededById: 'new' }),
        memory({ id: 'reading', title: '读书', content: '只在读书页使用', scope: 'reading' }),
      ],
    })

    expect(result.text).not.toContain('过期')
    expect(result.text).not.toContain('旧版本')
    expect(result.text).not.toContain('读书')
    expect(result.diagnostic.skipped.map((item) => item.reason)).toEqual(
      expect.arrayContaining(['已过期', '已被新记忆取代', '范围不符']),
    )
  })

  it('honours the character budget instead of dumping the memory library', () => {
    const memories = Array.from({ length: 20 }, (_, index) =>
      memory({ id: `m-${index}`, title: `记忆${index}`, content: '这是一段足够长的记忆内容。'.repeat(30) }),
    )
    const result = recallMemories({ now, scope: 'chat', query: '记忆', memories, maxChars: 420 })
    expect(result.text.length).toBeLessThanOrEqual(420 + 1)
    expect(result.diagnostic.skipped.length).toBeGreaterThan(0)
  })
})
