/**
 * 语音转文字(STT) 客户端 —— OpenAI 兼容 /audio/transcriptions（whisper 等）。
 * 两条路径：直连，或经自己的 Worker 中转（/stt，绕过浏览器跨域）。
 * 安全：apiKey 仅来自本地配置，绝不写死在代码。
 */

import type { SttConfig } from '@/store/sttStore'

/** 把录音 Blob 转成文字 */
export async function transcribe(
  config: SttConfig,
  audio: Blob,
  opts: { syncKey?: string } = {}
): Promise<string> {
  const file = new File([audio], `audio.${extOf(audio)}`, { type: audio.type || 'audio/webm' })
  return config.viaWorker ? viaWorker(config, file, opts) : direct(config, file)
}

function extOf(blob: Blob): string {
  const t = (blob.type || '').toLowerCase()
  if (t.includes('webm')) return 'webm'
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'm4a'
  if (t.includes('ogg')) return 'ogg'
  if (t.includes('wav')) return 'wav'
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3'
  return 'webm'
}

async function direct(config: SttConfig, file: File): Promise<string> {
  if (!config.apiKey.trim()) throw new Error('请先在「设置 → 语音输入」填 API Key')
  const base = config.baseUrl.trim().replace(/\/+$/, '') || 'https://api.openai.com/v1'
  const form = new FormData()
  form.append('file', file)
  form.append('model', config.model.trim() || 'whisper-1')
  if (config.language.trim()) form.append('language', config.language.trim())
  const res = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey.trim()}` },
    body: form,
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${t.slice(0, 200)}`)
  return parseText(t)
}

async function viaWorker(
  config: SttConfig,
  file: File,
  opts: { syncKey?: string }
): Promise<string> {
  const base = config.workerUrl.trim().replace(/\/+$/, '')
  if (!base) throw new Error('勾了 Worker 中转，但没填 Worker 地址')
  const form = new FormData()
  form.append('file', file)
  form.append('model', config.model.trim() || 'whisper-1')
  if (config.language.trim()) form.append('language', config.language.trim())
  if (config.baseUrl.trim()) form.append('baseUrl', config.baseUrl.trim())
  if (config.apiKey.trim()) form.append('apiKey', config.apiKey.trim())
  const res = await fetch(`${base}/stt`, {
    method: 'POST',
    headers: { ...(opts.syncKey ? { 'X-Sync-Key': opts.syncKey } : {}) },
    body: form,
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${t.slice(0, 200)}`)
  return parseText(t)
}

function parseText(raw: string): string {
  try {
    return ((JSON.parse(raw) as { text?: string }).text || '').trim()
  } catch {
    return raw.trim()
  }
}
