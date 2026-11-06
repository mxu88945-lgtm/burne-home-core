import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { putArchiveBatch } from '@/lib/archiveDb'
import {
  buildArchivePrompt,
  buildArchiveQuery,
  recallArchive,
  recallArchiveQueries,
} from '@/lib/archiveRecall'
import { buildArchiveTerms, buildArchiveQueryTerms } from '@/lib/archiveTokens'
import type { ArchiveChunk, ArchiveConversation } from '@/types/archive'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, String(value)) }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
  })
})

function fixture(included: boolean, suffix: string) {
  const conversationId = `conv-${suffix}`
  const text = '用户原话：你还记得湖边那把蓝色雨伞吗？\n\n当时的助手原话：记得，那是旧日约定。'
  const conversation: ArchiveConversation = {
    id: conversationId,
    sourceId: `source-${suffix}`,
    title: `湖边旧事 ${suffix}`,
    titleNormalized: `湖边旧事 ${suffix}`,
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:01:00.000Z',
    messageCount: 2,
    chunkCount: 1,
    burneScore: 100,
    matchReasons: ['测试锚点'],
    included,
  }
  const chunk: ArchiveChunk = {
    id: `${conversationId}:chunk-1`,
    sourceId: conversation.sourceId,
    conversationId,
    title: conversation.title,
    sequence: 1,
    startedAt: conversation.createdAt,
    endedAt: conversation.updatedAt,
    text,
    messageIds: [`user-${suffix}`, `assistant-${suffix}`],
    terms: buildArchiveTerms(conversation.title, text),
  }
  return { conversation, chunk }
}

describe('independent memory archive recall', () => {
  it('uses only user turns to expand a vague archive query', () => {
    const query = buildArchiveQuery([
      { role: 'me', text: '去年搬家的时候蓝色箱子丢了' },
      { role: 'companion', text: '助手回声里有一段不该成为检索词的内容' },
      { role: 'me', text: '那时候呢' },
    ])
    expect(query).toContain('蓝色箱子丢了')
    expect(query).toContain('那时候呢')
    expect(query).not.toContain('助手回声')
  })

  it('keeps the term index bounded while preserving queryable Chinese phrases', () => {
    const terms = buildArchiveTerms('蓝色门牌', '很长的旧日原文。'.repeat(500))
    expect(terms.length).toBeLessThanOrEqual(144)
    expect(buildArchiveQueryTerms('蓝色门牌')).toEqual(
      expect.arrayContaining(['蓝色', '色门', '门牌']),
    )
  })

  it('returns enabled exact evidence with title, date, and message ids', async () => {
    const suffix = `enabled-${Date.now()}`
    const { conversation, chunk } = fixture(true, suffix)
    await putArchiveBatch([conversation], [chunk])

    const result = await recallArchive('湖边那把蓝色雨伞', { maxHits: 4 })
    expect(result.hits[0]).toMatchObject({
      conversationId: conversation.id,
      title: conversation.title,
      messageIds: chunk.messageIds,
    })
    expect(result.hits[0].reasons).toContain('原话完整命中')
    expect(result.prompt).toContain('旧日对话原文档案')
    expect(result.prompt).toContain('当前用户明确说法')
  })

  it('merges direct and proactive searches without duplicating the same evidence', async () => {
    const suffix = `planned-${Date.now()}`
    const { conversation, chunk } = fixture(true, suffix)
    await putArchiveBatch([conversation], [chunk])

    const result = await recallArchiveQueries([
      '湖边那把蓝色雨伞',
      `旧日约定 ${suffix}`,
      '湖边那把蓝色雨伞',
    ])
    expect(result.hits.filter((item) => item.chunkId === chunk.id)).toHaveLength(1)
    expect(result.prompt).toContain('旧日对话原文档案')
    expect(result.prompt).toContain('蓝色雨伞')
  })

  it('does not inject a conversation that the user has not enabled', async () => {
    const suffix = `disabled-${Date.now()}`
    const { conversation, chunk } = fixture(false, suffix)
    await putArchiveBatch([conversation], [chunk])

    const result = await recallArchive(suffix)
    expect(result.hits.some((item) => item.conversationId === conversation.id)).toBe(false)

    const review = await recallArchive(suffix, { includeDisabled: true })
    expect(review.hits.some((item) => item.conversationId === conversation.id)).toBe(true)
  })

  it('lets the archive page search enabled evidence while automatic recall is switched off', async () => {
    const suffix = `manual-${Date.now()}`
    const { conversation, chunk } = fixture(true, suffix)
    await putArchiveBatch([conversation], [chunk])
    localStorage.setItem('burne-home-core:archive-recall-enabled', '0')

    expect((await recallArchive(suffix)).hits).toEqual([])
    const manual = await recallArchive(suffix, { ignoreGlobalToggle: true })
    expect(manual.hits.some((item) => item.conversationId === conversation.id)).toBe(true)
  })

  it('never emits a half evidence block when the prompt budget is too small', () => {
    const prompt = buildArchivePrompt(
      '锚点',
      [{
        chunkId: 'c1',
        conversationId: 'v1',
        title: '旧窗口',
        text: '原文'.repeat(100),
        messageIds: ['m1'],
        score: 10,
        reasons: ['相关'],
      }],
      80,
    )
    expect(prompt).toBe('')
  })
})
