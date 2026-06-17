/**
 * LLM 客户端：根据渠道配置直接在浏览器调用，或经自己的 Worker 中转。
 *   - openai 兼容（含 OpenRouter）：/chat/completions、/models
 *   - anthropic 官方：/v1/messages、/v1/models（带浏览器直连头）
 * key 来自前端 localStorage 的渠道配置，只发往对应服务商 / 你自己的 Worker。
 */

import type { ApiChannel } from '@/store/apiStore'
import { sendChat, type ChatApiMessage } from '@/api/chat'

function trim(u: string): string {
  return u.replace(/\/+$/, '')
}

/** 拉取模型列表 */
export async function listModels(ch: ApiChannel): Promise<string[]> {
  if (ch.provider === 'anthropic') {
    const res = await fetch(`${trim(ch.baseUrl)}/v1/models`, {
      headers: {
        'x-api-key': ch.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { data?: { id: string }[] }
    return (data.data || []).map((m) => m.id)
  }
  // openai 兼容
  const res = await fetch(`${trim(ch.baseUrl)}/models`, {
    headers: { authorization: `Bearer ${ch.apiKey}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { data?: { id: string }[] }
  return (data.data || []).map((m) => m.id).filter(Boolean)
}

export interface ChatOptions {
  workerUrl?: string
  syncKey?: string
  temperature?: number
  maxTokens?: number
}

/** 发起一次对话，返回回复文本 */
export async function chatComplete(
  ch: ApiChannel,
  messages: ChatApiMessage[],
  system: string,
  opts: ChatOptions = {}
): Promise<string> {
  const maxTokens = opts.maxTokens ?? 1024
  // 经 Worker 中转：把渠道配置交给自己的 Worker 调用
  if (ch.viaWorker) {
    if (!opts.workerUrl)
      throw new Error('勾选了「经 Worker 中转」但未配置 Worker 地址')
    return sendChat({
      workerUrl: opts.workerUrl,
      syncKey: opts.syncKey,
      messages,
      system,
      provider: ch.provider,
      model: ch.model,
      baseUrl: ch.baseUrl,
      apiKey: ch.apiKey,
      temperature: opts.temperature,
      maxTokens,
    })
  }

  // 浏览器直连
  if (ch.provider === 'anthropic') {
    const res = await fetch(`${trim(ch.baseUrl)}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ch.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: ch.model,
        max_tokens: maxTokens,
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
        system,
        messages,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      content?: { text?: string }[]
      error?: { message?: string }
    }
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
    return Array.isArray(data.content)
      ? data.content.map((c) => c.text || '').join('')
      : ''
  }

  // openai 兼容
  const full = system
    ? [{ role: 'system' as const, content: system }, ...messages]
    : messages
  const res = await fetch(`${trim(ch.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${ch.apiKey}`,
    },
    body: JSON.stringify({
      model: ch.model,
      messages: full,
      max_tokens: maxTokens,
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[]
    error?: { message?: string }
  }
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
  return data.choices?.[0]?.message?.content || ''
}
