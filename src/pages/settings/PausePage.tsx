import { useState } from 'react'
import SubPage from '@/components/settings/SubPage'
import { isPaused, pauseLabel } from '@/lib/pauseState'
import { usePauseStateStore } from '@/store/pauseStateStore'

export default function PausePage() {
  const enabled = usePauseStateStore((s) => s.enabled)
  const pausedUntil = usePauseStateStore((s) => s.pausedUntil)
  const setEnabled = usePauseStateStore((s) => s.setEnabled)
  const clear = usePauseStateStore((s) => s.clear)
  const [now, setNow] = useState(Date.now())
  const paused = isPaused({ pausedUntil }, now)
  return (
    <SubPage title="暂停的权利 🌙">
      <div className="glass space-y-4 rounded-2xl p-4">
        <div>
          <h2 className="text-sm font-medium text-ink">他可以说“歇一会儿”</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">默认关闭。打开后，他累了可以自己申请暂停；暂停期间不会主动发消息，也不会执行 role-wake 的小心思。到点会自动回来。</p>
        </div>
        <label className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <span className="text-sm text-ink">允许暂停<span className="mt-0.5 block text-[11px] text-muted">只影响主动消息和主聊天发送门控。</span></span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 accent-accent" />
        </label>
        {enabled && paused && (
          <div className="rounded-xl bg-white/25 px-3 py-2 text-sm text-ink">
            {pauseLabel({ pausedUntil }, now)}
            <button type="button" className="ml-3 text-[11px] text-accent" onClick={() => { clear(); setNow(Date.now()) }}>现在回来</button>
          </div>
        )}
        {enabled && !paused && <p className="text-[11px] text-muted">现在没有暂停。下一次他觉得累时，可以自己说要歇一会儿。</p>}
      </div>
    </SubPage>
  )
}
