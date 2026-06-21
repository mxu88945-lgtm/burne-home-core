/**
 * 伯恩主屋版 · 长期记忆系统 —— 核心数据结构
 *
 * 这一层是整个系统的地基：记忆条目、摘要、同步状态、隐私锁。
 * 后续「记忆库页面」「Notion 同步」「备份/恢复」都基于这些类型。
 */

/** 记忆分类：长期（重要、持久）/ 短期（日常、近期） */
export type MemoryKind =
  | 'long' // 长期记忆
  | 'short' // 短期记忆

/** 记忆来源 */
export type MemorySource =
  | 'manual' // 手动新增
  | 'auto' // 自动捕获
  | 'notion' // 从 Notion 同步而来
  | 'import' // 从备份导入

/** 单条记忆 */
export interface MemoryItem {
  id: string
  /** 标题（短摘要，列表展示用） */
  title: string
  /** 正文内容 */
  content: string
  kind: MemoryKind
  source: MemorySource
  /** 是否核心（标星）。core 类天然为 true，普通记忆也可被标星提升 */
  starred: boolean
  /** 标签，便于检索与跨窗口回忆 */
  tags: string[]
  /**
   * 跨窗口回忆上下文：标记这条记忆产生/关联的「窗口」或「会话」。
   * 用于「跨窗口回忆」功能 —— 在新窗口里召回旧窗口的记忆。
   */
  windowId?: string
  createdAt: string // ISO 字符串
  updatedAt: string // ISO 字符串
  /**
   * 软删除墓碑（多端同步用）：设了 deletedAt 表示已删除，
   * 仍保留条目以便把「删除」这件事传播到其它设备。展示层需过滤掉。
   * 第三轮把 memoryStore 的删除改为写此字段。
   */
  deletedAt?: string
  /** Notion 页面 ID（同步后回填，用于双向更新） */
  notionPageId?: string
}

/** 新建记忆时的输入（id / 时间戳由系统生成） */
export type NewMemoryInput = Pick<MemoryItem, 'title' | 'content'> &
  Partial<Pick<MemoryItem, 'kind' | 'source' | 'starred' | 'tags' | 'windowId'>>

/** 记忆摘要（摘要区展示用，可由系统聚合生成） */
export interface MemorySummary {
  total: number
  longCount: number
  shortCount: number
  /** 最近更新时间 */
  lastUpdatedAt?: string
  /** 一句话总览（后续可接 AI 生成，这一轮先留字段） */
  headline?: string
}

/** 搜索过滤条件 */
export interface MemoryFilter {
  keyword?: string
  kind?: MemoryKind | 'all'
  starredOnly?: boolean
  tags?: string[]
}

/** 同步状态 */
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

/** Notion 同步配置（敏感字段只存本地，绝不进仓库） */
export interface NotionSyncConfig {
  /** 是否启用 Notion 同步 */
  enabled: boolean
  /** Worker 代理地址（推荐，避免 token 暴露在前端） */
  proxyUrl?: string
  /** 目标数据库 ID（非敏感） */
  databaseId?: string
  /**
   * ⚠️ token 只存浏览器本地（localStorage），不写死、不提交。
   * 实际项目里更推荐走 Worker 代理，让 token 完全不出现在前端。
   */
  token?: string
  lastSyncedAt?: string
}

/** 备份文件结构 */
export interface BackupFile {
  app: 'burne-home-core'
  version: number
  exportedAt: string
  memories: MemoryItem[]
}

/** 隐私锁状态 */
export interface PrivacyLockState {
  /** 是否启用隐私锁 */
  enabled: boolean
  /** 是否已解锁（运行时状态，不持久化） */
  unlocked: boolean
}
