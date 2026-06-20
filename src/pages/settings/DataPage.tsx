import { useRef, useState } from 'react'
import SubPage from '@/components/settings/SubPage'
import {
  downloadFullBackup,
  parseFullBackup,
  applyFullBackup,
  readFileText,
} from '@/api/backup'

export default function DataPage() {
  const [includeKeys, setIncludeKeys] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function onRestore(file: File) {
    try {
      const b = parseFullBackup(await readFileText(file))
      if (window.confirm('将用备份覆盖当前全部数据并刷新页面。确定？')) {
        applyFullBackup(b)
        location.reload()
      }
    } catch (e) {
      setMsg(`恢复失败：${(e as Error).message}`)
    }
  }

  async function forceRefresh() {
    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
    } finally {
      // 刷新后回到主页（避免一打开停在设置页）
      location.href = location.pathname + '?t=' + Date.now() + '#/'
    }
  }

  return (
    <SubPage title="数据 · 备份 💾">
      {msg && <div className="text-[11px] text-accent">{msg}</div>}

      <div className="glass space-y-3 rounded-2xl p-4">
        <p className="text-[11px] leading-relaxed text-muted">
          把记忆、设置、人设、渠道导出成一个文件，换设备时再导入恢复。导出的 .json
          存在你自己设备上。
        </p>
        <label className="flex items-center gap-2 text-[12px] text-ink">
          <input
            type="checkbox"
            checked={includeKeys}
            onChange={(e) => setIncludeKeys(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          包含 API Key（默认不含，更安全）
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              downloadFullBackup(includeKeys)
              setMsg(includeKeys ? '已导出（含 API Key）' : '已导出（不含 API Key）')
            }}
            className="btn-primary rounded-xl px-4 py-2 text-sm"
          >
            导出备份
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="glass rounded-xl px-4 py-2 text-sm text-ink"
          >
            恢复备份
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onRestore(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="glass space-y-2 rounded-2xl p-4">
        <p className="text-[11px] leading-relaxed text-muted">
          没更新到最新功能时点这个：清缓存、拉最新代码（不动你的聊天和设置）。
        </p>
        <button
          onClick={forceRefresh}
          className="btn-primary rounded-xl px-4 py-2 text-sm"
        >
          强制刷新到最新版
        </button>
      </div>
    </SubPage>
  )
}
