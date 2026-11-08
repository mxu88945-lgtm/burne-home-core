/**
 * 向量嵌入请求（OpenAI 兼容 POST {base}/embeddings，请求体 {model, input:[...]}）。
 * 路线和拉模型列表一致：渠道勾了「经 Worker 中转」就先走自己的 Worker（/embeddings），
 * 老 Worker 没有这个端点（404/405）时退回浏览器直连；没勾就直连。
 * key 复用渠道里那把，只发往服务商或你自己的 Worker。
 */
import type { ApiChannel } from '@/store/apiStore'

export interface EmbedRouteOptions {
  workerUrl?: string
  syncKey?: string
  signal?: AbortSignal
}

function trim(u: string): string {
  return u.replace(/\/+$/, '')
}

async function errorText(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } | string; message?: string }
  if (typeof data.error === 'string') return data.error
  return data.error?.message || data.message || `HTTP ${res.status}`
}

function parse(data: unknown, count: number): number[][] {
  const rows = (data as { data?: Array<{ embedding?: number[]; index?: number }> })?.data
  if (!Array.isArray(rows) || rows.length !== count) throw new Error('向量接口返回的条数不对')
  const sorted = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  return sorted.map((r) => {
    if (!Array.isArray(r.embedding) || !r.embedding.length) throw new Error('向量接口没有返回 embedding')
    return r.embedding
  })
}

async function direct(ch: ApiChannel, model: string, input: string[], signal?: AbortSignal): Promise<number[][]> {
  const res = await fetch(`${trim(ch.baseUrl)}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${ch.apiKey}` },
    body: JSON.stringify({ model, input }),
    signal,
  })
  if (!res.ok) throw new Error(await errorText(res))
  return parse(await res.json(), input.length)
}

export async function embedTexts(
  ch: ApiChannel,
  model: string,
  input: string[],
  opts: EmbedRouteOptions = {},
): Promise<number[][]> {
  if (!input.length) return []
  if (ch.provider === 'anthropic') throw new Error('Anthropic 渠道没有向量接口，换一个 OpenAI 兼容渠道（如硅基流动）')
  if (!ch.baseUrl.trim() || !ch.apiKey.trim()) throw new Error('这个渠道还没填接口地址或 Key')
  if (ch.viaWorker && opts.workerUrl?.trim()) {
    const res = await fetch(`${trim(opts.workerUrl)}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.syncKey ? { 'X-Sync-Key': opts.syncKey } : {}),
      },
      body: JSON.stringify({ provider: ch.provider, baseUrl: ch.baseUrl, apiKey: ch.apiKey, model, input }),
      signal: opts.signal,
    })
    if (res.ok) return parse(await res.json(), input.length)
    // 已部署的老 Worker 没有 /embeddings：退回直连
    if (res.status !== 404 && res.status !== 405) throw new Error(await errorText(res))
  }
  return direct(ch, model, input, opts.signal)
}
