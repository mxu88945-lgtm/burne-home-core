import type {
  ArchiveChunk,
  ArchiveConversation,
  ArchiveSource,
} from '@/types/archive'

const DB_NAME = 'burne-memory-archive'
const DB_VERSION = 1
const SOURCES = 'sources'
const CONVERSATIONS = 'conversations'
const CHUNKS = 'chunks'

let openPromise: Promise<IDBDatabase> | undefined

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
  })
}

export function openArchiveDb(): Promise<IDBDatabase> {
  if (openPromise) return openPromise
  openPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(SOURCES)) {
        db.createObjectStore(SOURCES, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(CONVERSATIONS)) {
        const store = db.createObjectStore(CONVERSATIONS, { keyPath: 'id' })
        store.createIndex('sourceId', 'sourceId')
        store.createIndex('included', 'included')
      }
      if (!db.objectStoreNames.contains(CHUNKS)) {
        const store = db.createObjectStore(CHUNKS, { keyPath: 'id' })
        store.createIndex('sourceId', 'sourceId')
        store.createIndex('conversationId', 'conversationId')
        store.createIndex('terms', 'terms', { multiEntry: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      openPromise = undefined
      reject(req.error ?? new Error('打不开独立档案库'))
    }
  })
  return openPromise
}

export async function getArchiveSource(id: string): Promise<ArchiveSource | undefined> {
  const db = await openArchiveDb()
  const tx = db.transaction(SOURCES, 'readonly')
  return (await request(tx.objectStore(SOURCES).get(id))) as ArchiveSource | undefined
}

export async function listArchiveSources(): Promise<ArchiveSource[]> {
  const db = await openArchiveDb()
  const tx = db.transaction(SOURCES, 'readonly')
  const rows = (await request(tx.objectStore(SOURCES).getAll())) as ArchiveSource[]
  return rows.sort((a, b) => b.importedAt.localeCompare(a.importedAt))
}

export async function putArchiveSource(source: ArchiveSource): Promise<void> {
  const db = await openArchiveDb()
  const tx = db.transaction(SOURCES, 'readwrite')
  tx.objectStore(SOURCES).put(source)
  await transactionDone(tx)
}

export async function putArchiveBatch(
  conversations: ArchiveConversation[],
  chunks: ArchiveChunk[],
): Promise<void> {
  if (!conversations.length && !chunks.length) return
  const db = await openArchiveDb()
  const tx = db.transaction([CONVERSATIONS, CHUNKS], 'readwrite')
  const conversationStore = tx.objectStore(CONVERSATIONS)
  const chunkStore = tx.objectStore(CHUNKS)
  conversations.forEach((item) => conversationStore.put(item))
  chunks.forEach((item) => chunkStore.put(item))
  await transactionDone(tx)
}

function deleteByIndex(index: IDBIndex, sourceId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cursor = index.openKeyCursor(IDBKeyRange.only(sourceId))
    cursor.onerror = () => reject(cursor.error ?? new Error('清理未完成导入失败'))
    cursor.onsuccess = () => {
      const row = cursor.result
      if (!row) {
        resolve()
        return
      }
      index.objectStore.delete(row.primaryKey)
      row.continue()
    }
  })
}

/** 仅用于回滚本轮尚未完成的导入；页面不提供误删完整档案的入口。 */
export async function rollbackArchiveImport(sourceId: string): Promise<void> {
  const db = await openArchiveDb()
  const tx = db.transaction([SOURCES, CONVERSATIONS, CHUNKS], 'readwrite')
  const tasks = [
    deleteByIndex(tx.objectStore(CONVERSATIONS).index('sourceId'), sourceId),
    deleteByIndex(tx.objectStore(CHUNKS).index('sourceId'), sourceId),
  ]
  tx.objectStore(SOURCES).delete(sourceId)
  await Promise.all(tasks)
  await transactionDone(tx)
}

export async function listArchiveConversations(sourceId?: string): Promise<ArchiveConversation[]> {
  const db = await openArchiveDb()
  const tx = db.transaction(CONVERSATIONS, 'readonly')
  const store = tx.objectStore(CONVERSATIONS)
  const rows = sourceId
    ? ((await request(store.index('sourceId').getAll(sourceId))) as ArchiveConversation[])
    : ((await request(store.getAll())) as ArchiveConversation[])
  return rows.sort(
    (a, b) =>
      Number(b.included) - Number(a.included) ||
      b.burneScore - a.burneScore ||
      (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
  )
}

export async function setArchiveConversationIncluded(id: string, included: boolean): Promise<void> {
  const db = await openArchiveDb()
  const tx = db.transaction(CONVERSATIONS, 'readwrite')
  const store = tx.objectStore(CONVERSATIONS)
  const current = (await request(store.get(id))) as ArchiveConversation | undefined
  if (!current) throw new Error('找不到这段旧会话')
  store.put({ ...current, included })
  await transactionDone(tx)
}

export async function getArchiveChunksByTerms(
  terms: string[],
  perTerm = 120,
): Promise<ArchiveChunk[]> {
  if (!terms.length) return []
  const db = await openArchiveDb()
  const tx = db.transaction(CHUNKS, 'readonly')
  const index = tx.objectStore(CHUNKS).index('terms')
  const batches = await Promise.all(
    terms.map((term) => request(index.getAll(IDBKeyRange.only(term), perTerm)) as Promise<ArchiveChunk[]>),
  )
  const unique = new Map<string, ArchiveChunk>()
  batches.flat().forEach((item) => unique.set(item.id, item))
  return [...unique.values()]
}
