/**
 * 大型 JSON 状态存 IndexedDB，localStorage 只保留一个很小的 `idb:` 引用。
 *
 * 迁移顺序刻意是「先写 IDB，成功后再替换 localStorage」，避免搬家中途丢数据。
 * 写入按 key 串行，防止连续操作时较旧的异步写反而最后落盘。
 */

import { idbGet, idbSet } from '@/lib/idb'

const queues = new Map<string, Promise<void>>()
const failures = new Set<string>()

function refFor(localKey: string): string {
  return `idb:state:${localKey}`
}

function idbKeyFor(localKey: string): string {
  return refFor(localKey).slice(4)
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** 模块初始化时只读取尚未迁移的旧数据；已迁移状态由启动 hydration 恢复。 */
export function readLargeJSONSync<T>(localKey: string, fallback: T): T {
  const value = parse<T | string>(localStorage.getItem(localKey))
  return typeof value === 'string' && value.startsWith('idb:') ? fallback : (value ?? fallback) as T
}

/** 启动时读取；若发现旧 localStorage 大对象，会先安全迁移到 IndexedDB。 */
export async function loadLargeJSON<T>(localKey: string, fallback: T): Promise<T> {
  const value = parse<T | string>(localStorage.getItem(localKey))
  if (typeof value === 'string' && value.startsWith('idb:')) {
    const stored = await idbGet<T>(value.slice(4))
    if (stored == null) throw new Error(`大型本地数据缺失：${localKey}`)
    return stored
  }
  if (value != null) {
    await idbSet(idbKeyFor(localKey), value)
    localStorage.setItem(localKey, JSON.stringify(refFor(localKey)))
    return value as T
  }
  return (await idbGet<T>(idbKeyFor(localKey))) ?? fallback
}

/**
 * 状态已经在内存中更新；这里把快照排队写入 IDB。
 * localStorage 引用同步写入，IDB 失败时沿用上一份完整快照并广播警告。
 */
export function writeLargeJSON<T>(localKey: string, value: T): boolean {
  try {
    localStorage.setItem(localKey, JSON.stringify(refFor(localKey)))
  } catch (err) {
    console.warn('[large-storage] 写入引用失败：', localKey, err)
    return false
  }
  const previous = queues.get(localKey) ?? Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(() => idbSet(idbKeyFor(localKey), value))
    .then(() => {
      failures.delete(localKey)
    })
    .catch((err) => {
      failures.add(localKey)
      console.warn('[large-storage] IndexedDB 写入失败：', localKey, err)
      try {
        window.dispatchEvent(new CustomEvent('bw:storage-write-failed', { detail: { key: localKey } }))
      } catch {
        /* noop */
      }
    })
  queues.set(localKey, next)
  return true
}

/** 测试/备份前可等待当前排队写入完成。 */
export async function flushLargeStorage(): Promise<void> {
  await Promise.all([...queues.values()].map((p) => p.catch(() => undefined)))
  if (failures.size) throw new Error(`以下本地数据尚未写入成功：${[...failures].join('、')}`)
}
