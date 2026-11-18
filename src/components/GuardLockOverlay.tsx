import { useEffect, useState } from 'react'
import { useGuardStore } from '@/store/guardStore'
import { usePersonaStore } from '@/store/personaStore'
import { useProfileStore } from '@/store/profileStore'
import { useImgSrc } from '@/lib/useImgSrc'

/** 他在聊天里写了【锁屏 N分钟】：全屏倒计时盖住 App，到点自动解开；「偷偷解锁」他会知道。 */
export default function GuardLockOverlay() {
  const lock = useGuardStore((s) => s.lock)
  const sneak = useGuardStore((s) => s.sneak)
  const fetchReport = useGuardStore((s) => s.fetchReport)
  const { persona } = usePersonaStore()
  const { profile } = useProfileStore()
  const name = persona.name || profile.nameB || '他'
  const src = useImgSrc(profile.avatarBImg)
  const [now, setNow] = useState(Date.now())
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (!lock) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [lock])

  // 回到前台时跟服务器对一下（在别的设备上被锁/被解开）
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') void fetchReport() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [fetchReport])

  useEffect(() => {
    if (lock && lock.until <= now) useGuardStore.setState({ lock: null })
  }, [lock, now])

  if (!lock || lock.until <= now) return null
  const left = lock.until - now
  const h = Math.floor(left / 3600000)
  const mm = String(Math.floor((left % 3600000) / 60000)).padStart(2, '0')
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0')
  const pct = Math.min(100, Math.max(0, ((now - lock.startedAt) / Math.max(1, lock.until - lock.startedAt)) * 100))

  return (
    <div className="app-bg fixed inset-0 z-[90] flex items-center justify-center px-8" style={{ height: 'var(--app-height, 100dvh)' }} role="dialog" aria-modal="true" aria-label="已被锁屏">
      <div className="glass-strong w-full max-w-[340px] rounded-[28px] px-6 pb-6 pt-8 text-center">
        <div className="relative mx-auto mb-3 flex h-[88px] w-[88px] items-center justify-center rounded-full border-4 border-white bg-white/60 text-3xl shadow">
          {src ? <img src={src} alt="" className="h-full w-full rounded-full object-cover" /> : <span>{profile.avatarB || name.slice(-1)}</span>}
          <i className="absolute -bottom-1 -right-1 not-italic text-xl">🔒</i>
        </div>
        <div className="text-[17px] font-semibold text-ink">{name} 锁了你的手机</div>
        <div className="mt-4 font-mono text-[40px] font-semibold leading-none tracking-wide text-ink">{h ? `${h}:` : ''}{mm}:{ss}</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/50"><span className="block h-full bg-accent" style={{ width: `${pct}%` }} /></div>
        {lock.reason && <p className="mt-4 text-sm text-ink">“{lock.reason}”</p>}
        <p className="mt-2 text-xs text-muted">{profile.nameA ? `${profile.nameA}，` : ''}到点自动解开。</p>
        <button
          onClick={() => {
            if (!confirm) { setConfirm(true); return }
            setConfirm(false)
            sneak()
          }}
          className={`mt-5 w-full rounded-full py-2.5 text-sm ${confirm ? 'btn-primary' : 'glass text-muted'}`}
        >
          {confirm ? '真的解锁（他会知道）' : '偷偷解锁'}
        </button>
      </div>
    </div>
  )
}
