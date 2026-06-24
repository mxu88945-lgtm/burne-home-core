/**
 * MiniMax 海螺 · 声音克隆（在 App 里一键克隆，免去官网写代码）。
 *
 * 两步：① 上传录音拿 file_id；② voice_clone 用 file_id + 自定义 voice_id 完成克隆。
 * 完成后把 voice_id 填回 TTS 配置即可用来朗读。
 *
 * 安全：apiKey / groupId 只来自本地配置，绝不写死。
 * ⚠️ 浏览器直连若被 MiniMax 的 CORS 拦截会失败（和朗读直连同理）。
 */

import type { TtsConfig } from '@/store/ttsStore'

function baseOf(config: TtsConfig): string {
  return config.baseUrl.trim().replace(/\/+$/, '') || 'https://api.minimax.chat'
}
function ensureAuth(config: TtsConfig) {
  if (!config.apiKey.trim() || !config.groupId.trim())
    throw new Error('请先填好 API Key 和 GroupId')
}

/** 生成一个符合海螺规则的自定义 voice_id：以字母开头、含字母和数字、≥8 位 */
export function genVoiceId(): string {
  return `bw${Date.now()}${Math.floor(Math.random() * 100)}`
}

/** 上传录音，返回 file_id（用字符串保精度，int64 不丢位） */
export async function uploadCloneFile(config: TtsConfig, file: File): Promise<string> {
  ensureAuth(config)
  const url = `${baseOf(config)}/v1/files/upload?GroupId=${encodeURIComponent(config.groupId.trim())}`
  const form = new FormData()
  form.append('purpose', 'voice_clone')
  form.append('file', file)
  const res = await fetch(url, {
    method: 'POST',
    // 注意：FormData 不要手动设 Content-Type，浏览器会带上 boundary
    headers: { Authorization: `Bearer ${config.apiKey.trim()}` },
    body: form,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`上传失败 ${res.status}：${text.slice(0, 200)}`)
  const errMatch = text.match(/"status_msg"\s*:\s*"([^"]+)"/)
  const codeMatch = text.match(/"status_code"\s*:\s*(\d+)/)
  if (codeMatch && codeMatch[1] !== '0') throw new Error(errMatch?.[1] || '上传失败')
  const idMatch = text.match(/"file_id"\s*:\s*"?(\d+)"?/)
  if (!idMatch) throw new Error(`没拿到 file_id：${text.slice(0, 200)}`)
  return idMatch[1]
}

/** 用 file_id + 自定义 voice_id 完成克隆 */
export async function cloneVoice(config: TtsConfig, fileId: string, voiceId: string): Promise<void> {
  ensureAuth(config)
  const url = `${baseOf(config)}/v1/voice_clone?GroupId=${encodeURIComponent(config.groupId.trim())}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey.trim()}`,
    },
    // file_id 是 int64，作为数字字面量内联，避免 JSON 数字精度丢失
    body: `{"file_id":${fileId},"voice_id":"${voiceId}"}`,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`克隆失败 ${res.status}：${text.slice(0, 200)}`)
  const codeMatch = text.match(/"status_code"\s*:\s*(\d+)/)
  const msgMatch = text.match(/"status_msg"\s*:\s*"([^"]+)"/)
  if (codeMatch && codeMatch[1] !== '0') throw new Error(msgMatch?.[1] || '克隆失败')
}

/** 一键：上传录音 → 克隆 → 返回新音色 voice_id */
export async function cloneFromFile(config: TtsConfig, file: File): Promise<string> {
  const fileId = await uploadCloneFile(config, file)
  const voiceId = genVoiceId()
  await cloneVoice(config, fileId, voiceId)
  return voiceId
}
