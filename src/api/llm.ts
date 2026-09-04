/**
 * LLM 客户端：根据渠道配置直接在浏览器调用，或经自己的 Worker 中转。
 *   - openai 兼容（含 OpenRouter）：/chat/completions、/models
 *   - anthropic 官方：/v1/messages、/v1/models（带浏览器直连头）
 * key 来自前端 localStorage 的渠道配置，只发往对应服务商 / 你自己的 Worker。
 */

import type { ApiChannel } from '@/store/apiStore'
import { sendChat, fetchModelsViaWorker, type ChatApiMessage } from '@/api/chat'
import { fetchWithinAffordableTokenBudget } from '@/api/tokenBudget'

function trim(u: string): string {
  return u.replace(/\/+$/, '')
}

async function providerError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string
    message?: string
  }
  if (typeof data.error === 'string') return data.error
  return data.error?.message || data.message || `HTTP ${response.status}`
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

/** 拉取模型列表。勾了「经 Worker 中转」就让 Worker 去拉（绕开 https→http 混合内容拦截）。 */
export async function listModels(
  ch: ApiChannel,
  opts?: { workerUrl?: string; syncKey?: string },
): Promise<string[]> {
  if (ch.viaWorker) {
    if (!opts?.workerUrl?.trim()) throw new Error('勾了「经 Worker 中转」但还没配 Worker 地址（设置→账号同步）')
    return fetchModelsViaWorker({
      workerUrl: opts.workerUrl,
      syncKey: opts.syncKey,
      provider: ch.provider,
      baseUrl: ch.baseUrl,
      apiKey: ch.apiKey,
    })
  }
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

const LONG_STORY_SUMMARY_SYS =
  '你是角色扮演剧情档案助手。只输出摘要正文，不要解释。按五节组织：' +
  '【人物与关系】记录主要人物、当前关系、关系阶段、态度变化与不可忘记的人设边界；' +
  '【长期重要线索】用条目保留会影响后续剧情的伏笔、秘密、旧伤、约定、物品、势力冲突、未揭开的误会；' +
  '【已发生的关键剧情】按时间顺序概括已经发生且会影响后续的事件，只保留关键因果；' +
  '【当前情境】记录最新场景、时间地点、在场人物、正在进行的冲突或目标；' +
  '【待解决的悬念/下一步】记录还没解决的问题、可继续推进的剧情钩子。' +
  '硬性要求：保留所有关键事实与设定，不要编造，不要擅自改变既定设定；旧线索仍重要就必须继续保留，不要被新剧情冲掉；' +
  '如果信息很多，宁可写得稍长，也不要丢掉人物关系、关键线索和当前处境。建议 900 到 1400 字。'

function normalizeSummaryRequest(system: string, maxTokens: number) {
  if (
    system.includes('角色扮演剧情记录助手') ||
    system.includes('角色扮演剧情档案助手')
  ) {
    return { system: LONG_STORY_SUMMARY_SYS, maxTokens: Math.max(maxTokens, 2400) }
  }
  return { system, maxTokens }
}

export interface StreamCallbacks {
  /** 思考增量（reasoning / reasoning_content 流） */
  onReasoning?: (delta: string) => void
  /** 正文增量 */
  onContent?: (delta: string) => void
}

/** 是否支持流式：仅 OpenAI 兼容直连（非 Worker、非 anthropic）。其余回退到非流式。 */
export function canStream(ch: ApiChannel): boolean {
  return !ch.viaWorker && ch.provider !== 'anthropic'
}

/**
 * 流式对话（SSE）：边收边回调 onReasoning / onContent，结束返回完整结果。
 * 仅 OpenAI 兼容直连真正流式；anthropic / 经 Worker 回退到非流式（一次性把整段当增量发出）。
 */
export async function chatCompleteStream(
  ch: ApiChannel,
  messages: ChatApiMessage[],
  system: string,
  opts: ChatOptions,
  cb: StreamCallbacks,
): Promise<ChatResult> {
  if (!canStream(ch)) {
    const r = await chatComplete(ch, messages, system, opts)
    if (r.reasoning) cb.onReasoning?.(r.reasoning)
    if (r.text) cb.onContent?.(r.text)
    return r
  }

  const normalized = normalizeSummaryRequest(system, opts.maxTokens ?? 1024)
  const maxTokens = normalized.maxTokens
  system = normalized.system
  const isOpenRouter = /openrouter\.ai/i.test(ch.baseUrl)
  const model =
    opts.webSearch && isOpenRouter && !/:online$/.test(ch.model) ? `${ch.model}:online` : ch.model
  const full = system ? [{ role: 'system' as const, content: system }, ...messages] : messages

  const res = await fetchWithinAffordableTokenBudget(
    maxTokens,
    (effectiveMaxTokens) => fetch(`${trim(ch.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ch.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: full,
        max_tokens: effectiveMaxTokens,
        stream: true,
        ...(isOpenRouter ? { stream_options: { include_usage: true } } : {}),
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
        ...(opts.reasoning ? { reasoning: { effort: 'medium' } } : {}),
        ...(isOpenRouter ? { usage: { include: true } } : {}),
      }),
    }),
    providerError,
  )
  if (!res.body) throw new Error('接口没有返回可读取的回复')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let text = ''
  let reasoning = ''
  let usage: UsageInfo | undefined

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || '' // 末行可能不完整，留到下次
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      let json: {
        choices?: { delta?: { content?: string; reasoning?: string; reasoning_content?: string } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number }
      }
      try {
        json = JSON.parse(payload)
      } catch {
        continue
      }
      const delta = json.choices?.[0]?.delta
      // 思考增量：不同服务商字段名不同（reasoning / reasoning_content）
      const rd = delta?.reasoning ?? delta?.reasoning_content
      if (rd) {
        reasoning += rd
        cb.onReasoning?.(rd)
      }
      if (delta?.content) {
        text += delta.content
        cb.onContent?.(delta.content)
      }
      if (json.usage) {
        const u = json.usage
        usage = {
          promptTokens: u.prompt_tokens ?? 0,
          completionTokens: u.completion_tokens ?? 0,
          totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
          cost: typeof u.cost === 'number' ? u.cost : undefined,
          model: ch.model,
        }
      }
    }
  }

  return { text, usage, reasoning: reasoning.trim() || undefined }
}

/** 发起一次对话，返回回复文本与用量 */
export async function chatComplete(
  ch: ApiChannel,
  messages: ChatApiMessage[],
  system: string,
  opts: ChatOptions = {}
): Promise<ChatResult> {
  const normalized = normalizeSummaryRequest(system, opts.maxTokens ?? 1024)
  const maxTokens = normalized.maxTokens
  system = normalized.system
  // 经 Worker 中转：把渠道配置交给自己的 Worker 调用
  if (ch.viaWorker) {
    // 旧 Worker 只会处理纯文字。当前模型本身支持读图时，多模态消息直接交给
    // 同一个渠道/模型，保留真实图片内容；不要降级成“发送了一张图片”的文字。
    if (messages.some((message) => Array.isArray(message.content))) {
      try {
        return await chatComplete(
          { ...ch, viaWorker: false },
          messages,
          system,
          { ...opts, maxTokens },
        )
      } catch (error) {
        throw new Error(`图片直连当前模型失败：${(error as Error).message}`)
      }
    }
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
    const res = await fetchWithinAffordableTokenBudget(
      maxTokens,
      (effectiveMaxTokens) => fetch(`${trim(ch.baseUrl)}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': ch.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: ch.model,
          max_tokens: effectiveMaxTokens,
          // 开思考时 anthropic 要求不传 temperature
          ...(opts.reasoning ? {} : opts.temperature != null ? { temperature: opts.temperature } : {}),
          ...(opts.reasoning
            ? { thinking: { type: 'enabled', budget_tokens: Math.max(1024, Math.floor(effectiveMaxTokens / 2)) } }
            : {}),
          system,
          messages: toAnthropic(messages),
        }),
      }),
      providerError,
    )
    const data = (await res.json().catch(() => ({}))) as {
      content?: { type?: string; text?: string; thinking?: string }[]
      usage?: { input_tokens?: number; output_tokens?: number }
      error?: { message?: string }
    }
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
  const res = await fetchWithinAffordableTokenBudget(
    maxTokens,
    (effectiveMaxTokens) => fetch(`${trim(ch.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ch.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: full,
        max_tokens: effectiveMaxTokens,
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
        // 思考过程（OpenRouter 等支持）
        ...(opts.reasoning ? { reasoning: { effort: 'medium' } } : {}),
        // OpenRouter：让响应带上真实花费
        ...(isOpenRouter ? { usage: { include: true } } : {}),
      }),
    }),
    providerError,
  )
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
