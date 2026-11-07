import { describe, expect, it } from 'vitest'
import { parseDates, recallCrossSessions } from './crossSessionRecall'
import type { ChatSession } from '@/store/chatStore'

const now = new Date(2026, 10, 6, 22, 0)
const ts = (d: number, h = 20) => new Date(2026, 10, d, h, 0).getTime()

function session(id: string, title: string, msgs: Array<[string, 'me' | 'companion', string, number?]>): ChatSession {
  return {
    id,
    title,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-03T00:00:00Z',
    messages: msgs.map(([mid, role, text, t]) => ({ id: mid, role, text, at: '20:00', ts: t })),
  }
}

const sessions = [
  session('a', '周三', [
    ['a1', 'me', '今天买了半球的电水壶', ts(4)],
    ['a2', 'companion', '316不锈钢那款？记得先烧两壶水倒掉', ts(4)],
    ['a3', 'me', '好的', ts(4)],
  ]),
  session('b', '现在', [
    ['b1', 'me', '晚上吃什么', ts(6)],
    ['b2', 'companion', '白粥吧', ts(6)],
  ]),
]

describe('crossSessionRecall', () => {
  it('finds other-window lines with neighbours', () => {
    const r = recallCrossSessions({
      sessions, activeId: 'b', inContextIds: new Set(['b1', 'b2']),
      userQueries: ['你还记得那个电水壶吗'], meName: '惟惟', aiName: '伯恩', now,
    })
    expect(r.hits).toBeGreaterThan(0)
    expect(r.text).toContain('半球的电水壶')
    expect(r.text).toContain('烧两壶水')
    expect(r.text).toContain('窗口「周三」')
    expect(r.text).toContain('当时的助手（身份按原文判断）')
    expect(r.text).toContain('不自动等于当前角色')
  })

  it('skips messages already in context and returns empty when nothing matches', () => {
    const r = recallCrossSessions({
      sessions, activeId: 'b', inContextIds: new Set(['b1', 'b2']),
      userQueries: ['晚上吃什么'], meName: '惟惟', aiName: '伯恩', now,
    })
    expect(r.text).not.toContain('白粥')
  })

  it('recognises dates', () => {
    expect(parseDates('11月4号聊了啥', now).has('2026-11-4')).toBe(true)
    expect(parseDates('前天说的', now).has('2026-11-4')).toBe(true)
    const r = recallCrossSessions({
      sessions, activeId: 'b', inContextIds: new Set(),
      userQueries: ['11月4号那天你记得吗'], meName: '惟惟', aiName: '伯恩', now,
    })
    expect(r.text).toContain('电水壶')
  })
})
