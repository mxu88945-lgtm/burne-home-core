/**
 * 多端同步客户端框架 —— 主库 = Cloudflare Worker + KV/D1。
 *
 * 目标：多设备共享同一份记忆。本地 localStorage 退化为离线缓存。
 * 合并逻辑（mergeMemories）本轮即可用、纯函数可测；
 * 网络部分 plumbing 已就绪，待主库 Worker 上线后即可联通。
 *
 * 契约见 docs/ROADMAP.md「0. 多端共享架构」。绝不在前端写死任何密钥。
 */

import type { MemoryItem } from '@/types/memory'

export interface SyncRemoteConfig {
  workerUrl?: string
  spaceId?: string
  /** 共享密钥，仅存本地、经 X-Sync-Key 头发送（HTTPS） */
  syncKey?: string
}

export interface SyncResult {
  memories: MemoryItem[]
  serverTime?: string
}

export class SyncConfigError extends Error {}

function ensure(config: SyncRemoteConfig): { base: string; space: string } {
  if (!config.workerUrl) throw new SyncConfigError('未配置同步 Worker 地址')
  if (!config.spaceId) throw new SyncConfigError('未配置 spaceId')
  return {
    base: config.workerUrl.replace(/\/+$/, ''),
    space: encodeURIComponent(config.spaceId),
  }
}

function headers(config: SyncRemoteConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.syncKey) h['X-Sync-Key'] = config.syncKey
  return h
}

/**
 * 逐条 last-write-wins 合并：同一 id 取 updatedAt 最新者，
 * 墓碑（deletedAt）也参与比较，让删除能在各端传播。
 * 纯函数，可直接用于本地多端冲突解决与离线合并。
 */
export function mergeMemories(
  a: MemoryItem[],
  b: MemoryItem[]
): MemoryItem[] {
  const byId = new Map<string, MemoryItem>()
  for (const item of [...a, ...b]) {
    const prev = byId.get(item.id)
    if (!prev || item.updatedAt >= prev.updatedAt) {
      byId.set(item.id, item)
    }
  }
  return [...byId.values()].sort((x, y) =>
    y.updatedAt.localeCompare(x.updatedAt)
  )
}

/** 过滤掉墓碑，得到可展示的记忆 */
export function visibleMemories(list: MemoryItem[]): MemoryItem[] {
  return list.filter((m) => !m.deletedAt)
}

/** 拉取远端快照（GET /spaces/{spaceId}/memories） */
export async function fetchRemote(
  config: SyncRemoteConfig
): Promise<SyncResult> {
  const { base, space } = ensure(config)
  const res = await fetch(`${base}/spaces/${space}/memories`, {
    headers: headers(config),
  })
  if (!res.ok) throw new Error(`拉取失败：HTTP ${res.status}`)
  const data = (await res.json()) as SyncResult
  return { memories: data.memories ?? [], serverTime: data.serverTime }
}

/** 增量合并（POST /spaces/{spaceId}/sync） */
export async function pushSync(
  config: SyncRemoteConfig,
  payload: { deviceId: string; since?: string; changes: MemoryItem[] }
): Promise<SyncResult> {
  const { base, space } = ensure(config)
  const res = await fetch(`${base}/spaces/${space}/sync`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`同步失败：HTTP ${res.status}`)
  const data = (await res.json()) as SyncResult
  return { memories: data.memories ?? [], serverTime: data.serverTime }
}

/**
 * 一次完整同步：拉取 → 合并本地 → 推送合并结果。
 * 返回合并后的权威集合，调用方据此覆盖本地缓存。
 */
export async function syncNow(
  config: SyncRemoteConfig,
  deviceId: string,
  local: MemoryItem[]
): Promise<MemoryItem[]> {
  const remote = await fetchRemote(config)
  const merged = mergeMemories(local, remote.memories)
  const pushed = await pushSync(config, { deviceId, changes: merged })
  // 以服务端返回为准（可能含其它端刚推上来的更新）
  return pushed.memories.length ? pushed.memories : merged
}
