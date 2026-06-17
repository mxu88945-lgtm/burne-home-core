/**
 * 伯恩主屋 · 后端 Worker
 *
 * 一个 Worker 同时提供：
 *   1) 多端同步主库（KV 存储，多设备共享同一份记忆）
 *   2) 聊天 AI 中转（多渠道：Anthropic 官方 / OpenAI 兼容），key 作为 Worker secret
 *
 * 安全：所有密钥都是 Worker secret（wrangler secret put），绝不出现在前端 / 仓库。
 * 契约见 docs/ROADMAP.md。
 */

interface Env {
  MEMORY_KV: KVNamespace
  /** 可选：多端同步共享密钥（设了则校验 X-Sync-Key） */
  SYNC_KEY?: string

  /** 默认聊天渠道：'anthropic' | 'openai' */
  DEFAULT_PROVIDER?: string
  /** 默认模型（两渠道通用兜底） */
  MODEL?: string

  /* —— Anthropic 官方渠道 —— */
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_BASE_URL?: string // 默认 https://api.anthropic.com
  ANTHROPIC_MODEL?: string

  /* —— OpenAI 兼容渠道（也可指向你自己的网关）—— */
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string // 默认 https://api.openai.com/v1
  OPENAI_MODEL?: string
}

interface MemoryItem {
  id: string
  updatedAt: string
  deletedAt?: string
  [k: string]: unknown
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
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
      if (path === '/test' && req.method === 'POST') return json({ ok: true })
      if (path === '/chat' && req.method === 'POST') return await handleChat(req, env)

      const mGet = path.match(/^\/spaces\/([^/]+)\/memories$/)
      if (mGet && req.method === 'GET') {
        if (!authed(req, env)) return json({ error: 'unauthorized' }, { status: 401 })
        const id = decodeURIComponent(mGet[1])
        const list = ((await env.MEMORY_KV.get(`space:${id}`, 'json')) as MemoryItem[]) || []
        return json({ memories: list, serverTime: new Date().toISOString() })
      }

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
  if (!authed(req, env)) return json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as {
    messages?: ChatMessage[]
    system?: string
    provider?: string
    model?: string
  }
  const messages = (body.messages || []).filter((m) => m.content && m.content.trim())
  while (messages.length && messages[0].role !== 'user') messages.shift()
  if (!messages.length) return json({ reply: '' })

  // 选渠道：请求覆盖 > 默认配置 > 哪个 key 在就用哪个
  const provider = (
    body.provider ||
    env.DEFAULT_PROVIDER ||
    (env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai')
  ).toLowerCase()

  try {
    if (provider === 'anthropic') {
      return await callAnthropic(env, body.system || '', messages, body.model)
    }
    return await callOpenAI(env, body.system || '', messages, body.model)
  } catch (e) {
    return json({ error: `AI 调用失败：${(e as Error).message}` }, { status: 502 })
  }
}

/** Anthropic 官方 Messages API */
async function callAnthropic(
  env: Env,
  system: string,
  messages: ChatMessage[],
  modelOverride?: string
): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: '未配置 ANTHROPIC_API_KEY' }, { status: 400 })
  }
  const base = (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '')
  const model = modelOverride || env.ANTHROPIC_MODEL || env.MODEL || 'claude-sonnet-4-6'
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { content?: { text?: string }[] }
  const reply = Array.isArray(data.content) ? data.content.map((c) => c.text || '').join('') : ''
  return json({ reply, provider: 'anthropic', model })
}

/** OpenAI 兼容 Chat Completions（base URL 可指向你自己的网关） */
async function callOpenAI(
  env: Env,
  system: string,
  messages: ChatMessage[],
  modelOverride?: string
): Promise<Response> {
  if (!env.OPENAI_API_KEY) {
    return json({ error: '未配置 OPENAI_API_KEY' }, { status: 400 })
  }
  const base = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = modelOverride || env.OPENAI_MODEL || env.MODEL || 'gpt-4o-mini'
  const full = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model, messages: full, max_tokens: 1024 }),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const reply = data.choices?.[0]?.message?.content || ''
  return json({ reply, provider: 'openai', model })
}
