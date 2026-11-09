import { describe, expect, it } from 'vitest'
import { lateTaskReports } from './taskReport'

const task = (status: 'active' | 'done' | 'cancelled', doneAt?: number, cancelledAt?: number) => ({
  text: '回家', minutes: 60, startedAt: 1000, deadline: 3601000, status, doneAt, cancelledAt,
})

describe('lateTaskReports', () => {
  it('完成发生在后续聊天之后 → 挪到末尾', () => {
    const h = [
      { id: 't', ts: 1000, task: task('done', 9000) },
      { id: 'a', ts: 2000 },
      { id: 'b', ts: 3000 },
    ]
    expect(lateTaskReports(h)).toEqual(['t'])
  })
  it('完成后已有新消息 → 不挪', () => {
    const h = [
      { id: 't', ts: 1000, task: task('done', 2500) },
      { id: 'a', ts: 2000 },
      { id: 'b', ts: 3000 },
    ]
    expect(lateTaskReports(h)).toEqual([])
  })
  it('任务是最后一条 / 进行中 / 旧消息无时间 → 不挪', () => {
    expect(lateTaskReports([{ id: 't', ts: 1, task: task('done', 9) }])).toEqual([])
    expect(lateTaskReports([{ id: 't', ts: 1, task: task('active') }, { id: 'a', ts: 2 }])).toEqual([])
    expect(lateTaskReports([{ id: 't', ts: 1, task: task('done', 9) }, { id: 'a' }])).toEqual([])
  })
  it('取消也挪', () => {
    expect(lateTaskReports([{ id: 't', ts: 1, task: task('cancelled', undefined, 9) }, { id: 'a', ts: 2 }])).toEqual(['t'])
  })
})
