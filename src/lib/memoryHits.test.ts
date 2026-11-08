import { describe, expect, it } from 'vitest'
import { USAGE_BOOST_CAP, markMemoriesUsed, recallMemories, usageBoost } from '@/lib/memoryRecall'
import { datedArchiveText } from '@/lib/archiveRecall'
import { quoteLine } from '@/lib/quoteFormat'
import type { MemoryItem } from '@/types/memory'

const now = new Date('2026-11-08T08:00:00Z')
function mem(id: string, content: string, patch: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id, title: '', content, kind: 'long', source: 'auto', starred: false, tags: [],
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...patch,
  }
}

describe('hit counting', () => {
  it('increments hitCount and lastUsedAt without touching updatedAt', () => {
    const list = [mem('a', 'x'), mem('b', 'y')]
    const next = markMemoriesUsed(list, ['a'], now)
    expect(next[0]).toMatchObject({ hitCount: 1, lastUsedAt: now.toISOString(), updatedAt: '2026-01-01T00:00:00Z' })
    expect(next[1]).toBe(list[1])
    expect(markMemoriesUsed(next, ['a'], now)[0].hitCount).toBe(2)
    expect(markMemoriesUsed(list, [], now)).toBe(list)
  })

  it('boost is small and capped', () => {
    expect(usageBoost({})).toBe(0)
    expect(usageBoost({ hitCount: 1 })).toBeGreaterThan(0)
    expect(usageBoost({ hitCount: 100000 })).toBe(USAGE_BOOST_CAP)
  })

  it('frequent use breaks ties but never beats keyword relevance', () => {
    const relevant = mem('rel', '她最喜欢的花是栀子花')
    const popular = mem('pop', '她住在潮州', { hitCount: 500 })
    const plain = mem('plain', '她住在广东')
    const r = recallMemories({ query: '栀子花', scope: 'chat', memories: [popular, plain, relevant], now })
    const ids = r.diagnostic.used.map((u) => u.id)
    expect(ids[0]).toBe('rel')
    expect(ids.indexOf('pop')).toBeLessThan(ids.indexOf('plain'))
  })

  it('old memories are only down-weighted, never dropped from the candidate list', () => {
    const old = mem('old', '很久以前的事', { updatedAt: '2020-01-01T00:00:00Z' })
    const r = recallMemories({ query: '很久以前', scope: 'chat', memories: [old], now })
    expect(r.diagnostic.used.map((u) => u.id)).toEqual(['old'])
  })
})

describe('dated quote format', () => {
  it('formats a line as M月D日 她/他说', () => {
    expect(quoteLine(new Date(2026, 10, 3, 9).getTime(), 'me', '我想吃粥')).toBe('11月3日 她说：我想吃粥')
    expect(quoteLine(new Date(2026, 10, 3, 9).getTime(), 'companion', '好', { approximate: true })).toBe('11月3日前后 他说：好')
    expect(quoteLine(undefined, 'me', '嗯')).toBe('日期不详 她说：嗯')
  })

  it('rewrites archive speaker labels with the chunk date', () => {
    const out = datedArchiveText('用户原话：你好\n\n当时的助手原话：在呢', '2026-03-05T12:00:00')
    expect(out).toBe('3月5日 她说：你好\n\n3月5日 他说：在呢')
  })
})
