/**
 * 卡片图片中转：Tavern 角色卡的图基本挂在 catbox 等海外图床，国内网络连不上（蓝问号）。
 *
 * 历史：曾让自己的 Cloudflare Worker `/img` 代取，但 **catbox 会对 Cloudflare Worker 的请求回 520**
 * （catbox 挡机器人/数据中心流量），这条路走不通。改走成熟的图片 CDN images.weserv.nl——
 * 它专门做远程图片中转+缓存，catbox 对它很友好，且惟惟的网络能直连（已实测出图）。
 * 好处：不再依赖用户自己的 Worker，人人可用。
 */

const HOSTS = [
  'files.catbox.moe',
  'catbox.moe',
  'i.imgur.com',
  'files.charhub.io',
  'avatars.charhub.io',
  'iili.io', // imgloc.com / freeimage.host 的图片 CDN
  'i.imgs.ovh',
  'imgloc.com',
]
const HOST_RE = new RegExp(
  `https://(?:${HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|')})/[^\\s"'()<>]+`,
  'g',
)

/**
 * 把海外图床地址改写成走 images.weserv.nl 中转。
 * 第二个参数（旧的 workerUrl）已弃用、保留只为兼容调用签名。
 */
export function proxyCardImages(html: string, _legacyWorkerUrl?: string): string {
  if (!html.includes('https://')) return html
  // weserv 的 url 参数用「去掉 https:// 的 主机名+路径」即可（catbox/imgur/charhub 路径都是简单字符，无需再编码）
  return html.replace(HOST_RE, (m) => `https://images.weserv.nl/?url=${m.replace(/^https:\/\//, '')}`)
}
