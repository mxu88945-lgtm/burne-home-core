import { describe, expect, it } from 'vitest'
import {
  applyPersonTag,
  archiveSnippetAround,
  buildPersonBlock,
  createPerson,
  extractPersonTags,
  findNameSnippetsInSessions,
  markPeopleUsed,
  matchMentionedPeople,
  memoriesMentioning,
  seedPresetPeople,
  wrapPeopleBlocks,
  type Person,
} from '@/lib/people'
import { hideMemoryTagsWhileStreaming } from '@/lib/memoryTags'
import type { ChatSession } from '@/store/chatStore'
import type { MemoryItem } from '@/types/memory'

const now = new Date(2026, 10, 8, 16, 0)

function mem(id: string, content: string, patch: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id, title: '', content, kind: 'long', source: 'auto', starred: false, tags: [],
    createdAt: now.toISOString(), updatedAt: now.toISOString(), ...patch,
  }
}

describe('person tags', () => {
  it('extracts [人物:名字|内容] and hides it', () => {
    const r = extractPersonTags('好呀。\n[人物:裴屿|她说裴屿最近在学吉他]\n[人物：顾屿｜她的老朋友]')
    expect(r.clean).toBe('好呀。')
    expect(r.tags).toEqual([
      { name: '裴屿', content: '她说裴屿最近在学吉他' },
      { name: '顾屿', content: '她的老朋友' },
    ])
    expect(extractPersonTags('没有标签').tags).toEqual([])
  })

  it('hides person and search tags while streaming, including half-written ones', () => {
    expect(hideMemoryTagsWhileStreaming('嗯。\n[人物:裴屿|学吉')).toBe('嗯。')
    expect(hideMemoryTagsWhileStreaming('嗯。\n[人物:裴屿|学吉他]')).toBe('嗯。')
    expect(hideMemoryTagsWhileStreaming('[搜索:电水壶]')).toBe('')
    expect(hideMemoryTagsWhileStreaming('我想想\n[搜')).toBe('我想想')
  })
})

describe('applyPersonTag', () => {
  it('creates a new person with the content as background', () => {
    const r = applyPersonTag([], '小林', '她的大学室友', now)
    expect(r.change).toBe('created')
    expect(r.people[0]).toMatchObject({ name: '小林', background: '她的大学室友', events: [] })
  })

  it('appends a dated event to an existing person (by name or alias) and dedupes', () => {
    const base = [createPerson('裴屿', now, { aliases: ['阿裴'] })]
    const a = applyPersonTag(base, '阿裴', '最近在学吉他', now)
    expect(a.change).toBe('event')
    expect(a.people[0].events).toHaveLength(1)
    expect(a.people[0].events[0]).toMatchObject({ date: '2026-11-08', text: '最近在学吉他' })
    const b = applyPersonTag(a.people, '裴屿', '最近在学吉他。', now)
    expect(b.change).toBe('duplicate')
    expect(b.people[0].events).toHaveLength(1)
  })

  it('seeds presets once without duplicating existing names', () => {
    const seeded = seedPresetPeople([createPerson('伯恩', now, { background: '已有' })], now)
    expect(seeded.map((p) => p.name).sort()).toEqual(['伯恩', '裴屿', '顾屿', '顾祁砚'].sort())
    expect(seeded.find((p) => p.name === '伯恩')?.background).toBe('已有')
    expect(seeded.filter((p) => p.name !== '伯恩').every((p) => p.background === '')).toBe(true)
  })
})

describe('matching and blocks', () => {
  const people: Person[] = [
    createPerson('顾屿', now),
    createPerson('裴屿', now, { aliases: ['阿裴'] }),
    createPerson('顾祁砚', now),
    createPerson('伯恩', now),
    createPerson('林', now),
  ]

  it('matches names and aliases only in her last two messages, max 3', () => {
    expect(matchMentionedPeople(people, ['今天阿裴来了']).map((p) => p.name)).toEqual(['裴屿'])
    expect(matchMentionedPeople(people, ['顾屿说过', '很久前', '没人']).length).toBe(0)
    expect(matchMentionedPeople(people, ['顾屿和顾祁砚', '伯恩、阿裴']).length).toBe(3)
    // 单字名字不参与匹配，避免误命中
    expect(matchMentionedPeople(people, ['林子里'])).toEqual([])
  })

  it('finds dated snippets with neighbours across sessions, skipping in-context messages', () => {
    const ts = (d: number) => new Date(2026, 10, d, 20).getTime()
    const sessions: ChatSession[] = [
      {
        id: 's1', title: 'A', createdAt: '', updatedAt: '',
        messages: [
          { id: 'm1', role: 'companion', text: '今天怎么样', at: '', ts: ts(3) },
          { id: 'm2', role: 'me', text: '阿裴送了我一盒茶', at: '', ts: ts(3) },
          { id: 'm3', role: 'companion', text: '替我谢谢他', at: '', ts: ts(3) },
          { id: 'm4', role: 'me', text: '裴屿今天也在', at: '', ts: ts(8) },
        ],
      },
    ]
    const snips = findNameSnippetsInSessions(sessions, people[1], new Set(['m4']), 3)
    expect(snips).toHaveLength(1)
    expect(snips[0].lines).toEqual(['11月3日 他说：今天怎么样', '11月3日 她说：阿裴送了我一盒茶', '11月3日 他说：替我谢谢他'])
  })

  it('formats archive snippets with date and speaker', () => {
    const line = archiveSnippetAround('用户原话：那天顾屿陪我去看海\n\n当时的助手原话：真好', ['顾屿'], '2026-03-05T10:00:00Z')
    expect(line).toMatch(/^3月5日 她说：/)
    expect(line).toContain('顾屿陪我去看海')
  })

  it('builds a bounded block with background, last 5 events, quotes and memories', () => {
    let p = createPerson('裴屿', now, { background: '她的朋友' })
    for (let i = 1; i <= 7; i += 1) p = applyPersonTag([p], '裴屿', `事件${i}`, new Date(2026, 10, i)).people[0]
    const memories = [mem('k1', '裴屿怕猫'), mem('k2', '顾屿喜欢海'), mem('k3', '裴屿生日在五月', { deletedAt: 'x' })]
    const picked = memoriesMentioning(memories, p, now)
    expect(picked.map((m) => m.id)).toEqual(['k1'])
    const block = buildPersonBlock({ person: p, snippets: [['11月3日 她说：裴屿来了']], memories: picked })
    expect(block.text).toContain('背景：她的朋友')
    expect(block.text).not.toContain('事件2')
    expect(block.text).toContain('11月7日：事件7')
    expect(block.eventIds).toHaveLength(5)
    expect(block.text).toContain('11月3日 她说：裴屿来了')
    expect(block.memoryIds).toEqual(['k1'])
    const tiny = buildPersonBlock({ person: p, snippets: [], memories: picked, maxChars: 60 })
    expect(tiny.text.length).toBeLessThanOrEqual(60)
    expect(wrapPeopleBlocks([block.text])).toContain('你那天说')
  })

  it('records hits without touching updatedAt', () => {
    const p = applyPersonTag([createPerson('裴屿', now)], '裴屿', '学吉他', now).people[0]
    const [next] = markPeopleUsed([p], [p.id], [p.events[0].id], now)
    expect(next.hitCount).toBe(1)
    expect(next.events[0].hitCount).toBe(1)
    expect(next.lastUsedAt).toBe(now.toISOString())
    expect(next.updatedAt).toBe(p.updatedAt)
  })
})
