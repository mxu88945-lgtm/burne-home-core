import { useEffect, useMemo, useRef, useState } from 'react'
import BackBar from '@/components/layout/BackBar'
import {
  listArchiveConversations,
  listArchiveSources,
  setArchiveConversationIncluded,
} from '@/lib/archiveDb'
import { importArchivePack } from '@/lib/archiveImport'
import { recallArchive } from '@/lib/archiveRecall'
import {
  isArchiveRecallEnabled,
  setArchiveRecallEnabled,
} from '@/lib/archiveSettings'
import type {
  ArchiveConversation,
  ArchiveImportProgress,
  ArchiveRecallHit,
  ArchiveSource,
} from '@/types/archive'

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value?: string): string {
  if (!value) return '时间未记录'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '时间未记录'
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function MemoryArchive() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [sources, setSources] = useState<ArchiveSource[]>([])
  const [conversations, setConversations] = useState<ArchiveConversation[]>([])
  const [recallEnabled, setRecallEnabledState] = useState(() => isArchiveRecallEnabled())
  const [titleQuery, setTitleQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchAll, setSearchAll] = useState(false)
  const [hits, setHits] = useState<ArchiveRecallHit[]>([])
  const [candidateCount, setCandidateCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState<ArchiveImportProgress | null>(null)

  async function refresh() {
    const [sourceRows, conversationRows] = await Promise.all([
      listArchiveSources(),
      listArchiveConversations(),
    ])
    setSources(sourceRows)
    setConversations(conversationRows)
  }

  useEffect(() => {
    void refresh().catch((error) => setMessage(`读取档案失败：${(error as Error).message}`))
  }, [])

  const visibleConversations = useMemo(() => {
    const query = titleQuery.trim().toLocaleLowerCase()
    const rows = query
      ? conversations.filter((item) =>
          `${item.title} ${item.matchReasons.join(' ')}`.toLocaleLowerCase().includes(query),
        )
      : conversations
    return rows.slice(0, 100)
  }, [conversations, titleQuery])

  const includedCount = conversations.filter((item) => item.included).length

  async function onImport(file: File) {
    setBusy(true)
    setMessage('正在把旧日原文写入独立档案库…')
    setProgress({ bytesRead: 0, totalBytes: file.size, conversations: 0, chunks: 0, phase: 'reading' })
    try {
      const source = await importArchivePack(file, setProgress)
      await refresh()
      setMessage(
        `导入完成：${source.conversationCount} 个会话、${source.messageCount} 条可见消息、${source.chunkCount} 个原文切片。`,
      )
    } catch (error) {
      setMessage(`导入失败：${(error as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function runSearch() {
    const query = searchQuery.trim()
    if (!query || busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await recallArchive(query, {
        includeDisabled: searchAll,
        ignoreGlobalToggle: true,
        maxHits: 12,
        maxChars: 8000,
      })
      setHits(result.hits)
      setCandidateCount(result.candidateCount)
      if (!result.hits.length) setMessage('没有找到相关原文；可以勾选“连未启用会话一起搜”再试。')
    } catch (error) {
      setMessage(`搜索失败：${(error as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function toggleConversation(item: ArchiveConversation) {
    try {
      await setArchiveConversationIncluded(item.id, !item.included)
      setConversations((current) =>
        current.map((row) => (row.id === item.id ? { ...row, included: !row.included } : row)),
      )
    } catch (error) {
      setMessage(`更新失败：${(error as Error).message}`)
    }
  }

  const percent = progress?.totalBytes
    ? Math.min(100, (progress.bytesRead / progress.totalBytes) * 100)
    : 0

  return (
    <div className="space-y-4">
      <BackBar />
      <div className="px-1">
        <h2 className="headline text-2xl text-ink">旧日原文档案</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          独立保存、按需索引、有出处召回。原文不并入结构化记忆，也不会上传到仓库。
        </p>
      </div>

      <div className="glass space-y-3 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-ink">允许主聊天召回</div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              只检索下方已启用的会话；你刚说的话永远优先。
            </p>
          </div>
          <button
            type="button"
            aria-pressed={recallEnabled}
            onClick={() => {
              const next = !recallEnabled
              setArchiveRecallEnabled(next)
              setRecallEnabledState(next)
            }}
            className={`h-7 w-12 rounded-full p-1 transition ${recallEnabled ? 'bg-accent' : 'bg-black/15'}`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white shadow transition ${recallEnabled ? 'translate-x-5' : ''}`}
            />
          </button>
        </div>
      </div>

      <div className="glass space-y-3 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="label">导入独立档案包</div>
            <p className="mt-1 text-[11px] text-muted">支持 .burne-archive.ndjson，可流式读取大文件。</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50"
          >
            选择档案包
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".ndjson,.burne-archive.ndjson,application/x-ndjson"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onImport(file)
              event.target.value = ''
            }}
          />
        </div>
        <p className="text-[10px] leading-relaxed text-muted">
          请保留原始导出和档案包：现有“整包备份”不会复制这座独立档案库，换设备时重新导入即可。
        </p>
        {progress && progress.phase !== 'done' && (
          <div>
            <div className="flex justify-between text-[11px] text-muted">
              <span>{progress.phase === 'writing' ? '正在写入索引…' : '正在读取原文…'}</span>
              <span>{percent.toFixed(0)}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10">
              <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-muted">
              已读 {formatBytes(progress.bytesRead)} · 会话 {progress.conversations} · 切片 {progress.chunks}
            </p>
          </div>
        )}
        {message && <p className="text-[11px] leading-relaxed text-accent">{message}</p>}
      </div>

      {sources.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="glass rounded-2xl p-3 text-center">
            <div className="text-lg font-semibold text-ink">{sources.reduce((sum, item) => sum + item.conversationCount, 0)}</div>
            <div className="text-[10px] text-muted">旧会话</div>
          </div>
          <div className="glass rounded-2xl p-3 text-center">
            <div className="text-lg font-semibold text-ink">{sources.reduce((sum, item) => sum + item.messageCount, 0)}</div>
            <div className="text-[10px] text-muted">可见消息</div>
          </div>
          <div className="glass rounded-2xl p-3 text-center">
            <div className="text-lg font-semibold text-ink">{includedCount}</div>
            <div className="text-[10px] text-muted">允许召回</div>
          </div>
        </div>
      )}

      {conversations.length > 0 && (
        <div className="glass space-y-3 rounded-2xl p-4">
          <div className="label">会话范围</div>
          <input
            value={titleQuery}
            onChange={(event) => setTitleQuery(event.target.value)}
            placeholder="按标题或识别理由筛选…"
            className="w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {visibleConversations.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void toggleConversation(item)}
                className="flex w-full items-start justify-between gap-3 rounded-xl bg-white/25 px-3 py-2 text-left"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-ink">{item.title}</div>
                  <div className="mt-0.5 text-[10px] leading-relaxed text-muted">
                    {formatDate(item.createdAt)} · {item.messageCount} 条 · 识别分 {item.burneScore}
                    {item.matchReasons[0] ? ` · ${item.matchReasons[0]}` : ''}
                  </div>
                </div>
                <span className={`shrink-0 text-xs ${item.included ? 'text-accent' : 'text-muted'}`}>
                  {item.included ? '已启用' : '未启用'}
                </span>
              </button>
            ))}
          </div>
          {conversations.length > visibleConversations.length && (
            <p className="text-[10px] text-muted">当前最多显示 100 条，请用标题筛选其余会话。</p>
          )}
        </div>
      )}

      {conversations.length > 0 && (
        <div className="glass space-y-3 rounded-2xl p-4">
          <div className="label">原话检索与证据</div>
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runSearch()
              }}
              placeholder="例如：某句约定、一次旅行、旧日称呼…"
              className="min-w-0 flex-1 rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={busy || !searchQuery.trim()}
              onClick={() => void runSearch()}
              className="btn-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50"
            >
              搜索
            </button>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={searchAll}
              onChange={(event) => setSearchAll(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            连未启用会话一起搜（只供核对，不会自动发给模型）
          </label>
          {hits.length > 0 && (
            <p className="text-[10px] text-muted">从 {candidateCount} 个相关切片中选出 {hits.length} 条证据。</p>
          )}
          <div className="space-y-3">
            {hits.map((hit) => (
              <article key={hit.chunkId} className="rounded-2xl border border-line bg-white/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[13px] font-medium text-ink">{hit.title}</h3>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {formatDate(hit.startedAt ?? hit.endedAt)} · {hit.reasons.join(' · ')} · 分数 {hit.score}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted">{hit.messageIds.length} 条原消息</span>
                </div>
                <pre className="mt-2 max-h-60 whitespace-pre-wrap overflow-y-auto font-sans text-[12px] leading-relaxed text-ink">
                  {hit.text}
                </pre>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
