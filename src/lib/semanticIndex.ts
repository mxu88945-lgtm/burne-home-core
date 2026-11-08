/**
 * 语义索引的增量构建（纯逻辑 + 可注入依赖）：
 * 只嵌入向量库里还没有的片段（按内容哈希去重），每批最多 32 条，批间留间隔；
 * 任何一批失败就停下，交给调用方退避。全部建完后顺手清掉已不存在的旧片段。
 */
import type { Segment } from '@/lib/semanticSegments'
import { normalize, type VectorRecord, type VectorStore } from '@/lib/semanticVectorDb'

export const INDEX_BATCH_SIZE = 32
export const INDEX_BATCH_GAP_MS = 1500
export const INDEX_BACKOFF_MS = 30 * 60 * 1000

export interface IndexDeps {
  store: VectorStore
  embed: (texts: string[]) => Promise<number[][]>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  /** 每批之前检查一次：开关被关掉 / 渠道换了就停 */
  shouldContinue?: () => boolean
  onProgress?: (indexed: number, total: number) => void
  onPut?: (records: VectorRecord[]) => void
  onRemove?: (keys: string[]) => void
}

export interface IndexResult {
  indexed: number
  total: number
  embedded: number
  pruned: number
  error?: string
  stopped?: boolean
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function runIndexPass(
  segments: Segment[],
  model: string,
  deps: IndexDeps,
  opts: { batchSize?: number; gapMs?: number } = {},
): Promise<IndexResult> {
  const batchSize = Math.max(1, Math.min(INDEX_BATCH_SIZE, opts.batchSize ?? INDEX_BATCH_SIZE))
  const gap = opts.gapMs ?? INDEX_BATCH_GAP_MS
  const sleep = deps.sleep ?? defaultSleep
  const now = deps.now ?? Date.now
  const total = segments.length
  const existing = await deps.store.keys(model)
  const missing = segments.filter((s) => !existing.has(s.key))
  let indexed = total - missing.length
  let embedded = 0
  deps.onProgress?.(indexed, total)

  let dim = 0
  for (let i = 0; i < missing.length; i += batchSize) {
    if (deps.shouldContinue && !deps.shouldContinue()) return { indexed, total, embedded, pruned: 0, stopped: true }
    const batch = missing.slice(i, i + batchSize)
    try {
      const vectors = await deps.embed(batch.map((s) => s.text))
      if (vectors.length !== batch.length) throw new Error('向量条数和片段条数对不上')
      const records: VectorRecord[] = batch.map((s, j) => {
        const v = vectors[j]
        if (!dim) dim = v.length
        if (v.length !== dim) throw new Error('同一批向量维度不一致')
        return { key: s.key, model, dim: v.length, vec: normalize(v), source: s.source, text: s.text, meta: s.meta, createdAt: now() }
      })
      await deps.store.put(records)
      deps.onPut?.(records)
      embedded += records.length
      indexed += records.length
      deps.onProgress?.(indexed, total)
    } catch (e) {
      return { indexed, total, embedded, pruned: 0, error: (e as Error).message || '嵌入失败' }
    }
    if (i + batchSize < missing.length) await sleep(gap)
  }

  // 全部建完：清理已不存在的片段（删掉的消息/记忆、被取消启用的旧会话）
  const current = new Set(segments.map((s) => s.key))
  const stale = [...existing].filter((k) => !current.has(k))
  if (stale.length) {
    try {
      await deps.store.remove(stale)
      deps.onRemove?.(stale)
    } catch {
      /* 清理失败不影响召回：召回时会按原数据校验 */
    }
  }
  return { indexed, total, embedded, pruned: stale.length }
}
