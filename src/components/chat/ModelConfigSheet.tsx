import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApiStore } from '@/store/apiStore'
import { usePersonaStore } from '@/store/personaStore'
import { useSyncStore } from '@/store/syncStore'
import { listModels } from '@/api/llm'

/** 每条渠道拉过的模型列表缓存在内存里，反复打开面板不重复请求。 */
const modelCache: Record<string, string[]> = {}

type Effort = 'off' | 'low' | 'medium' | 'high'
const EFFORT_LABEL: Record<Effort, string> = { off: '关闭', low: '低', medium: '自动', high: '高' }

/**
 * 聊天输入框模型胶囊点开的「配置」底部面板（仿顾祁砚）：
 * 渠道 / 模型 / 思考强度 / 显示名称 / 重置 / 完成。
 * 不用 backdrop-filter：iOS 上整屏模糊层会拖慢合成（见 .drawer-panel 注释）。
 */
export default function ModelConfigSheet({ onClose }: { onClose: () => void }) {
  const { channels, activeId, setActive, updateChannel } = useApiStore()
  const channel = channels.find((c) => c.id === activeId) ?? channels[0]
  const { persona, setPersona } = usePersonaStore()
  const workerUrl = useSyncStore((s) => s.config.workerUrl)
  const syncKey = useSyncStore((s) => s.config.syncKey)

  const [models, setModels] = useState<string[]>(channel ? modelCache[channel.id] || [] : [])
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [manual, setManual] = useState(false)

  useEffect(() => {
    if (!channel) return
    setManual(false)
    setLoadErr('')
    const cached = modelCache[channel.id]
    if (cached) {
      setModels(cached)
      return
    }
    let alive = true
    setModels([])
    setLoading(true)
    listModels(channel, { workerUrl, syncKey })
      .then((list) => {
        const sorted = [...new Set(list)].sort((a, b) => a.localeCompare(b))
        modelCache[channel.id] = sorted
        if (alive) setModels(sorted)
      })
      .catch((e) => alive && setLoadErr((e as Error).message || '获取失败'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // 只在换渠道时重新拉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id])

  const effort: Effort = persona.reasoning ? persona.reasoningEffort || 'medium' : 'off'
  function setEffort(v: Effort) {
    if (v === 'off') setPersona({ reasoning: false })
    else setPersona({ reasoning: true, reasoningEffort: v })
  }

  const options = channel?.model && !models.includes(channel.model) ? [channel.model, ...models] : models
  const showInput = manual || (!loading && options.length === 0)

  const rowCls = 'flex min-h-[52px] items-center justify-between gap-3 px-4 py-2.5'
  const selectCls =
    'max-w-[60vw] appearance-none truncate bg-transparent pr-5 text-right text-[15px] text-ink outline-none'

  // 挂到 App 外壳上：外壳带 transform 且高度随键盘收缩，面板就始终贴在键盘上沿；
  // 留在输入框里会被它的层叠/模糊上下文困住。
  const host = document.getElementById('bw-app-shell') || document.body
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-label="配置">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative mx-2 mb-[max(0.5rem,env(safe-area-inset-bottom))] rounded-[28px] px-4 pb-4 pt-2 shadow-2xl"
        style={{
          background: 'linear-gradient(var(--card-strong), var(--card-strong)), var(--bg-to)',
          border: '1px solid var(--card-border)',
        }}
      >
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-black/15" />
        <div className="mb-3 text-center text-[17px] font-semibold text-ink">配置</div>

        {!channel ? (
          <div className="rounded-2xl px-4 py-6 text-center text-sm text-muted" style={{ background: 'var(--card)' }}>
            还没有 API 渠道，先去 设置 → API 添加一条。
          </div>
        ) : (
          <div
            className="divide-y overflow-hidden rounded-2xl"
            style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderColor: 'var(--card-border)' }}
          >
            {channels.length > 1 && (
              <label className={rowCls}>
                <span className="shrink-0 text-[15px] text-ink">渠道</span>
                <span className="relative flex min-w-0 items-center">
                  <select className={selectCls} value={channel.id} onChange={(e) => setActive(e.target.value)}>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.provider}
                      </option>
                    ))}
                  </select>
                  <Chevron />
                </span>
              </label>
            )}

            <div className={rowCls}>
              <span className="shrink-0 text-[15px] text-ink">模型</span>
              {showInput ? (
                <input
                  className="min-w-0 flex-1 bg-transparent text-right text-[15px] text-ink outline-none placeholder:text-muted"
                  value={channel.model}
                  placeholder={loadErr ? '列表获取失败，手动填写' : '填写模型名'}
                  onChange={(e) => updateChannel(channel.id, { model: e.target.value.trim() })}
                />
              ) : loading ? (
                <span className="text-[13px] text-muted">获取模型中…</span>
              ) : (
                <span className="relative flex min-w-0 items-center">
                  <select
                    className={selectCls}
                    value={channel.model}
                    onChange={(e) => {
                      if (e.target.value === '__manual') setManual(true)
                      else updateChannel(channel.id, { model: e.target.value })
                    }}
                  >
                    {options.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    <option value="__manual">手动填写…</option>
                  </select>
                  <Chevron />
                </span>
              )}
            </div>

            <label className={rowCls}>
              <span className="shrink-0 text-[15px] text-ink">思考强度</span>
              <span className="relative flex items-center">
                <select className={selectCls} value={effort} onChange={(e) => setEffort(e.target.value as Effort)}>
                  {(Object.keys(EFFORT_LABEL) as Effort[]).map((k) => (
                    <option key={k} value={k}>
                      {EFFORT_LABEL[k]}
                    </option>
                  ))}
                </select>
                <Chevron />
              </span>
            </label>

            <label className={rowCls}>
              <span className="shrink-0 text-[15px] text-ink">显示名称</span>
              <input
                className="min-w-0 flex-1 bg-transparent text-right text-[15px] text-ink outline-none placeholder:text-muted"
                value={channel.displayName || ''}
                placeholder={channel.model || '模型名'}
                onChange={(e) => updateChannel(channel.id, { displayName: e.target.value })}
              />
            </label>
          </div>
        )}

        {channel && (
          <button
            type="button"
            className="mt-3 w-full rounded-2xl py-3.5 text-[15px] font-medium text-accent"
            style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}
            onClick={() => {
              updateChannel(channel.id, { displayName: '' })
              setPersona({ reasoning: false, reasoningEffort: 'medium' })
              setManual(false)
            }}
          >
            重置为默认设置
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-2xl py-3.5 text-[15px] font-medium text-white shadow"
          style={{ background: '#2a2a2a' }}
        >
          完成
        </button>
      </div>
    </div>,
    host,
  )
}

function Chevron() {
  return (
    <svg
      className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-ink"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 6l3-3 3 3M5 10l3 3 3-3" />
    </svg>
  )
}
