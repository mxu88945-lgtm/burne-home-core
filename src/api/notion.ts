/**
 * Notion 云端读写 —— 仅接口定义 + 桩实现。
 *
 * 第三轮才实现。安全要求（务必遵守）：
 *   - token 只从 localStorage / Worker 代理读取，绝不写死在代码。
 *   - 推荐所有请求都走 proxyUrl（自建 Worker），让 token 不出现在前端。
 */

import type { MemoryItem, NotionSyncConfig } from '@/types/memory'

/** 拉取 Notion 上的记忆（待实现） */
export async function pullFromNotion(
  _config: NotionSyncConfig
): Promise<MemoryItem[]> {
  throw new Error('[notion] pullFromNotion 待第三轮实现')
}

/** 把本地记忆推送到 Notion（待实现） */
export async function pushToNotion(
  _config: NotionSyncConfig,
  _memories: MemoryItem[]
): Promise<{ pushed: number }> {
  throw new Error('[notion] pushToNotion 待第三轮实现')
}

/** 校验配置是否可用（待实现，例如 ping 一下 proxyUrl） */
export async function testNotionConnection(
  _config: NotionSyncConfig
): Promise<boolean> {
  throw new Error('[notion] testNotionConnection 待第三轮实现')
}
