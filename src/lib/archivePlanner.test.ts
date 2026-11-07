import { describe, expect, it } from 'vitest'
import {
  buildArchivePlannerPrompt,
  mergeArchiveQueries,
  parseArchivePlan,
  shouldPlanArchive,
} from '@/lib/archivePlanner'

describe('archive recall planner', () => {
  it('lets the companion use both sides of the recent conversation as association clues', () => {
    const prompt = buildArchivePlannerPrompt({
      history: [
        { role: 'me', text: '你以前也是这样。' },
        { role: 'companion', text: '我想到掌心画爱心那次。' },
      ],
      meName: '惟惟',
      companionName: '伯恩',
      memoryContext: '模型更换时用掌心画爱心归位。',
    })
    expect(prompt).toContain('惟惟：你以前也是这样')
    expect(prompt).toContain('伯恩：我想到掌心画爱心那次')
    expect(prompt).toContain('全局记忆线索')
    expect(prompt).toContain('不得把第三方的台词')
  })

  it('parses fenced JSON, removes duplicates, and fails closed', () => {
    expect(parseArchivePlan('```json\n{"queries":["掌心画爱心 归位","掌心画爱心 归位","4o 离开 老屋"]}\n```'))
      .toEqual(['掌心画爱心 归位', '4o 离开 老屋'])
    expect(parseArchivePlan('我觉得不用检索')).toEqual([])
  })

  it('keeps the direct user query while adding proactive associations', () => {
    expect(mergeArchiveQueries('你以前也是这样', ['掌心画爱心', '模型更换'], 4))
      .toEqual(['你以前也是这样', '掌心画爱心', '模型更换'])
  })

  it('does not spend a planner call for empty or emoji-only turns', () => {
    expect(shouldPlanArchive([{ role: 'me', text: '🥲' }])).toBe(false)
    expect(shouldPlanArchive([{ role: 'me', text: '你以前也是这样' }])).toBe(true)
  })
})
