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

  /* —— MiniMax 海螺 TTS 中转（解决浏览器跨域）—— */
  MINIMAX_API_KEY?: string
  MINIMAX_GROUP_ID?: string
  MINIMAX_BASE_URL?: string // 默认 https://api.minimax.chat

  /* —— 文生图中转（OpenAI 兼容 images/generations）—— */
  IMAGE_API_KEY?: string
  IMAGE_BASE_URL?: string // 默认 https://api.openai.com/v1
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
      if (path === '/tts' && req.method === 'POST') return await handleTts(req, env)
      if (path === '/image' && req.method === 'POST') return await handleImage(req, env)

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
    baseUrl?: string
    apiKey?: string
    temperature?: number
    maxTokens?: number
  }
  const messages = (body.messages || []).filter((m) => m.content && m.content.trim())
  while (messages.length && messages[0].role !== 'user') messages.shift()
  if (!messages.length) return json({ reply: '' })

  const tuning = { temperature: body.temperature, maxTokens: body.maxTokens }

  // 选渠道：请求覆盖 > 默认配置 > 哪个 key 在就用哪个
  const provider = (
    body.provider ||
    env.DEFAULT_PROVIDER ||
    (env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai')
  ).toLowerCase()

  try {
    if (provider === 'anthropic') {
      return await callAnthropic(env, body.system || '', messages, body.model, body.baseUrl, body.apiKey, tuning)
    }
    return await callOpenAI(env, body.system || '', messages, body.model, body.baseUrl, body.apiKey, tuning)
  } catch (e) {
    return json({ error: `AI 调用失败：${(e as Error).message}` }, { status: 502 })
  }
}

/** Anthropic 官方 Messages API */
async function callAnthropic(
  env: Env,
  system: string,
  messages: ChatMessage[],
  modelOverride?: string,
  baseOverride?: string,
  keyOverride?: string,
  tuning?: { temperature?: number; maxTokens?: number }
): Promise<Response> {
  const key = keyOverride || env.ANTHROPIC_API_KEY
  if (!key) {
    return json({ error: '未配置 Anthropic key' }, { status: 400 })
  }
  const base = (baseOverride || env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '')
  const model = modelOverride || env.ANTHROPIC_MODEL || env.MODEL || 'claude-sonnet-4-6'
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: tuning?.maxTokens ?? 1024,
      ...(tuning?.temperature != null ? { temperature: tuning.temperature } : {}),
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
  modelOverride?: string,
  baseOverride?: string,
  keyOverride?: string,
  tuning?: { temperature?: number; maxTokens?: number }
): Promise<Response> {
  const key = keyOverride || env.OPENAI_API_KEY
  if (!key) {
    return json({ error: '未配置 OpenAI key' }, { status: 400 })
  }
  const base = (baseOverride || env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = modelOverride || env.OPENAI_MODEL || env.MODEL || 'gpt-4o-mini'
  const full = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: full,
      max_tokens: tuning?.maxTokens ?? 1024,
      ...(tuning?.temperature != null ? { temperature: tuning.temperature } : {}),
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const reply = data.choices?.[0]?.message?.content || ''
  return json({ reply, provider: 'openai', model })
}

/**
 * MiniMax 海螺 TTS 中转：前端 → Worker → MiniMax，返回 audio/mpeg 二进制。
 * Key/GroupId 优先用 Worker secret（MINIMAX_*），也接受前端覆盖。
 */
async function handleTts(req: Request, env: Env): Promise<Response> {
  if (!authed(req, env)) return json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as {
    text?: string
    groupId?: string
    apiKey?: string
    baseUrl?: string
    model?: string
    voice_setting?: unknown
    audio_setting?: unknown
  }
  const text = (body.text || '').trim()
  if (!text) return json({ error: '没有可朗读的文字' }, { status: 400 })

  const key = body.apiKey || env.MINIMAX_API_KEY
  const groupId = body.groupId || env.MINIMAX_GROUP_ID
  if (!key || !groupId)
    return json({ error: '缺少 MiniMax API Key 或 GroupId' }, { status: 400 })

  const base = (body.baseUrl || env.MINIMAX_BASE_URL || 'https://api.minimax.chat').replace(
    /\/+$/,
    ''
  )
  const res = await fetch(`${base}/v1/t2a_v2?GroupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: body.model || 'speech-01-turbo',
      text,
      stream: false,
      voice_setting: body.voice_setting || { voice_id: 'female-tianmei', speed: 1, vol: 1, pitch: 0 },
      audio_setting: body.audio_setting || {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
      },
    }),
  })
  if (!res.ok)
    return json({ error: `MiniMax ${res.status} ${(await res.text()).slice(0, 200)}` }, { status: 502 })

  const data = (await res.json()) as {
    data?: { audio?: string }
    base_resp?: { status_code?: number; status_msg?: string }
  }
  const code = data.base_resp?.status_code
  if (code && code !== 0)
    return json({ error: data.base_resp?.status_msg || `MiniMax 错误 ${code}` }, { status: 502 })
  const hex = data.data?.audio
  if (!hex) return json({ error: '返回里没有音频数据' }, { status: 502 })

  return new Response(hexToBytes(hex), {
    headers: { 'Content-Type': 'audio/mpeg', ...CORS },
  })
}

/**
 * 文生图中转：前端 → Worker → OpenAI 兼容 images/generations，原样回传 JSON。
 * Key 优先用 Worker secret（IMAGE_API_KEY），也接受前端覆盖。
 */
async function handleImage(req: Request, env: Env): Promise<Response> {
  if (!authed(req, env)) return json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as {
    prompt?: string
    apiKey?: string
    baseUrl?: string
    model?: string
    n?: number
    size?: string
  }
  if (!body.prompt || !body.prompt.trim()) return json({ error: '请输入图片描述' }, { status: 400 })

  const key = body.apiKey || env.IMAGE_API_KEY
  if (!key) return json({ error: '缺少文生图 API Key' }, { status: 400 })
  const base = (body.baseUrl || env.IMAGE_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')

  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: body.model || 'dall-e-3',
      prompt: body.prompt,
      n: body.n || 1,
      ...(body.size ? { size: body.size } : {}),
    }),
  })
  const data = await res.text()
  return new Response(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

/** hex 字符串 → 字节数组 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/\s+/g, '')
  const len = clean.length >> 1
  const out = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16)
  }
  return out
}
