import { useState } from 'react'
import SubPage from '@/components/settings/SubPage'
import { disablePush, enablePush, sendTestPush, syncPushContext, setPushProactivePerDay } from '@/lib/pushService'
import { PUSH_PROACTIVE_OPTIONS, usePushStore, type PushProactivePerDay } from '@/store/pushStore'

export default function PushPage() {
  const enabled = usePushStore((state) => state.enabled)
  const proactivePerDay = usePushStore((state) => state.proactivePerDay)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function toggle(next: boolean) {
    setMessage('')
    setBusy(true)
    try {
      if (!next) {
        await disablePush()
        setMessage('已关掉手机提醒；不会再向推送服务同步主动消息。')
        return
      }
      const result = await enablePush()
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      await syncPushContext().catch(() => undefined)
      setMessage('🔔 已开启。可以点下面的测试按钮试一下。')
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    setMessage('')
    try {
      await sendTestPush('伯恩')
      setMessage('测试推送已发出，请稍等几秒。')
    } catch (error) {
      setMessage(error instanceof Error ? `测试失败：${error.message}` : '测试失败，请稍后再试。')
    } finally {
      setBusy(false)
    }
  }

  async function changeProactive(value: PushProactivePerDay) {
    setBusy(true)
    try {
      await setPushProactivePerDay(value)
      setMessage(value ? `💌 已设置为每天最多 ${value} 条。` : '已关掉主动消息。')
    } catch (error) {
      setMessage(error instanceof Error ? `保存失败：${error.message}` : '保存失败，请稍后再试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SubPage title="推送提醒 · 主动消息 🔔">
      <div className="glass space-y-4 rounded-2xl p-4">
        <div>
          <h2 className="text-sm font-medium text-ink">🔔 关掉 App 也能收到提醒</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            默认关闭。打开后，伯恩可以在你没打开 App 时给手机发通知；设备标识只留在这台手机，不进备份。
          </p>
        </div>
        <label className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <span className="text-sm text-ink">手机通知<span className="mt-0.5 block text-[11px] text-muted">第一次点开时才会请求 iPhone 权限。</span></span>
          <input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => void toggle(e.target.checked)} className="h-5 w-5 accent-accent" />
        </label>
        {enabled && (
          <button type="button" disabled={busy} onClick={() => void test()} className="glass rounded-xl px-3 py-2 text-xs text-ink">
            发送一条测试通知
          </button>
        )}
      </div>

      <div className="glass space-y-3 rounded-2xl p-4">
        <div>
          <h2 className="text-sm font-medium text-ink">💌 他会主动来找你</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">只在白天 09:00–22:30 之间工作，必须先打开上面的手机通知。服务端只收到角色设定、长期记忆和最近聊天摘要。</p>
        </div>
        <select
          value={proactivePerDay}
          disabled={!enabled || busy}
          onChange={(e) => void changeProactive(Number(e.target.value) as PushProactivePerDay)}
          className="w-full rounded-xl border border-line bg-white/50 px-3 py-2 text-sm text-ink outline-none"
        >
          {PUSH_PROACTIVE_OPTIONS.map((value) => <option key={value} value={value}>{value === 0 ? '关' : `每天 ${value} 条`}</option>)}
        </select>
        {!enabled && <p className="text-[11px] text-muted">先打开手机通知，才能开启主动消息。</p>}
      </div>
      {message && <p className="px-1 text-[11px] leading-relaxed text-accent">{message}</p>}
    </SubPage>
  )
}
