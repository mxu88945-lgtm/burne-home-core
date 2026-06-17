/** 记忆相关的展示/筛选小工具 */

import type { MemoryItem } from '@/types/memory'

export type KindFilter = 'all' | 'core' | 'normal' | 'auto'

export const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'core', label: '核心' },
  { id: 'normal', label: '普通' },
  { id: 'auto', label: '自动' },
]

/** 是否核心：核心类 或 被标星 */
export function isCore(m: MemoryItem): boolean {
  return m.kind === 'core' || m.starred
}

export function matchKind(m: MemoryItem, f: KindFilter): boolean {
  switch (f) {
    case 'all':
      return true
    case 'core':
      return isCore(m)
    case 'normal':
      return m.kind === 'normal' && !m.starred
    case 'auto':
      return m.kind === 'auto'
  }
}

/** 关键词匹配：标题 / 正文 / 标签 */
export function matchKeyword(m: MemoryItem, kw: string): boolean {
  const q = kw.trim().toLowerCase()
  if (!q) return true
  return (
    m.title.toLowerCase().includes(q) ||
    m.content.toLowerCase().includes(q) ||
    m.tags.some((t) => t.toLowerCase().includes(q))
  )
}

/** 核心置顶 + 按更新时间倒序 */
export function sortForDisplay(list: MemoryItem[]): MemoryItem[] {
  return [...list].sort((a, b) => {
    const ca = isCore(a) ? 1 : 0
    const cb = isCore(b) ? 1 : 0
    if (ca !== cb) return cb - ca
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

/** 友好时间：今天显示时分，否则显示日期 */
export function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

/** 解析标签输入（逗号/空格分隔） */
export function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  )
}
