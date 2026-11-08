/**
 * 语义召回的向量库：独立 IndexedDB（不和档案库、读书库混在一起）。
 * key = 内容哈希（模型 + 片段原文），同一段文字只嵌入一次。
 * 向量存归一化后的 Float32Array，召回时余弦相似度 = 点积。
 */
import type { SegmentSource } from '@/lib/semanticSegments'

const DB_NAME = 'burne-semantic-vectors'
const DB_VERSION = 1
const STORE = 'vectors'

export interface VectorRecord {
  /** 内容哈希（含模型名） */
  key: string
  model: string
  dim: number
  vec: Float32Array
  source: SegmentSource
  /** 用于召回展示/过滤的原文（已截断） */
  text: string
  /** 片段来源的定位信息 */
  meta: Record<string, unknown>
  createdAt: number
}

let openPromise: Promise<IDBDatabase> | undefined

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
  })
}

function openDb(): Promise<IDBDatabase> {
  if (openPromise) return openPromise
  openPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('model', 'model')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      openPromise = undefined
      reject(req.error ?? new Error('打不开语义向量库'))
    }
  })
  return openPromise
}

export interface VectorStore {
  keys(model: string): Promise<Set<string>>
  all(model: string): Promise<VectorRecord[]>
  put(records: VectorRecord[]): Promise<void>
  remove(keys: string[]): Promise<void>
  clear(model: string): Promise<void>
}

export const idbVectorStore: VectorStore = {
  async keys(model) {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readonly')
    const keys = (await request(tx.objectStore(STORE).index('model').getAllKeys(IDBKeyRange.only(model)))) as string[]
    return new Set(keys)
  },
  async all(model) {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readonly')
    return (await request(tx.objectStore(STORE).index('model').getAll(IDBKeyRange.only(model)))) as VectorRecord[]
  },
  async put(records) {
    if (!records.length) return
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    records.forEach((r) => store.put(r))
    await done(tx)
  },
  async remove(keys) {
    if (!keys.length) return
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    keys.forEach((k) => store.delete(k))
    await done(tx)
  },
  async clear(model) {
    const keys = await idbVectorStore.keys(model)
    await idbVectorStore.remove([...keys])
  },
}

/** 归一化（L2）；全零向量原样返回。 */
export function normalize(v: ArrayLike<number>): Float32Array {
  let sum = 0
  for (let i = 0; i < v.length; i += 1) sum += v[i] * v[i]
  const n = Math.sqrt(sum) || 1
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i += 1) out[i] = v[i] / n
  return out
}

/** 两个已归一化向量的余弦相似度。维度不同返回 0。 */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || !a.length) return 0
  let s = 0
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i]
  return s
}
