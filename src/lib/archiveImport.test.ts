import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { getArchiveSource, listArchiveConversations } from '@/lib/archiveDb'
import { ArchiveAlreadyImportedError, importArchivePack } from '@/lib/archiveImport'
import { buildArchiveTerms } from '@/lib/archiveTokens'

function pack(sourceId: string, complete = true): File {
  const conversationId = `${sourceId}:conversation-1`
  const text = '用户原话：还记得蓝色门牌吗？\n\n当时的助手原话：记得。'
  const lines: unknown[] = [
    {
      type: 'header',
      format: 'burne-memory-archive',
      version: 1,
      source: {
        id: sourceId,
        name: '测试档案',
        createdAt: '2026-11-05T00:00:00.000Z',
        originalFiles: ['conversations-000.json'],
        bytes: 100,
      },
    },
    {
      type: 'conversation',
      conversation: {
        id: conversationId,
        sourceId,
        title: '旧窗口',
        titleNormalized: '旧窗口',
        messageCount: 2,
        chunkCount: 1,
        burneScore: 120,
        matchReasons: ['测试'],
        included: true,
      },
    },
    {
      type: 'chunk',
      chunk: {
        id: `${conversationId}:chunk-1`,
        sourceId,
        conversationId,
        title: '旧窗口',
        sequence: 1,
        text,
        messageIds: ['m1', 'm2'],
        terms: buildArchiveTerms('旧窗口', text),
      },
    },
  ]
  if (complete) {
    lines.push({
      type: 'end',
      stats: {
        conversationCount: 1,
        includedConversationCount: 1,
        messageCount: 2,
        chunkCount: 1,
      },
    })
  }
  return new File([`${lines.map((line) => JSON.stringify(line)).join('\n')}\n`], `${sourceId}.ndjson`)
}

describe('archive pack import', () => {
  it('commits a complete pack and refuses to overwrite the same source', async () => {
    const sourceId = `import-${Date.now()}-${Math.random()}`
    const result = await importArchivePack(pack(sourceId))
    expect(result).toMatchObject({ status: 'ready', conversationCount: 1, messageCount: 2 })
    expect(await getArchiveSource(sourceId)).toMatchObject({ status: 'ready' })
    expect((await listArchiveConversations(sourceId))[0]).toMatchObject({ title: '旧窗口' })
    await expect(importArchivePack(pack(sourceId))).rejects.toBeInstanceOf(ArchiveAlreadyImportedError)
    expect(await getArchiveSource(sourceId)).toMatchObject({ status: 'ready' })
  })

  it('rolls back an incomplete pack instead of leaving partial searchable data', async () => {
    const sourceId = `incomplete-${Date.now()}-${Math.random()}`
    await expect(importArchivePack(pack(sourceId, false))).rejects.toThrow('没有完成标记')
    expect(await getArchiveSource(sourceId)).toBeUndefined()
    expect(await listArchiveConversations(sourceId)).toEqual([])
  })
})
