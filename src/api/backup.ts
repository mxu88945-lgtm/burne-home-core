/**
 * 本地备份 / 恢复 —— 接口定义 + 桩实现。
 * 第二轮起逐步实现。导出文件可能含个人记忆内容，已在 .gitignore 忽略。
 */

import type { BackupFile, MemoryItem } from '@/types/memory'
import { BACKUP_VERSION } from '@/lib/constants'

/** 把记忆打包成备份对象（已可用，导出时调用） */
export function buildBackup(memories: MemoryItem[]): BackupFile {
  return {
    app: 'burne-home-core',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    memories,
  }
}

/** 触发浏览器下载备份文件（待第二轮接到按钮） */
export function downloadBackup(_memories: MemoryItem[]): void {
  throw new Error('[backup] downloadBackup 待第二轮实现')
}

/** 解析并校验上传的备份文件（待第二轮实现） */
export function parseBackup(_raw: string): BackupFile {
  throw new Error('[backup] parseBackup 待第二轮实现')
}
