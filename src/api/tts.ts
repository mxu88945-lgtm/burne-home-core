/**
 * TTS 客户端 —— MiniMax 海螺 T2A v2 文本转语音。
 *
 * 两条路径：
 *   1) 浏览器直连 MiniMax（接口须支持 CORS，否则会被浏览器拦）。
 *   2) 经自己的 Worker 中转（解决跨域；端点见 worker/src/index.ts 的 /tts）。
 *
 * 返回可直接播放的音频 Blob（audio/mpeg）。
 * 安全：apiKey / groupId 仅来自本地配置，绝不写死在代码。
 */

import type { TtsConfig } from '@/store/ttsStore'

interface MiniMaxResp {
  data?: { audio?: string; status?: number }
  base_resp?: { status_code?: number; status_msg?: string }
}

/** 文本转语音，返回音频 Blob */
export async function synthesize(
  config: TtsConfig,
  text: string,
  opts: { syncKey?: string } = {}
): Promise<Blob> {
  const t = text.trim()
  if (!t) throw new Error('没有可朗读的文字')
  return config.viaWorker ? viaWorker(config, t, opts) : direct(config, t)
}

async function direct(config: TtsConfig, text: string): Promise<Blob> {
  if (!config.apiKey.trim() || !config.groupId.trim())
    throw new Error('请先在「设置 → 语音朗读」填 API Key 和 GroupId')
  const base = config.baseUrl.trim().replace(/\/+$/, '') || 'https://api.minimax.chat'
  const url = `${base}/v1/t2a_v2?GroupId=${encodeURIComponent(config.groupId.trim())}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey.trim()}`,
    },
    body: JSON.stringify(buildPayload(config, text)),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
  return parseMiniMax((await res.json()) as MiniMaxResp)
}

async function viaWorker(
  config: TtsConfig,
  text: string,
  opts: { syncKey?: string }
): Promise<Blob> {
  const base = config.workerUrl.trim().replace(/\/+$/, '')
  if (!base) throw new Error('勾了 Worker 中转，但没填 Worker 地址')
  const res = await fetch(`${base}/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.syncKey ? { 'X-Sync-Key': opts.syncKey } : {}),
    },
    body: JSON.stringify({
      // Worker 若自带 MINIMAX_* secret 可忽略以下覆盖项；带上则前端配置优先
      ...(config.groupId.trim() ? { groupId: config.groupId.trim() } : {}),
      ...(config.apiKey.trim() ? { apiKey: config.apiKey.trim() } : {}),
      ...(config.baseUrl.trim() ? { baseUrl: config.baseUrl.trim() } : {}),
      ...buildPayload(config, text),
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
  const ct = res.headers.get('Content-Type') || ''
  if (ct.includes('application/json')) {
    return parseMiniMax((await res.json()) as MiniMaxResp)
  }
  return res.blob()
}

function buildPayload(config: TtsConfig, text: string) {
  return {
    model: config.model.trim() || 'speech-01-turbo',
    text,
    stream: false,
    voice_setting: {
      voice_id: config.voiceId.trim() || 'female-tianmei',
      speed: config.speed || 1,
      vol: 1,
      pitch: 0,
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: 'mp3',
      channel: 1,
    },
  }
}

function parseMiniMax(data: MiniMaxResp): Blob {
  const code = data.base_resp?.status_code
  if (code && code !== 0)
    throw new Error(data.base_resp?.status_msg || `MiniMax 错误 ${code}`)
  const hex = data.data?.audio
  if (!hex) throw new Error('返回里没有音频数据（检查 Key / GroupId / 音色）')
  return new Blob([hexToBytes(hex) as BlobPart], { type: 'audio/mpeg' })
}

/** hex 字符串 → 字节数组 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/\s+/g, '')
  const len = clean.length >> 1
  const out = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16)
  }
  return out
}
