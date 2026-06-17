import type { MemoryItem } from '@/types/memory'
import { formatWhen, isCore } from '@/lib/memory'

export default function MemoryCard({
  item,
  onEdit,
  onToggleStar,
}: {
  item: MemoryItem
  onEdit: (m: MemoryItem) => void
  onToggleStar: (id: string) => void
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onEdit(item)}
          className="flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            {item.kind === 'auto' && (
              <span className="label !tracking-normal">自动</span>
            )}
            <span className="text-sm font-medium text-ink">
              {item.title || '（无标题）'}
            </span>
          </div>
          {item.content && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
              {item.content}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {item.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-white/30 px-2 py-0.5 text-[10px] text-muted"
              >
                #{t}
              </span>
            ))}
            <span className="ml-auto text-[10px] text-muted">
              {formatWhen(item.updatedAt)}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onToggleStar(item.id)}
          aria-label={isCore(item) ? '取消核心' : '设为核心'}
          className="shrink-0 text-lg leading-none"
          style={{ color: isCore(item) ? 'var(--accent)' : 'var(--text-soft)' }}
        >
          {isCore(item) ? '★' : '☆'}
        </button>
      </div>
    </div>
  )
}
