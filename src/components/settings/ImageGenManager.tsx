import { useState } from 'react'
import { useImageGenStore } from '@/store/imageGenStore'
import { useSyncStore } from '@/store/syncStore'
import { generateImage, listImageModels } from '@/api/imagegen'
import PasswordInput from '@/components/ui/PasswordInput'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

export default function ImageGenManager() {
  const { channels, activeId, addChannel, updateChannel, removeChannel, setActive, getActive } =
    useImageGenStore()
  const syncWorkerUrl = useSyncStore((s) => s.config.workerUrl)
  const syncKey = useSyncStore((s) => s.config.syncKey)
  const active = getActive()

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [preview, setPreview] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)

  async function fetchModels() {
    if (!active) return
    setFetching(true)
    setMsg('')
    try {
      const list = await listImageModels(active)
      setModels(list)
      if (!active.model && list[0]) updateChannel(active.id, { model: list[0] })
      setMsg(active.mode === 'chat' ? `拉到 ${list.length} 个可出图模型，选一个` : `拉到 ${list.length} 个模型`)
    } catch (e) {
      setMsg(`获取模型失败：${(e as Error).message}`)
    } finally {
      setFetching(false)
    }
  }

  async function test() {
    if (!active) return
    setBusy(true)
    setMsg('')
    setPreview('')
    try {
      const cfg = { ...active, workerUrl: active.workerUrl.trim() || (syncWorkerUrl || '').trim() }
      const img = await generateImage(cfg, '一只可爱的小猫，水彩风', { syncKey })
      setPreview(img)
      setMsg('生成成功！')
    } catch (e) {
      setMsg(`生成失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {msg && <div className="text-[11px] text-accent">{msg}</div>}

      {/* 渠道列表 */}
      {channels.length === 0 ? (
        <p className="text-[11px] text-muted">还没有画图渠道，下面加一个吧～</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {channels.map((c) => {
            const on = c.id === activeId
            return (
              <button
                key={c.id}
                onClick={() => {
                  setActive(c.id)
                  setModels([])
                  setPreview('')
                  setMsg('')
                }}
                className={[
                  'rounded-full px-3 py-1.5 text-[12px]',
                  on ? 'btn-primary' : 'glass text-ink',
                ].join(' ')}
              >
                {on ? '● ' : '○ '}
                {c.name || c.mode}
              </button>
            )
          })}
        </div>
      )}

      <button
        onClick={() => {
          addChannel()
          setModels([])
          setPreview('')
        }}
        className="glass w-full rounded-xl py-2 text-sm text-ink"
      >
        ＋ 新增画图渠道
      </button>

      {/* 当前渠道编辑 */}
      {active && (
        <>
          <div className="glass rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="label">渠道设置（只存本地）</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateChannel(active.id, {
                      name: 'OpenRouter',
                      mode: 'chat',
                      baseUrl: 'https://openrouter.ai/api/v1',
                      model: 'google/gemini-2.5-flash-image-preview',
                    })
                  }
                  className="text-[11px] text-accent hover:underline"
                >
                  OpenRouter 预设
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`删除渠道「${active.name}」？`)) removeChannel(active.id)
                  }}
                  className="text-[11px] text-muted hover:text-accent"
                >
                  删除
                </button>
              </div>
            </div>

            <input
              className={inputCls}
              placeholder="渠道名称，如 OpenRouter / OpenAI"
              value={active.name}
              onChange={(e) => updateChannel(active.id, { name: e.target.value })}
            />
            <select
              className={inputCls}
              value={active.mode}
              onChange={(e) => updateChannel(active.id, { mode: e.target.value as 'images' | 'chat' })}
            >
              <option value="images">images 接口（DALL·E / OpenAI 兼容）</option>
              <option value="chat">Chat 接口出图（OpenRouter / Gemini）</option>
            </select>
            <input
              className={inputCls}
              placeholder={
                active.mode === 'chat'
                  ? '接口地址，如 https://openrouter.ai/api/v1'
                  : '接口地址，默认 https://api.openai.com/v1'
              }
              value={active.baseUrl}
              onChange={(e) => updateChannel(active.id, { baseUrl: e.target.value })}
            />
            <PasswordInput
              className={inputCls}
              placeholder="API Key（只存本地）"
              value={active.apiKey}
              onChange={(e) => updateChannel(active.id, { apiKey: e.target.value })}
            />
            <div className="flex items-center gap-2">
              <input
                className={inputCls + ' flex-1'}
                placeholder={
                  active.mode === 'chat'
                    ? '模型，如 google/gemini-2.5-flash-image-preview'
                    : '模型，如 dall-e-3 / gpt-image-1'
                }
                value={active.model}
                onChange={(e) => updateChannel(active.id, { model: e.target.value })}
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
                value={active.model}
                onChange={(e) => updateChannel(active.id, { model: e.target.value })}
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            {active.mode === 'images' && (
              <input
                className={inputCls}
                placeholder="尺寸，如 1024x1024"
                value={active.size}
                onChange={(e) => updateChannel(active.id, { size: e.target.value })}
              />
            )}
          </div>

          <div className="glass rounded-2xl p-4 space-y-2">
            <label className="flex items-center gap-2 text-[12px] text-muted">
              <input
                type="checkbox"
                checked={active.viaWorker}
                onChange={(e) => updateChannel(active.id, { viaWorker: e.target.checked })}
                className="h-4 w-4 accent-accent"
              />
              经 Worker 中转（直连报跨域错误时勾选）
            </label>
            {active.viaWorker && (
              <input
                className={inputCls}
                placeholder={
                  syncWorkerUrl
                    ? `Worker 地址（留空复用同步地址 ${syncWorkerUrl}）`
                    : 'Worker 地址，如 https://xxx.workers.dev'
                }
                value={active.workerUrl}
                onChange={(e) => updateChannel(active.id, { workerUrl: e.target.value })}
              />
            )}
          </div>

          <button onClick={test} disabled={busy} className="btn-primary w-full rounded-xl py-2.5 text-sm">
            {busy ? '生成中…' : '🎨 测试生成一张'}
          </button>
          {preview && <img src={preview} alt="预览" className="w-full rounded-2xl" />}
        </>
      )}

      <p className="text-[11px] text-muted leading-relaxed">
        提示：OpenRouter 没有 images 接口，请用「Chat 接口出图」+ 出图模型（点「获取模型」选）。
        多数服务不开浏览器跨域，直连失败就勾「经 Worker 中转」。Key 只存本设备，不会上传或进仓库。
      </p>
    </div>
  )
}
