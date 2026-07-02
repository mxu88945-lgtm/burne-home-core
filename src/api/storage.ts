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

export function writeJSON<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (err) {
    // ⚠️ 容量超限（iOS 每站约 5MB）时 setItem 会抛错——以前静默吞掉，
    // 结果是"页面照常跑、保存全失败、一刷新丢一大段"（惟惟丢过好多轮对话）。
    // 现在广播事件，main.tsx 里会大声警告用户。
    console.warn('[storage] 写入失败：', key, err)
    try {
      window.dispatchEvent(new CustomEvent('bw:storage-full', { detail: { key } }))
    } catch {
      /* noop */
    }
    return false
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}
