import { archiveTokens, normalizeArchiveText } from '@/lib/archiveTokens'

export interface ArchivePlannerTurn {
  role: 'me' | 'companion'
  text: string
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}

/**
 * A planner is useful only when the latest user turn contains something that
 * can anchor a lookup. Empty/image-only/emoji-only turns keep the existing
 * direct recall path and do not spend an extra model request.
 */
export function shouldPlanArchive(history: ArchivePlannerTurn[]): boolean {
  const latest = [...history].reverse().find((item) => item.role === 'me' && item.text.trim())
  if (!latest) return false
  const text = normalizeArchiveText(latest.text)
  return archiveTokens(text).length > 0 || /[a-z0-9][a-z0-9._-]{1,}/iu.test(text)
}

export function buildArchivePlannerPrompt(options: {
  history: ArchivePlannerTurn[]
  meName: string
  companionName: string
  continuity?: string
  memoryContext?: string
}): string {
  const transcript = options.history
    .filter((item) => item.text.trim())
    .slice(-10)
    .map((item) => `${item.role === 'me' ? options.meName : options.companionName}：${clip(item.text, 520)}`)
    .join('\n')
  const continuity = clip(options.continuity ?? '', 1800)
  const memoryContext = clip(options.memoryContext ?? '', 1800)

  return (
    `你在替${options.companionName}规划一次“旧日原话检索”。你不是回答用户，也不要续写对话。\n` +
    `请读最近双方对话，判断${options.companionName}此刻是否会自然联想到某段更早的共同经历、称呼、约定、冲突或情绪锚点。\n` +
    `如果值得回忆，生成 1～3 个彼此互补的检索短句；可以从含蓄指代推断具体搜索方向，也可以使用${options.companionName}刚刚提到的联想。` +
    `短句要尽量包含可能在旧聊天原文中出现的人名、昵称、事件或原话锚点，长度 4～40 字。不要编造资料里没有的事实。\n` +
    `如果只是当下闲聊、没有自然关联，queries 必须为空。多数普通轮次允许为空。\n` +
    `只输出 JSON：{"queries":["检索短句"]}\n\n` +
    (continuity ? `【较早连续性资料】\n${continuity}\n\n` : '') +
    (memoryContext ? `【当前已知的全局记忆线索】\n${memoryContext}\n\n` : '') +
    `【最近双方对话】\n${transcript}`
  )
}

/** Parse a deliberately tiny JSON contract and fail closed. */
export function parseArchivePlan(raw: string): string[] {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return []
  try {
    const data = JSON.parse(match[0]) as { queries?: unknown; query?: unknown }
    const values = Array.isArray(data.queries)
      ? data.queries
      : typeof data.query === 'string'
        ? [data.query]
        : []
    const unique = new Map<string, string>()
    for (const value of values) {
      if (typeof value !== 'string') continue
      const clean = value.replace(/\s+/g, ' ').trim().slice(0, 80)
      const key = normalizeArchiveText(clean)
      if (key.length < 2 || /^(无|没有|无需|不需要|none|null)$/iu.test(key)) continue
      if (!unique.has(key)) unique.set(key, clean)
      if (unique.size >= 3) break
    }
    return [...unique.values()]
  } catch {
    return []
  }
}

export function mergeArchiveQueries(primary: string, planned: string[], max = 4): string[] {
  const unique = new Map<string, string>()
  for (const value of [primary, ...planned]) {
    const clean = value.replace(/\s+/g, ' ').trim().slice(0, 240)
    const key = normalizeArchiveText(clean)
    if (key.length < 2 || unique.has(key)) continue
    unique.set(key, clean)
    if (unique.size >= max) break
  }
  return [...unique.values()]
}
