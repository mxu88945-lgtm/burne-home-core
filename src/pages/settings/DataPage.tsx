import { useEffect, useRef, useState } from 'react'
import SubPage from '@/components/settings/SubPage'
import {
  downloadFullBackup,
  parseFullBackup,
  applyFullBackup,
  readFileText,
} from '@/api/backup'

const NS = 'burne-home-core:'

/** 各存储 key 的中文名 + 太大时该怎么办 */
const KEY_INFO: Record<string, { label: string; hint?: string }> = {
  drama: { label: '戏剧（剧本+对话+角色卡）', hint: '删掉不玩的旧剧本，或对旧会话用 ⋮→♻️重启对话' },
  chat: { label: '主聊天记录', hint: '删掉不需要的旧会话' },
  phone: { label: '小手机', hint: '删掉不需要的旧会话' },
  'char-lib': { label: '角色卡库', hint: '删掉不用的角色卡（世界书/正则多的卡很占地方）' },
  memories: { label: '记忆库' },
  appearance: { label: '外观（背景设置）', hint: '背景图已自动搬去大仓库，这里应该很小' },
  stickers: { label: '表情贴纸', hint: '删掉不用的图片贴纸' },
  music: { label: '歌单（列表信息）' },
  reading: { label: '书房（进度等）' },
  usage: { label: '用量统计' },
  persona: { label: 'AI 人设' },
  profile: { label: '我的资料' },
  settings: { label: '设置' },
  api: { label: 'API 渠道' },
  sync: { label: '云同步' },
  tts: { label: '语音' },
  theme: { label: '主题' },
  pet: { label: '桌宠' },
  tasks: { label: '任务' },
  period: { label: '生理期' },
  chatprefs: { label: '聊天偏好' },
  'memory-overview': { label: '记忆总览' },
  'memory-model': { label: '记忆模型' },
  stt: { label: '听写' },
  vision: { label: '识图' },
  imagegen: { label: '生图' },
  privacy: { label: '隐私' },
  supabase: { label: 'Supabase' },
  'notion-config': { label: 'Notion' },
  'reading-api': { label: '书房 API' },
  'device-id': { label: '设备 ID' },
}

interface SizeRow {
  key: string
  label: string
  hint?: string
  kb: number
}

/** 扫一遍 localStorage：每个 key 占多少（UTF-16 每字符 2 字节，近似值） */
function scanStorage(): { rows: SizeRow[]; totalKb: number } {
  const rows: SizeRow[] = []
  let totalKb = 0
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k) continue
    const v = localStorage.getItem(k) || ''
    const kb = ((k.length + v.length) * 2) / 1024
    totalKb += kb
    const short = k.startsWith(NS) ? k.slice(NS.length) : k
    const info = k.startsWith(NS) ? KEY_INFO[short] : undefined
    rows.push({ key: k, label: info?.label || short, hint: info?.hint, kb })
  }
  rows.sort((a, b) => b.kb - a.kb)
  return { rows, totalKb }
}

const QUOTA_KB = 5 * 1024 // iOS Safari 约 5MB

export default function DataPage() {
  const [includeKeys, setIncludeKeys] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [scan, setScan] = useState<{ rows: SizeRow[]; totalKb: number } | null>(null)
  useEffect(() => {
    // 等一拍再扫：让 AppLayout 的背景图搬家先跑完，看到的是搬完后的真实占用
    const t = setTimeout(() => setScan(scanStorage()), 800)
    return () => clearTimeout(t)
  }, [])

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
          把<b className="text-ink">全部本地数据</b>——记忆库、<b className="text-ink">历史对话（所有会话）</b>、设置、人设、渠道、外观、用量等——导出成一个文件，换设备时再导入恢复。导出的
          .json 存在你自己设备上。
        </p>
        <p className="text-[11px] leading-relaxed text-muted">
          恢复时会用备份<b className="text-ink">覆盖</b>当前全部数据并刷新。聊天里的图片/文件较多时备份体积会偏大，属正常。
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

      {/* 存储体检：谁在吃 localStorage 的 5MB 配额（写满会静默丢对话，见过事故） */}
      <div className="glass space-y-3 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="label">存储体检 🩺</div>
          <button
            onClick={() => setScan(scanStorage())}
            className="glass rounded-lg px-3 py-1 text-[11px] text-ink"
          >
            重新扫描
          </button>
        </div>
        {!scan ? (
          <p className="text-[11px] text-muted">扫描中…</p>
        ) : (
          <>
            {(() => {
              const pct = Math.min(100, (scan.totalKb / QUOTA_KB) * 100)
              const tone = pct > 85 ? 'text-red-500' : pct > 60 ? 'text-amber-500' : 'text-ink'
              const bar = pct > 85 ? '#ef4444' : pct > 60 ? '#f59e0b' : 'var(--accent)'
              return (
                <div>
                  <div className={`flex justify-between text-[12px] ${tone}`}>
                    <span>本地文本仓库已用</span>
                    <b>
                      {(scan.totalKb / 1024).toFixed(2)} MB / 约 5 MB（{pct.toFixed(0)}%）
                    </b>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: bar }} />
                  </div>
                  {pct > 85 && (
                    <p className="mt-1 text-[11px] leading-relaxed text-red-500">
                      快满了！满了之后新聊的内容会存不进去（刷新就丢）。按下面提示给最大的几项瘦身。
                    </p>
                  )}
                </div>
              )
            })()}
            <div className="space-y-2">
              {scan.rows
                .filter((r) => r.kb >= 1)
                .slice(0, 12)
                .map((r) => {
                  const pctOfTotal = scan.totalKb ? (r.kb / scan.totalKb) * 100 : 0
                  const big = r.kb > 800
                  return (
                    <div key={r.key}>
                      <div className="flex justify-between text-[12px]">
                        <span className={big ? 'text-red-500' : 'text-ink'}>{r.label}</span>
                        <span className={big ? 'text-red-500' : 'text-muted'}>
                          {r.kb >= 1024 ? `${(r.kb / 1024).toFixed(2)} MB` : `${Math.round(r.kb)} KB`}
                        </span>
                      </div>
                      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-black/10">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.max(2, pctOfTotal)}%`, background: big ? '#ef4444' : 'var(--accent)' }}
                        />
                      </div>
                      {big && r.hint && (
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">💡 {r.hint}</p>
                      )}
                    </div>
                  )
                })}
            </div>
            <p className="text-[11px] leading-relaxed text-muted">
              图片、歌曲、书这些「大件」都放在另一个大仓库（IndexedDB，GB 级），不占上面的额度。这里只算文字类数据。
            </p>
          </>
        )}
      </div>
    </SubPage>
  )
}
