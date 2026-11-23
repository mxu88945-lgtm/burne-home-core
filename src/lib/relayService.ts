import { existingPushDevice, currentPushUrl } from '@/lib/pushService'
import { pushIsReady } from '@/store/pushStore'
import type { ApiChannel } from '@/store/apiStore'
import type { ChatApiMessage } from '@/api/chat'

export const RELAY_STORAGE_KEY = 'burne-local.relay'
const DEFAULT_RELAY_URL = ''

type RelayConfig = { enabled: boolean; url: string; key: string }
export type RelayPending = { id: string; sessionId: string; createdAt: number }
export type RelayResult = { status: 'running' | 'done' | 'error'; text?: string; error?: string; toolCalls?: unknown[] }

function read<T>(fallback: T): T {
  try { return JSON.parse(localStorage.getItem(RELAY_STORAGE_KEY) || '') as T } catch { return fallback }
}
function write(value: unknown) {
  try { localStorage.setItem(RELAY_STORAGE_KEY, JSON.stringify(value)) } catch { /* quota/private mode */ }
}
export function getRelayConfig(): RelayConfig {
  const value = read<Partial<RelayConfig>>({})
  return { enabled: value.enabled === true, url: value.url?.trim() || DEFAULT_RELAY_URL, key: value.key || '' }
}
export function saveRelayConfig(patch: Partial<RelayConfig>): RelayConfig {
  const next = { ...getRelayConfig(), ...patch }
  write(next)
  return next
}
export function getRelayPending(): RelayPending[] {
  const value = read<{ pending?: RelayPending[] }>({})
  return Array.isArray(value.pending) ? value.pending : []
}
function savePending(pending: RelayPending[]) {
  write({ ...getRelayConfig(), pending })
}
function addPending(item: RelayPending) {
  savePending([...getRelayPending().filter((p) => p.id !== item.id), item])
}
function removePending(id: string) {
  savePending(getRelayPending().filter((p) => p.id !== id))
}
function auth(key: string) { return { Authorization: `Bearer ${key}` } }
function baseUrl(url: string) { return url.trim().replace(/\/+$/, '') }

export function canUseRelay(channel: ApiChannel | undefined): boolean {
  const config = getRelayConfig()
  return !!(config.enabled && config.url && config.key && channel?.baseUrl && channel.apiKey)
}

function makeBody(channel: ApiChannel, messages: ChatApiMessage[], system: string, opts: { temperature?: number; maxTokens?: number; reasoning?: boolean; reasoningEffort?: string; webSearch?: boolean }) {
  const openRouter = /openrouter\.ai/i.test(channel.baseUrl)
  const model = opts.webSearch && openRouter && !/:online$/.test(channel.model) ? `${channel.model}:online` : channel.model
  const full = system ? [{ role: 'system', content: system }, ...messages] : messages
  return {
    model,
    messages: full,
    ...(opts.maxTokens && opts.maxTokens > 0 ? { max_tokens: opts.maxTokens } : {}),
    stream: true,
    ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    ...(opts.reasoning ? { reasoning: opts.reasoningEffort && opts.reasoningEffort !== 'auto' ? { effort: opts.reasoningEffort } : { enabled: true } } : {}),
    ...(openRouter ? { usage: { include: true } } : {}),
  }
}

export async function startRelay(args: {
  id: string; sessionId: string; channel: ApiChannel; messages: ChatApiMessage[]; system: string
  temperature?: number; maxTokens?: number; reasoning?: boolean; reasoningEffort?: string; webSearch?: boolean
}): Promise<string> {
  const config = getRelayConfig()
  if (!canUseRelay(args.channel)) throw new Error('锁屏中继未配置')
  const payload: Record<string, unknown> = {
    id: args.id,
    base: `${baseUrl(args.channel.baseUrl)}${args.channel.provider === 'anthropic' ? '/v1/messages' : '/chat/completions'}`,
    key: args.channel.apiKey,
    body: makeBody(args.channel, args.messages, args.system, args),
    title: '伯恩',
  }
  if (pushIsReady() && existingPushDevice()) {
    payload.pushDevice = existingPushDevice()
    payload.pushUrl = currentPushUrl()
  }
  addPending({ id: args.id, sessionId: args.sessionId, createdAt: Date.now() })
  try {
    const response = await fetch(`${baseUrl(config.url)}/start`, { method: 'POST', headers: { ...auth(config.key), 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    if (!response.ok) throw new Error(`中继 HTTP ${response.status}`)
    const text = await response.text()
    removePending(args.id)
    return text
  } catch (error) {
    // 手机进入后台后 fetch 可能在这里断开；服务端仍会继续，保留 pending 供回前台恢复。
    throw error
  }
}

export async function getRelayResult(id: string): Promise<RelayResult> {
  const config = getRelayConfig()
  if (!config.url || !config.key) throw new Error('锁屏中继未配置')
  const response = await fetch(`${baseUrl(config.url)}/result/${encodeURIComponent(id)}`, { headers: auth(config.key) })
  const data = (await response.json().catch(() => ({}))) as RelayResult
  if (!response.ok) throw new Error(data.error || `中继 HTTP ${response.status}`)
  return data
}

export async function recoverPendingRelay(): Promise<Array<RelayPending & { result: RelayResult }>> {
  const recovered: Array<RelayPending & { result: RelayResult }> = []
  for (const pending of getRelayPending()) {
    try {
      const result = await getRelayResult(pending.id)
      if (result.status === 'done' || result.status === 'error') {
        removePending(pending.id)
        recovered.push({ ...pending, result })
      }
    } catch {
      // 下次前台继续查
    }
  }
  return recovered
}

export function clearRelayPending(id: string) { removePending(id) }
