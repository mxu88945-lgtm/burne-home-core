import { useMemo, useState } from 'react'
import type { MemoryItem } from '@/types/memory'
import { useMemoryStore } from '@/store/memoryStore'
import MemoryCard from '@/components/memory/MemoryCard'
import MemoryEditor from '@/components/memory/MemoryEditor'
import BackBar from '@/components/layout/BackBar'
import {
  KIND_FILTERS,
  type KindFilter,
  matchKind,
  matchKeyword,
  sortForDisplay,
} from '@/lib/memory'

export default function MemoryLibrary() {
  const memories = useMemoryStore((s) => s.memories)
  const toggleStar = useMemoryStore((s) => s.toggleStar)
  const summary = useMemoryStore((s) => s.getSummary())

  const [kind, setKind] = useState<KindFilter>('all')
  const [kw, setKw] = useState('')
  const [editing, setEditing] = useState<MemoryItem | 'new' | null>(null)

  const list = useMemo(
    () =>
      sortForDisplay(
        memories.filter((m) => matchKind(m, kind) && matchKeyword(m, kw))
      ),
    [memories, kind, kw]
  )

  return (
    <div className="space-y-4">
      <BackBar />
      <div className="flex items-end justify-between px-1">
        <div>
          <h2 className="headline text-2xl text-ink">记忆库 📔</h2>
          <p className="mt-1 text-xs text-muted">
            共 {summary.total} 条 · 核心 {summary.coreCount}
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="btn-primary rounded-full px-4 py-2 text-sm"
        >
          ＋ 新增
        </button>
      </div>

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
        <div className="space-y-3">
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
