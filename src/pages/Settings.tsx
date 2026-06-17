import { useRef, useState } from 'react'
import type { ReactNode, InputHTMLAttributes } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { usePrivacyStore } from '@/store/privacyStore'
import { useMemoryStore } from '@/store/memoryStore'
import {
  pullFromNotion,
  pushToNotion,
  testNotionConnection,
} from '@/api/notion'
import { downloadBackup, parseBackup, readFileText } from '@/api/backup'

function Section({
  title,
  desc,
  children,
}: {
  title: string
  desc?: string
  children: ReactNode
}) {
  return (
    <section className="glass rounded-3xl p-5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {desc && <p className="mt-1 text-[11px] leading-relaxed text-muted">{desc}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  )
}

function Field({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        {...props}
        className="mt-1.5 w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
      />
    </label>
  )
}

export default function Settings() {
  const { notion, syncStatus, setNotionConfig, setSyncStatus } =
    useSettingsStore()
  const privacy = usePrivacyStore()
  const memories = useMemoryStore((s) => s.memories)
  const replaceAll = useMemoryStore((s) => s.replaceAll)

  const [proxyUrl, setProxyUrl] = useState(notion.proxyUrl ?? '')
  const [databaseId, setDatabaseId] = useState(notion.databaseId ?? '')
  const [token, setToken] = useState(notion.token ?? '')
  const [msg, setMsg] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  function saveNotion() {
    setNotionConfig({
      proxyUrl: proxyUrl.trim() || undefined,
      databaseId: databaseId.trim() || undefined,
      token: token.trim() || undefined,
    })
    setMsg('已保存到本地（token 不会提交仓库）')
  }

  async function runNotion(
    label: string,
    fn: () => Promise<string>
  ) {
    setSyncStatus('syncing')
    setMsg(`${label}中…`)
    try {
      const result = await fn()
      setSyncStatus('success')
      setMsg(result)
    } catch (e) {
      setSyncStatus('error')
      setMsg(`${label}失败：${(e as Error).message}`)
    }
  }

  async function onRestore(file: File) {
    try {
      const backup = parseBackup(await readFileText(file))
      if (
        window.confirm(
          `将用备份覆盖当前 ${memories.length} 条记忆（备份含 ${backup.memories.length} 条）。确定？`
        )
      ) {
        replaceAll(backup.memories)
        setMsg(`已恢复 ${backup.memories.length} 条记忆`)
      }
    } catch (e) {
      setMsg(`恢复失败：${(e as Error).message}`)
    }
  }

  const cfg = () => ({
    ...notion,
    proxyUrl: proxyUrl.trim() || undefined,
    databaseId: databaseId.trim() || undefined,
    token: token.trim() || undefined,
  })

  return (
    <div className="space-y-5">
      <div className="px-1">
        <h2 className="headline text-2xl text-ink">设置 ⚙️</h2>
        <p className="mt-1 text-sm text-muted">同步 · 备份 · 隐私</p>
      </div>

      {msg && (
        <div className="glass-strong rounded-2xl px-4 py-2.5 text-xs text-ink">
          {msg}
        </div>
      )}

      {/* Notion 同步 */}
      <Section
        title="☁️ Notion 同步"
        desc="走自建 Worker 代理。token 只存本地、不提交仓库；更推荐让 Worker 持有 token，前端不填。字段映射等真实同步逻辑第三轮接入。"
      >
        <Field
          label="Worker 代理地址"
          placeholder="https://your-worker.workers.dev"
          value={proxyUrl}
          onChange={(e) => setProxyUrl(e.target.value)}
        />
        <Field
          label="数据库 ID（非敏感）"
          placeholder="xxxxxxxxxxxx"
          value={databaseId}
          onChange={(e) => setDatabaseId(e.target.value)}
        />
        <Field
          label="Notion Token（可选 · 仅存本地）"
          type="password"
          placeholder="留空则由 Worker 持有"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />

        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={saveNotion} className="btn-primary rounded-xl px-4 py-2 text-sm">
            保存配置
          </button>
          <button
            onClick={() =>
              runNotion('测试连接', async () =>
                (await testNotionConnection(cfg()))
                  ? '连接正常 ✓'
                  : '代理返回未就绪'
              )
            }
            className="glass rounded-xl px-4 py-2 text-sm text-ink"
          >
            测试连接
          </button>
          <button
            onClick={() =>
              runNotion('拉取', async () => {
                const list = await pullFromNotion(cfg())
                replaceAll(list)
                return `已拉取 ${list.length} 条`
              })
            }
            className="glass rounded-xl px-4 py-2 text-sm text-ink"
          >
            拉取
          </button>
          <button
            onClick={() =>
              runNotion('推送', async () => {
                const r = await pushToNotion(cfg(), memories)
                return `已推送 ${r.pushed} 条`
              })
            }
            className="glass rounded-xl px-4 py-2 text-sm text-ink"
          >
            推送
          </button>
        </div>
        <div className="text-[11px] text-muted">
          同步状态：{syncStatus}
        </div>
      </Section>

      {/* 本地备份 */}
      <Section
        title="💾 本地备份 / 恢复"
        desc="导出 / 恢复都在本地完成，不经过任何服务器。"
      >
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              downloadBackup(memories)
              setMsg(`已导出 ${memories.length} 条记忆`)
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
      </Section>

      {/* 隐私锁 */}
      <Section
        title="🔒 隐私锁"
        desc="开关已就绪；口令解锁与本地加密第三轮接入。"
      >
        <label className="flex items-center justify-between">
          <span className="text-sm text-ink">启用隐私锁</span>
          <input
            type="checkbox"
            checked={privacy.enabled}
            onChange={(e) => privacy.setEnabled(e.target.checked)}
            className="h-5 w-5 accent-accent"
          />
        </label>
      </Section>

      <p className="pb-2 text-center text-[11px] text-muted">
        详细计划见仓库 docs/ROADMAP.md ♡
      </p>
    </div>
  )
}
