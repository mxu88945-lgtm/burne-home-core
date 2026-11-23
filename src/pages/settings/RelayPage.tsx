import { useState } from 'react'
import SubPage from '@/components/settings/SubPage'
import { getRelayConfig, saveRelayConfig } from '@/lib/relayService'

export default function RelayPage() {
  const initial = getRelayConfig()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [url, setUrl] = useState(initial.url)
  const [key, setKey] = useState(initial.key)
  const [message, setMessage] = useState('')
  function save() {
    saveRelayConfig({ enabled, url: url.trim().replace(/\/+$/, ''), key })
    setMessage('已保存到这台手机；不会进备份、云同步或诊断摘要。')
  }
  return (
    <SubPage title="锁屏也不断 🌙">
      <div className="glass space-y-4 rounded-2xl p-4">
        <div>
          <h2 className="text-sm font-medium text-ink">🌙 锁屏也不断</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">只对伯恩主聊天生效。打开后，手机锁屏时由云端中继替你把回复跑完；中继连不上会自动回到原来的直连。</p>
        </div>
        <label className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <span className="text-sm text-ink">启用锁屏中继<span className="mt-0.5 block text-[11px] text-muted">默认关闭；剧场、群聊和其他页面不受影响。</span></span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 accent-accent" />
        </label>
        <input className="w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent" placeholder="中继地址，例如 https://relay.example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input className="w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent" type="password" placeholder="RELAY_KEY" value={key} onChange={(e) => setKey(e.target.value)} />
        <button type="button" onClick={save} className="btn-primary rounded-xl px-4 py-2 text-sm">保存</button>
        {message && <p className="text-[11px] leading-relaxed text-accent">{message}</p>}
      </div>
    </SubPage>
  )
}
