import {
  getArchiveSource,
  putArchiveBatch,
  putArchiveSource,
  rollbackArchiveImport,
} from '@/lib/archiveDb'
import type {
  ArchiveChunk,
  ArchiveConversation,
  ArchiveImportProgress,
  ArchivePackLine,
  ArchiveSource,
} from '@/types/archive'
import { ARCHIVE_PACK_VERSION } from '@/types/archive'

const BATCH_SIZE = 120

export class ArchiveAlreadyImportedError extends Error {
  constructor(public readonly sourceId: string) {
    super('这份档案已经导入过了；现有数据没有被覆盖。')
    this.name = 'ArchiveAlreadyImportedError'
  }
}

async function* readLines(
  file: File,
  onBytes: (read: number) => void,
): AsyncGenerator<string> {
  if (!file.stream) {
    const text = await file.text()
    onBytes(file.size)
    for (const line of text.split(/\r?\n/u)) if (line.trim()) yield line
    return
  }
  const reader = file.stream().getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let bytesRead = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytesRead += value.byteLength
    onBytes(bytesRead)
    pending += decoder.decode(value, { stream: true })
    let newline = pending.indexOf('\n')
    while (newline >= 0) {
      const line = pending.slice(0, newline).trim()
      pending = pending.slice(newline + 1)
      if (line) yield line
      newline = pending.indexOf('\n')
    }
  }
  pending += decoder.decode()
  if (pending.trim()) yield pending.trim()
}

function parseLine(raw: string): ArchivePackLine {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('档案包中有一行不是合法 JSON')
  }
  if (!value || typeof value !== 'object' || !('type' in value)) {
    throw new Error('档案包缺少记录类型')
  }
  return value as ArchivePackLine
}

export async function importArchivePack(
  file: File,
  onProgress?: (progress: ArchiveImportProgress) => void,
): Promise<ArchiveSource> {
  let source: ArchiveSource | undefined
  let finalStats: Extract<ArchivePackLine, { type: 'end' }>['stats'] | undefined
  let bytesRead = 0
  let conversationCount = 0
  let chunkCount = 0
  const conversations: ArchiveConversation[] = []
  const chunks: ArchiveChunk[] = []

  const progress = (phase: ArchiveImportProgress['phase']) =>
    onProgress?.({
      bytesRead,
      totalBytes: file.size,
      conversations: conversationCount,
      chunks: chunkCount,
      phase,
    })

  const flush = async () => {
    if (!conversations.length && !chunks.length) return
    progress('writing')
    await putArchiveBatch(conversations.splice(0), chunks.splice(0))
    progress('reading')
  }

  try {
    for await (const raw of readLines(file, (read) => {
      bytesRead = read
      progress('reading')
    })) {
      const line = parseLine(raw)
      if (line.type === 'header') {
        if (source) throw new Error('档案包重复出现头部')
        if (line.format !== 'burne-memory-archive' || line.version !== ARCHIVE_PACK_VERSION) {
          throw new Error('档案包版本不兼容')
        }
        if (await getArchiveSource(line.source.id)) throw new ArchiveAlreadyImportedError(line.source.id)
        source = {
          ...line.source,
          formatVersion: line.version,
          importedAt: new Date().toISOString(),
          conversationCount: 0,
          includedConversationCount: 0,
          messageCount: 0,
          chunkCount: 0,
          status: 'importing',
        }
        await putArchiveSource(source)
        continue
      }
      if (!source) throw new Error('档案包头部缺失')
      if (line.type === 'conversation') {
        if (line.conversation.sourceId !== source.id) throw new Error('会话来源与档案包不一致')
        conversations.push(line.conversation)
        conversationCount += 1
      } else if (line.type === 'chunk') {
        if (line.chunk.sourceId !== source.id) throw new Error('原文切片来源与档案包不一致')
        chunks.push({ ...line.chunk, terms: line.chunk.terms.slice(0, 160) })
        chunkCount += 1
      } else if (line.type === 'end') {
        finalStats = line.stats
      }
      if (conversations.length + chunks.length >= BATCH_SIZE) await flush()
    }
    if (!source) throw new Error('没有读取到档案包头部')
    if (!finalStats) throw new Error('档案包没有完成标记，可能下载不完整')
    await flush()
    if (
      finalStats.conversationCount !== conversationCount ||
      finalStats.chunkCount !== chunkCount
    ) {
      throw new Error('档案包计数不一致，可能文件被截断')
    }
    const ready: ArchiveSource = { ...source, ...finalStats, status: 'ready' }
    await putArchiveSource(ready)
    bytesRead = file.size
    progress('done')
    return ready
  } catch (error) {
    if (source) {
      try {
        await rollbackArchiveImport(source.id)
      } catch {
        // 保留原始错误；下次打开页面会看到 importing 状态，仍不会进入召回。
      }
    }
    throw error
  }
}
