import type {
  MemoryDiagnostic,
  MemoryDiagnosticItem,
  MemoryItem,
  MemoryLayer,
  MemoryScope,
} from '@/types/memory'

export interface MemoryRecallOptions {
  query: string
  scope: MemoryScope
  memories: MemoryItem[]
  overview?: string
  maxItems?: number
  maxChars?: number
  now?: Date
}

export interface MemoryRecallResult {
  text: string
  diagnostic: MemoryDiagnostic
}

const DEFAULT_MAX_ITEMS = 18
const DEFAULT_MAX_CHARS = 3200
const OVERVIEW_CHARS = 360

function clip(value: string, max: number): string {
  const text = value.trim()
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text
}

function tokenise(value: string): Set<string> {
  const normalized = value.toLocaleLowerCase().replace(/\s+/g, ' ')
  const tokens = new Set<string>()
  for (const token of normalized.match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (token.length > 1) tokens.add(token)
  }
  const cjk = Array.from(normalized).filter((char) => /[\u3400-\u9fff]/u.test(char))
  for (const char of cjk) tokens.add(char)
  for (let i = 0; i < cjk.length - 1; i += 1) tokens.add(`${cjk[i]}${cjk[i + 1]}`)
  return tokens
}

function layerOf(memory: MemoryItem): MemoryLayer {
  if (memory.starred) return 'core'
  return memory.kind === 'short' ? 'recent' : 'long'
}

function isActive(memory: MemoryItem, now: Date): boolean {
  if (memory.deletedAt || memory.supersededById) return false
  if (memory.expiresAt && new Date(memory.expiresAt).getTime() <= now.getTime()) return false
  return true
}

function recencyScore(memory: MemoryItem, now: Date): number {
  const updated = new Date(memory.updatedAt).getTime()
  if (!Number.isFinite(updated)) return 0
  const ageDays = Math.max(0, (now.getTime() - updated) / 86_400_000)
  return Math.max(0, 18 - Math.min(18, ageDays))
}

function scoreMemory(memory: MemoryItem, queryTokens: Set<string>, query: string, now: Date): { score: number; reason: string } {
  const layer = layerOf(memory)
  const title = memory.title.toLocaleLowerCase()
  const tags = memory.tags.join(' ').toLocaleLowerCase()
  const content = memory.content.toLocaleLowerCase()
  const haystack = `${title} ${tags} ${content}`
  let score = layer === 'core' ? 72 : layer === 'long' ? 12 : 6
  const reasons: string[] = []
  if (query.trim() && title.includes(query.trim().toLocaleLowerCase())) {
    score += 45
    reasons.push('标题命中')
  }
  if (query.trim() && tags.includes(query.trim().toLocaleLowerCase())) {
    score += 32
    reasons.push('标签命中')
  }
  let overlap = 0
  for (const token of queryTokens) if (haystack.includes(token)) overlap += 1
  if (overlap) {
    score += Math.min(36, overlap * 6)
    reasons.push('当前话题相关')
  }
  score += recencyScore(memory, now)
  if (layer === 'recent') reasons.push('近期状态')
  if (layer === 'core') reasons.push('核心记忆')
  if (!reasons.length) reasons.push(layer === 'long' ? '长期目录' : '可用记忆')
  return { score, reason: reasons.slice(0, 2).join(' · ') }
}

function diagItem(memory: MemoryItem, score: number, reason: string, chars: number): MemoryDiagnosticItem {
  return { id: memory.id, title: clip(memory.title || '未命名记忆', 80), layer: layerOf(memory), score: Math.round(score), reason, chars }
}

export function recallMemories(options: MemoryRecallOptions): MemoryRecallResult {
  const now = options.now ?? new Date()
  const query = options.query.trim()
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS
  const queryTokens = tokenise(query)
  const overview = clip(options.overview ?? '', OVERVIEW_CHARS)
  const overviewText = overview ? `\n（长期记忆目录）${overview}` : ''
  const memoryHeader = '\n\n【相关记忆——自然运用，不要提及记忆系统；当前用户明确说法优先】\n'
  const contentBudget = Math.max(0, maxChars - overviewText.length - memoryHeader.length)
  const skipped: MemoryDiagnostic['skipped'] = []
  const candidates: Array<{ memory: MemoryItem; score: number; reason: string }> = []

  for (const memory of options.memories) {
    if (memory.scope && memory.scope !== 'global' && memory.scope !== options.scope) {
      skipped.push(diagItem(memory, 0, '范围不符', 0))
      continue
    }
    if (memory.deletedAt) {
      skipped.push(diagItem(memory, 0, '已删除', 0))
      continue
    }
    if (memory.supersededById) {
      skipped.push(diagItem(memory, 0, '已被新记忆取代', 0))
      continue
    }
    if (memory.expiresAt && new Date(memory.expiresAt).getTime() <= now.getTime()) {
      skipped.push(diagItem(memory, 0, '已过期', 0))
      continue
    }
    if (!isActive(memory, now)) continue
    const scored = scoreMemory(memory, queryTokens, query, now)
    candidates.push({ memory, ...scored })
  }

  candidates.sort((a, b) => b.score - a.score || b.memory.updatedAt.localeCompare(a.memory.updatedAt))
  const used: MemoryDiagnostic['used'] = []
  const lines: string[] = []
  let chars = 0
  let count = 0
  const layerBudget: Record<MemoryLayer, number> = { core: 1300, long: 1450, recent: 600 }
  const layerUsed: Record<MemoryLayer, number> = { core: 0, long: 0, recent: 0 }

  for (const candidate of candidates) {
    if (count >= maxItems) {
      skipped.push(diagItem(candidate.memory, candidate.score, '数量预算抑制', 0))
      continue
    }
    const layer = layerOf(candidate.memory)
    const body = clip(candidate.memory.content, Math.min(720, layerBudget[layer]))
    const line = `· [${layer === 'core' ? '核心' : layer === 'long' ? '长期' : '近期'}] ${candidate.memory.title ? `${candidate.memory.title}：` : ''}${body}`
    const lineChars = line.length + 1
    if (layerUsed[layer] + lineChars > layerBudget[layer] || chars + lineChars > contentBudget) {
      skipped.push(diagItem(candidate.memory, candidate.score, '字符预算抑制', 0))
      continue
    }
    // 没有相关词时，长期/近期只作为目录候选；核心仍然保持高优先级。
    if (!query && layer !== 'core' && candidate.score < 18) {
      skipped.push(diagItem(candidate.memory, candidate.score, '无当前话题命中', 0))
      continue
    }
    lines.push(line)
    chars += lineChars
    layerUsed[layer] += lineChars
    count += 1
    used.push(diagItem(candidate.memory, candidate.score, candidate.reason, lineChars))
  }

  let text = ''
  if (overview) text += `\n（长期记忆目录）${overview}`
  if (lines.length) {
    text += `\n\n【相关记忆——自然运用，不要提及记忆系统；当前用户明确说法优先】\n${lines.join('\n')}`
  }
  const diagnostic: MemoryDiagnostic = {
    id: `memdiag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: now.toISOString(),
    scope: options.scope,
    queryPreview: clip(query, 120),
    used,
    skipped: skipped.slice(0, 80),
    totalChars: text.length,
  }
  return { text, diagnostic }
}

export function memoryLayerLabel(layer: MemoryLayer): string {
  return layer === 'core' ? '角色核心' : layer === 'long' ? '长期记忆' : '近期状态'
}
