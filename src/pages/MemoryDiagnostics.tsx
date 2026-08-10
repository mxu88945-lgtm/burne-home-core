import { Link } from 'react-router-dom'
import { useMemoryStore } from '@/store/memoryStore'
import { memoryLayerLabel } from '@/lib/memoryRecall'
import BackBar from '@/components/layout/BackBar'

function formatAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
}

export default function MemoryDiagnostics() {
  const diagnostics = useMemoryStore((s) => s.diagnostics)
  const clear = useMemoryStore((s) => s.clearDiagnostics)
  const latest = diagnostics[0]

  return (
    <div className="space-y-4">
      <BackBar />
      <div className="flex items-end justify-between px-1">
        <div>
          <h2 className="headline text-2xl text-ink">记忆诊断</h2>
          <p className="mt-1 text-xs text-muted">只记录每轮用了哪些记忆及原因，不保存对话正文。</p>
        </div>
        <button onClick={clear} disabled={!diagnostics.length} className="text-xs text-muted disabled:opacity-40">
          清空记录
        </button>
      </div>

      <div className="glass rounded-2xl p-4 text-sm text-ink">
        <div className="flex items-center justify-between">
          <span className="label">召回原则</span>
          <Link to="/memories" className="text-xs text-accent">去编辑记忆</Link>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">
          角色核心优先；长期记忆和近期状态按当前消息相关性召回；过期、被取代、范围不符的条目不会注入。
        </p>
      </div>

      {!diagnostics.length ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted">还没有诊断记录。发一条消息后，这里会显示本轮召回。</div>
      ) : (
        <div className="space-y-3">
          {diagnostics.map((diagnostic) => (
            <section key={diagnostic.id} className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{formatAt(diagnostic.at)} · {diagnostic.scope}</span>
                <span>{diagnostic.totalChars} 字符</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-ink">当前消息：{diagnostic.queryPreview || '（无文字查询）'}</p>
              {diagnostic.used.length ? (
                <div className="mt-3 space-y-2">
                  <div className="label text-xs">本轮已使用 · {diagnostic.used.length} 条</div>
                  {diagnostic.used.map((item) => (
                    <div key={`${diagnostic.id}-${item.id}`} className="rounded-xl border border-line bg-white/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-2 text-xs text-ink">
                        <span className="truncate">{item.title}</span>
                        <span className="shrink-0 text-muted">{memoryLayerLabel(item.layer)} · {item.score}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted">{item.reason} · {item.chars} 字符</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">本轮没有注入具体记忆。</p>
              )}
              {diagnostic.skipped.length > 0 && (
                <details className="mt-3 text-xs text-muted">
                  <summary className="cursor-pointer">未使用 {diagnostic.skipped.length} 条（点击查看原因）</summary>
                  <div className="mt-2 space-y-1">
                    {diagnostic.skipped.slice(0, 12).map((item) => (
                      <div key={`${diagnostic.id}-skip-${item.id}`} className="flex justify-between gap-2">
                        <span className="truncate">{item.title}</span>
                        <span className="shrink-0">{item.reason}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          ))}
        </div>
      )}

      {latest && <p className="px-1 text-[11px] text-muted">最多保留最近 40 轮诊断；原始聊天和记忆正文不受影响。</p>}
    </div>
  )
}
