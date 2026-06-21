import { useState } from 'react'
import SubPage from '@/components/settings/SubPage'
import { usePrivacyStore } from '@/store/privacyStore'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

export default function PrivacyPage() {
  const enabled = usePrivacyStore((s) => s.enabled)
  const setPassword = usePrivacyStore((s) => s.setPassword)
  const enable = usePrivacyStore((s) => s.enable)
  const disable = usePrivacyStore((s) => s.disable)

  const [showSet, setShowSet] = useState(false)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState('')

  async function savePassword() {
    if (pw1.length < 4) {
      setMsg('密码至少 4 位')
      return
    }
    if (pw1 !== pw2) {
      setMsg('两次输入不一致')
      return
    }
    await setPassword(pw1)
    enable()
    setPw1('')
    setPw2('')
    setShowSet(false)
    setMsg('已设置密码并启用 ✓')
  }

  function onToggle(checked: boolean) {
    setMsg('')
    if (checked) {
      // 启用：先设密码
      setShowSet(true)
    } else {
      if (window.confirm('关闭隐私锁会清除已设的密码，确定？')) {
        disable()
        setShowSet(false)
        setMsg('已关闭隐私锁')
      }
    }
  }

  return (
    <SubPage title="隐私锁 🔒">
      {msg && <div className="text-[11px] text-accent">{msg}</div>}

      <div className="glass space-y-3 rounded-2xl p-4">
        <label className="flex items-center justify-between">
          <span className="text-sm text-ink">
            启用隐私锁
            <span className="block text-[11px] text-muted">
              开启后每次打开/刷新 App 都要输密码
            </span>
          </span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-5 w-5 accent-accent"
          />
        </label>

        {/* 设 / 改密码表单 */}
        {showSet && (
          <div className="space-y-2 border-t border-line pt-3">
            <input
              type="password"
              className={inputCls}
              placeholder="设置密码（至少 4 位）"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
            />
            <input
              type="password"
              className={inputCls}
              placeholder="再输一次"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={savePassword}
                className="btn-primary rounded-xl px-4 py-2 text-sm"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSet(false)
                  setPw1('')
                  setPw2('')
                  setMsg('')
                }}
                className="glass rounded-xl px-4 py-2 text-sm text-ink"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 已启用：改密码入口 */}
        {enabled && !showSet && (
          <button
            type="button"
            onClick={() => {
              setMsg('')
              setShowSet(true)
            }}
            className="glass rounded-xl px-4 py-2 text-sm text-ink"
          >
            修改密码
          </button>
        )}

        <p className="text-[11px] leading-relaxed text-muted">
          密码只在本机以哈希形式保存，绝不上传。忘记密码可在「数据 · 备份」里清缓存重置（也会清掉本地数据，请先备份）。
        </p>
      </div>
    </SubPage>
  )
}
