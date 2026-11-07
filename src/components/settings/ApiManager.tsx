import { useState } from 'react'
import { useApiStore, type ApiProvider, type ApiChannel } from '@/store/apiStore'
import { useSyncStore } from '@/store/syncStore'
import { listModels } from '@/api/llm'
import PasswordInput from '@/components/ui/PasswordInput'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

export default function ApiManager() {
  const { channels, activeId, addChannel, updateChannel, removeChannel, setActive } =
    useApiStore()
  const workerUrl = useSyncStore((s) => s.config.workerUrl)
  const syncKey = useSyncStore((s) => s.config.syncKey)

  const [name, setName] = useState('')
  const [provider, setProvider] = useState<ApiProvider>('openai')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [viaWorker, setViaWorker] = useState(false)
  const [msg, setMsg] = useState('')
  // 各渠道自己的提示（拉取失败/已确认等），显示在那张渠道卡片里，不用滚回顶上看
  const [chMsg, setChMsg] = useState<Record<string, string>>({})
  const sayCh = (id: string, text: string) => setChMsg((m) => ({ ...m, [id]: text }))
  const [models, setModels] = useState<Record<string, string[]>>({})
  const [pending, setPending] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string>('')
  const [addModels, setAddModels] = useState<string[]>([])
  const [addBusy, setAddBusy] = useState(false)
  const [manual, setManual] = useState<Record<string, string>>({}) // 每条渠道的手填模型名
  // 整块折叠：渠道多时把整个列表收成一行，点标题收/展全部
  const [listOpen, setListOpen] = useState(false)
  const activeCh = channels.find((c) => c.id === activeId)
  // 编辑已有渠道（名称 / 格式 / base URL / key / 中转），照顾祁砚的渠道管理
  const [editId, setEditId] = useState('')
  const [draft, setDraft] = useState<Partial<ApiChannel>>({})

  function startEdit(c: ApiChannel) {
    setEditId(c.id)
    setDraft({ name: c.name, provider: c.provider, baseUrl: c.baseUrl, apiKey: c.apiKey, viaWorker: !!c.viaWorker })
  }
  function saveEdit() {
    if (!editId) return
    if (!draft.baseUrl?.trim() || !draft.apiKey?.trim()) {
      sayCh(editId, 'base URL 和 key 不能空')
      return
    }
    updateChannel(editId, {
      name: draft.name?.trim() || draft.provider || 'openai',
      provider: draft.provider ?? 'openai',
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim(),
      viaWorker: !!draft.viaWorker,
    })
    setModels((m) => ({ ...m, [editId]: [] }))
    sayCh(editId, '渠道已保存')
    setEditId('')
  }
  function copyChannel(c: ApiChannel) {
    const { id: _id, ...rest } = c
    void _id
    const copy = addChannel({ ...rest, name: `${c.name} 副本` })
    startEdit(copy)
    sayCh(copy.id, '已拷贝一份，改好点保存')
  }
  function remove(c: ApiChannel) {
    if (!window.confirm(`删除渠道「${c.name}」？`)) return
    if (editId === c.id) setEditId('')
    removeChannel(c.id)
  }

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
    setAddModels([])
    setMsg('已添加渠道（key 只存本地）')
  }

  async function fetchAddModels() {
    if (!baseUrl.trim() || !apiKey.trim()) {
      setMsg('先填 base URL 和 key 再获取模型')
      return
    }
    setAddBusy(true)
    setMsg('')
    try {
      const list = await listModels(
        {
          id: '_new',
          name: name || provider,
          provider,
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
          viaWorker,
        },
        { workerUrl, syncKey },
      )
      setAddModels(list)
      if (!model && list[0]) setModel(list[0])
      setMsg(`拉到 ${list.length} 个模型，选一个`)
    } catch (e) {
      setMsg(`拉取模型失败：${(e as Error).message}`)
    } finally {
      setAddBusy(false)
    }
  }

  async function fetchModels(id: string) {
    const ch = channels.find((c) => c.id === id)
    if (!ch) return
    setBusy(id)
    sayCh(id, '')
    try {
      const list = await listModels(ch, { workerUrl, syncKey })
      setModels((m) => ({ ...m, [id]: list }))
      setPending((p) => ({ ...p, [id]: ch.model || list[0] || '' }))
      sayCh(id, `拉到 ${list.length} 个模型，选一个点「确认模型」`)
    } catch (e) {
      sayCh(id, `拉取模型失败：${(e as Error).message}`)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-3">

      {/* 已有渠道：整块折叠（点标题收/展全部，渠道多时更清爽） */}
      {channels.length === 0 ? (
        <p className="text-[11px] text-muted">还没有渠道，下面加一条吧～</p>
      ) : (
        <div className="rounded-2xl border border-line/60">
          <button
            type="button"
            onClick={() => setListOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-3 text-left"
          >
            <span className="min-w-0 text-sm text-ink">
              已有渠道 <span className="text-muted">（{channels.length}）</span>
              {activeCh && (
                <span className="ml-1 block truncate text-[11px] text-muted">
                  当前 · {activeCh.name}：{activeCh.model || '未设置'}
                </span>
              )}
            </span>
            <span className="shrink-0 text-sm text-muted">{listOpen ? '收起 ⌃' : '展开 ⌄'}</span>
          </button>

          {listOpen && (
            <div className="space-y-2 p-2 pt-0">
              {channels.map((c) => {
                const active = c.id === activeId
                return (
                  <div
                    key={c.id}
                    className="rounded-2xl border p-3"
                    style={{ borderColor: active ? 'var(--accent)' : 'var(--card-border)' }}
                  >
                    <div className="flex items-center gap-2">
                      <button onClick={() => setActive(c.id)} className="min-w-0 flex-1 text-left">
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
                        onClick={() => (editId === c.id ? setEditId('') : startEdit(c))}
                        className="text-[11px] text-accent"
                      >
                        {editId === c.id ? '收起' : '编辑'}
                      </button>
                      <button onClick={() => copyChannel(c)} className="text-[11px] text-muted hover:text-accent">
                        拷贝
                      </button>
                      <button onClick={() => remove(c)} className="text-[11px] text-muted hover:text-accent">
                        删除
                      </button>
                    </div>

                    {editId === c.id && (
                      <div className="mt-2 space-y-2 rounded-xl border border-line/60 p-2">
                        <input
                          className={inputCls}
                          placeholder="名称"
                          value={draft.name ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        />
                        <select
                          className={inputCls}
                          value={draft.provider ?? 'openai'}
                          onChange={(e) => setDraft((d) => ({ ...d, provider: e.target.value as ApiProvider }))}
                        >
                          <option value="openai">OpenAI 兼容（含 OpenRouter）</option>
                          <option value="anthropic">Anthropic 官方</option>
                        </select>
                        <input
                          className={inputCls}
                          placeholder="base URL"
                          value={draft.baseUrl ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                        />
                        <PasswordInput
                          className={inputCls}
                          placeholder="API key（只存本地）"
                          value={draft.apiKey ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                        />
                        <label className="flex items-center gap-2 text-[11px] text-muted">
                          <input
                            type="checkbox"
                            checked={!!draft.viaWorker}
                            onChange={(e) => setDraft((d) => ({ ...d, viaWorker: e.target.checked }))}
                            className="h-4 w-4 accent-accent"
                          />
                          经 Worker 中转
                        </label>
                        <div className="flex gap-2">
                          <button onClick={() => setEditId('')} className="glass flex-1 rounded-xl py-2 text-xs text-ink">
                            取消
                          </button>
                          <button onClick={saveEdit} className="btn-primary flex-1 rounded-xl py-2 text-xs">
                            保存
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-2 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted">
                          当前模型：<span className="text-ink">{c.model || '未设置'}</span>
                        </span>
                        <button
                          onClick={() => fetchModels(c.id)}
                          disabled={busy === c.id}
                          className="glass rounded-lg px-3 py-1.5 text-ink disabled:opacity-60"
                        >
                          {busy === c.id ? '拉取中…' : '获取模型'}
                        </button>
                      </div>
                      {chMsg[c.id] && (
                        <div className={`text-[11px] ${chMsg[c.id].includes('失败') || chMsg[c.id].includes('不能空') ? 'text-red-500' : 'text-accent'}`}>
                          {chMsg[c.id]}
                        </div>
                      )}

                      {/* 手填模型（拉不到模型的渠道也能直接改，不用删了重建） */}
                      <div className="flex items-center gap-2">
                        <input
                          className={inputCls + ' flex-1'}
                          placeholder="或手填模型名，如 gpt-4o-mini"
                          value={manual[c.id] ?? ''}
                          onChange={(e) => setManual((m) => ({ ...m, [c.id]: e.target.value }))}
                        />
                        <button
                          onClick={() => {
                            const v = (manual[c.id] ?? '').trim()
                            if (!v) return
                            updateChannel(c.id, { model: v })
                            setManual((m) => ({ ...m, [c.id]: '' }))
                            sayCh(c.id, `已确认模型：${v}`)
                          }}
                          disabled={!(manual[c.id] ?? '').trim()}
                          className="btn-primary shrink-0 rounded-xl px-4 py-2 text-xs disabled:opacity-50"
                        >
                          确认
                        </button>
                      </div>

                      {models[c.id] && models[c.id].length > 0 && (
                        <div className="flex items-center gap-2">
                          <select
                            value={pending[c.id] ?? c.model}
                            onChange={(e) => setPending((p) => ({ ...p, [c.id]: e.target.value }))}
                            className={inputCls + ' flex-1'}
                          >
                            {models[c.id].map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => {
                              const sel = pending[c.id] ?? c.model
                              updateChannel(c.id, { model: sel })
                              sayCh(c.id, `已确认模型：${sel}`)
                            }}
                            disabled={(pending[c.id] ?? c.model) === c.model}
                            className="btn-primary shrink-0 rounded-xl px-4 py-2 text-xs disabled:opacity-50"
                          >
                            确认模型
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 新增渠道 */}
      <div className="rounded-2xl border border-dashed border-line p-3">
        {msg && <div className={`mb-2 text-[11px] ${msg.includes('失败') ? 'text-red-500' : 'text-accent'}`}>{msg}</div>}
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
          <PasswordInput
            className={inputCls}
            placeholder="API key（只存本地）"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <input
              className={inputCls + ' flex-1'}
              placeholder="模型，如 openai/gpt-4o-mini"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <button
              onClick={fetchAddModels}
              disabled={addBusy}
              className="glass shrink-0 rounded-xl px-3 py-2 text-xs text-ink disabled:opacity-60"
            >
              {addBusy ? '获取中…' : '获取模型'}
            </button>
          </div>
          {addModels.length > 0 && (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={inputCls}
            >
              {addModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
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
