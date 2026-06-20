import { useMemo } from 'react'
import { useUsageStore, type UsageEntry } from '@/store/usageStore'

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
function startOfWeek() {
  const d = startOfToday()
  const day = (d.getDay() + 6) % 7 // 周一为一周起点
  d.setDate(d.getDate() - day)
  return d
}
function startOfMonth() {
  const d = startOfToday()
  d.setDate(1)
  return d
}

function sumFrom(entries: UsageEntry[], since: Date) {
  let cost = 0
  let tokens = 0
  let count = 0
  for (const e of entries) {
    if (new Date(e.at) < since) continue
    count++
    tokens += e.totalTokens
    if (typeof e.cost === 'number') cost += e.cost
  }
  return { cost, tokens, count }
}

function fmtCost(c: number) {
  return c > 0 ? `$${c.toFixed(4)}` : '—'
}
function fmtTokens(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)
}

function Col({ label, s }: { label: string; s: ReturnType<typeof sumFrom> }) {
  return (
    <div className="flex-1 text-center">
      <div className="label">{label}</div>
      <div className="mt-1 text-base font-semibold text-accent">{fmtCost(s.cost)}</div>
      <div className="text-[11px] text-muted">
        {s.count} 次 · {fmtTokens(s.tokens)} tok
      </div>
    </div>
  )
}

export default function UsagePanel() {
  const { entries, clear } = useUsageStore()

  const stats = useMemo(
    () => ({
      today: sumFrom(entries, startOfToday()),
      week: sumFrom(entries, startOfWeek()),
      month: sumFrom(entries, startOfMonth()),
    }),
    [entries]
  )

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted">
        仅本地统计；OpenRouter 渠道含真实花费，其它渠道只记 token。
      </p>

      <div className="flex gap-2">
        <Col label="今日" s={stats.today} />
        <Col label="本周" s={stats.week} />
        <Col label="本月" s={stats.month} />
      </div>

      <div className="flex items-center justify-between">
        <span className="label">最近 {Math.min(entries.length, 10)} 条</span>
        {entries.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('清空所有用量记录？')) clear()
            }}
            className="text-[11px] text-muted hover:text-accent"
          >
            清空记录
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-[12px] text-muted">还没有用量记录，去聊几句吧～</p>
      ) : (
        <div className="space-y-1.5">
          {entries.slice(0, 10).map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="text-muted">
                {new Date(e.at).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="flex-1 truncate text-ink">{e.model}</span>
              <span className="text-muted">
                {fmtTokens(e.promptTokens)}→{fmtTokens(e.completionTokens)}
              </span>
              <span className="w-16 text-right text-accent">{fmtCost(e.cost ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
