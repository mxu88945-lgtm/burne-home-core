import { useTtsStore, VOICE_PRESETS } from '@/store/ttsStore'
import { useSyncStore } from '@/store/syncStore'
import { useTtsPlayback } from '@/lib/useTtsPlayback'

const inputCls =
  'w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

export default function TtsManager() {
  const { config, update } = useTtsStore()
  const syncWorkerUrl = useSyncStore((s) => s.config.workerUrl)
  const { play, playingId, loadingId, error } = useTtsPlayback()

  const presetMatch = VOICE_PRESETS.some((v) => v.id === config.voiceId)
  const tryingId = 'tts-preview'
  const trying = playingId === tryingId || loadingId === tryingId

  return (
    <div className="space-y-3">
      {/* 总开关 */}
      <label className="glass flex items-center justify-between rounded-2xl px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-ink">开启语音朗读</span>
          <span className="block text-[11px] text-muted">
            聊天里 AI 消息旁显示 🔊 播放按钮
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
        <div className="label">MiniMax 海螺配置（只存本地）</div>

        <input
          className={inputCls}
          placeholder="接口地址，默认 https://api.minimax.chat"
          value={config.baseUrl}
          onChange={(e) => update({ baseUrl: e.target.value })}
        />
        <input
          className={inputCls}
          type="password"
          placeholder="API Key（只存本地）"
          value={config.apiKey}
          onChange={(e) => update({ apiKey: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder="GroupId"
          value={config.groupId}
          onChange={(e) => update({ groupId: e.target.value })}
        />
        <input
          className={inputCls}
          placeholder="模型，默认 speech-01-turbo"
          value={config.model}
          onChange={(e) => update({ model: e.target.value })}
        />

        {/* 音色：预设下拉 + 手填 */}
        <select
          className={inputCls}
          value={presetMatch ? config.voiceId : '__custom__'}
          onChange={(e) => {
            if (e.target.value !== '__custom__') update({ voiceId: e.target.value })
          }}
        >
          {VOICE_PRESETS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}（{v.id}）
            </option>
          ))}
          <option value="__custom__">自定义音色 ID…</option>
        </select>
        <input
          className={inputCls}
          placeholder="音色 ID（如 female-tianmei，可填克隆音色）"
          value={config.voiceId}
          onChange={(e) => update({ voiceId: e.target.value })}
        />

        {/* 语速 */}
        <label className="flex items-center gap-3 text-[12px] text-muted">
          <span className="shrink-0">语速 {config.speed.toFixed(1)}×</span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={config.speed}
            onChange={(e) => update({ speed: Number(e.target.value) })}
            className="flex-1 accent-accent"
          />
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
              Worker 需实现 <code>/tts</code> 端点（代码已在 <code>worker/</code> 里备好）。
            </p>
          </>
        )}
      </div>

      {/* 试听 */}
      <button
        onClick={() => play(tryingId, '你好呀，我在这里陪着你哦，么么哒。')}
        className="btn-primary w-full rounded-xl py-2.5 text-sm"
      >
        {loadingId === tryingId
          ? '合成中…'
          : trying
            ? '⏹ 停止试听'
            : '🔊 试听一句'}
      </button>

      {error && <div className="text-[11px] text-red-500">朗读失败：{error}</div>}

      <p className="text-[11px] text-muted leading-relaxed">
        提示：MiniMax 官方接口可能不开浏览器跨域（CORS），直连若失败请勾「经 Worker
        中转」。API Key / GroupId 只保存在本设备浏览器，不会上传或进入仓库。
      </p>
    </div>
  )
}
