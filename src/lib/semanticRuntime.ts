/**
 * 语义召回的接线层：读 store、调度后台增量索引、给聊天提供查询。
 * 开关关着（或渠道没选）时，这里的所有入口都直接返回，不发任何请求、不开向量库。
 */
import { useApiStore, type ApiChannel } from '@/store/apiStore'
import { useChatStore } from '@/store/chatStore'
import { useMemoryStore } from '@/store/memoryStore'
import { usePeopleStore } from '@/store/peopleStore'
import { useSemanticStore, type SemanticConfig } from '@/store/semanticStore'
import { useSyncStore } from '@/store/syncStore'
import { STORAGE_KEYS } from '@/lib/constants'
import { embedTexts } from '@/lib/embeddings'
import { isArchiveRecallEnabled } from '@/lib/archiveSettings'
import { listArchiveChunksForConversations, listArchiveConversations } from '@/lib/archiveDb'
import { buildAllSegments, type Segment } from '@/lib/semanticSegments'
import { idbVectorStore, type VectorRecord } from '@/lib/semanticVectorDb'
import { INDEX_BACKOFF_MS, runIndexPass } from '@/lib/semanticIndex'
import { SEMANTIC_CANDIDATES, semanticQueryText, semanticSearch, type SemanticHit } from '@/lib/semanticRecall'
import type { ArchiveChunk } from '@/types/archive'

export function semanticChannel(config: SemanticConfig = useSemanticStore.getState().config): ApiChannel | undefined {
  return useApiStore.getState().channels.find((c) => c.id === config.channelId)
}

/** 开关开着、渠道还在、模型填了，才算启用。 */
export function isSemanticReady(): boolean {
  const config = useSemanticStore.getState().config
  return Boolean(config.enabled && config.model.trim() && semanticChannel(config))
}

function routeOpts() {
  const sync = useSyncStore.getState().config
  return { workerUrl: sync.workerUrl?.trim(), syncKey: sync.syncKey }
}

/** 设置页「测试」：嵌入一句话，返回维度。 */
export async function testSemanticEmbedding(channel: ApiChannel, model: string): Promise<number> {
  const [vec] = await embedTexts(channel, model.trim(), ['测试一下语义召回'], routeOpts())
  return vec.length
}

/* ---------------- 向量缓存（召回时不必每轮读库） ---------------- */

let cache: { model: string; records: Map<string, VectorRecord> } | null = null

async function loadRecords(model: string): Promise<Iterable<VectorRecord>> {
  if (cache?.model === model) return cache.records.values()
  const all = await idbVectorStore.all(model)
  cache = { model, records: new Map(all.map((r) => [r.key, r])) }
  return cache.records.values()
}

function cachePut(model: string, records: VectorRecord[]) {
  if (cache?.model !== model) return
  records.forEach((r) => cache!.records.set(r.key, r))
}

function cacheRemove(model: string, keys: string[]) {
  if (cache?.model !== model) return
  keys.forEach((k) => cache!.records.delete(k))
}

/* ---------------- 查询 ---------------- */

/**
 * 本轮语义候选（未过滤上下文，最多 32 条，阈值以上）。
 * 关着时直接返回 []，不调用 fetch；超时 4 秒或失败也返回 []，聊天照常只用关键词。
 */
export async function semanticCandidates(userTexts: string[]): Promise<SemanticHit[]> {
  if (!isSemanticReady()) return []
  const config = useSemanticStore.getState().config
  const channel = semanticChannel(config)!
  const model = config.model.trim()
  return semanticSearch(semanticQueryText(userTexts), {
    embedQuery: async (text, signal) => (await embedTexts(channel, model, [text], { ...routeOpts(), signal }))[0],
    loadRecords: () => loadRecords(model),
    topK: SEMANTIC_CANDIDATES,
  })
}

/**
 * 去掉不该再召回的旧日原文：总开关关了、或那段旧会话已取消启用（向量可能还没来得及清）。
 */
export async function dropDisabledArchive(hits: SemanticHit[]): Promise<SemanticHit[]> {
  if (!hits.some((h) => h.record.source === 'archive')) return hits
  if (!isArchiveRecallEnabled()) return hits.filter((h) => h.record.source !== 'archive')
  try {
    const included = new Set((await listArchiveConversations()).filter((c) => c.included).map((c) => c.id))
    return hits.filter((h) => h.record.source !== 'archive' || included.has(String(h.record.meta.conversationId)))
  } catch {
    return hits.filter((h) => h.record.source !== 'archive')
  }
}

/** 查询 + 过滤旧日原文（聊天每轮、[搜索:] 都用这个）。关着时返回 []、不发请求。 */
export async function semanticLookup(userTexts: string[]): Promise<SemanticHit[]> {
  const hits = await semanticCandidates(userTexts)
  return hits.length ? dropDisabledArchive(hits) : hits
}

/* ---------------- 后台增量索引 ---------------- */

async function gatherSegments(model: string): Promise<Segment[]> {
  let archiveChunks: ArchiveChunk[] = []
  if (isArchiveRecallEnabled()) {
    try {
      const convs = await listArchiveConversations()
      archiveChunks = await listArchiveChunksForConversations(convs.filter((c) => c.included).map((c) => c.id))
    } catch {
      archiveChunks = []
    }
  }
  return buildAllSegments(
    {
      sessions: useChatStore.getState().sessions,
      archiveChunks,
      memories: useMemoryStore.getState().memories,
      people: usePeopleStore.getState().people,
    },
    model,
  )
}

function readBackoff(): number {
  const raw = Number(localStorage.getItem(STORAGE_KEYS.semanticBackoff) || 0)
  return Number.isFinite(raw) ? raw : 0
}

function writeBackoff(until: number) {
  try {
    if (until) localStorage.setItem(STORAGE_KEYS.semanticBackoff, String(until))
    else localStorage.removeItem(STORAGE_KEYS.semanticBackoff)
  } catch {
    /* noop */
  }
}

let running = false
let pending = false
let timer: ReturnType<typeof setTimeout> | undefined

async function runOnce(): Promise<void> {
  if (!isSemanticReady()) return
  const backoff = readBackoff()
  if (backoff > Date.now()) {
    useSemanticStore.getState().setProgress({ backoffUntil: backoff })
    return
  }
  const config = useSemanticStore.getState().config
  const channel = semanticChannel(config)!
  const model = config.model.trim()
  const set = useSemanticStore.getState().setProgress
  running = true
  set({ running: true, error: undefined })
  try {
    const segments = await gatherSegments(model)
    const result = await runIndexPass(segments, model, {
      store: idbVectorStore,
      embed: (texts) => embedTexts(channel, model, texts, routeOpts()),
      shouldContinue: () => {
        const c = useSemanticStore.getState().config
        return c.enabled && c.channelId === config.channelId && c.model.trim() === model
      },
      onProgress: (indexed, total) => set({ indexed, total }),
      onPut: (records) => cachePut(model, records),
      onRemove: (keys) => cacheRemove(model, keys),
    })
    if (result.error) {
      const until = Date.now() + INDEX_BACKOFF_MS
      writeBackoff(until)
      set({ error: result.error, backoffUntil: until })
    } else {
      writeBackoff(0)
      set({ backoffUntil: undefined })
    }
    set({ lastRunAt: Date.now() })
  } catch (e) {
    const until = Date.now() + INDEX_BACKOFF_MS
    writeBackoff(until)
    set({ error: (e as Error).message || '索引失败', backoffUntil: until })
  } finally {
    running = false
    set({ running: false })
  }
}

/** 安排一次后台增量索引（默认 3 秒后）。正在跑就记一笔，跑完再补一次。关着时什么也不做。 */
export function scheduleSemanticIndex(delayMs = 3000): void {
  if (!isSemanticReady()) return
  if (running) {
    pending = true
    return
  }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = undefined
    void runOnce().then(() => {
      if (pending) {
        pending = false
        scheduleSemanticIndex(5000)
      }
    })
  }, delayMs)
}

/** 「重建索引」：清空当前模型的向量，取消退避，马上重新建。 */
export async function rebuildSemanticIndex(): Promise<void> {
  const config = useSemanticStore.getState().config
  const model = config.model.trim()
  if (!model) return
  await idbVectorStore.clear(model)
  if (cache?.model === model) cache = null
  writeBackoff(0)
  useSemanticStore.getState().setProgress({ indexed: 0, error: undefined, backoffUntil: undefined })
  scheduleSemanticIndex(0)
}

/** 设置页打开时数一下「已建 N / M 段」，不发请求。 */
export async function refreshSemanticCounts(): Promise<void> {
  const config = useSemanticStore.getState().config
  const model = config.model.trim()
  if (!model) return
  try {
    const [segments, keys] = await Promise.all([gatherSegments(model), idbVectorStore.keys(model)])
    const indexed = segments.filter((s) => keys.has(s.key)).length
    const backoff = readBackoff()
    useSemanticStore.getState().setProgress({
      indexed,
      total: segments.length,
      backoffUntil: backoff > Date.now() ? backoff : undefined,
    })
  } catch {
    /* 统计失败不影响使用 */
  }
}
