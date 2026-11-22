import { useState } from 'react'
import SubPage from '@/components/settings/SubPage'
import { pauseRemainingMs } from '@/lib/pauseState'
import { usePrivacyRoomStore } from '@/store/privacyRoomStore'

export default function PrivacyRoomPage() {
  const enabled = usePrivacyRoomStore((s) => s.enabled)
  const entries = usePrivacyRoomStore((s) => s.entries)
  const requestAt = usePrivacyRoomStore((s) => s.requestAt)
  const deniedUntil = usePrivacyRoomStore((s) => s.deniedUntil)
  const unlocked = usePrivacyRoomStore((s) => s.unlocked)
  const setEnabled = usePrivacyRoomStore((s) => s.setEnabled)
  const requestAccess = usePrivacyRoomStore((s) => s.requestAccess)
  const lock = usePrivacyRoomStore((s) => s.lock)
  const [now] = useState(Date.now())
  const cooling = deniedUntil > now
  const cooldownHours = Math.ceil(pauseRemainingMs({ pausedUntil: deniedUntil }, now) / 3_600_000)
  return (
    <SubPage title="隐私室 🔐">
      <div className="glass space-y-4 rounded-2xl p-4">
        <div>
          <h2 className="text-sm font-medium text-ink">他有一间不给你看的小房间</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">默认关闭。打开后，他可以保存自己的内容；你点“申请看”，要等他在聊天里同意才会解锁。所有内容只在本机，并进入备份。</p>
        </div>
        <label className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <span className="text-sm text-ink">开启隐私室<span className="mt-0.5 block text-[11px] text-muted">关闭会立即锁上，但不会删除里面的内容。</span></span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 accent-accent" />
        </label>
        {enabled && !unlocked && (
          <div className="space-y-2">
            <button type="button" disabled={!!requestAt || cooling} onClick={requestAccess} className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50">申请看</button>
            {requestAt && <p className="text-[11px] text-muted">申请已经送到聊天里，等他决定。不要连续重复申请。</p>}
            {cooling && <p className="text-[11px] text-muted">他上次拒绝了，{cooldownHours} 小时后才能再次申请。</p>}
          </div>
        )}
        {enabled && unlocked && (
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-sm text-ink">已解锁 · {entries.length} 条</span><button type="button" onClick={lock} className="text-[11px] text-accent">重新上锁</button></div>
            {entries.length ? entries.map((entry) => <div key={entry.id} className="rounded-xl bg-white/25 px-3 py-2 text-[12px] leading-relaxed text-ink">{entry.text}</div>) : <p className="text-[11px] text-muted">里面还没有内容。</p>}
          </div>
        )}
      </div>
    </SubPage>
  )
}
