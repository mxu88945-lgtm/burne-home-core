import { describe, expect, it } from 'vitest'
import { dayRange, openPeriodDays } from './period'

describe('进行中的经期自动往后数', () => {
  it('开始当天到今天每天都算', () => {
    expect(openPeriodDays('2026-11-15', '2026-11-18', 5)).toEqual({ days: ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'], closed: false })
  })
  it('超过 14 天没点结束按经期天数收尾', () => {
    const r = openPeriodDays('2026-11-01', '2026-11-18', 5)
    expect(r.closed).toBe(true)
    expect(r.days).toEqual(dayRange('2026-11-01', '2026-11-05'))
  })
  it('没开始就是空', () => {
    expect(openPeriodDays(null, '2026-11-18')).toEqual({ days: [], closed: false })
  })
})
