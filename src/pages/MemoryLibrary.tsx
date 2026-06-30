import { useMemo, useState } from 'react'
import type { MemoryItem } from '@/types/memory'
import { useMemoryStore } from '@/store/memoryStore'
import { useApiStore, type ApiChannel } from '@/store/apiStore'
import { useMemoryModelStore } from '@/store/memoryModelStore'
import { useSyncStore } from '@/store/syncStore'
import { chatComplete } from '@/api/llm'
import { sendChat } from '@/api/chat'
import MemoryCard from '@/components/memory/MemoryCard'
import MemoryEditor from '@/components/memory/MemoryEditor'
import BackBar from '@/components/layout/BackBar'
import {
  KIND_FILTERS,
  type KindFilter,
  kindLabel,
  matchKind,
  matchKeyword,
  sortForDisplay,
} from '@/lib/memory'

export default function MemoryLibrary() {
  const memories = useMemoryStore((s) => s.memories)
  const toggleStar = useMemoryStore((s) => s.toggleStar)
  const replaceAll = useMemoryStore((s) => s.replaceAll)
  const overview = useMemoryStore((s) => s.overview)
  const setOverview = useMemoryStore((s) => s.setOverview)
  const summary = useMemoryStore((s) => s.getSummary())
  const activeChannel = useApiStore((s) => s.getActive())
  const memModelCfg = useMemoryModelStore((s) => s.config)
  // 开了「记忆模型」就用它独立渠道生成概述，否则用主聊天渠道
  const memChannel: ApiChannel | undefined =
    memModelCfg.enabled && memModelCfg.apiKey.trim() && memModelCfg.model.trim()
      ? {
          id: 'memory',
          name: '记忆',
          provider: 'openai',
          baseUrl: memModelCfg.baseUrl,
          apiKey: memModelCfg.apiKey,
          model: memModelCfg.model,
        }
      : activeChannel
  const sync = useSyncStore((s) => s.config)

  const [kind, setKind] = useState<KindFilter>('all')
  const [kw, setKw] = useState('')
  const [editing, setEditing] = useState<MemoryItem | 'new' | null>(null)
  const [genBusy, setGenBusy] = useState(false)
  const [editOverview, setEditOverview] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [delMenu, setDelMenu] = useState(false)
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState('')

  const list = useMemo(
    () =>
      sortForDisplay(
        memories.filter((m) => matchKind(m, kind) && matchKeyword(m, kw))
      ),
    [memories, kind, kw]
  )

  async function generateOverview() {
    if (genBusy) return
    if (memories.length === 0) {
      setErr('还没有记忆可以概述')
      return
    }
    const workerUrl = sync.workerUrl?.trim()
    if (!memChannel && !workerUrl) {
      setErr('请先在「设置 → API / 模型」或「记忆模型」配置渠道')
      return
    }
    setErr('')
    setGenBusy(true)
    try {
      const transcript = memories
        .map((m) => `- [${kindLabel(m.kind)}]${m.title ? ` ${m.title}：` : ''}${m.content}`)
        .join('\n')
      const sys = '你是记忆摘要助手，只输出摘要正文，不要寒暄。'
      const ask = `请把下面这些记忆概括成一段简洁、温柔的「记忆总览」（200字以内），点出主要主题、重要的人和事、以及情感脉络：\n\n${transcript}`
      let text = ''
      if (memChannel) {
        text = (
          await chatComplete(memChannel, [{ role: 'user', content: ask }], sys, {
            workerUrl,
            syncKey: sync.syncKey,
            maxTokens: 800,
          })
        ).text.trim()
      } else {
        text = (
          await sendChat({
            workerUrl: workerUrl!,
            syncKey: sync.syncKey,
            messages: [{ role: 'user', content: ask }],
            system: sys,
            maxTokens: 800,
          })
        ).trim()
      }
      if (!text) throw new Error('摘要为空')
      setOverview(text)
      setSummaryOpen(true)
    } catch (e) {
      setErr(`生成失败：${(e as Error).message}`)
    } finally {
      setGenBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <BackBar />
      <div className="flex items-end justify-between px-1">
        <div>
          <h2 className="headline text-2xl text-ink">记忆库</h2>
          <p className="mt-1 text-xs text-muted">
            共 {summary.total} 条 · 长期 {summary.longCount} · 短期 {summary.shortCount}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {summary.total > 0 && (
            <div className="relative">
              <button
                onClick={() => setDelMenu((o) => !o)}
                className="text-[12px] text-muted hover:text-red-500"
              >
                🗑 删除
              </button>
              {delMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDelMenu(false)} />
                  <div className="glass-strong absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-2xl p-1 text-left text-[13px] text-ink shadow-lg">
                    {(() => {
                      const starred = memories.filter((m) => m.starred).length
                      const unstarred = summary.total - starred
                      const run = (tip: string, keep: (m: MemoryItem) => boolean) => {
                        setDelMenu(false)
                        if (window.confirm(`${tip}\n不可恢复，建议先去「设置 → 数据·备份」导出。`))
                          replaceAll(memories.filter(keep))
                      }
                      const Row = ({ label, onClick }: { label: string; onClick: () => void }) => (
                        <button
                          onClick={onClick}
                          className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/40"
                        >
                          {label}
                        </button>
                      )
                      return (
                        <>
                          {unstarred > 0 && (
                            <Row
                              label={`删未标星（留 ${starred} 条★）`}
                              onClick={() => run(`删除 ${unstarred} 条未标星记忆？保留 ${starred} 条标星★。`, (m) => m.starred)}
                            />
                          )}
                          {summary.shortCount > 0 && (
                            <Row
                              label={`删短期（${summary.shortCount} 条）`}
                              onClick={() => run(`删除 ${summary.shortCount} 条短期记忆？`, (m) => m.kind !== 'short')}
                            />
                          )}
                          {summary.longCount > 0 && (
                            <Row
                              label={`删长期（${summary.longCount} 条）`}
                              onClick={() => run(`删除 ${summary.longCount} 条长期记忆？`, (m) => m.kind !== 'long')}
                            />
                          )}
                          <Row
                            label={`🗑 清空全部（${summary.total} 条）`}
                            onClick={() => run(`确定清空全部 ${summary.total} 条记忆吗？${starred ? `含 ${starred} 条标星★。` : ''}`, () => false)}
                          />
                        </>
                      )
                    })()}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => setEditing('new')}
            className="btn-primary rounded-full px-4 py-2 text-sm"
          >
            ＋ 新增
          </button>
        </div>
      </div>

      {/* 记忆摘要概述 */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSummaryOpen((o) => !o)}
            className="flex items-center gap-1"
          >
            <span className="label">记忆摘要概述</span>
            <span className="text-[11px] text-accent">{summaryOpen ? '▲' : '▼'}</span>
          </button>
          <div className="flex items-center gap-3 text-[12px]">
            <button
              onClick={generateOverview}
              disabled={genBusy}
              className="text-accent disabled:opacity-50"
            >
              {genBusy ? '生成中…' : '✨ 生成'}
            </button>
            <button
              onClick={() => {
                setDraft(overview)
                setEditOverview(true)
                setSummaryOpen(true)
              }}
              className="text-muted hover:text-accent"
            >
              编辑
            </button>
          </div>
        </div>
        {editOverview ? (
          <div className="mt-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              placeholder="写一段记忆总览，或点上面「✨ 生成」让 AI 概括…"
              className="w-full resize-none rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => setEditOverview(false)}
                className="glass rounded-full px-3 py-1 text-[12px] text-ink"
              >
                取消
              </button>
              <button
                onClick={() => {
                  setOverview(draft.trim())
                  setEditOverview(false)
                }}
                className="btn-primary rounded-full px-3 py-1 text-[12px]"
              >
                保存
              </button>
            </div>
          </div>
        ) : summaryOpen ? (
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted">
            {overview || '还没有概述～点「✨ 生成」让 AI 概括你的记忆，或「编辑」手写一段。'}
          </p>
        ) : (
          <button
            onClick={() => setSummaryOpen(true)}
            className="mt-2 block w-full text-left"
          >
            <p className="max-h-10 overflow-hidden text-xs leading-relaxed text-muted [overflow-wrap:anywhere]">
              {overview || '还没有概述～点「✨ 生成」或「编辑」。点这里展开。'}
            </p>
          </button>
        )}
      </div>

      {err && <div className="px-1 text-[11px] text-red-500">{err}</div>}

      {/* 搜索 + 分类筛选 */}
      <input
        value={kw}
        onChange={(e) => setKw(e.target.value)}
        placeholder="搜索标题 / 正文 / 标签…"
        className="w-full rounded-2xl border border-line bg-white/40 px-4 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
      />
      <div className="flex gap-2">
        {KIND_FILTERS.map((f) => {
          const active = f.id === kind
          return (
            <button
              key={f.id}
              onClick={() => setKind(f.id)}
              className={[
                'flex-1 rounded-full py-1.5 text-xs transition',
                active ? 'btn-primary' : 'glass text-muted',
              ].join(' ')}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* 列表 / 空状态 */}
      {list.length === 0 ? (
        <div className="glass rounded-3xl px-6 py-12 text-center">
          <div className="text-3xl">🌸</div>
          <p className="mt-3 text-sm text-muted">
            {memories.length === 0
              ? '还没有记忆，写下第一条吧～'
              : '没有匹配的记忆'}
          </p>
          {memories.length === 0 && (
            <button
              onClick={() => setEditing('new')}
              className="btn-primary mt-4 rounded-full px-5 py-2 text-sm"
            >
              写下第一条记忆
            </button>
          )}
        </div>
      ) : (
        <div className="max-h-[55vh] space-y-3 overflow-y-auto rounded-2xl px-0.5 py-1">
          {list.map((m) => (
            <MemoryCard
              key={m.id}
              item={m}
              onEdit={setEditing}
              onToggleStar={toggleStar}
            />
          ))}
        </div>
      )}

      {editing && (
        <MemoryEditor target={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
