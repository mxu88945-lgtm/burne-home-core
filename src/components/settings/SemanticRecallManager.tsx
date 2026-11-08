import { useEffect, useState } from 'react'
import { useApiStore } from '@/store/apiStore'
import { DEFAULT_EMBED_MODEL, useSemanticStore } from '@/store/semanticStore'
import {
  rebuildSemanticIndex,
  refreshSemanticCounts,
  scheduleSemanticIndex,
  semanticChannel,
  testSemanticEmbedding,
} from '@/lib/semanticRuntime'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

function hhmm(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function SemanticRecallManager() {
  const channels = useApiStore((s) => s.channels)
  const { config, progress, update } = useSemanticStore()
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [rebuilding, setRebuilding] = useState(false)
  const channel = semanticChannel(config)

  useEffect(() => {
    if (config.enabled) void refreshSemanticCounts()
  }, [config.enabled, config.model, config.channelId])

  async function runTest() {
    if (!channel) {
      setTestMsg('先选一个渠道')
      return
    }
    setTesting(true)
    setTestMsg('')
    try {
      const dim = await testSemanticEmbedding(channel, config.model || DEFAULT_EMBED_MODEL)
      setTestMsg(`✓ 可以用，向量 ${dim} 维`)
    } catch (e) {
      setTestMsg(`✗ ${(e as Error).message}`)
    } finally {
      setTesting(false)
    }
  }

  async function rebuild() {
    setRebuilding(true)
    try {
      await rebuildSemanticIndex()
    } finally {
      setRebuilding(false)
    }
  }

  function toggle(enabled: boolean) {
    update({ enabled })
    if (enabled) scheduleSemanticIndex(1000)
  }

  const pct = progress.total ? Math.round((progress.indexed / progress.total) * 100) : 0

  return (
    <div className="space-y-3">
      <label className="glass flex items-center justify-between rounded-2xl px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-ink">语义召回</span>
          <span className="block text-[11px] text-muted">
            换了说法也能想起旧事：按意思找相近的旧聊天、旧日原文和记忆
          </span>
        </span>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => toggle(e.target.checked)}
          className="h-5 w-5 accent-accent"
        />
      </label>

      <div className="glass rounded-2xl p-4 space-y-2">
        <span className="label">向量渠道（复用渠道里的 Key）</span>
        <select
          className={inputCls}
          value={config.channelId}
          onChange={(e) => update({ channelId: e.target.value })}
        >
          <option value="">选择渠道…</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.baseUrl}
              {c.provider === 'anthropic' ? '（Anthropic 不支持向量）' : ''}
            </option>
          ))}
        </select>
        {!channels.length && (
          <div className="text-[11px] text-muted">还没有渠道。先去 设置 → API · 模型 新增一个，比如硅基流动 https://api.siliconflow.cn/v1</div>
        )}
        <div className="flex items-center gap-2">
          <input
            className={inputCls + ' flex-1'}
            placeholder={`向量模型，默认 ${DEFAULT_EMBED_MODEL}`}
            value={config.model}
            onChange={(e) => update({ model: e.target.value })}
            onBlur={() => {
              if (!config.model.trim()) update({ model: DEFAULT_EMBED_MODEL })
            }}
          />
          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className="glass shrink-0 rounded-xl px-3 py-2 text-xs text-ink disabled:opacity-60"
          >
            {testing ? '测试中…' : '测试'}
          </button>
        </div>
        {testMsg && <div className="text-[11px] text-accent break-all">{testMsg}</div>}
      </div>

      <div className="glass rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="label">索引进度</span>
          <span className="text-[11px] text-muted">
            {progress.running ? '建索引中…' : config.enabled ? '后台自动补' : '未开启'}
          </span>
        </div>
        <div className="text-sm text-ink">
          已建 {progress.indexed} / {progress.total} 段
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/40">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        {progress.error && (
          <div className="text-[11px] text-accent break-all">
            上次失败：{progress.error}
            {progress.backoffUntil ? `（${hhmm(progress.backoffUntil)} 后再自动重试）` : ''}
          </div>
        )}
        <button
          type="button"
          onClick={rebuild}
          disabled={rebuilding || progress.running || !config.enabled || !channel}
          className="glass rounded-xl px-3 py-2 text-xs text-ink disabled:opacity-60"
        >
          {rebuilding ? '清空中…' : '重建索引'}
        </button>
      </div>

      <p className="text-[11px] text-muted leading-relaxed">
        开启后：启动约 1 分钟后、以及每次回复后，在后台把新的聊天、旧日原文、长期记忆和人物近事切成小段做成向量（每批最多 32 段，失败就歇 30 分钟再试，不卡界面）。
        聊天时用她最近 1–2 句话按意思找相近的旧事，和关键词一起排序，原话照旧带日期。向量只存本设备；关掉就和原来完全一样。
      </p>
    </div>
  )
}
