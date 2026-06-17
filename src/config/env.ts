/**
 * 环境变量统一读取入口。
 *
 * 只读取 VITE_ 前缀的变量。敏感 token 不在这里读 ——
 * token 走 localStorage / Worker 代理，绝不打进前端产物。
 */

export const env = {
  appTitle: import.meta.env.VITE_APP_TITLE ?? '伯恩主屋 · 长期记忆',
  /** Notion Worker 代理地址（可选，URL 里不应带密钥） */
  notionProxyUrl: import.meta.env.VITE_NOTION_PROXY_URL ?? '',
  /** Notion 数据库 ID（非敏感） */
  notionDatabaseId: import.meta.env.VITE_NOTION_DATABASE_ID ?? '',
  /** 多端同步主库 Worker 地址（非密钥） */
  syncWorkerUrl: import.meta.env.VITE_SYNC_WORKER_URL ?? '',
  /** 同步 spaceId（标识哪一份库） */
  syncSpaceId: import.meta.env.VITE_SYNC_SPACE_ID ?? '',
  isDev: import.meta.env.DEV,
}
