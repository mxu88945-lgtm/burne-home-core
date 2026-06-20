/**
 * 文生图客户端 —— OpenAI 兼容 images/generations。
 * 直连服务商，或经自己的 Worker 中转（解决跨域；端点见 worker/src/index.ts 的 /image）。
 * 返回可直接用作 <img src> 的字符串（dataURL 或图片 URL）。
 */

import type { ImageGenConfig } from '@/store/imageGenStore'

interface ImageResp {
  data?: { b64_json?: string; url?: string }[]
  error?: { message?: string }
}

export async function generateImage(
  config: ImageGenConfig,
  prompt: string,
  opts: { syncKey?: string } = {}
): Promise<string> {
  const p = prompt.trim()
  if (!p) throw new Error('请输入图片描述')
  return config.viaWorker ? viaWorker(config, p, opts) : direct(config, p)
}

async function direct(config: ImageGenConfig, prompt: string): Promise<string> {
  if (!config.apiKey.trim()) throw new Error('请先在「设置 → 生成图片」填 API Key')
  const base = config.baseUrl.trim().replace(/\/+$/, '') || 'https://api.openai.com/v1'
  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey.trim()}`,
    },
    body: JSON.stringify(buildBody(config, prompt)),
  })
  const data = (await res.json().catch(() => ({}))) as ImageResp
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
  return pick(data)
}

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
      ...(config.apiKey.trim() ? { apiKey: config.apiKey.trim() } : {}),
      ...(config.baseUrl.trim() ? { baseUrl: config.baseUrl.trim() } : {}),
      ...buildBody(config, prompt),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as ImageResp
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
  return pick(data)
}

function buildBody(config: ImageGenConfig, prompt: string) {
  return {
    model: config.model.trim() || 'dall-e-3',
    prompt,
    n: 1,
    ...(config.size.trim() ? { size: config.size.trim() } : {}),
  }
}

function pick(data: ImageResp): string {
  const first = data.data?.[0]
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`
  if (first?.url) return first.url
  throw new Error('返回里没有图片数据')
}
