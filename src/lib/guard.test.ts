import { describe, expect, it } from 'vitest'
import { buildGuardPrompt, extractGuardTags, stripGuardTags } from './guard'

describe('他管着你：标记', () => {
  it('锁屏、解锁、宵禁都能解析并从正文去掉', () => {
    const r = extractGuardTags('乖，去睡。\n【锁屏 45分钟：去睡觉】\n【宵禁 22:30】')
    expect(r.clean).toBe('乖，去睡。')
    expect(r.commands).toEqual([{ kind: 'lock', minutes: 45, reason: '去睡觉' }, { kind: 'curfew', start: '22:30' }])
    expect(extractGuardTags('好吧【解锁】').commands).toEqual([{ kind: 'unlock' }])
  })
  it('分钟数夹在 5–180', () => {
    expect(extractGuardTags('[锁屏 999]').commands[0]).toMatchObject({ minutes: 180 })
    expect(extractGuardTags('[锁屏 1分钟]').commands[0]).toMatchObject({ minutes: 5 })
  })
  it('流式写到一半的标记先藏起来', () => {
    expect(stripGuardTags('去吃饭。\n【锁屏 30分')).toBe('去吃饭。')
  })
  it('告状只说没说过的', () => {
    const now = 1_000_000_000_000
    const report = { lock: null, curfew: { on: true, start: '23:30', end: '07:00' }, curfewNow: false, curfewStart: null, limit: { on: true, max: 10 }, counts: { 抖音: 3 }, opens: [], breaches: [{ at: now - 5 * 60000, kind: 'curfew' as const, app: '抖音', minutes: 0, reason: '' }] }
    const base = { name: '伯恩', user: '惟惟', gateOn: true, curfew: report.curfew, limit: report.limit, lock: null, report, now }
    expect(buildGuardPrompt({ ...base, toldUntil: 0 })).toContain('【告状】5 分钟前')
    expect(buildGuardPrompt({ ...base, toldUntil: now - 60000 })).not.toContain('【告状】')
    expect(buildGuardPrompt({ ...base, toldUntil: 0 })).toContain('抖音 3 次')
  })
  it('别人借门上的锁和告状会点名', () => {
    const now = 1_000_000_000_000
    const report = { lock: { until: now + 20 * 60000, startedAt: now, reason: '去睡', by: '顾祁砚' }, curfew: { on: true, start: '23:30', end: '07:00' }, curfewNow: false, curfewStart: null, limit: { on: true, max: 10 }, counts: {}, opens: [], breaches: [{ at: now - 60000, kind: 'lock' as const, app: '抖音', minutes: 12, reason: '', by: '谢聿衡' }] }
    const out = buildGuardPrompt({ name: '伯恩', user: '惟惟', gateOn: true, curfew: report.curfew, limit: report.limit, lock: null, report, now, toldUntil: 0 })
    expect(out).toContain('被顾祁砚锁着')
    expect(out).toContain('解开了谢聿衡给她的锁屏')
  })
})
