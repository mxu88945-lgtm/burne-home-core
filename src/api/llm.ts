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

/** 把（OpenAI 兼容的）消息内容转成 Anthropic Messages API 的格式（含图片 block） */
function toAnthropic(messages: ChatApiMessage[]) {
  return messages.map((m) => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content }
    const blocks = m.content.map((part) => {
      if (part.type === 'text') return { type: 'text', text: part.text }
      // data:image/jpeg;base64,xxxx → Anthropic base64 image block
      const url = part.image_url.url
      const match = /^data:(.+?);base64,(.*)$/.exec(url)
      const mediaType = match?.[1] || 'image/jpeg'
      const data = match?.[2] || ''
      return { type: 'image', source: { type: 'base64', media_type: mediaType, data } }
    })
    return { role: m.role, content: blocks }
  })
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

/** 拉取「支持图片输入」的模型（OpenAI 兼容 /models，按 input_modalities 筛） */
export async function listVisionModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const res = await fetch(`${trim(baseUrl)}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as {
    data?: { id: string; architecture?: { input_modalities?: string[] } }[]
  }
  const all = data.data || []
  const vis = all.filter((m) => m.architecture?.input_modalities?.includes('image')).map((m) => m.id)
  return vis.length ? vis : all.map((m) => m.id).filter(Boolean)
}

export interface ChatOptions {
  workerUrl?: string
  syncKey?: string
  temperature?: number
  maxTokens?: number
  /** 让模型输出思考过程（reasoning / thinking） */
  reasoning?: boolean
  /** 联网查询（OpenRouter：model:online） */
  webSearch?: boolean
}

export interface UsageInfo {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost?: number
  model: string
}

export interface ChatResult {
  text: string
  usage?: UsageInfo
  /** 思考过程（开启 reasoning 时） */
  reasoning?: string
}

/** 发起一次对话，返回回复文本与用量 */
export async function chatComplete(
  ch: ApiChannel,
  messages: ChatApiMessage[],
  system: string,
  opts: ChatOptions = {}
): Promise<ChatResult> {
  const maxTokens = opts.maxTokens ?? 1024
  // 经 Worker 中转：把渠道配置交给自己的 Worker 调用
  if (ch.viaWorker) {
    if (!opts.workerUrl)
      throw new Error('勾选了「经 Worker 中转」但未配置 Worker 地址')
    const text = await sendChat({
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
    return { text }
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
        // 开思考时 anthropic 要求不传 temperature
        ...(opts.reasoning ? {} : opts.temperature != null ? { temperature: opts.temperature } : {}),
        ...(opts.reasoning
          ? { thinking: { type: 'enabled', budget_tokens: Math.max(1024, Math.floor(maxTokens / 2)) } }
          : {}),
        system,
        messages: toAnthropic(messages),
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      content?: { type?: string; text?: string; thinking?: string }[]
      usage?: { input_tokens?: number; output_tokens?: number }
      error?: { message?: string }
    }
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
    const text = Array.isArray(data.content)
      ? data.content.map((c) => c.text || '').join('')
      : ''
    const reasoning = Array.isArray(data.content)
      ? data.content
          .map((c) => (c.type === 'thinking' ? c.thinking || '' : ''))
          .join('')
          .trim() || undefined
      : undefined
    const u = data.usage
    const usage: UsageInfo | undefined = u
      ? {
          promptTokens: u.input_tokens ?? 0,
          completionTokens: u.output_tokens ?? 0,
          totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
          model: ch.model,
        }
      : undefined
    return { text, usage, reasoning }
  }

  // openai 兼容
  const isOpenRouter = /openrouter\.ai/i.test(ch.baseUrl)
  // 联网：OpenRouter 用 model:online（已带 :online 的不重复加）
  const model =
    opts.webSearch && isOpenRouter && !/:online$/.test(ch.model) ? `${ch.model}:online` : ch.model
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
      model,
      messages: full,
      max_tokens: maxTokens,
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      // 思考过程（OpenRouter 等支持）
      ...(opts.reasoning ? { reasoning: { effort: 'medium' } } : {}),
      // OpenRouter：让响应带上真实花费
      ...(isOpenRouter ? { usage: { include: true } } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string; reasoning?: string } }[]
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
      cost?: number
    }
    error?: { message?: string }
  }
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
  const u = data.usage
  const usage: UsageInfo | undefined = u
    ? {
        promptTokens: u.prompt_tokens ?? 0,
        completionTokens: u.completion_tokens ?? 0,
        totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
        cost: typeof u.cost === 'number' ? u.cost : undefined,
        model: ch.model,
      }
    : undefined
  return {
    text: data.choices?.[0]?.message?.content || '',
    usage,
    reasoning: data.choices?.[0]?.message?.reasoning?.trim() || undefined,
  }
}
