import { useState } from 'react'
import { useImageGenStore } from '@/store/imageGenStore'
import { useSyncStore } from '@/store/syncStore'
import { generateImage } from '@/api/imagegen'
import PasswordInput from '@/components/ui/PasswordInput'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

export default function ImageGenManager() {
  const { config, update } = useImageGenStore()
  const syncWorkerUrl = useSyncStore((s) => s.config.workerUrl)
  const syncKey = useSyncStore((s) => s.config.syncKey)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [preview, setPreview] = useState('')

  async function test() {
    setBusy(true)
    setMsg('')
    setPreview('')
    try {
      const cfg = { ...config, workerUrl: config.workerUrl.trim() || (syncWorkerUrl || '').trim() }
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

      <div className="glass rounded-2xl p-4 space-y-2">
        <div className="label">文生图配置（OpenAI 兼容，只存本地）</div>
        <input
          className={inputCls}
          placeholder="接口地址，默认 https://api.openai.com/v1"
          value={config.baseUrl}
          onChange={(e) => update({ baseUrl: e.target.value })}
        />
        <PasswordInput
          className={inputCls}
          placeholder="API Key（只存本地）"
          value={config.apiKey}
          onChange={(e) => update({ apiKey: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder="模型，如 dall-e-3 / gpt-image-1"
          value={config.model}
          onChange={(e) => update({ model: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder="尺寸，如 1024x1024"
          value={config.size}
          onChange={(e) => update({ size: e.target.value })}
        />
      </div>

      <div className="glass rounded-2xl p-4 space-y-2">
        <label className="flex items-center gap-2 text-[12px] text-muted">
          <input
            type="checkbox"
            checked={config.viaWorker}
            onChange={(e) => update({ viaWorker: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          经 Worker 中转（直连报跨域错误时勾选）
        </label>
        {config.viaWorker && (
          <>
            <input
              className={inputCls}
              placeholder={
                syncWorkerUrl
                  ? `Worker 地址（留空复用同步地址 ${syncWorkerUrl}）`
                  : 'Worker 地址，如 https://xxx.workers.dev'
              }
              value={config.workerUrl}
              onChange={(e) => update({ workerUrl: e.target.value })}
            />
            <p className="text-[11px] text-muted">
              Worker 需实现 <code>/image</code> 端点（代码已在 <code>worker/</code> 里备好）。
            </p>
          </>
        )}
      </div>

      <button onClick={test} disabled={busy} className="btn-primary w-full rounded-xl py-2.5 text-sm">
        {busy ? '生成中…' : '🎨 测试生成一张'}
      </button>

      {preview && <img src={preview} alt="预览" className="w-full rounded-2xl" />}

      <p className="text-[11px] text-muted leading-relaxed">
        提示：多数文生图服务不开浏览器跨域（CORS），直连若失败请勾「经 Worker 中转」。
        API Key 只保存在本设备浏览器，不会上传或进入仓库。
      </p>
    </div>
  )
}
