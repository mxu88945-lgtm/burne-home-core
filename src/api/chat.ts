/**
 * 聊天客户端 —— 调用后端 Worker 的 /chat 中转（AI key 在 Worker，不在前端）。
 */

/** 消息内容：纯文本，或多模态分段（文字 + 图片，OpenAI 兼容 vision 格式） */
export type ChatContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >

export interface ChatApiMessage {
  role: 'user' | 'assistant'
  content: ChatContent
}

export async function sendChat(opts: {
  workerUrl: string
  syncKey?: string
  messages: ChatApiMessage[]
  system?: string
  /** 渠道：留空用 Worker 默认；'anthropic' | 'openai' */
  provider?: string
  /** 模型覆盖（留空用 Worker 默认） */
  model?: string
  /** base URL 覆盖（前端管理渠道时透传） */
  baseUrl?: string
  /** key 覆盖（前端管理渠道时透传；仅发往你自己的 Worker） */
  apiKey?: string
  temperature?: number
  maxTokens?: number
}): Promise<string> {
  const base = opts.workerUrl.replace(/\/+$/, '')
  const res = await fetch(`${base}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.syncKey ? { 'X-Sync-Key': opts.syncKey } : {}),
    },
    body: JSON.stringify({
      messages: opts.messages,
      system: opts.system,
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
      ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens != null ? { maxTokens: opts.maxTokens } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    reply?: string
    error?: string
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data.reply ?? ''
}
