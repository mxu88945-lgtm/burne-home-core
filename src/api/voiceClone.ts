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

/** 带超时的 fetch：超时/卡住时主动中断，避免无限「克隆中…」 */
async function fetchTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError')
      throw new Error('请求超时——可能是网络慢、被浏览器跨域(CORS)拦截、或海螺在排队处理。可换网络再试，或走 Worker 中转。')
    throw new Error(`连不上海螺：${(e as Error).message}（多半是跨域 CORS，需走 Worker 中转）`)
  } finally {
    clearTimeout(timer)
  }
}

/** 生成一个符合海螺规则的自定义 voice_id：以字母开头、含字母和数字、≥8 位 */
export function genVoiceId(): string {
  return `bw${Date.now()}${Math.floor(Math.random() * 100)}`
}

/** 海螺克隆只认 mp3/m4a/wav——按 MIME / 原名推断出一个合法后缀，给上传文件套上正确文件名 */
function cloneFileName(file: File): string {
  const lower = (file.name || '').toLowerCase()
  if (/\.(mp3|m4a|wav)$/.test(lower)) return file.name
  const t = (file.type || '').toLowerCase()
  let ext = 'm4a' // iOS 录音多为 m4a，作兜底
  if (t.includes('mpeg') || t.includes('mp3')) ext = 'mp3'
  else if (t.includes('wav') || t.includes('wave')) ext = 'wav'
  else if (t.includes('mp4') || t.includes('m4a') || t.includes('aac') || t.includes('x-m4a')) ext = 'm4a'
  return `voice.${ext}`
}

/** 上传录音，返回 file_id（用字符串保精度，int64 不丢位） */
export async function uploadCloneFile(config: TtsConfig, file: File): Promise<string> {
  ensureAuth(config)
  const url = `${baseOf(config)}/v1/files/upload?GroupId=${encodeURIComponent(config.groupId.trim())}`
  const form = new FormData()
  form.append('purpose', 'voice_clone')
  // 第三个参数指定文件名（含合法后缀），否则海螺会报 invalid file ext
  form.append('file', file, cloneFileName(file))
  const res = await fetchTimeout(
    url,
    {
      method: 'POST',
      // 注意：FormData 不要手动设 Content-Type，浏览器会带上 boundary
      headers: { Authorization: `Bearer ${config.apiKey.trim()}` },
      body: form,
    },
    90000,
  )
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
  const res = await fetchTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      // file_id 是 int64，作为数字字面量内联，避免 JSON 数字精度丢失
      body: `{"file_id":${fileId},"voice_id":"${voiceId}"}`,
    },
    120000,
  )
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

/** 经 Worker 中转的一键克隆（上传+克隆都在 Worker 完成，绕过浏览器跨域），返回 voice_id */
export async function cloneFromFileViaWorker(
  config: TtsConfig,
  file: File,
  opts: { syncKey?: string } = {}
): Promise<string> {
  const base = config.workerUrl.trim().replace(/\/+$/, '')
  if (!base) throw new Error('勾了 Worker 中转，但没填 Worker 地址')
  const voiceId = genVoiceId()
  const form = new FormData()
  form.append('file', file, cloneFileName(file))
  form.append('voiceId', voiceId)
  if (config.groupId.trim()) form.append('groupId', config.groupId.trim())
  if (config.apiKey.trim()) form.append('apiKey', config.apiKey.trim())
  if (config.baseUrl.trim()) form.append('baseUrl', config.baseUrl.trim())
  const res = await fetchTimeout(
    `${base}/clone`,
    { method: 'POST', headers: { ...(opts.syncKey ? { 'X-Sync-Key': opts.syncKey } : {}) }, body: form },
    120000
  )
  const text = await res.text()
  if (!res.ok) throw new Error(`克隆失败 ${res.status}：${text.slice(0, 200)}`)
  const m = text.match(/"voice_id"\s*:\s*"([^"]+)"/)
  if (m) return m[1]
  const em = text.match(/"error"\s*:\s*"([^"]+)"/)
  throw new Error(em?.[1] || `没拿到 voice_id：${text.slice(0, 200)}`)
}
