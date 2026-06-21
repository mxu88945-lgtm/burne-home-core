/**
 * 文生图客户端。两种模式：
 *   - images：OpenAI 兼容 images/generations（DALL·E、gpt-image-1、兼容网关）。
 *   - chat：聊天接口出图（OpenRouter / Gemini，走 /chat/completions + modalities:image）。
 * 直连服务商，或经自己的 Worker 中转（解决跨域；端点见 worker 的 /image）。
 * 返回可直接用作 <img src> 的字符串（dataURL 或图片 URL）。
 */

import type { ImageGenConfig } from '@/store/imageGenStore'

interface ModelsResp {
  data?: { id: string; architecture?: { output_modalities?: string[] } }[]
  error?: { message?: string }
}

/** 列出可用模型；chat 模式只返回「支持图像输出」的，images 模式按名字筛出图相关的 */
export async function listImageModels(config: ImageGenConfig): Promise<string[]> {
  if (!config.apiKey.trim()) throw new Error('请先填 API Key')
  const base =
    config.baseUrl.trim().replace(/\/+$/, '') ||
    (config.mode === 'chat' ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1')
  const res = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${config.apiKey.trim()}` },
  })
  const data = (await res.json().catch(() => ({}))) as ModelsResp
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
  const all = data.data || []
  if (config.mode === 'chat') {
    const imgs = all
      .filter((m) => m.architecture?.output_modalities?.includes('image'))
      .map((m) => m.id)
    return imgs.length ? imgs : all.map((m) => m.id)
  }
  const named = all.map((m) => m.id).filter((id) => /image|dall|sd|stable|flux/i.test(id))
  return named.length ? named : all.map((m) => m.id)
}

export async function generateImage(
  config: ImageGenConfig,
  prompt: string,
  opts: { syncKey?: string } = {}
): Promise<string> {
  const p = prompt.trim()
  if (!p) throw new Error('请输入图片描述')
  if (config.viaWorker) return viaWorker(config, p, opts)
  return config.mode === 'chat' ? chatDirect(config, p) : imagesDirect(config, p)
}

/* ---------- images/generations ---------- */

interface ImageResp {
  data?: { b64_json?: string; url?: string }[]
  error?: { message?: string }
}

async function imagesDirect(config: ImageGenConfig, prompt: string): Promise<string> {
  if (!config.apiKey.trim()) throw new Error('请先在「设置 → 生成图片」填 API Key')
  const base = config.baseUrl.trim().replace(/\/+$/, '') || 'https://api.openai.com/v1'
  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey.trim()}` },
    body: JSON.stringify(imagesBody(config, prompt)),
  })
  const data = (await res.json().catch(() => ({}))) as ImageResp
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
  return pickImages(data)
}

function imagesBody(config: ImageGenConfig, prompt: string) {
  return {
    model: config.model.trim() || 'dall-e-3',
    prompt,
    n: 1,
    ...(config.size.trim() ? { size: config.size.trim() } : {}),
  }
}

function pickImages(data: ImageResp): string {
  const first = data.data?.[0]
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`
  if (first?.url) return first.url
  throw new Error('返回里没有图片数据')
}

/* ---------- chat 出图（OpenRouter / Gemini） ---------- */

interface ChatImgResp {
  choices?: {
    message?: {
      images?: { image_url?: { url?: string } }[]
      content?: unknown
    }
  }[]
  error?: { message?: string }
}

async function chatDirect(config: ImageGenConfig, prompt: string): Promise<string> {
  if (!config.apiKey.trim()) throw new Error('请先在「设置 → 生成图片」填 API Key')
  const base = config.baseUrl.trim().replace(/\/+$/, '') || 'https://openrouter.ai/api/v1'
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey.trim()}` },
    body: JSON.stringify(chatBody(config, prompt)),
  })
  const data = (await res.json().catch(() => ({}))) as ChatImgResp
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
  return pickChat(data)
}

function chatBody(config: ImageGenConfig, prompt: string) {
  return {
    model: config.model.trim() || 'google/gemini-2.5-flash-image-preview',
    messages: [{ role: 'user', content: prompt }],
    modalities: ['image', 'text'],
  }
}

function pickChat(data: ChatImgResp): string {
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url
  if (url) return url
  throw new Error('返回里没有图片（这个模型可能不支持出图）')
}

/* ---------- Worker 中转 ---------- */

async function viaWorker(
  config: ImageGenConfig,
  prompt: string,
  opts: { syncKey?: string }
): Promise<string> {
  const base = config.workerUrl.trim().replace(/\/+$/, '')
  if (!base) throw new Error('勾了 Worker 中转，但没填 Worker 地址')
  const res = await fetch(`${base}/image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.syncKey ? { 'X-Sync-Key': opts.syncKey } : {}),
    },
    body: JSON.stringify({
      mode: config.mode,
      prompt,
      ...(config.apiKey.trim() ? { apiKey: config.apiKey.trim() } : {}),
      ...(config.baseUrl.trim() ? { baseUrl: config.baseUrl.trim() } : {}),
      ...(config.mode === 'chat' ? chatBody(config, prompt) : imagesBody(config, prompt)),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as ImageResp & ChatImgResp
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
  return config.mode === 'chat' ? pickChat(data) : pickImages(data)
}
