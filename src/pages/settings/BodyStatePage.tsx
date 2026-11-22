import { useEffect } from 'react'
import SubPage from '@/components/settings/SubPage'
import { bodyTurnLine, currentBody } from '@/lib/bodyState'
import { useBodyStateStore } from '@/store/bodyStateStore'

export default function BodyStatePage() {
  const enabled = useBodyStateStore((s) => s.enabled)
  const body = useBodyStateStore((s) => s.body)
  const setEnabled = useBodyStateStore((s) => s.setEnabled)
  const refresh = useBodyStateStore((s) => s.refresh)
  const current = currentBody(body)
  useEffect(() => {
    refresh()
    const timer = window.setInterval(() => refresh(), 60_000)
    return () => window.clearInterval(timer)
  }, [refresh])
  return (
    <SubPage title="他的小天地 🌙">
      <div className="glass space-y-4 rounded-2xl p-4">
        <div>
          <h2 className="text-sm font-medium text-ink">身体状态</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">默认关闭。打开后只在主聊天里生效，状态保存在这台设备上，也会随整包备份保存。</p>
        </div>
        <label className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <span className="text-sm text-ink">让他有自己的身体状态<span className="mt-0.5 block text-[11px] text-muted">不上传，也不影响其他聊天页面。</span></span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 accent-accent" />
        </label>
        <div className={enabled ? 'space-y-3' : 'space-y-3 opacity-50'}>
          <div>
            <div className="mb-1 flex justify-between text-[12px] text-muted"><span>精力</span><span>{current.energy}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${current.energy}%` }} /></div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[12px] text-muted"><span>困意</span><span>{current.drowsiness}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${current.drowsiness}%` }} /></div>
          </div>
          <p className="rounded-xl bg-white/25 px-3 py-2 text-[12px] leading-relaxed text-ink">“{bodyTurnLine(current)}”</p>
        </div>
      </div>
    </SubPage>
  )
}
