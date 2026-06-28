import { useState } from 'react'
import { useMemoryModelStore } from '@/store/memoryModelStore'
import { listModels } from '@/api/llm'
import PasswordInput from '@/components/ui/PasswordInput'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

export default function MemoryModelManager() {
  const { config, update } = useMemoryModelStore()
  const [models, setModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [msg, setMsg] = useState('')

  async function fetchModels() {
    if (!config.baseUrl.trim() || !config.apiKey.trim()) {
      setMsg('先填接口地址和 API Key 再获取模型')
      return
    }
    setFetching(true)
    setMsg('')
    try {
      const list = await listModels({
        id: '_memory',
        name: '记忆',
        provider: 'openai',
        baseUrl: config.baseUrl.trim(),
        apiKey: config.apiKey.trim(),
        model: config.model.trim(),
      })
      setModels(list)
      if (!config.model && list[0]) update({ model: list[0] })
      setMsg(`拉到 ${list.length} 个模型，选一个`)
    } catch (e) {
      setMsg(`获取模型失败：${(e as Error).message}`)
    } finally {
      setFetching(false)
    }
  }

  return (
    <div className="space-y-3">
      {msg && <div className="text-[11px] text-accent">{msg}</div>}

      <label className="glass flex items-center justify-between rounded-2xl px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-ink">用单独模型记记忆</span>
          <span className="block text-[11px] text-muted">
            开了之后，自动记忆改用下面这个模型提炼，不再占用主聊天模型
          </span>
        </span>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="h-5 w-5 accent-accent"
        />
      </label>

      <div className="glass rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="label">记忆模型配置（只存本地）</span>
          <button
            type="button"
            onClick={() => update({ baseUrl: 'https://openrouter.ai/api/v1' })}
            className="text-[11px] text-accent hover:underline"
          >
            OpenRouter 预设
          </button>
        </div>
        <input
          className={inputCls}
          placeholder="接口地址，如 https://openrouter.ai/api/v1"
          value={config.baseUrl}
          onChange={(e) => update({ baseUrl: e.target.value })}
        />
        <PasswordInput
          className={inputCls}
          placeholder="API Key（只存本地，可与聊天用同一把）"
          value={config.apiKey}
          onChange={(e) => update({ apiKey: e.target.value })}
        />
        <div className="flex items-center gap-2">
          <input
            className={inputCls + ' flex-1'}
            placeholder="记忆模型，建议挑便宜/快的，如 openai/gpt-4o-mini"
            value={config.model}
            onChange={(e) => update({ model: e.target.value })}
          />
          <button
            onClick={fetchModels}
            disabled={fetching}
            className="glass shrink-0 rounded-xl px-3 py-2 text-xs text-ink disabled:opacity-60"
          >
            {fetching ? '获取中…' : '获取模型'}
          </button>
        </div>
        {models.length > 0 && (
          <select
            className={inputCls}
            value={config.model}
            onChange={(e) => update({ model: e.target.value })}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="text-[11px] text-muted leading-relaxed">
        开启后：每轮判断「有没有值得长期记住的事」会用这个独立模型来做，和主聊天模型分开——
        既省主模型的调用，也能挑个便宜小模型专门干这活。没开就还是用主聊天模型。Key 只存本设备，不上传、不进仓库。
      </p>
    </div>
  )
}
