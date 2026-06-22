import SubPage from '@/components/settings/SubPage'
import { useReadingStore } from '@/store/readingStore'
import { useApiStore } from '@/store/apiStore'

export default function ReadingPage() {
  const apiChannelId = useReadingStore((s) => s.apiChannelId)
  const setApiChannelId = useReadingStore((s) => s.setApiChannelId)
  const summaryEvery = useReadingStore((s) => s.summaryEvery)
  const setSummaryEvery = useReadingStore((s) => s.setSummaryEvery)
  const autoSummary = useReadingStore((s) => s.autoSummary)
  const toggleAutoSummary = useReadingStore((s) => s.toggleAutoSummary)
  const autoComment = useReadingStore((s) => s.autoComment)
  const toggleAutoComment = useReadingStore((s) => s.toggleAutoComment)
  const channels = useApiStore((s) => s.channels)

  return (
    <SubPage title="读书 📖">
      <div className="glass space-y-2 rounded-2xl p-4">
        <div className="label">独立模型</div>
        <p className="text-[11px] text-muted">
          读书讨论用的模型，独立于主聊天。选「跟随主聊天」就用主页激活的渠道。
        </p>
        <select
          value={apiChannelId}
          onChange={(e) => setApiChannelId(e.target.value)}
          className="w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">跟随主聊天</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.model || '未命名渠道'}
            </option>
          ))}
        </select>
      </div>

      <div className="glass rounded-2xl p-4">
        <label className="flex items-center justify-between">
          <span className="text-sm text-ink">
            主动跟读
            <span className="block text-[11px] text-muted">翻到新页 TA 主动冒出对这页的看法</span>
          </span>
          <input
            type="checkbox"
            checked={autoComment}
            onChange={toggleAutoComment}
            className="h-5 w-5 accent-accent"
          />
        </label>
      </div>

      <div className="glass space-y-3 rounded-2xl p-4">
        <label className="flex items-center justify-between">
          <span className="text-sm text-ink">
            自动剧情摘要
            <span className="block text-[11px] text-muted">读够设定页数自动总结剧情+你俩的预测，TA 不失忆</span>
          </span>
          <input
            type="checkbox"
            checked={autoSummary}
            onChange={toggleAutoSummary}
            className="h-5 w-5 accent-accent"
          />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink">每多少页总结一次</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSummaryEvery(summaryEvery - 1)}
              className="glass flex h-8 w-8 items-center justify-center rounded-full text-ink"
            >
              −
            </button>
            <span className="w-12 text-center text-sm text-ink">{summaryEvery} 页</span>
            <button
              onClick={() => setSummaryEvery(summaryEvery + 1)}
              className="glass flex h-8 w-8 items-center justify-center rounded-full text-ink"
            >
              ＋
            </button>
          </div>
        </div>
      </div>

      <p className="pb-2 text-center text-[11px] text-muted">改动即时保存到本地 ♡</p>
    </SubPage>
  )
}
