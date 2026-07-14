/**
 * 本地备份 / 恢复。
 * 纯本地、低风险，本轮即可用。导出文件可能含个人记忆内容，已在 .gitignore 忽略。
 */

import type { BackupFile, MemoryItem } from '@/types/memory'
import { BACKUP_VERSION } from '@/lib/constants'
import { idbGet, idbSet } from '@/lib/idb'

/** 打包成备份对象 */
export function buildBackup(memories: MemoryItem[]): BackupFile {
  return {
    app: 'burne-home-core',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    memories,
  }
}

/** 触发浏览器下载备份文件 */
export function downloadBackup(memories: MemoryItem[]): void {
  const data = buildBackup(memories)
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `burne-home-${stamp}.memory-backup.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 解析并校验上传的备份文件，失败抛错 */
export function parseBackup(raw: string): BackupFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('文件不是合法的 JSON')
  }
  const obj = parsed as Partial<BackupFile>
  if (obj?.app !== 'burne-home-core') {
    throw new Error('不是本应用的备份文件')
  }
  if (!Array.isArray(obj.memories)) {
    throw new Error('备份文件缺少 memories 数组')
  }
  return {
    app: 'burne-home-core',
    version: typeof obj.version === 'number' ? obj.version : BACKUP_VERSION,
    exportedAt: obj.exportedAt ?? new Date().toISOString(),
    memories: obj.memories as MemoryItem[],
  }
}

/** 读取 File 对象内容为文本 */
export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsText(file)
  })
}

/* ============================================================
   整包备份：导出全部本地数据（记忆 + 设置 + 人设 + 渠道…）
   默认剔除敏感密钥，更安全。
   ============================================================ */

const NS_PREFIX = 'burne-home-core:'

export interface FullBackup {
  app: 'burne-home-core'
  kind: 'full'
  version: number
  exportedAt: string
  store: Record<string, unknown>
  /** IndexedDB 图片/文件本体；key 不含 `idb:` 前缀。旧备份可没有此字段。 */
  idb?: Record<string, unknown>
}

/** 去掉敏感密钥（API key / 同步密钥 / Notion token） */
function sanitize(store: Record<string, unknown>) {
  const api = store[`${NS_PREFIX}api`] as { channels?: { apiKey?: string }[] } | undefined
  if (api?.channels) api.channels = api.channels.map((c) => ({ ...c, apiKey: '' }))
  const sync = store[`${NS_PREFIX}sync`] as { syncKey?: string } | undefined
  if (sync) delete sync.syncKey
  const notion = store[`${NS_PREFIX}notion-config`] as { token?: string } | undefined
  if (notion) delete notion.token
}

function collectIdbKeys(value: unknown, keys: Set<string>): void {
  if (typeof value === 'string' && value.startsWith('idb:')) {
    keys.add(value.slice(4))
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectIdbKeys(item, keys))
    return
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => collectIdbKeys(item, keys))
  }
}

export async function buildFullBackup(includeKeys: boolean): Promise<FullBackup> {
  const store: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(NS_PREFIX)) continue
    const raw = localStorage.getItem(k)
    if (raw == null) continue
    try {
      store[k] = JSON.parse(raw)
    } catch {
      store[k] = raw
    }
  }
  if (!includeKeys) sanitize(store)
  const keys = new Set<string>()
  collectIdbKeys(store, keys)
  const idb: Record<string, unknown> = {}
  await Promise.all(
    [...keys].map(async (key) => {
      const value = await idbGet<unknown>(key)
      if (value != null) idb[key] = value
    }),
  )
  return {
    app: 'burne-home-core',
    kind: 'full',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    store,
    idb,
  }
}

export async function downloadFullBackup(includeKeys: boolean): Promise<void> {
  const data = await buildFullBackup(includeKeys)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `burne-home-${stamp}.backup.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function parseFullBackup(raw: string): FullBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('文件不是合法的 JSON')
  }
  const obj = parsed as Partial<FullBackup>
  if (obj?.app !== 'burne-home-core' || obj.kind !== 'full' || !obj.store) {
    throw new Error('不是本应用的整包备份文件')
  }
  return {
    app: 'burne-home-core',
    kind: 'full',
    version: typeof obj.version === 'number' ? obj.version : BACKUP_VERSION,
    exportedAt: obj.exportedAt ?? new Date().toISOString(),
    store: obj.store as Record<string, unknown>,
    idb: obj.idb && typeof obj.idb === 'object' ? (obj.idb as Record<string, unknown>) : undefined,
  }
}

/** 写回本地（覆盖）。调用方应在之后刷新页面以重载状态。 */
export async function applyFullBackup(b: FullBackup): Promise<void> {
  for (const [k, v] of Object.entries(b.store)) {
    if (!k.startsWith(NS_PREFIX)) continue
    localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
  await Promise.all(Object.entries(b.idb ?? {}).map(([key, value]) => idbSet(key, value)))
}
