/**
 * 聊天客户端 —— 调用后端 Worker 的 /chat 中转（AI key 在 Worker，不在前端）。
 */

export interface ChatApiMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function sendChat(opts: {
  workerUrl: string
  syncKey?: string
  messages: ChatApiMessage[]
  system?: string
}): Promise<string> {
  const base = opts.workerUrl.replace(/\/+$/, '')
  const res = await fetch(`${base}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.syncKey ? { 'X-Sync-Key': opts.syncKey } : {}),
    },
    body: JSON.stringify({ messages: opts.messages, system: opts.system }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    reply?: string
    error?: string
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data.reply ?? ''
}
