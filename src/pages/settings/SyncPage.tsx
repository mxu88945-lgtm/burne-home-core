import { useState } from 'react'
import SubPage from '@/components/settings/SubPage'
import SupabaseSync from '@/components/settings/SupabaseSync'
import { useSyncStore } from '@/store/syncStore'

export default function SyncPage() {
  const sync = useSyncStore()
  const [workerUrl, setWorkerUrl] = useState(sync.config.workerUrl ?? '')
  const [syncKey, setSyncKey] = useState(sync.config.syncKey ?? '')
  const [msg, setMsg] = useState('')

  const inputCls =
    'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

  return (
    <SubPage title="账号 · 多设备同步 ☁️">
      <div className="glass rounded-2xl p-4">
        <SupabaseSync />
      </div>

      <details className="glass rounded-2xl p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          🔌 Worker 中转（可选）
        </summary>
        <p className="mt-2 text-[11px] text-muted">
          仅当某些聊天渠道不支持浏览器直连、需经自己的 Worker 转发时才填。
        </p>
        <div className="mt-3 space-y-2">
          <input
            className={inputCls}
            placeholder="Worker 地址 https://xxx.workers.dev"
            value={workerUrl}
            onChange={(e) => setWorkerUrl(e.target.value)}
          />
          <input
            className={inputCls}
            type="password"
            placeholder="共享密钥（可选）"
            value={syncKey}
            onChange={(e) => setSyncKey(e.target.value)}
          />
          <button
            onClick={() => {
              sync.setConfig({
                workerUrl: workerUrl.trim() || undefined,
                syncKey: syncKey.trim() || undefined,
              })
              setMsg('已保存')
            }}
            className="btn-primary rounded-xl px-4 py-2 text-sm"
          >
            保存
          </button>
          {msg && <span className="ml-2 text-[11px] text-accent">{msg}</span>}
        </div>
      </details>
    </SubPage>
  )
}
