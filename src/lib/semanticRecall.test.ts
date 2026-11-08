import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatSession } from '@/store/chatStore'
import type { MemoryItem } from '@/types/memory'
import type { ArchiveChunk, ArchiveConversation } from '@/types/archive'
import {
  SEG_MAX_CHARS,
  buildAllSegments,
  contentHash,
  segmentKey,
  segmentSession,
  type Segment,
} from '@/lib/semanticSegments'
import { normalize, type VectorRecord, type VectorStore } from '@/lib/semanticVectorDb'
import { INDEX_BATCH_SIZE, runIndexPass } from '@/lib/semanticIndex'
import {
  FUSE,
  SEMANTIC_THRESHOLD,
  archiveHitsFromSemantic,
  chatBoostMap,
  fuseScore,
  memoryBoostMap,
  personEventBlock,
  selectTurnHits,
  semanticQueryText,
  semanticSearch,
  topSemantic,
  type SemanticHit,
} from '@/lib/semanticRecall'
import { recallCrossSessions } from '@/lib/crossSessionRecall'
import { recallMemories } from '@/lib/memoryRecall'

class MapStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, String(value)) }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MapStorage(), configurable: true })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const ts = (d: number, h = 21) => new Date(2026, 10, d, h).getTime()
const msg = (id: string, role: 'me' | 'companion', text: string, d = 2) => ({ id, role, text, at: '', ts: ts(d) })

function rec(key: string, vec: number[], source: VectorRecord['source'], meta: Record<string, unknown>, text = ''): VectorRecord {
  return { key, model: 'm', dim: vec.length, vec: normalize(vec), source, text, meta, createdAt: 0 }
}

function memStore(initial: VectorRecord[] = []): VectorStore & { data: Map<string, VectorRecord> } {
  const data = new Map(initial.map((r) => [r.key, r]))
  return {
    data,
    keys: async () => new Set(data.keys()),
    all: async () => [...data.values()],
    put: async (rs) => rs.forEach((r) => data.set(r.key, r)),
    remove: async (ks) => ks.forEach((k) => data.delete(k)),
    clear: async () => data.clear(),
  }
}

/* ---------------- 切片 ---------------- */

describe('segmentSession', () => {
  it('groups 2–4 adjacent messages, keeps ids/date, skips the unfinished tail', () => {
    const long = '她今天说了很多关于工作室和小鸡的事情'.repeat(10) // ~170 字
    const session: ChatSession = {
      id: 's1', title: 't', createdAt: '', updatedAt: '',
      messages: [
        msg('a', 'me', long), msg('b', 'companion', long), // 340 字 ≥300 → 收段
        msg('c', 'me', '短'), // 1 字，跳过
        msg('d', 'me', '我们去看海吧'), msg('e', 'companion', '好呀'), msg('f', 'me', '明天'), msg('g', 'companion', '嗯嗯'), // 满 4 条收段
        msg('h', 'me', '尾巴还在聊'), // 不足 2 条的尾巴
      ],
    }
    const segs = segmentSession(session, 'm')
    expect(segs).toHaveLength(2)
    expect(segs[0].meta.msgIds).toEqual(['a', 'b'])
    expect(segs[0].meta.sessionId).toBe('s1')
    expect(segs[0].meta.ts).toBe(ts(2))
    expect(segs[0].text.startsWith('她：')).toBe(true)
    expect(segs[0].text).toContain('\n他：')
    expect(segs[1].meta.msgIds).toEqual(['d', 'e', 'f', 'g'])
    expect(segmentSession(session, 'm', { includeTail: true })).toHaveLength(3)
  })

  it('never lets a segment of several messages grow past ~600 chars', () => {
    const t = '字'.repeat(250)
    const session: ChatSession = {
      id: 's', title: '', createdAt: '', updatedAt: '',
      messages: [msg('1', 'me', t), msg('2', 'companion', t), msg('3', 'me', t), msg('4', 'companion', t)],
    }
    for (const s of segmentSession(session, 'm')) {
      const ids = s.meta.msgIds as string[]
      expect(ids.length).toBeGreaterThanOrEqual(2)
      expect(ids.length * 250).toBeLessThanOrEqual(SEG_MAX_CHARS)
    }
  })

  it('earlier segment boundaries (and hashes) are stable when new messages arrive', () => {
    const base: ChatSession = {
      id: 's', title: '', createdAt: '', updatedAt: '',
      messages: [msg('1', 'me', '一'.repeat(200)), msg('2', 'companion', '二'.repeat(200))],
    }
    const before = segmentSession(base, 'm').map((s) => s.key)
    const after = segmentSession({ ...base, messages: [...base.messages, msg('3', 'me', '三三'), msg('4', 'companion', '四四')] }, 'm').map((s) => s.key)
    expect(after.slice(0, before.length)).toEqual(before)
  })
})

/* ---------------- 哈希去重 ---------------- */

describe('content hash dedupe', () => {
  it('hash depends on model and text only', () => {
    expect(contentHash('abc')).toBe(contentHash('abc'))
    expect(segmentKey('m', '你好')).toBe(segmentKey('m', '你好'))
    expect(segmentKey('m', '你好')).not.toBe(segmentKey('n', '你好'))
    expect(segmentKey('m', '你好')).not.toBe(segmentKey('m', '你好呀'))
  })

  it('buildAllSegments drops identical text from different places', () => {
    const mem = (id: string): MemoryItem => ({ id, title: '小鸡', content: '她养了九只玄凤', kind: 'long', source: 'auto', starred: false, tags: [], createdAt: '', updatedAt: '' })
    const segs = buildAllSegments({ sessions: [], archiveChunks: [], memories: [mem('x'), mem('y'), { ...mem('z'), deletedAt: 'x' }], people: [] }, 'm')
    expect(segs).toHaveLength(1)
    expect(segs[0].meta.memoryId).toBe('x')
  })

  it('runIndexPass embeds only missing keys, in batches of ≤32, with gaps, then prunes stale', async () => {
    const segs: Segment[] = Array.from({ length: 70 }, (_, i) => ({ key: `k${i}`, source: 'memory', text: `t${i}`, meta: { memoryId: `m${i}` } }))
    const store = memStore([rec('k0', [1, 0], 'memory', {}), rec('k1', [1, 0], 'memory', {}), rec('stale', [1, 0], 'memory', {})])
    const batches: number[] = []
    const sleeps: number[] = []
    const progress: Array<[number, number]> = []
    const r = await runIndexPass(segs, 'm', {
      store,
      embed: async (texts) => {
        batches.push(texts.length)
        return texts.map(() => [3, 4])
      },
      sleep: async (ms) => { sleeps.push(ms) },
      onProgress: (a, b) => progress.push([a, b]),
    })
    expect(batches.every((n) => n <= INDEX_BATCH_SIZE)).toBe(true)
    expect(batches.reduce((a, b) => a + b, 0)).toBe(68) // k0、k1 已有，不重复嵌入
    expect(sleeps.length).toBe(batches.length - 1)
    expect(r).toMatchObject({ indexed: 70, total: 70, embedded: 68, pruned: 1 })
    expect(store.data.has('stale')).toBe(false)
    expect(progress[0]).toEqual([2, 70])
    const v = store.data.get('k5')!.vec
    expect(v[0]).toBeCloseTo(0.6)
    // 再跑一遍：全部已建，不再请求
    batches.length = 0
    await runIndexPass(segs, 'm', { store, embed: async (t) => (batches.push(t.length), t.map(() => [1, 1])), sleep: async () => {} })
    expect(batches).toEqual([])
  })

  it('stops on the first failed batch and reports the error (caller backs off)', async () => {
    const segs: Segment[] = Array.from({ length: 40 }, (_, i) => ({ key: `k${i}`, source: 'memory', text: `t${i}`, meta: {} }))
    const store = memStore()
    let calls = 0
    const r = await runIndexPass(segs, 'm', {
      store,
      embed: async (t) => {
        calls += 1
        if (calls === 2) throw new Error('HTTP 429')
        return t.map(() => [1, 2])
      },
      sleep: async () => {},
    })
    expect(r.error).toBe('HTTP 429')
    expect(r.indexed).toBe(32)
    expect(store.data.size).toBe(32)
  })
})

/* ---------------- 阈值 / topK ---------------- */

describe('topSemantic threshold', () => {
  it('keeps ≥0.55, drops below, sorts and caps at top K', () => {
    const q = [1, 0]
    const angle = (cos: number) => [cos, Math.sqrt(1 - cos * cos)]
    const records = [
      rec('hi', angle(0.9), 'memory', {}),
      rec('edge', angle(0.56), 'memory', {}),
      rec('low', angle(0.54), 'memory', {}),
      rec('dim3', [1, 0, 0], 'memory', {}),
    ]
    const hits = topSemantic(q, records)
    expect(SEMANTIC_THRESHOLD).toBeCloseTo(0.55)
    expect(hits.map((h) => h.record.key)).toEqual(['hi', 'edge'])
    expect(topSemantic(q, records, { topK: 1 }).map((h) => h.record.key)).toEqual(['hi'])
  })

  it('semanticQueryText uses only the last 1–2 messages', () => {
    expect(semanticQueryText(['一', '二', '三'])).toBe('二\n三')
  })
})

/* ---------------- 超时回退 ---------------- */

describe('semanticSearch fallback', () => {
  it('returns [] after the 4s timeout (keyword-only) and aborts the request', async () => {
    vi.useFakeTimers()
    let aborted = false
    const p = semanticSearch('还记得那次看海吗', {
      embedQuery: (_t, signal) => new Promise(() => { signal.addEventListener('abort', () => { aborted = true }) }),
      loadRecords: async () => [rec('a', [1, 0], 'memory', {})],
    })
    await vi.advanceTimersByTimeAsync(4000)
    await expect(p).resolves.toEqual([])
    expect(aborted).toBe(true)
  })

  it('returns [] when the embedding call fails, hits when it works', async () => {
    const records = [rec('a', [1, 0], 'memory', { memoryId: 'x' })]
    expect(await semanticSearch('q', { embedQuery: async () => { throw new Error('401') }, loadRecords: async () => records })).toEqual([])
    const hits = await semanticSearch('q', { embedQuery: async () => [2, 0], loadRecords: async () => records })
    expect(hits[0].score).toBeCloseTo(1)
  })
})

/* ---------------- 合并打分 ---------------- */

describe('fused scoring', () => {
  it('fuseScore adds nothing below threshold and scales with similarity', () => {
    expect(fuseScore(3, 0.5, FUSE.chat)).toBe(3)
    expect(fuseScore(3, undefined, FUSE.chat)).toBe(3)
    expect(fuseScore(0, 0.55, FUSE.chat)).toBeCloseTo(2)
    expect(fuseScore(0, 1, FUSE.chat)).toBeCloseTo(6)
    expect(fuseScore(2, 0.8, FUSE.chat)).toBeGreaterThan(fuseScore(0, 0.8, FUSE.chat))
  })

  const sessions: ChatSession[] = [
    {
      id: 'old', title: '旧', createdAt: '', updatedAt: '',
      messages: [
        msg('o0', 'companion', '今天过得怎么样'),
        msg('o1', 'me', '我想去海边吹吹风'), // 语义相关、关键词不中
        msg('o2', 'companion', '那周末带你去'),
        msg('o3', 'me', '小鸡今天又把垫子咬坏了'),
        msg('o4', 'companion', '它们真调皮'),
      ],
    },
    { id: 'now', title: '今', createdAt: '', updatedAt: '', messages: [msg('n1', 'me', '好想看大海', 8)] },
  ]

  it('semantic-only chat hit enters cross-window recall with ±1 neighbours, dated', () => {
    const inCtx = new Set(['n1'])
    const plain = recallCrossSessions({ sessions, activeId: 'now', inContextIds: inCtx, userQueries: ['好想看大海'], meName: '她', aiName: '伯恩', now: new Date(2026, 10, 8) })
    expect(plain.text).not.toContain('海边')
    const hits: SemanticHit[] = [{ record: rec('seg', [1], 'chat', { sessionId: 'old', msgIds: ['o1', 'o2'] }), score: 0.8 }]
    const boost = chatBoostMap(hits, sessions, inCtx)
    expect([...boost.keys()]).toEqual(['o1']) // 锚点选她自己说的那条
    const r = recallCrossSessions({ sessions, activeId: 'now', inContextIds: inCtx, userQueries: ['好想看大海'], meName: '她', aiName: '伯恩', now: new Date(2026, 10, 8), semanticBoost: boost })
    expect(r.text).toContain('11月2日 她说：我想去海边吹吹风')
    expect(r.text).toContain('11月2日 他说：今天过得怎么样') // 前 1 条
    expect(r.text).toContain('11月2日 他说：那周末带你去') // 后 1 条
    expect(r.text).not.toContain('垫子')
  })

  it('keyword + semantic on the same message ranks above keyword-only (dedup by message)', () => {
    const s: ChatSession[] = [{
      id: 'x', title: '', createdAt: '', updatedAt: '',
      messages: [msg('k1', 'me', '玄凤小鸡今天很乖'), msg('k2', 'companion', '嗯'), msg('k3', 'companion', '……'), msg('k4', 'me', '玄凤小鸡今天咬人')],
    }]
    const boost = new Map([['k4', fuseScore(0, 0.9, FUSE.chat)]])
    const r = recallCrossSessions({ sessions: s, activeId: 'y', inContextIds: new Set(), userQueries: ['玄凤小鸡'], meName: '她', aiName: '伯恩', maxHits: 1, semanticBoost: boost })
    expect(r.hits).toBe(1)
    expect(r.text).toContain('咬人')
    expect(r.text).not.toContain('很乖')
  })

  it('segments fully inside the current context are filtered before top K', () => {
    const hits: SemanticHit[] = [
      { record: rec('a', [1], 'chat', { msgIds: ['n1'] }), score: 0.99 },
      { record: rec('b', [1], 'chat', { msgIds: ['o1', 'o2'] }), score: 0.7 },
      { record: rec('c', [1], 'archive', { conversationId: 'off' }), score: 0.7 },
    ]
    expect(selectTurnHits(hits, new Set(['n1'])).map((h) => h.record.key)).toEqual(['b', 'c'])
    expect(selectTurnHits(hits, new Set(['n1']), { allowedConversationIds: new Set(['on']) }).map((h) => h.record.key)).toEqual(['b'])
  })

  it('memory semantic boost lifts a memory with no keyword overlap', () => {
    const m = (id: string, content: string): MemoryItem => ({ id, title: '', content, kind: 'long', source: 'auto', starred: false, tags: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' })
    const memories = [m('a', '她喜欢唱歌'), m('b', '她怕打雷')]
    const boost = memoryBoostMap([{ record: rec('x', [1], 'memory', { memoryId: 'b' }), score: 0.85 }])
    const r = recallMemories({ query: '外面雷声好大', scope: 'chat', memories, maxItems: 1, now: new Date(2026, 0, 2), semanticBoost: boost })
    expect(r.text).toContain('她怕打雷')
    expect(r.diagnostic.used[0].reason).toContain('语义相近')
  })

  it('person event block skips people already injected and deleted events', () => {
    const people = [
      { id: 'p1', name: '裴屿', aliases: [], background: '', createdAt: '', updatedAt: '', events: [{ id: 'e1', date: '2026-11-01', text: '在学吉他', createdAt: '' }] },
      { id: 'p2', name: '顾屿', aliases: [], background: '', createdAt: '', updatedAt: '', events: [] },
    ]
    const hits: SemanticHit[] = [
      { record: rec('1', [1], 'person', { personId: 'p1', eventId: 'e1' }), score: 0.7 },
      { record: rec('2', [1], 'person', { personId: 'p2', eventId: 'gone' }), score: 0.7 },
    ]
    expect(personEventBlock(hits, people, new Set())).toContain('裴屿（2026-11-01）：在学吉他')
    expect(personEventBlock(hits, people, new Set(['p1']))).toBe('')
  })
})

/* ---------------- 旧日原文合并（IDB） ---------------- */

describe('archive merge', () => {
  it('semantic archive hit merges with keyword hit by chunkId (score adds, no duplicate)', async () => {
    const { putArchiveBatch } = await import('@/lib/archiveDb')
    const { recallArchiveQueries } = await import('@/lib/archiveRecall')
    const { buildArchiveTerms } = await import('@/lib/archiveTokens')
    const conv: ArchiveConversation = { id: 'sc1', sourceId: 'src', title: '旧', titleNormalized: '旧', messageCount: 2, chunkCount: 2, burneScore: 1, matchReasons: [], included: true }
    const chunk = (id: string, text: string): ArchiveChunk => ({ id, sourceId: 'src', conversationId: 'sc1', title: '旧', sequence: 0, startedAt: '2025-12-20T12:00:00', text, messageIds: [], terms: buildArchiveTerms('旧', text) })
    await putArchiveBatch([conv], [chunk('semA', '用户原话：冬天一起看雪'), chunk('semB', '用户原话：冬天喝热可可')])
    const extra = archiveHitsFromSemantic([
      { record: rec('x', [1], 'archive', { chunkId: 'semB', conversationId: 'sc1', title: '旧', startedAt: '2025-12-20T12:00:00' }, '用户原话：冬天喝热可可'), score: 0.9 },
    ])
    const r = await recallArchiveQueries(['冬天'], { maxHits: 5, extraHits: extra })
    const ids = r.hits.map((h) => h.chunkId)
    expect(ids.filter((id) => id === 'semB')).toHaveLength(1)
    expect(ids[0]).toBe('semB')
    expect(r.hits[0].reasons).toContain('语义相近')
    expect(r.prompt).toContain('12月20日 她说：冬天喝热可可')
  })
})

/* ---------------- 开关关闭不调用 ---------------- */

describe('disabled = no calls', () => {
  it('semanticLookup / scheduleSemanticIndex never call fetch when the switch is off', async () => {
    vi.resetModules()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.useFakeTimers()
    const { useApiStore } = await import('@/store/apiStore')
    const { useSemanticStore } = await import('@/store/semanticStore')
    const rt = await import('@/lib/semanticRuntime')
    const ch = useApiStore.getState().addChannel({ name: '硅基', provider: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', apiKey: 'sk', model: '' })
    useSemanticStore.getState().update({ channelId: ch.id })
    expect(useSemanticStore.getState().config.enabled).toBe(false) // 默认关
    expect(rt.isSemanticReady()).toBe(false)
    expect(await rt.semanticLookup(['还记得吗'])).toEqual([])
    rt.scheduleSemanticIndex(0)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('when on, the query goes to {base}/embeddings with the channel key and model', async () => {
    vi.resetModules()
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.1, 0.2] }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    const { useApiStore } = await import('@/store/apiStore')
    const { useSemanticStore } = await import('@/store/semanticStore')
    const rt = await import('@/lib/semanticRuntime')
    const ch = useApiStore.getState().addChannel({ name: '硅基', provider: 'openai', baseUrl: 'https://api.siliconflow.cn/v1/', apiKey: 'sk-1', model: '' })
    useSemanticStore.getState().update({ channelId: ch.id, enabled: true })
    expect(await rt.testSemanticEmbedding(ch, 'BAAI/bge-m3')).toBe(2)
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.siliconflow.cn/v1/embeddings')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-1')
    expect(JSON.parse(String(init.body))).toEqual({ model: 'BAAI/bge-m3', input: ['测试一下语义召回'] })
  })
})

describe('embedTexts routing', () => {
  it('via-worker channel falls back to direct when the old worker has no /embeddings', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      if (url.startsWith('https://w.example')) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      return new Response(JSON.stringify({ data: [{ index: 1, embedding: [2] }, { index: 0, embedding: [1] }] }), { status: 200 })
    }))
    const { embedTexts } = await import('@/lib/embeddings')
    const out = await embedTexts(
      { id: 'c', name: '', provider: 'openai', baseUrl: 'https://api.x/v1', apiKey: 'k', model: '', viaWorker: true },
      'm', ['a', 'b'], { workerUrl: 'https://w.example/' },
    )
    expect(calls).toEqual(['https://w.example/embeddings', 'https://api.x/v1/embeddings'])
    expect(out).toEqual([[1], [2]]) // 按 index 排序
  })

  it('anthropic channel is rejected without a request', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const { embedTexts } = await import('@/lib/embeddings')
    await expect(embedTexts({ id: 'a', name: '', provider: 'anthropic', baseUrl: 'x', apiKey: 'k', model: '' }, 'm', ['a'])).rejects.toThrow('Anthropic')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('[搜索:] with semantic', () => {
  it('adds semantic chat + memory hits; without semantic it behaves as before', async () => {
    const { runModelSearch } = await import('@/lib/modelSearch')
    const sessions: ChatSession[] = [{
      id: 'old', title: '旧', createdAt: '', updatedAt: '',
      messages: [msg('a', 'me', '那天在江边吹了好久的风'), msg('b', 'companion', '下次还陪你去')],
    }]
    const memories: MemoryItem[] = [{ id: 'm1', title: '', content: '她喜欢傍晚散步', kind: 'long', source: 'auto', starred: false, tags: [], createdAt: '', updatedAt: '' }]
    const base = { query: '看海', sessions, activeId: 'now', inContextIds: new Set<string>(), memories, people: [], meName: '她', aiName: '伯恩', now: new Date(2026, 10, 8), archiveSearch: async () => '' }
    const plain = await runModelSearch(base)
    expect(plain.found).toBe(false)
    const semantic = vi.fn(async () => [
      { record: rec('s', [1], 'chat', { sessionId: 'old', msgIds: ['a', 'b'] }), score: 0.8 },
      { record: rec('m', [1], 'memory', { memoryId: 'm1' }), score: 0.7 },
    ] as SemanticHit[])
    const r = await runModelSearch({ ...base, semantic })
    expect(semantic).toHaveBeenCalledWith('看海')
    expect(r.found).toBe(true)
    expect(r.text).toContain('11月2日 她说：那天在江边吹了好久的风')
    expect(r.text).toContain('她喜欢傍晚散步')
    expect(r.memoryIds).toEqual(['m1'])
  })
})
