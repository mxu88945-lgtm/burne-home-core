import { useState } from 'react'
import { useApiStore, type ApiProvider } from '@/store/apiStore'
import { useSyncStore } from '@/store/syncStore'
import { listModels } from '@/api/llm'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

export default function ApiManager() {
  const { channels, activeId, addChannel, updateChannel, removeChannel, setActive } =
    useApiStore()
  const workerUrl = useSyncStore((s) => s.config.workerUrl)

  const [name, setName] = useState('')
  const [provider, setProvider] = useState<ApiProvider>('openai')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [viaWorker, setViaWorker] = useState(false)
  const [msg, setMsg] = useState('')
  const [models, setModels] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState<string>('')

  function preset() {
    setName('OpenRouter')
    setProvider('openai')
    setBaseUrl('https://openrouter.ai/api/v1')
    setModel('openai/gpt-4o-mini')
  }

  function add() {
    if (!baseUrl.trim() || !apiKey.trim()) {
      setMsg('请填 base URL 和 key')
      return
    }
    addChannel({
      name: name.trim() || provider,
      provider,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      viaWorker,
    })
    setName('')
    setBaseUrl('')
    setApiKey('')
    setModel('')
    setViaWorker(false)
    setMsg('已添加渠道（key 只存本地）')
  }

  async function fetchModels(id: string) {
    const ch = channels.find((c) => c.id === id)
    if (!ch) return
    setBusy(id)
    setMsg('')
    try {
      const list = await listModels(ch)
      setModels((m) => ({ ...m, [id]: list }))
      setMsg(`拉到 ${list.length} 个模型`)
    } catch (e) {
      setMsg(`拉取模型失败：${(e as Error).message}`)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-3">
      {msg && <div className="text-[11px] text-accent">{msg}</div>}

      {/* 已有渠道 */}
      {channels.length === 0 ? (
        <p className="text-[11px] text-muted">还没有渠道，下面加一条吧～</p>
      ) : (
        channels.map((c) => {
          const active = c.id === activeId
          return (
            <div
              key={c.id}
              className="rounded-2xl border p-3"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--card-border)',
              }}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActive(c.id)}
                  className="flex-1 text-left"
                >
                  <span className="text-sm font-medium text-ink">
                    {active ? '● ' : '○ '}
                    {c.name}
                  </span>
                  <span className="ml-2 text-[10px] text-muted">
                    {c.provider}
                    {c.viaWorker ? ' · 经Worker' : ' · 直连'}
                  </span>
                </button>
                <button
                  onClick={() => removeChannel(c.id)}
                  className="text-[11px] text-muted hover:text-accent"
                >
                  删除
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <select
                  value={c.model}
                  onChange={(e) => updateChannel(c.id, { model: e.target.value })}
                  className={inputCls + ' flex-1'}
                >
                  <option value={c.model}>{c.model || '（未设模型）'}</option>
                  {(models[c.id] || [])
                    .filter((m) => m !== c.model)
                    .map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => fetchModels(c.id)}
                  disabled={busy === c.id}
                  className="glass shrink-0 rounded-xl px-3 py-2 text-xs text-ink disabled:opacity-60"
                >
                  {busy === c.id ? '…' : '拉取模型'}
                </button>
              </div>
            </div>
          )
        })
      )}

      {/* 新增渠道 */}
      <div className="rounded-2xl border border-dashed border-line p-3">
        <div className="flex items-center justify-between">
          <span className="label">新增渠道</span>
          <button
            onClick={preset}
            className="text-[11px] text-accent hover:underline"
          >
            OpenRouter 预设
          </button>
        </div>
        <div className="mt-2 space-y-2">
          <input
            className={inputCls}
            placeholder="名称，如 OpenRouter"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className={inputCls}
            value={provider}
            onChange={(e) => setProvider(e.target.value as ApiProvider)}
          >
            <option value="openai">OpenAI 兼容（含 OpenRouter）</option>
            <option value="anthropic">Anthropic 官方</option>
          </select>
          <input
            className={inputCls}
            placeholder={
              provider === 'anthropic'
                ? 'base URL，如 https://api.anthropic.com'
                : 'base URL，如 https://openrouter.ai/api/v1'
            }
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <input
            className={inputCls}
            type="password"
            placeholder="API key（只存本地）"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="模型，如 openai/gpt-4o-mini（可先留空，加完拉取）"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={viaWorker}
              onChange={(e) => setViaWorker(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            经 Worker 中转（渠道不支持浏览器直连时勾选
            {workerUrl ? '' : '，需先配 Worker 地址'}）
          </label>
          <button onClick={add} className="btn-primary w-full rounded-xl py-2 text-sm">
            ＋ 添加渠道
          </button>
        </div>
      </div>
    </div>
  )
}
