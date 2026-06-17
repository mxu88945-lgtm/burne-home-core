/**
 * 本地备份 / 恢复。
 * 纯本地、低风险，本轮即可用。导出文件可能含个人记忆内容，已在 .gitignore 忽略。
 */

import type { BackupFile, MemoryItem } from '@/types/memory'
import { BACKUP_VERSION } from '@/lib/constants'

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
