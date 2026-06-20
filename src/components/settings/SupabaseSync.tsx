import { useEffect, useState } from 'react'
import { useSupabaseStore } from '@/store/supabaseStore'
import { useMemoryStore } from '@/store/memoryStore'
import {
  signIn,
  signUp,
  signOut,
  currentUser,
  supaSyncNow,
} from '@/api/supabaseSync'
import PasswordInput from '@/components/ui/PasswordInput'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

export default function SupabaseSync() {
  const { config, userEmail, setConfig, setUserEmail } = useSupabaseStore()
  const memories = useMemoryStore((s) => s.memories)
  const replaceAll = useMemoryStore((s) => s.replaceAll)

  const [url, setUrl] = useState(config.url ?? '')
  const [anonKey, setAnonKey] = useState(config.anonKey ?? '')
  const [email, setEmail] = useState(config.email ?? '')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  // 启动时检查是否已登录
  useEffect(() => {
    currentUser(config.url, config.anonKey)
      .then((u) => setUserEmail(u?.email ?? undefined))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function save() {
    setConfig({
      url: url.trim() || undefined,
      anonKey: anonKey.trim() || undefined,
      email: email.trim() || undefined,
    })
    setMsg('已保存 Supabase 配置到本地')
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true)
    setMsg(`${label}中…`)
    try {
      await fn()
    } catch (e) {
      setMsg(`${label}失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const u = url.trim()
  const k = anonKey.trim()

  return (
    <div className="space-y-3">
      {msg && <div className="text-[11px] text-accent">{msg}</div>}

      <p className="text-[11px] leading-relaxed text-muted">
        登录后多设备自动共享。anon(publishable) key 可放前端；AI Key 不上云、只留本地。
      </p>

      <input className={inputCls} placeholder="Supabase URL，如 https://xxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
      <input className={inputCls} placeholder="anon / publishable key" value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />

      {userEmail ? (
        <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
          <span className="text-sm text-ink">已登录：{userEmail}</span>
          <button
            onClick={() =>
              run('退出', async () => {
                await signOut(u, k)
                setUserEmail(undefined)
                setMsg('已退出登录')
              })
            }
            className="text-[11px] text-muted hover:text-accent"
          >
            退出登录
          </button>
        </div>
      ) : (
        <>
          <input className={inputCls} type="email" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordInput className={inputCls} placeholder="密码（至少 6 位）" value={password} onChange={(e) => setPassword(e.target.value)} />
        </>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={save} className="glass rounded-xl px-4 py-2 text-sm text-ink">
          保存配置
        </button>
        {!userEmail && (
          <>
            <button
              disabled={busy}
              onClick={() =>
                run('登录', async () => {
                  const user = await signIn(u, k, email.trim(), password)
                  setConfig({ url: u, anonKey: k, email: email.trim() })
                  setUserEmail(user?.email ?? undefined)
                  setPassword('')
                  setMsg('登录成功 ✓')
                })
              }
              className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-60"
            >
              登录
            </button>
            <button
              disabled={busy}
              onClick={() =>
                run('注册', async () => {
                  await signUp(u, k, email.trim(), password)
                  setMsg('已注册，若需邮箱验证请查收邮件后再登录')
                })
              }
              className="glass rounded-xl px-4 py-2 text-sm text-ink disabled:opacity-60"
            >
              注册
            </button>
          </>
        )}
        {userEmail && (
          <button
            disabled={busy}
            onClick={() =>
              run('同步', async () => {
                const merged = await supaSyncNow(u, k, memories)
                replaceAll(merged)
                setMsg(`同步完成，共 ${merged.length} 条`)
              })
            }
            className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-60"
          >
            立即同步
          </button>
        )}
      </div>
    </div>
  )
}
