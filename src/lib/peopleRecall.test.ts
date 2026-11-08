import { describe, expect, it } from 'vitest'
import { recallPeople } from '@/lib/peopleRecall'
import { applyPersonTag, createPerson } from '@/lib/people'
import type { ChatSession } from '@/store/chatStore'
import type { MemoryItem } from '@/types/memory'

const now = new Date(2026, 10, 8, 16)
const ts = (d: number) => new Date(2026, 10, d, 21).getTime()

const sessions: ChatSession[] = [
  {
    id: 'old', title: '旧', createdAt: '', updatedAt: '',
    messages: [
      { id: 'o1', role: 'me', text: '顾屿以前总说我不爱喝水', at: '', ts: ts(2) },
      { id: 'o2', role: 'companion', text: '那我也要说', at: '', ts: ts(2) },
    ],
  },
  {
    id: 'now', title: '今', createdAt: '', updatedAt: '',
    messages: [{ id: 'n1', role: 'me', text: '突然想起顾屿', at: '', ts: ts(8) }],
  },
]

const memories: MemoryItem[] = [
  { id: 'k1', title: '', content: '顾屿是她很重要的人', kind: 'long', source: 'auto', starred: false, tags: [], createdAt: '', updatedAt: '' },
]

describe('recallPeople', () => {
  it('injects background, events, dated quotes (window + archive) and memories', async () => {
    let p = createPerson('顾屿', now, { background: '她给 Hark 起的昵称' })
    p = applyPersonTag([p], '顾屿', '她说顾屿帮她改好了伯恩', new Date(2026, 10, 6)).people[0]
    const r = await recallPeople({
      people: [p, createPerson('裴屿', now)],
      userTexts: ['突然想起顾屿'],
      sessions,
      inContextIds: new Set(['n1']),
      memories,
      now,
      archiveLookup: async () => [{ text: '用户原话：顾屿陪我熬过那个冬天', startedAt: '2025-12-20T12:00:00' }],
    })
    expect(r.text).toContain('【人物档案')
    expect(r.text).toContain('背景：她给 Hark 起的昵称')
    expect(r.text).toContain('11月6日：她说顾屿帮她改好了伯恩')
    expect(r.text).toContain('11月2日 她说：顾屿以前总说我不爱喝水')
    expect(r.text).toContain('11月2日 他说：那我也要说')
    expect(r.text).toContain('12月20日 她说：')
    expect(r.text).toContain('顾屿是她很重要的人')
    expect(r.text).not.toContain('裴屿')
    expect(r.personIds).toEqual([p.id])
    expect(r.eventIds).toHaveLength(1)
    expect(r.memoryIds).toEqual(['k1'])
  })

  it('returns nothing when nobody is mentioned', async () => {
    const r = await recallPeople({
      people: [createPerson('顾屿', now)], userTexts: ['今天下雨'], sessions, inContextIds: new Set(), memories,
      archiveLookup: async () => [],
    })
    expect(r.text).toBe('')
  })

  it('caps each person near 800 chars and at most 3 people', async () => {
    const many = ['甲甲', '乙乙', '丙丙', '丁丁'].map((n) => {
      let p = createPerson(n, now, { background: '很长'.repeat(100) })
      for (let i = 0; i < 8; i += 1) p = applyPersonTag([p], n, `${n}事件${i}${'细节'.repeat(40)}`, now).people[0]
      return p
    })
    const r = await recallPeople({
      people: many, userTexts: ['甲甲乙乙丙丙丁丁'], sessions: [], inContextIds: new Set(), memories: [],
      archiveLookup: async () => [],
    })
    expect(r.personIds).toHaveLength(3)
    for (const block of r.text.split('◆').slice(1)) expect(block.length).toBeLessThanOrEqual(820)
  })
})
