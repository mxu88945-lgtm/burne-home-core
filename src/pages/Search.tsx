import { useMemo, useState } from 'react'
import type { MemoryItem } from '@/types/memory'
import { useMemoryStore } from '@/store/memoryStore'
import { CURRENT_WINDOW_ID } from '@/lib/constants'
import MemoryCard from '@/components/memory/MemoryCard'
import MemoryEditor from '@/components/memory/MemoryEditor'
import BackBar from '@/components/layout/BackBar'
import { matchKeyword, sortForDisplay } from '@/lib/memory'

export default function Search() {
  const memories = useMemoryStore((s) => s.memories)
  const toggleStar = useMemoryStore((s) => s.toggleStar)

  const [kw, setKw] = useState('')
  const [otherWindows, setOtherWindows] = useState(false)
  const [editing, setEditing] = useState<MemoryItem | null>(null)

  const results = useMemo(() => {
    const base = memories.filter((m) => matchKeyword(m, kw))
    const scoped = otherWindows
      ? base.filter((m) => m.windowId && m.windowId !== CURRENT_WINDOW_ID)
      : base
    return sortForDisplay(scoped)
  }, [memories, kw, otherWindows])

  return (
    <div className="space-y-4">
      <BackBar />
      <div className="px-1">
        <h2 className="headline text-2xl text-ink">搜索回忆 🔍</h2>
        <p className="mt-1 text-xs text-muted">
          全文搜索 · 跨窗口召回旧会话里的记忆
        </p>
      </div>

      <input
        value={kw}
        onChange={(e) => setKw(e.target.value)}
        placeholder="搜索标题 / 正文 / 标签…"
        autoFocus
        className="w-full rounded-2xl border border-line bg-white/40 px-4 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
      />

      <label className="flex items-center gap-2 px-1 text-xs text-muted">
        <input
          type="checkbox"
          checked={otherWindows}
          onChange={(e) => setOtherWindows(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        只看其它窗口/会话产生的记忆（跨窗口回忆）
      </label>

      {kw.trim() === '' ? (
        <p className="px-1 pt-4 text-center text-sm text-muted">
          输入关键词开始回忆吧～
        </p>
      ) : results.length === 0 ? (
        <p className="px-1 pt-4 text-center text-sm text-muted">
          没有找到「{kw}」相关的记忆
        </p>
      ) : (
        <div className="space-y-3">
          <div className="label px-1">{results.length} 条结果</div>
          {results.map((m) => (
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
