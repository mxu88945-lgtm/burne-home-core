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
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >
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
      if (path === '/models' && req.method === 'POST') return await handleModels(req, env)
      if (path === '/tts' && req.method === 'POST') return await handleTts(req, env)
      if (path === '/stt' && req.method === 'POST') return await handleStt(req, env)
      if (path === '/clone' && req.method === 'POST') return await handleClone(req, env)
      if (path === '/image' && req.method === 'POST') return await handleImage(req, env)
      // 图片中转：角色卡里的海外图床（catbox 等）国内连不上，让 Worker 代取。
      // GET /img?u=<encodeURIComponent(https://files.catbox.moe/xxx.png)>
      if (path === '/img' && req.method === 'GET') {
        const u = url.searchParams.get('u') || ''
        let target: URL
        try {
          target = new URL(u)
        } catch {
          return json({ error: 'bad url' }, { status: 400 })
        }
        // 只放行常见卡图床，避免变成任意站点的免费代理
        const ALLOW_HOSTS = ['files.catbox.moe', 'catbox.moe', 'i.imgur.com', 'files.charhub.io', 'avatars.charhub.io']
        if (target.protocol !== 'https:' || !ALLOW_HOSTS.includes(target.hostname)) {
          return json({ error: 'host not allowed' }, { status: 403 })
        }
        const r = await fetch(target.toString(), { cf: { cacheEverything: true, cacheTtl: 86400 } } as RequestInit)
        if (!r.ok) return json({ error: `upstream ${r.status}` }, { status: 502 })
        const ct = r.headers.get('Content-Type') || 'application/octet-stream'
        if (!/^image\//i.test(ct)) return json({ error: 'not an image' }, { status: 502 })
        return new Response(r.body, {
          headers: { ...CORS, 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' },
        })
      }

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
  const messages = (body.messages || []).filter((m) =>
    typeof m.content === 'string' ? m.content.trim() : Array.isArray(m.content) && m.content.length,
  )
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
      messages: messages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === 'string'
            ? m.content
            : m.content.map((part) => {
                if (part.type === 'text') return part
                const match = /^data:(.+?);base64,(.*)$/.exec(part.image_url.url)
                return {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: match?.[1] || 'image/jpeg',
                    data: match?.[2] || '',
                  },
                }
              }),
      })),
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { content?: { text?: string }[] }
  const reply = Array.isArray(data.content) ? data.content.map((c) => c.text || '').join('') : ''
  return json({ reply, provider: 'anthropic', model })
}

/** 拉取模型列表中转（解决 https 页面无法直连 http 上游的混合内容拦截） */
async function handleModels(req: Request, env: Env): Promise<Response> {
  let body: { provider?: string; baseUrl?: string; apiKey?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }
  const provider = body.provider || env.DEFAULT_PROVIDER || 'openai'
  try {
    if (provider === 'anthropic') {
      const key = body.apiKey || env.ANTHROPIC_API_KEY
      if (!key) return json({ error: '未提供 API key' }, { status: 400 })
      const base = (body.baseUrl || env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '')
      const res = await fetch(`${base}/v1/models`, {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      })
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
      const data = (await res.json()) as { data?: { id: string }[] }
      return json({ models: (data.data || []).map((m) => m.id).filter(Boolean) })
    }
    // openai 兼容
    const key = body.apiKey || env.OPENAI_API_KEY
    if (!key) return json({ error: '未提供 API key' }, { status: 400 })
    const base = (body.baseUrl || env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
    const res = await fetch(`${base}/models`, {
      headers: { authorization: `Bearer ${key}` },
    })
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
    const data = (await res.json()) as { data?: { id: string }[] }
    return json({ models: (data.data || []).map((m) => m.id).filter(Boolean) })
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 502 })
  }
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
 * 语音转文字(STT) 中转：前端上传录音(multipart) → Worker → OpenAI 兼容 /audio/transcriptions → { text }
 * Key 优先用前端覆盖（apiKey），其次 Worker secret（OPENAI_API_KEY）。
 */
async function handleStt(req: Request, env: Env): Promise<Response> {
  if (!authed(req, env)) return json({ error: 'unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as unknown as File | null
  const apiKey = (form.get('apiKey') as string) || env.OPENAI_API_KEY
  const baseUrl = ((form.get('baseUrl') as string) || env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
    /\/+$/,
    ''
  )
  const model = (form.get('model') as string) || 'whisper-1'
  const language = (form.get('language') as string) || ''
  if (!file) return json({ error: '没有收到录音文件' }, { status: 400 })
  if (!apiKey) return json({ error: '缺少 STT API Key' }, { status: 400 })

  const fwd = new FormData()
  fwd.append('file', file, file.name || 'audio.webm')
  fwd.append('model', model)
  if (language) fwd.append('language', language)

  const res = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: fwd,
  })
  const t = await res.text()
  if (!res.ok) return json({ error: `STT ${res.status} ${t.slice(0, 200)}` }, { status: 502 })
  let text = ''
  try {
    text = ((JSON.parse(t) as { text?: string }).text || '').trim()
  } catch {
    text = t.trim()
  }
  return json({ text })
}

/**
 * 海螺声音克隆中转：上传录音 → file_id → voice_clone，返回 { voice_id }。
 * Key/GroupId 优先前端覆盖，其次 Worker secret（MINIMAX_*）。
 */
async function handleClone(req: Request, env: Env): Promise<Response> {
  if (!authed(req, env)) return json({ error: 'unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as unknown as File | null
  const apiKey = (form.get('apiKey') as string) || env.MINIMAX_API_KEY
  const groupId = (form.get('groupId') as string) || env.MINIMAX_GROUP_ID
  const baseUrl = ((form.get('baseUrl') as string) || env.MINIMAX_BASE_URL || 'https://api.minimax.chat').replace(
    /\/+$/,
    ''
  )
  const voiceId = (form.get('voiceId') as string) || `bw${Date.now()}`
  if (!file) return json({ error: '没有收到录音文件' }, { status: 400 })
  if (!apiKey || !groupId) return json({ error: '缺少 MiniMax API Key 或 GroupId' }, { status: 400 })

  // 1) 上传录音拿 file_id
  const up = new FormData()
  up.append('purpose', 'voice_clone')
  up.append('file', file, file.name || 'voice.m4a')
  const upRes = await fetch(`${baseUrl}/v1/files/upload?GroupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: up,
  })
  const upText = await upRes.text()
  if (!upRes.ok) return json({ error: `上传失败 ${upRes.status} ${upText.slice(0, 200)}` }, { status: 502 })
  const upCode = upText.match(/"status_code"\s*:\s*(\d+)/)
  const upMsg = upText.match(/"status_msg"\s*:\s*"([^"]+)"/)
  if (upCode && upCode[1] !== '0') return json({ error: upMsg?.[1] || '上传失败' }, { status: 502 })
  const idM = upText.match(/"file_id"\s*:\s*"?(\d+)"?/)
  if (!idM) return json({ error: '没拿到 file_id' }, { status: 502 })
  const fileId = idM[1]

  // 2) voice_clone（file_id 是 int64，内联避免精度丢失）
  const clRes = await fetch(`${baseUrl}/v1/voice_clone?GroupId=${encodeURIComponent(groupId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: `{"file_id":${fileId},"voice_id":"${voiceId}"}`,
  })
  const clText = await clRes.text()
  if (!clRes.ok) return json({ error: `克隆失败 ${clRes.status} ${clText.slice(0, 200)}` }, { status: 502 })
  const clCode = clText.match(/"status_code"\s*:\s*(\d+)/)
  const clMsg = clText.match(/"status_msg"\s*:\s*"([^"]+)"/)
  if (clCode && clCode[1] !== '0') return json({ error: clMsg?.[1] || '克隆失败' }, { status: 502 })
  return json({ voice_id: voiceId })
}

/**
 * 文生图中转：前端 → Worker → OpenAI 兼容 images/generations，原样回传 JSON。
 * Key 优先用 Worker secret（IMAGE_API_KEY），也接受前端覆盖。
 */
async function handleImage(req: Request, env: Env): Promise<Response> {
  if (!authed(req, env)) return json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as {
    mode?: 'images' | 'chat'
    prompt?: string
    apiKey?: string
    baseUrl?: string
    model?: string
    n?: number
    size?: string
    messages?: unknown
    modalities?: unknown
  }
  if (!body.prompt || !body.prompt.trim()) return json({ error: '请输入图片描述' }, { status: 400 })

  const key = body.apiKey || env.IMAGE_API_KEY
  if (!key) return json({ error: '缺少文生图 API Key' }, { status: 400 })

  // chat 模式（OpenRouter/Gemini）走 /chat/completions；否则 images/generations
  if (body.mode === 'chat') {
    const base = (body.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: body.model || 'google/gemini-2.5-flash-image-preview',
        messages: body.messages || [{ role: 'user', content: body.prompt }],
        modalities: body.modalities || ['image', 'text'],
      }),
    })
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

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
  return new Response(await res.text(), {
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
