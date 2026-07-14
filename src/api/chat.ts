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

const LONG_STORY_SUMMARY_SYS =
  '你是角色扮演剧情档案助手。只输出摘要正文，不要解释。按五节组织：' +
  '【人物与关系】记录主要人物、当前关系、关系阶段、态度变化与不可忘记的人设边界；' +
  '【长期重要线索】用条目保留会影响后续剧情的伏笔、秘密、旧伤、约定、物品、势力冲突、未揭开的误会；' +
  '【已发生的关键剧情】按时间顺序概括已经发生且会影响后续的事件，只保留关键因果；' +
  '【当前情境】记录最新场景、时间地点、在场人物、正在进行的冲突或目标；' +
  '【待解决的悬念/下一步】记录还没解决的问题、可继续推进的剧情钩子。' +
  '硬性要求：保留所有关键事实与设定，不要编造，不要擅自改变既定设定；旧线索仍重要就必须继续保留，不要被新剧情冲掉；' +
  '如果信息很多，宁可写得稍长，也不要丢掉人物关系、关键线索和当前处境。建议 900 到 1400 字。'

function normalizeSummaryRequest(system: string | undefined, maxTokens: number | undefined) {
  const tokenBudget = maxTokens ?? 1024
  if (
    system?.includes('角色扮演剧情记录助手') ||
    system?.includes('角色扮演剧情档案助手')
  ) {
    return { system: LONG_STORY_SUMMARY_SYS, maxTokens: Math.max(tokenBudget, 2400) }
  }
  return { system, maxTokens: tokenBudget }
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
  const normalized = normalizeSummaryRequest(opts.system, opts.maxTokens)
  // 已部署的旧 Worker 只接受字符串 content；读图会由前端配置的视觉渠道直连。
  // 没配视觉渠道时至少把图片降级成文字占位，避免 `.trim is not a function`
  // 让图片之后的每一轮消息都永久失败。
  const messages = opts.messages.map((message) => {
    if (typeof message.content === 'string') return message
    const text = message.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim()
    return { ...message, content: `${text}${text ? '\n' : ''}［发送了一张图片］` }
  })
  const res = await fetch(`${base}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.syncKey ? { 'X-Sync-Key': opts.syncKey } : {}),
    },
    body: JSON.stringify({
      messages,
      system: normalized.system,
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
      ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      ...(normalized.maxTokens != null ? { maxTokens: normalized.maxTokens } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    reply?: string
    error?: string
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data.reply ?? ''
}

/** 经 Worker 中转拉取模型列表（解决 https 页面直连 http 上游被混合内容拦截） */
export async function fetchModelsViaWorker(opts: {
  workerUrl: string
  syncKey?: string
  provider?: string
  baseUrl?: string
  apiKey?: string
}): Promise<string[]> {
  const base = opts.workerUrl.replace(/\/+$/, '')
  const res = await fetch(`${base}/models`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.syncKey ? { 'X-Sync-Key': opts.syncKey } : {}),
    },
    body: JSON.stringify({
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
      ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { models?: string[]; error?: string }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data.models ?? []
}
