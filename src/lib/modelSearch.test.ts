import { describe, expect, it } from 'vitest'
import { extractSearchTag, runModelSearch } from '@/lib/modelSearch'
import { applyPersonTag, createPerson } from '@/lib/people'
import type { ChatSession } from '@/store/chatStore'
import type { MemoryItem } from '@/types/memory'

const ts = (d: number) => new Date(2026, 10, d, 20).getTime()
const sessions: ChatSession[] = [
  {
    id: 'a', title: '周三', createdAt: '', updatedAt: '',
    messages: [
      { id: 'a1', role: 'companion', text: '今天买什么了', at: '', ts: ts(4) },
      { id: 'a2', role: 'me', text: '买了半球的电水壶', at: '', ts: ts(4) },
      { id: 'a3', role: 'companion', text: '记得先烧两壶水倒掉', at: '', ts: ts(4) },
    ],
  },
  { id: 'b', title: '现在', createdAt: '', updatedAt: '', messages: [{ id: 'b1', role: 'me', text: '那个水壶呢', at: '', ts: ts(8) }] },
]
const memories: MemoryItem[] = [
  { id: 'm1', title: '水壶', content: '她买了半球电水壶', kind: 'long', source: 'auto', starred: false, tags: [], createdAt: '', updatedAt: '' },
]

describe('[搜索:] tag', () => {
  it('extracts the first query and strips all search tags', () => {
    expect(extractSearchTag('嗯…\n[搜索:电水壶]')).toEqual({ query: '电水壶', clean: '嗯…' })
    expect(extractSearchTag('[搜索：顾屿 生日][搜索:x]').query).toBe('顾屿 生日')
    expect(extractSearchTag('正常回复').query).toBeNull()
  })

  it('finds dated quotes with neighbours, memories and people', async () => {
    const p = applyPersonTag([createPerson('电水壶', new Date())], '电水壶', '316 不锈钢', new Date()).people
    const r = await runModelSearch({
      query: '水壶', sessions, activeId: 'b', inContextIds: new Set(['b1']), memories, people: p,
      meName: '惟惟', aiName: '伯恩', archiveSearch: async () => '',
    })
    expect(r.found).toBe(true)
    expect(r.text).toContain('[搜索:水壶]')
    expect(r.text).toContain('11月4日 她说：买了半球的电水壶')
    expect(r.text).toContain('11月4日 他说：记得先烧两壶水倒掉')
    expect(r.text).toContain('她买了半球电水壶')
    expect(r.text).toContain('你那天说')
    expect(r.memoryIds).toEqual(['m1'])
  })

  it('tells the model not to invent or deny when nothing is found', async () => {
    const r = await runModelSearch({
      query: '冲浪板', sessions, activeId: 'b', inContextIds: new Set(), memories, people: [],
      meName: '惟惟', aiName: '伯恩', archiveSearch: async () => '',
    })
    expect(r.found).toBe(false)
    expect(r.text).toContain('不要编造')
    expect(r.text).toContain('不要断言')
  })
})
