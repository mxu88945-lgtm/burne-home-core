import type { ChatMsg, ChatContextSummary } from '@/store/chatStore'
import { stripSongTags } from '@/lib/songPick'

/**
 * Context handling for long chats.
 *
 * The complete transcript stays in the local session. Only a bounded recent
 * window is sent to the provider, with an optional rolling summary injected
 * separately by Chat.tsx. This keeps old conversations searchable/exportable
 * without allowing the provider prompt to grow without bound.
 */

// Leave headroom for the persona/system prompt, memories, local-time note,
// and a rolling summary. The provider limit belongs to the whole request,
// not only the messages array.
// 2026-11-08 对齐顾祁砚：攒满 240 条才自动整理一次，保留最近 96 条原文。
export const API_HISTORY_TOKEN_BUDGET = 8200
export const API_HISTORY_MESSAGE_CAP = 96
export const AUTO_COMPACT_MESSAGE_THRESHOLD = 240
export const AUTO_COMPACT_KEEP = 96
// Chinese characters are roughly one token each. Keep the summary request
// itself comfortably below the provider's context limit even when a previous
// summary is included.
export const SUMMARY_TRANSCRIPT_CHAR_LIMIT = 9000
export const SUMMARY_CHAR_LIMIT = 3200
export const SUMMARY_VERSION = 1

function estimateTextTokens(value: string): number {
  const text = String(value || '')
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length
  const other = Math.max(0, text.length - cjk)
  return Math.ceil(cjk * 1.05 + other / 4)
}

function messageExtraText(message: ChatMsg): string {
  const parts: string[] = []
  const imgCount = (message.image ? 1 : 0) + (message.images?.length ?? 0)
  if (imgCount) parts.push(imgCount > 1 ? `［图片×${imgCount}］` : '［图片］')
  if (message.file) {
    parts.push(
      message.file.text
        ? `[文件 ${message.file.name} 的内容]：${message.file.text}`
        : `［文件：${message.file.name}］`,
    )
  }
  if (message.task) {
    parts.push(`［任务：${message.task.text}］`)
  }
  return parts.join('\n')
}

export function messagePromptText(message: ChatMsg): string {
  const text = stripSongTags(message.text).trim()
  const extra = messageExtraText(message)
  return [text, extra].filter(Boolean).join('\n\n')
}

export function estimateMessageTokens(message: ChatMsg): number {
  const text = messagePromptText(message)
  // Images are deliberately charged conservatively. The actual provider cost
  // varies by image dimensions, but treating each as ~1200 tokens prevents a
  // long image-heavy chat from bypassing the window.
  const imageCost = ((message.image ? 1 : 0) + (message.images?.length ?? 0)) * 1200
  return Math.max(4, estimateTextTokens(text) + imageCost + 4)
}

export function estimateHistoryTokens(messages: ChatMsg[]): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0)
}

function hasPromptContent(message: ChatMsg): boolean {
  return Boolean(message.text.trim() || message.image || message.file || message.task)
}

function apiRole(message: ChatMsg): 'user' | 'assistant' {
  return message.task || message.role === 'me' ? 'user' : 'assistant'
}

/**
 * Select a recent, role-safe API window. The first user message is retained
 * whenever possible, while the newest turns always win over older turns.
 */
export function buildApiHistoryWindow(
  messages: ChatMsg[],
  options: {
    tokenBudget?: number
    messageCap?: number
  } = {},
): { messages: ChatMsg[]; omitted: number; estimatedTokens: number } {
  const tokenBudget = options.tokenBudget ?? API_HISTORY_TOKEN_BUDGET
  const messageCap = options.messageCap ?? API_HISTORY_MESSAGE_CAP
  const usable = messages.filter(hasPromptContent)
  if (!usable.length) return { messages: [], omitted: 0, estimatedTokens: 0 }

  let total = 0
  const chosen: ChatMsg[] = []
  for (let i = usable.length - 1; i >= 0; i -= 1) {
    const message = usable[i]
    const size = estimateMessageTokens(message)
    if (chosen.length >= messageCap) break
    // A strict budget matters more than preserving an arbitrary number of
    // role runs. The newest user turn is always included even when it alone is
    // larger than the nominal budget.
    if (chosen.length && total + size > tokenBudget) break
    chosen.unshift(message)
    total += size
  }

  // Chat APIs reject an assistant-first transcript. Drop leading assistant
  // turns rather than inventing a user message.
  while (chosen.length && apiRole(chosen[0]) !== 'user') {
    total -= estimateMessageTokens(chosen.shift()!)
  }

  return {
    messages: chosen,
    omitted: Math.max(0, usable.length - chosen.length),
    estimatedTokens: Math.max(0, total),
  }
}

function clipUnicode(value: string, limit: number): string {
  const text = String(value || '').trim()
  if (text.length <= limit) return text
  return `${Array.from(text).slice(0, Math.max(0, limit - 1)).join('')}…`
}

/** Build a compact, bounded transcript for the summary model itself. */
export function buildCompactionTranscript(
  batch: ChatMsg[],
  previousSummary?: ChatContextSummary,
): string {
  const prefix = previousSummary?.text.trim()
    ? `【此前连续性摘要】\n${clipUnicode(previousSummary.text, 3200)}\n\n【新增对话原文】\n`
    : '【需要整理的对话原文】\n'
  const rows = batch.map((message) => {
    const who = message.role === 'me' ? '用户' : '角色'
    return `${who}：${clipUnicode(messagePromptText(message), 900)}`
  })
  return clipUnicode(`${prefix}${rows.join('\n')}`, SUMMARY_TRANSCRIPT_CHAR_LIMIT)
}

export function clipSummary(value: string): string {
  return clipUnicode(value, SUMMARY_CHAR_LIMIT)
}

/** Find the un-summarized oldest block while retaining the newest turns. */
export function selectCompactionBatch(
  messages: ChatMsg[],
  previousSummary: ChatContextSummary | undefined,
  keep = AUTO_COMPACT_KEEP,
): ChatMsg[] {
  const usable = messages.filter(hasPromptContent)
  const targetEnd = Math.max(0, usable.length - keep)
  if (targetEnd <= 0) return []

  let start = 0
  if (previousSummary?.coveredThroughId) {
    const covered = usable.findIndex((message) => message.id === previousSummary.coveredThroughId)
    // If a user edited/deleted a message covered by the summary, rebuilding
    // from scratch is safer than silently carrying stale continuity forward.
    start = covered >= 0 ? covered + 1 : 0
  }
  return usable.slice(start, targetEnd)
}

/** 还没被连续性档案覆盖的消息（顾祁砚口径：只数这些，满 240 才整理）。 */
export function uncompactedMessages(
  messages: ChatMsg[],
  previousSummary?: ChatContextSummary,
): ChatMsg[] {
  const usable = messages.filter(hasPromptContent)
  if (!previousSummary?.coveredThroughId) return usable
  const covered = usable.findIndex((message) => message.id === previousSummary.coveredThroughId)
  return covered >= 0 ? usable.slice(covered + 1) : usable
}

export function shouldAutoCompact(messages: ChatMsg[], previousSummary?: ChatContextSummary): boolean {
  return uncompactedMessages(messages, previousSummary).length >= AUTO_COMPACT_MESSAGE_THRESHOLD
}
