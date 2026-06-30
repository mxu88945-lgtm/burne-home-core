import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePeriodStore } from '@/store/periodStore'
import {
  computeStat,
  isPredictedPeriod,
  recentCycles,
  toStr,
  todayStr,
} from '@/lib/period'

const WEEK = ['一', '二', '三', '四', '五', '六', '日']

export default function CalendarPage() {
  const days = usePeriodStore((s) => s.days)
  const inject = usePeriodStore((s) => s.inject)
  const periodLen = usePeriodStore((s) => s.periodLen)
  const markFrom = usePeriodStore((s) => s.markFrom)
  const setPeriodLen = usePeriodStore((s) => s.setPeriodLen)
  const toggleInject = usePeriodStore((s) => s.toggleInject)

  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() }) // m: 0-11

  const stat = useMemo(() => computeStat(days, periodLen), [days, periodLen])
  const cycles = useMemo(() => recentCycles(days, 4), [days])
  const periodSet = useMemo(() => new Set(days), [days])
  const today = todayStr()

  // 当月网格（周一为首列）
  const cells = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1)
    const offset = (first.getDay() + 6) % 7 // 周一=0
    const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate()
    const arr: (string | null)[] = []
    for (let i = 0; i < offset; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(toStr(new Date(ym.y, ym.m, d)))
    return arr
  }, [ym])

  function shift(delta: number) {
    const m = ym.m + delta
    setYm({ y: ym.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/" className="glass rounded-full px-3 py-1.5 text-xs text-ink">
          ← 主页
        </Link>
      </div>
      <div className="px-1">
        <h2 className="headline text-2xl text-ink">生理期日历</h2>
        <p className="mt-1 text-xs text-muted">
          点你实际来例假的每一天来记录；再点一下取消（纯手动，不会自动替你标）
        </p>
      </div>

      {/* 经期天数设置 */}
      <div className="glass flex items-center justify-between rounded-2xl p-4">
        <span className="text-sm text-ink">
          我的经期一般
          <span className="block text-[11px] text-muted">仅用于预测下次经期（不会自动标记）</span>
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPeriodLen(periodLen - 1)}
            className="glass flex h-8 w-8 items-center justify-center rounded-full text-ink"
          >
            −
          </button>
          <span className="w-12 text-center text-sm text-ink">{periodLen} 天</span>
          <button
            onClick={() => setPeriodLen(periodLen + 1)}
            className="glass flex h-8 w-8 items-center justify-center rounded-full text-ink"
          >
            ＋
          </button>
        </div>
      </div>

      {/* 概览 */}
      <div className="glass rounded-2xl p-4 text-xs text-ink">
        {stat.hasData ? (
          <div className="grid grid-cols-2 gap-y-1.5">
            <div>
              平均周期 <b className="text-accent">{stat.avgCycle}</b> 天
            </div>
            <div>
              经期约 <b className="text-accent">{stat.avgLen}</b> 天
            </div>
            <div>
              {stat.todayDay
                ? `今天 · 经期第 ${stat.todayDay} 天`
                : stat.daysUntilNext != null
                  ? `距下次约 ${stat.daysUntilNext} 天`
                  : ''}
            </div>
            <div>预计下次 {stat.nextStart?.slice(5)}</div>
            <div>预计排卵 {stat.ovulation?.slice(5)}</div>
          </div>
        ) : (
          <p className="text-muted">还没有记录～点下面日历里你来例假的那几天就行。</p>
        )}
      </div>

      {/* 历史周期记录（近几次） */}
      {cycles.length > 0 && (
        <div className="glass rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">历史周期记录</span>
            <span className="text-[11px] text-muted">近 {cycles.length} 次</span>
          </div>
          <div className="space-y-1.5">
            {cycles.map((c) => (
              <div
                key={c.start}
                className="flex items-center justify-between rounded-xl bg-white/30 px-3 py-2 text-[13px] text-ink"
              >
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  {c.start.slice(5).replace('-', '/')}
                  <span className="text-muted">起 · {c.len} 天</span>
                </span>
                <span className="text-[12px] text-muted">
                  {c.cycle != null ? `周期 ${c.cycle} 天` : '最早一次'}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">距上次经期开始的间隔为「周期」</p>
        </div>
      )}

      {/* 月份导航 */}
      <div className="flex items-center justify-between px-1">
        <button onClick={() => shift(-1)} className="glass rounded-full px-3 py-1 text-sm text-ink">
          ‹
        </button>
        <div className="headline text-lg text-ink">
          {ym.y} 年 {ym.m + 1} 月
        </div>
        <button onClick={() => shift(1)} className="glass rounded-full px-3 py-1 text-sm text-ink">
          ›
        </button>
      </div>

      {/* 日历 */}
      <div className="glass rounded-2xl p-3">
        <div className="grid grid-cols-7 text-center text-[11px] text-muted">
          {WEEK.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const isPeriod = periodSet.has(d)
            const isPred = !isPeriod && isPredictedPeriod(d, stat)
            const isOvu = !isPeriod && d === stat.ovulation
            const isToday = d === today
            const num = Number(d.slice(8))
            return (
              <button
                key={i}
                onClick={() => markFrom(d)}
                className={[
                  'relative flex h-10 items-center justify-center rounded-xl text-sm transition',
                  isPeriod ? 'btn-primary' : isPred ? 'bg-accent/15 text-accent' : 'text-ink hover:bg-white/40',
                  isToday && !isPeriod ? 'ring-1 ring-accent' : '',
                ].join(' ')}
              >
                {num}
                {isOvu && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent-2" />
                )}
              </button>
            )
          })}
        </div>
        {/* 图例 */}
        <div className="mt-3 flex flex-wrap gap-3 px-1 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-accent" /> 经期
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-accent/20" /> 预测经期
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-accent-2" /> 排卵日
          </span>
        </div>
      </div>

      {/* 让 TA 关心 */}
      <label className="glass flex items-center justify-between rounded-2xl p-4">
        <span className="text-sm text-ink">
          让 TA 关心我的生理期
          <span className="block text-[11px] text-muted">
            开启后聊天里 TA 会知道你的状态、温柔跟进（只在本机，注入提示给模型）
          </span>
        </span>
        <input
          type="checkbox"
          checked={inject}
          onChange={toggleInject}
          className="h-5 w-5 accent-accent"
        />
      </label>

      <p className="pb-2 text-center text-[11px] text-muted">只存在你本机 · 不上传 ♡</p>
    </div>
  )
}
