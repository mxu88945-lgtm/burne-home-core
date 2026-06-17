/**
 * 本地存储封装（localStorage）。
 * 这一轮提供可用的读写工具，stores 会用到。
 */

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    // 容量超限 / 隐私模式等情况下静默失败，避免崩页
    console.warn('[storage] 写入失败：', err)
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}
