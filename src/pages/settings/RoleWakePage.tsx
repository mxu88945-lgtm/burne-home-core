import { useState } from 'react'
import SubPage from '@/components/settings/SubPage'
import { useRoleWakeStore, roleWakeReady } from '@/store/roleWakeStore'
import { pullRoleWakeInbox } from '@/lib/roleWakeService'

export default function RoleWakePage() {
  const config = useRoleWakeStore()
  const [url, setUrl] = useState(config.url)
  const [key, setKey] = useState(config.key)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  function save() {
    config.setConfig({ enabled: config.enabled, url: url.trim().replace(/\/+$/, ''), key })
    setMessage('已保存到这台手机；不会进备份。')
  }
  async function testInbox() {
    setBusy(true)
    setMessage('')
    try {
      const count = await pullRoleWakeInbox()
      setMessage(count ? `收到了 ${count} 条主动消息。` : '目前没有新的主动消息。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SubPage title="他的小心思 💌">
      <div className="glass space-y-3 rounded-2xl p-4">
        <div>
          <h2 className="text-sm font-medium text-ink">让他偶尔自己来找你</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">role-wake 会根据距离上次聊天的时间，偶尔判断要不要主动说一两句。地址和密钥只存在本机，不进入备份，也不会显示在诊断摘要里。</p>
        </div>
        <label className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <span className="text-sm text-ink">开启小心思<span className="mt-0.5 block text-[11px] text-muted">打开 App 或回到前台时会取回消息。</span></span>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => { config.setConfig({ enabled: e.target.checked }); setMessage(e.target.checked ? '已打开，请填好下面两项。' : '已关闭。') }}
            className="h-5 w-5 accent-accent"
          />
        </label>
        <input className="w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent" placeholder="role-wake 服务地址 https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input className="w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent" type="password" placeholder="WAKE_KEY" value={key} onChange={(e) => setKey(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={save} className="btn-primary rounded-xl px-4 py-2 text-sm">保存</button>
          <button type="button" disabled={busy || !roleWakeReady()} onClick={() => void testInbox()} className="glass rounded-xl px-4 py-2 text-sm text-ink">拉一次收件箱</button>
        </div>
        {roleWakeReady() && <p className="text-[11px] text-muted">聊天结束后会同步角色摘要；只有推送已开启且已有 device 时，才会把 pushDevice / pushUrl 一起传给服务。</p>}
      </div>
      {message && <p className="px-1 text-[11px] leading-relaxed text-accent">{message}</p>}
    </SubPage>
  )
}
