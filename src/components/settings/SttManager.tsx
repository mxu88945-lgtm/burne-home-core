import { useSttStore } from '@/store/sttStore'
import { useSyncStore } from '@/store/syncStore'
import PasswordInput from '@/components/ui/PasswordInput'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

export default function SttManager() {
  const { config, update } = useSttStore()
  const syncWorkerUrl = useSyncStore((s) => s.config.workerUrl)

  return (
    <div className="space-y-3">
      {/* 总开关 */}
      <label className="glass flex items-center justify-between rounded-2xl px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-ink">开启语音输入</span>
          <span className="block text-[11px] text-muted">
            聊天输入框出现 🎤，按一下录音、再按停止转成文字
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
          <span className="label">转写接口配置（只存本地）</span>
          <button
            type="button"
            onClick={() => update({ baseUrl: 'https://api.openai.com/v1' })}
            className="text-[11px] text-accent hover:underline"
          >
            OpenAI 预设
          </button>
        </div>
        <input
          className={inputCls}
          placeholder="接口地址，如 https://api.openai.com/v1"
          value={config.baseUrl}
          onChange={(e) => update({ baseUrl: e.target.value })}
        />
        <PasswordInput
          className={inputCls}
          placeholder="API Key（只存本地，可与聊天用同一把）"
          value={config.apiKey}
          onChange={(e) => update({ apiKey: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder="转写模型，如 whisper-1"
          value={config.model}
          onChange={(e) => update({ model: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder="语言（留空自动识别，中文填 zh）"
          value={config.language}
          onChange={(e) => update({ language: e.target.value })}
        />
        <label className="flex items-center gap-2 pt-1 text-[12px] text-muted">
          <input
            type="checkbox"
            checked={config.autoSend}
            onChange={(e) => update({ autoSend: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          转写完自动发送（不用再点发送，更接近语音对话）
        </label>
      </div>

      {/* Worker 中转 */}
      <div className="glass rounded-2xl p-4 space-y-2">
        <label className="flex items-center gap-2 text-[12px] text-muted">
          <input
            type="checkbox"
            checked={config.viaWorker}
            onChange={(e) => update({ viaWorker: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          经 Worker 中转（推荐，绕过浏览器跨域）
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
              Worker 需有 <code>/stt</code> 端点（代码已在 <code>worker/</code> 里，更新后需重新部署一次）。
            </p>
          </>
        )}
      </div>

      <p className="text-[11px] text-muted leading-relaxed">
        用法：在主聊天输入框点 🎤 开始录音，再点一下停止 → 自动转成文字。
        关「自动发送」时文字会填进输入框你可改了再发；开了就直接发出。Key 只存本设备，不上传、不进仓库。
      </p>
    </div>
  )
}
