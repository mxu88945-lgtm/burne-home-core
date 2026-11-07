/**
 * 独立旧日档案库。
 *
 * 这里保存的是可核对的旧对话原文切片，不等同于当前的结构化 MemoryItem。
 * 两套数据故意分仓：档案负责“找回当时说过什么”，记忆库负责“保存现在仍成立的事实”。
 */

export const ARCHIVE_PACK_VERSION = 1

export type ArchiveImportStatus = 'importing' | 'ready' | 'failed'

export interface ArchiveSource {
  id: string
  name: string
  formatVersion: number
  createdAt: string
  importedAt: string
  originalFiles: string[]
  bytes: number
  conversationCount: number
  includedConversationCount: number
  messageCount: number
  chunkCount: number
  firstMessageAt?: string
  lastMessageAt?: string
  status: ArchiveImportStatus
  error?: string
}

export interface ArchiveConversation {
  id: string
  sourceId: string
  title: string
  titleNormalized: string
  createdAt?: string
  updatedAt?: string
  messageCount: number
  chunkCount: number
  burneScore: number
  matchReasons: string[]
  /** 只有被启用的会话才允许进入主聊天召回。 */
  included: boolean
}

export interface ArchiveChunk {
  id: string
  sourceId: string
  conversationId: string
  title: string
  sequence: number
  startedAt?: string
  endedAt?: string
  /** 带角色标记的原文；不得由模型改写。 */
  text: string
  /** 指回原导出中的消息节点，便于证据核对。 */
  messageIds: string[]
  /** 有界关键词集合，供 IndexedDB multiEntry 索引使用。 */
  terms: string[]
}

export interface ArchivePackHeaderLine {
  type: 'header'
  format: 'burne-memory-archive'
  version: number
  source: Pick<
    ArchiveSource,
    'id' | 'name' | 'createdAt' | 'originalFiles' | 'bytes'
  >
}

export interface ArchivePackConversationLine {
  type: 'conversation'
  conversation: ArchiveConversation
}

export interface ArchivePackChunkLine {
  type: 'chunk'
  chunk: ArchiveChunk
}

export interface ArchivePackEndLine {
  type: 'end'
  stats: Pick<
    ArchiveSource,
    | 'conversationCount'
    | 'includedConversationCount'
    | 'messageCount'
    | 'chunkCount'
    | 'firstMessageAt'
    | 'lastMessageAt'
  >
}

export type ArchivePackLine =
  | ArchivePackHeaderLine
  | ArchivePackConversationLine
  | ArchivePackChunkLine
  | ArchivePackEndLine

export interface ArchiveRecallHit {
  chunkId: string
  conversationId: string
  title: string
  startedAt?: string
  endedAt?: string
  text: string
  messageIds: string[]
  score: number
  reasons: string[]
  /** 查询实际命中了谁的文字，避免把历史助手或第三方转述错认成当前角色亲历。 */
  matchedSpeaker?: 'user' | 'assistant' | 'mixed' | 'unknown'
  /** 多路主动检索时，记录是哪条联想查询找到的，便于准确截取证据附近原文。 */
  matchedQuery?: string
}

export interface ArchiveRecallResult {
  query: string
  hits: ArchiveRecallHit[]
  prompt: string
  candidateCount: number
}

export interface ArchiveImportProgress {
  bytesRead: number
  totalBytes: number
  conversations: number
  chunks: number
  phase: 'reading' | 'writing' | 'done'
}
