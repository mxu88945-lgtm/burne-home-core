/**
 * Notion 云端读写 —— 客户端框架（plumbing 已就绪，字段映射第三轮完成）。
 *
 * 架构：前端不直接调 Notion，统一走 config.proxyUrl 指向的自建 Worker 代理。
 *   - 推荐：Notion token 作为 Worker 的 secret，前端一个密钥都不带。
 *   - 兼容：若本地存了 token（仅 localStorage），经 X-Notion-Token 头转发（HTTPS）。
 *   - 绝不把任何 token 写死在代码 / 提交仓库。
 *
 * 代理契约见 docs/ROADMAP.md。
 */

import type { MemoryItem, NotionSyncConfig } from '@/types/memory'

export interface NotionPullResult {
  memories: MemoryItem[]
}
export interface NotionPushResult {
  pushed: number
}

export class NotionConfigError extends Error {}

function ensureProxy(config: NotionSyncConfig): string {
  if (!config.proxyUrl) {
    throw new NotionConfigError('未配置 Notion Worker 代理地址')
  }
  return config.proxyUrl.replace(/\/+$/, '')
}

function buildHeaders(config: NotionSyncConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.databaseId) h['X-Notion-Database'] = config.databaseId
  // 仅当本地存有 token 时才携带；推荐让 Worker 自己持有 token。
  if (config.token) h['X-Notion-Token'] = config.token
  return h
}

/** 校验连通性（POST {proxy}/test） */
export async function testNotionConnection(
  config: NotionSyncConfig
): Promise<boolean> {
  const base = ensureProxy(config)
  const res = await fetch(`${base}/test`, {
    method: 'POST',
    headers: buildHeaders(config),
  })
  if (!res.ok) throw new Error(`连接失败：HTTP ${res.status}`)
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean }
  return data.ok !== false
}

/** 拉取（GET {proxy}/memories） */
export async function pullFromNotion(
  config: NotionSyncConfig
): Promise<MemoryItem[]> {
  const base = ensureProxy(config)
  const res = await fetch(`${base}/memories`, { headers: buildHeaders(config) })
  if (!res.ok) throw new Error(`拉取失败：HTTP ${res.status}`)
  const data = (await res.json()) as NotionPullResult
  // TODO(round3): 校验并把 Notion 属性映射成 MemoryItem
  return Array.isArray(data.memories) ? data.memories : []
}

/** 推送 / 更新（POST {proxy}/memories） */
export async function pushToNotion(
  config: NotionSyncConfig,
  memories: MemoryItem[]
): Promise<NotionPushResult> {
  const base = ensureProxy(config)
  const res = await fetch(`${base}/memories`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({ memories }),
  })
  if (!res.ok) throw new Error(`推送失败：HTTP ${res.status}`)
  // TODO(round3): 服务端做 upsert + 冲突处理，回填 notionPageId
  return (await res.json()) as NotionPushResult
}
