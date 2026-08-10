import { describe, expect, it } from 'vitest'
import {
  API_HISTORY_TOKEN_BUDGET,
  AUTO_COMPACT_KEEP,
  buildApiHistoryWindow,
  estimateHistoryTokens,
  selectCompactionBatch,
} from '@/lib/contextCompression'
import type { ChatMsg } from '@/store/chatStore'

function msg(id: string, role: ChatMsg['role'], text: string): ChatMsg {
  return { id, role, text, at: '12:00' }
}

describe('context compression', () => {
  it('keeps a bounded, user-starting API window', () => {
    const history = Array.from({ length: 80 }, (_, i) =>
      msg(String(i), i % 2 === 0 ? 'me' : 'companion', '这是一段较长的历史内容。'.repeat(80)),
    )
    const result = buildApiHistoryWindow(history)
    expect(result.messages.length).toBeLessThanOrEqual(48)
    expect(result.messages[0]?.role).toBe('me')
    expect(result.estimatedTokens).toBeLessThanOrEqual(API_HISTORY_TOKEN_BUDGET)
    expect(result.omitted).toBeGreaterThan(0)
  })

  it('continues after the last covered message and preserves recent turns', () => {
    const history = Array.from({ length: 50 }, (_, i) =>
      msg(String(i), i % 2 === 0 ? 'me' : 'companion', `第 ${i} 轮`),
    )
    const batch = selectCompactionBatch(
      history,
      { text: '旧摘要', coveredThroughId: '15', updatedAt: '', version: 1 },
      AUTO_COMPACT_KEEP,
    )
    expect(batch[0]?.id).toBe('16')
    expect(batch[batch.length - 1]?.id).toBe('25')
    expect(estimateHistoryTokens(history)).toBeGreaterThan(0)
  })
})
