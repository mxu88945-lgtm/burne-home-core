/**
 * 卡片图片中转：Tavern 角色卡的图基本挂在 catbox 等海外图床，国内网络连不上（蓝问号）。
 * 配了 Worker 的话，把这些图床地址改走 `${workerUrl}/img?u=…` 让 Worker 代取（端点见 worker/src/index.ts）。
 * 没配 Worker 就原样返回（有代理的网络能直连）。
 */

const HOSTS = ['files.catbox.moe', 'catbox.moe', 'i.imgur.com', 'files.charhub.io', 'avatars.charhub.io']
const HOST_RE = new RegExp(
  `https://(?:${HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|')})/[^\\s"'()<>]+`,
  'g',
)

export function proxyCardImages(html: string, workerUrl?: string): string {
  const base = (workerUrl || '').trim().replace(/\/+$/, '')
  if (!base || !html.includes('https://')) return html
  return html.replace(HOST_RE, (m) => `${base}/img?u=${encodeURIComponent(m)}`)
}
