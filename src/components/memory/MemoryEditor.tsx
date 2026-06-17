import { useState } from 'react'
import type { MemoryItem } from '@/types/memory'
import { useMemoryStore } from '@/store/memoryStore'
import { parseTags } from '@/lib/memory'

/** target: 'new' 表示新增；否则为待编辑的记忆 */
export default function MemoryEditor({
  target,
  onClose,
}: {
  target: MemoryItem | 'new'
  onClose: () => void
}) {
  const { addMemory, updateMemory, removeMemory } = useMemoryStore()
  const editing = target !== 'new' ? target : null

  const [title, setTitle] = useState(editing?.title ?? '')
  const [content, setContent] = useState(editing?.content ?? '')
  const [tags, setTags] = useState((editing?.tags ?? []).join(' '))
  const [starred, setStarred] = useState(editing?.starred ?? false)

  function save() {
    if (!title.trim() && !content.trim()) {
      onClose()
      return
    }
    const fields = {
      title: title.trim(),
      content: content.trim(),
      tags: parseTags(tags),
      starred,
    }
    if (editing) updateMemory(editing.id, fields)
    else addMemory(fields)
    onClose()
  }

  function del() {
    if (editing && window.confirm('删除这条记忆？')) {
      removeMemory(editing.id)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div className="glass-strong relative w-full max-w-md rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/40" />
        <h3 className="headline text-xl text-ink">
          {editing ? '编辑记忆' : '新的记忆'}
        </h3>

        <div className="mt-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题…"
            className="w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="写下这段记忆…"
            rows={4}
            className="w-full resize-none rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="标签（空格或逗号分隔）"
            className="w-full rounded-xl border border-line bg-white/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
          />
          <label className="flex items-center justify-between">
            <span className="text-sm text-ink">设为核心记忆 ★</span>
            <input
              type="checkbox"
              checked={starred}
              onChange={(e) => setStarred(e.target.checked)}
              className="h-5 w-5 accent-accent"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button onClick={save} className="btn-primary flex-1 rounded-xl py-2.5 text-sm">
            保存
          </button>
          {editing && (
            <button
              onClick={del}
              className="glass rounded-xl px-4 py-2.5 text-sm text-ink"
            >
              删除
            </button>
          )}
          <button
            onClick={onClose}
            className="glass rounded-xl px-4 py-2.5 text-sm text-ink"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
