/**
 * 伯恩主屋 · 后端 Worker
 *
 * 一个 Worker 同时提供：
 *   1) 多端同步主库（KV 存储，多设备共享同一份记忆）
 *   2) 聊天 AI 中转（把请求转发给 Anthropic，API key 作为 Worker secret）
 *
 * 安全：所有密钥都是 Worker secret（wrangler secret put），绝不出现在前端 / 仓库。
 * 契约见 docs/ROADMAP.md。
 */

interface Env {
  MEMORY_KV: KVNamespace
  /** 可选：多端同步共享密钥（设了则校验 X-Sync-Key） */
  SYNC_KEY?: string
  /** 可选：启用聊天所需的 Anthropic API key */
  ANTHROPIC_API_KEY?: string
  /** 聊天模型，可在 wrangler.toml 调整 */
  MODEL?: string
}

interface MemoryItem {
  id: string
  updatedAt: string
  deletedAt?: string
  [k: string]: unknown
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Key',
  'Access-Control-Max-Age': '86400',
}

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...CORS, ...(init.headers as object) },
  })
}

/** 逐条 last-write-wins 合并（含墓碑），与前端 mergeMemories 同策略 */
function merge(a: MemoryItem[], b: MemoryItem[]): MemoryItem[] {
  const m = new Map<string, MemoryItem>()
  for (const it of [...a, ...b]) {
    const prev = m.get(it.id)
    if (!prev || it.updatedAt >= prev.updatedAt) m.set(it.id, it)
  }
  return [...m.values()]
}

function authed(req: Request, env: Env): boolean {
  if (!env.SYNC_KEY) return true
  return (req.headers.get('X-Sync-Key') || '') === env.SYNC_KEY
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
    const url = new URL(req.url)
    const path = url.pathname.replace(/\/+$/, '')

    try {
      // 健康检查 / 同步连通性
      if (path === '/test' && req.method === 'POST') return json({ ok: true })

      // 聊天中转
      if (path === '/chat' && req.method === 'POST') return await handleChat(req, env)

      // 拉取快照
      const mGet = path.match(/^\/spaces\/([^/]+)\/memories$/)
      if (mGet && req.method === 'GET') {
        if (!authed(req, env)) return json({ error: 'unauthorized' }, { status: 401 })
        const id = decodeURIComponent(mGet[1])
        const list = ((await env.MEMORY_KV.get(`space:${id}`, 'json')) as MemoryItem[]) || []
        return json({ memories: list, serverTime: new Date().toISOString() })
      }

      // 增量合并
      const mSync = path.match(/^\/spaces\/([^/]+)\/sync$/)
      if (mSync && req.method === 'POST') {
        if (!authed(req, env)) return json({ error: 'unauthorized' }, { status: 401 })
        const id = decodeURIComponent(mSync[1])
        const body = (await req.json()) as { changes?: MemoryItem[] }
        const existing = ((await env.MEMORY_KV.get(`space:${id}`, 'json')) as MemoryItem[]) || []
        const merged = merge(existing, body.changes || [])
        await env.MEMORY_KV.put(`space:${id}`, JSON.stringify(merged))
        return json({ memories: merged, serverTime: new Date().toISOString() })
      }

      return json({ error: 'not found' }, { status: 404 })
    } catch (e) {
      return json({ error: String((e as Error).message || e) }, { status: 500 })
    }
  },
}

async function handleChat(req: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: '聊天未启用：Worker 缺少 ANTHROPIC_API_KEY' }, { status: 400 })
  }
  if (!authed(req, env)) return json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as {
    messages?: { role: string; content: string }[]
    system?: string
  }
  const messages = (body.messages || []).filter((m) => m.content && m.content.trim())
  // Anthropic 要求首条为 user
  while (messages.length && messages[0].role !== 'user') messages.shift()
  if (!messages.length) return json({ reply: '' })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.MODEL || 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: body.system || '',
      messages,
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    return json({ error: `AI 调用失败：${res.status} ${t.slice(0, 200)}` }, { status: 502 })
  }
  const data = (await res.json()) as { content?: { text?: string }[] }
  const reply = Array.isArray(data.content)
    ? data.content.map((c) => c.text || '').join('')
    : ''
  return json({ reply })
}
