import { useState, type ReactNode } from 'react'
import { usePrivacyStore } from '@/store/privacyStore'
import { LockIcon } from '@/components/ui/navIcons'

/** 启用隐私锁且未解锁时，盖一层全屏输入密码界面。 */
export default function PrivacyGate({ children }: { children: ReactNode }) {
  const enabled = usePrivacyStore((s) => s.enabled)
  const unlocked = usePrivacyStore((s) => s.unlocked)
  const verify = usePrivacyStore((s) => s.verify)
  const unlock = usePrivacyStore((s) => s.unlock)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!pw || busy) return
    setBusy(true)
    const ok = await verify(pw)
    setBusy(false)
    if (ok) {
      unlock()
      setPw('')
      setErr('')
    } else {
      setErr('密码不对哦，再试试～')
      setPw('')
    }
  }

  return (
    <>
      {children}
      {enabled && !unlocked && (
        <div
          className="app-bg fixed inset-0 z-[100] flex flex-col items-center justify-center px-10"
          style={{ height: 'var(--app-height, 100dvh)' }}
        >
          <div className="glass-strong flex h-16 w-16 items-center justify-center rounded-3xl text-accent">
            <LockIcon className="h-7 w-7" />
          </div>
          <h1 className="headline mt-5 text-2xl text-ink">已上锁</h1>
          <p className="mt-1 text-xs text-muted">输入密码解锁</p>
          <input
            type="password"
            value={pw}
            autoFocus
            onChange={(e) => {
              setPw(e.target.value)
              if (err) setErr('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder="密码"
            className="glass mt-6 w-full max-w-[240px] rounded-2xl px-4 py-3 text-center text-base text-ink outline-none placeholder:text-muted"
          />
          {err && <p className="mt-2 text-[12px] text-red-500">{err}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={busy || !pw}
            className="btn-primary mt-5 w-full max-w-[240px] rounded-2xl py-3 text-sm disabled:opacity-50"
          >
            {busy ? '验证中…' : '解锁'}
          </button>
        </div>
      )}
    </>
  )
}
